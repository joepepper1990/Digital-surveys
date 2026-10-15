# ESG 1-to-1 — configuration reference (v4)

This is the operating manual for the live system. Keep the **filled-in copy** (with real URLs and IDs) **inside the 1-to-1 site** or your OneDrive, **never in this repository**. This copy holds placeholders only.

## 1. Config sheet

With the imported solution ([`04-solution/IMPORT_GUIDE.md`](04-solution/IMPORT_GUIDE.md)), only **two values** are needed:

| Environment variable | Value |
|---|---|
| **ESG 1-to-1 Site URL** | `https://<tenant>.sharepoint.com/sites/<site>` (no trailing slash) |
| **ESG 1-to-1 Team Leader email** | the TL mailbox |

You enter both during import. To change them later: **Solutions → Default solution → Environment variables → Current value**.

The group, role and list IDs are looked up by the flows at run time. You need the table below only if you **build the flows by hand** from the build sheets:

| Value | Where it comes from | Used in |
|---|---|---|
| TL email (lower case) | `<Site URL>/_api/web/currentuser` → `Email` | `varManagerEmail`, all flows |
| Site URL | browser address bar, e.g. `https://<tenant>.sharepoint.com/sites/<site>` | Flow site addresses |
| Owners group ID | `<Site URL>/_api/web/associatedownergroup` → `Id` | `varOwnersId` |
| Full Control role ID | `<Site URL>/_api/web/roledefinitions` → *Full Control* (normally `1073741829`) | `varFullControlId` |
| 1-to-1 Edit role ID | same page → *1-to-1 Edit* | `varEditId` (Flow 1) |
| 1-to-1 Read role ID | same page → *1-to-1 Read* | `varReadId` (Flows 2, 3) |
| Page link | `<Site URL>/SitePages/OneToOne.aspx` | `varPageLink`, all flows |

**The frontend needs none of these.** `one-to-one.js` has no site URL, email or ID in it. It works out the site from the page, and works out the TL from SharePoint permissions.

## 2. Names you must never change

Renaming any of these silently breaks the app or the flows.

| Kind | Names |
|---|---|
| Lists (display names) | `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings` |
| Columns | Every internal name in [`01-sharepoint/lists.md`](01-sharepoint/lists.md) |
| Choice values | ReviewStatus, ReviewState, ActionsStatus, AppliesTo, AssessmentStatus, Q4–Q6 Yes/No, and the three Q9 / FollowUpDecision sentences (the first has an em dash —) |
| Settings items | Titles `Bands`, `Reminders` and `Labels` in `1-to-1 Settings` |
| Permission levels | `1-to-1 Edit`, `1-to-1 Read` |
| Group | `1-to-1 Technicians` |
| Page | `SitePages/OneToOne.aspx` (links in old emails point at it) |
| Layout | `ESG 1-to-1` (the `data-name` in `one-to-one.html`) |
| List URLs | `Lists/Technicians`, `Lists/AppraisalExpectations`, `Lists/MonthlyReviews`, `Lists/ManagerReviews`, `Lists/WellbeingAssessments`, `Lists/OneToOneSettings` (the flows find three of them by URL) |
| Solution | `ESGOneToOne`, flow names `ESG 1-to-1 \| 0…5`, environment variables `esg_SiteUrl` and `esg_ManagerEmail` |

If a list title ever has to change, edit `CONFIG.lists` at the top of `one-to-one.js` and the list chosen in each flow action.

## 3. Who can see what (summary of plan D.4)

| | TL (Owners, Site Collection Admin) | Technician (in `1-to-1 Technicians`) |
|---|---|---|
| Technicians list | Full | None |
| Appraisal Expectations | Full | None. They see their own wording via the snapshot on their review. |
| Their own Monthly Review | Full | **Edit** until submitted, then **Read** |
| Other technicians' Monthly Reviews | Full | None |
| Their own Manager Review | Full | None until the TL completes it, then **Read** (feedback, TL ratings, actions) |
| Their own Wellbeing Assessment | Full | **Edit** until they submit, then **Read** (set by Flow 5) |
| Other people's Wellbeing Assessments | Full | None |
| 1-to-1 Settings | Full | **Read** (bands, reminder days, on-screen names – no personal data) |
| OneToOne page, layouts library, Welcome Errors list | Full | **Read** |

