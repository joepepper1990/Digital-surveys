# ESG Competency Hub — Planning Package (revision 3)

**Environmental Safety Group, Dungeness B Power Station**
**Status:** plan approved on 19 October 2026 (revision 3, after a second independent review, J.2); layout, access model, flow account and management roles decided on 21 October 2026 (E.0, K4). Remaining decisions in I.4 are recorded in the Phase 0 decision log as they are confirmed. Nothing has been deployed or changed in SharePoint.

---

## Context

The Environmental Safety Group runs ten operational competency areas. Their
actions, deadline extensions, improvements and degradations, notices, calendars
and monthly meetings are currently kept in separate places. As a result:

- information is entered more than once;
- meeting agendas are prepared by hand;
- deadlines are chased manually.

The ESG Competency Hub brings all of this into one SharePoint Online
application, with:

- the same structure for every competency area;
- a personal view of each person's actions;
- auditable deadline extensions;
- automatic reminders;
- meeting agendas built from existing records;
- frozen meeting records;
- a management overview;
- administration of people and access that never requires editing lists.

**What this revision does.** It responds to the review of revision 2. The changes
are:

| # | Change | Where |
|---|---|---|
| 1 | Corrected date arithmetic for reminders | D.0.1, F.4 |
| 2 | Transaction processing with resumable steps that cannot report false success | F.1 |
| 3 | A secure way to create the first administrator (bootstrap) | E.5.1, G.3 |
| 4 | A notification ledger that allows safe retries | F.4.2 |
| 5 | Instant direct writes for routine updates, discussion flags and live meetings | C.8, F.5, F.7 |
| 6 | Flow identity treated as an open decision | G.6, D-03 |
| 7 | A simplified design: 14 lists and 9 flows, with a bottom-up estimate | D.7, F.9, H.5 |
| 8 | A register showing what you have approved and what is only recommended | 0.4 |
| 9 | A further check for contradictions, then a second independent review, whose 40 findings are all resolved in the body | J |

Section L lists every change; J.2 lists each review finding and its resolution.

---

## 0. Evidence base and requirement status

### 0.1 Recorded results from the ESG 1-to-1 project (evidence, not re-verified for the new site)

The 1-to-1 project's documentation (branch `claude/esg-technician-1-to-1-607sc3`,
Stage 0A/0B reports, 14–16 Oct 2026) records the following results in this
tenant. Comments in the 1-to-1 code say its Welcome wrapper was adapted from the
DSL application. The `dsl-master-conformance` repository attached to this session
is **empty**, so DSL code could not be reviewed.

| Recorded result | Used here for |
|---|---|
| A Welcome custom layout loads an external script from *Welcome Web Part - Custom Layouts* through `<script src data-layout data-exports>`. The script exposes `window.Name = function (ctx) { return { onInitialize, onError, onDispose }; }`. | The frontend (G.2) |
| `ctx.getWebPart()` provides `spHttpClient`, `pageContext.web.absoluteUrl` and `configurations.v1`. Same-origin REST works as the signed-in user. | All reads and writes |
| Item and folder unique permissions, custom permission levels and REST access with Limited Access all work. Users see only items granted to them. They cannot share, grant access, add columns or overwrite layout files (B1–B19). | Competency isolation |
| Text rendered with `textContent` stays inert when attack strings are entered (B15/B16) | Code rules |
| Users must have Read on the Welcome Errors list, or the page renders blank | Permissions |
| A user can break inheritance on an item they can edit, but cannot grant access, so the flow account must be Site Collection Administrator (B10a) | Flow account set-up |
| Per-person "update" folders, where the flow takes identity from the folder (Flows 9/10). This was simulated, but the release 1.5 tenant run is **not recorded**. | Requests queue |
| Unmanaged solution, standard connectors and an idempotent Setup flow. Import and activation are reported in the tenant. | Backend |
| Flows triggered by SharePoint polling. The tests *expect* results "within about 5 minutes"; this was not measured. | Save-latency design |
| Date writes through `validateUpdateListItem` depend on regional settings. The 1-to-1 makes them reliable with a learned format and a read-back check. | Calendar dates |

### 0.2 Confirmed from current Microsoft documentation (checked 19 Oct 2026)

| Fact | Consequence |
|---|---|
| Unique permissions: 50,000 per list supported, 5,000 recommended. Inheritance cannot be broken on a list or folder holding more than 100,000 items. | Permissions are set per folder. Folders are created early. |
| Microsoft 365 licence: 6,000 Power Platform requests per user per 24 h is the official limit. The transition-period limit is 10,000 per flow. Every action counts, and automated or scheduled flows count against the **owner**. | Lean flows; measure usage; flow-owner choice (G.6) |
| With trigger concurrency turned on, runs can be dropped once the waiting-runs limit is reached. Microsoft advises leaving it off. | Queue trigger concurrency stays off |
| A flow whose owner leaves drops to the Low profile. Flows that fail for 14 days are turned off. | Flow-owner choice; monitoring |

### 0.3 Not established (Phase 0 probes in H.1, confirmations in I.2)

- Measured trigger latency.
- Welcome on tablets.
- Whether `pushState` is safe on the SharePoint page.
- Whether Created By, Created or Modified can be forged when an item is created.
- Whether a user with Add-only rights can create items in a folder through REST.
- Whether SharePoint allows multiple blank values in a unique column. (The design avoids relying on this: every unique key is always populated.)
- Whether Outlook's Sent Items search works from a flow, and how it splits search terms.
- Whether a SharePoint trigger accepts a list environment variable, and how long child-flow calls may run.
- Behaviour of `$batch` from a flow.
- Date round trips.
- Welcome availability and licensing for the new site.
- Data loss prevention (DLP) settings.
- Whether a service account and a shared mailbox are permitted.
- Volumes.
- User principal names (UPNs).
- Role titles.
- Administrators.
- Retention.

### 0.4 Status of requirements and decisions

Legend:

| Code | Meaning |
|---|---|
| **[Brief]** | Required by the original brief |
| **[You]** | Stated by you during planning |
| **[Answered]** | Your answer to a planning question. Provisional, so confirm it when you approve the plan. |
| **[Rec]** | Architectural recommendation made during planning. Needs your approval. |
| **[Assumption]** | Unverified; checked in Phase 0 |

| Item | Status |
|---|---|
| All functional requirements in the brief: users, memberships, roles, modules, extensions, reminders, meetings, dashboard, administration, security, audit, testing and deliverables | **[Brief]** — none removed |
| Professional, natural naming; clean HTML, CSS and JavaScript; no references to AI | **[Brief]**, reaffirmed **[You]** |
| The Competency Hub is a separate project, unrelated to earlier work in this repository | **[You]** |
| Frontend: Welcome by Accelerator 365 with professional HTML, CSS and JavaScript. Backend: SharePoint lists and Power Automate. No SPFx, React or Power Apps. | **[You]** |
| Welcome is installed and proven with the DSL and ESG 1-to-1 applications | **[You]** (supported by the 0.1 evidence for the 1-to-1) |
| A new, dedicated SharePoint site | **[Answered]** — confirm at approval (D-05) |
| Everyone can read every area; only members, and Team Leaders and the Group Head, can write (E.0) | **[You]**, 21 Oct 2026 |
| Front-page layout: home tiles at full width (K2) | **[You]**, 21 Oct 2026 |
| Flow and notification identity | **Open decision** (D-03). Your earlier answer ("my own account") is to be reconsidered, as you asked; options are in G.6. |
| Everything else: list design, folder security, request queue, direct writes, flows, the transaction model, the UI design and visual style, the repository location, the test environment, the close-out rule, reminder frequencies, the meeting snapshot point, the amendment model, retention, and deferring PDF minutes | **[Rec]** — the decisions in I.4 |
| Volumes, devices, latency and the tenant settings listed in 0.3 | **[Assumption]** |

---

## A. Executive summary

**Application.** One SharePoint Online application. It provides:

- a welcome page;
- *My Actions*;
- ten identical competency areas, each with Overview, Actions, Improvements &
  Degradations, Noticeboard, Calendar, Monthly Meetings and History;
- a management dashboard;
- administration screens.

**Recommended architecture [Rec, on the [You] platform].**

1. **Frontend.**
   - One Welcome custom layout: `competency-hub.html` plus `competency-hub.js`,
     uploaded to the site's layouts library.
   - It runs on `Hub.aspx` in a full-width section of a new communication site.
   - The JavaScript is plain modules, built into one file, using the proven
     lifecycle wrapper.
   - Same-origin REST only, through Welcome's `spHttpClient`.
   - No libraries and no external calls.
2. **Data.**
   - 14 SharePoint lists and one export library.
   - Records that need protecting live in **one folder per competency**. Folder
     permissions are granted to that competency's SharePoint group.
3. **Two write paths, chosen per operation (C.8).**
   - **Instant direct writes** where SharePoint permissions alone enforce the
     rule. These are:
     - progress updates, blockers and comments;
     - discussion flags and their withdrawal;
     - new notices;
     - calendar entries;
     - everything recorded during a live meeting (attendance, outcomes, notes,
       new business, decisions).

     These records are append-only, or editable only by their author, in folders
     the user is allowed to write to.
   - **Queued controlled changes** for everything that must follow business
     rules. These are:
     - raising and changing actions, extensions, closure and reassignment;
     - register entries and their status;
     - moderation;
     - meeting lifecycle;
     - administration.

     The user writes a request into **their own folder** of the Requests list.
     A flow then processes it as a resumable **transaction**:
     1. identify the requester from the folder;
     2. take a private copy of the request, so later edits to it have no effect;
     3. authorise, validate and check concurrency;
     4. lock the record;
     5. carry out ordered, idempotent steps, including the history and
        notification records;
     6. mark it **Applied** only after every essential step has succeeded;
     7. release the lock.

     The UI never blocks while this happens: the change shows as pending until
     the server confirms it.
4. **Automation.** Nine flows, using standard connectors only:
   - Setup (which includes secure bootstrap of the first administrator and the
     initial import);
   - Daily Tasks;
   - Request Queue, with four domain child flows;
   - Send Notification (an outbox ledger with safe retries);
   - Queue Monitor.
5. **Flow and notification identity.** This is an open decision (D-03). The
   recommendation is a dedicated, licensed service account that is Site
   Collection Administrator, sending from a shared mailbox, with co-owners. If IT
   does not permit that, the fallback is your own account with a shared mailbox
   (G.6).

**Constraints:**

- Queued changes take as long as the SharePoint polling trigger, which is
  unmeasured (about 5 minutes is expected).
- Site owners and the flow account can change any record.
- Power Platform request limits apply to the flow owner.
- IT dependencies: site creation, Welcome on the new site, DLP, and the service
  account and mailbox if chosen.

**Readiness.** The Welcome platform pattern is proven by the 1-to-1. Development
can start once:

1. Phase 0 has recorded results for P-01 to P-15, and the gate in H.1 has
   decided which fallbacks apply;
2. the decisions in I.4 (D-02 to D-13, D-15 and D-16) are approved;
3. confirmations C-01 to C-03, C-11 and C-12 are in place, and the site exists.

**Effort.** A bottom-up estimate of **97–136 developer-days** [Assumption; H.5].
An earlier draft of this revision gave 88–124. The independent review found that
its table actually summed to 84–118 and left out several components. With those
added, the simplifications in this revision are offset by the robustness work
both reviews required, so the effort is essentially the same as revision 2
(97–139). What has changed is that the design is simpler to operate and safer.
The size reflects the brief's functional scope: ten modules, about 25 screens,
audited administration and a meeting system.

---

## B. Functional specification

Each requirement is **[Brief]** unless tagged. **[Rec]** or **[Rec D-xx]** marks
detail added during planning that needs your approval. The *instant* and
*queued* labels throughout are the save model recommended in D-02 (C.8); they are
not part of the brief. Requirement IDs are used by the test plan in H.4.

### B.1 Welcome page

| ID | Requirement |
|---|---|
| WEL-01 | Greet the user by first name: "Good morning / Good afternoon / Good evening, {first name}" (UK local time), then "Welcome to the ESG Competency Hub". The first name comes from the user profile `FirstName`; if that is empty, use the first word of `currentuser` Title. Nothing is hard-coded. |
| WEL-02 | A prominent **Raise Action** button |
| WEL-03 | **My actions** tiles: Open, Overdue, Due within 7 days, Extended. Each tile links to its filtered list. |
| WEL-04 | **My upcoming deadlines**: the next 5 |
| WEL-05 | **Monthly meetings**: for each of the user's areas, the next meeting, its status and the number of flagged items |
| WEL-06 | **Your competency areas** cards: open, overdue, flagged and next meeting. Management sees all ten areas. |
| WEL-07 | **Important notices**, **Important dates** (14 days) and **Unresolved degradations** |
| WEL-08 | For management: Management Dashboard and **Needs attention**. For administrators: failed requests and failed notifications, plus an **automatic-processing health banner** [Rec] if the heartbeat is stale (F.1.6). |
| WEL-09 | For administrators: People & Access, Competency Settings, System Administration |
| WEL-10 | Plain empty states. A user with no memberships sees "Contact {administrator names}". |

### B.2 Competency area

Tabs: **Overview · Actions · Improvements & Degradations · Noticeboard · Calendar · Monthly Meetings · History**

| ID | Requirement |
|---|---|
| CMP-01 | **Overview**: open, overdue, due within 7 days and extended actions; unresolved degradations; notices awaiting discussion; next and last meeting; dates in the next 30 days |
| CMP-02 | Every count drills down to exactly the records it counts, using the same rule |
| CMP-03 | Cross-competency actions are included and labelled "Shared with {areas}" |
| CMP-04 | No scores |
| CMP-05 | **History**: closed actions, resolved register entries, archived notices and finalised meetings, with search |
| CMP-06 | Archived areas are read-only to everyone, listed under "Archived areas", and closed to new records (amended by E.0) |
| CMP-07 [You] | Every area is visible to everyone. Members of an area, and Team Leaders and the Group Head, can add and change things there; everyone else has read-only access (E.0). |

### B.3 Actions

| ID | Requirement |
|---|---|
| ACT-01 | **Raise action** has five required fields: Title (up to 255 characters), Description, Competency, Assigned to and Target date. Optional: Priority (Low/Normal/High), Also relevant to, Requires close-out check (default Yes for High), Links and Attachments (up to the Settings maximum). |
| ACT-02 | The server records the reference `ACT-nnnnn` (from the item ID), Raised by, Date raised, Original deadline, Current deadline, Status Open, Extensions 0 and Revision 1. It sends an assignment notice. |
| ACT-03 | The target date must be today or later (UK) and no more than `MaxDeadlineYears` ahead. The owner must have access through one of the action's competencies or through management. |
| ACT-04 | Statuses: Open, In Progress, Awaiting Input, Completed, Closed. *Overdue* and *Extended* are calculated indicators, not statuses. |
| ACT-05 | Transitions follow F.2. **Mark complete** closes the action unless *Requires close-out check* is set [Rec D-07]. |
| ACT-06 | The owner can: post progress updates (**instant**); record a blocker (the note is instant and the status change is queued); clear a blocker; extend the deadline; mark complete; and add evidence. The owner closes an action only through *Mark complete*. |
| ACT-07 | **Action managers** are: the raiser, engineers and meeting administrators of the action's areas, and management. They can do everything the owner can, plus: edit details; reassign (reason required); close with an outcome; reopen (reason required); link and unlink areas. Changing the primary area is limited to management and administrators. |
| ACT-08 | Every change is recorded in **History**: actor, time, previous value, new value, reason. Progress updates and comments are recorded in **Updates**. |
| ACT-09 | **My Actions**: actions across all the user's areas. Tabs: Open, Due soon, Overdue, Extended, Completed/Closed. Filters and text search. |
| ACT-10 | **Cross-competency.** One record, visible to every linked area and to management. Linking requires an action manager who is a member of the target area, or management. Unlinking removes access **before** the link is removed from the record (F.1.3). |
| ACT-11 | **Concurrency.** A change based on an older revision is rejected: "This action was updated by {name} at {time}. Review the latest details and try again." A change to a record that is being updated is rejected: "This action is being updated. Try again in a minute." |
| ACT-12 | **Evidence** is stored as attachments on the action. Only an administrator can remove a file. The removal is audited, and the file is kept on the administrators-only transaction record. |

### B.4 Deadline extensions

| ID | Requirement |
|---|---|
| EXT-01 | The owner can extend. Action managers can extend on the owner's behalf; this is recorded and the owner is notified. |
| EXT-02 | A reason is mandatory (10–1,000 characters). There is no limit on the number of extensions. |
| EXT-03 | The new date must be after the current deadline and not before today (UK). Completed and Closed actions cannot be extended. |
| EXT-04 | Each extension is an append-only History row. It records: extension number, original deadline, previous deadline, new deadline, reason, who extended, when, whether the action was overdue at the time, days overdue, whether it was on behalf of the owner, and the request key. |
| EXT-05 | Display: ~~20 October 2026~~ → 30 October 2026, who extended it, when, and the reason. A link reads "Show all extensions (n)". The original deadline is always visible. |
| EXT-06 | Management filters: extension count, *Extended while overdue*, *Past original deadline* |
| EXT-07 | The request carries the deadline the user saw. If it is stale, the extension is rejected. |
| EXT-08 | Reminders move to the new deadline. The owner gets a confirmation. |
| EXT-09 | An administrator can correct an original deadline, with a reason. This is a separate History row; extension rows are never edited. |

### B.5 Reminders and notifications

| ID | Notification | Recipient | When |
|---|---|---|---|
| NOT-01 | **7-day reminder** (mandatory) | Current owner | At the first daily run when 7 calendar days or fewer remain (UK dates, calculated as in D.0.1). It is not sent separately if a deadline-bearing notice (assignment, reassignment or extension) was **sent** to this owner, for this deadline, while 7 or fewer days remained. |
| NOT-02 | Due today | Owner | On the deadline day, unless already covered by a notice sent that day |
| NOT-03 | Overdue | Owner | On day 1 overdue, then every `OverdueReminderIntervalDays` [Rec D-08: weekly] |
| NOT-04 / 05 | Assigned / reassigned away | New owner / previous owner | On the change, unless the recipient made it |
| NOT-06 | Extension confirmation | Owner (and the raiser, by setting) | On each extension |
| NOT-07 | Ready for close-out | Raiser | When an action that needs a close-out check is completed |
| NOT-08 | Closed | Owner and raiser (setting) | When someone else closes the action |
| NOT-09 | Minutes available | Attendees and apologies | On finalisation and on amendment |
| NOT-10 | Management summary | Management | Once per week [Rec D-08], on the first run on or after `ManagementSummaryDay` |
| NOT-11 | Administrator alerts | Administrators | A request needs attention; a notification is abandoned; a heartbeat is stale; the access check found drift; a tripwire fired; a lock is stale |
| NOT-12 | Calendar digest | Area members | One daily email listing new entries marked *Notify members* |

Every notification contains: the title and reference, competency, owner, current
deadline (with "extended from …" where relevant), status, days remaining or days
overdue, and a link `Hub.aspx?action={number}`. All values are HTML-escaped. The
footer reads "This is an automated message from the ESG Competency Hub.
Reference {token}." The token is unique to each notification (F.4.2).
Notifications are never sent to people marked Left.
Reminders re-check the action's state before sending.

### B.6 Improvements & Degradations

| ID | Requirement |
|---|---|
| REG-01 | Types: Improvement, Degradation, Concern, Opportunity, Positive Observation |
| REG-02 | Fields: reference `REG-nnnnn`, title, description, competency, type, impact, raised by, date raised, responsible person, status (Open, Under Review, Resolved, Closed), outcome, date resolved, attachments. Comments are held in Updates. |
| REG-03 | Members can raise entries (queued), comment and flag (both instant), and create linked actions |
| REG-04 | The raiser, the responsible person, engineers, meeting administrators and management can update an entry, change its status and record the outcome. An outcome is required for Resolved and Closed. |
| REG-05 | Each entry lists its linked actions |
| REG-06 | Unresolved degradations appear on the Overview, the welcome page, the dashboard and every agenda |
| REG-07 | Nothing is deleted; closed entries move to History |

### B.7 Noticeboard

| ID | Requirement |
|---|---|
| NB-01 | Members can post (**instant**). A post has a title, content (plain text), category, author, date, attachments (added after posting, queued), comments (instant), an Important flag, a discussion flag and an archive status. |
| NB-02 | **Flag for Next Meeting** (**instant**) on posts and register entries. Any member can flag. A flag can be withdrawn before discussion by whoever raised it, the author, meeting administrators or management. Withdrawals are instant; withdrawals by anyone else are ignored when the agenda is built (F.5). |
| NB-03 | A flagged item appears on the next agenda. It clears **only** when a finalised meeting records it as *Discussed*, and only for flags raised before that meeting's cutoff. Deferred or unreached items carry forward. |
| NB-04 | Each item shows its discussion history: the meetings it appeared at and the outcomes |
| NB-05 | **Important** (pin) is separate from flagging. The author can mark a post important when posting, for at most 30 days. Meeting administrators and management can pin or unpin (queued). |
| NB-06 | Authors edit and archive their own posts (queued). Meeting administrators and management can archive any post or hide comments (queued, audited). Nothing is deleted. |

### B.8 Calendar

| ID | Requirement |
|---|---|
| CAL-01 | Month and agenda views, plus event details |
| CAL-02 | Event types (10). Each event has title, start and end (or all day), location, details, competency, related action, *Important*, and *Notify members*. |
| CAL-03 | Members add events and edit or cancel their own (**instant**). Meeting administrators and management can edit or cancel others' events (queued); a moderated event becomes read-only to its author. Cancelled events are shown struck through. |
| CAL-04 | Repeating events become individual occurrences sharing a series ID (up to 24). "Edit this and future" updates each occurrence in turn and lists any it could not update, with *Try again*. |
| CAL-05 | **My Calendar** combines all the user's areas, with an optional overlay of their action deadlines (read from Actions, not copied) |
| CAL-06 | Monthly meetings appear automatically, read directly from the Meetings list (no copy is stored) |
| CAL-07 | **Download invite (.ics)**, generated in the browser |

### B.9 Monthly meetings

| ID | Requirement |
|---|---|
| MTG-01 | **Meeting home**: previous and next meeting, status, open actions, closed since last meeting, flagged items, unresolved degradations, important dates |
| MTG-02 | **Create next meeting** (queued). The date, chair and attendees are pre-filled. A calendar event is created. |
| MTG-03 | **Automatic agenda** in nine sections (F.7.3) |
| MTG-04 | Open-action rows show: reference, title, owner, status, deadline with extension indicator, latest progress, blocker, previous outcome, and a *Raised since last meeting* or *Still open* marker |
| MTG-05 | From a row, authorised users can update, extend, complete, close, reassign or raise an action. Each action change is queued; the row shows it as pending. |
| MTG-06 | For discussion items: notes, decision, *Discussed*, *Defer*, *Raise action* |
| MTG-07 | The record holds: competency, date, chair, attendance, agenda, notes, decisions, new actions, outstanding matters and the next meeting date |
| MTG-08 | Lifecycle: Scheduled → In Progress → Finalised, plus Cancelled |
| MTG-09 | Finalised records are frozen. Later changes to actions do not alter them. |
| MTG-10 | Amendments are controlled, appended [Rec D-10] and audited |
| MTG-11 | Minutes open in a print window (Save as PDF). Server-generated PDF is deferred (D-13 [Rec]). |
| MTG-12 | Skipped months are visible: "No meeting held since {date}" |
| MTG-13 [Rec] | **Live meetings never wait for automation.** Attendance, outcomes, notes, new business and decisions save instantly. After *Start meeting*, recording can begin straight away against the live agenda; the server fixes the agenda in the background (F.7.2). |

### B.10 Management dashboard

| ID | Requirement |
|---|---|
| MGT-01 | Key figures: open, overdue, due within 7 days, extended, extended 2 or more times, degradations, overdue meetings, flagged items, important dates. A cross-competency action counts once in the totals and once per linked area. |
| MGT-02 | Competency summary with understated status indicators (icon and text) |
| MGT-03 | Drill-down to exactly the counted records. Filters: competency, owner, status, priority, deadline, extension count, meeting status. CSV export. |
| MGT-04 | My Actions, Actions I Raised, Actions Requiring Attention |
| MGT-05 | No trend charts or scores |

### B.11 Administration

| ID | Requirement |
|---|---|
| ADM-01 | **People**: search Microsoft 365 users; set role; grant or withdraw *System administrator*; set status Active or Left |
| ADM-02 | **Access matrix**: staged changes. Each cell shows its pending state, then a "verified" time [Rec] once the flow has read the group membership back. |
| ADM-03 | Temporary access with an expiry date |
| ADM-04 | **Removal and leavers**: outstanding work must be reassigned or closed first. History is kept and access is actually revoked. |
| ADM-05 | **Competencies**: add, rename, archive, set the coordinator and meeting pattern. Competencies cannot be deleted. |
| ADM-06 | **View permissions** for a person, from memberships plus the verification time recorded by flows |
| ADM-07 | **System administration**: settings, queue health, *Incomplete changes* [Rec] (retry or roll back, F.1.5), notification failures (resend), heartbeat, access-check results with *Repair*, history search, and **Create data export** [Rec: created in the browser] |
| ADM-08 | Management can view People & Access read-only |
| ADM-09 [Rec] | **The last active administrator cannot be removed or demoted** |

### B.12 Search

| ID | Requirement |
|---|---|
| SRC-01 | Module search is instant. Typing a reference (for example `ACT-00042`) opens the record. |
| SRC-02 | Global search uses the SharePoint Search REST API, scoped to the site and permission-trimmed. It returns IDs only; records are then re-read through list REST before display. Technical lists are not crawled. |
| SRC-03 | Management and administrators search all areas through their normal permissions |

---

## C. User interface specification

### C.1 Principles

- One way to do each thing.
- At most two clicks to any routine task.
- Status is never shown by colour alone.
- No decorative motion.
- Plain English labels, taken from the brief.

