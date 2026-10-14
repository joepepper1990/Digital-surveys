# ESG 1-to-1: go-live runbook (from Stage 0B to a running system)

This is the full path from where you are now to technicians receiving their first monthly email. Work the phases in order and tick as you go. Detailed specifications live in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md); this runbook is the sequence and the operational steps that aren't in the plan (adding technicians, adding expectations, sending the first emails, monthly running).

**Where you are:** site built, Welcome proven (Stage 0A complete), Stage 0B security probe built and awaiting your live test.

**Legend:** 🧑 you do it in SharePoint/Power Automate · 🤖 a Claude session produces a file first · ⛔ a gate you must not pass until it's green.

---

## Phase 1 — Finish Stage 0B security verification 🧑 ⛔

Follow [`02-frontend/probe/README-stage0b.md`](02-frontend/probe/README-stage0b.md).

- [ ] Create `1-to-1 Edit` and `1-to-1 Read` permission levels (if not already).
- [ ] Upload `probe-0b.html` + `probe-0b.js`, select the **1-to-1 probe 0B** layout.
- [ ] As Team Leader (TL): **Prepare / verify** → all **S** rows PASS → **Run control tests** → all PASS.
- [ ] As **Test A**: run technician tests → every mandatory **B** test PASS.
- [ ] As **Test B**: run technician tests → every mandatory **B** test PASS.
- [ ] Review the informational findings (B12, B14, B17, B18, B19). None may reveal an exploitable hole.
- [ ] Clean up the test lists; keep the site, page, library, permission levels and group.
- [ ] Send me the redacted results for TL, Test A and Test B.

**⛔ Gate:** do not build the production system until every mandatory Stage 0B test has passed for both test accounts.

---

## Phase 2 — Decisions and HR inputs 🧑

