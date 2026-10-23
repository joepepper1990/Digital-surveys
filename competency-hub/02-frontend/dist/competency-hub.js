/* ESG Competency Hub 0.6.0 – built from src/ by tools/build.js. Do not edit. */
window.ESGCompetencyHub = function (ctx) {
  'use strict';
  var CH = {};
  /* src/core/config.js */
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '0.6.0',
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
      settings: { title: 'Competency Hub Settings', url: 'Settings' }
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

  /* src/core/names.js */
  // People's names for display. The directory stores names surname first ("Pepper Joseph"); addresses are
  // firstname.lastname@, so the first name from the address tells us which word to move to the front.
  CH.names = (function () {
    function display(title, email) {
      var name = String(title || '').trim();
      var local = String(email || '').split('@')[0].toLowerCase();
      var first = /^[a-z][a-z'-]*[.]/.test(local) ? local.split('.')[0] : '';
      var words = name.split(/\s+/);
      if (!first || words.length < 2) return name;
      if (words[0].toLowerCase() === first) return name;
      if (words[words.length - 1].toLowerCase() === first) return [words[words.length - 1]].concat(words.slice(0, -1)).join(' ');
      return name;
    }
    return { display: display };
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
    var STOP_MINUTES = 120;
    // Still on its way: waiting, being processed, or failed and being retried by the queue monitor (spec REL-2).
    var OPEN_STATUSES = ['Submitted', 'Processing', 'Failed'];
    // An administrator's decision about another change: it is confirmed by its own request alone.
    var ADMIN_TYPES = ['RetryTransaction', 'CancelTransaction', 'RevertTransaction', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson', 'UpdateSetting'];

    // Thrown instead of sending while automatic processing is down (limited mode).
    function LimitedError(message) { this.name = 'LimitedError'; this.message = message; this.friendly = message; }
    LimitedError.prototype = Object.create(Error.prototype);

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
        if (ADMIN_TYPES.indexOf(spec.type) < 0 && app.queueBlocked && app.queueBlocked()) {
          throw new LimitedError('Changes cannot be processed at the moment, so nothing was sent. You can still read everything and add updates. Please try again later.');
        }
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
        var statuses = OPEN_STATUSES.concat(['Needs attention', 'Cancelled', 'Reverted']);
        // a change an administrator cancelled or reverted is shown once more after a reload, for a day
        var since = new Date(Date.now() - 24 * 3600000).toISOString();
        for (var i = 0; i < statuses.length; i++) {
          var recent = statuses[i] === 'Cancelled' || statuses[i] === 'Reverted' ? " and Modified ge datetime'" + since + "'" : '';
          var res = await app.sp.items(CH.config.lists.requests.title, '$select=Id,Title,RequestKey,RequestType,TargetId,Created' +
            "&$filter=Status eq '" + statuses[i] + "' and AuthorId eq " + Number(app.person.SiteUserId) + recent, 100);
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
        // waiting in the queue, or being worked on now (spec REL-2)
        if ((status === 'Processing') !== !!entry.processing) {
          entry.processing = status === 'Processing';
          onChange(entry);
        }
        if (status === 'Rejected') return settle(entry, 'rejected', row.ResultMessage || 'This change was not accepted.');
        // Honest states (spec REL-2): only Completed, confirmed on the record, ever reads as saved.
        if (status === 'Needs attention') {
          return settle(entry, 'attention', row.ResultMessage || 'Not recorded – an administrator has been told.');
        }
        if (status === 'Cancelled') return settle(entry, 'cancelled', row.ResultMessage || 'Cancelled by an administrator. Nothing was changed.');
        if (status === 'Reverted') return settle(entry, 'reverted', row.ResultMessage || 'Reverted by an administrator.');
        if (status === 'Completed' && await confirmed(entry, row)) {
          entry.resultId = row.ResultId || entry.targetId;
          return settle(entry, 'done', row.ResultMessage || 'Recorded.');
        }
        var minutes = (Date.now() - entry.submittedAt.getTime()) / 60000;
        var retrying = status === 'Failed';
        if (retrying && entry.message !== RETRYING) {
          entry.message = RETRYING;
          entry.retrying = true;
          onChange(entry);
        } else if (!retrying && entry.retrying) {
          entry.retrying = false;
          entry.message = '';
          onChange(entry);
        }
        if (minutes >= GIVE_UP_MINUTES && entry.state !== 'slow') {
          entry.state = 'slow';
          if (!retrying) entry.message = 'This is taking longer than usual. It will be recorded; you can keep working.';
          onChange(entry);
        }
        if (minutes >= STOP_MINUTES) return;   // the page stops asking; a reload shows where it has got to
        schedule(entry);
      }

      // The action itself must show this change, with no lock left on it.
      async function confirmed(entry, row) {
        if (ADMIN_TYPES.indexOf(entry.type) >= 0) return true;
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
        if (state === 'attention') watchAttention(entry);
      }

      // A change that needs an administrator: every few minutes, see whether they have tried it again (it is then
      // followed as before) or cancelled or reverted it.
      function watchAttention(entry) {
        if (stopped) return;
        timers.push(setTimeout(async function () {
          if (stopped || entry.state !== 'attention') return;
          var row = null;
          try { row = await findRequest(entry.key); } catch (_) { row = null; }
          var status = row && row.Status;
          if (OPEN_STATUSES.indexOf(status) >= 0) {
            entry.state = 'submitted';
            entry.message = '';
            entry.retrying = false;
            entry.polls = 0;
            entry.submittedAt = new Date();
            onChange(entry);
            return schedule(entry);
          }
          if (status === 'Needs attention' || !status) return watchAttention(entry);
          entry.state = 'submitted';
          poll(entry);
        }, 5 * 60000));
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

    var RETRYING = 'Not recorded yet – retrying automatically.';

    return { tracker: tracker, newKey: newKey, SCHEDULE: SCHEDULE, GIVE_UP_MINUTES: GIVE_UP_MINUTES, ADMIN_TYPES: ADMIN_TYPES,
      LimitedError: LimitedError, RETRYING: RETRYING };
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
        // Every active user may post on any active area's noticeboard unless an administrator has turned
        // their "Can post notices" switch off (spec §4.4); SharePoint enforces the same through Notice Posters.
        canPostNotice: function (key) { return active(key) && person.CanPostNotices !== false; },
        isTechnician: role === 'Technician',
        // An engineer who is a member of the area.
        isEngineerIn: function (key) { return active(key) && role === 'Engineer' && !!member[key]; },
        // "Can run meetings" in this area, set for each person and area by an administrator (spec §4).
        chairs: function (key) { return active(key) && !!member[key] && !!meetingAdmin[key]; },
        // Areas whose actions this person looks after (for the lists that gather them): management, engineers, meeting runners.
        canManage: function (key) {
          return active(key) && (management || (!!member[key] && (role === 'Engineer' || !!meetingAdmin[key])));
        },
        runsMeetings: function (key) { return active(key) && (management || (!!member[key] && !!meetingAdmin[key])); },
        // Moderating others' notices and comments: engineers of the area and management – never meeting rights alone.
        canModerate: function (key) { return active(key) && (management || (role === 'Engineer' && !!member[key])); },
        // A technician without meeting rights in the area may raise actions only for themselves (spec §4.2).
        canRaiseFor: function (key, ownerId, selfId) {
          if (!active(key) || !(management || !!member[key])) return false;
          return role !== 'Technician' || !!meetingAdmin[key] || Number(ownerId) === Number(selfId);
        }
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

    // Mark complete closes the action unless a close-out check is required (D-07).
    function completionStatus(requiresCloseOut) { return requiresCloseOut ? 'Completed' : 'Closed'; }

    return {
      addYears: addYears, isOpen: isOpen, validateRaise: validateRaise, validateExtend: validateExtend,
      validateComplete: validateComplete, validateUpdate: validateUpdate, validateStatus: validateStatus,
      validateReassign: validateReassign, validateClose: validateClose, validateReopen: validateReopen, validateEdit: validateEdit,
      roles: roles, completionStatus: completionStatus, SELF_ONLY: SELF_ONLY, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES, OUTCOMES: OUTCOMES
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
      calendar: "$select=Id,Title,StartTime,AllDay,IsImportant,Status,FileDirRef&$filter=Status eq 'Scheduled' and FSObjType eq 0",
      settings: '$select=Id,Title,Value'
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
      function nameOf(id) { var p = personBySiteId[id]; return p ? CH.names.display(p.Title, p.Email) : 'Unknown person'; }

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
        }).map(function (p) { return { id: p.SiteUserId, name: CH.names.display(p.Title, p.Email), role: p.Role }; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });
      }
      var actionById = {};
      actions.forEach(function (a) { actionById[a.id] = a; });

      return {
        today: today, areas: areas, areaByKey: areaByKey, stats: stats, actions: actions, notices: notices, calendar: calendar,
        inArea: inArea, nameOf: nameOf, ownersFor: ownersFor, actionById: actionById, actionFrom: actionFrom, membersByArea: membersByArea,
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

    return { QUERIES: QUERIES, load: load, build: build, isUncommitted: isUncommitted, loadFinished: loadFinished, loadAction: loadAction };
  })();

  /* src/domain/health.js */
  // Whether the automatic processing behind the Hub is working (spec REL-5). The queue monitor writes its
  // findings to the Settings row QueueHealth; Daily tasks writes LastDailyRun. The app judges both itself, so a
  // monitor that has stopped is noticed too: its report simply goes stale. Each part is judged on its own –
  // stale reminders never stop people changing actions.
  CH.health = (function () {
    var DAILY_LIMIT_HOURS = 26;
    var WORKING_SLACK_MINUTES = 45;

    function value(rows, title) {
      var row = (rows || []).filter(function (r) { return r.Title === title; })[0];
      return row && row.Value ? String(row.Value) : '';
    }

    // "07:00|19:45|60": working hours start and end, and minutes between checks outside them.
    function hours(text) {
      var p = String(text || '').split('|');
      var minutes = function (hhmm, fallback) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
        return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
      };
      return { start: minutes(p[0], 7 * 60), end: minutes(p[1], 19 * 60 + 45), interval: Math.max(15, Number(p[2]) || 60) };
    }

    // MaxDeadlineYears: a whole number from 1 to 5, as the flow accepts it; 2 when missing or unreadable.
    function years(text) {
      var n = /^\d{1,2}$/.test(String(text || '').trim()) ? Number(text) : 0;
      return n >= 1 && n <= 5 ? n : CH.config.maxDeadlineYears;
    }

    function ukClock(now) {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(now);
      var get = function (type) { return (parts.filter(function (p) { return p.type === type; })[0] || {}).value; };
      return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
    }

    function parse(text) {
      if (!text) return null;
      try { return JSON.parse(text); } catch (_) { return null; }
    }

    // rows: Settings rows { Title, Value }. Returns { processing, reminders, reason, checkedAt, lastDailyRun, attention }:
    // processing 'ok' | 'down' | 'unknown' (the monitor has never reported: nothing is blocked); reminders 'ok' | 'stale' | 'unknown'.
    function judge(rows, now) {
      now = now || new Date();
      var report = parse(value(rows, 'QueueHealth'));
      var h = hours(value(rows, 'MonitorHours'));
      var clock = ukClock(now);
      var weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(clock.weekday) >= 0;
      // The tighter limit starts only once the first working-hours check has had time to report: until then the
      // latest report may be the last one from outside working hours.
      var working = weekday && clock.minutes >= h.start + WORKING_SLACK_MINUTES && clock.minutes <= h.end;
      var out = { processing: 'unknown', reminders: 'unknown', administration: 'ok', adminReason: '', reason: '', checkedAt: null, lastDailyRun: null,
        attention: 0, maxDeadlineYears: years(value(rows, 'MaxDeadlineYears')) };
      if (report && report.checkedAt) {
        out.checkedAt = new Date(report.checkedAt);
        out.attention = Number(report.attention) || 0;
        var limit = working ? WORKING_SLACK_MINUTES : h.interval + WORKING_SLACK_MINUTES;
        var age = (now.getTime() - out.checkedAt.getTime()) / 60000;
        if (report.state === 'Down') { out.processing = 'down'; out.reason = report.reason || 'Changes are not being processed.'; }
        else if (age > limit) { out.processing = 'down'; out.reason = 'The queue monitor has not reported since ' + CH.dates.ukTime(out.checkedAt) + '.'; }
        else out.processing = 'ok';
        // Administration changes go through their own flow: when only that one is behind, staff can carry on.
        if (report.admin === 'Down') { out.administration = 'down'; out.adminReason = report.adminReason || 'Administration changes are not being picked up.'; }
      }
      var daily = value(rows, 'LastDailyRun');
      if (daily) {
        out.lastDailyRun = new Date(daily);
        out.reminders = (now.getTime() - out.lastDailyRun.getTime()) / 3600000 > DAILY_LIMIT_HOURS ? 'stale' : 'ok';
      }
      return out;
    }

    return { judge: judge, hours: hours };
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


    // Collapsed sections on the home page, remembered in this browser only (storage may be unavailable).
    var FOLD_KEY = 'esg-competency-hub-home';
    function folded() {
      try { return JSON.parse(window.localStorage.getItem(FOLD_KEY)) || {}; } catch (_) { return {}; }
    }
    function saveFolded(state) { try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(state)); } catch (_) { /* not remembered */ } }

    // One home panel: a header button (title, summary, arrow), an optional link, and a body.
    function panel(id, title, summary, body, opts) {
      var o = opts || {};
      var closed = !!o.closed;
      var bodyId = 'ch-hp-' + id;
      var arrow = h('span', { class: 'hm-chev', 'aria-hidden': 'true', text: '›' });
      return h('section', { class: 'hm-panel' + (closed ? ' closed' : '') + (o.extraClass ? ' ' + o.extraClass : ''), 'data-panel': id },
        h('div', { class: 'hm-ph' },
          h('button', { type: 'button', class: 'hm-tg', 'aria-expanded': String(!closed), 'aria-controls': bodyId, onclick: o.onToggle },
            h('h2', { text: title }), h('span', { class: 'hm-sum', text: summary }), arrow),
          o.link ? linkButton(o.link[0], o.link[1]) : null),
        h('div', { class: 'hm-pb', id: bodyId }, body));
    }

    // A list that shows only the items that fit, then "+ n more". It never scrolls and never cuts an item.
    var fits = [];
    function fitList(items, moreLabel, onMore, extraClass) {
      var list = h('div', { class: 'hm-fit' + (extraClass ? ' ' + extraClass : '') }, items);
      var more = h('button', { type: 'button', class: 'btn-link hm-more', onclick: onMore });
      function fit() {
        items.forEach(function (x) { x.hidden = false; });
        more.hidden = true;
        if (!list.isConnected || getComputedStyle(list).overflow === 'visible') return;
        var over = function () { return list.scrollHeight > list.clientHeight + 1; };
        if (!over()) return;
        more.hidden = false;
        var shown = items.length;
        while (shown > 0 && over()) { shown--; items[shown].hidden = true; }
        if (shown === items.length) { more.hidden = true; return; }
        more.textContent = shown ? '+ ' + (items.length - shown) + ' more – ' + moreLabel : items.length + ' – ' + moreLabel;
      }
      var entry = { fit: fit, observer: null };
      if (typeof window.ResizeObserver === 'function') {
        var last = -1;
        entry.observer = new window.ResizeObserver(function () { if (list.clientHeight !== last) { last = list.clientHeight; fit(); } });
        entry.observer.observe(list);
      }
      fits.push(entry);
      more.hidden = true;
      return [list, more];
    }
    function refit() { fits.forEach(function (f) { f.fit(); }); }
    function resetFits() { fits.forEach(function (f) { if (f.observer) f.observer.disconnect(); }); fits = []; }

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
      actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast,
      folded: folded, saveFolded: saveFolded, panel: panel, fitList: fitList, refit: refit, resetFits: resetFits
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
  // The home page ("My week", approved 23 October 2026): it fits the window without scrolling. Sections are
  // panels that collapse to their header; lists show what fits, then "+ n more". The ten area tiles open an
  // area in place, and the other sections fold away to make room for it.
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

    // Administrators see at once when something needs them (spec REL-4, REL-5).
    function adminLine(app) {
      if (!app.access.isAdministrator) return null;
      var hl = app.health || {};
      var notes = [];
      if (hl.attention) notes.push(hl.attention + (hl.attention === 1 ? ' change needs' : ' changes need') + ' your attention.');
      if (hl.processing === 'down') notes.push('Automatic processing is not working.');
      if (hl.processing === 'unknown') notes.push('The queue monitor has not reported yet.');
      if (hl.reminders === 'stale') notes.push('Reminders have not run for more than a day.');
      return h('p', { class: notes.length ? 'section-note admin-line' : 'admin-line muted' }, notes.length ? h('b', { text: notes.join(' ') + ' ' }) : 'Everything is running. ',
        ui.linkButton('Open Administration', app.showAdmin));
    }

    function byDue(a, b) { return a.dueIso.localeCompare(b.dueIso); }

    // A uniform card: title on one line, then a meta line with chips. Opens the action when given one.
    function actionCard(app, a, meta) {
      var note = app.pendingNote(a);
      return h('button', { type: 'button', class: 'item-open hm-card', title: a.title, onclick: function () { app.openAction(a); } },
        h('span', { class: 't', text: a.title }),
        h('span', { class: 'hm-meta' }, meta, note ? h('span', { class: 'hm-note', text: note }) : null,
          h('span', { class: 'when w-' + (a.waitingCloseOut ? 'later' : a.group), text: a.dueText })));
    }
    function infoCard(text, kind, kindClass, onclick) {
      return h(onclick ? 'button' : 'div', onclick ? { type: 'button', class: 'item-open hm-card', title: text, onclick: onclick } : { class: 'hm-card', title: text },
        h('span', { class: 't', text: text }), h('span', { class: 'hm-meta' }, h('span', { class: 'when w-' + (kindClass || 'later'), text: kind })));
    }

    function lane(title, colour, cards, emptyText, onMore) {
      var body = cards.length ? ui.fitList(cards, 'see all', onMore, 'items') : h('p', { class: 'hm-empty', text: emptyText });
      return h('div', { class: 'hm-lane' },
        h('h3', null, h('span', { class: 'dot', style: 'background:' + colour, 'aria-hidden': 'true' }), title, h('span', { class: 'hm-count', text: String(cards.length) })),
        body);
    }

    // Engineers: what they look after in their areas (close-out checks, late work, flags, overdue meetings).
    function manageCards(app) {
      var m = app.model;
      var keys = m.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
      var cards = [];
      var mineInAreas = m.actions.filter(function (a) { return keys.some(function (k) { return m.inArea(a, k); }); });
      mineInAreas.filter(function (a) { return a.waitingCloseOut; }).forEach(function (a) {
        cards.push(infoCard(a.title + ' is done – check and close it', 'Close-out check', 'later', function () { app.openAction(a); }));
      });
      mineInAreas.filter(function (a) { return a.group === 'late' && a.ownerId !== app.person.SiteUserId; }).sort(byDue).forEach(function (a) {
        cards.push(infoCard(a.title + ' (' + a.ownerName + ')', a.dueText, 'late', function () { app.openAction(a); }));
      });
      keys.forEach(function (k) {
        var s = m.stats[k];
        if (s.flagged) cards.push(infoCard(s.flagged + (s.flagged === 1 ? ' item' : ' items') + ' flagged for the ' + m.areaByKey[k].name + ' meeting', 'For the meeting', 'soon'));
        if (app.access.runsMeetings(k) && s.meetingStale) cards.push(infoCard(s.lastMeeting ? 'No ' + m.areaByKey[k].name + ' meeting since ' + D.short(s.lastMeeting) : 'No ' + m.areaByKey[k].name + ' meeting booked', 'Meeting', 'soon'));
      });
      return cards;
    }

    // Team Leaders and the Group Head: what needs attention across the group.
    function attentionCards(app) {
      var m = app.model;
      var cards = [];
      m.areas.forEach(function (a) {
        var s = m.stats[a.key];
        if (a.status === 'Active' && s.meetingStale) cards.push(infoCard(a.name + (s.lastMeeting ? ' has not met since ' + D.long(s.lastMeeting) : ' has no meeting on record'), 'Meeting overdue', 'soon'));
      });
      m.actions.filter(function (a) { return a.group === 'late'; }).sort(byDue).forEach(function (a) {
        cards.push(infoCard(a.title + ' · ' + a.areaName + ' · ' + a.ownerName + (a.extensions >= 2 ? ' · deadline moved ' + a.extensions + ' times' : ''), a.dueText, 'late', function () { app.openAction(a); }));
      });
      var closeOut = m.actions.filter(function (a) { return a.waitingCloseOut; }).length;
      if (closeOut) cards.push(infoCard(closeOut + (closeOut === 1 ? ' action is' : ' actions are') + ' waiting for a close-out check', 'Close-out', 'later'));
      return cards;
    }

    function areaKeysForMe(app) {
      return app.model.areas.filter(function (a) { return a.status === 'Active' && (app.access.isManagement || app.access.isMember(a.key)); }).map(function (a) { return a.key; });
    }

    // Seven days from today: my actions due each day (late ones on today) and meetings in my areas.
    function weekStrip(app, mine) {
      var m = app.model;
      var keys = areaKeysForMe(app);
      var days = [];
      for (var i = 0; i < 7; i++) {
        var iso = D.addDays(m.today, i);
        var dow = D.weekday(iso);
        var evs = mine.filter(function (a) { return !a.waitingCloseOut && (a.dueIso === iso || (i === 0 && a.group === 'late')); }).sort(byDue).map(function (a) {
          return h('button', { type: 'button', class: 'hm-ev ' + (a.group === 'late' ? 'late' : 'soon'), title: a.title + ' – ' + a.dueText, onclick: function () { app.openAction(a); }, text: a.title });
        }).concat(keys.filter(function (k) { return m.stats[k].nextMeeting === iso; }).map(function (k) {
          return h('span', { class: 'hm-ev mtg', title: m.areaByKey[k].name + ' meeting', text: m.areaByKey[k].name + ' meeting' });
        }));
        var weekend = dow === 'Saturday' || dow === 'Sunday';
        days.push(h('div', { class: 'hm-day' + (i === 0 ? ' today' : '') + (weekend ? ' weekend' : '') },
          h('div', { class: 'hm-dh' }, h('b', { text: String(Number(iso.slice(8, 10))) }), h('span', { text: dow.slice(0, 3) }), i === 0 ? h('em', { text: 'Today' }) : null),
          evs.slice(0, 2), evs.length > 2 ? h('span', { class: 'hm-plus', text: '+ ' + (evs.length - 2) + ' more' }) : null,
          evs.length ? null : h('span', { class: 'hm-none', text: weekend ? 'Weekend' : 'Nothing due' })));
      }
      var due = mine.filter(function (a) { return !a.waitingCloseOut && D.daysBetween(m.today, a.dueIso) < 7; }).length;
      var meets = keys.filter(function (k) { var n = m.stats[k].nextMeeting; return n && D.daysBetween(m.today, n) < 7; }).length;
      return { el: h('div', { class: 'hm-week' }, days), summary: due + ' due · ' + meets + (meets === 1 ? ' meeting' : ' meetings') };
    }

    function tileFor(app, a) {
      var m = app.model;
      var s = m.stats[a.key];
      var viewOnly = !app.access.canWrite(a.key);
      var unavailable = m.sections.actions === 'unavailable';
      var open = app.state.homeArea === a.key;
      return h('button', { type: 'button', class: 'tile hm-tile' + (viewOnly ? ' view-only' : ''), 'data-area': a.key, 'aria-pressed': String(open),
        'aria-label': a.name + (viewOnly ? ', view only' : ''), onclick: function () { app.openAreaHere(open ? null : a.key); } },
        h('b', null, a.name),
        h('span', { class: 'hm-tr' }, unavailable ? h('span', { class: 'when w-soon', text: 'Action figures unavailable' })
          : h('span', { class: 'when w-' + (s.late ? 'late' : 'ok'), text: s.late ? s.late + ' late' : s.open + ' open' }),
          viewOnly ? h('span', { class: 'vo', text: 'View only' }) : null),
        h('span', { class: 'hm-tm' + (s.meetingStale ? ' txt-soon' : ''), text: s.nextMeeting ? 'Meets ' + D.weekdayShort(s.nextMeeting)
          : s.meetingStale ? (s.lastMeeting ? 'No meeting since ' + D.short(s.lastMeeting) : 'No meeting booked') : 'No meeting booked' }));
    }

    // The chosen area, opened in place: its actions, notices and meetings.
    function areaPanel(app, key) {
      var m = app.model;
      var acc = app.access;
      var area = m.areaByKey[key];
      var s = m.stats[key];
      var order = { late: 0, soon: 1, later: 2 };
      var acts = m.actions.filter(function (a) { return m.inArea(a, key); })
        .sort(function (a, b) { return (order[a.group] - order[b.group]) || byDue(a, b); })
        .map(function (a) { return actionCard(app, a, h('span', { class: 'hm-x', text: a.ownerName + (a.areaKey !== key ? ' · shared from ' + a.areaName : '') })); });
      var notices = m.notices.filter(function (n) { return n.areaKey === key; });
      notices = notices.filter(function (n) { return n.important; }).concat(notices.filter(function (n) { return !n.important; }));
      var news = notices.map(function (n) {
        return h('div', { class: 'hm-rw' }, h('span', { class: 'hm-dot' + (n.important ? ' on' : ''), title: n.important ? 'Important' : null }),
          h('span', { class: 'hm-tx' }, h('b', { text: n.title }),
            h('small', { text: (n.important ? 'Important · ' : '') + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.short(n.createdIso) })));
      });
      var diary = [];
      if (s.nextMeeting) diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-ok', text: D.weekdayShort(s.nextMeeting) }),
        h('span', { class: 'hm-tx' }, h('b', { text: 'Next meeting' }), h('small', { text: s.flagged ? s.flagged + (s.flagged === 1 ? ' item' : ' items') + ' flagged for discussion' : 'Nothing flagged yet' }))));
      else diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-soon', text: 'Not booked' }),
        h('span', { class: 'hm-tx' }, h('b', { text: 'No meeting booked' }), h('small', { text: 'Someone who runs meetings here can book one' }))));
      diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-later', text: 'Last met' }),
        h('span', { class: 'hm-tx' }, h('b', { text: s.lastMeeting ? D.long(s.lastMeeting) : 'None on record' }), h('small', { text: s.meetingStale ? 'A meeting is overdue' : 'Minutes are kept with the meeting' }))));
      m.calendar.filter(function (e) { return e.areaKey === key; }).forEach(function (e) {
        diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-later', text: D.weekdayShort(e.dateIso) }),
          h('span', { class: 'hm-tx' }, h('b', { text: e.title }), h('small', { text: e.important ? 'Important date' : 'In the calendar' }))));
      });
      function full(tab) { return function () { app.state = { view: 'area', area: key, tab: tab }; app.refreshView(true); }; }
      function col(title, count, list) {
        return h('div', { class: 'hm-col' }, h('h3', null, title, count === null ? null : h('span', { class: 'hm-count', text: String(count) })), list);
      }
      var unavailable = m.sections.actions === 'unavailable';
      return h('section', { class: 'hm-panel hm-area', 'aria-label': area.name },
        h('div', { class: 'hm-ph' },
          h('h2', { text: area.name }),
          h('span', { class: 'hm-sum', text: (unavailable ? 'Action figures unavailable' : s.open + ' open · ' + (s.late ? s.late + ' late' : 'none late')) + ' · ' +
            (s.nextMeeting ? 'next meeting ' + D.weekdayShort(s.nextMeeting) : s.lastMeeting ? 'no meeting since ' + D.short(s.lastMeeting) : 'no meeting booked') }),
          acc.canWrite(key) ? null : h('span', { class: 'vo', text: 'View only' }),
          h('span', { class: 'hm-acts' },
            acc.canWrite(key) && area.status === 'Active' ? ui.button('Raise an action here', function () { app.raiseAction(key); }) : null,
            acc.canPostNotice(key) ? ui.button('Post a notice here', function () { app.postNotice(key); }) : null,
            ui.linkButton('Full page', full(0)),
            h('button', { type: 'button', class: 'hm-x-btn', 'aria-label': 'Close ' + area.name, text: '✕', onclick: function () { app.openAreaHere(null); } }))),
        h('div', { class: 'hm-pb' }, h('div', { class: 'hm-cols' },
          col('Actions', unavailable ? null : acts.length, unavailable ? ui.sectionNote('unavailable', 'actions')
            : acts.length ? ui.fitList(acts, 'all ' + area.name + ' actions', full(0), 'items') : h('p', { class: 'hm-empty', text: 'There are no open actions in ' + area.name + '.' })),
          col('Notices & issues', notices.length, [ui.sectionNote(m.sections.notices, 'notices'),
            news.length ? ui.fitList(news, 'all notices', full(1)) : h('p', { class: 'hm-empty', text: 'Nothing has been posted on the ' + area.name + ' noticeboard yet.' }),
            h('p', { class: 'muted small hm-later', text: 'The improvements and degradations register joins this list in the next version.' })]),
          col('Meetings & dates', null, ui.fitList(diary, 'calendar', full(2))))));
    }

    function render(app) {
      var m = app.model;
      var acc = app.access;
      var openKey = app.state.homeArea && m.areaByKey[app.state.homeArea] ? app.state.homeArea : null;
      var fold = ui.folded();
      // On a laptop-height window the areas start folded, so your actions get the room; the choice is then remembered.
      if (fold.areas === undefined && window.innerHeight < 900) fold.areas = true;
      var unavailable = m.sections.actions === 'unavailable';
      ui.resetFits();

      var mine = m.actions.filter(function (a) { return a.ownerId === app.person.SiteUserId; }).sort(byDue);
      var late = mine.filter(function (a) { return a.group === 'late'; });
      var soon = mine.filter(function (a) { return a.group === 'soon' && !a.waitingCloseOut; });
      var later = mine.filter(function (a) { return a.group === 'later' || a.waitingCloseOut; });
      var keys = areaKeysForMe(app);
      var next = keys.filter(function (k) { return m.stats[k].nextMeeting; }).sort(function (a, b) { return m.stats[a].nextMeeting.localeCompare(m.stats[b].nextMeeting); })[0];

      // One line: greeting, then the day in a sentence. Management sees group totals (each action counted once).
      var summary;
      if (unavailable) summary = [h('span', { text: acc.isManagement ? 'Action figures could not be loaded just now. Reload the page to try again.' : 'Your actions could not be loaded just now.' })];
      else {
        var groupLate = m.actions.filter(function (a) { return a.group === 'late'; }).length;
        var lateN = acc.isManagement ? groupLate : late.length;
        summary = [acc.isManagement ? 'Across the group: ' + m.actions.length + ' open actions · ' : '',
          lateN ? h('b', { class: 'txt-late', text: lateN + ' late' }) : 'nothing late',
          ' · ' + soon.length + (acc.isManagement ? ' of yours' : '') + ' due this week',
          next ? ' · next meeting ' + m.areaByKey[next].name + ', ' + D.weekdayShort(m.stats[next].nextMeeting) : ''];
      }
      var out = [h('div', { class: 'hm-hello' }, h('h1', { text: greeting(firstName(app)) }), h('p', null, summary)), adminLine(app)];

      function toggle(id) {
        return function () {
          if (openKey) { app.state.homeArea = null; fold[id] = false; }
          else fold[id] = !fold[id];
          ui.saveFolded(fold);
          app.refreshView();
        };
      }

      var week = weekStrip(app, mine);
      var weekClosed = openKey ? true : !!fold.week;
      var actsClosed = openKey ? true : !!fold.actions;
      var areasClosed = openKey ? false : !!fold.areas;

      var lanes = [];
      if (!unavailable) {
        if (acc.isManagement) lanes.push(lane('Needs your attention', 'var(--navy)', attentionCards(app), 'Nothing needs your attention right now.', function () { app.showMine(0); }));
        else if (acc.isEngineer) lanes.push(lane('For you to manage', 'var(--navy)', manageCards(app), 'Nothing for you to manage right now.', function () { app.showMine(0); }));
        lanes.push(lane('Late', 'var(--late)', late.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing late.', function () { app.showMine(0); }));
        lanes.push(lane('Due this week', 'var(--soon)', soon.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing due this week.', function () { app.showMine(0); }));
        lanes.push(lane('Coming up', '#8a95a5', later.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing further ahead.', function () { app.showMine(0); }));
      }
      var actionsBody = [ui.sectionNote(m.sections.actions, 'actions'), lanes.length ? h('div', { class: 'hm-lanes', style: '--n:' + lanes.length }, lanes) : null];
      var actsSummary = unavailable ? 'Could not load actions' : late.length + ' late · ' + soon.length + ' this week · ' + later.length + ' later';

      var active = m.areas.filter(function (a) { return a.status === 'Active'; });
      var lateAreas = active.filter(function (a) { return m.stats[a.key].late; }).length;
      var tiles = h('div', { class: 'hm-tiles' + (openKey ? ' compact' : '') }, active.map(function (a) { return tileFor(app, a); }));

      var stack = h('div', { class: 'hm-stack' + (openKey ? ' area-open' : '') + (actsClosed ? ' acts-closed' : '') },
        ui.panel('week', 'This week', week.summary, week.el, { closed: weekClosed, onToggle: toggle('week') }),
        ui.panel('actions', acc.isManagement ? 'Your work' : 'Your actions', actsSummary, actionsBody,
          { closed: actsClosed, onToggle: toggle('actions'), link: ['All my actions', function () { app.showMine(0); }] }),
        ui.panel('areas', 'Areas', active.length + ' areas' + (unavailable ? '' : ' · ' + lateAreas + ' with late actions') + (openKey ? '' : ' · choose one to open it'), tiles,
          { closed: areasClosed, onToggle: toggle('areas') }),
        openKey ? areaPanel(app, openKey) : null);
      out.push(stack);
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
        h('div', { class: 'row tab-actions' }, app.access.canPostNotice(area.key) ? ui.button('Post a notice', function () { app.postNotice(area.key); }) : null),
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
          'You are not a member of ' + area.name + ', so you can read everything here' + (acc.canPostNotice(key) ? ' and post on its noticeboard' : '') + ', but cannot change anything else. ' +
          'Speak to one of the ' + area.name + ' engineers or your Team Leader if something needs doing.'));
      } else {
        out.push(h('div', { class: 'row actions-row' },
          ui.button('Raise an action', function () { app.raiseAction(key); }, 'main'),
          acc.canPostNotice(key) ? ui.button('Post a notice', function () { app.postNotice(key); }) : null,
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
      // the limit an administrator sets (MaxDeadlineYears), the same one the flow checks
      var maxYears = (app.health && app.health.maxDeadlineYears) || CH.config.maxDeadlineYears;
      var step = 0;
      var key = CH.requests.newKey();

      var title = h('input', { id: 'ch-r-title', type: 'text', maxlength: '255', autocomplete: 'off' });
      var description = h('textarea', { id: 'ch-r-description', rows: '5', maxlength: '5000' });
      var area = h('select', { id: 'ch-r-areaKey' }, mine.map(function (a) {
        return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name });
      }));
      var owner = h('select', { id: 'ch-r-ownerId' });
      var due = h('input', { id: 'ch-r-dueIso', type: 'date', min: today, max: R.addYears(today, maxYears) });
      var priority = h('select', { id: 'ch-r-priority' }, R.PRIORITIES.map(function (p) { return h('option', { value: p, selected: p === 'Normal' ? true : null, text: p }); }));
      var closeOut = h('input', { id: 'ch-r-closeOut', type: 'checkbox' });
      var closeOutTouched = false;
      closeOut.addEventListener('change', function () { closeOutTouched = true; });
      priority.addEventListener('change', function () { if (!closeOutTouched) closeOut.checked = priority.value === 'High'; });

      var selfNote = h('p', { class: 'explain', id: 'ch-r-self-only', text: 'As a technician you can raise actions for yourself in this area. An engineer, or someone who runs meetings in this area, can raise them for someone else.' });
      function fillOwners() {
        var current = owner.value || String(app.person.SiteUserId);
        CH.dom.clear(owner);
        owner.appendChild(h('option', { value: '', text: 'Choose a person' }));
        // a technician without meeting rights in this area is offered only themselves (spec §4.2)
        m.ownersFor(area.value).filter(function (p) { return app.access.canRaiseFor(area.value, p.id, app.person.SiteUserId); }).forEach(function (p) {
          owner.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
            text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') + (CH.config.managementRoles.indexOf(p.role) >= 0 ? ' – ' + p.role : '') }));
        });
        var selfOnly = !app.access.canRaiseFor(area.value, -1, app.person.SiteUserId) && app.access.canWrite(area.value);
        selfNote.style.display = selfOnly ? '' : 'none';
        if (selfOnly) { owner.removeChild(owner.firstChild); owner.value = String(app.person.SiteUserId); }
      }
      area.addEventListener('change', fillOwners);
      fillOwners();

      function values() {
        return { title: title.value, description: description.value, areaKey: area.value, ownerId: owner.value,
          dueIso: due.value, priority: priority.value, requiresCloseOut: closeOut.checked };
      }
      function errorsFor(keys) {
        var all = R.validateRaise(values(), {
          today: today, maxYears: maxYears, canWrite: app.access.canWrite,
          canRaiseFor: function (k, id) { return app.access.canRaiseFor(k, id, app.person.SiteUserId); },
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
        [field('Area', area), field('Who will do it?', owner, 'Members of the area, and Team Leaders and the Group Head.'), selfNote],
        [field('Target date', due, 'From today up to ' + maxYears + (maxYears === 1 ? ' year' : ' years') + ' ahead.'),
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
          (entry.retrying ? '. ' + entry.message : entry.processing ? ', being recorded now.' + (entry.state === 'slow' ? ' ' + entry.message : '')
            : ', waiting to be recorded (usually under 5 minutes).' + (entry.state === 'slow' ? ' ' + entry.message : '')));
      }
      var heading = { rejected: 'Not accepted: ', attention: 'Not recorded: ', cancelled: 'Cancelled: ', reverted: 'Reverted: ' }[entry && entry.state];
      if (heading) {
        return h('div', { class: 'section-note', role: 'alert' }, h('b', { text: heading }),
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
        // In limited mode only the instant update stays available (spec REL-5).
        var blocked = app.queueBlocked();
        Array.prototype.forEach.call(dlg.body.querySelectorAll('.actions-row .btn, .more .btn-link'), function (b) {
          b.disabled = !!busy || (blocked && b.textContent !== 'Add an update');
        });
        if (blocked && !finished) CH.dom.append(dlg.body.querySelector('.actions-row'), h('span', { class: 'muted small',
          text: 'Changes to actions are paused while they can\'t be processed. You can still add an update.' }));
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
            tab === 0 ? 'You have no open actions.' : 'No open actions here.', app.model.sections.actions, app.openAction, app.pendingNote),
          finished)
      ];
    }

    return { render: render };
  })();

  /* src/views/people.js */
  // Administration → People (spec ADM-1 to ADM-3, ADM-6). Administrators add people, and for each person set the
  // role, the areas (tick boxes), "Can run meetings" in each area, an optional end date, notice posting and the
  // administrator flag – or mark them as left. Every change is one queued request, checked again by the
  // Administration flow, which narrows access first and reads each group back. Nobody can change their own access.
  CH.views = CH.views || {};
  CH.views.people = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;
    var ROLES = ['Technician', 'Engineer', 'Team Leader', 'Group Head'];

    function rowsFor(app) {
      var q = String((app.peopleFilter || '')).trim().toLowerCase();
      return (app.people || []).filter(function (p) { return !q || String(p.Title).toLowerCase().indexOf(q) >= 0 || String(p.Email || '').toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (a.Status === b.Status ? 0 : a.Status === 'Active' ? -1 : 1) || String(a.Title).localeCompare(String(b.Title)); });
    }

    function areasOf(app, siteUserId) {
      return app.model.areas.filter(function (a) { return (app.model.membersByArea[a.key] || {})[siteUserId]; }).map(function (a) { return a.key; });
    }

    function list(app) {
      var search = h('input', { type: 'search', id: 'ch-p-search', placeholder: 'Find a person', 'aria-label': 'Find a person', value: app.peopleFilter || '',
        oninput: function (e) { app.peopleFilter = e.target.value; var box = app.root.querySelector('.people-list'); if (box) { CH.dom.clear(box); CH.dom.append(box, items(app)); } } });
      return [
        h('div', { class: 'row' }, search, ui.button('Add people', function () { addDialog(app); }, 'main')),
        h('ul', { class: 'plain people-list' }, items(app))
      ];
    }

    function items(app) {
      var rows = rowsFor(app);
      if (!rows.length) return h('li', { class: 'muted', text: 'Nobody matches.' });
      return rows.map(function (p) {
        var areas = areasOf(app, p.SiteUserId);
        var notes = [p.Role, areas.length ? areas.length + (areas.length === 1 ? ' area' : ' areas') : (CH.config.managementRoles.indexOf(p.Role) >= 0 ? 'all areas' : 'no areas')];
        if (p.IsAdministrator) notes.push('administrator');
        if (p.CanPostNotices === false) notes.push('cannot post notices');
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { personDialog(app, p); } },
          h('span', null, h('span', { class: 't', text: p.Title }), h('span', { class: 's', text: notes.join(' · ') })),
          p.Status === 'Active' ? null : ui.chip('later', 'Left')));
      });
    }

    // The areas table shared by "Add people" and a person's page: member, can run meetings, ends on.
    function areaTable(app, prefix, current, role) {
      var rows = app.model.areas.filter(function (a) { return a.status === 'Active'; }).map(function (a) {
        var cur = current[a.key] || null;
        var member = h('input', { type: 'checkbox', id: prefix + a.key + '-m', checked: cur ? true : null, 'aria-label': 'Member of ' + a.name });
        var chair = h('input', { type: 'checkbox', id: prefix + a.key + '-c', checked: cur && cur.chair ? true : null, 'aria-label': 'Can run meetings in ' + a.name });
        var ends = h('input', { type: 'date', id: prefix + a.key + '-e', value: cur && cur.expires ? cur.expires : '', min: app.model.today, 'aria-label': 'Access to ' + a.name + ' ends on' });
        function sync() { chair.disabled = !member.checked; ends.disabled = !member.checked; if (!member.checked) { chair.checked = false; ends.value = ''; } }
        // engineers run their areas' meetings by default (plan E.1); an administrator can change it
        member.addEventListener('change', function () { if (member.checked && role() === 'Engineer') chair.checked = true; sync(); });
        sync();
        return { key: a.key, tr: h('tr', null, h('th', { scope: 'row', text: a.name }), h('td', null, member), h('td', null, chair), h('td', null, ends)),
          value: function () { return member.checked ? { key: a.key, chair: chair.checked, expires: ends.value || '' } : null; } };
      });
      var table = h('table', { class: 'area-table' }, h('thead', null, h('tr', null, h('th', { text: 'Area' }), h('th', { text: 'Member' }),
        h('th', { text: 'Can run meetings' }), h('th', { text: 'Access ends (optional)' }))), h('tbody', null, rows.map(function (r) { return r.tr; })));
      return { node: table, value: function () { return rows.map(function (r) { return r.value(); }).filter(Boolean); } };
    }

    function sendAndShow(app, box, spec) {
      CH.dom.clear(box);
      box.appendChild(h('p', { class: 'pending', role: 'status', text: 'Sent – being recorded (usually under 5 minutes).' }));
      return app.tracker.submit(spec).then(function (entry) { watch(app, box, entry); return entry; }, function (error) {
        CH.dom.clear(box);
        box.appendChild(h('p', { class: 'field-error', role: 'alert', text: error.friendly || 'Could not send that just now. Try again in a moment.' }));
      });
    }

    // Shows the outcome of one request when it settles: verified, or not done and why.
    function watch(app, box, entry) {
      (function check() {
        if (!box.isConnected) return;
        if (entry.state === 'submitted' || entry.state === 'slow') { setTimeout(check, 1000); return; }
        CH.dom.clear(box);
        box.appendChild(h('p', { class: entry.state === 'done' ? 'ok-note' : 'section-note', role: 'status',
          text: (entry.state === 'done' ? 'Done and verified: ' : 'Not done: ') + entry.message }));
      })();
    }

    function addDialog(app) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-pa', title: 'Add people', wide: true });
      var email = h('input', { id: 'ch-pa-email', type: 'email', autocomplete: 'off' });
      var role = h('select', { id: 'ch-pa-role' }, ROLES.map(function (r) { return h('option', { value: r, text: r }); }));
      var posts = h('input', { id: 'ch-pa-posts', type: 'checkbox', checked: true });
      var areas = areaTable(app, 'ch-pa-', {}, function () { return role.value; });
      var result = h('div', { class: 'result' });
      var paste = h('textarea', { id: 'ch-pa-list', rows: '8', placeholder: 'firstname.lastname@edf-energy.com, Technician, GRS RP' });
      var pasteResult = h('ul', { class: 'plain result' });
      CH.dom.append(dlg.body, [
        h('h3', { text: 'One person' }),
        CH.ui.dialog.field('Email address', email, 'Their work email, as in Outlook.'),
        CH.ui.dialog.field('Role', role),
        areas.node,
        h('label', { class: 'check' }, posts, ' Can post notices'),
        h('div', { class: 'row' }, ui.button('Add this person', function () {
          var v = email.value.trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { CH.dom.clear(result); result.appendChild(h('p', { class: 'field-error', text: 'Enter their email address.' })); email.focus(); return; }
          sendAndShow(app, result, { type: 'AddPerson', payload: { email: v, role: role.value, areas: areas.value(), canPostNotices: posts.checked }, label: 'Add ' + v });
        }, 'main')),
        result,
        h('h3', { text: 'Or paste a list' }),
        h('p', { class: 'muted small', text: 'One person a line: email, role, then the area keys separated by spaces (for example FLK GRS RP). Engineers run their areas\' meetings; change that afterwards on their page.' }),
        CH.ui.dialog.field('People', paste),
        h('div', { class: 'row' }, ui.button('Add everyone in the list', function () {
          CH.dom.clear(pasteResult);
          parseList(app, paste.value).forEach(function (line) {
            var li = h('li', null, h('b', { text: line.email || line.text }), ' ');
            var box = h('span');
            li.appendChild(box);
            pasteResult.appendChild(li);
            if (line.error) { box.appendChild(h('span', { class: 'field-error', text: line.error })); return; }
            sendAndShow(app, box, { type: 'AddPerson', label: 'Add ' + line.email,
              payload: { email: line.email, role: line.role, canPostNotices: true, areas: line.keys.map(function (k) { return { key: k, chair: line.role === 'Engineer', expires: '' }; }) } });
          });
        })),
        pasteResult
      ]);
      dlg.focusFirst();
    }

    // "email, role, KEY KEY" lines, checked before anything is sent.
    function parseList(app, text) {
      var keys = app.model.areas.map(function (a) { return a.key; });
      return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; }).map(function (l) {
        var parts = l.split(',').map(function (p) { return p.trim(); });
        var out = { text: l, email: (parts[0] || '').toLowerCase(), role: parts[1] || '', keys: (parts[2] || '').split(/\s+/).filter(Boolean).map(function (k) { return k.toUpperCase(); }) };
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) out.error = 'Not an email address.';
        else if (ROLES.indexOf(out.role) < 0) out.error = 'The role must be Technician, Engineer, Team Leader or Group Head.';
        else if (out.keys.some(function (k) { return keys.indexOf(k) < 0; })) out.error = 'Unknown area: ' + out.keys.filter(function (k) { return keys.indexOf(k) < 0; }).join(', ') + '.';
        return out;
      });
    }

    async function personDialog(app, p) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-pp', title: p.Title, wide: true });
      dlg.body.appendChild(h('p', { class: 'muted', text: 'Loading…' }));
      var memberships = [], history = [];
      try {
        memberships = (await app.sp.items(CH.config.lists.members.title, '$select=Id,CompetencyId,CanManageMeetings,AccessExpires,Status&$filter=PersonId eq ' + Number(p.SiteUserId), 100)).rows;
        history = (await app.sp.items(CH.config.lists.history.title, "$select=Id,Title,EventType,ActorId,EventTime,Created&$filter=RecordId eq " + Number(p.Id) + " and RecordType eq 'Person'", 200)).rows;
      } catch (_) { /* shown below as unavailable */ }
      CH.dom.clear(dlg.body);
      var current = {};
      memberships.filter(function (m) { return m.Status === 'Active'; }).forEach(function (m) {
        var area = app.model.areas.filter(function (a) { return a.id === m.CompetencyId; })[0];
        if (area) current[area.key] = { chair: !!m.CanManageMeetings, expires: m.AccessExpires ? D.localDate(m.AccessExpires) : '' };
      });
      var self = Number(p.SiteUserId) === Number(app.person.SiteUserId);
      var left = p.Status !== 'Active';
      var role = h('select', { id: 'ch-pp-role' }, ROLES.map(function (r) { return h('option', { value: r, text: r, selected: r === p.Role ? true : null }); }));
      var areas = areaTable(app, 'ch-pp-', current, function () { return role.value; });
      var posts = h('input', { id: 'ch-pp-posts', type: 'checkbox', checked: p.CanPostNotices === false ? null : true });
      var admin = h('input', { id: 'ch-pp-admin', type: 'checkbox', checked: p.IsAdministrator ? true : null });
      var result = h('div', { class: 'result' });
      var note = self ? h('p', { class: 'section-note', text: 'You can\'t change your own access. Ask another administrator.' })
        : left ? h('p', { class: 'section-note', text: p.Title + ' is marked as having left. Reactivate them to give them access again, then choose their areas.' }) : null;
      CH.dom.append(dlg.body, [
        h('p', { class: 'muted small', text: (p.Email || '') + (CH.config.managementRoles.indexOf(p.Role) >= 0 ? ' · Team Leaders and the Group Head work in every area through their role.' : '') }),
        note,
        left ? null : [
          CH.ui.dialog.field('Role', role),
          h('h3', { text: 'Areas' }), areas.node,
          h('h3', { text: 'Noticeboard and administration' }),
          h('label', { class: 'check' }, posts, ' Can post notices'),
          h('label', { class: 'check' }, admin, ' Competency Hub administrator')
        ],
        h('div', { class: 'row actions-row' },
          left ? ui.button('Reactivate', function () {
            sendAndShow(app, result, { type: 'ReactivatePerson', payload: { personId: p.SiteUserId }, label: 'Reactivate ' + p.Title });
          }, 'main') : [
            ui.button('Save changes', function () {
              sendAndShow(app, result, { type: 'UpdatePerson', label: 'Change access for ' + p.Title,
                payload: { personId: p.SiteUserId, role: role.value, areas: areas.value(), canPostNotices: posts.checked, administrator: admin.checked } });
            }, 'main'),
            ui.button('Mark as left', function () {
              CH.dom.clear(result);
              CH.dom.append(result, [h('span', { text: p.Title + ' will lose all access to the Hub. Their records and history stay. ' }),
                ui.button('Yes, mark as left', function () {
                  sendAndShow(app, result, { type: 'PersonLeft', payload: { personId: p.SiteUserId }, label: p.Title + ' has left' });
                }), ui.linkButton('No', function () { CH.dom.clear(result); })]);
            })
          ]),
        result,
        h('h3', { class: 'group-title', text: 'Change history' }),
        history.length ? h('ul', { class: 'plain' }, history.sort(function (a, b) { return b.Id - a.Id; }).map(function (e) {
          return h('li', null, h('span', null, h('span', { text: e.Title }), h('br'),
            h('span', { class: 'muted small', text: app.model.nameOf(e.ActorId) + ' · ' + D.short(D.localDate(e.EventTime || e.Created)) + ' ' + D.ukTime(e.EventTime || e.Created) })));
        })) : h('p', { class: 'muted', text: 'No changes recorded yet.' })
      ]);
      if (self) Array.prototype.forEach.call(dlg.body.querySelectorAll('input, select, .actions-row .btn'), function (n) { n.disabled = true; });
      dlg.focusFirst();
    }

    return { list: list, parseList: parseList, personDialog: personDialog };
  })();

  /* src/views/admin.js */
  // Administration (spec REL-3): whether automatic processing is working, and the changes that need an
  // administrator. Each change shows what was asked, by whom and when, how far it got and the last error, with the
  // choices that are honest for its state: Try again or Cancel when nothing was changed; Finish or Revert when part
  // of it was made. Every choice is a queued request checked again by the Administration flow.
  CH.views = CH.views || {};
  CH.views.admin = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;
    var OPEN_STATES = ['Needs attention', 'Failed', 'Received', 'Planned', 'Applying'];
    var QUIET_MINUTES = 15;
    var ACTION_TYPES = ['RaiseAction', 'ExtendDeadline', 'MarkComplete', 'ChangeStatus', 'ReassignAction', 'CloseAction', 'ReopenAction', 'EditActionDetails'];
    var WORDS = {
      RaiseAction: 'Raise an action', ExtendDeadline: 'Move a deadline', MarkComplete: 'Mark an action as done', ChangeStatus: 'Change the status of an action',
      ReassignAction: 'Reassign an action', CloseAction: 'Close an action', ReopenAction: 'Reopen an action', EditActionDetails: 'Edit the details of an action',
      AddPerson: 'Add a person', UpdatePerson: 'Change a person\'s access', PersonLeft: 'Mark a person as left', ReactivatePerson: 'Reactivate a person',
      UpdateSetting: 'Change a setting', RetryTransaction: 'Try a change again', CancelTransaction: 'Cancel a change', RevertTransaction: 'Revert a change'
    };
    var SETTING_WORDS = {
      OverdueReminderIntervalDays: 'days between late reminders', ReminderDaysBefore: 'days before the deadline for the first reminder',
      MaxDeadlineYears: 'furthest deadline in years', MonitorHours: 'queue monitor hours'
    };

    function parse(text) { try { return JSON.parse(text || '{}') || {}; } catch (_) { return {}; } }

    // The open transactions, oldest first, with the action each is for (read as it is now).
    async function load(app) {
      var title = CH.config.lists.history.title;
      var rows = [];
      for (var i = 0; i < OPEN_STATES.length; i++) {
        var res = await app.sp.items(title, '$select=Id,Title,RequestKey,RequestType,RecordId,State,Attempts,LastError,FirstClaimedAt,ActorId,Payload,StepsDone,Created,Modified' +
          "&$filter=RowKind eq 'Transaction' and State eq '" + OPEN_STATES[i] + "'", 500);
        rows = rows.concat(res.rows);
      }
      var now = Date.now();
      rows = rows.filter(function (r) {
        return r.State === 'Needs attention' || (now - new Date(r.Modified || r.Created).getTime()) / 60000 >= QUIET_MINUTES;
      }).sort(function (a, b) { return a.Id - b.Id; });
      var out = [];
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var action = null;
        var payload = parse(r.Payload);
        if (ACTION_TYPES.indexOf(r.RequestType) < 0) {
          // people, settings and decisions: once decided, groups or rows may already have changed
          out.push({ tx: r, action: null, partly: String(r.StepsDone || '').indexOf('DECIDED') >= 0, payload: payload, admin: true });
          continue;
        }
        try {
          var q = r.RequestType === 'RaiseAction'
            ? "$filter=CreatedRequestKey eq '" + CH.sp.escapeOData('F|' + r.RequestKey) + "'"
            : '$filter=Id eq ' + (Number(r.RecordId) || 0);
          var found = await app.sp.items(CH.config.lists.actions.title, '$select=Id,Title,PendingRequestKey,LastRequestKey&' + q, 1);
          action = found.rows[0] || null;
        } catch (_) { action = null; }
        var partly = !!action && action.PendingRequestKey === r.RequestKey;
        out.push({ tx: r, action: action, partly: partly, payload: payload });
      }
      return out;
    }

    function describe(app, item) {
      var r = item.tx;
      var what = WORDS[r.RequestType] || r.RequestType;
      var p = item.payload;
      if (item.action) what += ': ' + 'ACT-' + ('0000' + item.action.Id).slice(-5) + ' ' + item.action.Title;
      else if (r.RequestType === 'RaiseAction' && p.title) what += ': ' + p.title;
      else if (r.RequestType === 'AddPerson' && p.email) what += ': ' + p.email;
      else if (p.personId) what += ': ' + app.model.nameOf(p.personId);
      else if (r.RequestType === 'UpdateSetting' && p.name) what += ': ' + (SETTING_WORDS[p.name] || p.name);
      return what;
    }

    function stateWords(item) {
      if (item.tx.State === 'Needs attention') {
        if (!item.partly) return 'Not made – nothing was changed';
        return item.admin ? 'Partly done – choose Finish to complete it' : 'Partly done – the action stays locked until you finish or revert it';
      }
      if (item.tx.State === 'Failed') return 'Failed – being tried again automatically';
      return 'Interrupted – being tried again automatically';
    }

    function healthCard(app) {
      var hl = app.health || {};
      var lines = [];
      if (hl.processing === 'ok') lines.push(h('li', null, h('span', null, h('b', { text: 'Automatic processing is working. ' }),
        'Last checked at ' + D.ukTime(hl.checkedAt) + '.'), ui.chip('done', 'Working')));
      else if (hl.processing === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Automatic processing is not working. ' }), hl.reason,
        ' Staff cannot send changes until it recovers. In Power Automate, check the flows ESG Competency Hub | 2 Request queue and 3 Queue monitor.'), ui.chip('late', 'Not working')));
      if (hl.administration === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Administration changes are not being processed. ' }), hl.adminReason,
        ' Staff can carry on as normal. In Power Automate, check that ESG Competency Hub | 6 Administration is turned on.'), ui.chip('late', 'Not working')));
      else lines.push(h('li', null, h('span', null, h('b', { text: 'The queue monitor has not reported yet. ' }),
        'Check that the flow ESG Competency Hub | 3 Queue monitor is turned on.'), ui.chip('soon', 'Unknown')));
      if (hl.reminders === 'ok') lines.push(h('li', null, h('span', null, h('b', { text: 'Reminders ran ' }), D.short(D.localDate(hl.lastDailyRun)) + ' at ' + D.ukTime(hl.lastDailyRun) + '.'), ui.chip('done', 'Working')));
      else lines.push(h('li', null, h('span', null, h('b', { text: hl.reminders === 'stale' ? 'Reminders have not run for more than a day. ' : 'Reminders have not run yet. ' }),
        'Check that the flow ESG Competency Hub | 1 Daily tasks is turned on.'), ui.chip('soon', 'Check')));
      return ui.card('Automatic processing', h('ul', { class: 'plain' }, lines));
    }

    function choices(app, item, onDone) {
      var isAction = ACTION_TYPES.indexOf(item.tx.RequestType) >= 0;
      var list = item.partly
        ? [['RetryTransaction', 'Finish', 'Try the rest of this change again. What was already made stays.'],
          isAction && !item.admin ? ['RevertTransaction', 'Revert', item.tx.RequestType === 'RaiseAction'
            ? 'Withdraw the half-created action. It is closed as withdrawn and kept in the history.'
            : 'Put the action back as it was before this change. The reversal is recorded in the history.'] : null]
        : [['RetryTransaction', 'Try again', 'Put this change back in the queue to be tried again.'],
          ['CancelTransaction', 'Cancel', 'Close this change without making it. The person who asked sees that it was cancelled.']];
      var box = h('div', { class: 'row' });
      function confirmStep(choice) {
        CH.dom.clear(box);
        CH.dom.append(box, [h('span', { text: choice[2] + ' ' }),
          ui.button('Yes, ' + choice[1].toLowerCase(), async function (e) {
            e.target.disabled = true;
            try {
              var entry = await app.tracker.submit({ type: choice[0], targetId: item.tx.Id, payload: { txId: item.tx.Id, note: '' },
                label: choice[1] + ': ' + describe(app, item) });
              item.sent = entry;
              onDone();
            } catch (error) {
              CH.dom.clear(box);
              CH.dom.append(box, h('span', { class: 'field-error', text: 'Could not send that just now. Try again in a moment.' }));
            }
          }, 'main'),
          ui.linkButton('No', function () { CH.dom.clear(box); CH.dom.append(box, buttons()); })]);
      }
      function buttons() {
        return list.filter(Boolean).map(function (c) { return ui.button(c[1], function () { confirmStep(c); }); });
      }
      CH.dom.append(box, buttons());
      return box;
    }

    function sentLine(entry) {
      if (!entry) return null;
      var waiting = entry.state === 'submitted' || entry.state === 'slow';
      if (waiting) return h('p', { class: 'pending', role: 'status', text: entry.label + ' – sent at ' + D.ukTime(entry.submittedAt) + ', waiting for the result.' });
      return h('p', { class: entry.state === 'done' ? 'ok-note' : 'section-note', role: 'status',
        text: (entry.state === 'done' ? 'Done: ' : 'Not done: ') + entry.message });
    }

    function changeList(app) {
      var st = app.admin;
      if (!st || st.loading) return h('p', { class: 'muted', text: 'Loading the changes that need attention…' });
      if (st.error) return h('p', { class: 'section-note', text: 'The changes could not be read just now. Reload the page to try again.' });
      if (!st.items.length) return h('p', { class: 'muted', text: 'Nothing needs your attention. Every change has been recorded.' });
      return h('ul', { class: 'plain admin-changes' }, st.items.map(function (item) {
        var r = item.tx;
        return h('li', { class: 'admin-change' }, h('div', null,
          h('b', { text: describe(app, item) }), h('br'),
          h('span', { class: 'muted small', text: 'Asked by ' + app.model.nameOf(r.ActorId) + ' at ' +
            D.short(D.localDate(r.FirstClaimedAt || r.Created)) + ' ' + D.ukTime(r.FirstClaimedAt || r.Created) +
            ' · ' + (Number(r.Attempts) || 0) + (Number(r.Attempts) === 1 ? ' attempt' : ' attempts') + ' · reference ' + r.RequestKey }),
          h('p', null, ui.chip(item.partly ? 'late' : 'soon', stateWords(item))),
          r.LastError ? h('p', { class: 'muted small', text: 'Last error: ' + r.LastError }) : null,
          item.sent ? sentLine(item.sent) : choices(app, item, function () { app.refreshView(); })));
      }));
    }

    async function refresh(app) {
      app.admin = { loading: true, items: [] };
      app.refreshView();
      try {
        app.admin = { loading: false, items: await load(app) };
      } catch (_) {
        app.admin = { loading: false, error: true, items: [] };
      }
      app.refreshView();
    }

    var TABS = ['Changes needing attention', 'People'];

    function render(app) {
      if (!app.access.isAdministrator) {
        return [h('h1', { text: 'Administration' }), h('p', { text: 'Only Competency Hub administrators can use this page.' })];
      }
      var tab = app.adminTab || 0;
      if (tab === 0 && !app.admin) setTimeout(function () { refresh(app); }, 0);
      var bar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Administration' }, TABS.map(function (t, i) {
        return h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), tabindex: i === tab ? '0' : '-1', text: t,
          onclick: function () { app.adminTab = i; app.refreshView(); },
          onkeydown: function (e) {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            app.adminTab = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
            app.refreshView();
            var sel = app.root.querySelector('.subtabs [aria-selected="true"]');
            if (sel) sel.focus();
          } });
      }));
      var panel = tab === 1 ? CH.views.people.list(app) : [
        healthCard(app),
        ui.card('Changes needing attention', [
          h('p', { class: 'muted small', text: 'Changes that failed three times, and runs that stopped more than ' + QUIET_MINUTES + ' minutes ago. The queue monitor retries the rest by itself.' }),
          h('div', { class: 'row' }, ui.linkButton('Check again', function () { refresh(app); })),
          changeList(app)])];
      return [
        h('div', { class: 'row' }, ui.linkButton('‹ Overview', app.goHome)),
        h('h1', { text: 'Administration' }),
        bar,
        h('div', { class: 'panel', role: 'tabpanel' }, panel)
      ];
    }

    return { render: render, load: load, refresh: refresh };
  })();

  /* src/app.js */
  // Application controller: Welcome lifecycle, identity, loading and navigation.
  CH.app = (function () {
    var h = CH.dom.h;

    function create(ctx) {
      var started = false;
      var disposed = false;
      var observer = null;
      var healthTimer = null;
      var HEALTH_EVERY_MS = 5 * 60 * 1000;
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
          // Limited mode (spec REL-5): only the changes that need automatic processing are paused.
          app.queueBlocked() ? h('p', { class: 'stale-copy limited', role: 'alert' }, h('b', { text: 'Changes can\'t be processed at the moment. ' }),
            'You can still read everything, add updates to actions and post notices. Raising and changing actions will be back shortly – nothing you have already sent is lost.') : null,
          h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
            h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
            C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
            app.person && app.model ? nav() : null,
            app.person && app.model && app.state.view === 'home' ? homeButtons() : null,
            app.person ? h('span', { class: 'who', text: CH.names.display(app.person.Title, app.person.Email) + ' · ' + app.person.Role }) : null,
            textSizeControl())),
          h('main', { id: 'ch-main', tabindex: '-1' }, content),
          h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
          h('footer', { text: 'ESG Competency Hub · version ' + C.VERSION })
        ];
      }

      // Main pages, as pills in the bar. Only pages that exist are listed.
      function nav() {
        var v = app.state.view;
        var items = [['My week', v === 'home', app.goHome], ['My actions', v === 'mine', function () { app.showMine(0); }]];
        if (app.access && app.access.isAdministrator) items.push(['Administration', v === 'admin', app.showAdmin]);
        return h('nav', { class: 'pills', 'aria-label': 'Main' }, items.map(function (x) {
          return h('button', { type: 'button', 'aria-current': x[1] ? 'page' : null, onclick: x[2], text: x[0] });
        }));
      }

      function homeButtons() {
        var acc = app.access;
        var first = acc.memberAreas[0] || (app.model.areas[0] && app.model.areas[0].key);
        return h('span', { class: 'bar-btns' },
          acc.canPostNotice(first) ? CH.ui.button('Post a notice', function () { app.postNotice(first); }) : null,
          acc.memberAreas.length || acc.isManagement ? CH.ui.button('Raise an action', function () { app.raiseAction(first); }, 'main') : null);
      }

      // On the home page the app fills the window exactly, so the page itself never scrolls. Small windows
      // (phones, or very short windows) keep ordinary scrolling.
      function fitToWindow() {
        if (!app.root || !app.root.style || !app.root.classList) return;
        var fit = app.state.view === 'home' && !!app.model && window.innerWidth > 900 && window.innerHeight > 560;
        app.root.classList.toggle('ch-fit', fit);
        if (!fit) { app.root.style.height = ''; return; }
        var top = app.root.getBoundingClientRect().top + (window.scrollY || 0);
        app.root.style.height = Math.max(window.innerHeight - top, 480) + 'px';
        CH.ui.refit();
      }

      function onKey(e) {
        if (e.key !== 'Escape' || app.state.view !== 'home' || !app.state.homeArea) return;
        if (app.layer && app.layer.firstChild) return;   // a dialog is open; it handles Escape itself
        app.openAreaHere(null);
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
        fitToWindow();
      }

      // Raised actions being recorded, changes that were not accepted, and requests that never left the browser.
      function requestStrip() {
        if (!app.tracker) return null;
        var items = app.tracker.entries().filter(function (e) {
          if (e.dismissed) return false;
          if (CH.requests.ADMIN_TYPES.indexOf(e.type) >= 0) return false;   // shown on the Administration page
          if (e.type === 'RaiseAction') return e.state !== 'done';
          return ['rejected', 'attention', 'cancelled', 'reverted'].indexOf(e.state) >= 0;
        }).map(function (e) {
          var waiting = e.state === 'submitted' || e.state === 'slow';
          var how = { rejected: 'not accepted: ', attention: 'not recorded: ', cancelled: 'cancelled: ', reverted: 'reverted: ' }[e.state];
          return h('li', { class: waiting ? 'pending' : 'section-note' }, h('b', { text: e.label }),
            waiting ? ' – submitted ' + CH.dates.ukTime(e.submittedAt) + (e.retrying ? '. ' + e.message
              : (e.processing ? ', being recorded now.' : ', waiting to be recorded (usually under 5 minutes).') + (e.state === 'slow' ? ' ' + e.message : ''))
              : ' – ' + how + e.message + ' ',
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

      // Every few minutes: is automatic processing still working (or working again)? Repaints only on a change.
      async function checkHealth() {
        if (disposed) return;
        try {
          var res = await app.sp.items(CH.config.lists.settings.title, CH.model.QUERIES.settings);
          var next = CH.health.judge(res.rows, new Date());
          var changed = !app.health || next.processing !== app.health.processing || next.reminders !== app.health.reminders;
          app.health = next;
          if (changed) render(false);
        } catch (_) { /* the next check tries again */ }
      }

      function onRequestChange(entry) {
        if (CH.requests.ADMIN_TYPES.indexOf(entry.type) >= 0) {
          render(false);
          if (entry.state === 'done' && app.state.view === 'admin') setTimeout(function () { CH.views.admin.refresh(app); }, 1500);
          return;
        }
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
      app.showAdmin = function () { app.admin = null; app.state = { view: 'admin', area: null, tab: 0 }; render(true); };
      app.refreshView = function (moveFocus) { render(!!moveFocus); };
      // Opens an area in place on the home page (key), or closes it (null). Focus stays with the area's tile.
      app.openAreaHere = function (key) {
        var was = app.state.homeArea;
        app.state = { view: 'home', area: null, tab: 0, homeArea: key || null };
        render(false);
        var tile = app.root.querySelector('.hm-tile[data-area="' + (key || was || '') + '"]');
        if (tile) tile.focus();
      };
      // True while automatic processing is down: queued changes are not offered and not sent.
      app.queueBlocked = function () { return !!app.health && app.health.processing === 'down'; };
      app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
      app.showMine = function (tab, areaKey, keepFocus) {
        app.state = { view: 'mine', area: null, tab: tab || 0, areaFilter: areaKey || '' };
        render(!keepFocus);
        if (keepFocus) { var t = app.root.querySelector('.subtabs [aria-selected="true"]'); if (t) t.focus(); }
      };
      app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
      app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
      app.raiseAction = function (key) {
        if (app.queueBlocked()) { CH.ui.toast(app.root, 'Raising actions is paused while changes can\'t be processed. Please try again later.', 'info'); return; }
        CH.views.raiseForm.open(app, key);
      };
      app.openAction = function (a) { CH.views.actionPanel.open(app, a.id); };
      app.pendingNote = function (a) {
        var e = app.tracker && app.tracker.forTarget(a.id);
        if (e && (e.state === 'submitted' || e.state === 'slow')) return 'change being recorded';
        if (e && e.state === 'rejected') return 'change not accepted';
        if (e && e.state === 'attention') return 'change not recorded';
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
          : app.state.view === 'mine' ? CH.views.myActions.render(app)
          : app.state.view === 'admin' ? CH.views.admin.render(app) : CH.views.home.render(app)];
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
        app.health = CH.health.judge(raw.settings.rows, now);
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
          people = (await app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,CanPostNotices,Status')).rows;
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
        // ?area=KEY opens the area on the home page; ?view=area&area=KEY opens its full page.
        if (app.model.areaByKey[areaParam]) app.state = params.get('view') === 'area' ? { view: 'area', area: areaParam, tab: 0 } : { view: 'home', area: null, tab: 0, homeArea: areaParam };
        if (params.get('view') === 'mine') app.state = { view: 'mine', area: null, tab: 0, areaFilter: '' };
        if (params.get('view') === 'admin') app.state = { view: 'admin', area: null, tab: 0 };
        healthTimer = setInterval(checkHealth, HEALTH_EVERY_MS);
        window.addEventListener('resize', fitToWindow);
        document.addEventListener('keydown', onKey);
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
          if (healthTimer) clearInterval(healthTimer);
          if (observer) observer.disconnect();
          window.removeEventListener('resize', applySize);
          window.removeEventListener('resize', fitToWindow);
          document.removeEventListener('keydown', onKey);
        }
      };
    }

    return { create: create };
  })();

  return CH.app.create(ctx);
};
