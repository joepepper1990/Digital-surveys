# One-time test-data reset – procedure

Use this **once**, before go-live, to clear 1-to-1 records that were created while testing. Do it only after the upgrade to 1.4 / page 5.0.0 (see `MIGRATION_1_4.md`) and only with written approval to delete data in the live site.

## What it removes, and what it never touches

**Removes, only the records you tick** (each one goes to the site recycle bin and can be restored for about 93 days):

- Monthly Reviews
- Manager Reviews
- Wellbeing Assessments
- 1-to-1 Feedback
- 1-to-1 Challenges (retired list, if it is still on the site)
- 1-to-1 Amendments
- Appraisal Expectations – **opt-in only**. These are your real set-up, so they are never ticked by "Select all".

**Never touched.** These lists aren't in the tool at all, and its one delete function refuses anything outside the list above.

- **Technicians**: people, accounts, Active, next appraisal date, next wellbeing date, period start, appraisal history
- **1-to-1 Settings**: bands, reminders, labels
- List and item permissions, the 1-to-1 Technicians group, site settings, flows

## The two files

| File | Where it goes |
|---|---|
| `02-frontend/reset/one-to-one-reset.html` | Welcome Web Part – Custom Layouts library (temporary) |
| `02-frontend/reset/one-to-one-reset.js` | Same library, next to it (temporary) |

## Steps

1. **Approval.** Get written approval to delete test data in the live site. Note the date.
2. **Back up the lists.** Export each list to Excel: open it, then **Export → Export to CSV**. Do this for Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Feedback, 1-to-1 Amendments and Appraisal Expectations. Keep the files somewhere private, because they hold personal data. The tool makes its own JSON backup as well.
3. **Turn Flow 1 off.** In **Power Automate → Solutions → ESG 1-to-1**, turn off **1 Daily scheduler**, so it can't create or remind about anything while you work.
4. **Make a temporary page.**
   1. Upload the two files to **Welcome Web Part – Custom Layouts**.
   2. Create a new page called *Reset (temporary)*. Don't add it to navigation.
   3. Add the **Welcome** web part and choose the layout **ESG 1-to-1 reset tool**.
   4. In **Page details → Permissions**, make sure only Owners can open it.
   5. Publish it.
5. **Inventory and choose.** The tool reads every list and shows each record with its person, month and status. Use **Filter by person** and **Filter by month**, tick the records to remove, or use **Select all shown (except expectations)**.
   - A monthly review and its manager review are always ticked (and unticked) together. Half a pair left behind would stay visible, and Flow 1 would create that month again and re-send the link.
   - Months are UK months.
6. **Back up.** Click **Download backup**. It saves a JSON file with every column of every ticked record. If you change the selection afterwards, you must download a new backup before going on.
7. **Dry run.** Click **Run the dry run**. It lists exactly what would be deleted, per list and per record, and changes nothing. Check the list.
8. **Confirm.**
   1. Tick **Flow 1 is turned off**.
   2. Type the phrase shown, for example `DELETE 42 RECORDS`, exactly.
   3. Click **Delete**.
9. **Verify.**
   - The tool re-reads every list and shows how many records were deleted, how many failed and how many are still there, plus what is left in each list.
   - Click **Download the report** and keep it with the backup.
   - If anything failed, the report says which record and why. Fix the cause and run the tool again for those records only.
10. **Check the page.** Open the 1-to-1 page as yourself. Team, Settings → Team (dates, period starts) and the expectations you kept should be exactly as before.
11. **Remove the tool.**
    1. Delete the temporary page.
    2. Delete both reset files from the Custom Layouts library.
    3. Empty them from the site recycle bin if you want them gone straight away. This removes only the tool, not the deleted records.
12. **Turn Flow 1 back on.**

## If you need something back

**Site contents → Recycle bin** lists every deleted record by its title. Select it and click **Restore**. It comes back with its permissions and version history. The JSON backup is a second copy.

## Who can use it

- **The Team Leader.** The page shows the tool only to a site owner (someone with Manage Permissions).
- **A technician** would see "Team Leader only". This is a convenience, not the security. The real protection is that technicians' permission levels (1-to-1 Edit, Read, Submit) have no Delete, so SharePoint refuses `recycle()` for them. This was tested locally; confirm it once in the tenant (see `MIGRATION_1_4.md`, tenant-only checks).
