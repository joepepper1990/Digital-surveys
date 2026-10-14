# ESG Monthly Technician 1-to-1 — Implementation Plan (v3)

**Status:** v3.2. **Current position and next actions:** [`NEXT_STEPS.md`](NEXT_STEPS.md). **Stage 0A is complete** (Welcome runs external JS; authenticated REST read/write confirmed; technician correctly limited). **Stage 0B security probe is built** ([`02-frontend/probe/README-stage0b.md`](02-frontend/probe/README-stage0b.md)) and awaits live testing. Stage 0 is split into **0A** (Welcome feasibility, artefacts in [`02-frontend/probe/`](02-frontend/probe/README.md)) and **0B** (security, prepared only after 0A passes). There are also explicit authorisation and workflow rules (D.7). The canvas app frontend is replaced by a custom HTML/CSS/JavaScript layout in **Welcome by Accelerator 365**. See *Changes in v3* below. The v1 → v2 changes are explained in [`PLAN_REVIEW.md`](PLAN_REVIEW.md). **Nothing has been built or deployed.**
**Scope:** 5–10 technicians, one Team Leader (TL), Environmental Safety Group, Dungeness B.

**Confirmed decisions**

| # | Decision |
|---|---|
| D1 | Flows run under the **TL's own account** |
| D2 | **Late submissions are accepted** and flagged late, and the TL may close a review that was never submitted |
| D3 | Retention period: **24 months** (confirmed). Reviews older than 24 months are deleted; mechanism per D.5. |
| D4 | **No backup owner**, subject to corporate governance |

The system has four lists, three flows, two custom permission levels, and one SharePoint page carrying a custom Welcome layout (the frontend). The flows use standard connectors only.

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
 ├─ Welcome Web Part - Custom Layouts   one-to-one.html + one-to-one.js (the frontend code; Owners edit, technicians read)
 └─ SitePages/OneToOne.aspx (home page) Welcome web part → custom layout. Technicians group: READ on this page only

FRONTEND (JavaScript in the page; SharePoint REST as the signed-in user)
 ├─ #tech   technician questionnaire, month picker for past reviews
 ├─ #dash   TL: KPIs, review table, outstanding actions
 └─ #mgr    TL: answers + feedback per section + complete / close

POWER AUTOMATE (TL connection; standard connectors)
 ├─ Flow 1  Daily 07:00 UK   create → protect → email; reminders 20th/27th; problem report
 ├─ Flow 2  Monthly Reviews changed to non-draft  → lock (tech READ), stamp authoritative record, notify TL
 └─ Flow 3  Manager Reviews set Completed/Closed  → lock + release feedback (tech READ), notify tech
