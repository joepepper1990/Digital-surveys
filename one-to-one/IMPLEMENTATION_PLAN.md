# ESG Monthly Technician 1-to-1 — Implementation Plan (v1)

**Status:** Plan for approval. Nothing has been built or deployed.
**Scope:** 5–10 technicians, one Team Leader, Environmental Safety Group, Dungeness B.
**Platform:** Microsoft 365 only. This uses SharePoint Online lists, a Power Apps canvas app and Power Automate, with standard connectors only.

The finished system has five lists, one app with four screens and three flows.

---

## Contents

- [A. Recommended architecture](#a-recommended-architecture)
- [B. Minimum viable scope](#b-minimum-viable-scope)
- [C. SharePoint list schemas](#c-sharepoint-list-schemas)
- [D. Permissions](#d-permissions)
- [E. Power Apps specification](#e-power-apps-specification)
- [F. Power Automate specification](#f-power-automate-specification)
- [G. Deployment guide](#g-deployment-guide)
- [H. Testing](#h-testing)
- [I. Delivery estimate](#i-delivery-estimate)
- [J. Risks and decisions](#j-risks-and-decisions)
- [K. Ready-to-build artefacts](#k-ready-to-build-artefacts)
- [Summary and next step](#summary-and-next-step)

---

## A. Recommended architecture

### A.1 Decision: a standalone canvas app, embedded on a private SharePoint site

| Need | SharePoint list form customised with Power Apps | **Standalone canvas app** |
|---|---|---|
| Personal monthly link | List item URL. It opens SharePoint's chrome, and technicians see the list around it | `apps.powerapps.com/...&reviewId=123`, which opens directly on their review |
| Saving drafts | Possible, but the form's SubmitForm/validation model fights partial saves | `Patch` with no required fields, so drafts are trivial |
| Expectations (1–10, repeating) | Awkward. A gallery inside a list form, bound to one list | A normal gallery |
| Separate manager review screen and dashboard | Not supported. The form has one integration screen per list | Separate screens in one app |
| Data from three lists in one view | Clumsy | Natural |
| Technicians never see raw lists | Hard, because the form *is* the list | Easy |
| Build effort | Lower at first, but rises quickly with these needs | Moderate and predictable |

**Recommendation:** use **one canvas app** with four screens: technician review, technician history, manager dashboard and manager review. Embed it on the private site's home page for the Team Leader. Technicians reach it only through the emailed link.

Two alternatives were rejected:

- **Microsoft Forms and Lists forms.** They can't save drafts against a personal record and can't lock records.
- **Dataverse and model-driven apps.** They need premium licensing, which isn't justified here.

### A.2 How it fits together

```
                         PRIVATE SHAREPOINT SITE  (Owners = Team Leader only)
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │  Technicians          (manager only)                                          │
 │  Appraisal Expectations (manager only)                                        │
 │  Monthly Reviews      item-level: technician EDIT while draft, READ after     │
 │  Manager Reviews      item-level: manager only until released, then tech READ │
 │  Agreed Actions       (manager only)                                          │
 │  Home page: embedded app (dashboard) + quick links                            │
 └───────────────────────────────────────────────────────────────────────────────┘
        ▲  signed-in user's own permissions          ▲  Team Leader connection
        │  (SharePoint connector, delegated)         │  (owner, Manage Permissions)
 ┌──────┴──────────────┐                    ┌────────┴────────────────────────────┐
 │ Canvas app          │                    │ Flow 1  Daily scheduler (07:00 UK)  │
 │  scrTechReview      │                    │   create → protect → verify → email │
 │  scrTechHistory     │                    │   overdue flags, reminders 20th/27th│
 │  scrDashboard  (TL) │                    │ Flow 2  Review submitted → lock     │
 │  scrManagerReview   │                    │ Flow 3  Manager decision → release  │
 └─────────────────────┘                    └─────────────────────────────────────┘
```

### A.3 Microsoft 365 constraints that shape the design

1. **SharePoint has no column-level security.** If a technician can read a review item, they can read every column on it. Manager feedback therefore lives in a **separate list (Manager Reviews)**. That list stays manager-only until the review is completed, and only then is the technician given Read.
2. **The canvas app is not the security boundary.** The SharePoint connector runs as the signed-in user, so whatever the app filters, a technician can still call the list through SharePoint, REST or Graph. SharePoint permissions are the only boundary, and app filtering is only a convenience.
3. **Technicians cannot change permissions.** Locking needs *Manage Permissions*, so a flow running under the Team Leader's connection does it. The flows use **automated SharePoint triggers** and never take a technician-supplied input such as a review ID. This means a technician can't steer a privileged flow at someone else's record.
4. **Setting permissions needs "Send an HTTP request to SharePoint".** This action is part of the standard SharePoint connector, not the premium HTTP connector. The native "Grant access" action can only grant built-in Edit/View roles, and Edit includes *delete*. The REST calls let us reset inheritance, grant a no-delete custom level and **verify the result before emailing a link**.
5. **SharePoint limits unique permission scopes per list.** The recommended maximum is about 5,000. The design uses **two unique scopes per technician per month**, which is about 240 a year. Expectation snapshots are therefore stored as JSON inside the review item rather than as child items. A child list would mean up to 11 scopes per review and up to 10 permission operations per technician per month.
6. **Lookup columns to lists a technician can't read are unreliable.** All relationships therefore use a **text key** (`ReviewKey`) rather than lookups.
7. **SharePoint triggers poll every 1–5 minutes.** There is a short window between a technician pressing Submit and the flow locking the record. See J, risk R1.
8. **SharePoint stores times in UTC.** Every date calculation in the flows converts with the time zone `GMT Standard Time`, which handles BST automatically.
9. **A canvas app or flow can't be packaged and validated outside the corporate tenant.** The fastest reliable route is to **build manually**, using pasteable formulas and action-by-action flow definitions.

### A.4 Assumptions (simplest option chosen and documented)

| # | Assumption |
|---|---|
| AS1 | Flows run under the **Team Leader's own account** (v1). A service account is optional later (J, D1). |
| AS2 | **Late submission is allowed.** The review stays editable after the deadline, is flagged *Overdue*, and is recorded as *Submitted late*. The Team Leader can **Close – Not Submitted**, which locks it. |
| AS3 | Expectations apply when **Active = Yes**. The appraisal year is recorded on each expectation and in each snapshot, but the selection isn't filtered by year. Retiring old expectations (Active = No) controls rollover. |
| AS4 | Expectations added mid-month appear from the next month. Snapshots are taken when the monthly review is created. |
| AS5 | Q2 (challenges), the Q3 comment and Q7 (feedback for manager) are optional. All other questions are mandatory, and details are mandatory only when Yes is chosen. |
| AS6 | When a Yes/No question is answered **No**, any text in its hidden detail field is **cleared on save**. Hidden fields are never stored, never validated and never shown to the manager. |
| AS7 | Emails contain **links only**, never answers or feedback. |
| AS8 | Technicians are **not** members of the site. They get access only through item-level permissions set by the flows. |
| AS9 | Daily run time is **07:00 UK time**, and the creation run on the 1st is idempotent and self-healing on the following days. |

---

## B. Minimum viable scope

This is built first and demonstrated end to end with two test technician accounts and the Team Leader. Stages follow the requested order, with one deliberate change. The **creation and permission part of Flow 1 is built in Stage 1** and run manually, because the core journey can't be tested securely without correctly protected records. Stage 2 then adds the schedule, reminders and overdue handling.

| Stage | Delivers | Done when |
|---|---|---|
| **1 — Functional MVP** | Private site, all 5 lists and permissions. Flow 1 creation block (manual trigger). Technician screen Q1–Q7 and Q9, with draft and submit. Flow 2 (lock and notify). Manager review screen with feedback and actions. Flow 3 (complete, release and notify). | Test technician A drafts, submits and is locked. The TL reviews and completes. A sees the feedback, and B sees nothing of A's at any point. |
| **2 — Monthly automation** | Flow 1 on its daily schedule: idempotent creation, personal links, overdue flags, reminders on the 20th and 27th, and failure alerts. | Date-override tests pass (H). No duplicates on rerun. |
| **3 — Appraisal tracking** | Appraisal Expectations list in use. Snapshots in Flow 1. Q8 gallery for the technician and for manager feedback. Rollover procedure. | Shared and individual expectations appear correctly, and editing an expectation doesn't change past reviews. |
| **4 — Dashboard and verification** | Dashboard screen, technician history, SharePoint home page, Outstanding Actions view, full privacy and operational tests, clean-down and go-live. | All tests in H pass, privacy tests are signed off and test data is removed. |

**Deferred (not v1):** an in-app expectations editor (the SharePoint list view is enough), charts, auto-save, Teams notifications, a multi-manager model, a service account and retention automation.

---

## C. SharePoint list schemas

**General rules (all lists)**

- Create every column with the **exact internal name shown (no spaces)**. You can rename display names afterwards if you want, but the flows and app use internal names.
- Only `Title` stays required at list level. Every other "required" rule is enforced by the app at Submit, because SharePoint-required columns would block saving drafts.
- **Choice columns:** turn "Allow fill-in choices" **off**. Where the default is shown as *none*, **delete the default value**, because SharePoint pre-fills the first choice otherwise.
- **Multiple lines of text:** use plain text, "Append changes" No, and leave "Unlimited length" on for JSON columns.
- **List settings → Advanced settings:** set **Attachments: Disabled**, **Allow items to appear in search results: No** and **Offline client availability: No**.
- **Versioning:** create a version for each edit and keep 100 major versions. This is the audit trail.
- **Never use lookup columns.** Use `ReviewKey` text keys instead.

### C.1 `Technicians` (manager only)

| Column | Type | Req | Default | Notes |
|---|---|---|---|---|
| Title | Single line | Yes | — | Display name, for humans only |
| Technician | Person (people only, single) | Yes* | — | The Microsoft 365 account |
| TechnicianAadId | Single line | No | — | Entra object ID. **Filled automatically by Flow 1.** This is the stable identity key. Indexed. |
| Active | Yes/No | — | Yes | Indexed. Set to No for leavers and long absences. |

### C.2 `Appraisal Expectations` (manager only)

| Column | Type | Req | Default | Notes |
|---|---|---|---|---|
| Title | Single line | Yes | — | Expectation title |
| Measures | Multiple lines (plain) | Yes* | — | Description, measures and success criteria |
| AppraisalYear | Single line | Yes* | — | e.g. `2026/27` |
| Scope | Choice: `Shared`, `Individual` | Yes* | Shared | |
| Technician | Person (single) | No | — | Required when Scope = Individual (check with the "Needs attention" view) |
| SortOrder | Number (0 dp) | — | 100 | Lower numbers appear first |
| Active | Yes/No | — | Yes | Indexed |

**Views:** *Active* (Active = Yes, grouped by Scope then Technician), *Needs attention* (Scope = Individual and Technician is empty) and *Retired* (Active = No).

**Rule:** a technician gets all active Shared expectations plus their own active Individual expectations, sorted by SortOrder, **up to 10**. Flow 1 warns the TL if more than 10 apply.

### C.3 `Monthly Reviews` (one item per technician per month; technician answers)

| Column | Type | Req | Default | Notes |
|---|---|---|---|---|
| Title | Single line | Yes | — | `Jane Smith – 2026-11` |
| ReviewKey | Single line | Yes* | — | `{TechnicianAadId}_{yyyy-MM}`. **Enforce unique values = Yes**, which also creates an index. This is the duplicate guard. |
| Technician | Person (single) | Yes* | — | |
| TechnicianAadId | Single line | Yes* | — | Indexed |
| MonthKey | Single line | Yes* | — | `2026-11`. Indexed. |
| MonthStart | Date only | Yes* | — | `2026-11-01` |
| DueDate | Date and time | Yes* | — | Last day of the month at 23:59:59 UK time, stored as UTC |
| Status | Choice: `Not Started`, `Draft`, `Submitted`, `Completed`, `Closed - Not Submitted` | Yes* | Not Started | Indexed. The only workflow state. |
| IsOverdue | Yes/No | — | No | Set by Flow 1 when past the due date and not submitted. It's a **flag, not a status**. |
| SubmittedOn | Date and time | — | — | Set by Flow 2 (server time) |
| SubmittedLate | Yes/No | — | No | Set by Flow 2 |
| CompletedOn | Date and time | — | — | Set by Flow 3 |
| LinkSentOn | Date and time | — | — | Set by Flow 1 after permissions are verified and the email is sent |
| Q1WentWell | Multi-line | — | — | |
| Q2Issue / Q2Impact / Q2Tried / Q2Support | Multi-line ×4 | — | — | |
| Q3WorkloadRating | Number, 0 dp, min 1, max 5 | — | — | Workload trend history |
| Q3WorkloadComment | Multi-line | — | — | |
| Q4WellbeingRaise | Choice: `Yes`, `No` | — | *none* | |
| Q4WellbeingDetail | Multi-line | — | — | Cleared when the answer is No |
| Q5PlanningRaise | Choice: `Yes`, `No` | — | *none* | |
| Q5PlanningDetail | Multi-line | — | — | |
| Q6DevRaise | Choice: `Yes`, `No` | — | *none* | |
| Q6DevWhat / Q6DevWhy | Multi-line ×2 | — | — | |
| Q7ManagerFeedback | Multi-line | — | — | |
| ExpectationsJson | Multi-line (plain, unlimited) | — | — | Snapshot and technician progress (see below) |
| Q9FollowUp | Choice (3 values, see E.2) | — | *none* | |

`ExpectationsJson` format (snapshot written by Flow 1, with `rating` and `comment` filled in by the technician):

```json
[{"id":12,"title":"Complete RP supervisor module","measures":"Pass assessment by Q4","year":"2026/27","rating":3,"comment":"Module 2 done"}]
```

`title`, `measures` and `year` are **copied** when the review is created, so later edits to the expectation never change history.

### C.4 `Manager Reviews` (one per Monthly Review; manager feedback and manager decisions)

| Column | Type | Req | Default | Notes |
|---|---|---|---|---|
| Title | Single line | Yes | — | Same as the review |
| ReviewKey | Single line | Yes* | — | **Unique**, so it's indexed |
| Technician | Person (single) | Yes* | — | |
| TechnicianAadId | Single line | Yes* | — | Indexed |
| MonthKey | Single line | Yes* | — | Indexed |
| Status | Choice: `In Progress`, `Completed`, `Closed - Not Submitted`, `Reopen` | Yes* | In Progress | **The TL's commands.** Flow 3 acts on them. |
| ProcessedStatus | Single line | — | — | Written by Flow 3 and used to prevent duplicates |
| FB_Q1 … FB_Q7, FB_Q9 | Multi-line ×8 | — | — | Manager feedback per section |
| FB_Overall | Multi-line | — | — | Overall summary |
| ExpectationFeedbackJson | Multi-line (plain, unlimited) | — | — | `[{"id":12,"feedback":"Good progress"}]` |
| FollowUpDecision | Choice (same 3 values as Q9) | — | *none* | The TL's **override** of the technician's preference |
| MeetingDate | Date only | — | — | Optional, if a 1-to-1 is arranged |
| ActionsSummary | Multi-line | — | — | Written by the app at completion so the technician can see the agreed actions |
| CompletedOn | Date and time | — | — | Set by Flow 3 |
| CompletedBy | Person | — | — | Set by Flow 3 from the identity that marked it Completed |
| ReleasedOn | Date and time | — | — | Set by Flow 3 |
| CorrectionLog | Multi-line | — | — | Reason for any reopening or correction, with versions as the audit trail |

### C.5 `Agreed Actions` (manager only)

| Column | Type | Req | Default | Notes |
|---|---|---|---|---|
| Title | Single line | Yes | — | The action |
| ReviewKey | Single line | — | — | Indexed. The review where it was agreed. |
| Technician | Person (single) | — | — | |
| TechnicianAadId | Single line | — | — | |
| MonthKey | Single line | — | — | |
| Owner | Choice: `Technician`, `Team Leader`, `Both` | — | Technician | |
| DueDate | Date only | — | — | |
| Status | Choice: `Open`, `Done`, `Cancelled` | — | Open | Indexed |
| CompletedOn | Date only | — | — | |
| Notes | Multi-line | — | — | |

**Views:** *Outstanding* (Status = Open, sorted by DueDate ascending, grouped by Technician). This is the "Outstanding Actions" navigation area. Also *All*.

Technicians see the actions agreed in a given review through `Manager Reviews.ActionsSummary` once it's released. They never get access to this list.

### C.6 Relationships

```
Technicians.TechnicianAadId ──1:N──▶ Monthly Reviews.TechnicianAadId
Monthly Reviews.ReviewKey   ──1:1──▶ Manager Reviews.ReviewKey
Monthly Reviews.ReviewKey   ──1:N──▶ Agreed Actions.ReviewKey
Appraisal Expectations.ID   ──copied into──▶ Monthly Reviews.ExpectationsJson[].id
                                           ──▶ Manager Reviews.ExpectationFeedbackJson[].id
```

Only the Monthly Reviews and Manager Reviews lists ever carry item-level permissions.

---

## D. Permissions

### D.1 Site level

| Setting | Value |
|---|---|
| Site type | **Communication site** (classic permission groups, no Microsoft 365 group, so there's no group membership to leak) |
| Site Owners group | **Team Leader only**, plus optionally one named, HR-approved backup owner (decision D4) |
| Site Members / Visitors | **Empty.** Remove "Everyone except external users" if present. |
| Sharing | Gear → Site permissions → *Change how members can share* → **Only site owners can share files, folders, and the site**. **Allow access requests: Off.** |
| External sharing | Only people in your organisation, or none (a SharePoint admin sets this if it isn't already the tenant default) |
| Sensitivity label | Apply the organisation's HR/Confidential label if one exists |
| Regional settings | Time zone **(UTC) Dublin, Edinburgh, Lisbon, London**, locale English (UK) |

### D.2 List level

Break permission inheritance on all five lists. Remove the Members and Visitors groups so that only **Owners (Full Control)** remains. This is defence in depth: if someone adds people to the site later, they still can't see the lists.

### D.3 Custom permission level

Create the permission level `1-to-1 Edit (no delete)` by copying **Contribute** and unticking:

- Add Items
- Delete Items
- Delete Versions
- Manage Personal Views
- Add/Remove Personal Web Parts
- Update Personal Web Parts

Keep View Items, Edit Items, Open Items, View Versions, View Pages, Open, Browse User Information, **Use Remote Interfaces** (required by Power Apps) and Use Client Integration Features.

### D.4 Item level (the only places a technician has access)

| Item | Technician access | When set | By |
|---|---|---|---|
| Monthly Review (Not Started / Draft) | `1-to-1 Edit (no delete)` on **their own item only** | At creation, **before** the email is sent | Flow 1 |
| Monthly Review (Submitted / Completed / Closed) | **Read** | On submit (Flow 2), on close (Flow 3), re-applied on complete (Flow 3) | Flows 2 and 3 |
| Monthly Review (reopened by TL) | `1-to-1 Edit (no delete)` again | On Reopen | Flow 3 |
| Manager Review (In Progress) | **None.** It inherits the manager-only list. | Created by Flow 1 with no permission work needed | — |
| Manager Review (Completed / Closed) | **Read** | On release | Flow 3 |
| Manager Review (reopened) | **None** again (inheritance reset) | On Reopen | Flow 3 |
| Technicians, Appraisal Expectations, Agreed Actions | **None, ever** | — | — |

**The standard permission routine (`SETPERM`).** Every permission change uses the same five REST calls. The routine is idempotent because it always starts from a clean state.

1. `resetroleinheritance`. The item reverts to the list's manager-only permissions, which is the safe direction.
2. `breakroleinheritance(copyRoleAssignments=false)`. This avoids copying list-level "Limited Access" entries for other technicians.
3. Add the **Owners group** with Full Control.
4. Add the **technician** with the required level (Edit (no delete) or Read).
5. **Verify.** Read the role assignments back. Only Owners, this technician and (if SharePoint auto-added it) the flow account may be present, and the technician must hold exactly the expected level. If any other principal is present, the flow **fails before any email is sent**.

**Why a technician can never receive a link to an unprotected record.** A new item is created in a list where only the Owners group has permissions, so it's private by default from the moment it exists. The technician is granted access, the grant is verified, and only then is the email sent. If any step fails, the item stays invisible to the technician, no email goes out, and the TL is alerted.

**Locking is enforced server-side.** After submission, the technician's permission on the item is **Read**, so SharePoint rejects any edit from the app, the list UI, REST or Graph. Completion and release are driven from the Manager Reviews list, which technicians can't write to, so a technician can't spoof a manager decision.

**Flow identity (least privilege in practice).** The flows use the TL's connection, because the TL is a site owner and needs Manage Permissions. Flows never accept an item ID or email from a technician. They react only to SharePoint item changes, which SharePoint has already authorised. Flow 2 ignores edits made by the TL or flow account, which prevents loops.

**Run history exposure.** Flow run history keeps action inputs and outputs for 28 days and is visible to flow owners. Turn on **Settings → Secure inputs / Secure outputs** for the trigger and for every *Get items* and *Get item* on Monthly Reviews and Manager Reviews. Don't add co-owners who aren't authorised to see review content.

**Administrators.** Global, SharePoint and Power Platform administrators can technically reach this data. That's normal for Microsoft 365, and it's covered by the organisation's admin access policies, not by this design. State this in the privacy notice.

### D.5 Retention and deletion (to be confirmed by HR or Data Protection, decision D3)

- **Retention period:** use the organisation's retention schedule for line-management and appraisal records. The placeholder is "current year plus N years", with N set by HR.
- **Mechanism:** if a Purview retention label exists for HR or appraisal records, set it as the **default label** on the Monthly Reviews, Manager Reviews and Agreed Actions lists. Otherwise, the Team Leader carries out a **documented annual deletion review** each April: filter by `MonthStart` older than the retention period, delete, and note it in a deletion log. Deleted items stay in the recycle bins for 93 days.
- **Leavers:** set `Active = No` and keep the records for the retention period. The leaver's account is disabled by IT, so their item permissions become inert.
- **Subject access requests:** the TL can export a technician's items, using the list view filtered by technician and *Export to CSV*, together with the matching Manager Reviews items.
- **Data minimisation:** Q4 guidance tells people not to enter medical details, and a "No" answer clears hidden text.

---

## E. Power Apps specification

### E.1 App setup

- Go to make.powerapps.com, then the environment your organisation uses for M365 apps (usually **Default**), then **Create → Blank app → Blank canvas app**. Name it **ESG 1-to-1** and choose the **Tablet** format.
- **Settings → Display:** Scale to fit **Off**, Lock aspect ratio **Off**. This lets you build a responsive layout with containers, which also reads acceptably on a phone.
- **Settings → General:** Data row limit **2000**. Make sure Named formulas, ParseJSON and Formula-level error management are on if they're shown as options.
- **Data:** add SharePoint, choose the site, and add `Monthly Reviews`, `Manager Reviews`, `Agreed Actions` and `Technicians`. **Don't** add Appraisal Expectations, because the TL edits it in SharePoint.
- **Controls:** use classic controls throughout (they're predictable). Every screen uses a vertical container with `LayoutOverflowY = Scroll`.
- **Sharing:** share the app with each technician as a **User**. When Power Apps offers to share the SharePoint data as well, **decline**. SharePoint item permissions are handled by the flows.

### E.2 `App.Formulas`

The two lines marked `// CONFIG` must be edited.

```powerfx
ManagerEmail = "team.leader@yourcompany.co.uk";          // CONFIG
SiteUrl      = "https://yourtenant.sharepoint.com/sites/ESG-1to1";   // CONFIG

IsManager = Lower(User().Email) = Lower(ManagerEmail);   // UI routing only — NOT security
MyAadId   = Lower(Text(User().EntraObjectId));           // fallback: Lower(Office365Users.MyProfileV2().id)

OptDedicated   = "Arrange a dedicated 1-to-1 discussion";
FollowUpOptions = [
    "Everything has been covered - no further discussion required at present",
    "Quick, informal catch-up in the field",
    "Arrange a dedicated 1-to-1 discussion"
];
YesNo = ["Yes", "No"];

WorkloadScale = Table(
    {Value: 1, Label: "1 – Very light: significantly below capacity"},
    {Value: 2, Label: "2 – Light: some spare capacity"},
    {Value: 3, Label: "3 – Manageable: appropriate workload"},
    {Value: 4, Label: "4 – Heavy: busy but manageable"},
    {Value: 5, Label: "5 – Excessive: struggling to manage"}
);

// Progress against an appraisal expectation — deliberately different wording from workload
ProgressScale = Table(
    {Value: 1, Label: "1 – Not started: no progress yet"},
    {Value: 2, Label: "2 – Early progress: behind where I'd expect"},
    {Value: 3, Label: "3 – On track: progressing as expected"},
    {Value: 4, Label: "4 – Strong progress: ahead of expectations"},
    {Value: 5, Label: "5 – Fully met: achieved and evidenced"}
);
```

**App.StartScreen** (this formula can't use variables, by design):

```powerfx
If(IsManager,
    If(IsBlank(Param("reviewId")), scrDashboard, scrManagerReview),
    scrTechReview)
```

There's no App.OnStart. Loading happens in each screen's OnVisible.

### E.3 Screen `scrTechReview` (technician questionnaire, a single scrolling page)

**Layout**, top to bottom inside `conMain` (vertical, scrolling):

1. **Header bar (sticky, outside the scroll area)**
   - `lblTitle`: `"Monthly 1-to-1 – " & Text(gReview.MonthStart, "mmmm yyyy")`
   - `lblDeadline`: `"Deadline: 23:59, " & Text(gReview.DueDate, "dddd d mmmm yyyy")`, coloured red when overdue
   - `lblStatus`: `gReview.Status.Value & If(gOverdue, " · OVERDUE", "") & If(gReview.SubmittedLate, " · submitted late", "")`
   - Buttons: **Save draft** (`btnSave`) and **Submit** (`btnSubmit`), visible when `gEditable`. **My previous reviews** (`btnHistory`) is always visible.
2. **Intro note** (label): "Save as often as you like. Short answers are fine. You can ask for a conversation at any time, and you don't need to wait for this form. Submitting this form doesn't replace any formal appraisal or meeting your role requires."
3. **Q1:** `txtQ1` (multi-line, 3 lines, hint "A few bullet points is fine").
4. **Q2:** four multi-line inputs `txtQ2Issue`, `txtQ2Impact`, `txtQ2Tried` and `txtQ2Support`, labelled 1–4. Hint: "Optional – leave blank if nothing to raise".
5. **Q3:** `rdoQ3` (Items `WorkloadScale`, Value field `Label`) and `txtQ3` (optional comments).
6. **Q4:** `rdoQ4` (Items `YesNo`). There's an always-visible guidance label (E.6). `txtQ4` has `Visible = rdoQ4.Selected.Value = "Yes"`.
7. **Q5:** `rdoQ5` and `txtQ5` (visible only on Yes). Hint: "Dates, availability, planned leave, courses, other commitments".
8. **Q6:** `rdoQ6`, with `txtQ6What` ("What would you like?") and `txtQ6Why` ("Why / what would it help with?"), both visible only on Yes.
9. **Q7:** `txtQ7`.
10. **Q8:** `galQ8` (Items `colExp`, flexible height). Each row has `lblExpTitle`, `lblExpMeasures` (small grey text with the year), `rdoQ8` (Items `ProgressScale`) and `txtQ8` ("Progress comments / evidence"). There's a scale explanation label above the gallery. If `colExp` is empty, show "No appraisal expectations are set for you this month."
11. **Q9:** `rdoQ9` (Items `FollowUpOptions`).
12. **Released feedback.** Under each section there's a grey box, `lblFbQn`, with `Visible = !IsBlank(gFeedback)` and text `"Team Leader: " & gFeedback.FB_Qn`. Under Q8 each gallery row shows `LookUp(colExpFb, id = ThisItem.id).feedback`. At the bottom there's an **Overall feedback / Agreed actions / Follow-up decision** panel, also visible only when `!IsBlank(gFeedback)`.
13. **Confirm dialog** `conConfirm` (an overlay container with `Visible = locConfirm`): "Submit your 1-to-1? You won't be able to change it afterwards." with **Submit** and **Cancel**.

**Common control properties**

- All inputs: `DisplayMode = If(gEditable, DisplayMode.Edit, DisplayMode.View)`
- Defaults:
  - `txtQ1.Default = gReview.Q1WentWell`
  - `rdoQ3.Default = LookUp(WorkloadScale, Value = gReview.Q3WorkloadRating).Label`
  - `rdoQ4.Default = gReview.Q4WellbeingRaise.Value`, and the same pattern for Q5, Q6 and Q9
  - `rdoQ8.Default = LookUp(ProgressScale, Value = ThisItem.rating).Label`
  - `txtQ8.Default = ThisItem.comment`

**`scrTechReview.OnVisible`**

```powerfx
If(IsBlank(gReview),
    Set(gReview, Coalesce(
        If(!IsBlank(Param("reviewId")), LookUp('Monthly Reviews', ID = Value(Param("reviewId")))),
        First(Sort(Filter('Monthly Reviews', TechnicianAadId = MyAadId), MonthStart, SortOrder.Descending))
    ))
);
// always re-read: picks up flow-side changes (lock, completion)
If(!IsBlank(gReview), Set(gReview, LookUp('Monthly Reviews', ID = gReview.ID)));
Set(gEditable, !IsBlank(gReview) && gReview.Status.Value in ["Not Started", "Draft"]
               && Lower(gReview.TechnicianAadId) = MyAadId);
Set(gOverdue, gReview.Status.Value in ["Not Started", "Draft"] && Now() > gReview.DueDate);
ClearCollect(colExp, ForAll(Table(ParseJSON(Coalesce(gReview.ExpectationsJson, "[]"))) As e,
    {id: Value(e.Value.id), title: Text(e.Value.title), measures: Text(e.Value.measures),
     year: Text(e.Value.year), rating: Value(e.Value.rating), comment: Text(e.Value.comment)}));
// returns blank unless SharePoint has released the item to this user
Set(gFeedback, LookUp('Manager Reviews', ReviewKey = gReview.ReviewKey));
ClearCollect(colExpFb, ForAll(Table(ParseJSON(Coalesce(gFeedback.ExpectationFeedbackJson, "[]"))) As f,
    {id: Value(f.Value.id), feedback: Text(f.Value.feedback)}));
UpdateContext({locConfirm: false})
```

If `gReview` is blank, show `lblNoAccess` instead of the form: "This review could not be found, or it isn't yours. Use the link in your latest email, or contact your Team Leader."

**Answer record and validation.** These go in `App.Formulas` as named formulas that reference the controls. If your Studio version rejects control references in named formulas, paste the same record inline into both Patch calls.

```powerfx
nfAnswers = {
    Q1WentWell: txtQ1.Text,
    Q2Issue: txtQ2Issue.Text, Q2Impact: txtQ2Impact.Text, Q2Tried: txtQ2Tried.Text, Q2Support: txtQ2Support.Text,
    Q3WorkloadRating: rdoQ3.Selected.Value,
    Q3WorkloadComment: txtQ3.Text,
    Q4WellbeingRaise: If(IsBlank(rdoQ4.Selected.Value), Blank(), {Value: rdoQ4.Selected.Value}),
    Q4WellbeingDetail: If(rdoQ4.Selected.Value = "Yes", txtQ4.Text, Blank()),
    Q5PlanningRaise: If(IsBlank(rdoQ5.Selected.Value), Blank(), {Value: rdoQ5.Selected.Value}),
    Q5PlanningDetail: If(rdoQ5.Selected.Value = "Yes", txtQ5.Text, Blank()),
    Q6DevRaise: If(IsBlank(rdoQ6.Selected.Value), Blank(), {Value: rdoQ6.Selected.Value}),
    Q6DevWhat: If(rdoQ6.Selected.Value = "Yes", txtQ6What.Text, Blank()),
    Q6DevWhy:  If(rdoQ6.Selected.Value = "Yes", txtQ6Why.Text,  Blank()),
    Q7ManagerFeedback: txtQ7.Text,
    ExpectationsJson: JSON(ForAll(galQ8.AllItems,
        {id: id, title: title, measures: measures, year: year,
         rating: rdoQ8.Selected.Value, comment: txtQ8.Text}), JSONFormat.Compact),
    Q9FollowUp: If(IsBlank(rdoQ9.Selected.Value), Blank(), {Value: rdoQ9.Selected.Value})
};

nfMissing = Concat(Filter(Table(
    {Ok: !IsBlank(Trim(txtQ1.Text)),                                Item: "Q1"},
    {Ok: !IsBlank(rdoQ3.Selected.Value),                            Item: "Q3 workload rating"},
    {Ok: !IsBlank(rdoQ4.Selected.Value),                            Item: "Q4 Yes/No"},
    {Ok: rdoQ4.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ4.Text)), Item: "Q4 details"},
    {Ok: !IsBlank(rdoQ5.Selected.Value),                            Item: "Q5 Yes/No"},
    {Ok: rdoQ5.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ5.Text)), Item: "Q5 details"},
    {Ok: !IsBlank(rdoQ6.Selected.Value),                            Item: "Q6 Yes/No"},
    {Ok: rdoQ6.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ6What.Text)), Item: "Q6 what is required"},
    {Ok: CountRows(Filter(galQ8.AllItems, IsBlank(rdoQ8.Selected.Value))) = 0, Item: "Q8 rating for every expectation"},
    {Ok: !IsBlank(rdoQ9.Selected.Value),                            Item: "Q9 follow-up preference"}
), !Ok), Item, ", ");
```

Hidden fields can't block submission. Every detail check is guarded by `<> "Yes"`, and hidden values are saved as blank.

**`btnSave.OnSelect`**

```powerfx
IfError(
    Set(gReview, Patch('Monthly Reviews', gReview, nfAnswers, {Status: {Value: "Draft"}}));
    Notify("Draft saved at " & Text(Now(), "hh:mm"), NotificationType.Success),
    Notify("Draft NOT saved – " & FirstError.Message, NotificationType.Error)
)
```

**`btnSubmit.OnSelect`**

```powerfx
If(!IsBlank(nfMissing),
    Notify("Before submitting, please complete: " & nfMissing, NotificationType.Error),
    UpdateContext({locConfirm: true}))
```

**`btnConfirmSubmit.OnSelect`**

```powerfx
IfError(
    Set(gReview, Patch('Monthly Reviews', gReview, nfAnswers, {Status: {Value: "Submitted"}}));
    Set(gEditable, false); UpdateContext({locConfirm: false});
    Notify("Submitted – your Team Leader has been notified.", NotificationType.Success),
    Notify("NOT submitted – " & FirstError.Message, NotificationType.Error)
)
```

**`btnHistory.OnSelect`:** `Navigate(scrTechHistory)`

### E.4 Screen `scrTechHistory`

- `galHistory.Items`: `Sort(Filter('Monthly Reviews', TechnicianAadId = MyAadId), MonthStart, SortOrder.Descending)`

  Permissions already restrict the result to the user's own items. The filter is only for neatness.
- Row: `Text(ThisItem.MonthStart, "mmmm yyyy")`, `ThisItem.Status.Value`, `"Workload: " & Coalesce(Text(ThisItem.Q3WorkloadRating), "–")`. This row is the chronological workload history.
- `OnSelect`: `Set(gReview, ThisItem); Navigate(scrTechReview)`

### E.5 Screen `scrManagerReview` (TL only)

**OnVisible**

```powerfx
If(IsBlank(gReview) && !IsBlank(Param("reviewId")),
    Set(gReview, LookUp('Monthly Reviews', ID = Value(Param("reviewId")))));
Set(gReview, LookUp('Monthly Reviews', ID = gReview.ID));
Set(gFeedback, LookUp('Manager Reviews', ReviewKey = gReview.ReviewKey));
ClearCollect(colExp, ForAll(Table(ParseJSON(Coalesce(gReview.ExpectationsJson, "[]"))) As e,
    {id: Value(e.Value.id), title: Text(e.Value.title), measures: Text(e.Value.measures),
     year: Text(e.Value.year), rating: Value(e.Value.rating), comment: Text(e.Value.comment)}));
ClearCollect(colExpFb, ForAll(Table(ParseJSON(Coalesce(gFeedback.ExpectationFeedbackJson, "[]"))) As f,
    {id: Value(f.Value.id), feedback: Text(f.Value.feedback)}));
ClearCollect(colActions, Filter('Agreed Actions', ReviewKey = gReview.ReviewKey));
Set(gMgrEditable, gFeedback.Status.Value in ["In Progress", "Completed"]);
UpdateContext({locConfirmComplete: false, locConfirmClose: false, locConfirmReopen: false})
```

**Layout:** a header showing the technician name, month, status chip, due date, submitted date and "Late" chip. If `gReview.Q9FollowUp.Value = OptDedicated`, show an amber banner: **"Technician has requested a dedicated 1-to-1"**.

Then, for each section Q1–Q7 and Q9:

- The technician's answer, as a **read-only label**. For No answers it shows "No".
- A **TL feedback input** (`txtFbQ1` … `txtFbQ9`, `Default = gFeedback.FB_Qn`). It's **always visible, including when the answer is No**.

Q8 uses `galFbQ8` (Items `colExp`). Each row shows the title, measures, technician rating (label from `ProgressScale`) and comment, plus `txtFbQ8` with `Default = LookUp(colExpFb, id = ThisItem.id).feedback`.

**Follow-up and actions panel**

- `ddFollowUp` (Items `FollowUpOptions`, AllowEmptySelection on, `Default = gFeedback.FollowUpDecision.Value`). The label reads "Override technician preference (leave blank to accept)".
- `dpMeeting` (MeetingDate).
- `txtFbOverall`.
- `galActions` (Items `colActions`) shows Title, Owner, Due and Status. The add-row controls are `txtActTitle`, `ddActOwner` (`["Technician","Team Leader","Both"]`), `dpActDue` and `btnAddAction`.

```powerfx
// btnAddAction.OnSelect
Patch('Agreed Actions', Defaults('Agreed Actions'), {
    Title: txtActTitle.Text, ReviewKey: gReview.ReviewKey, TechnicianAadId: gReview.TechnicianAadId,
    Technician: gReview.Technician, MonthKey: gReview.MonthKey,
    Owner: {Value: ddActOwner.Selected.Value}, DueDate: dpActDue.SelectedDate, Status: {Value: "Open"}});
ClearCollect(colActions, Filter('Agreed Actions', ReviewKey = gReview.ReviewKey));
Reset(txtActTitle); Reset(dpActDue)
```

**Feedback record** (named formula in App.Formulas):

```powerfx
nfFeedback = {
    FB_Q1: txtFbQ1.Text, FB_Q2: txtFbQ2.Text, FB_Q3: txtFbQ3.Text, FB_Q4: txtFbQ4.Text,
    FB_Q5: txtFbQ5.Text, FB_Q6: txtFbQ6.Text, FB_Q7: txtFbQ7.Text, FB_Q9: txtFbQ9.Text,
    FB_Overall: txtFbOverall.Text,
    ExpectationFeedbackJson: JSON(ForAll(galFbQ8.AllItems, {id: id, feedback: txtFbQ8.Text}), JSONFormat.Compact),
    FollowUpDecision: If(IsBlank(ddFollowUp.Selected.Value), Blank(), {Value: ddFollowUp.Selected.Value}),
    MeetingDate: dpMeeting.SelectedDate
};
```

**Buttons.** The manager never sets Completed, Closed or Reopen on the review item directly. They set a *command* on the manager-only item, and Flow 3 carries it out.

| Button | Enabled when | OnSelect (after a confirm dialog where noted) |
|---|---|---|
| **Save feedback** | `gMgrEditable` | `Set(gFeedback, Patch('Manager Reviews', gFeedback, nfFeedback)); Notify("Saved – not visible to the technician until you complete the review")` |
| **Complete & release** (confirm) | `gReview.Status.Value = "Submitted" && gFeedback.Status.Value = "In Progress"` | See below |
| **Close – not submitted** (confirm) | `gReview.Status.Value in ["Not Started","Draft"] && Now() > gReview.DueDate` | `Patch('Manager Reviews', gFeedback, nfFeedback, {Status: {Value: "Closed - Not Submitted"}})` |
| **Reopen for correction** (confirm with a mandatory reason, `txtReason`) | `gReview.Status.Value in ["Submitted","Completed","Closed - Not Submitted"]` | `Patch('Manager Reviews', gFeedback, {Status: {Value: "Reopen"}, CorrectionLog: Text(Now(), "dd/mm/yyyy hh:mm") & " Reopened: " & txtReason.Text & Char(10) & gFeedback.CorrectionLog})` |
| **Back to dashboard** | always | `Set(gReview, Blank()); Navigate(scrDashboard)` |

```powerfx
// btnConfirmComplete.OnSelect
IfError(
    Set(gFeedback, Patch('Manager Reviews', gFeedback, nfFeedback, {
        ActionsSummary: Concat(Filter('Agreed Actions', ReviewKey = gReview.ReviewKey && Status.Value <> "Cancelled"),
            "• " & Title & " (owner: " & Owner.Value & If(IsBlank(DueDate), "", ", due " & Text(DueDate, "dd mmm yyyy")) & ")",
            Char(10)),
        Status: {Value: "Completed"}}));
    Notify("Completed. The technician will be emailed within a few minutes.", NotificationType.Success);
    Navigate(scrDashboard),
    Notify("NOT completed – " & FirstError.Message, NotificationType.Error))
```

### E.6 Q4 guidance text (always shown above `rdoQ4`)

> **Please don't include medical diagnoses, medical history or details of treatment here.** You can simply say you'd like to talk about wellbeing, support or reasonable adjustments, and your Team Leader will arrange a conversation. Health matters, occupational health referrals and formal adjustment requests are handled confidentially through the company's HR and Occupational Health processes. Support is also available through the Employee Assistance Programme: **[EAP contact – CONFIG]**.

### E.7 Screen `scrDashboard` (TL only, the welcome dashboard)

**OnVisible**

```powerfx
Concurrent(
    ClearCollect(colTechs, Filter(Technicians, Active = true)),
    ClearCollect(colAllReviews, 'Monthly Reviews'),
    ClearCollect(colAllMgr, 'Manager Reviews'),
    ClearCollect(colOpenActions, Filter('Agreed Actions', Status.Value = "Open"))
);
ClearCollect(colRows, ForAll(colAllReviews As r, {
    ID: r.ID, Technician: r.Technician.DisplayName, TechnicianAadId: r.TechnicianAadId,
    MonthKey: r.MonthKey, MonthStart: r.MonthStart, Status: r.Status.Value,
    SubmittedOn: r.SubmittedOn, Late: r.SubmittedLate, Workload: r.Q3WorkloadRating,
    Overdue: r.Status.Value in ["Not Started", "Draft"] && Now() > r.DueDate,
    MgrStatus: Switch(r.Status.Value, "Submitted", "Awaiting review", "Completed", "Completed",
                      "Closed - Not Submitted", "Closed", "—"),
    FollowUp: Coalesce(LookUp(colAllMgr, ReviewKey = r.ReviewKey).FollowUpDecision.Value, r.Q9FollowUp.Value)
}))
```

This loads every review, which is fine up to the 2,000-row limit (about 16 years at 10 technicians). Section J notes the limit.

**Filters:** `ddMonth` (Items `Sort(Distinct(colAllReviews, MonthKey), Value, SortOrder.Descending)`, `Default = Text(Today(), "yyyy-mm")`, AllowEmptySelection on, where blank means all months) and `ddTech` (Items `Sort(colTechs, Title)`, AllowEmptySelection on, where blank means all technicians).

**KPI tiles.** These are plain labels in one horizontal row, using `KpiMonth = Coalesce(ddMonth.Selected.Value, Text(Today(),"yyyy-mm"))`.

| Tile | Formula |
|---|---|
| Month | `Text(DateValue(KpiMonth & "-01"), "mmmm yyyy")` |
| Active technicians | `CountRows(colTechs)` |
| Submitted | `CountRows(Filter(colRows, MonthKey = KpiMonth && Status in ["Submitted","Completed"]))` |
| Awaiting your review | `CountRows(Filter(colRows, MonthKey = KpiMonth && Status = "Submitted"))` |
| Completed | `CountRows(Filter(colRows, MonthKey = KpiMonth && Status = "Completed"))` |
| Outstanding / overdue | `CountRows(Filter(colRows, MonthKey = KpiMonth && Status in ["Not Started","Draft"])) & " / " & CountRows(Filter(colRows, MonthKey = KpiMonth && Overdue))` |
| Dedicated 1-to-1 requested | `CountRows(Filter(colRows, MonthKey = KpiMonth && FollowUp = OptDedicated))` |
| Open actions (overdue) | `CountRows(colOpenActions) & " (" & CountRows(Filter(colOpenActions, DueDate < Today())) & ")"` |

`KpiMonth` can be a named formula, because named formulas may reference `ddMonth`.

**Review table:** `galRows.Items`

```powerfx
SortByColumns(Filter(colRows,
    (IsBlank(ddMonth.Selected.Value) || MonthKey = ddMonth.Selected.Value) &&
    (IsBlank(ddTech.Selected.Title)  || TechnicianAadId = ddTech.Selected.TechnicianAadId)),
  "MonthStart", SortOrder.Descending, "Technician", SortOrder.Ascending)
```

The columns are Technician, Month, Status (red "Overdue" suffix when Overdue), Submitted (date plus "late"), Manager review, Follow-up, Workload and an **Open** button. The Open button runs `Set(gReview, LookUp('Monthly Reviews', ID = ThisItem.ID)); Navigate(scrManagerReview)`.

Rows where `FollowUp = OptDedicated` get a pale amber fill and a bold **"1-to-1 requested"** marker. Filtering by technician with all months selected gives the historic reviews and workload history.

**Navigation buttons**

- **Monthly Reviews:** this screen.
- **Appraisal Expectations:** `Launch(SiteUrl & "/Lists/AppraisalExpectations/Active.aspx")`
- **Outstanding Actions:** `Launch(SiteUrl & "/Lists/AgreedActions/Outstanding.aspx")`
- **Refresh:** re-runs OnVisible via `Navigate(scrDashboard)`.

**Footer note:** "A written check-in does not by itself satisfy any formal appraisal or meeting requirement."

If a technician somehow reaches this screen, it shows only their own data, because every query runs under their permissions. The dashboard is never a security boundary.

---

## F. Power Automate specification

**Common to all flows**

- **Connections:** SharePoint and Office 365 Outlook (plus Office 365 Users for Flow 1), all **standard**, signed in as the **Team Leader**.
- **Site address:** the private site. Action names below are suggested, so rename the actions to match, because expressions reference them.
- **Config:** each flow starts with **Initialize variable** actions:

| Variable | Value |
|---|---|
| `varManagerEmail` | TL email (lower case) |
| `varAppLink` | App web link: `https://apps.powerapps.com/play/e/<ENV-ID>/a/<APP-ID>?tenantId=<TENANT-ID>&hidenavbar=true` |
| `varEditLevel` | `1-to-1 Edit (no delete)` |

- **Error handling:** wrap the main logic in **Scope `Try`**. Add **Scope `Catch`**, configured to run after `Try` *has failed* or *has timed out*, which emails the TL with the run link and then **Terminates (Failed)**.

  The run link expression is `concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])`.
- **Secure inputs and outputs:** turn these on for the trigger and for every Get items / Get item on Monthly Reviews and Manager Reviews.
- **HTTP headers:** every *Send an HTTP request to SharePoint* call uses `Accept: application/json;odata=nometadata` and, for POST requests with a body, `Content-Type: application/json;odata=nometadata`.

### F.0 Shared blocks (built once, copied with "Copy to my clipboard")

**`LOOKUPS` scope** (four GET calls, run once per flow run)

| Action | Method | Uri | Output used |
|---|---|---|---|
| `Get_owners` | GET | `_api/web/associatedownergroup?$select=Id` | `body('Get_owners')?['Id']` |
| `Get_FullControl` | GET | `_api/web/roledefinitions/getbyname('Full Control')?$select=Id` | `body('Get_FullControl')?['Id']` |
| `Get_Read` | GET | `_api/web/roledefinitions/getbyname('Read')?$select=Id` | `body('Get_Read')?['Id']` |
| `Get_EditLevel` | GET | `_api/web/roledefinitions/getbyname('@{variables('varEditLevel')}')?$select=Id` | `body('Get_EditLevel')?['Id']` |
| `Get_me` | GET | `_api/web/currentuser?$select=Id` | `body('Get_me')?['Id']` |

**`ENSURE_USER`** (once per technician)

- Method POST, Uri `_api/web/ensureuser`
- Body: `{"logonName":"@{<technician Person field>?['Claims']}"}`
- Output: `body('Ensure_user')?['Id']`, which is the technician's principal ID.

**`SETPERM` scope.** Parameters: list title `L`, item id `I`, technician principal `T` and role definition `R`. All calls use the SharePoint HTTP action.

1. POST `_api/web/lists/getbytitle('L')/items(I)/resetroleinheritance`
2. POST `_api/web/lists/getbytitle('L')/items(I)/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`
3. POST `_api/web/lists/getbytitle('L')/items(I)/roleassignments/addroleassignment(principalid=@{body('Get_owners')?['Id']},roledefid=@{body('Get_FullControl')?['Id']})`
4. POST `_api/web/lists/getbytitle('L')/items(I)/roleassignments/addroleassignment(principalid=T,roledefid=R)`
5. GET `_api/web/lists/getbytitle('L')/items(I)/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id&$expand=RoleDefinitionBindings`
6. **Filter array** `Unexpected`
   - From: `body('Verify')?['value']`
   - Condition (advanced): `@and(not(equals(item()?['PrincipalId'], <owners>)), not(equals(item()?['PrincipalId'], T)), not(equals(item()?['PrincipalId'], body('Get_me')?['Id'])))`
7. **Filter array** `TechRow`: `@equals(item()?['PrincipalId'], T)`
8. **Condition** `PermOK`: `@and(equals(length(body('Unexpected')),0), equals(length(body('TechRow')),1), equals(length(first(body('TechRow'))?['RoleDefinitionBindings']),1), equals(first(body('TechRow'))?['RoleDefinitionBindings']?[0]?['Id'], R))`
   - If no: **Compose `PERMISSION_CHECK_FAILED`** with `int('permission check failed')`. This deliberately fails the action, which fails the scope and runs `Catch`, so no email is sent.

**`UNRELEASE`** (Manager Reviews only): steps 1 and 5 of SETPERM. Reset inheritance, then verify that `HasUniqueRoleAssignments` is false (GET `.../items(I)?$select=HasUniqueRoleAssignments`).

The list titles used in `getbytitle` are `Monthly Reviews` and `Manager Reviews`. **Renaming a list breaks the flows.**

### F.1 Flow 1 — `1-to-1 | Daily scheduler`

**Trigger:** **Recurrence**, Frequency Day, Interval 1, Time zone **(UTC+00:00) Dublin, Edinburgh, Lisbon, London**, at hour **7**, minute **0**.

Trigger settings: **Concurrency control On, degree 1**, so manual and scheduled runs can't overlap. This one daily flow covers creation (idempotent and self-healing), overdue flags and reminders.

**Actions, in order**

1. Config variables (above), plus:
   - `varTestDate` (String, **empty in production**; e.g. `2027-03-01T07:00:00` while testing)
   - `varFailures` (Array)
   - `varWarnings` (Array)
2. **Compose** the date values:

   | Compose | Expression |
   |---|---|
   | `ukNow` | `if(empty(variables('varTestDate')), convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-ddTHH:mm:ss'), variables('varTestDate'))` |
   | `MonthKey` | `formatDateTime(outputs('ukNow'), 'yyyy-MM')` |
   | `MonthStart` | `formatDateTime(outputs('ukNow'), 'yyyy-MM-01')` |
   | `LastDay` | `formatDateTime(addDays(addToTime(startOfMonth(outputs('ukNow')), 1, 'Month'), -1), 'yyyy-MM-dd')` (handles 28, 29, 30 and 31-day months) |
   | `DueUtc` | `convertToUtc(concat(outputs('LastDay'), 'T23:59:59'), 'GMT Standard Time')` (handles BST/GMT) |
   | `DeadlineText` | `concat('23:59 on ', formatDateTime(outputs('LastDay'), 'dddd d MMMM yyyy'))` |
   | `MonthName` | `formatDateTime(outputs('ukNow'), 'MMMM yyyy')` |
   | `Day` | `dayOfMonth(outputs('ukNow'))` |

3. **Scope `Try`**
   1. `LOOKUPS` scope.
   2. **Get items** `Get_technicians` (Technicians), Filter `Active eq 1`.
   3. **Get items** `Get_expectations` (Appraisal Expectations), Filter `Active eq 1`, Order By `SortOrder asc`, Top Count 500.
   4. **Apply to each** technician (`body('Get_technicians')?['value']`), with **Concurrency Off (sequential)**.
      - **Scope `TechTry`**
        1. **Condition** `NeedsAad`: `empty(items('Apply_to_each')?['TechnicianAadId'])`.
           - If yes: **Get user profile (V2)** (Office 365 Users) with User = `items('Apply_to_each')?['Technician']?['Email']`, then **Update item** (Technicians) with `TechnicianAadId = toLower(body('Get_user_profile_(V2)')?['id'])` and Title = the existing Title.
        2. **Compose `TechAad`**: `toLower(coalesce(items('Apply_to_each')?['TechnicianAadId'], body('Get_user_profile_(V2)')?['id']))`
        3. **Compose `ReviewKey`**: `concat(outputs('TechAad'), '_', outputs('MonthKey'))`
        4. **Get items** `Find_review` (Monthly Reviews), Filter `ReviewKey eq '@{outputs('ReviewKey')}'`, Top 1.
        5. **Condition** `ReviewMissing`: `equals(length(body('Find_review')?['value']), 0)`.
           - If yes:
             - **Filter array** `MyExpectations`, from `body('Get_expectations')?['value']`, condition `@or(equals(item()?['Scope']?['Value'], 'Shared'), equals(toLower(item()?['Technician']?['Email']), toLower(items('Apply_to_each')?['Technician']?['Email'])))`.
             - **Condition** `TooMany`: `greater(length(body('MyExpectations')), 10)`. If yes, **Append to array variable** `varWarnings`: `concat(items('Apply_to_each')?['Title'], ': ', length(body('MyExpectations')), ' active expectations – only the first 10 by SortOrder were used')`.
             - **Select** `SnapExp`, from `take(body('MyExpectations'), 10)`. Map `id` = `item()?['ID']`, `title` = `item()?['Title']`, `measures` = `item()?['Measures']`, `year` = `item()?['AppraisalYear']`, `rating` = `null` and `comment` = `''`.
             - **Create item** `Create_review` (Monthly Reviews):

               | Field | Value |
               |---|---|
               | Title | `concat(items('Apply_to_each')?['Title'], ' – ', outputs('MonthKey'))` |
               | ReviewKey | `outputs('ReviewKey')` |
               | Technician Claims | `items('Apply_to_each')?['Technician']?['Claims']` |
               | TechnicianAadId | `outputs('TechAad')` |
               | MonthKey | `outputs('MonthKey')` |
               | MonthStart | `outputs('MonthStart')` |
               | DueDate | `outputs('DueUtc')` |
               | Status | `Not Started` |
               | ExpectationsJson | `string(body('SnapExp'))` |

               The new item inherits manager-only permissions, so it's private from creation. The unique `ReviewKey` makes a duplicate create **fail** rather than duplicate.
        6. **Compose `Review`**: `if(equals(length(body('Find_review')?['value']), 0), body('Create_review'), first(body('Find_review')?['value']))`
        7. **Get items** `Find_mgr` (Manager Reviews), Filter `ReviewKey eq '@{outputs('ReviewKey')}'`, Top 1.
           - If it's empty, **Create item** (Manager Reviews) with Title, ReviewKey, Technician Claims, TechnicianAadId, MonthKey and Status `In Progress`. This is private by inheritance, so no permission work is needed.
        8. **Condition** `NeedsLink`: `@and(empty(outputs('Review')?['LinkSentOn']), equals(outputs('Review')?['Status']?['Value'], 'Not Started'))`.
           - If yes:
             1. `ENSURE_USER` with the technician's Claims.
             2. `SETPERM` with L = `Monthly Reviews`, I = `outputs('Review')?['ID']`, T = the technician principal and R = `body('Get_EditLevel')?['Id']`. This **stops here on any failure**.
             3. **Send an email (V2)** to the technician, using template E1 (F.5).
             4. **Update item** (Monthly Reviews, ID = Review ID) with `LinkSentOn = utcNow()` and Title = the existing Title.
      - **Scope `TechCatch`** (runs after `TechTry` has failed or timed out): **Append to array variable** `varFailures` with `concat(items('Apply_to_each')?['Title'], ' – ', string(result('TechTry')))`. One technician's failure doesn't stop the others.
   5. **Scope `Overdue`**
      - **Get items** (Monthly Reviews), Filter `IsOverdue eq 0 and (Status eq 'Not Started' or Status eq 'Draft') and DueDate lt '@{utcNow()}'`.
      - **Apply to each**: **Update item** with `IsOverdue = Yes` and Title = the existing Title.
   6. **Condition** `ReminderDay`: `@or(equals(outputs('Day'), 20), equals(outputs('Day'), 27))`.
      - If yes: **Get items** (Monthly Reviews), Filter `MonthKey eq '@{outputs('MonthKey')}' and (Status eq 'Not Started' or Status eq 'Draft') and LinkSentOn ne null`. Then **Apply to each**: **Send an email (V2)** using template E2. Submitted, completed and closed reviews are never selected.
   7. **Condition**: `@or(greater(length(variables('varFailures')),0), greater(length(variables('varWarnings')),0))`.
      - If yes: email the TL using template E7, listing the failures and warnings with the run link.
      - If there are failures: **Terminate (Failed)**.
4. **Scope `Catch`**: email the TL using template E7, then **Terminate (Failed)**.

**Duplicate prevention** works in three layers:

- The `Find_review` check before creating.
- The unique `ReviewKey` column, a SharePoint-enforced guarantee even if two runs race.
- `LinkSentOn`, which ensures each review is emailed only once.

**Self-healing:** if the run on the 1st fails, the next day's run creates or emails only what's missing. A technician added mid-month gets their review the next morning.

**Testing:** see H. Use `varTestDate` to simulate any date. While testing, keep only test accounts in Technicians.

### F.2 Flow 2 — `1-to-1 | Review submitted`

**Trigger:** SharePoint **When an item is created or modified** on the site, list `Monthly Reviews`.

**Settings → Trigger conditions** (both must be true):

```
@not(contains(createArray('Not Started','Draft'), triggerBody()?['Status']?['Value']))
@not(equals(toLower(triggerBody()?['Editor']?['Email']), 'team.leader@yourcompany.co.uk'))
```

The second condition ignores edits made by the TL or flow account, which prevents loops. Use the same address as `varManagerEmail`. If a service account is introduced, add a third condition for it.

Concurrency is left at default. Turn **Secure outputs** on for the trigger.

**Actions**

1. Config variables.
2. **Scope `Try`**
   1. `LOOKUPS` scope.
   2. `ENSURE_USER` with `triggerBody()?['Technician']?['Claims']`.
   3. `SETPERM` with L = `Monthly Reviews`, I = `triggerBody()?['ID']` and R = `body('Get_Read')?['Id']`. **The submitted record is now read-only to the technician.**
   4. **Update item** (Monthly Reviews, ID = trigger ID):

      | Field | Value |
      |---|---|
      | Status | `Submitted` (normalises any spoofed value such as "Completed") |
      | SubmittedOn | `utcNow()` |
      | SubmittedLate | `greater(utcNow(), triggerBody()?['DueDate'])` |
      | Title | `triggerBody()?['Title']` |

      Because the editor is now the TL or flow account, this doesn't re-trigger.
   5. **Send an email (V2)** to `varManagerEmail` using template E3. If `triggerBody()?['Q9FollowUp']?['Value']` equals `Arrange a dedicated 1-to-1 discussion`, the subject is prefixed with **[1-to-1 REQUESTED]**.
3. **Scope `Catch`**: email the TL with E7, worded as "Submission received but lock/notification FAILED – check permissions on item <ID>", then Terminate (Failed).

**Duplicate prevention:** after the lock the technician can't edit, so only TL or flow edits follow, and those are excluded. One submission therefore produces one notification. A resubmission after a Reopen is a genuine new submission.

**Testing:** H tests 10, 14 and 21.

### F.3 Flow 3 — `1-to-1 | Manager decision`

**Trigger:** SharePoint **When an item is created or modified**, list `Manager Reviews`. This list is manager-only, so its fields can be trusted.

**Trigger conditions**

```
@not(equals(triggerBody()?['Status']?['Value'], 'In Progress'))
@not(equals(triggerBody()?['Status']?['Value'], triggerBody()?['ProcessedStatus']))
```

**Actions**

1. Config variables.
2. **Scope `Try`**
   1. `LOOKUPS` scope.
   2. **Get items** `Find_review` (Monthly Reviews), Filter `ReviewKey eq '@{triggerBody()?['ReviewKey']}'`, Top 1. Then **Compose** `Review` = `first(body('Find_review')?['value'])`.
   3. `ENSURE_USER` with `triggerBody()?['Technician']?['Claims']`.
   4. **Switch** on `triggerBody()?['Status']?['Value']`.

      **Case `Completed`**

      1. **Condition** `@equals(outputs('Review')?['Status']?['Value'], 'Submitted')`.
         - If no: **Update item** (Manager Reviews) with Status `In Progress` and ProcessedStatus `Rejected`. Email the TL: "Cannot complete – the technician has not submitted. Use Close – not submitted instead." Steps 2–6 sit in the **Yes** branch, so nothing else runs.
      2. `SETPERM` on Monthly Reviews / review ID / Read. This re-applies the lock idempotently.
      3. `SETPERM` on Manager Reviews / trigger ID / Read. **This releases the feedback.**
      4. **Update item** (Monthly Reviews) with Status `Completed`, CompletedOn `utcNow()` and Title.
      5. **Update item** (Manager Reviews) with ProcessedStatus `Completed`, ReleasedOn `utcNow()`, CompletedOn `utcNow()`, CompletedBy Claims `triggerBody()?['Editor']?['Claims']` and Title.
      6. **Send an email (V2)** to the technician (`triggerBody()?['Technician']?['Email']`) using template E4.

      **Case `Closed - Not Submitted`**

      1. **Condition**: the review status is `Not Started` or `Draft`. If not, reject as above.
      2. `SETPERM` on Monthly Reviews / Read.
      3. `SETPERM` on Manager Reviews / Read. This releases any note from the TL.
      4. **Update item** (Monthly Reviews) with Status `Closed - Not Submitted`.
      5. **Update item** (Manager Reviews) with ProcessedStatus `Closed - Not Submitted` and ReleasedOn `utcNow()`.
      6. Email the technician using template E5.

      **Case `Reopen`**

      1. `SETPERM` on Monthly Reviews / Edit level. The technician can edit again.
      2. `UNRELEASE` on Manager Reviews / trigger ID. Feedback is hidden again.
      3. **Update item** (Monthly Reviews) with Status `Draft`.
      4. **Update item** (Manager Reviews) with Status `In Progress` and ProcessedStatus `Reopen`.
      5. Email the technician using template E6.
3. **Scope `Catch`**: email the TL with E7, then Terminate (Failed).

**Duplicate prevention:** `ProcessedStatus` equals `Status` after processing, and Reopen returns the status to `In Progress`, which is excluded. Later TL edits to released feedback (corrections) don't re-trigger. They're visible immediately and audited by versioning.

**Order of operations:** permissions are always set and verified **before** the email that tells the technician to look.

### F.4 Why this is the minimum

There are three flows:

- one schedule
- one reaction to a technician action
- one reaction to a manager action

Reminders, overdue flags, creation and self-healing share one daily flow. There are no instant (button) flows, because those would take caller-supplied parameters and need caller validation.

### F.5 Email templates

All emails are sent from the TL's mailbox. They're plain and short, with **no answer or feedback content**. `{Link}` means `concat(variables('varAppLink'), '&reviewId=', <review ID>)`.

| ID | To | Subject | Body (summary) |
|---|---|---|---|
| E1 | Technician | `Your 1-to-1 for {MonthName} is ready` | "Hi {first name}, your monthly 1-to-1 for {MonthName} is ready: **[Open my 1-to-1]({Link})**. Deadline: {DeadlineText}. Save a draft and come back as often as you like. If you want to talk sooner, just ask – you don't need to wait for this form. The link only works when you're signed in with your own company account." |
| E2 | Technician | `Reminder: your 1-to-1 for {MonthName} is due {DeadlineText}` | "Your 1-to-1 hasn't been submitted yet. Any draft you've saved is still there: [Continue]({Link})." |
| E3 | TL | `[1-to-1 REQUESTED] ` (conditional) + `1-to-1 submitted: {Name} – {MonthKey}` | "{Name} submitted their {MonthName} 1-to-1{ late}. Follow-up preference: {Q9}. [Open review]({Link})" |
| E4 | Technician | `Feedback on your {MonthName} 1-to-1 is ready` | "Your Team Leader has completed your review. [View feedback]({Link})" |
| E5 | Technician | `Your {MonthName} 1-to-1 has been closed` | "This month's review was closed without a submission. [View]({Link}). Speak to your Team Leader if this is unexpected." |
| E6 | Technician | `Your {MonthName} 1-to-1 has been reopened` | "Your Team Leader has reopened this review so it can be amended. [Open]({Link})" |
| E7 | TL | `1-to-1 system: action needed ({flow name})` | Failures and warnings list, plus the run link. |

---

## G. Deployment guide

> Do this in the corporate tenant, signed in as the Team Leader. Use **two test technician accounts** (Test A and Test B) that have no other access to the site. See J, blocker B3.

### Stage 1 — Functional MVP

1. **Create the site.** SharePoint start page → **+ Create site** → **Communication site** → *Blank* → Name **ESG Technician 1-to-1**, address **ESG-1to1**, language English → **Create**. If site creation is disabled, request a communication site from IT with you as the sole owner (blocker B1).
2. **Regional settings.** Gear → *Site information* → *View all site settings* → **Regional settings** → Time zone **(UTC) Dublin, Edinburgh, Lisbon, London**, Locale **English (United Kingdom)** → OK.
3. **Lock down the site** (D.1):
   - Gear → *Site permissions* → *Advanced permissions settings*. Confirm Owners contains only you (and the D4 backup). Open the Members and Visitors groups and remove everyone, including "Everyone except external users".
   - Gear → *Site permissions* → *Change how members can share* → **Only site owners can share…**, **Allow access requests: Off** → Save.
   - Apply a sensitivity label if your organisation uses them.
4. **Create the permission level.** *Advanced permissions settings* → ribbon **Permission Levels** → **Contribute** → **Copy Permission Level**. Name it `1-to-1 Edit (no delete)` and untick the boxes listed in D.3 → **Create**.
5. **Create the five lists.** Repeat these steps for `Technicians`, `AppraisalExpectations`, `MonthlyReviews`, `ManagerReviews` and `AgreedActions`. Create each with **no spaces**, so the URL is clean.
   1. Site contents → **+ New → List → Blank list**, enter the name, untick *Show in site navigation* → Create.
   2. Rename the list to the display title (`Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Agreed Actions`): List settings → *List name, description and navigation*.
   3. Add every column from section C: **+ Add column**, choose the type, then use **exactly** the internal name. Set the choices and defaults, and clear the Choice defaults marked *none*.
   4. List settings → **Versioning settings**: create a version each time you edit an item, keep 100 versions.
   5. List settings → **Advanced settings**: Attachments **Disabled**, Search **No**, Offline **No**.
   6. List settings → **Indexed columns**: add the indexes listed in C. For `ReviewKey` on Monthly Reviews and Manager Reviews, open the column and set **Enforce unique values: Yes**.
   7. List settings → **Permissions for this list** → **Stop Inheriting Permissions**. Tick the Members and Visitors groups → **Remove User Permissions**. Only Owners should remain.
   8. Create the views listed in C.2 and C.5.
6. **Seed data.** Add Test A and Test B to **Technicians** (Active = Yes). Add two **Shared** expectations and one **Individual** expectation for Test A.
7. **Build the app** (E.1–E.6). Paste `App.Formulas`, build `scrTechReview` and `scrManagerReview`, then **Save** and **Publish**. Open **Details** and copy the **Web link** (`.../play/e/<ENV-ID>/a/<APP-ID>?tenantId=<TENANT-ID>`).
8. **Share the app** with Test A and Test B as **User**. **Decline** any prompt to share the SharePoint lists.
9. **Build Flow 1 (creation part only)** at make.powerautomate.com. Create an **Instant cloud flow (Manually trigger)** named `1-to-1 | Daily scheduler`, and build steps 1–3.4 and 4 of F.1. You'll switch the trigger to Recurrence in Stage 2. Turn on secure inputs and outputs.
10. **Build Flow 2** (automated cloud flow, F.2) and **Flow 3** (F.3), with trigger conditions entered under **trigger → Settings → Trigger conditions**.
11. **Run Flow 1 manually.** Check that two reviews and two Manager Reviews were created, that each review has unique permissions (Owners plus one technician), and that two emails were sent.
12. Run the Stage 1 tests: **H tests 1–6, 10–14 and 20**.

### Stage 2 — Monthly automation

13. In Flow 1, add steps 3.5–3.7 (overdue and reminders) and the failure email.
14. Replace the manual trigger with **Recurrence**, configured as in F.1: copy the Try scope to the clipboard, create a new scheduled flow, and paste the scope in. Set **Concurrency control** to 1.
15. Run the date tests with `varTestDate` (H tests 15–17 and 22–24). **Clear `varTestDate`** afterwards.

### Stage 3 — Appraisal tracking

16. Build the Q8 gallery in `scrTechReview` and `galFbQ8` in `scrManagerReview`. The expectation snapshot logic is already in Flow 1.
17. Run H tests 7–9.
18. Record the **annual rollover procedure** in the configuration reference:
    1. Shortly before the new appraisal year, add the new year's expectations, using grid view with copy and paste. Set `AppraisalYear`, `SortOrder` and `Active = Yes`.
    2. On the last day of the old year, set the old expectations to **Active = No**. Don't delete them.
    3. The next monthly run snapshots the new set, and old reviews keep their own copies.

### Stage 4 — Dashboard and final verification

19. Build `scrDashboard` and `scrTechHistory` (E.4, E.7), then publish.
20. **SharePoint home page:** edit the home page and remove the default web parts. Add a **Power Apps** web part (paste the App ID, width full) and a **Quick links** web part with links to *Monthly Reviews (app)*, *Appraisal Expectations → Active view* and *Agreed Actions → Outstanding view*. **Publish.**
21. Run the **full test plan (H)** with both test accounts and the TL. Every privacy test must pass.
22. **Clean down:** delete the test reviews, manager reviews and actions (they then sit in the site recycle bin and the second-stage recycle bin, so delete them there if required). Remove the test technicians.
23. **Go live:** add the real technicians, share the app with them, and confirm Flow 1 is **On**. Either wait for the 1st, or run Flow 1 manually to start the current month immediately (this is idempotent).
24. Watch the first live month. On the 1st, check that the run succeeded and the dashboard shows all technicians. Check the reminders on the 20th, then check the overdue flags and the creation of the next month on the 1st.

---

## H. Testing

Use **Test A**, **Test B** and **TL** accounts, each in a separate browser profile or InPrivate window. Record each test as Pass or Fail, with the date, tester and evidence (a screenshot). **Any failure in tests marked 🔒 blocks release.**

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | A opens own review | A clicks the E1 link | The app opens on A's current review, with the deadline shown |
| 2 🔒 | A can't read B's review | (a) A opens the app link with `reviewId=<B's ID>`. (b) A browses to `/sites/ESG-1to1/Lists/MonthlyReviews/DispForm.aspx?ID=<B's ID>`. (c) A browses to `/_api/web/lists/getbytitle('Monthly Reviews')/items` | (a) "Not found or not yours". (b) Access denied. (c) Only A's items are returned. |
| 3 🔒 | A can't edit B's records | A sends an edit through the SharePoint UI, or a REST `MERGE` on B's item | Denied |
| 4 | Drafts save and reload | A fills Q1–Q3, saves, closes the browser and reopens from the link | All values are present and the status is Draft |
| 5 | Hidden fields don't block | A answers No to Q4, Q5 and Q6 and completes the mandatory items, then submits | Submits. Detail fields are blank in the list. |
| 6 | Workload stored | Check the `Q3WorkloadRating` value in the list | It's the number 1–5, and it shows in history |
| 7 | Expectations populate | Run Flow 1 for a new month | A has 2 shared and 1 individual expectation. B has the 2 shared only. |
| 8 🔒 | Individual expectations are private | B opens their review, then tries the AppraisalExpectations list URL and REST | B sees only the shared ones, and the list is denied |
| 9 | History is preserved | After A submits, the TL edits the title and measures of a shared expectation | A's past review shows the old text, and the next month shows the new text |
| 10 🔒 | Submission locks | After submitting (wait 5 min), A tries to edit in the app, in the list form and via REST | The app is read-only and the server denies edits |
| 11 | TL comments on No answers | The TL adds feedback to Q4 where the answer is No | It saves and is shown after release |
| 12 🔒 | Comments are not disclosed early | The TL saves feedback but doesn't complete. A opens the app and the `ManagerReviews` list URL and REST | No feedback is visible, and the list is denied or empty |
| 13 🔒 | Completed is locked | After completion, A tries to edit the review and the feedback | Denied. A can still view both. |
| 14 | Completion notifies | The TL completes | A receives E4 within about 5 minutes, and the link shows the feedback |
| 15 | No duplicates | Run Flow 1 three times on the same day | One review per technician per month, and only one E1 email each |
| 16 | Only incomplete get reminders | A submitted, B is a draft. Set `varTestDate` to day 20 and run | Only B receives E2 |
| 17 | Overdue handling | Set `varTestDate` to the 1st of the next month and run | B's draft is still there and editable, with `IsOverdue = Yes` and the dashboard showing it as overdue. B can submit, and the submission is marked late. The TL can Close – Not Submitted, after which B is read-only. |
| 18 | Meeting requests highlighted | A chooses "Arrange a dedicated 1-to-1" | E3 subject is prefixed, the dashboard row is amber and the KPI counts it. A TL override is reflected. |
| 19 | New month is independent | Run Flow 1 for the next month | Previous reviews are unchanged, and new Not Started reviews exist |
| 20 🔒 | Real accounts end to end | Repeat tests 1, 4, 10 and 14 using **only** the technician accounts | All work |
| 21 🔒 | Technician can't delete | A tries to delete their own draft through the list UI or REST | Denied |
| 22 | February and leap year | `varTestDate` = `2028-02-01T07:00:00` | DueDate is `2028-02-29T23:59:59Z` |
| 23 | Daylight saving | `varTestDate` = `2027-03-01T07:00:00` and `2026-10-01T07:00:00` | DueDate is `2027-03-31T22:59:59Z` (BST) and `2026-10-31T23:59:59Z` (GMT) |
| 24 🔒 | Failed permissions send no email | Temporarily rename the permission level, then run Flow 1 for a new month | The review is created but stays private. No E1 is sent, and the TL gets E7. Restore the name and rerun, and the email is sent. |
| 25 🔒 | Site isn't exposed | A visits the site home page and searches SharePoint for B's name or answer text | Access denied, and no results |
| 26 | Reopen | The TL reopens A's completed review | A can edit, the feedback is hidden again, and after resubmit and complete it's released again. The CorrectionLog and version history show the change. |
| 27 | Phone | A completes a draft on a phone | Usable, with no horizontal scrolling of inputs |

---

## I. Delivery estimate

These are hands-on hours for someone comfortable with SharePoint and Power Apps, but not an expert. Calendar time depends mainly on the corporate approvals.

| Stage | Claude preparation | Manual configuration (TL) | Testing (TL plus 2 test users) | Depends on corporate permission or approval |
|---|---|---|---|---|
| 0. Approvals and accounts | — | 1 h (requests) | — | Site (B1), DLP check (B2), test accounts (B3), HR/DP sign-off (B4) |
| 1. Functional MVP | Included in the artefact pack below | 12–16 h: site and lists 3 h, technician screen 5 h, manager screen 4 h, flows 2 and 3 plus the Flow 1 creation block 4 h | 3 h | Custom permission level (B6), app sharing |
| 2. Monthly automation | — | 3–4 h | 2–3 h | — |
| 3. Appraisal tracking | — | 3 h | 2 h | — |
| 4. Dashboard and verification | — | 5–6 h (dashboard 4 h, history 1 h, home page 1 h) | 4–5 h (full privacy and operational tests), plus a live first month | — |
| **Total** | **One Claude session, about 2–4 h including your review** | **≈ 24–30 h** | **≈ 11–13 h** | **Elapsed: unknown, typically days to weeks** |

A realistic plan is **35–45 hours of hands-on effort**, spread over 2–3 weeks part-time once approvals are in place. Generating these instructions **is not deployment**. Nothing is live until steps G1–G23 are done and section H passes in the tenant.

---

## J. Risks and decisions

### Decisions needed (they materially affect the build)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Which account runs the flows | **The TL's own account for v1.** It's simplest and needs no extra licence. If the TL leaves or their account changes, the flows stop and must be re-owned. Move to an approved service account later if IT can provide one. |
| D2 | Late-submission policy | **Accept late, flag it, and let the TL close it** (AS2) |
| D3 | Retention period and mechanism | HR or Data Protection to set N years and say whether a Purview label exists (D.5) |
| D4 | Backup site owner | None, or one named, HR-approved person. Any owner can read everything. |

### Genuine blockers (confirm before starting)

| # | Blocker | Fallback |
|---|---|---|
| B1 | Can the TL create a communication site and be its sole owner? | Ask IT to create it with the TL as the only owner |
| B2 | DLP policy: are the SharePoint connector's **"Send an HTTP request to SharePoint"** action and Office 365 Users allowed in the environment? | Use the native SharePoint actions **Stop sharing an item** and **Grant access to an item** (role "Can edit" / "Can view"). This loses the no-delete level (versioning and the recycle bin cover deletions) and the automated verification step, so test 24 becomes a manual check. Avoid this if possible. |
| B3 | Two test technician accounts, or real technicians' consent to test with dummy data | Testing with the TL account alone **doesn't** prove privacy (test 20) |
| B4 | HR/Data Protection approval to process wellbeing-adjacent information (Q4 may attract special-category data despite the guidance). A DPIA screening may be required. | Launch with the guidance text, and keep Q4 as a "request a conversation" flag |
| B5 | Technician licences include Power Apps use rights for standard connectors (M365 E3/E5/F3 do; **F1 doesn't**) | Confirm with IT |
| B6 | Site owners can create custom permission levels (sometimes restricted) | Use **Read** plus built-in **Contribute** (allows delete, covered by versioning and the recycle bin) |

### Residual risks (accepted, with mitigation)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Flows react to submission in about 1–5 minutes, so a technician could still edit through REST in that window | Only affects their own just-submitted record. Versions record everything, and the app becomes read-only immediately. |
| R2 | A technician who deliberately forges "Modified By" through advanced API calls could avoid Flow 2's lock | Affects only their own draft. The dashboard still shows Submitted, and Flow 3 re-applies the lock on completion. |
| R3 | M365, SharePoint and Power Platform administrators can access the data | Normal tenant administration, covered by admin policy and stated in the privacy notice |
| R4 | The flow owner (TL) can see run-history data | Secure inputs and outputs are on, and there are no unauthorised co-owners |
| R5 | The app loads up to 2,000 reviews on the dashboard | About 16 years at 10 technicians. Change it to a month filter if that's ever reached. |
| R6 | Renaming lists or columns breaks the flows and app | The configuration reference documents a "do not rename" list |
| R7 | Team Leader changes | Handover is in the configuration reference: transfer site ownership, re-own the flows, update `ManagerEmail` and the trigger condition. Release a new app version. |

---

## K. Ready-to-build artefacts

When this plan is approved, Claude will produce the following in `one-to-one/`. They are text artefacts for transfer through an approved company process, with **no tenant names, credentials or employee data**. All tenant-specific values are `<PLACEHOLDER>`s.

| # | File | Contents |
|---|---|---|
| K1 | `01-sharepoint/list-schemas.md` and `list-schemas.csv` | Every list, column, type, choice values, default, index, unique flag and view, as a click-through checklist |
| K2 | `01-sharepoint/site-and-permissions-checklist.md` | Site creation, lock-down, permission level and list permission steps, with tick boxes and verification screenshots to capture |
| K3 | `02-powerapps/App.Formulas.fx` | Paste-ready named formulas |
| K4 | `02-powerapps/screens/*.md` | One file per screen: control tree (names, types, parent container), property table (Items, Default, Visible, DisplayMode, OnSelect…) and paste-ready formulas |
| K5 | `02-powerapps/screens/*.pa.yaml` (optional, best effort) | Studio "paste code" YAML for the main containers. **Not validated outside the tenant.** If Studio rejects it, use K4. |
| K6 | `03-flows/flow1-daily-scheduler.md`, `flow2-review-submitted.md`, `flow3-manager-decision.md` | Action-by-action build sheets, with the exact action names, every expression ready to copy, trigger conditions, settings and secure-IO flags. **These aren't importable packages**, and Claude won't claim they are. |
| K7 | `03-flows/email-templates.html` | E1–E7 HTML bodies with dynamic-content placeholders |
| K8 | `04-testing/test-plan.md` and `test-record.csv` | Section H with steps, expected results and result columns |
| K9 | `05-deploy/deployment-checklist.md` | Section G as a tick-list with stage gates |
| K10 | `05-deploy/configuration-reference.md` | Every placeholder, where it's used, the do-not-rename list, the TL handover procedure, annual expectation rollover, correction and reopen procedure, and the retention procedure |
| K11 | `05-deploy/privacy-summary.md` | One page for HR/DP: what's collected, who can see it, how it's protected, retention, and the admin-access statement (supports B4) |

---

## Summary and next step

1. **Recommended build approach:** a private SharePoint communication site with five lists, secured by item-level permissions that flows apply and verify. One canvas app (technician review, history, manager dashboard and manager review) opened from personal email links and embedded on the site home page. Three Power Automate flows using standard connectors only. The app is built manually from paste-ready artefacts.

2. **Implementation sequence:**
   1. Approvals (B1–B6)
   2. Site and lock-down
   3. Five lists
   4. App: technician and manager screens
   5. Flow 1 creation block, then Flows 2 and 3
   6. End-to-end MVP test (Stage 1)
   7. Schedule, reminders and overdue (Stage 2)
   8. Expectations and Q8 (Stage 3)
   9. Dashboard, history, home page and full privacy testing (Stage 4)
   10. Clean down and go live

3. **Effort:**
   - Stage 1: about 15–19 h
   - Stage 2: about 5–7 h
   - Stage 3: about 5 h
   - Stage 4: about 9–11 h
   - Total about 35–45 h hands-on, plus the approval lead time
   - Claude preparation: one session

4. **Genuine blockers:**
   - Site creation and sole ownership (B1)
   - DLP allowing *Send an HTTP request to SharePoint* (B2)
   - Two test accounts (B3)
   - HR/DP approval and retention period (B4 / D3)
   - Technician licences (B5)
   - Custom permission level allowed (B6)

5. **Next Claude Code prompt:**

   ```
   Plan approved as written in one-to-one/IMPLEMENTATION_PLAN.md, with decisions
   D1 = Team Leader account, D2 = accept late / flag / TL can close,
   D3 = <retention years or "placeholder">, D4 = <none | role of backup owner>.
   Produce artefacts K1–K11 in one-to-one/ exactly as specified in section K,
   using <PLACEHOLDER> values for all tenant-specific settings. Keep the Power Fx
   and flow expressions identical to the plan unless you find an error — if so,
   fix it and list every deviation in one-to-one/CHANGES_FROM_PLAN.md.
   Commit and push to the current branch.
   ```
