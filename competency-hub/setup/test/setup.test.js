// Setup engine tests against the simulated SharePoint site (plan K6.2).
//   node --test test/*.test.js
// Evidence class: LOCAL / OFFLINE-SIMULATED. Nothing here proves behaviour on the real site.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MODULES, SCHEMA } = require('../tools/build.js');

const ROOT = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const TODAY = '2026-10-21';
// Arrays from the isolated context have their own prototypes; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, message) => assert.deepEqual(plain(a), plain(b), message);

// Loads the Setup modules (without the page) and the simulated site into one isolated context.
function load() {
  // Retry waits run immediately, so throttling tests stay fast.
  const context = vm.createContext({ Intl, Date, Math, JSON, Promise, console, setTimeout: (fn) => setImmediate(fn) });
  context.window = context;
  vm.runInContext('var CHS = {};', context);
  MODULES.filter((m) => m !== 'src/ui.js').forEach((m) => vm.runInContext(fs.readFileSync(path.join(ROOT, m), 'utf8'), context, { filename: m }));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'mock/mock-admin.js'), 'utf8'), context, { filename: 'mock-admin.js' });
  return context;
}

function newSite(scenario, options) {
  const ctx = load();
  const site = ctx.MockAdmin.create(scenario || '', options);
  const rest = ctx.CHS.rest.create(site.ctx.getWebPart());
  async function run(mode, opts) {
    const entries = [];
    const engine = ctx.CHS.engine.create(rest, schema, Object.assign({ log: (e) => entries.push(e), confirmGroupOwnersOnly: true, today: TODAY }, opts || {}));
    const result = await engine.run(mode);
    return { result: JSON.parse(JSON.stringify(result)), entries, stops: entries.filter((e) => e.level === 'stop').map((e) => e.text) };
  }
  return { site, run, ctx };
}

const listByUrl = (site, url) => site.lists.filter((l) => l.url.endsWith('/' + url))[0];
const groupId = (site, title) => (site.groups.filter((g) => g.Title === title)[0] || {}).Id;
const roleId = (site, name) => site.roleDefs.filter((d) => d.Name === name)[0].Id;
const rows = (list) => list.items.filter((i) => i.FSObjType === 0);
const folder = (site, list, rel) => site.findFolder(list.url + '/' + rel).item;

// The grants the schema expects on a securable, as sorted "principal:role" strings.
function expectedGrants(site, grants, area) {
  const owners = 'ESG Competency Hub Owners';
  const out = [groupId(site, owners) + ':' + site.ids.FULL, site.me().Id + ':' + site.ids.FULL];
  grants.forEach(([p, level]) => {
    const key = area ? p.replace('{Key}', area.key) : p;
    const g = schema.groups.map((x) => x.perArea ? schema.areas.map((a) => ({ key: x.key.replace('{Key}', a.key), title: x.title.replace('{Title}', a.title) })) : [x]).flat()
      .filter((x) => x.key === key)[0];
    out.push(groupId(site, g.title) + ':' + roleId(site, level === 'Edit' ? 'Edit' : 'Competency Hub ' + level));
  });
  return out.sort();
}
function actualGrants(ra) { return ra.flatMap((a) => a.r.map((r) => a.p + ':' + r)).sort(); }

// A comparable picture of everything Setup creates.
function snapshot(site) {
  return JSON.stringify({
    roles: site.roleDefs.map((d) => [d.Name, d.BasePermissions]),
    groups: site.groups.map((g) => [g.Title, g.users.slice().sort()]),
    lists: site.lists.map((l) => ({
      title: l.Title, url: l.url, settings: l.settings, unique: l.unique, ra: actualGrants(l.ra),
      fields: l.fields.map((f) => [f.InternalName, f.Title, f.TypeAsString, !!f.Required, !!f.Indexed, !!f.EnforceUniqueValues]),
      items: l.items.map((i) => {
        const copy = Object.assign({}, i, { ra: actualGrants(i.ra) });
        delete copy.Id;
        if (copy.Value && /^\d{4}-\d\d-\d\dT/.test(copy.Value)) copy.Value = 'timestamp';
        return copy;
      }).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
    }))
  });
}

test('Check on an empty site makes no writes and plans the whole structure', async () => {
  const { site, run } = newSite();
  const r = await run('check');
  assert.equal(site.writes.length, 0);
  assert.equal(r.result.ok, true, r.stops.join(' | '));
  assert.equal(r.result.writes, 0);
  const text = r.entries.map((e) => e.text).join('\n');
  assert.match(text, /Would create permission level "Competency Hub Read"/);
  assert.match(text, /Would create group "Competency Hub – Flask Members"/);
  assert.match(text, /Would create list "Competency Hub Settings"|Would create list/);
  assert.match(text, /Would make .* the first administrator/);
});