Confirm these before go-live (they don't block building, but they block real data):

- [ ] **D3 retention period** — how many years reviews are kept (HR).
- [ ] **EAP / Occupational Health contact text** — the words shown under the wellbeing question (HR-3).
- [ ] **Privacy notice** approved, and whether a DPIA screening is needed (HR-2).
- [ ] **D6** — make this GitHub repo **private** (recommended; it holds the security design).
- [ ] **D8** — store choice answers as short codes (recommended; I'll build it this way unless you say otherwise).

---

## Phase 3 — I produce the production build files 🤖

Ask me (a new session) to generate these into the repo. They don't exist yet; Stage 0B proved the approach, so they're safe to build now:

- [ ] **Production frontend** — `one-to-one.html` + `one-to-one.js` (the real questionnaire, manager review and dashboard, on the same Welcome wrapper, matching the approved prototype).
- [ ] **Flow build-sheets** — exact action-by-action instructions for the three Power Automate flows and the shared permission block.
- [ ] **Email templates** — E1–E7.
- [ ] **List checklist** — the four production lists, column by column.
- [ ] **Config reference + privacy notice draft.**

**Prompt to use:**
> Produce the production build artefacts (frontend one-to-one.html/js, flow build-sheets flow1/2/3, email templates, list checklist, config reference, privacy notice) from one-to-one/IMPLEMENTATION_PLAN.md v3.2, reusing the proven probe-0a2 Welcome wrapper. Placeholders only, no tenant data. Commit and push.

---

## Phase 4 — Build the four production lists 🧑

Follow plan **section C** (and the list checklist from Phase 3). Create each with the exact internal column names.

- [ ] **Technicians** — Title, Technician (person), TechnicianAadId (text), Active (yes/no).
- [ ] **Appraisal Expectations** — Title, Measures, AppraisalYear, AppliesTo (Shared/Individual), Technician (person), SortOrder (number), Active (yes/no).
- [ ] **Monthly Reviews** — the technician answer columns (plan C.3).
- [ ] **Manager Reviews** — the authoritative record (plan C.4), with **ReviewKey** set to enforce unique values.
- [ ] For every list: versioning on, attachments off, **stop inheriting permissions** and remove the Members/Visitors groups so only **Owners** remain (plan D.2). The technicians group is **never** given access to these lists.
- [ ] Add the indexes and the views listed in section C.

**⛔ Gate:** confirm each list's permission page shows only Owners.

---

## Phase 5 — Build the three flows 🧑

Follow plan **section F** (and the Phase 3 build-sheets). All standard connectors, signed in as the TL.

- [ ] **Flow 1 — Daily scheduler** (creates each month's reviews, sets item permissions, sends the personal link E1, sends reminders on the 20th/27th, flags problems).
- [ ] **Flow 2 — Review submitted** (locks the record to read-only, stamps the authoritative record, emails you).
- [ ] **Flow 3 — Manager decision** (on Complete/Close: locks, releases feedback, emails the technician).
- [ ] Turn on **Secure inputs/outputs** on the triggers and every Get-items action.
- [ ] Test each flow once with a single test technician before adding real people.

**⛔ Gate:** on a test technician, confirm: a created review is private until the email is sent; submitting locks it; completing releases feedback and emails them.

---

## Phase 6 — Install the production frontend 🧑

- [ ] Edit the two `CONFIG` lines at the top of `one-to-one.js` (your site URL and TL email). Change nothing else.
- [ ] Upload `one-to-one.html` + `one-to-one.js` to the **Welcome Web Part - Custom Layouts** library.
- [ ] On the `OneToOne` page, set the Welcome layout to the production layout, extras off, republish.
- [ ] Make `OneToOne` the site home page.
- [ ] Confirm: as TL the page shows the **dashboard**; as a test technician the email link opens **their questionnaire**.

---

## Phase 7 — Add your technicians 🧑

For **each** technician (5–10 people):

1. [ ] Open the **Technicians** list → **+ New**.
2. [ ] **Title** = their name (e.g. `Jane Smith`).
3. [ ] **Technician** = pick their Microsoft 365 account from the people picker (this is the stable identity; **leave TechnicianAadId blank** — Flow 1 fills it in automatically).
4. [ ] **Active** = **Yes**.
5. [ ] **Save**.
6. [ ] Add them to the **`1-to-1 Technicians`** group (Site permissions → the group → New → Add Users), so they can open the page. Untick the email invitation.

- [ ] When everyone is added, the Technicians list has one Active row per person, and the group contains exactly those people (plus nobody else).

> Leavers later: set **Active = No** and remove them from the group. New starters: add a row and add to the group; they get a review the next morning.

---

## Phase 8 — Add each technician's current appraisal expectations 🧑

Open the **Appraisal Expectations** list. Use **Edit in grid view** to add rows quickly. Each technician may have **up to 10** active expectations, made up of shared ones plus their own.

**For a shared expectation (applies to everyone):**
1. [ ] **Title** = the expectation (e.g. `Complete annual safety refresher`).
2. [ ] **Measures** = how success is judged (e.g. `Course passed and recorded by end of Q4`).
3. [ ] **AppraisalYear** = e.g. `2026/27`.
4. [ ] **AppliesTo** = **Shared**. Leave **Technician** blank.
5. [ ] **SortOrder** = a number for ordering (e.g. 10, 20, 30…).
6. [ ] **Active** = **Yes**.

**For an individual expectation (one person):**
- [ ] Same as above, but **AppliesTo** = **Individual** and **Technician** = that person.

Checks:
- [ ] Use the **Needs attention** view to catch any Individual rows with no technician set.
- [ ] No technician ends up with more than 10 active expectations (shared + their own). Flow 1 warns you if they do, but it's better to check now.
- [ ] Spot-check one technician: shared rows + their individual rows ≤ 10.

> These are copied into each monthly review when it's created, so later edits never change past reviews. Annual rollover is in plan G Part 11.

---

## Phase 9 — End-to-end rehearsal with test accounts 🧑 ⛔

Before any real person is emailed, run the full journey once with **Test A** and **Test B** (temporarily add them as Active technicians):

- [ ] Run **Flow 1** manually → Test A and Test B each get an email.
- [ ] As Test A: open the link, save a draft, complete the questionnaire (including a few expectations), submit.
- [ ] As TL: you're notified; open the review, add feedback per section and per expectation, set actions, **Complete & release**.
- [ ] As Test A: you receive the feedback email and can read the released feedback; the review is read-only.
- [ ] Confirm Test B never saw any of Test A's data at any point.
- [ ] Run the relevant privacy tests from plan **section H** (P1–P17).

**⛔ Gate:** every privacy test passes, and the full journey works end to end. Then remove Test A/Test B from the Technicians list and the group, and delete their test reviews.

---

## Phase 10 — Go live: send the first emails 🧑

- [ ] Confirm all real technicians are Active in the Technicians list and in the group.
- [ ] Confirm Flow 1, Flow 2 and Flow 3 are all **On**.
- [ ] Confirm the HR inputs from Phase 2 are in (EAP text in the frontend; privacy notice available).
- [ ] **Send the first emails now** by opening **Flow 1** → **Run** → **Run flow**. (It's idempotent and safe to run any time; you don't have to wait for the 1st of the month.) Each active technician gets their personal link for the current month.
   - Or, if you'd rather start next month, just leave Flow 1 on and it fires automatically at 07:00 on the 1st.
- [ ] Check: each technician has one review for this month, each got exactly one email, and the dashboard lists everyone.

---

## Phase 11 — Running it each month 🧑

The system now runs itself. Your routine:

| When | What happens / what you do |
|---|---|
| 1st, 07:00 | Flow 1 creates each technician's review and emails the link. Check the run succeeded and the dashboard shows everyone. |
| During the month | Technicians fill in and submit. You get an email on each submission; review and **Complete & release**. |
| 20th & 27th | Automatic reminders to anyone who hasn't submitted. |
| Last day, 23:59 | Deadline. Unsubmitted reviews show as overdue; you can **Close – not submitted** after the deadline. |
| Quarterly (5 min) | Check the Owners group is just you, Members/Visitors empty, and the `1-to-1 Technicians` group holds only current technicians. |
| Annually | Roll over appraisal expectations (plan G Part 11); run the retention deletion once HR has set the period. |

Corrections after release: edit the item in SharePoint and note the reason in the Manager Review's **CorrectionLog**; version history is the audit trail.

---

## Quick status map

| Phase | Needs | State |
|---|---|---|
| 1 Stage 0B test | you, live | **built, awaiting your test** |
| 2 decisions / HR | you + HR | open |
| 3 build files | me | not started |
| 4 lists | you | after Phase 3 |
| 5 flows | you | after Phase 4 |
| 6 frontend | you | after Phase 3 |
| 7 technicians | you | after Phase 6 |
| 8 expectations | you | after Phase 4 |
| 9 rehearsal | you | after Phases 5–8 |
| 10 go live | you | after Phase 9 |
| 11 monthly | you | ongoing |

**Rough hands-on time after Stage 0B passes:** Phase 3 is a Claude session; Phases 4–6 about 10–14 h; Phases 7–8 about 1–2 h for 5–10 people and their expectations; Phase 9 about 3–4 h; Phase 10 a few minutes. Spread over a couple of weeks around approvals.
