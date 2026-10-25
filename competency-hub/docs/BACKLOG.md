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
4. **"Management" still shown in the Finalise dialog (25 Oct 2026).**
   - Current wording: "Management can add amendments later". Change it to "Team Leaders
     and the Group Head can add amendments later".
   - Sweep all on-screen text again for "Management".
5. **"Raise an action" on an agenda item that is already an action (25 Oct 2026).**
   - Rename it **Raise a further action** on action items. Keep "Raise an action" on
     notices, issues and new business.
6. **Adding a new business item during a meeting is confusing (25 Oct 2026).**
   - The item is added at the bottom, but the screen goes back to the start of "All items".
   - Instead, the agenda should open the new item straight away, and "Add an item" should sit
     beside the item list, not at the very bottom of the dialog.
7. **PDF minutes show SharePoint names (25 Oct 2026).**
   - The minutes show "Pepper Joseph" and "Howe Richard".
   - Use the Hub's own names, as `CH.names.display` gives them: Known as, else the first name
     followed by the surname. Make the change in the PDF step of flows 3 and 7.
8. **Section 9 of the minutes, actions raised at the meeting (25 Oct 2026).**
   - The Outcome and Notes columns are empty, because they don't apply to a new action.
   - Show Owner and Due instead.
9. **Meeting agenda is too busy, and item kinds look alike (25 Oct 2026, the owner's comment in the TEST minutes).**
   - Actions, issues and notices have the same outcome list and the same buttons.
   - Each item should carry a plain label (Action, Issue, Notice, New business).
   - Each item should show only the buttons that fit its kind.
   - The aim is a simpler, friendlier meeting screen, done with items 5 and 6.
10. **Minutes Print view is poor (25 Oct 2026).**
    - **What's wrong:** content repeats on the next page, there's a stray rule down the left,
      and the spacing is very loose.
    - **When the PDF minutes exist:** remove **Print**. Show **Open the PDF** and **Download PDF**,
      and let people print from the PDF viewer.
    - **When PDF minutes are switched off:** keep the print page only as the fallback, restyled to
      match the PDF layout.
    - **Fix the repeated content:** check the print stylesheet, which probably prints both the
      page and the dialog.
11. **Overall clarity: too much in one place, and things are hard to find (25 Oct 2026).**
    - **What happened:** the owner amended an action when they meant to amend the meeting
      minutes.
    - **Next app release, a simplification pass:**
      - each screen has one job;
      - the buttons name what they act on ("Amend these minutes", "Edit this action");
      - each screen shows its main step, with the rest under More options;
      - agenda items are labelled by kind (with 5, 6 and 9).
    - **Before building:** agree it with the owner, and ideally a technician, on a preview first.
