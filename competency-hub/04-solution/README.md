# ESG Competency Hub – Power Automate solution

`ESGCompetencyHub_1_4_1_0_unmanaged.zip` is the solution to import into Power Automate. It holds four flows, which all
ship **Off** so nothing runs until you turn them on:

| Flow | What it does |
|---|---|
| **ESG Competency Hub \| 1 Daily tasks** | Every morning at 06:00 UK time: deadline reminders, another try for emails that were not sent, and the end of temporary access to an area |
| **ESG Competency Hub \| 2 Request queue** | Records the changes to actions that people send from the Hub: raise, move a deadline, mark as done, change status, reassign, edit, close and reopen |
| **ESG Competency Hub \| 3 Queue monitor** | Every 15 minutes in working hours and hourly outside them: puts stalled changes back in the queue, retries emails, tells the administrators about anything that needs them, and records whether processing is healthy |
| **ESG Competency Hub \| 6 Administration** | Records administrators' changes: people, their areas, meeting rights and notice posting, settings, and the decisions on changes needing attention |

| Part | Name |
|---|---|
| Connection reference | `esghub_sharedsharepointonline_hub` – ESG Competency Hub SharePoint |
| Connection reference | `esghub_sharedoffice365_hub` – ESG Competency Hub Outlook (emails are sent from this connection's mailbox) |
| Environment variable | `esghub_CompetencyHubSiteUrl` – ESG Competency Hub Site URL (no trailing slash) |
| Publisher | ESG Competency Hub, prefix `esghub` (its own, so nothing clashes with the ESG 1-to-1 solution in the same environment) |

Flows 4 (Records) and 5 (Meetings) come with Releases 3 to 5.

`schema/schema.json` is the single description of the lists. Setup builds the site from it, and the flow tools check
every column a flow uses against it.

## How a change is recorded

Staff never write to the business lists. The app writes a request into the person's own folder of the **Requests**
list (`Requests/u{SiteUserId}`), and a flow records it:

1. **Who.** The requester is the person whose folder the request is in. A request anywhere else, from someone marked
   Left, or with an unusable reference is refused at once.
2. **Claim and private copy.** The request is claimed with its ETag, and copied into a change record in
   `History/Transactions`. From then on the flow works from that copy, so editing the request item changes nothing.
3. **Checks.** The same rules as the app (`02-frontend/src/domain/rules.js`), with the same messages. A kind of change
   the flow does not know is refused before anything is read.
4. **Apply.** The previous values are stored first. The action is changed with its ETag, together with its lock
   (`PendingRequestKey`) and `Revision + 1`; a change someone else made in between means nothing was done, and the
   request is refused with "This action was updated by someone else…".
5. **Commit**, in this order: the History event; the email rows; the lock released with `LastRequestKey` set; the
   change record Applied; the request Completed. The app shows "Saved" only when the request is Completed **and** the
   action carries `LastRequestKey` with no lock.

Administration changes follow the same pattern. Each is decided once – the decision is written on the change record
(`StepsDone` DECIDED), so a run that fails before deciding checks everything again. Group and folder permissions are
read back after every change; access is narrowed before the records say so and widened after.

## When something goes wrong

- **A run fails or stops.** The request shows "Not recorded yet – retrying automatically". The queue monitor puts it
  back in the queue after 10 minutes (15 for a run that stopped part-way); every step checks whether it was already
  done, so the change finishes exactly once.
- **Three attempts fail.** The change goes to the administrators' page *Changes needing attention* and they get an
  alert email (at most one a day for each problem). The page says honestly whether part of it was made:
  - nothing made: **Try again** or **Cancel**;
  - part of an action change made: **Finish** or **Revert** (Revert writes the previous values back only if nobody
    has changed the action since, and emails about the reverted change are not sent);
  - part of a people or settings change made: **Finish** only.
- **A flow stops.** If changes to actions are not picked up, the monitor records processing as Down and the app
  pauses the buttons that send changes (reading and adding updates carry on). If only the Administration flow is
  behind, the administrators are told and staff carry on as normal.
- **Emails.** Each email has one row in the Notification Log, keyed so it is never made twice. A refused send is
  tried again after 15 minutes and then after 6 hours; a send with an unclear outcome is tried again with "If you have
  already received this message, please ignore it". After three attempts the email is abandoned and the administrators
  are told. Daily tasks and the monitor can both reach the same row at 06:00; whichever is second leaves it alone.
- **Temporary access.** Daily tasks ends memberships the day after their end date, after the reminders, so a problem
  with one membership can never stop them. If open actions remain, or the person cannot be taken out of the group,
  the administrators are told instead.

## Emails

| Email | To | When |
|---|---|---|
| Action assigned to you (ASG) | The owner, unless they raised it | When the action is raised or reassigned to them |
| No longer yours (RAW) | The previous owner, unless they made the change | When an action is reassigned |
| Deadline moved (EXT) | The owner, unless they moved it | On each extension |
| Ready for your close-out check (RDY) | The raiser, unless they marked it done | An action needing a close-out check is marked done |
| Action closed (CLS) | The owner, unless they closed it | An action is closed |
| Reminder: due in N days (R7) | The owner | The first morning with `ReminderDaysBefore` days or fewer left |
| Due today (DUE) | The owner | The morning of the deadline |
| N days late (OD) | The owner | Day 1 late, then every `OverdueReminderIntervalDays` |
| Competency Hub needs attention (ALR) | Every active administrator | A change needing attention, an abandoned email, a stopped flow, temporary access that could not be ended |

Every value a person typed is HTML-escaped; the validator refuses an email body that shows one without it.

## Step names in the designer

`flows.py` names its steps briefly, with a short code for the part of the flow each belongs to. When the solution is
built, `designer_names.py` gives every step a plain name instead – for example *Read the request*, *Create the change
record if new*, *Add to Notice Posters if wanted (people)* – and changes every reference to match. The validator checks
both forms, and the 116 flow tests run on the renamed flows, so a missed reference fails the build.

## Tools (`tools/`)

Python 3.9+ only; nothing to install. `sh run_all.sh` runs everything.

| File | Purpose |
|---|---|
| `flows.py` | The four flows, written in Python and generated as Power Automate's JSON |
| `designer_names.py` | The plain step names used in the solution |
| `validate.py` | Static checks: expressions parse, use real functions and stay under Power Automate's 8,192-character limit; every reference exists and is in scope; `runAfter` chains are complete; REST columns exist in `schema.json`; standard connectors only; step names Power Automate accepts; nesting ≤ 8; ≤ 500 actions per flow |
| `wdl.py` | A small interpreter for the workflow language, so the real flow JSON can be run in tests |
| `hub_fake.py` | A simulated Hub site that answers the REST calls the flows make, following SharePoint's rules for ETags, refused fields, required and unique columns, dates, Number columns returned as doubles, folders that do not exist (404) and removals of something that is not there |
| `test_flow.py` | 116 tests of the real flow JSON, including an interruption at every write followed by recovery, races between runs, and one test for each fault found in the review of 23 October 2026 |
| `test_validate.py` | 21 deliberately broken flows and packages that must be rejected |
| `build_solution.py` | Validates, then writes `src/` and the zip in the layout Microsoft's `pac` CLI writes |
| `check_package.py` | Compares the zip, element by element, with the ESG 1-to-1 solution that pac packed and that imported in the tenant |

**Evidence class: LOCAL / OFFLINE-SIMULATED.** Solutions 1.0.0.0 to 1.2.0.0, packed the same way, imported and ran on
the real site. This version adds two flows and many new SharePoint calls (groups, folder permissions, `ensureuser`);
those are proven only by importing it and testing it there (HOW-TO in the download package).
