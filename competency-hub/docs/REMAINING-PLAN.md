# ESG Competency Hub – plan for the rest of the project

**23 October 2026.** This covers everything left from now to go-live, plus what comes after. It follows the agreed
specification (`PLAN.md`, Revision 5) and the decisions made since. Where the two differ, this document is newer.

## 1. Where things stand

| Part | Built and tested here | On the site |
|---|---|---|
| Site, lists, groups, Setup | Setup 1.3 | Setup 1.1 |
| App | 1.0.0: actions, safety net, Administration (People, Settings, Feedback, Remove test data), the *My week* home page, notices, register, Management page, meetings, the live meeting and minutes | 0.3.0 |
| Flows | 1.9.0.0 (built, after your first review; 1.8.0.2 on the site): 1 Daily tasks, 2 Request queue, 3 Queue monitor, 4 Records, 5 Meetings, 6 Administration, 7 Minutes, 8 Clean-up, and the P-INV and P-PDF probes | 1.2.0.0 |
| Permission probe | Built | Not run |

**Built so far:** all six releases and the home-page design: Phase 1 is built and tested locally (24 October 2026).
**Left:** installing on the site and the checks there (HOW-TO), then going live (`GO-LIVE.html`).

**Decisions settled since Revision 5:**
- Everything runs on your account, and no service account is used. That covers:
  - the flows;
  - all emails;
  - meeting invitations, which come from your calendar (you are the organiser);
  - the PDF conversion, which uses your OneDrive as a scratch space.
- The shared "Hub sender" mailbox is optional. It only changes the sender's name.
- The permission probe still needs one ordinary account for about 15 minutes: a willing colleague, added as a technician.
- Staff are given the Hub link ending `?env=WebView`. Site navigation is already off.

## 2. The order of work

```
Now        You: install Release 2 (Setup 1.2, solution 1.4.1.0, app 0.6.0), run its checks and the probe
Now        Me:  build Release 3 at the same time
Release 3  Noticeboard, register, feedback, settings, dashboard   →  you install and check
Release 4  Meetings I: invitations probe, booking, agenda          →  you install and check
Release 5  Meetings II: PDF probe, live screen, finalise, PDF      →  you install and check
Release 6  Checks, clean-up, add the 28 staff, go-live
After      Phase 2 (about 52 hours), in the order you choose
```

Each release works the same way:
1. I build and test it here.
2. You get one zip with a HOW-TO.
3. You install it and do a short check on the site.
4. I fix anything you find before the next release goes out.

Releases build on each other, so a release is installed only after the one before it works on the site.

**Critical path:** Release 2 on site → 3 → 4 → 5 → 6. The register (Release 3) has to exist before agendas
(Release 4), because agendas include register entries.

---

## 3. Release 3 – noticeboard, register, feedback, settings, dashboard (about 35 hours)

**Goal:** everything an area needs between meetings, so the area panel on the home page is complete.

### What people get

| Item (spec) | What it does | Who |
|---|---|---|
| **Notices, full** (NB-1–3) | Open a notice to read it in full. The author edits or archives their own. Moderators edit, archive, pin or unpin any notice. An author can mark their own notice Important for up to 30 days. | Moderators are management and engineers of the area (§4.2 canModerate) |
| **Comments** (NB-4) | Add a comment to a notice or register entry; it appears at once. Moderators can hide a comment. | Members of the area and management |
| **Flag for the next meeting** (NB-5) | Flag a notice or register entry, or withdraw the flag; this happens at once. Flagged items show on the area and, from Release 4, on the agenda. | Members and management |
| **Discussion history** (NB-6) | Shows when an item was flagged. Meeting outcomes are added in Release 5. | Everyone |
| **Improvements and degradations register** (REG-1–5) | Raise an entry: type, impact, description, responsible person. Change its status (Open, Under review, Resolved, Closed); an outcome is needed for Resolved or Closed. Comments and flags work as on notices. | Raise: members. Change: raiser, responsible person, engineers, meeting runners, management |
| **Linked actions** (REG-3) | From an entry, *Raise a linked action* or *Link an existing action*. The action carries Source = Register; nothing is copied. The entry lists its actions. | Whoever may change the entry |
| **Settings editor** (ADM-4, A7) | Administration → Settings. Four values, each checked: reminder interval, due-soon days, maximum deadline years, monitor hours. Every change is audited. | Administrators |
| **Feedback button** (FB-1–3, A8) | A small round button at the bottom right of every page. Choose improvement, bug, question or other, and describe it. It shows "Thanks – your feedback has been sent" only once SharePoint has saved it. | Everyone |
| **Feedback review** (ADM-5) | Administration → Feedback: filter by type and status, open an item, write a response, set its status. | Administrators only; others cannot read the list |
| **Management dashboard** (MGT-1–3, D1) | A *Management* pill in the top bar. It shows group figures (open, late, due in 7 days, completed in 30 days) and a table with one row per area. Every number opens exactly the actions it counts. | Team Leaders and the Group Head |

