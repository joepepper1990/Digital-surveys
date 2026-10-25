// How long changes take (release 1.2): the administrators' Timings, from the transaction rows.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

const CH = loadApp();

test('administrators\' timings: the middle and slowest times from sent to picked up and to saved, by kind of change', () => {
  const t = CH.views.admin.timings([
    { RequestType: 'ExtendDeadline', State: 'Applied', EventTime: '2026-10-26T09:00:00Z', FirstClaimedAt: '2026-10-26T09:02:00Z', ProcessedAt: '2026-10-26T09:02:40Z' },
    { RequestType: 'ExtendDeadline', State: 'Applied', EventTime: '2026-10-26T10:00:30Z', FirstClaimedAt: '2026-10-26T10:00:00Z', ProcessedAt: '2026-10-26T10:01:30Z' },
    { RequestType: 'RaiseAction', State: 'Applied', EventTime: '2026-10-26T11:00:00Z', FirstClaimedAt: '2026-10-26T11:04:00Z', ProcessedAt: '2026-10-26T11:05:00Z' },
    { RequestType: 'RaiseAction', State: 'Failed', EventTime: '2026-10-26T12:00:00Z', FirstClaimedAt: '2026-10-26T12:04:00Z' },
    { RequestType: 'MarkComplete', State: 'Applied', FirstClaimedAt: '2026-10-26T12:04:00Z', ProcessedAt: '2026-10-26T12:05:00Z' }
  ]);
  assert.equal(t.count, 3);
  const ext = t.list.filter((x) => x.type === 'ExtendDeadline')[0];
  // picked up: 120 s, and 0 s (the claim time is to the minute, so it can look earlier than sent); saved: 160 s and 60 s
  assert.deepEqual(plain([ext.count, ext.picked, ext.saved, ext.slowest, ext.label]), [2, 60, 110, 160, 'Move a deadline']);
  assert.deepEqual(plain([t.saved, t.slowest]), [160, 300]);
  assert.deepEqual(plain([CH.views.admin.took(42), CH.views.admin.took(160), CH.views.admin.took(1200), CH.views.admin.took(null)]), ['42 s', '2.7 min', '20 min', '–']);
});
