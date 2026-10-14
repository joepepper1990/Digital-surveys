# Stage 0B: Welcome security verification

**Purpose.** Prove, in the live SharePoint environment, that a technician can reach their own data only, cannot touch protected or manager-only data, cannot change permissions or code, and that malicious input is rendered safely.

**What it uses.** Two throwaway lists, `ZZProbeRecords` and `ZZProbeManager`, with entirely fictional data, built and torn down by the probe itself. **No production lists, flows or real records.**

**Files** (this folder):
- `probe-0b.html` — the Welcome custom layout (same proven wrapper as the passed 0A-2 probe).
- `probe-0b.js` — the external script: Team Leader setup/verify/control, technician tests B1–B19, redacted export, cleanup.

**Accounts you need:** your Team Leader (TL) account, and **two** technician test accounts, **Test A** and **Test B**.

**Time:** about 60–75 minutes, most of it the Test A and Test B runs.

> **Repository note.** This repo is public. The probe never contains tenant URLs, names or emails — it reads them live and redacts them from its exported results. Keep **Redact** ticked when copying results back.

---

## Mandatory vs informational

- **Mandatory (M):** a release blocker. Any FAIL stops the project.
- **Informational (INFO):** records a fact. **But if an informational result reveals an exploitable weakness, treat it as a blocker** until it is fixed or you accept it in writing.

The results table shows a verdict per test. Export shows the same. Do not proceed to Stage 1 with any mandatory FAIL.

---

## 1. Prerequisites

- [ ] Stage 0A passed (the frontend runs and REST read/write work).
- [ ] You can sign in as the TL, Test A and Test B (use separate InPrivate windows).
- [ ] The `1-to-1 Technicians` group exists with **Read** on the `OneToOne` page and the layout library (from Stage 0A).
- [ ] You have `probe-0b.html` and `probe-0b.js` on your computer (from this folder, via your approved transfer route).

## 2. Create the `1-to-1 Edit` permission level

Gear (top right) → **Site permissions** → **Advanced permissions settings** → ribbon **Permission Levels** → click **Contribute** → **Copy Permission Level**.
- Name: `1-to-1 Edit`
- **Untick:** Add Items, Delete Items, Delete Versions, Manage Personal Views, Add/Remove Personal Web Parts, Update Personal Web Parts.
- **Leave ticked:** Edit Items, View Items, Open Items, View Versions, View Pages, Browse User Information, **Use Remote Interfaces**, Use Client Integration Features, Open.
- **Create**.

## 3. Create the `1-to-1 Read` permission level

Same page → click **Read** → **Copy Permission Level**.
- Name: `1-to-1 Read`
- **Untick:** View Versions, Create Alerts.
- **Create**.

## 4. Which permissions must be on/off (summary)

| Level | Must be OFF | Must stay ON |
|---|---|---|
| `1-to-1 Edit` | Add Items, Delete Items, Delete Versions | Edit Items, View Items, Open Items, Use Remote Interfaces |
| `1-to-1 Read` | View Versions, Create Alerts | View Items, Open Items, Use Remote Interfaces |

"Use Remote Interfaces" must stay on in both, or the frontend's REST calls fail.

## 5. Verify both levels

On the Permission Levels page, open each and confirm the boxes match section 4. The probe also checks them automatically in step 10 (test S1) and will stop if either is missing.

## 6. Upload the two Welcome files

**Site contents** → open **Welcome Web Part - Custom Layouts** → **Upload** → **Files** → add `probe-0b.html` and `probe-0b.js`. If asked to replace, choose **Replace**.

## 7. Required library properties

- The two files must sit **together in the same library** (the script is referenced as `src="probe-0b.js"`, a relative path).
- Neither file may be left **checked out**: if a file shows a green arrow, select it → **More** → **Check in**.
- If the library has **content approval** on, approve both files (**More → Approve/Reject → Approved**).

## 8. Select the Stage 0B layout

Open the `OneToOne` page → **Edit** → select the **Welcome** web part → **pencil** (settings) → **Layout** → **1-to-1 probe 0B** → turn **off** greeting, time, weather and search → **Republish**.

## 9. Reset Welcome's layout cache

If the page still shows the old 0A probe or a blank area after republishing:
1. Hard-refresh the page (**Ctrl+F5**).
2. If unchanged, in the web part settings switch **Layout** to any built-in layout, republish, then switch back to **1-to-1 probe 0B** and republish again. This forces Welcome to re-read the layout.
3. Still stale → re-upload `probe-0b.html` (its contents changed, so the cache key changes).

## 10. Prepare the two test technician accounts

Each test account must be a member of `1-to-1 Technicians` (so it can open the page), and nothing more. If you created them for Stage 0A they are already set up. The probe grants the per-record access itself — **do not** add the accounts to any list by hand.

You will need each account's **sign-in name** in claims form for the setup step:
`i:0#.f|membership|<their-sign-in>`
If unsure, as the TL open `<SITE>/_api/web/currentuser?$select=LoginName` **while signed in as that account** (or ask them to), and copy the `LoginName`.

