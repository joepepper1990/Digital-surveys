# ESG Competency Hub – Power Automate solution

`ESGCompetencyHub_1_2_0_0_unmanaged.zip` is the solution to import into Power Automate (plan K7.3, K8). It holds:

| Part | Name |
|---|---|
| Flow | **ESG Competency Hub \| 1 Daily tasks** – every morning at 06:00 UK time; ships **Off** |
| Flow | **ESG Competency Hub \| 2 Request queue** – ships **Off**; turn it on after import |
| Connection reference | `esghub_sharedsharepointonline_hub` – ESG Competency Hub SharePoint |
| Connection reference | `esghub_sharedoffice365_hub` – ESG Competency Hub Outlook (emails are sent from this connection's mailbox) |
| Environment variable | `esghub_CompetencyHubSiteUrl` – ESG Competency Hub Site URL (no trailing slash) |
| Publisher | ESG Competency Hub, prefix `esghub` (its own, so nothing clashes with the ESG 1-to-1 solution in the same environment) |

`schema/schema.json` is the single description of the lists. Setup builds the site from it, and the flow tools check every
column the flow uses against it.

## Version 1.2.0.0: the rest of an action's life (plan K9)

Five more request types: **ChangeStatus**, **ReassignAction**, **CloseAction**, **ReopenAction** and
**EditActionDetails**, each with the same checks as the app (same messages), the lock and revision, a History event
(Status Changed, Reassigned, Closed, Reopened, Details Edited) and emails: a reassignment tells the new owner (ASG) and
the previous owner (RAW); closing tells the owner and the raiser (CLS); never the person who made the change.

The changes to an existing action are built **once** (`change_all()` in `flows.py`): each kind adds only small Switch
cases that set its verdict, plan, values, event fields, result and emails. That keeps the request flow at about 380
actions (Power Automate allows 500); building each kind separately had reached 895.

## Version 1.1.0.0: emails and reminders (plan K8)

| Email | To | When |
|---|---|---|
| Action assigned to you (ASG) | The owner, unless they raised it | When the action is raised |
| Deadline moved (EXT) | The owner, unless they moved it | On each extension |
| Ready for your close-out check (RDY) | The raiser, unless they marked it done | An action needing a close-out check is marked done |
| Action closed (CLS) | The owner and the raiser, except whoever closed it | An action is closed |
| Reminder: due in N days (R7) | The owner | The first morning with 1–7 days left (`ReminderDaysBefore`) |
| Due today (DUE) | The owner | The morning of the deadline |
| N days late (OD) | The owner | Day 1 late, then every `OverdueReminderIntervalDays` |

- **Notification Log is the ledger** (plan F.4.2). Each email has one row, keyed so it is never made twice
  (`ASG|{request}|{person}`, `R7|{action}|{DueDay}|{person}`, `OD|{action}|{DueDay}|{n}|{person}` …). The row holds the
  rendered email and a reference (`ESGN…`) that is also printed in the email.
- **Request queue.** The rows are made before the change counts as applied; the emails are sent after the request is
  Completed (`Send_emails`), so a mail problem never touches the change.
- **Daily tasks.** One indexed query finds every open action due by the end of the reminder window, one more finds the
  reminders already made, and only missing keys are queued, so a missed morning is caught up and a second run sends
  nothing. An assignment or new deadline 0–7 days away that was **sent** marks that reminder Skipped.
- **Retries.** A refused send (4xx) is Failed; anything unclear (time-out, 5xx) is Unknown. The daily run tries both
  again, Unknown ones with "If you have already received this message, please ignore it", and gives up after 3 attempts
  (Abandoned). Rows left Sending for 30 minutes by a run that stopped count as Unknown. The connector never retries on
  its own. Searching Sent Items to settle an Unknown row (probe P-12) is not built yet.
- **Escaping.** Every value a person typed is HTML-escaped; `validate.py` refuses an email body that shows one without
  the escaping.
- **Not yet:** reassignment, minutes, the weekly summary, the calendar digest, administrator alerts, and the
  `NotifyRaiserOnExtension` / `NotifyOnClosure` settings (closure emails always go; the raiser is not told about
  extensions).

## Version 1.0.0.1: fewer SharePoint calls (plan K7.10)

The first test on the site took 9½ minutes, almost all of it waiting on SharePoint calls. This version makes **20 calls
to raise an action (was 31)** and **16 to extend or complete one (was 26)**. The same checks and records are made:

- **Lists by address.** Every list is reached as `GetList('/sites/…/Lists/<url>')`, so no call is needed to find them.
- **First run.** When a run has just created the transaction row, nothing for the request can exist yet, so the
  "already done?" look-ups (existing action, folders, event row) are skipped. A resubmitted run is not a first run and
  makes every check, as before.
- **Returned Ids.** New items' Ids are taken from the create response (read back only if missing); the claim time is
  written with the transaction row; both sign-in names come from one call; the area comes with the action (`$expand`);
  the lock this run took is released without reading the action again.

`test_flow.py` holds a call budget per request type, so a later change that adds calls fails the tests.

Import it over 1.0.0.0 as an **upgrade**; the connection and site address stay as they are.

## What the flow does

When a request in the **Requests** list is created or changed to *Submitted* (the trigger checks every 2 minutes):

1. **Requester.** It takes the requester from the folder the request is in: their own `u{SiteUserId}` folder, made by
   Setup with the flow's account. A request anywhere else, from someone marked Left, or created by someone other than
   the folder's person is **Rejected** without a transaction.
2. **Claim.** It claims the request with its ETag. A second run gets a 412 and stops.
3. **Private copy.** It copies the request into a transaction row in `History/Transactions`. Everything after this
   works from that copy, so editing the request item changes nothing.
4. **Event time.** This is the request's own time if it is within 30 minutes of the first claim; otherwise it is the
   claim time.
5. **Checks.** It applies the same rules as the app (`02-frontend/src/domain/rules.js`), with the same messages:
   - **RaiseAction:** the area, the owner, title, description, target date (today to 2 years ahead) and priority.
   - **ExtendDeadline:** owner or action manager; open; not locked; same revision and deadline as the user saw; new
     date after the current one and not in the past; reason 10–1,000 characters.
   - **MarkComplete:** owner or action manager; open; not locked; same revision.
6. **Apply.**
   - The plan (previous values) is stored on the transaction first.
   - The action is changed with its ETag, together with its lock (`PendingRequestKey`) and `Revision + 1`.
   - If someone changed the action in between, the 412 means nothing was done, so the request is Rejected with
     *"This action was updated by someone else…"*.
   - For RaiseAction, the action is created in `Actions/{area}` with `CreatedRequestKey = F|{key}`, and its folder
     `Updates/{area}/A{id}` is created for instant updates.
7. **Commit.**
   1. The event row is written in `History/{area}/A{id}`; extensions get every EXT-04 field.
   2. The transaction is marked *Applied*.
   3. The lock is released and `LastRequestKey` is set, which is what the app waits for.
   4. The request is marked *Completed* with a message, for example *"Deadline moved to 28 October 2026."*

If a run fails, the request is marked *Failed* and the transaction *Failed*. Setting the request's Status back to
*Submitted* runs it again; every step checks whether it was already done, so it finishes correctly. The Queue Monitor
that will do this automatically comes in the next increment, together with notifications.

## Tools (`tools/`)

Python 3.9+ only; nothing to install.

| File | Purpose |
|---|---|
| `flows.py` | The flow, written in Python and generated as Power Automate's JSON |
| `validate.py` | Static checks. Expressions parse and use real functions; every reference exists and is in scope; `runAfter` chains are complete; REST columns exist in `schema.json`; standard connectors only; no secure inputs or outputs where Power Automate rejects them; nesting ≤ 8; ≤ 500 actions. Adapted from the ESG 1-to-1 validator, whose import lessons it keeps. |
| `wdl.py` | A small interpreter for the workflow language, adapted from the 1-to-1's, so the real flow JSON can be run in tests |
| `hub_fake.py` | A simulated Hub site that answers exactly the REST calls the flow makes. It follows SharePoint's rules for ETags, refused fields, required and unique columns, site-format dates, and Number columns returned as doubles. |
| `test_flow.py` | 22 tests of the real flow JSON: each request type accepted and refused, identity from the folder, races, the event-time rule, and an interruption at **every** write followed by a resubmission that ends in exactly the state of an uninterrupted run |
| `test_validate.py` | 19 deliberately broken flows and packages that must be rejected |
| `build_solution.py` | Validates, then writes `src/` and the zip in the layout Microsoft's `pac` CLI writes |
| `check_package.py` | Compares the zip, element by element, with the ESG 1-to-1 solution that pac packed and that imported in the tenant: file order, encodings, line endings, `solution.xml`, `customizations.xml`, connection references and environment variables |
| `run_all.sh` | Runs all of the above |

**Evidence class: LOCAL / OFFLINE-SIMULATED.** The import, the connection and the flow's behaviour on the real site are
proven only by importing it and testing it there (HOW-TO in the download package).

**Known risk.** This zip is written by `build_solution.py`, not by `pac` (which is not available here). Its structure
matches a pac-packed solution that imported, but the first import is the real test. If the import is refused, the
error message names what to change.
