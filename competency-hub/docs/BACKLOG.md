# Backlog – small fixes for the next substantial app release

These were found on the site and agreed to wait until the next larger app change.

1. **Notice dialog scrolls at about 960 px window height (24 Oct 2026).**
   - The notice dialog is taller than the window. It has these parts:
     - header;
     - pending line;
     - body;
     - "For the meeting";
     - "Actions from this notice";
     - comments;
     - "Add a comment".
   - Fix: fit it without a scrollbar. Either use two columns on wide screens (content and
     meeting on the left, comments on the right), or make Comments collapsible.
   - Add a browser check at 1920 × 960.
2. **Small page scroll on every page while "being recorded" strips show (24 Oct 2026).**
   - The no-scroll fit doesn't count the pending strips above the page.
   - Fix:
     - collapse several strips into one compact line, e.g. "2 changes being recorded · show";
     - include that line in the window-height sizing in `src/app.js`.
   - Add a browser check: no page scroll with 2 pending requests, on every view, at
     1920 × 960 and 1366 × 768.
