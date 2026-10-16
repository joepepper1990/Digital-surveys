# Regression test report – page 5.0.0 and solution 1.4.0.0

**Date:** 16-Oct-2026.
**Scope:** everything changed in `CHANGES_5_0.md`.

All tests ran locally against fictional data (the browser mock of SharePoint, and the flow simulator with its fake SharePoint). Nothing was run against the live tenant. What only the tenant can confirm is listed at the end.

## Results

| Suite | Command | Result |
|---|---|---|
| Frontend (page + mock, headless Chromium, 1366 px) | `cd 02-frontend && node tools/build-mock.js && node test/run-tests.js` | **319 / 319** |
| Reset tool | `cd 02-frontend && node test/run-reset-tests.js` | **33 / 33** |
| Flow validator: deliberate mistakes caught | `python3 04-solution/tools/test_validate.py` | **34 / 34** |
| Flow simulations, solution flows | `python3 04-solution/tools/simulate.py` | **216 / 216** |
| Flow simulations, legacy-builder flows | `ESG_SIM_MODE=legacy python3 04-solution/tools/simulate.py` | **216 / 216** |
| Build, pack/unpack, builder page, zip checks | `bash 04-solution/tools/run_all.sh` | **ALL CHECKS PASSED** |

`run_all.sh` runs the validator, simulations, builder and zip checks above. It also checks that:

- only the standard SharePoint, Outlook and Office 365 Users connectors are used;
- there are no HTTP or premium actions;
- no secure inputs are set on action types that can't take them (the 1.3.0.1 lesson);
- no new column is written with a connector step (the 1.3.0.2 lesson);
- the connection references and environment variables are unchanged.

## What the requested regression areas cover

| Area | Covered by |
|---|---|
| Appraisal periods of 12, 15 and 23 months | Frontend §25 (period calculations on made-up data) |
| Postponed or brought-forward due date never moves a review | Frontend §25 |
| Platform change (early completion, next due 23 months on) | Frontend §25 |
| Completion month belongs to the closing period; new period starts empty; no overlap | Frontend §25 |
| April–March crossing; BST completion on the 1st | Frontend §25; simulation (April carry-over) |
| Earlier reviews with no period start; no start set | Frontend §25 and §28 |
| Mark completed: future date, next-due order, same-month refused | Frontend §26 and §28 |
| Undo, and Undo restoring the due date | Frontend §28 |
| Boundaries written to every review of that person; nothing else changed | Frontend §26 |
| Missed months: none submitted, some missed, 23 months with 17 rated ("17 rated reviews of 23 months · 5 missed"), late vs missed, streak, on-time = on time ÷ submitted, averages and forecast unchanged when missed months are removed | Frontend §25 |
| Amendments on a released review: reason required, audit before/after, write order (audit Draft → changed columns only → Pending), not a resubmission, one E16, reload never resends | Frontend §27 |
| Amendments: technician sees the result, can't read the audit, still can't edit (403) | Frontend §27 |
| Amendments on a submitted review: answers only | Frontend §27 |
| Amendments on a closed review: never the technician's answers | Frontend §28 |
| Amendment refused when the review changed elsewhere | Frontend §27 |
| Failed email → Resend → Sent, with a notice to the TL | Frontend §27; simulation |
| Unfinished Draft → Dismiss (Cancelled) | Frontend §27 |
| Failed save then retry → one record, one email | Frontend §28 |
| Malformed audit data | Frontend §28 |
| Before Setup 1.4: page loads, read-only banner | Frontend §27 |
| Flow 8: Draft never sends; Pending → Sent; stale second trigger sends nothing; own update doesn't re-run; failure → Failed + notice; Retry; Cancelled / Sending / Failed never trigger | Simulation |
| Flow 2: TL amendment cancelled after re-locking; real submission always processed (including the race with a TL write) | Simulation |
| Wellbeing: next date on the Team record (typed or calendar); Complete asks for it (required, never invented); the confirmed date becomes the Team date; overdue and no-date attention items | Frontend §16 and §26 |
| E12 / E17: 7 days before, on the day, weekly while overdue (not in between); BST; inactive people; no date; a bad value never stops the run | Simulation |
| Expectations: 13 shared saved with no cap; unique SortOrders at the end of each group; Shared before Individual | Frontend §15 and §26 |
| Expectations: grouped cards; the removed sentence | Frontend §26 |
| Expectations: Delete permanently (retired only, confirmation, recycle bin, history kept); technician recycle() → 403 | Frontend §26 |
| Flow 1: 15 expectations (no `take(10)`); earlier year carries on, later and mistyped years stay out; boundaries copied | Simulation |
| Flow 1: a missed Flow 2 run is reported, its title escaped | Simulation |
| UI removals: no "Today" date, no Expected appraisal outcomes or Workload this month charts, no Workload or Energy by month charts; pill bubble with a visible label; Settings → Team fits at 1366 / 1600 / 1920 px | Frontend §15, §26 and §28 |
| Challenges retired: group removed, items Owners-only, open → Not agreed, data kept, re-run changes nothing; Amendments list Owners-only with versioning | Simulation |
| Reset tool: inventory; nothing pre-selected; never Technicians or Settings | Reset tests |
| Reset tool: review pairs selected together | Reset tests |
| Reset tool: backup has every column; backup and dry run change nothing; selection change needs a new backup | Reset tests |
| Reset tool: Flow 1 confirmation and exact phrase required; only the selected records deleted (to the recycle bin) | Reset tests |
| Reset tool: Technicians, Settings, permissions and group byte-identical; failures reported; report download | Reset tests |
| Reset tool: technician refused (page and SharePoint); XSS | Reset tests |
| XSS sweeps with attack strings in every new field (reason, before/after, error, history, boundaries, amend mode) | Frontend §13 and §27 |
| Static rules: no innerHTML, eval, external URLs or email addresses; one update and one create endpoint; one `recycle()`, only for retired expectations | Frontend §1; reset static checks |

