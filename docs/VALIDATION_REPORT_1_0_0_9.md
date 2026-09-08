# Validation report — 1.0.0.9

**Date:** 2026-09-08
**Scope:** repository content only. No application package was produced — the
1.0.0.8 baseline artefact was not supplied. See `BASELINE_REPORT.md`.

Directive §68 requires three separate registers. They are kept strictly
separate below, and §77 language rules are applied: nothing here is described as
tested, verified, validated or ready beyond what the evidence supports.

---

## 1. Automatically verified

What the tooling genuinely proves, and nothing more.

| # | Claim | Evidence |
|---|---|---|
| 1 | The pinned toolchain runs in this environment | `pac 2.11.2+g47bc199 (.NET 10.0.0)` executed successfully; `pac canvas unpack`/`pack` present |
| 2 | The validator suite passes | `python3 -m pytest tests -q` → **76 passed** |
| 3 | Static analysers detect the shape of every confirmed defect | `tests/fixtures/defective` triggers `R001/A`, `R001/B`, `R001/C`, `R002`, `R003`, `R004`, `R005`, `R006`, `R008`, `R009`, `R012`, `R013` |
| 4 | The analysers do not fire on correct code | `tests/fixtures/clean` produces **zero** findings while parsing 11 controls |
| 5 | `R001` detects the defect *class*, not three known formulas | `test_cross_record_detector_is_key_agnostic` fires it on an Alpha/ReactorCO₂ pair absent from the directive |
| 6 | A documented exception suppresses `R001` | `test_documented_exception_suppresses_finding` |
| 7 | A correct single-record control is not flagged | `test_single_record_control_is_not_flagged` |
| 8 | Package validators detect corruption and identity drift | 11 tests over synthetic solution ZIPs: bad CRC, corrupt embedded `.msapp`, malformed XML, wrong version, managed flag, missing member, wrong canvas geometry, renamed app |
| 9 | The month schedule matches directive §56 | 12 parametrised tests, one per month; mutation tests confirm a dropped section, a missing month and a dropped A1 are all caught |
| 10 | Configuration conforms to its schemas | `jsonschema` Draft 2020-12 validation, with cross-schema `$ref` resolution confirmed live |
| 11 | Point register rules work | duplicate `pointId`, missing Point 7a, missing Point 33, missing unit, uncovered section — all detected against a populated synthetic register |
| 12 | Instrument register rules work | incomplete pair (§4.5), unknown capability, duplicate definition, two primaries, active-with-no-capability — all detected |
| 13 | Alert boundary evaluation is correct at below/at/above | parametrised over a synthetic rule; equality resolves to `ReviewRequired`, never silently to `NoAction` |
| 14 | Design tokens meet contrast thresholds | all 22 declared ink/surface pairs ≥ 4.5:1, computed with the WCAG 2.1 formula, itself checked against three reference values |
| 15 | Status never depends on colour alone | every status in `statusStyles` and `syncStyles` carries a glyph and a label; a missing one fails `R304` |
| 16 | Touch targets and type sizes meet the declared floors | `minTouchTarget` 48px, field/button height 56px, type floor 14px; violations fail `R306`/`R307` |
| 17 | Generated Power Fx matches its source | `design/emit_powerfx.py --check` |

One finding from this cycle is worth recording: **check 14 initially failed.**
`disabledInk` on `disabledSurface` measured 4.10:1 against a declared 4.5:1
minimum. The token was darkened to `#55616C` (5.18:1). The palette was corrected
by measurement, not by assertion.

## 2. Manually verified

Only what was actually performed by hand.

| Claim | How |
|---|---|
| The baseline artefact is absent from the environment | filesystem-wide searches for `*ESGDigital*`, `*RadiologicalSurvey*`, `*.msapp`, and every ZIP over 10 KB; attachment mounts inspected; Git history confirmed empty |
| `pac` runs on linux-x64 here | `pac help`, `pac canvas help`, `pac canvas unpack help`, `pac canvas pack help` executed and output read |
| Cross-schema `$ref` resolution is live, not silently skipped | removed a required `verified` property from a config file and confirmed the validator rejected it |

## 3. NOT verified

| Item | Status |
|---|---|
| **The 1.0.0.8 application** — its formulas, screens, controls, collections, defects | **NOT EXAMINED.** The package was not supplied. Every statement in this repository about 1.0.0.8's internals is quoted from the directive, not observed. |
| **Power Apps Studio runtime** | **STUDIO VERIFICATION REQUIRED.** No package was produced, imported or opened. App Checker was not run. |
| **`pac canvas pack` round-trip on a real app** | The pipeline is scripted and self-verifying, but has not been exercised on an actual `.msapp` — none was available. |
| **Production Dataverse offline** | Not implemented and not proven. Remains a production-environment/UAT dependency. |
| **Any radiological threshold** | Not supplied; `config/controlled/alert-rules.json` is empty and marked `SOURCE_REQUIRED`. |
| **Point register, instrument register, RWP config, map geometry** | Not supplied; all marked `SOURCE_REQUIRED`. |
| **The target architecture and data model** | **Designs, not implementations.** Not built, not imported, not exercised. |
| EDF security, tenant deployment, device approval | Out of scope for this cycle and not assessed. |
| Controlled-document approval (C07, C01, I01, RWP) | Not assessed. |
| Point 33 methodology | Unresolved controlled-document issue; see `KNOWN_LIMITATIONS.md`. |

## 4. Suite output

```
errors 0   warnings 0   blocked 6   info 0
```

The six BLOCKED checks:

| Check | Blocked on |
|---|---|
| `R100` package present | no 1.0.0.8 baseline to build from |
| `R001`–`R013` static analysis | no canvas sources to analyse |
| `R221` point register integrity | controlled point register not supplied |
| `R231` instrument register integrity | controlled instrument register not supplied |
| `R241` RWP config integrity | RWP configuration not supplied |
| `R251` alert boundary cases | thresholds not supplied |

**A BLOCKED check is not a pass.** `errors 0` here means *no check that could run
found a problem* — it does not mean the application is correct. Directive §3
makes the same point about the 1.0.0.8 package: structural validity is not
semantic correctness.

## 5. Independent review (§78)

The material a separate reviewer needs is in the repository:

- `tools/bootstrap.sh` reproduces the exact toolchain;
- `tests/` runs standalone with three dependencies (`jsonschema`, `pytest`, `PyYAML`);
- `tests/fixtures/` shows precisely what each analyser considers defective and
  correct, so the detection logic can be judged rather than trusted;
- `tests/rules/*.json` externalises every threshold, collection name and
  forbidden pattern the analysers use.

These validators are development evidence. They are not independent assurance.
