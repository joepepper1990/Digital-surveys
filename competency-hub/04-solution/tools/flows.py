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
CONN = {'shared_sharepointonline': 'esghub_sharedsharepointonline_hub', 'shared_office365': 'esghub_sharedoffice365_hub'}
OUTLOOK_API = '/providers/Microsoft.PowerApps/apis/shared_office365'
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
LIST_URLS = {'req': 'requests', 'act': 'actions', 'hist': 'history', 'upd': 'updates', 'people': 'people', 'members': 'members',
             'comps': 'competencies', 'notif': 'notifications', 'settings': 'settings'}
LIST_KEYS = {k: BY_KEY[v]['title'] for k, v in LIST_URLS.items()}
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


# --------------------------------------------------------------------------------------------- emails (plan B.5, F.4.2)
def site_and_ids():
    """The site's address and every list's web address under it (Setup made them), so no call finds the lists."""
    path = "uriPath(" + SITE + ")"
    ids = {}
    for key in LIST_KEYS:
        ids[key] = "@{outputs('Site_path')}/Lists/" + BY_KEY[LIST_URLS[key]]['url']
    for key in ('req', 'act', 'hist', 'upd', 'notif'):
        ids[key + 'Root'] = ids[key]
    return [('Site_path', compose("@if(endsWith(" + path + ", '/'), take(" + path + ", sub(length(" + path + "), 1)), " + path + ")")),
            ('Site_url', compose("@if(endsWith(" + SITE + ", '/'), take(" + SITE + ", sub(length(" + SITE + "), 1)), " + SITE + ")")),
            ('Ids', compose(ids))]


def html_text(expr):
    """Text for an email body: every value is escaped, so nothing a person typed can become markup."""
    return ("replace(replace(replace(replace(replace(string(coalesce(" + expr + ", '')), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), "
            "'\"', '&quot;'), " + q("'") + ", '&#39;')")


def long_or_blank(iso_expr):
    """'d MMMM yyyy', or '' for a missing date (both branches are always evaluated, so the date is never invalid)."""
    blank = "empty(string(coalesce(" + iso_expr + ", '')))"
    return ("if(" + blank + ", '', formatDateTime(concat(if(" + blank + ", '2000-01-01', string(" + iso_expr + ")), 'T00:00:00Z'), 'd MMMM yyyy'))")


def days_until(iso_expr):
    """Whole days from today (outputs('Today'), a UK date) to a UK date (plan D.0.1)."""
    blank = "empty(string(coalesce(" + iso_expr + ", '')))"
    return ("div(sub(ticks(concat(if(" + blank + ", outputs('Today'), string(" + iso_expr + ")), 'T00:00:00Z')), "
            "ticks(concat(outputs('Today'), 'T00:00:00Z'))), " + str(DAY_TICKS) + ")")


def notice(send, ntype, key, person, actor_name, action_id, title, area, due_iso, original_iso=None, previous_iso="''", ext_count='0', note="''"):
    """One email to queue, as plain values; `person` is a People row read with Person/Name and Person/EMail."""
    return {'send': '@and(' + send + ", equals(string(" + person + "?['Status']), 'Active'))", 'type': ntype, 'key': '@{' + key + '}',
            'recipientId': '@{' + idstr(person + "?['SiteUserId']") + '}', 'login': '@{' + person + "?['Person']?['Name']}",
            'email': "@{coalesce(" + person + "?['Person']?['EMail'], " + person + "?['Email'])}",
            'actor': '@{' + actor_name + '}', 'actionId': '@{' + action_id + '}', 'title': '@{' + title + '}', 'area': '@{' + area + '}',
            'dueIso': '@{' + due_iso + '}', 'originalIso': '@{' + (original_iso or due_iso) + '}', 'previousIso': '@{' + previous_iso + '}',
            'extCount': '@int(' + ext_count + ')', 'note': '@{' + note + '}'}


