// About how long a change will take, learned from this person's own recent changes (app 1.3.1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

function storage() {
  const store = {};
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, store };
}
function app() {
  const ls = storage();
  const CH = loadApp({ window: { localStorage: ls } });
  return { eta: CH.eta, ls };
}
const T0 = Date.parse('2026-10-28T10:00:00Z');
const entry = (over) => Object.assign({ type: 'ExtendDeadline', submittedAt: new Date(T0), state: 'submitted' }, over);

test('nothing known: the measured defaults, said as "usually"', () => {
  const { eta } = app();
  assert.deepEqual(plain(eta.expected('ExtendDeadline')), { pickup: 30, work: 20, total: 50, learned: false });
  assert.deepEqual(plain(eta.expected('FinaliseMeeting')), { pickup: 30, work: 90, total: 120, learned: false });
  const r = eta.remaining(entry(), T0);
  assert.equal(r.stage, 'pickup');
  assert.equal(r.fraction, 0);
  assert.equal(eta.words(r, false), 'Waiting to be picked up · usually about 50 s');
  assert.equal(eta.words(r, true), 'usually about 50 s');
});

test('the ring moves with time, jumps on when the flow picks the change up, and never fills before it is confirmed', () => {
  const { eta } = app();
  const r1 = eta.remaining(entry(), T0 + 15000);
  assert.ok(r1.fraction > 0.2 && r1.fraction < 0.6, r1.fraction);
  assert.equal(eta.words(r1, false), 'Waiting to be picked up · usually about 35 s');
  const r2 = eta.remaining(entry({ processingAt: T0 + 20000 }), T0 + 21000);
  assert.equal(r2.stage, 'work');
  assert.ok(r2.fraction >= 0.6, r2.fraction);
  assert.equal(eta.words(r2, false), 'Being recorded · usually about 20 s');
  const r3 = eta.remaining(entry({ processingAt: T0 + 20000 }), T0 + 45000);
  assert.equal(r3.fraction, eta.CAP);
  assert.equal(eta.words(r3, false), 'Any moment now.');
  assert.equal(eta.words(r3, true), 'any moment');
  const r4 = eta.remaining(entry(), T0 + 80000);
  assert.equal(r4.stage, 'late');
  assert.equal(r4.seconds, null);
  assert.equal(r4.fraction, 0.6, 'still at the pick-up share: nothing has been picked up');
  assert.match(eta.words(r4, false), /^Taking a little longer than usual – usually about 50 s/);
  assert.equal(eta.remaining(entry({ state: 'done' }), T0).fraction, 1);
});

test('finished changes teach the estimate; twelve are kept per kind; storage failures are ignored', () => {
  const { eta, ls } = app();
  for (let i = 0; i < 15; i++) eta.learn('ExtendDeadline', T0, T0 + 10000 + i * 1000, T0 + 40000);
  const kept = JSON.parse(ls.store[eta.KEY]).ExtendDeadline;
  assert.equal(kept.pickup.length, 12);
  assert.deepEqual(plain(eta.expected('ExtendDeadline')), { pickup: 18.5, work: 21.5, total: 40, learned: true });
  assert.equal(eta.words(eta.remaining(entry(), T0), false), 'Waiting to be picked up · about 40 s');
  // a change first seen already finished teaches the total only
  eta.learn('MarkComplete', T0, null, T0 + 60000);
  assert.deepEqual(plain(eta.expected('MarkComplete')), { pickup: 36, work: 24, total: 60, learned: true });
  eta.learn('MarkComplete', T0, T0 - 5, T0 + 60000);  // a processing time before sending is not believed
  assert.equal(JSON.parse(ls.store[eta.KEY]).MarkComplete.pickup.length, 0);
  eta.learn('X', null, null, null);
  const broken = loadApp({ window: { localStorage: { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } } } }).eta;
  broken.learn('ExtendDeadline', T0, T0 + 1000, T0 + 2000);
  // 1.4.1: kept in memory for the rest of the page, but not remembered: a fresh page starts from the defaults
  assert.equal(broken.expected('ExtendDeadline').learned, true);
  const fresh = loadApp({ window: { localStorage: { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } } } }).eta;
  assert.equal(fresh.expected('ExtendDeadline').learned, false);
});

test('a fresh browser is seeded from the person\'s finished requests, until live samples exist', () => {
  const { eta } = app();
  eta.seed([{ RequestType: 'RaiseAction', Created: '2026-10-28T09:00:00Z', ProcessedAt: '2026-10-28T09:01:10Z' },
    { RequestType: 'RaiseAction', Created: '2026-10-28T09:05:00Z', ProcessedAt: '2026-10-28T09:05:50Z' },
    { RequestType: 'RaiseAction', Created: '2026-10-28T09:06:00Z', ProcessedAt: 'bad' }]);
  assert.deepEqual(plain(eta.expected('RaiseAction')), { pickup: 60 * 30 / 55, work: 60 * 25 / 55, total: 60, learned: true });
  eta.seed([{ RequestType: 'RaiseAction', Created: '2026-10-28T09:00:00Z', ProcessedAt: '2026-10-28T09:10:00Z' }]);
  assert.equal(eta.expected('RaiseAction').total, 60, 'seeded once only');
  eta.learn('RaiseAction', T0, T0 + 20000, T0 + 30000);
  assert.deepEqual(plain(eta.expected('RaiseAction')), { pickup: 20, work: 10, total: 30, learned: true });
});

test('long waits are said in minutes', () => {
  const { eta } = app();
  assert.equal(eta.words({ stage: 'pickup', seconds: 120, expected: 120, learned: true }, true), 'about 2 min');
  assert.equal(eta.words({ stage: 'pickup', seconds: 100, expected: 120, learned: true }, true), 'about 1.5 min');
});
