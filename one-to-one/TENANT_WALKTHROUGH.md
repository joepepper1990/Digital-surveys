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

- [ ] **Solution zip.** Download [`04-solution/ESGOneToOne_1_3_0_0_unmanaged.zip`](04-solution/ESGOneToOne_1_3_0_0_unmanaged.zip) (1.3.0.0). Open it, then open `solution.xml` in Notepad: it shows `<Version>1.3.0.0</Version>` and contains `<RootComponent type="380" schemaName="esg_SiteUrl"`.
- [ ] **Frontend.** Download the latest [`02-frontend/one-to-one.html`](02-frontend/one-to-one.html) and [`02-frontend/one-to-one.js`](02-frontend/one-to-one.js) (v4.5.0). Desktop only – phones are out of scope.
- [ ] **Already imported an earlier version (1.2.1 or before)?** Upgrade instead of A2–A3 ([IMPORT_GUIDE §0](04-solution/IMPORT_GUIDE.md)):
  1. Import `ESGOneToOne_1_3_0_0_unmanaged.zip` as an **Upgrade**.
  2. Re-run **0 Setup** (creates the *1-to-1 Challenges* list and the new Manager Reviews columns).
  3. Turn on **7 Challenge** (and check flows 1–6 are On).
  4. Upload `one-to-one.html` and `one-to-one.js` with **Replace**, then **Reset layout cache** → **Republish** (A4–A5).
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
- [ ] **Site contents:** the eight lists are there (Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Settings, 1-to-1 Feedback, 1-to-1 Challenges).
- [ ] **Permissions on each list:**
  - the five data lists (including **Wellbeing Assessments**) show **Owners – Full Control only**;
  - **1-to-1 Feedback** and **1-to-1 Challenges** show Owners plus `1-to-1 Technicians` – **1-to-1 Submit** (each person sees only their own items);
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
  - the dark top menu bar (Team overview, Monthly reviews, Expectations, Actions, Wellbeing, Team ▾, ⚙ Settings);
  - **"No technicians yet"** on Team overview;
  - **v4.5.0** at the right-hand end of the top menu bar;
  - the 💬 **Feedback** button bottom-right.
- [ ] Click through **Monthly reviews**, **Expectations**, **Actions** and **⚙ Settings**.
- [ ] **Expectations:** add one *Shared* expectation. This proves item creation and Yes/No columns in your tenant. (The *Individual* one needs a technician in the list, so it moves to Phase B.)
- [ ] Check the menu bar and content fill the width of the page.

**A6. Turn the flows on**
- [ ] After the Setup summary email: Solutions → **ESG 1-to-1** → turn on **2 Review submitted**, **3 Manager decision**, **4 Team members**, **5 Wellbeing**, **6 Feedback**, **7 Challenge**, and **1 Daily scheduler** last.

## Phase B — See it as a technician (test accounts only)

- [ ] **⚙ Settings → Team → + Add a person** → search for Test A → **Add**; then Test B. Flow 4 adds them to the `1-to-1 Technicians` group within about 5 minutes and emails you.
- [ ] Reload: the top bar shows **Team (2) ▾** listing Test A and Test B.
- [ ] **⚙ Settings → Team:** give each an appraisal date (type `15/07/2027` or pick with 📅). Save, reopen, and check it still shows the same day (tests F27, F31).
- [ ] **Expectations:** add one *Individual* expectation for Test A (proves the Person column).
- [ ] **Flow 1 → Run.** Test A and Test B each get **"Your 1-to-1 for … is ready"**. Run it again: no new items and no second email.
- [ ] **As you:** Team overview now lists Test A and Test B.
- [ ] **As Test A** (InPrivate window):
  - open the email link: their form opens, with only *This month / My appraisal / Appraisal report / Wellbeing* in the top menu bar;
  - fill in a few answers, wait until it says **Saved hh:mm** (about 5 seconds), then reload: answers are kept (F43);
  - unanswered required questions have an orange border; press **Submit** with gaps: they turn red and the page jumps to the first (F45);
  - the expectation ratings are **words** (*Not started … Fully met*), not numbers (F46);
  - complete it → **Submit**. Within about 5 minutes it's read-only.
- [ ] **As Test A:** 💬 **Feedback** → Fault → a short message → **Send** → *"Thank you. Your feedback has been submitted to your Team Leader."* **As you:** *"1-to-1 feedback (Fault): …"* arrives within about 5 minutes (F41).
- [ ] **As you:** the *"1-to-1 submitted"* email arrives.
  - Open the review.
  - Add feedback and ratings, plus **two actions**, each with close-out criteria and a deadline.
  - **Complete & release.**
