# ESG Competency Hub

A SharePoint Online application for the Environmental Safety Group at Dungeness B Power Station. It brings the ten
competency areas' actions, deadline extensions, improvements and degradations, noticeboards and monthly meetings into
one place, with automatic reminders, auditable changes, meeting agendas built from existing records, a management
overview and administration of people and access from within the app.

This project is separate from the other applications in this repository.

## Status (23 October 2026)

| Part | State |
|---|---|
| Site and Setup (`setup/`) | **Setup 1.4.3** for release 1.2 (the Pass-through level on Requests, and the meeting outcome *Closed*); 1.4.2 applied on the site. Earlier: Setup 1.1 applied on the site. **Setup 1.3** (1.2: Feedback list, Meeting Minutes library, Notice Posters group, new columns and settings; 1.3: the meeting end time and the *Outlook invitations* and *PDF minutes* switches) built and tested locally. **1.3.2** fixes Check and Apply on a site made by Setup 1.1. **1.4** adds the columns for Known as, co-owners, the close-out checker and notices on several noticeboards |
| App (`02-frontend/`) | **1.2.1**: meetings start and finalise without waiting; **1.2.0**: release 1.2 as approved in the preview (see `02-frontend/README.md`); 1.1.1 running on the site. Earlier: 1.0.0 running on the site. **1.1.0** (your first review: wording, layout, Known as, co-owners, the close-out checker, notices on several noticeboards, turn into an action) built and tested locally. **1.0.0** (safety net, Administration with People, Settings, Feedback and test-data removal, *My week* home page, notices, register, Management page, booking and running meetings, minutes) built and tested locally |
| Flows (`04-solution/`) | **1.9.0.4** for app 1.2.0 (see `04-solution/README.md`); 1.9.0.3 running on the site. Earlier: 1.8.0.2. **1.9.0.1** (1.9.0.1 fixes *3 Queue monitor* failing at its invitation-retry step; Known as, co-owners, the close-out checker, actions from notices, the register without a responsible person) built and tested locally. **1.8.0.2** (1.8.0.1 and 1.8.0.2 let the flows be turned on: a step set a variable from itself, and the Outlook event steps used the Windows time zone name; eight flows: Daily tasks, Request queue, Queue monitor, Records, Meetings, Administration, Minutes, Clean-up; plus the probes *P-INV* and *P-PDF*, run by hand) built and tested locally |
| Permission probe (`probe/CH_Probe_P2.*`) | Built and tested locally; to be run on the site with an ordinary test account |

The plan for everything left to go-live is in `docs/REMAINING-PLAN.md`.

Phase 1 is delivered in six releases; Releases 1 (safety net), 2 (administration and permissions), 3 (noticeboard,
register, feedback, settings, dashboard), 4 (booking meetings with Outlook invitations, the agenda) and 5 (the live
meeting, finalised minutes, amendments and PDF minutes) and 6 (checks and go-live: test-data removal, security, list-size,
load and accessibility checks) are built. Phase 1 is complete locally; going live follows `docs/GO-LIVE.html`, and staff get
`docs/STAFF-GUIDE.html`. The steps for installing are in `docs/HOW-TO.html`.

**Site layout (23 October 2026):** site navigation is turned off (Change the look → Navigation), and staff are to be
given the Hub page address ending `?env=WebView`, which hides SharePoint's own bars so the Hub fills the window.

**Meeting rights (plan §4.3):** booking a meeting gives its Record folder its own permissions – the area's meeting
runners and management can add to it – and switching *Can run meetings* on or off in Administration also changes
the open meetings' folders, removing before recording a removal and adding after recording a grant, each read back.

## Platform

| Layer | Technology |
|---|---|
| Frontend | Welcome by Accelerator 365 custom layout: plain HTML, CSS and JavaScript, same-origin SharePoint REST |
| Data | SharePoint lists on a dedicated site, secured by area folders |
| Automation | Power Automate, standard connectors only (SharePoint and Office 365 Outlook), in one unmanaged solution |

## Layout

```
competency-hub/
  02-frontend/   the app: source modules, styles, build, simulated site and tests
  04-solution/   schema.json, the flow generator and its checks, the unpacked solution and the zip
  setup/         the owner-only Setup page that builds and upgrades the site
  probe/         one-off check pages run on the site (P0 site checks, P2 permissions)
  docs/          the plan, its revisions and the HOW-TO for the current release
```

Each folder has a README. Real sign-in names, email addresses and the tenant address are never committed.

## Tests

| Command | What it runs |
|---|---|
| `sh 04-solution/tools/run_all.sh` | Flow build check, 21 validator tests, 116 flow tests, 16 Records tests, package comparison |
| `node --test 02-frontend/test/unit/*.test.js` | 76 app unit tests |
| `node 02-frontend/test/browser/run.js` | Browser checks of every journey on the simulated site, at three screen widths |
| `node --test setup/test/setup.test.js` | 31 Setup tests, including a resumed Apply and an upgrade from the previous release |
| `node probe/test/run-probe-p2-test.js` | The permission probe against secured, leaky and owner-run simulated sites |
