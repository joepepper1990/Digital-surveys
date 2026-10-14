# ESG 1-to-1: next steps

**Status (14-Oct-2026)**

- **Stage 0A: passed.** Welcome runs the external script, authenticated REST reads and writes work, and a technician is correctly limited.
- **Stage 0B: passed** in the live tenant with two technician accounts. Every mandatory confidentiality and integrity test passed. Two findings are now part of the setup (plan D.1, D.6):
  1. The `1-to-1 Technicians` group needs **Read on the Welcome Errors list** (`WMW_WMReplyWelcomeWebPartErrors`), as well as on the page and the layouts library.
  2. **B10a:** the **TL must be Site Collection Administrator**, so a technician can never hide a record from the TL.
- **Design agreed:** prototype v7 ([`prototype/prototype.html`](prototype/prototype.html)). The changes it brought in:
  - a desktop layout with a sidebar menu;
  - the appraisal outlook;
  - multi-row actions with close-out criteria and deadlines;
  - TL-only ⚙ Settings (appraisal dates, bands);
  - DD-MMM-YYYY dates;
  - reports;
  - removed: private notes and "ask for a chat".
- **All build files produced (plan v4):**

  | File | What it is |
  |---|---|
  | [`02-frontend/`](02-frontend/README.md) | Production frontend v4.0.0, local mock, 70 automated checks (all passing) |
  | [`01-sharepoint/lists.md`](01-sharepoint/lists.md) | Five-list build checklist |
  | [`03-flows/`](03-flows/FLOW_BUILD_SHEETS.md) | Flow build sheets and email templates |
  | [`CONFIG_REFERENCE.md`](CONFIG_REFERENCE.md) | Operating manual |

## What you do next

Follow [`GO_LIVE_RUNBOOK.md`](GO_LIVE_RUNBOOK.md) from **Phase 4**:

1. **Build the five lists.** Include the new columns, and the **1-to-1 Settings** list with group Read.
2. **Record the IDs** in your private Config sheet.
3. **Install the frontend.** Upload two files, choose the *ESG 1-to-1* layout in a full-width section. There's nothing to edit.
4. **Build Flows 1–3** from the build sheets.
5. **Add Test A and Test B**, set their appraisal dates in ⚙ Settings, and add expectations.
6. **Rehearse** and run every test in plan section H (F1–F30, P1–P20).
7. **Clean down and go live.**

## Things to verify early in the tenant

The local mock can't prove these. Check them in your first session after installing:

| Check | How | If it fails |
|---|---|---|
| Expectation create (TL) | Expectations → add one | Send the console error. `AddValidateUpdateItemUsingPath` may need a different folder path. |
| Yes/No and Person writes | Edit an expectation's *Active* and *Applies to: individual* | Send the error text |
| Full-width section | The sidebar and content fill the page width | Change the section layout to full width |
| Dates | Set an appraisal date in a summer month, reopen ⚙ Settings | It must show the same day. Check the site's regional settings (London). |
| Print / Save as PDF | Open a report and click Print | Allow pop-ups for the SharePoint site |

## If something fails

Use this prompt in a new Claude Code session:

```
Tenant test <ID> failed. What I did: <steps>. What I saw: <message / screenshot text,
redacted>. Browser console errors: <paste>. Fix one-to-one.js / the flow sheet as needed,
re-run the local tests, commit and push to the current branch.
```

The earlier Stage 0 working notes (blank-page checklist, 0B test plan, questionnaire check) are in git history, before this version of the file.
