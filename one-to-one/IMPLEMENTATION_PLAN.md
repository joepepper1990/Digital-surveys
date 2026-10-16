# ESG Monthly Technician 1-to-1 — Implementation Plan (v4)

**Status:** v5.0, dated 16-Oct-2026 (frontend **5.0.0**, solution **1.4.0.0** – see *v4.2 additions*, *v4.3*–*v4.5* and **v5.0.0 / solution 1.4** below; upgrade order in [`MIGRATION_1_4.md`](MIGRATION_1_4.md)). **Current position and next actions:** [`NEXT_STEPS.md`](NEXT_STEPS.md).

- **Stages 0A and 0B have passed in the live tenant.** Welcome runs the external script, authenticated REST works, and the item-level security model holds.
- The visual design was agreed through prototype v7 ([`prototype/prototype.html`](prototype/prototype.html)).
- **The production build files are produced:**
  - the frontend [`02-frontend/`](02-frontend/README.md), with a local mock and 305 automated checks (plus 31 for the one-time reset tool);
  - the list checklist [`01-sharepoint/lists.md`](01-sharepoint/lists.md);
  - **the importable Power Platform solution** [`04-solution/`](04-solution/IMPORT_GUIDE.md): seven flows (1–6 and 8) plus a setup flow that creates the eight lists, permission levels, group and list permissions exactly (v4.1; Flow 8 and the Amendments list from 1.4; Flow 7 and the Challenges list existed in v4.5 / 1.3 only and are retired);
  - the flow build sheets and email templates [`03-flows/`](03-flows/FLOW_BUILD_SHEETS.md), for reference or building by hand;
  - the operating manual [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md).
- **What remains is the tenant build and go-live** ([`GO_LIVE_RUNBOOK.md`](GO_LIVE_RUNBOOK.md)).
- Earlier history: v1 → v2 in [`PLAN_REVIEW.md`](PLAN_REVIEW.md); v2 → v3 under *Changes in v3*.
**Scope:** 5–10 technicians, one Team Leader (TL), one ESG team.

**Confirmed decisions**

| # | Decision |
|---|---|
| D1 | Flows run under the **TL's own account** |
| D2 | **Late submissions are accepted** and flagged late, and the TL may close a review that was never submitted |
| D3 | Retention period: **24 months** (confirmed). Reviews older than 24 months are deleted; mechanism per D.5. |
| D4 | **No backup owner**, subject to corporate governance |
| D5 | **No private notes** for technicians. The TL is Site Collection Admin and could read them, so the feature would be misleading. (v4) |
| D6 | **No "ask for a chat" button.** A technician uses Q9 or simply talks to the TL. (v4) |
| D7 | The **TL sets each technician's appraisal date** and the appraisal band thresholds in ⚙ Settings, visible only to line managers. Dates are shown as **DD-MMM-YYYY**. (v4; from 1.4 also the **next wellbeing date** and the **appraisal period start**, and actual completions are recorded with *Mark appraisal completed* – nothing is ever set automatically) |

The system has **eight lists** (five data lists, including Wellbeing Assessments from v4.2, a small settings list, the 1-to-1 Feedback list from v4.3 and the Owners-only 1-to-1 Amendments list from 1.4; the 1-to-1 Challenges list of v4.5 is retired and kept on upgraded sites only), seven flows (1–6 and 8) plus a setup flow, three custom permission levels (`1-to-1 Submit` from v4.3), and one SharePoint page carrying a custom Welcome layout (the frontend). The flows use standard connectors only.

## Changes in v4

| Area | v3.2 | v4 |
|---|---|---|
| Design | Single-column questionnaire, dashboard and review screens | Desktop layout with a **top menu bar** (a narrow sidebar until v4.1.0), uniform cards, charts and an appraisal outlook (agreed via prototype v7) |
| Technician | Questionnaire only | Adds an **energy check-in** and **win of the month** (`Mood`, `WinOfMonth` on Monthly Reviews), **My appraisal** (expected outcome, trend), and an **Appraisal report** |
| TL ratings | Feedback text per expectation | Feedback **plus a 1–5 TL rating** per expectation, in `ExpectationFeedbackJson` |
| Actions | One free-text box plus one due date | **Any number of action rows**, each with owner, **close-out criteria and a deadline**, in `ActionsJson`. `NextActionDue` feeds the *Open actions* view. There is a TL **Actions** page to close or reopen them. `AgreedActions` and `ActionsDueBy` are dropped. |
| Expectations | Edited in the SharePoint list | Organised in-app **Expectations** page (add, edit, retire), as well as the list |
| Appraisal outcome | — | TL enters each **appraisal date**: `Technicians.AppraisalDate`, plus a display copy on the current Monthly Review. Editable **bands** live in a new **`1-to-1 Settings`** list (technicians: Read). The expected outcome is calculated in the browser (E.7). |
| Reports | — | 8-section appraisal report for the TL and the technician; print / save as PDF (E.8) |
| Role detection | `CONFIG.managerEmail` | SharePoint **effectiveBasePermissions** (ManagePermissions = TL). There is **nothing to configure** in the JS. |
| Removed | — | Private notes, ask-for-a-chat, workload trend, the occupational-health text (`eapText`), example text in boxes, and the "how it's worked out" panel for technicians |
| Flows | — | Flow 1 copies `AppraisalDate` and initialises the two JSON columns. Email dates use `dd-MMM-yyyy`. E3's request tag uses `startsWith`. Flows 2 and 3 are unchanged. |
| Security model | — | **Unchanged.** No new trust boundary: new technician fields are on the technician's own item; new TL data is on Manager Reviews (released by Flow 3); the Settings list holds no personal data. |
| Delivery (v4.1) | Lists and flows built by hand from G Parts 3–8 | **Import one solution** ([`04-solution/ESGOneToOne_1_4_0_0_unmanaged.zip`](04-solution/IMPORT_GUIDE.md)), then run **ESG 1-to-1 \| 0 Setup**, which builds everything in C, D.2 and D.3. The flows look up group, role and list IDs at run time, so G Part 4 is no longer needed. The site URL and TL email are environment variables. For environments without Dataverse there is an offline legacy-package builder. Verified locally: a static validator, 29 mutation tests and 215 end-to-end simulations against a fake SharePoint (solution 1.4.0.0). |


## Changes in v3

| Area | v2 | v3 |
|---|---|---|
| Frontend | Power Apps canvas app (3 screens) | **Custom HTML/CSS/JS layout in the Welcome by Accelerator 365 web part**, on one page `OneToOne.aspx`, which is also the site home page (E) |
| Backend | 4 lists, 3 flows, item-level permissions | **Unchanged**, apart from the email links, which now point to the page (F.4) |
| How technicians reach it | Shared app at `apps.powerapps.com` | The SharePoint page, through a new group `1-to-1 Technicians` with **Read on that page and the layout library only** (D.6). Their data access is still item-level only. |
| Licences | Power Apps rights for every technician | **No Power Apps needed.** SharePoint for everyone, plus Power Automate standard rights for the TL. Welcome must be licensed (IT-10). |
| New risks | — | The code runs with the viewer's permissions, so a script-injection bug could act as the TL (E.4, P15). The code must be protected from editing (P16). There's a dependency on a third-party web part (IT-10 to IT-13, P17). The TL now owns about 900 lines of custom code (R9). |
| Feasibility | Proven Microsoft pattern | **Not confirmed by the vendor's documentation.** Stage 0 now includes a **probe layout** that must run a script and read and write a list. If it fails, use the fallbacks in E.0. |

**Assessment.** v3 keeps the whole security model, because SharePoint permissions are still the boundary. It also removes Power Apps licensing and the Studio build work. In return, it adds custom code to maintain, an XSS risk that the code rules and tests have to control, and a dependency on behaviour the vendor doesn't document. **Proceed only if the Stage 0 probe passes.** The v2 canvas app (git `16dd9c5`) is the fallback, and it needs no backend change.

---

## Contents

