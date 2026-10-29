// Limited mode (spec REL-5): each part of the automatic processing is judged on its own.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../load.js');

const CH = loadApp();
const at = (iso) => new Date(iso);
function rows(health, daily, hours) {
  return [{ Title: 'QueueHealth', Value: health ? JSON.stringify(health) : '' }, { Title: 'LastDailyRun', Value: daily || '' },
    { Title: 'MonitorHours', Value: hours || '07:00|19:45|60' }];
}
// Wednesday 22 October 2026, 10:00 in London (BST) is 09:00 UTC.
const WED_10 = at('2026-10-22T09:00:00Z');

test('a fresh healthy report and this morning\'s reminders: everything works', () => {
  const h = CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T08:50:00Z', attention: 2 }, '2026-10-22T05:00:00Z'), WED_10);
  assert.equal(h.processing, 'ok');
  assert.equal(h.reminders, 'ok');
  assert.equal(h.attention, 2);
});

test('the monitor reporting Down stops queued changes, with its reason', () => {
  const h = CH.health.judge(rows({ state: 'Down', reason: 'Changes are not being picked up by the request flow.', checkedAt: '2026-10-22T08:55:00Z' }), WED_10);
  assert.equal(h.processing, 'down');
  assert.equal(h.reason, 'Changes are not being picked up by the request flow.');
});

test('a monitor silent for more than 25 minutes in working hours counts as down', () => {
  assert.equal(CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T08:40:00Z' }), WED_10).processing, 'ok');
  const h = CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T08:30:00Z' }), WED_10);
  assert.equal(h.processing, 'down');
  assert.match(h.reason, /has not reported since 09:30/);
});

test('outside working hours the monitor reports hourly, so an hour and a half of silence is still fine', () => {
  const sat = at('2026-10-24T02:30:00Z');   // Saturday 03:30 in London
  assert.equal(CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-24T01:05:00Z' }), sat).processing, 'ok');
  assert.equal(CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-24T00:30:00Z' }), sat).processing, 'down');
});

test('reminders that have not run for a day never stop changes', () => {
  const h = CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T08:55:00Z' }, '2026-10-20T05:00:00Z'), WED_10);
  assert.equal(h.reminders, 'stale');
  assert.equal(h.processing, 'ok');
});

test('a monitor that has never reported blocks nothing', () => {
  const h = CH.health.judge(rows(null, ''), WED_10);
  assert.equal(h.processing, 'unknown');
  assert.equal(h.reminders, 'unknown');
});

test('at the start of the working day the last out-of-hours report still counts until the first check is due', () => {
  // Wednesday 07:10 in London (06:10 UTC); the last report was the 06:00 out-of-hours check
  const h = CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T05:00:00Z' }), at('2026-10-22T06:10:00Z'));
  assert.equal(h.processing, 'ok');
  // by 08:00 a working-hours check is overdue
  assert.equal(CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T05:00:00Z' }), at('2026-10-22T07:00:00Z')).processing, 'down');
});

test('when only the administration flow is behind, staff can carry on', () => {
  const h = CH.health.judge(rows({ state: 'Healthy', checkedAt: '2026-10-22T08:55:00Z', admin: 'Down', adminReason: 'Administration changes are not being picked up.' }), WED_10);
  assert.equal(h.processing, 'ok');
  assert.equal(h.administration, 'down');
  assert.equal(h.adminReason, 'Administration changes are not being picked up.');
});

test('the furthest deadline follows the MaxDeadlineYears setting, within 1 to 5 years', () => {
  const with_ = (v) => CH.health.judge(rows(null).concat([{ Title: 'MaxDeadlineYears', Value: v }]), WED_10).maxDeadlineYears;
  assert.equal(with_('1'), 1);
  assert.equal(with_('5'), 5);
  assert.equal(with_('9'), 2);
  assert.equal(with_('x'), 2);
  assert.equal(CH.health.judge(rows(null), WED_10).maxDeadlineYears, 2);
});
