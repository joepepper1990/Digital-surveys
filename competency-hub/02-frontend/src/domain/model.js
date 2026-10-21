// Loads the lists the shell needs and turns them into one read-only model.
// Every section records whether it is complete, partial or unavailable, so a failed or
// truncated read is never presented as "nothing to show".
CH.model = (function () {
  var D = CH.dates;

  var QUERIES = {
    competencies: '$select=Id,Title,CompetencyKey,SortOrder,Status,TrackingStart',
    members: "$select=Id,CompetencyId,PersonId,CanManageMeetings,Status&$filter=Status eq 'Active'",
    actions: '$select=Id,Title,Description,CompetencyId,LinkedCompetenciesId,AssignedToId,RaisedById,DateRaised,DueDay,OriginalDueDate,' +
      'Status,IsOpen,Priority,ExtensionCount,RequiresCloseOut,Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,FileDirRef' +
      '&$filter=IsOpen eq 1 and FSObjType eq 0',
    notices: "$select=Id,Title,Body,Category,IsImportant,ImportantUntil,Status,AuthorId,Created,FileDirRef&$filter=Status eq 'Active' and FSObjType eq 0",
    updates: '$select=Id,EntryType,ParentType,ParentId,AuthorId,Created,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1 and FSObjType eq 0',
    meetings: '$select=Id,CompetencyId,MeetingDate,Status,ChairId&$filter=FSObjType eq 0',
    calendar: "$select=Id,Title,StartTime,AllDay,IsImportant,Status,FileDirRef&$filter=Status eq 'Scheduled' and FSObjType eq 0"
  };

  // Reads each list independently; one failure does not hide the others.
  async function load(sp) {
    var raw = {};
    await Promise.all(Object.keys(QUERIES).map(async function (key) {
      try {
        var res = await sp.items(CH.config.lists[key].title, QUERIES[key]);
        raw[key] = { rows: res.rows, complete: res.complete };
      } catch (error) {
        raw[key] = { rows: [], complete: false, error: error.status || 0 };
      }
    }));
    return raw;
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
    function nameOf(id) { return personBySiteId[id] ? personBySiteId[id].Title : 'Unknown person'; }

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

    var actions = (raw.actions.rows || []).filter(function (r) { return !isUncommitted(r) && r.Status !== 'Closed'; }).map(function (r) {
      var primary = areaById[r.CompetencyId];
      var linked = (r.LinkedCompetenciesId || []).map(function (id) { return areaById[id]; }).filter(Boolean);
      var dueIso = D.fromDueDay(r.DueDay);
      var waitingCloseOut = r.Status === 'Completed';
      var words = waitingCloseOut ? { group: 'later', text: 'Waiting for close-out check' } : D.dueWords(dueIso, today);
      return {
        id: r.Id, ref: 'ACT-' + ('0000' + r.Id).slice(-5), title: r.Title,
        areaKey: primary ? primary.key : '', areaName: primary ? primary.name : 'Unknown area',
        linkedKeys: linked.map(function (a) { return a.key; }),
        ownerId: r.AssignedToId, ownerName: nameOf(r.AssignedToId), raisedById: r.RaisedById,
        dueIso: dueIso, status: r.Status, extensions: r.ExtensionCount || 0,
        originalIso: r.OriginalDueDate ? D.localDate(r.OriginalDueDate) : dueIso,
        description: r.Description || '', priority: r.Priority || 'Normal', requiresCloseOut: !!r.RequiresCloseOut,
        raisedIso: r.DateRaised ? D.localDate(r.DateRaised) : '', raisedByName: nameOf(r.RaisedById),
        revision: Number(r.Revision) || 1, dueDay: Number(r.DueDay), locked: !!r.PendingRequestKey,
        waitingCloseOut: waitingCloseOut, group: words.group, dueText: words.text
      };
    });
    function inArea(action, key) { return action.areaKey === key || action.linkedKeys.indexOf(key) >= 0; }

    // Notices: the area is the folder the item sits in, not a typed value.
    var notices = (raw.notices.rows || []).map(function (n) {
      var key = CH.sp.folderOf(n.FileDirRef);
      var createdIso = D.localDate(n.Created);
      var importantUntil = n.ImportantUntil ? D.localDate(n.ImportantUntil) : '';
      var cap = D.addDays(createdIso, CH.config.noticeImportantMaxDays);
      var important = !!n.IsImportant && (!importantUntil || (importantUntil >= today && today <= cap));
      return {
        id: n.Id, areaKey: key, title: n.Title, body: n.Body || '', category: n.Category || 'General',
        authorId: n.AuthorId, authorName: nameOf(n.AuthorId), fromOutside: !(membersByArea[key] || {})[n.AuthorId] && !isManagementPerson(n.AuthorId),
        createdIso: createdIso, created: n.Created, important: important
      };
    }).filter(function (n) { return !!areaByKey[n.areaKey]; })
      .sort(function (a, b) { return String(b.created).localeCompare(String(a.created)); });
    var noticeById = {};
    notices.forEach(function (n) { noticeById[n.id] = n; });

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
      var slot = latest[key + '|' + source] = latest[key + '|' + source] || { key: key, flaggedBy: null, flagged: false };
      if (u.EntryType === 'Flagged') {
        if (!(membersByArea[key] || {})[u.AuthorId] && !isManagementPerson(u.AuthorId)) return;
        slot.flagged = true; slot.flaggedBy = u.AuthorId;
      } else if (u.EntryType === 'Flag Withdrawn' && slot.flagged) {
        var notice = u.ParentType === 'Notice' ? noticeById[u.ParentId] : null;
        var allowed = u.AuthorId === slot.flaggedBy || isManagementPerson(u.AuthorId) ||
          (meetingAdmins[key] || {})[u.AuthorId] || (notice && notice.authorId === u.AuthorId);
        if (allowed) slot.flagged = false;
      }
    });
    Object.keys(latest).forEach(function (k) {
      if (latest[k].flagged) flagged[latest[k].key] = (flagged[latest[k].key] || 0) + 1;
    });

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
      var list = actions.filter(function (x) { return inArea(x, a.key); });
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
        nextMeeting: m.next, lastMeeting: m.last, meetingStale: stale
      };
    });

    // Who may own an action in an area (ACT-03): its active members, and Team Leaders and the Group Head.
    function ownersFor(key) {
      return people.filter(function (p) {
        return p.Status === 'Active' && ((membersByArea[key] || {})[p.SiteUserId] || CH.config.managementRoles.indexOf(p.Role) >= 0);
      }).map(function (p) { return { id: p.SiteUserId, name: p.Title, role: p.Role }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    var actionById = {};
    actions.forEach(function (a) { actionById[a.id] = a; });

    return {
      today: today, areas: areas, areaByKey: areaByKey, stats: stats, actions: actions, notices: notices, calendar: calendar,
      inArea: inArea, nameOf: nameOf, ownersFor: ownersFor, actionById: actionById,
      sections: {
        actions: section(raw.actions), notices: section(raw.notices), meetings: section(raw.meetings),
        calendar: section(raw.calendar), flags: section(raw.updates), members: section(raw.members)
      }
    };
  }

  return { load: load, build: build, isUncommitted: isUncommitted };
})();
