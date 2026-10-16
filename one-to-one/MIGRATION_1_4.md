# Upgrade to solution 1.4.0.0 and page 5.0.0 – deployment order

From: solution **1.3.0.2** and page **4.5.0**.
To: solution **1.4.0.0** (`04-solution/ESGOneToOne_1_4_0_0_unmanaged.zip`) and page **5.0.0** (`02-frontend/one-to-one.html` + `one-to-one.js`).

**Nothing in this repository has been run against the live tenant.** Do each step only with approval. Every step can be repeated safely. Steps 2 and 10 are the only ones that turn something off or delete something, and step 10 needs its own approval.

## What changes in the tenant

| Where | Change | Data |
|---|---|---|
| Technicians | 4 new columns: `NextWellbeingDate`, `AppraisalCycleStart`, `AppraisalHistoryJson`, `AppraisalBoundaries` | Added empty, so existing values are untouched |
| Monthly Reviews | 1 new column: `AppraisalBoundaries` | Added empty |
| 1-to-1 Amendments | New list, Owners only | New |
| 1-to-1 Challenges | Retired: group removed, items made Owners-only, any open challenge set to *Not agreed* | **Kept** |
| Manager Reviews | `Challenge*` columns no longer used | Kept |
| Flow 1 | Reminders now come from the Technicians dates (E12 wellbeing, new E17 appraisal: 7 days before, on the day, weekly while overdue); boundaries copied to new reviews; no limit of 10 expectations; Shared before Individual; earlier years carry on; a missed Flow 2 run is reported | — |
| Flow 2 | A change by the Team Leader's account to a review it has already processed is cancelled (not a resubmission) | — |
| Flow 7 | **Not in 1.4.** An import never deletes a flow, so you turn it off (step 2) and delete it later (step 10) | — |
| Flow 8 | New: *8 Amendment notice* (E16 to the technician). Arrives **Off** | — |

## Order

1. **Back up.**
   - Export each list to CSV (open the list → **Export → Export to CSV**): Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Feedback, 1-to-1 Challenges.
   - Keep `ESGOneToOne_1_3_0_2_unmanaged.zip` and the current `one-to-one.html` / `one-to-one.js` (download them from the Custom Layouts library) so you can go back.
2. **Turn off Flows 7 and 1.** Power Automate → **Solutions → ESG 1-to-1** → *7 Challenge* → **Turn off**; *1 Daily scheduler* → **Turn off**.
3. **Import** `ESGOneToOne_1_4_0_0_unmanaged.zip` as an upgrade, exactly as in `04-solution/IMPORT_GUIDE.md`:
   - keep the same connections and environment variables;
   - leave "Enable plugin steps and flows" unticked;
   - Flow 8 arrives **Off**.
4. **Run *0 Setup (run once)*** and wait for its summary email, *ESG 1-to-1 setup: complete*. It adds the columns and the Amendments list and retires challenges. If the subject says *items to check*, read the list in the email first.
5. **Turn on flows 2, 3, 4, 5, 6 and 8**, in that order. **Leave 1 and 7 off.**
6. **Upload the page.**
   1. Replace `one-to-one.html` and `one-to-one.js` in **Welcome Web Part – Custom Layouts**.
   2. On the 1-to-1 page: **Edit → Welcome web part → Reset layout cache → Republish**.
   3. The top bar should show **v5.0.0**.
7. **Enter the dates**, in ⚙ **Settings → Team**, for each person:
   - **Appraisal period start.** The date their last appraisal was actually completed. Reviews before it are kept together as an "earlier period".
   - **Next appraisal** (already there – check it).
   - **Next wellbeing.** *Needs your attention* offers the date from their last completed assessment ("Use it"), but only you decide.

   Then **Save settings**. Nothing is calculated or moved automatically.
8. **Turn on Flow 1.**
9. *(Optional, separate approval.)* **The one-time test-data reset**, with Flow 1 off while you do it: see `RESET_PROCEDURE.md`.
10. *(Separate approval.)* **Delete Flow 7** from the solution once you're happy. Its runs and the challenge records stay in the list.

**If you upload the page before step 4:** it still works. It reads only the columns that exist, released reviews are read-only, and a banner says to run Setup 1.4. Amendments and the new dates appear once Setup has run.

## Going back

1. Turn off flows 1 and 8.
2. Re-upload the 4.5.0 page files, then Reset layout cache and Republish.
3. Import `ESGOneToOne_1_3_0_2_unmanaged.zip`.
4. Turn Flow 7 back on if you want challenges again.

The new columns and the Amendments list stay, unused; nothing reads them. No existing data was changed apart from open challenges being closed as *Not agreed*.

## Tenant-only checks

These can't be proven in the local tests.

| # | Check | How |
|---|---|---|
| T1 | Flows 2–6 and 8 activate after import (no `WorkflowOperationParametersExtraParameter`, no `secureData` errors) | Turn each on. All writes to columns added after their list was created are REST MERGE; the validator rejects connector writes to them and `secureData` on variables. |
| T2 | Setup 1.4 email says *complete* | Step 4 |
| T3 | Flow 2's trigger body carries **Editor** (it does in SharePoint's "When an item is created or modified") | Amend a submitted review. Flow 2's run shows *Cancelled* at *Amendment_not_a_submission*, and no E3 arrives. |
| T4 | Flow 8 sends one E16 per amendment, and its own updates don't start it again | Amend a review. You get one run *Succeeded*, the item shows *Sent*, and no second run. |
| T5 | `recycle()`: the Team Leader allowed, a technician refused | Delete permanently a retired expectation (TL). A technician has no Delete in 1-to-1 Edit / Read / Submit, so SharePoint refuses it with 403. |
| T6 | Version history is kept on 1-to-1 Amendments | List settings → Versioning: Yes, 100 |
| T7 | The Amendments list is Owners only | List settings → Permissions: only Owners, Full Control |
| T8 | A technician cannot open the Amendments list | As a test technician, `…/Lists/OneToOneAmendments` returns *not found / access denied* |
| T9 | The Welcome layout picker lists **ESG 1-to-1 reset tool**, and it is removed afterwards | `RESET_PROCEDURE.md` steps 4 and 11 |
| T10 | Real data after migration | The TL enters the period starts and dates (step 7). Check one person's profile shows "N rated reviews of M months". |
| T11 | Date-only values written from the page round-trip on the live regional settings (UK, London) | Settings → Team: save a date and reload. The page also verifies every date write itself. |
