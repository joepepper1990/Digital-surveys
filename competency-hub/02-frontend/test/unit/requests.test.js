// Changes being recorded survive a page reload (plan K7.9).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

const CH = loadApp();

function fakeApp(rowsByStatus, queries) {
  return {
    person: { SiteUserId: 112 },
    sp: {
      items: async (title, query) => {
        queries.push(query);
        const status = /Status eq '(\w+)'/.exec(query)[1];
        return { rows: rowsByStatus[status] || [], complete: true };
      }
    }
  };
}

test('resume tracks the person\'s own Submitted and Processing requests again, once each', async () => {
  const queries = [];
  const rows = {
    Submitted: [{ Id: 9, Title: 'More time for “Replace FH40 probe”', RequestKey: 'k2', RequestType: 'ExtendDeadline', TargetId: 40, Created: '2026-10-21T15:00:00Z' }],
    Processing: [{ Id: 8, Title: 'Raise “Check stock”', RequestKey: 'k1', RequestType: 'RaiseAction', TargetId: null, Created: '2026-10-21T14:58:00Z' }]
  };
  const tracker = CH.requests.tracker(fakeApp(rows, queries), () => {});
  assert.equal(await tracker.resume(), 2);
  await tracker.resume();
  tracker.stop();
  const entries = tracker.entries();
  assert.deepEqual(plain(entries.map((e) => e.key)), ['k1', 'k2']);
  assert.equal(entries[1].state, 'submitted');
  assert.equal(tracker.forTarget(40).label, 'More time for “Replace FH40 probe”');
  assert.equal(entries[0].submittedAt.toISOString(), '2026-10-21T14:58:00.000Z');
  assert.ok(queries.every((q) => /\$filter=Status eq '\w+' and AuthorId eq 112$/.test(q)), queries.join('\n'));
});

test('resume asks only for requests still waiting for the flow', async () => {
  const queries = [];
  const tracker = CH.requests.tracker(fakeApp({}, queries), () => {});
  assert.equal(await tracker.resume(), 0);
  tracker.stop();
  assert.deepEqual(queries.map((q) => /Status eq '(\w+)'/.exec(q)[1]), ['Submitted', 'Processing']);
  assert.equal(tracker.entries().length, 0);
});