## 4. Operating procedures

| When | Task |
|---|---|
| **Monthly, from the 1st** | Flow 1 creates the reviews at 07:00. Check **Team overview** shows everyone. Review submissions as E3 emails arrive: open the review, write feedback, rate expectations, add actions (close-out criteria and deadline), then **Complete & release**. After the deadline, use **Close – not submitted** for any review that wasn't submitted. |
| **Monthly, any time** | **Actions** page: close actions that are done, and agree new deadlines for overdue ones. |
| **When an appraisal date is set or changes** | ⚙ **Settings → Team** → type the date (e.g. 15/07/2027) or pick it with 📅 → **Save settings**. This updates the Technicians list and the person's current review; each date is read back to prove it saved as the same day. |
| **Reminder days or names** | ⚙ **Settings → Reminders** (up to three days, 1–28) or **→ Names** (app name and role words). Labels only – permissions never change. |
| **Wellbeing – at least yearly** | **Wellbeing → + Start** for the person (or from *Needs your attention*). They complete their part (E9); when they submit (E10) hold a private, hour-long conversation, record agreed arrangements, notes and the next review date (12 months on by default – bring it forward if needed), then **Complete** (E11). Flow 1 emails you 7 days before and on the review date (E12). You can start a new assessment at any time, e.g. after a return from absence. |
| **Quarterly (5 min)** | 1. **Site permissions:** Owners = only you; Members and Visitors empty. 2. `1-to-1 Technicians` contains only current technicians and has Read only on: the page, the layouts library, the Welcome Errors list and `1-to-1 Settings`. 3. In the layouts library, version history of `one-to-one.html` / `.js` shows only your uploads. 4. Spot-check one Monthly Review's *Manage access*: only Owners plus that technician. |
| **New starter** | ⚙ **Settings → Team → + Add a person** → search → **Add**. Flow 4 gives them access to the page within about 5 minutes (E8). Set their appraisal date and add any individual expectations. Their review appears the next morning (or run Flow 1). |
| **Leaver / long absence** | ⚙ **Settings → Team → Deactivate**. Flow 4 removes them from `1-to-1 Technicians` (E8) and no new reviews are created. Keep their records for the retention period. |
| **Correction after submission** | At the technician's request, edit the item in SharePoint (or in the app, for TL feedback). Add a dated reason to **CorrectionLog** on the Manager Review. Version history records the change. |
| **Annual expectation rollover** | Before the new appraisal year starts, add the new year's expectations on the **Expectations** page (or grid view). On the last day of the old year, **Retire** the old ones (Active = No). **Never delete them.** New reviews pick up the new set, and old reviews keep their snapshot. |
| **Annual retention (April)** | Delete reviews whose month is **more than 24 months** ago, from **both** Monthly Reviews and Manager Reviews (filter by MonthKey), and **Wellbeing Assessments completed more than 24 months ago** (keep the latest one for each current person). Record the deletion in a dated note, then empty the site recycle bin **and** the second-stage recycle bin. Skip this step if a Purview retention label does it automatically. |
| **Subject access request** | Export Monthly Reviews, Manager Reviews and Wellbeing Assessments filtered by the person (**Export → CSV**). The technician can also use **Appraisal report → Print / Save as PDF** for their own view. |
| **TL handover** | 1. Make the new TL a site owner **and Site Collection Admin**, and remove the old TL. 2. Give the new TL the solution's flows: add them as **co-owner**, then switch the three connection references to the new TL's connections (**Solutions → ESG 1-to-1 → Connection references**). 3. Update the **ESG 1-to-1 Team Leader email** environment variable. 4. No frontend change is needed. |