test('Apply creates exactly what the schema lists, with the expected permissions', async () => {
  const { site, run } = newSite();
  const r = await run('apply');
  assert.equal(r.result.ok, true, r.stops.join(' | '));

  // Permission levels and groups.
  schema.permissionLevels.forEach((p) => {
    const d = site.roleDefs.filter((x) => x.Name === p.name)[0];
    assert.ok(d, p.name);
    assert.equal(Number(d.BasePermissions.Low), Number(p.low));
    assert.equal(Number(d.BasePermissions.High), Number(p.high));
  });
  assert.equal(site.groups.filter((g) => g.Title.indexOf('Competency Hub – ') === 0).length, 14);
  site.groups.filter((g) => g.Title.indexOf('Competency Hub – ') === 0).forEach((g) => {
    assert.equal(g.OnlyAllowMembersViewMembership, true);
    assert.equal(g.AllowRequestToJoinLeave, false);
  });

  // Lists, settings and columns.
  assert.equal(schema.lists.length, 17);
  schema.lists.forEach((l) => {
    const list = listByUrl(site, l.url);
    assert.ok(list, l.url);
    assert.equal(list.Title, l.title);
    assert.equal(list.BaseTemplate, l.template);
    assert.equal(list.settings.EnableVersioning, true);
    assert.equal(list.settings.MajorVersionLimit, 100);
    assert.equal(list.settings.NoCrawl, !!l.noCrawl);
    if (l.template === 100) assert.equal(list.settings.WriteSecurity, l.writeSecurity || 1, l.url);
    if (l.template === 100) assert.equal(list.settings.ReadSecurity, l.readSecurity || 1, l.url);
    const fields = (l.standard ? schema.standardColumns : []).concat(l.fields);
    fields.forEach((f) => {
      const have = list.fields.filter((x) => x.InternalName === f.name)[0];
      assert.ok(have, l.url + '/' + f.name);
      assert.equal(have.Title, f.title || f.name, l.url + '/' + f.name);
      assert.equal(!!have.Required, !!f.required, l.url + '/' + f.name + ' required');
      assert.equal(!!have.Indexed, !!f.indexed || !!f.unique && !!have.Indexed, l.url + '/' + f.name + ' indexed');
      assert.equal(!!have.EnforceUniqueValues, !!f.unique, l.url + '/' + f.name + ' unique');
    });
    if (l.titleUnique) assert.equal(list.fields.filter((x) => x.InternalName === 'Title')[0].EnforceUniqueValues, true);
    assert.equal(list.fields.length, 1 + fields.length, l.url + ' has no extra columns');
  });

  // Data.
  const settings = rows(listByUrl(site, 'Settings'));
  assert.equal(settings.length, schema.settings.length);
  assert.equal(settings.filter((s) => s.Title === 'SchemaVersion')[0].Value, schema.schemaVersion);
  const comps = rows(listByUrl(site, 'Competencies'));
  deq(comps.map((c) => c.CompetencyKey).sort(), schema.areas.map((a) => a.key).sort());
  comps.forEach((c) => {
    assert.equal(c.TrackingStart, '2026-10-20T23:00:00Z', 'Tracking Start is 21 Oct 2026, UK midnight');
    assert.equal(c.MembersGroupId, groupId(site, 'Competency Hub – ' + schema.areas.filter((a) => a.key === c.CompetencyKey)[0].title + ' Members'));
  });

  // Folders and permissions, list by list, against the schema.
  schema.lists.forEach((l) => {
    const list = listByUrl(site, l.url);
    const p = l.permissions || {};
    assert.equal(list.unique, true, l.url + ' has its own permissions');
    deq(actualGrants(list.ra), expectedGrants(site, p.list || []), l.url + ' list permissions');
    const paths = (l.folders === 'areas' ? schema.areas.map((a) => a.key) : [])
      .concat((l.extraFolders || []).flatMap((x) => x.includes('{Key}') ? schema.areas.map((a) => x.replace('{Key}', a.key)) : [x]));
    paths.forEach((rel) => assert.ok(folder(site, list, rel), l.url + '/' + rel + ' exists'));
    if (p.areaFolders) schema.areas.forEach((a) => {
      const f = folder(site, list, a.key);
      assert.equal(f.unique, true);
      deq(actualGrants(f.ra), expectedGrants(site, p.areaFolders, a), l.url + '/' + a.key);
    });
    Object.keys(p.folders || {}).forEach((rel) => {
      deq(actualGrants(folder(site, list, rel).ra), expectedGrants(site, p.folders[rel]), l.url + '/' + rel);
    });
  });

  // Spot checks of the access model (plan E.0, E.4).
  const allUsers = groupId(site, 'Competency Hub – All Users');
  const requests = listByUrl(site, 'Requests');
  assert.ok(!requests.ra.some((a) => a.p === allUsers), 'All Users cannot see the Requests list');
  const tx = folder(site, listByUrl(site, 'History'), 'Transactions');
  deq(site.effective(listByUrl(site, 'History'), tx).map((a) => a.p).sort(),
    [groupId(site, 'ESG Competency Hub Owners'), site.me().Id, groupId(site, 'Competency Hub – Administrators')].sort());

  // Welcome lists are opened to All Users by copying their inherited permissions.
  ['Welcome Web Part - Custom Layouts', 'Welcome Web Part - Errors'].forEach((t) => {
    const w = site.lists.filter((l) => l.Title === t)[0];
    assert.equal(w.unique, true);
    assert.ok(w.ra.some((a) => a.p === allUsers && a.r.includes(roleId(site, 'Competency Hub Read'))), t);
    assert.ok(w.ra.some((a) => a.p === 5), t + ' keeps its inherited grants');
  });
  assert.ok(r.entries.some((e) => /Hub\.aspx does not exist yet/.test(e.text)));
});

