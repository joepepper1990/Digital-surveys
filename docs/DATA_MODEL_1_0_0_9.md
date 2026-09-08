# Data model — 1.0.0.9

**Status:** target model. Not implemented in an application package — the
1.0.0.8 baseline was not supplied. JSON Schemas in `config/schemas/` are the
machine-readable form and are enforced by the validation suite.

---

## 1. The separation the directive asks for (§4.6)

1.0.0.8 conflated instrument identity, current assignment and history. §4.6 is
explicit that history must never satisfy current capability coverage. Seven
distinct concepts:

| Concept | Answers | Lifetime |
|---|---|---|
| **Instrument definition** | what kind of system is this? | permanent |
| **Instrument component** | which separately controlled part? | permanent |
| **Capability** | what survey need does it meet? | permanent |
| **Active assignment** | which system is in use *now*, by whom, for what? | one segment |
| **Historical assignment** | what *was* in use, and why did it change? | permanent |
| **Reading association** | which assignment produced this reading? | permanent |
| **Audit event** | who did what, when, and why? | permanent |

`colActiveInstruments` is the only authority for current coverage. `R009` in the
validation suite fails any build that derives coverage from a history
collection.

---

## 2. Entities

### InstrumentDefinition
A **system**, not a box. Schema: `config/schemas/instrument-register.schema.json`.

| Field | Notes |
|---|---|
| `instrumentDefinitionId` | stable key |
| `displayName`, `baseModel` | |
| `systemType` | `SingleUnit` \| `RatemeterProbe` \| `BaseUnitProbe` |
| `components[]` | ≥1; a probe system declares **two** |
| `active` | inactive definitions cannot be assigned |
| `source` | controlled-source provenance |

§4.5 lists FH40 G-L10 + FHZ 512A, Electra + detector and RadEye SX + detector as
systems whose second component 1.0.0.8 did not model. `systemType` plus
`components[]` makes that a schema violation rather than an oversight: `R234`
fails a `RatemeterProbe` that declares one component.

### InstrumentComponent

| Field | Notes |
|---|---|
| `componentId`, `role` | `Primary` \| `Probe` \| `Detector` |
| `model` | |
| `serialRequired`, `calibrationRequired` | |
| `preUseRequired`, `postUseRequired` | |
| `backgroundRequired` | |
| `capabilities[]` | which capabilities *this component* contributes |

A system satisfies a capability only when the **contributing component** is
itself valid. A ratemeter with an expired probe satisfies nothing.

### Capability

`capabilityId`, `displayName`, `unit`, `backgroundRequired`. The unit travels
with the capability so every numeric input can label itself (§29). Capabilities
are a closed set; `R236` rejects an instrument claiming one that does not exist.

### ActiveInstrumentAssignment

Schema: `config/schemas/instrument-assignment.schema.json`. Shaped as a
Dataverse table (§22).

| Field | Notes |
|---|---|
| `assignmentId` | |
| `surveyId`, `segmentId` | segment = one technician's period of work |
| `capabilityId` | what this assignment is *for* |
| `instrumentDefinitionId` | |
| `components[]` | per-component serial, calibration due, pre-use, post-use, background |
| `activeFrom`, `activeTo` | `activeTo` null while current |
| `status` | `Active` \| `Replaced` \| `Withdrawn` |
| `replacementOfAssignmentId` | set on the **new** record; null for Add |
| `reason` | mandatory for Replace, null for Add |
| `technician` | |
| `readingAssociations[]` | readings taken under this assignment |

Per-component state is what makes 4.3 unrepresentable: `components[0].postUse`
and `components[1].postUse` are separate records, so a probe's result cannot be
displayed against the ratemeter's state.

---

## 3. Add vs Replace (§4.7)

1.0.0.8 treated these as one generic operation. They differ in what they mean.

### Add Instrument (§23)

Another usable system joins the active set. Nothing is superseded.

```
new assignment: status Active, activeTo null,
                replacementOfAssignmentId null, reason null
```

### Replace Instrument (§24)

One system supersedes another. The old record is **retained**, never
overwritten:

1. select the assignment to replace;
2. select a reason (mandatory);
3. close the old interval — `activeTo = Now()`, `status = "Replaced"`;
4. create the new assignment with `replacementOfAssignmentId` = the old id;
5. run the same validation as a fresh assignment (calibration, pre-use, background);
6. future readings associate with the **new** assignment;
7. existing readings stay with the **old** one.

No historical information is destroyed. Which instrument produced a given
reading remains answerable after any number of replacements.

---

## 4. Background (§4.8, §19, §53)

1.0.0.8 risked collapsing different background measurements into one value.
Background is held **per component, per capability**, with its unit and time:

