# Manual UAT checklist — 1.0.0.9

Static analysis cannot prove Canvas runtime behaviour (§59, §60). This checklist
covers what must be exercised by hand in Power Apps Studio and on a Surface Pro
class device.

**This checklist cannot be executed for 1.0.0.9.** No package was produced — the
1.0.0.8 baseline was not supplied. It is written now so it is ready the moment a
build exists, and so the acceptance standard is agreed before the code is.

**Device:** Surface Pro class. Exercise each item with **stylus**, **gloved
hand** and **bare touch** — §10 requires all three to work.

Record for every item: **Pass / Fail / Blocked / Not applicable**, with the
build SHA-256, tester, date, and a screenshot for any failure.

---

## A. Launch and orientation

| # | Check | Expect |
|---|---|---|
| A1 | Cold launch | Home appears without an error banner or an empty flash |
| A2 | App bar | Application identity, current survey, technician, sync state, workflow state — and nothing crowding them (§9) |
| A3 | Version | About/diagnostics shows **1.0.0.9**, and no screen anywhere shows 1.0.0.4–1.0.0.8 as current (§5) |
| A4 | Home answers the six questions | What survey; what sections are due; what state; can I resume; what next; am I synced (§12) |
| A5 | Outstanding actions | Visible from Home without hunting |
| A6 | Due survey card | Month, date, sections due, status, progress, one obvious primary action |
| A7 | Resume | With a survey in progress, **RESUME SURVEY** is unmistakable (§12) |
| A8 | Not a button wall | Home reads as a dashboard, not rows of generic buttons |

## B. RWP

| # | Check | Expect |
|---|---|---|
| B1 | Selection | Controlled list; free text is impossible |
| B2 | Revision | Displayed with the RWP (§13) |
| B3 | MUST KNOW | Concise structured cards — not a wall of paragraphs |
| B4 | Confirmation | Explicit; cannot be skipped |
| B5 | Capability conflict | Selecting an RWP that does not cover a capability the survey needs raises a clear warning (§13) |
| B6 | Back | Returns to Home with no data loss |

## C. Instrument issue — the principal feature

| # | Check | Expect |
|---|---|---|
| C1 | Required capabilities only | Exactly the capabilities this survey/RWP requires; no others (§14) |
| C2 | Card per capability | Each is a clear card or gallery row (§15) |
| C3 | System selection | Selector lists only systems that can satisfy that capability |
| C4 | Primary component | Model, serial, calibration due, pre-use — each its own field (§15) |
| C5 | Paired component | Probe/detector shows its **own** model, serial, calibration due, pre-use. Not concatenated into one string (§15) |
| C6 | **Independent paired state** | Fail the probe's pre-use but not the ratemeter's. The probe shows failed; the ratemeter does not. **This is defect 4.3** (§4.3) |
| C7 | **Cross-record check** | With several capabilities assigned, change calibration on one. **No other card's status changes.** This is defects 4.1 and 4.2 |
| C8 | Status wording | One of: Not selected / Details incomplete / Valid / Calibration expired / Pre-use failed / Background required / Invalid capability (§16) |
| C9 | Status is not colour alone | Every status shows a glyph and text as well as colour (§16) |
| C10 | Calibration label | Reads **CALIBRATION DUE**. The words "cal current" appear nowhere (§17) |
| C11 | Expired calibration | Prominent red state **and** explicit text: *"Calibration expired — instrument cannot be used. Follow I01 defective-instrument process."* Not merely a red border (§17) |
| C12 | Expired blocks start | An expired required instrument prevents Start Survey (§17) |
| C13 | Missing calibration | Reads as incomplete, distinct from expired |
| C14 | Pre-use controls | Large, obviously tappable PASS / FAIL. Test gloved (§18) |
| C15 | Pre-use fail | That system stops satisfying the capability, an auditable event is created, the technician is told what to do, and replacement is offered (§18) |
| C16 | Never blocked by failed kit | A technician can always proceed to replace (§18) |
| C17 | Background where required only | Requested only where required; irrelevant background fields never appear (§19) |
| C18 | Background fields | Numeric input, unit, the instrument/capability it belongs to, immediate validation (§19) |
| C19 | **Backgrounds do not merge** | Enter different Alpha, Beta/Gamma and EC backgrounds. All three persist independently (§4.8) |
| C20 | Summary | "*n* OF *m* REQUIRED CAPABILITIES READY" at the bottom (§20) |
| C21 | Named blocker | The summary names the exact blocker, e.g. *"EC capability has no valid instrument assigned"* (§20) |
| C22 | Continue explains itself | Disabled CONTINUE / START SURVEY states **why** (§21) |
| C23 | Ready is obvious | With everything valid, readiness to proceed is visually unmistakable (§21) |
| C24 | Not a trapping modal | Instrument Issue is a full screen with a working back route (§43) |

## D. Add and replace instrument

