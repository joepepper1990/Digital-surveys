# ESG 1-to-1 — Power Automate build sheets (v4)

> **v4.2 / solution 1.1:** Flow 1 now reads the reminder days from the `Reminders` item and emails the TL about wellbeing reviews due; Flows **4 Team members** and **5 Wellbeing** were added. They are in the importable solution and the legacy packages (no by-hand sheet) – see [`../04-solution/IMPORT_GUIDE.md`](../04-solution/IMPORT_GUIDE.md) and `tools/flows.py`. This sheet still describes Flows 1–3 as they were in 1.0, for reference.

> **Import instead of building.** These flows (plus a setup flow that creates the lists) are packaged as a ready-made solution: [`../04-solution/IMPORT_GUIDE.md`](../04-solution/IMPORT_GUIDE.md). The imported flows follow these sheets step for step, with two differences:
> - **IDs are looked up at run time.** The Owners group, Full Control, `1-to-1 Edit`, `1-to-1 Read` and the two list GUIDs are found by name in a `Get_owners_group` / `Get_role_definitions` / `Get_lists` → `Ids` step, so the `var…Id` variables below aren't needed.
> - **The site and the TL email are environment variables.**
>
> Use these sheets to understand the flows, or to build them by hand if you can't import.

### v4.1 hardening (in the imported flows; apply the same if building by hand)

Found in the verification pass. Each item has an automated test in `04-solution/tools/`.

| Where | Change | Why |
|---|---|---|
| All flows: every use of `ReviewItemId` (Flow 1 `Set_varReviewId_existing`, E2 link; Flow 3 SETPERM `_R`, `Set_review_status`, E4/E5 links) | Use the whole number: `int(first(split(string(<value>), '.')))` for ids, or the same without `int()` for links | SharePoint Number columns come back as doubles (`12.0`). Setting an integer variable fails, and `items(12.0)` is not a valid address. |
| Flow 1, compose before `Try` | `YearStart` = `if(greater(int(formatDateTime(outputs('ukNow'),'MM')),3), int(formatDateTime(outputs('ukNow'),'yyyy')), sub(int(formatDateTime(outputs('ukNow'),'yyyy')),1))`; `AppraisalYear` = `concat(string(outputs('YearStart')),'/',substring(string(add(outputs('YearStart'),1)),2,2))` | The appraisal year starts in April, as in the app |
| Flow 1, `My_expectations` | Also require `AppraisalYear` empty or equal to `outputs('AppraisalYear')` | Next year's expectations, entered early, must not leak into this year's reviews |
| Flow 1, `Tech_copy` | Add `rating` = `null` | Matches the shape the app writes back |
| Flow 1, `Create_review` → `AppraisalDate` | `if(contains(string(coalesce(x,'')),'T'), formatDateTime(convertFromUtc(coalesce(x,'2000-01-01T00:00:00Z'),'GMT Standard Time'),'yyyy-MM-dd'), if(empty(x), null, x))`, where `x` = `items('Each_technician')?['AppraisalDate']` | Keeps the same calendar day if SharePoint returns the date as a UTC instant in summer time |
| Flows 2 and 3, triggers; Flow 1 `My_expectations`, `Snapshot`, `Tech_copy`, `Outstanding_linked` | **Secure inputs and outputs** on | The trigger output is the whole review or feedback record |
| Flow 3, first steps in `Try` | **Get items** `Get_current` (Manager Reviews, `ID eq <trigger ID>`, top 1). If `ReleasedOn` is not empty, **Terminate – Cancelled**. | A second, stale trigger can't release or email twice |
| Flow 3, `_R` block and `Set_review_status` | Only if `ReviewItemId` is not null. The E5 link then falls back to the page. | Closing a Manager Review whose Monthly Review was never created still releases and emails |
| Flows 2 and 3, trigger settings | **Concurrency control off** (not 1) | Microsoft: with concurrency on, triggers that arrive while the waiting-runs limit is met may be dropped. Each run handles one item and is safe to repeat (Flow 2 re-reads the Manager Review; Flow 3 re-reads `ReleasedOn`). |
| Flow 1, `Get_profile` | User = `last(split(items('Each_technician')?['Technician']?['Claims'], '|'))` (the UPN), not the email | Get user profile (V2) takes a UPN or object id; email and UPN can differ |
| Flow 1, `Get_technicians`, `Outstanding` | Top Count `5000` | Get items returns 100 rows by default |
| All flows, error handling | A "log on success / warn on failure" pair must be followed by a step that runs after both with *Succeeded, Skipped*. A tolerant step must never run after *Skipped*. | Logic Apps scores a branch that ends in a Skipped step by the step before it, so otherwise a handled failure fails the run, or a real failure is hidden |

