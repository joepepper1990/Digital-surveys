/* ESG Competency Hub 1.1.1 – built from src/ by tools/build.js. Do not edit. */
window.ESGCompetencyHub = function (ctx) {
  'use strict';
  var CH = {};
  /* src/core/config.js */
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '1.1.1',
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
      // Shorter names for the compact strip of area tiles; the full name shows on hover and in the open panel.
      shortNames: { RP: 'Rad Prot', ALS: 'Active Lab' },
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
    // The name a person is known by (People.KnownAs, set by an administrator) comes first; otherwise their full
    // name, first name first.
    function display(title, email, knownAs) {
      if (String(knownAs || '').trim()) return String(knownAs).trim();
      var name = String(title || '').trim();
      var local = String(email || '').split('@')[0].toLowerCase();
      var first = /^[a-z][a-z'-]*[.]/.test(local) ? local.split('.')[0] : '';
      var words = name.split(/\s+/);
      if (!first || words.length < 2) return name;
      if (words[0].toLowerCase() === first) return name;
      if (words[words.length - 1].toLowerCase() === first) return [words[words.length - 1]].concat(words.slice(0, -1)).join(' ');
      return name;
    }
    // A People row's name for display.
    function of(p) { return p ? display(p.Title, p.Email, p.KnownAs) : ''; }
    // "Joe's", "James'"
    function possessive(name) { return /s$/i.test(name) ? name + '\'' : name + '\'s'; }
    return { display: display, of: of, possessive: possessive };
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
      // optional: columns added by a later Setup. If SharePoint says one is missing (Setup not yet run), the read is
      // made again without them, so the app still works and the new detail is simply absent.
      async function items(title, query, maxRows, optional) {
        if (optional && optional.length) {
          try { return await items(title, query, maxRows); } catch (error) {
            if (error.status !== 400) throw error;
            var q = query.replace(/(\$select=)([^&]*)/, function (_, k, v) {
              return k + v.split(',').filter(function (f) { return optional.indexOf(f) < 0 && optional.indexOf(f.split('/')[0]) < 0; }).join(',');
            });
            return items(title, q, maxRows);
          }
        }
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

      function currentUser() { return req('GET', siteUrl + '/_api/web/currentuser?$select=Id,Title,Email,LoginName'); }

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
            FolderPath: { DecodedUrl: siteRelative + '/Lists/' + list.url + (folder ? '/' + folder : '') },
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

      // Changes fields on an item the user may edit (administrators answering feedback). Every HasException is checked.
      async function update(listKey, id, values) {
        var list = CH.config.lists[listKey];
        var body = { formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }), bNewDocumentUpdate: false };
        var verb = 'ValidateUpdateListItem';
        var json = await req('POST', listPath(list.title) + '/items(' + Number(id) + ')/' + verb, body);
        var results = (json && (json.value || (json.d && json.d[verb] && json.d[verb].results))) || [];
        var failed = results.filter(function (r) { return r.HasException; });
        if (failed.length) throw new SpError(400, failed.map(function (r) { return r.FieldName + ': ' + r.ErrorMessage; }).join('; '));
      }

      return { siteUrl: siteUrl, origin: origin, siteRelative: siteRelative, items: items, currentUser: currentUser, myFirstName: myFirstName, addToFolder: addToFolder,
        update: update };
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
    var ADMIN_TYPES = ['RetryTransaction', 'CancelTransaction', 'RevertTransaction', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson', 'UpdateSetting', 'RemoveTestRecords', 'SetKnownAs'];
    // Notices, comments and the register (4 Records): confirmed by their History event, which is written before Completed.
    var RECORD_TYPES = ['EditNotice', 'ArchiveNotice', 'PinNotice', 'HideComment', 'RaiseRegisterEntry', 'UpdateRegisterEntry', 'LinkActionToEntry', 'UnlinkActionFromEntry'];
    // Meetings (5 Meetings): also confirmed by their History event.
    var MEETING_TYPES = ['ScheduleMeeting', 'UpdateMeeting', 'CancelMeeting', 'StartMeeting', 'FinaliseMeeting', 'AmendMeeting'];

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
          TargetType: spec.targetId ? spec.targetType || 'Action' : '', TargetId: spec.targetId || '', ExpectedRevision: spec.expectedRevision || '',
          Payload: JSON.stringify(spec.payload), Status: 'Submitted',
          // a change to an action made during a meeting carries it: the meeting is finalised only once all are recorded
          MeetingId: spec.meetingId || (app.liveMeetingId && MEETING_TYPES.indexOf(spec.type) < 0 && RECORD_TYPES.indexOf(spec.type) < 0 && ADMIN_TYPES.indexOf(spec.type) < 0
            ? app.liveMeetingId : '')
        };
      }

      async function findRequest(key) {
        var res = await app.sp.items(CH.config.lists.requests.title,
          "$select=Id,Status,ResultMessage,ResultId&$filter=RequestKey eq '" + q(key) + "'", 1);
        return res.rows[0] || null;
      }

      // spec: { type, targetId, expectedRevision, payload, label, key? }. Resolves to the tracked entry.
      async function submit(spec) {
        var blocked = RECORD_TYPES.indexOf(spec.type) >= 0 ? app.recordsBlocked && app.recordsBlocked()
          : MEETING_TYPES.indexOf(spec.type) >= 0 ? app.meetingsBlocked && app.meetingsBlocked()
          : ADMIN_TYPES.indexOf(spec.type) < 0 && app.queueBlocked && app.queueBlocked();
        if (blocked) {
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
        var entry = { key: spec.key, type: spec.type, targetId: spec.targetId || null, meetingId: values(spec).MeetingId || null, targetType: spec.targetId ? spec.targetType || 'Action' : '', label: spec.label, submittedAt: new Date(),
          state: 'submitted', message: '', resultId: null, polls: 0, payload: spec.payload, spec: spec };
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
          var res = await app.sp.items(CH.config.lists.requests.title, '$select=Id,Title,RequestKey,RequestType,TargetType,TargetId,MeetingId,Created,Payload,ExpectedRevision' +
            "&$filter=Status eq '" + statuses[i] + "' and AuthorId eq " + Number(app.person.SiteUserId) + recent, 100);
          found = found.concat(res.rows);
        }
        found.sort(function (a, b) { return a.Id - b.Id; }).forEach(function (row) {
          if (!row.RequestKey || entries.some(function (e) { return e.key === row.RequestKey; })) return;
          var payload = null;
          try { payload = JSON.parse(row.Payload || 'null'); } catch (_) { payload = null; }
          var entry = { key: row.RequestKey, type: row.RequestType, targetId: row.TargetId || null, meetingId: row.MeetingId || null, targetType: row.TargetType || (row.TargetId ? 'Action' : ''), label: row.Title || 'Your change',
            submittedAt: row.Created ? new Date(row.Created) : new Date(), state: 'submitted', message: '', resultId: null, polls: 0, payload: payload,
            spec: { type: row.RequestType, targetId: row.TargetId || null, targetType: row.TargetType || '', expectedRevision: row.ExpectedRevision || '', payload: payload, label: row.Title || 'Your change', meetingId: row.MeetingId || '' } };
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
        if (RECORD_TYPES.indexOf(entry.type) >= 0 || MEETING_TYPES.indexOf(entry.type) >= 0) {
          try {
            var evr = await app.sp.items(CH.config.lists.history.title, "$select=Id&$filter=RequestKey eq '" + q(entry.key + '|1') + "'", 1);
            return evr.rows.length > 0;
          } catch (_) { return false; }
        }
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
        if (state === 'done') entry.doneAt = Date.now();
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

      // Try again (release 1.2). A change that failed on the system's side is the same request set back to Submitted: the
      // flow resumes its stored copy, so it can never be made twice. A refused change (someone else changed the record
      // first) is sent again as a new request, against the record as it is now (revision: the record's current revision).
      async function retry(entry, revision) {
        if (entry.state === 'attention' && ADMIN_TYPES.indexOf(entry.type) < 0) {
          var row = await findRequest(entry.key);
          if (!row) throw new Error('The change could not be found.');
          await app.sp.update('requests', row.Id, { Status: 'Submitted' });
          entry.state = 'submitted';
          entry.message = '';
          entry.retrying = false;
          entry.dismissed = false;
          entry.polls = 0;
          entry.submittedAt = new Date();
          onChange(entry);
          schedule(entry);
          return entry;
        }
        if (entry.state !== 'rejected' || !entry.spec) throw new Error('This change cannot be tried again.');
        var spec = Object.assign({}, entry.spec, { key: null });
        if (revision !== undefined && revision !== null) spec.expectedRevision = revision;
        entry.dismissed = true;
        return submit(spec);
      }

      return {
        submit: submit,
        resume: resume,
        retry: retry,
        entries: function () { return entries.slice(); },
        // The newest unfinished or unread request for a record (an action unless another kind is named).
        forTarget: function (id, targetType) {
          var kind = targetType || 'Action';
          return entries.filter(function (e) { return Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind && !e.dismissed; }).slice(-1)[0] || null;
        },
        // The newest change for a record, including the one that created it (a raise is found by the id it was given).
        forRecord: function (id, targetType) {
          var kind = targetType || 'Action';
          var made = { 'Action': 'RaiseAction', 'Register Entry': 'RaiseRegisterEntry', 'Meeting': 'ScheduleMeeting' }[kind];
          return entries.filter(function (e) {
            return (Number(e.targetId) === Number(id) && (e.targetType || 'Action') === kind) || (e.type === made && e.state === 'done' && Number(e.resultId) === Number(id));
          }).slice(-1)[0] || null;
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

    // A refusal because someone else changed the record first (or is changing it now): trying again can work.
    function isConflict(entry) { return /someone else|being updated/i.test(String(entry && entry.message || '')); }

    return { tracker: tracker, newKey: newKey, isConflict: isConflict, SCHEDULE: SCHEDULE, GIVE_UP_MINUTES: GIVE_UP_MINUTES, ADMIN_TYPES: ADMIN_TYPES, RECORD_TYPES: RECORD_TYPES, MEETING_TYPES: MEETING_TYPES,
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

    var CO_OWNERS = 'Choose co-owners from the members of this area, and the Team Leaders and Group Head, other than the owner.';
    var CHECK_NOT_OWNER = 'Choose someone other than the owner to do the close-out check.';
    var CHECK_ALLOWED = 'Choose a member of this area or a Team Leader to do the close-out check.';
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
      if (!v.areaKey) e.areaKey = 'Choose the area this action belongs to.';
      else if (!ctx.canWrite(v.areaKey)) e.areaKey = 'Choose one of your areas.';
      if (!v.ownerId) e.ownerId = 'Choose who will do it.';
      else if (!e.areaKey && !ctx.ownerAllowed(v.areaKey, Number(v.ownerId))) e.ownerId = 'Choose a member of this area or a Team Leader.';
      else if (!e.areaKey && ctx.canRaiseFor && !ctx.canRaiseFor(v.areaKey, Number(v.ownerId))) e.ownerId = SELF_ONLY;
      if (!D.isIso(v.dueIso || '')) e.dueIso = 'Choose a target date.';
      else if (v.dueIso < ctx.today) e.dueIso = 'The target date cannot be in the past.';
      else if (v.dueIso > addYears(ctx.today, ctx.maxYears)) e.dueIso = 'Choose a date within ' + ctx.maxYears + (ctx.maxYears === 1 ? ' year.' : ' years.');
      if (v.priority && PRIORITIES.indexOf(v.priority) < 0) e.priority = 'Choose a priority.';
      // co-owners share the action: up to 5, each a member of the area or a Team Leader, never the owner. A technician who
      // raises only for themselves adds none. The close-out check is someone other than the owner (the raiser by default).
      var co = (v.coOwnerIds || []).map(Number);
      if (!e.areaKey && !e.ownerId) {
        if (co.length > 5) e.coOwnerIds = 'Choose up to 5 co-owners.';
        else if (co.length && ctx.canRaiseFor && !ctx.canRaiseFor(v.areaKey, -1)) e.coOwnerIds = SELF_ONLY;
        else if (co.some(function (id) { return id === Number(v.ownerId) || !ctx.ownerAllowed(v.areaKey, id); })) e.coOwnerIds = CO_OWNERS;
        if (v.requiresCloseOut) {
          var checker = Number(v.checkerId || ctx.me);
          if (checker === Number(v.ownerId)) e.checkerId = CHECK_NOT_OWNER;
          else if (!ctx.ownerAllowed(v.areaKey, checker)) e.checkerId = CHECK_ALLOWED;
        }
      }
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
      if (v.coOwnerIds) {
        var co = v.coOwnerIds.map(Number).filter(function (id) { return id !== Number(v.ownerId); });
        if (co.length > 5) e.coOwnerIds = 'Choose up to 5 co-owners.';
        else if (co.some(function (id) { return !ctx.ownerAllowed(action.areaKey, id); })) e.coOwnerIds = CO_OWNERS;
      }
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

    // v: the fields being changed (title, description, priority, requiresCloseOut, checkerId); anything not given stays.
    // ctx: { ownerAllowed(areaKey, personId) }
    function validateEdit(action, v, ctx) {
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
      var on = 'requiresCloseOut' in v ? !!v.requiresCloseOut : !!action.requiresCloseOut;
      if (on && ctx) {
        var checker = Number('checkerId' in v ? v.checkerId : (action.checkerId || action.raisedById));
        if (checker === Number(action.ownerId)) e.checkerId = CHECK_NOT_OWNER;
        else if (!ctx.ownerAllowed(action.areaKey, checker)) e.checkerId = CHECK_ALLOWED;
      }
      if (!['title', 'description', 'priority', 'requiresCloseOut', 'checkerId'].some(function (k) { return k in v; })) e.action = 'Nothing has changed.';
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
      var coOwner = (action.coOwnerIds || []).indexOf(Number(personId)) >= 0;
      var raiser = Number(action.raisedById) === Number(personId);
      // a close-out check waiting for a named person: they, or a Team Leader or the Group Head, confirm it (1.9.0.0)
      var named = action.status === 'Completed' && !!action.checkerId;
      var checker = named && Number(action.checkerId) === Number(personId);
      var lead = access.isManagement ? access.canWrite(k) : access.isEngineerIn(k);
      var chair = access.chairs(k);
      var open = isOpen(action.status);
      var finished = action.status === 'Closed' || action.status === 'Completed';
      var edits = lead || chair || raiser;
      return {
        owner: owner,
        coOwner: coOwner,
        checker: checker,
        manager: edits,
        canUpdate: access.canWrite(k) || owner || coOwner,
        canExtend: open && (owner || edits),
        canComplete: open && (owner || edits),
        canStatus: open && (owner || edits),
        canReassign: open && (lead || chair || (raiser && !(access.isTechnician && !chair))),
        canClose: named ? (checker || access.isManagement) : (open || action.status === 'Completed') && edits,
        canReopen: finished && (lead || raiser),
        canEdit: open && edits
      };
    }

    // ---- notices, comments and the improvements and degradations register (spec NB-1 to NB-5, REG-1 to REG-5)
    var ENTRY_TYPES = ['Improvement', 'Degradation', 'Concern', 'Opportunity', 'Positive Observation', 'Other'];
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
      return e;
    }

    // v: the fields being changed (title, description, impact, status, outcome). An outcome is needed to
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
      if (!['title', 'description', 'impact', 'status', 'outcome'].some(function (k) { return k in v; })) e.entry = 'Nothing has changed.';
      return e;
    }

    // REG-2: the raiser, the person responsible, the area's engineers and meeting runners, and management.
    function managesEntry(entry, personId, access) {
      var k = entry.areaKey;
      return access.canModerate(k) || access.chairs(k) || Number(entry.raisedById) === Number(personId);
    }

    // Turn a notice or an issue into an action (1.9.0.0): the area's engineers, its meeting leads, the Team Leaders and Group Head.
    function canConvert(areaKey, access) {
      return access.isManagement ? access.canWrite(areaKey) : access.isEngineerIn(areaKey) || access.chairs(areaKey);
    }

    // "Important for": 1 week, 2 weeks, 1 month or 3 months, in days (1.9.0.0)
    var IMPORTANT_FOR = [[7, '1 week'], [14, '2 weeks'], [30, '1 month'], [90, '3 months']];

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
      if (!v.areaKey || !ctx.runsMeetings(v.areaKey)) e.areaKey = 'Only the people who run meetings in this area, and the Team Leaders and Group Head, can do this.';
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
        e.attendeeIds = 'Choose the attendees from the members of the area, and the Team Leaders and Group Head (up to 60).';
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
    var MINUTE_OUTCOMES = ['Discussed', 'Deferred', 'Not reached', 'Action raised', 'Discarded', 'Closed'];
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
      validateEntry: validateEntry, validateEntryUpdate: validateEntryUpdate, managesEntry: managesEntry, noticeRoles: noticeRoles, canConvert: canConvert, IMPORTANT_FOR: IMPORTANT_FOR,
      validateNoticeEdit: validateNoticeEdit, validateComment: validateComment, ENTRY_TYPES: ENTRY_TYPES, IMPACTS: IMPACTS, ENTRY_STATUSES: ENTRY_STATUSES,
      NOTICE_CATEGORIES: NOTICE_CATEGORIES, validateMeeting: validateMeeting, validateCancelMeeting: validateCancelMeeting, nextMonths: nextMonths, MINUTE_OUTCOMES: MINUTE_OUTCOMES,
      DISCUSSION_SECTIONS: DISCUSSION_SECTIONS, missingOutcomes: missingOutcomes, validateAmend: validateAmend, SELF_ONLY: SELF_ONLY, CO_OWNERS: CO_OWNERS, PRIORITIES: PRIORITIES, OPEN_STATUSES: OPEN_STATUSES, OUTCOMES: OUTCOMES
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
        'Blocker,CloseOutcome,ClosureNote,DateClosed,SourceType,SourceId,CoOwnerIds,CloseOutById&$filter=IsOpen eq 1 and FSObjType eq 0',
      notices: "$select=Id,Title,Body,Category,IsImportant,ImportantUntil,ImportantDays,ShownIn,Status,AuthorId,Created,FileDirRef,Revision,LastRequestKey&$filter=Status eq 'Active' and FSObjType eq 0",
      register: '$select=Id,Title,Description,EntryType,Impact,Status,Outcome,RaisedById,ResponsiblePersonId,DateRaised,DateResolved,Revision,' +
        'LastRequestKey,CompetencyId,FileDirRef,Created&$filter=FSObjType eq 0',
      updates: '$select=Id,EntryType,ParentType,ParentId,AuthorId,Created,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1 and FSObjType eq 0',
      meetings: '$select=Id,Title,CompetencyId,MeetingDate,EndTime,Status,ChairId,Location,OnlineLink,Attendees,InviteState,InviteToken,OutlookEventId,' +
        'InviteError,Revision,LastRequestKey,CreatedRequestKey,FileDirRef,CancellationReason,CutoffTime,CutoffUpdatesId,IntervalStart,PreviousMeetingId,StartedById,FinalisedAt,FinalisedById,AmendmentCount,PdfState,PdfVersion&$filter=FSObjType eq 0',
      calendar: "$select=Id,Title,StartTime,AllDay,IsImportant,Status,FileDirRef&$filter=Status eq 'Scheduled' and FSObjType eq 0",
      settings: '$select=Id,Title,Value'
    };

    // Columns a later Setup adds: if the site does not have them yet, the list is read without them.
    var OPTIONAL = { actions: ['CoOwnerIds', 'CloseOutById'], notices: ['ImportantDays', 'ShownIn'] };

    // Reads each list independently; one failure does not hide the others.
    async function load(sp) {
      var raw = {};
      await Promise.all(Object.keys(QUERIES).map(async function (key) {
        try {
          var res = await sp.items(CH.config.lists[key].title, QUERIES[key], null, OPTIONAL[key]);
          raw[key] = { rows: res.rows, complete: res.complete };
        } catch (error) {
          raw[key] = { rows: [], complete: false, error: error.status || 0 };
        }
      }));
      raw.discussed = await discussed(sp, raw);
      return raw;
    }

    // What finalised meetings recorded as Discussed (spec NB-5): it clears the flags raised up to that meeting's cut-off.
    // Only meetings whose cut-off could cover a flag still in the list are read, each by its own (indexed) meeting id,
    // and only the frozen rows in the meeting's MTG folder count (only the flow writes there).
    async function discussed(sp, raw) {
      try {
        var first = (raw.updates.rows || []).filter(function (u) { return u.EntryType === 'Flagged'; })
          .reduce(function (m, u) { return Math.min(m, Number(u.Id)); }, Infinity);
        var mtgs = (raw.meetings.rows || []).filter(function (m) { return m.Status === 'Finalised' && Number(m.CutoffUpdatesId) >= first; });
        var res = await Promise.all(mtgs.map(function (m) {
          return sp.items(CH.config.lists.meetingItems.title, '$select=SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq ' + m.Id + " and RowType eq 'Agenda Item'");
        }));
        var out = [];
        mtgs.forEach(function (m, i) {
          res[i].rows.filter(function (r) { return r.Outcome === 'Discussed' && CH.sp.folderOf(r.FileDirRef) === 'MTG-' + m.Id; }).forEach(function (r) {
            out.push({ competencyId: m.CompetencyId, source: r.SourceType + ':' + r.SourceId, upto: Number(m.CutoffUpdatesId), iso: D.localDate(m.MeetingDate) });
          });
        });
        return out;
      } catch (_) { return []; }
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
      function nameOf(id) { var p = personBySiteId[id]; return p ? CH.names.of(p) : 'Unknown person'; }

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

      // CoOwnerIds is stored as a JSON list of ids ('["112","103"]'); anything else is no co-owners.
      function idList(text) {
        try { var v = JSON.parse(text || '[]'); return Array.isArray(v) ? v.map(Number).filter(function (n) { return n > 0; }) : []; } catch (_) { return []; }
      }

      // One action row as the views use it; also used for finished actions read on demand (actionFrom).
      function actionFrom(r) {
        var primary = areaById[r.CompetencyId];
        var linked = (r.LinkedCompetenciesId || []).map(function (id) { return areaById[id]; }).filter(Boolean);
        var dueIso = D.fromDueDay(r.DueDay);
        var waitingCloseOut = r.Status === 'Completed';
        var words = waitingCloseOut ? { group: 'later', text: 'Waiting for close-out check' } : D.dueWords(dueIso, today);
        // closed just now on this screen: it stays where it was, marked Done, until the person moves on (release 1.2)
        var keptDone = r.Status === 'Closed' && !!r._keep;
        return {
          id: r.Id, ref: 'ACT-' + ('0000' + r.Id).slice(-5), title: r.Title,
          areaKey: primary ? primary.key : '', areaName: primary ? primary.name : 'Unknown area',
          linkedKeys: linked.map(function (a) { return a.key; }),
          ownerId: r.AssignedToId, ownerName: nameOf(r.AssignedToId), raisedById: r.RaisedById,
          coOwnerIds: idList(r.CoOwnerIds), coOwnerNames: idList(r.CoOwnerIds).map(nameOf),
          checkerId: r.CloseOutById ? Number(r.CloseOutById) : null, checkerName: r.CloseOutById ? nameOf(Number(r.CloseOutById)) : '',
          dueIso: dueIso, status: r.Status, extensions: r.ExtensionCount || 0,
          originalIso: r.OriginalDueDate ? D.localDate(r.OriginalDueDate) : dueIso,
          description: r.Description || '', priority: r.Priority || 'Normal', requiresCloseOut: !!r.RequiresCloseOut,
          raisedIso: r.DateRaised ? D.localDate(r.DateRaised) : '', raisedByName: nameOf(r.RaisedById),
          revision: Number(r.Revision) || 1, dueDay: Number(r.DueDay), locked: !!r.PendingRequestKey,
          waitingCloseOut: waitingCloseOut, group: r.Status === 'Closed' && !keptDone ? 'done' : words.group,
          dueText: keptDone ? 'Done' : r.Status === 'Closed' ? 'Closed' : words.text, done: r.Status === 'Closed',
          // still being saved (✓ Sent), and a new one the flow has not numbered yet (a temporary negative id)
          sending: r._sending || '', isNew: !!r._new,
          blocker: r.Status === 'Awaiting Input' ? (r.Blocker || '') : '', closeOutcome: r.CloseOutcome || '', closureNote: r.ClosureNote || '',
          closedIso: r.DateClosed ? D.localDate(r.DateClosed) : '',
          sourceType: r.SourceType || 'None', sourceId: r.SourceId ? Number(r.SourceId) : null
        };
      }
      var actions = (raw.actions.rows || []).filter(function (r) { return !isUncommitted(r) && (r.Status !== 'Closed' || r._keep); }).map(actionFrom);
      function inArea(action, key) { return action.areaKey === key || action.linkedKeys.indexOf(key) >= 0; }

      // Notices: the area is the folder the item sits in, not a typed value.
      var notices = (raw.notices.rows || []).map(function (n) {
        var key = CH.sp.folderOf(n.FileDirRef);
        var createdIso = D.localDate(n.Created);
        var importantUntil = n.ImportantUntil ? D.localDate(n.ImportantUntil) : '';
        // important for the time its author chose (1 week to 3 months; a month before 1.9.0.0), never longer
        var days = [7, 14, 30, 90].indexOf(Number(n.ImportantDays)) >= 0 ? Number(n.ImportantDays) : CH.config.noticeImportantMaxDays;
        var cap = D.addDays(createdIso, days);
        var pinned = !!n.IsImportant && !n.ImportantUntil && !n.ImportantDays;
        var important = !!n.IsImportant && (pinned || (importantUntil ? importantUntil >= today : today <= cap));
        // stored once, shown on every noticeboard it was posted to: "All", or a list of area keys (1.9.0.0)
        var shown = String(n.ShownIn || '').trim();
        var shownAll = shown === 'All';
        var areaKeys = shownAll ? areas.map(function (a) { return a.key; })
          : [key].concat(shown ? shown.split(';').filter(function (k) { return k && k !== key && areaByKey[k]; }) : []);
        return {
          id: n.Id, areaKey: key, title: n.Title, body: n.Body || '', category: n.Category || 'General',
          authorId: n.AuthorId, authorName: nameOf(n.AuthorId), fromOutside: !(membersByArea[key] || {})[n.AuthorId] && !isManagementPerson(n.AuthorId),
          createdIso: createdIso, created: n.Created, important: important, pinned: pinned,
          importantDays: n.ImportantDays ? Number(n.ImportantDays) : null, areaKeys: areaKeys, shownAll: shownAll,
          // notices posted before the Revision column existed have none: they are then sent without a stale check
          revision: Number(n.Revision) || 0, lastRequestKey: n.LastRequestKey || '', sending: n._sending || ''
        };
      }).filter(function (n) { return !!areaByKey[n.areaKey]; })
        .sort(function (a, b) { return String(b.created).localeCompare(String(a.created)); });
      var noticeById = {};
      notices.forEach(function (n) { noticeById[n.id] = n; });

      // Improvements and degradations (spec REG-1): the area is the folder the entry sits in, as the flow made it.
      var entries = (raw.register ? raw.register.rows || [] : []).map(function (e) {
        var key = CH.sp.folderOf(e.FileDirRef);
        return {
          id: e.Id, ref: 'REG-' + ('0000' + e.Id).slice(-5), areaKey: key, title: e.Title, description: e.Description || '', entryType: e.EntryType,
          impact: e.Impact || '', status: e.Status, outcome: e.Outcome || '', raisedById: e.RaisedById, raisedByName: nameOf(e.RaisedById),
          responsibleId: e.ResponsiblePersonId, responsibleName: e.ResponsiblePersonId ? nameOf(e.ResponsiblePersonId) : '',
          raisedIso: e.DateRaised ? D.localDate(e.DateRaised) : (e.Created ? D.localDate(e.Created) : ''),
          resolvedIso: e.DateResolved ? D.localDate(e.DateResolved) : '', revision: Number(e.Revision) || 1,
          open: e.Status === 'Open' || e.Status === 'Under Review', sending: e._sending || '', isNew: !!e._new
        };
      }).filter(function (e) { return !!areaByKey[e.areaKey]; })
        .sort(function (a, b) { return b.id - a.id; });
      var entryById = {};
      entries.forEach(function (e) { entryById[e.id] = e; });

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
        if (u.ParentType === 'Register Entry' && (!entryById[u.ParentId] || entryById[u.ParentId].areaKey !== key)) return;
        if (u.ParentType !== 'Notice' && u.ParentType !== 'Register Entry') return;
        var slot = latest[key + '|' + source] = latest[key + '|' + source] || { key: key, source: source, flaggedBy: null, flagged: false, history: [] };
        if (u.EntryType === 'Flagged') {
          if (!(membersByArea[key] || {})[u.AuthorId] && !isManagementPerson(u.AuthorId)) return;
          slot.flagged = true; slot.flaggedBy = u.AuthorId; slot.flagId = Number(u.Id);
          slot.history.push({ kind: 'Flagged for the next meeting', by: nameOf(u.AuthorId), iso: D.localDate(u.Created) });
        } else if (u.EntryType === 'Flag Withdrawn' && slot.flagged) {
          var notice = u.ParentType === 'Notice' ? noticeById[u.ParentId] : null;
          var entry = u.ParentType === 'Register Entry' ? entryById[u.ParentId] : null;
          var allowed = u.AuthorId === slot.flaggedBy || isManagementPerson(u.AuthorId) ||
            (meetingAdmins[key] || {})[u.AuthorId] || (notice && notice.authorId === u.AuthorId) || (entry && entry.raisedById === u.AuthorId);
          if (allowed) { slot.flagged = false; slot.history.push({ kind: 'Flag withdrawn', by: nameOf(u.AuthorId), iso: D.localDate(u.Created) }); }
        }
      });
      (raw.discussed || []).forEach(function (d) {
        var area = areaById[d.competencyId];
        var slot = area && latest[area.key + '|' + d.source];
        if (slot && slot.flagged && slot.flagId <= d.upto) {
          slot.flagged = false;
        }
      });
      var flags = {};
      Object.keys(latest).forEach(function (k) {
        flags[latest[k].source] = latest[k];
        if (latest[k].flagged) flagged[latest[k].key] = (flagged[latest[k].key] || 0) + 1;
      });
      notices.forEach(function (n) { n.flagged = !!(flags['Notice:' + n.id] || {}).flagged; });
      entries.forEach(function (e) { e.flagged = !!(flags['Register Entry:' + e.id] || {}).flagged; });

      // Meetings (spec MTG-1): in the area's folder; times shown in UK time.
      function meetingFrom(m) {
        var area = areaById[m.CompetencyId];
        var attendees = [];
        try { attendees = JSON.parse(m.Attendees || '[]') || []; } catch (_) { attendees = []; }
        var start = m.MeetingDate ? new Date(m.MeetingDate) : null;
        return {
          id: m.Id, ref: 'MTG-' + ('0000' + m.Id).slice(-5), areaKey: area ? area.key : '', areaName: area ? area.name : '', status: m.Status,
          dateIso: start ? D.localDate(start) : '', start: start ? D.ukTime(start) : '', end: m.EndTime ? D.ukTime(m.EndTime) : '',
          startUtc: m.MeetingDate || '', endUtc: m.EndTime || '', location: m.Location || '', onlineLink: m.OnlineLink || '',
          chairId: m.ChairId, chairName: m.ChairId ? nameOf(m.ChairId) : '', attendeeIds: attendees.map(Number),
          inviteState: m.InviteState || 'None', inviteToken: m.InviteToken || '', inviteError: m.InviteError || '', revision: Number(m.Revision) || 1,
          cancellationReason: m.CancellationReason || '', cutoff: m.CutoffTime || '', intervalStart: m.IntervalStart || '',
          previousId: m.PreviousMeetingId ? Number(m.PreviousMeetingId) : null, locked: isUncommitted(m), cutoffUpdatesId: Number(m.CutoffUpdatesId) || 0,
          finalisedIso: m.FinalisedAt ? D.localDate(m.FinalisedAt) : '', finalisedByName: m.FinalisedById ? nameOf(m.FinalisedById) : '',
          amendments: Number(m.AmendmentCount) || 0, pdfState: m.PdfState || 'None', pdfVersion: Number(m.PdfVersion) || 0,
          sending: m._sending || '', isNew: !!m._new
        };
      }
      var meetings = (raw.meetings.rows || []).filter(function (m) { return !isUncommitted(m); }).map(meetingFrom)
        .filter(function (m) { return !!m.areaKey; }).sort(function (a, b) { return String(a.startUtc).localeCompare(String(b.startUtc)); });
      var meetingById = {};
      meetings.forEach(function (m) { meetingById[m.id] = m; });

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
        var list = actions.filter(function (x) { return inArea(x, a.key) && !x.done; });
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
          openEntries: entries.filter(function (e) { return e.areaKey === a.key && e.open; }).length,
          degradations: entries.filter(function (e) { return e.areaKey === a.key && e.open && e.entryType === 'Degradation'; }).length,
          nextMeeting: m.next, lastMeeting: m.last, meetingStale: stale
        };
      });

      // Who may own an action in an area (ACT-03): its active members, and Team Leaders and the Group Head.
      // On someone's to-do list: what they own, what they share as a co-owner, and a close-out check waiting for them.
      function isMine(a, personId) {
        var me = Number(personId);
        return Number(a.ownerId) === me || a.coOwnerIds.indexOf(me) >= 0 || (a.waitingCloseOut && Number(a.checkerId) === me);
      }

      function ownersFor(key) {
        return people.filter(function (p) {
          return p.Status === 'Active' && ((membersByArea[key] || {})[p.SiteUserId] || CH.config.managementRoles.indexOf(p.Role) >= 0);
        }).map(function (p) { return { id: p.SiteUserId, name: CH.names.of(p), role: p.Role }; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });
      }
      var actionById = {};
      actions.forEach(function (a) { actionById[a.id] = a; });

      return {
        today: today, areas: areas, areaByKey: areaByKey, stats: stats, actions: actions, notices: notices, calendar: calendar,
        entries: entries, entryById: entryById, noticeById: noticeById, flags: flags, people: people, meetings: meetings, meetingById: meetingById,
        inArea: inArea, nameOf: nameOf, ownersFor: ownersFor, isMine: isMine, actionById: actionById, actionFrom: actionFrom, membersByArea: membersByArea, chairsByArea: meetingAdmins,
        sections: {
          actions: section(raw.actions), notices: section(raw.notices), meetings: section(raw.meetings),
          calendar: section(raw.calendar), flags: section(raw.updates), members: section(raw.members), register: section(raw.register)
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

  /* src/domain/optimistic.js */
  // Optimistic saving (release 1.2): a change shows on the screen as soon as it is sent. The rows read from SharePoint
  // are copied and every change still being saved is applied on top, by its request type, before the model is built.
  // When the flow confirms it, the rows are read again and already hold it; when it is refused or fails, it is simply
  // no longer applied, so the screen shows the records as they really are. Nothing here is ever written anywhere.
  CH.optimistic = (function () {
    var D = CH.dates;

    // The UTC instant of a London wall-clock time on a date (GMT or BST, whichever gives that local time back).
    function londonInstant(iso, hhmm) {
      var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
      var hh = +String(hhmm).slice(0, 2), mm = +String(hhmm).slice(3, 5);
      for (var offset = 0; offset <= 1; offset++) {
        var t = new Date(Date.UTC(y, m, d, hh - offset, mm));
        if (D.localDate(t) === iso && D.ukTime(t) === String(hhmm).slice(0, 5)) return t.toISOString();
      }
      return new Date(Date.UTC(y, m, d, hh, mm)).toISOString();
    }

    function copy(list) { return (list || []).map(function (r) { return Object.assign({}, r); }); }
    // the flow adds one to the revision of what it changes; a record with none (older notices) is sent without a stale check
    function bump(row, key) { if (Number(row.Revision)) row.Revision = Number(row.Revision) + 1; row._sending = key; }
    function areaId(raw, key) {
      var c = (raw.competencies.rows || []).filter(function (x) { return x.CompetencyKey === key; })[0];
      return c ? c.Id : null;
    }
    function folderFor(raw, list, key) {
      var any = (raw[list].rows || [])[0];
      var base = any && any.FileDirRef ? String(any.FileDirRef).split('/').slice(0, -1).join('/') : '/Lists/' + list;
      return base + '/' + key;
    }

    // Each kind of change: how it alters the rows. row is the copied target row (found by TargetId); add pushes a new one.
    var ACTIONS = {
      ExtendDeadline: function (row, p) { row.DueDay = D.toDueDay(p.newDueIso); row.ExtensionCount = (Number(row.ExtensionCount) || 0) + 1; },
      MarkComplete: function (row, p, ctx) {
        if (row.RequiresCloseOut) { row.Status = 'Completed'; return; }
        row.Status = 'Closed'; row.IsOpen = false; row.CloseOutcome = 'Completed'; row.ClosureNote = p.note || ''; row.DateClosed = ctx.nowIso; row._keep = true;
      },
      ChangeStatus: function (row, p) { row.Status = p.status; row.Blocker = p.status === 'Awaiting Input' ? p.blocker : ''; },
      ReassignAction: function (row, p) { row.AssignedToId = Number(p.ownerId); row.CoOwnerIds = JSON.stringify((p.coOwnerIds || []).map(String)); },
      CloseAction: function (row, p, ctx) {
        row.Status = 'Closed'; row.IsOpen = false; row.CloseOutcome = p.outcome; row.ClosureNote = p.note || ''; row.DateClosed = ctx.nowIso; row._keep = true;
      },
      ReopenAction: function (row) { row.Status = 'In Progress'; row.IsOpen = true; row.CloseOutcome = null; row.ClosureNote = null; row.DateClosed = null; },
      EditActionDetails: function (row, p) {
        if ('title' in p) row.Title = p.title;
        if ('description' in p) row.Description = p.description;
        if ('priority' in p) row.Priority = p.priority;
        if ('requiresCloseOut' in p) row.RequiresCloseOut = !!p.requiresCloseOut;
        if ('checkerId' in p) row.CloseOutById = p.checkerId;
      }
    };
    var NOTICES = {
      EditNotice: function (row, p, ctx) {
        if ('title' in p) row.Title = p.title;
        if ('body' in p) row.Body = p.body;
        if ('category' in p) row.Category = p.category;
        if ('important' in p) {
          row.IsImportant = !!p.important;
          row.ImportantDays = p.important ? p.importantDays : null;
          row.ImportantUntil = p.important ? D.addDays(ctx.today, p.importantDays) + 'T12:00:00Z' : null;
        }
      },
      PinNotice: function (row, p) { row.IsImportant = !!p.pinned; row.ImportantUntil = null; row.ImportantDays = null; },
      ArchiveNotice: function (row) { row._remove = true; }
    };
    var ENTRIES = {
      UpdateRegisterEntry: function (row, p, ctx) {
        ['title', 'description', 'impact', 'status', 'outcome'].forEach(function (k) {
          if (k in p) row[k.charAt(0).toUpperCase() + k.slice(1)] = p[k];
        });
        if (p.status === 'Resolved' || p.status === 'Closed') row.DateResolved = row.DateResolved || ctx.nowIso;
        if (p.status === 'Open' || p.status === 'Under Review') row.DateResolved = null;
      }
    };
    var MEETINGS = {
      UpdateMeeting: function (row, p) {
        var start = row.MeetingDate ? new Date(row.MeetingDate) : null;
        var dateIso = p.dateIso || (start ? D.localDate(start) : '');
        if (dateIso && ('dateIso' in p || 'start' in p)) row.MeetingDate = londonInstant(dateIso, p.start || D.ukTime(start));
        if (dateIso && ('dateIso' in p || 'end' in p)) row.EndTime = londonInstant(dateIso, p.end || (row.EndTime ? D.ukTime(row.EndTime) : '11:00'));
        if ('location' in p) row.Location = p.location;
        if ('onlineLink' in p) row.OnlineLink = p.onlineLink;
        if ('chairId' in p) row.ChairId = Number(p.chairId);
        if ('attendeeIds' in p) row.Attendees = JSON.stringify(p.attendeeIds.map(String));
      },
      CancelMeeting: function (row, p) { row.Status = 'Cancelled'; row.CancellationReason = p.reason || ''; }
    };

    // New records: shown at once with a temporary negative id until the flow gives them their own.
    function addAction(raw, rows, e, p, ctx, n) {
      rows.push({ Id: -n, Title: p.title, Description: p.description, CompetencyId: areaId(raw, p.areaKey), LinkedCompetenciesId: [],
        AssignedToId: Number(p.ownerId), RaisedById: ctx.personId, DateRaised: ctx.nowIso, DueDay: D.toDueDay(p.dueIso), OriginalDueDate: p.dueIso + 'T12:00:00Z',
        Status: 'Open', IsOpen: true, Priority: p.priority || 'Normal', ExtensionCount: 0, RequiresCloseOut: !!p.requiresCloseOut, Revision: 1,
        CoOwnerIds: JSON.stringify((p.coOwnerIds || []).map(String)), CloseOutById: p.checkerId || null, SourceType: 'None', _sending: e.key, _new: true,
        FileDirRef: folderFor(raw, 'actions', p.areaKey) });
    }
    function addEntry(raw, rows, e, p, ctx, n) {
      rows.push({ Id: -n, Title: p.title, Description: p.description, EntryType: p.entryType, Impact: p.impact, Status: 'Open', RaisedById: ctx.personId,
        DateRaised: ctx.nowIso, Created: ctx.nowIso, Revision: 1, CompetencyId: areaId(raw, p.areaKey), FileDirRef: folderFor(raw, 'register', p.areaKey),
        _sending: e.key, _new: true });
    }
    function addMeeting(raw, rows, e, p, ctx, n) {
      rows.push({ Id: -n, Title: 'Meeting', CompetencyId: areaId(raw, p.areaKey), MeetingDate: londonInstant(p.dateIso, p.start), EndTime: londonInstant(p.dateIso, p.end),
        Status: 'Scheduled', ChairId: Number(p.chairId) || null, Location: p.location || '', OnlineLink: p.onlineLink || '',
        Attendees: JSON.stringify((p.attendeeIds || []).map(String)), InviteState: 'None', Revision: 1, FileDirRef: folderFor(raw, 'meetings', p.areaKey),
        _sending: e.key, _new: true });
    }

    var TABLES = [
      ['actions', 'Action', ACTIONS, { RaiseAction: addAction }],
      ['notices', 'Notice', NOTICES, {}],
      ['register', 'Register Entry', ENTRIES, { RaiseRegisterEntry: addEntry }],
      ['meetings', 'Meeting', MEETINGS, { ScheduleMeeting: addMeeting }]
    ];

    // raw: CH.model.load() output; entries: tracker entries; keep: { actionId: row } actions closed on this screen, still shown.
    // ctx: { personId, today, now }. Returns a new raw; the original is not touched.
    function apply(raw, entries, keep, ctx) {
      var out = Object.assign({}, raw);
      var c = { personId: Number(ctx.personId), today: ctx.today, nowIso: (ctx.now || new Date()).toISOString() };
      var sending = (entries || []).filter(function (e) { return (e.state === 'submitted' || e.state === 'slow') && e.payload; })
        .sort(function (a, b) { return a.submittedAt - b.submittedAt; });
      var n = 0;
      TABLES.forEach(function (t) {
        if (!raw[t[0]]) return;
        var rows = copy(raw[t[0]].rows);
        if (t[0] === 'actions') {
          Object.keys(keep || {}).forEach(function (id) {
            if (!rows.some(function (r) { return Number(r.Id) === Number(id); })) rows.push(Object.assign({}, keep[id], { _keep: true }));
          });
        }
        sending.forEach(function (e) {
          var p = e.payload || {};
          if (t[3][e.type]) { n++; t[3][e.type](raw, rows, e, p, c, n); return; }
          if (!t[2][e.type] || (e.targetType || 'Action') !== t[1]) return;
          var row = rows.filter(function (r) { return Number(r.Id) === Number(e.targetId); })[0];
          if (!row) return;
          t[2][e.type](row, p, c);
          bump(row, e.key);
        });
        out[t[0]] = Object.assign({}, raw[t[0]], { rows: rows.filter(function (r) { return !r._remove; }) });
      });
      return out;
    }

    // The request types shown this way; anything else is shown as before (on its own page, or in the status line).
    function covers(type) {
      return TABLES.some(function (t) { return !!t[2][type] || !!t[3][type]; });
    }

    return { apply: apply, covers: covers, londonInstant: londonInstant };
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
      var out = { processing: 'unknown', reminders: 'unknown', administration: 'ok', adminReason: '', records: 'ok', recordsReason: '', meetings: 'ok', meetingsReason: '', reason: '', checkedAt: null, lastDailyRun: null,
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
        // Notices and the register also have their own flow (4 Records).
        if (report.records === 'Down') { out.records = 'down'; out.recordsReason = report.recordsReason || 'Changes to notices and the register are not being picked up.'; }
        // and meetings (5 Meetings)
        if (report.meetings === 'Down') { out.meetings = 'down'; out.meetingsReason = report.meetingsReason || 'Meeting bookings and changes are not being picked up.'; }
      }
      var daily = value(rows, 'LastDailyRun');
      // the switches that fall back when Outlook invitations or PDF conversion cannot be used (Setup 1.3); Yes unless set to No
      out.invitesEnabled = value(rows, 'InvitesEnabled') !== 'No';
      out.pdfEnabled = value(rows, 'PdfEnabled') !== 'No';
      // before go-live (spec §7.4): what people create is marked as a test record, so it can be removed in one go
      out.testing = value(rows, 'PreGoLiveTesting') === 'Yes';
      if (daily) {
        out.lastDailyRun = new Date(daily);
        out.reminders = (now.getTime() - out.lastDailyRun.getTime()) / 3600000 > DAILY_LIMIT_HOURS ? 'stale' : 'ok';
      }
      return out;
    }

    return { judge: judge, hours: hours };
  })();

  /* src/domain/agenda.js */
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
    // Each action opens with open(action); mark(action) gives its ✓ Sent / ✓✓ Saved mark, if any (release 1.2).
    function actionList(actions, sub, emptyText, state, open, mark) {
      if (state === 'unavailable') return null;
      if (!actions.length) return h('p', { class: 'muted', text: emptyText });
      var out = [];
      GROUPS.forEach(function (g) {
        var rows = actions.filter(function (a) { return a.group === g[0]; })
          .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); });
        if (!rows.length) return;
        out.push(h('h3', { class: 'group-title' }, h('span', { class: 'dot', style: 'background:' + g[2], 'aria-hidden': 'true' }), g[1]));
        out.push(h('ul', { class: 'items' }, rows.map(function (a) {
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: open ? function () { open(a); } : null, disabled: open ? null : true },
            h('span', null, h('span', { class: 't', text: a.title }), h('span', { class: 's' }, sub(a), mark ? mark(a) : null)),
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


    // Said to screen readers only (release 1.2): a change that is now saved. Sighted readers see ✓✓ Saved beside it.
    function say(root, text) {
      var region = root.querySelector('[data-ch-said]');
      if (region) region.textContent = text;
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
            h('h2', { text: title }), summary ? h('span', { class: 'hm-sum', text: summary }) : null, arrow),
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
      actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast, say: say,
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
        // only the dialog on top answers: one opened over another (an action from a meeting) closes on its own
        if (scrim.parentNode && scrim.parentNode.lastElementChild !== scrim) return;
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
      if (String(app.person.KnownAs || '').trim()) return String(app.person.KnownAs).trim();
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

    // A uniform card: title on one line, then a meta line with chips. The title opens the action; on your own to-dos
    // "Mark as done" sits on the card, and once done (while you stay on the page) "Reopen" where you may (release 1.2).
    function actionCard(app, a, meta, quick) {
      var r = quick && !a.isNew ? CH.rules.roles(a, app.person.SiteUserId, app.access) : null;
      var blocked = app.queueBlocked() || (a.locked && !a.sending);
      var button = !r || blocked ? null : a.done ? (r.canReopen ? ui.button('Reopen', function () { app.quickReopen(a); }) : null)
        : r.canComplete && !a.waitingCloseOut ? ui.button('Mark as done', function () { app.quickDone(a); }) : null;
      if (button) button.classList.add('btn-small');
      return h('div', { class: 'hm-card' + (a.done ? ' done' : '') },
        h('button', { type: 'button', class: 'item-open t', title: a.title, onclick: function () { app.openAction(a); }, text: a.title }),
        h('span', { class: 'hm-meta' }, meta, app.markAction(a),
          h('span', { class: 'when w-' + (a.done ? 'ok' : a.waitingCloseOut ? 'later' : a.group), text: a.dueText }), button));
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
        var evs = mine.filter(function (a) { return !a.waitingCloseOut && !a.done && (a.dueIso === iso || (i === 0 && a.group === 'late')); }).sort(byDue).map(function (a) {
          return h('button', { type: 'button', class: 'hm-ev ' + (a.group === 'late' ? 'late' : 'soon'), title: a.title + ' – ' + a.dueText, onclick: function () { app.openAction(a); }, text: a.title });
        }).concat(keys.filter(function (k) { return m.stats[k].nextMeeting === iso; }).map(function (k) {
          var mt = m.meetings.filter(function (x) { return x.areaKey === k && x.dateIso === iso && x.status !== 'Cancelled'; })[0];
          return mt ? h('button', { type: 'button', class: 'hm-ev mtg', title: m.areaByKey[k].name + ' meeting at ' + mt.start, onclick: function () { app.openMeeting(mt); },
            text: m.areaByKey[k].name + ' meeting ' + mt.start })
            : h('span', { class: 'hm-ev mtg', title: m.areaByKey[k].name + ' meeting', text: m.areaByKey[k].name + ' meeting' });
        }));
        var weekend = dow === 'Saturday' || dow === 'Sunday';
        days.push(h('div', { class: 'hm-day' + (i === 0 ? ' today' : '') + (weekend ? ' weekend' : '') },
          h('div', { class: 'hm-dh' }, h('b', { text: String(Number(iso.slice(8, 10))) }), h('span', { text: dow.slice(0, 3) }), i === 0 ? h('em', { text: 'Today' }) : null),
          evs.slice(0, 2), evs.length > 2 ? h('span', { class: 'hm-plus', text: '+ ' + (evs.length - 2) + ' more' }) : null,
          evs.length ? null : h('span', { class: 'hm-none', text: weekend ? 'Weekend' : 'Nothing due' })));
      }
      var due = mine.filter(function (a) { return !a.waitingCloseOut && !a.done && D.daysBetween(m.today, a.dueIso) < 7; }).length;
      var meets = keys.filter(function (k) { var n = m.stats[k].nextMeeting; return n && D.daysBetween(m.today, n) < 7; }).length;
      // a week with nothing in it is one line, not seven empty boxes (release 1.2)
      return { el: due || meets ? h('div', { class: 'hm-week' }, days) : h('p', { class: 'week-empty', text: 'Nothing due and no meetings this week.' }) };
    }

    function tileFor(app, a) {
      var m = app.model;
      var s = m.stats[a.key];
      var viewOnly = !app.access.canWrite(a.key);
      var unavailable = m.sections.actions === 'unavailable';
      var open = app.state.homeArea === a.key;
      return h('button', { type: 'button', class: 'tile hm-tile' + (viewOnly ? ' view-only' : ''), 'data-area': a.key, 'aria-pressed': String(open),
        'aria-label': a.name + (viewOnly ? ', view only' : ''), onclick: function () { app.openAreaHere(open ? null : a.key); } },
        h('b', { title: a.name, text: app.state.homeArea ? CH.config.shortNames[a.key] || a.name : a.name }),
        h('span', { class: 'hm-tr' }, unavailable ? h('span', { class: 'when w-soon', text: 'Action figures unavailable' })
          : h('span', { class: 'when w-' + (s.late ? 'late' : 'ok'), title: s.late ? s.late + ' late' : s.open + ' open' },
            h('span', { class: 'hm-n', text: String(s.late || s.open) }), h('span', { class: 'hm-w', text: s.late ? ' late' : ' open' })),
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
      // Pinned and important notices first; then the other notices and the open register entries, newest first.
      var notices = m.notices.filter(function (n) { return n.areaKeys.indexOf(key) >= 0; });
      var entries = m.entries.filter(function (e) { return e.areaKey === key && e.open; });
      var rest = notices.filter(function (n) { return !n.important; }).map(function (n) { return { n: n, at: n.createdIso }; })
        .concat(entries.map(function (e) { return { e: e, at: e.raisedIso }; }))
        .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      var news = notices.filter(function (n) { return n.important; }).map(function (n) { return { n: n }; }).concat(rest).map(function (x) {
        if (x.e) {
          var en = x.e;
          return h('button', { type: 'button', class: 'hm-rw item-open', title: en.title, onclick: function () { app.openEntry(en); } },
            h('span', { class: 'hm-dot' + (en.entryType === 'Degradation' ? ' bad' : ''), title: en.entryType }),
            h('span', { class: 'hm-tx' }, h('b', { text: en.title }),
              h('small', { text: en.entryType + ' · ' + en.impact + ' impact · ' + en.raisedByName + (en.raisedIso ? ' · ' + D.short(en.raisedIso) : '') +
                (en.flagged ? ' · flagged' : '') }, app.mark(en, 'Register Entry'))));
        }
        var n = x.n;
        return h('button', { type: 'button', class: 'hm-rw item-open', title: n.title, onclick: function () { app.openNotice(n); } },
          h('span', { class: 'hm-dot' + (n.important ? ' on' : ''), title: n.important ? 'Important' : null }),
          h('span', { class: 'hm-tx' }, h('b', { text: n.title }),
            h('small', { text: (n.pinned ? 'Pinned · ' : n.important ? 'Important · ' : '') + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) +
              ' · ' + D.short(n.createdIso) + (n.flagged ? ' · flagged' : '') }, app.mark(n, 'Notice'))));
      });
      // meetings: those to come (and one in progress), then the last one held
      var diary = [];
      var coming = m.meetings.filter(function (x) { return x.areaKey === key && (x.status === 'In Progress' || (x.status === 'Scheduled' && x.dateIso >= m.today)); });
      coming.forEach(function (x, i) {
        var note = app.tracker && app.tracker.forTarget(x.id, 'Meeting');
        var waiting = note && (note.state === 'submitted' || note.state === 'slow');
        diary.push(h('button', { type: 'button', class: 'hm-rw item-open', onclick: function () { app.openMeeting(x); } },
          h('span', { class: 'when ' + (x.status === 'In Progress' ? 'w-soon' : 'w-ok'), text: x.status === 'In Progress' ? 'Now' : D.weekdayShort(x.dateIso) }),
          h('span', { class: 'hm-tx' }, h('b', { text: (i === 0 ? 'Next meeting' : 'Meeting') + ', ' + x.start + (x.location ? ' · ' + x.location : '') }),
            h('small', { text: waiting ? 'change being recorded' : i === 0 && s.flagged ? s.flagged + (s.flagged === 1 ? ' item' : ' items') + ' flagged for discussion' : x.chairName ? x.chairName + ' chairs' : '' }))));
      });
      if (!coming.length) diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-soon', text: 'Not booked' }),
        h('span', { class: 'hm-tx' }, h('b', { text: 'No meeting booked' }), h('small', { text: acc.runsMeetings(key) ? 'Use Book a meeting above' : 'Someone who runs meetings here can book one' }))));
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
          acc.canWrite(key) ? null : h('span', { class: 'vo', text: 'View only' }),
          h('span', { class: 'hm-acts' },
            acc.canWrite(key) && area.status === 'Active' ? ui.button('Raise an action here', function () { app.raiseAction(key); }) : null,
            acc.canPostNotice(key) ? ui.button('Post a notice here', function () { app.postNotice(key); }) : null,
            acc.canWrite(key) && area.status === 'Active' ? ui.button('Raise an issue', function () { app.raiseEntry(key); }) : null,
            acc.runsMeetings(key) ? ui.button('Book a meeting', function () { app.bookMeeting(key); }) : null,
            ui.linkButton('Full page', full(0)),
            h('button', { type: 'button', class: 'hm-x-btn', 'aria-label': 'Close ' + area.name, text: '✕', onclick: function () { app.openAreaHere(null); } }))),
        h('div', { class: 'hm-pb' }, h('div', { class: 'hm-cols' },
          col('Actions', unavailable ? null : acts.length, unavailable ? ui.sectionNote('unavailable', 'actions')
            : acts.length ? ui.fitList(acts, 'all ' + area.name + ' actions', full(0), 'items') : h('p', { class: 'hm-empty', text: 'There are no open actions in ' + area.name + '.' })),
          col('Notices & issues', news.length, [ui.sectionNote(m.sections.notices, 'notices'), ui.sectionNote(m.sections.register, 'improvements and degradations'),
            news.length ? ui.fitList(news, 'all notices and issues', full(1)) : h('p', { class: 'hm-empty', text: 'No notices, and no open improvements or degradations, in ' + area.name + '.' })]),
          col('Meetings & dates', null, ui.fitList(diary, 'all meetings', full(3))))));
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

      var mine = m.actions.filter(function (a) { return m.isMine(a, app.person.SiteUserId); }).sort(byDue);
      var late = mine.filter(function (a) { return a.group === 'late'; });
      var soon = mine.filter(function (a) { return a.group === 'soon' && !a.waitingCloseOut; });
      var later = mine.filter(function (a) { return a.group === 'later' || a.waitingCloseOut; });
      var keys = areaKeysForMe(app);
      var next = keys.filter(function (k) { return m.stats[k].nextMeeting; }).sort(function (a, b) { return m.stats[a].nextMeeting.localeCompare(m.stats[b].nextMeeting); })[0];

      // Just the greeting (release 1.2): the week and the to-dos below say the rest. A failed read is said plainly.
      var out = [h('div', { class: 'hm-hello' }, h('h1', { text: greeting(firstName(app)) }),
        unavailable ? h('p', { text: acc.isManagement ? 'Action figures could not be loaded just now. Reload the page to try again.' : 'Your actions could not be loaded just now.' }) : null),
        adminLine(app)];

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
        var card = function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName }), true); };
        lanes.push(lane('Late', 'var(--late)', late.map(card), 'Nothing late.', function () { app.showMine(0); }));
        lanes.push(lane('Due this week', 'var(--soon)', soon.map(card), 'Nothing due this week.', function () { app.showMine(0); }));
        lanes.push(lane('Coming up', '#8a95a5', later.map(card), 'Nothing further ahead.', function () { app.showMine(0); }));
      }
      var actionsBody = [ui.sectionNote(m.sections.actions, 'actions'), lanes.length ? h('div', { class: 'hm-lanes', style: '--n:' + lanes.length }, lanes) : null];

      var active = m.areas.filter(function (a) { return a.status === 'Active'; });
      var tiles = h('div', { class: 'hm-tiles' + (openKey ? ' compact' : '') }, active.map(function (a) { return tileFor(app, a); }));

      var stack = h('div', { class: 'hm-stack' + (openKey ? ' area-open' : '') + (actsClosed ? ' acts-closed' : '') },
        ui.panel('week', 'Coming up this week', '', week.el, { closed: weekClosed, onToggle: toggle('week') }),
        ui.panel('actions', 'Your to-dos', '', actionsBody,
          { closed: actsClosed, onToggle: toggle('actions'), link: ['See all my to-dos', function () { app.showMine(0); }] }),
        ui.panel('areas', 'Areas', '', tiles,
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
        }, 'There are no open actions in ' + area.name + '.', app.model.sections.actions, app.openAction, app.markAction)
      ];
    }

    // Notices first (pinned and important at the top), then the improvements and degradations register (spec NB-1, REG-4).
    function noticesTab(app, area) {
      var m = app.model;
      var list = m.notices.filter(function (n) { return n.areaKeys.indexOf(area.key) >= 0; });
      list = list.filter(function (n) { return n.important; }).concat(list.filter(function (n) { return !n.important; }));
      var filter = app.state.entryFilter || 'open';
      var entries = m.entries.filter(function (e) {
        return e.areaKey === area.key && (filter === 'all' || (filter === 'open' ? e.open : e.entryType === filter));
      });
      var typeSel = h('select', { 'aria-label': 'Show', onchange: function (e) { app.state.entryFilter = e.target.value; app.refreshView(); } },
        [['open', 'Open entries'], ['all', 'All entries']].concat(CH.rules.ENTRY_TYPES.map(function (t) { return [t, t + 's']; })).map(function (o) {
          return h('option', { value: o[0], selected: o[0] === filter ? true : null, text: o[1] });
        }));
      return [
        h('div', { class: 'row tab-actions' },
          app.access.canPostNotice(area.key) ? ui.button('Post a notice', function () { app.postNotice(area.key); }) : null,
          app.access.canWrite(area.key) && area.status === 'Active' ? ui.button('Raise an improvement or degradation', function () { app.raiseEntry(area.key); }) : null),
        h('h2', { class: 'group-title', text: 'Noticeboard' }),
        ui.sectionNote(m.sections.notices, 'notices'),
        list.length ? h('ul', { class: 'items' }, list.map(function (n) {
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openNotice(n); } },
            h('span', null, h('span', { class: 't', text: n.title }),
              h('span', { class: 's notice-body', text: n.body.length > 240 ? n.body.slice(0, 240) + '…' : n.body }),
              h('span', { class: 's', text: n.category + ' · ' + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.short(n.createdIso) +
                (n.flagged ? ' · flagged for the meeting' : '') }, app.mark(n, 'Notice'))),
            n.pinned ? ui.chip('soon', 'Pinned') : n.important ? ui.chip('soon', 'Important') : null));
        })) : h('p', { class: 'muted', text: 'Nothing has been posted on the ' + area.name + ' noticeboard yet.' }),
        h('h2', { class: 'group-title' }, 'Improvements and degradations ', h('label', { class: 'inline-filter' }, typeSel)),
        ui.sectionNote(m.sections.register, 'improvements and degradations'),
        entries.length ? h('ul', { class: 'items' }, entries.map(function (e) {
          var linked = m.actions.filter(function (a) { return a.sourceType === 'Register' && Number(a.sourceId) === e.id; }).length;
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openEntry(e); } },
            h('span', null, h('span', { class: 't', text: e.ref + ' ' + e.title }),
              h('span', { class: 's', text: e.entryType + ' · ' + e.impact + ' impact · ' + (e.responsibleName ? e.responsibleName + ' responsible · ' : '') +
                (e.raisedIso ? D.short(e.raisedIso) : '') + (linked ? ' · ' + linked + (linked === 1 ? ' linked action' : ' linked actions') : '') +
                (e.flagged ? ' · flagged for the meeting' : '') }, app.mark(e, 'Register Entry'))),
            CH.views.recordPanel.entryChip(e)));
        })) : h('p', { class: 'muted', text: filter === 'open' ? 'No open improvements or degradations in ' + area.name + '.' : 'No entries to show.' })
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

    // Meetings to come, and those held or cancelled, newest first (spec MTG-1).
    function meetingsTab(app, area) {
      var m = app.model;
      var list = m.meetings.filter(function (x) { return x.areaKey === area.key; });
      var coming = list.filter(function (x) { return x.status === 'In Progress' || (x.status === 'Scheduled' && x.dateIso >= m.today); });
      var past = list.filter(function (x) { return coming.indexOf(x) < 0; }).reverse();
      var item = function (x) {
        var st = { 'Scheduled': ['later', 'Booked'], 'In Progress': ['soon', 'In progress'], 'Finalised': ['done', 'Minutes'], 'Cancelled': ['late', 'Cancelled'] }[x.status] || ['later', x.status];
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openMeeting(x); } },
          h('span', null, h('span', { class: 't', text: D.weekday(x.dateIso) + ' ' + D.long(x.dateIso) + ', ' + x.start }),
            h('span', { class: 's', text: [x.location || (x.onlineLink ? 'Online' : ''), x.chairName ? x.chairName + ' chairs' : '', x.attendeeIds.length + ' invited'].filter(Boolean).join(' · ') })),
          ui.chip(st[0], st[1])));
      };
      return [
        h('div', { class: 'row tab-actions' }, app.access.runsMeetings(area.key) ? ui.button('Book a meeting', function () { app.bookMeeting(area.key); }) : null),
        ui.sectionNote(m.sections.meetings, 'meetings'),
        h('h2', { class: 'group-title', text: 'Coming up' }),
        coming.length ? h('ul', { class: 'items' }, coming.map(item)) : h('p', { class: 'muted', text: 'No meeting is booked.' }),
        h('h2', { class: 'group-title', text: 'Earlier' }),
        past.length ? h('ul', { class: 'items' }, past.map(item)) : h('p', { class: 'muted', text: 'No earlier meetings in the Hub.' })
      ];
    }

    function render(app, key, tabIndex) {
      var m = app.model;
      var area = m.areaByKey[key];
      var acc = app.access;
      var s = m.stats[key];
      var out = [];

      out.push(h('nav', { class: 'areastrip', 'aria-label': 'Areas' },
        h('button', { type: 'button', class: 'back', onclick: app.goHome, text: '‹ My week' }),
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
          acc.runsMeetings(key) ? ui.button('Book a meeting', function () { app.bookMeeting(key); }) : null));
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
  // "Post a notice": an instant write. Any active user may post on any active area's noticeboard (K4.1), on one
  // or several at once, or on all of them: the notice is stored once (1.9.0.0). Only members mark it important.
  CH.views = CH.views || {};
  CH.views.noticeForm = (function () {
    var h = CH.dom.h;
    var CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

    // Validation shared by the form and the tests.
    function validate(values) {
      var errors = {};
      if (values.areas && !values.areas.length) errors.areas = 'Choose at least one noticeboard.';
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

      var boxes = areas.map(function (a) {
        return h('input', { type: 'checkbox', value: a.key, checked: a.key === areaKey || (!areaKey && a === areas[0]) ? true : null });
      });
      var everyBox = h('input', { type: 'checkbox', id: 'ch-n-all' });
      var areaList = h('div', { class: 'checks', id: 'ch-n-areas' }, h('label', { class: 'check' }, everyBox, ' All noticeboards'),
        areas.map(function (a, i) { return h('label', { class: 'check' }, boxes[i], ' ' + a.name + (app.access.canWrite(a.key) ? '' : ' (not your area)')); }));
      function chosen() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
      everyBox.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = everyBox.checked; }); refreshArea(); });
      boxes.forEach(function (b) { b.addEventListener('change', function () { everyBox.checked = chosen().length === boxes.length; refreshArea(); }); });
      var title = h('input', { id: 'ch-n-title', type: 'text', maxlength: '255', autocomplete: 'off' });
      var body = h('textarea', { id: 'ch-n-body', rows: '6', maxlength: '5000' });
      var category = h('select', { id: 'ch-n-cat' }, CATEGORIES.map(function (c) { return h('option', { value: c, text: c }); }));
      var important = h('select', { id: 'ch-n-imp' }, [h('option', { value: '0', text: 'Not important' })].concat(CH.rules.IMPORTANT_FOR.map(function (o) {
        return h('option', { value: String(o[0]), text: o[1] });
      })));
      var importantRow = CH.ui.dialog.field('Important for', important);
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var outsideNote = h('p', { class: 'explain' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Post notice' });

      // the notice is kept in the first chosen area you belong to (or the first chosen): that area's moderators look after it
      function home() {
        var keys = chosen();
        return keys.filter(function (k) { return app.access.canWrite(k); })[0] || keys[0];
      }
      function refreshArea() {
        var key = home();
        var member = !!key && app.access.canWrite(key);
        importantRow.style.display = member ? '' : 'none';
        if (!member) important.value = '0';
        var outside = chosen().filter(function (k) { return !app.access.canWrite(k); });
        outsideNote.textContent = outside.length && outside.length < 4 ? 'You are not a member of ' + outside.map(function (k) { return app.model.areaByKey[k].name; }).join(', ') +
          '. Your notice will be shown there as coming from outside the area.' : outside.length ? 'Your notice will be shown as coming from outside the areas you are not a member of.' : '';
        outsideNote.style.display = outside.length ? '' : 'none';
      }

      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-n', title: 'Post a notice' });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        field('Which noticeboards?', areaList),
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
        var values = { title: title.value, body: body.value, category: category.value, areas: chosen() };
        var errors = validate(values);
        if (CH.ui.dialog.showErrors(form, 'ch-n-', { areas: errors.areas, title: errors.title, body: errors.body, cat: errors.category }, ['areas', 'title', 'body', 'cat'])) return;

        var key = home();
        var days = app.access.canWrite(key) ? Number(important.value) : 0;
        var shownIn = values.areas.length === boxes.length && boxes.length > 1 ? 'All' : values.areas.length > 1 ? values.areas.join(';') : '';
        submit.disabled = true;
        submit.textContent = 'Posting…';
        try {
          await app.sp.addToFolder('notices', key, Object.assign({
            Title: values.title.trim(), Body: values.body.trim(), Category: values.category,
            IsImportant: days ? '1' : '0', ImportantDays: days ? String(days) : '', ShownIn: shownIn,
            ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active'
          }, app.testMark()));
          dlg.close();
          app.noticePosted(key, values.areas);
        } catch (error) {
          // An unclear failure may still have saved the notice: look for it by its client key first.
          try {
            var found = await app.sp.items(CH.config.lists.notices.title,
              "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1);
            if (found.rows.length) { dlg.close(); app.noticePosted(key, values.areas); return; }
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
    // release 1.2: short step names, shown as "Step 2 of 4 · Who and where – next: by when" with a progress bar
    var STEPS = [
      { title: 'What needs doing', keys: ['title', 'description'] },
      { title: 'Who and where', keys: ['areaKey', 'ownerId', 'coOwnerIds'] },
      { title: 'By when', keys: ['dueIso', 'priority', 'checkerId'] },
      { title: 'Check and raise', keys: [] }
    ];

    // opts: { entry } raises an action linked to an improvement or degradation, in that entry's area (spec REG-3);
    // { meeting, title } raises one from a meeting in progress, in its area (spec MTG-3);
    // { notice, areas } turns a notice into an action, in one of the areas it is shown in that the person may do this for (1.9.0.0).
    function open(app, areaKey, opts) {
      var m = app.model;
      var entry = opts && opts.entry;
      var meeting = opts && opts.meeting;
      var notice = opts && opts.notice;
      var fixedArea = entry ? entry.areaKey : meeting ? meeting.areaKey : null;
      var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key) && (!fixedArea || a.key === fixedArea) && (!notice || opts.areas.indexOf(a.key) >= 0); });
      if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise actions.', 'info'); return; }
      var today = m.today;
      // the limit an administrator sets (MaxDeadlineYears), the same one the flow checks
      var maxYears = (app.health && app.health.maxDeadlineYears) || CH.config.maxDeadlineYears;
      var step = 0;
      var key = CH.requests.newKey();

      var source = notice || entry;
      var title = h('input', { id: 'ch-r-title', type: 'text', maxlength: '255', autocomplete: 'off', value: (opts && opts.title) || (source ? source.title : '') });
      var description = h('textarea', { id: 'ch-r-description', rows: '5', maxlength: '5000' });
      if (source) description.value = String(notice ? notice.body : entry.description || '').slice(0, 5000);
      // which area: never guessed (backlog 12). It is preselected only when the form is opened from an area, or the
      // person can raise in just one; otherwise they choose it.
      var preset = mine.length === 1 ? mine[0].key : mine.some(function (a) { return a.key === areaKey; }) ? areaKey : '';
      var area = h('select', { id: 'ch-r-areaKey' }, (preset ? [] : [h('option', { value: '', text: 'Choose an area…' })]).concat(mine.map(function (a) {
        return h('option', { value: a.key, selected: a.key === preset ? true : null, text: a.name });
      })));
      var owner = h('select', { id: 'ch-r-ownerId' });
      var due = h('input', { id: 'ch-r-dueIso', type: 'date', min: today, max: R.addYears(today, maxYears) });
      var priority = h('select', { id: 'ch-r-priority' }, R.PRIORITIES.map(function (p) { return h('option', { value: p, selected: p === 'Normal' ? true : null, text: p }); }));
      var closeOut = h('input', { id: 'ch-r-closeOut', type: 'checkbox' });
      var closeOutTouched = false;
      closeOut.addEventListener('change', function () { closeOutTouched = true; });
      priority.addEventListener('change', function () { if (!closeOutTouched) closeOut.checked = priority.value === 'High'; showChecker(); });
      var me = Number(app.person.SiteUserId);
      // co-owners share the action with the owner (up to 5); the close-out check is done by someone other than the owner
      var coBox = h('div', { class: 'checks', id: 'ch-r-coOwnerIds' });
      var coField = field('Co-owners (optional)', coBox, 'They see the action in their to-dos and can add updates.');
      var checker = h('select', { id: 'ch-r-checkerId' });
      var checkerField = field('Who checks it?', checker);
      function eligible() { return m.ownersFor(area.value); }
      function fillCo() {
        var ticked = coIds();
        CH.dom.clear(coBox);
        eligible().filter(function (p) { return String(p.id) !== owner.value; }).forEach(function (p) {
          coBox.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(p.id), checked: ticked.indexOf(Number(p.id)) >= 0 ? true : null }), ' ' + p.name));
        });
        coField.style.display = app.access.canRaiseFor(area.value, -1, me) && coBox.firstChild ? '' : 'none';
      }
      function coIds() {
        return Array.prototype.filter.call(coBox.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return Number(x.value); });
      }
      // the raiser checks it unless someone else is chosen (and the raiser is not the owner)
      var checkerChosen = false;
      checker.addEventListener('change', function () { checkerChosen = true; });
      function fillChecker() {
        var current = checkerChosen ? checker.value : String(me);
        CH.dom.clear(checker);
        eligible().filter(function (p) { return String(p.id) !== owner.value; }).forEach(function (p) {
          checker.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null, text: p.name + (Number(p.id) === me ? ' (you)' : '') }));
        });
      }
      function showChecker() { checkerField.style.display = closeOut.checked ? '' : 'none'; }
      closeOut.addEventListener('change', showChecker);
      owner.addEventListener('change', function () { fillCo(); fillChecker(); });

      var selfNote = h('p', { class: 'explain', id: 'ch-r-self-only', text: 'As a technician you can raise actions for yourself in this area. An engineer, or someone who runs meetings in this area, can raise them for someone else.' });
      function fillOwners() {
        var current = owner.value || String(app.person.SiteUserId);
        CH.dom.clear(owner);
        owner.appendChild(h('option', { value: '', text: area.value ? 'Choose a person' : 'Choose the area first' }));
        if (!area.value) { selfNote.style.display = 'none'; return; }
        // a technician without meeting rights in this area is offered only themselves (spec §4.2)
        m.ownersFor(area.value).filter(function (p) { return app.access.canRaiseFor(area.value, p.id, app.person.SiteUserId); }).forEach(function (p) {
          owner.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
            text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') + (CH.config.managementRoles.indexOf(p.role) >= 0 ? ' – ' + p.role : '') }));
        });
        var selfOnly = !app.access.canRaiseFor(area.value, -1, app.person.SiteUserId) && app.access.canWrite(area.value);
        selfNote.style.display = selfOnly ? '' : 'none';
        if (selfOnly) { owner.removeChild(owner.firstChild); owner.value = String(app.person.SiteUserId); }
      }
      area.addEventListener('change', function () { fillOwners(); fillCo(); fillChecker(); });
      fillOwners();
      fillCo();
      fillChecker();
      showChecker();

      function values() {
        return { title: title.value, description: description.value, areaKey: area.value, ownerId: owner.value,
          dueIso: due.value, priority: priority.value, requiresCloseOut: closeOut.checked,
          coOwnerIds: coField.style.display === 'none' ? [] : coIds(), checkerId: closeOut.checked ? Number(checker.value || me) : undefined };
      }
      function errorsFor(keys) {
        var all = R.validateRaise(values(), {
          today: today, maxYears: maxYears, canWrite: app.access.canWrite, me: me,
          canRaiseFor: function (k, id) { return app.access.canRaiseFor(k, id, app.person.SiteUserId); },
          ownerAllowed: function (k, id) { return m.ownersFor(k).some(function (p) { return Number(p.id) === id; }); }
        });
        var out = {};
        keys.forEach(function (k) { if (all[k]) out[k] = all[k]; });
        return out;
      }

      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-r', title: entry ? 'Turn ' + entry.ref + ' into an action' : notice ? 'Turn a notice into an action' : meeting ? 'Raise an action from the meeting' : 'Raise an action' });
      var progress = h('div', { class: 'progress', 'aria-live': 'polite' });
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var stepBox = h('div');
      var nextBtn = h('button', { type: 'submit', class: 'btn btn-main' });
      var backBtn = h('button', { type: 'button', class: 'btn' });
      var form = h('form', { class: 'dialog-body', novalidate: true }, progress, stepBox, errorBox, h('div', { class: 'row' }, nextBtn, backBtn));
      dlg.body.appendChild(form);

      var panes = [
        [field('Title', title, 'A short summary, for example "Replace FH40 probe".'), field('Description', description, 'What needs doing and anything the owner should know.')],
        [field('Which area is it for?', area), field('Who will do it?', owner), selfNote, coField],
        [field('Target date', due, 'From today up to ' + maxYears + (maxYears === 1 ? ' year' : ' years') + ' ahead.'),
          h('details', { class: 'more' }, h('summary', { text: 'More options' }),
            field('Priority', priority), h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'), checkerField)],
        null
      ];

      function summary() {
        var v = values();
        var ownerName = m.nameOf(Number(v.ownerId));
        return [h('div', { class: 'raise-summary' }, h('span', { class: 'muted small', text: 'You are raising' }),
          h('b', { class: 'big', text: '“' + v.title.trim() + '” in ' + m.areaByKey[v.areaKey].name }),
          h('span', { class: 'small', text: 'for ' + ownerName + ', by ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) })),
        h('dl', { class: 'facts' },
          h('dt', { text: 'What' }), h('dd', null, h('b', { text: v.title.trim() }), h('br'), h('span', { class: 'notice-body', text: v.description.trim() })),
          h('dt', { text: 'Who' }), h('dd', { text: ownerName + ', in ' + m.areaByKey[v.areaKey].name +
            (v.coOwnerIds.length ? ' – co-owners ' + v.coOwnerIds.map(function (id) { return m.nameOf(id); }).join(', ') : '') }),
          h('dt', { text: 'When' }), h('dd', { text: 'By ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) }),
          h('dt', { text: 'Also' }), h('dd', { text: v.priority + ' priority' + (v.requiresCloseOut ? ', with a close-out check by ' + m.nameOf(v.checkerId) : '') }),
          entry ? [h('dt', { text: 'For' }), h('dd', { text: entry.ref + ' ' + entry.title })] : null,
          notice ? [h('dt', { text: 'From' }), h('dd', { text: 'The notice “' + notice.title + '”' })] : null)];
      }

      function go(n) {
        step = Math.max(0, Math.min(STEPS.length - 1, n));
        errorBox.textContent = '';
        CH.dom.clear(progress);
        CH.dom.append(progress, [h('div', { class: 'lbl' }, 'Step ' + (step + 1) + ' of ' + STEPS.length + ' · ', h('b', { text: STEPS[step].title }),
          STEPS[step + 1] ? h('span', { class: 'muted', text: ' – next: ' + STEPS[step + 1].title.toLowerCase() }) : null),
          h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: 'width:' + Math.round((step + 1) * 100 / STEPS.length) + '%' }))]);
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
        var all = errorsFor(['title', 'description', 'areaKey', 'ownerId', 'coOwnerIds', 'dueIso', 'priority', 'checkerId']);
        if (Object.keys(all).length) { errorBox.textContent = 'Something needs changing: ' + all[Object.keys(all)[0]]; return; }
        var v = values();
        nextBtn.disabled = true;
        nextBtn.textContent = 'Sending…';
        try {
          await app.tracker.submit({ key: key, type: 'RaiseAction', label: 'Raise “' + v.title.trim() + '”', payload: {
            areaKey: v.areaKey, title: v.title.trim(), description: v.description.trim(), ownerId: Number(v.ownerId),
            dueIso: v.dueIso, priority: v.priority, requiresCloseOut: v.requiresCloseOut,
            coOwnerIds: v.coOwnerIds.length ? v.coOwnerIds : undefined, checkerId: v.checkerId, sourceEntryId: entry ? entry.id : undefined, sourceNoticeId: notice ? notice.id : undefined,
            sourceMeetingId: meeting ? meeting.id : undefined }, meetingId: meeting ? meeting.id : undefined });
          dlg.close();
          CH.ui.toast(app.root, 'Sent. It shows ✓✓ Saved as soon as it is recorded – you can carry on.', 'ok');
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

    // The panel's line about a change being saved (release 1.2: the change already shows; this says it is on its way).
    // A refusal or a fault is explained in its own card, with Try again.
    function pendingLine(app, action) {
      var entry = app.tracker.forTarget(action.id);
      if (action.isNew) return h('p', { class: 'pending', role: 'status' }, app.mark(action, 'Action'), ' Being saved – it gets its number in a moment, and can then be changed.');
      if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
        return h('p', { class: 'pending', role: 'status' }, app.mark(action, 'Action'), ' ' + entry.label + ' – ' +
          (entry.retrying ? entry.message : entry.state === 'slow' ? 'taking longer than usual, but it will be saved.' : 'you can carry on.'));
      }
      if (action.locked) return h('p', { class: 'pending', role: 'status', text: 'Someone else\'s change to this action is being saved… Try again in a minute.' });
      var mark = app.mark(action, 'Action');
      return mark ? h('p', { class: 'mark-line' }, mark) : null;
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
        var mine = entry && (entry.state === 'submitted' || entry.state === 'slow');
        // your own change still saving does not stop the next one: the flow takes them in order, each against the
        // revision the one before it leaves. Someone else's change being saved does, and so does a raise not yet numbered.
        var busy = (a.locked && !mine) || a.isNew;
        var finished = a.status === 'Closed' || a.waitingCloseOut;
        // the less common changes sit under "More for this action" (plan C.9), only those this person may make
        // release 1.2: each button names what it acts on (backlog 11)
        var more = [
          r.canEdit ? ui.linkButton('Edit this action', function () { show('edit'); }) : null,
          r.canReassign ? ui.linkButton('Give it to someone else', function () { show('reassign'); }) : null,
          r.canStatus ? ui.linkButton('Change its status', function () { show('status'); }) : null,
          r.canClose && !a.waitingCloseOut ? ui.linkButton('Close this action', function () { show('close'); }) : null
        ].filter(Boolean);
        dlg.setTitle(a.title);
        CH.dom.append(dlg.body, [
          h('p', { class: 'what-label', text: 'Action · ' + (a.isNew ? 'not yet numbered' : a.ref) + ' · ' + a.areaName + (a.priority === 'High' ? ' · High priority' : '') }),
          pendingLine(app, a),
          h('dl', { class: 'facts' },
            h('dt', { text: 'When' }), h('dd', null, ui.chip(a.waitingCloseOut ? 'later' : a.group, a.dueText), ' ', whenText(a)),
            a.blocker ? [h('dt', { text: 'Waiting on' }), h('dd', { class: 'notice-body', text: a.blocker })] : null,
            h('dt', { text: 'Who' }), h('dd', { text: 'Owner: ' + a.ownerName + (a.coOwnerNames.length ? ' · Co-owners: ' + a.coOwnerNames.join(', ') : '') +
              ' · Raised by: ' + a.raisedByName + (a.raisedIso ? ', ' + D.shortYear(a.raisedIso) : '') +
              (a.requiresCloseOut ? ' · Checked by: ' + (a.checkerName || a.raisedByName) : '') }),
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
          more.length ? h('details', { class: 'more' }, h('summary', { text: 'More for this action' }), h('div', { class: 'row' }, more)) : null,
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
              await app.sp.addToFolder('updates', a.areaKey + '/A' + a.id, Object.assign({
                Title: text.slice(0, 80), ClientKey: clientKey, ParentType: 'Action', ParentId: a.id,
                EntryType: 'Progress', IsFlagEvent: '0', IsHidden: '0', Body: text
              }, app.testMark()));
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
            ? 'It will then wait for a close-out check by ' + (a.checkerName || a.raisedByName) + ' before it is closed.'
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
        // co-owners: everyone eligible, the current ones ticked; the new owner is never also a co-owner
        var coBox = h('div', { class: 'checks', id: 'ch-g-coOwnerIds' }, app.model.ownersFor(a.areaKey).map(function (o) {
          return h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(o.id), checked: a.coOwnerIds.indexOf(Number(o.id)) >= 0 ? true : null }), ' ' + o.name);
        }));
        formShell('Reassign', [h('p', { class: 'muted', text: 'Now: ' + a.ownerName + '. Both people get an email.' }),
          field('New owner', owner), field('Co-owners (optional)', coBox), field('Why?', reason, 'At least 10 characters.')], 'Reassign',
          function (form) {
            var v = { ownerId: owner.value ? Number(owner.value) : '', reason: reason.value,
              coOwnerIds: Array.prototype.filter.call(coBox.querySelectorAll('input'), function (x) { return x.checked && Number(x.value) !== Number(owner.value); }).map(function (x) { return Number(x.value); }) };
            var allowed = { ownerAllowed: function (key, pid) { return app.model.ownersFor(key).some(function (o) { return Number(o.id) === pid; }); } };
            var name = (owners.filter(function (o) { return Number(o.id) === v.ownerId; })[0] || {}).name;
            return send(form, 'ReassignAction', { ownerId: v.ownerId, reason: v.reason.trim(), coOwnerIds: v.coOwnerIds }, 'Reassign to ' + name,
              R.validateReassign(a, v, allowed), ['ownerId', 'coOwnerIds', 'reason'], 'ch-g-');
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
        var current = Number(a.checkerId || a.raisedById);
        var checker = h('select', { id: 'ch-e-checkerId' }, app.model.ownersFor(a.areaKey).filter(function (o) { return Number(o.id) !== Number(a.ownerId); }).map(function (o) {
          return h('option', { value: String(o.id), selected: Number(o.id) === current ? true : null, text: o.name });
        }));
        var checkerField = field('Who checks it?', checker);
        function showChecker() { checkerField.style.display = closeOut.checked ? '' : 'none'; }
        closeOut.addEventListener('change', showChecker);
        showChecker();
        formShell('Edit details', [field('What needs doing', title), field('Description', description), field('Priority', priority),
          h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'), checkerField], 'Save changes',
          function (form) {
            var v = {};
            if (title.value.trim() !== a.title) v.title = title.value.trim();
            if (description.value.trim() !== a.description) v.description = description.value.trim();
            if (priority.value !== a.priority) v.priority = priority.value;
            if (closeOut.checked !== a.requiresCloseOut) v.requiresCloseOut = closeOut.checked;
            if (closeOut.checked && checker.value && Number(checker.value) !== current) v.checkerId = Number(checker.value);
            var allowed = { ownerAllowed: function (key, pid) { return app.model.ownersFor(key).some(function (o) { return Number(o.id) === pid; }); } };
            return send(form, 'EditActionDetails', v, 'Edit details', R.validateEdit(a, v, allowed), ['title', 'description', 'priority', 'checkerId'], 'ch-e-');
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
        { label: 'Mine', who: 'AssignedToId', pick: function (a) { return app.model.isMine(a, me); } },
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
      var bar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'My to-dos' }, tabs.map(function (t, i) {
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
        h('h1', { text: 'My to-dos' }),
        h('div', { class: 'row' }, h('label', { for: 'ch-m-area', text: 'Area ' }), filter),
        bar,
        h('div', { class: 'panel', role: 'tabpanel' },
          ui.sectionNote(app.model.sections.actions, 'actions'),
          ui.actionList(list, function (a) { return a.areaName + (tab === 0 ? '' : ' · ' + a.ownerName) + (a.blocker ? ' · waiting on something' : ''); },
            tab === 0 ? 'You have no open actions.' : 'No open actions here.', app.model.sections.actions, app.openAction, app.markAction),
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
      return (app.people || []).filter(function (p) { return !q || String(p.Title).toLowerCase().indexOf(q) >= 0 || String(p.KnownAs || '').toLowerCase().indexOf(q) >= 0 || String(p.Email || '').toLowerCase().indexOf(q) >= 0; })
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
        h('ul', { class: 'items people-list' }, items(app))
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
          h('span', null, h('span', { class: 't', text: CH.names.of(p) }), h('span', { class: 's', text: (p.KnownAs ? p.Title + ' · ' : '') + notes.join(' · ') })),
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
      var known = h('input', { id: 'ch-pa-known', type: 'text', maxlength: '40', autocomplete: 'off' });
      var posts = h('input', { id: 'ch-pa-posts', type: 'checkbox', checked: true });
      var areas = areaTable(app, 'ch-pa-', {}, function () { return role.value; });
      var result = h('div', { class: 'result' });
      var paste = h('textarea', { id: 'ch-pa-list', rows: '8', placeholder: 'firstname.lastname@edf-energy.com, Technician, GRS RP, Jo' });
      var pasteResult = h('ul', { class: 'plain result' });
      CH.dom.append(dlg.body, [
        h('h3', { text: 'One person' }),
        CH.ui.dialog.field('Email address', email, 'Their work email, as in Outlook.'),
        h('div', { class: 'row two' }, CH.ui.dialog.field('Known as', known, 'How their name shows in the Hub, e.g. Joe. Optional.'), CH.ui.dialog.field('Role', role)),
        areas.node,
        h('label', { class: 'check' }, posts, ' Can post notices'),
        h('div', { class: 'row' }, ui.button('Add this person', function () {
          var v = email.value.trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { CH.dom.clear(result); result.appendChild(h('p', { class: 'field-error', text: 'Enter their email address.' })); email.focus(); return; }
          sendAndShow(app, result, { type: 'AddPerson', payload: { email: v, role: role.value, areas: areas.value(), canPostNotices: posts.checked, knownAs: known.value.trim() }, label: 'Add ' + v });
        }, 'main')),
        result,
        h('h3', { text: 'Or paste a list' }),
        h('p', { class: 'muted small', text: 'One person a line: email, role, the area keys separated by spaces (for example FLK GRS RP), and optionally the name they are known by. Engineers run their areas\' meetings; change that afterwards on their page.' }),
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
              payload: { email: line.email, role: line.role, canPostNotices: true, knownAs: line.knownAs, areas: line.keys.map(function (k) { return { key: k, chair: line.role === 'Engineer', expires: '' }; }) } });
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
        var out = { text: l, email: (parts[0] || '').toLowerCase(), role: parts[1] || '', keys: (parts[2] || '').split(/\s+/).filter(Boolean).map(function (k) { return k.toUpperCase(); }), knownAs: (parts[3] || '').slice(0, 40) };
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) out.error = 'Not an email address.';
        else if (ROLES.indexOf(out.role) < 0) out.error = 'The role must be Technician, Engineer, Team Leader or Group Head.';
        else if (out.keys.some(function (k) { return keys.indexOf(k) < 0; })) out.error = 'Unknown area: ' + out.keys.filter(function (k) { return keys.indexOf(k) < 0; }).join(', ') + '.';
        return out;
      });
    }

    async function personDialog(app, p) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-pp', title: CH.names.of(p), wide: true });
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
      var known = h('input', { id: 'ch-pp-known', type: 'text', maxlength: '40', autocomplete: 'off', value: p.KnownAs || '' });
      var nameResult = h('div', { class: 'result' });
      // the name someone is known by changes nobody's access, so an administrator may set it for anyone, themselves too
      var nameRow = left ? null : [
        h('div', { class: 'row known-row' }, CH.ui.dialog.field('Known as', known, 'How their name shows in the Hub, e.g. Joe. Leave empty to show ' + p.Title + '.'),
          ui.button('Save name', function () {
            sendAndShow(app, nameResult, { type: 'SetKnownAs', label: 'Known as for ' + p.Title, payload: { personId: p.SiteUserId, knownAs: known.value.trim() } });
          })),
        nameResult];
      var note = self ? h('p', { class: 'section-note', text: 'You can\'t change your own access. Ask another administrator.' })
        : left ? h('p', { class: 'section-note', text: p.Title + ' is marked as having left. Reactivate them to give them access again, then choose their areas.' }) : null;
      CH.dom.append(dlg.body, [
        h('p', { class: 'muted small', text: p.Title + ' · ' + (p.Email || '') + (CH.config.managementRoles.indexOf(p.Role) >= 0 ? ' · Team Leaders and the Group Head work in every area through their role.' : '') }),
        nameRow,
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
      if (self) Array.prototype.forEach.call(dlg.body.querySelectorAll('input, select, .actions-row .btn'), function (n) { if (n !== known) n.disabled = true; });
      dlg.focusFirst();
    }

    return { list: list, parseList: parseList, personDialog: personDialog };
  })();

  /* src/views/record-panel.js */
  // One notice, or one improvement or degradation, read in full (spec NB-1 to NB-6, REG-1 to REG-5).
  // Comments and flags are instant writes to Updates/{area}; everything else is a queued request checked again by
  // the Records flow. Only the choices this person may make are offered.
  CH.views = CH.views || {};
  CH.views.recordPanel = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var R = CH.rules;
    var ui = CH.ui;
    var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
    var STATUS_WORDS = { 'Open': 'Open', 'Under Review': 'Under review', 'Resolved': 'Resolved', 'Closed': 'Closed' };

    // Comments in the record's own area folder only, oldest first; hidden ones are left out.
    async function loadComments(app, parentType, rec) {
      var res = await app.sp.items(CH.config.lists.updates.title,
        "$select=Id,EntryType,Body,AuthorId,Created,FileDirRef,IsHidden&$filter=ParentId eq " + rec.id + " and ParentType eq '" + parentType + "'", 500);
      return res.rows.filter(function (u) {
        return u.EntryType === 'Comment' && !u.IsHidden && CH.sp.folderOf(u.FileDirRef) === rec.areaKey;
      }).sort(function (a, b) { return a.Id - b.Id; });
    }

    function pendingLine(app, id, kind, locked) {
      // release 1.2: the change already shows; this line says it is on its way. A refusal has its own card, with Try again.
      var entry = app.tracker.forTarget(id, kind);
      var rec = kind === 'Notice' ? app.model.noticeById[id] : app.model.entryById[id];
      if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
        return h('p', { class: 'pending', role: 'status' }, app.mark(rec || { sending: true }, kind), ' ' + entry.label + ' – ' + (entry.retrying ? entry.message : 'you can carry on.'));
      }
      if (locked) return h('p', { class: 'pending', role: 'status', text: 'Being updated… Try again in a minute.' });
      var mark = app.mark(rec, kind);
      return mark ? h('p', { class: 'mark-line' }, mark) : null;
    }

    function busy(app, id, kind) {
      var e = app.tracker.forTarget(id, kind);
      return !!e && (e.state === 'submitted' || e.state === 'slow');
    }

    // The panel shared by notices and entries: a main view and one form at a time.
    function panel(app, cfg) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-rec', title: cfg.title, wide: true, onClose: function () { app.panel = null; } });
      var view = 'main';
      var comments = null;
      var discussed = [];
      var sending = false;

      function rec() { return cfg.get(); }

      async function loadExtras() {
        var r = rec();
        if (!r) return;
        try { comments = await loadComments(app, cfg.parentType, r); } catch (_) { comments = 'error'; }
        try { discussed = await loadDiscussed(r); } catch (_) { discussed = []; }
        if (view === 'main' && dlg.isOpen()) fill();
      }

      // Finalised meetings that took this up (spec NB-6): their frozen agenda rows, by the (indexed) source id.
      async function loadDiscussed(r) {
        var res = await app.sp.items(CH.config.lists.meetingItems.title, '$select=MeetingId,SourceType,Outcome,Notes,FileDirRef&$filter=SourceId eq ' + Number(r.id) +
          " and RowType eq 'Agenda Item'", 500);
        return res.rows.filter(function (x) {
          var m = app.model.meetingById[x.MeetingId];
          return x.SourceType === cfg.parentType && m && m.status === 'Finalised' && CH.sp.folderOf(x.FileDirRef) === 'MTG-' + m.id && x.Outcome;
        }).map(function (x) {
          var m = app.model.meetingById[x.MeetingId];
          return { iso: m.dateIso, text: m.areaName + ' meeting, ' + D.long(m.dateIso) + ': ' + x.Outcome + (x.Notes ? ' – ' + x.Notes : '') };
        });
      }

      // Instant writes: a comment, a flag or a flag withdrawn, in the record's area folder (plan F.5).
      async function writeUpdate(entryType, body) {
        var r = rec();
        var clientKey = CH.requests.newKey();
        var values = { Title: (body || entryType + ': ' + r.title).slice(0, 80), ClientKey: clientKey, ParentType: cfg.parentType, ParentId: r.id,
          EntryType: entryType, IsFlagEvent: entryType === 'Comment' ? '0' : '1', Body: body || '' };
        try {
          await app.sp.addToFolder('updates', r.areaKey, Object.assign(values, app.testMark()));
        } catch (error) {
          // an unclear failure may still have saved it: look for it by its key before reporting a failure
          var found = await app.sp.items(CH.config.lists.updates.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1).catch(function () { return { rows: [] }; });
          if (!found.rows.length) throw error;
        }
      }

      function commentBox(r) {
        if (!app.access.canWrite(r.areaKey)) return h('p', { class: 'muted small', text: 'Members of ' + app.model.areaByKey[r.areaKey].name + ', and the Team Leaders and Group Head, can comment here.' });
        var box = h('textarea', { id: 'ch-rec-body', rows: '3', maxlength: '2000' });
        var err = h('p', { class: 'form-error', role: 'alert' });
        var btn = h('button', { type: 'submit', class: 'btn', text: 'Add comment' });
        var form = h('form', { class: 'comment-form', novalidate: true }, field('Add a comment', box), err, btn);
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          var errors = R.validateComment({ body: box.value });
          if (CH.ui.dialog.showErrors(form, 'ch-rec-', errors, ['body'])) return;
          btn.disabled = true; btn.textContent = 'Saving…';
          try {
            await writeUpdate('Comment', box.value.trim());
            box.value = '';
            comments = null;
            fill();
            await loadExtras();
            CH.ui.toast(app.root, 'Comment added.', 'ok');
          } catch (error) {
            btn.disabled = false; btn.textContent = 'Try again';
            err.textContent = 'Your comment could not be saved just now. Your text has been kept.';
          }
        });
        return form;
      }

      function commentList(r) {
        var mod = app.access.canModerate(r.areaKey);
        if (comments === null) return h('p', { class: 'muted', text: 'Loading comments…' });
        if (comments === 'error') return h('p', { class: 'section-note', text: 'Could not load the comments just now.' });
        if (!comments.length) return h('p', { class: 'muted', text: 'No comments yet.' });
        return h('ul', { class: 'plain comments' }, comments.map(function (c) {
          var hiding = app.tracker.forTarget(c.Id, 'Comment');
          var waiting = hiding && (hiding.state === 'submitted' || hiding.state === 'slow');
          return h('li', null, h('span', null, h('span', { class: 'notice-body', text: c.Body || '' }), h('br'),
            h('span', { class: 'muted small', text: app.model.nameOf(c.AuthorId) + ' · ' + D.short(D.localDate(c.Created)) + ' ' + D.ukTime(c.Created) +
              (waiting ? ' · being hidden' : '') })),
            mod && !waiting && !app.recordsBlocked() ? ui.linkButton('Hide', async function (e) {
              e.target.disabled = true;
              try {
                await app.tracker.submit({ type: 'HideComment', targetId: c.Id, targetType: 'Comment', payload: {}, label: 'Hide a comment on “' + r.title + '”' });
                fill();
              } catch (_) { e.target.disabled = false; CH.ui.toast(app.root, 'Could not send that just now. Try again in a moment.', 'info'); }
            }) : null);
        }));
      }

      function flagRow(r) {
        var slot = app.model.flags[cfg.parentType + ':' + r.id] || { flagged: false, history: [] };
        var area = app.model.areaByKey[r.areaKey];
        var me = app.person.SiteUserId;
        var canFlag = app.access.canWrite(r.areaKey) && !slot.flagged;
        var canWithdraw = slot.flagged && (Number(slot.flaggedBy) === Number(me) || app.access.isManagement || app.access.chairs(r.areaKey) ||
          Number(cfg.ownerOf(r)) === Number(me));
        async function act(kind, done) {
          if (sending) return;
          sending = true;
          try {
            await writeUpdate(kind, '');
            await app.recordChanged();
            CH.ui.toast(app.root, done, 'ok');
          } catch (_) {
            CH.ui.toast(app.root, 'That could not be saved just now. Try again in a moment.', 'info');
          }
          sending = false;
          fill();
        }
        return [
          h('p', null, slot.flagged ? ui.chip('soon', 'Flagged for the next ' + area.name + ' meeting') : h('span', { class: 'muted small', text: 'Not flagged for a meeting.' }), ' ',
            canFlag ? ui.button('Flag for the next meeting', function () { act('Flagged', 'Flagged for the next ' + area.name + ' meeting.'); }) : null,
            canWithdraw ? ui.button('Withdraw the flag', function () { act('Flag Withdrawn', 'Flag withdrawn.'); }) : null),
          slot.history.length || discussed.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Discussion history (' + (slot.history.length + discussed.length) + ')' }),
            h('ul', { class: 'plain' }, slot.history.map(function (x) { return { iso: x.iso, text: x.kind + (x.by ? ' by ' + x.by : '') + ' · ' + D.short(x.iso) }; })
              .concat(discussed).sort(function (a, b) { return String(a.iso).localeCompare(String(b.iso)); }).map(function (x) {
                return h('li', null, h('span', { text: x.text }));
              }))) : null
        ];
      }

      function fill() {
        CH.dom.clear(dlg.body);
        var r = rec();
        if (!r) {
          dlg.setTitle(cfg.missingTitle);
          CH.dom.append(dlg.body, h('p', { text: cfg.missingText }));
          return;
        }
        dlg.setTitle(r.title);
        if (view !== 'main') { CH.dom.append(dlg.body, cfg.form(view, r, ctl)); return; }
        // release 1.2 (backlog 1): it fits the window. On a wide screen the record is on the left and its comments on
        // the right; the less common changes are under "More for this …".
        CH.dom.append(dlg.body, h('div', { class: 'rec-cols' },
          h('div', { class: 'rec-main' },
            cfg.header(r),
            pendingLine(app, r.id, cfg.parentType, false),
            cfg.facts(r),
            flagRow(r),
            cfg.buttons(r, ctl),
            cfg.extra ? cfg.extra(r, ctl) : null),
          h('div', { class: 'rec-side' },
            h('h3', { class: 'group-title', text: 'Comments' }),
            commentList(r),
            commentBox(r))));
      }

      function show(next) { view = next; fill(); var f = dlg.body.querySelector('input, select, textarea'); if (f) f.focus(); }

      // Sends a queued change from one of the forms; errors are shown on the form, which stays open.
      async function send(form, spec, errorBox) {
        var btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
          await app.tracker.submit(spec);
          view = 'main';
          fill();
        } catch (error) {
          btn.disabled = false; btn.textContent = 'Try again';
          errorBox.textContent = error.friendly || 'This could not be sent just now. Nothing has been lost – try again in a moment.';
        }
      }

      var ctl = { show: show, send: send, busy: function (r) { return busy(app, r.id, cfg.parentType) || app.recordsBlocked(); }, dlg: dlg };
      app.panel = { refresh: function () { if (dlg.isOpen()) { if (view === 'main') { comments = null; fill(); loadExtras(); } } } };
      fill();
      loadExtras();
      dlg.focusFirst();
      return dlg;
    }

    function formShell(title, fields, submitLabel, onSubmit, ctl) {
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var form = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: title }), fields, errorBox,
        h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-main', text: submitLabel }),
          h('button', { type: 'button', class: 'btn', text: 'Back', onclick: function () { ctl.show('main'); } })));
      form.addEventListener('submit', function (e) { e.preventDefault(); errorBox.textContent = ''; onSubmit(form, errorBox); });
      return form;
    }

    // ---- notices
    function openNotice(app, id) {
      var m = function () { return app.model; };
      return panel(app, {
        parentType: 'Notice', title: 'Notice', missingTitle: 'Notice not available',
        missingText: 'This notice is not available. It may have been archived.',
        get: function () { return m().noticeById[id]; },
        ownerOf: function (n) { return n.authorId; },
        header: function (n) {
          var area = m().areaByKey[n.areaKey];
          var where = n.shownAll ? 'Every noticeboard' : n.areaKeys.length > 1 ? n.areaKeys.map(function (k) { return m().areaByKey[k].name; }).join(', ') + ' noticeboards' : area.name + ' noticeboard';
          return h('p', { class: 'what-label', text: 'Notice · ' + where + ' · ' + n.category + ' · ' +
            (n.fromOutside ? 'from ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.long(n.createdIso) +
            (n.pinned ? ' · Pinned' : n.important ? ' · Important' : '') });
        },
        facts: function (n) { return h('p', { class: 'notice-body notice-full', text: n.body }); },
        // actions made from this notice, and "Turn into an action" for the engineers, meeting leads and management of an area it is shown in
        extra: function (n, ctl) {
          var list = m().actions.filter(function (a) { return a.sourceType === 'Noticeboard' && Number(a.sourceId) === Number(n.id); });
          var areas = n.areaKeys.filter(function (k) { return R.canConvert(k, app.access); });
          if (!list.length && !areas.length) return null;
          // release 1.2: the heading only when there are actions to list
          return [list.length ? h('h3', { class: 'group-title', text: 'Actions from this notice' }) : null,
            list.length ? h('ul', { class: 'items linked' }, list.map(function (a) {
              return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { ctl.dlg.close(); app.openAction(a); } },
                h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.ownerName })), ui.chip(a.group, a.dueText)));
            })) : null,
            areas.length ? h('div', { class: 'row' }, ui.button('Turn into an action', function () {
              ctl.dlg.close();
              if (!app.queueBlocked()) CH.views.raiseForm.open(app, areas.indexOf(n.areaKey) >= 0 ? n.areaKey : areas[0], { notice: n, areas: areas });
            })) : null];
        },
        buttons: function (n, ctl) {
          var r = R.noticeRoles(n, app.person.SiteUserId, app.access);
          if (!r.canEdit && !r.canPin) return null;
          if (ctl.busy(n)) return h('p', { class: 'muted small', text: app.recordsBlocked() ? 'Changes to notices are paused for the moment.' : '' });
          return h('details', { class: 'more' }, h('summary', { text: 'More for this notice' }), h('div', { class: 'row actions-row' },
            r.canEdit ? ui.button('Edit this notice', function () { ctl.show('edit'); }) : null,
            r.canPin ? ui.button(n.pinned ? 'Unpin it' : 'Pin it', function () { ctl.show('pin'); }) : null,
            r.canArchive ? ui.button('Archive it', function () { ctl.show('archive'); }) : null));
        },
        form: function (view, n, ctl) {
          var label = function (what) { return what + ' “' + n.title + '”'; };
          if (view === 'edit') {
            var r = R.noticeRoles(n, app.person.SiteUserId, app.access);
            var title = h('input', { id: 'ch-ne-title', type: 'text', maxlength: '255', value: n.title });
            var body = h('textarea', { id: 'ch-ne-body', rows: '8', maxlength: '5000' });
            body.value = n.body;
            var cat = h('select', { id: 'ch-ne-category' }, R.NOTICE_CATEGORIES.map(function (c) { return h('option', { value: c, selected: c === n.category ? true : null, text: c }); }));
            // "Important for": not important, or 1 week to 3 months from today
            var imp = h('select', { id: 'ch-ne-important' }, [h('option', { value: '0', text: 'Not important' })].concat(R.IMPORTANT_FOR.map(function (o) {
              return h('option', { value: String(o[0]), text: o[1] + ' from today' });
            })));
            if (n.important && !n.pinned) imp.value = String(n.importantDays || 30);
            return formShell('Edit the notice', [field('Title', title), field('Message', body), field('Category', cat),
              r.canMarkImportant && !n.pinned ? field('Important for', imp) : null],
            'Save changes', function (form, errorBox) {
              var v = {};
              if (title.value.trim() !== n.title) v.title = title.value;
              if (body.value.trim() !== n.body.trim()) v.body = body.value;
              if (cat.value !== n.category) v.category = cat.value;
              var was = n.important && !n.pinned ? String(n.importantDays || 30) : '0';
              if (r.canMarkImportant && !n.pinned && imp.value !== was) { v.important = imp.value !== '0'; if (v.important) v.importantDays = Number(imp.value); }
              var errors = R.validateNoticeEdit(v);
              if (CH.ui.dialog.showErrors(form, 'ch-ne-', errors, ['title', 'body', 'category'])) return;
              if (errors.notice) { errorBox.textContent = errors.notice; return; }
              if ('title' in v) v.title = v.title.trim();
              if ('body' in v) v.body = v.body.trim();
              ctl.send(form, { type: 'EditNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: v, label: label('Edit') }, errorBox);
            }, ctl);
          }
          if (view === 'pin') {
            return formShell(n.pinned ? 'Unpin this notice?' : 'Pin this notice?',
              h('p', { class: 'explain', text: n.pinned ? 'It stops being shown first on the noticeboard.' : 'It is shown first, as important, until someone unpins it.' }),
              n.pinned ? 'Unpin' : 'Pin', function (form, errorBox) {
                ctl.send(form, { type: 'PinNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: { pinned: !n.pinned },
                  label: label(n.pinned ? 'Unpin' : 'Pin') }, errorBox);
              }, ctl);
          }
          return formShell('Archive this notice?',
            h('p', { class: 'explain', text: 'It leaves the noticeboard. It is kept, with its comments, in the history of the area.' }),
            'Archive', function (form, errorBox) {
              ctl.send(form, { type: 'ArchiveNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: {}, label: label('Archive') }, errorBox);
            }, ctl);
        }
      });
    }

    // ---- improvements and degradations
    function entryChip(e) {
      var kind = e.status === 'Resolved' || e.status === 'Closed' ? 'done' : e.entryType === 'Degradation' ? 'late' : 'later';
      return ui.chip(kind, STATUS_WORDS[e.status] || e.status);
    }

    function openEntry(app, id) {
      var m = function () { return app.model; };
      function ownersFor(key) { return m().ownersFor(key); }
      function allowed(key, pid) { return ownersFor(key).some(function (p) { return Number(p.id) === Number(pid); }); }
      function linkedActions(e) { return m().actions.filter(function (a) { return a.sourceType === 'Register' && Number(a.sourceId) === Number(e.id); }); }
      return panel(app, {
        parentType: 'Register Entry', title: 'Issue', missingTitle: 'Issue not available',
        missingText: 'This entry is not available. It may have been removed.',
        get: function () { return m().entryById[id]; },
        ownerOf: function (e) { return e.raisedById; },
        header: function (e) {
          return h('p', { class: 'what-label' }, 'Issue · ' + (e.isNew ? 'not yet numbered' : e.ref) + ' · ' + m().areaByKey[e.areaKey].name + ' · ' + e.entryType + ' · ' + e.impact + ' impact ', entryChip(e));
        },
        facts: function (e) {
          return h('dl', { class: 'facts' },
            h('dt', { text: 'What' }), h('dd', { class: 'notice-body', text: e.description || 'No description.' }),
            h('dt', { text: 'Who' }), h('dd', { text: 'Raised by ' + e.raisedByName + (e.raisedIso ? ' on ' + D.long(e.raisedIso) : '') + '.' }),
            e.outcome ? [h('dt', { text: 'Outcome' }), h('dd', { class: 'notice-body', text: e.outcome + (e.resolvedIso ? ' (' + D.long(e.resolvedIso) + ')' : '') })] : null);
        },
        buttons: function (e, ctl) {
          var can = R.managesEntry(e, app.person.SiteUserId, app.access);
          if (!can) return h('p', { class: 'muted small', text: 'The person who raised it, the area\'s engineers and meeting runners, and the Team Leaders and Group Head can change this entry.' });
          if (ctl.busy(e)) return h('p', { class: 'muted small', text: app.recordsBlocked() ? 'Changes to the register are paused for the moment.' : '' });
          return [e.open ? h('div', { class: 'row' }, ui.button('Mark as resolved', function () { ctl.show('resolve'); })) : null,
            h('details', { class: 'more' }, h('summary', { text: 'More for this issue' }), h('div', { class: 'row actions-row' },
              ui.button('Change its status', function () { ctl.show('status'); }),
              ui.button('Edit this issue', function () { ctl.show('edit'); })))];
        },
        extra: function (e, ctl) {
          var list = linkedActions(e);
          var can = R.managesEntry(e, app.person.SiteUserId, app.access) && !ctl.busy(e);
          var convert = R.canConvert(e.areaKey, app.access) && e.open && !ctl.busy(e);
          return [h('h3', { class: 'group-title', text: 'Linked actions' }),
            list.length ? h('ul', { class: 'items linked' }, list.map(function (a) {
              return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { ctl.dlg.close(); app.openAction(a); } },
                h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.ownerName })), ui.chip(a.group, a.dueText)),
                can ? ui.linkButton('Unlink', function () { ctl.show('unlink:' + a.id); }) : null);
            })) : h('p', { class: 'muted', text: 'No actions are linked to this entry yet.' }),
            (can || convert) && e.open ? h('div', { class: 'row' },
              convert ? ui.button('Turn into an action', function () { ctl.dlg.close(); if (!app.queueBlocked()) CH.views.raiseForm.open(app, e.areaKey, { entry: e }); }) : null,
              can ? ui.button('Link an existing action', function () { ctl.show('link'); }) : null) : null];
        },
        form: function (view, e, ctl) {
          var label = function (what) { return what + ' ' + e.ref; };
          if (view === 'status' || view === 'resolve') {
            var to = view === 'resolve' ? 'Resolved' : e.status;
            var status = h('select', { id: 'ch-re-status' }, R.ENTRY_STATUSES.map(function (s) { return h('option', { value: s, selected: s === to ? true : null, text: STATUS_WORDS[s] }); }));
            var outcome = h('textarea', { id: 'ch-re-outcome', rows: '4', maxlength: '2000' });
            outcome.value = e.outcome;
            return formShell('Change the status', [field('Status', status), field('Outcome', outcome, 'Needed to resolve or close it: what was done or decided.')],
              'Save', function (form, errorBox) {
                var v = { status: status.value, outcome: outcome.value };
                var errors = R.validateEntryUpdate(e, v, { ownerAllowed: allowed });
                if (CH.ui.dialog.showErrors(form, 'ch-re-', errors, ['status', 'outcome'])) return;
                v.outcome = v.outcome.trim();
                ctl.send(form, { type: 'UpdateRegisterEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: v,
                  label: label('Status of') + ' to ' + STATUS_WORDS[v.status].toLowerCase() }, errorBox);
              }, ctl);
          }
          if (view === 'edit') {
            var title = h('input', { id: 'ch-re-title', type: 'text', maxlength: '255', value: e.title });
            var desc = h('textarea', { id: 'ch-re-description', rows: '5', maxlength: '5000' });
            desc.value = e.description;
            var impact = h('select', { id: 'ch-re-impact' }, R.IMPACTS.map(function (x) { return h('option', { value: x, selected: x === e.impact ? true : null, text: x }); }));
            return formShell('Edit the details', [field('Title', title), field('Description', desc), field('Impact', impact)],
              'Save changes', function (form, errorBox) {
                var v = {};
                if (title.value.trim() !== e.title) v.title = title.value.trim();
                if (desc.value.trim() !== e.description.trim()) v.description = desc.value.trim();
                if (impact.value !== e.impact) v.impact = impact.value;
                var errors = R.validateEntryUpdate(e, v, { ownerAllowed: allowed });
                if (CH.ui.dialog.showErrors(form, 'ch-re-', errors, ['title', 'description', 'impact'])) return;
                if (errors.entry) { errorBox.textContent = errors.entry; return; }
                ctl.send(form, { type: 'UpdateRegisterEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: v, label: label('Edit') }, errorBox);
              }, ctl);
          }
          if (view === 'link') {
            var choices = m().actions.filter(function (a) { return a.areaKey === e.areaKey && a.sourceType !== 'Register' && !a.locked; });
            if (!choices.length) {
              return formShell('Link an existing action', h('p', { class: 'muted', text: 'There are no open ' + m().areaByKey[e.areaKey].name + ' actions that can be linked.' }), 'Link', function () {}, ctl);
            }
            var pick = h('select', { id: 'ch-re-actionId' }, choices.map(function (a) { return h('option', { value: String(a.id), text: a.ref + ' ' + a.title + ' (' + a.ownerName + ')' }); }));
            return formShell('Link an existing action', [field('Which action?', pick, 'Open actions in the same area. The action itself is linked; nothing is copied.')],
              'Link', function (form, errorBox) {
                ctl.send(form, { type: 'LinkActionToEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: { actionId: Number(pick.value) },
                  label: 'Link ' + pick.options[pick.selectedIndex].text.split(' (')[0] + ' to ' + e.ref }, errorBox);
              }, ctl);
          }
          var actionId = Number(String(view).split(':')[1]);
          var a = m().actionById[actionId];
          return formShell('Unlink this action?', h('p', { class: 'explain', text: (a ? a.ref + ' ' + a.title : 'The action') + ' stays as it is; it is just no longer linked to ' + e.ref + '.' }),
            'Unlink', function (form, errorBox) {
              ctl.send(form, { type: 'UnlinkActionFromEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: { actionId: actionId },
                label: 'Unlink ' + (a ? a.ref : 'an action') + ' from ' + e.ref }, errorBox);
            }, ctl);
        }
      });
    }

    return { openNotice: openNotice, openEntry: openEntry, entryChip: entryChip, loadComments: loadComments, STATUS_WORDS: STATUS_WORDS };
  })();

  /* src/views/entry-form.js */
  // "Raise an improvement or degradation" (spec REG-1): one form, sent as a queued request. The Records flow
  // creates the entry in the area's folder; until then it shows as being recorded.
  CH.views = CH.views || {};
  CH.views.entryForm = (function () {
    var h = CH.dom.h;
    var R = CH.rules;
    function open(app, areaKey) {
      var m = app.model;
      var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key); });
      if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise entries.', 'info'); return; }
      if (app.recordsBlocked()) { CH.ui.toast(app.root, 'Raising entries is paused while changes can\'t be processed. Please try again later.', 'info'); return; }
      var field = CH.ui.dialog.field;
      var key = CH.requests.newKey();

      var area = h('select', { id: 'ch-e-areaKey' }, mine.map(function (a) { return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name }); }));
      var type = h('select', { id: 'ch-e-entryType' }, R.ENTRY_TYPES.map(function (t) { return h('option', { value: t, text: t }); }));
      var impact = h('select', { id: 'ch-e-impact' }, R.IMPACTS.map(function (x) { return h('option', { value: x, selected: x === 'Medium' ? true : null, text: x }); }));
      var title = h('input', { id: 'ch-e-title', type: 'text', maxlength: '255', autocomplete: 'off' });
      var description = h('textarea', { id: 'ch-e-description', rows: '5', maxlength: '5000' });
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Raise entry' });
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-e', title: 'Raise an improvement or degradation' });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        field('Area', area), field('Type', type), field('Impact', impact),
        field('Title', title, 'A short summary people will recognise.'), field('Description', description),
        errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
      dlg.body.appendChild(form);

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        var v = { areaKey: area.value, entryType: type.value, impact: impact.value, title: title.value, description: description.value };
        var errors = R.validateEntry(v, { canWrite: app.access.canWrite });
        if (CH.ui.dialog.showErrors(form, 'ch-e-', errors, ['areaKey', 'entryType', 'impact', 'title', 'description'])) return;
        submit.disabled = true;
        submit.textContent = 'Sending…';
        try {
          await app.tracker.submit({ key: key, type: 'RaiseRegisterEntry', label: 'Raise “' + v.title.trim() + '”', payload: {
            areaKey: v.areaKey, entryType: v.entryType, impact: v.impact, title: v.title.trim(), description: v.description.trim() } });
          dlg.close();
          CH.ui.toast(app.root, 'Sent. It shows ✓✓ Saved as soon as it is recorded – you can carry on.', 'ok');
        } catch (error) {
          submit.disabled = false;
          submit.textContent = 'Try again';
          errorBox.textContent = error.friendly || 'Your entry could not be sent just now. Nothing has been lost – try again in a moment.';
        }
      });
      title.focus();
    }

    return { open: open };
  })();

  /* src/views/feedback.js */
  // The feedback bubble (spec FB-1 to FB-3) and the administrators' review of it (ADM-5). Sending is an instant
  // write to the Feedback list, where everyone may add but only administrators may read; "Thanks" is shown only once
  // SharePoint has confirmed the save. Who sent it and when come from SharePoint's own Created By and Created.
  CH.views = CH.views || {};
  CH.views.feedback = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var ui = CH.ui;
    var TYPES = ['Suggest an improvement', 'Report a bug', 'Ask a question', 'Other feedback'];
    var STATUSES = ['New', 'In review', 'Answered', 'Done'];

    function validate(v) {
      var e = {};
      if (TYPES.indexOf(v.type) < 0) e.type = 'Choose what kind of feedback this is.';
      var d = String(v.description || '').trim();
      if (!d) e.description = 'Tell us a little more.';
      else if (d.length > 4000) e.description = 'Keep it to 4,000 characters or fewer.';
      return e;
    }

    function bubble(app) {
      // a speech bubble, drawn as an inline SVG (release 1.2)
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      ['M4 5h16v11H9l-5 4z', 'M8 9h8M8 12h5'].forEach(function (d) {
        var p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
      });
      return h('button', { type: 'button', class: 'fb-bubble', 'aria-label': 'Send feedback about the Competency Hub', title: 'Send feedback',
        onclick: function () { openForm(app); } }, h('span', { class: 'ic', 'aria-hidden': 'true' }, svg), h('span', { class: 'fb-label', text: 'Feedback' }));
    }

    function openForm(app) {
      var field = CH.ui.dialog.field;
      var clientKey = CH.requests.newKey();
      var type = h('select', { id: 'ch-fb-type' }, TYPES.map(function (t) { return h('option', { value: t, text: t }); }));
      var description = h('textarea', { id: 'ch-fb-description', rows: '6', maxlength: '4000' });
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Send feedback' });
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-fb', title: 'Send feedback' });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        h('p', { class: 'explain', text: 'Your feedback goes to the Competency Hub administrators. Only they can read it.' }),
        field('What kind of feedback?', type), field('Your feedback', description, 'What happened, or what you would like. Include the page you were on if it helps.'),
        errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
      dlg.body.appendChild(form);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        var v = { type: type.value, description: description.value };
        if (CH.ui.dialog.showErrors(form, 'ch-fb-', validate(v), ['type', 'description'])) return;
        submit.disabled = true;
        submit.textContent = 'Sending…';
        var values = { Title: (v.type + ': ' + v.description.trim()).slice(0, 255), FeedbackType: v.type, Description: v.description.trim(), Status: 'New',
          PageView: String(app.state.view || 'home').slice(0, 100), ClientKey: clientKey };
        try {
          await app.sp.addToFolder('feedback', '', Object.assign(values, app.testMark()));
        } catch (error) {
          // An unclear failure may still have saved it. The sender can read their own item, so look for it first.
          var found = await app.sp.items(CH.config.lists.feedback.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1).catch(function () { return { rows: [] }; });
          if (!found.rows.length) {
            submit.disabled = false;
            submit.textContent = 'Try again';
            errorBox.textContent = 'Your feedback could not be sent just now. Your text has been kept – try again in a moment.';
            return;
          }
        }
        dlg.close();
        CH.ui.toast(app.root, 'Thanks – your feedback has been sent.', 'ok');
      });
      description.focus();
    }

    // ---- review (administrators): a list with filters; open an item, respond and set its status
    async function load(app) {
      var res = await app.sp.items(CH.config.lists.feedback.title,
        '$select=Id,Title,FeedbackType,Description,Status,Response,RespondedById,RespondedOn,PageView,AuthorId,Created&$filter=FSObjType eq 0', 2000);
      return res.rows.sort(function (a, b) { return b.Id - a.Id; });
    }

    async function refresh(app) {
      var showing = function () { return app.state.view === 'admin' && app.adminTab === 3; };
      app.feedback = { loading: true, rows: [], filter: (app.feedback && app.feedback.filter) || { type: '', status: 'open' } };
      if (showing()) app.refreshView();
      try { app.feedback.rows = await load(app); } catch (_) { app.feedback.error = true; }
      app.feedback.loading = false;
      if (showing()) app.refreshView();
    }

    function respond(app, row) {
      var field = CH.ui.dialog.field;
      var status = h('select', { id: 'ch-fr-status' }, STATUSES.map(function (s) { return h('option', { value: s, selected: s === row.Status ? true : null, text: s }); }));
      var response = h('textarea', { id: 'ch-fr-response', rows: '5', maxlength: '4000' });
      response.value = row.Response || '';
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Save' });
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-fr', title: row.FeedbackType, wide: true });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        h('p', { class: 'muted small', text: 'From ' + app.model.nameOf(row.AuthorId) + ' · ' + D.long(D.localDate(row.Created)) + ' ' + D.ukTime(row.Created) +
          (row.PageView ? ' · on the ' + row.PageView + ' page' : '') }),
        h('p', { class: 'notice-body notice-full', text: row.Description || '' }),
        field('Status', status), field('Response', response, 'Kept with the feedback for other administrators. The sender is not emailed.'),
        errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
      dlg.body.appendChild(form);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (response.value.length > 4000) { errorBox.textContent = 'Keep the response to 4,000 characters or fewer.'; return; }
        submit.disabled = true;
        submit.textContent = 'Saving…';
        var values = { Status: status.value, Response: response.value.trim() };
        if (response.value.trim() !== (row.Response || '').trim()) {
          values.RespondedOn = D.ukFormDateTime(new Date());
          if (app.loginName) values.RespondedBy = JSON.stringify([{ Key: app.loginName }]);
        }
        try {
          await app.sp.update('feedback', row.Id, values);
          dlg.close();
          CH.ui.toast(app.root, 'Saved.', 'ok');
          refresh(app);
        } catch (error) {
          submit.disabled = false;
          submit.textContent = 'Try again';
          errorBox.textContent = 'This could not be saved just now. Your text has been kept.';
        }
      });
      status.focus();
    }

    function review(app) {
      var st = app.feedback;
      if (!st) { setTimeout(function () { refresh(app); }, 0); return h('p', { class: 'muted', text: 'Loading feedback…' }); }
      if (st.loading) return h('p', { class: 'muted', text: 'Loading feedback…' });
      if (st.error) return h('p', { class: 'section-note', text: 'The feedback could not be read just now. Reload the page to try again.' });
      var f = st.filter;
      var rows = st.rows.filter(function (r) {
        return (!f.type || r.FeedbackType === f.type) && (f.status === '' || (f.status === 'open' ? r.Status !== 'Done' : r.Status === f.status));
      });
      function setFilter(k) { return function (e) { st.filter[k] = e.target.value; app.refreshView(); }; }
      var typeSel = h('select', { 'aria-label': 'Type', onchange: setFilter('type') }, [h('option', { value: '', text: 'All types' })].concat(TYPES.map(function (t) {
        return h('option', { value: t, selected: t === f.type ? true : null, text: t }); })));
      var statusSel = h('select', { 'aria-label': 'Status', onchange: setFilter('status') }, [['open', 'Not done'], ['', 'Any status']].concat(STATUSES.map(function (s) { return [s, s]; })).map(function (s) {
        return h('option', { value: s[0], selected: s[0] === f.status ? true : null, text: s[1] }); }));
      return [
        h('div', { class: 'row filters' }, h('label', null, 'Type ', typeSel), h('label', null, 'Status ', statusSel), ui.linkButton('Check again', function () { refresh(app); })),
        rows.length ? h('ul', { class: 'items' }, rows.map(function (r) {
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { respond(app, r); } },
            h('span', null, h('span', { class: 't', text: r.Description ? (r.Description.length > 140 ? r.Description.slice(0, 140) + '…' : r.Description) : r.Title }),
              h('span', { class: 's', text: r.FeedbackType + ' · ' + app.model.nameOf(r.AuthorId) + ' · ' + D.short(D.localDate(r.Created)) + (r.Response ? ' · answered' : '') })),
            ui.chip(r.Status === 'Done' ? 'done' : r.Status === 'New' ? 'soon' : 'later', r.Status)));
        })) : h('p', { class: 'muted', text: st.rows.length ? 'No feedback matches these filters.' : 'No feedback has been sent yet.' })
      ];
    }

    return { bubble: bubble, openForm: openForm, review: review, refresh: refresh, validate: validate, TYPES: TYPES, STATUSES: STATUSES };
  })();

  /* src/views/settings.js */
  // Administration → Settings (spec ADM-4): the five safe values, each checked here and again by the
  // Administration flow, which records the previous and the new value. One change is sent at a time.
  CH.views = CH.views || {};
  CH.views.settings = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var D = CH.dates;
    var ITEMS = [
      { name: 'ReminderDaysBefore', label: 'First reminder', unit: 'days before an action\'s deadline', min: 1, max: 30, fallback: '7',
        hint: 'When the owner gets the first reminder email.' },
      { name: 'DueSoonDays', label: 'Due soon', unit: 'days', min: 1, max: 30, fallback: '7',
        hint: 'How far ahead an action counts as due soon on the screens.' },
      { name: 'OverdueReminderIntervalDays', label: 'Late reminders', unit: 'days between them', min: 1, max: 30, fallback: '7',
        hint: 'How often the owner of a late action is reminded.' },
      { name: 'MaxDeadlineYears', label: 'Furthest deadline', unit: 'years ahead', min: 1, max: 5, fallback: '2',
        hint: 'The latest target date anyone can choose.' },
      { name: 'MonitorHours', label: 'Queue monitor hours', hours: true, fallback: '07:00|19:45|60',
        hint: 'Every 15 minutes in working hours on weekdays; outside them, every so many minutes.' },
      { name: 'InvitesEnabled', label: 'Outlook invitations', yesNo: true, fallback: 'Yes',
        hint: 'Yes: meetings send Outlook invitations, updates and cancellations. No: people add meetings to their calendar from the Hub.' },
      { name: 'PdfEnabled', label: 'PDF minutes', yesNo: true, fallback: 'Yes',
        hint: 'Yes: finalised minutes are saved as a PDF. No: the Hub offers a print-ready page instead.' }
    ];

    function current(app, name) {
      var row = (app.settings || []).filter(function (r) { return r.Title === name; })[0];
      return row && row.Value !== undefined && row.Value !== null ? String(row.Value) : '';
    }

    // Returns an error message, or '' when the value is acceptable (the same checks as the flow).
    function check(item, value) {
      if (item.yesNo) return value === 'Yes' || value === 'No' ? '' : 'Choose Yes or No.';
      if (item.hours) {
        var p = String(value).split('|');
        var t = function (x) { var m = /^(\d{2}):(\d{2})$/.exec(x || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };
        if (p.length !== 3 || t(p[0]) < 0 || t(p[1]) < 0 || t(p[0]) >= t(p[1]) || !/^\d{1,2}$/.test(p[2]) || Number(p[2]) < 15) {
          return 'Give the start and end of working hours (start before end), and at least 15 minutes between checks outside them.';
        }
        return '';
      }
      if (!/^\d{1,2}$/.test(String(value)) || Number(value) < item.min || Number(value) > item.max) {
        return 'Enter a whole number from ' + item.min + ' to ' + item.max + '.';
      }
      return '';
    }

    function words(item, value) {
      if (item.yesNo) return (value || item.fallback) === 'No' ? 'Off' : 'On';
      if (!value) return 'Not set (' + (item.hours ? item.fallback.replace(/\|/g, ' – ').replace(/ – (\d+)$/, ', then every $1 minutes') : item.fallback + ' ' + item.unit) + ' is used)';
      if (item.hours) {
        var p = value.split('|');
        return p[0] + ' to ' + p[1] + ' on weekdays; every ' + p[2] + ' minutes outside those hours';
      }
      return value + ' ' + item.unit;
    }

    function editor(app, item, onDone) {
      var err = h('span', { class: 'field-error', id: 'ch-set-' + item.name + '-err' });
      var value = current(app, item.name) || item.fallback;
      var inputs;
      if (item.yesNo) {
        inputs = [h('select', { id: 'ch-set-' + item.name, 'aria-label': item.label }, [['Yes', 'On'], ['No', 'Off']].map(function (o) {
          return h('option', { value: o[0], selected: o[0] === value ? true : null, text: o[1] });
        }))];
      } else if (item.hours) {
        var p = value.split('|');
        inputs = [h('input', { type: 'time', id: 'ch-set-' + item.name, 'aria-label': 'Start', value: p[0] }), ' to ',
          h('input', { type: 'time', 'aria-label': 'End', value: p[1] }), ', then every ',
          h('input', { type: 'number', min: '15', max: '99', 'aria-label': 'Minutes between checks outside working hours', value: p[2], class: 'num' }), ' minutes'];
      } else {
        inputs = [h('input', { type: 'number', id: 'ch-set-' + item.name, min: String(item.min), max: String(item.max), value: value, class: 'num' }), ' ' + item.unit];
      }
      var save = h('button', { type: 'submit', class: 'btn btn-main', text: 'Save' });
      var form = h('form', { class: 'setting-edit', novalidate: true }, h('span', { class: 'inline-fields' }, inputs), save,
        h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { onDone(); } }), err);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var fields = form.querySelectorAll('input, select');
        var v = item.hours ? [fields[0].value, fields[1].value, fields[2].value].join('|') : String(fields[0].value).trim();
        var problem = check(item, v);
        err.textContent = problem;
        if (problem) { fields[0].focus(); return; }
        if (v === current(app, item.name)) { onDone(); return; }
        save.disabled = true;
        save.textContent = 'Sending…';
        try {
          await app.tracker.submit({ type: 'UpdateSetting', payload: { name: item.name, value: v }, label: item.yesNo ? 'Turn ' + item.label + ' ' + words(item, v).toLowerCase() : 'Change ' + item.label.toLowerCase() + ' to ' + words(item, v) });
          onDone();
        } catch (error) {
          save.disabled = false;
          save.textContent = 'Try again';
          err.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.';
        }
      });
      setTimeout(function () { var first = form.querySelector('input, select'); if (first) first.focus(); }, 0);
      return form;
    }

    function render(app) {
      var editing = app.settingEdit || '';
      var sent = (app.tracker ? app.tracker.entries() : []).filter(function (e) { return e.type === 'UpdateSetting' && !e.dismissed; });
      return [
        h('p', { class: 'muted small', text: 'Each change is checked, recorded with its previous value, and takes effect within a few minutes.' }),
        h('ul', { class: 'plain settings' }, ITEMS.map(function (item) {
          var waiting = sent.filter(function (e) { return (e.label.indexOf(item.label.toLowerCase()) >= 0 || e.label.indexOf(item.label) >= 0) && (e.state === 'submitted' || e.state === 'slow'); })[0];
          return h('li', null, h('div', { class: 'setting' },
            h('b', { text: item.label }), h('br'),
            h('span', { text: words(item, current(app, item.name)) }), h('br'),
            h('span', { class: 'muted small', text: item.hint }),
            waiting ? h('p', { class: 'pending', role: 'status', text: waiting.label + ' – sent at ' + D.ukTime(waiting.submittedAt) + ', waiting to be recorded.' }) : null,
            editing === item.name ? editor(app, item, function () { app.settingEdit = ''; app.refreshView(); }) : null),
            editing || waiting ? null : ui.button('Change', function () { app.settingEdit = item.name; app.refreshView(); }));
        })),
        sent.filter(function (e) { return e.state !== 'submitted' && e.state !== 'slow'; }).map(function (e) {
          return h('p', { class: e.state === 'done' ? 'ok-note' : 'section-note', role: 'status' },
            (e.state === 'done' ? 'Done: ' : 'Not done: ') + e.label + '. ' + (e.state === 'done' ? '' : e.message + ' '), ui.linkButton('Dismiss', function () { app.tracker.dismiss(e); }));
        })
      ];
    }

    return { render: render, check: check, ITEMS: ITEMS };
  })();

  /* src/views/dashboard.js */
  // Management overview (spec MGT-1 to MGT-3): figures for the whole group and each area, and every figure opens
  // exactly the actions it counts, by the same rule. Everyone can read every area's actions (E.0), so this page
  // gathers them for management; it hides nothing that needs protecting. Closed actions are read on demand.
  CH.views = CH.views || {};
  CH.views.dashboard = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var ui = CH.ui;
    var PERIODS = [['30', 'Last 30 days'], ['90', 'Last 3 months'], ['365', 'Last 12 months']];

    // Closed actions in the period, newest first. IsOpen is indexed, so it leads the filter.
    async function loadClosed(app, days) {
      var since = D.addDays(app.model.today, -Number(days));
      var res = await app.sp.items(CH.config.lists.actions.title, CH.model.QUERIES.actions.replace('&$filter=IsOpen eq 1 and FSObjType eq 0',
        '&$filter=IsOpen eq 0 and FSObjType eq 0'), 5000);
      var rows = res.rows.filter(function (r) { return !CH.model.isUncommitted(r) && r.DateClosed && D.localDate(r.DateClosed) >= since; });
      app.finished = app.finished || {};
      var list = rows.map(function (r) { var a = app.model.actionFrom(r); app.finished[a.id] = a; return a; })
        .sort(function (a, b) { return String(b.closedIso).localeCompare(String(a.closedIso)); });
      return { list: list, complete: res.complete };
    }

    async function refresh(app) {
      var st = app.dash = app.dash || { days: '90', pick: null };
      var showing = function () { return app.state.view === 'manage'; };
      st.loading = true; st.error = false;
      if (showing()) app.refreshView();
      try { var got = await loadClosed(app, st.days); st.closed = got.list; st.closedComplete = got.complete; } catch (_) { st.error = true; st.closed = []; }
      st.loading = false;
      if (showing()) app.refreshView();
    }

    // The figures, each with the rule that picks its actions; the drill-down uses the same rule.
    function measures(app, key) {
      var m = app.model;
      var st = app.dash;
      var open = m.actions.filter(function (a) { return !key || m.inArea(a, key); });
      var closed = (st.closed || []).filter(function (a) { return !key || m.inArea(a, key); });
      var completed = closed.filter(function (a) { return a.closeOutcome === 'Completed'; });
      return {
        open: { label: 'Open', list: open },
        late: { label: 'Late', list: open.filter(function (a) { return a.group === 'late'; }), kind: 'late' },
        soon: { label: 'Due soon', list: open.filter(function (a) { return a.group === 'soon' && !a.waitingCloseOut; }), kind: 'soon' },
        closeOut: { label: 'Waiting for close-out', list: open.filter(function (a) { return a.waitingCloseOut; }) },
        completed: { label: 'Completed', list: completed, kind: 'done', closed: true },
        closed: { label: 'All closed', list: closed, closed: true }
      };
    }

    function figure(app, key, name, x) {
      var st = app.dash;
      var picked = st.pick && st.pick.key === (key || '') && st.pick.name === name;
      var pending = x.closed && (st.loading || !st.closed);
      return h('button', { type: 'button', class: 'dash-fig' + (picked ? ' on' : '') + (x.kind ? ' k-' + x.kind : ''), 'aria-pressed': String(picked),
        disabled: pending ? true : null,
        onclick: function () { st.pick = picked ? null : { key: key || '', name: name }; app.refreshView(); } },
        h('b', { text: pending ? '…' : String(x.list.length) }), h('span', { text: x.label }));
    }

    function drill(app) {
      var st = app.dash;
      if (!st.pick) return null;
      var m = app.model;
      var x = measures(app, st.pick.key)[st.pick.name];
      var where = st.pick.key ? m.areaByKey[st.pick.key].name : 'All areas';
      var rows = x.list.slice().sort(function (a, b) { return x.closed ? String(b.closedIso).localeCompare(String(a.closedIso)) : a.dueIso.localeCompare(b.dueIso); });
      return ui.card(where + ' – ' + x.label.toLowerCase() + ' (' + rows.length + ')', [
        rows.length ? h('ul', { class: 'items' }, rows.map(function (a) {
          return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
            h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.areaName + ' · ' + a.ownerName +
              (x.closed ? ' · ' + (a.closeOutcome || 'Closed') : a.extensions ? ' · deadline moved ' + (a.extensions === 1 ? 'once' : a.extensions + ' times') : '') })),
            ui.chip(x.closed ? 'done' : a.waitingCloseOut ? 'later' : a.group, x.closed ? 'Closed ' + (a.closedIso ? D.short(a.closedIso) : '') : a.dueText)));
        })) : h('p', { class: 'muted', text: 'No actions.' }),
        h('div', { class: 'row' }, ui.linkButton('Close this list', function () { st.pick = null; app.refreshView(); }))], 'dash-drill');
    }

    function render(app) {
      if (!app.access.isManagement) {
        return [h('h1', { text: 'Overview of all areas' }), h('p', { text: 'This page is for Team Leaders and the Group Head.' })];
      }
      var m = app.model;
      var st = app.dash;
      if (!st) { app.dash = { days: '90', pick: null }; setTimeout(function () { refresh(app); }, 0); st = app.dash; }
      var period = h('select', { 'aria-label': 'Closed in', onchange: function (e) { st.days = e.target.value; st.pick = null; refresh(app); } },
        PERIODS.map(function (p) { return h('option', { value: p[0], selected: p[0] === st.days ? true : null, text: p[1] }); }));
      var all = measures(app, '');
      var names = ['open', 'late', 'soon', 'closeOut', 'completed', 'closed'];
      var active = m.areas.filter(function (a) { return a.status === 'Active'; });
      var degr = active.reduce(function (n, a) { return n + m.stats[a.key].degradations; }, 0);
      var table = h('table', { class: 'dash-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Area' }), ['Open', 'Late', 'Due soon', 'Completed'].map(function (t) { return h('th', { scope: 'col', text: t }); }),
          h('th', { scope: 'col', text: 'Open issues' }), h('th', { scope: 'col', text: 'Next meeting' }))),
        h('tbody', null, active.map(function (a) {
          var x = measures(app, a.key);
          var s = m.stats[a.key];
          return h('tr', null, h('th', { scope: 'row' }, ui.linkButton(a.name, function () { app.openArea(a.key); })),
            ['open', 'late', 'soon', 'completed'].map(function (n) { return h('td', null, figure(app, a.key, n, x[n])); }),
            h('td', { text: s.openEntries ? s.openEntries + (s.degradations ? ' (' + s.degradations + ' degradation' + (s.degradations === 1 ? '' : 's') + ')' : '') : '–' }),
            h('td', { class: s.meetingStale ? 'txt-soon' : '', text: s.nextMeeting ? D.weekdayShort(s.nextMeeting) : s.lastMeeting ? 'None since ' + D.short(s.lastMeeting) : 'None booked' }));
        })));
      return [
        h('h1', { text: 'Overview of all areas' }),
        h('div', { class: 'row filters dash-head' }, h('p', { class: 'sentence' }, 'Across the group: ' + all.open.list.length + ' open actions, ',
          all.late.list.length ? h('b', { class: 'txt-late', text: all.late.list.length + ' late' }) : 'none late',
          degr ? ', and ' + degr + ' unresolved degradation' + (degr === 1 ? '' : 's') + '.' : '.'),
          h('label', null, 'Completed and closed in ', period)),
        ui.sectionNote(m.sections.actions, 'actions'),
        st.error ? h('p', { class: 'section-note', text: 'Closed actions could not be read just now, so the completed figures are missing. ' }, ui.linkButton('Try again', function () { refresh(app); })) : null,
        st.closedComplete === false ? h('p', { class: 'section-note', text: 'Only the first 5,000 closed actions were read; the completed figures may be low.' }) : null,
        h('div', { class: 'dash-figs' }, names.map(function (n) { return figure(app, '', n, all[n]); })),
        drill(app),
        ui.card('By area', [h('p', { class: 'muted small', text: 'An action shared with another area counts in both areas, and once in the group figures.' }), table])
      ];
    }

    return { render: render, refresh: refresh, measures: measures, PERIODS: PERIODS };
  })();

  /* src/views/meeting-form.js */
  // "Book a meeting" and "Change the meeting" (spec MTG-1): one form, sent as a queued request to the Meetings flow,
  // which sends the Outlook invitation (or its update) once the meeting is recorded. Booking can also make the same
  // meeting in each of the next few months, as separate meetings.
  CH.views = CH.views || {};
  CH.views.meetingForm = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var R = CH.rules;

    // Who may chair: management, or a member of the area who runs its meetings. Who may attend: members and management.
    function people(app, key) {
      var m = app.model;
      var chairs = m.chairsByArea[key] || {};
      var all = m.ownersFor(key);
      return {
        all: all,
        chairs: all.filter(function (p) { return CH.config.managementRoles.indexOf(p.role) >= 0 || chairs[p.id]; }),
        members: all.filter(function (p) { return (m.membersByArea[key] || {})[p.id]; })
      };
    }

    function ctxFor(app) {
      return {
        today: app.model.today,
        runsMeetings: app.access.runsMeetings,
        chairAllowed: function (k, id) { return people(app, k).chairs.some(function (p) { return Number(p.id) === id; }); },
        attendeeAllowed: function (k, id) { return people(app, k).all.some(function (p) { return Number(p.id) === id; }); }
      };
    }

    // meeting: the meeting being changed, or none to book a new one in areaKey.
    function open(app, areaKey, meeting) {
      if (app.meetingsBlocked()) { CH.ui.toast(app.root, 'Booking and changing meetings is paused for the moment. Please try again later.', 'info'); return; }
      var m = app.model;
      var key = meeting ? meeting.areaKey : areaKey;
      var mine = m.areas.filter(function (a) { return app.access.runsMeetings(a.key); });
      if (!meeting && !mine.length) { CH.ui.toast(app.root, 'Only the people who run meetings in an area, and the Team Leaders and Group Head, can book meetings.', 'info'); return; }
      if (!meeting && !app.access.runsMeetings(key)) key = mine[0].key;
      var field = CH.ui.dialog.field;
      var area = h('select', { id: 'ch-m-areaKey', disabled: meeting ? true : null }, (meeting ? [m.areaByKey[key]] : mine).map(function (a) {
        return h('option', { value: a.key, selected: a.key === key ? true : null, text: a.name });
      }));
      var stats = m.stats[key] || {};
      var date = h('input', { id: 'ch-m-dateIso', type: 'date', min: m.today, max: D.addDays(m.today, 730), value: meeting ? meeting.dateIso : '' });
      var start = h('input', { id: 'ch-m-start', type: 'time', value: meeting ? meeting.start : '10:00' });
      var end = h('input', { id: 'ch-m-end', type: 'time', value: meeting ? meeting.end : '11:00' });
      var place = h('input', { id: 'ch-m-location', type: 'text', maxlength: '255', value: meeting ? meeting.location : '' });
      var link = h('input', { id: 'ch-m-onlineLink', type: 'url', maxlength: '1000', value: meeting ? meeting.onlineLink : ''});
      var chair = h('select', { id: 'ch-m-chairId' });
      var attendees = h('div', { class: 'checks', id: 'ch-m-attendeeIds', role: 'group', 'aria-label': 'Attendees' });
      var repeat = h('select', { id: 'ch-m-repeat' }, [['0', 'Just this meeting'], ['2', 'This and the next 2 months'], ['5', 'This and the next 5 months']].map(function (o) {
        return h('option', { value: o[0], text: o[1] });
      }));

      function fillPeople() {
        var p = people(app, area.value);
        var chosenChair = chair.value || String(meeting ? meeting.chairId : app.person.SiteUserId);
        CH.dom.clear(chair);
        p.chairs.forEach(function (x) { chair.appendChild(h('option', { value: String(x.id), selected: String(x.id) === chosenChair ? true : null, text: x.name })); });
        var ticked = meeting ? meeting.attendeeIds.map(String) : p.members.map(function (x) { return String(x.id); }).concat(String(app.person.SiteUserId));
        CH.dom.clear(attendees);
        p.all.forEach(function (x) {
          attendees.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(x.id), checked: ticked.indexOf(String(x.id)) >= 0 ? true : null }),
            ' ' + x.name + ((m.membersByArea[area.value] || {})[x.id] ? '' : ' – ' + x.role)));
        });
      }
      area.addEventListener('change', fillPeople);
      fillPeople();

      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: meeting ? 'Save changes' : 'Book meeting' });
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-m', title: meeting ? 'Change the meeting' : 'Book a meeting', wide: true });
      var invites = app.health ? app.health.invitesEnabled !== false : true;
      var form = h('form', { class: 'dialog-body', novalidate: true },
        field('Area', area),
        !meeting && stats.lastMeeting ? h('p', { class: 'muted small', text: 'The last ' + m.areaByKey[key].name + ' meeting was on ' + D.long(stats.lastMeeting) + '.' }) : null,
        h('div', { class: 'row three' }, field('Date', date), field('Starts', start), field('Ends', end)),
        h('div', { class: 'row two' }, field('Place', place, 'A room, or empty if online.'), field('Online link', link, 'Optional, e.g. a Teams link.')),
        meeting ? field('Chair', chair) : h('div', { class: 'row two' }, field('Chair', chair), field('Repeat', repeat)),
        h('div', { class: 'field' }, h('span', { class: 'label', text: 'Attendees' }),
          attendees, h('span', { class: 'field-error', id: 'ch-m-attendeeIds-err' })),

        h('p', { class: 'explain', text: invites
          ? (meeting ? 'An Outlook update goes to the attendees once the change is recorded.' : 'An Outlook invitation goes to the attendees from your calendar once the meeting is recorded.')
          : 'Outlook invitations are switched off: attendees can add the meeting to their calendar from the Hub.' }),
        errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
      dlg.body.appendChild(form);

      function values() {
        return { areaKey: area.value, dateIso: date.value, start: start.value, end: end.value, location: place.value.trim(), onlineLink: link.value.trim(),
          chairId: Number(chair.value), attendeeIds: Array.prototype.filter.call(attendees.querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return Number(i.value); }) };
      }

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        var v = values();
        var errors = R.validateMeeting(v, ctxFor(app));
        if (CH.ui.dialog.showErrors(form, 'ch-m-', errors, ['areaKey', 'dateIso', 'start', 'end', 'location', 'onlineLink', 'chairId', 'attendeeIds'])) return;
        if (errors.areaKey) { errorBox.textContent = errors.areaKey; return; }
        submit.disabled = true;
        submit.textContent = 'Sending…';
        var when = function (iso) { return D.weekday(iso) + ' ' + D.long(iso) + ' at ' + v.start; };
        try {
          if (meeting) {
            var changed = {};
            ['dateIso', 'start', 'end', 'location', 'onlineLink', 'chairId'].forEach(function (k) {
              var before = { dateIso: meeting.dateIso, start: meeting.start, end: meeting.end, location: meeting.location, onlineLink: meeting.onlineLink, chairId: Number(meeting.chairId) }[k];
              if (v[k] !== before) changed[k] = v[k];
            });
            if (v.attendeeIds.slice().sort().join() !== meeting.attendeeIds.slice().sort().join()) changed.attendeeIds = v.attendeeIds;
            if (!Object.keys(changed).length) { errorBox.textContent = 'Nothing has changed.'; submit.disabled = false; submit.textContent = 'Save changes'; return; }
            await app.tracker.submit({ type: 'UpdateMeeting', targetId: meeting.id, targetType: 'Meeting', expectedRevision: meeting.revision, payload: changed,
              label: 'Change the ' + meeting.areaName + ' meeting to ' + when(v.dateIso) });
          } else {
            var dates = [v.dateIso].concat(R.nextMonths(v.dateIso, Number(repeat.value)));
            for (var i = 0; i < dates.length; i++) {
              await app.tracker.submit({ type: 'ScheduleMeeting', payload: Object.assign({}, v, { dateIso: dates[i] }),
                label: 'Book the ' + m.areaByKey[v.areaKey].name + ' meeting on ' + when(dates[i]) });
            }
          }
          dlg.close();
          CH.ui.toast(app.root, meeting ? 'Your change has been sent.' : 'Sent. The meeting appears in a few minutes, and the invitation goes out then.', 'ok');
        } catch (error) {
          submit.disabled = false;
          submit.textContent = 'Try again';
          errorBox.textContent = error.friendly || 'This could not be sent just now. Nothing has been lost – try again in a moment.';
        }
      });
      date.focus();
    }

    return { open: open, people: people };
  })();

  /* src/views/meeting-panel.js */
  // One monthly meeting (spec MTG-1 to MTG-6): when and where, who chairs and attends, whether the Outlook invitation
  // has gone, and the agenda – a preview built by the same rules as the flow until the meeting starts, then the agenda
  // the flow fixed. Those who run the area's meetings change, cancel or start it (queued). While it is in progress they
  // run it here: attendance, each item's outcome and notes, decisions and items added by hand are instant writes to the
  // meeting's record folder (which only they and management may write to); actions raised or changed from the meeting
  // are queued and carry the meeting, so it is finalised only once they are recorded. Finalised minutes are read from
  // the record the flow froze, with the PDF, Print and, for management, amendments.
  CH.views = CH.views || {};
  CH.views.meetingPanel = (function () {
    var h = CH.dom.h;
    var D = CH.dates;
    var R = CH.rules;
    var ui = CH.ui;
    var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
    var STATUS = { 'Scheduled': ['later', 'Booked'], 'In Progress': ['soon', 'In progress'], 'Finalising': ['soon', 'Being finalised'],
      'Finalised': ['done', 'Minutes finalised'], 'Cancelled': ['late', 'Cancelled'] };
    var ATTENDANCE = ['Present', 'Apologies', 'Absent'];

    function inviteWords(app, mt) {
      var on = !app.health || app.health.invitesEnabled !== false;
      var s = mt.inviteState;
      if (mt.status === 'Cancelled') return s === 'Cancelled' ? 'The cancellation has gone to the attendees.' : s === 'None' ? '' : 'The cancellation is being sent.';
      if (mt.status === 'Finalised' || mt.status === 'Finalising') return '';
      if (s === 'Sent') return 'The Outlook invitation has gone to the attendees.';
      if (s === 'Creating' || s === 'Updating') return 'The Outlook invitation is being sent.';
      if (s === 'Unknown') return 'The Outlook invitation is being checked and tried again automatically.';
      if (s === 'Failed') return 'The Outlook invitation could not be sent; it is tried again automatically, and the administrators are told if it keeps failing.';
      return on ? '' : 'Outlook invitations are switched off. Add the meeting to your calendar with the download below.';
    }

    // A calendar file for this meeting (used when invitations are off, or for anyone who wants it in their own calendar).
    function ics(mt, areaName) {
      var stamp = function (iso) { return String(iso).replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z'; };
      var escape = function (t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
      return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ESG Competency Hub//Meetings//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
        'UID:' + (mt.inviteToken || mt.ref) + '@esg-competency-hub', 'DTSTAMP:' + stamp(new Date().toISOString()),
        'DTSTART:' + stamp(mt.startUtc), 'DTEND:' + stamp(mt.endUtc || mt.startUtc), 'SUMMARY:' + escape(areaName + ' monthly meeting'),
        'LOCATION:' + escape(mt.location || mt.onlineLink), 'DESCRIPTION:' + escape('ESG Competency Hub ' + mt.ref + (mt.onlineLink ? '. Online: ' + mt.onlineLink : '')),
        mt.status === 'Cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    }

    function download(name, text) {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
      var a = h('a', { download: name });
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // The meeting's rows, read once (MeetingId is indexed): the frozen ones in MTG-{id}, which only the flow writes, and
    // what was recorded live in MTG-{id}/Record, keyed "{id}|…". Anything else that names the meeting does not count.
    async function loadItems(app, mt) {
      var res = await app.sp.items(CH.config.lists.meetingItems.title,
        '$select=Id,Title,RowType,Section,SourceType,SourceId,SortOrder,AgendaMarker,SnapshotOwner,SnapshotStatus,SnapshotDueDate,SnapshotDetails,Notes,Outcome,' +
        'Attendance,AmendmentReason,RecordKey,FileDirRef,AuthorId,Created&$filter=MeetingId eq ' + Number(mt.id), 2000);
      var folder = '/' + mt.areaKey + '/MTG-' + mt.id;
      var dir = function (r) { return String(r.FileDirRef || ''); };
      var rows = res.rows.slice().sort(function (a, b) { return a.Id - b.Id; });
      return {
        frozen: rows.filter(function (r) { return dir(r).slice(-folder.length) === folder; }),
        live: rows.filter(function (r) { return dir(r).slice(-(folder.length + 7)) === folder + '/Record' && String(r.RecordKey || '').indexOf(mt.id + '|') === 0; })
      };
    }

    // The last row recorded for each key wins (people may record an outcome or attendance more than once).
    function latest(live) {
      var out = {};
      live.forEach(function (r) { out[r.RecordKey] = r; });
      return out;
    }

    function outcomeKey(mtId, type, sourceId) { return mtId + '|O|' + type + '|' + Number(sourceId); }

    // Agenda items as the panel shows them: from the flow's rows (with any outcome recorded), or from the preview.
    function fromRows(app, mt, rows, live) {
      var last = latest(live || []);
      var items = rows.filter(function (r) { return r.RowType === 'Agenda Item'; }).sort(function (a, b) { return (a.SortOrder || 0) - (b.SortOrder || 0) || a.Id - b.Id; })
        .map(function (r) {
          var it = describe(app, r.Section, r.SourceType || 'Date', r.SourceId, r.Title, r.AgendaMarker, r.SnapshotOwner, r.SnapshotDetails, r.SnapshotDueDate);
          it.key = r.SourceType ? outcomeKey(mt.id, r.SourceType, r.SourceId) : '';
          var rec = it.key && last[it.key];
          it.outcome = rec ? rec.Outcome || '' : r.Outcome || '';
          it.notes = rec ? rec.Notes || '' : r.Notes || '';
          return it;
        });
      // items added by hand (new business), until the flow freezes them into the agenda
      (live || []).filter(function (r) { return r.RowType === 'New Business'; }).forEach(function (r) {
        var key = outcomeKey(mt.id, 'New Business', r.Id);
        if (items.some(function (it) { return it.key === key; })) return;
        var rec = last[key];
        items.push({ section: 'New business', title: r.Title, detail: (r.Notes ? r.Notes + ' · ' : '') + 'added by ' + app.model.nameOf(r.AuthorId), key: key,
          outcome: rec ? rec.Outcome || '' : '', notes: rec ? rec.Notes || '' : '' });
      });
      return items;
    }
    function fromPreview(app, list) {
      return list.map(function (x) {
        var r = x.row;
        return describe(app, x.section, x.sourceType, x.sourceId, r.Title, x.marker, r.AssignedToId,
          x.sourceType === 'Register Entry' ? r.EntryType + ' · ' + r.Impact + ' impact' : x.sourceType === 'Date' ? (r.StartTime ? D.long(D.localDate(r.StartTime)) : '') : '',
          r.DueDay ? D.fromDueDay(r.DueDay) : '');
      });
    }
    function describe(app, section, type, sourceId, title, marker, ownerId, details, due) {
      var m = app.model;
      var id = Number(sourceId);
      var open = type === 'Action' ? function () { app.openAction({ id: id }); } : type === 'Notice' && m.noticeById[id] ? function () { app.openNotice({ id: id }); }
        : type === 'Register Entry' && m.entryById[id] ? function () { app.openEntry({ id: id }); } : null;
      var bits = [];
      if (type === 'Action' && ownerId) bits.push(m.nameOf(Number(ownerId)));
      if (type === 'Action' && due) bits.push('due ' + D.short(String(due).slice(0, 10)));
      if (details) bits.push(details);
      if (marker) bits.push(marker.toLowerCase());
      return { section: section, type: type, title: title || '', detail: bits.join(' · '), open: open };
    }

    function agendaList(items, withOutcomes) {
      var groups = CH.agenda.SECTIONS.concat(['New business', 'Decisions and additional actions']).map(function (title) { return { title: title, rows: [] }; });
      items.forEach(function (it) {
        var g = groups.filter(function (x) { return x.title === it.section; })[0];
        if (g) g.rows.push(it);
      });
      return groups.filter(function (g) { return g.rows.length; }).map(function (g) {
        return [h('h4', { class: 'agenda-title', text: g.title + ' (' + g.rows.length + ')' }), h('ul', { class: 'plain agenda' }, g.rows.map(function (it) {
          return h('li', null, h('span', null, h('b', { text: it.title }), it.detail ? [h('br'), h('span', { class: 'muted small', text: it.detail })] : null,
            withOutcomes && (it.outcome || it.notes) ? [h('br'), h('span', { class: 'small' }, it.outcome ? h('b', { text: it.outcome + (it.notes ? ': ' : '') }) : null, it.notes || '')] : null),
            it.open ? ui.linkButton('Open', it.open) : null);
        }))];
      });
    }

    function open(app, id) {
      var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-mt', title: 'Meeting', wide: true, onClose: function () { app.panel = null; app.liveMeetingId = null; } });
      var view = 'main';
      var agenda = null;      // { kind: 'preview' | 'fixed', items, frozen, live } or 'error'
      var at = 0;             // the agenda item on screen while the meeting runs

      function mt() { return app.model.meetingById[id]; }

      async function loadAgenda() {
        var x = mt();
        if (!x) return;
        try {
          if (x.status === 'Scheduled') {
            var both = await Promise.all([CH.agenda.preview(app.sp, app.model, x, app.settings), loadItems(app, x)]);
            agenda = { kind: 'preview', items: fromPreview(app, both[0]).concat(fromRows(app, x, [], both[1].live)), frozen: both[1].frozen, live: both[1].live };
          } else {
            var rows = await loadItems(app, x);
            agenda = { kind: 'fixed', items: fromRows(app, x, rows.frozen, x.status === 'In Progress' || x.status === 'Finalising' ? rows.live : []), frozen: rows.frozen, live: rows.live };
          }
        } catch (_) { agenda = 'error'; }
        if (view === 'main' && dlg.isOpen()) fill();
      }

      // changes made from this meeting that are still being recorded (they hold back finalising)
      function meetingPending(x) {
        return app.tracker.entries().filter(function (e) {
          return Number(e.meetingId) === Number(x.id) && (e.state === 'submitted' || e.state === 'slow');
        });
      }

      function pending(x) {
        var e = app.tracker.forTarget(x.id, 'Meeting');
        // release 1.2: a change to the booking already shows; a refusal has its own card, with Try again
        if (e && (e.state === 'submitted' || e.state === 'slow')) {
          return h('p', { class: 'pending', role: 'status' }, app.mark(x, 'Meeting') || app.mark({ sending: true }, 'Meeting'), ' ' + e.label + ' – ' +
            (e.retrying ? e.message : 'you can carry on. The next steps are offered once it is saved.'));
        }
        var mark = app.mark(x, 'Meeting');
        return mark ? h('p', { class: 'mark-line' }, mark) : null;
      }

      function fill() {
        CH.dom.clear(dlg.body);
        var x = mt();
        if (!x) { dlg.setTitle('Meeting not available'); CH.dom.append(dlg.body, h('p', { text: 'This meeting could not be found. It may have been cancelled.' })); return; }
        dlg.setTitle(x.areaName + ' meeting, ' + D.weekday(x.dateIso) + ' ' + D.long(x.dateIso));
        if (view !== 'main') { CH.dom.append(dlg.body, form(view, x)); return; }
        var runs = app.access.runsMeetings(x.areaKey);
        var e = app.tracker.forTarget(x.id, 'Meeting');
        var busy = (e && (e.state === 'submitted' || e.state === 'slow')) || app.meetingsBlocked();
        var live = runs && !busy && x.status === 'In Progress';
        app.liveMeetingId = live ? x.id : null;
        var st = STATUS[x.status] || ['later', x.status];
        var words = inviteWords(app, x);
        var people = x.attendeeIds.map(function (pid) { return app.model.nameOf(pid); }).sort();
        CH.dom.append(dlg.body, [
          h('p', { class: 'muted small' }, x.ref + ' · ' + x.areaName + ' ', ui.chip(st[0], st[1])),
          pending(x),
          h('dl', { class: 'facts' },
            h('dt', { text: 'When' }), h('dd', { text: D.weekday(x.dateIso) + ' ' + D.long(x.dateIso) + ', ' + x.start + (x.end ? ' to ' + x.end : '') }),
            h('dt', { text: 'Where' }), h('dd', null, x.location || (x.onlineLink ? 'Online' : 'Not given'),
              x.onlineLink ? [' · ', h('span', { class: 'muted small', text: x.onlineLink })] : null),
            h('dt', { text: 'Who' }), h('dd', { text: (x.chairName ? x.chairName + ' chairs. ' : '') + (people.length ? people.length + ' invited: ' + people.join(', ') + '.' : '') }),
            x.status === 'Cancelled' ? [h('dt', { text: 'Cancelled' }), h('dd', { class: 'notice-body', text: x.cancellationReason })] : null,
            x.status === 'Finalised' ? [h('dt', { text: 'Finalised' }), h('dd', { text: (x.finalisedIso ? D.long(x.finalisedIso) : '') + (x.finalisedByName ? ' by ' + x.finalisedByName : '') +
              (x.amendments ? '. ' + x.amendments + (x.amendments === 1 ? ' amendment.' : ' amendments.') : '') })] : null),
          words ? h('p', { class: x.inviteState === 'Failed' ? 'section-note' : 'muted small', text: words }) : null,
          h('div', { class: 'row actions-row' },
            runs && !busy && x.status === 'Scheduled' ? ui.button('Start meeting', function () { show('start'); }, 'main') : null,
            runs && !busy && x.status === 'Scheduled' ? ui.button('Change', function () { dlg.close(); CH.views.meetingForm.open(app, x.areaKey, x); }) : null,
            live ? ui.button('Review and finalise', function () { show('finalise'); }, 'main') : null,
            runs && !busy && (x.status === 'Scheduled' || x.status === 'In Progress') ? ui.button('Cancel meeting', function () { show('cancel'); }) : null,
            x.status === 'Scheduled' || x.status === 'In Progress' ? ui.button('Add to my calendar', function () { download(x.ref + '.ics', ics(x, x.areaName)); }) : null,
            x.status === 'Finalised' && app.access.isManagement && !busy ? ui.button('Amend the minutes', function () { show('amend'); }) : null),
          x.status === 'Finalised' ? minutes(x) : live ? liveScreen(x) : [
            h('h3', { class: 'group-title', text: x.status === 'Scheduled' ? 'Agenda – preview' : 'Agenda' }),
            x.status === 'Scheduled' ? h('p', { class: 'muted small', text: 'Built from today\'s records by the same rules as the meeting. It is fixed when the meeting starts.' }) : null,
            x.status === 'Finalising' ? h('p', { class: 'muted small', text: 'The minutes are being finalised. The record can no longer be changed.' }) : null,
            agendaBody(x.status !== 'Scheduled'),
            runs && x.status === 'Scheduled' ? addItemForm(x) : null]
        ]);
      }

      function agendaBody(withOutcomes) {
        return agenda === null ? h('p', { class: 'muted', text: 'Building the agenda…' }) : agenda === 'error' ? h('p', { class: 'section-note', text: 'The agenda could not be read just now.' })
          : agenda.items.length ? agendaList(agenda.items, withOutcomes) : h('p', { class: 'muted', text: 'Nothing on the agenda yet.' });
      }

      // ---- the meeting in progress (spec MTG-3): everything here saves at once to the record folder
      function saveRow(x, values, status) {
        var clientKey = CH.requests.newKey();
        status.textContent = 'Saving…';
        return app.sp.addToFolder('meetingItems', x.areaKey + '/MTG-' + x.id + '/Record', Object.assign({ RowKey: 'U|' + clientKey, MeetingId: x.id }, values))
          .then(function () { status.textContent = 'Saved'; if (agenda && agenda !== 'error') agenda.live.push(Object.assign({ Id: Infinity, AuthorId: app.person.SiteUserId }, values)); })
          .catch(function (error) {
            status.textContent = error.status === 403 ? 'Only the people who run this area\'s meetings, and the Team Leaders and Group Head, can record this.' : 'Not saved – try again in a moment.';
            throw error;
          });
      }

      function liveScreen(x) {
        if (agenda === null || agenda === 'error') return agendaBody(false);
        var last = latest(agenda.live);
        var items = fromRows(app, x, agenda.frozen, agenda.live);
        at = Math.max(0, Math.min(at, items.length - 1));
        return [items.length ? oneItem(x, items) : h('p', { class: 'muted', text: 'Nothing on the agenda.' }), attendance(x, last), decisions(x), addItemForm(x)];
      }

      function attendance(x, last) {
        var status = h('span', { class: 'muted small', role: 'status' });
        var done = x.attendeeIds.filter(function (pid) { return last[x.id + '|P|' + pid] && last[x.id + '|P|' + pid].Attendance; }).length;
        return h('details', { class: 'live-block', open: done < x.attendeeIds.length ? true : null },
          h('summary', null, h('span', { class: 'group-title', text: 'Attendance' }), ' ', h('span', { class: 'muted small', text: done + ' of ' + x.attendeeIds.length + ' recorded' })), status,
          h('ul', { class: 'plain attendance' }, x.attendeeIds.map(function (pid) {
            var rec = last[x.id + '|P|' + pid];
            var sel = h('select', { id: 'ch-mt-att-' + pid, 'aria-label': 'Attendance of ' + app.model.nameOf(pid) },
              [h('option', { value: '', text: 'Not recorded' })].concat(ATTENDANCE.map(function (a) { return h('option', { value: a, text: a, selected: rec && rec.Attendance === a ? true : null }); })));
            sel.addEventListener('change', function () {
              if (!sel.value) return;
              saveRow(x, { Title: app.model.nameOf(pid), RecordKey: x.id + '|P|' + pid, RowType: 'Attendee', Section: 'Attendance', SourceId: pid, Attendance: sel.value }, status)
                .catch(function () {});
            });
            return h('li', null, h('span', { text: app.model.nameOf(pid) }), sel);
          })));
      }

      function oneItem(x, items) {
        var it = items[at];
        var status = h('span', { class: 'muted small', role: 'status' });
        var outcome = h('select', { id: 'ch-mt-outcome' }, [h('option', { value: '', text: it.type === 'Action' || it.type === 'Date' ? 'No change' : 'Choose…' })]
          .concat(R.MINUTE_OUTCOMES.map(function (o) { return h('option', { value: o, text: o, selected: it.outcome === o ? true : null }); })));
        var notes = h('textarea', { id: 'ch-mt-item-notes', rows: '3', maxlength: '4000', value: it.notes || '' });
        notes.value = it.notes || '';
        var needs = R.DISCUSSION_SECTIONS.indexOf(it.section) >= 0;
        async function save(next) {
          if (!it.key) { if (next) go(at + 1); return; }
          try {
            await saveRow(x, { Title: it.title, RecordKey: it.key, RowType: 'Outcome', SourceType: it.key.split('|')[2], SourceId: Number(it.key.split('|')[3]),
              Outcome: outcome.value, Notes: notes.value.trim() }, status);
            if (next) go(at + 1); else fill();
          } catch (_) { /* the message is shown beside the buttons */ }
        }
        function go(i) { at = Math.max(0, Math.min(i, items.length - 1)); fill(); var o = dlg.body.querySelector('#ch-mt-outcome'); if (o) o.focus(); }
        return h('section', { class: 'live-block' },
          h('h3', { class: 'group-title', text: 'Agenda, one item at a time' }),
          h('p', { class: 'muted small', id: 'ch-mt-progress', text: 'Item ' + (at + 1) + ' of ' + items.length + ' · ' + it.section + (needs ? ' · needs an outcome' : '') }),
          h('div', { class: 'live-item' },
            h('h4', { id: 'ch-mt-item-title', text: it.title }),
            it.detail ? h('p', { class: 'muted small', text: it.detail }) : null,
            it.key ? [field('Outcome', outcome), field('Notes and decisions', notes, 'Saved for the minutes.')] : h('p', { class: 'muted small', text: 'For information.' }),
            h('div', { class: 'row' },
              it.key ? ui.button('Save and next', function () { save(true); }, 'main') : ui.button('Next', function () { go(at + 1); }, 'main'),
              it.key ? ui.button('Save', function () { save(false); }) : null,
              at > 0 ? ui.button('Previous', function () { go(at - 1); }) : null,
              it.open ? ui.button(it.type === 'Action' ? 'Open the action' : 'Open', it.open) : null,
              ui.button('Raise an action', function () { CH.views.raiseForm.open(app, x.areaKey, { meeting: x, title: it.type === 'Action' ? '' : it.title }); }),
              status)),
          h('h4', { class: 'agenda-title', text: 'All items' }),
          h('ol', { class: 'agenda-index' }, items.map(function (o, i) {
            var done = R.MINUTE_OUTCOMES.indexOf(o.outcome) >= 0;
            return h('li', { class: i === at ? 'current' : null }, ui.linkButton(o.title, function () { go(i); }),
              done ? ui.chip('done', o.outcome) : R.DISCUSSION_SECTIONS.indexOf(o.section) >= 0 ? ui.chip('soon', 'Needs an outcome') : null);
          })));
      }

      function decisions(x) {
        var list = agenda.live.filter(function (r) { return r.RowType === 'Decision'; });
        var title = h('input', { id: 'ch-mt-decision', type: 'text', maxlength: '255' });
        var details = h('textarea', { id: 'ch-mt-decision-details', rows: '2', maxlength: '2000' });
        var status = h('span', { class: 'muted small', role: 'status' });
        var f = h('form', { class: 'comment-form', novalidate: true }, field('Decision', title), field('Details', details, 'Optional.'),
          h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn', text: 'Record the decision' }), status));
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var t = title.value.trim();
          if (!t) { CH.ui.dialog.showErrors(f, 'ch-mt-', { decision: 'Say what was decided.' }, ['decision']); return; }
          saveRow(x, { Title: t, RecordKey: x.id + '|D|' + CH.requests.newKey(), RowType: 'Decision', Section: 'Decisions and additional actions', Notes: details.value.trim() }, status)
            .then(function () { fill(); }).catch(function () {});
        });
        return h('section', { class: 'live-block' }, h('h3', { class: 'group-title', text: 'Decisions' }),
          list.length ? h('ul', { class: 'plain' }, list.map(function (r) { return h('li', null, h('span', null, h('b', { text: r.Title }), r.Notes ? ' – ' + r.Notes : '')); })) : null, f);
      }

      // An agenda item added by hand: straight into the meeting's record folder.
      function addItemForm(x) {
        var title = h('input', { id: 'ch-mt-title', type: 'text', maxlength: '255' });
        var notes = h('textarea', { id: 'ch-mt-notes', rows: '2', maxlength: '2000' });
        var err = h('p', { class: 'form-error', role: 'alert' });
        var btn = h('button', { type: 'submit', class: 'btn', text: 'Add to the agenda' });
        var f = h('form', { class: 'comment-form', novalidate: true }, h('h4', { text: 'Add an item' }), field('Item', title), field('Details', notes, 'Optional.'), err, btn);
        f.addEventListener('submit', async function (e) {
          e.preventDefault();
          var t = title.value.trim();
          if (!t) { CH.ui.dialog.showErrors(f, 'ch-mt-', { title: 'Say what the item is.' }, ['title']); return; }
          btn.disabled = true; btn.textContent = 'Saving…';
          var clientKey = CH.requests.newKey();
          try {
            await app.sp.addToFolder('meetingItems', x.areaKey + '/MTG-' + x.id + '/Record', { Title: t, RowKey: 'U|' + clientKey, RecordKey: x.id + '|N|' + clientKey,
              MeetingId: x.id, RowType: 'New Business', SourceType: 'New Business', Section: 'New business', Notes: notes.value.trim() });
            agenda = null;
            fill();
            loadAgenda();
            CH.ui.toast(app.root, 'Added to the agenda.', 'ok');
          } catch (error) {
            btn.disabled = false; btn.textContent = 'Try again';
            err.textContent = error.status === 403 ? 'Only the people who run this area\'s meetings, and the Team Leaders and Group Head, can add items.' : 'The item could not be added just now. Your text has been kept.';
          }
        });
        return f;
      }

      // ---- finalised minutes (spec MTG-4 to MTG-6): only the record the flow froze
      function minutes(x) {
        if (agenda === null || agenda === 'error') return agendaBody(true);
        var rows = agenda.frozen;
        var items = fromRows(app, x, rows, []);
        var pdfOn = !app.health || app.health.pdfEnabled !== false;
        var pdf = x.pdfState === 'Ready' && x.pdfVersion > 0
          ? app.sp.siteRelative + '/' + CH.config.lists.minutes.url + '/' + x.areaKey + '/MTG-' + Number(x.id) + '-v' + Number(x.pdfVersion) + '.pdf' : '';
        var att = rows.filter(function (r) { return r.RowType === 'Attendee'; });
        var dec = rows.filter(function (r) { return r.RowType === 'Decision'; });
        var amend = rows.filter(function (r) { return r.RowType === 'Amendment'; });
        return h('section', { class: 'minutes print-area' },
          h('div', { class: 'row actions-row no-print' },
            pdf ? h('a', { class: 'btn btn-main', href: pdf, target: '_blank', rel: 'noopener', text: 'Open the PDF' }) : null,
            pdf ? h('a', { class: 'btn', href: pdf, download: x.ref + '.pdf', text: 'Download PDF' }) : null,
            ui.button('Print', function () { window.print(); })),
          !pdf && pdfOn && (x.pdfState === 'Pending' || x.pdfState === 'Failed') ? h('p', { class: 'muted small no-print', text: 'The PDF is being prepared. The minutes below are final.' }) : null,
          h('h3', { class: 'group-title', text: 'Attendance' }),
          att.length ? h('ul', { class: 'plain' }, att.map(function (r) { return h('li', { text: r.Title + ': ' + (r.Attendance || 'not recorded') }); })) : h('p', { class: 'muted', text: 'Not recorded.' }),
          h('h3', { class: 'group-title', text: 'Minutes' }),
          items.length ? agendaList(items, true) : h('p', { class: 'muted', text: 'Nothing on the agenda.' }),
          h('h3', { class: 'group-title', text: 'Decisions' }),
          dec.length ? h('ul', { class: 'plain' }, dec.map(function (r) { return h('li', null, h('span', null, h('b', { text: r.Title }), r.Notes ? ' – ' + r.Notes : '')); })) : h('p', { class: 'muted', text: 'None recorded.' }),
          amend.length ? [h('h3', { class: 'group-title', text: 'Amendments' }), h('ul', { class: 'plain' }, amend.map(function (r) {
            return h('li', null, h('span', null, h('b', { text: r.Title }), ': ' + (r.Notes || ''), h('br'), h('span', { class: 'muted small', text: 'Why: ' + (r.AmendmentReason || '') })));
          }))] : null);
      }

      function form(kind, x) {
        var errorBox = h('p', { class: 'form-error', role: 'alert' });
        var fields = [];
        var reason = h('textarea', { id: 'ch-mt-reason', rows: '3', maxlength: '1000' });
        var what = h('textarea', { id: 'ch-mt-what', rows: '4', maxlength: '2000' });
        var blocked = false;
        if (kind === 'cancel') fields.push(field('Why is it cancelled?', reason, 'The attendees get an Outlook cancellation.'));
        else if (kind === 'amend') {
          fields.push(h('p', { class: 'explain', text: 'The amendment is added to the minutes with your name and the date. The original minutes are kept as they are, and a new PDF version is made.' }),
            field('What is the amendment?', what), field('Why is it needed?', reason));
        } else if (kind === 'finalise') {
          var items = agenda && agenda !== 'error' ? fromRows(app, x, agenda.frozen, agenda.live) : [];
          var outcomes = {};
          items.forEach(function (it) { if (it.key) outcomes[it.key] = it.outcome; });
          var missing = R.missingOutcomes(items, outcomes);
          var waiting = meetingPending(x);
          blocked = !!missing.length || !!waiting.length;
          fields.push(h('p', { class: 'explain', text: 'Finalising makes the record read-only for good: the minutes are fixed as they are now, and a PDF is made. Management can add amendments later; the original stays.' }),
            h('p', { text: items.filter(function (it) { return it.outcome; }).length + ' of ' + items.length + ' items have an outcome.' }),
            missing.length ? h('div', { class: 'section-note', id: 'ch-mt-missing' }, h('b', { text: 'These items still need an outcome: ' }), missing.join('; ') + '.') : null,
            waiting.length ? h('div', { class: 'section-note', id: 'ch-mt-waiting' }, h('b', { text: 'Still being recorded: ' }), waiting.map(function (e) { return e.label; }).join('; ') +
              '. Finalise once they show as saved.') : null);
        } else fields.push(h('p', { class: 'explain', text: 'Starting fixes the agenda from the records as they are now. It cannot be undone.' }));
        var labels = { cancel: ['Cancel this meeting?', 'Cancel the meeting'], start: ['Start this meeting?', 'Start the meeting'],
          finalise: ['Finalise the minutes?', 'Finalise the minutes'], amend: ['Amend the minutes', 'Add the amendment'] }[kind];
        var submit = h('button', { type: 'submit', class: 'btn btn-main', text: labels[1], disabled: blocked ? true : null });
        var f = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: labels[0] }), fields, errorBox,
          h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: function () { show('main'); } })));
        f.addEventListener('submit', async function (e) {
          e.preventDefault();
          if (blocked) return;
          var payload = {};
          if (kind === 'cancel') {
            var errs = R.validateCancelMeeting({ reason: reason.value });
            if (CH.ui.dialog.showErrors(f, 'ch-mt-', errs, ['reason'])) return;
            payload.reason = reason.value.trim();
          }
          if (kind === 'amend') {
            var aerrs = R.validateAmend({ what: what.value, reason: reason.value });
            if (CH.ui.dialog.showErrors(f, 'ch-mt-', aerrs, ['what', 'reason'])) return;
            payload = { what: what.value.trim(), reason: reason.value.trim() };
          }
          submit.disabled = true; submit.textContent = 'Sending…';
          var type = { cancel: 'CancelMeeting', start: 'StartMeeting', finalise: 'FinaliseMeeting', amend: 'AmendMeeting' }[kind];
          var verb = { cancel: 'Cancel the ', start: 'Start the ', finalise: 'Finalise the minutes of the ', amend: 'Amend the minutes of the ' }[kind];
          try {
            await app.tracker.submit({ type: type, targetId: x.id, targetType: 'Meeting', expectedRevision: x.revision, payload: payload, label: verb + x.areaName + ' meeting' });
            view = 'main';
            fill();
          } catch (error) {
            submit.disabled = false; submit.textContent = 'Try again';
            errorBox.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.';
          }
        });
        return f;
      }

      function show(next) { view = next; fill(); var first = dlg.body.querySelector('textarea, input'); if (first) first.focus(); }

      app.panel = { refresh: function () {
        if (!dlg.isOpen()) return;
        // the review before finalising follows the changes still being recorded
        if (view === 'finalise') { fill(); return; }
        if (view !== 'main') return;
        // never over what someone is typing or choosing during the meeting: the next refresh catches up
        var active = document.activeElement;
        if (active && dlg.body.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        agenda = null; fill(); loadAgenda();
      } };
      fill();
      loadAgenda();
      dlg.focusFirst();
    }

    return { open: open, ics: ics, inviteWords: inviteWords };
  })();

  /* src/views/cleanup.js */
  // Administration → Remove test data (spec §7.4, Q5), used once before go-live. While test marking is on, everything
  // the flows and the app create is marked as a test record. This page lists them, and the older records made before
  // marking existed, which an administrator ticks by hand – nothing is chosen by its title. Typing REMOVE TEST DATA sends
  // one request to the Clean-up flow, which moves them and everything that depends on them to the recycle bin, writes one
  // audit entry and switches test marking off.
  CH.views = CH.views || {};
  CH.views.cleanup = (function () {
    var h = CH.dom.h;
    var ui = CH.ui;
    var KINDS = [
      { type: 'Action', list: 'actions', label: 'Actions', ref: function (r) { return 'ACT-' + ('0000' + r.Id).slice(-5); }, extra: ',SourceType,SourceId' },
      { type: 'Notice', list: 'notices', label: 'Notices', ref: function (r) { return 'Notice ' + r.Id; }, extra: '' },
      { type: 'Register Entry', list: 'register', label: 'Improvements and degradations', ref: function (r) { return 'REG-' + ('0000' + r.Id).slice(-5); }, extra: '' },
      { type: 'Meeting', list: 'meetings', label: 'Meetings (with their agenda, record and PDF minutes)', ref: function (r) { return 'MTG-' + ('0000' + r.Id).slice(-5); }, extra: '' },
      { type: 'Feedback', list: 'feedback', label: 'Feedback', ref: function (r) { return 'Feedback ' + r.Id; }, extra: '' }
    ];
    var CONFIRM = 'REMOVE TEST DATA';

    // IsTestRecord is indexed: marked ones, and the unmarked ones an administrator may tick.
    async function refresh(app) {
      var st = app.cleanup = { loading: true, rows: {}, ticked: app.cleanup ? app.cleanup.ticked : {} };
      app.refreshView();
      try {
        await Promise.all(KINDS.map(async function (k) {
          var sel = '$select=Id,Title,FileDirRef,Created' + k.extra + '&$filter=IsTestRecord eq ';
          var res = await Promise.all([app.sp.items(CH.config.lists[k.list].title, sel + '1', 2000), app.sp.items(CH.config.lists[k.list].title, sel + '0', 500)]);
          st.rows[k.type] = { marked: res[0].rows, other: res[1].rows };
        }));
        st.loading = false;
      } catch (_) { st.loading = false; st.error = true; }
      if (app.cleanup === st) app.refreshView();
    }

    function chosen(st) {
      var out = {};
      KINDS.forEach(function (k) {
        var r = st.rows[k.type] || { marked: [], other: [] };
        out[k.type] = r.marked.map(function (x) { return x.Id; }).concat(r.other.filter(function (x) { return st.ticked[k.type + ':' + x.Id]; }).map(function (x) { return x.Id; }));
      });
      return out;
    }

    // The same rule as the flow: an action raised from a meeting, or linked to an entry, that is being removed goes too.
    function leftBehind(st) {
      var c = chosen(st);
      var actions = (st.rows.Action.marked || []).concat(st.rows.Action.other || []);
      return actions.filter(function (a) {
        var source = a.SourceType === 'Register' ? 'Register Entry' : a.SourceType === 'Meeting' ? 'Meeting' : null;
        return source && c[source].indexOf(Number(a.SourceId)) >= 0 && c.Action.indexOf(a.Id) < 0;
      });
    }

    function render(app) {
      if (!app.health || !app.health.testing) {
        return h('p', { class: 'section-note', text: 'Test marking is off: the Hub is live, so nothing can be removed this way.' });
      }
      var st = app.cleanup;
      if (!st) { setTimeout(function () { refresh(app); }, 0); return h('p', { class: 'muted', text: 'Finding the test records…' }); }
      if (st.loading) return h('p', { class: 'muted', text: 'Finding the test records…' });
      if (st.error) return h('p', { class: 'section-note', text: 'The records could not be read just now. Reload the page to try again.' });
      var c = chosen(st);
      var total = KINDS.reduce(function (n, k) { return n + c[k.type].length; }, 0);
      var behind = leftBehind(st);
      var e = app.tracker.entries().filter(function (x) { return x.type === 'RemoveTestRecords'; }).slice(-1)[0];
      var sending = e && (e.state === 'submitted' || e.state === 'slow');
      var confirm = h('input', { id: 'ch-cl-confirm', type: 'text', autocomplete: 'off', value: st.confirmText || '', oninput: function (ev) { st.confirmText = ev.target.value; } });
      var err = h('p', { class: 'form-error', role: 'alert', id: 'ch-cl-error' });
      var form = h('form', { class: 'dialog-body', novalidate: true },
        CH.ui.dialog.field('Type ' + CONFIRM + ' to confirm', confirm, 'Everything listed above, and everything that depends on it, goes to the recycle bin. It can be restored from there for 93 days.'),
        err, h('button', { type: 'submit', class: 'btn btn-main', text: 'Remove test data', disabled: sending || behind.length ? true : null }));
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (confirm.value.trim() !== CONFIRM) { err.textContent = 'Type ' + CONFIRM + ' exactly, in capitals.'; return; }
        try {
          await app.tracker.submit({ type: 'RemoveTestRecords', payload: { confirm: CONFIRM, include: c }, label: 'Remove ' + total + ' test records' });
          st.confirmText = '';
          app.refreshView();
        } catch (error) { err.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.'; }
      });
      return [
        h('p', { text: 'Before go-live, remove what was made while testing. Records marked as test records are listed and always removed. Records made before marking existed are listed underneath: tick the ones that were tests. Nothing is chosen by its title.' }),
        h('p', { class: 'muted small', text: 'Also removed with each: its history, comments and flags, requests and email records; for a meeting, its agenda, record and PDF minutes. One audit entry lists everything, and test marking is then switched off.' }),
        KINDS.map(function (k) {
          var r = st.rows[k.type] || { marked: [], other: [] };
          return ui.card(k.label + ' (' + c[k.type].length + ' to remove)', [
            r.marked.length ? h('ul', { class: 'plain cleanup' }, r.marked.map(function (x) {
              return h('li', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' ' + k.ref(x) + ' ' + (x.Title || '')), ui.chip('later', 'Test record'));
            })) : h('p', { class: 'muted small', text: 'None marked.' }),
            r.other.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Made before marking (' + r.other.length + ') – tick any that were tests' }),
              h('ul', { class: 'plain cleanup' }, r.other.map(function (x) {
                var key = k.type + ':' + x.Id;
                return h('li', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-key': key, checked: st.ticked[key] ? true : null,
                  onchange: function (ev) { st.ticked[key] = ev.target.checked; app.refreshView(); } }), ' ' + k.ref(x) + ' ' + (x.Title || '')));
              }))) : null
          ]);
        }),
        behind.length ? h('div', { class: 'section-note', id: 'ch-cl-behind' }, h('b', { text: 'Include these too: ' }),
          behind.map(function (a) { return 'ACT-' + ('0000' + a.Id).slice(-5) + ' ' + a.Title; }).join('; ') +
          '. They were raised from, or linked to, a record being removed.') : null,
        e && e.state === 'done' ? h('p', { class: 'muted', role: 'status', text: e.message || 'Done.' }) : null,
        e && (e.state === 'rejected' || e.state === 'attention') ? h('p', { class: 'section-note', role: 'alert', text: e.message }) : null,
        sending ? h('p', { class: 'pending', role: 'status', text: 'Removing the test records – being recorded.' }) : null,
        total ? null : h('p', { class: 'muted', text: 'There is nothing to remove. Confirming still switches test marking off, ready for go-live.' }),
        form
      ];
    }

    return { render: render, refresh: refresh, chosen: chosen, leftBehind: leftBehind, CONFIRM: CONFIRM };
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
      UpdateSetting: 'Change a setting', SetKnownAs: 'Change the name someone is known by', RetryTransaction: 'Try a change again', CancelTransaction: 'Cancel a change', RevertTransaction: 'Revert a change',
      EditNotice: 'Edit a notice', ArchiveNotice: 'Archive a notice', PinNotice: 'Pin or unpin a notice', HideComment: 'Hide a comment',
      RaiseRegisterEntry: 'Raise an improvement or degradation', UpdateRegisterEntry: 'Change an improvement or degradation',
      LinkActionToEntry: 'Link an action to an entry', UnlinkActionFromEntry: 'Unlink an action from an entry',
      ScheduleMeeting: 'Book a meeting', UpdateMeeting: 'Change a meeting', CancelMeeting: 'Cancel a meeting', StartMeeting: 'Start a meeting'
    };
    var SETTING_WORDS = {
      OverdueReminderIntervalDays: 'days between late reminders', ReminderDaysBefore: 'days before the deadline for the first reminder',
      MaxDeadlineYears: 'furthest deadline in years', MonitorHours: 'queue monitor hours', DueSoonDays: 'days counted as due soon',
      InvitesEnabled: 'Outlook invitations', PdfEnabled: 'PDF minutes'
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
      else if (p.title) what += ': ' + p.title;
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
      else lines.push(h('li', null, h('span', null, h('b', { text: 'The queue monitor has not reported yet. ' }),
        'Check that the flow ESG Competency Hub | 3 Queue monitor is turned on.'), ui.chip('soon', 'Unknown')));
      if (hl.records === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Changes to notices and the register are not being processed. ' }), hl.recordsReason,
        ' Actions carry on as normal. In Power Automate, check that ESG Competency Hub | 4 Records is turned on.'), ui.chip('late', 'Not working')));
      if (hl.meetings === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Meeting bookings and changes are not being processed. ' }), hl.meetingsReason,
        ' Everything else carries on. In Power Automate, check that ESG Competency Hub | 5 Meetings is turned on.'), ui.chip('late', 'Not working')));
      if (hl.administration === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Administration changes are not being processed. ' }), hl.adminReason,
        ' Staff can carry on as normal. In Power Automate, check that ESG Competency Hub | 6 Administration is turned on.'), ui.chip('late', 'Not working')));
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

    // Repaints only while the changes tab is showing, so a form being filled in on another tab is never wiped.
    async function refresh(app) {
      var showing = function () { return app.state.view === 'admin' && (app.adminTab || 0) === 0; };
      app.admin = { loading: true, items: [] };
      if (showing()) app.refreshView();
      try {
        app.admin = { loading: false, items: await load(app) };
      } catch (_) {
        app.admin = { loading: false, error: true, items: [] };
      }
      if (showing()) app.refreshView();
    }

    var TABS = ['Changes needing attention', 'People', 'Settings', 'Feedback', 'Remove test data'];

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
      var panel = tab === 1 ? CH.views.people.list(app) : tab === 2 ? CH.views.settings.render(app) : tab === 3 ? CH.views.feedback.review(app) : tab === 4 ? CH.views.cleanup.render(app) : [
        healthCard(app),
        ui.card('Changes needing attention', [
          h('p', { class: 'muted small', text: 'Changes that failed three times, and runs that stopped more than ' + QUIET_MINUTES + ' minutes ago. The queue monitor retries the rest by itself.' }),
          h('div', { class: 'row' }, ui.linkButton('Check again', function () { refresh(app); })),
          changeList(app)])];
      return [
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
          h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
            h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
            C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
            app.person && app.model ? nav() : null,
            app.person && app.model && app.state.view === 'home' ? homeButtons() : null,
            app.person ? h('span', { class: 'who', text: CH.names.of(app.person) + ' · ' + app.person.Role }) : null)),
          app.person && app.model ? statusLine() : null,
          h('main', { id: 'ch-main', tabindex: '-1' }, content),
          app.person && app.model ? problems() : null,
          h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
          h('p', { class: 'sr-only', 'data-ch-said': true, role: 'status', 'aria-live': 'polite' }),
          // the feedback button sits in its own place in the footer, so it never covers anything (spec FB-1)
          h('footer', null, h('span'), h('span', { text: 'ESG Competency Hub · version ' + C.VERSION }),
            h('span', { class: 'fb-slot' }, app.person && app.model ? CH.views.feedback.bubble(app) : null))
        ];
      }

      // Main pages, as pills in the bar. Only pages that exist are listed.
      function nav() {
        var v = app.state.view;
        var items = [['My week', v === 'home', app.goHome], ['My to-dos', v === 'mine', function () { app.showMine(0); }]];
        if (app.access && app.access.isManagement) items.push(['Overview of all areas', v === 'manage', app.showDashboard]);
        if (app.access && app.access.isAdministrator) items.push(['Administration', v === 'admin', app.showAdmin]);
        return h('nav', { class: 'pills', 'aria-label': 'Main' }, items.map(function (x) {
          return h('button', { type: 'button', 'aria-current': x[1] ? 'page' : null, onclick: x[2], text: x[0] });
        }));
      }

      function homeButtons() {
        var acc = app.access;
        var first = acc.memberAreas[0] || (app.model.areas[0] && app.model.areas[0].key);
        return h('span', { class: 'bar-btns' },
          acc.canPostNotice(first) ? CH.ui.button('Post a notice', function () { app.postNotice(app.state.homeArea || first); }) : null,
          // the area is never guessed: the open area, else the person chooses (backlog 12)
          acc.memberAreas.length || acc.isManagement ? CH.ui.button('Raise an action', function () { app.raiseAction(app.state.homeArea || null); }, 'main') : null);
      }

      // On the home page the app fills the window exactly, so the page itself never scrolls. Small windows
      // (phones, or very short windows) keep ordinary scrolling.
      function fitToWindow() {
        if (!app.root || !app.root.style || !app.root.classList) return;
        // Every page fits the window on a desktop: the home page by its own layout, the others by scrolling inside.
        var fit = !!app.model && window.innerWidth > 900 && window.innerHeight > 560;
        app.root.classList.toggle('ch-fit', fit);
        app.root.classList.toggle('ch-page', fit && app.state.view !== 'home');
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
        app.root.style.setProperty('--text', '1');
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

      // Changes the page shows itself (release 1.2); administrators' changes are followed on the Administration page.
      function followed(e) { return CH.requests.ADMIN_TYPES.indexOf(e.type) < 0; }
      function saving(e) { return e.state === 'submitted' || e.state === 'slow'; }

      // One line under the bar, always there (so nothing below moves): what is still being saved, a pause in automatic
      // processing, or requests a dropped connection kept back. Otherwise "Everything is up to date."
      function statusLine() {
        var entries = app.tracker ? app.tracker.entries().filter(function (e) { return followed(e) && saving(e); }) : [];
        var unsent = app.tracker ? app.tracker.unsent() : [];
        var text, kind = '', extra = null;
        if (app.queueBlocked()) {
          kind = 'down';
          text = 'Changes can\'t be processed at the moment. You can still read everything, add updates and post notices – nothing you have sent is lost.';
        } else if (unsent.length) {
          kind = 'down';
          text = (unsent.length === 1 ? '1 change was not sent' : unsent.length + ' changes were not sent') + ': your connection dropped before it reached SharePoint. ';
          extra = CH.ui.linkButton('Send again', async function () {
            try { await app.tracker.resend(); render(false); } catch (_) { CH.ui.toast(app.root, 'Still could not send. Try again in a moment.', 'info'); }
          });
        } else if (entries.length) {
          kind = 'busy';
          var e = entries[0];
          var how = entries.some(function (x) { return x.retrying; }) ? ' – retrying automatically, you can carry on.'
            : entries.some(function (x) { return x.state === 'slow'; }) ? ' – taking longer than usual, but it will be saved. You can carry on.' : ' – you can carry on.';
          text = (entries.length === 1 ? '1 change still saving: ' + e.label : entries.length + ' changes still saving') + how;
        } else {
          text = 'Everything is up to date.';
        }
        return h('div', { class: 'status-line' + (kind ? ' ' + kind : ''), role: 'status', 'aria-live': 'polite' },
          h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: text }), extra);
      }

      // A change that was not saved: what happened, and Try again where that can work. Shown until dismissed.
      function problems() {
        if (!app.tracker) return null;
        var list = app.tracker.entries().filter(function (e) {
          return followed(e) && !e.dismissed && ['rejected', 'attention', 'cancelled', 'reverted'].indexOf(e.state) >= 0;
        }).slice(-3);
        if (!list.length) return null;
        return h('div', { class: 'problems', role: 'alert' }, list.map(function (e) {
          var text, again = false;
          if (e.state === 'rejected') {
            again = CH.requests.isConflict(e);
            text = again ? 'Someone else changed this a moment ago, so your change was not applied. Nothing was changed – the screen shows it as it is now.'
              : e.message + ' Nothing was changed.';
          } else if (e.state === 'attention') {
            again = true;
            text = /locked|Not fully/i.test(e.message)
              ? 'The Hub could not finish this change, and an administrator has been told. Part of it was made, so the record is locked until it is finished. Trying again is safe – it can never make the change twice.'
              : 'The Hub could not process this change. Nothing was changed, and an administrator has been told. Trying again is safe – it can never make the change twice.';
          } else {
            text = e.message;
          }
          return h('div', { class: 'problem' }, h('b', { text: (e.state === 'cancelled' ? 'Cancelled: ' : e.state === 'reverted' ? 'Reverted: ' : 'Not saved: ') + e.label }),
            h('p', { text: text }),
            h('div', { class: 'row' },
              again ? CH.ui.button('Try again', function () { tryAgain(e); }, 'main') : null,
              CH.ui.button('Dismiss', function () { app.tracker.dismiss(e); })));
        }));
      }

      async function tryAgain(e) {
        var rec = e.targetType === 'Notice' ? app.model.noticeById[e.targetId] : e.targetType === 'Register Entry' ? app.model.entryById[e.targetId]
          : e.targetType === 'Meeting' ? app.model.meetingById[e.targetId] : app.model.actionById[e.targetId];
        try {
          await app.tracker.retry(e, e.state === 'rejected' && rec && e.spec && e.spec.expectedRevision ? rec.revision : undefined);
        } catch (error) {
          CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info');
        }
        render(false);
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
          // a saved setting is read again, so the page shows the new value and uses it (DueSoonDays, MaxDeadlineYears)
          if (entry.type === 'UpdateSetting' && entry.state === 'done') { reload().then(function () { render(false); }).catch(function () { render(false); }); return; }
          if (['SetKnownAs', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson'].indexOf(entry.type) >= 0 && entry.state === 'done') {
            reloadPeople().then(function () { render(false); }).catch(function () { render(false); });
            return;
          }
          render(false);
          if (entry.state === 'done' && app.state.view === 'admin') setTimeout(function () { CH.views.admin.refresh(app); }, 1500);
          return;
        }
        if (entry.state !== 'done') {
          rebuild();
          render(false);
          if (app.panel) app.panel.refresh();
          return;
        }
        reload().then(function () {
          render(false);
          if (app.panel) app.panel.refresh();
          var a = app.model.actionById[entry.resultId];
          var e = app.model.entryById[entry.resultId];
          // a new record gets its number now; other changes just show ✓✓ Saved where they are (and are told to screen readers)
          if (entry.type === 'RaiseAction' && a) CH.ui.toast(app.root, a.ref + ' raised: ' + a.title + '.', 'ok');
          else if (entry.type === 'RaiseRegisterEntry' && e) CH.ui.toast(app.root, e.ref + ' raised: ' + e.title + '.', 'ok');
          CH.ui.say(app.root, 'Saved: ' + entry.label + '. ' + entry.message);
        }).catch(function () { CH.ui.toast(app.root, entry.message + ' Reload the page to see it.', 'ok'); });
      }

      function stateScreen(title, message, detail) {
        paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
          detail ? h('p', { class: 'muted small', text: detail }) : null));
      }

      app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
      app.showAdmin = function () { app.admin = null; app.feedback = null; app.state = { view: 'admin', area: null, tab: 0 }; render(true); };
      app.showDashboard = function () { app.dash = null; app.state = { view: 'manage', area: null, tab: 0 }; render(true); };
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
      // Notices and the register have their own flow (4 Records); it pauses with the queue, or on its own.
      app.recordsBlocked = function () { return app.queueBlocked() || (!!app.health && app.health.records === 'down'); };
      // Meetings have their own flow too (5 Meetings).
      app.meetingsBlocked = function () { return app.queueBlocked() || (!!app.health && app.health.meetings === 'down'); };
      app.openMeeting = function (mt) { CH.views.meetingPanel.open(app, mt.id); };
      // before go-live, what people add directly is marked as a test record (spec §7.4), as the flows mark theirs
      app.testMark = function () { return app.health && app.health.testing ? { IsTestRecord: '1' } : {}; };
      app.bookMeeting = function (key) { CH.views.meetingForm.open(app, key); };
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
      app.openNotice = function (n) { CH.views.recordPanel.openNotice(app, n.id); };
      app.openEntry = function (e) { CH.views.recordPanel.openEntry(app, e.id); };
      app.raiseEntry = function (key) { CH.views.entryForm.open(app, key); };
      // The mark beside a record (release 1.2): ✓ Sent while it is being saved, ✓✓ Saved for three seconds (it then fades),
      // ✕ Not saved after a refusal or a fault. kind: 'Action', 'Notice', 'Register Entry' or 'Meeting'.
      app.mark = function (rec, kind) {
        if (!rec || !app.tracker) return null;
        if (rec.sending) return h('span', { class: 'mark sent', title: 'Sent – being saved', text: '✓ Sent' });
        var e = app.tracker.forRecord(rec.id, kind);
        var since = e && e.state === 'done' && e.doneAt ? Date.now() - e.doneAt : Infinity;
        if (since < 4000) {
          return h('span', { class: 'mark saved', title: 'Saved', text: '✓✓ Saved', style: 'animation-delay:' + Math.round(3000 - since) + 'ms' });
        }
        if (e && !e.dismissed && (e.state === 'rejected' || e.state === 'attention')) return h('span', { class: 'mark refused', text: '✕ Not saved' });
        if (rec.locked) return h('span', { class: 'mark sent', text: 'being updated' });
        return null;
      };
      app.markAction = function (a) { return app.mark(a, 'Action'); };
      // "Mark as done" straight from a to-do card; "Reopen" on a card just marked done, if it was a slip (release 1.2)
      app.quickDone = function (a) {
        return app.tracker.submit({ type: 'MarkComplete', targetId: a.id, expectedRevision: a.revision, payload: { note: '' }, label: 'Mark as done: ' + a.title })
          .catch(function (error) { CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info'); });
      };
      app.quickReopen = function (a) {
        return app.tracker.submit({ type: 'ReopenAction', targetId: a.id, expectedRevision: a.revision, payload: { reason: 'Reopened straight after it was marked as done.' },
          label: 'Reopen: ' + a.title }).catch(function (error) { CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info'); });
      };
      // After an instant write (a flag, a comment): read the lists again and repaint, keeping any open panel.
      app.recordChanged = async function () {
        await reload();
        render(false);
        if (app.panel) app.panel.refresh();
      };
      // keys: every noticeboard it was posted to (the first is where it is kept); all of them reads "every noticeboard"
      app.noticePosted = async function (key, keys) {
        await reload();
        keys = keys && keys.length ? keys : [key];
        if (app.state.view === 'area' && keys.indexOf(app.state.area) >= 0) app.state.tab = 1;
        render(false);
        var names = keys.map(function (k) { return app.model.areaByKey[k].name; });
        var where = keys.length > 1 && keys.length === app.model.areas.length ? 'every noticeboard'
          : names.length === 1 ? 'the ' + names[0] + ' noticeboard'
          : 'the ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' noticeboards';
        CH.ui.toast(app.root, 'Your notice has been posted on ' + where + '.', 'ok');
      };

      function render(moveFocus) {
        if (!app.model) return;
        if (moveFocus && app.keep && Object.keys(app.keep).length) { app.keep = {}; rebuild(); }
        var content = [app.state.view === 'area' && app.model.areaByKey[app.state.area]
          ? CH.views.area.render(app, app.state.area, app.state.tab)
          : app.state.view === 'mine' ? CH.views.myActions.render(app)
          : app.state.view === 'manage' ? CH.views.dashboard.render(app)
          : app.state.view === 'admin' ? CH.views.admin.render(app) : CH.views.home.render(app)];
        paint(content);
        if (moveFocus) {
          var main = app.root.querySelector('#ch-main');
          if (main) main.focus();
          window.scrollTo(0, 0);
        }
      }

      function readPeople() {
        return app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,CanPostNotices,Status,KnownAs', null, ['KnownAs'])
          .then(function (res) { return res.rows; });
      }

      // People are read again after a change to them (a new name shows at once), then everything else.
      async function reloadPeople() {
        var people = await readPeople();
        var me = people.filter(function (p) { return Number(p.SiteUserId) === Number(app.person.SiteUserId); })[0];
        app.people = people;
        if (me) app.person = me;
        await reload();
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
        app.settings = raw.settings.rows || [];
        // the "due soon" window an administrator sets (DueSoonDays, 1 to 30 days)
        var soon = (app.settings.filter(function (r) { return r.Title === 'DueSoonDays'; })[0] || {}).Value;
        CH.config.dueSoonDays = /^\d{1,2}$/.test(String(soon || '')) && Number(soon) >= 1 && Number(soon) <= 30 ? Number(soon) : 7;
        app.raw = raw;
        rebuild();
      }

      // The model from the rows last read plus every change still being saved (CH.optimistic). Actions closed on this
      // screen are kept, marked Done, until the person moves to another page.
      function rebuild() {
        if (!app.raw || !app.access) return;
        var now = new Date();
        var today = CH.dates.localDate(now);
        var entries = app.tracker ? app.tracker.entries() : [];
        app.keep = app.keep || {};
        var view = CH.optimistic.apply(app.raw, entries, app.keep, { personId: app.person.SiteUserId, today: today, now: now });
        entries.forEach(function (e) {
          var closing = e.type === 'MarkComplete' || e.type === 'CloseAction';
          if (closing && saving(e)) {
            var row = (view.actions.rows || []).filter(function (r) { return Number(r.Id) === Number(e.targetId); })[0];
            if (row && row.Status === 'Closed') app.keep[e.targetId] = Object.assign({}, row, { _sending: '' });
          }
          if (closing && ['rejected', 'attention', 'cancelled'].indexOf(e.state) >= 0) delete app.keep[e.targetId];
          if (e.type === 'ReopenAction' && e.state === 'done') delete app.keep[e.targetId];
        });
        app.model = CH.model.build(view, app.people, app.access, today, now);
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
          people = await readPeople();
        } catch (error) {
          stateScreen('We could not confirm your access', CH.access.MESSAGES.UNAVAILABLE + ' Please reload the page. If this keeps happening, contact a Competency Hub administrator.',
            'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
          return;
        }
        var identity = CH.access.resolveIdentity(user, people);
        if (!identity.ok) {
          var admins = people.filter(function (p) { return p.IsAdministrator && p.Status === 'Active'; }).map(function (p) { return CH.names.of(p); });
          stateScreen('You do not have access yet', CH.access.MESSAGES[identity.reason] + ' ' +
            (admins.length ? 'Please contact ' + admins.join(' or ') + '.' : 'Please contact a Competency Hub administrator.'));
          return;
        }
        app.person = identity.person;
        app.loginName = user.LoginName || '';
        app.people = people;
        app.firstName = await app.sp.myFirstName();
        app.tracker = CH.requests.tracker(app, onRequestChange);
        try {
          await Promise.all([reload(), app.tracker.resume().catch(function () { return 0; })]);
          rebuild();   // the changes still being saved, read back with the requests, show again
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
        if (params.get('view') === 'manage' && app.access.isManagement) app.state = { view: 'manage', area: null, tab: 0 };
        healthTimer = setInterval(checkHealth, HEALTH_EVERY_MS);
        window.addEventListener('resize', fitToWindow);
        document.addEventListener('keydown', onKey);
        render(false);
        var actionParam = Number(params.get('action'));
        if (actionParam) CH.views.actionPanel.open(app, actionParam);
        else if (Number(params.get('notice'))) CH.views.recordPanel.openNotice(app, Number(params.get('notice')));
        else if (Number(params.get('entry'))) CH.views.recordPanel.openEntry(app, Number(params.get('entry')));
        else if (Number(params.get('meeting'))) CH.views.meetingPanel.open(app, Number(params.get('meeting')));
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
