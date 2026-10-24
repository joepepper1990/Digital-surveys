# Competency Hub frontend (Welcome layout)

Plain HTML, CSS and JavaScript, delivered as a Welcome by Accelerator 365 custom layout. Same-origin SharePoint REST runs as the signed-in user. There are no libraries and no external calls.

## Version 0.9.0: Release 5 – running the meeting, finalising, minutes and amendments

- **The meeting in progress** (`views/meeting-panel.js`), for the people who run the area's meetings and management:
  the agenda one item at a time (outcome, notes and decisions, *Save and next*, a list of every item to jump to),
  attendance, decisions, and items added by hand. Each is an instant write to the meeting's Record folder; the last
  one recorded for an item counts. *Open the action* and *Raise an action* work from the item: those changes are queued
  and carry the meeting (`MeetingId` on the request), so the meeting can only be finalised once they are recorded.
- **Review and finalise**: lists the items for discussion still without an outcome (carried forward, noticeboard, new
  register entries, new business – `CH.rules.missingOutcomes`, the same rule as the flow) and any change still being
  recorded; only then can it be sent. The *7 Minutes* flow freezes the record.
- **Minutes** of a finalised meeting are read only from the frozen record: attendance, every item with its outcome and
  notes, decisions, actions raised, amendments. *Open the PDF*, *Download PDF* (each version is its own file, so the
  original is never replaced) and *Print* (a print style that prints only the minutes). With *PDF minutes* off,
  *Print* is the way to a PDF.
- **Amend the minutes** (Team Leaders and the Group Head): what and why; it is added beside the original.
- **Flags clear** when a finalised meeting recorded the item as *Discussed*, for flags raised up to its cut-off (the
  home counts, the agenda preview and the flow agree). Notices and entries show the meetings that took them up, with
  the outcome, in their *Discussion history*.
- Fixed: a dialog opened over another (an action from a meeting) no longer closes both on Escape; the agenda preview
  now finds the previous finalised meeting before the meeting starts, so carried-forward items show in the preview.

## Version 0.8.0: Release 4 – booking meetings, invitations and the agenda

- **Book a meeting** (`views/meeting-form.js`), for meeting runners and management, from the home area panel, the
  area page's Meetings tab or the week strip: date, start and end, place or online link, chair (only people who run
  the area's meetings, or management) and attendees (the area's members ticked). *This and the next 2 (or 5) months*
  sends one booking per month, each its own meeting. Changing a meeting sends only what changed.
- **The meeting** (`views/meeting-panel.js`, `?meeting=ID`): its details, whether the Outlook invitation has gone,
  *Add to my calendar* (an `.ics` file made in the browser, for everyone), the agenda, and for meeting runners
  *Change*, *Start meeting* and *Cancel meeting* (a reason is needed). Before it starts the agenda is a preview;
  starting it has the *5 Meetings* flow fix it.
- **The agenda** (`domain/agenda.js`): seven automatic sections – open actions, closed since the last meeting,
  carried forward, flagged notices, new improvements and degradations, unresolved degradations, important dates –
  plus *New business*, items added by hand. The same rules run in the flow; a test runs both on the same data and
  compares them. Adding an item writes straight into the meeting's Record folder, which only meeting runners and
  management can add to.
- **Administration → Settings** gains *Outlook invitations* and *PDF minutes* (Yes or No). With invitations off,
  meetings are still booked and everyone uses *Add to my calendar*.
- Booking and changing meetings pause on their own if *5 Meetings* stops (`health.meetings`).

## Version 0.7.0: Release 3 – noticeboard, register, feedback, settings and the management page

- **Notices** open in full from the home area panel and the area page (`views/record-panel.js`). Members and
  management comment (an instant write to `Updates/{area}`); members flag a notice for the next meeting and the flagger,
  the author, meeting runners and management withdraw it; the discussion history lists both. The author, and the
  area's engineers and management, edit and archive; only engineers and management pin and hide comments. Those are
  requests to the *4 Records* flow, shown as being recorded until its History event exists.
- **Improvements and degradations** (`views/entry-form.js`, `views/record-panel.js`): raise one; change its status
  (an outcome is needed to resolve or close it) and details; raise a linked action or link an existing one – the
  action itself carries the link (`SourceType` Register, `SourceId`), never a copy. They appear in the area panel's
  *Notices & issues* column and on the area page, with a filter.
- **Feedback** button in the footer of every page (`views/feedback.js`), so it never covers anything; it saves straight
  to the Feedback list and says "Thanks" only once SharePoint confirms it. Administrators review it under
  **Administration → Feedback** – the only direct edit the app makes (`sp.update`), on a list only they can edit.
- **Administration → Settings** (`views/settings.js`): the five safe values, checked here and by the flow. *Due soon*
  (`DueSoonDays`) now drives "due soon" on every screen.