```

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
| AS5 | **Correction process:** the TL corrects a submitted record directly in SharePoint, at the technician's request, and writes the reason in `CorrectionLog`. Version history is the audit trail. There's no in-app "reopen" in v1. |
| AS6 | **Agreed actions** are free text on the TL's record (one per line, with due dates), plus an *Open / Done* status and an earliest due date. |

---

## B. Scope and stages

| Stage | Build | Exit criterion |
|---|---|---|
| **0A — Feasibility (about 45 min)** | Site, the test list `ZZProbe0A`, the `OneToOne` page with Welcome, the technicians group, and the 0A probe ([README](02-frontend/probe/README.md)) | The script runs. As TL, authenticated REST read, digest and write all pass. As Test A, the page and script load and the test list shows nothing. **If this fails, stop and use a fallback from E.0.** |
| **0B — Security (only after 0A passes)** | Permission levels, two throwaway `ZZProbe` lists with item-level permissions, and a 0B probe | Every **mandatory** test passes (H): own records only, locked/protected/manager-only items not writable, no permission changes, sharing, creation or deletion, no version history, no access by guessing IDs, and attack strings displayed safely for both the TL and the technician |
| **1 — Functional MVP** | Flow 1 (creation and links), the full frontend (all 9 questions including Q8, plus the TL views), Flows 2 and 3 | Test A drafts, submits and is locked. The TL reviews and completes, and A sees the feedback. Test B sees nothing of A's at any point. |
| **2 — Monthly automation** | Flow 1 reminders and problem report. Schedule confirmed. | Date tests F13, F14, F19 and F20 pass |
| **3 — Appraisal tracking** | Real expectations loaded. Rollover procedure written down. | F5–F7 pass |
| **4 — Verification** | Dashboard view checked, **all privacy tests P1–P17**, clean-down, go-live | Every test in H passes |

Q8 is part of the frontend file from Stage 1, because separating it costs more than it saves. Stage 3 is about loading and testing real expectation data.

**Not in v1:** in-app reopen, an in-app expectations editor (the SharePoint list is enough), charts, auto-save, Teams notifications, a service account, and automated retention.

---

## C. SharePoint lists

### C.0 Rules for every list

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

- **Retention period:** **24 months** (confirmed). A review is deleted once its month is more than 24 months ago.
- **Purview label available:** apply it as the **default label** on Monthly Reviews and Manager Reviews.
- **No label:** the TL carries out a documented **annual April deletion**. Filter by MonthKey older than the retention period, delete, record the deletion in a dated note, then empty the site recycle bin and the second-stage recycle bin.
- **Leavers:** set Active = No in Technicians and keep their records for the retention period.
- **Subject access requests:** export the list views filtered by technician, using **Export → CSV**.

---

### D.6 Frontend hosting and code integrity (v3)

Technicians now need to open one SharePoint page. That's set up without making them site members:

| Step | Setting |
|---|---|
| Group | **Site permissions → Advanced → Create Group** named `1-to-1 Technicians`. Owner: the Owners group. Who can view membership: **Group Owner**, so technicians can't list each other. Who can edit membership: **Group Owner**. Allow requests to join: **No**. **Give the group no permission on the site itself** (untick everything on the create page). |
| Page | `SitePages/OneToOne.aspx` → **Manage access → Advanced → Stop inheriting** → grant `1-to-1 Technicians` **Read**. That's this page only. The rest of Site Pages stays Owners only. |
| Layout library | `Welcome Web Part - Custom Layouts` → **Stop inheriting** → grant `1-to-1 Technicians` **Read**. It holds code only, never data. |
| Welcome configuration | Any list Welcome creates for its own settings (identified in Stage 0) gets **Read** for the group, and only if the page won't render without it |
| Welcome support list | `WMW_WMReplyWelcomeWebPartErrors` may need **Read** for the group: a non-owner unable to read it gets a blank frontend. It holds only diagnostic error text (no review data), so Read is low-risk; clear it periodically. Grant it only if a technician's page is blank. |
| Not granted | The four data lists (access stays item-level, set by the flows), the rest of Site Pages, Site Assets and every other library |

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
| Audit of corrections | `Manager Reviews.CorrectionLog` plus Manager Reviews versions. Monthly Reviews version history is not relied on. |

**Allowed state transitions.** Each is validated by the flow that performs it. Anything else is rejected: Flow 3 reverts it and emails the TL, and Flow 2 only re-applies Read.

| From → To | Performed by | Only if |
|---|---|---|
| Open → Submitted | Flow 2 | The changed item is the one recorded in `ReviewItemId`, and `ReviewState` = Open |
| Submitted → Completed | Flow 3, on the TL's command | `SubmittedOn` is set |
| Open → Closed - Not Submitted | Flow 3, on the TL's command | `SubmittedOn` is empty **and** `DueDate` has passed |

The dashboard and the TL review view take status **only** from `ReviewState`. `ReviewStatus` on Monthly Reviews is used only as a "draft started" hint, and as the technician's submit signal that Flow 2 re-validates.

**Accepted low risk:** a technician can trigger Flow 2 repeatedly by editing their own draft. Each run only re-applies permissions they already hold.

---

## E. Frontend specification (Welcome custom layout)

v3 replaces the canvas app with a custom HTML/CSS/JavaScript frontend. It runs inside the **Welcome by Accelerator 365** web part, as a *custom layout*. The SharePoint lists, permission model and flows are unchanged, apart from the email links (F.4).

### E.0 Feasibility gate (read this first)

According to Accelerator 365's own documentation, Welcome custom layouts are Handlebars HTML templates uploaded to a *Welcome Web Part - Custom Layouts* library. The release notes mention a "JavaScript context" (October 2025), a "script tag file" (September 2024) and support for SharePoint's Content Security Policy changes (February 2026).

**The documentation does not confirm that a layout can run general-purpose JavaScript that reads and writes SharePoint lists.** This frontend needs exactly that. Stage 0 (G Part 5) therefore includes a **probe layout** that must:

1. run a script
2. read the current user
3. read one list item
4. **write** one field
5. do all of this without being blocked by the tenant's Content Security Policy

**If the probe fails, don't build this frontend.** The fallbacks, in order of effort, are:

1. Package the same JavaScript as an **SPFx web part**. This needs a tenant admin to deploy it to the app catalog.
2. Revert to the **v2 canvas app** (git commit `16dd9c5`, section E of v2). The backend needs no changes either way.

### E.1 What gets built

| File | Where it goes | Contents |
|---|---|---|
| `one-to-one.html` | *Welcome Web Part - Custom Layouts* library on the 1-to-1 site | Welcome metadata block (all extra features **off**: no weather, search, time or greeting), the static page shell (headings, question text, empty containers), and CSS |
| `one-to-one.js` | Same library, loaded the way Welcome's custom layouts support (confirmed in Stage 0) | All behaviour. Plain modern JavaScript with **no libraries, no CDNs and no external calls**. Roughly 900 lines. |
| `OneToOne.aspx` | Site Pages, **set as the site home page** | One Welcome web part using the `one-to-one` layout |

There's **one page for everyone**. The script decides which view to show:

| Who | URL | View |
|---|---|---|
| Technician | `OneToOne.aspx?reviewId=123` | Their questionnaire (`#tech`) |
| TL | `OneToOne.aspx` | Dashboard (`#dash`) |
| TL | `OneToOne.aspx?reviewId=123` | Manager review (`#mgr`) |