**Where it appears in the app:**
- **The area panel's middle column** becomes *Notices & issues* in full: notices first (Important on top), then
  register entries, each opening a detail window.
- **The full area page's Notices & issues tab** gets the same lists, plus a filter by type.
- **The home page's *For you to manage*** column also counts register entries waiting on you, and flagged items.

### How it is built

- **New flow: *ESG Competency Hub | 4 Records*.** It handles queued changes to notices and the register, using the same
  claim, private copy, lock, History and commit steps as flows 2 and 6. Its trigger condition picks its own request
  types. Concurrency is 1, and it ships Off.
  - **Request types:**
    - EditNotice, ArchiveNotice, PinNotice, HideComment;
    - RaiseRegisterEntry, UpdateRegisterEntry (details, status, outcome, responsible person);
    - LinkActionToEntry, UnlinkActionFromEntry.
  - **Permission rules:** each rule is written once in `domain/rules.js` and generated into `flows.py`. These are
    canModerate, canManageRegister and the author rules.
  - **History:** every change writes a History event with the previous and new values.
- **Flow 2 (Request queue):** RaiseAction accepts an optional register entry. The flow checks the entry is in the
  same area, then sets SourceType and SourceId.
- **Flow 3 (monitor) and flow 6 (Administration):**
  - the monitor learns the new flow's request types, so stalled changes to records are retried like any other;
  - flow 6 is unchanged, because UpdateSetting already exists.
- **Instant writes** go straight to SharePoint, which enforces the permissions: comments, flags, posting a notice and
  feedback.
- **Setup:** no list changes. Every column needed is already in Setup 1.2. Setup 1.3 is only needed if a probe or
  test finds a gap.
- **Small fixes in this release:**
  - The "assigned to you" email suppresses the reminder only within its own window, so a reminder setting above
    7 days can't produce a duplicate.
  - A reminder retried on a later day gets fresh wording ("due in 3 days", not the original "5").

### Your check on the site (HOW-TO Part F)

1. Post a TEST notice, then edit, pin and archive it. Add a comment and hide it.
2. Raise a TEST register entry, then raise a linked action from it. Close the entry with an outcome.
3. Flag the entry for the next meeting, then withdraw the flag.
4. Send feedback with the button, and answer it from Administration → Feedback.
5. Change *Due-soon days*, check the home page uses it, then change it back.
6. Open *Management* and click a figure: the list that opens must match the number.

**Done when:**
- all simulator, unit and browser tests pass;
- each new request type has been interrupted at every write and still recorded exactly once;
- your on-site checks pass.

**Delivered:** solution 1.5.0.0 (five flows) and app 0.7.0.

---

## 4. Release 4 – meetings I: invitations, booking, agenda (about 27 hours)

**Goal:** book a monthly meeting, with Outlook invitations, and have its agenda build itself.

### First: invitations probe (P-INV), with your go-ahead

This is a small test flow, *ESG Competency Hub | P-INV*, run by hand once. On your calendar it:
1. creates a TEST event for you and the test colleague;
2. updates it;
3. finds it again by its hidden reference;
4. cancels it.

**Pass:** both of you get the invitation, the update and the cancellation, with you as organiser.

**If it fails:** the meetings still work, but invitations are left out, and each person adds the meeting to their own
calendar from a download link (.ics). The result is recorded before anything depends on it.

### What people get