- [A. Architecture](#a-architecture)
- [B. Scope and stages](#b-scope-and-stages)
- [C. SharePoint lists](#c-sharepoint-lists)
- [D. Security model](#d-security-model)
- [E. Frontend specification (Welcome custom layout)](#e-frontend-specification-welcome-custom-layout)
- [F. Power Automate specification](#f-power-automate-specification)
- [G. Deployment guide (step by step)](#g-deployment-guide-step-by-step)
- [H. Testing](#h-testing)
- [I. Delivery estimate](#i-delivery-estimate)
- [J. Blockers, confirmations and residual risks](#j-blockers-confirmations-and-residual-risks)
- [K. Artefacts](#k-artefacts)
- [Summary and next step](#summary-and-next-step)

---

## A. Architecture

### A.1 Components

```
PRIVATE SHAREPOINT COMMUNICATION SITE  (Owners group = Team Leader only; no Members/Visitors)
 ├─ Technicians             manager only        roster + stable identity (Entra object ID)
 ├─ Appraisal Expectations  manager only        master list, shared + individual
 ├─ Monthly Reviews         per item            technician's answers. Tech: EDIT while open, READ after
 ├─ Manager Reviews         per item            AUTHORITATIVE record + TL feedback, ratings + actions.
 │                                              Manager only until released, then tech READ
 ├─ 1-to-1 Settings         Owners edit         appraisal band thresholds (no personal data). Technicians group: READ
 ├─ Welcome Web Part - Custom Layouts   one-to-one.html + one-to-one.js (the frontend code; Owners edit, technicians read)
 └─ SitePages/OneToOne.aspx (home page) Welcome web part → custom layout. Technicians group: READ on this page only

FRONTEND (JavaScript in the page; SharePoint REST as the signed-in user)
 ├─ Technician  This month (form) · My appraisal (outlook, trend) · Appraisal report
 └─ TL          Team overview · Monthly reviews · manager review · Expectations · Actions ·
                technician profiles · ⚙ Settings (appraisal dates, bands) · reports

POWER AUTOMATE (TL connection; standard connectors)
 ├─ Flow 1  Daily 07:00 UK   create → protect → email; reminders 20th/27th; problem report
 ├─ Flow 2  Monthly Reviews changed to non-draft  → lock (tech READ), stamp authoritative record, notify TL
 └─ Flow 3  Manager Reviews set Completed/Closed  → lock + release feedback (tech READ), notify tech
```

Added later (see the version sections before H): the **Wellbeing Assessments** list and Flows 4–5 (v4.2), the **1-to-1 Feedback** list and Flow 6 (v4.3), and in 1.4 the Owners-only **1-to-1 Amendments** list with Flow 8 *Amendment notice*. The v4.5 challenge feature (Flow 7, *1-to-1 Challenges*) was removed in 1.4.

### A.2 Why this shape (short version)

- **A custom page frontend rather than a list form.** It gives personal links, partial (draft) saves, a repeating expectations section and separate TL views. A list form does none of these cleanly. (v1 and v2 used a canvas app for the same reasons. v3 uses a Welcome custom layout, as requested.)
- **Two review lists because SharePoint has no column-level security.** A technician who can edit their answers can edit every column on that item. So:
  - **Monthly Reviews** holds only what the technician may write.
  - **Manager Reviews** holds everything they must not see early or must not be able to change. That is identity, due date, workflow state, timestamps, the expectation snapshot, and the TL's feedback and actions.
- **Flows never trust a technician-editable field** to decide who gets access, what the state is, or whether something is late.
- **SharePoint item permissions are the only security boundary.** The frontend runs every request as the signed-in user, and anything it filters is cosmetic.
- **Flows use automated SharePoint triggers only.** No flow accepts input supplied by a technician.

### A.3 Assumptions

| # | Assumption |
|---|---|
| AS1 | Q2, the Q3 comment and Q7 are optional. Everything else is required at Submit, and details are required only when Yes is selected. |
| AS2 | If the answer is **No**, any hidden detail text is **cleared when saving**. Hidden fields are never validated or stored. |
| AS3 | Emails contain **links only**, never answers or feedback. |
| AS4 | Expectations apply when **Active = Yes**, and are snapshotted when the month's review is created. Changes made mid-month apply from next month. |
| AS5 | **Correction process (1.4):** the TL amends a submitted or released 1-to-1 **in the app** (*Amend…* / *Amend answers…*) with a required reason. The page writes the reason and the before/after values to the Owners-only *1-to-1 Amendments* list before it changes the review, and Flow 8 tells the technician (E16, no content). The technician is never reopened for editing and never re-submits. (Until 1.3 the TL edited SharePoint directly and wrote the reason in `CorrectionLog`; that column is no longer used.) |
| AS6 | **Agreed actions** are rows in `ActionsJson` on the TL's record. Each has action, owner, close-out criteria, deadline and Open/Closed status. `ActionsStatus` and `NextActionDue` summarise them for list views. (v4) |
| AS7 | The **expected appraisal outcome** is a guide calculated from monthly ratings. It is never a decision, and wellbeing answers are never part of it or of the report. (v4) |

---

## B. Scope and stages

| Stage | Build | Exit criterion |
|---|---|---|
| **0A — Feasibility (about 45 min)** | Site, the test list `ZZProbe0A`, the `OneToOne` page with Welcome, the technicians group, and the 0A probe ([README](02-frontend/probe/README.md)) | The script runs. As TL, authenticated REST read, digest and write all pass. As Test A, the page and script load and the test list shows nothing. **If this fails, stop and use a fallback from E.0.** |
| **0B — Security (only after 0A passes)** | Permission levels, two throwaway `ZZProbe` lists with item-level permissions, and a 0B probe | Every **mandatory** test passes (H): own records only, locked/protected/manager-only items not writable, no permission changes, sharing, creation or deletion, no version history, no access by guessing IDs, and attack strings displayed safely for both the TL and the technician |
| **1 — Functional MVP** | Flow 1 (creation and links), the full frontend (all 9 questions including Q8, plus the TL views), Flows 2 and 3 | Test A drafts, submits and is locked. The TL reviews and completes, and A sees the feedback. Test B sees nothing of A's at any point. |
| **2 — Monthly automation** | Flow 1 reminders and problem report. Schedule confirmed. | Date tests F13, F14, F19 and F20 pass |
| **3 — Appraisal tracking** | Real expectations loaded. Rollover procedure written down. | F5–F7 pass |
| **4 — Verification** | Dashboard view checked, **all privacy tests P1–P29**, clean-down, go-live | Every test in H passes |

Q8 is part of the frontend file from Stage 1, because separating it costs more than it saves. Stage 3 is about loading and testing real expectation data.

**Not in v4:** in-app reopen, auto-save, Teams notifications, a service account, automated retention, private notes, and an in-app chat request.

---

## C. SharePoint lists

### C.0 Rules for every list

- **The column-by-column build checklist is [`01-sharepoint/lists.md`](01-sharepoint/lists.md)** (also as [`lists.csv`](01-sharepoint/lists.csv)). This section is the design record. 🆕 marks v4 additions.
- **Type each column name exactly as shown, with no spaces.** The name you type becomes the permanent internal name that the frontend and flows use.
- **Required:** leave every column *not required* in SharePoint, except `Title`. The frontend checks required answers at Submit, and SharePoint-required columns would block saving drafts.
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
| AppraisalDate 🆕 | Date only | — | **Next appraisal due.** Set by the TL in ⚙ Settings → Team. The end point of the forecast (E.7) and the source of E17 reminders; moving it never changes which period a review belongs to. |
| NextWellbeingDate (1.4) | Date only | — | Next wellbeing assessment due. Set in Settings → Team, or confirmed when completing an assessment. Drives the wellbeing dashboards and E12. |
| AppraisalCycleStart (1.4) | Date only | — | Start of the current appraisal period (last actual completion, or the baseline the TL sets) |
| AppraisalHistoryJson (1.4) | Multiple lines | — | Completed periods (`start`, `completed`, `nextDue`, `recordedOn`), written by *Mark appraisal completed*. The source of truth for the TL's period calculations. |
| AppraisalBoundaries (1.4) | Multiple lines | — | The boundaries as a date list; Flow 1 copies it to each new Monthly Review |

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

**Rule (1.4):** each technician gets every active Shared expectation, then their own active Individual expectations, each group in SortOrder (Flow 1 orders by AppliesTo descending, then SortOrder). There is **no limit** on how many; the page warns above 30 on one review because of the note column's size. `AppraisalYear` is the **first** appraisal year an expectation applies to: it carries on into later years until it is retired, one entered for a later year stays hidden until that year starts, and a mistyped year is ignored safely. (Until 1.3: at most 10, and an expectation disappeared when its year ended in April.)

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
| Q9FollowUp | Choice: `Everything has been covered — no further discussion required at present.` · `Quick, informal catch-up in the field.` · `Arrange a dedicated 1-to-1 discussion.` | *(none)* | |
| Mood 🆕 | Number, 0 dp, min 1, max 5 | — | Energy check-in |
| WinOfMonth 🆕 | Multiple lines | — | Win of the month |
| AppraisalDate 🆕 | Date only | — | **Display copy** of Technicians.AppraisalDate, so the technician can see their own outlook. Written by Flow 1 and by ⚙ Settings. Never used for a decision (D.7). |
| AppraisalBoundaries (1.4) | Multiple lines | — | **Display copy** of the period boundaries, so the technician's own view groups their reviews by period. Written by Flow 1 and by *Mark appraisal completed*. The TL's views never read it. |

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
| ExpectationFeedbackJson | Multiple lines | — | TL | `[{"id":12,"feedback":"…","rating":4}]`. v4 adds the TL's 1–5 `rating`. |
| FollowUpDecision | Choice (same 3 values as Q9) | *(none)* | TL | **Override** of the technician's preference |
| MeetingDate | Date only | — | TL | |
| ActionsJson 🆕 | Multiple lines | — | TL | `[{"id":"a1","text":"…","owner":"…","criteria":"…","due":"2026-12-15","status":"Open","closedOn":""}]`. Replaces `AgreedActions`. |
| ActionsStatus | Choice: `None`, `Open`, `Done` | None | TL (app) | **Indexed.** Done = every action closed. |
| NextActionDue 🆕 | Date only | — | TL (app) | Earliest open deadline. Replaces `ActionsDueBy`. |
| CompletedOn | Date and time | — | Flow 3 | |
| CompletedBy | Single line of text | — | Flow 3 | Email of the person who completed it |
| ReleasedOn | Date and time | — | Flow 3 | |
| CorrectionLog | Multiple lines | — | TL | Until 1.3: reason for a correction after submission. **Not used from 1.4** (amendments are recorded in *1-to-1 Amendments*, C.4b); kept so no data is lost. |

(Solution 1.3 also added `Challenge…` columns here; they are no longer read or written from 1.4 and are kept unchanged.)

**Views**

| View | Filter / layout |
|---|---|
| *Overdue* | ReviewState = Open **and** DueDate < `[Today]` |
| *Open actions* | ActionsStatus = Open, sorted by NextActionDue |
| *All* | default view |

### C.4a `OneToOneSettings` → display name **1-to-1 Settings** 🆕 (Owners edit, technicians read)

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | Setting name. v4 uses one item: `Bands`. |
| Value | Multiple lines | JSON. Default: `[{"name":"Not met","max":1.5},{"name":"Partially met","max":2.25},{"name":"Met","max":4},{"name":"Exceeded","max":null}]` |

It holds no personal data. The `1-to-1 Technicians` group gets **Read** so each technician's outlook uses the same bands as the TL's. Only the TL can change it.

### C.4b `OneToOneAmendments` → display name **1-to-1 Amendments** (1.4, Owners only)

The restricted audit of TL amendments: one item per amendment, written by the page **before** it changes the review. Columns: `ReviewItemId` (indexed), `ManagerReviewId`, `MonthKey`, `Technician`, `Reason`, `ChangedFields`, `ChangesJson` (before and after of each changed column only), `NotifyStatus` (Draft / Pending / Sending / Sent / Failed / Retry / Cancelled, indexed), `NotifiedOn`, `NotifyError`. Who and when are SharePoint's own **Created By** / **Created**. Owners – Full Control only, versioning on. Full specification: [`01-sharepoint/lists.md`](01-sharepoint/lists.md) §8.

### C.5 Relationships

```
Technicians.TechnicianAadId ─1:N─▶ Manager Reviews.TechnicianAadId   (and ReviewKey)
Manager Reviews.ReviewItemId ─1:1─▶ Monthly Reviews.ID               (immutable SharePoint ID)
Appraisal Expectations.ID ──copied──▶ Manager Reviews.ExpectationSnapshotJson[].id (trusted)
                          ──copied──▶ Monthly Reviews.ExpectationsJson[].id        (technician copy + ratings)
                                      Manager Reviews.ExpectationFeedbackJson[].id (TL feedback)
```

The 1-to-1 Settings list is standalone. There are no lookup columns, so nothing breaks when a technician lacks access to a related list. About 240 unique permission scopes a year at 10 technicians, well inside SharePoint's limits.

---

## D. Security model

### D.1 Site

| Setting | Value |
|---|---|
| Site type | **Communication site.** No Microsoft 365 group, so there's no group membership to leak. |
| Owners group | **TL only** (D4). A quarterly 2-minute check confirms nobody else has been added. |
| Site Collection Administrator | **The TL must be a Site Collection Administrator.** An SCA retains access to every item regardless of item-level permissions, so a technician can never hide their own record by breaking its inheritance (Stage 0B finding B10a). Confirm at `/_layouts/15/mngsiteadmin.aspx`. |
| Members, Visitors | **Empty.** Remove "Everyone except external users" if it appears. |
| Sharing | **Only site owners can share.** **Access requests: Off.** |
| External sharing | Off or organisation-only (IT-8) |
| Sensitivity label | The organisation's HR/Confidential label, if one exists (IT-8) |
| Time zone | (UTC) Dublin, Edinburgh, Lisbon, London. Locale English (UK). |

### D.2 Lists

Break inheritance on all eight lists so that only **Owners (Full Control)** remains. Then add **`1-to-1 Technicians` – Read** on **1-to-1 Settings**, and **`1-to-1 Submit`** (own items only) on **1-to-1 Feedback**. **1-to-1 Amendments** stays Owners only. (In 1.3 the group also had `1-to-1 Submit` on **1-to-1 Challenges**; Setup 1.4 removes it and makes those items Owners-only.)

### D.3 Custom permission levels

| Level | Created by copying | Untick | Used for |
|---|---|---|---|
| **`1-to-1 Edit`** | Contribute | Add Items, Delete Items, Delete Versions, Manage Personal Views, Add/Remove Personal Web Parts, Update Personal Web Parts | Technician on **their own open** Monthly Review |
| **`1-to-1 Read`** | Read | **View Versions**, Create Alerts | Technician on their submitted review and on their **released** Manager Review. Without View Versions, they can't see the TL's earlier drafts. |
| **`1-to-1 Submit`** (v4.3, setup 1.2.1) | Contribute | Delete Items, View Versions, Delete Versions, **Create Alerts**, Manage Personal Views, Add/Remove and Update Personal Web Parts | The group on the **1-to-1 Feedback** list only, with "own items only" item-level settings (in 1.3 also the since-retired **1-to-1 Challenges** list). No alerts, so nobody can be emailed someone else's new item before Flow 6 locks it. Setup creates it. |

Keep **Use Remote Interfaces** ticked in both, because the frontend's REST calls need it.

### D.4 Who can do what

| Item | Technician access | Set by |
|---|---|---|
| Own Monthly Review, while Open | `1-to-1 Edit`. They can read and edit it, but not delete it, create new items or change permissions. | Flow 1, before the email is sent |
| Own Monthly Review, after submit or close | `1-to-1 Read` | Flow 2 (submit), Flow 3 (complete or close) |
| Own Manager Review, before completion | **None** (inherits manager-only) | — |
| Own Manager Review, after completion or close | `1-to-1 Read` | Flow 3 |
| Anyone else's items | **None** | — |
| Technicians, Appraisal Expectations | **None** | — |
| 1-to-1 Settings (band thresholds only) | **Read**, through the `1-to-1 Technicians` group | TL, at build (v4) |
| 1-to-1 Amendments (1.4) | **None.** Technicians never see the reason or the before/after values; they get E16 with a link and see the current version of their review. | Setup (list permissions) |
| Retired 1-to-1 Challenges (1.3 sites only) | **None** from 1.4 (group removed, every item Owners-only) | Setup 1.4 |

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

- **Retention period:** **24 months** (confirmed). A review is deleted once its month is more than 24 months ago. A wellbeing assessment is deleted once it was completed (or, if never completed, started) more than 24 months ago.
- **Purview label available:** apply a 24-month delete label as the **default label** on Monthly Reviews, Manager Reviews and **Wellbeing Assessments**.
- **No label:** the TL carries out a documented **monthly deletion** (first working day of each month, alongside the new month's reviews): filter Monthly and Manager Reviews by MonthKey older than 24 months, and Wellbeing Assessments by CompletedOn (or Created) older than 24 months; delete; record it in a dated note; then empty the site recycle bin and the second-stage recycle bin. Nothing is then kept more than about a month beyond 24 months.
- **Keeping the latest wellbeing assessment for a current team member** beyond 24 months (so the next review has something to build on) is an exception to the rule: only do it if HR agrees, and record that agreement.
- **Leavers:** set Active = No in Technicians and keep their records for the retention period.
- **Subject access requests:** export the list views filtered by technician, using **Export → CSV**.

---

### D.6 Frontend hosting and code integrity (v3)

Technicians now need to open one SharePoint page. That's set up without making them site members:

| Step | Setting |
|---|---|
| Group | **Site permissions → Advanced → Create Group** named `1-to-1 Technicians`. Owner: the Owners group. Who can view membership: **Group Members**. SharePoint offers no owner-only option, so technicians in the group can see each other's names (accepted, R13). Who can edit membership: **Group Owner**. Allow requests to join: **No**. **Give the group no permission on the site itself** (untick everything on the create page). |
| Page | `SitePages/OneToOne.aspx` → **Manage access → Advanced → Stop inheriting** → grant `1-to-1 Technicians` **Read**. That's this page only. The rest of Site Pages stays Owners only. |
| Layout library | `Welcome Web Part - Custom Layouts` → **Stop inheriting** → grant `1-to-1 Technicians` **Read**. It holds code only, never data. |
| Welcome configuration | Any list Welcome creates for its own settings (identified in Stage 0) gets **Read** for the group, and only if the page won't render without it |
| Welcome Errors list | **Grant the group Read** on the Welcome **"Errors"** list (`WMW_WMReplyWelcomeWebPartErrors`, shown as *Welcome Web Part - Errors*). **Required** — confirmed in Stage 0B: without it Welcome renders a blank page for the technician and raises an access request. It holds only diagnostic text (no review data). Grant to the group, not individuals. |
| 1-to-1 Settings list (v4) | **Read** for the group. Holds only the band thresholds, so technicians' outlooks match the TL's. |
| Not granted | The five data lists (access stays item-level, set by the flows), the rest of Site Pages, Site Assets and every other library |

**Code integrity.** Only the Owners group (the TL) can edit the page, the layouts library or the script. Anyone who could edit `one-to-one.js` could run code as every viewer, including the TL. That's why P16 is a release blocker, and why the quarterly check now includes the group's permissions.

**Third-party web part.** Turn **off** all Welcome extras: weather, search, time and greeting. Weather, for example, calls an external service. The layout's own script makes same-origin `_api` calls only (E.4, rule S5). P17 checks the network traffic.

**Content Security Policy.** SharePoint Online now enforces a Content Security Policy on pages. The script must run in the way Welcome supports. It uses no inline event handlers and loads nothing from outside the tenant. If the tenant blocks it, IT must allow it (IT-12) or a fallback from E.0 is used.

---

### D.7 Authorisation and workflow rules (v3.1)

**Rule:** no authorisation or privileged workflow decision ever uses a value a technician can edit. That covers every Monthly Reviews column (including `ReviewStatus`, `Technician`, `DueDate`, `ExpectationsJson` and Title), any owner field, and *Modified By*, which may be forgeable. These values are treated as **input to be validated**, never as facts.

| Decision | Authoritative source (server-controlled, TL-only list) |
|---|---|
| Who a review belongs to (access, emails) | `Manager Reviews.Technician`, written by Flow 1 from the TL-only Technicians list |
| Which item belongs to which review | `Manager Reviews.ReviewItemId`, the immutable SharePoint item ID |
| Workflow state | `Manager Reviews.ReviewState` only |
| Due date and lateness | `Manager Reviews.DueDate`; `SubmittedOn` is stamped by Flow 2 with server time |
| Expectation wording | `Manager Reviews.ExpectationSnapshotJson` |
| Audit of amendments (1.4) | **1-to-1 Amendments** (Owners only, versioned): reason, changed fields and before/after values, written before the review changes; who and when from SharePoint's Created By / Created. Tamper-*evident*, not tamper-proof (site owners and admins can edit lists they own); the E16 email to the technician is an independent record. Until 1.3: `CorrectionLog` plus Manager Reviews versions. Monthly Reviews version history is not relied on. |
| Appraisal periods (1.4) | `Technicians.AppraisalCycleStart` and `AppraisalHistoryJson`. The `AppraisalBoundaries` copy on Monthly Reviews is display only, for the technician's own view. |
| Next wellbeing date (1.4) | `Technicians.NextWellbeingDate` |
| Appraisal date (v4) | `Technicians.AppraisalDate`. The copy on Monthly Reviews is display only: a technician who edits it changes only their own view. |
| TL ratings and actions (v4) | `Manager Reviews.ExpectationFeedbackJson` / `ActionsJson`. Technicians can't write them. |

**Allowed state transitions.** Each is validated by the flow that performs it. Anything else is rejected: Flow 3 reverts it and emails the TL, and Flow 2 only re-applies Read.

| From → To | Performed by | Only if |
|---|---|---|
| Open → Submitted | Flow 2 | The changed item is the one recorded in `ReviewItemId`, and `ReviewState` = Open |
| Submitted → Completed | Flow 3, on the TL's command | `SubmittedOn` is set |
| Open → Closed - Not Submitted | Flow 3, on the TL's command | `SubmittedOn` is empty **and** `DueDate` has passed |

The TL views (Team overview, Monthly reviews, manager review) take status **only** from `ReviewState`. `ReviewStatus` on Monthly Reviews is used only as a "draft started" hint, and as the technician's submit signal that Flow 2 re-validates.

**Accepted low risk:** a technician can trigger Flow 2 repeatedly by editing their own draft. Each run only re-applies permissions they already hold.

**Amendments are not resubmissions (1.4).** When the editor is the TL and the Manager Review is no longer Open, Flow 2 cancels the run: no E3, no new stamp, no permission change. Flow 1 reports any submitted review Flow 2 never processed.

---

## E. Frontend specification (Welcome custom layout)

The frontend is a custom HTML/CSS/JavaScript layout inside the **Welcome by Accelerator 365** web part. **v4 is built**: [`02-frontend/one-to-one.html`](02-frontend/one-to-one.html) and [`02-frontend/one-to-one.js`](02-frontend/one-to-one.js) (version 4.1.0). The approved design baseline is [`prototype/prototype.html`](prototype/prototype.html) (prototype v7). The lists, permission model and flows are as in C, D and F.

### E.0 Feasibility gate — passed

Stages 0A and 0B proved in the live tenant that a Welcome layout can do all of the following:

- load a separate script (`<script src … data-layout data-exports>`);
- read the current user;
- read and write list items through Welcome's `spHttpClient`;
- keep a technician confined to their own items.

The production code uses the same wrapper as probe 0A2/0B: `window.ESGOneToOne = function (ctx) { return { onInitialize, onError, onDispose }; }`.

Fallbacks are no longer expected, but if they're ever needed:

1. Package the same JavaScript as an **SPFx web part**.
2. Revert to the **v2 canvas app** (git `16dd9c5`).

### E.1 What gets built

| File | Where it goes | Contents |
|---|---|---|
| `one-to-one.html` | *Welcome Web Part - Custom Layouts* library | Welcome metadata (`data-name="ESG 1-to-1"`), all CSS (scoped to the web part), an empty root element, and the script tag. No Handlebars expressions. |
| `one-to-one.js` | Same library | All behaviour. About 1,800 lines of plain JavaScript, with **no libraries, no CDNs and no external calls**. |
| `OneToOne.aspx` | Site Pages, **site home page**, **full-width section** | One Welcome web part using the *ESG 1-to-1* layout. Greeting, time, weather and search are off. |

**One page for everyone**, with a **top menu bar** (v4.1.0; the team list is in its **Team ▾** menu). Opening a link with `?reviewId=` selects that review.

| Who | Menu bar | Default view |
|---|---|---|
| Technician | This month · My appraisal · Appraisal report | *This month* (their latest review, or the one in `?reviewId=`) |
| TL | Team overview · Monthly reviews (badge: awaiting review) · Expectations · Actions (badge: overdue) · team list (band dot and attention flag per technician) · ⚙ Settings | *Team overview*, or the manager review when `?reviewId=` is given |

**Role detection.** The page asks SharePoint for the signed-in user's `effectiveBasePermissions` on the site. **ManagePermissions means TL.** This is the same right that makes the TL an owner and Site Collection Admin (D.1), so no email address or other configuration is needed.

Role is **routing only**. Every read and write runs as the signed-in user, so a technician who forced the TL view would just see empty or forbidden data (P-tests).

### E.2 Configuration

There is nothing to fill in. The CONFIG block only holds the list titles and the time zone:

```js
var CONFIG = {
  lists: { reviews: 'Monthly Reviews', mgr: 'Manager Reviews', techs: 'Technicians',
           exp: 'Appraisal Expectations', settings: '1-to-1 Settings',
           wellbeing: 'Wellbeing Assessments', feedback: '1-to-1 Feedback',
           amendments: '1-to-1 Amendments' },
  timeZone: 'Europe/London' };   // 5.0.0: no maxExpectations – there is no limit
```

The site comes from `pageContext.web.absoluteUrl`. The file contains no secrets, URLs, emails or IDs.

### E.3 Data access: SharePoint REST, as the signed-in user

Calls go through `ctx.getWebPart().spHttpClient` with `configurations.v1`. They are same-origin, use OData `nometadata`, and need no tokens or app registrations.

| Function | REST call | Notes |
|---|---|---|
| `spGetAll(list, select, expand)` | `items?$select…&$expand…&$top=5000`, following `odata.nextLink` | **401, 403 and 404 return an empty list**, so anything hidden by permissions simply isn't shown |
| `spUpdate(list, id, fields)` | `items(id)/validateUpdateListItem` with `X-RequestDigest` | **The only update function.** Throws on `HasException` or 403. |
| `spCreate(list, fields)` | `AddValidateUpdateItemUsingPath` into the list's RootFolder | **The only create function.** Used by the TL only, for expectations and the Settings item. |
| digest | `POST /_api/contextinfo` | Cached until shortly before expiry |
| role | `/_api/web/currentuser`, `/_api/web/effectiveBasePermissions` | |

**Value formats for writes** (all sent as text):

| Type | Format |
|---|---|
| Choice | The choice text |
| Number | Digits |
| Date | `dd/MM/yyyy` (site locale English UK) |
| Yes/No | `1` / `0` |
| Person | `[{"Key":"<claims>"}]`, used only when the TL creates an Individual expectation |
| Clear a value | `''` |

**Date display.** Date-only values are converted to the **Europe/London calendar date** before display, so BST never moves a date by a day. All dates are shown **DD-MMM-YYYY**, for example `30-Nov-2026`, and typed the same way.

**Reads**

| Who | Lists read | What SharePoint returns |
|---|---|---|
| TL | Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, 1-to-1 Settings | Everything |
| Technician | Monthly Reviews, Manager Reviews, 1-to-1 Settings. The frontend never requests Technicians or Appraisal Expectations for a technician; a forced request returns 403/404. | Only their own Monthly Reviews, their **released** Manager Reviews, and the band thresholds |

The frontend **never calls a permission endpoint** (no `roleassignments`, `breakroleinheritance` or `ensureuser`). The test suite checks this.

### E.4 Security rules for the code (release blockers)

The script runs with the **full permissions of whoever views it**, including the TL. A technician's answer rendered as HTML could run code as the TL. These rules prevent that:

| # | Rule | How it's enforced |
|---|---|---|
| S1 | List data and typed text reach the page **only through `textContent` / text nodes**. No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` anywhere in the file. | Static test, plus an XSS sweep over every view with attack strings in every field |
| S2 | No Handlebars expressions in the layout | Static test |
| S3 | Links are built only from numbers (`'?reviewId=' + Number(id)`) | Code review |
| S4 | No `eval`, `new Function`, string timers or inline handlers. `JSON.parse` only inside `try`. | Static test |
| S5 | No external resources. The only URL string in the code is the SVG namespace. | Static test |
| S6 | Writes only through `spUpdate` / `spCreate`, only to the fields listed in E.5–E.7 | Payload allow-list tests |
| S7 | Only Owners can edit the page, the layouts library or the script | Quarterly check, P16 |

Charts are drawn as **inline SVG** with `createElementNS`. The printable report is built in a new window from DOM nodes (`importNode`) with inline CSS. Neither path ever parses list data as HTML.

### E.5 Technician views

**This month.** The current (or selected) review, as a form. A small side panel shows the deadline, status, energy tile and a mini outlook.

- **Q1–Q7 and Q9:** wording and scales as agreed. Q4–Q6 are Yes/No, and their detail boxes appear only on **Yes** (hidden details are **cleared on save**).
- **Q8:** one row per expectation from `ExpectationsJson`, each with a 1–5 progress rating and a comment.
- **Energy check-in** (`Mood`, 1–5) and **Win of the month** (`WinOfMonth`). Both are optional.
- **Save** (status Draft) and **Submit**. Submit is blocked while the "Still to complete" list isn't empty, and asks for confirmation first.
- **Unsaved-changes warning** (`beforeunload`).
- **Read-only** once submitted. Released TL feedback, ratings and actions appear in place.
- **Fields written** (one `spUpdate` to Monthly Reviews):
  - Q1WentWell
  - Q2Issue, Q2Impact, Q2Tried, Q2Support
  - Q3WorkloadRating, Q3WorkloadComment
  - Q4WellbeingRaise, Q4WellbeingDetail
  - Q5PlanningRaise, Q5PlanningDetail
  - Q6DevRaise, Q6DevWhat, Q6DevWhy
  - Q7ManagerFeedback
  - ExpectationsJson
  - Q9FollowUp
  - Mood, WinOfMonth
  - ReviewStatus

**My appraisal.**

- The expected appraisal outcome (E.7) for the current appraisal period, as a band chip with current and projected scores (5.0.0: words and bands only for technicians, and "N rated reviews of M months · K missed").
- A trend chart (self in blue, released TL ratings in orange).
- Per-expectation progress, their actions, and a submission streak.

There is **no "how it's worked out" panel** for technicians.

**Appraisal report.** See E.8.

**Not found.** An unknown or someone else's `reviewId` shows "Review not found".

### E.6 Team Leader views

| View | Content | Writes |
|---|---|---|
| **Team overview** | KPI tiles (submitted, awaiting review, overdue, open/overdue actions, dedicated 1-to-1s requested); *Needs your attention* at full width (5.0.0: the chart switcher, *Expected appraisal outcomes* and *Workload this month* were removed); a team table (technician, this month's status, energy, expected band and projected score, appraisal date, open actions, flags) | — |
| **Monthly reviews** | All reviews with month, technician and status filters | — |
| **Manager review** (`?reviewId=`) | The technician's answers, read-only (5.0.0: changed only through **Amend answers…** / **Amend…**, see the v5.0.0 section; an **Amended (n)** card for the TL only). TL feedback per question. Q8 shows the trusted `ExpectationSnapshotJson` wording, the technician's rating and comment, **TL feedback and TL rating (1–5)**. Follow-up override, meeting date, overall feedback. **Actions table** (add rows: action, owner, close-out criteria, deadline, status). | Manager Reviews: FB_Q1–FB_Q7, FB_Q9, FB_Overall, ExpectationFeedbackJson `[{id,feedback,rating}]`, FollowUpDecision, MeetingDate, ActionsJson, ActionsStatus, NextActionDue. Then, **as a separate write**, ReviewState = `Completed` or `Closed - Not Submitted`. |
| **Expectations** | A **Shared** card and one card per technician, with add, edit and retire. A "Show retired" toggle. 5.0.0: a retired expectation can be **Delete permanently** (TL only, with confirmation, to the site recycle bin for about 93 days; past reviews keep their own copies). | Appraisal Expectations: Title, Measures, AppraisalYear, AppliesTo, Technician (person), SortOrder, Active |
| **Actions** | Every action across all reviews, grouped open/overdue/done, with close and reopen | Manager Reviews: ActionsJson, ActionsStatus, NextActionDue |
| **Technician profile** (from the **Team ▾** menu or the outlook table) | Outlook, trend chart, expectations, actions and history for one person; report button. 5.0.0: a period selector (current + each past period); the *Workload by month* and *Energy by month* charts were removed. | — |
| **⚙ Settings** (modal, TL only) | Appraisal date per technician (DD-MMM-YYYY); the four band names and thresholds; how the outlook is worked out. 5.0.0, **Team** tab, per person: Next appraisal, Days to go, Next wellbeing, Appraisal period start (editable while there is no history), **Mark appraisal completed…** and **Undo last**. | Technicians.AppraisalDate, **plus** the technician's current Monthly Review AppraisalDate (display copy). 1-to-1 Settings `Bands` item (created if missing). |

**Complete & release rules.**

- **Complete & release** is offered only when the review is Submitted. It is blocked while any action is missing its close-out criteria or deadline.
- **Close – not submitted** is offered only when the review is Open and past its deadline.
- Flow 3 re-validates both.
- After release, the review is **read-only** until the TL clicks **Amend…** (5.0.0). An amendment needs a reason and is recorded in *1-to-1 Amendments*; the old "record it in the correction log" banner is gone.

### E.7 Expected appraisal outcome

Calculated in the browser from items the viewer can already read.

1. **Period (5.0.0):** from the date the previous appraisal was actually completed (or the period start the TL sets in Settings → Team) to the next completion – any length. A monthly review belongs to a period by its month: after the start's month, up to and including the completion month. The next appraisal due date is only the projection's end point; changing it never moves a review. Reviews before the first period start form a closed earlier period. With no start set there is no forecast beyond the current score. (Until 4.5: the 12 months up to the appraisal date.)
   - **Missed months** (*Closed – Not Submitted*, or *Open* and overdue) are left out of the monthly scores, the current position, the projection, the trend and the on-time figure (on time ÷ submitted). They still show as overdue and in the submission record.
2. **Monthly score:**
   - Use the average of the **TL's expectation ratings** for that month when the viewer can see them. The TL always can; a technician can only once that month is released.
   - Otherwise use the technician's own average Q8 rating.
3. **Current position:** recency-weighted average of the monthly scores (weights 1, 2, 3 …).
4. **Projection** (needs 3 or more months):
   - Fit a least-squares trend line.
   - Add half the slope × the months remaining.
   - Cap the result at **±0.75** of the fitted value, and keep it within 1–5.
5. **Band:** match the projection against the 1-to-1 Settings bands. The defaults are:

   | Projection | Band |
   |---|---|
   | under 1.5 | Not met |
   | 1.5 – under 2.25 | Partially met |
   | 2.25 – under 4 | Met |
   | 4 and above | Exceeded |

This is an **aid to writing the appraisal, not a decision**. The page says so, and the TL's judgement decides the real rating.

### E.8 Appraisal report

Available to the TL (any technician) and to the technician (themselves). It covers one appraisal period (5.0.0: a period selector, current or any past period; until 4.5 the 12 months to the appraisal date) and has eight sections:

1. Summary (band, scores, chart)
2. Appraisal expectations (per-month self and TL ratings, comments, feedback)
3. Achievements (win of the month, what went well)
4. Development and training
5. Challenges and support (the Q2 answers: issues and support needed)
6. Agreed actions
7. Line manager feedback
8. Submission record

**Wellbeing (Q4) answers are never included.** A technician's report shows TL content only from released reviews.

It opens in an in-page overlay with **Print / Save as PDF**. That opens a clean print window, so the browser must allow pop-ups for the site.

### E.9 Layout, accessibility and local verification

**Layout**

- Built for desktop: a top menu bar plus a full-width content area that scales up on large screens, with no large blank regions (v4.4.0).
- **Desktop only (v4.5, confirmed by the TL):** phones are out of scope; there is no phone layout (IT-7 not needed).
- Colours: navy UI; self ratings blue `#2a78d6`; TL ratings orange `#eb6834`; band colours red/amber/green/blue.
- Overlays use z-index 10000+ so they sit above SharePoint's chrome.

**Accessibility**

- Labelled inputs, `fieldset` / `legend` on radio groups.
- An `aria-live` toast region for save results.
- Keyboard-operable controls.

**Local verification (no tenant needed)** — [`02-frontend/README.md`](02-frontend/README.md):

- **`mock/mock-sharepoint.js`:** an in-memory SharePoint `_api` behind a fake Welcome context.
  - Five lists with field types and fictional users (TL, Test A, Test B and others).
  - Item permissions as in D.4.
  - Flow 2 and Flow 3 effects emulated.
  - A switch for attack-string (XSS) data.
- **`mock/index.html`:** generated from the production CSS by `tools/build-mock.js`. You can click through every view as any user.
- **`test/run-tests.js`** (headless Chromium, 273 checks):
  - static rules S1, S2, S4 and S5;
  - isolation for Test A and Test B, including direct REST attempts;
  - draft payload allow-list;
  - submit → lock → refused write;
  - the TL journey (feedback, ratings, actions, release);
  - settings (dates, bands, BST round-trip);
  - creating and retiring expectations;
  - closing actions;
  - the report (8 sections, print popup);
  - an XSS sweep over 11 views.

The local checks are **not** a substitute for the tenant tests in H.


---

## F. Power Automate specification

**Build from [`03-flows/FLOW_BUILD_SHEETS.md`](03-flows/FLOW_BUILD_SHEETS.md) and [`03-flows/EMAIL_TEMPLATES.md`](03-flows/EMAIL_TEMPLATES.md).** They contain everything below, with the v4 changes applied. This section stays as the design record.

**v4 changes:**

- **Flow 1:**
  - `Create item` (Manager Reviews) also sets `ExpectationFeedbackJson` = `[]` and `ActionsJson` = `[]`.
  - `Create_review` also sets `AppraisalDate` = `items('Each_technician')?['AppraisalDate']`.
  - `DeadlineText` uses `'dddd dd-MMM-yyyy'`.
- **E3:** detects the request with `startsWith(…, 'Arrange a dedicated')`. The stored choice ends with a full stop, so an exact comparison never matched.
- **E1:** drops the "talk sooner" sentence.
- **Flows 2 and 3:** unchanged.

### F.0 Configuration values and the shared permission block

**Initialize variable** actions at the top of every flow (Flow 1 also adds `varTestDate` and `varProblems`):

| Variable | Type | Value |
|---|---|---|
| varManagerEmail | String | TL email |
| varPageLink | String | `<Site URL>/SitePages/OneToOne.aspx` |
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
   - varManagerEmail, varPageLink, varOwnersId, varFullControlId, varEditId
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
   | `DeadlineText` | `concat('23:59 on ', formatDateTime(outputs('LastDay'), 'dddd dd-MMM-yyyy'))` (v4) |
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
               | ExpectationFeedbackJson | `[]` (v4) |
               | ActionsJson | `[]` (v4) |

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
               | AppraisalDate | `items('Each_technician')?['AppraisalDate']` (v4) |

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

1. **Initialize variables:** varManagerEmail, varPageLink, varOwnersId, varFullControlId, varReadId.
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

1. **Initialize variables:** varManagerEmail, varPageLink, varOwnersId, varFullControlId, varReadId.
2. **Scope `Try`:**
   1. **Compose** `Cmd` = `triggerBody()?['ReviewState']?['Value']`
   2. **Condition** `Valid`, in advanced mode:

      ```
      @or(and(equals(outputs('Cmd'),'Completed'), not(empty(triggerBody()?['SubmittedOn']))), and(equals(outputs('Cmd'),'Closed - Not Submitted'), empty(triggerBody()?['SubmittedOn']), less(ticks(triggerBody()?['DueDate']), ticks(utcNow()))))
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

The link is always `concat(variables('varPageLink'), '?reviewId=', <Monthly Review ID>)`. That's `variables('varReviewId')` in Flow 1, `items(...)?['ReviewItemId']` for reminders, `triggerBody()?['ID']` in Flow 2 and `triggerBody()?['ReviewItemId']` in Flow 3.

| ID | To | Subject | Body |
|---|---|---|---|
| E1 | Technician | `Your 1-to-1 for @{outputs('MonthName')} is ready` | Hi @{first(split(outputs('Mgr')?['Technician']?['DisplayName'],' '))},<br>Your monthly 1-to-1 is ready: **<a href="LINK">Open my 1-to-1</a>**.<br>Deadline: @{outputs('DeadlineText')}.<br>You can save and come back as often as you like before you submit.<br>This link only works when you're signed in with your own company account. |
| E2 | Technician | `Reminder: your 1-to-1 for @{outputs('MonthName')} is due @{outputs('DeadlineText')}` | Your 1-to-1 hasn't been submitted yet. Your saved draft is still there: <a href="LINK">Continue</a>. |
| E3 | TL | `@{if(startsWith(coalesce(triggerBody()?['Q9FollowUp']?['Value'],''),'Arrange a dedicated'),'[1-to-1 REQUESTED] ','')}1-to-1 submitted: @{outputs('Mgr')?['Title']}` | Submitted @{if(greater(ticks(utcNow()), ticks(outputs('Mgr')?['DueDate'])),'late','on time')}. <a href="LINK">Open review</a> |
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

- [ ] Send IT the questions **IT-1 to IT-13** and HR the questions **HR-1 to HR-5** from section J. **IT-10 (is Welcome available?) comes first.** You can build Stage 0 while you wait, but **don't put real technician data in** until IT-2, IT-10, IT-11, IT-13 and HR-2 are answered.

> **v4.1:** with the imported solution you need only the **Site URL** and **TL email** (entered at import); the IDs below are only for building the flows by hand.

Create the **Config sheet** with these lines:

```
TL email (as SharePoint shows it):
Site URL:
Owners group ID:
Full Control role ID:
1-to-1 Edit role ID:
1-to-1 Read role ID:
Page link (<Site URL>/SitePages/OneToOne.aspx):
```

The filled-in Config sheet stays in the site or your OneDrive, never in the repository. See [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §1.

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

### Part 3 — Create the eight lists ⏱ about 2 h

> **v4.1: done for you.** Import the solution and run the setup flow ([`04-solution/IMPORT_GUIDE.md`](04-solution/IMPORT_GUIDE.md)), which also covers Part 2. The steps below remain the manual alternative.

**Use the tick-list [`01-sharepoint/lists.md`](01-sharepoint/lists.md).** The steps below are the general method.

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
| a | **List name, description and navigation** | Rename to the display name: `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `1-to-1 Settings`. Technicians stays as it is. |
| b | **Versioning settings** | Create a version each time you edit an item: **Yes**. Keep **100**. |
| c | **Advanced settings** | Attachments **Disabled**. Allow items from this list to appear in search results **No**. Offline client **No**. Then **OK**. |
| d | **Indexed columns** → **Create a new index** | One index for each column marked *Indexed* in C |
| e | Manager Reviews only: click the column **ReviewKey** | **Enforce unique values: Yes** |
| f | **Permissions for this list** → **Stop Inheriting Permissions** → OK | Tick the Members and Visitors groups, if listed, then **Remove User Permissions**. Only **Owners – Full Control** should remain. |
| g | Views | Create the views listed in C.2 and C.4: **+ Create view** (classic) or **Switch view options → Create new view**, then set the filters. |
| h | 1-to-1 Settings only | Add the `Bands` item (C.4a), then **Grant Permissions → `1-to-1 Technicians` → Read** |

Lists and checks:

- [ ] **Technicians** (C.1)
- [ ] **Appraisal Expectations** (C.2)
- [ ] **Monthly Reviews** (C.3)
- [ ] **Manager Reviews** (C.4)
- [ ] **1-to-1 Settings** (C.4a)
- [ ] **Check:** Site contents shows eight lists. The data lists' permissions pages show only Owners (Wellbeing Assessments, 1-to-1 Feedback and 1-to-1 Amendments are added later by setup 1.1, 1.2 and 1.4). 1-to-1 Settings shows Owners plus `1-to-1 Technicians` – Read.

### Part 4 — Record the four IDs ⏱ 10 min

> **v4.1: not needed** with the imported flows. They look up the IDs themselves.

Paste each address into your browser while signed in as the TL. The page shows XML. Use **Ctrl+F** to find the values.

1. [ ] `<Site URL>/_api/web/associatedownergroup`. Find `<d:Id>` and copy the number to **Owners group ID**.
2. [ ] `<Site URL>/_api/web/roledefinitions`. Use Ctrl+F to find each `<d:Name>` and copy the `<d:Id>` just above it:
   - **Full Control** (usually `1073741829`)
   - **1-to-1 Edit**
   - **1-to-1 Read**
3. [ ] `<Site URL>/_api/web/currentuser`. Find `<d:Email>` and copy it, **in lower case**, into **TL email**.

### Part 5 — Stage 0 ⏱ about 45 min (0A), then 0B — ✅ passed

**Both stages have passed in the live tenant.** Delete the `ZZProbe` lists and the probe files from the layouts library before go-live. The notes below are kept for reference.


- **0A (feasibility):** follow [`02-frontend/probe/README.md`](02-frontend/probe/README.md). It creates the test list `ZZProbe0A`, the `OneToOne` page with Welcome, and the `1-to-1 Technicians` group with Read on the page and layout library. It then runs the probe as the TL and as Test A.
- **0B (security):** instructions and probe are produced **only after 0A passes**. 0B uses throwaway `ZZProbe` lists, never the production lists.
- **If 0A fails, stop.** Use a fallback from E.0. The site and group are kept either way.

### Part 6 — Build Flow 1 ⏱ 2–3 h

> **v4.1: imported** as *ESG 1-to-1 \| 1 Daily scheduler*. Turn it on after setup. The steps below remain the manual alternative.

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

### Part 7 — Install the frontend ⏱ 30 min

You don't build any screens, and **there is nothing to edit in the files**. Full steps and the smoke check are in [`02-frontend/README.md`](02-frontend/README.md).

1. [ ] Transfer `02-frontend/one-to-one.html` and `02-frontend/one-to-one.js` through the approved route.
2. [ ] Go to **Site contents → Welcome Web Part - Custom Layouts → Upload → Files** and upload both files. If asked, choose **Replace**.
3. [ ] Configure the web part:
   1. Open the `OneToOne` page and click **Edit**.
   2. Put the Welcome web part in a **full-width section**.
   3. Click the **pencil** and set **Layout** to **ESG 1-to-1**.
   4. Turn greeting, time, weather and search **off**.
   5. Click **Republish**.
4. [ ] **Site Pages:** `OneToOne` → **… → Make homepage**.
5. [ ] Permissions check (D.6): `1-to-1 Technicians` has **Read** on the page, the layouts library, the Welcome Errors list and **1-to-1 Settings**.
6. [ ] Check that `varPageLink` in the flows matches the page link.
7. [ ] **Check as the TL:** the site opens on **Team overview**, with the top menu bar showing Team ▾ and ⚙ Settings. The menu bar shows **v5.0.0** at its right-hand end.
8. [ ] **Check as the TL:** open ⚙ **Settings**, enter each test technician's appraisal date (DD-MMM-YYYY), and save.
9. [ ] **Check as Test A:** the E1 link opens **their** review. The menu bar shows only *This month · My appraisal · Appraisal report · Wellbeing*.

**Updating the frontend later:** upload the corrected file over the old one. The library keeps versions, so **… → Version history → Restore** rolls back a bad update. Record every change in [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §7.

### Part 8 — Build Flows 2 and 3 ⏱ 2 h

> **v4.1: imported** as *ESG 1-to-1 \| 2 Review submitted* and *3 Manager decision*. Turn them on after setup.

1. [ ] Go to **+ Create**, then **Automated cloud flow**. Name: `1-to-1 | Review submitted`. Trigger: **SharePoint – When an item is created or modified**. Choose your site and **Monthly Reviews**.
   1. In the trigger's **Settings**, add the **Trigger condition** from F.2 and set **Concurrency control** to 1.
   2. Build the actions in F.2.
   3. **Save.**
2. [ ] Do the same for `1-to-1 | Manager decision`, using **Manager Reviews** and the steps in F.3. It has two trigger-condition lines.
3. [ ] Make sure all three flows show **On**.

### Part 9 — Stage 1 test ⏱ 3 h

Run **H** tests F1–F4, F8–F12 and F18, plus **P1, P2, P3, P5, P8 and P15**. Fix anything that fails before you continue. A frontend fix means getting a corrected file from Claude, transferring it through the approved route, and re-uploading it (Part 7, *Updating*).

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
   1. Before the new appraisal year starts, add any new expectations with that year as their first year (they stay hidden until it starts). **Edit in grid view** makes this quick: copy, paste and change AppraisalYear.
   2. From 1.4 an expectation carries on into later years until it is retired, so at the year end set only the ones that no longer apply to **Active = No**. A retired one may later be **Delete permanently** (TL only, to the recycle bin); past reviews keep their own copy either way.
   3. The next month's reviews pick up the new set automatically, and older reviews keep their own snapshot.

### Part 12 — Stage 4: privacy tests and go-live ⏱ 6–7 h

1. [ ] As the TL, check the Team overview tiles, the Monthly reviews filters and the Actions page against the lists for the test month (E.6).
2. [ ] Optional: add a **Quick links** web part below Welcome, linking to the Manager Reviews *Overdue* and *Open actions* views. Then **Republish**.
3. [ ] Run **all of section H**, including **every P test**. Any failed P test **blocks go-live**.
4. [ ] In each flow, open the trigger and every **Get items** action and turn on **Secure inputs** and **Secure outputs** in Settings. Save.
5. [ ] **Clean-down:**
   1. Delete all test items in Monthly Reviews and Manager Reviews (and in Wellbeing Assessments, 1-to-1 Feedback and 1-to-1 Amendments), then empty both recycle bins. On a live site use the one-time reset tool instead ([`RESET_PROCEDURE.md`](RESET_PROCEDURE.md)).
   2. Remove Test A and Test B from Technicians.
   3. **Remove Test A and Test B from the `1-to-1 Technicians` group.**
6. [ ] **Go-live:**
   1. Add the real technicians to the Technicians list **and** to the `1-to-1 Technicians` group.
   2. Either wait for 07:00 on the 1st, or click **Run** on Flow 1 now to start the current month. That's safe, because the flow is idempotent.
7. [ ] **First live month:**
   - On the **1st**: check Flow 1's run history and that every technician appears on **Team overview**.
   - On the **20th**: check that the reminders went out.
   - On the **next 1st**: check that the new month was created and the previous month's unsubmitted reviews show as **Overdue**.

### Operating procedures

These are in [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §4:

- monthly cycle
- appraisal dates
- quarterly permission check (now including the 1-to-1 Settings list)
- new starters and leavers
- corrections
- annual expectation rollover
- 24-month retention
- subject access requests
- TL handover (no frontend change needed)

---

## v4.2 additions (tenant feedback round 1, 15-Oct-2026)

| Area | What changed | Security notes |
|---|---|---|
| Dates | Every date box: type it any common UK way (15/07/2027, 15 Jul 27, ISO) or pick it from a 📅 calendar; the day is shown in words. Every date write is read back and retried in the format the site accepts (ISO, dd/MM, MM/dd), so a regional-settings mismatch can no longer save a wrong day silently (fixes the "date reverts" report). Dialogs no longer leave an "unsaved changes" prompt behind. | Writes still only through `validateUpdateListItem` (S6). |
| ⚙ Settings | Tabs: **Team** (search people, add, deactivate, appraisal dates), **Reminders** (days), **Names** (app name, manager and team-member role words), **Bands**. | The page never changes permissions: adding someone creates a Technicians item; **Flow 4** puts them in the group. Names are labels only. |
| Expectations | Drag (or ▲▼) to reorder; Order box removed. Shared = 10, 20…; individual = 1010, 1020…, so shared come first on forms. | – |
| Team overview | *Needs your attention* replaces the duplicate status card; third chart selectable (workload, energy, actions, self vs you, outcome, on-time, days to appraisal); Energy column removed from the outlook table. | Chart choice stored in the viewer's browser only. |
| Reminders | Days set in Settings (`Reminders` item); Flow 1 reads them daily without JSON parsing, so a hand-edited value can't fail the run. | – |
| Wellbeing | New list **Wellbeing Assessments**, TL and technician **Wellbeing** tabs, step-by-step form (HSE management standards, personal input, support), TL review panel (arrangements, notes, yearly review date – brought forward when needed), print with signature lines. **Flow 5** shares each item with that person only, locks it when they submit, wipes anything they typed in the TL fields, restores the owner from the item permission, stamps SubmittedOn / CompletedOn. Flow 1 emails the TL 7 days before and on the review date. | Trusted person = holder of the item permission (set by Flow 5), never the editable column (D.7). Wellbeing never appears in reports, charts or the outlook. |
| Appraisal timing (4.2.1) | A passed appraisal date reads **Overdue by N days** (team table, Settings, profile tile, overview tile *Appraisals overdue*) and *Needs your attention* says to set the next date once it's done. Appraisals are best done in the **calendar month before** the date: a subtle "aim: in December" line under Days to go (amber once that month starts), "Aim to complete X's appraisal by 31-Dec" in *Needs your attention*, and "Aim to complete" on the technician's outlook. The appraisal date stays the deadline. | Display only. |
| Upgrade-safe Flow 1 (1.1.1.0) | 1.1.0.0's Flow 1 read *Wellbeing Assessments* with a connector step, so after importing over 1.0 it could not be turned back on until Setup had created the list (*GetTable … List not found*). Flow 1 now reads it by REST through the list ID found at run time. A validator rule (plus mutation) stops flows 1–4 naming a list added after 1.0 in a connector step. | REST read is secured like the other steps. |

### v4.3 – feedback bubble (frontend 4.4.0, solution 1.2.1.0)

| Area | What changed | Security notes |
|---|---|---|
| Feedback bubble | A 💬 **Feedback** button bottom-right on every page, for everyone. Type (Fault / Improvement / Suggestion) and a message (2,000 characters at most); sent with the person's name, the page and the version. On-screen: "Thank you. Your feedback has been submitted to your Team Leader." | Creates an item in the new **1-to-1 Feedback** list – the only list the group can add to (**Contribute**, with item-level security: each person reads and edits only their own items). |
| Flow 6 Feedback | Locks each new item to **Owners only** first, then emails it to the TL (**E13**) and stamps `SentOn` / `DeliveryStatus = Sent`. If the email fails: the item is marked **Failed**, a short notice without the content is tried, and the run ends Failed (Power Automate's own failure notice). Failed – or still Pending after an hour – items appear in the TL's *Needs your attention*, readable in a dialog, with **Mark as read**. | Message HTML-escaped in the email. The trigger only fires for Pending items, so the flow's own updates can't loop. |


### v4.4 – friendlier forms (frontend 4.4.0; solution unchanged)

| Area | What changed | Security notes |
|---|---|---|
| Auto-save | The technician's monthly and wellbeing forms, and the TL's review **until it is released**, save themselves about 4 s after typing stops (at most every 20 s), silently: *Saving… / Saved 10:42 / Not saved – will retry*. A released review only saves on **Save feedback**, so half-typed text never goes live. | Same writes as **Save draft** (Draft status never triggers Flow 2). |
| Shorter form | Time left ("about 6 min left"); Q2 folded while empty (**+ Add**); Q4–Q6 fold to one line when answered *No*. | Display only. |
| Since last time | Top of the current form: what the technician raised last month, the TL's replies (only once released) and their open / recently done actions. | Built only from the technician's own loaded records; unreleased feedback is never shown. |


### v4.5 – clearer forms, words not numbers, focus areas, challenges (frontend 4.5.0, solution 1.3.0.0; challenges removed in 1.4)

| Area | What changed | Security notes |
|---|---|---|
| Clearer forms | Required questions not yet answered have a subtle **orange** border (Yes/No and rating buttons too). **Submit** with gaps turns them **red** and focuses / scrolls to the first; each clears as it's answered. The wellbeing form's Submit jumps to the first unanswered step (its step pill turns red); the TL's action rows mark an empty action, criteria or deadline red when saving is blocked. Optional questions are never marked. | Display only. |
| Words, not numbers | Technicians never see numeric ratings or scores: rating buttons are words (*Not started, Early progress, On track, Strong progress, Fully met*); the outlook shows a band chip and a coloured bar, and the trend as *Improving / Steady / Dipping / Too early to tell*; *My appraisal*, charts (band-labelled axis and tooltips), expectation bars and their appraisal report use words and bands only. The TL's screens keep the numbers. The coloured bar follows the bands in ⚙ Settings (it was hard-coded to the defaults). | Display only; the stored values are unchanged (1–5). |
| Focus areas | *To move up to <next band>, focus on: A · B · C* – the three expectations with the lowest average rating over the appraisal period (the TL's rating once released, otherwise the self-rating); *Keep it up* in the top band. On the technician's outlook, *My appraisal* / profile and report section 1 (*Areas to focus on*, replacing the old logic). The TL sees the averages in brackets. | Built only from records the viewer can already read; unreleased TL ratings are never used for a technician. |
| ⚑ Challenge (**removed in 1.4** – see below) | On their **latest released** review only, a technician can flag the TL's judgement – each expectation rating, the overall feedback, the agreed actions (nothing else) – with an optional note each, then **Send challenge**. A banner shows the topics, who has agreed and the close-by date; both press *agree – resolved* to close it as **Agreed**. Not agreed by the close-by date (end of the UK month it was raised; end of the next month if fewer than 7 days were left) → **Not agreed**, still flagged; the TL can **Reopen challenge**. TL: challenged parts marked amber, *Needs your attention* (open ones, and Not agreed ones for 60 days), a chip on Monthly reviews, report section 7. If the page is uploaded before Setup is re-run, challenges are simply not offered. | New list **1-to-1 Challenges** (same access as Feedback: `1-to-1 Submit`, own items only). **Flow 7** accepts a challenge only from the review's own technician (item Author), on their latest released, never-challenged review, with non-empty sections ≤ 20,000 characters; it makes the item private (Owners + that person, `1-to-1 Edit`) and records the trusted state in new `Challenge…` columns on the **Manager Review**, which the technician can only read. Anything else is *Rejected* and Owners-only, with no email. The TL's agreement is recorded only on the Manager Review. More than one holder fails the run; an item pointed at another review is ignored. E14 / E15 carry no challenge text. **Flow 1** closes overdue ones (REST only, skipped if the list doesn't exist yet; a failure is noted in E7, never fatal). |
| Desktop only | Confirmed by the TL: phones are out of scope (no phone layout). IT-7 is **not needed**. | – |


### v5.0.0 / solution 1.4 – variable appraisal periods, missed months, amendments, challenges removed (frontend 5.0.0, solution 1.4.0.0)

Upgrade from 4.5.0 / 1.3.0.2 in the order given in [`MIGRATION_1_4.md`](MIGRATION_1_4.md) (tenant-only checks T1–T11 there). The one-time test-data reset is in [`RESET_PROCEDURE.md`](RESET_PROCEDURE.md).

| Area | Design decision | Security / data notes |
|---|---|---|
| Appraisal periods | A period runs from the date the previous appraisal was **actually completed** (or a baseline *Appraisal period start* the TL sets in Settings → Team) to the next completion – any length (12, 15, 23 months …). A monthly review belongs to a period by its **month**: after the start's month, up to and including the completion month. The next appraisal due date is only the projection's end point; changing it never moves a review between periods. Reviews before the first period start form a closed "earlier period"; with no start set there is no forecast. Profile and appraisal report have a period selector (current + each past period). | History in `Technicians.AppraisalHistoryJson` (TL only, the source of truth). The boundaries are copied to each Monthly Review (`AppraisalBoundaries`) only so the technician's own view can group their reviews; the TL's views never read that copy. |
| Settings → Team | Per person: **Next appraisal**, **Days to go**, **Next wellbeing**, **Appraisal period start** (editable while there is no history), **Mark appraisal completed…** (actual completion date ≤ today and after the current start; a new next due date after the completion; confirmation dialog; a second completion in the same month replaces the first) and **Undo last**. Dates never move by themselves. | Writes only the Technicians item (and the display copies); every date write is read back and verified. |
| Missed months | *Closed – Not Submitted* and overdue *Open* months are excluded from averages, the expected outcome / forecast, the trend and the on-time denominator (**on time = on-time ÷ submitted**). A missed month neither extends nor breaks the on-time streak; a late one breaks it. Tiles and reports show "N rated reviews of M months · K missed". | Display only. |
| TL amendments | A released (Completed / Closed) review is **read-only** until the TL clicks **Amend…**; a submitted, not yet released review keeps normal feedback saving plus **Amend answers…** for the technician's answers. In amend mode nothing auto-saves. **Save amendment…** requires a reason and lists the changed fields. Save order: re-read *Modified* on both items (refuse if changed elsewhere) → create a **Draft** record in *1-to-1 Amendments* (before/after of the changed columns only) → write only the changed columns → set *NotifyStatus* = Pending. The review shows an **Amended (n)** card to the TL only. *Needs your attention* lists failed or stuck emails (**Resend** → Retry) and unfinished Drafts (**Send notice**, or **Dismiss** → Cancelled). Replaces the old "edit in SharePoint and write the reason in `CorrectionLog`" process. | *1-to-1 Amendments* is Owners only and versioned; who and when are SharePoint's Created By / Created, never set by the page. Tamper-**evident**, not tamper-proof: site owners and admins can always edit a list they own. The E16 email is an independent record. Technicians never see the reason or before/after values. |
| Flow 8 *Amendment notice* | New; arrives **Off** at import. For a Pending (or Retry) record it re-reads the item, sends **E16** to the technician (the month and a link only – no content, no reason), marks it *Sent*; on failure marks it *Failed* and sends the TL a short notice. One run at a time, so one email per amendment; its own updates never start it again. | Secured run history like the other flows. |
| Flow 2 / Flow 1 | Flow 2 cancels when the editor is the TL and the Manager Review is no longer Open – an amendment is **not** a resubmission (no E3, no new stamp, no permission change). Flow 1 reports any submitted review Flow 2 never processed (E7). | Needs Flow 2's trigger to carry **Editor** (tenant check T3). |
| Wellbeing date | The next wellbeing assessment due date is `Technicians.NextWellbeingDate`, set in Settings → Team. Completing an assessment requires the TL to **confirm or set** the next date (must be after today) – never automatic, never invented. *Needs your attention* can suggest the date from the last assessment ("Use it"), applied only when the TL clicks it. | – |
| Reminders | Flow 1: **E12** (wellbeing) now from `NextWellbeingDate`, and new **E17** (appraisal) from `AppraisalDate`: 7 days before, on the day, then weekly while overdue, active people only. | Emails to the TL only, no content. |
| Expectations | **No limit of 10** (any number; a warning above 30 on one review because of the note column's size). Shared always come before Individual (Flow 1 orders AppliesTo desc, SortOrder asc); SortOrder is within each group and new items go to the end of their group. The expectation year is the **first** appraisal year it applies to and it carries on until retired (it no longer disappears in April); a later year stays hidden until it starts; a mistyped year is ignored safely. The page has a Shared card and one card per technician. Retired expectations can be **Delete permanently** (TL only, confirmation, site recycle bin for about 93 days; past reviews keep their own copies). | The only page delete is `recycle()` on a retired expectation; technicians' permission levels have no Delete (tenant check T5). |
| Challenges removed | The whole v4.5 / 1.3 challenge system (1-to-1 Challenges list, Flow 7, E14 / E15, all UI) is removed. Data is **kept**: Setup 1.4 removes the technicians group from the Challenges list, makes its items Owners-only and closes open challenges as *Not agreed*. Flow 7 is not in the 1.4 solution; an unmanaged import doesn't delete it, so the TL turns it off and deletes it after approval. | No technician access to the old records. The `Challenge…` columns on Manager Reviews stay, unused. |
| Screen clean-up | Profile: *Workload by month* and *Energy by month* charts removed. Team overview: *Expected appraisal outcomes* and the *Workload this month* chart switcher removed; *Needs your attention* takes the full width. "Today dd-MMM-yyyy" removed from the title bar. The feedback bubble is a compact pill with a visible **Feedback** label. | Display only. |
| Reset tool | One-time, temporary: `02-frontend/reset/one-to-one-reset.html` + `.js`, Welcome layout **ESG 1-to-1 reset tool**. Inventory → JSON backup → dry run → typed confirmation (Flow 1 off) → recycle bin → verify and report. | Never touches Technicians, Settings, permissions, groups or flows; refuses any other list; technicians have no Delete. Removed after use. |
| Lists and flows | Eight lists: Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, 1-to-1 Settings, Wellbeing Assessments, 1-to-1 Feedback, **1-to-1 Amendments**. Flows: 0 Setup, 1–6, **8** (no 7). ZIP `04-solution/ESGOneToOne_1_4_0_0_unmanaged.zip`. | All 1.4 writes to columns added after their list was created use REST MERGE (tenant check T1). |

## H. Testing

**How to record results.** For each test, record Pass or Fail, the date, the tester and a screenshot.

**How to run the P (privacy) tests**

- **Mandatory (release-blocking):** every F test, and every P test marked 🔒. Any failure stops progression.
- **Informational:** tests that record a fact rather than check a requirement, such as whether *Modified By* can be forged (P9, first part). **If an informational result reveals an exploitable weakness, it blocks progression just like a mandatory failure** until it's fixed, or formally accepted by the TL and recorded in J.3.
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
| F1 | A opens the E1 link | The page opens on A's current review, showing the deadline |
| F2 | A fills Q1–Q3, clicks **Save draft**, closes the browser and reopens the link | All answers are present, and the status is Draft |
| F3 | A answers **No** to Q4, Q5 and Q6, then submits | Submits. Detail fields are empty in the list. |
| F4 | Check Q3 in the list after saving | The number 1–5 is stored. The TL's manager review shows it. |
| F5 | New month created with expectations loaded | A has the shared and individual expectations. B has the shared ones only. |
| F6 | Check the snapshot on A's Manager Review | It matches the master list at creation time |
| F7 | After A submits, the TL edits a shared expectation's title | A's past review (both the technician and TL views) shows the **old** text. Next month shows the new text. |
| F8 | A submits, waits 5 minutes, then reopens | Read-only. "Submitted" is shown. The TL gets E3. |
| F9 | The TL enters feedback on Q4 where the answer is No, and saves | Saves. Shown to A after release. |
| F10 | The TL saves feedback but doesn't complete. A reopens the review. | **No** feedback is visible |
| F11 | The TL clicks Complete | Within about 5 minutes A gets E4, the feedback is visible, and A can't edit anything |
| F12 | The TL clicks Complete on a review that is still Open (by forcing it in SharePoint) | Flow 3 rejects it, the state returns to Open, and the TL gets an email |
| F13 | Run Flow 1 three times on the same day | Exactly one review per technician, and one E1 each |
| F14 | A submitted, B in draft. `varTestDate` = this month's 20th. Run Flow 1. | Only B receives E2 |
| F15 | `varTestDate` = next month's 1st. Run Flow 1. | B's old review shows **Overdue** in Monthly reviews and in the *Overdue* view. B can still open and submit it, and it's marked "(late)". |
| F16 | After the deadline, the TL clicks **Close – not submitted** on another open review | It becomes read-only to the technician, who gets E5 |
| F17 | A chooses "Arrange a dedicated 1-to-1" | E3's subject is prefixed **[1-to-1 REQUESTED]**. The Team overview tile counts it and the **Team ▾** menu flags A with a red dot. A TL override replaces it. |
| F18 | Repeat F1, F2, F8 and F11 using **only** the Test A account (no TL shortcuts) | All pass |
| F19 | `varTestDate` = `2028-02-01T07:00:00` (test month only) | Manager Review DueDate = `2028-02-29T23:59:59Z` |
| F20 | `varTestDate` = `2027-03-01T07:00:00`, then `2026-10-01T07:00:00` | DueDate = `2027-03-31T22:59:59Z` (BST) and `2026-10-31T23:59:59Z` (GMT) |
| F21 | Temporarily set `varEditId` to `999`. Create a fresh test month and run. | Items are created, but **no E1 is sent**. The TL gets E7, and the technician can't see the item. Restore the value and run again: E1 is sent. |
| F22 | A completes a draft on a standard laptop screen (1366 px wide) at 100% zoom | Everything is usable without sideways scrolling |
| F23 (1.4) | **Amendment.** The TL opens A's released review → **Amend…** → changes one feedback field and one of A's answers → **Save amendment…**, first with no reason, then with one | Before Amend the review is read-only and nothing auto-saves. Without a reason it refuses; the dialog lists the changed fields. Then: one *1-to-1 Amendments* item (reason, before/after of the two columns only, Created By = the TL) → *Sent*; A gets **E16** (month and link only) within about 5 minutes; no E3; Flow 2's run is *Cancelled*; the review shows **Amended (1)** to the TL only; A sees the new values. |
| F24 (v4) | The TL adds **three** action rows to A's review. One is missing its close-out criteria. The TL clicks **Complete & release**. | Blocked, with a message naming the missing field. After the TL fills it in, Complete works. In Manager Reviews, `ActionsJson` holds three rows, `ActionsStatus` = Open, and `NextActionDue` = the earliest deadline. |
| F25 (v4) | After release, the TL closes one action on the **Actions** page | The action moves to Done with today's date. A sees it closed. The list view *Open actions* updates. |
| F26 (v4) | The TL rates A's expectations 1–5 and saves without completing | A's **My appraisal** still uses A's self-ratings only. After Complete, A's outlook uses the TL ratings for that month. |
| F27 (v4) | ⚙ Settings: set A's appraisal date to a date in the BST period, for example `15-Jul-2027`, and save | Technicians.AppraisalDate and A's current Monthly Review AppraisalDate both show 15/07/2027. Reopening Settings shows `15-Jul-2027` (not the 14th). A's My appraisal shows the same date. |
| F28 (v4) | ⚙ Settings: change the *Met* threshold, then save | The 1-to-1 Settings `Bands` item updates. **A's** outlook uses the new thresholds. |
| F29 (v4) | Expectations page: add an Individual expectation for A, edit a Shared one, retire one | List items are created or changed (retired = Active No, not deleted). The next month's snapshot reflects them, and past months don't change. |
| F30 (v4) | Appraisal report as the TL (for A) and as A, then **Print / Save as PDF** | 8 sections. **No Q4 wellbeing text.** A's report shows TL content only from released months. The print window opens (allow pop-ups if asked). |
| F31 (v4.2) | ⚙ Settings → Team: type A's appraisal date as `5/11/2027`, save, reload; then pick a date with 📅 | Shows **05-Nov-2027** (5 November) after reload, and the picked date is kept. No "unsaved changes" prompt when you then change tab. |
| F32 (v4.2) | ⚙ Settings → Team → + Add a person: add a third test account, then Deactivate it | Technicians item created / Active = No. Within about 5 minutes Flow 4 adds / removes them in `1-to-1 Technicians` and emails you (E8). |
| F33 (v4.2) | ⚙ Settings → Names: Manager role = *Line Manager*, member role = *Engineer(s)*; check as TL and as A | Both pages use the new words; nothing else changes. Reset afterwards. |
| F34 (v4.2) | ⚙ Settings → Reminders: set a day = today; run Flow 1 | Only people who haven't submitted get E2. Set it back to 20 and 27. |
| F35 (v4.2) | Expectations: drag the 4th shared expectation to the top; add an individual one | List order changes; next month's snapshot follows it; the new individual one appears after the shared ones. |
| F36 (v4.2, changed in 5.0.0) | Team overview | No chart switcher, *Expected appraisal outcomes* or *Workload this month*; *Needs your attention* is full width and lists waiting reviews, overdue actions, wellbeing items, and people with no period start or next wellbeing date. |
| F37 (v4.2) | Wellbeing: TL starts one for A | A gets E9 within about 5 minutes; the item's *Manage access* shows Owners + A (1-to-1 Edit) only. |
| F38 (v4.2) | A completes every step and submits | Flow 5 locks it (A: 1-to-1 Read), stamps SubmittedOn, TL gets E10. A sees it read-only. |
| F39 (v4.2, changed in 1.4) | TL adds an arrangement and notes, then **Complete** | Complete asks the TL to confirm or set the **Next wellbeing assessment** (it must be after today; nothing is set silently). A gets E11 and sees the agreed record; Print shows the form with signature lines; Settings → Team shows the chosen date. |
| F40 (v4.2, changed in 1.4) | Settings → Team: set A's **Next wellbeing** to 7 days ahead; run Flow 1. Then with `varTestDate` on that day, and 7 days after it. | TL gets **E12** 7 days before, on the day and weekly while overdue, with a link; nothing goes to A. |
| F41 (v4.3) | As A: 💬 **Feedback** → Fault → type a message → **Send** | "Thank you. Your feedback has been submitted to your Team Leader." Within about 5 minutes the TL gets E13 naming A, the page and the version; the item in *1-to-1 Feedback* is Owners-only and *Sent*. |
| F42 (v4.3) | Turn Flow 6 **off**, send feedback as A, wait an hour (or turn Flow 6 on with the email connection broken) | The TL sees "Feedback from A … – read it here" in *Needs your attention*, can read it and **Mark as read**. |
| F43 (v4.4) | As A: type an answer, wait about 5 s, reload | Top shows *Saved hh:mm*; the answer is kept; the review is still a Draft (no submission email). |
| F44 (v4.4) | Month two (test date next month): open A's new form | **Since last time** lists last month's raised items, your released replies and A's actions. Before you release, it says *Feedback not released yet*. |
| F45 (v4.5) | As A: open a new form, answer one required question, leave the rest, press **Submit**; then answer them one by one. Repeat on the wellbeing form; as the TL, leave an action row's criteria empty and save. | Unanswered required questions (including Yes/No and rating buttons) have an orange border; Submit turns them red and jumps to the first; each clears as it's answered. Optional questions are never marked. Wellbeing: Submit jumps to the first unanswered step and its pill turns red. TL: the empty action / criteria / deadline is marked red and the save is blocked. |
| F46 (v4.5) | As A: rate expectations, then (after release) open the outlook, *My appraisal*, the charts and the appraisal report. Change a band threshold in ⚙ Settings and reload. | A sees **words only**: rating buttons *Not started … Fully met*, a band chip and coloured bar, trend *Improving / Steady / Dipping / Too early to tell*, band-labelled chart axis and tooltips – no numeric rating or score anywhere. The TL's screens still show the numbers. The coloured bar follows the new thresholds. |
| F47 (v4.5) | With at least two released months for A, open A's outlook, *My appraisal*, A's profile (as the TL) and report section 1 | *To move up to <next band>, focus on:* the three expectations with the lowest average rating over the period (TL rating once released, otherwise self). In the top band: *Keep it up*. The TL sees the averages in brackets. Report section 1 is *Areas to focus on*. |
| F48 (1.4; replaces the v4.5 challenge round trip) | **Challenges retired.** After Setup 1.4 on a site upgraded from 1.3 | *1-to-1 Challenges* (if present) shows Owners – Full Control only; any challenge that was open is *Not agreed*; no ⚑ Challenge anywhere on the page; *7 Challenge* is Off (then deleted after approval). |
| F49 (1.4) | **Periods.** Settings → Team: set A's **Appraisal period start**; then **Mark appraisal completed…** (a completion date ≤ today, a new next due date) → confirm; then **Undo last**, and complete again | A new period starts with only its own reviews; profile and report offer the previous period in the period selector; the completion month belongs to the period it ends. Undo restores the previous state. A completion date in the future, before the current start, or a next due date not after the completion is refused. |
| F50 (1.4) | **Next appraisal moved.** Change A's Next appraisal to a later date, then an earlier one | Days to go and the forecast end point change; **no review moves between periods**. |
| F51 (1.4) | **Missed months.** With one month *Closed – Not Submitted* and one late submission for A | Profile tiles and report: "N rated reviews of M months · 1 missed"; averages, forecast and trend ignore the missed month; on time is out of submitted reviews; the late month breaks the streak, the missed one doesn't. |
| F52 (1.4) | **Appraisal reminders.** Settings → Team: A's Next appraisal 7 days ahead; run Flow 1, then with `varTestDate` on the day and 7 days after | TL gets **E17** each time (7 days before, on the day, weekly while overdue); nothing goes to A. |
| F53 (1.4) | **Expectations, no limit.** Have 12 active Shared and 1 Individual for A; enter one for the current year and one for next year; create next month (`varTestDate`) | A's new form has all 12 Shared, then the Individual one; the current-year one carries on into next April; next year's appears only from then. |
| F54 (1.4) | **Delete permanently.** Retire a test expectation, then **Delete permanently** | Offered only on retired items, asks for confirmation; the item is in **Site contents → Recycle bin**; past reviews still show their copy. |
| F55 (1.4) | **Amend answers on a submitted review.** Before releasing A's submitted review: **Amend answers…**; meanwhile change the review in another tab and save there; then retry | The first save is refused (*changed elsewhere – reload*); after reloading it saves; normal *Save feedback* still works on a submitted review. |
| F56 (1.4) | **Amendment notice failures.** Turn Flow 8 off, amend a review, wait an hour; then turn it on and **Resend** | *Needs your attention* shows the unsent email; Resend → *Retry* → one E16 → *Sent*. A Draft left by an interrupted save shows **Send notice** / **Dismiss** (Dismiss → *Cancelled*, no email). |

### Privacy and bypass tests

| # | Attempt by Test A | Request | Expected |
|---|---|---|---|
| P1 🔒 | Open B's review in the frontend | Page link with `?reviewId={B}` | "Not found or isn't yours" |
| P2 🔒 | List all reviews | GET `_api/web/lists/getbytitle('Monthly%20Reviews')/items?$select=ID,Title`, and browse to `/Lists/MonthlyReviews/AllItems.aspx` | Only A's own items |
| P3 🔒 | Edit B's review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/items({B})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"Q1WentWell","FieldValue":"tamper"}],"bNewDocumentUpdate":false}` | Denied. B's item is unchanged. |
| P4 🔒 | Create a fake review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/AddValidateUpdateItemUsingPath`, body `{"listItemCreateInfo":{"FolderPath":{"DecodedUrl":"/sites/ESG-1to1/Lists/MonthlyReviews"},"UnderlyingObjectType":0},"formValues":[{"FieldName":"Title","FieldValue":"fake"}],"bNewDocumentUpdate":false}` | Denied. No new item. |
| P5 🔒 | Read feedback before release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items?$select=ID,FB_Q1` | Denied or empty |
| P6 🔒 | Read earlier drafts after release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items({MA})/versions` | Denied. As the TL, the same request lists versions. |
| P7 🔒 | Read the roster and other technicians' expectations | GET `_api/web/lists/getbytitle('Technicians')/items` and `…getbytitle('Appraisal%20Expectations')/items` | Denied |
| P8 🔒 | Edit own submitted review | As P3, but on `{A}` after submission | Denied, and unchanged |
| P9 🔒 | Forge *Modified By* to dodge the lock | On A's **draft**: POST `…items({A})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"ReviewStatus","FieldValue":"Submitted"},{"FieldName":"Editor","FieldValue":"[{'Key':'i:0#.f\|membership\|<TL email>'}]"}],"bNewDocumentUpdate":true}` | Note whether *Modified By* shows the TL; this goes in the security record. Within about 10 minutes the item **is locked anyway** (P8 passes). |
| P10 🔒 | Tamper with own draft | On a fresh draft: one `validateUpdateListItem` with DueDate `2099-12-31T00:00:00Z`, Technician `[{'Key':'i:0#.f\|membership\|<TestB email>'}]`, ReviewStatus `Completed`, and ExpectationsJson with a changed title | Within about 10 minutes: A's item is read-only, and its status shows *Submitted*. The Manager Review is *Submitted*, with SubmittedLate correct against the **real** due date. **B can't see A's item** (B runs P2). The TL screen shows the **original** expectation titles. |
| P11 🔒 | Grant access or share own item | POST `…items({A})/roleassignments/addroleassignment(principalid=<any number>,roledefid=1073741826)`. In the SharePoint UI, use **Share** on A's item. | Both denied |
| P12 🔒 | Delete own draft | POST `…items({A})/recycle()`. In the SharePoint UI, use **Delete**. | Denied. The item is still there. |
| P13 🔒 | Reach the TL's data through the frontend | A opens `OneToOne.aspx` with no `reviewId`, then with `?reviewId={B}` | Lands on own review, or "Review not found". The menu bar never shows TL items, because the role comes from SharePoint permissions. Even if the TL view were forced, every figure would come only from A's own items. |
| P14 🔒 | Rest of the site and search | A opens **Site contents**, `/Lists/MonthlyReviews/AllItems.aspx`, Site Pages and Site Assets, then searches Microsoft 365 for a phrase from B's answers | Access denied (or only A's own item in the list view), and no search results |
| P15 🔒 | **Script injection (XSS).** This is the attack that matters most for v3. | A types each of these into **every** text field (Q1, Q2 ×4, Q3 comment, Q4–Q6 details, Q7, every Q8 comment, Win of the month), saves, and submits: `<img src=x onerror=alert('A1')>` · `<script>alert('A2')</script>` · `"><svg onload=alert('A3')>` · `{{constructor.constructor('alert(4)')()}}` · `javascript:alert('A5')`. The TL then puts the same strings into every feedback field, the action rows (action, owner, criteria) and an expectation title, and completes the review. | When the TL opens Team overview, Monthly reviews, A's review, Actions, Expectations, A's profile and A's report, and when A opens the released review, My appraisal and their report: every string is shown **as plain text**. **No alert box ever appears**, no new link appears, and the browser console (F12) shows no errors from the layout. |
| P16 🔒 | **Code integrity** | In the UI, A tries to **Edit** `OneToOne.aspx` and to upload or replace a file in *Welcome Web Part - Custom Layouts*. Through the API: POST `_api/web/getfolderbyserverrelativeurl('<library server-relative URL>')/files/add(url='one-to-one.js',overwrite=true)` | Every attempt is denied. The library's version history shows only the TL. |
| P18 🔒 (v4) | **Settings list is read-only** | POST `_api/web/lists/getbytitle('1-to-1%20Settings')/items(1)/validateUpdateListItem`, body `{"formValues":[{"FieldName":"Value","FieldValue":"[]"}],"bNewDocumentUpdate":false}`. Also try `AddValidateUpdateItemUsingPath` on the same list. | Both denied. GET on the list succeeds (Read). |
| P19 🔒 (v4) | **TL ratings and actions** | Before release: GET `…getbytitle('Manager%20Reviews')/items?$select=ExpectationFeedbackJson,ActionsJson`. After release: POST `…items({MA})/validateUpdateListItem` setting `ActionsJson` to `[]`. | Before release: empty. After release: the write is denied and the data is unchanged. |
| P20 🔒 (v4) | **Appraisal date tampering** | On A's **draft**, write `AppraisalDate` = `01/01/2030` through `validateUpdateListItem` | Allowed (it's A's own display copy), but **only A's own view** changes. The TL's outlook and ⚙ Settings still show the Technicians list date. |
| P21 🔒 (v4.2) | **Read someone else's wellbeing** | B: GET `…getbytitle('Wellbeing%20Assessments')/items`, and `items({A's wellbeing id})`; open `?wbId={A's id}` | Only B's own items; A's item 404 / "not found". |
| P22 🔒 (v4.2) | **Forge the manager's part** | A, on their own *open* assessment: one `validateUpdateListItem` setting AssessmentStatus = Completed, ArrangementsJson, ManagerNotes, NextReviewDate, CompletedOn and Technician = B | Within about 5 minutes Flow 5 treats it as a submission: A is set to Read, status Submitted, the TL fields and CompletedOn are **cleared**, Technician is restored to A, B gains nothing. |
| P23 🔒 (v4.2) | **Change after submitting** | A: write to their submitted assessment | Denied (403). |
| P24 🔒 (v4.2) | **Join the group / see the roster** | A: GET `…getbytitle('Technicians')/items`; POST `_api/web/sitegroups(<id>)/users` | Both denied. (Only Flow 4, as the TL, changes the group.) |
| P25 🔒 (v4.3) | **Read someone else's feedback, or your own after sending** | B: GET `…getbytitle('1-to-1 Feedback')/items` after A sent one; A: the same once Flow 6 has run | B gets none of A's items; A gets nothing back once it's locked. |
| P26 🔒 (v4.4) | **Send feedback as someone else** | A: POST `…getbytitle('1-to-1 Feedback')/AddValidateUpdateItemUsingPath` with form values `Author` / `Editor` set to B | The item is recorded as A (Author/Editor ignored or rejected). If SharePoint accepts the change, record it here: the E13 sender is then "as recorded", and the TL should confirm unexpected feedback in person. |
| P27 🔒 (v4.4) | **Get alerted to others' feedback** | B: try *Alert me* on 1-to-1 Feedback, and POST `…/alerts/add` | Denied – `1-to-1 Submit` has no Create Alerts. |
| P28 🔒 (v4.4) | **List metadata / change log** | B: GET `…getbytitle('Wellbeing Assessments')?$select=ItemCount,LastItemUserModifiedDate`; POST `…/GetChanges` on Wellbeing Assessments and 1-to-1 Feedback | Denied, or reveals nothing personal. If dates/counts are visible, record it as an accepted risk (no content is exposed). |
| P29 🔒 (1.4; replaces the v4.5 challenge-forgery test) | **Read the restricted audit or the retired challenges** | A: GET `…getbytitle('1-to-1%20Amendments')/items` and open `/Lists/OneToOneAmendments`; GET `…getbytitle('1-to-1%20Challenges')/items` | Denied / not found. A never sees a reason or before/after value (tenant checks T7, T8). |
| P30 🔒 (1.4) | **Forge an amendment or delete** | A: POST `…getbytitle('1-to-1%20Amendments')/AddValidateUpdateItemUsingPath` with `NotifyStatus` = `Pending` and `Technician` = B; POST `…getbytitle('Appraisal%20Expectations')/items(<id>)/recycle()` | Both denied (403 / not found); no E16 is sent to B; nothing is deleted (tenant check T5). |
| P17 🔒 | **No data leaves the tenant** | As the TL, open each view with F12 → **Network** recording (ask IT if developer tools are blocked) | Every request carrying list data goes to `<tenant>.sharepoint.com`. Record any other host contacted (for example the web part's own code CDN) for IT-11. None of them may receive review content. |

---

## I. Delivery estimate

These are hands-on hours for a first-time builder following section G. Calendar time is driven mainly by IT and HR answers.

| Stage | Manual configuration (TL) | Testing | Depends on IT / HR |
|---|---|---|---|
| Confirmations | 0.5 h (send the questions) | — | IT-1 to IT-13, HR-1 to HR-5 |
| 0 — Proof test (Parts 1–5) | 3.5–4.5 h (site, levels, lists, IDs, group, page, probe) | 1–2 h | IT-1, IT-2, IT-4, IT-6, **IT-10, IT-12** |
| 1 — MVP (Parts 6–9) | 5–7 h (Flow 1: 2–3 h, frontend install: 1–2 h, Flows 2 and 3: 2 h) | 3–4 h | IT-3, IT-13 |
| 2 — Automation (Part 10) | 0.5 h | 1.5 h | — |
| 3 — Expectations (Part 11) | 1 h | 1 h | — |
| 4 — Verification (Part 12) | 1 h | 5–6 h (adds P15–P17), plus the first live month | HR-2 and IT-11 before any real data |
| Fix-and-transfer rounds | 2–4 h (allow 2–3 rounds of frontend corrections found in tenant testing, each re-transferred and re-uploaded) | included above | approved transfer route |
| **Total** | **≈ 14–20 h** | **≈ 12–15 h** | |

That's **about 26–35 hours hands-on**. That's similar to v2: less clicking in Power Apps Studio, but more testing and the correction rounds.

**Claude's preparation is complete (v4).** The frontend (about 1,800 lines), local mock and tests, list checklist, flow sheets, email templates and configuration reference are produced. Remaining Claude work is only fixes found during tenant testing. Generating files is not deployment: nothing is live until Part 12 is done and every test in H passes.

v4 reduces Part 7 to about 30 minutes, because there is no CONFIG to edit. Allow about 1 h more in Part 9 and Part 12 for tests F24–F30 and P18–P20.

---

## J. Blockers, confirmations and residual risks

### J.1 Confirm with IT (blocking unless marked otherwise)

| # | Question | If the answer is "no" |
|---|---|---|
| IT-1 | Can the TL create a **communication site** and be its **sole owner**? Does governance require two owners? | Ask IT to create the site. If two owners are mandatory, choose the second with HR (this affects D4). |
| IT-2 | Does the DLP policy for the chosen environment allow **SharePoint, including the action "Send an HTTP request to SharePoint"**, **Office 365 Outlook** and **Office 365 Users**, all in the same data group? | **Fallback:** replace SETPERM with the SharePoint actions **Stop sharing an item or a file** and **Grant access to an item or a folder**. This only offers *Can view* and *Can edit*, so the no-delete and no-version-history protections are lost. P6 and P12 become accepted risks that HR must agree to. Ask for the HTTP action first. |
| IT-3 | Which **Power Platform environment** should hold the flows? (The frontend no longer uses Power Apps.) | Build the flows in the environment IT names |
| IT-4 | May site owners create **custom permission levels**? | Ask IT to create the two levels. Using the built-in Read and Contribute would reintroduce defect S3 (version history) and allow deletions. |
| IT-5 | Do technicians have **SharePoint Online**, and does the TL have **Power Automate** standard rights? Technicians **no longer need Power Apps**. | Licence change for anyone missing SharePoint |
| IT-6 | Can you have **two test accounts** with mailboxes, allowed to create a personal flow (for the API tests)? | Privacy can't be proven without them. Don't go live. |
| IT-7 | ~~Does **Conditional Access** allow SharePoint pages on work phones?~~ **Not needed (v4.5):** desktop only, confirmed by the TL – phones are out of scope. | – |
| IT-8 | Is there a **sensitivity label** for HR or confidential sites, and is external sharing off for new sites? (Not blocking.) | Apply what's available |
| IT-9 | (Information) Acknowledge that tenant administrators can technically access the data | Wording for the privacy notice |
| IT-10 | Is **Welcome by Accelerator 365** licensed and installed in the tenant? May it be added to this private site? Is it a current release (custom layouts with script support date from 2024–2025)? Will IT or Reply confirm that a custom layout can run **JavaScript that reads and writes SharePoint lists**? | Fallback (E.0): an SPFx web part deployed by an admin, or the v2 canvas app |
| IT-11 | **Vendor data assurance:** does the Welcome web part send any page content, list data or user data to Reply or any third party, including licence checks and telemetry? | Keep all extras off and rely on P17. If assurance can't be given, use a fallback. |
| IT-12 | **Content Security Policy and custom script:** will a script loaded by Welcome from the site's own library run under the tenant's SharePoint CSP? If a trusted-script-source entry is needed, can IT add it? | Stage 0 answers this in practice. If it's blocked and IT won't allow it, use a fallback. |
| IT-13 | Does corporate policy require **approval or a code review** before custom JavaScript runs on a SharePoint page? | Submit `frontend-security-notes.md` (K11) and the code for review |

### J.2 Confirm with HR / Data Protection

| # | Question |
|---|---|
| HR-1 | **Retention period** (D3) and whether a **Purview retention label** exists |
| HR-2 | Is a **DPIA screening** needed? Approve the **technician privacy notice** (artefact K8) **before any real data is entered**. |
| HR-3 | Approve the **Q4 wellbeing wording**. v4 shows no EAP / Occupational Health text in the form. |
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
| R7 | Renaming lists or columns breaks the frontend and flows | A "do not rename" list goes in the configuration reference |
| R8 | A Welcome update changes how custom layouts run scripts, and the frontend stops working | Data and permissions are unaffected, and the TL can still work in the lists directly. Check Welcome's release notes. The fallbacks in E.0 remain available. |
| R9 | About 1,800 lines of custom code, owned by the TL | Plain JavaScript with no dependencies, commented, with a local mock and automated tests (K10). Changes go through Claude and the approved transfer route. |
| R10 | A coding mistake can't bypass SharePoint permissions, but an injection bug would act **as the viewer**, including the TL | Code rules S1–S7 (E.4), an automated attack-string test (K10), release-blocking P15 |
| R11 (v4) | The expected appraisal outcome could be read as a decision | Labelled as a guide everywhere. The method is shown to the TL. The TL's judgement decides. Wellbeing is never included. |
| R12 (v4) | A technician can see the band thresholds (Settings list Read) | Not personal data, and needed so their outlook matches the TL's |
| R13 (v4.1) | Technicians can see who else is in `1-to-1 Technicians` | SharePoint has no owner-only visibility; membership reveals names only, no review data |
| R14 (v4.1) | A submission made in the same 5-minute polling window as the TL's *Close – not submitted* ends up Closed | Closing is only possible after the deadline. The answers are kept and the TL can correct it (as R5). The TL view shows *Submitted – processing* while Flow 2 hasn't run yet. |
| R15 (v4.1) | Saving ⚙ Settings writes the appraisal date onto a submitted current review, which re-runs Flow 2 | Flow 2 only re-applies Read, so nothing changes (harmless extra run) |
| R17 (v4.2) | Before Flow 5's first lock (≤ 5 min after submitting), the TL screen could show a person's own "Submitted" stamp | Complete is only offered for a submitted assessment; if anything was forged, Flow 5 re-locks it and wipes the TL fields (P22), and the TL simply re-enters them. |
| R18 (v4.2) | Wellbeing data is health-related (special category) | Separate list, item-level permissions per person, never in reports/charts, secure run history, 24-month retention (CONFIG_REFERENCE §4). Confirm with HR/IT that this matches the paper form's handling. |
| R19 (v4.2) | Adding someone in Settings depends on Flow 4 running | Settings says access follows within about 5 minutes; E8 confirms each change; troubleshooting row in CONFIG_REFERENCE §6. |
| R20 (1.4) | Site owners and site collection admins can edit the *1-to-1 Amendments* audit | Tamper-evident: versioning (100) keeps every change; the E16 email to the technician is an independent record; Owners stays the TL only (quarterly check). |
| R21 (1.4) | Flow 7 and the retired *1-to-1 Challenges* list stay in the environment until the TL deletes them | Flow 7 is turned off before the import; the list is Owners-only with open items closed; deletion is a separate, approved step (MIGRATION_1_4 step 10). |
| R16 (v4.1) | `validateUpdateListItem` might read dd/MM/yyyy using the TL's *personal* regional settings rather than the site's | Tenant test F27 checks the round trip. If it fails, set your personal region to English (UK). |

---

## K. Artefacts

All of these are text, contain **no tenant names, credentials or personal data**, and are ready to transfer through an approved company process.

| # | File | Status |
|---|---|---|
| K0 / K0B | `02-frontend/probe/` | **Produced and run.** Stage 0A and 0B passed. |
| K1 | [`01-sharepoint/lists.md`](01-sharepoint/lists.md) + [`lists.csv`](01-sharepoint/lists.csv) | **Produced (v4)** |
| K2 | Site security tick-list | Covered by G Parts 1–2 and D.6, plus the quarterly check in CONFIG_REFERENCE §4 |
| K3 | [`02-frontend/one-to-one.html`](02-frontend/one-to-one.html) | **Produced (v5.0.0)** |
| K4 | [`02-frontend/one-to-one.js`](02-frontend/one-to-one.js) | **Produced (v5.0.0)** |
| K4a | [`02-frontend/reset/`](02-frontend/reset/) | **Produced (1.0.0, temporary):** one-time test-data reset tool, see [`RESET_PROCEDURE.md`](RESET_PROCEDURE.md) |
| K5 | [`03-flows/FLOW_BUILD_SHEETS.md`](03-flows/FLOW_BUILD_SHEETS.md) | **Produced (v4)**: Flows 1–3, SETPERM, Ensure_user, Try/Catch |
| K5a | [`04-solution/ESGOneToOne_1_4_0_0_unmanaged.zip`](04-solution/IMPORT_GUIDE.md) | **Produced (1.4.0.0)**: importable solution with setup flow + Flows 1–6 and 8, connection references, environment variables; legacy-package builder; source, validator and simulation in [`04-solution/tools/`](04-solution/README.md) |
| K6 | [`03-flows/EMAIL_TEMPLATES.md`](03-flows/EMAIL_TEMPLATES.md) | **Produced (1.4)**: E1–E5, E7–E13, E16, E17 (there is no E6; E14 / E15 retired with challenges) |
| K7 | Test record | Use section H directly (F1–F56, P1–P30; in 1.4 F48 and P29 check that challenges are retired); add Pass/Fail, date, tester and screenshot columns |
| K8 | Privacy notice | **Not needed.** The TL decided it's handled between the TL and each technician. |
| K9 | [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) | **Produced (v4)** |
| K10 | [`02-frontend/mock/`](02-frontend/mock/), [`02-frontend/test/`](02-frontend/test/), [`02-frontend/tools/`](02-frontend/tools/) | **Produced.** 305 checks passing (plus 31 for the reset tool). |
| K11 | Frontend security notes for IT-13 | Section E.3–E.4 plus [`02-frontend/README.md`](02-frontend/README.md) (endpoints, rules, test evidence) |
| — | [`prototype/prototype.html`](prototype/prototype.html) | Design baseline (prototype v7) |

---

## Summary and next step

1. **Build approach (unchanged security model):**
   - A private SharePoint communication site with **eight lists**.
   - **Manager Reviews is the authoritative, tamper-proof record**, now holding TL ratings and multi-row actions. Monthly Reviews holds only the technician's answers. 1-to-1 Settings holds the band thresholds.
   - Custom permission levels, applied per item by standard-connector flows (Flows 1–3 for reviews; 5 and 6 for wellbeing and feedback). Flow 8 sends amendment notices; amendments are audited in the Owners-only *1-to-1 Amendments* list.
   - A desktop frontend with a top menu bar, in the **Welcome by Accelerator 365** web part on `OneToOne.aspx`.
2. **Status:** Stage 0A and 0B passed. All build files are produced and tested locally.
3. **Next (the TL, in the tenant), following [`GO_LIVE_RUNBOOK.md`](GO_LIVE_RUNBOOK.md):**
   1. Import the solution and run the setup flow (creates the eight lists).
   2. After the Setup summary email, turn on Flows 2, 3, 4, 5, 6, 8, then 1 last (upgrading from 1.3: follow [`MIGRATION_1_4.md`](MIGRATION_1_4.md)).
   3. Install the frontend.
   4. Set each person's next appraisal, next wellbeing and appraisal period start (⚙ Settings → Team).
   5. Load expectations.
   6. Run the tests in section H with Test A and Test B.
   7. Clean down and go live.
4. **If a tenant test fails**, the next Claude Code prompt:

   ```
   Tenant test <ID> failed. What I did: <steps>. What I saw: <message / screenshot text,
   redacted>. Browser console errors: <paste>. Fix one-to-one.js / the flow sheet as needed,
   re-run the local tests, commit and push to the current branch.
   ```