def outbox_create(sfx, items_expr):
    """Plan F.4.2: one Notification Log row per email, keyed so it is never made twice. A row this run makes is born
    'Sending' and goes on varOutbox, to be sent when the work is complete; a key that already has its row (made by an
    earlier run) is left to the daily run."""
    loop = 'Each_new_notice' + sfx
    N = "items('" + loop + "')"
    T = lambda f: N + "?['" + f + "']"
    is_ = lambda t: "equals(" + T('type') + ", '" + t + "')"
    days = days_until(T('dueIso'))
    late = "sub(0, " + days + ")"
    plural = lambda n, one, many: "if(equals(" + n + ", 1), " + q(one) + ", " + q(many) + ")"
    ref = "concat('ACT-', substring(concat('0000', " + T('actionId') + "), sub(length(concat('0000', " + T('actionId') + ")), 5), 5))"
    subject = ("@if(" + is_('ASG') + ", concat('Action assigned to you: ', " + T('title') + "), "
               "if(" + is_('EXT') + ", concat('Deadline moved: ', " + T('title') + "), "
               "if(" + is_('RDY') + ", concat('Ready for your close-out check: ', " + T('title') + "), "
               "if(" + is_('CLS') + ", concat('Action closed: ', " + T('title') + "), "
               "if(" + is_('RAW') + ", concat('Action reassigned: ', " + T('title') + "), "
               "if(" + is_('R7') + ", concat('Reminder: ', " + T('title') + ", ' is due in ', string(" + days + "), " + plural(days, ' day', ' days') + "), "
               "if(" + is_('DUE') + ", concat('Due today: ', " + T('title') + "), "
               "concat(" + T('title') + ", ' is ', string(" + late + "), " + plural(late, ' day late', ' days late') + "))))))))")
    actor = html_text(T('actor'))
    intro = ("if(" + is_('ASG') + ", concat(" + actor + ", ' has given you an action in the ESG Competency Hub.'), "
             "if(" + is_('EXT') + ", concat(" + actor + ", ' has moved the deadline of your action.'), "
             "if(" + is_('RDY') + ", concat(" + actor + ", ' has marked this action as done. It is waiting for your close-out check.'), "
             "if(" + is_('CLS') + ", concat(" + actor + ", ' has closed this action.'), "
             "if(" + is_('RAW') + ", concat(" + actor + ", ' has given this action to someone else. It is no longer yours to do.'), "
             "if(" + is_('R7') + ", concat('Your action is due in ', string(" + days + "), " + plural(days, ' day.', ' days.') + "), "
             "if(" + is_('DUE') + ", 'Your action is due today.', "
             "concat('Your action is ', string(" + late + "), " + plural(late, ' day late.', ' days late.') + "))))))))")
    td = '<td style="padding:4px 16px 4px 0;color:#5b6774">'
    tv = '<td style="padding:4px 0">'
    deadline = ("@{" + long_or_blank(T('dueIso')) + "}@{if(and(greater(" + T('extCount') + ", 0), not(equals(" + T('originalIso') + ", " + T('dueIso') + "))), "
                "concat(' (originally ', " + long_or_blank(T('originalIso')) + ", ')'), '')}")
    was_due = ("@{if(" + is_('EXT') + ", concat(" + q('<tr>' + td + 'Was due</td>' + tv) + ", " + long_or_blank(T('previousIso')) + ", '</td></tr>'), '')}")
    note_row = ("@{if(empty(" + T('note') + "), '', concat(" + q('<tr>' + td) + ", if(contains(createArray('EXT', 'RAW', 'ASG'), " + T('type') + "), 'Reason', 'Note'), " + q('</td>' + tv) + ", "
                + html_text(T('note')) + ", '</td></tr>'))}")
    html = ('<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#16222c">'
            '<p style="color:#13516b;font-size:18px;font-weight:600;margin:0 0 12px">ESG Competency Hub</p>'
            '<p>@{' + intro + '}</p><table style="border-collapse:collapse;font-size:15px">'
            '<tr>' + td + 'Action</td>' + tv + '@{' + ref + '} – @{' + html_text(T('title')) + '}</td></tr>'
            '<tr>' + td + 'Area</td>' + tv + '@{' + html_text(T('area')) + '}</td></tr>'
            '<tr>' + td + 'Deadline</td>' + tv + deadline + '</td></tr>' + was_due + note_row +
            '</table><p style="margin:20px 0"><a href="@{outputs(\'Site_url\')}/SitePages/Hub.aspx?action=@{' + T('actionId') + '}" '
            'style="background:#13516b;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open the action</a></p>'
            '<p style="color:#5b6774;font-size:12px">This is an automated message from the ESG Competency Hub. '
            'Reference @{outputs(\'Token' + sfx + '\')}.</p></div>')
    mail = {'to': '@{' + T('email') + '}', 'subject': "@{outputs('Subject" + sfx + "')}", 'html': "@{outputs('Html" + sfx + "')}",
            'type': '@{' + T('type') + '}', 'dueIso': '@{' + T('dueIso') + '}', 'actionId': '@{' + T('actionId') + '}',
            'recipientId': '@{' + T('recipientId') + '}', 'login': '@{' + T('login') + '}'}
    values, call = create_in_folder('notif', "@{outputs('Ids')?['notifRoot']}", 'Notice_values' + sfx, 'Notice_body' + sfx)
    find = L('notif', "/items?$select=Id&$filter=NotificationKey eq '@{" + esc(T('key')) + "}'")
    created = "and(equals(actions('Create_notice" + sfx + "')?['status'], 'Succeeded'), empty(body('Notice_refused" + sfx + "')))"
    append = lambda name, id_expr: (name, {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varOutbox', 'value': dict(mail, id=id_expr)}})
    return [(loop, {'type': 'Foreach', 'foreach': '@' + items_expr, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
        ('Token' + sfx, compose("@concat('ESGN', toUpper(take(replace(guid(), '-', ''), 10)))")),
        ('Subject' + sfx, compose(subject)),
        ('Html' + sfx, compose(html)),
        ('Render' + sfx, compose(mail)),
        ('Notice_values' + sfx, form({
            'Title': "@{take(outputs('Subject" + sfx + "'), 255)}", 'NotificationKey': '@{' + T('key') + '}', 'Token': "@{outputs('Token" + sfx + "')}",
            'NotificationType': '@{' + T('type') + '}', 'Recipient': "@{concat('[{\"Key\":\"', " + T('login') + ", '\"}]')}",
            'RecipientEmail': '@{' + T('email') + '}', 'RecordType': 'Action', 'RecordId': '@{' + T('actionId') + '}', 'State': 'Sending', 'Attempts': '1',
            'SendingSince': "@{convertFromUtc(utcNow(), 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}",
            'RenderData': "@{string(outputs('Render" + sfx + "'))}", 'DueDay': '@{' + day_num(T('dueIso')) + '}'})),
        ('Notice_body' + sfx, values),
        ('Create_notice' + sfx, call),
        ('Notice_refused' + sfx, after(query("@coalesce(body('Create_notice" + sfx + "')?['value'], createArray())", "@equals(item()?['HasException'], true)"),
                                       {'Create_notice' + sfx: TOLERANT})),
        # made now: it is sent when the work is complete. If not, the key may already have its row from an earlier
        # run (the daily run follows that one up); anything else is a real failure.
        ('Notice_made' + sfx, cond("@" + created, seq(
            ('Notice_id' + sfx, query("@body('Create_notice" + sfx + "')?['value']", "@equals(item()?['FieldName'], 'Id')")),
            ('Has_notice_id' + sfx, cond("@empty(body('Notice_id" + sfx + "'))", seq(
                ('Get_notice' + sfx, http('GET', find)),
                append('Queue_read' + sfx, "@first(body('Get_notice" + sfx + "')?['value'])?['Id']"),
            ), seq(
                append('Queue_new' + sfx, "@int(first(body('Notice_id" + sfx + "'))?['FieldValue'])"),
            ))),
        ), seq(
            ('Find_notice' + sfx, http('GET', find)),
            ('Notice_exists' + sfx, cond("@empty(body('Find_notice" + sfx + "')?['value'])",
                                         seq(('Notice_failed' + sfx, fail_here('An email could not be queued. See Create_notice' + sfx + '.'))))),
        ))),
    )})]


def send_email(to, subject, body):
    return {'type': 'OpenApiConnection',
            'inputs': {'host': {'connectionName': 'shared_office365', 'operationId': 'SendEmailV2', 'apiId': OUTLOOK_API},
                       'parameters': {'emailMessage/To': to, 'emailMessage/Subject': subject, 'emailMessage/Body': body,
                                      'emailMessage/Importance': 'Normal'},
                       'authentication': "@parameters('$authentication')",
                       # never resent by the connector itself: an unclear send is recorded as Unknown instead
                       'retryPolicy': {'type': 'none'}},
            'runtimeConfiguration': SECURE}


def send_outbox(sfx):
    """Sends every email on varOutbox and records the outcome on its row (plan F.4.2): Sent; Failed for a definite
    refusal; Unknown for anything unclear. The daily run tries Failed and Unknown rows again."""
    loop = 'Each_email' + sfx
    M = "items('" + loop + "')"
    T = lambda f: M + "?['" + f + "']"
    item = L('notif', "/items(@{" + T('id') + "})")
    days = days_until(T('dueIso'))
    cover_key = ("concat(if(equals(" + days + ", 0), 'DUE', 'R7'), '|', " + T('actionId') + ", '|', string(" + day_num(T('dueIso')) + "), '|', "
                 + T('recipientId') + ")")
    cover_values, cover_call = create_in_folder('notif', "@{outputs('Ids')?['notifRoot']}", 'Cover_values' + sfx, 'Cover_body' + sfx)
    return (loop, {'type': 'Foreach', 'foreach': "@variables('varOutbox')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
        ('Send_mail' + sfx, send_email('@{' + T('to') + '}', '@{' + T('subject') + '}', '@{' + T('html') + '}')),
        ('Mail_sent' + sfx, after(cond("@equals(actions('Send_mail" + sfx + "')?['status'], 'Succeeded')", seq(
            ('Sent_body' + sfx, compose({'State': 'Sent', 'SentAt': '@{utcNow()}', 'LastError': ''})),
            ('Mark_sent' + sfx, merge(item, 'Sent_body' + sfx)),
            # an assignment or new deadline 0-7 days away has told the owner already: that reminder is not needed
            ('Covers' + sfx, cond("@and(contains(createArray('ASG', 'EXT'), " + T('type') + "), greaterOrEquals(" + days + ", 0), lessOrEquals(" + days + ", 7))", seq(
                ('Cover_values' + sfx, form({'Title': 'Covered by an earlier email', 'NotificationKey': '@{' + cover_key + '}',
                                             'NotificationType': "@{if(equals(" + days + ", 0), 'DUE', 'R7')}",
                                             'Recipient': "@{concat('[{\"Key\":\"', " + T('login') + ", '\"}]')}", 'RecipientEmail': '@{' + T('to') + '}',
                                             'RecordType': 'Action', 'RecordId': '@{' + T('actionId') + '}', 'State': 'Skipped',
                                             'SkipReason': "@{concat('Covered by the ', " + T('type') + ", ' email')}", 'RenderData': '{}',
                                             'DueDay': '@{' + day_num(T('dueIso')) + '}'})),
                ('Cover_body' + sfx, cover_values),
                ('Cover' + sfx, cover_call),
                # a cover row that already exists is fine
                ('Covered' + sfx, after(compose('done'), {'Cover' + sfx: TOLERANT})),
            ))),
        ), seq(
            ('Send_code' + sfx, compose("@coalesce(outputs('Send_mail" + sfx + "')?['statusCode'], 0)")),
            ('Unsent_body' + sfx, compose({
                'State': "@{if(contains(createArray(400, 401, 403, 404, 413, 429), outputs('Send_code" + sfx + "')), 'Failed', 'Unknown')}",
                'LastError': "@{concat('The email was not confirmed as sent (', string(outputs('Send_code" + sfx + "')), '). Run ', workflow()?['run']?['name'], '.')}",
                'NextAttemptAfter': "@{addMinutes(utcNow(), 15)}"})),
            ('Mark_unsent' + sfx, merge(item, 'Unsent_body' + sfx)),
        )), {'Send_mail' + sfx: TOLERANT})),
    )})


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

    def commit(sfx, action_id_expr, area_key_expr, area_id_expr, event_fields, result_expr, ensure_hist=True, notices=()):
        """Plan F.1.2 step 9: event row, transaction Applied, lock released, request Completed."""
        ev_key = "concat(" + KEY + ", '|1')"
        ev_key_uri = "concat(" + KEY + ", '%7C1')"
        hist_path = "@{outputs('Ids')?['histRoot']}/@{" + area_key_expr + "}/A@{" + action_id_expr + "}"
        ev_values, ev_call = create_in_folder('hist', hist_path, 'Event_values' + sfx, 'Event_body' + sfx)
        dynamic = event_fields.get('dynamic')
        details = dict({'CompetencyId': '@int(' + area_id_expr + ')', 'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}',
                        'ProcessedAt': '@{utcNow()}'}, **event_fields.get('json', {}))
        ev_fixed = {'Title': '@{take(' + event_fields['title'] + ', 255)}', 'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}',
                    'RecordType': 'Action', 'RecordId': '@{' + action_id_expr + '}', 'EventType': event_fields['type'],
                    'RequestType': '@{' + TX + "?['RequestType']}"}
        # a change's own fields come either written out here (raise) or from variables its Switch case set
        ev_steps = ([('Event_fixed' + sfx, form(ev_fixed)),
                     ('Event_values' + sfx, compose("@union(outputs('Event_fixed" + sfx + "'), variables('varEventForm'))"))] if dynamic
                    else [('Event_values' + sfx, form(dict(ev_fixed, **event_fields.get('form', {}))))])
        detail_steps = ([('Event_details_fixed' + sfx, compose(details)),
                         ('Event_details' + sfx, compose("@union(outputs('Event_details_fixed" + sfx + "'), variables('varEventJson'))"))] if dynamic
                        else [('Event_details' + sfx, compose(details))])
        notice_step = compose('@' + notices) if isinstance(notices, str) else compose(list(notices))
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
                *ev_steps,
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
            *detail_steps,
            ('Save_event' + sfx, merge(L('hist', "/items(@{variables('varEventId')})"), 'Event_details' + sfx)),
            # plan F.1.2 step 9.2: the emails go into the outbox before the change counts as applied; they are sent
            # once the request is Completed (Send_emails)
            ('Notices' + sfx, notice_step),
            ('To_notify' + sfx, query("@outputs('Notices" + sfx + "')", "@equals(item()?['send'], true)")),
            *outbox_create(sfx, "body('To_notify" + sfx + "')"),
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
    claims = lambda person: "@{concat('[{\"Key\":\"', " + person + "?['Person']?['Name'], '\"}]')}"
    OWNER_ID_R = idstr(OWNER_R + "?['SiteUserId']")
    ACT_ID_R = "string(variables('varActionId'))"
    raise_case = seq(
        ('Get_area_R', http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey,Status&$filter=CompetencyKey eq '@{" + esc(P + "?['areaKey']") + "}' and Status eq 'Active'"))),
        ('My_member_R', query("@body('Get_my_memberships')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr(AREA_R + "?['Id']") + ")")),
        ('Get_owner_R', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,Email,Person/Name,Person/EMail&$expand=Person&$filter=SiteUserId eq @{" + idq(P + "?['ownerId']") + "}"))),
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
                ('Action_values_R', form({
                    'Title': '@{' + TITLE + '}', 'Description': '@{' + DESC + '}', 'Competency': '@{' + idstr(AREA_R + "?['Id']") + '}',
                    # sign-in names come with the People rows the checks read (Person/Name)
                    'AssignedTo': claims(OWNER_R), 'RaisedBy': claims(ME),
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
                    "concat('ACT-', substring(concat('0000', " + ACT_ID_R + "), sub(length(concat('0000', " + ACT_ID_R + ")), 5), 5), ' raised.')",
                    notices=[notice("not(equals(" + OWNER_ID_R + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + OWNER_ID_R + ")",
                                    OWNER_R, "string(" + ME + "?['Title'])", ACT_ID_R, TITLE, "string(" + AREA_R + "?['Title'])", DUE)]),
        ), reject('_R', "outputs('Verdict_R')"))),
    )

    # ---------------------------------------------------------------- shared by ExtendDeadline and MarkComplete
    def change_case(sfx, verdict_tail, plan_fields, values_fields, event_fields, result_expr, notices, reads=lambda c: []):
        """One kind of change to an existing action, as data: the shared steps are built once, in change_all()."""
        return {'code': sfx, 'verdict': verdict_tail, 'plan': plan_fields, 'values': values_fields, 'event': event_fields,
                'result': result_expr, 'notices': notices, 'reads': reads}

    def change_all(specs):
        """Every change to an existing action (plan F.1.3): read it, check it (each kind its own rules), lock it and
        write the values with its ETag, then the event row, the emails and the release. The shared steps are built
        once; each kind adds only small Switch cases that set variables, so the flow stays well within 500 actions."""
        sfx = '_U'
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
        ctx = {'A': A, 'OWNER': OWNER, 'ALLOWED': "or(" + OWNER + ", " + RAISER + ", " + MANAGE + ")", 'MANAGER': "or(" + RAISER + ", " + MANAGE + ")",
               'OPEN': "contains(" + OPEN + ", string(" + A + "?['Status']))", 'DUE': due_iso(A + "?['DueDay']"),
               'PLAN': "json(string(coalesce(variables('varTxPlan'), '{}')))",
               'OWNER_P': "first(body('Owner_p" + sfx + "'))", 'RAISER_P': "first(body('Raiser_p" + sfx + "'))",
               'NEW_P': "first(body('New_p" + sfx + "'))", 'PREV_P': "first(body('Prev_p" + sfx + "'))",
               'OWNER_ID': idstr(A + "?['AssignedToId']"), 'RAISER_ID': idstr(A + "?['RaisedById']"),
               'AREA_NAME': "string(" + A + "?['Competency']?['Title'])", 'ACT_ID': idstr(A + "?['Id']"),
               'ORIGINAL': "if(empty(string(coalesce(" + A + "?['OriginalDueDate'], ''))), '', convertFromUtc(string(coalesce(" + A + "?['OriginalDueDate'], '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyy-MM-dd'))"}
        action_item = L('act', "/items(@{" + idstr(TX + "?['RecordId']") + "})")
        sel = ('?$select=Id,Title,CompetencyId,AssignedToId,RaisedById,Status,DueDay,OriginalDueDate,ExtensionCount,RequiresCloseOut,'
               'Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,Description,Priority,Blocker,CloseOutcome,'
               'Competency/CompetencyKey,Competency/Title&$expand=Competency')
        TYPE = "@string(" + TX + "?['RequestType'])"
        def by_type(stage, build, default=None):
            return (stage + '_by_type', switch(TYPE, {t: seq(*build(sp['code'], sp)) for t, sp in specs.items()},
                                               default or seq((stage + '_none', compose('none')))))
        NEW_DUE = "string(coalesce(" + P + "?['newDueIso'], ''))"
        person = lambda name, id_expr: (name + sfx, query("@body('Get_people" + sfx + "')?['value']", "@equals(" + idstr("item()?['SiteUserId']") + ", " + id_expr + ")"))
        return seq(
            ('Get_action' + sfx, http('GET', action_item + sel, meta=True)),
            ('Action_read' + sfx, after(cond("@equals(actions('Get_action" + sfx + "')?['status'], 'Succeeded')", None, seq(
                ('Action_missing' + sfx, cond("@equals(outputs('Get_action" + sfx + "')?['statusCode'], 404)", reject(sfx + '_missing', "'That action could not be found.'"),
                                              seq(('Action_unreadable' + sfx, fail_here('The action could not be read. See Get_action' + sfx + '.'))))))),
                {'Get_action' + sfx: TOLERANT})),
            ('My_member' + sfx, query("@body('Get_my_memberships')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr(A + "?['CompetencyId']") + ")")),
            # a new deadline, if the change has one; a date that is not real fails here and is refused below
            ('Read_due' + sfx, set_var('varDue', "@{formatDateTime(concat(if(empty(" + NEW_DUE + "), '2000-01-01', " + NEW_DUE + "), 'T00:00:00Z'), 'yyyy-MM-dd')}")),
            # each kind of change checks its own rules (and reads what it needs) and leaves the verdict
            ('Check_by_type', after(by_type('Check', lambda code, sp: [
                *sp['reads'](ctx),
                ('Verdict' + code, set_var('varVerdict', "@if(" + ALREADY + ", '', if(" + UNCOMMITTED + ", 'That action could not be found.', "
                                           + sp['verdict'](ctx) + "))"))],
                default=reject('_type', "'This kind of request is not handled yet.'"))[1], {'Read_due' + sfx: TOLERANT})),
            ('Allowed' + sfx, cond("@empty(variables('varVerdict'))", seq(
                ('Not_yet_applied' + sfx, cond("@" + ALREADY, None, seq(
                    # the plan is stored before anything changes, so a resumed run knows the previous values
                    by_type('Plan', lambda code, sp: [('Plan_set' + code, set_var('varPlanObj', sp['plan'](ctx))),
                                                      ('Values_set' + code, set_var('varValues', sp['values'](ctx)))]),
                    ('Plan' + sfx, compose("@variables('varPlanObj')")),
                    *tx_update('planned' + sfx, {'State': 'Planned', 'PreviousValue': "@{string(outputs('Plan" + sfx + "'))}"}),
                    ('Set_plan_now' + sfx, set_var('varTxPlan', "@{string(outputs('Plan" + sfx + "'))}")),
                    ('Values_fixed' + sfx, compose({'PendingRequestKey': '@{' + KEY + '}', 'Revision': "@add(int(" + idstr(A + "?['Revision']") + "), 1)"})),
                    ('Values' + sfx, compose("@union(outputs('Values_fixed" + sfx + "'), variables('varValues'))")),
                    ('Lock_and_values' + sfx, merge(action_item, 'Values' + sfx, if_match="@{" + A + "?['odata.etag']}")),
                    # someone else changed the action between reading and writing: nothing has been done yet
                    ('Locked' + sfx, after(cond("@equals(actions('Lock_and_values" + sfx + "')?['status'], 'Succeeded')", None, seq(
                        ('Lock_conflict' + sfx, cond("@equals(outputs('Lock_and_values" + sfx + "')?['statusCode'], 412)", reject(sfx + '_stale', q(STALE)),
                                                     seq(('Lock_failed' + sfx, fail_here('The action could not be updated. See Lock_and_values' + sfx + '.'))))))),
                        {'Lock_and_values' + sfx: TOLERANT})),
                    ('Set_locked_here' + sfx, set_var('varLockedHere', True)),
                ))),
                # who may be emailed: the owner, the raiser, and for a reassignment the new and the previous owner
                ('Get_people' + sfx, http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,Email,Person/Name,Person/EMail&$expand=Person&$top=5000"))),
                person('Owner_p', ctx['OWNER_ID']), person('Raiser_p', ctx['RAISER_ID']), person('New_p', idq(P + "?['ownerId']")),
                person('Prev_p', "string(" + ctx['PLAN'] + "?['owner'])"),
                # a resumed run already has the stored plan from the transaction row (Set_tx_plan)
                by_type('Record', lambda code, sp: [
                    ('Event_title' + code, set_var('varEventTitle', "@{take(" + sp['event'](ctx)['title'] + ", 255)}")),
                    ('Event_type' + code, set_var('varEventType', sp['event'](ctx)['type'])),
                    ('Event_form' + code, set_var('varEventForm', [{'FieldName': k, 'FieldValue': v} for k, v in sp['event'](ctx).get('form', {}).items()])),
                    ('Event_json' + code, set_var('varEventJson', sp['event'](ctx).get('json', {}))),
                    ('Result' + code, set_var('varResult', "@{" + sp['result'](ctx) + "}")),
                    ('Notices_set' + code, set_var('varNoticeList', sp['notices'](ctx)))]),
                *commit(sfx, idstr(A + "?['Id']"), AREA_KEY, idstr(A + "?['CompetencyId']"),
                        {'title': "variables('varEventTitle')", 'type': "@{variables('varEventType')}", 'dynamic': True},
                        "variables('varResult')", ensure_hist=False, notices="variables('varNoticeList')"),
            ), reject(sfx, "variables('varVerdict')"))),
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
        lambda c: "concat('Deadline moved to ', " + long_date(NEW) + ", '.')",
        # the owner hears about a deadline someone else moved
        lambda c: [notice("not(" + c['OWNER'] + ")", 'EXT', "concat('EXT|', " + KEY + ", '|', " + c['OWNER_ID'] + ")", c['OWNER_P'],
                          "string(" + ME + "?['Title'])", c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], NEW,
                          original_iso="if(empty(" + c['ORIGINAL'] + "), " + NEW + ", " + c['ORIGINAL'] + ")", previous_iso=PREV_DUE,
                          ext_count=EXT_N, note=REASON)])

    def complete_tail(c):
        return (common_checks(c, 'Only the owner or the people who manage this action can mark it as done.', 'This action is already done.') +
                "if(greater(length(" + NOTE + "), 1000), 'Keep the note to 1,000 characters or fewer.', '')))))")

    def complete_common(c):
        return ["string(" + ME + "?['Title'])", c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], c['DUE']]

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
        lambda c: "if(" + CLOSES + ", 'Action closed.', 'Marked as done; waiting for a close-out check.')",
        # the raiser is asked for the close-out check; a closed action is reported to its owner and raiser
        lambda c: [notice("and(not(" + CLOSES + "), not(equals(" + c['RAISER_ID'] + ", " + SENDER + ")))", 'RDY',
                          "concat('RDY|', " + KEY + ", '|', " + c['RAISER_ID'] + ")", c['RAISER_P'], *complete_common(c), note=NOTE),
                   notice("and(" + CLOSES + ", not(equals(" + c['OWNER_ID'] + ", " + SENDER + ")))", 'CLS',
                          "concat('CLS|', " + KEY + ", '|', " + c['OWNER_ID'] + ")", c['OWNER_P'], *complete_common(c), note=NOTE),
                   notice("and(" + CLOSES + ", not(equals(" + c['RAISER_ID'] + ", " + SENDER + ")), not(equals(" + c['RAISER_ID'] + ", " + c['OWNER_ID'] + ")))", 'CLS',
                          "concat('CLS|', " + KEY + ", '|', " + c['RAISER_ID'] + ")", c['RAISER_P'], *complete_common(c), note=NOTE)])

    # ---------------------------------------------------------------- the rest of an action's life (plan K9)
    def chain(*pairs):
        """if(c1, m1, if(c2, m2, ... '')): the first rule that fails gives its message."""
        out = "''"
        for c, m in reversed(pairs):
            out = "if(" + c + ", " + (q(m) if not m.startswith('@') else m[1:]) + ", " + out + ")"
        return out

    def guard(c, state_ok, state_msg, allowed, not_allowed):
        """The checks every change makes: state, who, lock and revision, then the change's own rules."""
        return [("not(" + state_ok + ")", state_msg), ("not(" + allowed + ")", not_allowed),
                ("not(empty(string(coalesce(" + c['A'] + "?['PendingRequestKey'], ''))))", 'This action is being updated. Try again in a minute.'),
                ("not(equals(" + idstr(c['A'] + "?['Revision']") + ", " + idstr(TX + "?['ExpectedRevision']") + "))", STALE)]

    text_len = lambda field: "length(trim(string(coalesce(" + P + "?['" + field + "'], ''))))"
    TEXT = lambda field: "trim(string(coalesce(" + P + "?['" + field + "'], '')))"
    STATUS_NEW = "string(coalesce(" + P + "?['status'], ''))"
    LABEL = lambda s: "if(equals(" + s + ", 'Awaiting Input'), 'Waiting on something', if(equals(" + s + ", 'In Progress'), 'In progress', " + s + "))"
    REASON_RULES = [("less(" + text_len('reason') + ", 10)", 'Give a reason of at least 10 characters.'),
                    ("greater(" + text_len('reason') + ", 1000)", 'Keep the reason to 1,000 characters or fewer.')]

    status_case = change_case(
        '_S',
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open.', c['ALLOWED'],
                               'Only the owner or the people who manage this action can change its status.'),
                        ("not(contains(" + OPEN + ", " + STATUS_NEW + "))", 'Choose a status.'),
                        ("equals(" + STATUS_NEW + ", string(" + c['A'] + "?['Status']))", 'Choose a different status.'),
                        ("and(equals(" + STATUS_NEW + ", 'Awaiting Input'), less(" + text_len('blocker') + ", 10))",
                         'Say what it is waiting on (at least 10 characters).'),
                        ("and(equals(" + STATUS_NEW + ", 'Awaiting Input'), greater(" + text_len('blocker') + ", 1000))",
                         'Keep it to 1,000 characters or fewer.')),
        lambda c: {'status': '@string(' + c['A'] + "?['Status'])", 'blocker': '@{' + c['A'] + "?['Blocker']}"},
        lambda c: {'Status': '@{' + STATUS_NEW + '}',
                   'Blocker': "@{if(equals(" + STATUS_NEW + ", 'Awaiting Input'), " + TEXT('blocker') + ", '')}"},
        lambda c: {'title': "concat('Status changed to ', " + LABEL(STATUS_NEW) + ")", 'type': 'Status Changed',
                   'form': {'Note': "@{if(equals(" + STATUS_NEW + ", 'Awaiting Input'), " + TEXT('blocker') + ", '')}",
                            'PreviousValue': "@{" + LABEL("string(" + c['PLAN'] + "?['status'])") + "}", 'NewValue': '@{' + LABEL(STATUS_NEW) + '}'}},
        lambda c: "concat('Status changed to ', toLower(" + LABEL(STATUS_NEW) + "), '.')",
        lambda c: [])

    NEW_OWNER = "first(body('Get_new_owner_A')?['value'])"
    NEW_OWNER_ID = idq(P + "?['ownerId']")
    owner_ok = ("and(not(empty(" + NEW_OWNER + ")), equals(string(" + NEW_OWNER + "?['Status']), 'Active'), "
                "or(contains(" + MANAGEMENT + ", string(" + NEW_OWNER + "?['Role'])), not(empty(body('New_owner_member_A')?['value']))))")
    PREV_OWNER_ID = "string(" + "json(string(coalesce(variables('varTxPlan'), '{}')))?['owner'])"
    reassign_case = change_case(
        '_A',
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open, so it cannot be reassigned.', c['MANAGER'],
                               'Only the people who manage this action can reassign it.'),
                        ("equals(" + NEW_OWNER_ID + ", '0')", 'Choose who will do it.'),
                        ("equals(" + NEW_OWNER_ID + ", " + c['OWNER_ID'] + ")", 'Choose someone other than the current owner.'),
                        ("not(" + owner_ok + ")", 'Choose a member of this area or a Team Leader.'),
                        *REASON_RULES),
        lambda c: {'owner': '@{' + c['OWNER_ID'] + '}', 'ownerName': "@{first(body('Get_owner_now_A')?['value'])?['Title']}"},
        lambda c: {'AssignedToId': '@int(' + NEW_OWNER_ID + ')'},
        lambda c: {'title': "concat('Reassigned to ', string(" + NEW_OWNER + "?['Title']))", 'type': 'Reassigned',
                   'form': {'Note': '@{' + REASON + '}', 'PreviousValue': "@{" + c['PLAN'] + "?['ownerName']}", 'NewValue': "@{" + NEW_OWNER + "?['Title']}"}},
        lambda c: "concat('Reassigned to ', string(" + NEW_OWNER + "?['Title']), '.')",
        # the new owner is told it is theirs, the previous owner that it no longer is
        lambda c: [notice("not(equals(" + NEW_OWNER_ID + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + NEW_OWNER_ID + ")",
                          c['NEW_P'], "string(" + ME + "?['Title'])", c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'],
                          c['DUE'], note=REASON),
                   notice("not(equals(" + PREV_OWNER_ID + ", " + SENDER + "))", 'RAW', "concat('RAW|', " + KEY + ", '|', " + PREV_OWNER_ID + ")",
                          c['PREV_P'], "string(" + ME + "?['Title'])", c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'],
                          c['DUE'], note=REASON)],
        reads=lambda c: [
            # the current and the new owner, for the checks and the record (the plan keeps the current one)
            ('Get_owner_now_A', http('GET', L('people', "/items?$select=Id,Title,SiteUserId&$filter=SiteUserId eq @{" + idq(c['A'] + "?['AssignedToId']") + "}"))),
            ('Get_new_owner_A', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status&$filter=SiteUserId eq @{" + NEW_OWNER_ID + "}"))),
            ('New_owner_member_A', http('GET', L('members', "/items?$select=Id&$filter=PersonId eq @{" + NEW_OWNER_ID + "} and CompetencyId eq @{"
                                                             + idq(c['A'] + "?['CompetencyId']") + "} and Status eq 'Active'")))])

    OUTCOME = "string(coalesce(" + P + "?['outcome'], ''))"
    NOTE_LEN = text_len('note')
    close_case = change_case(
        '_L',
        lambda c: chain(*guard(c, "or(" + c['OPEN'] + ", equals(string(" + c['A'] + "?['Status']), 'Completed'))", 'This action is already closed.',
                               c['MANAGER'], 'Only the people who manage this action can close it.'),
                        ("not(contains(createArray('Completed', 'No longer required', 'Superseded', 'Other'), " + OUTCOME + "))", 'Choose an outcome.'),
                        ("and(not(equals(" + OUTCOME + ", 'Completed')), less(" + NOTE_LEN + ", 10))", 'Explain the outcome in at least 10 characters.'),
                        ("greater(" + NOTE_LEN + ", 1000)", 'Keep the note to 1,000 characters or fewer.')),
        lambda c: {'status': '@string(' + c['A'] + "?['Status'])"},
        lambda c: {'Status': 'Closed', 'IsOpen': False, 'DateClosed': '@{' + EVENT_TIME + '}', 'ClosedById': '@int(' + SENDER + ')',
                   'CloseOutcome': '@{' + OUTCOME + '}', 'ClosureNote': '@{' + NOTE + '}'},
        lambda c: {'title': "concat('Closed: ', " + OUTCOME + ")", 'type': 'Closed',
                   'form': {'Note': '@{' + NOTE + '}', 'NewValue': '@{' + OUTCOME + '}'}},
        lambda c: "'Action closed.'",
        lambda c: [notice("not(equals(" + c['OWNER_ID'] + ", " + SENDER + "))", 'CLS', "concat('CLS|', " + KEY + ", '|', " + c['OWNER_ID'] + ")",
                          c['OWNER_P'], *complete_common(c), note=NOTE),
                   notice("and(not(equals(" + c['RAISER_ID'] + ", " + SENDER + ")), not(equals(" + c['RAISER_ID'] + ", " + c['OWNER_ID'] + ")))", 'CLS',
                          "concat('CLS|', " + KEY + ", '|', " + c['RAISER_ID'] + ")", c['RAISER_P'], *complete_common(c), note=NOTE)])

    reopen_case = change_case(
        '_O',
        lambda c: chain(*guard(c, "contains(createArray('Closed', 'Completed'), string(" + c['A'] + "?['Status']))", 'This action is already open.',
                               c['MANAGER'], 'Only the people who manage this action can reopen it.'),
                        *REASON_RULES),
        lambda c: {'status': '@string(' + c['A'] + "?['Status'])", 'outcome': "@{" + c['A'] + "?['CloseOutcome']}"},
        lambda c: {'Status': 'In Progress', 'IsOpen': True, 'DateClosed': None, 'DateCompleted': None, 'ClosedById': None, 'CloseOutcome': None,
                   'ClosureNote': ''},
        lambda c: {'title': "'Reopened'", 'type': 'Reopened',
                   'form': {'Note': '@{' + REASON + '}', 'PreviousValue': "@{" + c['PLAN'] + "?['status']}", 'NewValue': 'In Progress'}},
        lambda c: "'Action reopened.'",
        lambda c: [])

    HAS = lambda f: "contains(" + P + ", '" + f + "')"
    EDIT = {'title': 'Title', 'description': 'Description', 'priority': 'Priority'}
    edit_case = change_case(
        '_E',
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open.', c['MANAGER'], 'Only the people who manage this action can change its details.'),
                        ("not(or(" + ", ".join(HAS(f) for f in ('title', 'description', 'priority', 'requiresCloseOut')) + "))", 'Nothing has changed.'),
                        ("and(" + HAS('title') + ", equals(" + text_len('title') + ", 0))", 'Enter what needs doing.'),
                        ("and(" + HAS('title') + ", greater(" + text_len('title') + ", 255))", 'Keep the title to 255 characters or fewer.'),
                        ("and(" + HAS('description') + ", equals(" + text_len('description') + ", 0))", 'Add a short description.'),
                        ("and(" + HAS('description') + ", greater(" + text_len('description') + ", 5000))", 'Keep the description to 5,000 characters or fewer.'),
                        ("and(" + HAS('priority') + ", not(contains(createArray('Low', 'Normal', 'High'), string(coalesce(" + P + "?['priority'], '')))))",
                         'Choose a priority.')),
        lambda c: {'title': "@{" + c['A'] + "?['Title']}", 'description': "@{" + c['A'] + "?['Description']}",
                   'priority': "@{" + c['A'] + "?['Priority']}", 'closeOut': "@equals(" + c['A'] + "?['RequiresCloseOut'], true)"},
        # a field not given keeps its value (it is written back unchanged)
        lambda c: dict({col: "@{if(" + HAS(f) + ", " + TEXT(f) + ", string(coalesce(" + c['A'] + "?['" + col + "'], '')))}" for f, col in EDIT.items()},
                       RequiresCloseOut="@if(" + HAS('requiresCloseOut') + ", equals(" + P + "?['requiresCloseOut'], true), equals(" + c['A'] + "?['RequiresCloseOut'], true))"),
        lambda c: {'title': "'Details edited'", 'type': 'Details Edited',
                   'form': {'PreviousValue': "@{string(" + c['PLAN'] + ")}", 'NewValue': "@{string(" + P + ")}"}},
        lambda c: "'Details saved.'",
        lambda c: [])

    # ---------------------------------------------------------------- common part
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
        *site_and_ids(),
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
        ('Get_requester', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,Email,Person/Name,Person/EMail&$expand=Person&$filter=SiteUserId eq @{" + esc(SENDER) + "}"))),
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
                           {'RaiseAction': raise_case},
                           change_all({'ExtendDeadline': extend_case, 'MarkComplete': complete_case, 'ChangeStatus': status_case,
                                       'ReassignAction': reassign_case, 'CloseAction': close_case, 'ReopenAction': reopen_case,
                                       'EditActionDetails': edit_case}))),
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
                  ('Initialize_varLockedHere', init_var('varLockedHere', 'boolean', False)),
                  ('Initialize_varOutbox', init_var('varOutbox', 'array', [])),
                  # what each kind of change sets for the shared steps (change_all)
                  ('Initialize_varVerdict', init_var('varVerdict', 'string', '')),
                  ('Initialize_varPlanObj', init_var('varPlanObj', 'object', {})),
                  ('Initialize_varValues', init_var('varValues', 'object', {})),
                  ('Initialize_varEventTitle', init_var('varEventTitle', 'string', '')),
                  ('Initialize_varEventType', init_var('varEventType', 'string', '')),
                  ('Initialize_varEventForm', init_var('varEventForm', 'array', [])),
                  ('Initialize_varEventJson', init_var('varEventJson', 'object', {})),
                  ('Initialize_varResult', init_var('varResult', 'string', '')),
                  ('Initialize_varNoticeList', init_var('varNoticeList', 'array', [])))
    actions['Try'] = after(scope(try_actions), {'Initialize_varNoticeList': OK})
    # emails for a change that is complete: a failure here never touches the request, and the daily run retries
    email_loop, email_act = send_outbox('')
    actions['Send_emails'] = after(scope({email_loop: email_act}), {'Try': OK})
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

