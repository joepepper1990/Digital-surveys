# Critical review of the 1-to-1 implementation plan (v1 → v2)

**Scope:** a final review of `IMPLEMENTATION_PLAN.md` v1, before any build.

> **Later change (v3):** the canvas app was replaced by a custom frontend in the Welcome by Accelerator 365 web part. The security findings below all still apply. Sections 5 (licensing) and 6 (non-member access) describe the **canvas app** and are superseded by the plan's *Changes in v3*, D.6 and J (IT-10 to IT-13).
**Outcome:** the architecture is kept, which means a private SharePoint site, one canvas app and Power Automate with standard connectors. Inside it, **six security defects are fixed** and **the build is reduced by about a quarter.** The plan has been rewritten as v2.

**How this review was done.** No Microsoft 365 tenant is available to this review, so nothing here has been executed. The bypass analysis (section 4) is a line-by-line threat analysis of v1's design. Every conclusion is turned into a **concrete test that must be run in the tenant** (v2 section H, tests P1–P14). Assumptions that only the tenant can confirm go into a **1–2 hour proof test before the build** (v2 Stage 0). Nothing here should be treated as proven until those tests pass.

---

## 1. Summary of verdict

| Area | v1 | v2 |
|---|---|---|
| Lists | 5 | **4** (Agreed Actions is folded into Manager Reviews) |
| Flows | 3 (Flow 3 had a 3-way switch plus reopen and unrelease logic) | **3**, with Flow 3 reduced to one path |
| App screens | 4 | **3** (technician history becomes a month picker) |
| HTTP calls per permission change | 5 lookups + 5 permission and verification calls + filters | **4** (role and group IDs are recorded once as configuration) |
| Custom permission levels | 1 | **2** (adds a Read level that can't see version history; this is a security fix) |
| Tamper-proof workflow state | **No.** It was stored on the item the technician can edit. | **Yes.** It's held only on the manager-only record. |
| Estimated hands-on effort | 35–45 h | **28–36 h** |

---

## 2. Security defects found in v1 (all fixed in v2)

These are genuine defects, not theoretical ones. In v1, each could be done by a technician with no special skill beyond calling the SharePoint REST API. A technician can do that from their own Power Automate flow, using the same standard "Send an HTTP request to SharePoint" action.

| # | Defect in v1 | How it could be exploited | v2 fix |
|---|---|---|---|
| **S1** | Workflow and control fields were stored on the **Monthly Review item, which the technician can edit while it's a draft**. These were `DueDate`, `ReviewKey`, `Technician`, `TechnicianAadId`, `LinkSentOn`, `IsOverdue`, `SubmittedLate` and the expectation snapshot. SharePoint has no column-level security, so "the app doesn't show it" protects nothing. | A technician could:<br>(a) push their own `DueDate` forward, so a late submission wasn't flagged late;<br>(b) **rewrite the title and measures of their own appraisal expectations**, corrupting the appraisal record;<br>(c) change `Technician` to a colleague, causing Flow 2 to **grant that colleague access** to the item;<br>(d) clear `LinkSentOn` to make Flow 1 re-grant edit rights. | **Manager Reviews becomes the authoritative record.** Identity, due date, state, submission timestamps, the link-sent marker and the expectation snapshot live there, and only the TL can write to it. The Monthly Review item holds only the technician's answers plus display copies. **No flow ever reads a technician-editable field to decide who gets access, what the state is, or whether something is late.** |
| **S2** | The duplicate guard (`ReviewKey` with *Enforce unique values*) was on the technician-editable list. | A technician could set their draft's `ReviewKey` to another technician's **next month's** key. Next month, creating that colleague's review would fail on the uniqueness rule. Flow 1 would also find the squatted item, treat it as the colleague's, and grant the colleague access to it. The result was denial of service and a cross-user mix-up. | The unique `ReviewKey` lives only on Manager Reviews. The two items are linked by **`ReviewItemId`**, the SharePoint item ID, which no user can change. |
| **S3** | When feedback was released, the technician got the built-in **Read** level, which includes **View Versions**. | The technician opens version history on their Manager Review and reads **every earlier draft of the TL's comments**, including wording the TL deliberately changed before completing. That breaks "manager comments remain unpublished until completion". | A second custom level, **`1-to-1 Read`**, is Read without View Versions. It's used for every technician Read grant. |
| **S4** | The submission lock (Flow 2) only ran when *Modified By* ≠ the TL. *Modified By* can sometimes be set through the `validateUpdateListItem` API. | If that forging works in the tenant, a technician could mark a review Submitted with *Modified By* set to the TL. The lock would never be applied, and they could keep editing a "submitted" review. | Flow 2 no longer looks at *Modified By*. It's **idempotent**: on every non-draft change it re-applies Read and only updates the item if the status actually needs correcting, so it settles after at most one extra run. Test P9 checks whether forging is even possible. |
| **S5** | Emails to the TL included `Title` from the technician-editable item. | The technician could put arbitrary text or a link in the subject of an email that appears to come from the system. This is low impact, but unnecessary. | Emails use only fields from Manager Reviews and fixed wording. Technician input is never placed in email text. |
| **S6** | Before their first release, a technician has **no access at all** to the Manager Reviews list, not even Limited Access. v1's app did a plain `LookUp` on it. | No security impact, but technicians would likely see a red error banner on every load in their first month. | Every technician-side read of Manager Reviews is wrapped in `IfError(..., Blank())`. Stage 0 confirms there's no banner. |

None of these defects exposed another technician's answers. Item-level permissions held throughout. They did allow tampering with the integrity of a technician's own record and the appraisal record, two cross-user effects (S1c and S2), and a disclosure of manager drafts (S3). All of these count as release blockers under the agreed criteria.

---

## 3. Complexity removed

| Removed or simplified | Why it's safe to remove | Effect |
|---|---|---|
| **Agreed Actions list**, plus its gallery, add-row form and summary concatenation | For 5–10 technicians, actions are a few lines per month. v2 uses three fields on Manager Reviews: `AgreedActions` (text, one action per line with its due date), `ActionsDueBy` (date) and `ActionsStatus` (None / Open / Done). The technician sees the actions once feedback is released. The dashboard shows "open actions" and an **Outstanding Actions** filter. **This meets the requirement for actions with deadlines and an outstanding-actions view.** | One fewer list, about 2 h less build, and no extra permission scopes |
| **Reopen** command, the `UNRELEASE` block, `ProcessedStatus` and the reopen email | Not in the original requirements. The requirement was a *minimal, auditable correction process*. v2's process is that the TL, as owner, **edits the item directly in SharePoint** at the technician's request and writes a one-line reason in `CorrectionLog`. SharePoint version history records who changed what and when. | Flow 3 drops from 3 branches to 1 path. One permission routine and one email template go. |
| **`IsOverdue` column and the daily overdue update loop** | "Overdue" is just *state is Open and the due date has passed*. The app calculates it live, and the SharePoint view uses `[Today]`. A stored flag adds writes and can go stale. | One loop and one column less |
| **`LOOKUPS` scope** (5 HTTP calls per run) | Role-definition and Owners-group IDs never change once created. You read them once in a browser during deployment and paste them as configuration values. | 5 fewer calls per run, and simpler flows |
| **Permission verification scope** (GET, two Filter arrays, a condition and a forced failure) | v2 builds item permissions **by construction**: reset, break with nothing copied, then add exactly Owners and one technician. There is nothing else to detect. Any failed call stops the flow **before** the email. Drift of the Owners group itself, the only real residual risk, isn't something an item check can catch, so it moves to a quarterly 2-minute check. | Simpler flows, with no loss of protection |
| **Technician history screen** | A month picker at the top of the technician screen lists the technician's own reviews. | One screen less, and fewer clicks |
| **Named formulas that reference controls** (`nfAnswers`, `nfMissing`, `nfFeedback`) | Whether Power Apps accepts these isn't certain, and they're hard for a beginner to debug. v2 uses one Save button (Submit sets a flag and calls it), plus a visible **"Still to complete"** label for validation. | Removes a build risk and gives the technician better guidance |
| **`User().EntraObjectId` in the app and its filtering** | Permissions already mean a technician can only see their own items, so app-side filtering added nothing. | Removes a dependency |
| Monthly Reviews columns `ReviewKey`, `TechnicianAadId`, `IsOverdue`, `SubmittedOn`, `SubmittedLate`, `CompletedOn` and `LinkSentOn` | They move to Manager Reviews or are deleted. They aren't trustworthy on a technician-editable item anyway. | 7 fewer columns to create |

**Kept, and why it can't safely be cut:**

- **Technicians list.** It's the roster for monthly creation and the source of the stable identity (Entra object ID). A SharePoint group would need extra HTTP calls to read.
- **Appraisal Expectations list.** It's the master list for shared and individual expectations.
- **Monthly Reviews and Manager Reviews as two separate lists.** This is the minimum SharePoint allows, because there's no column-level security. Anything the technician can edit while drafting must live separately from anything they mustn't see or change.
- **Three flows.** Each runs on a different trigger: the schedule, a technician action, and a TL action. They can't be merged without either polling or giving technicians a way to invoke a privileged flow.
- **No instant (button) flows called from the app.** These would accept parameters supplied by the caller and need caller validation. Automated triggers only fire on changes SharePoint has already authorised.
- **The expectation snapshot is stored twice.** The technician's copy carries their ratings. The authoritative copy on Manager Reviews is what the TL and the history see. It costs one column, and it is the only way to stop a technician rewriting their own expectations.

---

## 4. Bypass analysis: technician using SharePoint UI, REST or their own flow against v2

The attacker in each case is Technician A, holding `1-to-1 Edit` on their own open review and nothing else. Each row is checked by a privacy test in v2 section H.

| # | Attempt | v2 outcome | Why | Test |
|---|---|---|---|---|
| A1 | Read B's review via the app (`reviewId=`), DispForm.aspx, list view, REST or search | **Denied / not returned** | No permission on B's item. Search is security-trimmed and the lists are excluded from search. | P1, P2 |
| A2 | Edit or delete B's review | **Denied** | No permission | P3 |
| A3 | Create a new item in Monthly Reviews (a fake review) | **Denied** | List-level access is *Limited Access* only, with no Add Items | P4 |
| A4 | Read Manager Reviews (feedback) before release | **Denied** | The item inherits manager-only permissions until release | P5 |
| A5 | Read earlier drafts of feedback after release | **Denied** | `1-to-1 Read` has no View Versions | P6 |
| A6 | Read Technicians or Appraisal Expectations, including B's individual expectations | **Denied** | Manager-only lists, with no item grants | P7 |
| A7 | Edit own review after submission | **Denied** | Flow 2 has replaced Edit with `1-to-1 Read` | P8 |
| A8 | Set own Status to *Completed* or *Closed* while drafting | **No effect beyond submitting** | Flow 2 treats any non-draft status as a submission, locks it and corrects the status. The real state lives on Manager Reviews, which A can't write to. | P10 |
| A9 | Push own DueDate forward to avoid a late flag | **No effect** | Lateness is calculated from `Manager Reviews.DueDate` | P10 |
| A10 | Rewrite own expectation titles or measures | **No effect on the record** | The TL view and the history use `Manager Reviews.ExpectationSnapshotJson` | P10 |
| A11 | Change own item's `Technician` to B | **No effect** | Flows take identity only from Manager Reviews | P10 |
| A12 | Grant permissions on or share own item | **Denied** | No Manage Permissions. Site sharing is owners only. | P11 |
| A13 | Forge *Modified By* = TL to dodge the lock | **Lock still applied** | Flow 2 doesn't use *Modified By* | P9 |
| A14 | Make a privileged flow act on B's record | **Not possible** | No flow accepts technician input. Flow 2 fires only on items A can already edit, and resolves the technician from Manager Reviews by item ID. | P10 |
| A15 | Squat a future ReviewKey to block B's next review | **Not possible** | The key exists only on the manager-only list | (by design) |
| A16 | Forward the email link to a colleague | **The colleague gets "not found"** | The link holds only an item ID. Access is decided by SharePoint permissions after Microsoft 365 sign-in. | P1 |
| A17 | Delete own draft | **Denied** | `1-to-1 Edit` has no Delete Items | P12 |
| A18 | Submit through the API without the mandatory answers | **Possible**, own record only | Accepted. The TL sees the blanks and can discuss them or ask for a resubmission through the correction process. Server-side validation isn't worth building here. | — |
| A19 | Edit own draft in the ~5 minutes between Submit and Flow 2 locking it | **Possible**, own record only | Accepted, residual risk R1. `SubmittedOn` is stamped by the server, and the version history shows any change. | — |
| A20 | Open the app's manager screens | **Sees only their own data** | Every query runs as the technician | P13 |

---

## 5. Licensing check: no premium features are needed

| Component | Licence class | Note |
|---|---|---|
| SharePoint Online lists, item permissions, **custom permission levels**, versioning, views | Included with SharePoint Online | Permission levels can be blocked by tenant policy, so confirm item IT-4 |
| Power Apps canvas app using the **SharePoint** connector | **Standard** (the Power Apps rights seeded with Microsoft 365) | No Dataverse, no premium connectors and no custom connectors |
| Power Apps web part on a SharePoint page | Included | |
| Power Automate: **SharePoint** triggers and actions, **including "Send an HTTP request to SharePoint"** | **Standard.** It's an action of the SharePoint connector, not the premium **HTTP** connector. | DLP policies can block individual actions, so confirm item IT-2 |
| Office 365 Outlook "Send an email (V2)", Office 365 Users "Get user profile (V2)" | **Standard** | |
| Recurrence, Scope, Condition, Compose, Filter array, Select, Terminate, trigger conditions, concurrency control | Built-in | |
| SharePoint polling triggers under Microsoft 365 rights | Standard, polled about every 5 minutes | This explains the R1 window |
| API request limits (Microsoft 365 rights) | Usage here is a few hundred requests a month, far below the limits | |

**Who needs a licence:** the TL needs Power Apps and Power Automate use rights. Technicians need Power Apps use rights only. Microsoft 365 E3, E5 and F3 include these. **F1 and some frontline or kiosk plans may not, so confirm item IT-5.**

---

## 6. Technicians aren't site members: how access still works

1. When a flow grants a technician a permission on one item, SharePoint automatically gives that technician **Limited Access** on the list and the site. Limited Access lets them reach the item, not browse the site. They never become Members or Visitors.
2. The canvas app's SharePoint connection runs **as the technician**. On first launch Power Apps asks them to allow it, and they click **Allow**. The app then reads only what SharePoint lets them read.
3. Sharing the app (**Share → User**) gives the right to *run* the app, not access to data. When Power Apps offers to share the lists as well, **decline**.
4. Communication sites can have the **"Limited-access user permission lockdown mode"** feature switched on. It restricts what users with only Limited Access can see. It should not affect Power Apps, which uses the REST API, and it usefully stops technicians from using the list pages. This is unconfirmed, so **Stage 0 proves it** before anything else is built.
5. Technicians can't open the site home page. That's intended, because the dashboard is for the TL only.

---

## 7. To confirm with corporate IT and HR before deployment

**IT (blocking unless marked otherwise)**

| # | Question | Why it matters |
|---|---|---|
| IT-1 | Can the TL create a **communication site** and be its sole owner? Does governance require a second owner? (This affects D4.) | Site creation |
| IT-2 | In the environment where the app will live, does the **DLP policy** allow SharePoint (including the action *Send an HTTP request to SharePoint*), Office 365 Outlook and Office 365 Users **in the same data group**? | Without the HTTP action there's no locking. The v2 fallback is weaker. |
| IT-3 | Is the **Default environment** approved for confidential line-management data, or must a specific environment be used? | Where to build |
| IT-4 | Are site owners allowed to create **custom permission levels**? | No-delete and no-version-history access |
| IT-5 | Do all technicians' licences include **Power Apps use rights**? | Technicians can't open the app without them |
| IT-6 | Two **test accounts** with mailboxes and Power Apps rights, which may build a personal flow for the API tests | Privacy testing can't be proven with the TL account |
| IT-7 | ~~Do **Conditional Access** rules allow `apps.powerapps.com` on work phones and laptops?~~ **Not needed (v4.5):** desktop only, confirmed by the TL – phones are out of scope. | – |
| IT-8 | Is there a **sensitivity label** for HR or confidential sites? Is external sharing off for new sites? | Hardening |
| IT-9 | (Information only) Acknowledge that M365, SharePoint and Power Platform administrators can technically access this data. | Privacy notice |

**HR and Data Protection**

| # | Question |
|---|---|
| HR-1 | **Retention period** (D3) and the deletion method: a Purview retention label, or the TL's annual manual deletion |
| HR-2 | Is a **DPIA screening** needed? Approve a short **privacy notice** for technicians (v2 artefact K9). |
| HR-3 | Approve the **Q4 wellbeing wording** and supply the **EAP / Occupational Health contact** details |
| HR-4 | Confirm the wording that a written check-in **doesn't replace** any formal appraisal or meeting requirement |
| HR-5 | **TL absence:** if the TL is unavailable long-term, who may be given access, and how (an IT-approved access request)? This replaces a standing backup owner (D4). |

---

## 8. Things that need confirming in the tenant (Stage 0 proof test, 1–2 hours)

These are assumptions about platform behaviour that only the corporate tenant can confirm. They are now **step 0** of the build, before the app and flows are written.

1. A user with item-level access only, who isn't a site member, can open an auto-generated Power Apps app, see **only** their item, and edit it.
2. The same user sees **nothing** in a list they have no access to, and the `IfError` pattern suppresses the error banner.
3. The REST permission calls (reset, break, add role) succeed under the TL's connection, **and DLP allows them**.
4. Whether *Modified By* can be forged by a technician (P9). v2 is safe either way, but the result goes in the security record.

If item 1 fails, stop. The architecture needs revisiting before any more build effort.

---

## 9. Residual risks accepted in v2

| # | Risk | Why it's accepted |
|---|---|---|
| R1 | About 5 minutes between Submit and the lock, during which a technician could still edit through the API | Affects only their own record. The submission time is stamped by the server, and versions record everything. |
| R2 | API submission without the mandatory answers | Affects only their own record, and the TL sees the gaps |
| R3 | Tenant administrators can access the data | Normal Microsoft 365 administration, covered by IT policy |
| R4 | The flows depend on the TL's account (D1) | Handover procedure is in the configuration reference |
| R5 | If the TL closes a review at the same moment the technician submits, the submission can end up closed | The TL can only close after the deadline. The technician's answers are preserved, and the TL can correct it. |
| R6 | Owners-group drift: anyone added as a site owner can read everything | A quarterly 2-minute check of the Owners group is part of the procedure |

---

## 10. Changes made to the plan

All changes are applied in `IMPLEMENTATION_PLAN.md` v2.

1. Manager Reviews is now the **authoritative, tamper-proof record** (fixes S1 and S2). The Monthly Review item is reduced to the technician's answers plus display copies.
2. The **`1-to-1 Read`** custom permission level is added (fixes S3).
3. Flow 2 is **idempotent** and doesn't use *Modified By* (fixes S4).
4. Emails use only trusted fields (fixes S5). The app uses `IfError` for manager-only lists (fixes S6).
5. The **Agreed Actions list is removed** and replaced by three fields on Manager Reviews.
6. **Reopen is removed.** The correction process is a direct, versioned edit by the TL, with a reason recorded.
7. The **IsOverdue column and overdue loop are removed.** Overdue is calculated.
8. **Role and group IDs become configuration.** The LOOKUPS and verification scopes are removed.
9. **Three screens instead of four.** The month picker replaces the history screen.
10. Power Fx no longer uses named formulas that reference controls.
11. `greater()` on timestamp strings is replaced by a `ticks()` comparison, fixing a latent bug in v1's late calculation.
12. A new **Stage 0 proof test** is added. Privacy tests are expanded into **P1–P14**, run as the TL first to prove each attack request works, then as Technician A to prove it fails.
13. The deployment guide is rewritten for a first-time builder, with exact clicks, values to paste and checks after each part.
14. Estimates are revised to **28–36 h** hands-on.

**The form is unchanged.** Q1–Q9 are exactly as agreed: Yes/No conditional sections, independent TL comments on every section including No answers, the workload score and history, 1–10 expectations with a 1–5 progress score and TL feedback, drafts, monthly links, reminders on the 20th and 27th, late flagging, closure by the TL, and the three follow-up choices with a TL override.
