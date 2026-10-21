# ESG Competency Hub

A SharePoint Online application for the Environmental Safety Group at Dungeness B
Power Station. It brings the ten competency areas' actions, deadline extensions,
improvements and degradations, noticeboards, calendars and monthly meetings into
one place, with automatic reminders, auditable extensions, meeting agendas built
from existing records, a management dashboard and administration of people and
access.

This project is separate from the other applications in this repository.

## Status

**Planning approved (19 October 2026). Nothing has been deployed to the site.**

| Part | State |
|---|---|
| Probe P0 (`probe/`) | Passed on the site, 21 October 2026 |
| App shell (`02-frontend/`) | Built and tested locally against a simulated SharePoint site |
| Setup page (`setup/`) | Built and tested locally; ready for the owner to run Check (see its README) |
| Flows | Not started (Phases 1–2) |

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
