# ESG 1-to-1 — Power Platform solution (source and build)

**To install, follow [`IMPORT_GUIDE.md`](IMPORT_GUIDE.md).** This page explains how the files are made and tested.

## What's here

| Path | What it is |
|---|---|
| `ESGOneToOne_1_5_0_0_unmanaged.zip` | **The importable solution (1.5.0.0)**, packed by Microsoft's Power Platform CLI (`pac solution pack`). The older `1_4_0_0` and `1_3_0_*` zips are kept only for going back (`../MIGRATION_1_5.md`, `../MIGRATION_1_4.md`). |
| `legacy-package-builder.html` | Offline page that makes legacy (non-solution) packages, for environments without Dataverse |
| `src/` | The unpacked solution, in the same layout `pac solution unpack` produces. **Generated – do not edit by hand.** |
| `tools/schema.py` | **The SharePoint schema, defined once:** lists, columns (field XML), indexes, views, permission levels |
| `tools/flows.py` | **The eleven flows** (0 Setup, 1–6, 8 Amendment notice, 9 Action access, 10 Action update, 11 Action notice), as Power Automate flow definitions |
| `tools/legacy.py` | Legacy package templates and the builder page |
| `tools/build.py` | Generates `src/`, validates, packs the zip, unpacks it again to prove the round trip |
| `tools/validate.py` | Static checks for every flow |
| `tools/test_validate.py` | Proves the validator catches mistakes (38 deliberate breakages) |
| `tools/wdl.py`, `tools/fake_sharepoint.py`, `tools/simulate.py` | Run the real flow JSON against an in-memory SharePoint, end to end |
| `tools/test_builder.js`, `tools/check_builder_zips.py` | Browser test of the legacy builder and checks on the zips it makes |
| `tools/run_all.sh` | Everything above, in order |
| `tools/make_guide.py`, `tools/make_simple_steps.py` | Build the printable Word guides (`../ESG-1to1-Finalisation-Guide.docx`, `../ESG-1to1-Simple-Upgrade-Steps.docx`) from the Markdown |

## Build and test

