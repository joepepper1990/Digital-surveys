# Architecture — 1.0.0.9

**Status:** target architecture, not yet implemented in an application package.
The 1.0.0.8 baseline was not supplied to this build, so nothing here has been
applied to a `.msapp`. See `BASELINE_REPORT.md`.

---

## 1. What was wrong with 1.0.0.8

The directive records ~621 top-level controls on one physical screen, with
pseudo-navigation driven by a `varView` variable. That single decision produces
most of the reported symptoms:

| Symptom | Cause |
|---|---|
| Z-order defects, taps landing on invisible controls | every overlay shares one stacking context |
| Hidden controls evaluating stale formulas | a control is only *visually* hidden; its property formulas still evaluate |
| Cross-record defects (4.1–4.3) | with hundreds of sibling controls, each one addresses instrument records by literal key, so nothing structurally prevents control *X* reading record *Y* |
| Slow, hard to maintain | one file, no boundaries, no reuse |

The fix is not to rename the formulas. It is to remove the conditions that made
them possible.

---

## 2. Screen architecture

One physical screen per workflow step. Screens are cheap; `varView` state is not.

```
App
├── App.Formulas ......... design tokens, config collections, derived state
├── App.OnStart .......... load configuration, restore in-progress survey
│
├── scrHome .............. due/resume dashboard (§12)
├── scrRwp ............... RWP selection and MUST KNOW confirmation (§13)
├── scrInstrumentIssue ... capability cards, the principal 1.0.0.9 feature (§14)
├── scrInstrumentDetail .. one capability: components, checks, background
├── scrSurveyMap ......... map overlay, configuration-driven hit areas (§26)
├── scrAreaReferences .... the same points as a large-row gallery (§27)
├── scrPoint ............. measurement entry for one point (§28)
├── scrActions ........... outstanding alerts and deferred actions (§31)
├── scrProgress .......... due-point accounting (§34)
├── scrHandover .......... segment close and handover summary (§35)
├── scrTechnicianComplete  readiness dashboard (§36)
└── scrAbout ............. version, config revisions, sync state
```

Rules that keep it that way:

- **No screen exceeds 120 controls.** Enforced by `R011` in the validation
  suite, which fails the build rather than relying on discipline.
- **Repetition is a gallery, never copied controls.** If two controls differ
  only by which record they show, they are one gallery row template.
- **A modal is a screen unless it is genuinely transient.** Instrument Issue is
  a screen, not a modal (§43). Only confirmations are modal.

### Modal structure

Where a modal is genuinely warranted, it is always the same three layers, in
this order, as the last children of the screen:

1. `recScrim` — full-canvas rectangle, `Fill: =tokScrimFill`, `OnSelect` closes
   the dialog. It exists so nothing behind it can be tapped.
2. `conDialog` — the dialog container.
3. Dialog content.

A modal always has a visible dismissal route. Nothing is ever placed above the
dialog container.

---

## 3. Components

Reusable canvas components, so a change lands once (§44):

| Component | Responsibility |
|---|---|
| `cmpAppBar` | identity, survey, technician, sync state, back route |
| `cmpStatusBadge` | reads `tokStatusOf(key)`; renders glyph + label + colour, never colour alone |
| `cmpCapabilityCard` | one required capability, its system and its components |
| `cmpComponentEntry` | serial, calibration due, pre-use, background for **one** component |
| `cmpMeasurementInput` | large numeric field, unit, inline validation message |
| `cmpValidationMessage` | names the exact field and what is wrong |
| `cmpPointCard` | one survey point: identity, status, known condition |
| `cmpProgressBar` | due-point accounting |
| `cmpConfirmDialog` | scrim + dialog + explicit confirm/cancel |

`cmpComponentEntry` is the structural fix for defect 4.3: a primary component
and a probe are two instances of the same component, each bound to its own
record. Neither instance can read the other's state, because neither has a
reference to it.

---

## 4. How defects 4.1–4.3 are prevented structurally

The defective pattern:

```powerfx
// control shows "Extra", state comes from "Neutron"
Text: =LookUp(colInstruments, Key = "Extra").Serial
Fill: =If(LookUp(colInstruments, Key = "Neutron").CalDue < Today(), Color.Red, Color.Green)
```

The replacement is a gallery over the active assignment set, where every
property reads `ThisItem`:

