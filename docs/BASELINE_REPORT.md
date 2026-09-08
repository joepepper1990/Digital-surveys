# Baseline report — 1.0.0.9 development cycle

**Date:** 2026-09-08
**Cycle:** 1.0.0.8 → 1.0.0.9

---

## 1. Headline

**The 1.0.0.8 baseline artefact was not supplied to this build.**

The execution directive names:

```
ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip
```

That file is not present in this repository, and is not present anywhere in the
build environment. The repository `joepepper1990/Digital-surveys` had **no
commits at all** when this cycle began — the first commit in its history is the
one produced by this cycle.

Searches performed:

| Location | Result |
|---|---|
| Repository working tree and full Git history | empty repository, no commits |
| `/mnt/attach`, `/mnt/user-data`, `/opt/rclone-attach` (attachment mounts) | empty |
| Filesystem-wide search for `*ESGDigital*`, `*RadiologicalSurvey*`, `*.msapp` | no matches |
| Filesystem-wide search for any ZIP over 10 KB | only Go toolchain and Chromedriver archives |

The **master brief** referenced as authoritative ("You have been given the full
CLAUDE CODE MASTER BRIEF") was also not supplied. Only the execution directive
itself was available.

## 2. What this blocks

Directive §2 requires work to continue unless *genuinely blocked by missing
controlled information*. This is that case, for a bounded set of items — and
§49 forbids inventing any of them.

| Blocked | Why |
|---|---|
| Fixing defects 4.1–4.5 in situ | the formulas live in the missing package |
| `outputs/ESGDigitalRadiologicalSurveys_1_0_0_9_UNMANAGED.zip` | there is no app to version |
| Preserving solution and canvas app identity (§75) | the identity values live in the missing package |
| Source SHA-256, package structure, screen/control inventory (§66) | nothing to hash or inventory |
| Point register, instrument register, RWP config, alert thresholds | controlled facts; §49 forbids invention |
| Map assets and hit-area geometry | controlled; §26 and §50 forbid invention |

A fresh application was **not** built from scratch instead. Doing so would have
required inventing the instrument register, point register, thresholds and map
geometry — every one of them prohibited by §49 — and would have produced a
second codebase that could never be reconciled with 1.0.0.8's existing valid
survey configuration (§75).

## 3. What was done instead

Everything in the cycle that does not depend on the missing artefact:

| Delivered | Directive |
|---|---|
| Working structure and pinned, reproducible toolchain | §64, §76 |
| Static analysis suite detecting the **defect class** behind 4.1–4.3 | §54 |
| Analysers for 4.4, 4.6, background subtraction, stale version literals, RWP branching, dead controls, screen density | §5, §42, §46, §53 |
| Package integrity, identity, version and geometry validators | §54 |
| Configuration schemas: point register, component-aware instrument register, RWP config, alert rules, active assignment | §22, §39, §40, §41 |
| Month schedule, populated and asserted month by month | §56 |
| Design token system with machine-checked contrast and touch targets | §8, §45 |
| Target architecture and data model specifications | §38, §4.6–§4.9 |
| UAT checklist | §59 |

76 tests pass. The suite reports 6 **BLOCKED** checks — checks that could not
run because controlled data was not supplied. A blocked check is never reported
as a pass (§68, §77).

## 4. Toolchain established

The supported unpack/pack path is available and verified running in this
environment, so no binary patching is needed when the baseline arrives (§76):

| Component | Version | Status |
|---|---|---|
| Power Platform CLI (`pac`) | 2.11.2+g47bc199 | verified running, linux-x64 |
| .NET runtime | 10.0.0 (runtime + ASP.NET Core) | verified |
| `pac canvas unpack` / `pack` | SourceCode layout | available |

`tools/bootstrap.sh` reproduces this from scratch. `tools/pack.sh` re-extracts
and re-unpacks its own output before reporting success, so a ZIP with the right
filename and a corrupt payload cannot pass (§76).

## 5. Defects: status

Static analysers exist for each confirmed defect, proven against fixtures that
reproduce their shape. None has been **fixed**, because the code containing them
was not supplied.

| Defect | Analyser | Proven by | Fixed |
|---|---|---|---|
| 4.1 Extra instrument calibration from `Key="Neutron"` | `R001/A` | `tests/fixtures/defective` | no |
| 4.2 Floor Monitor colour from Neutron `PostCheck` | `R001/B` | `tests/fixtures/defective` | no |
| 4.3 Paired Gamma display vs primary state | `R001/C` | `tests/fixtures/defective` | no |
| 4.4 Post-use failure alerts self-resolving | `R002` | `tests/fixtures/defective` | no |
| 4.5 Incomplete pair architecture | `R234` (schema) | `tests/test_config_rules.py` | no |
| 4.6 History as capability authority | `R009` | `tests/fixtures/defective` | no |
| 4.7 Add vs Replace not distinct | data model + schema | `config/schemas/` | no |
| 4.8 Muddled background model | data model + schema | `config/schemas/` | no |
| 4.9 621-control pseudo-screen | `R011` budget | architecture spec | no |

`R001` is deliberately not a test for the three known formulas. It detects the
shape — *a control presenting instrument X deriving state from instrument Y* —
and `tests/test_static_rules.py` proves it fires on an Alpha/ReactorCO₂ pair
that appears nowhere in the directive.

## 6. To resume

```bash
cp "ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip" source-original/
tools/bootstrap.sh
tools/unpack.sh "source-original/ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip"
tests/run_all.sh
```

The first run produces the baseline defect inventory this document could not:
the real SHA-256, the real control inventory, and every `R001`–`R013` finding in
the actual application.

Also required, and independent of the ZIP:

- the master brief (alert thresholds → `config/controlled/alert-rules.json`);
- C07 (point register, section membership, required measurements);
- the controlled instrument register (systems, components, pairings);
- RWP configuration and revisions;
- approved map assets and hit-area geometry.

## 7. Verification status

| | |
|---|---|
| Structurally verified | toolchain runs; 76 validator tests pass; configuration conforms to schema; design tokens meet contrast and touch-target thresholds |
| Not verified | anything about the 1.0.0.8 application — it was not available |
| Studio verification | **REQUIRED** and not performed — no package was produced |
| Controlled source | **PENDING** — see `CONTROLLED_SOURCE_MATRIX.md` |
