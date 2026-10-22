// Action rules shared by the forms and the simulated request flow (plan B.3, B.4, E.3, F.2, F.3).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

const CH = loadApp();
const R = CH.rules;
const TODAY = '2026-10-21';

const ctx = {
  today: TODAY, maxYears: 2,
  canWrite: (k) => ['FLK', 'GRS'].includes(k),
  ownerAllowed: (k, id) => (k === 'FLK' && [112, 126].includes(id)) || (k === 'GRS' && id === 126)
};
const good = { title: 'Replace FH40 probe', description: 'The probe failed its check.', areaKey: 'FLK', ownerId: '112', dueIso: '2026-10-28', priority: 'Normal' };

test('years are added on calendar dates, and 29 February falls back to 28 February', () => {
  assert.equal(R.addYears('2026-10-21', 2), '2028-10-21');
  assert.equal(R.addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(R.addYears('2028-02-29', 4), '2032-02-29');
});

test('a complete action passes; each required field is named when missing', () => {
  assert.deepEqual(plain(R.validateRaise(good, ctx)), {});
  const e = R.validateRaise({}, ctx);
  assert.deepEqual(Object.keys(e).sort(), ['areaKey', 'description', 'dueIso', 'ownerId', 'title']);
});

test('raise: past dates, dates beyond two years, other areas and owners without access are refused', () => {
  assert.match(R.validateRaise(Object.assign({}, good, { dueIso: '2026-10-20' }), ctx).dueIso, /past/);
  assert.deepEqual(plain(R.validateRaise(Object.assign({}, good, { dueIso: TODAY }), ctx)), {}, 'today is allowed');
  assert.deepEqual(plain(R.validateRaise(Object.assign({}, good, { dueIso: '2028-10-21' }), ctx)), {}, 'exactly two years is allowed');
  assert.match(R.validateRaise(Object.assign({}, good, { dueIso: '2028-10-22' }), ctx).dueIso, /within 2 years/);
  assert.match(R.validateRaise(Object.assign({}, good, { areaKey: 'RW' }), ctx).areaKey, /your areas/);
  assert.match(R.validateRaise(Object.assign({}, good, { ownerId: '107' }), ctx).ownerId, /member of this area/);
  assert.match(R.validateRaise(Object.assign({}, good, { title: 'x'.repeat(256) }), ctx).title, /255/);
});

test('extend: the new date must be after the current deadline and not in the past; the reason 10 to 1,000 characters', () => {
  const late = { status: 'In Progress', dueIso: '2026-10-19' };
  const soon = { status: 'Open', dueIso: '2026-10-28' };
  assert.deepEqual(plain(R.validateExtend(soon, { newDueIso: '2026-11-04', reason: 'Parts delayed by supplier' }, { today: TODAY })), {});
  assert.match(R.validateExtend(soon, { newDueIso: '2026-10-28', reason: 'Parts delayed by supplier' }, { today: TODAY }).newDueIso, /after/);
  assert.match(R.validateExtend(late, { newDueIso: '2026-10-20', reason: 'Parts delayed by supplier' }, { today: TODAY }).newDueIso, /past/);
  assert.deepEqual(plain(R.validateExtend(late, { newDueIso: TODAY, reason: 'Parts delayed by supplier' }, { today: TODAY })), {}, 'a late action can move to today');
  assert.match(R.validateExtend(soon, { newDueIso: '2026-11-04', reason: 'too short' }, { today: TODAY }).reason, /10 characters/);
  assert.match(R.validateExtend(soon, { newDueIso: '2026-11-04', reason: 'x'.repeat(1001) }, { today: TODAY }).reason, /1,000/);
  assert.match(R.validateExtend({ status: 'Completed', dueIso: '2026-10-28' }, { newDueIso: '2026-11-04', reason: 'Parts delayed by supplier' }, { today: TODAY }).action, /no longer open/);
});

test('who may do what: owner and managers extend and complete; members add updates; others only read', () => {
  const access = (writes, manages) => ({ canWrite: () => writes, canManage: () => manages });
  const a = { ownerId: 112, raisedById: 103, areaKey: 'FLK', status: 'Open' };
  const base = (r) => { const p = plain(r); return { owner: p.owner, manager: p.manager, canUpdate: p.canUpdate, canExtend: p.canExtend, canComplete: p.canComplete }; };
  assert.deepEqual(base(R.roles(a, 112, access(true, false))), { owner: true, manager: false, canUpdate: true, canExtend: true, canComplete: true });
  assert.deepEqual(base(R.roles(a, 103, access(true, false))), { owner: false, manager: true, canUpdate: true, canExtend: true, canComplete: true }, 'the raiser');
  assert.deepEqual(base(R.roles(a, 120, access(true, false))), { owner: false, manager: false, canUpdate: true, canExtend: false, canComplete: false }, 'a technician member');
  assert.deepEqual(base(R.roles(a, 107, access(true, true))), { owner: false, manager: true, canUpdate: true, canExtend: true, canComplete: true }, 'an engineer of the area');
  assert.deepEqual(base(R.roles(a, 130, access(false, false))), { owner: false, manager: false, canUpdate: false, canExtend: false, canComplete: false }, 'a visitor');
  const done = Object.assign({}, a, { status: 'Completed' });
  assert.equal(R.roles(done, 112, access(true, false)).canExtend, false);
  assert.equal(R.roles(done, 112, access(true, false)).canComplete, false);
});

test('mark as done closes the action unless a close-out check is required', () => {
  assert.equal(R.completionStatus(false), 'Closed');
  assert.equal(R.completionStatus(true), 'Completed');
});

const open = { status: 'In Progress', ownerId: 112, raisedById: 103, areaKey: 'FLK', dueIso: '2026-10-28' };

test('status: a different open status; "waiting on something" needs what it is waiting on', () => {
  assert.deepEqual(plain(R.validateStatus(open, { status: 'Open' })), {});
  assert.match(R.validateStatus(open, { status: 'In Progress' }).status, /different status/);
  assert.match(R.validateStatus(open, { status: 'Closed' }).status, /Choose a status/);
  assert.match(R.validateStatus(open, { status: 'Awaiting Input', blocker: 'parts' }).blocker, /at least 10 characters/);
  assert.deepEqual(plain(R.validateStatus(open, { status: 'Awaiting Input', blocker: 'Waiting for the supplier.' })), {});
  assert.match(R.validateStatus(Object.assign({}, open, { status: 'Closed' }), { status: 'Open' }).action, /no longer open/);
});

test('reassign: someone else, allowed in the area, with a reason', () => {
  const allowed = { ownerAllowed: (k, id) => k === 'FLK' && [112, 126].includes(id) };
  assert.deepEqual(plain(R.validateReassign(open, { ownerId: 126, reason: 'Joe has the parts.' }, allowed)), {});
  assert.match(R.validateReassign(open, { ownerId: 112, reason: 'Joe has the parts.' }, allowed).ownerId, /other than the current owner/);
  assert.match(R.validateReassign(open, { ownerId: 107, reason: 'Joe has the parts.' }, allowed).ownerId, /member of this area/);
  assert.match(R.validateReassign(open, { ownerId: 126, reason: 'short' }, allowed).reason, /10 characters/);
  assert.match(R.validateReassign(open, { reason: 'Joe has the parts.' }, allowed).ownerId, /Choose who/);
});

test('close: an outcome; a note unless the outcome is Completed; a Completed action can be closed', () => {
  assert.deepEqual(plain(R.validateClose(open, { outcome: 'Completed' })), {});
  assert.match(R.validateClose(open, { outcome: 'Superseded', note: 'see' }).note, /at least 10 characters/);
  assert.deepEqual(plain(R.validateClose(open, { outcome: 'Superseded', note: 'Replaced by ACT-00051.' })), {});
  assert.match(R.validateClose(open, { outcome: 'Withdrawn' }).outcome, /Choose an outcome/);
  assert.deepEqual(plain(R.validateClose(Object.assign({}, open, { status: 'Completed' }), { outcome: 'Completed' })), {});
  assert.match(R.validateClose(Object.assign({}, open, { status: 'Closed' }), { outcome: 'Completed' }).action, /already closed/);
});

test('reopen: only a closed or completed action, with a reason', () => {
  assert.deepEqual(plain(R.validateReopen({ status: 'Closed' }, { reason: 'The probe failed again.' })), {});
  assert.match(R.validateReopen(open, { reason: 'The probe failed again.' }).action, /already open/);
  assert.match(R.validateReopen({ status: 'Completed' }, { reason: '' }).reason, /10 characters/);
});

test('edit: only the fields given are checked, and something must change', () => {
  assert.deepEqual(plain(R.validateEdit(open, { title: 'New title' })), {});
  assert.match(R.validateEdit(open, { title: ' ' }).title, /what needs doing/);
  assert.match(R.validateEdit(open, { priority: 'Urgent' }).priority, /priority/);
  assert.match(R.validateEdit(open, {}).action, /Nothing has changed/);
});

test('roles: managers reassign, close, reopen and edit; owners change status; nobody else', () => {
  const access = { canWrite: (k) => k === 'FLK', canManage: () => false };
  const owner = R.roles(open, 112, access);
  assert.deepEqual([owner.canStatus, owner.canReassign, owner.canClose, owner.canEdit], [true, false, false, false]);
  const raiser = R.roles(open, 103, access);
  assert.deepEqual([raiser.canStatus, raiser.canReassign, raiser.canClose, raiser.canEdit, raiser.canReopen], [true, true, true, true, false]);
  const closed = R.roles(Object.assign({}, open, { status: 'Closed' }), 103, access);
  assert.deepEqual([closed.canReopen, closed.canClose, closed.canStatus], [true, false, false]);
  const waiting = R.roles(Object.assign({}, open, { status: 'Completed' }), 103, access);
  assert.deepEqual([waiting.canClose, waiting.canReopen], [true, true]);
  const other = R.roles(open, 999, access);
  assert.equal([other.canStatus, other.canReassign, other.canClose, other.canReopen, other.canEdit].some(Boolean), false);
});
