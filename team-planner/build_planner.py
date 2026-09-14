#!/usr/bin/env python3
"""
Build the ESG Team Planner workbook (2027-2030).

Usage:
    python3 build_planner.py --source <original planner .xlsx> --out <output .xlsx>

The original planner (SQEPness sheet + four year sheets) is read for its
competency matrix, team list, and any availability / assignment entries, and
those are migrated into the new layout.  Everything else is generated.

Design rules honoured here:
  * Only Excel-2007-era functions (INDEX/MATCH/COUNTIF/SUMPRODUCT/CHOOSE/OFFSET/
    HYPERLINK ...) so the file recalculates in every Excel version, Excel
    Online, LibreOffice and Google Sheets.  No dynamic arrays, no macros.
  * One place for every setting (Setup sheet).  Year sheets, dropdowns and
    dashboards read from it, so renaming a duty or adding a person updates
    everything.
  * A hidden "Engine" sheet does the heavy lifting for the active planning
    week: eligibility lists for the dropdowns, coverage, gaps, suggestions.
"""
import argparse
import datetime as dt

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule, CellIsRule, ColorScaleRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side, Protection
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.pagebreak import Break
from openpyxl.worksheet.formula import ArrayFormula

# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #
YEARS = [2027, 2028, 2029, 2030]
T0 = 5            # first block starts on this row of every year sheet
BLOCK = 50        # rows per week block
NBLK = 53         # week blocks per year sheet
NDUTY = 18        # duty slots in Setup
NSTAFF = 24       # staff slots in Setup
NSTATUS = 8       # status-code slots in Setup
NROTA_WEEKS = 6   # weeks shown on My Rota

# Offsets inside a block
BANNER, DATES, SUBH, DUTY1, AVH, STAFF1, TOTALS, NOTES = 0, 1, 2, 3, 21, 22, 46, 47
DUTY_LAST = DUTY1 + NDUTY - 1          # 20
STAFF_LAST = STAFF1 + NSTAFF - 1       # 45

# Day -> slot columns (1-based column numbers) and note column
SLOT_COLS = {1: [3, 4, 5], 2: [7, 8, 9], 3: [11, 12, 13], 4: [15, 16, 17],
             5: [19, 20, 21], 6: [23], 7: [25]}
NOTE_COL = {1: 6, 2: 10, 3: 14, 4: 18, 5: 22, 6: 24, 7: 26}
FIRST = {d: cols[0] for d, cols in SLOT_COLS.items()}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
COL_SPACER, COL_S1, COL_S2 = 27, 28, 29    # AA, AB, AC
LASTCOL = 29

# Setup sheet anchors
SU_TEAM_R0 = 6            # team rows 6..29  (k -> row 5+k)
SU_DUTY_R0 = 6            # duty rows 6..23  (j -> row 5+j)
SU_STATUS_R0 = 33         # status rows 33..40 (s -> row 32+s)
SU_YEAR_R0 = 33           # year rows 33..36
SU_MATRIX_C0 = 15         # matrix first column = O (15) .. AL (38)

# Engine sheet anchors
EN_MAP_DAY, EN_MAP_FIRST, EN_MAP_ISSLOT, EN_MAP_SLOTS = 3, 4, 5, 6
EN_CTRL = {"yidx": 8, "week": 9, "base": 10, "year": 11, "start": 12,
           "ty": 13, "w1": 14, "w1n": 15, "w1p": 16, "isoy": 17, "isow": 18}
EN_TEAM_R0 = 20           # k -> row 19+k   (20..43)
EN_ROSTER_R0 = 47         # j -> row 46+j   (47..64)
EN_COV_R0 = 68            # (d,j) -> row 68 + (d-1)*18 + (j-1)   (68..193)
EN_ROTA_R0 = 200          # (w,j) -> row 200 + (w-1)*18 + (j-1)  (200..307)
EN_ROTA_ST_R0 = 312       # w -> row 311+w  (status of selected person)
EN_AUTO_R0 = 340          # (d,j,slot) -> row 340 + (d-1)*54 + (j-1)*3 + (slot-1)  (planning-week auto plan)
AUTO_MAXSLOT = 3
EN_FREE_R0 = 730          # k -> row 729+k : who has a free day, per day, in the planning week
EN_TASK_R0 = 760          # t -> row 759+t : ad-hoc Work Pack tasks scheduled for the planning week
NTASK = 20                # tasks per week the scheduler places automatically
WP_R0 = 12                # Work Pack: first data row
WP_N = 120                # Work Pack: number of data rows

# --------------------------------------------------------------------------- #
# Style system
# --------------------------------------------------------------------------- #
FONT = "Arial"
NAVY, NAVY2, ACCENT, GOLD = "1F3864", "2E4A7D", "2E75B6", "F4B183"
INK, MUTED, LINE, PANEL, PANEL2, WHITE = "222222", "7F7F7F", "BFBFBF", "F2F2F2", "E9EEF5", "FFFFFF"
GAP_FILL, GAP_INK = "FFEB9C", "9C5700"
BAD_FILL, BAD_INK = "FFC7CE", "9C0006"
GOOD_FILL, GOOD_INK = "C6EFCE", "006100"
TODAY_FILL = "FFF9DB"
NA_FILL, NA_INK = "EDEDED", "A6A6A6"
TRAINEE_INK = "7030A0"

STATUS_DEFAULTS = [
    # code, description, unavailable?, fill, ink
    ("AL", "Annual leave", "Y", "FCE4D6", "C65911"),
    ("HRA", "HRA (as used on the previous planner)", "Y", "C6E0B4", "548235"),
    ("T", "Training / course (still on site)", "N", "DDEBF7", "2F5597"),
    ("S", "Sick", "Y", "F8D7DA", "A61B29"),
    ("OS", "Off site / secondment", "Y", "E7E6E6", "595959"),
    ("HD", "Half day (available)", "N", "FFF2CC", "7F6000"),
    ("OT", "Overtime approved (weekend) - team leader approved", "N", "D0F0F0", "0B6E6E"),
    ("", "", "", "E2D5F1", "5B2C86"),
]

thin = Side(style="thin", color=LINE)
hair = Side(style="hair", color=LINE)
med = Side(style="medium", color=NAVY)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
BORDER_H = Border(left=hair, right=hair, top=hair, bottom=hair)


def font(size=10, bold=False, color=INK, italic=False, underline=None):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic, underline=underline)


def fill(color):
    return PatternFill("solid", start_color=color, end_color=color)


def cffill(color):
    return PatternFill(start_color=color, end_color=color, fill_type="solid")


CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center", indent=1)
WRAP = Alignment(horizontal="left", vertical="top", wrap_text=True)
CCONT = Alignment(horizontal="centerContinuous", vertical="center")


def style(c, *, f=None, bg=None, al=None, nf=None, border=None, locked=None):
    if f is not None:
        c.font = f
    if bg is not None:
        c.fill = fill(bg)
    if al is not None:
        c.alignment = al
    if nf is not None:
        c.number_format = nf
    if border is not None:
        c.border = border
    if locked is not None:
        c.protection = Protection(locked=locked)
    return c


def put(ws, ref, value, **kw):
    c = ws[ref]
    c.value = value
    return style(c, **kw)


def q(sheet):
    return f"'{sheet}'"


def choose_year(expr_by_sheet):
    """CHOOSE over the four year sheets. expr_by_sheet(sheetname) -> formula text."""
    parts = ",".join(expr_by_sheet(str(y)) for y in YEARS)
    return f"CHOOSE(Engine!$B${EN_CTRL['yidx']},{parts})"


def rng(c1, r1, c2, r2):
    return f"{L(c1)}{r1}:{L(c2)}{r2}"


# --------------------------------------------------------------------------- #
# Read the original planner
# --------------------------------------------------------------------------- #
def read_source(path):
    """Return dict with team, duties, matrix, trainees, per-year availability and assignments."""
    wb = load_workbook(path)
    sq = wb["SQEPness"]
    team = [sq.cell(1, c).value for c in range(2, 20)]                 # B1:S1
    duties, matrix, trainees = [], {}, {}
    for r in range(2, 18):
        name = sq.cell(r, 1).value
        duties.append(name)
        matrix[name] = {team[i]: bool(sq.cell(r, 2 + i).value) for i in range(len(team))}
        trainees[name] = [sq.cell(r, c).value for c in range(20, 23) if sq.cell(r, c).value]
    # normalise the one label that differs between the matrix and the year sheets
    src_day = {1: ("D", "E", "F", "G", "H"), 2: ("J", "K", "L", "M", "N"), 3: ("P", "Q", "R", "S", "T"),
               4: ("V", "W", "X", "Y", "Z"), 5: ("AB", "AC", "AD", "AE", "AF")}
    years = {}
    for y in YEARS:
        ws = wb[str(y)]
        avail, assigns, notes = {}, {}, {}
        for wk in range(53):
            base = 2 + 38 * wk
            # duties rows base+1 .. base+16 ; staff rows base+19 .. base+36
            for d, (c1, c2, c3, c4, cn) in src_day.items():
                for j in range(16):
                    r = base + 1 + j
                    vals = [ws[f"{cc}{r}"].value for cc in (c1, c2, c3)]
                    vals = [v for v in vals if isinstance(v, str) and v.strip()]
                    if vals:
                        assigns[(wk + 1, d, j + 1)] = vals
                    nv = ws[f"{cn}{r}"].value
                    if isinstance(nv, str) and nv.strip() and nv != "Notes":
                        notes[(wk + 1, d, j + 1)] = nv
                for k in range(18):
                    r = base + 19 + k
                    ini = ws[f"{c1}{r}"].value
                    al, hra, t = (ws[f"{cc}{r}"].value is True for cc in (c2, c3, c4))
                    code = "AL" if al else "HRA" if hra else "T" if t else None
                    if code and ini:
                        avail[(wk + 1, d, ini)] = code
            # weekend: AH rows base+1..base+7 = Sat, base+10..base+16 = Sun (first 7 duties)
            for d, off in ((6, 1), (7, 10)):
                for j in range(7):
                    v = ws[f"AH{base + off + j}"].value
                    if isinstance(v, str) and v.strip():
                        assigns[(wk + 1, d, j + 1)] = [v]
        years[y] = {"avail": avail, "assigns": assigns, "notes": notes}
    return {"team": team, "duties": duties, "matrix": matrix, "trainees": trainees, "years": years}


