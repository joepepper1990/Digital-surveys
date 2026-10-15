"""An in-memory SharePoint site + Outlook + Office 365 Users, answering exactly the calls the ESG 1-to-1 flows make.

Behaviour follows SharePoint Online: verbose bodies must carry the right __metadata type, unknown list properties
are rejected, field internal names come from the Name attribute, EnforceUniqueValues needs an index, unique
values are enforced, choice values must be one of the choices, breaking inheritance without copying leaves only
the caller, and a connector item looks like the SharePoint connector's output (Person / Choice objects).
"""
import json
import re
import uuid
import xml.dom.minidom
from urllib.parse import unquote

from wdl import ActionFailed

SITE = 'https://contoso.example/sites/esg-1to1'
SITE_REL = '/sites/esg-1to1'
FULL, DESIGN, EDIT, CONTRIB, READ, LIMITED = 1073741829, 1073741828, 1073741830, 1073741827, 1073741826, 1073741825


def fail(code, msg):
    raise ActionFailed('{0} {1}'.format(code, msg))


class FakeSP:
    def __init__(self, locale=2057, tz='(UTC) Dublin, Edinburgh, Lisbon, London', site_admin=True):
        self.users = {
            10: {'Id': 10, 'Title': 'Team Leader', 'Email': 'team.leader@example.test', 'aad': 'aad-tl'},
            11: {'Id': 11, 'Title': 'Alex Morgan', 'Email': 'alex.morgan@example.test', 'aad': 'AAD-ALEX'},
            12: {'Id': 12, 'Title': 'Sam Patel', 'Email': 'sam.patel@example.test', 'aad': 'AAD-SAM'},
        }
        for u in self.users.values():
            u['Claims'] = 'i:0#.f|membership|' + u['Email']
        self.me = 10
        self.site_admin = site_admin
        self.locale, self.tz = locale, tz
        self.groups = {3: {'Id': 3, 'Title': 'ESG 1-to-1 Owners', 'members': {10}},
                       4: {'Id': 4, 'Title': 'ESG 1-to-1 Members', 'members': set()},
                       5: {'Id': 5, 'Title': 'ESG 1-to-1 Visitors', 'members': set()}}
        self.roles = [
            {'Id': LIMITED, 'Name': 'Limited Access', 'RoleTypeKind': 1, 'BasePermissions': {'High': '48', 'Low': '134287360'}},
            {'Id': READ, 'Name': 'Read', 'RoleTypeKind': 2, 'BasePermissions': {'High': '176', 'Low': '138612833'}},
            {'Id': CONTRIB, 'Name': 'Contribute', 'RoleTypeKind': 3, 'BasePermissions': {'High': '432', 'Low': '1011028719'}},
            {'Id': DESIGN, 'Name': 'Design', 'RoleTypeKind': 4, 'BasePermissions': {'High': '432', 'Low': '1012866047'}},
            {'Id': FULL, 'Name': 'Full Control', 'RoleTypeKind': 5, 'BasePermissions': {'High': '2147483647', 'Low': '4294967295'}},
            {'Id': EDIT, 'Name': 'Edit', 'RoleTypeKind': 6, 'BasePermissions': {'High': '432', 'Low': '1011030767'}},
        ]
        self.web_ra = {3: {FULL}, 4: {EDIT}, 5: {READ}}
        self.lists = {}
        for title, url in (('Site Pages', 'SitePages'), ('Documents', 'Shared Documents'),
                           ('Welcome Web Part - Custom Layouts', 'WMWCustomLayouts')):
            self._new_list(title, url, '')
        self.emails = []
        self.calls = []
        self.ensure_fail = set()
        self.fail_fields = set()        # column names createfieldasxml will refuse (to test warn-and-continue)
        self.fail_uris = []
        self.dates_as_instants = False  # connector returns date-only values as UTC instants instead of yyyy-MM-dd  # user ids whose account cannot be resolved (left the organisation)

    # ------------------------------------------------------------------ model helpers
    def _new_list(self, title, url, desc):
        lid = str(uuid.uuid4())
        base = {n: {'Type': t, 'Name': n} for n, t in (('ID', 'Counter'), ('Title', 'Text'), ('Created', 'DateTime'),
                                                       ('Modified', 'DateTime'), ('Author', 'User'), ('Editor', 'User'),
                                                       ('Attachments', 'Attachments'), ('ContentType', 'Computed'),
                                                       ('LinkTitle', 'Computed'))}
        entity = 'SP.Data.' + url.replace(' ', '_x0020_') + 'ListItem'
        self.lists[lid] = {'Id': lid, 'Title': title, 'url': url, 'Description': desc, 'fields': base,
                           'views': ['All Items'], 'view_defs': {}, 'items': {}, 'next': 1, 'unique': False, 'ra': {},
                           'props': {'EnableVersioning': False, 'MajorVersionLimit': 0, 'EnableAttachments': True,
                                     'NoCrawl': False, 'OnQuickLaunch': True, 'ExcludeFromOfflineClient': False},
                           'entity': entity}
        return self.lists[lid]

    def list_by_title(self, title):
        for l in self.lists.values():
            if l['Title'] == title:
                return l
        fail(404, 'List does not exist: ' + title)

    def role_id(self, name):
        return next(r['Id'] for r in self.roles if r['Name'] == name)

    def principals_of(self, user_id):
        return {user_id} | {g for g, d in self.groups.items() if user_id in d['members']}

    def roles_on(self, user_id, lst, item=None):
        """Effective role ids for a user on a list or an item (Site Collection Admins are handled by the caller)."""
        if item is not None and item.get('unique'):
            ra = item['ra']
        elif lst['unique']:
            ra = lst['ra']
        else:
            ra = self.web_ra
        out = set()
        for p in self.principals_of(user_id):
            out |= ra.get(p, set())
        return out

    def user_by_claims(self, claims):
        for u in self.users.values():
            if u['Claims'].lower() == str(claims).lower():
                return u
        fail(400, 'user not found ' + str(claims))

    # ------------------------------------------------------------------ connector dispatch
    def __call__(self, api, op, p):
        self.calls.append((api, op))
        if api == 'shared_office365':
            assert op == 'SendEmailV2', op
            self.emails.append({'to': p['emailMessage/To'], 'subject': p['emailMessage/Subject'], 'body': p['emailMessage/Body']})
            return {}
        if api == 'shared_office365users':
            assert op == 'UserProfile_V2', op
            if '@' not in p['id'] or p['id'].startswith('i:0'):
                fail(400, 'UserProfile_V2 expects a UPN or object id, got ' + p['id'])
            u = next((u for u in self.users.values() if u['Email'] == p['id']), None)   # fake UPN = email
            if u is None:
                fail(404, 'user not found')
            return {'id': u['aad'], 'mail': u['Email'], 'displayName': u['Title']}
        assert api == 'shared_sharepointonline', api
        if p.get('dataset') != SITE:
            fail(400, 'wrong site ' + str(p.get('dataset')))
        if op == 'HttpRequest':
            return self.rest(p['parameters/method'], p['parameters/uri'], p.get('parameters/headers') or {}, p.get('parameters/body'))
        lst = self.list_by_title(p['table'])
        if op == 'GetItems':
            return {'value': self.get_items(lst, p.get('$filter'), p.get('$orderby'), p.get('$top'))}
        if op == 'PostItem':
            return self.item_out(lst, self.write_item(lst, None, p))
        if op == 'PatchItem':
            return self.item_out(lst, self.write_item(lst, int(p['id']), p))
        fail(400, 'operation not simulated ' + op)

    # ------------------------------------------------------------------ items through the connector
    def coerce(self, lst, name, sub, value):
        f = lst['fields'].get(name)
        if f is None:
            fail(400, 'column {0} does not exist on {1}'.format(name, lst['Title']))
        t = f['Type']
        if value is None or value == '':
            return None
        if t == 'User':
            if sub != 'Claims':
                fail(400, 'person fields are written as /Claims')
            return self.user_by_claims(value)['Id']
        if t == 'Choice':
            if sub != 'Value':
                fail(400, 'choice fields are written as /Value')
            if value not in f['choices']:
                fail(400, 'invalid choice {0!r} for {1}'.format(value, name))
            return value
        if sub:
            fail(400, '{0} is not a person/choice column'.format(name))
        if t == 'Boolean':
            if not isinstance(value, bool):
                fail(400, '{0} expects a boolean'.format(name))
            return value
        if t == 'Number':
            v = float(value)
            if f.get('Min') is not None and v < float(f['Min']) or f.get('Max') is not None and v > float(f['Max']):
                fail(400, 'number out of range for ' + name)
            return v   # the SharePoint connector returns Number columns as doubles (12.0)
        if t == 'DateTime':
            s = str(value)
            if not re.match(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$', s):
                fail(400, 'bad date for {0}: {1}'.format(name, s))
            return s if f.get('Format') == 'DateTime' else s[:10]
        return str(value)

    def write_item(self, lst, item_id, p):
        vals = {}
        for k, v in p.items():
            if not k.startswith('item/'):
                continue
            parts = k[5:].split('/')
            vals[parts[0]] = self.coerce(lst, parts[0], parts[1] if len(parts) > 1 else None, v)
        for name, v in vals.items():
            f = lst['fields'][name]
            if f.get('EnforceUniqueValues') and v is not None:
                for it in lst['items'].values():
                    if it['fields'].get(name) == v and it['id'] != item_id:
                        fail(400, 'duplicate value for unique column ' + name)
        if item_id is None:
            item_id = lst['next']
            lst['next'] += 1
            fields = {}
            for name, f in lst['fields'].items():
                if 'Default' in f:
                    fields[name] = self.coerce(lst, name, 'Value' if f['Type'] == 'Choice' else None,
                                               {'1': True, '0': False}.get(f['Default'], f['Default'])
                                               if f['Type'] == 'Boolean' else f['Default'])
            lst['items'][item_id] = {'id': item_id, 'fields': fields, 'unique': False, 'ra': {}}
        it = lst['items'].get(item_id)
        if it is None:
            fail(404, 'item not found')
        it['fields'].update(vals)
        it['editor'] = self.me
        return it

    def item_out(self, lst, it):
        o = {'ID': it['id'], 'Id': it['id']}
        for name, v in it['fields'].items():
            f = lst['fields'][name]
            if v is None:
                continue
            if f['Type'] == 'User':
                u = self.users[v]
                o[name] = {'Claims': u['Claims'], 'DisplayName': u['Title'], 'Email': u['Email']}
            elif f['Type'] == 'Choice':
                o[name] = {'Value': v}
            elif f['Type'] == 'DateTime' and f.get('Format') != 'DateTime':
                if self.dates_as_instants:   # midnight UK time as UTC: 23:00Z the day before in summer
                    from datetime import datetime, timezone
                    from zoneinfo import ZoneInfo
                    d = datetime.fromisoformat(v[:10]).replace(tzinfo=ZoneInfo('Europe/London')).astimezone(timezone.utc)
                    o[name] = d.strftime('%Y-%m-%dT%H:%M:%SZ')
                else:
                    o[name] = v[:10]
            else:
                o[name] = v
        u = self.users[it.get('editor', 10)]
        o['Editor'] = {'Claims': u['Claims'], 'DisplayName': u['Title'], 'Email': u['Email']}
        return o

    def get_items(self, lst, flt, order, top):
        rows = list(lst['items'].values())
        if flt:
            for clause in re.split(r'\s+and\s+', flt):
                m = re.match(r"^(\w+) eq (?:'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?))$", clause.strip())
                if not m:
                    fail(400, 'filter not supported by the fake: ' + clause)
                col = m.group(1)
                if col == 'ID':
                    rows = [r for r in rows if r['id'] == int(float(m.group(3)))]
                    continue
                if col not in lst['fields']:
                    fail(400, 'column in filter does not exist: ' + col)
                f = lst['fields'][col]
                want = m.group(2).replace("''", "'") if m.group(2) is not None else float(m.group(3))
                if f['Type'] == 'Boolean':
                    want = bool(want)
                rows = [r for r in rows if (float(r['fields'].get(col)) if isinstance(want, float) and r['fields'].get(col) is not None
                                            else r['fields'].get(col)) == want]
        if order:
            col, _, d = order.partition(' ')
            rows.sort(key=lambda r: (r['fields'].get(col) is None, r['fields'].get(col) or 0), reverse=(d == 'desc'))
        if top:
            rows = rows[:int(top)]
        return [self.item_out(lst, r) for r in rows]

    # ------------------------------------------------------------------ REST
    def rest(self, method, uri, headers, body):
        if not uri.startswith('_api/'):
            fail(400, 'uri must start with _api/: ' + uri)
        path, _, qs = uri.partition('?')
        if any(x in uri for x in self.fail_uris):   # test hook: make a REST call fail with a server error
            fail(500, 'simulated server error')
        verbose = 'odata=verbose' in headers.get('Content-Type', '')
        data = None
        if body is not None:
            try:
                data = json.loads(body)
            except ValueError:
                fail(400, 'request body is not JSON: ' + body[:80])
        if method == 'POST' and headers.get('X-HTTP-Method') == 'MERGE':
            if path.startswith('_api/web/lists') and '/fields/' in path and verbose:
                pass  # verbose SP.Field bodies are also accepted; the flows send nometadata
            if headers.get('IF-MATCH') != '*':
                fail(412, 'IF-MATCH required')
            return self.merge(path, data)

        def need_type(t):
            if not verbose or (data.get('__metadata') or {}).get('type') != t:
                fail(400, 'expected verbose body with __metadata type ' + t)

        if method == 'GET' and path == '_api/web':
            return {'Title': 'ESG Technician 1-to-1', 'Url': SITE, 'ServerRelativeUrl': SITE_REL}
        if method == 'GET' and path == '_api/web/currentuser':
            u = self.users[self.me]
            return {'Id': u['Id'], 'Title': u['Title'], 'Email': u['Email'], 'IsSiteAdmin': self.site_admin}
        if method == 'GET' and path == '_api/web/RegionalSettings':
            return {'LocaleId': self.locale}
        if method == 'GET' and path == '_api/web/RegionalSettings/TimeZone':
            return {'Id': 2, 'Description': self.tz}
        if method == 'GET' and path == '_api/web/roledefinitions':
            return {'value': [dict(r) for r in self.roles]}
        if method == 'POST' and path == '_api/web/roledefinitions':
            need_type('SP.RoleDefinition')
            if data['BasePermissions'].get('__metadata', {}).get('type') != 'SP.BasePermissions':
                fail(400, 'BasePermissions type')
            if not all(isinstance(data['BasePermissions'][k], str) for k in ('High', 'Low')):
                fail(400, 'Int64 values must be strings in verbose JSON')
            if any(r['Name'] == data['Name'] for r in self.roles):
                fail(409, 'role exists')
            rid = 1073741924 + len(self.roles)
            self.roles.append({'Id': rid, 'Name': data['Name'], 'RoleTypeKind': 0, 'Order': data['Order'],
                               'BasePermissions': {'High': data['BasePermissions']['High'], 'Low': data['BasePermissions']['Low']}})
            return {'Id': rid}
        if method == 'GET' and path == '_api/web/sitegroups':
            return {'value': [{'Id': g['Id'], 'Title': g['Title']} for g in self.groups.values()]}
        if method == 'POST' and path == '_api/web/sitegroups':
            need_type('SP.Group')
            if any(g['Title'] == data['Title'] for g in self.groups.values()):
                fail(409, 'group exists')
            gid = max(self.groups) + 1
            self.groups[gid] = {'Id': gid, 'Title': data['Title'], 'members': set(), 'props': data}
            return {'Id': gid}
        mg = re.match(r'^_api/web/sitegroups\((\d+)\)/users(?:/removebyid\((\d+)\))?$', path)
        if mg:
            g = self.groups.get(int(mg.group(1)))
            if g is None:
                fail(404, 'group not found')
            if method == 'GET' and not mg.group(2):
                return {'value': [{'Id': u, 'Title': self.users[u]['Title'], 'LoginName': self.users[u]['Claims'], 'Email': self.users[u]['Email'],
                                   'IsSiteAdmin': False} for u in sorted(g['members'])]}
            if method == 'POST' and not mg.group(2):
                need_type('SP.User')
                u = self.user_by_claims(data['LoginName'])
                g['members'].add(u['Id'])
                return {'Id': u['Id']}
            if method == 'POST' and mg.group(2):
                if int(mg.group(2)) not in g['members']:
                    fail(404, 'user is not in the group')
                g['members'].discard(int(mg.group(2)))
                return {}
        if method == 'GET' and path == '_api/web/associatedownergroup':
            return {'Id': 3, 'Title': self.groups[3]['Title']}
        if method == 'GET' and path == '_api/web/associatedownergroup/users':
            return {'value': [{'Id': u} for u in sorted(self.groups[3]['members'])]}
        if method == 'GET' and path == '_api/web/associatedmembergroup':
            return {'Id': 4, 'Title': self.groups[4]['Title']}
        if method == 'GET' and path == '_api/web/associatedvisitorgroup':
            return {'Id': 5, 'Title': self.groups[5]['Title']}
        if method == 'POST' and path == '_api/web/ensureuser':
            if verbose:
                fail(400, 'ensureuser body is nometadata in the flows')
            u = self.user_by_claims(data['logonName'])
            if u['Id'] in self.ensure_fail:
                fail(404, 'The specified user could not be found.')
            return {'Id': u['Id']}
        if method == 'GET' and path == '_api/web/lists':
            if '$expand=RootFolder' not in qs:
                fail(400, 'RootFolder/... needs $expand=RootFolder')
            return {'value': [{'Id': l['Id'], 'Title': l['Title'], 'HasUniqueRoleAssignments': l['unique'],
                               'MajorVersionLimit': l['props']['MajorVersionLimit'],
                               'ListItemEntityTypeFullName': l['entity'],
                               'RootFolder': {'Name': l['url'], 'ServerRelativeUrl': SITE_REL + '/Lists/' + l['url']}}
                              for l in self.lists.values()]}
        if method == 'POST' and path == '_api/web/lists':
            need_type('SP.List')
            if data.get('BaseTemplate') != 100:
                fail(400, 'BaseTemplate')
            if any(l['url'] == data['Title'] or l['Title'] == data['Title'] for l in self.lists.values()):
                fail(409, 'list exists')
            l = self._new_list(data['Title'], data['Title'], data.get('Description', ''))
            return {'Id': l['Id']}
        m = re.match(r"^_api/web/lists\(guid'([0-9a-f-]+)'\)(.*)$", path)
        if not m:
            fail(404, 'endpoint not simulated: ' + method + ' ' + path)
        lst = self.lists.get(m.group(1))
        if lst is None:
            fail(404, 'list guid not found')
        rest = m.group(2)
        if method == 'GET' and rest == '/fields':
            return {'value': [{'InternalName': n} for n in lst['fields']]}
        if method == 'POST' and rest == '/fields/createfieldasxml':
            prm = data.get('parameters', {})
            if not verbose or prm.get('__metadata', {}).get('type') != 'SP.XmlSchemaFieldCreationInformation':
                fail(400, 'createfieldasxml body type')
            if prm.get('Options') != 28:
                fail(400, 'unexpected Options')
            return self.add_field(lst, prm['SchemaXml'])
        if method == 'GET' and rest == '/views':
            return {'value': [{'Title': v} for v in lst['views']]}
        if method == 'POST' and rest == '/views/add':
            prm = data.get('parameters', {})
            if not verbose or prm.get('__metadata', {}).get('type') != 'SP.ViewCreationInformation':
                fail(400, 'views/add body type')
            if prm['ViewFields'].get('__metadata', {}).get('type') != 'Collection(Edm.String)':
                fail(400, 'ViewFields type')
            for fname in prm['ViewFields']['results']:
                if fname not in lst['fields']:
                    fail(400, 'view field missing ' + fname)
            if 'ViewQuery' in prm or 'Query' not in prm:
                fail(400, 'The property ViewQuery does not exist on type SP.ViewCreationInformation (use Query)')
            xml.dom.minidom.parseString('<Q>' + prm['Query'] + '</Q>')
            for fr in re.findall(r"FieldRef Name='([^']+)'", prm['Query']):
                if fr not in lst['fields']:
                    fail(400, 'CAML field missing ' + fr)
            if prm['Title'] in lst['views']:
                fail(409, 'view exists')
            lst['views'].append(prm['Title'])
            lst['view_defs'][prm['Title']] = prm
            return {'Title': prm['Title']}
        if method == 'POST' and rest == '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)':
            if getattr(self, 'fail_break', False):
                fail(403, 'simulated: breaking inheritance refused')
            if not lst['unique']:
                lst['unique'], lst['ra'] = True, {self.me: {FULL}}
            return {}
        mra = re.match(r'^/roleassignments/(add|remove)roleassignment\(principalid=(\d+),roledefid=(\d+)\)$', rest)
        if method == 'POST' and mra:
            return self.role_assign(lst, mra, lst)
        if method == 'GET' and rest == '/roleassignments':
            ra = lst['ra'] if lst['unique'] else self.web_ra
            return {'value': [{'PrincipalId': pid} for pid in ra]}
        mdel = re.match(r'^/roleassignments/getbyprincipalid\((-?\d+)\)$', rest)
        if method == 'POST' and mdel and headers.get('X-HTTP-Method') == 'DELETE':
            if not lst['unique']:
                fail(400, 'list inherits permissions')
            if int(mdel.group(1)) not in lst['ra']:
                fail(404, 'role assignment not found')
            del lst['ra'][int(mdel.group(1))]
            return {}
        if method == 'GET' and rest == '/items':
            args = dict(kv.split('=', 1) for kv in qs.split('&') if '=' in kv)
            sel = [x for x in args.get('$select', 'Id,Title').split(',') if x]
            top = int(args.get('$top', '100'))
            if top > 5000:
                fail(400, 'The $top value cannot exceed 5000')
            rows = self.get_items(lst, args.get('$filter'), None, top)
            zone = 'Europe/London' if 'London' in self.tz else 'UTC'   # the site's regional time zone
            out = []
            for r in rows:
                o = {'Id': r['ID'], 'ID': r['ID']}   # like SharePoint: Id/ID always, everything else only when selected
                for f in sel:
                    name, _, sub = f.partition('/')
                    if name in ('Id', 'ID'):
                        continue
                    if name == 'Title':
                        o['Title'] = r.get('Title')
                        continue
                    if name not in lst['fields']:
                        fail(400, 'column not found ' + name)
                    t = lst['fields'][name]
                    v = lst['items'][r['ID']]['fields'].get(name)
                    if t['Type'] == 'User':
                        if '$expand' not in args or name not in args['$expand']:
                            fail(400, 'person column needs $expand ' + name)
                        u = self.users.get(v) if v is not None else None
                        subs = [x.partition('/')[2] for x in sel if x.partition('/')[0] == name]
                        o[name] = {k: {'Title': u['Title'], 'EMail': u['Email'], 'Id': u['Id']}[k] for k in subs if k in ('Title', 'EMail', 'Id')} if u else None
                    elif t['Type'] == 'DateTime' and v:
                        from datetime import datetime, timezone
                        from zoneinfo import ZoneInfo
                        o[name] = v if 'T' in v else datetime.fromisoformat(v[:10]).replace(tzinfo=ZoneInfo(zone)).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                    else:
                        o[name] = v
                out.append(o)
            return {'value': out}
        if method == 'POST' and rest == '/items':
            if not verbose or data.get('__metadata', {}).get('type') != lst['entity']:
                fail(400, 'item type must be ' + lst['entity'])
            p = {'item/' + k: v for k, v in data.items() if k != '__metadata'}
            return {'Id': self.write_item(lst, None, p)['id']}
        mg2 = re.match(r'^/items\((\d+)\)(/roleassignments)?$', rest)
        if method == 'GET' and mg2:
            it = lst['items'].get(int(mg2.group(1)))
            if it is None:
                fail(404, 'item')
            if not mg2.group(2):
                return {'HasUniqueRoleAssignments': bool(it['unique'])}
            if 'Member' not in qs or 'RoleDefinitionBindings' not in qs:
                fail(400, 'roleassignments needs $expand=Member,RoleDefinitionBindings')
            ra = it['ra'] if it['unique'] else (lst['ra'] if lst['unique'] else self.web_ra)
            out = []
            for pid, rids in ra.items():
                if pid in self.users:
                    u = self.users[pid]
                    member = {'Id': pid, 'Title': u['Title'], 'LoginName': u['Claims'], 'Email': u['Email'], 'PrincipalType': 1}
                else:
                    member = {'Id': pid, 'Title': self.groups[pid]['Title'], 'LoginName': self.groups[pid]['Title'], 'Email': '', 'PrincipalType': 8}
                out.append({'PrincipalId': pid, 'Member': member,
                            'RoleDefinitionBindings': [{'Name': r['Name']} for r in self.roles if r['Id'] in rids]})
            return {'value': out}
        mi = re.match(r'^/items\((\d+)\)(/.*)$', rest)
        if method == 'POST' and mi:
            it = lst['items'].get(int(mi.group(1)))
            if it is None:
                fail(404, 'item')
            op = mi.group(2)
            if op == '/resetroleinheritance':
                it['unique'], it['ra'] = False, {}
                return {}
            if op == '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)':
                it['unique'], it['ra'] = True, {self.me: {FULL}}
                return {}
            mra = re.match(r'^/roleassignments/(add|remove)roleassignment\(principalid=(\d+),roledefid=(\d+)\)$', op)
            if mra:
                if not it['unique']:
                    fail(400, 'item inherits permissions – break inheritance first')
                return self.role_assign(it, mra, lst)
        fail(404, 'endpoint not simulated: ' + method + ' ' + path)

    def role_assign(self, target, m, lst):
        kind, pid, rid = m.group(1), int(m.group(2)), int(m.group(3))
        if target is lst and not lst['unique']:
            fail(400, 'list inherits permissions – break inheritance first')
        if pid not in self.users and pid not in self.groups:
            fail(400, 'principal not found')
        if not any(r['Id'] == rid for r in self.roles):
            fail(400, 'role not found')
        if kind == 'add':
            target['ra'].setdefault(pid, set()).add(rid)
        else:
            if rid not in target['ra'].get(pid, set()):
                fail(404, 'role assignment not found')
            target['ra'][pid].discard(rid)
            if not target['ra'][pid]:
                del target['ra'][pid]
        return {}

    def add_field(self, lst, schema_xml):
        doc = xml.dom.minidom.parseString(schema_xml)
        el = doc.documentElement
        name = el.getAttribute('Name')
        if name in self.fail_fields:
            fail(400, 'simulated refusal for column ' + name)
        if name in lst['fields']:
            fail(400, 'A duplicate field name "{0}" was found.'.format(name))
        f = {k: el.getAttribute(k) for k in el.attributes.keys()}
        f['Type'] = el.getAttribute('Type')
        if f.get('EnforceUniqueValues') == 'TRUE' and f.get('Indexed') != 'TRUE':
            fail(400, 'unique values need an index')
        f['Indexed'] = f.get('Indexed') == 'TRUE'
        f['EnforceUniqueValues'] = f.get('EnforceUniqueValues') == 'TRUE'
        d = el.getElementsByTagName('Default')
        if d:
            f['Default'] = d[0].firstChild.data
        f['choices'] = [c.firstChild.data for c in el.getElementsByTagName('CHOICE')]
        lst['fields'][name] = f
        return {'InternalName': name}

    def merge(self, path, data):
        m = re.match(r"^_api/web/lists\(guid'([0-9a-f-]+)'\)(.*)$", path)
        if not m or m.group(1) not in self.lists:
            fail(404, 'merge target')
        lst = self.lists[m.group(1)]
        rest = m.group(2)
        if rest == '':
            if data.get('__metadata', {}).get('type') != 'SP.List':
                fail(400, 'SP.List type')
            for k, v in data.items():
                if k == '__metadata':
                    continue
                if k == 'Title':
                    if any(o is not lst and o['Title'] == v for o in self.lists.values()):
                        fail(400, 'A list, survey, discussion board, or document library with the specified title already exists')
                    lst['Title'] = v
                elif k == 'Description':
                    lst['Description'] = v
                elif k in lst['props']:
                    lst['props'][k] = v
                else:
                    fail(400, 'The property {0} does not exist on type SP.List'.format(k))
            return {}
        mf = re.match(r"^/fields/getbyinternalnameortitle\('([^']+)'\)$", rest)
        if mf:
            if '__metadata' in data and data['__metadata'].get('type') != 'SP.Field':
                fail(400, 'SP.Field type')
            f = lst['fields'].get(unquote(mf.group(1)))
            if f is None:
                fail(404, 'field')
            if 'Indexed' in data:
                f['Indexed'] = data['Indexed']
            if 'EnforceUniqueValues' in data:
                if data['EnforceUniqueValues'] and not f['Indexed']:
                    fail(400, 'unique values need an index')
                f['EnforceUniqueValues'] = data['EnforceUniqueValues']
            return {}
        fail(404, 'merge endpoint not simulated ' + path)
