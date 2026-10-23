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
        var id = nextId(data.Actions);
        var action = { Id: id, Title: payload.title, Description: payload.description, CompetencyId: areaId(payload.areaKey), LinkedCompetenciesId: [],
          AssignedToId: payload.ownerId, RaisedById: requester.SiteUserId, DateRaised: new Date().toISOString(),
          DueDay: D.toDueDay(payload.dueIso), OriginalDueDate: ukMidnight(payload.dueIso), Status: 'Open', IsOpen: true,
          Priority: payload.priority || 'Normal', RequiresCloseOut: !!payload.requiresCloseOut, ExtensionCount: 0, Revision: 1,
          PendingRequestKey: '', LastRequestKey: req.RequestKey, CreatedRequestKey: 'F|' + req.RequestKey,
          FileDirRef: ROOT + 'Actions/' + payload.areaKey };
        data.Actions.push(action);
        event(req, action, { EventType: 'Action Raised', NewDueDate: ukMidnight(payload.dueIso) });
        return finish(req, 'Completed', 'ACT-' + ('0000' + id).slice(-5) + ' raised.', id);
      }

      // People administration (plan REV5 §3.2), much simplified: the same refusals, and the records as the flow leaves them.
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
      // An administrator's decision about a change needing attention (plan REV5 REL-3), much simplified.
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
