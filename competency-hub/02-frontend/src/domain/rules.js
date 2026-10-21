// Business rules for actions (plan B.3, B.4, E.3, F.2, F.3), shared by the forms and by the simulated
// request flow in the mock, so the screen and the server apply the same checks. The flow in Power Automate
// follows these rule by rule; the server stays the real boundary.
CH.rules = (function () {
  var D = CH.dates;
  var OPEN_STATUSES = ['Open', 'In Progress', 'Awaiting Input'];
  var PRIORITIES = ['Low', 'Normal', 'High'];

  // The same calendar date N years on; 29 February becomes 28 February in a non-leap year.
  function addYears(iso, years) {
    var y = +iso.slice(0, 4) + years;
    var m = +iso.slice(5, 7);
    var d = +iso.slice(8, 10);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + '-' + iso.slice(5, 7) + '-' + (Math.min(d, last) < 10 ? '0' : '') + Math.min(d, last);
  }

  function isOpen(status) { return OPEN_STATUSES.indexOf(status) >= 0; }

  // ctx: { today, maxYears, canWrite(areaKey), ownerAllowed(areaKey, ownerId) }
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
    if (!D.isIso(v.dueIso || '')) e.dueIso = 'Choose a target date.';
    else if (v.dueIso < ctx.today) e.dueIso = 'The target date cannot be in the past.';
    else if (v.dueIso > addYears(ctx.today, ctx.maxYears)) e.dueIso = 'Choose a date within ' + ctx.maxYears + ' years.';
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

  function validateUpdate(v) {
    var body = String(v.body || '').trim();
    if (!body) return { body: 'Write your update.' };
    if (body.length > 2000) return { body: 'Keep the update to 2,000 characters or fewer.' };
    return {};
  }

  // Who may do what with an action (E.3). personId: SiteUserId. access: CH.access result.
  function roles(action, personId, access) {
    var owner = Number(action.ownerId) === Number(personId);
    var manager = Number(action.raisedById) === Number(personId) || access.canManage(action.areaKey);
    var open = isOpen(action.status);
    return {
      owner: owner,
      manager: manager,
      canUpdate: access.canWrite(action.areaKey) || owner,
      canExtend: open && (owner || manager),
      canComplete: open && (owner || manager)
    };
  }

  // Mark complete closes the action unless a close-out check is required (D-07).
  function completionStatus(requiresCloseOut) { return requiresCloseOut ? 'Completed' : 'Closed'; }

  return {
    addYears: addYears, isOpen: isOpen, validateRaise: validateRaise, validateExtend: validateExtend,
    validateComplete: validateComplete, validateUpdate: validateUpdate, roles: roles,
    completionStatus: completionStatus, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES
  };
})();
