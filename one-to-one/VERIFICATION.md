# ESG 1-to-1 — verification record (19-Oct-2026)

**Scope:** frontend **v5.1.0**, solution **1.5.0.1** (1.5.0.0 with Flow 1 restructured to Power Automate's 8 nesting levels – `04-solution/REPAIR_1_5_0_1.md`), the importable solution (setup flow + Flows 1–6 and 8–11), the one-time reset tool (1.1.0), the legacy-package builder, the eleven-list schema and all documents. Earlier rounds (§3–§3d) are kept as the record for 4.x / 1.3 / 1.4; the 1.5 checks are in §3e and `TEST_REPORT_1_5.md`.

**What this record can and can't prove.** Everything here ran outside your tenant. It proves the files are well-formed, internally consistent and behave as specified against a strict model of SharePoint that follows Microsoft's documentation. Only the tenant can prove the import and real permissions (§5).

## 1. Automated checks — all passing

| Check | How | Result |
|---|---|---|
| Frontend | `02-frontend`: `node tools/build-mock.js && node test/run-tests.js` (headless Chromium against the local mock) | **319 / 319** |
| Action tracker (1.5) | `02-frontend`: `node test/run-action-tests.js` | **108 / 108** |
| Reset tool | `02-frontend`: `node test/run-reset-tests.js` | **45 / 45** |
| Solution build | `04-solution/tools/build.py`: generate `src/`, validate, pack with Microsoft's Power Platform CLI, unpack again and compare | Packs; round trip identical |
| Static validator | Expressions, references, scopes, run-after chains, required connector parameters, list/column names, JSON request bodies, field XML / view CAML, schedule time zone, secured run history, no hidden failures; 1.4: REST MERGE (not connector writes) for columns added after their list was created, no `secureData` on variables | 11 flows clean (0–6, 8–11); every action within Power Automate's 8 nesting levels (deepest: Flow 1 at 8) |
| Validator proof | `tools/test_validate.py`: deliberately broken copies of the flows (including nesting deeper than 8 levels and over 500 actions) | **42 / 42** caught |
| End-to-end simulation | `tools/simulate.py`: the real flow JSON executed against an in-memory SharePoint | **298 / 298** (solution) and **298 / 298** (legacy form) |
| Simulation proof | New scenarios run against the previously committed flows / frontend | 18 flow checks and 2 frontend checks fail on the old code, so the tests detect the bugs fixed in §3. Second review (§3a): 7 new flow checks fail on the 1.1.1.0 flows, and the new frontend checks fail on 4.2.1 (privacy ×3, robustness – the run then stops because the old profile page crashes) |
| Package check | `tools/check_package.py`: the packed zip against the validated source and the previous package | Identical flows; within 8 levels / 500 actions; same IDs, connections, variables, triggers; 1.5.0.0 zip unchanged |
| Legacy builder | `tools/test_builder.js` + `check_builder_zips.py` | Rejects bad input; no network requests; zips are standard and exactly as expected |
| Microsoft schema | Flow definitions checked against Microsoft's published workflow-definition JSON schema | No error class that real exported Microsoft (PnP) flows don't also produce |
| Determinism | Rebuild twice; compare `src/`, the builder page and the zip's flow JSON | Identical |
| Hygiene | Link check across all `.md`; sweep for tenant hosts, real emails, organisation names; S1–S5 code rules | Clean |

## 2. Independent reviews

Three separate reviewers re-read the work against the specifications, without seeing each other's results:

- **A. Flows against the build sheets, email templates and plan D.4 / D.7 / F.** Verified the logic step for step: identity from the trusted record, permissions applied before any link email, idempotency, and emails without answers or feedback.
- **B. Frontend ↔ lists ↔ flows data contract.** Covered every column, choice value (including the em dash), JSON shape, date format and permission. No blockers.
- **C. Every SharePoint / Power Automate behaviour the flows rely on, against Microsoft documentation.** Most were confirmed. Each defect found is in §3.

## 3. Defects found and fixed

| # | Defect | Severity | Fix | Test that now covers it |
|---|---|---|---|---|
| 1 | SharePoint Number columns return as doubles (`12.0`). Flow 1 failed every technician from day 2 of each month; Flow 3 addressed `items(12.0)`. | Blocker | Whole-number conversion everywhere `ReviewItemId` is used | Simulation: the fake returns doubles and variables are type-checked |
| 2 | Setup sent `ViewQuery` to `views/add`; the property is `Query`. No views would have been created. | High | Renamed | Fake rejects `ViewQuery` |
| 3 | A step that runs after *any* outcome, including Skipped, hid real failures. Setup could report success while a list kept the site's permissions. | High | Tolerant steps never run after Skipped | Simulation: refused permission step → run fails and emails the TL; validator rule plus mutation |
| 4 | "Warn and carry on" steps would still fail the run: Logic Apps scores a branch ending in a Skipped step by its predecessor. | High | Join step after each log/warn pair; simulator follows the documented rule | Simulation: refused column → warning, run succeeds |
| 5 | SharePoint triggers of Flows 2 and 3 were not secured, so answers and feedback showed in run history. | Should-fix | Secured the triggers and every Filter array / Select in flows 1–3 | Validator rule plus 2 mutations |
| 6 | TL views took month, due date and owner from the technician-editable Monthly Review (plan D.7). | Should-fix | Taken from the Manager Review | Frontend: tamper test |
| 7 | Flow 1 mixed next year's expectations into this year's snapshot. | Should-fix | Filter by the current appraisal year (April start) | Simulation: next-year item excluded |
| 8 | Setup could remove the runner's own access when they were neither Site Collection Admin nor in Owners. | Should-fix | Remove only when access is kept another way | Simulation |
| 9 | Setup could lower an existing version-history limit. It also adopted a different list that happened to share a title. | Should-fix | Limit raised to at least 100, never lowered; lists matched by URL; title clash warned | Simulation (2 checks) |
| 10 | A stale second trigger could make Flow 3 release and email twice. | Minor | Re-read `ReleasedOn` first | Simulation |
| 11 | Closing a Manager Review whose Monthly Review was never created made Flow 3 fail. | Minor | Guarded; E5 links to the page | Simulation |
| 12 | Appraisal date returned as a UTC instant in summer would be copied a day early. | Minor | Normalised to the London date | Simulation (summer date) |
| 13 | Trigger concurrency 1 with Split On can drop triggers (Microsoft guidance). | Should-fix | Concurrency control off on Flows 2 and 3 (runs are safe to repeat) | Docs + sheets |
| 14 | Get user profile (V2) was given an email address; it takes a UPN or object id. | Should-fix | UPN taken from the person field's claims | Fake rejects claims strings |
| 15 | Removing role assignments used `deleteobject()`. | Minor | Documented `X-HTTP-Method: DELETE` form | Fake accepts only the documented form |
| 16 | A submission awaiting Flow 2 showed as "Not started"; a cleared appraisal date didn't reach the technician. | Minor | "Submitted – processing"; the latest review is used | Frontend test |
| 17 | Environment variables weren't listed in the solution manifest. | Insurance | `RootComponent type="380"` added (seen in other real exports) | Pack round trip |
| 18 | Documentation drift: group membership visibility, setup wording, `rating: null`, counts, concurrency and accepted risks. | Docs | Corrected; risks R13–R16 added to plan J.3; v4.1 hardening table in the flow sheets | Link and consistency sweep |

### 3a. Second independent review (15-Oct-2026, frontend 4.2.2 / solution 1.1.2.0)

Three fresh reviewers (frontend; flows and package; docs and repository privacy) re-read everything. Fixed:

| # | Defect | Severity | Fix | Test that now covers it |
|---|---|---|---|---|
| 19 | The technician view filed every readable record as "mine" and treated any readable Manager Review as released. Only matters if a permission step fails or lags, but then another person's review or wellbeing assessment could show. | High (defence in depth) | Records are kept only if the Technician is the signed-in person; feedback shows only once released (ReleasedOn / Completed / Closed) | Frontend: stray readable review, wellbeing and unreleased feedback are not shown |
| 20 | Ratings outside 1–5 (or not whole) typed into editable fields crashed the TL's pages. | Medium | Ratings accepted only as whole numbers 1–5 | Frontend: 2.5 / 6 / 9 values |
| 21 | Edits discarded with "leave without saving" stayed in memory and could be saved later by another action. | Medium | Leaving without saving reloads from SharePoint | Frontend |
| 22 | Toasts and error messages vanished when the page redrew straight after. | Medium | Kept across redraws | Frontend |
| 23 | "Close – not submitted" was offered while a submission was still being processed; a failed date after starting a wellbeing assessment allowed a duplicate. | Medium | Disabled while processing; item kept before the date is written | Frontend |
| 24 | Flow 1: a wellbeing-read failure also suppressed the daily problem email (E7). | Medium | Wellbeing block has its own try/catch and adds a line to E7 | Simulation |
| 25 | Flow 4 only acted on the changed row: people added by hand, an old person on a changed row, or a deleted row kept access. | Medium | Full sync: anyone in the group without an Active row is removed and listed | Simulation (4 checks) |
| 26 | E12 trusted the raw status column and fired for inactive people. | Low | Needs Flow 5's CompletedOn stamp and an Active technician | Simulation |
| 27 | Composes holding a whole record weren't explicitly secured. | Low | Secured; validator rule plus mutation | Mutation |
| 28 | Smaller UI issues: plurals, "Today", wording in the appraisal month, role labels, overlapping strongest/focus lists, Settings closing without a prompt, a typed meeting date lost on redraw, misleading date-save error, unchecked paging links, Escape to close dialogs. | Low | Fixed | Frontend (prompt, Escape) |
| 29 | Documentation: the real site name in the plan; inconsistent flow turn-on order; Wellbeing missing from post-setup checks; stale counts, menus and retention text. | High (privacy) / Docs | Site name removed from current files; docs aligned | Consistency sweep |

### 3b. Third round – features, break-it and security testing (16-Oct-2026, frontend 4.4.0 / solution 1.2.1.0)

Three independent testers worked only on copies and the local mock/simulator (nothing live): every feature and screen at four widths; deliberate attempts to break each part; and attempts to bypass the security as a technician. The core design held: no technician could read, change or release another person's review, Manager Review or wellbeing record, and no script injection succeeded. Fixed:

| # | Finding | Severity | Fix | Covered by |
|---|---|---|---|---|
| 30 | Details of Q4–Q6 switched to No and back to Yes showed on screen but were saved blank | High | Saving no longer clears the in-memory answers | Frontend |
| 31 | One `null` entry in a JSON column (or broken Bands) stopped the page loading for everyone | High | Lists filtered to objects; Bands fall back to defaults | Frontend |
| 32 | Double clicks created duplicate expectations, people, assessments, Bands rows | Medium | One action of a kind at a time | Frontend (slow-server test) |
| 33 | Flow 4 removed access when a duplicate row was deactivated | Medium | Access kept while any row for the person is Active | Simulation |
| 34 | Two people with the same name were merged in the TL views | Medium | Kept apart (name + email) | Frontend |
| 35 | Flow 2 used the run time: a 23:58 submission could be stamped next month and late | Medium | Uses the item's Modified time (trusted up to 30 min back) | Simulation (2) |
| 36 | Deactivated people still got reminders | Medium | Reminders only to active people | Simulation |
| 37 | The page and Flow 1 read the Reminders setting differently | Medium | Page reads it exactly as Flow 1; Save rewrites unreadable values | Frontend |
| 38 | Submit didn't wait for an auto-save already on its way | Medium | Submit / Complete wait for it | Code review |
| 39 | Feedback: a sender could stop their item being locked/emailed by pre-setting the delivery columns | Low (security) | Flow 6 decides "handled" from the item's lock, never from columns; the page trusts Failed/Held only on locked items | Simulation (3), frontend |
| 40 | Feedback: one person could flood the TL and the flow allowance | Medium (security) | Max 10 emails per person per day; the rest Held and grouped | Simulation, frontend |
| 41 | Feedback list: built-in Contribute let people set alerts (could email others' new items before the lock) | Medium (security, tenant check P27) | New `1-to-1 Submit` level: no alerts, delete, versions or personal views | Simulation |
| 42 | Wellbeing: while open, the person could relabel it as someone else's or fake the submitted stamp / manager fields | Low (security) | Flow 5 puts them back on every run while it's open | Simulation |
| 43 | Wellbeing: two holders or a lost holder could skip the lock or re-share a submitted assessment | Low (security) | Exactly one holder, else stop; a used assessment is never re-shared | Simulation (2) |
| 44 | *Since last time* showed last month's wellbeing detail on the first screen | Info (privacy) | Hidden until the person chooses Show | Frontend |
| 45 | Flow 1 run history showed a technician's directory ID | Info | Secured | Validator |
| 46 | Formatting: the bubble covered buttons; stacked messages; the top bar wrapped at 1366 px; clipped tables; "Reminders on the none"; wellbeing columns jumped; dialogs didn't take focus; report not closable with Escape; print layout; wording | Medium/Low | Compact bubble + page padding; one message at a time; one-row top bar; scrollable tables; wording; focus/Escape; print rules | Frontend, screenshots |
| 47 | Smaller robustness items: action close-out partial failure, *Same as last month* not auto-saved, a bad `?reviewId` trapping the technician, free-text appraisal year | Low | Fixed | Frontend |

**Accepted / tenant checks:**
- **Feedback sender forgery (P26).** Can a Contributor set `Author` on the Feedback list? The E13 sender is "as recorded by SharePoint".
- **List metadata (P28).** Counts and dates may be visible to technicians, but no content.
- **`1-to-1 Edit` keeps View Versions and Create Alerts.** The only versions are the technician's own drafts, and the TL writes nothing to an item while the technician holds Edit, so it was left unchanged to avoid "rights differ" warnings on existing sites.

### 3c. Fourth round – new features, break-it and security testing (16-Oct-2026, frontend 4.5.0 / solution 1.3.0.0)

New in this release: required questions marked orange until answered and red after a blocked Submit; technicians see bands and words, never numbers; "focus on these to move up"; and challenges of released feedback (Flow 7, the 1-to-1 Challenges list, Flow 1's month-end close – all **removed in 1.4**, see §3d and `MIGRATION_1_4.md`; findings 48–53 are kept as history). Two independent testers then worked only on copies and the local mock/simulator. Nobody could forge the line manager's agreement, challenge someone else's review, move a challenge onto another review, or inject script through a challenge. Fixed:

| # | Finding | Severity | Fix | Covered by |
|---|---|---|---|---|
| 48 | A challenge with no review id made Flow 7 fail – and every failed run emails the line manager (proved: 15 items → 15 emails) | Medium (security) | A blank id is a quiet reject (proved: 15 → 0 emails) | Simulation |
| 49 | Two challenges sent at the same moment could both be accepted | Low (security) | Looked at again just before accepting; a moved or duplicate item is locked | Simulation |
| 50 | The line manager's Agree half-saved (or Flow 7 off): both agreed but stuck open, then closed as Not agreed | High | "Finish closing" button; Flow 1 closes a both-agreed challenge as Agreed | Frontend, simulation |
| 51 | Reopen half-saved: left open with old agreements, or the technician still read-only | High | State and cleared agreements saved together; "Send again" while access is coming back; a clear message for the technician meanwhile | Frontend |
| 52 | A technician rarely saw their open challenge (it is on last month's review) | Medium | Shown on their current form with a link | Frontend |
| 53 | Topics could be changed after the line manager had agreed; a malformed list was accepted | Medium | Topics fixed when accepted; must be a list | Simulation (2) |
| 54 | A long note with no spaces widened the page | Medium | Long text wraps | Frontend |
| 55 | Smaller: auto-save "highlighted item" not highlighted; next band wrong with duplicate band names; "You're in the top band" shown to the line manager; unlabelled boxes and button groups; challenge list status not updated at month end; a missing challenge column would stop the page loading | Low | Fixed | Frontend, simulation |

**Tenant check:** P26 (can `Author` be set when creating an item?) also covered the Challenges list while it was in use (1.3 only).

### 3d. Solution 1.4.0.0 / page 5.0.0 (16-Oct-2026)

New in this release: variable-length appraisal periods, missed months excluded from the statistics, Team Leader amendments with a restricted audit (*1-to-1 Amendments*, Flow 8, E16), next wellbeing and appraisal dates in Settings → Team with E12 / E17 reminders, uncapped expectations, the challenge feature removed, a screen clean-up and the one-time reset tool. What the local checks prove:

| Area | Verified | Covered by |
|---|---|---|
| Appraisal periods | A period runs from the previous actual completion (or the period start you set) to the next, any length (12, 15, 23 and 8 months tested). A review belongs to a period by its month: after the start's month, up to and including the completion month (also for a 1 June completion in summer time). Moving the next due date never moves a review. Reviews before the first start form a closed earlier period; with no start there is no forecast. A second completion in the same month replaces the first; Undo last reverses it. | Frontend |
| Missed months | *Closed – Not Submitted* and overdue *Open* months are left out of averages, the expected outcome and forecast, trend and on-time (on time ÷ submitted). A missed month neither extends nor breaks the streak; a late one breaks it. Tiles and reports show "N rated reviews of M months · K missed". Removing the missed months gives identical figures. | Frontend |
| Amendments | A released review is read-only until **Amend…**; a submitted one keeps Save feedback plus **Amend answers…**. No auto-save in amend mode; a reason is required and the changed fields are listed. Order: re-read both items (refuse if changed elsewhere) → Draft audit record (before/after of changed columns only; who/when from SharePoint) → only the changed columns written → Pending. Flow 2 re-applies the lock and then cancels (not a resubmission); Flow 8 sends exactly one E16 with no content or reason, marks it Sent, and on failure marks it Failed and tells the TL; Resend / Send notice / Dismiss in *Needs your attention*. A technician can't read the audit list. | Frontend, simulation |
| Flow 1 | No limit of 10 expectations; Shared before Individual (AppliesTo desc, SortOrder asc); an earlier year carries on, a later or mistyped year stays out, also across 1 April; boundaries copied to new reviews; E12 / E17 7 days before, on the day, weekly while overdue, active people only; a submission Flow 2 never processed is reported in E7. | Simulation |
| Setup 1.4 | Adds the four Technicians columns, `AppraisalBoundaries` on Monthly Reviews and the Owners-only, versioned Amendments list; retires 1-to-1 Challenges (group removed, items Owners-only, open challenges *Not agreed*, nothing deleted); a re-run changes nothing. | Simulation |
| Expectations | No cap (warning above 30); Shared card plus one card per person; new items at the end of their group; **Delete permanently** only for retired items, by the TL, to the recycle bin, with past reviews keeping their copy; a technician's `recycle()` is refused (403). | Frontend |
| Reset tool | Inventory, filters, backup required before the dry run, typed confirmation with Flow 1 off, deletes only ticked records on the allowed lists, expectations opt-in only, Technicians and Settings never touched, report after verification; refused for a technician. | Reset-tool tests |
| Challenges removed | No challenge UI anywhere on the page; Flow 7 is not in the solution; E14 / E15 no longer sent. | Frontend, build |

**Security review of 1.4 – fixed:** the technician-editable review title is HTML-escaped in E7; Flow 2 always re-applies the lock before it cancels an amendment run; the page never lets the TL change a submission that is still waiting for Flow 2; the validator now also rejects review or audit content in steps whose run history can't be secured (5 new mutations); a static check confirms `recycle()` is used only for the TL's *Delete permanently*.

**Honest limits.** The amendment audit is tamper-*evident* (version history on the list), not tamper-proof: site owners and site collection admins can always edit a list they own. The E16 email to the technician is an independent record.

**Tenant-only for 1.4:** checks **T1–T11** in [`MIGRATION_1_4.md`](MIGRATION_1_4.md#tenant-only-checks) – flows 2–6 and 8 activate after import; Setup says *complete*; Flow 2's trigger carries **Editor**; Flow 8 sends one E16 per amendment; `recycle()` allowed for the TL and refused for a technician; versioning and Owners-only access on 1-to-1 Amendments (and a technician can't open it); the reset layout appears and is removed afterwards; real dates entered after migration; date-only round trips on the live regional settings.

### 3e. Solution 1.5.0.0 / page 5.1.0 – enhanced action tracking (19-Oct-2026)

New in this release: the action tracker (three lists, flows 9–11, flow 1 and 3 additions), *My actions*, the rebuilt Actions page, carry-forward with follow-up outcomes, E19 / E20, and the reset tool's separately authorised action group. Full evidence and both review rounds: [`TEST_REPORT_1_5.md`](TEST_REPORT_1_5.md).

| Area | Verified | Covered by |
|---|---|---|
| Creation at release | Server-side (flow 3), unique `ActionKey`, only after the tracker start, idempotent; an interrupted release is finished by flow 1; one bad review never blocks the others or the reminders | Simulation; action tests §29–§30 |
| Identity and permissions | Updates only from the technician's own top-level folder, found by exact path and trusted only if the flow made it and nobody has changed it; forged ActionId / Author rejected; flow 9 sets and repairs the exact permission set without unlocking recorded updates | Simulation; action tests §31 |
| Concurrency | Page MERGE with the etag it read (412 → reload, nothing overwritten); flow 10 retries once and re-checks the rules; history appended once (exact id match) | Simulation; action tests §29–§30 |
| Emails | E19 once per request; E20 5 working days before (weekday / Saturday / Sunday rules, catch-up, BST), one per action and deadline, none after the deadline, stale ones cancelled; Failed → Retry → Sent; delivery unknown shown | Simulation; action tests §32 |
| Page | Statuses, waiting never extends a deadline, overdue-while-waiting, no scores, carry-forward, outcomes, UK dates across clock changes, 1366 px | Action tests §29–§37 |
| Compatibility | All 5.0 tests pass; before Setup 1.5 the page behaves as 5.0; released actions read-only (amend mode too); the Actions page never writes Manager Reviews | Frontend; action tests §34 |

**Independent reviews (security, break-it):** 21 findings (3 high in break-it, 1 high in security), all fixed with tests – see `TEST_REPORT_1_5.md`.

**Tenant-only for 1.5:** checks **T1–T16** in [`MIGRATION_1_5.md`](MIGRATION_1_5.md#tenant-only-checks).

## 4. Confirmed against Microsoft documentation

From the platform audit, with sources in the audit notes:

- **List and column creation:**
  - list creation body; list settings properties;
  - `createfieldasxml` with Options 28 and internal name from `Name`;
  - Field XML attributes; making a column indexed and unique.
- **Permissions:**
  - permission-level creation with the exact Contribute/Read bit masks;
  - the derived `1-to-1 Edit` / `1-to-1 Read` masks;
  - group creation properties;
  - breaking inheritance leaves the caller; add role assignment.
- **Lookups and users:** the lookup endpoints, LocaleId 2057, the London time zone; `ensureuser`.
- **Connector usage:**
  - list title as `table`; `item/X/Value` and `item/X/Claims`;
  - `Active eq 1` and choice filters; trigger output shapes.
- **Solution packaging:** connection-reference format; the env-var import prompt; Recurrence `startTime` + time zone (keeps 07:00 UK across daylight saving).
- **Run history:** secure inputs/outputs rules.

## 5. Only provable in the tenant

| Item | Where |
|---|---|
| Solution imports, connections bind, environment variables accepted | IMPORT_GUIDE §2 |
| Setup run: lists, views, permission levels, group, permissions as the summary says | IMPORT_GUIDE §3–§4 |
| Real item permissions, emails and timings | Plan section H (F1–F44, P1–P28), with Test A / Test B |
| Personal-regional-settings date round trip (R16) | Test F27 |
| Limited-access lockdown mode not active | NEXT_STEPS "Things to verify early" |
| Solution 1.4 / page 5.0.0 upgrade (T1–T11) | [`MIGRATION_1_4.md`](MIGRATION_1_4.md) → *Tenant-only checks* |

To repeat every automated check: `04-solution/tools/run_all.sh`, plus the two frontend commands above (`node tools/build-mock.js && node test/run-tests.js`, and `node test/run-reset-tests.js`).
