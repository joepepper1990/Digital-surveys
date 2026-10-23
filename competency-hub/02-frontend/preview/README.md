# Design previews

Static, clickable previews with sample data. They do not connect to SharePoint.

| File | Purpose |
|---|---|
| `layout-c-tiles.html` | **Chosen layout** (21 Oct 2026): home tiles at full width, role-based front pages, view-only access to other areas |
| `layout-a-tabs.html`, `layout-b-sidebar.html` | Alternatives that were considered, kept for reference |
| `designs/` | **Five new home-page design options** (23 Oct 2026): control centre, morning brief, operations board, my week, bento. See `designs/README.md` |
| `competency-hub-preview.html` | Earlier single-page preview of the simplified screens (action card, raise form, meeting) |

Each layout has a **Preview as** selector for Technician, Engineer and Group Head / Team Leader.
Query parameters `?role=tech|eng|mgmt` and `&area=FLK` open a given view directly.

To rebuild the three layout files from `src/`:

```
python3 src/build.py .
```
