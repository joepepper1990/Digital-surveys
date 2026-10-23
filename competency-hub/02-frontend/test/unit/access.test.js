// Identity fails closed, and the access rules of plan E.0 / K4.1.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');
const A = loadApp().access;

const person = (over) => Object.assign({ SiteUserId: 112, Title: 'Rachel Boulden', Role: 'Technician', Status: 'Active', IsAdministrator: false }, over);
const areas = { FLK: { status: 'Active' }, RW: { status: 'Active' }, OLD: { status: 'Archived' } };

test('identity: a registered, active person is resolved', () => {
  const r = A.resolveIdentity({ Id: 112 }, [person()]);
  assert.equal(r.ok, true);
  assert.equal(r.person.Title, 'Rachel Boulden');
});

test('identity fails closed: unknown, duplicate, left, missing user or unknown role', () => {
  assert.deepEqual(plain(A.resolveIdentity({ Id: 999 }, [person()])), { ok: false, reason: 'NOT_REGISTERED' });
  assert.deepEqual(plain(A.resolveIdentity({ Id: 112 }, [person(), person({ Title: 'Copy' })])), { ok: false, reason: 'DUPLICATE' });
  assert.deepEqual(plain(A.resolveIdentity({ Id: 112 }, [person({ Status: 'Left' })])), { ok: false, reason: 'LEFT' });
  assert.deepEqual(plain(A.resolveIdentity(null, [person()])), { ok: false, reason: 'UNAVAILABLE' });
  assert.deepEqual(plain(A.resolveIdentity({ Id: 112 }, [person({ Role: 'Read Only' })])), { ok: false, reason: 'UNAVAILABLE' });
  assert.deepEqual(plain(A.resolveIdentity({ Id: 112 }, [])), { ok: false, reason: 'NOT_REGISTERED' });
});

test('technician: writes in own area only, may post a notice anywhere active', () => {
  const acc = A.build(person(), [{ areaKey: 'FLK', canManageMeetings: false }], areas);
  assert.equal(acc.canWrite('FLK'), true);
  assert.equal(acc.canWrite('RW'), false);
  assert.equal(acc.canPostNotice('RW'), true);
  assert.equal(acc.canManage('FLK'), false);
  assert.equal(acc.runsMeetings('FLK'), false);
  assert.deepEqual(Array.from(acc.memberAreas), ['FLK']);
});

test('engineer: manages and runs meetings in own areas only', () => {
  const acc = A.build(person({ Role: 'Engineer' }), [{ areaKey: 'FLK', canManageMeetings: true }], areas);
  assert.equal(acc.canManage('FLK'), true);
  assert.equal(acc.runsMeetings('FLK'), true);
  assert.equal(acc.canManage('RW'), false);
  assert.equal(acc.canWrite('RW'), false);
});

test('a technician delegated as meeting administrator can run that area\'s meetings', () => {
  const acc = A.build(person(), [{ areaKey: 'FLK', canManageMeetings: true }], areas);
  assert.equal(acc.runsMeetings('FLK'), true);
  assert.equal(acc.canManage('FLK'), true);
});

test('Team Leader and Group Head write and manage in every active area without memberships', () => {
  ['Team Leader', 'Group Head'].forEach((role) => {
    const acc = A.build(person({ Role: role }), [], areas);
    assert.equal(acc.isManagement, true);
    assert.equal(acc.canWrite('FLK'), true);
    assert.equal(acc.canManage('RW'), true);
  });
});

test('archived areas are read-only for everyone, including management', () => {
  const acc = A.build(person({ Role: 'Group Head' }), [{ areaKey: 'OLD', canManageMeetings: true }], areas);
  assert.equal(acc.canWrite('OLD'), false);
  assert.equal(acc.canPostNotice('OLD'), false);
  assert.equal(acc.canManage('OLD'), false);
});

test('the administrator flag alone grants nothing operational', () => {
  const acc = A.build(person({ IsAdministrator: true }), [], areas);
  assert.equal(acc.isAdministrator, true);
  assert.equal(acc.canWrite('FLK'), false);
  assert.equal(acc.canManage('FLK'), false);
});

test('"Can post notices" switched off: no notice posting anywhere, everything else unchanged', () => {
  const acc = A.build(person({ CanPostNotices: false }), [{ areaKey: 'FLK', canManageMeetings: false }], areas);
  assert.equal(acc.canPostNotice('FLK'), false);
  assert.equal(acc.canPostNotice('RW'), false);
  assert.equal(acc.canWrite('FLK'), true);
  assert.equal(A.build(person(), [], areas).canPostNotice('RW'), true);
});
