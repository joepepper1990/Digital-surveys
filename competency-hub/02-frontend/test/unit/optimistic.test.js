// Optimistic saving (release 1.2): a change shows at once, and stops showing if it is refused.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');

const CH = loadApp({ window: { crypto: require('crypto').webcrypto, localStorage: { getItem: () => null, setItem: () => {} } } });
const NOW = new Date('2026-10-26T10:00:00Z');
const CTX = { personId: 112, today: '2026-10-26', now: NOW };

function raw() {
  return {
    competencies: { rows: [{ Id: 1, CompetencyKey: 'FLK', Title: 'Flask' }, { Id: 2, CompetencyKey: 'RPE', Title: 'RPE' }] },
    actions: { rows: [{ Id: 40, Title: 'Replace FH40 probe', DueDay: 20261028, Status: 'In Progress', IsOpen: true, Revision: 2, ExtensionCount: 1, RequiresCloseOut: false,
      AssignedToId: 112, FileDirRef: '/sites/x/Lists/Actions/FLK' }] },
    notices: { rows: [{ Id: 7, Title: 'Old title', Body: 'b', IsImportant: false, Revision: 0, FileDirRef: '/sites/x/Lists/Noticeboard/FLK' }] },
    register: { rows: [] },
    meetings: { rows: [{ Id: 5, CompetencyId: 1, MeetingDate: '2026-11-11T10:00:00Z', EndTime: '2026-11-11T11:00:00Z', Status: 'Scheduled', Revision: 1, Location: 'Room 2' }] }
  };
}
const entry = (o) => Object.assign({ key: 'k' + Math.random(), state: 'submitted', submittedAt: NOW, targetType: 'Action' }, o);

test('a change being saved shows at once, with the revision the flow will leave, and the rows read are not touched', () => {
  const r = raw();
  const out = CH.optimistic.apply(r, [entry({ type: 'ExtendDeadline', targetId: 40, payload: { newDueIso: '2026-11-04' } })], {}, CTX);
  const a = out.actions.rows[0];
  assert.deepEqual([a.DueDay, a.ExtensionCount, a.Revision, !!a._sending], [20261104, 2, 3, true]);
  assert.equal(r.actions.rows[0].DueDay, 20261028);
});

test('two changes in a row: the second is sent against the revision the first leaves', () => {
  const out = CH.optimistic.apply(raw(), [
    entry({ type: 'ChangeStatus', targetId: 40, payload: { status: 'Awaiting Input', blocker: 'A part' } }),
    entry({ type: 'EditActionDetails', targetId: 40, payload: { title: 'New title' } })], {}, CTX);
  assert.deepEqual(plain([out.actions.rows[0].Status, out.actions.rows[0].Blocker, out.actions.rows[0].Title, out.actions.rows[0].Revision]),
    ['Awaiting Input', 'A part', 'New title', 4]);
});

test('a refused or failed change, or one already saved and read back, is not applied: the screen shows the record as it is', () => {
  ['rejected', 'attention', 'done', 'cancelled', 'held', 'dropped'].forEach((state) => {
    const out = CH.optimistic.apply(raw(), [entry({ type: 'ExtendDeadline', targetId: 40, state, reloaded: true, payload: { newDueIso: '2026-11-04' } })], {}, CTX);
    assert.equal(out.actions.rows[0].DueDay, 20261028, state);
  });
  // saved but not yet read back (release 1.3): still shown, so the record never jumps back for a moment
  let out = CH.optimistic.apply(raw(), [entry({ type: 'ExtendDeadline', targetId: 40, state: 'done', payload: { newDueIso: '2026-11-04' } })], {}, CTX);
  assert.equal(out.actions.rows[0].DueDay, 20261104);
  // waiting its turn behind another change: shown too
  out = CH.optimistic.apply(raw(), [entry({ type: 'ExtendDeadline', targetId: 40, state: 'queued', payload: { newDueIso: '2026-11-05' } })], {}, CTX);
  assert.equal(out.actions.rows[0].DueDay, 20261105);
});

test('a change to a record not yet numbered finds it by the key of the change creating it', () => {
  const raise = entry({ key: 'raise-1', type: 'RaiseAction', targetId: null, targetType: '', payload: { areaKey: 'RPE', title: 'Order probes', description: 'd', ownerId: 103, dueIso: '2026-11-20' } });
  const done = entry({ key: 'done-1', type: 'MarkComplete', targetId: -99, creationKey: 'raise-1', state: 'queued', payload: { note: '' } });
  const out = CH.optimistic.apply(raw(), [raise, done], {}, CTX);
  const a = out.actions.rows[1];
  assert.deepEqual(plain([a.Title, a.Status, a._sending]), ['Order probes', 'Closed', 'raise-1']);
});

