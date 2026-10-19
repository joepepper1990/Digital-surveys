# Test report – page 5.1.0 and solution 1.5.0.1 (enhanced action tracking)

**Date:** 19-Oct-2026.
**Scope:** everything changed in `CHANGES_5_1.md`, plus a full rerun of the 5.0.0 / 1.4.0.0 tests.

**Everything here ran locally, against fictional data.** That means the browser mock of SharePoint, and the flow simulator with its fake SharePoint. Nothing was run against the live tenant, and nothing was deployed. The checks that only the tenant can confirm are listed at the end, separately.

## Results

| Suite | Command | Result |
|---|---|---|
| Frontend – existing behaviour (page + mock, headless Chromium) | `cd 02-frontend && node tools/build-mock.js && node test/run-tests.js` | **319 / 319** |
| Frontend – action tracker (new, 1366 px) | `cd 02-frontend && node test/run-action-tests.js` | **108 / 108** |
| Reset tool (1.1.0) | `cd 02-frontend && node test/run-reset-tests.js` | **45 / 45** |
| Flow validator: deliberate mistakes caught | `python3 04-solution/tools/test_validate.py` | **38 / 38** |
| Flow simulations, solution flows | `python3 04-solution/tools/simulate.py` | **294 / 294** |
| Flow simulations, legacy-builder flows | `ESG_SIM_MODE=legacy python3 04-solution/tools/simulate.py` | **294 / 294** |
| Build, pack/unpack, builder page (11 packages), zip checks | `bash 04-solution/tools/run_all.sh` | **ALL CHECKS PASSED** |

`run_all.sh` runs the validator, the simulations, the builder and the zip checks. Along the way it also checks that:

- only standard connectors are used (SharePoint, Outlook, Office 365 Users), with no premium or HTTP connector;
- secure inputs and outputs are on wherever personal data passes;
- no variable carries `secureData`;
- the new lists, and every column added after its list was created, are reached only by REST;
- the connection references and environment variables are unchanged.

## What the requested areas cover

