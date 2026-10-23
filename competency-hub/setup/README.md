# Competency Hub Setup

A one-off, owner-only page that creates the Competency Hub structure on the site
(plan section K6.2, decision D-17). It runs in a Welcome custom layout as the
signed-in site owner and uses the same SharePoint REST calls a flow would.

It creates, from `../04-solution/schema/schema.json`:

| Step | What |
|---|---|
| Pre-checks | You are a site owner; regional settings are English (UK) and London time; only owners can share; for a Microsoft 365 group site, your confirmation that the group has owners only |
| Permission levels | Competency Hub Read, Add and Contribute |
| Groups | All Users, Management, Administrators, Notice Posters and one Members group per area (14). Membership visible to members only, no join requests. |
| Lists | 15 lists and two libraries (Records Export, Meeting Minutes), with columns, required fields, indexes, unique keys, versioning (100), attachments, "edit own items" and search crawling as the schema says |
| Folders | Area folders, History `Administration`, `Transactions` and `{Key}/Records`, Requests `System` |
| Permissions | Every list gets its own permissions (Owners Full Control plus the schema's grants); area folders on Updates and Calendar Events; History `Administration` and `Transactions` |
| Data | The settings rows and the ten competency areas |
| First administrator | You: People entry, request folder, All Users, Management and Administrators, then the administrator flag, and a Bootstrap record in History (plan E.5.1) |
| People import | Optional. One line per person: `email, role, area keys` |
| App page access | All Users get Read on the Welcome layouts library, the Welcome errors list and `Hub.aspx` (when it exists) |

**Status:** version 1.1 applied on the site on 21 October 2026, with no stops or
warnings. **Version 1.2** (Release 2) adds the Feedback list, the Meeting Minutes
library with its area folders, the Notice Posters group, `People.CanPostNotices`,
the History reporting columns, the test-record markers, new settings and the new
choices on existing columns. **Version 1.3** (Release 4) adds the meeting end time
(`Meetings.EndTime`) and two settings, `InvitesEnabled` and `PdfEnabled` (both Yes).
Built and tested locally.

**Check** changes nothing and lists what Apply would do. **Apply** needs `SETUP`
typed first. It only adds what is missing and reads every change back, and can
be run again safely. If it stops part-way, running Apply again continues from
where it stopped. Data is never deleted.

There is one deliberate change to existing permissions in 1.2: the Noticeboard
goes from "All Users can add" to "All Users can read, Notice Posters can add", so
an administrator can stop one person posting. Setup first confirms that every
Noticeboard area folder still takes its permissions from the list (otherwise the
change would not reach it) and stops, changing nothing, if one does not. It gives
Notice Posters Add before taking Add away from All Users, so nobody is locked out
in between, and puts every active person in Notice Posters.

## Owner runbook

Each step changes the site, so each needs your go-ahead.

1. **Sharing.** Settings (gear) → Site permissions → *Change how members can
   share* → "Only site owners can share files, folders, and the site". Untick
   "Allow members to invite others" and turn off access requests.
2. **Microsoft 365 group.** On the site home page, click *Members* (top right).
   It must list owners only. Do not add staff to it and do not turn it into a
   Team; staff get access through the Competency Hub groups.
3. **Setup page.** Site Pages → New → Site page, named `HubSetup`. Add the
   Welcome web part in a full-width section and publish. Do not share the page.
4. **Upload** `dist/CH_Setup.html` and `dist/CH_Setup.js` to *Welcome Web Part -
   Custom Layouts*. In the web part, choose the layout *Competency Hub Setup*,
   then republish.
5. **Check.** Reload the page, tick the Microsoft 365 group confirmation, choose
   your role, click *Check (changes nothing)*, then *Save the log*. Send the log.
6. **Apply.** After the check is reviewed: type `SETUP`, click *Apply* and keep
   the page open until it finishes (about 880 SharePoint requests; allow a few
   minutes). Save the log and send it.
7. **Tidy up.** Delete `CH_Setup.html` and `CH_Setup.js` from the layouts
   library, and delete the `HubSetup` page.

The people import can wait for the sign-in names (C-04). Run Setup again later
with the list pasted under *Optional: add other people now*; everything already
in place is left alone.

## Files

| Path | Contents |
|---|---|
| `src/rest.js` | SharePoint REST as the signed-in user: digest, verbose and nometadata responses, error messages |
| `src/engine.js` | The steps above. Check mode refuses to write. |
| `src/ui.js` | The page: confirmation, role, people list, Check, Apply, log |
| `layout/setup.layout.html` | The Welcome layout |
| `tools/build.js` | Embeds the schema and builds `dist/` and `mock/index.html`; `--check` fails if they are stale |
| `mock/mock-admin.js` | A simulated SharePoint site: lists, columns, items, folders, groups, permission levels and inheritance |
| `mock/index.html` | The page against the simulated site. Add `?scenario=notOwner`, `membersShare`, `wrongRegion` or `withHubPage`. |
| `test/setup.test.js` | Engine tests (`node --test test/*.test.js`) |
| `test/browser.js` | Headless Chromium smoke test and screenshots (`node test/browser.js`) |

## Tests

Evidence class: **LOCAL / OFFLINE-SIMULATED**. They show the engine behaves as
designed against the simulated site; they do not prove behaviour on the real
site, which the Check log will show first.

- Check on an empty site makes no writes and plans everything.
- Apply creates exactly the schema's levels, groups, lists, columns, folders,
  permissions, settings and areas, and each list's and folder's permissions match
  the schema.
- The first administrator is complete, and the flag is set only after the
  Administrators membership has been read back.
- A second Apply, and a Check afterwards, make no writes.
- A non-owner, a site where members can share, an unconfirmed Microsoft 365
  group and wrong regional settings are each stopped before any change.
- Apply interrupted at about 50 different points, then run again, ends in the
  same state as an uninterrupted run, and a further Apply has nothing to do.
- An existing administrator means Setup adds no other.
- The people import adds memberships and groups and reports unusable lines and
  people who cannot be found.
- `Hub.aspx` is opened to All Users once it exists; the Setup page is not.
- The build output is current; neither Setup nor the app uses unsafe DOM writes;
  the app contains no permission, group or user calls (code rule S8).

## Not yet proven on the real site

- That SharePoint accepts every column definition and setting as the simulation
  does (the Check and Apply logs will show it).
- Whether breaking inheritance adds you to a folder's permissions directly
  (Setup reports anything extra and never removes it).
- Date round trips for Tracking Start (Setup reads it back and warns if it
  differs).