Three flows, standard connectors only (SharePoint, Office 365 Outlook, Office 365 Users). Build them **in the TL's own account**. They run as the TL, which is how they can set item permissions.

| Flow | Trigger | Job |
|---|---|---|
| 1 `1-to-1 \| Daily scheduler` | Recurrence, 07:00 UK daily | Creates each month's records, makes them private, emails links and reminders |
| 2 `1-to-1 \| Review submitted` | Monthly Reviews created/modified | Locks a submitted review, stamps the trusted record, emails the TL |
| 3 `1-to-1 \| Manager decision` | Manager Reviews created/modified | Validates Completed/Closed, locks the review, **releases** the feedback, emails the technician |

**v4 changes from plan v3.2 (marked 🆕):**

- Flow 1 copies `AppraisalDate` from Technicians onto each new Monthly Review.
- Flow 1 creates Manager Reviews with `ActionsJson` = `[]` and `ExpectationFeedbackJson` = `[]`.
- Dates in emails use the DD-MMM-YYYY style (`dddd dd-MMM-yyyy`).
- E3 detects the dedicated 1-to-1 request with `startsWith`, so the trailing full stop in the choice value doesn't matter.

Nothing else changes. The frontend writes the new v4 columns directly, and the flows never read them.

> Placeholders in angle brackets (`<Site URL>`, `<TL email>`) are filled in **only inside Power Automate**. Never commit real values to the repository.

---

## 0. Before you build: settings for every action

Do these on every flow:

- [ ] **Secure inputs and Secure outputs**: turn both **On** for every *Get items*, *Create item*, *Update item*, *Send an HTTP request to SharePoint* and *Send an email* action (⋯ → Settings). This keeps answers out of the run history.
- [ ] Trigger **Concurrency control**: Flow 1 (Recurrence) On, degree **1**; Flows 2 and 3 (SharePoint) **Off** (v4.1).
- [ ] Rename every action exactly as written below. Expressions refer to actions by name.
- [ ] Connection references: one SharePoint connection, one Outlook connection, one Office 365 Users connection, all as the TL.

### 0.1 Configuration variables (top of every flow)

**Initialize variable**, one action each:

| Name | Type | Value | Used in |
|---|---|---|---|
| varManagerEmail | String | `<TL email>` | 1, 2, 3 |
| varPageLink | String | `<Site URL>/SitePages/OneToOne.aspx` | 1, 2, 3 |
| varOwnersId | Integer | Owners group ID (CONFIG_REFERENCE §1) | 1, 2, 3 |
| varFullControlId | Integer | `1073741829` (check: CONFIG_REFERENCE §1) | 1, 2, 3 |
| varEditId | Integer | `1-to-1 Edit` role ID | 1 |
| varReadId | Integer | `1-to-1 Read` role ID | 2, 3 |

### 0.2 `Ensure_user` (resolves the technician's SharePoint ID)

*Send an HTTP request to SharePoint*:

| Setting | Value |
|---|---|
| Site Address | the 1-to-1 site |
| Method | POST |
| Uri | `_api/web/ensureuser` |
| Headers | `Accept` = `application/json;odata=nometadata` · `Content-Type` = `application/json;odata=nometadata` |
| Body | `{"logonName":"@{<Claims expression given in each flow>}"}` |

The principal ID is then `body('Ensure_user')?['Id']`.

### 0.3 `SETPERM` block (four HTTP actions, in this order)

Every action is *Send an HTTP request to SharePoint*: Method **POST**, Header `Accept` = `application/json;odata=nometadata`. Add a suffix where a flow uses the block twice, e.g. `Reset_R`, `Reset_M`.