| # | Check | Expect |
|---|---|---|
| D1 | ADD INSTRUMENT is obvious | Reachable during a survey (§23) |
| D2 | Add flow | Capability → system → component details → checks/background |
| D3 | **Add does not overwrite** | The earlier instrument stays in the active set (§23) |
| D4 | REPLACE INSTRUMENT is distinct | Visibly a different operation from Add (§4.7) |
| D5 | Reason mandatory | Replace cannot proceed without one (§24) |
| D6 | Old assignment preserved | Retained with its interval closed, not deleted (§24) |
| D7 | Replacement validated | Same calibration/pre-use/background checks as a fresh assignment |
| D8 | **Reading association** | Readings taken before the swap stay with the old assignment; readings after attach to the new one (§24) |
| D9 | Nothing destroyed | Full replacement history is inspectable afterwards |
| D10 | Audit | Instrument replaced, reason, timestamp, technician, segment all recorded (§48) |

## E. Map and area references

| # | Check | Expect |
|---|---|---|
| E1 | Approved assets only | No invented geometry anywhere (§26) |
| E2 | Point states legible | Not due / due / in progress / complete / outstanding action / not surveyed / known condition, each instantly readable (§26) |
| E3 | Not colour alone | Symbols or text carry state too (§26) |
| E4 | Hazard indicator separate | Known condition is distinct from the status ramp (§26) |
| E5 | Both routes open the same point | Map and Area References reach the identical logical location (§27) |
| E6 | State matches across views | Identical in both (§27) |
| E7 | Area References quality | Large-row gallery, not a cramped table (§27) |
| E8 | Missing map asset | Point stays reachable from the list; the map reports the asset as outstanding. No placeholder geometry (§50) |
| E9 | Point 33 | Selectable positions come only from configuration. No fictional pipework (§50) |
| E10 | **R4** | No interaction anywhere suggests normal survey entry into R4 (§51) |

## F. Measurement entry

| # | Check | Expect |
|---|---|---|
| F1 | Only required fields | Exactly the measurements for that point and that due section (§28) |
| F2 | Task-led | Reads as a task, not a reproduction of the paper checksheet (§28) |
| F3 | Clear sections | Dose rate / contamination / wipe grouped and headed (§28) |
| F4 | Numeric prominence | Large, high contrast, easy to tap (§29) |
| F5 | Units always visible | Beside each input — never inferred from a heading rows away (§29) |
| F6 | Immediate validation | On entry, not on submit |
| F7 | **No prior readings** | Previous routine measurement values are shown nowhere during the survey (§52) |
| F8 | Known condition allowed | Current hotspot/elevated condition information may be shown (§52) |
| F9 | **No background subtraction** | Raw reading and background are stored and displayed separately. Nothing nets them (§53) |
| F10 | Wipe mapping | Exact map position can be recorded per wipe |

## G. Validation UX

| # | Check | Expect |
|---|---|---|
| G1 | Exact field highlighted | Not the whole form (§30) |
| G2 | Exact explanation | *"Point 10 — Maximum β/γ reading is required"*, not "Please complete all fields" (§30) |
| G3 | Wipe message | *"Wipe 3 — exact map position is required"* (§30) |
| G4 | Valid input preserved | Nothing else is cleared (§30) |
| G5 | Focus moves to the blocker | Scroll/focus where practical (§30) |

## H. Alerts, deferral and entry error

| # | Check | Expect |
|---|---|---|
| H1 | Alert presentation | Prominent, professional, not theatrical (§31) |
| H2 | Alert content | Trigger, reading, rule, required follow-up, choices (§31) |
| H3 | ACTION NOW / DEFER | Offered where permitted (§31) |
| H4 | Deferred stays outstanding | Visibly outstanding afterwards (§31) |
| H5 | Boundary — below | No alert below threshold |
| H6 | **Boundary — exactly at** | Behaves as configured. Where the controlling document is ambiguous: **REVIEW REQUIRED**, never a silent pass (§58) |
| H7 | Boundary — above | Alert raised |
| H8 | CLEAR AS ENTRY ERROR | Explicit action with confirmation (§32) |
| H9 | Entry error effect | Bad value removed; alert closed **as entry-error cancellation**, not as a radiological resolution; audit retained; reading must be re-entered (§32) |
| H10 | No silent overwrite | The original abnormal event cannot be overwritten without audit (§32) |

## I. Point completion and progress

| # | Check | Expect |
|---|---|---|
| I1 | Disposition obvious | Complete / Not Surveyed / In Progress (§33) |
| I2 | Not Surveyed requires reason | Reason, comment where required, review flag (§33) |
| I3 | Counting is clear | The technician always knows whether a point counts toward completion (§33) |
| I4 | Progress view | "18 / 22 DUE LOCATIONS ACCOUNTED FOR" plus a breakdown (§34) |
| I5 | Due points only | Not-due points remain visible but do not count against completion (§34) |

## J. Handover

