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
CH = LIST_TITLE['challenges']
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


def email(to, subject, body):
    return _conn('shared_office365', MAIL_API, 'SendEmailV2',
                 {'emailMessage/To': to, 'emailMessage/Subject': subject, 'emailMessage/Body': body,
                  'emailMessage/Importance': 'Normal'}, True)


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
        ('Get_lists', http('GET', '_api/web/lists?$select=Id,Title,RootFolder/Name&$expand=RootFolder', secure=False)),
        ('List_monthly_reviews', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'MonthlyReviews')")),
        ('List_manager_reviews', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'ManagerReviews')")),
        ('Ids', compose({'owners': "@body('Get_owners_group')?['Id']",
                         'fullControl': "@first(body('Role_full_control'))?['Id']",
                         'edit': "@first(body('Role_edit'))?['Id']",
                         'read': "@first(body('Role_read'))?['Id']",
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
                                    '"WriteSecurity":@{coalesce(items(\'Each_list\')?[\'writeSecurity\'], 1)}}')),
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
               '<p>Next: turn on flows 2, 3, 4, 5, 6 and then 1 (GO_LIVE_RUNBOOK Phase 7) and check each list\'s permissions page.</p>')

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
    e12 = ("<p>The wellbeing review agreed with @{items('Each_review_due')?['Technician']?['Title']} is due on "
           "@{formatDateTime(" + local_date("items('Each_review_due')?['NextReviewDate']") + ", 'dd-MMM-yyyy')}. Arrange the review "
           "conversation, or start a new assessment if one is needed.</p>"
           '<p><a href="' + wblink("items('Each_review_due')?['ID']") + '"><b>Open the last assessment</b></a></p>')
    e7 = ("<p>The daily 1-to-1 run found these problems:</p><p>@{join(variables('varProblems'), '<br>')}</p>"
          '<p><a href="@{' + RUN_LINK + '}">Open the run</a></p>')
    snapshot_where = ("@and(or(empty(trim(coalesce(item()?['AppraisalYear'], ''))), equals(trim(coalesce(item()?['AppraisalYear'], '')), "
                      "outputs('AppraisalYear'))), or(equals(item()?['AppliesTo']?['Value'], 'Shared'), "
                      "equals(toLower(coalesce(item()?['Technician']?['Email'], '')), toLower(" + T + "?['Technician']?['Email']))))")
    tech_try = seq(
        ('Set_varTechAad', dict(set_var('varTechAad', "@toLower(coalesce(" + T + "?['TechnicianAadId'], ''))"), runtimeConfiguration={'secureData': {'properties': ['inputs']}})),
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
            ('Too_many', cond("@greater(length(body('My_expectations')), 10)", seq(
                ('Note_too_many', append('varProblems', "@concat(" + T + "?['Title'], ': more than 10 active expectations – only the "
                                                         "first 10 by SortOrder were used.')"))))),
            ('Snapshot', select("@take(body('My_expectations'), 10)", secure=True, mapping=
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
        ('Get_expectations', get_items(LIST_TITLE['exp'], 'Active eq 1', top=500, order='SortOrder asc')),
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
        ('List_wellbeing', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'WellbeingAssessments')", secure=True)),
        ('Wellbeing_list_exists', cond("@not(empty(body('List_wellbeing')))", {
            # A failure here must not stop the daily problem email (E7): it is noted and the run carries on.
            'WellbeingTry': after(scope(seq(
                # REST by list GUID, not the connector's Get items: a connector step naming this list would stop the flow
                # being saved/turned on until setup has created the list (upgrade from 1.0).
                ('Get_wellbeing', http('GET', "_api/web/lists(guid'@{first(body('List_wellbeing'))?['Id']}')/items?$select=ID,NextReviewDate,CompletedOn,"
                                       "Technician/Title,Technician/EMail&$expand=Technician&$filter=AssessmentStatus eq 'Completed'&$top=5000")),
                ('Today', compose("@formatDateTime(outputs('ukNow'), 'yyyy-MM-dd')")),
                ('In7', compose("@formatDateTime(addDays(outputs('ukNow'), 7), 'yyyy-MM-dd')")),
                # only assessments the flow itself completed (CompletedOn is stamped by Flow 5), for someone still active
                ('Reviews_due', query("@body('Get_wellbeing')?['value']",
                                      "@and(contains(createArray(outputs('Today'), outputs('In7')), " + local_date("item()?['NextReviewDate']") + "), "
                                      "not(empty(item()?['CompletedOn'])), "
                                      "contains(body('Active_tech_emails'), toLower(coalesce(item()?['Technician']?['EMail'], '#none'))))", secure=True)),
                ('Each_review_due', foreach("@body('Reviews_due')", seq(
                    ('Send_E12', email('@' + TL_EMAIL, "Wellbeing review @{if(equals(" + local_date("items('Each_review_due')?['NextReviewDate']") +
                                       ", outputs('Today')), 'due today', 'due in 7 days')}: @{items('Each_review_due')?['Technician']?['Title']}", e12)),
                ))),
            )), {}),
            'WellbeingCatch': after(scope(seq(
                ('Note_wellbeing_failed', append('varProblems', 'Wellbeing review reminders could not be checked today. Open the run history for details.')),
            )), {'WellbeingTry': FAILED}),
        })),
        ('List_challenges', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneChallenges')", secure=True)),
        ('Challenges_list_exists', cond("@not(empty(body('List_challenges')))", {
            # An open challenge not agreed by its close-by date closes as Not agreed (it stays flagged; the line manager can
            # reopen it). The person's access to their challenge goes back to Read. A failure is noted, never fatal.
            'ChallengeTry': after(scope(seq(
                # REST only: this flow is on during an upgrade, before Setup has added these columns
                ('Open_challenges', http('GET', "_api/web/lists(guid'@{outputs('Ids')?['mgrList']}')/items?$select=ID,Title,ChallengeCloseBy,ChallengeItemId,ChallengeTlAgreedOn,ChallengeTechAgreedOn,"
                                         "Technician/Name&$expand=Technician&$filter=ChallengeState eq 'Open'&$top=5000")),
                ('ChToday', compose("@formatDateTime(outputs('ukNow'), 'yyyy-MM-dd')")),
                ('Past_close_by', query("@body('Open_challenges')?['value']",
                                        "@and(not(empty(item()?['ChallengeCloseBy'])), less(ticks(concat(" + local_date("item()?['ChallengeCloseBy']") + ", 'T00:00:00Z')), "
                                        "ticks(concat(outputs('ChToday'), 'T00:00:00Z'))))", secure=True)),
                ('Each_past_close_by', foreach("@body('Past_close_by')", seq(
                    # both had agreed but the closing step never ran (a failed save, or Flow 7 off): it closes as Agreed
                    ('Outcome', compose("@if(and(not(empty(items('Each_past_close_by')?['ChallengeTlAgreedOn'])), "
                                        "not(empty(items('Each_past_close_by')?['ChallengeTechAgreedOn']))), 'Agreed', 'Not agreed')")),
                    ('Close_not_agreed', http('POST', "_api/web/lists(guid'@{outputs('Ids')?['mgrList']}')/items(@{items('Each_past_close_by')?['ID']})",
                                              '{"ChallengeState":"@{outputs(\'Outcome\')}","ChallengeClosedOn":"@{utcNow()}"}',
                                              headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
                    ('Has_item', cond("@not(empty(" + idstr("items('Each_past_close_by')?['ChallengeItemId']") + "))", seq(
                        ensure_user('Ensure_challenger', "items('Each_past_close_by')?['Technician']?['Name']"),
                        ('ChIds', compose({'chList': "@first(body('List_challenges'))?['Id']"})),
                        *setperm('_X', 'chList', idnum("items('Each_past_close_by')?['ChallengeItemId']"), "outputs('Ids')?['read']",
                                 "body('Ensure_challenger')?['Id']", ids='ChIds'),
                        ('Show_closed', http('POST', "_api/web/lists(guid'@{outputs('ChIds')?['chList']}')/items(@{" + idnum("items('Each_past_close_by')?['ChallengeItemId']") + "})",
                                             '{"ChallengeStatus":"@{outputs(\'Outcome\')}"}', headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'})),
                    ))),
                ))),
            )), {}),
            'ChallengeCatch': after(scope(seq(
                ('Note_challenges_failed', append('varProblems', 'Challenges past their close-by date could not be closed today. Open the run history for details.')),
            )), {'ChallengeTry': FAILED}),
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
    )
    actions['Try'] = after(scope(try_actions), {'AppraisalYear': OK})
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


# --------------------------------------------------------------------------------------------- Flow 7
CHALLENGE_HOLDERS = ("@and(equals(item()?['Member']?['PrincipalType'], 1), or(contains(string(item()?['RoleDefinitionBindings']), '1-to-1 Edit'), "
                     "contains(string(item()?['RoleDefinitionBindings']), '1-to-1 Read')))")


def close_by(uk_now):
    """End of the month (UK date); if fewer than 7 days are left, the end of the next month."""
    last = "formatDateTime(addDays(addToTime(startOfMonth(" + uk_now + "), 1, 'Month'), -1), 'yyyy-MM-dd')"
    nxt = "formatDateTime(addDays(addToTime(startOfMonth(" + uk_now + "), 2, 'Month'), -1), 'yyyy-MM-dd')"
    return "@if(less(sub(dayOfMonth(" + last + "), dayOfMonth(" + uk_now + ")), 7), " + nxt + ", " + last + ")"


def flow_challenge():
    """A technician challenges parts of their latest released feedback (the expectation ratings, the overall feedback or
    the agreed actions). The trusted state lives on the Manager Review, which the technician can only read.
    First run (item not yet locked): accept only from the review's own technician, on their latest released review that
    has never been challenged; make the item private to them (1-to-1 Edit) and the Owners; open the challenge on the
    Manager Review and email the line manager (E14). Anything else: Owners-only and Rejected.
    Later runs: the trusted person is the single holder. While open, copy their sections and their agreement; when the
    line manager has also agreed (recorded on the Manager Review only) close it as Agreed and lock the item to Read.
    Open again while the holder only has Read = the line manager reopened it: give Edit back and email them (E15).
    Closed: make sure the item is Read and shows the review's state. Flow 1 closes it as Not agreed after its close-by date."""
    TB = 'triggerBody()'
    BASE = "_api/web/lists(guid'@{outputs('ChIds')?['chList']}')/items(@{" + TB + "?['ID']})"
    MRO = "outputs('Mr')"
    H = "outputs('Holder')"
    month = "@{formatDateTime(concat(" + MRO + "?['MonthKey'], '-01'), 'MMMM yyyy')}"
    e14 = ('<p><b>@{' + esc(MRO + "?['Technician']?['DisplayName']") + '}</b> has challenged part of your feedback on their ' + month + ' 1-to-1. '
           'Talk it through with them – the challenged parts are the topics for that conversation.</p>'
           '<p><a href="' + link(MRO + "?['ReviewItemId']") + '"><b>Open the review</b></a></p>'
           "<p style=\"color:#666\">It closes when you have both agreed, or as Not agreed on @{formatDateTime(outputs('CloseBy'), 'dd-MMM-yyyy')} "
           '(it stays flagged, and you can reopen it at any time).</p>')
    e15 = ('<p>Your line manager has reopened the challenge on your ' + month + ' 1-to-1 feedback. Have a look and agree it when you are happy.</p>'
           '<p><a href="' + link(MRO + "?['ReviewItemId']") + '"><b>Open my review</b></a></p>')
    valid_first = ("@and(not(equals(" + MRO + ", null)), not(empty(" + MRO + "?['ReleasedOn'])), "
                   "equals(toLower(coalesce(" + TB + "?['Author']?['Email'], '#author')), toLower(coalesce(" + MRO + "?['Technician']?['Email'], '#tech'))), "
                   "empty(coalesce(" + MRO + "?['ChallengeState']?['Value'], '')), equals(length(body('Later_released')), 0), "
                   "startsWith(trim(coalesce(" + TB + "?['SectionsJson'], '')), '['), endsWith(trim(coalesce(" + TB + "?['SectionsJson'], '')), ']'), "
                   "less(length(coalesce(" + TB + "?['SectionsJson'], '')), 20001))")
    try_actions = seq(
        *load_ids(),
        ('List_challenges', query("@body('Get_lists')?['value']", "@equals(item()?['RootFolder']?['Name'], 'OneToOneChallenges')", secure=True)),
        ('ChIds', compose({'chList': "@first(body('List_challenges'))?['Id']"})),
        ('Check_challenges_list', cond("@equals(outputs('ChIds')?['chList'], null)", seq(
            ('STOP_run_the_setup_flow_again', compose("@int('The 1-to-1 Challenges list was not found. Run ESG 1-to-1 | 0 Setup again.')"))))),
        ('Get_item_scope', http('GET', BASE + '?$select=HasUniqueRoleAssignments')),
        ('Get_assignments', http('GET', BASE + '/roleassignments?$expand=Member,RoleDefinitionBindings&$select=PrincipalId,Member/Id,'
                                 'Member/Title,Member/LoginName,Member/Email,Member/PrincipalType,RoleDefinitionBindings/Name')),
        ('Holders', query("@body('Get_assignments')?['value']", CHALLENGE_HOLDERS, secure=True)),
        # a blank id must take the normal (silent) reject path, not fail the run (that would email the TL every time)
        ('Get_mr', get_items(MGR, "ID eq @{if(empty(" + idstr(TB + "?['ManagerReviewId']") + "), '0', " + idstr(TB + "?['ManagerReviewId']") + ")}", top=1)),
        ('Mr', compose("@first(body('Get_mr')?['value'])", secure=True)),
        ('Get_same_person', get_items(MGR, "TechnicianAadId eq '@{coalesce(" + MRO + "?['TechnicianAadId'], '#none')}'", top=500)),
        ('Later_released', query("@body('Get_same_person')?['value']",
                                 "@and(not(empty(item()?['ReleasedOn'])), greater(int(replace(coalesce(item()?['MonthKey'], '0'), '-', '')), int(replace(coalesce(" + MRO + "?['MonthKey'], '0'), '-', ''))))",
                                 secure=True)),
        ('ukNow', compose("@convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-ddTHH:mm:ss')")),
        ('CloseBy', compose(close_by("outputs('ukNow')"))),
        ('First_run', cond("@equals(body('Get_item_scope')?['HasUniqueRoleAssignments'], false)",
            seq(
                ('Accept', cond(valid_first,
                    seq(
                      # two challenges sent at once: look again just before accepting, so only the first is taken
                      ('Recheck_mr', get_items(MGR, "ID eq @{" + MRO + "?['ID']}", top=1)),
                      ('Still_unchallenged', cond("@empty(coalesce(first(body('Recheck_mr')?['value'])?['ChallengeState']?['Value'], ''))",
                       seq(
                        ensure_user('Ensure_user', TB + "?['Author']?['Claims']"),
                        *setperm('', 'chList', TB + "?['ID']", "outputs('Ids')?['edit']", "body('Ensure_user')?['Id']", ids='ChIds'),
                        ('Open_on_review', patch_item(MGR, '@' + MRO + "?['ID']", {
                            'Title': '@' + MRO + "?['Title']",
                            'ChallengeState/Value': 'Open',
                            'ChallengeSectionsJson': '@' + TB + "?['SectionsJson']",
                            'ChallengeItemId': '@' + TB + "?['ID']",
                            'ChallengeOpenedOn': '@utcNow()',
                            'ChallengeCloseBy': "@outputs('CloseBy')",
                            'ChallengeTlAgreedOn': None, 'ChallengeTechAgreedOn': None, 'ChallengeClosedOn': None})),
                        ('Mark_open', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'ChallengeStatus/Value': 'Open',
                                                                          'TechAgreedOn': None, 'MonthKey': '@' + MRO + "?['MonthKey']"})),
                        ('Send_E14', email('@' + TL_EMAIL, "1-to-1 feedback challenged: @{" + MRO + "?['Technician']?['DisplayName']}, " + month, e14)),
                       ),
                       seq(
                        ('Late_break', http('POST', BASE + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')),
                        ('Late_owners', http('POST', BASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                                          "roledefid=@{outputs('Ids')?['fullControl']})")),
                        ('Mark_late_rejected', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'ChallengeStatus/Value': 'Rejected'})),
                       ))),
                    ),
                    seq(
                        # not from this review's technician, not their latest released review, already challenged, or empty:
                        # nobody but the Owners can see it any more
                        ('Reject_break', http('POST', BASE + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')),
                        ('Reject_owners', http('POST', BASE + "/roleassignments/addroleassignment(principalid=@{outputs('Ids')?['owners']},"
                                                              "roledefid=@{outputs('Ids')?['fullControl']})")),
                        ('Mark_rejected', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'ChallengeStatus/Value': 'Rejected'})),
                    ))),
            ),
            seq(
                ('No_holder', cond("@equals(length(body('Holders')), 0)", seq(('Rejected_or_owners_only', terminate('Cancelled'))))),
                ('Too_many_holders', cond("@greater(length(body('Holders')), 1)", seq(
                    ('More_than_one_person_holds_it', terminate('Failed', 'More than one person has access to this challenge. Check its permissions.')),
                ))),
                ('Holder', compose("@first(body('Holders'))", secure=True)),
                # the item must still be the one the review points at (they could have changed ManagerReviewId)
                ('Not_this_review', cond("@or(equals(" + MRO + ", null), not(equals(" + idstr(MRO + "?['ChallengeItemId']") + ", string(" + TB + "?['ID']))), "
                                         "not(equals(toLower(coalesce(" + H + "?['Member']?['Email'], '#holder')), toLower(coalesce(" + MRO + "?['Technician']?['Email'], '#tech')))))",
                                         seq(
                                             ('Mismatch_lock', cond("@contains(string(" + H + "?['RoleDefinitionBindings']), '1-to-1 Edit')", seq(
                                                 *setperm('_M', 'chList', TB + "?['ID']", "outputs('Ids')?['read']", H + "?['Member']?['Id']", ids='ChIds'),
                                             ))),
                                             ('Ignore_mismatch', terminate('Cancelled'))))),
                ('Holder_can_edit', compose("@contains(string(" + H + "?['RoleDefinitionBindings']), '1-to-1 Edit')")),
                ('Is_open', compose("@equals(" + MRO + "?['ChallengeState']?['Value'], 'Open')")),
                ('While_open', cond("@and(outputs('Is_open'), outputs('Holder_can_edit'))",
                    seq(
                        # the line manager's agreement is read only from the Manager Review (the technician can't write it)
                        ('Both_agreed', compose("@and(not(empty(" + TB + "?['TechAgreedOn'])), not(empty(" + MRO + "?['ChallengeTlAgreedOn'])))")),
                        # the topics are fixed when it is accepted (what the line manager agrees to can't change afterwards)
                        ('Update_review', patch_item(MGR, '@' + MRO + "?['ID']", {
                            'Title': '@' + MRO + "?['Title']",
                            'ChallengeTechAgreedOn': "@if(empty(" + TB + "?['TechAgreedOn']), null, coalesce(" + MRO + "?['ChallengeTechAgreedOn'], utcNow()))",
                            'ChallengeState/Value': "@if(outputs('Both_agreed'), 'Agreed', 'Open')",
                            'ChallengeClosedOn': "@if(outputs('Both_agreed'), utcNow(), null)"})),
                        ('Agreed', cond("@outputs('Both_agreed')", seq(
                            *setperm('_A', 'chList', TB + "?['ID']", "outputs('Ids')?['read']", H + "?['Member']?['Id']", ids='ChIds'),
                            ('Mark_agreed', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'ChallengeStatus/Value': 'Agreed'})),
                        ))),
                    ),
                    seq(
                        ('Reopened', cond("@outputs('Is_open')",
                            seq(
                                *setperm('_R', 'chList', TB + "?['ID']", "outputs('Ids')?['edit']", H + "?['Member']?['Id']", ids='ChIds'),
                                ('Clear_review_agreement', patch_item(MGR, '@' + MRO + "?['ID']", {'Title': '@' + MRO + "?['Title']", 'ChallengeTechAgreedOn': None})),
                                ('Clear_item_agreement', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']", 'TechAgreedOn': None,
                                                                                             'ChallengeStatus/Value': 'Open'})),
                                ('Send_E15', email('@' + H + "?['Member']?['Email']", 'Your 1-to-1 challenge has been reopened', e15)),
                            ),
                            seq(
                                ('Lock_if_editable', cond("@outputs('Holder_can_edit')", seq(
                                    *setperm('_C', 'chList', TB + "?['ID']", "outputs('Ids')?['read']", H + "?['Member']?['Id']", ids='ChIds'),
                                ))),
                                ('Show_state', cond("@and(not(empty(coalesce(" + MRO + "?['ChallengeState']?['Value'], ''))), "
                                                    "not(equals(" + TB + "?['ChallengeStatus']?['Value'], " + MRO + "?['ChallengeState']?['Value'])))", seq(
                                    ('Mirror_state', patch_item(CH, '@' + TB + "?['ID']", {'Title': '@' + TB + "?['Title']",
                                                                                         'ChallengeStatus/Value': '@' + MRO + "?['ChallengeState']?['Value']"})),
                                ))),
                            ))),
                    ))),
            ))),
    )
    actions = {'Try': after(scope(try_actions), {}), 'Catch': catch('ESG 1-to-1 | 7 Challenge')}
    triggers = {'When_a_challenge_is_created_or_modified': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 5},
        'splitOn': "@triggerOutputs()?['body/value']",
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': CH},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


FLOWS = [
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c01', 'name': 'ESG 1-to-1 | 0 Setup (run once)', 'build': flow_setup,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': True,
     'description': 'Creates or completes the eight lists, columns, indexes, views, permission levels, group and list permissions. Safe to re-run.'},
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
    {'id': '6f3c2a41-8d2e-4b7a-9c15-3e1f0a5b7c08', 'name': 'ESG 1-to-1 | 7 Challenge', 'build': flow_challenge,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Challenges of released feedback: checks them, keeps them private, records the state on the Manager Review and emails both.'},
]


def build_all():
    return [dict(f, json=flow_json(f['build'](), f['connectors'])) for f in FLOWS]


if __name__ == '__main__':
    for f in build_all():
        print(f['name'], len(json.dumps(f['json'])))
