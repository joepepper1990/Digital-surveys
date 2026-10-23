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
| `design-5-bento.html` | Bento | A grid of different-sized tiles: a dark welcome tile with "Do this first", coloured figures, a ring chart, and the areas in a full-width row |

All five show the same information and keep the plain-English rules (words before symbols, at most two main buttons,
status never shown by colour alone). They work from 2560 px down to phone width without sideways scrolling.

To rebuild after editing `src/`: `python3 src/build.py`.
