"""ESG Competency Hub – cloud flows, generated as Power Automate solution flow definitions (plan K7.3).

The shape follows real exported solution flows and the ESG 1-to-1 flows that were imported and run: connection
references, environment variables as definition parameters, OpenApiConnection actions. The lessons recorded by the
1-to-1 project are applied throughout:
  * every list is reached by REST, found by its web address at run time (never a connector step naming a list);
  * writes are REST MERGE with an ETag, bodies built in a Compose and sent as @{string(outputs(...))};
  * no secure inputs/outputs on actions that do not support them; nesting at most 8 levels;
  * a runAfter that tolerates a predecessor's own failure never also tolerates Skipped;
  * Number columns may arrive as doubles (12.0), so ids are compared as whole-number text.

Nothing tenant-specific is in here: the site address is an environment variable set at import.
"""
from hub_schema import BY_KEY

SP_API = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
CONN = {'shared_sharepointonline': 'esghub_sharedsharepointonline_hub'}
ENV_SITE = 'ESG Competency Hub Site URL (esghub_CompetencyHubSiteUrl)'
ENV_VARS = [
    {'schema': 'esghub_CompetencyHubSiteUrl', 'param': ENV_SITE, 'display': 'ESG Competency Hub Site URL',
     'description': 'Full address of the Competency Hub site, e.g. https://<tenant>.sharepoint.com/sites/ESGCompetencyHub (no trailing slash).'},
]
SITE = "parameters('{0}')".format(ENV_SITE)
OK = ['Succeeded']
FAILED = ['Failed', 'TimedOut']
TOLERANT = ['Succeeded', 'Failed', 'TimedOut']
SECURE = {'secureData': {'properties': ['inputs', 'outputs']}}

# The lists the flow uses, by the key it uses in outputs('Ids'), and their web address (RootFolder name).
LIST_KEYS = {'req': BY_KEY['requests']['title'], 'act': BY_KEY['actions']['title'], 'hist': BY_KEY['history']['title'],
             'upd': BY_KEY['updates']['title'], 'people': BY_KEY['people']['title'], 'members': BY_KEY['members']['title'],
             'comps': BY_KEY['competencies']['title']}
LIST_URLS = {'req': 'requests', 'act': 'actions', 'hist': 'history', 'upd': 'updates', 'people': 'people', 'members': 'members',
             'comps': 'competencies'}
REQUEST_LIST = BY_KEY['requests']['title']
MANAGEMENT = "createArray('Team Leader', 'Group Head')"
OPEN = "createArray('Open', 'In Progress', 'Awaiting Input')"
STALE = 'This action was updated by someone else. Review the latest details and try again.'
DAY_TICKS = 864000000000
MAX_DEADLINE_MONTHS = 24   # MaxDeadlineYears = 2 (plan B.3 ACT-03; the app uses the same value)


def q(s):
    return "'" + s.replace("'", "''") + "'"


# --------------------------------------------------------------------------------------------- builders
def seq(*steps, first_after=None):
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


def http(method, uri, body=None, headers=None, meta=False):
    h = {'Accept': 'application/json;odata=' + ('minimalmetadata' if meta else 'nometadata')}
    if body is not None:
        h['Content-Type'] = 'application/json;odata=nometadata'
    h.update(headers or {})
    p = {'dataset': '@' + SITE, 'parameters/method': method, 'parameters/uri': uri, 'parameters/headers': h}
    if body is not None:
        p['parameters/body'] = body
    return {'type': 'OpenApiConnection',
            'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'HttpRequest', 'apiId': SP_API},
                       'parameters': p, 'authentication': "@parameters('$authentication')"}}


def merge(uri, body_step, if_match='*'):
    """MERGE the JSON built by a Compose step (lesson 1.3.0.2): quotes and new lines survive."""
    return http('POST', uri, "@{string(outputs('" + body_step + "'))}", headers={'X-HTTP-Method': 'MERGE', 'IF-MATCH': if_match})


def compose(value):
    return {'type': 'Compose', 'inputs': value}


def init_var(name, typ, value=None):
    v = {'name': name, 'type': typ}
    if value is not None:
        v['value'] = value
    return {'type': 'InitializeVariable', 'inputs': {'variables': [v]}}


def set_var(name, value):
    return {'type': 'SetVariable', 'inputs': {'name': name, 'value': value}}


def cond(expression, yes=None, no=None):
    return {'type': 'If', 'expression': expression, 'actions': yes or {}, 'else': {'actions': no or {}}}


def scope(actions):
    return {'type': 'Scope', 'actions': actions}


def query(frm, where):
    return {'type': 'Query', 'inputs': {'from': frm, 'where': where}}


def switch(on, cases, default):
    return {'type': 'Switch', 'expression': on, 'cases': {k: {'case': k, 'actions': v} for k, v in cases.items()},
            'default': {'actions': default}}


def terminate(status, message=None):
    i = {'runStatus': status}
    if status == 'Failed':
        i['runError'] = {'code': 'ESGHub', 'message': message or 'See the run history.'}
    return {'type': 'Terminate', 'inputs': i}


def idstr(expr):
    """A Number column as whole-number text (it may arrive as 12.0)."""
    return "first(split(string(coalesce(" + expr + ", '')), '.'))"


def idq(expr):
    """A whole-number id for a filter, or 0 when it is missing (an empty value would make the filter invalid)."""
    return "if(empty(" + idstr(expr) + "), '0', " + idstr(expr) + ")"


def esc(expr):
    """Text for use inside an OData string literal."""
    return "replace(string(coalesce(" + expr + ", '')), '''', '''''')"


def L(key, rest=''):
    """A list by its web address (/sites/…/Lists/<url>): no look-up call, and still right if the list is renamed."""
    return "_api/web/GetList('@{outputs('Ids')?['" + key + "']}')" + rest


def day_num(iso_expr):
    """'2026-10-28' -> 20261028, for comparing calendar dates (plan D.0.1: never for arithmetic)."""
    return "int(replace(" + iso_expr + ", '-', ''))"


def due_iso(dueday_expr):
    s = idstr(dueday_expr)
    return "concat(substring(" + s + ", 0, 4), '-', substring(" + s + ", 4, 2), '-', substring(" + s + ", 6, 2))"


