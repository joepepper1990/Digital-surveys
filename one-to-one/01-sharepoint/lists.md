# ESG 1-to-1 — list build checklist (v4)

> **You don't have to build these by hand.** The setup flow in the solution creates all of this exactly. See [`../04-solution/IMPORT_GUIDE.md`](../04-solution/IMPORT_GUIDE.md). This page is the specification, and a checklist for verifying the result or building by hand. The automated simulation checks the setup flow against [`lists.csv`](lists.csv).

Build these **eight lists** on the private 1-to-1 site. The frontend (`one-to-one.js`) and the flows use the **internal column names** exactly as written here, so type them exactly, with no spaces. A machine-readable copy is in [`lists.csv`](lists.csv).

**Solution 1.4 (page 5.0.0, marked 🆕 1.4):** four date / period columns on Technicians, `AppraisalBoundaries` on Monthly Reviews, a new Owners-only list **1-to-1 Amendments**, and the **1-to-1 Challenges** list retired (kept, no longer used – see section 8).

**v4 changes from v3.2 (marked 🆕):** `AppraisalDate` on Technicians and Monthly Reviews; `Mood` and `WinOfMonth` on Monthly Reviews; `ActionsJson` and `NextActionDue` replace `AgreedActions` and `ActionsDueBy` on Manager Reviews; and a fifth list, **1-to-1 Settings**.

## Rules for every list

- **Create with the internal name, then rename.** Create the list as `MonthlyReviews` (no space), then rename it to `Monthly Reviews` in List settings. The frontend and flows use the **display names**: `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings`, `1-to-1 Feedback`, `1-to-1 Amendments`, and from 1.5 `1-to-1 Actions`, `1-to-1 Action Updates`, `1-to-1 Action Notices`.
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
| AppraisalDate 🆕 | Date only | — | **Next appraisal due.** Set in ⚙ Settings → Team. Moving it never changes which period a review belongs to; it is the end point of the forecast and drives E17 reminders. |
| NextWellbeingDate 🆕 1.4 | Date only | — | **Next wellbeing assessment due.** Set in ⚙ Settings → Team, or confirmed when completing an assessment. Drives dashboards, overdue flags and E12 reminders. Never changes by itself. |
| AppraisalCycleStart 🆕 1.4 | Date only | — | Start of the current appraisal period: the date the last appraisal was actually completed, or the baseline the TL sets. |
| AppraisalHistoryJson 🆕 1.4 | Multiple lines (plain) | — | Completed periods, written by **Mark appraisal completed**: `[{"start":"2025-04-10","completed":"2026-04-20","nextDue":"2027-04-30","recordedOn":"…"}]`. The source of truth for the TL's period calculations. |
| AppraisalBoundaries 🆕 1.4 | Multiple lines (plain) | — | The same boundaries as a date list (`["2025-04-10","2026-04-20"]`); Flow 1 copies it to each new Monthly Review. |

- [ ] Indexes: `TechnicianAadId`, `Active`
- [ ] Permissions: Owners only

## 2. Appraisal Expectations (manager only)

Create as `AppraisalExpectations`, rename to **Appraisal Expectations**. You normally manage these from the app's **Expectations** page.

| Column | Type | Default | Notes |
|---|---|---|---|
| Title | (built-in) | — | The expectation |
| Measures | Multiple lines (plain) | — | How success is measured |
| AppraisalYear | Single line of text | — | e.g. `2026/27` – the **first** appraisal year it applies to. It carries on into later years until it is retired (1.4: it no longer disappears in April); one entered for a later year stays hidden until then. Empty = always. |
| AppliesTo | Choice: `Shared`, `Individual` | Shared | |
| Technician | Person (people only, single) | — | Only when AppliesTo = Individual |
| SortOrder | Number | 100 | Lower first, **within its group** (Shared always come before Individual). No limit on how many (1.4). |
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
| AppraisalBoundaries 🆕 1.4 | Multiple lines (plain) | — | **Display copy** of the period boundaries, so the technician's own view groups their reviews by period. Written by Flow 1 and by Mark appraisal completed. The TL's views never read it (the technician can edit their open review). |

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
| ChallengeState 🆕 v4.5 | Choice: `Open`, `Agreed`, `Not agreed` | *(none)* | Flow 7, Flow 1 + TL | **Indexed.** Empty = never challenged. Flow 7 opens it and closes it as Agreed; Flow 1 closes it as Not agreed after the close-by date; the TL can set it back to Open (reopen). |
| ChallengeSectionsJson 🆕 v4.5 | Multiple lines (plain) | — | Flow 7 | The challenged parts and the technician's notes, copied from their challenge |
| ChallengeItemId 🆕 v4.5 | Number | — | Flow 7 | The *1-to-1 Challenges* item |
| ChallengeOpenedOn 🆕 v4.5 | **Date and time** | — | Flow 7 | |
| ChallengeCloseBy 🆕 v4.5 | Date only | — | Flow 7 + TL | End of the UK month it was raised (end of the next month if fewer than 7 days are left); reset when the TL reopens it |
| ChallengeTlAgreedOn 🆕 v4.5 | **Date and time** | — | TL (app) | The TL's agreement – recorded **only** here |
| ChallengeTechAgreedOn 🆕 v4.5 | **Date and time** | — | Flow 7 | The technician's agreement, copied from their challenge |
| ChallengeClosedOn 🆕 v4.5 | **Date and time** | — | Flow 7, Flow 1 | |

