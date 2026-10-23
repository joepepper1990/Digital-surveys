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
from hub_schema import BY_KEY, SCHEMA

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
SELF_ONLY = 'As a technician you can raise actions for yourself in this area. Ask an engineer, or someone who runs meetings in this area, to raise it for someone else.'
# the action values a queued change may write, kept in its plan so that an administrator can write them back
REVERTABLE = ['Status', 'IsOpen', 'Blocker', 'AssignedToId', 'DueDay', 'CurrentDueDate', 'ExtensionCount', 'LastExtendedOn', 'DateCompleted',
              'DateClosed', 'ClosedById', 'CloseOutcome', 'ClosureNote', 'Title', 'Description', 'Priority', 'RequiresCloseOut', 'Revision']
DAY_TICKS = 864000000000


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
    for key in ('req', 'act', 'hist', 'upd', 'notif', 'members', 'people'):
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
               "if(" + is_('ALR') + ", concat('Competency Hub needs attention: ', " + T('title') + "), "
               "concat(" + T('title') + ", ' is ', string(" + late + "), " + plural(late, ' day late', ' days late') + ")))))))))")
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
    # an administrator alert (spec REL-4): what went wrong, the details, and a link to the admin page
    alert_html = ('<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#16222c">'
                  '<p style="color:#13516b;font-size:18px;font-weight:600;margin:0 0 12px">ESG Competency Hub</p>'
                  '<p><b>@{' + html_text(T('title')) + '}</b></p><p>@{' + html_text(T('note')) + '}</p>'
                  '<p style="margin:20px 0"><a href="@{outputs(\'Site_url\')}/SitePages/Hub.aspx?view=admin" '
                  'style="background:#13516b;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open Changes needing attention</a></p>'
                  '<p style="color:#5b6774;font-size:12px">This is an automated alert from the ESG Competency Hub, sent to its administrators. '
                  'Reference @{outputs(\'Token' + sfx + '\')}.</p></div>')
    mail = {'to': '@{' + T('email') + '}', 'subject': "@{outputs('Subject" + sfx + "')}", 'html': "@{outputs('Html" + sfx + "')}",
            'type': '@{' + T('type') + '}', 'dueIso': '@{' + T('dueIso') + '}', 'actionId': '@{' + T('actionId') + '}',
            'recipientId': '@{' + T('recipientId') + '}', 'login': '@{' + T('login') + '}', 'attempts': '1'}
    values, call = create_in_folder('notif', "@{outputs('Ids')?['notifRoot']}", 'Notice_values' + sfx, 'Notice_body' + sfx)
    find = L('notif', "/items?$select=Id&$filter=NotificationKey eq '@{" + esc(T('key')) + "}'")
    created = "and(equals(actions('Create_notice" + sfx + "')?['status'], 'Succeeded'), empty(body('Notice_refused" + sfx + "')))"
    append = lambda name, id_expr: (name, {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varOutbox', 'value': dict(mail, id=id_expr)}})
    return [(loop, {'type': 'Foreach', 'foreach': '@' + items_expr, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
        ('Token' + sfx, compose("@concat('ESGN', toUpper(take(replace(guid(), '-', ''), 10)))")),
        ('Subject' + sfx, compose(subject)),
        ('Html_action' + sfx, compose(html)),
        ('Html_alert' + sfx, compose(alert_html)),
        ('Html' + sfx, compose("@if(" + is_('ALR') + ", outputs('Html_alert" + sfx + "'), outputs('Html_action" + sfx + "'))")),
        ('Render' + sfx, compose(mail)),
        ('Notice_values' + sfx, form({
            'Title': "@{take(outputs('Subject" + sfx + "'), 255)}", 'NotificationKey': '@{' + T('key') + '}', 'Token': "@{outputs('Token" + sfx + "')}",
            'NotificationType': '@{' + T('type') + '}', 'Recipient': "@{concat('[{\"Key\":\"', " + T('login') + ", '\"}]')}",
            'RecipientEmail': '@{' + T('email') + '}', 'RecordType': "@{if(" + is_('ALR') + ", 'System', 'Action')}", 'RecordId': '@{' + T('actionId') + '}',
            'State': 'Sending', 'Attempts': '1',
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
                                             'SkipReason': "@{if(equals(" + T('type') + ", 'ASG'), 'Not needed: the email about the new action already gave the deadline.', 'Not needed: the email about the new deadline already gave it.')}", 'RenderData': '{}',
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
                'NextAttemptAfter': "@{if(greaterOrEquals(int(coalesce(" + T('attempts') + ", '1')), 2), addHours(utcNow(), 6), addMinutes(utcNow(), 15))}"})),
            ('Mark_unsent' + sfx, merge(item, 'Unsent_body' + sfx)),
        )), {'Send_mail' + sfx: TOLERANT})),
    )})



def alert_notices(name, admins_expr, key_expr, title_expr, detail_expr):
    """One ALR email for each active administrator (spec REL-4). The key carries the problem and the day, so an
    alert is sent at most once a day for each problem, however many runs find it."""
    return (name, {'type': 'Select', 'inputs': {'from': '@' + admins_expr, 'select': notice(
        'true', 'ALR', "concat('ALR|', " + key_expr + ", '|', outputs('Today'), '|', " + idstr("item()?['SiteUserId']") + ")", 'item()', "''", "'0'",
        title_expr, "''", "outputs('Today')", note=detail_expr)}})


def uk_when(expr):
    """A UTC time as it reads in the UK, e.g. "23 October 2026 at 10:12"; "an unknown time" when there is none."""
    s = "string(coalesce(" + expr + ", ''))"
    safe = "convertFromUtc(if(empty(" + s + "), '2000-01-01T00:00:00Z', " + s + "), 'GMT Standard Time')"
    return "if(empty(" + s + "), 'an unknown time', concat(formatDateTime(" + safe + ", 'd MMMM yyyy'), ' at ', formatDateTime(" + safe + ", 'HH:mm')))"


def alert_if(name, condition, key_expr, title_expr, detail_expr):
    """Adds an alert for every active administrator to varAlerts when the condition holds."""
    return (name, cond('@' + condition, seq(
        alert_notices(name + '_to', "body('Admins')", key_expr, title_expr, detail_expr),
        (name + '_add', set_var('varAlerts', "@union(variables('varAlerts'), body('" + name + "_to'))")),
    )))


def health_of(settings_step):
    """The queue monitor's last report (spec REL-1), from its Settings row: {state, reason, checkedAt, ...}."""
    row = "first(body('Health_row'))"
    return [('Health_row', query("@body('" + settings_step + "')?['value']", "@equals(item()?['Title'], 'QueueHealth')")),
            ('Health', compose("@json(if(empty(string(coalesce(" + row + "?['Value'], ''))), '{}', string(" + row + "?['Value'])))"))]


