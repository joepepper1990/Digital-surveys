# ESG Competency Hub

A SharePoint Online application for the Environmental Safety Group at Dungeness B Power Station. It brings the ten
competency areas' actions, deadline extensions, improvements and degradations, noticeboards and monthly meetings into
one place, with automatic reminders, auditable changes, meeting agendas built from existing records, a management
overview and administration of people and access from within the app.

This project is separate from the other applications in this repository.

## Status (29 October 2026)

| Part | On the site | Newest, built and tested here |
|---|---|---|
| App (`02-frontend/`) | 1.4.0 | **1.4.1**: a review for accuracy and fewer reads (a saved change reads only its own row; a failing list keeps its rows; changes waiting on a refused one are held). Next: app 2.0, the editors as full pages. History in `02-frontend/README.md` |
| Flows (`04-solution/`) | 1.10.0.0 | **1.10.1.0**: a review of every flow (cancel and amend refused cleanly, the monitor never overwrites a finished change, administration one at a time, fewer calls per run). History in `04-solution/README.md` |
| Site and Setup (`setup/`) | 1.4.3 | 1.4.3 (unchanged) |
| Permission probe (`probe/CH_Probe_P2.*`) | P2-2 | P2-2 (unchanged); to be run with Rich |

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

Counts from the run on 29 October 2026.

| Command | What it runs |
|---|---|
| `sh 04-solution/tools/run_all.sh` | Build check, 26 validator tests, 137 flow tests, 21 Records, 43 Meetings, 4 Clean-up, 3 load and 3 security tests, package comparison |
| `node --test 02-frontend/test/unit/*.test.js` | 111 app unit tests |
| `node 02-frontend/test/browser/run.js` | 188 browser checks of every journey on the simulated site, at three screen widths |
| `node --test setup/test/setup.test.js` | 31 Setup tests, including a resumed Apply and an upgrade from the previous release |
| `node probe/test/run-probe-p2-test.js` | The permission probe against secured, leaky and owner-run simulated sites |
