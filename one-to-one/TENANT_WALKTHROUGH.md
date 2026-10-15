# ESG 1-to-1 — tenant walkthrough: from Stage 0B to live

One tick-list from where you are now to a running system. For a single printable document with everything in it (including the full test record), use [`ESG-1to1-Finalisation-Guide.docx`](ESG-1to1-Finalisation-Guide.docx). Each step links to the detailed guide.

**Current status:**

- **Build:** complete and verified offline ([`VERIFICATION.md`](VERIFICATION.md)).
- **Tenant:** nothing has run in your tenant yet. The system is complete when **Phase F is done and every P-test in Phase C has passed**.

**Where you start from (Stage 0A/0B passed):**

- The site exists, with the `OneToOne` page and the Welcome web part.
- The `1-to-1 Technicians` group exists, with Read on the page, the layouts library and the Welcome Errors list.
- The `1-to-1 Edit` and `1-to-1 Read` permission levels exist.

| Phase | What | Who's involved | Time |
|---|---|---|---|
| 0 | Get the right files | you | 2 min |
| A | Import, set up, see the frontend yourself | you only | ≈ 1 h |
| B | See it as a technician | you + Test A, Test B | 1–2 h |
| C | Prove security and functions (plan section H) | you + test accounts (+ IT questions) | 6–8 h |
| D | Clean down | you | 30 min |
| E | Prepare and invite the real team | you | 1–2 h |
| F | Go live | you | 15 min |
| G | First month, then routine | you | ongoing |

---

## Phase 0 — Get the right files

- [ ] **Solution zip.** The verification pass replaced it under the same file name. Open your zip, then open `solution.xml` in Notepad.
  - The correct version contains `<RootComponent type="380" schemaName="esg_SiteUrl"`.
  - If yours doesn't, re-download [`04-solution/ESGOneToOne_1_0_0_0_unmanaged.zip`](04-solution/ESGOneToOne_1_0_0_0_unmanaged.zip).
- [ ] **Frontend.** Download the latest [`02-frontend/one-to-one.html`](02-frontend/one-to-one.html) and [`02-frontend/one-to-one.js`](02-frontend/one-to-one.js) (v4.1.0).
- [ ] **Approved route.** Transfer the files the usual approved way.

## Phase A — See the system yourself (nobody else involved)

**A1. Tidy Stage 0**
- [ ] Delete the `ZZProbe…` lists.
- [ ] Delete the `probe-0a*` / `probe-0b*` files from **Welcome Web Part - Custom Layouts**.
- [ ] Keep the site, page, group and permission levels.

**A2. Import** ([IMPORT_GUIDE §1–2](04-solution/IMPORT_GUIDE.md))
- [ ] Power Automate → check you're in the right environment (top right) → **Solutions → Import solution** → the zip.
- [ ] Connections: create or pick **SharePoint**, **Office 365 Outlook** and **Office 365 Users**, all signed in as you.
- [ ] Environment variables:
  - **Site URL**, with no trailing slash;
  - **Team Leader email**.
- [ ] **Import.**
- [ ] *Solutions* asks for a Dataverse database instead? Use [`04-solution/legacy-package-builder.html`](04-solution/legacy-package-builder.html) (IMPORT_GUIDE §6), or ask IT for an environment with Dataverse.

**A3. Run setup** ([IMPORT_GUIDE §3–4](04-solution/IMPORT_GUIDE.md))
- [ ] Run **ESG 1-to-1 | 0 Setup (run once)**.
- [ ] Wait for the summary email **"ESG 1-to-1 setup: complete"**. If it says *"complete with items to check"*, fix what it lists and run setup again; it's safe to re-run.
- [ ] **Site contents:** the five lists are there (Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, 1-to-1 Settings).
- [ ] **Permissions on each list:**
  - the four data lists show **Owners – Full Control only**;
  - **1-to-1 Settings** also shows `1-to-1 Technicians` – Read.

> Setup reuses your existing group and permission levels. If a level's rights differ from the plan, it tells you and changes nothing.

**A4. Install the frontend** ([02-frontend/README §Install](02-frontend/README.md))
- [ ] Upload `one-to-one.html` and `one-to-one.js` to **Welcome Web Part - Custom Layouts**. Choose **Replace** if asked.
- [ ] `OneToOne` → **Edit**.
  - Move the Welcome web part into a **full-width section**.
  - Pencil → **Layout = ESG 1-to-1**, replacing the probe layout.
  - Turn greeting, time, weather and search **off**.
  - **Republish.**
- [ ] Site Pages → `OneToOne` → **… → Make homepage**.

**A5. Your first look**
- [ ] If you replaced the two files after choosing the layout: web part settings → **Reset layout cache** → **Republish**.
- [ ] Open the site. You see:
  - the dark top menu bar (Team overview, Monthly reviews, Expectations, Actions, Team ▾, ⚙ Settings);
  - **"No technicians yet"** on Team overview;
  - **v4.1.0** at the right-hand end of the top menu bar.
