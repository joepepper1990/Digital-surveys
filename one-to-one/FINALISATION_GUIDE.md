# ESG Monthly Technician 1-to-1 — Finalisation Guide

**From the end of Stage 0B to a live system, then running it month to month.** This document is self-contained: you don't need any other file to follow it. Tick each box as you go.

Version: system v4.4.0 (frontend) · solution 1.2.0.0 · guide dated 15-Oct-2026

---

## 1. Where you are, and what "complete" means

**Already done:**

- **Stage 0A/0B passed** in the live tenant:
  - the private site exists, with the `OneToOne` page and the Welcome web part;
  - the `1-to-1 Technicians` group exists;
  - the `1-to-1 Edit` and `1-to-1 Read` permission levels exist.
- **Everything to install is built and verified offline:**
  - frontend: 182 automated checks;
  - flows: simulated end to end, 167 checks, and 23 deliberately broken copies all caught by the validator;
  - two independent reviews fixed 29 defects (see VERIFICATION.md).

**Not yet proven:** nothing has run in your tenant yet.

> **The system is fully implemented when Phase F (go-live) is done and every privacy test (P1–P25) in Phase C has passed.**

| Phase | What | Who's involved | Time |
|---|---|---|---|
| 0 | Get and check the files | you | 5 min |
| A | Import, set up, see the frontend yourself | you only | ≈ 1 h |
| B | Walk through it as a technician | you + Test A + Test B | 1–2 h |
| C | Security and functional test record | you + test accounts (+ 2 IT questions) | 6–8 h |
| D | Clean down | you | 30 min |
| E | Prepare and invite the real team | you | 1–2 h |
| F | Go live | you | 15 min |
| G | First month, then routine | you | ongoing |

---

## 2. What you need

**The three system files** (nothing else goes into SharePoint or Power Automate):

| File | Goes to |
|---|---|
| `ESGOneToOne_1_2_0_0_unmanaged.zip` | Power Automate → **Solutions → Import solution**. Contains the seven flows; the setup flow creates the lists. |
| `one-to-one.html` | SharePoint → *Welcome Web Part - Custom Layouts* library |
| `one-to-one.js` | Same library, alongside the `.html` |

**Fallback only:** if your environment can't import solutions (no Dataverse), use `legacy-package-builder.html` instead (§4.8).

**Accounts:**

- **you**, the Team Leader: site owner **and Site Collection Administrator**;
- **Test A** and **Test B**: two test technician accounts with mailboxes.

## 3. Phase 0 — Get and check the files (5 min)

- [ ] **Right zip.** Open the zip, then open `solution.xml` in Notepad. It must contain `<RootComponent type="380" schemaName="esg_SiteUrl"`. If it doesn't, you have an older download: get the latest one.
- [ ] **Right frontend.** You have `one-to-one.html` and `one-to-one.js` (v4.4.0). After installing, the top menu bar must show **v4.4.0** (right-hand end).
- [ ] **Unchanged files.** Transfer them the usual approved way. Don't open and re-save them in Word.

---

## 4. Phase A — Import, set up and see the frontend yourself (≈ 1 h, nobody else involved)

### 4.1 Tidy up Stage 0

- [ ] **Site contents:** delete the `ZZProbe…` test lists.
- [ ] **Welcome Web Part - Custom Layouts:** delete `probe-0a*` and `probe-0b*`.
- [ ] **Keep** the site, the `OneToOne` page, the `1-to-1 Technicians` group and the two permission levels.
- [ ] **Check:**
  - The site's regional settings are **English (United Kingdom)** and time zone **(UTC) Dublin, Edinburgh, Lisbon, London**. They're under Site information → View all site settings → Regional settings.
  - You are **Site Collection Administrator**.

### 4.2 Import the solution (10 min)

> **Already imported an earlier version?** Import this zip over it the same way: it says it will **upgrade**; leave *"Enable Plugin steps and flows"* unticked and keep your connections and values. Then run **0 Setup** again (4.3): it adds what's missing, such as the 1-to-1 Feedback list (new in 1.2) and, from 1.0, the Wellbeing list and Reminders setting. Then check every flow is On (4.7), upload the new frontend files with **Replace** and **Reset layout cache** (4.5).

1. [ ] Go to **make.powerautomate.com**, signed in as yourself.
2. [ ] Top right: pick the environment IT named for the flows.
3. [ ] Left menu: **Solutions**.
   - If it asks to create a **Dataverse database**, or *Solutions* is missing, use §4.8 instead.
4. [ ] **Import solution → Browse →** `ESGOneToOne_1_2_0_0_unmanaged.zip` → **Next → Next**.
5. [ ] **Connections.** For each of the three, pick yours or click **+ New connection**, signed in as you:

   | Connection reference | Connector |
   |---|---|
   | ESG 1-to-1 SharePoint | SharePoint |
   | ESG 1-to-1 Outlook | Office 365 Outlook |
   | ESG 1-to-1 Office 365 Users | Office 365 Users |

6. [ ] **Environment variables:**

   | Variable | Value |
   |---|---|
   | ESG 1-to-1 Site URL | `https://<tenant>.sharepoint.com/sites/<site>`, the full site address with **no trailing slash** |
   | ESG 1-to-1 Team Leader email | your email address |

7. [ ] **Import.** Wait for *"imported successfully"* (1–2 minutes). If there's an error, copy the text from **Solutions → History**.

### 4.3 Run the setup flow (5 min)

1. [ ] **Solutions → ESG 1-to-1 → ESG 1-to-1 | 0 Setup (run once) → Run → Run flow.** If asked, confirm the connections (**Continue**).
2. [ ] Wait for **Succeeded** (2–4 minutes).
3. [ ] Your inbox: **"ESG 1-to-1 setup: complete"**.
   - If it says *"complete with items to check"*, fix exactly what the email lists, then run setup again. It is safe to re-run.

**What setup does:**

