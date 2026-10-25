// A simulated Welcome context and SharePoint REST endpoint for local testing.
// It answers only the requests the app makes, enforces the planned write permissions (notices by any
// active user; updates by area members and management; requests only in the user's own folder), records
// every write, and runs requests through the simulated request flow (flow-sim.js).
window.MockSharePoint = (function () {
  'use strict';
  var SITE = 'https://contoso.example/sites/ESGCompetencyHub';
  var params = new URLSearchParams(window.location.search);
  var mode = params.get('mode') || '';
  var asId = Number(params.get('as') || 112); // Rachel Boulden by default
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  var data = window.MockSeed(today);
  var writes = [];
  var requests = [];
  var thresholdHits = [];          // queries SharePoint would refuse on a large list (none expected)

  if (mode === 'duplicate') {
    var me = data.People.filter(function (p) { return p.SiteUserId === asId; })[0];
    if (me) data.People.push(Object.assign({}, me, { Id: 900 }));
  }
  // Attack strings in every free-text value people can type (the XSS sweep, spec Q1): all must show as plain text.
  if (mode === 'xss') {
    var ATTACK = ' <img src=x onerror="window.__xss=1"><script>window.__xss=1</script>"\'><b>bold</b>';
    var TEXT = ['Title', 'Body', 'Description', 'Notes', 'Location', 'Blocker', 'CancellationReason', 'Response', 'ClosureNote', 'AmendmentReason'];
    Object.keys(data).forEach(function (list) {
      if (list === 'People' || list === 'Competencies' || list === 'Competency Hub Settings') return;
      data[list].forEach(function (row) { TEXT.forEach(function (f) { if (typeof row[f] === 'string' && row[f]) row[f] += ATTACK; }); });
    });
  }
  // Co-owners and a named close-out check (1.9.0.0): Adam (a technician) shares action 40, and is named to check action 53, which is done.
  if (mode === 'shared') {
    data.Actions.forEach(function (x) {
      if (x.Id === 40) x.CoOwnerIds = '["124"]';
      if (x.Id === 53) { x.Status = 'Completed'; x.RequiresCloseOut = true; x.CloseOutById = 124; x.DateCompleted = new Date().toISOString(); }
    });
  }
  // A notice shown on several noticeboards (1.9.0.0): notice 2 sits in Flask and is also shown in Instruments.
  if (mode === 'shownIn') data.Noticeboard.forEach(function (n) { if (n.Id === 2) n.ShownIn = 'FLK;INS'; });
  if (mode === 'left') data.People.forEach(function (p) { if (p.SiteUserId === asId) p.Status = 'Left'; });
  // Limited mode: the queue monitor reports that changes are not being picked up.
  if (mode === 'limited') {
    data['Competency Hub Settings'][0].Value = JSON.stringify({ state: 'Down', reason: 'Changes are not being picked up by the request flow.',
      checkedAt: new Date(Date.now() - 5 * 60000).toISOString(), attention: 0 });
  }
  // Two changes needing an administrator: one that changed nothing, one that is part-made (its action locked).
  if (mode === 'attention') {
    var old = new Date(Date.now() - 60 * 60000).toISOString();
    var hist = '/sites/ESGCompetencyHub/Lists/History/Transactions';
    var actor = data.People.filter(function (p) { return p.Title === 'Rachel Boulden'; })[0].SiteUserId;
    data.History.push({ Id: 9001, Title: 'Request 501: ExtendDeadline', RowKind: 'Transaction', RequestKey: 'tx-nothing', RequestType: 'ExtendDeadline',
      RecordId: data.Actions[0].Id, State: 'Needs attention', Attempts: 3, LastError: 'Run 0858 failed. See its run history.', FirstClaimedAt: old,
      ActorId: actor, Payload: '{}', Created: old, Modified: old, FileDirRef: hist });
    data.History.push({ Id: 9002, Title: 'Request 502: ChangeStatus', RowKind: 'Transaction', RequestKey: 'tx-partly', RequestType: 'ChangeStatus',
      RecordId: data.Actions[1].Id, State: 'Needs attention', Attempts: 3, LastError: 'Run 0859 failed. See its run history.', FirstClaimedAt: old,
      ActorId: actor, Payload: '{}', Created: old, Modified: old, FileDirRef: hist });
    data.Actions[1].PendingRequestKey = 'tx-partly';
    data['Competency Hub Settings'][0].Value = JSON.stringify({ state: 'Healthy', reason: '', checkedAt: new Date(Date.now() - 5 * 60000).toISOString(), attention: 2 });
  }
  if (mode === 'actionsPartial') {
    for (var i = 0; i < 5200; i++) {
      data.Actions.push(Object.assign({}, data.Actions[i % 20], { Id: 1000 + i, Title: 'Bulk test action ' + (i + 1) }));
    }
  }

  function respond(status, body) {
    var text = body === undefined || body === null ? '' : JSON.stringify(body);
    return new Promise(function (resolve) {
      setTimeout(function () { resolve({ status: status, text: function () { return Promise.resolve(text); } }); }, mode === 'slow' ? 1200 : 5);
    });
  }

  function value(raw) {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
    if (!isNaN(Number(raw))) return Number(raw);
    return raw;
  }

  // Supports "Field eq value" clauses joined by "and", which is all the app uses.
  function matches(row, filter) {
    if (!filter) return true;
    return filter.split(/\s+and\s+/).every(function (clause) {
      // DateColumn ge datetime'2026-10-01T00:00:00Z'
      var dt = /^(\w+)\s+(ge|le|gt|lt)\s+datetime'([^']+)'$/.exec(clause.trim());
      if (dt) {
        if (!row[dt[1]]) return false;
        var a = new Date(row[dt[1]]).getTime(), b = new Date(dt[3]).getTime();
        return { ge: a >= b, le: a <= b, gt: a > b, lt: a < b }[dt[2]];
      }
      var m = /^(\w+)\s+eq\s+(.+)$/.exec(clause.trim());
      if (!m) throw new Error('Unsupported filter: ' + clause);
      if (m[1] === 'FSObjType') return true;
      var actual = row[m[1]];
      var expected = value(m[2]);
      if (typeof expected === 'boolean') return !!actual === expected;
      return actual === expected;
    });
  }

  function listTitle(url) {
    var m = /getbytitle\('((?:[^']|'')+)'\)/.exec(url);
    return m ? decodeURIComponent(m[1]).replace(/''/g, "'") : '';
  }

  function query(url) {
    var q = {};
    (url.split('?')[1] || '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) q[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    });
    return q;
  }

  function get(url) {
    requests.push('GET ' + url.replace(SITE, ''));
    if (url.indexOf('/_api/web/currentuser') >= 0) {
      if (mode === 'unknown') return respond(200, { Id: 999, Title: 'Someone New', Email: 'someone.new@example.test' });
      var me = data.People.filter(function (p) { return p.SiteUserId === asId; })[0];
      return respond(200, { Id: asId, Title: me ? me.Title : 'Unknown', Email: me ? me.Email : '', LoginName: me ? 'i:0#.f|membership|' + me.Email : '' });
    }
    if (url.indexOf('/_api/SP.UserProfiles.PeopleManager/GetMyProperties') >= 0) {
      if (mode === 'noProfile') return respond(403, { error: 'Access denied' });
      var who = data.People.filter(function (p) { return p.SiteUserId === asId; })[0];
      return respond(200, { UserProfileProperties: [{ Key: 'FirstName', Value: who ? who.Title.split(' ')[0] : '' }, { Key: 'LastName', Value: '' }] });
    }
    var title = listTitle(url);
    if (mode === 'people403' && title === 'People') return respond(403, { error: 'Access denied' });
    if (mode === 'actions404' && title === 'Actions') return respond(404, { error: 'List not found' });
    if (!data[title]) return respond(404, { error: 'List not found' });
    var q = query(url);
    // SharePoint's list view threshold, on every query to a list that can grow past 5,000 items: the filter must start
    // with an indexed column and the order be by one (an unfiltered read in Id order is served from the Id index)
    var indexed = (window.MockIndexes || {})[title];
    if (indexed) {
      var ok = function (col) { return col === 'Id' || col === 'ID' || indexed.indexOf(col) >= 0 || (/Id$/.test(col) && indexed.indexOf(col.slice(0, -2)) >= 0); };
      var first = /^\s*\(?\s*(?:startswith\()?(\w+)/.exec(q.$filter || '');
      var orderCol = (q.$orderby || '').split(' ')[0];
      if ((q.$filter && (!first || !ok(first[1]))) || (orderCol && !ok(orderCol)) || (!q.$filter && orderCol && orderCol !== 'Id')) {
        thresholdHits.push(title + ': ' + (q.$filter || '') + (q.$orderby ? ' order ' + q.$orderby : ''));
        return respond(500, { error: { message: { value: 'The attempted operation is prohibited because it exceeds the list view threshold.' } } });
      }
    }
    var rows = data[title].filter(function (r) { return matches(r, q.$filter); });
    // Feedback is add-only for everyone but administrators: each person reads only their own (spec ADM-5).
    if (title === 'Feedback') {
      var reader = data.People.filter(function (p) { return p.SiteUserId === asId; })[0];
      if (!reader || !reader.IsAdministrator) rows = rows.filter(function (r) { return r.AuthorId === asId; });
    }
    var top = Number(q.$top || 100);
    var skip = Number(q.$skiptoken || 0);
    var page = rows.slice(skip, skip + top);
    var body = { value: page };
    if (skip + top < rows.length) {
      body['odata.nextLink'] = url.replace(/&\$skiptoken=\d+/, '') + '&$skiptoken=' + (skip + top);
    }
    return respond(200, body);
  }

  function post(url, options) {
    requests.push('POST ' + url.replace(SITE, ''));
    if (url.indexOf('/_api/contextinfo') >= 0) return respond(200, { FormDigestValue: 'mock-digest' });
    var body = JSON.parse(options.body || '{}');
    // Administrators answer feedback by editing the item; nobody else may change it (spec ADM-5).
    var upd = /\/items\((\d+)\)\/ValidateUpdateListItem$/.exec(url);
    if (upd) {
      var editor = data.People.filter(function (p) { return p.SiteUserId === asId && p.Status === 'Active'; })[0];
      var list = listTitle(url);
      writes.push({ list: list, update: Number(upd[1]), by: asId });
      // Try again (release 1.2): a person may set their own request back to Submitted; the flow then resumes it
      if (list === 'Requests') {
        var own = data.Requests.filter(function (r) { return r.Id === Number(upd[1]) && /\/u(\d+)$/.exec(r.FileDirRef || '') && Number(/\/u(\d+)$/.exec(r.FileDirRef)[1]) === asId; })[0];
        if (!own || !editor) return respond(403, { error: 'Access denied' });
        body.formValues.forEach(function (f) { own[f.FieldName] = f.FieldValue; });
        if (own.Status === 'Submitted') flow.schedule(own, mode);
        return respond(200, { value: body.formValues.map(function (f) { return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: false }; }) });
      }
      if (list !== 'Feedback' || !editor || !editor.IsAdministrator) return respond(403, { error: 'Access denied' });
      var item = data.Feedback.filter(function (f) { return f.Id === Number(upd[1]); })[0];
      if (!item) return respond(404, { error: 'Item not found' });
      body.formValues.forEach(function (f) { item[f.FieldName === 'RespondedBy' ? 'RespondedById' : f.FieldName] = f.FieldName === 'RespondedBy' ? asId : f.FieldValue; });
      return respond(200, { value: body.formValues.map(function (f) { return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: false }; }) });
    }
    if (url.indexOf('/AddValidateUpdateItemUsingPath') < 0) return respond(400, { error: 'Not supported by the mock' });
    var title = listTitle(url);
    var path = body.listItemCreateInfo.FolderPath.DecodedUrl;
    var folder = path.split('/Lists/')[1].split('/').slice(1).join('/');
    var me = data.People.filter(function (p) { return p.SiteUserId === asId && p.Status === 'Active'; })[0];
    writes.push({ list: title, folder: folder, by: asId });
    var values = {};
    body.formValues.forEach(function (f) { values[f.FieldName] = f.FieldValue; });
    if (!me) return respond(403, { error: 'Access denied' });
    var store = WRITABLE[title];
    if (!store || !store.allowed(folder, me)) return respond(403, { error: 'Access denied' });
    var unique = store.unique;
    if (unique && data[title].some(function (n) { return n[unique] === values[unique]; })) {
      return respond(200, { value: [{ FieldName: unique, HasException: true, ErrorMessage: 'This value must be unique.' }] });
    }
    var id = data[title].reduce(function (m, n) { return Math.max(m, n.Id); }, 0) + 1;
    var row = store.row(values, id, path);
    if (values.IsTestRecord !== undefined) row.IsTestRecord = values.IsTestRecord === '1';
    data[title].push(row);
    if (title === 'Requests') flow.schedule(row, mode);
    return respond(200, { value: body.formValues.map(function (f) { return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: false }; })
      .concat([{ FieldName: 'Id', FieldValue: String(id), HasException: false }]) });
  }

  // What each list lets a signed-in user add, following the planned permissions (E.0, E.4, K4.1).
  function writesArea(me, key) {
    var c = data.Competencies.filter(function (x) { return x.CompetencyKey === key && x.Status === 'Active'; })[0];
    if (!c) return false;
    if (me.Role === 'Team Leader' || me.Role === 'Group Head') return true;
    return data['Competency Members'].some(function (m) { return m.PersonId === me.SiteUserId && m.CompetencyId === c.Id && m.Status === 'Active'; });
  }
  var WRITABLE = {
    // Any active user, in any active area's folder.
    Noticeboard: {
      unique: 'ClientKey',
      allowed: function (folder) { return data.Competencies.some(function (c) { return c.CompetencyKey === folder && c.Status === 'Active'; }); },
      row: function (v, id, path) {
        return { Id: id, Title: v.Title, Body: v.Body, Category: v.Category, IsImportant: v.IsImportant === '1', ImportantUntil: null, Status: 'Active',
          ImportantDays: v.ImportantDays ? Number(v.ImportantDays) : null, ShownIn: v.ShownIn || '',
          AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path, ClientKey: v.ClientKey };
      }
    },
    // Only into the user's own folder.
    Requests: {
      unique: 'RequestKey',
      allowed: function (folder, me) { return folder === 'u' + me.SiteUserId; },
      row: function (v, id, path) {
        return { Id: id, Title: v.Title, RequestKey: v.RequestKey, RequestType: v.RequestType, TargetType: v.TargetType,
          TargetId: v.TargetId ? Number(v.TargetId) : null, ExpectedRevision: v.ExpectedRevision ? Number(v.ExpectedRevision) : null,
          MeetingId: v.MeetingId ? Number(v.MeetingId) : null, Payload: v.Payload, Status: 'Submitted', AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path };
      }
    },
    // Members and management add, in the area's folder (comments and flags on notices and entries) or in an action's
    // own folder {area}/A{id}, which exists once the action is committed.
    Updates: {
      unique: 'ClientKey',
      allowed: function (folder, me) {
        if (/^[A-Z]+$/.test(folder)) return writesArea(me, folder);
        var m = /^([A-Z]+)\/A(\d+)$/.exec(folder);
        if (!m || !writesArea(me, m[1])) return false;
        return data.Actions.some(function (a) {
          return a.Id === Number(m[2]) && a.FileDirRef.split('/').pop() === m[1] && !(a.PendingRequestKey && a.CreatedRequestKey === 'F|' + a.PendingRequestKey);
        });
      },
      row: function (v, id, path) {
        return { Id: id, Title: v.Title, ClientKey: v.ClientKey, ParentType: v.ParentType, ParentId: Number(v.ParentId), EntryType: v.EntryType,
          IsFlagEvent: v.IsFlagEvent === '1', IsHidden: false, Body: v.Body, AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path };
      }
    },
    // A meeting's Record folder: the area's meeting runners and management, while the meeting is open (spec §4.3).
    'Meeting Items': {
      unique: 'RowKey',
      allowed: function (folder, me) {
        var m = /^([A-Z]+)\/MTG-(\d+)\/Record$/.exec(folder);
        if (!m) return false;
        var mt = data.Meetings.filter(function (x) { return x.Id === Number(m[2]); })[0];
        var c = data.Competencies.filter(function (x) { return x.CompetencyKey === m[1]; })[0];
        if (!mt || !c || mt.CompetencyId !== c.Id || ['Scheduled', 'In Progress'].indexOf(mt.Status) < 0) return false;
        if (me.Role === 'Team Leader' || me.Role === 'Group Head') return true;
        return data['Competency Members'].some(function (x) { return x.PersonId === me.SiteUserId && x.CompetencyId === c.Id && x.Status === 'Active' && x.CanManageMeetings; });
      },
      row: function (v, id, path) {
        return { Id: id, Title: v.Title, RowKey: v.RowKey, RecordKey: v.RecordKey, MeetingId: Number(v.MeetingId), RowType: v.RowType, SourceType: v.SourceType,
          Section: v.Section, Notes: v.Notes, SourceId: v.SourceId ? Number(v.SourceId) : null, Outcome: v.Outcome || '', Attendance: v.Attendance || '',
          AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path };
      }
    },
    // Anyone active may add feedback, at the list's root only. People read only their own items here, so SharePoint
    // cannot enforce a unique ClientKey; the app looks for its own item before offering a retry.
    Feedback: {
      allowed: function (folder) { return folder === ''; },
      row: function (v, id, path) {
        return { Id: id, Title: v.Title, FeedbackType: v.FeedbackType, Description: v.Description, Status: 'New', PageView: v.PageView, ClientKey: v.ClientKey,
          AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path };
      }
    }
  };
  var flow = window.MockFlow.create(data, today);

  function Client() {}
  Client.configurations = { v1: {} };
  Client.prototype.get = function (url) { return get(url); };
  Client.prototype.post = function (url, config, options) { return post(url, options || {}); };

  var ctx = {
    getWebPart: function () {
      return { spHttpClient: new Client(), pageContext: { web: { absoluteUrl: SITE, serverRelativeUrl: '/sites/ESGCompetencyHub' } } };
    }
  };

  function start() {
    var userSelect = document.getElementById('mock-user');
    var modeSelect = document.getElementById('mock-mode');
    if (userSelect) {
      data.People.filter(function (p, i, all) { return all.indexOf(p) === i && p.Id < 900; }).forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.SiteUserId;
        o.textContent = p.Title + ' – ' + p.Role;
        if (p.SiteUserId === asId) o.selected = true;
        userSelect.appendChild(o);
      });
      modeSelect.value = mode;
      function go() {
        var q = new URLSearchParams(window.location.search);
        q.set('as', userSelect.value);
        if (modeSelect.value) q.set('mode', modeSelect.value); else q.delete('mode');
        window.location.search = q.toString();
      }
      userSelect.addEventListener('change', go);
      modeSelect.addEventListener('change', go);
    }
    if (params.get('stamp')) document.querySelector('[data-ch-root]').setAttribute('data-ch-version', params.get('stamp'));
    var app = current = window.ESGCompetencyHub(ctx);
    app.onInitialize();
    if (params.get('drive') && window.MockDrivers) setTimeout(function () { window.MockDrivers.run(params.get('drive')); }, 50);
    return app;
  }

  // A page reload as the app sees it: the old instance goes, a new one starts on the same (simulated) site.
  var current = null;
  function reload() {
    if (current) current.onDispose();
    var root = document.querySelector('[data-ch-root]');
    while (root.firstChild) root.removeChild(root.firstChild);
    root.textContent = 'Loading the ESG Competency Hub…';
    current = window.ESGCompetencyHub(ctx);
    current.onInitialize();
  }

  return { start: start, reload: reload, ctx: ctx, writes: writes, requests: requests, thresholdHits: thresholdHits, data: data };
})();
