# ESG Monthly Technician 1-to-1 — Finalisation Guide

**From the end of Stage 0B to a live system, then running it month to month.** This document is self-contained: you don't need any other file to follow it. Tick each box as you go.

Version: system v5.1.0 (frontend) · solution 1.5.0.0 · guide dated 19-Oct-2026

---

## 1. Where you are, and what "complete" means

**Already done:**

- **Stage 0A/0B passed** in the live tenant:
  - the private site exists, with the `OneToOne` page and the Welcome web part;
  - the `1-to-1 Technicians` group exists;
  - the `1-to-1 Edit` and `1-to-1 Read` permission levels exist.
- **Everything to install is built and verified offline:**
  - frontend: 319 automated checks, 108 more for the action tracker, and 45 for the one-time reset tool;
  - flows: simulated end to end, 294 checks, and 38 deliberately broken copies all caught by the validator;
  - independent review rounds fixed 55 defects (see VERIFICATION.md).

**New in 5.1.0 / solution 1.5 – action tracking** (already on an earlier version? §4.2 has the upgrade order):

- **Every agreed action has its own record** (*1-to-1 Actions*), added automatically when you release a review and followed month to month. The tracker starts empty: actions agreed before the upgrade stay in their reviews.
- **Technicians: My actions.** Each person sees only their own actions, sends a quick update at any time, says when an action is waiting on something, and can ask you to close their own actions.
- **You: the Actions page.** What needs you first (close-out requests, overdue, due soon, waiting, no recent progress, problems), filters, one **Update…** dialog (progress, status, deadline with a reason – the original is kept – owner, waiting), agree or decline close-out, close any action, reopen with a reason, **+ New action**.
- **Outstanding actions** on every monthly review, with what changed and optional follow-up outcomes.
- **Emails:** E19 when someone asks you to close an action; E20 five working days before a deadline (to them, copied to you). No overdue emails.
- **Full history** of every action. Nothing is ever overwritten: a save made on out-of-date information is refused and reloaded.

**Also in 5.0.0 / solution 1.4** (if you are coming from 4.5.0):

- **Appraisal periods follow real completion dates.** ⚙ Settings → Team holds, per person, the next appraisal, the next wellbeing date and the appraisal period start; **Mark appraisal completed…** starts a new period of any length. Moving the next appraisal date never moves a review.
- **Missed months don't count** in averages, the forecast, the trend or on-time ("N rated reviews of M months · K missed").
- **Amendments.** A released review is read-only until you click **Amend…**; every change needs a reason, is kept in a restricted audit only you can see, and the person gets a short email (no content).
- **Reminders** for wellbeing (E12) and appraisals (E17) come from the Settings → Team dates: 7 days before, on the day, then weekly while overdue.
- **Expectations:** no limit of 10; Shared always first; they carry on into later years until retired; retired ones can be deleted permanently.
- **Challenges have been removed** (their records are kept, Owners only).
- A **one-time test-data reset tool** for clearing test records before go-live (§7).

**Not yet proven:** nothing has run in your tenant yet.

> **The system is fully implemented when Phase F (go-live) is done and every privacy test (P1–P36) in Phase C has passed.**

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
| `ESGOneToOne_1_5_0_0_unmanaged.zip` | Power Automate → **Solutions → Import solution**. Contains the eleven flows (0 Setup, 1–6 and 8–11); the setup flow creates the lists. |
| `one-to-one.html` | SharePoint → *Welcome Web Part - Custom Layouts* library |
| `one-to-one.js` | Same library, alongside the `.html` |

**Desktop only.** The page is built for laptops and desktops; phones are out of scope.

**Only for the one-time test-data reset** (§7, with its own approval): `one-to-one-reset.html` and `one-to-one-reset.js`, uploaded temporarily to the same library and removed afterwards.

**Fallback only:** if your environment can't import solutions (no Dataverse), use `legacy-package-builder.html` instead (§4.8).

**Accounts:**

- **you**, the Team Leader: site owner **and Site Collection Administrator**;
- **Test A** and **Test B**: two test technician accounts with mailboxes.

## 3. Phase 0 — Get and check the files (5 min)

- [ ] **Right zip.** Open the zip, then open `solution.xml` in Notepad. It must show `<Version>1.5.0.0</Version>` and contain `<RootComponent type="380" schemaName="esg_SiteUrl"`. If it doesn't, you have an older download: get the latest one.
- [ ] **Right frontend.** You have `one-to-one.html` and `one-to-one.js` (v5.1.0). After installing, the top menu bar must show **v5.1.0** (right-hand end).
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

> **Already on 1.4.0.0 / page 5.0.0?** Upgrade to 1.5.0.0 in this order, each step with approval: back up Manager Reviews and 1-to-1 Settings; turn off *1 Daily scheduler*; import `ESGOneToOne_1_5_0_0_unmanaged.zip` as an upgrade (flows 9, 10 and 11 arrive Off); run **0 Setup** and wait for *complete*; turn on flows **2, 3, 4, 5, 6, 8, 9, 10 and 11**; upload page 5.1.0 (Replace, Reset layout cache, Republish – the top bar shows **v5.1.0**); turn on Flow 1. Nothing is imported: the tracker starts empty. (Full order, going back and checks T1–T16: `MIGRATION_1_5.md`.)
>
> **Already imported an earlier version (1.3.0.x / page 4.5.0 or before)?** Upgrade in this order (written for 1.4 – use the 1.5 zip and page 5.1.0, and in step 5 also turn on flows 9, 10 and 11), each step with approval:
>
> 1. **Back up:** export each list to CSV (Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Feedback, 1-to-1 Challenges). Keep the old zip and page files.
> 2. **Turn off** *7 Challenge* (if you have it) and *1 Daily scheduler*.
> 3. Import `ESGOneToOne_1_5_0_0_unmanaged.zip` over it the same way: it says it will **upgrade**; leave *"Enable Plugin steps and flows"* unticked and keep your connections and values. The new **8 Amendment notice** flow arrives **Off**.
> 4. Run **0 Setup** again (4.3) and wait for *"ESG 1-to-1 setup: complete"*. It adds the new date columns and the **1-to-1 Amendments** list, and retires challenges (the technicians lose access to the 1-to-1 Challenges list; open challenges close as *Not agreed*; nothing is deleted).
> 5. Turn on flows **2, 3, 4, 5, 6 and 8**, in that order. Leave 1 and 7 off.
> 6. Upload the new frontend files with **Replace** and **Reset layout cache** (4.5). The top bar shows **v5.1.0**. (If the page goes up before step 4, it still works and shows a banner asking you to run Setup.)
> 7. ⚙ **Settings → Team**, for each person: **Appraisal period start** (the date their last appraisal was actually completed), **Next appraisal** (check it) and **Next wellbeing** (*Needs your attention* can offer the date from their last assessment – **Use it** – but only you decide). **Save settings.**
> 8. Turn on **Flow 1**.
> 9. *(Optional, separate approval.)* The one-time test-data reset (§7).
> 10. *(Separate approval.)* Delete *7 Challenge* from the solution once you're happy – an import never deletes a flow.

1. [ ] Go to **make.powerautomate.com**, signed in as yourself.
2. [ ] Top right: pick the environment IT named for the flows.
3. [ ] Left menu: **Solutions**.
   - If it asks to create a **Dataverse database**, or *Solutions* is missing, use §4.8 instead.