| # | Name | Uri |
|---|---|---|
| 1 | `Reset` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/resetroleinheritance` |
| 2 | `Break` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)` |
| 3 | `AddOwners` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/roleassignments/addroleassignment(principalid=@{variables('varOwnersId')},roledefid=@{variables('varFullControlId')})` |
| 4 | `AddTech` | `_api/web/lists/getbytitle('<LIST>')/items(<ITEM-ID>)/roleassignments/addroleassignment(principalid=@{body('Ensure_user')?['Id']},roledefid=<ROLE-ID>)` |

`<LIST>` is `Monthly Reviews` or `Manager Reviews`. If you get *400 Bad Request*, write the space as `%20`.

> **Why Reset then Break:** the item always ends up with exactly two permission entries, Owners plus this technician, whatever happened to it before. Running the block twice gives the same result.

### 0.4 `Try` / `Catch` (every flow)

1. Put **all** work in a **Scope** named `Try`.
2. Add a **Scope** named `Catch`, with *Configure run after* = `Try` **has failed** and **has timed out** (untick *is successful*).
3. Inside `Catch`:
   1. **Send an email (V2)** to `varManagerEmail`.
      - Subject: `1-to-1 system: action needed (<flow name>)`
      - Body: the run link

        ```
        concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])
        ```
   2. **Terminate**, Status **Failed**.

---

## Flow 1 — `1-to-1 | Daily scheduler`

### Trigger

**Recurrence:**

| Setting | Value |
|---|---|
| Interval / Frequency | 1 Day |
| Time zone | (UTC+00:00) Dublin, Edinburgh, Lisbon, London |
| At these hours / minutes | 7 / 0 |
| Concurrency | On, 1 |

### Variables

The §0.1 set (without varReadId), plus:

| Name | Type | Value |
|---|---|---|
| `varTestDate` | String | **empty in production** (for testing, e.g. `2026-11-20T07:00:00`) |
| `varProblems` | Array | — |
| `varTechAad` | String | — |
| `varReviewId` | Integer | — |

### Compose actions (before `Try`)

| Name | Expression |
|---|---|
| `ukNow` | `if(empty(variables('varTestDate')), convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-ddTHH:mm:ss'), variables('varTestDate'))` |
| `MonthKey` | `formatDateTime(outputs('ukNow'), 'yyyy-MM')` |
| `LastDay` | `formatDateTime(addDays(addToTime(startOfMonth(outputs('ukNow')), 1, 'Month'), -1), 'yyyy-MM-dd')` |
| `DueUtc` | `convertToUtc(concat(outputs('LastDay'), 'T23:59:59'), 'GMT Standard Time')` |
| `DeadlineText` 🆕 | `concat('23:59 on ', formatDateTime(outputs('LastDay'), 'dddd dd-MMM-yyyy'))` → `23:59 on Monday 30-Nov-2026` |
| `MonthName` | `formatDateTime(outputs('ukNow'), 'MMMM yyyy')` |
| `Day` | `dayOfMonth(outputs('ukNow'))` |

### Scope `Try`

1. **Get items** `Get_technicians`: List **Technicians**, Filter Query `Active eq 1`.
2. **Get items** `Get_expectations`: List **Appraisal Expectations**, Filter Query `Active eq 1`, Order By `SortOrder asc`, Top Count `500`.
3. **Apply to each** `Each_technician` over `body('Get_technicians')?['value']`. Settings → Concurrency **On, 1**.
   - **Scope `TechTry`:**
     1. **Set variable** `varTechAad` = `toLower(coalesce(items('Each_technician')?['TechnicianAadId'], ''))`
     2. **Condition** `No_AadId`: `variables('varTechAad')` *is equal to* (leave blank).
        - **True:**
          1. **Get user profile (V2)** `Get_profile`: User = `items('Each_technician')?['Technician']?['Email']`
          2. **Update item** (Technicians):
             - Id = `items('Each_technician')?['ID']`
             - Title = `items('Each_technician')?['Title']`
             - TechnicianAadId = `toLower(body('Get_profile')?['id'])`
          3. **Set variable** `varTechAad` = `toLower(body('Get_profile')?['id'])`
     3. **Compose** `ReviewKey` = `concat(variables('varTechAad'), '_', outputs('MonthKey'))`
     4. **Get items** `Find_mgr` (Manager Reviews): Filter `ReviewKey eq '@{outputs('ReviewKey')}'`, Top Count `1`.
     5. **Condition** `Mgr_missing`: `length(body('Find_mgr')?['value'])` *is equal to* `0`.
        - **True:**
          1. **Filter array** `My_expectations`. From = `body('Get_expectations')?['value']`. Advanced mode:

             ```
             @or(equals(item()?['AppliesTo']?['Value'], 'Shared'), equals(toLower(coalesce(item()?['Technician']?['Email'], '')), toLower(items('Each_technician')?['Technician']?['Email'])))
             ```

          2. **Condition** `Too_many`: `length(body('My_expectations'))` *is greater than* `10`.
             - **True:** **Append to array variable** `varProblems`:

               `concat(items('Each_technician')?['Title'], ': more than 10 active expectations – only the first 10 by SortOrder were used.')`
          3. **Select** `Snapshot`. From = `take(body('My_expectations'), 10)`. Map:

             | Key | Value |
             |---|---|
             | `id` | `item()?['ID']` |
             | `title` | `item()?['Title']` |
             | `measures` | `item()?['Measures']` |
             | `year` | `item()?['AppraisalYear']` |

          4. **Create item** (Manager Reviews):

             | Field | Value |
             |---|---|
             | Title | `concat(items('Each_technician')?['Title'], ' – ', outputs('MonthKey'))` |
             | ReviewKey | `outputs('ReviewKey')` |
             | Technician Claims | `items('Each_technician')?['Technician']?['Claims']` |
             | TechnicianAadId | `variables('varTechAad')` |
             | MonthKey | `outputs('MonthKey')` |
             | DueDate | `outputs('DueUtc')` |
             | ReviewState Value | `Open` |
             | ActionsStatus Value | `None` |
             | ExpectationSnapshotJson | `string(body('Snapshot'))` |
             | ExpectationFeedbackJson 🆕 | `[]` |
             | ActionsJson 🆕 | `[]` |

     6. **Get items** `Get_mgr` (Manager Reviews): same filter as `Find_mgr`, Top Count `1`.

        **Compose** `Mgr` = `first(body('Get_mgr')?['value'])`
     7. **Condition** `Review_missing`. Advanced mode: `@equals(outputs('Mgr')?['ReviewItemId'], null)`
        - **True:**
          1. **Select** `Tech_copy`. From = `json(coalesce(outputs('Mgr')?['ExpectationSnapshotJson'], '[]'))`. Map:

             | Key | Value |
             |---|---|
             | `id` | `item()?['id']` |
             | `title` | `item()?['title']` |
             | `measures` | `item()?['measures']` |
             | `year` | `item()?['year']` |
             | `rating` | `null` (as an expression) |
             | `comment` | (empty string) |

          2. **Create item** `Create_review` (Monthly Reviews). It inherits the manager-only list permissions, so it's private from the moment it's created.

             | Field | Value |
             |---|---|
             | Title | `outputs('Mgr')?['Title']` |
             | Technician Claims | `outputs('Mgr')?['Technician']?['Claims']` |
             | MonthKey | `outputs('Mgr')?['MonthKey']` |
             | MonthStart | `concat(outputs('Mgr')?['MonthKey'], '-01')` |
             | DueDate | `outputs('Mgr')?['DueDate']` |
             | ReviewStatus Value | `Not Started` |
             | ExpectationsJson | `string(body('Tech_copy'))` |
             | AppraisalDate 🆕 | `items('Each_technician')?['AppraisalDate']` (leave blank if empty — the expression returns null) |

          3. **Update item** (Manager Reviews):
             - Id = `outputs('Mgr')?['ID']`
             - Title = `outputs('Mgr')?['Title']`
             - ReviewItemId = `body('Create_review')?['ID']`
          4. **Set variable** `varReviewId` = `body('Create_review')?['ID']`
        - **False:** **Set variable** `varReviewId` = `outputs('Mgr')?['ReviewItemId']`
     8. **Condition** `Needs_link`. Advanced mode:

        ```
        @and(equals(outputs('Mgr')?['ReviewState']?['Value'], 'Open'), empty(outputs('Mgr')?['LinkSentOn']))
        ```

        - **True:**
          1. `Ensure_user` (§0.2), Claims = `outputs('Mgr')?['Technician']?['Claims']`
          2. **SETPERM** (§0.3): LIST `Monthly Reviews`, ITEM-ID `@{variables('varReviewId')}`, ROLE-ID `@{variables('varEditId')}`
          3. **Send an email (V2)**: **E1** to `outputs('Mgr')?['Technician']?['Email']`
          4. **Update item** (Manager Reviews):
             - Id = `outputs('Mgr')?['ID']`
             - Title = `outputs('Mgr')?['Title']`
             - LinkSentOn = `utcNow()`
   - **Scope `TechCatch`**, *run after* `TechTry` **has failed / has timed out**. **Append to array variable** `varProblems`:

     `concat('FAILED for ', items('Each_technician')?['Title'], ' – no email was sent. Open the run history for details.')`
4. **Condition** `Reminder_day`. Advanced mode: `@or(equals(outputs('Day'), 20), equals(outputs('Day'), 27))`
   - **True:**
     1. **Get items** `Outstanding` (Manager Reviews). Filter:

        ```
        MonthKey eq '@{outputs('MonthKey')}' and ReviewState eq 'Open' and LinkSentOn ne null
        ```

     2. **Apply to each** `Each_outstanding` over its value: **E2** to `items('Each_outstanding')?['Technician']?['Email']`.
5. **Condition** `Any_problems`: `length(variables('varProblems'))` *is greater than* `0`.
   - **True:** **E7** to `varManagerEmail`.

### Scope `Catch`

As §0.4.

### Why it can't duplicate

- `Find_mgr` checks for an existing record first.
- The unique `ReviewKey` on the manager-only list makes SharePoint refuse a second record.
- `LinkSentOn` means one link email per review.
- A failed run heals itself the next morning, completing only the missing steps.

---

## Flow 2 — `1-to-1 | Review submitted`

### Trigger

**When an item is created or modified**, list **Monthly Reviews**.

| Setting | Value |
|---|---|
| Trigger condition | `@not(contains(createArray('Not Started','Draft'), triggerBody()?['ReviewStatus']?['Value']))` |
| Concurrency | **Off** (v4.1 – see the hardening table) |

Deliberately there is **no "Modified By" condition**. Every column on this list is treated as untrusted.

> **v4 note:** when the TL saves ⚙ Settings, the app writes `AppraisalDate` onto the technician's current Monthly Review.
> - If that review is already submitted, Flow 2 runs once, re-applies Read and changes nothing else. That's expected.
> - If it's Draft or Not Started, the trigger condition is false and nothing runs.

### Variables

varManagerEmail, varPageLink, varOwnersId, varFullControlId, varReadId.

### Scope `Try`

1. **Get items** `Find_mgr` (Manager Reviews): Filter `ReviewItemId eq @{triggerBody()?['ID']}`, Top Count `1`.
2. **Condition** `Unknown_item`: `length(body('Find_mgr')?['value'])` *is equal to* `0`.
   - **True:** **Terminate**, Status **Cancelled**.
3. **Compose** `Mgr` = `first(body('Find_mgr')?['value'])`
4. **Compose** `PrevState` = `outputs('Mgr')?['ReviewState']?['Value']`
5. `Ensure_user`, Claims = `outputs('Mgr')?['Technician']?['Claims']`. Identity always comes from the trusted record.
6. **SETPERM**: LIST `Monthly Reviews`, ITEM-ID `@{triggerBody()?['ID']}`, ROLE-ID `@{variables('varReadId')}`. **The review is now read-only to the technician.**
7. **Condition** `First_submission`: `outputs('PrevState')` *is equal to* `Open`.
   - **True:**
     1. **Update item** (Manager Reviews), Id = `outputs('Mgr')?['ID']`:

        | Field | Value |
        |---|---|
        | Title | `outputs('Mgr')?['Title']` |
        | ReviewState Value | `Submitted` |
        | SubmittedOn | `utcNow()` |
        | SubmittedLate | `greater(ticks(utcNow()), ticks(outputs('Mgr')?['DueDate']))` |
        | TechFollowUp | `coalesce(triggerBody()?['Q9FollowUp']?['Value'], '')` |

     2. **E3** to `varManagerEmail`.
8. **Compose** `Desired` = `if(equals(outputs('PrevState'), 'Open'), 'Submitted', outputs('PrevState'))`
9. **Condition** `Status_differs`: `triggerBody()?['ReviewStatus']?['Value']` *is not equal to* `outputs('Desired')`.
   - **True:** **Update item** (Monthly Reviews):
     - Id = `triggerBody()?['ID']`
     - Title = `outputs('Mgr')?['Title']`
     - ReviewStatus Value = `outputs('Desired')`

### Scope `Catch`

As §0.4. Subject: `concat('Submission received but LOCK FAILED – check Monthly Review ', triggerBody()?['ID'])`.

---

## Flow 3 — `1-to-1 | Manager decision`

### Trigger

**When an item is created or modified**, list **Manager Reviews**. This list is manager-only, so it can be trusted.

Trigger conditions (two lines, both must be true):

```
@contains(createArray('Completed','Closed - Not Submitted'), triggerBody()?['ReviewState']?['Value'])
@empty(triggerBody()?['ReleasedOn'])
```

Concurrency: **Off** (v4.1 – see the hardening table).

> **v4 note:** after release, `ReleasedOn` is set. Later edits by the TL (closing actions, correcting feedback) don't re-trigger this flow. They are visible to the technician straight away, and the app warns the TL about this.

### Variables

varManagerEmail, varPageLink, varOwnersId, varFullControlId, varReadId.

### Scope `Try`

1. **Compose** `Cmd` = `triggerBody()?['ReviewState']?['Value']`
2. **Condition** `Valid`. Advanced mode:

   ```
   @or(and(equals(outputs('Cmd'),'Completed'), not(empty(triggerBody()?['SubmittedOn']))), and(equals(outputs('Cmd'),'Closed - Not Submitted'), empty(triggerBody()?['SubmittedOn']), less(ticks(triggerBody()?['DueDate']), ticks(utcNow()))))
   ```

   - **False:**
     1. **Update item** (Manager Reviews):
        - Id = trigger ID
        - Title = trigger Title
        - ReviewState Value = `if(empty(triggerBody()?['SubmittedOn']), 'Open', 'Submitted')`
     2. **Send an email (V2)** to `varManagerEmail`.
        - Subject: `1-to-1: not done`
        - Body: `You can only complete a submitted review, and only close one that hasn't been submitted after its deadline. (@{triggerBody()?['Title']})`
     3. **Terminate**, **Cancelled**.
3. `Ensure_user`, Claims = `triggerBody()?['Technician']?['Claims']`
4. **SETPERM**, suffix `_R`: LIST `Monthly Reviews`, ITEM-ID `@{triggerBody()?['ReviewItemId']}`, ROLE-ID `@{variables('varReadId')}`. Locks the review.
5. **SETPERM**, suffix `_M`: LIST `Manager Reviews`, ITEM-ID `@{triggerBody()?['ID']}`, ROLE-ID `@{variables('varReadId')}`. **This releases the feedback, the TL ratings and the actions to the technician.**
6. **Update item** (Manager Reviews), Id = trigger ID:

   | Field | Value |
   |---|---|
   | Title | trigger Title |
   | ReleasedOn | `utcNow()` |
   | CompletedOn | `utcNow()` |
   | CompletedBy | `triggerBody()?['Editor']?['Email']` |

7. **Update item** (Monthly Reviews):
   - Id = `triggerBody()?['ReviewItemId']`
   - Title = trigger Title
   - ReviewStatus Value = `outputs('Cmd')`
8. **Condition** `Was_completed`: `outputs('Cmd')` *is equal to* `Completed`.
   - **True:** **E4** to `triggerBody()?['Technician']?['Email']`
   - **False:** **E5** to the same address.

### Scope `Catch`

As §0.4.

---

## Build checks (tick before going live)

- [ ] Secure inputs/outputs on every data and email action (open a test run: the inputs show *"Content not shown due to security configuration"*).
- [ ] Flow 1's trigger has concurrency 1; Flows 2 and 3 have concurrency control off.
- [ ] `varTestDate` is **empty** in Flow 1.
- [ ] Every flow has `Try` and `Catch`, and `Catch` runs after *has failed* and *has timed out* only.
- [ ] Flow 1 test run creates one Manager Review and one Monthly Review per active technician. Running it again creates nothing new.
- [ ] Monthly Review → Manage access shows **Owners** and **the technician (1-to-1 Edit)** only.
- [ ] After Submit: the technician shows as **1-to-1 Read** on the Monthly Review, and the Manager Review shows Submitted plus SubmittedOn.
- [ ] After Complete: the Manager Review gives the technician **1-to-1 Read**, ReleasedOn is set, and the technician gets E4.