test('mark as done closes it, unless it waits for a close-out check; an action closed on this screen stays until the person moves on', () => {
  let out = CH.optimistic.apply(raw(), [entry({ type: 'MarkComplete', targetId: 40, payload: { note: '' } })], {}, CTX);
  assert.deepEqual(plain([out.actions.rows[0].Status, out.actions.rows[0].IsOpen]), ['Closed', false]);
  const check = raw(); check.actions.rows[0].RequiresCloseOut = true;
  out = CH.optimistic.apply(check, [entry({ type: 'MarkComplete', targetId: 40, payload: {} })], {}, CTX);
  assert.equal(out.actions.rows[0].Status, 'Completed');
  // saved: the open actions read no longer include it, but it is kept
  const after = raw(); after.actions.rows = [];
  out = CH.optimistic.apply(after, [], { 40: { Id: 40, Title: 'Replace FH40 probe', Status: 'Closed', DueDay: 20261028 } }, CTX);
  assert.deepEqual(plain([out.actions.rows.length, out.actions.rows[0]._keep]), [1, true]);
  // reopened from there before the closing was confirmed
  out = CH.optimistic.apply(after, [entry({ type: 'ReopenAction', targetId: 40, payload: { reason: 'Not finished yet.' } })],
    { 40: { Id: 40, Title: 'Replace FH40 probe', Status: 'Closed', IsOpen: false, DueDay: 20261028, Revision: 3 } }, CTX);
  assert.deepEqual(plain([out.actions.rows[0].Status, out.actions.rows[0].IsOpen, out.actions.rows[0].Revision]), ['In Progress', true, 4]);
});

test('a raised action shows at once in its area, with a temporary number and the person who raised it', () => {
  const out = CH.optimistic.apply(raw(), [entry({ type: 'RaiseAction', targetId: null, targetType: '', payload: { areaKey: 'RPE', title: 'Order probes', description: 'd',
    ownerId: 103, dueIso: '2026-11-20', priority: 'High', coOwnerIds: [104] } })], {}, CTX);
  const a = out.actions.rows[1];
  assert.ok(a.Id < 0, 'a temporary number');
  assert.deepEqual(plain([a.CompetencyId, a.AssignedToId, a.RaisedById, a.DueDay, a.Status, a.CoOwnerIds, a.FileDirRef, a._new]),
    [2, 103, 112, 20261120, 'Open', '["104"]', '/sites/x/Lists/Actions/RPE', true]);
});

test('a notice without a revision is not given one (it is sent without a stale check), and an archived notice goes', () => {
  let out = CH.optimistic.apply(raw(), [entry({ type: 'EditNotice', targetType: 'Notice', targetId: 7, payload: { title: 'New' } })], {}, CTX);
  assert.deepEqual(plain([out.notices.rows[0].Title, out.notices.rows[0].Revision]), ['New', 0]);
  out = CH.optimistic.apply(raw(), [entry({ type: 'ArchiveNotice', targetType: 'Notice', targetId: 7, payload: {} })], {}, CTX);
  assert.equal(out.notices.rows.length, 0);
  // the same id on another kind of record is not touched
  out = CH.optimistic.apply(raw(), [entry({ type: 'ArchiveNotice', targetType: 'Action', targetId: 7, payload: {} })], {}, CTX);
  assert.equal(out.notices.rows.length, 1);
});

test('a meeting moved to a new time is shown in UK time, in summer and in winter', () => {
  assert.equal(CH.optimistic.londonInstant('2026-11-11', '10:00'), '2026-11-11T10:00:00.000Z');
  assert.equal(CH.optimistic.londonInstant('2026-06-11', '10:00'), '2026-06-11T09:00:00.000Z');
  const out = CH.optimistic.apply(raw(), [entry({ type: 'UpdateMeeting', targetType: 'Meeting', targetId: 5, payload: { start: '14:30', location: 'Room 3' } })], {}, CTX);
  assert.deepEqual(plain([out.meetings.rows[0].MeetingDate, out.meetings.rows[0].Location]), ['2026-11-11T14:30:00.000Z', 'Room 3']);
});