| Item | Result |
|---|---|
| Permission levels | `1-to-1 Edit` and `1-to-1 Read`, with the exact rights in plan D.3. It creates them if missing. If one already exists with different rights, it **warns and doesn't change it**. |
| Group | `1-to-1 Technicians`, created if missing. Membership is visible to group members only. SharePoint has no owner-only option, so technicians can see who else is in the group. No join requests. **No site permissions.** |
| Lists | **Technicians**, **Appraisal Expectations**, **Monthly Reviews**, **Manager Reviews**, **Wellbeing Assessments**, **1-to-1 Settings**, **1-to-1 Feedback**, matching the agreed list specification exactly: every column type, choice, default, min/max and index, *Enforce unique values* on `ReviewKey`, and the views *Active*, *Needs attention*, *Retired* (Appraisal Expectations), *Overdue*, *Open actions* (Manager Reviews) and *Reviews due* (Wellbeing Assessments). |
| List settings | Versioning on (100 versions), attachments off, not in search, offline sync off, not on the quick launch |
| List permissions | Inheritance stopped. **Owners – Full Control only.** **1-to-1 Settings** also gets `1-to-1 Technicians` – Read. |
| `Bands` and `Reminders` settings | The default band thresholds, and reminder days 20th and 27th |
| 1-to-1 Feedback (1.2) | Item-level permissions: each person reads and edits only their own items; `1-to-1 Technicians` – **Contribute** on this list only |
| Checks (warnings only) | You are Site Collection Admin; regional settings are English (UK) and London time; the Site URL has no trailing slash |

### 4.4 Check the result (5 min)

- [ ] **Site contents** shows the seven lists: Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, **Wellbeing Assessments**, 1-to-1 Settings, **1-to-1 Feedback**.
- [ ] Each list → ⚙ → **List settings → Permissions for this list**:
  - Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews and **Wellbeing Assessments** (health information) show **only** *Owners – Full Control*;
  - **1-to-1 Settings** shows Owners **and** `1-to-1 Technicians` – Read;
  - **1-to-1 Feedback** shows Owners **and** `1-to-1 Technicians` – **Contribute**; its Advanced settings → *Item-level permissions* are "Read items that were created by the user" and "Create items and edit items that were created by the user".
- [ ] **1-to-1 Settings** contains two items, **Bands** and **Reminders**.
- [ ] Spot check: Monthly Reviews → List settings → click **Q9FollowUp**. The address ends `Field=Q9FollowUp`, and it has three choices.

### 4.5 Install the frontend (15 min)

1. [ ] **Site contents → Welcome Web Part - Custom Layouts → Upload → Files.** Upload `one-to-one.html` and `one-to-one.js` together. Choose **Replace** if asked.
2. [ ] Open the **OneToOne** page → **Edit**.
   - If the Welcome web part isn't already in a **full-width section**, add one and move the web part into it.
   - Web part **pencil** → **Layout = ESG 1-to-1**. This replaces the probe layout.
   - Greeting, time, weather and search: **off**; on the Content tab, News posts and Slides **off**.
   - If you upload a newer version later: **Reset layout cache** in the web part settings, then republish.
   - **Republish.**
3. [ ] **Site Pages → OneToOne → … → Make homepage.**
4. [ ] **Group permissions.** `1-to-1 Technicians` has **Read on exactly these, nothing more** (set in Stage 0; setup did the last one):
   - the `OneToOne` page;
   - the *Welcome Web Part - Custom Layouts* library;
   - the *Welcome Web Part - Errors* list;
   - the 1-to-1 Settings list.

### 4.6 Your first look

- [ ] **Version check.** If you replaced `one-to-one.html` / `one-to-one.js` after first choosing the layout: web part settings (pencil) → **Reset layout cache** → **Republish**.
- [ ] Open the site. You should see:
  - a dark **top menu bar**: Team overview, Monthly reviews, Expectations, Actions and Wellbeing on the left; **Team (0) ▾** and **⚙ Settings** on the right;
  - the month, deadline, ↻ Refresh and **v4.4.0** at the far right;
  - a round 💬 **Feedback** button at the bottom-right;
  - **Team overview** showing six tiles at 0, then *"No technicians yet"* with four numbered getting-started steps.
- [ ] Click through **Monthly reviews**, **Expectations**, **Actions**, **Wellbeing** and **⚙ Settings**. Expect no errors (empty pages are normal for now).
- [ ] **Expectations:** add one *Shared* expectation. This proves item creation and the Yes/No column work in your tenant.
  - Leave it Active if it's a real one; otherwise **Retire** it.
  - The *Individual* expectation (Person column) is tested in Phase B: the Technician dropdown is empty until someone is in the Technicians list.
- [ ] **Width and size:** the menu bar and content fill the page width, and the page ends where its content ends.
  - On a large monitor the layout scales itself up.
  - Ctrl + / Ctrl − still adjusts it per person.

> You can't see the *technician* side with your own account: the page always recognises you as Team Leader. Phase B uses Test A for that.

### 4.7 Turn on flows 1 to 6

- [ ] Only after the Setup summary email (4.3). **Solutions → ESG 1-to-1** → select each flow → **Turn on**, in this order:
  1. **2 Review submitted**
  2. **3 Manager decision**
  3. **4 Team members** – gives people you add in ⚙ Settings → Team access to the page
  4. **5 Wellbeing** – wellbeing assessments
  5. **6 Feedback** – emails you what people send with the 💬 Feedback bubble
  6. **1 Daily scheduler** – last, so its first run finds everything ready
- [ ] **0 Setup** stays On (it only runs when you click Run).

### 4.8 Fallback: no Dataverse (legacy packages)

Only if §4.2 step 3 showed that solutions can't be imported:

1. Open `legacy-package-builder.html` in Edge or Chrome (double-click the file). It works offline.
2. Enter the **site URL** and **your email**, then click **Create the six packages**. Six zips download: `ESG-1to1-0-legacy.zip` to `ESG-1to1-5-legacy.zip`.
3. For each zip, in order 0 to 5:
   1. Power Automate → **My flows → Import → Import Package (Legacy)** → **Upload**.
   2. Under **Related resources**, click each connection (spanner icon), pick your own connection, and click **Save**.
   3. Under *Import setup*, keep **Create as new**.
   4. Click **Import**.
4. Continue at §4.3 (run the setup flow), then §4.4–§4.7. Find the flows under **My flows** rather than *Solutions*.

