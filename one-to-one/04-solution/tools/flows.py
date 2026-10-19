"""ESG 1-to-1 – the four cloud flows, generated as Power Automate solution flow definitions.

Shape copied from real exported solution flows (Microsoft PnP samples): properties.connectionReferences +
properties.definition (Logic Apps workflow definition language), OpenApiConnection actions with
host.connectionName / operationId / apiId, environment variables as definition parameters.

Nothing tenant-specific is in here. The site and the Team Leader's email are environment variables set at
import; group and permission-level IDs are looked up at run time.
"""
import json
from schema import LISTS, ROLES, GROUP_TITLE, GROUP_DESCRIPTION, DEFAULT_BANDS, DEFAULT_REMINDERS

# --------------------------------------------------------------------------------------------- constants
SP_API = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
MAIL_API = '/providers/Microsoft.PowerApps/apis/shared_office365'
USERS_API = '/providers/Microsoft.PowerApps/apis/shared_office365users'
CONN = {
    'shared_sharepointonline': 'esg_sharedsharepointonline_1to1',
    'shared_office365': 'esg_sharedoffice365_1to1',
    'shared_office365users': 'esg_sharedoffice365users_1to1',
}
ENV_SITE = 'ESG 1-to-1 Site URL (esg_SiteUrl)'
ENV_MAIL = 'ESG 1-to-1 Team Leader email (esg_ManagerEmail)'
ENV_VARS = [
    {'schema': 'esg_SiteUrl', 'param': ENV_SITE, 'display': 'ESG 1-to-1 Site URL',
     'description': 'Full address of the private 1-to-1 site, e.g. https://<tenant>.sharepoint.com/sites/<site> (no trailing slash).'},
    {'schema': 'esg_ManagerEmail', 'param': ENV_MAIL, 'display': 'ESG 1-to-1 Team Leader email',
     'description': "The Team Leader's email address. Receives submissions and problem reports."},
]
SITE = "parameters('{0}')".format(ENV_SITE)
TL_EMAIL = "parameters('{0}')".format(ENV_MAIL)
PAGE = "concat(if(endsWith({0}, '/'), substring({0}, 0, sub(length({0}), 1)), {0}), '/SitePages/OneToOne.aspx')".format(SITE)
SECURE = {'secureData': {'properties': ['inputs', 'outputs']}}
OK = ['Succeeded']
FAILED = ['Failed', 'TimedOut']
# Tolerate the predecessor's OWN failure only. Never include 'Skipped': a skipped predecessor means something
# upstream failed, and running on would hide that failure (Logic Apps would then report the run as Succeeded).
TOLERANT = ['Succeeded', 'Failed', 'TimedOut']
OK_OR_SKIPPED = ['Succeeded', 'Skipped']
RUN_LINK = ("concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], "
            "'/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])")
LIST_TITLE = {l['key']: l['title'] for l in LISTS}
MR = LIST_TITLE['reviews']
MGR = LIST_TITLE['mgr']
WB = LIST_TITLE['wellbeing']
FB = LIST_TITLE['feedback']
AM = LIST_TITLE['amend']
SETTINGS = LIST_TITLE['settings']


def q(s):
    """Quote a literal for use inside an expression."""
    return "'" + s.replace("'", "''") + "'"


# --------------------------------------------------------------------------------------------- builders
def seq(*steps, first_after=None):
    """Chain (name, action) pairs: each runs after the previous one succeeded (unless runAfter is set)."""
    out, prev = {}, first_after
    for name, act in steps:
        act = dict(act)
        if 'runAfter' not in act:
            act['runAfter'] = {prev: OK} if prev else {}
        out[name] = act
        prev = name
    return out


def after(act, run_after):
    act = dict(act)
    act['runAfter'] = run_after
    return act


def _conn(conn, api, op, params, secure):
    a = {'type': 'OpenApiConnection',
         'inputs': {'host': {'connectionName': conn, 'operationId': op, 'apiId': api},
                    'parameters': params, 'authentication': "@parameters('$authentication')"}}
    if secure:
        a['runtimeConfiguration'] = SECURE
    return a


def sp(op, params, secure=True):
    p = {'dataset': '@' + SITE}
    p.update(params)
    return _conn('shared_sharepointonline', SP_API, op, p, secure)


def http(method, uri, body=None, verbose=False, headers=None, secure=True):
    h = {'Accept': 'application/json;odata=nometadata'}
    if body is not None:
        h['Content-Type'] = 'application/json;odata=verbose' if verbose else 'application/json;odata=nometadata'
    h.update(headers or {})
    p = {'parameters/method': method, 'parameters/uri': uri, 'parameters/headers': h}
    if body is not None:
        p['parameters/body'] = body
    return sp('HttpRequest', p, secure)


def merge(uri, body, verbose=True):
    return http('POST', uri, body, verbose=verbose, headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}, secure=False)


def delete(uri):
    """Documented REST form: POST with X-HTTP-Method DELETE."""
    return http('POST', uri, headers={'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*'}, secure=False)


def get_items(table, flt=None, top=None, order=None):
    p = {'table': table}
    if flt:
        p['$filter'] = flt
    if order:
        p['$orderby'] = order
    if top:
        p['$top'] = top
    return sp('GetItems', p)


def patch_item(table, item_id, fields):
    p = {'table': table, 'id': item_id}
    p.update({'item/' + k: v for k, v in fields.items()})
    return sp('PatchItem', p)


def post_item(table, fields):
    p = {'table': table}
    p.update({'item/' + k: v for k, v in fields.items()})
    return sp('PostItem', p)


def email(to, subject, body, cc=None):
    p = {'emailMessage/To': to, 'emailMessage/Subject': subject, 'emailMessage/Body': body, 'emailMessage/Importance': 'Normal'}
    if cc:
        p['emailMessage/Cc'] = cc
    return _conn('shared_office365', MAIL_API, 'SendEmailV2', p, True)


def user_profile(email_expr):
    return _conn('shared_office365users', USERS_API, 'UserProfile_V2', {'id': email_expr}, True)


def compose(value, secure=False):
    a = {'type': 'Compose', 'inputs': value}
    if secure:   # a Compose's output is its input, so securing the inputs hides both in run history
        a['runtimeConfiguration'] = {'secureData': {'properties': ['inputs']}}
    return a


def init_var(name, typ, value=None):
    v = {'name': name, 'type': typ}
    if value is not None:
        v['value'] = value
    return {'type': 'InitializeVariable', 'inputs': {'variables': [v]}}


def set_var(name, value):
    return {'type': 'SetVariable', 'inputs': {'name': name, 'value': value}}


def append(name, value):
    return {'type': 'AppendToArrayVariable', 'inputs': {'name': name, 'value': value}}


def cond(expression, yes=None, no=None):
    a = {'type': 'If', 'expression': expression, 'actions': yes or {}}
    a['else'] = {'actions': no or {}}
    return a


def foreach(items, actions):
    return {'type': 'Foreach', 'foreach': items, 'actions': actions,
            'runtimeConfiguration': {'concurrency': {'repetitions': 1}}}


def scope(actions):
    return {'type': 'Scope', 'actions': actions}


def query(frm, where, secure=False):
    a = {'type': 'Query', 'inputs': {'from': frm, 'where': where}}
    if secure:
        a['runtimeConfiguration'] = SECURE
    return a


def select(frm, mapping, secure=False):
    a = {'type': 'Select', 'inputs': {'from': frm, 'select': mapping}}
    if secure:
        a['runtimeConfiguration'] = SECURE
    return a


def idstr(expr):
    """A SharePoint Number column (e.g. ReviewItemId) arrives as a double such as 12.0 – take the whole-number text."""
    return "first(split(string(coalesce(" + expr + ", '')), '.'))"


def idnum(expr):
    return 'int(' + idstr(expr) + ')'


def join(*names):
    """No-op step after a 'log on success / warn on failure' pair. Logic Apps takes a branch that ends in a Skipped
    action from that action's predecessor, so without this join a handled failure would still fail the run."""
    return {'type': 'Compose', 'inputs': 'done', 'runAfter': {n: ['Succeeded', 'Skipped'] for n in names}}


def terminate(status, message=None):
    i = {'runStatus': status}
    if status == 'Failed':
        i['runError'] = {'code': 'ESG1to1', 'message': message or 'See the run history.'}
    return {'type': 'Terminate', 'inputs': i}


def catch(flow_name, subject=None):
    return after(scope(seq(
        ('Email_TL_run_failed', email('@' + TL_EMAIL,
                                      subject or '1-to-1 system: action needed ({0})'.format(flow_name),
                                      '<p>The flow <b>{0}</b> failed. Nothing further was sent for this run.</p>'
                                      '<p><a href="@{{{1}}}">Open the failed run</a></p>'.format(flow_name, RUN_LINK))),
        ('Terminate_failed', terminate('Failed', 'The Try scope failed. See the failed action in the run history.')),
    )), {'Try': FAILED})


def definition(triggers, actions):
    params = {'$connections': {'defaultValue': {}, 'type': 'Object'},
              '$authentication': {'defaultValue': {}, 'type': 'SecureObject'}}
    for ev in ENV_VARS:
        params[ev['param']] = {'defaultValue': '', 'type': 'String',
                               'metadata': {'schemaName': ev['schema'], 'description': ev['description']}}
    return {'$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
            'contentVersion': '1.0.0.0', 'parameters': params, 'triggers': triggers, 'actions': actions}


def flow_json(defn, connectors):
    refs = {}
    for c in connectors:
        refs[c] = {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': CONN[c]},
                   'api': {'name': c}}
    return {'properties': {'connectionReferences': refs, 'definition': defn},
            'schemaVersion': '1.0.0.0'}


# --------------------------------------------------------------------------------------------- shared blocks
def load_ids():
    """Look up the Owners group and role IDs at run time (no IDs to copy by hand)."""
    roles = "body('Get_role_definitions')?['value']"
    return [
        ('Get_owners_group', http('GET', '_api/web/associatedownergroup?$select=Id,Title', secure=False)),
        ('Get_role_definitions', http('GET', '_api/web/roledefinitions?$select=Id,Name,RoleTypeKind', secure=False)),
        ('Role_full_control', query('@' + roles, "@equals(item()?['RoleTypeKind'], 5)")),
        ('Role_edit', query('@' + roles, "@equals(item()?['Name'], '1-to-1 Edit')")),
        ('Role_read', query('@' + roles, "@equals(item()?['Name'], '1-to-1 Read')")),
        ('Role_submit', query('@' + roles, "@equals(item()?['Name'], '1-to-1 Submit')")),
        ('Get_lists', http('GET', '_api/web/lists?$select=Id,Title,ListItemEntityTypeFullName,RootFolder/Name,RootFolder/ServerRelativeUrl'
                                  '&$expand=RootFolder', secure=False)),
        ('List_monthly_reviews', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'MonthlyReviews')")),
        ('List_manager_reviews', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'ManagerReviews')")),
        ('Ids', compose({'owners': "@body('Get_owners_group')?['Id']",
                         'fullControl': "@first(body('Role_full_control'))?['Id']",
                         'edit': "@first(body('Role_edit'))?['Id']",
                         'read': "@first(body('Role_read'))?['Id']",
                         'submit': "@first(body('Role_submit'))?['Id']",
                         'reviewsList': "@first(body('List_monthly_reviews'))?['Id']",
                         'mgrList': "@first(body('List_manager_reviews'))?['Id']"})),
        ('Check_setup_has_run', cond(
            "@or(equals(outputs('Ids')?['owners'], null), equals(outputs('Ids')?['fullControl'], null), "
            "equals(outputs('Ids')?['edit'], null), equals(outputs('Ids')?['read'], null), "
            "equals(outputs('Ids')?['reviewsList'], null), equals(outputs('Ids')?['mgrList'], null))",
            seq(('STOP_run_the_setup_flow_first',
                 compose("@int('The 1-to-1 permission levels or Owners group were not found. Run ESG 1-to-1 | 0 Setup first.')"))))),
    ]


def ensure_user(name, claims_expr):
    return (name, http('POST', '_api/web/ensureuser', '{"logonName":"@{' + claims_expr + '}"}'))


