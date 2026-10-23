// Business rules for actions (plan B.3, B.4, E.3, F.2, F.3), shared by the forms and by the simulated
// request flow in the mock, so the screen and the server apply the same checks. The flow in Power Automate
// follows these rule by rule; the server stays the real boundary.
CH.rules = (function () {
  var D = CH.dates;
  var OPEN_STATUSES = ['Open', 'In Progress', 'Awaiting Input'];
  var PRIORITIES = ['Low', 'Normal', 'High'];
  var OUTCOMES = ['Completed', 'No longer required', 'Superseded', 'Other'];

  // The same calendar date N years on; 29 February becomes 28 February in a non-leap year.
  function addYears(iso, years) {
    var y = +iso.slice(0, 4) + years;
    var m = +iso.slice(5, 7);
    var d = +iso.slice(8, 10);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + '-' + iso.slice(5, 7) + '-' + (Math.min(d, last) < 10 ? '0' : '') + Math.min(d, last);
  }

  function isOpen(status) { return OPEN_STATUSES.indexOf(status) >= 0; }

  var SELF_ONLY = 'As a technician you can raise actions for yourself in this area. Ask an engineer, or someone who runs meetings in this area, to raise it for someone else.';

  // ctx: { today, maxYears, canWrite(areaKey), ownerAllowed(areaKey, ownerId), canRaiseFor(areaKey, ownerId) }
  function validateRaise(v, ctx) {
    var e = {};
    var title = String(v.title || '').trim();
    var description = String(v.description || '').trim();
    if (!title) e.title = 'Enter what needs doing.';
    else if (title.length > 255) e.title = 'Keep the title to 255 characters or fewer.';
    if (!description) e.description = 'Add a short description.';
    else if (description.length > 5000) e.description = 'Keep the description to 5,000 characters or fewer.';
    if (!v.areaKey || !ctx.canWrite(v.areaKey)) e.areaKey = 'Choose one of your areas.';
    if (!v.ownerId) e.ownerId = 'Choose who will do it.';
    else if (!e.areaKey && !ctx.ownerAllowed(v.areaKey, Number(v.ownerId))) e.ownerId = 'Choose a member of this area or a Team Leader.';
    else if (!e.areaKey && ctx.canRaiseFor && !ctx.canRaiseFor(v.areaKey, Number(v.ownerId))) e.ownerId = SELF_ONLY;
    if (!D.isIso(v.dueIso || '')) e.dueIso = 'Choose a target date.';
    else if (v.dueIso < ctx.today) e.dueIso = 'The target date cannot be in the past.';
    else if (v.dueIso > addYears(ctx.today, ctx.maxYears)) e.dueIso = 'Choose a date within ' + ctx.maxYears + (ctx.maxYears === 1 ? ' year.' : ' years.');
    if (v.priority && PRIORITIES.indexOf(v.priority) < 0) e.priority = 'Choose a priority.';
    return e;
  }

  // action: { status, dueIso }. v: { newDueIso, reason }. ctx: { today }
  function validateExtend(action, v, ctx) {
    var e = {};
    if (!isOpen(action.status)) e.action = 'This action is no longer open, so its deadline cannot be moved.';
    if (!D.isIso(v.newDueIso || '')) e.newDueIso = 'Choose the new deadline.';
    else if (v.newDueIso <= action.dueIso) e.newDueIso = 'The new deadline must be after ' + D.long(action.dueIso) + '.';
    else if (v.newDueIso < ctx.today) e.newDueIso = 'The new deadline cannot be in the past.';
    var reason = String(v.reason || '').trim();
    if (reason.length < 10) e.reason = 'Give a reason of at least 10 characters.';
    else if (reason.length > 1000) e.reason = 'Keep the reason to 1,000 characters or fewer.';
    return e;
  }

  function validateComplete(action, v) {
    var e = {};
    if (!isOpen(action.status)) e.action = 'This action is already done.';
    if (String(v.note || '').length > 1000) e.note = 'Keep the note to 1,000 characters or fewer.';
    return e;
  }

  function text(v, field, min, max, missing, short, long) {
    var t = String(v[field] || '').trim();
    if (!t) return missing;
    if (t.length < min) return short;
    if (t.length > max) return long;
    return '';
  }
  function reasonError(v, field) {
    return text(v, field || 'reason', 10, 1000, 'Give a reason of at least 10 characters.', 'Give a reason of at least 10 characters.',
      'Keep the reason to 1,000 characters or fewer.');
  }

  // v: { status, blocker }. "Awaiting Input" is shown as "Waiting on something" and needs the blocker.
  function validateStatus(action, v) {
    var e = {};
    if (!isOpen(action.status)) e.action = 'This action is no longer open.';
    if (OPEN_STATUSES.indexOf(v.status) < 0) e.status = 'Choose a status.';
    else if (v.status === action.status) e.status = 'Choose a different status.';
    if (v.status === 'Awaiting Input') {
      var b = text(v, 'blocker', 10, 1000, 'Say what it is waiting on (at least 10 characters).', 'Say what it is waiting on (at least 10 characters).',
        'Keep it to 1,000 characters or fewer.');
      if (b) e.blocker = b;
    }
    return e;
  }

  // ctx: { ownerAllowed(areaKey, ownerId) }
  function validateReassign(action, v, ctx) {
    var e = {};
    if (!isOpen(action.status)) e.action = 'This action is no longer open, so it cannot be reassigned.';
    if (!v.ownerId) e.ownerId = 'Choose who will do it.';
    else if (Number(v.ownerId) === Number(action.ownerId)) e.ownerId = 'Choose someone other than the current owner.';
    else if (!ctx.ownerAllowed(action.areaKey, Number(v.ownerId))) e.ownerId = 'Choose a member of this area or a Team Leader.';
    var r = reasonError(v);
    if (r) e.reason = r;
    return e;
  }

  // v: { outcome, note }. A Completed action waiting for its close-out check can be closed too.
  function validateClose(action, v) {
    var e = {};
    if (!isOpen(action.status) && action.status !== 'Completed') e.action = 'This action is already closed.';
    if (OUTCOMES.indexOf(v.outcome) < 0) e.outcome = 'Choose an outcome.';
    var note = String(v.note || '').trim();
    if (v.outcome && v.outcome !== 'Completed' && note.length < 10) e.note = 'Explain the outcome in at least 10 characters.';
    else if (note.length > 1000) e.note = 'Keep the note to 1,000 characters or fewer.';
    return e;
  }

  function validateReopen(action, v) {
    var e = {};
    if (action.status !== 'Closed' && action.status !== 'Completed') e.action = 'This action is already open.';
    var r = reasonError(v);
    if (r) e.reason = r;
    return e;
  }

  // v: the fields being changed (title, description, priority, requiresCloseOut); anything not given stays.
  function validateEdit(action, v) {
    var e = {};
    if (!isOpen(action.status)) e.action = 'This action is no longer open.';
    if ('title' in v) {
      var t = String(v.title || '').trim();
      if (!t) e.title = 'Enter what needs doing.';
      else if (t.length > 255) e.title = 'Keep the title to 255 characters or fewer.';
    }
    if ('description' in v) {
      var d = String(v.description || '').trim();
      if (!d) e.description = 'Add a short description.';
      else if (d.length > 5000) e.description = 'Keep the description to 5,000 characters or fewer.';
    }
    if ('priority' in v && PRIORITIES.indexOf(v.priority) < 0) e.priority = 'Choose a priority.';
    if (!['title', 'description', 'priority', 'requiresCloseOut'].some(function (k) { return k in v; })) e.action = 'Nothing has changed.';
    return e;
  }

  function validateUpdate(v) {
    var body = String(v.body || '').trim();
    if (!body) return { body: 'Write your update.' };
    if (body.length > 2000) return { body: 'Keep the update to 2,000 characters or fewer.' };
    return {};
  }

  // Who may do what with an action (spec §4.2), judged against its primary area. Each operation has its own
  // rule; the request flow applies the same ones. personId: SiteUserId. access: CH.access result.
  //   management, or an engineer of the area:       edit, reassign, close, reopen
  //   "Can run meetings" in the area:                 edit, reassign, close – never reopen
  //   the raiser:                                     edit, close, reopen; reassign unless a technician without meeting rights
  //   the owner:                                      status, extend, mark as done
  function roles(action, personId, access) {
    var k = action.areaKey;
    var owner = Number(action.ownerId) === Number(personId);
    var raiser = Number(action.raisedById) === Number(personId);
    var lead = access.isManagement ? access.canWrite(k) : access.isEngineerIn(k);
    var chair = access.chairs(k);
    var open = isOpen(action.status);
    var finished = action.status === 'Closed' || action.status === 'Completed';
    var edits = lead || chair || raiser;
    return {
      owner: owner,
      manager: edits,
      canUpdate: access.canWrite(k) || owner,
      canExtend: open && (owner || edits),
      canComplete: open && (owner || edits),
      canStatus: open && (owner || edits),
      canReassign: open && (lead || chair || (raiser && !(access.isTechnician && !chair))),
      canClose: (open || action.status === 'Completed') && edits,
      canReopen: finished && (lead || raiser),
      canEdit: open && edits
    };
  }

  // ---- notices, comments and the improvements and degradations register (spec NB-1 to NB-5, REG-1 to REG-5)
  var ENTRY_TYPES = ['Improvement', 'Degradation', 'Concern', 'Opportunity', 'Positive Observation'];
  var IMPACTS = ['Low', 'Medium', 'High'];
  var ENTRY_STATUSES = ['Open', 'Under Review', 'Resolved', 'Closed'];
  var NOTICE_CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

  // ctx: { canWrite(areaKey), ownerAllowed(areaKey, personId) }
  function validateEntry(v, ctx) {
    var e = {};
    if (!v.areaKey || !ctx.canWrite(v.areaKey)) e.areaKey = 'Choose one of your areas.';
    if (ENTRY_TYPES.indexOf(v.entryType) < 0) e.entryType = 'Choose the type of entry.';
    if (IMPACTS.indexOf(v.impact) < 0) e.impact = 'Choose the impact.';
    var t = String(v.title || '').trim();
    if (!t) e.title = 'Give the entry a title.';
    else if (t.length > 255) e.title = 'Keep the title to 255 characters or fewer.';
    var d = String(v.description || '').trim();
    if (!d) e.description = 'Describe it.';
    else if (d.length > 5000) e.description = 'Keep the description to 5,000 characters or fewer.';
    if (!v.responsibleId) e.responsibleId = 'Choose who is responsible.';
    else if (!e.areaKey && !ctx.ownerAllowed(v.areaKey, Number(v.responsibleId))) e.responsibleId = 'Choose a member of this area or a Team Leader.';
    return e;
  }

  // v: the fields being changed (title, description, impact, status, outcome, responsibleId). An outcome is needed to
  // resolve or close an entry. ctx: { ownerAllowed(areaKey, personId) }
  function validateEntryUpdate(entry, v, ctx) {
    var e = {};
    if ('title' in v) {
      var t = String(v.title || '').trim();
      if (!t) e.title = 'Give the entry a title.';
      else if (t.length > 255) e.title = 'Keep the title to 255 characters or fewer.';
    }
    if ('description' in v && String(v.description || '').trim().length > 5000) e.description = 'Keep the description to 5,000 characters or fewer.';
    if ('impact' in v && IMPACTS.indexOf(v.impact) < 0) e.impact = 'Choose the impact.';
    if ('status' in v && ENTRY_STATUSES.indexOf(v.status) < 0) e.status = 'Choose a status.';
    var outcome = String(v.outcome || '').trim();
    if ('status' in v && (v.status === 'Resolved' || v.status === 'Closed') && outcome.length < 10) e.outcome = 'Record the outcome (at least 10 characters).';
    else if (outcome.length > 2000) e.outcome = 'Keep the outcome to 2,000 characters or fewer.';
    if ('responsibleId' in v && !ctx.ownerAllowed(entry.areaKey, Number(v.responsibleId))) e.responsibleId = 'Choose a member of this area or a Team Leader.';
    if (!['title', 'description', 'impact', 'status', 'outcome', 'responsibleId'].some(function (k) { return k in v; })) e.entry = 'Nothing has changed.';
    return e;
  }

  // REG-2: the raiser, the person responsible, the area's engineers and meeting runners, and management.
  function managesEntry(entry, personId, access) {
    var k = entry.areaKey;
    return access.canModerate(k) || access.chairs(k) || Number(entry.raisedById) === Number(personId) || Number(entry.responsibleId) === Number(personId);
  }

  // Edit a notice: its author or a moderator (spec §4.2 canModerate). Pin: moderators only.
  function noticeRoles(notice, personId, access) {
    var author = Number(notice.authorId) === Number(personId);
    var mod = access.canModerate(notice.areaKey);
    return { author: author, moderator: mod, canEdit: author || mod, canArchive: author || mod, canPin: mod, canMarkImportant: author || mod };
  }

  function validateNoticeEdit(v) {
    var e = {};
    if ('title' in v) {
      var t = String(v.title || '').trim();
      if (!t) e.title = 'Give the notice a title.';
      else if (t.length > 255) e.title = 'Keep the title to 255 characters or fewer.';
    }
    if ('body' in v) {
      var b = String(v.body || '').trim();
      if (!b) e.body = 'Write the notice.';
      else if (b.length > 5000) e.body = 'Keep the notice to 5,000 characters or fewer.';
    }
    if ('category' in v && NOTICE_CATEGORIES.indexOf(v.category) < 0) e.category = 'Choose a category.';
    if (!['title', 'body', 'category', 'important'].some(function (k) { return k in v; })) e.notice = 'Nothing has changed.';
    return e;
  }

  function validateComment(v) {
    var body = String(v.body || '').trim();
    if (!body) return { body: 'Write your comment.' };
    if (body.length > 2000) return { body: 'Keep the comment to 2,000 characters or fewer.' };
    return {};
  }

  // Mark complete closes the action unless a close-out check is required (D-07).
  function completionStatus(requiresCloseOut) { return requiresCloseOut ? 'Completed' : 'Closed'; }

  return {
    addYears: addYears, isOpen: isOpen, validateRaise: validateRaise, validateExtend: validateExtend,
    validateComplete: validateComplete, validateUpdate: validateUpdate, validateStatus: validateStatus,
    validateReassign: validateReassign, validateClose: validateClose, validateReopen: validateReopen, validateEdit: validateEdit,
    roles: roles, completionStatus: completionStatus,
    validateEntry: validateEntry, validateEntryUpdate: validateEntryUpdate, managesEntry: managesEntry, noticeRoles: noticeRoles,
    validateNoticeEdit: validateNoticeEdit, validateComment: validateComment, ENTRY_TYPES: ENTRY_TYPES, IMPACTS: IMPACTS, ENTRY_STATUSES: ENTRY_STATUSES,
    NOTICE_CATEGORIES: NOTICE_CATEGORIES, SELF_ONLY: SELF_ONLY, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES, OUTCOMES: OUTCOMES
  };
})();
