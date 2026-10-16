# ESG 1-to-1 — email templates (v4)

Every email is sent with **Send an email (V2)** from the TL's mailbox (the flow owner).

**Rules for every email:**

- **No answers, feedback, ratings or actions** in any email. The only technician-chosen text that is ever emailed is the Q9 choice, in E3, and only as a tag in the subject.
- The link is always `concat(variables('varPageLink'), '?reviewId=', <Monthly Review ID>)`.
- Turn on **Secure inputs** for every email action.
- Importance: Normal. Leave *Is HTML* on (the default in V2).

**Where the Monthly Review ID comes from:**

| Flow / place | `<Monthly Review ID>` |
|---|---|
| Flow 1 (E1) | `variables('varReviewId')` |
| Flow 1 reminders (E2) | `items('Each_outstanding')?['ReviewItemId']` |
| Flow 2 (E3) | `triggerBody()?['ID']` |
| Flow 3 (E4, E5) | `triggerBody()?['ReviewItemId']` |

---

## E1 — link to this month's 1-to-1 (Flow 1 → technician)

**Subject**

```
Your 1-to-1 for @{outputs('MonthName')} is ready
```

**Body**

```html
<p>Hi @{first(split(outputs('Mgr')?['Technician']?['DisplayName'], ' '))},</p>
<p>Your monthly 1-to-1 is ready: <a href="@{concat(variables('varPageLink'), '?reviewId=', variables('varReviewId'))}"><b>Open my 1-to-1</b></a></p>
<p>Deadline: @{outputs('DeadlineText')}.</p>
<p>You can save and come back as often as you like before you submit.</p>
<p style="color:#666">This link only works when you're signed in with your own company account.</p>
```

## E2 — reminder on the reminder days (Flow 1 → technician)

> v4.2: the days come from ⚙ Settings → Reminders (the `Reminders` item in 1-to-1 Settings, default `[20,27]`).

**Subject**

```
Reminder: your 1-to-1 for @{outputs('MonthName')} is due @{outputs('DeadlineText')}
```

**Body**

```html
<p>Your 1-to-1 hasn't been submitted yet. Anything you've saved is still there:
<a href="@{concat(variables('varPageLink'), '?reviewId=', items('Each_outstanding')?['ReviewItemId'])}"><b>Continue</b></a></p>
```

## E3 — submitted (Flow 2 → TL)

**Subject**

```
@{if(startsWith(coalesce(triggerBody()?['Q9FollowUp']?['Value'], ''), 'Arrange a dedicated'), '[1-to-1 REQUESTED] ', '')}1-to-1 submitted: @{outputs('Mgr')?['Title']}
```

**Body**

```html
<p>Submitted @{if(greater(ticks(utcNow()), ticks(outputs('Mgr')?['DueDate'])), 'late', 'on time')}.
<a href="@{concat(variables('varPageLink'), '?reviewId=', triggerBody()?['ID'])}"><b>Open review</b></a></p>
```

## E4 — feedback released (Flow 3 → technician)

**Subject**

```
Feedback on your 1-to-1 (@{formatDateTime(concat(triggerBody()?['MonthKey'], '-01'), 'MMMM yyyy')}) is ready
```

**Body**

```html
<p>I've completed your review – feedback, ratings and any agreed actions are ready.
<a href="@{concat(variables('varPageLink'), '?reviewId=', triggerBody()?['ReviewItemId'])}"><b>View feedback</b></a></p>
```

## E5 — closed without a submission (Flow 3 → technician)

**Subject**

```
Your 1-to-1 (@{formatDateTime(concat(triggerBody()?['MonthKey'], '-01'), 'MMMM yyyy')}) has been closed
```

**Body**

```html
<p>This review was closed without a submission.
<a href="@{concat(variables('varPageLink'), '?reviewId=', triggerBody()?['ReviewItemId'])}">View</a>.
Please speak to me if this is unexpected.</p>
```

## E7 — problems found by the daily run (Flow 1 → TL)

**Subject**

```
1-to-1 system: action needed
```

