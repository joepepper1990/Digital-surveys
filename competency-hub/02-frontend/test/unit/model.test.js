// Model rules: uncommitted creates hidden, flags by folder and ID, shared actions, incomplete reads.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadSeed, plain } = require('../load.js');

const TODAY = '2026-10-21';
const CH = loadApp();
const seed = loadSeed(TODAY);

function raw(over) {
  const r = {};
  const map = { competencies: 'Competencies', members: 'Competency Members', actions: 'Actions', notices: 'Noticeboard', updates: 'Updates', meetings: 'Meetings', calendar: 'Calendar Events' };
  Object.keys(map).forEach((k) => { r[k] = { rows: seed[map[k]], complete: true }; });
  return Object.assign(r, over || {});
}
const rachel = seed.People.find((p) => p.Title === 'Rachel Boulden');
const areasByKey = Object.fromEntries(seed.Competencies.map((c) => [c.CompetencyKey, { status: c.Status }]));
const access = CH.access.build(rachel, [], areasByKey);
const build = (r) => CH.model.build(r || raw(), seed.People, access, TODAY, new Date(TODAY + 'T12:00:00Z'));

test('an uncommitted create is never shown', () => {
  const m = build();
  assert.equal(m.actions.some((a) => a.id === 99), false);
  assert.equal(CH.model.isUncommitted({ PendingRequestKey: 'k', CreatedRequestKey: 'F|k' }), true);
  assert.equal(CH.model.isUncommitted({ PendingRequestKey: 'k', CreatedRequestKey: 'IMPORT-1' }), false);
});

test('a shared action appears in both areas but once in the full list', () => {
  const m = build();
  const shared = m.actions.filter((a) => a.title === 'Contamination monitor checks');
  assert.equal(shared.length, 1);
  assert.equal(m.inArea(shared[0], 'FLK'), true);
  assert.equal(m.inArea(shared[0], 'RP'), true);
});

test('flags count only in the source area folder, from members, and withdrawals need entitlement', () => {
  const m = build();
  assert.equal(m.stats.FLK.flagged, 2, 'notice 1 and notice 2 (withdrawal by a non-entitled person ignored)');
  assert.equal(m.stats.RP.flagged, 1, 'notice 3, not the copy placed in the Flask folder');
  assert.equal(m.stats.RW.flagged, 1, 'only the member\'s flag counts, not the non-member\'s');
});

test('a notice posted by a non-member is labelled as coming from outside the area', () => {
  const m = build();
  const idea = m.notices.find((n) => n.title.startsWith('Improvement idea'));
  assert.equal(idea.areaKey, 'DSL');
  assert.equal(idea.fromOutside, true);
  const member = m.notices.find((n) => n.title === 'Calibration rig out of service');
  assert.equal(member.fromOutside, false);
});

test('late and due-soon counts follow the date rules', () => {
  const m = build();
  assert.equal(m.stats.GRS.late, 2);
  assert.equal(m.stats.GRS.meetingStale, true);
  assert.equal(m.stats.FLK.meetingStale, false);
  const probe = m.actions.find((a) => a.title === 'Replace FH40 probe');
  assert.equal(probe.dueText, '2 days late');
  const closeOut = m.actions.find((a) => a.title === 'Dosimeter reader software update');
  assert.equal(closeOut.waitingCloseOut, true);
});

test('a failed or truncated read is reported, never shown as complete', () => {
  const m = build(raw({ actions: { rows: [], complete: false, error: 404 }, notices: { rows: seed.Noticeboard.slice(0, 2), complete: false } }));
  assert.equal(m.sections.actions, 'unavailable');
  assert.equal(m.sections.notices, 'partial');
  assert.equal(m.sections.meetings, 'complete');
});

test('a new area is not overdue for a meeting until the limit has passed since tracking started', () => {
  const comps = (start) => seed.Competencies.map((c) => Object.assign({}, c, { TrackingStart: start }));
  const empty = { rows: [], complete: true };
  // Stored as UK midnight in UTC, as SharePoint holds date-only values.
  const fresh = build(raw({ competencies: { rows: comps('2026-10-20T23:00:00Z'), complete: true }, meetings: empty }));
  assert.equal(Object.values(fresh.stats).filter((s) => s.meetingStale).length, 0);
  const old = build(raw({ competencies: { rows: comps('2026-09-14T23:00:00Z'), complete: true }, meetings: empty }));
  assert.equal(Object.values(old.stats).filter((s) => s.meetingStale).length, 10, '36 days after tracking started');
  const edge = build(raw({ competencies: { rows: comps('2026-09-15T23:00:00Z'), complete: true }, meetings: empty }));
  assert.equal(Object.values(edge.stats).filter((s) => s.meetingStale).length, 0, 'exactly 35 days is not yet overdue');
});

