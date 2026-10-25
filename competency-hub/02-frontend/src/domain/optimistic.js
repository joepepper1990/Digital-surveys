// Optimistic saving (release 1.2): a change shows on the screen as soon as it is sent. The rows read from SharePoint
// are copied and every change still being saved is applied on top, by its request type, before the model is built.
// When the flow confirms it, the rows are read again and already hold it; when it is refused or fails, it is simply
// no longer applied, so the screen shows the records as they really are. Nothing here is ever written anywhere.
CH.optimistic = (function () {
  var D = CH.dates;

  // The UTC instant of a London wall-clock time on a date (GMT or BST, whichever gives that local time back).
  function londonInstant(iso, hhmm) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
    var hh = +String(hhmm).slice(0, 2), mm = +String(hhmm).slice(3, 5);
    for (var offset = 0; offset <= 1; offset++) {
      var t = new Date(Date.UTC(y, m, d, hh - offset, mm));
      if (D.localDate(t) === iso && D.ukTime(t) === String(hhmm).slice(0, 5)) return t.toISOString();
    }
    return new Date(Date.UTC(y, m, d, hh, mm)).toISOString();
  }

  function copy(list) { return (list || []).map(function (r) { return Object.assign({}, r); }); }
  // the flow adds one to the revision of what it changes; a record with none (older notices) is sent without a stale check
  function bump(row, key) { if (Number(row.Revision)) row.Revision = Number(row.Revision) + 1; row._sending = key; }
  function areaId(raw, key) {
    var c = (raw.competencies.rows || []).filter(function (x) { return x.CompetencyKey === key; })[0];
    return c ? c.Id : null;
  }
  function folderFor(raw, list, key) {
    var any = (raw[list].rows || [])[0];
    var base = any && any.FileDirRef ? String(any.FileDirRef).split('/').slice(0, -1).join('/') : '/Lists/' + list;
    return base + '/' + key;
  }

  // Each kind of change: how it alters the rows. row is the copied target row (found by TargetId); add pushes a new one.
  var ACTIONS = {
    ExtendDeadline: function (row, p) { row.DueDay = D.toDueDay(p.newDueIso); row.ExtensionCount = (Number(row.ExtensionCount) || 0) + 1; },
    MarkComplete: function (row, p, ctx) {
      if (row.RequiresCloseOut) { row.Status = 'Completed'; return; }
      row.Status = 'Closed'; row.IsOpen = false; row.CloseOutcome = 'Completed'; row.ClosureNote = p.note || ''; row.DateClosed = ctx.nowIso; row._keep = true;
    },
    ChangeStatus: function (row, p) { row.Status = p.status; row.Blocker = p.status === 'Awaiting Input' ? p.blocker : ''; },
    ReassignAction: function (row, p) { row.AssignedToId = Number(p.ownerId); row.CoOwnerIds = JSON.stringify((p.coOwnerIds || []).map(String)); },
    CloseAction: function (row, p, ctx) {
      row.Status = 'Closed'; row.IsOpen = false; row.CloseOutcome = p.outcome; row.ClosureNote = p.note || ''; row.DateClosed = ctx.nowIso; row._keep = true;
    },
    ReopenAction: function (row) { row.Status = 'In Progress'; row.IsOpen = true; row.CloseOutcome = null; row.ClosureNote = null; row.DateClosed = null; },
    EditActionDetails: function (row, p) {
      if ('title' in p) row.Title = p.title;
      if ('description' in p) row.Description = p.description;
      if ('priority' in p) row.Priority = p.priority;
      if ('requiresCloseOut' in p) row.RequiresCloseOut = !!p.requiresCloseOut;
      if ('checkerId' in p) row.CloseOutById = p.checkerId;
    }
  };
  var NOTICES = {
    EditNotice: function (row, p, ctx) {
      if ('title' in p) row.Title = p.title;
      if ('body' in p) row.Body = p.body;
      if ('category' in p) row.Category = p.category;
      if ('important' in p) {
        row.IsImportant = !!p.important;
        row.ImportantDays = p.important ? p.importantDays : null;
        row.ImportantUntil = p.important ? D.addDays(ctx.today, p.importantDays) + 'T12:00:00Z' : null;
      }
    },
    PinNotice: function (row, p) { row.IsImportant = !!p.pinned; row.ImportantUntil = null; row.ImportantDays = null; },
    ArchiveNotice: function (row) { row._remove = true; }
  };
  var ENTRIES = {
    UpdateRegisterEntry: function (row, p, ctx) {
      ['title', 'description', 'impact', 'status', 'outcome'].forEach(function (k) {
        if (k in p) row[k.charAt(0).toUpperCase() + k.slice(1)] = p[k];
      });
      if (p.status === 'Resolved' || p.status === 'Closed') row.DateResolved = row.DateResolved || ctx.nowIso;
      if (p.status === 'Open' || p.status === 'Under Review') row.DateResolved = null;
    }
  };
  var MEETINGS = {
    UpdateMeeting: function (row, p) {
      var start = row.MeetingDate ? new Date(row.MeetingDate) : null;
      var dateIso = p.dateIso || (start ? D.localDate(start) : '');
      if (dateIso && ('dateIso' in p || 'start' in p)) row.MeetingDate = londonInstant(dateIso, p.start || D.ukTime(start));
      if (dateIso && ('dateIso' in p || 'end' in p)) row.EndTime = londonInstant(dateIso, p.end || (row.EndTime ? D.ukTime(row.EndTime) : '11:00'));
      if ('location' in p) row.Location = p.location;
      if ('onlineLink' in p) row.OnlineLink = p.onlineLink;
      if ('chairId' in p) row.ChairId = Number(p.chairId);
      if ('attendeeIds' in p) row.Attendees = JSON.stringify(p.attendeeIds.map(String));
    },
    CancelMeeting: function (row, p) { row.Status = 'Cancelled'; row.CancellationReason = p.reason || ''; },
    // meetings start and finish at once on screen (release 1.2): the flow fixes the agenda, or freezes the record, behind
    StartMeeting: function (row, p, ctx) { row.Status = 'In Progress'; row.CutoffTime = row.CutoffTime || ctx.nowIso; row.StartedById = ctx.personId; row._starting = true; },
    FinaliseMeeting: function (row, p, ctx) {
      row.Status = 'Finalised'; row.FinalisedAt = ctx.nowIso; row.FinalisedById = ctx.personId; row.PdfState = 'Pending'; row.PdfVersion = 0; row._finalising = true;
    }
  };

  // New records: shown at once with a temporary negative id until the flow gives them their own.
  function addAction(raw, rows, e, p, ctx, n) {
    rows.push({ Id: -n, Title: p.title, Description: p.description, CompetencyId: areaId(raw, p.areaKey), LinkedCompetenciesId: [],
      AssignedToId: Number(p.ownerId), RaisedById: ctx.personId, DateRaised: ctx.nowIso, DueDay: D.toDueDay(p.dueIso), OriginalDueDate: p.dueIso + 'T12:00:00Z',
      Status: 'Open', IsOpen: true, Priority: p.priority || 'Normal', ExtensionCount: 0, RequiresCloseOut: !!p.requiresCloseOut, Revision: 1,
      CoOwnerIds: JSON.stringify((p.coOwnerIds || []).map(String)), CloseOutById: p.checkerId || null, SourceType: 'None', _sending: e.key, _new: true,
      FileDirRef: folderFor(raw, 'actions', p.areaKey) });
  }
  function addEntry(raw, rows, e, p, ctx, n) {
    rows.push({ Id: -n, Title: p.title, Description: p.description, EntryType: p.entryType, Impact: p.impact, Status: 'Open', RaisedById: ctx.personId,
      DateRaised: ctx.nowIso, Created: ctx.nowIso, Revision: 1, CompetencyId: areaId(raw, p.areaKey), FileDirRef: folderFor(raw, 'register', p.areaKey),
      _sending: e.key, _new: true });
  }
  function addMeeting(raw, rows, e, p, ctx, n) {
    rows.push({ Id: -n, Title: 'Meeting', CompetencyId: areaId(raw, p.areaKey), MeetingDate: londonInstant(p.dateIso, p.start), EndTime: londonInstant(p.dateIso, p.end),
      Status: e.startNow ? 'In Progress' : 'Scheduled', _starting: !!e.startNow, CutoffTime: e.startNow ? ctx.nowIso : null, ChairId: Number(p.chairId) || null, Location: p.location || '', OnlineLink: p.onlineLink || '',
      Attendees: JSON.stringify((p.attendeeIds || []).map(String)), InviteState: 'None', Revision: 1, FileDirRef: folderFor(raw, 'meetings', p.areaKey),
      _sending: e.key, _new: true });
  }

  var seq = 0;   // temporary ids, one per new record for the life of the page
  var TABLES = [
    ['actions', 'Action', ACTIONS, { RaiseAction: addAction }],
    ['notices', 'Notice', NOTICES, {}],
    ['register', 'Register Entry', ENTRIES, { RaiseRegisterEntry: addEntry }],
    ['meetings', 'Meeting', MEETINGS, { ScheduleMeeting: addMeeting }]
  ];

  // raw: CH.model.load() output; entries: tracker entries; keep: { actionId: row } actions closed on this screen, still shown.
  // ctx: { personId, today, now }. Returns a new raw; the original is not touched.
  function apply(raw, entries, keep, ctx) {
    var out = Object.assign({}, raw);
    var c = { personId: Number(ctx.personId), today: ctx.today, nowIso: (ctx.now || new Date()).toISOString() };
    var sending = (entries || []).filter(function (e) { return (e.state === 'submitted' || e.state === 'slow') && e.payload; })
      .sort(function (a, b) { return a.submittedAt - b.submittedAt; });
    TABLES.forEach(function (t) {
      if (!raw[t[0]]) return;
      var rows = copy(raw[t[0]].rows);
      if (t[0] === 'actions') {
        Object.keys(keep || {}).forEach(function (id) {
          if (!rows.some(function (r) { return Number(r.Id) === Number(id); })) rows.push(Object.assign({}, keep[id], { _keep: true }));
        });
      }
      sending.forEach(function (e) {
        var p = e.payload || {};
        if (t[3][e.type]) { e.tempId = e.tempId || ++seq; t[3][e.type](raw, rows, e, p, c, e.tempId); return; }
        if (!t[2][e.type] || (e.targetType || 'Action') !== t[1]) return;
        var row = rows.filter(function (r) { return Number(r.Id) === Number(e.targetId); })[0];
        if (!row) return;
        t[2][e.type](row, p, c);
        bump(row, e.key);
      });
      out[t[0]] = Object.assign({}, raw[t[0]], { rows: rows.filter(function (r) { return !r._remove; }) });
    });
    return out;
  }

  // The request types shown this way; anything else is shown as before (on its own page, or in the status line).
  function covers(type) {
    return TABLES.some(function (t) { return !!t[2][type] || !!t[3][type]; });
  }

  return { apply: apply, covers: covers, londonInstant: londonInstant };
})();
