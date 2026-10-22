/* ESG Competency Hub 0.3.0 – built from src/ by tools/build.js. Do not edit. */
window.ESGCompetencyHub = function (ctx) {
  'use strict';
  var CH = {};
  /* src/core/config.js */
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '0.3.0',
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

  /* src/core/dom.js */
  // The only element factory. Text is always set with textContent, never parsed as HTML.
  CH.dom = (function () {
    function h(tag, attrs) {
      var node = document.createElement(tag);
      var a = attrs || {};
      Object.keys(a).forEach(function (key) {
        var value = a[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = String(value);
        else if (key === 'style') node.setAttribute('style', value);
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
      for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
      return node;
    }

    function append(parent, child) {
      if (child === undefined || child === null || child === false) return;
      if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
      if (typeof child === 'string' || typeof child === 'number') { parent.appendChild(document.createTextNode(String(child))); return; }
      parent.appendChild(child);
    }

    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    return { h: h, append: append, clear: clear };
  })();

  /* src/core/dates.js */
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

  /* src/core/sp.js */
  // Same-origin SharePoint REST through Welcome's SPHttpClient, as the signed-in user.
  // Reads are bounded and paged; a result that hit the limit is marked incomplete, never shown as complete.
  CH.sp = (function () {
    function SpError(status, message) {
      this.name = 'SpError';
      this.status = status;
      this.message = message || ('SharePoint request failed (HTTP ' + status + ')');
    }
    SpError.prototype = Object.create(Error.prototype);

    function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function escapeOData(text) { return String(text).replace(/'/g, "''"); }

    function create(webPart) {
      var http = webPart.spHttpClient;
      var config = http.constructor.configurations.v1;
      var siteUrl = webPart.pageContext.web.absoluteUrl.replace(/\/$/, '');
      var siteRelative = (webPart.pageContext.web.serverRelativeUrl || '').replace(/\/$/, '');
      var origin = siteUrl.slice(0, siteUrl.length - siteRelative.length);
      var digest = { value: '', expires: 0 };

      async function req(method, url, body, attempt) {
        attempt = attempt || 0;
        var headers = { 'Accept': 'application/json;odata=nometadata' };
        var options = { headers: headers };
        if (method === 'POST') {
          headers['Content-Type'] = 'application/json;odata=nometadata';
          if (url.indexOf('/_api/contextinfo') < 0) headers['X-RequestDigest'] = await getDigest();
          options.body = body === undefined ? '' : JSON.stringify(body);
        }
        var response;
        try {
          response = method === 'GET' ? await http.get(url, config, options) : await http.post(url, config, options);
        } catch (error) {
          throw new SpError(0, 'Could not reach SharePoint. Check your connection and try again.');
        }
        if ((response.status === 429 || response.status === 503) && attempt < 3) {
          await wait(1000 * Math.pow(2, attempt));
          return req(method, url, body, attempt + 1);
        }
        var text = await response.text();
        if (response.status < 200 || response.status >= 300) throw new SpError(response.status);
        if (!text) return null;
        try { return JSON.parse(text); } catch (_) { throw new SpError(response.status, 'SharePoint returned an unreadable response.'); }
      }

      async function getDigest() {
        if (digest.value && Date.now() < digest.expires) return digest.value;
        var json = await req('POST', siteUrl + '/_api/contextinfo');
        var value = json && (json.FormDigestValue ||
          (json.d && json.d.GetContextWebInformation && json.d.GetContextWebInformation.FormDigestValue));
        if (!value) throw new SpError(0, 'SharePoint did not provide a request digest.');
        digest = { value: value, expires: Date.now() + 20 * 60 * 1000 };
        return value;
      }

      function listPath(title) { return siteUrl + "/_api/web/lists/getbytitle('" + escapeOData(title) + "')"; }

      // Reads every page up to maxRows. Follows nextLink only when it stays on this site.
      async function items(title, query, maxRows) {
        var limit = maxRows || CH.config.maxRows;
        var url = listPath(title) + '/items?' + query + '&$top=' + CH.config.pageSize;
        var rows = [];
        var complete = true;
        while (url) {
          var json = await req('GET', url);
          var page = (json && (json.value || (json.d && json.d.results))) || [];
          rows = rows.concat(page);
          var next = json && (json['odata.nextLink'] || json['@odata.nextLink'] || (json.d && json.d.__next));
          if (rows.length >= limit && next) { complete = false; break; }
          if (next && next.indexOf(siteUrl + '/') !== 0) { complete = false; break; }
          url = next || null;
        }
        return { rows: rows.slice(0, limit), complete: complete };
      }

      function currentUser() { return req('GET', siteUrl + '/_api/web/currentuser?$select=Id,Title,Email'); }

      // The signed-in user's first name from their Microsoft 365 profile, or '' if it cannot be read.
      async function myFirstName() {
        try {
          var json = await req('GET', siteUrl + '/_api/SP.UserProfiles.PeopleManager/GetMyProperties?$select=UserProfileProperties');
          var props = json && json.UserProfileProperties;
          props = props && (props.results || props);
          var hit = Array.isArray(props) && props.filter(function (p) { return p.Key === 'FirstName'; })[0];
          return hit && typeof hit.Value === 'string' ? hit.Value.trim() : '';
        } catch (error) {
          return '';
        }
      }

      // Instant direct write into a folder (plan C.8). Every HasException is checked.
      async function addToFolder(listKey, folder, values) {
        var list = CH.config.lists[listKey];
        var body = {
          listItemCreateInfo: {
            FolderPath: { DecodedUrl: siteRelative + '/Lists/' + list.url + '/' + folder },
            UnderlyingObjectType: 0
          },
          formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }),
          bNewDocumentUpdate: false
        };
        var json = await req('POST', listPath(list.title) + '/AddValidateUpdateItemUsingPath', body);
        var results = (json && (json.value || (json.d && json.d.AddValidateUpdateItemUsingPath && json.d.AddValidateUpdateItemUsingPath.results))) || [];
        var failed = results.filter(function (r) { return r.HasException; });
        if (failed.length) throw new SpError(400, failed.map(function (r) { return r.FieldName + ': ' + r.ErrorMessage; }).join('; '));
        var idField = results.filter(function (r) { return r.FieldName === 'Id'; })[0];
        return idField ? Number(idField.FieldValue) : null;
      }

      return { siteUrl: siteUrl, origin: origin, siteRelative: siteRelative, items: items, currentUser: currentUser, myFirstName: myFirstName, addToFolder: addToFolder };
    }

    // The last folder segment of an item's FileDirRef (e.g. '.../Lists/Noticeboard/FLK' -> 'FLK').
    function folderOf(fileDirRef) {
      var parts = String(fileDirRef || '').split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }

    return { create: create, SpError: SpError, escapeOData: escapeOData, folderOf: folderOf };
  })();

  /* src/core/requests.js */
  // Queued changes (plan C.6, F.1): the browser writes a request into the user's own Requests folder and the
  // request flow applies it. Success is shown only when the request is Completed and the action itself confirms
  // it (its LastRequestKey is this request and nothing is locked), or History holds the request's event row.
  CH.requests = (function () {
    var UNSENT_KEY = 'esg-competency-hub-unsent';
    var SCHEDULE = [20, 40, 60];
    var EVERY = 60;
    var GIVE_UP_MINUTES = 15;
    var OPEN_STATUSES = ['Submitted', 'Processing'];

    function newKey() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      var x = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join('');
      return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
    }

    function readUnsent() {
      try { return JSON.parse(window.localStorage.getItem(UNSENT_KEY) || '[]') || []; } catch (_) { return []; }
    }
    function writeUnsent(list) {
      try { window.localStorage.setItem(UNSENT_KEY, JSON.stringify(list)); } catch (_) { /* not remembered */ }
    }

    // app: { sp, person }. onChange(entry) is called whenever a request's state changes.
    function tracker(app, onChange) {
      var entries = [];
      var timers = [];
      var stopped = false;
      var q = CH.sp.escapeOData;

      function folder() { return 'u' + app.person.SiteUserId; }

      function values(spec) {
        return {
          Title: String(spec.label).slice(0, 255), RequestKey: spec.key, RequestType: spec.type,
          TargetType: spec.targetId ? 'Action' : '', TargetId: spec.targetId || '', ExpectedRevision: spec.expectedRevision || '',
          Payload: JSON.stringify(spec.payload), Status: 'Submitted'
        };
      }

      async function findRequest(key) {
        var res = await app.sp.items(CH.config.lists.requests.title,
          "$select=Id,Status,ResultMessage,ResultId&$filter=RequestKey eq '" + q(key) + "'", 1);
        return res.rows[0] || null;
      }

      // spec: { type, targetId, expectedRevision, payload, label, key? }. Resolves to the tracked entry.
      async function submit(spec) {
        spec.key = spec.key || newKey();
        try {
          await app.sp.addToFolder('requests', folder(), values(spec));
        } catch (error) {
          // An unclear failure may still have saved the request: look for it by its key before giving up.
          var found = null;
          try { found = await findRequest(spec.key); } catch (_) { found = null; }
          if (!found) {
            var unsent = readUnsent().filter(function (u) { return u.key !== spec.key; });
            unsent.push(spec);
            writeUnsent(unsent);
            throw error;
          }
        }
        writeUnsent(readUnsent().filter(function (u) { return u.key !== spec.key; }));
        var entry = { key: spec.key, type: spec.type, targetId: spec.targetId || null, label: spec.label, submittedAt: new Date(),
          state: 'submitted', message: '', resultId: null, polls: 0 };
        entries.push(entry);
        schedule(entry);
        onChange(entry);
        return entry;
      }

      // After a reload: the user's own requests still waiting for the flow are tracked again (plan K7.9).
      // Status is indexed, so it leads the filter; AuthorId keeps it to this person's requests.
      async function resume() {
        var found = [];
        for (var i = 0; i < OPEN_STATUSES.length; i++) {
          var res = await app.sp.items(CH.config.lists.requests.title, '$select=Id,Title,RequestKey,RequestType,TargetId,Created' +
            "&$filter=Status eq '" + OPEN_STATUSES[i] + "' and AuthorId eq " + Number(app.person.SiteUserId), 100);
          found = found.concat(res.rows);
        }
        found.sort(function (a, b) { return a.Id - b.Id; }).forEach(function (row) {
          if (!row.RequestKey || entries.some(function (e) { return e.key === row.RequestKey; })) return;
          var entry = { key: row.RequestKey, type: row.RequestType, targetId: row.TargetId || null, label: row.Title || 'Your change',
            submittedAt: row.Created ? new Date(row.Created) : new Date(), state: 'submitted', message: '', resultId: null, polls: 0 };
          entries.push(entry);
          schedule(entry);
        });
        return found.length;
      }

      function schedule(entry) {
        if (stopped) return;
        var seconds = entry.polls < SCHEDULE.length ? SCHEDULE[entry.polls] - (entry.polls ? SCHEDULE[entry.polls - 1] : 0) : EVERY;
        timers.push(setTimeout(function () { poll(entry); }, seconds * 1000));
      }

      async function poll(entry) {
        if (stopped || entry.state !== 'submitted' && entry.state !== 'slow') return;
        entry.polls++;
        var row = null;
        try { row = await findRequest(entry.key); } catch (_) { row = null; }
        var status = row && row.Status;
        if (status === 'Rejected') return settle(entry, 'rejected', row.ResultMessage || 'This change was not accepted.');
        if (status === 'Failed' || status === 'Needs attention') {
          return settle(entry, 'failed', 'This change has not been recorded yet. A Competency Hub administrator can see it and will put it right.');
        }
        if (status === 'Completed' && await confirmed(entry, row)) {
          entry.resultId = row.ResultId || entry.targetId;
          return settle(entry, 'done', row.ResultMessage || 'Recorded.');
        }
        var minutes = (Date.now() - entry.submittedAt.getTime()) / 60000;
        if (minutes >= GIVE_UP_MINUTES && entry.state !== 'slow') {
          entry.state = 'slow';
          entry.message = 'This is taking longer than usual. It will be recorded; you can keep working.';
          onChange(entry);
        }
        schedule(entry);
      }

      // The action itself must show this change, with no lock left on it.
      async function confirmed(entry, row) {
        var id = Number(row.ResultId || entry.targetId);
        if (!id) return false;
        try {
          var res = await app.sp.items(CH.config.lists.actions.title, '$select=Id,LastRequestKey,PendingRequestKey&$filter=Id eq ' + id, 1);
          var action = res.rows[0];
          if (action && action.LastRequestKey === entry.key && !action.PendingRequestKey) return true;
          // A later change may already have committed on the same action; its event row proves this one.
          var ev = await app.sp.items(CH.config.lists.history.title, "$select=Id&$filter=RequestKey eq '" + q(entry.key + '|1') + "'", 1);
          return ev.rows.length > 0;
        } catch (_) {
          return false;
        }
      }

      function settle(entry, state, message) {
        entry.state = state;
        entry.message = message;
        onChange(entry);
      }

      return {
        submit: submit,
        resume: resume,
        entries: function () { return entries.slice(); },
        // The newest unfinished or unread request for an action.
        forTarget: function (id) {
          return entries.filter(function (e) { return Number(e.targetId) === Number(id) && !e.dismissed; }).slice(-1)[0] || null;
        },
        dismiss: function (entry) { entry.dismissed = true; onChange(entry); },
        unsent: readUnsent,
        // Sends again, with the same keys, the requests a failed connection left behind.
        resend: async function () {
          var list = readUnsent();
          for (var i = 0; i < list.length; i++) await submit(list[i]);
          return list.length;
        },
        stop: function () { stopped = true; timers.forEach(clearTimeout); }
      };
    }

    return { tracker: tracker, newKey: newKey, SCHEDULE: SCHEDULE, GIVE_UP_MINUTES: GIVE_UP_MINUTES };
  })();

  /* src/domain/access.js */
  // Who the user is and what they may do (plan E.0, E.2, K4.1). The server remains the real boundary;
  // these rules decide what the screen offers. Identity fails closed: no guessed role, no default access.
  CH.access = (function () {
    var MESSAGES = {
      NOT_REGISTERED: 'Your account has not been set up in the Competency Hub yet.',
      DUPLICATE: 'Your account appears more than once in the Competency Hub, so your access cannot be confirmed.',
      LEFT: 'Your account is marked as having left the group.',
      UNAVAILABLE: 'The Competency Hub could not confirm your access right now.'
    };

    // currentUser: { Id }. peopleRows: People list rows. Returns { ok, reason, person }.
    function resolveIdentity(currentUser, peopleRows) {
      if (!currentUser || !currentUser.Id) return { ok: false, reason: 'UNAVAILABLE' };
      var matches = (peopleRows || []).filter(function (p) { return Number(p.SiteUserId) === Number(currentUser.Id); });
      if (matches.length === 0) return { ok: false, reason: 'NOT_REGISTERED' };
      if (matches.length > 1) return { ok: false, reason: 'DUPLICATE' };
      if (matches[0].Status !== 'Active') return { ok: false, reason: 'LEFT' };
      if (['Engineer', 'Technician', 'Team Leader', 'Group Head'].indexOf(matches[0].Role) < 0) return { ok: false, reason: 'UNAVAILABLE' };
      return { ok: true, person: matches[0] };
    }

    // areasByKey: { FLK: { status } }. memberships: active rows { areaKey, canManageMeetings }.
    function build(person, memberships, areasByKey) {
      var role = person.Role;
      var management = CH.config.managementRoles.indexOf(role) >= 0;
      var member = {};
      var meetingAdmin = {};
      memberships.forEach(function (m) {
        member[m.areaKey] = true;
        if (m.canManageMeetings) meetingAdmin[m.areaKey] = true;
      });

      function active(key) { return !!areasByKey[key] && areasByKey[key].status === 'Active'; }

      return {
        role: role,
        isManagement: management,
        isEngineer: role === 'Engineer',
        isAdministrator: !!person.IsAdministrator,
        memberAreas: Object.keys(member).filter(active),
        isMember: function (key) { return !!member[key]; },
        // Members, Team Leaders and the Group Head may add and change things in an active area.
        canWrite: function (key) { return active(key) && (management || !!member[key]); },
        // Every active user may post a notice on any active area's noticeboard (K4.1, A-1).
        canPostNotice: function (key) { return active(key); },
        // Engineers of the area, its meeting administrators, and management manage actions and meetings.
        canManage: function (key) {
          return active(key) && (management || (!!member[key] && (role === 'Engineer' || !!meetingAdmin[key])));
        },
        runsMeetings: function (key) { return active(key) && (management || !!meetingAdmin[key]); }
      };
    }

    return { resolveIdentity: resolveIdentity, build: build, MESSAGES: MESSAGES };
  })();

  /* src/domain/rules.js */
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

    // Who may do what with an action (E.3). personId: SiteUserId. access: CH.access result.
    function roles(action, personId, access) {
      var owner = Number(action.ownerId) === Number(personId);
      var manager = Number(action.raisedById) === Number(personId) || access.canManage(action.areaKey);
      var open = isOpen(action.status);
      var finished = action.status === 'Closed' || action.status === 'Completed';
      return {
        owner: owner,
        manager: manager,
        canUpdate: access.canWrite(action.areaKey) || owner,
        canExtend: open && (owner || manager),
        canComplete: open && (owner || manager),
        canStatus: open && (owner || manager),
        canReassign: open && manager,
        canClose: (open || action.status === 'Completed') && manager,
        canReopen: finished && manager,
        canEdit: open && manager
      };
    }

    // Mark complete closes the action unless a close-out check is required (D-07).
    function completionStatus(requiresCloseOut) { return requiresCloseOut ? 'Completed' : 'Closed'; }

    return {
      addYears: addYears, isOpen: isOpen, validateRaise: validateRaise, validateExtend: validateExtend,
      validateComplete: validateComplete, validateUpdate: validateUpdate, validateStatus: validateStatus,
      validateReassign: validateReassign, validateClose: validateClose, validateReopen: validateReopen, validateEdit: validateEdit,
      roles: roles, completionStatus: completionStatus, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES, OUTCOMES: OUTCOMES
    };
  })();

  /* src/domain/model.js */
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
        'Blocker,CloseOutcome,ClosureNote,DateClosed&$filter=IsOpen eq 1 and FSObjType eq 0',
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

      // One action row as the views use it; also used for finished actions read on demand (actionFrom).
      function actionFrom(r) {
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
          waitingCloseOut: waitingCloseOut, group: r.Status === 'Closed' ? 'done' : words.group,
          dueText: r.Status === 'Closed' ? 'Closed' : words.text,
          blocker: r.Status === 'Awaiting Input' ? (r.Blocker || '') : '', closeOutcome: r.CloseOutcome || '', closureNote: r.ClosureNote || '',
          closedIso: r.DateClosed ? D.localDate(r.DateClosed) : ''
        };
      }
      var actions = (raw.actions.rows || []).filter(function (r) { return !isUncommitted(r) && r.Status !== 'Closed'; }).map(actionFrom);
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
        inArea: inArea, nameOf: nameOf, ownersFor: ownersFor, actionById: actionById, actionFrom: actionFrom,
        sections: {
          actions: section(raw.actions), notices: section(raw.notices), meetings: section(raw.meetings),
          calendar: section(raw.calendar), flags: section(raw.updates), members: section(raw.members)
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

    return { load: load, build: build, isUncommitted: isUncommitted, loadFinished: loadFinished, loadAction: loadAction };
  })();

  /* src/ui/components.js */
  // Small, plain building blocks shared by the views. Status is always words first, colour second.
  CH.ui = (function () {
    var h = CH.dom.h;
    var D = CH.dates;

    function chip(group, text) { return h('span', { class: 'when w-' + group, text: text }); }

    function card(title, children, extraClass) {
      return h('section', { class: 'card' + (extraClass ? ' ' + extraClass : '') }, title ? h('h2', { text: title }) : null, children);
    }

    function button(label, onclick, kind) {
      return h('button', { type: 'button', class: 'btn' + (kind ? ' btn-' + kind : ''), onclick: onclick, text: label });
    }

    function linkButton(label, onclick) {
      return h('button', { type: 'button', class: 'btn-link', onclick: onclick, text: label });
    }

    // A plain note when a list could not be read completely. Never shown as an empty result.
    function sectionNote(state, what) {
      if (state === 'unavailable') return h('p', { class: 'section-note', role: 'status', text: 'Could not load ' + what + ' just now. Reload the page to try again.' });
      if (state === 'partial') return h('p', { class: 'section-note', role: 'status', text: 'Showing the first ' + CH.config.maxRows + ' ' + what + ' only. This list is not complete.' });
      return null;
    }

    var GROUPS = [['late', 'Late', 'var(--late)'], ['soon', 'Due within 7 days', 'var(--soon)'], ['later', 'Coming up', '#9aa5af']];

    // Actions grouped as Late / Due within 7 days / Coming up. sub(action) gives the grey second line.
    // Each action opens with open(action); pending(action) gives a "being recorded" note, if any.
    function actionList(actions, sub, emptyText, state, open, pending) {
      if (state === 'unavailable') return null;
      if (!actions.length) return h('p', { class: 'muted', text: emptyText });
      var out = [];
      GROUPS.forEach(function (g) {
        var rows = actions.filter(function (a) { return a.group === g[0]; })
          .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); });
        if (!rows.length) return;
        out.push(h('h3', { class: 'group-title' }, h('span', { class: 'dot', style: 'background:' + g[2], 'aria-hidden': 'true' }), g[1]));
        out.push(h('ul', { class: 'items' }, rows.map(function (a) {
          var note = pending ? pending(a) : '';
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: open ? function () { open(a); } : null, disabled: open ? null : true },
            h('span', null, h('span', { class: 't', text: a.title }), h('span', { class: 's', text: sub(a) + (note ? ' · ' + note : '') })),
            chip(a.waitingCloseOut ? 'later' : a.group, a.dueText)));
        })));
      });
      return out;
    }

    // actionsState: 'complete', 'partial' or 'unavailable'. Figures from a failed read are never shown as zero.
    function areaStatusLines(stats, actionsState) {
      var late = actionsState === 'unavailable'
        ? h('span', { class: 'txt-soon', text: 'Action figures unavailable' })
        : stats.late
        ? h('span', { class: 'txt-late', text: stats.late + ' late' })
        : h('span', { class: 'txt-ok', text: 'Nothing late' });
      var meeting = stats.nextMeeting
        ? h('span', { text: 'Meeting ' + D.weekdayShort(stats.nextMeeting) + (stats.flagged ? ' · ' + stats.flagged + ' to discuss' : '') })
        : stats.meetingStale
          ? h('span', { class: 'txt-soon', text: stats.lastMeeting ? 'No meeting since ' + D.short(stats.lastMeeting) : 'No meeting booked' })
          : h('span', { text: 'No meeting booked' });
      var open = actionsState === 'unavailable' ? '' : ' · ' + stats.open + ' open' + (actionsState === 'partial' ? ' (incomplete)' : '');
      return [h('span', { class: 'status' }, late, open), h('span', { class: 'status' }, meeting)];
    }

    function tile(area, stats, viewOnly, onopen, actionsState) {
      var cls = 'tile' + (actionsState !== 'unavailable' && stats.late ? ' has-late' : stats.meetingStale ? ' has-warn' : '') + (viewOnly ? ' view-only' : '');
      return h('button', { type: 'button', class: cls, onclick: onopen, 'aria-label': area.name + (viewOnly ? ', view only' : '') },
        h('b', null, area.name, viewOnly ? h('span', { class: 'vo', text: 'View only' }) : null),
        areaStatusLines(stats, actionsState),
        area.status === 'Archived' ? h('span', { class: 'status', text: 'Archived' }) : null);
    }

    function tileGrid(areas, model, viewOnly, open) {
      var cols = areas.length <= 6 ? Math.max(areas.length, 1) : 5;
      return h('div', { class: 'tiles' + (viewOnly ? ' tiles-small' : ''), style: '--cols:' + cols },
        areas.map(function (a) { return tile(a, model.stats[a.key], viewOnly, function () { open(a.key); }, model.sections.actions); }));
    }

    function toast(root, text, kind) {
      var region = root.querySelector('[data-ch-live]');
      if (!region) return;
      region.textContent = '';
      region.className = 'toast' + (kind ? ' toast-' + kind : '');
      region.textContent = text;
      setTimeout(function () { if (region.textContent === text) { region.textContent = ''; region.className = 'toast'; } }, 6000);
    }

    // Size steps by the width the app has (plan K6.9), so wide screens are not left with small text.
    var SCALE_STEPS = [[2400, 1.5], [2000, 1.35], [1700, 1.2], [1400, 1.1]];
    function scaleFor(width) {
      for (var i = 0; i < SCALE_STEPS.length; i++) if (width >= SCALE_STEPS[i][0]) return SCALE_STEPS[i][1];
      return 1;
    }

    // The reader's text size, remembered in this browser only. Storage can be unavailable; then Normal is used.
    var TEXT_SIZES = [['Normal', 1], ['Large', 1.15], ['Larger', 1.3]];
    var TEXT_KEY = 'esg-competency-hub-text-size';
    function textSize() {
      var saved = null;
      try { saved = window.localStorage.getItem(TEXT_KEY); } catch (_) { saved = null; }
      return TEXT_SIZES.some(function (t) { return t[0] === saved; }) ? saved : 'Normal';
    }
    function textFactor(name) { return (TEXT_SIZES.filter(function (t) { return t[0] === name; })[0] || TEXT_SIZES[0])[1]; }
    function saveTextSize(name) { try { window.localStorage.setItem(TEXT_KEY, name); } catch (_) { /* not remembered */ } }

    return {
      scaleFor: scaleFor, TEXT_SIZES: TEXT_SIZES, textSize: textSize, textFactor: textFactor, saveTextSize: saveTextSize,
      chip: chip, card: card, button: button, linkButton: linkButton, sectionNote: sectionNote,
      actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast
    };
  })();

  /* src/ui/dialog.js */
  // The one dialog used by every form and the action panel: modal, focus kept inside, Escape or the
  // backdrop closes it, and focus returns to where it was.
  CH.ui.dialog = (function () {
    var h = CH.dom.h;
    var FOCUSABLE = 'a[href], select, input, textarea, button:not([disabled])';

    // opts: { root, id, title, wide, onClose }. Returns { body, close, node, setTitle }.
    function open(opts) {
      var previousFocus = document.activeElement;
      var heading = h('h2', { id: opts.id + '-heading', text: opts.title });
      var body = h('div', { class: 'dialog-content' });
      var closeBtn = h('button', { type: 'button', class: 'dialog-x', 'aria-label': 'Close', text: '×' });
      var dialog = h('div', { class: 'dialog' + (opts.wide ? ' dialog-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': opts.id + '-heading', id: opts.id },
        h('div', { class: 'dialog-head' }, heading, closeBtn), body);
      var scrim = h('div', { class: 'scrim', onclick: function (e) { if (e.target === scrim) close(); } }, dialog);
      var closed = false;

      function close() {
        if (closed) return;
        closed = true;
        scrim.remove();
        document.removeEventListener('keydown', onKey, true);
        if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus();
        if (opts.onClose) opts.onClose();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(dialog.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      closeBtn.addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      opts.root.appendChild(scrim);

      return {
        node: dialog, body: body, close: close,
        isOpen: function () { return !closed; },
        setTitle: function (text) { heading.textContent = text; },
        focusFirst: function () {
          var first = body.querySelector('input, select, textarea, button');
          (first || closeBtn).focus();
        }
      };
    }

    // A labelled field with a hint and an error line (ids follow the input's id).
    function field(label, input, hint) {
      return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), hint ? h('span', { class: 'hint', text: hint }) : null, input,
        h('span', { class: 'field-error', id: input.id + '-err' }));
    }

    // Shows errors ({ key: message }) against fields whose ids are prefix + key; focuses the first.
    function showErrors(container, prefix, errors, order) {
      Array.prototype.forEach.call(container.querySelectorAll('.field-error'), function (n) { n.textContent = ''; });
      var first = null;
      order.forEach(function (k) {
        if (!errors[k]) return;
        var slot = container.querySelector('#' + prefix + k + '-err');
        if (slot) slot.textContent = errors[k];
        if (!first) first = container.querySelector('#' + prefix + k);
      });
      if (first) first.focus();
      return !!first;
    }

    return { open: open, field: field, showErrors: showErrors };
  })();

  /* src/views/home.js */
  // Front pages by role (plan K1/K2): tiles at full width, then three columns of useful lists.
  CH.views = CH.views || {};
  CH.views.home = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;

    function greeting(first) {
      var hour = Number(D.ukTime(new Date()).slice(0, 2));
      return (hour < 12 ? 'Good morning, ' : hour < 18 ? 'Good afternoon, ' : 'Good evening, ') + first;
    }

    // Profile first name; otherwise the part of firstname.lastname@ addresses before the dot. Display names at
    // EDF are "Surname Firstname", so the display name is the last resort.
    function firstName(app) {
      if (app.firstName) return app.firstName;
      var local = String(app.person.Email || '').split('@')[0];
      if (/^[a-z]+[.]/i.test(local)) {
        var f = local.split('.')[0];
        return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
      }
      return (app.person.Title || '').split(' ')[0];
    }

    function myActions(app) {
      var mine = app.model.actions.filter(function (a) { return a.ownerId === app.person.SiteUserId; });
      return ui.card('Your actions', [
        h('div', { class: 'row card-link' }, ui.linkButton('See all, including ones you raised', function () { app.showMine(0); })),
        ui.sectionNote(app.model.sections.actions, 'actions'),
        ui.actionList(mine, function (a) { return a.areaName; }, 'You have no open actions. Nice work.', app.model.sections.actions, app.openAction, app.pendingNote)
      ]);
    }

    function meetingsCard(app, keys, title) {
      var list = keys.map(function (k) { return { area: app.model.areaByKey[k], s: app.model.stats[k] }; })
        .filter(function (x) { return x.area && x.s.nextMeeting; })
        .sort(function (a, b) { return a.s.nextMeeting.localeCompare(b.s.nextMeeting); }).slice(0, 5);
      return ui.card(title, [
        ui.sectionNote(app.model.sections.meetings, 'meetings'),
        list.length ? h('ul', { class: 'plain' }, list.map(function (x) {
          return h('li', null,
            h('span', null, h('b', { text: x.area.name }), h('br'), h('span', { class: 'muted small', text: D.weekdayShort(x.s.nextMeeting) })),
            x.s.flagged ? ui.chip('later', x.s.flagged + ' to discuss') : null);
        })) : h('p', { class: 'muted', text: 'No meetings booked in your areas yet.' })
      ]);
    }

    function noticesCard(app, keys) {
      var list = app.model.notices.filter(function (n) { return keys.indexOf(n.areaKey) >= 0; }).slice(0, 4);
      return ui.card('New on your noticeboards', [
        ui.sectionNote(app.model.sections.notices, 'notices'),
        list.length ? h('ul', { class: 'plain' }, list.map(function (n) {
          return h('li', null, h('span', null, h('span', { text: n.title }), h('br'),
            h('span', { class: 'muted small', text: app.model.areaByKey[n.areaKey].name + ' · ' + n.authorName + ' · ' + D.short(n.createdIso) +
              (n.fromOutside ? ' · from outside the area' : '') })));
        })) : h('p', { class: 'muted', text: 'Nothing new on your noticeboards.' })
      ]);
    }

    function manageCard(app) {
      var keys = app.model.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
      if (app.model.sections.actions === 'unavailable') return ui.card('For you to manage', ui.sectionNote('unavailable', 'actions'), 'manage');
      // Each action counts once, even when it is shared between several of these areas.
      var mine = app.model.actions.filter(function (a) { return keys.some(function (k) { return app.model.inArea(a, k); }); });
      var closeOut = mine.filter(function (a) { return a.waitingCloseOut; }).length;
      var late = mine.filter(function (a) { return a.group === 'late'; }).length;
      var flagged = keys.reduce(function (n, k) { return n + app.model.stats[k].flagged; }, 0);
      var runs = keys.filter(function (k) { return app.access.runsMeetings(k) && app.model.stats[k].nextMeeting; })
        .sort(function (a, b) { return app.model.stats[a].nextMeeting.localeCompare(app.model.stats[b].nextMeeting); });
      var next = runs[0];
      return ui.card('For you to manage', [
        h('div', { class: 'manage-grid' },
          h('div', null, h('span', { class: 'num', text: closeOut }), 'actions waiting for a close-out check'),
          h('div', null, h('span', { class: 'num' + (late ? ' txt-late' : ''), text: late }), 'late actions in areas you look after'),
          h('div', null, h('span', { class: 'num', text: flagged }), 'items flagged for discussion')),
        next ? h('p', null, h('b', { text: 'Next meeting to prepare: ' }),
          app.model.areaByKey[next].name + ', ' + D.weekdayShort(app.model.stats[next].nextMeeting) + '.')
          : h('p', { class: 'muted', text: 'No meetings for you to run are booked.' })
      ], 'manage');
    }

    function attentionCard(app) {
      var m = app.model;
      var items = [];
      m.areas.forEach(function (a) {
        if (a.status === 'Active' && m.stats[a.key].meetingStale) {
          items.push(h('li', null, h('span', null, h('b', { text: a.name }),
            m.stats[a.key].lastMeeting ? ' has not met since ' + D.long(m.stats[a.key].lastMeeting) : ' has no meeting on record',
            h('br'), h('span', { class: 'muted small', text: 'No meeting booked' })), ui.chip('soon', 'Meeting overdue')));
        }
      });
      if (m.sections.actions !== 'unavailable') m.actions.filter(function (a) { return a.group === 'late'; })
        .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); }).slice(0, 6).forEach(function (a) {
          items.push(h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
            h('span', null, h('b', { text: a.title }), h('br'),
              h('span', { class: 'muted small', text: a.areaName + ' · ' + a.ownerName + (a.extensions >= 2 ? ' · deadline moved ' + a.extensions + ' times' : '') })),
            ui.chip('late', a.dueText))));
        });
      var closeOut = m.actions.filter(function (a) { return a.waitingCloseOut; }).length;
      if (closeOut) items.push(h('li', null, h('span', null, h('b', { text: closeOut + (closeOut === 1 ? ' action is' : ' actions are') }), ' waiting for a close-out check')));
      return ui.card('Needs your attention', [
        ui.sectionNote(m.sections.actions, 'actions'),
        items.length ? h('ul', { class: 'plain' }, items) : m.sections.actions === 'unavailable' ? null : h('p', { class: 'muted', text: 'Nothing needs your attention right now.' })
      ]);
    }

    function render(app) {
      var m = app.model;
      var acc = app.access;
      var out = [h('h1', { text: greeting(firstName(app)) })];
      var postFirst = acc.memberAreas[0] || (m.areas[0] && m.areas[0].key);

      if (acc.isManagement) {
        // Totals count each action once, even when it is shared between areas (MGT-01).
        var open = m.actions.length;
        var late = m.actions.filter(function (a) { return a.group === 'late'; }).length;
        var stale = m.areas.filter(function (a) { return a.status === 'Active' && m.stats[a.key].meetingStale; }).length;
        if (m.sections.actions === 'unavailable') out.push(h('p', { class: 'sentence', text: 'Action figures could not be loaded just now. Reload the page to try again.' }));
        else out.push(h('p', { class: 'sentence' }, 'Across the group: ', h('b', { text: open + ' open actions' }), ', ',
          h('b', { class: late ? 'txt-late' : '', text: late + ' late' }), stale ? [', and ', h('b', { text: stale + (stale === 1 ? ' area' : ' areas') }), ' with no recent meeting.'] : '.'));
        out.push(h('div', { class: 'row actions-row' },
          ui.button('Raise an action', function () { app.raiseAction(postFirst); }, 'main'),
          ui.button('Post a notice', function () { app.postNotice(postFirst); })));
        out.push(h('h2', { text: 'All areas' }));
        out.push(ui.tileGrid(m.areas.filter(function (a) { return a.status === 'Active'; }), m, false, app.openArea));
        out.push(h('div', { class: 'cols3' },
          h('div', null, attentionCard(app)),
          h('div', null, myActions(app)),
          h('div', null, meetingsCard(app, m.areas.map(function (a) { return a.key; }), 'Coming meetings'))));
      } else {
        out.push(h('p', { class: 'lead', text: acc.isEngineer ? 'Your actions, and what you look after as an engineer.' : 'Here is what needs your attention.' }));
        out.push(h('div', { class: 'row actions-row' },
          acc.memberAreas.length ? ui.button('Raise an action', function () { app.raiseAction(acc.memberAreas[0]); }, 'main') : null,
          ui.button('Post a notice', function () { app.postNotice(postFirst); })));
        var mine = m.areas.filter(function (a) { return acc.isMember(a.key) && a.status === 'Active'; });
        var others = m.areas.filter(function (a) { return !acc.isMember(a.key) && a.status === 'Active'; });
        out.push(h('h2', { text: 'Your areas' }));
        out.push(mine.length ? ui.tileGrid(mine, m, false, app.openArea)
          : h('p', { class: 'muted', text: 'You are not a member of any area yet. Ask a Team Leader to add you.' }));
        var keys = mine.map(function (a) { return a.key; });
        out.push(acc.isEngineer
          ? h('div', { class: 'cols3' }, h('div', null, manageCard(app)), h('div', null, myActions(app)), h('div', null, meetingsCard(app, keys, 'Your next meetings'), noticesCard(app, keys)))
          : h('div', { class: 'cols3' }, h('div', null, myActions(app)), h('div', null, meetingsCard(app, keys, 'Your next meetings')), h('div', null, noticesCard(app, keys))));
        if (others.length) {
          out.push(h('h2', { class: 'other-heading', text: 'Other areas' }));
          out.push(h('p', { class: 'muted other-note', text: 'You can see everything in these areas and post on their noticeboards. Only their members can change anything else.' }));
          out.push(ui.tileGrid(others, m, true, app.openArea));
        }
      }
      return out;
    }

    return { render: render, greeting: greeting, firstName: firstName };
  })();

  /* src/views/area.js */
  // One competency area: summary sentence, then Actions / Notices & issues / Calendar / Meetings.
  // Non-members get a clear "View only" page; they may still post a notice (K4.1).
  CH.views = CH.views || {};
  CH.views.area = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;
    var TABS = ['Actions', 'Notices & issues', 'Calendar', 'Meetings'];

    function sentence(area, s, actionsState) {
      return h('p', { class: 'sentence' },
        actionsState === 'unavailable' ? 'Action figures could not be loaded. '
          : [s.open + ' open actions' + (actionsState === 'partial' ? ' (incomplete)' : '') + ', ', s.late ? h('b', { class: 'txt-late', text: s.late + ' late' }) : 'none late', '. '],
        s.nextMeeting ? 'Next meeting ' + D.weekdayShort(s.nextMeeting) + '.'
          : h('b', { class: 'txt-soon', text: s.lastMeeting ? 'No meeting since ' + D.short(s.lastMeeting) + '.' : 'No meeting booked.' }));
    }

    function actionsTab(app, area) {
      var list = app.model.actions.filter(function (a) { return app.model.inArea(a, area.key); });
      return [
        ui.sectionNote(app.model.sections.actions, 'actions'),
        ui.actionList(list, function (a) {
          return a.ownerName + (a.areaKey !== area.key ? ' · shared from ' + a.areaName : '') + (a.extensions ? ' · deadline moved ' + (a.extensions === 1 ? 'once' : a.extensions + ' times') : '');
        }, 'There are no open actions in ' + area.name + '.', app.model.sections.actions, app.openAction, app.pendingNote)
      ];
    }

    function noticesTab(app, area) {
      var list = app.model.notices.filter(function (n) { return n.areaKey === area.key; });
      return [
        h('div', { class: 'row tab-actions' }, ui.button('Post a notice', function () { app.postNotice(area.key); })),
        ui.sectionNote(app.model.sections.notices, 'notices'),
        list.length ? h('ul', { class: 'plain' }, list.map(function (n) {
          return h('li', null, h('span', null,
            h('b', { text: n.title }), n.important ? ui.chip('soon', 'Important') : null, h('br'),
            h('span', { class: 'notice-body', text: n.body.length > 240 ? n.body.slice(0, 240) + '…' : n.body }), h('br'),
            h('span', { class: 'muted small', text: n.category + ' · ' + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.short(n.createdIso) })));
        })) : h('p', { class: 'muted', text: 'Nothing has been posted on the ' + area.name + ' noticeboard yet.' }),
        h('p', { class: 'muted small', text: 'The improvements and degradations register appears here in the next version.' })
      ];
    }

    function calendarTab(app, area) {
      var list = app.model.calendar.filter(function (e) { return e.areaKey === area.key; });
      var s = app.model.stats[area.key];
      var rows = list.map(function (e) {
        return h('li', null, h('span', null, h('b', { text: e.title }), h('br'), h('span', { class: 'muted small', text: D.weekday(e.dateIso) + ' ' + D.long(e.dateIso) })),
          e.important ? ui.chip('soon', 'Important') : null);
      });
      if (s.nextMeeting) rows.unshift(h('li', null, h('span', null, h('b', { text: 'Monthly meeting' }), h('br'), h('span', { class: 'muted small', text: D.weekday(s.nextMeeting) + ' ' + D.long(s.nextMeeting) }))));
      return [ui.sectionNote(app.model.sections.calendar, 'calendar entries'),
        rows.length ? h('ul', { class: 'plain' }, rows) : h('p', { class: 'muted', text: 'Nothing in the calendar for the next 60 days.' })];
    }

    function meetingsTab(app, area) {
      var s = app.model.stats[area.key];
      return [ui.sectionNote(app.model.sections.meetings, 'meetings'), h('ul', { class: 'plain' },
        h('li', null, h('span', null, h('b', { text: 'Next meeting' }), h('br'),
          h('span', { class: 'muted small', text: (s.nextMeeting ? D.weekday(s.nextMeeting) + ' ' + D.long(s.nextMeeting) : 'Not booked') + (s.flagged ? ' · ' + s.flagged + ' items to discuss' : '') }))),
        h('li', null, h('span', null, h('b', { text: 'Last meeting' }), h('br'),
          h('span', { class: 'muted small', text: s.lastMeeting ? D.long(s.lastMeeting) : 'None on record' })))),
        h('p', { class: 'muted small', text: 'Running meetings, agendas and minutes arrive in a later version.' })];
    }

    function render(app, key, tabIndex) {
      var m = app.model;
      var area = m.areaByKey[key];
      var acc = app.access;
      var s = m.stats[key];
      var out = [];

      out.push(h('nav', { class: 'areastrip', 'aria-label': 'Areas' },
        h('button', { type: 'button', class: 'back', onclick: app.goHome, text: '‹ Overview' }),
        m.areas.filter(function (a) { return a.status === 'Active' || a.key === key; }).map(function (a) {
          var mine = acc.canWrite(a.key);
          return h('button', { type: 'button', class: mine ? '' : 'other', 'aria-current': a.key === key ? 'page' : null,
            title: mine ? null : 'View only', onclick: function () { app.openArea(a.key); }, text: a.name });
        })));

      out.push(h('h1', { text: area.name }));
      out.push(sentence(area, s, m.sections.actions));

      if (area.status !== 'Active') {
        out.push(h('div', { class: 'viewonly-bar', role: 'note' }, h('b', { text: 'Archived. ' }), 'This area is kept for reference and can no longer be changed.'));
      } else if (!acc.canWrite(key)) {
        out.push(h('div', { class: 'viewonly-bar', role: 'note' }, h('b', { text: 'View only. ' }),
          'You are not a member of ' + area.name + ', so you can read everything here and post on its noticeboard, but cannot change anything else. ' +
          'Speak to one of the ' + area.name + ' engineers or your Team Leader if something needs doing.'));
      } else {
        out.push(h('div', { class: 'row actions-row' },
          ui.button('Raise an action', function () { app.raiseAction(key); }, 'main'),
          ui.button('Post a notice', function () { app.postNotice(key); }),
          acc.runsMeetings(key) ? ui.button(s.nextMeeting ? 'Start meeting' : 'Book a meeting', function () { app.comingSoon('Meetings'); }) : null));
      }

      var tabs = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': area.name + ' sections' });
      var panel = h('div', { class: 'panel', role: 'tabpanel' });
      function show(i) {
        app.state.tab = i;
        Array.prototype.forEach.call(tabs.children, function (b, j) {
          b.setAttribute('aria-selected', String(i === j));
          b.tabIndex = i === j ? 0 : -1;
        });
        CH.dom.clear(panel);
        CH.dom.append(panel, [actionsTab, noticesTab, calendarTab, meetingsTab][i](app, area));
      }
      TABS.forEach(function (label, i) {
        tabs.appendChild(h('button', { type: 'button', role: 'tab', text: label, onclick: function () { show(i); },
          onkeydown: function (e) {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            var next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
            show(next);
            tabs.children[next].focus();
          } }));
      });
      out.push(tabs, panel);
      show(tabIndex || 0);
      return out;
    }

    return { render: render };
  })();

  /* src/views/notice-form.js */
  // "Post a notice": an instant write. Any active user may post on any active area's noticeboard (K4.1);
  // only members may mark a notice as important.
  CH.views = CH.views || {};
  CH.views.noticeForm = (function () {
    var h = CH.dom.h;
    var CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

    // Validation shared by the form and the tests.
    function validate(values) {
      var errors = {};
      var title = (values.title || '').trim();
      var body = (values.body || '').trim();
      if (!title) errors.title = 'Enter a title.';
      else if (title.length > 255) errors.title = 'Keep the title to 255 characters or fewer.';
      if (!body) errors.body = 'Enter your message.';
      else if (body.length > 5000) errors.body = 'Keep the message to 5,000 characters or fewer.';
      if (CATEGORIES.indexOf(values.category) < 0) errors.category = 'Choose a category.';
      return errors;
    }

    function open(app, areaKey) {
      var areas = app.model.areas.filter(function (a) { return app.access.canPostNotice(a.key); });
      var clientKey = CH.requests.newKey();
      var field = CH.ui.dialog.field;

      var areaSelect = h('select', { id: 'ch-n-area' }, areas.map(function (a) {
        return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name + (app.access.canWrite(a.key) ? '' : ' (not your area)') });
      }));
      var title = h('input', { id: 'ch-n-title', type: 'text', maxlength: '255', autocomplete: 'off' });
      var body = h('textarea', { id: 'ch-n-body', rows: '6', maxlength: '5000' });
      var category = h('select', { id: 'ch-n-cat' }, CATEGORIES.map(function (c) { return h('option', { value: c, text: c }); }));
      var important = h('input', { id: 'ch-n-imp', type: 'checkbox' });
      var importantRow = h('label', { class: 'check' }, important, ' Mark as important for 30 days');
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var outsideNote = h('p', { class: 'explain' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Post notice' });

      function refreshArea() {
        var key = areaSelect.value;
        var member = app.access.canWrite(key);
        importantRow.style.display = member ? '' : 'none';
        if (!member) important.checked = false;
        outsideNote.textContent = member ? '' : 'You are not a member of ' + app.model.areaByKey[key].name +
          '. Your notice will be shown as coming from outside the area, and its members will see it.';
        outsideNote.style.display = member ? 'none' : '';
      }
      areaSelect.addEventListener('change', refreshArea);

      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-n', title: 'Post a notice' });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        field('Which noticeboard?', areaSelect),
        outsideNote,
        field('Title', title, 'A short summary people will recognise.'),
        field('Message', body),
        field('Category', category),
        importantRow,
        errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
      dlg.body.appendChild(form);

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        var values = { title: title.value, body: body.value, category: category.value };
        var errors = validate(values);
        if (CH.ui.dialog.showErrors(form, 'ch-n-', { title: errors.title, body: errors.body, cat: errors.category }, ['title', 'body', 'cat'])) return;

        var key = areaSelect.value;
        submit.disabled = true;
        submit.textContent = 'Posting…';
        try {
          await app.sp.addToFolder('notices', key, {
            Title: values.title.trim(), Body: values.body.trim(), Category: values.category,
            IsImportant: important.checked && app.access.canWrite(key) ? '1' : '0',
            ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active'
          });
          dlg.close();
          app.noticePosted(key);
        } catch (error) {
          // An unclear failure may still have saved the notice: look for it by its client key first.
          try {
            var found = await app.sp.items(CH.config.lists.notices.title,
              "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1);
            if (found.rows.length) { dlg.close(); app.noticePosted(key); return; }
          } catch (_) { /* fall through to the message */ }
          submit.disabled = false;
          submit.textContent = 'Try again';
          // The same client key is reused on retry, so a notice that did save is never duplicated.
          errorBox.textContent = error.status === 403
            ? 'SharePoint did not allow this notice to be posted. Your text has been kept.'
            : 'Your notice could not be posted just now. Your text has been kept – try again in a moment.';
        }
      });

      refreshArea();
      title.focus();
    }

    return { open: open, validate: validate, CATEGORIES: CATEGORIES };
  })();

  /* src/views/raise-form.js */
  // "Raise an action": a three-step guided form (plan C.9), then a summary. The action is created by the
  // request flow; until then the request shows as being recorded.
  CH.views = CH.views || {};
  CH.views.raiseForm = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var R = CH.rules;
    var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
    var STEPS = [
      { title: 'What needs doing?', keys: ['title', 'description'] },
      { title: 'Who will do it, and in which area?', keys: ['areaKey', 'ownerId'] },
      { title: 'By when?', keys: ['dueIso', 'priority'] },
      { title: 'Check and raise', keys: [] }
    ];

    function open(app, areaKey) {
      var m = app.model;
      var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key); });
      if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise actions.', 'info'); return; }
      var today = m.today;
      var step = 0;
      var key = CH.requests.newKey();

      var title = h('input', { id: 'ch-r-title', type: 'text', maxlength: '255', autocomplete: 'off' });
      var description = h('textarea', { id: 'ch-r-description', rows: '5', maxlength: '5000' });
      var area = h('select', { id: 'ch-r-areaKey' }, mine.map(function (a) {
        return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name });
      }));
      var owner = h('select', { id: 'ch-r-ownerId' });
      var due = h('input', { id: 'ch-r-dueIso', type: 'date', min: today, max: R.addYears(today, CH.config.maxDeadlineYears) });
      var priority = h('select', { id: 'ch-r-priority' }, R.PRIORITIES.map(function (p) { return h('option', { value: p, selected: p === 'Normal' ? true : null, text: p }); }));
      var closeOut = h('input', { id: 'ch-r-closeOut', type: 'checkbox' });
      var closeOutTouched = false;
      closeOut.addEventListener('change', function () { closeOutTouched = true; });
      priority.addEventListener('change', function () { if (!closeOutTouched) closeOut.checked = priority.value === 'High'; });

      function fillOwners() {
        var current = owner.value || String(app.person.SiteUserId);
        CH.dom.clear(owner);
        owner.appendChild(h('option', { value: '', text: 'Choose a person' }));
        m.ownersFor(area.value).forEach(function (p) {
          owner.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
            text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') + (CH.config.managementRoles.indexOf(p.role) >= 0 ? ' – ' + p.role : '') }));
        });
      }
      area.addEventListener('change', fillOwners);
      fillOwners();

      function values() {
        return { title: title.value, description: description.value, areaKey: area.value, ownerId: owner.value,
          dueIso: due.value, priority: priority.value, requiresCloseOut: closeOut.checked };
      }
      function errorsFor(keys) {
        var all = R.validateRaise(values(), {
          today: today, maxYears: CH.config.maxDeadlineYears, canWrite: app.access.canWrite,
          ownerAllowed: function (k, id) { return m.ownersFor(k).some(function (p) { return Number(p.id) === id; }); }
        });
        var out = {};
        keys.forEach(function (k) { if (all[k]) out[k] = all[k]; });
        return out;
      }

      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-r', title: 'Raise an action' });
      var progress = h('p', { class: 'muted small', 'aria-live': 'polite' });
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var stepBox = h('div');
      var nextBtn = h('button', { type: 'submit', class: 'btn btn-main' });
      var backBtn = h('button', { type: 'button', class: 'btn' });
      var form = h('form', { class: 'dialog-body', novalidate: true }, progress, stepBox, errorBox, h('div', { class: 'row' }, nextBtn, backBtn));
      dlg.body.appendChild(form);

      var panes = [
        [field('Title', title, 'A short summary, for example "Replace FH40 probe".'), field('Description', description, 'What needs doing and anything the owner should know.')],
        [field('Area', area), field('Who will do it?', owner, 'Members of the area, and Team Leaders and the Group Head.')],
        [field('Target date', due, 'From today up to ' + CH.config.maxDeadlineYears + ' years ahead.'),
          h('details', { class: 'more' }, h('summary', { text: 'More options' }),
            field('Priority', priority), h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'))],
        null
      ];

      function summary() {
        var v = values();
        var ownerName = m.nameOf(Number(v.ownerId));
        return h('dl', { class: 'facts' },
          h('dt', { text: 'What' }), h('dd', null, h('b', { text: v.title.trim() }), h('br'), h('span', { class: 'notice-body', text: v.description.trim() })),
          h('dt', { text: 'Who' }), h('dd', { text: ownerName + ', in ' + m.areaByKey[v.areaKey].name }),
          h('dt', { text: 'When' }), h('dd', { text: 'By ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) }),
          h('dt', { text: 'Also' }), h('dd', { text: v.priority + ' priority' + (v.requiresCloseOut ? ', with a close-out check' : '') }));
      }

      function go(n) {
        step = Math.max(0, Math.min(STEPS.length - 1, n));
        errorBox.textContent = '';
        progress.textContent = 'Step ' + (step + 1) + ' of ' + STEPS.length + ' – ' + STEPS[step].title;
        Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (x) { x.textContent = ''; });
        CH.dom.clear(stepBox);
        CH.dom.append(stepBox, panes[step] || summary());
        nextBtn.textContent = step === STEPS.length - 1 ? 'Raise action' : 'Next';
        backBtn.textContent = step === 0 ? 'Cancel' : 'Back';
        var first = stepBox.querySelector('input, select, textarea');
        if (first) first.focus(); else nextBtn.focus();
      }

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        if (step < STEPS.length - 1) {
          var errors = errorsFor(STEPS[step].keys);
          if (CH.ui.dialog.showErrors(form, 'ch-r-', errors, STEPS[step].keys)) return;
          go(step + 1);
          return;
        }
        var all = errorsFor(['title', 'description', 'areaKey', 'ownerId', 'dueIso', 'priority']);
        if (Object.keys(all).length) { errorBox.textContent = 'Something needs changing: ' + all[Object.keys(all)[0]]; return; }
        var v = values();
        nextBtn.disabled = true;
        nextBtn.textContent = 'Sending…';
        try {
          await app.tracker.submit({ key: key, type: 'RaiseAction', label: 'Raise “' + v.title.trim() + '”', payload: {
            areaKey: v.areaKey, title: v.title.trim(), description: v.description.trim(), ownerId: Number(v.ownerId),
            dueIso: v.dueIso, priority: v.priority, requiresCloseOut: v.requiresCloseOut } });
          dlg.close();
          CH.ui.toast(app.root, 'Your action has been sent. It will appear in a few minutes.', 'ok');
        } catch (error) {
          nextBtn.disabled = false;
          nextBtn.textContent = 'Try again';
          errorBox.textContent = 'Your action could not be sent just now. Nothing has been lost – try again in a moment.';
        }
      });
      backBtn.addEventListener('click', function () { if (step === 0) dlg.close(); else go(step - 1); });
      go(0);
    }

    return { open: open, STEPS: STEPS };
  })();

  /* src/views/action-panel.js */
  // One action (plan C.9): What, Who and When in plain words, three buttons, and its updates.
  // "Add an update" is an instant write; "I need more time" and "Mark as done" are queued requests.
  CH.views = CH.views || {};
  CH.views.actionPanel = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var R = CH.rules;
    var ui = CH.ui;
    var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };

    function timeOf(date) { return D.ukTime(date); }

    // The panel's line about a change in progress, rejected or not yet recorded.
    function pendingLine(app, action) {
      var entry = app.tracker.forTarget(action.id);
      if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
        return h('p', { class: 'pending', role: 'status' }, h('b', { text: entry.label }), ' – submitted ' + timeOf(entry.submittedAt) +
          ', being recorded (usually under 5 minutes).' + (entry.state === 'slow' ? ' ' + entry.message : ''));
      }
      if (entry && (entry.state === 'rejected' || entry.state === 'failed')) {
        return h('div', { class: 'section-note', role: 'alert' }, h('b', { text: entry.state === 'rejected' ? 'Not accepted: ' : 'Not recorded yet: ' }),
          entry.message + ' ', ui.linkButton('Dismiss', function () { app.tracker.dismiss(entry); }));
      }
      if (action.locked) return h('p', { class: 'pending', role: 'status', text: 'Being updated… Try again in a minute.' });
      return null;
    }

    var STATUS_WORDS = { 'Open': 'Open', 'In Progress': 'In progress', 'Awaiting Input': 'Waiting on something' };

    function whenText(action) {
      if (action.status === 'Closed') {
        return 'Closed' + (action.closedIso ? ' on ' + D.long(action.closedIso) : '') + (action.closeOutcome ? ' – ' + action.closeOutcome.toLowerCase() : '') + '.' +
          (action.closureNote ? ' “' + action.closureNote + '”' : '');
      }
      if (action.waitingCloseOut) return 'Done – waiting for a close-out check by ' + action.raisedByName + '.';
      var text = (action.group === 'late' ? 'Was due ' : 'Due ') + D.weekday(action.dueIso) + ' ' + D.long(action.dueIso) + '.';
      if (action.extensions) {
        text += ' Deadline moved ' + (action.extensions === 1 ? 'once' : action.extensions + ' times') +
          (action.originalIso !== action.dueIso ? ' (was ' + D.long(action.originalIso) + ').' : '.');
      }
      return text;
    }

    // Updates count only in the action's own folder, {area}/A{id} (plan F.5). Each query starts with an indexed
    // column (ParentId, RecordId), so it keeps working once the list passes 5,000 items.
    async function loadUpdates(app, action) {
      var res = await app.sp.items(CH.config.lists.updates.title,
        "$select=Id,EntryType,Body,AuthorId,Created,FileDirRef,IsHidden&$filter=ParentId eq " + action.id + " and ParentType eq 'Action'", 500);
      var folder = '/' + action.areaKey + '/A' + action.id;
      return res.rows.filter(function (u) {
        return !u.IsHidden && String(u.FileDirRef || '').slice(-folder.length) === folder && u.EntryType !== 'Flagged' && u.EntryType !== 'Flag Withdrawn';
      }).sort(function (a, b) { return b.Id - a.Id; });
    }

    async function loadExtensions(app, action) {
      var res = await app.sp.items(CH.config.lists.history.title,
        "$select=Id,EventType,ActorId,EventTime,PreviousDueDate,NewDueDate,Note,ExtensionNumber,IsOnBehalf&$filter=RecordId eq " + action.id + " and RecordType eq 'Action'", 500);
      return res.rows.filter(function (r) { return r.EventType === 'Deadline Extended'; })
        .sort(function (a, b) { return (a.ExtensionNumber || 0) - (b.ExtensionNumber || 0); });
    }

    function open(app, id) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-a', title: 'Action', wide: true, onClose: function () { app.panel = null; } });
      var view = 'main';
      var updates = null;
      var extensions = null;
      var notFound = false;

      // An open action comes with the page; a finished one is read on demand and kept in app.finished.
      function action() { return app.model.actionById[id] || (app.finished || {})[id]; }

      async function readMissing() {
        try {
          var row = await CH.model.loadAction(app.sp, id);
          if (row) { app.finished = app.finished || {}; app.finished[id] = app.model.actionFrom(row); }
        } catch (_) { /* shown as not available */ }
      }

      async function loadExtras() {
        var a = action();
        if (!a) return;
        try { updates = await loadUpdates(app, a); } catch (_) { updates = 'error'; }
        try { extensions = a.extensions ? await loadExtensions(app, a) : []; } catch (_) { extensions = []; }
        if (view === 'main' && dlg.isOpen()) fill();
      }

      function fill() {
        CH.dom.clear(dlg.body);
        var a = action();
        if (!a) {
          dlg.setTitle('Action not available');
          CH.dom.append(dlg.body, h('p', { text: notFound ? 'This action is not available. It may have been closed, or you may not have access to it.'
            : 'This action could not be found.' }));
          return;
        }
        var r = R.roles(a, app.person.SiteUserId, app.access);
        var entry = app.tracker.forTarget(a.id);
        var busy = a.locked || (entry && (entry.state === 'submitted' || entry.state === 'slow'));
        var finished = a.status === 'Closed' || a.waitingCloseOut;
        // the less common changes sit under "More options" (plan C.9), only those this person may make
        var more = [
          r.canStatus ? ui.linkButton('Change status', function () { show('status'); }) : null,
          r.canReassign ? ui.linkButton('Reassign', function () { show('reassign'); }) : null,
          r.canEdit ? ui.linkButton('Edit details', function () { show('edit'); }) : null,
          r.canClose && !a.waitingCloseOut ? ui.linkButton('Close with an outcome', function () { show('close'); }) : null
        ].filter(Boolean);
        dlg.setTitle(a.title);
        CH.dom.append(dlg.body, [
          h('p', { class: 'muted small', text: a.ref + ' · ' + a.areaName + (a.priority === 'High' ? ' · High priority' : '') }),
          pendingLine(app, a),
          h('dl', { class: 'facts' },
            h('dt', { text: 'When' }), h('dd', null, ui.chip(a.waitingCloseOut ? 'later' : a.group, a.dueText), ' ', whenText(a)),
            a.blocker ? [h('dt', { text: 'Waiting on' }), h('dd', { class: 'notice-body', text: a.blocker })] : null,
            h('dt', { text: 'Who' }), h('dd', { text: a.ownerName + ' is doing it. Raised by ' + a.raisedByName + (a.raisedIso ? ' on ' + D.long(a.raisedIso) : '') + '.' }),
            h('dt', { text: 'What' }), h('dd', { class: 'notice-body', text: a.description || 'No description.' })),
          extensions && extensions.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Show all deadline changes (' + extensions.length + ')' }),
            h('ul', { class: 'plain' }, extensions.map(function (x) {
              return h('li', null, h('span', null,
                h('s', { text: x.PreviousDueDate ? D.short(D.localDate(x.PreviousDueDate)) : '' }), ' → ', h('b', { text: x.NewDueDate ? D.long(D.localDate(x.NewDueDate)) : '' }),
                h('br'), h('span', { class: 'muted small', text: app.model.nameOf(x.ActorId) + (x.IsOnBehalf ? ' (on behalf of the owner)' : '') +
                  (x.EventTime ? ' · ' + D.short(D.localDate(x.EventTime)) : '') + ' · “' + (x.Note || '') + '”' })));
            }))) : null,
          h('div', { class: 'row actions-row' },
            r.canUpdate && !finished ? ui.button('Add an update', function () { show('update'); }, 'main') : null,
            r.canExtend ? ui.button('I need more time', function () { show('extend'); }) : null,
            r.canComplete ? ui.button('Mark as done', function () { show('complete'); }) : null,
            a.waitingCloseOut && r.canClose ? ui.button('Confirm close-out', function () { show('closeout'); }, 'main') : null,
            r.canReopen ? ui.button('Reopen', function () { show('reopen'); }) : null),
          more.length ? h('details', { class: 'more' }, h('summary', { text: 'More options' }), h('div', { class: 'row' }, more)) : null,
          !r.canUpdate && !r.canExtend && !r.canComplete && !r.canReopen ? h('p', { class: 'muted small', text: 'You can read this action. Only its owner, the people who manage it and members of ' + a.areaName + ' can change it.' }) : null,
          h('h3', { class: 'group-title', text: 'Updates' }),
          updates === null ? h('p', { class: 'muted', text: 'Loading updates…' })
            : updates === 'error' ? h('p', { class: 'section-note', text: 'Could not load the updates just now.' })
            : updates.length ? h('ul', { class: 'plain' }, updates.map(function (u) {
              return h('li', null, h('span', null, h('span', { class: 'notice-body', text: u.Body || '' }), h('br'),
                h('span', { class: 'muted small', text: app.model.nameOf(u.AuthorId) + ' · ' + D.short(D.localDate(u.Created)) + ' ' + D.ukTime(u.Created) +
                  (u.EntryType === 'Blocker' ? ' · blocker' : '') })));
            })) : h('p', { class: 'muted', text: 'No updates yet.' })
        ]);
        Array.prototype.forEach.call(dlg.body.querySelectorAll('.actions-row .btn, .more .btn-link'), function (b) { b.disabled = !!busy; });
      }

      function show(which) {
        view = which;
        CH.dom.clear(dlg.body);
        var a = action();
        if (which === 'update') updateForm(a);
        if (which === 'extend') extendForm(a);
        if (which === 'complete') completeForm(a);
        if (which === 'status') statusForm(a);
        if (which === 'reassign') reassignForm(a);
        if (which === 'close') closeForm(a, false);
        if (which === 'closeout') closeForm(a, true);
        if (which === 'reopen') reopenForm(a);
        if (which === 'edit') editForm(a);
        dlg.focusFirst();
      }
      function back() { view = 'main'; fill(); dlg.focusFirst(); }

      function formShell(title, fields, submitLabel, onSubmit) {
        var errorBox = h('p', { class: 'form-error', role: 'alert' });
        var submit = h('button', { type: 'submit', class: 'btn btn-main', text: submitLabel });
        var form = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: title }), fields, errorBox,
          h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: back })));
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          errorBox.textContent = '';
          submit.disabled = true;
          try {
            var ok = await onSubmit(form);
            if (!ok) submit.disabled = false;
          } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Try again';
            errorBox.textContent = error.status === 403
              ? 'SharePoint did not allow this change. Your text has been kept.'
              : 'This could not be sent just now. Your text has been kept – try again in a moment.';
          }
        });
        dlg.body.appendChild(form);
        return form;
      }

      function updateForm(a) {
        var body = h('textarea', { id: 'ch-u-body', rows: '5', maxlength: '2000' });
        var clientKey = CH.requests.newKey();
        formShell('Add an update', [field('Your update', body, 'What has happened, or what is next. Everyone who can see this action can read it.')], 'Save update',
          async function (form) {
            var errors = R.validateUpdate({ body: body.value });
            if (CH.ui.dialog.showErrors(form, 'ch-u-', errors, ['body'])) return false;
            var text = body.value.trim();
            try {
              await app.sp.addToFolder('updates', a.areaKey + '/A' + a.id, {
                Title: text.slice(0, 80), ClientKey: clientKey, ParentType: 'Action', ParentId: a.id,
                EntryType: 'Progress', IsFlagEvent: '0', IsHidden: '0', Body: text
              });
            } catch (error) {
              var found = await app.sp.items(CH.config.lists.updates.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1)
                .catch(function () { return { rows: [] }; });
              if (!found.rows.length) throw error;
            }
            ui.toast(app.root, 'Your update has been saved.', 'ok');
            updates = null;
            back();
            loadExtras();
            return true;
          });
      }

      function extendForm(a) {
        var today = app.model.today;
        var min = D.addDays(a.dueIso > today ? a.dueIso : D.addDays(today, -1), 1);
        var date = h('input', { id: 'ch-x-newDueIso', type: 'date', min: min, max: R.addYears(today, CH.config.maxDeadlineYears) });
        var reason = h('textarea', { id: 'ch-x-reason', rows: '4', maxlength: '1000' });
        var r = R.roles(a, app.person.SiteUserId, app.access);
        var effect = h('p', { class: 'explain', role: 'status' });
        function explain() {
          effect.textContent = (D.isIso(date.value) ? 'The new deadline will be ' + D.weekday(date.value) + ' ' + D.long(date.value) + '. ' : '') +
            'The original deadline (' + D.long(a.originalIso) + ') stays on record, and everyone who can see this action can read your reason.' +
            (r.owner ? '' : ' This will be recorded as done on behalf of ' + a.ownerName + '.');
        }
        date.addEventListener('input', explain);
        explain();
        formShell('I need more time', [
          h('p', { class: 'muted', text: 'Current deadline: ' + D.weekday(a.dueIso) + ' ' + D.long(a.dueIso) + '.' }),
          field('New deadline', date), field('Why?', reason, 'At least 10 characters.'), effect], 'Ask for more time',
          async function (form) {
            var v = { newDueIso: date.value, reason: reason.value };
            var errors = R.validateExtend(a, v, { today: today });
            if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
            if (CH.ui.dialog.showErrors(form, 'ch-x-', errors, ['newDueIso', 'reason'])) return false;
            await app.tracker.submit({ type: 'ExtendDeadline', targetId: a.id, expectedRevision: a.revision,
              payload: { newDueIso: v.newDueIso, reason: v.reason.trim(), expectedDueDay: a.dueDay }, label: 'New deadline ' + D.short(v.newDueIso) });
            back();
            return true;
          });
      }

      function completeForm(a) {
        var note = h('textarea', { id: 'ch-c-note', rows: '3', maxlength: '1000' });
        formShell('Mark as done', [
          h('p', { class: 'explain', text: a.requiresCloseOut
            ? 'It will then wait for a close-out check by ' + a.raisedByName + ' before it is closed.'
            : 'The action will be closed. It stays in the history of ' + a.areaName + '.' }),
          field('Anything to add? (optional)', note)], 'Mark as done',
          async function (form) {
            var errors = R.validateComplete(a, { note: note.value });
            if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
            if (CH.ui.dialog.showErrors(form, 'ch-c-', errors, ['note'])) return false;
            await app.tracker.submit({ type: 'MarkComplete', targetId: a.id, expectedRevision: a.revision,
              payload: { note: note.value.trim() }, label: 'Mark as done' });
            back();
            return true;
          });
      }

      // A queued change, sent with the revision the person saw; the panel then shows it as being recorded.
      async function send(form, type, payload, label, errors, order, prefix) {
        if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
        if (CH.ui.dialog.showErrors(form, prefix, errors, order)) return false;
        await app.tracker.submit({ type: type, targetId: id, expectedRevision: action().revision, payload: payload, label: label });
        back();
        return true;
      }

      function statusForm(a) {
        var status = h('select', { id: 'ch-s-status' }, R.OPEN_STATUSES.filter(function (st) { return st !== a.status; }).map(function (st) {
          return h('option', { value: st, text: STATUS_WORDS[st] });
        }));
        var blocker = h('textarea', { id: 'ch-s-blocker', rows: '3', maxlength: '1000' });
        var blockerField = field('What is it waiting on?', blocker, 'For example a part, a decision or another team. Everyone who can see this action can read it.');
        function toggle() { blockerField.style.display = status.value === 'Awaiting Input' ? '' : 'none'; }
        status.addEventListener('change', toggle);
        toggle();
        formShell('Change status', [h('p', { class: 'muted', text: 'Now: ' + STATUS_WORDS[a.status] + '.' }), field('New status', status), blockerField], 'Change status',
          function (form) {
            var v = { status: status.value, blocker: blocker.value };
            return send(form, 'ChangeStatus', { status: v.status, blocker: v.status === 'Awaiting Input' ? v.blocker.trim() : '' },
              'Status: ' + STATUS_WORDS[v.status].toLowerCase(), R.validateStatus(a, v), ['status', 'blocker'], 'ch-s-');
          });
      }

      function reassignForm(a) {
        var owners = app.model.ownersFor(a.areaKey).filter(function (o) { return Number(o.id) !== Number(a.ownerId); });
        var owner = h('select', { id: 'ch-g-ownerId' }, [h('option', { value: '', text: 'Choose a person' })].concat(owners.map(function (o) {
          return h('option', { value: String(o.id), text: o.name + (CH.config.managementRoles.indexOf(o.role) >= 0 ? ' – ' + o.role : '') });
        })));
        var reason = h('textarea', { id: 'ch-g-reason', rows: '3', maxlength: '1000' });
        formShell('Reassign', [h('p', { class: 'muted', text: 'Now: ' + a.ownerName + '. Both people get an email.' }),
          field('New owner', owner, 'Members of ' + a.areaName + ', and Team Leaders and the Group Head.'), field('Why?', reason, 'At least 10 characters.')], 'Reassign',
          function (form) {
            var v = { ownerId: owner.value ? Number(owner.value) : '', reason: reason.value };
            var allowed = { ownerAllowed: function (key, pid) { return app.model.ownersFor(key).some(function (o) { return Number(o.id) === pid; }); } };
            var name = (owners.filter(function (o) { return Number(o.id) === v.ownerId; })[0] || {}).name;
            return send(form, 'ReassignAction', { ownerId: v.ownerId, reason: v.reason.trim() }, 'Reassign to ' + name,
              R.validateReassign(a, v, allowed), ['ownerId', 'reason'], 'ch-g-');
          });
      }

      function closeForm(a, closeOut) {
        var outcome = h('select', { id: 'ch-l-outcome' }, R.OUTCOMES.map(function (o) { return h('option', { value: o, text: o }); }));
        var note = h('textarea', { id: 'ch-l-note', rows: '3', maxlength: '1000' });
        var outcomeField = field('Outcome', outcome);
        if (closeOut) outcomeField.style.display = 'none';
        formShell(closeOut ? 'Confirm close-out' : 'Close with an outcome', [
          h('p', { class: 'explain', text: closeOut ? a.ownerName + ' has marked this action as done. Closing it confirms the work is complete.'
            : 'The action will be closed. ' + a.ownerName + ' gets an email, and it stays in the history of ' + a.areaName + '.' }),
          outcomeField, field(closeOut ? 'Anything to add? (optional)' : 'Note', note, closeOut ? '' : 'Needed unless the outcome is Completed.')],
          closeOut ? 'Close the action' : 'Close', function (form) {
            var v = { outcome: closeOut ? 'Completed' : outcome.value, note: note.value };
            return send(form, 'CloseAction', { outcome: v.outcome, note: v.note.trim() }, 'Close: ' + v.outcome.toLowerCase(),
              R.validateClose(a, v), ['outcome', 'note'], 'ch-l-');
          });
      }

      function reopenForm(a) {
        var reason = h('textarea', { id: 'ch-o-reason', rows: '3', maxlength: '1000' });
        formShell('Reopen', [h('p', { class: 'explain', text: 'The action goes back to In progress with ' + a.ownerName + ', with its deadline unchanged.' }),
          field('Why?', reason, 'At least 10 characters.')], 'Reopen', function (form) {
          var v = { reason: reason.value };
          return send(form, 'ReopenAction', { reason: v.reason.trim() }, 'Reopen', R.validateReopen(a, v), ['reason'], 'ch-o-');
        });
      }

      function editForm(a) {
        var title = h('input', { id: 'ch-e-title', type: 'text', maxlength: '255', value: a.title });
        var description = h('textarea', { id: 'ch-e-description', rows: '5', maxlength: '5000' });
        description.value = a.description;
        var priority = h('select', { id: 'ch-e-priority' }, R.PRIORITIES.map(function (p) { return h('option', p === a.priority ? { value: p, selected: true, text: p } : { value: p, text: p }); }));
        var closeOut = h('input', { id: 'ch-e-closeout', type: 'checkbox' });
        closeOut.checked = a.requiresCloseOut;
        formShell('Edit details', [field('What needs doing', title), field('Description', description), field('Priority', priority),
          h('label', { class: 'check' }, closeOut, ' Needs a close-out check by the raiser before it is closed')], 'Save changes',
          function (form) {
            var v = {};
            if (title.value.trim() !== a.title) v.title = title.value.trim();
            if (description.value.trim() !== a.description) v.description = description.value.trim();
            if (priority.value !== a.priority) v.priority = priority.value;
            if (closeOut.checked !== a.requiresCloseOut) v.requiresCloseOut = closeOut.checked;
            return send(form, 'EditActionDetails', v, 'Edit details', R.validateEdit(a, v), ['title', 'description', 'priority'], 'ch-e-');
          });
      }

      async function refresh() {
        if (view !== 'main') return;
        updates = null;
        if (!action()) await readMissing();
        fill();
        loadExtras();
      }

      (action() ? Promise.resolve() : readMissing()).then(function () {
        notFound = !action();
        fill();
        dlg.focusFirst();
        loadExtras();
      });
      app.panel = { id: id, refresh: refresh };
    }

    return { open: open };
  })();

  /* src/views/my-actions.js */
  // My actions (plan B.3 ACT-09, K9.3): the actions I own, the ones I raised and, for people who manage, those in
  // their areas. One Area filter. Finished actions are read only when asked for ("Show finished items").
  CH.views = CH.views || {};
  CH.views.myActions = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;

    function tabsFor(app) {
      var me = app.person.SiteUserId;
      var tabs = [
        { label: 'Mine', who: 'AssignedToId', pick: function (a) { return Number(a.ownerId) === Number(me); } },
        { label: 'Raised by me', who: 'RaisedById', pick: function (a) { return Number(a.raisedById) === Number(me); } }
      ];
      var managed = app.model.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
      if (managed.length) {
        tabs.push({ label: app.access.isManagement ? 'All areas' : 'In my areas',
          pick: function (a) { return managed.some(function (k) { return app.model.inArea(a, k); }); } });
      }
      return tabs;
    }

    function finishedList(app, rows) {
      if (!rows.length) return h('p', { class: 'muted', text: 'No finished actions.' });
      app.finished = app.finished || {};
      return h('ul', { class: 'items' }, rows.map(function (row) {
        var a = app.model.actionFrom(row);
        app.finished[a.id] = a;
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
          h('span', null, h('span', { class: 't', text: a.title }),
            h('span', { class: 's', text: a.areaName + ' · ' + a.ownerName + (a.closeOutcome ? ' · ' + a.closeOutcome.toLowerCase() : '') })),
          ui.chip('done', a.closedIso ? 'Closed ' + D.short(a.closedIso) : 'Closed')));
      }));
    }

    function render(app) {
      var st = app.state;
      var tabs = tabsFor(app);
      var tab = Math.min(st.tab || 0, tabs.length - 1);
      var areaKey = st.areaFilter || '';
      var list = app.model.actions.filter(tabs[tab].pick).filter(function (a) { return !areaKey || app.model.inArea(a, areaKey); });
      var bar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'My actions' }, tabs.map(function (t, i) {
        return h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), tabindex: i === tab ? '0' : '-1', text: t.label,
          onclick: function () { app.showMine(i, areaKey); },
          onkeydown: function (e) {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            app.showMine((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, areaKey, true);
          } });
      }));
      var filter = h('select', { id: 'ch-m-area', 'aria-label': 'Area', onchange: function (e) { app.showMine(tab, e.target.value); } },
        [h('option', { value: '', text: 'All areas' })].concat(app.model.areas.map(function (a) {
          return h('option', a.key === areaKey ? { value: a.key, selected: true, text: a.name } : { value: a.key, text: a.name });
        })));
      var finished = h('div', { class: 'finished' });
      if (tabs[tab].who) {
        finished.appendChild(ui.linkButton('Show finished items', async function (e) {
          e.target.disabled = true;
          e.target.textContent = 'Loading finished items…';
          try {
            var rows = await CH.model.loadFinished(app.sp, tabs[tab].who, app.person.SiteUserId);
            rows = rows.filter(function (r) { return !areaKey || (app.model.areas.filter(function (x) { return x.id === r.CompetencyId; })[0] || {}).key === areaKey; });
            CH.dom.clear(finished);
            CH.dom.append(finished, [h('h3', { class: 'group-title', text: 'Finished' }), finishedList(app, rows)]);
          } catch (_) {
            e.target.disabled = false;
            e.target.textContent = 'Could not load finished items – try again';
          }
        }));
      }
      return [
        h('div', { class: 'row' }, ui.linkButton('‹ Overview', app.goHome)),
        h('h1', { text: 'My actions' }),
        h('div', { class: 'row' }, h('label', { for: 'ch-m-area', text: 'Area ' }), filter),
        bar,
        h('div', { class: 'panel', role: 'tabpanel' },
          ui.sectionNote(app.model.sections.actions, 'actions'),
          ui.actionList(list, function (a) { return a.areaName + (tab === 0 ? '' : ' · ' + a.ownerName) + (a.blocker ? ' · waiting on something' : ''); },
            tab === 0 ? 'You have no open actions. Nice work.' : 'No open actions here.', app.model.sections.actions, app.openAction, app.pendingNote),
          finished)
      ];
    }

    return { render: render };
  })();

  /* src/app.js */
  // Application controller: Welcome lifecycle, identity, loading and navigation.
  CH.app = (function () {
    var h = CH.dom.h;

    function create(ctx) {
      var started = false;
      var disposed = false;
      var observer = null;
      var app = { state: { view: 'home', area: null, tab: 0 } };

      function findRoot() { return document.querySelector('[data-ch-root]'); }

      function waitForRoot() {
        return new Promise(function (resolve, reject) {
          var tries = 0;
          (function look() {
            var root = findRoot();
            if (root) return resolve(root);
            if (++tries > 50) return reject(new Error('The Competency Hub layout did not load.'));
            setTimeout(look, 100);
          })();
        });
      }

      // The layout carries the version it was built with. A different script version means the browser kept an
      // old copy of one of the two files (plan K7.9).
      function staleCopy() {
        var built = app.root && app.root.getAttribute && app.root.getAttribute('data-ch-version');
        return !!built && built !== CH.config.VERSION;
      }

      function frame(content) {
        var C = CH.config;
        return [
          app.stale ? h('p', { class: 'stale-copy', role: 'alert' }, h('b', { text: 'A newer version of the Competency Hub is available. ' }),
            'Press Ctrl+F5 to load it. Until then some buttons may not work.') : null,
          h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
            h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
            C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
            app.person ? h('span', { class: 'who', text: app.person.Title + ' · ' + app.person.Role }) : null,
            textSizeControl())),
          h('main', { id: 'ch-main', tabindex: '-1' }, content),
          h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
          h('footer', { text: 'ESG Competency Hub · version ' + C.VERSION })
        ];
      }

      function applySize() {
        if (!app.root || !app.root.style) return;
        app.root.style.setProperty('--scale', String(CH.ui.scaleFor(app.root.clientWidth || 0)));
        app.root.style.setProperty('--text', String(CH.ui.textFactor(CH.ui.textSize())));
      }

      // Follows the width Welcome gives the app; nothing else is observed.
      function watchSize() {
        applySize();
        if (typeof window.ResizeObserver === 'function') {
          observer = new window.ResizeObserver(function () { if (!disposed) applySize(); });
          observer.observe(app.root);
        } else {
          window.addEventListener('resize', applySize);
        }
      }

      function textSizeControl() {
        var current = CH.ui.textSize();
        return h('label', { class: 'textsize' }, 'Text size ',
          h('select', {
            'aria-label': 'Text size',
            onchange: function (e) { CH.ui.saveTextSize(e.target.value); applySize(); }
          }, CH.ui.TEXT_SIZES.map(function (t) {
            return h('option', t[0] === current ? { value: t[0], selected: 'selected' } : { value: t[0] }, t[0]);
          })));
      }

      // The page is repainted inside app.shell; dialogs live in app.layer, so an open dialog keeps its focus.
      function paint(content) {
        if (disposed) return;
        if (!app.shell || app.shell.parentNode !== app.root) {
          CH.dom.clear(app.root);
          app.shell = h('div', { class: 'shell' });
          app.layer = h('div', { class: 'layer' });
          CH.dom.append(app.root, [app.shell, app.layer]);
        }
        CH.dom.clear(app.shell);
        CH.dom.append(app.shell, frame(content));
      }

      // Raised actions being recorded, changes that were not accepted, and requests that never left the browser.
      function requestStrip() {
        if (!app.tracker) return null;
        var items = app.tracker.entries().filter(function (e) {
          if (e.dismissed) return false;
          if (e.type === 'RaiseAction') return e.state !== 'done';
          return e.state === 'rejected' || e.state === 'failed';
        }).map(function (e) {
          var waiting = e.state === 'submitted' || e.state === 'slow';
          return h('li', { class: waiting ? 'pending' : 'section-note' }, h('b', { text: e.label }),
            waiting ? ' – submitted ' + CH.dates.ukTime(e.submittedAt) + ', being recorded (usually under 5 minutes).' + (e.state === 'slow' ? ' ' + e.message : '')
              : ' – ' + (e.state === 'rejected' ? 'not accepted: ' : 'not recorded yet: ') + e.message + ' ',
            waiting ? null : CH.ui.linkButton('Dismiss', function () { app.tracker.dismiss(e); }));
        });
        var unsent = app.tracker.unsent();
        if (unsent.length) {
          items.push(h('li', { class: 'section-note' }, h('b', { text: unsent.length === 1 ? '1 change was not sent. ' : unsent.length + ' changes were not sent. ' }),
            'Your connection dropped before it reached SharePoint. ', CH.ui.linkButton('Send again', async function () {
              try { await app.tracker.resend(); render(false); } catch (_) { CH.ui.toast(app.root, 'Still could not send. Try again in a moment.', 'info'); }
            })));
        }
        return items.length ? h('ul', { class: 'request-strip', 'aria-live': 'polite' }, items) : null;
      }

      function onRequestChange(entry) {
        if (entry.state !== 'done') { render(false); if (app.panel) app.panel.refresh(); return; }
        reload().then(function () {
          render(false);
          if (app.panel) app.panel.refresh();
          var a = app.model.actionById[entry.resultId];
          CH.ui.toast(app.root, entry.type === 'RaiseAction' && a ? a.ref + ' raised: ' + a.title + '.' : entry.message, 'ok');
        }).catch(function () { CH.ui.toast(app.root, entry.message + ' Reload the page to see it.', 'ok'); });
      }

      function stateScreen(title, message, detail) {
        paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
          detail ? h('p', { class: 'muted small', text: detail }) : null));
      }

      app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
      app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
      app.showMine = function (tab, areaKey, keepFocus) {
        app.state = { view: 'mine', area: null, tab: tab || 0, areaFilter: areaKey || '' };
        render(!keepFocus);
        if (keepFocus) { var t = app.root.querySelector('.subtabs [aria-selected="true"]'); if (t) t.focus(); }
      };
      app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
      app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
      app.raiseAction = function (key) { CH.views.raiseForm.open(app, key); };
      app.openAction = function (a) { CH.views.actionPanel.open(app, a.id); };
      app.pendingNote = function (a) {
        var e = app.tracker && app.tracker.forTarget(a.id);
        if (e && (e.state === 'submitted' || e.state === 'slow')) return 'change being recorded';
        if (e && e.state === 'rejected') return 'change not accepted';
        return a.locked ? 'being updated' : '';
      };
      app.noticePosted = async function (key) {
        await reload();
        if (app.state.view === 'area' && app.state.area === key) app.state.tab = 1;
        render(false);
        CH.ui.toast(app.root, 'Your notice has been posted on the ' + app.model.areaByKey[key].name + ' noticeboard.', 'ok');
      };

      function render(moveFocus) {
        if (!app.model) return;
        var content = [requestStrip(), app.state.view === 'area' && app.model.areaByKey[app.state.area]
          ? CH.views.area.render(app, app.state.area, app.state.tab)
          : app.state.view === 'mine' ? CH.views.myActions.render(app) : CH.views.home.render(app)];
        paint(content);
        if (moveFocus) {
          var main = app.root.querySelector('#ch-main');
          if (main) main.focus();
          window.scrollTo(0, 0);
        }
      }

      async function reload() {
        var raw = await CH.model.load(app.sp);
        var now = new Date();
        var today = CH.dates.localDate(now);
        var memberships = (raw.members.rows || [])
          .filter(function (m) { return Number(m.PersonId) === Number(app.person.SiteUserId); })
          .map(function (m) {
            var c = (raw.competencies.rows || []).filter(function (x) { return x.Id === m.CompetencyId; })[0];
            return c ? { areaKey: c.CompetencyKey, canManageMeetings: !!m.CanManageMeetings } : null;
          }).filter(Boolean);
        var areasByKey = {};
        (raw.competencies.rows || []).forEach(function (c) { areasByKey[c.CompetencyKey] = { status: c.Status }; });
        if (raw.competencies.error !== undefined) throw new CH.sp.SpError(raw.competencies.error, 'The list of areas could not be loaded.');
        if (raw.members.error !== undefined) throw new CH.sp.SpError(raw.members.error, 'Area memberships could not be loaded.');
        app.access = CH.access.build(app.person, memberships, areasByKey);
        app.model = CH.model.build(raw, app.people, app.access, today, now);
      }

      async function start() {
        app.root = await waitForRoot();
        app.stale = staleCopy();
        watchSize();
        var webPart = ctx.getWebPart();
        if (!webPart || !webPart.spHttpClient || !webPart.pageContext || !webPart.pageContext.web) {
          throw new Error('Welcome did not provide a SharePoint connection.');
        }
        app.sp = CH.sp.create(webPart);
        stateScreen('Loading the Competency Hub…', 'Checking your access.');

        // Identity fails closed: any doubt shows a message, never operational data.
        var user, people;
        try {
          user = await app.sp.currentUser();
          people = (await app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,Status')).rows;
        } catch (error) {
          stateScreen('We could not confirm your access', CH.access.MESSAGES.UNAVAILABLE + ' Please reload the page. If this keeps happening, contact a Competency Hub administrator.',
            'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
          return;
        }
        var identity = CH.access.resolveIdentity(user, people);
        if (!identity.ok) {
          var admins = people.filter(function (p) { return p.IsAdministrator && p.Status === 'Active'; }).map(function (p) { return p.Title; });
          stateScreen('You do not have access yet', CH.access.MESSAGES[identity.reason] + ' ' +
            (admins.length ? 'Please contact ' + admins.join(' or ') + '.' : 'Please contact a Competency Hub administrator.'));
          return;
        }
        app.person = identity.person;
        app.people = people;
        app.firstName = await app.sp.myFirstName();
        app.tracker = CH.requests.tracker(app, onRequestChange);
        try {
          await Promise.all([reload(), app.tracker.resume().catch(function () { return 0; })]);
        } catch (error) {
          stateScreen('The Competency Hub could not load', 'Some of the information could not be read. Please reload the page in a few minutes.',
            'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var areaParam = (params.get('area') || '').toUpperCase();
        if (app.model.areaByKey[areaParam]) app.state = { view: 'area', area: areaParam, tab: 0 };
        if (params.get('view') === 'mine') app.state = { view: 'mine', area: null, tab: 0, areaFilter: '' };
        render(false);
        var actionParam = Number(params.get('action'));
        if (actionParam) CH.views.actionPanel.open(app, actionParam);
      }

      return {
        onInitialize: function () {
          if (started) return;
          started = true;
          start().catch(function (error) {
            var root = findRoot();
            if (root) {
              app.root = root;
              stateScreen('The Competency Hub could not start', 'Please reload the page. If this keeps happening, contact a Competency Hub administrator.', String(error && error.message || error));
            }
          });
        },
        onError: function (error) {
          if (window.console) console.error('Competency Hub: Welcome reported an error', error);
        },
        onDispose: function () {
          disposed = true;
          if (app.tracker) app.tracker.stop();
          if (observer) observer.disconnect();
          window.removeEventListener('resize', applySize);
        }
      };
    }

    return { create: create };
  })();

  return CH.app.create(ctx);
};
