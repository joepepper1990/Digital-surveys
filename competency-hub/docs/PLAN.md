# ESG Competency Hub — Revision 5: Phase 1 Go-Live and Phase 2 Enhancements

**Environmental Safety Group, Dungeness B · 22 October 2026 · For approval**

This revision was approved on 22 October 2026 and is the specification being built. The repository README
says which releases are built.

**This document is the only active specification.** Revision 4, Revision 3 and
the working notes K0–K12 are kept as historical records only. Where they
differ from this document, this document applies.

**Status labels:**

| Label | Meaning |
|---|---|
| **ON SITE** | Built and confirmed working on the real site |
| **LOCAL** | Built and tested only on the simulated SharePoint site |
| **PHASE 1** | Approved, still to build, needed before go-live |
| **PHASE 2** | Approved, built after go-live |
| **REMOVED** | Not required |
| **DEFERRED** | Waiting for your input; blocks nothing |

---

## 1. Changes from Revision 4

1. **Meeting rights are narrowed and made explicit (§4).**
   - *Can run meetings* in an area now grants:
     - meeting management;
     - raising actions for other people;
     - editing, reassigning and closing **that area's** actions.
   - It **no longer** grants:
     - reopening actions;
     - moderating notices or comments;
     - pinning or archiving notices;
     - changing other people's calendar events.
   - The single bundled "manager" rule (`access.canManage` in the app, `MANAGE`
     in the flow) is split into separate internal checks, one per operation.
2. **The technician restriction covers every route.** A technician without
   meeting rights in an area:
   - can raise actions there only for themselves;
   - cannot reassign an action they raised to someone else;
   - cannot change the owner by editing details, because the edit request
     already refuses an owner field (this will be tested).
3. **The work is split into Phase 1 (go-live) and Phase 2 (after go-live).**
   - Moved to Phase 2, about 52 hours:
     - the full calendar interface;
     - detailed staff statistics;
     - participation statistics;
     - creating and archiving areas;
     - linking actions to several areas;
     - the detailed Overview and History tabs;
     - the "Needs your attention" panel.
   - The feedback bubble and the Settings editor **stay in Phase 1**.
   - Booking meetings and Outlook invitations **stay in Phase 1**.
4. **Engineering corrections.**
   - Permissions are tested on the real site in **Release 2**, not at the end.
   - Action history captures everything Phase 2 reporting needs.
   - Invitation calls that may have failed are reconciled before any retry, so
     no duplicate invitations are sent.
   - A PDF failure cannot touch the finalised minutes.
   - The queue monitor also runs outside office hours, hourly.
