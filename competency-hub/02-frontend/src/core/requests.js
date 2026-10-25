// Queued changes (plan C.6, F.1): the browser writes a request into the user's own Requests folder and the
// request flow applies it. Success is shown only when the request is Completed and the action itself confirms
// it (its LastRequestKey is this request and nothing is locked), or History holds the request's event row.
CH.requests = (function () {
  var UNSENT_KEY = 'esg-competency-hub-unsent';
  var SCHEDULE = [20, 40, 60];
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

  function readUnsent() {
    try { return JSON.parse(window.localStorage.getItem(UNSENT_KEY) || '[]') || []; } catch (_) { return []; }
  }
  function writeUnsent(list) {
    try { window.localStorage.setItem(UNSENT_KEY, JSON.stringify(list)); } catch (_) { /* not remembered */ }
  }

  // app: { sp, person }. onChange(entry) is called whenever a request's state changes.
  function tracker(app, onChange) {
    var entries = [];
    var timers = [];
    var stopped = false;
    var q = CH.sp.escapeOData;

    function folder() { return 'u' + app.person.SiteUserId; }

    function values(spec) {
      return {
        Title: String(spec.label).slice(0, 255), RequestKey: spec.key, RequestType: spec.type,
        TargetType: spec.targetId ? spec.targetType || 'Action' : '', TargetId: spec.targetId || '', ExpectedRevision: spec.expectedRevision || '',
        Payload: JSON.stringify(spec.payload), Status: 'Submitted',
        // a change to an action made during a meeting carries it: the meeting is finalised only once all are recorded
        MeetingId: spec.meetingId || (app.liveMeetingId && MEETING_TYPES.indexOf(spec.type) < 0 && RECORD_TYPES.indexOf(spec.type) < 0 && ADMIN_TYPES.indexOf(spec.type) < 0
          ? app.liveMeetingId : '')
      };
    }

    async function findRequest(key) {
      var res = await app.sp.items(CH.config.lists.requests.title,
        "$select=Id,Status,ResultMessage,ResultId&$filter=RequestKey eq '" + q(key) + "'", 1);
      return res.rows[0] || null;
    }

    // spec: { type, targetId, expectedRevision, payload, label, key? }. Resolves to the tracked entry.
    async function submit(spec) {
      var blocked = RECORD_TYPES.indexOf(spec.type) >= 0 ? app.recordsBlocked && app.recordsBlocked()
        : MEETING_TYPES.indexOf(spec.type) >= 0 ? app.meetingsBlocked && app.meetingsBlocked()
        : ADMIN_TYPES.indexOf(spec.type) < 0 && app.queueBlocked && app.queueBlocked();
      if (blocked) {
        throw new LimitedError('Changes cannot be processed at the moment, so nothing was sent. You can still read everything and add updates. Please try again later.');
      }
      spec.key = spec.key || newKey();
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
      var entry = { key: spec.key, type: spec.type, targetId: spec.targetId || null, meetingId: values(spec).MeetingId || null, targetType: spec.targetId ? spec.targetType || 'Action' : '', label: spec.label, submittedAt: new Date(),
        state: 'submitted', message: '', resultId: null, polls: 0, payload: spec.payload, spec: spec };
      entries.push(entry);
      schedule(entry);
      onChange(entry);
      return entry;
    }

    // After a reload: the user's own requests still waiting for the flow are tracked again (plan K7.9).
    // Status is indexed, so it leads the filter; AuthorId keeps it to this person's requests.
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
        var entry = { key: row.RequestKey, type: row.RequestType, targetId: row.TargetId || null, meetingId: row.MeetingId || null, targetType: row.TargetType || (row.TargetId ? 'Action' : ''), label: row.Title || 'Your change',
          submittedAt: row.Created ? new Date(row.Created) : new Date(), state: 'submitted', message: '', resultId: null, polls: 0, payload: payload,
          spec: { type: row.RequestType, targetId: row.TargetId || null, targetType: row.TargetType || '', expectedRevision: row.ExpectedRevision || '', payload: payload, label: row.Title || 'Your change', meetingId: row.MeetingId || '' } };
        entries.push(entry);
        schedule(entry);
      });
      return found.length;
    }

    function schedule(entry) {
      if (stopped) return;
      var seconds = entry.polls < SCHEDULE.length ? SCHEDULE[entry.polls] - (entry.polls ? SCHEDULE[entry.polls - 1] : 0) : EVERY;
      timers.push(setTimeout(function () { poll(entry); }, seconds * 1000));
    }

    async function poll(entry) {
      if (stopped || entry.state !== 'submitted' && entry.state !== 'slow') return;
      entry.polls++;
      var row = null;
      try { row = await findRequest(entry.key); } catch (_) { row = null; }
      var status = row && row.Status;
      // waiting in the queue, or being worked on now (spec REL-2)
      if ((status === 'Processing') !== !!entry.processing) {
        entry.processing = status === 'Processing';
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
      if (state === 'done') entry.doneAt = Date.now();
      onChange(entry);
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
          entry.state = 'submitted';
          entry.message = '';
          entry.retrying = false;
          entry.polls = 0;
          entry.submittedAt = new Date();
          onChange(entry);
          return schedule(entry);
        }
        if (status === 'Needs attention' || !status) return watchAttention(entry);
        entry.state = 'submitted';
        poll(entry);
      }, 5 * 60000));
    }

    // Try again (release 1.2). A change that failed on the system's side is the same request set back to Submitted: the
    // flow resumes its stored copy, so it can never be made twice. A refused change (someone else changed the record
    // first) is sent again as a new request, against the record as it is now (revision: the record's current revision).
    async function retry(entry, revision) {
      if (entry.state === 'attention' && ADMIN_TYPES.indexOf(entry.type) < 0) {
        var row = await findRequest(entry.key);
        if (!row) throw new Error('The change could not be found.');
        await app.sp.update('requests', row.Id, { Status: 'Submitted' });
        entry.state = 'submitted';
        entry.message = '';
        entry.retrying = false;
        entry.dismissed = false;
        entry.polls = 0;
        entry.submittedAt = new Date();
        onChange(entry);
        schedule(entry);
        return entry;
      }
      if (entry.state !== 'rejected' || !entry.spec) throw new Error('This change cannot be tried again.');
      var spec = Object.assign({}, entry.spec, { key: null });
      if (revision !== undefined && revision !== null) spec.expectedRevision = revision;
      entry.dismissed = true;
      return submit(spec);
    }

    return {
      submit: submit,
      resume: resume,
      retry: retry,
      entries: function () { return entries.slice(); },
      // The newest unfinished or unread request for a record (an action unless another kind is named).
      forTarget: function (id, targetType) {
        var kind = targetType || 'Action';
        return entries.filter(function (e) { return Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind && !e.dismissed; }).slice(-1)[0] || null;
      },
      // The newest change for a record, including the one that created it (a raise is found by the id it was given).
      forRecord: function (id, targetType) {
        var kind = targetType || 'Action';
        var made = { 'Action': 'RaiseAction', 'Register Entry': 'RaiseRegisterEntry', 'Meeting': 'ScheduleMeeting' }[kind];
        return entries.filter(function (e) {
          return (Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind) || (e.type === made && e.state === 'done' && Number(e.resultId) === Number(id));
        }).slice(-1)[0] || null;
      },
      dismiss: function (entry) { entry.dismissed = true; onChange(entry); },
      unsent: readUnsent,
      // Sends again, with the same keys, the requests a failed connection left behind.
      resend: async function () {
        var list = readUnsent();
        for (var i = 0; i < list.length; i++) await submit(list[i]);
        return list.length;
      },
      stop: function () { stopped = true; timers.forEach(clearTimeout); }
    };
  }

  var RETRYING = 'Not recorded yet – retrying automatically.';

  // A refusal because someone else changed the record first (or is changing it now): trying again can work.
  function isConflict(entry) { return /someone else|being updated/i.test(String(entry && entry.message || '')); }

  return { tracker: tracker, newKey: newKey, isConflict: isConflict, SCHEDULE: SCHEDULE, GIVE_UP_MINUTES: GIVE_UP_MINUTES, ADMIN_TYPES: ADMIN_TYPES, RECORD_TYPES: RECORD_TYPES, MEETING_TYPES: MEETING_TYPES,
    LimitedError: LimitedError, RETRYING: RETRYING };
})();
