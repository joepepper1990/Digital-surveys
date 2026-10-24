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
3. **"Automatic processing is not working" stays on after the cause has gone (24 Oct 2026).**
   - **What happened:**
     - Before 1.9.0.1, the monitor put "TEST 2 Queue request OFF" back in the queue while
       *2 Request queue* was Off, which counted an attempt.
     - When that flow was turned back on, it didn't see that earlier change.
     - The 16:00 run therefore rightly reported Down, and put the request back once more. This
       time the request flow recorded it within minutes.
     - Down then stays until the next full monitor run, which at weekends is an hour later.
       While it shows, raising and changing actions are blocked.
   - **Fix (flow):** when *2 Request queue* (and 4, 5, 6, 7 for their own areas) completes a
     request, set its own part of `QueueHealth` back to Healthy if it says Down.
   - **Test:** a simulator test that Down clears on the next completed request.
