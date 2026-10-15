# ESG 1-to-1 — list build checklist (v4)

> **You don't have to build these by hand.** The setup flow in the solution creates all of this exactly. See [`../04-solution/IMPORT_GUIDE.md`](../04-solution/IMPORT_GUIDE.md). This page is the specification, and a checklist for verifying the result or building by hand. The automated simulation checks the setup flow against [`lists.csv`](lists.csv).

Build these **six lists** on the private 1-to-1 site. The frontend (`one-to-one.js`) and the flows use the **internal column names** exactly as written here, so type them exactly, with no spaces. A machine-readable copy is in [`lists.csv`](lists.csv).

**v4 changes from v3.2 (marked 🆕):** `AppraisalDate` on Technicians and Monthly Reviews; `Mood` and `WinOfMonth` on Monthly Reviews; `ActionsJson` and `NextActionDue` replace `AgreedActions` and `ActionsDueBy` on Manager Reviews; and a fifth list, **1-to-1 Settings**.

## Rules for every list

- **Create with the internal name, then rename.** Create the list as `MonthlyReviews` (no space), then rename it to `Monthly Reviews` in List settings. The frontend and flows use the **display names**: `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings`.
- **Columns:** type the name exactly as shown (that becomes the permanent internal name). Leave every column **not required**, apart from Title.
- **Choice columns:** one choice per line, exactly as written (including dashes). Turn **Can add values manually** off. Where the default is *(none)*, delete the default value.
- **Multiple lines of text:** **plain text** (turn **Use enhanced rich text** off) and turn **Append changes to existing text** off.
- **Number:** 0 decimal places unless stated. Set Min and Max where shown.
- **Date:** *Date only* unless the table says *Date and time*.
- **Person:** people only, single selection.
- **List settings, for every list:**

  | Setting | Value |
  |---|---|
  | Versioning | Create a version each time you edit an item: **Yes**, keep **100** |
  | Attachments | **Disabled** |
  | Allow items in search results | **No** |
  | Offline client availability | **No** |
  | Permissions | **Stop inheriting**, remove Members and Visitors → only **Owners – Full Control** remains (the Settings list also gets the technicians group – see below) |

---

## 1. Technicians (manager only)

Create as `Technicians`.

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | Technician's display name, e.g. `Jane Smith` |
| Technician | Person (people only, single) | — | Their Microsoft 365 account |
| TechnicianAadId | Single line of text | — | **Leave empty** – Flow 1 fills it. **Indexed.** |
| Active | Yes/No | Yes | **Indexed.** No for leavers and long absences. |
| AppraisalDate 🆕 | Date only | — | Set from the app's **⚙ Settings**. Used for the expected appraisal outcome. |

- [ ] Indexes: `TechnicianAadId`, `Active`
- [ ] Permissions: Owners only

## 2. Appraisal Expectations (manager only)

Create as `AppraisalExpectations`, rename to **Appraisal Expectations**. You normally manage these from the app's **Expectations** page.

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | The expectation |
| Measures | Multiple lines (plain) | — | How success is measured |
| AppraisalYear | Single line of text | — | e.g. `2026/27` |
| AppliesTo | Choice: `Shared`, `Individual` | Shared | |
| Technician | Person (people only, single) | — | Only when AppliesTo = Individual |
| SortOrder | Number | 100 | Lower first |
| Active | Yes/No | Yes | **Indexed** |

- [ ] Index: `Active`
- [ ] Views: *Active* (Active = Yes, grouped by AppliesTo, sorted by SortOrder) · *Needs attention* (AppliesTo = Individual and Technician is empty) · *Retired* (Active = No)
- [ ] Permissions: Owners only

## 3. Monthly Reviews (per item – set by the flows)

