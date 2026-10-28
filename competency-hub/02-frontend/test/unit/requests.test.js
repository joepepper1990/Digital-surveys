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
  assert.ok(queries.every((q) => /\$filter=Status eq '[\w ]+' and AuthorId eq 112( and Modified ge datetime'[\dT:.Z-]+')?$/.test(q)), queries.join('\n'));
});

test('resume asks for requests still on their way, waiting for an administrator, or cancelled or reverted in the last day', async () => {
  const queries = [];
  const tracker = CH.requests.tracker(fakeApp({}, queries), () => {});
  assert.equal(await tracker.resume(), 0);
  tracker.stop();
  assert.deepEqual(queries.map((q) => /Status eq '([\w ]+)'/.exec(q)[1]), ['Submitted', 'Processing', 'Failed', 'Needs attention', 'Cancelled', 'Reverted']);
  assert.ok(queries.slice(4).every((q) => /and Modified ge datetime'/.test(q)), queries.join('\n'));
  assert.equal(tracker.entries().length, 0);
});

// Honest states (spec REL-2): each request status the flows write is shown for what it is.
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

// Release 1.3: changes to one record go one at a time, in order; what waits survives a reload; a refusal holds the rest.
function queueApp() {
  const store = { Requests: [], Actions: [{ Id: 40, Revision: 2, LastRequestKey: '', PendingRequestKey: '' }], History: [] };
  const app = {
    person: { SiteUserId: 112 },
    sp: {
      items: async (title, query) => {
        if (title === 'Requests') {
          const key = /RequestKey eq '([^']+)'/.exec(query);
          if (key) return { rows: store.Requests.filter((r) => r.RequestKey === key[1]), complete: true };
          return { rows: [], complete: true };
        }
        if (title === 'Actions') return { rows: store.Actions, complete: true };
        if (title === 'History') return { rows: store.History, complete: true };
        return { rows: [], complete: true };
      },
      addToFolder: async (list, folder, values) => { store.Requests.push(Object.assign({ Id: store.Requests.length + 1, Status: 'Submitted' }, values)); return store.Requests.length; },
      update: async () => {}
    },
    store,
    // the flow saves the oldest open request: the action moves on a revision and carries the key
    save(message) {
      const r = store.Requests.filter((x) => x.Status === 'Submitted')[0];
      r.Status = 'Completed'; r.ResultMessage = message || 'Saved.'; r.ResultId = 40;
      store.Actions[0].Revision += 1; store.Actions[0].LastRequestKey = r.RequestKey;
    },
    refuse(message) { const r = store.Requests.filter((x) => x.Status === 'Submitted')[0]; r.Status = 'Rejected'; r.ResultMessage = message; }
  };
  return app;
}
const tick = async () => { for (let k = 0; k < 30; k++) await new Promise((r) => setImmediate(r)); };
function queueCH(storage) {
  const timers = [];
  const CH2 = loadApp({ setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    window: { crypto: require('crypto').webcrypto, localStorage: storage } });
  return { CH2, timers };
}
function memoryStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; }

test('three quick changes to one action: one is sent at a time, each against the revision the one before it left', async () => {
  const storage = memoryStorage();
  const { CH2 } = queueCH(storage);
  const app = queueApp();
  const states = [];
  const tracker = CH2.requests.tracker(app, (e) => states.push(e.label + ':' + e.state));
  const a = await tracker.submit({ type: 'ExtendDeadline', targetId: 40, expectedRevision: 2, payload: { newDueIso: '2026-11-04' }, label: 'A' });
  const b = await tracker.submit({ type: 'ChangeStatus', targetId: 40, expectedRevision: 3, payload: { status: 'In Progress' }, label: 'B' });
  const c = await tracker.submit({ type: 'MarkComplete', targetId: 40, expectedRevision: 4, payload: {}, label: 'C' });
  assert.deepEqual([a.state, b.state, c.state], ['submitted', 'queued', 'queued']);
  assert.equal(app.store.Requests.length, 1, 'only the first is sent');
  assert.deepEqual(JSON.parse(storage.m['esg-competency-hub-pending']).waiting.map((w) => w.label), ['B', 'C'], 'the rest is kept in the browser');
  app.save(); tracker.wake(); await tick();
  assert.deepEqual([a.state, b.state, c.state], ['done', 'submitted', 'queued']);
  assert.equal(app.store.Requests[1].ExpectedRevision, 3, 'read from the record, not guessed');
  app.save(); tracker.wake(); await tick();
  assert.deepEqual([b.state, c.state], ['done', 'submitted']);
  assert.equal(app.store.Requests[2].ExpectedRevision, 4);
  app.save(); tracker.wake(); await tick();
  assert.equal(c.state, 'done');
  assert.deepEqual(JSON.parse(storage.m['esg-competency-hub-pending']).waiting, []);
  tracker.stop();
});

