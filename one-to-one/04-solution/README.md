# ESG 1-to-1 — Power Platform solution (source and build)

**To install, follow [`IMPORT_GUIDE.md`](IMPORT_GUIDE.md).** This page explains how the files are made and tested.

## What's here

| Path | What it is |
|---|---|
| `ESGOneToOne_1_0_0_0_unmanaged.zip` | **The importable solution**, packed by Microsoft's Power Platform CLI (`pac solution pack`) |
| `legacy-package-builder.html` | Offline page that makes legacy (non-solution) packages, for environments without Dataverse |
| `src/` | The unpacked solution, in the same layout `pac solution unpack` produces. **Generated – do not edit by hand.** |
| `tools/schema.py` | **The SharePoint schema, defined once:** lists, columns (field XML), indexes, views, permission levels |
| `tools/flows.py` | **The four flows**, as Power Automate flow definitions |
| `tools/legacy.py` | Legacy package templates and the builder page |
| `tools/build.py` | Generates `src/`, validates, packs the zip, unpacks it again to prove the round trip |
| `tools/validate.py` | Static checks for every flow |
| `tools/test_validate.py` | Proves the validator catches mistakes (20 deliberate breakages) |
| `tools/wdl.py`, `tools/fake_sharepoint.py`, `tools/simulate.py` | Run the real flow JSON against an in-memory SharePoint, end to end |
| `tools/test_builder.js`, `tools/check_builder_zips.py` | Browser test of the legacy builder and checks on the zips it makes |
| `tools/run_all.sh` | Everything above, in order |

## Build and test

You need Python 3.9+ and, to pack the zip, the [Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`). Without `pac`, `src/` is still generated and validated. The browser test needs Node.js with Playwright and Chromium, like the frontend tests.

```bash
cd one-to-one/04-solution
tools/run_all.sh
```

| Step | Checks |
|---|---|
| `build.py` | **Generates the files:** `src/` and the builder page. **Validates every flow:** expressions parse and use real functions; every reference points at an existing action, variable, parameter or enclosing loop; `runAfter` chains are complete; SharePoint/Outlook actions have their required parameters; list and column names exist in the schema; REST bodies are valid JSON; field XML and view CAML are well-formed; a time-zoned schedule has a start time. **Packs** with `pac` and **unpacks** again; the flow JSON must survive the round trip unchanged. |
| `test_validate.py` | 20 deliberately broken copies of the flows; the validator must reject every one |
| `simulate.py` (solution and legacy) | 110 end-to-end checks against the fake SharePoint, grouped below |
| `test_builder.js` + `check_builder_zips.py` | The builder rejects bad input, makes no network requests, and produces standard zips whose contents are exactly the templates with the values filled in |

**The 110 simulation checks** cover:

- **Setup builds exactly the lists in [`../01-sharepoint/lists.csv`](../01-sharepoint/lists.csv):** column types, choices, defaults, ranges, indexes, unique key, views, settings and permissions.
- **The lists hold every column the frontend reads or writes.**
- **Setup re-runs** change nothing. On a half-built site, setup completes the lists and warns about what it won't fix.
- **Monthly cycle:** private reviews, links, re-runs, reminders, leap year and BST due dates.
- **Submit → lock.** Forced status values are normalised and lateness comes from the trusted record.
- **Complete → release.** Invalid decisions are reverted.
- **Failures** are reported, and one technician's failure doesn't block the others.

**What the fake can't prove.** It follows SharePoint Online's documented behaviour, but it is not SharePoint. The import (§2) and the setup run (§3) in [`IMPORT_GUIDE.md`](IMPORT_GUIDE.md), plus plan section H, are the real tests.

## Changing something

1. Edit `tools/schema.py` (lists) or `tools/flows.py` (flows).
   - If you change a column, update [`../01-sharepoint/lists.md`](../01-sharepoint/lists.md) and `lists.csv` too; the simulation compares them.
2. Bump `VERSION` in `tools/build.py`. Import the new zip as an **Upgrade**.
3. Run `tools/run_all.sh`. Everything must pass.
4. Commit `src/`, the zip and the builder page together.

**Fixed IDs.** The flow GUIDs in `flows.py` and the solution unique name `ESGOneToOne` must never change. Changing them makes the next import create duplicate flows instead of upgrading.

## Design notes

**Nothing tenant-specific is in these files.**

- The site and the TL email are environment variables, set at import.
- Group and permission-level IDs, and the two list GUIDs used for item permissions, are looked up by name each run. There is no Config sheet of IDs to copy.

**Setup only adds.** It never deletes a list, column or item. It never changes an existing permission level; it warns instead. On lists it removes only the site Members/Visitors groups and your own direct entry, so that Owners stays the only entry, as plan D.2 requires.

**Flows 1–3 match** [`../03-flows/FLOW_BUILD_SHEETS.md`](../03-flows/FLOW_BUILD_SHEETS.md) step for step, with two improvements:

- IDs are found at run time.
- Each flow stops with a clear "run setup first" failure if the permission levels or lists are missing.
