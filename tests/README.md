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
| `R014` | sibling controls whose rectangles partially overlap (header/nav collision class) |
| `R015` | a control positioned outside the declared canvas |
| `R016` | interactive control below the minimum touch target (§12) |
| `R017` | a screen with no unconditionally visible control — it can render blank |
| `R018` | a variable or collection that is read but never written anywhere |
| `R019` | a record field read under a name no write to that collection supplies |
| `R020` | geometry coverage — how many controls the geometry rules could actually check |
| `R1xx` | package integrity, solution/app identity, version, canvas geometry, XML validity |
| `R2xx` | configuration conformance, month schedule, point register, instrument register, RWP config, alert boundaries |

## The runtime-defect analysers

`tests/validators/rules_runtime.py` covers the two defect classes that made
1.1.0.5 look unfinished in Power Apps Studio. Both are decidable from source:

| Observed in Studio | Class | Rules |
|---|---|---|
| Survey Plan header — nav buttons crowding each other and the status text | controls occupying the same pixels, or leaving the canvas | `R014`, `R015`, `R016` |
| Sign Out Instrument — blank page, only CANCEL visible | every control gated on state that is never written | `R017`, `R018`, `R019` |

`R020` is the honesty check. A control positioned by a formula referencing
`Parent` or another control is **not** evaluable statically, so it is not
checked — and `R020` says how many. A silent `R014` is not a verified layout.

## Fixtures

`tests/fixtures/defective/` reproduces the shape of every confirmed defect.
`tests/fixtures/clean/` is its corrected counterpart and must stay silent; it
also serves as the reference shape for the 1.0.0.9 capability card, where every
row reads `ThisItem` and no formula looks an instrument up by literal key.

`tests/fixtures/runtime-defective/` and `tests/fixtures/runtime-clean/` do the
same for the two Studio-confirmed runtime defects. The clean fixture is the
reference shape for the header band (44–48 px row, 16 px gutters, content
starting clear of it) and for any screen whose content is conditional: the
heading and the exit route are always visible, and an explicit message explains
why the rest is absent.
