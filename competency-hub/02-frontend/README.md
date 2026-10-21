# Competency Hub frontend (Welcome layout)

Plain HTML, CSS and JavaScript, delivered as a Welcome by Accelerator 365 custom layout. Same-origin SharePoint REST runs as the signed-in user. There are no libraries and no external calls.

## Version 0.1.0: the app shell

**What it does:**

- Home pages for the three roles:
  - Technician: own areas, actions, meetings and noticeboards, then other areas as view-only tiles.
  - Engineer: the same, plus "For you to manage".
  - Team Leader and Group Head: all areas, "Needs your attention", their own actions and coming meetings.
- Area pages with the tabs Actions, Notices & issues, Calendar and Meetings, and a clear *View only* bar for non-members.
- **Post a notice**, the only write in this version. Anyone can post on any active area's noticeboard; only members can mark a notice as important. Notices from non-members are labelled as coming from outside the area.

**Identity fails closed.** An unknown user, a person marked Left, a duplicate People entry, or a People list that cannot be read all produce a message and no operational data.

**A failed or truncated read is never shown as "nothing to show".** Instead:

- unavailable data is reported;
- partial data is marked "not complete";
- figures from a failed read are never shown as zero.

**Coming in later versions:**

- raising and changing actions, and extensions;
- the issues register;
- meetings;
- the management drill-downs;
- administration.

These buttons are visible, but they say they are coming next.

## Layout

| Folder | Contents |
|---|---|
| `src/` | Modules: `core/` (config, DOM, dates, SharePoint), `domain/` (access rules, model), `ui/`, `views/`, `app.js` |
| `styles/app.css` | Styles. The build scopes every rule under Welcome's `.SCOPE .ch`. |
| `layout/` | The Welcome layout template |
| `tools/build.js` | Builds `dist/`. `--check` fails if `dist/` is stale. |
| `dist/` | **Upload these two files:** `competency-hub.html` and `competency-hub.js`. `BUILD_MANIFEST.json` holds their SHA-256 hashes. |
| `mock/` | A simulated Welcome context and SharePoint with synthetic data. Open `mock/index.html` in a browser and use "Sign in as" and "Simulate". |
| `test/` | Unit tests (`node --test`) and browser tests (headless Chromium) |

## Build and test

```
node tools/build.js
node tools/build.js --check
node --test test/unit/*.test.js
node test/browser/run.js [path-to-chromium]
```

## Evidence status

| Evidence | Status |
|---|---|
| Unit tests (date rules, access rules, model, code rules, build) | LOCAL: 30 checks pass |
| Browser tests (roles, view-only, fail-closed, unavailable or partial data, notice posting, keyboard, read-only audit, 3 widths) | OFFLINE-SIMULATED: 29 checks pass |
| Running inside Welcome on the new site | **Not proven.** It needs the P0 probe, then the lists created by Setup. |
| SharePoint permissions (non-members can only add notices, members can add updates) | **Not proven.** These are Phase 0 probes P-03, P-04 and P-13 on the real site. |
| Accessibility beyond keyboard tabs, dialog focus and contrast tokens | **Not yet tested** with axe or a screen reader |
