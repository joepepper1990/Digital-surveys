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
        const status = /Status eq '([\w ]+)'/.exec(query)[1];
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
  assert.ok(queries.every((q) => /\$filter=Status eq '[\w ]+' and AuthorId eq 112$/.test(q)), queries.join('\n'));
});

test('resume asks only for requests still on their way, or waiting for an administrator', async () => {
  const queries = [];
  const tracker = CH.requests.tracker(fakeApp({}, queries), () => {});
  assert.equal(await tracker.resume(), 0);
  tracker.stop();
  assert.deepEqual(queries.map((q) => /Status eq '([\w ]+)'/.exec(q)[1]), ['Submitted', 'Processing', 'Failed', 'Needs attention']);
  assert.equal(tracker.entries().length, 0);
});

// Honest states (plan REV5 REL-2): each request status the flows write is shown for what it is.
function pollingApp(script) {
  let n = 0;
  return {
    person: { SiteUserId: 112 },
    sp: {
      items: async (title) => {
        if (title === 'Requests') return { rows: [script[Math.min(n++, script.length - 1)]], complete: true };
        if (title === 'Actions') return { rows: [{ Id: 40, LastRequestKey: 'k', PendingRequestKey: '' }], complete: true };
        return { rows: [], complete: true };
      },
      addToFolder: async () => 1
    }
  };
}
async function track(script, type) {
  const timers = [];
  const CH2 = loadApp({ setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} });
  const changes = [];
  const tracker = CH2.requests.tracker(pollingApp(script), (e) => changes.push(e.state + ':' + e.message));
  const entry = await tracker.submit({ type: type || 'ExtendDeadline', targetId: 40, payload: {}, label: 'x', key: 'k' });
  const settle = async () => { for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < script.length && timers.length; i++) { timers.shift()(); await settle(); }
  return { entry, changes };
}

test('a failed change is shown as retrying and still followed, then confirmed when recorded', async () => {
  const { entry, changes } = await track([{ Status: 'Failed' }, { Status: 'Submitted' }, { Status: 'Completed', ResultMessage: 'Deadline moved.', ResultId: 40 }]);
  assert.ok(changes.includes('submitted:Not recorded yet – retrying automatically.'), changes.join(' | '));
  assert.equal(entry.state, 'done');
});

test('needs attention, cancelled and reverted are never shown as saved', async () => {
  for (const [status, state] of [['Needs attention', 'attention'], ['Cancelled', 'cancelled'], ['Reverted', 'reverted']]) {
    const { entry } = await track([{ Status: status, ResultMessage: 'from the flow' }]);
    assert.equal(entry.state, state, status);
    assert.equal(entry.message, 'from the flow');
  }
});

test('nothing is sent while automatic processing is down, except an administrator\'s decision', async () => {
  const app = pollingApp([{ Status: 'Submitted' }]);
  app.queueBlocked = () => true;
  const tracker = CH.requests.tracker(app, () => {});
  await assert.rejects(tracker.submit({ type: 'ExtendDeadline', targetId: 40, payload: {}, label: 'x' }), /cannot be processed at the moment/);
  const entry = await tracker.submit({ type: 'RetryTransaction', targetId: 5, payload: { txId: 5 }, label: 'Try again', key: 'k9' });
  tracker.stop();
  assert.equal(entry.state, 'submitted');
});
