# ESG 1-to-1 — configuration reference (v4)

This is the operating manual for the live system. Keep the **filled-in copy** (with real URLs and IDs) **inside the 1-to-1 site** or your OneDrive, **never in this repository**. This copy holds placeholders only.

## 1. Config sheet

Fill this in once, during the build. These values are used only inside the Power Automate flows.

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
| Lists (display names) | `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `1-to-1 Settings` |
| Columns | Every internal name in [`01-sharepoint/lists.md`](01-sharepoint/lists.md) |
| Choice values | ReviewStatus, ReviewState, ActionsStatus, AppliesTo, Q4–Q6 Yes/No, and the three Q9 / FollowUpDecision sentences (the first has an em dash —) |
| Settings item | Title `Bands` in `1-to-1 Settings` |
| Permission levels | `1-to-1 Edit`, `1-to-1 Read` |
| Group | `1-to-1 Technicians` |
| Page | `SitePages/OneToOne.aspx` (links in old emails point at it) |
| Layout | `ESG 1-to-1` (the `data-name` in `one-to-one.html`) |

If a list title ever has to change, edit `CONFIG.lists` at the top of `one-to-one.js` and the list chosen in each flow action.

## 3. Who can see what (summary of plan D.4)

| | TL (Owners, Site Collection Admin) | Technician (in `1-to-1 Technicians`) |
|---|---|---|
| Technicians list | Full | None |
| Appraisal Expectations | Full | None. They see their own wording via the snapshot on their review. |
| Their own Monthly Review | Full | **Edit** until submitted, then **Read** |
| Other technicians' Monthly Reviews | Full | None |
| Their own Manager Review | Full | None until the TL completes it, then **Read** (feedback, TL ratings, actions) |
| 1-to-1 Settings | Full | **Read** (band thresholds only, no personal data) |
| OneToOne page, layouts library, Welcome Errors list | Full | **Read** |

## 4. Operating procedures

| When | Task |
|---|---|
| **Monthly, from the 1st** | Flow 1 creates the reviews at 07:00. Check **Team overview** shows everyone. Review submissions as E3 emails arrive: open the review, write feedback, rate expectations, add actions (close-out criteria and deadline), then **Complete & release**. After the deadline, use **Close – not submitted** for any review that wasn't submitted. |
| **Monthly, any time** | **Actions** page: close actions that are done, and agree new deadlines for overdue ones. |
| **When an appraisal date is set or changes** | ⚙ **Settings** → enter the date (DD-MMM-YYYY) → **Save settings**. This updates the Technicians list and the technician's current review. |
| **Quarterly (5 min)** | 1. **Site permissions:** Owners = only you; Members and Visitors empty. 2. `1-to-1 Technicians` contains only current technicians and has Read only on: the page, the layouts library, the Welcome Errors list and `1-to-1 Settings`. 3. In the layouts library, version history of `one-to-one.html` / `.js` shows only your uploads. 4. Spot-check one Monthly Review's *Manage access*: only Owners plus that technician. |
| **New starter** | Add them to **Technicians** (Person, Active = Yes) and to the `1-to-1 Technicians` group. Set their appraisal date in ⚙ Settings. Their review appears the next morning. |
| **Leaver / long absence** | Technicians → **Active = No**. Remove a leaver from `1-to-1 Technicians`. Keep their records for the retention period. |
| **Correction after submission** | At the technician's request, edit the item in SharePoint (or in the app, for TL feedback). Add a dated reason to **CorrectionLog** on the Manager Review. Version history records the change. |
| **Annual expectation rollover** | Before the new appraisal year starts, add the new year's expectations on the **Expectations** page (or grid view). On the last day of the old year, **Retire** the old ones (Active = No). **Never delete them.** New reviews pick up the new set, and old reviews keep their snapshot. |
| **Annual retention (April)** | Delete reviews whose month is **more than 24 months** ago, from **both** Monthly Reviews and Manager Reviews (filter by MonthKey). Record the deletion in a dated note, then empty the site recycle bin **and** the second-stage recycle bin. Skip this step if a Purview retention label does it automatically. |
| **Subject access request** | Export Monthly Reviews and Manager Reviews filtered by the technician (**Export → CSV**). The technician can also use **Appraisal report → Print / Save as PDF** for their own view. |
| **TL handover** | 1. Make the new TL a site owner **and Site Collection Admin**, and remove the old TL. 2. Re-own the three flows, or rebuild their connections under the new TL. Update `varManagerEmail` in each flow. 3. No frontend change is needed. |

## 5. Updating the frontend

1. Get the corrected `one-to-one.html` / `one-to-one.js`.
2. Run the local tests: `node tools/build-mock.js && node test/run-tests.js` (see [`02-frontend/README.md`](02-frontend/README.md)).
3. Transfer the files through the approved route and upload them to **Welcome Web Part - Custom Layouts**, choosing **Replace**.
4. Hard-refresh the page (Ctrl+F5). The footer of the sidebar shows the version.
5. To roll back: library → file → **Version history → Restore**.

Record every change in the change log below.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Technician sees a blank page or an "access request" | Group missing Read on the page, the layouts library or the Welcome Errors list | Grant `1-to-1 Technicians` Read (plan D.6) |
| Technician's outlook uses default bands after you changed them | Group missing Read on `1-to-1 Settings` | Grant Read on that list |
| Technician: "Review not found" | Link is for someone else's review, or Flow 1 hasn't granted access yet | Check the Monthly Review's *Manage access*; re-run Flow 1 |
| TL sees the technician view | You're not Site Collection Admin / Owner on this site | Add yourself (Stage 0B finding B10a) |
| "Couldn't save … (403)" for a technician | Review already submitted (locked) | Expected. Corrections go through the TL. |
| Complete & release did nothing | Flow 3 rejected it (not submitted, or closing before the deadline) | Read the "not done" email |
| Dates show a day out | Site regional settings not on London time | Part 1, step 4 |
| Print / Save as PDF does nothing | Browser blocked the pop-up | Allow pop-ups for the SharePoint site |
| Flow failure emails | See the run link in the email | Fix, then re-run. Flow 1 is safe to re-run. |

## 7. Frontend change log

| Date | Version | Change | By |
|---|---|---|---|
| DD-MMM-YYYY | 4.0.0 | First production release: sidebar menu, appraisal outlook, multi-row actions, ⚙ Settings, reports | TL |