Role detection compares the signed-in email with `CONFIG.managerEmail`. That's **routing only**. Every read and write still runs as the signed-in user, so SharePoint's permissions remain the only security boundary.

### E.2 Configuration (top of `one-to-one.js`)

```js
const CONFIG = {
  siteUrl: '<SITE URL>',                       // e.g. https://contoso.sharepoint.com/sites/ESG-1to1
  managerEmail: '<TL EMAIL>',                  // lower case
  lists: { reviews: 'Monthly Reviews', mgr: 'Manager Reviews', techs: 'Technicians' },
  eapText: '<EAP / Occupational Health contact text>'
};
```

The file contains no secrets. Technicians can read it, and that's fine.

### E.3 Data access: SharePoint REST, as the signed-in user

All calls are same-origin `fetch` requests to the site's `_api`, using the browser's existing SharePoint session. No tokens, app registrations or Graph permissions are needed.

```js
const H = { Accept: 'application/json;odata=nometadata' };

async function spGet(path) {                        // returns null when SharePoint denies or hides the data
  const r = await fetch(CONFIG.siteUrl + path, { headers: H, credentials: 'same-origin' });
  if (r.status === 401 || r.status === 403 || r.status === 404) return null;
  if (!r.ok) throw new Error('Read failed (' + r.status + ')');
  return r.json();
}

let _digest = { value: null, expires: 0 };
async function digest() {                            // request digest for writes, cached until expiry
  if (Date.now() < _digest.expires) return _digest.value;
  const r = await fetch(CONFIG.siteUrl + '/_api/contextinfo',
    { method: 'POST', headers: H, credentials: 'same-origin' });
  if (!r.ok) throw new Error('Could not start a save (' + r.status + ')');
  const j = await r.json();
  _digest = { value: j.FormDigestValue, expires: Date.now() + (j.FormDigestTimeoutSeconds - 60) * 1000 };
  return _digest.value;
}

// The ONLY write function. fields = { InternalName: 'string value' }; '' clears a value.
async function spUpdate(listTitle, id, fields) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid item');
  const body = { formValues: Object.entries(fields).map(([k, v]) => ({ FieldName: k, FieldValue: v == null ? '' : String(v) })),
                 bNewDocumentUpdate: false };
  const r = await fetch(CONFIG.siteUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(listTitle) + "')/items(" + id + ')/validateUpdateListItem',
    { method: 'POST', credentials: 'same-origin',
      headers: { ...H, 'Content-Type': 'application/json;odata=nometadata', 'X-RequestDigest': await digest() },
      body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Save failed (' + r.status + ')');
  const bad = (await r.json()).value.filter(f => f.HasException);
  if (bad.length) throw new Error('Save failed: ' + bad.map(f => f.FieldName + ' – ' + f.ErrorMessage).join('; '));
}
```

`validateUpdateListItem` takes every value as text:

| Value type | How to write it |
|---|---|
| Choice | The choice text, for example `Yes` |
| Number | The digits, for example `3` |
| Date | The **site locale** format: `dd/MM/yyyy` for English (UK), as set in Part 1 |
| Clear a value | `''` |

The frontend never writes Person or Yes/No fields, and **never calls any permission endpoint**.

**The reads**

| View | Request |
|---|---|
| Current user | `/_api/web/currentuser?$select=Email,Title` |
| Technician: own reviews (SharePoint returns only their items) | `/_api/web/lists/getbytitle('Monthly%20Reviews')/items?$select=ID,Title,MonthKey,MonthStart,DueDate,ReviewStatus,Q1WentWell,Q2Issue,Q2Impact,Q2Tried,Q2Support,Q3WorkloadRating,Q3WorkloadComment,Q4WellbeingRaise,Q4WellbeingDetail,Q5PlanningRaise,Q5PlanningDetail,Q6DevRaise,Q6DevWhat,Q6DevWhy,Q7ManagerFeedback,ExpectationsJson,Q9FollowUp&$orderby=MonthStart desc&$top=500` |
| Technician: released feedback (`null` until released, so no error is shown) | `/_api/web/lists/getbytitle('Manager%20Reviews')/items?$filter=ReviewItemId eq {id}&$select=FB_Q1,FB_Q2,FB_Q3,FB_Q4,FB_Q5,FB_Q6,FB_Q7,FB_Q9,FB_Overall,ExpectationFeedbackJson,FollowUpDecision,TechFollowUp,MeetingDate,AgreedActions` |
| TL dashboard | Manager Reviews (all fields, plus `Technician/Title,Technician/EMail` with `$expand=Technician`, `$top=5000`). Monthly Reviews (`ID,ReviewStatus,Q3WorkloadRating`). Technicians (`$filter=Active eq 1`). |
| TL review | The Manager Review by `ReviewItemId eq {id}` and the Monthly Review by `items({id})` |

