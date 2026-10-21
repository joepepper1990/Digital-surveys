// Model rules: uncommitted creates hidden, flags by folder and ID, shared actions, incomplete reads.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadSeed } = require('../load.js');

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