**Differences in legacy mode:**

- The site URL and email are written into the flows. To change them later, re-run the builder and re-import (*Update*), or edit the flows.
- Legacy flows may import **On**. Make sure flows 1–6 are **off** until setup has run, or let them fail harmlessly. Each failure emails you *"action needed"*, naming the step `STOP_run_the_setup_flow_first`.

---

## 5. Phase B — Walk through it as a technician (test accounts only, 1–2 h)

- [ ] **⚙ Settings → Team → + Add a person:** search for **Test A** → **Add**, then the same for **Test B**. No SharePoint lists or groups to edit by hand.
  - Within about 5 minutes Flow 4 adds each to the `1-to-1 Technicians` group and emails you *"1-to-1: access given to …"* (test F32).
- [ ] **Reload the page.** The top bar shows **Team (2) ▾**, and opening it lists Test A and Test B.
- [ ] **⚙ Settings → Team:** give each an appraisal date – type it (e.g. `15/07/2027`) or pick it with 📅. Use a summer date. Save, reopen, and check it **still shows the same day** (tests F27, F31 and R16).
- [ ] **Expectations:** add one **Individual** expectation for Test A. This proves the Person column works; *Expectations per technician* shows Test A with one more than Test B.
- [ ] **Power Automate → Flow 1 → Run.** Test A and Test B each get *"Your 1-to-1 for … is ready"*.
  - **Run it again:** no new items, no second email.
- [ ] **As you:** Team overview lists Test A and Test B.
- [ ] **As Test A** (InPrivate window):
  - Open the email link. Their form opens. The top menu bar has only *This month · My appraisal · Wellbeing · Appraisal report*, with no Team menu or Settings.
  - Fill in a few answers. Within about 5 seconds the top shows **Saved hh:mm** – no need to click Save. Reload: the answers are kept (F43).
  - Complete everything → **Submit**. Within about 5 minutes the review becomes read-only.
- [ ] **As you:** *"1-to-1 submitted"* arrives. Monthly reviews shows a badge, and **Team ▾** shows a red dot next to Test A.
  - Open the review. Add feedback per question and a 1–5 rating per expectation.
  - Add **two actions**, each with owner, close-out criteria and deadline.
  - Click **Complete & release**.
- [ ] **As you:** Team ▾ → Test A → **Generate appraisal report** → **Print / Save as PDF**. A print window opens. If not, allow pop-ups for the SharePoint site.
- [ ] **As Test A:** *"Feedback … is ready"* arrives. Feedback, ratings and actions are visible; **My appraisal** and **Appraisal report** work.
- [ ] **Wellbeing (tests F37–F39):**
  - **As you:** **Wellbeing → + Start** for Test A, with a meeting date.
  - **As Test A:** *"Your wellbeing assessment is ready to complete"* arrives → open it → work through the steps → **Submit**.
  - **As you:** *"Wellbeing assessment submitted"* arrives → open it → add an arrangement, notes and the next review date (a year on by default) → **Complete**.
  - **As Test A:** *"Your wellbeing assessment record is ready"* arrives; the agreed record shows; **Print / Save as PDF** works.
- [ ] **Month two – "Since last time" (F44):** with Flow 1's test date set to the next month (§6), Test A's new form starts with **Since last time**: what they raised, your replies and their actions.
- [ ] **Feedback (tests F41, P25):**
  - **As Test A:** click 💬 **Feedback** (bottom-right) → **Fault** → type a short message → **Send**. It says *"Thank you. Your feedback has been submitted to your Team Leader."*
  - **As you:** within about 5 minutes *"1-to-1 feedback (Fault): …"* arrives, naming Test A, the page and the version.
- [ ] **As Test B:**
  - nothing of Test A's is visible anywhere, including Wellbeing and Test A's feedback;
  - opening Test A's link (`?reviewId=` with A's number) shows **"Review not found"**, and `?wbId=` with A's assessment number shows **"Assessment not found"**.

---

## 6. Phase C — Security and functional test record (6–8 h, can span several days)

**Pass mark:**

- Every **P** test is mandatory: any failure **blocks go-live** until fixed (§11.3).
- F tests must pass too.

**Test date.** Tests F13–F20 change the date Flow 1 believes it is:

1. Open Flow 1 → **Edit** → **Initialize varTestDate** → set the value (e.g. `2026-11-20T07:00:00`).
2. **Save**, then **Run**.
3. **Clear the value afterwards and save.**

**How to record results.** For each test, record Pass or Fail, the date, the tester and a screenshot.

**How to run the P (privacy) tests**

- **Mandatory (release-blocking):** every F test, and every P test marked. Any failure stops progression.
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

### 6.1 Functional tests (F1–F44)