### E.4 Security rules for the code (release blockers)

The script runs with the **full permissions of whoever views the page**. That includes the TL, who is a site owner.

The dangerous case is a technician who types something like `<img src=x onerror=…>` into an answer. If the TL's dashboard rendered that as HTML, the code would run **as the TL**. It could then change permissions or read every review. That is the single most serious risk this frontend introduces. These rules prevent it:

| # | Rule |
|---|---|
| S1 | **List data is never inserted as HTML.** Don't use `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` with any value read from SharePoint or typed by a user. All dynamic text goes through `el.textContent = …` or the `text()` helper below. Static markup lives only in the HTML template. |
| S2 | In the Handlebars template, use only `{{ }}` (which escapes), never `{{{ }}}`, and never with list data. |
| S3 | **Links are built only from numbers.** For example `'?reviewId=' + Number(id)`. No URL, `href` or `src` is ever taken from list text. |
| S4 | No `eval`, `new Function`, string `setTimeout`, inline event-handler attributes, or JSON with a reviver that executes anything. Use `JSON.parse` inside `try`. |
| S5 | No external scripts, fonts, CDNs, analytics or third-party calls. Only same-origin `_api` requests. |
| S6 | Writes go only through `spUpdate`, only to the item ID loaded for the current view, and only to the fields listed in E.5 and E.6. |
| S7 | Code integrity: only the Owners group (the TL) can edit the page, the layouts library or the script. The technicians group has **Read** only (D.6). |

```js
function text(tag, value, cls) {                    // the ONLY way data reaches the page
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.textContent = value == null ? '' : String(value);
  return el;
}
```

`one-to-one.js` comes with an automated test (K10) that feeds attack strings into **every** text field and every render path, and fails if any of them ends up as markup.

### E.5 Technician view (`#tech`)

**Content and behaviour.** These match the v2 questionnaire exactly.

- **Header:**
  - A month selector listing the technician's own reviews, newest first.
  - The deadline: "Deadline: 23:59, *Monday 30 November 2026*".
  - The status, followed by "– OVERDUE (you can still submit)" when it applies.
  - **Save draft** and **Submit** buttons, shown only while the status is Not Started or Draft.
- **Intro text:** as v2 lblIntro. The **Q4 guidance** text appears as in v2, with `CONFIG.eapText`.
- **Questions 1–9:** the wording, scales and choices are identical to v2 (WorkloadScale, ProgressScale, the three follow-up options).
- **Conditional fields:** Q4, Q5 and Q6 use Yes/No radio buttons. The detail fields appear only when **Yes** is selected. When **No** is selected they're hidden and **saved as empty**.
- **Q8:** one block per expectation from `ExpectationsJson`, each with a 1–5 progress rating and a comment box. If there are none, it shows "No appraisal expectations are set for you this month."
- **"Still to complete" list:** shown under the form, and updated as the technician types. Required items are Q1, the Q3 rating, the Q4–Q6 Yes/No answers, the Q4/Q5 details and Q6 "what" when Yes, a Q8 rating for each expectation, and Q9. A detail field that isn't relevant is never required.
- **Submit:**
  1. Blocked while the list isn't empty.
  2. Then a confirmation: "Submit your 1-to-1? You won't be able to change it afterwards."
  3. Then a save with `ReviewStatus = 'Submitted'`.
- **Save draft:** saves with `ReviewStatus = 'Draft'`, then shows "Draft saved at hh:mm" or a clear error.
- **Unsaved changes:** a `beforeunload` warning appears while there are unsaved edits.
- **Read-only mode:** when the status isn't Not Started or Draft, every input is disabled and the buttons are hidden.
- **Released feedback:** when the feedback read returns data, a grey "Team Leader:" box appears under each question. Q8 feedback appears per expectation. At the end there's an "Overall / Follow-up / Agreed actions" panel.
- **Not found:** if `reviewId` doesn't resolve, the page shows "This review could not be found, or it isn't yours. Use the link in your latest email or contact your Team Leader."

**Fields written.** Exactly these, in a single `spUpdate` to `Monthly Reviews`:

- `Q1WentWell`
- `Q2Issue`, `Q2Impact`, `Q2Tried`, `Q2Support`
- `Q3WorkloadRating`, `Q3WorkloadComment`
- `Q4WellbeingRaise`, `Q4WellbeingDetail`
- `Q5PlanningRaise`, `Q5PlanningDetail`
- `Q6DevRaise`, `Q6DevWhat`, `Q6DevWhy`
- `Q7ManagerFeedback`
- `ExpectationsJson`, which is `JSON.stringify` of `[{id,title,measures,year,rating,comment}]`, keeping the loaded `id/title/measures/year`
- `Q9FollowUp`
- `ReviewStatus`

### E.6 Manager review view (`#mgr`, TL only)

**Header**

- Technician name and month.
- State, plus "(submitted late)" or "OVERDUE" where it applies, and the technician's draft status while the review is Open.
- An **amber banner** when `Coalesce(FollowUpDecision, TechFollowUp)` is "Arrange a dedicated 1-to-1 discussion".
- When the feedback has already been released, a notice: changes are visible immediately, so record the reason in the correction log.

**Body**

- **Questions 1–7 and 9:** the technician's answer as read-only text, followed by a TL feedback box. The feedback box is **always shown, even when the answer is No**.
- **Q8:** built from the **trusted** `ExpectationSnapshotJson` on Manager Reviews. Each expectation shows its title, measures and year, the technician's rating and comment (matched by `id`), and a TL feedback box.
- **Follow-up:**
  - The follow-up override (blank, or one of the three options).
  - Meeting date.
  - Overall feedback.
- **Actions:**
  - Agreed actions as free text.
  - "Actions due by" date.
  - Actions status (Open or Done).
- **Correction log:** shown only after release.

**Buttons**

| Button | Writes to Manager Reviews | Enabled when |
|---|---|---|
| **Save feedback** | `FB_Q1`–`FB_Q7`, `FB_Q9`, `FB_Overall`, `ExpectationFeedbackJson`, `FollowUpDecision`, `MeetingDate`, `AgreedActions`, `ActionsDueBy`, `ActionsStatus` (`None` when the actions text is empty), `CorrectionLog` | always |
| **Complete & release** (after confirmation) | Save feedback first, then a **separate** write of `ReviewState = 'Completed'` | ReviewState is Submitted |
| **Close – not submitted** (after confirmation) | Save feedback first, then a separate write of `ReviewState = 'Closed - Not Submitted'` | ReviewState is Open and the due date has passed |
| **Back to dashboard** | — | always |

**Writes are two-step** so a feedback save can never overwrite a state that a flow has just changed. Flow 3 then does the locking, releases the feedback and sends the email.

### E.7 Dashboard view (`#dash`, TL only)

**KPI row** for the selected month (the current month by default):

- Month
- Active technicians
- Submitted
- Awaiting your review
- Completed
- Outstanding / overdue
- Dedicated 1-to-1 requested
- Open actions (overdue)

The KPI definitions are identical to v2 E.4.

**Navigation and filters**

| Control | What it does |
|---|---|
| **Monthly Reviews** | The table (the default) |
| **Appraisal Expectations** | Link to the list's *Active* view |
| **Outstanding Actions** | The table filtered to `ActionsStatus = Open`, sorted by `ActionsDueBy` |
| **Refresh** | Reloads the data |
| Month filter | Blank means all months |
| Technician filter | Blank means all. Choose a technician and clear the month to see their history, including the workload trend. |

**Table columns**

| Column | Notes |
|---|---|
| Technician | |
| Month | |
| Status | Not started / Draft / Awaiting your review / Completed / Closed, with "OVERDUE" or "(late)" where it applies. Overdue shows in red. |
| Submitted | |
| Workload | |
| Follow-up | |
| Actions | |
| Open | Link to `?reviewId=` + `Number(ReviewItemId)` |

Rows where a dedicated 1-to-1 has been requested have a pale amber background.

**Footer:** "A written check-in does not by itself satisfy any formal appraisal or meeting requirement."

### E.8 Layout and accessibility

- **Layout:** a single column, max width 880 px. It's readable on a laptop, and at widths under 600 px the dashboard table becomes stacked cards, so it works on a phone.
- **Colours:** plain system font and neutral greys. Amber is used only for meeting requests, red only for overdue and errors.
- **Accessibility:** every input has a `<label for>`. Radio groups use `<fieldset>` and `<legend>`. Errors and save results are announced through an `aria-live` region. Every control can be operated from the keyboard.

### E.9 Local verification before transfer (no tenant needed)

The code can't be tested against the corporate tenant from home, so K10 includes:

- **`mock/index.html`:** a fake in-memory SharePoint `_api` that intercepts `fetch`. It has switchable users (TL, Test A, Test B) and enforces permissions the way D.4 describes. You can click through every view in a normal browser.
- **An automated test suite** (Node, no network) that checks:
  - the validation rules
  - hidden fields are cleared on save
  - write payloads contain only the allowed fields
  - date formatting for `validateUpdateListItem`
  - that attack strings never become markup (rule S1)