### C.2 Visual design [Rec]

The design uses the visual family of the existing ESG Welcome applications:

- navy menu bar `#13516b` (8.7:1 contrast with white text);
- orange accent `#ef7d3a` (decoration only);
- ink `#16222c`, muted `#5b6774`, background `#eef2f5`, cards `#ffffff`,
  lines `#d9dfe5`, focus colour `#2b78d0`.

| Status | Colour on background | Icon |
|---|---|---|
| Overdue | `#a4262c` on `#fde8e9` | ⚠ |
| Due soon | `#8a5a00` on `#fff3d6` | Clock |
| Extended | `#6a4fb0` on `#f1edf9` | ↻ |
| Completed | `#1b7a45` on `#e6f3eb` | ✓ |
| Information | `#1f7190` on `#e7f0f6` | — |

- **Tokens:** every colour, space and size is a CSS custom property in
  `styles/tokens.css`, scoped under `.SCOPE .ch`.
- **Contrast:** a test calculates WCAG contrast for every text/background pair
  and fails at below 4.5:1 for text or 3:1 for UI elements.
- **Typography:** Segoe UI, 14 px base.
- **Icons:** inline SVG symbols only.
- **Dates:** `20 Oct 2026` in tables and `20 October 2026` in detail views.
- **Large screens:** the proven `zoom` steps above 1,700 px.

### C.3 Shell and navigation [Rec]

**Top menu bar** (the 1-to-1 pattern):

| Position | Contents |
|---|---|
| Left | Brand: "ESG Competency Hub" with "Environmental Safety Group" beneath |
| Centre | Home · My Actions · My Calendar · Areas ▾ · Management (management only) · Admin ▾ (administrators only) |
| Right | Search · **Pending changes** count · **+ Raise Action** · version number |

- **Title bar:** breadcrumb, page title, then area tabs where relevant.
- **Records** open in a right-hand panel (full width below 900 px). Forms open
  in dialogs.
- **Deep links** use query parameters, the proven pattern: `?action=`,
  `?area=&tab=`, `?meeting=`.
- **Browser Back:** `pushState` is used only if probe P-09 passes. Otherwise the
  app keeps its own view state and offers **Copy link**.

### C.4 Wireframes

The layouts are unchanged from revision 2, apart from the meeting page.

**Welcome page**
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ESG Competency Hub        Home  My Actions  My Calendar  Areas ▾  Management  Admin ▾    │
│ Environmental Safety Group                   [Search records…]  ⟳ 1  [+ Raise Action] v1.0.0│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Good morning, Rachel                                                                     │
│ Welcome to the ESG Competency Hub                                                        │
│ [Open 6] [⚠ Overdue 1] [◷ Due in 7 days 2] [↻ Extended 1]                               │
│ ┌ My upcoming deadlines ─────────────────────┐ ┌ Monthly meetings ──────────────────┐    │
│ │ ACT-00042 Replace FH40 probe   Flask  ⚠ 2d │ │ Flask 11 Nov · 3 for discussion    │    │
│ └────────────────────────────────────────────┘ └─────────────────────────────────────┘    │
│ Your competency areas: [Flask 12 open ⚠1 · 3 flagged · Next 11 Nov] [Instruments …] …    │
│ [Important notices] [Important dates] [Unresolved degradations]                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Action panel** (with a pending change)
```
ACT-00042 · Flask                                                [Copy link]  ✕
Replace FH40 probe       [In Progress] [⚠ Overdue 2 days] [↻ Extended once]
Deadline  ~~10 October 2026~~ → 17 October 2026  · Extended by Rachel Boulden on 09 Oct 2026
          "Awaiting replacement equipment."   Show all extensions (1) ▾
⟳ Extension to 30 October 2026 submitted 10:42 — being recorded (usually under 5 minutes)
[ Post update ] [ Extend deadline ] [ Mark complete ]  More ▾
Updates (instant) · History (server-recorded) · Evidence
```

**Meeting page** (the agenda being fixed in the background)
```
Flask · Monthly Meeting · 11 November 2026   [In Progress]   Chair: Kelly Bates
ⓘ Fixing the agenda (started 10:02). You can record attendance, outcomes and notes now.  [ Print ]
Attendance  [Present ●] Andrea Medlicott  [Apologies ○] Ben Beak …        ✓ Saved
1 Open actions
┌ ACT-00042 Replace FH40 probe · R. Boulden · ⚠ 17 Oct · ↻1 · Still open
│ Outcome [No change ▾]  Notes [ …                                   ]  ✓ Saved
│ [Update] [Extend] [Close] [Reassign] [Raise action]   ⟳ Extension pending
…
8 New business [ + Add item ]      9 Decisions [ + Record decision ]      [ Finalise ] (enabled when nothing is pending)
```

**Management dashboard**
```
Management Dashboard                                   Filters: [All areas ▾] [Owner ▾] [Status ▾]  [Export CSV]
[Open 84] [⚠ Overdue 9] [◷ Due in 7 days 14] [↻ Extended 21] [↻↻ Extended 2+ 6] [Degradations 5] [Meetings overdue 1] [Flagged 11]
┌ Competency summary ─────────────────────────────────────────────────────────────────────────────┐
│ Area            Open  Overdue  Due 7d  Extended  Degradations  Flagged  Last meeting  Next     │
│ Flask             12   ⚠ 1        2        3          1            3     14 Oct        11 Nov   │
│ Green Stream      18   ⚠ 3        4        5          2            1     ⚠ No meeting since 2 Sep │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
Every number opens the records it counts.     [My Actions] [Actions I Raised] [Requiring Attention]
```

**People & Access matrix**
```
People & Access          [Search people…]  [+ Add person]          2 changes staged  [Review and apply]
Person             Role        FLK    INS    GRS    RPE  …  Admin
Rachel Boulden     Technician  ✓ MA-  ✓      ✓      –       –         Verified 10:42
Kai Todd           Engineer    –      –      ✓ MA   ⟳+      –         Pending (add RPE)
Each cell shows its pending state, then "Verified {time}" once the flow has read the membership back.
```

### C.5 Components [Rec]

Plain JavaScript functions built on a single `h()` helper:

- `shell`, `tabs`, `panel`, `dialog`, `confirmBox`
- `tile`, `areaCard`
- `dataTable`
- `statusChip`, `dueDate`
- `field`, `textBox`, `selectBox`, `dateField` (DD-MMM-YYYY)
- `peoplePicker`
- `timeline`, `attachmentList`
- `pendingChip`, `toast`, `messageBar`, `emptyState`, `errorState`, `skeleton`
- `printWindow`, `icsDownload`, `csvDownload`

### C.6 Interaction patterns

**Instant direct writes** (C.8):

- Saved in one REST call, with a client key, so a retry cannot create a
  duplicate.
- Shown immediately as "Saved".
- Errors are explicit. The input is kept, with a *Try again* option.
- Edits to the user's own calendar entries and to meeting record rows use the
  item's ETag. On a conflict (412) the message reads "Changed by {name} at
  {time}" with *Reload* or *Copy my text*.

**Queued changes**:

1. Validated in the browser.
2. The request is created in the user's own folder.
3. The record shows a `pendingChip` with the wording "Submitted 10:42 — being
   recorded (usually under 5 minutes)". The user can carry on working.
4. The app polls at 20 s, 40 s and 60 s, then every 60 s for up to 15 minutes,
   pausing while the user is typing.
5. **Success is shown only when** the request reads Completed **and** either
   the target record shows `LastRequestKey` equal to this request's key with no
   lock, or the area's History shows this request's event row. The second case
   covers a later change that has already committed on the same record.