> **1.5:** one more column, **`ActionsSyncedOn`** (Date and time, written by flows 3 and 1 only), records when this review's agreed actions were all added to *1-to-1 Actions*. It stays empty for reviews released before the tracker started. From 1.5, `ActionsJson` is the record of what was agreed **at that meeting**; once released, the actions are managed only in *1-to-1 Actions* and the review's copy is never changed by the Actions page.
>
> **Not in v4:** `AgreedActions` and `ActionsDueBy` (replaced by `ActionsJson` and `NextActionDue`). Don't create them.
>
> **1.4:** the `Challenge*` columns are no longer read or written (challenges were removed). They are kept so no data is lost; Setup 1.4 sets any `ChallengeState = Open` to *Not agreed*.
>
> **v4.5:** the `Challenge*` columns are the trusted record of a challenge. The technician can only **read** their Manager Review, so they can never write these; their own input goes on the *1-to-1 Challenges* list and Flow 7 copies it here.

- [ ] Indexes: `ReviewKey` (then Enforce unique values = Yes), `ReviewItemId`, `MonthKey`, `ReviewState`, `ActionsStatus`, `ChallengeState`
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

## 7. 1-to-1 Feedback 🆕 v4.3 (everyone adds; each sees only their own until Flow 6 locks it)

Created by the setup flow (solution 1.2) at `Lists/OneToOneFeedback`, display name **1-to-1 Feedback**. One item per message sent from the page's 💬 **Feedback** bubble.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | First 60 characters of the message |
| FeedbackType | Choice: Fault / Improvement / Suggestion (default Suggestion) | Chosen in the bubble |
| Message | Multiple lines (plain) | What they wrote (2,000 characters at most) |
| PageName | Single line of text | The page they were on |
| AppVersion | Single line of text | Frontend version |
| DeliveryStatus | Choice: Pending / Sent / Failed / Read / Held (default Pending) | **Flow 6:** Sent, Failed if the email didn't go, or Held when one person sends more than 10 in a day (kept, not emailed one by one). **You:** Read, from *Needs your attention*. |
| SentOn | Date and time | **Flow 6 only** |

- [ ] Advanced settings → **Item-level permissions:** *Read items that were created by the user*; *Create items and edit items that were created by the user*.
- [ ] Permissions: **Owners – Full Control** and `1-to-1 Technicians` – **1-to-1 Submit** (this list only; Contribute without delete, versions, alerts or personal views). Flow 6 makes each item Owners-only straight after it's sent.

---

## 8. 1-to-1 Amendments 🆕 1.4 (Owners only – the restricted audit of Team Leader amendments)