test('the first of a chain refused: the rest is held and never sent; Try again sends it again and the rest follows; Discard drops the lot', async () => {
  const { CH2 } = queueCH(memoryStorage());
  const app = queueApp();
  const tracker = CH2.requests.tracker(app, () => {});
  const a = await tracker.submit({ type: 'ExtendDeadline', targetId: 40, expectedRevision: 2, payload: { newDueIso: '2026-11-04' }, label: 'A' });
  const b = await tracker.submit({ type: 'ChangeStatus', targetId: 40, expectedRevision: 3, payload: { status: 'In Progress' }, label: 'B' });
  app.refuse('This action was updated by someone else. Review the latest details and try again.'); tracker.wake(); await tick();
  assert.deepEqual([a.state, b.state, b.heldBy], ['rejected', 'held', a.key]);
  assert.equal(app.store.Requests.length, 1);
  assert.deepEqual(plain(tracker.heldBy(a).map((e) => e.label)), ['B']);
  const again = await tracker.retry(a, 5);
  assert.deepEqual([again.state, b.state, b.orderAfter], ['submitted', 'queued', again.key]);
  assert.equal(app.store.Requests[1].ExpectedRevision, 5);
  app.save(); tracker.wake(); await tick();
  assert.deepEqual([again.state, b.state], ['done', 'submitted']);
  app.refuse('As a technician you can raise actions for yourself in this area.'); tracker.wake(); await tick();
  assert.equal(b.state, 'rejected');
  tracker.discard(b);
  assert.ok(b.dismissed);
  tracker.stop();
});

test('a change to a record not yet numbered waits for the creation and then takes its number; a page reload loses nothing', async () => {
  const storage = memoryStorage();
  let { CH2 } = queueCH(storage);
  const app = queueApp();
  let tracker = CH2.requests.tracker(app, () => {});
  const raise = await tracker.submit({ key: 'raise-1', type: 'RaiseAction', payload: { title: 'New' }, label: 'Raise' });
  const done = await tracker.submit({ type: 'MarkComplete', targetId: -1, creationKey: 'raise-1', payload: {}, label: 'Done' });
  assert.deepEqual([raise.state, done.state, done.orderAfter], ['submitted', 'queued', 'raise-1']);
  tracker.stop();
  // the page is reloaded before the raise is saved: the raise is found again on SharePoint, the waiting change in storage
  ({ CH2 } = queueCH(storage));
  app.sp.items = (function (orig) {
    return async (title, query) => {
      if (title === 'Requests' && /Status eq 'Submitted'/.test(query)) return { rows: app.store.Requests.filter((r) => r.Status === 'Submitted').map((r) => Object.assign({ Created: '2026-10-28T10:00:00Z' }, r)), complete: true };
      return orig(title, query);
    };
  })(app.sp.items);
  tracker = CH2.requests.tracker(app, () => {});
  await tracker.resume();
  const back = tracker.byKey(done.key);
  assert.deepEqual([tracker.byKey('raise-1').state, back.state, back.orderAfter, back.creationKey], ['submitted', 'queued', 'raise-1', 'raise-1']);
  // the raise is saved and numbered 40: the change goes, about action 40
  app.store.Requests[0].Status = 'Completed'; app.store.Requests[0].ResultId = 40; app.store.Requests[0].ResultMessage = 'Raised.';
  app.store.Actions[0].LastRequestKey = 'raise-1';
  tracker.wake(); await tick();
  assert.deepEqual([tracker.byKey('raise-1').state, back.state, back.targetId, back.creationKey, back.madeBy], ['done', 'submitted', 40, null, 'raise-1']);
  assert.equal(app.store.Requests[1].TargetId, 40);
  tracker.stop();
});

test('the same key twice is one change; a different record is not held back', async () => {
  const { CH2 } = queueCH(memoryStorage());
  const app = queueApp();
  const tracker = CH2.requests.tracker(app, () => {});
  const a = await tracker.submit({ key: 'same', type: 'ExtendDeadline', targetId: 40, expectedRevision: 2, payload: {}, label: 'A' });
  const a2 = await tracker.submit({ key: 'same', type: 'ExtendDeadline', targetId: 40, expectedRevision: 2, payload: {}, label: 'A' });
  const other = await tracker.submit({ type: 'ExtendDeadline', targetId: 41, expectedRevision: 1, payload: {}, label: 'Other' });
  assert.equal(a2, a);
  assert.equal(other.state, 'submitted');
  assert.equal(app.store.Requests.length, 2);
  tracker.stop();
});