| # | Test | Expected | Result | Date | Initials |
|---|---|---|---|---|---|
| F1 | A opens the E1 link | The page opens on A's current review, showing the deadline |  |  |  |
| F2 | A fills Q1–Q3, clicks **Save draft**, closes the browser and reopens the link | All answers are present, and the status is Draft |  |  |  |
| F3 | A answers **No** to Q4, Q5 and Q6, then submits | Submits. Detail fields are empty in the list. |  |  |  |
| F4 | Check Q3 in the list after saving | The number 1–5 is stored. The TL's manager review shows it. |  |  |  |
| F5 | New month created with expectations loaded | A has the shared and individual expectations. B has the shared ones only. |  |  |  |
| F6 | Check the snapshot on A's Manager Review | It matches the master list at creation time |  |  |  |
| F7 | After A submits, the TL edits a shared expectation's title | A's past review (both the technician and TL views) shows the **old** text. Next month shows the new text. |  |  |  |
| F8 | A submits, waits 5 minutes, then reopens | Read-only. "Submitted" is shown. The TL gets E3. |  |  |  |
| F9 | The TL enters feedback on Q4 where the answer is No, and saves | Saves. Shown to A after release. |  |  |  |
| F10 | The TL saves feedback but doesn't complete. A reopens the review. | **No** feedback is visible |  |  |  |
| F11 | The TL clicks Complete | Within about 5 minutes A gets E4, the feedback is visible, and A can't edit anything |  |  |  |
| F12 | The TL clicks Complete on a review that is still Open (by forcing it in SharePoint) | Flow 3 rejects it, the state returns to Open, and the TL gets an email |  |  |  |
| F13 | Run Flow 1 three times on the same day | Exactly one review per technician, and one E1 each |  |  |  |
| F14 | A submitted, B in draft. `varTestDate` = this month's 20th. Run Flow 1. | Only B receives E2 |  |  |  |
| F15 | `varTestDate` = next month's 1st. Run Flow 1. | B's old review shows **Overdue** in Monthly reviews and in the *Overdue* view. B can still open and submit it, and it's marked "(late)". |  |  |  |
| F16 | After the deadline, the TL clicks **Close – not submitted** on another open review | It becomes read-only to the technician, who gets E5 |  |  |  |
| F17 | A chooses "Arrange a dedicated 1-to-1" | E3's subject is prefixed **[1-to-1 REQUESTED]**. The Team overview tile counts it and the **Team ▾** menu flags A with a red dot. A TL override replaces it. |  |  |  |
| F18 | Repeat F1, F2, F8 and F11 using **only** the Test A account (no TL shortcuts) | All pass |  |  |  |
| F19 | `varTestDate` = `2028-02-01T07:00:00` (test month only) | Manager Review DueDate = `2028-02-29T23:59:59Z` |  |  |  |
| F20 | `varTestDate` = `2027-03-01T07:00:00`, then `2026-10-01T07:00:00` | DueDate = `2027-03-31T22:59:59Z` (BST) and `2026-10-31T23:59:59Z` (GMT) |  |  |  |
| F21 | Temporarily set `varEditId` to `999`. Create a fresh test month and run. | Items are created, but **no E1 is sent**. The TL gets E7, and the technician can't see the item. Restore the value and run again: E1 is sent. |  |  |  |
| F22 | A completes a draft on a standard laptop screen (1366 px wide) at 100% zoom | Everything is usable without sideways scrolling |  |  |  |
| F23 | Correction: the TL edits a locked answer in SharePoint and adds a CorrectionLog note | The version history shows the change and who made it |  |  |  |
| F24 (v4) | The TL adds **three** action rows to A's review. One is missing its close-out criteria. The TL clicks **Complete & release**. | Blocked, with a message naming the missing field. After the TL fills it in, Complete works. In Manager Reviews, `ActionsJson` holds three rows, `ActionsStatus` = Open, and `NextActionDue` = the earliest deadline. |  |  |  |
| F25 (v4) | After release, the TL closes one action on the **Actions** page | The action moves to Done with today's date. A sees it closed. The list view *Open actions* updates. |  |  |  |
| F26 (v4) | The TL rates A's expectations 1–5 and saves without completing | A's **My appraisal** still uses A's self-ratings only. After Complete, A's outlook uses the TL ratings for that month. |  |  |  |
| F27 (v4) | ⚙ Settings: set A's appraisal date to a date in the BST period, for example `15-Jul-2027`, and save | Technicians.AppraisalDate and A's current Monthly Review AppraisalDate both show 15/07/2027. Reopening Settings shows `15-Jul-2027` (not the 14th). A's My appraisal shows the same date. |  |  |  |
| F28 (v4) | ⚙ Settings: change the *Met* threshold, then save | The 1-to-1 Settings `Bands` item updates. **A's** outlook uses the new thresholds. |  |  |  |
| F29 (v4) | Expectations page: add an Individual expectation for A, edit a Shared one, retire one | List items are created or changed (retired = Active No, not deleted). The next month's snapshot reflects them, and past months don't change. |  |  |  |
| F30 (v4) | Appraisal report as the TL (for A) and as A, then **Print / Save as PDF** | 8 sections. **No Q4 wellbeing text.** A's report shows TL content only from released months. The print window opens (allow pop-ups if asked). |  |  |  |
| F31 (v4.2) | ⚙ Settings → Team: type A's appraisal date as `5/11/2027`, save, reload; then pick a date with 📅 | Shows **05-Nov-2027** (5 November) after reload, and the picked date is kept. No "unsaved changes" prompt when you then change tab. |  |  |  |
| F32 (v4.2) | ⚙ Settings → Team → + Add a person: add a third test account, then Deactivate it | Technicians item created / Active = No. Within about 5 minutes Flow 4 adds / removes them in `1-to-1 Technicians` and emails you (E8). |  |  |  |
| F33 (v4.2) | ⚙ Settings → Names: Manager role = *Line Manager*, member role = *Engineer(s)*; check as TL and as A | Both pages use the new words; nothing else changes. Reset afterwards. |  |  |  |
| F34 (v4.2) | ⚙ Settings → Reminders: set a day = today; run Flow 1 | Only people who haven't submitted get E2. Set it back to 20 and 27. |  |  |  |
| F35 (v4.2) | Expectations: drag the 4th shared expectation to the top; add an individual one | List order changes; next month's snapshot follows it; the new individual one appears after the shared ones. |  |  |  |
| F36 (v4.2) | Team overview: switch the third chart through every option; reload | Each draws; the choice is remembered. *Needs your attention* lists waiting reviews, overdue actions, wellbeing items. |  |  |  |
| F37 (v4.2) | Wellbeing: TL starts one for A | A gets E9 within about 5 minutes; the item's *Manage access* shows Owners + A (1-to-1 Edit) only. |  |  |  |
| F38 (v4.2) | A completes every step and submits | Flow 5 locks it (A: 1-to-1 Read), stamps SubmittedOn, TL gets E10. A sees it read-only. |  |  |  |
| F39 (v4.2) | TL adds an arrangement, notes, next review date (defaults to a year on), then Complete | A gets E11 and sees the agreed record; Print shows the form with signature lines. |  |  |  |
| F40 (v4.2) | Set the next review date to 7 days ahead; run Flow 1 | TL gets E12 with a link; nothing goes to A. |  |  |  |
| F41 (v4.3) | As A: 💬 **Feedback** → Fault → type a message → **Send** | "Thank you. Your feedback has been submitted to your Team Leader." Within about 5 minutes the TL gets E13 naming A, the page and the version; the item in *1-to-1 Feedback* is Owners-only and *Sent*. |  |  |  |
| F42 (v4.3) | Turn Flow 6 **off**, send feedback as A, wait an hour (or turn Flow 6 on with the email connection broken) | The TL sees "Feedback from A … – read it here" in *Needs your attention*, can read it and **Mark as read**. |  |  |  |
| F43 (v4.4) | As A: type an answer, wait about 5 s, reload | Top shows *Saved hh:mm*; the answer is kept; the review is still a Draft (no submission email). |  |  |  |
| F44 (v4.4) | Month two (test date next month): open A's new form | **Since last time** lists last month's raised items, your released replies and A's actions. Before you release, it says *Feedback not released yet*. |  |  |  |

