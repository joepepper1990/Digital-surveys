# Upgrade to solution 1.5.0.0 and page 5.1.0 – deployment order

From: solution **1.4.0.0** and page **5.0.0**.
To: solution **1.5.0.0** (`04-solution/ESGOneToOne_1_5_0_0_unmanaged.zip`) and page **5.1.0** (`02-frontend/one-to-one.html` + `one-to-one.js`).

**Nothing in this repository has been run against the live tenant.** Do each step only with approval. Every step can be repeated safely. Nothing in this upgrade deletes or rewrites existing data.

## A fresh tracker – no import

The action tracker **starts empty**. There is no import tool and no import step.

- Setup 1.5 records the moment it ran (the *1-to-1 Settings* item `ActionsTrackerStart`).
- Only reviews **released after that moment** have their agreed actions added to the tracker (by flow 3 at release, or by flow 1's daily check if flow 3 couldn't finish).
- Actions agreed in earlier reviews stay exactly where they are, in each review's `ActionsJson`, and are shown in that review as *"Agreed before action tracking started"*. They are not changed, moved or deleted. If any of them still matter, add them on the Actions page with **+ New action**.

## What changes in the tenant

| Where | Change | Data |
|---|---|---|
| 1-to-1 Actions | New list, Owners only. Flow 9 shares each item with its technician (Read) | New, empty |
| 1-to-1 Action Updates | New list with folders, Owners only. Flow 9 gives each technician one folder only they can add to | New, empty |
| 1-to-1 Action Notices | New list, Owners only (the E19 / E20 outbox) | New, empty |
| Manager Reviews | 1 new column: `ActionsSyncedOn` | Added empty; existing values untouched |
| 1-to-1 Settings | 1 new item: `ActionsTrackerStart` (written once) | New |
| Flow 1 | Adds the agreed actions of releases flow 3 couldn't finish; creates E20 reminders 5 working days before each deadline; puts stuck updates and failed emails back in the queue | — |
| Flow 3 | After it releases a review, adds the agreed actions to the tracker (once each), then stamps `ActionsSyncedOn`. A failure here never undoes the release | — |
| Flow 9 | New: *9 Action access*. Arrives **Off** | — |
| Flow 10 | New: *10 Action update*. Arrives **Off** | — |
| Flow 11 | New: *11 Action notice* (E19 / E20). Arrives **Off** | — |
| The page | Actions page rebuilt; technicians get *My actions*; *Outstanding actions* on both review screens; agreed actions are read-only once released | — |

## Order

1. **Back up.**
   - Export Manager Reviews and 1-to-1 Settings to CSV (open the list → **Export → Export to CSV**).
   - Keep `ESGOneToOne_1_4_0_0_unmanaged.zip` and the current page files (download `one-to-one.html` / `one-to-one.js` from the Custom Layouts library) so you can go back.
2. **Turn off Flow 1.** Power Automate → **Solutions → ESG 1-to-1** → *1 Daily scheduler* → **Turn off**.
3. **Import** `ESGOneToOne_1_5_0_0_unmanaged.zip` as an upgrade, exactly as in `04-solution/IMPORT_GUIDE.md`:
   - keep the same connections and environment variables;
   - leave "Enable plugin steps and flows" unticked;
   - flows 9, 10 and 11 arrive **Off**.
4. **Run *0 Setup (run once)*** and wait for its email, *ESG 1-to-1 setup: complete*. It creates the three lists, their unique keys, indexes and folders setting, adds `ActionsSyncedOn`, and writes `ActionsTrackerStart` (only the first time). If the subject says *items to check*, read the list in the email first.
5. **Turn on flows 2, 3, 4, 5, 6, 8, 9, 10 and 11**, in that order. **Leave Flow 1 off** for now.
6. **Upload the page.**
   1. Replace `one-to-one.html` and `one-to-one.js` in **Welcome Web Part – Custom Layouts**.
   2. On the 1-to-1 page: **Edit → Welcome web part → Reset layout cache → Republish**.
   3. The top bar should show **v5.1.0**, and the Team Leader's **Actions** page shows the *What needs you* tiles.
7. **Turn on Flow 1.**
8. **Run the tenant-only checks** below (T1–T16). The quickest way is one test release with a test technician.

**Coming straight from 1.3.0.2 / page 4.5.0 (1.4 never installed):** import 1.5 directly – Setup 1.5 also does everything Setup 1.4 did (the 1.4 columns, the Amendments list, retiring challenges). Follow the order above, with these additions from `MIGRATION_1_4.md`:
- in step 1, back up every list;
- in step 2, also turn off *7 Challenge*;
- after step 6, enter each person's dates (`MIGRATION_1_4.md` step 7) before turning on Flow 1;
- later, with separate approval, delete Flow 7.

