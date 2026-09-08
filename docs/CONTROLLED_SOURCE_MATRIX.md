# Controlled source matrix — 1.0.0.9

Every controlled or configured operational fact the application depends on, with
its source, where it is implemented, and whether it has been verified against
the controlling document.

**Verified** means a named reviewer has checked the value against a stated
revision of the controlling document. Nothing in this cycle meets that bar: no
controlled document was supplied to this build.

Directive §49 prohibits inventing any item in this table. Where a value is
missing it is recorded as `SOURCE_REQUIRED` in configuration and reported
**BLOCKED** by the validation suite — never defaulted, never guessed.

---

## 1. Controlling documents

| Document | Supplied | Needed for |
|---|---|---|
| CLAUDE CODE MASTER BRIEF | **No** | radiological rules, alert thresholds, safety boundaries |
| C07 survey methodology | **No** | point register, section membership, required measurements, Point 33 methodology, R4 restriction |
| C01 | **No** | referenced by the directive; scope not established without the master brief |
| I01 defective-instrument process | **No** | text and routing shown when an instrument fails or calibration expires (§17, §18) |
| RWP set | **No** | RWP identities, revisions, required capabilities, MUST KNOW content |
| Approved map assets | **No** | map imagery and hit-area geometry (§26, §50) |
| Controlled instrument register | **No** | instrument systems, components, pairings, calibration and check requirements |
| `ESGDigitalRadiologicalSurveys_1_0_0_8_...zip` | **No** | the baseline application itself |

---

## 2. Facts

