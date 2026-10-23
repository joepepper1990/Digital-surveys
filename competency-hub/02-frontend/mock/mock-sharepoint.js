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

  if (mode === 'duplicate') {
    var me = data.People.filter(function (p) { return p.SiteUserId === asId; })[0];
    if (me) data.People.push(Object.assign({}, me, { Id: 900 }));
  }
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
      return respond(200, { Id: asId, Title: me ? me.Title : 'Unknown', Email: me ? me.Email : '' });
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
    var rows = data[title].filter(function (r) { return matches(r, q.$filter); });
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
    if (data[title].some(function (n) { return n[unique] === values[unique]; })) {
      return respond(200, { value: [{ FieldName: unique, HasException: true, ErrorMessage: 'This value must be unique.' }] });
    }
    var id = data[title].reduce(function (m, n) { return Math.max(m, n.Id); }, 0) + 1;
    var row = store.row(values, id, path);
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
          Payload: v.Payload, Status: 'Submitted', AuthorId: asId, Created: new Date().toISOString(), FileDirRef: path };
      }
    },
    // Members and management add, in an action's own folder {area}/A{id}, which exists once the action is committed.
    Updates: {
      unique: 'ClientKey',
      allowed: function (folder, me) {
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

  return { start: start, reload: reload, ctx: ctx, writes: writes, requests: requests, data: data };
})();
