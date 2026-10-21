// A simulated Welcome context and SharePoint REST endpoint for local testing.
// It answers only the requests the app makes, enforces the same write rule as the planned
// permissions (any active user may add a notice; nothing else is writable here), and records
// every write so the tests can prove the shell stays read-only otherwise.
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
    var folder = body.listItemCreateInfo.FolderPath.DecodedUrl.split('/').pop();
    var me = data.People.filter(function (p) { return p.SiteUserId === asId && p.Status === 'Active'; })[0];
    writes.push({ list: title, folder: folder, by: asId });
    if (title !== 'Noticeboard' || !me) return respond(403, { error: 'Access denied' });
    var values = {};
    body.formValues.forEach(function (f) { values[f.FieldName] = f.FieldValue; });
    if (data.Noticeboard.some(function (n) { return n.ClientKey === values.ClientKey; })) {
      return respond(200, { value: [{ FieldName: 'ClientKey', HasException: true, ErrorMessage: 'This value must be unique.' }] });
    }
    var id = data.Noticeboard.reduce(function (m, n) { return Math.max(m, n.Id); }, 0) + 1;
    data.Noticeboard.push({
      Id: id, Title: values.Title, Body: values.Body, Category: values.Category, IsImportant: values.IsImportant === '1',
      ImportantUntil: null, Status: 'Active', AuthorId: asId, Created: new Date().toISOString(),
      FileDirRef: '/sites/ESGCompetencyHub/Lists/Noticeboard/' + folder, ClientKey: values.ClientKey
    });
    return respond(200, { value: body.formValues.map(function (f) { return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: false }; })
      .concat([{ FieldName: 'Id', FieldValue: String(id), HasException: false }]) });
  }

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
    var app = window.ESGCompetencyHub(ctx);
    app.onInitialize();
    if (params.get('drive') && window.MockDrivers) setTimeout(function () { window.MockDrivers.run(params.get('drive')); }, 50);
    return app;
  }

  return { start: start, ctx: ctx, writes: writes, requests: requests, data: data };
})();