This reduces the number of fix-and-transfer cycles. It is **not** a substitute for testing in the tenant (section H).


---

## F. Power Automate specification

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

- [ ] Send IT the questions **IT-1 to IT-13** and HR the questions **HR-1 to HR-5** from section J. **IT-10 (is Welcome available?) comes first.** You can build Stage 0 while you wait, but **don't put real technician data in** until IT-2, IT-10, IT-11, IT-13 and HR-2 are answered.

Create the **Config sheet** with these lines:

```
TL email (as SharePoint shows it):
Site URL:
Owners group ID:
Full Control role ID:
1-to-1 Edit role ID:
1-to-1 Read role ID:
Page link (<Site URL>/SitePages/OneToOne.aspx):
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
3. [ ] `<Site URL>/_api/web/currentuser`. Find `<d:Email>` and copy it, **in lower case**, into **TL email**.

### Part 5 — Stage 0 ⏱ about 45 min (0A), then 0B

- **0A (feasibility):** follow [`02-frontend/probe/README.md`](02-frontend/probe/README.md). It creates the test list `ZZProbe0A`, the `OneToOne` page with Welcome, and the `1-to-1 Technicians` group with Read on the page and layout library. It then runs the probe as the TL and as Test A.
- **0B (security):** instructions and probe are produced **only after 0A passes**. 0B uses throwaway `ZZProbe` lists, never the production lists.
- **If 0A fails, stop.** Use a fallback from E.0. The site and group are kept either way.

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

### Part 7 — Install the frontend ⏱ 1–2 h

You don't build any screens. You fill in one configuration block and upload two files.

1. [ ] Open `one-to-one.js` (K4) in **Notepad**. In the `CONFIG` block at the top, fill in `siteUrl`, `managerEmail` (lower case) and `eapText` from the Config sheet. Save it. **Change nothing else.**
2. [ ] Go to **Site contents → Welcome Web Part - Custom Layouts → Upload → Files** and upload `one-to-one.html` and `one-to-one.js`. If you're asked whether to replace an existing file, choose **Replace**.
3. [ ] Configure the web part:
   1. Open the `OneToOne` page and click **Edit**.
   2. Select the Welcome web part, click the **pencil** (settings), and set **Layout** to **ESG 1-to-1**.
   3. Make sure greeting, time, weather and search are **off**.
   4. Set the section to **full width**, then click **Republish**.
4. [ ] Go to **Site contents → Site Pages**, click **…** next to `OneToOne`, then **Make homepage**.
5. [ ] Check that `varPageLink` in Flow 1 matches the page link in the Config sheet.
6. [ ] **Check as the TL:** opening the site shows the **dashboard**.
7. [ ] **Check as Test A:** opening the E1 link from Part 6 shows **their questionnaire**.

**Updating the frontend later:** upload the corrected file over the old one. The library keeps versions, so **… → Version history → Restore** rolls back a bad update. Keep a dated note of every change in the configuration reference.

### Part 8 — Build Flows 2 and 3 ⏱ 2 h

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
   1. Before the new appraisal year starts, add the new year's expectations. **Edit in grid view** makes this quick: copy, paste and change AppraisalYear.
   2. On the last day of the old year, set the old ones to **Active = No**. **Never delete them.**
   3. The next month's reviews pick up the new set automatically, and older reviews keep their own snapshot.

### Part 12 — Stage 4: privacy tests and go-live ⏱ 6–7 h

1. [ ] As the TL, check the dashboard KPIs and filters against the lists for the test month (E.7).
2. [ ] Optional: add a **Quick links** web part below Welcome, linking to the Manager Reviews *Overdue* and *Open actions* views. Then **Republish**.
3. [ ] Run **all of section H**, including **every P test**. Any failed P test **blocks go-live**.
4. [ ] In each flow, open the trigger and every **Get items** action and turn on **Secure inputs** and **Secure outputs** in Settings. Save.
5. [ ] **Clean-down:**
   1. Delete all test items in Monthly Reviews and Manager Reviews, then empty both recycle bins.
   2. Remove Test A and Test B from Technicians.
   3. **Remove Test A and Test B from the `1-to-1 Technicians` group.**
6. [ ] **Go-live:**
   1. Add the real technicians to the Technicians list **and** to the `1-to-1 Technicians` group.
   2. Either wait for 07:00 on the 1st, or click **Run** on Flow 1 now to start the current month. That's safe, because the flow is idempotent.
7. [ ] **First live month:**
   - On the **1st**: check Flow 1's run history and that every technician appears on the dashboard.
   - On the **20th**: check that the reminders went out.
   - On the **next 1st**: check that the new month was created and the previous month's unsubmitted reviews show as **Overdue**.

### Operating procedures (put these in the configuration reference)

| When | Task |
|---|---|
| Quarterly (5 min) | Open **Site permissions**. Confirm the Owners group contains only the TL, and Members and Visitors are empty. Confirm `1-to-1 Technicians` contains only current technicians and has **Read** only, on the page and layout library only. Confirm the layout files show only your own uploads in their version history. |
| As needed: correction | At the technician's request, open the item in SharePoint and edit it. Add a dated reason to **CorrectionLog** on the Manager Review. Version history records the change. |
| As needed: leaver or long absence | In Technicians, set **Active = No**. Remove a leaver from `1-to-1 Technicians`. |
| As needed: new starter | Add them to Technicians and to `1-to-1 Technicians`. They get a review the next morning. |
| TL handover | Transfer site ownership. Re-create the three flows' connections under the new TL, or re-own the flows. Update `managerEmail` in `one-to-one.js` (re-upload it) and `varManagerEmail` in each flow. |
| Annually | Expectation rollover (Part 11). Retention deletion (D.5). |

---

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
| F4 | Check Q3 in the list after saving | The number 1–5 is stored. On the dashboard, picking A with all months shows each month's rating in order. |
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
| P1 🔒 | Open B's review in the frontend | Page link with `?reviewId={B}` | "Not found or isn't yours" |
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
| P13 🔒 | Reach the TL's data through the frontend | A opens `OneToOne.aspx` with no `reviewId`, then adds `#dash` to the address | Lands on own review. Even if a dashboard view appears, every figure comes only from A's own items. |
| P14 🔒 | Rest of the site and search | A opens **Site contents**, `/Lists/MonthlyReviews/AllItems.aspx`, Site Pages and Site Assets, then searches Microsoft 365 for a phrase from B's answers | Access denied (or only A's own item in the list view), and no search results |
| P15 🔒 | **Script injection (XSS).** This is the attack that matters most for v3. | A types each of these into **every** text field (Q1, Q2 ×4, Q3 comment, Q4–Q6 details, Q7, every Q8 comment), saves, and submits: `<img src=x onerror=alert('A1')>` · `<script>alert('A2')</script>` · `"><svg onload=alert('A3')>` · `{{constructor.constructor('alert(4)')()}}` · `javascript:alert('A5')`. The TL then puts the same strings into every feedback field and completes the review. | When the TL opens the dashboard and A's review, and when A opens the released review: every string is shown **as plain text**. **No alert box ever appears**, no new link appears, and the browser console (F12) shows no errors from the layout. |
| P16 🔒 | **Code integrity** | In the UI, A tries to **Edit** `OneToOne.aspx` and to upload or replace a file in *Welcome Web Part - Custom Layouts*. Through the API: POST `_api/web/getfolderbyserverrelativeurl('<library server-relative URL>')/files/add(url='one-to-one.js',overwrite=true)` | Every attempt is denied. The library's version history shows only the TL. |
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

