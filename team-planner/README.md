# ESG Team Planner (2027–2030)

A formula-driven duty roster for the ESG team, rebuilt from the original
`ESG_Team_Planner__MultiYear__20272030.xlsx`.

| File | What it is |
|---|---|
| `ESG_Team_Planner_2027-2030.xlsx` | The planner. Open it, read the **Guide** sheet, start on the **Dashboard**. |
| `build_planner.py` | Generator. Re-running it rebuilds the workbook from the original planner (competency matrix, team, migrated entries). |

## Rebuild

```bash
pip install openpyxl
python3 build_planner.py --source <original planner .xlsx> --out ESG_Team_Planner_2027-2030.xlsx
```

Recalculate and verify with LibreOffice (the generator writes formulas without
cached values, so a viewer that does not recalculate will show blanks until the
file has been opened and saved once in Excel or LibreOffice):

```bash
python3 <xlsx-skill>/scripts/recalc.py ESG_Team_Planner_2027-2030.xlsx 1500
```

## Design

* **No macros, no dynamic arrays.** Only functions available since Excel 2007
  (`INDEX`, `MATCH`, `COUNTIF`, `SUMPRODUCT`, `CHOOSE`, `OFFSET`, `HYPERLINK`),
  so it works in Excel desktop, Excel Online, LibreOffice and Google Sheets.
* **Setup drives everything.** Team, duties, competency (SQEP) matrix, status
  codes and planning years live on one sheet; year grids, dropdowns and
  dashboards are formulas over it.
* **Year sheets** hold the data: 53 blocks of 50 rows (`T0 = 5`, `BLOCK = 50`).
  Rows 3–20 of a block are duties (three slots per weekday, one per weekend
  day, plus a notes column per day); rows 22–45 are the team availability grid
  (one status code per person per day). Column A (hidden) carries the week
  number for whole-sheet lookups.
* **Engine (hidden sheet)** computes, for the planning week chosen on the
  Dashboard: the eligibility list per duty per day (feeds the dropdowns via a
  single `OFFSET` validation formula), coverage, gaps, suggested cover, and the
  mirrors used by the Dashboard and My Rota.
* **Conditional formatting** is one rule per concern applied across all blocks
  (block-relative arithmetic on `ROW()`), instead of one rule per week.
