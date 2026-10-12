# ESG Monthly Technician 1-to-1 — Implementation Plan (v2)

**Status:** v2. Revised after the critical review in [`PLAN_REVIEW.md`](PLAN_REVIEW.md), which explains every change from v1. **Nothing has been built or deployed.**
**Scope:** 5–10 technicians, one Team Leader (TL), Environmental Safety Group, Dungeness B.

**Confirmed decisions**

| # | Decision |
|---|---|
| D1 | Flows run under the **TL's own account** |
| D2 | **Late submissions are accepted** and flagged late, and the TL may close a review that was never submitted |
| D3 | Retention period: **to be confirmed with HR** |
| D4 | **No backup owner**, subject to corporate governance |

The system has four lists, three flows, one app with three screens, and two custom permission levels. It uses standard connectors only.

---

## Contents

- [A. Architecture](#a-architecture)
- [B. Scope and stages](#b-scope-and-stages)
- [C. SharePoint lists](#c-sharepoint-lists)
- [D. Security model](#d-security-model)
- [E. Power Apps specification](#e-power-apps-specification)
- [F. Power Automate specification](#f-power-automate-specification)
- [G. Deployment guide (step by step)](#g-deployment-guide-step-by-step)
- [H. Testing](#h-testing)
- [I. Delivery estimate](#i-delivery-estimate)
- [J. Blockers, confirmations and residual risks](#j-blockers-confirmations-and-residual-risks)
- [K. Artefacts to produce next](#k-artefacts-to-produce-next)
- [Summary and next step](#summary-and-next-step)

---

## A. Architecture

### A.1 Components

```
PRIVATE SHAREPOINT COMMUNICATION SITE  (Owners group = Team Leader only; no Members/Visitors)
 ├─ Technicians             manager only        roster + stable identity (Entra object ID)
 ├─ Appraisal Expectations  manager only        master list, shared + individual
 ├─ Monthly Reviews         per item            technician's answers. Tech: EDIT while open, READ after
 ├─ Manager Reviews         per item            AUTHORITATIVE record + TL feedback + actions.
 │                                              Manager only until released, then tech READ
 └─ Home page               Power Apps web part (TL dashboard)

CANVAS APP "ESG 1-to-1" (SharePoint connector, runs as the signed-in user)
 ├─ scrTechReview     technician questionnaire, month picker for past reviews
 ├─ scrDashboard      TL: KPIs, review table, outstanding actions
 └─ scrManagerReview  TL: answers + feedback per section + complete / close

POWER AUTOMATE (TL connection; standard connectors)
 ├─ Flow 1  Daily 07:00 UK   create → protect → email; reminders 20th/27th; problem report
 ├─ Flow 2  Monthly Reviews changed to non-draft  → lock (tech READ), stamp authoritative record, notify TL
 └─ Flow 3  Manager Reviews set Completed/Closed  → lock + release feedback (tech READ), notify tech
```

### A.2 Why this shape (short version)

- **Canvas app rather than a customised list form.** A canvas app gives personal links, partial (draft) saves, a repeating expectations section and separate TL screens. A list form does none of these cleanly.
- **Two review lists because SharePoint has no column-level security.** A technician who can edit their answers can edit every column on that item. So:
  - **Monthly Reviews** holds only what the technician may write.
  - **Manager Reviews** holds everything they must not see early or must not be able to change. That is identity, due date, workflow state, timestamps, the expectation snapshot, and the TL's feedback and actions.
- **Flows never trust a technician-editable field** to decide who gets access, what the state is, or whether something is late.
- **SharePoint item permissions are the only security boundary.** App filtering is cosmetic.
- **Flows use automated SharePoint triggers only.** No flow accepts input supplied by a technician.

### A.3 Assumptions

| # | Assumption |
|---|---|
| AS1 | Q2, the Q3 comment and Q7 are optional. Everything else is required at Submit, and details are required only when Yes is selected. |
| AS2 | If the answer is **No**, any hidden detail text is **cleared when saving**. Hidden fields are never validated or stored. |
| AS3 | Emails contain **links only**, never answers or feedback. |
| AS4 | Expectations apply when **Active = Yes**, and are snapshotted when the month's review is created. Changes made mid-month apply from next month. |
| AS5 | **Correction process:** the TL corrects a submitted record directly in SharePoint, at the technician's request, and writes the reason in `CorrectionLog`. Version history is the audit trail. There's no in-app "reopen" in v1. |
| AS6 | **Agreed actions** are free text on the TL's record (one per line, with due dates), plus an *Open / Done* status and an earliest due date. |

---

## B. Scope and stages

| Stage | Build | Exit criterion |
|---|---|---|
| **0 — Proof test (1–2 h)** | Site, lists, permission levels. One manual permission grant to Test A. An auto-generated test app. | Test A sees and edits only their own item in Power Apps, there's no error banner, and the REST calls succeed under DLP. **If this fails, stop and review.** |
| **1 — Functional MVP** | Flow 1 (creation and links), the full app (all 9 questions, including Q8), Flows 2 and 3 | Test A drafts, submits and is locked. The TL reviews and completes, and A sees the feedback. Test B sees nothing of A's at any point. |
| **2 — Monthly automation** | Flow 1 reminders and problem report. Schedule confirmed. | Date tests F13, F14, F19 and F20 pass |
| **3 — Appraisal tracking** | Real expectations loaded. Rollover procedure written down. | F5–F7 pass |
| **4 — Dashboard and verification** | Dashboard screen, home page, **all privacy tests P1–P14**, clean-down, go-live | Every test in H passes |

The Q8 gallery is built with the rest of the questionnaire in Stage 1, because separating it costs more than it saves. Stage 3 is about loading and testing real expectation data.

**Not in v1:** in-app reopen, an in-app expectations editor (the SharePoint list is enough), charts, auto-save, Teams notifications, a service account, and automated retention.

---

## C. SharePoint lists

### C.0 Rules for every list

- **Type each column name exactly as shown, with no spaces.** The name you type becomes the permanent internal name that the app and flows use.
- **Required:** leave every column *not required* in SharePoint, except `Title`. The app checks required answers at Submit, and SharePoint-required columns would block saving drafts.
- **Choice columns:** turn **"Can add values manually"** off. Where the default says *(none)*, **delete the default value**. SharePoint pre-fills the first choice otherwise.
- **Multiple lines of text:** plain text. Turn **"Use enhanced rich text"** off and **"Append changes to existing text"** off.
- **Each list's settings:**

  | Setting | Value |
  |---|---|
  | Versioning | On, 100 versions |
  | Attachments | Disabled |
  | Allow items in search results | **No** |
  | Offline client availability | No |
  | Permissions | Inheritance stopped, and the Members and Visitors groups removed |

### C.1 `Technicians` (manager only)

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | Technician display name |
| Technician | Person or Group (people only, single) | — | Their Microsoft 365 account |
| TechnicianAadId | Single line of text | — | **Leave empty.** Flow 1 fills in the Entra object ID. **Indexed.** |
| Active | Yes/No | Yes | **Indexed.** Set to No for leavers and long absences. |

### C.2 `AppraisalExpectations` → display name **Appraisal Expectations** (manager only)

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | Expectation title |
| Measures | Multiple lines of text | — | Description, measures and success criteria |
| AppraisalYear | Single line of text | — | e.g. `2026/27` |
| AppliesTo | Choice: `Shared`, `Individual` | Shared | |
| Technician | Person or Group (people only, single) | — | Fill in **only** when AppliesTo = Individual |
| SortOrder | Number, 0 decimal places | 100 | Lower numbers appear first |
| Active | Yes/No | Yes | **Indexed** |

**Views**

| View | Filter / layout |
|---|---|
| *Active* | Active = Yes, grouped by AppliesTo, sorted by SortOrder |
| *Needs attention* | AppliesTo = Individual and Technician is empty |
| *Retired* | Active = No |

**Rule:** each technician gets every active Shared expectation plus their own active Individual expectations, in SortOrder, **up to 10**. Flow 1 tells the TL if more than 10 apply.

### C.3 `MonthlyReviews` → display name **Monthly Reviews**

This list is the technician's workspace. Everything here can be edited by the technician while the review is open, so **flows treat it as untrusted**.

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | e.g. `Jane Smith – 2026-11`. Display copy. |
| Technician | Person (single) | — | Display copy |
| MonthKey | Single line of text | — | e.g. `2026-11`. Display copy. |
| MonthStart | Date only | — | For sorting. Display copy. |
| DueDate | Date and time | — | Display copy |
| ReviewStatus | Choice: `Not Started`, `Draft`, `Submitted`, `Completed`, `Closed - Not Submitted` | Not Started | Shown to the technician. A non-draft value is the **submit signal**. |
| Q1WentWell | Multiple lines | — | |
| Q2Issue | Multiple lines | — | |
| Q2Impact | Multiple lines | — | |
| Q2Tried | Multiple lines | — | |
| Q2Support | Multiple lines | — | |
| Q3WorkloadRating | Number, 0 decimal places, min 1, max 5 | — | Workload history |
| Q3WorkloadComment | Multiple lines | — | |
| Q4WellbeingRaise | Choice: `Yes`, `No` | *(none)* | |
| Q4WellbeingDetail | Multiple lines | — | |
| Q5PlanningRaise | Choice: `Yes`, `No` | *(none)* | |
| Q5PlanningDetail | Multiple lines | — | |
| Q6DevRaise | Choice: `Yes`, `No` | *(none)* | |
| Q6DevWhat | Multiple lines | — | |
| Q6DevWhy | Multiple lines | — | |
| Q7ManagerFeedback | Multiple lines | — | |
| ExpectationsJson | Multiple lines | — | Technician's copy of the expectations, plus their ratings (see below) |
| Q9FollowUp | Choice (the 3 values in E.1) | *(none)* | |

Example of `ExpectationsJson`:

```json
[{"id":12,"title":"Complete RP supervisor module","measures":"Pass by Q4","year":"2026/27","rating":3,"comment":"Module 2 done"}]
```

### C.4 `ManagerReviews` → display name **Manager Reviews** (the authoritative record)

| Column | Type | Default | Written by | Notes |
|---|---|---|---|---|
| Title | (built-in) | — | Flow 1 | `Jane Smith – 2026-11` |
| ReviewKey | Single line of text | — | Flow 1 | `{EntraObjectId}_{yyyy-MM}`. **Enforce unique values = Yes**, which is the duplicate guard. |
| ReviewItemId | Number, 0 decimal places | — | Flow 1 | The SharePoint ID of the matching Monthly Review. **Indexed.** |
| Technician | Person (single) | — | Flow 1 | **The identity used for all access and emails** |
| TechnicianAadId | Single line of text | — | Flow 1 | |
| MonthKey | Single line of text | — | Flow 1 | **Indexed** |
| DueDate | Date and time | — | Flow 1 | Last day of the month at 23:59:59 UK time |
| ReviewState | Choice: `Open`, `Submitted`, `Completed`, `Closed - Not Submitted` | Open | Flows, and the TL (*Completed* / *Closed*) | **Indexed.** The one real workflow state. |
| LinkSentOn | Date and time | — | Flow 1 | |
| SubmittedOn | Date and time | — | Flow 2 | Server time |
| SubmittedLate | Yes/No | No | Flow 2 | |
| TechFollowUp | Single line of text | — | Flow 2 | Technician's Q9 choice, copied at submission |
| ExpectationSnapshotJson | Multiple lines | — | Flow 1 | **Trusted** copy of titles and measures: `[{"id":12,"title":"…","measures":"…","year":"2026/27"}]` |
| FB_Q1 … FB_Q7 | Multiple lines (7 columns) | — | TL | TL feedback per question |
| FB_Q9 | Multiple lines | — | TL | |
| FB_Overall | Multiple lines | — | TL | |
| ExpectationFeedbackJson | Multiple lines | — | TL | `[{"id":12,"feedback":"…"}]` |
| FollowUpDecision | Choice (same 3 values as Q9) | *(none)* | TL | **Override** of the technician's preference |
| MeetingDate | Date only | — | TL | |
| AgreedActions | Multiple lines | — | TL | One action per line, for example `• Book confined-space refresher – Tech – by 15/12` |
| ActionsDueBy | Date only | — | TL | Earliest open due date |
| ActionsStatus | Choice: `None`, `Open`, `Done` | None | TL | **Indexed** |
| CompletedOn | Date and time | — | Flow 3 | |
| CompletedBy | Single line of text | — | Flow 3 | Email of the person who completed it |
| ReleasedOn | Date and time | — | Flow 3 | |
| CorrectionLog | Multiple lines | — | TL | Reason for any correction made after submission |

**Views**

| View | Filter / layout |
|---|---|
| *Overdue* | ReviewState = Open **and** DueDate < `[Today]` |
| *Open actions* | ActionsStatus = Open, sorted by ActionsDueBy |
| *All* | default view |

### C.5 Relationships

```
Technicians.TechnicianAadId ─1:N─▶ Manager Reviews.TechnicianAadId   (and ReviewKey)
Manager Reviews.ReviewItemId ─1:1─▶ Monthly Reviews.ID               (immutable SharePoint ID)
Appraisal Expectations.ID ──copied──▶ Manager Reviews.ExpectationSnapshotJson[].id (trusted)
                          ──copied──▶ Monthly Reviews.ExpectationsJson[].id        (technician copy + ratings)
                                      Manager Reviews.ExpectationFeedbackJson[].id (TL feedback)
```

There are no lookup columns, so nothing breaks when a technician lacks access to a related list. About 240 unique permission scopes a year at 10 technicians, well inside SharePoint's limits.

---

## D. Security model

### D.1 Site

| Setting | Value |
|---|---|
| Site type | **Communication site.** No Microsoft 365 group, so there's no group membership to leak. |
| Owners group | **TL only** (D4). A quarterly 2-minute check confirms nobody else has been added. |
| Members, Visitors | **Empty.** Remove "Everyone except external users" if it appears. |
| Sharing | **Only site owners can share.** **Access requests: Off.** |
| External sharing | Off or organisation-only (IT-8) |
| Sensitivity label | The organisation's HR/Confidential label, if one exists (IT-8) |
| Time zone | (UTC) Dublin, Edinburgh, Lisbon, London. Locale English (UK). |

### D.2 Lists

Break inheritance on all four lists so that only **Owners (Full Control)** remains.

### D.3 Custom permission levels

| Level | Created by copying | Untick | Used for |
|---|---|---|---|
| **`1-to-1 Edit`** | Contribute | Add Items, Delete Items, Delete Versions, Manage Personal Views, Add/Remove Personal Web Parts, Update Personal Web Parts | Technician on **their own open** Monthly Review |
| **`1-to-1 Read`** | Read | **View Versions**, Create Alerts | Technician on their submitted review and on their **released** Manager Review. Without View Versions, they can't see the TL's earlier drafts. |

Keep **Use Remote Interfaces** ticked in both, because Power Apps needs it.

### D.4 Who can do what

| Item | Technician access | Set by |
|---|---|---|
| Own Monthly Review, while Open | `1-to-1 Edit`. They can read and edit it, but not delete it, create new items or change permissions. | Flow 1, before the email is sent |
| Own Monthly Review, after submit or close | `1-to-1 Read` | Flow 2 (submit), Flow 3 (complete or close) |
| Own Manager Review, before completion | **None** (inherits manager-only) | — |
| Own Manager Review, after completion or close | `1-to-1 Read` | Flow 3 |
| Anyone else's items | **None** | — |
| Technicians, Appraisal Expectations | **None** | — |

**The permission routine (`SETPERM`, four REST calls).** This routine is the same everywhere it's used. It's idempotent, and it builds exactly the intended permissions:

1. `resetroleinheritance`. The item returns to manager-only permissions, which is always the safe direction.
2. `breakroleinheritance(copyRoleAssignments=false)`. Nothing is copied.
3. Add the **Owners group** with **Full Control**.
4. Add **the technician** (taken from Manager Reviews) with `1-to-1 Edit` or `1-to-1 Read`.

If any call fails, the flow stops **before** sending any email.

**Why a link can never point at an unprotected record.** A new item is created inside a list only the TL can see, so it's private from the moment it exists. Access is granted to that one technician, and only then is the email sent.

**What stops technicians changing workflow state.** The only state that matters, `ReviewState` and the timestamps, lives on Manager Reviews, which technicians can't write to.

- If a technician sets their Monthly Review status to *Submitted*, *Completed* or *Closed* through the API, Flow 2 treats it as a submission. It locks the item and corrects the status.
- Lateness is calculated from the trusted due date.
- The TL screen and the history read expectation titles from the trusted snapshot.

Section 4 of `PLAN_REVIEW.md` lists 20 bypass attempts and why each fails.

**Flow identity.** The flows use the TL's connection (D1), because only an owner can change permissions. They react only to SharePoint changes that SharePoint has already authorised, and never accept a technician-supplied ID or email.

**Run history.** Flow run history shows the data flows handle for 28 days, and only flow owners can see it. Once testing is finished, turn on **Secure inputs** and **Secure outputs** on the trigger and on every Get items action, and **don't add co-owners**.

**Administrators.** Tenant administrators can technically access the data. Say so in the privacy notice (IT-9).

### D.5 Retention and deletion

These are placeholders until HR answers HR-1.

- **Retention period:** HR to set the number of years.
- **Purview label available:** apply it as the **default label** on Monthly Reviews and Manager Reviews.
- **No label:** the TL carries out a documented **annual April deletion**. Filter by MonthKey older than the retention period, delete, record the deletion in a dated note, then empty the site recycle bin and the second-stage recycle bin.
- **Leavers:** set Active = No in Technicians and keep their records for the retention period.
- **Subject access requests:** export the list views filtered by technician, using **Export → CSV**.

---

## E. Power Apps specification

### E.1 App.Formulas (paste as-is, then edit the two `CONFIG` lines)

```powerfx
ManagerEmail = "team.leader@yourcompany.co.uk";                       // CONFIG – exactly as User().Email shows it
SiteUrl      = "https://yourtenant.sharepoint.com/sites/ESG-1to1";    // CONFIG

IsManager    = Lower(User().Email) = Lower(ManagerEmail);   // routing only – NOT a security control
OptDedicated = "Arrange a dedicated 1-to-1 discussion";
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
ProgressScale = Table(
    {Value: 1, Label: "1 – Not started: no progress yet"},
    {Value: 2, Label: "2 – Early progress: behind where I'd expect"},
    {Value: 3, Label: "3 – On track: progressing as expected"},
    {Value: 4, Label: "4 – Strong progress: ahead of expectations"},
    {Value: 5, Label: "5 – Fully met: achieved and evidenced"}
);
```

**App.StartScreen**

```powerfx
If(IsManager, If(IsBlank(Param("reviewId")), scrDashboard, scrManagerReview), scrTechReview)
```

The app uses three data sources: **Monthly Reviews**, **Manager Reviews** and **Technicians**.

### E.2 Screen `scrTechReview`

**Layout**

```
scrTechReview
 ├─ conScreen  (vertical container, fills screen)
 │   ├─ conHeader (vertical, fixed height ~150, light grey)
 │   │   ├─ ddMonth             my reviews, newest first
 │   │   ├─ lblDeadline, lblStatus
 │   │   └─ conButtons (horizontal): btnSave, btnSubmit, btnLoad (hidden)
 │   └─ conPage  (vertical, flexible height, scrolls; padding 16, gap 10)
 │       ├─ lblNoAccess
 │       ├─ lblIntro
 │       ├─ Q1: lblQ1, txtQ1, lblFbQ1
 │       ├─ Q2: lblQ2, lblQ2a, txtQ2Issue, lblQ2b, txtQ2Impact, lblQ2c, txtQ2Tried, lblQ2d, txtQ2Support, lblFbQ2
 │       ├─ Q3: lblQ3, rdoQ3, txtQ3, lblFbQ3
 │       ├─ Q4: lblQ4, lblQ4Guide, rdoQ4, txtQ4, lblFbQ4
 │       ├─ Q5: lblQ5, rdoQ5, txtQ5, lblFbQ5
 │       ├─ Q6: lblQ6, rdoQ6, txtQ6What, txtQ6Why, lblFbQ6
 │       ├─ Q7: lblQ7, txtQ7, lblFbQ7
 │       ├─ Q8: lblQ8, lblQ8Scale, lblQ8None, galQ8 { lblExpTitle, lblExpMeasures, rdoQ8, txtQ8, lblExpFb }
 │       ├─ Q9: lblQ9, rdoQ9, lblFbQ9
 │       ├─ lblFbOverall          (overall feedback, follow-up decision, agreed actions)
 │       └─ lblMissing            ("Still to complete: …")
 └─ conConfirm (overlay, full screen): lblConfirm, btnConfirmSubmit, btnCancel
```

**Question wording**

| Label | Text |
|---|---|
| lblQ1 | "1. What has gone well for you this month?" |
| lblQ2 | "2. Challenges, blockers and support needed (optional – a sentence or two is fine)" |
| lblQ2a–d | "What's the issue?" / "What's the impact?" / "What have you tried?" / "What support is needed?" |
| lblQ3 | "3. How would you rate your current workload?" |
| lblQ4 | "4. Is there anything relating to your wellbeing, workplace support or reasonable adjustments you would like to raise?" |
| lblQ5 | "5. Is there anything upcoming that your line manager should be aware of for planning purposes?" |
| lblQ6 | "6. Do you have any training, development requirements or career aspirations you would like to discuss?" |
| lblQ7 | "7. Do you have any feedback for your line manager?" |
| lblQ8 | "8. Appraisal expectations – how are you progressing?" |
| lblQ8Scale | "Rate your progress against each expectation (this is not a workload score): 1 Not started · 2 Early progress · 3 On track · 4 Strong progress · 5 Fully met" |
| lblQ9 | "9. How would you prefer to follow up on this month's review?" |

**lblIntro:** "Save as often as you like and come back any time before the deadline. Short answers are fine. You can ask for a conversation at any time – you don't need to wait for this form. Submitting this form doesn't replace any formal appraisal or meeting your role requires."

**lblQ4Guide:** "Please don't include medical diagnoses, medical history or treatment details. You can simply say you'd like to talk, and a conversation will be arranged. Health matters, occupational health referrals and formal adjustment requests are handled confidentially through the company's HR and Occupational Health processes. Employee Assistance Programme: «EAP contact – CONFIG»."

**Control properties**

| Control | Property | Formula |
|---|---|---|
| scrTechReview | OnVisible | `Select(btnLoad)` |
| btnLoad | Visible | `false` |
| ddMonth | Items | `Sort('Monthly Reviews', MonthStart, SortOrder.Descending)` (permissions return only the technician's own items) |
| ddMonth | Value (display field) | `MonthKey` |
| ddMonth | Default | `gReview.MonthKey` |
| ddMonth | OnChange | `Set(gReview, Self.Selected); Select(btnLoad)` |
| lblDeadline | Text | `"Deadline: 23:59, " & Text(gReview.DueDate, "dddd d mmmm yyyy")` |
| lblStatus | Text | `gReview.ReviewStatus.Value & If(gReview.ReviewStatus.Value in ["Not Started","Draft"] && Now() > gReview.DueDate, " – OVERDUE (you can still submit)", "")` |
| btnSave, btnSubmit | Visible | `gEditable` |
| lblNoAccess | Visible | `IsBlank(gReview)` |
| lblNoAccess | Text | "This review could not be found, or it isn't yours. Use the link in your latest email or contact your Team Leader." |
| All questions and inputs | Visible | `!IsBlank(gReview)` |
| All inputs | DisplayMode | `If(gEditable, DisplayMode.Edit, DisplayMode.View)` |
| All text inputs | Mode | `TextMode.MultiLine` |
| All text inputs | Height | 90 |
| txtQ1 … txtQ7 | Default | the matching field, e.g. `gReview.Q1WentWell`, `gReview.Q2Issue` |
| rdoQ3 | Items | `WorkloadScale` (set the display field to **Label**) |
| rdoQ3 | Default | `LookUp(WorkloadScale, Value = gReview.Q3WorkloadRating).Label` |
| rdoQ4 / rdoQ5 / rdoQ6 | Items | `YesNo` |
| rdoQ4 / rdoQ5 / rdoQ6 | Default | `gReview.Q4WellbeingRaise.Value` (Q5, Q6 likewise) |
| rdoQ4 / rdoQ5 / rdoQ6 | Layout | Horizontal |
| txtQ4 | Visible | `rdoQ4.Selected.Value = "Yes"` |
| txtQ5 | Visible | `rdoQ5.Selected.Value = "Yes"` |
| txtQ6What, txtQ6Why | Visible | `rdoQ6.Selected.Value = "Yes"` |
| rdoQ9 | Items | `FollowUpOptions` |
| rdoQ9 | Default | `gReview.Q9FollowUp.Value` |
| lblFbQ1 … lblFbQ9 | Visible | `!IsBlank(gMgr)` |
| lblFbQ1 … lblFbQ9 | Text | `"Team Leader: " & gMgr.FB_Q1` (Q2–Q9 likewise) |
| lblFbQ1 … lblFbQ9 | Fill | light grey |
| lblFbOverall | Visible | `!IsBlank(gMgr)` |
| lblFbOverall | Text | `"Overall: " & gMgr.FB_Overall & Char(10) & "Follow-up: " & Coalesce(gMgr.FollowUpDecision.Value, gMgr.TechFollowUp) & If(IsBlank(gMgr.MeetingDate), "", " on " & Text(gMgr.MeetingDate, "dd mmm yyyy")) & Char(10) & "Agreed actions:" & Char(10) & gMgr.AgreedActions` |
| lblQ8None | Visible | `IsEmpty(colExp)` |
| lblQ8None | Text | "No appraisal expectations are set for you this month." |
| galQ8 | Items | `colExp` |
| galQ8 | TemplateSize | 330 |
| galQ8 | Height | `Max(1, CountRows(colExp)) * 330` |
| lblExpTitle | Text | `ThisItem.title` |
| lblExpMeasures | Text | `ThisItem.measures & " (" & ThisItem.year & ")"` |
| rdoQ8 | Items | `ProgressScale` (display field **Label**) |
| rdoQ8 | Default | `LookUp(ProgressScale, Value = ThisItem.rating).Label` |
| txtQ8 | Default | `ThisItem.comment` |
| txtQ8 | HintText | "Progress comments / evidence" |
| lblExpFb | Visible | `!IsBlank(gMgr)` |
| lblExpFb | Text | `"Team Leader: " & LookUp(colExpFb, id = ThisItem.id).feedback` |
| conConfirm | Visible | `locConfirm` |
| lblConfirm | Text | "Submit your 1-to-1? You won't be able to change it afterwards." |
| btnCancel | OnSelect | `UpdateContext({locConfirm: false})` |

**`btnLoad.OnSelect`** loads or refreshes the current review:

```powerfx
If(IsBlank(gReview),
    Set(gReview, If(!IsBlank(Param("reviewId")),
        LookUp('Monthly Reviews', ID = Value(Param("reviewId"))),
        First(Sort('Monthly Reviews', MonthStart, SortOrder.Descending)))));
If(!IsBlank(gReview), Set(gReview, LookUp('Monthly Reviews', ID = gReview.ID)));
Set(gEditable, !IsBlank(gReview) && gReview.ReviewStatus.Value in ["Not Started", "Draft"]);
// Returns blank until the TL has released feedback (no permission = nothing to read)
Set(gMgr, IfError(LookUp('Manager Reviews', ReviewItemId = gReview.ID), Blank()));
ClearCollect(colExp, ForAll(Table(ParseJSON(Coalesce(gReview.ExpectationsJson, "[]"))) As e,
    {id: Value(e.Value.id), title: Text(e.Value.title), measures: Text(e.Value.measures),
     year: Text(e.Value.year), rating: Value(e.Value.rating), comment: Text(e.Value.comment)}));
ClearCollect(colExpFb, ForAll(Table(ParseJSON(Coalesce(gMgr.ExpectationFeedbackJson, "[]"))) As f,
    {id: Value(f.Value.id), feedback: Text(f.Value.feedback)}));
UpdateContext({locConfirm: false, locSubmit: false})
```

**`lblMissing.Text`** lists the required answers that are still blank. Its Visible is `gEditable && !IsBlank(Self.Text)`, and it's best shown in red.

```powerfx
Concat(Filter(Table(
    {Ok: !IsBlank(Trim(txtQ1.Text)),                                   Item: "Q1"},
    {Ok: !IsBlank(rdoQ3.Selected.Value),                               Item: "Q3 rating"},
    {Ok: !IsBlank(rdoQ4.Selected.Value),                               Item: "Q4 Yes/No"},
    {Ok: rdoQ4.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ4.Text)),  Item: "Q4 details"},
    {Ok: !IsBlank(rdoQ5.Selected.Value),                               Item: "Q5 Yes/No"},
    {Ok: rdoQ5.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ5.Text)),  Item: "Q5 details"},
    {Ok: !IsBlank(rdoQ6.Selected.Value),                               Item: "Q6 Yes/No"},
    {Ok: rdoQ6.Selected.Value <> "Yes" || !IsBlank(Trim(txtQ6What.Text)), Item: "Q6 what is required"},
    {Ok: CountRows(Filter(galQ8.AllItems, IsBlank(rdoQ8.Selected.Value))) = 0, Item: "Q8 rating for each expectation"},
    {Ok: !IsBlank(rdoQ9.Selected.Value),                               Item: "Q9"}
), !Ok), Item, ", ")
```

Every detail check passes when the answer isn't "Yes". That's why hidden fields can never block submission.

**`btnSubmit.OnSelect`**

```powerfx
If(!IsBlank(lblMissing.Text),
    Notify("Before submitting, please complete: " & lblMissing.Text, NotificationType.Error),
    UpdateContext({locConfirm: true}))
```

**`btnConfirmSubmit.OnSelect`**

```powerfx
UpdateContext({locSubmit: true}); Select(btnSave)
```

**`btnSave.OnSelect`** is the only place that writes answers. Submit reuses it.

```powerfx
IfError(
    Set(gReview, Patch('Monthly Reviews', gReview, {
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
        Q9FollowUp: If(IsBlank(rdoQ9.Selected.Value), Blank(), {Value: rdoQ9.Selected.Value}),
        ReviewStatus: {Value: If(locSubmit, "Submitted", "Draft")}
    }));
    If(locSubmit,
        Set(gEditable, false); Notify("Submitted – your Team Leader has been notified.", NotificationType.Success),
        Notify("Draft saved at " & Text(Now(), "hh:mm"), NotificationType.Success)),
    Notify(If(locSubmit, "NOT submitted – ", "Draft NOT saved – ") & FirstError.Message, NotificationType.Error)
);
UpdateContext({locSubmit: false, locConfirm: false})
```

### E.3 Screen `scrManagerReview` (TL)

**Layout**

```
scrManagerReview
 ├─ conScreen
 │   ├─ conHeader:
 │   │   ├─ lblWho, lblState, lblRequested (amber banner)
 │   │   └─ buttons: btnSaveFb, btnComplete, btnClose, btnBack, btnLoadMgr (hidden)
 │   └─ conPage (scrolls):
 │       ├─ lblReleased (notice when already released)
 │       ├─ for Q1–Q7 and Q9: heading label, lblAnsQn (technician answer, read-only), txtFbQn (TL feedback)
 │       ├─ Q8: galFbQ8 { lblSnapTitle, lblSnapMeasures, lblTechProgress, txtFbQ8 }
 │       ├─ txtFbOverall, ddFollowUp, dpMeeting
 │       ├─ txtActions, dpActionsDue, ddActionsStatus
 │       └─ txtCorrection (visible only after release)
 └─ conConfirmMgr (overlay): lblConfirmMgr, btnConfirmMgr, btnCancelMgr
```

**`scrManagerReview.OnVisible`:** `Select(btnLoadMgr)`

**`btnLoadMgr.OnSelect`**

```powerfx
If(IsBlank(gMgr) && !IsBlank(Param("reviewId")),
    Set(gMgr, LookUp('Manager Reviews', ReviewItemId = Value(Param("reviewId")))));
Set(gMgr, LookUp('Manager Reviews', ID = gMgr.ID));
Set(gReview, LookUp('Monthly Reviews', ID = gMgr.ReviewItemId));
// Trusted titles/measures come from the TL's record, not the technician's copy
ClearCollect(colSnap, ForAll(Table(ParseJSON(Coalesce(gMgr.ExpectationSnapshotJson, "[]"))) As s,
    {id: Value(s.Value.id), title: Text(s.Value.title), measures: Text(s.Value.measures), year: Text(s.Value.year)}));
ClearCollect(colExp, ForAll(Table(ParseJSON(Coalesce(gReview.ExpectationsJson, "[]"))) As e,
    {id: Value(e.Value.id), rating: Value(e.Value.rating), comment: Text(e.Value.comment)}));
ClearCollect(colExpFb, ForAll(Table(ParseJSON(Coalesce(gMgr.ExpectationFeedbackJson, "[]"))) As f,
    {id: Value(f.Value.id), feedback: Text(f.Value.feedback)}));
UpdateContext({locCommand: "", locPending: "", locConfirm: false})
```

**Control properties**

| Control | Property | Formula |
|---|---|---|
| lblWho | Text | `gMgr.Technician.DisplayName & " – " & gMgr.MonthKey` |
| lblState | Text | `gMgr.ReviewState.Value & If(gMgr.SubmittedLate, " (submitted late)", "") & If(gMgr.ReviewState.Value = "Open" && Now() > gMgr.DueDate, " – OVERDUE", "") & If(gMgr.ReviewState.Value = "Open", " · technician: " & gReview.ReviewStatus.Value, "")` |
| lblRequested | Visible | `Coalesce(gMgr.FollowUpDecision.Value, gMgr.TechFollowUp) = OptDedicated` |
| lblRequested | Text | "Dedicated 1-to-1 discussion requested" |
| lblRequested | Fill | amber |
| lblReleased | Visible | `!IsBlank(gMgr.ReleasedOn)` |
| lblReleased | Text | "Released on " & Text(gMgr.ReleasedOn, "dd mmm yyyy") & ". Any change you save now is visible to the technician immediately. Record the reason in the correction log." |
| lblAnsQ1 | Text | `gReview.Q1WentWell` (AutoHeight on) |
| lblAnsQ2 | Text | `"Issue: " & gReview.Q2Issue & Char(10) & "Impact: " & gReview.Q2Impact & Char(10) & "Tried: " & gReview.Q2Tried & Char(10) & "Support needed: " & gReview.Q2Support` |
| lblAnsQ3 | Text | `Coalesce(LookUp(WorkloadScale, Value = gReview.Q3WorkloadRating).Label, "(not rated)") & Char(10) & gReview.Q3WorkloadComment` |
| lblAnsQ4 | Text | `Coalesce(gReview.Q4WellbeingRaise.Value, "(not answered)") & Char(10) & gReview.Q4WellbeingDetail` |
| lblAnsQ5 | Text | as Q4, using Q5 fields |
| lblAnsQ6 | Text | `Coalesce(gReview.Q6DevRaise.Value, "(not answered)") & Char(10) & "What: " & gReview.Q6DevWhat & Char(10) & "Why: " & gReview.Q6DevWhy` |
| lblAnsQ7 | Text | `gReview.Q7ManagerFeedback` |
| lblAnsQ9 | Text | `"Technician preference: " & Coalesce(gReview.Q9FollowUp.Value, "(not answered)")` |
| txtFbQ1 … txtFbQ9 | Default | `gMgr.FB_Q1` (likewise) |
| txtFbQ1 … txtFbQ9 | Mode | MultiLine |
| txtFbQ1 … txtFbQ9 | Visible | always, **including when the technician answered No** |
| galFbQ8 | Items | `colSnap` (the trusted list) |
| galFbQ8 | TemplateSize | 260 |
| galFbQ8 | Height | `Max(1, CountRows(colSnap)) * 260` |
| lblSnapTitle | Text | `ThisItem.title` |
| lblSnapMeasures | Text | `ThisItem.measures & " (" & ThisItem.year & ")"` |
| lblTechProgress | Text | `With({r: LookUp(colExp, id = ThisItem.id)}, "Technician: " & Coalesce(LookUp(ProgressScale, Value = r.rating).Label, "not rated") & Char(10) & r.comment)` |
| txtFbQ8 | Default | `LookUp(colExpFb, id = ThisItem.id).feedback` |
| txtFbOverall | Default | `gMgr.FB_Overall` |
| ddFollowUp | Items | `FollowUpOptions` |
| ddFollowUp | AllowEmptySelection | true |
| ddFollowUp | Default | `gMgr.FollowUpDecision.Value` |
| ddFollowUp | label above | "Override follow-up (leave blank to accept the technician's preference)" |
| dpMeeting | DefaultDate | `gMgr.MeetingDate` |
| txtActions | Default | `gMgr.AgreedActions` |
| txtActions | HintText | "One action per line – what, who, by when" |
| dpActionsDue | DefaultDate | `gMgr.ActionsDueBy` |
| ddActionsStatus | Items | `["Open", "Done"]` |
| ddActionsStatus | Default | `If(gMgr.ActionsStatus.Value = "Done", "Done", "Open")` |
| txtCorrection | Visible | `!IsBlank(gMgr.ReleasedOn)` |
| txtCorrection | Default | `gMgr.CorrectionLog` |
| btnComplete | DisplayMode | `If(gMgr.ReviewState.Value = "Submitted", DisplayMode.Edit, DisplayMode.Disabled)` |
| btnComplete | OnSelect | `UpdateContext({locPending: "Completed", locConfirm: true})` |
| btnClose | DisplayMode | `If(gMgr.ReviewState.Value = "Open" && Now() > gMgr.DueDate, DisplayMode.Edit, DisplayMode.Disabled)` |
| btnClose | OnSelect | `UpdateContext({locPending: "Closed - Not Submitted", locConfirm: true})` |
| conConfirmMgr | Visible | `locConfirm` |
| lblConfirmMgr | Text | `If(locPending = "Completed", "Complete this review and release your feedback to the technician?", "Close this review as not submitted? The technician will no longer be able to submit it.")` |
| btnConfirmMgr | OnSelect | `UpdateContext({locCommand: locPending}); Select(btnSaveFb)` |
| btnCancelMgr | OnSelect | `UpdateContext({locConfirm: false})` |
| btnBack | OnSelect | `Set(gMgr, Blank()); Set(gReview, Blank()); Navigate(scrDashboard)` |

**`btnSaveFb.OnSelect`** saves the feedback, then optionally sends the *Completed* or *Closed* command. These are two separate writes, so a save can never overwrite a state that a flow has just changed.

```powerfx
IfError(
    Set(gMgr, Patch('Manager Reviews', gMgr, {
        FB_Q1: txtFbQ1.Text, FB_Q2: txtFbQ2.Text, FB_Q3: txtFbQ3.Text, FB_Q4: txtFbQ4.Text,
        FB_Q5: txtFbQ5.Text, FB_Q6: txtFbQ6.Text, FB_Q7: txtFbQ7.Text, FB_Q9: txtFbQ9.Text,
        FB_Overall: txtFbOverall.Text,
        ExpectationFeedbackJson: JSON(ForAll(galFbQ8.AllItems, {id: id, feedback: txtFbQ8.Text}), JSONFormat.Compact),
        FollowUpDecision: If(IsBlank(ddFollowUp.Selected.Value), Blank(), {Value: ddFollowUp.Selected.Value}),
        MeetingDate: dpMeeting.SelectedDate,
        AgreedActions: txtActions.Text,
        ActionsDueBy: dpActionsDue.SelectedDate,
        ActionsStatus: {Value: If(IsBlank(Trim(txtActions.Text)), "None", ddActionsStatus.Selected.Value)},
        CorrectionLog: txtCorrection.Text
    }));
    If(!IsBlank(locCommand),
        Patch('Manager Reviews', gMgr, {ReviewState: {Value: locCommand}});
        Notify("Done – the technician will be emailed within about 5 minutes.", NotificationType.Success);
        Set(gMgr, Blank()); Set(gReview, Blank()); Navigate(scrDashboard),
        Notify(If(IsBlank(gMgr.ReleasedOn), "Saved – not visible to the technician until you complete the review.",
                  "Saved – already released, so the technician can see this change."), NotificationType.Success)),
    Notify("NOT saved – " & FirstError.Message, NotificationType.Error)
);
UpdateContext({locCommand: "", locConfirm: false})
```

### E.4 Screen `scrDashboard` (TL; embedded on the site home page)

**Layout**

```
scrDashboard
 └─ conScreen
     ├─ conTop:
     │   ├─ lblTitle "ESG Technician 1-to-1"
     │   ├─ conKpis (horizontal): 8 KPI labels
     │   ├─ conNav (horizontal): btnNavReviews, btnNavExpectations, btnNavActions, btnRefresh
     │   ├─ conFilters (horizontal): ddMonth, ddTech, lblKpiMonth (hidden), btnLoadDash (hidden)
     │   └─ conColHeads (horizontal): column heading labels
     ├─ galRows (flexible height): one row per review
     └─ lblFooter
```

**`scrDashboard.OnVisible`:** `Select(btnLoadDash)`

**`btnLoadDash.OnSelect`** (a hidden button, Visible `false`):

```powerfx
Concurrent(
    ClearCollect(colTechs, Filter(Technicians, Active = true)),
    ClearCollect(colMgrAll, 'Manager Reviews'),
    ClearCollect(colRevAll, ShowColumns('Monthly Reviews', ID, ReviewStatus, Q3WorkloadRating))
);
ClearCollect(colRows, ForAll(colMgrAll As m, {
    MgrId: m.ID,
    Technician: m.Technician.DisplayName,
    TechnicianAadId: m.TechnicianAadId,
    MonthKey: m.MonthKey,
    State: m.ReviewState.Value,
    Started: LookUp(colRevAll, ID = m.ReviewItemId).ReviewStatus.Value = "Draft",
    Workload: LookUp(colRevAll, ID = m.ReviewItemId).Q3WorkloadRating,
    SubmittedOn: m.SubmittedOn,
    Late: m.SubmittedLate,
    Overdue: m.ReviewState.Value = "Open" && Now() > m.DueDate,
    FollowUp: Coalesce(m.FollowUpDecision.Value, m.TechFollowUp),
    ActionsOpen: m.ActionsStatus.Value = "Open",
    ActionsDueBy: m.ActionsDueBy
}));
If(IsBlank(locTab), UpdateContext({locTab: "Reviews"}))
```

This loads all records, which is fine up to the 2,000-row app limit (about 16 years at 10 technicians).

**Filters and navigation**

| Control | Property | Formula |
|---|---|---|
| ddMonth | Items | `Sort(Distinct(colRows, MonthKey), Value, SortOrder.Descending)` |
| ddMonth | Default | `Text(Today(), "yyyy-mm")` |
| ddMonth | AllowEmptySelection | true (blank = all months) |
| ddTech | Items | `Sort(colTechs, Title)` |
| ddTech | Value | `Title` |
| ddTech | AllowEmptySelection | true (blank = all technicians) |
| lblKpiMonth | Visible | false |
| lblKpiMonth | Text | `Coalesce(ddMonth.Selected.Value, Text(Today(), "yyyy-mm"))` |
| btnNavReviews | OnSelect | `UpdateContext({locTab: "Reviews"})` |
| btnNavExpectations | OnSelect | `Launch(SiteUrl & "/Lists/AppraisalExpectations/AllItems.aspx")` |
| btnNavActions | OnSelect | `UpdateContext({locTab: "Actions"})` |
| btnRefresh | OnSelect | `Select(btnLoadDash)` |

**KPI labels** (each label's `Text`)

| KPI | Formula |
|---|---|
| Month | `Text(DateValue(lblKpiMonth.Text & "-01"), "mmmm yyyy")` |
| Active technicians | `CountRows(colTechs)` |
| Submitted | `CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && State in ["Submitted", "Completed"]))` |
| Awaiting your review | `CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && State = "Submitted"))` |
| Completed | `CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && State = "Completed"))` |
| Outstanding / overdue | `CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && State = "Open")) & " / " & CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && Overdue))` |
| Dedicated 1-to-1 requested | `CountRows(Filter(colRows, MonthKey = lblKpiMonth.Text && FollowUp = OptDedicated))` |
| Open actions (overdue) | `CountRows(Filter(colRows, ActionsOpen)) & " (" & CountRows(Filter(colRows, ActionsOpen && ActionsDueBy < Today())) & ")"` |

**`galRows.Items`**

```powerfx
If(locTab = "Actions",
    SortByColumns(Filter(colRows, ActionsOpen), ActionsDueBy, SortOrder.Ascending),
    SortByColumns(Filter(colRows,
        (IsBlank(ddMonth.Selected.Value) || MonthKey = ddMonth.Selected.Value) &&
        (IsBlank(ddTech.Selected.Title) || TechnicianAadId = ddTech.Selected.TechnicianAadId)),
      MonthKey, SortOrder.Descending, Technician, SortOrder.Ascending))
```

**Row columns** (labels inside galRows)

| Column | Formula |
|---|---|
| Technician | `ThisItem.Technician` |
| Month | `ThisItem.MonthKey` |
| Status | `Switch(ThisItem.State, "Open", If(ThisItem.Overdue, "OVERDUE – ", "") & If(ThisItem.Started, "Draft", "Not started"), "Submitted", "Awaiting your review", "Completed", "Completed", "Closed - Not Submitted", "Closed – not submitted") & If(ThisItem.Late, " (late)", "")` |
| Submitted | `Text(ThisItem.SubmittedOn, "dd mmm")` |
| Workload | `ThisItem.Workload` |
| Follow-up | `ThisItem.FollowUp` |
| Actions | `If(ThisItem.ActionsOpen, "Open – due " & Text(ThisItem.ActionsDueBy, "dd mmm"), "")` |
| Open (button) | `Set(gMgr, LookUp('Manager Reviews', ID = ThisItem.MgrId)); Navigate(scrManagerReview)` |

Row formatting:

- Gallery template **Fill:** `If(ThisItem.FollowUp = OptDedicated, RGBA(255, 244, 206, 1), Transparent)`
- Status label **Color:** `If(ThisItem.Overdue, Color.DarkRed, Color.Black)`

To see one technician's history, including the workload trend, choose the technician and clear the month.

**lblFooter:** "A written check-in does not by itself satisfy any formal appraisal or meeting requirement."

If a technician ever reached this screen, they would see only their own data, because SharePoint filters every query.

---

## F. Power Automate specification

### F.0 Configuration values and the shared permission block

**Initialize variable** actions at the top of every flow (Flow 1 also adds `varTestDate` and `varProblems`):

| Variable | Type | Value |
|---|---|---|
| varManagerEmail | String | TL email |
| varAppLink | String | `<App web link>&hidenavbar=true`. The web link already contains `?tenantId=…`. |
| varOwnersId | Integer | from G Part 4 |
| varFullControlId | Integer | from G Part 4 (normally `1073741829`) |
| varEditId | Integer | ID of `1-to-1 Edit`, from G Part 4 |
| varReadId | Integer | ID of `1-to-1 Read`, from G Part 4 |

**`SETPERM` block.** Four *Send an HTTP request to SharePoint* actions, each with:

- **Site Address:** the 1-to-1 site
- **Method:** POST
- **Headers:** `Accept` = `application/json;odata=nometadata`

| # | Action name | Uri |
|---|---|---|
| 1 | `Reset_<x>` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/resetroleinheritance` |
| 2 | `Break_<x>` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)` |
| 3 | `AddOwners_<x>` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/roleassignments/addroleassignment(principalid=@{variables('varOwnersId')},roledefid=@{variables('varFullControlId')})` |
| 4 | `AddTech_<x>` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/roleassignments/addroleassignment(principalid=@{body('Ensure_user')?['Id']},roledefid=<ROLE-ID>)` |

`<LIST>` is `Monthly Reviews` or `Manager Reviews`. If a call returns *400 Bad Request*, write the space as `%20`.

**`Ensure_user`** resolves the technician's SharePoint principal ID. It's another *Send an HTTP request to SharePoint* action:

- **Method:** POST
- **Uri:** `_api/web/ensureuser`
- **Headers:**
  - `Accept` = `application/json;odata=nometadata`
  - `Content-Type` = `application/json;odata=nometadata`
- **Body:** `{"logonName":"<technician Claims from Manager Reviews>"}`

The principal ID is then `body('Ensure_user')?['Id']`.

**Error handling, the same in every flow.** Put all the work in a **Scope** named `Try`. Add a **Scope** named `Catch` and set its *Run after* to **has failed** and **has timed out** of `Try`.

Inside `Catch`:

1. **Send an email (V2)** to `varManagerEmail`, subject `1-to-1 system: action needed (<flow name>)`, with this run link in the body:

   ```
   concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])
   ```

2. **Terminate**, with Status **Failed**.

### F.1 Flow 1 — `1-to-1 | Daily scheduler`

**Trigger:** **Recurrence**

| Setting | Value |
|---|---|
| Interval | 1 |
| Frequency | Day |
| Time zone | (UTC+00:00) Dublin, Edinburgh, Lisbon, London |
| At these hours | 7 |
| At these minutes | 0 |
| Settings → Concurrency control | **On**, degree of parallelism **1** |

**Actions, in order**

1. **Initialize variables:**
   - varManagerEmail, varAppLink, varOwnersId, varFullControlId, varEditId
   - `varTestDate` (String, **empty in production**)
   - `varProblems` (Array)
   - `varTechAad` (String)
   - `varReviewId` (Integer)
2. **Compose** actions, using the action name shown and the expression given:

   | Name | Expression |
   |---|---|
   | `ukNow` | `if(empty(variables('varTestDate')), convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-ddTHH:mm:ss'), variables('varTestDate'))` |
   | `MonthKey` | `formatDateTime(outputs('ukNow'), 'yyyy-MM')` |
   | `LastDay` | `formatDateTime(addDays(addToTime(startOfMonth(outputs('ukNow')), 1, 'Month'), -1), 'yyyy-MM-dd')` |
   | `DueUtc` | `convertToUtc(concat(outputs('LastDay'), 'T23:59:59'), 'GMT Standard Time')` |
   | `DeadlineText` | `concat('23:59 on ', formatDateTime(outputs('LastDay'), 'dddd d MMMM yyyy'))` |
   | `MonthName` | `formatDateTime(outputs('ukNow'), 'MMMM yyyy')` |
   | `Day` | `dayOfMonth(outputs('ukNow'))` |

   `LastDay` handles 28, 29, 30 and 31-day months, including leap years. `DueUtc` handles the change between GMT and BST.

3. **Scope `Try`:**
   1. **Get items** `Get_technicians`. List: Technicians. Filter Query: `Active eq 1`.
   2. **Get items** `Get_expectations`. List: Appraisal Expectations. Filter Query: `Active eq 1`. Order By: `SortOrder asc`. Top Count: `500`.
   3. **Apply to each** `Each_technician` over `body('Get_technicians')?['value']`. Settings → Concurrency control **On, degree 1**.
      - **Scope `TechTry`:**
        1. **Set variable** `varTechAad` = `toLower(coalesce(items('Each_technician')?['TechnicianAadId'], ''))`
        2. **Condition** `No_AadId`: `variables('varTechAad')` *is equal to* (leave the right-hand side empty).
           - **True:**
             - **Get user profile (V2)** `Get_profile`, User = `items('Each_technician')?['Technician']?['Email']`
             - **Update item** (Technicians): Id = `items('Each_technician')?['ID']`, Title = `items('Each_technician')?['Title']`, TechnicianAadId = `toLower(body('Get_profile')?['id'])`
             - **Set variable** `varTechAad` = `toLower(body('Get_profile')?['id'])`
        3. **Compose** `ReviewKey` = `concat(variables('varTechAad'), '_', outputs('MonthKey'))`
        4. **Get items** `Find_mgr` (Manager Reviews): Filter `ReviewKey eq '@{outputs('ReviewKey')}'`, Top Count `1`.
        5. **Condition** `Mgr_missing`: `length(body('Find_mgr')?['value'])` *is equal to* `0`.
           - **True:**
             - **Filter array** `My_expectations`. From: `body('Get_expectations')?['value']`. Advanced mode:

               ```
               @or(equals(item()?['AppliesTo']?['Value'], 'Shared'), equals(toLower(coalesce(item()?['Technician']?['Email'], '')), toLower(items('Each_technician')?['Technician']?['Email'])))
               ```

             - **Condition** `Too_many`: `length(body('My_expectations'))` *is greater than* `10`. If true, **Append to array variable** `varProblems`:

               ```
               concat(items('Each_technician')?['Title'], ': more than 10 active expectations – only the first 10 by SortOrder were used.')
               ```

             - **Select** `Snapshot`. From: `take(body('My_expectations'), 10)`. Map (key → value):

               | Key | Value |
               |---|---|
               | `id` | `item()?['ID']` |
               | `title` | `item()?['Title']` |
               | `measures` | `item()?['Measures']` |
               | `year` | `item()?['AppraisalYear']` |

             - **Create item** (Manager Reviews):

               | Field | Value |
               |---|---|
               | Title | `concat(items('Each_technician')?['Title'], ' – ', outputs('MonthKey'))` |
               | ReviewKey | `outputs('ReviewKey')` |
               | Technician Claims | `items('Each_technician')?['Technician']?['Claims']` |
               | TechnicianAadId | `variables('varTechAad')` |
               | MonthKey | `outputs('MonthKey')` |
               | DueDate | `outputs('DueUtc')` |
               | ReviewState Value | `Open` |
               | ActionsStatus Value | `None` |
               | ExpectationSnapshotJson | `string(body('Snapshot'))` |

               The unique ReviewKey means a duplicate create *fails* rather than creating a second record.
        6. **Get items** `Get_mgr` (Manager Reviews): same filter as `Find_mgr`, Top Count `1`. Then **Compose** `Mgr` = `first(body('Get_mgr')?['value'])`.
        7. **Condition** `Review_missing`, in advanced mode: `@equals(outputs('Mgr')?['ReviewItemId'], null)`. Don't use `empty()` here: it isn't valid on a number.
           - **True:**
             - **Select** `Tech_copy`. From: `json(coalesce(outputs('Mgr')?['ExpectationSnapshotJson'], '[]'))`. Map:

               | Key | Value |
               |---|---|
               | `id` | `item()?['id']` |
               | `title` | `item()?['title']` |
               | `measures` | `item()?['measures']` |
               | `year` | `item()?['year']` |
               | `rating` | `null` (entered as an expression) |
               | `comment` | an empty string |

             - **Create item** `Create_review` (Monthly Reviews). It's private from creation, because it inherits the manager-only list permissions.

               | Field | Value |
               |---|---|
               | Title | `outputs('Mgr')?['Title']` |
               | Technician Claims | `outputs('Mgr')?['Technician']?['Claims']` |
               | MonthKey | `outputs('Mgr')?['MonthKey']` |
               | MonthStart | `concat(outputs('Mgr')?['MonthKey'], '-01')` |
               | DueDate | `outputs('Mgr')?['DueDate']` |
               | ReviewStatus Value | `Not Started` |
               | ExpectationsJson | `string(body('Tech_copy'))` |

             - **Update item** (Manager Reviews): Id = `outputs('Mgr')?['ID']`, Title = `outputs('Mgr')?['Title']`, ReviewItemId = `body('Create_review')?['ID']`
             - **Set variable** `varReviewId` = `body('Create_review')?['ID']`
           - **False:** **Set variable** `varReviewId` = `outputs('Mgr')?['ReviewItemId']`
        8. **Condition** `Needs_link`, in advanced mode:

           ```
           @and(equals(outputs('Mgr')?['ReviewState']?['Value'], 'Open'), empty(outputs('Mgr')?['LinkSentOn']))
           ```

           - **True:**
             - `Ensure_user`, using Claims = `outputs('Mgr')?['Technician']?['Claims']`
             - **SETPERM** on list `Monthly Reviews`, item `@{variables('varReviewId')}`, role `@{variables('varEditId')}`
             - **Send an email (V2)** using **E1**, to `outputs('Mgr')?['Technician']?['Email']`
             - **Update item** (Manager Reviews): Id = `outputs('Mgr')?['ID']`, Title = `outputs('Mgr')?['Title']`, LinkSentOn = `utcNow()`
      - **Scope `TechCatch`**, with *Run after* `TechTry` **has failed** or **has timed out**. **Append to array variable** `varProblems`:

        ```
        concat('FAILED for ', items('Each_technician')?['Title'], ' – no email was sent. Open the run history for details.')
        ```

        One technician's failure doesn't stop the others. If a permission step fails, no link is emailed.
   4. **Condition** `Reminder_day`, in advanced mode: `@or(equals(outputs('Day'), 20), equals(outputs('Day'), 27))`.
      - **True:**
        - **Get items** `Outstanding` (Manager Reviews). Filter:

          ```
          MonthKey eq '@{outputs('MonthKey')}' and ReviewState eq 'Open' and LinkSentOn ne null
          ```

        - **Apply to each** over its value: **Send an email (V2)** using **E2**, to `items('Apply_to_each')?['Technician']?['Email']`.

        Submitted, completed and closed reviews never match, so they're never reminded.
   5. **Condition** `Any_problems`: `length(variables('varProblems'))` *is greater than* `0`.
      - **True:** **Send an email (V2)** using **E7** to `varManagerEmail`. The body is `join(variables('varProblems'), '<br>')` plus the run link.
4. **Scope `Catch`** (as in F.0).

**Duplicate prevention**

- The `Find_mgr` check runs before anything is created.
- **Unique ReviewKey on the manager-only list.** SharePoint itself refuses a second item, even if two runs race.
- `LinkSentOn` on the manager-only record means one link email per review.

**Self-healing.** If the run on the 1st fails part-way, the next day's run finishes only the missing steps. A technician added mid-month gets their review the next morning.

**Rare orphan.** If `Create_review` succeeds but the next *Update item* fails, the TL is emailed. That leaves a private, unlinked Monthly Review, which the TL deletes. The next run creates a clean one.

### F.2 Flow 2 — `1-to-1 | Review submitted`

**Trigger:** SharePoint **When an item is created or modified**. Site: the 1-to-1 site. List: **Monthly Reviews**.

**Trigger settings**

| Setting | Value |
|---|---|
| Trigger condition (one line) | `@not(contains(createArray('Not Started','Draft'), triggerBody()?['ReviewStatus']?['Value']))` |
| Concurrency control | On, degree 1 |

**There's deliberately no "Modified By" condition** (see PLAN_REVIEW S4).

**Actions**

1. **Initialize variables:** varManagerEmail, varAppLink, varOwnersId, varFullControlId, varReadId.
2. **Scope `Try`:**
   1. **Get items** `Find_mgr` (Manager Reviews): Filter `ReviewItemId eq @{triggerBody()?['ID']}`, Top Count `1`.
   2. **Condition** `Unknown_item`: `length(body('Find_mgr')?['value'])` *is equal to* `0`. If true, **Terminate**, Status **Cancelled**. This ignores anything Flow 1 didn't create.
   3. **Compose** `Mgr` = `first(body('Find_mgr')?['value'])`
   4. **Compose** `PrevState` = `outputs('Mgr')?['ReviewState']?['Value']`
   5. `Ensure_user` with Claims = `outputs('Mgr')?['Technician']?['Claims']`. Identity always comes from the trusted record.
   6. **SETPERM** on list `Monthly Reviews`, item `@{triggerBody()?['ID']}`, role `@{variables('varReadId')}`. **The review is now read-only to the technician.**
   7. **Condition** `First_submission`: `outputs('PrevState')` *is equal to* `Open`.
      - **True:**
        - **Update item** (Manager Reviews), Id = `outputs('Mgr')?['ID']`:

          | Field | Value |
          |---|---|
          | Title | `outputs('Mgr')?['Title']` |
          | ReviewState Value | `Submitted` |
          | SubmittedOn | `utcNow()` |
          | SubmittedLate | `greater(ticks(utcNow()), ticks(outputs('Mgr')?['DueDate']))` |
          | TechFollowUp | `coalesce(triggerBody()?['Q9FollowUp']?['Value'], '')` |

        - **Send an email (V2)** using **E3** to `varManagerEmail`.
   8. **Compose** `Desired` = `if(equals(outputs('PrevState'), 'Open'), 'Submitted', outputs('PrevState'))`
   9. **Condition** `Status_differs`: `triggerBody()?['ReviewStatus']?['Value']` *is not equal to* `outputs('Desired')`.
      - **True:** **Update item** (Monthly Reviews): Id = `triggerBody()?['ID']`, Title = `outputs('Mgr')?['Title']`, ReviewStatus Value = `outputs('Desired')`.

      This normalises any value a technician forced in through the API. Writing the status can trigger this flow once more, but on that run the status already matches, so nothing further happens.
3. **Scope `Catch`** (as in F.0). The email subject is `"Submission received but LOCK FAILED – check item " & ID`.

**Duplicate prevention.** The TL email and stamps are sent only when `PrevState` = Open on the trusted record. Every later run just re-applies Read, which changes nothing.

### F.3 Flow 3 — `1-to-1 | Manager decision`

**Trigger:** **When an item is created or modified**, list **Manager Reviews**. This list is manager-only, so its fields can be trusted.

**Trigger conditions** (two lines, both must be true)

```
@contains(createArray('Completed','Closed - Not Submitted'), triggerBody()?['ReviewState']?['Value'])
@empty(triggerBody()?['ReleasedOn'])
```

Concurrency control: On, degree 1.

**Actions**

1. **Initialize variables:** varManagerEmail, varAppLink, varOwnersId, varFullControlId, varReadId.
2. **Scope `Try`:**
   1. **Compose** `Cmd` = `triggerBody()?['ReviewState']?['Value']`
   2. **Condition** `Valid`, in advanced mode:

      ```
      @or(and(equals(outputs('Cmd'),'Completed'), not(empty(triggerBody()?['SubmittedOn']))), and(equals(outputs('Cmd'),'Closed - Not Submitted'), empty(triggerBody()?['SubmittedOn'])))
      ```

      - **False:**
        - **Update item** (Manager Reviews): Id = trigger ID, Title, ReviewState Value = `if(empty(triggerBody()?['SubmittedOn']), 'Open', 'Submitted')`
        - **Send an email (V2)** to the TL: "Not done: you can only complete a submitted review, and only close one that hasn't been submitted."
        - **Terminate**, Status **Cancelled**
   3. `Ensure_user` with Claims = `triggerBody()?['Technician']?['Claims']`
   4. **SETPERM** (suffix `_R`) on list `Monthly Reviews`, item `@{triggerBody()?['ReviewItemId']}`, role `@{variables('varReadId')}`. Locks the review.
   5. **SETPERM** (suffix `_M`) on list `Manager Reviews`, item `@{triggerBody()?['ID']}`, role `@{variables('varReadId')}`. **Releases the feedback.**
   6. **Update item** (Manager Reviews), Id = trigger ID:

      | Field | Value |
      |---|---|
      | Title | trigger Title |
      | ReleasedOn | `utcNow()` |
      | CompletedOn | `utcNow()` |
      | CompletedBy | `triggerBody()?['Editor']?['Email']` |

      Because `ReleasedOn` is now set, this update doesn't re-trigger Flow 3.
   7. **Update item** (Monthly Reviews): Id = `triggerBody()?['ReviewItemId']`, Title = trigger Title, ReviewStatus Value = `outputs('Cmd')`. Flow 2 then runs once, finds nothing to change, and stops.
   8. **Send an email (V2)** to `triggerBody()?['Technician']?['Email']`, using **E4** if `Cmd` = Completed, otherwise **E5**.
3. **Scope `Catch`** (as in F.0).

**Why three flows is the minimum.**

- Flow 1 runs on a **schedule**.
- Flow 2 runs on a **technician action**.
- Flow 3 runs on a **TL action**.

Merging any two of them would need polling, or a button flow that technicians could also call.

### F.4 Email templates

Each email is sent with **Send an email (V2)** from the TL's mailbox. They contain **no answers or feedback**, and **no technician-typed text** except the Q9 choice in E3.

The link is always `concat(variables('varAppLink'), '&reviewId=', <Monthly Review ID>)`. That's `variables('varReviewId')` in Flow 1, `items(...)?['ReviewItemId']` for reminders, `triggerBody()?['ID']` in Flow 2 and `triggerBody()?['ReviewItemId']` in Flow 3.

| ID | To | Subject | Body |
|---|---|---|---|
| E1 | Technician | `Your 1-to-1 for @{outputs('MonthName')} is ready` | Hi @{first(split(outputs('Mgr')?['Technician']?['DisplayName'],' '))},<br>Your monthly 1-to-1 is ready: **<a href="LINK">Open my 1-to-1</a>**.<br>Deadline: @{outputs('DeadlineText')}.<br>You can save a draft and come back as often as you like before submitting. If you'd like to talk sooner, just ask – you don't need to wait for this form.<br>This link only works when you're signed in with your own company account. The first time, click **Allow** if asked. |
| E2 | Technician | `Reminder: your 1-to-1 for @{outputs('MonthName')} is due @{outputs('DeadlineText')}` | Your 1-to-1 hasn't been submitted yet. Your saved draft is still there: <a href="LINK">Continue</a>. |
| E3 | TL | `@{if(equals(triggerBody()?['Q9FollowUp']?['Value'],'Arrange a dedicated 1-to-1 discussion'),'[1-to-1 REQUESTED] ','')}1-to-1 submitted: @{outputs('Mgr')?['Title']}` | Submitted @{if(greater(ticks(utcNow()), ticks(outputs('Mgr')?['DueDate'])),'late','on time')}. <a href="LINK">Open review</a> |
| E4 | Technician | `Feedback on your 1-to-1 (@{triggerBody()?['MonthKey']}) is ready` | Your Team Leader has completed your review. <a href="LINK">View feedback</a> |
| E5 | Technician | `Your 1-to-1 (@{triggerBody()?['MonthKey']}) has been closed` | This review was closed without a submission. <a href="LINK">View</a>. Please speak to your Team Leader if this is unexpected. |
| E7 | TL | `1-to-1 system: action needed` | List of problems and the run link |

---

## G. Deployment guide (step by step)

Work through the parts in order and tick each box. ⏱ shows typical time. You need:

- your own (TL) account
- **Test A** and **Test B** technician test accounts (IT-6), each in its own **InPrivate** or **Incognito** browser window
- a text file called **Config sheet** where you paste the values you collect

### Before you start: get the confirmations

- [ ] Send IT the questions **IT-1 to IT-8** and HR the questions **HR-1 to HR-5** from section J. You can build Stage 0 while you wait, but **don't put real technician data in** until IT-2, IT-5 and HR-2 are answered.

Create the **Config sheet** with these lines:

```
TL email (as Power Apps shows it):
Site URL:
Owners group ID:
Full Control role ID:
1-to-1 Edit role ID:
1-to-1 Read role ID:
App web link:
EAP contact text:
```

### Part 1 — Create and lock down the site ⏱ 30 min

1. [ ] Go to `https://<yourtenant>.sharepoint.com` and click **+ Create site**, then **Communication site**, then **Blank**.
2. [ ] **Site name:** `ESG Technician 1-to-1`. **Site address:** `ESG-1to1`. Language English. Click **Create site**.
   - If creating sites is disabled, ask IT for a communication site with you as the **only owner** (IT-1), then continue.
3. [ ] Copy the site URL into the Config sheet (for example `https://contoso.sharepoint.com/sites/ESG-1to1`).
4. [ ] Set the regional settings:
   1. Click the **gear** (top right), then **Site information**, then **View all site settings**, then **Regional settings**.
   2. Time zone: **(UTC) Dublin, Edinburgh, Lisbon, London**. Locale: **English (United Kingdom)**.
   3. Click **OK**.
5. [ ] Check site permissions:
   1. Click the **gear**, then **Site permissions**, then **Advanced permissions settings**.
   2. Click **ESG Technician 1-to-1 Owners** and confirm you're the only person. Go back.
   3. Open **…Members**, then **…Visitors**. In each, tick everyone listed, then **Actions → Remove Users from Group**. Both groups must end up empty.
   4. If **Everyone except external users** appears anywhere on the permissions page, tick it and click **Remove User Permissions**.
6. [ ] Lock down sharing:
   1. Click the **gear**, then **Site permissions**, then **Change how members can share**.
   2. Choose **Only site owners can share files, folders, and the site**.
   3. Set **Allow access requests** to **Off**.
   4. Click **Save**.
7. [ ] If your organisation uses sensitivity labels: click the **gear**, then **Site information**, then **Sensitivity**, and choose the HR/Confidential label (IT-8).

### Part 2 — Create the two permission levels ⏱ 15 min

1. [ ] Click the **gear**, then **Site permissions**, then **Advanced permissions settings**. On the ribbon, click **Permission Levels**.
2. [ ] Create `1-to-1 Edit`:
   1. Click **Contribute**, then at the bottom click **Copy Permission Level**.
   2. Name: `1-to-1 Edit`.
   3. **Untick:** Add Items, Delete Items, Delete Versions, Manage Personal Views, Add/Remove Personal Web Parts, Update Personal Web Parts.
   4. **Leave ticked:** Edit Items, View Items, Open Items, View Versions, View Pages, Browse User Information, **Use Remote Interfaces**, Use Client Integration Features, Open.
   5. Click **Create**.
3. [ ] Create `1-to-1 Read`:
   1. Click **Read**, then **Copy Permission Level**.
   2. Name: `1-to-1 Read`.
   3. **Untick:** View Versions and Create Alerts.
   4. Click **Create**.
   - If you can't create permission levels (IT-4), see the fallback in J.

### Part 3 — Create the four lists ⏱ about 2 h

**For each list:**

1. Go to **Site contents**, click **+ New**, then **List**, then **Blank list**.
2. Type the **name without spaces** (for example `MonthlyReviews`). **Untick** *Show in site navigation*. Click **Create**.

**For each column:**

1. Click **+ Add column** and choose the type.
2. Type the **Name exactly as in section C**.
3. Open **More options** and set what the table says:
   - **Choice:** type one choice per line. Turn **Can add values manually** off. For defaults shown as *(none)*, delete the default value.
   - **Multiple lines of text:** turn **Use enhanced rich text** off and **Append changes** off.
   - **Number:** decimal places 0. Set Min and Max where shown.
   - **Date and time:** turn **Include time** on only where the table says *Date and time*.
   - **Person:** turn **Allow selection of groups** off and **Allow multiple selections** off.
4. Click **Save**.

**Then, for each list, open the gear and List settings:**

| Step | Where | What to set |
|---|---|---|
| a | **List name, description and navigation** | Rename to the display name: `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`. Technicians stays as it is. |
| b | **Versioning settings** | Create a version each time you edit an item: **Yes**. Keep **100**. |
| c | **Advanced settings** | Attachments **Disabled**. Allow items from this list to appear in search results **No**. Offline client **No**. Then **OK**. |
| d | **Indexed columns** → **Create a new index** | One index for each column marked *Indexed* in C |
| e | Manager Reviews only: click the column **ReviewKey** | **Enforce unique values: Yes** |
| f | **Permissions for this list** → **Stop Inheriting Permissions** → OK | Tick the Members and Visitors groups, if listed, then **Remove User Permissions**. Only **Owners – Full Control** should remain. |
| g | Views | Create the views listed in C.2 and C.4: **+ Create view** (classic) or **Switch view options → Create new view**, then set the filters. |

Lists and checks:

- [ ] **Technicians** (C.1)
- [ ] **Appraisal Expectations** (C.2)
- [ ] **Monthly Reviews** (C.3)
- [ ] **Manager Reviews** (C.4)
- [ ] **Check:** Site contents shows four lists, and each list's permissions page shows only Owners.

### Part 4 — Record the four IDs ⏱ 10 min

Paste each address into your browser while signed in as the TL. The page shows XML. Use **Ctrl+F** to find the values.

1. [ ] `<Site URL>/_api/web/associatedownergroup`. Find `<d:Id>` and copy the number to **Owners group ID**.
2. [ ] `<Site URL>/_api/web/roledefinitions`. Use Ctrl+F to find each `<d:Name>` and copy the `<d:Id>` just above it:
   - **Full Control** (usually `1073741829`)
   - **1-to-1 Edit**
   - **1-to-1 Read**
3. [ ] In Power Apps, add a temporary label with Text `User().Email`, play the app, and copy exactly what it shows into **TL email**. Delete the label afterwards.

### Part 5 — Stage 0 proof test ⏱ 1–2 h — **don't skip this**

This proves that the riskiest assumption holds in your tenant before you build anything.

1. [ ] In **Technicians**, add **Test A** and **Test B** (Title = their name, Technician = their account, Active = Yes).
2. [ ] In **Monthly Reviews**, click **+ New** and create two items by hand: Title `PROOF-A`, Technician = Test A; and Title `PROOF-B`, Technician = Test B. Note their IDs. Show the **ID** column using **Add column → Show/hide columns**.
3. [ ] Create a test flow:
   1. Go to **make.powerautomate.com**, then **+ Create**, then **Instant cloud flow**. Name it `Proof`. Choose **Manually trigger a flow**.
   2. Add **Send an HTTP request to SharePoint** and set Method **POST** and Uri `_api/web/ensureuser`, with the headers and body from F.0. Use Test A's claims: `i:0#.f|membership|<testA email>`.
   3. Add the four **SETPERM** calls for list `Monthly Reviews`, item `<PROOF-A ID>`, role = your **1-to-1 Edit** ID.
   4. Click **Save**, then **Test**, then **Manually**, then **Run**. Every step must show a green tick.
   - [ ] If any step reports a **DLP** or **policy** error, stop and raise it with IT (IT-2).
4. [ ] Create a throwaway app:
   1. Go to **make.powerapps.com**, then **+ Create**, then **Start with data**. Choose **SharePoint**, your site, then **Monthly Reviews**.
   2. Save it as `Proof app`.
   3. Click **Share**, add Test A and Test B, and **don't** share the data when asked.
5. [ ] In **Test A's** window, open the Proof app link and click **Allow** if prompted. **Pass:** only PROOF-A is listed, Test A can edit and save it, and there's no red error banner.
6. [ ] In **Test B's** window, open the Proof app. **Pass:** nothing is listed. B has no access to anything yet.
7. [ ] In **Test A's** window, browse to `<Site URL>/Lists/MonthlyReviews/DispForm.aspx?ID=<PROOF-B ID>`. **Pass:** access denied, or "item does not exist".
8. [ ] In **Test A's** window, browse to `<Site URL>/_api/web/lists/getbytitle('Manager%20Reviews')/items`. **Pass:** access denied.
9. [ ] Clean up:
   - Delete the Proof app and the Proof flow.
   - Delete PROOF-A and PROOF-B.
   - Empty the site **Recycle bin**, including the **Second-stage recycle bin**.

**If step 5 or 6 fails, stop.** The architecture depends on it. Note what you saw and review before going further.

### Part 6 — Build Flow 1 ⏱ 2–3 h

**Tips for the Power Automate designer**

- Add an action with the **+** button.
- **Rename every action** to the name in the spec using **… → Rename**, *before* you reference it in later expressions.
- Type expressions in the **Expression** (fx) tab, then click **Add / OK**.
- **Settings** is in the **…** menu (classic designer) or the **Settings** tab (new designer). That's where you'll find concurrency, trigger conditions and secure inputs/outputs.
- *Run after* is in the same menu. For each `Catch` scope, tick only **has failed** and **has timed out**.

**Steps**

1. [ ] Go to **+ Create**, then **Scheduled cloud flow**. Name: `1-to-1 | Daily scheduler`. Start today, repeat every **1 Day**. Click **Create**.
2. [ ] Open the **Recurrence** trigger and use **Show advanced options** to set:
   - Time zone: **(UTC+00:00) Dublin, Edinburgh, Lisbon, London**
   - At these hours: **7**
   - At these minutes: **0**

   Then open **Settings**, turn **Concurrency control** on and set the degree to **1**.
3. [ ] Build the actions in F.1 exactly in the order given. Create the SETPERM group once. Later flows can reuse it: select the four actions, use **Copy to my clipboard**, then **Add an action → My clipboard**.
4. [ ] **Save.** The flow will run daily at 07:00. During testing that's harmless, because only test technicians exist.
5. [ ] **Check:**
   1. Click **Run** (top bar), then **Run flow**.
   2. In **Manager Reviews** you should see two new items with ReviewState Open, ReviewItemId filled in and LinkSentOn set.
   3. In **Monthly Reviews** you should see two items.
   4. Test A and Test B should each have an email.
   5. On each Monthly Review, click **… → Manage access**. It must show only you (Owners) and that one technician.
   6. **Run the flow again.** Nothing new should be created and no second email sent.

### Part 7 — Build the app ⏱ 6–8 h

**Tips for Power Apps Studio**

- **Insert → Layout** gives you vertical and horizontal containers.
- To rename a control, double-click it in the **Tree view**.
- To set a property, select the control, pick the property in the dropdown (top left), and paste the formula into the formula bar.
- **Display field** (the Value or Fields setting) is in the right-hand properties panel.
- Save often (**Ctrl+S**).

**Steps**

1. [ ] Go to **make.powerapps.com** and choose the environment approved in IT-3. Click **+ Create**, then **Blank app**, then **Blank canvas app**. Name: `ESG 1-to-1`. Format **Tablet**. Click **Create**.
2. [ ] Open **Settings → Display** and turn **Scale to fit** off and **Lock aspect ratio** off. Then go to **Settings → General** and set the **Data row limit** to **2000**.
3. [ ] Go to **Data → Add data → SharePoint**, choose your site, and tick **Monthly Reviews**, **Manager Reviews** and **Technicians**. Click **Connect**.
4. [ ] In Tree view, select **App** and choose the **Formulas** property. Paste E.1, then edit the two `CONFIG` lines from your Config sheet.
5. [ ] Set **App → StartScreen** (formula in E.1). This needs all three screens to exist, so add them first: **+ New screen → Blank**, then rename them to `scrTechReview`, `scrDashboard` and `scrManagerReview`.
6. [ ] Build **scrTechReview** from E.2:
   1. Insert a **Vertical container** `conScreen` with X `0`, Y `0`, Width `Parent.Width`, Height `Parent.Height`.
   2. Inside it, add `conHeader` (vertical, Height `150`) and `conPage` (vertical, **Flexible height** on, **Vertical overflow: Scroll**, Padding 16, Gap 10).
   3. Add the controls in the order of the layout diagram, then paste each property from the table.
   4. For every control inside `conPage`, set **Align in container: Stretch**.
   5. Turn **Auto height** on for every label.
   6. Paste the long formulas: `btnLoad.OnSelect`, `lblMissing.Text`, `btnSubmit.OnSelect`, `btnConfirmSubmit.OnSelect` and `btnSave.OnSelect`.
   7. Add `conConfirm` directly on the screen (not inside conScreen): X 0, Y 0, full size, Fill `RGBA(0,0,0,0.4)`, Visible `locConfirm`. Put a white container inside it holding lblConfirm, btnConfirmSubmit and btnCancel.
7. [ ] Build **scrManagerReview** from E.3, using the same pattern.
8. [ ] Build **scrDashboard** from E.4.
   - It's fine to leave this until Stage 4. Until then, temporarily set StartScreen to show scrManagerReview, using the link from an E3 email.
9. [ ] Click **Save**, then **Publish**, then **Publish this version**.
10. [ ] Go back to make.powerapps.com, then **Apps**, then **… on ESG 1-to-1**, then **Details**. Copy the **Web link** into the Config sheet.
11. [ ] Click **Share** and add Test A and Test B as **users**. **Don't** tick any data-sharing option. You can untick *Send an email invitation*.
12. [ ] Paste the web link into `varAppLink` in Flow 1 (with `&hidenavbar=true` at the end) and save.

### Part 8 — Build Flows 2 and 3 ⏱ 2 h

1. [ ] Go to **+ Create**, then **Automated cloud flow**. Name: `1-to-1 | Review submitted`. Trigger: **SharePoint – When an item is created or modified**. Choose your site and **Monthly Reviews**.
   1. In the trigger's **Settings**, add the **Trigger condition** from F.2 and set **Concurrency control** to 1.
   2. Build the actions in F.2.
   3. **Save.**
2. [ ] Do the same for `1-to-1 | Manager decision`, using **Manager Reviews** and the steps in F.3. It has two trigger-condition lines.
3. [ ] Make sure all three flows show **On**.

### Part 9 — Stage 1 test ⏱ 3 h

Run **H** tests F1–F4, F8–F12 and F18, plus **P1, P2, P3, P5 and P8**. Fix anything that fails before you continue.

### Part 10 — Stage 2: reminders and dates ⏱ 2 h

1. [ ] Make sure Flow 1 includes the reminder and problem-report steps (F.1 steps 3.4 and 3.5).
2. [ ] Run the date tests F13, F14, F19 and F20. For each one:
   1. Set `varTestDate` in Flow 1 to the date given in the test.
   2. Save and **Run** the flow.
   3. Check the results.
3. [ ] **Afterwards, clear `varTestDate`, save, and delete the test-month items** from both lists.

### Part 11 — Stage 3: expectations ⏱ 1–2 h

1. [ ] Enter real Shared expectations in **Appraisal Expectations**, plus one Individual expectation for Test A.
2. [ ] To run tests F5–F7, create a fresh test month: set `varTestDate` to the 1st of next month and run Flow 1.
3. [ ] Write the **annual rollover** procedure in the configuration reference:
   1. Before the new appraisal year starts, add the new year's expectations. **Edit in grid view** makes this quick: copy, paste and change AppraisalYear.
   2. On the last day of the old year, set the old ones to **Active = No**. **Never delete them.**
   3. The next month's reviews pick up the new set automatically, and older reviews keep their own snapshot.

### Part 12 — Stage 4: dashboard, home page, privacy tests, go-live ⏱ 6–7 h

1. [ ] Finish **scrDashboard**, set **StartScreen** as in E.1, then **Publish**.
2. [ ] Set up the home page:
   1. Open the site home page and click **Edit**. Delete the default web parts.
   2. Add a **Power Apps** web part, paste the **App ID** (from the app's Details page), and set the width to full.
   3. Add a **Quick links** web part with links to the *Appraisal Expectations* list and the Manager Reviews *Overdue* and *Open actions* views.
   4. Click **Republish**.
3. [ ] Run **all of section H**, including **every P test**. Any failed P test **blocks go-live**.
4. [ ] In each flow, open the trigger and every **Get items** action and turn on **Secure inputs** and **Secure outputs** in Settings. Save.
5. [ ] **Clean-down:**
   1. Delete all test items in Monthly Reviews and Manager Reviews, then empty both recycle bins.
   2. Remove Test A and Test B from Technicians.
   3. **Unshare** the app from the test accounts.
6. [ ] **Go-live:**
   1. Add the real technicians to Technicians and share the app with them (**User**).
   2. Either wait for 07:00 on the 1st, or click **Run** on Flow 1 now to start the current month. That's safe, because the flow is idempotent.
7. [ ] **First live month:**
   - On the **1st**: check Flow 1's run history and that every technician appears on the dashboard.
   - On the **20th**: check that the reminders went out.
   - On the **next 1st**: check that the new month was created and the previous month's unsubmitted reviews show as **Overdue**.

### Operating procedures (put these in the configuration reference)

| When | Task |
|---|---|
| Quarterly (2 min) | Open **Site permissions**. Confirm the Owners group contains only the TL, and Members and Visitors are empty. |
| As needed: correction | At the technician's request, open the item in SharePoint and edit it. Add a dated reason to **CorrectionLog** on the Manager Review. Version history records the change. |
| As needed: leaver or long absence | In Technicians, set **Active = No**. |
| As needed: new starter | Add them to Technicians and share the app with them. They get a review the next morning. |
| TL handover | Transfer site ownership. Re-create the three flows' connections under the new TL, or re-own the flows. Update `ManagerEmail` in the app and `varManagerEmail` in each flow, then republish. |
| Annually | Expectation rollover (Part 11). Retention deletion (D.5). |

---

## H. Testing

**How to record results.** For each test, record Pass or Fail, the date, the tester and a screenshot.

**How to run the P (privacy) tests**

- **Release blockers:** any failure of a 🔒 test.
- **Who runs what:** run each P test **first as the TL** (it should succeed, which proves the request is valid), **then as Test A** (it must fail).
- **API attempts:** each tester makes their own *Instant* flow named `Privacy test` with **Manually trigger a flow** and one **Send an HTTP request to SharePoint** action. Under Site Address choose **Enter custom value** and paste the site URL. Change the Method, Uri and Body for each test and run it with **Test**.
- **What counts as denied:** status 401, 403 or 404, or a response in which each field reports an error. **Always confirm in the list that nothing changed.**
- **If testers can't create flows:** run the read (GET) tests by pasting the URL into the browser. Run the write tests through the SharePoint UI instead.

**Placeholders used in the P tests**

| Placeholder | Meaning |
|---|---|
| `{A}` | Test A's Monthly Review ID |
| `{B}` | Test B's Monthly Review ID |
| `{MA}` | Test A's Manager Review ID |

**POST headers for the P tests**

| Header | Value |
|---|---|
| `Accept` | `application/json;odata=nometadata` |
| `Content-Type` | `application/json;odata=nometadata` |

### Functional tests

| # | Test | Expected |
|---|---|---|
| F1 | A opens the E1 link | The app opens on A's current review, showing the deadline |
| F2 | A fills Q1–Q3, clicks **Save draft**, closes the browser and reopens the link | All answers are present, and the status is Draft |
| F3 | A answers **No** to Q4, Q5 and Q6, then submits | Submits. Detail fields are empty in the list. |
| F4 | Check Q3 in the list after saving | The number 1–5 is stored. On the dashboard, picking A with all months shows each month's rating in order. |
| F5 | New month created with expectations loaded | A has the shared and individual expectations. B has the shared ones only. |
| F6 | Check the snapshot on A's Manager Review | It matches the master list at creation time |
| F7 | After A submits, the TL edits a shared expectation's title | A's past review (both app screens) shows the **old** text. Next month shows the new text. |
| F8 | A submits, waits 5 minutes, then reopens | Read-only. "Submitted" is shown. The TL gets E3. |
| F9 | The TL enters feedback on Q4 where the answer is No, and saves | Saves. Shown to A after release. |
| F10 | The TL saves feedback but doesn't complete. A reopens the review. | **No** feedback is visible |
| F11 | The TL clicks Complete | Within about 5 minutes A gets E4, the feedback is visible, and A can't edit anything |
| F12 | The TL clicks Complete on a review that is still Open (by forcing it in SharePoint) | Flow 3 rejects it, the state returns to Open, and the TL gets an email |
| F13 | Run Flow 1 three times on the same day | Exactly one review per technician, and one E1 each |
| F14 | A submitted, B in draft. `varTestDate` = this month's 20th. Run Flow 1. | Only B receives E2 |
| F15 | `varTestDate` = next month's 1st. Run Flow 1. | B's old review shows **Overdue** on the dashboard and in the *Overdue* view. B can still open and submit it, and it's marked "(late)". |
| F16 | After the deadline, the TL clicks **Close – not submitted** on another open review | It becomes read-only to the technician, who gets E5 |
| F17 | A chooses "Arrange a dedicated 1-to-1" | E3 subject is prefixed. The dashboard row is amber and the KPI counts it. A TL override replaces it. |
| F18 | Repeat F1, F2, F8 and F11 using **only** the Test A account (no TL shortcuts) | All pass |
| F19 | `varTestDate` = `2028-02-01T07:00:00` (test month only) | Manager Review DueDate = `2028-02-29T23:59:59Z` |
| F20 | `varTestDate` = `2027-03-01T07:00:00`, then `2026-10-01T07:00:00` | DueDate = `2027-03-31T22:59:59Z` (BST) and `2026-10-31T23:59:59Z` (GMT) |
| F21 | Temporarily set `varEditId` to `999`. Create a fresh test month and run. | Items are created, but **no E1 is sent**. The TL gets E7, and the technician can't see the item. Restore the value and run again: E1 is sent. |
| F22 | A completes a draft on a phone | Usable without sideways scrolling |
| F23 | Correction: the TL edits a locked answer in SharePoint and adds a CorrectionLog note | The version history shows the change and who made it |

### Privacy and bypass tests

| # | Attempt by Test A | Request | Expected |
|---|---|---|---|
| P1 🔒 | Open B's review in the app | App link with `&reviewId={B}` | "Not found or isn't yours" |
| P2 🔒 | List all reviews | GET `_api/web/lists/getbytitle('Monthly%20Reviews')/items?$select=ID,Title`, and browse to `/Lists/MonthlyReviews/AllItems.aspx` | Only A's own items |
| P3 🔒 | Edit B's review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/items({B})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"Q1WentWell","FieldValue":"tamper"}],"bNewDocumentUpdate":false}` | Denied. B's item is unchanged. |
| P4 🔒 | Create a fake review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/AddValidateUpdateItemUsingPath`, body `{"listItemCreateInfo":{"FolderPath":{"DecodedUrl":"/sites/ESG-1to1/Lists/MonthlyReviews"},"UnderlyingObjectType":0},"formValues":[{"FieldName":"Title","FieldValue":"fake"}],"bNewDocumentUpdate":false}` | Denied. No new item. |
| P5 🔒 | Read feedback before release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items?$select=ID,FB_Q1` | Denied or empty |
| P6 🔒 | Read earlier drafts after release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items({MA})/versions` | Denied. As the TL, the same request lists versions. |
| P7 🔒 | Read the roster and other technicians' expectations | GET `_api/web/lists/getbytitle('Technicians')/items` and `…getbytitle('Appraisal%20Expectations')/items` | Denied |
| P8 🔒 | Edit own submitted review | As P3, but on `{A}` after submission | Denied, and unchanged |
| P9 🔒 | Forge *Modified By* to dodge the lock | On A's **draft**: POST `…items({A})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"ReviewStatus","FieldValue":"Submitted"},{"FieldName":"Editor","FieldValue":"[{'Key':'i:0#.f|membership|<TL email>'}]"}],"bNewDocumentUpdate":true}` | Note whether *Modified By* shows the TL; this goes in the security record. Within about 10 minutes the item **is locked anyway** (P8 passes). |
| P10 🔒 | Tamper with own draft | On a fresh draft: one `validateUpdateListItem` with DueDate `2099-12-31T00:00:00Z`, Technician `[{'Key':'i:0#.f|membership|<TestB email>'}]`, ReviewStatus `Completed`, and ExpectationsJson with a changed title | Within about 10 minutes: A's item is read-only, and its status shows *Submitted*. The Manager Review is *Submitted*, with SubmittedLate correct against the **real** due date. **B can't see A's item** (B runs P2). The TL screen shows the **original** expectation titles. |
| P11 🔒 | Grant access or share own item | POST `…items({A})/roleassignments/addroleassignment(principalid=<any number>,roledefid=1073741826)`. In the SharePoint UI, use **Share** on A's item. | Both denied |
| P12 🔒 | Delete own draft | POST `…items({A})/recycle()`. In the SharePoint UI, use **Delete**. | Denied. The item is still there. |
| P13 🔒 | Reach the TL's data through the app | A opens the app normally | Lands on own review. No dashboard data. |
| P14 🔒 | Site and search | A opens the site URL, then searches Microsoft 365 for a phrase from B's answers | Access denied, and no results |

---

## I. Delivery estimate

These are hands-on hours for a first-time builder following section G. Calendar time is driven mainly by IT and HR answers.

| Stage | Manual configuration (TL) | Testing | Depends on IT / HR |
|---|---|---|---|
| Confirmations | 0.5 h (send the questions) | — | IT-1 to IT-8, HR-1 to HR-5 |
| 0 — Proof test (Parts 1–5) | 3–4 h (site, levels, lists, IDs) | 1–2 h | IT-1, IT-2, IT-4, IT-6 |
| 1 — MVP (Parts 6–9) | 10–13 h (Flow 1: 2–3 h, app: 6–8 h, Flows 2 and 3: 2 h) | 3 h | IT-3, IT-5 |
| 2 — Automation (Part 10) | 0.5 h | 1.5 h | — |
| 3 — Expectations (Part 11) | 1 h | 1 h | — |
| 4 — Dashboard and verification (Part 12) | 2–3 h | 4–5 h, plus the first live month | HR-2 before any real data |
| **Total** | **≈ 17–22 h** | **≈ 11–13 h** | |

That's **about 28–36 hours hands-on** in all.

**Claude's remaining preparation:** one session to produce the printable checklists and build sheets listed in K. Generating instructions is not deployment. Nothing is live until Part 12 is done and every test in H passes.

---

## J. Blockers, confirmations and residual risks

### J.1 Confirm with IT (blocking unless marked otherwise)

| # | Question | If the answer is "no" |
|---|---|---|
| IT-1 | Can the TL create a **communication site** and be its **sole owner**? Does governance require two owners? | Ask IT to create the site. If two owners are mandatory, choose the second with HR (this affects D4). |
| IT-2 | Does the DLP policy for the chosen environment allow **SharePoint, including the action "Send an HTTP request to SharePoint"**, **Office 365 Outlook** and **Office 365 Users**, all in the same data group? | **Fallback:** replace SETPERM with the SharePoint actions **Stop sharing an item or a file** and **Grant access to an item or a folder**. This only offers *Can view* and *Can edit*, so the no-delete and no-version-history protections are lost. P6 and P12 become accepted risks that HR must agree to. Ask for the HTTP action first. |
| IT-3 | Which **Power Platform environment** may hold confidential line-management data? Is it the Default environment? | Build in the environment IT names |
| IT-4 | May site owners create **custom permission levels**? | Ask IT to create the two levels. Using the built-in Read and Contribute would reintroduce defect S3 (version history) and allow deletions. |
| IT-5 | Do all technicians' licences include **Power Apps use rights**? E3, E5 and F3 do. F1 and some kiosk plans may not. | Licence change needed for affected technicians |
| IT-6 | Can you have **two test accounts** with mailboxes and Power Apps rights, allowed to create a personal flow? | Privacy can't be proven without them. Don't go live. |
| IT-7 | Does **Conditional Access** allow `apps.powerapps.com` on work laptops and phones? (Not blocking.) | Technicians complete it on a laptop |
| IT-8 | Is there a **sensitivity label** for HR or confidential sites, and is external sharing off for new sites? (Not blocking.) | Apply what's available |
| IT-9 | (Information) Acknowledge that tenant administrators can technically access the data | Wording for the privacy notice |

### J.2 Confirm with HR / Data Protection

| # | Question |
|---|---|
| HR-1 | **Retention period** (D3) and whether a **Purview retention label** exists |
| HR-2 | Is a **DPIA screening** needed? Approve the **technician privacy notice** (artefact K8) **before any real data is entered**. |
| HR-3 | Approve the **Q4 wellbeing wording** and supply the **EAP / Occupational Health contact** details |
| HR-4 | Approve the wording that a written check-in doesn't replace a formal appraisal or meeting |
| HR-5 | **TL absence:** who may be given access if the TL is unavailable long-term, and through which approved route? This takes the place of a standing backup owner (D4). |

### J.3 Residual risks (accepted)

| # | Risk | Mitigation |
|---|---|---|
| R1 | About 5 minutes between Submit and the lock (SharePoint trigger polling) | Affects only the technician's own record. The server stamps the submission time, and versions record any change. |
| R2 | A technician can submit through the API without the mandatory answers | Affects only their own record, and the TL sees the gaps |
| R3 | Tenant administrators can access the data | Tenant admin policy, stated in the privacy notice |
| R4 | The flows depend on the TL's account (D1) | TL handover procedure (Part 12) |
| R5 | A close and a submission happening at the same moment can end up closed | Closing is only possible after the deadline. The answers are preserved, and the TL can correct it. |
| R6 | Anyone added to the Owners group sees everything | Quarterly 2-minute check |
| R7 | Renaming lists or columns breaks the app and flows | A "do not rename" list goes in the configuration reference |

---

## K. Artefacts to produce next

All of these are text, contain **no tenant names, credentials or personal data**, and are ready to transfer through an approved company process.

| # | File | Purpose |
|---|---|---|
| K1 | `01-sharepoint/lists.md` + `lists.csv` | Printable column-by-column checklist for Part 3 |
| K2 | `01-sharepoint/site-security-checklist.md` | Parts 1, 2 and 4 as tick-lists, with what to screenshot |
| K3 | `02-powerapps/App.Formulas.fx` | Paste-ready |
| K4 | `02-powerapps/scrTechReview.md`, `scrManagerReview.md`, `scrDashboard.md` | Control-by-control build sheets: name, type, parent and every property |
| K5 | `03-flows/flow1.md`, `flow2.md`, `flow3.md`, `setperm-block.md` | Action-by-action build sheets with every expression ready to copy. **Not importable packages.** |
| K6 | `03-flows/email-templates.html` | E1–E7 bodies |
| K7 | `04-testing/test-record.csv` | Section H with result columns |
| K8 | `05-deploy/privacy-notice-draft.md` | One page for HR-2: what's collected, who sees it, protection, retention and admin access |
| K9 | `05-deploy/configuration-reference.md` | Config sheet, do-not-rename list and the operating procedures |

---

## Summary and next step

1. **Build approach:**
   - A private SharePoint communication site with **four lists**.
   - **Manager Reviews is the authoritative, tamper-proof record.** Monthly Reviews holds only the technician's answers.
   - Two custom permission levels, applied per item by **three** standard-connector flows.
   - One canvas app with **three** screens, opened from personal links and embedded on the site home page.
2. **Sequence:**
   1. Confirmations
   2. Parts 1–5: site, levels, lists, IDs, **proof test**
   3. Part 6: Flow 1
   4. Part 7: the app
   5. Part 8: Flows 2 and 3
   6. Part 9: Stage 1 tests
   7. Part 10: dates and reminders
   8. Part 11: expectations
   9. Part 12: dashboard, privacy tests, clean-down and go-live
3. **Effort:** about 28–36 h hands-on (see I), plus the IT and HR lead time.
4. **Blockers:** IT-1 to IT-6 and HR-2, with HR-1 needed before retention is configured.
5. **Next Claude Code prompt:**

   ```
   Produce artefacts K1–K9 from one-to-one/IMPLEMENTATION_PLAN.md (v2) into
   one-to-one/, using <PLACEHOLDER> values for all tenant-specific settings.
   Keep formulas and expressions identical to the plan unless you find an
   error; list any deviation in one-to-one/CHANGES_FROM_PLAN.md.
   Commit and push to the current branch.
   ```
