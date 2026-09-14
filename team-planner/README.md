# ESG Team Planner (2027–2030)

A formula-driven duty roster for the ESG team, rebuilt from the original
`ESG_Team_Planner__MultiYear__20272030.xlsx`.

| File | What it is |
|---|---|
| `ESG_Team_Planner_2027-2030.xlsx` | The planner. Open it, read the **Guide** sheet, start on the **Dashboard**. |
| `AutoPlanMacros.bas` | Optional macros that turn Auto Plan into real Dashboard buttons. Only for sites that allow macros. See below. |
| `build_planner.py` | Generator. Re-running it rebuilds the workbook from the original planner. |

## Automation: the Auto Plan

The planner does not just check a week you type — it can **build the week for
you**. The **Auto Plan** sheet (and the ⚡ Auto-fill box on the Dashboard)
generates a complete roster for the planning week from every rule at once:

* one qualified (SQEP) person per duty per weekday, plus weekend cover where a
  duty needs it;
* nobody rostered on a day they are on leave, sick, off-site or training;
* nobody double-booked across duties on the same day;
* the same person kept on a duty Monday to Friday, the way a real rota reads - if they
  are off midweek a stand-in covers that day only, then the owner gets the duty back;
* weekend cover handed to whoever has worked least that week, rather than to someone
  already on duty Monday to Friday (Sunday follows Saturday, so one person covers both);
* load shared — least-loaded eligible people first, SQEP before trainees
  (trainees shown with a `*`).

It shows how many of the required slots it could fill and shades in amber any it
could not (not enough qualified, available people). Where the team is small enough
that weekend cover means someone works a sixth or seventh day, the **Days rostered**
count turns amber so you can see it before publishing. **Fill priority follows the
order of duties on the Setup sheet**, so put the hardest-to-cover duties near the
top and they get first pick of scarce staff.

To apply the plan without macros: copy the Auto Plan copy-box and Paste Special ▸
Values into the first duty cell of the week. With the macros installed, the
Dashboard button does it in one click.

## Optional buttons (macros)

`AutoPlanMacros.bas` adds three one-click actions — **Auto-fill week**, **Clear
week**, **Copy previous week** — that write straight into the chosen week.
Installation (Alt+F11 ▸ Import, then add Form-Control buttons) is documented at
the top of the .bas file. Macros are optional and many managed/regulated sites
block them; the workbook is fully functional without them.

## Rebuild

```bash
pip install openpyxl
python3 build_planner.py --source <original planner .xlsx> --out ESG_Team_Planner_2027-2030.xlsx
```

Recalculate and verify with LibreOffice (the generator writes formulas without
cached values, so a viewer that does not recalculate shows blanks until the file
is opened and saved once in Excel or LibreOffice):

```bash
python3 <xlsx-skill>/scripts/recalc.py ESG_Team_Planner_2027-2030.xlsx 1500
```

## Design

* **No macros required, no dynamic-array functions.** Only functions available
  since Excel 2007 (`INDEX`, `MATCH`, `COUNTIF`, `SUMPRODUCT`, `CHOOSE`,
  `OFFSET`, `HYPERLINK`), so it works in Excel desktop, Excel Online, LibreOffice
  and Google Sheets.
* **Setup drives everything.** Team, duties, competency (SQEP) matrix, status
  codes and planning years live on one sheet; year grids, dropdowns, dashboards
  and the Auto Plan are formulas over it.
* **Year sheets** hold the data: 53 blocks of 50 rows (`T0 = 5`, `BLOCK = 50`).
  Rows 3–20 of a block are duties (three slots per weekday, one per weekend day,
  plus a notes column per day); rows 22–45 are the availability grid. Column A
  (hidden) carries the week number for whole-sheet lookups.
* **Engine (hidden sheet)** computes, for the planning week: the eligibility
  list per duty per day (feeds the dropdowns), coverage, gaps, suggested cover,
  the mirrors used by the Dashboard and My Rota, and the **Auto Plan** — a
  sequential rule-based fill (`AUTO_R0`) that respects competency, availability,
  minimums, weekend cover, no double-booking, fair load and duty continuity.
* **Conditional formatting** is one rule per concern applied across all blocks
  (block-relative arithmetic on `ROW()`), not one rule per week.

## Sheets

Dashboard · 2027 · 2028 · 2029 · 2030 · Auto Plan · Print Week · My Rota ·
Year View · Setup · Guide · Engine (hidden).
