# ESG Team Planner (2027–2030)

A formula-driven duty roster for the ESG team, rebuilt from the original
`ESG_Team_Planner__MultiYear__20272030.xlsx`.

| File | What it is |
|---|---|
| `ESG_Team_Planner_2027-2030.xlsx` | The planner, carrying over the old file's leave marks and rostered names. |
| `ESG_Team_Planner_2027-2030_BLANK.xlsx` | **The same planner with an empty four years.** Team, duties and the SQEP matrix are all there; no leave, no rostered names. Start here for a clean plan. |
| `AutoPlanMacros.bas` | Optional macros that turn Auto Plan into real Dashboard buttons. Only for sites that allow macros. See below. |
| `build_planner.py` | Generator. Re-running it rebuilds the workbook from the original planner. |

## Automation: the Auto Plan

The planner does not just check a week you type — it can **build the week for
you**. The **Auto Plan** sheet (and the ⚡ Auto-fill box on the Dashboard)
generates a complete roster for the planning week from every rule at once:

* one qualified (SQEP) person per duty per weekday;
* nobody rostered on a day they are on leave, sick, off-site or training;
* nobody double-booked across duties on the same day;
* the same person kept on a duty Monday to Friday, the way a real rota reads - if they
  are off midweek a stand-in covers that day only, then the owner gets the duty back;
* **no weekend working unless it has been approved** - see Overtime below;
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

## Weekend overtime

Weekend working is optional and is never planned for you. Technicians put
themselves forward, the team leader approves, and that approval is recorded here
by typing **OT** against the person in the Saturday or Sunday cell of the week's
availability grid.

* Only people with OT marked for that day can be rostered that day - anyone else
  entered in a weekend slot is flagged amber as an unrecorded approval.
* Overtime can only pick up **flexible work**: work that is not tied to a
  specific day. Surveys, Greenstream, Radwaste and Instruments are marked
  flexible out of the box; tick the `Flexible / overtime` column on Setup for any
  others. Weekday-only duties are greyed out at the weekend.
* Saturday and Sunday are **never counted as gaps**, because nothing is required
  at the weekend.
* Approved overtime is totalled on the Dashboard, tracked per person per week on
  the **Year View**, and offset against the open work on the **Work Pack** sheet.

## Work Pack - ad-hoc work, scheduled for you

Work that turns up during the week is logged on the **Work Pack** sheet as it
comes up - one row per WOC. You give it four things:

| Field | What it does |
|---|---|
| `Work type` | which duty/competency it needs, so only qualified people are offered |
| `Days` | how long it takes |
| `Flexibility` | `Weekday only`, `Any day`, or `Weekend (overtime)`. Leave blank to follow the work type's Setup setting |
| `Assigned to` | leave blank and the planner picks; type a name to override |

The planner then schedules it: it finds people competent for the work type who
have that many free days among the days the task is allowed on, prefers whoever
is least committed that week, takes the earliest free days, and never
double-books anyone. The result appears in the **Suggested** column, e.g.
`AW · Wed, Thu`.

It is honest when it cannot place work. `no-one free` means nobody qualified has
a free day; `only 1 of 2 days` means it placed part of the task; `[!] 6 days this
week` means that person would end up committed six or more days counting duties
and tasks. The summary at the top totals the open days against what it managed to
place and against the overtime days approved.

**Task flexibility beats the duty setting, which is the point.** Interactions is
weekday work most of the time, so it is marked weekday-only on Setup - but a
particular interaction that could be done at a weekend just gets `Any day` on its
own row. The Setup flag is only the default for a blank cell.

`Radwaste` has been added as a duty because it is work you do that the original
planner had no row for. Nobody is ticked as qualified for it yet and its weekday
minimum is 0, so it creates no false gaps - fill in the SQEP column on Setup.

## Optional buttons (macros)

`AutoPlanMacros.bas` adds four one-click actions that write straight into the
year sheet:

| Macro | What it does |
|---|---|
| `AutoFillYear` | **Builds the whole year in one press** - every week of the year shown on the Dashboard, re-planning each week against that week's leave. Takes a minute or two. |
| `AutoFillWeek` | Fills just the week chosen on the Dashboard. |
| `ClearWeek` | Clears that week's duty entries. |
| `CopyPreviousWeek` | Copies last week's duty entries into it. |

**The past is never touched.** Every macro skips any day dated before today, so
running `AutoFillYear` mid-year re-plans from today onwards and leaves everything
already worked exactly as it was. `AutoFillYear` also asks whether to replace
weeks that are already planned or to fill only the empty ones. Only duty slots
are written - leave, training, OT approvals, notes and the Work Pack are never
altered.
Installation (Alt+F11 ▸ Import, then add Form-Control buttons) is documented at
the top of the .bas file. Macros are optional and many managed/regulated sites
block them; the workbook is fully functional without them.

## Rebuild

```bash
pip install openpyxl
python3 build_planner.py --source <original planner .xlsx> --out ESG_Team_Planner_2027-2030.xlsx

# an empty four years - keeps the team, duties and SQEP matrix, drops all entries
python3 build_planner.py --source <original planner .xlsx> --blank \
        --out ESG_Team_Planner_2027-2030_BLANK.xlsx
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
