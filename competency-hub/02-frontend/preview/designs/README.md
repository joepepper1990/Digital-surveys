# Home-page design options (23 October 2026)

Five completely different home-page designs, for choosing a look before the home page is rebuilt. Each file is
self-contained, uses sample data only and does not connect to SharePoint. The bar at the top of each page switches
between designs and between **Technician**, **Engineer** and **Team Leader** (or open a file with `?role=tech|eng|mgmt`).

| File | Design | Character |
|---|---|---|
| `design-1-control.html` | Control centre | Navy side menu listing the areas, four headline figures, a table of your actions and an area list with progress bars. Familiar business-system look |
| `design-2-editorial.html` | Morning brief | Warm paper colours and serif headings, like a printed briefing. Opens with a plain-English summary sentence; large dates beside each action |
| `design-3-operations.html` | Operations board | Dark control-room board. Every area is a status tile (Attention, Watch, On track), with a health line for automatic processing |
| `design-4-week.html` | My week | Friendly and person-centred. A seven-day strip shows what is due and which meetings fall on each day, then columns for Late, Due this week and Coming up |
| `design-4-week-original.html` | My week (first version) | The first version of design 4, kept for comparison |
| `design-5-bento.html` | Bento | A grid of different-sized tiles: a dark welcome tile with "Do this first", coloured figures, a ring chart, and the areas in a full-width row |

All five show the same information and keep the plain-English rules (words before symbols, at most two main buttons,
status never shown by colour alone). They work from 2560 px down to phone width without sideways scrolling.

To rebuild after editing `src/`: `python3 src/build.py`.

## Design 4, second version (chosen direction, 23 October 2026)

`design-4-week.html` now fits the window with no page scrolling (checked at 1920 × 960 for the WebView link,
1920 × 1080 and 1366 × 768, for every role and every combination of collapsed sections):

- every section is the same panel: a header with a title, a one-line summary and an arrow that collapses it;
- collapsed sections shrink to their header and the others take the space; the choice is remembered in the browser;
- lists show as many items as fit, then "+ n more – see all", so nothing is cut off and nothing scrolls;
- on a laptop-height window the bottom row (areas, notices, meetings) starts collapsed;
- on a phone the page falls back to ordinary scrolling.

## Design 4, third version (23 October 2026)

- The Meetings and Notices panels are gone: meetings show in the week strip, and notices live inside each area.
- The week strip sizes itself to its content, so a day with two entries is never cut off.
- All ten areas are tiles ("View only" on areas you don't belong to). Choosing one collapses the other sections,
  shrinks the tiles to a strip of names, and opens the area in place: its actions, notices and improvements and
  degradations, and its meetings and dates, with Raise an action here and Post a notice here. ✕ or Esc closes it.
- Still no page scrolling at 1920 × 960, 1920 × 1080 or 1366 × 768, for every role, with or without an area open.
