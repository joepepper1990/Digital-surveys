// A simulated request flow for local testing (plan K7.3). It applies a request the way the Power Automate
// flow does: the requester comes from the folder, the rules come from the app's own rules module, the
// change is made with the lock and revision checks, History gets its event row, and the request is
// marked Completed or Rejected. Nothing here is used on the real site.
window.MockFlow = (function () {
  'use strict';
  var R = window.MockRules.rules;
  var D = window.MockRules.dates;
  var C = window.MockRules.config;
  var ROOT = '/sites/ESGCompetencyHub/Lists/';
  var STALE = 'This action was updated by someone else. Review the latest details and try again.';

  function create(data, today) {
    var areaKeys = data.Competencies.map(function (c) { return c.CompetencyKey; });
    function areaId(key) { return data.Competencies.filter(function (c) { return c.CompetencyKey === key; })[0].Id; }
    function areaKeyOf(id) { return (data.Competencies.filter(function (c) { return c.Id === id; })[0] || {}).CompetencyKey; }
    function person(id) { return data.People.filter(function (p) { return p.SiteUserId === id; })[0]; }
    function management(p) { return !!p && C.managementRoles.indexOf(p.Role) >= 0; }
    function membership(id, key) {
      return data['Competency Members'].filter(function (m) { return m.PersonId === id && m.CompetencyId === areaId(key) && m.Status === 'Active'; })[0];
    }

    // The same authorisation the flow applies (E.3), built from the lists rather than from the request.
    function accessFor(p) {
      return {
        isManagement: management(p),
        isTechnician: p.Role === 'Technician',
        canWrite: function (key) { return areaKeys.indexOf(key) >= 0 && (management(p) || !!membership(p.SiteUserId, key)); },
        isEngineerIn: function (key) { return p.Role === 'Engineer' && !!membership(p.SiteUserId, key); },
        chairs: function (key) { var m = membership(p.SiteUserId, key); return !!m && !!m.CanManageMeetings; },
        canModerate: function (key) { return areaKeys.indexOf(key) >= 0 && (management(p) || (p.Role === 'Engineer' && !!membership(p.SiteUserId, key))); },
        canRaiseFor: function (key, ownerId) {
          var m = membership(p.SiteUserId, key);
          return p.Role !== 'Technician' || (!!m && !!m.CanManageMeetings) || Number(ownerId) === p.SiteUserId;
        }
      };
    }
    function ukMidnight(iso) { return iso + 'T00:00:00Z'; }
    function nextId(list) { return list.reduce(function (m, x) { return Math.max(m, x.Id); }, 0) + 1; }

    function event(req, action, fields) {
      var key = areaKeyOf(action.CompetencyId);
      data.History.push(Object.assign({ Id: nextId(data.History), RowKind: 'Event', RequestKey: req.RequestKey + '|1', RecordType: 'Action',
        RecordId: action.Id, ActorId: req.AuthorId, EventTime: new Date().toISOString(), FileDirRef: ROOT + 'History/' + key + '/A' + action.Id }, fields));
    }

    function finish(req, status, message, resultId) {
      req.Status = status;
      req.ResultMessage = message;
      if (resultId) req.ResultId = resultId;
      req.ProcessedAt = new Date().toISOString();
    }

    // ---- notices, comments and the register (4 Records), with the same rules as the app
    var RECORDS = ['EditNotice', 'ArchiveNotice', 'PinNotice', 'HideComment', 'RaiseRegisterEntry', 'UpdateRegisterEntry', 'LinkActionToEntry', 'UnlinkActionFromEntry'];
    function folderKey(row) { return String(row.FileDirRef).split('/').pop(); }
    function firstError(errors) { var k = Object.keys(errors); return k.length ? errors[k[0]] : ''; }
    function ownerAllowed(key, id) { var o = person(id); return !!o && o.Status === 'Active' && (management(o) || !!membership(id, key)); }
    function recordEvent(req, key, recordType, recordId, eventType, extra) {
      data.History.push(Object.assign({ Id: nextId(data.History), RowKind: 'Event', RequestKey: req.RequestKey + '|1', RecordType: recordType, RecordId: recordId,
        EventType: eventType, ActorId: req.AuthorId, EventTime: new Date().toISOString(), CompetencyId: areaId(key), FileDirRef: ROOT + 'History/' + key }, extra || {}));
    }
    function records(req, payload, requester, access) {
      var me = requester.SiteUserId;
      var reg = data['Improvements and Degradations'];
      var err;
      if (req.RequestType === 'RaiseRegisterEntry') {
        if ((err = firstError(R.validateEntry(payload, { canWrite: access.canWrite, ownerAllowed: ownerAllowed })))) return finish(req, 'Rejected', err);
        var id = nextId(reg);
        reg.push({ Id: id, Title: payload.title, Description: payload.description, EntryType: payload.entryType, Impact: payload.impact, Status: 'Open', Outcome: '',
          RaisedById: me, ResponsiblePersonId: Number(payload.responsibleId), DateRaised: new Date().toISOString(), Created: new Date().toISOString(),
          Revision: 1, LastRequestKey: req.RequestKey, CreatedRequestKey: 'F|' + req.RequestKey, CompetencyId: areaId(payload.areaKey),
          FileDirRef: ROOT + 'ImprovementRegister/' + payload.areaKey });
        recordEvent(req, payload.areaKey, 'Register Entry', id, 'Entry Raised');
        return finish(req, 'Completed', 'REG-' + ('0000' + id).slice(-5) + ' raised.', id);
      }
      var list = req.RequestType === 'HideComment' ? data.Updates : /Notice$/.test(req.RequestType) ? data.Noticeboard : reg;
      var rec = list.filter(function (x) { return x.Id === Number(req.TargetId); })[0];
      if (!rec) return finish(req, 'Rejected', 'That could not be found. It may have been removed.');
      var key = folderKey(rec);
      if (req.RequestType !== 'HideComment' && Number(req.ExpectedRevision) > 0 && Number(req.ExpectedRevision) !== Number(rec.Revision || 0)) {
        return finish(req, 'Rejected', 'This was changed by someone else. Review the latest details and try again.');
      }
      var bump = function () { rec.Revision = (Number(rec.Revision) || 1) + 1; rec.LastRequestKey = req.RequestKey; };
      var nshape = { authorId: rec.AuthorId, areaKey: key };
      if (req.RequestType === 'EditNotice' || req.RequestType === 'ArchiveNotice' || req.RequestType === 'PinNotice') {
        var nr = R.noticeRoles(nshape, me, access);
        if (rec.Status !== 'Active') return finish(req, 'Rejected', 'This notice has been archived.');
        if (req.RequestType === 'PinNotice') {
          if (!nr.canPin) return finish(req, 'Rejected', 'Only the engineers of the area and management can pin notices.');
          rec.IsImportant = !!payload.pinned; rec.ImportantUntil = null; bump();
          recordEvent(req, key, 'Notice', rec.Id, payload.pinned ? 'Notice Pinned' : 'Notice Unpinned');
          return finish(req, 'Completed', payload.pinned ? 'Notice pinned.' : 'Notice unpinned.', rec.Id);
        }
        if (!nr.canEdit) return finish(req, 'Rejected', 'Only the person who posted it, or the engineers of the area and management, can change this notice.');
        if (req.RequestType === 'ArchiveNotice') {
          rec.Status = 'Archived'; rec.IsImportant = false; bump();
          recordEvent(req, key, 'Notice', rec.Id, 'Notice Archived');
          return finish(req, 'Completed', 'Notice archived.', rec.Id);
        }
        if ((err = firstError(R.validateNoticeEdit(payload)))) return finish(req, 'Rejected', err);
        if ('title' in payload) rec.Title = payload.title;
        if ('body' in payload) rec.Body = payload.body;
        if ('category' in payload) rec.Category = payload.category;
        if ('important' in payload) { rec.IsImportant = !!payload.important; rec.ImportantUntil = payload.important ? D.addDays(today, 30) + 'T00:00:00Z' : null; }
        bump();
        recordEvent(req, key, 'Notice', rec.Id, 'Notice Edited');
        return finish(req, 'Completed', 'Notice saved.', rec.Id);
      }
      if (req.RequestType === 'HideComment') {
        if (rec.EntryType !== 'Comment') return finish(req, 'Rejected', 'Only comments can be hidden.');
        if (!access.canModerate(key)) return finish(req, 'Rejected', 'Only the engineers of the area and management can hide comments.');
        rec.IsHidden = true;
        recordEvent(req, key, rec.ParentType === 'Register Entry' ? 'Register Entry' : 'Notice', rec.ParentId, 'Comment Hidden');
        return finish(req, 'Completed', 'Comment hidden.', rec.Id);
      }
      var eshape = { areaKey: key, raisedById: rec.RaisedById, responsibleId: rec.ResponsiblePersonId };
      if (!R.managesEntry(eshape, me, access)) return finish(req, 'Rejected', 'Only the person who raised it, the person responsible, the engineers and meeting runners of the area, and management can change this entry.');
      if (req.RequestType === 'UpdateRegisterEntry') {
        if ((err = firstError(R.validateEntryUpdate(eshape, payload, { ownerAllowed: ownerAllowed })))) return finish(req, 'Rejected', err);
        if ('title' in payload) rec.Title = payload.title;
        if ('description' in payload) rec.Description = payload.description;
        if ('impact' in payload) rec.Impact = payload.impact;
        if ('outcome' in payload) rec.Outcome = payload.outcome;
        if ('responsibleId' in payload) rec.ResponsiblePersonId = Number(payload.responsibleId);
        if ('status' in payload) { rec.Status = payload.status; rec.DateResolved = ['Resolved', 'Closed'].indexOf(payload.status) >= 0 ? new Date().toISOString() : null; }
        bump();
        recordEvent(req, key, 'Register Entry', rec.Id, 'status' in payload ? 'Entry Status Changed' : 'Entry Updated');
        return finish(req, 'Completed', 'Entry saved.', rec.Id);
      }
      var action = data.Actions.filter(function (a) { return a.Id === Number(payload.actionId); })[0];
      if (!action) return finish(req, 'Rejected', 'That action could not be found.');
      var linkedHere = action.SourceType === 'Register' && Number(action.SourceId) === rec.Id;
      if (req.RequestType === 'LinkActionToEntry') {
        if (action.CompetencyId !== rec.CompetencyId) return finish(req, 'Rejected', 'Choose an action in the same area as this entry.');
        if (!action.IsOpen) return finish(req, 'Rejected', 'Choose an open action.');
        if (action.SourceType === 'Register' && !linkedHere) return finish(req, 'Rejected', 'That action is already linked to another entry.');
        action.SourceType = 'Register'; action.SourceId = rec.Id;
      } else {
        if (!linkedHere) return finish(req, 'Rejected', 'That action is not linked to this entry.');
        action.SourceType = 'None'; action.SourceId = null;
      }
      bump();
      recordEvent(req, key, 'Register Entry', rec.Id, req.RequestType === 'LinkActionToEntry' ? 'Action Linked' : 'Action Unlinked');
      return finish(req, 'Completed', req.RequestType === 'LinkActionToEntry' ? 'Action linked.' : 'Action unlinked.', rec.Id);
    }

    // ---- meetings (5 Meetings): the same checks; the invitation is taken as sent; starting writes the agenda
    var MEETINGS = ['ScheduleMeeting', 'UpdateMeeting', 'CancelMeeting', 'StartMeeting'];
    var A = window.MockRules.agenda;
    function meetings(req, payload, requester, access) {
      var me = requester.SiteUserId;
      var runs = function (key) { return access.isManagement || access.chairs(key); };
      var invites = (data['Competency Hub Settings'].filter(function (r) { return r.Title === 'InvitesEnabled'; })[0] || {}).Value !== 'No';
      function ctx() {
        return { today: today, runsMeetings: runs,
          chairAllowed: function (k, id) { var p = person(id); var m = membership(id, k); return !!p && p.Status === 'Active' && (management(p) || (!!m && !!m.CanManageMeetings)); },
          attendeeAllowed: function (k, id) { var p = person(id); return !!p && p.Status === 'Active' && (management(p) || !!membership(id, k)); } };
      }
      function utc(iso, hhmm) { return new Date(new Date(iso + 'T' + hhmm + ':00Z').getTime() - (D.ukTime(new Date(iso + 'T12:00:00Z')) === '13:00' ? 3600000 : 0)).toISOString(); }
      function mEvent(mt, key, type) {
        data.History.push({ Id: nextId(data.History), RowKind: 'Event', RequestKey: req.RequestKey + '|1', RecordType: 'Meeting', RecordId: mt.Id, MeetingId: mt.Id,
          EventType: type, ActorId: req.AuthorId, EventTime: new Date().toISOString(), CompetencyId: areaId(key), FileDirRef: ROOT + 'History/' + key });
      }
      var err;
      if (req.RequestType === 'ScheduleMeeting') {
        if ((err = Object.keys(R.validateMeeting(payload, ctx())).map(function (k) { return R.validateMeeting(payload, ctx())[k]; })[0])) return finish(req, 'Rejected', err);
        var id = nextId(data.Meetings);
        var mt = { Id: id, Title: payload.areaKey + ' meeting', CompetencyId: areaId(payload.areaKey), MeetingDate: utc(payload.dateIso, payload.start), EndTime: utc(payload.dateIso, payload.end),
          Location: payload.location || '', OnlineLink: payload.onlineLink || '', ChairId: Number(payload.chairId), Attendees: JSON.stringify(payload.attendeeIds), Status: 'Scheduled',
          InviteState: invites ? 'Sent' : 'None', InviteToken: 'ESGM' + req.RequestKey.replace(/-/g, '').slice(0, 10), Revision: 1, LastRequestKey: req.RequestKey,
          CreatedRequestKey: 'F|' + req.RequestKey, FileDirRef: ROOT + 'Meetings/' + payload.areaKey };
        data.Meetings.push(mt);
        mEvent(mt, payload.areaKey, 'Meeting Booked');
        return finish(req, 'Completed', 'Meeting booked for ' + D.weekday(payload.dateIso) + ' ' + D.long(payload.dateIso) + ' at ' + payload.start + '.', id);
      }
      var mt2 = data.Meetings.filter(function (x) { return x.Id === Number(req.TargetId); })[0];
      if (!mt2) return finish(req, 'Rejected', 'That meeting could not be found.');
      var key = areaKeyOf(mt2.CompetencyId);
      if (!runs(key)) return finish(req, 'Rejected', 'Only the people who run meetings in this area, and management, can do this.');
      if (Number(req.ExpectedRevision) > 0 && Number(req.ExpectedRevision) !== Number(mt2.Revision)) return finish(req, 'Rejected', 'This meeting was changed by someone else. Review the latest details and try again.');
      var bump = function () { mt2.Revision = (mt2.Revision || 1) + 1; mt2.LastRequestKey = req.RequestKey; };
      if (req.RequestType === 'UpdateMeeting') {
        if (mt2.Status !== 'Scheduled') return finish(req, 'Rejected', 'Only a meeting that has not started can be changed.');
        var cur = { areaKey: key, dateIso: D.localDate(mt2.MeetingDate), start: D.ukTime(mt2.MeetingDate), end: D.ukTime(mt2.EndTime), location: mt2.Location, onlineLink: mt2.OnlineLink,
          chairId: mt2.ChairId, attendeeIds: JSON.parse(mt2.Attendees || '[]') };
        var v = Object.assign(cur, payload);
        var errs = R.validateMeeting(v, ctx());
        if ((err = errs[Object.keys(errs)[0]])) return finish(req, 'Rejected', err);
        Object.assign(mt2, { MeetingDate: utc(v.dateIso, v.start), EndTime: utc(v.dateIso, v.end), Location: v.location, OnlineLink: v.onlineLink, ChairId: Number(v.chairId),
          Attendees: JSON.stringify(v.attendeeIds), InviteState: invites ? 'Sent' : 'None' });
        bump();
        mEvent(mt2, key, 'Meeting Changed');
        return finish(req, 'Completed', 'Meeting changed to ' + D.weekday(v.dateIso) + ' ' + D.long(v.dateIso) + ' at ' + v.start + '.', mt2.Id);
      }
      if (req.RequestType === 'CancelMeeting') {
        if (['Scheduled', 'In Progress'].indexOf(mt2.Status) < 0) return finish(req, 'Rejected', 'This meeting is already finished or cancelled.');
        var ce = R.validateCancelMeeting(payload);
        if (ce.reason) return finish(req, 'Rejected', ce.reason);
        Object.assign(mt2, { Status: 'Cancelled', CancellationReason: payload.reason, InviteState: mt2.InviteState === 'None' ? 'None' : 'Cancelled' });
        bump();
        mEvent(mt2, key, 'Meeting Cancelled');
        return finish(req, 'Completed', 'Meeting cancelled.', mt2.Id);
      }
      if (mt2.Status !== 'Scheduled') return finish(req, 'Rejected', 'This meeting has already started, or is finished or cancelled.');
      var prev = data.Meetings.filter(function (x) { return x.CompetencyId === mt2.CompetencyId && x.Status === 'Finalised'; })
        .sort(function (a, b) { return String(b.MeetingDate).localeCompare(String(a.MeetingDate)); })[0];
      var comp = data.Competencies.filter(function (c) { return c.Id === mt2.CompetencyId; })[0];
      Object.assign(mt2, { Status: 'In Progress', CutoffTime: new Date().toISOString(), CutoffUpdatesId: data.Updates.reduce(function (m, u) { return Math.max(m, u.Id); }, 0),
        IntervalStart: prev ? prev.CutoffTime : (comp.TrackingStart || '2000-01-01T00:00:00Z'), PreviousMeetingId: prev ? prev.Id : null, StartedById: me });
      bump();
      var ids = function (rows) { return rows.map(function (x) { return String(x); }); };
      var members = data['Competency Members'].filter(function (x) { return x.CompetencyId === mt2.CompetencyId && x.Status === 'Active'; });
      var list = A.build({ areaId: mt2.CompetencyId, areaKey: key, sinceIso: mt2.IntervalStart, cutIso: mt2.CutoffTime, cutUpdatesId: mt2.CutoffUpdatesId,
        actionsOpen: data.Actions.filter(function (a) { return a.IsOpen; }), actionsClosed: data.Actions.filter(function (a) { return !a.IsOpen; }),
        notices: data.Noticeboard.filter(function (n) { return n.Status === 'Active'; }), entries: data['Improvements and Degradations'].filter(function (e) { return e.CompetencyId === mt2.CompetencyId; }),
        flags: data.Updates.filter(function (u) { return u.IsFlagEvent; }), dates: data['Calendar Events'].filter(function (c) { return c.IsImportant && c.Status === 'Scheduled'; }),
        carried: data['Meeting Items'].filter(function (x) { return x.MeetingId === (prev && prev.Id) && x.RowType === 'Outcome'; }),
        memberIds: ids(members.map(function (x) { return x.PersonId; })), chairIds: ids(members.filter(function (x) { return x.CanManageMeetings; }).map(function (x) { return x.PersonId; })),
        mgmtIds: ids(data.People.filter(management).map(function (p) { return p.SiteUserId; })), lookaheadDays: 60 });
      list.forEach(function (x) {
        var r = x.row;
        data['Meeting Items'].push({ Id: nextId(data['Meeting Items']), Title: r.Title, RowKey: 'F|' + mt2.Id + '|A|' + x.sourceType + '|' + x.sourceId, MeetingId: mt2.Id,
          RowType: 'Agenda Item', Section: x.section, SourceType: x.sourceType === 'Date' ? '' : x.sourceType, SourceId: Number(x.sourceId), SortOrder: x.order,
          AgendaMarker: x.marker, SnapshotOwner: r.AssignedToId ? String(r.AssignedToId) : '', SnapshotStatus: r.Status || '', SnapshotDueDate: r.DueDay ? D.fromDueDay(r.DueDay) + 'T00:00:00Z' : '',
          SnapshotDetails: r.EntryType ? r.EntryType + ' · ' + r.Impact + ' impact' : r.StartTime ? D.long(D.localDate(r.StartTime)) : '',
          FileDirRef: ROOT + 'MeetingItems/' + key + '/MTG-' + mt2.Id });
      });
      mEvent(mt2, key, 'Meeting Started');
      return finish(req, 'Completed', 'Meeting started. The agenda is fixed with ' + list.length + ' items.', mt2.Id);
    }

    function process(req) {
      // The requester is whoever owns the folder the request sits in, never a typed value.
      var m = /\/Lists\/Requests\/u(\d+)$/.exec(req.FileDirRef);
      var requester = m && person(Number(m[1]));
      if (!m || !requester || requester.Status !== 'Active' || Number(m[1]) !== req.AuthorId) {
        return finish(req, 'Rejected', 'This request was not sent from your own request folder.');
      }
      var payload;
      try { payload = JSON.parse(req.Payload); } catch (_) { return finish(req, 'Rejected', 'The request could not be read.'); }
      var access = accessFor(requester);

      if (req.RequestType === 'RaiseAction') {
        var errors = R.validateRaise(payload, { today: today, maxYears: C.maxDeadlineYears, canWrite: access.canWrite, canRaiseFor: access.canRaiseFor,
          ownerAllowed: function (key, id) { var o = person(id); return !!o && o.Status === 'Active' && (management(o) || !!membership(id, key)); } });
        var keys = Object.keys(errors);
        if (keys.length) return finish(req, 'Rejected', errors[keys[0]]);
        var source = null;
        if (payload.sourceEntryId) {
          source = data['Improvements and Degradations'].filter(function (x) { return x.Id === Number(payload.sourceEntryId); })[0];
          if (!source || source.FileDirRef.split('/').pop() !== payload.areaKey || ['Open', 'Under Review'].indexOf(source.Status) < 0) {
            return finish(req, 'Rejected', 'That improvement or degradation could not be found in this area, or it is closed.');
          }
        }
        var id = nextId(data.Actions);
        var action = { Id: id, Title: payload.title, Description: payload.description, CompetencyId: areaId(payload.areaKey), LinkedCompetenciesId: [],
          AssignedToId: payload.ownerId, RaisedById: requester.SiteUserId, DateRaised: new Date().toISOString(),
          DueDay: D.toDueDay(payload.dueIso), OriginalDueDate: ukMidnight(payload.dueIso), Status: 'Open', IsOpen: true,
          Priority: payload.priority || 'Normal', RequiresCloseOut: !!payload.requiresCloseOut, ExtensionCount: 0, Revision: 1,
          PendingRequestKey: '', LastRequestKey: req.RequestKey, CreatedRequestKey: 'F|' + req.RequestKey,
          FileDirRef: ROOT + 'Actions/' + payload.areaKey, SourceType: source ? 'Register' : 'None', SourceId: source ? source.Id : null };
        data.Actions.push(action);
        event(req, action, { EventType: 'Action Raised', NewDueDate: ukMidnight(payload.dueIso) });
        return finish(req, 'Completed', 'ACT-' + ('0000' + id).slice(-5) + ' raised.', id);
      }

      // People administration (spec §3.2), much simplified: the same refusals, and the records as the flow leaves them.
      if (['AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson'].indexOf(req.RequestType) >= 0) {
        if (!requester.IsAdministrator) return finish(req, 'Rejected', 'Only a Competency Hub administrator can do this.');
        var target = req.RequestType === 'AddPerson' ? null : person(Number(payload.personId));
        if (target && target.SiteUserId === requester.SiteUserId) return finish(req, 'Rejected', "You can't change your own access. Ask another administrator.");
        if (req.RequestType === 'AddPerson') {
          if (data.People.some(function (x) { return String(x.Email).toLowerCase() === String(payload.email).toLowerCase(); })) return finish(req, 'Rejected', 'That person is already in the Hub.');
          var newId = data.People.reduce(function (m, x) { return Math.max(m, x.SiteUserId); }, 0) + 1;
          var name = payload.email.split('@')[0].split('.').map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }).join(' ');
          target = { Id: nextId(data.People), Title: name, SiteUserId: newId, Role: payload.role, Status: 'Active', IsAdministrator: false, Email: payload.email,
            CanPostNotices: payload.canPostNotices !== false };
          data.People.push(target);
        }
        var uid = target.SiteUserId;
        var mine = data['Competency Members'].filter(function (m) { return m.PersonId === uid; });
        var openOwned = data.Actions.filter(function (x) { return x.AssignedToId === uid && x.IsOpen; });
        if (req.RequestType === 'PersonLeft') {
          if (openOwned.length) return finish(req, 'Rejected', target.Title + ' still has ' + openOwned.length + ' open action' + (openOwned.length === 1 ? '' : 's') + '. Reassign them first.');
          mine.forEach(function (m) { m.Status = 'Removed'; });
          Object.assign(target, { Status: 'Left', IsAdministrator: false });
          return finish(req, 'Completed', 'Marked as left: ' + target.Title + '.', uid);
        }
        if (req.RequestType === 'ReactivatePerson') { target.Status = 'Active'; return finish(req, 'Completed', 'Reactivated ' + target.Title + '.', uid); }
        var wanted = (payload.areas || []).map(function (w) { return w.key; });
        var management2 = C.managementRoles.indexOf(payload.role || target.Role) >= 0;
        var blocked = mine.filter(function (m) { return m.Status === 'Active' && wanted.indexOf(areaKeyOf(m.CompetencyId)) < 0 && !management2 &&
          openOwned.some(function (x) { return x.CompetencyId === m.CompetencyId; }); });
        if (blocked.length) return finish(req, 'Rejected', 'Not removed from ' + blocked.map(function (m) { return areaKeyOf(m.CompetencyId); }).join(', ') + ': open actions there are still theirs. Reassign them first.');
        mine.forEach(function (m) { if (wanted.indexOf(areaKeyOf(m.CompetencyId)) < 0) m.Status = 'Removed'; });
        (payload.areas || []).forEach(function (w) {
          var row = mine.filter(function (m) { return m.CompetencyId === areaId(w.key); })[0];
          if (!row) { row = { Id: nextId(data['Competency Members']), CompetencyId: areaId(w.key), PersonId: uid }; data['Competency Members'].push(row); }
          Object.assign(row, { Status: 'Active', CanManageMeetings: !!w.chair, AccessExpires: w.expires ? w.expires + 'T00:00:00Z' : null });
        });
        if (payload.role) target.Role = payload.role;
        if ('canPostNotices' in payload) target.CanPostNotices = !!payload.canPostNotices;
        if ('administrator' in payload) target.IsAdministrator = !!payload.administrator;
        return finish(req, 'Completed', (req.RequestType === 'AddPerson' ? 'Added ' : 'Saved the changes for ') + target.Title + '.', uid);
      }
      // An administrator's decision about a change needing attention (spec REL-3), much simplified.
      if (['RetryTransaction', 'CancelTransaction', 'RevertTransaction'].indexOf(req.RequestType) >= 0) {
        if (!requester.IsAdministrator) return finish(req, 'Rejected', 'Only a Competency Hub administrator can do this.');
        var tx = data.History.filter(function (h) { return h.Id === Number(payload.txId) && h.RowKind === 'Transaction'; })[0];
        if (!tx || ['Applied', 'Void', 'Cancelled', 'Reverted'].indexOf(tx.State) >= 0) return finish(req, 'Rejected', 'This change is already finished.');
        var locked = data.Actions.filter(function (a) { return a.PendingRequestKey === tx.RequestKey; })[0];
        if (req.RequestType === 'CancelTransaction') {
          if (locked) return finish(req, 'Rejected', 'Part of this change has already been made, so it cannot be cancelled. Use Finish or Revert.');
          tx.State = 'Cancelled';
          return finish(req, 'Completed', 'Cancelled. Nothing was changed.', tx.Id);
        }
        if (req.RequestType === 'RevertTransaction') {
          if (!locked) return finish(req, 'Rejected', 'Nothing of this change is waiting to be resolved, so there is nothing to revert. Use Retry.');
          locked.PendingRequestKey = '';
          locked.LastRequestKey = req.RequestKey;
          tx.State = 'Reverted';
          return finish(req, 'Completed', 'Reverted.', tx.Id);
        }
        if (locked) { locked.PendingRequestKey = ''; locked.LastRequestKey = tx.RequestKey; }
        tx.State = 'Applied';   // the retried change goes through at once in the simulation
        return finish(req, 'Completed', 'Being tried again.', tx.Id);
      }

      if (req.RequestType === 'UpdateSetting') {
        if (!requester.IsAdministrator) return finish(req, 'Rejected', 'Only a Competency Hub administrator can do this.');
        var row = data['Competency Hub Settings'].filter(function (x) { return x.Title === payload.name; })[0];
        if (!row) return finish(req, 'Rejected', 'Choose a setting.');
        row.Value = String(payload.value);
        data.History.push({ Id: nextId(data.History), RowKind: 'Event', RequestKey: req.RequestKey + '|1', RecordType: 'Setting', EventType: 'Setting Changed',
          ActorId: req.AuthorId, EventTime: new Date().toISOString(), FileDirRef: ROOT + 'History/Administration' });
        return finish(req, 'Completed', 'Setting saved.');
      }
      if (RECORDS.indexOf(req.RequestType) >= 0) return records(req, payload, requester, access);
      if (MEETINGS.indexOf(req.RequestType) >= 0) return meetings(req, payload, requester, access);

      var target = data.Actions.filter(function (a) { return a.Id === Number(req.TargetId); })[0];
      if (!target) return finish(req, 'Rejected', 'That action could not be found.');
      if (target.PendingRequestKey) return finish(req, 'Rejected', 'This action is being updated. Try again in a minute.');
      if (Number(req.ExpectedRevision) !== Number(target.Revision)) return finish(req, 'Rejected', STALE);
      var shape = { ownerId: target.AssignedToId, raisedById: target.RaisedById, areaKey: areaKeyOf(target.CompetencyId), status: target.Status,
        dueIso: D.fromDueDay(target.DueDay) };
      var roles = R.roles(shape, requester.SiteUserId, access);

      if (req.RequestType === 'ExtendDeadline') {
        if (!roles.canExtend) return finish(req, 'Rejected', 'Only the owner or the people who manage this action can move its deadline.');
        if (Number(payload.expectedDueDay) !== Number(target.DueDay)) return finish(req, 'Rejected', STALE);
        var e = R.validateExtend(shape, payload, { today: today });
        var ek = Object.keys(e);
        if (ek.length) return finish(req, 'Rejected', e[ek[0]]);
        var n = (target.ExtensionCount || 0) + 1;
        var daysLate = D.daysBetween(shape.dueIso, today);
        event(req, target, { EventType: 'Deadline Extended', ExtensionNumber: n, OriginalDueDate: target.OriginalDueDate,
          PreviousDueDate: ukMidnight(shape.dueIso), NewDueDate: ukMidnight(payload.newDueIso), Note: payload.reason,
          WasOverdue: daysLate > 0, DaysOverdue: Math.max(daysLate, 0), IsOnBehalf: !roles.owner });
        Object.assign(target, { DueDay: D.toDueDay(payload.newDueIso), ExtensionCount: n, Revision: target.Revision + 1,
          LastExtendedOn: new Date().toISOString(), LastRequestKey: req.RequestKey });
        return finish(req, 'Completed', 'Deadline moved to ' + D.long(payload.newDueIso) + '.', target.Id);
      }

      if (req.RequestType === 'MarkComplete') {
        if (!roles.canComplete) return finish(req, 'Rejected', 'Only the owner or the people who manage this action can mark it as done.');
        var status = R.completionStatus(!!target.RequiresCloseOut);
        event(req, target, { EventType: status === 'Closed' ? 'Closed' : 'Completed', Note: payload.note || '' });
        Object.assign(target, { Status: status, IsOpen: status !== 'Closed', DateCompleted: new Date().toISOString(),
          DateClosed: status === 'Closed' ? new Date().toISOString() : null, Revision: target.Revision + 1, LastRequestKey: req.RequestKey });
        return finish(req, 'Completed', status === 'Closed' ? 'Action closed.' : 'Marked as done; waiting for a close-out check.', target.Id);
      }
      function first(errors) { var k = Object.keys(errors); return k.length ? errors[k[0]] : ''; }
      function change(fields, ev, message) {
        event(req, target, ev);
        Object.assign(target, fields, { Revision: target.Revision + 1, LastRequestKey: req.RequestKey });
        return finish(req, 'Completed', message, target.Id);
      }
      var LABEL = { 'Open': 'open', 'In Progress': 'in progress', 'Awaiting Input': 'waiting on something' };
      var err;

      if (req.RequestType === 'ChangeStatus') {
        if (!roles.canStatus && R.isOpen(shape.status)) return finish(req, 'Rejected', 'Only the owner or the people who manage this action can change its status.');
        if ((err = first(R.validateStatus(shape, payload)))) return finish(req, 'Rejected', err);
        var waiting = payload.status === 'Awaiting Input';
        return change({ Status: payload.status, Blocker: waiting ? payload.blocker.trim() : '' },
          { EventType: 'Status Changed', Note: waiting ? payload.blocker.trim() : '' }, 'Status changed to ' + LABEL[payload.status] + '.');
      }
      if (req.RequestType === 'ReassignAction') {
        if (R.isOpen(shape.status) && !roles.canReassign) return finish(req, 'Rejected', 'Only the people who manage this action can reassign it.');
        var allowed = { ownerAllowed: function (key, id) { var o = person(id); return !!o && o.Status === 'Active' && (management(o) || !!membership(id, key)); } };
        if ((err = first(R.validateReassign(shape, payload, allowed)))) return finish(req, 'Rejected', err);
        var newOwner = person(Number(payload.ownerId));
        return change({ AssignedToId: newOwner.SiteUserId }, { EventType: 'Reassigned', Note: payload.reason },
          'Reassigned to ' + newOwner.Title + '.');
      }
      if (req.RequestType === 'CloseAction') {
        if (!roles.canClose && (R.isOpen(shape.status) || shape.status === 'Completed')) return finish(req, 'Rejected', 'Only the people who manage this action can close it.');
        if ((err = first(R.validateClose(shape, payload)))) return finish(req, 'Rejected', err);
        return change({ Status: 'Closed', IsOpen: false, DateClosed: new Date().toISOString(), ClosedById: requester.SiteUserId,
          CloseOutcome: payload.outcome, ClosureNote: (payload.note || '').trim() }, { EventType: 'Closed', Note: payload.note || '' }, 'Action closed.');
      }
      if (req.RequestType === 'ReopenAction') {
        if (!roles.canReopen && !R.isOpen(shape.status)) return finish(req, 'Rejected', 'Only the people who manage this action can reopen it.');
        if ((err = first(R.validateReopen(shape, payload)))) return finish(req, 'Rejected', err);
        return change({ Status: 'In Progress', IsOpen: true, DateClosed: null, ClosedById: null, CloseOutcome: null, ClosureNote: '' },
          { EventType: 'Reopened', Note: payload.reason }, 'Action reopened.');
      }
      if (req.RequestType === 'EditActionDetails') {
        if (R.isOpen(shape.status) && !roles.canEdit) return finish(req, 'Rejected', 'Only the people who manage this action can change its details.');
        if ((err = first(R.validateEdit(shape, payload)))) return finish(req, 'Rejected', err);
        var f = {};
        if ('title' in payload) f.Title = payload.title.trim();
        if ('description' in payload) f.Description = payload.description.trim();
        if ('priority' in payload) f.Priority = payload.priority;
        if ('requiresCloseOut' in payload) f.RequiresCloseOut = !!payload.requiresCloseOut;
        return change(f, { EventType: 'Details Edited' }, 'Details saved.');
      }
      return finish(req, 'Rejected', 'This kind of request is not handled yet.');
    }

    return {
      // mode: '' (about 3 seconds), 'flowSlow' (20 minutes) or 'flowFail'.
      schedule: function (req, mode) {
        setTimeout(function () {
          if (mode === 'flowFail') return finish(req, 'Failed', 'Simulated failure.');
          req.Status = 'Processing';
          process(req);
        }, mode === 'flowSlow' ? 20 * 60 * 1000 : 3000);
      },
      process: process
    };
  }

  return { create: create };
})();
