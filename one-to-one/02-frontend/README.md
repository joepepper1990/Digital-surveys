# ESG 1-to-1 — frontend (v4.4.0)

| File | What it is |
|---|---|
| `one-to-one.html` | Welcome custom layout. Contains the metadata (layout name **ESG 1-to-1**), all CSS and the script tag. |
| `one-to-one.js` | The whole app: technician and TL views, charts, settings, reports. Plain JavaScript, no libraries, no external calls. |
| `mock/mock-sharepoint.js` | Local in-memory SharePoint, with fictional users and data, for testing without the tenant |
| `mock/index.html` | **Generated** by `tools/build-mock.js` from the production CSS. Open it in a browser to click through. |
| `test/run-tests.js` | Automated tests (headless Chromium against the mock) |
| `probe/` | Stage 0A / 0B probes (already run; keep for reference) |

**There is nothing to edit before installing.**

- The site is taken from the page.
- The Team Leader is recognised from SharePoint permissions: whoever has *Manage permissions* on the site, which means the site owner and Site Collection Admin.
- List names are in `CONFIG` at the top of `one-to-one.js`. Change them only if you renamed a list.

## Install (tenant)

Prerequisites:

- The seven lists are built ([`../01-sharepoint/lists.md`](../01-sharepoint/lists.md)).
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
| 1 | TL | Open the site | **Team overview**. The top menu bar has Team overview, Monthly reviews, Expectations, Actions, Wellbeing, **Team ▾** (the team list) and **⚙ Settings**, and shows **v4.4.0** at its right-hand end. |
| 2 | TL | ⚙ Settings → set an appraisal date (e.g. `15-Jul-2027`) → Save → reopen | Same date shown, and the Technicians list shows 15/07/2027 |
| 3 | TL | Expectations → add a Shared one, then an Individual one, then retire one | Items appear in the list. Retired = Active **No**. |
| 4 | Test A | Open the E1 link | Their review. The menu bar has only *This month · My appraisal · Appraisal report · Wellbeing*. |
| 5 | Test A | Change `?reviewId=` to Test B's ID | "Review not found" |
| 6 | Test A | Save, reload | Answers kept |
| 7 | TL | Open Test A's review → add 2 actions → Save | Manager Reviews: `ActionsJson` has 2 rows, `ActionsStatus` = Open, `NextActionDue` set |
| 8 | TL / Test A | Appraisal report → Print / Save as PDF | The print window opens with 8 sections and no wellbeing answers |
| 9 | Test A | 💬 Feedback → Fault → message → Send | "Thank you. Your feedback has been submitted to your Team Leader." The TL gets E13 within about 5 minutes. |
| 10 | Test A | Type an answer, wait ~5 s, reload | *Saved hh:mm* shows; the answer is kept; still a Draft |
| 11 | Test A | Month two: open the new form | **Since last time** shows last month's raised items, released replies and actions |

If anything fails, press **F12 → Console**, copy the red errors (remove the site address), and use the prompt in [`../NEXT_STEPS.md`](../NEXT_STEPS.md).

## Run it locally (no tenant)

You need Node.js. For the automated tests you also need Playwright with Chromium.

```bash
cd one-to-one/02-frontend
node tools/build-mock.js          # regenerates mock/index.html from one-to-one.html
node test/run-tests.js            # 219 checks; exits non-zero on any failure
```

- **Paths:** the test runner looks for Playwright at `/opt/node-tools/node_modules/playwright` and Chromium at `/opt/pw-browsers/…`. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to point elsewhere.
- **Clicking through:** open `mock/index.html` in a browser.
  - The dark bar at the top switches user: Team Leader, Test A, Test B, and others.
  - It also toggles **XSS test data** (attack strings in every field) and resets the data.
  - The data is fictional and lives only in that browser tab (sessionStorage). Nothing is sent anywhere.

### What the tests cover

| Area | Checks |
|---|---|
| Static code rules | No `innerHTML` and similar; no `eval` or string timers; no external URLs (only the SVG namespace); no Handlebars; the factory export exists; no email addresses or tenant hosts; a single update path and a single create path; no permission endpoints |
| Isolation | TL loads everything. Test A sees only their own items, and direct REST reads of Test B's items, Technicians and Expectations are refused. Test B is likewise isolated. |
| Technician writes | Draft payload contains only the allowed fields. Submit → locked → a further write is refused. |
| TL journey | Review; Complete blocked by an incomplete action; feedback and state are separate writes; actions fields; TL ratings; release; technician sees the released feedback |
| Settings | Invalid date rejected; dates normalised to DD-MMM-YYYY; written as `dd/MM/yyyy`; bands saved; BST round-trip keeps the same day |
| Expectations | Create (including the person value), edit, retire |
| Actions | Close-out from the Actions page |
| Report | 8 sections; print popup |
| XSS sweep | Attack strings in every field, over 11 views for TL and technician. No script runs and no markup is injected. |

The mock emulates permissions (plan D.4) and the effects of Flows 2 and 3, but it is **not SharePoint**. The tenant tests in plan section H are still required.

## Updating

1. Change `one-to-one.js` / `one-to-one.html`.
2. Bump `VERSION` in the JS.
3. Run both commands above. All checks must pass.
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
| Creates | `…/AddValidateUpdateItemUsingPath` – TL: expectations, settings, team members in the Technicians list, wellbeing assessments. **Everyone:** feedback from the 💬 bubble into *1-to-1 Feedback* (the only list the group can add to; each person sees only their own item until Flow 6 makes it Owners-only) |
| People search (TL only, ⚙ Settings → Team) | `/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.clientPeoplePickerSearchUser` – read-only search; adding someone only creates a Technicians item, and Flow 4 grants access |
| Folder path for creates | `…/RootFolder` |

**What the code never does:**

- call a permission, sharing, `ensureuser` or delete endpoint (access is only ever changed by the flows);
- load any external resource;
- insert data as HTML.

**Rules and evidence.** The rules are S1–S7 in plan E.4. The test evidence is `node test/run-tests.js`.

**Trust boundary.** Every request runs as the signed-in user, so SharePoint item permissions remain the only security boundary. The role check only decides which menu to show.