- **Management** page for Team Leaders and the Group Head (`views/dashboard.js`): group figures and an area table;
  every number opens exactly the actions it counts. Closed actions are read on demand for the chosen period.
- Changes to notices and the register pause on their own if *4 Records* stops (`health.records`); comments and flags
  carry on. Links: `?notice=ID`, `?entry=ID`, `?view=manage`.
- Fixed: the Administration health card said the queue monitor had not reported whenever administration was healthy;
  background loads on the Administration page no longer repaint over a form being filled in on another tab.

## Version 0.6.0: the new home page ("My week")

The home page approved on 23 October 2026 (preview: `preview/designs/design-4-week.html`):

- **Fits the window.** On a desktop the page never scrolls. Sections are panels that fold to their header line, and
  the open ones share the height; lists show as many items as fit, then "+ n more – see all". Folded sections are
  remembered in the browser. On a laptop-height window the Areas panel starts folded. Phones keep ordinary scrolling.
- **This week**: the next seven days, with your actions due each day (late ones on today) and meetings in your areas.
- **Your actions** in columns: *For you to manage* (engineers) or *Needs your attention* (Team Leaders and the Group
  Head), then *Late*, *Due this week* and *Coming up*. Every card is the same size and opens the action.
- **Areas**: all ten as tiles. Choosing one folds the other sections and opens the area in place – its actions, its
  notices, and its meetings and dates – with *Raise an action here*, *Post a notice here* and *Full page*. ✕ or Escape
  closes it and focus returns to the tile. `?area=FLK` opens Flask this way; `?view=area&area=FLK` opens the full page.
- **Top bar**: *My week*, *My actions* and (administrators) *Administration*; on the home page, *Post a notice* and
  *Raise an action*.