4. [ ] **Import solution → Browse →** `ESGOneToOne_1_5_0_0_unmanaged.zip` → **Next → Next**.
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
| Permission levels | `1-to-1 Edit`, `1-to-1 Read` and (from 1.2.1) `1-to-1 Submit`, with the exact rights in plan D.3. It creates them if missing. If one already exists with different rights, it **warns and doesn't change it**. |
| Group | `1-to-1 Technicians`, created if missing. Membership is visible to group members only. SharePoint has no owner-only option, so technicians can see who else is in the group. No join requests. **No site permissions.** |
| Lists | **Technicians**, **Appraisal Expectations**, **Monthly Reviews**, **Manager Reviews**, **Wellbeing Assessments**, **1-to-1 Settings**, **1-to-1 Feedback**, **1-to-1 Amendments**, matching the agreed list specification exactly: every column type, choice, default, min/max and index, *Enforce unique values* on `ReviewKey`, and the views *Active*, *Needs attention*, *Retired* (Appraisal Expectations), *Overdue*, *Open actions* (Manager Reviews) and *Reviews due* (Wellbeing Assessments). |
| List settings | Versioning on (100 versions), attachments off, not in search, offline sync off, not on the quick launch |
| List permissions | Inheritance stopped. **Owners – Full Control only.** **1-to-1 Settings** also gets `1-to-1 Technicians` – Read. |
| `Bands` and `Reminders` settings | The default band thresholds, and reminder days 20th and 27th |
| 1-to-1 Feedback (1.2) | Item-level permissions: each person reads and edits only their own items; `1-to-1 Technicians` – **1-to-1 Submit** on this list only (a third permission level setup creates: Contribute without delete, versions, alerts or personal views) |
| 1-to-1 Amendments (1.4) | **Owners – Full Control only** (the technicians group has no access), versioning on (100). The restricted audit of your amendments; Flow 8 emails each notice. |
| Technicians and Monthly Reviews (1.4) | New, empty columns: `NextWellbeingDate`, `AppraisalCycleStart`, `AppraisalHistoryJson`, `AppraisalBoundaries` on Technicians, and `AppraisalBoundaries` on Monthly Reviews. Existing values are untouched. |
| Action tracker (1.5) | **1-to-1 Actions**, **1-to-1 Action Updates** (folders on) and **1-to-1 Action Notices**: **Owners – Full Control only**, versioning on (100), unique keys on `ActionKey`, `ClientKey` and `NoticeKey`, indexes on the status and id columns. `ActionsSyncedOn` on Manager Reviews. The *1-to-1 Settings* item `ActionsTrackerStart` (written only the first time). Item and folder permissions are set later by Flow 9. |
| 1-to-1 Challenges (retired in 1.4) | Only on a site upgraded from 1.3: the `1-to-1 Technicians` group is removed from the list, every item is made Owners-only and any open challenge is closed as *Not agreed*. The records are **kept**. A new site never gets this list. |
| Checks (warnings only) | You are Site Collection Admin; regional settings are English (UK) and London time; the Site URL has no trailing slash |

### 4.4 Check the result (5 min)