- [ ] **As you:** Team ▾ → Test A → **Generate appraisal report** → **Print / Save as PDF** opens a print window (allow pop-ups if asked).
- [ ] **As Test A:** the *"Feedback … is ready"* email arrives. Feedback, ratings and actions show; **My appraisal** and **Appraisal report** work, with bands and words only (no numbers) and *To move up to …, focus on* three expectations (F46, F47).
- [ ] **As Test A:** on the released review, ⚑ **Challenge** one rating and the overall feedback, add a note → **Send challenge**. **As you:** *"1-to-1 feedback challenged: …"* arrives within about 5 minutes; the review shows the banner and the challenged parts in amber. Both press *agree – resolved*: it closes as **Agreed** (F48).
- [ ] **As Test B:**
  - nothing of Test A's is visible;
  - changing the link to Test A's `?reviewId=` shows **"Review not found"**.

## Phase C — Prove security and functions

Work through [plan section H](IMPLEMENTATION_PLAN.md#h-testing) and record each result: Pass/Fail, date, tester, screenshot.

- [ ] **Every privacy test P1–P29.** These are mandatory: **any failure blocks go-live**. They include:
  - P15 script injection;
  - P16 code integrity;
  - P18 Settings read-only;
  - P19 TL ratings and actions;
  - P20 appraisal-date tampering;
  - P29 forging a challenge's state.
- [ ] **Functional tests F1–F48.**
  - Date tests F13–F20 use flow 1's `varTestDate`: Edit → *Initialize varTestDate* → set → Save → Run.
  - **Clear it afterwards.**
- [ ] **Ask IT:**
  1. Is *limited-access user permission lockdown mode* off for this site?
  2. Has IT-11 been confirmed: Welcome sends no page or list data outside the tenant?
- [ ] **If anything fails,** send the prompt in [`NEXT_STEPS.md`](NEXT_STEPS.md#if-something-fails) with the redacted error, and Claude fixes it.

## Phase D — Clean down

- [ ] Delete all test items in **Monthly Reviews** and **Manager Reviews**, plus the test expectations.
- [ ] Empty the **site recycle bin**, then the **second-stage recycle bin**.
- [ ] **⚙ Settings → Team → Deactivate** Test A and Test B (Flow 4 removes them from the group), then delete their Technicians items; delete their Wellbeing Assessments, 1-to-1 Feedback and 1-to-1 Challenges items too.
- [ ] Flow 1: `varTestDate` is **empty**.

## Phase E — Prepare and invite the real team

- [ ] **⚙ Settings → Team → + Add a person** for each technician. Flow 4 gives them access within about 5 minutes (SharePoint sends no invitation). Don't add people to the group by hand: Flow 4 removes anyone without an Active row in the team list.
- [ ] **⚙ Settings → Team:** enter each **appraisal date** → Save. Optionally change the reminder days or role words (⚙ Settings → Reminders / Names).
- [ ] **Expectations** page: enter the real **Shared** expectations and each person's **Individual** ones for **2026/27** (after the team, so people appear in the dropdown). Stay within 10 per person; the page shows the count.
- [ ] **Invite:** send the [welcome email](03-flows/WELCOME_EMAIL.md) from your own mailbox, or brief the team in person. It tells them what's coming; access comes only through each person's own monthly link.

## Phase F — Go live

- [ ] **Flow 1 → Run** to start the current month now, or leave it to run at 07:00 on the 1st.
- [ ] Each technician has **one** review and got **one** email; **Team overview** lists everyone.

✅ **The system is fully implemented** when this phase is done and Phase C passed.

## Phase G — First month, then routine

| When | Check |
|---|---|
| Go-live day | Flow 1 run history is green; nobody is missing |
| As submissions arrive | Review → feedback, ratings, actions → **Complete & release**. A challenge (E14): talk it through, then **Agree – resolved**. |
| Your reminder days (default 20th and 27th) | Reminders went to those who haven't submitted |
| Next 1st | New month created; last month's unsubmitted reviews show **Overdue**; use **Close – not submitted** where needed |
| Ongoing | [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) §4: quarterly permission check, starters and leavers, annual expectation rollover, monthly 24-month retention deletion, TL handover |