def uk_midnight(iso_expr):
    """A calendar date as the UTC instant of UK midnight – how SharePoint stores a date-only value."""
    return "convertToUtc(concat(" + iso_expr + ", 'T00:00:00'), 'GMT Standard Time')"


def uk_form_date(iso_expr):
    """A calendar date in the site's own format (English (UK): dd/MM/yyyy) for validateUpdate form values."""
    return "formatDateTime(concat(" + iso_expr + ", 'T00:00:00Z'), 'dd/MM/yyyy')"


def long_date(iso_expr):
    return "formatDateTime(concat(" + iso_expr + ", 'T00:00:00Z'), 'd MMMM yyyy')"


def create_in_folder(key, folder_expr, values_step, body_step, leaf_expr=None):
    """Two steps: the request body as a Compose, then the call."""
    info = {'FolderPath': {'DecodedUrl': folder_expr}, 'UnderlyingObjectType': 1 if leaf_expr else 0}
    if leaf_expr:
        info['LeafName'] = {'DecodedUrl': leaf_expr}
    body = compose({'listItemCreateInfo': info, 'formValues': "@outputs('" + values_step + "')", 'bNewDocumentUpdate': False})
    call = http('POST', L(key, '/AddValidateUpdateItemUsingPath'), "@{string(outputs('" + body_step + "'))}")
    return body, call


def form(values):
    """validateUpdate form values: [{FieldName, FieldValue}], every value as text."""
    return compose([{'FieldName': k, 'FieldValue': v} for k, v in values.items()])


def fail_here(message):
    """A step that fails with a readable message, so the run goes to Catch (Terminate would skip it)."""
    return compose("@int(" + q(message) + ")")


def created_ok(call_step, check_name, message):
    """An AddValidateUpdateItemUsingPath call succeeds even when a field is refused; its result lists HasException per
    field. Any refused field stops the run with a readable message."""
    return [('Refused_' + call_step, query("@body('" + call_step + "')?['value']", "@equals(item()?['HasException'], true)")),
            (check_name, cond("@empty(body('Refused_" + call_step + "'))", None, seq((check_name + '_stop', fail_here(message)))))]


