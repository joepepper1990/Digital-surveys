# Validation suite

```bash
pip install -r tests/requirements.txt
tests/run_all.sh                       # self-tests, then the suite
python3 tests/run_all.py --package outputs/<solution>.zip
```

## What the suite is for

`tests/run_all.py` reports four outcomes, and they mean different things:

| Outcome | Meaning |
|---|---|
| **ERROR** | The build should not be released. |
| **WARNING** | A human must decide. |
| **BLOCKED** | The check could **not run** because a controlled source was not supplied. **A blocked check is not a pass** (directive §68, §77). |
| **INFO** | Recorded for the build record; no judgement. |

Nothing here proves Canvas runtime behaviour. `STUDIO VERIFICATION REQUIRED`
applies to every build regardless of the result (§60).

## The analysers

`tests/validators/rules_static.py` looks for the *shape* of a defect, not for
specific known formulas. Defects 4.1, 4.2 and 4.3 in the directive are three
instances of one class — a control presenting instrument X while deriving its
state from instrument Y — so `R001` detects that class in three forms:

| Rule | Shape |
|---|---|
| `R001/A` | one control reads state fields for two or more instrument records |
| `R001/B` | the display property reads one record, the colour property another |
| `R001/C` | a paired-component field is displayed, the primary component's counterpart drives state |

`tests/test_static_rules.py` proves this by asserting `R001` also fires on an
Alpha/ReactorCO₂ pair that appears nowhere in the directive, and that a
documented exception in `tests/rules/static-analysis.json` suppresses it.

| Rule | Checks |
|---|---|
| `R002` | a failure alert created with `Status="Resolved"` (§4.4) |
| `R003` | formula references a control that does not exist |
| `R004` | duplicate control name |
| `R005` | forbidden legacy references — fingerprint workflow, un-numbered rows, "cal current" |
| `R006` | superseded version literal presented as current (§5) |
| `R008` | automatic background subtraction (§53) |
| `R009` | capability coverage derived from history/audit data (§4.6) |
| `R011` | screen control-count budget (§4.9) |
| `R012` | hidden control still carrying live formulas (§42) |
| `R013` | RWP branched inside a control formula (§41) |
| `R1xx` | package integrity, solution/app identity, version, canvas geometry, XML validity |
| `R2xx` | configuration conformance, month schedule, point register, instrument register, RWP config, alert boundaries |

## Fixtures

`tests/fixtures/defective/` reproduces the shape of every confirmed defect.
`tests/fixtures/clean/` is its corrected counterpart and must stay silent; it
also serves as the reference shape for the 1.0.0.9 capability card, where every
row reads `ThisItem` and no formula looks an instrument up by literal key.
