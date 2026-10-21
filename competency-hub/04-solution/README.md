# ESG Competency Hub – Power Automate solution

`ESGCompetencyHub_1_0_0_0_unmanaged.zip` is the solution to import into Power Automate (plan K7.3). It holds:

| Part | Name |
|---|---|
| Flow | **ESG Competency Hub \| 2 Request queue** – ships **Off**; turn it on after import |
| Connection reference | `esghub_sharedsharepointonline_hub` – ESG Competency Hub SharePoint |
| Environment variable | `esghub_CompetencyHubSiteUrl` – ESG Competency Hub Site URL (no trailing slash) |
| Publisher | ESG Competency Hub, prefix `esghub` (its own, so nothing clashes with the ESG 1-to-1 solution in the same environment) |

`schema/schema.json` is the single description of the lists. Setup builds the site from it, and the flow tools check every
column the flow uses against it.

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
