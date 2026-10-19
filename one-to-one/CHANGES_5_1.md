# What changed: page 5.1.0 and solution 1.5.0.0 – enhanced action tracking

Previous versions: page 5.0.0 and solution 1.4.0.0. To install, see `MIGRATION_1_5.md` (technical) or `SIMPLE_UPGRADE_STEPS.md` (plain language). Test evidence is in `TEST_REPORT_1_5.md`.

## Before and after

| | Before (5.0 / 1.4) | Now (5.1 / 1.5) |
|---|---|---|
| Where an action lives | Only inside the review it was agreed in (`ActionsJson`) | Its own record in **1-to-1 Actions**, followed month to month. `ActionsJson` stays as what was agreed at that meeting |
| Who updates it | Only the Team Leader, by editing the released review | The technician sends updates in seconds; the Team Leader manages it on one page |
| Statuses | Open / Closed | **Open, In progress, Waiting, Ready for close-out, Closed** |
| Closing | The Team Leader ticked "Close out" (which rewrote the released review directly) | The technician can ask to close **their own** action; only the Team Leader closes or reopens, with notes kept |
| Deadlines | One date | The original deadline is kept; a change needs a reason and is in the history |
| History | None | Every update, decision and change, with who and when |
| Between meetings | Nothing | *My actions* for technicians, reminder emails 5 working days before a deadline |
| At the next 1-to-1 | Actions weren't shown | *Outstanding actions* on both review screens, with what changed and optional follow-up outcomes |

## 1. The tracker

- **Agreed actions are added automatically when a review is released.** Flow 3 does it on the server, so closing the browser or a network drop can't lose them. Each action has a unique key (`mr<review>-<action>`), so a retry, a second release or the daily check can never add it twice. If flow 3 couldn't finish, flow 1 completes it the next morning. Until then the review says *"Being added to the action tracker (1 of 2 so far)"*, and after an hour *Needs your attention* says so too. A review is never shown as done until every action is in.
- **Only reviews released after the upgrade.** Setup 1.5 records when the tracker started; earlier actions are never imported and stay in their reviews, marked *"Agreed before action tracking started"*.
- **The tracker is the only live record after release.** In a released review the agreed actions are read-only (in amend mode too). The old **Close out / Reopen** buttons, which rewrote released Manager Reviews directly, are gone.
- **Waiting is not an extension.** *Overdue* is always worked out from the current deadline. An overdue action that is waiting says what it is waiting on (*"Overdue – waiting on: spare part from supplier"*), so a delay outside someone's control isn't mistaken for neglect.
- **No scores.** Actions never feed ratings, averages or the expected outcome. The report lists them with their status and latest progress, and explains that *Waiting* shows a dependency, not performance.
- **Missed reviews and appraisal periods don't touch actions.** An open action is carried forward whatever happens to the months; the profile and report show actions that are open now, or were raised or closed in the chosen period.

## 2. Team Leader – the Actions page

- **What needs you**, first: *Awaiting close-out*, *Overdue*, *Due soon* (10 working days), *Waiting*, *No recent progress* (30 days), *Needs a fix* (emails or sharing). Click a tile to see just those.
- **Filters:** technician, owner, status, deadline.
- **One Update… dialog** for everything:
  - a progress note;
  - status;
  - waiting reason and next check;
  - a new deadline, with a reason (the original is kept);
  - a new owner, with a reason.
  
  The history is in the same dialog.
- **Close-out requests:** **Agree & close** (optional note) or **Not yet…** (a reason the technician sees). You can also close any action directly, and reopen a closed one with a reason.
- **+ New action** for anything agreed outside a review.
- **Repair sharing** asks flow 9 to check an action's permissions again.
- **Resend** for a failed or uncertain email.
- **Saving is safe when two people work at once.** Each save is accepted only if the action hasn't changed since you opened it (for example a technician's update was recorded meanwhile). If it has, nothing is written; the page reloads the action and asks you to make your change again. Nothing is ever overwritten.
- **Needs your attention** adds:
  - close-out requests;
  - overdue actions;
  - actions with no progress for 30 days;
  - releases whose actions aren't all in the tracker after an hour;
  - emails that failed, or whose delivery is unknown;
  - updates not recorded after an hour (flow 10 off);
  - actions not yet shared.

## 3. Technicians – My actions

- **A new tab: My actions.** Each action is a card with:
  - the description, and whether it is theirs or the Team Leader's;
  - status, deadline (and the original if it moved), and close-out criteria;
  - latest progress, what it is waiting on, and the Team Leader's notes;
  - the full history.