5. **Decisions settled by you since Revision 4:**
   - the meeting-chair rights (decisions #1 and #2);
   - the "Needs your attention" panel moves to Phase 2 (#3);
   - browser activity tracking is not required (#4).
6. **New estimate.** Phase 1 is about **194 hours** (145–275). Phase 2 is about
   **52 hours** (38–72).

---

## 2. Current baseline

The branch is at commit `e14d1a1`, with app 0.3.0, solution 1.2.0.0 and Setup.

The automated tests all pass:

| Test set | Count |
|---|---|
| Flow tests | 60 |
| Validator tests | 20 |
| Unit tests | 48 |
| Browser checks | 29+ |

| Feature | Status |
|---|---|
| Site, Setup (14 lists, 1 library, 13 groups, 3 permission levels, folders, you as first administrator) | **ON SITE** |
| App: shell, area pages (Actions, Notices & issues, Calendar list, Meetings), view-only areas, version warning | **ON SITE** |
| Actions: raise, add an update, extend, mark as done, change status (with blocker), edit, close, reopen, My actions, finished items | **ON SITE** |
| Request queue: transaction copy, History, locks, confirmed success, pending state survives a reload; 1 min 23 s | **ON SITE** |
| Emails and 06:00 reminders, using the delivery ledger | **ON SITE** |
| Posting a notice, including in another area | **ON SITE** (you reported it working) |
| Reassign, and the RAW email | **LOCAL** (proven on site in Release 2, with the test account) |
| Everything in §5 | **PHASE 1**, not yet built |

**Defects in existing work, fixed in Release 1:**

| # | Defect |
|---|---|
| D1 | The CLS email still goes to the raiser |
| D2 | The EXT email can go to the raiser through the `NotifyRaiserOnExtension` setting. The code path is removed and the setting is set to No. |
| D3 | The failure wording mentions an administrator page that doesn't exist yet |
| D4 | A failed change keeps its lock until someone resubmits it |
| D5 | History can't tell "marked done" from "closed by a manager" (see §5.2 H-1) |

---

## 3. Phase 1 scope (definitive)

### 3.1 Reliability

**REL-1. Queue monitor** (a new flow, *3 Queue monitor*). It runs every 15
minutes from 07:00 to 19:45 on weekdays, and **hourly at all other times**. The
hours are an editable setting.

| It finds | It does |
|---|---|
| Missed triggers | Re-fires the request; the request flow resumes from its stored copy (roll-forward) |
| Stopped runs (lease expired) | Same |
| Failed runs past their retry time | Same |
| Failed, Unknown, or stuck Sending emails | Retries using the same ledger row, so no duplicates |
| Invitation and PDF steps left pending | Retries them |

- After 3 attempts the change goes to **Needs attention** and an alert is sent.
- The monitor writes the `QueueHealth` row and a heartbeat.
- Daily tasks and the monitor check each other's heartbeat.
- Power Automate's own failure emails to the flow owner are the third channel.

**REL-2. Honest states.** "Saved" is shown **only** when the request is
Completed **and** the record shows that the change was committed with no lock.
That rule exists already.

| State | Message |
|---|---|
| Waiting | "Submitted 10:42 – being recorded" |
| Processing | "Being recorded" |
| Retrying | "Not recorded yet – retrying automatically" |
| Needs attention, nothing applied | "Not recorded – an administrator has been told. Nothing was changed." |
| Partly applied | "Not fully recorded – an administrator has been told. The record is locked until it is resolved." The lock is **kept**. |
| Completed | "Saved" |
| Cancelled | "Cancelled by an administrator. Nothing was changed." |
| Reverted | "Reverted by an administrator" |

**REL-3. Administrator page *Changes needing attention*.**
- **Retry**: for any unfinished change.
- **Cancel**: only if **nothing has been applied**.
- **Finish**: rolls a partly applied change forward.
- **Revert**: for partly applied **action** changes only.
  - It writes back the previous values stored in the plan, if `Revision` is the
    planned value + 1.
  - A half-created action becomes *Withdrawn*.
  - Each revert writes a "Reverted" History event.
- Nothing is ever labelled "Rolled back" while new values remain.
- Only active system administrators can use the page, and the flow checks this.
  Every action shows its result and is audited.

**REL-4. Alerts.** An ALR email goes to active administrators, at most one per
problem per day, for:
- Needs attention;
- Partly applied;
- an abandoned email;
- a stale heartbeat;
- an invitation or PDF failing 3 times.

Each alert gives the record, person, time, step, error and a link.

**REL-5. Limited mode, per part of the system.**

| Part | Signal | Effect |
|---|---|---|
| Request processing | `QueueHealth` Down, or a stale monitor heartbeat | Queued buttons are disabled and a banner appears; reading and instant writes keep working |
| Reminders | `LastDailyRun` older than 26 hours | Admin banner and alert only; nothing is disabled |
| Email | Abandoned or Unknown rows | Admin banner and alert only |
| SharePoint | The app can't read | The existing "can't load" screen |

The app returns to normal by itself when the signal is healthy again.

### 3.2 Administration (system administrators only)

**ADM-1. People.**
- Add one person, or paste a list of them (used for the 28 staff at go-live).
- Change a person's role.
- **Leaver:** their outstanding work must be reassigned first, then their access
  is removed.
- **Reactivate.**

**ADM-2. A person's areas.**
- A tick box for each area.
- A **Can run meetings** switch for each area.
- An optional **expiry date**. Daily tasks removes expired access. If
  outstanding work blocks the removal, it sends an alert instead.

**ADM-3. Can post notices.** One switch per person (§4.4).

**ADM-4. Settings editor.** Four safe values, each validated:

| Setting | Allowed values |
|---|---|
| Reminder interval | 1–30 days |
| Due-soon threshold | 1–30 days |
| Maximum deadline years | 1–5 |
| Monitor hours | Start and end times, plus the out-of-hours interval |

Changes are queued (`UpdateSetting`) and audited with the previous and new
value. **No general settings framework.**

**ADM-5. Feedback review.**
- A list with filters by type and status.
- Open an item, write a response, and set the status (New, In review, Answered,
  Done).
- Administrators only, enforced: the Feedback list gives other users **Add
  only**, so they cannot read it.

**ADM-6. Every administration change:**
- is queued and checked by *6 Administration* (the requester must be an active
  administrator);
- can't target your own privileges;
- keeps the last-administrator guard;
- applies permissions and reads them back before showing "verified";
- records the actor, person, previous value, new value and time in History
  `Administration`;
- is recovered by roll-forward if interrupted.

### 3.3 Actions

**ACT-1.** Everything that is ON SITE is kept unchanged.

**ACT-2.** The corrected rules in §4 apply: who may edit, reassign, close and
reopen, and the technician restriction.

**ACT-3.** History records enough for Phase 2 reporting (§5.2 H-1).

**ACT-4.** For Phase 1, management rights for an action are judged against its
**primary area** only.

### 3.4 Noticeboard

**NB-1. Post a notice.** Instant, in any area, unless that person's *Can post
notices* switch is off.

**NB-2. Edit and archive.**
- Authors can edit and archive their own notices.
- **Moderators** (engineers of the area and management) can edit and archive
  anyone's.
- Both are queued.

**NB-3. Important and pinned.**
- An author can mark their own notice Important for up to 30 days.
- Moderators can pin and unpin any notice, queued.

**NB-4. Comments.**
- Adding a comment is instant.
- Moderators can hide a comment. This is queued and audited.

**NB-5. Flag for the next meeting.**
- Members can flag a notice, and withdraw the flag, instantly.
- A flagged notice becomes an agenda item.
- The flag clears when a finalised meeting records it as Discussed.

**NB-6. Discussion history.** The notice shows its past meeting outcomes.

**Read & Acknowledge: REMOVED.**

### 3.5 Improvements & Degradations

**REG-1. Raise an entry** (members, queued) with:
- type and impact;
- a description;
- a responsible person;
- a status: Open, Under review, Resolved or Closed;
- an outcome, required for Resolved and Closed.

**REG-2.** These people can change the status, outcome and responsible person:
- the raiser;
- the responsible person;
- engineers of the area;
- meeting runners of the area;
- management.

**REG-3. Linked actions.**
- **Raise a linked action**, or **link an existing action**.
- Either way, `SourceType = Register` and `SourceId` are set on the action.
- There is no copy.
- The entry lists its linked actions.

**REG-4. Agenda and visibility.**
- Unresolved degradations and flagged entries appear on the meeting agenda.
- The area's *Notices & issues* tab lists the entries.

**REG-5.** Comments and flags work as they do for notices. Every change is
recorded in History.

### 3.6 Monthly meetings

**MTG-1. Book a meeting** (meeting runners and management).
- Choose the date, time, place or online link, the chair, and the attendees
  (default: the area's members).
- An Outlook invitation is sent automatically.
- A change sends an update. A cancellation sends a cancellation.
- The **Meetings** tab lists upcoming and past meetings, with their minutes.

**MTG-2. Agenda.**
- The automatic agenda is fixed when the meeting starts. It includes:
  - open actions;
  - actions closed since the last meeting;
  - items carried forward;
  - flagged notices and register entries;
  - unresolved degradations;
  - important dates.
- **Manual agenda items** can be added before or during the meeting.

**MTG-3. Live screen.**
- Attendance: present, absent or apologies.
- Work through the agenda one item at a time.
- Notes, decisions and outcomes (discussed, deferred, carried forward) save
  instantly.
- Raise an action.
- Update, edit, reassign or close an existing action, as authorised in §4. These
  are queued and shown as pending.
- **Finalise** is enabled only when nothing is pending.

**MTG-4. Finalise.**
- Review the minutes first.
- On finalising, the meeting's `Record` folder becomes read-only.
- The section 9 rows are fixed.
- The status becomes Finalised.
- **From then on, the record is immutable.**

**MTG-5. Amendments.**
- Management can amend finalised minutes.
- Each amendment is appended, recording what, who, when and why.
- The original stays unchanged.
- A new PDF version is produced.

**MTG-6. PDF minutes.**
- A formatted PDF is saved in the *Meeting Minutes* library, in a folder per
  area.
- **Print** and **Download PDF** both use it.
- It is generated after finalising, as a separate step that can be retried
  (§5.4).

**MTG-7.** Minutes are never emailed.

### 3.7 Management (basic)

**MGT-1. Group figures** across all areas: total, open, overdue and completed
actions.

**MGT-2. Area table:** open, overdue and completed actions for each area.

**MGT-3. Drill-down.** Every figure opens exactly the actions it counts, using
the same rule.

The page is shown to management only. Everyone can read the underlying actions
in any case (E.0), so this page carries **no restricted information**. That is
deliberate; see §8.

### 3.8 Feedback bubble

**FB-1.** A small round button at the bottom right of every Hub view, which
never covers other controls.

**FB-2. The form.**
- Four types: improvement, bug, question, other.
- A description.
- It saves **instantly** to the Feedback list.
- The message "Thanks – your feedback has been sent" appears only after
  SharePoint confirms the save. If the save fails, the text is kept and **Try
  again** is offered.

**FB-3.** The author and time come from SharePoint's Created By and Created
fields.

### 3.9 Go-live

**GO-1. Checks before go-live:** security, load, accessibility, Power Automate
capacity, and the controlled removal of test records.

**GO-2. Staff.** The remaining staff are added through the People page, and
every person's access is confirmed as verified.

**GO-3. Launch.** Full go-live across the Hub, with no pilot.

**GO-4. Hub sender.** Switch to the Hub sender mailbox only if IT has set it
up. Otherwise the current email arrangement continues and nothing is blocked.

---

## 4. Permissions (corrected)

### 4.1 Inputs (no new storage)

| Input | Where it comes from |
|---|---|
| Role | `People.Role` |
| Administrator | `People.IsAdministrator` |
| Can post notices | `People.CanPostNotices` (new column) |
| Area membership | Competency Members |
| Can run meetings | `CompetencyMembers.CanManageMeetings`, per area |

For an action, the area **K** is its **primary area**. "Management" means a
Team Leader or the Group Head.

### 4.2 Operation rules

These are internal rules, not switches for administrators. Each is written
**once** in `domain/rules.js` and generated **once** into `flows.py`, replacing
the bundled `canManage` and `MANAGE` checks.

| Rule | Who passes, for action or area K |
|---|---|
| **runsMeetings(K)** | Management, or `CanManageMeetings` in K |
| **canRaiseFor(K, owner)** | Management, an engineer member of K, or runsMeetings(K): any eligible owner (a member of K, or management). A **technician** without runsMeetings(K): **only themselves**. |
| **canEdit(action)** (title, description, priority, close-out check; **never the owner**) | Management, an engineer member of K, runsMeetings(K), or the raiser |
| **canReassign(action)** (the new owner must be eligible) | Management, an engineer member of K, runsMeetings(K), or the raiser **unless the raiser is a technician without runsMeetings(K)** |
| **canClose(action)** (outcome rules and the close-out check stay) | Management, an engineer member of K, runsMeetings(K), or the raiser |
| **canReopen(action)** | Management, an engineer member of K, or the raiser. **Meeting rights alone don't grant it.** |
| **canStatus / canExtend / canComplete** | The owner, or anyone who passes canEdit |
| **canModerate(K)** (others' notices and comments, pin, archive) | Management, or an engineer member of K. **Meeting rights alone don't grant it.** |
| **canManageOthersEvents(K)** (Phase 2 calendar) | Management, or an engineer member of K |
| **canManageRegister(entry)** | Raiser, responsible person, engineer member of K, runsMeetings(K), management |
| **Updates and comments** (instant) | Unchanged: members of K, management, and the owner |

**What each role ends up with:**
- **Engineers.** Their action rights come from their **role**. Turning off an
  engineer's meeting switch removes **only** the meeting operations. Their
  edit, reassign, close and moderation rights are unchanged.
- **Technicians with meeting rights in K.** They can edit, reassign and close
  K's actions, and raise actions for others in K. They cannot reopen, moderate,
  or act in other areas.
- **Revoking meeting rights.** Every flow checks the membership row **when it
  processes the request**, so the extra authority ends at once. Grants on the
  open `Record` folder are removed and read back.

**Every route to a change of owner is closed:**
- **Raise:** canRaiseFor.
- **Reassign:** canReassign, and the new owner must be eligible.
- **Edit details:** the flow allows only Title, Description, Priority and
  RequiresCloseOut, and refuses any owner field.
- **Raising from a meeting** needs runsMeetings(K).
- **Status, extend, complete and reopen** never change the owner.

**Enforcement and messages.**
- The app shows only the options the person is allowed.
- The flows enforce every rule.
- A hand-built request is refused with a plain message, for example "As a
  technician you can raise actions for yourself in this area. Ask an engineer
  or meeting lead to raise it for someone else."
- Refusals are audited.

### 4.3 Can run meetings: administration

`SetMeetingRights` runs in *6 Administration*, with the person's People row
locked as a guard.

| Direction | Order of steps |
|---|---|
| **Grant** | Write the value, then grant on any open `Record` folder of K, then read back |
| **Revoke** | Remove the `Record` grants, read back, then write the value |

Engineers keep their default of Yes when they join an area, and technicians
keep their default of No.

### 4.4 Can post notices

**Today:** the Noticeboard gives All Users Add on the whole list, and its area
folders inherit that.

**Change** (the only change to existing grants):
- Create one new group, **Competency Hub – Notice posters**.
- Change the Noticeboard list grant to **All Users Read + Notice posters Add**.
- Before the change, Setup's Check confirms that the area folders still
  inherit.

**The switch:**
- `People.CanPostNotices` is the record of what an administrator decided. The
  group is how it is enforced.
- **Turning it off:** remove the person from the group, read it back, then
  write the column.
- **Turning it on:** write the column, then add the person and read it back.
- AddPerson and ReactivatePerson add the person to the group; PersonLeft
  removes them.

**Limits:**
- Nobody else has Add on the Noticeboard, so removal is effective.
- Site owners (you) can't be blocked.

**Proof:** see §7, Release 2 probe.

---

## 5. Architecture and data

### 5.1 SharePoint changes (Setup 1.2: additive, plus one regrant)

| Change | Release |
|---|---|
| New list **Feedback**: All Users Add, Administrators Contribute | 2 |
| New library **Meeting Minutes**: All Users Read, written by flows | 2 |
| New group **Notice posters**; Noticeboard regrant (§4.4) | 2 |
| `People.CanPostNotices` | 2 |
| History: `OwnerId`, `PreviousOwnerId`, `DueDayAtEvent` (Number), `CompletionKind` (Choice) | 1 (Setup 1.1.1) |
| Meetings: `OutlookEventId`, `InviteState`, `InviteToken`, `InviteAttempts`, `PdfState`, `PdfVersion` | 2 |
| `IsTestRecord` (indexed) on Actions, Register, Noticeboard, Meetings, Updates, Feedback | 2 |
| Settings rows: `QueueHealth`, `QueueHealthReason`, `MonitorHours`, `PreGoLiveTesting` | 1 and 2 |
| Index on `Actions.DateCompleted` | 2 |

Release 1 needs one small additive Setup run for the History columns, so that
history is complete from the start. Everything else is in a single Setup run
in Release 2.

**Not created:**
- Permission Overrides;
- Notice Acknowledgements;
- User Activity;
- calendar or reviewer groups.

The Records Export library stays in place, unused.

**Resulting counts:**

| Item | Count |
|---|---|
| Lists | 15 |
| Libraries | 2 |
| Groups | 14 |
| Permission levels | 3 |
| Unique permission scopes at go-live | About 100 |

The recommended limit is 5,000 scopes.

### 5.2 History needed for Phase 2 (H-1, Release 1)

Each action event row records:

| Event | Records |
|---|---|
| Raised | `OwnerId`, `DueDayAtEvent` (the original deadline) |
| Reassigned | `PreviousOwnerId`, `OwnerId` |
| Deadline extended | Already recorded: previous and new deadline. Also `OwnerId`. |
| Completed or Closed | `CompletionKind` (MarkedDone, ClosedByManager, Withdrawn), `OwnerId` (owner at that time), `DueDayAtEvent` (deadline in force), the outcome, and the actor |
| Reopened | `OwnerId` |

The Phase 2 statistics can then be calculated from History alone.

### 5.3 Flows

All request flows share the steps already generated in `flows.py`: claim,
transaction, commit, outbox and send. There are no child flows. Each request
flow picks its own request types through a trigger condition on
`RequestType`. All flows keep concurrency 1, and each stays under 500 actions.

| Flow | Phase 1 contents | Release |
|---|---|---|
| 1 Daily tasks | Shared email retries; checks the monitor's heartbeat; removes expired access | 1, 2 |
| 2 Request queue | Actions; the split rules (§4.2); the technician restriction; History fields H-1; no raiser emails | 1, 2 |
| 3 Queue monitor | REL-1; runs every 15 minutes in working hours and hourly outside them | 1 |
| 4 Records | Notices, comments, the register, linked actions, settings | 3 |
| 5 Meetings | Booking with invitations, start and agenda, finalising, amending, the PDF | 4, 5 |
| 6 Administration | Retry, Cancel, Finish and Revert; people, areas, meeting rights, notice posting; feedback status changes go direct | 1, 2 |

### 5.4 Outlook invitations and PDF

**Invitations** use Office 365 Outlook: Create event (V4), Update event (V4)
and Delete event (V2), with the connector's own retry turned off.

**Organiser.** The organiser is the connection's mailbox, which is **your
calendar** (this needs your approval, §9). Creating events in a shared
mailbox's calendar is **not proven**. Nothing is switched without a successful
probe and your agreement.

**Handling uncertain results** (a call may have worked even if it timed out):

1. Before creating, the flow saves `InviteToken` (for example `ESGM00042-1`)
   and sets `InviteState = Creating`. The token is also written into the event
   body.
2. **Success:** the flow stores `OutlookEventId` and sets the state to Sent.
3. **Definite refusal (4xx):** the state becomes Failed and the step is safe to
   retry.
4. **Timeout or 5xx:** the state becomes Unknown. **Before any retry**, the flow
   runs Get events (V4) for that day and adopts the event carrying the token.
   It creates a new event only if none is found.
5. **Update** uses the stored ID. **Delete** counts a 404 as already done.
6. After 3 attempts the state becomes Failed and an alert is sent. **The
   meeting itself stands.**

**Probe P-INV** runs at the start of Release 4, with your go-ahead. It checks
that:
- the invitations arrive;
- updates and cancellations go out;
- Get events finds the token;
- the organiser shown is the expected one.

**PDF.**
1. **Finalising commits the frozen record first.** Only then does it set
   `PdfState = Pending`.
2. The PDF step builds HTML from the frozen rows, creates the file in your
   OneDrive, runs **Convert file (PDF)**, and saves the result to
   `Meeting Minutes/{area}/MTG-{id}.pdf`. It then sets the state to Ready.
3. **If it fails:** the monitor retries it. After 3 attempts the state is
   Failed and an alert is sent. The minutes stay readable in the app, with
   "PDF being prepared".
4. **Amendments** create a new library version. The frozen rows and the
   amendment rows remain the authoritative record.

**Probe P-PDF** runs at the start of Release 5. It includes the DLP check for
OneDrive. The fallback, a print-styled page in the app with "Save as PDF", is
used **only if** the probe fails.

---

## 6. Phase 2 backlog (after go-live)

Each item keeps its Revision 4 requirement, as amended here. None of them
blocks Phase 1.

| ID | Implementation | Hours (range) | Depends on | Notes |
|---|---|---|---|---|
| C1 | Calendar: month, agenda and My Calendar views (CAL-1, CAL-4) | 8 (6–11) | Phase 1 meetings | The existing 60-day area list stays until then |
| C2 | Own events, repeating events (up to 24), editing and cancelling others' events (canManageOthersEvents) | 8 (6–11) | C1 | No invitations for ordinary events |
| D2 | Staff performance statistics (Revision 4 §5.5 definitions) | 9 (7–12) | H-1 history | See §8: true restriction needs a report built by a flow, +4 h |
| D3 | Participation figures from existing records | 4 (3–6) | D2 | |
| A6 | Create and archive areas | 7 (5–10) | Phase 1 admin engine | Setup can add an area until then |
| L1 | Link and unlink an action to several areas, with a grant on the primary `Updates/{K}/A{id}` folder | 6 (4–8) | Phase 1 | The rules then extend to linked areas |
| T1 | Detailed Overview and History tabs | 6 (4–8) | — | |
| NB | "Needs your attention" panel | 4 (3–6) | Phase 1 meetings | |
| **Total** | | **52 (38–72)**, +4 if D2 must be server-restricted | | |

**Still deferred, outside both phases:**
- the home-page design: about 5 hours (3–8) once you have chosen;
- the WebView and header tests;
- the 27-inch screenshot.

---

## 7. Phase 1 workload and releases

**Hours** are focused build time: code, simulator, unit and
browser tests, packaging, HOW-TO, and fixing what your on-site checks find.
They exclude your own testing time and IT lead times.

**Shared work is counted once:**
- each flow's skeleton is counted in its first item;
- the permission helpers ported from Setup are counted in A1.

### 7.1 Phase 1 items

| ID | Scope | Status | Rating (1–10) | Hours (range) | Depends on | Importance | Remaining risk |
|---|---|---|---|---|---|---|---|
| R1 | Queue monitor: roll-forward, email, invitation and PDF retries, out-of-hours schedule, heartbeat | Not started | 7 | 10 (8–14) | — | Very High | Several re-fired requests at once (concurrency 1 queues them) |
| R2 | Honest states; *6 Administration* skeleton; Retry, Cancel, Finish, Revert; admin queue page | Not started | 6 | 8 (6–11) | R1 | Very High | Revert is only for action changes |
| R3 | Limited mode per part; health line | Not started | 4 | 4 (3–6) | R1 | High | — |
| R4 | D1–D5 fixes; History fields H-1 (with a small Setup step) | Defects | 3 | 3 (2–4) | — | High | — |
| S1 | Setup 1.2 (§5.1) and tests | Not started | 4 | 5 (4–7) | — | Very High | The regrant on the live site (only you are affected) |
| P1 | Split operation rules (§4.2) in the app and flow; technician restriction on every route; tests | Not started | 5 | 6 (4–8) | — | Very High | Request flow size, about 380 → 400 of 500 actions |
| A1 | Admin engine: group and folder grants with read-back, audit, no self-change, last-admin guard | Logic exists in Setup | 7 | 9 (7–13) | R2, S1 | Very High | First group changes run from a flow |
| A2 | People: add, paste list, role, leaver, reactivate | Not started | 6 | 10 (8–14) | A1 | Very High | `ensureuser` for people who have never visited (Setup already handles this) |
| A3 | Area tick boxes, Can run meetings, expiry | Column exists | 5 | 7 (5–10) | A1 | Very High | — |
| A4 | Can post notices | Not started | 3 | 3 (2–5) | A1, S1 | Medium | — |
| PR | **Release 2 permission probe** with one ordinary account: blocked notice gets 403 through REST; technician restriction; chair rights in K but not in Y; own request folder only; add-only; reassign proven on site | Probe pattern exists | 3 | 3 (2–4) | A1–A4, P1 | Very High | Needs your test account (§9) |
| N1 | Notices: edit, pin, archive, hide comment (*4 Records* skeleton) | Posting is ON SITE | 5 | 8 (6–11) | S1, P1 | High | — |
| N2 | Comments, flags and withdrawal, discussion history | Flags are counted, read-only | 4 | 5 (4–7) | N1 | High | Add-only proven by PR |
| G1 | Register, including linked actions | List exists | 5 | 9 (7–12) | N1 | High | — |
| A7 | Settings editor (4 values) | Not started | 2 | 2 (2–3) | A1 | Medium | — |
| A8 | Feedback bubble and review | Not started | 3 | 5 (4–7) | S1 | Medium | — |
| D1 | Basic dashboard and drill-down | Management home line exists | 4 | 6 (5–8) | — | High | — |
| M1 | *5 Meetings* skeleton: book, update, cancel with invitations; P-INV; Meetings tab list | Lists exist | 8 | 15 (11–21) | A3, P1 | Very High | Connector behaviour; organiser identity |
| M2 | Agenda snapshot and manual items | Not started | 7 | 12 (9–16) | M1, N2, G1 | Very High | — |
| M3 | Live screen, including raise, edit, reassign and close from the meeting | Not started | 8 | 16 (12–22) | M2, P1 | Very High | — |
| M4 | Finalise (immutable) and amendments | Not started | 7 | 10 (8–14) | M3 | Very High | — |
| M5 | PDF: P-PDF, template, conversion, PdfState, Print and Download | Not started | 7 | 9 (6–14) | M4 | High | DLP or conversion blocked (fallback ready) |
| Q1 | Final security sweep: every request type refuses unauthorised users, XSS, S1–S8, grants against §5.1 | Partly covered by PR | 4 | 6 (4–9) | All | Very High | — |
| Q2 | Load test (10,000 actions, 60,000 History rows); indexed-first query audit | Simulator ready | 4 | 5 (4–8) | All | High | — |
| Q3 | Accessibility | Partly | 3 | 4 (3–6) | All | High | — |
| Q4 | Power Automate use measured on site; adjust monitor hours | Not started | 2 | 2 (1–4) | Releases 1–5 live | High | Shared allowance with the 1-to-1 |
| Q5 | Test-record clean-up (§7.4) | Not started | 5 | 6 (4–8) | S1 | Medium | — |
| GO | Add the staff, verify access, final health check | Not started | 3 | 4 (3–6) | A2, A3, Q1 | Very High | — |
| SN | Switch to the Hub sender (only if IT is ready) | Waiting for IT | 2 | 2 (1–3) | IT | Medium | Not on the critical path |

### 7.2 Totals

| Scope | Best | Range |
|---|---|---|
| **Phase 1** | **about 194 h** | 145–275 h |
| Phase 1 without SN | about 192 h | — |
| **Phase 2** | **about 52 h** | 38–72 h |

**Why Phase 1 is not simply 241 − 52 = 189 hours.**

Extra work:
- the permission split replaces the smaller A5 item: +3 h;
- the History fields: +1 h;
- the uncertain-invitation handling and the Meetings tab list: +1 h;
- the early Release 2 probe: +3 h.

Savings:
- the final security sweep shrinks because the probe already covers part of
  it: −2 h;
- the load test needs fewer data types: −1 h.

### 7.3 Releases (6 imports to go-live)

| Release | Contents | Hours | On-site check by you |
|---|---|---|---|
| **1 Safety net** (next) | R1, R2, R3, R4; Setup 1.1.1 adds the History columns | 25 | Turn the request queue off, raise an action, turn it back on: the monitor recovers it. Admin page and health line. |
| **2 Administration and permissions** | S1, P1, A1, A2, A3, A4, PR | 43 | Run Setup 1.2. Add the **test account**, then run the permission probe at once. Reassign is proven. |
| **3 Noticeboard, register, feedback, settings, dashboard** | N1, N2, G1, A7, A8, D1 | 35 | Notices, register, bubble, settings, dashboard |
| **4 Meetings I** | P-INV, M1, M2 | 27 | Book, change and cancel a TEST meeting with yourself (and the test account) as attendees; start it and check the agenda |
| **5 Meetings II** | P-PDF, M3, M4, M5 | 35 | Run a TEST meeting end to end; finalise, amend, print and download |
| **6 Go-live** | Q1–Q5, GO, and SN if ready | 27 (+2) | Clean up, add the staff, go live |

**Critical path:** R1 → R2 → S1 → A1 → A3 → M1 → M2 → M3 → M4 → M5 → Q1 →
Q5 → GO, about **117 hours**. P1, N1, N2 and G1 must also be ready before M2
and M3. They run alongside A1–A3 in Releases 2 and 3.

**Next recommended:** Release 1, the safety net.

**Ways to save more time without losing anything essential:**

| Option | Saves | Trade-off |
|---|---|---|
| Drop **Revert** and keep only Finish | 3 h | A change that can't be finished stays locked until it is fixed by hand |
| Merge Releases 4 and 5 | One import and test cycle | A larger first meetings test |
| Skip the Notice posters difference report in Daily tasks | 1 h | Setup's Check still finds any difference |

I don't recommend dropping Revert. The other two are reasonable if time
matters more than smaller test steps.

### 7.4 Test-record clean-up (Q5)

1. From Release 2, while `PreGoLiveTesting = Yes`, flows and the app set
   `IsTestRecord = Yes` on everything they create.
2. **Earlier TEST records:** you mark them by hand on the clean-up page. No
   title rule is used.
3. **Review:** the page shows every marked record and the records that depend
   on it:
   - Updates;
   - History;
   - Requests;
   - ledger rows;
   - meeting items;
   - linked actions;
   - PDFs.

   A link to an unmarked record blocks the clean-up.
4. **Confirm:** type `REMOVE TEST DATA`. *6 Administration* then:
   - deletes the records, which go to the recycle bin and stay recoverable for
     93 days;
   - writes one audit event listing them all;
   - sets `PreGoLiveTesting = No`.

---

## 8. Acceptance criteria

**Every release:**
- Simulator tests for each flow pass, with an interruption at every write and
  then recovery.
- Unit and browser tests pass.
- The validator and the package check pass.
- **No regression:** all existing tests still pass, and your on-site checks
  pass.

**Permissions, tested in Release 2 on the real site and again in Q1:**
- **Technician restriction**
  - A technician without meeting rights can raise an action for themselves.
  - Raising for anyone else is refused in the app **and** in the flow,
    including a hand-built request.
  - Meeting rights in another area don't count.
  - A technician without meeting rights can't reassign an action they raised.
  - Editing details refuses any owner field.
- **Meeting rights in K** (engineer or technician)
  - Allow booking, chairing and managing the agenda.
  - Allow editing, reassigning and closing K's actions, from the action panel
    and from a meeting.
  - **Refuse** reopening, notice moderation, and acting in area Y.
- **Revoking** meeting rights ends the extra rights at the next request. The
  open `Record` grants are removed and read back.
- **Engineers and management are unchanged.**
- **Notice posting**
  - Anyone can post in any area by default.
  - A blocked person gets 403 on a direct REST post.
  - Turning the switch back on restores posting.
  - Grants before and after the change are compared, and nothing unrelated
    changes.
- **Administration**
  - Nobody can change their own privileges.
  - The last administrator is protected.
  - Every change is audited with all of its fields.
- **Feedback and settings**
  - Non-administrators can't read the Feedback list (REST 403 or an empty
    result).
  - Changing a setting is administrator-only, validated and audited.

**Reliability:**
- Each interruption leads to exactly one History event and exactly one email.
- A partly applied change shows "Not fully recorded", never "Saved" or "Rolled
  back".
- Cancel is refused once values have been written.
- Revert restores the values and records an audit event.
- A timed-out invitation is reconciled using its token, and never creates a
  second event.
- A failed PDF leaves the Finalised status and the frozen rows untouched, and
  Retry works.
- A stale reminder signal doesn't disable action changes.
- The monitor runs out of hours.

**History:**
- Fixtures cover raise, reassign, extend, mark as done, close by a manager,
  reopen and completing again.
- Every event carries the H-1 fields.

**Removed features stay removed.** A static scan finds no acknowledgement,
permission override, activity tracking, CSV export, digest or raiser email
code.

**Excluded:** a two-account user exercise, a staff trial, and a pilot. The
single test account is used only for the technical probe.

---

## 9. Your input needed (genuine blockers)

| # | What | Needed by |
|---|---|---|
| 1 | **One ordinary, non-owner account** for the Release 2 permission probe, for example a test account from IT or a willing colleague for one session. It is added through the app as a technician and removed afterwards. Without it, the permissions can't be proven on the real site. | Release 2 |
| 2 | **Organiser identity.** Do you agree that meeting invitations come from **your own calendar** (you as organiser, with replies and acceptances to you), unless the probe proves that a Hub shared-mailbox calendar works and you then agree to switch? | Release 4 |
| 3 | **IT, in parallel (not a blocker).** A shared mailbox with Send As and Full Access for your account. Confirmation that DLP allows Outlook, SharePoint and OneDrive together. | Release 5 (DLP) and go-live (sender) |

---

## 10. Critical self-review

**Contradictions checked:**
- **Meeting rights versus moderation.** Revision 4's "meeting runners moderate"
  is replaced throughout. Moderators are engineers of the area and management.
  REG-2 keeps meeting runners for register status, because register outcomes
  are part of meeting business. It isn't on your excluded list. **Tell me if
  you want it removed.**
- **Raiser rights.** The raiser keeps edit, close and reopen. A technician
  without meeting rights, as raiser, loses only reassign. This matches 1.5
  ("keep normal raiser abilities that don't contradict").
- **Calendar.** The existing area Calendar tab (a 60-day read-only list) and
  the Calendar Events grants are left untouched. Meetings appear in the
  Meetings tab. Nothing in Phase 1 depends on C1 or C2.
- **Multi-area.** Phase 1 judges action rights by the primary area only. The
  existing "Shared from" display of `LinkedCompetencies` stays read-only. No
  links can be created until L1.
- **Register-to-action links** stay in Phase 1. They use `SourceType` and
  `SourceId`, not multi-area linking.

**Requirements cross-checked against your §4 list.**
- Every item maps to §3, including:
  - authorised reopening;
  - blockers;
  - accurate assignment and completion data (H-1);
  - out-of-hours recovery (REL-1).
- Nothing from Phase 2 or the removed list is in Phase 1.

**Restricted management information (your 5.5).**
- Everyone can read every area (E.0), so action data is not secret.
- The Phase 1 dashboard is therefore a presentation only. It hides nothing that
  needs protecting, and it is honestly labelled so.
- **Phase 2 staff statistics are different.** They are computed from History,
  which everyone can read. If they must be **truly** restricted, the figures
  should be built by a flow into a folder only management can read: +4 h, noted
  in D2. That is a Phase 2 decision.

**Assumptions not yet proven:**
- add-only access for ordinary users, and whether Created By can be forged
  (Release 2 probe);
- invitations, and token lookup through Get events (P-INV);
- OneDrive conversion and DLP (P-PDF);
- several re-fired requests at once;
- daily Power Automate use while sharing the allowance with the 1-to-1 (Q4).

**Scope trimmed:**
- no new permission framework;
- no new lists beyond Feedback, plus the Minutes library;
- only 4 settings;
- one new group;
- Revert limited to action changes.

**Dependencies corrected:**
- M2 needs N2 and G1, which are Release 3, before Release 4;
- M3 needs P1, Release 2;
- the probe needs your test account, before any staff are added.


---