Created by the setup flow (solution 1.4) at `Lists/OneToOneAmendments`, display name **1-to-1 Amendments**. One item per amendment the TL makes to a submitted or completed 1-to-1 (the page writes it **before** changing the review). Who made it and when are SharePoint's own **Created By** and **Created**; the page never sets them.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | *Name – Month yyyy* |
| ReviewItemId | Number | **Indexed.** The Monthly Review amended |
| ManagerReviewId | Number | The Manager Review |
| MonthKey | Single line of text | yyyy-MM |
| Technician | Person | Whose 1-to-1 (Flow 8 emails them) |
| Reason | Multiple lines (plain) | Why it was changed (required on the page) |
| ChangedFields | Multiple lines (plain) | The fields changed, in words |
| ChangesJson | Multiple lines (plain) | Before and after of each changed column: `[{"l":"rv","f":"Q1WentWell","b":"…","a":"…"}]` |
| NotifyStatus | Choice: Draft / Pending / Sending / Sent / Failed / Retry / Cancelled (default Draft) | **Indexed.** *Draft* while the page is saving; *Pending* when saved, and Flow 8 then sends E16 (*Sending* → *Sent*, or *Failed*). *Retry* = Resend from the page. *Cancelled* = an amendment that was never saved, dismissed by the TL. |
| NotifiedOn | Date and time | Flow 8 |
| NotifyError | Single line of text | Flow 8 (no content, just that it failed) |

- [ ] Permissions: **Owners – Full Control only.** The technicians group has no access; technicians never see the reason or the before/after values (they get E16 with a link, and see the current version of their review).
- [ ] Versioning on (100). The page never edits an item's reason or changes; only `NotifyStatus` moves on. **Honest limit:** site owners and site collection admins can always edit a list they own, so the audit is tamper-*evident* (full version history), not tamper-proof. The E16 email to the technician is an independent record.

## 10. 1-to-1 Actions 🆕 1.5 (Owners only; flow 9 shares each item with its technician, Read)

The live record of every tracked action. Flow 3 adds a released review's agreed actions (flow 1 finishes any it couldn't); the Team Leader can also add actions on the Actions page. Only the Team Leader's page and flows 9 and 10 write it, always with the item's etag.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | The action as agreed (up to 250 characters) |
| ActionKey | Single line of text | **Indexed, unique.** `mr<Manager Review id>-<action id>` from a review, `tl-…` when added on the Actions page. A retry can never add an action twice. |
| Technician | Person | Whose action it is (flow 9 shares the item with exactly this person) |
| Owner | Choice: Technician / Team Leader | Who carries it out. Only the technician's own actions can be put forward for close-out by them. |
| Criteria | Multiple lines (plain) | Close-out criteria |
| OriginReviewId, OriginMgrId | Number | The review it was agreed in (OriginReviewId indexed). Empty for actions added on the Actions page. |
| OriginMonth | Single line of text | yyyy-MM |
| OriginalDue | Date only | The deadline as first agreed – never changed |
| CurrentDue | Date only | The deadline now (a change needs a reason, kept in the history) |
| Status | Choice: Open / In progress / Waiting / Ready for close-out / Closed (default Open) | **Indexed.** *Waiting* explains a delay; it never moves the deadline. Only the Team Leader sets *Closed* or reopens. |
| WaitingReason | Multiple lines (plain) | What it is waiting on (required for Waiting) |
| WaitingUntil | Single line of text | yyyy-MM-dd, optional next check |
| LatestProgress | Multiple lines (plain) | The latest progress note |
| LastUpdateOn / LastUpdateBy | Date and time / Single line of text | |
| ClosedOn | Date only | |
| DecisionNote | Multiple lines (plain) | The Team Leader's close-out note, or why a close-out isn't agreed yet, or why it was reopened |
| HistoryJson | Multiple lines (plain) | Every change, appended, never rewritten: `[{"id":"u42","at":"…","by":"…","kind":"progress","text":"…"}]` |
| SharedWith | Single line of text | Written by flow 9 once the item is shared (the page shows *not shared yet* until then) |

- [ ] Permissions: **Owners – Full Control** at list level. Each item: unique permissions, Owners Full Control + its technician *1-to-1 Read* (flow 9 checks the exact set every time the item changes, and removes anything else).
- [ ] Versioning on (100). View *Open actions* (Status ≠ Closed, by CurrentDue).
- **Honest limit:** site owners can edit any list they own. The history is tamper-*evident* (version history, and every write by the page or a flow appends), not tamper-proof.

## 11. 1-to-1 Action Updates 🆕 1.5 (one folder per technician; only they can add to theirs)

Technicians' progress updates. **Append-only:** each update is a new item; flow 10 checks it, records it on the action and locks it.