**Claude's remaining preparation:** 2–3 sessions. One produces the probe and checklists (K0–K2, K8). After Stage 0 passes, 1–2 more produce the frontend code (about 900 lines), the local mock and tests, the flow sheets and the security notes. Generating instructions is not deployment. Nothing is live until Part 12 is done and every test in H passes.

---

## J. Blockers, confirmations and residual risks

### J.1 Confirm with IT (blocking unless marked otherwise)

| # | Question | If the answer is "no" |
|---|---|---|
| IT-1 | Can the TL create a **communication site** and be its **sole owner**? Does governance require two owners? | Ask IT to create the site. If two owners are mandatory, choose the second with HR (this affects D4). |
| IT-2 | Does the DLP policy for the chosen environment allow **SharePoint, including the action "Send an HTTP request to SharePoint"**, **Office 365 Outlook** and **Office 365 Users**, all in the same data group? | **Fallback:** replace SETPERM with the SharePoint actions **Stop sharing an item or a file** and **Grant access to an item or a folder**. This only offers *Can view* and *Can edit*, so the no-delete and no-version-history protections are lost. P6 and P12 become accepted risks that HR must agree to. Ask for the HTTP action first. |
| IT-3 | Which **Power Platform environment** should hold the three flows? (The frontend no longer uses Power Apps.) | Build the flows in the environment IT names |
| IT-4 | May site owners create **custom permission levels**? | Ask IT to create the two levels. Using the built-in Read and Contribute would reintroduce defect S3 (version history) and allow deletions. |
| IT-5 | Do technicians have **SharePoint Online**, and does the TL have **Power Automate** standard rights? Technicians **no longer need Power Apps**. | Licence change for anyone missing SharePoint |
| IT-6 | Can you have **two test accounts** with mailboxes, allowed to create a personal flow (for the API tests)? | Privacy can't be proven without them. Don't go live. |
| IT-7 | Does **Conditional Access** allow SharePoint pages on work phones? (Not blocking.) | Technicians complete it on a laptop |
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
| R7 | Renaming lists or columns breaks the frontend and flows | A "do not rename" list goes in the configuration reference |
| R8 | A Welcome update changes how custom layouts run scripts, and the frontend stops working | Data and permissions are unaffected, and the TL can still work in the lists directly. Check Welcome's release notes. The fallbacks in E.0 remain available. |
| R9 | About 900 lines of custom code, owned by the TL | Plain JavaScript with no dependencies, commented, with a local mock and automated tests (K10). Changes go through Claude and the approved transfer route. |
| R10 | A coding mistake can't bypass SharePoint permissions, but an injection bug would act **as the viewer**, including the TL | Code rules S1–S7 (E.4), an automated attack-string test (K10), release-blocking P15 |

