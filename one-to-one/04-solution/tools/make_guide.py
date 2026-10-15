"""Builds the single, self-contained finalisation guide (Markdown + Word) from the verified documents.

    python3 04-solution/tools/make_guide.py        (from the one-to-one folder or anywhere)

Tests, procedures, troubleshooting, the welcome email and accepted risks are extracted from their source files, so the
guide can't drift from them. Output: one-to-one/FINALISATION_GUIDE.md and one-to-one/ESG-1to1-Finalisation-Guide.docx
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))   # one-to-one/


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def section(text, start, end=None):
    """Lines from the heading/line starting with `start` up to (not including) the next line starting with `end`."""
    lines, out, on = text.split('\n'), [], False
    for ln in lines:
        if not on and ln.startswith(start):
            on = True
            continue
        if on and end is not None and ln.startswith(end):
            break
        if on:
            out.append(ln)
    if not out:
        raise SystemExit('section not found: ' + start)
    return '\n'.join(out).strip('\n')


def delink(md):
    """Self-contained: keep the text of internal links, drop the target."""
    return re.sub(r'\[([^\]]+)\]\((?!https?:)[^)]+\)', r'\1', md)


def add_result_columns(table_md):
    out = []
    for ln in table_md.split('\n'):
        if ln.startswith('|---'):
            out.append(ln + '---|---|---|')
        elif ln.startswith('| #'):
            out.append(ln + ' Result | Date | Initials |')
        elif ln.startswith('| '):
            out.append(ln + '  |  |  |')
        else:
            out.append(ln)
    return '\n'.join(out)


def demote(md, by=1):
    return re.sub(r'^(#+) ', lambda m: '#' * (len(m.group(1)) + by) + ' ', md, flags=re.M)


plan = read('IMPLEMENTATION_PLAN.md')
H_intro = section(plan, '## H. Testing', '### Functional tests')
F_table = section(plan, '### Functional tests', '### Privacy and bypass tests')
P_table = section(plan, '### Privacy and bypass tests', '---')
risks = '\n'.join(l for l in section(plan, '### J.3 Residual risks', '---').split('\n') if l.startswith('|'))
cfg = read('CONFIG_REFERENCE.md')
names = section(cfg, '## 2. Names you must never change', '## 3.')
procedures = section(cfg, '## 4. Operating procedures', '## 5.')
cfg_trouble = section(cfg, '## 6. Troubleshooting', '## 7.')
imp = read('04-solution/IMPORT_GUIDE.md')
imp_trouble = section(imp, '## 7. Troubleshooting', '## 8.')
legacy = section(imp, '## 6. Fallback: legacy packages', '## 7.')
setup_does = section(imp, '**What setup does:**', '**What setup does not do.**')
welcome = section(read('03-flows/WELCOME_EMAIL.md'), '---')
fix_prompt = section(read('NEXT_STEPS.md'), '## If something fails')
fix_prompt = fix_prompt.split('```')[0] + '```' + fix_prompt.split('```')[1] + '```'   # the prompt only

GUIDE = r'''# ESG Monthly Technician 1-to-1 — Finalisation Guide

**From the end of Stage 0B to a live system, then running it month to month.** This document is self-contained: you don't need any other file to follow it. Tick each box as you go.

Version: system v4.0.0 (frontend) · solution 1.0.0.0 · guide dated 15-Oct-2026

---

## 1. Where you are, and what "complete" means

**Already done:**

- **Stage 0A/0B passed** in the live tenant:
  - the private site exists, with the `OneToOne` page and the Welcome web part;
  - the `1-to-1 Technicians` group exists;
  - the `1-to-1 Edit` and `1-to-1 Read` permission levels exist.
- **Everything to install is built and verified offline:**
  - frontend: 72 automated checks;
  - flows: simulated end to end, 110 checks;
  - an independent review fixed 17 defects.

**Not yet proven:** nothing has run in your tenant yet.

> **The system is fully implemented when Phase F (go-live) is done and every privacy test (P1–P20) in Phase C has passed.**

| Phase | What | Who's involved | Time |
|---|---|---|---|
| 0 | Get and check the files | you | 5 min |
| A | Import, set up, see the frontend yourself | you only | ≈ 1 h |
| B | Walk through it as a technician | you + Test A + Test B | 1–2 h |
| C | Security and functional test record | you + test accounts (+ 2 IT questions) | 6–8 h |
| D | Clean down | you | 30 min |
| E | Prepare and invite the real team | you | 1–2 h |
| F | Go live | you | 15 min |
| G | First month, then routine | you | ongoing |

---

## 2. What you need

**The three system files** (nothing else goes into SharePoint or Power Automate):

| File | Goes to |
|---|---|
| `ESGOneToOne_1_0_0_0_unmanaged.zip` | Power Automate → **Solutions → Import solution**. Contains the four flows; the setup flow creates the lists. |
| `one-to-one.html` | SharePoint → *Welcome Web Part - Custom Layouts* library |
| `one-to-one.js` | Same library, alongside the `.html` |

**Fallback only:** if your environment can't import solutions (no Dataverse), use `legacy-package-builder.html` instead (§4.8).

**Accounts:**

- **you**, the Team Leader: site owner **and Site Collection Administrator**;
- **Test A** and **Test B**: two test technician accounts with mailboxes.

## Phase 0 — Get and check the files (5 min)

- [ ] **Right zip.** Open the zip, then open `solution.xml` in Notepad. It must contain `<RootComponent type="380" schemaName="esg_SiteUrl"`. If it doesn't, you have an older download: get the latest one.
- [ ] **Right frontend.** You have `one-to-one.html` and `one-to-one.js` (v4.0.0). After installing, the sidebar footer must show **v4.0.0**.
- [ ] **Unchanged files.** Transfer them the usual approved way. Don't open and re-save them in Word.

---

## 4. Phase A — Import, set up and see the frontend yourself (≈ 1 h, nobody else involved)

### 4.1 Tidy up Stage 0

- [ ] **Site contents:** delete the `ZZProbe…` test lists.
- [ ] **Welcome Web Part - Custom Layouts:** delete `probe-0a*` and `probe-0b*`.
- [ ] **Keep** the site, the `OneToOne` page, the `1-to-1 Technicians` group and the two permission levels.
- [ ] **Check:**
  - The site's regional settings are **English (United Kingdom)** and time zone **(UTC) Dublin, Edinburgh, Lisbon, London**. They're under Site information → View all site settings → Regional settings.
  - You are **Site Collection Administrator**.

### 4.2 Import the solution (10 min)

1. [ ] Go to **make.powerautomate.com**, signed in as yourself.
2. [ ] Top right: pick the environment IT named for the flows.
3. [ ] Left menu: **Solutions**.
   - If it asks to create a **Dataverse database**, or *Solutions* is missing, use §4.8 instead.
4. [ ] **Import solution → Browse →** `ESGOneToOne_1_0_0_0_unmanaged.zip` → **Next → Next**.
5. [ ] **Connections.** For each of the three, pick yours or click **+ New connection**, signed in as you:

   | Connection reference | Connector |
   |---|---|
   | ESG 1-to-1 SharePoint | SharePoint |
   | ESG 1-to-1 Outlook | Office 365 Outlook |
   | ESG 1-to-1 Office 365 Users | Office 365 Users |

6. [ ] **Environment variables:**

   | Variable | Value |
   |---|---|
   | ESG 1-to-1 Site URL | `https://<tenant>.sharepoint.com/sites/<site>`, the full site address with **no trailing slash** |
   | ESG 1-to-1 Team Leader email | your email address |

7. [ ] **Import.** Wait for *"imported successfully"* (1–2 minutes). If there's an error, copy the text from **Solutions → History**.

### 4.3 Run the setup flow (5 min)

1. [ ] **Solutions → ESG 1-to-1 → ESG 1-to-1 | 0 Setup (run once) → Run → Run flow.** If asked, confirm the connections (**Continue**).
2. [ ] Wait for **Succeeded** (2–4 minutes).
3. [ ] Your inbox: **"ESG 1-to-1 setup: complete"**.
   - If it says *"complete with items to check"*, fix exactly what the email lists, then run setup again. It is safe to re-run.

**What setup does:**

{SETUP_DOES}

### 4.4 Check the result (5 min)

- [ ] **Site contents** shows: Technicians, Appraisal Expectations, Monthly Reviews, Manager Reviews, 1-to-1 Settings.
- [ ] Each list → ⚙ → **List settings → Permissions for this list**:
  - Technicians, Appraisal Expectations, Monthly Reviews and Manager Reviews show **only** *Owners – Full Control*;
  - **1-to-1 Settings** shows Owners **and** `1-to-1 Technicians` – Read.
- [ ] **1-to-1 Settings** contains one item, **Bands**.
- [ ] Spot check: Monthly Reviews → List settings → click **Q9FollowUp**. The address ends `Field=Q9FollowUp`, and it has three choices.

### 4.5 Install the frontend (15 min)

1. [ ] **Site contents → Welcome Web Part - Custom Layouts → Upload → Files.** Upload `one-to-one.html` and `one-to-one.js` together. Choose **Replace** if asked.
2. [ ] Open the **OneToOne** page → **Edit**.
   - If the Welcome web part isn't already in a **full-width section**, add one and move the web part into it.
   - Web part **pencil** → **Layout = ESG 1-to-1**. This replaces the probe layout.
   - Greeting, time, weather and search: **off**.
   - **Republish.**
3. [ ] **Site Pages → OneToOne → … → Make homepage.**
4. [ ] **Group permissions.** `1-to-1 Technicians` has **Read on exactly these, nothing more** (set in Stage 0; setup did the last one):
   - the `OneToOne` page;
   - the *Welcome Web Part - Custom Layouts* library;
   - the *Welcome Web Part - Errors* list;
   - the 1-to-1 Settings list.

### 4.6 Your first look

- [ ] Open the site. You should see:
  - a dark **sidebar** with Team overview, Monthly reviews, Expectations, Actions and ⚙ Settings;
  - **Team overview** showing *"No technicians yet"*;
  - **v4.0.0** at the bottom of the sidebar.
- [ ] Click through **Monthly reviews**, **Expectations**, **Actions** and **⚙ Settings**. Expect no errors (empty pages are normal for now).
- [ ] **Expectations:**
  - Add one *Shared* expectation and one *Individual* expectation for yourself. This proves item creation, Yes/No and Person columns work in your tenant.
  - Then **Retire** the Individual one.
- [ ] The sidebar and content fill the page width.
- [ ] **Print / Save as PDF** on a report opens a print window. If not, allow pop-ups for the SharePoint site.

> You can't see the *technician* side with your own account: the page always recognises you as Team Leader. Phase B uses Test A for that.

### 4.7 Turn on flows 1, 2 and 3

- [ ] **Solutions → ESG 1-to-1** → select each flow → **Turn on**:
  - **1 Daily scheduler**
  - **2 Review submitted**
  - **3 Manager decision**

### 4.8 Fallback: no Dataverse (legacy packages)

Only if §4.2 step 3 showed that solutions can't be imported:

{LEGACY}

---

## 5. Phase B — Walk through it as a technician (test accounts only, 1–2 h)

- [ ] **Technicians list → + New** for **Test A**, then again for **Test B**:
  - Title = name;
  - Technician = their account;
  - **Active = Yes**;
  - leave TechnicianAadId blank.
- [ ] **Site permissions → `1-to-1 Technicians` → New → Add users:** Test A and Test B. **Untick "Send an email invitation".**
- [ ] **⚙ Settings:** give each an appraisal date. Use a summer date, e.g. `15-Jul-2027`. Save, reopen, and check it **still shows the same day** (tests F27 and R16).
- [ ] **Power Automate → Flow 1 → Run.** Test A and Test B each get *"Your 1-to-1 for … is ready"*.
  - **Run it again:** no new items, no second email.
- [ ] **As you:** Team overview lists Test A and Test B.
- [ ] **As Test A** (InPrivate window):
  - Open the email link. Their form opens, with only *This month · My appraisal · Appraisal report* in the sidebar.
  - Fill in a few answers → **Save** → reload. The answers are kept.
  - Complete everything → **Submit**. Within about 5 minutes the review becomes read-only.
- [ ] **As you:** *"1-to-1 submitted"* arrives.
  - Open the review. Add feedback per question and a 1–5 rating per expectation.
  - Add **two actions**, each with owner, close-out criteria and deadline.
  - Click **Complete & release**.
- [ ] **As Test A:** *"Feedback … is ready"* arrives. Feedback, ratings and actions are visible; **My appraisal** and **Appraisal report** work.
- [ ] **As Test B:**
  - nothing of Test A's is visible anywhere;
  - opening Test A's link (`?reviewId=` with A's number) shows **"Review not found"**.

---

## 6. Phase C — Security and functional test record (6–8 h, can span several days)

**Pass mark:**

- Every **P** test is mandatory: any failure **blocks go-live** until fixed (§10).
- F tests must pass too.

**Test date.** Tests F13–F20 change the date Flow 1 believes it is:

1. Open Flow 1 → **Edit** → **Initialize varTestDate** → set the value (e.g. `2026-11-20T07:00:00`).
2. **Save**, then **Run**.
3. **Clear the value afterwards and save.**

{H_INTRO}

### 6.1 Functional tests (F1–F30)

{F_TABLE}

### 6.2 Privacy and bypass tests (P1–P20) — all mandatory

{P_TABLE}

### 6.3 Questions for IT (record the answers)

| # | Question | Answer | Date |
|---|---|---|---|
| IT-a | Is *limited-access user permission lockdown mode* **off** for this site? (If it's on, technicians' page calls can fail.) |  |  |
| IT-b | IT-11: does the Welcome web part send any page or list data outside the tenant (licence checks, telemetry)? |  |  |

---

## 7. Phase D — Clean down (30 min)

- [ ] Delete every **test item** in Monthly Reviews and Manager Reviews, and the test expectations.
- [ ] Empty the **site recycle bin**, then the **second-stage recycle bin**.
- [ ] Remove Test A and Test B from the **Technicians** list **and** from the **`1-to-1 Technicians`** group.
- [ ] Flow 1: **Initialize varTestDate** is **empty** (Save).

## 8. Phase E — Prepare and invite the real team (1–2 h)

- [ ] **Expectations page:** enter the real **Shared** expectations and each person's **Individual** ones for **2026/27**.
  - **Maximum 10 per person**; the page shows the count.
  - Expectations entered early for next year are ignored until that appraisal year starts (1 April).
- [ ] **Technicians list:** add each technician:
  - Title;
  - Technician (their account);
  - Active = Yes.
- [ ] **`1-to-1 Technicians` group:** add the same people, with **"Send an email invitation" unticked**.
- [ ] **⚙ Settings:** enter each **appraisal date** (DD-MMM-YYYY) → Save.
- [ ] **Invite.** Send the welcome email below from your own mailbox, or brief the team in person.
  - It only tells them what's coming.
  - Access comes solely through each person's own monthly link, which works only for them.

### 8.1 Welcome email (copy, edit, send)

{WELCOME}

## 9. Phase F — Go live (15 min)

- [ ] **Flow 1 → Run** to start the current month now, or leave it to run automatically at **07:00 on the 1st**.
- [ ] Each technician has **exactly one** review and got **exactly one** email.
- [ ] **Team overview** lists everyone.

> ✔ **The system is fully implemented** when this phase is done and every P test in Phase C passed.

---

## 10. Phase G — First month, then the routine

| When | Check / do |
|---|---|
| Go-live day | Flow 1 run history is green; nobody is missing from Team overview |
| As submissions arrive | *"1-to-1 submitted"* email → open the review → feedback, ratings, actions → **Complete & release** |
| 20th and 27th | Reminders went to anyone who hasn't submitted |
| Next 1st | New month is created; last month's unsubmitted reviews show **Overdue**; use **Close – not submitted** where needed |

### 10.1 Operating procedures

{PROCEDURES}

---

## 11. Troubleshooting

### 11.1 Import and setup

{IMP_TROUBLE}

### 11.2 Day to day

{CFG_TROUBLE}

### 11.3 Getting a fix

{FIX}

---

## 12. Appendix

### 12.1 Names you must never change

{NAMES}

### 12.2 What each flow does

| Flow | Starts | Job |
|---|---|---|
| ESG 1-to-1 \| 0 Setup (run once) | by hand | Creates or completes the lists, columns, indexes, views, permission levels, group, list permissions and the Bands setting. Safe to re-run; never deletes data; emails a summary. |
| ESG 1-to-1 \| 1 Daily scheduler | 07:00 UK daily | Creates each month's reviews, makes them private, emails each technician their own link, sends reminders on the 20th and 27th, and reports problems to you |
| ESG 1-to-1 \| 2 Review submitted | when a technician submits | Locks the review (read-only), stamps the trusted record, emails you |
| ESG 1-to-1 \| 3 Manager decision | when you Complete / Close | Validates, locks, releases your feedback to that technician only, emails them |

### 12.3 Accepted risks (from the implementation plan)

{RISKS}
'''

md = GUIDE
for key, val in {'SETUP_DOES': setup_does, 'LEGACY': demote(legacy, 2), 'H_INTRO': H_intro,
                 'F_TABLE': add_result_columns(F_table), 'P_TABLE': add_result_columns(P_table),
                 'WELCOME': welcome, 'PROCEDURES': procedures, 'IMP_TROUBLE': imp_trouble,
                 'CFG_TROUBLE': cfg_trouble, 'FIX': fix_prompt, 'NAMES': names,
                 'RISKS': '| # | Risk | Mitigation |\n|---|---|---|\n' + '\n'.join(l for l in risks.split('\n')
                                                                               if not l.startswith('| #') and not l.startswith('|---'))}.items():
    md = md.replace('{' + key + '}', val)
md = delink(md)
md = md.replace(' 🔒', '').replace('🔒', '')
# cross-references copied from the source files → this guide's own numbering
for a, b in (('## Phase 0 — Get and check the files', '## 3. Phase 0 — Get and check the files'),
             ("Use this only if §1 showed that solutions can't be imported.\n\n", ''),
             ('Continue at §3 (run flow 0), then §4 and §5.', 'Continue at §4.3 (run the setup flow), then §4.4–§4.7.'),
             ('blocks go-live** until fixed (§10)', 'blocks go-live** until fixed (§11.3)'),
             ('matching `../01-sharepoint/lists.md` exactly', 'matching the agreed list specification exactly'),
             ('Enter both values in step 2.3', 'Enter both values in §4.2 step 6'),
             ('Every internal name in `01-sharepoint/lists.md`', 'Every column name the setup flow created (List settings shows them)')):
    assert a in md, 'cross-reference not found: ' + a
    md = md.replace(a, b)
assert '{' + 'F_TABLE' + '}' not in md and not re.search(r'\{[A-Z_]{4,}\}', md), 'unfilled placeholder'

out_md = os.path.join(ROOT, 'FINALISATION_GUIDE.md')
with open(out_md, 'w', encoding='utf-8') as f:
    f.write(md)

# ---- Word version
docx_md = md.replace('- [ ] ', '- ☐ ')
docx_md = re.sub(r'^(\s*)(\d+)\. \[ \] ', r'\1\2. ☐ ', docx_md, flags=re.M)
tmp = os.path.join(ROOT, '.guide-tmp.md')
with open(tmp, 'w', encoding='utf-8') as f:
    f.write(docx_md)
out_docx = os.path.join(ROOT, 'ESG-1to1-Finalisation-Guide.docx')
subprocess.run(['pandoc', '-f', 'gfm', '-t', 'docx', '-o', out_docx, tmp], check=True)
os.remove(tmp)

from docx import Document  # noqa: E402
from docx.enum.section import WD_ORIENT  # noqa: E402,F401
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Cm, Pt, RGBColor  # noqa: E402

doc = Document(out_docx)
for s in doc.sections:
    s.page_width, s.page_height = Cm(21.0), Cm(29.7)
    s.left_margin = s.right_margin = Cm(1.8)
    s.top_margin = s.bottom_margin = Cm(1.6)
base = doc.styles['Normal'] if 'Normal' in [st.name for st in doc.styles] else None
for name in ('Normal', 'Body Text', 'First Paragraph', 'Compact'):
    try:
        st = doc.styles[name]
        st.font.name = 'Calibri'
        st.font.size = Pt(10.5)
    except KeyError:
        pass
for name, size in (('Title', 22), ('Heading 1', 16), ('Heading 2', 13), ('Heading 3', 11.5)):
    try:
        st = doc.styles[name]
        st.font.name = 'Calibri'
        st.font.size = Pt(size)
        st.font.color.rgb = RGBColor(0x13, 0x51, 0x6B)
    except KeyError:
        pass


def borders(tbl):
    tblPr = tbl._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + edge)
        e.set(qn('w:val'), 'single')
        e.set(qn('w:sz'), '4')
        e.set(qn('w:color'), 'A9B4BD')
        b.append(e)
    tblPr.append(b)


TEXT_W = 21.0 - 2 * 1.8   # cm
WIDTHS = {   # header text of the first two columns -> column widths (cm); other tables share the width by content
    ('#', 'Test'): [1.3, 5.5, 5.4, 1.6, 1.5, 2.1],
    ('#', 'Attempt by Test A'): [1.2, 2.6, 5.1, 4.1, 1.5, 1.4, 1.5],
}


def set_widths(tbl):
    from docx.shared import Cm as _Cm
    hdr = [c.text.strip() for c in tbl.rows[0].cells]
    widths = WIDTHS.get(tuple(hdr[:2]))
    if not widths or len(widths) != len(hdr):
        lens = [max(7, min(60, max(len(r.cells[i].text) for r in tbl.rows))) for i in range(len(hdr))]
        widths = [TEXT_W * l / sum(lens) for l in lens]
    tblPr = tbl._tbl.tblPr
    for old in tblPr.findall(qn('w:tblW')):
        tblPr.remove(old)
    tw = OxmlElement('w:tblW')
    tw.set(qn('w:w'), str(int(TEXT_W / 2.54 * 1440)))
    tw.set(qn('w:type'), 'dxa')
    tblPr.append(tw)
    lay = OxmlElement('w:tblLayout')
    lay.set(qn('w:type'), 'fixed')
    tblPr.append(lay)
    grid = tbl._tbl.tblGrid
    for gc, w in zip(grid.findall(qn('w:gridCol')), widths):
        gc.set(qn('w:w'), str(int(w / 2.54 * 1440)))
    for row in tbl.rows:
        for cell, w in zip(row.cells, widths):
            cell.width = _Cm(w)


for tbl in doc.tables:
    borders(tbl)
    set_widths(tbl)
    for i, row in enumerate(tbl.rows):
        for cell in row.cells:
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(9)
            if i == 0:
                tcPr = cell._tc.get_or_add_tcPr()
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), 'E4EDF2')
                tcPr.append(shd)
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.font.bold = True
doc.core_properties.title = 'ESG Monthly Technician 1-to-1 — Finalisation Guide'
doc.core_properties.author = 'ESG 1-to-1'
doc.save(out_docx)
print('written', os.path.relpath(out_md, ROOT), 'and', os.path.relpath(out_docx, ROOT))