| # | Item | Source | Revision | Implementation | Verified | Outstanding |
|---|---|---|---|---|---|---|
| 1 | Monthly section due schedule | Execution directive §56 | as supplied 2026-09-08 | `config/survey-schedule.json`; asserted by `R211`–`R214` | **No** | Quoted verbatim from the directive. Must be reconciled against C07 before UAT sign-off. |
| 2 | Survey sections A1, A2, B, C, D | Execution directive §55–§56 | as supplied | `config/survey-schedule.json` | **No** | Names only; membership unknown without C07. |
| 3 | Survey point register | C07 | — | `config/controlled/point-register.json` — **empty** | **No** | `SOURCE_REQUIRED`. `R221` BLOCKED. |
| 4 | Point 7a existence | Directive §55 | — | asserted by `R223` once populated | **No** | Test exists; register does not. |
| 5 | Point 33 existence | Directive §55 | — | asserted by `R223` once populated | **No** | See item 6. |
| 6 | Point 33 pipework methodology | C07 | — | `subPositions[]` in the point-register schema | **No** | **Open controlled-document issue.** C07 currently shows 8 blocks per wall. The prototype preference for a minimum of four selectable positions must not silently become the production method (§50). No geometry has been created. |
| 7 | Level membership per point | C07 | — | `level` field | **No** | `SOURCE_REQUIRED`. |
| 8 | Required measurements per point | C07 | — | `measurements[]` | **No** | `SOURCE_REQUIRED`. Includes EC, wipe and neutron applicability. |
| 9 | Measurement units | C07 | — | `measurements[].unit`; `R227` fails a missing unit | **No** | `SOURCE_REQUIRED`. |
| 10 | Fixed beta/gamma rule applicability | C07 | — | `fixedBetaGammaRuleApplies` | **No** | `SOURCE_REQUIRED`. |
| 11 | Instrument definitions | Controlled instrument register | — | `config/controlled/instrument-register.json` — **empty** | **No** | `SOURCE_REQUIRED`. `R231` BLOCKED. |
| 12 | Component pairings (FH40 G-L10 + FHZ 512A; Electra + detector; RadEye SX + detector) | Controlled instrument register | — | `systemType` + `components[]`; `R234` fails an unpaired probe system | **No** | Named in directive §4.5 as missing from 1.0.0.8. Cannot be confirmed or corrected without the register. |
| 13 | Calibration requirements per component | Controlled instrument register | — | `calibrationRequired` | **No** | `SOURCE_REQUIRED`. |
| 14 | Pre-use / post-use requirements | Controlled instrument register / I01 | — | `preUseRequired`, `postUseRequired` | **No** | `SOURCE_REQUIRED`. |
| 15 | Background requirements per capability | Controlled instrument register | — | `backgroundRequired` at capability and component level | **No** | `SOURCE_REQUIRED`. |
| 16 | Capability set (Gamma Dose Rate, Beta/Gamma, Alpha, EC, Reactor CO₂, Neutron) | Directive §14 | as supplied | `capabilities[]` — **empty** | **No** | The directive lists these as *examples*. The authoritative closed set is unknown. |
| 17 | RWP identities and revisions | RWP set | — | `config/controlled/rwp-config.json` — **empty** | **No** | `SOURCE_REQUIRED`. `R241` BLOCKED. |
| 18 | RWP required capabilities | RWP set | — | `requiredCapabilities[]` | **No** | Drives which capability cards appear (§14) and the §13 conflict warning. |
| 19 | RWP MUST KNOW content | RWP set | — | `mustKnow[]` | **No** | `SOURCE_REQUIRED`. |
| 20 | Alert / action thresholds | Master brief | — | `config/controlled/alert-rules.json` — **empty** | **No** | `SOURCE_REQUIRED`. `R251` BLOCKED. §49 forbids invention. |
| 21 | Threshold equality behaviour | Master brief | — | `atThreshold` per rule; `R253` warns on a silent pass | **No** | Where the document is ambiguous the value must be `ReviewRequired` (§58). |
| 22 | Required follow-up per alert | Master brief / C07 | — | `requiredFollowUp` | **No** | `SOURCE_REQUIRED`. |
| 23 | Which actions may be deferred | Master brief / C07 | — | `deferPermitted` | **No** | `SOURCE_REQUIRED`. |
| 24 | Classification status per area | C07 | — | not modelled | **No** | `SOURCE_REQUIRED`. |
| 25 | Known conditions / hotspots | C07 | — | `knownCondition` on each point | **No** | Current conditions only. Prior routine readings are deliberately not modelled (§52). |
| 26 | R4 entry restriction | C07 | — | not modelled | **No** | C07 does not permit entry to R4 (§51). No interaction suggesting normal survey entry into R4 may be implemented. |
| 27 | Map assets | Approved map set | — | `map.assetId` | **No** | No asset supplied. No geometry invented (§26). |
| 28 | Map hit-area geometry | Approved map set | — | `map.shape` + `coordinates` | **No** | Absent geometry means the point is reachable from the Area References list only, and the map reports the asset as outstanding. |
| 29 | Defective-instrument process text | I01 | — | referenced in §17/§18 UI copy | **No** | `SOURCE_REQUIRED`. |
| 30 | Notification recipients | Not established | — | not modelled | **No** | §49 forbids invention. |
| 31 | Record retention requirements | Not established | — | not modelled | **No** | `SOURCE_REQUIRED`. |
| 32 | Security arrangements / tenant deployment | Not established | — | not modelled | **No** | Outside this cycle. |
| 33 | Technician identity source | Production authentication | — | prototype identity, clearly labelled | **No** | Real identities are not fabricated (§48). Production authentication outstanding. |
| 34 | Application version | Execution directive §5 | 1.0.0.9 | `tests/rules/static-analysis.json`, `tests/rules/expected-package.json`; `R006` and `R104` enforce | **Yes** | Directive-supplied, not a controlled radiological fact. |
| 35 | Canvas geometry 1440 × 960 landscape | Execution directive §3 | as supplied | `tests/rules/expected-package.json`; `R112`–`R114` | **No** | Stated in the directive as an established baseline fact; not independently observed, as the package was not supplied. |
| 36 | Solution / publisher unique name | 1.0.0.8 package | — | `expectedSolutionUniqueName: null` — recorded, not asserted | **No** | Will be captured on first unpack, then pinned so identity drift fails the build (§75). |

---

## 3. How to close an item

1. Obtain the controlling document and note its revision.
2. Populate the relevant file under `config/controlled/`.
3. Set `source.document`, `source.revision`, `source.verified: true`,
   `source.verifiedBy` and `source.verifiedOn` on the record.
4. Run `tests/run_all.sh`. The corresponding check moves from **BLOCKED** to a
   real pass or a real failure.
5. Update this table.

An item is not closed by populating the data. It is closed when a named person
has checked the data against a stated revision.
