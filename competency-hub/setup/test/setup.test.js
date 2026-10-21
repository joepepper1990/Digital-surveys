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
    out.push(groupId(site, g.title) + ':' + roleId(site, 'Competency Hub ' + level));
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
  assert.equal(site.groups.filter((g) => g.Title.indexOf('Competency Hub – ') === 0).length, 13);
  site.groups.filter((g) => g.Title.indexOf('Competency Hub – ') === 0).forEach((g) => {
    assert.equal(g.OnlyAllowMembersViewMembership, true);
    assert.equal(g.AllowRequestToJoinLeave, false);
  });

  // Lists, settings and columns.
  assert.equal(schema.lists.length, 15);
  schema.lists.forEach((l) => {
    const list = listByUrl(site, l.url);
    assert.ok(list, l.url);
    assert.equal(list.Title, l.title);
    assert.equal(list.BaseTemplate, l.template);
    assert.equal(list.settings.EnableVersioning, true);
    assert.equal(list.settings.MajorVersionLimit, 100);
    assert.equal(list.settings.NoCrawl, !!l.noCrawl);
    if (l.template === 100) assert.equal(list.settings.WriteSecurity, l.writeSecurity || 1, l.url);
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
  assert.ok(check.entries.some((e) => e.text === 'Would give "Requests" its own permissions: Owners FullControl.'), 'inheriting Requests list is reported');
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
