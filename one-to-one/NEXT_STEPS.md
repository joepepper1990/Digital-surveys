# ESG 1-to-1: next steps

**Status (16-Oct-2026)**

- **Stage 0A: passed.** Welcome runs the external script, authenticated REST reads and writes work, and a technician is correctly limited.
- **Stage 0B: passed** in the live tenant with two technician accounts. Every mandatory confidentiality and integrity test passed. Two findings are now part of the setup (plan D.1, D.6):
  1. The `1-to-1 Technicians` group needs **Read on the Welcome Errors list** (`WMW_WMReplyWelcomeWebPartErrors`), as well as on the page and the layouts library.
  2. **B10a:** the **TL must be Site Collection Administrator**, so a technician can never hide a record from the TL.
- **Design agreed:** prototype v7 ([`prototype/prototype.html`](prototype/prototype.html)). The changes it brought in:
  - a desktop layout with a menu (a top menu bar since v4.1.0);
  - the appraisal outlook;
  - multi-row actions with close-out criteria and deadlines;
  - TL-only ⚙ Settings (appraisal dates, bands);
  - DD-MMM-YYYY dates;
  - reports;
  - removed: private notes and "ask for a chat".
- **All build files produced (plan v4):**

  | File | What it is |
  |---|---|
  | [`02-frontend/`](02-frontend/README.md) | Production frontend v4.5.0 (desktop only), local mock, 219 automated checks (all passing) |
  | [`01-sharepoint/lists.md`](01-sharepoint/lists.md) | Eight-list build checklist |
  | [`04-solution/`](04-solution/IMPORT_GUIDE.md) | **Importable solution**: setup flow (creates the lists exactly) + Flows 1–7 (1.3.0.0); offline legacy builder; validated (25 / 25 mutations caught) and simulated end to end (213 / 213) |
  | [`03-flows/`](03-flows/FLOW_BUILD_SHEETS.md) | Flow build sheets and email templates (reference / manual build) |
  | [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) | Operating manual |

## What you do next

**Printable, self-contained version: [`ESG-1to1-Finalisation-Guide.docx`](ESG-1to1-Finalisation-Guide.docx)** (same content as [`FINALISATION_GUIDE.md`](FINALISATION_GUIDE.md), including the full test record and welcome email).

**Start here: [`TENANT_WALKTHROUGH.md`](TENANT_WALKTHROUGH.md)** is the complete tick-list from Stage 0B to live: import, see the frontend yourself, test accounts, security tests, clean-down, inviting and go-live. The summary below is the same route in brief.

Follow [`GO_LIVE_RUNBOOK.md`](GO_LIVE_RUNBOOK.md) from **Phase 4**:

1. **Import the solution** [`04-solution/ESGOneToOne_1_3_0_0_unmanaged.zip`](04-solution/IMPORT_GUIDE.md): pick your connections, enter the site URL and your email.
2. **Run *ESG 1-to-1 | 0 Setup*.** It creates the eight lists, permission levels, group and list permissions, then emails you a summary.
3. **Install the frontend.** Upload two files, choose the *ESG 1-to-1* layout in a full-width section. There's nothing to edit.
4. **Turn on the flows** once the Setup email has arrived: 2, 3, 4, 5, 6, 7, then 1 last.
5. **Add Test A and Test B**, set their appraisal dates in ⚙ Settings, and add expectations.
6. **Rehearse** and run every test in plan section H (F1–F48, P1–P29).
7. **Clean down and go live.**

**Already imported 1.2.1 (or earlier)?** Upgrade to 1.3.0 instead of steps 1–4 ([IMPORT_GUIDE §0](04-solution/IMPORT_GUIDE.md)):

1. Import `ESGOneToOne_1_3_0_0_unmanaged.zip` as an **Upgrade**.
2. Re-run **0 Setup** (creates the *1-to-1 Challenges* list and the new Manager Reviews columns).
3. Turn on **Flow 7** (and check flows 1–6 are On).
4. Upload `one-to-one.html` and `one-to-one.js`, then **Reset layout cache**. The top bar shows **v4.5.0**.

## Things to verify early in the tenant

The local mock can't prove these. Check them in your first session after installing:

| Check | How | If it fails |
|---|---|---|
| Solution import | IMPORT_GUIDE §2 | Copy the error from **Solutions → History**; if *Solutions* needs Dataverse, use the legacy builder (§6) |
| Setup flow | IMPORT_GUIDE §3: the summary email says *complete* | Fix the listed items and re-run; for a red failed step, send its error text |
| Expectation create (TL) | Expectations → add one | Send the console error. `AddValidateUpdateItemUsingPath` may need a different folder path. |
| Yes/No and Person writes | Edit an expectation's *Active* and *Applies to: individual* | Send the error text |
| Full-width section | The menu bar and content fill the page width | Change the section layout to full width |
| Dates | Set an appraisal date in a summer month, reopen ⚙ Settings | It must show the same day. Check the site's regional settings (London). |
| Print / Save as PDF | Open a report and click Print | Allow pop-ups for the SharePoint site |
| Limited-access lockdown | Ask IT whether *limited-access user permission lockdown mode* is on for the site. Stage 0B's technician REST calls passing suggests not. | If it's on, technicians' page calls can fail; IT can turn the feature off for this site |
| Personal regional settings (R16) | Plan test F27: an appraisal date saved in ⚙ Settings reads back as the same day | Set your personal region to English (UK) |

## If something fails

Use this prompt in a new Claude Code session:

```
Tenant test <ID> failed. What I did: <steps>. What I saw: <message / screenshot text,
redacted>. Browser console errors: <paste>. Fix one-to-one.js / the flow sheet as needed,
re-run the local tests, commit and push to the current branch.
```

The earlier Stage 0 working notes (blank-page checklist, 0B test plan, questionnaire check) are in git history, before this version of the file.
