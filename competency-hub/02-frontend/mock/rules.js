/* Built by tools/build.js from src/core/config.js, dates.js, domain/rules.js and agenda.js for the mock. Do not edit. */
window.MockRules = (function () {
  'use strict';
  var CH = {};
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '1.0.0',
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
      history: { title: 'History', url: 'History' },
      settings: { title: 'Competency Hub Settings', url: 'Settings' },
      register: { title: 'Improvements and Degradations', url: 'ImprovementRegister' },
      feedback: { title: 'Feedback', url: 'Feedback' },
      meetingItems: { title: 'Meeting Items', url: 'MeetingItems' },
      minutes: { title: 'Meeting Minutes', url: 'MeetingMinutes' }
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

    // Plain-English wording for a deadline relative to today (plan C.9). "Due soon" covers the days an administrator
    // sets (DueSoonDays, 7 unless changed).
    function dueWords(dueIso, todayIso) {
      var soonDays = (CH.config && CH.config.dueSoonDays) || 7;
      var d = daysBetween(todayIso, dueIso);
      if (d < 0) return { group: 'late', text: (-d) + (d === -1 ? ' day late' : ' days late') };
      if (d === 0) return { group: 'soon', text: 'Due today' };
      if (d === 1) return { group: d <= soonDays ? 'soon' : 'later', text: 'Due tomorrow' };
      return { group: d <= soonDays ? 'soon' : 'later', text: 'Due ' + (d < 7 ? weekday(dueIso) : short(dueIso)) };
    }

    // A moment as SharePoint's form fields take it on a UK site: dd/MM/yyyy HH:mm, UK time.
    function ukFormDateTime(instant) {
      var p = parts(instant instanceof Date ? instant : new Date(instant));
      return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
    }

    return {
      localDate: localDate, ukTime: ukTime, addDays: addDays, daysBetween: daysBetween, dayOfWeek: dayOfWeek,
      mondayOf: mondayOf, toDueDay: toDueDay, fromDueDay: fromDueDay, isIso: isIso,
      short: short, shortYear: shortYear, long: long, weekday: weekday, weekdayShort: weekdayShort, dueWords: dueWords, ukFormDateTime: ukFormDateTime
    };
  })();

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

    // ---- monthly meetings (spec MTG-1): the same checks as the Meetings flow
    // v: { areaKey, dateIso, start, end, location, onlineLink, chairId, attendeeIds }
    // ctx: { today, runsMeetings(areaKey), chairAllowed(areaKey, id), attendeeAllowed(areaKey, id) }
    function validateMeeting(v, ctx) {
      var e = {};
      if (!v.areaKey || !ctx.runsMeetings(v.areaKey)) e.areaKey = 'Only the people who run meetings in this area, and management, can do this.';
      var hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!D.isIso(v.dateIso || '') || isNaN(Date.parse(v.dateIso + 'T00:00:00Z')) || D.addDays(v.dateIso, 0) !== v.dateIso) e.dateIso = 'Choose a date, and a start and end time.';
      else if (v.dateIso < ctx.today) e.dateIso = 'Choose a date from today onwards.';
      else if (v.dateIso > D.addDays(ctx.today, 730)) e.dateIso = 'Choose a date within two years.';
      if (!hhmm.test(v.start || '') || !hhmm.test(v.end || '')) e.start = 'Choose a date, and a start and end time.';
      else if (v.end <= v.start) e.end = 'The meeting must end after it starts.';
      if (String(v.location || '').trim().length > 255) e.location = 'Keep the place to 255 characters or fewer.';
      var link = String(v.onlineLink || '').trim();
      if (link && (!/^https:\/\//i.test(link) || link.length > 1000)) e.onlineLink = 'Give a secure online link: it starts with https.';
      if (!e.areaKey && !ctx.chairAllowed(v.areaKey, Number(v.chairId))) e.chairId = 'Choose a chair who runs meetings in this area, or a Team Leader.';
      var ids = (v.attendeeIds || []).map(Number);
      if (!e.areaKey && (!ids.length || ids.length > 60 || ids.some(function (id) { return !ctx.attendeeAllowed(v.areaKey, id); }))) {
        e.attendeeIds = 'Choose the attendees from the members of the area and management (up to 60).';
      }
      return e;
    }

    function validateCancelMeeting(v) {
      var r = String(v.reason || '').trim();
      if (r.length < 10) return { reason: 'Give a reason of at least 10 characters.' };
      if (r.length > 1000) return { reason: 'Keep the reason to 1,000 characters or fewer.' };
      return {};
    }

    // The live meeting and its minutes (spec MTG-3 to MTG-5), the same as the Minutes flow. Items for discussion – carried
    // forward, flagged notices, new register entries and new business – each need one of these outcomes to finalise.
    var MINUTE_OUTCOMES = ['Discussed', 'Deferred', 'Not reached', 'Action raised', 'Discarded'];
    var DISCUSSION_SECTIONS = ['Carried forward', 'Noticeboard', 'New improvements and degradations', 'New business'];
    // items: [{ key, section, title }]; outcomes: { key: outcome } (the last one recorded). Returns the titles still missing one.
    function missingOutcomes(items, outcomes) {
      return items.filter(function (it) { return DISCUSSION_SECTIONS.indexOf(it.section) >= 0 && MINUTE_OUTCOMES.indexOf(outcomes[it.key]) < 0; })
        .map(function (it) { return it.title; });
    }
    function validateAmend(v) {
      var e = {};
      var what = String(v.what || '').trim();
      var reason = String(v.reason || '').trim();
      if (what.length < 10) e.what = 'Say what the amendment is, in at least 10 characters.';
      else if (what.length > 2000) e.what = 'Keep the amendment to 2,000 characters or fewer.';
      if (reason.length < 10) e.reason = 'Give a reason of at least 10 characters.';
      else if (reason.length > 1000) e.reason = 'Keep the reason to 1,000 characters or fewer.';
      return e;
    }

    // The same date in the following months, on the same weekday of the month (the second Wednesday stays the second
    // Wednesday); a fifth weekday that a month does not have becomes the last one.
    function nextMonths(iso, count) {
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
      var dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      var nth = Math.ceil(d / 7);
      var out = [];
      for (var i = 1; i <= count; i++) {
        var mm = m - 1 + i;
        var yy = y + Math.floor(mm / 12);
        mm = mm % 12;
        var first = new Date(Date.UTC(yy, mm, 1)).getUTCDay();
        var day = 1 + ((dow - first + 7) % 7) + (nth - 1) * 7;
        var last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
        while (day > last) day -= 7;
        out.push(yy + '-' + ('0' + (mm + 1)).slice(-2) + '-' + ('0' + day).slice(-2));
      }
      return out;
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
      NOTICE_CATEGORIES: NOTICE_CATEGORIES, validateMeeting: validateMeeting, validateCancelMeeting: validateCancelMeeting, nextMonths: nextMonths, MINUTE_OUTCOMES: MINUTE_OUTCOMES,
      DISCUSSION_SECTIONS: DISCUSSION_SECTIONS, missingOutcomes: missingOutcomes, validateAmend: validateAmend, SELF_ONLY: SELF_ONLY, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES, OUTCOMES: OUTCOMES
    };
  })();

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

  return { config: CH.config, dates: CH.dates, rules: CH.rules, agenda: CH.agenda };
})();
window.MockIndexes = {"Actions":["Competency","IsCrossCompetency","AssignedTo","RaisedBy","DateRaised","DueDay","Status","IsOpen","ExtensionCount","DateCompleted","DateClosed","SourceId","IsTestRecord","PendingRequestKey","LastRequestKey","CreatedRequestKey"],"History":["RowKind","RequestKey","RecordId","Competency","EventType","Actor","EventTime","WasOverdue","MeetingId","RequestItemId","RequestType","FirstClaimedAt","State","LeaseUntil","NextAttemptAfter"],"Updates":["ClientKey","ParentId","EntryType","IsFlagEvent","IsTestRecord"],"Meeting Items":["RowKey","RecordKey","MeetingId","SourceId"],"Requests":["RequestKey","RequestType","TargetId","MeetingId","Status","ProcessedAt"],"Notification Log":["NotificationKey","Token","NotificationType","Recipient","RecordId","State","SendingSince","NextAttemptAfter","LeaseUntil","DueDay"]};