| # | Check | Expect |
|---|---|---|
| J1 | COMPLETE MY PART / HAND OVER | Present and clear (§35) |
| J2 | Handover summary | Technician, segment, completed, outstanding, open actions, instruments used, note (§35) |
| J3 | Resume without ambiguity | The next technician continues the same survey (§35) |
| J4 | **Separate instrument set** | The incoming technician's instruments are recorded separately (§35) |
| J5 | Readings stay attributed | Earlier readings remain with the earlier segment |

## K. Post-use and technician complete

| # | Check | Expect |
|---|---|---|
| K1 | Post-use required | Every applicable active instrument/component gets its post-use check before Technician Complete (§25) |
| K2 | Per-component post-use | Primary and probe checked independently (§4.3) |
| K3 | **Post-use failure persists** | Remains an explicit review exception (§25) |
| K4 | **No auto-resolve** | The failure does **not** create an already-resolved record. **This is defect 4.4** (§4.4) |
| K5 | Readings preserved | A post-use failure deletes or invalidates nothing (§25) |
| K6 | Explicit disposition | Required, and recorded |
| K7 | Visible to TL review | The exception reaches review (§25) |
| K8 | Readiness dashboard | Blockers grouped by category, not one long checklist (§36) |
| K9 | Direct links | Each blocker links straight to it (§36) |
| K10 | Gate | TECHNICIAN COMPLETE enables only when controlled requirements are met (§36) |

## L. Offline and sync

| # | Check | Expect |
|---|---|---|
| L1 | States separate | Workflow state and sync state are never merged (§37) |
| L2 | Both at once | A survey can be Technician Complete **and** Pending Sync (§37) |
| L3 | Sync indicator | Saved locally / Pending sync / Syncing / Synced / Sync error — clear but unobtrusive (§37) |
| L4 | **No false persistence** | Nothing implies data is server-saved while offline (§37) |
| L5 | Airplane mode | Entry continues; state is honest |
| L6 | Close and reopen | In-progress survey resumes with no data loss |

*Production Dataverse mobile offline cannot be tested at prototype stage (§61).*

## M. Error handling and state

| # | Check | Expect |
|---|---|---|
| M1 | Back works everywhere | Every screen (§47) |
| M2 | Cancel works where safe | (§47) |
| M3 | No dead ends | Invalid state always explains itself (§47) |
| M4 | Never trapped | No overlay traps the user (§43, §47) |
| M5 | Data preserved | Entered data survives navigation (§47) |
| M6 | Double-tap safe | Duplicate taps do not create duplicate records (§47) |
| M7 | Z-order | No invisible control intercepts taps; no button sits behind an overlay (§43) |
| M8 | Modal dismissal | Every modal has a visible close/back route (§43) |
| M9 | Invalid transitions blocked | Workflow states cannot be entered out of order (§38) |

## N. Visual quality gate (§72)

Walk every technician-facing view and answer:

| # | Question |
|---|---|
| N1 | Does it look deliberately designed? |
| N2 | Is alignment exact? |
| N3 | Are cards consistent? |
| N4 | Are fields consistent? |
| N5 | Is spacing consistent? |
| N6 | Is typography coherent? |
| N7 | Are buttons consistent? |
| N8 | Is the main action obvious? |
| N9 | Is anything visibly cramped? |
| N10 | Is anything obviously default Power Apps styling? |
| N11 | Are disabled states clear? |
| N12 | Are warnings professional rather than theatrical? |
| N13 | Is important information prioritised? |
| N14 | Could a technician use this quickly while standing in plant? |
| N15 | Does it look like software worth putting in front of EDF stakeholders? |

## O. Accessibility and operational readability (§45)

| # | Check | Expect |
|---|---|---|
| O1 | Text contrast | Strong throughout, on-device, in plant lighting |
| O2 | Status not colour alone | Verified on every status indicator |
| O3 | Labels | Every interactive control is clearly labelled |
| O4 | Touch targets | Nothing below 48px; verified gloved |
| O5 | Disabled state | Obvious |
| O6 | Stylus | Sensible behaviour |
| O7 | Text size | Readable at arm's length on the device |

## P. Studio checks

| # | Check | Expect |
|---|---|---|
| P1 | Import | Solution imports without error |
| P2 | Open | App opens in Studio |
| P3 | App Checker | Reviewed. **Zero errors is not evidence of correctness** (§3) — record what it says, then test behaviour |
| P4 | Performance | No screen stalls on open |
| P5 | Control count | No screen over the §4.9 budget |

## Q. Review workflow

| # | Check | Expect |
|---|---|---|
| Q1 | State placeholders | Review states exist and are reachable per the state machine |
| Q2 | Post-use exceptions visible | A post-use failure appears in TL review (§25) |
| Q3 | Return to technician | Requires a reason |

---

## Sign-off

| Field | |
|---|---|
| Build SHA-256 | |
| Tested by | |
| Date | |
| Device | |
| Pass / Fail / Blocked counts | |
| Defects raised | |

A UAT run is not complete while any item is **Blocked**. Record what blocked it
and what is needed to unblock it.
