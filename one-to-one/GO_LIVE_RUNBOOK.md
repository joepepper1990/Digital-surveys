# ESG 1-to-1: go-live runbook (v4)

This runbook takes you from where you are now to technicians receiving their first monthly email. Work through the phases in order and tick as you go.

**Where to find the detail:**

- Lists: [`01-sharepoint/lists.md`](01-sharepoint/lists.md)
- Flows: [`03-flows/FLOW_BUILD_SHEETS.md`](03-flows/FLOW_BUILD_SHEETS.md)
- Emails: [`03-flows/EMAIL_TEMPLATES.md`](03-flows/EMAIL_TEMPLATES.md)
- Frontend install: [`02-frontend/README.md`](02-frontend/README.md)
- Running the system: [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md)
- Design record: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) v4

**Where you are:**

- Site, page, Welcome and the `1-to-1 Technicians` group are built.
- **Stage 0A and 0B have passed.**
- **All build files are produced** and tested locally (70 automated checks).

**Legend:**

- 🧑 you do it in SharePoint or Power Automate
- ⛔ a gate you must not pass until it's green

---

## Phase 1 — Stage 0 security verification ✅ done

Stage 0A and 0B passed in the live tenant. Two findings are built into the setup:

- the group needs Read on the Welcome Errors list;
- the TL must be Site Collection Admin.

- [ ] 🧑 Tidy up: delete the `ZZProbe…` lists and the probe files (`probe-0a*.html/js`, `probe-0b.*`) from the layouts library.

## Phase 2 — Decisions and HR inputs ✅ settled

| Item | Decision |
|---|---|
| Retention | **24 months** |
| Privacy notice | Not needed. This is between the TL and each technician. |
| Repository | **Private** |
| Private notes, "ask for a chat" | **Removed** |
| Wellbeing text | Q4 wording only, with no EAP text in the form |

## Phase 3 — Production build files ✅ produced

| File | What it is |
|---|---|
| `02-frontend/one-to-one.html`, `one-to-one.js` | The app, v4.0.0. **Nothing to edit.** |
| `01-sharepoint/lists.md`, `lists.csv` | Column-by-column list checklist |
| `03-flows/FLOW_BUILD_SHEETS.md` | Flows 1–3, step by step |
| `03-flows/EMAIL_TEMPLATES.md` | E1–E5, E7 |
| `CONFIG_REFERENCE.md` | Config sheet, do-not-rename list, procedures, troubleshooting |
| `prototype/prototype.html` | The agreed design, for reference |

---

## Phase 4 — Build the five production lists 🧑 ⏱ about 2 h

Follow [`01-sharepoint/lists.md`](01-sharepoint/lists.md) column by column. Create each list **without spaces**, then rename it.

- [ ] **Technicians.** Includes 🆕 `AppraisalDate`.
- [ ] **Appraisal Expectations.**
- [ ] **Monthly Reviews.** Includes 🆕 `Mood`, `WinOfMonth`, `AppraisalDate`.
- [ ] **Manager Reviews.** Includes 🆕 `ActionsJson` and `NextActionDue`. **Not** `AgreedActions` or `ActionsDueBy`. Enforce unique values on `ReviewKey`.
- [ ] 🆕 **1-to-1 Settings.** Title + Value, with one `Bands` item.
- [ ] Every list: versioning on, attachments off, search off, inheritance stopped, Members and Visitors removed.
- [ ] Indexes and views as listed.
- [ ] **1-to-1 Settings only:** grant `1-to-1 Technicians` **Read**.

**⛔ Gate:**

- The four data lists show **only Owners**.
- 1-to-1 Settings shows Owners plus `1-to-1 Technicians` – Read.

## Phase 5 — Record the IDs 🧑 ⏱ 10 min