# --------------------------------------------------------------------------------------------- daily tasks
def flow_daily_tasks():
    """Plan F.4.1, cut to the reminders: every morning at 06:00 UK time it queues the 7-day, due-today and late
    reminders that have no row yet (so a missed run catches up and nothing is sent twice), tries again the emails
    that failed or whose outcome was unclear, and records LastDailyRun."""
    TODAY = "outputs('Today')"
    PEOPLE = "body('Get_people')?['value']"
    C = "items('Each_candidate')"
    setting = lambda name, default: ("@max(0, int(if(empty(string(coalesce(first(body('" + name + "_row'))?['Value'], ''))), " + q(default) + ", "
                                     "string(first(body('" + name + "_row'))?['Value']))))")
    left = "outputs('Left_c')"
    kind = "outputs('Kind_c')"
    uncommitted = "and(not(empty(string(coalesce(item()?['PendingRequestKey'], '')))), equals(string(item()?['CreatedRequestKey']), concat('F|', string(item()?['PendingRequestKey']))))"
    reminder = notice("true", "@{" + kind + "}", "outputs('Key_c')", "first(body('Owner_c'))", "''", idstr(C + "?['Id']"),
                      "string(" + C + "?['Title'])", "string(" + C + "?['Competency']?['Title'])", "outputs('Due_iso_c')",
                      original_iso="if(empty(string(coalesce(" + C + "?['OriginalDueDate'], ''))), outputs('Due_iso_c'), convertFromUtc(string(coalesce("
                                   + C + "?['OriginalDueDate'], '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyy-MM-dd'))",
                      ext_count="int(" + idq(C + "?['ExtensionCount']") + ")")
    # retries (plan F.4.2): Failed or Unknown rows whose wait is over, and rows left 'Sending' by a run that stopped
    RI = "items('Each_retry')"
    RD = "outputs('Render_r')"
    wanted_r = ("@and(not(empty(body('Person_r'))), equals(actions('Get_action_r')?['status'], 'Succeeded'), equals(body('Get_action_r')?['IsOpen'], true), "
                "or(not(contains(createArray('R7', 'DUE', 'OD'), string(" + RI + "?['NotificationType']))), "
                "and(equals(" + idstr("body('Get_action_r')?['DueDay']") + ", " + idstr(RI + "?['DueDay']") + "), "
                "equals(" + idstr("body('Get_action_r')?['AssignedToId']") + ", string(" + RD + "?['recipientId'])))))")
    again = "<p style=\"color:#5b6774\"><i>If you have already received this message, please ignore it.</i></p>"
    retry_mail = {'id': "@" + RI + "?['Id']", 'to': "@{" + RD + "?['to']}", 'subject': "@{" + RD + "?['subject']}",
                  'html': "@{if(contains(createArray('Unknown', 'Sending'), string(" + RI + "?['State'])), concat(" + q(again) + ", string(" + RD + "?['html'])), string(" + RD + "?['html']))}",
                  'type': "@{" + RD + "?['type']}", 'dueIso': "@{" + RD + "?['dueIso']}", 'actionId': "@{" + RD + "?['actionId']}",
                  'recipientId': "@{" + RD + "?['recipientId']}", 'login': "@{" + RD + "?['login']}"}
    row_item = L('notif', "/items(@{" + RI + "?['Id']})")
    states = lambda st: ('Get_' + st.lower(), http('GET', L('notif', "/items?$select=Id,NotificationKey,NotificationType,State,Attempts,DueDay,NextAttemptAfter,"
                                                              "SendingSince,RenderData&$filter=State eq '" + st + "'&$top=5000"), meta=True))
    waited = ("@or(and(not(equals(item()?['State'], 'Sending')), lessOrEquals(ticks(string(coalesce(item()?['NextAttemptAfter'], '2000-01-01T00:00:00Z'))), ticks(utcNow()))), "
              "and(equals(item()?['State'], 'Sending'), lessOrEquals(ticks(string(coalesce(item()?['SendingSince'], '2000-01-01T00:00:00Z'))), ticks(addMinutes(utcNow(), -30)))))")
    full = lambda step: (step + '_complete', cond("@empty(string(coalesce(body('" + step + "')?['odata.nextLink'], '')))", None,
                                                  seq((step + '_too_many', fail_here('More than 5,000 rows: see ' + step + '.')))))
    try_actions = seq(
        *site_and_ids(),
        ('Today', compose("@convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-dd')")),
        ('Get_settings', http('GET', L('settings', "/items?$select=Id,Title,Value&$top=500"))),
        ('Interval_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'OverdueReminderIntervalDays')")),
        ('Before_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'ReminderDaysBefore')")),
        ('Run_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'LastDailyRun')")),
        ('Interval', compose(setting('Interval', '7').replace('@max(0,', '@max(1,'))),
        ('Days_before', compose(setting('Before', '7'))),
        ('Window_end', compose("@addDays(concat(" + TODAY + ", 'T00:00:00Z'), outputs('Days_before'), 'yyyy-MM-dd')")),
        ('Get_people', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Status,Email,Person/Name,Person/EMail&$expand=Person&$top=5000"))),
        # one indexed query: every open action due by the end of the reminder window, late ones included (plan F.4.1)
        ('Get_candidates', http('GET', L('act', "/items?$select=Id,Title,AssignedToId,DueDay,OriginalDueDate,ExtensionCount,Status,PendingRequestKey,"
                                                "CreatedRequestKey,Competency/Title&$expand=Competency&$filter=IsOpen eq 1 and DueDay le @{"
                                                + day_num("outputs('Window_end')") + "}&$top=5000"))),
        full('Get_candidates'),
        # waiting for a close-out check is not the owner's to do; an action still being created is not there yet
        ('Live', query("@body('Get_candidates')?['value']", "@and(not(equals(item()?['Status'], 'Completed')), not(" + uncommitted + "))")),
        ('Due_days', {'type': 'Select', 'inputs': {'from': "@body('Live')", 'select': "@int(" + idq("item()?['DueDay']") + ")"}}),
        ('Earliest', compose("@min(union(body('Due_days'), createArray(99991231)))")),
        # the reminders already made for these deadlines, in one indexed query
        ('Get_ledger', http('GET', L('notif', "/items?$select=NotificationKey&$filter=DueDay ge @{outputs('Earliest')}&$top=5000"))),
        full('Get_ledger'),
        ('Known_keys', {'type': 'Select', 'inputs': {'from': "@body('Get_ledger')?['value']", 'select': "@item()?['NotificationKey']"}}),
        ('Each_candidate', {'type': 'Foreach', 'foreach': "@body('Live')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            ('Due_iso_c', compose('@' + due_iso(C + "?['DueDay']"))),
            ('Left_c', compose('@' + days_until("outputs('Due_iso_c')"))),
            ('Kind_c', compose("@if(greaterOrEquals(" + left + ", 1), 'R7', if(equals(" + left + ", 0), 'DUE', 'OD'))")),
            # late reminders: day 1, then every interval; the n-th one has its own key, so a missed day is caught up
            ('Round_c', compose("@if(less(" + left + ", 0), div(sub(sub(0, " + left + "), 1), outputs('Interval')), 0)")),
            ('Key_c', compose("@concat(" + kind + ", '|', " + idstr(C + "?['Id']") + ", '|', " + idstr(C + "?['DueDay']") + ", "
                              "if(equals(" + kind + ", 'OD'), concat('|', string(outputs('Round_c'))), ''), '|', " + idstr(C + "?['AssignedToId']") + ")")),
            ('Owner_c', query('@' + PEOPLE, "@equals(" + idstr("item()?['SiteUserId']") + ", " + idstr(C + "?['AssignedToId']") + ")")),
            ('New_c', cond("@not(contains(body('Known_keys'), outputs('Key_c')))", seq(
                ('Add_reminder', {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varNotices', 'value': reminder}}),
            ))),
        )}),
        ('To_remind', query("@variables('varNotices')", "@equals(item()?['send'], true)")),
        *outbox_create('_D', "body('To_remind')"),
        states('Failed'), states('Unknown'), states('Sending'),
        ('Retry_due', query("@union(body('Get_failed')?['value'], body('Get_unknown')?['value'], body('Get_sending')?['value'])", waited)),
        ('Each_retry', {'type': 'Foreach', 'foreach': "@body('Retry_due')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            ('Render_r', compose("@json(string(coalesce(" + RI + "?['RenderData'], '{}')))")),
            ('Give_up_r', cond("@greaterOrEquals(int(" + idq(RI + "?['Attempts']") + "), 3)", seq(
                ('Abandon_body', compose({'State': 'Abandoned', 'LastError': 'Not sent after 3 attempts.'})),
                ('Abandon', merge(row_item, 'Abandon_body', if_match="@{" + RI + "?['odata.etag']}")),
            ), seq(
                ('Person_r', query('@' + PEOPLE, "@and(equals(" + idstr("item()?['SiteUserId']") + ", string(" + RD + "?['recipientId'])), equals(item()?['Status'], 'Active'))")),
                ('Get_action_r', http('GET', L('act', "/items(@{" + idq(RD + "?['actionId']") + "})?$select=Id,IsOpen,DueDay,AssignedToId"))),
                ('Still_wanted_r', after(cond(wanted_r, seq(
                    ('Claim_body_r', compose({'State': 'Sending', 'Attempts': "@add(int(" + idq(RI + "?['Attempts']") + "), 1)", 'SendingSince': '@{utcNow()}'})),
                    ('Claim_r', merge(row_item, 'Claim_body_r', if_match="@{" + RI + "?['odata.etag']}")),
                    ('Requeue_r', {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varOutbox', 'value': retry_mail}}),
                ), seq(
                    ('Skip_body_r', compose({'State': 'Skipped', 'SkipReason': 'No longer needed: the action or its owner changed.'})),
                    ('Skip_r', merge(row_item, 'Skip_body_r', if_match="@{" + RI + "?['odata.etag']}")),
                )), {'Get_action_r': TOLERANT})),
            ))),
        )}),
        ('Ran_body', compose({'Value': '@{utcNow()}'})),
        ('Record_run', cond("@empty(body('Run_row'))", None, seq(
            ('Save_run', merge(L('settings', "/items(@{first(body('Run_row'))?['Id']})"), 'Ran_body')),
        ))),
    )
    actions = seq(('Initialize_varOutbox', init_var('varOutbox', 'array', [])),
                  ('Initialize_varNotices', init_var('varNotices', 'array', [])))
    actions['Try'] = after(scope(try_actions), {'Initialize_varNotices': OK})
    email_loop, email_act = send_outbox('')
    actions['Send_emails'] = after(scope({email_loop: email_act}), {'Try': OK})
    actions['Catch'] = after(scope(seq(('Terminate_failed', terminate('Failed', 'The daily tasks failed. See the failed action in the run history.')))),
                             {'Try': FAILED})
    triggers = {'Every_morning': {
        'type': 'Recurrence',
        'recurrence': {'frequency': 'Day', 'interval': 1, 'startTime': '2026-10-01T06:00:00', 'timeZone': 'GMT Standard Time',
                       'schedule': {'hours': [6], 'minutes': [0]}},
        'runtimeConfiguration': {'concurrency': {'runs': 1}}}}
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
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Applies the requests people send from the Competency Hub page: raise an action, move its deadline, mark it as done.'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f01', 'name': 'ESG Competency Hub | 1 Daily tasks', 'build': flow_daily_tasks,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Every morning: the 7-day, due-today and late reminders, and another try for emails that were not sent.',
     'introduced': '1.1.0.0'},
]


def build_all():
    return [dict(f, json=flow_json(f['build'](), f['connectors'])) for f in FLOWS]
