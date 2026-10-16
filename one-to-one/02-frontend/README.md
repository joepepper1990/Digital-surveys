# ESG 1-to-1 — frontend (v5.0.0)

| File | What it is |
|---|---|
| `one-to-one.html` | Welcome custom layout. Contains the metadata (layout name **ESG 1-to-1**), all CSS and the script tag. |
| `one-to-one.js` | The whole app: technician and TL views, charts, settings, reports. Plain JavaScript, no libraries, no external calls. |
| `mock/mock-sharepoint.js` | Local in-memory SharePoint, with fictional users and data, for testing without the tenant |
| `mock/index.html` | **Generated** by `tools/build-mock.js` from the production CSS. Open it in a browser to click through. |
| `test/run-tests.js` | Automated tests of the app (headless Chromium against the mock) |
| `reset/one-to-one-reset.html`, `reset/one-to-one-reset.js` | **Temporary** one-time test-data reset tool (layout **ESG 1-to-1 reset tool**). Upload only for the reset, then remove – see [`../RESET_PROCEDURE.md`](../RESET_PROCEDURE.md). |
| `mock/reset.html` | The reset tool against the mock |
| `test/run-reset-tests.js` | Automated tests of the reset tool |
| `probe/` | Stage 0A / 0B probes (already run; keep for reference) |

**There is nothing to edit before installing.**

**Desktop only.** Confirmed by the TL: phones are out of scope, and there is no phone layout.

- The site is taken from the page.
- The Team Leader is recognised from SharePoint permissions: whoever has *Manage permissions* on the site, which means the site owner and Site Collection Admin.
- List names are in `CONFIG` at the top of `one-to-one.js`. Change them only if you renamed a list.

## Install (tenant)

Prerequisites:

- The eight lists are built ([`../01-sharepoint/lists.md`](../01-sharepoint/lists.md)) by solution **1.4** Setup. Upgrading from 4.5.0 / 1.3: follow the order in [`../MIGRATION_1_4.md`](../MIGRATION_1_4.md). If the page is uploaded before Setup 1.4 has run, nothing breaks: it reads only the columns that exist, released reviews are read-only, and a banner says to run Setup 1.4. Amendments and the new dates appear once Setup has run.
- The `1-to-1 Technicians` group exists.

Steps:

1. **Upload:** Site contents → **Welcome Web Part - Custom Layouts** → Upload → `one-to-one.html` and `one-to-one.js`. Choose **Replace** if asked.
2. **Page:** open `SitePages/OneToOne.aspx` → **Edit**.
   1. The Welcome web part must sit in a **full-width section**. If it doesn't, add a full-width section and move the web part into it.
   2. Web part settings (pencil) → **Layout = ESG 1-to-1**.
   3. Content tab: News posts and Slides **off** (the layout doesn't use them). Background, Search, Greeting, **Weather** (it calls an outside service) and Time and date **off**.
   4. **Republish.**
   5. **Updating to a new version later:** upload with **Replace**, then web part settings → **Reset layout cache** → **Republish**, and check the version at the right-hand end of the top menu bar.

   The layout fills the page width and scales itself up on large screens (CSS zoom 1.1–1.55 above 1,700 px wide). Anyone who wants it bigger or smaller can still use the browser's Ctrl + / Ctrl −.
3. **Home page:** Site Pages → `OneToOne` → … → **Make homepage**.
4. **Permissions for the `1-to-1 Technicians` group: Read on exactly these:**
   - the `OneToOne` page (unique permissions)
   - the *Welcome Web Part - Custom Layouts* library
   - the *Welcome Web Part - Errors* list (`WMW_WMReplyWelcomeWebPartErrors`)
   - the **1-to-1 Settings** list

   Nothing else. The data lists stay Owners-only, and the flows grant item access.
5. **Pop-ups:** the report's *Print / Save as PDF* opens a print window. If the browser blocks it, allow pop-ups for the SharePoint site.

## Smoke check (tenant, 10 minutes)

| # | As | Do | Expect |
|---|---|---|---|
| 1 | TL | Open the site | **Team overview**. The top menu bar has Team overview, Monthly reviews, Expectations, Actions, Wellbeing, **Team ▾** (the team list) and **⚙ Settings**, and shows **v5.0.0** at its right-hand end (no "Today" date in the bar). |
| 2 | TL | ⚙ Settings → Team → set **Next appraisal** (e.g. `15-Jul-2027`), **Next wellbeing** and **Appraisal period start** → Save → reopen | Same dates shown; the Technicians list shows 15/07/2027 in AppraisalDate, and NextWellbeingDate / AppraisalCycleStart are set |
| 3 | TL | Expectations → add a Shared one, then an Individual one, then retire one; then **Delete permanently** a retired test one | A **Shared** card and one card per person; new items go to the end of their group. Retired = Active **No**. Delete permanently asks first, and the item is in the site recycle bin. |
| 4 | Test A | Open the E1 link | Their review. The menu bar has only *This month · My appraisal · Appraisal report · Wellbeing*. |
| 5 | Test A | Change `?reviewId=` to Test B's ID | "Review not found" |
| 6 | Test A | Save, reload | Answers kept |
| 7 | TL | Open Test A's review → add 2 actions → Save | Manager Reviews: `ActionsJson` has 2 rows, `ActionsStatus` = Open, `NextActionDue` set |
| 8 | TL / Test A | Appraisal report → Print / Save as PDF | The print window opens with 8 sections and no wellbeing answers |
| 9 | Test A | 💬 Feedback → Fault → message → Send | "Thank you. Your feedback has been submitted to your Team Leader." The TL gets E13 within about 5 minutes. |
| 10 | Test A | Type an answer, wait ~5 s, reload | *Saved hh:mm* shows; the answer is kept; still a Draft |
| 11 | Test A | Month two: open the new form | **Since last time** shows last month's raised items, released replies and actions |
| 12 | Test A | Leave required questions empty → **Submit**; then answer them | Before Submit they have a subtle orange border (Yes/No and rating buttons too); Submit turns them red and jumps to the first; each clears as it's answered. Optional questions are never marked. |
| 13 | Test A | Look at the rating buttons, the outlook tile, **My appraisal** and the appraisal report | Words and bands only (*Not started … Fully met*, band chip and coloured bar, *Improving / Steady / Dipping / Too early to tell*) – no numbers. The TL's screens still show the numbers. |
| 14 | Test A / TL | Outlook, **My appraisal** / profile, report section 1 | *To move up to <next band>, focus on:* three expectations (*Keep it up* in the top band). The TL also sees the averages in brackets. |
| 15 | TL | Open Test A's released review → **Amend…** → change one feedback field → **Save amendment…** with a reason | Released review is read-only until Amend; no auto-save while amending. The dialog lists the changed field and needs a reason. Afterwards the review shows **Amended (1)** (TL only), *1-to-1 Amendments* has one *Sent* record, and Test A gets E16 within about 5 minutes (month and link only). No *submitted* email. |
| 16 | TL | ⚙ Settings → Team → **Mark appraisal completed…** for Test A (completion ≤ today, a new next due date) → confirm; then **Undo last** | A new period starts (profile and report have a period selector); Undo puts it back |
| 17 | Test A / TL | Profile / My appraisal tiles | "N rated reviews of M months · K missed" – missed months are not counted in averages, forecast, trend or on-time |

If anything fails, press **F12 → Console**, copy the red errors (remove the site address), and use the prompt in [`../NEXT_STEPS.md`](../NEXT_STEPS.md).

## Run it locally (no tenant)

You need Node.js. For the automated tests you also need Playwright with Chromium.

```bash
cd one-to-one/02-frontend
node tools/build-mock.js          # regenerates mock/index.html from one-to-one.html
node test/run-tests.js            # 306 checks; exits non-zero on any failure
node test/run-reset-tests.js      # 31 checks of the reset tool
```

Or in one line: `node tools/build-mock.js && node test/run-tests.js` and `node test/run-reset-tests.js`.

- **Paths:** the test runner looks for Playwright at `/opt/node-tools/node_modules/playwright` and Chromium at `/opt/pw-browsers/…`. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to point elsewhere.
- **Clicking through:** open `mock/index.html` in a browser (`mock/reset.html` for the reset tool).
  - The dark bar at the top switches user: Team Leader, Test A, Test B, and others.
  - It also toggles **XSS test data** (attack strings in every field) and resets the data.
  - The data is fictional and lives only in that browser tab (sessionStorage). Nothing is sent anywhere.

### What the tests cover

| Area | Checks |
|---|---|
| Static code rules | No `innerHTML` and similar; no `eval` or string timers; no external URLs (only the SVG namespace); no Handlebars; the factory export exists; no email addresses or tenant hosts; a single update path and a single create path; one `recycle()` path, used only for retired expectations; no permission endpoints |
| Isolation | TL loads everything. Test A sees only their own items, and direct REST reads of Test B's items, Technicians and Expectations are refused. Test B is likewise isolated. |
| Technician writes | Draft payload contains only the allowed fields. Submit → locked → a further write is refused. |
| TL journey | Review; Complete blocked by an incomplete action; feedback and state are separate writes; actions fields; TL ratings; release; technician sees the released feedback |
| Settings | Invalid date rejected; dates normalised to DD-MMM-YYYY; written as `dd/MM/yyyy`; bands saved; BST round-trip keeps the same day |
| Expectations | Create (including the person value), edit, retire; no limit of 10 (warning above 30); Shared card plus one card per person; new items at the end of their group; **Delete permanently** only on retired items, to the recycle bin, and reviews keep their own copy; a technician's delete is refused (403) |
| Actions | Close-out from the Actions page |
| Report | 8 sections; print popup |
| Clearer forms (v4.5) | Orange border on unanswered required questions, red after Submit with a jump to the first, cleared as answered; wellbeing steps and TL action rows likewise |
| Words not numbers (v4.5) | No numeric rating or score anywhere a technician looks (form, outlook, My appraisal, chart axis and tooltips, report); the TL still sees numbers; focus areas listed |
| Periods (v5) | 12-, 15-, 23- and 8-month periods; the completion month closes its period; moving the next due date never moves a review; reviews before the first start form an earlier period; no start = no forecast; BST completion dates; periods crossing 1 April |
| Missed months (v5) | Excluded from averages, forecast, trend and on-time (on time ÷ submitted); streak neither extended nor broken by a missed month; "N rated reviews of M months · K missed" |
| Amendments (v5) | Released review read-only until **Amend…**; submitted review keeps Save feedback plus **Amend answers…**; reason required, changed fields listed; audit record first, then only changed columns, then queued; Flow 2 does not treat it as a submission; Flow 8 sends E16 once; **Amended (n)** for the TL only; a technician can't read the audit list |
| Dates (v5) | Next wellbeing date on the Technicians record (verified write); *Needs your attention* lists missing period starts / wellbeing dates and overdue wellbeing |
| Screen clean-up (v5) | No chart switcher, *Expected appraisal outcomes*, *Workload this month* or profile workload / energy charts; no "Today" in the title bar; the feedback bubble is a pill labelled **Feedback** |
| Challenge (v4.5) | Removed in v5 – the page has no challenge feature |
| XSS sweep | Attack strings in every field, over 11 views for TL and technician. No script runs and no markup is injected. |

The mock emulates permissions (plan D.4) and the effects of Flows 2, 3 and 8, but it is **not SharePoint**. The tenant tests in plan section H are still required.

## Updating

1. Change `one-to-one.js` / `one-to-one.html`.
2. Bump `VERSION` in the JS.
3. Run the commands above. All checks must pass.
4. Re-upload, choosing **Replace**.
5. Record the change in [`../CONFIG_REFERENCE.md`](../CONFIG_REFERENCE.md) §7.
6. To roll back: library → file → **Version history → Restore**.

## Security notes (for IT review, IT-13)

**What the code calls.** Only same-origin SharePoint REST, through Welcome's `spHttpClient`:

| Purpose | Endpoint |
|---|---|
| Current user | `/_api/web/currentuser` |
| Role | `/_api/web/effectiveBasePermissions` |
| Request digest | `/_api/contextinfo` |
| Reads | `/_api/web/lists/getbytitle('<list>')/items` |
| Updates | `…/items(<id>)/validateUpdateListItem` |
| Creates | `…/AddValidateUpdateItemUsingPath` – TL: expectations, settings, team members in the Technicians list, wellbeing assessments, amendment records in *1-to-1 Amendments* (Owners only). **Everyone:** feedback from the 💬 bubble into *1-to-1 Feedback* (the only list the group can add to; each person sees only their own items, and Flow 6 then makes them private) |
| Delete (TL only) | `…/items(<id>)/recycle()` – only **Delete permanently** of a retired expectation, to the site recycle bin (about 93 days). Technicians' permission levels have no Delete, so SharePoint refuses it for them (403). |
| People search (TL only, ⚙ Settings → Team) | `/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.clientPeoplePickerSearchUser` – read-only search; adding someone only creates a Technicians item, and Flow 4 grants access |
| Folder path for creates | `…/RootFolder` |

**What the code never does:**

- call a permission, sharing or `ensureuser` endpoint (access is only ever changed by the flows);
- delete anything other than the TL's *Delete permanently* of a retired expectation (`recycle()`, above);
- load any external resource;
- insert data as HTML.

**Rules and evidence.** The rules are S1–S7 in plan E.4. The test evidence is `node test/run-tests.js` (and `node test/run-reset-tests.js` for the reset tool).

**The reset tool** (`reset/`, temporary) uses the same same-origin REST calls plus `recycle()` on the records the TL ticks, and only on the test-data lists named in [`../RESET_PROCEDURE.md`](../RESET_PROCEDURE.md); it refuses any other list and never touches Technicians, 1-to-1 Settings, permissions, groups or flows. It shows itself only to a site owner, but the real protection is that technicians have no Delete. Remove it from the library after use.

**Trust boundary.** Every request runs as the signed-in user, so SharePoint item permissions remain the only security boundary. The role check only decides which menu to show.
