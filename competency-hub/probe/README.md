# Phase 0 probe P0: Welcome and site checks

**What it proves:**
- Welcome by Accelerator 365 runs the Competency Hub's JavaScript on the new site.
- The script can identify the signed-in user and read the site.
- The site is set to UK regional settings and London time.
- The browser Back button works with the app's page links.

This covers probes P-01, P-07 and P-09 in the plan.

**It changes nothing.** The probe only reads. No lists, items or permissions are created or changed.

**Time:** about 20 minutes.

**Evidence status:** so far it has only been tested locally against a simulated SharePoint (`test/run-probe-test.js`). It is **not proven** on the real site until you run it there.

---

## Before you start

| # | Check | Who | Changes the site? |
|---|---|---|---|
| 1 | The new Competency Hub site exists, and you are an owner of it | IT / you | Already done by IT, or **needs IT** |
| 2 | Welcome by Accelerator 365 appears when you add a web part on that site (C-11) | You look | No |
| 3 | You have the two files `CH_Probe_P0.html` and `CH_Probe_P0.js` on your work computer, transferred through the approved route | You | No |

If Welcome is not offered on the new site, **stop here** and ask IT to make it available.

## Step 1: Create a probe page (needs your permission: adds one page)

1. On the new site, go to **Site contents → Site Pages → + New → Site page → Blank**.
2. Title it **`HubProbe`**.
3. Add a section with the **Full-width** layout.
4. Click **+**, search for **Welcome** and add it. If Welcome asks you to set up a data source, follow its prompts. This creates the **Welcome Web Part - Custom Layouts** library and the **Welcome Web Part - Errors** list.
5. Click **Publish**.

## Step 2: Upload the two files (needs your permission: adds two files)

1. Go to **Site contents → Welcome Web Part - Custom Layouts**.
2. Click **Upload → Files** and choose **both** `CH_Probe_P0.html` and `CH_Probe_P0.js`.
3. If the library asks you to check files in or approve them, do so.

## Step 3: Select the probe layout

1. Open the `HubProbe` page and click **Edit**.
2. Select the Welcome web part and click the **pencil** (settings).
3. Choose the layout **Competency Hub probe P0**.
4. Turn **off** any News, Slides, Background, Search, Greeting, Weather or Time options.
5. Click **Republish**.

## Step 4: Run it

1. Reload the page. A box headed **"ESG Competency Hub – Phase 0 probe"** appears, and the checks fill in within a few seconds.
2. Click **Run back-button test (P-09)**. The address bar changes briefly and then returns.
3. Leave **"Hide my name, email and site address"** ticked.

**What success looks like:**

| Check | Expected result |
|---|---|
| C1, C2, C3 | PASS: Welcome ran, the user was identified, and the site was read |
| C4 | NOTE: "Site owner" (information only) |
| C5 | PASS: locale 2057 and time zone 2, London. A FAIL means the site's regional settings need changing to English (UK) and London **before** any lists are created. |
| C6 | PASS: shows today's UK date |
| C7, C8 | PASS: both Welcome lists can be read |
| C9 | NOTE: "None found", as expected for a new site |
| C10 | PASS |
| C11 | PASS: Back restored the address and the page stayed loaded |

## Step 5: Send back

1. Everything in the **results box** (select it, then copy).
2. One **screenshot** of the whole probe box.
3. The **Welcome version**, if you can see it in the web part settings or its About panel.
4. If the box never appears: press **F12**, open **Console**, and screenshot any red errors.

## If anything goes wrong, or to remove the probe

The probe stores nothing, so removing it is simple:

1. Delete the `HubProbe` page (**Site Pages → … → Delete**).
2. Delete `CH_Probe_P0.html` and `CH_Probe_P0.js` from **Welcome Web Part - Custom Layouts**.

Leave the two Welcome lists in place. The real app will need them.

Nothing on any other site, including your existing ESG sites, is involved.

## What happens next

- **After P0 passes:** with your approval, Setup creates the Competency Hub lists, groups and folders on the new site (plan G.3). The second probe then checks folder permissions, request folders and add-only writes using test accounts. That covers P-03, P-04 and P-13, and needs two technician test accounts.
- **Permissions needed then:**
  - you as site owner;
  - the flow account as Site Collection Administrator (D-03);
  - two test accounts with no other access to the site.
