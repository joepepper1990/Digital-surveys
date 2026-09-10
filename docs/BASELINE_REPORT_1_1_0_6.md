# Baseline report — 1.1.0.6 runtime QA cycle

**Date:** 2026-09-10
**Cycle:** 1.1.0.5 → 1.1.0.6
**Outcome:** no application package produced — the baseline artefact was not
reachable from this environment.

---

## 1. Headline

**The 1.1.0.5 baseline artefact was not available to this build.**

The brief names:

```
C:\Users\joepe\OneDrive\Desktop\Digital Survey\OUTPUT\
ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip
SHA-256 1485ec3c20d9def9b2039c58c72c06d2f6277ccdd38a00aedae725fd9299e92a
```

That is a path on a Windows desktop. This cycle ran in an isolated Linux
container in Claude Code on the web, which has no access to that machine's
filesystem — there is no `C:` drive to read and no OneDrive mount. The
mandatory first action (§1: verify path, SHA-256, ZIP integrity, version,
unmanaged, inner `.msapp`, BOM, `checksum.json`) could not be performed,
because there was no file to hash.

Searches performed:

| Location | Result |
|---|---|
| Repository working tree | toolchain, tests, config and docs only — no app source |
| Full Git history, all branches, both remotes | 2 commits; no `.msapp`, no `Src/`, no 1.1.0.x anything |
| GitHub releases and pull requests on `joepepper1990/Digital-surveys` | none |
| `/mnt/attach`, `/mnt/user-data` (attachment mounts) | empty |
| Filesystem-wide: `*ESGDigital*`, `*.msapp`, any `.zip` | only the Chromedriver archive |

No runtime screenshots were attached to this session either.

**Nothing of 1.1.0.4 or 1.1.0.5 exists in this repository.** Those releases
were produced somewhere else. The most recent state here is the 1.0.0.9 cycle,
which reported the same blocker one version earlier
(`docs/BASELINE_REPORT.md`) — the 1.0.0.8 package was never supplied either.

## 2. What this blocks

Every deliverable in the brief depends on the artefact:

| Blocked | Why |
|---|---|
| Reproducing the header overlap and the blank Sign Out screen | the screens live in the missing package |
| Proving either root cause | §4 requires proof, not a guess, and there is nothing to inspect |
| Fixing them, or anything found alongside them | no source to edit |
| The §9 full visual walkthrough of ~27 views | no app to run |
| §13 end-to-end workflow, §14 multi-instrument, §15 keypad, §17 alerts, §18 handover, §19 resume | no app to run |
| `ESGDigitalRadiologicalSurveys_1_1_0_6_FINAL_UNMANAGED.zip` | there is no app to version, and no `OUTPUT` directory on this machine to write it to |
| Preserving the v1.1.0.4/1.1.0.5 fixes (§22) | they are not present to preserve |

Power Apps Studio was also not available and could not have been: it needs an
interactive browser session signed in to the EDF tenant. This container has no
such credentials, and acquiring them was not in scope.

An application was **not** written from scratch to fill the gap. It would have
required inventing the instrument register, point register, alert thresholds
and map geometry — every one prohibited by §21 — and would have produced a ZIP
labelled 1.1.0.6 that shared no code with the 1.1.0.5 the technicians saw. That
is worse than delivering nothing, because it looks like delivery.

## 3. What was done instead

Everything in the brief that does not depend on the artefact.

### Toolchain re-verified in this container

| Component | Version | Status |
|---|---|---|
| Power Platform CLI (`pac`) | 2.11.2+g47bc199 | verified running, linux-x64 |
| .NET runtime | 10.0.0 (runtime + ASP.NET Core) | verified |
| `pac canvas unpack` / `pack` / `validate` | available | verified |

`tools/bootstrap.sh` reproduced this from scratch in a fresh container, so the
unpack → fix → pack path is ready the moment a package arrives.

### Detectors for both confirmed runtime defect classes

§20 asks that every fix be generalised to the whole app rather than applied to
the instance in the screenshot. Since the instances could not be reached, the
generalisation was built first, in `tests/validators/rules_runtime.py`:

| Rule | Detects | Severity |
|---|---|---|
| `R014` | sibling controls whose rectangles partially overlap and can both be visible | ERROR |
| `R015` | a control positioned outside the 1440×960 canvas | ERROR |
| `R016` | interactive control below the 48 px touch target (§12) | WARNING |
| `R017` | a screen with no unconditionally visible control — it can render blank | ERROR |
| `R018` | a variable or collection read but never written anywhere in the app | ERROR |
| `R019` | a record field read under a name no write to that collection supplies | ERROR |
| `R020` | how many controls the geometry rules could actually check | INFO |

`R014`–`R016` are the header class. `R017`–`R019` are the blank-screen class,
and between them cover four of the candidate root causes listed in §4:
*selected instrument variable blank*, *colInstrumentDraft not created or
populated*, *wrong draft field names*, and *conditional controls all evaluating
false*. When the package arrives, `tests/run_all.sh` names the offending
controls and screens directly.

28 new tests, red against `tests/fixtures/runtime-defective/` and green against
`tests/fixtures/runtime-clean/`. As with `R001`, they assert the *class*: one
test proves `R018` fires on `varPostDeconResult`, a name that appears in
neither screenshot.

Suite total: **104 tests, all passing** (was 76).

### Honesty about what static analysis proves

`R020` exists because the brief's central complaint is right: previous releases
passed hundreds of static tests and still looked broken. A control positioned
by `=Parent.X + 8` is not decidable without rendering, so it is reported as
**not checked** rather than counted as clean. A silent `R014` is not a verified
layout, and the suite now says so in the output rather than in a footnote.

## 4. What this cycle did not establish

| | |
|---|---|
| Structurally verified | toolchain runs; 104 validator tests pass; the new analysers fire on the shape of both confirmed defects |
| Not verified | anything at all about the 1.1.0.5 application — it was not available |
| Studio verification | **REQUIRED** and not performed |
| Runtime walkthrough | **not performed** — there was no app to run |
| Controlled source | **PENDING** — see `CONTROLLED_SOURCE_MATRIX.md` |

## 5. To resume

The blocker is a file transfer, not a decision. Attach the package to the
session, or commit it to the repository, then:

```bash
cp ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip source-original/
tools/bootstrap.sh
tools/unpack.sh source-original/ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip
tests/run_all.sh
```

That run produces what this document could not: the real SHA-256, the real
control inventory, and every `R001`–`R020` finding in the actual application —
including, if the root causes are what §4 suspects, the specific control behind
the blank Sign Out screen and the specific pair behind the header overlap.

Studio verification of the result remains required regardless (§60): these
analysers narrow where to look, and prove nothing about how a screen renders.
