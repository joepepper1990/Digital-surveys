/* ESG Competency Hub 0.1.0 – built from src/ by tools/build.js. Do not edit. */
window.ESGCompetencyHub = function (ctx) {
  'use strict';
  var CH = {};
  /* src/core/config.js */
  // Fixed names and limits. Lists are addressed by display title; folders by list URL name.
  CH.config = {
    VERSION: '0.1.0',
    ENVIRONMENT: 'TEST',
    lists: {
      competencies: { title: 'Competencies', url: 'Competencies' },
      people: { title: 'People', url: 'People' },
      members: { title: 'Competency Members', url: 'CompetencyMembers' },
      actions: { title: 'Actions', url: 'Actions' },
      notices: { title: 'Noticeboard', url: 'Noticeboard' },
      updates: { title: 'Updates', url: 'Updates' },
      calendar: { title: 'Calendar Events', url: 'CalendarEvents' },
      meetings: { title: 'Meetings', url: 'Meetings' }
    },
    pageSize: 500,
    maxRows: 5000,
    dueSoonDays: 7,
    meetingOverdueDays: 35,
    noticeImportantMaxDays: 30,
    managementRoles: ['Team Leader', 'Group Head']
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

      return { siteUrl: siteUrl, origin: origin, siteRelative: siteRelative, items: items, currentUser: currentUser, addToFolder: addToFolder };
    }

    // The last folder segment of an item's FileDirRef (e.g. '.../Lists/Noticeboard/FLK' -> 'FLK').
    function folderOf(fileDirRef) {
      var parts = String(fileDirRef || '').split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }

    return { create: create, SpError: SpError, escapeOData: escapeOData, folderOf: folderOf };
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

  /* src/domain/model.js */
  // Loads the lists the shell needs and turns them into one read-only model.
  // Every section records whether it is complete, partial or unavailable, so a failed or
  // truncated read is never presented as "nothing to show".
  CH.model = (function () {
    var D = CH.dates;

    var QUERIES = {
      competencies: '$select=Id,Title,CompetencyKey,SortOrder,Status',
      members: "$select=Id,CompetencyId,PersonId,CanManageMeetings,Status&$filter=Status eq 'Active'",
      actions: '$select=Id,Title,CompetencyId,LinkedCompetenciesId,AssignedToId,RaisedById,DueDay,Status,IsOpen,ExtensionCount,' +
        'RequiresCloseOut,PendingRequestKey,CreatedRequestKey&$filter=IsOpen eq 1 and FSObjType eq 0',
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
        .map(function (c) { return { id: c.Id, key: c.CompetencyKey, name: c.Title, status: c.Status, sort: c.SortOrder || 100 }; })
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

      var actions = (raw.actions.rows || []).filter(function (r) { return !isUncommitted(r) && r.Status !== 'Closed'; }).map(function (r) {
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
          waitingCloseOut: waitingCloseOut, group: words.group, dueText: words.text
        };
      });
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
        var stale = !m.next && (!m.last || D.daysBetween(m.last, today) > CH.config.meetingOverdueDays);
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

      return {
        today: today, areas: areas, areaByKey: areaByKey, stats: stats, actions: actions, notices: notices, calendar: calendar,
        inArea: inArea, nameOf: nameOf,
        sections: {
          actions: section(raw.actions), notices: section(raw.notices), meetings: section(raw.meetings),
          calendar: section(raw.calendar), flags: section(raw.updates), members: section(raw.members)
        }
      };
    }

    return { load: load, build: build, isUncommitted: isUncommitted };
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
    function actionList(actions, sub, emptyText, state) {
      if (state === 'unavailable') return null;
      if (!actions.length) return h('p', { class: 'muted', text: emptyText });
      var out = [];
      GROUPS.forEach(function (g) {
        var rows = actions.filter(function (a) { return a.group === g[0]; })
          .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); });
        if (!rows.length) return;
        out.push(h('h3', { class: 'group-title' }, h('span', { class: 'dot', style: 'background:' + g[2], 'aria-hidden': 'true' }), g[1]));
        out.push(h('ul', { class: 'items' }, rows.map(function (a) {
          return h('li', null,
            h('span', null, h('span', { class: 't', text: a.title }), h('span', { class: 's', text: sub(a) })),
            chip(a.waitingCloseOut ? 'later' : a.group, a.dueText));
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

    return {
      chip: chip, card: card, button: button, linkButton: linkButton, sectionNote: sectionNote,
      actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast
    };
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

    function myActions(app) {
      var mine = app.model.actions.filter(function (a) { return a.ownerId === app.person.SiteUserId; });
      return ui.card('Your actions', [
        ui.sectionNote(app.model.sections.actions, 'actions'),
        ui.actionList(mine, function (a) { return a.areaName; }, 'You have no open actions. Nice work.', app.model.sections.actions)
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
          items.push(h('li', null, h('span', null, h('b', { text: a.title }), h('br'),
            h('span', { class: 'muted small', text: a.areaName + ' · ' + a.ownerName + (a.extensions >= 2 ? ' · deadline moved ' + a.extensions + ' times' : '') })),
          ui.chip('late', a.dueText)));
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
      var first = (app.person.Title || '').split(' ')[0];
      var out = [h('h1', { text: greeting(first) })];
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
          ui.button('Raise an action', function () { app.comingSoon('Raising actions'); }, 'main'),
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
          ui.button('Raise an action', function () { app.comingSoon('Raising actions'); }, 'main'),
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

    return { render: render, greeting: greeting };
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
        }, 'There are no open actions in ' + area.name + '.', app.model.sections.actions)
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
          ui.button('Raise an action', function () { app.comingSoon('Raising actions'); }, 'main'),
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
  // "Post a notice": the one instant write in this version. Any active user may post on any active
  // area's noticeboard (K4.1); only members may mark a notice as important.
  CH.views = CH.views || {};
  CH.views.noticeForm = (function () {
    var h = CH.dom.h;
    var CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

    function newKey() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      var x = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join('');
      return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
    }

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
      var root = app.root;
      var areas = app.model.areas.filter(function (a) { return app.access.canPostNotice(a.key); });
      var clientKey = newKey();
      var previousFocus = document.activeElement;

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

      function field(label, input, hint, errId) {
        return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), hint ? h('span', { class: 'hint', text: hint }) : null, input,
          h('span', { class: 'field-error', id: errId }));
      }

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

      var form = h('form', { class: 'dialog-body', novalidate: true },
        field('Which noticeboard?', areaSelect, null, 'ch-n-area-err'),
        outsideNote,
        field('Title', title, 'A short summary people will recognise.', 'ch-n-title-err'),
        field('Message', body, null, 'ch-n-body-err'),
        field('Category', category, null, 'ch-n-cat-err'),
        importantRow,
        errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: close })));

      var dialog = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ch-n-heading' },
        h('h2', { id: 'ch-n-heading', text: 'Post a notice' }), form);
      var scrim = h('div', { class: 'scrim', onclick: function (e) { if (e.target === scrim) close(); } }, dialog);

      function close() {
        scrim.remove();
        document.removeEventListener('keydown', onKey, true);
        if (previousFocus && previousFocus.focus) previousFocus.focus();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        var focusable = dialog.querySelectorAll('select, input, textarea, button');
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        ['area', 'title', 'body', 'cat'].forEach(function (k) { var n = form.querySelector('#ch-n-' + k + '-err'); if (n) n.textContent = ''; });
        errorBox.textContent = '';
        var values = { title: title.value, body: body.value, category: category.value };
        var errors = validate(values);
        if (errors.title) form.querySelector('#ch-n-title-err').textContent = errors.title;
        if (errors.body) form.querySelector('#ch-n-body-err').textContent = errors.body;
        if (errors.category) form.querySelector('#ch-n-cat-err').textContent = errors.category;
        if (Object.keys(errors).length) { (errors.title ? title : errors.body ? body : category).focus(); return; }

        var key = areaSelect.value;
        submit.disabled = true;
        submit.textContent = 'Posting…';
        try {
          await app.sp.addToFolder('notices', key, {
            Title: values.title.trim(), Body: values.body.trim(), Category: values.category,
            IsImportant: important.checked && app.access.canWrite(key) ? '1' : '0',
            ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active'
          });
          close();
          app.noticePosted(key);
        } catch (error) {
          // An unclear failure may still have saved the notice: look for it by its client key first.
          try {
            var found = await app.sp.items(CH.config.lists.notices.title,
              "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1);
            if (found.rows.length) { close(); app.noticePosted(key); return; }
          } catch (_) { /* fall through to the message */ }
          submit.disabled = false;
          submit.textContent = 'Try again';
          // The same client key is reused on retry, so a notice that did save is never duplicated.
          errorBox.textContent = error.status === 403
            ? 'SharePoint did not allow this notice to be posted. Your text has been kept.'
            : 'Your notice could not be posted just now. Your text has been kept – try again in a moment.';
        }
      });

      document.addEventListener('keydown', onKey, true);
      root.appendChild(scrim);
      refreshArea();
      title.focus();
    }

    return { open: open, validate: validate, CATEGORIES: CATEGORIES };
  })();

  /* src/app.js */
  // Application controller: Welcome lifecycle, identity, loading and navigation.
  CH.app = (function () {
    var h = CH.dom.h;

    function create(ctx) {
      var started = false;
      var disposed = false;
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

      function frame(content) {
        var C = CH.config;
        return [
          h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
            h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
            C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
            app.person ? h('span', { class: 'who', text: app.person.Title + ' · ' + app.person.Role }) : null)),
          h('main', { id: 'ch-main', tabindex: '-1' }, content),
          h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
          h('footer', { text: 'ESG Competency Hub · version ' + C.VERSION })
        ];
      }

      function paint(content) {
        if (disposed) return;
        CH.dom.clear(app.root);
        CH.dom.append(app.root, frame(content));
      }

      function stateScreen(title, message, detail) {
        paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
          detail ? h('p', { class: 'muted small', text: detail }) : null));
      }

      app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
      app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
      app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
      app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
      app.noticePosted = async function (key) {
        await reload();
        if (app.state.view === 'area' && app.state.area === key) app.state.tab = 1;
        render(false);
        CH.ui.toast(app.root, 'Your notice has been posted on the ' + app.model.areaByKey[key].name + ' noticeboard.', 'ok');
      };

      function render(moveFocus) {
        if (!app.model) return;
        var content = app.state.view === 'area' && app.model.areaByKey[app.state.area]
          ? CH.views.area.render(app, app.state.area, app.state.tab)
          : CH.views.home.render(app);
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
        try {
          await reload();
        } catch (error) {
          stateScreen('The Competency Hub could not load', 'Some of the information could not be read. Please reload the page in a few minutes.',
            'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var areaParam = (params.get('area') || '').toUpperCase();
        if (app.model.areaByKey[areaParam]) app.state = { view: 'area', area: areaParam, tab: 0 };
        render(false);
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
        onDispose: function () { disposed = true; }
      };
    }

    return { create: create };
  })();

  return CH.app.create(ctx);
};