Tenant checks T1–T11 in `MIGRATION_1_4.md` then apply as well.

**If you upload the page before step 4:** it still works as 5.0 did. It reads only the columns and lists that exist, the Actions page lists what was agreed (read-only), and a banner says to run Setup 1.5. Technicians see no *My actions* tab until Setup has run.

**If you turn on flow 3 before flow 9:** nothing is lost. Actions are added but not yet shared; *Needs your attention* lists them as *not shared yet*, and turning flow 9 on (or **Repair sharing**) shares them.

## Going back

1. Turn off flows 1, 9, 10 and 11.
2. Re-upload the 5.0.0 page files, then Reset layout cache and Republish.
3. Import `ESGOneToOne_1_4_0_0_unmanaged.zip`.
4. Turn flows 2–6, 8 and 1 back on.

The three new lists, `ActionsSyncedOn` and the `ActionsTrackerStart` item stay, unused; nothing reads them. Reviews and their `ActionsJson` were never changed by 1.5, so the 5.0 page shows them exactly as before. (Actions progressed in the tracker are not copied back into the reviews.)

## Tenant-only checks

These can't be proven in the local tests (see `TEST_REPORT_1_5.md` for what was).

| # | Check | How |
|---|---|---|
| T1 | Flows 1, 3 and 9–11 activate after import (no `WorkflowOperationParametersExtraParameter`, no `secureData` errors) | Turn each on. Every call to the new lists is a REST request and every write to a late column is a REST MERGE; the validator rejects connector steps on them and `secureData` on variables. |
| T2 | Setup 1.5 email says *complete*; the three lists exist with the unique keys | List settings → each key column → *Enforce unique values: Yes* (ActionKey, ClientKey, NoticeKey). Action Updates → Advanced settings → folders: Yes. |
| T3 | `ActionsTrackerStart` is written once | Run Setup again: the item's value doesn't change. |
| T4 | Flow 3 adds a released review's actions once each | Release a test review with two actions: two items in 1-to-1 Actions (`mr<id>-<action id>`), `ActionsSyncedOn` set on the review. Release again or run flow 1: still two. |
| T5 | Flow 9 sets the exact permissions | On the test action: *Manage access* shows only Owners and the test technician (Read). In 1-to-1 Action Updates the folder `u<their id>` has Owners and the technician (1-to-1 Submit) only. The flow's own account may also appear with Full Control (SharePoint keeps it when breaking inheritance); flow 9 ignores it. |
| T6 | A technician can add an update only to their own folder, and their update works through Limited Access | As the test technician: *My actions* → send an update. It shows *received – being recorded*, then *recorded ✓* after flow 10 runs. As a second test technician, try `…/Lists/OneToOneActionUpdates` – they see only their own folder. |
| T7 | A technician can't read another person's action | As test technician B, open the page with `?actionId=<A's action id>`: nothing of A's is shown, and the REST call for that item returns *not found*. |
| T8 | Flow 10 identity holds with real folder paths | Check one *Applied* update's run: `In_own_folder` is true and `Sender_id` matches the technician. |
| T9 | Flow 10's etag retry | Open an action's **Update…** dialog, have the test technician send an update, then save: the page says it changed and reloads; both changes are in the history. |
| T10 | E19 sends once; E20 timing | Ask to close on a test action: one E19. Set a test deadline 5 working days ahead, run flow 1: one E20 to the technician, copied to you. Run flow 1 again: no second email. |
| T11 | A failed email shows in *Needs your attention* and Resend works | Optional: temporarily point the Team Leader email variable at an invalid address on a test copy only. Never change the live variable for this. |
| T12 | Date-only values round-trip on the live regional settings (UK, London) | Change a test action's deadline on the Actions page and reload: same day. The page also reads every action date back after saving and says if it differs. |
| T13 | The reset tool lists the tracker group only after its own tick box | `RESET_PROCEDURE.md`, step 5. Look only – don't delete anything without separate approval. |
| T14 | The Welcome layout loads 5.1.0 for a technician | As the test technician: *My actions* tab present, no other person's names anywhere. |
| T15 | A technician can't rename or change their update folder | 1-to-1 Action Updates → List settings → Advanced settings: *Create and Edit access* = "Create items and edit items that were created by the user". As the test technician, try to rename their `u<id>` folder (and a REST `validateUpdateListItem` on it): refused. |
| T16 | The history column's real limit | List settings → HistoryJson is *Multiple lines of text*, plain text. Optional: on a test action, send 50 updates and check the action still saves. |
