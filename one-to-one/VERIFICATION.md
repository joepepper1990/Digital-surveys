# ESG 1-to-1 — verification record (15-Oct-2026)

**Scope:** frontend v4.4.0, solution 1.2.1.0, the importable solution (setup flow + Flows 1–6), the legacy-package builder, the seven-list schema and all documents.

**What this record can and can't prove.** Everything here ran outside your tenant. It proves the files are well-formed, internally consistent and behave as specified against a strict model of SharePoint that follows Microsoft's documentation. Only the tenant can prove the import and real permissions (§5).

## 1. Automated checks — all passing

| Check | How | Result |
|---|---|---|
| Frontend | `02-frontend`: `node tools/build-mock.js && node test/run-tests.js` (headless Chromium against the local mock) | **219 / 219** |
| Solution build | `04-solution/tools/build.py`: generate `src/`, validate, pack with Microsoft's Power Platform CLI, unpack again and compare | Packs; round trip identical |
| Static validator | Expressions, references, scopes, run-after chains, required connector parameters, list/column names, JSON request bodies, field XML / view CAML, schedule time zone, secured run history, no hidden failures | 7 flows clean |
| Validator proof | `tools/test_validate.py`: deliberately broken copies of the flows | **23 / 23** caught |
| End-to-end simulation | `tools/simulate.py`: the real flow JSON executed against an in-memory SharePoint | **180 / 180** (solution) and **180 / 180** (legacy form) |
| Simulation proof | New scenarios run against the previously committed flows / frontend | 18 flow checks and 2 frontend checks fail on the old code, so the tests detect the bugs fixed in §3. Second review (§3a): 7 new flow checks fail on the 1.1.1.0 flows, and the new frontend checks fail on 4.2.1 (privacy ×3, robustness – the run then stops because the old profile page crashes) |
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

To repeat every automated check: `04-solution/tools/run_all.sh`, plus the frontend command above.
