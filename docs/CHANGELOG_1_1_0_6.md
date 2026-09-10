# Changelog — 1.1.0.6

**Cycle:** 1.1.0.5 → 1.1.0.6
**Incoming:** `ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip`
SHA-256 `1485ec3c20d9def9b2039c58c72c06d2f6277ccdd38a00aedae725fd9299e92a` (verified)
**Delivered:** `ESGDigitalRadiologicalSurveys_1_1_0_6_FINAL_UNMANAGED.zip`
SHA-256 `d5665c6c364a9f303252f87a46833562140eced3c1151cc44604884cb8f1c71c`, 1,907,832 bytes

This is a presentation-only release. Every one of its 228 property changes is
geometry, paint order, colour, alignment or label text. **No behaviour or data
property changed at all** — `tools/diff_controls.py` reports zero differences
across every `OnSelect`, `OnVisible`, `OnChange`, `Default`, `Items` and
`Reset` in the app, and the control tree is the same 763 controls with none
added, removed or renamed.

---

## The two defects confirmed in Studio

### A. Sign Out Instrument rendered blank — one root cause, eight views

`pnlInstrumentEdit` is a 1440×960 opaque backdrop carrying `ZIndex: =900`,
while the entire sign-out form sits at ZIndex 552–602. Higher ZIndex paints on
top, so the panel covered its own form. Only `lblInstrumentEditTitle` (901) and
`btnDraftCancel` (999) are above it — exactly the two controls the screenshot
shows.

The app's convention is backdrop at `N*100` with content from `N*100+1`
upward, and eleven views follow it. Eight did not, hiding **78 controls**:

| View | Backdrop | Was | Now | Controls restored |
|---|---|---|---|---|
| InstrumentEdit | `pnlInstrumentEdit` | 900 | 551 | 26 — the whole sign-out form |
| InstrumentReturns | `pnlInstrumentReturns` | 900 | 551 | 22 — the whole post-use view |
| NumericEntry | `pnlNumericEntry` | 900 | 551 | 16 — the whole numeric keypad |
| InstrumentChoice | `pnlInstrumentChoice` | 900 | 601 | 6 — the multi-instrument chooser |
| Handover | `pnlHandover` | 1400 | 515 | 5 — validation, complete, back, note |
| InstrumentRequired | `pnlInstrumentRequired` | 900 | 601 | 1 — the ADD INSTRUMENT call to action |
| Home | `pnlHome` | 100 | — | 1 — NEW SURVEY (`btnNewSurvey` given ZIndex 109) |
| Submitted | `pnlSubmitted` | 1450 | — | 1 — SEND FOR TL REVIEW (`btnSendForTLReview` given ZIndex 1455) |

The keypad, the post-use checks, the chooser, NEW SURVEY and SEND FOR TEAM
LEADER REVIEW were all unreachable for the same reason as the sign-out form.
None of these was in the brief.

### B. Survey Plan header overlap

The Map view has no header-bar control: the navy bar is baked into the
background artwork at Y 0–84 (measured from `mediaMapBasement`, a 1440×960
PNG). The navigation row sat at Y 62–108, hanging 23 px below the bar onto the
light background it was styled for — its 12 %-white fill only reads on navy —
and collided with `lblLevelHint` at Y 100.

Rebuilt to the bands the artwork dictates:

* **Navy bar, Y 0–84.** Title at X 30 (was 34); four navigation buttons, each
  170×48 on a 10 px gutter, right-aligned to the artwork's 1410 margin.
* **Free strip, Y 85–164.** Level tabs left; the progress readout and three
  status lines right, all sharing one left edge and one width.
* **Content, Y 165+.** The baked SURVEY PLAN and AREA REFERENCES panels.

Also in the header:

* `btnMapSummary` was styled for a light background (solid white fill, navy
  text) while its three siblings were navy-bar buttons, and sat in a different
  ZIndex band. It now matches its row.
* `INSTRUMENTS / CHANGE` was clipped at every width that fits the row; it now
  reads `INSTRUMENTS`.
* `lblMapLegend` (Y 148–170) and `lblMapNotice` (Y 155–179) both overhung the
  baked panel edge at 165 and overlapped each other by 550×15 px whenever a
  validation message was present. They now share one slot, and the colour key
  stands down while a message needing action is showing.
* The three status lines had three alignments and three right edges (1010,
  990, 1190). Now one left edge, one width.

---

## Defects found independently

**Blank or unusable views** — the seven other instances of defect A above.

**Numeric keypad.** Beyond being covered: the key grid centred on 670 while
the title and footer centred on 720 and the value row on 740. Everything now
sits in one centred column, X 220–1220, with 300 px keys. `numClear` had no
border and a hover fill that turned it **the same green as DONE** — a
misleading affordance on a destructive action; it now matches CANCEL.

**Seven controls had no explicit Width or Height**, falling back to a template
default not visible in the source — among them the Instruments page's
AVAILABLE NOW capability strip, which is also why the geometry rules could not
check it. Six were given explicit sizes; three of those equalled the label
template's own default of 40, which pac strips, and are now reported as
implicit-by-default rather than unknown.

**Wipe view: three orphaned unit labels.** Every pre-decon field places its
unit at `valX+190, valY+12`. The post-decon values had moved to X 505 but
their units stayed at X 810, sitting 100–110 px above the field they label.
The sample-position instruction (≈150 characters) was also in a 520×48 box
that ran 8 px into the position grid.

**Entry view.** The point-header stack overlapped itself at every join (1 px,
5 px, 3 px) and ran 22 px into the first field label. `valDose05m` sat 55 px
above its own label, inverting the label-above-value pattern every other field
uses — its unit label at Y 487 was already positioned for the corrected Y 475.

