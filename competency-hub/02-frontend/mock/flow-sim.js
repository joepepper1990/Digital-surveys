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
        canWrite: function (key) { return areaKeys.indexOf(key) >= 0 && (management(p) || !!membership(p.SiteUserId, key)); },
        canManage: function (key) {
          var m = membership(p.SiteUserId, key);
          return management(p) || (!!m && (p.Role === 'Engineer' || !!m.CanManageMeetings));
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
        var errors = R.validateRaise(payload, { today: today, maxYears: C.maxDeadlineYears, canWrite: access.canWrite,
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