- **Names first name first** ("Joseph Pepper" rather than the directory's "Pepper Joseph"), worked out from the
  firstname.lastname address (`src/core/names.js`).

## Version 0.5.1: Release 2 – administration and permissions

- **Administration → People** (administrators only): find a person; add one, or paste a list; a person's role, areas
  (member, *Can run meetings*, optional end date), *Can post notices* and administrator; mark as left or reactivate;
  their change history. Nobody can change their own access. Every change is a request checked again by the
  Administration flow and shown as "Done and verified" only once the flow has read the permissions back.
- **The corrected permission rules** (plan Revision 5 §4.2) in `domain/rules.js` and `domain/access.js`, the same as the
  flows: a technician without meeting rights in an area raises actions there only for themselves; meeting rights in an
  area allow editing, reassigning and closing its actions but not reopening or moderating.
- *Post a notice* is offered only while the person's *Can post notices* switch is on.
- The furthest deadline follows the `MaxDeadlineYears` setting.
- The Administration page names people and settings changes in words, and offers only **Finish** for a people or
  settings change that was partly made.
- A change is shown as "waiting to be recorded" until the flow picks it up and "being recorded now" while it runs. A
  change an administrator cancels or reverts is shown to its sender, also after a reload.

## Version 0.4.0: Release 1 – safety net

- Honest states: waiting, being recorded, retrying automatically, needs attention (nothing made, or partly made and
  locked), cancelled, reverted, saved. "Saved" is shown only when the action itself carries the change with no lock.
- **Administration → Changes needing attention**: the health of automatic processing, and each change that needs an
  administrator, with Try again, Cancel, Finish or Revert as honest for its state.
- **Limited mode**: when the queue monitor reports processing as down, or has stopped reporting, the buttons that send
  changes are paused with a plain message. Reading and adding updates carry on; the app returns to normal by itself.

## Version 0.3.0: the rest of an action's life (plan K9)

- **More options** in the action panel, showing only what the person may do: **Change status** (Open, In progress,
  Waiting on something – which needs what it is waiting on, shown on the action), **Reassign** (to a member of the area
  or a Team Leader, with a reason; both people are emailed), **Edit details** (only changed fields are sent) and **Close
  with an outcome** (Completed, No longer required, Superseded or Other; a note unless Completed).
- **Confirm close-out** for the raiser of an action marked as done, and **Reopen** for a closed one, with a reason.
- **My actions** (`?view=mine`, or "See all" on *Your actions*): tabs *Mine*, *Raised by me* and, for people who manage,
  *In my areas*; an Area filter; **Show finished items** reads closed actions on demand (indexed on the owner or raiser).
- The rules are in `src/domain/rules.js` (`validateStatus`, `validateReassign`, `validateClose`, `validateReopen`,
  `validateEdit`, `roles()`), shared with the simulated flow; the Power Automate flow uses the same messages.

## Version 0.2.1: fixes from the first test on the site

- **Changes survive a reload.** On start the app reads the user's own requests that are still `Submitted` or `Processing` and tracks them again, so "being recorded" notes, the panel's pending line and the raise strip come back after a refresh.
- **Old copies are reported.** The build stamps the version into the layout (`data-ch-version`). If the script's version differs, the browser kept an old copy of one file, and a banner asks the reader to press Ctrl+F5.

## Version 0.2.0: raising and updating actions

- **Action panel.** Clicking any action opens it. It shows **When** (with "Was due", how often the deadline moved and the original date), **Who** and **What**, the updates, and every deadline change. The link `?action={id}` opens it directly.
- **Raise an action.** A three-step guided form (what, who and where, by when), then a summary. Sends a `RaiseAction` request.
- **Add an update.** An instant write into the action's own folder, `Updates/{area}/A{id}`.
- **I need more time.** A new date and a reason, with the effect explained. Sends `ExtendDeadline` with the revision and deadline the user saw.
- **Mark as done.** Says whether it closes or waits for a close-out check. Sends `MarkComplete`.
- **Requests.** These go only into the user's own `Requests/u{SiteUserId}` folder and show "being recorded" until the action itself confirms the change (`LastRequestKey`, no lock). Refusals are shown in plain words; requests that never left the browser are kept and offered again.
- **Shared rules.** `src/domain/rules.js` holds the rules shared with the simulated request flow in the mock. The Power Automate flow (`../04-solution`) applies the same rules with the same messages.

## Version 0.1.2: sized for the screen

- Text, spacing and tiles grow with the width the app has: ×1.1 from 1,400 px, ×1.2 from 1,700 px, ×1.35 from 2,000 px and ×1.5 from 2,400 px. Every size in `styles/app.css` is a multiple of `--u`.
- Bigger tiles and headings at every width, and the app fills the window's height.
- A **Text size** control (Normal, Large, Larger) in the top bar. Each browser remembers its choice.

## Version 0.1.1: first fixes from the live site

- The greeting uses the first name from the user's Microsoft 365 profile. If that can't be read, it uses the part of a `firstname.lastname@` address before the dot. Display names at EDF are "Surname Firstname", so "Pepper" was shown before.
- An area counts as overdue for a meeting only once more than 35 days have passed since its last meeting or, with no meeting yet, since its Tracking Start date. Before, a new site showed all ten areas as overdue.

## Version 0.1.0: the app shell

**What it does:**

- Home pages for the three roles:
  - Technician: own areas, actions, meetings and noticeboards, then other areas as view-only tiles.
  - Engineer: the same, plus "For you to manage".
  - Team Leader and Group Head: all areas, "Needs your attention", their own actions and coming meetings.
- Area pages with the tabs Actions, Notices & issues, Calendar and Meetings, and a clear *View only* bar for non-members.
- **Post a notice**, the only write in this version. Anyone can post on any active area's noticeboard; only members can mark a notice as important. Notices from non-members are labelled as coming from outside the area.

**Identity fails closed.** An unknown user, a person marked Left, a duplicate People entry, or a People list that cannot be read all produce a message and no operational data.

**A failed or truncated read is never shown as "nothing to show".** Instead:

- unavailable data is reported;
- partial data is marked "not complete";
- figures from a failed read are never shown as zero.

**Coming in later versions:**

- raising and changing actions, and extensions;
- the issues register;
- meetings;
- the management drill-downs;
- administration.

These buttons are visible, but they say they are coming next.

## Layout

| Folder | Contents |
|---|---|
| `src/` | Modules: `core/` (config, DOM, dates, SharePoint), `domain/` (access rules, model), `ui/`, `views/`, `app.js` |
| `styles/app.css` | Styles. The build scopes every rule under Welcome's `.SCOPE .ch`. |
| `layout/` | The Welcome layout template |
| `tools/build.js` | Builds `dist/`. `--check` fails if `dist/` is stale. |
| `dist/` | **Upload these two files:** `competency-hub.html` and `competency-hub.js`. `BUILD_MANIFEST.json` holds their SHA-256 hashes. |
| `mock/` | A simulated Welcome context and SharePoint with synthetic data. Open `mock/index.html` in a browser and use "Sign in as" and "Simulate". |
| `test/` | Unit tests (`node --test`) and browser tests (headless Chromium) |

## Build and test

```
node tools/build.js
node tools/build.js --check
node --test test/unit/*.test.js
node test/browser/run.js [path-to-chromium]
```

## Evidence status

| Evidence | Status |
|---|---|
| Unit tests (date rules, access rules, model, code rules, build) | LOCAL: 30 checks pass |
| Browser tests (roles, view-only, fail-closed, unavailable or partial data, notice posting, keyboard, read-only audit, 3 widths) | OFFLINE-SIMULATED: 29 checks pass |
| Running inside Welcome on the new site | **Not proven.** It needs the P0 probe, then the lists created by Setup. |
| SharePoint permissions (non-members can only add notices, members can add updates) | **Not proven.** These are Phase 0 probes P-03, P-04 and P-13 on the real site. |
| Accessibility beyond keyboard tabs, dialog focus and contrast tokens | **Not yet tested** with axe or a screen reader |