| Area | Covered by |
|---|---|
| **Lifecycle (the success scenario).** A review is agreed and released, and flow 3 adds its actions once. The technician updates in the following month. The Team Leader updates, moves the deadline with a reason (the original is kept), declines a close-out with a reason, then agrees and closes. A reopen needs a reason. The history is complete, in order and without duplicates. Actions survive a completed appraisal and a missed review | Frontend §29; simulation (flows 3, 10) |
| **Activation boundary.** Reviews released before Setup 1.5 are never imported; the start is written once | Simulation (Setup, Flow 1); frontend §34 |
| **Release reliability.** Unique keys; release twice or the daily run twice adds nothing; a release interrupted part-way is finished by flow 1 with no duplicates; never shown as done until it is (attention after 1 h, "1 of 2 so far"). One bad review never blocks the others, the reminders or the retries | Frontend §30; simulation |
| **Technician updates.** One item per update, in their own folder; unique client key. Two tabs, a quick second update, a refresh mid-send and a lost reply are each recorded once. Flow 10 run twice gives one history entry. States shown: sending / received – being recorded / recorded ✓ (only once it is in the action's history) / not recorded: reason / not sent + Send again | Frontend §29, §30, §37; simulation |
| **Etag concurrency.** The page's MERGE carries the etag it read (never `*`); a stale save gives a 412, a reload and nothing overwritten. Flow 10 retries once on a 412, and **re-checks the rules** on the fresh copy, so a close or takeover in between is never undone | Frontend §29; simulation (review fix) |
| **Security (REST as a technician).** They can't read another person's actions, updates, folder or notices. They can't write, create or close an action, or change its deadline or owner. A forged ActionId or Author is rejected. Creating outside their own folder is refused. They can't edit or delete a recorded update. Close-out requests are only allowed on their own actions; waiting needs a reason; closed actions are refused. A folder that anyone but the flow has changed is never trusted. Wrong sharing is repaired by flow 9 without unlocking recorded updates | Frontend §31; simulation |
| **Emails.** E19 is sent once per request. E20 goes 5 working days before the deadline (weekday −7, Saturday −5, Sunday −6 days), catches up on a missed day, is sent once per action and deadline, and never after the deadline; it uses UK dates (BST included). A reminder whose deadline has moved, or whose date has passed, is cancelled rather than sent late. Failed → Retry → Sent; a send left unfinished shows as "delivery unknown"; a notice for an action closed meanwhile is cancelled. Every value is escaped | Frontend §32; simulation |
| **Carry-forward and outcomes.** Outstanding actions appear on both review screens, with what changed since the previous review's release. One-click *Progress satisfactory*; *Further support required* with details; *Ready to close* (technician: own actions only, sent as a close-out request; TL: close now or mark ready). Choosing the same outcome again adds nothing. Each person sees the other's outcome | Frontend §33; simulation (follow-up doesn't change the status) |
| **Team Leader page.** Needs-you tiles, filters, the Update dialog, new action (unique `tl-` key, deadline written with the etag and read back), Repair sharing, Resend, the `?actionId` deep link | Frontend §29, §32, §34, §35 |
| **Dates.** Every action date is written as UK midnight and read back; the last Sundays of March and October are stored as the right day | Frontend §37 (review fix) |
| **Compatibility.** Every earlier test still passes. Before Setup 1.5 the page behaves as 5.0 (no errors; agreed actions listed read-only; no My actions tab). Released actions are read-only in reviews, including in amend mode. The Actions page never writes a Manager Review | Frontend §29, §34; run-tests §11; static checks |
| **Reset tool.** The action group is hidden until its own tick box. "Select all" never picks actions. An action takes its updates and emails with it, and they are deleted first. Deleting reviews never deletes actions. Folders are never listed or deleted. The confirmation phrase names the tracker records | Reset tests |
| **Privacy and XSS.** Attack strings in every tracker field (title, criteria, progress, waiting reason, decision note, history, outcomes) show as text on every screen and in the report. A technician never sees another person's name. Unsent drafts stay only in the person's own browser, for at most 7 days | Frontend §31, §36, §37 |
| **1366 px.** The Actions page and My actions fit with no sideways scrolling. Long unbroken text wraps inside its cell | Frontend §35; screenshots below |

## Independent reviews

Two independent reviewers worked on separate copies after the build: one on security, one on breaking it. Every finding below was fixed, and each fix has a test. The two reviewers re-ran the suites; the counts above are from the final run after the fixes.

### Security review

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | High | A technician could rename their own update folder to a newcomer's name (`u<id>`), plant an update in it, and have flow 9 adopt the folder and flow 10 accept the update as the newcomer's. *1-to-1 Submit* includes Edit, and the folder is an item. | Three layers: the list now lets people edit only items they created (the folder is made by flow 9, so they can't rename it); flows 9 and 10 trust only a folder created **and** last changed by the flow's own account; flow 9 closes any other folder to Owners and reports it instead of adopting it. Simulation proves the rejection and the quarantine. |
| S2 | Medium | Folders were looked up by name at any depth, so a decoy subfolder could be adopted. | Both flows look the folder up by its exact path (`<list>/u<id>`). |
| S3 | Low | Repairing a folder cleared the locks on recorded updates (`clearSubscopes=true`). | Folder repairs keep sub-permissions. Simulation proves recorded updates stay Read-only. |
| S4 | Low | "Already recorded" was a text search, so a client key `u<next id>` made the next update count as recorded. | The check is now for the exact entry id (`"id":"u<id>"`). Simulation proves it. |
| S5 | Low | "Recorded ✓" came from the update's own state, which its sender could set. | It now shows only once the update is in the action's history. |
| S6 | Low | Unsent drafts stayed in browser storage indefinitely. | They are kept for 7 days at most, and only until SharePoint has them. |
| S7 | Info | Rejection messages revealed which action ids exist. | Unknown actions and other people's actions get the same message. |

**Held** (security):

- forged ActionId, adding to another person's folder, root and nested items;
- the etag claim (one run per update), and the run working from its own snapshot;
- allow-listed Kind and Outcome;
- JSON built with `string()` and ids made safe;
- flow 9's exact permission check (groups and sharing links count as extra);
- E19 and E20 escaped, with no free text from technicians and the right recipients;
- no `innerHTML` anywhere;
- `spMerge` restricted to the Actions list and the Team Leader, always with an etag;
- the reset tool's separate tick box enforced in its delete function too;
- secure run history on the new flows;
- standard connectors only.

### Break-it review

| # | Severity | Finding | Fix |
|---|---|---|---|
| B1 | High | After a 412, flow 10 re-applied the update without checking the rules again. A close or a takeover by the Team Leader in between could be undone. | The verdict is re-run on the fresh copy; if it fails, the update is rejected with the reason. Simulation covers both cases. |
| B2 | High | One review that couldn't be added stopped the rest of flow 1's tracker work: reminders, stuck updates and failed-email retries. | Each review is handled on its own and reported by name. Sync, reminders and retries are independent parts, each reporting its own problem. Simulation proves the reminder still goes and the other review is added. |
| B3 | High | The page stored the wrong day for deadlines on the last Sunday of March: the UK offset was taken at noon. | The offset is now checked at midnight itself (same fix in the mock). Frontend tests cover 28 March and 25 October. |
| B4 | Medium | A failed or late-retried E20 could be sent after the deadline had moved, quoting the new date. | Flow 11 cancels an E20 whose deadline has moved or whose date has passed. Simulation proves it. |
| B5 | Medium | A malformed `HistoryJson` failed the run every day, with a misleading message. | It is parsed first; if that fails, the update is rejected with "The action history could not be read". |
| B6 | Medium | The review editor allowed 300 characters, but the tracker title holds 250. | The editor is capped at 250. |
| B7 | Medium | Older entries without `ownerRole` all became the technician's in flow 3. | Flow 3 uses the owner name when the role is missing, the same as the page. Simulation covers it. |
| B8 | Medium | "Since the previous review" was measured from the 1st of that month. | It is now measured from the previous review's release (or its meeting date). |
| B9 | Low | A follow-up outcome moved a Waiting action to In progress. | Follow-ups leave the status alone (except Ready). |
| B10 | Low | A waiting action past its next-check date was never surfaced. | It is flagged in the Waiting tile and in *Needs your attention*. |
| B11 | Low | A past period's report listed actions raised after it. | Open actions are listed only up to the period's end. |
| B12 | Low | The Team Leader could record outcomes only on the current month's review. | Outcomes can also go on last month's review, for a meeting held early in the next month. |
| B13 | Low | Very long unbroken text widened the Actions table. | It wraps inside the cell. |
| B14 | Low | An action the Team Leader marked ready was described as "<name> asked to close". | The attention item now says "you marked it ready". |

**Held** (break-it):

- reminder dates: weekday, Saturday, Sunday, catch-up, after the deadline, a moved deadline, BST;
- flow 10 run twice; flow 3 and flow 1 racing on the same release;
- 412 handling across two tabs, and double-clicks;
- the raw history kept on every write;
- XSS strings shown as text;
- no page-wide sideways scroll at 1366 px with 250 to 2000-character fields;
- report wording: no scores, and overdue-while-waiting shown separately;
- the reset tool's separate tick box.

**Accepted, not changed:**

- B-L5: `union()` would merge two byte-identical history entries; real entries always have unique ids and times.
- B-L7: a page left open overnight keeps yesterday's date until refreshed. This is the same as the rest of the page.

## Visual check (1366 px)

`SHOTS_DIR=<folder> node test/run-action-tests.js` saves screenshots of:

- the Actions page;
- the Update dialog;
- *My actions*;
- the technician's form with *Outstanding actions*.

They were checked with no page errors and no sideways scrolling. The screenshots are not committed: they would only show fictional data.

## Known limits

- **The history is tamper-evident, not tamper-proof.** Site owners can edit any list they own. Version history and the append-only writes make any change visible.
- **Flows poll about every 5 minutes**, so updates, sharing and emails follow within minutes, not instantly. The page never claims success early, and *Needs your attention* flags anything not done after an hour.
- **Email can't be guaranteed exactly once.** There is at most one send per claim. An unfinished send shows as *delivery unknown*, and a Resend may arrive twice.
- **Actions agreed before the upgrade are not tracked** (by decision: no import). They stay in their reviews and can be added with **+ New action**.
- **`HistoryJson` has no size cap.** Each update is limited to 2000 characters. Tenant check T16 confirms the column's limit; a very long-running action could reach it after thousands of updates.
- **Bank holidays aren't counted** in "5 working days".

## Tenant-only checks

These are T1–T16 in `MIGRATION_1_5.md`, including:

- activation of flows 1, 3 and 9–11;
- the exact permissions flow 9 sets on a real item and folder;
- a technician adding through Limited Access to their own folder only;
- the item-level "edit only own items" setting stopping a folder rename (T15);
- E19 and E20 delivery;
- date round-trips on the live regional settings.

## 1.5.0.1 rerun (Flow 1 nesting repair, 19-Oct-2026)

Everything above was run again on 1.5.0.1:

| Suite | Result |
|---|---|
| Frontend – existing behaviour | **319 / 319** |
| Frontend – action tracker | **108 / 108** |
| Reset tool | **45 / 45** |
| Validator mutations | **42 / 42** (four new: too deep in a scope, in an else branch, in a Switch case; over 500 actions) |
| Simulations | **298 / 298**, solution and legacy |
| `run_all.sh` | **ALL CHECKS PASSED** |

`run_all.sh` now also runs `tools/check_package.py`, which checks that:

- the packed `ESGOneToOne_1_5_0_1_unmanaged.zip` flows are identical to the validated source;
- every packaged flow is within 8 levels and 500 actions;
- the flow IDs, connection references, environment variables and triggers are the same as 1.5.0.0;
- the 1.5.0.0 zip is unchanged;
- the nesting rule, run on the 1.5.0.0 Flow 1, reports exactly the actions Power Automate named.

**New simulation checks of the restructured paths:**

- A deadline reminder that can't be queued is reported in E7, while the review sync and the retries still run in the same run. It is caught up, once, the next day.
- An action that can't be created (and isn't there on the re-check) fails only that review. The review is reported by name, left unsynced, and finished on the next run.

**Still to confirm in the tenant:**

- Flow 1, and flows 3 and 9–11, turn on without `TemplateValidationError` (T1).
- One real Flow 1 run succeeds.
- The rest of T2–T16.