test('The first administrator is set up completely, and the flag is set only after the group read-back', async () => {
  const { site, run } = newSite();
  const r = await run('apply', { bootstrapRole: 'Team Leader' });
  assert.equal(r.result.ok, true, r.stops.join(' | '));
  const me = site.me();
  const people = rows(listByUrl(site, 'People'));
  assert.equal(people.length, 1);
  assert.equal(people[0].PersonId, me.Id);
  assert.equal(people[0].SiteUserId, me.Id);
  assert.equal(people[0].Role, 'Team Leader');
  assert.equal(people[0].IsAdministrator, true);
  ['All Users', 'Management', 'Administrators'].forEach((g) => {
    assert.ok(site.groups.filter((x) => x.Title === 'Competency Hub – ' + g)[0].users.includes(me.Id), g);
  });
  const requests = listByUrl(site, 'Requests');
  const mine = folder(site, requests, 'u' + me.Id);
  assert.ok(mine.unique);
  assert.ok(mine.ra.some((a) => a.p === me.Id && a.r.includes(roleId(site, 'Competency Hub Contribute'))));
  const history = rows(listByUrl(site, 'History'));
  const txRow = history.filter((h) => h.RequestKey === 'SYS|Bootstrap|' + me.Id)[0];
  assert.equal(txRow.State, 'Applied');
  assert.match(txRow.FileDirRef, /\/Transactions$/);
  const ev = history.filter((h) => h.RequestKey === 'SYS|Bootstrap|' + me.Id + '|1')[0];
  assert.equal(ev.EventType, 'Bootstrap');
  assert.match(ev.FileDirRef, /\/Administration$/);
  assert.match(rows(listByUrl(site, 'Settings')).filter((s) => s.Title === 'BootstrapCompletedOn')[0].Value, /^\d{4}-\d\d-\d\dT/);

  const peopleList = listByUrl(site, 'People');
  const adminsId = groupId(site, 'Competency Hub – Administrators');
  const groupAdd = site.writes.indexOf('/_api/web/sitegroups(' + adminsId + ')/users');
  const flag = site.writes.indexOf("/_api/web/lists(guid'" + peopleList.Id + "')/items(" + people[0].Id + ')/validateUpdateListItem');
  assert.ok(groupAdd >= 0 && flag > groupAdd, 'flag set after Administrators membership');
});

