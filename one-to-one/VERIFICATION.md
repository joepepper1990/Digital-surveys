# ESG 1-to-1 — verification record (15-Oct-2026)

**Scope:** frontend v4.2.1, the importable solution (setup flow + Flows 1–5), the legacy-package builder, the six-list schema and all documents.

**What this record can and can't prove.** Everything here ran outside your tenant. It proves the files are well-formed, internally consistent and behave as specified against a strict model of SharePoint that follows Microsoft's documentation. Only the tenant can prove the import and real permissions (§5).

## 1. Automated checks — all passing

| Check | How | Result |
|---|---|---|
| Frontend | `02-frontend`: `node tools/build-mock.js && node test/run-tests.js` (headless Chromium against the local mock) | **156 / 156** |
| Solution build | `04-solution/tools/build.py`: generate `src/`, validate, pack with Microsoft's Power Platform CLI, unpack again and compare | Packs; round trip identical |
| Static validator | Expressions, references, scopes, run-after chains, required connector parameters, list/column names, JSON request bodies, field XML / view CAML, schedule time zone, secured run history, no hidden failures | 4 flows clean |
| Validator proof | `tools/test_validate.py`: deliberately broken copies of the flows | **20 / 20** caught |
| End-to-end simulation | `tools/simulate.py`: the real flow JSON executed against an in-memory SharePoint | **141 / 141** (solution) and **141 / 141** (legacy form) |
| Simulation proof | New scenarios run against the previously committed flows / frontend | 18 flow checks and 2 frontend checks fail on the old code, so the tests detect the bugs fixed in §3 |
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
| Real item permissions, emails and timings | Plan section H (F1–F40, P1–P24), with Test A / Test B |
| Personal-regional-settings date round trip (R16) | Test F27 |
| Limited-access lockdown mode not active | NEXT_STEPS "Things to verify early" |

To repeat every automated check: `04-solution/tools/run_all.sh`, plus the frontend command above.