**Alert view.** `btnAlertEntryError` hung 15 px below the modal panel's bottom
edge; the panel now contains its own action row.

**Detail view.** `btnOpen33` was 310 px wide where its two siblings in the same
slot are 280, so on point 33 it ran 10 px under NOT SURVEYED. The info stack
had three right edges (1350 / 1420 / 1220).

**Map markers.** The six known-condition ☢ badges each sat at a different
offset from their marker (dx 9/3/9/5/4/−9, dy 24/6/−15/4/15/15). Now one rule:
top-right corner at `markerRight−8, markerY−12`. Point 7a is the documented
exception — hemmed in by markers 6, 7 and 21, its badge sits directly above its
own marker.

**Ragged content edges** in Detail, Handover, Point 32, Point 33, Setup, Alert
Action, Entry, RWP Select, Home (a 2 px offset on the Home subtitle), Summary,
the instrument picker (CANCEL 5 px off the grid), the chooser (title on a
different column, BACK dangling on its own footer row) and post-use returns
(four left edges, four right edges).

**Text-entry keyboard.** Every row centred on 720 except the CLEAR/punctuation
row, which stopped at 1100 and centred on 630.

**Two forbidden legacy strings.** The level hint named the decanting pump
without its number, against the point register's "Active Effluent Decanting
Pump 21" (§42); and a retired, permanently invisible column header still
carried "CAL CURRENT", which §17 forbids. The header is kept — controls are not
deleted for tidiness before a release — but its text is cleared.

**`btnDraftBGCO2` was disabled with `&& false`** while still naming a view,
which reads as a mistake rather than a decision. It now uses the app's own
idiom for a retired control, `Visible: =false`. CO₂ background at issue is
deliberately not captured: GMI VISA is the only register row with `CanCO2`, and
the on-screen notice explains it.

---

## Retired code: proven inert, not fixed

1.1.0.5 still carries the controls of the superseded single-instrument
architecture, every one hard-coded `Visible: =false`. They reproduce the
1.0.0.8 defect shapes faithfully — `btnPostFloor` really does colour itself
from the Neutron record, four `btnPost*` handlers really do create a failure
alert already `Resolved`, and seven `btnI*` handlers really do
`Patch(colInstruments, LookUp(..., Key=varInstrumentKey), …)` with a variable
nothing ever writes, which would create a spurious record.

An invisible control receives no taps and renders nothing, so none of this can
run. Per §18 the controls are left in place and the analysers now say so: such
findings are re-flagged `[retired]` at WARNING with the reachability proof
attached, instead of sitting at ERROR beside live defects.

---

## Analyser changes

Added `tests/validators/powerfx.py` — a three-valued Power Fx evaluator — and
`tests/validators/rules_view.py`, the view-state-aware geometry rules. The
1.1.0.5 defects were invisible to coordinate checks because the interesting
formulas are conditional; these bind `varView` and evaluate.

| Rule | |
|---|---|
| `R021` | control hidden behind an opaque control that paints over it |
| `R022` | two controls that can be visible together and overlap |
| `R023` | control leaving the canvas in a view where it is visible |
| `R024` | control whose Visible is false in every view |
| `R025` | view with nothing certain to be visible |
| `R026` | touch target below 48 px (an OnSelect on a label, not a Button template) |
| `R027` | per-view coverage — what could not be checked |
| `R028` | non-wrapping label whose literal text exceeds its width |
| `R029` | records that the state-free geometry rules stood aside, and why |
| `R030` | visible control with no explicit Width or Height |

Three existing rules were **tightened after proving the assertion wrong**, each
with red/green tests pinning both halves:

* `R009` matched `colAudit` against `colAuditLog` by substring, and counted any
  coverage function co-present with the word "required". No collection named
  `colAudit` exists; `colAuditLog` is written 52 times and read once, by the
  Team Leader card counting entry-error corrections. It now requires the
  history collection to be the *queried source*. 10 findings → 1.
* `R002` flagged `Patch(colAlerts, …, {Status:"Resolved"})` — closing an alert
  whose condition has cleared, which is the intended mechanism, 22 times — and
  the schema seed row that the same expression removes. It now distinguishes
  creating an alert from closing one. 16 findings → 4, all real.
* `R012` counted a base64 map image in a hidden label's `Text` as live logic.
  A single string constant evaluates nothing. 120 findings → 80.

`R014` now stands aside on a view-driven app rather than reporting 7,099
cross-view pairs, and `powerfx.can_coexist` decides mutual exclusivity by
searching for a satisfying assignment, so provably-disjoint pairs stay silent
without being suppressed. Two documented exceptions carry their evidence: the
marker/badge overlap, and the CO₂ notice against the gamma/beta/EC inputs
(verified against all 27 register rows).

Suite: **114 tests, all passing** (was 76). Against the delivered payload:
0 errors, 91 warnings, 4 blocked, 6 info.

## Tooling added

| | |
|---|---|
| `tools/edit_fx.py` | surgical property edits on the 3 MB screen source, with readback verification |
| `tools/render_views.py` | draws each view from real geometry to HTML for visual inspection |
| `tools/verify_package.py` | 37 structural checks against the delivered ZIP, not the source tree |
| `tools/diff_controls.py` | property-by-property control-tree diff between two packages |
| `tools/stamp_version.py` | byte-preserving version stamp |

`tools/pack.sh` was corrected: it packed with `--layout SourceCode`, which
cannot represent this app — `Src/scrSurveyMain.pa.yaml` is a documented stub and
the authoritative control tree is `Controls/4.json`. Only the Experimental
layout round-trips it, proven byte-identical before any edit was made.