Fill in the Config sheet ([`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §1): TL email, Owners group ID, the Full Control / 1-to-1 Edit / 1-to-1 Read role IDs, and the page link.

Keep the filled-in sheet in the site or your OneDrive, **not in GitHub**.

## Phase 6 — Install the frontend 🧑 ⏱ 30 min

Follow [`02-frontend/README.md`](02-frontend/README.md) §Install.

- [ ] Upload `one-to-one.html` and `one-to-one.js` to **Welcome Web Part - Custom Layouts**.
- [ ] On `OneToOne`:
  - put the Welcome web part in a **full-width section**;
  - set the layout to **ESG 1-to-1**;
  - turn the extras off;
  - **Republish**.
- [ ] Make `OneToOne` the home page.
- [ ] The group has Read on the page, the layouts library, the Welcome Errors list and 1-to-1 Settings.
- [ ] As TL: **Team overview** opens, the sidebar shows **⚙ Settings**, and the footer shows **v4.0.0**. With no reviews yet, the pages are empty but there are no errors.

## Phase 7 — Build the three flows 🧑 ⏱ 4–5 h

Follow [`03-flows/FLOW_BUILD_SHEETS.md`](03-flows/FLOW_BUILD_SHEETS.md), with emails from [`EMAIL_TEMPLATES.md`](03-flows/EMAIL_TEMPLATES.md).

- [ ] **Flow 1 — Daily scheduler.** Creates reviews, makes them private, sends E1, sends reminders on the 20th and 27th, and reports problems with E7.
- [ ] **Flow 2 — Review submitted.** Locks the review, stamps the record, sends E3.
- [ ] **Flow 3 — Manager decision.** Validates, locks, **releases**, sends E4 or E5.
- [ ] Secure inputs/outputs, concurrency 1, and Try/Catch on every flow. `varTestDate` is empty.

## Phase 8 — Add technicians and appraisal dates 🧑 ⏱ 30 min

For each technician:

1. [ ] **Technicians → + New.**
   - **Title** = name.
   - **Technician** = their account.
   - Leave **TechnicianAadId** blank.
   - **Active** = Yes.
2. [ ] Add them to the **`1-to-1 Technicians`** group, with the email invitation unticked.

Then:

- [ ] In the app, open **⚙ Settings** and enter each **appraisal date** (DD-MMM-YYYY). Check the band thresholds, then **Save settings**.

> Start with **Test A and Test B only** (Phase 10). Add the real technicians after the rehearsal.

## Phase 9 — Add appraisal expectations 🧑 ⏱ 1 h

Use the app's **Expectations** page (or the list).

- [ ] **Shared** expectations: title, measures, year (e.g. `2026/27`), sort order.
- [ ] **Individual** expectations: the same, with *Applies to* = that technician.
- [ ] No technician has more than **10** active expectations. The page shows the count per person.

> Expectations are copied into each month's review when it's created. Edits apply from the next month, and past reviews never change. **Retire** expectations; never delete them.

## Phase 10 — End-to-end rehearsal with Test A and Test B 🧑 ⛔ ⏱ 6–8 h

With **only Test A and Test B** in Technicians:

- [ ] Run **Flow 1** manually. A and B each get E1. Running it again creates nothing new.
- [ ] **As Test A:**
  1. Open the link.
  2. Fill in some answers, the energy tile and the win, then **Save**.
  3. Close and reopen: everything is still there.
  4. Complete the form and **Submit**.
  5. The review is read-only within about 5 minutes.
- [ ] **As TL** (E3 arrives):
  1. Open the review.
  2. Add feedback and a **TL rating** per expectation.
  3. Add **two or more actions**, each with close-out criteria and a deadline.
  4. Click **Complete & release**.
- [ ] **As Test A:** E4 arrives. Feedback, ratings and actions are visible. **My appraisal** and **Appraisal report** work.
- [ ] **As TL:**
  - The **Actions** page closes an action.
  - The **Appraisal report** for A prints or saves as PDF.
- [ ] **As Test B:** throughout, B never sees anything of A's.
- [ ] Run plan **section H**: F1–F30 and **every P test (P1–P20)**. The XSS test P15 is release-blocking.

**⛔ Gate:** every P test passes and the journey works end to end.

Then clean down:

1. Delete the test reviews from both lists, then empty both recycle bins.
2. Remove Test A and Test B from Technicians and from the group.

## Phase 11 — Go live 🧑 ⏱ 15 min

- [ ] Add the real technicians (Phase 8), then set their appraisal dates in ⚙ Settings.
- [ ] Flows 1, 2 and 3 are **On**.
- [ ] **Flow 1 → Run** to start the current month now. Alternatively, wait for 07:00 on the 1st.
- [ ] Check:
  - each technician has one review and got exactly one email;
  - **Team overview** lists everyone.

## Phase 12 — Running it each month 🧑

| When | What happens / what you do |
|---|---|
| 1st, 07:00 | Flow 1 creates the reviews and emails links. Glance at Team overview. |
| During the month | You get E3 per submission. Review, rate, add actions, then **Complete & release**. |
| 20th and 27th | Automatic reminders to anyone who hasn't submitted |
| Last day, 23:59 | Deadline. Unsubmitted reviews show as overdue, and you can **Close – not submitted**. |
| Any time | **Actions** page: close completed actions. **⚙ Settings**: appraisal dates. |
| Before an appraisal | **Appraisal report** for that technician, to help write the appraisal |
| Quarterly | Permission check ([`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §4) |
| Annually | Expectation rollover; retention deletion (over 24 months) |

---

## Quick status map

| Phase | Who | State |
|---|---|---|
| 1 Stage 0 | you | ✅ passed (tidy-up left) |
| 2 decisions | you | ✅ settled |
| 3 build files | Claude | ✅ produced |
| 4 lists | you | **next** |
| 5 IDs | you | after 4 |
| 6 frontend | you | after 4 |
| 7 flows | you | after 5 |
| 8 technicians (test first) | you | after 6 |
| 9 expectations | you | after 4 |
| 10 rehearsal | you | after 7–9 |
| 11 go live | you | after 10 |
| 12 monthly | you | ongoing |

**Rough hands-on time from here:**

| Phases | Time |
|---|---|
| 4–7 | about 7–8 h |
| 8–9 | about 1–2 h |
| 10 | about 6–8 h (testing) |
| 11 | minutes |

If a tenant test fails, use the prompt at the end of the implementation plan to get a fix.
