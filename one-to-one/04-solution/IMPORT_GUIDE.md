# ESG 1-to-1 — import the flows and create the lists (v4)

You don't build the flows or the lists by hand any more:

- **Import one solution file.** It contains all seven flows.
- **Run the setup flow once.** It creates the seven lists exactly as specified, plus the permission levels, the technicians group and the list permissions.

| File | What it is |
|---|---|
| [`ESGOneToOne_1_2_1_0_unmanaged.zip`](ESGOneToOne_1_2_1_0_unmanaged.zip) | **The solution (1.2.1.0).** Seven flows, three connection references, two environment variables. |
| [`legacy-package-builder.html`](legacy-package-builder.html) | **Fallback only**, if your environment can't import solutions (§6). |

The seven flows:

| Flow | Starts | Job |
|---|---|---|
| **ESG 1-to-1 \| 0 Setup (run once)** | On | Run by hand. Creates or completes the lists, columns, indexes, views, permission levels, group and list permissions, and the `Bands` and `Reminders` settings. **Safe to re-run:** it adds what's missing and brings settings up to the specification. It never deletes a list, column or item, and never lowers version history. Then it emails you a summary. |
| **ESG 1-to-1 \| 1 Daily scheduler** | Off | 07:00 UK daily: creates each month's reviews, makes them private, emails links, sends reminders on the days set in ⚙ Settings → Reminders (20th and 27th by default), and emails you a week before (and on the day) a wellbeing review is due. |
| **ESG 1-to-1 \| 2 Review submitted** | Off | Locks a submitted review, stamps the Manager Review, emails you. |
| **ESG 1-to-1 \| 3 Manager decision** | Off | On Complete / Close: validates, locks, releases the feedback, emails the technician. |
| **ESG 1-to-1 \| 4 Team members** 🆕 1.1 | Off | Keeps the `1-to-1 Technicians` group in step with the Technicians list: someone you add in ⚙ Settings → Team gets access to the page; someone you deactivate loses it. **Full sync:** each run also removes anyone in the group without an Active row (so don't add people to the group by hand). Emails you each change. |
| **ESG 1-to-1 \| 5 Wellbeing** 🆕 1.1 | Off | Wellbeing assessments: makes each one private to you and that person, emails them the link, locks it when they submit (and wipes anything they typed in your part), stamps completion and emails them the agreed record. |
| **ESG 1-to-1 \| 6 Feedback** 🆕 1.2 | Off | Feedback from the page's 💬 bubble: makes each item Owners-only, emails it to you (E13). If that email fails it marks the item *Failed*, tries a short notice, and the page shows it in your *Needs your attention*. |

Flows 1–6 are imported **off**, because the lists don't exist until the setup flow has run.

---

## 0. Already imported an earlier version? Upgrade to 1.2.1 (10 min)

Do this instead of §1–§3 if **ESG 1-to-1** (1.0, 1.1 or 1.2.0) is already in your environment. Every step applies whichever version you're on: **1.2.1 needs Setup re-run** – it adds the *1-to-1 Feedback* list (if missing) and the `1-to-1 Submit` permission level, and moves the group on that list from Contribute to `1-to-1 Submit`.

1. **Solutions → Import solution → Browse** → `ESGOneToOne_1_2_1_0_unmanaged.zip` → **Next**.
   - It says it will **upgrade** the existing solution. Keep the defaults and leave *"Enable Plugin steps and flows included in the solution"* **unticked**.
   - Connections and environment variables keep their current values; just click **Next / Import**.
2. Run **ESG 1-to-1 | 0 Setup (run once)** again. It adds what's missing – the **1-to-1 Feedback** list (new in 1.2), and from 1.0 also the **Wellbeing Assessments** list and the **Reminders** setting – and changes nothing that already exists. Wait for the summary email.
3. Once the Setup summary email has arrived, make sure every flow is **On**, in this order: **2 Review submitted**, **3 Manager decision**, **4 Team members**, **5 Wellbeing**, **6 Feedback**, and **1 Daily scheduler** last. Flows that are already On stay On.
   - Import message *"one or more flows may not have turned on … GetTable … List not found"*: this was 1.1.0.0's Flow 1 looking for the Wellbeing list before Setup had created it. 1.1.1.0 and later fix it. If you still see it, it is harmless: finish step 2 (Setup), then turn the flow on here.
4. Upload the new `one-to-one.html` and `one-to-one.js` (v4.4.0) with **Replace**, then web part settings → **Reset layout cache** → **Republish**. The top bar shows **v4.4.0**, a **Wellbeing** tab, and the 💬 **Feedback** bubble bottom-right.
5. Check: Site contents → **Wellbeing Assessments** → Permissions: **Owners – Full Control only**; **1-to-1 Feedback** → as in §4 below.

## 1. Before you start (5 min)

- [ ] The private 1-to-1 site exists, and you are its **owner and Site Collection Administrator** (Stage 0B finding B10a).
- [ ] It is a **site collection of its own**, not a subsite that inherits permission levels. Setup creates the `1-to-1 Edit` and `1-to-1 Read` permission levels, which SharePoint only allows on a site with its own permission levels. The communication site created in plan G Part 1 qualifies.
- [ ] Have these two values ready:

  | Value | Example (yours will differ) |
  |---|---|
  | **Site URL** | `https://<tenant>.sharepoint.com/sites/<site>`, with **no trailing slash** |
  | **Your email address** | the TL mailbox, which receives submissions and problem reports |

- [ ] Sign in to **Power Automate** (make.powerautomate.com) **as yourself**. The flows run under your connections (decision D1).
- [ ] Top right, pick the environment IT named for the flows (IT-3).
- [ ] Check the environment supports solutions: open **Solutions** in the left menu.
  - It lists solutions, or offers **Import solution**: carry on with §2.
  - It says the environment needs a **Dataverse database**, or *Solutions* is missing: use §6 instead, or ask IT for an environment with Dataverse.

## 2. Import the solution (10 min)

1. **Solutions → Import solution → Browse** → choose `ESGOneToOne_1_2_1_0_unmanaged.zip` → **Next** → **Next**.
2. **Connections.** For each of the three connection references, pick an existing connection or click **+ New connection**, signed in as **you**:

   | Connection reference | Connector |
   |---|---|
   | ESG 1-to-1 SharePoint | SharePoint |
   | ESG 1-to-1 Outlook | Office 365 Outlook |
   | ESG 1-to-1 Office 365 Users | Office 365 Users |

3. **Environment variables:**
   - **ESG 1-to-1 Site URL** = your site URL, with no trailing slash.
   - **ESG 1-to-1 Team Leader email** = your email.
4. **Import.** Wait for *"Solution ESG 1-to-1 imported successfully"*. It takes a minute or two.

> If the import reports a problem, copy the message. **Solutions → History** has the details. Use the prompt in [`../NEXT_STEPS.md`](../NEXT_STEPS.md) to get a fix.

## 3. Run the setup flow (5 min)

1. **Solutions → ESG 1-to-1 → ESG 1-to-1 | 0 Setup (run once) → Run → Run flow.**
   - The first time, it asks you to confirm the connections. Click **Continue**.
2. Wait for **Succeeded**, about 2–4 minutes.
3. Check your inbox for **"ESG 1-to-1 setup: complete"**.
   - If the subject says **"complete with items to check"**, the email lists exactly what to fix by hand. For example: regional settings, not being Site Collection Admin, or an existing permission level with different rights.
   - Fix those and **run the setup flow again**. It is safe to re-run.

**What setup does:**

| Item | Result |
|---|---|
| Permission levels | `1-to-1 Edit`, `1-to-1 Read` and (from 1.2.1) `1-to-1 Submit`, with the exact rights in plan D.3. It creates them if missing. If one already exists with different rights, it **warns and doesn't change it**. |
| Group | `1-to-1 Technicians`, created if missing. Membership is visible to group members only. SharePoint has no owner-only option, so technicians can see who else is in the group. No join requests. **No site permissions.** |
| Lists | **Technicians**, **Appraisal Expectations**, **Monthly Reviews**, **Manager Reviews**, **Wellbeing Assessments**, **1-to-1 Settings**, **1-to-1 Feedback**, matching [`../01-sharepoint/lists.md`](../01-sharepoint/lists.md) exactly: every column type, choice, default, min/max and index, *Enforce unique values* on `ReviewKey`, and the views *Active*, *Needs attention*, *Retired* (Appraisal Expectations), *Overdue*, *Open actions* (Manager Reviews) and *Reviews due* (Wellbeing Assessments). |
| List settings | Versioning on (100 versions), attachments off, not in search, offline sync off, not on the quick launch |
| List permissions | Inheritance stopped. **Owners – Full Control only.** **1-to-1 Settings** also gets `1-to-1 Technicians` – Read. |
| `Bands` and `Reminders` settings | The default band thresholds, and reminder days 20th and 27th |
| 1-to-1 Feedback (1.2) | Item-level permissions: each person reads and edits only their own items; `1-to-1 Technicians` – **1-to-1 Submit** on this list only (a third permission level setup creates: Contribute without delete, versions, alerts or personal views) |
| Checks (warnings only) | You are Site Collection Admin; regional settings are English (UK) and London time; the Site URL has no trailing slash |

**What setup does not do.** These were done in Stage 0, and the runbook covers them:

- create the site or the `OneToOne` page;
- upload the frontend;
- grant the group Read on the page, the layouts library and the Welcome Errors list;
- add people to the group.

**Existing lists.** Setup recognises the seven lists by their **web address** (`Lists/Technicians`, `Lists/AppraisalExpectations`, `Lists/MonthlyReviews`, `Lists/ManagerReviews`, `Lists/WellbeingAssessments`, `Lists/OneToOneSettings`, `Lists/OneToOneFeedback`). If one already exists (for example, you started building it by hand), setup **keeps it**:

- it adds only the missing columns, indexes and views;
- it sets the display name and list settings, raising the version limit to at least 100 and never lowering it;
- it tidies the permissions.

It removes your own direct entry only if you are Site Collection Admin or in the Owners group, so you can't be locked out. If a *different* list already uses one of the seven names, the summary email tells you to rename it.

## 4. Check the result (5 min)

- [ ] **Site contents** shows the seven lists: Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, **Wellbeing Assessments**, 1-to-1 Settings, **1-to-1 Feedback**.
- [ ] Open each list → **Settings → Permissions for this list**:
  - the five data lists (including **Wellbeing Assessments**, which holds health information): **Owners – Full Control** only;
  - **1-to-1 Settings** also has `1-to-1 Technicians` – Read;
  - **1-to-1 Feedback** has Owners – Full Control **and** `1-to-1 Technicians` – **1-to-1 Submit**. Its List settings → Advanced settings → *Item-level permissions* must be **Read items that were created by the user** and **Create items and edit items that were created by the user** (so each person sees only their own until Flow 6 locks it).
- [ ] **1-to-1 Settings** has two items, `Bands` and `Reminders` (a third, `Labels`, appears if you rename roles in ⚙ Settings → Names).
- [ ] Spot-check one column: Monthly Reviews → List settings → **Q9FollowUp**. The address bar ends `Field=Q9FollowUp`, and there are three choices.

## 5. Turn on flows 1 to 6

Only after the Setup summary email (§3) – flows 4 and 5 need the lists it creates. **0 Setup** stays On; it only runs when you click Run. (If it ever shows Off, turn it on before running it.)

1. **Solutions → ESG 1-to-1** → select each flow → **Turn on**, in this order: **2 Review submitted**, **3 Manager decision**, **4 Team members**, **5 Wellbeing**, **6 Feedback**, and **1 Daily scheduler** last (so the first daily run finds everything else ready).
2. Continue with the runbook:
   - [`../GO_LIVE_RUNBOOK.md`](../GO_LIVE_RUNBOOK.md) **Phase 6**: install the frontend.
   - **Phase 8**: Test A and Test B first.
   - **Phase 10**: rehearsal.

> **Testing a different date (plan H tests F13–F20).** Open flow 1 → **Edit** → **Initialize varTestDate** → type a date such as `2026-11-20T07:00:00` → **Save** → **Run**. **Clear it afterwards and save.** Leave it empty in production.

**Secure inputs/outputs** are already on for the SharePoint triggers and every data, Filter array, Select and email action in flows 1–6. Steps that use their outputs are hidden automatically, so answers and feedback don't appear in run history. Only the steps that look up role, group and list IDs stay visible. The setup flow's history shows only list and column names; it handles no personal data.

---

## 6. Fallback: legacy packages (no Dataverse)

Use this only if §1 showed that solutions can't be imported.

1. Open [`legacy-package-builder.html`](legacy-package-builder.html) in Edge or Chrome (double-click the file). It works offline.
2. Enter the **site URL** and **your email**, then click **Create the six packages**. Six zips download: `ESG-1to1-0-legacy.zip` to `ESG-1to1-5-legacy.zip`.
3. For each zip, in order 0 to 5:
   1. Power Automate → **My flows → Import → Import Package (Legacy)** → **Upload**.
   2. Under **Related resources**, click each connection (spanner icon), pick your own connection, and click **Save**.
   3. Under *Import setup*, keep **Create as new**.
   4. Click **Import**.
4. Continue at §3 (run flow 0), then §4 and §5. Find the flows under **My flows** rather than *Solutions*.

**Differences in legacy mode:**

- The site URL and email are written into the flows. To change them later, re-run the builder and re-import (*Update*), or edit the flows.
- Legacy flows may import **On**. Make sure flows 1–6 are **off** until setup has run, or let them fail harmlessly. Each failure emails you *"action needed"*, naming the step `STOP_run_the_setup_flow_first`.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Import: *"environment variable value missing"* | Enter both values in step 2.3 |
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

## 8. Updating later

- **New version of this solution:** Solutions → **Import solution** → the new zip → **Upgrade**.
- **Lists:** setup never deletes a list, column or item. A new version only adds what's missing and re-applies the specified settings and permissions.
- To rebuild the zip from source, see [`README.md`](README.md).