**Body**

```html
<p>The daily 1-to-1 run found these problems:</p>
<p>@{join(variables('varProblems'), '<br>')}</p>
<p><a href="@{concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])}">Open the run</a></p>
```

> There is no E6 (the numbering is kept from the plan so references stay valid).

---

## v4.2 / solution 1.1 – new emails (sent from the line manager's mailbox)

E4 and E5 are written in the first person (they come from your mailbox), so they no longer name a role.

| # | Flow → to | Subject | Body (summary) |
|---|---|---|---|
| E8 | 4 Team members → you | `1-to-1: access given to <name>` / `1-to-1: access removed for <name>` / `1-to-1: access removed for people not active in the team list` | Confirms the `1-to-1 Technicians` group change after you add or deactivate someone in ⚙ Settings → Team. The third lists anyone found in the group without an Active row (added by hand, or the person on a row was changed) who has just been removed. |
| E9 | 5 Wellbeing → the person | `Your wellbeing assessment is ready to complete` | You've started a wellbeing assessment; please complete their part before you meet (15–20 minutes, can save and come back); link `?wbId=<id>`; only the two of you can see it. |
| E10 | 5 Wellbeing → you | `Wellbeing assessment submitted: <name>` | Arrange a private, hour-long conversation; link to the assessment. |
| E11 | 5 Wellbeing → the person | `Your wellbeing assessment record is ready` | Thanks for the conversation; the agreed record (arrangements, review date) is ready to view; link. |
| E12 | 1 Daily scheduler → you | `Wellbeing assessment due in 7 days: <name>` / `… due today: <name>` / `… overdue: <name>` | Changed in 1.4. The next wellbeing assessment for that person is due (or was due *n* days ago) on DD-MMM-YYYY, from **Settings → Team → Next wellbeing**. It is sent 7 days before, on the day, then every 7 days while overdue, for active people only. Links to the 1-to-1 page. |
| E13 | 6 Feedback → you | `1-to-1 feedback (<Fault / Improvement / Suggestion>): <first 60 characters>` | Who sent it (name and email), the type, the page and version, the time, and their message (HTML-escaped, line breaks kept). If it can't be sent you get `1-to-1 feedback could not be delivered – please read it in the list` instead, with no content, and the item shows in *Needs your attention*. More than 10 from one person in 24 hours are kept but not emailed one by one (*Held*); they show as one row in *Needs your attention*. |

## Solution 1.4 – amendment and appraisal emails; the challenge emails are retired

| # | Flow → to | Subject | Body (summary) |
|---|---|---|---|
| E16 | 8 Amendment notice → the person | `Your 1-to-1 for <Month yyyy> has been amended` | Your Team Leader has amended your 1-to-1 for **<Month yyyy>**; open it to see the current version. Link **Open my 1-to-1** (`?reviewId=<id>`). The change and its reason are recorded; speak to your Team Leader if you have a question. **It never contains the changed answers, the before/after values or the reason.** |
| E16-notice | 8 Amendment notice → you | `Amendment email not sent – please resend from the 1-to-1 page` | The E16 to <name> for <Month yyyy> couldn't be sent. *Needs your attention* lets you send it again (Resend). No content. |
| E17 | 1 Daily scheduler → you | `Appraisal due in 7 days: <name>` / `Appraisal due today: <name>` / `Appraisal overdue: <name>` | The appraisal for that person is due (or was due *n* days ago) on DD-MMM-YYYY, from **Settings → Team → Next appraisal**. When it's done, use *Mark appraisal completed*; to move it, change the date there. It is sent 7 days before, on the day, then every 7 days while overdue. |

E14 and E15 (challenges, Flow 7) are **no longer sent**: Flow 7 is not in solution 1.4 and is turned off and deleted during the upgrade (`MIGRATION_1_4.md`).

The exact HTML is in [`../04-solution/tools/flows.py`](../04-solution/tools/flows.py) (`flow_team`, `flow_wellbeing`, `flow_daily`, `flow_amendment`).