## 11. Create the fictional data safely (Team Leader)

1. Sign in as the **TL** and open the `OneToOne` page. The probe shows a **Team Leader** panel.
2. Enter the Test A and Test B sign-in names in the two boxes.
3. Click **1. Prepare / verify test environment**.
4. Watch the table. Every **S** row must be **PASS**. In particular **S5.1–S5.7** verify each record has only Owners plus the one intended technician, at exactly the intended level. **If any S row is FAIL, stop** and fix it (usually a missing permission level from section 2–3). The probe will not let you continue until setup verifies.

The setup only ever touches lists whose title starts with `ZZProbe`. It never grants the technicians group access to any record.

## 12. Which buttons to press, in order

| Who | Button | When |
|---|---|---|
| TL | **1. Prepare / verify test environment** | first |
| TL | **2. Run control tests** | after S rows all PASS (proves the test requests are valid as owner) |
| Test A | **Run my technician security tests** | signed in as Test A |
| Test B | **Run my technician security tests** | signed in as Test B |
| TL | **Clean up (delete test lists)** | after all results captured |

## 13. Expected results

**Team Leader — setup (S):** all PASS. **Control (C1–C3):** all PASS (the owner *can* write and read versions; this proves the requests are valid, so a technician being refused them is meaningful).

**Technician (Test A and Test B) — mandatory, all must be PASS:**

| Test | Expected |
|---|---|
| B1 | Records list shows only your own items |
| B2 / B3 | Guessing item IDs 1–40 reveals nothing belonging to anyone else |
| B4 | Manager list shows only your own **released** feedback; never unreleased, never another person's |
| B5 | Manager version history is refused (you cannot read earlier draft feedback) |
| B6 | You can edit your own open record |
| B7 | You cannot edit your own locked record (and it is unchanged) |
| B8 | You cannot edit anyone else's record |
| B9a–d | You cannot create records, delete your record, add attachments, or add columns |
| B10a/b | You cannot change item permissions or create sharing links |
| B11 | You cannot upload or overwrite a file in the layout library (code integrity) |
| B13 | You cannot change a protected manager field |
| B15 | Injected HTML/script shows as plain text — **no pop-up appears** |
| B16 | Odd characters (quotes, brackets, JSON) are stored and shown as literal text |

**Informational (INFO) — read these, don't ignore them:**

| Test | What it tells you |
|---|---|
| B12 | You **can** write your own draft fields (expected). This is why production never trusts those fields; workflow state lives on the manager-only list (plan D.7). |
| B14 | Whether "Modified By" can be forged. If it says *WARNING*, that's fine for us because the design already never trusts "Modified By" — but record it. |
| B17 | Very long input is handled cleanly. |
| B18 | Spreadsheet formula text is stored verbatim — open any list export in Excel **Protected View** and don't enable editing. |
| B19 | How much of the staff roster / group membership a technician can see. If group members are visible, set the group's membership visibility to **Group Owner** (section 17). |

## 14. How to record failures

For any FAIL: note the test ID, press **F12 → Console** and **Network**, and capture the failing request's URL and status. Keep **Redact** ticked, copy the results box, and bring that plus a screenshot back. A mandatory FAIL means do not proceed; send it to this project to diagnose.

## 15. Export and redact evidence

At the bottom of the panel, leave **Redact account and site details from results** ticked. Copy the text box. It replaces your name, email, sign-in and site address with placeholders. Export once per account (TL, Test A, Test B).

## 16. Clean up safely

As the TL, click **Clean up (delete test lists)** and confirm. It deletes only lists still marked `zz-probe`. Then:
- **Site contents → Recycle bin → empty** (and the **second-stage recycle bin**) to remove the test lists fully.
- Delete `probe-0b.html` and `probe-0b.js` from the layout library once testing is done.

## 17. What to retain for production

Keep these — Stage 1 reuses them:
- The site, the `OneToOne` page and the **Welcome Web Part - Custom Layouts** library.
- The `1-to-1 Edit` and `1-to-1 Read` permission levels.
- The `1-to-1 Technicians` group, with **Read on the page and layout library only**. Set its **membership visibility to Group Owner** so technicians can't list each other (confirmed by test B19).

**Welcome support list.** Welcome keeps an error list named `WMW_WMReplyWelcomeWebPartErrors`. During earlier testing, a non-owner being unable to read it caused a blank frontend. If a blank page recurs for a technician, grant the `1-to-1 Technicians` group **Read on that one list** (Site contents → the list → settings → Permissions → Stop inheriting → Grant → Read). It holds only diagnostic error text, never review data, so Read is low-risk; clear it periodically. Do **not** grant the group access to any other list.

---

## Verdict

Stage 0B passes when: all TL setup and control rows PASS, **every mandatory B test PASSES for both Test A and Test B**, and no informational finding reveals an exploitable weakness. Only then move to Stage 1.
