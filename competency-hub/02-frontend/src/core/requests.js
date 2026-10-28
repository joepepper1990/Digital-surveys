// Queued changes (plan C.6, F.1): the browser writes a request into the user's own Requests folder and the
// request flow applies it. Success is shown only when the request is Completed and the action itself confirms
// it (its LastRequestKey is this request and nothing is locked), or History holds the request's event row.
//
// Release 1.3: changes to one record go out one at a time, in order. The second waits (state 'queued', shown at
// once) until the first is saved, and is then sent against the revision the first really left, read from the record.
// A change to a record that is itself still being created waits for the creation and takes the number it is given.
// If the first is refused, the ones behind it are held (never sent) and offered together: Try again or Discard.
// What waits is kept in the browser's storage, so a reload or a closed tab loses nothing.
CH.requests = (function () {
  var UNSENT_KEY = 'esg-competency-hub-unsent';
  var PENDING_KEY = 'esg-competency-hub-pending';
  var POLL_FAST = 15;          // seconds between checks for the first few minutes
  var POLL_FAST_FOR = 180;     // seconds
  var EVERY = 60;
  var GIVE_UP_MINUTES = 15;
  var STOP_MINUTES = 120;
  // Still on its way: waiting, being processed, or failed and being retried by the queue monitor (spec REL-2).
  var OPEN_STATUSES = ['Submitted', 'Processing', 'Failed'];
  // An administrator's decision about another change: it is confirmed by its own request alone.
  var ADMIN_TYPES = ['RetryTransaction', 'CancelTransaction', 'RevertTransaction', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson', 'UpdateSetting', 'RemoveTestRecords', 'SetKnownAs'];
  // Notices, comments and the register (4 Records): confirmed by their History event, which is written before Completed.
  var RECORD_TYPES = ['EditNotice', 'ArchiveNotice', 'PinNotice', 'HideComment', 'RaiseRegisterEntry', 'UpdateRegisterEntry', 'LinkActionToEntry', 'UnlinkActionFromEntry'];
  // Meetings (5 Meetings): also confirmed by their History event.
  var MEETING_TYPES = ['ScheduleMeeting', 'UpdateMeeting', 'CancelMeeting', 'StartMeeting', 'FinaliseMeeting', 'AmendMeeting'];
  // The change that creates each kind of record: a change to a record not yet numbered waits for it.
  var CREATES = { RaiseAction: 'Action', RaiseRegisterEntry: 'Register Entry', ScheduleMeeting: 'Meeting' };
  // Where each kind of record's revision is read from, once the change before it is saved.
  var LISTS = { 'Action': 'actions', 'Notice': 'notices', 'Register Entry': 'register', 'Meeting': 'meetings' };
  var ACTIVE = ['queued', 'submitted', 'slow'];
  var FAILED = ['rejected', 'attention', 'cancelled', 'reverted'];

  // Thrown instead of sending while automatic processing is down (limited mode).
  function LimitedError(message) { this.name = 'LimitedError'; this.message = message; this.friendly = message; }
  LimitedError.prototype = Object.create(Error.prototype);

  function newKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null') || fallback; } catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* not remembered */ }
  }
  function readUnsent() { return readJson(UNSENT_KEY, []); }
  function writeUnsent(list) { writeJson(UNSENT_KEY, list); }
  function hidden() { return typeof document !== 'undefined' && !!document.hidden; }

  // app: { sp, person }. onChange(entry) is called whenever a request's state changes.
  function tracker(app, onChange) {
    var entries = [];
    var timers = [];
    var stopped = false;
    var q = CH.sp.escapeOData;
    var stored = readJson(PENDING_KEY, {});
    // things the page keeps alongside its queued changes (what was recorded on a meeting not yet booked)
    var stash = stored.stash || {};

    function folder() { return 'u' + app.person.SiteUserId; }
    function byKey(key) { return entries.filter(function (e) { return e.key === key; })[0] || null; }
    function active(e) { return ACTIVE.indexOf(e.state) >= 0; }
    function failed(e) { return FAILED.indexOf(e.state) >= 0; }
    function settled(e) { return e.state === 'done' || failed(e) || e.state === 'dropped'; }
    // the record a change is about: its kind and number, or the creation it waits for
    function recordKey(e) {
      if (e.creationKey) return 'new|' + e.creationKey;
      if (e.targetId && Number(e.targetId) > 0) return (e.targetType || 'Action') + '|' + Number(e.targetId);
      return null;
    }

    function values(spec) {
      return {
        Title: String(spec.label).slice(0, 255), RequestKey: spec.key, RequestType: spec.type,
        TargetType: spec.targetId ? spec.targetType || 'Action' : '', TargetId: spec.targetId || '', ExpectedRevision: spec.expectedRevision || '',
        Payload: JSON.stringify(spec.payload), Status: 'Submitted',
        // a change to an action made during a meeting carries it: the meeting is finalised only once all are recorded
        MeetingId: spec.meetingId || (app.liveMeetingId && Number(app.liveMeetingId) > 0 && MEETING_TYPES.indexOf(spec.type) < 0 && RECORD_TYPES.indexOf(spec.type) < 0 && ADMIN_TYPES.indexOf(spec.type) < 0
          ? app.liveMeetingId : '')
      };
    }

    async function findRequest(key) {
      var res = await app.sp.items(CH.config.lists.requests.title,
        "$select=Id,Status,ResultMessage,ResultId&$filter=RequestKey eq '" + q(key) + "'", 1);
      return res.rows[0] || null;
    }

    // What waits in this browser alone: queued and held changes, and the stash. Submitted ones are found again
    // on SharePoint after a reload (resume).
    function persist() {
      var waiting = entries.filter(function (e) { return e.state === 'queued' || e.state === 'held'; }).map(function (e) {
        return { key: e.key, state: e.state, spec: e.spec, label: e.label, creationKey: e.creationKey || null, madeBy: e.madeBy || null, orderAfter: e.orderAfter || null,
          after: e.after || [], heldBy: e.heldBy || null, meetingId: e.meetingId || null, queuedAt: e.submittedAt.toISOString() };
      });
      writeJson(PENDING_KEY, { waiting: waiting, stash: stash });
    }

    // the record a change waited for has its number now: the change is about that record from here on (madeBy keeps
    // the creation's key, so the screen still finds the row while it is shown under its temporary number)
    function numbered(entry, id) {
      entry.targetId = Number(id); entry.spec.targetId = entry.targetId;
      entry.madeBy = entry.creationKey; entry.creationKey = null; entry.spec.creationKey = null;
    }

    function entryFrom(spec, state) {
      return { key: spec.key, type: spec.type, targetId: spec.targetId || null, meetingId: values(spec).MeetingId || null,
        targetType: spec.targetId ? spec.targetType || 'Action' : '', label: spec.label, submittedAt: new Date(),
        state: state, message: '', resultId: null, polls: 0, payload: spec.payload, spec: spec, creationKey: spec.creationKey || null, after: [] };
    }

    // spec: { type, targetId, targetType, expectedRevision, payload, label, key?, creationKey?, meetingId? }.
    // Resolves to the tracked entry: sent, or queued behind the change before it on the same record.
    async function submit(spec) {
      var blocked = RECORD_TYPES.indexOf(spec.type) >= 0 ? app.recordsBlocked && app.recordsBlocked()
        : MEETING_TYPES.indexOf(spec.type) >= 0 ? app.meetingsBlocked && app.meetingsBlocked()
        : ADMIN_TYPES.indexOf(spec.type) < 0 && app.queueBlocked && app.queueBlocked();
      if (blocked) {
        throw new LimitedError('Changes cannot be processed at the moment, so nothing was sent. You can still read everything and add updates. Please try again later.');
      }
      spec.key = spec.key || newKey();
      // the same press twice, or a form tried again: one change
      var same = byKey(spec.key);
      if (same && !failed(same) && same.state !== 'dropped') return same;
      if (spec.targetId && Number(spec.targetId) < 0 && !spec.creationKey) throw new Error('This record has no number yet.');
      var entry = entryFrom(spec, 'queued');
      // a change to a record still being created waits for it (and if it is already numbered, uses the number)
      var creation = entry.creationKey ? byKey(entry.creationKey) : null;
      if (creation && creation.state === 'done' && creation.resultId) numbered(entry, creation.resultId);
      else if (creation && failed(creation)) { entry.state = 'held'; entry.heldBy = creation.key; }
      // behind the last change to the same record, or else behind the creation itself
      var rk = recordKey(entry);
      var before = entries.filter(function (e) { return e !== entry && active(e) && recordKey(e) === rk && rk; });
      if (before.length) entry.orderAfter = before[before.length - 1].key;
      else if (creation && active(creation)) entry.orderAfter = creation.key;
      // finalising waits for every change made from the meeting to be recorded (the flow checks the same)
      if (spec.type === 'FinaliseMeeting') {
        entry.after = entries.filter(function (e) { return e !== entry && active(e) && Number(e.meetingId) === Number(entry.targetId) && e.key !== entry.orderAfter; })
          .map(function (e) { return e.key; });
      }
      entries.push(entry);
      if (entry.state === 'held') { persist(); onChange(entry); return entry; }
      if (entry.orderAfter || entry.after.length) {
        entry.needsRevision = true;
        persist();
        onChange(entry);
        return entry;
      }
      try {
        await sendNow(entry);
      } catch (error) {
        entries.splice(entries.indexOf(entry), 1);
        throw error;
      }
      return entry;
    }

    // Writes the request. A change that waited reads the record's revision first, so it is checked against the
    // record as the change before it left it.
    async function sendNow(entry) {
      var spec = entry.spec;
      if (entry.creationKey) {
        var creation = byKey(entry.creationKey);
        if (!creation || creation.state !== 'done' || !creation.resultId) throw new Error('The record is not numbered yet.');
        numbered(entry, creation.resultId);
      }
      if (entry.needsRevision && LISTS[entry.targetType] && entry.targetId > 0) {
        try { spec.expectedRevision = await freshRevision(entry.targetType, entry.targetId); } catch (_) { /* sent against what the screen knows */ }
      }
      try {
        await app.sp.addToFolder('requests', folder(), values(spec));
      } catch (error) {
        // An unclear failure may still have saved the request: look for it by its key before giving up.
        var found = null;
        try { found = await findRequest(spec.key); } catch (_) { found = null; }
        if (!found) {
          var unsent = readUnsent().filter(function (u) { return u.key !== spec.key; });
          unsent.push(spec);
          writeUnsent(unsent);
          throw error;
        }
      }
      writeUnsent(readUnsent().filter(function (u) { return u.key !== spec.key; }));
      entry.state = 'submitted';
      entry.submittedAt = new Date();
      entry.meetingId = values(spec).MeetingId || null;
      entry.needsRevision = false;
      persist();
      schedule(entry);
      onChange(entry);
      return entry;
    }

    async function freshRevision(kind, id) {
      var res = await app.sp.items(CH.config.lists[LISTS[kind]].title, '$select=Id,Revision&$filter=Id eq ' + Number(id), 1);
      var row = res.rows[0];
      return row && Number(row.Revision) ? Number(row.Revision) : '';
    }

    // A change settled: the ones waiting behind it go next (or are held, if it was not saved).
    function advance(entry) {
      entries.forEach(function (e) {
        if (e.after && e.after.indexOf(entry.key) >= 0) e.after = e.after.filter(function (k) { return k !== entry.key; });
      });
      if (entry.state === 'done') {
        entries.filter(function (e) { return e.state === 'queued' && e.orderAfter === entry.key; }).forEach(function (e) {
          e.orderAfter = null;
          e.needsRevision = true;
        });
        entries.filter(function (e) { return e.state === 'queued' && !e.orderAfter && !e.after.length; }).forEach(function (e) {
          sendNow(e).catch(function () { e.unsent = true; onChange(e); });
        });
      } else if (failed(entry) || entry.state === 'dropped') {
        hold(entry);
      }
      persist();
    }
    function hold(entry) {
      entries.filter(function (e) { return e.state === 'queued' && e.orderAfter === entry.key; }).forEach(function (e) {
        e.state = 'held'; e.heldBy = entry.key; e.message = '';
        onChange(e);
        hold(e);
      });
    }

    // After a reload: the user's own requests still waiting for the flow are tracked again (plan K7.9), and the
    // changes that were waiting in this browser go on waiting, or are sent now if what they waited for is saved.
    async function resume() {
      var found = [];
      var statuses = OPEN_STATUSES.concat(['Needs attention', 'Cancelled', 'Reverted']);
      // a change an administrator cancelled or reverted is shown once more after a reload, for a day
      var since = new Date(Date.now() - 24 * 3600000).toISOString();
      for (var i = 0; i < statuses.length; i++) {
        var recent = statuses[i] === 'Cancelled' || statuses[i] === 'Reverted' ? " and Modified ge datetime'" + since + "'" : '';
        var res = await app.sp.items(CH.config.lists.requests.title, '$select=Id,Title,RequestKey,RequestType,TargetType,TargetId,MeetingId,Created,Payload,ExpectedRevision' +
          "&$filter=Status eq '" + statuses[i] + "' and AuthorId eq " + Number(app.person.SiteUserId) + recent, 100);
        found = found.concat(res.rows);
      }
      found.sort(function (a, b) { return a.Id - b.Id; }).forEach(function (row) {
        if (!row.RequestKey || entries.some(function (e) { return e.key === row.RequestKey; })) return;
        var payload = null;
        try { payload = JSON.parse(row.Payload || 'null'); } catch (_) { payload = null; }
        var spec = { key: row.RequestKey, type: row.RequestType, targetId: row.TargetId || null, targetType: row.TargetType || '', expectedRevision: row.ExpectedRevision || '',
          payload: payload, label: row.Title || 'Your change', meetingId: row.MeetingId || '' };
        var entry = entryFrom(spec, 'submitted');
        entry.submittedAt = row.Created ? new Date(row.Created) : new Date();
        entry.resumed = true;   // its timing was not watched from the start, so it teaches nothing
        entries.push(entry);
        schedule(entry);
      });
      // how long this person's recent changes took, for the time the progress ring says (a fresh browser); not
      // waited for, so the page is not held up by it
      if (CH.eta) {
        app.sp.items(CH.config.lists.requests.title, '$select=RequestType,Created,ProcessedAt' +
          "&$filter=Status eq 'Completed' and AuthorId eq " + Number(app.person.SiteUserId) + '&$orderby=Id desc', 30)
          .then(function (past) { CH.eta.seed(past.rows); }, function () { /* the defaults are used */ });
      }
      // what waited in this browser: queued or held, in the order it was asked for
      (stored.waiting || []).forEach(function (w) {
        if (!w.spec || byKey(w.key)) return;
        var e = entryFrom(w.spec, w.state === 'held' ? 'held' : 'queued');
        e.label = w.label || e.label; e.creationKey = w.creationKey || null; e.madeBy = w.madeBy || null; e.orderAfter = w.orderAfter || null; e.after = w.after || [];
        e.heldBy = w.heldBy || null; e.meetingId = w.meetingId || e.meetingId; e.needsRevision = true;
        if (w.queuedAt) e.submittedAt = new Date(w.queuedAt);
        entries.push(e);
      });
      stored.waiting = [];
      // what each waited for: saved meanwhile (go now), still on its way (wait), or gone wrong (held)
      entries.filter(function (e) { return e.state === 'queued' || e.state === 'held'; }).forEach(function (e) {
        var keys = (e.orderAfter ? [e.orderAfter] : []).concat(e.after || [], e.creationKey ? [e.creationKey] : []);
        keys.forEach(function (k) {
          var dep = byKey(k);
          if (dep && failed(dep)) { if (e.state !== 'held') { e.state = 'held'; e.heldBy = k; } return; }
          if (dep && active(dep)) return;
          // not on its way any more: saved (a creation is found by its key on the record it made) or long gone
          if (k === e.orderAfter) e.orderAfter = null;
          e.after = (e.after || []).filter(function (x) { return x !== k; });
        });
      });
      await Promise.all(entries.filter(function (e) { return e.state === 'queued' && !e.orderAfter && !e.after.length; }).map(async function (e) {
        if (e.creationKey && !byKey(e.creationKey)) {
          // the creation finished while the page was away: the record it made carries the key
          try { e.targetId = await createdId(e); } catch (_) { e.targetId = null; }
          if (!e.targetId) { e.state = 'held'; e.heldBy = e.creationKey; return; }
          numbered(e, e.targetId);
        }
        try { await sendNow(e); } catch (_) { e.unsent = true; }
      }));
      persist();
      return found.length;
    }

    async function createdId(e) {
      var list = LISTS[e.targetType];
      if (!list) return null;
      var res = await app.sp.items(CH.config.lists[list].title, "$select=Id&$filter=CreatedRequestKey eq 'F%7C" + q(e.creationKey) + "'", 1);
      return res.rows[0] ? Number(res.rows[0].Id) : null;
    }

    function schedule(entry) {
      if (stopped) return;
      var elapsed = (Date.now() - entry.submittedAt.getTime()) / 1000;
      var seconds = elapsed < POLL_FAST_FOR ? POLL_FAST : EVERY;
      entry.timer = setTimeout(function () { poll(entry); }, seconds * 1000);
      timers.push(entry.timer);
    }

    async function poll(entry) {
      if (stopped || entry.state !== 'submitted' && entry.state !== 'slow') return;
      // a tab nobody is looking at asks nothing; it catches up when it is looked at again (wake)
      if (hidden()) { entry.timer = setTimeout(function () { poll(entry); }, POLL_FAST * 1000); timers.push(entry.timer); return; }
      entry.polls++;
      var row = null;
      try { row = await findRequest(entry.key); } catch (_) { row = null; }
      var status = row && row.Status;
      // waiting in the queue, or being worked on now (spec REL-2)
      if ((status === 'Processing') !== !!entry.processing) {
        entry.processing = status === 'Processing';
        // the stage the progress ring shows: picked up by the flow (app 1.3.1)
        if (entry.processing && !entry.processingAt) entry.processingAt = Date.now();
        onChange(entry);
      }
      if (status === 'Rejected') return settle(entry, 'rejected', row.ResultMessage || 'This change was not accepted.');
      // Honest states (spec REL-2): only Completed, confirmed on the record, ever reads as saved.
      if (status === 'Needs attention') {
        return settle(entry, 'attention', row.ResultMessage || 'Not recorded – an administrator has been told.');
      }
      if (status === 'Cancelled') return settle(entry, 'cancelled', row.ResultMessage || 'Cancelled by an administrator. Nothing was changed.');
      if (status === 'Reverted') return settle(entry, 'reverted', row.ResultMessage || 'Reverted by an administrator.');
      if (status === 'Completed' && await confirmed(entry, row)) {
        entry.resultId = row.ResultId || entry.targetId;
        return settle(entry, 'done', row.ResultMessage || 'Recorded.');
      }
      var minutes = (Date.now() - entry.submittedAt.getTime()) / 60000;
      var retrying = status === 'Failed';
      if (retrying && entry.message !== RETRYING) {
        entry.message = RETRYING;
        entry.retrying = true;
        onChange(entry);
      } else if (!retrying && entry.retrying) {
        entry.retrying = false;
        entry.message = '';
        onChange(entry);
      }
      if (minutes >= GIVE_UP_MINUTES && entry.state !== 'slow') {
        entry.state = 'slow';
        if (!retrying) entry.message = 'This is taking longer than usual. It will be recorded; you can keep working.';
        onChange(entry);
      }
      if (minutes >= STOP_MINUTES) return;   // the page stops asking; a reload shows where it has got to
      schedule(entry);
    }

    // The action itself must show this change, with no lock left on it.
    async function confirmed(entry, row) {
      if (ADMIN_TYPES.indexOf(entry.type) >= 0) return true;
      if (RECORD_TYPES.indexOf(entry.type) >= 0 || MEETING_TYPES.indexOf(entry.type) >= 0) {
        try {
          var evr = await app.sp.items(CH.config.lists.history.title, "$select=Id&$filter=RequestKey eq '" + q(entry.key + '|1') + "'", 1);
          return evr.rows.length > 0;
        } catch (_) { return false; }
      }
      var id = Number(row.ResultId || entry.targetId);
      if (!id) return false;
      try {
        var res = await app.sp.items(CH.config.lists.actions.title, '$select=Id,LastRequestKey,PendingRequestKey&$filter=Id eq ' + id, 1);
        var action = res.rows[0];
        if (action && action.LastRequestKey === entry.key && !action.PendingRequestKey) return true;
        // A later change may already have committed on the same action; its event row proves this one.
        var ev = await app.sp.items(CH.config.lists.history.title, "$select=Id&$filter=RequestKey eq '" + q(entry.key + '|1') + "'", 1);
        return ev.rows.length > 0;
      } catch (_) {
        return false;
      }
    }

    function settle(entry, state, message) {
      entry.state = state;
      entry.message = message;
      if (state === 'done') {
        entry.doneAt = Date.now();
        // how long it took, so the next change of this kind can say about how long it will be
        if (CH.eta && !entry.resumed) CH.eta.learn(entry.type, entry.submittedAt.getTime(), entry.processingAt || null, entry.doneAt);
      }
      onChange(entry);
      advance(entry);
      if (state === 'attention') watchAttention(entry);
    }

    // A change that needs an administrator: every few minutes, see whether they have tried it again (it is then
    // followed as before) or cancelled or reverted it.
    function watchAttention(entry) {
      if (stopped) return;
      timers.push(setTimeout(async function () {
        if (stopped || entry.state !== 'attention') return;
        var row = null;
        try { row = await findRequest(entry.key); } catch (_) { row = null; }
        var status = row && row.Status;
        if (OPEN_STATUSES.indexOf(status) >= 0) {
          reopen(entry);
          return schedule(entry);
        }
        if (status === 'Needs attention' || !status) return watchAttention(entry);
        entry.state = 'submitted';
        poll(entry);
      }, 5 * 60000));
    }

    // back on its way: the changes held behind it wait for it again
    function reopen(entry) {
      entry.state = 'submitted';
      entry.message = '';
      entry.retrying = false;
      entry.dismissed = false;
      entry.polls = 0;
      entry.submittedAt = new Date();
      entries.filter(function (e) { return e.state === 'held' && e.heldBy === entry.key; }).forEach(function (e) {
        e.state = 'queued'; e.heldBy = null; e.orderAfter = entry.key; onChange(e);
      });
      persist();
      onChange(entry);
    }

    // Try again (release 1.2). A change that failed on the system's side is the same request set back to Submitted: the
    // flow resumes its stored copy, so it can never be made twice. A refused change (someone else changed the record
    // first) is sent again as a new request, against the record as it is now; what was held behind it follows it again.
    async function retry(entry, revision) {
      if (entry.state === 'attention' && ADMIN_TYPES.indexOf(entry.type) < 0) {
        var row = await findRequest(entry.key);
        if (!row) throw new Error('The change could not be found.');
        await app.sp.update('requests', row.Id, { Status: 'Submitted' });
        reopen(entry);
        schedule(entry);
        return entry;
      }
      if (entry.state === 'held') {
        // never sent: goes now, against the record as it is
        entry.state = 'queued'; entry.heldBy = null; entry.orderAfter = null; entry.needsRevision = true; entry.dismissed = false;
        await sendNow(entry);
        return entry;
      }
      if (!failed(entry) || !entry.spec) throw new Error('This change cannot be tried again.');
      var spec = Object.assign({}, entry.spec, { key: null, creationKey: null });
      if (revision !== undefined && revision !== null) spec.expectedRevision = revision;
      entry.dismissed = true;
      var held = entries.filter(function (e) { return e.state === 'held' && e.heldBy === entry.key; });
      var again = await submit(spec);
      held.forEach(function (e) {
        e.state = 'queued'; e.heldBy = null; e.orderAfter = again.key; e.needsRevision = true; e.dismissed = false;
        onChange(e);
      });
      persist();
      if (again.state === 'done') advance(again);
      return again;
    }

    // Give up on a change that was not saved, and on everything that was waiting for it.
    function discard(entry) {
      entry.dismissed = true;
      if (entry.state === 'queued' || entry.state === 'held') entry.state = 'dropped';
      entries.filter(function (e) { return e.state === 'held' && e.heldBy === entry.key; }).forEach(function (e) { discard(e); });
      persist();
      onChange(entry);
    }

    return {
      submit: submit,
      resume: resume,
      byKey: byKey,
      retry: retry,
      discard: discard,
      byKey: byKey,
      entries: function () { return entries.slice(); },
      // Changes held because an earlier one to the same record was not saved.
      heldBy: function (entry) { return entries.filter(function (e) { return e.state === 'held' && e.heldBy === entry.key; }); },
      // Everything still waiting in this browser: a reason to warn before the page is left.
      waiting: function () { return entries.filter(function (e) { return e.state === 'queued' || !!e.unsent; }); },
      // The newest unfinished or unread request for a record (an action unless another kind is named). A record not
      // yet numbered is known by the key of the change creating it.
      forTarget: function (id, targetType, creationKey) {
        var kind = targetType || 'Action';
        return entries.filter(function (e) {
          return !e.dismissed && e.state !== 'dropped' && (creationKey && (e.creationKey === creationKey || e.madeBy === creationKey) ||
            Number(id) > 0 && Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind);
        }).slice(-1)[0] || null;
      },
      // The newest change for a record, including the one that created it (a raise is found by the id it was given).
      forRecord: function (id, targetType) {
        var kind = targetType || 'Action';
        var made = { 'Action': 'RaiseAction', 'Register Entry': 'RaiseRegisterEntry', 'Meeting': 'ScheduleMeeting' }[kind];
        return entries.filter(function (e) {
          return e.state !== 'dropped' && ((Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind) || (e.type === made && e.state === 'done' && Number(e.resultId) === Number(id)));
        }).slice(-1)[0] || null;
      },
      // true while one of this person's changes holds the record (its lock is theirs, so the next change is fine)
      isMine: function (key) { return !!key && !!byKey(key); },
      dismiss: function (entry) { entry.dismissed = true; onChange(entry); },
      unsent: readUnsent,
      // Sends again, with the same keys, the requests a failed connection left behind.
      resend: async function () {
        var list = readUnsent();
        for (var i = 0; i < list.length; i++) {
          var e = byKey(list[i].key);
          if (e && e.state === 'queued') { await sendNow(e); e.unsent = false; } else await submit(list[i]);
        }
        return list.length;
      },
      // the tab is looked at again: every change on its way is checked now
      wake: function () {
        entries.filter(function (e) { return e.state === 'submitted' || e.state === 'slow'; }).forEach(function (e) {
          if (e.timer) clearTimeout(e.timer);
          poll(e);
        });
      },
      stash: stash,
      persist: persist,
      stop: function () { stopped = true; timers.forEach(clearTimeout); }
    };
  }

  var RETRYING = 'Not recorded yet – retrying automatically.';

  // A refusal because someone else changed the record first (or is changing it now): trying again can work.
  function isConflict(entry) { return /someone else|being updated/i.test(String(entry && entry.message || '')); }

  return { tracker: tracker, newKey: newKey, isConflict: isConflict, POLL_FAST: POLL_FAST, GIVE_UP_MINUTES: GIVE_UP_MINUTES, ADMIN_TYPES: ADMIN_TYPES, RECORD_TYPES: RECORD_TYPES, MEETING_TYPES: MEETING_TYPES,
    CREATES: CREATES, LimitedError: LimitedError, RETRYING: RETRYING };
})();
