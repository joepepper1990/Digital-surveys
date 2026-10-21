"""An in-memory Competency Hub site answering exactly the SharePoint REST calls the Hub flows make, so the generated
flow JSON can be run in tests (with wdl.py). Lists and columns come from schema.json, as Setup creates them.

Behaviour follows SharePoint Online where the flows depend on it:
  * AddValidateUpdateItemUsingPath reports refused fields as HasException (unknown column, bad choice, required column
    missing, duplicate in a unique column) and needs the parent folder to exist; dates are read in the site's own
    format (English (UK): dd/MM/yyyy [HH:mm]) and stored as UTC instants; people are given as claims;
  * MERGE with IF-MATCH checks the ETag (412 when it changed); unknown columns are refused;
  * REST returns Number columns as doubles (12.0), lookups and people as <Name>Id, date-only values as UK midnight in UTC.
"""
import json
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from hub_schema import LISTS
from wdl import ActionFailed

SITE = 'https://contoso.example/sites/ESGCompetencyHub'
SITE_REL = '/sites/ESGCompetencyHub'
UK = ZoneInfo('Europe/London')


def fail(code, msg):
    raise ActionFailed('{0} {1}'.format(code, msg))


def utc_iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class HubFake:
    def __init__(self, me=7):
        self.me = me                      # the flow's account (site owner)
        self.users = {}
        self.lists = {}
        self.by_key = {}
        self.writes = []                  # every write, in order: (method, path)
        self.calls = []                   # every SharePoint call, in order: (method, uri)
        self.fail_at = None               # 1-based index of a write that fails once (simulated interruption)
        self.return_new_id = True         # AddValidateUpdateItemUsingPath lists the new item's Id among its results
        self.clock = datetime(2026, 10, 21, 9, 30, tzinfo=timezone.utc)
        for l in LISTS:
            lid = str(uuid.uuid4())
            root = SITE_REL + ('/' + l['url'] if l['template'] == 101 else '/Lists/' + l['url'])
            fields = {'Title': {'name': 'Title', 'type': 'Text', 'required': l['template'] == 100, 'unique': l['titleUnique']}}
            for f in l['fields']:
                fields[f['name']] = f
            self.lists[lid] = {'Id': lid, 'Title': l['title'], 'url': l['url'], 'root': root, 'fields': fields, 'items': {}, 'next': 1}
            self.by_key[l['key']] = self.lists[lid]

    # ------------------------------------------------------------------ test helpers
    def add_user(self, uid, title, email):
        self.users[uid] = {'Id': uid, 'Title': title, 'LoginName': 'i:0#.f|membership|' + email}

    def folder(self, key, path, author=None):
        """Creates folders along path (relative to the list root) as the given author (default: the flow's account)."""
        lst = self.by_key[key]
        parts = path.split('/')
        for i in range(len(parts)):
            d, leaf = '/'.join(parts[:i]), parts[i]
            if not self._find_folder(lst, d, leaf):
                self._new(lst, d, {'Title': leaf}, fsobj=1, author=author or self.me)

    def add(self, key, path, fields, author=None, created=None):
        """Adds an item with REST-style field names (CompetencyId, AssignedToId, ...), as a test fixture."""
        lst = self.by_key[key]
        it = self._new(lst, path, dict(fields), fsobj=0, author=author or self.me)
        if created:
            it['created'] = created
        return it['id']

    def item(self, key, item_id):
        return self.by_key[key]['items'][item_id]

    def rows(self, key, **match):
        return [it for it in self.by_key[key]['items'].values() if it['fsobj'] == 0 and all(it['f'].get(k) == v for k, v in match.items())]

    def trigger_item(self, key, item_id):
        """The SharePoint connector's view of an item, as the polling trigger hands it to the flow."""
        it = self.item(key, item_id)
        out = {'ID': it['id'], '{IsFolder}': it['fsobj'] == 1}
        for k, v in it['f'].items():
            f = self.by_key[key]['fields'].get(k)
            out[k] = {'Value': v} if f and f['type'] == 'Choice' and v is not None else v
        return out

    # ------------------------------------------------------------------ model
    def _new(self, lst, path, fields, fsobj, author):
        iid = lst['next']
        lst['next'] += 1
        it = {'id': iid, 'dir': path, 'fsobj': fsobj, 'author': author, 'editor': author, 'created': utc_iso(self.clock),
              'version': 1, 'f': fields}
        lst['items'][iid] = it
        return it

    def _find_folder(self, lst, d, leaf):
        return next((x for x in lst['items'].values() if x['fsobj'] == 1 and x['dir'] == d and x['f'].get('Title') == leaf), None)

    def _folder_exists(self, lst, path):
        if path == '':
            return True
        d, _, leaf = path.rpartition('/')
        return self._find_folder(lst, d, leaf) is not None

    def _file_dir(self, lst, it):
        return lst['root'] + ('/' + it['dir'] if it['dir'] else '')

    def _out(self, lst, it, select, meta):
        o = {}
        for name in select:
            if '/' in name:
                # a projected lookup column (needs $expand in the real API): Competency/CompetencyKey
                look, _, col = name.partition('/')
                f = lst['fields'].get(look)
                if f is None or f['type'] != 'Lookup':
                    fail(400, "The field or property '{0}' does not exist.".format(look))
                target = self.by_key[f['lookup']]['items'].get(it['f'].get(look + 'Id'))
                o.setdefault(look, {})[col] = (target['id'] if col == 'Id' else target['f'].get(col)) if target else None
                continue
            if name in ('Id', 'ID'):
                o[name] = it['id']
            elif name == 'FileDirRef':
                o[name] = self._file_dir(lst, it)
            elif name == 'FileRef':
                o[name] = self._file_dir(lst, it) + '/' + (it['f'].get('Title') if it['fsobj'] else '{0}_.000'.format(it['id']))
            elif name == 'FSObjType':
                o[name] = it['fsobj']
            elif name == 'AuthorId':
                o[name] = it['author']
            elif name == 'Created':
                o[name] = it['created']
            else:
                base = name[:-2] if name.endswith('Id') and name[:-2] in lst['fields'] else name
                f = lst['fields'].get(base)
                if f is None:
                    fail(400, "The field or property '{0}' does not exist.".format(name))
                v = it['f'].get(name if f['type'] in ('Lookup', 'User', 'LookupMulti') and name.endswith('Id') else base)
                if f['type'] == 'Number' and v is not None:
                    v = float(v)
                o[name] = v
        if meta:
            o['odata.etag'] = '"{0},{1}"'.format(it['id'], it['version'])
        return o

    # ------------------------------------------------------------------ connector
    def __call__(self, api, op, p):
        assert api == 'shared_sharepointonline', api
        if p.get('dataset') != SITE:
            fail(400, 'wrong site ' + str(p.get('dataset')))
        assert op == 'HttpRequest', op
        return self.rest(p['parameters/method'], p['parameters/uri'], p.get('parameters/headers') or {}, p.get('parameters/body'))

    def _write(self, method, path):
        self.writes.append((method, path))
        if self.fail_at is not None and len(self.writes) == self.fail_at:
            fail(500, 'simulated interruption at write {0}'.format(self.fail_at))

    def rest(self, method, uri, headers, body):
        self.calls.append((method, uri))
        if not uri.startswith('_api/'):
            fail(400, 'uri must start with _api/: ' + uri)
        path, _, qs = uri.partition('?')
        params = {}
        for part in qs.split('&') if qs else []:
            k, _, v = part.partition('=')
            params[k] = unquote(v)
        meta = 'minimalmetadata' in headers.get('Accept', '')
        if method == 'GET' and path == '_api/web/lists':
            return {'value': [{'Id': l['Id'], 'Title': l['Title'], 'RootFolder': {'Name': l['url'], 'ServerRelativeUrl': l['root']}}
                              for l in self.lists.values()]}
        if method == 'GET' and path == '_api/web/currentuser':
            return {'Id': self.me}
        m = re.match(r'^_api/web/getuserbyid\((\d+)\)$', path)
        if method == 'GET' and m:
            u = self.users.get(int(m.group(1)))
            if not u:
                fail(404, 'User cannot be found.')
            return {'LoginName': u['LoginName']}
        m = re.match(r"^_api/web/GetFolderByServerRelativePath\(decodedurl='((?:[^']|'')*)'\)(/ListItemAllFields)?$", path)
        if method == 'GET' and m:
            url = m.group(1).replace("''", "'")
            for lst in self.lists.values():
                if url.startswith(lst['root'] + '/'):
                    d, _, leaf = url[len(lst['root']) + 1:].rpartition('/')
                    fold = self._find_folder(lst, d, leaf)
                    if fold and m.group(2):
                        return {'Id': fold['id'], 'AuthorId': fold['author'], 'FileSystemObjectType': 1}
                    if fold:
                        return {'Exists': True}
            if m.group(2):
                fail(404, 'File Not Found.')
            return {'Exists': False}
        m = re.match(r"^_api/web/siteusers$", path)
        if method == 'GET' and m:
            ids = [int(x) for x in re.findall(r'Id eq (\d+)', params.get('$filter', ''))]
            return {'value': [{'Id': u['Id'], 'LoginName': u['LoginName']} for uid, u in sorted(self.users.items()) if uid in ids]}
        # lists by their web address, as the flow reaches them
        m = re.match(r"^_api/web/GetList\('((?:[^']|'')*)'\)(/.*)?$", path)
        lst = next((l for l in self.lists.values() if m and l['root'] == m.group(1).replace("''", "'")), None)
        if not lst:
            fail(404, 'List does not exist: ' + path)
        rest = m.group(2) or ''
        select = [s for s in params.get('$select', 'Id').split(',') if s]
        for c in select:
            if '/' in c and c.split('/')[0] not in params.get('$expand', '').split(','):
                fail(400, 'The query to field \'{0}\' is not valid. The $select query string must specify the target fields and the $expand query string must contains {1}.'.format(c, c.split('/')[0]))
        if method == 'GET' and rest == '/items':
            rows = [it for it in lst['items'].values() if self._matches(lst, it, params.get('$filter'))]
            return {'value': [self._out(lst, it, select, meta) for it in sorted(rows, key=lambda x: x['id'])]}
        m = re.match(r'^/items\((\d+)\)$', rest)
        if m:
            it = lst['items'].get(int(m.group(1)))
            if method == 'GET':
                if not it:
                    fail(404, 'Item does not exist. It may have been deleted by another user.')
                return self._out(lst, it, select, meta)
            if method == 'POST' and headers.get('X-HTTP-Method') == 'MERGE':
                self._write('MERGE', lst['Title'] + rest)
                if not it:
                    fail(404, 'Item does not exist.')
                match = headers.get('IF-MATCH', '*')
                if match != '*' and match != '"{0},{1}"'.format(it['id'], it['version']):
                    fail(412, 'The request ETag value does not match the object\'s ETag value.')
                data = json.loads(body)
                for k, v in data.items():
                    self._set_rest(lst, it, k, v)
                it['version'] += 1
                it['editor'] = self.me
                return {}
        if method == 'POST' and rest == '/AddValidateUpdateItemUsingPath':
            self._write('ADD', lst['Title'])
            return self._add_validate(lst, json.loads(body))
        fail(400, 'not simulated: {0} {1}'.format(method, uri))

    # ------------------------------------------------------------------ filters
    def _matches(self, lst, it, flt):
        if not flt:
            return True
        for clause in re.split(r'\s+and\s+', flt):
            m = re.match(r"^(\w+) eq (?:'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?))$", clause.strip())
            if not m:
                fail(400, 'filter not simulated: ' + clause)
            col, s, n = m.group(1), m.group(2), m.group(3)
            want = s.replace("''", "'") if s is not None else float(n)
            if col in ('Id', 'ID'):
                have = it['id']
            elif col == 'FSObjType':
                have = it['fsobj']
            elif col == 'FileRef':
                have = self._out(lst, it, ['FileRef'], False)['FileRef']
            elif col == 'AuthorId':
                have = it['author']
            else:
                base = col[:-2] if col.endswith('Id') and col[:-2] in lst['fields'] else col
                f = lst['fields'].get(base)
                if f is None:
                    fail(400, 'Column in filter does not exist: ' + col)
                have = it['f'].get(col if f['type'] in ('Lookup', 'User') else base)
                if f['type'] == 'Boolean':
                    want = bool(want)
            if isinstance(want, float):
                if have is None or float(have) != want:
                    return False
            elif have != want:
                return False
        return True

    # ------------------------------------------------------------------ writes
    def _set_rest(self, lst, it, k, v):
        base = k[:-2] if k.endswith('Id') and k[:-2] in lst['fields'] else k
        f = lst['fields'].get(base)
        if f is None:
            fail(400, "The property '{0}' does not exist on type 'SP.Data.{1}ListItem'.".format(k, lst['url']))
        t = f['type']
        if v is None:
            it['f'][k if t in ('Lookup', 'User') else base] = None
            return
        if t in ('Lookup', 'User'):
            if k == base:
                fail(400, 'A lookup or person column is written as ' + base + 'Id')
            it['f'][k] = int(v)
            return
        if t == 'Number':
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                fail(400, '{0} expects a number, got {1!r}'.format(k, v))
        elif t == 'Boolean':
            if not isinstance(v, bool):
                fail(400, '{0} expects true or false, got {1!r}'.format(k, v))
        elif t in ('DateOnly', 'DateTime'):
            if not re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$', str(v)):
                fail(400, '{0}: not a date: {1!r}'.format(k, v))
            v = utc_iso(datetime.fromisoformat(str(v)[:19] + '+00:00'))
        elif t == 'Choice':
            if v not in f['choices']:
                fail(400, '{0}: {1!r} is not one of the choices'.format(k, v))
        else:
            v = str(v)
            if t == 'Text' and len(v) > int(f.get('max', 255)):
                fail(400, '{0}: text too long'.format(k))
        self._check_unique(lst, it, base, v)
        it['f'][base] = v

    def _check_unique(self, lst, it, name, v):
        f = lst['fields'][name]
        if f.get('unique') and v not in (None, ''):
            for o in lst['items'].values():
                if o is not it and o['f'].get(name) == v:
                    fail(400, 'duplicate value in unique column ' + name)

    def _form_value(self, lst, name, text):
        """validateUpdate semantics: (stored name, value) or raises ValueError with SharePoint's kind of message."""
        f = lst['fields'].get(name)
        if f is None:
            raise ValueError("Column '{0}' does not exist. It may have been deleted by another user.".format(name))
        t = f['type']
        if text == '':
            return (name + 'Id' if t in ('Lookup', 'User') else name), None
        if t == 'Number':
            return name, float(text)
        if t == 'Boolean':
            if text not in ('0', '1'):
                raise ValueError('Enter 0 or 1.')
            return name, text == '1'
        if t in ('DateOnly', 'DateTime'):
            m = re.match(r'^(\d{2})/(\d{2})/(\d{4})(?: (\d{2}):(\d{2}))?$', text)
            if not m:
                raise ValueError('The date is not in the site\'s format (dd/MM/yyyy).')
            local = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), int(m.group(4) or 0), int(m.group(5) or 0), tzinfo=UK)
            return name, utc_iso(local)
        if t == 'Choice':
            if text not in f['choices']:
                raise ValueError('Invalid choice: ' + text)
            return name, text
        if t == 'Lookup':
            return name + 'Id', int(text)
        if t == 'User':
            key = json.loads(text)[0]['Key']
            u = next((u for u in self.users.values() if u['LoginName'] == key), None)
            if not u:
                raise ValueError('The user does not exist or is not unique.')
            return name + 'Id', u['Id']
        if t == 'Text' and len(text) > int(f.get('max', 255)):
            raise ValueError('The value is too long.')
        return name, text

    def _add_validate(self, lst, body):
        info = body['listItemCreateInfo']
        url = info['FolderPath']['DecodedUrl']
        if not (url == lst['root'] or url.startswith(lst['root'] + '/')):
            fail(400, 'The folder is not in this list: ' + url)
        path = url[len(lst['root']) + 1:] if url != lst['root'] else ''
        if not self._folder_exists(lst, path):
            fail(404, 'File Not Found: ' + url)
        results, vals = [], {}
        for fv in body.get('formValues', []):
            try:
                k, v = self._form_value(lst, fv['FieldName'], fv['FieldValue'])
                vals[k] = v
                results.append({'FieldName': fv['FieldName'], 'FieldValue': fv['FieldValue'], 'HasException': False, 'ErrorMessage': None})
            except ValueError as e:
                results.append({'FieldName': fv['FieldName'], 'FieldValue': fv['FieldValue'], 'HasException': True, 'ErrorMessage': str(e)})
        folder = info.get('UnderlyingObjectType') == 1
        if folder:
            leaf = info['LeafName']['DecodedUrl']
            if self._find_folder(lst, path, leaf):
                results.append({'FieldName': 'FileLeafRef', 'HasException': True, 'ErrorMessage': 'A file or folder with the name already exists.'})
        else:
            for name, f in lst['fields'].items():
                key = name + 'Id' if f['type'] in ('Lookup', 'User') else name
                if f.get('required') and vals.get(key) in (None, '') and 'default' not in f:
                    results.append({'FieldName': name, 'HasException': True, 'ErrorMessage': 'You must specify a value for this required field.'})
            for name, f in lst['fields'].items():
                if f.get('unique') and vals.get(name) not in (None, '') and any(o['f'].get(name) == vals[name] for o in lst['items'].values()):
                    results.append({'FieldName': name, 'HasException': True, 'ErrorMessage': 'This value must be unique.'})
        if any(r['HasException'] for r in results):
            return {'value': results}
        for name, f in lst['fields'].items():
            if 'default' in f and name not in vals:
                d = f['default']
                vals[name] = {'Boolean': lambda x: x in ('1', 1, True), 'Number': float}.get(f['type'], lambda x: x)(d)
        it = self._new(lst, path, {'Title': info['LeafName']['DecodedUrl']} if folder else vals, fsobj=1 if folder else 0, author=self.me)
        if self.return_new_id:
            results.append({'FieldName': 'Id', 'FieldValue': str(it['id']), 'HasException': False, 'ErrorMessage': None})
        return {'value': results}