## 5. Updating the frontend

1. Get the corrected `one-to-one.html` / `one-to-one.js`.
2. Run the local tests: `node tools/build-mock.js && node test/run-tests.js` (see [`02-frontend/README.md`](02-frontend/README.md)).
3. Transfer the files through the approved route and upload them to **Welcome Web Part - Custom Layouts**, choosing **Replace**.
4. Edit the `OneToOne` page → Welcome web part settings (pencil) → **Reset layout cache** → **Republish**. Welcome otherwise keeps serving the old version for a while.
5. Hard-refresh the page (Ctrl+F5). The right-hand end of the top menu bar shows the version.
6. To roll back: library → file → **Version history → Restore**, then reset the layout cache again.

Record every change in the change log below.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| A saved date "goes back" or shows a different day | SharePoint read the date in another format (site or personal regional settings) | v4.2 verifies every date write and shows an error naming the fix. Set the site Locale to English (United Kingdom) and your own Microsoft 365 region to English (UK). |
| Someone added in ⚙ Settings → Team can't open the page | Flow 4 off or failed | Turn on **4 Team members**; check its run history |
| Wellbeing tab says "not set up yet" | Solution 1.1 not imported or setup not re-run | IMPORT_GUIDE §0 |
| Page still shows the old look, or the wrong version in the top menu bar | Welcome is serving its cached copy of the layout | Edit the page → web part settings → **Reset layout cache** → Republish, then Ctrl+F5 |
| Technician sees a blank page or an "access request" | Group missing Read on the page, the layouts library or the Welcome Errors list | Grant `1-to-1 Technicians` Read (plan D.6) |
| Technician's outlook uses default bands after you changed them | Group missing Read on `1-to-1 Settings` | Grant Read on that list |
| Technician: "Review not found" | Link is for someone else's review, or Flow 1 hasn't granted access yet | Check the Monthly Review's *Manage access*; re-run Flow 1 |
| TL sees the technician view | You're not Site Collection Admin / Owner on this site | Add yourself (Stage 0B finding B10a) |
| "Couldn't save … (403)" for a technician | Review already submitted (locked) | Expected. Corrections go through the TL. |
| Complete & release did nothing | Flow 3 rejected it (not submitted, or closing before the deadline) | Read the "not done" email |
| Dates show a day out | Site regional settings not on London time | Part 1, step 4 |
| Print / Save as PDF does nothing | Browser blocked the pop-up | Allow pop-ups for the SharePoint site |
| Flow failure emails | See the run link in the email | Fix, then re-run. Flow 1 is safe to re-run. |
| *"action needed"* naming `STOP_run_the_setup_flow_first` | Setup hasn't run, or a list or permission level was renamed | Run **ESG 1-to-1 \| 0 Setup** (safe to re-run) |
| A list, column or view went missing | Deleted or renamed by hand | Re-run **ESG 1-to-1 \| 0 Setup**. It re-adds anything missing; renamed columns must be renamed back. |

## 7. Frontend change log

| Date | Version | Change | By |
|---|---|---|---|
| DD-MMM-YYYY | 4.0.0 | First production release: sidebar menu, appraisal outlook, multi-row actions, ⚙ Settings, reports | TL |
| 15-Oct-2026 | 4.2.0 | Calendar date picker and flexible typing with verified saves; Settings tabs (Team: add/deactivate people; Reminders; Names; Bands); drag-to-reorder expectations; Needs your attention; selectable chart; Energy column removed; report footer; **Wellbeing assessments**. Needs solution 1.1.0.0. | TL |
| 15-Oct-2026 | 4.1.0 | Top menu bar replaces the sidebar (team list under **Team ▾**); content fills the page width; layout scales up on large screens; page height follows its content; getting-started steps on an empty Team overview | TL |
