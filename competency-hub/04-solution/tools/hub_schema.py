"""The Competency Hub lists, read from schema.json – the same file Setup builds the site from, so the flows, the
validator and the fake SharePoint can only name columns that Setup actually creates."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = json.load(open(os.path.join(HERE, '..', 'schema', 'schema.json'), encoding='utf-8'))

BUILT_IN = {'Title', 'ID', 'Id', 'Created', 'Modified', 'Author', 'AuthorId', 'Editor', 'EditorId', 'FileDirRef', 'FileRef',
            'FileLeafRef', 'FSObjType', 'HasUniqueRoleAssignments', 'Attachments'}


def _fields(l):
    out = list(l['fields'])
    if l.get('standard'):
        out = list(SCHEMA['standardColumns']) + out
    return out


LISTS = [{'key': l['key'], 'title': l['title'], 'url': l['url'], 'template': l['template'], 'fields': _fields(l),
          'titleUnique': bool(l.get('titleUnique'))} for l in SCHEMA['lists']]
BY_KEY = {l['key']: l for l in LISTS}


def rest_names(f):
    """The names REST uses for a column: lookups and people are read and written as <Name>Id."""
    return {f['name'], f['name'] + 'Id'} if f['type'] in ('Lookup', 'LookupMulti', 'User') else {f['name']}


LIST_FIELDS = {l['title']: BUILT_IN | set().union(*[rest_names(f) for f in l['fields']]) for l in LISTS}
AREAS = SCHEMA['areas']
