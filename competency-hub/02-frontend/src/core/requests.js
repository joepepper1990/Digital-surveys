// Queued changes (plan C.6, F.1): the browser writes a request into the user's own Requests folder and the
// request flow applies it. Success is shown only when the request is Completed and the action itself confirms
// it (its LastRequestKey is this request and nothing is locked), or History holds the request's event row.
CH.requests = (function () {
  var UNSENT_KEY = 'esg-competency-hub-unsent';
  var SCHEDULE = [20, 40, 60];
  var EVERY = 60;
  var GIVE_UP_MINUTES = 15;
  var OPEN_STATUSES = ['Submitted', 'Processing'];

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
        TargetType: spec.targetId ? 'Action' : '', TargetId: spec.targetId || '', ExpectedRevision: spec.expectedRevision || '',
        Payload: JSON.stringify(spec.payload), Status: 'Submitted'
      };
    }

    async function findRequest(key) {
      var res = await app.sp.items(CH.config.lists.requests.title,
        "$select=Id,Status,ResultMessage,ResultId&$filter=RequestKey eq '" + q(key) + "'", 1);
      return res.rows[0] || null;
    }

    // spec: { type, targetId, expectedRevision, payload, label, key? }. Resolves to the tracked entry.
    async function submit(spec) {
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
      var entry = { key: spec.key, type: spec.type, targetId: spec.targetId || null, label: spec.label, submittedAt: new Date(),
        state: 'submitted', message: '', resultId: null, polls: 0 };
      entries.push(entry);
      schedule(entry);
      onChange(entry);
      return entry;
    }

    // After a reload: the user's own requests still waiting for the flow are tracked again (plan K7.9).
    // Status is indexed, so it leads the filter; AuthorId keeps it to this person's requests.
    async function resume() {
      var found = [];
      for (var i = 0; i < OPEN_STATUSES.length; i++) {
        var res = await app.sp.items(CH.config.lists.requests.title, '$select=Id,Title,RequestKey,RequestType,TargetId,Created' +
          "&$filter=Status eq '" + OPEN_STATUSES[i] + "' and AuthorId eq " + Number(app.person.SiteUserId), 100);
        found = found.concat(res.rows);
      }
      found.sort(function (a, b) { return a.Id - b.Id; }).forEach(function (row) {
        if (!row.RequestKey || entries.some(function (e) { return e.key === row.RequestKey; })) return;
        var entry = { key: row.RequestKey, type: row.RequestType, targetId: row.TargetId || null, label: row.Title || 'Your change',
          submittedAt: row.Created ? new Date(row.Created) : new Date(), state: 'submitted', message: '', resultId: null, polls: 0 };
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
      if (status === 'Rejected') return settle(entry, 'rejected', row.ResultMessage || 'This change was not accepted.');
      if (status === 'Failed' || status === 'Needs attention') {
        return settle(entry, 'failed', 'This change has not been recorded yet. A Competency Hub administrator can see it and will put it right.');
      }
      if (status === 'Completed' && await confirmed(entry, row)) {
        entry.resultId = row.ResultId || entry.targetId;
        return settle(entry, 'done', row.ResultMessage || 'Recorded.');
      }
      var minutes = (Date.now() - entry.submittedAt.getTime()) / 60000;
      if (minutes >= GIVE_UP_MINUTES && entry.state !== 'slow') {
        entry.state = 'slow';
        entry.message = 'This is taking longer than usual. It will be recorded; you can keep working.';
        onChange(entry);
      }
      schedule(entry);
    }

    // The action itself must show this change, with no lock left on it.
    async function confirmed(entry, row) {
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
      onChange(entry);
    }

    return {
      submit: submit,
      resume: resume,
      entries: function () { return entries.slice(); },
      // The newest unfinished or unread request for an action.
      forTarget: function (id) {
        return entries.filter(function (e) { return Number(e.targetId) === Number(id) && !e.dismissed; }).slice(-1)[0] || null;
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

  return { tracker: tracker, newKey: newKey, SCHEDULE: SCHEDULE, GIVE_UP_MINUTES: GIVE_UP_MINUTES };
})();
