# ESG 1-to-1 — configuration reference (page 5.0.0 / solution 1.4)

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
| Lists (display names) | `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings`, `1-to-1 Feedback`, `1-to-1 Amendments`, `1-to-1 Actions`, `1-to-1 Action Updates`, `1-to-1 Action Notices` (and, on a site upgraded from 1.3, the retired `1-to-1 Challenges` – keep its name while it exists) |
| Columns | Every internal name in [`01-sharepoint/lists.md`](01-sharepoint/lists.md) |
| Choice values | ReviewStatus, ReviewState, ActionsStatus, AppliesTo, AssessmentStatus, DeliveryStatus, NotifyStatus (1-to-1 Amendments), Q4–Q6 Yes/No, the three Q9 / FollowUpDecision sentences (the first has an em dash —), and from 1.5: action Status, Owner, update Kind / Outcome / ProcessState, notice Kind / Status |
| Settings items | Titles `Bands`, `Reminders`, `Labels` and (1.5) `ActionsTrackerStart` in `1-to-1 Settings` – never edit or delete `ActionsTrackerStart` |
| Folders | The `u<number>` folders in 1-to-1 Action Updates (one per technician, made by flow 9) – never rename, move or delete them |
| Permission levels | `1-to-1 Edit`, `1-to-1 Read`, `1-to-1 Submit` |
| Group | `1-to-1 Technicians` |
| Page | `SitePages/OneToOne.aspx` (links in old emails point at it) |
| Layout | `ESG 1-to-1` (the `data-name` in `one-to-one.html`) |
| List URLs | `Lists/Technicians`, `Lists/AppraisalExpectations`, `Lists/MonthlyReviews`, `Lists/ManagerReviews`, `Lists/WellbeingAssessments`, `Lists/OneToOneSettings`, `Lists/OneToOneFeedback`, `Lists/OneToOneAmendments`, `Lists/OneToOneActions`, `Lists/OneToOneActionUpdates`, `Lists/OneToOneActionNotices` (the flows find several of them by URL, and the page uses `OneToOneActionUpdates` to find each technician's folder; Setup also finds the retired `Lists/OneToOneChallenges` by URL) |
| Solution | `ESGOneToOne`, flow names `ESG 1-to-1 \| 0…6`, `8 Amendment notice`, `9 Action access`, `10 Action update`, `11 Action notice` (there is no 7 from 1.4), environment variables `esg_SiteUrl` and `esg_ManagerEmail` |

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
| 1-to-1 Amendments (1.4: reasons and before/after values of your amendments) | Full | **None.** They get E16 (month and link only) and see the current version of their review. |
| Other people's feedback | Full | None |
| Retired 1-to-1 Challenges (sites upgraded from 1.3) | Full | **None** from 1.4 |
| 1-to-1 Settings | Full | **Read** (bands, reminder days, on-screen names – no personal data) |
| OneToOne page, layouts library, Welcome Errors list | Full | **Read** |

## 4. Operating procedures

| When | Task |
|---|---|
| **Monthly, from the 1st** | Flow 1 creates the reviews at 07:00. Check **Team overview** shows everyone. Review submissions as E3 emails arrive: open the review, write feedback, rate expectations, add actions (close-out criteria and deadline), then **Complete & release**. After the deadline, use **Close – not submitted** for any review that wasn't submitted. |
| **Monthly, any time** | **Actions** page (1.5): work through the *What needs you* tiles – agree or decline close-out requests, follow up overdue actions and those with no progress for 30 days, check what waiting actions are waiting on. **Update…** adds a note, changes the status, moves a deadline (with a reason; the original is kept) or changes the owner (with a reason). Only you close or reopen an action. **+ New action** for anything agreed outside a review. |
| **At each monthly review (1.5)** | *Outstanding actions* on the review lists what is still open and what changed since last time. Record an outcome if useful (*Progress satisfactory*, *Further support required*, *Ready to close*). New actions you add to the review go into the tracker when you click **Complete & release**; once released they are read-only in the review and managed on the Actions page. |
| **Action emails and sharing (1.5)** | *Needs your attention* shows a failed or uncertain action email (**Resend** – it may arrive twice if the first got through), updates not recorded after an hour (check flow 10 is On), actions not shared yet (**Repair**; check flow 9 is On), and a release whose actions aren't all in the tracker after an hour (check flows 3 and 1 are On – flow 1 finishes them each morning). |
| **When an appraisal or wellbeing date is set or changes** | ⚙ **Settings → Team** → **Next appraisal** or **Next wellbeing** → type the date (e.g. 15/07/2027) or pick it with 📅 → **Save settings**. This updates the Technicians list (and the person's current review for the appraisal date); each date is read back to prove it saved as the same day. Moving the next appraisal date never moves a review between periods – it only changes the forecast end point and the E17 reminders. |
| **When an appraisal has been held** | ⚙ **Settings → Team → Mark appraisal completed…** → the date it was actually completed (today or earlier, after the current period start) and the new next due date (after the completion) → confirm. A new appraisal period starts; earlier periods stay selectable on the profile and report. A second completion in the same month replaces the first; **Undo last** reverses the latest. Before the first completion, set **Appraisal period start** (the date their last appraisal was completed). |
| **Reminder days or names** | ⚙ **Settings → Reminders** (up to three days, 1–28) or **→ Names** (app name and role words). Labels only – permissions never change. |
| **Wellbeing – at least yearly** | **Wellbeing → + Start** for the person (or from *Needs your attention*). They complete their part (E9); when they submit (E10) hold a private, hour-long conversation, record agreed arrangements and notes, then **Complete** (E11): it asks you to confirm or set the **next wellbeing date** (after today; never set automatically – a year on is only a suggestion). That date is the same as **Settings → Team → Next wellbeing**. Flow 1 emails you 7 days before, on the day and weekly while overdue (E12). You can start a new assessment at any time, e.g. after a return from absence. |
| **Quarterly (5 min)** | 1. **Site permissions:** Owners = only you; Members and Visitors empty. 2. `1-to-1 Technicians` contains only current technicians and has Read only on: the page, the layouts library, the Welcome Errors list and `1-to-1 Settings`. 3. In the layouts library, version history of `one-to-one.html` / `.js` shows only your uploads. 4. Spot-check one Monthly Review's *Manage access*: only Owners plus that technician. 5. **1-to-1 Amendments** permissions: Owners – Full Control only. 6. (1.5) **1-to-1 Actions, Action Updates, Action Notices**: Owners – Full Control only at list level; spot-check one action's *Manage access* (Owners + its technician only) and one folder in Action Updates (Owners + that technician only). |
| **New starter** | ⚙ **Settings → Team → + Add a person** → search → **Add**. Flow 4 gives them access to the page within about 5 minutes (E8). Set their next appraisal, next wellbeing and appraisal period start, and add any individual expectations. Their review appears the next morning (or run Flow 1). |
| **Leaver / long absence** | ⚙ **Settings → Team → Deactivate**. Flow 4 removes them from `1-to-1 Technicians` (E8) and no new reviews are created. Keep their records for the retention period. |
| **Amendment after submission (1.4)** | Open the review in the app. A released review is read-only: click **Amend…**; a submitted, not yet released one keeps **Save feedback**, and **Amend answers…** changes the technician's answers. Make the change → **Save amendment…** → give the reason. The page records the reason and the before/after values in the Owners-only **1-to-1 Amendments** list, then writes only the changed fields; Flow 8 emails the technician that it was amended (E16 – no content or reason). The review shows **Amended (n)** to you only. Don't edit reviews directly in SharePoint, and don't use `CorrectionLog` (no longer used). |
| **Amendment notices** | *Needs your attention* shows an amendment email that failed or hasn't gone after an hour (**Resend**), and an amendment that wasn't finished (**Send notice**, or **Dismiss** to mark it Cancelled). Flow 8 must be On. |
| **Annual expectation rollover** | An expectation's year is the **first** appraisal year it applies to; it carries on into later years until you retire it. Before a new appraisal year, add any new expectations with that year (they stay hidden until it starts). At the year end, **Retire** only those that no longer apply (Active = No). There is no limit on how many (a warning shows above 30 on one review). A retired expectation can be **Delete permanently** (to the site recycle bin for about 93 days); old reviews keep their own copy either way. |
| **Feedback from the page** | Arrives by email (E13) as people use the 💬 **Feedback** bubble. If an email fails, the item shows in *Needs your attention* – read it there and **Mark as read**. Everything sent stays in the **1-to-1 Feedback** list (Owners only). |
| **Monthly retention (first working day)** | Delete reviews whose month is **more than 24 months** ago, from **both** Monthly Reviews and Manager Reviews (filter by MonthKey), **Wellbeing Assessments completed (or, if never completed, created) more than 24 months ago**, **1-to-1 Feedback** items created more than 24 months ago, and **1-to-1 Amendments** items whose MonthKey is more than 24 months ago (they hold copies of review content). From 1.5: **1-to-1 Actions** closed more than 24 months ago, **together with** their items in 1-to-1 Action Updates and 1-to-1 Action Notices (same ActionId) – never the folders. On a site upgraded from 1.3, also the retired **1-to-1 Challenges** items created more than 24 months ago (or export and delete that list). Keeping the latest assessment of a current person for longer is an exception that needs HR's agreement. Record the deletion in a dated note, then empty the site recycle bin **and** the second-stage recycle bin. Skip this step if a Purview retention label does it automatically. |
| **Subject access request** | Export Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Amendments and (1.5) 1-to-1 Actions and their 1-to-1 Action Updates filtered by the person (**Export → CSV**). The technician can also use **Appraisal report → Print / Save as PDF** for their own view. |
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
| "Couldn't save … (403)" for a technician | Review already submitted (locked) | Expected. Changes after submission go through the TL (**Amend…**). |
| A banner says to run Setup 1.4; no **Amend…** button or new date boxes | Page 5.0.0 uploaded before Setup 1.4 ran | Run **0 Setup** (`MIGRATION_1_4.md` step 4); the page then shows them |
| **Save amendment** says the review was changed elsewhere | Someone (or another tab) saved the review after you started amending | Reload and amend again |
| An outlook shows no forecast | No appraisal period start set for that person | ⚙ Settings → Team → **Appraisal period start**, or *Needs your attention* → **Set start** |
| Complete & release did nothing | Flow 3 rejected it (not submitted, or closing before the deadline) | Read the "not done" email |
| Dates show a day out | Site regional settings not on London time | Site settings → **Regional settings**: Locale English (United Kingdom), time zone (UTC) Dublin, Edinburgh, Lisbon, London |
| Print / Save as PDF does nothing | Browser blocked the pop-up | Allow pop-ups for the SharePoint site |
| Flow failure emails | See the run link in the email | Fix, then re-run. Flow 1 is safe to re-run. |
| *"action needed"* naming `STOP_run_the_setup_flow_first` | Setup hasn't run, or a list or permission level was renamed | Run **ESG 1-to-1 \| 0 Setup** (safe to re-run) |
| A list, column or view went missing | Deleted or renamed by hand | Re-run **ESG 1-to-1 \| 0 Setup**. It re-adds anything missing; renamed columns must be renamed back. |
| (1.5) A technician's update stays *received – being recorded* | Flow 10 is off or failing | Turn **10 Action update** on; it picks up every waiting update. Flow 1 puts any stuck one back in the queue each morning. |
| (1.5) A technician gets *not sent – SharePoint refused it* | Their update folder isn't set up yet (flow 9 off, or they have no action yet) | Turn **9 Action access** on, or click **Repair sharing** on one of their actions; then they click **Send again** |
| (1.5) An update shows *not recorded: Not sent from your own update folder* | Someone changed the folder's permissions or moved the item | Click **Repair sharing** on one of their actions (flow 9 resets the folder); the technician sends it again |
| (1.5) *Agreed actions … aren't all in the tracker yet* | Flow 3 couldn't finish (or was off) | Check flows 3 and 1 are On; flow 1 adds the missing ones the next morning (or run it now). Nothing is ever added twice. |
| (1.5) *This action was updated since you opened it* | A technician's update (or another tab) changed it first | Nothing was saved; the page has reloaded it. Make your change again. |
| (1.5) An action email shows *delivery unknown* | Flow 11 stopped part-way through sending | Check with the person; **Resend** if needed (it may arrive twice). |

## 7. Frontend change log

| Date | Version | Change | By |
|---|---|---|---|
| 14-Oct-2026 | 4.0.0 | First production release: sidebar menu, appraisal outlook, multi-row actions, ⚙ Settings, reports | TL |
| 15-Oct-2026 | 4.1.0 | Top menu bar replaces the sidebar (team list under **Team ▾**); content fills the page width; layout scales up on large screens; page height follows its content; getting-started steps on an empty Team overview | TL |
| 15-Oct-2026 | 4.2.0 | Calendar date picker and flexible typing with verified saves; Settings tabs (Team: add/deactivate people; Reminders; Names; Bands); drag-to-reorder expectations; Needs your attention; selectable chart; Energy column removed; report footer; **Wellbeing assessments**. Needs solution 1.1.0.0. | TL |
| 15-Oct-2026 | 4.2.1 | Passed appraisal dates show **Overdue**; subtle "aim for the month before" prompts (team table, Needs your attention, outlook). Solution **1.1.1.0**: Flow 1 no longer fails to turn on after an upgrade from 1.0. | TL |
| 15-Oct-2026 | 4.2.2 | Independent review fixes: a technician's view hides any record that isn't theirs and shows feedback only once released; out-of-range ratings can't break pages; leaving without saving really discards; messages stay visible; Escape closes dialogs; Settings asks before closing with unsaved changes; wording in the appraisal month ("due this month"). Solution **1.1.2.0**: Flow 4 does a full group sync (removes anyone without an Active row); the daily problem email still goes out if the wellbeing check fails; wellbeing reminders only for completed assessments of active people. | TL |
| 15-Oct-2026 | 4.3.0 | 💬 **Feedback bubble** (bottom-right, everyone): report a fault or suggest an improvement; emailed to the line manager by Flow 6. Undelivered feedback shows in *Needs your attention*. Needs solution **1.2.0.0** and Setup re-run (adds the *1-to-1 Feedback* list), then Flow 6 turned on. | TL |
| 16-Oct-2026 | 4.4.0 | **Auto-save** (technician form, wellbeing form, and the line manager's review until it's released) with a quiet *Saved hh:mm* line; time left on the form; optional and *No* sections fold to one line; **Since last time** at the top of a technician's form (what they raised last month, your replies, their actions). With solution **1.2.1.0** (re-run Setup) from the independent testing round: Flow 6 trusts only the item's lock (not columns the sender can write), caps emails at 10 per person per day (the rest are *Held* and grouped in *Needs your attention*), and the group gets a narrower `1-to-1 Submit` level on the Feedback list (no alerts/delete/versions); Flow 5 puts back anything the person changes outside their own answers while the assessment is open, and stops if two people hold one; Flow 2 stamps the real submission time; Flow 1 reminds only active people; Flow 4 keeps access while any row is Active. Page: fixes for answers hidden by No, bad stored data, double clicks, duplicate names, reminders setting, auto-save timing; wellbeing points hidden until shown in *Since last time*; formatting (compact bubble, one-row top bar, no stacked messages, sticky Settings buttons, print layout). | TL |
| 16-Oct-2026 | 4.5.0 | **Clearer forms:** unanswered required questions have a subtle orange border (Yes/No and rating buttons too); **Submit** with gaps turns them red and jumps to the first, and each clears as it's answered (also the wellbeing form's steps and your action rows); optional questions are never marked. **Words, not numbers, for technicians:** rating buttons, outlook (band and coloured bar; trend *Improving / Steady / Dipping / Too early to tell*), *My appraisal*, charts and their appraisal report show bands and words only – your screens keep the numbers; the coloured bar follows the bands in ⚙ Settings. **Focus areas:** *To move up to <next band>, focus on* the three expectations with the lowest average rating this appraisal period (*Keep it up* in the top band) on the outlook, *My appraisal* and report section 1. **⚑ Challenge:** a technician can challenge the ratings, overall feedback or agreed actions on their latest released review; you both agree it resolved, or it closes as *Not agreed* at the close-by date (report section 7, *Needs your attention*, a chip on Monthly reviews). Desktop only (phones out of scope). Needs solution **1.3.0.0**: re-run Setup (adds the *1-to-1 Challenges* list and the `Challenge…` columns on Manager Reviews), then turn on **Flow 7 Challenge** (E14, E15); Flow 1 also closes overdue challenges. | TL |
| 16-Oct-2026 | 5.0.0 | **Appraisal periods** from actual completion dates (Settings → Team: Next appraisal, Days to go, Next wellbeing, Appraisal period start, *Mark appraisal completed…*, *Undo last*); period selector on profile and report. **Missed months** left out of averages, forecast, trend, on-time and streak ("N rated reviews of M months · K missed"). **Amendments:** released reviews read-only until *Amend…*, *Amend answers…* on submitted ones, reason required, restricted audit in *1-to-1 Amendments*, E16 by Flow 8, *Amended (n)* for you only. **Wellbeing date** on the Technicians record, confirmed on completion. **Expectations:** no limit of 10, Shared before Individual, years carry on until retired, Shared card plus one per person, *Delete permanently* for retired ones. **Challenges removed.** Screen clean-up (no workload/energy/outcome charts or chart switcher, no "Today" in the title bar, *Feedback* pill). Needs solution **1.4.0.0** – follow `MIGRATION_1_4.md` (Setup re-run, Flow 7 off and later deleted, Flow 8 on, E12 / E17 reminders from the Team dates). One-time reset tool: `RESET_PROCEDURE.md`. | TL |