### 6.2 Privacy and bypass tests (P1–P25) — all mandatory

| # | Attempt by Test A | Request | Expected | Result | Date | Initials |
|---|---|---|---|---|---|---|
| P1 | Open B's review in the frontend | Page link with `?reviewId={B}` | "Not found or isn't yours" |  |  |  |
| P2 | List all reviews | GET `_api/web/lists/getbytitle('Monthly%20Reviews')/items?$select=ID,Title`, and browse to `/Lists/MonthlyReviews/AllItems.aspx` | Only A's own items |  |  |  |
| P3 | Edit B's review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/items({B})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"Q1WentWell","FieldValue":"tamper"}],"bNewDocumentUpdate":false}` | Denied. B's item is unchanged. |  |  |  |
| P4 | Create a fake review | POST `_api/web/lists/getbytitle('Monthly%20Reviews')/AddValidateUpdateItemUsingPath`, body `{"listItemCreateInfo":{"FolderPath":{"DecodedUrl":"/sites/ESG-1to1/Lists/MonthlyReviews"},"UnderlyingObjectType":0},"formValues":[{"FieldName":"Title","FieldValue":"fake"}],"bNewDocumentUpdate":false}` | Denied. No new item. |  |  |  |
| P5 | Read feedback before release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items?$select=ID,FB_Q1` | Denied or empty |  |  |  |
| P6 | Read earlier drafts after release | GET `_api/web/lists/getbytitle('Manager%20Reviews')/items({MA})/versions` | Denied. As the TL, the same request lists versions. |  |  |  |
| P7 | Read the roster and other technicians' expectations | GET `_api/web/lists/getbytitle('Technicians')/items` and `…getbytitle('Appraisal%20Expectations')/items` | Denied |  |  |  |
| P8 | Edit own submitted review | As P3, but on `{A}` after submission | Denied, and unchanged |  |  |  |
| P9 | Forge *Modified By* to dodge the lock | On A's **draft**: POST `…items({A})/validateUpdateListItem`, body `{"formValues":[{"FieldName":"ReviewStatus","FieldValue":"Submitted"},{"FieldName":"Editor","FieldValue":"[{'Key':'i:0#.f\|membership\|<TL email>'}]"}],"bNewDocumentUpdate":true}` | Note whether *Modified By* shows the TL; this goes in the security record. Within about 10 minutes the item **is locked anyway** (P8 passes). |  |  |  |
| P10 | Tamper with own draft | On a fresh draft: one `validateUpdateListItem` with DueDate `2099-12-31T00:00:00Z`, Technician `[{'Key':'i:0#.f\|membership\|<TestB email>'}]`, ReviewStatus `Completed`, and ExpectationsJson with a changed title | Within about 10 minutes: A's item is read-only, and its status shows *Submitted*. The Manager Review is *Submitted*, with SubmittedLate correct against the **real** due date. **B can't see A's item** (B runs P2). The TL screen shows the **original** expectation titles. |  |  |  |
| P11 | Grant access or share own item | POST `…items({A})/roleassignments/addroleassignment(principalid=<any number>,roledefid=1073741826)`. In the SharePoint UI, use **Share** on A's item. | Both denied |  |  |  |
| P12 | Delete own draft | POST `…items({A})/recycle()`. In the SharePoint UI, use **Delete**. | Denied. The item is still there. |  |  |  |
| P13 | Reach the TL's data through the frontend | A opens `OneToOne.aspx` with no `reviewId`, then with `?reviewId={B}` | Lands on own review, or "Review not found". The menu bar never shows TL items, because the role comes from SharePoint permissions. Even if the TL view were forced, every figure would come only from A's own items. |  |  |  |
| P14 | Rest of the site and search | A opens **Site contents**, `/Lists/MonthlyReviews/AllItems.aspx`, Site Pages and Site Assets, then searches Microsoft 365 for a phrase from B's answers | Access denied (or only A's own item in the list view), and no search results |  |  |  |
| P15 | **Script injection (XSS).** This is the attack that matters most for v3. | A types each of these into **every** text field (Q1, Q2 ×4, Q3 comment, Q4–Q6 details, Q7, every Q8 comment, Win of the month), saves, and submits: `<img src=x onerror=alert('A1')>` · `<script>alert('A2')</script>` · `"><svg onload=alert('A3')>` · `{{constructor.constructor('alert(4)')()}}` · `javascript:alert('A5')`. The TL then puts the same strings into every feedback field, the action rows (action, owner, criteria) and an expectation title, and completes the review. | When the TL opens Team overview, Monthly reviews, A's review, Actions, Expectations, A's profile and A's report, and when A opens the released review, My appraisal and their report: every string is shown **as plain text**. **No alert box ever appears**, no new link appears, and the browser console (F12) shows no errors from the layout. |  |  |  |
| P16 | **Code integrity** | In the UI, A tries to **Edit** `OneToOne.aspx` and to upload or replace a file in *Welcome Web Part - Custom Layouts*. Through the API: POST `_api/web/getfolderbyserverrelativeurl('<library server-relative URL>')/files/add(url='one-to-one.js',overwrite=true)` | Every attempt is denied. The library's version history shows only the TL. |  |  |  |
| P18 (v4) | **Settings list is read-only** | POST `_api/web/lists/getbytitle('1-to-1%20Settings')/items(1)/validateUpdateListItem`, body `{"formValues":[{"FieldName":"Value","FieldValue":"[]"}],"bNewDocumentUpdate":false}`. Also try `AddValidateUpdateItemUsingPath` on the same list. | Both denied. GET on the list succeeds (Read). |  |  |  |
| P19 (v4) | **TL ratings and actions** | Before release: GET `…getbytitle('Manager%20Reviews')/items?$select=ExpectationFeedbackJson,ActionsJson`. After release: POST `…items({MA})/validateUpdateListItem` setting `ActionsJson` to `[]`. | Before release: empty. After release: the write is denied and the data is unchanged. |  |  |  |
| P20 (v4) | **Appraisal date tampering** | On A's **draft**, write `AppraisalDate` = `01/01/2030` through `validateUpdateListItem` | Allowed (it's A's own display copy), but **only A's own view** changes. The TL's outlook and ⚙ Settings still show the Technicians list date. |  |  |  |
| P21 (v4.2) | **Read someone else's wellbeing** | B: GET `…getbytitle('Wellbeing%20Assessments')/items`, and `items({A's wellbeing id})`; open `?wbId={A's id}` | Only B's own items; A's item 404 / "not found". |  |  |  |
| P22 (v4.2) | **Forge the manager's part** | A, on their own *open* assessment: one `validateUpdateListItem` setting AssessmentStatus = Completed, ArrangementsJson, ManagerNotes, NextReviewDate, CompletedOn and Technician = B | Within about 5 minutes Flow 5 treats it as a submission: A is set to Read, status Submitted, the TL fields and CompletedOn are **cleared**, Technician is restored to A, B gains nothing. |  |  |  |
| P23 (v4.2) | **Change after submitting** | A: write to their submitted assessment | Denied (403). |  |  |  |
| P24 (v4.2) | **Join the group / see the roster** | A: GET `…getbytitle('Technicians')/items`; POST `_api/web/sitegroups(<id>)/users` | Both denied. (Only Flow 4, as the TL, changes the group.) |  |  |  |
| P25 (v4.3) | **Read someone else's feedback, or your own after sending** | B: GET `…getbytitle('1-to-1 Feedback')/items` after A sent one; A: the same once Flow 6 has run | B gets none of A's items; A gets nothing back once it's locked. |  |  |  |
| P17 | **No data leaves the tenant** | As the TL, open each view with F12 → **Network** recording (ask IT if developer tools are blocked) | Every request carrying list data goes to `<tenant>.sharepoint.com`. Record any other host contacted (for example the web part's own code CDN) for IT-11. None of them may receive review content. |  |  |  |

### 6.3 Questions for IT (record the answers)

| # | Question | Answer | Date |
|---|---|---|---|
| IT-a | Is *limited-access user permission lockdown mode* **off** for this site? (If it's on, technicians' page calls can fail.) |  |  |
| IT-b | IT-11: does the Welcome web part send any page or list data outside the tenant (licence checks, telemetry)? |  |  |

---

## 7. Phase D — Clean down (30 min)

- [ ] Delete every **test item** in Monthly Reviews, Manager Reviews and Wellbeing Assessments, and the test expectations.
- [ ] Empty the **site recycle bin**, then the **second-stage recycle bin**.
- [ ] **⚙ Settings → Team → Deactivate** Test A and Test B (Flow 4 removes them from the group), then delete their two items from the **Technicians** list. Team ▾ goes back to Team (0).
- [ ] Flow 1: **Initialize varTestDate** is **empty** (Save).

## 8. Phase E — Prepare and invite the real team (1–2 h)

- [ ] **⚙ Settings → Team → + Add a person** for each technician (Flow 4 gives them access; no invitation email is sent by SharePoint).
- [ ] **⚙ Settings → Team:** enter each **appraisal date** → Save. Optionally **⚙ Settings → Reminders / Names** to change the reminder days or the on-screen role words.
- [ ] **Expectations page:** enter the real **Shared** expectations and each person's **Individual** ones for **2026/27**. Do this after the Technicians list, so people appear in the Technician dropdown.
  - **Maximum 10 per person**; the page shows the count.
  - Expectations entered early for next year are ignored until that appraisal year starts (1 April).
- [ ] **Invite.** Send the welcome email below from your own mailbox, or brief the team in person.
  - It only tells them what's coming.
  - Access comes solely through each person's own monthly link, which works only for them.

### 8.1 Welcome email (copy, edit, send)

**Subject:** Our new monthly 1-to-1

Hi all,

From **[month]**, our monthly 1-to-1 check-in moves to a short online form on a private SharePoint page.

**How it works**

- On the 1st of each month you'll get an email from me: *"Your 1-to-1 for [month] is ready"*. The link in it opens **your** form.
- It takes about 10–15 minutes. You can save and come back as often as you like.
- The deadline is the **last day of the month at 23:59**. If you haven't submitted, you'll get reminders on the reminder days (normally the 20th and 27th).
- Once you submit, the form is locked. I'll read it, add my feedback and any agreed actions, and you'll get an email when the feedback is ready to view.
- **My appraisal** shows how you're tracking against your appraisal expectations. **Appraisal report** pulls the year together to help with your appraisal.

**Who can see it**

- Your answers are visible only to **you and me**.
- Other technicians can't see your form, your answers or your feedback, and you can't see theirs.
- Like any company system, IT administrators could technically access it.

**Things to know**

- Open the link while signed in with your own company account.
- Raise anything urgent with me directly. You don't need to wait for the form.
- If something doesn't work, tell me what you saw (a screenshot helps).

Thanks,
[Your name]

## 9. Phase F — Go live (15 min)

- [ ] **Flow 1 → Run** to start the current month now, or leave it to run automatically at **07:00 on the 1st**.
- [ ] Each technician has **exactly one** review and got **exactly one** email.
- [ ] **Team overview** lists everyone.

> ✔ **The system is fully implemented** when this phase is done and every P test in Phase C passed.

---

## 10. Phase G — First month, then the routine

| When | Check / do |
|---|---|
| Go-live day | Flow 1 run history is green; nobody is missing from Team overview |
| As submissions arrive | *"1-to-1 submitted"* email → open the review → feedback, ratings, actions → **Complete & release** |
| Your reminder days (default 20th and 27th) | Reminders went to anyone who hasn't submitted |
| Next 1st | New month is created; last month's unsubmitted reviews show **Overdue**; use **Close – not submitted** where needed |

### 10.1 Operating procedures

| When | Task |
|---|---|
| **Monthly, from the 1st** | Flow 1 creates the reviews at 07:00. Check **Team overview** shows everyone. Review submissions as E3 emails arrive: open the review, write feedback, rate expectations, add actions (close-out criteria and deadline), then **Complete & release**. After the deadline, use **Close – not submitted** for any review that wasn't submitted. |
| **Monthly, any time** | **Actions** page: close actions that are done, and agree new deadlines for overdue ones. |
| **When an appraisal date is set or changes** | ⚙ **Settings → Team** → type the date (e.g. 15/07/2027) or pick it with 📅 → **Save settings**. This updates the Technicians list and the person's current review; each date is read back to prove it saved as the same day. |
| **Reminder days or names** | ⚙ **Settings → Reminders** (up to three days, 1–28) or **→ Names** (app name and role words). Labels only – permissions never change. |
| **Wellbeing – at least yearly** | **Wellbeing → + Start** for the person (or from *Needs your attention*). They complete their part (E9); when they submit (E10) hold a private, hour-long conversation, record agreed arrangements, notes and the next review date (12 months on by default – bring it forward if needed), then **Complete** (E11). Flow 1 emails you 7 days before and on the review date (E12). You can start a new assessment at any time, e.g. after a return from absence. |
| **Quarterly (5 min)** | 1. **Site permissions:** Owners = only you; Members and Visitors empty. 2. `1-to-1 Technicians` contains only current technicians and has Read only on: the page, the layouts library, the Welcome Errors list and `1-to-1 Settings`. 3. In the layouts library, version history of `one-to-one.html` / `.js` shows only your uploads. 4. Spot-check one Monthly Review's *Manage access*: only Owners plus that technician. |
| **New starter** | ⚙ **Settings → Team → + Add a person** → search → **Add**. Flow 4 gives them access to the page within about 5 minutes (E8). Set their appraisal date and add any individual expectations. Their review appears the next morning (or run Flow 1). |
| **Leaver / long absence** | ⚙ **Settings → Team → Deactivate**. Flow 4 removes them from `1-to-1 Technicians` (E8) and no new reviews are created. Keep their records for the retention period. |
| **Correction after submission** | At the technician's request, edit the item in SharePoint (or in the app, for TL feedback). Add a dated reason to **CorrectionLog** on the Manager Review. Version history records the change. |
| **Annual expectation rollover** | Before the new appraisal year starts, add the new year's expectations on the **Expectations** page (or grid view). On the last day of the old year, **Retire** the old ones (Active = No). **Never delete them.** New reviews pick up the new set, and old reviews keep their snapshot. |
| **Feedback from the page** | Arrives by email (E13) as people use the 💬 **Feedback** bubble. If an email fails, the item shows in *Needs your attention* – read it there and **Mark as read**. Everything sent stays in the **1-to-1 Feedback** list (Owners only). |
| **Monthly retention (first working day)** | Delete reviews whose month is **more than 24 months** ago, from **both** Monthly Reviews and Manager Reviews (filter by MonthKey), **Wellbeing Assessments completed (or, if never completed, created) more than 24 months ago**, and **1-to-1 Feedback** items created more than 24 months ago. Keeping the latest assessment of a current person for longer is an exception that needs HR's agreement. Record the deletion in a dated note, then empty the site recycle bin **and** the second-stage recycle bin. Skip this step if a Purview retention label does it automatically. |
| **Subject access request** | Export Monthly Reviews, Manager Reviews and Wellbeing Assessments filtered by the person (**Export → CSV**). The technician can also use **Appraisal report → Print / Save as PDF** for their own view. |
| **TL handover** | 1. Make the new TL a site owner **and Site Collection Admin**, and remove the old TL. 2. Give the new TL the solution's flows: add them as **co-owner**, then switch the three connection references to the new TL's connections (**Solutions → ESG 1-to-1 → Connection references**). 3. Update the **ESG 1-to-1 Team Leader email** environment variable. 4. No frontend change is needed. |

---

## 11. Troubleshooting

### 11.1 Import and setup

| Symptom | Fix |
|---|---|
| Import: *"environment variable value missing"* | Enter both values in §4.2 step 6 |
| Import: connection errors | Create the connections first (**Data → Connections → New connection**), then import again |
| Setup email lists *Regional settings* | Site settings → Regional settings → Locale **English (United Kingdom)**, time zone **(UTC) Dublin, Edinburgh, Lisbon, London**. Re-run setup. |
| Setup email: *permission level … differs* | Compare with plan G Part 2. Either fix it by hand to match, or delete it and re-run setup (only if no items use it yet). |
| Setup failed (red) | Open the run, find the first red step and read its output. Common causes: you're not a site owner, or the Site URL is wrong. Fix it and re-run. |
| Flow 1–5 email *"action needed"* naming `STOP_run_the_setup_flow_first` (or `…setup_flow_again`) | Setup hasn't run (or hasn't been re-run after upgrading to 1.1), or the permission levels / lists were renamed. Run setup. |
| Someone added in ⚙ Settings → Team can't open the page | Flow 4 must be **on**; it runs within about 5 minutes. Check its run history. |
| A feedback email didn't arrive | Flow 6 must be **On**. If the email failed, the item is marked *Failed* in **1-to-1 Feedback** and shows in *Needs your attention* on the page – read it there. Check the run history. |
| A wellbeing assessment was started for the wrong person | Delete that item in **Wellbeing Assessments** (Site contents) and start a new one. Once started, an assessment stays with the person it was shared with – changing the name on it doesn't move it. |
| A wellbeing assessment didn't reach the person | Flow 5 must be **on**. Check its run history; the person needs a mailbox. |
| Import: *"flows may not have turned on … List not found"* | Expected only when upgrading before Setup has created a new list. Run **0 Setup**, then turn the flows on (§0 step 3). |
| Flow 2 / 3 never trigger | They must be **on**. The SharePoint triggers check every 5 minutes. The Site URL must have no trailing slash. |
| Need to change the TL email or site later | **Solutions → Default solution → Environment variables** → edit **Current value** |

### 11.2 Day to day

| Symptom | Likely cause | Fix |
|---|---|---|
| A saved date "goes back" or shows a different day | SharePoint read the date in another format (site or personal regional settings) | v4.2 verifies every date write and shows an error naming the fix. Set the site Locale to English (United Kingdom) and your own Microsoft 365 region to English (UK). |
| Someone added in ⚙ Settings → Team can't open the page | Flow 4 off or failed | Turn on **4 Team members**; check its run history |
| Wellbeing tab says "not set up yet" | Solution 1.1 not imported or setup not re-run | IMPORT_GUIDE §0 |
| Page still shows the old look, or the wrong version in the top menu bar | Welcome is serving its cached copy of the layout | Edit the page → web part settings → **Reset layout cache** → Republish, then Ctrl+F5 |
| Technician sees a blank page or an "access request" | Group missing Read on the page, the layouts library or the Welcome Errors list | Grant `1-to-1 Technicians` Read (plan D.6) |
| Technician's outlook uses default bands after you changed them | Group missing Read on `1-to-1 Settings` | Grant Read on that list |
| Technician: "Review not found" | Link is for someone else's review, or Flow 1 hasn't granted access yet | Check the Monthly Review's *Manage access*; re-run Flow 1 |
| TL sees the technician view | You're not Site Collection Admin / Owner on this site | Add yourself (Stage 0B finding B10a) |
| "Couldn't save … (403)" for a technician | Review already submitted (locked) | Expected. Corrections go through the TL. |
| Complete & release did nothing | Flow 3 rejected it (not submitted, or closing before the deadline) | Read the "not done" email |
| Dates show a day out | Site regional settings not on London time | Site settings → **Regional settings**: Locale English (United Kingdom), time zone (UTC) Dublin, Edinburgh, Lisbon, London |
| Print / Save as PDF does nothing | Browser blocked the pop-up | Allow pop-ups for the SharePoint site |
| Flow failure emails | See the run link in the email | Fix, then re-run. Flow 1 is safe to re-run. |
| *"action needed"* naming `STOP_run_the_setup_flow_first` | Setup hasn't run, or a list or permission level was renamed | Run **ESG 1-to-1 \| 0 Setup** (safe to re-run) |
| A list, column or view went missing | Deleted or renamed by hand | Re-run **ESG 1-to-1 \| 0 Setup**. It re-adds anything missing; renamed columns must be renamed back. |

### 11.3 Getting a fix

Use this prompt in a new Claude Code session:

```
Tenant test <ID> failed. What I did: <steps>. What I saw: <message / screenshot text,
redacted>. Browser console errors: <paste>. Fix one-to-one.js / the flow sheet as needed,
re-run the local tests, commit and push to the current branch.
```

---

## 12. Appendix

### 12.1 Names you must never change

Renaming any of these silently breaks the app or the flows.

| Kind | Names |
|---|---|
| Lists (display names) | `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings` |
| Columns | Every column name the setup flow created (List settings shows them) |
| Choice values | ReviewStatus, ReviewState, ActionsStatus, AppliesTo, AssessmentStatus, Q4–Q6 Yes/No, and the three Q9 / FollowUpDecision sentences (the first has an em dash —) |
| Settings items | Titles `Bands`, `Reminders` and `Labels` in `1-to-1 Settings` |
| Permission levels | `1-to-1 Edit`, `1-to-1 Read` |
| Group | `1-to-1 Technicians` |
| Page | `SitePages/OneToOne.aspx` (links in old emails point at it) |
| Layout | `ESG 1-to-1` (the `data-name` in `one-to-one.html`) |
| List URLs | `Lists/Technicians`, `Lists/AppraisalExpectations`, `Lists/MonthlyReviews`, `Lists/ManagerReviews`, `Lists/WellbeingAssessments`, `Lists/OneToOneSettings` (the flows find three of them by URL) |
| Solution | `ESGOneToOne`, flow names `ESG 1-to-1 \| 0…5`, environment variables `esg_SiteUrl` and `esg_ManagerEmail` |

If a list title ever has to change, edit `CONFIG.lists` at the top of `one-to-one.js` and the list chosen in each flow action.

### 12.2 What each flow does

| Flow | Starts | Job |
|---|---|---|
| ESG 1-to-1 \| 0 Setup (run once) | by hand | Creates or completes the lists, columns, indexes, views, permission levels, group, list permissions and the Bands and Reminders settings. Safe to re-run; never deletes data; emails a summary. |
| ESG 1-to-1 \| 1 Daily scheduler | 07:00 UK daily | Creates each month's reviews, makes them private, emails each technician their own link, sends reminders on your reminder days (default 20th and 27th), emails you before wellbeing reviews are due, and reports problems to you |
| ESG 1-to-1 \| 2 Review submitted | when a technician submits | Locks the review (read-only), stamps the trusted record, emails you |
| ESG 1-to-1 \| 3 Manager decision | when you Complete / Close | Validates, locks, releases your feedback to that technician only, emails them |
| ESG 1-to-1 \| 4 Team members | when you add or deactivate someone (checks every 5 min) | Gives or removes access to the page; removes anyone in the group without an Active row; emails you |
| ESG 1-to-1 \| 5 Wellbeing | as a wellbeing assessment moves on (checks every 5 min) | Shares it with that person only, locks it when they submit, stamps completion, emails you both |
| ESG 1-to-1 \| 6 Feedback | when someone uses the 💬 Feedback bubble (checks every 5 min) | Makes the item Owners-only and emails it to you; if that fails, marks it Failed and it shows in *Needs your attention* |

### 12.3 Accepted risks (from the implementation plan)

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
| R16 (v4.1) | `validateUpdateListItem` might read dd/MM/yyyy using the TL's *personal* regional settings rather than the site's | Tenant test F27 checks the round trip. If it fails, set your personal region to English (UK). |
