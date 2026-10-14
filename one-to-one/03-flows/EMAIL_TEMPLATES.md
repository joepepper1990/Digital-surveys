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

## E2 — reminder on the 20th and 27th (Flow 1 → technician)

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
<p>Your Team Leader has completed your review.
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
Please speak to your Team Leader if this is unexpected.</p>
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
