// Rules for notices, comments, the register, settings and feedback (spec NB-1 to NB-5, REG-1 to REG-5, ADM-4, FB-2).
// The Records and Administration flows apply the same checks; these are what the screens offer and refuse.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

const CH = loadApp();
const R = CH.rules;

function access(opts) {
  const o = Object.assign({ management: false, engineerIn: [], chairs: [], member: [] }, opts);
  return {
    isManagement: o.management,
    canModerate: (k) => o.management || o.engineerIn.includes(k),
    chairs: (k) => o.chairs.includes(k),
    canWrite: (k) => o.management || o.member.includes(k)
  };
}
const ownerAllowed = (k, id) => k === 'FLK' && [102, 112, 126].includes(id);
const entry = { areaKey: 'FLK', raisedById: 112, responsibleId: 114 };

test('raising an entry: a complete entry passes; each missing field is named', () => {
  const good = { areaKey: 'FLK', entryType: 'Degradation', impact: 'High', title: 'Rig drift', description: 'Drifting since Monday.' };
  assert.deepEqual(plain(R.validateEntry(good, { canWrite: (k) => k === 'FLK', ownerAllowed })), {});
  assert.deepEqual(plain(R.validateEntry(Object.assign({}, good, { entryType: 'Other' }), { canWrite: (k) => k === 'FLK', ownerAllowed })), {}, '"Other" is a type (1.9.0.0)');
  assert.deepEqual(Object.keys(R.validateEntry({}, { canWrite: () => false, ownerAllowed })).sort(),
    ['areaKey', 'description', 'entryType', 'impact', 'title']);
  assert.equal(R.validateEntry(Object.assign({}, good, { areaKey: 'RW' }), { canWrite: (k) => k === 'FLK', ownerAllowed }).areaKey, 'Choose one of your areas.');
});

test('changing an entry: an outcome is needed to resolve or close it; nothing changed is refused', () => {
  assert.equal(R.validateEntryUpdate(entry, { status: 'Resolved', outcome: 'short' }, { ownerAllowed }).outcome, 'Record the outcome (at least 10 characters).');
  assert.equal(R.validateEntryUpdate(entry, { status: 'Closed' }, { ownerAllowed }).outcome, 'Record the outcome (at least 10 characters).');
  assert.deepEqual(plain(R.validateEntryUpdate(entry, { status: 'Resolved', outcome: 'Fixed and checked over a week.' }, { ownerAllowed })), {});
  assert.deepEqual(plain(R.validateEntryUpdate(entry, { status: 'Under Review' }, { ownerAllowed })), {});
  assert.equal(R.validateEntryUpdate(entry, { status: 'Done' }, { ownerAllowed }).status, 'Choose a status.');
  assert.equal(R.validateEntryUpdate(entry, {}, { ownerAllowed }).entry, 'Nothing has changed.');
  assert.equal(R.validateEntryUpdate(entry, { responsibleId: 999 }, { ownerAllowed }).entry, 'Nothing has changed.', 'there is no responsible person from 1.9.0.0');
});

test('who looks after an entry (REG-2): raiser, engineers and meeting runners of the area, management', () => {
  assert.ok(R.managesEntry(entry, 112, access()));
  assert.ok(!R.managesEntry(entry, 114, access()), 'a responsible person no longer counts (1.9.0.0)');
  assert.ok(R.managesEntry(entry, 102, access({ engineerIn: ['FLK'] })));
  assert.ok(R.managesEntry(entry, 120, access({ chairs: ['FLK'] })));
  assert.ok(R.managesEntry(entry, 126, access({ management: true })));
  assert.ok(!R.managesEntry(entry, 120, access({ member: ['FLK'] })), 'a member alone does not');
  assert.ok(!R.managesEntry(entry, 120, access({ engineerIn: ['RW'], chairs: ['RW'] })), 'rights in another area do not count');
});

test('notices: authors edit and archive their own; only moderators pin; meeting rights alone do not moderate', () => {
  const n = { authorId: 112, areaKey: 'FLK' };
  assert.deepEqual(plain(R.noticeRoles(n, 112, access())), { author: true, moderator: false, canEdit: true, canArchive: true, canPin: false, canMarkImportant: true });
  assert.deepEqual(plain(R.noticeRoles(n, 102, access({ engineerIn: ['FLK'] }))), { author: false, moderator: true, canEdit: true, canArchive: true, canPin: true, canMarkImportant: true });
  const chair = R.noticeRoles(n, 120, access({ chairs: ['FLK'], member: ['FLK'] }));
  assert.ok(!chair.canEdit && !chair.canPin && !chair.canArchive);
});

