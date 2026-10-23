# ESG Competency Hub

A SharePoint Online application for the Environmental Safety Group at Dungeness B Power Station. It brings the ten
competency areas' actions, deadline extensions, improvements and degradations, noticeboards and monthly meetings into
one place, with automatic reminders, auditable changes, meeting agendas built from existing records, a management
overview and administration of people and access from within the app.

This project is separate from the other applications in this repository.

## Status (23 October 2026)

| Part | State |
|---|---|
| Site and Setup (`setup/`) | Setup 1.1 applied on the site. **Setup 1.2** (Feedback list, Meeting Minutes library, Notice Posters group, new columns and settings) built and tested locally |
| App (`02-frontend/`) | 0.3.0 running on the site. **0.6.0** (safety net, Administration page with People, new *My week* home page) built and tested locally |
| Flows (`04-solution/`) | 1.2.0.0 running on the site. **1.4.1.0** (four flows: Daily tasks, Request queue, Queue monitor, Administration) built and tested locally |
| Permission probe (`probe/CH_Probe_P2.*`) | Built and tested locally; to be run on the site with an ordinary test account |

Phase 1 is delivered in six releases; Releases 1 (safety net) and 2 (administration and permissions) are built.
Release 3 (noticeboard, register, feedback, settings, dashboard), Releases 4 and 5 (meetings) and Release 6 (go-live
checks) follow.

**Site layout (23 October 2026):** site navigation is turned off (Change the look → Navigation), and staff are to be
given the Hub page address ending `?env=WebView`, which hides SharePoint's own bars so the Hub fills the window.

**Not built yet, by design:** the meeting-rights grants on an open meeting's Record folder (plan §4.3) come with
meetings in Release 4. Until then "Can run meetings" is recorded and used by every rule; there are no meeting folders
to grant on.

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
| `sh 04-solution/tools/run_all.sh` | Flow build check, 21 validator tests, 116 flow tests, package comparison |
| `node --test 02-frontend/test/unit/*.test.js` | 66 app unit tests |
| `node 02-frontend/test/browser/run.js` | Browser checks of every journey on the simulated site, at three screen widths |
| `node --test setup/test/setup.test.js` | 23 Setup tests, including a resumed Apply and an upgrade from the previous release |
| `node probe/test/run-probe-p2-test.js` | The permission probe against secured, leaky and owner-run simulated sites |
