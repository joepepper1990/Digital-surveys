# Solution 1.5.0.1 – repair: "1 Daily scheduler" wouldn't turn on

**Package:** `04-solution/ESGOneToOne_1_5_0_1_unmanaged.zip`.
It replaces `ESGOneToOne_1_5_0_0_unmanaged.zip`, which is kept unchanged for the record. Don't import 1.5.0.0 again.

**Page:** unchanged, still **5.1.0**. Nothing to upload.

## The problem

When 1.5.0.0 was imported, Power Automate refused to turn on **ESG 1-to-1 | 1 Daily scheduler**:

> TemplateValidationError: actions S_Key, S_Has_id, S_Find, S_Not_yet, Notice_item, Create_notice, Recheck_notice and Notice_missing are nested at level 9, exceeding the maximum nesting limit of 8.

Power Automate allows an action to sit at most 8 levels deep (inside scopes, loops and conditions). The action-tracker steps added to Flow 1 in 1.5 went as deep as level 11.

## What 1.5.0.1 changes

**Only Flow 1's structure.** Its behaviour is unchanged, and so is everything else:

- the same flows, with the same IDs and names;
- the same connectors, connection references and environment variables;
- the same triggers;
- the same lists and columns, so Setup has nothing new to do;
- no data is touched.

**The changes:**

- **The always-true "Action tracker" wrapper is gone.** Its try and catch now sit directly in the main *Try*, with the same order and the same error report:
  - the tracker work runs after *Reconcile_submissions*;
  - *Any_problems* (the E7 email) runs after it whether it finished or its failure was noted, as before.
- **A redundant one-step wrapper around each review's sync is gone.** A review that can't be added is still reported by name, and the others still go ahead.
- **Two "condition → stop" pairs are now a single step each.** They still fail with the same message when an action or a reminder really couldn't be created:
  - *An agreed action could not be added to the tracker.* (Flow 1, and Flow 3 at release.)
  - *A deadline reminder could not be queued.*

**Maximum nesting level per flow** (Power Automate allows 8):

| Flow | 1.5.0.0 | 1.5.0.1 |
|---|---|---|
| 0 Setup (run once) | 4 | 4 |
| 1 Daily scheduler | **11 ✗** | **8 ✓** |
| 2 Review submitted | 2 | 2 |
| 3 Manager decision | 7 | 6 |
| 4 Team members | 3 | 3 |
| 5 Wellbeing | 4 | 4 |
| 6 Feedback | 2 | 2 |
| 8 Amendment notice | 2 | 2 |
| 9 Action access | 3 | 3 |
| 10 Action update | 5 | 5 |
| 11 Action notice | 3 | 3 |

**The build now checks nesting.** Every build fails if any action in any flow is deeper than 8 levels, or if a flow has more than 500 actions. The check covers the solution, the packed zip itself and the legacy packages. Run on the 1.5.0.0 package, it reports exactly the actions Power Automate named.

## Upgrade steps

Each step needs approval to change the live environment.

### A. You imported 1.5.0.0, and Flow 1 wouldn't turn on (or is Off)

1. Keep a copy of the current page files, as usual. They don't change.
2. **Power Automate → Solutions → Import solution → Browse →** `ESGOneToOne_1_5_0_1_unmanaged.zip` **→ Next.**
   - It says it will **upgrade** *ESG 1-to-1*.
   - Keep the defaults, and leave *"Enable Plugin steps and flows included in the solution"* **unticked**.
   - Connections and environment variables keep their current values; click **Next / Import**.
3. Wait for *"imported successfully"*.
4. **Solutions → ESG 1-to-1 → ESG 1-to-1 | 1 Daily scheduler → Turn on.** It should turn on without any error.
5. Check that flows **2, 3, 4, 5, 6, 8, 9, 10 and 11** are still **On**. An upgrade normally keeps their state; turn on any that show Off, in that order.
6. *(Optional, recommended.)* Open **1 Daily scheduler → Run → Run flow** once. The run should show **Succeeded**. Running it twice on the same day creates nothing twice.
7. Carry on with the checks in `../MIGRATION_1_5.md` (T1–T16).

You **don't** need to run **0 Setup** again: nothing in the lists changed. Running it is harmless if you want to.

### B. You haven't imported 1.5 yet

Follow `../MIGRATION_1_5.md` exactly, using `ESGOneToOne_1_5_0_1_unmanaged.zip` wherever it says the 1.5 zip.

### Going back

As in `../MIGRATION_1_5.md`: re-import `ESGOneToOne_1_4_0_0_unmanaged.zip` and the 5.0.0 page. Don't go back to 1.5.0.0: its Flow 1 can't be turned on.

## Proven locally (no tenant)

- **Simulations:** 298 / 298, for both the solution and the legacy form. These include new checks of the restructured paths:
  - a reminder that can't be queued is reported in E7, while the review sync and the retries still run, and it is caught up the next day;
  - an action that can't be created fails only its review, which is reported by name and finished on the next run.
- **Validator:** 42 / 42 deliberate mistakes caught, including four new ones: too deep in a scope, too deep in an else branch, too deep in a Switch case, and over 500 actions.
- **The package check:**
  - the zip's flows are byte-for-byte the validated source;
  - same flow IDs, connection references, environment variables and triggers as 1.5.0.0;
  - the 1.5.0.0 zip is unchanged.

## Still to confirm in the tenant

- Flow 1 turns on without a `TemplateValidationError`, and so do flows 3 and 9–11 (T1).
- One real Flow 1 run succeeds: reviews created or untouched, reminders, E20 queued, and E7 only if there's a real problem.
- The rest of T2–T16 in `../MIGRATION_1_5.md`.