| Item (spec) | What it does |
|---|---|
| **Book a meeting** (MTG-1) | Date, time, place or online link, chair, attendees (the area's members by default). An Outlook invitation goes out from your calendar. Changing the time or attendees sends an update; cancelling sends a cancellation. "Book the next 3 months" makes three separate meetings. |
| **Meetings in the app** | The week strip and area tiles already show booked meetings. The area panel's third column and a full *Meetings* tab list upcoming and past meetings. |
| **Agenda** (MTG-2) | Before the meeting, a preview of the agenda in nine sections: open actions; actions closed since last time; items carried forward; flagged notices and entries; new register entries; unresolved degradations; important dates; new business; decisions. *Start meeting* fixes it. Manual agenda items can be added before or during the meeting. |
| **Meeting rights** (§4.3) | When *Can run meetings* is switched on or off, the change also reaches the open meeting's record folder, and is read back to confirm it. |

### How it is built

- **New flow: *ESG Competency Hub | 5 Meetings*.** Request types: ScheduleMeeting, UpdateMeeting, CancelMeeting
  and StartMeeting.
- **Invitations use a stored reference,** so a timed-out call never sends a second invitation.
  1. The flow saves `InviteToken` before creating the event.
  2. If the call times out, it looks for the event carrying that token and uses it, instead of creating another.
  3. Updates use the stored event ID, and a cancellation that finds no event counts as done.
  4. After three failures, the administrators are alerted. The meeting itself still stands.
- **StartMeeting** fixes the cutoff time, then writes the agenda rows into the meeting's folder. The rules are the same in
  the app preview and the flow, and a test checks the two agree.
- **The monitor** also retries invitations left part-way.
- **Flow 6:** SetMeetingRights gains the grant and removal on open meeting folders, with read-back.
- **Solution:** a new Outlook calendar connection reference. It uses the same Office 365 Outlook connection, with
  your account.

### Your check on the site

1. Book a TEST meeting with yourself and the test colleague: the invitation arrives.
2. Move it an hour: the update arrives.
3. Look at the agenda preview, then start the meeting: the agenda is fixed.
4. Book another and cancel it: the cancellation arrives.

**Delivered:** solution 1.6.0.0 and app 0.8.0 (built and tested locally, 23 October 2026).

**As built, compared with the above:**
- The agenda has seven automatic sections plus *New business* (items added by hand). *Decisions* are recorded on the
  live screen, so they arrive with Release 5.
- "Book the next 3 months" is offered as *This and the next 2 months* (three meetings) or *the next 5 months* (six).
- The P-INV probe asks for one attendee's email when you run it, and its last step lists every result.
- Two settings, *Outlook invitations* and *PDF minutes*, switch to the fallbacks without a rebuild.
- Setup 1.3 adds one column (the meeting's end time) and those two settings.

---

## 5. Release 5 – meetings II: live screen, finalise, PDF minutes (about 35 hours)

**Goal:** run a meeting from start to finish in the Hub and produce formal minutes.

### First: PDF probe (P-PDF), with your go-ahead

A small flow writes a sample minutes page into your OneDrive, converts it with *Convert file (PDF)*, saves the PDF in
*Meeting Minutes*, and deletes the working file. This also confirms that EDF's DLP policy allows OneDrive alongside
SharePoint and Outlook.

**If it is blocked:** the minutes get a print-ready page in the Hub instead (browser *Save as PDF*). Everything else
is unchanged.

### What people get

| Item (spec) | What it does |
|---|---|
| **Live meeting screen** (MTG-3) | Attendance: present, absent, apologies. Go through the agenda one item at a time. Record notes, decisions and an outcome (Discussed, Deferred, Carried forward), each saved at once. Raise an action, or update, reassign or close one, from the item; these show as pending until recorded. *Finalise* is enabled only when nothing is pending. |
| **Finalise** (MTG-4) | Review the minutes, then finalise. The record becomes read-only and the meeting is marked Finalised. Flags whose items were Discussed are cleared. |
| **Amendments** (MTG-5) | Management can append an amendment (what, why, who, when). The original is kept, and a new PDF version is made. |
| **PDF minutes** (MTG-6) | A formatted PDF is saved in the area's folder of *Meeting Minutes*, with **Print** and **Download PDF** in the Hub. Minutes are never emailed (MTG-7). |
| **Discussion history** | Notices and entries now show the meetings that discussed them, and the outcome. |

### How it is built

- **Flow 5 gains:**
  - FinaliseMeeting: checks first; locks the record folder; checks again; on any change, puts the meeting back to
    In progress;
  - AmendMeeting;
  - the separate PDF step. Finalising commits first and only then sets PDF Pending, so a PDF failure never touches the
    minutes.
- **The monitor retries PDFs.** After three failures it alerts the administrators, and the minutes stay readable in
  the Hub, marked "PDF being prepared".
- **Solution:** a new OneDrive for Business connection reference, using your account.

### Your check on the site

Run a complete TEST meeting with the test colleague:
1. Take attendance and go through the agenda.
2. Raise an action from the meeting and close one.
3. Finalise, then open, print and download the PDF.
4. Amend it, and check that version 2 of the PDF appears.

**Delivered:** solution 1.7.0.0 and app 0.9.0 (built and tested locally, 24 October 2026).

**As built, compared with the above:**
- Finalising, amending and the PDF are a flow of their own, *7 Minutes*. With them, *5 Meetings* would have been over
  Power Automate's 500 steps per flow. The monitor and the app treat the two as one "meetings" part.
- Finalising freezes the record into the meeting's own folder (only the flow writes there): each item takes the last
  outcome and notes recorded, with attendance, decisions, new business and the actions raised. The minutes, the PDF,
  the next agenda's carried-forward items and flag clearing all read only that frozen record.
- Each PDF version is its own file (`MTG-{id}-v{n}.pdf`) rather than a new version of one file: the original is never
  replaced, and a retry finds a version already saved instead of making a second.
- Items for discussion (carried forward, noticeboard, new register entries, new business) each need an outcome before
  finalising; other items may be left as *No change*.
- No Setup change is needed.

---

## 6. Release 6 – checks and go-live (about 27 hours)

| Step (spec) | What happens |
|---|---|
| **Security sweep** (Q1) | Every request type refuses someone not allowed to make it. Every typed field is safe to display. Every list and folder permission is compared with the specification by Setup's *Check*. The P2 probe is re-run with the test colleague. |
| **Load test** (Q2) | The simulator runs with 10,000 actions, 60,000 History rows and 5,000 notices. Every query must start with an indexed column, and the app must stay quick. |
| **Accessibility** (Q3) | Contrast, keyboard-only use, screen-reader labels, 200 % zoom, and 1366 / 1920 / 2560 px. |
| **Power Automate use** (Q4) | Real daily use is measured from the admin analytics, against your daily allowance, which is shared with the 1-to-1 flows. The monitor's hours are adjusted if needed. |
| **Test-record clean-up** (Q5) | Administration → Remove test data. It lists every record marked TEST and everything that depends on it; nothing is chosen by title. You type `REMOVE TEST DATA`, and flow 6 moves them to the recycle bin (recoverable for 93 days), writes one audit entry and switches test marking off. |
| **Add the staff** (GO) | Administration → People → paste the list of 28. Each person shows *Done and verified* once their access has been read back. |
| **Go-live** | A final health check. Staff get an email from you with the WebView link and a one-page "how to" that I write. |

**Delivered:** solution 1.8.0.0, app 1.0.0, the go-live note (`GO-LIVE.html`) and the staff guide (`STAFF-GUIDE.html`), built and
tested locally on 24 October 2026.

**As built, compared with the above:**
- The clean-up is a flow of its own, *8 Clean-up* (flow 6 is near the 500-step limit). The page is *Administration →
  Remove test data*.
- The security sweep found two things, both fixed: flow 6 looked a new person up in Microsoft 365 before checking the
  requester was an administrator, and a badly shaped list of areas stopped the run instead of being refused.
- The accessibility checks found the main buttons' white-on-orange text at 2.7:1; they now use a darker orange (4.8:1).
- The load test and the list view threshold are checked in the simulator for every query, not only once.
- Power Automate use (Q4) and adding the staff (GO) are steps on the site, in the go-live note.

---

## 7. What I need from you, and when

| When | What |
|---|---|
| **Now** | Install Release 2: Setup 1.2 (*Check*, send me the log, then *Apply*), solution 1.4.1.0 with flows 3 and 6 on, app 0.6.0. Run Part D. |
| **Now, or before Release 4** | One willing colleague for about 15 minutes, for the permission probe. They can stay on as an ordinary user. |
| **After each release** | Install it, follow its HOW-TO checks, and send screenshots or anything odd. |
| **Release 4 start** | Your go-ahead to run the invitations probe on your calendar. |
| **Release 5 start** | Your go-ahead to run the PDF probe in your OneDrive. |
| **Release 6** | The list of 28 staff, already confirmed, and the go-live date. Optionally IT's shared mailbox, only if you want emails to come from "ESG Competency Hub". |

---

## 8. Risks still open, and what covers them

| Risk | Cover |
|---|---|
| Permissions behave differently on the real site | The P2 probe in Release 2, and again in Release 6 |
| Outlook invitations can't be reconciled or are blocked | P-INV probe first; .ics download fallback |
| OneDrive conversion is blocked by DLP | P-PDF probe first; print-page fallback |
| Daily Power Automate allowance (shared with the 1-to-1) | Measured in Release 6; monitor hours can be reduced |
| Everything depends on your account | Flows stop if it is disabled or its password changes. The heartbeat warns administrators, and Power Automate emails you. Moving to a service account later is a documented change. |
| Flow 2 size (about 400 of 500 actions) | New work goes into flows 4 and 5, so flow 2 only gains the register link |

---

## 9. After go-live (Phase 2, about 52 hours)

| Item | Hours | Depends on |
|---|---|---|
| Full calendar: month, agenda and My calendar views | 8 | Meetings |
| Own calendar entries, repeating events, managing others' events | 8 | Full calendar |
| Staff statistics (from History) | 9, plus 4 if they must be truly restricted | Release 1 History fields |
| Participation figures | 4 | Staff statistics |
| Create and archive areas in the app | 7 | – |
| One action linked to several areas | 6 | – |
| Detailed Overview and History tabs | 6 | – |
| "Needs your attention" panel | 4 | Meetings |

**Still deferred:** the slimmer SharePoint header (the WebView link already covers most of it) and the 27-inch screenshot.
