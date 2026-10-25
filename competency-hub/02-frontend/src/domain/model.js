// Loads the lists the shell needs and turns them into one read-only model.
// Every section records whether it is complete, partial or unavailable, so a failed or
// truncated read is never presented as "nothing to show".
CH.model = (function () {
  var D = CH.dates;

  var QUERIES = {
    competencies: '$select=Id,Title,CompetencyKey,SortOrder,Status,TrackingStart',
    members: "$select=Id,CompetencyId,PersonId,CanManageMeetings,Status&$filter=Status eq 'Active'",
    actions: '$select=Id,Title,Description,CompetencyId,LinkedCompetenciesId,AssignedToId,RaisedById,DateRaised,DueDay,OriginalDueDate,' +
      'Status,IsOpen,Priority,ExtensionCount,RequiresCloseOut,Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,FileDirRef,' +
      'Blocker,CloseOutcome,ClosureNote,DateClosed,SourceType,SourceId,CoOwnerIds,CloseOutById&$filter=IsOpen eq 1 and FSObjType eq 0',
    notices: "$select=Id,Title,Body,Category,IsImportant,ImportantUntil,ImportantDays,ShownIn,Status,AuthorId,Created,FileDirRef,Revision,LastRequestKey&$filter=Status eq 'Active' and FSObjType eq 0",
    register: '$select=Id,Title,Description,EntryType,Impact,Status,Outcome,RaisedById,ResponsiblePersonId,DateRaised,DateResolved,Revision,' +
      'LastRequestKey,CompetencyId,FileDirRef,Created&$filter=FSObjType eq 0',
    updates: '$select=Id,EntryType,ParentType,ParentId,AuthorId,Created,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1 and FSObjType eq 0',
    meetings: '$select=Id,Title,CompetencyId,MeetingDate,EndTime,Status,ChairId,Location,OnlineLink,Attendees,InviteState,InviteToken,OutlookEventId,' +
      'InviteError,Revision,LastRequestKey,CreatedRequestKey,FileDirRef,CancellationReason,CutoffTime,CutoffUpdatesId,IntervalStart,PreviousMeetingId,StartedById,FinalisedAt,FinalisedById,AmendmentCount,PdfState,PdfVersion&$filter=FSObjType eq 0',
    calendar: "$select=Id,Title,StartTime,AllDay,IsImportant,Status,FileDirRef&$filter=Status eq 'Scheduled' and FSObjType eq 0",
    settings: '$select=Id,Title,Value'
  };

  // Columns a later Setup adds: if the site does not have them yet, the list is read without them.
  var OPTIONAL = { actions: ['CoOwnerIds', 'CloseOutById'], notices: ['ImportantDays', 'ShownIn'] };

  // Reads each list independently; one failure does not hide the others. only (release 1.2): just these lists are read
  // again and the rest are kept from prev, the rows read last time, so a saved change repaints after one or two reads.
  async function load(sp, only, prev) {
    var raw = {};
    var keys = only && prev ? only.filter(function (k) { return QUERIES[k]; }) : Object.keys(QUERIES);
    if (only && prev) Object.keys(QUERIES).forEach(function (k) { if (keys.indexOf(k) < 0) raw[k] = prev[k]; });
    await Promise.all(keys.map(async function (key) {
      try {
        var res = await sp.items(CH.config.lists[key].title, QUERIES[key], null, OPTIONAL[key]);
        raw[key] = { rows: res.rows, complete: res.complete };
      } catch (error) {
        raw[key] = { rows: [], complete: false, error: error.status || 0 };
      }
    }));
    raw.discussed = !only || !prev || keys.indexOf('meetings') >= 0 || keys.indexOf('updates') >= 0 ? await discussed(sp, raw) : prev.discussed;
    return raw;
  }

  // What finalised meetings recorded as Discussed (spec NB-5): it clears the flags raised up to that meeting's cut-off.
  // Only meetings whose cut-off could cover a flag still in the list are read, each by its own (indexed) meeting id,
  // and only the frozen rows in the meeting's MTG folder count (only the flow writes there).
  async function discussed(sp, raw) {
    try {
      var first = (raw.updates.rows || []).filter(function (u) { return u.EntryType === 'Flagged'; })
        .reduce(function (m, u) { return Math.min(m, Number(u.Id)); }, Infinity);
      var mtgs = (raw.meetings.rows || []).filter(function (m) { return m.Status === 'Finalised' && Number(m.CutoffUpdatesId) >= first; });
      var res = await Promise.all(mtgs.map(function (m) {
        return sp.items(CH.config.lists.meetingItems.title, '$select=SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq ' + m.Id + " and RowType eq 'Agenda Item'");
      }));
      var out = [];
      mtgs.forEach(function (m, i) {
        res[i].rows.filter(function (r) { return r.Outcome === 'Discussed' && CH.sp.folderOf(r.FileDirRef) === 'MTG-' + m.Id; }).forEach(function (r) {
          out.push({ competencyId: m.CompetencyId, source: r.SourceType + ':' + r.SourceId, upto: Number(m.CutoffUpdatesId), iso: D.localDate(m.MeetingDate) });
        });
      });
      return out;
    } catch (_) { return []; }
  }

  function section(r) {
    if (!r) return 'unavailable';
    if (r.error !== undefined) return 'unavailable';
    return r.complete ? 'complete' : 'partial';
  }

  function isUncommitted(row) {
    return !!row.PendingRequestKey && row.CreatedRequestKey === 'F|' + row.PendingRequestKey;
  }

  // raw: output of load(); people: People rows; access: CH.access.build result; today: 'YYYY-MM-DD'; now: Date
  function build(raw, people, access, today, now) {
    var nowMs = (now || new Date()).getTime();
    var areas = (raw.competencies.rows || [])
      .map(function (c) {
        return { id: c.Id, key: c.CompetencyKey, name: c.Title, status: c.Status, sort: c.SortOrder || 100,
          trackingStart: c.TrackingStart ? D.localDate(c.TrackingStart) : null };
      })
      .sort(function (a, b) { return a.sort - b.sort || a.name.localeCompare(b.name); });
    var areaById = {};
    var areaByKey = {};
    areas.forEach(function (a) { areaById[a.id] = a; areaByKey[a.key] = a; });

    var personBySiteId = {};
    people.forEach(function (p) { personBySiteId[p.SiteUserId] = p; });
    function nameOf(id) { var p = personBySiteId[id]; return p ? CH.names.of(p) : 'Unknown person'; }

    var membersByArea = {};
    var meetingAdmins = {};
    (raw.members.rows || []).forEach(function (m) {
      var area = areaById[m.CompetencyId];
      if (!area) return;
      (membersByArea[area.key] = membersByArea[area.key] || {})[m.PersonId] = true;
      if (m.CanManageMeetings) (meetingAdmins[area.key] = meetingAdmins[area.key] || {})[m.PersonId] = true;
    });
    function isManagementPerson(id) {
      var p = personBySiteId[id];
      return !!p && CH.config.managementRoles.indexOf(p.Role) >= 0;
    }

    // CoOwnerIds is stored as a JSON list of ids ('["112","103"]'); anything else is no co-owners.
    function idList(text) {
      try { var v = JSON.parse(text || '[]'); return Array.isArray(v) ? v.map(Number).filter(function (n) { return n > 0; }) : []; } catch (_) { return []; }
    }

    // One action row as the views use it; also used for finished actions read on demand (actionFrom).
    function actionFrom(r) {
      var primary = areaById[r.CompetencyId];
      var linked = (r.LinkedCompetenciesId || []).map(function (id) { return areaById[id]; }).filter(Boolean);
      var dueIso = D.fromDueDay(r.DueDay);
      var waitingCloseOut = r.Status === 'Completed';
      var words = waitingCloseOut ? { group: 'later', text: 'Waiting for close-out check' } : D.dueWords(dueIso, today);
      // closed just now on this screen: it stays where it was, marked Done, until the person moves on (release 1.2)
      var keptDone = r.Status === 'Closed' && !!r._keep;
      return {
        id: r.Id, ref: 'ACT-' + ('0000' + r.Id).slice(-5), title: r.Title,
        areaKey: primary ? primary.key : '', areaName: primary ? primary.name : 'Unknown area',
        linkedKeys: linked.map(function (a) { return a.key; }),
        ownerId: r.AssignedToId, ownerName: nameOf(r.AssignedToId), raisedById: r.RaisedById,
        coOwnerIds: idList(r.CoOwnerIds), coOwnerNames: idList(r.CoOwnerIds).map(nameOf),
        checkerId: r.CloseOutById ? Number(r.CloseOutById) : null, checkerName: r.CloseOutById ? nameOf(Number(r.CloseOutById)) : '',
        dueIso: dueIso, status: r.Status, extensions: r.ExtensionCount || 0,
        originalIso: r.OriginalDueDate ? D.localDate(r.OriginalDueDate) : dueIso,
        description: r.Description || '', priority: r.Priority || 'Normal', requiresCloseOut: !!r.RequiresCloseOut,
        raisedIso: r.DateRaised ? D.localDate(r.DateRaised) : '', raisedByName: nameOf(r.RaisedById),
        revision: Number(r.Revision) || 1, dueDay: Number(r.DueDay), locked: !!r.PendingRequestKey,
        waitingCloseOut: waitingCloseOut, group: r.Status === 'Closed' && !keptDone ? 'done' : words.group,
        dueText: keptDone ? 'Done' : r.Status === 'Closed' ? 'Closed' : words.text, done: r.Status === 'Closed',
        // still being saved (✓ Sent), and a new one the flow has not numbered yet (a temporary negative id)
        sending: r._sending || '', isNew: !!r._new,
        blocker: r.Status === 'Awaiting Input' ? (r.Blocker || '') : '', closeOutcome: r.CloseOutcome || '', closureNote: r.ClosureNote || '',
        closedIso: r.DateClosed ? D.localDate(r.DateClosed) : '',
        sourceType: r.SourceType || 'None', sourceId: r.SourceId ? Number(r.SourceId) : null
      };
    }
    var actions = (raw.actions.rows || []).filter(function (r) { return !isUncommitted(r) && (r.Status !== 'Closed' || r._keep); }).map(actionFrom);
    function inArea(action, key) { return action.areaKey === key || action.linkedKeys.indexOf(key) >= 0; }

    // Notices: the area is the folder the item sits in, not a typed value.
    var notices = (raw.notices.rows || []).map(function (n) {
      var key = CH.sp.folderOf(n.FileDirRef);
      var createdIso = D.localDate(n.Created);
      var importantUntil = n.ImportantUntil ? D.localDate(n.ImportantUntil) : '';
      // important for the time its author chose (1 week to 3 months; a month before 1.9.0.0), never longer
      var days = [7, 14, 30, 90].indexOf(Number(n.ImportantDays)) >= 0 ? Number(n.ImportantDays) : CH.config.noticeImportantMaxDays;
      var cap = D.addDays(createdIso, days);
      var pinned = !!n.IsImportant && !n.ImportantUntil && !n.ImportantDays;
      var important = !!n.IsImportant && (pinned || (importantUntil ? importantUntil >= today : today <= cap));
      // stored once, shown on every noticeboard it was posted to: "All", or a list of area keys (1.9.0.0)
      var shown = String(n.ShownIn || '').trim();
      var shownAll = shown === 'All';
      var areaKeys = shownAll ? areas.map(function (a) { return a.key; })
        : [key].concat(shown ? shown.split(';').filter(function (k) { return k && k !== key && areaByKey[k]; }) : []);
      return {
        id: n.Id, areaKey: key, title: n.Title, body: n.Body || '', category: n.Category || 'General',
        authorId: n.AuthorId, authorName: nameOf(n.AuthorId), fromOutside: !(membersByArea[key] || {})[n.AuthorId] && !isManagementPerson(n.AuthorId),
        createdIso: createdIso, created: n.Created, important: important, pinned: pinned,
        importantDays: n.ImportantDays ? Number(n.ImportantDays) : null, areaKeys: areaKeys, shownAll: shownAll,
        // notices posted before the Revision column existed have none: they are then sent without a stale check
        revision: Number(n.Revision) || 0, lastRequestKey: n.LastRequestKey || '', sending: n._sending || ''
      };
    }).filter(function (n) { return !!areaByKey[n.areaKey]; })
      .sort(function (a, b) { return String(b.created).localeCompare(String(a.created)); });
    var noticeById = {};
    notices.forEach(function (n) { noticeById[n.id] = n; });

    // Improvements and degradations (spec REG-1): the area is the folder the entry sits in, as the flow made it.
    var entries = (raw.register ? raw.register.rows || [] : []).map(function (e) {
      var key = CH.sp.folderOf(e.FileDirRef);
      return {
        id: e.Id, ref: 'REG-' + ('0000' + e.Id).slice(-5), areaKey: key, title: e.Title, description: e.Description || '', entryType: e.EntryType,
        impact: e.Impact || '', status: e.Status, outcome: e.Outcome || '', raisedById: e.RaisedById, raisedByName: nameOf(e.RaisedById),
        responsibleId: e.ResponsiblePersonId, responsibleName: e.ResponsiblePersonId ? nameOf(e.ResponsiblePersonId) : '',
        raisedIso: e.DateRaised ? D.localDate(e.DateRaised) : (e.Created ? D.localDate(e.Created) : ''),
        resolvedIso: e.DateResolved ? D.localDate(e.DateResolved) : '', revision: Number(e.Revision) || 1,
        open: e.Status === 'Open' || e.Status === 'Under Review', sending: e._sending || '', isNew: !!e._new
      };
    }).filter(function (e) { return !!areaByKey[e.areaKey]; })
      .sort(function (a, b) { return b.id - a.id; });
    var entryById = {};
    entries.forEach(function (e) { entryById[e.id] = e; });

    // Flags (plan F.5): counted only in the source's own area folder, ordered by server item ID.
    // Clearing by a finalised meeting's outcome comes with the meetings increment.
    var flagged = {};
    var events = (raw.updates.rows || []).filter(function (u) {
      return !u.IsHidden && new Date(u.Created).getTime() <= nowMs + 5 * 60 * 1000;
    }).sort(function (a, b) { return a.Id - b.Id; });
    var latest = {};
    events.forEach(function (u) {
      var key = CH.sp.folderOf(u.FileDirRef);
      if (!areaByKey[key]) return;
      var source = u.ParentType + ':' + u.ParentId;
      if (u.ParentType === 'Notice' && (!noticeById[u.ParentId] || noticeById[u.ParentId].areaKey !== key)) return;
      if (u.ParentType === 'Register Entry' && (!entryById[u.ParentId] || entryById[u.ParentId].areaKey !== key)) return;
      if (u.ParentType !== 'Notice' && u.ParentType !== 'Register Entry') return;
      var slot = latest[key + '|' + source] = latest[key + '|' + source] || { key: key, source: source, flaggedBy: null, flagged: false, history: [] };
      if (u.EntryType === 'Flagged') {
        if (!(membersByArea[key] || {})[u.AuthorId] && !isManagementPerson(u.AuthorId)) return;
        slot.flagged = true; slot.flaggedBy = u.AuthorId; slot.flagId = Number(u.Id);
        slot.history.push({ kind: 'Flagged for the next meeting', by: nameOf(u.AuthorId), iso: D.localDate(u.Created) });
      } else if (u.EntryType === 'Flag Withdrawn' && slot.flagged) {
        var notice = u.ParentType === 'Notice' ? noticeById[u.ParentId] : null;
        var entry = u.ParentType === 'Register Entry' ? entryById[u.ParentId] : null;
        var allowed = u.AuthorId === slot.flaggedBy || isManagementPerson(u.AuthorId) ||
          (meetingAdmins[key] || {})[u.AuthorId] || (notice && notice.authorId === u.AuthorId) || (entry && entry.raisedById === u.AuthorId);
        if (allowed) { slot.flagged = false; slot.history.push({ kind: 'Flag withdrawn', by: nameOf(u.AuthorId), iso: D.localDate(u.Created) }); }
      }
    });
    (raw.discussed || []).forEach(function (d) {
      var area = areaById[d.competencyId];
      var slot = area && latest[area.key + '|' + d.source];
      if (slot && slot.flagged && slot.flagId <= d.upto) {
        slot.flagged = false;
      }
    });
    var flags = {};
    Object.keys(latest).forEach(function (k) {
      flags[latest[k].source] = latest[k];
      if (latest[k].flagged) flagged[latest[k].key] = (flagged[latest[k].key] || 0) + 1;
    });
    notices.forEach(function (n) { n.flagged = !!(flags['Notice:' + n.id] || {}).flagged; });
    entries.forEach(function (e) { e.flagged = !!(flags['Register Entry:' + e.id] || {}).flagged; });

    // Meetings (spec MTG-1): in the area's folder; times shown in UK time.
    function meetingFrom(m) {
      var area = areaById[m.CompetencyId];
      var attendees = [];
      try { attendees = JSON.parse(m.Attendees || '[]') || []; } catch (_) { attendees = []; }
      var start = m.MeetingDate ? new Date(m.MeetingDate) : null;
      return {
        id: m.Id, ref: 'MTG-' + ('0000' + m.Id).slice(-5), areaKey: area ? area.key : '', areaName: area ? area.name : '', status: m.Status,
        dateIso: start ? D.localDate(start) : '', start: start ? D.ukTime(start) : '', end: m.EndTime ? D.ukTime(m.EndTime) : '',
        startUtc: m.MeetingDate || '', endUtc: m.EndTime || '', location: m.Location || '', onlineLink: m.OnlineLink || '',
        chairId: m.ChairId, chairName: m.ChairId ? nameOf(m.ChairId) : '', attendeeIds: attendees.map(Number),
        inviteState: m.InviteState || 'None', inviteToken: m.InviteToken || '', inviteError: m.InviteError || '', revision: Number(m.Revision) || 1,
        cancellationReason: m.CancellationReason || '', cutoff: m.CutoffTime || '', intervalStart: m.IntervalStart || '',
        previousId: m.PreviousMeetingId ? Number(m.PreviousMeetingId) : null, locked: isUncommitted(m), cutoffUpdatesId: Number(m.CutoffUpdatesId) || 0,
        finalisedIso: m.FinalisedAt ? D.localDate(m.FinalisedAt) : '', finalisedByName: m.FinalisedById ? nameOf(m.FinalisedById) : '',
        amendments: Number(m.AmendmentCount) || 0, pdfState: m.PdfState || 'None', pdfVersion: Number(m.PdfVersion) || 0,
        sending: m._sending || '', isNew: !!m._new,
        // started or finalised on this screen, while the flow fixes the agenda or freezes the record (release 1.2)
        starting: !!m._starting, finalising: !!m._finalising
      };
    }
    var meetings = (raw.meetings.rows || []).filter(function (m) { return !isUncommitted(m); }).map(meetingFrom)
      .filter(function (m) { return !!m.areaKey; }).sort(function (a, b) { return String(a.startUtc).localeCompare(String(b.startUtc)); });
    var meetingById = {};
    meetings.forEach(function (m) { meetingById[m.id] = m; });

    var meetingsByArea = {};
    (raw.meetings.rows || []).forEach(function (m) {
      var area = areaById[m.CompetencyId];
      if (!area) return;
      var iso = D.localDate(m.MeetingDate);
      var slot = meetingsByArea[area.key] = meetingsByArea[area.key] || { next: null, last: null };
      if ((m.Status === 'Scheduled' || m.Status === 'In Progress') && iso >= today && (!slot.next || iso < slot.next)) slot.next = iso;
      if (m.Status === 'Finalised' && (!slot.last || iso > slot.last)) slot.last = iso;
    });

    var calendar = (raw.calendar.rows || []).map(function (e) {
      return { id: e.Id, areaKey: CH.sp.folderOf(e.FileDirRef), title: e.Title, dateIso: D.localDate(e.StartTime), important: !!e.IsImportant };
    }).filter(function (e) { return e.dateIso >= today && e.dateIso <= D.addDays(today, 60); })
      .sort(function (a, b) { return a.dateIso.localeCompare(b.dateIso); });

    var stats = {};
    areas.forEach(function (a) {
      var list = actions.filter(function (x) { return inArea(x, a.key) && !x.done; });
      var m = meetingsByArea[a.key] || { next: null, last: null };
      // Overdue once the gap since the last meeting, or since tracking started, exceeds the limit.
      var since = m.last || a.trackingStart;
      var stale = !m.next && (!since || D.daysBetween(since, today) > CH.config.meetingOverdueDays);
      stats[a.key] = {
        open: list.length,
        late: list.filter(function (x) { return x.group === 'late'; }).length,
        dueSoon: list.filter(function (x) { return x.group === 'soon'; }).length,
        movedTwice: list.filter(function (x) { return x.extensions >= 2; }).length,
        closeOut: list.filter(function (x) { return x.waitingCloseOut; }).length,
        flagged: flagged[a.key] || 0,
        openEntries: entries.filter(function (e) { return e.areaKey === a.key && e.open; }).length,
        degradations: entries.filter(function (e) { return e.areaKey === a.key && e.open && e.entryType === 'Degradation'; }).length,
        nextMeeting: m.next, lastMeeting: m.last, meetingStale: stale
      };
    });

    // Who may own an action in an area (ACT-03): its active members, and Team Leaders and the Group Head.
    // On someone's to-do list: what they own, what they share as a co-owner, and a close-out check waiting for them.
    function isMine(a, personId) {
      var me = Number(personId);
      return Number(a.ownerId) === me || a.coOwnerIds.indexOf(me) >= 0 || (a.waitingCloseOut && Number(a.checkerId) === me);
    }

    function ownersFor(key) {
      return people.filter(function (p) {
        return p.Status === 'Active' && ((membersByArea[key] || {})[p.SiteUserId] || CH.config.managementRoles.indexOf(p.Role) >= 0);
      }).map(function (p) { return { id: p.SiteUserId, name: CH.names.of(p), role: p.Role }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    var actionById = {};
    actions.forEach(function (a) { actionById[a.id] = a; });

    return {
      today: today, areas: areas, areaByKey: areaByKey, stats: stats, actions: actions, notices: notices, calendar: calendar,
      entries: entries, entryById: entryById, noticeById: noticeById, flags: flags, people: people, meetings: meetings, meetingById: meetingById,
      inArea: inArea, nameOf: nameOf, ownersFor: ownersFor, isMine: isMine, actionById: actionById, actionFrom: actionFrom, membersByArea: membersByArea, chairsByArea: meetingAdmins,
      sections: {
        actions: section(raw.actions), notices: section(raw.notices), meetings: section(raw.meetings),
        calendar: section(raw.calendar), flags: section(raw.updates), members: section(raw.members), register: section(raw.register)
      }
    };
  }

  // Finished (closed) actions are not loaded with the page; they are read on demand, newest first (plan K9.3).
  // who: 'AssignedToId' or 'RaisedById' – both indexed, so the filter starts with an indexed column.
  async function loadFinished(sp, who, personId) {
    var res = await sp.items(CH.config.lists.actions.title, QUERIES.actions.replace('&$filter=IsOpen eq 1 and FSObjType eq 0',
      '&$filter=' + who + ' eq ' + Number(personId) + ' and IsOpen eq 0 and FSObjType eq 0'), 500);
    return res.rows.filter(function (r) { return !isUncommitted(r); })
      .sort(function (a, b) { return String(b.DateClosed || '').localeCompare(String(a.DateClosed || '')); }).slice(0, 50);
  }

  // One action by its ID (for a link to a finished action, or one that has just been closed).
  async function loadAction(sp, id) {
    var res = await sp.items(CH.config.lists.actions.title, QUERIES.actions.replace('&$filter=IsOpen eq 1 and FSObjType eq 0',
      '&$filter=Id eq ' + Number(id)), 1);
    var row = res.rows[0];
    return row && !isUncommitted(row) ? row : null;
  }

  return { QUERIES: QUERIES, load: load, build: build, isUncommitted: isUncommitted, loadFinished: loadFinished, loadAction: loadAction };
})();