test('notice edits: only what changed is checked; an empty edit is refused', () => {
  assert.deepEqual(plain(R.validateNoticeEdit({ title: 'New title' })), {});
  assert.equal(R.validateNoticeEdit({ title: '  ' }).title, 'Give the notice a title.');
  assert.equal(R.validateNoticeEdit({ body: 'x'.repeat(5001) }).body, 'Keep the notice to 5,000 characters or fewer.');
  assert.equal(R.validateNoticeEdit({ category: 'Gossip' }).category, 'Choose a category.');
  assert.equal(R.validateNoticeEdit({}).notice, 'Nothing has changed.');
});

test('comments: required, and at most 2,000 characters', () => {
  assert.equal(R.validateComment({ body: ' ' }).body, 'Write your comment.');
  assert.equal(R.validateComment({ body: 'x'.repeat(2001) }).body, 'Keep the comment to 2,000 characters or fewer.');
  assert.deepEqual(plain(R.validateComment({ body: 'Thanks' })), {});
});

test('settings: the same ranges as the Administration flow', () => {
  const item = (name) => CH.views.settings.ITEMS.filter((i) => i.name === name)[0];
  assert.equal(CH.views.settings.check(item('DueSoonDays'), '30'), '');
  assert.equal(CH.views.settings.check(item('DueSoonDays'), '0'), 'Enter a whole number from 1 to 30.');
  assert.equal(CH.views.settings.check(item('DueSoonDays'), '7.5'), 'Enter a whole number from 1 to 30.');
  assert.equal(CH.views.settings.check(item('MaxDeadlineYears'), '6'), 'Enter a whole number from 1 to 5.');
  assert.equal(CH.views.settings.check(item('MonitorHours'), '07:00|19:45|60'), '');
  assert.match(CH.views.settings.check(item('MonitorHours'), '19:45|07:00|60'), /start before end/);
  assert.match(CH.views.settings.check(item('MonitorHours'), '07:00|19:45|5'), /20 to 90, in tens/);
  assert.match(CH.views.settings.check(item('MonitorHours'), '07:00|19:45|15'), /20 to 90, in tens/);
  assert.equal(CH.views.settings.check(item('MonitorHours'), '07:00|19:45|30'), '');
  assert.deepEqual(plain(CH.views.settings.ITEMS.map((i) => i.name)), ['ReminderDaysBefore', 'DueSoonDays', 'OverdueReminderIntervalDays', 'MaxDeadlineYears', 'MonitorHours',
    'InvitesEnabled', 'PdfEnabled']);
  assert.equal(CH.views.settings.check(item('InvitesEnabled'), 'No'), '');
  assert.equal(CH.views.settings.check(item('PdfEnabled'), 'Maybe'), 'Choose Yes or No.');
});

test('feedback: one of the four types, and a description', () => {
  assert.deepEqual(plain(CH.views.feedback.validate({ type: 'Report a bug', description: 'It broke.' })), {});
  assert.deepEqual(plain(Object.keys(CH.views.feedback.validate({ type: 'Complaint', description: ' ' })).sort()), ['description', 'type']);
  assert.deepEqual(plain(CH.views.feedback.TYPES), ['Suggest an improvement', 'Report a bug', 'Ask a question', 'Other feedback']);
});

test('"due soon" follows the DueSoonDays setting', () => {
  const D = CH.dates;
  const saved = CH.config.dueSoonDays;
  try {
    CH.config.dueSoonDays = 7;
    assert.equal(D.dueWords('2026-10-28', '2026-10-21').group, 'soon');
    assert.equal(D.dueWords('2026-10-29', '2026-10-21').group, 'later');
    CH.config.dueSoonDays = 3;
    assert.deepEqual(plain(D.dueWords('2026-10-24', '2026-10-21')), { group: 'soon', text: 'Due Saturday' });
    assert.deepEqual(plain(D.dueWords('2026-10-26', '2026-10-21')), { group: 'later', text: 'Due Monday' });
    CH.config.dueSoonDays = 14;
    assert.deepEqual(plain(D.dueWords('2026-11-04', '2026-10-21')), { group: 'soon', text: 'Due 4 Nov' });
  } finally { CH.config.dueSoonDays = saved; }
});

test('a UK form date-time for SharePoint fields, in UK time across the clock change', () => {
  assert.equal(CH.dates.ukFormDateTime(new Date('2026-10-23T09:05:00Z')), '23/10/2026 10:05');
  assert.equal(CH.dates.ukFormDateTime(new Date('2026-12-01T09:05:00Z')), '01/12/2026 09:05');
});