test('the greeting uses the profile first name, then the email address, then the display name', () => {
  const first = CH.views.home.firstName;
  const person = { Title: 'Pepper Joseph', Email: 'joseph.pepper@example.test' };
  assert.equal(first({ firstName: 'Joe', person }), 'Joe');
  assert.equal(first({ firstName: '', person }), 'Joseph');
  assert.equal(first({ person: { Title: 'Pepper Joseph', Email: 'JOSEPH.PEPPER@example.test' } }), 'Joseph');
  assert.equal(first({ person: { Title: 'Rachel Boulden', Email: 'rboulden@example.test' } }), 'Rachel');
});

test('a finalised meeting that discussed an item clears flags raised up to its cut-off, not after', () => {
  const flag2 = seed.Updates.filter((u) => u.ParentType === 'Notice' && u.ParentId === 2 && u.EntryType === 'Flagged').map((u) => u.Id);
  const upto = Math.max(...flag2);
  const before = build();
  const cleared = build(raw({ discussed: [{ competencyId: 1, source: 'Notice:2', upto: upto, iso: '2026-10-16' }] }));
  assert.equal(cleared.stats.FLK.flagged, before.stats.FLK.flagged - 1);
  assert.equal(cleared.flags['Notice:2'].flagged, false);
  const earlier = build(raw({ discussed: [{ competencyId: 1, source: 'Notice:2', upto: upto - 1000, iso: '2026-10-16' }] }));
  assert.equal(earlier.stats.FLK.flagged, before.stats.FLK.flagged, 'a flag raised after the cut-off still counts');
});

test('release 1.2: a saved change reads only the lists it can alter; the others are kept from the last read', async () => {
  const CH2 = loadApp();
  const asked = [];
  const sp = { items: async (title) => { asked.push(title); return { rows: [{ Id: asked.length }], complete: true }; } };
  const prev = await CH2.model.load(sp);
  const full = asked.length;
  asked.length = 0;
  const next = await CH2.model.load(sp, ['actions', 'settings'], prev);
  assert.ok(full >= 9, 'a full read asks every list');
  assert.deepEqual(asked.slice().sort(), [CH2.config.lists.actions.title, CH2.config.lists.settings.title].sort());
  assert.equal(next.notices, prev.notices);
  assert.notEqual(next.actions, prev.actions);
});

test('app 2.0: a list SharePoint cannot give again keeps what was read last time, marked stale; a first read that fails is empty', async () => {
  const CH2 = loadApp({ window: { localStorage: { getItem: () => null, setItem: () => {} } } });
  let busy = false;
  const sp = { items: async (title) => {
    if (busy && title === CH2.config.lists.meetings.title) { const e = new Error('Too many requests'); e.status = 429; throw e; }
    return { rows: [{ Id: 7, Title: title }], complete: true };
  } };
  const prev = await CH2.model.load(sp);
  busy = true;
  const next = await CH2.model.load(sp, ['meetings', 'actions'], prev);
  assert.equal(next.meetings.stale, true);
  assert.equal(next.meetings.error, 429);
  assert.deepEqual(plain(next.meetings.rows), plain(prev.meetings.rows), 'the meeting is still there');
  assert.notEqual(next.actions, prev.actions);
  assert.ok(!next.actions.stale);
  const first = await CH2.model.load(sp);
  assert.deepEqual(plain(first.meetings.rows), []);
  assert.ok(!first.meetings.stale, 'nothing to keep on a first read');
  busy = false;
  const again = await CH2.model.load(sp, ['meetings'], next);
  assert.ok(!again.meetings.stale, 'recovers on the next good read');
});

test('app 2.0: the log keeps the last notes of each kind, at most one a minute, newest first', () => {
  const store = {};
  const CH2 = loadApp({ window: { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } } } });
  CH2.log.note('read-failed', 'meetings could not be read again');
  CH2.log.note('read-failed', 'again within the minute');
  CH2.log.note('second-start', 'Welcome started the Hub again');
  const list = CH2.log.recent(7);
  assert.deepEqual(plain(list.map((e) => e.kind)), ['second-start', 'read-failed']);
  assert.match(CH2.log.asText(7), /read-failed: meetings could not be read again/);
});