Create as `MonthlyReviews`, rename to **Monthly Reviews**. The technician's workspace. **Flows treat every column here as untrusted.**

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | `Jane Smith – 2026-11` (display copy) |
| Technician | Person | — | Display copy |
| MonthKey | Single line of text | — | `2026-11` |
| MonthStart | Date only | — | For sorting |
| DueDate | **Date and time** | — | Display copy |
| ReviewStatus | Choice: `Not Started`, `Draft`, `Submitted`, `Completed`, `Closed - Not Submitted` | Not Started | The technician's submit signal |
| Q1WentWell | Multiple lines (plain) | — | |
| Q2Issue | Multiple lines (plain) | — | |
| Q2Impact | Multiple lines (plain) | — | |
| Q2Tried | Multiple lines (plain) | — | |
| Q2Support | Multiple lines (plain) | — | |
| Q3WorkloadRating | Number, min 1, max 5 | — | |
| Q3WorkloadComment | Multiple lines (plain) | — | |
| Q4WellbeingRaise | Choice: `Yes`, `No` | *(none)* | |
| Q4WellbeingDetail | Multiple lines (plain) | — | |
| Q5PlanningRaise | Choice: `Yes`, `No` | *(none)* | |
| Q5PlanningDetail | Multiple lines (plain) | — | |
| Q6DevRaise | Choice: `Yes`, `No` | *(none)* | |
| Q6DevWhat | Multiple lines (plain) | — | |
| Q6DevWhy | Multiple lines (plain) | — | |
| Q7ManagerFeedback | Multiple lines (plain) | — | |
| ExpectationsJson | Multiple lines (plain) | — | Technician's copy of the expectations + their ratings |
| Q9FollowUp | Choice (3 lines, exactly): `Everything has been covered — no further discussion required at present.` · `Quick, informal catch-up in the field.` · `Arrange a dedicated 1-to-1 discussion.` | *(none)* | The first value contains an **em dash** (—). Copy it from this file. |
| Mood 🆕 | Number, min 1, max 5 | — | Energy check-in (shared with the TL) |
| WinOfMonth 🆕 | Multiple lines (plain) | — | Win of the month |
| AppraisalDate 🆕 | Date only | — | **Display copy** for the technician's outlook. Written by Flow 1 and by ⚙ Settings. Never used for any decision (plan D.7). |

- [ ] No extra indexes needed
- [ ] Permissions: Owners only at list level (items get unique permissions from the flows)

## 4. Manager Reviews (the authoritative record)

Create as `ManagerReviews`, rename to **Manager Reviews**.

| Column | Type | Default | Written by | Notes |
|---|---|---|---|---|
| Title | (built-in) | — | Flow 1 | |
| ReviewKey | Single line of text | — | Flow 1 | **Enforce unique values: Yes** (needs the index) |
| ReviewItemId | Number | — | Flow 1 | **Indexed** |
| Technician | Person | — | Flow 1 | **The identity used for access and emails** |
| TechnicianAadId | Single line of text | — | Flow 1 | |
| MonthKey | Single line of text | — | Flow 1 | **Indexed** |
| DueDate | **Date and time** | — | Flow 1 | |
| ReviewState | Choice: `Open`, `Submitted`, `Completed`, `Closed - Not Submitted` | Open | Flows + TL | **Indexed** |
| LinkSentOn | **Date and time** | — | Flow 1 | |
| SubmittedOn | **Date and time** | — | Flow 2 | |
| SubmittedLate | Yes/No | No | Flow 2 | |
| TechFollowUp | Single line of text | — | Flow 2 | |
| ExpectationSnapshotJson | Multiple lines (plain) | — | Flow 1 | Trusted expectation wording |
| FB_Q1, FB_Q2, FB_Q3, FB_Q4, FB_Q5, FB_Q6, FB_Q7 | Multiple lines (plain) – **seven columns** | — | TL | |
| FB_Q9 | Multiple lines (plain) | — | TL | |
| FB_Overall | Multiple lines (plain) | — | TL | |
| ExpectationFeedbackJson | Multiple lines (plain) | — | TL | v4: `[{"id":12,"feedback":"…","rating":4}]` – feedback **and the TL's 1–5 rating** |
| FollowUpDecision | Choice (same 3 values as Q9) | *(none)* | TL | |
| MeetingDate | Date only | — | TL | |
| ActionsJson 🆕 | Multiple lines (plain) | — | TL | All agreed actions: `[{"id":"…","text":"…","owner":"…","criteria":"…","due":"2026-12-15","status":"Open","closedOn":""}]` (status `Open` or `Closed`) |
| ActionsStatus | Choice: `None`, `Open`, `Done` | None | TL (app) | **Indexed** |
| NextActionDue 🆕 | Date only | — | TL (app) | Earliest open deadline (for the *Open actions* view) |
| CompletedOn | **Date and time** | — | Flow 3 | |
| CompletedBy | Single line of text | — | Flow 3 | |
| ReleasedOn | **Date and time** | — | Flow 3 | |
| CorrectionLog | Multiple lines (plain) | — | TL | Reason for any change after submission |