You need Python 3.9+ and, to pack the zip, the [Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`). Without `pac`, `src/` is still generated and validated. The browser test needs Node.js with Playwright and Chromium, like the frontend tests.

```bash
cd one-to-one/04-solution
tools/run_all.sh
```

| Step | Checks |
|---|---|
| `build.py` | **Generates the files:** `src/` and the builder page. **Validates every flow:** expressions parse and use real functions; every reference points at an existing action, variable, parameter or enclosing loop; `runAfter` chains are complete; SharePoint/Outlook actions have their required parameters; list and column names exist in the schema; REST bodies are valid JSON; field XML and view CAML are well-formed; a time-zoned schedule has a start time. **Packs** with `pac` and **unpacks** again; the flow JSON must survive the round trip unchanged. |
| `test_validate.py` | 38 deliberately broken copies of the flows; the validator must reject every one |
| `simulate.py` (solution and legacy) | 294 end-to-end checks against the fake SharePoint (each form), grouped below |
| `test_builder.js` + `check_builder_zips.py` | The builder rejects bad input, makes no network requests, and produces standard zips whose contents are exactly the templates with the values filled in |

**The 294 simulation checks** cover:

- **Setup builds exactly the lists in [`../01-sharepoint/lists.csv`](../01-sharepoint/lists.csv):** column types, choices, defaults, ranges, indexes, unique key, views, settings and permissions.
- **The lists hold every column the frontend reads or writes.**
- **Setup re-runs** change nothing. On a half-built site, setup completes the lists and warns about what it won't fix.
- **Monthly cycle:** private reviews, links, re-runs, reminders, leap year and BST due dates.
- **Submit → lock.** Forced status values are normalised and lateness comes from the trusted record.
- **Complete → release.** Invalid decisions are reverted.
- **Failures** are reported, and one technician's failure doesn't block the others.
- **Team members (Flow 4):** access follows the Technicians list, including a full sync that removes anyone without an Active row.
- **Wellbeing (Flow 5) and the reminders:** private to one person, locked on submit, manager fields protected. 1.4: E12 (wellbeing) and E17 (appraisal) come from the Technicians dates – 7 days before, on the day, then weekly while overdue, active people only (also in summer time).
- **Feedback (Flow 6):** each item is locked to Owners before anything is emailed; the message is HTML-escaped; if the email fails the item is marked Failed, a short notice is tried and the run ends Failed; the flow's own updates never re-run it. Pre-set delivery columns can't stop the lock or email; more than 10 in a day from one person are Held; the Feedback list uses the `1-to-1 Submit` level (no alerts).
- **Solution 1.4:**
  - **Setup** on a 1.3 site adds the Owners-only, versioned *1-to-1 Amendments* list and the new Technicians / Monthly Reviews columns, and retires challenges (group off the list, items Owners-only, open ones closed as *Not agreed*, nothing deleted); a second run changes nothing.
  - **Flow 1:** no limit of 10 expectations, Shared before Individual; an earlier appraisal year carries on, a later or mistyped one stays out (also across 1 April); period boundaries copied to the technician's own review; a submission Flow 2 never processed is reported (E7).
  - **Flow 2:** a TL amendment after processing is cancelled – no email, no re-stamp, permissions unchanged – while a real submission is still processed.
  - **Flow 8:** a Draft never sends; Pending → exactly one E16 (month and link, no changes or reason) → Sent; its own update and a stale trigger send nothing; a failed email → Failed, a notice to the TL and a failed run; Retry (Resend) sends it.
- **Solution 1.5 – the action tracker:**
  - **Setup** creates the three Owners-only lists (unique `ActionKey` / `ClientKey` / `NoticeKey`, folders on Action Updates), adds `ActionsSyncedOn`, and writes `ActionsTrackerStart` once; a 1.4 site without the lists keeps working.
  - **Flow 3** adds each agreed action once (`mr<id>-<action id>`, owner, both deadlines in UK dates incl. BST, a *created* history entry), only for reviews released after the tracker started, then stamps `ActionsSyncedOn`; a release interrupted part-way is finished by **Flow 1** without duplicates.
  - **Flow 9** sets exactly Owners + the technician (Read) on each action and Owners + the technician (Submit) on their folder, creates the folder, repairs stray access, ignores the flow's own account, and is idempotent.
  - **Flow 10** takes identity from the folder (an item in another folder, the root or a folder with a second person is rejected; a forged ActionId is rejected), enforces the rules (waiting needs a reason; close-out requests only on technician-owned actions; nothing on closed actions), applies with the action's etag and retries once when the Team Leader saved in between, records each update once, locks it, and queues one E19 per close request; the history entry keeps the client key.
  - **Flow 11** sends E19 to the TL and E20 to the technician copied to the TL, escapes every value, never resends a Sent notice, cancels one for a closed action, records Failed with the attempt, and Retry sends it.
  - **Flow 1** creates E20 5 working days before the deadline (weekday −7, Saturday −5, Sunday −6 days), catches up, sends nothing after the deadline, one per action and deadline, in BST too; puts stuck updates and failed notices back in the queue.
- **Challenges (Flow 7, 1.3)** are no longer simulated: the flow is not in 1.4.
- **Third-round regressions:** reminders only to active people; a duplicate deactivated row doesn't remove access; a 23:58 submission stays on time; wellbeing labels and stamps restored while open; a used assessment is never re-shared.

**What the fake can't prove.** It follows SharePoint Online's documented behaviour, but it is not SharePoint. The import (§2) and the setup run (§3) in [`IMPORT_GUIDE.md`](IMPORT_GUIDE.md), plus plan section H, are the real tests.

## Changing something

1. Edit `tools/schema.py` (lists) or `tools/flows.py` (flows).
   - If you change a column, update [`../01-sharepoint/lists.md`](../01-sharepoint/lists.md) and `lists.csv` too; the simulation compares them.
2. Bump `VERSION` in `tools/build.py`. Import the new zip as an **Upgrade**.
3. Run `tools/run_all.sh`. Everything must pass.
4. Commit `src/`, the zip and the builder page together.

**Fixed IDs.** The flow GUIDs in `flows.py` and the solution unique name `ESGOneToOne` must never change. Changing them makes the next import create duplicate flows instead of upgrading.

## Design notes

**Nothing tenant-specific is in these files.**

- The site and the TL email are environment variables, set at import.
- Group and permission-level IDs, and the list GUIDs used for item permissions (Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Feedback, and – only to retire it – 1-to-1 Challenges), are looked up by name each run. There is no Config sheet of IDs to copy.

**Setup only adds.** It never deletes a list, column or item. It never changes an existing permission level; it warns instead. On lists it removes only the site Members/Visitors groups and your own direct entry, so that Owners stays the only entry, as plan D.2 requires. The one exception is retiring challenges (1.4): it also removes the `1-to-1 Technicians` group from *1-to-1 Challenges*, makes those items Owners-only and closes open challenges as *Not agreed* – still deleting nothing.

**Flows 4 (Team members) and 5 (Wellbeing)** are new in 1.1 (`flow_team`, `flow_wellbeing` in `tools/flows.py`). Flow 6 (Feedback, 1.2, `flow_feedback`), Flow 8 (Amendment notice, 1.4, `flow_amendment`) and flows 9–11 (1.5, `flow_action_access`, `flow_action_update`, `flow_action_notice`) followed. They are all in the solution and in the legacy packages, but have no by-hand build sheet; they are covered by `tools/simulate.py`. Flow 7 (Challenge, 1.3) was removed in 1.4; its flow ID is not reused, and an upgraded environment keeps the old flow until you delete it (`../MIGRATION_1_4.md` step 10). Flow 4 does a full sync: anyone in the `1-to-1 Technicians` group without an Active row in Technicians is removed.

**Flows 1–3 match** [`../03-flows/FLOW_BUILD_SHEETS.md`](../03-flows/FLOW_BUILD_SHEETS.md) step for step, with two improvements:

- IDs are found at run time.
- Each flow stops with a clear "run setup first" failure if the permission levels or lists are missing.
