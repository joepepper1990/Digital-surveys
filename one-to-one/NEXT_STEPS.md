# ESG 1-to-1: next steps (prepared while away from the work environment)

**Status (updated)**

- **Stage 0A is COMPLETE and accepted.** The frontend runs Welcome external JavaScript; authenticated REST reads and writes work; the TL passed A1–A6; a technician passed A1, A2, A2b and A4, was recognised as a non-owner with the write button disabled, got an empty/denied list result, and an independent direct-record request confirmed the technician could not retrieve an existing item that the TL could. (The automated A3 check was over-strict; the direct-record test settled it.)
- The blank-frontend issue was traced to a Welcome support list, `WMW_WMReplyWelcomeWebPartErrors`, which a non-owner may need **Read** on. This is handled in the Stage 0B README §17 and plan D.6.
- **Stage 0B is built and ready for live testing** — see [`02-frontend/probe/README-stage0b.md`](02-frontend/probe/README-stage0b.md). Not yet run against the live corporate accounts, so Stage 0B is not passed.

**Contents**

1. [Wednesday: blank frontend checklist](#1-wednesday-blank-frontend-checklist)
2. [Stage 0B security test plan](#2-stage-0b-security-test-plan)
3. [Plan review: weaknesses and simplifications](#3-plan-review-weaknesses-and-simplifications)
4. [Questionnaire check against agreed requirements](#4-questionnaire-check-against-agreed-requirements)
5. [Prototype](#5-prototype)
6. [Decisions needed from you](#6-decisions-needed-from-you)

---

## 1. Wednesday: blank frontend checklist

**About 45 minutes.** Use **Test A** in an InPrivate window, and your own account in a normal window. Write the result of each step in the record at the end. Replace the site address with `<SITE>` in anything you send back.

### How to read the symptom first

Look at Test A's page:

- **The probe box appears but some checks fail:** the script runs and a specific REST call is being refused. Go to step 2.
- **The page is blank, with not even the box or check A1:** Welcome isn't rendering the layout for Test A at all. The likely causes are a Welcome resource that Test A can't read, page publishing, audience targeting, or licensing. Do steps 1–6 in order.

### Steps (as Test A unless marked TL)

**1. The planned test.** Open `<SITE>/_api/web?$select=Title`.

| Result | Meaning | Next |
|---|---|---|
| The site title appears | Site-level REST works with Limited Access | Step 2 |
| Access denied, 401 or 403 | Limited Access isn't enough for Welcome's own calls | Step 5 |

**2. The console and network log** (this is the most decisive step).

1. Open the page and press **F12**.
   - Under **Console**, note any red errors, especially *Refused to execute script*, *Access denied* or *403*.
   - Under **Network**, tick *Preserve log*, reload, filter by **Fetch/XHR** and sort by **Status**.
2. Write down every URL that returns **401, 403 or 404**. The path tells you which list or library Welcome can't read, for example `/_api/web/lists/getbytitle('…')`.
3. If developer tools are blocked, ask IT to run this step with you.

**3. Find Welcome's own lists (TL).**

1. Open `<SITE>/_api/web/lists?$select=Title,Hidden,ItemCount` as the TL. Note every list or library whose name mentions **Welcome**, including hidden ones.
2. Compare them with the failing URLs from step 2.
3. Give the `1-to-1 Technicians` group **Read** on each **Welcome configuration** list or library: open its settings, then **Permissions → Stop inheriting → Grant**.
4. **Never** grant the group anything on data lists.
5. Retest as Test A.

**4. Publishing and targeting (TL).**

1. **Page.** Open `OneToOne`. If it shows *Saved as draft* or *Edited*, click **Republish**. Readers see only the last published version.
2. **Files.** In the layout library, check that neither file is **checked out**, and that **content approval** isn't on: **Library settings → Versioning settings**.
3. **Targeting.** Check that the page section, the Welcome web part and any Welcome content items have **no audience targeting**, or that the targeting includes Test A.
4. Retest as Test A.

**5. Isolation test: does Welcome need site-level Read? (TL, test account only, temporary).**

1. **First** protect the test list. Open `ZZProbe0A`, then **List settings → Permissions → Stop inheriting**, and remove everyone except Owners. Without this, Test A would see it.
2. **Site permissions → Advanced → Grant Permissions**: `1-to-1 Technicians`, **Read** at site level.
3. Retest as Test A.
   - **The frontend appears:** Welcome needs a site-level resource. Go to **decision D5** (section 6).
   - **Still blank:** the cause isn't permissions. Go to step 6.
4. **Remove the site-level Read afterwards**, unless D5 is agreed.

**6. Licensing and the vendor (TL or IT).**

- Ask IT whether Welcome by Accelerator 365 is licensed **per user or group** (some apps have an assignment page in the admin centre), and whether Test A is covered.
- If it's still blank, send Accelerator 365 support the console messages, with tenant details removed.

**7. Information only (TL).** Open `<SITE>/_api/site/features/GetById('7c637b23-06c4-472d-9a9a-7c175762c5c4')`.

- If data comes back, the feature "limited-access user permission lockdown mode" is **active**.
- Note the result. **Don't change it without IT.** It matters only if step 2 shows blocked application pages (`/_layouts/…`).

### Stage 0A passes when

As Test A, the probe box appears, **A1–A4 pass**, and **A3 shows no items**.

Paste the redacted results for **both** accounts into the next session, together with this record.

### Record (fill in on Wednesday)

| Step | Result | Notes |
|---|---|---|
| 1 `_api/web` | | |
| 2 Failing URLs and console errors | | |
| 3 Welcome lists found and permissions granted | | |
| 4 Published, not checked out, no targeting | | |
| 5 Site Read isolation test | | |
| 6 Licensing answer | | |
| 7 Lockdown feature | | |
| Final probe result as Test A | | |

---

## 2. Stage 0B security test plan

**When:** only after 0A passes for Test A.

**Data:** throwaway lists only, `ZZProbeRecords` and `ZZProbeManager`. They mirror Monthly Reviews (technician-editable) and Manager Reviews (manager-only until released). The 0B probe is produced after 0A. Its TL mode creates the lists, records and item permissions automatically, using the same steps as Flow 1.

**Accounts:** TL, Test A, and **Test B** (a second technician account is needed for the cross-technician tests).

**Mandatory / Informational:**

- **M (Mandatory)** = release-blocking: any failure stops progress.
- **I (Informational)** = records a fact.
- **Any I finding that shows an exploitable weakness blocks progress** until it's fixed, or the TL accepts it in writing in plan J.3.

**How to run them:** each test runs **as the TL first**. It should succeed, which proves the request itself is valid. It then runs **as Test A**, where it must be refused.

**Test setup**

| Record | Who gets access |
|---|---|
| `A-OPEN` | Test A can edit (no delete) |
| `A-LOCKED` | Test A can read only. Its text holds the attack strings. |
| `B-OPEN` | Test B can edit |
| `A-RELEASED` | Manager list. Test A can read only, without version history. Its manager note has been edited twice. |
| `A-UNRELEASED` | Manager list. Owners only. |
| `B-RELEASED` | Manager list. Test B can read. |

| # | Area | Test as Test A (TL first as control) | Pass when | M/I |
|---|---|---|---|---|
| B1 | Privacy | Read the records list | Only A's own items are returned | M |
| B2 | Privacy | Request item IDs 1–30 directly on both lists | Nothing that isn't A's own is returned | M |
| B3 | Privacy | Open B's item through `DispForm.aspx?ID=` and through the app link `?reviewId=` | Denied, or "not found" | M |
| B4 | Manager-only | Read the manager list | Only `A-RELEASED`. Never `A-UNRELEASED` or B's records. | M |
| B5 | Manager-only | Read the version history of `A-RELEASED` (through REST and `Versions.aspx`) | Denied | M |
| B6 | Record editing | Write to `A-OPEN` | Allowed, and the change is saved | M |
| B7 | Record editing | Write to `A-LOCKED` | Refused, and unchanged on re-read | M |
| B8 | Record editing | Write to B's item | Refused, and unchanged | M |
| B9 | Record editing | Create a new item, delete own item, add an attachment, add a column | All refused | M |
| B10 | Permissions | Break inheritance, add a role or create a sharing link on own open item | All refused | M |
| B11 | Code integrity | Upload or replace a file in the Welcome layout library, or edit the page | Refused | M |
| B12 | Workflow state | Write the "status" and "owner" fields on own **open** item | **Allowed.** This confirms there's no column-level security, which is why plan D.7 holds all state on the manager list. | I (expected) |
| B13 | Workflow state | Write a "status" field on `A-RELEASED` | Refused | M |
| B14 | Workflow state | Forge *Modified By* on own open item | Records whether forging works. **If it does:** confirm the plan relies on nothing that uses *Modified By* (D.7). | I |
| B15 | Malicious input | Attack strings shown in **the TL's session** and in Test A's: `<img src=x onerror=alert(1)>`, `<script>alert(2)</script>`, `"><svg onload=alert(3)>`, the Handlebars-style `{{constructor.constructor('alert(4)')()}}`, `javascript:alert(5)` | All appear as plain text, with no alert box and no link | M |
| B16 | Malicious input | Text containing quotes, brackets and JSON characters (`"},{"id":99`) saved into the expectations comment and reloaded | Comes back intact, and no extra expectation appears | M |
| B17 | Malicious input | A very long answer (about 20,000 characters) | Saves, or fails with a clear message, without breaking the page | I |
| B18 | Malicious input | Answer starting `=HYPERLINK(` then **Export to Excel** from the list | Record whether Excel would run it. Mitigation: open exports in Protected View, and don't enable editing. | I |
| B19 | Roster visibility | Read the site users and the `1-to-1 Technicians` group membership | Record what is visible. Group membership should be hidden (set to Group Owner). | I |

**What 0B can't test.** The workflow transitions themselves need the real flows: submit locks the record, and Complete or Close is validated (D.7). These are covered by the Stage 1 and Stage 4 tests F8–F12, F15–F16 and P8–P10 in the plan.

---

## 3. Plan review: weaknesses and simplifications

| # | Finding | Recommendation |
|---|---|---|
| W1 | **How technicians reach the page is unproven** (the current blank screen). The plan assumes Read on the page and layout library is enough. | Resolve on Wednesday. If Welcome needs site-level Read, D5 is a safe fallback **as long as** every data list and the test lists have unique permissions (plan D.2 already requires this). |
| W2 | The **working Welcome lifecycle structure** (external JS file) exists only in your environment. The production frontend (K3/K4) must follow it exactly. | Bring back a **redacted skeleton** of the working layout and JS wrapper, with no tenant details, before K3/K4 are written (D7 below). |
| W3 | Q9 and other choice values are stored as long sentences in SharePoint Choice columns, which the flows and dashboard compare as text. Fragile: punctuation and dashes must match exactly. | Store short codes (`Covered`, `Informal`, `Dedicated`). The frontend shows the agreed wording. This simplifies Flow 2 (E3 subject) and the dashboard (D8). |
| W4 | E.9 / K10 plans a mock SharePoint with an automated test suite, and K11 is a separate security note. Both are heavier than needed for 5–10 users. | Reuse the prototype's fictional data for local checks, and keep one small automated test for the attack strings and the save payload. Produce K11 **only if IT requires a code review** (IT-13). |
| W5 | Onboarding needs two steps: the Technicians list **and** the group. A missed group membership gives a blank page. | Keep it manual (simplest). The new-starter procedure already lists both steps. Add "check group membership" to the quarterly check. |
| W6 | The repository is **public**. It holds no tenant data, but it does publish the security design and the test attack list. | Make the repository **private** (D6). |
| W7 | List exports to Excel could carry formula-like text (B18). | Advise opening exports in Protected View. No build change. |
| — | **No other structural changes.** Four lists, three flows, two permission levels and the D.7 rules remain the minimum that's secure. | — |

---

## 4. Questionnaire check against agreed requirements

Every agreed item is present in plan section E and in the prototype. **No question, conditional section, scale or manager-comment point has been removed.**

| Requirement | Where it's met |
|---|---|
| Q1 free text, concise, draft, separate manager feedback | Q1 box with a "bullet points is fine" hint. FB_Q1. |
| Q2 four labelled inputs, no essay, separate feedback | Issue / Impact / Tried / Support. Optional, two-line boxes. FB_Q2. |
| Q3 five-point scale with the exact wording, optional comment, manager comment, monthly history | WorkloadScale. Q3 comment. FB_Q3. Dashboard workload column by month. |
| Q4 Yes/No, detail only if Yes, no medical information, HR/OH guidance, manager comment either way | Conditional detail, cleared when No. Guidance text (EAP details to be confirmed). FB_Q4 always shown. |
| Q5 Yes/No with planning details if Yes, manager comment either way | Conditional detail. FB_Q5. |
| Q6 Yes/No, what and why if Yes, covering training, qualifications, competency and aspirations, manager comment | Two conditional boxes with a hint naming all four. FB_Q6. |
| Q7 free text, manager acknowledges and comments | Q7 box. FB_Q7, labelled "acknowledgement / response". |
| Q8 up to 10 shared and individual expectations: title, measures, year, active, 1–5 progress, comment and evidence, manager feedback; managed and retired by the TL; automatic each month; history preserved; scale distinct from workload; annual rollover | Expectations list and Flow 1 snapshot (trusted copy). ProgressScale with different wording. Per-expectation feedback. Rollover procedure (G Part 11). |
| Q9 exactly three choices, TL override, meeting requests highlighted, submission doesn't count as a formal meeting | Three options. FollowUpDecision. Amber row, banner and KPI. Footer and intro wording. |
| Manager review: feedback per section and per expectation, actions with deadlines, further-discussion decision, complete, released only on completion, date and identity recorded, technician notified, record locked | E.6 and Flow 3 (D.7 transitions) |
| Drafts, deadline shown, required answers only, hidden fields never block | "Still to complete" list. Hidden fields are excluded and cleared. |
| Dashboard: KPIs, technician table, three navigation areas, history by technician and month, minimal | E.7 and the prototype |

**Wording note.** The agreed Q9 sentences use an em dash and a full stop. The prototype shows them exactly. If D8 is agreed, SharePoint stores short codes, so the wording can't drift.

---

## 5. Prototype

**File:** [`prototype/prototype.html`](prototype/prototype.html). Download it and open it in any browser.

- Fictional people and data only. Not connected to SharePoint, and nothing is saved.
- Use **View as** at the top to switch between Technician and Team Leader.

**What to review**

- **Technician:** the questionnaire, with Yes/No sections that open and close, the "still to complete" list, and the Save draft / Submit flow. October shows how released feedback appears.
- **Team Leader:** the dashboard (KPIs, filters, amber highlight for 1-to-1 requests, outstanding actions), then **Open** a review to give feedback and complete it.

It isn't production code. It's built the same way the Welcome frontend will be (scoped styles, text-only rendering, no external files), so the layout and wording can carry straight over once you've approved them.

---

## 6. Decisions needed from you

| # | Decision | Recommendation | Needed before |
|---|---|---|---|
| D5 | If Welcome needs site-level Read for technicians (step 5 shows this), accept giving `1-to-1 Technicians` **Read at site level**, with every data list on unique permissions? | **Yes, if step 5 proves it's required.** Data stays protected per item. | Finishing 0A |
| D6 | Make the GitHub repository **private**? | **Yes.** | Stage 0B (it adds the attack test details) |
| D7 | Can you bring back a **redacted skeleton** of the working Welcome layout and JS lifecycle wrapper (structure only, no tenant names)? | **Yes.** The production frontend must match it. | Production frontend (K3/K4) |
| D8 | Store choice answers as short codes, with the full agreed wording shown on screen? | **Yes.** It's simpler and more robust. | Creating the production lists |
| — | Prototype look and wording: anything to change? | Your feedback | Production frontend |

Still open with HR (unchanged): the retention period, the privacy notice approval, and the EAP / Occupational Health contact text.