> **Not in v4:** `AgreedActions` and `ActionsDueBy` (replaced by `ActionsJson` and `NextActionDue`). Don't create them.

- [ ] Indexes: `ReviewKey` (then Enforce unique values = Yes), `ReviewItemId`, `MonthKey`, `ReviewState`, `ActionsStatus`
- [ ] Views: *Overdue* (ReviewState = Open **and** DueDate < `[Today]`) · *Open actions* (ActionsStatus = Open, sorted by NextActionDue) · *All*
- [ ] Permissions: Owners only at list level

## 5. 1-to-1 Settings 🆕 (Owners edit, technicians read)

Create as `OneToOneSettings`, rename to **1-to-1 Settings**. It holds **no personal data**, only the appraisal band thresholds, which technicians need to see their own outlook.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | Setting name |
| Value | Multiple lines (plain) | JSON value |

- [ ] Add one item. **Title** = `Bands`. **Value** = (copy exactly):

  ```
  [{"name":"Not met","max":1.5},{"name":"Partially met","max":2.25},{"name":"Met","max":4},{"name":"Exceeded","max":null}]
  ```

  (If you skip this, the app uses these defaults and creates the item the first time you save ⚙ Settings.)
- [ ] Permissions: **Stop inheriting**, remove Members/Visitors, then **Grant Permissions → `1-to-1 Technicians` → Read** (untick the email invitation). Owners keep Full Control.

- [ ] v4.2: setup also adds a `Reminders` item (Value `[20,27]` – the reminder days). If you rename roles in ⚙ Settings → Names, the app adds a `Labels` item. Both hold no personal data.

## 6. Wellbeing Assessments 🆕 v4.2 (Owners only; Flow 5 shares each item with one person)

Created by the setup flow (solution 1.1) at `Lists/WellbeingAssessments`, display name **Wellbeing Assessments**. One item per assessment.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | e.g. *Name – wellbeing assessment* |
| Technician | Person (single, people only) | The person. Flow 5 grants **them** access to this item only and, when they submit, restores this column from that permission. |
| AssessmentStatus | Choice: Open / Submitted / Completed (default Open, indexed) | The person sets Submitted; Flow 5 locks it. You set Completed. |
| AssessmentDate | Date only | Meeting date (you) |
| Position, EmployeeNumber | Single line of text | The person (employee number optional) |
| AnswersJson | Multiple lines (plain) | The 32 HSE questions: applies? / an issue? / what would help |
| PersonalJson | Multiple lines (plain) | Personal input (circumstances, mental health, support, anything else) |
| ArrangementsJson | Multiple lines (plain) | **You:** agreed arrangements, each with a review date and whether it was effective |
| ManagerNotes | Multiple lines (plain) | **You:** notes from the meeting (seen by both) |
| NextReviewDate | Date only | **You:** yearly by default, earlier if needed. Flow 1 emails you 7 days before and on the day. |
| SubmittedOn, CompletedOn | Date and time | **Flow 5 only** – the trusted record of when it was submitted and completed |

- [ ] View **Reviews due**: completed assessments by next review date.
- [ ] Permissions: **Owners – Full Control only** at list level. Never share an item by hand – Flow 5 does it.

---

## Final checks

- [ ] Site contents shows the six lists (plus the Welcome libraries/lists).
- [ ] **Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, Wellbeing Assessments:** permissions page shows **only Owners – Full Control**.
- [ ] **1-to-1 Settings:** Owners – Full Control **and** `1-to-1 Technicians` – Read. Nothing else.
- [ ] Versioning on, attachments off, search off, on every list.
- [ ] Spot-check three internal names: open List settings → click the column → the URL ends `Field=Q9FollowUp` (etc.).
