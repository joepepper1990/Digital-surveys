// The monthly meeting agenda (spec MTG-2, plan F.7.3). The same rules as the Meetings flow, which writes the agenda
// when the meeting starts; before that the app shows this as a preview. It works on list rows exactly as SharePoint
// returns them, so the app and the flow read the same things (test_meetings.py checks that the two agree).
CH.agenda = (function () {
  var SECTIONS = ['Open actions', 'Closed since last meeting', 'Carried forward', 'Noticeboard', 'New improvements and degradations',
    'Unresolved degradations', 'Important dates'];

  function id(v) { return v === null || v === undefined || v === '' ? '' : String(Math.trunc(Number(v))); }
  function ms(v) { return v ? new Date(v).getTime() : new Date('2000-01-01T00:00:00Z').getTime(); }
  function folder(row) { var p = String(row.FileDirRef || '').split('/'); return p[p.length - 1]; }
  function uncommitted(r) { return !!r.PendingRequestKey && r.CreatedRequestKey === 'F|' + r.PendingRequestKey; }

  // Which notices and entries are flagged at the cut-off (plan F.5): events in the area's folder up to the cut-off,
  // oldest first. A member or management raises a flag; the flagger, management, a meeting runner of the area or the
  // source's author or raiser withdraws it. A finalised meeting that recorded the item as Discussed clears every flag
  // raised up to that meeting's cut-off (input.cleared: [{ key, upto }]); a flag raised after it still counts.
  function flagged(input) {
    var sources = {};
    var authors = {};
    input.notices.filter(function (n) { return folder(n) === input.areaKey; }).forEach(function (n) {
      sources['Notice:' + id(n.Id)] = true; authors['Notice:' + id(n.Id)] = id(n.AuthorId);
    });
    input.entries.filter(function (e) { return folder(e) === input.areaKey; }).forEach(function (e) {
      sources['Register Entry:' + id(e.Id)] = true; authors['Register Entry:' + id(e.Id)] = id(e.RaisedById);
    });
    var on = {};
    var at = {};
    input.flags.filter(function (f) { return folder(f) === input.areaKey && f.IsHidden !== true && Number(f.Id) <= Number(input.cutUpdatesId); })
      .sort(function (a, b) { return a.Id - b.Id; })
      .forEach(function (f) {
        var key = f.ParentType + ':' + id(f.ParentId);
        var who = id(f.AuthorId);
        if (f.EntryType === 'Flagged' && sources[key] && (input.memberIds.indexOf(who) >= 0 || input.mgmtIds.indexOf(who) >= 0)) { on[key] = who; at[key] = Number(f.Id); }
        else if (f.EntryType === 'Flag Withdrawn' && on[key] !== undefined &&
          (on[key] === who || input.mgmtIds.indexOf(who) >= 0 || input.chairIds.indexOf(who) >= 0 || authors[key] === who)) { delete on[key]; delete at[key]; }
      });
    (input.cleared || []).forEach(function (c) { if (at[c.key] !== undefined && at[c.key] <= Number(c.upto)) { delete on[c.key]; delete at[c.key]; } });
    return on;
  }

  // input: { areaId, areaKey, sinceIso, cutIso, cutUpdatesId, actionsOpen, actionsClosed, notices, entries, flags,
  //          memberIds, chairIds, mgmtIds, carried, cleared, dates, lookaheadDays } – ids as text.
  // Returns [{ section, order, sourceType, sourceId, marker, row }], in section order.
  function build(input) {
    var since = ms(input.sinceIso);
    var cut = ms(input.cutIso);
    var area = id(input.areaId);
    function inArea(a) { return id(a.CompetencyId) === area || (a.LinkedCompetenciesId || []).map(id).indexOf(area) >= 0; }
    var on = flagged(input);
    var out = [];
    function add(section, type, row, marker, sourceId) {
      out.push({ section: section, order: SECTIONS.indexOf(section) + 1, sourceType: type, sourceId: id(sourceId !== undefined ? sourceId : row.Id), marker: marker || '', row: row });
    }
    input.actionsOpen.filter(function (a) { return inArea(a) && !uncommitted(a) && ms(a.DateRaised) <= cut; })
      .forEach(function (a) { add('Open actions', 'Action', a, ms(a.DateRaised) > since ? 'Raised since last meeting' : 'Still open'); });
    input.actionsClosed.filter(function (a) { return inArea(a) && !uncommitted(a) && a.DateClosed && ms(a.DateClosed) > since && ms(a.DateClosed) <= cut; })
      .forEach(function (a) { add('Closed since last meeting', 'Action', a); });
    var carried = input.carried.filter(function (c) {
      return ['Deferred', 'Not reached'].indexOf(c.Outcome) >= 0 && ['Notice', 'Register Entry', 'New Business'].indexOf(c.SourceType) >= 0;
    });
    var carriedKeys = carried.map(function (c) { return c.SourceType + ':' + id(c.SourceId); });
    carried.forEach(function (c) { add('Carried forward', c.SourceType, c, 'Carried forward', c.SourceId); });
    input.notices.filter(function (n) { var k = 'Notice:' + id(n.Id); return folder(n) === input.areaKey && on[k] !== undefined && carriedKeys.indexOf(k) < 0; })
      .forEach(function (n) { add('Noticeboard', 'Notice', n); });
    var entries = input.entries.filter(function (e) { return folder(e) === input.areaKey; });
    var newer = entries.filter(function (e) {
      var k = 'Register Entry:' + id(e.Id);
      return carriedKeys.indexOf(k) < 0 && (on[k] !== undefined || (ms(e.DateRaised) > since && ms(e.DateRaised) <= cut));
    });
    newer.forEach(function (e) { add('New improvements and degradations', 'Register Entry', e); });
    entries.filter(function (e) {
      return e.EntryType === 'Degradation' && (e.Status === 'Open' || e.Status === 'Under Review') && newer.indexOf(e) < 0 &&
        carriedKeys.indexOf('Register Entry:' + id(e.Id)) < 0;
    }).forEach(function (e) { add('Unresolved degradations', 'Register Entry', e); });
    var first = CH.dates.localDate(new Date(cut));
    var last = CH.dates.addDays(first, Number(input.lookaheadDays) || 60);
    input.dates.filter(function (d) { var day = CH.dates.localDate(d.StartTime || '2000-01-01T00:00:00Z'); return folder(d) === input.areaKey && day >= first && day <= last; })
      .forEach(function (d) { add('Important dates', 'Date', d); });
    return out;
  }

  // Discussed items of finalised meetings clear the flags raised up to their cut-off. Only meetings whose cut-off could
  // cover a flag still raised are read, each by its own (indexed) meeting id. Rows count only from the meeting's own
  // MTG folder, which only the flow writes, and only once the meeting is finalised.
  async function cleared(sp, areaId, flags) {
    var L = CH.config.lists;
    var first = flags.filter(function (f) { return f.EntryType === 'Flagged'; }).reduce(function (m, f) { return Math.min(m, Number(f.Id)); }, Infinity);
    if (first === Infinity) return [];
    var mtgs = (await sp.items(L.meetings.title, '$select=Id,CutoffUpdatesId&$filter=CompetencyId eq ' + areaId + " and Status eq 'Finalised'")).rows
      .filter(function (m) { return Number(m.CutoffUpdatesId) >= first; });
    var res = await Promise.all(mtgs.map(function (m) {
      return sp.items(L.meetingItems.title, '$select=SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq ' + m.Id + " and RowType eq 'Agenda Item'");
    }));
    var out = [];
    mtgs.forEach(function (m, i) {
      res[i].rows.filter(function (r) { return r.Outcome === 'Discussed' && folder(r) === 'MTG-' + m.Id && (r.SourceType === 'Notice' || r.SourceType === 'Register Entry'); })
        .forEach(function (r) { out.push({ key: r.SourceType + ':' + id(r.SourceId), upto: Number(m.CutoffUpdatesId) }); });
    });
    return out;
  }

  // Reads what build() needs, the same way the flow does, for a meeting that has not started (the cut-off is now).
  async function preview(sp, model, meeting, settings) {
    var L = CH.config.lists;
    var area = model.areaByKey[meeting.areaKey];
    var act = 'Id,Title,AssignedToId,Status,DueDay,OriginalDueDate,ExtensionCount,Blocker,DateRaised,DateClosed,CloseOutcome,CompetencyId,' +
      'LinkedCompetenciesId,PendingRequestKey,CreatedRequestKey';
    // the area's last finalised meeting, as the flow finds it when the meeting starts
    var previous = meeting.previousId ? model.meetingById[meeting.previousId] : model.meetings.filter(function (m) {
      return m.areaKey === meeting.areaKey && m.status === 'Finalised';
    }).sort(function (a, b) { return String(b.startUtc).localeCompare(String(a.startUtc)); })[0];
    var previousId = previous ? previous.id : meeting.previousId;
    var since = meeting.intervalStart || (previous && previous.cutoff) || (area.trackingStart ? area.trackingStart + 'T00:00:00Z' : '2000-01-01T00:00:00Z');
    var res = await Promise.all([
      sp.items(L.actions.title, '$select=' + act + '&$filter=IsOpen eq 1'),
      sp.items(L.actions.title, '$select=' + act + "&$filter=IsOpen eq 0 and DateClosed ge datetime'" + new Date(since).toISOString().slice(0, 19) + "Z'"),
      sp.items(L.notices.title, "$select=Id,Title,AuthorId,FileDirRef&$filter=Status eq 'Active'"),
      sp.items(L.register.title, '$select=Id,Title,EntryType,Impact,Status,RaisedById,DateRaised,FileDirRef&$filter=CompetencyId eq ' + area.id),
      sp.items(L.updates.title, '$select=Id,EntryType,ParentType,ParentId,AuthorId,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1'),
      sp.items(L.calendar.title, "$select=Id,Title,StartTime,FileDirRef&$filter=IsImportant eq 1 and Status eq 'Scheduled'"),
      // what the last finalised meeting deferred or did not reach: its frozen agenda rows, in its own MTG folder
      previousId ? sp.items(L.meetingItems.title, '$select=Title,SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq ' + previousId + " and RowType eq 'Agenda Item'")
        : Promise.resolve({ rows: [] })
    ]);
    var flags = res[4].rows.filter(function (f) { return folder(f) === area.key; });
    var members = model.membersByArea[meeting.areaKey] || {};
    var look = (settings || []).filter(function (r) { return r.Title === 'AgendaLookaheadDays'; })[0];
    return build({
      areaId: area.id, areaKey: area.key, sinceIso: since, cutIso: new Date().toISOString(), cutUpdatesId: Number.MAX_SAFE_INTEGER,
      actionsOpen: res[0].rows, actionsClosed: res[1].rows, notices: res[2].rows, entries: res[3].rows, flags: res[4].rows, dates: res[5].rows,
      carried: res[6].rows.filter(function (r) { return folder(r) === 'MTG-' + previousId; }), cleared: await cleared(sp, area.id, flags),
      memberIds: Object.keys(members).map(id), chairIds: Object.keys(model.chairsByArea[meeting.areaKey] || {}).map(id),
      mgmtIds: model.people.filter(function (p) { return CH.config.managementRoles.indexOf(p.Role) >= 0; }).map(function (p) { return id(p.SiteUserId); }),
      lookaheadDays: look ? look.Value : 60
    });
  }

  return { build: build, preview: preview, flagged: flagged, cleared: cleared, SECTIONS: SECTIONS };
})();
