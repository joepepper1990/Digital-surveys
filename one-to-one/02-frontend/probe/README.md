# Stage 0A: Welcome feasibility probe

> **Stage status:** Stage 0A is complete and accepted. This file is the 0A runbook, kept for reference. For Stage 0B (security verification) use **`README-stage0b.md`** and `probe-0b.html` / `probe-0b.js`. The proven 0A wrapper is preserved as `probe-0a2.html` / `probe-0a2.js`.


**What this proves:** that **Welcome by Accelerator 365** runs our JavaScript, and that the script can **read and write** SharePoint as the signed-in user.

**What it doesn't test:** permissions, privacy or protected fields. That's Stage 0B, which is produced only after 0A passes.

**Data:** uses one throwaway test list, `ZZProbe0A`. No technician or HR data is touched.

**Time:** about 45 minutes.

## Before you start

- [ ] IT has confirmed **Welcome by Accelerator 365** is available in the tenant (IT-10).
- [ ] The private site exists and is locked down (plan G Part 1).
- [ ] You have **one technician test account** (Test A) and can sign in with it in an InPrivate or Incognito window.
- [ ] You have `probe-0a.html` (this folder) on your work computer, transferred through the approved route.

## 1. Create the test list (2 min)

1. On the site, go to **Site contents**, click **+ New**, then **List**, then **Blank list**.
2. Name it **`ZZProbe0A`**, exactly like that. Untick *Show in site navigation*. Click **Create**.
3. Click **+ New item**, set Title to **`test`**, and click **Save**.

Don't give anyone else access to this list.

## 2. Create the page and add Welcome (5 min)

1. Go to **Site contents → Site Pages**, then **+ New → Site page → Blank**.
2. Title the page **`OneToOne`**.
3. Click **+** to add a web part. Search for **Welcome** and add it.
   - If Welcome isn't listed, stop and ask IT (IT-10).
4. If Welcome asks you to set up a **data source**, follow its prompts. This creates the document library **Welcome Web Part - Custom Layouts** in Site contents.
5. Click **Publish**.

## 3. Upload and select the probe (5 min)

1. Go to **Site contents**, open **Welcome Web Part - Custom Layouts**, then click **Upload → Files** and choose `probe-0a.html`.
2. Open the `OneToOne` page and click **Edit**. Select the Welcome web part and click the **pencil** (settings).
3. Choose the layout **1-to-1 probe 0A**.
4. Turn **off** any greeting, time, weather or search options.
5. Click **Republish**.

## 4. Run as yourself, the Team Leader (5 min)

1. Reload the page. A box headed **"ESG 1-to-1 – Stage 0A probe"** should appear.
2. Expect **PASS** for A1, A2, A2b, A3 and A4. A2b should say *Owner (Team Leader mode)*.
3. Click **Run write test (Team Leader only)**. Expect **PASS** for A5 and A6.
4. In `ZZProbe0A`, confirm the item's Title now reads `probe write …`.

## 5. Run as the technician test account (15 min)

First give Test A access to **the page and the layout library only**. This is the production setup from plan D.6, so it's done once.

1. **Create the group.**
   1. Click the **gear**, then **Site permissions**, then **Advanced permissions settings**.
   2. On the ribbon, click **Create Group**.
   3. Name it **`1-to-1 Technicians`**.
   4. Set **Who can view the membership: Group Owner** and **Allow requests to join: No**.
   5. **Untick every permission level** at the bottom of the page.
   6. Click **Create**.
2. **Add Test A** to the group: click **New → Add Users**. Untick *Send an email invitation*.
3. **Give the group Read on the page.**
   1. Go to **Site Pages**, click **…** next to `OneToOne`, then **Manage access**.
   2. Click **Advanced settings**, then **Stop Inheriting Permissions**.
   3. Click **Grant Permissions**, choose `1-to-1 Technicians` with level **Read**, and untick *Send an email invitation*.
4. **Give the group Read on the layout library.**
   1. Open **Welcome Web Part - Custom Layouts**.
   2. Click the **gear**, then **Library settings**, then **Permissions for this library**.
   3. Click **Stop Inheriting Permissions**, then **Grant Permissions**: `1-to-1 Technicians`, **Read**.
5. **Run the probe as Test A.** Open an **InPrivate** window, sign in as Test A, and open `<your site>/SitePages/OneToOne.aspx`.
   - Expect **PASS** for A1, A2, A2b (*Not an owner*), A3 and A4.
   - **A3 should show *No items visible*.** Test A has no access to the test list, so that's the correct result.
   - The write-test button stays greyed out for Test A.

## Result

| Stage 0A is… | when |
|---|---|
| **PASSED** | A1–A6 all pass for you, **and** A1–A4 pass for Test A, with A3 showing no items |
| **FAILED** | A1 never appears, any check shows FAIL, or Test A can see items in `ZZProbe0A` |

**Send the result back.** Copy the text from the results box. Leave **Redact** ticked, so your name, email and site address are replaced. Paste it into the next Claude Code session, once for your account and once for Test A.

## If the script doesn't run

This is the case where the box never appears, or a different layout shows.

1. Press **F12**, then open **Console**. Look for *Refused to execute script* or similar, and note the message.
2. Check that the layout appears in the Welcome layout list. If it doesn't, compare the two `<template …>` opening lines in `probe-0a.html` with the example in Accelerator 365's guide *Custom layout: Getting started* (support.accelerator365.com). Change **only those two lines** to match, then re-upload.
3. Still nothing? Welcome may load scripts differently:
   1. Copy everything between the `ZZPROBE-JS BEGIN` and `ZZPROBE-JS END` comments into a new file `probe-0a.js`.
   2. Upload it next to the HTML file.
   3. Reference it the way Accelerator 365's documentation describes for script files.
4. If it still won't run, send IT or Accelerator 365 support the console message (IT-10, IT-12). If scripts can't run in layouts, **stop**. The plan's fallback (E.0) applies, and nothing built so far is wasted.

## Clean-up

- **Delete** `probe-0a.html` from *Welcome Web Part - Custom Layouts*.
- **Keep** the `OneToOne` page, the `1-to-1 Technicians` group, the layout library and `ZZProbe0A`, because Stage 0B reuses them.
