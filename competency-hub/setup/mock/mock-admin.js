// A simulated SharePoint site for testing Setup locally. It models lists, columns, items, folders,
// groups, permission levels and permission inheritance, and records every write. It follows the
// SharePoint rules Setup depends on: unique and required columns are enforced, grants need unique
// permissions, and breaking inheritance without copying adds the current user with Full Control.
window.MockAdmin = (function () {
  'use strict';
  var SITE = 'https://contoso.example/sites/ESGCompetencyHub';
  var REL = '/sites/ESGCompetencyHub';
  var FULL = 1073741829, EDIT = 1073741830, READ = 1073741826;

  function create(scenario, options) {
    options = options || {};
    var nextGuid = 1, nextPrincipal = 20, nextRoleDef = 1073741930;
    var writes = [];
    var failAfter = options.failAfterWrites || 0;
    var me = { Id: 7, Title: 'Pepper Joseph', Email: 'joseph.pepper@example.test', LoginName: 'i:0#.f|membership|joseph.pepper@example.test' };
    var users = [me];
    var groups = [
      { Id: 3, Title: 'ESG Competency Hub Owners', users: [7], OnlyAllowMembersViewMembership: false, AllowRequestToJoinLeave: false, AllowMembersEditMembership: false },
      { Id: 4, Title: 'ESG Competency Hub Visitors', users: [], OnlyAllowMembersViewMembership: false, AllowRequestToJoinLeave: false, AllowMembersEditMembership: false },
      { Id: 5, Title: 'ESG Competency Hub Members', users: [], OnlyAllowMembersViewMembership: false, AllowRequestToJoinLeave: false, AllowMembersEditMembership: scenario === 'membersShare' }
    ];
    var roleDefs = [
      { Id: FULL, Name: 'Full Control', RoleTypeKind: 5, BasePermissions: { Low: '4294967295', High: '2147483647' } },
      { Id: EDIT, Name: 'Edit', RoleTypeKind: 6, BasePermissions: { Low: '1011030767', High: '432' } },
      { Id: READ, Name: 'Read', RoleTypeKind: 2, BasePermissions: { Low: '138612833', High: '176' } }
    ];
    var web = {
      Title: 'ESG Competency Hub', WebTemplate: scenario === 'communication' ? 'SITEPAGEPUBLISHING' : 'GROUP',
      MembersCanShare: scenario === 'membersShare', RequestAccessEmail: '', ServerRelativeUrl: REL,
      LocaleId: scenario === 'wrongRegion' ? 1033 : 2057, TimeZoneId: scenario === 'wrongRegion' ? 11 : 2,
      ra: [{ p: 3, r: [FULL] }, { p: 5, r: [EDIT] }, { p: 4, r: [READ] }]
    };
    var lists = [];

    function guid() { var n = String(nextGuid++); return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); }
    function newList(title, template, url) {
      var l = { Id: guid(), Title: title, BaseTemplate: template, url: url, items: [], nextItem: 1, unique: false, ra: [],
        settings: { EnableVersioning: false, MajorVersionLimit: 0, NoCrawl: false, EnableFolderCreation: template === 101, EnableAttachments: template === 100, WriteSecurity: 1 },
        fields: template === 101 ? [{ InternalName: 'Title', Title: 'Title', TypeAsString: 'Text', Required: false, Indexed: false, EnforceUniqueValues: false }]
          : [{ InternalName: 'Title', Title: 'Title', TypeAsString: 'Text', Required: true, Indexed: false, EnforceUniqueValues: false }] };
      lists.push(l);
      return l;
    }
    var pages = newList('Site Pages', 119, REL + '/SitePages');
    ['Home.aspx', 'HubSetup.aspx'].concat(scenario === 'withHubPage' ? ['Hub.aspx'] : []).forEach(function (f) {
      pages.items.push({ Id: pages.nextItem++, FSObjType: 0, FileLeafRef: f, FileDirRef: pages.url, unique: false, ra: [] });
    });
    newList('Welcome Web Part - Custom Layouts', 101, REL + '/WelcomeCustomLayouts');
    newList('Welcome Web Part - Errors', 100, REL + '/Lists/WelcomeErrors');

    function respond(status, body) {
      var text = body === undefined || body === null ? '' : JSON.stringify(body);
      return Promise.resolve({ status: status, text: function () { return Promise.resolve(text); } });
    }
    function fail(status, msg) { return respond(status, { 'odata.error': { message: { value: msg } } }); }
    function unq(s) { return s.replace(/''/g, "'"); }

    function principalInfo(id) {
      var g = groups.filter(function (x) { return x.Id === id; })[0];
      if (g) return { Id: g.Id, Title: g.Title, LoginName: g.Title };
      var u = users.filter(function (x) { return x.Id === id; })[0];
      return u ? { Id: u.Id, Title: u.Title, LoginName: u.LoginName } : { Id: id, Title: 'Unknown', LoginName: '' };
    }
    function raOut(ra) {
      return ra.map(function (a) {
        return { PrincipalId: a.p, Member: principalInfo(a.p), RoleDefinitionBindings: a.r.map(function (id) {
          var d = roleDefs.filter(function (x) { return x.Id === id; })[0];
          return { Id: id, Name: d ? d.Name : '?' };
        }) };
      });
    }

    function listByGuid(id) { return lists.filter(function (l) { return l.Id === id; })[0]; }
    function findFolder(url) {
      for (var i = 0; i < lists.length; i++) {
        var l = lists[i];
        if (url === l.url) return { list: l, item: null };
        var it = l.items.filter(function (x) { return x.FSObjType === 1 && x.FileDirRef + '/' + x.FileLeafRef === url; })[0];
        if (it) return { list: l, item: it };
      }
      return null;
    }
    function parentOf(list, item) {
      if (!item) return null;
      if (item.FileDirRef === list.url) return null;
      var f = findFolder(item.FileDirRef);
      return f ? f.item : null;
    }
    function effective(list, item) {
      var cur = item;
      while (cur) { if (cur.unique) return cur.ra; cur = parentOf(list, cur); }
      return list.unique ? list.ra : web.ra;
    }

    // Resolves a securable path to { list, item }.
    function securable(path) {
      var m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/items\((\d+)\)$/.exec(path);
      if (m) { var l = listByGuid(m[1]); return l && { list: l, item: l.items.filter(function (x) { return x.Id === Number(m[2]); })[0] }; }
      m = /^\/_api\/web\/GetFolderByServerRelativePath\(decodedurl='((?:[^']|'')+)'\)\/ListItemAllFields$/.exec(path);
      if (m) { var f = findFolder(unq(m[1])); return f && f.item ? f : null; }
      m = /^\/_api\/web\/lists\(guid'([^']+)'\)$/.exec(path);
      if (m) { var ll = listByGuid(m[1]); return ll && { list: ll, item: null }; }
      return null;
    }
    function secObj(s) { return s.item || s.list; }

    function parseFilter(filter) {
      if (!filter) return function () { return true; };
      var clauses = filter.split(/\s+and\s+/).map(function (c) {
        var m = /^(\w+)\s+eq\s+(.+)$/.exec(c.trim());
        if (!m) throw new Error('Mock cannot parse filter ' + c);
        var v = m[2];
        var val = /^'.*'$/.test(v) ? unq(v.slice(1, -1)) : v === 'true' ? true : v === 'false' ? false : Number(v);
        return { f: m[1], v: val };
      });
      return function (row) {
        return clauses.every(function (c) {
          var a = row[c.f];
          if (typeof a === 'boolean') return a === (c.v === 1 || c.v === true);
          return a === c.v || (typeof a === 'string' && typeof c.v === 'string' && a.toLowerCase() === c.v.toLowerCase() && c.f === 'Email');
        });
      };
    }
    function queryOf(path) {
      var out = {};
      (path.split('?')[1] || '').split('&').forEach(function (p) { var i = p.indexOf('='); if (i > 0) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1)); });
      return out;
    }

    function ukMidnightIso(y, m, d) {
      var guess = Date.UTC(y, m - 1, d);
      var hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(guess)));
      return new Date(guess - hour * 3600000).toISOString().replace('.000', '');
    }

    // Converts a validateUpdate form value to the stored value, as SharePoint would.
    function convert(list, name, value) {
      var f = list.fields.filter(function (x) { return x.InternalName === name; })[0];
      if (!f) return { error: 'Column ' + name + ' does not exist.' };
      var t = f.TypeAsString;
      if (value === '' || value === null) return { key: t === 'User' || t === 'Lookup' ? name + 'Id' : name, value: null };
      if (t === 'Boolean') return { key: name, value: value === '1' || value === 'true' || value === 'Yes' };
      if (t === 'Number') return isNaN(Number(value)) ? { error: name + ' must be a number.' } : { key: name, value: Number(value) };
      if (t === 'DateTime') {
        var d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        if (!d) return { error: name + ': date must be in the site format dd/mm/yyyy.' };
        return { key: name, value: ukMidnightIso(Number(d[3]), Number(d[2]), Number(d[1])) };
      }
      if (t === 'Lookup') return { key: name + 'Id', value: Number(value) };
      if (t === 'User') {
        var claims = JSON.parse(value);
        var u = users.filter(function (x) { return x.LoginName === claims[0].Key; })[0];
        return u ? { key: name + 'Id', value: u.Id } : { error: name + ': user ' + claims[0].Key + ' not found.' };
      }
      if (t === 'Choice' && f.choices && f.choices.indexOf(value) < 0) return { error: name + ': "' + value + '" is not an allowed choice.' };
      return { key: name, value: String(value) };
    }

    function applyValues(list, item, formValues, isNew) {
      var results = [];
      var staged = {};
      formValues.forEach(function (fv) {
        var c = convert(list, fv.FieldName, fv.FieldValue);
        if (c.error) { results.push({ FieldName: fv.FieldName, HasException: true, ErrorMessage: c.error }); return; }
        staged[c.key] = c.value;
        results.push({ FieldName: fv.FieldName, FieldValue: fv.FieldValue, HasException: false });
      });
      if (results.some(function (r) { return r.HasException; })) return results;
      var merged = Object.assign({}, item, staged);
      if (!merged.FSObjType) {
        list.fields.forEach(function (f) {
          var key = f.TypeAsString === 'User' || f.TypeAsString === 'Lookup' ? f.InternalName + 'Id' : f.InternalName;
          if (f.Required && list.BaseTemplate !== 101 && (merged[key] === undefined || merged[key] === null || merged[key] === '')) {
            results.push({ FieldName: f.InternalName, HasException: true, ErrorMessage: 'You must specify a value for this required field.' });
          }
          if (f.EnforceUniqueValues && merged[key] !== undefined && merged[key] !== null &&
            list.items.some(function (o) { return o !== item && o[key] === merged[key]; })) {
            results.push({ FieldName: f.InternalName, HasException: true, ErrorMessage: 'This value must be unique.' });
          }
        });
      }
      if (results.some(function (r) { return r.HasException; })) return results;
      Object.assign(item, staged);
      if (isNew) list.items.push(item);
      results.push({ FieldName: 'Id', FieldValue: String(item.Id), HasException: false });
      return results;
    }

    function parseFieldXml(xml) {
      var attr = function (n) { var m = new RegExp(n + '="([^"]*)"').exec(xml); return m ? m[1] : undefined; };
      var choices = [];
      xml.replace(/<CHOICE>([^<]*)<\/CHOICE>/g, function (_, c) { choices.push(c.replace(/&amp;/g, '&')); });
      return { InternalName: attr('Name'), Title: attr('DisplayName'), TypeAsString: attr('Type'), Required: attr('Required') === 'TRUE',
        Indexed: false, EnforceUniqueValues: false, choices: choices.length ? choices : undefined, Format: attr('Format'), List: attr('List') };
    }

    function get(path) {
      var q = queryOf(path);
      var p = path.split('?')[0];
      var m;
      if (p === '/_api/web/currentuser') return respond(200, me);
      if (p === '/_api/web/effectiveBasePermissions') return respond(200, { High: '432', Low: scenario === 'notOwner' ? '1011028719' : '4294967295' });
      if (p === '/_api/web/regionalsettings') return respond(200, { LocaleId: web.LocaleId });
      if (p === '/_api/web/regionalsettings/timezone') return respond(200, { Id: web.TimeZoneId, Description: web.TimeZoneId === 2 ? '(UTC) Dublin, Edinburgh, Lisbon, London' : 'Other' });
      if (p === '/_api/web') return respond(200, { Title: web.Title, WebTemplate: web.WebTemplate, MembersCanShare: web.MembersCanShare, RequestAccessEmail: web.RequestAccessEmail, ServerRelativeUrl: REL });
      if (p === '/_api/web/AssociatedMemberGroup') return respond(200, groups[2]);
      if (p === '/_api/web/AssociatedOwnerGroup') return respond(200, groups[0]);
      if (p === '/_api/web/roleassignments') return respond(200, { value: raOut(web.ra) });
      if (p === '/_api/web/roledefinitions') return respond(200, { value: roleDefs });
      if (p === '/_api/web/sitegroups') return respond(200, { value: groups.map(function (g) { return Object.assign({}, g, { users: undefined }); }) });
      if ((m = /^\/_api\/web\/sitegroups\((\d+)\)\/users$/.exec(p))) {
        var g = groups.filter(function (x) { return x.Id === Number(m[1]); })[0];
        return g ? respond(200, { value: g.users.map(function (id) { return users.filter(function (u) { return u.Id === id; })[0]; }) }) : fail(404, 'Group not found');
      }
      if (p === '/_api/web/siteusers') return respond(200, { value: users.filter(parseFilter(q.$filter)) });
      if (p === '/_api/web/lists') {
        return respond(200, { value: lists.map(function (l) { return { Id: l.Id, Title: l.Title, BaseTemplate: l.BaseTemplate, RootFolder: { ServerRelativeUrl: l.url } }; }) });
      }
      if ((m = /^\/_api\/web\/GetFolderByServerRelativePath\(decodedurl='((?:[^']|'')+)'\)$/.exec(p))) {
        return findFolder(unq(m[1])) ? respond(200, { Exists: true }) : fail(404, 'File Not Found.');
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/fields\/getbyinternalnameortitle\('([^']+)'\)$/.exec(p))) {
        var fl = listByGuid(m[1]);
        var fd = fl && fl.fields.filter(function (x) { return x.InternalName === m[2]; })[0];
        return fd ? respond(200, fd) : fail(404, 'Column not found');
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/fields$/.exec(p))) {
        var l2 = listByGuid(m[1]);
        return l2 ? respond(200, { value: l2.fields }) : fail(404, 'List not found');
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/items$/.exec(p))) {
        var l3 = listByGuid(m[1]);
        if (!l3) return fail(404, 'List not found');
        var rows = l3.items.filter(parseFilter(q.$filter));
        return respond(200, { value: rows.slice(0, Number(q.$top || 100)) });
      }
      var sec = securable(p.replace(/\/roleassignments$/, ''));
      if (sec && /\/roleassignments$/.test(p)) return respond(200, { value: raOut(effective(sec.list, sec.item)) });
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/items\((\d+)\)$/.exec(p))) {
        var l4 = listByGuid(m[1]);
        var it = l4 && l4.items.filter(function (x) { return x.Id === Number(m[2]); })[0];
        if (!it) return fail(404, 'Item not found');
        if (q.$select === 'HasUniqueRoleAssignments') return respond(200, { HasUniqueRoleAssignments: !!it.unique });
        return respond(200, it);
      }
      if (sec) {
        if (q.$select === 'HasUniqueRoleAssignments') return respond(200, { HasUniqueRoleAssignments: !!secObj(sec).unique });
        if (!sec.item) return respond(200, Object.assign({ Title: sec.list.Title, Id: sec.list.Id }, sec.list.settings));
        return respond(200, sec.item);
      }
      return fail(400, 'Mock does not support GET ' + path);
    }

    function post(path, options) {
      var body = options.body ? JSON.parse(options.body) : {};
      var headers = options.headers || {};
      if (path === '/_api/contextinfo') return respond(200, { FormDigestValue: 'mock-digest' });
      writes.push(path);
      if (failAfter && writes.length > failAfter) return fail(500, 'Simulated SharePoint failure');
      var m;
      var merge = headers['X-HTTP-Method'] === 'MERGE';
      if (path === '/_api/web/roledefinitions') {
        var d = { Id: nextRoleDef++, Name: body.Name, Description: body.Description, RoleTypeKind: 0, BasePermissions: { Low: String(body.BasePermissions.Low), High: String(body.BasePermissions.High) } };
        roleDefs.push(d);
        return respond(201, { d: d });
      }
      if (path === '/_api/web/sitegroups') {
        if (groups.some(function (g) { return g.Title === body.Title; })) return fail(400, 'The specified name is already in use.');
        var g = { Id: nextPrincipal++, Title: body.Title, users: [], OnlyAllowMembersViewMembership: body.OnlyAllowMembersViewMembership, AllowRequestToJoinLeave: body.AllowRequestToJoinLeave, AllowMembersEditMembership: false };
        groups.push(g);
        return respond(201, { d: { Id: g.Id, Title: g.Title } });
      }
      if ((m = /^\/_api\/web\/sitegroups\((\d+)\)\/users$/.exec(path))) {
        var grp = groups.filter(function (x) { return x.Id === Number(m[1]); })[0];
        var u = users.filter(function (x) { return x.LoginName === body.LoginName; })[0];
        if (!grp || !u) return fail(404, 'User or group not found');
        if (grp.users.indexOf(u.Id) < 0) grp.users.push(u.Id);
        return respond(201, { d: u });
      }
      if (path === '/_api/web/ensureuser') {
        var email = body.logonName.split('|').pop();
        if (/unknown/.test(email)) return fail(404, 'The specified user ' + email + ' could not be found.');
        var existing = users.filter(function (x) { return x.Email === email; })[0];
        if (existing) return respond(200, existing);
        var name = email.split('@')[0].split('.').map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); });
        var nu = { Id: nextPrincipal++, Title: name.reverse().join(' '), Email: email, LoginName: body.logonName };
        users.push(nu);
        return respond(200, nu);
      }
      if (path === '/_api/web/lists') {
        var url = body.BaseTemplate === 101 ? REL + '/' + body.Title : REL + '/Lists/' + body.Title;
        if (lists.some(function (l) { return l.url === url; })) return fail(400, 'A list with this URL already exists.');
        var nl = newList(body.Title, body.BaseTemplate, url);
        return respond(201, { d: { Id: nl.Id, Title: nl.Title } });
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)$/.exec(path)) && merge) {
        var ml = listByGuid(m[1]);
        Object.keys(body).forEach(function (k) { if (k === '__metadata') return; if (k === 'Title') ml.Title = body.Title; else ml.settings[k] = body[k]; });
        return respond(204);
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/fields\/createfieldasxml$/.exec(path))) {
        var fl = listByGuid(m[1]);
        var nf = parseFieldXml(body.parameters.SchemaXml);
        if (fl.fields.some(function (x) { return x.InternalName === nf.InternalName; })) return fail(400, 'A duplicate field name was found.');
        if (nf.TypeAsString.indexOf('Lookup') === 0 && !listByGuid(String(nf.List).replace(/[{}]/g, ''))) return fail(400, 'Lookup list not found');
        fl.fields.push(nf);
        return respond(201, { d: nf });
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/fields\/getbyinternalnameortitle\('([^']+)'\)$/.exec(path)) && merge) {
        var fdl = listByGuid(m[1]);
        var fd = fdl.fields.filter(function (x) { return x.InternalName === m[2]; })[0];
        if (body.EnforceUniqueValues && !fd.Indexed && !body.Indexed) return fail(400, 'The field must be indexed to enforce unique values.');
        Object.keys(body).forEach(function (k) { if (k !== '__metadata') fd[k] = body[k]; });
        return respond(204);
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/AddValidateUpdateItemUsingPath$/.exec(path))) {
        var al = listByGuid(m[1]);
        var info = body.listItemCreateInfo;
        var parentUrl = info.FolderPath.DecodedUrl;
        if (!findFolder(parentUrl)) return respond(200, { value: [{ FieldName: 'FolderPath', HasException: true, ErrorMessage: 'Folder not found: ' + parentUrl }] });
        if (info.UnderlyingObjectType === 1) {
          if (!al.settings.EnableFolderCreation) return fail(400, 'Folders are not allowed in this list.');
          if (findFolder(parentUrl + '/' + info.LeafName.DecodedUrl)) return respond(200, { value: [{ FieldName: 'FileLeafRef', HasException: true, ErrorMessage: 'A folder with this name already exists.' }] });
          var folder = { Id: al.nextItem++, FSObjType: 1, FileLeafRef: info.LeafName.DecodedUrl, FileDirRef: parentUrl, unique: false, ra: [] };
          return respond(200, { value: applyValues(al, folder, body.formValues || [], true) });
        }
        var item = { Id: al.nextItem++, FSObjType: 0, FileDirRef: parentUrl, unique: false, ra: [] };
        var res = applyValues(al, item, body.formValues || [], true);
        if (res.some(function (r) { return r.HasException; })) al.nextItem--;
        return respond(200, { value: res });
      }
      if ((m = /^\/_api\/web\/lists\(guid'([^']+)'\)\/items\((\d+)\)\/validateUpdateListItem$/.exec(path))) {
        var vl = listByGuid(m[1]);
        var vi = vl.items.filter(function (x) { return x.Id === Number(m[2]); })[0];
        return respond(200, { value: applyValues(vl, vi, body.formValues || [], false) });
      }
      if ((m = /^(.*)\/breakroleinheritance\(copyRoleAssignments=(true|false),clearSubscopes=(true|false)\)$/.exec(path))) {
        var bs = securable(m[1]);
        if (!bs) return fail(404, 'Not found');
        var obj = secObj(bs);
        if (obj.unique) return respond(200, {});
        var copy = m[2] === 'true';
        var inherited = effective(bs.list, bs.item);
        obj.ra = copy ? inherited.map(function (a) { return { p: a.p, r: a.r.slice() }; }) : [{ p: me.Id, r: [FULL] }];
        obj.unique = true;
        if (m[3] === 'true') {
          if (!bs.item) bs.list.items.forEach(function (it) { it.unique = false; it.ra = []; });
        }
        return respond(200, {});
      }
      if ((m = /^(.*)\/roleassignments\/addroleassignment\(principalid=(\d+),roledefid=(\d+)\)$/.exec(path))) {
        var as = securable(m[1]);
        if (!as) return fail(404, 'Not found');
        var ao = secObj(as);
        if (!ao.unique) return fail(400, 'This operation is not allowed on an object that inherits permissions.');
        var pid = Number(m[2]), rid = Number(m[3]);
        if (!roleDefs.some(function (d) { return d.Id === rid; })) return fail(400, 'Permission level not found');
        var entry = ao.ra.filter(function (a) { return a.p === pid; })[0];
        if (entry) { if (entry.r.indexOf(rid) < 0) entry.r.push(rid); } else ao.ra.push({ p: pid, r: [rid] });
        return respond(200, {});
      }
      return fail(400, 'Mock does not support POST ' + path);
    }

    function Client() {}
    Client.configurations = { v1: {} };
    Client.prototype.get = function (url) { return get(url.replace(SITE, '')); };
    Client.prototype.post = function (url, config, opts) { return post(url.replace(SITE, ''), opts || {}); };
    var ctx = { getWebPart: function () { return { spHttpClient: new Client(), pageContext: { web: { absoluteUrl: SITE, serverRelativeUrl: REL } } }; } };

    return {
      ctx: ctx, writes: writes, lists: lists, groups: groups, roleDefs: roleDefs, users: users, web: web, me: function () { return me; },
      effective: function (list, item) { return effective(list, item); }, findFolder: findFolder,
      setFailAfter: function (n) { failAfter = n; writes.length = 0; },
      // Signs in as another site owner, for tests where someone else runs Setup.
      signInAs: function (email, title) {
        var u = users.filter(function (x) { return x.Email === email; })[0];
        if (!u) { u = { Id: nextPrincipal++, Title: title, Email: email, LoginName: 'i:0#.f|membership|' + email }; users.push(u); }
        me = u;
        return u;
      },
      ids: { FULL: FULL }
    };
  }

  return { create: create };
})();
