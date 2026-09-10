# Known limitations — 1.0.0.9, updated for 1.1.0.6

Nothing here is hidden or softened (§70, §77).

> **1.1.0.6 update.** The 1.1.0.5 artefact was supplied part-way through this
> cycle, so §1.1–§1.3 below no longer apply: the package exists, the defects
> were reproduced from real source, and 1.1.0.6 is delivered. §1.4 stands — no
> controlled register has been imported, and four checks remain BLOCKED.
>
> Still limiting 1.1.0.6:
>
> * **Power Apps Studio was never opened.** This cycle had no authenticated
>   tenant. Both confirmed defects were reproduced from source, and the fix for
>   each is evidenced by geometry and paint order, but nothing has been seen
>   rendering. §2.1 applies in full.
> * **No workflow was executed.** The end-to-end journey was reasoned through
>   the state model, not run. Behaviour is unchanged from 1.1.0.5 by
>   construction — zero behaviour properties were touched — which is the
>   strongest claim available without a runtime.
> * **The rendered view images are not Studio.** `tools/render_views.py` draws
>   real geometry, fills and literal text, which is enough to see crowding,
>   raggedness and occlusion. It does not implement Power Fx, text metrics or
>   control templates, so it cannot confirm exact wrapping or font rendering.
> * **86 of 91 warnings are retired controls.** The superseded
>   single-instrument architecture is still present, hard-coded invisible. It
>   is proven inert (an invisible control takes no taps) and was left in place
>   per §18, but it still carries the 1.0.0.8 defect shapes and would misbehave
>   if any of it were re-enabled.
> * **`R013` needs a controlled source.** RWP 850's MUST KNOW text is branched
>   inside `lblSetupNote`. Moving it to `rwp-config.json` needs the controlled
>   RWP configuration, which was not supplied.
> * **`R011`: 763 controls on one screen.** The single-screen architecture is
>   unchanged; splitting it is not a presentation fix.
>
> See `docs/CHANGELOG_1_1_0_6.md` and `docs/STUDIO_ACCEPTANCE_1_1_0_6.md`.

---

## 1. Blocking

### 1.1 No application package was produced
The 1.0.0.8 baseline artefact named in the directive was not supplied and is not
present anywhere in the build environment. `outputs/` is empty. There is no
`ESGDigitalRadiologicalSurveys_1_0_0_9_UNMANAGED.zip`.

### 1.2 No defect has been fixed
Defects 4.1–4.9 are **detected** by analysers proven against fixtures, but none
is fixed — the code containing them was not available. Do not read the passing
test suite as evidence that the application is correct.

### 1.3 The 1.0.0.8 application was never examined
Every statement in this repository about 1.0.0.8's internals — 621 controls,
`varView` navigation, the specific defective formulas — is **quoted from the
directive**, not observed. The baseline defect inventory required by §66 could
not be produced.

### 1.4 No controlled register has been imported
Point register, instrument register, RWP configuration and alert thresholds are
all empty and marked `SOURCE_REQUIRED`. The validation suite reports four
BLOCKED checks as a result. §49 forbids populating them by invention.

---

## 2. Verification

### 2.1 STUDIO VERIFICATION REQUIRED
No package has been imported into Power Apps Studio, opened, checked with App
Checker, or exercised. Claude Code cannot perform those actions in this
environment. Nothing in this cycle may be described as runtime-valid.

### 2.2 `pac canvas pack` has not been exercised on a real app
The pipeline is scripted and self-verifying (it re-extracts and re-unpacks its
own output), but has never run against an actual `.msapp`. `pac canvas pack` is
a **Preview** command; round-trip fidelity on this specific application is
unproven. If it turns out to alter the app in ways Studio rejects, that will
only surface on first use — expect to validate this before relying on it.

### 2.3 Static analysis proves nothing about runtime
Directive §3 is explicit and this cycle changes nothing about it: a structurally
valid package can still be semantically wrong. `errors 0` means no check that
could run found a problem.

### 2.4 The analysers are heuristics
`R001`–`R013` parse Power Fx with regular expressions, not with a Power Fx
parser. They will detect the shapes in `tests/fixtures/defective` and shapes
close to them. They will not detect a cross-record defect expressed through an
intermediate variable, a `With()` binding, or a computed key. They reduce risk;
they do not eliminate it. Treat a clean static run as a floor, not a ceiling.

### 2.5 `R003` and `R011` may produce false positives on a real app
The stale-reference detector uses a name-shape heuristic and the screen-density
budget is a judgement value (120). Both are WARNING, not ERROR, for that reason.
Expect to tune `tests/rules/static-analysis.json` on first contact with the real
source.

---

## 3. Offline and backend

### 3.1 Production Dataverse mobile offline is not proven
There is no production Dataverse backend. Offline behaviour has not been
implemented or tested. **Dataverse mobile offline validation remains a
production-environment/UAT dependency** (§61).

### 3.2 Prototype collections are not tables
The data model is *shaped* as Dataverse tables, but the prototype would hold it
in collections. Migration is intended to be a data-source swap; that intent is
untested.

---

## 4. Controlled-document issues

### 4.1 Point 33 methodology is unresolved
C07 currently shows 8 blocks per wall. The prototype preference for a minimum of
four selectable positions **must not silently become the production method**
(§50). No pipework geometry has been created. `subPositions[]` exists as the
configuration mechanism and is empty.

### 4.2 Map assets are absent
No approved map imagery or hit-area geometry was supplied. Where geometry is
absent, a point must remain reachable from the Area References list and the map
must report the asset as outstanding. No geometry has been invented (§26).

### 4.3 The capability set is not authoritative
Directive §14 lists Gamma Dose Rate, Beta/Gamma, Alpha, EC, Reactor CO₂ and
Neutron as **examples**. The authoritative closed set is unknown.

### 4.4 The month schedule is directive-sourced, not C07-verified
`config/survey-schedule.json` is quoted verbatim from §56 and is asserted month
by month. It has **not** been reconciled against C07, and must be before UAT
sign-off.

### 4.5 R4 restriction is recorded but not enforced in code
C07 does not permit entry to R4 (§51). This is documented in the data model as a
constraint. With no application and no classification data, nothing enforces it
yet.

---

## 5. Organisational

| Item | Status |
|---|---|
| EDF security review | not performed, not assessed |
| Tenant deployment approval | outstanding |
| Device approval (Surface Pro class) | outstanding |
| Controlled-document approval (C07, C01, I01, RWP) | outstanding |
| Production authentication | not available; prototype identities are used and clearly labelled |
| Notification recipients | not established; not modelled (§49) |
| Record retention requirements | not established; not modelled |

---

## 6. Scope

### 6.1 Review workflow is specified, not built
The state machine in `ARCHITECTURE_1_0_0_9.md` §5 covers TL and Acc.HP review
states and their valid transitions. No review screen exists. Directive §62 puts
technician workflow first, and with no baseline to build on, nothing was built
at all.

### 6.2 The architecture and data model are designs
`ARCHITECTURE_1_0_0_9.md` and `DATA_MODEL_1_0_0_9.md` describe a target. They
have not been implemented, imported or exercised. Their value is that they are
specific enough to build from and to disagree with — not that they are proven.

### 6.3 The design system is unrendered
`design/tokens.json` is measured for contrast, touch targets and type sizes, and
emits valid-looking Power Fx. It has **never been rendered on a screen**. Colour
that measures well can still look wrong in plant lighting on a real device. The
visual quality gate in §72 requires looking at actual screens, and there are
none.