```json
{ "capabilityId": "BetaGamma", "value": 12.4, "unit": "cps",
  "takenAt": "2026-09-08T07:41:00Z" }
```

Consequences:

- Alpha, Beta/Gamma and EC backgrounds are separate records and cannot merge.
- Background is requested only where `backgroundRequired` is set (§19); no
  irrelevant field is ever shown.
- **Background is never subtracted.** Raw reading and background are stored and
  displayed separately (§53). `R008` fails any build that nets them.

---

## 5. Readings

| Field | Notes |
|---|---|
| `readingId`, `surveyId`, `segmentId`, `pointId` | |
| `subPositionId` | for points with selectable positions (e.g. Point 33) |
| `measurementId`, `capabilityId` | from the point register |
| `value`, `unit` | raw, as read |
| `assignmentId` | which instrument assignment produced it |
| `takenAt`, `takenBy` | |
| `entryErrorOf` | set on a re-entry that supersedes a cancelled reading |

### Entry error (§32)

A wrong entry is cancelled explicitly, never silently overwritten:

- the original reading is marked `Cancelled` with reason `EntryError`;
- any alert it raised is closed as `EntryErrorCancellation` — **not** as a
  radiological resolution;
- the audit trail retains both the original value and the cancellation;
- the point returns to incomplete and the reading must be re-entered.

---

## 6. Alerts and actions (§25, §31)

| Field | Notes |
|---|---|
| `alertId`, `alertType`, `ruleId` | |
| `status` | `Open` \| `Deferred` \| `Resolved` \| `EntryErrorCancelled` |
| `dispositionId` | required to leave `Open`; never set at creation |
| `raisedAt`, `raisedBy`, `triggeringReadingId` | |
| `surveyId`, `segmentId`, `pointId`, `assignmentId` | |

**Defect 4.4 explicitly.** An alert is created `Open`. It is never created
`Resolved`. A post-use failure:

- remains recorded;
- remains visible to review;
- does **not** delete or invalidate previous measurements;
- carries an explicit disposition;
- does not disappear from completion or review logic.

`R002` fails any build that creates a failure alert already resolved, and warns
on any resolution without a disposition.

`Deferred` is a distinct state, not a soft resolve: a deferred action stays
visibly outstanding (§31) and appears on the Technician Complete dashboard.

---

## 7. Audit events (§48)

| Field | Notes |
|---|---|
| `eventId`, `occurredAt`, `actor` | |
| `action` | e.g. `AssignmentReplaced`, `ReadingCancelled`, `StateTransition` |
| `priorState`, `resultingState` | where a state changed |
| `reason` | |
| `surveyId`, `segmentId`, `pointId`, `assignmentId` | |

Timestamps and identities are real or absent — never fabricated (§48). Until
production authentication exists, the actor is a clearly-labelled prototype
identity, and `CONTROLLED_SOURCE_MATRIX.md` records that as outstanding.

---

## 8. Segments and handover (§35)

A **segment** is one technician's period of work on one survey.

- Handover closes the current segment and opens a new one.
- The incoming technician's instrument set is recorded **separately** — their
  assignments carry the new `segmentId`.
- Readings stay associated with the segment and assignment that produced them.
- Survey workflow state is unchanged by handover (§6 of `ARCHITECTURE`).

---

## 9. Point register (§39)

Schema: `config/schemas/point-register.schema.json`. Notable constraints:

- `pointId` allows a trailing letter, so `7a` is a first-class identifier.
- `sections[]` plus `config/survey-schedule.json` determines whether a point is
  **due** this month. Not-due points remain visible but never count against
  completion (§34).
- `measurements[]` carries its own unit — the entry screen renders exactly these
  fields and nothing else (§28).
- `map` holds a configuration-driven hit area. **Absent geometry means absent**:
  the point is reachable from the Area References list and the map reports the
  asset as outstanding. No geometry is ever synthesised (§26, §50).
- `subPositions[]` covers Point 33's selectable positions. Supplied by
  controlled configuration only; the prototype does not invent pipework
  geometry, and the four-position prototype preference must not silently become
  the production method (§50).
- `knownCondition` carries *current* elevated-condition information only. Prior
  routine readings are **not** in this model at all, so they cannot be shown to
  a technician performing the current survey (§52).

---

## 10. Not represented, deliberately

| Not modelled | Why |
|---|---|
| Prior routine measurement values | §52 forbids showing them during a survey |
| Net (background-subtracted) readings | §53 forbids automatic subtraction |
| R4 entry | §51 — C07 does not permit entry to R4 |
| Any threshold value | §49 — controlled fact, not supplied |