```powerfx
Items: =Filter(colActiveInstruments, SurveyId = varSurveyId And SegmentId = varSegmentId)

// inside the row template
Text: ="CALIBRATION DUE  " & Text(ThisItem.Primary.CalibrationDue, "dd mmm yyyy")
Fill: =If(
          IsBlank(ThisItem.Primary.CalibrationDue), tokSurfaceMuted,
          ThisItem.Primary.CalibrationDue < Today(),  tokCriticalSurface,
          tokSuccessSurface
      )
```

A row has no way to name another instrument, so the defect class cannot be
expressed. `tests/fixtures/clean/` holds this shape as the reference, and
`R001` fails any build that reintroduces literal-key state lookups.

---

## 5. Workflow state machine (§38)

State lives in one place and changes through one function. Screens read it; they
do not assemble it from string fragments.

```
                 ┌──────────────────────────────────────────┐
                 ▼                                          │
   (new) ──▶ InProgress ──▶ TechnicianComplete ──▶ AwaitingTLReview
                 ▲                                    │      │
                 │                                    │      ▼
                 └──── ReturnedToTechnician ◀─────────┘   AwaitingAccHPReview
                                                             │      │
                                            ReturnedToTL ◀───┘      ▼
                                                 │             FinalSigned
                                                 ▼                  │
                                          AwaitingTLReview          ▼
                                                               Superseded
```

Valid transitions, and nothing else:

| From | To | Guard |
|---|---|---|
| *(new)* | `InProgress` | RWP confirmed **and** every required capability has a valid assignment |
| `InProgress` | `TechnicianComplete` | all §36 readiness gates satisfied |
| `TechnicianComplete` | `AwaitingTLReview` | — |
| `AwaitingTLReview` | `ReturnedToTechnician` | reason required |
| `AwaitingTLReview` | `AwaitingAccHPReview` | — |
| `ReturnedToTechnician` | `InProgress` | — |
| `AwaitingAccHPReview` | `ReturnedToTL` | reason required |
| `AwaitingAccHPReview` | `FinalSigned` | — |
| `ReturnedToTL` | `AwaitingTLReview` | — |
| `FinalSigned` | `Superseded` | new survey supersedes |

Implemented as a transition table, so an invalid transition is impossible rather
than merely unlikely:

```powerfx
colStateTransitions = Table(
    { From: "InProgress",        To: "TechnicianComplete",   ReasonRequired: false },
    { From: "TechnicianComplete",To: "AwaitingTLReview",     ReasonRequired: false },
    { From: "AwaitingTLReview",  To: "ReturnedToTechnician", ReasonRequired: true  },
    ...
);
```

Every transition writes an audit event (§48). Handover does **not** change
survey state — it closes one technician segment and opens another (§35).

---

## 6. Workflow state vs sync state (§37)

Two independent axes, never merged into one field or one badge:

| Workflow state | Sync state |
|---|---|
| `InProgress`, `TechnicianComplete`, `AwaitingTLReview`, … | `SavedLocally`, `PendingSync`, `Syncing`, `Synced`, `SyncError` |

A survey can be `TechnicianComplete` **and** `PendingSync`. Nothing in the UI
implies server-side persistence while offline.

---

## 7. Configuration loading

`App.OnStart` loads configuration once, into named collections:

| Collection | Source | Authority |
|---|---|---|
| `colPointRegister` | `config/controlled/point-register.json` | controlled |
| `colInstrumentRegister` | `config/controlled/instrument-register.json` | controlled |
| `colRwpConfig` | `config/controlled/rwp-config.json` | controlled |
| `colAlertRules` | `config/controlled/alert-rules.json` | controlled |
| `colSurveySchedule` | `config/survey-schedule.json` | directive §56 |
| `colActiveInstruments` | runtime | **authoritative for current capability coverage** |
| `colInstrumentHistory` | runtime | audit only — never consulted for coverage (§4.6) |

In the prototype these are embedded as static Power Fx tables generated from the
JSON. They are shaped as Dataverse tables so migration is a data-source swap
rather than a rewrite.

---

## 8. Performance (§46)

- Screens carry only their own controls, so hidden-control evaluation across the
  whole app disappears with the monolith.
- Derived values are named formulas, computed once per dependency change rather
  than per control.
- `With()` wraps any expression that would otherwise repeat a `LookUp`.
- Galleries render from configuration; there are no point-by-point duplicated
  controls to evaluate.

---

## 9. What this document does not establish

It is a design. It has not been built, imported, or opened in Power Apps Studio.
`STUDIO VERIFICATION REQUIRED` (§60).