## Independent review rounds

Two independent reviewers worked on separate copies after the build. All findings below were fixed, and each has a test.

### Security review (static and contained; no live environment)

| # | Finding | Fix |
|---|---|---|
| S1 | A technician-editable review title went unescaped into the E7 problem email | Escaped (simulation proves `&lt;a href…`) |
| S2 | Flow 2 cancelled TL-amendment runs before re-applying the lock | The lock is now re-applied first (simulation) |
| S3 | TL writes to a submission still waiting for Flow 2 could shift its submitted time | The page no longer writes to such a review |
| S4 | The validator missed review or audit content in steps that can't be secured | New rule plus 5 mutations |
| S5 | No static check on `recycle()` | Added |

**Held:**

- technician deletes are impossible (no Delete bit in any 1-to-1 level);
- the reset tool can't reach Technicians or Settings;
- the technician-editable copies only affect their own view;
- E16 carries no content;
- no XSS;
- Flow 8 doesn't double-send.

### Break-it review

| # | Finding | Fix |
|---|---|---|
| B1 | Amending a closed (not submitted) review exposed the Q2 and Q8 technician answers | Uses the same rule as the other questions |
| B2 | A failed save that was retried left a Draft that could later send a second email | The retry closes it; a superseded Draft is never offered for sending |
| B3 | The reset tool could delete half of a review pair, so Flow 1 would recreate the month and re-email | Pairs are always ticked together |
| B4 | A same-month completion made an empty period | Refused |
| B5 | A future period start was accepted | Refused |
| B6 | An earlier period with no start was labelled "no period start set yet" | Labelled with its completion |
| B7 | Settings → Team clipped its buttons at 1366 px | Single table wrapper, stacked buttons; tested at 1366, 1600 and 1920 px |

**Smaller issues, also fixed:**

- the reset tool's month filter now uses UK months;
- the amend details box is hidden for No;
- Undo restores the previous due date;
- the history card ignores malformed audit entries;
- E16 wording is neutral ("has been amended");
- the refusal message now explains the release delay.

**Held:**

- period edge cases on the 1st and last day, in BST and GMT;
- out-of-order or malformed history;
- missed and late counts;
- double-click saves;
- E12 and E17 maths;
- Flow 8 paths;
- XSS on every new field;
- 1366 px layouts.

## Visual check (1366 px)

Screenshots were taken of these screens, with no page errors:

- Team overview
- Settings → Team
- Expectations
- Profile with period selector
- Released review
- Amend dialog
- Amendment history
- The technician's view
- The reset tool

## Known limits and what needs the tenant

- **The audit is tamper-evident, not tamper-proof.** Site owners and admins can edit any list they own. The E16 email to the technician is an independent record.
- **Emails to people no longer active.** E16 is still sent to someone who is no longer active. They are told, but they can't open the link.
- **Completing then amending within about 5 minutes.** If you complete a review and amend it before Flow 3 has run, the amendment is refused as "changed elsewhere". The message says to wait for the release. This timing can only be seen in the tenant.
- **Flow 2 timing.** Flow 2's submitted time still comes from the item's last change, which is unchanged from 1.3. The page no longer writes during that window.

The tenant-only checks are T1–T11 in `MIGRATION_1_4.md`:

- activation;
- the Setup result;
- Editor in Flow 2;
- exactly one E16;
- `recycle()` permissions;
- versioning and permissions on Amendments;
- the technician's access;
- the reset layout;
- real baseline dates;
- date round-trips on the live regional settings.