def retry_emails():
    """Plan F.4.2 retries, shared by Daily tasks and the Queue monitor: Failed or Unknown rows whose wait is over, and
    rows left 'Sending' by a run that stopped, are sent again on the same row; after 3 attempts a row is Abandoned and
    the administrators are told. Needs Get_people (with IsAdministrator), Today, varOutbox and varAlerts."""
    PEOPLE = "body('Get_people')?['value']"
    RI = "items('Each_retry')"
    RD = "outputs('Render_r')"
    # an alert is wanted while its administrator is active; an action email while the action is open (and, for a
    # reminder, still has the same deadline and owner)
    wanted_r = ("@and(not(empty(body('Person_r'))), or(equals(string(" + RI + "?['NotificationType']), 'ALR'), "
                "and(equals(actions('Get_action_r')?['status'], 'Succeeded'), equals(body('Get_action_r')?['IsOpen'], true), "
                "or(not(contains(createArray('R7', 'DUE', 'OD'), string(" + RI + "?['NotificationType']))), "
                "and(equals(" + idstr("body('Get_action_r')?['DueDay']") + ", " + idstr(RI + "?['DueDay']") + "), "
                "equals(" + idstr("body('Get_action_r')?['AssignedToId']") + ", string(" + RD + "?['recipientId'])))))))")
    again = "<p style=\"color:#5b6774\"><i>If you have already received this message, please ignore it.</i></p>"
    retry_mail = {'id': "@" + RI + "?['Id']", 'to': "@{" + RD + "?['to']}", 'subject': "@{" + RD + "?['subject']}",
                  'html': "@{if(contains(createArray('Unknown', 'Sending'), string(" + RI + "?['State'])), concat(" + q(again) + ", string(" + RD + "?['html'])), string(" + RD + "?['html']))}",
                  'type': "@{" + RD + "?['type']}", 'dueIso': "@{" + RD + "?['dueIso']}", 'actionId': "@{" + RD + "?['actionId']}",
                  'recipientId': "@{" + RD + "?['recipientId']}", 'login': "@{" + RD + "?['login']}",
                  'attempts': "@{add(int(" + idq(RI + "?['Attempts']") + "), 1)}"}
    row_item = L('notif', "/items(@{" + RI + "?['Id']})")
    states = lambda st: ('Get_' + st.lower(), http('GET', L('notif', "/items?$select=Id,NotificationKey,NotificationType,State,Attempts,DueDay,NextAttemptAfter,"
                                                              "SendingSince,RenderData,LastError&$filter=State eq '" + st + "'&$top=5000"), meta=True))
    waited = ("@or(and(not(equals(item()?['State'], 'Sending')), lessOrEquals(ticks(string(coalesce(item()?['NextAttemptAfter'], '2000-01-01T00:00:00Z'))), ticks(utcNow()))), "
              "and(equals(item()?['State'], 'Sending'), lessOrEquals(ticks(string(coalesce(item()?['SendingSince'], '2000-01-01T00:00:00Z'))), ticks(addMinutes(utcNow(), -30)))))")
    return [
        states('Failed'), states('Unknown'), states('Sending'),
        ('Retry_due', query("@union(body('Get_failed')?['value'], body('Get_unknown')?['value'], body('Get_sending')?['value'])", waited)),
        ('Each_retry', {'type': 'Foreach', 'foreach': "@body('Retry_due')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            ('Render_r', compose("@json(string(coalesce(" + RI + "?['RenderData'], '{}')))")),
            ('Give_up_r', cond("@greaterOrEquals(int(" + idq(RI + "?['Attempts']") + "), 3)", seq(
                ('Abandon_body', compose({'State': 'Abandoned', 'LastError': 'Not sent after 3 attempts.'})),
                ('Abandon', merge(row_item, 'Abandon_body', if_match="@{" + RI + "?['odata.etag']}")),
                ('Abandoned_here', after(cond("@equals(actions('Abandon')?['status'], 'Succeeded')", seq(
                alert_notices('Abandon_alerts', "body('Admins')", "concat('email|', string(" + RI + "?['Id']))",
                              "concat('An email could not be sent: ', string(" + RD + "?['subject']))",
                              "concat('It failed three times and will not be tried again. It was for ', string(" + RD + "?['to']), '. ', string(coalesce(" + RI + "?['LastError'], '')))"),
                ('Add_abandon_alerts', {'type': 'SetVariable', 'inputs': {'name': 'varAlerts', 'value': "@union(variables('varAlerts'), body('Abandon_alerts'))"}}),
                )), {'Abandon': TOLERANT})),
            ), seq(
                ('Person_r', query('@' + PEOPLE, "@and(equals(" + idstr("item()?['SiteUserId']") + ", string(" + RD + "?['recipientId'])), equals(item()?['Status'], 'Active'))")),
                ('Get_action_r', http('GET', L('act', "/items(@{" + idq(RD + "?['actionId']") + "})?$select=Id,IsOpen,DueDay,AssignedToId"))),
                ('Still_wanted_r', after(cond(wanted_r, seq(
                    ('Claim_body_r', compose({'State': 'Sending', 'Attempts': "@add(int(" + idq(RI + "?['Attempts']") + "), 1)", 'SendingSince': '@{utcNow()}'})),
                    ('Claim_r', merge(row_item, 'Claim_body_r', if_match="@{" + RI + "?['odata.etag']}")),
                    ('Claimed_here_r', after(cond("@equals(actions('Claim_r')?['status'], 'Succeeded')", seq(
                        ('Requeue_r', {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varOutbox', 'value': retry_mail}}),
                    )), {'Claim_r': TOLERANT})),
                ), seq(
                    ('Skip_body_r', compose({'State': 'Skipped', 'SkipReason': 'No longer needed: the action or its owner changed.'})),
                    ('Skip_r', merge(row_item, 'Skip_body_r', if_match="@{" + RI + "?['odata.etag']}")),
                    ('Skipped_r', after(compose('done'), {'Skip_r': TOLERANT})),
                )), {'Get_action_r': TOLERANT})),
            ))),
        )}),
    ]


# --------------------------------------------------------------------------------------------- the flow
# Which flow applies which kind of request (spec §5.3): each flow's trigger takes only its own kinds, and the
# Request queue takes everything else (so an unknown kind is still answered, with a refusal).
DOMAIN_TYPES = {
    'admin': ['RetryTransaction', 'CancelTransaction', 'RevertTransaction', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson', 'UpdateSetting'],
}
ACTION_TYPES = ['RaiseAction', 'ExtendDeadline', 'MarkComplete', 'ChangeStatus', 'ReassignAction', 'CloseAction', 'ReopenAction', 'EditActionDetails']
FINAL_TX = "createArray('Applied', 'Void', 'Cancelled', 'Reverted', 'Rolled Back')"


def flow_request_queue(domain='actions'):
    """Applies a queued request (plan F.1). The "actions" flow records changes to actions; the "admin" flow records
    people, settings and administrators' decisions on changes needing attention.

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
    # Administration changes are decided once. The decision is marked on the transaction (StepsDone DECIDED) together
    # with State Planned, so a run that fails before deciding - its State then reads Failed - checks everything again.
    UNDECIDED = "not(contains(string(coalesce(" + TX + "?['StepsDone'], '')), 'DECIDED'))"

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
            # this run took the lock, and only these one-at-a-time runs write Actions: release it directly.
            # A resumed run reads the action first and releases only its own lock. The lock goes before the
            # transaction is marked Applied, so an Applied transaction never leaves an action locked.
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
            *tx_update('applied' + sfx, {'State': 'Applied', 'StepsDone': 'VALUES;EVENT;RELEASE', 'ProcessedAt': '@{utcNow()}'}),
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
                 # spec §4.2: a technician without meeting rights in the area raises only for themselves
                 "if(and(equals(string(" + ME + "?['Role']), 'Technician'), not(equals(first(body('My_member_R'))?['CanManageMeetings'], true)), "
                 "not(equals(" + idstr(OWNER_R + "?['SiteUserId']") + ", " + SENDER + "))), " + q(SELF_ONLY) + ", "
                 "if(empty(" + TITLE + "), 'Enter what needs doing.', "
                 "if(greater(length(" + TITLE + "), 255), 'Keep the title to 255 characters or fewer.', "
                 "if(empty(" + DESC + "), 'Add a short description.', "
                 "if(greater(length(" + DESC + "), 5000), 'Keep the description to 5,000 characters or fewer.', "
                 "if(not(" + DUE_OK + "), 'Choose a target date.', "
                 "if(less(" + day_num(DUE_SAFE) + ", " + day_num(TODAY) + "), 'The target date cannot be in the past.', "
                 "if(greater(" + day_num(DUE_SAFE) + ", " + day_num(MAX_DAY) + "), concat('Choose a date within ', string(outputs('Years_R')), if(equals(outputs('Years_R'), 1), ' year.', ' years.')), "
                 "if(not(contains(createArray('Low', 'Normal', 'High'), " + PRIO + ")), 'Choose a priority.', ''))))))))))))")
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
        # the furthest deadline (MaxDeadlineYears, set by an administrator), and whether this is still pre-go-live testing
        ('Get_settings_R', after(http('GET', L('settings', "/items?$select=Title,Value&$top=500")), {'Read_due_R': TOLERANT})),
        ('Years_row_R', query("@body('Get_settings_R')?['value']", "@equals(item()?['Title'], 'MaxDeadlineYears')")),
        ('Years_R', compose("@max(1, int(if(empty(string(coalesce(first(body('Years_row_R'))?['Value'], ''))), '2', string(first(body('Years_row_R'))?['Value']))))")),
        ('Testing_R', query("@body('Get_settings_R')?['value']", "@and(equals(item()?['Title'], 'PreGoLiveTesting'), equals(item()?['Value'], 'Yes'))")),
        ('Max_due_R', after(compose("@formatDateTime(addToTime(concat(" + TODAY + ", 'T00:00:00Z'), mul(outputs('Years_R'), 12), 'Month'), 'yyyy-MM-dd')"),
                            {'Testing_R': OK})),
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
                    'SourceType': 'None', 'IsCrossCompetency': '0', 'PendingRequestKey': '@{' + KEY + '}', 'CreatedRequestKey': 'F|@{' + KEY + '}',
                    'IsTestRecord': "@{if(empty(body('Testing_R')), '0', '1')}"})),
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
                     'json': {'NewDueDate': '@{' + uk_midnight(DUE) + '}', 'OwnerId': '@int(' + OWNER_ID_R + ')', 'DueDayAtEvent': '@' + day_num(DUE)}},
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
        # spec §4.2, judged against the action's primary area: management and the area's engineers ('lead');
        # "Can run meetings" in the area ('chair') – edit, reassign and close, never reopen; the raiser – edit, close,
        # reopen, and reassign unless a technician without meeting rights
        LEAD = "or(" + IS_MGMT + ", and(not(empty(" + MEMBER + ")), equals(string(" + ME + "?['Role']), 'Engineer')))"
        CHAIR = "and(not(empty(" + MEMBER + ")), equals(" + MEMBER + "?['CanManageMeetings'], true))"
        TECH_ONLY = "and(equals(string(" + ME + "?['Role']), 'Technician'), not(" + CHAIR + "))"
        EDITS = "or(" + LEAD + ", " + CHAIR + ", " + RAISER + ")"
        ctx = {'A': A, 'OWNER': OWNER, 'ALLOWED': "or(" + OWNER + ", " + EDITS + ")", 'EDIT': EDITS, 'CLOSE': EDITS,
               'REASSIGN': "or(" + LEAD + ", " + CHAIR + ", and(" + RAISER + ", not(" + TECH_ONLY + ")))",
               'REOPEN': "or(" + LEAD + ", " + RAISER + ")",
               'OPEN': "contains(" + OPEN + ", string(" + A + "?['Status']))", 'DUE': due_iso(A + "?['DueDay']"),
               'PLAN': "json(string(coalesce(variables('varTxPlan'), '{}')))",
               'OWNER_P': "first(body('Owner_p" + sfx + "'))", 'RAISER_P': "first(body('Raiser_p" + sfx + "'))",
               'NEW_P': "first(body('New_p" + sfx + "'))", 'PREV_P': "first(body('Prev_p" + sfx + "'))",
               'OWNER_ID': idstr(A + "?['AssignedToId']"), 'RAISER_ID': idstr(A + "?['RaisedById']"),
               'AREA_NAME': "string(" + A + "?['Competency']?['Title'])", 'ACT_ID': idstr(A + "?['Id']"),
               'ORIGINAL': "if(empty(string(coalesce(" + A + "?['OriginalDueDate'], ''))), '', convertFromUtc(string(coalesce(" + A + "?['OriginalDueDate'], '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyy-MM-dd'))"}
        action_item = L('act', "/items(@{" + idstr(TX + "?['RecordId']") + "})")
        sel = ('?$select=Id,Title,CompetencyId,AssignedToId,RaisedById,Status,IsOpen,DueDay,CurrentDueDate,OriginalDueDate,ExtensionCount,'
               'LastExtendedOn,RequiresCloseOut,Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,Description,Priority,Blocker,'
               'DateCompleted,DateClosed,ClosedById,CloseOutcome,ClosureNote,Competency/CompetencyKey,Competency/Title&$expand=Competency')
        # every value a change can write, as it was before: an administrator's Revert writes these back (spec REL-3)
        PREV = {f: '@' + A + "?['" + f + "']" for f in REVERTABLE}
        # what every History event records for later statistics (spec H-1); a kind of change may say more
        EVENT_DEFAULTS = {'OwnerId': '@int(' + idq(A + "?['AssignedToId']") + ')', 'DueDayAtEvent': '@int(' + idq(A + "?['DueDay']") + ')'}
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
                default=reject('_type', "'This kind of change is not recognised.'"))[1], {'Read_due' + sfx: TOLERANT})),
            ('Allowed' + sfx, cond("@empty(variables('varVerdict'))", seq(
                ('Not_yet_applied' + sfx, cond("@" + ALREADY, None, seq(
                    # the plan is stored before anything changes, so a resumed run knows the previous values
                    by_type('Plan', lambda code, sp: [('Plan_set' + code, set_var('varPlanObj', dict(sp['plan'](ctx), prev=PREV))),
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
                    ('Event_json' + code, set_var('varEventJson', dict(EVENT_DEFAULTS, **sp['event'](ctx).get('json', {})))),
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
                            'IsOnBehalf': "@not(equals(json(string(coalesce(variables('varTxPlan'), '{}')))?['owner'], true))",
                            'DueDayAtEvent': '@' + day_num(NEW)}},
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
                   'form': {'Note': '@{' + NOTE + '}'}, 'json': {'CompletionKind': 'MarkedDone'}},
        lambda c: "if(" + CLOSES + ", 'Action closed.', 'Marked as done; waiting for a close-out check.')",
        # the raiser is asked for the close-out check; a closed action is reported to its owner only
        lambda c: [notice("and(not(" + CLOSES + "), not(equals(" + c['RAISER_ID'] + ", " + SENDER + ")))", 'RDY',
                          "concat('RDY|', " + KEY + ", '|', " + c['RAISER_ID'] + ")", c['RAISER_P'], *complete_common(c), note=NOTE),
                   notice("and(" + CLOSES + ", not(equals(" + c['OWNER_ID'] + ", " + SENDER + ")))", 'CLS',
                          "concat('CLS|', " + KEY + ", '|', " + c['OWNER_ID'] + ")", c['OWNER_P'], *complete_common(c), note=NOTE)])

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
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open, so it cannot be reassigned.', c['REASSIGN'],
                               'Only the people who manage this action can reassign it.'),
                        ("equals(" + NEW_OWNER_ID + ", '0')", 'Choose who will do it.'),
                        ("equals(" + NEW_OWNER_ID + ", " + c['OWNER_ID'] + ")", 'Choose someone other than the current owner.'),
                        ("not(" + owner_ok + ")", 'Choose a member of this area or a Team Leader.'),
                        *REASON_RULES),
        lambda c: {'owner': '@{' + c['OWNER_ID'] + '}', 'ownerName': "@{first(body('Get_owner_now_A')?['value'])?['Title']}"},
        lambda c: {'AssignedToId': '@int(' + NEW_OWNER_ID + ')'},
        lambda c: {'title': "concat('Reassigned to ', string(" + NEW_OWNER + "?['Title']))", 'type': 'Reassigned',
                   'form': {'Note': '@{' + REASON + '}', 'PreviousValue': "@{" + c['PLAN'] + "?['ownerName']}", 'NewValue': "@{" + NEW_OWNER + "?['Title']}"},
                   'json': {'OwnerId': '@int(' + NEW_OWNER_ID + ')', 'PreviousOwnerId': '@int(' + PREV_OWNER_ID + ')'}},
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
                               c['CLOSE'], 'Only the people who manage this action can close it.'),
                        ("not(contains(createArray('Completed', 'No longer required', 'Superseded', 'Other'), " + OUTCOME + "))", 'Choose an outcome.'),
                        ("and(not(equals(" + OUTCOME + ", 'Completed')), less(" + NOTE_LEN + ", 10))", 'Explain the outcome in at least 10 characters.'),
                        ("greater(" + NOTE_LEN + ", 1000)", 'Keep the note to 1,000 characters or fewer.')),
        lambda c: {'status': '@string(' + c['A'] + "?['Status'])"},
        lambda c: {'Status': 'Closed', 'IsOpen': False, 'DateClosed': '@{' + EVENT_TIME + '}', 'ClosedById': '@int(' + SENDER + ')',
                   'CloseOutcome': '@{' + OUTCOME + '}', 'ClosureNote': '@{' + NOTE + '}'},
        lambda c: {'title': "concat('Closed: ', " + OUTCOME + ")", 'type': 'Closed',
                   'form': {'Note': '@{' + NOTE + '}', 'NewValue': '@{' + OUTCOME + '}'},
                   # a close-out check confirms a completion already counted; a manager's 'Completed' completes it now
                   'json': {'CompletionKind': "@{if(not(equals(" + OUTCOME + ", 'Completed')), 'ClosedNotCompleted', "
                                              "if(equals(string(" + c['PLAN'] + "?['status']), 'Completed'), 'CloseOutConfirmed', 'ClosedByManager'))}"}},
        lambda c: "'Action closed.'",
        lambda c: [notice("not(equals(" + c['OWNER_ID'] + ", " + SENDER + "))", 'CLS', "concat('CLS|', " + KEY + ", '|', " + c['OWNER_ID'] + ")",
                          c['OWNER_P'], *complete_common(c), note=NOTE)])

    reopen_case = change_case(
        '_O',
        lambda c: chain(*guard(c, "contains(createArray('Closed', 'Completed'), string(" + c['A'] + "?['Status']))", 'This action is already open.',
                               c['REOPEN'], 'Only the people who manage this action can reopen it.'),
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
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open.', c['EDIT'], 'Only the people who manage this action can change its details.'),
                        # the owner changes only by Reassign, which has its own rule (spec §4.2)
                        ("or(" + HAS('ownerId') + ", " + HAS('AssignedTo') + ", " + HAS('AssignedToId') + ")", 'The owner is changed with Reassign.'),
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

    # ---------------------------------------------------------------- administrators: Retry, Cancel, Revert (spec REL-3)
    def admin_switch():
        """An administrator's decision about a change that needs attention. The target is another request's
        transaction row; its request is put back in the queue (Retry), closed before anything was changed (Cancel),
        or – when the change is part-made and its action still locked – the action's previous values are written
        back and audited (Revert). Nothing is ever labelled rolled back while new values remain."""
        sfx = '_T'
        T = "body('Get_target" + sfx + "')"
        TQ = "body('Get_target_req" + sfx + "')"
        TKEY = "string(" + T + "?['RequestKey'])"
        TTYPE = "string(" + T + "?['RequestType'])"
        TPLAN = "json(string(coalesce(" + T + "?['PreviousValue'], '{}')))"
        ACT = "variables('varAct')"
        OWN = "string(" + TX + "?['RequestType'])"
        TYPE_IS = lambda x: "equals(" + OWN + ", '" + x + "')"
        HAS_ACT = "not(empty(string(coalesce(" + ACT + "?['Id'], ''))))"
        LOCKED = "and(" + HAS_ACT + ", equals(string(coalesce(" + ACT + "?['PendingRequestKey'], '')), " + TKEY + "))"
        # people and settings changes have no action: once decided, groups or rows may already have changed
        ADMIN_PART = ("and(contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['admin']) + "), " + TTYPE + "), "
                      "contains(string(coalesce(" + T + "?['StepsDone'], '')), 'DECIDED'))")
        APPLIED = "or(" + ADMIN_PART + ", and(" + HAS_ACT + ", or(" + LOCKED + ", equals(string(coalesce(" + ACT + "?['LastRequestKey'], '')), " + TKEY + "))))"
        REVERTED_HERE = "and(" + HAS_ACT + ", equals(string(coalesce(" + ACT + "?['LastRequestKey'], '')), " + KEY + "))"
        FINAL = "contains(" + FINAL_TX + ", string(" + T + "?['State']))"
        BUSY = ("and(equals(string(" + TQ + "?['Status']), 'Processing'), "
                "greater(ticks(string(coalesce(" + TQ + "?['Modified'], '2000-01-01T00:00:00Z'))), ticks(addMinutes(utcNow(), -15))))")
        FIRST = UNDECIDED
        RAISE = "equals(" + TTYPE + ", 'RaiseAction')"
        act_sel = "?$select=Id,Title,Revision,PendingRequestKey,LastRequestKey,CompetencyId,AssignedToId,DueDay,Competency/CompetencyKey&$expand=Competency"
        verdict = chain(
            ("not(and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active')))", 'Only a Competency Hub administrator can do this.'),
            ("or(not(equals(actions('Get_target" + sfx + "')?['status'], 'Succeeded')), not(equals(string(" + T + "?['RowKind']), 'Transaction')), "
             "not(endsWith(string(" + T + "?['FileDirRef']), '/Transactions')))", 'That change could not be found.'),
            (FINAL, 'This change is already finished.'),
            (BUSY, 'This change is being processed right now. Try again in a few minutes.'),
            ("and(" + TYPE_IS('CancelTransaction') + ", " + APPLIED + ")", 'Part of this change has already been made, so it cannot be cancelled. Use Finish (or Revert, for a change to an action).'),
            ("and(" + TYPE_IS('RevertTransaction') + ", not(contains(createArray(" + ", ".join(q(x) for x in ACTION_TYPES) + "), " + TTYPE + ")))",
             'Only changes to actions can be reverted.'),
            ("and(" + TYPE_IS('RevertTransaction') + ", not(" + LOCKED + "))", 'Nothing from this change was made, so there is nothing to revert. Use Try again.'),
            ("and(" + TYPE_IS('RevertTransaction') + ", not(" + RAISE + "), not(equals(int(" + idq(ACT + "?['Revision']") + "), "
             "add(int(" + idq(TPLAN + "?['prev']?['Revision']") + "), 1))))", 'The action has been changed since, so this cannot be reverted automatically.'))
        area_key = ACT + "?['Competency']?['CompetencyKey']"
        act_item = L('act', "/items(@{" + idq(ACT + "?['Id']") + "})")
        withdrawn = {'Status': 'Closed', 'IsOpen': False, 'CloseOutcome': 'Withdrawn', 'DateClosed': '@{' + EVENT_TIME + '}', 'ClosedById': '@int(' + SENDER + ')'}
        release = {'PendingRequestKey': '', 'LastRequestKey': '@{' + KEY + '}', 'Revision': "@add(int(" + idq(ACT + "?['Revision']") + "), 1)"}
        prev_values = "removeProperty(coalesce(" + TPLAN + "?['prev'], json('{}')), 'Revision')"
        act_ev_key = "concat(" + KEY + ", '|2')"
        act_ev_path = "@{outputs('Ids')?['histRoot']}/@{" + area_key + "}/A@{" + idq(ACT + "?['Id']") + "}"
        act_ev_values, act_ev_call = create_in_folder('hist', act_ev_path, 'Revert_event_values' + sfx, 'Revert_event_body' + sfx)
        adm_ev_key = "concat(" + KEY + ", '|1')"
        adm_ev_values, adm_ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'Admin_event_values' + sfx, 'Admin_event_body' + sfx)
        target_tx = L('hist', "/items(@{" + idq(T + "?['Id']") + "})")
        target_req = L('req', "/items(@{" + idq(T + "?['RequestItemId']") + "})")
        what = "concat(string(" + T + "?['Title']), ' (', " + TKEY + ", ')')"
        label = {'RetryTransaction': 'Retried', 'CancelTransaction': 'Cancelled', 'RevertTransaction': 'Reverted'}
        return seq(
            ('Get_target' + sfx, http('GET', L('hist', "/items(@{" + idq(P + "?['txId']") + "})?$select=Id,Title,RowKind,RequestKey,RequestType,RecordId,State,"
                                                   "Attempts,PreviousValue,RequestItemId,FileDirRef,StepsDone"), meta=True)),
            ('Get_target_req' + sfx, after(http('GET', target_req + '?$select=Id,Status,Modified', meta=True), {'Get_target' + sfx: TOLERANT})),
            # the action the change was for: a raise is found by the key it was created with
            ('Find_act' + sfx, after(cond('@' + RAISE, seq(
                ('Get_raised' + sfx, http('GET', L('act', "/items" + act_sel + "&$filter=CreatedRequestKey eq 'F%7C@{" + esc(TKEY) + "}'"), meta=True)),
                ('Set_raised' + sfx, set_var('varAct', "@coalesce(first(body('Get_raised" + sfx + "')?['value']), json('{}'))")),
            ), seq(
                ('Get_changed' + sfx, http('GET', L('act', "/items(@{" + idq(T + "?['RecordId']") + "})" + act_sel), meta=True)),
                ('Set_changed' + sfx, after(set_var('varAct', "@if(equals(actions('Get_changed" + sfx + "')?['status'], 'Succeeded'), body('Get_changed" + sfx + "'), json('{}'))"),
                                            {'Get_changed' + sfx: TOLERANT})),
            )), {'Get_target_req' + sfx: TOLERANT})),
            # the decision is taken once, on the first run; a resumed run carries out what was decided
            ('Decide' + sfx, cond('@' + FIRST, seq(
                ('Verdict' + sfx, compose('@' + verdict)),
                ('Decided' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))",
                                       seq(*tx_update('planned' + sfx, {'State': 'Planned', 'StepsDone': 'DECIDED'})),
                                       reject(sfx, "outputs('Verdict" + sfx + "')"))),
            ))),
            ('Do' + sfx, switch("@" + OWN, {
                'RetryTransaction': seq(
                    ('Retry_needed' + sfx, cond("@not(" + FINAL + ")", seq(
                        ('Retry_tx' + sfx, compose({'State': 'Failed', 'Attempts': 0, 'NextAttemptAfter': None,
                                                    'LastError': "@{concat('Tried again at the request of ', string(" + ME + "?['Title']), '.')}"})),
                        ('Save_retry_tx' + sfx, merge(target_tx, 'Retry_tx' + sfx)),
                        ('Retry_req' + sfx, compose({'Status': 'Submitted', 'ResultMessage': 'Being tried again.'})),
                        ('Save_retry_req' + sfx, merge(target_req, 'Retry_req' + sfx)),
                    ))),
                ),
                'CancelTransaction': seq(
                    ('Cancel_tx' + sfx, compose({'State': 'Cancelled', 'LastError': "@{concat('Cancelled by ', string(" + ME + "?['Title']), '. Nothing was changed.')}"})),
                    ('Save_cancel_tx' + sfx, merge(target_tx, 'Cancel_tx' + sfx)),
                    ('Cancel_req' + sfx, compose({'Status': 'Cancelled', 'ResultMessage': 'Cancelled by an administrator. Nothing was changed.'})),
                    ('Save_cancel_req' + sfx, merge(target_req, 'Cancel_req' + sfx)),
                ),
                'RevertTransaction': seq(
                    # the previous values go back with the action's ETag, only while the change still holds its lock
                    ('Revert_values' + sfx, cond("@and(" + LOCKED + ", not(" + REVERTED_HERE + "))", seq(
                        # a part-made raise is withdrawn; any other change gets its previous values back
                        ('Release_fields' + sfx, compose(release)),
                        ('Withdraw_body' + sfx, compose(dict(withdrawn, **release))),
                        ('Revert_body' + sfx, compose("@union(" + prev_values + ", outputs('Release_fields" + sfx + "'))")),
                        ('Revert_choice' + sfx, compose("@if(" + RAISE + ", outputs('Withdraw_body" + sfx + "'), outputs('Revert_body" + sfx + "'))")),
                        ('Revert_action' + sfx, merge(act_item, 'Revert_choice' + sfx, if_match="@{" + ACT + "?['odata.etag']}")),
                    ))),
                    ('No_fresh' + sfx, set_var('varFresh', False)),
                    *ensure_folder('_RH' + sfx, 'hist', 'histRoot', area_key, "concat('A', " + idq(ACT + "?['Id']") + ")"),
                    ('Find_revert_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(act_ev_key) + "}'"))),
                    ('Need_revert_event' + sfx, cond("@empty(body('Find_revert_event" + sfx + "')?['value'])", seq(
                        ('Revert_event_values' + sfx, form({
                            'Title': "@{if(" + RAISE + ", 'Withdrawn by an administrator', 'Change reverted by an administrator')}",
                            'RowKind': 'Event', 'RequestKey': '@{' + act_ev_key + '}', 'RecordType': 'Action', 'RecordId': '@{' + idq(ACT + "?['Id']") + '}',
                            'EventType': "@{if(" + RAISE + ", 'Withdrawn', 'Change Reverted')}", 'RequestType': 'RevertTransaction',
                            'Note': "@{concat('The change ', " + what + ", ' could not be completed and was reverted by ', string(" + ME + "?['Title']), '.')}",
                            'PreviousValue': "@{string(" + TPLAN + "?['prev'])}", 'CompletionKind': "@{if(" + RAISE + ", 'Withdrawn', '')}",
                            # the owner and deadline as they stand once the change is undone (H-1)
                            'OwnerId': "@{" + idq("coalesce(" + TPLAN + "?['prev']?['AssignedToId'], " + ACT + "?['AssignedToId'])") + "}",
                            'DueDayAtEvent': "@{" + idq("coalesce(" + TPLAN + "?['prev']?['DueDay'], " + ACT + "?['DueDay'])") + "}"})),
                        ('Revert_event_body' + sfx, act_ev_values),
                        ('Revert_event' + sfx, act_ev_call),
                        *created_ok('Revert_event' + sfx, 'Revert_event_made' + sfx, 'The History event could not be created. See Revert_event' + sfx + '.'),
                    ))),
                    ('Revert_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
                    ('Find_revert_event_again' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(act_ev_key) + "}'"))),
                    ('Save_revert_event' + sfx, merge(L('hist', "/items(@{first(body('Find_revert_event_again" + sfx + "')?['value'])?['Id']})"), 'Revert_event_details' + sfx)),
                    # emails about the change that have not gone yet are no longer true: they are not sent
                    ('Find_change_emails' + sfx, http('GET', L('notif', "/items?$select=Id,State&$top=100&$filter=" + " or ".join(
                        "startswith(NotificationKey,'" + k + "%7C@{" + esc(TKEY) + "}%7C')" for k in ('ASG', 'RAW', 'EXT', 'RDY', 'CLS'))))),
                    ('Unsent_change_emails' + sfx, query("@body('Find_change_emails" + sfx + "')?['value']",
                                                         "@contains(createArray('Queued', 'Sending', 'Failed', 'Unknown'), string(item()?['State']))")),
                    ('Each_unsent_email' + sfx, {'type': 'Foreach', 'foreach': "@body('Unsent_change_emails" + sfx + "')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}},
                                                 'actions': seq(
                        ('Not_needed_email' + sfx, compose({'State': 'Skipped', 'SkipReason': 'Not needed: the change was reverted by an administrator.'})),
                        ('Save_not_needed_email' + sfx, merge(L('notif', "/items(@{items('Each_unsent_email" + sfx + "')?['Id']})"), 'Not_needed_email' + sfx)),
                    )}),
                    ('Reverted_tx' + sfx, compose({'State': 'Reverted', 'LastError': "@{concat('Reverted by ', string(" + ME + "?['Title']), '.')}"})),
                    ('Save_reverted_tx' + sfx, merge(target_tx, 'Reverted_tx' + sfx)),
                    ('Reverted_req' + sfx, compose({'Status': 'Reverted', 'ResultMessage': "@{if(" + RAISE + ", 'Withdrawn by an administrator: it could not be completed.', "
                                                                                          "'Reverted by an administrator: it could not be completed, so the action is as it was before.')}"})),
                    ('Save_reverted_req' + sfx, merge(target_req, 'Reverted_req' + sfx)),
                ),
            }, seq(('Not_admin' + sfx, compose('none'))))),
            ('Find_admin_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(adm_ev_key) + "}'"))),
            ('Need_admin_event' + sfx, cond("@empty(body('Find_admin_event" + sfx + "')?['value'])", seq(
                ('Admin_event_values' + sfx, form({
                    'Title': "@{take(concat(if(" + TYPE_IS('RetryTransaction') + ", 'Tried again: ', if(" + TYPE_IS('CancelTransaction') + ", 'Cancelled: ', 'Reverted: ')), " + what + "), 255)}",
                    'RowKind': 'Event', 'RequestKey': '@{' + adm_ev_key + '}', 'RecordType': 'System', 'RecordId': '@{' + idq(T + "?['Id']") + '}',
                    'EventType': "@{if(" + TYPE_IS('RetryTransaction') + ", 'Change Retried', if(" + TYPE_IS('CancelTransaction') + ", 'Change Cancelled', 'Change Reverted'))}",
                    'RequestType': '@{' + OWN + '}', 'Note': "@{string(coalesce(" + P + "?['note'], ''))}"})),
                ('Admin_event_body' + sfx, adm_ev_values),
                ('Admin_event' + sfx, adm_ev_call),
                *created_ok('Admin_event' + sfx, 'Admin_event_made' + sfx, 'The History event could not be created. See Admin_event' + sfx + '.'),
            ))),
            ('Admin_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
            ('Find_admin_event_again' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(adm_ev_key) + "}'"))),
            ('Save_admin_event' + sfx, merge(L('hist', "/items(@{first(body('Find_admin_event_again" + sfx + "')?['value'])?['Id']})"), 'Admin_event_details' + sfx)),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "if(" + TYPE_IS('RetryTransaction') + ", 'Being tried again.', if(" + TYPE_IS('CancelTransaction') + ", "
                            "'Cancelled. Nothing was changed.', 'Reverted.'))", 'int(' + idq(T + "?['Id']") + ')'),
        )

    # ---------------------------------------------------------------- administrators: people and settings (spec §3.2, §4)
    def people_switch():
        """Adds a person, changes a person's role, areas, meeting rights, notice posting and administrator flag,
        marks a leaver, or reactivates one – all as one transaction. Access is always narrowed first: groups are left
        before the record says so, and joined only after it does, each read back. Nobody may change their own access,
        and there is always at least one active administrator."""
        sfx = '_P'
        OWN = "string(" + TX + "?['RequestType'])"
        TYPE_IS = lambda x: "equals(" + OWN + ", '" + x + "')"
        FIRST = UNDECIDED
        IS_ADMIN = "and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active'))"
        UID = "string(variables('varUid'))"
        LOGIN = "variables('varLogin')"
        PERSON = "first(body('Get_person" + sfx + "')?['value'])"
        HAS = lambda f: "contains(" + P + ", '" + f + "')"
        ROLE = "string(if(" + HAS('role') + ", " + P + "?['role'], coalesce(" + PERSON + "?['Role'], '')))"
        LEAVING = TYPE_IS('PersonLeft')
        POSTS = "and(not(" + LEAVING + "), if(" + HAS('canPostNotices') + ", equals(" + P + "?['canPostNotices'], true), not(equals(" + PERSON + "?['CanPostNotices'], false))))"
        ADMINW = "and(not(" + LEAVING + "), if(" + HAS('administrator') + ", equals(" + P + "?['administrator'], true), equals(" + PERSON + "?['IsAdministrator'], true)))"
        MGMTW = "and(not(" + LEAVING + "), contains(" + MANAGEMENT + ", " + ROLE + "))"
        # the areas wanted: given in the request; a leaver none; a reactivation keeps what the records say
        AREAS = ("if(" + LEAVING + ", createArray(), if(" + HAS('areas') + ", " + P + "?['areas'], body('Active_areas" + sfx + "')))")
        COMPS = "body('Get_comps" + sfx + "')?['value']"
        group = lambda name: "string(first(body('Groups" + sfx + "_" + name + "'))?['Id'])"
        GROUP_TITLES = {g['key']: g['title'] for g in SCHEMA['groups'] if not g.get('perArea')}
        ROLES = "createArray('Engineer', 'Technician', 'Team Leader', 'Group Head')"
        folder_url = "@{outputs('Ids')?['reqRoot']}/u@{" + UID + "}"
        folder_api = "_api/web/GetFolderByServerRelativePath(decodedurl='" + folder_url + "')/ListItemAllFields"
        role_id = lambda name: "string(first(body('Role_" + name + sfx + "'))?['Id'])"

        def verbose_post(uri, body):
            return {'type': 'OpenApiConnection',
                    'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'HttpRequest', 'apiId': SP_API},
                               'parameters': {'dataset': '@' + SITE, 'parameters/method': 'POST', 'parameters/uri': uri,
                                              'parameters/headers': {'Accept': 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=verbose'},
                                              'parameters/body': body},
                               'authentication': "@parameters('$authentication')"}}

        def in_group(name, gid, want):
            """Puts the person in (want true) or out of a group, then reads it back; nothing happens if it is already so."""
            users = "_api/web/sitegroups(@{" + gid + "})/users"
            check = users + "?$select=Id&$filter=Id eq @{" + UID + "}"
            has = "not(empty(body('" + name + "_now')?['value']))"
            act = (verbose_post(users, "@{concat('{\"__metadata\":{\"type\":\"SP.User\"},\"LoginName\":\"', " + LOGIN + ", '\"}')}") if want
                   else http('POST', users + "/removebyid(@{" + UID + "})"))
            return [(name + '_now', http('GET', check)),
                    (name + '_change', cond("@" + ("not(" + has + ")" if want else has), seq(
                        (name + '_do', act),
                        (name + '_back', http('GET', check)),
                        (name + '_kept', cond("@" + ("empty" if want else "not(empty") + "(body('" + name + "_back')?['value'])" + ("" if want else ")"),
                                              seq((name + '_stop', fail_here('A group membership did not change as asked. See ' + name + '_do.'))))),
                    )))]

        def grant(name, add, rid):
            """Gives (add) or takes away a permission level on the person's request folder, only if needed, then reads it back."""
            act = 'addroleassignment' if add else 'removeroleassignment'
            ra = folder_api + "/roleassignments?$filter=PrincipalId eq @{" + UID + "}&$expand=RoleDefinitionBindings&$select=PrincipalId,RoleDefinitionBindings/Id"
            levels = lambda read: {'type': 'Select', 'inputs': {'from': "@coalesce(first(body('" + read + "')?['value'])?['RoleDefinitionBindings'], createArray())",
                                                                  'select': "@int(item()?['Id'])"}}
            has = lambda sel: "contains(body('" + sel + "'), int(" + rid + "))"
            return [(name + '_now', http('GET', ra)),
                    (name + '_levels', levels(name + '_now')),
                    (name + '_change', cond("@" + ("not(" + has(name + '_levels') + ")" if add else has(name + '_levels')), seq(
                        (name, http('POST', folder_api + "/roleassignments/" + act + "(principalid=@{" + UID + "},roledefid=@{" + rid + "})")),
                        (name + '_back', http('GET', ra)),
                        (name + '_levels_back', levels(name + '_back')),
                        (name + '_kept', cond("@" + (("not(" + has(name + '_levels_back') + ")") if add else has(name + '_levels_back')),
                                              seq((name + '_stop', fail_here('The request folder permissions did not change as asked. See ' + name + '.'))))),
                    )))]

        area_row = lambda it: "first(body('Rows" + it + "'))"
        AREA_WANT = lambda it: "first(body('Want" + it + "'))"
        area_gid = lambda it: idstr("items('" + it + "')?['MembersGroupId']")
        mem_values, mem_call = create_in_folder('members', "@{outputs('Ids')?['membersRoot']}/@{items('Each_add" + sfx + "')?['CompetencyKey']}",
                                                'Member_values' + sfx, 'Member_body' + sfx)
        person_values, person_call = create_in_folder('people', "@{outputs('Ids')?['peopleRoot']}", 'Person_values' + sfx, 'Person_body' + sfx)
        fold_values, fold_call = create_in_folder('req', "@{outputs('Ids')?['reqRoot']}", 'Fold_values' + sfx, 'Fold_body' + sfx, leaf_expr="u@{" + UID + "}")
        ev_values, ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'P_event_values' + sfx, 'P_event_body' + sfx)
        ev_key = "concat(" + KEY + ", '|1')"
        expires_iso = lambda w: "string(coalesce(" + w + "?['expires'], ''))"
        NAME = "string(coalesce(" + PERSON + "?['Title'], variables('varName'), 'this person'))"
        before = {'role': "@" + PERSON + "?['Role']", 'canPostNotices': "@" + PERSON + "?['CanPostNotices']", 'administrator': "@" + PERSON + "?['IsAdministrator']",
                  'status': "@" + PERSON + "?['Status']", 'areas': "@body('Active_areas" + sfx + "')"}
        after_ = {'role': "@" + ROLE, 'canPostNotices': "@" + POSTS, 'administrator': "@" + ADMINW, 'status': "@if(" + LEAVING + ", 'Left', 'Active')",
                  'areas': "@" + AREAS}
        blocked = ("body('Blocked" + sfx + "')")
        verdict = chain(
            ("not(" + IS_ADMIN + ")", 'Only a Competency Hub administrator can do this.'),
            ("equals(" + UID + ", " + SENDER + ")", "You can't change your own access. Ask another administrator."),
            ("and(" + TYPE_IS('AddPerson') + ", equals(variables('varUid'), 0))", 'That email address was not found in Microsoft 365. Check the spelling.'),
            ("and(" + TYPE_IS('AddPerson') + ", not(empty(" + PERSON + ")), equals(string(" + PERSON + "?['Status']), 'Left'))",
             "@concat(" + NAME + ", ' is already in the Hub but marked as left. Use Reactivate instead.')"),
            ("and(" + TYPE_IS('AddPerson') + ", not(empty(" + PERSON + ")))", "@concat(" + NAME + ", ' is already in the Hub.')"),
            ("and(contains(createArray('UpdatePerson', 'PersonLeft'), " + OWN + "), or(empty(" + PERSON + "), not(equals(string(" + PERSON + "?['Status']), 'Active'))))",
             'This person is not active in the Hub.'),
            ("and(" + TYPE_IS('ReactivatePerson') + ", or(empty(" + PERSON + "), not(equals(string(" + PERSON + "?['Status']), 'Left'))))", 'This person is already active.'),
            ("not(contains(" + ROLES + ", " + ROLE + "))", 'Choose a role.'),
            ("not(empty(body('Bad_areas" + sfx + "')))", 'Choose areas from the list.'),
            ("not(empty(body('Bad_dates" + sfx + "')))", 'An end date for access cannot be in the past.'),
            ("and(" + LEAVING + ", not(empty(body('Get_owned" + sfx + "')?['value'])))",
             "@concat(" + NAME + ", ' still has ', string(length(body('Get_owned" + sfx + "')?['value'])), if(equals(length(body('Get_owned" + sfx + "')?['value']), 1), "
             "' open action', ' open actions'), '. Reassign them first.')"),
            ("not(empty(" + blocked + "))", "@concat('Not removed from ', join(" + blocked + ", ', '), ': open actions there are still theirs. Reassign them first.')"),
            ("and(equals(" + PERSON + "?['IsAdministrator'], true), not(" + ADMINW + "), lessOrEquals(length(body('Get_admins" + sfx + "')?['value']), 1))",
             'There must always be at least one active administrator.'))
        return seq(
            ('Get_groups' + sfx, http('GET', "_api/web/sitegroups?$select=Id,Title&$top=1000")),
            *[('Groups' + sfx + '_' + k, query("@body('Get_groups" + sfx + "')?['value']", "@equals(item()?['Title'], " + q(title) + ")")) for k, title in GROUP_TITLES.items()],
            ('Get_roles' + sfx, http('GET', "_api/web/roledefinitions?$select=Id,Name")),
            ('Role_Contribute' + sfx, query("@body('Get_roles" + sfx + "')?['value']", "@equals(item()?['Name'], 'Competency Hub Contribute')")),
            ('Role_Read' + sfx, query("@body('Get_roles" + sfx + "')?['value']", "@equals(item()?['Name'], 'Competency Hub Read')")),
            ('Get_comps' + sfx, http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey,Status,MembersGroupId&$top=500"))),
            # who: an added person is looked up in Microsoft 365 by email; anyone else is a People row
            ('Who' + sfx, cond("@" + TYPE_IS('AddPerson'), seq(
                ('Ensure' + sfx, http('POST', '_api/web/ensureuser', "@{concat('{\"logonName\":\"i:0#.f|membership|', toLower(trim(string(coalesce(" + P + "?['email'], '')))), '\"}')}")),
                # only "not found" means the address is wrong; any other failure is tried again later
                ('Ensure_failed' + sfx, after(cond("@and(not(equals(actions('Ensure" + sfx + "')?['status'], 'Succeeded')), not(equals(outputs('Ensure" + sfx + "')?['statusCode'], 404)), "
                                                   "not(contains(toLower(string(outputs('Ensure" + sfx + "'))), 'could not be found')))",
                                                   seq(('Ensure_stop' + sfx, fail_here('Microsoft 365 could not be asked about this person. See Ensure' + sfx + '.')))),
                                              {'Ensure' + sfx: TOLERANT})),
                ('Set_uid_new' + sfx, after(set_var('varUid', "@int(if(equals(actions('Ensure" + sfx + "')?['status'], 'Succeeded'), string(body('Ensure" + sfx + "')?['Id']), '0'))"),
                                            {'Ensure_failed' + sfx: OK})),
                ('Set_login_new' + sfx, set_var('varLogin', "@{if(equals(actions('Ensure" + sfx + "')?['status'], 'Succeeded'), body('Ensure" + sfx + "')?['LoginName'], '')}")),
                ('Set_name_new' + sfx, set_var('varName', "@{if(equals(actions('Ensure" + sfx + "')?['status'], 'Succeeded'), body('Ensure" + sfx + "')?['Title'], '')}")),
            ), seq(
                ('Set_uid' + sfx, set_var('varUid', "@int(" + idq(P + "?['personId']") + ")")),
            ))),
            ('Get_person' + sfx, http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,IsAdministrator,CanPostNotices,Person/Name&$expand=Person"
                                                          "&$filter=SiteUserId eq @{" + UID + "}"))),
            ('Login_known' + sfx, cond("@empty(" + LOGIN + ")", seq(
                ('Set_login' + sfx, set_var('varLogin', "@{coalesce(" + PERSON + "?['Person']?['Name'], '')}")),
            ))),
            ('Get_rows' + sfx, http('GET', L('members', "/items?$select=Id,CompetencyId,MembershipKey,Status,CanManageMeetings,AccessExpires&$filter=PersonId eq @{" + UID + "}&$top=500"))),
            ('Active_rows' + sfx, query("@body('Get_rows" + sfx + "')?['value']", "@equals(item()?['Status'], 'Active')")),
            ('Active_areas' + sfx, {'type': 'Select', 'inputs': {'from': "@body('Active_rows" + sfx + "')", 'select': {
                'key': "@first(split(string(item()?['MembershipKey']), '|'))", 'chair': "@equals(item()?['CanManageMeetings'], true)", 'expires': ''}}}),
            ('Get_owned' + sfx, http('GET', L('act', "/items?$select=Id,CompetencyId&$filter=AssignedToId eq @{" + UID + "} and IsOpen eq 1&$top=5000"))),
            ('Get_admins' + sfx, http('GET', L('people', "/items?$select=Id,SiteUserId&$filter=IsAdministrator eq 1 and Status eq 'Active'"))),
            ('Wanted_keys' + sfx, {'type': 'Select', 'inputs': {'from': "@" + AREAS, 'select': "@string(item()?['key'])"}}),
            ('Area_keys' + sfx, {'type': 'Select', 'inputs': {'from': "@" + COMPS, 'select': "@string(item()?['CompetencyKey'])"}}),
            ('Bad_areas' + sfx, query("@body('Wanted_keys" + sfx + "')", "@not(contains(body('Area_keys" + sfx + "'), item()))")),
            ('Bad_dates' + sfx, query("@" + AREAS, "@and(not(empty(string(coalesce(item()?['expires'], '')))), less(" + day_num(
                "if(empty(string(coalesce(item()?['expires'], ''))), '9999-12-31', string(item()?['expires']))") + ", " + day_num(TODAY) + "))")),
            # open actions in an area the person is leaving (management keeps any action, so a Team Leader is never blocked)
            ('Leaving_areas' + sfx, query("@" + COMPS, "@and(not(contains(body('Wanted_keys" + sfx + "'), string(item()?['CompetencyKey']))), not(" + MGMTW + "))")),
            ('Owned_areas' + sfx, {'type': 'Select', 'inputs': {'from': "@body('Get_owned" + sfx + "')?['value']", 'select': "@" + idstr("item()?['CompetencyId']")}}),
            ('Blocked_comps' + sfx, query("@body('Leaving_areas" + sfx + "')", "@contains(body('Owned_areas" + sfx + "'), " + idstr("item()?['Id']") + ")")),
            ('Blocked' + sfx, {'type': 'Select', 'inputs': {'from': "@if(" + LEAVING + ", createArray(), body('Blocked_comps" + sfx + "'))", 'select': "@string(item()?['Title'])"}}),
            ('Before' + sfx, compose(before)),
            ('Decide' + sfx, cond('@' + FIRST, seq(
                ('Verdict' + sfx, compose('@' + verdict)),
                ('Decided' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))",
                                       seq(*tx_update('planned' + sfx, {'State': 'Planned', 'StepsDone': 'DECIDED', 'PreviousValue': '@{string(outputs(\'Before' + sfx + '\'))}'})),
                                       reject(sfx, "outputs('Verdict" + sfx + "')"))),
            ))),
            # a new person: their People row and their own request folder, as Setup makes them
            ('New_person' + sfx, cond("@" + TYPE_IS('AddPerson'), seq(
                ('Need_row' + sfx, cond("@empty(" + PERSON + ")", seq(
                    ('Person_values' + sfx, form({
                        'Title': "@{variables('varName')}", 'Person': "@{concat('[{\"Key\":\"', " + LOGIN + ", '\"}]')}",
                        'Email': "@{toLower(trim(string(" + P + "?['email'])))}", 'SiteUserId': '@{' + UID + '}', 'Role': '@{' + ROLE + '}',
                        'IsAdministrator': '0', 'Status': 'Active', 'CanPostNotices': "@{if(" + POSTS + ", '1', '0')}", 'Revision': '1',
                        'CreatedRequestKey': "F|@{" + KEY + "}"})),
                    ('Person_body' + sfx, person_values),
                    ('Create_person' + sfx, person_call),
                    *created_ok('Create_person' + sfx, 'Person_made' + sfx, 'The People row could not be created. See Create_person' + sfx + '.'),
                ))),
                # SharePoint may answer "not found" for a folder that does not exist, rather than Exists false
                ('Find_fold' + sfx, http('GET', "_api/web/GetFolderByServerRelativePath(decodedurl='" + folder_url + "')?$select=Exists")),
                ('Need_fold' + sfx, after(cond("@not(and(equals(actions('Find_fold" + sfx + "')?['status'], 'Succeeded'), equals(body('Find_fold" + sfx + "')?['Exists'], true)))", seq(
                    ('Fold_values' + sfx, form({'Title': "u@{" + UID + "}"})),
                    ('Fold_body' + sfx, fold_values),
                    ('Create_fold' + sfx, fold_call),
                    *created_ok('Create_fold' + sfx, 'Fold_made' + sfx, 'The request folder could not be created. See Create_fold' + sfx + '.'),
                )), {'Find_fold' + sfx: TOLERANT})),
                ('Break_fold' + sfx, http('POST', folder_api + "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)")),
                *grant('Grant_fold' + sfx, True, role_id('Contribute')),
            ))),
            # narrow first: the groups this person is leaving, each read back, before the records say so
            ('Each_remove' + sfx, {'type': 'Foreach', 'foreach': "@" + COMPS, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                ('Rows_r' + sfx, query("@body('Active_rows" + sfx + "')", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr("items('Each_remove" + sfx + "')?['Id']") + ")")),
                ('Leave_area' + sfx, cond("@and(not(empty(body('Rows_r" + sfx + "'))), not(contains(body('Wanted_keys" + sfx + "'), string(items('Each_remove" + sfx + "')?['CompetencyKey']))))", seq(
                    *in_group('Out_area' + sfx, area_gid('Each_remove' + sfx), False),
                    ('Removed_row' + sfx, compose({'Status': 'Removed', 'DateRemoved': '@{utcNow()}', 'CanManageMeetings': False})),
                    ('Save_removed' + sfx, merge(L('members', "/items(@{first(body('Rows_r" + sfx + "'))?['Id']})"), 'Removed_row' + sfx)),
                ))),
            )}),
            *[step for k, want in (('Management', MGMTW), ('NoticePosters', POSTS), ('Administrators', ADMINW))
              for step in [('Leave_' + k + sfx, cond("@not(" + want + ")", seq(*in_group('Out_' + k + sfx, group(k), False))))]],
            ('Leave_all' + sfx, cond("@" + LEAVING, seq(
                *in_group('Out_AllUsers' + sfx, group('AllUsers'), False),
                # their request folder becomes read-only to them, if they ever had one
                ('Find_old_fold' + sfx, http('GET', "_api/web/GetFolderByServerRelativePath(decodedurl='" + folder_url + "')?$select=Exists")),
                ('Has_old_fold' + sfx, after(cond("@and(equals(actions('Find_old_fold" + sfx + "')?['status'], 'Succeeded'), equals(body('Find_old_fold" + sfx + "')?['Exists'], true))", seq(
                    *grant('Fold_read' + sfx, True, role_id('Read')),
                    *grant('Fold_no_contribute' + sfx, False, role_id('Contribute')),
                )), {'Find_old_fold' + sfx: TOLERANT})),
            ))),
            # the record
            ('Get_person_now' + sfx, http('GET', L('people', "/items?$select=Id&$filter=SiteUserId eq @{" + UID + "}"))),
            # a leaver keeps the administrator's notice-posting decision for a later reactivation; only the group goes
            ('Person_now' + sfx, compose({'Role': '@{' + ROLE + '}', 'CanPostNotices': "@if(" + LEAVING + ", not(equals(" + PERSON + "?['CanPostNotices'], false)), " + POSTS + ")",
                                          'IsAdministrator': '@' + ADMINW,
                                          'Status': "@{if(" + LEAVING + ", 'Left', 'Active')}", 'DateLeft': "@if(" + LEAVING + ", " + uk_midnight(TODAY) + ", null)"})),
            ('Save_person' + sfx, merge(L('people', "/items(@{first(body('Get_person_now" + sfx + "')?['value'])?['Id']})"), 'Person_now' + sfx)),
            # then the grants: the area rows first, then the groups, each read back
            ('Each_add' + sfx, {'type': 'Foreach', 'foreach': "@" + COMPS, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                ('Want_a' + sfx, query("@" + AREAS, "@equals(string(item()?['key']), string(items('Each_add" + sfx + "')?['CompetencyKey']))")),
                ('Join_area' + sfx, cond("@not(empty(body('Want_a" + sfx + "')))", seq(
                    ('Rows_a' + sfx, query("@body('Get_rows" + sfx + "')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr("items('Each_add" + sfx + "')?['Id']") + ")")),
                    ('Has_row' + sfx, cond("@empty(body('Rows_a" + sfx + "'))", seq(
                        ('Member_values' + sfx, form({
                            'Title': "@{concat(" + NAME + ", ' – ', items('Each_add" + sfx + "')?['CompetencyKey'])}",
                            'Competency': "@{items('Each_add" + sfx + "')?['Id']}", 'Person': "@{concat('[{\"Key\":\"', " + LOGIN + ", '\"}]')}",
                            'MembershipKey': "@{concat(items('Each_add" + sfx + "')?['CompetencyKey'], '|', " + UID + ")}",
                            'CanManageMeetings': "@{if(equals(first(body('Want_a" + sfx + "'))?['chair'], true), '1', '0')}",
                            'AccessExpires': "@{if(empty(" + expires_iso("first(body('Want_a" + sfx + "'))") + "), '', " + uk_form_date(
                                "if(empty(" + expires_iso("first(body('Want_a" + sfx + "'))") + "), '2000-01-01', " + expires_iso("first(body('Want_a" + sfx + "'))") + ")") + ")}",
                            'Status': 'Active', 'DateAdded': "@{convertFromUtc(utcNow(), 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}", 'Revision': '1',
                            'CreatedRequestKey': "@{concat('F|', " + KEY + ", '|', items('Each_add" + sfx + "')?['CompetencyKey'])}"})),
                        ('Member_body' + sfx, mem_values),
                        ('Create_member' + sfx, mem_call),
                        *created_ok('Create_member' + sfx, 'Member_made' + sfx, 'The membership could not be recorded. See Create_member' + sfx + '.'),
                    ), seq(
                        ('Member_now' + sfx, compose({'Status': 'Active', 'DateRemoved': None,
                                                       'CanManageMeetings': "@equals(first(body('Want_a" + sfx + "'))?['chair'], true)",
                                                       'AccessExpires': "@if(empty(" + expires_iso("first(body('Want_a" + sfx + "'))") + "), null, " + uk_midnight(
                                                           "if(empty(" + expires_iso("first(body('Want_a" + sfx + "'))") + "), '2000-01-01', " + expires_iso("first(body('Want_a" + sfx + "'))") + ")") + ")"})),
                        ('Save_member' + sfx, merge(L('members', "/items(@{first(body('Rows_a" + sfx + "'))?['Id']})"), 'Member_now' + sfx)),
                    ))),
                    *in_group('In_area' + sfx, area_gid('Each_add' + sfx), True),
                ))),
            )}),
            ('Join_all' + sfx, cond("@not(" + LEAVING + ")", seq(
                *in_group('In_AllUsers' + sfx, group('AllUsers'), True),
                ('Back_to_contribute' + sfx, cond("@" + TYPE_IS('ReactivatePerson'), seq(
                    *grant('Fold_contribute' + sfx, True, role_id('Contribute')),
                    *grant('Fold_no_read' + sfx, False, role_id('Read')),
                ))),
            ))),
            *[step for k, want in (('Management', MGMTW), ('NoticePosters', POSTS), ('Administrators', ADMINW))
              for step in [('Join_' + k + sfx, cond("@" + want, seq(*in_group('In_' + k + sfx, group(k), True))))]],
            ('Verified' + sfx, compose({'AccessVerifiedOn': '@{utcNow()}'})),
            ('Save_verified' + sfx, merge(L('people', "/items(@{first(body('Get_person_now" + sfx + "')?['value'])?['Id']})"), 'Verified' + sfx)),
            ('After' + sfx, compose(after_)),
            # the audit: who changed whose access, from what to what (spec ADM-6)
            ('Find_p_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('Need_p_event' + sfx, cond("@empty(body('Find_p_event" + sfx + "')?['value'])", seq(
                ('P_event_values' + sfx, form({
                    'Title': "@{take(concat(if(" + TYPE_IS('AddPerson') + ", 'Added ', if(" + LEAVING + ", 'Marked as left: ', if(" + TYPE_IS('ReactivatePerson') + ", 'Reactivated ', "
                             "'Access changed for '))), " + NAME + "), 255)}",
                    'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}', 'RecordType': 'Person',
                    'RecordId': "@{first(body('Get_person_now" + sfx + "')?['value'])?['Id']}", 'EventType': "@{if(" + TYPE_IS('AddPerson') + ", 'Person Added', if(" + TYPE_IS('PersonLeft') + ", 'Person Left', if(" + TYPE_IS('ReactivatePerson') + ", 'Person Reactivated', 'Access Changed')))}", 'RequestType': '@{' + OWN + '}',
                    'PreviousValue': "@{coalesce(" + TX + "?['PreviousValue'], string(outputs('Before" + sfx + "')))}", 'NewValue': "@{string(outputs('After" + sfx + "'))}",
                    'OwnerId': '@{' + UID + '}'})),
                ('P_event_body' + sfx, ev_values),
                ('P_event' + sfx, ev_call),
                *created_ok('P_event' + sfx, 'P_event_made' + sfx, 'The History event could not be created. See P_event' + sfx + '.'),
                ('Get_p_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
                ('P_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
                ('Save_p_event' + sfx, merge(L('hist', "/items(@{first(body('Get_p_event" + sfx + "')?['value'])?['Id']})"), 'P_event_details' + sfx)),
            ))),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "concat(if(" + TYPE_IS('AddPerson') + ", 'Added ', if(" + LEAVING + ", 'Marked as left: ', if(" + TYPE_IS('ReactivatePerson') + ", "
                            "'Reactivated ', 'Saved the changes for '))), " + NAME + ", '.')", "int(" + UID + ")"),
        )

    # ---------------------------------------------------------------- administrators: the settings editor (spec ADM-4)
    def settings_switch():
        """Four safe settings, each checked on the server: whole numbers in range, or working hours as HH:MM|HH:MM|N."""
        sfx = '_G'
        NAME = "string(coalesce(" + P + "?['name'], ''))"
        VALUE = "outputs('New_value" + sfx + "')"
        IS_ADMIN = "and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active'))"
        FIRST = UNDECIDED
        def no_digits(expr):
            for d in '0123456789':
                expr = "replace(" + expr + ", '" + d + "', '')"
            return expr
        whole = lambda expr: "and(greater(length(" + expr + "), 0), lessOrEquals(length(" + expr + "), 2), empty(" + no_digits(expr) + "))"
        NUM = "int(if(" + whole(VALUE) + ", " + VALUE + ", '0'))"
        PARTS = "split(" + VALUE + ", '|')"
        # every argument is evaluated, so nothing here may fail on a badly formed value: parts are taken with skip/first,
        # and text is padded before substring. Each part is worked out in its own step to keep the checks short.
        part_expr = lambda i: "string(coalesce(first(skip(" + PARTS + ", " + str(i) + ")), ''))"
        part = lambda i: "outputs('" + ('Hours_start', 'Hours_end', 'Hours_gap')[i] + sfx + "')"
        pad = lambda e: "concat(" + e + ", '00000')"
        hhmm_ok = lambda e: "and(equals(length(" + e + "), 5), equals(" + no_digits(e) + ", ':'), equals(substring(" + pad(e) + ", 2, 1), ':'))"
        hhmm = lambda e: ("add(mul(int(if(" + hhmm_ok(e) + ", substring(" + pad(e) + ", 0, 2), '0')), 60), "
                          "int(if(" + hhmm_ok(e) + ", substring(" + pad(e) + ", 3, 2), '0')))")
        HOURS_CHECK = ("and(equals(length(" + PARTS + "), 3), " + hhmm_ok(part(0)) + ", " + hhmm_ok(part(1)) + ", " + whole(part(2)) + ", "
                    "less(" + hhmm(part(0)) + ", " + hhmm(part(1)) + "), lessOrEquals(" + hhmm(part(1)) + ", 1439), "
                    "greaterOrEquals(int(if(" + whole(part(2)) + ", " + part(2) + ", '0')), 15))")
        ROW = "first(body('Setting_row" + sfx + "'))"
        ev_key = "concat(" + KEY + ", '|1')"
        ev_values, ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'S_event_values' + sfx, 'S_event_body' + sfx)
        verdict = chain(
            ("not(" + IS_ADMIN + ")", 'Only a Competency Hub administrator can do this.'),
            ("not(contains(createArray('OverdueReminderIntervalDays', 'ReminderDaysBefore', 'MaxDeadlineYears', 'MonitorHours'), " + NAME + "))", 'Choose a setting.'),
            ("empty(" + ROW + ")", 'That setting is missing. Run Setup again.'),
            ("and(contains(createArray('OverdueReminderIntervalDays', 'ReminderDaysBefore'), " + NAME + "), or(not(" + whole(VALUE) + "), less(" + NUM + ", 1), greater(" + NUM + ", 30)))",
             'Enter a whole number of days from 1 to 30.'),
            ("and(equals(" + NAME + ", 'MaxDeadlineYears'), or(not(" + whole(VALUE) + "), less(" + NUM + ", 1), greater(" + NUM + ", 5)))", 'Enter a whole number of years from 1 to 5.'),
            ("and(equals(" + NAME + ", 'MonitorHours'), not(outputs('Hours_ok" + sfx + "')))",
             'Give the start and end of working hours (start before end), and at least 15 minutes between checks outside them.'))
        return seq(
            ('Get_setting' + sfx, http('GET', L('settings', "/items?$select=Id,Title,Value&$top=500"))),
            ('Setting_row' + sfx, query("@body('Get_setting" + sfx + "')?['value']", "@equals(item()?['Title'], " + NAME + ")")),
            ('New_value' + sfx, compose("@trim(string(coalesce(" + P + "?['value'], '')))")),
            ('Hours_start' + sfx, compose('@' + part_expr(0))),
            ('Hours_end' + sfx, compose('@' + part_expr(1))),
            ('Hours_gap' + sfx, compose('@' + part_expr(2))),
            ('Hours_ok' + sfx, compose('@' + HOURS_CHECK)),
            ('Decide' + sfx, cond('@' + FIRST, seq(
                ('Verdict' + sfx, compose('@' + verdict)),
                ('Decided' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))",
                                       seq(*tx_update('planned' + sfx, {'State': 'Planned', 'StepsDone': 'DECIDED', 'PreviousValue': "@{string(coalesce(" + ROW + "?['Value'], ''))}"})),
                                       reject(sfx, "outputs('Verdict" + sfx + "')"))),
            ))),
            # the value before the change: kept on the transaction, or read now on a first run
            ('Previous' + sfx, compose("@coalesce(" + TX + "?['PreviousValue'], " + ROW + "?['Value'], '')")),
            ('Setting_value' + sfx, compose({'Value': '@{' + VALUE + '}'})),
            ('Save_setting' + sfx, merge(L('settings', "/items(@{" + ROW + "?['Id']})"), 'Setting_value' + sfx)),
            ('Find_s_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('Need_s_event' + sfx, cond("@empty(body('Find_s_event" + sfx + "')?['value'])", seq(
                ('S_event_values' + sfx, form({'Title': "@{concat('Setting changed: ', if(equals(" + NAME + ", 'OverdueReminderIntervalDays'), 'days between late reminders', if(equals(" + NAME + ", 'ReminderDaysBefore'), "
                                                       "'days before the deadline for the first reminder', if(equals(" + NAME + ", 'MaxDeadlineYears'), 'furthest deadline in years', 'queue monitor hours'))))}", 'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}',
                                               'RecordType': 'Setting', 'RecordId': "@{" + ROW + "?['Id']}", 'EventType': 'Setting Changed', 'RequestType': 'UpdateSetting',
                                               'PreviousValue': "@{outputs('Previous" + sfx + "')}", 'NewValue': '@{' + VALUE + '}'})),
                ('S_event_body' + sfx, ev_values),
                ('S_event' + sfx, ev_call),
                *created_ok('S_event' + sfx, 'S_event_made' + sfx, 'The History event could not be created. See S_event' + sfx + '.'),
                ('Get_s_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
                ('S_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
                ('Save_s_event' + sfx, merge(L('hist', "/items(@{first(body('Get_s_event" + sfx + "')?['value'])?['Id']})"), 'S_event_details' + sfx)),
            ))),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "'Setting saved.'"),
        )


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
    tx_find = L('hist', "/items?$select=Id,RequestKey,RequestType,RecordId,ExpectedRevision,Payload,State,FirstClaimedAt,PreviousValue,StepsDone"
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
        ('Get_requester', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,IsAdministrator,Email,Person/Name,Person/EMail&$expand=Person&$filter=SiteUserId eq @{" + esc(SENDER) + "}"))),
        ('Requester', compose("@first(body('Get_requester')?['value'])")),
        # the requester comes from the folder; a request anywhere else is refused without a transaction (plan F.1.2 step 1)
        ('Trusted', cond(TRUSTED, None, seq(
            *finish_request('_untrusted', 'Rejected', "'This request was not sent from your own request folder.'"),
            ('Done_untrusted', terminate('Succeeded'))))),
        ('Get_my_memberships', http('GET', L('members', "/items?$select=Id,CompetencyId,CanManageMeetings&$filter=PersonId eq @{" + SENDER + "} and Status eq 'Active'"))),
        # the private copy: everything after this works from the transaction row, never the editable request item.
        # every request carries its own new reference (a GUID from the app). One that is empty, too long or contains
        # "|" (which History keeps for its own event keys) could never be recorded, so it is refused at once.
        ('Key_ok', cond("@and(greater(length(string(" + R + "?['RequestKey'])), 0), lessOrEquals(length(string(" + R + "?['RequestKey'])), 40), "
                        "not(contains(string(" + R + "?['RequestKey']), '|')))", None, seq(
            *finish_request('_K0', 'Rejected', "'This request could not be read. Send it again from the Competency Hub.'"),
            ('Done_K0', terminate('Succeeded')),
        ))),
        # The claim time is kept to the minute, so a resumed run computes exactly the same event time.
        ('Claim_now', compose("@formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:00Z')")),
        ('Find_tx', http('GET', tx_find)),
        ('Need_tx', cond("@empty(body('Find_tx')?['value'])", seq(
            ('Tx_values', form({'Title': "@{concat('Request ', " + idstr(TB + "?['ID']") + ", ': ', string(" + R + "?['RequestType']))}",
                                'RowKind': 'Transaction', 'RequestKey': "@{" + R + "?['RequestKey']}", 'RequestItemId': "@{" + TB + "?['ID']}",
                                'RequestType': "@{" + R + "?['RequestType']}", 'RecordType': 'Action' if domain == 'actions' else 'System',
                                'RecordId': "@{" + idstr(R + "?['TargetId']") + "}", 'ExpectedRevision': "@{" + idstr(R + "?['ExpectedRevision']") + "}",
                                'Payload': "@{" + R + "?['Payload']}", 'State': 'Received', 'Attempts': '1',
                                # who asked, for the administrators' page (people cannot read each other's request folders)
                                'Actor': "@{concat('[{\"Key\":\"', " + ME + "?['Person']?['Name'], '\"}]')}",
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
                                    'State': 'Received', 'FirstClaimedAt': "@{outputs('Claim_now')}", 'PreviousValue': None, 'StepsDone': ''})),
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
        # a finished transaction (or one handed to the administrators) is only mirrored on the request
        ('Already_final', cond("@contains(createArray('Applied', 'Void', 'Rolled Back', 'Cancelled', 'Reverted', 'Needs attention'), string(" + TX + "?['State']))", seq(
            ('Final_status', compose("@if(equals(string(" + TX + "?['State']), 'Applied'), 'Completed', if(contains(createArray('Void', 'Rolled Back'), "
                                     "string(" + TX + "?['State'])), 'Rejected', string(" + TX + "?['State'])))")),
            ('Final_body', compose({'Status': "@{outputs('Final_status')}"})),
            ('Mirror_final', merge(req_item, 'Final_body')),
            ('Done_already', terminate('Succeeded'))))),
        ('Payload', compose("@json(string(" + TX + "?['Payload']))")),
        ('Payload_read', after(cond("@equals(actions('Payload')?['status'], 'Succeeded')", None, reject('_payload', "'The request could not be read.'")),
                               {'Payload': TOLERANT})),
        # a kind of change this flow does not know is refused before anything is read or changed
        ('By_type', cond("@contains(createArray(" + ", ".join(q(x) for x in ACTION_TYPES) + "), string(" + TX + "?['RequestType']))",
                         seq(('Action_type', switch("@string(" + TX + "?['RequestType'])",
                             {'RaiseAction': raise_case},
                             change_all({'ExtendDeadline': extend_case, 'MarkComplete': complete_case, 'ChangeStatus': status_case,
                                         'ReassignAction': reassign_case, 'CloseAction': close_case, 'ReopenAction': reopen_case,
                                         'EditActionDetails': edit_case})))),
                         reject('_K', "'This kind of change is not recognised.'"))
         if domain == 'actions' else
         cond("@contains(createArray('RetryTransaction', 'CancelTransaction', 'RevertTransaction'), string(" + TX + "?['RequestType']))",
              admin_switch(),
              seq(('Settings_or_people', cond("@equals(string(" + TX + "?['RequestType']), 'UpdateSetting')", settings_switch(), people_switch()))))),
    )
    fail_body = {'Status': 'Failed', 'ResultMessage': 'Not recorded yet – retrying automatically.'}
    catch = after(scope(seq(
        ('Failed_body', compose(fail_body)),
        ('Mark_failed', merge(req_item, 'Failed_body')),
        ('Has_tx', after(cond("@greater(variables('varTxId'), 0)", seq(
            ('Tx_failed_body', compose({'State': 'Failed', 'LastError': "@{concat('Run ', workflow()?['run']?['name'], ' failed. See its run history.')}",
                                        'NextAttemptAfter': '@{addMinutes(utcNow(), 10)}'})),
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
                  ('Initialize_varAct', init_var('varAct', 'object', {})),
                  ('Initialize_varUid', init_var('varUid', 'integer', 0)),
                  ('Initialize_varLogin', init_var('varLogin', 'string', '')),
                  ('Initialize_varName', init_var('varName', 'string', '')),
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
    others = [t for d, types in DOMAIN_TYPES.items() if d != domain for t in types]
    mine = ("@not(contains(createArray(" + ", ".join(q(x) for x in others) + "), string(triggerBody()?['RequestType'])))" if domain == 'actions'
            else "@contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES[domain]) + "), string(triggerBody()?['RequestType']))")
    triggers = {'When_a_request_is_submitted': {
        'type': 'OpenApiConnection',
        'recurrence': {'frequency': 'Minute', 'interval': 2},
        'splitOn': "@triggerOutputs()?['body/value']",
        'conditions': [{'expression': "@equals(triggerBody()?['Status']?['Value'], 'Submitted')"},
                       {'expression': "@not(equals(triggerBody()?['{IsFolder}'], true))"},
                       {'expression': mine}],
        'runtimeConfiguration': {'secureData': {'properties': ['inputs', 'outputs']}, 'concurrency': {'runs': 1}},
        'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'GetOnUpdatedItems', 'apiId': SP_API},
                   'parameters': {'dataset': '@' + SITE, 'table': REQUEST_LIST},
                   'authentication': "@parameters('$authentication')"}}}
    return definition(triggers, actions)

# --------------------------------------------------------------------------------------------- daily tasks
def flow_daily_tasks():
    """Plan F.4.1: every morning at 06:00 UK time it queues the 7-day, due-today and late
    reminders that have no row yet (so a missed run catches up and nothing is sent twice), tries again the emails
    that failed or whose outcome was unclear, and records LastDailyRun."""
    TODAY = "outputs('Today')"
    PEOPLE = "body('Get_people')?['value']"
    C = "items('Each_candidate')"
    X = "items('Each_expired')"
    group_users = "_api/web/sitegroups(@{" + idq("first(body('Area_x'))?['MembersGroupId']") + "})/users"
    ended_values, ended_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'Ended_event_values', 'Ended_event_body')
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
        ('Get_people', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Status,IsAdministrator,Email,Person/Name,Person/EMail&$expand=Person&$top=5000"))),
        ('Admins', query('@' + PEOPLE, "@and(equals(item()?['IsAdministrator'], true), equals(item()?['Status'], 'Active'))")),
        # the queue monitor reports every 15 minutes in working hours and at least hourly outside them: two hours of
        # silence means it has stopped, and failed changes are no longer being retried (spec REL-1)
        *health_of('Get_settings'),
        alert_if('Monitor_stale', "less(ticks(if(empty(string(coalesce(outputs('Health')?['checkedAt'], ''))), '2000-01-01T00:00:00Z', string(outputs('Health')?['checkedAt']))), "
                 "ticks(addHours(utcNow(), -2)))",
                 "'monitor'", "'The queue monitor is not running'",
                 "concat('The queue monitor last reported on ', " + uk_when("outputs('Health')?['checkedAt']") + ", '. Changes that fail are not being retried automatically. "
                 "In Power Automate, check that ESG Competency Hub | 3 Queue monitor is turned on and look at its run history.')"),
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
        *retry_emails(),
        # after the reminders, so a problem with one membership can never stop them
        ('Temporary_access', scope(seq(
            # temporary access ends by itself (spec ADM-2): the day after its end date, unless the person still has
        # open actions in that area – then the administrators are told instead, once a day
            ('Get_comps', http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey,MembersGroupId&$top=500"))),
        ('Get_temporary', http('GET', L('members', "/items?$select=Id,CompetencyId,PersonId,MembershipKey,AccessExpires&$filter=Status eq 'Active'&$top=5000"))),
        ('Expired', query("@body('Get_temporary')?['value']", "@and(not(empty(string(coalesce(item()?['AccessExpires'], '')))), "
                          "less(" + day_num("convertFromUtc(string(coalesce(item()?['AccessExpires'], '2999-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyy-MM-dd')") + ", "
                          + day_num(TODAY) + "))")),
        ('Each_expired', {'type': 'Foreach', 'foreach': "@body('Expired')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            ('Area_x', query("@body('Get_comps')?['value']", "@equals(" + idstr("item()?['Id']") + ", " + idstr(X + "?['CompetencyId']") + ")")),
            ('Who_x', query('@' + PEOPLE, "@equals(" + idstr("item()?['SiteUserId']") + ", " + idstr(X + "?['PersonId']") + ")")),
            ('Owned_x', http('GET', L('act', "/items?$select=Id&$filter=AssignedToId eq @{" + idq(X + "?['PersonId']") + "} and IsOpen eq 1 and CompetencyId eq @{"
                                              + idq(X + "?['CompetencyId']") + "}"))),
            ('Can_remove_x', cond("@empty(body('Owned_x')?['value'])", seq(
                # out of the area group (only if still in it), then read back; a problem here is reported, never left to stop the run
                ('Member_x', http('GET', group_users + "?$select=Id&$filter=Id eq @{" + idq(X + "?['PersonId']") + "}")),
                ('Out_x_needed', after(cond("@and(equals(actions('Member_x')?['status'], 'Succeeded'), not(empty(body('Member_x')?['value'])))", seq(
                    ('Out_x', http('POST', group_users + "/removebyid(@{" + idq(X + "?['PersonId']") + "})")),
                )), {'Member_x': TOLERANT})),
                ('Back_x', after(http('GET', group_users + "?$select=Id&$filter=Id eq @{" + idq(X + "?['PersonId']") + "}"), {'Out_x_needed': TOLERANT})),
                ('Gone_x', after(cond("@and(equals(actions('Back_x')?['status'], 'Succeeded'), empty(body('Back_x')?['value']))", seq(
                ('Ended_x', compose({'Status': 'Removed', 'DateRemoved': '@{utcNow()}', 'CanManageMeetings': False})),
                ('Save_ended_x', merge(L('members', "/items(@{" + X + "?['Id']})"), 'Ended_x')),
                ('Ended_event_values', form({'Title': "@{take(concat('Temporary access ended: ', string(first(body('Who_x'))?['Title']), ' – ', string(first(body('Area_x'))?['Title'])), 255)}",
                                             'RowKind': 'Event', 'RequestKey': "@{concat('SYS|Expire|', string(" + X + "?['Id']), '|', " + TODAY + ")}", 'RecordType': 'Membership',
                                             'RecordId': "@{" + X + "?['Id']}", 'EventType': 'Temporary Access Ended', 'OwnerId': '@{' + idq(X + "?['PersonId']") + '}'})),
                ('Ended_event_body', ended_values),
                ('Ended_event', after(ended_call, {'Ended_event_body': OK})),
                # a run that stops after this is safe: the row is already Removed, so it is not found again
                ('Ended_event_done', after(compose('done'), {'Ended_event': TOLERANT})),
                ), seq(
                    alert_if('Expiry_failed', 'true', "concat('expiry-failed|', string(" + X + "?['Id']))",
                             "concat('Temporary access could not be ended: ', string(first(body('Who_x'))?['Title']), ' in ', string(first(body('Area_x'))?['Title']))",
                             "concat('The end date for ', string(first(body('Who_x'))?['Title']), ' in ', string(first(body('Area_x'))?['Title']), "
                             "' has passed, but they could not be taken out of the area group. Check the group in Site settings, then untick the area in Administration.')"),
                )), {'Back_x': TOLERANT})),
            ), seq(
                alert_if('Expiry_alert', 'true', "concat('expiry|', string(" + X + "?['Id']))",
                         "concat('Temporary access has ended, but open actions remain: ', string(first(body('Who_x'))?['Title']), ' in ', string(first(body('Area_x'))?['Title']))",
                         "concat(string(first(body('Who_x'))?['Title']), ' still owns ', string(length(body('Owned_x')?['value'])), if(equals(length(body('Owned_x')?['value']), 1), ' open action in ', ' open actions in '), string(first(body('Area_x'))?['Title']), "
                         "', so their access there was not removed. Reassign the actions, then untick the area in Administration.')"),
            ))),
        )}),
        ))),
        *[(n, after(a, {'Temporary_access': TOLERANT})) if i == 0 else (n, a) for i, (n, a) in enumerate(outbox_create('_A', "variables('varAlerts')"))],
        ('Ran_body', compose({'Value': '@{utcNow()}'})),
        ('Record_run', cond("@empty(body('Run_row'))", None, seq(
            ('Save_run', merge(L('settings', "/items(@{first(body('Run_row'))?['Id']})"), 'Ran_body')),
        ))),
    )
    actions = seq(('Initialize_varOutbox', init_var('varOutbox', 'array', [])),
                  ('Initialize_varNotices', init_var('varNotices', 'array', [])),
                  ('Initialize_varAlerts', init_var('varAlerts', 'array', [])))
    actions['Try'] = after(scope(try_actions), {'Initialize_varAlerts': OK})
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


# --------------------------------------------------------------------------------------------- queue monitor
def flow_queue_monitor():
    """Spec REL-1: every 15 minutes in working hours, and once an hour outside them, it finds requests that were
    never picked up, runs that stopped part-way and runs that failed, and puts each back in the queue so the request
    flow resumes it from its stored copy (roll-forward). After 3 attempts the change goes to the administrators as
    Needs attention – saying honestly whether part of it was made. It also retries emails, checks that Daily tasks
    still runs, and records the health of processing in Settings (QueueHealth) for the app's limited mode."""
    TODAY = "outputs('Today')"
    NOW = "outputs('Now_uk')"
    HOURS = "split(string(coalesce(first(body('Hours_row'))?['Value'], '07:00|19:45|60')), '|')"
    minutes_of = lambda hhmm: "add(mul(int(substring(" + hhmm + ", 0, 2)), 60), int(substring(" + hhmm + ", 3, 2)))"
    S = "items('Each_stuck')"
    TXM = "first(body('Find_tx_m')?['value'])"
    ATTEMPTS = "int(if(empty(" + TXM + "), '0', " + idq(TXM + "?['Attempts']") + "))"
    FINAL_M = "and(not(empty(" + TXM + ")), contains(" + FINAL_TX + ", string(" + TXM + "?['State'])))"
    PART = "variables('varPart')"
    req_item = L('req', "/items(@{" + S + "?['Id']})")
    tx_item = L('hist', "/items(@{" + idq(TXM + "?['Id']") + "})")
    older = lambda field, minutes: "less(ticks(string(coalesce(item()?['" + field + "'], '2000-01-01T00:00:00Z'))), ticks(addMinutes(utcNow(), -" + str(minutes) + ")))"
    reqs = lambda st: ('Get_req_' + st.lower(), http('GET', L('req', "/items?$select=Id,Title,RequestKey,RequestType,TargetId,Status,Attempts,Created,Modified,AuthorId"
                                                         "&$filter=Status eq '" + st + "'&$top=5000"), meta=True))
    nothing = 'Not recorded – an administrator has been told. Nothing was changed.'
    partly = 'Not fully recorded – an administrator has been told. The record is locked until it is resolved.'
    partly_admin = 'Not fully recorded – an administrator has been told and will finish it.'
    ADMIN_TYPE = "contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['admin']) + "), string(" + S + "?['RequestType']))"
    ASKER = "string(coalesce(first(body('Asker'))?['Title'], 'someone'))"
    try_actions = seq(
        *site_and_ids(),
        ('Today', compose("@convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-dd')")),
        ('Now_uk', compose("@convertFromUtc(utcNow(), 'GMT Standard Time')")),
        ('Get_settings', http('GET', L('settings', "/items?$select=Id,Title,Value&$top=500"))),
        ('Hours_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'MonitorHours')")),
        ('Minute', compose("@add(mul(int(formatDateTime(" + NOW + ", 'HH')), 60), int(formatDateTime(" + NOW + ", 'mm')))")),
        ('Working', compose("@and(greaterOrEquals(dayOfWeek(" + NOW + "), 1), lessOrEquals(dayOfWeek(" + NOW + "), 5), "
                            "greaterOrEquals(outputs('Minute'), " + minutes_of(HOURS + "[0]") + "), lessOrEquals(outputs('Minute'), " + minutes_of(HOURS + "[1]") + "))")),
        # outside working hours only the first run in each interval (normally hourly) does the work
        ('Due', cond("@or(outputs('Working'), less(mod(outputs('Minute'), max(15, int(" + HOURS + "[2]))), 15))", None,
                     seq(('Not_now', terminate('Succeeded'))))),
        ('Get_people', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Status,IsAdministrator,Email,Person/Name,Person/EMail&$expand=Person&$top=5000"))),
        ('Admins', query("@body('Get_people')?['value']", "@and(equals(item()?['IsAdministrator'], true), equals(item()?['Status'], 'Active'))")),
        reqs('Submitted'), reqs('Processing'), reqs('Failed'),
        # never picked up or put back 10 minutes ago; a run silent for 15 minutes; a failure waiting 10 minutes
        ('Stuck', query("@union(body('Get_req_submitted')?['value'], body('Get_req_processing')?['value'], body('Get_req_failed')?['value'])",
                        "@or(and(equals(item()?['Status'], 'Submitted'), " + older('Modified', 10) + "), "
                        "and(equals(item()?['Status'], 'Processing'), " + older('Modified', 15) + "), "
                        "and(equals(item()?['Status'], 'Failed'), " + older('Modified', 10) + "))")),
        ('Each_stuck', {'type': 'Foreach', 'foreach': "@body('Stuck')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            ('Asker', query("@body('Get_people')?['value']", "@equals(" + idstr("item()?['SiteUserId']") + ", " + idstr(S + "?['AuthorId']") + ")")),
            ('Find_tx_m', http('GET', L('hist', "/items?$select=Id,Title,RequestKey,RequestType,RecordId,State,Attempts,LastError,StepsDone"
                                               "&$filter=RequestItemId eq @{" + S + "?['Id']} and RowKind eq 'Transaction'"))),
            # a request the monitor already put back and that is still not picked up: processing has stopped
            # a request the monitor already put back and that is still not picked up: that flow has stopped
            ('Not_picked_up', cond("@and(equals(" + S + "?['Status'], 'Submitted'), empty(" + TXM + "), greater(int(" + idq(S + "?['Attempts']") + "), 0))", seq(
                ('Which_flow_down', cond("@" + ADMIN_TYPE, seq(('Mark_admin_down', set_var('varAdminDown', True))), seq(('Mark_down', set_var('varDown', True))))),
            ))),
            # three attempts, or a request that never got as far as its transaction after three tries
            ('Give_up', cond("@or(and(not(empty(" + TXM + ")), not(" + FINAL_M + "), greaterOrEquals(" + ATTEMPTS + ", 3)), "
                             "and(empty(" + TXM + "), not(equals(" + S + "?['Status'], 'Submitted')), greaterOrEquals(int(" + idq(S + "?['Attempts']") + "), 3)))", seq(
                # part-made: an administration change once it was decided (it may have changed groups already);
                # an action change when the action carries it: its lock (or, for a raise, the action exists)
                ('Part_unknown', set_var('varPart', False)),
                ('Find_part', cond("@empty(" + TXM + ")", None, seq(('Part_by_type', cond("@" + ADMIN_TYPE, seq(
                    ('Set_part_admin', set_var('varPart', "@contains(string(coalesce(" + TXM + "?['StepsDone'], '')), 'DECIDED')")),
                ), seq(('Find_action_part', cond("@equals(string(" + TXM + "?['RequestType']), 'RaiseAction')", seq(
                    ('Get_raised_m', http('GET', L('act', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(TXM + "?['RequestKey']") + "}'"))),
                    ('Set_part_raised', set_var('varPart', "@not(empty(body('Get_raised_m')?['value']))")),
                ), seq(
                    ('Get_changed_m', http('GET', L('act', "/items(@{" + idq(TXM + "?['RecordId']") + "})?$select=Id,PendingRequestKey"))),
                    ('Set_part_changed', after(set_var('varPart', "@and(equals(actions('Get_changed_m')?['status'], 'Succeeded'), "
                                                                  "equals(string(coalesce(body('Get_changed_m')?['PendingRequestKey'], '')), string(" + TXM + "?['RequestKey'])))"),
                                               {'Get_changed_m': TOLERANT})),
                ))))))))),
                ('Attention_tx', compose({'State': 'Needs attention'})),
                ('Has_tx_m', cond("@empty(" + TXM + ")", None, seq(('Save_attention_tx', merge(tx_item, 'Attention_tx'))))),
                ('Attention_req', compose({'Status': 'Needs attention', 'ResultMessage': "@{if(" + PART + ", if(" + ADMIN_TYPE + ", " + q(partly_admin) + ", " + q(partly) + "), " + q(nothing) + ")}"})),
                ('Save_attention_req', merge(req_item, 'Attention_req')),
                alert_if('Attention_alert', 'true', "concat('request|', string(" + S + "?['Id']))",
                         "concat('A change could not be recorded: ', string(" + S + "?['Title']))",
                         "concat('It was sent by ', " + ASKER + ", ' on ', " + uk_when(S + "?['Created']") + ", ' and tried 3 times. ', if(" + PART + ", if(" + ADMIN_TYPE + ", "
                         "'Part of it was made, so it cannot be cancelled: choose Finish to complete it.', "
                         "'Part of it was made, so the record stays locked until you choose Finish or Revert.'), 'Nothing was changed. You can try it again or cancel it.'), "
                         "' Last error: ', string(coalesce(" + TXM + "?['LastError'], 'none recorded')))"),
            ), seq(
                # put back in the queue: the request flow resumes it from the transaction's stored copy
                ('Refire_body', compose({'Status': 'Submitted', 'Attempts': "@add(int(" + idq(S + "?['Attempts']") + "), 1)"})),
                ('Refire', merge(req_item, 'Refire_body')),
                ('Count_attempt', cond("@and(not(empty(" + TXM + ")), not(" + FINAL_M + "))", seq(
                    ('Attempt_body', compose({'Attempts': "@add(" + ATTEMPTS + ", 1)"})),
                    ('Save_attempt', merge(tx_item, 'Attempt_body')),
                ))),
            ))),
        )}),
        ('Get_attention', http('GET', L('req', "/items?$select=Id&$filter=Status eq 'Needs attention'&$top=5000"))),
        # Daily tasks writes LastDailyRun every morning: 26 hours without it means reminders have stopped
        ('Run_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'LastDailyRun')")),
        alert_if('Daily_stale', "less(ticks(if(empty(string(coalesce(first(body('Run_row'))?['Value'], ''))), '2000-01-01T00:00:00Z', string(first(body('Run_row'))?['Value']))), "
                 "ticks(addHours(utcNow(), -26)))",
                 "'daily'", "'Daily reminders have not run'",
                 "concat('Daily tasks last ran on ', " + uk_when("first(body('Run_row'))?['Value']") + ", '. Deadline reminders are not being sent. "
                 "In Power Automate, check that ESG Competency Hub | 1 Daily tasks is turned on and look at its run history.')"),
        *retry_emails(),
        *outbox_create('_A', "variables('varAlerts')"),
        ('Health_row', query("@body('Get_settings')?['value']", "@equals(item()?['Title'], 'QueueHealth')")),
        ('Health_value', compose({'state': "@{if(variables('varDown'), 'Down', 'Healthy')}",
                                  'reason': "@{if(variables('varDown'), 'Changes to actions are not being picked up by ESG Competency Hub | 2 Request queue.', '')}",
                                  # administration has its own flow: when only that one is behind, staff can carry on
                                  'admin': "@{if(variables('varAdminDown'), 'Down', 'Healthy')}",
                                  'adminReason': "@{if(variables('varAdminDown'), 'Administration changes are not being picked up by ESG Competency Hub | 6 Administration.', '')}",
                                  'checkedAt': '@{utcNow()}', 'attention': "@length(body('Get_attention')?['value'])"})),
        ('Health_body', compose({'Value': "@{string(outputs('Health_value'))}"})),
        ('Record_health', cond("@empty(body('Health_row'))", None, seq(
            ('Save_health', merge(L('settings', "/items(@{first(body('Health_row'))?['Id']})"), 'Health_body')),
        ))),
    )
    actions = seq(('Initialize_varOutbox', init_var('varOutbox', 'array', [])),
                  ('Initialize_varAlerts', init_var('varAlerts', 'array', [])),
                  ('Initialize_varDown', init_var('varDown', 'boolean', False)),
                  ('Initialize_varAdminDown', init_var('varAdminDown', 'boolean', False)),
                  ('Initialize_varPart', init_var('varPart', 'boolean', False)))
    actions['Try'] = after(scope(try_actions), {'Initialize_varPart': OK})
    email_loop, email_act = send_outbox('')
    actions['Send_emails'] = after(scope({email_loop: email_act}), {'Try': OK})
    actions['Catch'] = after(scope(seq(('Terminate_failed', terminate('Failed', 'The queue monitor failed. See the failed action in the run history.')))),
                             {'Try': FAILED})
    triggers = {'Every_15_minutes': {
        'type': 'Recurrence',
        'recurrence': {'frequency': 'Minute', 'interval': 15, 'startTime': '2026-10-01T00:00:00', 'timeZone': 'GMT Standard Time'},
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
     'description': 'Records the changes to actions that people send from the Competency Hub page: raising, updating, moving deadlines, reassigning, closing and reopening.'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f01', 'name': 'ESG Competency Hub | 1 Daily tasks', 'build': flow_daily_tasks,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Every morning at 06:00: the deadline reminders, another try for emails that were not sent, and the end of temporary access to an area.',
     'introduced': '1.1.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f03', 'name': 'ESG Competency Hub | 3 Queue monitor', 'build': flow_queue_monitor,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Every 15 minutes in working hours and hourly outside them: puts stalled changes back in the queue, retries emails, '
                    'tells the administrators about anything that needs them, and records whether processing is healthy.',
     'introduced': '1.3.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f06', 'name': 'ESG Competency Hub | 6 Administration', 'build': lambda: flow_request_queue('admin'),
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': "Records administrators' changes from the Competency Hub page: people, their areas and permissions, settings, and decisions on changes needing attention.",
     'introduced': '1.3.0.0'},
]


KIND = {'1': 'daily', '2': 'queue', '3': 'monitor', '6': 'admin'}


def build_all(raw=False):
    """Every flow as it is imported, with plain step names for the designer (designer_names). raw=True keeps the
    short names used in this file, for the checks that look at particular steps."""
    import designer_names as dn
    out = []
    for f in FLOWS:
        d = f['build']()
        if not raw:
            d = dn.rename(d, dn.readable_names(dn.all_names(d), KIND[f['name'].split('| ')[1][0]]))
        out.append(dict(f, json=flow_json(d, f['connectors'])))
    return out