| Column | Type | Notes |
|---|---|---|
| Title | (built-in) | `Update <client key>` (no content) |
| ActionId | Number | **Indexed.** The action it is about – checked by flow 10, never trusted |
| Kind | Choice: progress / waiting / followup / closeRequest | |
| Outcome | Choice: Satisfactory / Support / Ready | Follow-up outcomes only |
| Message | Multiple lines (plain) | The update (required for progress and waiting) |
| WaitingUntil | Single line of text | yyyy-MM-dd |
| ClientKey | Single line of text | **Indexed, unique.** Made by the page for each update and reused on a retry, so a retry or refresh can't record it twice. A follow-up's key carries its review month (`fu-yyyy-MM-…`). |
| ProcessState | Choice: Pending / Processing / Applied / Rejected (default Pending) | **Indexed.** Flow 10 |
| ProcessNote | Single line of text | Why it was rejected |

- [ ] **Folders on** (Advanced settings → *Make "New Folder" command available*: Yes – Setup does it).
- [ ] **Item-level permissions → Create and Edit access: "Create items and edit items that were created by the user"** (Setup does it). A technician can then never rename or change their folder, which flow 9 made. Flow 9 and flow 10 also refuse any folder that anyone but the flow's own account has created or changed.
- [ ] Permissions: **Owners – Full Control only** at list level (no group access). Flow 9 creates one folder per technician, named `u<their site user id>`, with unique permissions: Owners Full Control + **that technician 1-to-1 Submit**. Who sent an update is taken from the folder it is in – never from *Created By* or *ActionId*.
- [ ] After processing, flow 10 gives each update its own permissions: Owners + the sender *1-to-1 Read*. A technician can never delete an update (no Delete in any 1-to-1 level).

## 12. 1-to-1 Action Notices 🆕 1.5 (Owners only)

The outbox for E19 (close-out requested) and E20 (deadline in 5 working days). Flow 11 sends each one.

| Column | Type | Notes |
|---|---|---|
| Title / NoticeKey | (built-in) / Single line of text | **NoticeKey indexed, unique:** `E19-u<update id>` or `E20-a<action id>-<yyyy-MM-dd>` – one email per request, one reminder per action and deadline |
| Kind | Choice: E19 / E20 | |
| ActionId | Number | **Indexed** |
| Status | Choice: Pending / Sending / Sent / Failed / Retry / Cancelled (default Pending) | **Indexed.** *Sending* left for over an hour = delivery unknown. *Retry* = Resend from the page or the daily retry (up to 3 attempts). *Cancelled* = no longer needed (the action was closed). |
| Attempts | Number (default 0) | |
| LastError | Single line of text | No content, just what failed |
| SentOn | Date and time | |

- [ ] Permissions: **Owners – Full Control only.**

**Settings item `ActionsTrackerStart`** (in *1-to-1 Settings*): written once by Setup 1.5 with the date and time it ran. Only reviews released after it have their actions tracked, so earlier `ActionsJson` is never imported. Don't edit or delete it.

## 9. 1-to-1 Challenges – retired in 1.4

The list made by solution 1.3 is **kept, not deleted**: no new challenges can be made and the page no longer reads it. Setup 1.4 removes the `1-to-1 Technicians` group from it, makes every item Owners-only, and closes any open challenge as *Not agreed*. A new site set up with 1.4 never gets this list. You may delete it later yourself, after exporting it, if you no longer need the records.

---

## Final checks

- [ ] Site contents shows the eight lists (plus the Welcome libraries/lists, and the retired 1-to-1 Challenges on a site upgraded from 1.3).
- [ ] **Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, Wellbeing Assessments:** permissions page shows **only Owners – Full Control**.
- [ ] **1-to-1 Settings:** Owners – Full Control **and** `1-to-1 Technicians` – Read. Nothing else.
- [ ] **1-to-1 Feedback:** Owners – Full Control **and** `1-to-1 Technicians` – 1-to-1 Submit, with item-level permissions set to their own items only.
- [ ] **1-to-1 Amendments** (and the retired **1-to-1 Challenges**): **only Owners – Full Control**.
- [ ] **1-to-1 Actions, 1-to-1 Action Updates, 1-to-1 Action Notices** (1.5): **only Owners – Full Control** at list level. Items in Actions and folders in Action Updates have their own permissions, set by flow 9 (see sections 10–11).
- [ ] Versioning on, attachments off, search off, on every list.
- [ ] Spot-check three internal names: open List settings → click the column → the URL ends `Field=Q9FollowUp` (etc.).