- **Quick update:** type a line and **Send update**. Or **Waiting on something…** (a reason, and an optional next-check date – the deadline doesn't change). On their own actions, also **Ready to close…**.
- **They never see success before it is recorded.** The card shows:
  - *Sending…*;
  - *received – being recorded*;
  - *recorded ✓* once flow 10 has applied it;
  - *not recorded: <reason>* if it was refused;
  - *not sent* with **Send again** if it never reached SharePoint.
- **Nothing is lost:**
  - Two tabs, a quick second update, or a refresh mid-send each give their own record.
  - An interrupted send is offered again with the same key, so it is never recorded twice.
  - The page checks again after 20 seconds, 1 and 2 minutes, and on Refresh.
- **Privacy:** a technician sees only their own actions and updates. SharePoint enforces it; the page drops anything else it is ever given.

## 4. Carry-forward and follow-up outcomes

- **Outstanding actions** appears on the technician's monthly form and on the Team Leader's review. It lists actions that are still open, or were closed since the previous review. For each one it shows:
  - where it came from, owner, deadline and status;
  - the latest progress;
  - what changed since the previous review, or a *Follow-up needed* flag if nothing did.
- **Optional one-click outcomes** for that month:
  - **Progress satisfactory**;
  - **Further support required** (with optional details);
  - **Ready to close**. From the technician (their own actions only) this is a close-out request. The Team Leader can **close it now** or **mark it ready**.
- **Recorded in the history with the review month** and visible to both people. Choosing the same outcome again adds nothing; a different one is added as a change.

## 5. Emails (flow 11)

- **E19** – a close-out request, to the Team Leader. Sent once per request.
- **E20** – a deadline in 5 working days, to the technician with the Team Leader copied:
  - one per action and deadline (a moved deadline gives exactly one new reminder);
  - caught up if a day was missed;
  - none for closed actions, and none after the deadline (no overdue emails);
  - UK dates, summer time included.
- **Each email is a notice item:** *Pending → Sending → Sent* or *Failed*. A failed one is retried (up to 3 attempts), and *Needs your attention* offers Resend. One stuck at *Sending* is shown as **delivery unknown** – never as sent. Email can't promise exactly-once delivery.
- Wording: `03-flows/EMAIL_TEMPLATES.md`.

## 6. Under the hood (for whoever looks after the solution)

- **New lists:** 1-to-1 Actions, 1-to-1 Action Updates (one folder per technician), 1-to-1 Action Notices. Also the `ActionsSyncedOn` column on Manager Reviews and the `ActionsTrackerStart` setting. See `01-sharepoint/lists.md`.
- **Flow 9 (Action access)** checks the actual permissions on every action and folder against the exact set allowed:
  - the action: Owners Full Control + that technician Read;
  - the folder: Owners Full Control + that technician 1-to-1 Submit.

  It repairs anything else, creates missing folders, and is safe to re-run.
- **Folders are trusted only if flow 9 made them and nobody has changed them since.** Technicians can edit only items they created, so they can't rename their folder; a folder anyone else has created or changed is closed to Owners and reported, never adopted. Folders are found by their exact path.
- **Flow 10 (Action update)** takes the sender's identity from the folder the update is in, never from *Created By* or the action id. It:
  - claims the update with its etag (one run only);
  - checks the rules (own action, not closed, waiting needs a reason, close-out requests only on their own actions);
  - applies it with the action's etag, retrying once if the Team Leader saved in between – and checking the rules again on the fresh copy, so a close or takeover in between is never undone;
  - records it once (the update's id is in the history);
  - then locks the update to Read.
- **The page writes actions only with REST MERGE and the etag it read** (never `*`), and only to 1-to-1 Actions. Every action date is read back after saving.
- **Reset tool 1.1.0:** a separate *Action tracker* group, shown only after its own tick box (separate approval). Selecting an action always takes its updates and emails with it; they are deleted first, so nothing is left behind. Deleting reviews never deletes actions. Folders are never deleted.
- **Standard connectors only** (SharePoint, Outlook, Office 365 Users). No premium or HTTP connector.

## 1.5.0.1 – Flow 1 nesting repair (19-Oct-2026)

**Why.** Power Automate refused to turn on *1 Daily scheduler* from 1.5.0.0 (`TemplateValidationError`: actions nested at level 9, maximum 8). The action-tracker steps went as deep as level 11.

**What changed.** Flow 1's structure only; behaviour, flow IDs, connectors, environment variables, triggers, lists and the page are unchanged. Full details and upgrade steps: `04-solution/REPAIR_1_5_0_1.md`.

- The always-true *Action tracker* wrapper is gone. Its try and catch sit directly in the main *Try*, with the same order (after *Reconcile_submissions*) and the same E7 reporting.
- A one-step wrapper around each review's sync is gone. A review that can't be added is still reported by name.
- Two "condition → stop" pairs are now one step each, failing with the same message (also in Flow 3).
- **New build guard:** any flow nested deeper than 8 levels (including else branches and Switch cases), or with more than 500 actions, fails the build. It is checked on the generated flows, on the packed zip and on the legacy packages.
- **New package check** (`tools/check_package.py`):
  - the zip is exactly the validated source;
  - same flow IDs, connection references, environment variables and triggers as 1.5.0.0;
  - the 1.5.0.0 zip is never overwritten.

**Maximum nesting level after the fix:**

| Flow | Level |
|---|---|
| 0 Setup | 4 |
| 1 Daily | 8 (was 11) |
| 2 | 2 |
| 3 | 6 (was 7) |
| 4 | 3 |
| 5 | 4 |
| 6 | 2 |
| 8 | 2 |
| 9 | 3 |
| 10 | 5 |
| 11 | 3 |