# --------------------------------------------------------------------------------------------- the flow
def flow_request_queue():
    """Applies a queued request (plan F.1, cut to RaiseAction, ExtendDeadline and MarkComplete for app 0.2.0).

    Who sent it comes from the folder it is in – the person's own Requests folder u{SiteUserId}, made by Setup with
    this flow's account – never from a typed value. The request is claimed with its ETag, copied into a transaction
    row in History/Transactions, checked against the same rules as the app, then applied with the action's ETag and
    its lock. History gets the event row; the transaction is marked Applied; the lock is released; the request is
    marked Completed. A run that stops part-way is finished by putting the request back to Submitted: every step
    checks whether it was already done."""
    TB = 'triggerBody()'
    R = "body('Get_request')"
    TX = "variables('varTx')"
    P = "outputs('Payload')"
    KEY = "string(" + TX + "?['RequestKey'])"
    SENDER = "outputs('Sender_id')"
    ME = "outputs('Requester')"
    IS_MGMT = "contains(" + MANAGEMENT + ", string(" + ME + "?['Role']))"
    TODAY = "outputs('Today')"
    EVENT_TIME = "outputs('Event_time')"
    req_item = L('req', "/items(@{" + TB + "?['ID']})")

    def finish_request(sfx, status, message_expr, result_id_expr=None):
        body = {'Status': status, 'ResultMessage': '@{' + message_expr + '}', 'ProcessedAt': '@{utcNow()}'}
        if result_id_expr:
            body['ResultId'] = '@' + result_id_expr
        return [('Request_' + status.lower() + sfx, compose(body)),
                ('Mark_' + status.lower() + sfx, merge(req_item, 'Request_' + status.lower() + sfx))]

    def tx_update(sfx, fields):
        return [('Tx_' + sfx, compose(fields)),
                ('Save_tx_' + sfx, merge(L('hist', "/items(@{" + idstr(TX + "?['Id']") + "})"), 'Tx_' + sfx))]

    def reject(sfx, message_expr):
        """Nothing has been done yet (point of no return not passed): the transaction is void, the request Rejected."""
        return seq(*tx_update('void' + sfx, {'State': 'Void', 'LastError': '@{' + message_expr + '}'}),
                   *finish_request(sfx, 'Rejected', message_expr),
                   ('Done' + sfx, terminate('Succeeded')))

    def ensure_folder(sfx, key, root_key, area_expr, leaf_expr):
        """{list}/{area}/A{id}: found by its address, created if missing."""
        path = "@{outputs('Ids')?['" + root_key + "']}/@{" + area_expr + "}"
        values, call = create_in_folder(key, path, 'Folder_values' + sfx, 'Folder_body' + sfx, leaf_expr='@{' + leaf_expr + '}')
        # by its address, not a list query: a list query on FileRef would stop working once the list passes 5,000 items
        # a first run creates it without looking: if it unexpectedly exists the create stops the run, and the
        # resubmitted (no longer first) run finds it
        return [
            ('Folder_unknown' + sfx, set_var('varFolderExists', False)),
            ('Check_folder' + sfx, cond("@not(variables('varFresh'))", seq(
                ('Find_folder' + sfx, http('GET', "_api/web/GetFolderByServerRelativePath(decodedurl='" + path + "/@{" + leaf_expr + "}')?$select=Exists")),
                ('Folder_found' + sfx, after(set_var('varFolderExists', "@and(equals(actions('Find_folder" + sfx + "')?['status'], 'Succeeded'), "
                                                                       "equals(body('Find_folder" + sfx + "')?['Exists'], true))"),
                                             {'Find_folder' + sfx: TOLERANT})),
            ))),
            ('Need_folder' + sfx, cond("@not(variables('varFolderExists'))", seq(
                ('Folder_values' + sfx, form({'Title': '@{' + leaf_expr + '}'})),
                ('Folder_body' + sfx, values),
                ('Create_folder' + sfx, call),
                *created_ok('Create_folder' + sfx, 'Folder_created' + sfx, 'A folder could not be created. See Create_folder' + sfx + '.'),
            ))),
        ]

    def commit(sfx, action_id_expr, area_key_expr, area_id_expr, event_fields, result_expr, ensure_hist=True):
        """Plan F.1.2 step 9: event row, transaction Applied, lock released, request Completed."""
        ev_key = "concat(" + KEY + ", '|1')"
        ev_key_uri = "concat(" + KEY + ", '%7C1')"
        hist_path = "@{outputs('Ids')?['histRoot']}/@{" + area_key_expr + "}/A@{" + action_id_expr + "}"
        ev_values, ev_call = create_in_folder('hist', hist_path, 'Event_values' + sfx, 'Event_body' + sfx)
        details = dict({'CompetencyId': '@int(' + area_id_expr + ')', 'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}',
                        'ProcessedAt': '@{utcNow()}'}, **event_fields.get('json', {}))
        found = "body('Find_event" + sfx + "')?['value']"
        return [
            # a committed action always has its History folder (raise makes it before release), so a first change run
            # does not look for it; if it was missing after all, that run stops and the resubmitted run creates it
            *(ensure_folder('_H' + sfx, 'hist', 'histRoot', area_key_expr, "concat('A', " + action_id_expr + ")") if ensure_hist else [
                ('Repair_folder' + sfx, cond("@not(variables('varFresh'))", seq(
                    *ensure_folder('_H' + sfx, 'hist', 'histRoot', area_key_expr, "concat('A', " + action_id_expr + ")"))))]),
            ('Check_event' + sfx, cond("@not(variables('varFresh'))", seq(
                ('Find_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + ev_key_uri + "}'"))),
                ('Event_found' + sfx, set_var('varEventId', "@int(if(empty(" + found + "), '0', " + idstr("first(" + found + ")?['Id']") + "))")),
            ))),
            ('Need_event' + sfx, cond("@equals(variables('varEventId'), 0)", seq(
                ('Event_values' + sfx, form(dict({'Title': '@{take(' + event_fields['title'] + ', 255)}', 'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}',
                                                  'RecordType': 'Action', 'RecordId': '@{' + action_id_expr + '}',
                                                  'EventType': event_fields['type'], 'RequestType': '@{' + TX + "?['RequestType']}"},
                                                 **event_fields.get('form', {})))),
                ('Event_body' + sfx, ev_values),
                ('Create_event' + sfx, ev_call),
                *created_ok('Create_event' + sfx, 'Event_created' + sfx, 'The History event row could not be created. See Create_event' + sfx + '.'),
                # the new row's Id comes back with the create; read it only if it did not
                ('Event_new_id' + sfx, query("@body('Create_event" + sfx + "')?['value']", "@equals(item()?['FieldName'], 'Id')")),
                ('Has_event_id' + sfx, cond("@empty(body('Event_new_id" + sfx + "'))", seq(
                    ('Get_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + ev_key_uri + "}'"))),
                    ('Set_event_read' + sfx, set_var('varEventId', "@int(" + idstr("first(body('Get_event" + sfx + "')?['value'])?['Id']") + ")")),
                ), seq(
                    ('Set_event_new' + sfx, set_var('varEventId', "@int(first(body('Event_new_id" + sfx + "'))?['FieldValue'])")),
                ))),
            ))),
            ('Event_details' + sfx, compose(details)),
            ('Save_event' + sfx, merge(L('hist', "/items(@{variables('varEventId')})"), 'Event_details' + sfx)),
            *tx_update('applied' + sfx, {'State': 'Applied', 'StepsDone': 'VALUES;EVENT', 'ProcessedAt': '@{utcNow()}'}),
            # this run took the lock, and only these one-at-a-time runs write Actions: release it directly.
            # A resumed run reads the action first and releases only its own lock.
            ('Release_how' + sfx, cond("@variables('varLockedHere')", seq(
                ('Release_mine_body' + sfx, compose({'PendingRequestKey': '', 'LastRequestKey': '@{' + KEY + '}'})),
                ('Release_mine' + sfx, merge(L('act', "/items(@{" + action_id_expr + "})"), 'Release_mine_body' + sfx)),
            ), seq(
                ('Get_action_now' + sfx, http('GET', L('act', "/items(@{" + action_id_expr + "})?$select=Id,PendingRequestKey,LastRequestKey"), meta=True)),
                ('Still_locked' + sfx, cond("@equals(string(coalesce(body('Get_action_now" + sfx + "')?['PendingRequestKey'], '')), " + KEY + ")", seq(
                    ('Release_body' + sfx, compose({'PendingRequestKey': '', 'LastRequestKey': '@{' + KEY + '}'})),
                    ('Release' + sfx, merge(L('act', "/items(@{" + action_id_expr + "})"), 'Release_body' + sfx,
                                            if_match="@{body('Get_action_now" + sfx + "')?['odata.etag']}")),
                ))),
            ))),
            *finish_request(sfx, 'Completed', result_expr, 'int(' + action_id_expr + ')'),
        ]

    # ---------------------------------------------------------------- RaiseAction
    AREA_R = "first(body('Get_area_R')?['value'])"
    OWNER_R = "first(body('Get_owner_R')?['value'])"
    EXISTING_R = "body('Find_existing_R')?['value']"
    TITLE = "trim(string(coalesce(" + P + "?['title'], '')))"
    DESC = "trim(string(coalesce(" + P + "?['description'], '')))"
    DUE = "string(coalesce(" + P + "?['dueIso'], ''))"
    PRIO = "string(coalesce(" + P + "?['priority'], 'Normal'))"
    DUE_OK = "and(equals(variables('varDue'), " + DUE + "), not(empty(" + DUE + ")))"
    DUE_SAFE = "if(" + DUE_OK + ", " + DUE + ", '2000-01-01')"
    MAX_DAY = "outputs('Max_due_R')"
    verdict_r = ("@if(greater(variables('varExistingId'), 0), '', "
                 "if(or(empty(" + AREA_R + "), not(or(" + IS_MGMT + ", not(empty(body('My_member_R')))))), 'Choose one of your areas.', "
                 "if(or(empty(" + OWNER_R + "), not(equals(string(" + OWNER_R + "?['Status']), 'Active')), "
                 "not(or(contains(" + MANAGEMENT + ", string(" + OWNER_R + "?['Role'])), not(empty(body('Owner_member_R')?['value']))))), "
                 "'Choose a member of this area or a Team Leader.', "
                 "if(empty(" + TITLE + "), 'Enter what needs doing.', "
                 "if(greater(length(" + TITLE + "), 255), 'Keep the title to 255 characters or fewer.', "
                 "if(empty(" + DESC + "), 'Add a short description.', "
                 "if(greater(length(" + DESC + "), 5000), 'Keep the description to 5,000 characters or fewer.', "
                 "if(not(" + DUE_OK + "), 'Choose a target date.', "
                 "if(less(" + day_num(DUE_SAFE) + ", " + day_num(TODAY) + "), 'The target date cannot be in the past.', "
                 "if(greater(" + day_num(DUE_SAFE) + ", " + day_num(MAX_DAY) + "), 'Choose a date within 2 years.', "
                 "if(not(contains(createArray('Low', 'Normal', 'High'), " + PRIO + ")), 'Choose a priority.', '')))))))))))")
    action_path = "@{outputs('Ids')?['actRoot']}/@{" + AREA_R + "?['CompetencyKey']}"
    act_values, act_call = create_in_folder('act', action_path, 'Action_values_R', 'Action_body_R')
    claims = lambda step: "@{concat('[{\"Key\":\"', first(body('" + step + "'))?['LoginName'], '\"}]')}"
    OWNER_ID_R = idstr(OWNER_R + "?['SiteUserId']")
    ACT_ID_R = "string(variables('varActionId'))"
    raise_case = seq(
        ('Get_area_R', http('GET', L('comps', "/items?$select=Id,CompetencyKey,Status&$filter=CompetencyKey eq '@{" + esc(P + "?['areaKey']") + "}' and Status eq 'Active'"))),
        ('My_member_R', query("@body('Get_my_memberships')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr(AREA_R + "?['Id']") + ")")),
        ('Get_owner_R', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status&$filter=SiteUserId eq @{" + idq(P + "?['ownerId']") + "}"))),
        ('Owner_member_R', http('GET', L('members', "/items?$select=Id&$filter=PersonId eq @{" + idq(P + "?['ownerId']") + "} and CompetencyId eq @{"
                                         + idq(AREA_R + "?['Id']") + "} and Status eq 'Active'"))),
        ('Check_existing_R', cond("@not(variables('varFresh'))", seq(
            ('Find_existing_R', http('GET', L('act', "/items?$select=Id,CompetencyId&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
            ('Existing_found_R', set_var('varExistingId', "@int(if(empty(" + EXISTING_R + "), '0', " + idstr("first(" + EXISTING_R + ")?['Id']") + "))")),
        ))),
        ('Read_due_R', set_var('varDue', "@{formatDateTime(concat(" + DUE + ", 'T00:00:00Z'), 'yyyy-MM-dd')}")),
        ('Max_due_R', after(compose("@formatDateTime(addToTime(concat(" + TODAY + ", 'T00:00:00Z'), " + str(MAX_DEADLINE_MONTHS) + ", 'Month'), 'yyyy-MM-dd')"),
                            {'Read_due_R': TOLERANT})),
        ('Verdict_R', compose(verdict_r)),
        ('Allowed_R', cond("@empty(outputs('Verdict_R'))", seq(
            ('Is_new_R', cond("@equals(variables('varExistingId'), 0)", seq(
                # both people's sign-in names in one call; the owner is the People row the checks found
                ('Get_logins_R', http('GET', "_api/web/siteusers?$select=Id,LoginName&$filter=Id eq @{" + OWNER_ID_R + "} or Id eq @{" + SENDER + "}")),
                ('Get_owner_login_R', query("@body('Get_logins_R')?['value']", "@equals(string(item()?['Id']), " + OWNER_ID_R + ")")),
                ('Get_my_login_R', query("@body('Get_logins_R')?['value']", "@equals(string(item()?['Id']), " + SENDER + ")")),
                ('Action_values_R', form({
                    'Title': '@{' + TITLE + '}', 'Description': '@{' + DESC + '}', 'Competency': '@{' + idstr(AREA_R + "?['Id']") + '}',
                    'AssignedTo': claims('Get_owner_login_R'), 'RaisedBy': claims('Get_my_login_R'),
                    'DateRaised': "@{convertFromUtc(" + EVENT_TIME + ", 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}",
                    'OriginalDueDate': '@{' + uk_form_date(DUE) + '}', 'CurrentDueDate': '@{' + uk_form_date(DUE) + '}',
                    'DueDay': '@{' + day_num(DUE) + '}', 'Status': 'Open', 'IsOpen': '1', 'Priority': '@{' + PRIO + '}',
                    'RequiresCloseOut': "@{if(equals(" + P + "?['requiresCloseOut'], true), '1', '0')}", 'ExtensionCount': '0', 'Revision': '1',
                    'SourceType': 'None', 'IsCrossCompetency': '0', 'PendingRequestKey': '@{' + KEY + '}', 'CreatedRequestKey': 'F|@{' + KEY + '}'})),
                ('Action_body_R', act_values),
                ('Create_action_R', act_call),
                *created_ok('Create_action_R', 'Action_created_R', 'The action could not be created. See Create_action_R.'),
                # it was created with this run's lock
                ('Set_locked_here_R', set_var('varLockedHere', True)),
                ('Action_new_id_R', query("@body('Create_action_R')?['value']", "@equals(item()?['FieldName'], 'Id')")),
                ('Has_action_id_R', cond("@empty(body('Action_new_id_R'))", seq(
                    ('Find_created_R', http('GET', L('act', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
                    ('Set_new_id_R', set_var('varActionId', "@int(" + idstr("first(body('Find_created_R')?['value'])?['Id']") + ")")),
                ), seq(
                    ('Set_returned_id_R', set_var('varActionId', "@int(first(body('Action_new_id_R'))?['FieldValue'])")),
                ))),
            ), seq(
                ('Set_existing_id_R', set_var('varActionId', "@variables('varExistingId')")),
            ))),
            *ensure_folder('_U_R', 'upd', 'updRoot', AREA_R + "?['CompetencyKey']", "concat('A', " + ACT_ID_R + ")"),
            *commit('_R', ACT_ID_R, AREA_R + "?['CompetencyKey']", idstr(AREA_R + "?['Id']"),
                    {'title': "concat('Action raised: ', " + TITLE + ")", 'type': 'Action Raised',
                     'json': {'NewDueDate': '@{' + uk_midnight(DUE) + '}'}},
                    "concat('ACT-', substring(concat('0000', " + ACT_ID_R + "), sub(length(concat('0000', " + ACT_ID_R + ")), 5), 5), ' raised.')"),
        ), reject('_R', "outputs('Verdict_R')"))),
    )

    # ---------------------------------------------------------------- shared by ExtendDeadline and MarkComplete
    def change_case(sfx, verdict_tail, plan_fields, values_fields, event_fields, result_expr):
        A = "body('Get_action" + sfx + "')"
        AREA_KEY = A + "?['Competency']?['CompetencyKey']"
        PENDING = "string(coalesce(" + A + "?['PendingRequestKey'], ''))"
        ALREADY = "or(equals(" + PENDING + ", " + KEY + "), equals(string(coalesce(" + A + "?['LastRequestKey'], '')), " + KEY + "))"
        UNCOMMITTED = "and(not(empty(" + PENDING + ")), equals(string(coalesce(" + A + "?['CreatedRequestKey'], '')), concat('F|', " + PENDING + ")))"
        OWNER = "equals(" + idstr(A + "?['AssignedToId']") + ", " + SENDER + ")"
        RAISER = "equals(" + idstr(A + "?['RaisedById']") + ", " + SENDER + ")"
        MEMBER = "first(body('My_member" + sfx + "'))"
        MANAGE = ("or(" + IS_MGMT + ", and(not(empty(" + MEMBER + ")), or(equals(string(" + ME + "?['Role']), 'Engineer'), "
                  "equals(" + MEMBER + "?['CanManageMeetings'], true))))")
        ctx = {'A': A, 'OWNER': OWNER, 'ALLOWED': "or(" + OWNER + ", " + RAISER + ", " + MANAGE + ")",
               'OPEN': "contains(" + OPEN + ", string(" + A + "?['Status']))", 'DUE': due_iso(A + "?['DueDay']"),
               'PLAN': "json(string(coalesce(variables('varTxPlan'), '{}')))"}
        verdict = ("@if(" + ALREADY + ", '', "
                   "if(" + UNCOMMITTED + ", 'That action could not be found.', " + verdict_tail(ctx) + "))")
        action_item = L('act', "/items(@{" + idstr(TX + "?['RecordId']") + "})")
        sel = ('?$select=Id,Title,CompetencyId,AssignedToId,RaisedById,Status,DueDay,OriginalDueDate,ExtensionCount,RequiresCloseOut,'
               'Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,Competency/CompetencyKey&$expand=Competency')
        return seq(
            ('Get_action' + sfx, http('GET', action_item + sel, meta=True)),
            ('Action_read' + sfx, after(cond("@equals(actions('Get_action" + sfx + "')?['status'], 'Succeeded')", None, seq(
                ('Action_missing' + sfx, cond("@equals(outputs('Get_action" + sfx + "')?['statusCode'], 404)", reject(sfx + '_missing', "'That action could not be found.'"),
                                              seq(('Action_unreadable' + sfx, fail_here('The action could not be read. See Get_action' + sfx + '.'))))))),
                {'Get_action' + sfx: TOLERANT})),
            ('My_member' + sfx, query("@body('Get_my_memberships')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr(A + "?['CompetencyId']") + ")")),
            *([('Read_due' + sfx, set_var('varDue', "@{formatDateTime(concat(string(coalesce(" + P + "?['newDueIso'], '')), 'T00:00:00Z'), 'yyyy-MM-dd')}"))]
              if sfx == '_X' else [('Read_due' + sfx, set_var('varDue', ''))]),
            ('Verdict' + sfx, after(compose(verdict), {'Read_due' + sfx: TOLERANT})),
            ('Allowed' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))", seq(
                ('Not_yet_applied' + sfx, cond("@" + ALREADY, None, seq(
                    # the plan is stored before anything changes, so a resumed run knows the previous values
                    ('Plan' + sfx, compose(plan_fields(ctx))),
                    *tx_update('planned' + sfx, {'State': 'Planned', 'PreviousValue': "@{string(outputs('Plan" + sfx + "'))}"}),
                    ('Set_plan_now' + sfx, set_var('varTxPlan', "@{string(outputs('Plan" + sfx + "'))}")),
                    ('Values' + sfx, compose(dict({'PendingRequestKey': '@{' + KEY + '}',
                                                   'Revision': "@add(int(" + idstr(A + "?['Revision']") + "), 1)"}, **values_fields(ctx)))),
                    ('Lock_and_values' + sfx, merge(action_item, 'Values' + sfx, if_match="@{" + A + "?['odata.etag']}")),
                    # someone else changed the action between reading and writing: nothing has been done yet
                    ('Locked' + sfx, after(cond("@equals(actions('Lock_and_values" + sfx + "')?['status'], 'Succeeded')", None, seq(
                        ('Lock_conflict' + sfx, cond("@equals(outputs('Lock_and_values" + sfx + "')?['statusCode'], 412)", reject(sfx + '_stale', q(STALE)),
                                                     seq(('Lock_failed' + sfx, fail_here('The action could not be updated. See Lock_and_values' + sfx + '.'))))))),
                        {'Lock_and_values' + sfx: TOLERANT})),
                    ('Set_locked_here' + sfx, set_var('varLockedHere', True)),
                ))),
                # a resumed run already has the stored plan from the transaction row (Set_tx_plan)
                *commit(sfx, idstr(A + "?['Id']"), AREA_KEY, idstr(A + "?['CompetencyId']"),
                        event_fields(ctx), result_expr(ctx), ensure_hist=False),
            ), reject(sfx, "outputs('Verdict" + sfx + "')"))),
        )

    NEW = "string(coalesce(" + P + "?['newDueIso'], ''))"
    NEW_OK = "and(equals(variables('varDue'), " + NEW + "), not(empty(" + NEW + ")))"
    NEW_SAFE = "if(" + NEW_OK + ", " + NEW + ", '2000-01-01')"
    REASON = "trim(string(coalesce(" + P + "?['reason'], '')))"
    NOTE = "trim(string(coalesce(" + P + "?['note'], '')))"

    def common_checks(c, not_allowed, closed_msg):
        return ("if(not(" + c['OPEN'] + "), " + q(closed_msg) + ", "
                "if(not(" + c['ALLOWED'] + "), " + q(not_allowed) + ", "
                "if(not(empty(string(coalesce(" + c['A'] + "?['PendingRequestKey'], '')))), 'This action is being updated. Try again in a minute.', "
                "if(not(equals(" + idstr(c['A'] + "?['Revision']") + ", " + idstr(TX + "?['ExpectedRevision']") + ")), " + q(STALE) + ", ")

    def extend_tail(c):
        return (common_checks(c, 'Only the owner or the people who manage this action can move its deadline.',
                              'This action is no longer open, so its deadline cannot be moved.') +
                "if(not(equals(" + idstr(c['A'] + "?['DueDay']") + ", " + idstr(P + "?['expectedDueDay']") + ")), " + q(STALE) + ", "
                "if(not(" + NEW_OK + "), 'Choose the new deadline.', "
                "if(lessOrEquals(" + day_num(NEW_SAFE) + ", int(" + idstr(c['A'] + "?['DueDay']") + ")), concat('The new deadline must be after ', " + long_date(c['DUE']) + ", '.'), "
                "if(less(" + day_num(NEW_SAFE) + ", " + day_num(TODAY) + "), 'The new deadline cannot be in the past.', "
                "if(less(length(" + REASON + "), 10), 'Give a reason of at least 10 characters.', "
                "if(greater(length(" + REASON + "), 1000), 'Keep the reason to 1,000 characters or fewer.', ''))))))))))")

    PREV_DUE = "string(" + "json(string(coalesce(variables('varTxPlan'), '{}')))?['due'])"
    EXT_N = "add(int(string(json(string(coalesce(variables('varTxPlan'), '{}')))?['ext'])), 1)"
    DAYS_LATE = "div(sub(ticks(concat(" + TODAY + ", 'T00:00:00Z')), ticks(concat(" + PREV_DUE + ", 'T00:00:00Z'))), " + str(DAY_TICKS) + ")"
    extend_case = change_case(
        '_X', extend_tail,
        lambda c: {'due': '@' + c['DUE'], 'ext': '@int(' + idstr(c['A'] + "?['ExtensionCount']") + ')', 'owner': '@' + c['OWNER']},
        lambda c: {'DueDay': '@' + day_num(NEW), 'CurrentDueDate': '@{' + uk_midnight(NEW) + '}',
                   'ExtensionCount': "@add(int(" + idstr(c['A'] + "?['ExtensionCount']") + "), 1)", 'LastExtendedOn': '@{' + EVENT_TIME + '}'},
        lambda c: {'title': "concat('Deadline moved to ', " + long_date(NEW) + ")", 'type': 'Deadline Extended',
                   'form': {'Note': '@{' + REASON + '}', 'ExtensionNumber': '@{' + EXT_N + '}'},
                   'json': {'OriginalDueDate': "@{" + c['A'] + "?['OriginalDueDate']}", 'PreviousDueDate': '@{' + uk_midnight(PREV_DUE) + '}',
                            'NewDueDate': '@{' + uk_midnight(NEW) + '}', 'WasOverdue': '@greater(' + DAYS_LATE + ', 0)',
                            'DaysOverdue': '@max(' + DAYS_LATE + ', 0)',
                            'IsOnBehalf': "@not(equals(json(string(coalesce(variables('varTxPlan'), '{}')))?['owner'], true))"}},
        lambda c: "concat('Deadline moved to ', " + long_date(NEW) + ", '.')")

    def complete_tail(c):
        return (common_checks(c, 'Only the owner or the people who manage this action can mark it as done.', 'This action is already done.') +
                "if(greater(length(" + NOTE + "), 1000), 'Keep the note to 1,000 characters or fewer.', '')))))")

    CLOSES = "not(equals(" + "json(string(coalesce(variables('varTxPlan'), '{}')))?['closeOut'], true))"
    complete_case = change_case(
        '_C', complete_tail,
        lambda c: {'status': '@string(' + c['A'] + "?['Status'])", 'closeOut': '@equals(' + c['A'] + "?['RequiresCloseOut'], true)"},
        lambda c: {'Status': "@{if(equals(" + c['A'] + "?['RequiresCloseOut'], true), 'Completed', 'Closed')}",
                   'IsOpen': "@equals(" + c['A'] + "?['RequiresCloseOut'], true)", 'DateCompleted': '@{' + EVENT_TIME + '}',
                   'DateClosed': "@if(equals(" + c['A'] + "?['RequiresCloseOut'], true), null, " + EVENT_TIME + ")",
                   'ClosedById': "@if(equals(" + c['A'] + "?['RequiresCloseOut'], true), null, int(" + SENDER + "))",
                   'CloseOutcome': "@if(equals(" + c['A'] + "?['RequiresCloseOut'], true), null, 'Completed')"},
        lambda c: {'title': "if(" + CLOSES + ", 'Action closed', 'Action marked as done')", 'type': '@{if(' + CLOSES + ", 'Closed', 'Completed')}",
                   'form': {'Note': '@{' + NOTE + '}'}},
        lambda c: "if(" + CLOSES + ", 'Action closed.', 'Marked as done; waiting for a close-out check.')")

    # ---------------------------------------------------------------- common part
    ids = {}
    for key in LIST_KEYS:
        ids[key] = "@{outputs('Site_path')}/Lists/" + BY_KEY[LIST_URLS[key]]['url']
    for key in ('req', 'act', 'hist', 'upd'):
        ids[key + 'Root'] = ids[key]
    SITE_PATH = "uriPath(" + SITE + ")"
    IN_OWN = ("and(equals(string(" + R + "?['FileDirRef']), concat(outputs('Ids')?['reqRoot'], '/', outputs('Folder_name'))), "
              "startsWith(outputs('Folder_name'), 'u'))")
    FOLDER = "outputs('Folder_item')"
    TRUSTED = ("@and(" + IN_OWN + ", not(empty(" + FOLDER + ")), "
               "equals(" + idstr(FOLDER + "?['FileSystemObjectType']") + ", '1'), "
               "equals(" + idstr(FOLDER + "?['AuthorId']") + ", " + idstr("body('Get_flow_account')?['Id']") + "), "
               "equals(" + idstr(R + "?['AuthorId']") + ", " + SENDER + "), "
               "not(empty(" + ME + ")), equals(string(" + ME + "?['Status']), 'Active'))")
    tx_values, tx_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Transactions", 'Tx_values', 'Tx_body')
    tx_find = L('hist', "/items?$select=Id,RequestKey,RequestType,RecordId,ExpectedRevision,Payload,State,FirstClaimedAt,PreviousValue"
                        "&$filter=RequestItemId eq @{" + TB + "?['ID']} and RowKind eq 'Transaction'")
    try_actions = seq(
        # the lists by their web addresses under the site (Setup made them), so no call is needed to find them
        ('Site_path', compose("@if(endsWith(" + SITE_PATH + ", '/'), take(" + SITE_PATH + ", sub(length(" + SITE_PATH + "), 1)), " + SITE_PATH + ")")),
        ('Ids', compose(ids)),
        ('Get_flow_account', http('GET', '_api/web/currentuser?$select=Id')),
        ('Get_request', http('GET', req_item + '?$select=Id,RequestKey,RequestType,TargetId,ExpectedRevision,Payload,Status,Created,AuthorId,FileDirRef,FSObjType',
                             meta=True)),
        ('Still_submitted', cond("@and(equals(string(" + R + "?['Status']), 'Submitted'), equals(" + idstr(R + "?['FSObjType']") + ", '0'))", None,
                                 seq(('Nothing_to_do', terminate('Cancelled'))))),
        # one run only: claim it with its ETag (a second run gets 412 and stops)
        ('Claim_body', compose({'Status': 'Processing'})),
        ('Claim', merge(req_item, 'Claim_body', if_match="@{" + R + "?['odata.etag']}")),
        ('Claimed', after(cond("@equals(actions('Claim')?['status'], 'Succeeded')", None, seq(
            ('Claim_conflict', cond("@equals(outputs('Claim')?['statusCode'], 412)", seq(('Not_ours', terminate('Cancelled'))),
                                    seq(('Claim_failed', fail_here('The request could not be claimed. See Claim.'))))))),
                          {'Claim': TOLERANT})),
        ('Folder_name', compose("@last(split(string(" + R + "?['FileDirRef']), '/'))")),
        ('Sender_id', compose("@if(" + IN_OWN + ", replace(outputs('Folder_name'), 'u', ''), '0')")),
        # the request folder's own item (who made it), by its address – no list query, so no 5,000-item limit
        ('Find_folder', after(http('GET', "_api/web/GetFolderByServerRelativePath(decodedurl='@{outputs('Ids')?['reqRoot']}/@{" + esc("outputs('Folder_name')") + "}')/ListItemAllFields?$select=Id,AuthorId,FileSystemObjectType"),
                              {'Sender_id': OK})),
        ('Folder_item', after(compose("@if(equals(actions('Find_folder')?['status'], 'Succeeded'), body('Find_folder'), null)"), {'Find_folder': TOLERANT})),
        ('Get_requester', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status&$filter=SiteUserId eq @{" + esc(SENDER) + "}"))),
        ('Requester', compose("@first(body('Get_requester')?['value'])")),
        # the requester comes from the folder; a request anywhere else is refused without a transaction (plan F.1.2 step 1)
        ('Trusted', cond(TRUSTED, None, seq(
            *finish_request('_untrusted', 'Rejected', "'This request was not sent from your own request folder.'"),
            ('Done_untrusted', terminate('Succeeded'))))),
        ('Get_my_memberships', http('GET', L('members', "/items?$select=Id,CompetencyId,CanManageMeetings&$filter=PersonId eq @{" + SENDER + "} and Status eq 'Active'"))),
        # the private copy: everything after this works from the transaction row, never the editable request item.
        # The claim time is kept to the minute, so a resumed run computes exactly the same event time.
        ('Claim_now', compose("@formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:00Z')")),
        ('Find_tx', http('GET', tx_find)),
        ('Need_tx', cond("@empty(body('Find_tx')?['value'])", seq(
            ('Tx_values', form({'Title': "@{concat('Request ', " + idstr(TB + "?['ID']") + ", ': ', string(" + R + "?['RequestType']))}",
                                'RowKind': 'Transaction', 'RequestKey': "@{" + R + "?['RequestKey']}", 'RequestItemId': "@{" + TB + "?['ID']}",
                                'RequestType': "@{" + R + "?['RequestType']}", 'RecordType': 'Action',
                                'RecordId': "@{" + idstr(R + "?['TargetId']") + "}", 'ExpectedRevision': "@{" + idstr(R + "?['ExpectedRevision']") + "}",
                                'Payload': "@{" + R + "?['Payload']}", 'State': 'Received', 'Attempts': '1',
                                'FirstClaimedAt': "@{convertFromUtc(outputs('Claim_now'), 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}"})),
            ('Tx_body', tx_values),
            ('Create_tx', tx_call),
            *created_ok('Create_tx', 'Tx_created', 'The transaction row could not be created. See Create_tx.'),
            # a first run: nothing for this request can exist yet, so the "already done?" look-ups are skipped
            ('Set_fresh', set_var('varFresh', True)),
            ('Tx_new_id', query("@body('Create_tx')?['value']", "@equals(item()?['FieldName'], 'Id')")),
            ('Has_tx_id', cond("@empty(body('Tx_new_id'))", seq(
                ('Get_tx', http('GET', tx_find)),
                ('Set_tx_read', set_var('varTx', "@first(body('Get_tx')?['value'])")),
            ), seq(
                ('Tx_new', compose({'Id': "@int(first(body('Tx_new_id'))?['FieldValue'])", 'RequestKey': "@{" + R + "?['RequestKey']}",
                                    'RequestType': "@{" + R + "?['RequestType']}", 'RecordId': "@" + R + "?['TargetId']",
                                    'ExpectedRevision': "@" + R + "?['ExpectedRevision']", 'Payload': "@" + R + "?['Payload']",
                                    'State': 'Received', 'FirstClaimedAt': "@{outputs('Claim_now')}", 'PreviousValue': None})),
                ('Set_tx_new', set_var('varTx', "@outputs('Tx_new')")),
            ))),
        ), seq(
            ('Set_tx', set_var('varTx', "@first(body('Find_tx')?['value'])")),
        ))),
        ('Set_tx_id', set_var('varTxId', "@int(" + idstr(TX + "?['Id']") + ")")),
        ('Set_tx_plan', set_var('varTxPlan', "@{coalesce(" + TX + "?['PreviousValue'], '{}')}")),
        # the first claim's time is kept on the transaction row; a run interrupted before saving it saves it now
        ('Claim_time', compose("@coalesce(" + TX + "?['FirstClaimedAt'], outputs('Claim_now'))")),
        ('Need_claim_time', cond("@empty(string(coalesce(" + TX + "?['FirstClaimedAt'], '')))", seq(
            ('Claimed_at', compose({'FirstClaimedAt': "@{outputs('Claim_time')}"})),
            ('Save_claimed_at', merge(L('hist', "/items(@{variables('varTxId')})"), 'Claimed_at')),
        ))),
        # plan F.1.2 step 4: the request's Created time if within 30 minutes before the first claim, else the claim time
        ('Event_time', compose("@if(and(greaterOrEquals(ticks(" + R + "?['Created']), sub(ticks(outputs('Claim_time')), 18000000000)), "
                               "lessOrEquals(ticks(" + R + "?['Created']), ticks(outputs('Claim_time')))), " + R + "?['Created'], outputs('Claim_time'))")),
        ('Today', compose("@convertFromUtc(" + EVENT_TIME + ", 'GMT Standard Time', 'yyyy-MM-dd')")),
        ('Already_final', cond("@contains(createArray('Applied', 'Void', 'Rolled Back'), string(" + TX + "?['State']))", seq(
            ('Final_status', compose("@if(equals(string(" + TX + "?['State']), 'Applied'), 'Completed', 'Rejected')")),
            ('Final_body', compose({'Status': "@{outputs('Final_status')}"})),
            ('Mirror_final', merge(req_item, 'Final_body')),
            ('Done_already', terminate('Succeeded'))))),
        ('Payload', compose("@json(string(" + TX + "?['Payload']))")),
        ('Payload_read', after(cond("@equals(actions('Payload')?['status'], 'Succeeded')", None, reject('_payload', "'The request could not be read.'")),
                               {'Payload': TOLERANT})),
        ('By_type', switch("@string(" + TX + "?['RequestType'])",
                           {'RaiseAction': raise_case, 'ExtendDeadline': extend_case, 'MarkComplete': complete_case},
                           reject('_type', "'This kind of request is not handled yet.'"))),
    )
    fail_body = {'Status': 'Failed', 'ResultMessage': 'This change has not been recorded yet. A Competency Hub administrator can see it in History.'}
    catch = after(scope(seq(
        ('Failed_body', compose(fail_body)),
        ('Mark_failed', merge(req_item, 'Failed_body')),
        ('Has_tx', after(cond("@greater(variables('varTxId'), 0)", seq(
            ('Tx_failed_body', compose({'State': 'Failed', 'LastError': "@{concat('Run ', workflow()?['run']?['name'], ' failed. See its run history.')}"})),
            ('Mark_tx_failed', merge(L('hist', "/items(@{variables('varTxId')})"), 'Tx_failed_body')),
        )), {'Mark_failed': TOLERANT})),
        ('Terminate_failed', terminate('Failed', 'The Try scope failed. See the failed action in the run history.')),
    )), {'Try': FAILED})
    actions = seq(('Initialize_varTx', init_var('varTx', 'object', {})),
                  ('Initialize_varTxId', init_var('varTxId', 'integer', 0)),
                  ('Initialize_varTxPlan', init_var('varTxPlan', 'string', '{}')),
                  ('Initialize_varDue', init_var('varDue', 'string', '')),
                  ('Initialize_varActionId', init_var('varActionId', 'integer', 0)),
                  ('Initialize_varFresh', init_var('varFresh', 'boolean', False)),
                  ('Initialize_varExistingId', init_var('varExistingId', 'integer', 0)),
                  ('Initialize_varFolderExists', init_var('varFolderExists', 'boolean', False)),
                  ('Initialize_varEventId', init_var('varEventId', 'integer', 0)),
                  ('Initialize_varLockedHere', init_var('varLockedHere', 'boolean', False)))
    actions['Try'] = after(scope(try_actions), {'Initialize_varLockedHere': OK})
    actions['Catch'] = catch
    triggers = {'When_a_request_is_submitted': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 2},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@equals(triggerBody()?['Status']?['Value'], 'Submitted')"},
                       {'expression': "@not(equals(triggerBody()?['{IsFolder}'], true))"}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': REQUEST_LIST},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)


def definition(triggers, actions):
    params = {'$connections': {'defaultValue': {}, 'type': 'Object'},
              '$authentication': {'defaultValue': {}, 'type': 'SecureObject'}}
    for ev in ENV_VARS:
        params[ev['param']] = {'defaultValue': '', 'type': 'String', 'metadata': {'schemaName': ev['schema'], 'description': ev['description']}}
    return {'$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
            'contentVersion': '1.0.0.0', 'parameters': params, 'triggers': triggers, 'actions': actions}


def flow_json(defn, connectors):
    refs = {c: {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': CONN[c]}, 'api': {'name': c}} for c in connectors}
    return {'properties': {'connectionReferences': refs, 'definition': defn}, 'schemaVersion': '1.0.0.0'}


FLOWS = [
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f02', 'name': 'ESG Competency Hub | 2 Request queue', 'build': flow_request_queue,
     'connectors': ['shared_sharepointonline'], 'on': False,
     'description': 'Applies the requests people send from the Competency Hub page: raise an action, move its deadline, mark it as done.'},
]


def build_all():
    return [dict(f, json=flow_json(f['build'](), f['connectors'])) for f in FLOWS]
