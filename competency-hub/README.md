# ESG Competency Hub

A SharePoint Online application for the Environmental Safety Group at Dungeness B
Power Station. It brings the ten competency areas' actions, deadline extensions,
improvements and degradations, noticeboards, calendars and monthly meetings into
one place, with automatic reminders, auditable extensions, meeting agendas built
from existing records, a management dashboard and administration of people and
access.

This project is separate from the other applications in this repository.

## Status

**Planning approved (19 October 2026). The site structure is in place; the app is not yet deployed.**

| Part | State |
|---|---|
| Probe P0 (`probe/`) | Passed on the site, 21 October 2026 |
| App (`02-frontend/`) | 0.1.2 running on the site; 0.2.0 (raising and updating actions) built and tested locally |
| Setup page (`setup/`) | Applied on the site, 21 October 2026: lists, groups, folders, permissions and the first administrator are in place |
| Flows (`04-solution/`) | Request queue flow (raise, extend, mark as done) built and tested locally; ready to import |

See section K of the plan for the current step.

## Platform

| Layer | Technology |
|---|---|
| Frontend | Welcome by Accelerator 365 custom layout: plain HTML, CSS and JavaScript, same-origin SharePoint REST |
| Data | SharePoint lists on a dedicated site, secured by competency folders |
| Automation | Power Automate, standard connectors only, in one unmanaged solution |

## Documents

| Document | Contents |
|---|---|
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The approved planning package: functional, UI, data and permissions specifications; workflows; architecture; roadmap and tests; risks and decisions; independent reviews |
| [setup/README.md](setup/README.md) | The Setup page and the owner runbook |

## Planned layout

```
competency-hub/
  README.md
  docs/            plan, Phase 0 probe report, test reports
  01-sharepoint/   list definitions, generated from the schema
  02-frontend/     Welcome layout, source modules, styles, build, mock and tests
  03-flows/        email templates and flow notes
  04-solution/     schema, unpacked solution source, static checks
  tests/           integration scenarios for the test site
  data/            seed template (column headers only)
```

Real user principal names and other personal identifiers are never committed.