# --------------------------------------------------------------------------- #
# Workbook builders
# --------------------------------------------------------------------------- #
class Builder:
    def __init__(self, src):
        self.src = src
        self.wb = Workbook()
        self.wb.remove(self.wb.active)
        self.team = src["team"]
        # Radwaste is flexible work the team does but the original planner had no row for.
        # Added here with no competencies ticked and a weekday minimum of 0, so it creates
        # no false gaps until the SQEP column is filled in on Setup.
        self.duties = src["duties"] + (["Radwaste"] if "Radwaste" not in src["duties"] else [])

    # ---- shared bits -------------------------------------------------------
    def header_bar(self, ws, title, subtitle, ncols):
        ws.sheet_view.showGridLines = False
        for c in range(1, ncols + 1):
            for r in (1, 2):
                style(ws.cell(r, c), bg=NAVY)
        put(ws, "B1", title, f=font(16, True, WHITE), al=Alignment(vertical="center"))
        put(ws, "B2", subtitle, f=font(9, False, "D9E1F2"), al=Alignment(vertical="center"))
        ws.row_dimensions[1].height = 30
        ws.row_dimensions[2].height = 16

    def nav_link(self, ws, ref, text, target, color="D9E1F2", size=9):
        c = put(ws, ref, text, f=font(size, True, color, underline="single"), al=CENTER)
        c.hyperlink = target
        return c

    # ---- Setup -------------------------------------------------------------
    def build_setup(self):
        ws = self.wb.create_sheet("Setup")
        ws.sheet_properties.tabColor = "7F7F7F"
        self.header_bar(ws, "SETUP  ·  team, duties, competencies, status codes",
                        "Everything on this sheet drives the rest of the workbook. Yellow cells are yours to edit.", 40)
        self.nav_link(ws, "AH1", "◀ Dashboard", "#'Dashboard'!A1")
        self.nav_link(ws, "AK1", "Guide ▶", "#'Guide'!A1")

        INPUT = "FFFBE6"
        hdr = dict(f=font(9, True, WHITE), bg=NAVY2, al=CENTER, border=BORDER)

        # ---------------- Team -------------------------------------------------
        put(ws, "B4", "TEAM", f=font(11, True, NAVY))
        put(ws, "E4", "Add a person: fill the next blank row. Set Active = N to retire someone without losing history.",
            f=font(8, False, MUTED, True))
        for col, txt, w in (("A", "#", 4), ("B", "Initials", 10), ("C", "Full name", 24), ("D", "Role", 14),
                            ("E", "Active", 8), ("F", "Notes", 26), ("G", "SQEP for", 9), ("H", "Trainee for", 10)):
            put(ws, f"{col}5", txt, **hdr)
            ws.column_dimensions[col].width = w
        roles = {"JP": "Team Leader", "MW": "Team Leader", "NT": "Team Leader"}
        for k in range(1, NSTAFF + 1):
            r = SU_TEAM_R0 + k - 1
            put(ws, f"A{r}", k, f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
            ini = self.team[k - 1] if k <= len(self.team) else None
            put(ws, f"B{r}", ini, f=font(10, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
            put(ws, f"C{r}", None, f=font(10), bg=INPUT, al=LEFT, border=BORDER, locked=False)
            put(ws, f"D{r}", (roles.get(ini, "Technician") if ini else None), f=font(10), bg=INPUT, al=CENTER,
                border=BORDER, locked=False)
            put(ws, f"E{r}", ("Y" if ini else None), f=font(10, True), bg=INPUT, al=CENTER, border=BORDER, locked=False)
            put(ws, f"F{r}", None, f=font(9), bg=INPUT, al=LEFT, border=BORDER, locked=False)
            mc = L(SU_MATRIX_C0 + k - 1)
            put(ws, f"G{r}", f'=IF(B{r}="","",COUNTIF({mc}$6:{mc}$23,"Y"))', f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
            put(ws, f"H{r}", f'=IF(B{r}="","",COUNTIF({mc}$6:{mc}$23,"T"))', f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
        ws["C6"].comment = Comment("Full names were not in the original planner. Fill them in here; "
                                   "they appear on My Rota and the Dashboard.", "Planner")
        dv_role = DataValidation(type="list", formula1='"Team Leader,Technician,Trainee,Other"', allow_blank=True)
        dv_yn = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
        ws.add_data_validation(dv_role); ws.add_data_validation(dv_yn)
        dv_role.add(f"D6:D{SU_TEAM_R0 + NSTAFF - 1}")
        dv_yn.add(f"E6:E{SU_TEAM_R0 + NSTAFF - 1}")

        # ---------------- Duties + matrix -------------------------------------
        put(ws, "J4", "DUTIES & COMPETENCY MATRIX  (Y = SQEP, T = trainee, blank = not qualified)", f=font(11, True, NAVY))
        for col, txt, w in (("J", "#", 4), ("K", "Duty", 18), ("L", "Min per weekday", 9), ("M", "Flexible / overtime", 9)):
            put(ws, f"{col}5", txt, **hdr)
            ws.column_dimensions[col].width = w
        ws.column_dimensions["I"].width = 2
        ws.column_dimensions["N"].width = 2
        ws["L5"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws["M5"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.row_dimensions[5].height = 30
        for k in range(1, NSTAFF + 1):
            c = SU_MATRIX_C0 + k - 1
            put(ws, f"{L(c)}5", f'=IF(B{SU_TEAM_R0 + k - 1}="","",B{SU_TEAM_R0 + k - 1})', **hdr)
            ws.column_dimensions[L(c)].width = 5
        flexible_default = {"Surveys", "Greenstream", "Instruments", "Radwaste"}
        for j in range(1, NDUTY + 1):
            r = SU_DUTY_R0 + j - 1
            name = self.duties[j - 1] if j <= len(self.duties) else None
            put(ws, f"J{r}", j, f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
            put(ws, f"K{r}", name, f=font(10, True, NAVY), bg=INPUT, al=LEFT, border=BORDER, locked=False)
            put(ws, f"L{r}", ((0 if name == "Radwaste" else 1) if name else None), f=font(10), bg=INPUT, al=CENTER, border=BORDER, locked=False)
            put(ws, f"M{r}", (("Y" if name in flexible_default else "N") if name else None), f=font(10), bg=INPUT,
                al=CENTER, border=BORDER, locked=False)
            for k in range(1, NSTAFF + 1):
                c = SU_MATRIX_C0 + k - 1
                ini = self.team[k - 1] if k <= len(self.team) else None
                v = None
                if name and ini:
                    if ini in self.src["trainees"].get(name, []):
                        v = "T"
                    elif self.src["matrix"].get(name, {}).get(ini):
                        v = "Y"
                put(ws, f"{L(c)}{r}", v, f=font(9, True), bg=INPUT, al=CENTER, border=BORDER_H, locked=False)
        ws["L6"].comment = Comment("Minimum people needed on this duty each weekday. The planner flags a gap "
                                   "when fewer are rostered. Set 0 for duties that are ad-hoc.", "Planner")
        ws["M6"].comment = Comment("Y = this work is not tied to a specific day, so it can be picked up on approved "
                                   "weekend overtime (surveys, greenstream, Radwaste, instruments, extra WOCs). "
                                   "Duties set to N are weekday-only and are greyed out at the weekend.", "Planner")
        dv_yt = DataValidation(type="list", formula1='"Y,T"', allow_blank=True)
        ws.add_data_validation(dv_yt)
        dv_yt.add(rng(SU_MATRIX_C0, 6, SU_MATRIX_C0 + NSTAFF - 1, 23))
        dv_yn.add("M6:M23")
        dv_min = DataValidation(type="whole", operator="between", formula1="0", formula2="3", allow_blank=True,
                                error="Enter 0 to 3 (there are three slots per weekday).", errorTitle="Min per weekday")
        ws.add_data_validation(dv_min)
        dv_min.add("L6:L23")
        mat = rng(SU_MATRIX_C0, 6, SU_MATRIX_C0 + NSTAFF - 1, 23)
        ws.conditional_formatting.add(mat, CellIsRule(operator="equal", formula=['"Y"'], fill=cffill(GOOD_FILL), font=Font(color=GOOD_INK, bold=True)))
        ws.conditional_formatting.add(mat, CellIsRule(operator="equal", formula=['"T"'], fill=cffill("E2D5F1"), font=Font(color=TRAINEE_INK, bold=True)))
        ws.conditional_formatting.add("B6:H29", FormulaRule(formula=['$E6="N"'], font=Font(color=MUTED, italic=True)))

        # ---------------- Status codes ----------------------------------------
        put(ws, "B31", "STATUS CODES  (typed against a person in the availability grid)", f=font(11, True, NAVY))
        for col, txt in (("A", "#"), ("B", "Code"), ("C", "Meaning"), ("D", "Unavailable?"), ("E", "Colour"), ("F", "helper"), ("G", "flag")):
            put(ws, f"{col}32", txt, **hdr)
        for s in range(1, NSTATUS + 1):
            r = SU_STATUS_R0 + s - 1
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            put(ws, f"A{r}", s, f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
            put(ws, f"B{r}", code or None, f=font(10, True), bg=INPUT, al=CENTER, border=BORDER, locked=False)
            put(ws, f"C{r}", desc or None, f=font(10), bg=INPUT, al=LEFT, border=BORDER, locked=False)
            put(ws, f"D{r}", un or None, f=font(10, True), bg=INPUT, al=CENTER, border=BORDER, locked=False)
            put(ws, f"E{r}", f'=IF(B{r}="","",B{r})', f=font(10, True, ink), bg=fl, al=CENTER, border=BORDER)
            put(ws, f"F{r}", f'=IF(AND(B{r}<>"",D{r}="Y"),B{r},"•")', f=font(8, False, MUTED), al=CENTER)
            put(ws, f"G{r}", f'=IF(D{r}="Y",1,0)', f=font(8, False, MUTED), al=CENTER)
        dv_yn.add(f"D33:D{SU_STATUS_R0 + NSTATUS - 1}")
        ws["B33"].comment = Comment("Codes are what you type (or pick) in the availability grid of each week. "
                                    "'Unavailable? = Y' removes the person from that day's duty dropdowns and "
                                    "flags a conflict if they are rostered anyway. Row 3 (T) is also counted as "
                                    "training days on the Year View. Colours are fixed per row.", "Planner")
        put(ws, "B41", "Row 3 is treated as the Training code by the Year View. Columns F:G are helpers used by formulas.",
            f=font(8, False, MUTED, True))

        # ---------------- Years -------------------------------------------------
        put(ws, "J31", "PLANNING YEARS  (ISO weeks: week 1 contains 4 January)", f=font(11, True, NAVY))
        for col, txt in (("J", "#"), ("K", "Year"), ("L", "Week 1 starts"), ("M", "ISO weeks")):
            put(ws, f"{col}32", txt, **hdr)
        for i, y in enumerate(YEARS):
            r = SU_YEAR_R0 + i
            put(ws, f"J{r}", i + 1, f=font(9, False, MUTED), al=CENTER, border=BORDER_H)
            put(ws, f"K{r}", y, f=font(10, True, NAVY), al=CENTER, border=BORDER)
            put(ws, f"L{r}", f"=DATE(K{r},1,4)-WEEKDAY(DATE(K{r},1,4),3)", f=font(10), al=CENTER, border=BORDER, nf="ddd d mmm yyyy")
            put(ws, f"M{r}", f"=IF(OR(WEEKDAY(DATE(K{r},1,1),2)=4,AND(WEEKDAY(DATE(K{r},1,1),2)=3,"
                             f"OR(AND(MOD(K{r},4)=0,MOD(K{r},100)<>0),MOD(K{r},400)=0))),53,52)",
                f=font(10), al=CENTER, border=BORDER)
        ws.column_dimensions["L"].width = 15
        ws.column_dimensions["M"].width = 9

        # ---------------- Legend ---------------------------------------------
        put(ws, "B43", "HOW TO EDIT THIS SHEET", f=font(11, True, NAVY))
        tips = [
            "Yellow cells are inputs. Everything else is calculated - the sheet is protected (no password) to stop accidental edits.",
            "Initials must be unique and must match what people are called in the week grids (the dropdowns take care of that).",
            "Competency matrix: Y = fully qualified (SQEP). T = trainee - offered in dropdowns with a * so they are rostered alongside a SQEP person.",
            "Radwaste was added as a duty because it is work you do, but the old planner had no row for it. Nobody is ticked as qualified yet and its weekday minimum is 0 - fill those in and it behaves like any other duty.",
            "Min per weekday: how many people that duty needs Mon-Fri. Flexible / overtime Y: the work is not tied to a specific day, so approved weekend overtime can count towards it.",
            "Weekend working is never required. Mark a person OT in the Sat/Sun availability cell once the team leader has approved their overtime; only then can they be rostered that day.",
            "Status codes: keep them short. Unavailable? = Y hides the person from that day's dropdowns and flags any conflict in red.",
        ]
        for i, t in enumerate(tips):
            put(ws, f"B{44 + i}", f"•  {t}", f=font(9))
        ws.freeze_panes = "A6"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        ws.protection.formatCells = False
        ws.sheet_view.zoomScale = 90
        return ws

    # ---- Engine ------------------------------------------------------------
    def build_engine(self):
        ws = self.wb.create_sheet("Engine")
        ws.sheet_properties.tabColor = "000000"
        put(ws, "A1", "ENGINE - calculations for the active planning week. Hidden; nothing here needs editing.", f=font(10, True, NAVY))
        # column maps (index = column number of the year sheets)
        put(ws, f"A{EN_MAP_DAY - 1}", "col→", f=font(8, False, MUTED))
        labels = {EN_MAP_DAY: "day", EN_MAP_FIRST: "firstcol", EN_MAP_ISSLOT: "isslot", EN_MAP_SLOTS: "slots"}
        day_of, first_of, isslot, slots = {}, {}, {}, {}
        for d, cols in SLOT_COLS.items():
            for c in cols:
                day_of[c], first_of[c], isslot[c], slots[c] = d, cols[0], 1, len(cols)
            nc = NOTE_COL[d]
            day_of[nc], first_of[nc], isslot[nc], slots[nc] = d, cols[0], 0, len(cols)
        for c in range(1, LASTCOL + 1):
            ws.cell(EN_MAP_DAY, c).value = day_of.get(c, 0)
            ws.cell(EN_MAP_FIRST, c).value = first_of.get(c, 0)
            ws.cell(EN_MAP_ISSLOT, c).value = isslot.get(c, 0)
            ws.cell(EN_MAP_SLOTS, c).value = slots.get(c, 0)
        for r, t in labels.items():
            ws.cell(r, LASTCOL + 2).value = t

        # control block
        C = EN_CTRL
        ctrl = {
            "yidx": ("Active year index", f'=IF(AND(Dashboard!$D$8="Y",B{C["isoy"]}>=2027,B{C["isoy"]}<=2030),B{C["isoy"]}-2026,'
                                          f'IFERROR(MATCH(Dashboard!$D$6,Setup!$K$33:$K$36,0),1))'),
            "week": ("Active week", f'=IF(AND(Dashboard!$D$8="Y",B{C["isoy"]}>=2027,B{C["isoy"]}<=2030),B{C["isow"]},'
                                    f'MAX(1,MIN(53,N(Dashboard!$D$7))))'),
            "base": ("Block base row", f"={T0}+{BLOCK}*(B{C['week']}-1)"),
            "year": ("Active year", f"=2026+B{C['yidx']}"),
            "start": ("Week start (Mon)", f"=INDEX(Setup!$L$33:$L$36,B{C['yidx']})+7*(B{C['week']}-1)"),
            "ty": ("Today: calendar year", "=YEAR(TODAY())"),
            "w1": ("Week-1 Monday of that year", f"=DATE(B{C['ty']},1,4)-WEEKDAY(DATE(B{C['ty']},1,4),3)"),
            "w1n": ("Week-1 Monday of next year", f"=DATE(B{C['ty']}+1,1,4)-WEEKDAY(DATE(B{C['ty']}+1,1,4),3)"),
            "w1p": ("Week-1 Monday of previous year", f"=DATE(B{C['ty']}-1,1,4)-WEEKDAY(DATE(B{C['ty']}-1,1,4),3)"),
            "isoy": ("Today: ISO year", f"=IF(TODAY()>=B{C['w1n']},B{C['ty']}+1,IF(TODAY()<B{C['w1']},B{C['ty']}-1,B{C['ty']}))"),
            "isow": ("Today: ISO week", f"=1+INT((TODAY()-IF(TODAY()>=B{C['w1n']},B{C['w1n']},IF(TODAY()<B{C['w1']},B{C['w1p']},B{C['w1']})))/7)"),
        }
        for key, (label, f) in ctrl.items():
            put(ws, f"A{C[key]}", label, f=font(9, False, MUTED))
            put(ws, f"B{C[key]}", f, f=font(9, True))
        for key in ("start", "w1", "w1n", "w1p"):
            ws[f"B{C[key]}"].number_format = "ddd d mmm yyyy"

        # team mirror
        put(ws, f"A{EN_TEAM_R0 - 1}", "k", f=font(8, True))
        for c, t in zip("BCDEFGHIJKLMNOPQRSTUVWXYZ", ["initials", "active", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
                                              "unMon", "unTue", "unWed", "unThu", "unFri", "unSat", "unSun", "load", "conflicts",
                                              "otMon", "otTue", "otWed", "otThu", "otFri", "otSat", "otSun"]):
            put(ws, f"{c}{EN_TEAM_R0 - 1}", t, f=font(8, True))
        for k in range(1, NSTAFF + 1):
            r = EN_TEAM_R0 + k - 1
            sr = SU_TEAM_R0 + k - 1
            ws[f"A{r}"] = k
            ws[f"B{r}"] = f'=IF(Setup!$B${sr}="","",Setup!$B${sr})'
            ws[f"C{r}"] = f'=IF(AND(B{r}<>"",Setup!$E${sr}="Y"),1,0)'
            for d in range(1, 8):
                col = L(3 + d)          # D..J
                ucol = L(10 + d)        # K..Q
                ws[f"{col}{r}"] = (f'=IF($B{r}="","",""&' +
                                   choose_year(lambda s, k=k, d=d: f"INDEX({q(s)}!$A:$Z,$B${C['base']}+{STAFF1 - 1}+{k},{FIRST[d]})") + ")")
                ws[f"{ucol}{r}"] = f'=IF({col}{r}="",0,IFERROR(INDEX(Setup!$G$33:$G$40,MATCH({col}{r},Setup!$B$33:$B$40,0)),0))'
                # overtime approved that day (team leader approval, entered as the OT status code)
                otcol = L(19 + d)       # T..Z
                ws[f"{otcol}{r}"] = f'=IF(AND(Setup!$B$39<>"",{col}{r}=Setup!$B$39),1,0)'
            ws[f"R{r}"] = (f'=IF($B{r}="",0,N(' + choose_year(lambda s, k=k: f"INDEX({q(s)}!$AB:$AB,$B${C['base']}+{STAFF1 - 1}+{k})") + "))")
            ws[f"S{r}"] = (f'=IF($B{r}="",0,N(' + choose_year(lambda s, k=k: f"INDEX({q(s)}!$AC:$AC,$B${C['base']}+{STAFF1 - 1}+{k})") + "))")

        # roster mirror (active week, all 24 grid columns C..Z)
        put(ws, f"A{EN_ROSTER_R0 - 1}", "j", f=font(8, True))
        put(ws, f"B{EN_ROSTER_R0 - 1}", "duty (active-week roster mirror C..Z)", f=font(8, True))
        for j in range(1, NDUTY + 1):
            r = EN_ROSTER_R0 + j - 1
            ws[f"A{r}"] = j
            ws[f"B{r}"] = f'=IF(Setup!$K${SU_DUTY_R0 + j - 1}="","",Setup!$K${SU_DUTY_R0 + j - 1})'
            for c in range(3, 27):
                ws.cell(r, c).value = (f'=IF($B{r}="","",""&' +
                                       choose_year(lambda s, j=j, c=c: f"INDEX({q(s)}!$A:$Z,$B${C['base']}+{DUTY1 - 1}+{j},{c})") + ")")
            ws[f"AB{r}"] = f'=IF($B{r}="","",N(Setup!$L${SU_DUTY_R0 + j - 1}))'
            ws[f"AC{r}"] = f'=IF($B{r}="","",IF(Setup!$M${SU_DUTY_R0 + j - 1}="Y",1,0))'

        # coverage / eligibility / suggestion table
        hdrs = {"A": "d", "B": "j", "C": "duty", "D": "day", "E": "required", "F": "filled", "G": "short", "H": "suggested",
                "I": "gaprank", "J": "unqualified", "K": "is today", "N": "n eligible"}
        for c, t in hdrs.items():
            put(ws, f"{c}{EN_COV_R0 - 1}", t, f=font(8, True))
        put(ws, f"O{EN_COV_R0 - 1}", "eligible list (dropdown source) →", f=font(8, True))
        put(ws, f"AN{EN_COV_R0 - 1}", "rank helper →", f=font(8, True))
        put(ws, f"BM{EN_COV_R0 - 1}", "suggestion score →", f=font(8, True))
        team_ini = f"Engine!$B${EN_TEAM_R0}:$B${EN_TEAM_R0 + NSTAFF - 1}"
        for d in range(1, 8):
            for j in range(1, NDUTY + 1):
                r = EN_COV_R0 + (d - 1) * NDUTY + (j - 1)
                rr = EN_ROSTER_R0 + j - 1
                cols = SLOT_COLS[d]
                mirror = f"${L(cols[0])}${rr}:${L(cols[-1])}${rr}"
                ws[f"A{r}"] = d
                ws[f"B{r}"] = j
                ws[f"C{r}"] = f"=$B${rr}"
                ws[f"D{r}"] = DAY_NAMES[d - 1]
                # Weekend cover is optional overtime, never a requirement, so nothing is
                # "required" on Sat/Sun and the weekend can never show as a gap.
                ws[f"E{r}"] = (f'=IF(C{r}="","",' + (f"N($AB${rr})" if d <= 5 else "0") + ")")
                ws[f"F{r}"] = f'=IF(C{r}="","",COUNTIF({mirror},"?*"))'
                ws[f"G{r}"] = f'=IF(C{r}="","",MAX(0,E{r}-F{r}))'
                ws[f"H{r}"] = (f'=IF(N(G{r})=0,"",IF(COUNT(BM{r}:CJ{r})=0,"no-one eligible",'
                               f'INDEX({team_ini},MOD(MIN(BM{r}:CJ{r}),500))&IF(MOD(MIN(BM{r}:CJ{r}),1000)>=500," *","")))')
                ws[f"I{r}"] = f'=IF(N(G{r})>0,COUNTIF($G${EN_COV_R0}:G{r},">0"),"")'
                terms = []
                for cc in cols:
                    cell = f"${L(cc)}${rr}"
                    terms.append(f'IF({cell}="",0,IF(IFERROR(INDEX(Setup!$O$6:$AL$23,{j},MATCH(SUBSTITUTE({cell}," *",""),Setup!$B$6:$B$29,0)),"")="",1,0))')
                ws[f"J{r}"] = f'=IF(C{r}="","",{"+".join(terms)})'
                ws[f"K{r}"] = f"=IF($B${C['start']}+{d - 1}=TODAY(),1,0)"
                ws[f"N{r}"] = f"=COUNT($AN{r}:$BK{r})"
                for k in range(1, NSTAFF + 1):
                    tr = EN_TEAM_R0 + k - 1
                    rank_c = L(39 + k)      # AN.. (AN = 40)
                    gate = f'$C{tr}=1,INDEX(Setup!$O$6:$AL$23,{j},{k})<>"",{L(10 + d)}{tr}=0'
                    if d >= 6:
                        # weekend: only flexible work, and only people the team leader has
                        # approved for overtime that day
                        gate += f',$AC${rr}=1,{L(19 + d)}{tr}=1'
                    ws[f"{rank_c}{r}"] = (f'=IF(AND({gate}),'
                                          f'{k}+IF(INDEX(Setup!$O$6:$AL$23,{j},{k})="T",100,0),"")')
                    sc_c = L(64 + k)        # BM.. (BM = 65)
                    day_first = EN_COV_R0 + (d - 1) * NDUTY
                    already = (f'COUNTIF($H${day_first}:$H{r - 1},$B{tr})+COUNTIF($H${day_first}:$H{r - 1},$B{tr}&" ~*")'
                               if r > day_first else "0")
                    ws[f"{sc_c}{r}"] = (f'=IF(AND({rank_c}{r}<>"",COUNTIF({mirror},$B{tr})+COUNTIF({mirror},$B{tr}&" ~*")=0),'
                                        f'($R{tr}+{already})*1000+IF({rank_c}{r}>100,500,0)+{k},"")')
                for m in range(1, NSTAFF + 1):
                    oc = L(14 + m)          # O.. (O = 15)
                    ws[f"{oc}{r}"] = (f'=IF({m}>$N{r},"",INDEX({team_ini},MOD(SMALL($AN{r}:$BK{r},{m}),100))'
                                      f'&IF(SMALL($AN{r}:$BK{r},{m})>100," *",""))')

        # My Rota mirror: NROTA_WEEKS weeks x 18 duties x cols C..Z, starting at the rota start week
        put(ws, f"A{EN_ROTA_R0 - 1}", "w", f=font(8, True))
        put(ws, f"B{EN_ROTA_R0 - 1}", "My Rota mirror (weeks from 'My Rota'!D6, year 'My Rota'!D5)", f=font(8, True))
        yidx_r = "IFERROR(MATCH('My Rota'!$D$5,Setup!$K$33:$K$36,0),1)"
        for w in range(1, NROTA_WEEKS + 1):
            wk = f"(N('My Rota'!$D$6)+{w - 1})"
            base = f"({T0}+{BLOCK}*({wk}-1))"
            for j in range(1, NDUTY + 1):
                r = EN_ROTA_R0 + (w - 1) * NDUTY + (j - 1)
                ws[f"A{r}"] = w
                ws[f"B{r}"] = f"=$B${EN_ROSTER_R0 + j - 1}"
                for c in range(3, 27):
                    parts = ",".join(f"INDEX({q(str(y))}!$A:$Z,{base}+{DUTY1 - 1}+{j},{c})" for y in YEARS)
                    ws.cell(r, c).value = f'=IF(OR($B{r}="",{wk}>53),"",""&CHOOSE({yidx_r},{parts}))'
            # status row for the selected person (cols D..J = Mon..Sun), plus week start date in C
            sr = EN_ROTA_ST_R0 + w - 1
            ws[f"A{sr}"] = w
            ws[f"B{sr}"] = "person status" if w == 1 else None
            ws[f"C{sr}"] = f"=IF({wk}>53,\"\",INDEX(Setup!$L$33:$L$36,{yidx_r})+7*({wk}-1))"
            ws[f"C{sr}"].number_format = "ddd d mmm"
            for d in range(1, 8):
                parts = ",".join(
                    f"INDEX({q(str(y))}!$A:$Z,{base}+{STAFF1 - 1}+IFERROR(MATCH('My Rota'!$D$4,Setup!$B$6:$B$29,0),1),{FIRST[d]})"
                    for y in YEARS)
                ws[f"{L(3 + d)}{sr}"] = f"=IF(OR('My Rota'!$D$4=\"\",{wk}>53),\"\",\"\"&CHOOSE({yidx_r},{parts}))"
                # duties rostered for that person that day: raw list (L..R) and trimmed (T..Z)
                cols = SLOT_COLS[d]
                P = "'My Rota'!$D$4"
                terms = []
                for j in range(1, NDUTY + 1):
                    mr = EN_ROTA_R0 + (w - 1) * NDUTY + (j - 1)
                    mrange = f"${L(cols[0])}${mr}:${L(cols[-1])}${mr}"
                    terms.append(f'IF(COUNTIF({mrange},{P})+COUNTIF({mrange},{P}&" ~*")>0,$B${mr}&IF(COUNTIF({mrange},{P}&" ~*")>0," *","")&CHAR(10),"")')
                raw = f"{L(11 + d)}{sr}"
                ws[raw] = f'=IF(C{sr}="","",{"&".join(terms)})'
                ws[f"{L(19 + d)}{sr}"] = f'=IF({raw}="","",LEFT({raw},LEN({raw})-1))'
        self.build_auto(ws)
        self.build_capacity_and_tasks(ws)
        ws.sheet_state = "hidden"
        ws.protection.sheet = True
        return ws

    def build_auto(self, ws):
        """Rule-based auto-roster for the active planning week.

        One row per (day, duty, slot) in fill order (day-major, then duty, then
        slot). Each row picks the best eligible person for that slot: SQEP or
        trainee for the duty, active, not unavailable that day, and not already
        placed that same day. Ties break by how many slots the person already
        holds earlier in this generated week (fair spread), then SQEP before
        trainee, then team order. Column E is the chosen person; G.. are the
        per-person score helpers the pick is decoded from.
        """
        C = EN_CTRL
        base = f"$B${C['base']}"
        team_ini = f"$B${EN_TEAM_R0}:$B${EN_TEAM_R0 + NSTAFF - 1}"
        put(ws, f"A{EN_AUTO_R0 - 1}", "AUTO PLAN (planning week): d | j | slot | required | chosen | offered(weekend OT) | score helpers →", f=font(8, True))
        for d in range(1, 8):
            day_start = EN_AUTO_R0 + (d - 1) * NDUTY * AUTO_MAXSLOT
            for j in range(1, NDUTY + 1):
                rr = EN_ROSTER_R0 + j - 1
                for sl in range(1, AUTO_MAXSLOT + 1):
                    r = day_start + (j - 1) * AUTO_MAXSLOT + (sl - 1)
                    ws[f"A{r}"] = d
                    ws[f"B{r}"] = j
                    ws[f"C{r}"] = sl
                    # required for this slot: weekday -> sl <= min; weekend -> only slot 1 and weekend cover = Y
                    # D = required (weekday minimums only). Weekend working is optional
                    # overtime, so nothing is ever required on Sat/Sun.
                    # F = offered: weekend flexible work that approved overtime can pick up.
                    if d <= 5:
                        ws[f"D{r}"] = f'=IF($B${rr}="",0,IF({sl}<=N($AB${rr}),1,0))'
                        ws[f"F{r}"] = 0
                    else:
                        ws[f"D{r}"] = 0
                        ws[f"F{r}"] = f'=IF($B${rr}="",0,IF(AND({sl}=1,$AC${rr}=1),1,0))'
                    day_col = f"$E${day_start}:$E{r - 1}" if r > day_start else None
                    week_col = f"$E${EN_AUTO_R0}:$E{r - 1}" if r > EN_AUTO_R0 else None
                    # chosen
                    ws[f"E{r}"] = (
                        f'=IF(AND(D{r}=0,F{r}=0),"",IF(COUNT(G{r}:AD{r})=0,"",'
                        f'INDEX({team_ini},MOD(MIN(G{r}:AD{r}),500))&IF(MOD(MIN(G{r}:AD{r}),1000)>=500," *","")))')
                    for k in range(1, NSTAFF + 1):
                        tr = EN_TEAM_R0 + k - 1
                        sc = L(6 + k)   # G=7
                        elig = (f'AND($C{tr}=1,INDEX(Setup!$O$6:$AL$23,{j},{k})<>"",'
                                f'{L(10 + d)}{tr}=0')
                        if d >= 6:
                            # weekend: approved overtime only
                            elig += f',{L(19 + d)}{tr}=1'
                        if day_col:
                            elig += f',COUNTIF({day_col},$B{tr})+COUNTIF({day_col},$B{tr}&" ~*")=0'
                        elig += ')'
                        if week_col:
                            load = f'COUNTIF({week_col},$B{tr})+COUNTIF({week_col},$B{tr}&" ~*")'
                        else:
                            load = '0'
                        trainee = f'IF(INDEX(Setup!$O$6:$AL$23,{j},{k})="T",500,0)'
                        # Continuity (lower score wins). Tue-Fri follow MONDAY's pick, not
                        # yesterday's, so the duty's owner comes back after a day of leave
                        # instead of the stand-in keeping it for the rest of the week.
                        # Saturday starts fresh, so weekend cover falls to whoever has done
                        # least that week rather than to someone already working Mon-Fri;
                        # Sunday follows Saturday so one person covers the whole weekend.
                        anchor_day = {2: 1, 3: 1, 4: 1, 5: 1, 7: 6}.get(d)
                        if anchor_day:
                            pstart = EN_AUTO_R0 + (anchor_day - 1) * NDUTY * AUTO_MAXSLOT + (j - 1) * AUTO_MAXSLOT
                            prev = f"$E${pstart}:$E${pstart + AUTO_MAXSLOT - 1}"
                            cont = f'IF(COUNTIF({prev},$B{tr})+COUNTIF({prev},$B{tr}&" ~*")>0,0,1000000)'
                        else:
                            cont = '1000000'
                        ws[f"{sc}{r}"] = f'=IF(AND(D{r}=0,F{r}=0),"",IF({elig},{cont}+({load})*1000+{trainee}+{k},""))'
        return ws


    def build_capacity_and_tasks(self, ws):
        """Spare capacity for the planning week, and automatic scheduling of the
        ad-hoc Work Pack tasks.

        A task is placed from two things the user gives it: how long it is (days)
        and how flexible it is (weekday only / any day / weekend overtime). The
        scheduler finds people who are competent for the work type, who have that
        many free days among the days the task is allowed on, and who are least
        loaded; then it takes the earliest free days. Tasks are placed in order,
        each one seeing the days the previous ones consumed.
        """
        C = EN_CTRL
        team_ini = f"$B${EN_TEAM_R0}:$B${EN_TEAM_R0 + NSTAFF - 1}"

        # ---- free-capacity matrix: person x day, for the planning week ----
        put(ws, f"A{EN_FREE_R0 - 1}", "k | initials | free day Mon..Sun (planning week)", f=font(8, True))
        for k in range(1, NSTAFF + 1):
            r = EN_FREE_R0 + k - 1
            tr = EN_TEAM_R0 + k - 1
            ws[f"A{r}"] = k
            ws[f"B{r}"] = f"=$B${tr}"
            for d in range(1, 8):
                cols = SLOT_COLS[d]
                block = f"${L(cols[0])}${EN_ROSTER_R0}:${L(cols[-1])}${EN_ROSTER_R0 + NDUTY - 1}"
                on_duty = f'COUNTIF({block},$B${tr})+COUNTIF({block},$B${tr}&" ~*")'
                gate = f"$C${tr}=1,{L(10 + d)}${tr}=0,{on_duty}=0"
                if d >= 6:
                    gate += f",{L(19 + d)}${tr}=1"     # weekend needs approved overtime
                ws[f"{L(2 + d)}{r}"] = f'=IF($B{r}="",0,IF(AND({gate}),1,0))'

        # ---- ad-hoc task scheduler ----
        put(ws, f"A{EN_TASK_R0 - 1}",
            "t | wp row | work type | days | flexibility | duty j | person | trainee | days text | placed | elig L..R | scores T..AQ | day flags BA..BG",
            f=font(8, True))
        wp_rank = f"'Work Pack'!$K${WP_R0}:$K${WP_R0 + WP_N - 1}"
        def wpcol(col):
            return f"'Work Pack'!${col}${WP_R0}:${col}${WP_R0 + WP_N - 1}"
        for t in range(1, NTASK + 1):
            r = EN_TASK_R0 + t - 1
            ws[f"A{r}"] = t
            ws[f"B{r}"] = f'=IFERROR(MATCH({t},{wp_rank},0),"")'
            idx = f"$B{r}"
            ws[f"C{r}"] = f'=IF({idx}="","",INDEX({wpcol("E")},{idx})&"")'
            ws[f"D{r}"] = f'=IF({idx}="",0,MAX(0,N(INDEX({wpcol("F")},{idx}))))'
            ws[f"E{r}"] = f'=IF({idx}="","",INDEX({wpcol("G")},{idx})&"")'
            ws[f"F{r}"] = f'=IFERROR(MATCH($C{r},Setup!$K$6:$K$23,0),0)'
            # eligible days: task flexibility wins; blank falls back to the duty's Setup flag
            for d in range(1, 8):
                dutyflex = f'INDEX(Setup!$M$6:$M$23,MAX(1,$F{r}))="Y"'
                if d <= 5:
                    base_ok = f'IF($E{r}="Weekend (overtime)",0,1)'
                else:
                    base_ok = (f'IF($E{r}="Weekday only",0,IF($E{r}="Any day",1,'
                               f'IF($E{r}="Weekend (overtime)",1,IF({dutyflex},1,0))))')
                ws[f"{L(11 + d)}{r}"] = (f'=IF(OR($B{r}="",$F{r}=0,N($D{r})=0,'
                                         f'INDEX({wpcol("I")},MAX(1,$B{r}))="Done"),0,{base_ok})')
            # per-person score
            for k in range(1, NSTAFF + 1):
                tr = EN_TEAM_R0 + k - 1
                fr = EN_FREE_R0 + k - 1
                terms = []
                for d in range(1, 8):
                    elig = f"{L(11 + d)}{r}"
                    free = f"${L(2 + d)}${fr}"
                    if r > EN_TASK_R0:
                        used = (f'SUMPRODUCT(($G${EN_TASK_R0}:$G{r - 1}=$B${tr})*'
                                f'({L(52 + d)}${EN_TASK_R0}:{L(52 + d)}{r - 1}))')
                    else:
                        used = "0"
                    terms.append(f"{elig}*{free}*(1-MIN(1,{used}))")
                avail = "+".join(terms)
                sc = L(19 + k)      # T..AQ
                # load = duty days this week + task days already given to this person,
                # so a run of tasks spreads across people instead of piling onto one
                if r > EN_TASK_R0:
                    taskload = (f'SUMPRODUCT(($G${EN_TASK_R0}:$G{r - 1}=$B${tr})*'
                                f'($J${EN_TASK_R0}:$J{r - 1}))')
                else:
                    taskload = "0"
                ws[f"{sc}{r}"] = (
                    f'=IF(OR($B{r}="",$F{r}=0),"",'
                    f'IF(AND($C${tr}=1,INDEX(Setup!$O$6:$AL$23,MAX(1,$F{r}),{k})<>"",({avail})>=$D{r}),'
                    f'($R${tr}+{taskload})*1000+IF(INDEX(Setup!$O$6:$AL$23,MAX(1,$F{r}),{k})="T",500,0)+{k},""))')
            scores = f"$T{r}:$AQ{r}"
            manual = f'(INDEX({wpcol("H")},MAX(1,$B{r}))&"")'
            ws[f"G{r}"] = (
                f'=IF(OR($B{r}="",$F{r}=0,N($D{r})=0,INDEX({wpcol("I")},MAX(1,$B{r}))="Done"),"",'
                f'IF({manual}<>"",{manual},'
                f'IF(COUNT({scores})=0,"",INDEX({team_ini},MOD(MIN({scores}),500)))))')
            ws[f"H{r}"] = (f'=IF($G{r}="",0,IF(IFERROR(INDEX(Setup!$O$6:$AL$23,MAX(1,$F{r}),'
                           f'MATCH($G{r},Setup!$B$6:$B$29,0)),"")="T",1,0))')
            # day flags: take the earliest allowed free days until the task is covered
            for d in range(1, 8):
                fc = L(52 + d)
                free_range = f"${L(2 + d)}${EN_FREE_R0}:${L(2 + d)}${EN_FREE_R0 + NSTAFF - 1}"
                free_chosen = f'IFERROR(INDEX({free_range},MATCH($G{r},{team_ini},0)),0)'
                if r > EN_TASK_R0:
                    used_chosen = (f'SUMPRODUCT(($G${EN_TASK_R0}:$G{r - 1}=$G{r})*'
                                   f'({fc}${EN_TASK_R0}:{fc}{r - 1}))')
                else:
                    used_chosen = "0"
                sofar = f"SUM($BA{r}:{L(51 + d)}{r})" if d > 1 else "0"
                ws[f"{fc}{r}"] = (f'=IF($G{r}="",0,IF(AND({L(11 + d)}{r}=1,{free_chosen}=1,'
                                  f'{used_chosen}=0,{sofar}<$D{r}),1,0))')
            parts = "&".join(f'IF({L(52 + d)}{r}=1,"{DAY_NAMES[d - 1]} ","")' for d in range(1, 8))
            ws[f"I{r}"] = f'=IF($G{r}="","",SUBSTITUTE(TRIM({parts})," ",", "))'
            ws[f"J{r}"] = f'=SUM($BA{r}:$BG{r})'
            # total days this person is committed to across the week, duties and tasks
            ws[f"S{r}"] = (
                f'=IF($G{r}="","",IFERROR(INDEX($R${EN_TEAM_R0}:$R${EN_TEAM_R0 + NSTAFF - 1},'
                f'MATCH($G{r},{team_ini},0)),0)'
                f'+SUMPRODUCT(($G${EN_TASK_R0}:$G${EN_TASK_R0 + NTASK - 1}=$G{r})*'
                f'($J${EN_TASK_R0}:$J${EN_TASK_R0 + NTASK - 1})))')
        return ws

    # ---- Year sheets -------------------------------------------------------
    def build_year(self, year):
        ws = self.wb.create_sheet(str(year))
        idx = YEARS.index(year) + 1
        ws.sheet_properties.tabColor = ["1F3864", "2E75B6", "548235", "BF8F00"][idx - 1]
        ws.sheet_view.showGridLines = False
        ws.sheet_view.zoomScale = 90
        data = self.src["years"][year]

        # column widths
        widths = {1: 3, 2: 24, COL_SPACER: 2, COL_S1: 11, COL_S2: 13}
        for d, cols in SLOT_COLS.items():
            for c in cols:
                widths[c] = 6.5 if d <= 5 else 7.5
            widths[NOTE_COL[d]] = 15 if d <= 5 else 11
        for c, w in widths.items():
            ws.column_dimensions[L(c)].width = w
        ws.column_dimensions["A"].hidden = True

        # ---- header bar (rows 1-4) ----
        for c in range(1, LASTCOL + 1):
            for r in (1, 2, 3):
                style(ws.cell(r, c), bg=NAVY)
        ws.row_dimensions[1].height = 30
        ws.row_dimensions[2].height = 16
        ws.row_dimensions[3].height = 18
        ws.row_dimensions[4].height = 6
        put(ws, "B1", f"{year}  PLANNER", f=font(16, True, WHITE), al=Alignment(vertical="center"))
        put(ws, "B2", "Pick people from the dropdowns (they only list qualified, available staff for the active week). "
                      "Type a status code against a person to mark leave, training or sickness.",
            f=font(8, False, "D9E1F2"), al=Alignment(vertical="center"))
        self.nav_link(ws, "C1", "◀ Dashboard", "#'Dashboard'!A1")
        ws.merge_cells("C1:F1")
        put(ws, "G1", f'=HYPERLINK("#\'"&Engine!$B${EN_CTRL["year"]}&"\'!B"&Engine!$B${EN_CTRL["base"]},'
                      f'"Active week: W"&Engine!$B${EN_CTRL["week"]}&" of "&Engine!$B${EN_CTRL["year"]}&" ▶")',
            f=font(9, True, GOLD, underline="single"), al=CENTER)
        ws.merge_cells("G1:N1")
        put(ws, "O1", f'=IF(AND(Engine!$B${EN_CTRL["isoy"]}>=2027,Engine!$B${EN_CTRL["isoy"]}<=2030),'
                      f'HYPERLINK("#\'"&Engine!$B${EN_CTRL["isoy"]}&"\'!B"&({T0}+{BLOCK}*(Engine!$B${EN_CTRL["isow"]}-1)),"Today\'s week ▶"),'
                      f'"Today is outside 2027-2030")',
            f=font(9, True, "D9E1F2", underline="single"), al=CENTER)
        ws.merge_cells("O1:V1")
        put(ws, "W1", "Jump to week:", f=font(9, True, WHITE), al=Alignment(horizontal="right", vertical="center"))
        ws.merge_cells("W1:X1")
        put(ws, "Y1", 1, f=font(10, True, NAVY), bg="FFFBE6", al=CENTER, locked=False)
        put(ws, "Z1", f'=HYPERLINK("#\'{year}\'!B"&({T0}+{BLOCK}*(MAX(1,MIN(53,N($Y$1)))-1)),"Go ▶")',
            f=font(9, True, GOLD, underline="single"), al=CENTER)
        dv_wk = DataValidation(type="whole", operator="between", formula1="1", formula2="53",
                               error="Enter a week number from 1 to 53.", errorTitle="Week")
        ws.add_data_validation(dv_wk)
        dv_wk.add("Y1")
        put(ws, "AB1", "Year", f=font(8, False, "D9E1F2"), al=Alignment(horizontal="right", vertical="center"))
        put(ws, "AC1", year, f=font(10, True, WHITE), al=CENTER)
        put(ws, "AB2", "Week 1 starts", f=font(8, False, "D9E1F2"), al=Alignment(horizontal="right", vertical="center"))
        put(ws, "AC2", f"=INDEX(Setup!$L$33:$L$36,MATCH($AC$1,Setup!$K$33:$K$36,0))", f=font(9, True, WHITE), al=CENTER, nf="d mmm yyyy")
        put(ws, "AB3", "Year index", f=font(8, False, "D9E1F2"), al=Alignment(horizontal="right", vertical="center"))
        put(ws, "AC3", "=$AC$1-2026", f=font(9, True, WHITE), al=CENTER)
        # legend chips on row 3
        put(ws, "B3", "Legend:", f=font(8, True, "D9E1F2"), al=Alignment(horizontal="right", vertical="center"))
        chip_col = 3
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            c = ws.cell(3, chip_col)
            c.value = f'=IF(Setup!$B${SU_STATUS_R0 + s - 1}="","",Setup!$B${SU_STATUS_R0 + s - 1})'
            style(c, f=font(8, True, ink), bg=fl, al=CENTER)
            chip_col += 1
        for txt, fl, ink, it in (("* trainee", "FFFFFF", TRAINEE_INK, True), ("gap", GAP_FILL, GAP_INK, False),
                                 ("not SQEP / conflict", BAD_FILL, BAD_INK, False), ("today", TODAY_FILL, "7F6000", False),
                                 ("weekday only", NA_FILL, NA_INK, False)):
            c = ws.cell(3, chip_col)
            c.value = txt
            style(c, f=font(8, True, ink, italic=it), bg=fl, al=CENTER)
            if txt == "not SQEP / conflict":
                ws.merge_cells(start_row=3, start_column=chip_col, end_row=3, end_column=chip_col + 2)
                chip_col += 2
            chip_col += 1
        ws.freeze_panes = "C5"

        # ---- blocks ----
        yrow = 2  # not used
        for b in range(NBLK):
            self.build_block(ws, year, b, data)

        # ---- data validations (one per kind, multi-range) ----
        slot_ranges, status_ranges = [], []
        for b in range(NBLK):
            base = T0 + BLOCK * b
            for d, cols in SLOT_COLS.items():
                slot_ranges.append(rng(cols[0], base + DUTY1, cols[-1], base + DUTY_LAST))
                status_ranges.append(rng(cols[0], base + STAFF1, cols[0], base + STAFF_LAST))
        dv_slot = DataValidation(
            type="list",
            formula1=(f"OFFSET(Engine!$O${EN_COV_R0},(INDEX(Engine!$A${EN_MAP_DAY}:$AC${EN_MAP_DAY},COLUMN())-1)*{NDUTY}"
                      f"+MOD(ROW()-{T0},{BLOCK})-{DUTY1},0,1,MAX(1,INDEX(Engine!$N${EN_COV_R0}:$N${EN_COV_R0 + 7 * NDUTY - 1},"
                      f"(INDEX(Engine!$A${EN_MAP_DAY}:$AC${EN_MAP_DAY},COLUMN())-1)*{NDUTY}+MOD(ROW()-{T0},{BLOCK})-{DUTY1 - 1})))"),
            allow_blank=True, showErrorMessage=False)
        assert len(dv_slot.formula1) <= 255, len(dv_slot.formula1)
        dv_slot.sqref = " ".join(slot_ranges)
        ws.add_data_validation(dv_slot)
        dv_status = DataValidation(type="list",
                                   formula1=f"OFFSET(Setup!$B${SU_STATUS_R0},0,0,MAX(1,COUNTIF(Setup!$B${SU_STATUS_R0}:$B${SU_STATUS_R0 + NSTATUS - 1},\"?*\")),1)",
                                   allow_blank=True, showErrorMessage=True, errorStyle="warning",
                                   error="That is not one of the status codes on the Setup sheet. Keep it anyway?",
                                   errorTitle="Status code")
        dv_status.sqref = " ".join(status_ranges)
        ws.add_data_validation(dv_status)

        # ---- conditional formatting (block-relative, applied once per kind) ----
        self.year_cf(ws, idx)

        # ---- print setup ----
        ws.print_title_rows = "1:4"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_area = f"B1:AC{T0 + BLOCK * NBLK - 2}"
        for b in range(1, NBLK):
            ws.row_breaks.append(Break(id=T0 + BLOCK * b - 1))
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        ws.protection.formatCells = False
        return ws

    def build_block(self, ws, year, b, data):
        base = T0 + BLOCK * b
        wk = b + 1
        A = lambda off: base + off
        INPUT = "FFFFFF"
        # column A: week number on every row (hidden helper for whole-sheet COUNTIFS)
        for off in range(BLOCK):
            ws.cell(A(off), 1).value = wk
        ws.row_dimensions[A(BANNER)].height = 24
        ws.row_dimensions[A(DATES)].height = 18
        ws.row_dimensions[A(SUBH)].height = 14
        ws.row_dimensions[A(AVH)].height = 18
        ws.row_dimensions[A(TOTALS)].height = 16
        ws.row_dimensions[A(NOTES)].height = 30
        ws.row_dimensions[A(48)].height = 8
        ws.row_dimensions[A(49)].height = 8

        # ---- banner ----
        for c in range(2, LASTCOL + 1):
            style(ws.cell(A(BANNER), c), bg=NAVY2)
        put(ws, f"B{A(BANNER)}",
            f'="WEEK {wk}     "&TEXT(C{A(DATES)},"ddd d mmm")&"  –  "&TEXT(C{A(DATES)}+6,"ddd d mmm yyyy")'
            + ('&"   (week 53 - only used in 53-week years)"' if wk == 53 else ""),
            f=font(12, True, WHITE), al=Alignment(vertical="center", indent=1))
        ws.merge_cells(start_row=A(BANNER), start_column=2, end_row=A(BANNER), end_column=18)
        put(ws, f"S{A(BANNER)}", f'=IF(TODAY()<C{A(DATES)},"FUTURE",IF(TODAY()>C{A(DATES)}+6,"PAST","THIS WEEK"))',
            f=font(9, True, "D9E1F2"), al=CENTER)
        ws.merge_cells(start_row=A(BANNER), start_column=19, end_row=A(BANNER), end_column=22)
        put(ws, f"W{A(BANNER)}", f'=IF(AND(Engine!$B${EN_CTRL["yidx"]}=$AC$3,Engine!$B${EN_CTRL["week"]}=$A{A(BANNER)}),"◀ ACTIVE WEEK","")',
            f=font(9, True, WHITE), al=CENTER)
        ws.merge_cells(start_row=A(BANNER), start_column=23, end_row=A(BANNER), end_column=26)
        prev_target = f"#'{year}'!B{base - BLOCK}" if b > 0 else f"#'{year}'!A1"
        next_target = f"#'{year}'!B{base + BLOCK}" if b < NBLK - 1 else f"#'{year}'!A1"
        self.nav_link(ws, f"AB{A(BANNER)}", "◀ Prev" if b > 0 else "▲ Top", prev_target)
        self.nav_link(ws, f"AC{A(BANNER)}", "Next ▶" if b < NBLK - 1 else "▲ Top", next_target)

        # ---- date header + sub header ----
        put(ws, f"B{A(DATES)}", "DUTY", f=font(9, True, WHITE), bg=NAVY, al=LEFT)
        put(ws, f"B{A(SUBH)}", "(from Setup)", f=font(7, False, MUTED, True), al=LEFT, border=BORDER_H)
        for d in range(1, 8):
            cols = SLOT_COLS[d]
            first = cols[0]
            last = NOTE_COL[d]
            f = f"=$AC$2+7*($A{A(DATES)}-1)" if d == 1 else f"=C{A(DATES)}+{d - 1}"
            for c in range(first, last + 1):
                cell = ws.cell(A(DATES), c)
                cell.value = f if c == first else None
                style(cell, f=font(9, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CCONT, nf="ddd d mmm")
                cell.border = Border(left=med if c == first else None, right=med if c == last else None)
            labels = ["1", "2", "3", "Notes"] if d <= 5 else ["Cover", "Notes"]
            for c, t in zip(range(first, last + 1), labels):
                style(ws.cell(A(SUBH), c), f=font(7, True, MUTED), bg=PANEL2, al=CENTER, border=BORDER_H).value = t
        put(ws, f"AB{A(DATES)}", "Gaps", f=font(9, True, WHITE), bg=NAVY, al=CENTER)
        put(ws, f"AC{A(DATES)}", "Cover", f=font(9, True, WHITE), bg=NAVY, al=CENTER)
        put(ws, f"AB{A(SUBH)}", "weekdays short", f=font(7, False, MUTED, True), al=CENTER, border=BORDER_H)
        put(ws, f"AC{A(SUBH)}", "", al=CENTER, border=BORDER_H)

        # ---- duty rows ----
        for j in range(1, NDUTY + 1):
            r = A(DUTY1 + j - 1)
            ws.row_dimensions[r].height = 17
            zebra = PANEL if j % 2 == 0 else WHITE
            put(ws, f"B{r}", f'=IF(Setup!$K${SU_DUTY_R0 + j - 1}="","",Setup!$K${SU_DUTY_R0 + j - 1})',
                f=font(9, True, NAVY), bg=zebra, al=LEFT, border=BORDER_H)
            req = f"N(INDEX(Setup!$L$6:$L$23,{j}))"
            wkd = f'(INDEX(Setup!$M$6:$M$23,{j})="Y")'
            gap_terms = []
            for d in range(1, 8):
                cols = SLOT_COLS[d]
                for c in cols:
                    style(ws.cell(r, c), f=font(9, True, INK), bg=INPUT, al=CENTER, border=BORDER, locked=False)
                nc = ws.cell(r, NOTE_COL[d])
                style(nc, f=font(8, False, MUTED, italic=True), bg=INPUT, al=Alignment(vertical="center", shrink_to_fit=True),
                      border=BORDER, locked=False)
                slot_rng = rng(cols[0], r, cols[-1], r)
                if d <= 5:
                    gap_terms.append(f'(COUNTIF({slot_rng},"?*")<{req})')
                # Sat/Sun are optional overtime, so an empty weekend slot is never a gap.
            put(ws, f"AB{r}", f'=IF($B{r}="","",{"+".join(gap_terms)})', f=font(9, True), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"AC{r}", f'=IF($B{r}="","",IF(AB{r}=0,"✓ covered","⚠ "&AB{r}&IF(AB{r}=1," gap"," gaps")))',
                f=font(8, True, GOOD_INK), bg=zebra, al=CENTER, border=BORDER_H)
            # migrated assignments
            for d in range(1, 8):
                vals = data["assigns"].get((wk, d, j))
                if vals:
                    for c, v in zip(SLOT_COLS[d], vals):
                        ws.cell(r, c).value = v.strip()
                nv = data["notes"].get((wk, d, j))
                if nv:
                    ws.cell(r, NOTE_COL[d]).value = nv

        # ---- availability header ----
        put(ws, f"B{A(AVH)}", "TEAM AVAILABILITY", f=font(9, True, WHITE), bg=NAVY, al=LEFT)
        for d in range(1, 8):
            first, last = SLOT_COLS[d][0], NOTE_COL[d]
            for c in range(first, last + 1):
                cell = ws.cell(A(AVH), c)
                cell.value = (DAY_NAMES[d - 1] + (" (overtime)" if d >= 6 else "")) if c == first else None
                style(cell, f=font(9, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CCONT)
                cell.border = Border(left=med if c == first else None, right=med if c == last else None)
        put(ws, f"AB{A(AVH)}", "Days rostered", f=font(8, True, WHITE), bg=NAVY, al=CENTER)
        put(ws, f"AC{A(AVH)}", "Conflicts", f=font(8, True, WHITE), bg=NAVY, al=CENTER)

        # ---- staff rows ----
        for k in range(1, NSTAFF + 1):
            r = A(STAFF1 + k - 1)
            ws.row_dimensions[r].height = 15
            zebra = PANEL if k % 2 == 0 else WHITE
            put(ws, f"B{r}", f'=IF(Setup!$B${SU_TEAM_R0 + k - 1}="","",Setup!$B${SU_TEAM_R0 + k - 1})',
                f=font(9, True, INK), bg=zebra, al=LEFT, border=BORDER_H)
            days_terms, conf_terms = [], []
            for d in range(1, 8):
                cols = SLOT_COLS[d]
                first, last = cols[0], NOTE_COL[d]
                for c in range(first, last + 1):
                    cell = ws.cell(r, c)
                    style(cell, f=font(9, True, INK), bg=zebra, al=CCONT, border=BORDER_H, locked=(c != first))
                    if c == first:
                        cell.border = Border(left=thin, top=hair, bottom=hair)
                    elif c == last:
                        cell.border = Border(right=thin, top=hair, bottom=hair)
                    else:
                        cell.border = Border(top=hair, bottom=hair)
                slots = rng(cols[0], A(DUTY1), cols[-1], A(DUTY_LAST))
                t = f'(COUNTIF({slots},$B{r})+COUNTIF({slots},$B{r}&" ~*")>0)'
                days_terms.append(t)
                st = f"{L(first)}{r}"
                conf_terms.append(f'(IFERROR(INDEX(Setup!$G$33:$G$40,MATCH({st},Setup!$B$33:$B$40,0)),0)=1)*{t}')
            put(ws, f"AB{r}", f'=IF($B{r}="","",{"+".join(days_terms)})', f=font(9, False, MUTED), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"AC{r}", f'=IF($B{r}="","",{"+".join(conf_terms)})', f=font(9, True, BAD_INK), bg=zebra, al=CENTER, border=BORDER_H)
            # migrated statuses
            ini = self.team[k - 1] if k <= len(self.team) else None
            if ini:
                for d in range(1, 8):
                    code = data["avail"].get((wk, d, ini))
                    if code:
                        ws.cell(r, FIRST[d]).value = code

        # ---- totals row ----
        put(ws, f"B{A(TOTALS)}", "Available  ·  Sat/Sun: OT approved", f=font(8, True, NAVY), bg=PANEL2, al=LEFT, border=BORDER_H)
        s1, s2 = A(STAFF1), A(STAFF_LAST)
        for d in range(1, 8):
            first, last = SLOT_COLS[d][0], NOTE_COL[d]
            for c in range(first, last + 1):
                cell = ws.cell(A(TOTALS), c)
                if c == first:
                    if d <= 5:
                        cell.value = (f'=COUNTIFS(Setup!$E$6:$E$29,"Y",Setup!$B$6:$B$29,"?*")'
                                      f'-SUMPRODUCT(COUNTIF({L(first)}{s1}:{L(first)}{s2},Setup!$F$33:$F$40))')
                    else:
                        # weekend: how many people the team leader has approved for overtime
                        cell.value = f'=IF(Setup!$B$39="",0,COUNTIF({L(first)}{s1}:{L(first)}{s2},Setup!$B$39))'
                style(cell, f=font(8, True, NAVY), bg=PANEL2, al=CCONT, border=BORDER_H)
        put(ws, f"AB{A(TOTALS)}", f'=SUM(AB{s1}:AB{s2})', f=font(8, True, NAVY), bg=PANEL2, al=CENTER, border=BORDER_H)
        put(ws, f"AC{A(TOTALS)}", f'=SUM(AC{s1}:AC{s2})', f=font(8, True, BAD_INK), bg=PANEL2, al=CENTER, border=BORDER_H)

        # ---- week notes ----
        put(ws, f"B{A(NOTES)}", "Week notes", f=font(8, True, MUTED), al=Alignment(horizontal="left", vertical="top", indent=1))
        nc = put(ws, f"C{A(NOTES)}", None, f=font(9), bg="FFFFFF", al=WRAP, border=BORDER, locked=False)
        ws.merge_cells(start_row=A(NOTES), start_column=3, end_row=A(NOTES), end_column=26)

    def year_cf(self, ws, idx):
        """Conditional formats for a year sheet - each rule applied once across all blocks."""
        def union(c1, off1, c2, off2):
            return " ".join(rng(c1, T0 + BLOCK * b + off1, c2, T0 + BLOCK * b + off2) for b in range(NBLK))

        B0 = f"({T0}+{BLOCK}*QUOTIENT(ROW()-{T0},{BLOCK}))"
        DAY = f"INDEX(Engine!$A${EN_MAP_DAY}:$AC${EN_MAP_DAY},COLUMN())"
        FC = f"INDEX(Engine!$A${EN_MAP_FIRST}:$AC${EN_MAP_FIRST},COLUMN())"
        ISSLOT = f"INDEX(Engine!$A${EN_MAP_ISSLOT}:$AC${EN_MAP_ISSLOT},COLUMN())"
        SC = f"INDEX(Engine!$A${EN_MAP_SLOTS}:$AC${EN_MAP_SLOTS},COLUMN())"
        duty_first = f"C{T0 + DUTY1}"                      # C8
        staff_first = f"C{T0 + STAFF1}"                    # C27
        slot_area = union(3, DUTY1, 26, DUTY_LAST)         # C..Z duty rows
        avail_area = union(3, STAFF1, 26, STAFF_LAST)      # C..Z staff rows
        cf = ws.conditional_formatting

        # 1. blank duty / staff rows -> grey, stop
        cf.add(union(2, DUTY1, 29, DUTY_LAST), FormulaRule(formula=[f"$B{T0 + DUTY1}=\"\""], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        cf.add(union(2, STAFF1, 29, STAFF_LAST), FormulaRule(formula=[f"$B{T0 + STAFF1}=\"\""], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))

        # 2. slot cells: not SQEP / unknown initials -> red (stop)
        person_status = (f"IFERROR(INDEX($A:$Z,{B0}+{STAFF1 - 1}+MATCH(SUBSTITUTE({duty_first},\" *\",\"\"),"
                         f"INDEX($B:$B,{B0}+{STAFF1}):INDEX($B:$B,{B0}+{STAFF_LAST}),0),{FC}),\"\")")
        cf.add(slot_area, FormulaRule(
            formula=[f"AND({duty_first}<>\"\",{ISSLOT}=1,$B{T0 + DUTY1}<>\"\","
                     f"IFERROR(INDEX(Setup!$O$6:$AL$23,MATCH($B{T0 + DUTY1},Setup!$K$6:$K$23,0),"
                     f"MATCH(SUBSTITUTE({duty_first},\" *\",\"\"),Setup!$B$6:$B$29,0)),\"\")=\"\")"],
            fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True), stopIfTrue=True))
        # 3. slot cells: rostered while unavailable -> red (stop)
        cf.add(slot_area, FormulaRule(
            formula=[f"AND({duty_first}<>\"\",{ISSLOT}=1,IFERROR(INDEX(Setup!$G$33:$G$40,MATCH({person_status},Setup!$B$33:$B$40,0)),0)=1)"],
            fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True), stopIfTrue=True))
        # 3b. weekend slot filled by someone the team leader has not approved for overtime
        cf.add(slot_area, FormulaRule(
            formula=[f"AND({duty_first}<>\"\",{ISSLOT}=1,{DAY}>=6,Setup!$B$39<>\"\","
                     f"{person_status}<>Setup!$B$39)"],
            fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True), stopIfTrue=True))
        # 4. weekend: duty is weekday-only (not flexible work)
        cf.add(slot_area, FormulaRule(
            formula=[f"AND({ISSLOT}=1,{DAY}>=6,$B{T0 + DUTY1}<>\"\",INDEX(Setup!$M$6:$M$23,MATCH($B{T0 + DUTY1},Setup!$K$6:$K$23,0))<>\"Y\")"],
            fill=cffill(NA_FILL), font=Font(color=NA_INK), stopIfTrue=True))
        # 5. gap: empty slot on a day that is short
        req_expr = (f"IF({DAY}<=5,N(INDEX(Setup!$L$6:$L$23,MATCH($B{T0 + DUTY1},Setup!$K$6:$K$23,0))),"
                    f"--(INDEX(Setup!$M$6:$M$23,MATCH($B{T0 + DUTY1},Setup!$K$6:$K$23,0))=\"Y\"))")
        cf.add(slot_area, FormulaRule(
            formula=[f"AND({duty_first}=\"\",{ISSLOT}=1,$B{T0 + DUTY1}<>\"\","
                     f"COUNTIF(INDEX($A:$Z,ROW(),{FC}):INDEX($A:$Z,ROW(),{FC}+{SC}-1),\"?*\")<{req_expr})"],
            fill=cffill(GAP_FILL), font=Font(color=GAP_INK)))
        # 6. trainee marker
        cf.add(slot_area, FormulaRule(formula=[f"AND({ISSLOT}=1,ISNUMBER(SEARCH(\"~*\",{duty_first})))"],
                                      font=Font(color=TRAINEE_INK, italic=True, bold=True)))
        # 7. slot cells coloured by the person's status that day
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            sc = f"Setup!$B${SU_STATUS_R0 + s - 1}"
            cf.add(slot_area, FormulaRule(
                formula=[f"AND({duty_first}<>\"\",{ISSLOT}=1,{sc}<>\"\",{person_status}={sc})"],
                fill=cffill(fl), font=Font(color=ink, bold=True)))
        # 8. today column (dates row .. totals row), low priority
        cf.add(union(3, DATES, 26, TOTALS), FormulaRule(
            formula=[f"AND({FC}>0,INDEX($A:$Z,{B0}+{DATES},{FC})=TODAY())"], fill=cffill(TODAY_FILL)))

        # 9. availability: conflict (unavailable but rostered) -> red, stop
        st_cell = f"INDEX($A:$Z,ROW(),{FC})"
        slots_day = f"INDEX($A:$Z,{B0}+{DUTY1},{FC}):INDEX($A:$Z,{B0}+{DUTY_LAST},{FC}+{SC}-1)"
        cf.add(avail_area, FormulaRule(
            formula=[f"AND(IFERROR(INDEX(Setup!$G$33:$G$40,MATCH({st_cell},Setup!$B$33:$B$40,0)),0)=1,"
                     f"COUNTIF({slots_day},$B{T0 + STAFF1})+COUNTIF({slots_day},$B{T0 + STAFF1}&\" ~*\")>0)"],
            fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True), stopIfTrue=True))
        # 10. availability: status colours
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            sc = f"Setup!$B${SU_STATUS_R0 + s - 1}"
            cf.add(avail_area, FormulaRule(formula=[f"AND({sc}<>\"\",{st_cell}={sc})"], fill=cffill(fl), font=Font(color=ink, bold=True)))
        # 11. availability: unknown code -> amber text
        cf.add(avail_area, FormulaRule(
            formula=[f"AND({st_cell}<>\"\",ISNA(MATCH({st_cell},Setup!$B$33:$B$40,0)))"],
            fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        # 12. inactive staff -> grey italics on the name
        cf.add(union(2, STAFF1, 2, STAFF_LAST), FormulaRule(
            formula=[f"AND($B{T0 + STAFF1}<>\"\",IFERROR(INDEX(Setup!$E$6:$E$29,MATCH($B{T0 + STAFF1},Setup!$B$6:$B$29,0)),\"\")<>\"Y\")"],
            font=Font(color=MUTED, italic=True)))
        # 13. summary columns
        cf.add(union(28, DUTY1, 28, DUTY_LAST), FormulaRule(formula=[f"AND(ISNUMBER(AB{T0 + DUTY1}),AB{T0 + DUTY1}>0)"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        cf.add(union(29, DUTY1, 29, DUTY_LAST), FormulaRule(formula=[f"LEFT(AC{T0 + DUTY1},1)=\"⚠\""], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        cf.add(union(28, STAFF1, 28, STAFF_LAST), FormulaRule(
            formula=[f"AND(ISNUMBER(AB{T0 + STAFF1}),AB{T0 + STAFF1}>=6)"],
            fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        cf.add(union(29, STAFF1, 29, STAFF_LAST), FormulaRule(formula=[f"AND(ISNUMBER(AC{T0 + STAFF1}),AC{T0 + STAFF1}>0)"], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        cf.add(union(29, STAFF1, 29, STAFF_LAST), FormulaRule(formula=[f"AND(ISNUMBER(AC{T0 + STAFF1}),AC{T0 + STAFF1}=0)"], font=Font(color="D0D0D0")))
        # 14. banner: week state + active flag
        cf.add(union(19, BANNER, 22, BANNER), CellIsRule(operator="equal", formula=['"THIS WEEK"'], fill=cffill(GOOD_INK), font=Font(color=WHITE, bold=True)))
        cf.add(union(19, BANNER, 22, BANNER), CellIsRule(operator="equal", formula=['"PAST"'], font=Font(color="9DAAC4")))
        cf.add(union(23, BANNER, 26, BANNER), FormulaRule(formula=[f"W{T0}<>\"\""], fill=cffill(GOLD), font=Font(color=NAVY, bold=True)))
        cf.add(union(2, BANNER, 18, BANNER), FormulaRule(formula=[f"$W{T0}<>\"\""], fill=cffill(ACCENT)))

    # ---- Dashboard ---------------------------------------------------------
    def build_dashboard(self):
        ws = self.wb.create_sheet("Dashboard", 0)
        ws.sheet_properties.tabColor = GOLD
        ws.sheet_view.showGridLines = False
        ws.sheet_view.zoomScale = 90
        widths = {1: 2, 2: 22, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12, 8: 12, 9: 12, 10: 3, 11: 2,
                  12: 18, 13: 8, 14: 8, 15: 16, 16: 2, 17: 12, 18: 10}
        for c, w in widths.items():
            ws.column_dimensions[L(c)].width = w
        C = EN_CTRL
        E = lambda key: f"Engine!$B${C[key]}"

        # header
        for c in range(1, 19):
            for r in (1, 2, 3):
                style(ws.cell(r, c), bg=NAVY)
        ws.row_dimensions[1].height = 34
        ws.row_dimensions[2].height = 16
        ws.row_dimensions[3].height = 20
        put(ws, "B1", "ESG TEAM PLANNER", f=font(20, True, WHITE), al=Alignment(vertical="center"))
        put(ws, "B2", "Multi-year duty roster · 2027 – 2030 · one place to plan the week, spot gaps and track leave.",
            f=font(9, False, "D9E1F2"), al=Alignment(vertical="center"))
        put(ws, "L1", '="Today: "&TEXT(TODAY(),"ddd d mmm yyyy")&"   ·   ISO week "&' + E("isow") + '&" of "&' + E("isoy"),
            f=font(10, True, GOLD), al=Alignment(horizontal="right", vertical="center"))
        ws.merge_cells("L1:R1")
        # nav row 3
        links = [("C3", "Setup", "#'Setup'!A1"), ("D3", "2027", "#'2027'!A1"), ("E3", "2028", "#'2028'!A1"),
                 ("F3", "2029", "#'2029'!A1"), ("G3", "2030", "#'2030'!A1"), ("H3", "Auto Plan", "#'Auto Plan'!A1"), ("I3", "Print Week", "#'Print Week'!A1"),
                 ("L3", "My Rota", "#'My Rota'!A1"), ("M3", "Year view", "#'Year View'!A1"), ("O3", "Work Pack", "#'Work Pack'!A1"), ("N3", "Guide", "#'Guide'!A1")]
        put(ws, "B3", "Go to:", f=font(9, True, "D9E1F2"), al=Alignment(horizontal="right", vertical="center"))
        for ref, t, target in links:
            self.nav_link(ws, ref, t, target, color=WHITE, size=10)

        # ---- control panel ----
        INPUT = "FFFBE6"
        put(ws, "B5", "PLANNING WEEK", f=font(11, True, NAVY))
        put(ws, "B6", "Year", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "B7", "Week number", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "B8", "Follow today automatically", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "D6", 2027, f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        put(ws, "D7", 1, f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        put(ws, "D8", "Y", f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        for ref in ("C6", "C7", "C8"):
            style(ws[ref], border=BORDER_H)
        put(ws, "E6", "← pick 2027-2030", f=font(8, False, MUTED, True))
        put(ws, "E7", "← 1 to 53", f=font(8, False, MUTED, True))
        put(ws, "E8", "← Y: the planner always opens on today's week (once we are in 2027)", f=font(8, False, MUTED, True))
        dv_year = DataValidation(type="list", formula1="=Setup!$K$33:$K$36"); ws.add_data_validation(dv_year); dv_year.add("D6")
        dv_week = DataValidation(type="whole", operator="between", formula1="1", formula2="53",
                                 error="Enter a week number from 1 to 53.", errorTitle="Week"); ws.add_data_validation(dv_week); dv_week.add("D7")
        dv_yn = DataValidation(type="list", formula1='"Y,N"'); ws.add_data_validation(dv_yn); dv_yn.add("D8")
        put(ws, "B9", '="Planning:  WEEK "&' + E("week") + '&"  ·  "&TEXT(' + E("start") + ',"ddd d mmm")&" – "&TEXT(' + E("start") +
            '+6,"ddd d mmm yyyy")&IF(AND(TODAY()>=' + E("start") + ',TODAY()<=' + E("start") + '+6),"   ·   THIS WEEK",'
            'IF(TODAY()<' + E("start") + ',"   ·   future","   ·   past"))',
            f=font(11, True, WHITE), bg=ACCENT, al=Alignment(vertical="center", indent=1))
        ws.merge_cells("B9:H9")
        put(ws, "I9", '=HYPERLINK("#\'"&' + E("year") + '&"\'!B"&' + E("base") + ',"Open week ▶")',
            f=font(11, True, WHITE, underline="single"), bg=NAVY, al=CENTER)
        ws.row_dimensions[9].height = 26
        # Auto-fill call to action
        put(ws, "B10", "⚡ AUTO-FILL", f=font(10, True, NAVY), bg=GOLD, al=CENTER, border=BORDER)
        c = put(ws, "C10", '=HYPERLINK("#\'Auto Plan\'!A1","Build this week automatically from the rules  ▶")',
                f=font(10, True, NAVY, underline="single"), bg="FCE9C8", al=Alignment(horizontal="left", vertical="center", indent=1), border=BORDER)
        ws.merge_cells("C10:H10")
        put(ws, "I10", '=IF(SUM(Engine!$D$' + str(EN_AUTO_R0) + ':$D$' + str(EN_AUTO_R0 + 7 * NDUTY * AUTO_MAXSLOT - 1) +
            ')=0,"",SUMPRODUCT(--(Engine!$E$' + str(EN_AUTO_R0) + ':$E$' + str(EN_AUTO_R0 + 7 * NDUTY * AUTO_MAXSLOT - 1) +
            '<>""))&"/"&SUM(Engine!$D$' + str(EN_AUTO_R0) + ':$D$' + str(EN_AUTO_R0 + 7 * NDUTY * AUTO_MAXSLOT - 1) + '))',
            f=font(9, True, NAVY), bg="FCE9C8", al=CENTER, border=BORDER)
        ws.row_dimensions[10].height = 22

        # ---- KPI tiles (row 11-13) ----
        cov = lambda col: f"Engine!${col}${EN_COV_R0}:${col}${EN_COV_R0 + 7 * NDUTY - 1}"
        tiles = [
            ("B", "Coverage", f'=IFERROR((SUM({cov("E")})-SUM({cov("G")}))/SUM({cov("E")}),0)', "0%", "of required duty-days filled"),
            ("C", "Gaps", f'=SUM({cov("G")})', "0", "duty-days still to fill"),
            ("D", "Off", f'=SUM(Engine!$K${EN_TEAM_R0}:$Q${EN_TEAM_R0 + NSTAFF - 1})', "0", "person-days unavailable"),
            ("E", "Overtime", f'=SUM(Engine!$T${EN_TEAM_R0}:$Z${EN_TEAM_R0 + NSTAFF - 1})', "0", "weekend days approved"),
            ("F", "Conflicts", f'=SUM(Engine!$S${EN_TEAM_R0}:$S${EN_TEAM_R0 + NSTAFF - 1})', "0", "rostered while unavailable"),
            ("G", "Not SQEP", f'=SUM({cov("J")})', "0", "unqualified in slots"),
            ("H", "Busiest", f'=IF(MAX(Engine!$R${EN_TEAM_R0}:$R${EN_TEAM_R0 + NSTAFF - 1})=0,"–",IFERROR(INDEX(Engine!$B${EN_TEAM_R0}:$B${EN_TEAM_R0 + NSTAFF - 1},MATCH(MAX(Engine!$R${EN_TEAM_R0}:$R${EN_TEAM_R0 + NSTAFF - 1}),Engine!$R${EN_TEAM_R0}:$R${EN_TEAM_R0 + NSTAFF - 1},0))&" · "&MAX(Engine!$R${EN_TEAM_R0}:$R${EN_TEAM_R0 + NSTAFF - 1})&"d","–"))', "@", "most days rostered"),
            ("I", "Available", f'=COUNTIF(Engine!$C${EN_TEAM_R0}:$C${EN_TEAM_R0 + NSTAFF - 1},1)-SUMPRODUCT(--(Engine!$C${EN_TEAM_R0}:$C${EN_TEAM_R0 + NSTAFF - 1}=1),--(Engine!$K${EN_TEAM_R0}:$K${EN_TEAM_R0 + NSTAFF - 1}=1))', "0", "people on site Monday"),
        ]
        ws.row_dimensions[11].height = 14
        ws.row_dimensions[12].height = 30
        ws.row_dimensions[13].height = 14
        for col, title, f, nf, sub in tiles:
            put(ws, f"{col}11", title.upper(), f=font(8, True, "D9E1F2"), bg=NAVY2, al=CENTER)
            put(ws, f"{col}12", f, f=font(16, True, WHITE), bg=NAVY2, al=CENTER, nf=nf)
            put(ws, f"{col}13", sub, f=font(7, False, "D9E1F2"), bg=NAVY2, al=Alignment(horizontal="center", vertical="center", wrap_text=True))
        ws.conditional_formatting.add("B12", CellIsRule(operator="greaterThanOrEqual", formula=["1"], fill=cffill(GOOD_INK)))
        ws.conditional_formatting.add("B12", CellIsRule(operator="lessThan", formula=["0.8"], fill=cffill("C00000")))
        for ref in ("C12", "F12", "G12"):
            ws.conditional_formatting.add(ref, CellIsRule(operator="greaterThan", formula=["0"], fill=cffill("C00000")))
            ws.conditional_formatting.add(ref, CellIsRule(operator="equal", formula=["0"], fill=cffill(GOOD_INK)))

        # ---- roster grid (rows 15-34) ----
        put(ws, "B15", "THIS WEEK'S ROSTER", f=font(11, True, NAVY))
        put(ws, "E15", "read-only mirror of the active week - edit on the year sheet", f=font(8, False, MUTED, True))
        put(ws, "B16", "Duty", f=font(9, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(2 + d)}16", f"={E('start')}+{d - 1}", f=font(9, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, nf="ddd d", border=BORDER)
        put(ws, "J16", "", bg=NAVY)
        ws.row_dimensions[16].height = 18
        for j in range(1, NDUTY + 1):
            r = 16 + j
            rr = EN_ROSTER_R0 + j - 1
            zebra = PANEL if j % 2 == 0 else WHITE
            put(ws, f"B{r}", f"=Engine!$B${rr}", f=font(9, True, NAVY), bg=zebra, al=LEFT, border=BORDER_H)
            for d in range(1, 8):
                cols = SLOT_COLS[d]
                cells = [f"Engine!${L(c)}${rr}" for c in cols]
                joined = "&\" \"&".join(cells)
                f = f'=IF($B{r}="","",SUBSTITUTE(TRIM(SUBSTITUTE({joined}," *","*"))," "," · "))'
                put(ws, f"{L(2 + d)}{r}", f, f=font(9, True, INK), bg=zebra, al=CENTER, border=BORDER_H)
            ws.row_dimensions[r].height = 16
        grid = "C17:I34"
        # gap / n-a / not-sqep colouring via the coverage table
        covrow = f"({EN_COV_R0}+(COLUMN()-3)*{NDUTY}+ROW()-17)"
        ws.conditional_formatting.add("B17:I34", FormulaRule(formula=['$B17=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        ws.conditional_formatting.add(grid, FormulaRule(formula=[f"N(INDEX(Engine!$J:$J,{covrow}))>0"], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True), stopIfTrue=True))
        ws.conditional_formatting.add(grid, FormulaRule(formula=[f"N(INDEX(Engine!$G:$G,{covrow}))>0"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True), stopIfTrue=True))
        ws.conditional_formatting.add(grid, FormulaRule(formula=[f"AND(COLUMN()>=8,N(INDEX(Engine!$E:$E,{covrow}))=0)"], fill=cffill(NA_FILL), font=Font(color=NA_INK), stopIfTrue=True))
        ws.conditional_formatting.add(grid, FormulaRule(formula=[f"N(INDEX(Engine!$K:$K,{covrow}))=1"], fill=cffill(TODAY_FILL)))
        ws.conditional_formatting.add("C16:I16", FormulaRule(formula=["C16=TODAY()"], fill=cffill(GOLD), font=Font(color=NAVY, bold=True)))

        # ---- gap finder (right side rows 15-34) ----
        put(ws, "L15", "GAPS & SUGGESTED COVER", f=font(11, True, NAVY))
        for ref, t in (("L16", "Duty"), ("M16", "Day"), ("N16", "Short"), ("O16", "Suggested")):
            put(ws, ref, t, f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        put(ws, "Q16", "Least loaded, SQEP before trainee", f=font(7, False, MUTED, True), al=Alignment(vertical="center", wrap_text=True))
        ws.merge_cells("Q16:R16")
        gr = f"Engine!$I${EN_COV_R0}:$I${EN_COV_R0 + 7 * NDUTY - 1}"
        for m in range(1, 19):
            r = 16 + m
            zebra = PANEL if m % 2 == 0 else WHITE
            pos = f"MATCH({m},{gr},0)"
            put(ws, f"L{r}", f'=IFERROR(INDEX(Engine!$C${EN_COV_R0}:$C${EN_COV_R0 + 7 * NDUTY - 1},{pos}),IF({m}=1,"No gaps 🎉",""))', f=font(9, True, NAVY), bg=zebra, al=LEFT, border=BORDER_H)
            put(ws, f"M{r}", f'=IFERROR(INDEX(Engine!$D${EN_COV_R0}:$D${EN_COV_R0 + 7 * NDUTY - 1},{pos}),"")', f=font(9), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"N{r}", f'=IFERROR(INDEX(Engine!$G${EN_COV_R0}:$G${EN_COV_R0 + 7 * NDUTY - 1},{pos}),"")', f=font(9, True, GAP_INK), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"O{r}", f'=IFERROR(INDEX(Engine!$H${EN_COV_R0}:$H${EN_COV_R0 + 7 * NDUTY - 1},{pos}),"")', f=font(9, True, GOOD_INK), bg=zebra, al=CENTER, border=BORDER_H)
        ws.conditional_formatting.add("L17:O34", FormulaRule(formula=['$L17="No gaps 🎉"'], fill=cffill(GOOD_FILL), font=Font(color=GOOD_INK, bold=True)))
        ws.conditional_formatting.add("O17:O34", FormulaRule(formula=['O17="no-one eligible"'], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        ws.conditional_formatting.add("O17:O34", FormulaRule(formula=['ISNUMBER(SEARCH("~*",O17))'], font=Font(color=TRAINEE_INK, italic=True, bold=True)))

        # ---- availability grid (rows 37-62) ----
        put(ws, "B37", "WHO IS AROUND THIS WEEK", f=font(11, True, NAVY))
        put(ws, "E37", "status codes from Setup · blank = available", f=font(8, False, MUTED, True))
        put(ws, "B38", "Person", f=font(9, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(2 + d)}38", f"={E('start')}+{d - 1}", f=font(9, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, nf="ddd d", border=BORDER)
        put(ws, "J38", "", bg=NAVY)
        put(ws, "L38", "Days rostered", f=font(8, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        put(ws, "M38", "Conflicts", f=font(8, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        ws.row_dimensions[38].height = 18
        for k in range(1, NSTAFF + 1):
            r = 38 + k
            tr = EN_TEAM_R0 + k - 1
            zebra = PANEL if k % 2 == 0 else WHITE
            put(ws, f"B{r}", f'=IF(Engine!$B${tr}="","",Engine!$B${tr}&IF(Setup!$C${SU_TEAM_R0 + k - 1}="",""," · "&Setup!$C${SU_TEAM_R0 + k - 1}))',
                f=font(9, True, INK), bg=zebra, al=LEFT, border=BORDER_H)
            for d in range(1, 8):
                put(ws, f"{L(2 + d)}{r}", f"=Engine!${L(3 + d)}${tr}", f=font(9, True), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"L{r}", f'=IF(Engine!$B${tr}="","",Engine!$R${tr})', f=font(9), bg=zebra, al=CENTER, border=BORDER_H)
            put(ws, f"M{r}", f'=IF(Engine!$B${tr}="","",Engine!$S${tr})', f=font(9, True, BAD_INK), bg=zebra, al=CENTER, border=BORDER_H)
            ws.row_dimensions[r].height = 15
        agrid = "C39:I62"
        ws.conditional_formatting.add("B39:M62", FormulaRule(formula=['$B39=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            sc = f"Setup!$B${SU_STATUS_R0 + s - 1}"
            ws.conditional_formatting.add(agrid, FormulaRule(formula=[f'AND({sc}<>"",C39={sc})'], fill=cffill(fl), font=Font(color=ink, bold=True)))
        ws.conditional_formatting.add("L39:L62", CellIsRule(operator="greaterThanOrEqual", formula=["6"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        ws.conditional_formatting.add("M39:M62", CellIsRule(operator="greaterThan", formula=["0"], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        ws.conditional_formatting.add("C38:I38", FormulaRule(formula=["C38=TODAY()"], fill=cffill(GOLD), font=Font(color=NAVY, bold=True)))
        # legend
        put(ws, "B64", "Legend", f=font(9, True, NAVY))
        col = 3
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            c = put(ws, f"{L(col)}64", f'=IF(Setup!$B${SU_STATUS_R0 + s - 1}="","",Setup!$B${SU_STATUS_R0 + s - 1}&" "&Setup!$C${SU_STATUS_R0 + s - 1})',
                    f=font(8, True, ink), bg=fl, al=Alignment(vertical="center", shrink_to_fit=True))
            col += 1
        put(ws, "L64", "gap", f=font(8, True, GAP_INK), bg=GAP_FILL, al=CENTER)
        put(ws, "M64", "not SQEP", f=font(8, True, BAD_INK), bg=BAD_FILL, al=CENTER)
        put(ws, "N64", "today", f=font(8, True, "7F6000"), bg=TODAY_FILL, al=CENTER)
        put(ws, "O64", "* trainee", f=font(8, True, TRAINEE_INK, italic=True), al=CENTER)

        ws.freeze_panes = "A4"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_area = "A1:R64"
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        ws.protection.formatCells = False
        return ws

    # ---- My Rota -----------------------------------------------------------
    def build_my_rota(self):
        ws = self.wb.create_sheet("My Rota")
        ws.sheet_properties.tabColor = ACCENT
        self.header_bar(ws, "MY ROTA  ·  one person, six weeks", "Pick a person and a starting week. Hand this page to the person, or print it.", 12)
        self.nav_link(ws, "K1", "◀ Dashboard", "#'Dashboard'!A1")
        INPUT = "FFFBE6"
        put(ws, "B4", "Person (initials)", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "B5", "Year", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "B6", "From week", f=font(10), al=LEFT, border=BORDER_H)
        put(ws, "D4", self.team[0], f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        put(ws, "D5", f"=Engine!$B${EN_CTRL['year']}", f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        put(ws, "D6", f"=Engine!$B${EN_CTRL['week']}", f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        put(ws, "E5", "← defaults to the planning week on the Dashboard; overwrite to look elsewhere", f=font(8, False, MUTED, True))
        put(ws, "E4", '=IFERROR(IF(INDEX(Setup!$C$6:$C$29,MATCH($D$4,Setup!$B$6:$B$29,0))="","",INDEX(Setup!$C$6:$C$29,MATCH($D$4,Setup!$B$6:$B$29,0))&"   ·   ")&INDEX(Setup!$D$6:$D$29,MATCH($D$4,Setup!$B$6:$B$29,0)),"unknown initials")',
            f=font(10, True, NAVY))
        dv_p = DataValidation(type="list", formula1="=OFFSET(Setup!$B$6,0,0,MAX(1,COUNTIF(Setup!$B$6:$B$29,\"?*\")),1)"); ws.add_data_validation(dv_p); dv_p.add("D4")
        dv_y = DataValidation(type="list", formula1="=Setup!$K$33:$K$36"); ws.add_data_validation(dv_y); dv_y.add("D5")
        dv_w = DataValidation(type="whole", operator="between", formula1="1", formula2="53"); ws.add_data_validation(dv_w); dv_w.add("D6")
        for c, w in zip("ABCDEFGHIJK", (2, 18, 4, 22, 22, 22, 22, 22, 18, 18, 14)):
            ws.column_dimensions[c].width = w
        # grid header
        put(ws, "B8", "Week", f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(3 + d)}8", DAY_NAMES[d - 1], f=font(9, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, border=BORDER)
        put(ws, "K8", "Days on", f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        ws.row_dimensions[8].height = 18
        P = "$D$4"
        for w in range(1, NROTA_WEEKS + 1):
            r = 8 + w
            sr = EN_ROTA_ST_R0 + w - 1
            ws.row_dimensions[r].height = 58
            put(ws, f"B{r}", f'=IF(Engine!$C${sr}="","","W"&(N($D$6)+{w - 1})&CHAR(10)&TEXT(Engine!$C${sr},"d mmm")&" – "&TEXT(Engine!$C${sr}+6,"d mmm"))',
                f=font(9, True, NAVY), bg=PANEL2, al=Alignment(horizontal="center", vertical="center", wrap_text=True), border=BORDER)
            put(ws, f"C{r}", None, bg=PANEL2, border=BORDER)
            for d in range(1, 8):
                status = f"Engine!${L(3 + d)}${sr}"
                duties = f"Engine!${L(19 + d)}${sr}"
                f = (f'=IF(Engine!$C${sr}="","",IF({status}<>"",{status}&IFERROR("  "&INDEX(Setup!$C$33:$C$40,MATCH({status},Setup!$B$33:$B$40,0)),"")'
                     f'&IF({duties}="","",CHAR(10)),"")&IF({duties}="",IF({status}<>"","","–"),{duties}))')
                put(ws, f"{L(3 + d)}{r}", f, f=font(9, True, INK), al=Alignment(horizontal="center", vertical="center", wrap_text=True), border=BORDER)
            put(ws, f"K{r}", f'=IF(Engine!$C${sr}="","",SUMPRODUCT(--(LEFT(D{r}:J{r},1)<>"–"),--(D{r}:J{r}<>"")))',
                f=font(10, True, NAVY), bg=PANEL2, al=CENTER, border=BORDER)
        grid = "D9:J14"
        ws.conditional_formatting.add(grid, FormulaRule(formula=['D9="–"'], font=Font(color="C8C8C8")))
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            sc = f"Setup!$B${SU_STATUS_R0 + s - 1}"
            ws.conditional_formatting.add(grid, FormulaRule(formula=[f'AND({sc}<>"",LEFT(D9,LEN({sc})+2)={sc}&"  ")'], fill=cffill(fl), font=Font(color=ink, bold=True)))
        ws.conditional_formatting.add(grid, FormulaRule(formula=['ISNUMBER(SEARCH("~*",D9))'], font=Font(color=TRAINEE_INK, bold=True)))
        # year summary of duties for the person
        put(ws, "B17", '="DUTY DAYS IN "&$D$5&" FOR "&$D$4', f=font(11, True, NAVY))
        put(ws, "B18", "Duty", f=font(9, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        put(ws, "D18", "Days", f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        put(ws, "E18", "Share of this duty", f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        put(ws, "F18", "how the workload is shared across the year - whole-year count for this year sheet", f=font(8, False, MUTED, True))
        yidx = "IFERROR(MATCH($D$5,Setup!$K$33:$K$36,0),1)"
        for j in range(1, NDUTY + 1):
            r = 18 + j
            zebra = PANEL if j % 2 == 0 else WHITE
            put(ws, f"B{r}", f'=Engine!$B${EN_ROSTER_R0 + j - 1}', f=font(9, True, NAVY), bg=zebra, al=LEFT, border=BORDER_H)
            ws.merge_cells(f"B{r}:C{r}")
            # rows of duty j across all blocks: T0+DUTY1+j-1 + 50b  -> use SUMPRODUCT over column B match and slot columns
            slot_cols = [c for d in range(1, 8) for c in SLOT_COLS[d]]
            def cnt(sheet, who):
                terms = "+".join(f"({q(sheet)}!${L(c)}$1:${L(c)}$2700={who})" for c in slot_cols)
                return f"SUMPRODUCT(({q(sheet)}!$B$1:$B$2700=$B{r})*({terms}))"
            PT = P + '&" *"'
            parts = ",".join(cnt(str(y), P) + "+" + cnt(str(y), PT) for y in YEARS)
            put(ws, f"D{r}", f'=IF($B{r}="","",CHOOSE({yidx},{parts}))', f=font(10, True), bg=zebra, al=CENTER, border=BORDER_H)
            def tot(sheet):
                terms = "+".join(f'({q(sheet)}!${L(c)}$1:${L(c)}$2700<>"")' for c in slot_cols)
                return f"SUMPRODUCT(({q(sheet)}!$B$1:$B$2700=$B{r})*({terms}))"
            tot_parts = ",".join(tot(str(y)) for y in YEARS)
            put(ws, f"E{r}", f'=IF($B{r}="","",IFERROR(D{r}/CHOOSE({yidx},{tot_parts}),0))', f=font(9, False, MUTED), bg=zebra, al=CENTER, border=BORDER_H, nf="0%")
        ws.conditional_formatting.add("B19:E36", FormulaRule(formula=['$B19=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        ws.conditional_formatting.add("E19:E36", ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", end_type="num", end_value=0.5, end_color="9BC2E6"))
        ws.freeze_panes = "A4"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        return ws

    # ---- Year View ---------------------------------------------------------
    def build_leave(self):
        ws = self.wb.create_sheet("Year View")
        ws.sheet_properties.tabColor = "548235"
        self.header_bar(ws, "YEAR VIEW  ·  planning progress, leave and training at a glance",
                        "Top: weekday gaps per duty per week - click a week number to open it. Below: absence, training, workload and approved weekend overtime per person.", 62)
        self.nav_link(ws, "BH1", "◀ Dashboard", "#'Dashboard'!A1")
        INPUT = "FFFBE6"
        put(ws, "B4", "Year", f=font(10), al=LEFT)
        put(ws, "C4", f"=Engine!$B${EN_CTRL['year']}", f=font(11, True, NAVY), bg=INPUT, al=CENTER, border=BORDER, locked=False)
        ws.merge_cells("C4:E4")
        put(ws, "F4", "← defaults to the planning year; overwrite to view another", f=font(8, False, MUTED, True))
        dv_y = DataValidation(type="list", formula1="=Setup!$K$33:$K$36"); ws.add_data_validation(dv_y); dv_y.add("C4")
        yidx = "IFERROR(MATCH($C$4,Setup!$K$33:$K$36,0),1)"
        ws.column_dimensions["A"].width = 2
        ws.column_dimensions["B"].width = 16
        for w in range(1, 54):
            ws.column_dimensions[L(2 + w)].width = 3.6
        for c, w in ((56, 2), (57, 9), (58, 9), (59, 9), (60, 9)):
            ws.column_dimensions[L(c)].width = w
        first, last = L(3), L(55)

        def week_header(row, clickable):
            put(ws, f"B{row}", "", bg=NAVY)
            for w in range(1, 54):
                f = f'=HYPERLINK("#\'"&$C$4&"\'!B{T0 + BLOCK * (w - 1)}",{w})' if clickable else w
                put(ws, f"{L(2 + w)}{row}", f, f=font(7, True, WHITE, underline=("single" if clickable else None)), bg=NAVY, al=CENTER)
            put(ws, f"{L(56)}{row}", "", bg=NAVY)

        # ---- planning progress: weekday gaps per duty per week ----
        top = 6
        put(ws, f"B{top}", "PLANNING PROGRESS  -  weekday gaps per duty per week", f=font(11, True, NAVY))
        put(ws, f"P{top}", "0 = fully covered · click a week number to open that week", f=font(8, False, MUTED, True))
        week_header(top + 1, True)
        put(ws, f"B{top + 1}", "Duty", f=font(9, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for col, t in ((57, "Total gaps"), (58, "Weeks short")):
            put(ws, f"{L(col)}{top + 1}", t, f=font(8, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        for j in range(1, NDUTY + 1):
            r = top + 1 + j
            put(ws, f"B{r}", f'=IF(Setup!$K${SU_DUTY_R0 + j - 1}="","",Setup!$K${SU_DUTY_R0 + j - 1})', f=font(9, True, NAVY), al=LEFT, border=BORDER_H)
            for w in range(1, 54):
                row = T0 + BLOCK * (w - 1) + DUTY1 + j - 1
                parts = ",".join(f"N(INDEX({q(str(y))}!$AB:$AB,{row}))" for y in YEARS)
                put(ws, f"{L(2 + w)}{r}", f'=IF($B{r}="","",CHOOSE({yidx},{parts}))', f=font(8), al=CENTER, border=BORDER_H)
            put(ws, f"{L(57)}{r}", f'=IF($B{r}="","",SUM({first}{r}:{last}{r}))', f=font(9, True, NAVY), al=CENTER, border=BORDER_H)
            put(ws, f"{L(58)}{r}", f'=IF($B{r}="","",COUNTIF({first}{r}:{last}{r},">0"))', f=font(9), al=CENTER, border=BORDER_H)
            ws.row_dimensions[r].height = 15
        tr = top + 2 + NDUTY
        put(ws, f"B{tr}", "Gaps this week", f=font(9, True, NAVY), bg=PANEL2, al=LEFT, border=BORDER_H)
        for w in range(1, 54):
            c = L(2 + w)
            put(ws, f"{c}{tr}", f"=SUM({c}{top + 2}:{c}{tr - 1})", f=font(8, True, NAVY), bg=PANEL2, al=CENTER)
        put(ws, f"{L(57)}{tr}", f"=SUM({L(57)}{top + 2}:{L(57)}{tr - 1})", f=font(9, True, NAVY), bg=PANEL2, al=CENTER)
        put(ws, f"B{tr + 1}", "Status", f=font(9, True, NAVY), bg=PANEL2, al=LEFT, border=BORDER_H)
        for w in range(1, 54):
            c = L(2 + w)
            put(ws, f"{c}{tr + 1}", f'=IF({c}{tr}=0,"✓","")', f=font(8, True, GOOD_INK), bg=PANEL2, al=CENTER)
        g = f"C{top + 2}:{last}{tr - 1}"
        ws.conditional_formatting.add(f"B{top + 2}:{L(58)}{tr - 1}", FormulaRule(formula=[f'$B{top + 2}=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        ws.conditional_formatting.add(g, CellIsRule(operator="equal", formula=["0"], fill=cffill(GOOD_FILL), font=Font(color=GOOD_INK)))
        ws.conditional_formatting.add(g, CellIsRule(operator="greaterThan", formula=["0"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        ws.conditional_formatting.add(g, CellIsRule(operator="greaterThanOrEqual", formula=["5"], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        ws.conditional_formatting.add(f"C{tr}:{last}{tr}", CellIsRule(operator="equal", formula=["0"], fill=cffill(GOOD_FILL), font=Font(color=GOOD_INK, bold=True)))
        ws.conditional_formatting.add(f"C{tr}:{last}{tr}", CellIsRule(operator="greaterThan", formula=["0"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        # highlight the planning week's column header
        ws.conditional_formatting.add(f"C{top + 1}:{last}{top + 1}", FormulaRule(
            formula=[f"AND($C$4=Engine!$B${EN_CTRL['year']},COLUMN()-2=Engine!$B${EN_CTRL['week']})"], fill=cffill(GOLD), font=Font(color=NAVY, bold=True)))

        # ---- absence / training grids ----
        def grid(top, title, crit_expr, note, cell_builder=None, totals_label="Team total"):
            put(ws, f"B{top}", title, f=font(11, True, NAVY))
            put(ws, f"P{top}", note, f=font(8, False, MUTED, True))
            week_header(top + 1, False)
            put(ws, f"B{top + 1}", "Person", f=font(9, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
            for col, t in ((57, "Total days"), (58, "Weeks"), (59, "Peak wk")):
                put(ws, f"{L(col)}{top + 1}", t, f=font(8, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
            for k in range(1, NSTAFF + 1):
                r = top + 1 + k
                sr = SU_TEAM_R0 + k - 1
                put(ws, f"B{r}", f'=IF(Setup!$B${sr}="","",Setup!$B${sr})', f=font(9, True, INK), al=LEFT, border=BORDER_H)
                for w in range(1, 54):
                    row = T0 + BLOCK * (w - 1) + STAFF1 + k - 1
                    if cell_builder is None:
                        parts = ",".join(f"SUMPRODUCT(COUNTIF({q(str(y))}!$C${row}:$Z${row},{crit_expr}))" for y in YEARS)
                    else:
                        parts = ",".join(cell_builder(str(y), row) for y in YEARS)
                    put(ws, f"{L(2 + w)}{r}", f'=IF($B{r}="","",CHOOSE({yidx},{parts}))', f=font(8), al=CENTER, border=BORDER_H, nf='0;-0;""')
                put(ws, f"{L(57)}{r}", f'=IF($B{r}="","",SUM({first}{r}:{last}{r}))', f=font(9, True, NAVY), al=CENTER, border=BORDER_H)
                put(ws, f"{L(58)}{r}", f'=IF($B{r}="","",COUNTIF({first}{r}:{last}{r},">0"))', f=font(9), al=CENTER, border=BORDER_H)
                put(ws, f"{L(59)}{r}", f'=IF(OR($B{r}="",N({L(57)}{r})=0),"",MATCH(MAX({first}{r}:{last}{r}),{first}{r}:{last}{r},0))', f=font(9), al=CENTER, border=BORDER_H)
                ws.row_dimensions[r].height = 15
            tr = top + 2 + NSTAFF
            put(ws, f"B{tr}", totals_label, f=font(9, True, NAVY), bg=PANEL2, al=LEFT, border=BORDER_H)
            for w in range(1, 54):
                c = L(2 + w)
                put(ws, f"{c}{tr}", f"=SUM({c}{top + 2}:{c}{tr - 1})", f=font(8, True, NAVY), bg=PANEL2, al=CENTER, nf='0;-0;""')
            put(ws, f"{L(57)}{tr}", f"=SUM({L(57)}{top + 2}:{L(57)}{tr - 1})", f=font(9, True, NAVY), bg=PANEL2, al=CENTER)
            g = f"C{top + 2}:{last}{tr - 1}"
            ws.conditional_formatting.add(f"B{top + 2}:{L(59)}{tr - 1}", FormulaRule(formula=[f'$B{top + 2}=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
            return g, tr

        top_a = tr + 4
        g1, t1 = grid(top_a, "ABSENCE DAYS  (leave, sickness, off-site ...)", "Setup!$F$33:$F$40", "cell = number of days that week; blank = none")
        ws.conditional_formatting.add(g1, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", mid_type="num", mid_value=3, mid_color="FCE4D6", end_type="num", end_value=7, end_color="C65911"))
        ws.conditional_formatting.add(f"C{t1}:{last}{t1}", CellIsRule(operator="greaterThanOrEqual", formula=["10"], fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        put(ws, f"B{t1 + 1}", "Red team totals = 10 or more absence days in one week - check cover before approving more leave.", f=font(8, False, MUTED, True))
        top_t = t1 + 4
        g2, t2 = grid(top_t, "TRAINING DAYS  (T code)", "Setup!$B$35", "cell = number of days that week; blank = none")
        ws.conditional_formatting.add(g2, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", mid_type="num", mid_value=3, mid_color="DDEBF7", end_type="num", end_value=7, end_color="2F5597"))
        top_w = t2 + 4
        g3, t3 = grid(top_w, "WORKLOAD  (days rostered per person per week)", None,
                      "use it to keep the rota fair - dark = busy weeks; 'Total days' compares people over the year",
                      cell_builder=lambda sheet, row: f"N(INDEX({q(sheet)}!$AB:$AB,{row}))", totals_label="Team days")
        ws.conditional_formatting.add(g3, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", mid_type="num", mid_value=3, mid_color="C6E0B4", end_type="num", end_value=7, end_color="548235"))
        ws.conditional_formatting.add(f"{L(57)}{top_w + 2}:{L(57)}{t3 - 1}", ColorScaleRule(start_type="min", start_color="FFFFFF", end_type="max", end_color="9BC2E6"))
        top_ot = t3 + 4
        g4, t4 = grid(top_ot, "WEEKEND OVERTIME  (days the team leader approved)", "Setup!$B$39",
                      "weekend working is optional - these are approved overtime days, and they count towards flexible work",
                      totals_label="Team OT days")
        ws.conditional_formatting.add(g4, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", mid_type="num", mid_value=1, mid_color="D0F0F0", end_type="num", end_value=2, end_color="0B6E6E"))
        ws.freeze_panes = "C8"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        return ws

    # ---- Auto Plan ---------------------------------------------------------
    def build_auto_plan(self):
        ws = self.wb.create_sheet("Auto Plan")
        ws.sheet_properties.tabColor = GOLD
        ws.sheet_view.showGridLines = False
        ws.sheet_view.zoomScale = 90
        C = EN_CTRL
        E = lambda key: f"Engine!$B${C[key]}"
        for c, w in zip("ABCDEFGHIJ", (2, 22, 14, 14, 14, 14, 14, 12, 13, 2)):
            ws.column_dimensions[c].width = w
        # header
        for c in range(1, 11):
            for r in (1, 2, 3):
                style(ws.cell(r, c), bg=NAVY)
        ws.row_dimensions[1].height = 30
        ws.row_dimensions[2].height = 16
        ws.row_dimensions[3].height = 18
        put(ws, "B1", "AUTO PLAN", f=font(18, True, WHITE), al=Alignment(vertical="center"))
        put(ws, "B2", "A complete roster the workbook builds for the planning week from the rules - SQEP only, no clashes with leave, "
                      "minimums met, load shared fairly. Review it, then apply.",
            f=font(9, False, "D9E1F2"), al=Alignment(vertical="center"))
        put(ws, "B3", '="Planning week:  W"&' + E("week") + '&"  ·  "&TEXT(' + E("start") + ',"ddd d mmm")&" – "&TEXT(' + E("start") +
            '+6,"ddd d mmm yyyy")&"  ·  year "&' + E("year"),
            f=font(9, True, GOLD), al=Alignment(vertical="center"))
        self.nav_link(ws, "I1", "◀ Dashboard", "#'Dashboard'!A1")
        c = put(ws, "I3", f'=HYPERLINK("#\'"&{E("year")}&"\'!B"&{E("base")},"Open week ▶")', f=font(9, True, "D9E1F2", underline="single"), al=CENTER)

        # ---- how to apply ----
        put(ws, "B5", "HOW TO USE THIS PLAN", f=font(11, True, NAVY))
        steps = [
            ("1", "Set the year and week on the Dashboard - this plan always follows that choice."),
            ("2", "Read the proposed roster below. Anything shaded amber is a slot the rules could not fill (not enough qualified, available people)."),
            ("3", "To use it: click the copy box, copy (Ctrl+C), open the week on the year sheet, click the first duty cell (C, first duty row) and Paste Special > Values."),
            ("4", "Then fine-tune by hand. Every check still applies, so any change you make is validated instantly."),
        ]
        for i, (n, t) in enumerate(steps):
            put(ws, f"B{6 + i}", n, f=font(9, True, WHITE), bg=ACCENT, al=CENTER)
            put(ws, f"C{6 + i}", t, f=font(9), al=Alignment(horizontal="left", vertical="center", wrap_text=True))
            ws.merge_cells(start_row=6 + i, start_column=3, end_row=6 + i, end_column=9)
            ws.row_dimensions[6 + i].height = 26
        put(ws, "B10", "Macro edition only: the Dashboard buttons do steps 3 and 4 in one click - 'Auto-fill week' for this week, or 'Build the year' for the whole year. Neither ever changes a day that is already in the past.",
            f=font(8, False, MUTED, True))
        ws.merge_cells("B10:I10")

        # ---- coverage summary ----
        auto_req = f"Engine!$D${EN_AUTO_R0}:$D${EN_AUTO_R0 + 7 * NDUTY * AUTO_MAXSLOT - 1}"
        auto_pick = f"Engine!$E${EN_AUTO_R0}:$E${EN_AUTO_R0 + 7 * NDUTY * AUTO_MAXSLOT - 1}"
        put(ws, "B12", "PROPOSED ROSTER", f=font(11, True, NAVY))
        put(ws, "E12", '="Fills "&SUMPRODUCT(--(' + auto_pick + '<>""))&" of "&SUM(' + auto_req +
            ')&" required slots"&IF(SUM(' + auto_req + ')-SUMPRODUCT(--(' + auto_pick + '<>""))=0,"  ✓ full cover","  ⚠ some gaps remain")',
            f=font(9, True, NAVY), al=LEFT)
        ws.merge_cells("E12:I12")
        # grid header
        put(ws, "B13", "Duty", f=font(10, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(2 + d)}13", f"={E('start')}+{d - 1}", f=font(10, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, nf="ddd d mmm", border=BORDER)
        ws.row_dimensions[13].height = 22
        for j in range(1, NDUTY + 1):
            r = 13 + j
            rr = EN_ROSTER_R0 + j - 1
            zebra = PANEL if j % 2 == 0 else WHITE
            put(ws, f"B{r}", f"=Engine!$B${rr}", f=font(10, True, NAVY), bg=zebra, al=LEFT, border=BORDER)
            for d in range(1, 8):
                day_start = EN_AUTO_R0 + (d - 1) * NDUTY * AUTO_MAXSLOT + (j - 1) * AUTO_MAXSLOT
                cells = [f"Engine!$E${day_start + sl}" for sl in range(AUTO_MAXSLOT)]
                joined = '&" "&'.join(cells)
                put(ws, f"{L(2 + d)}{r}",
                    f'=IF($B{r}="","",SUBSTITUTE(TRIM(SUBSTITUTE({joined}," *","*"))," ",", "))',
                    f=font(10, True, INK), bg=zebra, al=Alignment(horizontal="center", vertical="center", wrap_text=True), border=BORDER)
            ws.row_dimensions[r].height = 22
        # amber where a required slot went unfilled that day/duty
        covrow_req = f"Engine!$D${EN_AUTO_R0}"
        for d in range(1, 8):
            col = L(2 + d)
            for j in range(1, NDUTY + 1):
                r = 13 + j
                day_start = EN_AUTO_R0 + (d - 1) * NDUTY * AUTO_MAXSLOT + (j - 1) * AUTO_MAXSLOT
                reqrng = f"Engine!$D${day_start}:$D${day_start + AUTO_MAXSLOT - 1}"
                pickrng = f"Engine!$E${day_start}:$E${day_start + AUTO_MAXSLOT - 1}"
                # store short/gap flag off-grid in column K for CF reference
        grid = "C14:I31"
        ws.conditional_formatting.add("B14:I31", FormulaRule(formula=['$B14=""'], fill=cffill(PANEL), font=Font(color=PANEL), stopIfTrue=True))
        # gap: the duty/day is short = required count > filled count in the auto region
        def short_expr():
            # COLUMN()-3 = day index 0..6 ; ROW()-14 = duty index 0..17
            dstart = f"({EN_AUTO_R0}+(COLUMN()-3)*{NDUTY * AUTO_MAXSLOT}+(ROW()-14)*{AUTO_MAXSLOT})"
            req = f"SUM(OFFSET(Engine!$D$1,{dstart}-1,0,{AUTO_MAXSLOT},1))"
            got = f"SUMPRODUCT(--(OFFSET(Engine!$E$1,{dstart}-1,0,{AUTO_MAXSLOT},1)<>\"\"))"
            return f"{req}>{got}"
        ws.conditional_formatting.add(grid, FormulaRule(formula=[short_expr()], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        ws.conditional_formatting.add("C13:I13", FormulaRule(formula=["C13=TODAY()"], fill=cffill(GOLD), font=Font(color=NAVY, bold=True)))

        # ---- copy box: tab-separated block, ready to paste as values into the week ----
        put(ws, "B33", "COPY BOX", f=font(11, True, NAVY))
        put(ws, "E33", "select B35:H52, copy, then Paste Special > Values into cell C (first duty row) of the week - "
                       "columns line up with Mon slot1 / Tue slot1 ... one value per weekday, plus Sat and Sun",
            f=font(8, False, MUTED, True))
        ws.merge_cells("E33:I33")
        # The week grid stores 3 weekday slots per day; the copy box gives slot-1..3 joined? No - to paste cleanly we
        # emit the three weekday slot columns explicitly is 15 cols wide. Keep it simple: emit exactly the year-sheet
        # layout C..Z (24 cols) for the 18 duty rows, reading each slot cell.
        put(ws, "B34", "Paste target: year sheet, first duty cell of the week (top-left).", f=font(8, False, MUTED, True))
        # year sheet duty columns per day: SLOT_COLS mapping; produce a value per grid column C(3)..Z(26)
        grid_cols = []
        for d in range(1, 8):
            for c in SLOT_COLS[d]:
                grid_cols.append((d, SLOT_COLS[d].index(c)))
            # note column stays blank
            grid_cols.append(("note", 0))
        for j in range(1, NDUTY + 1):
            r = 35 + j - 1
            out_c = 2  # start writing at B so the block is B35:.. but paste target is C; we want first value at the col that maps to C
            # Build values across the 24 physical columns C..Z of the year grid
            col_phys = 3
            for d in range(1, 8):
                for si, c in enumerate(SLOT_COLS[d]):
                    day_start = EN_AUTO_R0 + (d - 1) * NDUTY * AUTO_MAXSLOT + (j - 1) * AUTO_MAXSLOT
                    src = f"Engine!$E${day_start + si}"
                    put(ws, f"{L(col_phys)}{r}", f'=IF({src}="","",{src})', f=font(8), al=CENTER, border=BORDER_H)
                    col_phys += 1
                # note column - leave blank so paste does not overwrite notes
                put(ws, f"{L(col_phys)}{r}", None, border=BORDER_H)
                col_phys += 1
        put(ws, "B54", "The copy box mirrors the exact column layout of the week grid, so a values-paste lands each name in the right slot and leaves the Notes columns untouched.",
            f=font(8, False, MUTED, True))
        ws.merge_cells("B54:AB54")
        ws.freeze_panes = "A4"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_area = "A1:I31"
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        return ws

    # ---- Work Pack ---------------------------------------------------------
    def build_work_pack(self):
        """Extra work (WOCs) logged as it comes up, scheduled automatically from
        how long each task is and how flexible it is."""
        ws = self.wb.create_sheet("Work Pack")
        ws.sheet_properties.tabColor = "0B6E6E"
        ws.sheet_view.showGridLines = False
        C = EN_CTRL
        E = lambda key: f"Engine!$B${C[key]}"
        INPUT = "FFFBE6"
        R0, N = WP_R0, WP_N
        for c, w in zip("ABCDEFGHIJKL", (2, 7, 6, 40, 15, 6, 17, 11, 11, 30, 5, 2)):
            ws.column_dimensions[c].width = w
        self.header_bar(ws, "WORK PACK  ·  extra work (WOCs), scheduled for you",
                        "Log work as it comes up. Say how long it is and how flexible it is, and the planner finds who is free and when.", 12)
        self.nav_link(ws, "J1", "◀ Dashboard", "#'Dashboard'!A1")

        yr, wk = E("year"), E("week")
        col = lambda c: f"$${c}"
        yrs, wks = f"$B${R0}:$B${R0 + N - 1}", f"$C${R0}:$C${R0 + N - 1}"
        days, sts = f"$F${R0}:$F${R0 + N - 1}", f"$I${R0}:$I${R0 + N - 1}"
        placed = f"Engine!$J${EN_TASK_R0}:$J${EN_TASK_R0 + NTASK - 1}"
        otdays = f"SUM(Engine!$T${EN_TEAM_R0}:$Z${EN_TEAM_R0 + NSTAFF - 1})"

        put(ws, "B5", '="THIS WEEK:  W"&' + wk + '&"  "&' + yr, f=font(11, True, NAVY))
        tiles = [
            ("B", "ITEMS", f'=COUNTIFS({yrs},{yr},{wks},{wk})', "0"),
            ("C", "DAYS", f'=SUMIFS({days},{yrs},{yr},{wks},{wk})', "0.0"),
            ("D", "OPEN", f'=SUMIFS({days},{yrs},{yr},{wks},{wk},{sts},"<>Done")', "0.0"),
            ("E", "PLACED", f'=SUM({placed})', "0.0"),
            ("F", "SHORT", f'=MAX(0,SUMIFS({days},{yrs},{yr},{wks},{wk},{sts},"<>Done")-SUM({placed}))', "0.0"),
            ("G", "OT DAYS", f'={otdays}', "0"),
        ]
        for c, title, f, nf in tiles:
            put(ws, f"{c}6", title, f=font(8, True, "D9E1F2"), bg=NAVY2, al=CENTER)
            put(ws, f"{c}7", f, f=font(14, True, WHITE), bg=NAVY2, al=CENTER, nf=nf)
        put(ws, "H6", "", bg=NAVY2)
        put(ws, "H7", '=IF(F7=0,"all placed","short")', f=font(9, True, WHITE), bg=NAVY2, al=CENTER)
        put(ws, "I6", "", bg=NAVY2)
        put(ws, "I7", "", bg=NAVY2)
        ws.row_dimensions[6].height = 14
        ws.row_dimensions[7].height = 26
        ws.conditional_formatting.add("F7", CellIsRule(operator="greaterThan", formula=["0"], fill=cffill("C00000")))
        ws.conditional_formatting.add("F7", CellIsRule(operator="equal", formula=["0"], fill=cffill(GOOD_INK)))
        ws.conditional_formatting.add("H7", FormulaRule(formula=['$F$7=0'], fill=cffill(GOOD_INK)))
        ws.conditional_formatting.add("H7", FormulaRule(formula=['$F$7>0'], fill=cffill("C00000")))

        put(ws, "B9", "Add a row as work comes up. Days = how long it takes. Flexibility = whether it has to be a weekday, "
                      "can be any day, or is weekend overtime work. Leave it blank to follow the work type's Setup setting. "
                      "Leave Assigned to blank and the planner suggests someone; type a name to override it.",
            f=font(8, False, MUTED, True))
        ws.merge_cells("B9:J9")
        ws.row_dimensions[9].height = 22
        hdr = dict(f=font(9, True, WHITE), bg=NAVY, al=CENTER, border=BORDER)
        for c, t in (("B", "Year"), ("C", "Week"), ("D", "Work / WOC"), ("E", "Work type"), ("F", "Days"),
                     ("G", "Flexibility"), ("H", "Assigned to"), ("I", "Status"), ("J", "Suggested (auto)")):
            put(ws, f"{c}11", t, **hdr)
        ws["D11"].alignment = LEFT
        ws.row_dimensions[11].height = 20
        eng = lambda c: f"Engine!${c}${EN_TASK_R0}:${c}${EN_TASK_R0 + NTASK - 1}"
        for i in range(N):
            r = R0 + i
            shade = INPUT if i % 2 == 0 else "FBF6E4"
            for c in "BCDEFGHI":
                put(ws, f"{c}{r}", None, f=font(9), bg=shade, al=(LEFT if c == "D" else CENTER),
                    border=BORDER_H, locked=False)
            ws[f"F{r}"].number_format = '0.0;;""'
            # rank of this row within its week (drives which scheduler slot it uses)
            put(ws, f"K{r}",
                f'=IF(OR($B{r}="",$C{r}="",$D{r}=""),"",IF(AND($B{r}={yr},$C{r}={wk}),'
                f'COUNTIFS($B${R0}:$B{r},{yr},$C${R0}:$C{r},{wk},$D${R0}:$D{r},"?*"),""))',
                f=font(8, False, MUTED), al=CENTER)
            put(ws, f"J{r}",
                f'=IF($K{r}="","",IF($K{r}>{NTASK},"too many tasks this week",'
                f'IF(INDEX({eng("G")},$K{r})="","no-one free",'
                f'INDEX({eng("G")},$K{r})&IF(INDEX({eng("H")},$K{r})=1," *","")'
                f'&IF(INDEX({eng("I")},$K{r})=""," (no free day)"," · "&INDEX({eng("I")},$K{r}))'
                f'&IF(INDEX({eng("J")},$K{r})<N($F{r})," - only "&INDEX({eng("J")},$K{r})&" of "&N($F{r})&" days","")'
                f'&IF(N(INDEX({eng("S")},$K{r}))>=6,"  [!] "&INDEX({eng("S")},$K{r})&" days this week",""))))',
                f=font(9, True, GOOD_INK), bg=shade, al=LEFT, border=BORDER_H)
            ws.row_dimensions[r].height = 15
        # worked example
        for c, v in (("B", 2027), ("C", 1), ("D", "EXAMPLE - replace: WOC 12345 additional contamination survey, Bldg 21"),
                     ("E", "Surveys"), ("F", 1), ("G", "Any day"), ("I", "Not started")):
            cell = put(ws, f"{c}{R0}", v, f=font(9, False, (MUTED if c == "D" else INK), italic=(c == "D")),
                       bg=INPUT, al=(LEFT if c == "D" else CENTER), border=BORDER_H, locked=False)
        ws[f"F{R0}"].number_format = '0.0;;""'

        dvs = [
            (DataValidation(type="list", formula1="=Setup!$K$33:$K$36", allow_blank=True), "B"),
            (DataValidation(type="whole", operator="between", formula1="1", formula2="53", allow_blank=True,
                            error="Enter a week number from 1 to 53.", errorTitle="Week"), "C"),
            (DataValidation(type="list", formula1='=OFFSET(Setup!$K$6,0,0,MAX(1,COUNTIF(Setup!$K$6:$K$23,"?*")),1)', allow_blank=True), "E"),
            (DataValidation(type="decimal", operator="between", formula1="0", formula2="10", allow_blank=True,
                            error="Enter the number of days, 0 to 10.", errorTitle="Days"), "F"),
            (DataValidation(type="list", formula1='"Weekday only,Any day,Weekend (overtime)"', allow_blank=True), "G"),
            (DataValidation(type="list", formula1='=OFFSET(Setup!$B$6,0,0,MAX(1,COUNTIF(Setup!$B$6:$B$29,"?*")),1)', allow_blank=True), "H"),
            (DataValidation(type="list", formula1='"Not started,In progress,Done"', allow_blank=True), "I"),
        ]
        for dv, c in dvs:
            ws.add_data_validation(dv)
            dv.add(f"{c}{R0}:{c}{R0 + N - 1}")

        body = f"B{R0}:J{R0 + N - 1}"
        ws.conditional_formatting.add(body, FormulaRule(formula=[f'$I{R0}="Done"'], font=Font(color=MUTED, italic=True, strike=True)))
        ws.conditional_formatting.add(body, FormulaRule(formula=[f'AND($B{R0}={yr},$C{R0}={wk},$I{R0}<>"Done")'], fill=cffill("E7F3EF")))
        sug = f"J{R0}:J{R0 + N - 1}"
        ws.conditional_formatting.add(sug, FormulaRule(formula=[f'OR($J{R0}="no-one free",ISNUMBER(SEARCH("no free day",$J{R0})))'],
                                                       fill=cffill(BAD_FILL), font=Font(color=BAD_INK, bold=True)))
        ws.conditional_formatting.add(sug, FormulaRule(formula=[f'ISNUMBER(SEARCH("only ",$J{R0}))'],
                                                       fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        ws.conditional_formatting.add(sug, FormulaRule(formula=[f'ISNUMBER(SEARCH("~*",$J{R0}))'], font=Font(color=TRAINEE_INK, bold=True)))
        ws.conditional_formatting.add(sug, FormulaRule(formula=[f'ISNUMBER(SEARCH("days this week",$J{R0}))'],
                                                       fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        put(ws, f"B{R0 + N + 2}",
            "The planner schedules the first 20 tasks in a week. Flexibility blank = follow the work type's Setup setting; "
            "'Any day' lets a task use approved weekend overtime; 'Weekday only' keeps it Mon-Fri. "
            "[!] against a suggestion means that person is then committed 6 or more days that week, counting duties and tasks.",
            f=font(8, False, MUTED, True))
        ws.column_dimensions["K"].hidden = True
        ws.freeze_panes = "A12"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.protection.sheet = True
        ws.protection.formatColumns = False
        ws.protection.formatRows = False
        return ws

    # ---- Print Week --------------------------------------------------------
    def build_print_week(self):
        ws = self.wb.create_sheet("Print Week")
        ws.sheet_properties.tabColor = "5B6B8C"
        ws.sheet_view.showGridLines = False
        C = EN_CTRL
        E = lambda key: f"Engine!$B${C[key]}"
        for c, w in zip("ABCDEFGHIJ", (2, 22, 15, 15, 15, 15, 15, 12, 12, 2)):
            ws.column_dimensions[c].width = w
        put(ws, "B1", '="ESG TEAM ROSTER  -  WEEK "&' + E("week") + '&"   ·   "&TEXT(' + E("start") + ',"ddd d mmm")&" – "&TEXT(' + E("start") + '+6,"ddd d mmm yyyy")',
            f=font(16, True, NAVY), al=Alignment(vertical="center"))
        ws.merge_cells("B1:I1")
        ws.row_dimensions[1].height = 30
        put(ws, "B2", '="Printed "&TEXT(TODAY(),"d mmm yyyy")&"   ·   this page mirrors the planning week chosen on the Dashboard   ·   * = trainee"',
            f=font(9, False, MUTED, True))
        self.nav_link(ws, "I2", "◀ Dashboard", "#'Dashboard'!A1", color=ACCENT)
        put(ws, "B4", "Duty", f=font(11, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(2 + d)}4", f"={E('start')}+{d - 1}", f=font(11, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, nf="ddd d mmm", border=BORDER)
        ws.row_dimensions[4].height = 24
        for j in range(1, NDUTY + 1):
            r = 4 + j
            rr = EN_ROSTER_R0 + j - 1
            zebra = PANEL if j % 2 == 0 else WHITE
            put(ws, f"B{r}", f"=Engine!$B${rr}", f=font(11, True, NAVY), bg=zebra, al=LEFT, border=BORDER)
            for d in range(1, 8):
                cells = [f"Engine!${L(c)}${rr}" for c in SLOT_COLS[d]]
                joined = "&\" \"&".join(cells)
                put(ws, f"{L(2 + d)}{r}", f'=IF($B{r}="","",SUBSTITUTE(TRIM(SUBSTITUTE({joined}," *","*"))," ",", "))',
                    f=font(11, True, INK), bg=zebra, al=Alignment(horizontal="center", vertical="center", wrap_text=True), border=BORDER)
            ws.row_dimensions[r].height = 24
        covrow = f"({EN_COV_R0}+(COLUMN()-3)*{NDUTY}+ROW()-5)"
        ws.conditional_formatting.add("B5:I22", FormulaRule(formula=['$B5=""'], fill=cffill(WHITE), font=Font(color=WHITE), border=Border(), stopIfTrue=True))
        ws.conditional_formatting.add("C5:I22", FormulaRule(formula=[f"N(INDEX(Engine!$G:$G,{covrow}))>0"], fill=cffill(GAP_FILL), font=Font(color=GAP_INK, bold=True)))
        ws.conditional_formatting.add("C5:I22", FormulaRule(formula=[f"AND(COLUMN()>=8,N(INDEX(Engine!$E:$E,{covrow}))=0)"], fill=cffill(NA_FILL)))
        # away list
        put(ws, "B25", "AWAY THIS WEEK", f=font(12, True, NAVY))
        put(ws, "B26", "Person", f=font(10, True, WHITE), bg=NAVY, al=LEFT, border=BORDER)
        for d in range(1, 8):
            put(ws, f"{L(2 + d)}26", DAY_NAMES[d - 1], f=font(10, True, WHITE), bg=(NAVY if d <= 5 else "5B6B8C"), al=CENTER, border=BORDER)
        for k in range(1, NSTAFF + 1):
            r = 26 + k
            tr = EN_TEAM_R0 + k - 1
            zebra = PANEL if k % 2 == 0 else WHITE
            put(ws, f"B{r}", f'=IF(Engine!$B${tr}="","",Engine!$B${tr})', f=font(10, True, INK), bg=zebra, al=LEFT, border=BORDER)
            for d in range(1, 8):
                put(ws, f"{L(2 + d)}{r}", f"=Engine!${L(3 + d)}${tr}", f=font(10, True), bg=zebra, al=CENTER, border=BORDER)
            ws.row_dimensions[r].height = 16
        ws.conditional_formatting.add("B27:I50", FormulaRule(formula=['$B27=""'], fill=cffill(WHITE), font=Font(color=WHITE), border=Border(), stopIfTrue=True))
        for s in range(1, NSTATUS + 1):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            sc = f"Setup!$B${SU_STATUS_R0 + s - 1}"
            ws.conditional_formatting.add("C27:I50", FormulaRule(formula=[f'AND({sc}<>"",C27={sc})'], fill=cffill(fl), font=Font(color=ink, bold=True)))
        put(ws, "B52", '=IF(COUNTIF(Setup!$B$33:$B$40,"?*")=0,"","Codes: "&IF(Setup!$B$33="","",Setup!$B$33&" = "&Setup!$C$33)&IF(Setup!$B$34="","","   ·   "&Setup!$B$34&" = "&Setup!$C$34)&IF(Setup!$B$35="","","   ·   "&Setup!$B$35&" = "&Setup!$C$35)&IF(Setup!$B$36="","","   ·   "&Setup!$B$36&" = "&Setup!$C$36)&IF(Setup!$B$37="","","   ·   "&Setup!$B$37&" = "&Setup!$C$37)&IF(Setup!$B$38="","","   ·   "&Setup!$B$38&" = "&Setup!$C$38))',
            f=font(8, False, MUTED, True))
        ws.print_area = "B1:I52"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_margins.left = ws.page_margins.right = 0.4
        ws.protection.sheet = True
        return ws

    # ---- Guide -------------------------------------------------------------
    def build_guide(self):
        ws = self.wb.create_sheet("Guide")
        ws.sheet_properties.tabColor = "BF8F00"
        self.header_bar(ws, "GUIDE  ·  how the planner works", "Five minutes here saves an hour later.", 12)
        self.nav_link(ws, "K1", "◀ Dashboard", "#'Dashboard'!A1")
        ws.column_dimensions["A"].width = 2
        ws.column_dimensions["B"].width = 4
        ws.column_dimensions["C"].width = 110
        sections = [
            ("WHAT IS WHERE", [
                "Dashboard - pick the planning week; see coverage, gaps with suggested cover, who is around, jump anywhere, and press ⚡ Auto-fill.",
                "Auto Plan - a complete roster the workbook generates for the planning week from every rule. Review, then paste into the week.",
                "2027 / 2028 / 2029 / 2030 - one block per ISO week. Top half: duties x days, three slots per weekday, one at the weekend. Bottom half: team availability.",
                "Setup - the team, the duties, the competency (SQEP) matrix, status codes and the planning years. Change things here and everything follows.",
                "Print Week - the planning week as a clean one-page roster for the noticeboard, with who is away underneath.",
                "My Rota - six weeks for one person, ready to print or send. Also shows how the year's duty days are shared.",
                "Year View - the whole year on one screen: weekday gaps per duty per week (click a week to open it), then absence, training, workload and approved weekend overtime per person.",
                "Work Pack - the extra work (WOCs) in each week's pack, logged as it comes up. Say how long each task is and how flexible it is, and the planner works out who does it and on which days.",
                "Engine (hidden) - the calculations behind the dropdowns and the Dashboard. Nothing to edit. Unhide it if you are curious.",
            ]),
            ("PLANNING A WEEK IN FIVE STEPS", [
                "1.  On the Dashboard set the Year and Week number (or set 'Follow today automatically' to Y once we are in 2027). Click 'Open week'.",
                "2.  In the block's lower half, mark anyone who is away: click a day against a person and pick a status code (AL, HRA, T, S, OS, HD...). Leave blank = available.",
                "3.  In the upper half, click a duty slot and pick from the dropdown. Only people who are SQEP for that duty and available that day are listed; trainees carry a *.",
                "4.  Watch the right-hand 'Gaps / Cover' column and the Dashboard's 'Gaps & suggested cover' list. Yellow cells are days still short of the minimum.",
                "5.  Red cells mean something is wrong: a person is not qualified for that duty, or is rostered on a day they are marked unavailable. Fix them before you publish.",
            ]),
            ("THE AUTOMATIONS", [
                "Auto Plan (the big one): the workbook builds a whole week for you from the rules - one qualified, available person per duty per weekday, minimums met, no-one double-booked, load shared, and the same person kept on a duty Monday to Friday (if they are off midweek a stand-in covers just that day, then they get it back). Open the Auto Plan sheet (or the ⚡ Auto-fill box on the Dashboard), review it, and paste it into the week. Amber = a slot the rules could not fill.",
                "Ad-hoc task scheduling: work that turns up during the week goes on the Work Pack sheet. Give it a work type, how many days it takes, and its flexibility (Weekday only / Any day / Weekend (overtime), or leave blank to follow the work type's Setup setting). The planner then finds someone qualified with that many free days among the days the task is allowed on, prefers whoever is least committed, takes the earliest free days, and never double-books. It says 'no-one free' rather than inventing capacity, and marks [!] if the person would end up on 6 or more days that week.",
                "Task flexibility beats the duty setting, which is the point: Interactions is weekday work most of the time, but a particular interaction that could be done at a weekend just gets set to Any day on its own row.",
                "Weekend overtime: weekend working is never required and is never planned for you. Mark OT against a person in the Sat or Sun availability cell once the team leader has approved their overtime. Only then will the auto-planner or the dropdowns offer them weekend work, and only on flexible duties.",
                "Fill priority follows the duty order on Setup: the auto-planner works down the list, so put your hardest-to-cover duties near the top and they get first pick of scarce staff.",
                "Dropdowns are context-aware for the planning week: qualified + available people only, SQEP first, trainees after with a *.",
                "Gap detection on every week, every year: each duty has a minimum per weekday (Setup). Short weekdays are shaded yellow and each duty row shows how many weekdays are short. Saturday and Sunday are never counted as gaps, because weekend working is optional overtime.",
                "Suggested cover: for every gap in the planning week the Dashboard proposes the least-loaded eligible person (SQEP before trainee, then fewest days already rostered).",
                "Conflict checks everywhere: rostered while unavailable, or not qualified, is flagged red in the slot, in the person's row, and counted on the Dashboard.",
                "Colour follows status: a rostered person's initials take the colour of their status that day (e.g. blue when they are on a course), so partial availability is visible in the roster itself.",
                "Today's column is tinted; the current week's banner turns green; the planning week's banner turns orange. Past weeks are dimmed.",
                "Per person, per week: days rostered and conflicts. Days rostered turns amber at 6 or more, so a six- or seven-day stretch is visible before you publish. Per day: how many active people are on site.",
                "Everything is formula-driven: no macros needed, and it works in Excel desktop, Excel Online, LibreOffice and Google Sheets. The optional macros only add one-click buttons on top.",
            ]),
            ("CHANGING THE TEAM OR THE DUTIES", [
                "New person: add initials on Setup (next blank row), set Active = Y and tick their competencies. They appear in every week's availability grid and in dropdowns.",
                "Someone leaves: set Active = N. Their history stays; they drop out of dropdowns and counts. Do not delete or reuse the initials in the same year.",
                "New duty: type it in the next blank duty row on Setup, set its minimum per weekday and whether it is flexible / overtime work, then tick who is qualified. It appears in every week.",
                "Rename anything on Setup and every week, dropdown and dashboard updates. Rostered initials are stored as text, so renaming initials needs a find/replace on the year sheets.",
                "Status codes: rename, describe, and decide whether each one makes a person unavailable. Row 3 is also counted as 'training' on the Year View.",
                "Copy a week forward: select the duty grid of a planned week (columns C to Z, the 18 duty rows), copy, and paste into the same rows of the next block. Then adjust - the checks re-run instantly.",
            ]),
            ("IF YOU INSTALL THE MACROS", [
                "Build the year: one press fills every week of the year shown on the Dashboard. It works week by week, re-planning each one against that week's leave, so a year takes a minute or two.",
                "The past is never touched. Every macro skips any day dated before today, so running Build the year in, say, July re-plans from today onwards and leaves everything already worked exactly as it was.",
                "It asks first whether to replace weeks that are already planned, or to fill only the empty ones - so a year you have already hand-tuned is safe.",
                "Only duty slots are written. Leave, training, OT approvals, notes and the Work Pack are never altered.",
            ]),
            ("GOOD TO KNOW", [
                "Sheets are protected without a password so that formulas cannot be typed over by accident. Review > Unprotect Sheet lifts it in one click.",
                "The dropdown lists are computed for the planning week chosen on the Dashboard. If you type into a different week the list you see belongs to the planning week - the red/yellow checks still apply to every week, so nothing slips through.",
                "Weeks are ISO weeks (Monday to Sunday, week 1 contains 4 January). 2027-2030 all have 52 weeks; block 53 is there for years that need it.",
                "Printing: each year sheet is set to one week per page, landscape, with the navigation bar repeated. The Dashboard and My Rota fit on one page.",
                "Weekend slots are greyed out for weekday-only duties - overtime can only pick up flexible work (Surveys, Greenstream, Radwaste, Instruments and anything else you mark Flexible on Setup).",
                "Someone entered in a weekend slot without OT marked against them that day turns amber: the approval has not been recorded.",
                "Migrated from the previous planner: the SQEP matrix, trainee flags, the team, and all AL/HRA/T marks and rostered initials that were present. Full names were not in the old file - add them on Setup.",
            ]),
        ]
        r = 4
        for title, lines in sections:
            put(ws, f"B{r}", title, f=font(11, True, NAVY))
            r += 1
            for t in lines:
                put(ws, f"B{r}", "•", f=font(9, True, ACCENT), al=Alignment(horizontal="center", vertical="top"))
                put(ws, f"C{r}", t, f=font(9), al=WRAP)
                ws.row_dimensions[r].height = 15 if len(t) < 105 else 28
                r += 1
            r += 1
        put(ws, f"B{r}", "LEGEND", f=font(11, True, NAVY))
        r += 1
        for s in range(1, 7):
            code, desc, un, fl, ink = STATUS_DEFAULTS[s - 1]
            put(ws, f"B{r}", code, f=font(9, True, ink), bg=fl, al=CENTER)
            put(ws, f"C{r}", f"{desc}   ({'unavailable' if un == 'Y' else 'still available'})", f=font(9))
            r += 1
        for code, desc, fl, ink in (("gap", "day is short of the minimum for that duty", GAP_FILL, GAP_INK),
                                    ("red", "not SQEP for the duty, or rostered while unavailable", BAD_FILL, BAD_INK),
                                    ("today", "today's column", TODAY_FILL, "7F6000"),
                                    ("weekday only", "weekend slot for work that is tied to weekdays, so overtime cannot pick it up", NA_FILL, NA_INK)):
            put(ws, f"B{r}", code, f=font(9, True, ink), bg=fl, al=CENTER)
            put(ws, f"C{r}", desc, f=font(9))
            r += 1
        put(ws, f"B{r}", "KH *", f=font(9, True, TRAINEE_INK, italic=True), al=CENTER)
        put(ws, f"C{r}", "trainee for that duty - roster alongside a SQEP person", f=font(9))
        ws.page_setup.orientation = "portrait"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.protection.sheet = True
        return ws

    # ---- names -------------------------------------------------------------
    def add_names(self):
        from openpyxl.workbook.defined_name import DefinedName
        names = {
            "Initials": f"Setup!$B$6:$B${SU_TEAM_R0 + NSTAFF - 1}",
            "DutyNames": f"Setup!$K$6:$K${SU_DUTY_R0 + NDUTY - 1}",
            "SQEP": f"Setup!$O$6:$AL${SU_DUTY_R0 + NDUTY - 1}",
            "StatusCodes": f"Setup!$B${SU_STATUS_R0}:$B${SU_STATUS_R0 + NSTATUS - 1}",
            "ActiveYear": f"Engine!$B${EN_CTRL['year']}",
            "ActiveWeek": f"Engine!$B${EN_CTRL['week']}",
        }
        for n, ref in names.items():
            self.wb.defined_names[n] = DefinedName(n, attr_text=ref)

    def build(self):
        self.build_setup()
        self.build_engine()
        for y in YEARS:
            self.build_year(y)
        self.build_dashboard()
        self.build_my_rota()
        self.build_leave()
        self.build_auto_plan()
        self.build_work_pack()
        self.build_print_week()
        self.build_guide()
        self.add_names()
        order = ["Dashboard", "2027", "2028", "2029", "2030", "Auto Plan", "Print Week", "My Rota", "Year View", "Work Pack", "Setup", "Guide", "Engine"]
        self.wb._sheets = [self.wb[n] for n in order]
        self.wb.active = 0
        self.wb.properties.title = "ESG Team Planner 2027-2030"
        self.wb.properties.creator = "ESG"
        return self.wb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--blank", action="store_true",
                    help="Build an empty planner: keep the team, duties and SQEP matrix, "
                         "but carry over none of the old planner's leave marks, rostered "
                         "names or notes.")
    a = ap.parse_args()
    src = read_source(a.source)
    if a.blank:
        for y in src["years"].values():
            y["avail"], y["assigns"], y["notes"] = {}, {}, {}
    wb = Builder(src).build()
    wb.save(a.out)
    print("saved", a.out)


if __name__ == "__main__":
    main()