test('a page reload: requests still on their way bring their change back (the payload is read with them)', async () => {
  const rows = { Submitted: [{ Id: 9, Title: 'New deadline 4 Nov', RequestKey: 'k2', RequestType: 'ExtendDeadline', TargetId: 40, TargetType: 'Action',
    Created: '2026-10-26T09:59:00Z', Payload: '{"newDueIso":"2026-11-04"}', ExpectedRevision: 2 }] };
  const queries = [];
  const tracker = CH.requests.tracker({ person: { SiteUserId: 112 }, sp: { items: async (t, q) => { queries.push(q); return { rows: rows[/Status eq '([\w ]+)'/.exec(q)[1]] || [], complete: true }; } } }, () => {});
  await tracker.resume();
  tracker.stop();
  assert.match(queries[0], /Payload,ExpectedRevision/);
  const out = CH.optimistic.apply(raw(), tracker.entries(), {}, CTX);
  assert.equal(out.actions.rows[0].DueDay, 20261104);
});

test('Try again after a fault sets the same request back to Submitted; after a refusal it sends a new one against the record as it is now', async () => {
  const updates = [], added = [];
  let status = 'Needs attention';
  const app = { person: { SiteUserId: 112 }, sp: {
    items: async () => ({ rows: [{ Id: 9, Status: status, ResultMessage: 'Not recorded – an administrator has been told. Nothing was changed.' }], complete: true }),
    update: async (list, id, values) => { updates.push([list, id, values]); },
    addToFolder: async (list, folder, values) => { added.push(values); }
  } };
  const tracker = CH.requests.tracker(app, () => {});
  const e = await tracker.submit({ type: 'ExtendDeadline', targetId: 40, expectedRevision: 2, payload: { newDueIso: '2026-11-04' }, label: 'New deadline' });
  e.state = 'attention';
  await tracker.retry(e);
  assert.deepEqual(plain(updates), [['requests', 9, { Status: 'Submitted' }]]);
  assert.equal(e.state, 'submitted');
  assert.equal(added.length, 1, 'no second request');
  e.state = 'rejected'; e.message = 'This action was updated by someone else. Review the latest details and try again.';
  assert.ok(CH.requests.isConflict(e));
  const again = await tracker.retry(e, 3);
  tracker.stop();
  assert.equal(added.length, 2);
  assert.notEqual(added[1].RequestKey, added[0].RequestKey);
  assert.equal(added[1].ExpectedRevision, 3);
  assert.ok(e.dismissed);
  assert.equal(again.state, 'submitted');
  assert.equal(CH.requests.isConflict({ message: 'As a technician you can raise actions for yourself in this area.' }), false);
});

test('starting and finalising a meeting show at once; a meeting started before its booking is saved shows as running', () => {
  let out = CH.optimistic.apply(raw(), [entry({ type: 'StartMeeting', targetType: 'Meeting', targetId: 5, payload: {} })], {}, CTX);
  let m = out.meetings.rows[0];
  assert.deepEqual(plain([m.Status, m.StartedById, m._starting, m.Revision, m.CutoffTime]), ['In Progress', 112, true, 2, NOW.toISOString()]);
  const started = raw(); started.meetings.rows[0].Status = 'In Progress';
  out = CH.optimistic.apply(started, [entry({ type: 'FinaliseMeeting', targetType: 'Meeting', targetId: 5, payload: {} })], {}, CTX);
  m = out.meetings.rows[0];
  assert.deepEqual(plain([m.Status, m.FinalisedById, m._finalising, m.PdfState]), ['Finalised', 112, true, 'Pending']);
  const book = entry({ type: 'ScheduleMeeting', targetId: null, targetType: '', startNow: true,
    payload: { areaKey: 'FLK', dateIso: '2026-10-26', start: '14:00', end: '15:00', chairId: 112, attendeeIds: [112, 103] } });
  out = CH.optimistic.apply(raw(), [book], {}, CTX);
  m = out.meetings.rows[1];
  assert.ok(m.Id < 0);
  assert.deepEqual(plain([m.Status, m._starting, m.Attendees]), ['In Progress', true, '["112","103"]']);
  // the same temporary number every time the screen is built, so an open meeting keeps following it
  assert.equal(CH.optimistic.apply(raw(), [book], {}, CTX).meetings.rows[1].Id, m.Id);
});
