# What changed: page 5.0.0 and solution 1.4.0.0

Previous versions: page 4.5.0 and solution 1.3.0.2. To install, see `MIGRATION_1_4.md` (technical) or `SIMPLE_UPGRADE_STEPS.md` (plain language). Test evidence is in `TEST_REPORT_1_4.md`.

## 1. Team dates (Settings → Team)

- **Every person has three dates:**
  - **Next appraisal**
  - **Next wellbeing**
  - **Appraisal period start**, editable until a completion has been recorded

  Each can be typed as DD/MM/YYYY or picked with 📅, independently of the others. Dates never change by themselves.
- **The next wellbeing date lives on the Technicians record** (`NextWellbeingDate`). It drives:
  - the Wellbeing tab and the team tiles;
  - overdue flags and *Needs your attention*;
  - the technician's view;
  - E12 reminders.

  No past assessments are invented. If the last completed assessment has a date, *Needs your attention* offers **Use it**, and it is applied only when clicked.
- **Completing a wellbeing assessment asks the TL to confirm or set the next date.** It is never set silently.
- **Reminders** go out 7 days before, on the day, then every 7 days while overdue. This applies to wellbeing (E12, changed) and appraisals (E17, new). Both are for active people only.

## 2. Appraisal periods follow real completion dates

- **"Mark appraisal completed…" (TL only)** asks for the actual completion date and the next due date, then shows a confirmation.
  - It records the completion in `AppraisalHistoryJson` and starts a new period with fresh ratings.
  - Earlier periods, their reviews and their reports are kept and can be chosen on the profile and the report.
  - **Undo last** reverses it. A second completion in the same month counts as a correction.
- **Membership.** A month belongs to the period that started before it and ends at the completion month.
  - Moving the next due date never moves a review, and never resets ratings.
  - Periods can be any length: 12, 15, 23 months or more.
  - Dates are taken as UK local dates, so a completion on the 1st of a month in summer time stays in that month.
- **Reviews before the first recorded start** are kept as a closed "earlier period". With no start set, there is no forecast beyond the current score.
- **Expectations across April–March.** An expectation's year is the first appraisal year it applies to. It carries on until it is retired, so it no longer disappears in April. One entered early for next year stays hidden until then. A mistyped year is ignored safely.

## 3. Missed months excluded

- Months closed as not submitted, and overdue open months, are left out of all of these:
  - averages, the expected outcome and the forecast, and the trend;
  - the team and profile tables;
  - the on-time figure, which is now *on time ÷ submitted*.
- **Streak.** A missed month neither extends nor breaks the on-time streak; a late one breaks it.
- **Counts.** Profile tiles and reports show "**17 rated reviews of 23 months · 6 missed**".
- **Still visible.** Missed months still appear as overdue items and in the submission record.

## 4. Challenges removed

- **The page.** Every part of the challenge feature is gone: banner, flags, attention items, report section and styles.
- **The flows.** Flow 7 and Flow 1's challenge step are not in 1.4. E14 and E15 are retired.
- **The data is kept.** Setup 1.4:
  - removes the technicians group from the *1-to-1 Challenges* list;
  - makes each item Owners-only;
  - closes any open challenge as *Not agreed*.

  The Manager Reviews `Challenge*` columns stay, unused. Flow 7 is turned off, and deleted only after approval (an import can't delete it).

## 5. TL amendments with a restricted audit

**When the page allows an amendment**

- **Released reviews are read-only.** Use **Amend…** to change the TL's feedback or the technician's answers.
- **Submitted (not yet released) reviews** still save the TL's feedback as before. **Amend answers…** changes the technician's answers.

**How an amendment is saved**

1. **Save amendment…** requires a reason and lists the changed fields.
2. The page checks nobody changed the review since the amendment started (*changed elsewhere – reload*).
3. It writes a **Draft** record in the new Owners-only list **1-to-1 Amendments**, holding before and after values of the changed columns only. Who and when come from SharePoint's own Created / Author.
4. It writes only the changed columns.
5. It marks the record **Pending**.

**What the technician sees**

- The technician is never reopened for editing and never re-submits.
- Flow 2 cancels runs that are TL amendments.

**The notice (new Flow 8)**

- Flow 8 emails E16 to the technician: the month and a link, with no content or reason. It records *Sent*, or *Failed* plus a notice to the TL.
- It re-reads the item before sending and runs one at a time, so there is one email per amendment.
- *Needs your attention* lists:
  - a failed email, or one stuck for over an hour, with **Resend**;
  - an unfinished Draft, with **Send notice** or **Dismiss**.
- **Amended (n)** on the review shows the history, to the TL only.
- Statistics refresh straight after an amendment.

**Honest limit:** site owners and site collection admins can always edit lists they own. The audit is therefore tamper-evident (version history), not tamper-proof. The E16 email is an independent record.

## 6. One-time test-data reset (temporary tool)

`02-frontend/reset/` and `RESET_PROCEDURE.md` cover the process:

1. inventory and choose, filtering by person or month;
2. back up the selected records to JSON;
3. dry run;
4. typed confirmation, with Flow 1 confirmed off;
5. delete to the recycle bin;
6. verify, with a downloadable report.

It never touches Technicians, Settings, permissions or groups. A technician can't use it, and SharePoint refuses their deletes anyway.

## 7. Expectations

- **No limit.** There's no cap of 10 any more (a warning appears above 30 on one review).
- **Order.** Shared always come before Individual, and new items go to the end of their own group.
- **Layout.** There is a separate **Shared** card, and one card per technician.
- **Delete permanently** is offered on retired items only. It is TL only, asks for confirmation, and sends the item to the recycle bin for about 93 days. Past reviews keep their own copies.
- **Actions** live inside each review, so there are no separate archived action records to remove.
- The sentence "New items go to the end of their list – drag ⋮⋮ to reorder." has been removed.

## 8. Screen clean-up

- **Profile.** No *Workload by month* or *Energy by month* charts.
- **Team overview.** No *Expected appraisal outcomes* or *Workload this month* charts; *Needs your attention* takes the full width.
- **Title bar.** "Today dd-MMM-yyyy" has been removed.
- **Feedback bubble.** It is a compact pill with a visible **Feedback** label.

## Files

| File | Version |
|---|---|
| `02-frontend/one-to-one.html`, `02-frontend/one-to-one.js` | 5.0.0 |
| `04-solution/ESGOneToOne_1_4_0_0_unmanaged.zip` | 1.4.0.0 |
| Flows | 0 Setup, 1–6, 8 *Amendment notice* (new, imported Off) |
| `02-frontend/reset/one-to-one-reset.html`, `.js` | 1.0.0 (temporary) |
| `01-sharepoint/lists.csv` / `lists.md` | 1.4 schema |
| `03-flows/EMAIL_TEMPLATES.md` | E12 changed; E16 and E17 new; E14 and E15 retired |

## What can only be confirmed in the tenant

See `MIGRATION_1_4.md` → *Tenant-only checks* (T1–T11). In short:

- the flows activate after import;
- Setup reports *complete*;
- Flow 2 sees **Editor**;
- Flow 8 sends exactly one email;
- `recycle()` is refused for technicians;
- versioning and Owners-only access on Amendments;
- the reset layout appears and is removed afterwards;
- the TL's own baseline dates for real people;
- date round-trips on the live regional settings.