6. A **Rejected** request shows the reason, with Review and Try again.
7. A **Failed** request shows "Not recorded yet – retrying automatically" (or "An
   administrator has been notified" after 3 attempts).
8. After 15 minutes the message is "Taking longer than usual".
9. Requests that could not be submitted are kept in `localStorage` (the proven
   *Unsent* pattern).

**Records being updated** show "Being updated…", and their change controls are
disabled.

**Validation:** subtle markers before the first save, then red messages, with
focus moved to the first problem.

**Unsaved changes:** a prompt appears before leaving a view.

### C.7 Responsive behaviour and accessibility

- **Full layout** at 1280 px and above.
- **1024–1279 px:** shortened menu.
- **768–1023 px:** a Menu button, 2-column cards and a 90%-width panel.
- **Below 768 px:** stacked tables and full-screen panels.
- **Tablets:** verified in Phase 0 (P-08). The 1-to-1 is desktop-only. If
  tablets cannot work fully, fallback F-T in I.3 applies.
- **Touch targets:** 32 px minimum, 44 px on coarse pointers.
- **Accessibility:** WCAG 2.2 AA:
  - landmarks, skip link, keyboard operation and visible focus;
  - focus trapped in dialogs;
  - `aria-live` for save results;
  - real tables;
  - text usable at 200%.

### C.8 Save model by operation [Rec] — response to the latency finding

**Options assessed for faster, secure writes:**

| Option | Speed | Security | Verdict |
|---|---|---|---|
| A. Instant direct writes where SharePoint permissions enforce the rule completely: append-only, or editable only by the author, in folders the user may write to | Instant | Server-enforced by permissions | **Adopted** for routine updates, flags, notices, own calendar entries and live meetings |
| B. Queued requests processed by a flow, with an optimistic, non-blocking UI | Polling latency (~1–5 min, to be measured) | Fully server-enforced business rules | **Adopted** for rule-bound changes |
| C. Scheduled polling flow every minute | ~1 min | Same as B | Rejected. About 1,400 runs a day would use most of the request allowance. |
| D. HTTP-triggered flow called from the page | Seconds | Needs an Entra token for the flow endpoint, so tenant admin consent and a **premium** licence | Not recommended. It could be considered later as D-14 if latency is unacceptable and IT approves. |
| E. Power Apps (V2) synchronous flows | Seconds | Strong | Excluded **[You]** |
| F. SPFx or Azure Functions | Seconds | Strong | Excluded **[You]** / not permitted |

**Resulting assignment.** The direct-write paths depend on probes P-13 (creating
items with the Add level) and P-05 (forged Created By, Created or Modified).
Their fallbacks, F-ADD and F-ID, are prepared in I.3.

| Operation | Path | Why direct writes are safe, or why the change is queued |
|---|---|---|
| Progress update, comment, blocker note | **Instant** (Updates, append-only) | Users can only *add*, and only in areas they belong to. They cannot edit or delete. |
| Flag for meeting, withdraw flag | **Instant** (Updates, append-only events) | Each event is immutable. An unauthorised withdrawal is ignored by the server's agenda rule (F.5). |
| Post a notice | **Instant** (Noticeboard, add-only) | All later changes are queued, so moderation stays controlled |
| Add, edit or cancel own calendar entry | **Instant** (Calendar Events, edit own) | SharePoint enforces "edit own", and there is no delete. A moderated entry becomes read-only to its author. |
| Live meeting: attendance, outcomes, notes, new business, decisions | **Instant** (meeting `Record` folder) | Only the area's meeting administrators and management can write to it, and only while the meeting is open. Finalisation reads only rows in that meeting's folder and validates them against the server's agenda. |
| Raise action; status; extend; complete; close; reopen; reassign; edit; link | Queued | Server-side rules, cross-record history, permissions and notifications |
| Register entries and status; notice edit, pin and archive; moderation | Queued | Rules, moderation and audit |
| Schedule, start, finalise, cancel or amend a meeting | Queued (start is optimistic: recording begins immediately) | Snapshot integrity and folder locking |
| People, memberships, competencies, settings | Queued | Permission changes need the flow account |

**Effect on live meetings.** No step of a live meeting waits for automation.
Only action changes made from the meeting are queued, and they show as pending
on the row. **Finalise** is enabled once the meeting's pending-changes count is
zero.

---

### C.9 Simplified interface (revision after the first preview)

**Why.** You reviewed the first clickable preview
(`competency-hub/02-frontend/preview/competency-hub-preview.html`) and found it
too busy for staff who are not confident with computers. It showed too much at
once:

- four number tiles and five cards on the home page;
- symbols such as ⚠, ◷ and ↻ that need learning;
- seven tabs per area;
- every meeting control visible at the same time.

This section replaces C.3 and C.4 wherever they conflict. **No functional
requirement is removed**; less common features move one click deeper.

**Design rules**

1. **One question per page.** Home answers "What do I need to do?". An area
   page answers "What is happening in this area?". A meeting page answers "What
   are we discussing next?".
2. **Plain words instead of symbols.** For example:
   - "2 days late", not "⚠ Overdue 2d";
   - "Due Friday", not "◷ 3 days";
   - "Deadline moved once", not "↻1".

   Colour supports the words and is never needed to understand them.
3. **At most three main buttons per page**, written as verbs:
   - "Add an update";
   - "I need more time";
   - "Mark as done".

   Everything else sits under one "More options" link.
4. **Short menus.** The menu shows only Home, My actions, My areas and Meetings.
   Management and Admin appear only to people who hold those roles. Search
   moves onto the pages where it is used. The pending counter and version
   number leave the menu bar: pending changes show on the record itself, and
   the version moves to a page footer.
5. **Calm layout.** Body text is 16 px, with generous spacing, one accent colour
   for actions, and red, amber and green only for urgency.
6. **Show less, reveal on request.** Long lists show the first five items, with
   "Show all". Closed and archived items sit behind "Show finished items".
7. **Helpful empty states.** For example: "You have no actions due. Nice work."
   or "Nothing is flagged for the next meeting. Use 'Add to next meeting' on
   any notice."

**Page designs**

| Page | Simplified design |
|---|---|
| Home | Greeting, then **one list of my actions** grouped as *Late*, *Due this week* and *Coming up*, each line saying in words when it is due. Two buttons: **Raise an action** and **Go to my areas**. One small "Next meetings" line. Notices and dates move to the area pages. Management users also see one line, "9 actions are late across all areas – view dashboard". |
| My actions | The same grouped list, plus one filter, "Area", and "Show finished items" |
| Area | Header with the area name and **one summary sentence**, e.g. "12 open actions, 1 late. Next meeting Wed 11 Nov." Four tabs: **Actions · Notices & issues · Calendar · Meetings**. *Notices & issues* combines the Noticeboard with Improvements & Degradations, using a type filter. History becomes "Show finished items" in each tab. |
| Action | One card: **What** (title and description), **Who** (owner, raised by), **When**, e.g. "Due 17 Oct – 2 days late. Deadline moved once (was 10 Oct)". Three buttons: **Add an update**, **I need more time**, **Mark as done**. Below are the updates in plain sentences. Other actions sit under "More options": reassign, close, share with another area, evidence. |
| Raise an action | A three-step guided form, with Back and Next: (1) What needs doing? (2) Who and which area? (3) By when? — then a summary with **Raise action**. Optional fields stay behind "More options". |
| Need more time | One date picker and one "Why?" box, with the effect explained: "The new deadline will be 30 Oct. Your manager can see the reason." |
| Meeting | **Go through the agenda one item at a time.** The page shows a progress line, e.g. "Item 3 of 11 – Open actions", with the current item large and three answer buttons: **Discussed**, **Carry forward**, **Raise an action**, plus a notes box and **Next item**. An "Agenda" list on the side lets the chair jump to any item. Attendance is a simple tick list at the start. Finalising happens on a closing summary screen. |
| Management dashboard | One sentence summary, then one table: area, open, late, next meeting, with words and colour. Clicking a number opens the list. Extension and degradation details move under "More detail". |
| People & Access | Admin only. Choose a person, then see **their areas as a tick list** with "Can run meetings" switches. This replaces the 10-column matrix; the matrix stays available as "View all" for administrators. |

**Validation with real users.** In Phase 1, before building the full UI, the
revised clickable preview is tried by three to five technicians who are not
confident with computers. Each is asked to:

- find their late action;
- ask for more time;
- add an update;
- record an outcome in a meeting.

We change anything they stumble on. The result is recorded in
`TEST_REPORT_<v>.md` as T-UI-13. The plan estimates 1–2 days for this, within
Hardening.

**Effect on scope.** No requirement is removed. Merging the two tabs and the
guided forms are presentation changes. The data model, permissions and flows
are unchanged.

## D. Data specification

### D.0 Conventions [Rec]

- **Site.** A new private communication site, provisionally
  `/sites/ESGCompetencyHub` (D-05). Regional settings are English (UK) with the
  London time zone, set before any lists are created. The flow account is
  **Site Collection Administrator** (G.6).
- **List names.** Lists are created with a URL name without spaces, then given a
  display name. The code addresses lists by display name through a single
  `CONFIG`.
- **Column names.** Internal names are PascalCase; display names are plain
  words. Created By and Modified By on queued-change lists show the flow
  account, so the real user is always held in explicit Actor, Raised By and
  similar columns.
- **Competency keys** are stable and are used as folder names: FLK, INS, GRS,
  RPE, BA, DOS, RP, DSL, ALS, RW.
- **References** (`ACT-`, `REG-`, `MTG-`) are displayed from item IDs and not
  stored.
- **Lookups** are used only for Competencies. Every other reference is a Number
  column. This avoids leaking titles through lookups and stays under the
  12-lookup query threshold.
- **Every unique-key column is always populated**: client keys, request keys,
  row keys and notification keys. The design never depends on how SharePoint
  treats blank values in unique columns.
- **Key namespaces and quarantine.**
  - Keys created by flows start with `F|`. Keys created in the browser are
    random UUIDs.
  - When a flow looks up an item to make a step idempotent, it accepts a match
    only if the item is in the expected folder. Where users can write to that
    folder, the item must also have been created by the flow account.
  - Any other match is **quarantined**: its key is renamed to `Q|{id}|…`, the
    tripwire fires (NOT-11), and the step retries.
- **User-written fields are untrusted.** Where users write items directly, the
  folder path, server-assigned item IDs and flow-written records decide what an
  item means. Values a user types into parent, competency, lock or key columns
  never grant anything (F.1.4, F.5, F.7.4).
- **No rich text.** Long text is plain, rendered with `textContent`, with links
  made clickable.
- **Versioning** keeps 100 versions. Technical lists are not crawled by search.
  No list has more than 20 indexes.
- **One schema definition** (`04-solution/schema/schema.json`) describes every
  list, column, index, view, setting, permission level and group. The Setup flow
  reads it (G.3).

#### D.0.1 Date rules (correction of the reminder calculation)

The previous revision added 7 directly to a `yyyymmdd` integer. That is wrong:
`20261028 + 7` gives `20261035`, and `20261101 − 20261031` gives `70`.

The rules are now:

| Rule | Definition |
|---|---|
| Canonical date | A **UK calendar date string** `YYYY-MM-DD` |
| Today | **Browser:** `localDate(new Date())`, using `Intl` with `timeZone: 'Europe/London'` (the proven 1-to-1 helper). **Flow:** `formatDateTime(convertFromUtc(utcNow(),'GMT Standard Time'),'yyyy-MM-dd')`. |
| Date arithmetic (always on calendar dates) | **Browser:** `addDays(iso, n)` builds `Date.UTC(y, m-1, d + n)` and reads back the UTC year, month and day. **Flow:** `addDays('<iso>', n, 'yyyy-MM-dd')`. A date-only string is midnight UTC, and UTC has no daylight saving, so the result is the exact calendar date. |
| Days between two dates | **Browser:** `(Date.UTC(b) − Date.UTC(a)) / 86 400 000`, always an integer. **Flow:** `div(sub(ticks('<bIso>'), ticks('<aIso>')), 864000000000)`. |
| `DueDay` (Number, `yyyymmdd`) | Used **only** for equality, ordering, range filters and keys. Range bounds are worked out in calendar dates first, then converted: `int(formatDateTime('<iso>','yyyyMMdd'))`. It is **never** used in arithmetic. |
| `DueDay` → date | **Flow:** `s = formatNumber(DueDay,'00000000')`, then `concat(substring(s,0,4),'-',substring(s,4,2),'-',substring(s,6,2))`. This copes with the value arriving as `20261028.0`. **Browser:** the same, by slicing the string. |
| SharePoint date-only values | Stored as UK midnight expressed in UTC, so 1 Jul 2027 is stored as `2027-06-30T23:00:00Z`. Always converted to the UK date before use: `localDate` in the browser, `convertFromUtc(…,'GMT Standard Time')` in flows. The UTC date part is never used. This applies to CurrentDueDate, OriginalDueDate, AccessExpires, TrackingStart and DateLeft. Values are written by flows (P-07 confirms the format) or through the proven verified-write helper (calendar). Daily Tasks reports any action whose DueDay and CurrentDueDate disagree. |
| Weekly keys | Use the **date of the week's Monday** (`today − ((dayOfWeek + 6) mod 7)` days), never ISO week numbers, which have year-boundary pitfalls |
| Time zone | The Daily Tasks schedule uses `GMT Standard Time` at 06:00, so it runs at 06:00 UK time in both GMT and BST, avoiding the midnight ambiguity |
| Test clock | `TestToday` (Settings) replaces *today* in the browser and in flows **only** when the environment variable `esg_CompetencyHubIsTest` is true. This lets the 2027–2028 rows run as real flows on the test site (H.3). |

**Reminder test matrix.** These cases are run as JavaScript unit tests and as
flow-expression checks in the test environment.

| Case | Deadline | 7-day reminder (first daily run) | Notes |
|---|---|---|---|
| Ordinary | Wed 28 Oct 2026 | Wed 21 Oct 2026 | |
| Month end | Mon 2 Nov 2026 | Mon 26 Oct 2026 | Crosses a month end |
| BST ends on the reminder day | Sun 1 Nov 2026 | Sun 25 Oct 2026 | Clocks go back at 02:00 on 25 Oct; the run is at 06:00 GMT = 06:00 UTC |
| Year end | Thu 31 Dec 2026 | Thu 24 Dec 2026 | |
| New year | Sun 3 Jan 2027 | Sun 27 Dec 2026 | Crosses a year end |
| Non-leap February | Mon 1 Mar 2027 | Mon 22 Feb 2027 | 2027 is not a leap year |
| BST starts | Sun 4 Apr 2027 | Sun 28 Mar 2027 | Clocks go forward that morning; the run is at 06:00 BST = 05:00 UTC |
| Leap day | Tue 7 Mar 2028 | Tue 29 Feb 2028 | |
| Leap year March 1 | Wed 1 Mar 2028 | Wed 23 Feb 2028 | |
| Missed run | Wed 28 Oct 2026; run on 21 Oct failed | Thu 22 Oct 2026 ("6 days") | Catch-up |
| Raised 5 days before | Due Mon 2 Nov, raised Wed 28 Oct | None separately (the assignment notice covers it) | Suppression |
| Overdue | Due Mon 19 Oct 2026 | Overdue notices on 20 Oct, 27 Oct and 3 Nov (interval 7) | `n` = floor((daysOverdue − 1) ÷ 7) |
| Date-only read in BST | CurrentDueDate Thu 1 Jul 2027 (stored `2027-06-30T23:00:00Z`) | Thu 24 Jun 2027 | Read as 1 Jul, never 30 Jun |
| Storage on either side of the clock change | Sun 25 Oct 2026 (stored `2026-10-24T23:00:00Z`) and Mon 26 Oct 2026 (stored `2026-10-26T00:00:00Z`) | Sun 18 Oct and Mon 19 Oct 2026 | Both read as the correct UK date |
| Access expiry on the clock change | AccessExpires Sun 28 Mar 2027 | Removal requested on Mon 29 Mar 2027 | Access lasts to the end of the expiry date |
| Run near midnight | Test run at 00:30 BST on Mon 19 Oct 2026 (23:30 UTC on Sun 18 Oct) | `todayIso` = 2026-10-19 | |

### D.1 List catalogue

| # | List (URL / display) | Purpose | Folders | Who writes | Retention |
|---|---|---|---|---|---|
| 1 | Competencies | The areas | — | Flows | Permanent |
| 2 | People | Users, roles, administrator flag | — | Flows | Permanent |
| 3 | CompetencyMembers / Competency Members | Memberships, with their history | Per competency | Flows | Permanent |
| 4 | Settings / Competency Hub Settings | Configuration and health timestamps | — | Flows | Permanent |
| 5 | Actions | Action records | Per competency | Flows (queued) | Permanent |
| 6 | History | Authoritative change log, plus a transaction row for every queued request (replaces the separate Action History and Audit Log) | `{Key}/A{id}`, `{Key}/Records`, `Administration`, `Transactions` | Flows | Permanent |
| 7 | ImprovementRegister / Improvements and Degradations | Register entries | Per competency | Flows (queued) | Permanent |
| 8 | Noticeboard | Notices | Per competency | Members add (instant); flows change | Permanent |
| 9 | Updates | Progress updates, blockers, comments and discussion-flag events | `{Key}/` and `{Key}/A{id}` | Members add (instant, append-only); flows only hide items | Permanent |
| 10 | CalendarEvents / Calendar Events | Dates | Per competency | Members (instant, edit own); flows moderate | Permanent |
| 11 | Meetings | Meeting headers | Per competency | Flows (queued) | Permanent |
| 12 | MeetingItems / Meeting Items | Agenda snapshot, attendance, outcomes, new business, decisions, amendments | `{Key}/MTG-{id}` and `/Record` | Flows; meeting administrators in `Record` while the meeting is open | Permanent |
| 13 | Requests | Queue intake; after claim, only a status mirror | `u{SiteUserId}` per person, plus a flow-only `System` folder | Each person in their own folder; flows | 365 days |
| 14 | NotificationLog / Notification Log | Delivery ledger | — | Flows | 24 months |
| L1 | RecordsExport / Records Export (library) | Data exports | `{yyyy-MM}` | Administrators upload from the System Administration page | 12 months |

Welcome adds its own **Welcome Web Part - Custom Layouts** library and
**Welcome Web Part - Errors** list.

### D.2 List definitions

Key: Req = required · Idx = indexed · U = enforced unique · Def = default.

The **standard concurrency columns** below appear on every list that queued
changes write to: Actions, Improvement Register, Noticeboard, Calendar Events
(for moderation), Meetings, People, Competency Members, Competencies and
Settings. On Noticeboard and Calendar Events, users can write these columns on
their own items. There, the flow honours a lock only when a live transaction
holds it (F.1.4), and items users create carry
`CreatedRequestKey = U|{ClientKey}`.

| Display | Internal | Type | Notes |
|---|---|---|---|
| Revision | Revision | Number, Def 1 | Business change counter |
| Pending Request Key | PendingRequestKey | Text 36, Idx | The **lock** (F.1.4). Empty when not locked. |
| Last Request Key | LastRequestKey | Text 36, Idx | Confirms the change in the UI |
| Created Request Key | CreatedRequestKey | Text 60, Idx U | Never blank:<br>• `F\|{requestKey}` for records created by a request; this makes creation idempotent.<br>• `IMPORT-{key}` for the initial import.<br>• `U\|{ClientKey}` for items users create directly.<br>A record whose PendingRequestKey is its own creating request is **uncommitted**. Every view, count, reminder and agenda excludes it until commit. |

#### 1. Competencies

| Display | Internal | Type | Req | Def | Idx | Notes |
|---|---|---|---|---|---|---|
| Title | Title | Text 80 | ✓ | | | Label |
| Competency Key | CompetencyKey | Text 10 | ✓ | | ✓ U | Stable |
| Sort Order | SortOrder | Number | ✓ | 100 | | |
| Status | Status | Choice: Active, Archived | ✓ | Active | ✓ | |
| Meeting Coordinator | MeetingCoordinator | Person | | | | |
| Meeting Week / Day | MeetingWeek / MeetingDay | Choice | | | | Default date pattern |
| Tracking Start | TrackingStart | Date only | ✓ | go-live | | Start of the first interval |
| Members Group ID | MembersGroupId | Number | | | | |
| Description | Description | Multi-line plain | | | | |

Plus the standard concurrency columns.

Seed values: FLK Flask · INS Instruments · GRS Green Stream · RPE RPE · BA BA ·
DOS Dosimetry · RP Radiological Protection · DSL DSL · ALS Active Lab &
Sampling · RW Radwaste.

#### 2. People

| Display | Internal | Type | Req | Def | Idx |
|---|---|---|---|---|---|
| Title | Title | Text | ✓ | | |
| Person | Person | Person | ✓ | | ✓ U |
| Email | Email | Text 255 | ✓ | | ✓ U |
| Site User ID | SiteUserId | Number | ✓ | | ✓ U |
| Role | Role | Choice: Engineer, Technician, Team Leader, Group Head | ✓ | | ✓ |
| System Administrator | IsAdministrator | Yes/No | ✓ | No | ✓ |
| Status | Status | Choice: Active, Left | ✓ | Active | ✓ |
| Date Left | DateLeft | Date only | | | |
| Access Verified | AccessVerifiedOn | Date and time | | | |

Plus the standard concurrency columns. Each person's request folder is
`Requests/u{SiteUserId}`.

#### 3. Competency Members

Stored in the competency's folder. Rows are never deleted.

| Display | Internal | Type | Req | Def | Idx | Notes |
|---|---|---|---|---|---|---|
| Title | Title | Text | ✓ | | | |
| Competency | Competency | Lookup → Competencies | ✓ | | ✓ | |
| Person | Person | Person | ✓ | | ✓ | |
| Membership Key | MembershipKey | Text 40 | ✓ | | ✓ U | `{Key}\|{SiteUserId}`. Re-adding a person reactivates the existing row. |
| Meeting Administrator | CanManageMeetings | Yes/No | ✓ | Engineers Yes, technicians No | | |
| Access Expires | AccessExpires | Date only | | | ✓ | |
| Status | Status | Choice: Active, Removed | ✓ | Active | ✓ | |
| Date Added / Date Removed | DateAdded / DateRemoved | Date and time | | | | |
| Access Verified | AccessVerifiedOn | Date and time | | | | When the flow last read the group membership back |

Plus the standard concurrency columns.

#### 4. Competency Hub Settings

A key/value list: Title (✓ U), Value, Description, plus the standard concurrency
columns.

| Key | Initial value |
|---|---|
| `ReminderDaysBefore` | 7 |
| `DueSoonDays` | 7 |
| `OverdueReminderIntervalDays` | 7 |
| `ManagementSummaryDay` | Monday |
| `MeetingOverdueDays` | 35 |
| `AgendaLookaheadDays` | 60 |
| `MaxDeadlineYears` | 2 |
| `AttachmentMaxMB` | 25 |
| `NotifyRaiserOnExtension` | No |
| `NotifyOnClosure` | Yes |
| `CalendarDigest` | Yes |
| `RequestRetentionDays` | 365 |
| `EventTimeToleranceMinutes` | 30 |
| `SchemaVersion` | |
| `AdministratorGuard` | A row used only as a lock (F.1.4) |
| `TestToday`, `TestFailAfterStep`, `TestFailSend` | Blank. Honoured only on the test environment (H.3). |

Health timestamps, written by flows:

- `LastDailyRun`
- `LastHeartbeatCompleted`
- `LastAccessCheck`
- `LastExportReminder`
- `BootstrapCompletedOn`

#### 5. Actions

The folder is the primary competency at creation. After a reclassification, the
Competency column and the item's permissions are authoritative (F.1.3).

| Display | Internal | Type | Req | Def | Idx |
|---|---|---|---|---|---|
| Title / Description | Title / Description | Text 255 / Multi-line plain | ✓ | | |
| Competency | Competency | Lookup → Competencies | ✓ | | ✓ |
| Linked Competencies | LinkedCompetencies | Lookup (multi) → Competencies | | | |
| Cross-Competency | IsCrossCompetency | Yes/No | ✓ | No | ✓ |
| Assigned To / Raised By | AssignedTo / RaisedBy | Person | ✓ | | ✓ / ✓ |
| Date Raised | DateRaised | Date and time | ✓ | | ✓ |
| Original / Current Due Date | OriginalDueDate / CurrentDueDate | Date only | ✓ | | |
| Due Day | DueDay | Number (yyyymmdd) | ✓ | | ✓ |
| Status | Status | Choice (5) | ✓ | Open | ✓ |
| Open | IsOpen | Yes/No | ✓ | Yes | ✓ |
| Priority | Priority | Choice: Low, Normal, High | ✓ | Normal | |
| Requires Close-Out | RequiresCloseOut | Yes/No | ✓ | No | |
| Extension Count / Last Extended | ExtensionCount / LastExtendedOn | Number / Date and time | ✓ | 0 | ✓ / |
| Blocker | Blocker | Multi-line plain | | | |
| Date Completed / Date Closed | DateCompleted / DateClosed | Date and time | | | — / ✓ |
| Closed By / Close Outcome / Closure Note | ClosedBy / CloseOutcome / ClosureNote | Person / Choice (4, plus *Withdrawn* for a rolled-back create) / Multi-line plain | | | |
| Source Type / Source ID | SourceType / SourceId | Choice: None, Meeting, Noticeboard, Register / Number | ✓ | None | — / ✓ |
| Links | RelatedLinks | Multi-line plain | | | |

Plus the standard concurrency columns. `IsOpen` is No only when the action is
Closed; it exists so queries can use an index. Attachments hold evidence.

The *latest progress* text is read from Updates when needed. It is no longer
copied onto the action, which removes a duplicate.

#### 6. History

The authoritative change log, and the **transaction row** for every queued
request. Users can only read it; only the flows write to it. It holds two kinds
of row (`RowKind`):

- **Event rows** are what users see as history. They are written as part of the
  commit (F.1.2 step 9) and keyed `{requestKey}|{n}`.
- **Transaction rows**: one per request, in the flow-only `Transactions` folder.
  - At claim, the flow copies the request into it: type, target, expected
    revision, meeting, payload and attachments, with a list of file names and
    sizes.
  - From then on it holds the plan, the progress, the lease and the outcome.

Folders:

- `{Key}/A{actionId}`: action events. Mirrors the action's permissions.
- `{Key}/Records`: register entries, notices, calendar moderation, meetings.
  Readable by the area.
- `Administration`: people, memberships, competencies, settings and security.
  Readable by management and administrators only.
- `Transactions`: transaction rows. Readable by administrators only. This is
  how *Incomplete changes* and failed requests are shown to them.

| Display | Internal | Type | Req | Idx | Notes |
|---|---|---|---|---|---|
| Title | Title | Text | ✓ | | Summary |
| Row Kind | RowKind | Choice: Event, Transaction | ✓ | ✓ | |
| Request Key | RequestKey | Text 60 | ✓ | ✓ U | Transaction rows: the request key. Event rows: `{requestKey}\|{n}`. System events: `SYS\|{flow}\|{date}\|{record}`. Bootstrap: `SYS\|Bootstrap\|{SiteUserId}`. |
| Record Type / Record ID | RecordType / RecordId | Choice: Action, Register Entry, Notice, Calendar Event, Meeting, Person, Membership, Competency, Setting, System / Number | ✓ | — / ✓ | |
| Competency | Competency | Lookup → Competencies | | ✓ | |
| Event Type | EventType | Choice (raised, progress status changes, Deadline Extended, Reassigned, Details Edited, Competency Linked/Unlinked, Completed, Closed, Reopened, Evidence Added, Deadline Corrected, register/notice/meeting/membership/person/competency/setting events, Bootstrap, Initial Import, Request Rejected, Tripwire, Rolled Back) | ✓ | ✓ | |
| Actor | Actor | Person | ✓ | ✓ | The real user |
| Event Time | EventTime | Date and time | ✓ | ✓ | F.1.2 rule |
| Processed At | ProcessedAt | Date and time | | | |
| Note / Reason | Note | Multi-line plain | | | |
| Previous Value / New Value | PreviousValue / NewValue | Multi-line plain | | | Human-readable; also the source for a rollback |
| Extension Number, Original / Previous / New Due Date, Overdue When Extended, Days Overdue | ExtensionNumber, OriginalDueDate, PreviousDueDate, NewDueDate, WasOverdue, DaysOverdue | Number / Date only / Yes/No / Number | | WasOverdue ✓ | Extension rows only |
| On Behalf | IsOnBehalf | Yes/No | | | |
| Meeting ID | MeetingId | Number | | ✓ | |
| *Transaction rows only:* | | | | | |
| Request Item ID | RequestItemId | Number | | ✓ | The request item's server-assigned ID, which identifies the request |
| Request Type / Payload / Expected Revision | RequestType / Payload / ExpectedRevision | Choice / Multi-line plain / Number | | ✓ / — / — | Copied at claim |
| First Claimed At | FirstClaimedAt | Date and time | | ✓ | Fixes the event time (F.1.2) |
| State | State | Choice: Received, Planned, Applying, Failed, Needs attention, Applied, Void, Rolled Back | | ✓ | F.1 |
| Steps Done | StepsDone | Text 255 | | | For example `LOCK;VALUES;GRANT;EVID;EVENTS;OUTBOX` |
| Guard Keys | GuardKeys | Text 255 | | | The guard rows this transaction locked (F.1.4) |
| Run ID / Lease Until | RunId / LeaseUntil | Text / Date and time | | — / ✓ | The lease (F.1.1) |
| Attempts / Next Attempt After / Last Error | Attempts / NextAttemptAfter / LastError | Number / Date and time / Multi-line plain | | — / ✓ / — | |

Attachments on transaction rows hold the copied request files. They also keep
any file an administrator removes from an action.

#### 7. Improvements and Degradations (`ImprovementRegister`)

Title, Description, Competency (lookup, Idx), EntryType (Choice, Idx), Impact,
RaisedBy, DateRaised (Idx), ResponsiblePerson (Idx), Status (Choice: Open, Under
Review, Resolved, Closed; Idx), Outcome, DateResolved, plus the standard
concurrency columns. Attachments are on.

Discussion flags are no longer stored on this list; they are Updates events.

#### 8. Noticeboard

Title, Body (≤5,000 characters), Competency (Idx), Category (6), IsImportant
(Idx), ImportantUntil, Status (Active/Archived; Idx), **ClientKey** (Text 36, ✓,
Idx U), plus the standard concurrency columns. Attachments are on.

- **Created directly by the member**, using the add-only level. The author is
  Created By (see P-05 and R-07).
- Every later change (edit, attachment, pin, archive) is queued.
- If the author marks a post *Important*, it stays so for at most 30 days after
  posting. Every view ignores a later ImportantUntil date set by the author.

#### 9. Updates

Contributions added by members. Users can add but **never edit or delete**.

| Display | Internal | Type | Req | Idx | Notes |
|---|---|---|---|---|---|
| Title | Title | Text | | | First 80 characters |
| Client Key | ClientKey | Text 36 | ✓ | ✓ U | A random UUID generated in the browser. It prevents a duplicate on retry. Flows never create Updates items. |
| Parent Type / Parent ID | ParentType / ParentId | Choice: Action, Notice, Register Entry / Number | ✓ | — / ✓ | |
| Entry Type | EntryType | Choice: Progress, Blocker, Comment, Flagged, Flag Withdrawn | ✓ | ✓ | |
| Flag Event | IsFlagEvent | Yes/No | ✓ | ✓ | Index helper for Flagged and Flag Withdrawn. Consumers re-check EntryType. |
| Body | Body | Multi-line plain (≤2,000) | | | |
| Hidden | IsHidden | Yes/No | ✓ | | Moderation; the item's permissions are narrowed as well |

Folders:

- Comments and flags on notices and register entries go in `{Key}/`.
- Action updates go in `{Key}/A{actionId}`, which mirrors the action's
  permissions.

There is no competency column: the area is taken from the folder path. An
Updates item counts only if it is in the folder its parent requires (F.5):

- `{area of the notice or entry}/` for notices and register entries;
- `{primary area}/A{ParentId}` for actions.

Hidden items are excluded from snapshots.

#### 10. Calendar Events

Title, EventType (10), StartTime (Idx), EndTime, AllDay, Location, Details,
Competency (Idx), IsImportant (Idx), RelatedActionId, SeriesId (Idx), Status (Scheduled/Cancelled; Idx), NotifyMembers, **ClientKey** (✓ U),
plus the standard concurrency columns.

- List setting: "edit items created by the user".
- Members create and edit their own events directly.
- Changes to others' events are moderated through the queue. The moderated
  event is then made read-only to its author. This adds an item-level
  permission scope, which should be rare.
- Flows never create calendar events. Meetings are shown on calendars directly
  from the Meetings list.
- Dates are written with the proven verified-write helper.

#### 11. Meetings

Title, Competency (Idx), MeetingDate (Idx), Location, OnlineLink, Chair, Status
(Scheduled, In Progress, Finalising, Finalised, Cancelled; Idx), IntervalStart,
CutoffTime, StartedBy, PreviousMeetingId, FinalisedAt (Idx), FinalisedBy,
NextMeetingDate, CancellationReason, AmendmentCount, plus the standard
concurrency columns, and:

- **CutoffUpdatesId**: the highest Updates item ID at the cutoff (F.5);
- **PendingChanges**: a count kept by the flows (F.7.2).

The chair must be a meeting administrator of the area or a member of
management.

#### 12. Meeting Items

```
MeetingItems/{Key}/MTG-{id}/          agenda snapshot rows and amendment rows (flows; area: read)
MeetingItems/{Key}/MTG-{id}/Record/   attendance, outcomes, new business, decisions
                                      (area: read; the area's meeting administrators [individual grants]
                                      + Management: contribute while open; reset to inherited read
                                      at finalisation or cancellation)
```

| Display | Internal | Type | Idx | Row types |
|---|---|---|---|---|
| Title | Title | Text | | all |
| Row Key | RowKey | Text 120, ✓ | ✓ U | all. Flow-created rows:<br>• agenda `F\|{meetingId}\|A\|{sourceType}\|{sourceId}`<br>• attendees `F\|{meetingId}\|P\|{siteUserId}`<br>• amendments `F\|{meetingId}\|M\|{requestKey}`<br>• §9 rows `F\|{meetingId}\|S\|{actionId}`<br>Rows written by users carry `U\|{clientKey}`. |
| Record Key | RecordKey | Text 120 | ✓ (not unique) | Rows written by meeting administrators:<br>• outcomes `{meetingId}\|O\|{sourceType}\|{sourceId}`<br>• new business and decisions `{meetingId}\|N\|{clientKey}`<br>Not unique, so another area cannot block a key. The chair resolves any duplicates at Finalise (F.7.4). |
| Meeting ID | MeetingId | Number | ✓ | all |
| Row Type | RowType | Choice: Agenda Item, Attendee, Outcome, New Business, Decision, Amendment | ✓ | all |
| Section | Section | Choice (10) | | |
| Source Type / Source ID | SourceType / SourceId | Choice / Number | — / ✓ | agenda and outcome rows |
| Sort Order / Agenda Marker | SortOrder / AgendaMarker | Number / Choice | | agenda |
| Snapshot fields | SnapshotOwner, SnapshotStatus, SnapshotDueDate, SnapshotOriginalDueDate, SnapshotExtensionCount, SnapshotProgress, SnapshotBlocker, SnapshotDateClosed, SnapshotDetails | Text / Date / Number / Multi-line | | agenda |
| Carried From Row Key | CarriedFromRowKey | Text | | carried forward |
| Attendee / Attendance | Attendee / Attendance | Person / Choice | | attendees |
| Outcome / Notes | Outcome / Notes | Choice: No change, Discussed, Deferred, Not reached, Action raised, Discarded / Multi-line plain | | outcomes, new business, decisions |
| Amendment Reason / Amended By | AmendmentReason / AmendedBy | Multi-line plain / Person | | amendments |

Outcome rows are keyed by **source**, not by agenda row ID. This lets outcomes be
recorded before the server has finished fixing the agenda (F.7.2).

- The browser checks for an existing outcome row before creating one, and edits
  it using its ETag.
- Any duplicate that still arises is shown to the chair at Finalise.
- Actions raised at a meeting are linked through `Actions.SourceType = Meeting`
  and `SourceId`, which only the server sets.

#### 13. Requests

- One folder per person, `u{SiteUserId}` (Owners plus that person,
  Contribute), plus a `System` folder that only flows can write to.
- At list level, only Owners have access.
- List setting: "edit items created by the user", so users cannot rename their
  folder.
- Attachments are on.
- **Every field is untrusted input.**
  - The flow reads the item once, at claim, and copies it into a transaction
    row (D.2 #6).
  - Afterwards the flow writes the item's Status and result only as a mirror.
    Nothing the user changes on the item affects processing.

| Display | Internal | Type | Req | Idx |
|---|---|---|---|---|
| Title | Title | Text | ✓ | |
| Request Key | RequestKey | Text 36 | ✓ | ✓ U |
| Request Type | RequestType | Choice (F.1.3) | ✓ | ✓ |
| Target Type / Target ID | TargetType / TargetId | Choice / Number | | — / ✓ |
| Meeting ID | MeetingId | Number | | ✓ |
| Expected Revision | ExpectedRevision | Number | | |
| Payload | Payload | Multi-line plain (JSON, transport only) | ✓ | |
| Status | Status | Choice: Uploading, Submitted, Processing, Completed, Rejected, Failed, Needs attention, Upload incomplete | ✓ | ✓ |
| Result Message / Result ID | ResultMessage / ResultId | Multi-line plain / Number | | |
| Attempts / Processed At | Attempts / ProcessedAt | Number / Date and time | | — / ✓ |

#### 14. Notification Log

The delivery ledger (F.4.2). Readable by administrators only.

| Display | Internal | Type | Req | Idx |
|---|---|---|---|---|
| Title | Title | Text | ✓ | |
| Notification Key | NotificationKey | Text 120 | ✓ | ✓ U |
| Token | Token | Text 20 | | ✓ |
| Notification Type | NotificationType | Choice | ✓ | ✓ |
| Recipient / Recipient Email | Recipient / RecipientEmail | Person / Text | ✓ | ✓ / |
| Record Type / Record ID | | Choice / Number | | — / ✓ |
| State | State | Choice: Queued, Sending, Sent, Failed, Unknown, Skipped, Abandoned | ✓ | ✓ |
| Attempts / Sending Since / Next Attempt After | | Number / Date and time / Date and time | | — / ✓ / ✓ |
| Run ID / Lease Until | | Text / Date and time | | — / ✓ |
| Render Data | RenderData | Multi-line plain (JSON) | ✓ | |
| Due Day | DueDay | Number | | ✓ |
| Last Error / Sent At / Skip Reason | | Multi-line plain / Date and time / Text | | |

Notes on the columns:

- **Token**: `ESGN{ID as six digits}{four random letters and digits}`, for
  example `ESGN000012K7Q2`. It has no separators, so a mail search cannot split
  it. It is written straight after the row is created, appears in the email
  footer, and is what reconciliation searches for.
- **Render Data**: everything needed to rebuild the message on any retry.
- **Due Day**: for action reminders only. It lets Daily Tasks fetch existing keys
  in one query.

Notification keys:

| Notification | Key |
|---|---|
| 7-day reminder | `R7\|{actionId}\|{DueDay}\|{recipient}` |
| Due today | `DUE\|{actionId}\|{DueDay}\|{recipient}` |
| Overdue | `OD\|{actionId}\|{DueDay}\|{n}\|{recipient}` |
| Assigned / reassigned away | `ASG\|{requestKey}\|{recipient}` / `RAW\|{requestKey}\|{recipient}` |
| Extension | `EXT\|{requestKey}\|{recipient}` |
| Ready for close-out | `RDY\|{requestKey}\|{recipient}` |
| Closed | `CLS\|{requestKey}\|{recipient}` |
| Minutes | `MIN\|{meetingId}\|{amendmentCount}\|{recipient}` |
| Summary | `SUM\|{mondayIso}\|{recipient}` |
| Calendar digest | `CAL\|{todayIso}\|{recipient}` |
| Administrator alert | `ALR\|{alertType}\|{subject}\|{todayIso}\|{recipient}`, so at most one per subject per day |

`{recipient}` is the recipient's Site User ID.

### D.3 Relationships

```
Competencies 1─* Competency Members *─1 People
Competencies 1─* Actions (primary); Actions *─* Competencies (linked)
Actions 1─* History (RecordType=Action, RecordId) in {Key}/A{id}
Actions 1─* Updates (ParentType=Action) in {Key}/A{id}
Actions ─(SourceType, SourceId)→ Meeting | Notice | Register entry
Notice / Register entry 1─* Updates (comments, flag events)
Meetings 1─* Meeting Items (agenda, record, amendments)
Meeting Items (Outcome) ─(RowKey source)→ Meeting Items (Agenda Item, same meeting)
Calendar Events ─(RelatedActionId)→ Actions; meetings are shown on calendars directly
People 1─1 Requests folder; Requests ─(RequestItemId)→ History transaction row
Notification Log ─(RecordType, RecordId)→ Action | Meeting | …
```

### D.4 Indexes, thresholds and volumes

**Volumes [Assumption], five-year estimates:**

| List | Items |
|---|---|
| Actions | about 6,000 |
| History | about 45,000 |
| Updates | about 35,000 |
| Meeting Items | about 35,000 |
| Notification Log | about 30,000 |
| Requests | under 25,000 (purged) |

**Rules:**

1. **Indexed filter first.** Every query against a list that can grow past 5,000
   items begins with an indexed filter that narrows the **scanned** rows below
   5,000. Typical leading filters:

   | List | Leading filter |
   |---|---|
   | Actions | `IsOpen eq 1`, `AssignedTo`, `RaisedBy`, `Competency`, a `DateClosed` range, `IsCrossCompetency eq 1` |
   | History | `RecordId` (with `RecordType`), `RequestKey`, `RequestItemId`, `State` (one query per value), `LeaseUntil`, an `EventTime` range |
   | Updates | `ParentId`, `IsFlagEvent eq 1` |
   | Meeting Items | `MeetingId`, `SourceId` |
   | Notification Log | `NotificationKey`, `State`, `NextAttemptAfter` |
   | Requests | `Status`, `RequestKey`, `MeetingId` |

2. **Exclude folder rows** with `FSObjType eq 0`.
3. **Cross-folder queries** use `RenderListDataAsStream` with
   `Scope="RecursiveAll"`.
4. **Sort in the browser**, never `$orderby` on a column that is not indexed.
5. **Paging** follows `odata.nextLink` only when the link stays on the same
   site.
6. **Flows always paginate**, so a 100-row default never truncates results
   silently.
7. **Volume test** in Phase 6: 10,000 actions and 60,000 history rows.

### D.5 History model

| Change | Recorded in | Protection |
|---|---|---|
| Every queued change: actions, extensions, register, notices, meetings, people, memberships, competencies, settings | History (a transaction row per request; event rows written at commit) | Users read only; flow-written; unique keys |
| Progress updates, blockers, comments, flags | Updates (append-only) | Users can add only; they cannot edit or delete |
| Discussion history | Updates flag events plus the outcome rows of finalised meetings | Outcome rows become read-only at finalisation |
| Edits to the user's own calendar entries | SharePoint version history (Owners) | Low-risk collaborative content |
| Notifications | Notification Log | Administrators only |

### D.6 Retention [Rec, D-11]

| Data | Proposed retention |
|---|---|
| Business, history and updates lists | Kept indefinitely |
| Requests | 365 days (only Completed and Rejected requests are purged) |
| Notification Log | 24 months |
| Exports | 12 months |
| Recycle bin | 93 days |

Purview labels are an IT option.

### D.7 Simplification review: is every list justified?

| List | Kept, merged or added | Justification; what removing it would cost |
|---|---|---|
| Competencies | Kept | Configurable areas (ADM-05). Without it, areas would be hard-coded. |
| People | Kept | Role, administrator flag and folder ID, held once rather than per membership. Management users are not members. |
| Competency Members | Kept | Many-to-many memberships with history and expiry (ADM-02/03) |
| Settings | Kept | Configuration without code changes (brief §3.7). About 20 rows. |
| Actions | Kept | Core record |
| **History** | **Merged** Action History and Audit Log; also holds transaction rows | One audit search and one transaction mechanism, with visibility handled by folders. A separate Transactions list was considered; a flow-only folder gives the same protection without another list. |
| Improvement Register | Kept | Distinct fields and lifecycle (brief §12) |
| Noticeboard | Kept | Distinct module (brief §13) |
| **Updates** | **Added**; replaces Comments, and removes the need for an "Action Notes" list and for flag fields on notices and register entries | Makes routine updates and flags instant and immutable. Without it, these operations would be queued and slow. |
| Calendar Events | Kept | Brief §14. Meetings are no longer copied into it. |
| Meetings | Kept | Header and lifecycle |
| Meeting Items | Kept | Snapshot and record. Merging it with Meetings would mix controlled and editable rows. |
| Requests | Kept | The only standard-licence route to server-enforced changes |
| Notification Log | Kept | Duplicate prevention and safe retries (F.4.2) |
| Records Export (library) | Kept; the monthly export **flow is removed** | Exports are created in the browser by an administrator, prompted monthly. This uses no request allowance. |
| *Considered and rejected* | Separate lists for Action Extensions, Meeting Decisions, Snapshots, Discussion Flags or Attendance; one list per competency; one site per competency | Duplication, more provisioning, cross-competency problems |

The total is **14 lists plus 1 library**: one list fewer than revision 2, with
faster routine operations.

---

## E. Permissions specification

### E.0 Access model: everyone reads every area, members change their own **[You, 21 Oct 2026]**

**Your decision.** Every member of staff can **see** every competency area, so
each area is transparent to the whole group. Only these people can **add or
change** things in an area:

- the area's own members (its engineers and technicians);
- Team Leaders and the Group Head, who can add and change things in every area.

This section replaces the earlier assumption that people see only their own
areas. Where E.2–E.6, F.1.3 or B conflict with it, this section wins.

| Person | Their own areas | Every other area |
|---|---|---|
| Technician | Read and contribute: post updates and notices, flag items, raise actions, keep their own calendar entries, and act as owner on their actions | **Read only** |
| Engineer | As a technician, plus the action-manager and meeting-administrator rights in E.3 | **Read only** |
| Team Leader, Group Head | Everything, in all areas | — |
| System administrator | The admin role adds no operational rights. Administrators can read every area, as everyone can. | Read only, unless also a member |

**What a read-only visitor can do** in an area that isn't theirs:

- see its actions, notices and issues, calendar, meetings and finalised minutes;
- **not** raise, comment, flag, extend, post or edit there.

The UI marks such pages "View only", and the server enforces the rule.

**Assumption to confirm (A-1).** Whether a read-only visitor may **flag an item
for an area's meeting** or **comment**. Recommended: no, keep strictly read-only.
Members can raise matters on a visitor's behalf.

**Changes to the design:**

1. **Reading.** The All Users group gets **Read** on each list's competency
   folders, so no per-area read grants are needed. These stay restricted:
   - other people's request folders;
   - the History folders `Administration` and `Transactions`;
   - the Notification Log;
   - the Records Export library;
   - hidden comments.
2. **Writing is unchanged in principle.**
   - Members and management get **Add** (Updates, Noticeboard) or
     **Contribute** (Calendar, open meeting `Record`) on their area's
     `{Key}` folders.
   - Every queued request still checks membership on the server (F.1.2 step 6).
   - Non-members' writes are refused by SharePoint and by the flows.
3. **Cross-competency actions become simpler.** Linking or unlinking an area no
   longer changes who can *read* the action. It only changes who may *write*
   updates in its `A{id}` folder. Item-level read grants and read revocations
   are no longer needed.
4. **Fewer unique permission scopes.** Item-level scopes now exist only for:
   - write access on cross-competency actions;
   - hidden comments;
   - moderated calendar entries.
5. **Archived areas** (CMP-06, as amended) are **read-only for everyone** and
   listed under "Archived areas", rather than hidden. No new records can be
   added.
6. **Search** covers all areas for everyone (SRC-03 applies to all staff).
7. **Notifications** are unchanged. Emails still go only to the people
   involved.

**Security note.** This widens who can *read* area records to all Hub users.
It suits operational transparency, but confirm that no area holds information
that should be restricted, for example personal or security-sensitive
content (C-13). If any does, that content needs a separate restricted
location, not the general area pages.

### E.1 People and initial memberships [Brief] (checked against the brief)

✓ means the person is a member of that competency. Joe Pepper, Mark Wellstead and
Nathan Tilly have access to all ten areas through the **Management** role and
are not stored as members.

Column codes: FLK Flask · INS Instruments · GRS Green Stream · RPE RPE · BA BA ·
DOS Dosimetry · RP Radiological Protection · DSL DSL · ALS Active Lab & Sampling ·
RW Radwaste

| # | Person | Role | FLK | INS | GRS | RPE | BA | DOS | RP | DSL | ALS | RW | Areas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Andrea Medlicott | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 2 | Kelly Bates | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 3 | Ben Beak | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 4 | Dave Beeching | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 5 | Craig Bunney | Engineer | | | | | | | ✓ | | ✓ | | 2 |
| 6 | Aiden Gorham | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 7 | Richard Harrisson | Engineer | | | ✓ | | | | ✓ | ✓ | | ✓ | 4 |
| 8 | Jake Stafford | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 9 | Chloe Tilly | Engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| 10 | Kai Todd | Engineer | | | ✓ | | | | ✓ | | | ✓ | 3 |
| 11 | Trevor Baldwin | Technician | | | ✓ | ✓ | | | ✓ | | ✓ | ✓ | 5 |
| 12 | Rachel Boulden | Technician | ✓ | ✓ | ✓ | | | ✓ | ✓ | | ✓ | | 6 |
| 13 | Mark Buckley | Technician | | | ✓ | ✓ | | | ✓ | | | | 3 |
| 14 | Luke Cain | Technician | | ✓ | ✓ | | | | ✓ | | | ✓ | 4 |
| 15 | Doti Cange-Ainsworth | Technician | ✓ | | ✓ | | | ✓ | ✓ | | ✓ | | 5 |
| 16 | Adrian Cooke | Technician | | | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | 6 |
| 17 | Charlie Everitt | Technician | | | ✓ | ✓ | ✓ | | ✓ | | ✓ | | 5 |
| 18 | Matt Henley | Technician | ✓ | | ✓ | ✓ | ✓ | | ✓ | | | ✓ | 6 |
| 19 | Kevin Hewitt | Technician | | ✓ | ✓ | | | ✓ | ✓ | | ✓ | | 5 |
| 20 | Richard Howe | Technician | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | 6 |
| 21 | Nick Pearce | Technician | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | | | 6 |
| 22 | Steve Punnett | Technician | ✓ | | ✓ | | | | ✓ | ✓ | ✓ | | 5 |
| 23 | Jenn Tibbenham | Technician | | | ✓ | | | | ✓ | | | | 2 |
| 24 | Adam Washford | Technician | ✓ | ✓ | ✓ | | | | ✓ | | | ✓ | 5 |
| 25 | Sadie Young | Technician | | | ✓ | | | ✓ | ✓ | | ✓ | | 4 |
| 26 | Joe Pepper | Team Leader **[You]** | all (role) |
| 27 | Mark Wellstead | Team Leader **[You]** | all (role) |
| 28 | Nathan Tilly | Team Leader **[You]** | all (role) |
| 29 | Robert Starbuck | Group Head **[You]** | all (role) |

| Competency | Engineers | Technicians | Members |
|---|---|---|---|
| Flask | 7 | 6 | 13 |
| Instruments | 7 | 4 | 11 |
| Green Stream | 9 | 15 | 24 |
| RPE | 7 | 7 | 14 |
| BA | 7 | 5 | 12 |
| Dosimetry | 7 | 5 | 12 |
| Radiological Protection | 10 | 15 | 25 |
| DSL | 8 | 4 | 12 |
| Active Lab & Sampling | 8 | 7 | 15 |
| Radwaste | 9 | 5 | 14 |
| **Total** | **79** | **73** | **152** |

The totals cross-check: by person, engineers 79 and technicians 73, matching the
totals by competency.

Notes on the seed data:

- **Import by UPN, never by name.** Several names are close: Chloe/Nathan Tilly,
  Richard Harrisson/Richard Howe, Mark Buckley/Mark Wellstead.
- **Confirm the spelling "Harrisson".**
- **Role titles.** Which person is Team Leader and which is Group Head is
  [Assumption] to be confirmed. Both titles carry identical access.
- **Default meeting administrators.** Engineers by default [Rec]. Technicians
  only when delegated.

### E.2 Roles and authorisations

| Concept | Source of truth | Grants |
|---|---|---|
| Competency membership [Brief; E.0] | Competency Members → group "Competency Hub – {Name} Members" | Write rights in that area: add updates, flags and notices; edit own calendar entries. Reading every area comes from All Users (E.0). |
| Action ownership [Brief] | `Actions.AssignedTo` | Owner operations |
| Action manager [Rec, derived from Brief §9.3] | Raiser, area engineers, meeting administrators, management | Management operations on actions |
| Meeting administration [Brief/Rec] | `Competency Members.CanManageMeetings` | Meeting lifecycle; area moderation; Contribute on the open meeting's `Record` folder; may chair meetings (as may management) |
| Management [Brief] | `People.Role` (Team Leader or Group Head) → group "Competency Hub – Management" | All areas; the dashboard; read-only People & Access; administration History |
| System administration [Brief §5.4; read access to all areas is Rec] | `People.IsAdministrator` → group "Competency Hub – Administrators" | People & Access, settings, history, transaction rows, read access to all areas |
| Flow account (D-03) | Owner and Site Collection Administrator | Full Control; does all queued writes and permission changes |
| Flow co-owners (D-04) | Co-owners of the solution's flows | Can edit the flows and use the flow account's connections, which is effectively Site Collection Administrator and mailbox access. A privileged role. |

The browser uses roles only to decide which menus to show. SharePoint
permissions and the flow checks are the real security boundary.

### E.3 Capability matrix

Column abbreviations: Eng = engineer in the area; MA = meeting administrator in
the area; Mgmt = management; Admin = system administrator.

| Operation | Member | Owner | Raiser | Eng | MA | Mgmt | Admin* |
|---|---|---|---|---|---|---|---|
| View area records (every area, for every Hub user: E.0) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Raise action | ✓ | | | ✓ | ✓ | ✓ | |
| Post progress update or comment (instant) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Change status, record a blocker | | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Extend deadline | | ✓ | ✓¹ | ✓¹ | ✓¹ | ✓¹ | |
| Mark complete | | ✓² | ✓ | ✓ | ✓ | ✓ | |
| Close with an outcome, reopen, reassign, edit | | | ✓ | ✓ | ✓ | ✓ | |
| Link a competency | | | ✓³ | ✓³ | ✓³ | ✓ | |
| Change primary competency; correct original deadline | | | | | | ✓ | ✓ |
| Raise register entry; comment; flag (instant) | ✓ | | | ✓ | ✓ | ✓ | |
| Withdraw flag | flag raiser or author | | | | ✓ | ✓ | |
| Change register status | | | ✓ / responsible person | ✓ | ✓ | ✓ | |
| Post notice (instant); edit or archive own | ✓ | | | ✓ | ✓ | ✓ | |
| Pin; archive others' notices; hide comments | | | | | ✓ | ✓ | |
| Add or edit own calendar entry (instant) | ✓ | | | ✓ | ✓ | ✓ | |
| Edit others' calendar entries | | | | | ✓ | ✓ | |
| Meeting lifecycle; live recording | | | | ✓⁴ | ✓ | ✓ | |
| People, memberships, competencies, settings | | | | | | view | ✓ |

¹ Recorded as on behalf of the owner, and the owner is notified.
² This is how the owner closes an action (ACT-05, ACT-06).
³ The person must also be a member of the target area.
⁴ Engineers are meeting administrators by default.
\* The administrator role alone grants no operational rights.

**Progress updates by non-owners:** anyone with access to the action can post
them **[Rec]**. They are shown as comments, labelled with the author.

### E.4 Enforcement

**Permission levels** (custom, created by Setup):

| Level | Based on | Removed | Used for |
|---|---|---|---|
| **Competency Hub Read** | Read | View Versions, Create Alerts | Viewing |
| **Competency Hub Add** | — | Only Add Items, View Items, Open Items, View Pages, Browse User Information, Use Remote Interfaces and Open are included | Updates, Noticeboard (add-only, immutable) |
| **Competency Hub Contribute** | Contribute | Delete Items, Delete Versions, View Versions, Create Alerts, personal views and web parts | Own request folder, Calendar Events (edit own), meeting `Record` |

The Add level depends on probe P-13: whether users can create items in a folder
through REST without Edit rights. The fallback, F-ADD, is in I.3.

**Groups**, created and maintained by flows. Each is set to "membership visible to
Group Owner", accepts no join requests, and has no site-level permission:

- Competency Hub – All Users
- Competency Hub – {Name} Members (×10)
- Competency Hub – Management
- Competency Hub – Administrators

That is **13 groups** in all. Because members cannot see group membership, the
UI shows memberships from Competency Members, with the flow-recorded
*Access Verified* time.

**Site settings:**

- Only owners can share; external sharing is off.
- Access requests are off.
- Limited-access lockdown is off (C-03).
- The default Members and Visitors groups are empty.

**Grants to All Users:**

| Object | Permission |
|---|---|
| `Hub.aspx` (unique permissions) | Read |
| Welcome Web Part - Custom Layouts | Read |
| Welcome Web Part - Errors | Read |
| Competencies, People, Settings | Read |

**Lists and folders.** Inheritance is broken on every list. Owners keep Full
Control, and the flow account is Site Collection Administrator.

| List | List level | Folder `{Key}` | Other folders |
|---|---|---|---|
| Competency Members, Actions, Improvement Register, Meetings | none | `{Key}` Members, Management, Administrators: Read | Cross-competency or reclassified action: item permissions cover all its areas |
| History | none | `{Key}` (covering `A{id}` and `Records`): area, Management, Administrators: Read | `Administration`: Management and Administrators Read. `Transactions`: Administrators Read. `A{id}` mirrors the action when it spans areas. |
| Updates | none | `{Key}` Members and Management: **Add**; Administrators: Read | `A{id}` mirrors the action's groups (Add). Hidden entries get narrowed item permissions. |
| Noticeboard | none | `{Key}` Members and Management: **Add**; Administrators: Read | |
| Calendar Events | none | `{Key}` Members and Management: **Contribute** (edit own); Administrators: Read | Moderated events: the author is reduced to Read on that item |
| Meeting Items | none | `{Key}` area, Management, Administrators: Read | `MTG-{id}/Record` while open: inherited Read, plus Contribute for the area's meeting administrators (individually) and Management. Reset to inherited Read at finalisation or cancellation. |
| Requests | none | — | `u{SiteUserId}`: that person, Contribute (Read once the person has left). `System`: flows only. |
| Notification Log | Administrators: Read | — | |
| Records Export | Administrators: Contribute (no delete) | — | |

**Archived areas** (CMP-06). Archiving:

- removes the members group from every `{Key}` folder and from open `Record`
  folders;
- reduces Management to Read on the direct-write lists.

Administrators keep Read.

**Unique permission scopes:**

| Source | Scopes |
|---|---|
| Competency folders | About 90 (10 areas across the partitioned lists) |
| Request folders | 28 |
| Open meetings | 10 or fewer |
| Each cross-competency action | 3 (item, `A{id}` in History, `A{id}` in Updates) |
| Hidden updates, moderated calendar events | Rare |
| **Total** | Well under 1,000, against a recommended limit of 5,000 |

**Code integrity.** Only Owners can edit `Hub.aspx` and the layouts library.
Rollback uses the library's version history.

### E.5 Administration processes

#### E.5.1 Bootstrap: the first administrator and initial import (resolves the bootstrap dependency)

The normal administration mechanism needs an existing administrator, with a People
row and a request folder. The **0 Setup** flow therefore provisions the first
administrator before the app is opened.

**Who can run it.** Only the flow owners and co-owners (D-04) can run Setup. D-04
requires them to be site owners and Site Collection Administrators already, so
running Setup grants nobody new privileges. Setup is never shared with run-only
users.

**Inputs** (manual trigger):

- the email and role of each initial administrator (one or two);
- an optional seed CSV file (UPN, role, competency keys, meeting-administrator
  flags);
- the mode: *Install / Repair* (the default) or *Recover administrator*. A
  reason is mandatory for recovery.

**Bootstrap steps.** Each initial administrator gets a transaction row with the
stable key `SYS|Bootstrap|{SiteUserId}` and tracked steps, so the next run
completes a run that failed part-way:

1. Resolve the account with `ensureuser`. It must be in the tenant.
2. Create or update the People row (role from the input, `IsAdministrator`
   still No), the request folder and its permissions.
3. Add the person to All Users, to Management if their role requires it, and to
   Administrators. Read the memberships back.
4. Set `IsAdministrator = Yes`. This is the last change, so the flag never
   claims access that has not been verified.
5. Write the **Bootstrap** event row in `Administration` (Actor = the flow
   connection's account, with the run ID). Mark the transaction Applied and set
   `BootstrapCompletedOn`.

**Guard.** In *Install / Repair* mode, Setup completes any Bootstrap transaction
that is not yet Applied. It **never** starts a new one once a **usable**
administrator exists. A usable administrator has:

- an Active People row with `IsAdministrator = Yes`;
- an enabled account;
- Administrators membership verified by read-back.

Otherwise Setup only reports what it finds.

**Initial import.** If a CSV is supplied, Setup imports the competencies, people,
request folders and memberships in batches. It does this directly rather than
through about 190 separate requests. This keeps the import to roughly
1,100 Power Platform requests, against about 7,000 if each change went through
the queue.

- Each row is idempotent: keys `IMPORT-{UPN}` and `IMPORT-{Key}|{UPN}`. A person
  already created by bootstrap is updated, not duplicated, because People rows
  are unique by Site User ID.
- Rows that do not resolve are reported and skipped. Running Setup again imports
  only what remains.
- One History row records "Initial import" with the totals.

**Recovery.** *Recover administrator* mode runs only when no **usable**
administrator exists, for example when the only administrator's account has been
disabled. It:

- needs a reason;
- runs the bootstrap steps for the named person;
- writes a *Recovery* event row;
- emails every site owner and flow co-owner.

The app itself prevents removing or demoting the last active administrator,
through any request type (ADM-09, F.1.3).

#### E.5.2 Routine processes (queued; transaction steps in F.1.3)

| Process | Key rules |
|---|---|
| Add person | Resolve the account; create the People row; create the request folder; set group memberships; read them back |
| Add membership | Upsert the membership row by key; add to the group; read it back; set `AccessVerifiedOn` |
| Remove membership | Pre-check outstanding work (owned open actions, register responsibilities, future chair roles) and reject if any exists. **Remove access first**, then mark the row Removed. |
| Person leaves | The reassignment wizard runs first, then the last-administrator guard. Access is removed and **each membership row is marked Removed** (all groups, `Record` grants, request folder set to Read). The person is then marked Left. |
| Change role, reactivate person | Queued. Management membership follows the role: access is revoked before the values change and granted after. |
| Temporary access | Daily Tasks submits a removal request for expired rows, which goes through the same pre-checks. If outstanding work blocks it, administrators are alerted daily and the matrix shows *Expired – outstanding work*. |
| Administrator change | Last-administrator guard; then group change and read-back |
| Add competency | Create the row, the group, and `{Key}` folders in every partitioned list with their permissions; read back |
| Archive or reactivate competency | Archiving removes members' access and reduces Management to Read on the direct-write lists before the status changes (CMP-06). Reactivation restores them after it. |
| Access check (in Daily Tasks, weekly) | **Report only.** It compares groups, folder and item permissions, and folder consistency, with the expected model. The model excludes people marked Left, and the check skips any record with a lock or an unfinished transaction. It ignores the flow account and Limited Access entries. An administrator reviews the report and submits *Repair access*, a queued transaction (F.1.3). |

### E.6 Security analysis and limitations

**Protected:**

- **Reading across areas:** folder and item permissions.
- **Controlled records:** read-only to users.
- **Queued changes:** server checks; identity taken from the request folder, plus
  a tripwire; private copies in transaction rows; leases; record and guard
  locks.
- **Direct writes:** limited to add-only or edit-own lists, in folders the user
  is permitted to write to (subject to P-13). Typed fields on them never grant
  anything: folder paths, server IDs and flow-written rows decide (D.0).
- **Meeting finalisation:** validates every `Record` row against the server
  agenda.
- **Order of permission changes:** steps run so that an interruption always
  leaves access **narrower** (F.1.3).
- **Sharing and code changes:** owners only.
- **Lookups:** point only to Competencies, so no titles leak.
- **Search:** results are re-read before they are shown.
- **Email:** values are escaped, and only people with access receive it.

**Script injection.** Code runs with the viewer's rights, including the Site
Collection Administrator's when the flow account's owner uses the app. Code
rules S1–S8, an XSS sweep and the security tests are release blockers.

**Limitations of SharePoint, stated plainly:**

1. **Owners can bypass the app.** The flow account and site owners can change
   records outside the app's audit. Purview audit, if enabled, records them.
2. **Created By, Created and Modified might be forgeable** when a user creates
   an item directly (P-05). If so, a member could post content under someone
   else's name. They still could not:
   - edit other people's items;
   - change the order of flag events, which uses server-assigned IDs (F.5).

   Mitigation: fallback F-ID (I.3) moves attribution to folders or to the
   queue.
3. **Version history is for owners only.** Members see only the current values.
4. **Sent emails stay sent.** They remain in mailboxes after access is removed.
5. **Finalised minutes are permanent.** They stay readable to the area, even
   after an action is later unlinked.
6. **Search can lag.** Search entries may be briefly stale. They are never
   displayed without being re-read.

---

## F. Workflow specification

### F.1 Request transaction processing (redesigned)

#### F.1.1 Principles

1. **Work from a private copy.** The first time the flow claims a request, it
   creates a **transaction row** in History's flow-only `Transactions` folder.
   - It copies the request into that row: type, target, expected revision,
     meeting, payload and attachments, with a list of file names and sizes.
   - From then on it works only from the transaction row.
   - The request is identified by its server-assigned item ID. Editing the
     request item afterwards (its status, attempts, key, payload or
     attachments) therefore changes nothing.
2. **Fix the event time, then plan.** The event time is fixed from the first
   claim (F.1.2 step 4). The plan is stored on the transaction row before any
   record is touched: the previous values, the new values and the steps to take.
3. **Lock.** The target record's `PendingRequestKey` is set with a conditional
   write (`IF-MATCH` on the ETag, plus a Revision check). While it is set:
   - other queued requests for the record are rejected ("being updated");
   - the UI shows "Being updated…".

   Rules that span records also lock **guard rows**:
   - the People row of every person whose access the request relies on or
     changes;
   - the Settings row `AdministratorGuard`, for any change to the number of
     administrators.

   Guard rows are locked in ascending ID order, before the target. A lock that
   cannot be taken rejects the request at once. Nothing ever waits for a lock,
   so there is no deadlock.

   Locks never expire by time. They are released by finishing, resuming or
   rolling back the request.
4. **Ordered, idempotent steps.** Each step checks whether it has already been
   done before acting, using the lookup rule in D.0: the item must be in the
   expected folder, and flow-created where users can write to it; anything else
   is quarantined. `StepsDone` records progress, so an interrupted run resumes
   where it stopped.
5. **Narrow access first.** Any step that **removes** access runs before the
   change becomes visible. Any step that **grants** access runs after the change
   is recorded. An interruption therefore never leaves access wider than
   authorised.
6. **Applied means every essential step succeeded.** The essential steps are:
   - the values;
   - permissions, confirmed by read-back;
   - evidence, folders and rows;
   - the history event rows;
   - the notification rows placed in the outbox (F.4.2).

   Only then does the transaction become **Applied**. The lock is then released
   and the request is mirrored as **Completed**. Sending the emails comes
   afterwards and is not essential, because the outbox guarantees they are sent
   later.
7. **Point of no return.** A request can be rejected only while nothing has been
   done: `StepsDone` is empty and no record has been created. After that, it can
   only be resumed, or rolled back by an administrator (F.1.5).
8. **Leases.** A run holds a lease on the transaction row: `RunId`, and
   `LeaseUntil` set 20 minutes ahead.
   - The lease is renewed with `IF-MATCH` before every step, including by child
     flows.
   - A run that cannot renew its lease stops at once.
   - Recovery takes over only after a lease has expired.
   - Action timeouts are kept shorter than the lease. P-10 confirms how child
     flows behave when they run for more than 2 minutes.
9. **Success is confirmed on the target** (C.6), never from the request item
   alone.
10. **No silent failure.** Every scope's `result()` is inspected, as is every
   `HasException` from `validateUpdateListItem`. Pagination is always set, and
   child flows respond on failure as well as on success.

#### F.1.2 Processing sequence (the Request Queue flow)

Trigger: a Requests item is created or modified with Status = Submitted
(concurrency off). Queue Monitor re-fires the trigger when it resumes a request
(F.1.5).

1. **Identify the requester** from the item's folder.
   - **`u{id}` folder:** the actor is that person. The request is Rejected, with
     no transaction, if:
     - the item is not directly inside a person folder;
     - the folder was not created by the flow account; or
     - the person is missing or has Left.

     If Created By is not the folder owner, the **tripwire** also fires: a
     History *Tripwire* event and an administrator alert.
   - **`System` folder:** only flows can write there. The actor is *System*, and
     only the allow-listed types Heartbeat and RemoveMembership (expiry) are
     accepted.
   - **Rate limit:** more than 30 new transactions in an hour from one folder
     gives "Too many requests – try again later".
2. **Claim.** Look up the transaction row by `RequestItemId`.
   - **None exists:** create it (State *Received*, `FirstClaimedAt` = now, with
     a lease) and copy the request into it (F.1.1 #1). The unique RequestKey
     makes concurrent claims safe: a run that loses the race stops.
   - **One exists:** go to step 3. The item's current content is ignored.
3. **Resume check**, by the transaction's state:

   | State | Action |
   |---|---|
   | **Applied** | Repeat the release (only if the target's `PendingRequestKey` still equals this key), mirror Completed and stop. |
   | **Received**, **Planned**, **Applying**, or **Failed** past `NextAttemptAfter`, with no live lease | Take the lease with `IF-MATCH` and continue: *Received* from step 4, the others from step 8, using the stored plan and `StepsDone`. |
   | Any state with a live lease | Stop; another run owns it. |
   | **Void**, **Rolled Back** or **Needs attention** | Mirror the status and stop. |
4. **Event time.** Use the request's Created time if it lies within
   `EventTimeToleranceMinutes` (30) before `FirstClaimedAt`; otherwise use
   `FirstClaimedAt`. The event time therefore never changes on a retry. *Today*
   for validation is the UK date of the event time.
5. **Load and parse.**
   - Read the target and the actor's memberships.
   - Parse the payload against the schema for its type. Only allowed operations
     and fields are accepted.
   - A MeetingId must name a meeting that is Scheduled or In Progress in the
     target's area.
   - Folder and list names always come from server data, and text used in OData
     filters is escaped.
6. **Authorise and validate**, using E.3, the validation rules and D.0.1.
7. **Concurrency pre-check.** The target's `Revision` must equal
   `ExpectedRevision`, and `PendingRequestKey` must be empty.

   If steps 5–7 fail, the transaction becomes *Void* and the request *Rejected*,
   with a message naming the field or rule. Security failures also write a
   History *Request Rejected* event in `Administration`.
8. **Plan and apply.**
   - Store the plan (state *Planned*).
   - Run the type-specific steps in F.1.3 (state *Applying*). Before each step,
     renew the lease; after it, record it in `StepsDone`.
   - **At the lock step:** a 412 response or a Revision mismatch, while
     `StepsDone` is still empty, makes the transaction *Void* and the request
     *Rejected* with the ACT-11 message.
   - **On resume:** the lock step accepts a lock that already equals this key,
     and a Revision equal to the planned value + 1.
9. **Commit**, in this order:
   1. write the history event rows `{key}|{n}` in the record's History folder;
   2. create the notification rows for this change in the outbox (State
      *Queued*, with RenderData);
   3. set the transaction to *Applied*;
   4. release the target and guard rows: clear `PendingRequestKey` **only if**
      it equals this key, and set `LastRequestKey` on the target;
   5. mirror *Completed* on the request item, with ResultId and a ResultMessage
      such as "Deadline extended to 30 October 2026".

   Steps 9.1 and 9.2 are idempotent by key. If a run stops between 9.1 and 9.4,
   the record keeps showing "Being updated…" until the resume completes.
10. **Send.** Call Send Notification for the new outbox rows. If that fails, the
    change still stands: Queue Monitor sends any Queued row older than 10
    minutes (F.4.2).
11. **Catch.** A failure after the point of no return:
    - sets the transaction to *Failed*, increases Attempts, records `LastError`
      and `NextAttemptAfter`, releases the lease and keeps the lock;
    - mirrors "Failed – retrying" on the request item.

    Queue Monitor resumes the transaction after 15 minutes, and again after 30
    minutes, so there are 3 attempts in all. After the third failure the
    transaction becomes *Needs attention* and administrators are alerted.

    A failure before the point of no return, for example SharePoint being
    briefly unavailable at step 5, leaves the transaction *Received*. It is
    resumed in the same way.

#### F.1.3 Step catalogue

Terms used in the catalogue:

- **Lock** sets `PendingRequestKey` on the target, and on any guard rows
  (F.1.1 #3).
- **Values** is a conditional write of the business fields that increases
  `Revision`.
- **Read back** re-reads permissions to confirm them.
- **Commit** is F.1.2 step 9: history events, outbox, Applied, release. Every
  type ends with it.

| Request type | Steps, in order |
|---|---|
| RaiseAction | 1. Create the action in `{Key}` with the values, `CreatedRequestKey = F\|{key}` and the lock. A flow-created action with that key is reused. 2. Create `A{id}` folders in History and Updates. An existing folder not created by the flow account is quarantined and recreated. 3. If the action is linked to other areas: grant those groups on the item and both folders, then read back. 4. Copy evidence from the transaction row. |
| SetBlockerStatus, ChangeStatus, MarkComplete, CloseAction, ReopenAction, ExtendDeadline, ReassignAction*, EditActionDetails, CorrectOriginalDeadline, ChangeRegisterStatus, UpdateRegisterEntry, EditNotice, PinNotice, ArchiveNotice, UpdateSetting, UpdateMeeting | 1. Lock and values in one conditional write. *ReassignAction also locks the new owner's People row, and the new owner must already have access. |
| ModerateCalendarEvent | 1. Lock and values. 2. Reduce the author to Read on the item, then read back. |
| AddEvidence, AddNoticeAttachment | 1. Lock. 2. Copy each file from the transaction row as `{key8}-{name}`. An existing file counts as done only if its size matches the recorded size; otherwise it is replaced. 3. After commit (not essential): delete the copies on the transaction row and on the request item. |
| RemoveEvidence (administrators) | 1. Lock. 2. Copy the file to the transaction row. 3. Delete it from the action. |
| LinkCompetency | 1. Lock and values. 2. Grant the new area's group on the item, History `A{id}` and Updates `A{id}`, then read back. |
| UnlinkCompetency | 1. Lock. 2. **Revoke** the removed group from the item and both `A{id}` folders, then read back. 3. Values. |
| ChangePrimaryCompetency (management, administrators) | 1. Lock. 2. Revoke the old primary group, unless it stays linked, then read back. 3. Values. 4. Grant the new primary group, then read back. The item stays in its original folder; its item permissions, not the folder, reflect its current areas, and the Competency column is authoritative. |
| HideComment | 1. Lock the parent record. 2. Narrow the Updates item to Owners, Management, Administrators and the author, then read back. 3. Set `IsHidden`. |
| RaiseRegisterEntry | 1. Create the entry with `F\|{key}` and the lock. 2. Copy evidence. |
| ScheduleMeeting | Validation: the chair is a meeting administrator of the area or in management. 1. Create the meeting with `F\|{key}` and the lock. 2. Create the folders `MTG-{id}` and `Record`, give `Record` its open-meeting permissions (E.4), then read back. 3. Attendee rows (`RowKey`). |
| StartMeeting | 1. Lock. 2. Values: In Progress; `CutoffTime` = the event time; `CutoffUpdatesId` = the highest Updates item ID at that moment; `IntervalStart`. 3. Agenda rows in `MTG-{id}/`, by the rules in F.7.3, using `$batch` or a loop (P-14). |
| FinaliseMeeting | Read-only pre-check (F.7.4). 1. Lock, and set Status *Finalising*. 2. Reset `Record` to inherited Read, then read back. 3. Validate again, now that rows cannot change. If this fails, roll back automatically: restore `Record`, set Status back to In Progress, release, mark the transaction *Rolled Back*, and return the list to the chair. 4. §9 rows (actions whose source is this meeting). 5. Values: Finalised, FinalisedAt, FinalisedBy. |
| CancelMeeting | 1. Lock. 2. Reset `Record`, then read back. 3. Values. |
| AmendMeeting | 1. Lock. 2. Amendment row in `MTG-{id}/` (`RowKey`). 3. Values: AmendmentCount. |
| AddPerson | 1. Create the People row with `F\|{key}`, the role and the lock. 2. Request folder and its permissions, then read back. 3. All Users, and Management if the role requires it, then read back. |
| ChangeRole | Guard: the People row. 1. Lock. 2. If leaving management: remove from Management, then read back. 3. Values. 4. If joining management: add to Management, then read back. |
| ReactivatePerson | 1. Lock. 2. Values (Active). 3. All Users, and Contribute on the request folder, then read back. Memberships are re-added separately. |
| SetMembership (add or reactivate), SetMeetingAdministrator (grant) | Guard: the person's People row; rejected if the person has Left. 1. Lock and values. 2. Add to the group, or grant on open `Record` folders, then read back and set `AccessVerifiedOn`. |
| RemoveMembership, SetMeetingAdministrator (withdraw) | Pre-check for outstanding work. Guard: the People row. 1. Lock. 2. **Remove** from the group or `Record` folders, then read back. 3. Values. |
| PersonLeft | Pre-check for outstanding work. Guards: the People row; and, if the person is an administrator, `AdministratorGuard` with the last-administrator check. 1. Lock. 2. For each active membership: remove access, then mark the row Removed (each recorded in `StepsDone`). 3. Remove from All Users, Management and Administrators, and set the request folder to Read, then read back. 4. Values: Left, and administrator flag No. |
| SetAdministrator | Guard: `AdministratorGuard` and the last-administrator check. **Withdraw:** 1. Lock. 2. Remove from Administrators, then read back. 3. Values. **Grant:** 1. Lock and values. 2. Add to Administrators, then read back. |
| AddCompetency | 1. Create the row with `F\|{key}` and the lock. 2. Group. 3. `{Key}` folders and permissions in every partitioned list, then read back. |
| UpdateCompetency | 1. Lock and values. |
| ArchiveCompetency | 1. Lock. 2. Remove the members group from every `{Key}` folder and open `Record` folder, and reduce Management to Read on `{Key}` in Updates, Noticeboard and Calendar Events, then read back. 3. Values (Archived). |
| ReactivateCompetency | 1. Lock. 2. Values (Active). 3. Restore the grants, then read back. |
| RepairAccess (administrators) | For each drift item in the chosen access-check report: restore or remove the grant as the expected model requires, then read back. Items that now have a lock or an unfinished transaction are skipped and reported. |
| RetryTransaction, RollBackTransaction (administrators) | These target a transaction row, not a record, so the record's lock does not block them (F.1.5). |
| ResendNotification (administrators) | Sets an Abandoned outbox row back to Queued, with Attempts 0. |
| Heartbeat (System) | 1. Set `LastHeartbeatCompleted` on its Settings row. |

**Uncommitted creates.** A record created in step 1 of a create request carries
its own key as the lock until commit. Every view, count, reminder and agenda
excludes such records, and *Incomplete changes* lists them.

#### F.1.4 Locks and concurrency

- **Lock column.** `PendingRequestKey` is set and cleared only by flows, using
  conditional writes.
  - On Noticeboard and Calendar Events, users can type into it on their own
    items. There, a lock counts only if a transaction with that key is Planned,
    Applying or Failed for that record.
  - Any other value is cleared by the flow and recorded as a History event.
- **Locked targets.** A queued request for a locked record is rejected
  immediately. The UI prevents this by disabling controls, and the server
  enforces it.
- **Guard rows** serialise rules that span records (F.1.1 #3). Examples:
  - the last administrator;
  - a person leaving while a membership is being added;
  - a membership being removed while an action is reassigned to that person.
- **No time-based expiry.** If a lock is older than 30 minutes, Queue Monitor
  alerts administrators (NOT-11). The request is then resumed or rolled back.
- **Direct writes** to Updates and to meeting `Record` folders are not affected
  by record locks. Finalisation locks `Record` through permissions.
- **Trigger concurrency** for Request Queue is off, but runs can still overlap.
  Correctness comes from the claim, leases, locks, revisions and ETags.

#### F.1.5 Recovery and rollback

| Situation | Detection | Action |
|---|---|---|
| Missed trigger | Queue Monitor finds a Submitted request older than 10 minutes with no transaction row | Touches the item, which fires the trigger again |
| Upload never finished | Uploading for more than 30 minutes | The request is set to *Upload incomplete* and never claimed. The user can submit again. |
| Run stopped part-way | A transaction in Received, Planned or Applying, or Failed past `NextAttemptAfter`, whose lease has expired | Sets the request item back to Submitted, which fires the trigger. Because a transaction exists, only its stored copy is used (F.1.2 step 3). |
| Step keeps failing | 3 attempts used | Transaction set to *Needs attention*; administrators alerted; listed under *Incomplete changes* (administrators can read the `Transactions` folder) |
| Administrator chooses **Retry** | — | A RetryTransaction request resets Attempts and resumes. Audited. |
| Administrator chooses **Roll back** | — | A RollBackTransaction request undoes the completed steps in reverse order (see below). |

**Rolling back.** The steps are undone in reverse order:

- **Values** are restored from the plan's previous values. This happens only if
  `Revision` equals the planned value + 1; otherwise the change is passed to
  manual resolution.
- **Permissions:** grants are revoked and revocations restored.
- **Copied files** are removed.
- **A created record is not deleted.** It is put in a terminal state instead,
  and its folders and history are kept:
  - an action is Closed with outcome *Withdrawn*;
  - a register entry is Closed *Withdrawn*;
  - a meeting is Cancelled;
  - a person is marked Left;
  - a competency is Archived.

The transaction then becomes *Rolled Back* and the lock is released. A *Rolled
Back* event row is written, and the request is mirrored as *Failed – rolled back
by {name}*.
| Heartbeat stale | No `LastHeartbeatCompleted` for more than 26 h | The page shows a banner to management and administrators. Queue Monitor alerts administrators by email, if it is still running. Power Automate's own failure emails go to the flow owners. |

#### F.1.6 Health signals

- **Daily Tasks** submits a heartbeat request every day.
- The welcome page and System Administration calculate staleness themselves from
  Settings timestamps. Detection therefore does not rely on the flows that might
  have stopped.

### F.2 Action lifecycle [Brief statuses; Rec rules]

```
            ┌──────────── ChangeStatus / ClearBlocker ───────────┐
            ▼                                                     │
  Raise → Open ⇄ In Progress ⇄ Awaiting Input (blocker recorded) ─┘
            │          │              │
            └──── MarkComplete ───────┘
                       │
        RequiresCloseOut = No ──────────────► Closed (outcome Completed)
        RequiresCloseOut = Yes ─► Completed ─► CloseAction ─► Closed
                                      │
                                      └─ ReopenAction (reason) ─► In Progress
  Any open status ── CloseAction (outcome, note; action managers) ──► Closed
  Closed ── ReopenAction (reason; action managers) ──► In Progress
```

- `IsOpen` is No only when the action is Closed.
- `DueDay` changes together with `CurrentDueDate`.
- *Record blocker* posts the Blocker note instantly to Updates **and** submits
  the status change to Awaiting Input.

### F.3 Extensions

1. **Browser check.** The action is open; the new date is after the current
   deadline and not before today (D.0.1 arithmetic); the reason is 10–1,000
   characters.
2. **Request.** `ExtendDeadline` carries `ExpectedRevision` and the expected
   `DueDay`.
3. **Server check.** The requester must be the owner or an action manager
   (on behalf of the owner). The request is validated again.
4. **Plan.** The transaction plan records:
   - extension number n = `ExtensionCount` + 1;
   - original deadline;
   - previous deadline (the current one);
   - new deadline;
   - `WasOverdue` and `DaysOverdue`, worked out with the day-difference
     function;
   - reason and actor.
5. **Apply.** One conditional write with the lock sets `CurrentDueDate`,
   `DueDay`, `ExtensionCount`, `LastExtendedOn` and `Revision`.
6. **Commit.** This places NOT-06 in the outbox for the owner, and for the raiser
   if the setting is on.
7. **Send.** If 7 days or fewer remain before the new deadline, and the notice is
   confirmed **sent**, Send Notification claims the owner's R7 key for the new
   deadline as *Skipped (covered by extension notice)* (F.4.1).

### F.4 Reminders and notifications

#### F.4.1 Daily Tasks (Recurrence at 06:00, "GMT Standard Time", concurrency 1)

1. **Dates.** Work out `todayIso`, `plus7Iso = addDays(todayIso, 7)` and
   `plus7Day = int(formatDateTime(plus7Iso, 'yyyyMMdd'))`. All arithmetic uses
   the D.0.1 rules.
2. **Candidates.** One indexed query: `IsOpen eq 1 and DueDay le {plus7Day}`,
   selecting only the needed columns and paginated.
   - Completed actions and uncommitted creates are filtered out.
   - For each remaining action, calculate
     `daysRemaining = daysBetween(todayIso, dueIso)`, where `dueIso` is
     converted from `DueDay` as in D.0.1.
   - Existing ledger keys for the candidates are fetched in one indexed query
     (on the ledger's `DueDay`), not one call per action.

   Then:

   | Notice | When |
   |---|---|
   | NOT-01 | 1 ≤ `daysRemaining` ≤ 7 |
   | NOT-02 | `daysRemaining` = 0 |
   | NOT-03 | `daysRemaining` < 0 **and** either (−`daysRemaining` − 1) mod interval = 0, **or** the current overdue key n has no Sent or Skipped ledger row (the catch-up) |

   Place a Queued outbox row for each of these, then send them.
3. **Suppression** works by a ledger key that has already been claimed. When
   Send Notification **successfully sends** a notice that carries a deadline
   (assignment, reassignment or extension), it also claims:
   - the `R7` key as *Skipped*, if 1–7 days remain;
   - the `DUE` key as *Skipped*, if 0 days remain.

   A failed assignment notice does not suppress the reminder.
4. **Temporary access.** Submit `RemoveMembership` requests in the `System`
   folder for memberships whose expiry date has passed. If outstanding work
   blocks one, alert administrators (`ALR` key, once a day).
5. **Management summary.** If no `SUM|{mondayIso}` key exists and today is on or
   after the configured summary day, send NOT-10.
6. **Calendar digest** (NOT-12) for entries created since the last run.
7. **Weekly access check** (report only, E.5.2) if `LastAccessCheck` is 7 or more
   days old.
8. **Data export reminder.** Remind administrators to create the monthly export
   if none exists for the current month.
9. **Purge**, as set out in D.6:
   - Completed, Rejected and Upload incomplete requests older than the
     retention period;
   - Notification Log rows older than 24 months;
   - exports older than 12 months.
10. **Heartbeat request** in the `System` folder, then `LastDailyRun`.

A missed day is caught up automatically. The conditions are ranges, and the
ledger prevents duplicates.

#### F.4.2 Send Notification: outbox ledger with safe retries (child flow)

There is **one ledger row per logical notification**, for its whole life.

- Rows are created *Queued*, with everything needed to build the message
  (RenderData). This happens as part of the commit (F.1.2 step 9), or in Daily
  Tasks.
- A retry updates the **same row**, so the unique key prevents duplicates
  without blocking retries.

| State | Meaning | Next |
|---|---|---|
| Queued | Waiting to be sent | Claimed, then Sending. Queue Monitor sends any Queued row older than 10 minutes. |
| Sending | Claimed by a run that holds its lease (`RunId`, `LeaseUntil`) | Sent, Failed or Unknown |
| Sent | The connector confirmed the send | Final |
| Failed | The connector returned a **definite** rejection (a 4xx response such as 400, 403 or 429), so the email was not sent | Retried after `NextAttemptAfter` |
| Unknown | Anything uncertain: a timeout, a 5xx or gateway error, or a lease that expired while Sending | **Reconciled** before any further attempt |
| Skipped | Not needed: the action is closed, the recipient has left, or another notice covered it | Final |
| Abandoned | 3 attempts have failed or stayed unknown | Administrators are alerted. They can **Resend** (audited). |

**Sending rules:**

1. **Claim** the row with `IF-MATCH`: set Sending, `RunId`, `LeaseUntil` (10
   minutes ahead) and `SendingSince`, and add 1 to Attempts. A Sending row whose
   lease has expired is first moved to *Unknown*; it is never claimed straight
   from Sending.
2. **Re-check** the record: the action's state and owner, and that the recipient
   is Active. If the notice no longer applies, set Skipped.
3. **Renew the lease** with `IF-MATCH` immediately before sending. If this fails,
   another run has the row, so stop.
4. **Send**, with the action's retry policy set to **None** so that the
   connector never resends on its own. Record Sent, Failed (a definite
   rejection) or Unknown (anything else).
5. **Retry** a Failed row 15 minutes after the first attempt and 60 minutes after
   the second, so there are 3 attempts in all.

**Reconciling Unknown rows** (P-12). The flow searches the sender's Sent Items
for the row's token. The token has no separators and ends in a random suffix
(for example `ESGN000012K7Q2`), so the search cannot split it or match a
different token with the same prefix. A match is accepted only if the message:

- contains exactly that token;
- is addressed to the recipient;
- was sent at or after `SendingSince`.

If a match is found, the row is Sent. If not, the row is claimed and sent again.

**If Sent Items cannot be searched** (probe P-12 fails), Unknown is treated as
Failed and retried. The email then says "If you have already received this
message, please ignore it." This trades a rare duplicate for never losing a
reminder.

### F.5 Discussion flags (instant, event-based)

Members write flag events to Updates, in the folder of the source's area:

| Event | Written by | Counted when |
|---|---|---|
| Flagged | Any member of the area | The item is in the source's area folder (`{Key}/` for notices and register entries) and its parent exists there |
| Flag Withdrawn | The flag's raiser, the source's author, a meeting administrator of the area, or management | The same folder rule applies, and the author is one of those people. Other withdrawals are ignored and listed for administrators. |

**Discussion is not a user-written event.** A flag is cleared only by a
**finalised** meeting of the source's area that has an outcome row for that
source with the outcome *Discussed*. No member can mark an item as discussed by
writing to Updates, because:

- outcome rows become read-only at finalisation;
- finalisation counts only rows in that meeting's own `Record` folder (F.7.4).

**Ordering uses server-assigned item IDs, not times.** A flag counts as raised
before a meeting's cutoff when its item ID is no greater than the meeting's
`CutoffUpdatesId`. Item IDs cannot be forged, unlike Created. Events whose
Created time is in the future are ignored.

**Current state of a source.** A source is *Awaiting discussion* when its latest
counted *Flagged* event:

- has no later counted *Flag Withdrawn* event; and
- is not covered by a finalised meeting's *Discussed* outcome (flag ID no
  greater than that meeting's `CutoffUpdatesId`).

A source flagged again after a meeting's cutoff stays *Awaiting discussion*.
Hidden items never count.

The browser preview and the server snapshot apply the same rule; the server
snapshot is authoritative **[Rec]**.

### F.6 Register lifecycle

`Open → Under Review → Resolved → Closed`

- Any status can move to Closed, with an outcome.
- Resolved can return to Open, with a reason.
- Every change has a transaction row and a History event.
- A degradation counts as unresolved while it is Open or Under Review.

### F.7 Monthly meetings

#### F.7.1 Lifecycle

| From | To | Request | Notes |
|---|---|---|---|
| — | Scheduled | ScheduleMeeting | `Record` becomes editable straight away, so attendance and new business can be prepared |
| Scheduled | In Progress | StartMeeting | **Optimistic**: the page switches to meeting mode immediately (F.7.2) |
| In Progress | Finalised | FinaliseMeeting | F.7.4 |
| Scheduled or In Progress | Cancelled | CancelMeeting | Reason required |
| Finalised | Finalised (amended) | AmendMeeting | Reason required |

#### F.7.2 Live meeting without waiting [Rec]

1. **Start.** The chair clicks **Start meeting**. The browser submits
   `StartMeeting` and immediately shows the live agenda, labelled "Fixing the
   agenda…". Outcomes, notes, attendance, new business and decisions save
   instantly to `Record`. Outcome rows are keyed by **source**.
2. **Snapshot.** The flow fixes the cutoff (the event time, F.1.2 step 4) and
   `CutoffUpdatesId`, then writes the agenda rows by the rules in F.7.3.
   - Agenda membership depends only on the cutoff, so a delayed or resumed run
     produces the same agenda.
   - The page swaps to the frozen values when they arrive.
   - Outcomes already recorded stay attached through their source key.
3. **Mismatches.** An outcome recorded against an item that did not make it into
   the snapshot (for example, an action closed seconds before the cutoff) is
   listed when the chair clicks Finalise. The chair can choose *Record as new
   business* (an instant write) or *Discard*, which sets the outcome to
   *Discarded*; nothing is deleted. The server re-checks.
4. **Changes to actions** made from the meeting are queued requests carrying the
   `MeetingId`, which the server validates at claim. They appear as pending on
   the row.
   - The flows keep the meeting's `PendingChanges` count. It goes up at claim
     and down at commit, Void or roll back. Queue Monitor recalculates it hourly
     from the transaction rows.
   - **Finalise** is disabled while the count is above zero. The server makes
     the same check against the transaction rows (F.7.4).

#### F.7.3 Agenda rules (the same for preview and snapshot; the snapshot is authoritative)

- **Interval.** For a meeting, the "closed since" window runs from the previous
  **finalised** meeting's cutoff (or the area's Tracking Start for the first
  meeting) to this meeting's cutoff.
- **Exclusion.** Items already recorded as *Closed* in the previous minutes are
  excluded.
- **Cancelled meetings** are ignored.
- **Fixed by the cutoff.**
  - An action counts as **open at the cutoff** if it was raised at or before the
    cutoff, and is either open now or was closed after the cutoff.
  - An action counts as **closed in the interval** if it was closed after the
    interval start and at or before the cutoff.
  - The field values in the snapshot are those read when the agenda rows are
    written, normally within minutes of the start.

| § | Section | Rule (area C; "in C" = primary competency, or linked to C) |
|---|---|---|
| 1 | Open actions | Open at the cutoff and in C. Marked *Raised since last meeting* (raised after the interval start) or *Still open*. Includes the latest progress (from Updates) and the previous outcome. |
| 2 | Actions closed since last meeting | Closed in C within the interval, regardless of when they were raised |
| 3 | Carried forward | Sources still *Awaiting discussion* that were on the previous finalised agenda, plus New Business rows deferred at that meeting |
| 4 | Noticeboard | Notices awaiting discussion that are not in §3 |
| 5 | New improvements and degradations | Raised after the interval start, plus register entries awaiting discussion that are not in §3 |
| 6 | Unresolved degradations | Open or Under Review, not already in §5 |
| 7 | Upcoming important dates | Important calendar entries between today and `addDays(today, AgendaLookaheadDays)` |
| 8 | New business | `Record` rows |
| 9 | Decisions and additional actions | Decision rows, and actions whose source is this meeting. Fixed at finalisation as `S` rows, so later changes to those actions do not alter the minutes. |

Each item appears in only one section. The test T-MTG-03 checks that the preview
matches the snapshot.

#### F.7.4 Finalisation (transaction steps in F.1.3)

**Which rows count.** Only rows that meet all three conditions:

- they are in the folder `{Key}/MTG-{M}/Record`;
- their `RecordKey` starts with `{M}|`;
- their MeetingId is M.

Anything else that mentions the meeting, such as a row in another folder or with
another prefix, is ignored and reported to the chair and to administrators.

1. **Read-only pre-check**, before anything changes:
   - no transaction for this meeting is Received, Planned, Applying or Failed,
     apart from this request's own. A transaction in *Needs attention* is listed
     to the chair, who may finalise with a note, rather than blocking;
   - every flagged and new-business item has an outcome, or is marked *Not
     reached*;
   - every outcome row's source is on this meeting's agenda;
   - there is at most one outcome row per source. Duplicates are returned to the
     chair to resolve.

   A failure here rejects the request with the list. Nothing has changed yet, so
   this is a normal rejection.
2. **Lock** the meeting and set *Finalising*.
3. **Reset `Record`** to inherited Read and read it back. From now on no row can
   change.
4. **Validate again.** If anything changed between the pre-check and the reset,
   the flow rolls back automatically:
   - it restores the `Record` permissions;
   - it sets the meeting back to In Progress and releases the lock;
   - it marks the transaction *Rolled Back*;
   - it returns the list to the chair.
5. **§9 rows**, then the **values**, then **commit**. The commit places the
   minutes notification for attendees and apologies in the outbox.

The discussion state of flagged items follows from the finalised outcome rows
(F.5); finalisation writes nothing to Updates.

**Minutes** open in a print window. They show: the area, date and chair;
attendance; each section with its outcomes; decisions; new actions; the next
meeting date; "Finalised by …"; and any amendments.

### F.8 Permission changes

All permission changes are queued (F.1.3). Each one is read back, follows the
narrow-access-first ordering, and is audited. The matrix shows each person's
verification time.

### F.9 Flow inventory (13 reduced to 9) [Rec]

All flows live in one unmanaged solution, **ESG Competency Hub**, with publisher
prefix `esg`. The flow GUIDs are fixed. It uses only standard connectors:
SharePoint and Office 365 Outlook.

Environment variables (the names avoid the 1-to-1's variables):

- `esg_CompetencyHubSiteUrl`
- `esg_CompetencyHubPageUrl`
- `esg_CompetencyHubSender`
- `esg_CompetencyHubAdminEmail`
- `esg_CompetencyHubRequestsList`, used by the Request Queue trigger (G.3)
- `esg_CompetencyHubIsTest`, which enables the test hooks in H.3. It is false
  in production.

| # | Flow | Trigger | Replaces in revision 2 |
|---|---|---|---|
| 0 | Setup | Manual (owners only) | Setup, now also doing bootstrap and the initial import |
| 1 | Daily Tasks | Recurrence 06:00, GMT Standard Time | Daily Tasks, Weekly Access Check, Calendar Notifications, Monthly Export |
| 2 | Request Queue (claim, transaction engine, commit) | Requests created or modified with Status = Submitted (concurrency off); re-fired by Queue Monitor to resume | Request Queue and Apply Request (merged) |
| 3 | Action Requests | Child | — |
| 4 | Record Requests (register, notices, calendar and comment moderation) | Child | Collaboration Requests |
| 5 | Meeting Requests | Child | — |
| 6 | Administration Requests (shares the provisioning steps with Setup) | Child | — |
| 7 | Send Notification | Child | — |
| 8 | Queue Monitor | Recurrence every 15 minutes. Outside 07:00–19:00 on weekdays it runs only the cheap checks, except on the first run of each hour. | Request Sweep, plus outbox sending, retries, reconciliation, lock alerts and the meetings' pending counts |

Every child flow uses connections embedded through connection references
(run-only setting: "use this connection"), and every child responds on both its
success and failure paths.

**Power Platform request budget** [Assumption; measured in Phase 0 (P-02) and in
the pilot]:

| Source | Requests per day |
|---|---|
| Request processing: 15–50 queued requests (fewer than before, because routine updates are now direct writes) × about 40–60 actions each | about 600–3,000 |
| Daily Tasks, with bulk ledger lookups and outbox rows | about 300–600 |
| Queue Monitor: 96 runs. An idle run uses about 6 actions (three filtered queries and their conditions); runs with work use more. | about 600–1,200 |
| Meeting days: start and finalisation | about 400 per meeting |
| **Total** | **about 1,500–5,200 per day** |

The upper end approaches the 6,000 a day that a Microsoft 365 licence allows.
Under D-03 options B and C, that allowance is shared with the 1-to-1's flows.
Mitigations:

- option A gives the Competency Hub its own allowance;
- requests are rate-limited per person (F.1.2 step 1);
- if measured use is too high, a Power Automate Process licence can be added for
  the flows.

Going over the limit slows flows down rather than making them fail, and the
leases and resumption tolerate the delay.

---

## G. Technical architecture

### G.1 Overview

```
 Browser (Edge/Chrome; laptops and tablets)
   └─ /sites/ESGCompetencyHub/SitePages/Hub.aspx (home; Welcome in a full-width section)
        └─ Welcome by Accelerator 365 → layout "ESG Competency Hub"
             competency-hub.html + competency-hub.js (window.ESGCompetencyHub)
             ├─ reads: same-origin REST through Welcome's spHttpClient (as the user)
             ├─ instant writes: Updates, Noticeboard (add), own Calendar entries, meeting Record
             ├─ queued writes: own Requests folder
             └─ search: SharePoint Search REST → IDs → REST re-read
 SharePoint site: 14 lists + Records Export; 13 groups; competency folders; per-person request folders
 Power Automate: solution "ESG Competency Hub" — 9 flows, standard connectors, flow account (D-03)
 Exchange Online: notifications from the sender chosen in D-03
```

### G.2 Frontend [Rec, on the [You] platform]

**G.2.1 Layout file.** This follows the proven 1-to-1 structure:

```html
<template id="metadata" data-name="ESG Competency Hub" data-description="ESG Competency Hub">
  <template id="layout">
    <style> /* every selector prefixed ".SCOPE .ch" */ </style>
    <div class="ch" data-ch-root><p>Loading the ESG Competency Hub…</p></div>
    <script src="competency-hub.js" data-layout data-exports="ESGCompetencyHub"></script>
  </template>
</template>
```

**G.2.2 Script.** `window.ESGCompetencyHub = function (ctx) { … return { onInitialize, onError, onDispose }; }`.
It contains these modules:

| Module | Responsibility |
|---|---|
| `core/dom.js` | `h()` is the only element factory, and it sets text with `textContent` |
| `core/sp.js` | The proven helpers, adapted: `req`, `spGetPaged`, `spRender`, `digest`, `spCreate` (folder path, `HasException` checks), `spMerge` (ETag; a 412 means stale), `writeDates` (verified), 429/503 retry |
| `core/dates.js` | The D.0.1 functions, unit-tested against the matrix |
| `core/requests.js` | Submit to own folder; client key; find by key; polling; confirm on target; unsent queue |
| `core/direct.js` | Instant writes, using a client key and recovery after an ambiguous failure |
| `core/store.js` | In-memory cache, invalidated by completions |
| `core/router.js` | Query-parameter deep links; optional `pushState` |
| `domain/*` | Status, rules (rule IDs shared with the flows), agenda, flag state, reminders, counts |
| `ui/*`, `views/*` | Components and pages |

**Build.** `tools/build.js` (Node, no bundler) concatenates the modules into the
factory, inlines the CSS into the layout and stamps `VERSION`. `--check` fails
if `dist/` is stale.

**Quality.** JSDoc types checked with `tsc --checkJs` (a development tool only),
ESLint, and a banned-terms scan.

**G.2.3 Code rules** (release blockers; they extend the 1-to-1's S1–S7):

| Rule | Requirement |
|---|---|
| S1 | Text is set only with `textContent`. No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`. |
| S2 | No Handlebars expressions in the layout |
| S3 | Links are built only from numbers or validated keys. Only `https:` user links are allowed. |
| S4 | No `eval`, `new Function`, string timers or inline handlers. `JSON.parse` is always inside `try`. |
| S5 | Same-origin `/_api` calls only, through `spHttpClient`. No external resources. |
| S6 | Writes go only to: the user's own Requests folder; Updates; Noticeboard (create only); Calendar Events; meeting `Record` folders; Records Export (administrators' exports). Each write type has a field allow-list. |
| S7 | Only Owners can change the page and the layouts library |
| S8 | No permission, sharing, group or `ensureuser` calls from the browser |

**G.2.4 Mock and tests** (the proven harness pattern):

- `mock-sharepoint.js`: a fake Welcome context and an in-memory `_api`. It
  emulates permissions, add-only and edit-own lists, ETags, unique keys,
  `HasException`, locks and the effects of flows.
- Playwright tests (Chromium): static rules, isolation,
  payloads, journeys, the date matrix, the XSS sweep, layouts at 1440, 1366, 1024
  and 768 px, and axe.

### G.3 Provisioning and deployment (bootstrap order resolved)

**Build.** Flows are built in the Power Automate designer inside the solution,
exported, and unpacked with `pac solution unpack`, so the source is under
version control.

- This replaces revision 2's plan to generate flows from code and run a
  simulator, which reduces effort.
- **Static checks** (`tools/check-solution.mjs`):
  - SharePoint triggers have concurrency off;
  - every flow has a Try/Catch;
  - writes use `IF-MATCH`;
  - every query is paginated;
  - email values are escaped;
  - secure inputs are used;
  - nothing is hard-coded;
  - no premium connectors;
  - the test hooks are switched off in the production deployment settings.
- **Behaviour** is verified by the integration suite on the test site (H.4).
- **Schema.** `schema.json` is embedded in Setup at build time as a generated
  Compose action, so Setup reads no external file. Setup makes SharePoint REST
  calls for each list, column, index and setting, idempotently.

**Deployment order:**

1. **Site.** IT creates the site (C-01). The flow account is Owner and Site
   Collection Administrator. Regional settings are UK/London. Sharing is limited
   to owners, access requests are off, and lockdown is confirmed off (C-03).
   Welcome is confirmed as available on the site (C-11).
2. **Solution.** Import the solution with the flow account's connections and
   **all flows turned off**, and set the environment variables. The Requests
   list variable is set in step 5.
3. **Page.** Create `Hub.aspx`, add Welcome (following its data-source prompt,
   which creates the layouts library and the Errors list), and publish.
4. **Turn on and run Setup** in *Install* mode, with the initial administrators
   and the seed CSV. It:
   - creates the lists, levels, groups and folders;
   - **bootstraps the administrators**;
   - imports the seed;
   - grants All Users read on `Hub.aspx`, the layouts library and the Errors
     list (it finds them by name, and reports anything missing);
   - emails a summary.

   If the page or library was created after Setup ran, run Setup again; it is
   idempotent.
5. **Point the trigger.** Set `esg_CompetencyHubRequestsList` to the Requests
   list that Setup created; Setup reports its ID. P-10 confirms that the
   SharePoint trigger accepts the environment variable. If it does not, the
   trigger is re-pointed in the designer before it is turned on.
6. **Upload** `competency-hub.html` and `competency-hub.js`. Choose Replace, check
   them in and approve them if required.
7. **Configure the web part.** Put it in a full-width section, set the layout to
   *ESG Competency Hub*, turn off News, Slides, Background, Search, Greeting,
   Weather and Time, then **Republish** and set the page as the home page.
8. **Turn on the other flows** in this order: 7, 3–6, 2, 8, then 1.
9. **Smoke test** with an administrator and two test accounts (`DEPLOYMENT.md`).

**Updates to the app:**

- Frontend: Replace the files, use **Reset layout cache**, Republish, and check
  the version shown.
- Solution: Upgrade import; run Setup again if the schema changed.
- Rollback: restore from the library's version history, or re-import the
  previous solution zip.
- Schema changes are additive only.

**Test environment** [Rec, D-06]:

- Preferred: a **separate Power Platform environment** (for example a developer
  environment) with the test site.
- Fallback: the 1-to-1 approach. The production environment and site are
  rehearsed with test accounts before go-live, and test data is then cleared
  with an audited reset.

### G.4 Repository layout [Rec, D-12]

The ESG folder convention, on the designated development branch:

```
competency-hub/
  README.md
  docs/IMPLEMENTATION_PLAN.md          this package, once approved
  01-sharepoint/lists.md, lists.csv    generated from schema.json
  02-frontend/  layout/ src/ styles/ dist/ mock/ test/ tools/ README.md (security notes for IT review)
  03-flows/     EMAIL_TEMPLATES.md, FLOW_NOTES.md (step catalogue per flow)
  04-solution/  schema/schema.json, src/ (pac unpack), tools/check-solution.mjs, ESGCompetencyHub_<v>_unmanaged.zip
  tests/integration/                   scenario runner against the test site
  data/seed-template.csv               column headers only; real UPNs are never committed
```

### G.5 Dependencies

| Dependency | Status |
|---|---|
| Welcome by Accelerator 365 | Installed in the tenant **[You]**. Its availability and licence for the new site are to be confirmed (C-11). |
| Power Platform environment that supports solutions | Used by the 1-to-1 (evidence). DLP to be confirmed (C-02). |
| Flow account, sender mailbox, co-owners | D-03 |
| Development tools | Node.js, Playwright and Chromium, TypeScript (checkJs), ESLint, axe-core, pinned `pac` CLI |
| Test accounts | Two technician accounts, plus an engineer if possible |

### G.6 Flow and notification identity — options (decision D-03, open)

| Criterion | **A. Dedicated service account + shared mailbox** | **B. Your account + shared mailbox** | **C. Your account + your mailbox** (the 1-to-1 pattern) |
|---|---|---|---|
| Continuity if people change role | Strong: no tie to any person | Weak: flows, connections and the Site Collection Administrator role must be handed over | Weak |
| Power Platform request allowance | Its own, so not shared with the 1-to-1 | Shared with your 1-to-1 flows | Shared |
| Sender seen by users | "ESG Competency Hub" | "ESG Competency Hub" | You; replies come to you |
| Audit clarity | Flow writes show the service account | Flow writes show you | Same as B |
| Needs from IT | Account, licence (with Power Automate standard rights), Conditional Access/MFA arrangement for connections, and a shared mailbox (Send As and Full Access, keeping copies of sent items) | A shared mailbox (Send As and Full Access, keeping copies of sent items) | None (proven) |
| Recurring cost | One user licence (shared mailboxes are normally unlicensed) | None | None |
| Risk if the password changes or MFA re-prompts | Connections must be re-authenticated by an owner; monitored by the heartbeat | Same | Same |

- **Recommendation: A.** It is the most reliable, if your Microsoft 365 policy
  permits service accounts (C-12).
- **If service accounts are not permitted: B.**
- **C is acceptable only for a pilot.**

In every option:

- two named co-owners are on the flows. Under D-04 this is a privileged role, so
  they must be Site Collection Administrators, preferably using separate
  administration accounts;
- the flow account is Site Collection Administrator;
- the handover procedure is documented and rehearsed in Phase 6.

Revision 2 recorded C as "decided". That was wrong. This decision needs your
approval.

---

## H. Development roadmap

All effort figures are estimates in developer-days [Assumption]. They assume one
developer experienced with SharePoint REST, JavaScript and Power Automate. They
exclude IT lead times, user acceptance testing and the pilot's elapsed time, and
will be re-estimated after Phase 0 and Phase 1.

### H.1 Phase 0 — Discovery and probes (3–5 days, plus IT lead time)

| Probe | What it checks |
|---|---|
| P-01 | Welcome on the new site: the layouts library and Errors list are created, the wrapper runs, and All Users needs only the minimal grants |
| P-02 | Trigger latency for 50 requests (p50 and p95) and how long processing takes |
| P-03 | Folder isolation, RecursiveAll indexed queries, 404 on forbidden items, search trimming |
| P-04 | Request folders: no adding at the root or in someone else's folder; attachments in own folder; no delete; no renaming the folder |
| P-05 | Forging Created By, Created, Modified or Modified By through `validateUpdateListItem` or `AddValidateUpdateItemUsingPath` when creating items on Requests, Updates, Noticeboard, Calendar Events and meeting `Record` folders |
| P-06 | With owners-only sharing: users cannot share, grant access or create lists |
| P-07 | Date round trips (REST, connector, learned format) across GMT and BST, including a user whose personal regional settings differ |
| P-08 | Tablets: the responsive layout in a full-width section at 1024 and 768 px on the actual devices |
| P-09 | Whether `pushState` with query parameters is safe on the page |
| P-10 | Solution import with flows turned off; child flows, including calls longer than 2 minutes; connection references; environment variables, including a list variable in the SharePoint trigger; DLP |
| P-11 | `ResetRoleInheritance` and `breakroleinheritance` from a flow, with read-back |
| P-12 | Outlook "Get emails (V3)" can search the sender's Sent Items for a token, from a flow. For a shared mailbox, this needs Full Access and sent copies kept in that mailbox. Also checks that `ESGN…` tokens match exactly. |
| P-13 | The **add-only** level: users can create items in a folder through REST (`AddValidateUpdateItemUsingPath`) but cannot edit or delete them. Also checks whether they can create folders. |
| P-14 | `$batch` through "Send an HTTP request to SharePoint" for writing agenda rows. If it does not work, a loop with concurrency 10 is the fallback. |
| P-15 | A script size of about 600–900 KB: Welcome loads it promptly, and *Reset layout cache* picks it up |

**Deliverables:** a probe report, a decision log, and a revised estimate.

**Gate:** before Phase 1, the probe outcomes decide which fallbacks in I.3 are
adopted:

| Probe | Fallback |
|---|---|
| P-02 | F-B |
| P-05 | F-ID |
| P-08 | F-T |
| P-13 | F-ADD |

### H.2 Phases

| Phase | Scope | Acceptance (summary) |
|---|---|---|
| **1 Foundation** | Scaffold; frontend core (adapting the 1-to-1 helpers); components; mock and harness; `schema.json` and Setup (with bootstrap and import); Request Queue with the transaction framework; Queue Monitor; Administration child flow; Send Notification ledger; People & Access screens; Incomplete changes; Welcome shell; deploy to test | The seed import reproduces the E.1 matrix with no access drift. Bootstrap works, and the guard holds. Isolation tests (T-PERM) pass. Interrupting a run after each step and resuming gives the correct final state (T-TXN). Notification retry and the Unknown state behave correctly (T-NOT-R). |
| **2 Action tracking** | Raise Action, the action panel, Updates (instant), My Actions, the Action Requests child flow (all types, extensions, cross-competency permissions, evidence), reminders in Daily Tasks, email templates, welcome tiles | T-ACT, T-EXT, T-NOT and the **full date matrix** pass, both in unit tests and in a flow run against time-shifted data in the test environment |
| **3 Collaboration** | Noticeboard (instant posts) and comments; flags (event model); register; calendar (month and agenda views, series, .ics, My Calendar, digest); Overview and History tabs; Record Requests child flow; search | T-COL, T-FLAG and T-SRC pass. Every count equals its drill-down. |
| **4 Meetings** | Meeting home, scheduling, preview, live meeting mode (instant), optimistic start, snapshot, finalisation, amendments, cancellation, print; Meeting Requests child flow | T-MTG passes, including a three-meeting scenario, a mismatch during an optimistic start, and finalisation blocked by pending changes |
| **5 Dashboard** | Key figures, summary table, records view, CSV, attention lists, weekly summary | T-DSH passes |
| **6 Hardening and release** | Full regression; security re-probes; volume test; performance; accessibility; usability; `CONFIG_REFERENCE` (operations, recovery, handover); restore and handover drills; deployment rehearsal; pilot with 2 areas; go-live | No open High findings. Drills complete. Pilot signed off. Request usage measured. |

### H.3 Test hooks and phase gates

**Test hooks.** These work only when `esg_CompetencyHubIsTest` is true. The
production deployment settings set it to false, and the static check verifies
this.

| Hook | Effect |
|---|---|
| `TestToday` | Replaces *today* in the browser and in flows, so every D.0.1 row can run as a real flow |
| `TestFailAfterStep` | Makes the transaction engine stop after a named step of a named request type (T-TXN-01) |
| `TestFailSend` | Makes Send Notification fail before sending, fail after sending, or time out (T-NOT-R) |

**Phase gates.** A phase is complete when:

- its tests pass on the mock and on the test site;
- no High finding is open;
- the Phase 0 fallback decisions it depends on have been applied.

### H.4 Test plan

Each phase writes full scripts from these lists and records the results in
`TEST_REPORT_<v>.md`. Every test runs on the mock harness where it can, and also
on the test site.

**Permissions**

| ID | Test |
|---|---|
| T-PERM-01–06 | Isolation through the UI, REST and search; writes to controlled lists refused; no reading other people's request folders or the Administration history; no sharing, inheritance breaking, list creation or layout upload |
| T-PERM-07–09 | Access is granted and revoked on membership change. History survives removal. Linking and unlinking work, and an unlink revokes access **before** the record changes. |
| T-PERM-10–13 | Unauthorised requests are rejected and audited. The tripwire fires (forged Created By, item outside the requester's own folder). A meeting outcome for another meeting's source is blocked. The Welcome Errors list grant is in place. |
| T-PERM-14 | Add-only lists: an update cannot be edited or deleted by its author or anyone else |
| T-PERM-15 | The History folders `Transactions` and `Administration`, and the Notification Log, are readable only as E.4 states |

**Transactions**

| ID | Test |
|---|---|
| T-TXN-01 | For each step-catalogue type, kill the run after each step, then resume. The final state is correct, the transaction is Applied exactly once, and every event and outbox row exists exactly once. |
| T-TXN-02 | A request to a locked record is rejected, and the UI disables the controls |
| T-TXN-03 | Rollback restores values, permissions and files, and audits the rollback |
| T-TXN-04 | Success is never shown while a lock remains or the transaction is not Applied |
| T-TXN-05 | A Created By time outside the tolerance is replaced by the processing time |
| T-TXN-06 | Editing a request after claim (resetting status or attempts, or changing the key, payload or attachments) changes nothing, and nothing is applied twice |
| T-TXN-07 | Queue Monitor recovers a missed trigger, an unfinished upload and a run that stopped part-way |
| T-TXN-08 | When two runs start for one request, the lease lets only one proceed |
| T-TXN-09 | A resume after the requester has left, or after the revision has moved on, completes rather than being rejected |
| T-TXN-10 | When two requests race for one record, the loser is Rejected with the ACT-11 message, not left as *Needs attention* |
| T-TXN-11 | Guard rows: concurrent withdrawal of the last two administrators leaves one; PersonLeft racing SetMembership leaves no access |
| T-TXN-12 | Uncommitted creates are invisible to every view, count, reminder and agenda. Rolling back a create leaves a terminal state, not a deletion. |
| T-TXN-13 | A lock typed by a user on a notice or calendar entry is cleared and audited. A quarantined key conflict fires the tripwire, and the step then completes. |

**Bootstrap**

| ID | Test |
|---|---|
| T-BOOT-01 | Fresh install creates the administrator, their folder and groups, and audits it |
| T-BOOT-02 | Re-running Setup never changes administrators |
| T-BOOT-03 | Recover mode works only when no active administrator exists |
| T-BOOT-04 | The last administrator cannot be removed through the app |
| T-BOOT-05 | Importing again does not duplicate anything, and rows that do not resolve are reported |
| T-BOOT-06 | A bootstrap that stopped after creating the People row, or before read-back, is completed by Repair. The administrator flag is set only after verification. |
| T-BOOT-07 | Recover works, with a reason, when the only administrator's account is disabled, and emails every owner and co-owner |

**Actions and extensions**

| ID | Test |
|---|---|
| T-ACT-01 | Raise with only the five required fields. The reference is assigned, Original and Current deadlines are equal, Status is Open, Revision is 1, and the assignment notice is queued. |
| T-ACT-02 | Each of these is rejected, with the field named, in the browser and on the server: a past date, a date beyond `MaxDeadlineYears`, an owner without access, a title over 255 characters |
| T-ACT-03 | An owner's update appears immediately; a retry with the same client key creates no duplicate |
| T-ACT-04 | Status transitions follow F.2. An invalid transition is rejected by the server, even when submitted directly. |
| T-ACT-05 | Record a blocker: the note is instant, and the status becomes Awaiting Input after processing. Clearing the blocker works. |
| T-ACT-06 | Mark complete closes the action when no close-out check is required. When one is required, the action goes to Completed and the raiser is notified. |
| T-ACT-07 | Close with an outcome, reopen with a reason, and reassign with a reason (the new owner must have access). Each writes a History event and sends its notices. |
| T-ACT-08 | An action manager can edit details. A non-manager's edit is rejected and audited. |
| T-ACT-09 | A stale revision is rejected with the ACT-11 message. A request to a locked record is rejected, and the UI disables the controls. |
| T-ACT-10 | Cross-competency linking is possible only for members of the target area. The action is then visible and counted in both areas. Unlinking revokes access before changing the values. |
| T-ACT-11 | ChangePrimaryCompetency revokes, writes the values, then grants. Area tabs and counts follow the change. |
| T-ACT-12 | Evidence is copied from the claimed copy, so swapping a request attachment has no effect. Removal by an administrator is audited. |
| T-ACT-13 | My Actions tabs, filters and search return exactly the right records for an owner who belongs to several areas |
| T-ACT-14 | An uncommitted create stays out of tiles, lists, reminders and agendas until it is committed |
| T-ACT-15 | The deep link `?action=` opens the panel. A user without access sees "not available" instead of the record. |
| T-EXT-01 | The owner extends with a reason. The History row holds every EXT-04 field, and Current deadline and DueDay change together. |
| T-EXT-02 | Rejected: a reason outside the length limits; a new date that is not after the current deadline, or is before today (the UK date of the event time) |
| T-EXT-03 | A Completed or Closed action cannot be extended |
| T-EXT-04 | An action manager extends on the owner's behalf: IsOnBehalf is set and the owner is notified |
| T-EXT-05 | An extension while overdue records WasOverdue and DaysOverdue correctly across a month end and a clock change |
| T-EXT-06 | A stale expected deadline is rejected |
| T-EXT-07 | Display: the original deadline struck through, the latest deadline, and "Show all extensions (n)" listing every row in order |
| T-EXT-08 | Reminders follow the new deadline. No R7 for the old DueDay is sent after the extension. |
| T-EXT-09 | An administrator corrects the original deadline: a separate History row is written and the extension rows are unchanged |
| T-EXT-10 | Management filters work: extension count, extended while overdue, past original deadline |
| T-EXT-11 | An extension created at 23:55 and processed after midnight is validated against the date of the event |

**Dates**

| ID | Test |
|---|---|
| T-DATE-01 | Every row of the D.0.1 matrix, in JavaScript unit tests and as flow expressions in the test environment |
| T-DATE-02 | Day differences across month ends, year ends, leap years and both clock changes |
| T-DATE-03 | The calculated range bound `DueDay` is never an invalid date; property test over 2026–2030 |
| T-DATE-04 | The management summary key uses the Monday date across a year end (week of 28 Dec 2026 to 3 Jan 2027) |
| T-DATE-05 | Date-only values stored on either side of a clock change are read as the correct UK date, in the browser and in flows |
| T-DATE-06 | A run at 00:30 UK time uses the UK date; DueDay and CurrentDueDate always agree |

**Notifications**

| ID | Test |
|---|---|
| T-NOT-01 | The 7-day reminder is sent once, at the first run with 1–7 days remaining, for every D.0.1 row |
| T-NOT-02 | Due today; overdue on day 1 and at every interval; catch-up after missed runs |
| T-NOT-03 | Suppression: an assignment or extension notice sent within 7 days claims R7 or DUE as Skipped; a failed notice does not |
| T-NOT-04 | Assigned and reassigned-away notices are sent, but never to the person who made the change |
| T-NOT-05 | Ready for close-out, closed, extension (owner and raiser keys are distinct) and minutes notices |
| T-NOT-06 | The weekly summary is sent once a week across a year end (Monday key) |
| T-NOT-07 | The calendar digest is sent once a day per person |
| T-NOT-08 | Administrator alerts are sent once per subject per day |
| T-NOT-09 | Nothing is sent to a person marked Left. Reminders re-check the action's state before sending. |
| T-NOT-10 | Content: every value is HTML-escaped (tested with attack strings), the link opens the record, and the footer shows the token |
| T-NOT-11 | Outbox: when a run is killed after commit, Queue Monitor sends the queued rows |
| T-NOT-R1 | A connector failure gives Failed, then a retry at the correct back-off, then Sent, all on one row |
| T-NOT-R2 | A run killed after sending gives Unknown; reconciliation finds the reference and marks it Sent with no duplicate |
| T-NOT-R3 | A run killed before sending gives Unknown; not found, so it is retried and Sent |
| T-NOT-R4 | Three failures give Abandoned and an administrator alert; Resend is audited |
| T-NOT-R5 | A failed assignment notice does not suppress the 7-day reminder |
| T-NOT-R6 | A timeout or 5xx error from the connector gives Unknown, not Failed, and the connector never retries on its own |
| T-NOT-R7 | The token search does not match a different token with the same prefix |

**Flags**

| ID | Test |
|---|---|
| T-FLAG-01 | Flags and withdrawals are instant |
| T-FLAG-02 | A withdrawal by an unauthorised user is ignored by both the preview and the snapshot |
| T-FLAG-03 | A flag raised after the cutoff survives *Discussed* |
| T-FLAG-04 | The discussion history lists every meeting |
| T-FLAG-05 | Ignored: a flag written in another area's folder, a flag pointing at another area's record, and any attempt to write a discussion event |
| T-FLAG-06 | Ignored: a flag event with a future Created time. Ordering follows item IDs. |

**Meetings**

| ID | Test |
|---|---|
| T-MTG-01 | Schedule: the date, chair and attendees are pre-filled; the chair must be a meeting administrator or in management; the `Record` folder has the permissions in E.4; the meeting appears on the calendar |
| T-MTG-02 | The preview shows the nine sections, with each item in exactly one section |
| T-MTG-03 | The preview equals the snapshot for the same cutoff, in membership and order |
| T-MTG-04 | The snapshot is the same when StartMeeting is resumed later (cutoff and `CutoffUpdatesId`) |
| T-MTG-05 | Open-action rows show every MTG-04 field and the right marker |
| T-MTG-06 | *Closed since last meeting* uses the previous finalised cutoff. The first meeting uses Tracking Start. Cancelled meetings are ignored. |
| T-MTG-07 | Deferred and not-reached items are carried forward to the next meeting |
| T-MTG-08 | Attendance, outcomes, notes, new business and decisions save instantly. A concurrent edit gives the 412 message. |
| T-MTG-09 | Action changes made from the meeting are queued and shown as pending, and the PendingChanges count is correct |
| T-MTG-10 | Finalise resets `Record` to read-only. Outcomes in other folders or for other meetings are ignored and reported. The chair resolves duplicates. |
| T-MTG-11 | A finalised meeting is not altered by later changes to its actions (§9 is fixed) |
| T-MTG-12 | Finalising clears only flags whose ID is no greater than `CutoffUpdatesId` |
| T-MTG-13 | An amendment is appended, audited and sent to attendees; the original text is kept |
| T-MTG-14 | Cancelling needs a reason, and `Record` is reset |
| T-MTG-15 | Printed minutes show every MTG-07 element, and the skipped-month message appears when it applies |
| T-MTG-16 | Live recording before the snapshot exists, followed by the snapshot arriving |
| T-MTG-17 | A mismatched outcome is resolved at Finalise |
| T-MTG-18 | Finalise is blocked while changes from the meeting are pending |
| T-MTG-19 | A validation failure after the reset is rolled back: `Record` is re-granted and the meeting returns to In Progress |

**Collaboration**

| ID | Test |
|---|---|
| T-COL-01 | A notice is posted instantly; an author-set *Important* is capped at 30 days; later edits are queued |
| T-COL-02 | A meeting administrator can pin, archive and hide comments; authors can archive their own posts; anyone else is rejected |
| T-COL-03 | Register entries can be raised, commented on and flagged. Only the permitted roles can change the status, and an outcome is required for Resolved and Closed. |
| T-COL-04 | A register entry lists its linked actions. Unresolved degradations appear on the Overview, the welcome page, the dashboard and the agenda. |
| T-COL-05 | Calendar month and agenda views work. Users add, edit and cancel their own entries instantly. Moderation of others' entries is queued and leaves the author with Read. |
| T-COL-06 | Series of up to 24 occurrences; "this and future" retries any occurrences it could not update |
| T-COL-07 | My Calendar combines all areas and overlays deadlines; the .ics file opens in Outlook |
| T-COL-08 | Overview counts equal their drill-downs. The History tab lists closed, resolved, archived and finalised records. |
| T-COL-09 | An archived area is hidden from members, read-only to management and administrators, and closed to new records. Reactivation restores it. |

**Search**

| ID | Test |
|---|---|
| T-SRC-01 | Module search works, and typing a reference opens the record |
| T-SRC-02 | Global search returns only permitted records. Stale index entries are re-read and dropped. |
| T-SRC-03 | Technical lists never appear in results |

**Administration**

| ID | Test |
|---|---|
| T-ADM-01 | Add a person, change their role (the management group follows), reactivate a person |
| T-ADM-02 | Matrix: staged changes, pending state, verified time |
| T-ADM-03 | Temporary access expires. If outstanding work blocks removal, administrators are alerted and the matrix shows *Expired – outstanding work*. |
| T-ADM-04 | Removing a membership is blocked by outstanding work. The leaver wizard works, access is actually revoked, and history is kept. |
| T-ADM-05 | Competencies: add (folders, group, permissions), rename, archive, reactivate |
| T-ADM-06 | *View permissions* matches the group membership read back by the flow |
| T-ADM-07 | Incomplete changes: retry; roll back, including a create (which ends in a terminal state); resend |
| T-ADM-08 | Management sees People & Access read-only, and their change requests are rejected |
| T-ADM-09 | The access check reports drift without changing anything. Repair applies the fixes and skips in-flight changes. |
| T-ADM-10 | Settings changes take effect. An export is created and uploaded. |

**Dashboard**

| ID | Test |
|---|---|
| T-DSH-01 | Key figures are correct; a cross-competency action counts once in totals and once per area |
| T-DSH-02 | Every figure and filter drills down to exactly the records it counts |
| T-DSH-03 | The CSV export equals the drill-down, with values protected against formula injection |
| T-DSH-04 | My Actions, Actions I Raised and Actions Requiring Attention |
| T-DSH-05 | The weekly summary matches the dashboard |

**User interface**

| ID | Test |
|---|---|
| T-UI-01 | The greeting uses the time of day and the user's first name; no names are hard-coded |
| T-UI-02 | The contrast test passes for every token pair |
| T-UI-03 | Journeys work by keyboard alone, with the focus trap, skip link and live regions |
| T-UI-04 | axe finds no serious violations on any view |
| T-UI-05 | Layouts at 1440, 1366, 1024 and 768 px, with no horizontal scrolling |
| T-UI-06 | Text remains usable at 200% |
| T-UI-07 | Status is never shown by colour alone |
| T-UI-08 | Pending, rejected, failed and slow states appear as described in C.6 |
| T-UI-09 | The unsent queue survives a page reload |
| T-UI-10 | The unsaved-changes prompt appears before leaving a view |
| T-UI-11 | XSS sweep: attack strings in every user field render as inert text |
| T-UI-12 | The health banner shows when the heartbeat is stale |

**Security (from the second review)**

| ID | Test |
|---|---|
| T-SEC-01 | User-typed lock, key and parent fields on direct writes are never trusted (findings 3–5) |
| T-SEC-02 | Pre-created `A{id}` folders and squatted keys are quarantined |
| T-SEC-03 | Forged Author, Created and Modified on direct writes are handled as the outcome of P-05 and F-ID requires |
| T-SEC-04 | The per-person request rate limit applies |
| T-SEC-05 | Users cannot write to the `System` folder, and system request types are rejected from personal folders |

### H.5 Effort: bottom-up estimate and justification [Assumption]

| Component | Days | Notes |
|---|---|---|
| Phase 0 probes and confirmations | 3–5 | Welcome feasibility is already proven |
| Tooling, build, lint, checkJs, banned-terms | 1–2 | |
| Frontend core (dom, sp, dates, requests, direct, router, store) | 3–4 | Adapts the proven 1-to-1 helpers |
| Components, tokens and CSS | 4–6 | Reuses the 1-to-1 visual family |
| Welcome page and application shell | 2–3 | Missing from the earlier draft |
| Mock SharePoint and test harness | 2–3 | Follows the proven harness structure |
| Schema and Setup (including bootstrap and import) | 4–5 | |
| Request Queue transaction engine (claim copy, leases, guard rows, quarantine) and Queue Monitor | 6–8 | One parent flow instead of two; a generic step engine |
| Rollback inverses; Retry, Roll back, Resend and Repair requests | 2–3 | Missing from the earlier draft |
| Administration child flow | 3–4 | |
| Send Notification outbox and ledger | 2–3 | |
| Email templates (12 notification types, escaped) | 1–2 | Missing from the earlier draft |
| Administration screens (people, matrix, competencies, settings, incomplete changes, history viewer, export) | 4–6 | Matrix and people combined on one screen |
| Actions UI (forms, panel, My Actions, area tab) | 7–9 | |
| Action Requests child flow and reminders | 7–9 | |
| Daily Tasks housekeeping (expiry, digest, access check, purge, heartbeat) | 2–3 | Missing from the earlier draft |
| Noticeboard, comments and flags (UI) | 3–4 | Instant writes need no flow logic |
| Record Requests child flow (notice edits, attachments, pins, archiving, calendar moderation, hiding comments) | 3–4 | Missing from the earlier draft |
| Register (UI and flow) | 3–4 | |
| Calendar (month and agenda views, series, .ics, My Calendar, digest) | 4–6 | Meetings are read directly, not copied |
| Overview and History tabs, search | 3–4 | |
| Meetings UI (home, schedule, live mode, finalise, amend, print) | 7–9 | |
| Meeting Requests child flow | 4–6 | Discussion comes from outcomes, so finalisation writes no flag events |
| Management dashboard | 4–6 | |
| Integration suite on the test site, with fault-injection hooks | 5–7 | Replaces the offline flow simulator |
| Hardening (security, volume, performance, accessibility) | 5–7 | |
| Documentation (deployment, operations, configuration reference) | 3–4 | |
| **Total** | **97–136** | Revision 2: 97–139 |

**How this compares.** The total is essentially that of revision 2. The
simplifications save about as much as the robustness work costs.

- **Simplifications:** one list and four flows fewer; exports created in the
  browser; discussion derived from outcomes; meetings read directly on
  calendars; integration tests instead of a flow simulator.
- **Robustness work required by the reviews:** private request copies, leases,
  guard rows, quarantine, the outbox, archive revocation, extra request types
  and fault-injection hooks.

The earlier draft's total of 88–124 was wrong: its rows summed to 84–118, and
six components were missing.

**Why it is still large.** The brief requires ten modules, about 25 screens,
audited administration, resumable server-side transactions, a meeting system
with snapshots, and a management dashboard. None of these may be removed.

**Option to deliver value sooner** (sequencing only; nothing is removed):

- After Phases 1–2, about 55–75 days in, the action tracking, extensions,
  reminders and administration can be piloted.
- Meetings and the dashboard follow.

A second developer would shorten the elapsed time, but not the total effort.

---

## I. Risk and decision register

### I.1 Risks

| ID | Risk | L / I | Mitigation |
|---|---|---|---|
| R-01 | Scope and effort overrun: the brief is large and the estimate is not yet validated | M / H | Bottom-up estimate redone after Phase 0 and Phase 1; pilot after Phase 2; any deferral offered only with your approval |
| R-02 | Latency for queued changes | M / M | Instant writes for routine and live-meeting work; optimistic UI; measured by P-02; F-B fallback |
| R-03 | Dependence on the flow account (password changes, MFA, departure) | M / H | D-03 option A; co-owners; documented and rehearsed handover; heartbeat banner |
| R-04 | DLP blocks the SharePoint HTTP action together with Outlook | L / H | P-10; the 1-to-1 already uses the same connectors |
| R-05 | Request limits (shared under options B and C) | M / M | Fewer queued operations; lean flows; measurement; a Process licence if needed |
| R-06 | Date errors | M / H | D.0.1 rules; never doing arithmetic on `DueDay`; date test matrix |
| R-07 | Created By, Created or Modified forgeable on direct writes | U / M | P-05; flag ordering by item ID; F-ID fallback |
| R-08 | Partial failure of a multi-step change | M / H | Transaction model F.1: private copies, leases, locks and guard rows, ordered idempotent steps, narrow access first, point of no return, rollback |
| R-09 | Too many unique permission scopes | L / M | Folder-based design; weekly count |
| R-10 | Lists over 100,000 items cannot get new competency folders | L / L | Monitor list sizes |
| R-11 | A Welcome update changes how scripts run | L / H | Data and flows unaffected; version check; smoke test after Welcome updates |
| R-12 | Script injection with Site Collection Administrator rights | L / H | S1–S8; XSS sweep; IT code review available (C-07) |
| R-13 | Maintainability of plain JavaScript at this size | M / M | Modules, checkJs, lint, tests, configuration reference |
| R-14 | Rule drift between the browser and the flows | M / M | Shared rule IDs; the server is authoritative; integration tests |
| R-15 | Flows turned off by repeated failures | L / H | Heartbeat banner; owner alerts |
| R-16 | Seed identity errors | M / M | Import by UPN only; review |
| R-17 | Users tampering with their own requests | H / L | Requests are untrusted input and copied at claim; identity by item ID; tripwire; rate limit |
| R-18 | Tablets inside Welcome | M / M | P-08; F-T |
| R-19 | Mismatch between the optimistic meeting start and the snapshot | M / L | Resolution at Finalise (F.7.2) |
| R-20 | A lock is left in place by a failure | L / M | Queue Monitor alert; Retry or Roll back |
| R-21 | Uncertain email delivery | L / L | Unknown state; Sent Items reconciliation; fallback wording |
| R-22 | Bootstrap misuse | L / M | Only owners and co-owners (D-04) can run Setup; guard; Recover only when no usable administrator exists, with a reason and an email to all owners; audited |
| R-23 | Users typing parent, key, lock or folder values into direct-write items | M / M | Folder-path and server-ID rules; quarantine; flow-only folders for anything that is trusted (D.0, F.5, F.7.4) |
| R-24 | Power Platform request use close to the daily limit | M / M | Measured in P-02 and the pilot; per-person rate limit; D-03 option A; Process licence if needed |

### I.2 Organisational confirmations (Phase 0)

| ID | Confirmation |
|---|---|
| C-01 | IT creates the new site, with the flow account as Site Collection Administrator |
| C-02 | The environment for the flows, and DLP (SharePoint including the HTTP action, Office 365 Outlook) |
| C-03 | Limited-access lockdown is off on the site |
| C-04 | Sign-in names for the 25 engineers and technicians (management addresses supplied 21 Oct 2026); the spelling of "Harrisson" |
| C-05 | **Resolved 21 Oct 2026:** Robert Starbuck is Group Head; Joe Pepper, Mark Wellstead and Nathan Tilly are Team Leaders |
| C-06 | The initial system administrators (with their roles) and the flow co-owners, who hold a privileged role (D-04) |
| C-07 | IT code-review requirements for custom JavaScript |
| C-08 | Delegation of meeting administration to technicians |
| C-09 | Retention, and Purview labels |
| C-10 | Devices and browsers; meeting patterns; go-live date |
| C-11 | Welcome is available, and licensed, on the new site |
| C-13 | No area holds information that must be hidden from other ESG staff (E.0). If any does, it needs a separate restricted location. |
| C-12 | Service accounts are permitted (licence, Conditional Access/MFA for connections), and a shared mailbox is available with Send As and Full Access for the flow account, keeping copies of sent items (D-03) |

### I.3 Prepared fallbacks

| ID | Fallback |
|---|---|
| F-B | If queued latency is unacceptable even after instant writes, make more operations instant where SharePoint permissions can enforce them, and consider D-14 (premium HTTP trigger, with IT approval) |
| F-ID | If P-05 shows that Created By, Created or Modified can be forged when an item is created:<br>(a) notices, and comments and flags on notices and register entries, move to per-person folders `{Key}/u{id}` (about 180 scopes), so attribution comes from the folder;<br>(b) action updates, which live in `A{id}`, and flag withdrawals are submitted through the user's own request folder and published by the flow, so queued latency applies to them;<br>(c) live-meeting rows stay instant, because every writer is an authorised meeting administrator, and the chair confirms them at finalisation.<br>About 4–6 extra days. |
| F-ADD | If P-13 shows that the Add level cannot create items in a folder through REST:<br>(1) try `Lists.asmx UpdateListItems` with the RootFolder parameter, which is same-origin;<br>(2) otherwise, grant Contribute with "edit own" and no delete on Updates and Noticeboard. Then count only flag events still at version 1.0, and label edited comments *edited*.<br>Notice attachments are already queued, so they never need Edit. |
| F-T | If tablets cannot be fully supported inside Welcome: agree a tablet scope (for example, full functionality at 1024 px landscape and core tasks at 768 px) |

### I.4 Decisions

**Stated by you, so not open:**

| Item | Status |
|---|---|
| Welcome frontend with HTML, CSS and JavaScript; SharePoint lists and Power Automate; no SPFx, React or Power Apps | **[You]** |
| A separate project | **[You]** |
| Keep the naming and code standards | **[You]** |

D-01, the frontend platform, does not appear below because you have already
settled it.

**Requiring your approval:**

| ID | Decision | Recommendation |
|---|---|---|
| D-02 | Save model | Instant direct writes for routine updates, comments, flags, notices, own calendar entries and live meetings; queued transactions for everything rule-bound (C.8) |
| D-03 | Flow and notification identity | **Decided [You], 21 Oct 2026: option C** (your own account and mailbox) to begin with; a later switch to a service account is possible (K4.1). |
| D-04 | Flow co-owners | **Decided [You], 21 Oct 2026: none for now** (K4.1). If co-owners are added later: two management users. Co-owners can edit the flows and use the flow account's connections, so this is a privileged role. They must be Site Collection Administrators, preferably using separate administration accounts. |
| D-05 | Site | A new dedicated private communication site (your earlier answer, to be confirmed) |
| D-06 | Test environment | A separate environment; fallback is rehearsal on production with a reset |
| D-07 | Close-out | Completion closes the action unless a close-out check is required (on by default for High priority) |
| D-08 | Overdue reminders | Day 1, then weekly; weekly management summary |
| D-09 | Snapshot point | The fixed cutoff at meeting start, with optimistic live recording |
| D-10 | Amendments | Appended; finalised meetings are never reopened |
| D-11 | Retention | As in D.6 |
| D-12 | Repository | `competency-hub/` on the designated branch |
| D-13 | Server-generated PDF minutes | Deferred; the print window covers it |
| D-14 | Premium HTTP-triggered flow for faster writes | **Not adopted.** It is listed only as the last step of fallback F-B, and only with IT approval and a premium licence. |
| D-15 | Who may post progress updates | Anyone with access to the action. Updates from non-owners are labelled as comments. |
| D-16 | Visual style | The ESG Welcome family (the 1-to-1 palette) |

---

## J. Independent critical review (revision 3)

### J.1 Self-review against the brief's 25 questions

| # | Question | Finding |
|---|---|---|
| 1 | Too complicated? | The transaction model adds rigour where it is required (permissions, evidence and audit). Routine work bypasses it through instant writes. |
| 2 | Unnecessary lists? | 14, each justified in D.7. |
| 3 | Can the UI be simplified? | Routine tasks are instant; there is no waiting during meetings. |
| 4 | Are permissions secure? | Folders and server checks. Access narrows first. The tripwire guards against forged identity. |
| 5 | Can admins manage access without lists? | Yes, with verified read-back and a bootstrap path. |
| 6 | Are extensions auditable? | Yes: append-only History events, written only as part of a complete transaction. |
| 7 | Are reminders reliable? | Corrected date arithmetic, a ledger with safe retries, catch-up after missed runs. |
| 8 | Are agendas correct? | One rule set, with the server snapshot authoritative and preview and snapshot tested against each other. |
| 9 | Are snapshots accurate? | Server-fixed cutoff, a locked record, appended amendments. |
| 10 | Can cross-competency actions leak? | No. Revocation comes first, there are no lookups to restricted records, and search results are re-read. |
| 11 | Are list view thresholds addressed? | Indexed-first queries and a volume test. |
| 12 | Are licensing assumptions valid? | Standard connectors only. The request allowance is analysed by identity option. |
| 13 | Does it depend on unavailable tenant permissions? | Site creation, Welcome on the new site and the service account are listed as confirmations. |
| 14 | Is there duplication? | The copied latest-progress field was removed. Snapshot copies are deliberate. |
| 15 | Concurrent users? | Locks, revisions, ETags and client keys. |
| 16 | Is reuse of ESG systems safe? | Patterns are reused; existing sites and solutions are not touched. |
| 17 | Is the frontend professional? | Tokens, components, WCAG 2.2 AA. |
| 18 | Is naming natural? | Yes. |
| 19 | Is the roadmap efficient? | Value can be piloted early. Bottom-up estimate in H.5. |
| 20 | Are all requirements covered? | B traces to H.4. Nothing was removed. |
| 21 | Is anything built to impress? | No. |
| 22 | Is it maintainable? | One configuration, one schema, a step catalogue and an operations manual. |
| 23 | Is any critical logic frontend-only? | No. Instant writes are enforced by permissions; the agenda is authoritative on the server. |
| 24 | Would standard SharePoint be simpler? | Considered in C.8. |
| 25 | Are facts and assumptions distinguished? | Section 0.4 tags every item. |

### J.2 Second independent review

A separate reviewer, who had not written the plan, read the whole of this
revision adversarially. It checked every date, weekday, membership total and
effort figure by calculation. It reported **40 findings: 10 High, 23 Medium and
7 Low**. Each was accepted and resolved in the body of the plan; none was
dismissed.

| # | Severity | Finding | Resolution | Where |
|---|---|---|---|---|
| 1 | High | The request item stayed editable during processing, allowing double runs, reset attempts, changed keys and swapped files | A private copy is taken at claim into a flow-only transaction row. The request is identified by item ID; the user's item is only a mirror. Leases added. | F.1.1, F.1.2, D.2 #6 |
| 2 | High | A request could be rejected after partial application, and finalisation validated after the reset with no compensation | Point of no return. Resume skips validation and accepts its own lock and the planned revision. Finalise validates before and after the reset and rolls back automatically. | F.1.1 #7, F.1.2, F.1.3, F.7.4 |
| 3 | High | Members could forge *Discussed* events, and flow keys in user-writable lists were predictable | *Discussed* is no longer stored in Updates; it is derived from the outcome rows of finalised meetings. Flows create nothing in Updates. Quarantine rule added. | F.5, D.0, D.2 #9 |
| 4 | High | Users could write lock and key fields on Noticeboard and Calendar Events | A lock counts only with a live transaction. User keys are namespaced. Moderated entries become read-only to their author. Meeting copies in the calendar removed. | F.1.4, D.2, CAL-03, CAL-06 |
| 5 | High | Updates could target another area's records, and folders could be squatted | The folder path decides area and parent. `A{id}` folders not created by the flow are quarantined. Hidden items are excluded. | F.5, D.2 #9, F.1.3 |
| 6 | High | The access check could re-grant access that had just been removed | Report only, with a queued Repair. In-flight changes are skipped. PersonLeft marks rows Removed. Leavers and Limited Access entries are ignored. | E.5.2, F.1.3 |
| 7 | High | An archived area was neither hidden from members nor closed to new records | ArchiveCompetency revokes members' access and write grants. ReactivateCompetency added. | F.1.3, E.4, T-COL-09 |
| 8 | High | Notifications were lost if a run stopped after commit | Outbox rows are written before Applied. Queue Monitor sends Queued rows that are older than 10 minutes. | F.1.2, F.4.2 |
| 9 | High | Uncertain sends were treated as certain | Connector retry policy set to None. Only definite rejections count as Failed; everything else is Unknown and reconciled. A stale Sending row becomes Unknown. | F.4.2 |
| 10 | High | Bootstrap had dead ends | Stable bootstrap key with tracked steps. The administrator flag is set last. Repair completes a partial bootstrap. Recover is allowed when no usable administrator exists, with a reason and an email to all owners. | E.5.1, T-BOOT-06/07 |
| 11 | Medium | The reference search could match the wrong email; the shared-mailbox rights were incomplete | Separator-free random token, matched exactly on token, recipient and time. Full Access and sent-item copies added to C-12 and P-12. | F.4.2, D.2 #14, I.2 |
| 12 | Medium | No lease or fencing | `RunId` and `LeaseUntil`, renewed before every step and before sending | F.1.1 #8, F.4.2 |
| 13 | Medium | Routine conflicts became incidents | A 412 at the lock step with nothing done gives Rejected with the ACT-11 message | F.1.2 step 8 |
| 14 | Medium | Uncommitted creates were visible, and rollback deleted records | Readers exclude uncommitted creates. Rolling back a create sets a terminal state. | D.2, F.1.3, F.1.5 |
| 15 | Medium | Flag ordering relied on times that could be forged | Ordering by server item ID against `CutoffUpdatesId`. Future-dated events ignored. P-05 extended. | F.5, H.1 |
| 16 | Medium | The pending check before finalising could not work | `PendingChanges` count on the meeting. The server checks transaction rows. MeetingId validated at claim. The request's own transaction is excluded. *Needs attention* is listed rather than blocking. | F.7.2, F.7.4 |
| 17 | Medium | It was undefined which rows finalisation counted; keys could be squatted; Discard needed a delete | Only rows in the meeting's own `Record` folder with a matching key and meeting ID count. User rows are not unique and the chair resolves duplicates. *Discarded* outcome added. | D.2 #12, F.7.4 |
| 18 | Medium | Rules spanning several rows could be broken by concurrent changes | Guard-row locks in a fixed order. Last-administrator guard added to PersonLeft. | F.1.1 #3, F.1.3 |
| 19 | Medium | The co-owners' privileges were understated | D-04 states the privilege; co-owners must be Site Collection Administrators, preferably with separate admin accounts | E.2, E.5.1, I.4 |
| 20 | Medium | Request types were missing, and Settings lacked lock columns | Added ChangeRole, ReactivatePerson, RemoveEvidence, Retry, Roll back, Resend, RepairAccess and ReactivateCompetency. Settings now has the lock columns. | F.1.3, D.2 #4 |
| 21 | Medium | Administrators could not see failed requests | Administrators can read the transaction rows | D.2 #6, E.4 |
| 22 | Medium | System requests were always rejected | `System` folder rule with allow-listed types | F.1.2 step 1 |
| 23 | Medium | Recovery of stuck uploads could not work | Marked *Upload incomplete* | F.1.5 |
| 24 | Medium | Validation ran before the event time was fixed, and the cutoff drifted on retries | The event time is fixed first, from `FirstClaimedAt`, and validation uses its UK date | F.1.2 step 4 |
| 25 | Medium | Notification keys collided, and some were missing | Every key ends with the recipient; RDY, CLS and ALR keys added | D.2 #14 |
| 26 | Medium | A retry had nothing to resend | RenderData stored on each row | D.2 #14, F.4.2 |
| 27 | Medium | The date tests missed DST-sensitive reads | `dueIso` expression defined; date-only read rows, a near-midnight run and the `TestToday` clock added | D.0.1, H.3, T-DATE-05/06 |
| 28 | Medium | P-13 had no fallback | F-ADD added; F-ID re-specified for `A{id}` folders | I.3, H.1 |
| 29 | Medium | The tests pointed at revision 2, and there was no fault injection | Test lists written out in full; `TestFailAfterStep` and `TestFailSend` hooks added | H.3, H.4 |
| 30 | Medium | The effort table summed to 84–118 and left out components | Missing lines added; corrected total 97–136 | H.5, A |
| 31 | Medium | The request budget and Queue Monitor schedule were unrealistic | One 15-minute trigger with a cheap idle path; per-person rate limit; budget re-estimated | F.9 |
| 32 | Medium | Rows in B were mislabelled, and J.2 was empty | B rows tagged; J.2 completed | B, J.2 |
| 33 | Medium | Deployment could not run cleanly | Import with flows turned off; list environment variable; schema embedded in Setup | G.3 |
| 34 | Low | The NOT-03 condition was wrongly grouped | Corrected | F.4.1 |
| 35 | Low | E.3 disagreed with ACT-06 and ACT-07 | Aligned: the owner closes only through Mark complete | E.3, ACT-06 |
| 36 | Low | References were missing or undefined | D-01 and D-14 explained; H.3 and R-01 added; readiness conditions aligned | I.4, A, J.5 |
| 37 | Low | ChangePrimaryCompetency ran in the wrong order | Revoke, then values, then grant; folder rule restated | F.1.3, D.2 #5 |
| 38 | Low | Confirmation and release could go wrong | The UI also confirms from the event row; release is conditional on the key | C.6, F.1.2 |
| 39 | Low | Meeting gaps: the chair's rights, Read on `Record`, §9 read live, RaisedActionId writable by users | The chair must be a meeting administrator or in management; `Record` permissions stated; §9 fixed at finalisation; RaisedActionId removed | F.1.3, F.7.3, D.2 #12 |
| 40 | Low | Miscellaneous | Records Export added to S6; purges added; back-offs give 3 attempts; series edits retried per occurrence; bootstrap takes a role and the import updates existing rows; expired access raises alerts | G.2.3, F.4.1, F.4.2, CAL-04, E.5 |

**Checked by the reviewer and found correct:**

- every weekday and offset in the D.0.1 matrix, the BST dates and the UTC run
  times;
- the flow date expressions;
- all E.1 membership counts (79, 73 and 152);
- the counts of lists, flows, groups and folder scopes;
- that Applied followed every essential step in every catalogue row;
- the narrow-access-first order, apart from ChangePrimaryCompetency (now fixed);
- creating `A{id}` folders for every action;
- creating the page before running Setup in the deployment order;
- taking identity from the request folder.

### J.3 Contradictions fixed in this revision

| Revision 2 statement | Problem | Fix |
|---|---|---|
| "`DueDay le {today+7}`" with `today` held as an integer | Invalid date arithmetic | D.0.1 rules and matrix |
| The marker was set to Applied right after the target write, before permissions, evidence and audit | It could report success too early | F.1.1 principle 6 and the step catalogue |
| The UI confirmed success from `LastRequestKey` alone | `LastRequestKey` was set before the remaining steps | Lock plus `LastRequestKey` set at commit |
| Groups were "visible to Group Owner", yet admins "read back" group membership in the browser | Admins cannot read membership | Flow read-back recorded in `AccessVerifiedOn` |
| D-03 shown as "decided" | You had asked for it to be treated as open | Now an open decision with options (G.6) |
| The site was shown as "decided" | It was an answer to a question | Marked [Answered], to be confirmed (D-05) |
| No path to create the first administrator | Deadlock at first use | E.5.1 bootstrap |
| A notification key claimed once blocked retries | Retries were impossible | One ledger row with a state machine (F.4.2) |
| Weekly keys used ISO week numbers | Year-boundary errors | Keys use the Monday date |
| Event time taken from Created | Could be back-dated | Tolerance rule (F.1.2 step 7) |
| The initial import went through about 190 requests | About 7,000 Power Platform requests | Batched import in Setup |
| Monthly CSV export done by a flow | Heavy request use | Export created in the browser by an administrator |
| Flags stored as fields written by queued requests | Flagging was slow | Instant event model (F.5) |

### J.4 Unresolved concerns

- The latency of queued changes (P-02). Routine work no longer depends on it.
- The forgeability of Created By (P-05), with the F-ID fallback ready.
- Tablets inside Welcome (P-08).
- Whether the Add level works through REST (P-13), with F-ADD ready.
- Exchange search behaviour for reconciling uncertain sends (P-12), with the
  resend fallback ready.
- Power Platform request use at peak (P-02 and the pilot).
- The flow identity decision (D-03) and its IT confirmations.
- DSL code was not available for review.

### J.5 Recommendation

Approve D-02 to D-13, D-15 and D-16. D-14 records an option that is not
adopted. Then run Phase 0. Development can begin on the same three conditions as
in section A:

1. P-01 to P-15 have recorded results, and the H.1 gate has decided the
   fallbacks;
2. the decisions above are approved;
3. C-01 to C-03, C-11 and C-12 are confirmed, and the site exists.

---

## K4. Your decisions of 21 Oct 2026, and the first build increment (current task)

### K4.1 Decisions to record in the plan

| Item | Your decision | Effect on the plan |
|---|---|---|
| C-01 site | **You can create the new site yourself.** Welcome is proven in the tenant. | C-01 is resolved. C-11 (Welcome on the new site) is still checked by running the P0 probe there. |
| D-03 flow and notification identity | **Your own account to begin with**, using your own mailbox, so emails come from you. A switch to a service account may follow once everything works. | D-03 = option C **[You]**. G.6 gains a "switching to a service account later" procedure: <br>• transfer flow ownership;<br>• re-create connections;<br>• add the new account as Site Collection Administrator;<br>• change the sender environment variable. <br>Risks R-03 and R-05 stay open: request use is shared with the 1-to-1 flows, and continuity depends on your account. |
| D-04 co-owners | **None for now** | D-04 = none **[You]**. <br>• The Setup *Recover administrator* path depends on you as the only owner. <br>• R-03 is raised to High impact. <br>• The handover drill in Phase 6 is replaced by a written handover note. |
| A-1 non-member rights | **Non-members can post a notice on any area's noticeboard, and nothing else** (for example a request, a need or an improvement idea) | E.0 is amended: <br>• All Users get **Add** on every area's Noticeboard folder; nothing else changes. <br>• Notices from non-members are labelled *"From {name}, {their area}"*. <br>• The area's meeting administrators are notified once a day in the existing digest. <br>• They can flag the notice for the meeting, or archive it, as usual. <br>• Non-members cannot comment on, flag or edit anything else. <br>Test T-PERM-16 is added. |
| C-13 restricted content | **Confirmed: nothing needs hiding from other ESG staff** | C-13 is closed. E.0 stands as written. |
| Management roles (C-05) | **Group Head: Robert Starbuck** (`robert.starbuck@edf-energy.com`). **Team Leaders:** Joe Pepper (`joseph.pepper@edf-energy.com`), Mark Wellstead (`mark.wellstead@edf-energy.com`), Nathan Tilly (`nathan.tilly@edf-energy.com`) | E.1 is updated: **Robert Starbuck is added as person 29**, Group Head, with all areas by role. Email addresses are stored in lower case, because matching ignores case. |

**Still open:**

- **C-04:** the sign-in names of the other 25 staff. If they all follow `firstname.lastname@edf-energy.com`, say so and I will prepare the import file. The spelling of "Harrisson" still needs confirming.
- **C-06:** the initial system administrator. Assumption: **Joe Pepper**, since you will run Setup.
- **D-02 and D-05 to D-16:** still recommendations awaiting your approval. The plan approval covered them in general, but they have not been confirmed one by one.

### K4.2 First build increment: the app shell, built locally against a simulated SharePoint

**Context.** Phase 0 can run as soon as you create the site and run the P0
probe. Meanwhile the frontend can be built and tested locally, because it
doesn't depend on the probe results.

**Scope of this increment**, in `competency-hub/02-frontend/` (G.2/G.4
structure):

1. **Scaffold.**
   - `src/` contains plain modules.
   - `tools/build.js` (Node, no bundler) concatenates them into
     `dist/competency-hub.js` and `dist/competency-hub.html` (the Welcome
     layout), using the proven wrapper from the 1-to-1 and the P0 probe
     (`window.ESGCompetencyHub = function (ctx) { … onInitialize/onError/onDispose }`).
   - `--check` mode detects a stale `dist/`.
2. **Core modules:**

   | Module | Contents |
   |---|---|
   | `core/dom.js` | `h()`, which sets text content only |
   | `core/dates.js` | Every D.0.1 rule: `localDate`, `addDays`, `daysBetween`, the DueDay conversions and the Monday key |
   | `core/sp.js` | Read helpers adapted from the 1-to-1: `req`, paged reads with a same-site next-link guard, and 429/503 retry |
   | `core/config.js` | List and folder names |
3. **Identity and roles** (`domain/access.js`), with these rules:
   - **Fail closed.** A user not found in People, marked Left, or matching more than one People row sees only "Your account isn't set up yet – contact {administrators}". No role is guessed.
   - **Roles** come from `People.Role`: Technician, Engineer, Team Leader or Group Head.
   - **Memberships** come from Competency Members.
   - **`canWrite(area)`** is true for members, Team Leaders and the Group Head.
   - **`canPostNotice(area)`** is true for every active user.
4. **Screens (read-only, plus posting a notice on the mock):**
   - home pages for Technician, Engineer and Team Leader/Group Head, in the chosen full-width tiles layout;
   - area pages with the Actions, Notices & issues, Calendar and Meetings tabs;
   - the view-only bar for non-members;
   - "Post a notice" available in every area.

   The other forms (raise action, extend and so on) appear but are marked
   "Coming in the next increment", so nothing is half-built.
5. **Mock SharePoint** (`mock/`):
   - a fake Welcome context and in-memory `_api` reads;
   - synthetic, clearly labelled seed data for the 29 people (real names and
     roles from E.1, with no real sign-in names) and sample actions;
   - simulated 403, 404 and slow responses.

   A `mock/index.html` page runs the app locally, with a "Sign in as" switch.

**Tests** (`test/`, run with Node and the pre-installed Chromium):

- **Unit tests:**
  - every D.0.1 date-matrix row;
  - access rules for each role, including non-member notice posting and every
    fail-closed case (unknown user, user marked Left, duplicate People rows);
  - static code rules S1–S8 (for example, no `innerHTML` and no writes outside
    the allow-list).
- **Browser tests:** each role's home page and an area page render at 1,920,
  1,366 and 768 px with no script errors; a view-only area shows no write
  buttons; the 403/404 states show plain error messages.

**Not in this increment:**

- Setup and the flows;
- the request queue and all queued writes;
- meetings;
- the management dashboard drill-downs;
- anything in the tenant.

**Deliverable:**

- the built `dist/` files and the test results;
- screenshots for each role;
- a commit to the designated branch;
- a short status note listing what has been tested locally and what is not
  yet proven.

## K3. What happens next

**Context.** The plan (revision 3) is approved. The front-page layout is chosen
(tiles at full width), and so is the access model (everyone reads every area;
members, Team Leaders and the Group Head write). Nothing has been built against
SharePoint yet. The next steps fall into three groups.

### 1. My next step, on approval of this section

1. **Commit and push** to the designated branch:
   - the updated plan, as `competency-hub/docs/IMPLEMENTATION_PLAN.md`;
   - the chosen layout preview.

   Layouts A and B stay in `02-frontend/preview/` for reference.
2. **Build the Phase 0 probe pages** so they are ready for when the site exists.
   These are small Welcome layouts and a short instruction sheet, covering:
   - P-01: Welcome loads and can read the site;
   - P-03, P-04 and P-13: folder permissions, request folders and add-only
     writes;
   - P-07: dates;
   - P-09: back-button behaviour.

   Each probe records its result on screen for you to screenshot. They create
   nothing until you run them on the new site.
3. **Start the Phase 1 frontend locally**, against the mock SharePoint only,
   with no tenant access:
   - the project scaffold, build and tests;
   - the shared helpers adapted from the 1-to-1;
   - the real application shell in the chosen tiles layout, with role-based
     front pages and view-only areas.

   This is low-risk work that Phase 0 results won't change. The backend flows
   wait for Phase 0.

### 2. What I need from you (no rush, but they gate later phases)

| Item | Why it matters |
|---|---|
| **A-1:** may non-members flag or comment in other areas? (Recommendation: no) | Finalises the view-only rules |
| **C-13:** confirm no area holds information that must be hidden from other ESG staff | Confirms that everyone-reads is safe |
| **D-03:** the flow account. A service account with a shared mailbox (recommended), or your account with a shared mailbox | Needed before any flow is built in the tenant |
| **D-04:** two flow co-owners, who must be Site Collection Administrators | Continuity |
| **C-04 / C-05:** user principal names (UPNs) for the 28 people, the spelling of "Harrisson", and who is Team Leader and who is Group Head | For the seed import |

### 3. What needs IT, the tenant, or your explicit permission

These are the Phase 0 gates; each needs your go-ahead before anything is changed:

1. The new site is created, with UK regional settings and owner-only sharing
   (C-01 to C-03).
2. Welcome is confirmed as available and licensed on that site (C-11).
3. The service account and shared mailbox, if D-03 option A is chosen (C-12).
4. DLP allows the SharePoint and Outlook connectors together (C-02).
5. You upload and run the probe pages, then send me the screenshots. I then
   write the probe report, apply the fallbacks and re-estimate.

**Verification for step 1.**

- The build passes, and the unit and browser tests pass on the mock.
- The shell is screenshotted for all three roles at 1,920, 1,366 and 768 px.
- The probe pages render locally with a fake Welcome context.
- Nothing touches SharePoint.

## K2. Chosen layout: C (home tiles) at full width

**Context.** You chose layout C (home tiles). On a wide screen it currently sits
in a narrow centred column: the page width is capped at 1,180 px, and the 10
area tiles fall into rows of 4 + 4 + 2. You want it to use the full width of the
screen.

**Changes** to `layout-c-tiles.html`, made in the build sources
(`shells.css` and `shared.js`) and then regenerated:

1. **Remove the width cap for layout C.** `.layout-c main` gets no maximum
   width, with 32 px side padding (16 px on small screens).
2. **Tiles fill the row evenly.** The grid fits as many columns as there is
   room for (each at least 240 px wide). On a 1,600 px or wider screen this
   gives 10 areas as **2 rows of 5**, and a technician's 6 areas as one row of
   6. It collapses gracefully on smaller screens: 3–4 columns on a laptop, 2 on
   a tablet, 1 on a phone.
3. **Lower section uses the width too.** On wide screens (1,400 px and above)
   the cards below the tiles sit in **3 columns** instead of 2:

   | Role | Column 1 | Column 2 | Column 3 |
   |---|---|---|---|
   | Management | Needs your attention | Your own actions | Coming meetings |
   | Engineer | For you to manage | Your actions | Next meetings and New in your areas |
   | Technician | Your actions | Next meetings | New in your areas |

   Below 1,400 px it falls back to 2 columns, and below 900 px to 1.
4. **Area pages** (after clicking a tile) also go full width. The area pill
   strip stays at the top.
5. Layouts A and B are left as they are, for reference.

**Verification.** Screenshot layout C in headless Chromium at 1,920, 1,366 and
768 px for all three roles. Check that there is no horizontal scrolling, that
management sees 2 rows of 5 at 1,920 px, and that there are no script errors.
Then send you the updated file with the 1,920 px screenshot.

## K1. Three layout options to choose from

**Context.** You want three separate HTML layouts to choose from. The front page
must suit each role:

- **Group Head and Team Leaders**: a good overview of everything, across all
  ten areas.
- **Technicians**: a separate tab for each of their competencies, and a useful
  overview front page.
- **Engineers**: the same, plus what they need as meeting administrators and
  action managers.

All three layouts follow the plain-language rules in C.9: words rather than
symbols, at most three main buttons, and calm spacing. They differ only in
**layout and navigation**.

**Files.** Each is self-contained, with sample data, a "Preview as" switch
(Technician / Engineer / Group Head or Team Leader) and no SharePoint
connection. They are saved in `competency-hub/02-frontend/preview/`:

| File | Layout | How competencies are shown | Character |
|---|---|---|---|
| `layout-a-tabs.html` | **A. Top tabs.** The menu bar, then a row of tabs: **Overview** followed by one tab per competency the person belongs to (management: all ten) | Each tab is a full page for that area | Familiar, like browser tabs; best when people belong to 2–6 areas |
| `layout-b-sidebar.html` | **B. Side menu.** A fixed left column listing *My overview*, then each competency with a small late count beside it; content on the right | Click an area in the side menu | Everything is visible at once; scales to 10 areas; works like Outlook folders |
| `layout-c-tiles.html` | **C. Home tiles.** The front page is a grid of large tiles, one per competency, each showing plain status ("2 late · meeting Wed"). A tile opens that area, with a "Back to overview" link; the selected area also appears as a tab strip | Tiles on the front page, then tabs inside | The most visual and the most touch-friendly; good for tablets |

**What the front page shows, by role (the same content in every layout):**

| Role | Overview content |
|---|---|
| Technician | My actions grouped as *Late*, *Due this week* and *Coming up*; my next meetings; new notices in my areas (the latest 3); buttons **Raise an action** and **Add a notice** |
| Engineer | Everything a technician sees, plus a **"For you to manage"** panel: actions waiting for a close-out check, actions in my areas that are late, items flagged for meetings I run, and my next meeting to prepare, with a **Start meeting** button |
| Group Head / Team Leader | **Group overview:** one summary sentence (e.g. "84 open actions, 9 late, 1 area with no recent meeting"). An **area status table or tiles** for all ten areas (open, late, deadlines moved twice or more, next meeting). A **"Needs your attention"** list: late items, areas without a meeting for over 35 days, unresolved degradations and items flagged for discussion. Their own actions sit below. |

**Each competency tab or page** (all roles) shows the area's one-line summary,
then sub-sections for:

- Actions;
- Notices & issues;
- Calendar;
- Meetings.

Engineers and management see management buttons there, such as *Start meeting*
and *Review close-outs*.

**Verification.**

1. Render each file in headless Chromium for all three
   roles at 1366 px, plus the technician view at 768 px.
2. Check that there are no script errors and no horizontal scrolling.
3. Send you the three HTML files and a contact sheet of screenshots for
   side-by-side comparison.

Nothing is committed unless you ask. Once you have chosen a layout, it replaces
C.3 and C.4 in the plan.

## K0. Next step after this revision: rebuild the preview

1. Replace `competency-hub/02-frontend/preview/competency-hub-preview.html` with
   a calm, simplified clickable preview that follows C.9:
   - Home with the grouped action list;
   - an action card with three buttons;
   - the three-step Raise form;
   - the "I need more time" dialog;
   - an area page with four tabs;
   - a one-item-at-a-time meeting;
   - a simple management view;
   - a person-centred access page.

   It is still sample data only, with no SharePoint connection.
2. Check it in Chromium at 1366 px and 768 px, and capture screenshots for
   review.
3. Send the preview to you. Commit the preview and the updated plan section to
   the designated branch only if you ask.

## K. After approval

1. Create `competency-hub/README.md` and `competency-hub/docs/IMPLEMENTATION_PLAN.md`
   (this package) on the designated development branch, then commit and push. Nothing
   is deployed.
2. Phase 0 produces `docs/PHASE0_PROBE_REPORT.md`.
3. Before each push, run the local checks:
   - `node tools/build.js --check`
   - `node test/run-tests.js`
   - `npx tsc -p jsconfig.json`
   - `npx eslint src`
   - `node 04-solution/tools/check-solution.mjs`

   Record tenant evidence, with the site redacted, in `TEST_REPORT_<v>.md`.

---

## L. Revision 3 change log (response to your review)

| Finding | Change | Sections |
|---|---|---|
| Seven-day reminder arithmetic | All arithmetic is on calendar dates. `DueDay` is used only for comparisons and keys. The test matrix covers month ends, year ends, leap years and both clock changes. | D.0.1, F.4.1, T-DATE |
| Transaction processing and recovery | Plan → lock → ordered idempotent steps → narrow access first → Applied only after every essential step → release → Completed. Resume from `StepsDone`; recovery table; administrator Retry or Roll back; success confirmed on the target. | F.1, C.6, T-TXN |
| Bootstrap | Setup provisions the first administrators (owners only, audited, guarded), with a recover mode and a last-administrator guard. The initial import is batched. | E.5.1, G.3, ADM-09, T-BOOT |
| Notification retries | One ledger row per notification with a state machine. Unknown delivery is resolved through a Sent Items reference search (P-12), with a fallback. Back-off, Abandoned, Resend. Suppression applies only after a successful send. | F.4.2, D.2 #14, T-NOT-R |
| Latency and user experience | Options assessed. Instant permission-enforced writes for routine updates, flags, notices, own calendar entries and **all live-meeting recording**; optimistic meeting start; non-blocking queued changes. | C.8, F.5, F.7.2, MTG-13 |
| Flow and notification identity | Reopened as decision D-03 with options A, B and C. Option A recommended, subject to IT. | G.6, I.4 |
| Simplification | 15 → 14 lists (Action History and Audit Log merged; Updates replaces Comments and removes the flag fields). 13 → 9 flows. The flow simulator replaced by integration tests. Monthly export moved to the browser. Meetings no longer copied into the calendar. Estimate rebuilt bottom-up at 97–136, essentially unchanged from 97–139, because the added robustness offsets the simplifications. | D.7, F.9, H.5 |
| Approved versus recommended | Requirement status register; tags in the decisions table | 0.4, I.4 |
| Contradictions, recovery, security, dependencies | The J.3 table; event-time tolerance; access verification; Welcome availability (C-11); deployment order; finalisation blocked while changes are pending | J.3, G.3 |
| Second independent review | 40 findings (10 High, 23 Medium, 7 Low), each resolved in the body. Main changes: private request copies, a point of no return, leases, guard rows, quarantine, an outbox, folder-path rules for direct writes, discussion derived from outcomes, archive revocation, bootstrap repair, a corrected estimate and fully written test lists. | J.2 |
