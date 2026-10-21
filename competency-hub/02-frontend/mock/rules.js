/* Built by tools/build.js from src/core/config.js, dates.js and domain/rules.js for the mock. Do not edit. */
window.MockRules = (function () {
  'use strict';
  var CH = {};
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '0.2.1',
    ENVIRONMENT: 'TEST',
    lists: {
      competencies: { title: 'Competencies', url: 'Competencies' },
      people: { title: 'People', url: 'People' },
      members: { title: 'Competency Members', url: 'CompetencyMembers' },
      actions: { title: 'Actions', url: 'Actions' },
      notices: { title: 'Noticeboard', url: 'Noticeboard' },
      updates: { title: 'Updates', url: 'Updates' },
      calendar: { title: 'Calendar Events', url: 'CalendarEvents' },
      meetings: { title: 'Meetings', url: 'Meetings' },
      requests: { title: 'Requests', url: 'Requests' },
      history: { title: 'History', url: 'History' }
    },
    pageSize: 500,
    maxRows: 5000,
    dueSoonDays: 7,
    meetingOverdueDays: 35,
    noticeImportantMaxDays: 30,
    managementRoles: ['Team Leader', 'Group Head'],
    maxDeadlineYears: 2
  };

  // Date rules from plan D.0.1. Canonical dates are UK calendar strings 'YYYY-MM-DD'.
  // Arithmetic is done on calendar dates through Date.UTC, never on yyyymmdd integers.
  CH.dates = (function () {
    var DAY_MS = 86400000;
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var ukParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function parts(instant) {
      var out = {};
      ukParts.formatToParts(instant).forEach(function (p) { out[p.type] = p.value; });
      return out;
    }

    // The UK calendar date of an instant (a Date, or an ISO string with a time).
    function localDate(instant) {
      var p = parts(instant instanceof Date ? instant : new Date(instant));
      return p.year + '-' + p.month + '-' + p.day;
    }

    function ukTime(instant) {
      var p = parts(instant instanceof Date ? instant : new Date(instant));
      return p.hour + ':' + p.minute;
    }

    function isIso(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso); }

    function toUtc(iso) {
      if (!isIso(iso)) throw new Error('Not a calendar date: ' + iso);
      return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    }

    function fromUtc(ms) {
      var d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }

    function addDays(iso, n) {
      return fromUtc(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
    }

    function daysBetween(fromIso, toIso) {
      return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
    }

    function dayOfWeek(iso) { return new Date(toUtc(iso)).getUTCDay(); }

    // Monday of the week containing iso, used for weekly keys (never ISO week numbers).
    function mondayOf(iso) { return addDays(iso, -((dayOfWeek(iso) + 6) % 7)); }

    function toDueDay(iso) { return Number(iso.replace(/-/g, '')); }

    function fromDueDay(n) {
      var s = String(Math.round(Number(n)));
      if (!/^\d{8}$/.test(s)) throw new Error('Not a DueDay: ' + n);
      return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    }

    function short(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS[+iso.slice(5, 7) - 1]; }
    function shortYear(iso) { return short(iso) + ' ' + iso.slice(0, 4); }
    function long(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS_LONG[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4); }
    function weekday(iso) { return DAYS[dayOfWeek(iso)]; }
    function weekdayShort(iso) { return weekday(iso).slice(0, 3) + ' ' + short(iso); }

    // Plain-English wording for a deadline relative to today (plan C.9).
    function dueWords(dueIso, todayIso) {
      var d = daysBetween(todayIso, dueIso);
      if (d < 0) return { group: 'late', text: (-d) + (d === -1 ? ' day late' : ' days late') };
      if (d === 0) return { group: 'soon', text: 'Due today' };
      if (d === 1) return { group: 'soon', text: 'Due tomorrow' };
      if (d < 7) return { group: 'soon', text: 'Due ' + weekday(dueIso) };
      if (d === 7) return { group: 'soon', text: 'Due ' + short(dueIso) };
      return { group: 'later', text: 'Due ' + short(dueIso) };
    }

    return {
      localDate: localDate, ukTime: ukTime, addDays: addDays, daysBetween: daysBetween, dayOfWeek: dayOfWeek,
      mondayOf: mondayOf, toDueDay: toDueDay, fromDueDay: fromDueDay, isIso: isIso,
      short: short, shortYear: shortYear, long: long, weekday: weekday, weekdayShort: weekdayShort, dueWords: dueWords
    };
  })();

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

  return { config: CH.config, dates: CH.dates, rules: CH.rules };
})();