- [ ] Click through **Monthly reviews**, **Expectations**, **Actions** and **⚙ Settings**.
- [ ] **Expectations:** add one *Shared* expectation. This proves item creation and Yes/No columns in your tenant. (The *Individual* one needs a technician in the list, so it moves to Phase B.)
- [ ] Check the menu bar and content fill the width of the page.

**A6. Turn the flows on**
- [ ] Solutions → **ESG 1-to-1** → turn on **1 Daily scheduler**, **2 Review submitted** and **3 Manager decision**.

## Phase B — See it as a technician (test accounts only)

- [ ] **Technicians list → + New** for Test A, then again for Test B:
  - **Title** = name;
  - **Technician** = their account;
  - **Active** = Yes;
  - leave TechnicianAadId blank.
- [ ] Add Test A and Test B to the **`1-to-1 Technicians`** group: Site permissions → the group → New → Add users. **Untick "Send an email invitation".**
- [ ] Reload: the top bar shows **Team (2) ▾** listing Test A and Test B.
- [ ] **⚙ Settings:** give each an appraisal date. Use a summer date such as `15-Jul-2027`. Save, reopen, and check it still shows the same day (test F27).
- [ ] **Expectations:** add one *Individual* expectation for Test A (proves the Person column).
- [ ] **Flow 1 → Run.** Test A and Test B each get **"Your 1-to-1 for … is ready"**. Run it again: no new items and no second email.
- [ ] **As you:** Team overview now lists Test A and Test B.
- [ ] **As Test A** (InPrivate window):
  - open the email link: their form opens, with only *This month / My appraisal / Appraisal report* in the top menu bar;
  - fill in a few answers → **Save** → reload: answers are kept;
  - complete it → **Submit**. Within about 5 minutes it's read-only.
- [ ] **As you:** the *"1-to-1 submitted"* email arrives.
  - Open the review.
  - Add feedback and ratings, plus **two actions**, each with close-out criteria and a deadline.
  - **Complete & release.**
- [ ] **As you:** Team ▾ → Test A → **Generate appraisal report** → **Print / Save as PDF** opens a print window (allow pop-ups if asked).
- [ ] **As Test A:** the *"Feedback … is ready"* email arrives. Feedback, ratings and actions show; **My appraisal** and **Appraisal report** work.
- [ ] **As Test B:**
  - nothing of Test A's is visible;
  - changing the link to Test A's `?reviewId=` shows **"Review not found"**.

## Phase C — Prove security and functions

Work through [plan section H](IMPLEMENTATION_PLAN.md#h-testing) and record each result: Pass/Fail, date, tester, screenshot.

- [ ] **Every privacy test P1–P20.** These are mandatory: **any failure blocks go-live**. They include:
  - P15 script injection;
  - P16 code integrity;
  - P18 Settings read-only;
  - P19 TL ratings and actions;
  - P20 appraisal-date tampering.
- [ ] **Functional tests F1–F30.**
  - Date tests F13–F20 use flow 1's `varTestDate`: Edit → *Initialize varTestDate* → set → Save → Run.
  - **Clear it afterwards.**
- [ ] **Ask IT:**
  1. Is *limited-access user permission lockdown mode* off for this site?
  2. Has IT-11 been confirmed: Welcome sends no page or list data outside the tenant?
- [ ] **If anything fails,** send the prompt in [`NEXT_STEPS.md`](NEXT_STEPS.md#if-something-fails) with the redacted error, and Claude fixes it.

## Phase D — Clean down

- [ ] Delete all test items in **Monthly Reviews** and **Manager Reviews**, plus the test expectations.
- [ ] Empty the **site recycle bin**, then the **second-stage recycle bin**.
- [ ] Remove Test A and Test B from the **Technicians** list and from the **`1-to-1 Technicians`** group.
- [ ] Flow 1: `varTestDate` is **empty**.

## Phase E — Prepare and invite the real team

- [ ] **Expectations** page: enter the real **Shared** expectations and each person's **Individual** ones for **2026/27**. Stay within 10 per person; the page shows the count.
- [ ] **Technicians list:** add each technician (Title, Technician, Active = Yes).
- [ ] **`1-to-1 Technicians` group:** add the same people, **with the email invitation unticked**.
- [ ] **⚙ Settings:** set each appraisal date.
- [ ] **Invite:** send the [welcome email](03-flows/WELCOME_EMAIL.md) from your own mailbox, or brief the team in person. It tells them what's coming; access comes only through each person's own monthly link.

## Phase F — Go live

- [ ] **Flow 1 → Run** to start the current month now, or leave it to run at 07:00 on the 1st.
- [ ] Each technician has **one** review and got **one** email; **Team overview** lists everyone.

✅ **The system is fully implemented** when this phase is done and Phase C passed.

## Phase G — First month, then routine

| When | Check |
|---|---|
| Go-live day | Flow 1 run history is green; nobody is missing |
| As submissions arrive | Review → feedback, ratings, actions → **Complete & release** |
| 20th and 27th | Reminders went to those who haven't submitted |
| Next 1st | New month created; last month's unsubmitted reviews show **Overdue**; use **Close – not submitted** where needed |
| Ongoing | [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §4: quarterly permission check, starters and leavers, annual expectation rollover, 24-month retention, TL handover |
