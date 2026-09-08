# Changelog — 1.0.0.9

**Build status:** no application package produced. The 1.0.0.8 baseline artefact
was not supplied to this build — see `BASELINE_REPORT.md`. Everything below is
repository content: toolchain, validation suite, configuration contracts and
design/architecture specifications.

---

## Added

**Toolchain** (§64, §76)
- `tools/bootstrap.sh` — pinned, reproducible acquisition of .NET 10.0.0 and
  Power Platform CLI 2.11.2, both verified running on linux-x64.
- `tools/pac` — wrapper so callers need not know where the toolchain lives.
- `tools/unpack.sh` — solution ZIP → `source-working/solution` + `canvas`, with
  integrity checks and a SHA-256 manifest. Never modifies the input.
- `tools/pack.sh` — sources → `.msapp` → solution ZIP, stamping the version.
  Re-extracts and re-unpacks its own output before reporting success.

**Validation suite** (§54–§58) — 76 tests
- `R001` cross-record instrument state, in three shapes covering defects
  4.1, 4.2 and 4.3 as one class.
- `R002` failure alerts created already resolved (4.4).
- `R003`–`R006` stale control references, duplicate control names, forbidden
  legacy references, superseded version literals.
- `R008` automatic background subtraction (§53).
- `R009` history used as capability authority (4.6).
- `R011`–`R013` screen control-count budget, hidden controls still evaluating,
  hard-coded RWP branching.
- `R1xx` package integrity, solution identity, version, managed flag, canvas
  geometry, XML validity.
- `R2xx` configuration conformance, month schedule, point register, instrument
  register, RWP config, alert boundaries.
- `R3xx` design tokens: WCAG contrast ratios, touch targets, type-size floor,
  status-not-colour-alone.
- Paired `defective` / `clean` fixtures. The clean fixture is also the reference
  shape for the redesigned capability card.

**Configuration contracts** (§22, §39–§41, §55)
- JSON Schemas for the point register, component-aware instrument register, RWP
  config, alert rules and the active instrument assignment record.
- `config/schemas/controlled-source.schema.json` — every controlled fact carries
  provenance and a `verified` flag.
- `config/survey-schedule.json` — the month schedule from §56, asserted month by
  month.

**Design system** (§8, §45)
- `design/tokens.json` — single source of truth for colour, spacing, radius,
  elevation, sizing, typography, status styles and sync styles.
- `design/emit_powerfx.py` — renders tokens as Power Fx named formulas for
  `App.Formulas`; `--check` fails a stale generated file.
- Contrast, touch-target and type-size floors are **measured** by the suite, not
  asserted in prose.

**Documentation**
- `BASELINE_REPORT.md`, `ARCHITECTURE_1_0_0_9.md`, `DATA_MODEL_1_0_0_9.md`,
  `VALIDATION_REPORT_1_0_0_9.md`, `CONTROLLED_SOURCE_MATRIX.md`,
  `KNOWN_LIMITATIONS.md`, `UAT_CHECKLIST_1_0_0_9.md`.

---

## Changed

- Version presentation is normalised on a single authoritative value, `1.0.0.9`
  (§5). `R006` fails any build presenting `1.0.0.4`–`1.0.0.8` as current.
- Calibration is specified as **CALIBRATION DUE** throughout; "cal current" is a
  forbidden reference (§17).

---

## Fixed

Nothing. No defect has been fixed, because the code containing the defects was
not supplied. Detectors exist for each and are proven against fixtures — see the
defect table in `BASELINE_REPORT.md` §5.

---

## Removed

Nothing. There was no prior repository content to remove.

---

## Refactored

Nothing. There was no application source to refactor.

---

## Breaking internal architectural changes (proposed, not applied)

These are specified in `ARCHITECTURE_1_0_0_9.md` and `DATA_MODEL_1_0_0_9.md`
and will break 1.0.0.8 internals when applied:

- **`varView` pseudo-navigation is removed** in favour of one physical screen
  per workflow step. Every formula reading `varView` changes.
- **Instrument records are no longer addressed by literal key.** Capability
  cards become a gallery over the active assignment set, where every property
  reads `ThisItem`. This is what makes defects 4.1–4.3 structurally impossible.
- **`colInstruments` is replaced** by `colInstrumentRegister` (definitions) and
  `colActiveInstruments` (assignments). Only the latter is authoritative for
  current capability coverage (§4.6).
- **Instrument systems become component-aware.** Paired metadata moves out of
  concatenated strings into separate component records (§4.5, §15).
- **Add and Replace become distinct operations** with different records
  (§4.7).
- **Background moves to per-component, per-capability records** and can no
  longer collapse across capabilities (§4.8).
- **Alerts gain an explicit `dispositionId`** and can never be created resolved
  (§4.4).

---

## Known limitations

See `KNOWN_LIMITATIONS.md`. In summary: no application package was produced; no
Power Apps Studio verification was performed; no controlled register has been
imported; production Dataverse offline remains unproven.