test('A second Apply, and a Check afterwards, make no writes and report everything in place', async () => {
  const { site, run } = newSite();
  assert.equal((await run('apply')).result.ok, true);
  const before = snapshot(site);
  site.writes.length = 0;
  const again = await run('apply');
  assert.equal(again.result.ok, true, again.stops.join(' | '));
  deq(site.writes, []);
  assert.equal(again.result.created, 0, again.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
  const check = await run('check');
  assert.equal(check.result.ok, true);
  assert.equal(check.result.created, 0, check.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
  deq(site.writes, []);
  assert.equal(snapshot(site), before);
});

for (const [scenario, label, pattern, opts] of [
  ['notOwner', 'a non-owner', /not an owner/, {}],
  ['membersShare', 'a site where members can share', /members can currently share/, {}],
  ['', 'an unconfirmed Microsoft 365 group', /Microsoft 365 group/, { confirmGroupOwnersOnly: false }],
  ['wrongRegion', 'wrong regional settings', /Regional settings must be/, {}]
]) {
  test('Pre-check stops ' + label + ' before any change', async () => {
    const { site, run } = newSite(scenario);
    for (const mode of ['check', 'apply']) {
      const r = await run(mode, opts);
      assert.equal(r.result.ok, false);
      assert.ok(r.stops.some((s) => pattern.test(s)), r.stops.join(' | '));
    }
    deq(site.writes, []);
  });
}

test('An interrupted Apply, run again, finishes with the same result as an uninterrupted one', async () => {
  const reference = newSite();
  assert.equal((await reference.run('apply')).result.ok, true);
  const total = reference.site.writes.length;
  const expected = snapshot(reference.site);
  const cuts = [1, 2, 3, 4, 20, 21, 60, 61, 62, 150, 300, 301, 302];
  for (let n = Math.floor(total * 0.5); n < total; n += Math.max(1, Math.floor(total / 23))) cuts.push(n);
  // Every one of the last writes, where the bootstrap order matters most.
  for (let n = total - 24; n < total; n++) cuts.push(n);
  for (const cut of cuts.filter((c, i, a) => c > 0 && c < total && a.indexOf(c) === i)) {
    const { site, run } = newSite('', { failAfterWrites: cut });
    const first = await run('apply');
    assert.equal(first.result.ok, false, 'cut ' + cut);
    site.setFailAfter(0);
    const second = await run('apply');
    assert.equal(second.result.ok, true, 'cut ' + cut + ': ' + second.stops.join(' | '));
    const got = snapshot(site);
    if (got !== expected) {
      let i = 0;
      while (got[i] === expected[i]) i++;
      assert.fail('cut ' + cut + ' (' + reference.site.writes[cut] + ') differs: …' + got.slice(i - 300, i + 200) + '\n  expected …' + expected.slice(i - 300, i + 200));
    }
    const third = await run('apply');
    assert.equal(third.result.writes, 0, 'cut ' + cut + ' then nothing left to do');
  }
});

test('If adding to Administrators fails, the administrator flag stays off until a later run completes it', async () => {
  const reference = newSite();
  await reference.run('apply');
  const adminsId = groupId(reference.site, 'Competency Hub – Administrators');
  const at = reference.site.writes.indexOf('/_api/web/sitegroups(' + adminsId + ')/users');
  const { site, run } = newSite('', { failAfterWrites: at });
  assert.equal((await run('apply')).result.ok, false);
  const row = rows(listByUrl(site, 'People'))[0];
  assert.equal(row.IsAdministrator, false);
  site.setFailAfter(0);
  assert.equal((await run('apply')).result.ok, true);
  assert.equal(rows(listByUrl(site, 'People'))[0].IsAdministrator, true);
});

test('An existing administrator means Setup adds no other administrator', async () => {
  const { site, run } = newSite();
  await run('apply');
  const mark = site.signInAs('mark.wellstead@example.test', 'Wellstead Mark');
  const r = await run('apply');
  assert.equal(r.result.ok, true, r.stops.join(' | '));
  assert.ok(r.entries.some((e) => /An administrator already exists/.test(e.text)));
  assert.ok(!rows(listByUrl(site, 'People')).some((p) => p.SiteUserId === mark.Id));
  assert.ok(!site.groups.filter((g) => g.Title === 'Competency Hub – Administrators')[0].users.includes(mark.Id));
});

test('People import adds members with their areas and reports lines it cannot use', async () => {
  const { site, run } = newSite();
  const peopleText = [
    '# email, role, areas',
    'andrea.medlicott@example.test, Engineer, flk ins',
    'rachel.boulden@example.test, Technician, GRS',
    'unknown.person@example.test, Technician, RP',
    'not-an-email, Technician, RP',
    'kai.todd@example.test, Manager, RW',
    'luke.cain@example.test, Technician, XYZ'
  ].join('\n');
  const check = await run('check', { peopleText });
  assert.equal(site.writes.length, 0);
  assert.ok(check.entries.some((e) => /Would look up and add 3 people/.test(e.text)));
  const r = await run('apply', { peopleText });
  assert.equal(r.result.ok, true, r.stops.join(' | '));
  const warns = r.entries.filter((e) => e.level === 'warn').map((e) => e.text).join('\n');
  assert.match(warns, /unknown\.person@example\.test could not be found/);
  assert.match(warns, /Line 5: "not-an-email" is not an email address/);
  assert.match(warns, /Line 6: role must be/);
  assert.match(warns, /Line 7: unknown area XYZ/);
  const people = rows(listByUrl(site, 'People'));
  assert.equal(people.length, 3);
  const andrea = site.users.filter((u) => u.Email === 'andrea.medlicott@example.test')[0];
  const members = rows(listByUrl(site, 'CompetencyMembers'));
  const hers = members.filter((m) => m.PersonId === andrea.Id);
  deq(hers.map((m) => m.MembershipKey).sort(), ['FLK|' + andrea.Id, 'INS|' + andrea.Id]);
  assert.ok(hers.every((m) => m.CanManageMeetings === true && /\/(FLK|INS)$/.test(m.FileDirRef)));
  const rachel = site.users.filter((u) => u.Email === 'rachel.boulden@example.test')[0];
  assert.equal(members.filter((m) => m.PersonId === rachel.Id)[0].CanManageMeetings, false);
  assert.ok(site.groups.filter((g) => g.Title === 'Competency Hub – Flask Members')[0].users.includes(andrea.Id));
  assert.ok(!site.groups.filter((g) => g.Title === 'Competency Hub – Management')[0].users.includes(andrea.Id));
  assert.ok(people.every((p) => p.IsAdministrator === (p.SiteUserId === site.me().Id)));

  // The check after import finds the people in the site and plans nothing.
  const again = await run('check', { peopleText });
  deq(again.entries.filter((e) => e.level === 'create').map((e) => e.text),
    ['Would look up unknown.person@example.test and add them as Technician in RP.']);
});

test('The app page is opened to All Users once it exists', async () => {
  const { site, run } = newSite('withHubPage');
  assert.equal((await run('apply')).result.ok, true);
  const pages = site.lists.filter((l) => l.BaseTemplate === 119)[0];
  const hub = pages.items.filter((i) => i.FileLeafRef === 'Hub.aspx')[0];
  const setupPage = pages.items.filter((i) => i.FileLeafRef === 'HubSetup.aspx')[0];
  assert.equal(hub.unique, true);
  assert.ok(hub.ra.some((a) => a.p === groupId(site, 'Competency Hub – All Users')));
  assert.equal(setupPage.unique, false, 'the Setup page stays owners-only');
});

test('Build output is current, and neither the app nor Setup uses unsafe DOM writes', () => {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--check']);
  const setupJs = fs.readFileSync(path.join(ROOT, 'dist/CH_Setup.js'), 'utf8');
  assert.doesNotMatch(setupJs, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  // Code rule S8: the app itself never changes permissions, groups or users.
  const appJs = fs.readFileSync(path.join(ROOT, '..', '02-frontend', 'dist', 'competency-hub.js'), 'utf8');
  assert.doesNotMatch(appJs, /breakroleinheritance|roleassignments|roledefinitions|sitegroups|ensureuser|resetroleinheritance/i);
});

test('Verbose writes override the OData 4.0 default, and a failed write is never logged as done', async () => {
  // The simulated client rejects a verbose body sent as OData 4.0, as SharePoint did on 21 Oct 2026.
  const ctx = load();
  const site = ctx.MockAdmin.create('');
  const client = site.ctx.getWebPart().spHttpClient;
  const res = await client.post('https://contoso.example/sites/ESGCompetencyHub/_api/web/sitegroups', {},
    { headers: { 'Content-Type': 'application/json;odata=verbose' }, body: JSON.stringify({ __metadata: { type: 'SP.Group' }, Title: 'X' }) });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /JSON Light/);

  // The first write fails: nothing is reported as created.
  const failing = newSite('');
  failing.site.setFailAfter(-1); // every write fails
  const r = await failing.run('apply');
  assert.equal(r.result.ok, false);
  deq(r.entries.filter((e) => e.level === 'create').map((e) => e.text), []);
});

test('Throttled reads are retried, and a Check after Apply still finds nothing to do', async () => {
  const { site, run } = newSite('throttle');
  const applied = await run('apply');
  assert.equal(applied.result.ok, true, applied.stops.join(' | '));
  const check = await run('check');
  assert.equal(check.result.ok, true, check.stops.join(' | '));
  deq(check.entries.filter((e) => e.level === 'create' || e.level === 'warn').map((e) => e.text), []);
  assert.ok(rows(listByUrl(site, 'People'))[0].IsAdministrator);
});

for (const mode of ['omit', 'refuse']) {
  test('Without a usable has-own-permissions flag (' + mode + '), Check and Apply judge by the grants and find nothing to do', async () => {
    const { site, run } = newSite();
    assert.equal((await run('apply')).result.ok, true);
    site.uniqueFlag(mode);
    site.writes.length = 0;
    const check = await run('check');
    deq(check.entries.filter((e) => e.level === 'create' || e.level === 'warn').map((e) => e.text), []);
    const again = await run('apply');
    assert.equal(again.result.ok, true, again.stops.join(' | '));
    deq(site.writes, []);
  });
}

test('Without the flag, a list that really inherits its permissions is still found and fixed', async () => {
  const { site, run } = newSite();
  assert.equal((await run('apply')).result.ok, true);
  site.uniqueFlag('omit');
  const requests = listByUrl(site, 'Requests');
  requests.unique = false;
  requests.ra = [];
  const check = await run('check');
  assert.ok(check.entries.some((e) => e.text === 'Would give "Requests" its own permissions: Owners: Full Control.'), 'inheriting Requests list is reported');
  assert.equal((await run('apply')).result.ok, true);
  assert.equal(requests.unique, true);
  assert.ok(!requests.ra.some((a) => a.p === groupId(site, 'ESG Competency Hub Visitors')), 'site visitors cannot see Requests');
});

test('Securing a list never clears permissions already set on its folders', async () => {
  const { site, run } = newSite();
  assert.equal((await run('apply')).result.ok, true);
  const updates = listByUrl(site, 'Updates');
  const before = actualGrants(folder(site, updates, 'FLK').ra);
  // A list that has lost its own permissions is secured again; its folders keep theirs.
  updates.unique = false;
  updates.ra = [];
  const again = await run('apply');
  assert.equal(again.result.ok, true, again.stops.join(' | '));
  assert.ok(updates.unique);
  deq(actualGrants(folder(site, updates, 'FLK').ra), before);
  assert.ok(site.writes.some((w) => /breakroleinheritance\(copyRoleAssignments=false,clearSubscopes=false\)/.test(w)));
  assert.ok(!site.writes.some((w) => /clearSubscopes=true/.test(w)));
});

test('An upgrade on a site made by an earlier schema adds the new columns and choices, keeps the data, and then has nothing to do', async () => {
  const { site, run, ctx } = newSite();
  // The site as an earlier Setup left it: without the History statistics columns, the new choices and settings.
  const old = plain(schema);
  const history = old.lists.filter((l) => l.key === 'history')[0];
  history.fields = history.fields.filter((f) => ['OwnerId', 'PreviousOwnerId', 'DueDayAtEvent', 'CompletionKind'].indexOf(f.name) < 0);
  history.fields.filter((f) => f.name === 'State')[0].choices = history.fields.filter((f) => f.name === 'State')[0].choices.filter((c) => c !== 'Cancelled' && c !== 'Reverted');
  old.settings = old.settings.filter((s) => s[0] !== 'QueueHealth' && s[0] !== 'MonitorHours');
  const rest = ctx.CHS.rest.create(site.ctx.getWebPart());
  const first = await ctx.CHS.engine.create(rest, old, { log: () => {}, confirmGroupOwnersOnly: true, today: TODAY }).run('apply');
  assert.equal(first.ok, true);
  const hist = listByUrl(site, 'History');
  assert.ok(!hist.fields.some((f) => f.InternalName === 'OwnerId'));
  const check = await run('check');
  const planned = check.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | ');
  assert.match(planned, /Would add 4 columns to "History"/);
  assert.match(planned, /Would add the choices Cancelled, Reverted to "History"\/State/);
  assert.match(planned, /Would add 2 settings/);
  const settingsBefore = rows(listByUrl(site, 'Settings')).length;
  const apply = await run('apply');
  assert.equal(apply.result.ok, true, apply.stops.join(' | '));
  deq(hist.fields.filter((f) => f.InternalName === 'State')[0].Choices,
    ['Received', 'Planned', 'Applying', 'Failed', 'Needs attention', 'Applied', 'Void', 'Rolled Back', 'Cancelled', 'Reverted']);
  assert.ok(['OwnerId', 'PreviousOwnerId', 'DueDayAtEvent', 'CompletionKind'].every((n) => hist.fields.some((f) => f.InternalName === n)));
  assert.equal(rows(listByUrl(site, 'Settings')).length, settingsBefore + 2);
  site.writes.length = 0;
  const again = await run('check');
  assert.equal(again.result.created, 0, again.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
  deq(site.writes, []);
});


test('Check on a site set up before People.CanPostNotices existed finishes without stopping, and Apply then completes', async () => {
  const { site, run, ctx } = newSite();
  const old = plain(schema);
  const people = old.lists.filter((l) => l.key === 'people')[0];
  people.fields = people.fields.filter((f) => f.name !== 'CanPostNotices');
  const rest = ctx.CHS.rest.create(site.ctx.getWebPart());
  const first = await ctx.CHS.engine.create(rest, old, { log: () => {}, confirmGroupOwnersOnly: true, today: TODAY }).run('apply');
  assert.equal(first.ok, true);
  assert.ok(!listByUrl(site, 'People').fields.some((f) => f.InternalName === 'CanPostNotices'));
  site.writes.length = 0;
  const check = await run('check');
  deq(check.stops, []);
  assert.equal(check.result.ok, true);
  deq(site.writes, []);
  const planned = check.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | ');
  assert.match(planned, /Would add 1 column to "People"/);
  assert.match(planned, /Notice posters \(after the new People column is added\)/);
  const apply = await run('apply');
  assert.equal(apply.result.ok, true, apply.stops.join(' | '));
  assert.ok(listByUrl(site, 'People').fields.some((f) => f.InternalName === 'CanPostNotices'));
  site.writes.length = 0;
  const again = await run('check');
  assert.equal(again.result.created, 0, again.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
  deq(site.writes, []);
});

test('Setup 1.4 on a site set up by 1.3.2: adds Known as, co-owners, the checker, the notice columns and the "Other" type', async () => {
  const { site, run, ctx } = newSite();
  const old = plain(schema);
  const drop = { people: ['KnownAs'], actions: ['CoOwnerIds', 'CloseOutById'], notices: ['ImportantDays', 'ShownIn'] };
  old.lists.forEach((l) => { if (drop[l.key]) l.fields = l.fields.filter((f) => drop[l.key].indexOf(f.name) < 0); });
  const type = old.lists.filter((l) => l.key === 'register')[0].fields.filter((f) => f.name === 'EntryType')[0];
  type.choices = type.choices.filter((c) => c !== 'Other');
  const rest = ctx.CHS.rest.create(site.ctx.getWebPart());
  const first = await ctx.CHS.engine.create(rest, old, { log: () => {}, confirmGroupOwnersOnly: true, today: TODAY }).run('apply');
  assert.equal(first.ok, true);
  site.writes.length = 0;
  const check = await run('check');
  deq(check.stops, []);
  deq(site.writes, []);
  const planned = check.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | ');
  assert.match(planned, /Would add 1 column to "People"/);
  assert.match(planned, /Would add 2 columns to "Actions"/);
  assert.match(planned, /Would add 2 columns to "Noticeboard"/);
  const apply = await run('apply');
  assert.equal(apply.result.ok, true, apply.stops.join(' | '));
  ['ImportantDays', 'ShownIn'].forEach((n) => assert.ok(listByUrl(site, 'Noticeboard').fields.some((f) => f.InternalName === n), n));
  site.writes.length = 0;
  const again = await run('check');
  assert.equal(again.result.created, 0, again.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
  deq(site.writes, []);
});

test('Known as (1.4.1): names are matched in any word order and set once; unknown and unclear names are reported', async () => {
  const { site, run } = newSite();
  const peopleText = 'andrea.medlicott@example.test, Engineer, FLK\nrachel.boulden@example.test, Technician, GRS';
  await run('apply', { peopleText });
  const knownAsText = [
    '# full name – known as',
    'Joseph Pepper – Joe',
    'Pepper, Joseph – Joe',
    'Andrea Medlicott - Andrea',
    'Rachel Boulden – ' + 'R'.repeat(50),
    'Kai Todd – Kai',
    'no separator here'
  ].join('\n');
  site.writes.length = 0;
  const check = await run('check', { knownAsText });
  deq(site.writes, []);
  const planned = check.entries.filter((e) => e.step === 'Known as').map((e) => e.text).join('\n');
  assert.match(planned, /Would set the Known as name for Pepper Joseph to Joe/);
  assert.match(planned, /Would set the Known as name for Medlicott Andrea to Andrea/);
  assert.match(planned, /Not in the Hub yet: Kai Todd/);
  assert.match(planned, /Line 7: write it as/);
  const apply = await run('apply', { knownAsText });
  assert.equal(apply.result.ok, true, apply.stops.join(' | '));
  const known = Object.fromEntries(rows(listByUrl(site, 'People')).map((p) => [p.Title, p.KnownAs]));
  assert.equal(known['Pepper Joseph'], 'Joe');
  assert.equal(known['Medlicott Andrea'], 'Andrea');
  assert.equal(known['Boulden Rachel'], 'R'.repeat(40), 'cut to 40 characters');
  site.writes.length = 0;
  const again = await run('apply', { knownAsText });
  assert.equal(again.result.ok, true);
  assert.ok(again.entries.some((e) => /Pepper Joseph is already known as Joe/.test(e.text)));
  assert.ok(!again.entries.some((e) => e.step === 'Known as' && e.level === 'create'));
});

test('Known as lines pasted into the people box get one plain note, and nobody is added', async () => {
  const { site, run } = newSite();
  const r = await run('check', { peopleText: 'Joseph Pepper – Joe\nMark Wellstead – Mark Wellstead\nDoti Cange-Ainsworth – Doti' });
  const warns = r.entries.filter((e) => e.step === 'People import' && e.level === 'warn').map((e) => e.text);
  assert.equal(warns.length, 1, warns.join(' | '));
  assert.match(warns[0], /3 lines look like Known as names .* Paste them into the Known as box instead/);
  deq(site.writes, []);
});

test('The Setup version is shown on the page and in the log, so an old copy is plain to see', () => {
  const built = require('fs').readFileSync(require('path').join(__dirname, '..', 'dist', 'CH_Setup.js'), 'utf8');
  const version = /var CHS = \{ version: "([0-9.]+)" \}/.exec(built);
  assert.ok(version, 'the built script carries its version');
  assert.match(built, /'Competency Hub Setup ' \+ CHS\.version/);
  assert.match(built, /'Setup ' \+ \(CHS\.version/);
});

test('Known as: a name that matches two people is skipped', async () => {
  const { site, run } = newSite();
  await run('apply', { peopleText: 'mark.buckley@example.test, Technician, GRS\nmark.wellstead@example.test, Team Leader,' });
  rows(listByUrl(site, 'People')).forEach((p) => { if (/Mark/.test(p.Title)) p.Title = 'Mark Smith'; });
  const r = await run('apply', { knownAsText: 'Mark Smith – Mark' });
  assert.ok(r.entries.some((e) => /More than one person matches "Mark Smith"/.test(e.text)));
  assert.ok(rows(listByUrl(site, 'People')).every((p) => !p.KnownAs || p.KnownAs !== 'Mark'));
});

test('No list where people read only their own items has a column that must be unique (SharePoint refuses it)', () => {
  schema.lists.filter((l) => l.readSecurity === 2).forEach((l) => {
    const unique = (l.standard ? schema.standardColumns : []).concat(l.fields).filter((f) => f.unique).map((f) => f.name);
    deq(unique, [], l.title);
    assert.ok(!l.titleUnique, l.title);
  });
});

test('The Noticeboard regrant: All Users keep Read, only Notice posters may add, and the people on the site are Notice posters', async () => {
  const { site, run, ctx } = newSite();
  // The site as release 1 left it: All Users could add notices; there was no Notice posters group.
  const old = plain(schema);
  old.groups = old.groups.filter((g) => g.key !== 'NoticePosters');
  old.lists.filter((l) => l.key === 'notices')[0].permissions = { list: [['AllUsers', 'Add']] };
  old.lists = old.lists.filter((l) => l.key !== 'feedback' && l.key !== 'minutes');
  old.lists.filter((l) => l.key === 'people')[0].fields = old.lists.filter((l) => l.key === 'people')[0].fields.filter((f) => f.name !== 'CanPostNotices');
  const rest = ctx.CHS.rest.create(site.ctx.getWebPart());
  assert.equal((await ctx.CHS.engine.create(rest, old, { log: () => {}, confirmGroupOwnersOnly: true, today: TODAY }).run('apply')).ok, true);
  const notices = listByUrl(site, 'Noticeboard');
  const allUsers = groupId(site, 'Competency Hub – All Users');
  const add = roleId(site, 'Competency Hub Add');
  const read = roleId(site, 'Competency Hub Read');
  assert.ok(notices.ra.some((a) => a.p === allUsers && a.r.includes(add)), 'before: All Users add');

  const check = await run('check');
  const planned = check.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | ');
  assert.match(planned, /Would give "Noticeboard" its own permissions: Owners: Full Control; All Users: Read; Notice Posters: Add/);
  assert.ok(check.entries.some((e) => e.text === 'The area folders of "Noticeboard" take their permissions from the list.'), 'Check confirms the folders inherit');
  assert.ok(notices.ra.some((a) => a.p === allUsers && a.r.includes(add)), 'Check changes nothing');

  const apply = await run('apply');
  assert.equal(apply.result.ok, true, apply.stops.join(' | '));
  const posters = groupId(site, 'Competency Hub – Notice Posters');
  deq(notices.ra.filter((a) => a.p === allUsers).map((a) => a.r), [[read]], 'All Users: read only');
  deq(notices.ra.filter((a) => a.p === posters).map((a) => a.r), [[add]], 'Notice posters: add');
  // the area folders still inherit from the list, so the one change covers them all
  schema.areas.forEach((a) => assert.equal(!!folder(site, notices, a.key).unique, false, a.key));
  // the first administrator, already on the site, is a Notice poster
  assert.ok(site.groups.filter((g) => g.Id === posters)[0].users.includes(site.me().Id));
  // the order was safe: Notice posters got Add before All Users lost it
  const addAt = site.writes.findIndex((w) => /addroleassignment\(principalid=\d+,roledefid=/.test(w) && w.includes('principalid=' + posters + ','));
  const removeAt = site.writes.findIndex((w) => /removeroleassignment/.test(w));
  assert.ok(addAt >= 0 && removeAt > addAt, 'grant before removal');
  site.writes.length = 0;
  const again = await run('check');
  assert.equal(again.result.created, 0, again.entries.filter((e) => e.level === 'create').map((e) => e.text).join(' | '));
});

test('The Noticeboard change stops, changing nothing, if an area folder has its own permissions', async () => {
  const { site, run } = newSite();
  assert.equal((await run('apply')).result.ok, true);
  const notices = listByUrl(site, 'Noticeboard');
  const f = folder(site, notices, 'FLK');
  f.unique = true;
  f.ra = [{ p: groupId(site, 'Competency Hub – All Users'), r: [roleId(site, 'Competency Hub Read')] }];
  const before = JSON.stringify(notices.ra);
  const apply = await run('apply');
  assert.ok(apply.stops.some((s) => /area folders of "Noticeboard" have their own permissions.*FLK/.test(s)), apply.stops.join(' | '));
  assert.equal(JSON.stringify(notices.ra), before, 'the list grants are untouched');
});
