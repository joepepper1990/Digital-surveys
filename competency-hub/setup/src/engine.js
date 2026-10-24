// Setup engine (plan K6.2). Creates the Competency Hub structure from the schema, idempotently.
// Check mode makes no writes and reports what Apply would do. Apply creates what is missing, reads
// every change back, never deletes, and stops a step if it finds something unexpected.
CHS.engine = (function () {
  var MANAGE_PERMISSIONS = 0x2000000;
  var LOCALE_UK = 2057;
  var TIMEZONE_LONDON = 2;
  var MANAGEMENT_ROLES = ['Team Leader', 'Group Head'];
  var TYPE_AS_STRING = { Text: 'Text', Note: 'Note', Number: 'Number', Boolean: 'Boolean', DateOnly: 'DateTime', DateTime: 'DateTime',
    Choice: 'Choice', User: 'User', Lookup: 'Lookup', LookupMulti: 'LookupMulti' };

  function StopError(message) { this.name = 'StopError'; this.message = message; }
  StopError.prototype = Object.create(Error.prototype);

  function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The schema field definition as SharePoint field XML. Internal name is fixed by Name + option 8.
  function fieldXml(f, lookupListId) {
    var attrs = ['Name="' + f.name + '"', 'StaticName="' + f.name + '"', 'DisplayName="' + f.name + '"', 'Required="' + (f.required ? 'TRUE' : 'FALSE') + '"'];
    var inner = '';
    switch (f.type) {
      case 'Text': attrs.unshift('Type="Text"'); attrs.push('MaxLength="' + (f.max || 255) + '"'); break;
      case 'Note': attrs.unshift('Type="Note"'); attrs.push('NumLines="6"', 'RichText="FALSE"', 'AppendOnly="FALSE"'); break;
      case 'Number': attrs.unshift('Type="Number"'); break;
      case 'Boolean': attrs.unshift('Type="Boolean"'); break;
      case 'DateOnly': attrs.unshift('Type="DateTime"'); attrs.push('Format="DateOnly"'); break;
      case 'DateTime': attrs.unshift('Type="DateTime"'); attrs.push('Format="DateTime"'); break;
      case 'Choice':
        attrs.unshift('Type="Choice"'); attrs.push('Format="Dropdown"', 'FillInChoice="FALSE"');
        inner += '<CHOICES>' + f.choices.map(function (c) { return '<CHOICE>' + xmlEscape(c) + '</CHOICE>'; }).join('') + '</CHOICES>';
        break;
      case 'User': attrs.unshift('Type="User"'); attrs.push('List="UserInfo"', 'ShowField="ImnName"', 'UserSelectionMode="PeopleOnly"', 'UserSelectionScope="0"'); break;
      case 'Lookup': attrs.unshift('Type="Lookup"'); attrs.push('List="{' + lookupListId + '}"', 'ShowField="Title"'); break;
      case 'LookupMulti': attrs.unshift('Type="LookupMulti"'); attrs.push('Mult="TRUE"', 'List="{' + lookupListId + '}"', 'ShowField="Title"'); break;
      default: throw new Error('Unknown field type ' + f.type);
    }
    if (f.default !== undefined && f.default !== '') inner += '<Default>' + xmlEscape(f.default) + '</Default>';
    return '<Field ' + attrs.join(' ') + '>' + inner + '</Field>';
  }

  function ukDate(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
  function ukToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); }
  function claimFor(loginName) { return JSON.stringify([{ Key: loginName }]); }

  function create(rest, schema, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var mode = 'check';
    var S = { lists: {}, groups: {}, roles: {}, pendingFields: {}, stops: 0, created: 0, unchanged: 0 };
    var areas = schema.areas;

    function note(level, step, text) {
      if (level === 'stop') S.stops++;
      if (level === 'create') S.created++;
      if (level === 'ok') S.unchanged++;
      log({ level: level, step: step, text: text, mode: mode });
    }
    function applying() { return mode === 'apply'; }
    async function write(path, body, o) {
      if (!applying()) throw new Error('Internal error: write attempted in Check mode');
      return rest.write(path, body, o);
    }
    function expand(text, area) { return text.replace(/\{Key\}/g, area.key).replace(/\{Title\}/g, area.title); }
    function listSchema(key) { return schema.lists.filter(function (l) { return l.key === key; })[0]; }
    function listPath(key) { return "/_api/web/lists(guid'" + S.lists[key].id + "')"; }
    function rootUrl(l) { return rest.siteRelative + (l.template === 101 ? '/' : '/Lists/') + l.url; }
    function folderItemPath(url) { return "/_api/web/GetFolderByServerRelativePath(decodedurl='" + CHS.rest.q(url) + "')/ListItemAllFields"; }

    // ---------- 1. Pre-checks ----------
    async function prechecks() {
      var step = 'Pre-checks';
      var me = await rest.get('/_api/web/currentuser?$select=Id,Title,Email,LoginName');
      S.me = me;
      note('info', step, 'Signed in as ' + me.Title + ' (' + (me.Email || me.LoginName) + ').');
      var perms = await rest.get('/_api/web/effectiveBasePermissions');
      var low = Number(perms.Low !== undefined ? perms.Low : perms.EffectiveBasePermissions && perms.EffectiveBasePermissions.Low);
      if (!(low & MANAGE_PERMISSIONS)) {
        note('stop', step, 'You are not an owner of this site. Only a site owner can run Setup.');
        throw new StopError('Not a site owner');
      }
      note('ok', step, 'You are a site owner.');
      var regional = await rest.get('/_api/web/regionalsettings?$select=LocaleId');
      var tz = await rest.get('/_api/web/regionalsettings/timezone?$select=Id,Description');
      if (Number(regional.LocaleId) !== LOCALE_UK || Number(tz.Id) !== TIMEZONE_LONDON) {
        note('stop', step, 'Regional settings must be English (United Kingdom) and London time. Found locale ' + regional.LocaleId + ', time zone ' + tz.Id + '.');
      } else note('ok', step, 'Regional settings are English (United Kingdom) and London time.');
      var web = await rest.get('/_api/web?$select=Title,WebTemplate,MembersCanShare,RequestAccessEmail,ServerRelativeUrl');
      S.webTemplate = web.WebTemplate;
      var members = await rest.get('/_api/web/AssociatedMemberGroup?$select=Id,Title,AllowMembersEditMembership');
      var owners = await rest.get('/_api/web/AssociatedOwnerGroup?$select=Id,Title');
      S.ownersGroupId = owners.Id;
      if (web.MembersCanShare || members.AllowMembersEditMembership) {
        note('stop', step, 'Site members can currently share the site. Change it first: Settings (gear) → Site permissions → ' +
          'Change how members can share → "Only site owners can share files, folders, and the site", and untick "Allow members to invite others".');
      } else note('ok', step, 'Only site owners can share the site.');
      if (web.RequestAccessEmail) note('warn', step, 'Access requests are turned on (they go to ' + web.RequestAccessEmail + '). Turning them off in the same sharing panel is recommended.');
      if (web.WebTemplate === 'GROUP') {
        if (!opts.confirmGroupOwnersOnly) {
          note('stop', step, 'This site belongs to a Microsoft 365 group. Confirm that the group has no members other than owners ' +
            '(click "Members" at the top right of the site home page to check), then tick the confirmation box.');
        } else note('ok', step, 'You confirmed the Microsoft 365 group has no members other than owners.');
      }
      var web_ra = await rest.getRows('/_api/web/roleassignments?$expand=Member,RoleDefinitionBindings');
      web_ra.forEach(function (ra) {
        var levels = (ra.RoleDefinitionBindings.results || ra.RoleDefinitionBindings || []).map(function (r) { return r.Name; }).join(', ');
        note('info', step, 'Site-level access: ' + ra.Member.Title + ' – ' + levels + '.');
      });
    }

    // ---------- 2. Permission levels ----------
    async function permissionLevels() {
      var step = 'Permission levels';
      var defs = await rest.getRows('/_api/web/roledefinitions?$select=Id,Name,BasePermissions,RoleTypeKind');
      var full = defs.filter(function (d) { return Number(d.RoleTypeKind) === 5; })[0];
      if (!full) throw new StopError('Full Control permission level not found');
      S.roles.FullControl = full.Id;
      var limited = defs.filter(function (d) { return Number(d.RoleTypeKind) === 1; })[0];
      S.roles.LimitedAccess = limited ? limited.Id : -1;
      var edit = defs.filter(function (d) { return Number(d.RoleTypeKind) === 6; })[0];
      if (edit) S.roles.Edit = edit.Id;
      for (var i = 0; i < schema.permissionLevels.length; i++) {
        var p = schema.permissionLevels[i];
        var shortName = p.name.replace('Competency Hub ', '');
        var found = defs.filter(function (d) { return d.Name === p.name; })[0];
        if (found) {
          var bp = found.BasePermissions || {};
          if (Number(bp.Low) !== Number(p.low) || Number(bp.High) !== Number(p.high)) {
            note('stop', step, '"' + p.name + '" exists but its permissions differ from the plan. It has not been changed; check it with the developer.');
          } else note('ok', step, '"' + p.name + '" already in place.');
          S.roles[shortName] = found.Id;
          continue;
        }
        if (applying()) {
          var made = await write('/_api/web/roledefinitions', {
            __metadata: { type: 'SP.RoleDefinition' }, Name: p.name, Description: p.description, Order: 200 + i,
            BasePermissions: { __metadata: { type: 'SP.BasePermissions' }, Low: String(Number(p.low)), High: String(Number(p.high)) }
          }, { verbose: true });
          S.roles[shortName] = made.Id;
        }
        note('create', step, (applying() ? 'Created' : 'Would create') + ' permission level "' + p.name + '".');
      }
    }

    // ---------- 3. Groups ----------
    function groupList() {
      var out = [];
      schema.groups.forEach(function (g) {
        if (g.perArea) areas.forEach(function (a) { out.push({ key: expand(g.key, a), title: expand(g.title, a), description: expand(g.description, a) }); });
        else out.push(g);
      });
      return out;
    }
    async function groups() {
      var step = 'Groups';
      var existing = await rest.getRows('/_api/web/sitegroups?$select=Id,Title,OnlyAllowMembersViewMembership,AllowRequestToJoinLeave');
      var wanted = groupList();
      for (var i = 0; i < wanted.length; i++) {
        var g = wanted[i];
        var found = existing.filter(function (e) { return e.Title === g.title; })[0];
        if (found) {
          S.groups[g.key] = found.Id;
          if (found.AllowRequestToJoinLeave) note('warn', step, '"' + g.title + '" allows join requests; turn this off in the group settings.');
          else note('ok', step, '"' + g.title + '" already in place.');
          continue;
        }
        if (applying()) {
          var made = await write('/_api/web/sitegroups', {
            __metadata: { type: 'SP.Group' }, Title: g.title, Description: g.description,
            OnlyAllowMembersViewMembership: true, AllowRequestToJoinLeave: false, AllowMembersEditMembership: false
          }, { verbose: true });
          S.groups[g.key] = made.Id;
        }
        note('create', step, (applying() ? 'Created' : 'Would create') + ' group "' + g.title + '".');
      }
    }

    // ---------- 4. Lists, settings and columns ----------
    async function lists() {
      var step = 'Lists';
      var existing = await rest.getRows('/_api/web/lists?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl&$expand=RootFolder');
      for (var i = 0; i < schema.lists.length; i++) {
        var l = schema.lists[i];
        var url = rootUrl(l);
        var found = existing.filter(function (e) { return e.RootFolder && e.RootFolder.ServerRelativeUrl.toLowerCase() === url.toLowerCase(); })[0];
        if (found) {
          // A list still titled with its URL name was created by an interrupted run; its settings step renames it.
          if ((found.Title !== l.title && found.Title !== l.url) || Number(found.BaseTemplate) !== l.template) {
            note('stop', step, 'Found "' + url + '" but it is "' + found.Title + '" (type ' + found.BaseTemplate + '), not "' + l.title + '". It has not been changed.');
            S.lists[l.key] = { id: found.Id, broken: true };
            continue;
          }
          S.lists[l.key] = { id: found.Id };
          note('ok', step, '"' + l.title + '" already exists.');
        } else {
          var what = (l.template === 101 ? 'library' : 'list') + ' "' + l.title + '" (' + url + ').';
          if (!applying()) { note('create', step, 'Would create ' + what); S.lists[l.key] = { id: null, planned: true }; continue; }
          var made = await write('/_api/web/lists', { __metadata: { type: 'SP.List' }, Title: l.url, BaseTemplate: l.template, AllowContentTypes: false, ContentTypesEnabled: false }, { verbose: true });
          S.lists[l.key] = { id: made.Id };
          note('create', step, 'Created ' + what);
        }
        await listSettings(l);
      }
      for (var j = 0; j < schema.lists.length; j++) await columns(schema.lists[j]);
    }

    async function listSettings(l) {
      var step = 'Lists';
      var want = {
        Title: l.title, EnableVersioning: true, MajorVersionLimit: 100, NoCrawl: !!l.noCrawl,
        EnableFolderCreation: l.template === 100 ? true : undefined,
        EnableAttachments: l.template === 100 ? !!l.attachments : undefined,
        WriteSecurity: l.template === 100 ? (l.writeSecurity || 1) : undefined,
        ReadSecurity: l.template === 100 ? (l.readSecurity || 1) : undefined
      };
      var have = await rest.get(listPath(l.key) + '?$select=Title,EnableVersioning,MajorVersionLimit,NoCrawl,EnableFolderCreation,EnableAttachments,WriteSecurity,ReadSecurity');
      var change = { __metadata: { type: 'SP.List' } };
      var diffs = [];
      Object.keys(want).forEach(function (k) {
        if (want[k] === undefined) return;
        if (have[k] !== want[k] && Number(have[k]) !== want[k]) { change[k] = want[k]; diffs.push(k); }
      });
      if (!diffs.length) return;
      if (!applying()) { note('create', step, 'Would set ' + diffs.join(', ') + ' on "' + l.title + '".'); return; }
      await write(listPath(l.key), change, { verbose: true, merge: true });
      var back = await rest.get(listPath(l.key) + '?$select=' + diffs.join(','));
      var bad = diffs.filter(function (k) { return back[k] !== want[k] && Number(back[k]) !== want[k]; });
      if (bad.length) note('stop', step, 'SharePoint did not keep ' + bad.join(', ') + ' on "' + l.title + '".');
      else note('create', step, 'Set ' + diffs.join(', ') + ' on "' + l.title + '".');
    }

    function fieldsFor(l) {
      var list = (l.standard ? schema.standardColumns : []).concat(l.fields);
      return list;
    }

    async function columns(l) {
      var step = 'Columns';
      var info = S.lists[l.key];
      var defs = fieldsFor(l);
      if (!info || info.broken) return;
      if (info.planned) {
        if (!defs.length && !l.titleUnique) return;
        note('create', step, 'Would add ' + defs.length + ' columns to "' + l.title + '"' + (l.titleUnique ? ' and make Title unique' : '') + '.');
        return;
      }
      var have = await rest.getRows(listPath(l.key) + '/fields?$select=Id,InternalName,Title,TypeAsString,Required,Indexed,EnforceUniqueValues');
      var byName = {};
      have.forEach(function (f) { byName[f.InternalName] = f; });
      var made = 0;
      var ok = 0;
      for (var i = 0; i < defs.length; i++) {
        var f = defs[i];
        var cur = byName[f.name];
        if (cur && cur.TypeAsString !== TYPE_AS_STRING[f.type]) {
          note('stop', step, '"' + l.title + '" has a column "' + f.name + '" of type ' + cur.TypeAsString + ', expected ' + TYPE_AS_STRING[f.type] + '. It has not been changed.');
          continue;
        }
        if (!cur) {
          made++;
          if (!applying()) { S.pendingFields[l.key + '.' + f.name] = true; continue; }
          var lookupId = f.lookup ? S.lists[f.lookup] && S.lists[f.lookup].id : null;
          if (f.lookup && !lookupId) throw new StopError('Lookup target "' + f.lookup + '" is missing');
          await write(listPath(l.key) + '/fields/createfieldasxml', {
            parameters: { __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' }, SchemaXml: fieldXml(f, lookupId), Options: 8 }
          }, { verbose: true });
          cur = { InternalName: f.name, Title: f.name, Indexed: false, EnforceUniqueValues: false, Required: !!f.required };
        } else {
          ok++;
          if (f.type === 'Choice') await fieldChoices(l, f);
        }
        await fieldProperties(l, f, cur);
      }
      if (l.titleUnique) {
        var t = byName.Title || { InternalName: 'Title', Title: 'Title', Indexed: false, EnforceUniqueValues: false, Required: true };
        await fieldProperties(l, { name: 'Title', title: 'Title', indexed: true, unique: true, required: true }, t);
      }
      if (made) note('create', step, (applying() ? 'Added ' : 'Would add ') + made + ' column' + (made === 1 ? '' : 's') + ' to "' + l.title + '".');
      if (ok && !made) note('ok', step, 'All ' + ok + ' columns already on "' + l.title + '".');
    }

    // Choices are only ever added (a later version may need a new value); none is removed or reordered.
    async function fieldChoices(l, f) {
      var step = 'Columns';
      var path = listPath(l.key) + "/fields/getbyinternalnameortitle('" + f.name + "')";
      var cur = await rest.get(path + '?$select=Choices');
      var have = cur && cur.Choices ? (cur.Choices.results || cur.Choices) : [];
      var missing = f.choices.filter(function (c) { return have.indexOf(c) < 0; });
      if (!missing.length) return;
      if (!applying()) { note('create', step, 'Would add the choice' + (missing.length === 1 ? ' ' : 's ') + missing.join(', ') + ' to "' + l.title + '"/' + f.name + '.'); return; }
      await write(path, { __metadata: { type: 'SP.FieldChoice' }, Choices: { __metadata: { type: 'Collection(Edm.String)' }, results: have.concat(missing) } },
        { verbose: true, merge: true });
      var back = await rest.get(path + '?$select=Choices');
      var now = back && back.Choices ? (back.Choices.results || back.Choices) : [];
      if (missing.some(function (c) { return now.indexOf(c) < 0; })) note('stop', step, 'Column "' + f.name + '" on "' + l.title + '" did not keep its new choices.');
      else note('create', step, 'Added the choice' + (missing.length === 1 ? ' ' : 's ') + missing.join(', ') + ' to "' + l.title + '"/' + f.name + '.');
    }

    async function fieldProperties(l, f, cur) {
      var step = 'Columns';
      var path = listPath(l.key) + "/fields/getbyinternalnameortitle('" + f.name + "')";
      var changes = [];
      if (f.title && cur.Title !== f.title) changes.push({ Title: f.title });
      if (!!f.indexed && !cur.Indexed) changes.push({ Indexed: true });
      if (!!f.unique && !cur.EnforceUniqueValues) changes.push({ EnforceUniqueValues: true });
      if (!!f.required !== !!cur.Required) changes.push({ Required: !!f.required });
      if (!changes.length) return;
      if (!applying()) {
        note('create', step, 'Would update ' + Object.keys(Object.assign.apply(null, [{}].concat(changes))).join(', ') + ' on "' + l.title + '"/' + f.name + '.');
        return;
      }
      for (var i = 0; i < changes.length; i++) {
        await write(path, Object.assign({ __metadata: { type: 'SP.Field' } }, changes[i]), { verbose: true, merge: true });
      }
      var back = await rest.get(path + '?$select=Title,Indexed,EnforceUniqueValues,Required');
      if ((f.indexed && !back.Indexed) || (f.unique && !back.EnforceUniqueValues) || (!!f.required !== !!back.Required) || (f.title && back.Title !== f.title)) {
        note('stop', step, 'Column "' + f.name + '" on "' + l.title + '" did not keep its settings.');
      }
    }

    // ---------- 5. Folders ----------
    function folderPaths(l) {
      var out = [];
      if (l.folders === 'areas') areas.forEach(function (a) { out.push(a.key); });
      (l.extraFolders || []).forEach(function (p) {
        if (p.indexOf('{Key}') >= 0) areas.forEach(function (a) { out.push(expand(p, a)); });
        else out.push(p);
      });
      return out.sort(function (a, b) { return a.split('/').length - b.split('/').length; });
    }

    async function folderExists(url) {
      try {
        var f = await rest.get("/_api/web/GetFolderByServerRelativePath(decodedurl='" + CHS.rest.q(url) + "')?$select=Exists");
        return !!(f && f.Exists);
      } catch (e) {
        if (e.status === 404 || e.status === 500) return false;
        throw e;
      }
    }

    async function ensureFolder(listKey, relPath, step) {
      var l = listSchema(listKey);
      var url = rootUrl(l) + '/' + relPath;
      if (!S.lists[listKey].planned && await folderExists(url)) return 'exists';
      if (!applying()) return 'would';
      var parts = relPath.split('/');
      var leaf = parts.pop();
      var parent = rootUrl(l) + (parts.length ? '/' + parts.join('/') : '');
      var res = await write(listPath(listKey) + '/AddValidateUpdateItemUsingPath', {
        listItemCreateInfo: { FolderPath: { DecodedUrl: parent }, UnderlyingObjectType: 1, LeafName: { DecodedUrl: leaf } },
        formValues: [{ FieldName: 'Title', FieldValue: leaf }], bNewDocumentUpdate: false
      });
      var failed = (res && (res.value || res) || []).filter ? (res.value || res).filter(function (r) { return r.HasException; }) : [];
      if (failed.length) throw new StopError('Could not create folder ' + url + ': ' + failed.map(function (r) { return r.ErrorMessage; }).join('; '));
      if (!await folderExists(url)) throw new StopError('Folder ' + url + ' was not found after creating it.');
      return 'created';
    }

    async function folders() {
      var step = 'Folders';
      for (var i = 0; i < schema.lists.length; i++) {
        var l = schema.lists[i];
        if (!S.lists[l.key] || S.lists[l.key].broken) continue;
        var paths = folderPaths(l);
        if (!paths.length) continue;
        var created = 0, exist = 0;
        for (var j = 0; j < paths.length; j++) {
          var r = await ensureFolder(l.key, paths[j], step);
          if (r === 'exists') exist++; else created++;
        }
        if (created) note('create', step, (applying() ? 'Created ' : 'Would create ') + created + ' folder' + (created === 1 ? '' : 's') + ' in "' + l.title + '".');
        if (exist && !created) note('ok', step, 'All ' + exist + ' folders already in "' + l.title + '".');
      }
    }

    // ---------- 6. Permissions ----------
    function principal(key) {
      if (key === 'Owners') return S.ownersGroupId;
      return S.groups[key];
    }

    async function assignments(path) {
      var ra = await rest.getRows(path + '/roleassignments?$expand=Member,RoleDefinitionBindings');
      return ra.map(function (r) {
        return { id: Number(r.PrincipalId !== undefined ? r.PrincipalId : r.Member.Id), title: r.Member.Title,
          roles: (r.RoleDefinitionBindings.results || r.RoleDefinitionBindings || []).map(function (b) { return Number(b.Id); }) };
      });
    }

    // Makes the securable at `path` unique (if needed) and ensures each [principal, level] grant.
    // Grants on `have` from anyone not in `allowed`, ignoring Limited Access (SharePoint adds it for access below).
    function extras(have, allowed) {
      return have.filter(function (a) {
        return allowed.indexOf(a.id) < 0 && a.roles.some(function (r) { return r !== S.roles.LimitedAccess; });
      });
    }

    // Whether the securable at `path` already has its own permissions. SharePoint's HasUniqueRoleAssignments flag
    // is used when it says so; otherwise the grants decide: the expected Competency Hub grants are present and,
    // unless the inherited grants were copied, nobody else has access. An inheriting object would instead show
    // the site's Members and Visitors, and the Competency Hub levels are never granted on the site itself.
    async function ownPermissions(path, expected, copy) {
      var flag = null;
      try { flag = (await rest.get(path + '?$select=HasUniqueRoleAssignments')).HasUniqueRoleAssignments; } catch (e) { flag = null; }
      var have = await assignments(path);
      if (flag === true) return { own: true, have: have };
      var allPresent = expected.every(function (g) { return has(have, principal(g[0]), S.roles[g[1]]); });
      var allowed = expected.map(function (g) { return principal(g[0]); }).concat([S.me.Id]);
      return { own: allPresent && (copy || !extras(have, allowed).length), have: have };
    }

    // Makes the securable at `path` unique (if needed) and ensures each [principal, level] grant.
    // For an "exact" securable: the Competency Hub levels a listed group holds beyond what the schema gives it.
    function surplus(have, expected) {
      var ours = [S.roles.Read, S.roles.Add, S.roles.Contribute].filter(Boolean);
      var out = [];
      expected.forEach(function (g) {
        var pid = principal(g[0]);
        have.filter(function (a) { return a.id === pid; }).forEach(function (a) {
          a.roles.forEach(function (r) {
            var wanted = expected.some(function (e) { return principal(e[0]) === pid && S.roles[e[1]] === r; });
            if (!wanted && ours.indexOf(r) >= 0 && !out.some(function (o) { return o.pid === pid && o.rid === r; })) out.push({ pid: pid, rid: r, who: g[0] });
          });
        });
      });
      return out;
    }
    function levelName(rid) { return Object.keys(S.roles).filter(function (k) { return S.roles[k] === rid; })[0] || String(rid); }

    async function secure(path, label, grants, copy, step, exact) {
      var expected = (copy ? [] : [['Owners', 'FullControl']]).concat(grants);
      var allowed;
      if (!applying()) {
        var planned = expected.some(function (g) { return !principal(g[0]) || !S.roles[g[1]]; });
        if (planned) { note('create', step, 'Would give "' + label + '" its own permissions: ' + describe(expected) + '.'); return; }
        var state;
        try { state = await ownPermissions(path, expected, copy); } catch (e) {
          note('warn', step, 'Could not read the permissions of "' + label + '" (' + e.message + ').');
          return;
        }
        if (!state.own) { note('create', step, 'Would give "' + label + '" its own permissions: ' + describe(expected) + '.'); return; }
        var missing = expected.filter(function (g) { return !has(state.have, principal(g[0]), S.roles[g[1]]); });
        var extraLevels = exact ? surplus(state.have, expected) : [];
        if (missing.length) note('create', step, 'Would add to "' + label + '": ' + describe(missing) + '.');
        if (extraLevels.length) note('create', step, 'Would remove from "' + label + '": ' + extraLevels.map(function (x) { return x.who + ' ' + levelName(x.rid); }).join(', ') + '.');
        if (!missing.length && !extraLevels.length) note('ok', step, '"' + label + '" permissions already in place.');
        return;
      }
      var cur = await ownPermissions(path, expected, copy);
      var changed = false;
      if (!cur.own) {
        await write(path + '/breakroleinheritance(copyRoleAssignments=' + (copy ? 'true' : 'false') + ',clearSubscopes=false)');
        changed = true;
      }
      var before = await assignments(path);
      for (var i = 0; i < expected.length; i++) {
        var pid = principal(expected[i][0]);
        var rid = S.roles[expected[i][1]];
        if (!pid || !rid) throw new StopError('Missing group or permission level for ' + expected[i].join(' '));
        if (!has(before, pid, rid)) {
          await write(path + '/roleassignments/addroleassignment(principalid=' + pid + ',roledefid=' + rid + ')');
          changed = true;
        }
      }
      var after = await assignments(path);
      // the new grants are in place first, so nobody loses access between the two steps
      var drop = exact ? surplus(after, expected) : [];
      for (var d = 0; d < drop.length; d++) {
        await write(path + '/roleassignments/removeroleassignment(principalid=' + drop[d].pid + ',roledefid=' + drop[d].rid + ')');
        changed = true;
      }
      if (drop.length) {
        after = await assignments(path);
        if (surplus(after, expected).length) { note('stop', step, '"' + label + '" still grants a level it should not after removing it.'); return; }
        note('create', step, 'Removed from "' + label + '": ' + drop.map(function (x) { return x.who + ' ' + levelName(x.rid); }).join(', ') + '.');
      }
      var missingAfter = expected.filter(function (g) { return !has(after, principal(g[0]), S.roles[g[1]]); });
      if (missingAfter.length) { note('stop', step, '"' + label + '" is missing ' + describe(missingAfter) + ' after setting it.'); return; }
      allowed = expected.map(function (g) { return principal(g[0]); }).concat([S.me.Id]);
      var extra = extras(after, allowed);
      if (extra.length && !copy) note('warn', step, '"' + label + '" also grants access to ' + extra.map(function (e) { return e.title; }).join(', ') + '. Nothing was removed; review it.');
      note(changed ? 'create' : 'ok', step, changed ? 'Set permissions on "' + label + '": ' + describe(expected) + '.' : '"' + label + '" permissions already in place.');
    }

    // True when every area folder of the list takes its permissions from the list. A folder counts as having its
    // own permissions when SharePoint says so, or when its grants differ from the list's.
    async function areaFoldersInherit(l, step) {
      var listGrants = JSON.stringify(sortGrants(await assignments(listPath(l.key))));
      var own = [];
      for (var a = 0; a < areas.length; a++) {
        var path = folderItemPath(rootUrl(l) + '/' + areas[a].key);
        var flag = null;
        try { flag = (await rest.get(path + '?$select=HasUniqueRoleAssignments')).HasUniqueRoleAssignments; } catch (e) { flag = null; }
        var grants = null;
        try { grants = JSON.stringify(sortGrants(await assignments(path))); } catch (e) { grants = null; }
        if (grants === null) continue; // not created yet: it will inherit when it is made
        if (flag === true || grants !== listGrants) own.push(areas[a].key);
      }
      if (!own.length) { note('ok', step, 'The area folders of "' + l.title + '" take their permissions from the list.'); return true; }
      note('stop', step, 'These area folders of "' + l.title + '" have their own permissions, so changing the list would not reach them: ' + own.join(', ') +
        '. Nothing was changed on "' + l.title + '". Reset them to inherit (folder → Manage access → Stop sharing / Delete unique permissions), then run Setup again.');
      return false;
    }
    function sortGrants(list) {
      return list.map(function (x) { return x.id + ':' + x.roles.slice().sort().join(','); }).sort();
    }

    function has(list, pid, rid) { return list.some(function (a) { return a.id === pid && a.roles.indexOf(rid) >= 0; }); }
    function describe(grants) {
      var who = { Owners: 'Owners', AllUsers: 'All Users', Management: 'Management', Administrators: 'Administrators', NoticePosters: 'Notice Posters', Person: 'the person' };
      var level = { FullControl: 'Full Control', Read: 'Read', Add: 'Add', Contribute: 'Contribute', Edit: 'Edit' };
      return grants.map(function (g) {
        var name = g[0].indexOf('Members:') === 0 ? g[0].replace('Members:', '') + ' members' : (who[g[0]] || g[0]);
        return name + ': ' + (level[g[1]] || g[1]);
      }).join('; ');
    }

    async function permissions() {
      var step = 'Permissions';
      for (var i = 0; i < schema.lists.length; i++) {
        var l = schema.lists[i];
        if (!S.lists[l.key] || S.lists[l.key].broken) continue;
        var p = l.permissions || {};
        var listSec = S.lists[l.key].planned ? null : listPath(l.key);
        // A list whose grants are changed exactly relies on its area folders inheriting from it: check that first.
        if (listSec && p.exact && l.folders === 'areas' && !p.areaFolders && !(await areaFoldersInherit(l, step))) continue;
        if (listSec) await secure(listSec, l.title, p.list || [], false, step, !!p.exact);
        else note('create', step, 'Would give "' + l.title + '" its own permissions: ' + describe([['Owners', 'FullControl']].concat(p.list || [])) + '.');
        if (p.areaFolders) {
          for (var a = 0; a < areas.length; a++) {
            var grants = p.areaFolders.map(function (g) { return [expand(g[0], areas[a]), g[1]]; });
            var url = rootUrl(l) + '/' + areas[a].key;
            if (S.lists[l.key].planned) note('create', step, 'Would give "' + l.title + '/' + areas[a].key + '" its own permissions: ' + describe([['Owners', 'FullControl']].concat(grants)) + '.');
            else await secure(folderItemPath(url), l.title + '/' + areas[a].key, grants, false, step);
          }
        }
        var named = p.folders || {};
        var names = Object.keys(named);
        for (var n = 0; n < names.length; n++) {
          if (S.lists[l.key].planned) note('create', step, 'Would give "' + l.title + '/' + names[n] + '" its own permissions: ' + describe([['Owners', 'FullControl']].concat(named[names[n]])) + '.');
          else await secure(folderItemPath(rootUrl(l) + '/' + names[n]), l.title + '/' + names[n], named[names[n]], false, step);
        }
      }
    }

    // ---------- 7. Settings and competencies ----------
    async function addItem(listKey, folderRel, values, step) {
      var l = listSchema(listKey);
      var res = await write(listPath(listKey) + '/AddValidateUpdateItemUsingPath', {
        listItemCreateInfo: { FolderPath: { DecodedUrl: rootUrl(l) + (folderRel ? '/' + folderRel : '') }, UnderlyingObjectType: 0 },
        formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }),
        bNewDocumentUpdate: false
      });
      var results = (res && (res.value || res)) || [];
      var failed = results.filter(function (r) { return r.HasException; });
      if (failed.length) throw new StopError('Could not add to "' + l.title + '": ' + failed.map(function (r) { return r.FieldName + ' – ' + r.ErrorMessage; }).join('; '));
      var id = results.filter(function (r) { return r.FieldName === 'Id'; })[0];
      return id ? Number(id.FieldValue) : null;
    }

    async function updateItem(listKey, id, values) {
      var res = await write(listPath(listKey) + '/items(' + id + ')/validateUpdateListItem', {
        formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }), bNewDocumentUpdate: false
      });
      var failed = ((res && (res.value || res)) || []).filter(function (r) { return r.HasException; });
      if (failed.length) throw new StopError('Could not update item ' + id + ': ' + failed.map(function (r) { return r.ErrorMessage; }).join('; '));
    }

    async function data() {
      var step = 'Data';
      if (S.lists.settings.planned) {
        note('create', step, 'Would add ' + schema.settings.length + ' settings and the ' + areas.length + ' competency areas.');
        return;
      }
      var have = await rest.getRows(listPath('settings') + '/items?$select=Id,Title&$top=500');
      var missing = schema.settings.filter(function (s) { return !have.some(function (h) { return h.Title === s[0]; }); });
      if (!missing.length) note('ok', step, 'All ' + schema.settings.length + ' settings already in place.');
      else {
        if (applying()) for (var i = 0; i < missing.length; i++) {
          var s = missing[i];
          await addItem('settings', '', { Title: s[0], Value: s[0] === 'SchemaVersion' ? schema.schemaVersion : s[1], Description: s[2], Revision: 1, CreatedRequestKey: 'IMPORT-SETTING-' + s[0] }, step);
        }
        note('create', step, (applying() ? 'Added ' : 'Would add ') + missing.length + ' settings.');
      }
      var comps = await rest.getRows(listPath('competencies') + '/items?$select=Id,Title,CompetencyKey&$top=500');
      var today = opts.today || ukToday();
      var newOnes = areas.filter(function (a) { return !comps.some(function (c) { return c.CompetencyKey === a.key; }); });
      if (!newOnes.length) note('ok', step, 'All ' + areas.length + ' competency areas already in place.');
      else {
        if (!applying()) note('create', step, 'Would add competency areas: ' + newOnes.map(function (a) { return a.title; }).join(', ') + '.');
        else for (var j = 0; j < newOnes.length; j++) {
          var a = newOnes[j];
          var id = await addItem('competencies', '', {
            Title: a.title, CompetencyKey: a.key, SortOrder: a.sort, Status: 'Active', TrackingStart: ukDate(today),
            MembersGroupId: S.groups['Members:' + a.key] || '', Revision: 1, CreatedRequestKey: 'IMPORT-' + a.key
          }, step);
          var back = await rest.get(listPath('competencies') + '/items(' + id + ')?$select=TrackingStart');
          var stored = back && back.TrackingStart ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(back.TrackingStart)) : '';
          note('create', step, 'Added competency area ' + a.title + '.');
          if (stored !== today) note('warn', step, a.title + ': Tracking Start was stored as ' + (stored || 'blank') + ' instead of ' + today + '. Dates need checking (probe P-07).');
        }
      }
    }

    // ---------- 8. First administrator (plan E.5.1) and 9. people import ----------
    async function personSetup(person, step) {
      // person: { loginName, email, title, siteUserId, role, areas: [{ key, canManageMeetings }], admin }
      var people = await rest.getRows(listPath('people') + '/items?$select=Id,Title,SiteUserId,Role,IsAdministrator,Status&$filter=SiteUserId eq ' + person.siteUserId);
      var row = people[0];
      if (row && row.Role !== person.role) note('warn', step, person.title + ' is already recorded as ' + row.Role + ', not ' + person.role + '. Not changed; use the app to change roles.');
      if (!row) {
        if (applying()) {
          var id = await addItem('people', '', {
            Title: person.title, Person: claimFor(person.loginName), Email: person.email.toLowerCase(), SiteUserId: person.siteUserId,
            Role: person.role, IsAdministrator: '0', Status: 'Active', Revision: 1, CreatedRequestKey: 'IMPORT-' + person.email.toLowerCase()
          }, step);
          row = { Id: id, Role: person.role, IsAdministrator: false };
        }
        note('create', step, (applying() ? 'Added ' : 'Would add ') + person.title + ' (' + person.role + ') to People.');
      }
      var folder = 'u' + person.siteUserId;
      var r = await ensureFolder('requests', folder, step);
      if (r === 'created') note('create', step, 'Created the request folder for ' + person.title + '.');
      if (r === 'would') note('create', step, 'Would create the request folder for ' + person.title + '.');
      if (applying() || r === 'exists') {
        S.groups['Person:' + person.siteUserId] = person.siteUserId;
        await secure(folderItemPath(rootUrl(listSchema('requests')) + '/' + folder), 'Requests/' + folder + ' (' + person.title + ')', [['Person:' + person.siteUserId, 'Contribute']], false, step);
      }
      var groupKeys = ['AllUsers', 'NoticePosters'];
      if (MANAGEMENT_ROLES.indexOf(person.role) >= 0) groupKeys.push('Management');
      (person.areas || []).forEach(function (a) { groupKeys.push('Members:' + a.key); });
      if (person.admin) groupKeys.push('Administrators');
      for (var i = 0; i < groupKeys.length; i++) await addToGroup(groupKeys[i], person, step);
      for (var j = 0; j < (person.areas || []).length; j++) await membership(person, person.areas[j], step);
      return row;
    }

    async function addToGroup(key, person, step) {
      var gid = S.groups[key];
      var title = key.replace('Members:', '') + (key.indexOf('Members:') === 0 ? ' members' : '');
      if (!gid) { note('create', step, 'Would add ' + person.title + ' to ' + title + '.'); return; }
      var users = await rest.getRows('/_api/web/sitegroups(' + gid + ')/users?$select=Id');
      if (users.some(function (u) { return Number(u.Id) === person.siteUserId; })) return;
      if (!applying()) { note('create', step, 'Would add ' + person.title + ' to ' + title + '.'); return; }
      await write('/_api/web/sitegroups(' + gid + ')/users', { __metadata: { type: 'SP.User' }, LoginName: person.loginName }, { verbose: true });
      var back = await rest.getRows('/_api/web/sitegroups(' + gid + ')/users?$select=Id');
      if (!back.some(function (u) { return Number(u.Id) === person.siteUserId; })) throw new StopError(person.title + ' is not in ' + title + ' after adding.');
      note('create', step, 'Added ' + person.title + ' to ' + title + '.');
    }

    async function membership(person, area, step) {
      var key = area.key + '|' + person.siteUserId;
      if (S.lists.members.planned) { note('create', step, 'Would record ' + person.title + ' as a member of ' + area.key + '.'); return; }
      var have = await rest.getRows(listPath('members') + "/items?$select=Id&$filter=MembershipKey eq '" + CHS.rest.q(key) + "'");
      if (have.length) return;
      if (!applying()) { note('create', step, 'Would record ' + person.title + ' as a member of ' + area.key + '.'); return; }
      var comp = await rest.getRows(listPath('competencies') + "/items?$select=Id&$filter=CompetencyKey eq '" + area.key + "'");
      if (!comp.length) throw new StopError('Competency ' + area.key + ' not found');
      await addItem('members', area.key, {
        Title: person.title + ' – ' + area.key, Competency: comp[0].Id, Person: claimFor(person.loginName), MembershipKey: key,
        CanManageMeetings: area.canManageMeetings ? '1' : '0', Status: 'Active', Revision: 1, CreatedRequestKey: 'IMPORT-' + key
      }, step);
      note('create', step, 'Recorded ' + person.title + ' as a member of ' + area.key + '.');
    }

    async function usableAdministrators() {
      if (S.lists.people.planned || !S.groups.Administrators) return [];
      var admins = await rest.getRows(listPath('people') + "/items?$select=Id,Title,SiteUserId,IsAdministrator,Status&$filter=IsAdministrator eq 1 and Status eq 'Active'");
      var groupUsers = await rest.getRows('/_api/web/sitegroups(' + S.groups.Administrators + ')/users?$select=Id');
      return admins.filter(function (a) { return groupUsers.some(function (u) { return Number(u.Id) === Number(a.SiteUserId); }); });
    }

    async function bootstrap() {
      var step = 'First administrator';
      var me = S.me;
      var txKey = 'SYS|Bootstrap|' + me.Id;
      var usable = await usableAdministrators();
      var tx = S.lists.people.planned ? [] : await rest.getRows(listPath('history') + "/items?$select=Id,State,StepsDone&$filter=RequestKey eq '" + CHS.rest.q(txKey) + "'");
      var unfinished = tx.length && tx[0].State !== 'Applied';
      if (usable.some(function (a) { return Number(a.SiteUserId) === Number(me.Id); }) && !unfinished) {
        note('ok', step, me.Title + ' is already a working administrator.');
        return;
      }
      if (usable.length && !unfinished) {
        note('info', step, 'An administrator already exists (' + usable.map(function (a) { return a.Title; }).join(', ') + '). Setup does not add more; use the app.');
        return;
      }
      var person = { loginName: me.LoginName, email: me.Email || '', title: me.Title, siteUserId: Number(me.Id), role: opts.bootstrapRole || 'Team Leader', areas: [], admin: true };
      if (S.lists.people.planned) {
        note('create', step, 'Would make ' + me.Title + ' (' + person.role + ') the first administrator: People entry, request folder, groups All Users, Management and Administrators, then the administrator flag.');
        return;
      }
      if (applying() && !tx.length) {
        var txId = await addItem('history', 'Transactions', { Title: 'Bootstrap administrator: ' + me.Title, RowKind: 'Transaction', RequestKey: txKey, RequestType: 'Bootstrap', State: 'Applying', StepsDone: '', Attempts: 1 }, step);
        tx = [{ Id: txId, StepsDone: '' }];
      }
      var row = await personSetup(person, step);
      if (!applying()) { note('create', step, 'Would then set the administrator flag for ' + me.Title + '.'); return; }
      // The administrator flag is set only once group membership has been read back, and the
      // transaction is marked Applied last, so an interrupted run is always completed by the next.
      await updateItem('history', tx[0].Id, { StepsDone: 'PERSON;FOLDER;GROUPS' });
      if (!row.IsAdministrator) await updateItem('people', row.Id, { IsAdministrator: '1' });
      var back = await rest.get(listPath('people') + '/items(' + row.Id + ')?$select=IsAdministrator');
      if (!back.IsAdministrator) throw new StopError('The administrator flag did not save.');
      var eventKey = txKey + '|1';
      var ev = await rest.getRows(listPath('history') + "/items?$select=Id&$filter=RequestKey eq '" + CHS.rest.q(eventKey) + "'");
      if (!ev.length) {
        await addItem('history', 'Administration', { Title: me.Title + ' made the first Competency Hub administrator', RowKind: 'Event', RequestKey: eventKey,
          RecordType: 'Person', RecordId: row.Id, EventType: 'Bootstrap', Actor: claimFor(me.LoginName) }, step);
      }
      var setting = await rest.getRows(listPath('settings') + "/items?$select=Id,Value&$filter=Title eq 'BootstrapCompletedOn'");
      if (setting.length && !setting[0].Value) await updateItem('settings', setting[0].Id, { Value: new Date().toISOString() });
      await updateItem('history', tx[0].Id, { StepsDone: 'PERSON;FOLDER;GROUPS;ADMIN;EVENT;SETTING', State: 'Applied' });
      note('create', step, me.Title + ' is now the first administrator.');
    }

    // Lines: email, role, area keys (space separated). Engineers run their areas' meetings by default.
    function parsePeople(text) {
      var out = [];
      var problems = [];
      String(text || '').split(/\r?\n/).forEach(function (line, n) {
        var t = line.trim();
        if (!t || t.charAt(0) === '#') return;
        var parts = t.split(',').map(function (p) { return p.trim(); });
        var email = (parts[0] || '').toLowerCase();
        var role = parts[1] || '';
        var keys = (parts[2] || '').split(/\s+/).filter(Boolean).map(function (k) { return k.toUpperCase(); });
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('Line ' + (n + 1) + ': "' + parts[0] + '" is not an email address.');
        else if (['Engineer', 'Technician', 'Team Leader', 'Group Head'].indexOf(role) < 0) problems.push('Line ' + (n + 1) + ': role must be Engineer, Technician, Team Leader or Group Head.');
        else {
          var bad = keys.filter(function (k) { return !areas.some(function (a) { return a.key === k; }); });
          if (bad.length) problems.push('Line ' + (n + 1) + ': unknown area ' + bad.join(', ') + '.');
          else out.push({ email: email, role: role, keys: keys });
        }
      });
      return { people: out, problems: problems };
    }

    async function importPeople() {
      var step = 'People import';
      if (!opts.peopleText || !String(opts.peopleText).trim()) { note('info', step, 'No people list was given, so nobody else was added.'); return; }
      var parsed = parsePeople(opts.peopleText);
      parsed.problems.forEach(function (p) { note('warn', step, p + ' Skipped.'); });
      if (S.lists.people.planned) {
        note('create', step, 'Would look up and add ' + parsed.people.length + ' people once the lists exist.');
        return;
      }
      for (var i = 0; i < parsed.people.length; i++) {
        var p = parsed.people[i];
        var user;
        try {
          user = applying()
            ? await write('/_api/web/ensureuser', { logonName: 'i:0#.f|membership|' + p.email })
            : (await rest.getRows("/_api/web/siteusers?$select=Id,Title,LoginName,Email&$filter=Email eq '" + CHS.rest.q(p.email) + "'"))[0];
        } catch (e) {
          note('warn', step, p.email + ' could not be found in Microsoft 365 (' + e.message + '). Skipped.');
          continue;
        }
        if (!user) { note('create', step, 'Would look up ' + p.email + ' and add them as ' + p.role + (p.keys.length ? ' in ' + p.keys.join(', ') : '') + '.'); continue; }
        await personSetup({ loginName: user.LoginName, email: p.email, title: user.Title, siteUserId: Number(user.Id), role: p.role,
          areas: p.keys.map(function (k) { return { key: k, canManageMeetings: p.role === 'Engineer' }; }), admin: false }, step);
      }
    }

    // ---------- 10. Page, layouts library and Welcome errors list ----------
    async function pageAccess() {
      var step = 'App page access';
      if (!S.groups.AllUsers) { note('create', step, 'Would give All Users read access to the Hub page, the Welcome layouts library and the Welcome errors list.'); return; }
      var all = await rest.getRows('/_api/web/lists?$select=Id,Title,BaseTemplate');
      var pages = all.filter(function (l) { return Number(l.BaseTemplate) === 119; })[0];
      var targets = [
        { title: 'Welcome Web Part - Custom Layouts', label: 'Welcome layouts library' },
        { title: 'Welcome Web Part - Errors', label: 'Welcome errors list' }
      ];
      for (var i = 0; i < targets.length; i++) {
        var l = all.filter(function (x) { return x.Title === targets[i].title; })[0];
        if (!l) { note('warn', step, targets[i].label + ' not found. Add the Welcome web part to a page, then run Setup again.'); continue; }
        await secure("/_api/web/lists(guid'" + l.Id + "')", targets[i].label, [['AllUsers', 'Read']], true, step);
      }
      if (!pages) { note('warn', step, 'Site Pages library not found.'); return; }
      var hub = await rest.getRows("/_api/web/lists(guid'" + pages.Id + "')/items?$select=Id,FileLeafRef&$filter=FileLeafRef eq 'Hub.aspx'");
      if (!hub.length) { note('info', step, 'The app page Hub.aspx does not exist yet. Create it later and run Setup again to open it to All Users.'); return; }
      await secure("/_api/web/lists(guid'" + pages.Id + "')/items(" + hub[0].Id + ')', 'Hub.aspx page', [['AllUsers', 'Read']], true, step);
    }

    // Spec §4.4: the active people allowed to post notices are members of Notice posters.
    async function noticePosters() {
      var step = 'Notice posters';
      var peopleDef = schema.lists.filter(function (l) { return l.key === 'people'; })[0];
      if (!peopleDef.fields.some(function (f) { return f.name === 'CanPostNotices'; })) return;
      if (S.lists.people.planned) { note('create', step, 'Would add everyone allowed to post notices to Notice posters.'); return; }
      if (S.pendingFields['people.CanPostNotices']) { note('create', step, 'Would add everyone allowed to post notices to Notice posters (after the new People column is added).'); return; }
      var people = await rest.getRows(listPath('people') + "/items?$select=Id,Title,SiteUserId,CanPostNotices,Status&$filter=Status eq 'Active'");
      var gid = S.groups.NoticePosters;
      var inGroup = gid ? (await rest.getRows('/_api/web/sitegroups(' + gid + ')/users?$select=Id,LoginName')) : [];
      var missing = people.filter(function (p) { return p.CanPostNotices !== false && !inGroup.some(function (u) { return Number(u.Id) === Number(p.SiteUserId); }); });
      if (!missing.length) { note('ok', step, 'Everyone allowed to post notices is in Notice posters.'); return; }
      if (!applying()) { note('create', step, 'Would add ' + missing.map(function (p) { return p.Title; }).join(', ') + ' to Notice posters.'); return; }
      for (var i = 0; i < missing.length; i++) {
        var user = await rest.get('/_api/web/getuserbyid(' + Number(missing[i].SiteUserId) + ')?$select=Id,LoginName');
        await addToGroup('NoticePosters', { title: missing[i].Title, loginName: user.LoginName, siteUserId: Number(missing[i].SiteUserId) }, step);
      }
    }

    var STEPS = [prechecks, permissionLevels, groups, lists, folders, permissions, data, bootstrap, importPeople, noticePosters, pageAccess];

    async function run(runMode) {
      mode = runMode === 'apply' ? 'apply' : 'check';
      S = { lists: {}, groups: {}, roles: {}, pendingFields: {}, stops: 0, created: 0, unchanged: 0, writeBase: rest.writeCount() };
      try {
        await STEPS[0]();
        if (S.stops) {
          note('stop', 'Pre-checks', applying() ? 'Setup has not changed anything. Fix the points above and try again.' : 'Fix the points above before running Apply.');
          if (applying()) return summary(false);
        }
        for (var i = 1; i < STEPS.length; i++) {
          await STEPS[i]();
          if (S.stops && applying()) { note('stop', 'Setup', 'Setup stopped. Everything completed so far is kept; running Apply again continues from here.'); return summary(false); }
        }
        return summary(!S.stops);
      } catch (e) {
        note('stop', 'Setup', (e instanceof StopError ? '' : 'Unexpected error: ') + e.message + ' Running Apply again continues from where it stopped.');
        return summary(false);
      }
    }

    function summary(ok) {
      return { ok: ok, mode: mode, created: S.created, unchanged: S.unchanged, stops: S.stops, writes: rest.writeCount() - S.writeBase };
    }

    return { run: run, parsePeople: parsePeople, fieldXml: fieldXml };
  }

  return { create: create, fieldXml: fieldXml };
})();