---

## K. Artefacts to produce next

All of these are text, contain **no tenant names, credentials or personal data**, and are ready to transfer through an approved company process.

| # | File | Purpose |
|---|---|---|
| K0 | `02-frontend/probe/probe-0a.html` + `README.md` | **Produced.** Stage 0A feasibility probe and instructions |
| K0B | `02-frontend/probe/` (0B probe) | **Deferred** until 0A passes. Security probe on throwaway `ZZProbe` lists, with mandatory and informational tests. |
| K1 | `01-sharepoint/lists.md` + `lists.csv` | Printable column-by-column checklist for Part 3 |
| K2 | `01-sharepoint/site-security-checklist.md` | Parts 1, 2 and 4, plus D.6, as tick-lists, with what to screenshot |
| K3 | `02-frontend/one-to-one.html` | Welcome custom layout: metadata (extras off), page shell, CSS |
| K4 | `02-frontend/one-to-one.js` | All frontend behaviour (E.3–E.8), with the `CONFIG` block at the top |
| K5 | `03-flows/flow1.md`, `flow2.md`, `flow3.md`, `setperm-block.md` | Action-by-action build sheets with every expression ready to copy. **Not importable packages.** |
| K6 | `03-flows/email-templates.html` | E1–E7 bodies (page links) |
| K7 | `04-testing/test-record.csv` | Section H (F1–F23, P1–P17) with result columns |
| K8 | `05-deploy/privacy-notice-draft.md` | One page for HR-2 |
| K9 | `05-deploy/configuration-reference.md` | Config sheet, do-not-rename list, operating procedures, frontend change log |
| K10 | `02-frontend/mock/` + `02-frontend/tests/` | Local fake SharePoint with switchable users, plus automated tests including the attack-string test (E.9) |
| K11 | `05-deploy/frontend-security-notes.md` | One page for IT-13: what the script does, every endpoint it calls, rules S1–S7, and the test evidence |

**Order:** K0 (0A) now. K0B, K1, K2 and K8 only after 0A passes. K3–K7 and K9–K11 only after 0B passes. That way no effort is spent on later artefacts if Welcome can't run the script or the security tests fail.

---

## Summary and next step

1. **Build approach:**
   - A private SharePoint communication site with **four lists**.
   - **Manager Reviews is the authoritative, tamper-proof record.** Monthly Reviews holds only the technician's answers.
   - Two custom permission levels, applied per item by **three** standard-connector flows.
   - A custom HTML/CSS/JS frontend in the **Welcome by Accelerator 365** web part on `OneToOne.aspx` (the site home page), opened from personal links. Technicians get Read on that page only, through `1-to-1 Technicians`.
2. **Sequence:**
   1. Confirmations
   2. Parts 1–5: site, levels, lists, IDs, group, page, **Stage 0A then 0B**
   3. Part 6: Flow 1
   4. Part 7: install the frontend
   5. Part 8: Flows 2 and 3
   6. Part 9: Stage 1 tests
   7. Part 10: dates and reminders
   8. Part 11: expectations
   9. Part 12: privacy tests (including XSS), clean-down and go-live
3. **Effort:** about 26–35 h hands-on (see I), plus the IT and HR lead time.
4. **Blockers:** **IT-10 (Welcome available and able to run scripts)**, IT-11, IT-12, IT-13, plus IT-1, IT-2, IT-4, IT-6 and HR-2. HR-1 is needed before retention is configured.
5. **Next Claude Code prompt**, after running Stage 0A in the tenant:

   ```
   Stage 0A result: <PASSED or FAILED>. Redacted probe output (TL and Test A):
   <paste>. Notes: <anything Welcome needed, any extra list it created, console errors>.
   If passed: produce the Stage 0B probe and instructions, plus K1, K2 and K8, from
   one-to-one/IMPLEMENTATION_PLAN.md (v3.1). Commit and push to the current branch.
   ```