def setperm(suffix, list_key, item_expr, role_expr, principal_expr, ids='Ids'):
    """list_key: 'reviewsList' or 'mgrList' – the list GUID looked up by load_ids() (or 'wbList' in WbIds)."""
    base = "_api/web/lists(guid'@{{outputs('{2}')?['{0}']}}')/items(@{{{1}}})".format(list_key, item_expr, ids)
    return [
        ('Reset' + suffix, http('POST', base + '/resetroleinheritance')),
        ('Break' + suffix, http('POST', base + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')),
        ('AddOwners' + suffix, http('POST', base + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                                   "roledefid=@{outputs('Ids')?['fullControl']})")),
        ('AddTech' + suffix, http('POST', base + '/roleassignments/addroleassignment(principalid=@{' + principal_expr +
                                  '},roledefid=@{' + role_expr + '})')),
    ]


def wblink(item_id_expr):
    """Page link that opens a wellbeing assessment (?wbId=)."""
    i = idstr(item_id_expr)
    return '@{concat(' + PAGE + ", if(empty(" + i + "), '', concat('?wbId=', " + i + ')))}'


def local_date(expr):
    """A date-only column as yyyy-MM-dd, whether the connector returns 'yyyy-MM-dd' or a UTC instant."""
    return ("if(contains(string(coalesce(" + expr + ", '')), 'T'), formatDateTime(convertFromUtc(coalesce(" + expr +
            ", '2000-01-01T00:00:00Z'), 'GMT Standard Time'), 'yyyy-MM-dd'), coalesce(" + expr + ", ''))")


def link(review_id_expr):
    """Page link for a Monthly Review id; just the page if the id is missing. Safe if if() evaluates both branches."""
    i = idstr(review_id_expr)
    return '@{concat(' + PAGE + ", if(empty(" + i + "), '', concat('?reviewId=', " + i + ')))}'


# --------------------------------------------------------------------------------------------- Flow 0: setup
def flow_setup():
    L = "items('Each_list')"
    LID = "outputs('List')?['Id']"
    LBASE = "_api/web/lists(guid'@{" + LID + "}')"
    W = 'varWarnings'
    G = 'varLog'

    def warn(msg_expr):
        return append(W, msg_expr)

    # roles
    role_steps = foreach("@outputs('Role_settings')", seq(
        ('Role_existing', query("@body('Get_roles')?['value']", "@equals(item()?['Name'], items('Each_role')?['name'])")),
        ('Role_missing', cond("@empty(body('Role_existing'))",
            seq(
                ('Create_role', http('POST', '_api/web/roledefinitions',
                                     '{"__metadata":{"type":"SP.RoleDefinition"},"BasePermissions":{"__metadata":{"type":"SP.BasePermissions"},'
                                     '"High":"@{items(\'Each_role\')?[\'high\']}","Low":"@{items(\'Each_role\')?[\'low\']}"},'
                                     '"Description":"@{items(\'Each_role\')?[\'description\']}","Name":"@{items(\'Each_role\')?[\'name\']}",'
                                     '"Order":@{items(\'Each_role\')?[\'order\']}}', verbose=True, secure=False)),
                ('Log_role_created', append(G, "@concat('Created permission level ', items('Each_role')?['name'])")),
            ),
            seq(
                ('Role_matches', cond(
                    "@and(equals(string(first(body('Role_existing'))?['BasePermissions']?['Low']), string(items('Each_role')?['low'])), "
                    "equals(string(first(body('Role_existing'))?['BasePermissions']?['High']), string(items('Each_role')?['high'])))",
                    seq(('Log_role_ok', append(G, "@concat('Permission level ', items('Each_role')?['name'], ' already exists with the expected rights')"))),
                    seq(('Warn_role_differs', warn("@concat('Permission level ', items('Each_role')?['name'], "
                                                    "' already exists but its rights differ from the plan (D.3). It was NOT changed. Compare it with G Part 2.')"))))),
            ))),
    ))

    # one list
    each_field = foreach("@body('Missing_fields')", {
        'Create_field': after(http('POST', LBASE + '/fields/createfieldasxml',
                                   '{"parameters":{"__metadata":{"type":"SP.XmlSchemaFieldCreationInformation"},'
                                   '"SchemaXml":"@{items(\'Each_field\')?[\'xml\']}","Options":28}}', verbose=True, secure=False), {}),
        'Log_field': after(append(G, "@concat('Added column ', items('Each_field')?['name'], ' to ', " + L + "?['title'])"),
                           {'Create_field': OK}),
        'Warn_field': after(warn("@concat('Could not add column ', items('Each_field')?['name'], ' to ', " + L + "?['title'], "
                                 "' – add it by hand (01-sharepoint/lists.md).')"), {'Create_field': FAILED}),
        'Field_done': join('Log_field', 'Warn_field'),
    })
    each_index = foreach("@body('Indexed_fields')", {
        'Set_index': after(merge(LBASE + "/fields/getbyinternalnameortitle('@{items('Each_index')?['name']}')",
                                 '{"Indexed":true}', verbose=False), {}),
        'Is_unique': after(cond("@equals(items('Each_index')?['unique'], true)", {
            'Set_unique': after(merge(LBASE + "/fields/getbyinternalnameortitle('@{items('Each_index')?['name']}')",
                                      '{"EnforceUniqueValues":true}', verbose=False), {}),
            'Warn_unique': after(warn("@concat('Could not set Enforce unique values on ', items('Each_index')?['name'], "
                                      "' in ', " + L + "?['title'], ' – set it by hand.')"), {'Set_unique': FAILED}),
        }), {'Set_index': OK}),
        'Warn_index': after(warn("@concat('Could not index ', items('Each_index')?['name'], ' in ', " + L + "?['title'], "
                                 "' – add the index by hand.')"), {'Set_index': FAILED}),
        'Index_done': join('Is_unique', 'Warn_index'),
    })
    each_view = foreach("@body('Missing_views')", {
        'Create_view': after(http('POST', LBASE + '/views/add',
                                  '{"parameters":{"__metadata":{"type":"SP.ViewCreationInformation"},"Title":"@{items(\'Each_view\')?[\'title\']}",'
                                  '"ViewFields":{"__metadata":{"type":"Collection(Edm.String)"},"results":@{string(items(\'Each_view\')?[\'fields\'])}},'
                                  '"Query":"@{items(\'Each_view\')?[\'query\']}","RowLimit":@{items(\'Each_view\')?[\'rowLimit\']},'
                                  '"Paged":true,"PersonalView":false,"SetAsDefaultView":false}}', verbose=True, secure=False), {}),
        'Log_view': after(append(G, "@concat('Created view ', items('Each_view')?['title'], ' on ', " + L + "?['title'])"),
                          {'Create_view': OK}),
        'Warn_view': after(warn("@concat('Could not create view ', items('Each_view')?['title'], ' on ', " + L + "?['title'], "
                                "' – create it by hand (01-sharepoint/lists.md).')"), {'Create_view': FAILED}),
        'View_done': join('Log_view', 'Warn_view'),
    })
    lists_uri = ('_api/web/lists?$select=Id,Title,HasUniqueRoleAssignments,ListItemEntityTypeFullName,MajorVersionLimit,'
                 'RootFolder/Name,RootFolder/ServerRelativeUrl&$expand=RootFolder')
    match = "@equals(item()?['RootFolder']?['Name'], " + L + "?['url'])"   # by URL only – the flows rely on these URLs
    clash = "@and(equals(item()?['Title'], " + L + "?['title']), not(equals(item()?['RootFolder']?['Name'], " + L + "?['url'])))"
    each_list = foreach("@outputs('Schema')", seq(
        ('Get_lists', http('GET', lists_uri, secure=False)),
        ('Find_list', query("@body('Get_lists')?['value']", match)),
        ('Title_clash', query("@body('Get_lists')?['value']", clash)),
        ('Title_in_use', cond("@not(empty(body('Title_clash')))", seq(
            ('Warn_title_clash', warn("@concat('Another list at /Lists/', first(body('Title_clash'))?['RootFolder']?['Name'], "
                                      "' is already called \"', " + L + "?['title'], '\". Rename or delete it, then re-run setup.')")),
        ))),
        ('List_missing', cond("@empty(body('Find_list'))", seq(
            ('Create_list', http('POST', '_api/web/lists',
                                 '{"__metadata":{"type":"SP.List"},"AllowContentTypes":true,"BaseTemplate":100,"ContentTypesEnabled":false,'
                                 '"Description":"@{items(\'Each_list\')?[\'description\']}","Title":"@{items(\'Each_list\')?[\'url\']}"}',
                                 verbose=True, secure=False)),
            ('Log_list_created', append(G, "@concat('Created list ', " + L + "?['title'])")),
        ), seq(
            ('Log_list_exists', append(G, "@concat('List ', " + L + "?['title'], ' already exists – checked and completed')")),
        ))),
        ('Get_lists_again', http('GET', lists_uri, secure=False)),
        ('Find_list_again', query("@body('Get_lists_again')?['value']", match)),
        ('List', compose("@first(body('Find_list_again'))")),
        ('Set_list_settings', merge(LBASE,
                                    '{"__metadata":{"type":"SP.List"},"Title":"@{items(\'Each_list\')?[\'title\']}",'
                                    '"Description":"@{items(\'Each_list\')?[\'description\']}","EnableVersioning":true,'
                                    '"MajorVersionLimit":@{max(100, int(' + idstr("outputs('List')?['MajorVersionLimit']") + '))},'
                                    '"EnableAttachments":false,"NoCrawl":true,"OnQuickLaunch":false,'
                                    # item-level security: 2 = only their own items (feedback list); 1 = all items (default)
                                    '"ReadSecurity":@{coalesce(items(\'Each_list\')?[\'readSecurity\'], 1)},'
                                    '"WriteSecurity":@{coalesce(items(\'Each_list\')?[\'writeSecurity\'], 1)},'
                                    # 1.5 Action Updates: one folder per technician (Flow 9 creates them)
                                    '"EnableFolderCreation":@{if(equals(items(\'Each_list\')?[\'folders\'], true), \'true\', \'false\')}}')),
        ('Set_offline_off', after(merge(LBASE, '{"__metadata":{"type":"SP.List"},"ExcludeFromOfflineClient":true}'),
                                  {'Set_list_settings': TOLERANT})),
        ('Warn_settings', after(warn("@concat(" + L + "?['title'], ': could not apply list settings – set versioning 100, attachments off, "
                                     "search off by hand.')"), {'Set_list_settings': FAILED})),
        ('Warn_offline', after(warn("@concat(" + L + "?['title'], ': set Advanced settings → Offline client availability = No by hand.')"),
                               {'Set_offline_off': FAILED})),
        ('Get_fields', after(http('GET', LBASE + '/fields?$select=InternalName', secure=False),
                             {'Set_offline_off': TOLERANT, 'Warn_settings': OK_OR_SKIPPED, 'Warn_offline': OK_OR_SKIPPED})),
        ('Field_names', select("@body('Get_fields')?['value']", "@item()?['InternalName']")),
        ('Missing_fields', query('@' + L + "?['fields']", "@not(contains(body('Field_names'), item()?['name']))")),
        ('Each_field', each_field),
        ('Indexed_fields', query('@' + L + "?['fields']", "@equals(item()?['indexed'], true)")),
        ('Each_index', each_index),
        ('Get_views', http('GET', LBASE + '/views?$select=Title', secure=False)),
        ('View_titles', select("@body('Get_views')?['value']", "@item()?['Title']")),
        ('Missing_views', query('@' + L + "?['views']", "@not(contains(body('View_titles'), item()?['title']))")),
        ('Each_view', each_view),
        ('Inherits_permissions', cond("@equals(outputs('List')?['HasUniqueRoleAssignments'], false)", seq(
            ('Break_list_inheritance', http('POST', LBASE + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)',
                                            secure=False)),
            ('Log_break', append(G, "@concat(" + L + "?['title'], ': stopped inheriting permissions')")),
        ))),
        ('Get_role_assignments', http('GET', LBASE + '/roleassignments?$select=PrincipalId', secure=False)),
        ('Principals', select("@body('Get_role_assignments')?['value']", "@item()?['PrincipalId']")),
        ('Members_group_has_access', cond("@contains(body('Principals'), outputs('Ids')?['members'])", seq(
            ('Remove_members_group', delete(LBASE + "/roleassignments/getbyprincipalid(@{outputs('Ids')?['members']})")),
            ('Log_members_removed', append(G, "@concat(" + L + "?['title'], ': removed the site Members group')")),
        ))),
        ('Visitors_group_has_access', cond("@contains(body('Principals'), outputs('Ids')?['visitors'])", seq(
            ('Remove_visitors_group', delete(LBASE + "/roleassignments/getbyprincipalid(@{outputs('Ids')?['visitors']})")),
            ('Log_visitors_removed', append(G, "@concat(" + L + "?['title'], ': removed the site Visitors group')")),
        ))),
        ('Add_owners_full_control', http('POST', LBASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                                         "roledefid=@{outputs('Ids')?['fullControl']})", secure=False)),
        ('I_have_direct_access', cond("@and(contains(body('Principals'), body('Get_me')?['Id']), "
                                      "or(equals(body('Get_me')?['IsSiteAdmin'], true), contains(body('Owner_member_ids'), body('Get_me')?['Id'])))",
                                      seq(
            ('Remove_my_direct_access', delete(LBASE + "/roleassignments/getbyprincipalid(@{body('Get_me')?['Id']})")),
        ))),
        ('Group_needs_read', after(cond("@equals(" + L + "?['groupRead'], true)", seq(
            ('Grant_group_read', http('POST', LBASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['group']},"
                                                      "roledefid=@{outputs('Ids')?['readBuiltIn']})", secure=False)),
            ('Log_group_read', append(G, "@concat(" + L + "?['title'], ': " + GROUP_TITLE + " given Read')")),
        )), {'I_have_direct_access': TOLERANT})),
        ('Group_needs_contribute', cond("@equals(" + L + "?['groupContribute'], true)", seq(
            # replace whatever the group had (1.2.0.0 gave it the built-in Contribute) with the narrower 1-to-1 Submit
            ('Group_had_access', cond("@contains(body('Principals'), outputs('Ids')?['group'])", seq(
                ('Remove_group_access', delete(LBASE + "/roleassignments/getbyprincipalid(@{outputs('Ids')?['group']})")),
            ))),
            ('Grant_group_submit', http('POST', LBASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['group']},"
                                                        "roledefid=@{outputs('Ids')?['submit']})", secure=False)),
            ('Log_group_submit', append(G, "@concat(" + L + "?['title'], ': " + GROUP_TITLE + " given 1-to-1 Submit (each person sees only their own items)')")),
        ))),
    ))

    bands_body = {'__metadata': {'type': "@{outputs('Settings_list')?['ListItemEntityTypeFullName']}"},
                  'Title': 'Bands', 'Value': "@{outputs('Default_bands')}"}
    summary = ('<p><b>ESG 1-to-1 setup finished.</b></p>'
               '<p><b>Problems to fix by hand</b> (empty means none):</p><ul><li>@{join(variables(\'varWarnings\'), \'</li><li>\')}</li></ul>'
               '<p><b>What was done:</b></p><ul><li>@{join(variables(\'varLog\'), \'</li><li>\')}</li></ul>'
               '<p>Next: turn on flows 2, 3, 4, 5, 6, 8, 9, 10 and 11, and then 1 (MIGRATION_1_5), and check each list\'s permissions page. '
               'If an old flow "7 Challenge" is still in the solution, leave it off.</p>')

    try_actions = seq(
        ('Get_web', http('GET', '_api/web?$select=Title,Url,ServerRelativeUrl', secure=False)),
        ('Get_me', http('GET', '_api/web/currentuser?$select=Id,Title,Email,IsSiteAdmin', secure=False)),
        ('Check_site_admin', cond("@equals(body('Get_me')?['IsSiteAdmin'], true)", None, seq(
            ('Warn_not_site_admin', warn('You are not a Site Collection Administrator of this site. Ask IT to add you '
                                         '(plan D.1, Stage 0B finding B10a) before go-live.'))))),
        ('Check_site_url', cond("@endsWith(" + SITE + ", '/')", seq(
            ('Warn_site_url', warn('The ESG 1-to-1 Site URL environment variable ends with "/". Remove the trailing slash '
                                   '(Solutions → Default solution → Environment variables), otherwise flows 2 and 3 cannot find the lists.'))))),
        ('Get_regional_settings', http('GET', '_api/web/RegionalSettings?$select=LocaleId', secure=False)),
        ('Get_time_zone', http('GET', '_api/web/RegionalSettings/TimeZone?$select=Id,Description', secure=False)),
        ('Check_regional', cond("@and(equals(body('Get_regional_settings')?['LocaleId'], 2057), "
                                "contains(string(body('Get_time_zone')?['Description']), 'London'))", None, seq(
            ('Warn_regional', warn("@concat('Regional settings are ', string(body('Get_regional_settings')?['LocaleId']), ' / ', "
                                   "string(body('Get_time_zone')?['Description']), '. Set Locale English (United Kingdom) and time zone "
                                   "(UTC) Dublin, Edinburgh, Lisbon, London (plan G Part 1 step 4) – dates depend on it.')"))))),
        ('Get_roles', http('GET', '_api/web/roledefinitions?$select=Id,Name,RoleTypeKind,BasePermissions', secure=False)),
        ('Each_role', role_steps),
        ('Get_groups', http('GET', '_api/web/sitegroups?$select=Id,Title', secure=False)),
        ('Find_group', query("@body('Get_groups')?['value']", "@equals(item()?['Title'], '" + GROUP_TITLE + "')")),
        ('Group_missing', cond("@empty(body('Find_group'))", seq(
            ('Create_group', http('POST', '_api/web/sitegroups',
                                  '{"__metadata":{"type":"SP.Group"},"Title":"' + GROUP_TITLE + '","Description":"' + GROUP_DESCRIPTION + '",'
                                  '"OnlyAllowMembersViewMembership":true,"AllowMembersEditMembership":false,'
                                  '"AllowRequestToJoinLeave":false,"AutoAcceptRequestToJoinLeave":false}', verbose=True, secure=False)),
            ('Log_group_created', append(G, 'Created group ' + GROUP_TITLE + ' (no site permissions)')),
        ))),
        ('Get_groups_again', http('GET', '_api/web/sitegroups?$select=Id,Title', secure=False)),
        ('Find_group_again', query("@body('Get_groups_again')?['value']", "@equals(item()?['Title'], '" + GROUP_TITLE + "')")),
        ('Get_owners_group', http('GET', '_api/web/associatedownergroup?$select=Id,Title', secure=False)),
        ('Get_owner_members', http('GET', '_api/web/associatedownergroup/users?$select=Id', secure=False)),
        ('Owner_member_ids', select("@body('Get_owner_members')?['value']", "@item()?['Id']")),
        ('Get_members_group', http('GET', '_api/web/associatedmembergroup?$select=Id,Title', secure=False)),
        ('Get_visitors_group', after(http('GET', '_api/web/associatedvisitorgroup?$select=Id,Title', secure=False),
                                     {'Get_members_group': TOLERANT})),
        ('Get_roles_again', after(http('GET', '_api/web/roledefinitions?$select=Id,Name,RoleTypeKind', secure=False),
                                  {'Get_visitors_group': TOLERANT})),
        ('Role_full_control', query("@body('Get_roles_again')?['value']", "@equals(item()?['RoleTypeKind'], 5)")),
        ('Role_read_builtin', query("@body('Get_roles_again')?['value']", "@equals(item()?['RoleTypeKind'], 2)")),
        ('Role_submit', query("@body('Get_roles_again')?['value']", "@equals(item()?['Name'], '1-to-1 Submit')")),
        ('Ids', compose({'owners': "@body('Get_owners_group')?['Id']",
                         'fullControl': "@first(body('Role_full_control'))?['Id']",
                         'readBuiltIn': "@first(body('Role_read_builtin'))?['Id']",
                         'submit': "@first(body('Role_submit'))?['Id']",
                         'members': "@coalesce(body('Get_members_group')?['Id'], -1)",
                         'visitors': "@coalesce(body('Get_visitors_group')?['Id'], -1)",
                         'group': "@first(body('Find_group_again'))?['Id']"})),
        ('Each_list', each_list),
        ('Get_lists_final', http('GET', lists_uri, secure=False)),
        # 1.4 removed the challenge feature. If its list is here: the technicians lose all access to it (the records are
        # kept, Owners only) and any challenge still open on a Manager Review is closed. Nothing is deleted.
        ('Find_challenges_list', query("@body('Get_lists_final')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneChallenges')")),
        ('Challenges_list_here', cond("@not(empty(body('Find_challenges_list')))", {
            'RetireTry': after(scope(seq(
                ('Challenges_base', compose("@concat('_api/web/lists(guid''', first(body('Find_challenges_list'))?['Id'], ''')')")),
                ('Get_challenge_access', http('GET', "@{outputs('Challenges_base')}/roleassignments?$select=PrincipalId", secure=False)),
                ('Challenge_principals', select("@body('Get_challenge_access')?['value']", "@item()?['PrincipalId']")),
                ('Group_on_challenges', cond("@contains(body('Challenge_principals'), outputs('Ids')?['group'])", seq(
                    ('Remove_group_from_challenges', delete("@{outputs('Challenges_base')}/roleassignments/getbyprincipalid(@{outputs('Ids')?['group']})")),
                ))),
                ('Get_challenge_items', http('GET', "@{outputs('Challenges_base')}/items?$select=Id&$top=5000", secure=False)),
                ('Each_challenge_item', foreach("@body('Get_challenge_items')?['value']", seq(
                    ('Owners_only', http('POST', "@{outputs('Challenges_base')}/items(@{items('Each_challenge_item')?['Id']})/resetroleinheritance", secure=False)),
                ))),
                ('Find_mgr_list', query("@body('Get_lists_final')?['value']", "@equals(item()?['RootFolder']?['Name'], 'ManagerReviews')")),
                ('Get_open_challenges', http('GET', "_api/web/lists(guid'@{first(body('Find_mgr_list'))?['Id']}')/items?$select=Id&$filter=ChallengeState eq 'Open'&$top=5000",
                                             secure=False)),
                ('Each_open_challenge', foreach("@body('Get_open_challenges')?['value']", seq(
                    ('Close_challenge', http('POST', "_api/web/lists(guid'@{first(body('Find_mgr_list'))?['Id']}')/items(@{items('Each_open_challenge')?['Id']})",
                                             '{"ChallengeState":"Not agreed","ChallengeClosedOn":"@{utcNow()}"}', headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'},
                                             secure=False)),
                ))),
                ('Log_challenges_retired', append(G, "@concat('1-to-1 Challenges (retired in 1.4): technicians no longer have access; ', "
                                                     "string(length(body('Get_open_challenges')?['value'])), ' open challenge(s) closed. The records are kept.')")),
            )), {}),
            'RetireCatch': after(scope(seq(
                ('Warn_retire_challenges', warn("@concat('Could not fully retire the 1-to-1 Challenges list – check its permissions by hand "
                                                "(Owners only) and turn off flow 7.')")),
            )), {'RetireTry': FAILED}),
        })),
        ('Find_settings_list', query("@body('Get_lists_final')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneSettings')")),
        ('Settings_list', compose("@first(body('Find_settings_list'))")),
        ('Get_settings_items', http('GET', "_api/web/lists(guid'@{outputs('Settings_list')?['Id']}')/items?$select=Id,Title&$top=100",
                                    secure=False)),
        ('Find_bands', query("@body('Get_settings_items')?['value']", "@equals(item()?['Title'], 'Bands')")),
        ('Bands_missing', cond("@empty(body('Find_bands'))", seq(
            ('Bands_item', compose(bands_body)),
            ('Create_bands_item', http('POST', "_api/web/lists(guid'@{outputs('Settings_list')?['Id']}')/items",
                                       "@{string(outputs('Bands_item'))}", verbose=True, secure=False)),
            ('Log_bands', append(G, 'Added the Bands item to 1-to-1 Settings (default thresholds)')),
        ))),
        ('Find_reminders', query("@body('Get_settings_items')?['value']", "@equals(item()?['Title'], 'Reminders')")),
        ('Reminders_missing', cond("@empty(body('Find_reminders'))", seq(
            ('Reminders_item', compose({'__metadata': {'type': "@{outputs('Settings_list')?['ListItemEntityTypeFullName']}"},
                                        'Title': 'Reminders', 'Value': DEFAULT_REMINDERS})),
            ('Create_reminders_item', http('POST', "_api/web/lists(guid'@{outputs('Settings_list')?['Id']}')/items",
                                           "@{string(outputs('Reminders_item'))}", verbose=True, secure=False)),
            ('Log_reminders', append(G, 'Added the Reminders item to 1-to-1 Settings (20th and 27th)')),
        ))),
        # 1.5: the action tracker starts now. Only reviews released from this moment on have their agreed actions added to
        # it (Flow 3 / Flow 1); earlier actions stay in their reviews. Written once – a re-run keeps the original time.
        ('Find_tracker_start', query("@body('Get_settings_items')?['value']", "@equals(item()?['Title'], 'ActionsTrackerStart')")),
        ('Tracker_start_missing', cond("@empty(body('Find_tracker_start'))", seq(
            ('Tracker_start_item', compose({'__metadata': {'type': "@{outputs('Settings_list')?['ListItemEntityTypeFullName']}"},
                                            'Title': 'ActionsTrackerStart', 'Value': '@{utcNow()}'})),
            ('Create_tracker_start', http('POST', "_api/web/lists(guid'@{outputs('Settings_list')?['Id']}')/items",
                                          "@{string(outputs('Tracker_start_item'))}", verbose=True, secure=False)),
            ('Log_tracker_start', append(G, 'Action tracker started: actions agreed in reviews released from now on are tracked (earlier ones stay in their reviews)')),
        ))),
        ('Email_summary', email('@' + TL_EMAIL, 'ESG 1-to-1 setup: @{if(empty(variables(\'varWarnings\')), \'complete\', '
                                                '\'complete with items to check\')}', summary)),
    )
    actions = seq(
        ('Initialize_varWarnings', init_var(W, 'array', [])),
        ('Initialize_varLog', init_var(G, 'array', [])),
        ('Schema', compose(LISTS)),
        ('Role_settings', compose(ROLES)),
        ('Default_bands', compose(DEFAULT_BANDS)),
    )
    actions['Try'] = after(scope(try_actions), {'Default_bands': OK})
    actions['Catch'] = catch('ESG 1-to-1 | 0 Setup')
    triggers = {'manual': {'type': 'Request', 'kind': 'Button',
                           'inputs': {'schema': {'type': 'object', 'properties': {}, 'required': []}}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 1
def flow_daily():
    T = "items('Each_technician')"
    MGRO = "outputs('Mgr')"
    e1 = ('<p>Hi @{first(split(' + MGRO + "?['Technician']?['DisplayName'], ' '))},</p>"
          '<p>Your monthly 1-to-1 is ready: <a href="' + link("variables('varReviewId')") + '"><b>Open my 1-to-1</b></a></p>'
          "<p>Deadline: @{outputs('DeadlineText')}.</p>"
          '<p>You can save and come back as often as you like before you submit.</p>'
          '<p style="color:#666">This link only works when you\'re signed in with your own company account.</p>')
    e2 = ("<p>Your 1-to-1 hasn't been submitted yet. Anything you've saved is still there: "
          '<a href="' + link("items('Each_outstanding')?['ReviewItemId']") + '"><b>Continue</b></a></p>')
    D = "items('Each_date_check')"

    def due_text(days):
        return ("@{if(equals(" + days + ", 7), 'is due in 7 days', if(equals(" + days + ", 0), 'is due today', "
                "concat('was due ', string(sub(0, " + days + ")), ' days ago')))}")

    def days_to(col):
        d = local_date(D + "?['" + col + "']")
        # if() evaluates both branches, so the empty case still needs a valid date inside ticks()
        return ("@if(empty(" + d + "), 999999, div(sub(ticks(concat(if(empty(" + d + "), outputs('Today'), " + d + "), 'T00:00:00Z')), "
                "ticks(concat(outputs('Today'), 'T00:00:00Z'))), 864000000000))")

    def remind(v):   # 7 days before, on the day, then every 7 days while overdue
        o = "outputs('" + v + "')"
        return ("@or(equals(" + o + ", 7), equals(" + o + ", 0), and(less(" + o + ", 0), equals(mod(sub(0, " + o + "), 7), 0)))")
    e12 = ("<p>The next wellbeing assessment for @{" + D + "?['Title']} " + due_text("outputs('Wb_days')") + " "
           "(@{formatDateTime(" + local_date(D + "?['NextWellbeingDate']") + ", 'dd-MMM-yyyy')}). Arrange the conversation and start the "
           "assessment from the Wellbeing tab, or change the date in ⚙ Settings → Team.</p>"
           '<p><a href="@{' + PAGE + '}"><b>Open the 1-to-1 page</b></a></p>')
    e17 = ("<p>The appraisal for @{" + D + "?['Title']} " + due_text("outputs('Ap_days')") + " "
           "(@{formatDateTime(" + local_date(D + "?['AppraisalDate']") + ", 'dd-MMM-yyyy')}). When it's done, use ⚙ Settings → Team → "
           "Mark appraisal completed; to move it, change the date there.</p>"
           '<p><a href="@{' + PAGE + '}"><b>Open the 1-to-1 page</b></a></p>')
    e7 = ("<p>The daily 1-to-1 run found these problems:</p><p>@{join(variables('varProblems'), '<br>')}</p>"
          '<p><a href="@{' + RUN_LINK + '}">Open the run</a></p>')
    # an expectation's year is the first appraisal year it applies to: it carries on into later years until it is retired
    # (it no longer disappears in April), and one entered early for next year stays hidden until then
    snapshot_where = ("@and(or(empty(trim(coalesce(item()?['AppraisalYear'], ''))), contains(outputs('AllowedYears'), "
                      "trim(coalesce(item()?['AppraisalYear'], '')))), or(equals(item()?['AppliesTo']?['Value'], 'Shared'), "
                      "equals(toLower(coalesce(item()?['Technician']?['Email'], '')), toLower(" + T + "?['Technician']?['Email']))))")
    tech_try = seq(
        # (Set variable has no secure inputs/outputs – a secureData setting here stopped the flow importing: 1.3.0.1)
        ('Set_varTechAad', set_var('varTechAad', "@toLower(coalesce(" + T + "?['TechnicianAadId'], ''))")),
        ('No_AadId', cond("@empty(variables('varTechAad'))", seq(
            ('Get_profile', user_profile("@last(split(" + T + "?['Technician']?['Claims'], '|'))")),
            ('Save_AadId', patch_item('Technicians', '@' + T + "?['ID']",
                                      {'Title': '@' + T + "?['Title']", 'TechnicianAadId': "@toLower(body('Get_profile')?['id'])"})),
            ('Set_varTechAad_from_profile', set_var('varTechAad', "@toLower(body('Get_profile')?['id'])")),
        ))),
        ('ReviewKey', compose("@concat(variables('varTechAad'), '_', outputs('MonthKey'))", secure=True)),
        ('Find_mgr', get_items(MGR, "ReviewKey eq '@{outputs('ReviewKey')}'", top=1)),
        ('Mgr_missing', cond("@equals(length(body('Find_mgr')?['value']), 0)", seq(
            ('My_expectations', query("@body('Get_expectations')?['value']", snapshot_where, secure=True)),
            # no maximum: every active shared and individual expectation (Get_expectations is ordered shared first)
            ('Snapshot', select("@body('My_expectations')", secure=True, mapping=
                                {'id': "@item()?['ID']", 'title': "@item()?['Title']", 'measures': "@item()?['Measures']",
                                 'year': "@item()?['AppraisalYear']"})),
            ('Create_manager_review', post_item(MGR, {
                'Title': "@{" + T + "?['Title']} – @{outputs('MonthKey')}",
                'ReviewKey': "@outputs('ReviewKey')",
                'Technician/Claims': '@' + T + "?['Technician']?['Claims']",
                'TechnicianAadId': "@variables('varTechAad')",
                'MonthKey': "@outputs('MonthKey')",
                'DueDate': "@outputs('DueUtc')",
                'ReviewState/Value': 'Open',
                'ActionsStatus/Value': 'None',
                'ExpectationSnapshotJson': "@{string(body('Snapshot'))}",
                'ExpectationFeedbackJson': '[]',
                'ActionsJson': '[]',
            })),
        ))),
        ('Get_mgr', get_items(MGR, "ReviewKey eq '@{outputs('ReviewKey')}'", top=1)),
        ('Mgr', compose("@first(body('Get_mgr')?['value'])", secure=True)),
        ('Review_missing', cond("@equals(" + MGRO + "?['ReviewItemId'], null)", seq(
            ('Tech_copy', select("@json(coalesce(" + MGRO + "?['ExpectationSnapshotJson'], '[]'))",
                                 {'id': "@item()?['id']", 'title': "@item()?['title']", 'measures': "@item()?['measures']",
                                  'year': "@item()?['year']", 'rating': None, 'comment': ''}, secure=True)),
            ('Create_review', post_item(MR, {
                'Title': '@' + MGRO + "?['Title']",
                'Technician/Claims': '@' + MGRO + "?['Technician']?['Claims']",
                'MonthKey': '@' + MGRO + "?['MonthKey']",
                'MonthStart': "@concat(" + MGRO + "?['MonthKey'], '-01')",
                'DueDate': '@' + MGRO + "?['DueDate']",
                'ReviewStatus/Value': 'Not Started',
                'ExpectationsJson': "@{string(body('Tech_copy'))}",
                # date-only copy; tolerate the connector returning a UTC instant (e.g. 23:00Z the day before in BST)
                'AppraisalDate': "@if(contains(string(coalesce(" + T + "?['AppraisalDate'], '')), 'T'), "
                                 "formatDateTime(convertFromUtc(coalesce(" + T + "?['AppraisalDate'], '2000-01-01T00:00:00Z'), "
                                 "'GMT Standard Time'), 'yyyy-MM-dd'), if(empty(" + T + "?['AppraisalDate']), null, " + T + "?['AppraisalDate']))",
            })),
            ('Link_review', patch_item(MGR, '@' + MGRO + "?['ID']",
                                       {'Title': '@' + MGRO + "?['Title']", 'ReviewItemId': "@body('Create_review')?['ID']"})),
            ('Set_varReviewId_new', set_var('varReviewId', "@body('Create_review')?['ID']")),
            # the appraisal-period boundaries for the technician's own view – a 1.4 column, so REST, not the connector
            ('Has_boundaries', cond("@not(empty(trim(coalesce(" + T + "?['AppraisalBoundaries'], ''))))", seq(
                ('Boundaries_payload', compose({'AppraisalBoundaries': "@{" + T + "?['AppraisalBoundaries']}"}, secure=True)),
                ('Copy_boundaries', http('POST', "_api/web/lists(guid'@{outputs('Ids')?['reviewsList']}')/items(@{body('Create_review')?['ID']})",
                                         "@{string(outputs('Boundaries_payload'))}", headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
            ))),
        ), seq(
            ('Set_varReviewId_existing', set_var('varReviewId', "@" + idnum(MGRO + "?['ReviewItemId']"))),
        ))),
        ('Needs_link', cond("@and(equals(" + MGRO + "?['ReviewState']?['Value'], 'Open'), empty(" + MGRO + "?['LinkSentOn']))", seq(
            ensure_user('Ensure_user', MGRO + "?['Technician']?['Claims']"),
            *setperm('', 'reviewsList', "variables('varReviewId')", "outputs('Ids')?['edit']", "body('Ensure_user')?['Id']"),
            ('Send_E1', email('@' + MGRO + "?['Technician']?['Email']", "Your 1-to-1 for @{outputs('MonthName')} is ready", e1)),
            ('Stamp_LinkSentOn', patch_item(MGR, '@' + MGRO + "?['ID']", {'Title': '@' + MGRO + "?['Title']", 'LinkSentOn': '@utcNow()'})),
        ))),
    )
    each_tech = foreach("@body('Get_technicians')?['value']", {
        'TechTry': after(scope(tech_try), {}),
        'TechCatch': after(scope(seq(
            ('Note_failure', append('varProblems', "@concat('FAILED for ', " + T + "?['Title'], ' – no email was sent. Open the run "
                                                   "history for details.')")))), {'TechTry': FAILED}),
    })
    try_actions = seq(
        *load_ids(),
        ('Get_technicians', get_items('Technicians', 'Active eq 1', top=5000)),
        # shared first ('Shared' sorts after 'Individual'), then SortOrder within each group – no number offsets needed
        ('Get_expectations', get_items(LIST_TITLE['exp'], 'Active eq 1', top=5000, order='AppliesTo desc,SortOrder asc')),
        ('Active_tech_emails', select("@body('Get_technicians')?['value']", "@toLower(coalesce(item()?['Technician']?['Email'], ''))", secure=True)),
        ('Each_technician', each_tech),
        ('Get_reminder_setting', get_items(SETTINGS, "Title eq 'Reminders'", top=1)),
        ('Reminder_days', compose("@if(empty(body('Get_reminder_setting')?['value']), '" + DEFAULT_REMINDERS + "', "
                                  "coalesce(first(body('Get_reminder_setting')?['value'])?['Value'], ''))")),
        # "[20,27]" -> ",20,27," and look for ",<day>," (no JSON parsing, so a hand-edited value can never fail the run)
        ('Reminder_day', cond("@contains(concat(',', replace(replace(replace(string(outputs('Reminder_days')), '[', ''), ']', ''), ' ', ''), ','), "
                              "concat(',', string(outputs('Day')), ','))", seq(
            ('Outstanding', get_items(MGR, "MonthKey eq '@{outputs('MonthKey')}' and ReviewState eq 'Open'", top=5000)),
            # only people still active (a deactivated person has lost access and would get a link they can't open)
            ('Outstanding_linked', query("@body('Outstanding')?['value']", "@and(not(empty(item()?['LinkSentOn'])), "
                                         "contains(body('Active_tech_emails'), toLower(coalesce(item()?['Technician']?['Email'], '#none'))))", secure=True)),
            ('Each_outstanding', foreach("@body('Outstanding_linked')", seq(
                ('Send_E2', email("@items('Each_outstanding')?['Technician']?['Email']",
                                  "Reminder: your 1-to-1 for @{outputs('MonthName')} is due @{outputs('DeadlineText')}", e2)),
            ))),
        ))),
        # Wellbeing (E12) and appraisal (E17) reminders from the dates the Team Leader keeps in Settings → Team:
        # 7 days before, on the day, then every 7 days while overdue. A failure is noted, never fatal.
        ('Today', compose("@formatDateTime(outputs('ukNow'), 'yyyy-MM-dd')")),
        ('Reminders_by_date', cond("@equals(1, 1)", {
          'DatesTry': after(scope(seq(
            ('Each_date_check', foreach("@body('Get_technicians')?['value']", seq(
                ('Wb_days', compose(days_to('NextWellbeingDate'))),
                ('Wb_reminder', cond(remind('Wb_days'), seq(
                    ('Send_E12', email('@' + TL_EMAIL, "Wellbeing assessment @{if(equals(outputs('Wb_days'), 7), 'due in 7 days', "
                                       "if(equals(outputs('Wb_days'), 0), 'due today', 'overdue'))}: @{" + D + "?['Title']}", e12)),
                ))),
                ('Ap_days', compose(days_to('AppraisalDate'))),
                ('Ap_reminder', cond(remind('Ap_days'), seq(
                    ('Send_E17', email('@' + TL_EMAIL, "Appraisal @{if(equals(outputs('Ap_days'), 7), 'due in 7 days', "
                                       "if(equals(outputs('Ap_days'), 0), 'due today', 'overdue'))}: @{" + D + "?['Title']}", e17)),
                ))),
            ))),
          )), {}),
          'DatesCatch': after(scope(seq(
            ('Note_dates_failed', append('varProblems', 'Wellbeing / appraisal reminders could not all be checked today. Open the run history for details.')),
          )), {'DatesTry': FAILED}),
        })),
        # A submitted review still Open on its Manager Review means Flow 2 didn't process it (off, or failed): report it.
        ('Reconcile_submissions', cond("@equals(1, 1)", {
          'ReconcileTry': after(scope(seq(
            ('PrevMonthKey', compose("@formatDateTime(addDays(startOfMonth(outputs('ukNow')), -1), 'yyyy-MM')")),
            ('Each_recent_month', foreach("@createArray(outputs('MonthKey'), outputs('PrevMonthKey'))", seq(
                ('Submitted_reviews', get_items(MR, "MonthKey eq '@{items('Each_recent_month')}' and ReviewStatus eq 'Submitted'", top=5000)),
                ('Open_mgr', get_items(MGR, "MonthKey eq '@{items('Each_recent_month')}' and ReviewState eq 'Open'", top=5000)),
                ('Open_ids', select("@body('Open_mgr')?['value']", "@" + idstr("item()?['ReviewItemId']"), secure=True)),
                ('Unprocessed', query("@body('Submitted_reviews')?['value']", "@contains(body('Open_ids'), string(item()?['ID']))", secure=True)),
                ('Each_unprocessed', foreach("@body('Unprocessed')", seq(
                    # the review's Title is technician-editable: escaped before it goes into the HTML email
                    ('Note_unprocessed', append('varProblems', "@concat(" + esc("items('Each_unprocessed')?['Title']") + ", ': submitted but not processed – "
                                                               "is flow 2 on? The technician can still edit it until it is.')")),
                ))),
            ))),
          )), {}),
          'ReconcileCatch': after(scope(seq(
            ('Note_reconcile_failed', append('varProblems', 'Could not check for unprocessed submissions today. Open the run history for details.')),
          )), {'ReconcileTry': FAILED}),
        })),
        ('Action_tracker', cond("@equals(1, 1)", {
            'ActionTry': after(scope(action_daily_steps()), {}),
            'ActionCatch': after(scope(seq(
                ('Note_actions_failed', append('varProblems', 'Action tracker: adding agreed actions, deadline reminders or retries '
                                                              'could not all be done today. Open the run history for details.')),
            )), {'ActionTry': FAILED}),
        })),
        ('Any_problems', cond("@greater(length(variables('varProblems')), 0)", seq(
            ('Send_E7', email('@' + TL_EMAIL, '1-to-1 system: action needed', e7)),
        ))),
    )
    actions = seq(
        ('Initialize_varTestDate', dict(init_var('varTestDate', 'string', ''),
                                        description='Leave empty in production. For a test run, e.g. 2026-11-20T07:00:00')),
        ('Initialize_varProblems', init_var('varProblems', 'array', [])),
        ('Initialize_varTechAad', init_var('varTechAad', 'string', '')),
        ('Initialize_varReviewId', init_var('varReviewId', 'integer', 0)),
        ('ukNow', compose("@if(empty(variables('varTestDate')), convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-ddTHH:mm:ss'), "
                          "variables('varTestDate'))")),
        ('MonthKey', compose("@formatDateTime(outputs('ukNow'), 'yyyy-MM')")),
        ('LastDay', compose("@formatDateTime(addDays(addToTime(startOfMonth(outputs('ukNow')), 1, 'Month'), -1), 'yyyy-MM-dd')")),
        ('DueUtc', compose("@convertToUtc(concat(outputs('LastDay'), 'T23:59:59'), 'GMT Standard Time')")),
        ('DeadlineText', compose("@concat('23:59 on ', formatDateTime(outputs('LastDay'), 'dddd dd-MMM-yyyy'))")),
        ('MonthName', compose("@formatDateTime(outputs('ukNow'), 'MMMM yyyy')")),
        ('Day', compose("@dayOfMonth(outputs('ukNow'))")),
        ('YearStart', compose("@if(greater(int(formatDateTime(outputs('ukNow'), 'MM')), 3), int(formatDateTime(outputs('ukNow'), 'yyyy')), "
                              "sub(int(formatDateTime(outputs('ukNow'), 'yyyy')), 1))")),
        ('AppraisalYear', compose("@concat(string(outputs('YearStart')), '/', substring(string(add(outputs('YearStart'), 1)), 2, 2))")),
        # this appraisal year and the five before it, as 'yyyy/yy' text (compared as text: a mistyped year never fails the run)
        ('AllowedYears', compose("@createArray(" + ", ".join(
            "concat(string(sub(outputs('YearStart'), {0})), '/', substring(string(sub(add(outputs('YearStart'), 1), {0})), 2, 2))".format(k)
            for k in range(6)) + ")")),
    )
    actions['Try'] = after(scope(try_actions), {'AllowedYears': OK})
    actions['Catch'] = catch('ESG 1-to-1 | 1 Daily scheduler')
    triggers = {'Recurrence': {'type': 'Recurrence',
                               'recurrence': {'frequency': 'Day', 'interval': 1, 'startTime': '2026-01-01T07:00:00',
                                              'timeZone': 'GMT Standard Time', 'schedule': {'hours': [7], 'minutes': [0]}},
                               'runtimeConfiguration': {'concurrency': {'runs': 1}}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 2
def flow_submitted():
    TB = 'triggerBody()'
    MGRO = "outputs('Mgr')"
    e3_subject = ("@{if(startsWith(coalesce(" + TB + "?['Q9FollowUp']?['Value'], ''), 'Arrange a dedicated'), '[1-to-1 REQUESTED] ', '')}"
                  "1-to-1 submitted: @{" + MGRO + "?['Title']}")
    AT = "outputs('Submitted_at')"
    e3 = ("<p>Submitted @{if(greater(ticks(" + AT + "), ticks(" + MGRO + "?['DueDate'])), 'late', 'on time')}. "
          '<a href="' + link(TB + "?['ID']") + '"><b>Open review</b></a></p>')
    try_actions = seq(
        *load_ids(),
        ('Find_mgr', get_items(MGR, "ReviewItemId eq @{" + TB + "?['ID']}", top=1)),
        ('Unknown_item', cond("@equals(length(body('Find_mgr')?['value']), 0)", seq(('Not_a_flow_review', terminate('Cancelled'))))),
        ('Mgr', compose("@first(body('Find_mgr')?['value'])", secure=True)),
        ('PrevState', compose('@' + MGRO + "?['ReviewState']?['Value']")),
        # When it was submitted: the item's Modified time, not when this flow ran (the trigger polls every 5 minutes, so a
        # 23:58 submission would otherwise be stamped next month and late). Modified older than 30 minutes is not trusted.
        ('Submitted_at', compose("@if(greater(ticks(coalesce(" + TB + "?['Modified'], '1900-01-01T00:00:00Z')), ticks(addMinutes(utcNow(), -30))), "
                                 + TB + "?['Modified'], utcNow())")),
        ensure_user('Ensure_user', MGRO + "?['Technician']?['Claims']"),
        *setperm('', 'reviewsList', TB + "?['ID']", "outputs('Ids')?['read']", "body('Ensure_user')?['Id']"),
        # The Team Leader amending a review this flow has already processed (the page only allows it then) is not a
        # submission: nothing to stamp or email. The lock above is always re-applied first (whoever the Editor says it
        # was), and a real submission (state still Open) is always processed.
        ('Team_leader_amendment', cond("@and(equals(toLower(coalesce(" + TB + "?['Editor']?['Email'], '')), toLower(" + TL_EMAIL + ")), "
                                       "not(equals(outputs('PrevState'), 'Open')))", seq(('Amendment_not_a_submission', terminate('Cancelled'))))),
        ('First_submission', cond("@equals(outputs('PrevState'), 'Open')", seq(
            ('Stamp_submitted', patch_item(MGR, '@' + MGRO + "?['ID']", {
                'Title': '@' + MGRO + "?['Title']",
                'ReviewState/Value': 'Submitted',
                'SubmittedOn': '@' + AT,
                'SubmittedLate': "@greater(ticks(" + AT + "), ticks(" + MGRO + "?['DueDate']))",
                'TechFollowUp': "@coalesce(" + TB + "?['Q9FollowUp']?['Value'], '')",
            })),
            ('Send_E3', email('@' + TL_EMAIL, e3_subject, e3)),
        ))),
        ('Desired', compose("@if(equals(outputs('PrevState'), 'Open'), 'Submitted', outputs('PrevState'))")),
        ('Status_differs', cond("@not(equals(" + TB + "?['ReviewStatus']?['Value'], outputs('Desired')))", seq(
            ('Correct_status', patch_item(MR, '@' + TB + "?['ID']",
                                          {'Title': '@' + MGRO + "?['Title']", 'ReviewStatus/Value': "@outputs('Desired')"})),
        ))),
    )
    actions = {'Try': after(scope(try_actions), {}),
               'Catch': catch('ESG 1-to-1 | 2 Review submitted',
                              "@{concat('Submission received but LOCK FAILED – check Monthly Review ', string(triggerBody()?['ID']))}")}
    triggers = {'When_a_monthly_review_is_created_or_modified': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@not(contains(createArray('Not Started','Draft'), triggerBody()?['ReviewStatus']?['Value']))"}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': MR},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 3
def flow_decision():
    TB = 'triggerBody()'
    month = "formatDateTime(concat(" + TB + "?['MonthKey'], '-01'), 'MMMM yyyy')"
    e4 = ('<p>I\'ve completed your review – feedback, ratings and any agreed actions are ready. <a href="' + link(TB + "?['ReviewItemId']") + '"><b>View feedback</b></a></p>')
    e5 = ('<p>This review was closed without a submission. <a href="' + link(TB + "?['ReviewItemId']") + '">View</a>. '
          'Please speak to me if this is unexpected.</p>')
    valid = ("@or(and(equals(outputs('Cmd'), 'Completed'), not(empty(" + TB + "?['SubmittedOn']))), "
             "and(equals(outputs('Cmd'), 'Closed - Not Submitted'), empty(" + TB + "?['SubmittedOn']), "
             "less(ticks(" + TB + "?['DueDate']), ticks(utcNow()))))")
    try_actions = seq(
        *load_ids(),
        ('Get_current', get_items(MGR, "ID eq @{" + TB + "?['ID']}", top=1)),
        ('Already_released', cond("@not(empty(first(body('Get_current')?['value'])?['ReleasedOn']))",
                                  seq(('Released_by_an_earlier_run', terminate('Cancelled'))))),
        ('Cmd', compose('@' + TB + "?['ReviewState']?['Value']")),
        ('Valid', cond(valid, None, seq(
            ('Revert_state', patch_item(MGR, '@' + TB + "?['ID']", {
                'Title': '@' + TB + "?['Title']",
                'ReviewState/Value': "@if(empty(" + TB + "?['SubmittedOn']), 'Open', 'Submitted')"})),
            ('Email_not_done', email('@' + TL_EMAIL, '1-to-1: not done',
                                     "<p>You can only complete a submitted review, and only close one that hasn't been submitted "
                                     "after its deadline. (@{" + TB + "?['Title']})</p>")),
            ('Stop_invalid', terminate('Cancelled')),
        ))),
        ensure_user('Ensure_user', TB + "?['Technician']?['Claims']"),
        ('Has_monthly_review', cond("@not(equals(" + TB + "?['ReviewItemId'], null))", seq(
            *setperm('_R', 'reviewsList', idnum(TB + "?['ReviewItemId']"), "outputs('Ids')?['read']", "body('Ensure_user')?['Id']"),
        ))),
        *setperm('_M', 'mgrList', TB + "?['ID']", "outputs('Ids')?['read']", "body('Ensure_user')?['Id']"),
        ('Stamp_released', patch_item(MGR, '@' + TB + "?['ID']", {
            'Title': '@' + TB + "?['Title']", 'ReleasedOn': '@utcNow()', 'CompletedOn': '@utcNow()',
            'CompletedBy': '@' + TB + "?['Editor']?['Email']"})),
        ('Review_exists', cond("@not(equals(" + TB + "?['ReviewItemId'], null))", seq(
            ('Set_review_status', patch_item(MR, '@' + idnum(TB + "?['ReviewItemId']"),
                                             {'Title': '@' + TB + "?['Title']", 'ReviewStatus/Value': "@outputs('Cmd')"})),
        ))),
        ('Was_completed', cond("@equals(outputs('Cmd'), 'Completed')",
                               seq(('Send_E4', email('@' + TB + "?['Technician']?['Email']",
                                                     "Feedback on your 1-to-1 (@{" + month + "}) is ready", e4))),
                               seq(('Send_E5', email('@' + TB + "?['Technician']?['Email']",
                                                     "Your 1-to-1 (@{" + month + "}) has been closed", e5))))),
        # 1.5: the agreed actions go into the action tracker (once each). If anything here fails the release still
        # stands; the daily run (Flow 1) finishes it, and the page shows it until then.
        ('Agreed_actions', cond("@equals(1, 1)", {
            'ActionsTry': after(scope(seq(*act_ids(), *tracker_start('R_'),
                                          *action_create('R_', "first(body('Get_current')?['value'])", 'utcNow()'))), {}),
            'ActionsLater': after(compose('Left for the daily run to finish'), {'ActionsTry': FAILED}),
        })),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 3 Manager decision')}
    triggers = {'When_a_manager_review_is_created_or_modified': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [
            {'expression': "@contains(createArray('Completed','Closed - Not Submitted'), triggerBody()?['ReviewState']?['Value'])"},
            {'expression': "@empty(triggerBody()?['ReleasedOn'])"}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': MGR},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 4
def flow_team():
    """The 1-to-1 group follows the Technicians list: Active = in the group (access to the page), not Active = removed.
    The page never changes permissions itself; the line manager adds or deactivates people in ⚙ Settings → Team."""
    TB = 'triggerBody()'
    e8_add = ('<p>@{' + TB + "?['Title']} now has access to the 1-to-1 page. Their first review is created at 07:00 tomorrow "
              "(or run ESG 1-to-1 | 1 Daily scheduler now).</p>")
    e8_rem = ('<p>@{' + TB + "?['Title']} has been removed from the 1-to-1 group and no longer gets monthly reviews. "
              "Their past records are kept.</p>")
    gid = "outputs('Group_id')"
    try_actions = seq(
        ('Get_groups', http('GET', '_api/web/sitegroups?$select=Id,Title')),
        ('Find_group', query("@body('Get_groups')?['value']", "@equals(item()?['Title'], '" + GROUP_TITLE + "')", secure=True)),
        ('Check_group', cond("@empty(body('Find_group'))", seq(
            ('STOP_run_the_setup_flow_first', compose("@int('The " + GROUP_TITLE + " group was not found. Run ESG 1-to-1 | 0 Setup first.')"))))),
        ('Group_id', compose("@first(body('Find_group'))?['Id']")),
        ('No_person', cond("@empty(coalesce(" + TB + "?['Technician']?['Claims'], ''))", seq(('No_person_set', terminate('Cancelled'))))),
        ensure_user('Ensure_user', TB + "?['Technician']?['Claims']"),
        ('Get_members', http('GET', "_api/web/sitegroups(@{" + gid + "})/users?$select=Id")),
        ('Member_ids', select("@body('Get_members')?['value']", "@item()?['Id']", secure=True)),
        ('Is_member', compose("@contains(body('Member_ids'), body('Ensure_user')?['Id'])")),
        # the person keeps access while ANY of their rows is Active (e.g. a duplicate row being deactivated)
        ('Get_active', get_items(LIST_TITLE['techs'], 'Active eq 1', top=5000)),
        ('Active_logins', select("@body('Get_active')?['value']", "@toLower(coalesce(item()?['Technician']?['Claims'], '#none'))", secure=True)),
        ('Active_emails', select("@body('Get_active')?['value']", "@toLower(coalesce(item()?['Technician']?['Email'], '#none'))", secure=True)),
        ('Should_be_member', compose("@or(equals(" + TB + "?['Active'], true), contains(body('Active_logins'), toLower(" + TB + "?['Technician']?['Claims'])), "
                                     "contains(body('Active_emails'), toLower(coalesce(" + TB + "?['Technician']?['Email'], '#none'))))")),
        ('Add_needed', cond("@and(outputs('Should_be_member'), not(outputs('Is_member')))", seq(
            ('Add_to_group', http('POST', "_api/web/sitegroups(@{" + gid + "})/users",
                                  '{"__metadata":{"type":"SP.User"},"LoginName":"@{' + TB + "?['Technician']?['Claims']}" + '"}', verbose=True)),
            ('Send_E8_added', email('@' + TL_EMAIL, "1-to-1: access given to @{" + TB + "?['Title']}", e8_add)),
        ))),
        ('Remove_needed', cond("@and(not(outputs('Should_be_member')), outputs('Is_member'))", seq(
            ('Remove_from_group', http('POST', "_api/web/sitegroups(@{" + gid + "})/users/removebyid(@{body('Ensure_user')?['Id']})")),
            ('Send_E8_removed', email('@' + TL_EMAIL, "1-to-1: access removed for @{" + TB + "?['Title']}", e8_rem)),
        ))),
        # Full sync: the Technicians list is the single source of truth. Anyone left in the group without an Active row
        # (added by hand, the person on a row was changed, or a row was deleted) is removed and listed in one email.
        ('Get_members_now', http('GET', "_api/web/sitegroups(@{" + gid + "})/users?$select=Id,Title,LoginName,Email,IsSiteAdmin")),
        ('Strays', query("@body('Get_members_now')?['value']",
                         "@and(not(equals(item()?['IsSiteAdmin'], true)), not(contains(body('Active_logins'), toLower(coalesce(item()?['LoginName'], '')))), "
                         "not(contains(body('Active_emails'), toLower(coalesce(item()?['Email'], '#blank')))))", secure=True)),
        ('Any_strays', cond("@not(empty(body('Strays')))", seq(
            ('Each_stray', foreach("@body('Strays')", seq(
                ('Remove_stray', http('POST', "_api/web/sitegroups(@{" + gid + "})/users/removebyid(@{items('Each_stray')?['Id']})")),
            ))),
            ('Stray_names', select("@body('Strays')", "@coalesce(item()?['Title'], item()?['Email'], 'Unknown')", secure=True)),
            ('Send_E8_sync', email('@' + TL_EMAIL, '1-to-1: access removed for people not active in the team list',
                                   "<p>These people were in the 1-to-1 group but have no Active row in ⚙ Settings → Team, so they no longer have "
                                   "access to the 1-to-1 page:</p><ul><li>@{join(body('Stray_names'), '</li><li>')}</li></ul>"
                                   "<p>If someone should have access, add them (or reactivate them) in ⚙ Settings → Team.</p>")),
        ))),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 4 Team members')}
    triggers = {'When_a_team_member_is_added_or_changed': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': LIST_TITLE['techs']},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 5
def flow_wellbeing():
    """Wellbeing assessment permissions and trusted stamps (plan D.7).
    The trusted person is whoever holds the 1-to-1 Edit / Read permission on the item – set by this flow, and not
    changeable by them – never the editable Technician column. New item: grant that person Edit and email them.
    While they hold Edit, any status other than Open = they submitted: lock to Read, stamp SubmittedOn, wipe the
    line-manager fields (they could have pre-filled them) and restore the Technician column. Once locked, Completed
    with no CompletedOn = the line manager completed it: stamp CompletedOn and email the person."""
    TB = 'triggerBody()'
    BASE = "_api/web/lists(guid'@{outputs('WbIds')?['wbList']}')/items(@{" + TB + "?['ID']})"
    H = "outputs('Holder')"
    e9 = ("<p>Your line manager has started a wellbeing assessment with you. Please complete your part before you meet – "
          "about 15–20 minutes, and you can save and come back.</p>"
          '<p><a href="' + wblink(TB + "?['ID']") + '"><b>Open my wellbeing assessment</b></a></p>'
          '<p style="color:#666">Only you and your line manager can see it. The link only works when you\'re signed in with your own '
          'company account.</p>')
    e10 = ("<p>@{" + H + "?['Member']?['Title']} has submitted their wellbeing assessment. Arrange a private, hour-long conversation.</p>"
           '<p><a href="' + wblink(TB + "?['ID']") + '"><b>Open the assessment</b></a></p>')
    e11 = ("<p>Thank you for our wellbeing conversation. The agreed record, including any arrangements and the review date, "
           "is ready to view.</p>"
           '<p><a href="' + wblink(TB + "?['ID']") + '"><b>View my wellbeing assessment</b></a></p>')
    holders = ("@and(equals(item()?['Member']?['PrincipalType'], 1), or(contains(string(item()?['RoleDefinitionBindings']), '1-to-1 Edit'), "
               "contains(string(item()?['RoleDefinitionBindings']), '1-to-1 Read')))")
    try_actions = seq(
        *load_ids(),
        ('List_wellbeing', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'WellbeingAssessments')", secure=True)),
        ('WbIds', compose({'wbList': "@first(body('List_wellbeing'))?['Id']"})),
        ('Check_wellbeing_list', cond("@equals(outputs('WbIds')?['wbList'], null)", seq(
            ('STOP_run_the_setup_flow_again', compose("@int('The Wellbeing Assessments list was not found. Run ESG 1-to-1 | 0 Setup again.')"))))),
        ('Get_item_scope', http('GET', BASE + '?$select=HasUniqueRoleAssignments')),
        ('Get_assignments', http('GET', BASE + '/roleassignments?$expand=Member,RoleDefinitionBindings&$select=PrincipalId,Member/Id,'
                                 'Member/Title,Member/LoginName,Member/Email,Member/PrincipalType,RoleDefinitionBindings/Name')),
        ('Holders', query("@body('Get_assignments')?['value']", holders, secure=True)),
        ('Too_many_holders', cond("@greater(length(body('Holders')), 1)", seq(
            ('More_than_one_person_holds_it', terminate('Failed', 'More than one person has access to this wellbeing assessment. Check its permissions.')),
        ))),
        ('Holder', compose("@first(body('Holders'))", secure=True)),
        ('Status', compose("@coalesce(" + TB + "?['AssessmentStatus']?['Value'], 'Open')")),
        ('New_assessment', cond("@or(equals(body('Get_item_scope')?['HasUniqueRoleAssignments'], false), equals(" + H + ", null))",
            seq(
                # never re-share one that was already submitted or completed (its person lost access some other way)
                ('Already_used', cond("@or(not(empty(" + TB + "?['SubmittedOn'])), not(empty(" + TB + "?['CompletedOn'])))", seq(
                    ('Submitted_but_nobody_holds_it', terminate('Failed', 'This wellbeing assessment was submitted but nobody holds it now. '
                                                                          'Check its permissions; it was not re-shared.')),
                ))),
                ('No_person', cond("@empty(coalesce(" + TB + "?['Technician']?['Claims'], ''))", seq(('No_person_set', terminate('Cancelled'))))),
                ensure_user('Ensure_user', TB + "?['Technician']?['Claims']"),
                *setperm('', 'wbList', TB + "?['ID']", "outputs('Ids')?['edit']", "body('Ensure_user')?['Id']", ids='WbIds'),
                ('Not_open', cond("@not(equals(outputs('Status'), 'Open'))", seq(
                    ('Reset_to_open', patch_item(WB, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'AssessmentStatus/Value': 'Open'})),
                ))),
                ('Send_E9', email('@' + TB + "?['Technician']?['Email']", 'Your wellbeing assessment is ready to complete', e9)),
            ),
            seq(
                ('Holder_can_edit', compose("@contains(string(" + H + "?['RoleDefinitionBindings']), '1-to-1 Edit')")),
                ('Submitted_by_person', cond("@and(outputs('Holder_can_edit'), not(equals(outputs('Status'), 'Open')))",
                    seq(
                        *setperm('_L', 'wbList', TB + "?['ID']", "outputs('Ids')?['read']", H + "?['Member']?['Id']", ids='WbIds'),
                        ('Stamp_submitted', patch_item(WB, '@' + TB + "?['ID']", {
                            'Title': '@' + TB + "?['Title']",
                            'AssessmentStatus/Value': 'Submitted',
                            'SubmittedOn': '@utcNow()',
                            'ArrangementsJson': '',
                            'ManagerNotes': '',
                            'NextReviewDate': None,
                            'CompletedOn': None,
                            'Technician/Claims': '@' + H + "?['Member']?['LoginName']",
                        })),
                        ('Send_E10', email('@' + TL_EMAIL, "Wellbeing assessment submitted: @{" + H + "?['Member']?['Title']}", e10)),
                    ),
                    seq(
                        # while it's still theirs to edit, anything only the flow or the line manager may set is put back:
                        # the person column, the submitted/completed stamps and the line manager's fields
                        ('Tidy_while_open', cond(
                            "@and(outputs('Holder_can_edit'), or(not(empty(" + TB + "?['SubmittedOn'])), not(empty(" + TB + "?['CompletedOn'])), "
                            "not(empty(" + TB + "?['ArrangementsJson'])), not(empty(" + TB + "?['ManagerNotes'])), not(empty(" + TB + "?['NextReviewDate'])), "
                            "not(equals(toLower(coalesce(" + TB + "?['Technician']?['Claims'], '')), toLower(coalesce(" + H + "?['Member']?['LoginName'], ''))))))", seq(
                                ('Restore_open', patch_item(WB, '@' + TB + "?['ID']", {
                                    'Title': '@' + TB + "?['Title']", 'SubmittedOn': None, 'CompletedOn': None, 'ArrangementsJson': '',
                                    'ManagerNotes': '', 'NextReviewDate': None, 'Technician/Claims': '@' + H + "?['Member']?['LoginName']"})),
                            ))),
                        ('Completed_by_manager', cond(
                            "@and(not(outputs('Holder_can_edit')), equals(outputs('Status'), 'Completed'), empty(" + TB + "?['CompletedOn']), "
                            "not(empty(" + TB + "?['SubmittedOn'])))", seq(
                                ('Stamp_completed', patch_item(WB, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'CompletedOn': '@utcNow()'})),
                                ('Send_E11', email('@' + H + "?['Member']?['Email']", 'Your wellbeing assessment record is ready', e11)),
                            ))),
                    ))),
            ))),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 5 Wellbeing')}
    triggers = {'When_a_wellbeing_assessment_is_created_or_modified': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': WB},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 6
def esc(expr):
    """HTML-escape text someone typed before it goes into an email body."""
    return "replace(replace(replace(coalesce(" + expr + ", ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')"


def flow_feedback():
    """Feedback from the page's bubble. Lock the item first (Owners only – the sender can no longer see or change it), then
    email the line manager (E13) and stamp SentOn. If that email fails: mark the item Failed (the page then shows it in
    the line manager's 'Needs your attention'), try a short notice without the content, and end the run Failed."""
    TB = 'triggerBody()'
    BASE = "_api/web/lists(guid'@{outputs('FbIds')?['fbList']}')/items(@{" + TB + "?['ID']})"
    e13 = ('<p><b>@{' + esc(TB + "?['Author']?['DisplayName']") + '}</b> (@{' + esc(TB + "?['Author']?['Email']") + '}) sent this from the 1-to-1 page.</p>'
           '<table cellpadding="4" style="border-collapse:collapse">'
           '<tr><td><b>Type</b></td><td>@{' + esc(TB + "?['FeedbackType']?['Value']") + '}</td></tr>'
           '<tr><td><b>Page</b></td><td>@{' + esc(TB + "?['PageName']") + '} (version @{' + esc(TB + "?['AppVersion']") + '})</td></tr>'
           "<tr><td><b>Sent</b></td><td>@{convertFromUtc(utcNow(), 'GMT Standard Time', 'dd-MMM-yyyy HH:mm')}</td></tr></table>"
           '<div style="white-space:pre-wrap;border-left:3px solid #ccc;padding:6px 10px;margin-top:8px">@{' + esc(TB + "?['Message']") + '}</div>'
           '<p style="color:#666">Kept in the 1-to-1 Feedback list (Owners only).</p>')
    notice = ('<p>A message sent with the 1-to-1 feedback button could not be emailed to you. Open the <b>1-to-1 Feedback</b> list '
              '(Site contents), or <b>Needs your attention</b> on the 1-to-1 page, to read it.</p>')
    try_actions = seq(
        *load_ids(),
        ('List_feedback', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneFeedback')", secure=True)),
        ('FbIds', compose({'fbList': "@first(body('List_feedback'))?['Id']"})),
        ('Check_feedback_list', cond("@equals(outputs('FbIds')?['fbList'], null)", seq(
            ('STOP_run_the_setup_flow_again', compose("@int('The 1-to-1 Feedback list was not found. Run ESG 1-to-1 | 0 Setup again.')"))))),
        # Already handled? Decided from the item's permissions, which only the flow changes – never from columns the
        # sender can write (they could otherwise set Sent/Failed to stop it ever being locked or emailed).
        ('Get_item_scope', http('GET', BASE + '?$select=HasUniqueRoleAssignments')),
        ('Already_handled', cond("@equals(body('Get_item_scope')?['HasUniqueRoleAssignments'], true)", seq(
            ('Handled_by_an_earlier_run', terminate('Cancelled')),
        ))),
        # lock first: whatever happens to the email, the item is no longer visible to the sender (or anyone but Owners)
        ('Lock_break', http('POST', BASE + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')),
        ('Lock_owners', http('POST', BASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                            "roledefid=@{outputs('Ids')?['fullControl']})")),
        # flood guard: more than 10 from one person in 24 hours are kept (Held) but not emailed one by one
        ('Get_recent', get_items(FB, None, top=500, order='ID desc')),
        ('From_sender_today', query("@body('Get_recent')?['value']",
                                    "@and(equals(toLower(coalesce(item()?['Author']?['Email'], '')), toLower(coalesce(" + TB + "?['Author']?['Email'], '#none'))), "
                                    "greater(ticks(coalesce(item()?['Created'], '1900-01-01T00:00:00Z')), ticks(addDays(utcNow(), -1))))", secure=True)),
        ('Over_limit', cond("@greater(length(body('From_sender_today')), 10)",
            seq(
                ('Stamp_held', patch_item(FB, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'SentOn': '@utcNow()', 'DeliveryStatus/Value': 'Held'})),
            ),
            {
                'Send_E13': after(email('@' + TL_EMAIL, "1-to-1 feedback (@{" + TB + "?['FeedbackType']?['Value']}): @{" + TB + "?['Title']}", e13), {}),
                'Stamp_sent': after(patch_item(FB, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'SentOn': '@utcNow()',
                                                                         'DeliveryStatus/Value': 'Sent'}), {'Send_E13': OK}),
                'Mark_failed': after(patch_item(FB, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'DeliveryStatus/Value': 'Failed'}),
                                     {'Send_E13': FAILED}),
                'Send_E13_notice': after(email('@' + TL_EMAIL, '1-to-1 feedback could not be delivered – please read it in the list', notice),
                                         {'Mark_failed': TOLERANT}),
                'Delivery_failed': after(terminate('Failed', 'The feedback email (E13) could not be sent. The item is marked Failed.'),
                                         {'Send_E13_notice': TOLERANT}),
            })),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 6 Feedback')}
    triggers = {'When_feedback_is_sent': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': FB},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 8
def flow_amendment():
    """Tells a technician that the Team Leader amended their submitted / completed 1-to-1 (E16 – no contents, just the month
    and a link), and records the outcome on the audit item. Runs only for NotifyStatus Pending or Retry: it re-reads the
    item first (a stale trigger can't send twice), marks it Sending, then Sent – or Failed, with a short notice to the Team
    Leader, and the run ends Failed. Its own updates never start it again. All writes are REST (1.3.0.2)."""
    TB = 'triggerBody()'
    CUR = "body('Get_current')"
    BASE = "_api/web/lists(guid'@{outputs('AmIds')?['amList']}')/items(@{" + TB + "?['ID']})"
    month = "@{formatDateTime(concat(" + CUR + "?['MonthKey'], '-01'), 'MMMM yyyy')}"
    e16 = ('<p>Your Team Leader has amended your 1-to-1 for <b>' + month + '</b>. '
           'Open it to see the current version.</p>'
           '<p><a href="' + link(CUR + "?['ReviewItemId']") + '"><b>Open my 1-to-1</b></a></p>'
           '<p style="color:#666">The change and its reason are recorded. Speak to your Team Leader if you have a question about it.</p>')
    notice = ('<p>The amendment email (E16) to @{' + esc(CUR + "?['Technician']?['Title']") + '} for ' + month + ' could not be sent. '
              'Open their review on the 1-to-1 page – <b>Needs your attention</b> lets you send it again.</p>')
    def stamp(name, body):
        return (name, http('POST', BASE, body, headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}))
    try_actions = seq(
        *load_ids(),
        ('List_amendments', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneAmendments')", secure=True)),
        ('AmIds', compose({'amList': "@first(body('List_amendments'))?['Id']"})),
        ('Check_amendments_list', cond("@equals(outputs('AmIds')?['amList'], null)", seq(
            ('STOP_run_the_setup_flow_again', compose("@int('The 1-to-1 Amendments list was not found. Run ESG 1-to-1 | 0 Setup again.')"))))),
        # the trigger can be minutes old: decide from the item as it is now
        ('Get_current', http('GET', BASE + '?$select=Id,NotifyStatus,ReviewItemId,MonthKey,Technician/EMail,Technician/Title&$expand=Technician')),
        ('Still_to_send', cond("@contains(createArray('Pending', 'Retry'), coalesce(" + CUR + "?['NotifyStatus'], ''))", None, seq(
            ('Already_handled', terminate('Cancelled')),
        ))),
        stamp('Mark_sending', '{"NotifyStatus":"Sending"}'),
        ('Send_and_record', cond("@equals(1, 1)", {'Send_E16': after(email('@' + CUR + "?['Technician']?['EMail']", 'Your 1-to-1 for ' + month + ' has been amended', e16), {}),
         'Mark_sent': after(http('POST', BASE, '{"NotifyStatus":"Sent","NotifiedOn":"@{utcNow()}","NotifyError":""}',
                                 headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}), {'Send_E16': OK}),
         'Mark_failed': after(http('POST', BASE, '{"NotifyStatus":"Failed","NotifyError":"The email to the technician could not be sent."}',
                                   headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}), {'Send_E16': FAILED}),
         'Send_E16_notice': after(email('@' + TL_EMAIL, 'Amendment email not sent – please resend from the 1-to-1 page', notice),
                                  {'Mark_failed': TOLERANT}),
         'Delivery_failed': after(terminate('Failed', 'The amendment email (E16) could not be sent. The audit item is marked Failed.'),
                                  {'Send_E16_notice': TOLERANT})})),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 8 Amendment notice')}
    triggers = {'When_an_amendment_is_ready_to_send': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@contains(createArray('Pending','Retry'), triggerBody()?['NotifyStatus']?['Value'])"}],
        # one run at a time: a second trigger for the same item re-reads it after the first has marked it Sending / Sent
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': AM},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- 1.5 action tracker
# The three 1.5 lists are reached by REST only (flows 1 and 3 are on during an upgrade; a connector step naming a list
# that doesn't exist yet would stop them saving). Their GUIDs come from Get_lists in load_ids().
def act_ids(name='ActIds'):
    lists = "body('Get_lists')?['value']"
    def find(step, url):
        return (step, query('@' + lists, "@equals(item()?['RootFolder']?['Name'], '" + url + "')"))
    return [
        find('List_actions', 'OneToOneActions'),
        find('List_action_updates', 'OneToOneActionUpdates'),
        find('List_action_notices', 'OneToOneActionNotices'),
        find('List_settings', 'OneToOneSettings'),
        (name, compose({'act': "@first(body('List_actions'))?['Id']",
                        'actType': "@first(body('List_actions'))?['ListItemEntityTypeFullName']",
                        'upd': "@first(body('List_action_updates'))?['Id']",
                        'updRoot': "@first(body('List_action_updates'))?['RootFolder']?['ServerRelativeUrl']",
                        'notc': "@first(body('List_action_notices'))?['Id']",
                        'notcType': "@first(body('List_action_notices'))?['ListItemEntityTypeFullName']",
                        'settings': "@first(body('List_settings'))?['Id']"})),
    ]


def act_uri(key, rest=''):
    return "_api/web/lists(guid'@{outputs('ActIds')?['" + key + "']}')" + rest


def uk_midnight(expr):
    """A yyyy-MM-dd date as the UTC instant of UK midnight (how SharePoint stores a date-only value). Safe when empty,
    because if() evaluates both branches."""
    s = "string(coalesce(" + expr + ", ''))"
    return ("if(empty(" + s + "), null, convertToUtc(concat(if(empty(" + s + "), '2000-01-01', " + s + "), 'T00:00:00'), "
            "'GMT Standard Time'))")


def tracker_start(prefix):
    """The action tracker's start (Settings item ActionsTrackerStart, written once by Setup 1.5)."""
    return [
        (prefix + 'Get_tracker_start', http('GET', act_uri('settings', "/items?$select=Id,Title,Value&$filter=Title eq 'ActionsTrackerStart'"))),
        (prefix + 'Tracker_start', compose("@coalesce(first(body('" + prefix + "Get_tracker_start')?['value'])?['Value'], '')")),
    ]


def action_create(prefix, mr, released_expr, start_prefix=None):
    """Adds a released review's agreed actions to 1-to-1 Actions – once each (unique ActionKey mr<id>-<action id>), and
    only for reviews released after the tracker started – then stamps the Manager Review ActionsSyncedOn. Any failure
    leaves it unstamped, so the daily run (Flow 1) finishes it. Used by Flow 3 at release and by Flow 1."""
    P = prefix
    E = "items('" + P + "Each_agreed')"
    START = "outputs('" + (start_prefix or P) + "Tracker_start')"
    mid = idstr(mr + "?['ID']")
    eligible = ("@and(not(equals(outputs('ActIds')?['act'], null)), not(empty(" + START + ")), "
                "greaterOrEquals(ticks(coalesce(" + released_expr + ", '2000-01-01T00:00:00Z')), ticks(if(empty(" + START + "), "
                "'2100-01-01T00:00:00Z', " + START + "))))")
    key = "@concat('mr', " + mid + ", '-', string(coalesce(" + E + "?['id'], '')))"
    find = act_uri('act', "/items?$select=Id&$filter=ActionKey eq '@{outputs('" + P + "Key')}'")
    text = "string(coalesce(" + E + "?['text'], ''))"
    new_item = {
        '__metadata': {'type': "@{outputs('ActIds')?['actType']}"},
        'Title': "@take(" + text + ", 250)",
        'ActionKey': "@{outputs('" + P + "Key')}",
        'TechnicianId': "@body('" + P + "Ensure_user')?['Id']",
        'Owner': "@if(equals(" + E + "?['ownerRole'], 'tl'), 'Team Leader', 'Technician')",
        'Criteria': "@{coalesce(" + E + "?['criteria'], '')}",
        'OriginReviewId': "@int(concat('0', " + idstr(mr + "?['ReviewItemId']") + "))",
        'OriginMgrId': "@int(concat('0', " + mid + "))",
        'OriginMonth': "@{" + mr + "?['MonthKey']}",
        'OriginalDue': '@' + uk_midnight(E + "?['due']"),
        'CurrentDue': '@' + uk_midnight(E + "?['due']"),
        'Status': "@if(equals(" + E + "?['status'], 'Closed'), 'Closed', 'Open')",
        'ClosedOn': "@if(equals(" + E + "?['status'], 'Closed'), " + uk_midnight(E + "?['closedOn']") + ", null)",
        'HistoryJson': "@{string(createArray(outputs('" + P + "Created_entry')))}",
    }
    return [
        (P + 'Eligible', cond(eligible, seq(
            ensure_user(P + 'Ensure_user', mr + "?['Technician']?['Claims']"),
            (P + 'Agreed', compose("@json(coalesce(" + mr + "?['ActionsJson'], '[]'))", secure=True)),
            (P + 'Each_agreed', foreach("@outputs('" + P + "Agreed')", seq(
                (P + 'Key', compose(key)),
                (P + 'Has_id', cond("@empty(string(coalesce(" + E + "?['id'], '')))", seq(
                    (P + 'STOP_action_without_id', compose("@int('An agreed action has no id – open the review on the 5.1 page and save it again.')")),
                ))),
                (P + 'Find', http('GET', find)),
                (P + 'Not_yet', cond("@empty(body('" + P + "Find')?['value'])", {
                    P + 'Created_entry': after(compose({'id': 'c', 'at': '@{utcNow()}', 'kind': 'created', 'month': "@{" + mr + "?['MonthKey']}",
                                                        'by': 'Agreed at the monthly 1-to-1'}), {}),
                    P + 'New_item': after(compose(new_item, secure=True), {P + 'Created_entry': OK}),
                    P + 'Create': after(http('POST', act_uri('act', '/items'), "@{string(outputs('" + P + "New_item'))}", verbose=True),
                                        {P + 'New_item': OK}),
                    # a parallel run may have added it a moment ago (the key is unique): fine if it is there now
                    P + 'Recheck': after(http('GET', find), {P + 'Create': FAILED}),
                    P + 'Still_missing': after(cond("@empty(body('" + P + "Recheck')?['value'])", seq(
                        (P + 'STOP_could_not_add', compose("@int('An agreed action could not be added to the tracker.')")),
                    )), {P + 'Recheck': OK}),
                })),
            ))),
            (P + 'Stamp_synced', http('POST', "_api/web/lists(guid'@{outputs('Ids')?['mgrList']}')/items(@{" + mid + "})",
                                      '{"ActionsSyncedOn":"@{utcNow()}"}', headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
        ))),
    ]


def grants(step, from_step):
    """Each role assignment as 'principal:role:count' – compared with what it must be (exact, nothing extra). The flow's
    own account is left out: breaking inheritance always leaves it with Full Control, and it is the Team Leader's."""
    return [
        (step + '_others', query("@body('" + from_step + "')?['value']", "@not(equals(item()?['PrincipalId'], body('Get_flow_account')?['Id']))")),
        (step, select("@body('" + step + "_others')",
                      "@concat(string(item()?['PrincipalId']), ':', string(first(item()?['RoleDefinitionBindings'])?['Name']), ':', "
                      "string(length(item()?['RoleDefinitionBindings'])))")),
    ]


FULL_NAME = "first(body('Role_full_control'))?['Name']"


def exact_access(scope_step, grants_step, principal_expr, role_name):
    return ("@and(equals(body('" + scope_step + "')?['HasUniqueRoleAssignments'], true), equals(length(body('" + grants_step + "')), 2), "
            "contains(body('" + grants_step + "'), concat(string(outputs('Ids')?['owners']), ':', " + FULL_NAME + ", ':1')), "
            "contains(body('" + grants_step + "'), concat(string(" + principal_expr + "), ':" + role_name + ":1')))")


def owners_only(suffix, list_key, item_expr):
    base = "_api/web/lists(guid'@{{outputs('ActIds')?['{0}']}}')/items(@{{{1}}})".format(list_key, item_expr)
    return [
        ('Reset' + suffix, http('POST', base + '/resetroleinheritance')),
        ('Break' + suffix, http('POST', base + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')),
        ('AddOwners' + suffix, http('POST', base + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                                   "roledefid=@{outputs('Ids')?['fullControl']})")),
    ]


# --------------------------------------------------------------------------------------------- Flow 9
def flow_action_access():
    """Keeps each action private to the Team Leader (Owners) and its technician (Read), and the technician's update
    folder theirs alone (1-to-1 Submit). It checks the permissions actually on the item and the folder – not a flag – and
    repairs anything missing or extra. Safe to repeat; it writes the action only when SharedWith changes."""
    TB = 'triggerBody()'
    A = "body('Get_action')"
    TECH = "outputs('Tech_id')"
    try_actions = seq(
        *load_ids(), *act_ids(),
        ('Get_flow_account', http('GET', '_api/web/currentuser?$select=Id')),
        ('Tracker_ready', cond("@or(equals(outputs('ActIds')?['act'], null), equals(outputs('ActIds')?['upd'], null))",
                               seq(('Run_setup_first', terminate('Failed', 'The 1-to-1 action lists were not found. Run ESG 1-to-1 | 0 Setup (1.5).'))))),
        ('Get_action', http('GET', act_uri('act', "/items(@{" + TB + "?['ID']})?$select=Id,SharedWith,Technician/Id,Technician/EMail&$expand=Technician"))),
        ('No_technician', cond("@empty(" + A + "?['Technician'])", seq(('Nobody_to_share_with', terminate('Cancelled'))))),
        ('Tech_id', compose("@" + A + "?['Technician']?['Id']")),
        ('Get_action_scope', http('GET', act_uri('act', "/items(@{" + TB + "?['ID']})?$select=HasUniqueRoleAssignments"))),
        ('Get_action_access', http('GET', act_uri('act', "/items(@{" + TB + "?['ID']})/roleassignments?$expand=Member,RoleDefinitionBindings"))),
        *grants('Action_grants', 'Get_action_access'),
        ('Action_access_ok', cond(exact_access('Get_action_scope', 'Action_grants', TECH, '1-to-1 Read'), None, seq(
            *setperm('_A', 'act', TB + "?['ID']", "outputs('Ids')?['read']", TECH, ids='ActIds'),
        ))),
        ('Folder_name', compose("@concat('u', string(" + TECH + "))")),
        ('Find_folder', http('GET', act_uri('upd', "/items?$select=Id&$filter=FSObjType eq 1 and FileLeafRef eq '@{outputs('Folder_name')}'"))),
        ('Folder_missing', cond("@empty(body('Find_folder')?['value'])", seq(
            ('Create_folder', http('POST', act_uri('upd', '/AddValidateUpdateItemUsingPath'),
                                   '{"listItemCreateInfo":{"FolderPath":{"DecodedUrl":"@{outputs(\'ActIds\')?[\'updRoot\']}"},'
                                   '"LeafName":"@{outputs(\'Folder_name\')}","UnderlyingObjectType":1},'
                                   '"formValues":[{"FieldName":"Title","FieldValue":"@{outputs(\'Folder_name\')}"}],"bNewDocumentUpdate":false}')),
            ('Created_id', query("@body('Create_folder')?['value']", "@equals(item()?['FieldName'], 'Id')")),
            ('Set_folder_from_create', set_var('varFolderId', "@int(first(body('Created_id'))?['FieldValue'])")),
        ), seq(
            ('Set_folder_found', set_var('varFolderId', "@first(body('Find_folder')?['value'])?['Id']")),
        ))),
        ('Get_folder_scope', http('GET', act_uri('upd', "/items(@{variables('varFolderId')})?$select=HasUniqueRoleAssignments"))),
        ('Get_folder_access', http('GET', act_uri('upd', "/items(@{variables('varFolderId')})/roleassignments?$expand=Member,RoleDefinitionBindings"))),
        *grants('Folder_grants', 'Get_folder_access'),
        ('Folder_access_ok', cond(exact_access('Get_folder_scope', 'Folder_grants', TECH, '1-to-1 Submit'), None, seq(
            *setperm('_F', 'upd', "variables('varFolderId')", "outputs('Ids')?['submit']", TECH, ids='ActIds'),
        ))),
        ('Shared_changed', cond("@not(equals(toLower(coalesce(" + A + "?['SharedWith'], '')), toLower(coalesce(" + A + "?['Technician']?['EMail'], ''))))", seq(
            ('Mark_shared', http('POST', act_uri('act', "/items(@{" + TB + "?['ID']})"),
                                 '{"SharedWith":"@{toLower(' + A + "?['Technician']?['EMail'])}\"}",
                                 headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
        ))),
    )
    actions = seq(('Initialize_varFolderId', init_var('varFolderId', 'integer', 0)))
    actions['Try'] = after(scope(try_actions), {'Initialize_varFolderId': OK})
    actions['Catch'] = catch('ESG 1-to-1 | 9 Action access')
    triggers = {'When_an_action_is_created_or_modified': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': LIST_TITLE['actions']},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 10
def flow_action_update():
    """Records a technician's progress update on their action. Who sent it comes from where SharePoint let it be created
    – their own update folder, which only they can add to – never from the editable Author or ActionId columns. The
    update is claimed with its etag (one run only), checked, applied to the action with the action's etag (so a Team
    Leader change in between is never overwritten), then locked to Read. Re-running it changes nothing."""
    TB = 'triggerBody()'
    U = "body('Get_update')"
    A = "body('Get_action')"
    KIND = "string(coalesce(" + U + "?['Kind'], ''))"
    MSG = "trim(string(coalesce(" + U + "?['Message'], '')))"
    OUTCOME = "string(coalesce(" + U + "?['Outcome'], ''))"
    SENDER = "outputs('Sender_id')"
    CLOSE_REQ = "or(equals(" + KIND + ", 'closeRequest'), and(equals(" + KIND + ", 'followup'), equals(" + OUTCOME + ", 'Ready')))"
    upd_base = "/items(@{" + TB + "?['ID']})"
    verdict = ("@if(not(outputs('Sender_ok')), 'Not sent from your own update folder', "
               "if(not(equals(outputs('Action_found'), true)), 'Action not found', "
               "if(not(equals(string(" + A + "?['Technician']?['Id']), string(" + SENDER + "))), 'Not your action', "
               "if(equals(" + A + "?['Status'], 'Closed'), 'The action is closed', "
               "if(not(contains(createArray('progress', 'waiting', 'followup', 'closeRequest'), " + KIND + ")), 'Unknown kind of update', "
               "if(and(contains(createArray('progress', 'waiting'), " + KIND + "), empty(" + MSG + ")), 'The update is empty', "
               "if(and(equals(" + KIND + ", 'followup'), not(contains(createArray('Satisfactory', 'Support', 'Ready'), " + OUTCOME + "))), 'Unknown follow-up outcome', "
               "if(and(" + CLOSE_REQ + ", not(equals(" + A + "?['Owner'], 'Technician'))), 'Only the Team Leader closes their own actions', ''))))))))")

    def patch_steps(sfx, action_body):
        AB = action_body
        status = ("@if(" + CLOSE_REQ + ", 'Ready for close-out', if(equals(" + KIND + ", 'waiting'), 'Waiting', "
                  "if(contains(createArray('Open', 'Waiting'), " + AB + "?['Status']), 'In progress', " + AB + "?['Status'])))")
        text = "take(" + MSG + ", 2000)"
        return [
            ('Entry' + sfx, compose({'id': "@{concat('u', string(" + TB + "?['ID']))}", 'at': '@{utcNow()}',
                                     'by': "@{coalesce(" + AB + "?['Technician']?['Title'], '')}", 'kind': '@{' + KIND + '}',
                                     'outcome': '@{' + OUTCOME + '}', 'text': '@{' + text + '}',
                                     'waitingUntil': "@{coalesce(" + U + "?['WaitingUntil'], '')}",
                                     'key': "@{take(string(coalesce(" + U + "?['ClientKey'], '')), 60)}"}, secure=True)),
            ('Patch' + sfx, compose({
                'Status': status,
                'LatestProgress': "@if(empty(" + MSG + "), coalesce(" + AB + "?['LatestProgress'], ''), " + text + ")",
                'LastUpdateOn': '@{utcNow()}',
                'LastUpdateBy': "@{coalesce(" + AB + "?['Technician']?['Title'], '')}",
                'WaitingReason': "@if(equals(" + KIND + ", 'waiting'), " + text + ", if(equals(" + KIND + ", 'progress'), '', coalesce(" + AB + "?['WaitingReason'], '')))",
                'WaitingUntil': "@if(equals(" + KIND + ", 'waiting'), coalesce(" + U + "?['WaitingUntil'], ''), if(equals(" + KIND + ", 'progress'), '', coalesce(" + AB + "?['WaitingUntil'], '')))",
                'HistoryJson': "@{string(union(json(coalesce(" + AB + "?['HistoryJson'], '[]')), createArray(outputs('Entry" + sfx + "'))))}",
            }, secure=True)),
        ]

    sel = '?$select=Id,Title,Status,Owner,LatestProgress,WaitingReason,WaitingUntil,HistoryJson,Technician/Id,Technician/Title&$expand=Technician'
    apply = seq(
        *patch_steps('', A),
        ('Apply', http('POST', act_uri('act', "/items(@{" + idstr(U + "?['ActionId']") + "})"), "@{string(outputs('Patch'))}",
                       headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': "@{" + A + "?['odata.etag']}"})),
    )
    # the action changed between reading and writing (e.g. the Team Leader saved): read it again and apply once more
    apply['Get_action_again'] = after(http('GET', act_uri('act', "/items(@{" + idstr(U + "?['ActionId']") + "})" + sel),
                                           headers={'Accept': 'application/json;odata=minimalmetadata'}), {'Apply': FAILED})
    apply['Not_recorded_meanwhile'] = after(cond(
        "@contains(string(coalesce(body('Get_action_again')?['HistoryJson'], '')), concat('\"u', string(" + TB + "?['ID']), '\"'))", None, seq(
            *patch_steps('_again', "body('Get_action_again')"),
            ('Apply_again', http('POST', act_uri('act', "/items(@{" + idstr(U + "?['ActionId']") + "})"), "@{string(outputs('Patch_again'))}",
                                 headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': "@{body('Get_action_again')?['odata.etag']}"})),
        )), {'Get_action_again': OK})

    accepted = seq(
        ('Already_recorded', cond("@contains(string(coalesce(" + A + "?['HistoryJson'], '')), concat('\"u', string(" + TB + "?['ID']), '\"'))",
                                  None, apply)),
        *setperm('_U', 'upd', TB + "?['ID']", "outputs('Ids')?['read']", SENDER, ids='ActIds'),
        ('Mark_applied', http('POST', act_uri('upd', upd_base), '{"ProcessState":"Applied","ProcessNote":""}',
                              headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
        ('Is_close_request', cond("@" + CLOSE_REQ, seq(
            ('Notice_key', compose("@concat('E19-u', string(" + TB + "?['ID']))")),
            ('Find_notice', http('GET', act_uri('notc', "/items?$select=Id&$filter=NoticeKey eq '@{outputs('Notice_key')}'"))),
            ('No_notice_yet', cond("@empty(body('Find_notice')?['value'])", seq(
                ('Notice_item', compose({'__metadata': {'type': "@{outputs('ActIds')?['notcType']}"}, 'Title': "@{outputs('Notice_key')}",
                                         'NoticeKey': "@{outputs('Notice_key')}", 'Kind': 'E19',
                                         'ActionId': "@int(" + idstr(U + "?['ActionId']") + ")", 'Status': 'Pending', 'Attempts': 0})),
                ('Create_notice', http('POST', act_uri('notc', '/items'), "@{string(outputs('Notice_item'))}", verbose=True)),
            ))),
        ))),
    )
    rejected = seq(
        ('Sender_known', cond("@outputs('Sender_ok')",
                              seq(*setperm('_R', 'upd', TB + "?['ID']", "outputs('Ids')?['read']", SENDER, ids='ActIds')),
                              seq(*owners_only('_O', 'upd', TB + "?['ID']")))),
        ('Mark_rejected', http('POST', act_uri('upd', upd_base), '{"ProcessState":"Rejected","ProcessNote":"@{outputs(\'Verdict\')}"}',
                               headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
    )
    try_actions = seq(
        *load_ids(), *act_ids(),
        ('Get_flow_account', http('GET', '_api/web/currentuser?$select=Id')),
        ('Tracker_ready', cond("@or(equals(outputs('ActIds')?['act'], null), equals(outputs('ActIds')?['upd'], null))",
                               seq(('Run_setup_first', terminate('Failed', 'The 1-to-1 action lists were not found. Run ESG 1-to-1 | 0 Setup (1.5).'))))),
        ('Get_update', http('GET', act_uri('upd', upd_base + '?$select=Id,ActionId,Kind,Outcome,Message,WaitingUntil,ClientKey,ProcessState,FileDirRef,FSObjType'),
                            headers={'Accept': 'application/json;odata=minimalmetadata'})),
        ('Still_pending', cond("@and(equals(" + U + "?['ProcessState'], 'Pending'), equals(" + U + "?['FSObjType'], 0))", None, seq(
            ('Nothing_to_do', terminate('Cancelled'))))),
        # one run only: claim it with its etag (a second run, or a trigger for an older version, gets 412 and stops)
        ('Claim', http('POST', act_uri('upd', upd_base), '{"ProcessState":"Processing"}',
                       headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': "@{" + U + "?['odata.etag']}"})),
        ('Folder_name', compose("@last(split(string(" + U + "?['FileDirRef']), '/'))")),
        ('In_own_folder', compose("@and(equals(string(" + U + "?['FileDirRef']), concat(outputs('ActIds')?['updRoot'], '/', outputs('Folder_name'))), "
                                  "startsWith(outputs('Folder_name'), 'u'))")),
        ('Sender_id', compose("@if(outputs('In_own_folder'), replace(outputs('Folder_name'), 'u', ''), '0')")),
        ('Find_folder', http('GET', act_uri('upd', "/items?$select=Id&$filter=FSObjType eq 1 and FileLeafRef eq '@{outputs('Folder_name')}'"))),
        ('Folder_found', cond("@and(outputs('In_own_folder'), not(empty(body('Find_folder')?['value'])))", seq(
            ('Get_folder_scope', http('GET', act_uri('upd', "/items(@{first(body('Find_folder')?['value'])?['Id']})?$select=HasUniqueRoleAssignments"))),
            ('Get_folder_access', http('GET', act_uri('upd', "/items(@{first(body('Find_folder')?['value'])?['Id']})/roleassignments?$expand=Member,RoleDefinitionBindings"))),
            *grants('Folder_grants', 'Get_folder_access'),
            ('Set_sender_ok', set_var('varSenderOk', exact_access('Get_folder_scope', 'Folder_grants', SENDER, '1-to-1 Submit'))),
        ))),
        ('Sender_ok', compose("@variables('varSenderOk')")),
        ('Get_action', http('GET', act_uri('act', "/items(@{" + idstr(U + "?['ActionId']") + "})" + sel),
                            headers={'Accept': 'application/json;odata=minimalmetadata'})),
        ('Action_found', after(compose("@not(empty(string(coalesce(" + A + "?['Id'], ''))))"), {'Get_action': TOLERANT})),
        ('Verdict', compose(verdict, secure=True)),
        ('Accepted', cond("@empty(outputs('Verdict'))", accepted, rejected)),
    )
    actions = seq(('Initialize_varSenderOk', init_var('varSenderOk', 'boolean', False)))
    actions['Try'] = after(scope(try_actions), {'Initialize_varSenderOk': OK})
    actions['Catch'] = catch('ESG 1-to-1 | 10 Action update')
    triggers = {'When_a_technician_sends_an_update': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@equals(triggerBody()?['ProcessState']?['Value'], 'Pending')"},
                       {'expression': "@not(equals(triggerBody()?['{IsFolder}'], true))"}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': LIST_TITLE['actionUpdates']},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


# --------------------------------------------------------------------------------------------- Flow 11
def flow_action_notice():
    """Sends the action emails waiting in 1-to-1 Action Notices: E19 (a technician asks the Team Leader to close an action)
    and E20 (deadline in 5 working days – to the technician, copy to the Team Leader). The notice is claimed with its etag
    (Sending) before the email, then marked Sent or Failed. A run that dies mid-send leaves it Sending, which the page shows
    as 'delivery unknown' – never as sent. Email can't promise exactly once; this sends at most once per claim."""
    TB = 'triggerBody()'
    N = "body('Get_notice')"
    A = "body('Get_action')"
    base = "/items(@{" + TB + "?['ID']})"
    title = esc(A + "?['Title']")
    due = "@{formatDateTime(" + local_date(A + "?['CurrentDue']") + ", 'dd-MMM-yyyy')}"
    alink = "@{concat(" + PAGE + ", '?actionId=', " + idstr(A + "?['Id']") + ")}"
    e19 = ('<p>@{' + esc(A + "?['Technician']?['Title']") + '} has asked you to close out this action:</p>'
           '<p><b>@{' + title + '}</b></p>'
           '<p><a href="' + alink + '"><b>Review it on the Actions page</b></a> – accept, or say why it is not finished yet.</p>')
    e20 = ('<p>This action is due on <b>' + due + '</b> (in 5 working days):</p><p><b>@{' + title + '}</b></p>'
           '<p>Owner: @{if(equals(' + A + "?['Owner'], 'Team Leader'), 'Team Leader', " + esc(A + "?['Technician']?['Title']") + ')}. '
           'If it is on track, nothing else is needed; if not, add an update or agree a new date.</p>'
           '<p><a href="' + alink + '"><b>Open the action</b></a></p>')
    attempts = "add(coalesce(" + N + "?['Attempts'], 0), 1)"
    try_actions = seq(
        *load_ids(), *act_ids(),
        ('Tracker_ready', cond("@or(equals(outputs('ActIds')?['act'], null), equals(outputs('ActIds')?['notc'], null))",
                               seq(('Run_setup_first', terminate('Failed', 'The 1-to-1 action lists were not found. Run ESG 1-to-1 | 0 Setup (1.5).'))))),
        ('Get_notice', http('GET', act_uri('notc', base + '?$select=Id,Kind,ActionId,Status,Attempts'),
                            headers={'Accept': 'application/json;odata=minimalmetadata'})),
        ('Still_to_send', cond("@contains(createArray('Pending', 'Retry'), coalesce(" + N + "?['Status'], ''))", None, seq(
            ('Already_handled', terminate('Cancelled'))))),
        ('Claim', http('POST', act_uri('notc', base), '{"Status":"Sending"}',
                       headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': "@{" + N + "?['odata.etag']}"})),
        ('Get_action', http('GET', act_uri('act', "/items(@{" + idstr(N + "?['ActionId']") + "})?$select=Id,Title,Status,Owner,CurrentDue,"
                                           "Technician/Title,Technician/EMail&$expand=Technician"))),
        ('Not_needed', after(cond("@or(empty(string(coalesce(" + A + "?['Id'], ''))), equals(" + A + "?['Status'], 'Closed'), and(equals(" + N + "?['Kind'], 'E19'), "
                            "not(equals(" + A + "?['Status'], 'Ready for close-out'))))", seq(
            ('Mark_not_needed', http('POST', act_uri('notc', base), '{"Status":"Cancelled","LastError":"Not sent – no longer needed"}',
                                     headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
            ('Done_not_needed', terminate('Succeeded')),
        )), {'Get_action': TOLERANT})),
        ('Send_and_record', cond("@equals(1, 1)", {
            'Send': after(cond("@equals(" + N + "?['Kind'], 'E19')",
                               seq(('Send_E19', email('@' + TL_EMAIL, "Close-out requested: @{" + esc(A + "?['Technician']?['Title']") + '}', e19))),
                               seq(('Send_E20', email('@' + A + "?['Technician']?['EMail']", 'Action due in 5 working days', e20,
                                                      cc='@' + TL_EMAIL)))), {}),
            'Mark_sent': after(http('POST', act_uri('notc', base),
                                    '{"Status":"Sent","SentOn":"@{utcNow()}","Attempts":@{' + attempts + '},"LastError":""}',
                                    headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}), {'Send': OK}),
            'Mark_failed': after(http('POST', act_uri('notc', base),
                                      '{"Status":"Failed","Attempts":@{' + attempts + '},"LastError":"The email could not be sent."}',
                                      headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'}), {'Send': FAILED}),
            'Delivery_failed': after(terminate('Failed', 'The action email could not be sent. The notice is marked Failed; the daily run retries it.'),
                                     {'Mark_failed': TOLERANT}),
        })),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 11 Action notice')}
    triggers = {'When_an_action_email_is_ready_to_send': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@contains(createArray('Pending','Retry'), triggerBody()?['Status']?['Value'])"}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': LIST_TITLE['actionNotices']},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


def action_daily_steps():
    """Flow 1's action tracker work: finish adding agreed actions (reviews released after the tracker started), create the
    5-working-day deadline reminders (one per action and deadline), and retry stuck updates and failed emails."""
    O = "items('Each_open_action')"
    due = "outputs('Due')"
    remind_from = ("@formatDateTime(addDays(concat(" + due + ", 'T12:00:00Z'), mul(-1, if(equals(outputs('Due_dow'), 6), 5, "
                   "if(equals(outputs('Due_dow'), 0), 6, 7)))), 'yyyy-MM-dd')")
    in_window = ("@and(lessOrEquals(ticks(concat(outputs('Remind_from'), 'T00:00:00Z')), ticks(concat(outputs('Today'), 'T00:00:00Z'))), "
                 "lessOrEquals(ticks(concat(outputs('Today'), 'T00:00:00Z')), ticks(concat(" + due + ", 'T00:00:00Z'))))")
    nkey = "@concat('E20-a', " + idstr(O + "?['Id']") + ", '-', " + due + ")"
    nfind = act_uri('notc', "/items?$select=Id&$filter=NoticeKey eq '@{outputs('Notice_key')}'")
    hour_ago = "ticks(addMinutes(utcNow(), -60))"
    old = "@less(ticks(coalesce(item()?['Modified'], utcNow())), " + hour_ago + ")"
    def upd_items(state):
        return act_uri('upd', "/items?$select=Id,ProcessState,Modified&$filter=FSObjType eq 0 and ProcessState eq '" + state + "'&$top=5000")

    return seq(
        *act_ids(),
        ('Tracker_here', cond("@not(equals(outputs('ActIds')?['act'], null))", seq(
            *tracker_start('D_'),
            ('Mgr_for_actions', get_items(MGR, None, top=5000)),
            ('To_sync', query("@body('Mgr_for_actions')?['value']",
                              "@and(not(empty(item()?['ReleasedOn'])), empty(item()?['ActionsSyncedOn']), "
                              "not(empty(outputs('D_Tracker_start'))), "
                              "greaterOrEquals(ticks(coalesce(item()?['ReleasedOn'], '2000-01-01T00:00:00Z')), "
                              "ticks(if(empty(outputs('D_Tracker_start')), '2100-01-01T00:00:00Z', outputs('D_Tracker_start')))))", secure=True)),
            ('Each_to_sync', foreach("@body('To_sync')", seq(
                *action_create('S_', "items('Each_to_sync')", "items('Each_to_sync')?['ReleasedOn']", 'D_'),
            ))),
            ('Get_open_actions', http('GET', act_uri('act', '/items?$select=Id,Status,CurrentDue&$top=5000'))),
            ('Open_actions', query("@body('Get_open_actions')?['value']", "@not(equals(item()?['Status'], 'Closed'))")),
            ('Each_open_action', foreach("@body('Open_actions')", seq(
                ('Due', compose('@' + local_date(O + "?['CurrentDue']"))),
                ('Has_due', cond("@not(empty(" + due + "))", seq(
                    ('Due_dow', compose("@dayOfWeek(concat(if(empty(" + due + "), '2000-01-01', " + due + "), 'T12:00:00Z'))")),
                    ('Remind_from', compose(remind_from)),
                    ('In_window', cond(in_window, seq(
                        ('Notice_key', compose(nkey)),
                        ('Find_notice', http('GET', nfind)),
                        ('No_notice_yet', cond("@empty(body('Find_notice')?['value'])", {
                            'Notice_item': after(compose({'__metadata': {'type': "@{outputs('ActIds')?['notcType']}"},
                                                          'Title': "@{outputs('Notice_key')}", 'NoticeKey': "@{outputs('Notice_key')}",
                                                          'Kind': 'E20', 'ActionId': "@int(" + idstr(O + "?['Id']") + ")",
                                                          'Status': 'Pending', 'Attempts': 0}), {}),
                            'Create_notice': after(http('POST', act_uri('notc', '/items'), "@{string(outputs('Notice_item'))}",
                                                        verbose=True), {'Notice_item': OK}),
                            # a manual re-run at the same moment may have created it (the key is unique): fine if it's there
                            'Recheck_notice': after(http('GET', nfind), {'Create_notice': FAILED}),
                            'Notice_missing': after(cond("@empty(body('Recheck_notice')?['value'])", seq(
                                ('STOP_notice_not_created', compose("@int('A deadline reminder could not be queued.')")),
                            )), {'Recheck_notice': OK}),
                        })),
                    ))),
                ))),
            ))),
            # an update stuck mid-way (Processing over an hour) or not picked up (Pending over an hour): wake Flow 10 again
            ('Get_stuck_updates', http('GET', upd_items('Processing'))),
            ('Stuck_updates', query("@body('Get_stuck_updates')?['value']", old)),
            ('Each_stuck', foreach("@body('Stuck_updates')", seq(
                ('Retry_stuck', http('POST', act_uri('upd', "/items(@{items('Each_stuck')?['Id']})"),
                                     '{"ProcessState":"Pending","ProcessNote":"Retried by the daily run"}',
                                     headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
            ))),
            ('Get_waiting_updates', http('GET', upd_items('Pending'))),
            ('Waiting_updates', query("@body('Get_waiting_updates')?['value']", old)),
            ('Each_waiting', foreach("@body('Waiting_updates')", seq(
                ('Wake_waiting', http('POST', act_uri('upd', "/items(@{items('Each_waiting')?['Id']})"),
                                      '{"ProcessNote":"Retried by the daily run"}',
                                      headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
            ))),
            # a failed email is retried (up to 3 attempts in all); after that it stays in Needs your attention
            ('Get_failed_notices', http('GET', act_uri('notc', "/items?$select=Id,Attempts&$filter=Status eq 'Failed'&$top=5000"))),
            ('Retry_notices', query("@body('Get_failed_notices')?['value']", "@less(coalesce(item()?['Attempts'], 0), 3)")),
            ('Each_retry_notice', foreach("@body('Retry_notices')", seq(
                ('Retry_notice', http('POST', act_uri('notc', "/items(@{items('Each_retry_notice')?['Id']})"), '{"Status":"Retry"}',
                                      headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
            ))),
        ))),
    )


FLOWS = [
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c01', 'name': 'ESG 1-to-1 | 0 Setup (run once)', 'build': flow_setup,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': True,
     'description': 'Creates or completes the eleven lists (and retires the 1.3 challenge list), columns, indexes, views, permission levels, group and list permissions. Safe to re-run.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c02', 'name': 'ESG 1-to-1 | 1 Daily scheduler', 'build': flow_daily,
     'connectors': ['shared_sharepointonline', 'shared_office365', 'shared_office365users'], 'on': False,
     'description': 'Daily 07:00 UK: creates each month\'s reviews, makes them private, emails links and reminders.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c03', 'name': 'ESG 1-to-1 | 2 Review submitted', 'build': flow_submitted,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Locks a submitted review, stamps the Manager Review and emails the Team Leader.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c04', 'name': 'ESG 1-to-1 | 3 Manager decision', 'build': flow_decision,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'On Complete / Close: validates, locks the review, releases the feedback and emails the technician.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c05', 'name': 'ESG 1-to-1 | 4 Team members', 'build': flow_team,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Keeps the 1-to-1 Technicians group in step with the Technicians list (Active = access to the page); removes anyone in the group without an Active row.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c06', 'name': 'ESG 1-to-1 | 5 Wellbeing', 'build': flow_wellbeing,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Wellbeing assessments: private to the person and the line manager; locks on submit, stamps completion, emails both.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c07', 'name': 'ESG 1-to-1 | 6 Feedback', 'build': flow_feedback,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Feedback from the page: makes each item Owners-only, emails it to the line manager, and flags it if the email fails.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c09', 'name': 'ESG 1-to-1 | 8 Amendment notice', 'build': flow_amendment,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Team Leader amendments: emails the technician that their 1-to-1 was amended (no contents) and records whether it was sent.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c0a', 'name': 'ESG 1-to-1 | 9 Action access', 'build': flow_action_access,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Action tracker: keeps each action visible only to the Team Leader and its technician, and each technician\'s update folder theirs alone (checks and repairs the permissions).'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c0b', 'name': 'ESG 1-to-1 | 10 Action update', 'build': flow_action_update,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Action tracker: checks a technician\'s progress update (sender from their own folder), records it on the action and locks it; queues the close-out email.'},
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c0c', 'name': 'ESG 1-to-1 | 11 Action notice', 'build': flow_action_notice,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Action tracker: sends close-out requests (to the Team Leader) and 5-working-day deadline reminders (technician, copy to the Team Leader), recording Sent or Failed.'},
]


def build_all():
    return [dict(f, json=flow_json(f['build'](), f['connectors'])) for f in FLOWS]


if __name__ == '__main__':
    for f in build_all():
        print(f['name'], len(json.dumps(f['json'])))