- [ ] **Site contents** shows the eleven lists: Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, **Wellbeing Assessments**, 1-to-1 Settings, **1-to-1 Feedback**, **1-to-1 Amendments**, **1-to-1 Actions**, **1-to-1 Action Updates**, **1-to-1 Action Notices** (plus the retired 1-to-1 Challenges on a site upgraded from 1.3).
- [ ] Each list → ⚙ → **List settings → Permissions for this list**:
  - Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews and **Wellbeing Assessments** (health information) show **only** *Owners – Full Control*;
  - **1-to-1 Settings** shows Owners **and** `1-to-1 Technicians` – Read;
  - **1-to-1 Feedback** shows Owners **and** `1-to-1 Technicians` – **1-to-1 Submit**; its Advanced settings → *Item-level permissions* are "Read items that were created by the user" and "Create items and edit items that were created by the user";
  - **1-to-1 Amendments** (and the retired **1-to-1 Challenges**, if present) show **only** *Owners – Full Control*; Amendments has versioning on (100);
  - **1-to-1 Actions**, **1-to-1 Action Updates** and **1-to-1 Action Notices** show **only** *Owners – Full Control* (flow 9 later shares each action and each person's update folder individually).
- [ ] **1-to-1 Settings** contains **Bands**, **Reminders** and **ActionsTrackerStart** (the date and time Setup 1.5 first ran – never edit it).
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
  - the month, deadline, ↻ Refresh and **v5.1.0** at the far right;
  - a compact **Feedback** pill at the bottom-right;
  - **Team overview** showing six tiles at 0, then *"No technicians yet"* with four numbered getting-started steps.
- [ ] Click through **Monthly reviews**, **Expectations**, **Actions**, **Wellbeing** and **⚙ Settings**. Expect no errors (empty pages are normal for now).
- [ ] **Expectations:** add one *Shared* expectation. This proves item creation and the Yes/No column work in your tenant.
  - Leave it Active if it's a real one; otherwise **Retire** it.
  - The *Individual* expectation (Person column) is tested in Phase B: the Technician dropdown is empty until someone is in the Technicians list.
- [ ] **Width and size:** the menu bar and content fill the page width, and the page ends where its content ends.
  - On a large monitor the layout scales itself up.
  - Ctrl + / Ctrl − still adjusts it per person.

> You can't see the *technician* side with your own account: the page always recognises you as Team Leader. Phase B uses Test A for that.

### 4.7 Turn on flows 1–6 and 8–11

- [ ] Only after the Setup summary email (4.3). **Solutions → ESG 1-to-1** → select each flow → **Turn on**, in this order:
  1. **2 Review submitted**
  2. **3 Manager decision**
  3. **4 Team members** – gives people you add in ⚙ Settings → Team access to the page
  4. **5 Wellbeing** – wellbeing assessments
  5. **6 Feedback** – emails you what people send with the 💬 Feedback bubble
  6. **8 Amendment notice** – emails a person when you amend their 1-to-1 (it arrives Off)
  7. **9 Action access** – shares each action with its person, and gives each person their update folder
  8. **10 Action update** – records the updates people send on their actions
  9. **11 Action notice** – sends the action emails (E19, E20)
  10. **1 Daily scheduler** – last, so its first run finds everything ready
- [ ] There is no Flow 7 from 1.4. If an old *7 Challenge* is still listed (after an upgrade), leave it **Off**.
- [ ] **0 Setup** stays On (it only runs when you click Run).

### 4.8 Fallback: no Dataverse (legacy packages)

Only if §4.2 step 3 showed that solutions can't be imported:

1. Open `legacy-package-builder.html` in Edge or Chrome (double-click the file). It works offline.
2. Enter the **site URL** and **your email**, then click **Create the eight packages**. Eight zips download: `ESG-1to1-0-legacy.zip` to `ESG-1to1-6-legacy.zip`, and `ESG-1to1-8-legacy.zip` (there is no 7).
3. For each zip, in order 0 to 6, then 8:
   1. Power Automate → **My flows → Import → Import Package (Legacy)** → **Upload**.
   2. Under **Related resources**, click each connection (spanner icon), pick your own connection, and click **Save**.
   3. Under *Import setup*, keep **Create as new**.
   4. Click **Import**.
4. Continue at §4.3 (run the setup flow), then §4.4–§4.7. Find the flows under **My flows** rather than *Solutions*.

**Differences in legacy mode:**

- The site URL and email are written into the flows. To change them later, re-run the builder and re-import (*Update*), or edit the flows.
- Legacy flows may import **On**. Make sure flows 1–6 and 8 are **off** until setup has run, or let them fail harmlessly. Each failure emails you *"action needed"*, naming the step `STOP_run_the_setup_flow_first`.

---

## 5. Phase B — Walk through it as a technician (test accounts only, 1–2 h)

- [ ] **⚙ Settings → Team → + Add a person:** search for **Test A** → **Add**, then the same for **Test B**. No SharePoint lists or groups to edit by hand.
  - Within about 5 minutes Flow 4 adds each to the `1-to-1 Technicians` group and emails you *"1-to-1: access given to …"* (test F32).
- [ ] **Reload the page.** The top bar shows **Team (2) ▾**, and opening it lists Test A and Test B.
- [ ] **⚙ Settings → Team:** give each a **Next appraisal** – type it (e.g. `15/07/2027`) or pick it with 📅 (use a summer date) – plus a **Next wellbeing** date and an **Appraisal period start**. Save, reopen, and check they **still show the same day** (tests F27, F31 and R16).
- [ ] **Expectations:** add one **Individual** expectation for Test A. This proves the Person column works; *Expectations per technician* shows Test A with one more than Test B.
- [ ] **Power Automate → Flow 1 → Run.** Test A and Test B each get *"Your 1-to-1 for … is ready"*.
  - **Run it again:** no new items, no second email.
- [ ] **As you:** Team overview lists Test A and Test B.
- [ ] **As Test A** (InPrivate window):
  - Open the email link. Their form opens. The top menu bar has only *This month · My actions · My appraisal · Wellbeing · Appraisal report*, with no Team menu or Settings.
  - Fill in a few answers. Within about 5 seconds the top shows **Saved hh:mm** – no need to click Save. Reload: the answers are kept (F43).
  - **Clearer forms (F45):** required questions not yet answered have a subtle orange border (Yes/No and rating buttons too). Press **Submit** with gaps: they turn red and the page jumps to the first; each clears as you answer it. Optional questions are never marked.
  - **Words, not numbers (F46):** the expectation rating buttons read *Not started · Early progress · On track · Strong progress · Fully met*, and the side panel shows no scores.
  - Complete everything → **Submit**. Within about 5 minutes the review becomes read-only.
- [ ] **As you:** *"1-to-1 submitted"* arrives. Monthly reviews shows a badge, and **Team ▾** shows a red dot next to Test A.
  - Open the review. Add feedback per question and a 1–5 rating per expectation.
  - Add **two actions**, each with owner, close-out criteria and deadline.
  - Click **Complete & release**.
- [ ] **As you:** Team ▾ → Test A → **Generate appraisal report** → **Print / Save as PDF**. A print window opens. If not, allow pop-ups for the SharePoint site.
- [ ] **As Test A:** *"Feedback … is ready"* arrives. Feedback, ratings and actions are visible; **My appraisal** and **Appraisal report** work.
- [ ] **Action tracking (F57–F61):**
  - **As you:** within about 5 minutes of the release, the **Actions** page lists both actions; the review says *In the action tracker ✓*.
  - **As Test A:** **My actions** shows them. On their own one, type an update → **Send update**. It says *received – being recorded*; after Refresh (within about 5 minutes) *recorded ✓*.
  - **As Test A:** **Ready to close… → Ask to close**. **As you:** *"Close-out requested"* arrives; *Needs your attention* lists it. Click **Not yet…** with a reason; Test A sees the reason; they ask again; you **Agree & close**.
  - **As you:** **Update…** on the other action → change the deadline: it won't save without a reason; with one, it shows the new date *(was <original>)*. Open **History** – every step is there with who and when.
  - Bands and words only – no numeric ratings or scores in the outlook, *My appraisal*, the charts or the report; the trend reads *Improving / Steady / Dipping / Too early to tell* (F46). Your own screens still show the numbers.
  - *To move up to <next band>, focus on:* three expectations (*Keep it up* in the top band), also in report section 1 *Areas to focus on* (F47).
- [ ] **Amendment (F23):**
  - **As you:** open Test A's released review. It is read-only. Click **Amend…**, change one feedback field → **Save amendment…**. It lists the changed field and won't save without a reason; give one.
  - **As Test A:** within about 5 minutes *"Your 1-to-1 for <month> has been amended"* arrives – the month and a link, nothing else – and the review shows the new value.
  - **As you:** the review shows **Amended (1)** (only you see it); no *"1-to-1 submitted"* email arrived.
- [ ] **Appraisal completed (F49):** ⚙ Settings → Team → **Mark appraisal completed…** for Test A (today, and a next due date a year on) → confirm. Test A's profile now has a period selector. Then **Undo last**.
- [ ] **Wellbeing (tests F37–F39):**
  - **As you:** **Wellbeing → + Start** for Test A, with a meeting date.
  - **As Test A:** *"Your wellbeing assessment is ready to complete"* arrives → open it → work through the steps → **Submit**.
  - **As you:** *"Wellbeing assessment submitted"* arrives → open it → add an arrangement and notes → **Complete** → confirm or set the **next wellbeing date** (it is never set automatically).
  - **As Test A:** *"Your wellbeing assessment record is ready"* arrives; the agreed record shows; **Print / Save as PDF** works.
- [ ] **Month two – "Since last time" and "Outstanding actions" (F44, F65):** with Flow 1's test date set to the next month (§6), Test A's new form starts with **Since last time** (what they raised and your replies) and **Outstanding actions** (open actions and what changed). Test A clicks **Progress satisfactory** on one; you see it on your review of that month.
- [ ] **Feedback (tests F41, P25):**
  - **As Test A:** click 💬 **Feedback** (bottom-right) → **Fault** → type a short message → **Send**. It says *"Thank you. Your feedback has been submitted to your Team Leader."*
  - **As you:** within about 5 minutes *"1-to-1 feedback (Fault): …"* arrives, naming Test A, the page and the version.
- [ ] **As Test B:**
  - nothing of Test A's is visible anywhere, including Wellbeing, **My actions** and Test A's feedback;
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

### 6.1 Functional tests (F1–F68)

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
| F23 (1.4) | **Amendment.** The TL opens A's released review → **Amend…** → changes one feedback field and one of A's answers → **Save amendment…**, first with no reason, then with one | Before Amend the review is read-only and nothing auto-saves. Without a reason it refuses; the dialog lists the changed fields. Then: one *1-to-1 Amendments* item (reason, before/after of the two columns only, Created By = the TL) → *Sent*; A gets **E16** (month and link only) within about 5 minutes; no E3; Flow 2's run is *Cancelled*; the review shows **Amended (1)** to the TL only; A sees the new values. |  |  |  |
| F24 (v4) | The TL adds **three** action rows to A's review. One is missing its close-out criteria. The TL clicks **Complete & release**. | Blocked, with a message naming the missing field. After the TL fills it in, Complete works. In Manager Reviews, `ActionsJson` holds three rows, `ActionsStatus` = Open, and `NextActionDue` = the earliest deadline. |  |  |  |
| F25 (v4, changed in 1.5) | After release, the TL closes one action on the **Actions** page (**Update… → Closed**, or **Agree & close** on a close-out request) | The action shows *Closed* with today's date in 1-to-1 Actions and on A's *My actions*. The released Manager Review is **not** changed (its `ActionsJson` stays as agreed). |  |  |  |
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
| F36 (v4.2, changed in 5.0.0) | Team overview | No chart switcher, *Expected appraisal outcomes* or *Workload this month*; *Needs your attention* is full width and lists waiting reviews, overdue actions, wellbeing items, and people with no period start or next wellbeing date. |  |  |  |
| F37 (v4.2) | Wellbeing: TL starts one for A | A gets E9 within about 5 minutes; the item's *Manage access* shows Owners + A (1-to-1 Edit) only. |  |  |  |
| F38 (v4.2) | A completes every step and submits | Flow 5 locks it (A: 1-to-1 Read), stamps SubmittedOn, TL gets E10. A sees it read-only. |  |  |  |
| F39 (v4.2, changed in 1.4) | TL adds an arrangement and notes, then **Complete** | Complete asks the TL to confirm or set the **Next wellbeing assessment** (it must be after today; nothing is set silently). A gets E11 and sees the agreed record; Print shows the form with signature lines; Settings → Team shows the chosen date. |  |  |  |
| F40 (v4.2, changed in 1.4) | Settings → Team: set A's **Next wellbeing** to 7 days ahead; run Flow 1. Then with `varTestDate` on that day, and 7 days after it. | TL gets **E12** 7 days before, on the day and weekly while overdue, with a link; nothing goes to A. |  |  |  |
| F41 (v4.3) | As A: 💬 **Feedback** → Fault → type a message → **Send** | "Thank you. Your feedback has been submitted to your Team Leader." Within about 5 minutes the TL gets E13 naming A, the page and the version; the item in *1-to-1 Feedback* is Owners-only and *Sent*. |  |  |  |
| F42 (v4.3) | Turn Flow 6 **off**, send feedback as A, wait an hour (or turn Flow 6 on with the email connection broken) | The TL sees "Feedback from A … – read it here" in *Needs your attention*, can read it and **Mark as read**. |  |  |  |
| F43 (v4.4) | As A: type an answer, wait about 5 s, reload | Top shows *Saved hh:mm*; the answer is kept; the review is still a Draft (no submission email). |  |  |  |
| F44 (v4.4) | Month two (test date next month): open A's new form | **Since last time** lists last month's raised items, your released replies and A's actions. Before you release, it says *Feedback not released yet*. |  |  |  |
| F45 (v4.5) | As A: open a new form, answer one required question, leave the rest, press **Submit**; then answer them one by one. Repeat on the wellbeing form; as the TL, leave an action row's criteria empty and save. | Unanswered required questions (including Yes/No and rating buttons) have an orange border; Submit turns them red and jumps to the first; each clears as it's answered. Optional questions are never marked. Wellbeing: Submit jumps to the first unanswered step and its pill turns red. TL: the empty action / criteria / deadline is marked red and the save is blocked. |  |  |  |
| F46 (v4.5) | As A: rate expectations, then (after release) open the outlook, *My appraisal*, the charts and the appraisal report. Change a band threshold in ⚙ Settings and reload. | A sees **words only**: rating buttons *Not started … Fully met*, a band chip and coloured bar, trend *Improving / Steady / Dipping / Too early to tell*, band-labelled chart axis and tooltips – no numeric rating or score anywhere. The TL's screens still show the numbers. The coloured bar follows the new thresholds. |  |  |  |
| F47 (v4.5) | With at least two released months for A, open A's outlook, *My appraisal*, A's profile (as the TL) and report section 1 | *To move up to <next band>, focus on:* the three expectations with the lowest average rating over the period (TL rating once released, otherwise self). In the top band: *Keep it up*. The TL sees the averages in brackets. Report section 1 is *Areas to focus on*. |  |  |  |
| F48 (1.4; replaces the v4.5 challenge round trip) | **Challenges retired.** After Setup 1.4 on a site upgraded from 1.3 | *1-to-1 Challenges* (if present) shows Owners – Full Control only; any challenge that was open is *Not agreed*; no ⚑ Challenge anywhere on the page; *7 Challenge* is Off (then deleted after approval). |  |  |  |
| F49 (1.4) | **Periods.** Settings → Team: set A's **Appraisal period start**; then **Mark appraisal completed…** (a completion date ≤ today, a new next due date) → confirm; then **Undo last**, and complete again | A new period starts with only its own reviews; profile and report offer the previous period in the period selector; the completion month belongs to the period it ends. Undo restores the previous state. A completion date in the future, before the current start, or a next due date not after the completion is refused. |  |  |  |
| F50 (1.4) | **Next appraisal moved.** Change A's Next appraisal to a later date, then an earlier one | Days to go and the forecast end point change; **no review moves between periods**. |  |  |  |
| F51 (1.4) | **Missed months.** With one month *Closed – Not Submitted* and one late submission for A | Profile tiles and report: "N rated reviews of M months · 1 missed"; averages, forecast and trend ignore the missed month; on time is out of submitted reviews; the late month breaks the streak, the missed one doesn't. |  |  |  |
| F52 (1.4) | **Appraisal reminders.** Settings → Team: A's Next appraisal 7 days ahead; run Flow 1, then with `varTestDate` on the day and 7 days after | TL gets **E17** each time (7 days before, on the day, weekly while overdue); nothing goes to A. |  |  |  |
| F53 (1.4) | **Expectations, no limit.** Have 12 active Shared and 1 Individual for A; enter one for the current year and one for next year; create next month (`varTestDate`) | A's new form has all 12 Shared, then the Individual one; the current-year one carries on into next April; next year's appears only from then. |  |  |  |
| F54 (1.4) | **Delete permanently.** Retire a test expectation, then **Delete permanently** | Offered only on retired items, asks for confirmation; the item is in **Site contents → Recycle bin**; past reviews still show their copy. |  |  |  |
| F55 (1.4) | **Amend answers on a submitted review.** Before releasing A's submitted review: **Amend answers…**; meanwhile change the review in another tab and save there; then retry | The first save is refused (*changed elsewhere – reload*); after reloading it saves; normal *Save feedback* still works on a submitted review. |  |  |  |
| F56 (1.4) | **Amendment notice failures.** Turn Flow 8 off, amend a review, wait an hour; then turn it on and **Resend** | *Needs your attention* shows the unsent email; Resend → *Retry* → one E16 → *Sent*. A Draft left by an interrupted save shows **Send notice** / **Dismiss** (Dismiss → *Cancelled*, no email). |  |  |  |
| F57 (1.5) | **Release adds the actions.** Release A's review with two actions (one owned by A, one by you) | Within about 5 minutes both are in 1-to-1 Actions with keys `mr<id>-<action id>`, owner, both deadlines, *Open*, a *created* history entry; the review's `ActionsSyncedOn` is set and it says *In the action tracker ✓*. Releasing again or running Flow 1 adds nothing. |  |  |  |
| F58 (1.5) | **Sharing.** After F57, check each action's and A's folder's permissions | Action: Owners + A *1-to-1 Read* only. Folder `u<A's id>` in 1-to-1 Action Updates: Owners + A *1-to-1 Submit* only (flow 9). *Needs your attention* shows nothing about sharing. |  |  |  |
| F59 (1.5) | **Technician update.** As A: *My actions* → type an update → **Send update** | *received – being recorded*, then (after Refresh, within about 5 minutes) *recorded ✓*; the action is *In progress* with the latest progress; your Actions page shows it. The update item is locked (A: Read). |  |  |  |
| F60 (1.5) | **Waiting.** As A: **Waiting on something…** with a reason and a next-check date | *Waiting*, reason shown to both; the deadline is unchanged. When the deadline passes it shows *Overdue – waiting on: <reason>*. |  |  |  |
| F61 (1.5) | **Close-out.** As A: **Ready to close… → Ask to close** on A's own action; as you: **Not yet…** with a reason; A asks again; you **Agree & close** | One E19 per request; the action goes *Ready for close-out* → *In progress* (A sees your reason) → *Closed*. A's TL-owned action offers no *Ready to close*. |  |  |  |
| F62 (1.5) | **Deadline and owner changes.** **Update…** → new deadline with no reason, then with a reason; change the owner with a reason | Without a reason it is refused. With one, the new deadline shows with *(was <original>)*; the history keeps both, the reason, who and when. |  |  |  |
| F63 (1.5) | **Reopen.** **Update…** on a closed action → status *In progress* | A reason is required; the action reopens, the closed date is cleared, the history keeps it. |  |  |  |
| F64 (1.5) | **Concurrent change.** Open **Update…** on an action; meanwhile A sends an update and it is recorded; then save | The page says the action was updated since you opened it and reloads it; nothing is overwritten; saving again works and both are in the history. |  |  |  |
| F65 (1.5) | **Carry-forward.** Next month (Flow 1 test date), open A's new form and your review of it | *Outstanding actions* lists open ones and those closed since the last review, with what changed. A records *Progress satisfactory* (one click) and *Further support required* (details); you see both; you choose *Ready to close → Close it now* on one. Choosing the same outcome again adds nothing. |  |  |  |
| F66 (1.5) | **E20 reminder.** Give a test action a deadline 5 working days ahead (7 days for a weekday deadline), run Flow 1, run it again; move the deadline and run it again | One E20 to A copied to you; no second one; one new one for the new deadline. None after the deadline. |  |  |  |
| F67 (1.5) | **Email problems.** Turn Flow 11 off, ask to close, wait an hour; turn it on and **Resend** from *Needs your attention* | The email shows as waiting to be sent, then is sent once; the notice shows *Sent*. |  |  |  |
| F68 (1.5) | **New action, report and history.** **+ New action** for B; open A's profile and report | The action appears for B (after flow 9); A's report lists actions with status and latest progress, says *Waiting* is a dependency, and gives no action score. |  |  |  |

### 6.2 Privacy and bypass tests (P1–P36) — all mandatory

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
| P26 (v4.4) | **Send feedback as someone else** | A: POST `…getbytitle('1-to-1 Feedback')/AddValidateUpdateItemUsingPath` with form values `Author` / `Editor` set to B | The item is recorded as A (Author/Editor ignored or rejected). If SharePoint accepts the change, record it here: the E13 sender is then "as recorded", and the TL should confirm unexpected feedback in person. |  |  |  |
| P27 (v4.4) | **Get alerted to others' feedback** | B: try *Alert me* on 1-to-1 Feedback, and POST `…/alerts/add` | Denied – `1-to-1 Submit` has no Create Alerts. |  |  |  |
| P28 (v4.4) | **List metadata / change log** | B: GET `…getbytitle('Wellbeing Assessments')?$select=ItemCount,LastItemUserModifiedDate`; POST `…/GetChanges` on Wellbeing Assessments and 1-to-1 Feedback | Denied, or reveals nothing personal. If dates/counts are visible, record it as an accepted risk (no content is exposed). |  |  |  |
| P29 (1.4; replaces the v4.5 challenge-forgery test) | **Read the restricted audit or the retired challenges** | A: GET `…getbytitle('1-to-1%20Amendments')/items` and open `/Lists/OneToOneAmendments`; GET `…getbytitle('1-to-1%20Challenges')/items` | Denied / not found. A never sees a reason or before/after value (tenant checks T7, T8). |  |  |  |
| P30 (1.4) | **Forge an amendment or delete** | A: POST `…getbytitle('1-to-1%20Amendments')/AddValidateUpdateItemUsingPath` with `NotifyStatus` = `Pending` and `Technician` = B; POST `…getbytitle('Appraisal%20Expectations')/items(<id>)/recycle()` | Both denied (403 / not found); no E16 is sent to B; nothing is deleted (tenant check T5). |  |  |  |
| P31 (1.5) | **Read someone else's actions or updates** | A: GET `…getbytitle('1-to-1%20Actions')/items`, `…/items(<B's action>)`, `…getbytitle('1-to-1%20Action%20Updates')/items`, `…getbytitle('1-to-1%20Action%20Notices')/items`; open the page with `?actionId=<B's action>` | Only A's own actions and A's own folder; B's action is *not found*; notices denied; the page shows nothing of B's. |  |  |  |
| P32 (1.5) | **Write an action directly** | A: POST `…getbytitle('1-to-1%20Actions')/items(<A's action>)` with `X-HTTP-Method: MERGE` and `{"Status":"Closed"}`; `…/validateUpdateListItem` setting `CurrentDue`; `…/AddValidateUpdateItemUsingPath` on 1-to-1 Actions | All denied (403); nothing changes. Only the TL (and flows 9/10) write actions. |  |  |  |
| P33 (1.5) | **Send an update as someone else** | A: `…getbytitle('1-to-1%20Action%20Updates')/AddValidateUpdateItemUsingPath` into B's folder `…/OneToOneActionUpdates/u<B's id>`, into the list root, and into a made-up folder; and into A's own folder with `ActionId` = B's action and `Author` = B | Every create outside A's folder is denied; `Author` can't be written; the one in A's folder with B's action id is *Rejected – Not your action* and B's action is untouched. |  |  |  |
| P34 (1.5) | **Close or bend the rules** | A, in A's own folder: Kind `closeRequest` on your (TL-owned) action; Kind `waiting` with an empty message; an update on a closed action; then edit or recycle A's own recorded update | Rejected with the reason (*Only the Team Leader closes their own actions*, *The update is empty*, *The action is closed*); the recorded update can't be edited or deleted (403). |  |  |  |
| P35 (1.5) | **Folder and sharing tamper** | A: rename A's own folder `u<A>` (to another person's `u<id>`) in the list and by REST `validateUpdateListItem` (`FileLeafRef`). As the TL: add a second person to A's folder (or to an action) in *Manage access*, then change the action | A's rename is refused (edit only own items – the folder is the flow's). Flow 9 removes the extra person; an update in a folder with a second principal, or in a folder anyone but the flow has changed, is rejected – and flow 9 closes such a folder to Owners and reports it rather than adopting it (tenant check T15). |  |  |  |
| P36 (1.5) | **Script injection in the tracker** | A puts the P15 attack strings in an update, a waiting reason and a follow-up detail; the TL puts them in a progress note, a decision note and a new action | Shown as plain text on the Actions page, the Update dialog, the history, *My actions*, *Outstanding actions* and the report; E19 / E20 show them escaped. No alert ever appears. |  |  |  |
| P17 | **No data leaves the tenant** | As the TL, open each view with F12 → **Network** recording (ask IT if developer tools are blocked) | Every request carrying list data goes to `<tenant>.sharepoint.com`. Record any other host contacted (for example the web part's own code CDN) for IT-11. None of them may receive review content. |  |  |  |

### 6.3 Questions for IT (record the answers)

| # | Question | Answer | Date |
|---|---|---|---|
| IT-a | Is *limited-access user permission lockdown mode* **off** for this site? (If it's on, technicians' page calls can fail.) |  |  |
| IT-b | IT-11: does the Welcome web part send any page or list data outside the tenant (licence checks, telemetry)? |  |  |

---

## 7. Phase D — Clean down (30 min)

- [ ] Delete every **test item** in Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Feedback and 1-to-1 Amendments, and the test expectations.
- [ ] Empty the **site recycle bin**, then the **second-stage recycle bin**.
- [ ] **Lots of test data, or test data from earlier versions?** Use the one-time **reset tool** instead, only with written approval:
  1. Export the lists to CSV, and **turn Flow 1 off**.
  2. Upload `one-to-one-reset.html` and `one-to-one-reset.js` to *Welcome Web Part - Custom Layouts*, make a temporary Owners-only page with the Welcome web part and choose the layout **ESG 1-to-1 reset tool**.
  3. Tick the test records (filter by person or month; expectations only if you choose them) → **Download backup** → **Run the dry run** → tick *Flow 1 is turned off*, type the phrase shown (e.g. `DELETE 42 RECORDS`) → **Delete**.
  4. Check the result and **Download the report**. Deleted records go to the site recycle bin (restorable for about 93 days).
  5. Delete the temporary page and both reset files, then turn Flow 1 back on.

  It never touches the Technicians list (people, dates, period history), 1-to-1 Settings, permissions, groups or flows.
- [ ] **⚙ Settings → Team → Deactivate** Test A and Test B (Flow 4 removes them from the group), then delete their two items from the **Technicians** list. Team ▾ goes back to Team (0).
- [ ] Flow 1: **Initialize varTestDate** is **empty** (Save).

## 8. Phase E — Prepare and invite the real team (1–2 h)

- [ ] **⚙ Settings → Team → + Add a person** for each technician (Flow 4 gives them access; no invitation email is sent by SharePoint).
- [ ] **⚙ Settings → Team:** enter each person's **Next appraisal**, **Next wellbeing** and **Appraisal period start** (the date their last appraisal was actually completed) → Save. Optionally **⚙ Settings → Reminders / Names** to change the reminder days or the on-screen role words.
- [ ] **Expectations page:** enter the real **Shared** expectations and each person's **Individual** ones for **2026/27**. Do this after the Technicians list, so people appear in the Technician dropdown.
  - There is **no limit** on how many (a warning shows above 30 on one review). Shared always come first.
  - An expectation's year is the first appraisal year it applies to: it carries on into later years until you retire it. One entered early for next year stays hidden until that appraisal year starts (1 April).
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
| Actions (any time) | **Actions** page: the *What needs you* tiles – close-out requests (**Agree & close** / **Not yet…**), overdue, due soon, waiting, no recent progress, problems. Only you close or reopen. |
| E19 / E20 emails | Someone asked you to close an action (open it from the email), or a deadline is 5 working days away (you're copied) |
| Something needs changing after submission | Open the review → **Amend…** (released) or **Amend answers…** (submitted) → **Save amendment…** with a reason. The person gets a short email; *Needs your attention* shows any email that didn't go (**Resend**). |
| After each appraisal | ⚙ Settings → Team → **Mark appraisal completed…** (the actual date and the next due date) |
| E12 / E17 reminders | A wellbeing or appraisal date is 7 days away, due today or overdue – arrange it, or change the date in ⚙ Settings → Team |
| Your reminder days (default 20th and 27th) | Reminders went to anyone who hasn't submitted |
| Next 1st | New month is created; last month's unsubmitted reviews show **Overdue**; use **Close – not submitted** where needed |

### 10.1 Operating procedures

| When | Task |
|---|---|
| **Monthly, from the 1st** | Flow 1 creates the reviews at 07:00. Check **Team overview** shows everyone. Review submissions as E3 emails arrive: open the review, write feedback, rate expectations, add actions (close-out criteria and deadline), then **Complete & release**. After the deadline, use **Close – not submitted** for any review that wasn't submitted. |
| **Monthly, any time** | **Actions** page (1.5): work through the *What needs you* tiles – agree or decline close-out requests, follow up overdue actions and those with no progress for 30 days, check what waiting actions are waiting on. **Update…** adds a note, changes the status, moves a deadline (with a reason; the original is kept) or changes the owner (with a reason). Only you close or reopen an action. **+ New action** for anything agreed outside a review. |
| **At each monthly review (1.5)** | *Outstanding actions* on the review lists what is still open and what changed since last time. Record an outcome if useful (*Progress satisfactory*, *Further support required*, *Ready to close*). New actions you add to the review go into the tracker when you click **Complete & release**; once released they are read-only in the review and managed on the Actions page. |
| **Action emails and sharing (1.5)** | *Needs your attention* shows a failed or uncertain action email (**Resend** – it may arrive twice if the first got through), updates not recorded after an hour (check flow 10 is On), actions not shared yet (**Repair**; check flow 9 is On), and a release whose actions aren't all in the tracker after an hour (check flows 3 and 1 are On – flow 1 finishes them each morning). |
| **When an appraisal or wellbeing date is set or changes** | ⚙ **Settings → Team** → **Next appraisal** or **Next wellbeing** → type the date (e.g. 15/07/2027) or pick it with 📅 → **Save settings**. This updates the Technicians list (and the person's current review for the appraisal date); each date is read back to prove it saved as the same day. Moving the next appraisal date never moves a review between periods – it only changes the forecast end point and the E17 reminders. |
| **When an appraisal has been held** | ⚙ **Settings → Team → Mark appraisal completed…** → the date it was actually completed (today or earlier, after the current period start) and the new next due date (after the completion) → confirm. A new appraisal period starts; earlier periods stay selectable on the profile and report. A second completion in the same month replaces the first; **Undo last** reverses the latest. Before the first completion, set **Appraisal period start** (the date their last appraisal was completed). |
| **Reminder days or names** | ⚙ **Settings → Reminders** (up to three days, 1–28) or **→ Names** (app name and role words). Labels only – permissions never change. |
| **Wellbeing – at least yearly** | **Wellbeing → + Start** for the person (or from *Needs your attention*). They complete their part (E9); when they submit (E10) hold a private, hour-long conversation, record agreed arrangements and notes, then **Complete** (E11): it asks you to confirm or set the **next wellbeing date** (after today; never set automatically – a year on is only a suggestion). That date is the same as **Settings → Team → Next wellbeing**. Flow 1 emails you 7 days before, on the day and weekly while overdue (E12). You can start a new assessment at any time, e.g. after a return from absence. |
| **Quarterly (5 min)** | 1. **Site permissions:** Owners = only you; Members and Visitors empty. 2. `1-to-1 Technicians` contains only current technicians and has Read only on: the page, the layouts library, the Welcome Errors list and `1-to-1 Settings`. 3. In the layouts library, version history of `one-to-one.html` / `.js` shows only your uploads. 4. Spot-check one Monthly Review's *Manage access*: only Owners plus that technician. 5. **1-to-1 Amendments** permissions: Owners – Full Control only. 6. (1.5) **1-to-1 Actions, Action Updates, Action Notices**: Owners – Full Control only at list level; spot-check one action's *Manage access* (Owners + its technician only) and one folder in Action Updates (Owners + that technician only). |
| **New starter** | ⚙ **Settings → Team → + Add a person** → search → **Add**. Flow 4 gives them access to the page within about 5 minutes (E8). Set their next appraisal, next wellbeing and appraisal period start, and add any individual expectations. Their review appears the next morning (or run Flow 1). |
| **Leaver / long absence** | ⚙ **Settings → Team → Deactivate**. Flow 4 removes them from `1-to-1 Technicians` (E8) and no new reviews are created. Keep their records for the retention period. |
| **Amendment after submission (1.4)** | Open the review in the app. A released review is read-only: click **Amend…**; a submitted, not yet released one keeps **Save feedback**, and **Amend answers…** changes the technician's answers. Make the change → **Save amendment…** → give the reason. The page records the reason and the before/after values in the Owners-only **1-to-1 Amendments** list, then writes only the changed fields; Flow 8 emails the technician that it was amended (E16 – no content or reason). The review shows **Amended (n)** to you only. Don't edit reviews directly in SharePoint, and don't use `CorrectionLog` (no longer used). |
| **Amendment notices** | *Needs your attention* shows an amendment email that failed or hasn't gone after an hour (**Resend**), and an amendment that wasn't finished (**Send notice**, or **Dismiss** to mark it Cancelled). Flow 8 must be On. |
| **Annual expectation rollover** | An expectation's year is the **first** appraisal year it applies to; it carries on into later years until you retire it. Before a new appraisal year, add any new expectations with that year (they stay hidden until it starts). At the year end, **Retire** only those that no longer apply (Active = No). There is no limit on how many (a warning shows above 30 on one review). A retired expectation can be **Delete permanently** (to the site recycle bin for about 93 days); old reviews keep their own copy either way. |
| **Feedback from the page** | Arrives by email (E13) as people use the 💬 **Feedback** bubble. If an email fails, the item shows in *Needs your attention* – read it there and **Mark as read**. Everything sent stays in the **1-to-1 Feedback** list (Owners only). |
| **Monthly retention (first working day)** | Delete reviews whose month is **more than 24 months** ago, from **both** Monthly Reviews and Manager Reviews (filter by MonthKey), **Wellbeing Assessments completed (or, if never completed, created) more than 24 months ago**, **1-to-1 Feedback** items created more than 24 months ago, and **1-to-1 Amendments** items whose MonthKey is more than 24 months ago (they hold copies of review content). From 1.5: **1-to-1 Actions** closed more than 24 months ago, **together with** their items in 1-to-1 Action Updates and 1-to-1 Action Notices (same ActionId) – never the folders. On a site upgraded from 1.3, also the retired **1-to-1 Challenges** items created more than 24 months ago (or export and delete that list). Keeping the latest assessment of a current person for longer is an exception that needs HR's agreement. Record the deletion in a dated note, then empty the site recycle bin **and** the second-stage recycle bin. Skip this step if a Purview retention label does it automatically. |
| **Subject access request** | Export Monthly Reviews, Manager Reviews, Wellbeing Assessments, 1-to-1 Amendments and (1.5) 1-to-1 Actions and their 1-to-1 Action Updates filtered by the person (**Export → CSV**). The technician can also use **Appraisal report → Print / Save as PDF** for their own view. |
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
| Flow 1–6 or 8 email *"action needed"* naming `STOP_run_the_setup_flow_first` (or `…setup_flow_again`) | Setup hasn't run (or hasn't been re-run after upgrading to 1.1), or the permission levels / lists were renamed. Run setup. |
| Someone added in ⚙ Settings → Team can't open the page | Flow 4 must be **on**; it runs within about 5 minutes. Check its run history. |
| A feedback email didn't arrive | Flow 6 must be **On**. If the email failed, the item is marked *Failed* in **1-to-1 Feedback** and shows in *Needs your attention* on the page – read it there. Check the run history. |
| An amendment email (E16) didn't arrive, or *Needs your attention* shows it failed or not sent | Flow 8 must be **On** (it arrives Off). Click **Resend** in *Needs your attention* (the record goes to *Retry* and Flow 8 sends it). An unfinished amendment shows **Send notice** or **Dismiss**. Check Flow 8's run history. |
| *7 Challenge* still listed after upgrading to 1.4 | Expected: an import never deletes a flow. Keep it **Off**, and delete it once you're happy (§0 step 10). |
| A wellbeing assessment was started for the wrong person | Delete that item in **Wellbeing Assessments** (Site contents) and start a new one. Once started, an assessment stays with the person it was shared with – changing the name on it doesn't move it. |
| A wellbeing assessment didn't reach the person | Flow 5 must be **on**. Check its run history; the person needs a mailbox. |
| Import: *"flows may not have turned on … List not found"* | Expected only when upgrading before Setup has created a new list. Run **0 Setup**, then turn the flows on (§0 step 5). |
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
| "Couldn't save … (403)" for a technician | Review already submitted (locked) | Expected. Changes after submission go through the TL (**Amend…**). |
| A banner says to run Setup 1.4; no **Amend…** button or new date boxes | Page 5.0.0 uploaded before Setup 1.4 ran | Run **0 Setup** (`MIGRATION_1_4.md` step 4); the page then shows them |
| **Save amendment** says the review was changed elsewhere | Someone (or another tab) saved the review after you started amending | Reload and amend again |
| An outlook shows no forecast | No appraisal period start set for that person | ⚙ Settings → Team → **Appraisal period start**, or *Needs your attention* → **Set start** |
| Complete & release did nothing | Flow 3 rejected it (not submitted, or closing before the deadline) | Read the "not done" email |
| Dates show a day out | Site regional settings not on London time | Site settings → **Regional settings**: Locale English (United Kingdom), time zone (UTC) Dublin, Edinburgh, Lisbon, London |
| Print / Save as PDF does nothing | Browser blocked the pop-up | Allow pop-ups for the SharePoint site |
| Flow failure emails | See the run link in the email | Fix, then re-run. Flow 1 is safe to re-run. |
| *"action needed"* naming `STOP_run_the_setup_flow_first` | Setup hasn't run, or a list or permission level was renamed | Run **ESG 1-to-1 \| 0 Setup** (safe to re-run) |
| A list, column or view went missing | Deleted or renamed by hand | Re-run **ESG 1-to-1 \| 0 Setup**. It re-adds anything missing; renamed columns must be renamed back. |
| (1.5) A technician's update stays *received – being recorded* | Flow 10 is off or failing | Turn **10 Action update** on; it picks up every waiting update. Flow 1 puts any stuck one back in the queue each morning. |
| (1.5) A technician gets *not sent – SharePoint refused it* | Their update folder isn't set up yet (flow 9 off, or they have no action yet) | Turn **9 Action access** on, or click **Repair sharing** on one of their actions; then they click **Send again** |
| (1.5) An update shows *not recorded: Not sent from your own update folder* | Someone changed the folder's permissions or moved the item | Click **Repair sharing** on one of their actions (flow 9 resets the folder); the technician sends it again |
| (1.5) *Agreed actions … aren't all in the tracker yet* | Flow 3 couldn't finish (or was off) | Check flows 3 and 1 are On; flow 1 adds the missing ones the next morning (or run it now). Nothing is ever added twice. |
| (1.5) *This action was updated since you opened it* | A technician's update (or another tab) changed it first | Nothing was saved; the page has reloaded it. Make your change again. |
| (1.5) *"action needed"* from **9 Action access** naming `STOP_folder_changed_by_someone_else` | A technician's update folder was renamed or changed by someone other than flow 9, so it was closed to Owners | Open 1-to-1 Action Updates, rename that folder (e.g. add `-old`) or delete it, then **Repair sharing** on one of that person's actions: flow 9 makes a fresh folder. Their recorded history is on the actions, not lost. |
| (1.5) An action email shows *delivery unknown* | Flow 11 stopped part-way through sending | Check with the person; **Resend** if needed (it may arrive twice). |

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
| Lists (display names) | `Technicians`, `Appraisal Expectations`, `Monthly Reviews`, `Manager Reviews`, `Wellbeing Assessments`, `1-to-1 Settings`, `1-to-1 Feedback`, `1-to-1 Amendments`, `1-to-1 Actions`, `1-to-1 Action Updates`, `1-to-1 Action Notices` (and, on a site upgraded from 1.3, the retired `1-to-1 Challenges` – keep its name while it exists) |
| Columns | Every column name the setup flow created (List settings shows them) |
| Choice values | ReviewStatus, ReviewState, ActionsStatus, AppliesTo, AssessmentStatus, DeliveryStatus, NotifyStatus (1-to-1 Amendments), Q4–Q6 Yes/No, the three Q9 / FollowUpDecision sentences (the first has an em dash —), and from 1.5: action Status, Owner, update Kind / Outcome / ProcessState, notice Kind / Status |
| Settings items | Titles `Bands`, `Reminders`, `Labels` and (1.5) `ActionsTrackerStart` in `1-to-1 Settings` – never edit or delete `ActionsTrackerStart` |
| Folders | The `u<number>` folders in 1-to-1 Action Updates (one per technician, made by flow 9) – never rename, move or delete them |
| Permission levels | `1-to-1 Edit`, `1-to-1 Read`, `1-to-1 Submit` |
| Group | `1-to-1 Technicians` |
| Page | `SitePages/OneToOne.aspx` (links in old emails point at it) |
| Layout | `ESG 1-to-1` (the `data-name` in `one-to-one.html`) |
| List URLs | `Lists/Technicians`, `Lists/AppraisalExpectations`, `Lists/MonthlyReviews`, `Lists/ManagerReviews`, `Lists/WellbeingAssessments`, `Lists/OneToOneSettings`, `Lists/OneToOneFeedback`, `Lists/OneToOneAmendments`, `Lists/OneToOneActions`, `Lists/OneToOneActionUpdates`, `Lists/OneToOneActionNotices` (the flows find several of them by URL, and the page uses `OneToOneActionUpdates` to find each technician's folder; Setup also finds the retired `Lists/OneToOneChallenges` by URL) |
| Solution | `ESGOneToOne`, flow names `ESG 1-to-1 \| 0…6`, `8 Amendment notice`, `9 Action access`, `10 Action update`, `11 Action notice` (there is no 7 from 1.4), environment variables `esg_SiteUrl` and `esg_ManagerEmail` |

If a list title ever has to change, edit `CONFIG.lists` at the top of `one-to-one.js` and the list chosen in each flow action.

### 12.2 What each flow does

| Flow | Starts | Job |
|---|---|---|
| ESG 1-to-1 \| 0 Setup (run once) | by hand | Creates or completes the lists, columns, indexes, views, permission levels, group, list permissions and the Bands and Reminders settings. Safe to re-run; never deletes data; emails a summary. |
| ESG 1-to-1 \| 1 Daily scheduler | 07:00 UK daily | Creates each month's reviews (with every expectation that applies, Shared first), makes them private, emails each technician their own link, sends reminders on your reminder days (default 20th and 27th), emails you 7 days before, on the day and weekly while overdue for each person's next wellbeing (E12) and appraisal (E17) dates, and reports problems to you – including a submitted review that was never processed. From 1.5 it also adds agreed actions Flow 3 couldn't, creates the E20 deadline reminders, and puts stuck action updates and failed action emails back in the queue |
| ESG 1-to-1 \| 2 Review submitted | when a technician submits | Locks the review (read-only), stamps the trusted record, emails you. Your own amendments are not treated as a new submission. |
| ESG 1-to-1 \| 3 Manager decision | when you Complete / Close | Validates, locks, releases your feedback to that technician only, emails them; from 1.5, adds the review's agreed actions to the action tracker (once each) |
| ESG 1-to-1 \| 4 Team members | when you add or deactivate someone (checks every 5 min) | Gives or removes access to the page; removes anyone in the group without an Active row; emails you |
| ESG 1-to-1 \| 5 Wellbeing | as a wellbeing assessment moves on (checks every 5 min) | Shares it with that person only, locks it when they submit, stamps completion, emails you both |
| ESG 1-to-1 \| 6 Feedback | when someone uses the 💬 Feedback bubble (checks every 5 min) | Makes the item Owners-only and emails it to you; if that fails, marks it Failed and it shows in *Needs your attention* |
| ESG 1-to-1 \| 8 Amendment notice | when you save an amendment, or click Resend (checks every 5 min) | Emails the person that their 1-to-1 for that month was amended (E16: the month and a link, never the change or the reason); marks it Sent, or Failed and tells you |
| ESG 1-to-1 \| 9 Action access | when an action is added or changed (checks every 5 min) | Makes each action readable by exactly its person, gives each person their own update folder, and removes any other access it finds |
| ESG 1-to-1 \| 10 Action update | when someone sends an update on an action (checks every 5 min) | Checks it really came from that person's own folder and follows the rules, records it on the action (never over your changes), locks it, and queues E19 for a close-out request |
| ESG 1-to-1 \| 11 Action notice | when an action email is waiting (checks every 5 min) | Sends E19 (close-out requested, to you) and E20 (deadline in 5 working days, to the person, copied to you); records Sent or Failed |

There is no Flow 7 from 1.4 (the challenge flow was removed).

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
| R20 (1.4) | Site owners and site collection admins can edit the *1-to-1 Amendments* audit | Tamper-evident: versioning (100) keeps every change; the E16 email to the technician is an independent record; Owners stays the TL only (quarterly check). |
| R21 (1.4) | Flow 7 and the retired *1-to-1 Challenges* list stay in the environment until the TL deletes them | Flow 7 is turned off before the import; the list is Owners-only with open items closed; deletion is a separate, approved step (MIGRATION_1_4 step 10). |
| R22 (1.5) | Site owners can edit 1-to-1 Actions, including `HistoryJson` | Tamper-evident, not tamper-proof: versioning keeps every change; the page and flows only ever append to the history, under an etag check. |
| R23 (1.5) | Updates and emails depend on flows 9–11 running (polling about every 5 minutes) | The page never shows success before flow 10 records an update; *Needs your attention* flags updates not recorded and actions not shared after an hour, failed emails and delivery unknown. |
| R24 (1.5) | Email can't promise exactly-once delivery | One notice per request or deadline (unique key); claimed before sending; a send that didn't finish shows as *delivery unknown*, and a Resend may arrive twice. |
| R25 (1.5) | Actions agreed before the upgrade are not tracked | By design (no import): they stay in their reviews, marked *Agreed before action tracking started*; the TL can add any that still matter with **+ New action**. |
| R26 (1.5) | A technician's interrupted update is remembered in their own browser (local storage) so it can be offered again | Only on that person's device, only their own text, cleared once it is received; a private window or cleared storage just means they retype it. |
| R16 (v4.1) | `validateUpdateListItem` might read dd/MM/yyyy using the TL's *personal* regional settings rather than the site's | Tenant test F27 checks the round trip. If it fails, set your personal region to English (UK). |
