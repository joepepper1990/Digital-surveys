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
CONN = {'shared_sharepointonline': 'esghub_sharedsharepointonline_hub', 'shared_office365': 'esghub_sharedoffice365_hub',
        'shared_onedriveforbusiness': 'esghub_sharedonedriveforbusiness_hub'}
OUTLOOK_API = '/providers/Microsoft.PowerApps/apis/shared_office365'
ONEDRIVE_API = '/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness'
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
             'comps': 'competencies', 'notif': 'notifications', 'settings': 'settings', 'notices': 'notices', 'reg': 'register',
             'mtg': 'meetings', 'items': 'meetingItems', 'cal': 'calendar', 'fb': 'feedback'}
LIST_KEYS = {k: BY_KEY[v]['title'] for k, v in LIST_URLS.items()}
REQUEST_LIST = BY_KEY['requests']['title']
MANAGEMENT = "createArray('Team Leader', 'Group Head')"
OPEN = "createArray('Open', 'In Progress', 'Awaiting Input')"
STALE = 'This action was updated by someone else. Review the latest details and try again.'
SELF_ONLY = 'As a technician you can raise actions for yourself in this area. Ask an engineer, or someone who runs meetings in this area, to raise it for someone else.'
# the action values a queued change may write, kept in its plan so that an administrator can write them back
REVERTABLE = ['Status', 'IsOpen', 'Blocker', 'AssignedToId', 'DueDay', 'CurrentDueDate', 'ExtensionCount', 'LastExtendedOn', 'DateCompleted',
              'DateClosed', 'ClosedById', 'CloseOutcome', 'ClosureNote', 'Title', 'Description', 'Priority', 'RequiresCloseOut', 'Revision',
              'CoOwnerIds', 'CloseOutById']
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


# The Outlook event steps take the connector's own name for a time zone, not the Windows one used elsewhere.
OUTLOOK_TZ = '(UTC+00:00) Dublin, Edinburgh, Lisbon, London'


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
    for key in ('req', 'act', 'hist', 'upd', 'notif', 'members', 'people', 'reg', 'notices', 'mtg', 'items'):
        ids[key + 'Root'] = ids[key]
    # a library sits directly under the site
    ids['minutesRoot'] = "@{outputs('Site_path')}/" + BY_KEY['minutes']['url']
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


def notice(send, ntype, key, person, actor_name, action_id, title, area, due_iso, original_iso=None, previous_iso="''", ext_count='0', note="''",
           co_owner=False):
    """One email to queue, as plain values; `person` is a People row read with Person/Name and Person/EMail."""
    return {'send': '@and(' + send + ", equals(string(" + person + "?['Status']), 'Active'))", 'type': ntype, 'key': '@{' + key + '}',
            'recipientId': '@{' + idstr(person + "?['SiteUserId']") + '}', 'login': '@{' + person + "?['Person']?['Name']}",
            'email': "@{coalesce(" + person + "?['Person']?['EMail'], " + person + "?['Email'])}",
            'actor': '@{' + actor_name + '}', 'actionId': '@{' + action_id + '}', 'title': '@{' + title + '}', 'area': '@{' + area + '}',
            'dueIso': '@{' + due_iso + '}', 'originalIso': '@{' + (original_iso or due_iso) + '}', 'previousIso': '@{' + previous_iso + '}',
            'extCount': '@int(' + ext_count + ')', 'note': '@{' + note + '}', 'coOwner': co_owner}


def reminder_words(type_expr, title_expr, due_expr):
    """Subject and opening line of a reminder (R7, DUE, OD) as they read today: a reminder sent again on a later day
    says how many days are left (or late) on that day, not on the day it was first written."""
    days = days_until(due_expr)
    late = "sub(0, " + days + ")"
    plural = lambda n, one, many: "if(equals(" + n + ", 1), " + q(one) + ", " + q(many) + ")"
    is_ = lambda t: "equals(" + type_expr + ", '" + t + "')"
    subject = ("if(" + is_('R7') + ", concat('Reminder: ', " + title_expr + ", ' is due in ', string(" + days + "), " + plural(days, ' day', ' days') + "), "
               "if(" + is_('DUE') + ", concat('Due today: ', " + title_expr + "), "
               "concat(" + title_expr + ", ' is ', string(" + late + "), " + plural(late, ' day late', ' days late') + ")))")
    intro = ("if(" + is_('R7') + ", concat('Your action is due in ', string(" + days + "), " + plural(days, ' day.', ' days.') + "), "
             "if(" + is_('DUE') + ", 'Your action is due today.', "
             "concat('Your action is ', string(" + late + "), " + plural(late, ' day late.', ' days late.') + ")))")
    return subject, intro


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
    co = "equals(" + T('coOwner') + ", true)"
    subject = ("@if(" + is_('ASG') + ", concat(if(" + co + ", 'Action shared with you: ', 'Action assigned to you: '), " + T('title') + "), "
               "if(" + is_('EXT') + ", concat('Deadline moved: ', " + T('title') + "), "
               "if(" + is_('RDY') + ", concat('Ready for your close-out check: ', " + T('title') + "), "
               "if(" + is_('CLS') + ", concat('Action closed: ', " + T('title') + "), "
               "if(" + is_('RAW') + ", concat('Action reassigned: ', " + T('title') + "), "
               "if(" + is_('R7') + ", concat('Reminder: ', " + T('title') + ", ' is due in ', string(" + days + "), " + plural(days, ' day', ' days') + "), "
               "if(" + is_('DUE') + ", concat('Due today: ', " + T('title') + "), "
               "if(" + is_('ALR') + ", concat('Competency Hub needs attention: ', " + T('title') + "), "
               "concat(" + T('title') + ", ' is ', string(" + late + "), " + plural(late, ' day late', ' days late') + ")))))))))")
    actor = html_text(T('actor'))
    intro = ("if(" + is_('ASG') + ", concat(" + actor + ", if(" + co + ", ' has made you a co-owner of an action in the ESG Competency Hub.', "
             "' has given you an action in the ESG Competency Hub.')), "
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
            'recipientId': '@{' + T('recipientId') + '}', 'login': '@{' + T('login') + '}', 'attempts': '1',
            'title': '@{' + T('title') + '}', 'phrase': '@{' + intro + '}', 'coOwner': "@equals(" + T('coOwner') + ", true)"}
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
        ('Notice_refused' + sfx, after(query("@coalesce(body('Create_notice" + sfx + "')?['value'], json('[]'))", "@equals(item()?['HasException'], true)"),
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
            # an assignment or new deadline 0-7 days away has told the owner already: that reminder is not needed (a
            # co-owner gets no reminders, so there is nothing to cover)
            ('Covers' + sfx, cond("@and(contains(createArray('ASG', 'EXT'), " + T('type') + "), not(equals(" + T('coOwner') + ", true)), greaterOrEquals(" + days + ", 0), lessOrEquals(" + days + ", outputs('Cover_days" + sfx + "')))", seq(
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



def send_outbox_steps(sfx):
    """The email sender with what it needs first: how many days before a deadline the first reminder goes
    (ReminderDaysBefore), so an assignment or new deadline inside that window makes the reminder unnecessary."""
    row = "first(body('Cover_row" + sfx + "'))"
    loop, act = send_outbox(sfx)
    # nothing to send (most runs): no call at all
    return seq(('Any_email' + sfx, cond("@not(empty(variables('varOutbox')))", seq(
        ('Cover_settings' + sfx, http('GET', L('settings', "/items?$select=Title,Value&$filter=Title eq 'ReminderDaysBefore'"))),
        ('Cover_row' + sfx, after(query("@if(equals(actions('Cover_settings" + sfx + "')?['status'], 'Succeeded'), body('Cover_settings" + sfx + "')?['value'], json('[]'))", "@true"),
                                  {'Cover_settings' + sfx: TOLERANT})),
        ('Cover_days' + sfx, after(compose("@int(if(empty(string(coalesce(" + row + "?['Value'], ''))), '7', string(" + row + "?['Value'])))"),
                                   {'Cover_row' + sfx: OK})),
        (loop, act)))))


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


def add_alerts(name, body_expr):
    """Adds alerts to varAlerts. Power Automate refuses a Set variable step whose value reads the same variable, so
    the combined list is worked out in a Compose first."""
    return [(name + '_all', compose("@union(variables('varAlerts'), " + body_expr + ")")),
            (name, set_var('varAlerts', "@outputs('" + name + "_all')"))]


def alert_if(name, condition, key_expr, title_expr, detail_expr):
    """Adds an alert for every active administrator to varAlerts when the condition holds."""
    return (name, cond('@' + condition, seq(
        alert_notices(name + '_to', "body('Admins')", key_expr, title_expr, detail_expr),
        *add_alerts(name + '_add', "body('" + name + "_to')"),
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
    # a reminder tried again on a later day is reworded for today (rows written before 1.5.0.0 keep their words)
    REWORD = "and(contains(createArray('R7', 'DUE', 'OD'), string(" + RD + "?['type'])), not(empty(string(coalesce(" + RD + "?['phrase'], '')))))"
    new_subject, new_intro = reminder_words("string(" + RD + "?['type'])", "string(" + RD + "?['title'])", "string(" + RD + "?['dueIso'])")
    html_now = "if(" + REWORD + ", replace(string(" + RD + "?['html']), string(" + RD + "?['phrase']), " + new_intro + "), string(" + RD + "?['html']))"
    retry_mail = {'id': "@" + RI + "?['Id']", 'to': "@{" + RD + "?['to']}", 'subject': "@{if(" + REWORD + ", " + new_subject + ", string(" + RD + "?['subject']))}",
                  'html': "@{if(contains(createArray('Unknown', 'Sending'), string(" + RI + "?['State'])), concat(" + q(again) + ", " + html_now + "), " + html_now + ")}",
                  'type': "@{" + RD + "?['type']}", 'dueIso': "@{" + RD + "?['dueIso']}", 'actionId': "@{" + RD + "?['actionId']}",
                  'recipientId': "@{" + RD + "?['recipientId']}", 'login': "@{" + RD + "?['login']}", 'coOwner': "@equals(" + RD + "?['coOwner'], true)",
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
                *add_alerts('Add_abandon_alerts', "body('Abandon_alerts')"),
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


# --------------------------------------------------------------------------------------------- meeting invitations (spec §5.4)
def outlook(op, params):
    """An Office 365 Outlook calendar call. The connector never retries by itself: a call that may or may not have
    worked is recorded as Unknown and looked up by its reference before anything is tried again."""
    return {'type': 'OpenApiConnection',
            'inputs': {'host': {'connectionName': 'shared_office365', 'operationId': op, 'apiId': OUTLOOK_API},
                       'parameters': params, 'authentication': "@parameters('$authentication')", 'retryPolicy': {'type': 'none'}},
            'runtimeConfiguration': SECURE}


INVITE_PENDING = "createArray('Creating', 'Updating', 'Cancelling', 'Unknown', 'Failed')"


def invite_steps(sfx, meeting_id_expr):
    """Brings one meeting's Outlook invitation into line with the meeting (spec MTG-1, §5.4). What to do follows from the
    meeting itself: cancelled – cancel the event; no event yet – create it; otherwise – update it. Before creating or
    cancelling without a stored event, a call that has been tried before first looks for the event carrying the
    meeting's reference (InviteToken), so a call that timed out never sends a second invitation. The outcome is
    saved with the meeting's ETag: Sent or Cancelled; Failed for a definite refusal; Unknown for anything unclear.
    When invitations are switched off (InvitesEnabled No) nothing is sent and people use the download in the Hub."""
    s = sfx
    M = "body('Inv_get" + s + "')"
    STATE = "string(coalesce(" + M + "?['InviteState'], 'None'))"
    ATTEMPTS = "int(" + idq(M + "?['InviteAttempts']") + ")"
    TOKEN = "string(coalesce(" + M + "?['InviteToken'], ''))"
    EVENT = "string(coalesce(" + M + "?['OutlookEventId'], ''))"
    ON = "not(equals(string(coalesce(first(body('Inv_switch" + s + "'))?['Value'], 'Yes')), 'No'))"
    OP = "outputs('Inv_op" + s + "')"
    FOUND = "string(coalesce(first(body('Inv_match" + s + "'))?['id'], ''))"
    ID = "variables('varInvEvent')"
    when = lambda col, fallback: ("formatDateTime(convertFromUtc(string(coalesce(" + M + "?['" + col + "'], " + fallback + ")), 'GMT Standard Time'), "
                                  "'yyyy-MM-ddTHH:mm:ss')")
    START = when('MeetingDate', "'2000-01-01T00:00:00Z'")
    END = when('EndTime', "addHours(string(coalesce(" + M + "?['MeetingDate'], '2000-01-01T00:00:00Z')), 1)")
    area = "string(coalesce(first(body('Inv_area" + s + "'))?['Title'], 'Competency'))"
    subject = "concat('[ESG Competency Hub] ', " + area + ", ' monthly meeting')"
    link = "concat(outputs('Site_url'), '/SitePages/Hub.aspx?meeting=', string(" + M + "?['Id']))"
    body = ("concat('<p>The ', " + html_text(area) + ", ' monthly meeting.</p>', "
            "if(empty(string(coalesce(" + M + "?['Location'], ''))), '', concat('<p>Where: ', " + html_text(M + "?['Location']") + ", '</p>')), "
            "if(empty(string(coalesce(" + M + "?['OnlineLink'], ''))), '', concat('<p>Online: ', " + html_text(M + "?['OnlineLink']") + ", '</p>')), "
            "'<p>The agenda is in the Competency Hub: <a href=\"', " + html_text(link) + ", '\">open the meeting</a>.</p>', "
            "'<p style=\"color:#5b6774;font-size:12px\">Sent by the ESG Competency Hub. Reference ', " + TOKEN + ", '</p>')")
    item = lambda: {'table': 'Calendar', 'item/subject': '@' + subject, 'item/start': '@' + START, 'item/end': '@' + END,
                    'item/timeZone': OUTLOOK_TZ, 'item/requiredAttendees': "@join(body('Inv_emails" + s + "'), ';')",
                    'item/body': '@' + body, 'item/location': "@{coalesce(" + M + "?['Location'], '')}", 'item/importance': 'normal',
                    'item/showAs': 'busy', 'item/responseRequested': True}
    result = lambda call: ("if(equals(actions('" + call + "')?['status'], 'Succeeded'), 'ok', if(and(greaterOrEquals(int(coalesce(outputs('" + call + "')?['statusCode'], 0)), 400), "
                           "less(int(coalesce(outputs('" + call + "')?['statusCode'], 0)), 500)), 'refused', 'unclear'))")
    attended = ("@and(equals(item()?['Status'], 'Active'), contains(json(if(empty(string(coalesce(" + M + "?['Attendees'], ''))), '[]', string(" + M + "?['Attendees']))), "
                "int(" + idq("item()?['SiteUserId']") + ")))")
    return [
        ('Inv_get' + s, http('GET', L('mtg', "/items(@{" + meeting_id_expr + "})?$select=Id,Title,Status,MeetingDate,EndTime,Location,OnlineLink,Attendees,"
                                           "OutlookEventId,InviteState,InviteToken,InviteAttempts,CompetencyId"), meta=True)),
        ('Inv_due' + s, cond("@and(contains(" + INVITE_PENDING + ", " + STATE + "), less(" + ATTEMPTS + ", 3))", seq(
            ('Inv_settings' + s, http('GET', L('settings', "/items?$select=Title,Value&$top=500"))),
            ('Inv_switch' + s, query("@body('Inv_settings" + s + "')?['value']", "@equals(item()?['Title'], 'InvitesEnabled')")),
            ('Inv_op' + s, compose("@if(equals(string(" + M + "?['Status']), 'Cancelled'), 'cancel', if(empty(" + EVENT + "), 'create', 'update'))")),
            ('Inv_off' + s, cond("@and(not(" + ON + "), not(equals(" + OP + ", 'cancel')))", seq(
                # switched off: nothing is sent, and the Hub offers the meeting as a download instead
                ('Inv_none' + s, compose({'InviteState': 'None', 'InviteError': ''})),
                ('Save_inv_none' + s, after(merge(L('mtg', "/items(@{" + meeting_id_expr + "})"), 'Inv_none' + s, if_match="@{" + M + "?['odata.etag']}"),
                                            {'Inv_none' + s: OK})),
            ), seq(
                ('Inv_comps' + s, http('GET', L('comps', "/items?$select=Id,Title&$top=500"))),
                ('Inv_area' + s, query("@body('Inv_comps" + s + "')?['value']", "@equals(" + idstr("item()?['Id']") + ", " + idstr(M + "?['CompetencyId']") + ")")),
                ('Inv_people' + s, http('GET', L('people', "/items?$select=SiteUserId,Status,Person/EMail&$expand=Person&$top=5000"))),
                ('Inv_attending' + s, query("@body('Inv_people" + s + "')?['value']", attended)),
                ('Inv_emails' + s, {'type': 'Select', 'inputs': {'from': "@body('Inv_attending" + s + "')", 'select': "@item()?['Person']?['EMail']"}}),
                ('Inv_start_id' + s, set_var('varInvEvent', '@' + EVENT)),
                # tried before and nothing stored: look for the event that carries this meeting's reference
                ('Inv_look' + s, cond("@and(empty(" + EVENT + "), or(greater(" + ATTEMPTS + ", 0), not(equals(" + STATE + ", 'Creating'))), not(empty(" + TOKEN + ")))", seq(
                    ('Inv_search' + s, outlook('GetEventsCalendarViewV3', {
                        'calendarId': 'Calendar', 'search': '@' + TOKEN,
                        'startDateTimeUtc': "@formatDateTime(addDays(string(coalesce(" + M + "?['MeetingDate'], utcNow())), -1), 'yyyy-MM-ddTHH:mm:ss')",
                        'endDateTimeUtc': "@formatDateTime(addDays(string(coalesce(" + M + "?['MeetingDate'], utcNow())), 2), 'yyyy-MM-ddTHH:mm:ss')"})),
                    ('Inv_match' + s, after(query("@if(equals(actions('Inv_search" + s + "')?['status'], 'Succeeded'), coalesce(body('Inv_search" + s + "')?['value'], json('[]')), json('[]'))",
                                                  "@contains(string(coalesce(item()?['body'], '')), " + TOKEN + ")"), {'Inv_search' + s: TOLERANT})),
                    # a search that failed says nothing: nothing is created this time (it could make a second invitation)
                    ('Inv_looked' + s, set_var('varInvLook', "@if(equals(actions('Inv_search" + s + "')?['status'], 'Succeeded'), 'ok', 'unclear')")),
                    ('Inv_take' + s, set_var('varInvEvent', '@' + FOUND)),
                ), seq(('Inv_no_look' + s, set_var('varInvLook', 'ok'))))),
                ('Inv_do' + s, cond("@equals(variables('varInvLook'), 'ok')", seq(
                    ('Inv_kind' + s, switch('@' + OP, {
                        'create': seq(('Inv_need_create' + s, cond("@empty(" + ID + ")", seq(
                            ('Inv_create' + s, outlook('V4CalendarPostItem', item())),
                            ('Inv_created' + s, after(set_var('varInvResult', "@" + result('Inv_create' + s)), {'Inv_create' + s: TOLERANT})),
                            ('Inv_new_id' + s, after(set_var('varInvEvent', "@if(equals(actions('Inv_create" + s + "')?['status'], 'Succeeded'), "
                                                                            "string(coalesce(body('Inv_create" + s + "')?['id'], '')), '')"), {'Inv_created' + s: OK})),
                        ), seq(
                            ('Inv_adopted' + s, set_var('varInvResult', 'ok')),
                        )))),
                        'update': seq(
                            ('Inv_update' + s, outlook('V4CalendarPatchItem', dict(item(), id='@' + ID))),
                            ('Inv_updated' + s, after(set_var('varInvResult', "@" + result('Inv_update' + s)), {'Inv_update' + s: TOLERANT})),
                        ),
                    }, seq(
                        # cancel: delete the event if there is one; one already gone counts as done
                        ('Inv_has_event' + s, cond("@empty(" + ID + ")", seq(('Inv_nothing' + s, set_var('varInvResult', 'ok'))), seq(
                            ('Inv_delete' + s, outlook('CalendarDeleteItem_V2', {'calendar': 'Calendar', 'event': '@' + ID})),
                            ('Inv_deleted' + s, after(set_var('varInvResult', "@if(equals(outputs('Inv_delete" + s + "')?['statusCode'], 404), 'ok', " + result('Inv_delete' + s) + ")"),
                                                      {'Inv_delete' + s: TOLERANT})),
                        ))),
                    ))),
                ), seq(('Inv_unclear' + s, set_var('varInvResult', 'unclear'))))),
                ('Inv_outcome' + s, compose({
                    'InviteState': "@{if(equals(variables('varInvResult'), 'ok'), if(equals(" + OP + ", 'cancel'), 'Cancelled', 'Sent'), "
                                   "if(equals(variables('varInvResult'), 'refused'), 'Failed', 'Unknown'))}",
                    'OutlookEventId': "@{if(equals(" + OP + ", 'cancel'), '', variables('varInvEvent'))}",
                    'InviteAttempts': "@if(equals(variables('varInvResult'), 'ok'), 0, add(" + ATTEMPTS + ", 1))",
                    'InviteError': "@{if(equals(variables('varInvResult'), 'ok'), '', concat('Run ', workflow()?['run']?['name'], ': the ', " + OP + ", ' call was ', "
                                   "variables('varInvResult'), '.'))}"})),
                # with the meeting's ETag: a change made meanwhile wins, and the next try follows it
                ('Save_inv' + s, merge(L('mtg', "/items(@{" + meeting_id_expr + "})"), 'Inv_outcome' + s, if_match="@{" + M + "?['odata.etag']}")),
                ('Inv_saved' + s, after(compose('done'), {'Save_inv' + s: TOLERANT})),
            ))),
        ))),
    ]


INVITE_VARS = [('Initialize_varInvResult', init_var('varInvResult', 'string', '')), ('Initialize_varInvEvent', init_var('varInvEvent', 'string', '')),
               ('Initialize_varInvLook', init_var('varInvLook', 'string', 'ok'))]


# --------------------------------------------------------------------------------------------- PDF minutes (spec MTG-6, §5.4)
def onedrive(op, params):
    """OneDrive for Business, used only as a scratch space to turn the minutes into a PDF."""
    return {'type': 'OpenApiConnection',
            'inputs': {'host': {'connectionName': 'shared_onedriveforbusiness', 'operationId': op, 'apiId': ONEDRIVE_API},
                       'parameters': params, 'authentication': "@parameters('$authentication')", 'retryPolicy': {'type': 'none'}},
            'runtimeConfiguration': SECURE}


def sp_create_file(folder_expr, name_expr, body_expr):
    """SharePoint Create file: the binary PDF goes into the Meeting Minutes library."""
    return {'type': 'OpenApiConnection',
            'inputs': {'host': {'connectionName': 'shared_sharepointonline', 'operationId': 'CreateFile', 'apiId': SP_API},
                       'parameters': {'dataset': '@' + SITE, 'folderPath': folder_expr, 'name': name_expr, 'body': body_expr},
                       'authentication': "@parameters('$authentication')"}}


MINUTES_SECTIONS = ['Open actions', 'Closed since last meeting', 'Carried forward', 'Noticeboard', 'New improvements and degradations',
                    'Unresolved degradations', 'Important dates', 'New business', 'Decisions and additional actions']
PDF_STYLE = ('<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#16222c}h1{color:#13516b;font-size:18pt;margin:0 0 4pt}'
             'h2{color:#13516b;font-size:13pt;border-bottom:2px solid #ef7d3a;padding-bottom:2pt;margin-top:16pt}'
             'table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #d9dfe5;padding:4pt;text-align:left;vertical-align:top}'
             'th{background:#eef2f5}.muted{color:#5b6774}</style>')


def pdf_steps(sfx, meeting_id_expr):
    """The minutes as a PDF (spec MTG-6): built only from the frozen record in MTG-{id}, written to OneDrive as HTML,
    converted there, saved as Meeting Minutes/{area}/MTG-{id}-v{n}.pdf, and the working file removed. Each version is
    its own file, so an amendment never replaces the original. A PDF already saved for this version counts as done, so a
    retry never makes a second one. Finalising has already been recorded: nothing here can touch the minutes."""
    s = sfx
    M = "body('Pdf_get" + s + "')"
    MID = idstr(M + "?['Id']")
    ATTEMPTS = "int(" + idq(M + "?['PdfAttempts']") + ")"
    VERSION = "add(int(" + idq(M + "?['AmendmentCount']") + "), 1)"
    AREA = "first(body('Pdf_area" + s + "'))"
    NAME = "concat('MTG-', " + MID + ", '-v', string(" + VERSION + "), '.pdf')"
    FOLDER = "concat('/', " + q(BY_KEY['minutes']['url']) + ", '/', string(" + AREA + "?['CompetencyKey']))"
    ROWS = "body('Pdf_frozen" + s + "')"
    ON = "not(equals(string(coalesce(first(body('Pdf_switch" + s + "'))?['Value'], 'Yes')), 'No'))"
    IT = lambda col: "item()?['" + col + "']"
    cell = lambda expr: "'<td>', " + html_text(expr) + ", '</td>'"
    # people as the Hub names them: their Known as name, else the name in People (a lookup by site user id)
    who = lambda row: "if(empty(trim(string(coalesce(" + row + "?['KnownAs'], '')))), string(coalesce(" + row + "?['Title'], '')), trim(string(" + row + "?['KnownAs'])))"
    name_of = lambda step: who("first(body('" + step + "'))")
    NAME_BY_ID = lambda id_expr: "string(coalesce(outputs('Pdf_names" + s + "')?[" + idstr(id_expr) + "], ''))"
    uk = lambda col: "convertFromUtc(string(coalesce(" + M + "?['" + col + "'], '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'dddd d MMMM yyyy, HH:mm')"
    table = lambda step, head: ("if(empty(body('" + step + "')), '<p class=\"muted\">Nothing recorded.</p>', concat('<table><tr>" + head + "</tr>', join(body('" + step + "'), ''), '</table>'))")
    sections, parts = [], []
    due = "if(empty(string(coalesce(" + IT('SnapshotDueDate') + ", ''))), '', convertFromUtc(string(" + IT('SnapshotDueDate') + "), 'GMT Standard Time', 'd MMM yyyy'))"
    for i, sec in enumerate(MINUTES_SECTIONS, 1):
        f, sel = 'Pdf_sec{0}_rows{1}'.format(i, s), 'Pdf_sec{0}{1}'.format(i, s)
        if sec == 'Decisions and additional actions':
            # the actions raised at the meeting: who owns each and when it is due
            sections += [(f, query('@' + ROWS, "@and(equals(" + IT('RowType') + ", 'Agenda Item'), equals(string(" + IT('Section') + "), " + q(sec) + "))")),
                         (sel, {'type': 'Select', 'inputs': {'from': "@body('" + f + "')", 'select': "@concat('<tr>', " + cell(IT('Title')) + ", " + cell(NAME_BY_ID(IT('SnapshotOwner'))) + ", "
                                                                                                   + cell(due) + ", '</tr>')"}})]
            parts.append("'<h2>Actions closed at this meeting</h2>', " + table('Pdf_closed' + s, '<th>Action</th><th>Notes</th>'))
            parts.append("'<h2>{0}. Actions raised at this meeting</h2>', ".format(i) + table(sel, '<th>Action</th><th>Owner</th><th>Due</th>'))
            continue
        # an action the chair closed at the meeting is listed once, under "Actions closed at this meeting"
        sections += [(f, query('@' + ROWS, "@and(equals(" + IT('RowType') + ", 'Agenda Item'), equals(string(" + IT('Section') + "), " + q(sec) + "), "
                                           "not(equals(string(" + IT('Outcome') + "), 'Closed')))")),
                     (sel, {'type': 'Select', 'inputs': {'from': "@body('" + f + "')", 'select': "@concat('<tr>', " + cell(IT('Title')) + ", " + cell(IT('Outcome')) + ", "
                                                                                               + cell(IT('Notes')) + ", '</tr>')"}})]
        parts.append("'<h2>{0}. {1}</h2>', ".format(i, sec) + table(sel, '<th>Item</th><th>Outcome</th><th>Notes</th>'))
    sections += [('Pdf_closed_rows' + s, query('@' + ROWS, "@and(equals(" + IT('RowType') + ", 'Agenda Item'), equals(string(" + IT('Outcome') + "), 'Closed'))")),
                 ('Pdf_closed' + s, {'type': 'Select', 'inputs': {'from': "@body('Pdf_closed_rows" + s + "')", 'select': "@concat('<tr>', " + cell(IT('Title')) + ", " + cell(IT('Notes')) + ", '</tr>')"}})]
    html = ("concat('<!doctype html><html><head><meta charset=\"utf-8\"><title>Minutes</title>" + PDF_STYLE + "</head><body>', "
            "'<h1>', " + html_text("concat(string(" + AREA + "?['Title']), ' monthly meeting')") + ", '</h1>', "
            "'<p>', " + html_text(uk('MeetingDate')) + ", if(empty(string(coalesce(" + M + "?['Location'], ''))), '', concat(' · ', " + html_text(M + "?['Location']") + ")), '</p>', "
            "'<p>Chair: ', " + html_text(name_of('Pdf_chair' + s)) + ", '. Finalised by ', " + html_text(name_of('Pdf_finaliser' + s)) + ", ' on ', " + html_text(uk('FinalisedAt')) + ", '.</p>', "
            "'<p class=\"muted\">', " + html_text("concat('MTG-', " + MID + ", ' · version ', string(" + VERSION + "))") + ", '</p>', "
            "'<h2>Attendance</h2>', " + table('Pdf_att' + s, '<th>Person</th><th>Attendance</th>') + ", "
            + ", ".join(parts) + ", "
            "'<h2>Decisions</h2>', " + table('Pdf_dec' + s, '<th>Decision</th><th>Details</th>') + ", "
            "if(empty(body('Pdf_amend" + s + "')), '', concat('<h2>Amendments</h2><table><tr><th>Amendment</th><th>What changed</th><th>Why</th></tr>', join(body('Pdf_amend" + s + "'), ''), '</table>')), "
            "'<p class=\"muted\">Produced by the ESG Competency Hub from the finalised record. The original minutes are not changed by amendments.</p></body></html>')")
    return [
        ('Pdf_get' + s, http('GET', L('mtg', "/items(@{" + meeting_id_expr + "})?$select=Id,Title,Status,MeetingDate,Location,ChairId,FinalisedAt,FinalisedById,"
                                           "CompetencyId,AmendmentCount,PdfState,PdfAttempts,PdfVersion"), meta=True)),
        ('Pdf_due' + s, cond("@and(equals(string(" + M + "?['Status']), 'Finalised'), contains(createArray('Pending', 'Failed'), string(coalesce(" + M + "?['PdfState'], 'None'))), "
                             "less(" + ATTEMPTS + ", 3))", seq(
            ('Pdf_settings' + s, http('GET', L('settings', "/items?$select=Title,Value&$top=500"))),
            ('Pdf_switch' + s, query("@body('Pdf_settings" + s + "')?['value']", "@equals(item()?['Title'], 'PdfEnabled')")),
            ('Pdf_on' + s, cond('@' + ON, seq(
                # claimed with the meeting's ETag: a second run at the same time stops here
                ('Pdf_claim_body' + s, compose({'PdfAttempts': "@add(" + ATTEMPTS + ", 1)"})),
                ('Pdf_claim' + s, merge(L('mtg', "/items(@{" + meeting_id_expr + "})"), 'Pdf_claim_body' + s, if_match="@{" + M + "?['odata.etag']}")),
                ('Pdf_start' + s, set_var('varPdfResult', 'failed')),
                ('Pdf_html_id' + s, set_var('varPdfHtml', "@string('')")),
                ('Pdf_comps' + s, http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey&$top=500"))),
                ('Pdf_area' + s, query("@body('Pdf_comps" + s + "')?['value']", "@equals(" + idstr(IT('Id')) + ", " + idstr(M + "?['CompetencyId']") + ")")),
                ('Pdf_exists' + s, http('GET', "_api/web/GetFileByServerRelativePath(decodedurl='@{outputs('Site_path')}@{" + FOLDER + "}/@{" + NAME + "}')?$select=Name")),
                ('Pdf_make' + s, after(cond("@equals(actions('Pdf_exists" + s + "')?['status'], 'Succeeded')", seq(
                    ('Pdf_already' + s, set_var('varPdfResult', 'ok')),
                ), seq(
                    ('Pdf_rows' + s, http('GET', L('items', "/items?$select=Id,Title,RowType,Section,Outcome,Notes,Attendance,AmendmentReason,SortOrder,FileDirRef,SourceId,SnapshotOwner,SnapshotDueDate"
                                                            "&$filter=MeetingId eq @{" + MID + "}&$top=5000"))),
                    ('Pdf_frozen' + s, query("@body('Pdf_rows" + s + "')?['value']", "@equals(last(split(string(" + IT('FileDirRef') + "), '/')), concat('MTG-', " + MID + "))")),
                    ('Pdf_people' + s, http('GET', L('people', "/items?$select=SiteUserId,Title,KnownAs&$top=5000"))),
                    ('Pdf_name_pairs' + s, {'type': 'Select', 'inputs': {'from': "@body('Pdf_people" + s + "')?['value']", 'select':
                        "@concat('\"', " + idstr(IT('SiteUserId')) + ", '\":\"', replace(replace(" + who('item()') + ", '\\', '\\\\'), '\"', '\\\"'), '\"')"}}),
                    ('Pdf_names' + s, compose("@json(concat('{', join(body('Pdf_name_pairs" + s + "'), ','), '}'))")),
                    ('Pdf_chair' + s, query("@body('Pdf_people" + s + "')?['value']", "@equals(" + idstr(IT('SiteUserId')) + ", " + idstr(M + "?['ChairId']") + ")")),
                    ('Pdf_finaliser' + s, query("@body('Pdf_people" + s + "')?['value']", "@equals(" + idstr(IT('SiteUserId')) + ", " + idstr(M + "?['FinalisedById']") + ")")),
                    ('Pdf_att_rows' + s, query('@' + ROWS, "@equals(" + IT('RowType') + ", 'Attendee')")),
                    ('Pdf_att' + s, {'type': 'Select', 'inputs': {'from': "@body('Pdf_att_rows" + s + "')", 'select':
                                     "@concat('<tr>', " + cell("coalesce(outputs('Pdf_names" + s + "')?[" + idstr(IT('SourceId')) + "], " + IT('Title') + ")") + ", "
                     + cell("if(empty(string(coalesce(" + IT('Attendance') + ", ''))), 'Not recorded', " + IT('Attendance') + ")") + ", '</tr>')"}}),
                    *sections,
                    ('Pdf_dec_rows' + s, query('@' + ROWS, "@equals(" + IT('RowType') + ", 'Decision')")),
                    ('Pdf_dec' + s, {'type': 'Select', 'inputs': {'from': "@body('Pdf_dec_rows" + s + "')", 'select': "@concat('<tr>', " + cell(IT('Title')) + ", " + cell(IT('Notes')) + ", '</tr>')"}}),
                    ('Pdf_amend_rows' + s, query('@' + ROWS, "@equals(" + IT('RowType') + ", 'Amendment')")),
                    ('Pdf_amend' + s, {'type': 'Select', 'inputs': {'from': "@body('Pdf_amend_rows" + s + "')", 'select':
                                       "@concat('<tr>', " + cell(IT('Title')) + ", " + cell(IT('Notes')) + ", " + cell(IT('AmendmentReason')) + ", '</tr>')"}}),
                    ('Pdf_html' + s, compose('@' + html)),
                    # OneDrive is only a scratch space: a uniquely named working file, removed afterwards
                    ('Pdf_html_file' + s, onedrive('CreateFile', {'folderPath': '/', 'name': "@{concat('ESG Competency Hub minutes ', replace(" + NAME + ", '.pdf', ''), ' ', guid(), '.html')}",
                                                                  'body': "@outputs('Pdf_html" + s + "')"})),
                    ('Pdf_html_made' + s, set_var('varPdfHtml', "@{body('Pdf_html_file" + s + "')?['Id']}")),
                    ('Pdf_convert' + s, onedrive('ConvertFile', {'id': "@variables('varPdfHtml')", 'type': 'PDF'})),
                    ('Pdf_save' + s, sp_create_file('@' + FOLDER, '@' + NAME, "@body('Pdf_convert" + s + "')")),
                    ('Pdf_saved' + s, set_var('varPdfResult', 'ok')),
                )), {'Pdf_exists' + s: TOLERANT})),
                ('Pdf_cleanup' + s, after(cond("@not(empty(variables('varPdfHtml')))", seq(
                    ('Pdf_delete_html' + s, onedrive('DeleteFile', {'id': "@variables('varPdfHtml')"})),
                    ('Pdf_deleted' + s, after(compose('done'), {'Pdf_delete_html' + s: TOLERANT})),
                )), {'Pdf_make' + s: TOLERANT})),
                # the outcome, with the meeting's current ETag: an amendment made meanwhile wins, and its PDF follows
                ('Pdf_now' + s, after(http('GET', L('mtg', "/items(@{" + meeting_id_expr + "})?$select=Id,AmendmentCount"), meta=True), {'Pdf_cleanup' + s: OK})),
                ('Pdf_outcome' + s, compose({'PdfState': "@{if(equals(variables('varPdfResult'), 'ok'), 'Ready', 'Failed')}",
                                             'PdfVersion': "@if(equals(variables('varPdfResult'), 'ok'), " + VERSION + ", int(" + idq(M + "?['PdfVersion']") + "))"})),
                ('Pdf_same' + s, cond("@equals(" + idstr("body('Pdf_now" + s + "')?['AmendmentCount']") + ", " + idstr(M + "?['AmendmentCount']") + ")", seq(
                    ('Save_pdf' + s, merge(L('mtg', "/items(@{" + meeting_id_expr + "})"), 'Pdf_outcome' + s, if_match="@{body('Pdf_now" + s + "')?['odata.etag']}")),
                    ('Pdf_recorded' + s, after(compose('done'), {'Save_pdf' + s: TOLERANT})),
                ))),
            ), seq(
                # switched off (PdfEnabled No): the Hub offers its print page instead
                ('Pdf_none' + s, compose({'PdfState': 'None'})),
                ('Save_pdf_none' + s, merge(L('mtg', "/items(@{" + meeting_id_expr + "})"), 'Pdf_none' + s, if_match="@{" + M + "?['odata.etag']}")),
            ))),
        ))),
    ]


PDF_VARS = [('Initialize_varPdfResult', init_var('varPdfResult', 'string', '')), ('Initialize_varPdfHtml', init_var('varPdfHtml', 'string', ''))]


# --------------------------------------------------------------------------------------------- the flow
# Which flow applies which kind of request (spec §5.3): each flow's trigger takes only its own kinds, and the
# Request queue takes everything else (so an unknown kind is still answered, with a refusal).
DOMAIN_TYPES = {
    'admin': ['RetryTransaction', 'CancelTransaction', 'RevertTransaction', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson', 'UpdateSetting'],
    'records': ['EditNotice', 'ArchiveNotice', 'PinNotice', 'HideComment', 'RaiseRegisterEntry', 'UpdateRegisterEntry', 'LinkActionToEntry',
                'UnlinkActionFromEntry'],
    'meetings': ['ScheduleMeeting', 'UpdateMeeting', 'CancelMeeting', 'StartMeeting'],
    'minutes': ['FinaliseMeeting', 'AmendMeeting'],
    'cleanup': ['RemoveTestRecords'],
}
# Changes decided once and carried out step by step (StepsDone DECIDED): once decided they may be part-made, so they
# can be finished but not cancelled. Only changes to actions hold a lock and can be reverted.
DECIDED_TYPES = [t for d in ('admin', 'records', 'meetings') for t in DOMAIN_TYPES[d]]
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
    # The minutes flow is started on a timer and takes the oldest waiting request (see below); the others by their trigger
    TB = "variables('varPick')" if domain == 'minutes' else 'triggerBody()'
    R = "body('Get_request')"
    TX = "variables('varTx')"
    P = "outputs('Payload')"
    KEY = "string(" + TX + "?['RequestKey'])"
    SENDER = "outputs('Sender_id')"
    ME = "outputs('Requester')"
    # the requester as people know them in the Hub: their Known as name, else their full name
    ME_NAME = "if(empty(trim(string(coalesce(" + ME + "?['KnownAs'], '')))), string(" + ME + "?['Title']), trim(string(" + ME + "?['KnownAs'])))"
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
    # raised from an improvement or degradation (spec REG-3): the entry must be in the same area and still open
    ENTRY_ID = idq(P + "?['sourceEntryId']")
    ENTRY = "variables('varEntry')"
    LINKED = "greater(int(" + ENTRY_ID + "), 0)"
    ENTRY_OK = ("and(not(empty(string(coalesce(" + ENTRY + "?['Id'], '')))), equals(" + idstr(ENTRY + "?['CompetencyId']") + ", "
                + idstr(AREA_R + "?['Id']") + "), not(equals(string(" + ENTRY + "?['Status']), 'Closed')))")
    # raised from a meeting in progress (spec MTG-3, §4.2): the meeting is in this area, and only its runners and management
    MTG_ID = idq(P + "?['sourceMeetingId']")
    SRC_MTG = "variables('varSrcMtg')"
    FROM_MTG = "greater(int(" + MTG_ID + "), 0)"
    MTG_OK = ("and(equals(" + idstr(SRC_MTG + "?['CompetencyId']") + ", " + idstr(AREA_R + "?['Id']") + "), equals(string(" + SRC_MTG + "?['Status']), 'In Progress'), "
              "or(" + IS_MGMT + ", equals(first(body('My_member_R'))?['CanManageMeetings'], true)))")
    # turned into an action from a notice (1.9.0.0): the notice is active and shown in this area, and only the area's
    # engineers, its meeting leads, and the Team Leaders and Group Head do this
    NOTICE_ID = idq(P + "?['sourceNoticeId']")
    SRC_NOTICE = "variables('varSrcNotice')"
    FROM_NOTICE = "greater(int(" + NOTICE_ID + "), 0)"
    AREA_KEY_R = "string(" + AREA_R + "?['CompetencyKey'])"
    SHOWN_R = "string(coalesce(" + SRC_NOTICE + "?['ShownIn'], ''))"
    NOTICE_OK = ("and(equals(string(" + SRC_NOTICE + "?['Status']), 'Active'), or(endsWith(string(coalesce(" + SRC_NOTICE + "?['FileDirRef'], '')), concat('/', " + AREA_KEY_R + ")), "
                 "equals(" + SHOWN_R + ", 'All'), contains(concat(';', " + SHOWN_R + ", ';'), concat(';', " + AREA_KEY_R + ", ';'))), "
                 "or(" + IS_MGMT + ", equals(first(body('My_member_R'))?['CanManageMeetings'], true), "
                 "and(equals(string(" + ME + "?['Role']), 'Engineer'), not(empty(body('My_member_R'))))))")
    verdict_r = ("@if(greater(variables('varExistingId'), 0), '', "
                 "if(or(empty(" + AREA_R + "), not(or(" + IS_MGMT + ", not(empty(body('My_member_R')))))), 'Choose one of your areas.', "
                 "if(or(empty(" + OWNER_R + "), not(equals(string(" + OWNER_R + "?['Status']), 'Active')), "
                 "not(or(contains(" + MANAGEMENT + ", string(" + OWNER_R + "?['Role'])), not(empty(body('Owner_member_R')?['value']))))), "
                 "'Choose a member of this area or a Team Leader.', "
                 # spec §4.2: a technician without meeting rights in the area raises only for themselves
                 "if(and(equals(string(" + ME + "?['Role']), 'Technician'), not(equals(first(body('My_member_R'))?['CanManageMeetings'], true)), "
                 "not(equals(" + idstr(OWNER_R + "?['SiteUserId']") + ", " + SENDER + "))), " + q(SELF_ONLY) + ", "
                 "if(and(" + LINKED + ", not(" + ENTRY_OK + ")), 'That improvement or degradation could not be found in this area, or it is closed.', "
                 "if(and(" + FROM_MTG + ", not(" + MTG_OK + ")), 'Actions are raised from a meeting only while it is in progress, by the people who run it.', "
                 "if(and(" + FROM_NOTICE + ", not(" + NOTICE_OK + ")), 'Only the engineers of this area, its meeting leads, and the Team Leaders and Group Head can turn a notice shown here into an action.', "
                 "if(empty(" + TITLE + "), 'Enter what needs doing.', "
                 "if(greater(length(" + TITLE + "), 255), 'Keep the title to 255 characters or fewer.', "
                 "if(empty(" + DESC + "), 'Add a short description.', "
                 "if(greater(length(" + DESC + "), 5000), 'Keep the description to 5,000 characters or fewer.', "
                 "if(not(" + DUE_OK + "), 'Choose a target date.', "
                 "if(less(" + day_num(DUE_SAFE) + ", " + day_num(TODAY) + "), 'The target date cannot be in the past.', "
                 "if(greater(" + day_num(DUE_SAFE) + ", " + day_num(MAX_DAY) + "), concat('Choose a date within ', string(outputs('Years_R')), if(equals(outputs('Years_R'), 1), ' year.', ' years.')), "
                 "if(not(contains(createArray('Low', 'Normal', 'High'), " + PRIO + ")), 'Choose a priority.', '')))))))))))))))")
    # co-owners (up to 5) and the person who does the close-out check: each a member of the area or a Team Leader, and
    # never the owner. A technician who may raise only for themselves adds no co-owners (spec §4.2).
    CO_RAW = P + "?['coOwnerIds']"
    CO_IDS_R = "body('Co_ids_R')"
    ELIG_R = "body('Eligible_ids_R')"
    CHECKER_R = "if(equals(" + idq(P + "?['checkerId']") + ", '0'), " + SENDER + ", " + idq(P + "?['checkerId']") + ")"
    CLOSE_OUT_R = "equals(" + P + "?['requiresCloseOut'], true)"
    TECH_SELF_R = ("and(equals(string(" + ME + "?['Role']), 'Technician'), not(equals(first(body('My_member_R'))?['CanManageMeetings'], true)))")
    co_verdict_r = ("@if(greater(length(" + CO_IDS_R + "), 5), 'Choose up to 5 co-owners.', "
                    "if(and(" + TECH_SELF_R + ", not(empty(" + CO_IDS_R + "))), " + q(SELF_ONLY) + ", "
                    "if(not(empty(body('Co_bad_R'))), 'Choose co-owners from the members of this area, and the Team Leaders and Group Head, other than the owner.', "
                    "if(and(" + CLOSE_OUT_R + ", equals(" + CHECKER_R + ", " + idstr(OWNER_R + "?['SiteUserId']") + ")), 'Choose someone other than the owner to do the close-out check.', "
                    "if(and(" + CLOSE_OUT_R + ", not(contains(" + ELIG_R + ", " + CHECKER_R + "))), 'Choose a member of this area or a Team Leader to do the close-out check.', '')))))")
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
        # only when the action is raised from an entry (one call fewer for every other raise)
        ('Entry_given_R', cond('@' + LINKED, seq(
            ('Get_entry_R', http('GET', L('reg', "/items(@{" + ENTRY_ID + "})?$select=Id,CompetencyId,Status"))),
            ('Entry_read_R', after(set_var('varEntry', "@if(equals(actions('Get_entry_R')?['status'], 'Succeeded'), body('Get_entry_R'), json('{}'))"),
                                   {'Get_entry_R': TOLERANT})),
        ))),
        ('Meeting_given_R', cond('@' + FROM_MTG, seq(
            ('Get_src_mtg_R', http('GET', L('mtg', "/items(@{" + MTG_ID + "})?$select=Id,CompetencyId,Status"))),
            ('Src_mtg_read_R', after(set_var('varSrcMtg', "@if(equals(actions('Get_src_mtg_R')?['status'], 'Succeeded'), body('Get_src_mtg_R'), json('{}'))"),
                                     {'Get_src_mtg_R': TOLERANT})),
        ))),
        ('Notice_given_R', cond('@' + FROM_NOTICE, seq(
            ('Get_src_notice_R', http('GET', L('notices', "/items(@{" + NOTICE_ID + "})?$select=Id,Status,ShownIn,FileDirRef"))),
            ('Src_notice_read_R', after(set_var('varSrcNotice', "@if(equals(actions('Get_src_notice_R')?['status'], 'Succeeded'), body('Get_src_notice_R'), json('{}'))"),
                                        {'Get_src_notice_R': TOLERANT})),
        ))),
        ('Read_due_R', set_var('varDue', "@{formatDateTime(concat(" + DUE + ", 'T00:00:00Z'), 'yyyy-MM-dd')}")),
        # the furthest deadline (MaxDeadlineYears, set by an administrator), and whether this is still pre-go-live testing
        ('Get_settings_R', after(http('GET', L('settings', "/items?$select=Title,Value&$top=500")), {'Read_due_R': TOLERANT})),
        ('Years_row_R', query("@body('Get_settings_R')?['value']", "@equals(item()?['Title'], 'MaxDeadlineYears')")),
        ('Years_R', compose("@max(1, int(if(empty(string(coalesce(first(body('Years_row_R'))?['Value'], ''))), '2', string(first(body('Years_row_R'))?['Value']))))")),
        ('Testing_R', query("@body('Get_settings_R')?['value']", "@and(equals(item()?['Title'], 'PreGoLiveTesting'), equals(item()?['Value'], 'Yes'))")),
        ('Max_due_R', after(compose("@formatDateTime(addToTime(concat(" + TODAY + ", 'T00:00:00Z'), mul(outputs('Years_R'), 12), 'Month'), 'yyyy-MM-dd')"),
                            {'Testing_R': OK})),
        # who may share it: the area's members and the Team Leaders and Group Head (for co-owners and the close-out check)
        ('Area_members_R', http('GET', L('members', "/items?$select=PersonId&$filter=CompetencyId eq @{" + idq(AREA_R + "?['Id']") + "} and Status eq 'Active'&$top=5000"))),
        ('Active_people_R', http('GET', L('people', "/items?$select=Id,Title,KnownAs,SiteUserId,Role,Status,Email,Person/Name,Person/EMail&$expand=Person"
                                                    "&$filter=Status eq 'Active'&$top=5000"))),
        ('Member_ids_R', {'type': 'Select', 'inputs': {'from': "@body('Area_members_R')?['value']", 'select': "@" + idstr("item()?['PersonId']")}}),
        ('Eligible_R', query("@body('Active_people_R')?['value']", "@or(contains(" + MANAGEMENT + ", string(item()?['Role'])), contains(body('Member_ids_R'), "
                                                                    + idstr("item()?['SiteUserId']") + "))")),
        ('Eligible_ids_R', {'type': 'Select', 'inputs': {'from': "@body('Eligible_R')", 'select': "@" + idstr("item()?['SiteUserId']")}}),
        ('Co_ids_R', {'type': 'Select', 'inputs': {'from': "@json(if(startsWith(string(coalesce(" + CO_RAW + ", '')), '['), string(" + CO_RAW + "), '[]'))",
                                                   'select': "@" + idstr('item()')}}),
        ('Co_bad_R', query("@" + CO_IDS_R, "@or(not(contains(" + ELIG_R + ", item())), equals(item(), " + idstr(OWNER_R + "?['SiteUserId']") + "))")),
        ('Co_people_R', query("@body('Eligible_R')", "@contains(" + CO_IDS_R + ", " + idstr("item()?['SiteUserId']") + ")")),
        ('Co_verdict_R', compose(co_verdict_r)),
        ('Verdict_base_R', compose(verdict_r)),
        ('Verdict_R', compose("@if(empty(outputs('Verdict_base_R')), outputs('Co_verdict_R'), outputs('Verdict_base_R'))")),
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
                    'CoOwnerIds': "@{if(empty(" + CO_IDS_R + "), '', string(" + CO_IDS_R + "))}",
                    'CloseOutById': "@{if(" + CLOSE_OUT_R + ", " + CHECKER_R + ", '')}",
                    'SourceType': "@{if(" + LINKED + ", 'Register', if(" + FROM_MTG + ", 'Meeting', if(" + FROM_NOTICE + ", 'Noticeboard', 'None')))}", 'SourceId': "@{if(" + LINKED + ", " + ENTRY_ID + ", if(" + FROM_MTG + ", " + MTG_ID + ", if(" + FROM_NOTICE + ", " + NOTICE_ID + ", '')))}", 'IsCrossCompetency': '0', 'PendingRequestKey': '@{' + KEY + '}', 'CreatedRequestKey': 'F|@{' + KEY + '}',
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
            # the owner is told the action is theirs; each co-owner that they share it (never the person who raised it)
            ('Owner_notice_R', compose([notice("not(equals(" + OWNER_ID_R + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + OWNER_ID_R + ")",
                                               OWNER_R, ME_NAME, ACT_ID_R, TITLE, "string(" + AREA_R + "?['Title'])", DUE)])),
            ('Co_notices_R', {'type': 'Select', 'inputs': {'from': "@body('Co_people_R')", 'select': notice(
                "not(equals(" + idstr("item()?['SiteUserId']") + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + idstr("item()?['SiteUserId']") + ")",
                'item()', ME_NAME, ACT_ID_R, TITLE, "string(" + AREA_R + "?['Title'])", DUE, co_owner=True)}}),
            *commit('_R', ACT_ID_R, AREA_R + "?['CompetencyKey']", idstr(AREA_R + "?['Id']"),
                    {'title': "concat('Action raised: ', " + TITLE + ")", 'type': 'Action Raised',
                     'json': {'NewDueDate': '@{' + uk_midnight(DUE) + '}', 'OwnerId': '@int(' + OWNER_ID_R + ')', 'DueDayAtEvent': '@' + day_num(DUE)}},
                    "concat('ACT-', substring(concat('0000', " + ACT_ID_R + "), sub(length(concat('0000', " + ACT_ID_R + ")), 5), 5), ' raised.')",
                    notices="union(outputs('Owner_notice_R'), body('Co_notices_R'))"),
        ), reject('_R', "outputs('Verdict_R')"))),
    )

    # ---------------------------------------------------------------- shared by ExtendDeadline and MarkComplete
    def change_case(sfx, verdict_tail, plan_fields, values_fields, event_fields, result_expr, notices, reads=lambda c: []):
        """One kind of change to an existing action, as data: the shared steps are built once, in change_all()."""
        return {'code': sfx, 'verdict': verdict_tail, 'plan': plan_fields, 'values': values_fields, 'event': event_fields,
                'result': result_expr, 'notices': notices, 'reads': reads}

    def notices_steps(code, notices):
        """A change's emails: a list, or {'list': [...], 'extra': expr} when some come from a Select made earlier."""
        if isinstance(notices, dict):
            return [('Notices_list' + code, compose(notices['list'])),
                    ('Notices_set' + code, set_var('varNoticeList', "@union(outputs('Notices_list" + code + "'), " + notices['extra'] + ")"))]
        return [('Notices_set' + code, set_var('varNoticeList', notices))]

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
        # a completed action waiting for its close-out check is confirmed by the person named to check it, or by a Team
        # Leader or the Group Head; one from before 1.9.0.0 (no one named) by the people who manage it, as before
        CHECKER_ID = idstr(A + "?['CloseOutById']")
        WAITING_CHECK = "and(equals(string(" + A + "?['Status']), 'Completed'), not(empty(" + CHECKER_ID + ")))"
        CLOSE = "if(" + WAITING_CHECK + ", or(equals(" + CHECKER_ID + ", " + SENDER + "), " + IS_MGMT + "), " + EDITS + ")"
        ctx = {'A': A, 'OWNER': OWNER, 'ALLOWED': "or(" + OWNER + ", " + EDITS + ")", 'EDIT': EDITS, 'CLOSE': CLOSE,
               'REASSIGN': "or(" + LEAD + ", " + CHAIR + ", and(" + RAISER + ", not(" + TECH_ONLY + ")))",
               'REOPEN': "or(" + LEAD + ", " + RAISER + ")",
               'OPEN': "contains(" + OPEN + ", string(" + A + "?['Status']))", 'DUE': due_iso(A + "?['DueDay']"),
               'PLAN': "json(string(coalesce(variables('varTxPlan'), '{}')))",
               'OWNER_P': "first(body('Owner_p" + sfx + "'))", 'RAISER_P': "first(body('Raiser_p" + sfx + "'))",
               'NEW_P': "first(body('New_p" + sfx + "'))", 'PREV_P': "first(body('Prev_p" + sfx + "'))",
               'OWNER_ID': idstr(A + "?['AssignedToId']"), 'RAISER_ID': idstr(A + "?['RaisedById']"),
               'CHECKER_ID': "if(empty(" + CHECKER_ID + "), " + idstr(A + "?['RaisedById']") + ", " + CHECKER_ID + ")",
               'CHECKER_P': "first(body('Checker_p" + sfx + "'))",
               'CO_NOW': "json(if(startsWith(string(coalesce(" + A + "?['CoOwnerIds'], '')), '['), string(" + A + "?['CoOwnerIds']), '[]'))",
               'AREA_NAME': "string(" + A + "?['Competency']?['Title'])", 'ACT_ID': idstr(A + "?['Id']"),
               'ORIGINAL': "if(empty(string(coalesce(" + A + "?['OriginalDueDate'], ''))), '', convertFromUtc(string(coalesce(" + A + "?['OriginalDueDate'], '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyy-MM-dd'))"}
        action_item = L('act', "/items(@{" + idstr(TX + "?['RecordId']") + "})")
        sel = ('?$select=Id,Title,CompetencyId,AssignedToId,RaisedById,Status,IsOpen,DueDay,CurrentDueDate,OriginalDueDate,ExtensionCount,'
               'LastExtendedOn,RequiresCloseOut,Revision,PendingRequestKey,LastRequestKey,CreatedRequestKey,Description,Priority,Blocker,'
               'DateCompleted,DateClosed,ClosedById,CloseOutcome,ClosureNote,CoOwnerIds,CloseOutById,Competency/CompetencyKey,Competency/Title&$expand=Competency')
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
                person('Prev_p', "string(" + ctx['PLAN'] + "?['owner'])"), person('Checker_p', ctx['CHECKER_ID']),
                # a resumed run already has the stored plan from the transaction row (Set_tx_plan)
                by_type('Record', lambda code, sp: [
                    ('Event_title' + code, set_var('varEventTitle', "@{take(" + sp['event'](ctx)['title'] + ", 255)}")),
                    ('Event_type' + code, set_var('varEventType', sp['event'](ctx)['type'])),
                    ('Event_form' + code, set_var('varEventForm', [{'FieldName': k, 'FieldValue': v} for k, v in sp['event'](ctx).get('form', {}).items()])),
                    ('Event_json' + code, set_var('varEventJson', dict(EVENT_DEFAULTS, **sp['event'](ctx).get('json', {})))),
                    ('Result' + code, set_var('varResult', "@{" + sp['result'](ctx) + "}")),
                    *notices_steps(code, sp['notices'](ctx))]),
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
                          ME_NAME, c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], NEW,
                          original_iso="if(empty(" + c['ORIGINAL'] + "), " + NEW + ", " + c['ORIGINAL'] + ")", previous_iso=PREV_DUE,
                          ext_count=EXT_N, note=REASON)])

    def complete_tail(c):
        return (common_checks(c, 'Only the owner or the people who manage this action can mark it as done.', 'This action is already done.') +
                "if(greater(length(" + NOTE + "), 1000), 'Keep the note to 1,000 characters or fewer.', '')))))")

    def complete_common(c):
        return [ME_NAME, c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], c['DUE']]

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
        # the person named to check it (the raiser, for an action from before 1.9.0.0) is asked for the close-out check;
        # a closed action is reported to its owner only
        lambda c: [notice("and(not(" + CLOSES + "), not(equals(" + c['CHECKER_ID'] + ", " + SENDER + ")))", 'RDY',
                          "concat('RDY|', " + KEY + ", '|', " + c['CHECKER_ID'] + ")", c['CHECKER_P'], *complete_common(c), note=NOTE),
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

    def eligible_reads(code, area_id_expr):
        """The area's members and the Team Leaders and Group Head, as whole-number text (body('Eligible_ids' + code))."""
        return [('Area_members' + code, http('GET', L('members', "/items?$select=PersonId&$filter=CompetencyId eq @{" + idq(area_id_expr) + "} and Status eq 'Active'&$top=5000"))),
                ('Active_people' + code, http('GET', L('people', "/items?$select=Id,Title,KnownAs,SiteUserId,Role,Status,Email,Person/Name,Person/EMail&$expand=Person"
                                                               "&$filter=Status eq 'Active'&$top=5000"))),
                ('Member_ids' + code, {'type': 'Select', 'inputs': {'from': "@body('Area_members" + code + "')?['value']", 'select': "@" + idstr("item()?['PersonId']")}}),
                ('Eligible' + code, query("@body('Active_people" + code + "')?['value']", "@or(contains(" + MANAGEMENT + ", string(item()?['Role'])), contains(body('Member_ids"
                                          + code + "'), " + idstr("item()?['SiteUserId']") + "))")),
                ('Eligible_ids' + code, {'type': 'Select', 'inputs': {'from': "@body('Eligible" + code + "')", 'select': "@" + idstr("item()?['SiteUserId']")}})]

    HAS_A = lambda f: "contains(" + P + ", '" + f + "')"
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
                        ("greater(length(body('Co_final_A')), 5)", 'Choose up to 5 co-owners.'),
                        ("not(empty(body('Co_bad_A')))", 'Choose co-owners from the members of this area, and the Team Leaders and Group Head, other than the owner.'),
                        *REASON_RULES),
        lambda c: {'owner': '@{' + c['OWNER_ID'] + '}', 'ownerName': "@{first(body('Get_owner_now_A')?['value'])?['Title']}"},
        lambda c: {'AssignedToId': '@int(' + NEW_OWNER_ID + ')', 'CoOwnerIds': "@{if(empty(body('Co_final_A')), '', string(body('Co_final_A')))}"},
        lambda c: {'title': "concat('Reassigned to ', string(" + NEW_OWNER + "?['Title']))", 'type': 'Reassigned',
                   'form': {'Note': '@{' + REASON + '}', 'PreviousValue': "@{" + c['PLAN'] + "?['ownerName']}", 'NewValue': "@{" + NEW_OWNER + "?['Title']}"},
                   'json': {'OwnerId': '@int(' + NEW_OWNER_ID + ')', 'PreviousOwnerId': '@int(' + PREV_OWNER_ID + ')'}},
        lambda c: "concat('Reassigned to ', string(" + NEW_OWNER + "?['Title']), '.')",
        # the new owner is told it is theirs, the previous owner that it no longer is, and anyone newly sharing it that they do
        lambda c: {'list': [notice("not(equals(" + NEW_OWNER_ID + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + NEW_OWNER_ID + ")",
                                   c['NEW_P'], ME_NAME, c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], c['DUE'], note=REASON),
                            notice("not(equals(" + PREV_OWNER_ID + ", " + SENDER + "))", 'RAW', "concat('RAW|', " + KEY + ", '|', " + PREV_OWNER_ID + ")",
                                   c['PREV_P'], ME_NAME, c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], c['DUE'], note=REASON)],
                   'extra': "body('Co_notices_A')"},
        reads=lambda c: [
            # the current and the new owner, for the checks and the record (the plan keeps the current one)
            ('Get_owner_now_A', http('GET', L('people', "/items?$select=Id,Title,SiteUserId&$filter=SiteUserId eq @{" + idq(c['A'] + "?['AssignedToId']") + "}"))),
            ('Get_new_owner_A', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status&$filter=SiteUserId eq @{" + NEW_OWNER_ID + "}"))),
            ('New_owner_member_A', http('GET', L('members', "/items?$select=Id&$filter=PersonId eq @{" + NEW_OWNER_ID + "} and CompetencyId eq @{"
                                                             + idq(c['A'] + "?['CompetencyId']") + "} and Status eq 'Active'"))),
            # co-owners: the ones given, or the current ones when none are given; never the new owner
            *eligible_reads('_A', c['A'] + "?['CompetencyId']"),
            ('Co_given_A', {'type': 'Select', 'inputs': {
                'from': "@if(" + HAS_A('coOwnerIds') + ", json(if(startsWith(string(coalesce(" + P + "?['coOwnerIds'], '')), '['), string(" + P + "?['coOwnerIds']), '[]')), " + c['CO_NOW'] + ")",
                'select': "@" + idstr('item()')}}),
            ('Co_final_A', query("@body('Co_given_A')", "@not(equals(item(), " + NEW_OWNER_ID + "))")),
            ('Co_bad_A', query("@body('Co_final_A')", "@not(contains(body('Eligible_ids_A'), item()))")),
            ('Co_before_A', {'type': 'Select', 'inputs': {'from': "@json(if(startsWith(string(coalesce(if(empty(string(coalesce(variables('varTxPlan'), ''))), "
                                                                   + c['A'] + "?['CoOwnerIds'], " + c['PLAN'] + "?['prev']?['CoOwnerIds']), '')), '['), string(if(empty(string(coalesce(variables('varTxPlan'), ''))), "
                                                                   + c['A'] + "?['CoOwnerIds'], " + c['PLAN'] + "?['prev']?['CoOwnerIds'])), '[]'))", 'select': "@" + idstr('item()')}}),
            ('Co_added_A', query("@body('Eligible_A')", "@and(contains(body('Co_final_A'), " + idstr("item()?['SiteUserId']") + "), not(contains(body('Co_before_A'), "
                                 + idstr("item()?['SiteUserId']") + ")))")),
            ('Co_notices_A', {'type': 'Select', 'inputs': {'from': "@body('Co_added_A')", 'select': notice(
                "not(equals(" + idstr("item()?['SiteUserId']") + ", " + SENDER + "))", 'ASG', "concat('ASG|', " + KEY + ", '|', " + idstr("item()?['SiteUserId']") + ")",
                'item()', ME_NAME, c['ACT_ID'], "string(" + c['A'] + "?['Title'])", c['AREA_NAME'], c['DUE'], co_owner=True)}})])

    OUTCOME = "string(coalesce(" + P + "?['outcome'], ''))"
    NOTE_LEN = text_len('note')
    close_case = change_case(
        '_L',
        lambda c: chain(*guard(c, "or(" + c['OPEN'] + ", equals(string(" + c['A'] + "?['Status']), 'Completed'))", 'This action is already closed.',
                               c['CLOSE'], "@if(equals(string(" + c['A'] + "?['Status']), 'Completed'), 'Only the person named to check it, or a Team Leader or the Group Head, can confirm the close-out.', 'Only the people who manage this action can close it.')"),
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
    # the close-out check after the edit: on or off, and who does it (the one given, else the one named, else the raiser)
    CO_ON_E = lambda c: "if(" + HAS('requiresCloseOut') + ", equals(" + P + "?['requiresCloseOut'], true), equals(" + c['A'] + "?['RequiresCloseOut'], true))"
    CHECKER_E = lambda c: ("if(" + HAS('checkerId') + ", " + idq(P + "?['checkerId']") + ", if(empty(" + idstr(c['A'] + "?['CloseOutById']") + "), "
                           + idstr(c['A'] + "?['RaisedById']") + ", " + idstr(c['A'] + "?['CloseOutById']") + "))")
    edit_case = change_case(
        '_E',
        lambda c: chain(*guard(c, c['OPEN'], 'This action is no longer open.', c['EDIT'], 'Only the people who manage this action can change its details.'),
                        # the owner changes only by Reassign, which has its own rule (spec §4.2)
                        ("or(" + HAS('ownerId') + ", " + HAS('AssignedTo') + ", " + HAS('AssignedToId') + ")", 'The owner is changed with Reassign.'),
                        ("not(or(" + ", ".join(HAS(f) for f in ('title', 'description', 'priority', 'requiresCloseOut', 'checkerId')) + "))", 'Nothing has changed.'),
                        ("and(" + CO_ON_E(c) + ", equals(" + CHECKER_E(c) + ", " + c['OWNER_ID'] + "))", 'Choose someone other than the owner to do the close-out check.'),
                        ("and(" + CO_ON_E(c) + ", not(contains(body('Eligible_ids_E'), " + CHECKER_E(c) + ")))", 'Choose a member of this area or a Team Leader to do the close-out check.'),
                        ("and(" + HAS('title') + ", equals(" + text_len('title') + ", 0))", 'Enter what needs doing.'),
                        ("and(" + HAS('title') + ", greater(" + text_len('title') + ", 255))", 'Keep the title to 255 characters or fewer.'),
                        ("and(" + HAS('description') + ", equals(" + text_len('description') + ", 0))", 'Add a short description.'),
                        ("and(" + HAS('description') + ", greater(" + text_len('description') + ", 5000))", 'Keep the description to 5,000 characters or fewer.'),
                        ("and(" + HAS('priority') + ", not(contains(createArray('Low', 'Normal', 'High'), string(coalesce(" + P + "?['priority'], '')))))",
                         'Choose a priority.')),
        lambda c: {'title': "@{" + c['A'] + "?['Title']}", 'description': "@{" + c['A'] + "?['Description']}",
                   'priority': "@{" + c['A'] + "?['Priority']}", 'closeOut': "@equals(" + c['A'] + "?['RequiresCloseOut'], true)",
                   'checker': "@{" + c['A'] + "?['CloseOutById']}"},
        # a field not given keeps its value (it is written back unchanged)
        lambda c: dict({col: "@{if(" + HAS(f) + ", " + TEXT(f) + ", string(coalesce(" + c['A'] + "?['" + col + "'], '')))}" for f, col in EDIT.items()},
                       RequiresCloseOut="@if(" + HAS('requiresCloseOut') + ", equals(" + P + "?['requiresCloseOut'], true), equals(" + c['A'] + "?['RequiresCloseOut'], true))",
                       CloseOutById="@if(" + CO_ON_E(c) + ", int(" + CHECKER_E(c) + "), null)"),
        lambda c: {'title': "'Details edited'", 'type': 'Details Edited',
                   'form': {'PreviousValue': "@{string(" + c['PLAN'] + ")}", 'NewValue': "@{string(" + P + ")}"}},
        lambda c: "'Details saved.'",
        lambda c: [],
        reads=lambda c: eligible_reads('_E', c['A'] + "?['CompetencyId']"))

    # ---------------------------------------------------------------- administrators: Retry, Cancel, Revert (spec REL-3)
    def known_as_switch():
        """The name a person is known by in the Hub (People.KnownAs). It changes nobody's access, so an administrator
        may set it for anyone, themselves included; an empty name goes back to their full name."""
        sfx = '_N'
        WHO = "int(" + idq(P + "?['personId']") + ")"
        ROW = "first(body('Get_named" + sfx + "')?['value'])"
        VALUE = "outputs('New_name" + sfx + "')"
        IS_ADMIN = "and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active'))"
        ev_key = "concat(" + KEY + ", '|1')"
        ev_values, ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'N_event_values' + sfx, 'N_event_body' + sfx)
        verdict = chain(
            ("not(" + IS_ADMIN + ")", 'Only a Competency Hub administrator can do this.'),
            ("empty(" + ROW + ")", 'This person is not in the Hub.'),
            ("greater(length(" + VALUE + "), 40)", 'Keep the name to 40 characters or fewer.'))
        return seq(
            ('Get_named' + sfx, http('GET', L('people', "/items?$select=Id,Title,KnownAs,Status&$filter=SiteUserId eq @{" + WHO + "}"))),
            ('New_name' + sfx, compose("@trim(string(coalesce(" + P + "?['knownAs'], '')))")),
            ('Decide' + sfx, cond('@' + UNDECIDED, seq(
                ('Verdict' + sfx, compose('@' + verdict)),
                ('Decided' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))",
                                       seq(*tx_update('planned' + sfx, {'State': 'Planned', 'StepsDone': 'DECIDED', 'PreviousValue': "@{string(coalesce(" + ROW + "?['KnownAs'], ''))}"})),
                                       reject(sfx, "outputs('Verdict" + sfx + "')"))),
            ))),
            ('Name_value' + sfx, compose({'KnownAs': '@{' + VALUE + '}'})),
            ('Save_name' + sfx, merge(L('people', "/items(@{" + ROW + "?['Id']})"), 'Name_value' + sfx)),
            ('Find_n_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('Need_n_event' + sfx, cond("@empty(body('Find_n_event" + sfx + "')?['value'])", seq(
                ('N_event_values' + sfx, form({'Title': "@{take(concat('Known as changed for ', string(" + ROW + "?['Title'])), 255)}", 'RowKind': 'Event',
                                               'RequestKey': '@{' + ev_key + '}', 'RecordType': 'Person', 'RecordId': "@{" + ROW + "?['Id']}",
                                               'EventType': 'Access Changed', 'RequestType': 'SetKnownAs',
                                               'PreviousValue': "@{coalesce(" + TX + "?['PreviousValue'], '')}", 'NewValue': '@{' + VALUE + '}', 'OwnerId': '@{' + WHO + '}'})),
                ('N_event_body' + sfx, ev_values),
                ('N_event' + sfx, ev_call),
                *created_ok('N_event' + sfx, 'N_event_made' + sfx, 'The History event could not be created. See N_event' + sfx + '.'),
            ))),
            # filled in every time, so a run stopped just after the event was made completes it
            ('Get_n_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('N_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
            ('Save_n_event' + sfx, merge(L('hist', "/items(@{first(body('Get_n_event" + sfx + "')?['value'])?['Id']})"), 'N_event_details' + sfx)),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "if(empty(" + VALUE + "), concat(string(" + ROW + "?['Title']), ' is shown by their full name.'), "
                            "concat(string(" + ROW + "?['Title']), ' is now shown as ', " + VALUE + ", '.'))", "int(" + WHO + ")"),
        )

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
        ADMIN_PART = ("and(contains(createArray(" + ", ".join(q(x) for x in DECIDED_TYPES) + "), " + TTYPE + "), "
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
        # a list given in any other shape counts as none, and is refused below (it must never stop the run)
        AREAS_OK = "or(not(" + HAS('areas') + "), startsWith(string(" + P + "?['areas']), '['))"
        AREAS = ("if(" + LEAVING + ", json('[]'), if(" + HAS('areas') + ", if(" + AREAS_OK + ", " + P + "?['areas'], json('[]')), body('Active_areas" + sfx + "')))")
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
            levels = lambda read: {'type': 'Select', 'inputs': {'from': "@coalesce(first(body('" + read + "')?['value'])?['RoleDefinitionBindings'], json('[]'))",
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
            ("or(not(" + AREAS_OK + "), not(empty(body('Bad_areas" + sfx + "'))))", 'Choose areas from the list.'),
            ("not(empty(body('Bad_dates" + sfx + "')))", 'An end date for access cannot be in the past.'),
            ("and(" + LEAVING + ", not(empty(body('Get_owned" + sfx + "')?['value'])))",
             "@concat(" + NAME + ", ' still has ', string(length(body('Get_owned" + sfx + "')?['value'])), if(equals(length(body('Get_owned" + sfx + "')?['value']), 1), "
             "' open action', ' open actions'), '. Reassign them first.')"),
            ("not(empty(" + blocked + "))", "@concat('Not removed from ', join(" + blocked + ", ', '), ': open actions there are still theirs. Reassign them first.')"),
            ("and(equals(" + PERSON + "?['IsAdministrator'], true), not(" + ADMINW + "), lessOrEquals(length(body('Get_admins" + sfx + "')?['value']), 1))",
             'There must always be at least one active administrator.'))

        # meeting rights reach the open meetings (spec §4.3): a person who runs meetings in an area may write in the record
        # folder of each of its open meetings. Taken away before the records change, given after, each read back.
        def record_rights(name, add):
            MT = "items('" + name + "')"
            K = "last(split(string(" + MT + "?['FileDirRef']), '/'))"
            ra = ("_api/web/GetFolderByServerRelativePath(decodedurl='@{outputs('Ids')?['itemsRoot']}/@{" + K + "}/MTG-@{" + MT + "?['Id']}/Record')"
                  "/ListItemAllFields/roleassignments")
            check = ra + "?$filter=PrincipalId eq @{" + UID + "}&$expand=RoleDefinitionBindings&$select=PrincipalId,RoleDefinitionBindings/Id"
            has = lambda step: "contains(string(coalesce(first(body('" + step + "')?['value'])?['RoleDefinitionBindings'], '')), concat(':', " + role_id('Contribute') + ", '}'))"
            want = "and(not(" + LEAVING + "), not(" + MGMTW + "), not(empty(body('" + name + "_want'))))"
            return (name, {'type': 'Foreach', 'foreach': "@outputs('Open_mtgs" + sfx + "')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                (name + '_want', query("@" + AREAS, "@and(equals(string(item()?['key']), " + K + "), equals(item()?['chair'], true))")),
                (name + '_now', http('GET', check)),
                # no record folder (a meeting made before Release 4): nothing to do
                (name + '_change', after(cond("@and(equals(actions('" + name + "_now')?['status'], 'Succeeded'), " +
                                              ("and(" + want + ", not(" + has(name + '_now') + ")))" if add else "and(not(" + want + "), " + has(name + '_now') + "))"), seq(
                    (name + '_do', http('POST', ra + "/" + ('addroleassignment' if add else 'removeroleassignment') + "(principalid=@{" + UID + "},roledefid=@{" + role_id('Contribute') + "})")),
                    (name + '_back', http('GET', check)),
                    (name + '_kept', cond("@" + (("not(" + has(name + '_back') + ")") if add else has(name + '_back')),
                                          seq((name + '_stop', fail_here('A meeting record folder did not change as asked. See ' + name + '_do.'))))),
                )), {name + '_now': TOLERANT})),
            )})
        open_meetings = [
            ('Open_sched' + sfx, http('GET', L('mtg', "/items?$select=Id,FileDirRef&$filter=Status eq 'Scheduled'&$top=5000"))),
            ('Open_live' + sfx, http('GET', L('mtg', "/items?$select=Id,FileDirRef&$filter=Status eq 'In Progress'&$top=5000"))),
            ('Open_mtgs' + sfx, compose("@union(body('Open_sched" + sfx + "')?['value'], body('Open_live" + sfx + "')?['value'])")),
        ]

        return seq(
            # a request from anyone but an administrator is refused before anything is looked up (Microsoft 365 included)
            ('Admin_first' + sfx, cond("@and(" + UNDECIDED + ", not(and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active'))))",
                                       reject(sfx + '_first', "'Only a Competency Hub administrator can do this.'"))),
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
            ('Blocked' + sfx, {'type': 'Select', 'inputs': {'from': "@if(" + LEAVING + ", json('[]'), body('Blocked_comps" + sfx + "'))", 'select': "@string(item()?['Title'])"}}),
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
                        'KnownAs': "@{take(trim(string(coalesce(" + P + "?['knownAs'], ''))), 40)}",
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
            *open_meetings,
            record_rights('Rec_out' + sfx, False),
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
            ))),
            # filled in every time, so a run stopped just after the event was made completes it
            ('Get_p_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('P_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
            ('Save_p_event' + sfx, merge(L('hist', "/items(@{first(body('Get_p_event" + sfx + "')?['value'])?['Id']})"), 'P_event_details' + sfx)),
            record_rights('Rec_in' + sfx, True),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "concat(if(" + TYPE_IS('AddPerson') + ", 'Added ', if(" + LEAVING + ", 'Marked as left: ', if(" + TYPE_IS('ReactivatePerson') + ", "
                            "'Reactivated ', 'Saved the changes for '))), " + NAME + ", '.')", "int(" + UID + ")"),
        )

    # ---------------------------------------------------------------- administrators: the settings editor (spec ADM-4)
    def settings_switch():
        """The safe settings, each checked on the server: whole numbers in range, working hours as HH:MM|HH:MM|N, or Yes/No
        for the two switches that fall back when Outlook invitations or PDF conversion cannot be used."""
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
            ("not(contains(createArray('OverdueReminderIntervalDays', 'ReminderDaysBefore', 'DueSoonDays', 'MaxDeadlineYears', 'MonitorHours', 'InvitesEnabled', 'PdfEnabled'), " + NAME + "))", 'Choose a setting.'),
            ("and(contains(createArray('InvitesEnabled', 'PdfEnabled'), " + NAME + "), not(contains(createArray('Yes', 'No'), " + VALUE + ")))", 'Choose Yes or No.'),
            ("empty(" + ROW + ")", 'That setting is missing. Run Setup again.'),
            ("and(contains(createArray('OverdueReminderIntervalDays', 'ReminderDaysBefore', 'DueSoonDays'), " + NAME + "), or(not(" + whole(VALUE) + "), less(" + NUM + ", 1), greater(" + NUM + ", 30)))",
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
                                                       "'days before the deadline for the first reminder', if(equals(" + NAME + ", 'DueSoonDays'), 'days counted as due soon', "
                                                       "if(equals(" + NAME + ", 'MaxDeadlineYears'), 'furthest deadline in years', if(equals(" + NAME + ", 'InvitesEnabled'), 'Outlook invitations', "
                                                       "if(equals(" + NAME + ", 'PdfEnabled'), 'PDF minutes', 'queue monitor hours')))))))}", 'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}',
                                               'RecordType': 'Setting', 'RecordId': "@{" + ROW + "?['Id']}", 'EventType': 'Setting Changed', 'RequestType': 'UpdateSetting',
                                               'PreviousValue': "@{outputs('Previous" + sfx + "')}", 'NewValue': '@{' + VALUE + '}'})),
                ('S_event_body' + sfx, ev_values),
                ('S_event' + sfx, ev_call),
                *created_ok('S_event' + sfx, 'S_event_made' + sfx, 'The History event could not be created. See S_event' + sfx + '.'),
            ))),
            # filled in every time, so a run stopped just after the event was made completes it
            ('Get_s_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('S_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
            ('Save_s_event' + sfx, merge(L('hist', "/items(@{first(body('Get_s_event" + sfx + "')?['value'])?['Id']})"), 'S_event_details' + sfx)),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "'Setting saved.'"),
        )



    # ---------------------------------------------------------------- noticeboard and register (spec §3.4, §3.5)
    def records_switch():
        """Changes to notices, comments and the improvements and degradations register. Each is decided once (the
        same rules as the app, spec §4.2), then written with the record's ETag together with its Revision and
        LastRequestKey; a History event in the area's folder records it. A resumed run carries out what was decided."""
        MOD_ROLE = "equals(string(" + ME + "?['Role']), 'Engineer')"
        COMPS = "body('Get_comps_N')?['value']"
        OWN = "string(" + TX + "?['RequestType'])"
        text_len = lambda f: "length(trim(string(coalesce(" + P + "?['" + f + "'], ''))))"
        TEXT = lambda f: "trim(string(coalesce(" + P + "?['" + f + "'], '')))"
        HAS = lambda f: "contains(" + P + ", '" + f + "')"
        ev_key_uri = "concat(" + KEY + ", '%7C1')"

        def ctx_for(code, T, area_key_expr):
            AREA = "first(body('Area" + code + "'))"
            MEMBER = "first(body('My_member" + code + "'))"
            in_area = "not(empty(" + MEMBER + "))"
            return {'T': T, 'AREA': AREA, 'MEMBER': MEMBER, 'AREA_KEY': area_key_expr,
                    'AUTHOR': "equals(" + idstr(T + "?['AuthorId']") + ", " + SENDER + ")",
                    # moderators: management and the area's engineers; meeting rights alone do not moderate
                    'MOD': "or(" + IS_MGMT + ", and(" + in_area + ", " + MOD_ROLE + "))",
                    'CHAIR': "and(" + in_area + ", equals(" + MEMBER + "?['CanManageMeetings'], true))",
                    'WRITES': "or(" + IS_MGMT + ", " + in_area + ")"}

        def area_steps(code, area_key_expr):
            return [('Area' + code, query('@' + COMPS, "@equals(string(item()?['CompetencyKey']), " + area_key_expr + ")")),
                    ('My_member' + code, query("@body('Get_my_memberships')?['value']",
                                               "@equals(" + idstr("item()?['CompetencyId']") + ", " + idstr("first(body('Area" + code + "'))?['Id']") + ")"))]

        def event_steps(code, area_key_expr, area_id_expr, record_type, record_id_expr, title_expr, event_type, more=None):
            values, call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/@{" + area_key_expr + "}", 'Rec_event_values' + code, 'Rec_event_body' + code)
            find = L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + ev_key_uri + "}'")
            return [
                ('Find_rec_event' + code, http('GET', find)),
                ('Need_rec_event' + code, cond("@empty(body('Find_rec_event" + code + "')?['value'])", seq(
                    ('Rec_event_values' + code, form(dict({'Title': '@{take(' + title_expr + ', 255)}', 'RowKind': 'Event',
                                                           'RequestKey': '@{concat(' + KEY + ", '|1')}", 'RecordType': record_type,
                                                           'RecordId': '@{' + record_id_expr + '}', 'EventType': event_type,
                                                           'RequestType': '@{' + OWN + '}'}, **(more or {})))),
                    ('Rec_event_body' + code, values),
                    ('Rec_event' + code, call),
                    *created_ok('Rec_event' + code, 'Rec_event_made' + code, 'The History event could not be created. See Rec_event' + code + '.'),
                ))),
                ('Get_rec_event' + code, http('GET', find)),
                ('Rec_event_details' + code, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}',
                                                     'CompetencyId': '@int(' + area_id_expr + ')'})),
                ('Save_rec_event' + code, merge(L('hist', "/items(@{first(body('Get_rec_event" + code + "')?['value'])?['Id']})"), 'Rec_event_details' + code)),
            ]

        def change(code, lst, sel, record_type, verdict, values, title, event_type, result, standard=True, more_apply=None, reads=None,
                   already=None, event_more=None, record_type_expr=None):
            """One kind of change to an existing notice, comment or register entry."""
            T = "body('Get_rec" + code + "')"
            area_key = "last(split(string(" + T + "?['FileDirRef']), '/'))"
            c = ctx_for(code, T, area_key)
            item = L(lst, "/items(@{" + idq(TX + "?['RecordId']") + "})")
            ALREADY = already(c) if already else "equals(string(coalesce(" + T + "?['LastRequestKey'], '')), " + KEY + ")"
            stale = ("and(" + ("greater(int(" + idq(TX + "?['ExpectedRevision']") + "), 0), not(equals(" + idstr(T + "?['Revision']") + ", "
                     + idstr(TX + "?['ExpectedRevision']") + "))") + ")") if standard else "false"
            fixed = {'Revision': "@add(int(" + idq(T + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'} if standard else {}
            return seq(
                ('Get_rec' + code, http('GET', item + sel, meta=True)),
                ('Rec_read' + code, after(cond("@equals(actions('Get_rec" + code + "')?['status'], 'Succeeded')", None, seq(
                    ('Rec_missing' + code, cond("@equals(outputs('Get_rec" + code + "')?['statusCode'], 404)", reject(code + '_missing', "'That could not be found. It may have been removed.'"),
                                                seq(('Rec_unreadable' + code, fail_here('It could not be read. See Get_rec' + code + '.'))))))),
                    {'Get_rec' + code: TOLERANT})),
                *area_steps(code, area_key),
                *(reads(c) if reads else []),
                ('Decide' + code, cond('@' + UNDECIDED, seq(
                    ('Verdict' + code, compose("@if(" + ALREADY + ", '', if(empty(" + c['AREA'] + "), 'That could not be found.', if(" + stale + ", "
                                               + q('This was changed by someone else. Review the latest details and try again.') + ", " + verdict(c) + ")))")),
                    ('Decided' + code, cond("@empty(outputs('Verdict" + code + "'))",
                                            seq(*tx_update('planned' + code, {'State': 'Planned', 'StepsDone': 'DECIDED',
                                                                              'PreviousValue': "@{string(" + T + ")}"})),
                                            reject(code, "outputs('Verdict" + code + "')"))),
                ))),
                ('Apply' + code, cond("@not(" + ALREADY + ")", seq(
                    ('Rec_values_own' + code, compose(values(c))),
                    ('Rec_values_fixed' + code, compose(fixed)),
                    ('Rec_values' + code, compose("@union(outputs('Rec_values_own" + code + "'), outputs('Rec_values_fixed" + code + "'))")),
                    ('Save_rec' + code, merge(item, 'Rec_values' + code, if_match="@{" + T + "?['odata.etag']}")),
                ))),
                *(more_apply(c) if more_apply else []),
                *event_steps(code, area_key, idstr(c['AREA'] + "?['Id']"), record_type_expr(c) if record_type_expr else record_type,
                             idstr(T + "?['Id']"), title(c), event_type, event_more(c) if event_more else None),
                *tx_update('applied' + code, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
                *finish_request(code, 'Completed', result(c), 'int(' + idq(T + "?['Id']") + ')'),
            )

        notice_sel = '?$select=Id,Title,Body,Category,IsImportant,ImportantUntil,ImportantDays,Status,AuthorId,Revision,LastRequestKey,FileDirRef'
        CATS = "createArray('General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other')"
        # "Important for" 1 week, 2 weeks, 1 month or 3 months (1.9.0.0); anything else counts as a month
        IMP_DAYS = "if(contains(createArray(7, 14, 30, 90), int(coalesce(" + P + "?['importantDays'], 30))), int(coalesce(" + P + "?['importantDays'], 30)), 30)"
        IMPORTANT_TO = "formatDateTime(addDays(concat(" + TODAY + ", 'T00:00:00Z'), " + IMP_DAYS + "), 'yyyy-MM-dd')"
        edit_notice = change(
            '_NE', 'notices', notice_sel, 'Notice',
            lambda c: chain(("not(equals(string(" + c['T'] + "?['Status']), 'Active'))", 'This notice has been archived.'),
                            ("not(or(" + c['AUTHOR'] + ", " + c['MOD'] + "))", 'Only the person who posted it, or the engineers of the area, and the Team Leaders and Group Head, can change this notice.'),
                            ("and(" + HAS('title') + ", equals(" + text_len('title') + ", 0))", 'Give the notice a title.'),
                            ("and(" + HAS('title') + ", greater(" + text_len('title') + ", 255))", 'Keep the title to 255 characters or fewer.'),
                            ("and(" + HAS('body') + ", equals(" + text_len('body') + ", 0))", 'Write the notice.'),
                            ("and(" + HAS('body') + ", greater(" + text_len('body') + ", 5000))", 'Keep the notice to 5,000 characters or fewer.'),
                            ("and(" + HAS('category') + ", not(contains(" + CATS + ", string(coalesce(" + P + "?['category'], '')))))", 'Choose a category.'),
                            # an author may mark their own notice important for 1 week to 3 months; pinning is for moderators
                            ("and(" + HAS('important') + ", not(" + c['AUTHOR'] + "), not(" + c['MOD'] + "))", 'Only the person who posted it can mark it important.')),
            lambda c: {'Title': "@{if(" + HAS('title') + ", " + TEXT('title') + ", " + c['T'] + "?['Title'])}",
                       'Body': "@{if(" + HAS('body') + ", " + TEXT('body') + ", " + c['T'] + "?['Body'])}",
                       'Category': "@{if(" + HAS('category') + ", " + P + "?['category'], coalesce(" + c['T'] + "?['Category'], 'General'))}",
                       'IsImportant': "@if(" + HAS('important') + ", equals(" + P + "?['important'], true), equals(" + c['T'] + "?['IsImportant'], true))",
                       'ImportantUntil': "@if(" + HAS('important') + ", if(equals(" + P + "?['important'], true), " + uk_midnight(IMPORTANT_TO) + ", null), " + c['T'] + "?['ImportantUntil'])",
                       'ImportantDays': "@if(" + HAS('important') + ", if(equals(" + P + "?['important'], true), " + IMP_DAYS + ", null), " + c['T'] + "?['ImportantDays'])"},
            lambda c: "concat('Notice edited: ', string(" + c['T'] + "?['Title']))", 'Notice Edited', lambda c: "'Notice saved.'",
            event_more=lambda c: {'PreviousValue': "@{take(string(" + c['T'] + "?['Body']), 2000)}", 'NewValue': "@{take(" + TEXT('body') + ", 2000)}"})
        archive_notice = change(
            '_NA', 'notices', notice_sel, 'Notice',
            lambda c: chain(("not(equals(string(" + c['T'] + "?['Status']), 'Active'))", 'This notice is already archived.'),
                            ("not(or(" + c['AUTHOR'] + ", " + c['MOD'] + "))", 'Only the person who posted it, or the engineers of the area, and the Team Leaders and Group Head, can archive this notice.')),
            lambda c: {'Status': 'Archived', 'IsImportant': False},
            lambda c: "concat('Notice archived: ', string(" + c['T'] + "?['Title']))", 'Notice Archived', lambda c: "'Notice archived.'")
        PIN = "equals(" + P + "?['pinned'], true)"
        pin_notice = change(
            '_NP', 'notices', notice_sel, 'Notice',
            lambda c: chain(("not(equals(string(" + c['T'] + "?['Status']), 'Active'))", 'This notice has been archived.'),
                            ("not(" + c['MOD'] + ")", 'Only the engineers of the area, and the Team Leaders and Group Head can pin notices.')),
            # pinned stays important with no end date; unpinned is no longer important
            lambda c: {'IsImportant': "@" + PIN, 'ImportantUntil': None},
            lambda c: "concat(if(" + PIN + ", 'Notice pinned: ', 'Notice unpinned: '), string(" + c['T'] + "?['Title']))",
            "@{if(" + PIN + ", 'Notice Pinned', 'Notice Unpinned')}", lambda c: "if(" + PIN + ", 'Notice pinned.', 'Notice unpinned.')")
        hide_comment = change(
            '_NH', 'upd', '?$select=Id,Body,EntryType,ParentType,ParentId,IsHidden,AuthorId,FileDirRef', 'Notice',
            lambda c: chain(("not(equals(string(" + c['T'] + "?['EntryType']), 'Comment'))", 'Only comments can be hidden.'),
                            ("not(" + c['MOD'] + ")", 'Only the engineers of the area, and the Team Leaders and Group Head can hide comments.')),
            lambda c: {'IsHidden': True},
            lambda c: "concat('Comment hidden by a moderator: ', take(string(" + c['T'] + "?['Body']), 120))", 'Comment Hidden', lambda c: "'Comment hidden.'",
            standard=False, already=lambda c: "equals(" + c['T'] + "?['IsHidden'], true)",
            record_type_expr=lambda c: "@{if(equals(string(" + c['T'] + "?['ParentType']), 'Register Entry'), 'Register Entry', 'Notice')}")

        # ---- the register (spec REG-1 to REG-5)
        reg_sel = ('?$select=Id,Title,Description,EntryType,Impact,Status,Outcome,RaisedById,ResponsiblePersonId,Revision,LastRequestKey,FileDirRef,'
                   'CompetencyId')
        TYPES = "createArray('Improvement', 'Degradation', 'Concern', 'Opportunity', 'Positive Observation', 'Other')"
        IMPACTS = "createArray('Low', 'Medium', 'High')"
        STATUSES = "createArray('Open', 'Under Review', 'Resolved', 'Closed')"
        claims = lambda person: "@{concat('[{\"Key\":\"', " + person + "?['Person']?['Name'], '\"}]')}"

        def manages(c):
            # the raiser, the area's engineers, its meeting runners, management (REG-2; no responsible person from 1.9.0.0)
            return "or(" + c['MOD'] + ", " + c['CHAIR'] + ", equals(" + idstr(c['T'] + "?['RaisedById']") + ", " + SENDER + "))"
        NEW_STATUS = "string(coalesce(" + P + "?['status'], ''))"
        DONE_STATUS = "contains(createArray('Resolved', 'Closed'), " + NEW_STATUS + ")"
        update_entry = change(
            '_RU', 'reg', reg_sel, 'Register Entry',
            lambda c: chain(("not(" + manages(c) + ")", 'Only the person who raised it, the engineers and meeting runners of the area, and the Team Leaders and Group Head can change this entry.'),
                            ("and(" + HAS('title') + ", equals(" + text_len('title') + ", 0))", 'Give the entry a title.'),
                            ("and(" + HAS('title') + ", greater(" + text_len('title') + ", 255))", 'Keep the title to 255 characters or fewer.'),
                            ("and(" + HAS('description') + ", greater(" + text_len('description') + ", 5000))", 'Keep the description to 5,000 characters or fewer.'),
                            ("and(" + HAS('impact') + ", not(contains(" + IMPACTS + ", string(coalesce(" + P + "?['impact'], '')))))", 'Choose the impact.'),
                            ("and(" + HAS('status') + ", not(contains(" + STATUSES + ", " + NEW_STATUS + ")))", 'Choose a status.'),
                            ("and(" + HAS('status') + ", " + DONE_STATUS + ", less(" + text_len('outcome') + ", 10))", 'Record the outcome (at least 10 characters).'),
                            ("greater(" + text_len('outcome') + ", 2000)", 'Keep the outcome to 2,000 characters or fewer.')),
            lambda c: {'Title': "@{if(" + HAS('title') + ", " + TEXT('title') + ", " + c['T'] + "?['Title'])}",
                       'Description': "@{if(" + HAS('description') + ", " + TEXT('description') + ", coalesce(" + c['T'] + "?['Description'], ''))}",
                       'Impact': "@{if(" + HAS('impact') + ", " + P + "?['impact'], coalesce(" + c['T'] + "?['Impact'], 'Medium'))}",
                       'Status': "@{if(" + HAS('status') + ", " + NEW_STATUS + ", " + c['T'] + "?['Status'])}",
                       'Outcome': "@{if(" + HAS('outcome') + ", " + TEXT('outcome') + ", coalesce(" + c['T'] + "?['Outcome'], ''))}",
                       'DateResolved': "@if(" + HAS('status') + ", if(" + DONE_STATUS + ", " + EVENT_TIME + ", null), " + c['T'] + "?['DateResolved'])"},
            lambda c: "concat(if(" + HAS('status') + ", concat('Status changed to ', " + NEW_STATUS + ", ': '), 'Entry updated: '), string(" + c['T'] + "?['Title']))",
            "@{if(" + HAS('status') + ", 'Entry Status Changed', 'Entry Updated')}", lambda c: "'Entry saved.'",
            event_more=lambda c: {'PreviousValue': "@{string(" + c['T'] + "?['Status'])}", 'NewValue': "@{if(" + HAS('status') + ", " + NEW_STATUS + ", '')}",
                                  'Note': "@{" + TEXT('outcome') + "}"})

        # linking an action: one record, never a copy (REG-3). The action must be open and in the entry's area.
        LA = "body('Get_link_action_N')"
        LINK_ID = idq(P + "?['actionId']")
        def link_case(code, linking):
            def reads(c):
                return [('Get_link_action' + code, http('GET', L('act', "/items(@{" + LINK_ID + "})?$select=Id,Title,CompetencyId,IsOpen,SourceType,SourceId,PendingRequestKey"), meta=True)),
                        ('Link_action_ok' + code, after(compose("@if(equals(actions('Get_link_action" + code + "')?['status'], 'Succeeded'), body('Get_link_action" + code + "'), json('{}'))"),
                                                       {'Get_link_action' + code: TOLERANT}))]
            A = lambda code: "outputs('Link_action_ok" + code + "')"
            LINKED_HERE = lambda c: "and(equals(string(coalesce(" + A(code) + "?['SourceType'], '')), 'Register'), equals(" + idstr(A(code) + "?['SourceId']") + ", " + idstr(c['T'] + "?['Id']") + "))"
            def verdict(c):
                rules = [("not(" + manages(c) + ")", 'Only the people who look after this entry can link actions to it.'),
                         ("empty(string(coalesce(" + A(code) + "?['Id'], '')))", 'That action could not be found.')]
                if linking:
                    rules += [("not(equals(" + idstr(A(code) + "?['CompetencyId']") + ", " + idstr(c['T'] + "?['CompetencyId']") + "))", 'Choose an action in the same area as this entry.'),
                              ("not(equals(" + A(code) + "?['IsOpen'], true))", 'Choose an open action.'),
                              ("and(equals(string(coalesce(" + A(code) + "?['SourceType'], '')), 'Register'), not(" + LINKED_HERE(c) + "))", 'That action is already linked to another entry.')]
                else:
                    rules += [("not(" + LINKED_HERE(c) + ")", 'That action is not linked to this entry.')]
                return chain(*rules)
            def more(c):
                link_body = {'SourceType': 'Register', 'SourceId': '@int(' + idstr(c['T'] + "?['Id']") + ')'} if linking else {'SourceType': 'None', 'SourceId': None}
                done = LINKED_HERE(c) if linking else "not(" + LINKED_HERE(c) + ")"
                return [('Link_needed' + code, cond("@not(" + done + ")", seq(
                    ('Link_body' + code, compose(link_body)),
                    ('Save_link' + code, merge(L('act', "/items(@{" + LINK_ID + "})"), 'Link_body' + code, if_match="@{" + A(code) + "?['odata.etag']}")),
                )))]
            return change(code, 'reg', reg_sel, 'Register Entry', verdict, lambda c: {},
                          lambda c: "concat(if(" + ('true' if linking else 'false') + ", 'Action linked: ', 'Action unlinked: '), string(" + A(code) + "?['Title']))",
                          'Action Linked' if linking else 'Action Unlinked',
                          lambda c: "'Action linked.'" if linking else "'Action unlinked.'",
                          reads=reads, more_apply=more,
                          event_more=lambda c: {'NewValue': '@{' + LINK_ID + '}'})
        link_entry = link_case('_RL', True)
        unlink_entry = link_case('_RX', False)

        # ---- raising an entry: created once, found by the key it was created with
        code = '_RR'
        AREA = "first(body('Area" + code + "'))"
        MEMBER = "first(body('My_member" + code + "'))"
        AREA_KEY_IN = "string(coalesce(" + P + "?['areaKey'], ''))"
        FOUND = "body('Find_entry" + code + "')?['value']"
        ENTRY_ID = "string(variables('varActionId'))"
        reg_values, reg_call = create_in_folder('reg', "@{outputs('Ids')?['regRoot']}/@{" + AREA + "?['CompetencyKey']}", 'Entry_values' + code, 'Entry_body' + code)
        raise_entry = seq(
            *area_steps(code, AREA_KEY_IN),
            ('Find_entry' + code, http('GET', L('reg', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
            ('Get_settings' + code, http('GET', L('settings', "/items?$select=Title,Value&$top=500"))),
            ('Testing' + code, query("@body('Get_settings" + code + "')?['value']", "@and(equals(item()?['Title'], 'PreGoLiveTesting'), equals(item()?['Value'], 'Yes'))")),
            ('Decide' + code, cond('@and(' + UNDECIDED + ", empty(" + FOUND + "))", seq(
                ('Verdict' + code, compose('@' + chain(
                    ("or(empty(" + AREA + "), not(equals(string(" + AREA + "?['Status']), 'Active')), not(or(" + IS_MGMT + ", not(empty(" + MEMBER + ")))))", 'Choose one of your areas.'),
                    ("not(contains(" + TYPES + ", string(coalesce(" + P + "?['entryType'], ''))))", 'Choose the type of entry.'),
                    ("not(contains(" + IMPACTS + ", string(coalesce(" + P + "?['impact'], ''))))", 'Choose the impact.'),
                    ("equals(" + text_len('title') + ", 0)", 'Give the entry a title.'),
                    ("greater(" + text_len('title') + ", 255)", 'Keep the title to 255 characters or fewer.'),
                    ("equals(" + text_len('description') + ", 0)", 'Describe it.'),
                    ("greater(" + text_len('description') + ", 5000)", 'Keep the description to 5,000 characters or fewer.')))),
                ('Decided' + code, cond("@empty(outputs('Verdict" + code + "'))",
                                        seq(*tx_update('planned' + code, {'State': 'Planned', 'StepsDone': 'DECIDED'})),
                                        reject(code, "outputs('Verdict" + code + "')"))),
            ))),
            ('Need_entry' + code, cond("@empty(" + FOUND + ")", seq(
                ('Entry_values' + code, form({
                    'Title': '@{' + TEXT('title') + '}', 'Description': '@{' + TEXT('description') + '}', 'Competency': '@{' + idstr(AREA + "?['Id']") + '}',
                    'EntryType': "@{" + P + "?['entryType']}", 'Impact': "@{" + P + "?['impact']}", 'Status': 'Open',
                    'RaisedBy': claims(ME),
                    'DateRaised': "@{convertFromUtc(" + EVENT_TIME + ", 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}",
                    'Revision': '1', 'LastRequestKey': '@{' + KEY + '}', 'CreatedRequestKey': 'F|@{' + KEY + '}',
                    'IsTestRecord': "@{if(empty(body('Testing" + code + "')), '0', '1')}"})),
                ('Entry_body' + code, reg_values),
                ('Create_entry' + code, reg_call),
                *created_ok('Create_entry' + code, 'Entry_created' + code, 'The entry could not be created. See Create_entry' + code + '.'),
                ('Get_new_entry' + code, http('GET', L('reg', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
                ('Set_new_entry' + code, set_var('varActionId', "@int(" + idstr("first(body('Get_new_entry" + code + "')?['value'])?['Id']") + ")")),
            ), seq(
                ('Set_found_entry' + code, set_var('varActionId', "@int(" + idstr("first(" + FOUND + ")?['Id']") + ")")),
            ))),
            *event_steps(code, "string(" + AREA + "?['CompetencyKey'])", idstr(AREA + "?['Id']"), 'Register Entry', ENTRY_ID,
                         "concat(string(" + P + "?['entryType']), ' raised: ', " + TEXT('title') + ")", 'Entry Raised'),
            *tx_update('applied' + code, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(code, 'Completed', "concat('REG-', substring(concat('0000', " + ENTRY_ID + "), sub(length(concat('0000', " + ENTRY_ID + ")), 5), 5), ' raised.')",
                            'int(' + ENTRY_ID + ')'),
        )
        return seq(
            ('Get_comps_N', http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey,Status&$top=500"))),
            ('Record_type', switch("@" + OWN, {'EditNotice': edit_notice, 'ArchiveNotice': archive_notice, 'PinNotice': pin_notice, 'HideComment': hide_comment,
                                                'RaiseRegisterEntry': raise_entry, 'UpdateRegisterEntry': update_entry, 'LinkActionToEntry': link_entry,
                                                'UnlinkActionFromEntry': unlink_entry},
                                   reject('_K', "'This kind of change is not recognised.'"))),
        )

    def meetings_switch():
        """Monthly meetings (spec MTG-1, MTG-2, §4.3): book, change, cancel and start. Each is decided once with the
        same rules as the app, then carried out step by step. Booking makes the meeting's folders – MTG-{id} for the
        agenda, and its Record folder, where the area's meeting runners and management may write while the meeting is
        open. Starting fixes the cut-off and writes the agenda from the records as they are then. The Outlook
        invitation is sent after the change is recorded, by invite_steps, so a slow or failed invitation never
        holds up the meeting itself."""
        OWN = "string(" + TX + "?['RequestType'])"
        TYPE_IS = lambda x: "equals(" + OWN + ", '" + x + "')"
        TEXT = lambda f: "trim(string(coalesce(" + P + "?['" + f + "'], '')))"
        HAS = lambda f: "contains(" + P + ", '" + f + "')"
        COMPS = "body('Get_comps_M')?['value']"
        PEOPLE = "body('Get_people_M')?['value']"
        M = "variables('varMtg')"
        BOOK = TYPE_IS('ScheduleMeeting')
        AREA_KEY = "string(if(" + BOOK + ", coalesce(" + P + "?['areaKey'], ''), last(split(string(coalesce(" + M + "?['FileDirRef'], '')), '/'))))"
        AREA = "first(body('Area_M'))"
        A_ID = idstr(AREA + "?['Id']")
        MEMBER = "first(body('My_member_M'))"
        RUNS = "or(" + IS_MGMT + ", and(not(empty(" + MEMBER + ")), equals(" + MEMBER + "?['CanManageMeetings'], true)))"
        MID = "string(variables('varActionId'))"
        MTG_PATH = "@{outputs('Ids')?['itemsRoot']}/@{" + AREA_KEY + "}/MTG-@{" + MID + "}"
        REC_API = "_api/web/GetFolderByServerRelativePath(decodedurl='" + MTG_PATH + "/Record')/ListItemAllFields"
        ALREADY = "equals(string(coalesce(" + M + "?['LastRequestKey'], '')), " + KEY + ")"
        ev_key_uri = "concat(" + KEY + ", '%7C1')"
        ON = "not(equals(string(coalesce(first(body('Invites_M'))?['Value'], 'Yes')), 'No'))"
        claims = lambda person: "@{concat('[{\"Key\":\"', " + person + "?['Person']?['Name'], '\"}]')}"
        local = lambda col, fmt, fallback: ("formatDateTime(convertFromUtc(string(coalesce(" + M + "?['" + col + "'], " + fallback + ")), 'GMT Standard Time'), '" + fmt + "')")
        # what the meeting will be: what the request gives, otherwise what the meeting has now
        DATE = "string(if(" + HAS('dateIso') + ", " + P + "?['dateIso'], " + local('MeetingDate', 'yyyy-MM-dd', "'2000-01-01T00:00:00Z'") + "))"
        START = "string(if(" + HAS('start') + ", " + P + "?['start'], " + local('MeetingDate', 'HH:mm', "'2000-01-01T00:00:00Z'") + "))"
        END = "string(if(" + HAS('end') + ", " + P + "?['end'], " + local('EndTime', 'HH:mm', "'2000-01-01T01:00:00Z'") + "))"
        CHAIR = "string(if(" + HAS('chairId') + ", " + P + "?['chairId'], " + idstr(M + "?['ChairId']") + "))"
        ATTENDEES = "if(" + HAS('attendeeIds') + ", coalesce(" + P + "?['attendeeIds'], json('[]')), json(if(empty(string(coalesce(" + M + "?['Attendees'], ''))), '[]', string(" + M + "?['Attendees']))))"
        LOCATION = "string(if(" + HAS('location') + ", " + TEXT('location') + ", coalesce(" + M + "?['Location'], '')))"
        ONLINE = "string(if(" + HAS('onlineLink') + ", " + TEXT('onlineLink') + ", coalesce(" + M + "?['OnlineLink'], '')))"
        T = "outputs('When_M')"
        CHAIR_ROW = "first(body('Chair_M'))"
        SAFE_DATE = "if(" + T + "?['ok'], " + DATE + ", " + TODAY + ")"
        mtg_values, mtg_call = create_in_folder('mtg', "@{outputs('Ids')?['mtgRoot']}/@{" + AREA_KEY + "}", 'Mtg_values_M', 'Mtg_body_M')
        find_ev = L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + ev_key_uri + "}'")

        # ---- reading: the area, who runs its meetings, the people, and (for a change) the meeting
        reads = [
            ('Get_comps_M', http('GET', L('comps', "/items?$select=Id,Title,CompetencyKey,Status,TrackingStart&$top=500"))),
            ('Get_people_M', http('GET', L('people', "/items?$select=Id,Title,SiteUserId,Role,Status,Person/Name,Person/EMail&$expand=Person&$top=5000"))),
            ('Is_book_M', cond('@' + BOOK, seq(('Book_no_meeting_M', set_var('varMtg', {}))), seq(
                ('Get_mtg_read_M', http('GET', L('mtg', "/items(@{" + idq(TX + "?['RecordId']") + "})?$select=Id,Title,Status,MeetingDate,EndTime,Location,OnlineLink,"
                                                        "ChairId,Attendees,Revision,LastRequestKey,FileDirRef,CompetencyId,OutlookEventId,InviteState,PreviousMeetingId,"
                                                        "CutoffTime,CutoffUpdatesId,IntervalStart,AmendmentCount,PdfState,PdfAttempts"), meta=True)),
                ('Mtg_found_M', after(cond("@equals(actions('Get_mtg_read_M')?['status'], 'Succeeded')", None,
                                           reject('_M404', "'That meeting could not be found.'")), {'Get_mtg_read_M': TOLERANT})),
                ('Set_mtg_id_M', set_var('varActionId', "@int(" + idq(TX + "?['RecordId']") + ")")),
                ('Set_mtg_M', set_var('varMtg', "@body('Get_mtg_read_M')")),
            ))),
            ('Area_M', query('@' + COMPS, "@equals(string(item()?['CompetencyKey']), " + AREA_KEY + ")")),
            ('My_member_M', query("@body('Get_my_memberships')?['value']", "@equals(" + idstr("item()?['CompetencyId']") + ", " + A_ID + ")")),
            ('Area_members_M', http('GET', L('members', "/items?$select=PersonId,CanManageMeetings&$filter=CompetencyId eq @{" + idq(AREA + "?['Id']") + "} and Status eq 'Active'&$top=5000"))),
            ('Member_ids_M', {'type': 'Select', 'inputs': {'from': "@body('Area_members_M')?['value']", 'select': "@" + idstr("item()?['PersonId']")}}),
            ('Chair_rows_M', query("@body('Area_members_M')?['value']", "@equals(item()?['CanManageMeetings'], true)")),
            ('Chair_ids_M', {'type': 'Select', 'inputs': {'from': "@body('Chair_rows_M')", 'select': "@" + idstr("item()?['PersonId']")}}),
            ('Get_settings_M', http('GET', L('settings', "/items?$select=Title,Value&$top=500"))),
            ('Invites_M', query("@body('Get_settings_M')?['value']", "@equals(item()?['Title'], 'InvitesEnabled')")),
            ('Testing_M', query("@body('Get_settings_M')?['value']", "@and(equals(item()?['Title'], 'PreGoLiveTesting'), equals(item()?['Value'], 'Yes'))")),
            # the date and times, read without ever failing: a value that is not a date simply fails the check below
            ('When_parts_M', compose({'date': '@' + DATE, 'start': '@' + START, 'end': '@' + END})),
            ('Start_utc_M', compose("@convertToUtc(concat(outputs('When_parts_M')?['date'], 'T', outputs('When_parts_M')?['start'], ':00'), 'GMT Standard Time')")),
            ('End_utc_M', after(compose("@convertToUtc(concat(outputs('When_parts_M')?['date'], 'T', outputs('When_parts_M')?['end'], ':00'), 'GMT Standard Time')"),
                                {'Start_utc_M': TOLERANT})),
            ('When_M', after(compose({
                'ok': "@and(equals(actions('Start_utc_M')?['status'], 'Succeeded'), equals(actions('End_utc_M')?['status'], 'Succeeded'), "
                      "equals(length(outputs('When_parts_M')?['date']), 10), equals(length(outputs('When_parts_M')?['start']), 5), equals(length(outputs('When_parts_M')?['end']), 5))",
                'start': "@if(equals(actions('Start_utc_M')?['status'], 'Succeeded'), outputs('Start_utc_M'), '2000-01-01T00:00:00Z')",
                'end': "@if(equals(actions('End_utc_M')?['status'], 'Succeeded'), outputs('End_utc_M'), '2000-01-01T00:00:00Z')"}), {'End_utc_M': TOLERANT})),
            ('Att_ids_M', {'type': 'Select', 'inputs': {'from': "@" + ATTENDEES, 'select': "@string(item())"}}),
            ('Att_ok_M', query('@' + PEOPLE, "@and(equals(item()?['Status'], 'Active'), contains(body('Att_ids_M'), " + idstr("item()?['SiteUserId']") + "), "
                                            "or(contains(" + MANAGEMENT + ", string(item()?['Role'])), contains(body('Member_ids_M'), " + idstr("item()?['SiteUserId']") + ")))")),
            ('Chair_M', query('@' + PEOPLE, "@and(equals(item()?['Status'], 'Active'), equals(" + idstr("item()?['SiteUserId']") + ", " + CHAIR + "), "
                                           "or(contains(" + MANAGEMENT + ", string(item()?['Role'])), contains(body('Chair_ids_M'), " + idstr("item()?['SiteUserId']") + ")))")),
        ]
        # ---- finalising (spec MTG-4, plan F.7.4): what counts is in the meeting's own folders only. The agenda rows are in
        # MTG-{id} (only the flow writes there); what people recorded live is in MTG-{id}/Record, keyed "{id}|…".
        IT_ = lambda col: "item()?['" + col + "']"
        IN_MTG = "equals(last(split(string(" + IT_('FileDirRef') + "), '/')), concat('MTG-', " + MID + "))"
        IN_REC = ("and(endsWith(string(" + IT_('FileDirRef') + "), concat('/MTG-', " + MID + ", '/Record')), startsWith(string(coalesce(" + IT_('RecordKey') + ", '')), concat(" + MID + ", '|')))")
        DISC = "createArray('Carried forward', 'Noticeboard', 'New improvements and degradations')"
        ALLOWED = "createArray('Discussed', 'Deferred', 'Not reached', 'Action raised', 'Discarded', 'Closed')"
        out_key = lambda typ, sid: "concat(" + MID + ", '|O|', " + typ + ", '|', " + sid + ")"
        rows_sel = "/items?$select=Id,Title,RowType,Section,SourceType,SourceId,RecordKey,RowKey,Outcome,Notes,Attendance,FileDirRef,SortOrder&$filter=MeetingId eq @{" + MID + "}&$top=5000"
        fin_check = [('Fin_check_M', cond("@and(" + TYPE_IS('FinaliseMeeting') + ", " + UNDECIDED + ")", seq(
            # every change made from the meeting is recorded first (the app sends them with the meeting's id)
            ('Get_pending_M', http('GET', L('req', "/items?$select=Id,Status&$filter=MeetingId eq @{" + MID + "}&$top=5000"))),
            ('Pending_M', query("@body('Get_pending_M')?['value']", "@contains(createArray('Submitted', 'Processing', 'Failed'), string(" + IT_('Status') + "))")),
            ('Get_rows_M', http('GET', L('items', rows_sel))),
            ('Fin_need_a_M', query("@body('Get_rows_M')?['value']", "@and(" + IN_MTG + ", equals(" + IT_('RowType') + ", 'Agenda Item'), contains(" + DISC + ", string(" + IT_('Section') + ")))")),
            ('Fin_need_n_M', query("@body('Get_rows_M')?['value']", "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'New Business'), startsWith(string(" + IT_('RecordKey') + "), concat(" + MID + ", '|N|')))")),
            ('Fin_out_M', query("@body('Get_rows_M')?['value']", "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'Outcome'), contains(" + ALLOWED + ", string(" + IT_('Outcome') + ")))")),
            ('Fin_keys_M', {'type': 'Select', 'inputs': {'from': "@body('Fin_out_M')", 'select': "@string(" + IT_('RecordKey') + ")"}}),
            ('Fin_miss_a_M', query("@body('Fin_need_a_M')", "@not(contains(body('Fin_keys_M'), " + out_key("string(" + IT_('SourceType') + ")", idstr(IT_('SourceId'))) + "))")),
            ('Fin_miss_n_M', query("@body('Fin_need_n_M')", "@not(contains(body('Fin_keys_M'), " + out_key("'New Business'", idstr(IT_('Id'))) + "))")),
            ('Fin_titles_M', {'type': 'Select', 'inputs': {'from': "@union(body('Fin_miss_a_M'), body('Fin_miss_n_M'))", 'select': "@string(" + IT_('Title') + ")"}}),
            ('Set_fin_check_M', set_var('varFinCheck', "@if(not(empty(body('Pending_M'))), " + q('Some changes made in this meeting are still being recorded. Finalise once they show as saved.') + ", "
                                                      "if(empty(body('Fin_titles_M')), '', concat('These items still need an outcome: ', join(take(body('Fin_titles_M'), 10), '; '), "
                                                      "if(greater(length(body('Fin_titles_M')), 10), ' and more', ''), '.')))")),
        )))]
        # the rules the app applies too (views/meeting-form.js, CH.rules.validateMeeting)
        details_rules = [
            ("not(" + T + "?['ok'])", 'Choose a date, and a start and end time.'),
            ("lessOrEquals(ticks(" + T + "?['end']), ticks(" + T + "?['start']))", 'The meeting must end after it starts.'),
            ("less(" + day_num(SAFE_DATE) + ", " + day_num(TODAY) + ")", 'Choose a date from today onwards.'),
            ("greater(" + day_num(SAFE_DATE) + ", " + day_num("formatDateTime(addDays(concat(" + TODAY + ", 'T00:00:00Z'), 730), 'yyyy-MM-dd')") + ")", 'Choose a date within two years.'),
            ("greater(length(" + LOCATION + "), 255)", 'Keep the place to 255 characters or fewer.'),
            ("and(not(empty(" + ONLINE + ")), or(not(startsWith(toLower(" + ONLINE + "), 'https://')), greater(length(" + ONLINE + "), 1000)))", 'Give a secure online link: it starts with https.'),
            ("empty(body('Chair_M'))", 'Choose a chair who runs meetings in this area, or a Team Leader.'),
            ("or(empty(body('Att_ids_M')), greater(length(body('Att_ids_M')), 60), not(equals(length(body('Att_ok_M')), length(union(body('Att_ids_M'), body('Att_ids_M'))))))",
             'Choose the attendees from the members of the area, and the Team Leaders and Group Head (up to 60).')]
        common_rules = [
            ("or(empty(" + AREA + "), not(equals(string(" + AREA + "?['Status']), 'Active')))", 'Choose an active area.'),
            ("not(" + RUNS + ")", 'Only the people who run meetings in this area, and the Team Leaders and Group Head, can do this.')]
        STATUS = "string(coalesce(" + M + "?['Status'], ''))"
        stale = ("and(greater(int(" + idq(TX + "?['ExpectedRevision']") + "), 0), not(equals(" + idstr(M + "?['Revision']") + ", " + idstr(TX + "?['ExpectedRevision']") + ")))")
        COMMON = "outputs('Verdict_common_M')"
        DETAILS = "outputs('Verdict_details_M')"
        verdict = ("if(not(empty(" + COMMON + ")), " + COMMON + ", "
                   "if(" + BOOK + ", " + DETAILS + ", "
                   "if(" + ALREADY + ", '', "
                   "if(" + stale + ", " + q('This meeting was changed by someone else. Review the latest details and try again.') + ", "
                   "if(" + TYPE_IS('UpdateMeeting') + ", if(not(equals(" + STATUS + ", 'Scheduled')), " + q('Only a meeting that has not started can be changed.') + ", " + DETAILS + "), "
                   "if(" + TYPE_IS('FinaliseMeeting') + ", if(not(equals(" + STATUS + ", 'In Progress')), " + q('Only a meeting in progress can be finalised.') + ", variables('varFinCheck')), "
                   "if(" + TYPE_IS('AmendMeeting') + ", outputs('Verdict_amend_M'), "
                   "if(" + TYPE_IS('CancelMeeting') + ", " + chain(
                       ("not(contains(createArray('Scheduled', 'In Progress'), " + STATUS + "))", 'This meeting is already finished or cancelled.'),
                       ("less(length(" + TEXT('reason') + "), 10)", 'Give a reason of at least 10 characters.'),
                       ("greater(length(" + TEXT('reason') + "), 1000)", 'Keep the reason to 1,000 characters or fewer.')) + ", "
                   "if(not(equals(" + STATUS + ", 'Scheduled')), " + q('This meeting has already started, or is finished or cancelled.') + ", '')))))))))")
        decide = [*(fin_check if domain == 'minutes' else []), ('Decide_M', cond('@' + UNDECIDED, seq(
            ('Verdict_common_M', compose('@' + chain(*common_rules))),
            ('Verdict_details_M', compose('@' + chain(*details_rules))),
            ('Verdict_amend_M', compose('@' + chain(
                ("not(" + IS_MGMT + ")", 'Only Team Leaders and the Group Head can amend finalised minutes.'),
                ("not(equals(" + STATUS + ", 'Finalised'))", 'Only finalised minutes can be amended.'),
                ("less(length(" + TEXT('what') + "), 10)", 'Say what the amendment is, in at least 10 characters.'),
                ("greater(length(" + TEXT('what') + "), 2000)", 'Keep the amendment to 2,000 characters or fewer.'),
                ("less(length(" + TEXT('reason') + "), 10)", 'Give a reason of at least 10 characters.'),
                ("greater(length(" + TEXT('reason') + "), 1000)", 'Keep the reason to 1,000 characters or fewer.')))),
            ('Verdict_M', compose('@' + verdict)),
            ('Decided_M', cond("@empty(outputs('Verdict_M'))", seq(*tx_update('planned_M', {'State': 'Planned', 'StepsDone': 'DECIDED'})),
                               reject('_M', "outputs('Verdict_M')"))),
        )))]

        # ---- the meeting's folders, and who may write in its Record folder while it is open (§4.3)
        def grants(g='_M'):
            """The Record folder's own permissions: management as a group, each of the area's meeting runners by name,
            read back. g keeps the step names apart where a second place uses them (finalising puts them back)."""
            role_id = "string(first(body('Contribute" + g + "'))?['Id'])"
            mgmt_gid = "string(first(body('Mgmt_group" + g + "'))?['Id'])"
            E = "items('Each_grant" + g + "')"
            return [
                *(ensure_folder('_MF', 'items', 'itemsRoot', AREA_KEY, "concat('MTG-', " + MID + ")") if g == '_M' else []),
                *(ensure_folder('_MR', 'items', 'itemsRoot', "concat(" + AREA_KEY + ", '/MTG-', " + MID + ")", "'Record'") if g == '_M' else []),
                ('Contribute_all' + g, http('GET', '_api/web/roledefinitions?$select=Id,Name')),
                ('Contribute' + g, query("@body('Contribute_all" + g + "')?['value']", "@equals(item()?['Name'], 'Competency Hub Contribute')")),
                ('Groups_all' + g, http('GET', '_api/web/sitegroups?$select=Id,Title')),
                ('Mgmt_group' + g, query("@body('Groups_all" + g + "')?['value']", "@equals(item()?['Title'], " + q(next(gr['title'] for gr in SCHEMA['groups'] if gr['key'] == 'Management')) + ")")),
                ('Wanted' + g, compose("@union(createArray(" + mgmt_gid + "), body('Chair_ids_M'))")),
                ('Break_record' + g, http('POST', REC_API + "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)")),
                ('Each_grant' + g, {'type': 'Foreach', 'foreach': "@outputs('Wanted" + g + "')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                    ('Grant_now' + g, http('GET', REC_API + "/roleassignments?$filter=PrincipalId eq @{" + E + "}&$expand=RoleDefinitionBindings&$select=PrincipalId,RoleDefinitionBindings/Id")),
                    ('Grant_levels' + g, {'type': 'Select', 'inputs': {'from': "@coalesce(first(body('Grant_now" + g + "')?['value'])?['RoleDefinitionBindings'], json('[]'))", 'select': "@string(item()?['Id'])"}}),
                    ('Grant_needed' + g, cond("@not(contains(body('Grant_levels" + g + "'), " + role_id + "))", seq(
                        ('Grant' + g, http('POST', REC_API + "/roleassignments/addroleassignment(principalid=@{" + E + "},roledefid=@{" + role_id + "})")),
                    ))),
                )}),
                # read back: every wanted principal now has the level
                ('Grants_back' + g, http('GET', REC_API + "/roleassignments?$expand=RoleDefinitionBindings&$select=PrincipalId,RoleDefinitionBindings/Id")),
                ('Granted' + g, query("@body('Grants_back" + g + "')?['value']", "@contains(string(item()?['RoleDefinitionBindings']), concat(':', " + role_id + ", '}'))")),
                ('Granted_ids' + g, {'type': 'Select', 'inputs': {'from': "@body('Granted" + g + "')", 'select': "@" + idstr("item()?['PrincipalId']")}}),
                ('Missing' + g, query("@outputs('Wanted" + g + "')", "@not(contains(body('Granted_ids" + g + "'), item()))")),
                ('Grants_ok' + g, cond("@empty(body('Missing" + g + "'))", None, seq(('Grants_stop' + g, fail_here('The meeting record folder permissions did not change as asked. See Each_grant' + g + '.'))))),
            ]

        def reset_record(g='_M'):
            """The Record folder back to the area's read-only permissions, read back."""
            return [
                ('Find_record' + g, http('GET', REC_API + "?$select=Id,HasUniqueRoleAssignments")),
                ('Record_there' + g, after(cond("@and(equals(actions('Find_record" + g + "')?['status'], 'Succeeded'), equals(body('Find_record" + g + "')?['HasUniqueRoleAssignments'], true))", seq(
                    ('Reset_record' + g, http('POST', REC_API + "/resetroleinheritance")),
                    ('Record_back' + g, http('GET', REC_API + "?$select=Id,HasUniqueRoleAssignments")),
                    ('Record_reset' + g, cond("@equals(body('Record_back" + g + "')?['HasUniqueRoleAssignments'], true)", seq(
                        ('Record_stop' + g, fail_here('The meeting record folder could not be made read-only. See Reset_record' + g + '.'))))),
                )), {'Find_record' + g: TOLERANT})),
            ]

        def event(c, title_expr, event_type, more=None):
            ev_values, ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/@{" + AREA_KEY + "}", 'Mtg_event_values' + c, 'Mtg_event_body' + c)
            return [
                ('Find_mtg_event' + c, http('GET', find_ev)),
                ('Need_mtg_event' + c, cond("@empty(body('Find_mtg_event" + c + "')?['value'])", seq(
                    ('Mtg_event_values' + c, form(dict({'Title': '@{take(' + title_expr + ', 255)}', 'RowKind': 'Event', 'RequestKey': '@{concat(' + KEY + ", '|1')}",
                                                      'RecordType': 'Meeting', 'RecordId': '@{' + MID + '}', 'EventType': event_type, 'RequestType': '@{' + OWN + '}',
                                                      'MeetingId': '@{' + MID + '}'}, **(more or {})))),
                    ('Mtg_event_body' + c, ev_values),
                    ('Mtg_event' + c, ev_call),
                    *created_ok('Mtg_event' + c, 'Mtg_event_made' + c, 'The History event could not be created. See Mtg_event' + c + '.'),
                ))),
                ('Get_mtg_event' + c, http('GET', find_ev)),
                ('Mtg_event_details' + c, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}',
                                                 'CompetencyId': '@int(' + A_ID + ')'})),
                ('Save_mtg_event' + c, merge(L('hist', "/items(@{first(body('Get_mtg_event" + c + "')?['value'])?['Id']})"), 'Mtg_event_details' + c)),
            ]

        def done(c, message_expr):
            return [*tx_update('applied' + c, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
                    *finish_request(c, 'Completed', message_expr, 'int(' + MID + ')')]

        when_text = "concat(formatDateTime(concat(" + DATE + ", 'T00:00:00Z'), 'dddd d MMMM yyyy'), ' at ', " + START + ")"

        # ---- book
        FOUND = "body('Find_mtg_M')?['value']"
        token = "concat('ESGM', take(replace(" + KEY + ", '-', ''), 10))"
        book = seq(
            ('Find_mtg_M', http('GET', L('mtg', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
            ('Need_mtg_M', cond("@empty(" + FOUND + ")", seq(
                ('Att_num_M', {'type': 'Select', 'inputs': {'from': "@body('Att_ok_M')", 'select': "@int(" + idq("item()?['SiteUserId']") + ")"}}),
                ('Mtg_values_M', form({
                    'Title': "@{take(concat(string(" + AREA + "?['Title']), ' meeting ', " + DATE + "), 255)}", 'Competency': '@{' + A_ID + '}',
                    'MeetingDate': "@{convertFromUtc(" + T + "?['start'], 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}",
                    'EndTime': "@{convertFromUtc(" + T + "?['end'], 'GMT Standard Time', 'dd/MM/yyyy HH:mm')}",
                    'Location': '@{' + LOCATION + '}', 'OnlineLink': '@{' + ONLINE + '}', 'Chair': claims(CHAIR_ROW), 'Status': 'Scheduled',
                    'Attendees': "@{string(body('Att_num_M'))}", 'InviteToken': '@{' + token + '}', 'InviteState': "@{if(" + ON + ", 'Creating', 'None')}",
                    'InviteAttempts': '0', 'AmendmentCount': '0', 'PendingChanges': '0', 'Revision': '1', 'LastRequestKey': '@{' + KEY + '}',
                    'CreatedRequestKey': 'F|@{' + KEY + '}', 'IsTestRecord': "@{if(empty(body('Testing_M')), '0', '1')}"})),
                ('Mtg_body_M', mtg_values),
                ('Create_mtg_M', mtg_call),
                *created_ok('Create_mtg_M', 'Mtg_created_M', 'The meeting could not be created. See Create_mtg_M.'),
                ('Get_new_mtg_M', http('GET', L('mtg', "/items?$select=Id&$filter=CreatedRequestKey eq 'F%7C@{" + esc(KEY) + "}'"))),
                ('Set_new_mtg_M', set_var('varActionId', "@int(" + idstr("first(body('Get_new_mtg_M')?['value'])?['Id']") + ")")),
            ), seq(
                ('Set_found_mtg_M', set_var('varActionId', "@int(" + idstr("first(" + FOUND + ")?['Id']") + ")")),
            ))),
            *grants(),
            *event('_MB', "concat('Meeting booked: ', " + when_text + ")", 'Meeting Booked'),
            *done('_MB', "concat('Meeting booked for ', " + when_text + ", '.')"),
        )

        # ---- change: the details given; the invitation follows (an update, or the first invitation if none went yet)
        upd_body = {'MeetingDate': "@{" + T + "?['start']}", 'EndTime': "@{" + T + "?['end']}", 'Location': '@{' + LOCATION + '}', 'OnlineLink': '@{' + ONLINE + '}',
                    'ChairId': '@int(' + CHAIR + ')', 'Attendees': "@{string(body('Att_num_U_M'))}",
                    'InviteState': "@{if(" + ON + ", if(empty(string(coalesce(" + M + "?['OutlookEventId'], ''))), 'Creating', 'Updating'), 'None')}",
                    'InviteAttempts': 0, 'Revision': "@add(int(" + idq(M + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'}
        update = seq(
            ('Apply_update_M', cond("@not(" + ALREADY + ")", seq(
                ('Att_num_U_M', {'type': 'Select', 'inputs': {'from': "@body('Att_ok_M')", 'select': "@int(" + idq("item()?['SiteUserId']") + ")"}}),
                ('Update_values_M', compose(upd_body)),
                ('Save_update_M', merge(L('mtg', "/items(@{" + MID + "})"), 'Update_values_M', if_match="@{" + M + "?['odata.etag']}")),
            ))),
            *event('_MU', "concat('Meeting changed: ', " + when_text + ")", 'Meeting Changed'),
            *done('_MU', "concat('Meeting changed to ', " + when_text + ", '.')"),
        )

        # ---- cancel: the Record folder goes back to read-only first; then the meeting says so
        cancel = seq(
            *reset_record(),
            ('Apply_cancel_M', cond("@not(" + ALREADY + ")", seq(
                ('Cancel_values_M', compose({'Status': 'Cancelled', 'CancellationReason': '@{' + TEXT('reason') + '}',
                                             'InviteState': "@{if(or(not(empty(string(coalesce(" + M + "?['OutlookEventId'], '')))), contains(createArray('Creating', 'Updating', 'Unknown', 'Failed'), "
                                                            "string(coalesce(" + M + "?['InviteState'], 'None')))), 'Cancelling', 'None')}",
                                             'InviteAttempts': 0, 'Revision': "@add(int(" + idq(M + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'})),
                ('Save_cancel_M', merge(L('mtg', "/items(@{" + MID + "})"), 'Cancel_values_M', if_match="@{" + M + "?['odata.etag']}")),
            ))),
            *event('_MC', "concat('Meeting cancelled: ', " + TEXT('reason') + ")", 'Meeting Cancelled', {'Note': '@{take(' + TEXT('reason') + ', 1000)}'}),
            *done('_MC', "'Meeting cancelled.'"),
        )

        # ---- start: fix the cut-off, then write the agenda from the records as they are at the cut-off (MTG-2, plan F.7.3).
        # The same rules as the app's preview (domain/agenda.js); test_meetings.py checks that the two agree.
        def start_steps():
            S = "body('Get_started_M')"
            CUT = "string(" + S + "?['CutoffTime'])"
            SINCE = "string(coalesce(" + S + "?['IntervalStart'], '2000-01-01T00:00:00Z'))"
            CUT_ID = "int(" + idq(S + "?['CutoffUpdatesId']") + ")"
            K = AREA_KEY
            IT = lambda col: "item()?['" + col + "']"
            in_area = ("or(equals(" + idstr(IT('CompetencyId')) + ", " + A_ID + "), contains(coalesce(" + IT('LinkedCompetenciesId') + ", json('[]')), int(" + A_ID + ")))")
            uncommitted = ("and(not(empty(string(coalesce(" + IT('PendingRequestKey') + ", '')))), "
                           "equals(string(" + IT('CreatedRequestKey') + "), concat('F|', string(" + IT('PendingRequestKey') + "))))")
            tk = lambda col: "ticks(string(coalesce(" + IT(col) + ", '2000-01-01T00:00:00Z')))"
            by_cut = lambda col: "lessOrEquals(" + tk(col) + ", ticks(" + CUT + "))"
            since = lambda col: "greater(" + tk(col) + ", ticks(" + SINCE + "))"
            here = "equals(last(split(string(" + IT('FileDirRef') + "), '/')), " + K + ")"
            skey = lambda typ: "concat('" + typ + ":', " + idstr(IT('Id')) + ")"
            CARRIED = "body('Carried_keys_M')"
            ON = "variables('varFlagOn')"
            F = "items('Each_flag_M')"
            FAUTH = idstr(F + "?['AuthorId']")
            FKEY = "outputs('Flag_key_M')"
            act_sel = ('Id,Title,AssignedToId,Status,DueDay,OriginalDueDate,ExtensionCount,Blocker,DateRaised,DateClosed,CloseOutcome,CompetencyId,'
                       'LinkedCompetenciesId,PendingRequestKey,CreatedRequestKey')
            date_text = lambda col: ("if(empty(string(coalesce(" + IT(col) + ", ''))), '', convertFromUtc(string(coalesce(" + IT(col) + ", '2000-01-01T00:00:00Z')), "
                                     "'GMT Standard Time', 'dd/MM/yyyy'))")
            due_text = "if(empty(" + idstr(IT('DueDay')) + "), '', " + uk_form_date(due_iso(IT('DueDay'))) + ")"

            def section(name, frm, title, order, typ, extra=None, typ_expr=None, id_col='Id'):
                """One agenda section: a row for each source, as validateUpdate form values, keyed by RowKey."""
                t = typ_expr or q(typ)
                key = "concat('F|', " + MID + ", '|A|', " + t + ", '|', " + idstr(IT(id_col)) + ")"
                fields = {'RowKey': '@{' + key + '}', 'MeetingId': '@{' + MID + '}', 'RowType': 'Agenda Item', 'Section': title, 'SortOrder': str(order),
                          'SourceType': '@{' + t + '}' if typ != 'Date' else '', 'SourceId': '@{' + idstr(IT(id_col)) + '}',
                          'Title': "@{take(string(coalesce(" + IT('Title') + ", '')), 255)}"}
                fields.update(extra or {})
                return (name, {'type': 'Select', 'inputs': {'from': '@' + frm, 'select': {'key': '@' + key, 'fields': [{'FieldName': k, 'FieldValue': v} for k, v in fields.items()]}}})
            action_fields = {'SnapshotOwner': '@{' + idstr(IT('AssignedToId')) + '}', 'SnapshotStatus': "@{" + IT('Status') + "}",
                             'SnapshotDueDate': '@{' + due_text + '}', 'SnapshotOriginalDueDate': '@{' + date_text('OriginalDueDate') + '}',
                             'SnapshotExtensionCount': '@{' + idq(IT('ExtensionCount')) + '}', 'SnapshotBlocker': "@{coalesce(" + IT('Blocker') + ", '')}"}
            entry_fields = {'SnapshotStatus': "@{" + IT('Status') + "}", 'SnapshotDetails': "@{concat(string(" + IT('EntryType') + "), ' · ', string(" + IT('Impact') + "), ' impact')}"}
            items_values, items_call = create_in_folder('items', MTG_PATH, 'Agenda_values_M', 'Agenda_body_M')
            R_ = "items('Each_row_M')"
            look = "first(body('Lookahead_M'))?['Value']"
            return seq(
                # the area's last finalised meeting: the agenda covers the time since its cut-off
                ('Get_previous_M', http('GET', L('mtg', "/items?$select=Id,CutoffTime,MeetingDate&$filter=CompetencyId eq @{" + idq(AREA + "?['Id']") + "} and Status eq 'Finalised'"
                                                      "&$orderby=MeetingDate desc&$top=1"))),
                ('Get_last_update_M', http('GET', L('upd', "/items?$select=Id&$orderby=Id desc&$top=1"))),
                ('Apply_start_M', cond("@not(" + ALREADY + ")", seq(
                    ('Start_values_M', compose({
                        'Status': 'In Progress', 'CutoffTime': '@{' + EVENT_TIME + '}',
                        'CutoffUpdatesId': "@int(" + idq("first(body('Get_last_update_M')?['value'])?['Id']") + ")",
                        'IntervalStart': "@{coalesce(first(body('Get_previous_M')?['value'])?['CutoffTime'], " + AREA + "?['TrackingStart'], '2000-01-01T00:00:00Z')}",
                        'PreviousMeetingId': "@if(empty(body('Get_previous_M')?['value']), null, int(" + idq("first(body('Get_previous_M')?['value'])?['Id']") + "))",
                        'StartedById': '@int(' + SENDER + ')', 'Revision': "@add(int(" + idq(M + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'})),
                    ('Save_start_M', merge(L('mtg', "/items(@{" + MID + "})"), 'Start_values_M', if_match="@{" + M + "?['odata.etag']}")),
                ))),
                # from here on everything follows the cut-off stored on the meeting, so a resumed run writes the same agenda
                ('Get_started_M', http('GET', L('mtg', "/items(@{" + MID + "})?$select=Id,CutoffTime,CutoffUpdatesId,IntervalStart,PreviousMeetingId"))),
                ('Sn_open_M', http('GET', L('act', "/items?$select=" + act_sel + "&$filter=IsOpen eq 1&$top=5000"))),
                ('Sn_open_here_M', query("@body('Sn_open_M')?['value']", "@and(" + in_area + ", not(" + uncommitted + "), " + by_cut('DateRaised') + ")")),
                ('Sn_closed_M', http('GET', L('act', "/items?$select=" + act_sel + "&$filter=IsOpen eq 0 and DateClosed ge datetime'@{" + SINCE + "}'&$top=5000"))),
                ('Sn_closed_here_M', query("@body('Sn_closed_M')?['value']", "@and(" + in_area + ", not(" + uncommitted + "), " + since('DateClosed') + ", " + by_cut('DateClosed') + ")")),
                ('Sn_notices_M', http('GET', L('notices', "/items?$select=Id,Title,AuthorId,FileDirRef&$filter=Status eq 'Active'&$top=5000"))),
                ('Sn_notices_here_M', query("@body('Sn_notices_M')?['value']", '@' + here)),
                ('Sn_entries_M', http('GET', L('reg', "/items?$select=Id,Title,EntryType,Impact,Status,RaisedById,DateRaised,FileDirRef&$filter=CompetencyId eq @{"
                                                      + idq(AREA + "?['Id']") + "}&$top=5000"))),
                ('Sn_entries_here_M', query("@body('Sn_entries_M')?['value']", '@' + here)),
                ('Sn_sources_M', {'type': 'Select', 'inputs': {'from': "@union(body('Sn_notices_here_M'), body('Sn_entries_here_M'))",
                                                               'select': "@concat(if(empty(string(coalesce(" + IT('EntryType') + ", ''))), 'Notice', 'Register Entry'), ':', " + idstr(IT('Id')) + ")"}}),
                ('Sn_authors_M', {'type': 'Select', 'inputs': {'from': "@union(body('Sn_notices_here_M'), body('Sn_entries_here_M'))",
                                                               'select': "@concat(if(empty(string(coalesce(" + IT('EntryType') + ", ''))), 'Notice', 'Register Entry'), ':', " + idstr(IT('Id')) + ", '=', "
                                                                         "if(empty(string(coalesce(" + IT('EntryType') + ", ''))), " + idstr(IT('AuthorId')) + ", " + idstr(IT('RaisedById')) + "))"}}),
                ('Sn_mgmt_M', query('@' + PEOPLE, "@contains(" + MANAGEMENT + ", string(" + IT('Role') + "))")),
                ('Sn_mgmt_ids_M', {'type': 'Select', 'inputs': {'from': "@body('Sn_mgmt_M')", 'select': "@" + idstr(IT('SiteUserId'))}}),
                # flags (plan F.5): in this area's folder, up to the cut-off, oldest first; who may raise and withdraw them as in the app
                ('Sn_flags_M', http('GET', L('upd', "/items?$select=Id,EntryType,ParentType,ParentId,AuthorId,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1&$top=5000"))),
                ('Sn_flags_here_M', query("@body('Sn_flags_M')?['value']", "@and(" + here + ", not(equals(" + IT('IsHidden') + ", true)), "
                                                                           "lessOrEquals(int(" + idq(IT('Id')) + "), " + CUT_ID + "))")),
                ('Each_flag_M', {'type': 'Foreach', 'foreach': "@body('Sn_flags_here_M')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                    ('Flag_key_M', compose("@concat(string(" + F + "?['ParentType']), ':', " + idstr(F + "?['ParentId']") + ")")),
                    ('Flag_kind_M', cond("@and(contains(body('Sn_sources_M'), " + FKEY + "), equals(string(" + F + "?['EntryType']), 'Flagged'), "
                                         "or(contains(body('Member_ids_M'), " + FAUTH + "), contains(body('Sn_mgmt_ids_M'), " + FAUTH + ")))", seq(
                        # flagged (again): this person is now the one who flagged it
                        ('Flag_on_rest_M', query('@' + ON, "@not(equals(item(), " + FKEY + "))")),
                        ('Flag_by_rest_M', query("@variables('varFlagBy')", "@not(startsWith(item(), concat(" + FKEY + ", '=')))")),
                        ('Flag_on_set_M', set_var('varFlagOn', "@union(body('Flag_on_rest_M'), createArray(" + FKEY + "))")),
                        ('Flag_by_set_M', set_var('varFlagBy', "@union(body('Flag_by_rest_M'), createArray(concat(" + FKEY + ", '=', " + FAUTH + ")))")),
                        # and when: a meeting that discussed it clears it only if this flag was raised by that meeting's cut-off
                        ('Flag_at_rest_M', query("@variables('varFlagAt')", "@not(startsWith(item(), concat(" + FKEY + ", '=')))")),
                        ('Flag_at_set_M', set_var('varFlagAt', "@union(body('Flag_at_rest_M'), createArray(concat(" + FKEY + ", '=', " + idstr(F + "?['Id']") + ")))")),
                    ), seq(
                        ('Withdrawn_M', cond("@and(equals(string(" + F + "?['EntryType']), 'Flag Withdrawn'), contains(" + ON + ", " + FKEY + "), "
                                             "or(contains(variables('varFlagBy'), concat(" + FKEY + ", '=', " + FAUTH + ")), contains(body('Sn_mgmt_ids_M'), " + FAUTH + "), "
                                             "contains(body('Chair_ids_M'), " + FAUTH + "), contains(body('Sn_authors_M'), concat(" + FKEY + ", '=', " + FAUTH + "))))", seq(
                            ('Flag_off_rest_M', query('@' + ON, "@not(equals(item(), " + FKEY + "))")),
                            ('Flag_off_by_M', query("@variables('varFlagBy')", "@not(startsWith(item(), concat(" + FKEY + ", '=')))")),
                            ('Flag_off_set_M', set_var('varFlagOn', "@body('Flag_off_rest_M')")),
                            ('Flag_off_by_set_M', set_var('varFlagBy', "@body('Flag_off_by_M')")),
                            ('Flag_off_at_M', query("@variables('varFlagAt')", "@not(startsWith(item(), concat(" + FKEY + ", '=')))")),
                            ('Flag_off_at_set_M', set_var('varFlagAt', "@body('Flag_off_at_M')")),
                        ))),
                    ))),
                )}),
                # discussed at a finalised meeting (spec NB-5): clears the flags raised up to that meeting's cut-off. Only meetings
                # whose cut-off could cover a flag still raised are read, each by its own meeting id; only their frozen rows count.
                ('Flag_ids_M', {'type': 'Select', 'inputs': {'from': "@variables('varFlagAt')", 'select': "@int(last(split(item(), '=')))"}}),
                ('Get_finalised_M', http('GET', L('mtg', "/items?$select=Id,CutoffUpdatesId&$filter=CompetencyId eq @{" + idq(AREA + "?['Id']") + "} and Status eq 'Finalised'&$top=5000"))),
                ('Clearing_M', query("@body('Get_finalised_M')?['value']", "@and(not(empty(body('Flag_ids_M'))), greaterOrEquals(int(" + idq(IT('CutoffUpdatesId')) + "), "
                                                                         "min(union(body('Flag_ids_M'), createArray(2147483647)))))")),
                ('Each_clear_M', {'type': 'Foreach', 'foreach': "@body('Clearing_M')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                    ('Get_discussed_M', http('GET', L('items', "/items?$select=SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq @{" + idq("items('Each_clear_M')?['Id']")
                                                            + "} and RowType eq 'Agenda Item'&$top=5000"))),
                    ('Discussed_M', query("@body('Get_discussed_M')?['value']", "@and(equals(string(" + IT('Outcome') + "), 'Discussed'), "
                                                                               "equals(last(split(string(" + IT('FileDirRef') + "), '/')), concat('MTG-', " + idstr("items('Each_clear_M')?['Id']") + ")))")),
                    ('Discussed_keys_M', {'type': 'Select', 'inputs': {'from': "@body('Discussed_M')", 'select': "@concat(string(" + IT('SourceType') + "), ':', " + idstr(IT('SourceId')) + ")"}}),
                    ('Cleared_M', query("@variables('varFlagAt')", "@and(contains(body('Discussed_keys_M'), first(split(item(), '='))), "
                                                                   "lessOrEquals(int(last(split(item(), '='))), int(" + idq("items('Each_clear_M')?['CutoffUpdatesId']") + ")))")),
                    ('Cleared_keys_M', {'type': 'Select', 'inputs': {'from': "@body('Cleared_M')", 'select': "@first(split(item(), '='))"}}),
                    ('Still_on_M', query('@' + ON, "@not(contains(body('Cleared_keys_M'), item()))")),
                    ('Set_still_on_M', set_var('varFlagOn', "@body('Still_on_M')")),
                    ('Still_at_M', query("@variables('varFlagAt')", "@not(contains(body('Cleared_keys_M'), first(split(item(), '='))))")),
                    ('Set_still_at_M', set_var('varFlagAt', "@body('Still_at_M')")),
                )}),
                # what the last finalised meeting deferred or did not reach comes back first: its frozen agenda rows (Release 5)
                ('Get_carried_M', http('GET', L('items', "/items?$select=Title,SourceType,SourceId,Outcome,FileDirRef&$filter=MeetingId eq @{" + idq(S + "?['PreviousMeetingId']")
                                                        + "} and RowType eq 'Agenda Item'&$top=5000"))),
                ('Carried_M', query("@body('Get_carried_M')?['value']", "@and(contains(createArray('Deferred', 'Not reached'), string(" + IT('Outcome') + ")), "
                                                                       "contains(createArray('Notice', 'Register Entry', 'New Business'), string(" + IT('SourceType') + ")), "
                                                                       "equals(last(split(string(" + IT('FileDirRef') + "), '/')), concat('MTG-', " + idstr(S + "?['PreviousMeetingId']") + ")))")),
                ('Carried_keys_M', {'type': 'Select', 'inputs': {'from': "@body('Carried_M')", 'select': "@concat(string(" + IT('SourceType') + "), ':', " + idstr(IT('SourceId')) + ")"}}),
                ('Sec4_src_M', query("@body('Sn_notices_here_M')", "@and(contains(" + ON + ", " + skey('Notice') + "), not(contains(" + CARRIED + ", " + skey('Notice') + ")))")),
                ('Sec5_src_M', query("@body('Sn_entries_here_M')", "@and(not(contains(" + CARRIED + ", " + skey('Register Entry') + ")), "
                                                                     "or(contains(" + ON + ", " + skey('Register Entry') + "), and(" + since('DateRaised') + ", " + by_cut('DateRaised') + ")))")),
                ('Sec5_ids_M', {'type': 'Select', 'inputs': {'from': "@body('Sec5_src_M')", 'select': '@' + idstr(IT('Id'))}}),
                ('Sec6_src_M', query("@body('Sn_entries_here_M')", "@and(equals(string(" + IT('EntryType') + "), 'Degradation'), contains(createArray('Open', 'Under Review'), string(" + IT('Status') + ")), "
                                                                     "not(contains(body('Sec5_ids_M'), " + idstr(IT('Id')) + ")), not(contains(" + CARRIED + ", " + skey('Register Entry') + ")))")),
                ('Get_dates_M', http('GET', L('cal', "/items?$select=Id,Title,StartTime,FileDirRef&$filter=IsImportant eq 1 and Status eq 'Scheduled'&$top=5000"))),
                ('Lookahead_M', query("@body('Get_settings_M')?['value']", "@equals(" + IT('Title') + ", 'AgendaLookaheadDays')")),
                ('Cut_day_M', compose("@convertFromUtc(" + CUT + ", 'GMT Standard Time', 'yyyy-MM-dd')")),
                ('Last_day_M', compose("@formatDateTime(addDays(concat(outputs('Cut_day_M'), 'T00:00:00Z'), int(if(empty(" + idstr(look) + "), '60', " + idstr(look) + "))), 'yyyy-MM-dd')")),
                ('Sec7_src_M', query("@body('Get_dates_M')?['value']", "@and(" + here + ", greaterOrEquals(int(convertFromUtc(string(coalesce(" + IT('StartTime') + ", '2000-01-01T00:00:00Z')), "
                                                                       "'GMT Standard Time', 'yyyyMMdd')), " + day_num("outputs('Cut_day_M')") + "), lessOrEquals(int(convertFromUtc(string(coalesce("
                                                                       + IT('StartTime') + ", '2000-01-01T00:00:00Z')), 'GMT Standard Time', 'yyyyMMdd')), " + day_num("outputs('Last_day_M')") + "))")),
                section('Sec1_M', "body('Sn_open_here_M')", 'Open actions', 1, 'Action', dict(action_fields, AgendaMarker="@{if(" + since('DateRaised') + ", 'Raised since last meeting', 'Still open')}")),
                section('Sec2_M', "body('Sn_closed_here_M')", 'Closed since last meeting', 2, 'Action',
                        dict(action_fields, SnapshotDateClosed='@{' + date_text('DateClosed') + '}', SnapshotDetails="@{coalesce(" + IT('CloseOutcome') + ", '')}")),
                section('Sec3_M', "body('Carried_M')", 'Carried forward', 3, None, {'AgendaMarker': 'Carried forward'}, typ_expr="string(" + IT('SourceType') + ")", id_col='SourceId'),
                section('Sec4_M', "body('Sec4_src_M')", 'Noticeboard', 4, 'Notice'),
                section('Sec5_M', "body('Sec5_src_M')", 'New improvements and degradations', 5, 'Register Entry', entry_fields),
                section('Sec6_M', "body('Sec6_src_M')", 'Unresolved degradations', 6, 'Register Entry', entry_fields),
                section('Sec7_M', "body('Sec7_src_M')", 'Important dates', 7, 'Date', {'SnapshotDetails': '@{' + date_text('StartTime') + '}'}),
                ('Rows_M', compose("@union(body('Sec1_M'), body('Sec2_M'), body('Sec3_M'), body('Sec4_M'), body('Sec5_M'), body('Sec6_M'), body('Sec7_M'))")),
                ('Get_agenda_M', http('GET', L('items', "/items?$select=RowKey&$filter=MeetingId eq @{" + MID + "} and RowType eq 'Agenda Item'&$top=5000"))),
                ('Agenda_keys_M', {'type': 'Select', 'inputs': {'from': "@body('Get_agenda_M')?['value']", 'select': "@string(" + IT('RowKey') + ")"}}),
                ('Each_row_M', {'type': 'Foreach', 'foreach': "@outputs('Rows_M')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                    ('Row_new_M', cond("@not(contains(body('Agenda_keys_M'), string(" + R_ + "?['key'])))", seq(
                        ('Agenda_values_M', compose("@" + R_ + "?['fields']")),
                        ('Agenda_body_M', items_values),
                        ('Agenda_row_M', items_call),
                        *created_ok('Agenda_row_M', 'Agenda_made_M', 'An agenda row could not be created. See Agenda_row_M.'),
                    ))),
                )}),
                *event('_MS', "concat('Meeting started: ', string(length(outputs('Rows_M'))), ' agenda items')", 'Meeting Started'),
                *done('_MS', "concat('Meeting started. The agenda is fixed with ', string(length(outputs('Rows_M'))), ' items.')"),
            )

        def frozen_row(c, key_expr, fields, keys_step):
            """A row of the frozen record in MTG-{id}, made once: found by its key among the rows read after locking."""
            values, call = create_in_folder('items', MTG_PATH, 'Frozen_values' + c, 'Frozen_body' + c)
            f = dict({'RowKey': '@{' + key_expr + '}', 'MeetingId': '@{' + MID + '}'}, **fields)
            return [('Need_frozen' + c, cond("@not(contains(body('" + keys_step + "'), " + key_expr + "))", seq(
                ('Frozen_values' + c, form(f)),
                ('Frozen_body' + c, values),
                ('Frozen' + c, call),
                *created_ok('Frozen' + c, 'Frozen_made' + c, 'A row of the finalised record could not be created. See Frozen' + c + '.'),
            )))]

        # ---- finalise (spec MTG-4, plan F.7.4): lock, make the record read-only, then freeze what was recorded. If anything
        # is found missing once nothing can change any more, the meeting goes back to In progress and the folder reopens.
        PDF_ON = "not(equals(string(coalesce(first(body('Pdf_switch_M'))?['Value'], 'Yes')), 'No'))"
        ROWS = "body('Get_rows_MZ')?['value']"
        FA = "items('Each_freeze_MZ')"
        FN = "items('Each_nb_MZ')"
        FP = "items('Each_att_MZ')"
        FD = "items('Each_dec_MZ')"
        FS = "items('Each_raised_MZ')"
        LAST = lambda step: "last(body('" + step + "'))"
        latest = lambda step, key: (step, query("@body('Live_out_MZ')", "@equals(string(" + IT_('RecordKey') + "), " + key + ")"))
        finalise = seq(
            ('Pdf_switch_M', query("@body('Get_settings_M')?['value']", "@equals(item()?['Title'], 'PdfEnabled')")),
            ('Apply_lock_MZ', cond("@not(" + ALREADY + ")", seq(
                ('Lock_values_MZ', compose({'Status': 'Finalising', 'Revision': "@add(int(" + idq(M + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'})),
                ('Save_lock_MZ', merge(L('mtg', "/items(@{" + MID + "})"), 'Lock_values_MZ', if_match="@{" + M + "?['odata.etag']}")),
            ))),
            *reset_record('_MZ'),
            # from here nobody but the flow can change the record
            ('Get_rows_MZ', http('GET', L('items', rows_sel))),
            ('Row_keys_MZ', {'type': 'Select', 'inputs': {'from': '@' + ROWS, 'select': "@string(" + IT_('RowKey') + ")"}}),
            ('Live_out_MZ', query('@' + ROWS, "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'Outcome'))")),
            ('Agenda_rows_MZ', query('@' + ROWS, "@and(" + IN_MTG + ", equals(" + IT_('RowType') + ", 'Agenda Item'), not(empty(string(coalesce(" + IT_('SourceType') + ", '')))))")),
            ('Missing_start_MZ', set_var('varFinMissing', [])),
            # each agenda item takes the last outcome and notes recorded for it
            ('Each_freeze_MZ', {'type': 'Foreach', 'foreach': "@body('Agenda_rows_MZ')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                latest('Latest_MZ', out_key("string(" + FA + "?['SourceType'])", idstr(FA + "?['SourceId']"))),
                ('Freeze_due_MZ', cond("@and(not(empty(body('Latest_MZ'))), or(not(equals(string(coalesce(" + FA + "?['Outcome'], '')), string(coalesce(" + LAST('Latest_MZ') + "?['Outcome'], '')))), "
                                       "not(equals(string(coalesce(" + FA + "?['Notes'], '')), string(coalesce(" + LAST('Latest_MZ') + "?['Notes'], ''))))))", seq(
                    ('Freeze_values_MZ', compose({'Outcome': "@{coalesce(" + LAST('Latest_MZ') + "?['Outcome'], '')}", 'Notes': "@{coalesce(" + LAST('Latest_MZ') + "?['Notes'], '')}"})),
                    ('Save_freeze_MZ', merge(L('items', "/items(@{" + FA + "?['Id']})"), 'Freeze_values_MZ')),
                ))),
                ('Need_outcome_MZ', cond("@and(contains(" + DISC + ", string(" + FA + "?['Section'])), or(empty(body('Latest_MZ')), not(contains(" + ALLOWED + ", string(" + LAST('Latest_MZ') + "?['Outcome'])))))", seq(
                    ('Missing_add_MZ', {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varFinMissing', 'value': "@string(" + FA + "?['Title'])"}}),
                ))),
            )}),
            # new business added during the meeting becomes part of the agenda record
            ('Nb_rows_MZ', query('@' + ROWS, "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'New Business'), startsWith(string(" + IT_('RecordKey') + "), concat(" + MID + ", '|N|')))")),
            ('Each_nb_MZ', {'type': 'Foreach', 'foreach': "@body('Nb_rows_MZ')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                latest('Latest_nb_MZ', out_key("'New Business'", idstr(FN + "?['Id']"))),
                ('Nb_outcome_MZ', compose("@if(empty(body('Latest_nb_MZ')), '', string(coalesce(" + LAST('Latest_nb_MZ') + "?['Outcome'], '')))")),
                *frozen_row('_nb_MZ', "concat('F|', " + MID + ", '|A|New Business|', " + idstr(FN + "?['Id']") + ")", {
                    'Title': "@{take(string(" + FN + "?['Title']), 255)}", 'RowType': 'Agenda Item', 'Section': 'New business', 'SortOrder': '8',
                    'SourceType': 'New Business', 'SourceId': '@{' + idstr(FN + "?['Id']") + '}', 'Outcome': "@{outputs('Nb_outcome_MZ')}",
                    'Notes': "@{if(empty(body('Latest_nb_MZ')), '', coalesce(" + LAST('Latest_nb_MZ') + "?['Notes'], ''))}", 'SnapshotDetails': "@{coalesce(" + FN + "?['Notes'], '')}"}, 'Row_keys_MZ'),
                ('Nb_need_MZ', cond("@not(contains(" + ALLOWED + ", outputs('Nb_outcome_MZ')))", seq(
                    ('Nb_missing_MZ', {'type': 'AppendToArrayVariable', 'inputs': {'name': 'varFinMissing', 'value': "@string(" + FN + "?['Title'])"}}),
                ))),
            )}),
            # something changed between the check and the lock: back to In progress, the record folder open again
            ('Fin_complete_MZ', cond("@empty(variables('varFinMissing'))", None, seq(
                *grants('_MZ'),
                ('Back_values_MZ', compose({'Status': 'In Progress'})),
                ('Save_back_MZ', merge(L('mtg', "/items(@{" + MID + "})"), 'Back_values_MZ')),
                *tx_update('rolled_MZ', {'State': 'Rolled Back', 'LastError': "@{concat('Items without an outcome: ', join(variables('varFinMissing'), '; '))}"}),
                *finish_request('_MZ_back', 'Rejected', "concat('These items still need an outcome: ', join(take(variables('varFinMissing'), 10), '; '), '. The meeting is still in progress.')"),
                ('Done_back_MZ', terminate('Succeeded')),
            ))),
            # attendance as it stood, one row per person invited
            ('Each_att_MZ', {'type': 'Foreach', 'foreach': "@json(if(empty(string(coalesce(" + M + "?['Attendees'], ''))), '[]', string(" + M + "?['Attendees'])))",
                             'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                ('Att_live_MZ', query('@' + ROWS, "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'Attendee'), equals(string(" + IT_('RecordKey') + "), concat(" + MID + ", '|P|', " + idstr(FP) + ")))")),
                ('Att_person_MZ', query('@' + PEOPLE, "@equals(" + idstr(IT_('SiteUserId')) + ", " + idstr(FP) + ")")),
                *frozen_row('_att_MZ', "concat('F|', " + MID + ", '|P|', " + idstr(FP) + ")", {
                    'Title': "@{take(string(coalesce(first(body('Att_person_MZ'))?['Title'], 'Someone no longer listed')), 255)}", 'RowType': 'Attendee', 'Section': 'Attendance',
                    'SourceId': '@{' + idstr(FP) + '}', 'Attendance': "@{if(empty(body('Att_live_MZ')), '', coalesce(" + LAST('Att_live_MZ') + "?['Attendance'], ''))}"}, 'Row_keys_MZ'),
            )}),
            ('Dec_rows_MZ', query('@' + ROWS, "@and(" + IN_REC + ", equals(" + IT_('RowType') + ", 'Decision'), startsWith(string(" + IT_('RecordKey') + "), concat(" + MID + ", '|D|')))")),
            ('Each_dec_MZ', {'type': 'Foreach', 'foreach': "@body('Dec_rows_MZ')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                *frozen_row('_dec_MZ', "concat('F|', " + MID + ", '|D|', " + idstr(FD + "?['Id']") + ")", {
                    'Title': "@{take(string(" + FD + "?['Title']), 255)}", 'RowType': 'Decision', 'Section': 'Decisions and additional actions', 'SortOrder': '9',
                    'Notes': "@{coalesce(" + FD + "?['Notes'], '')}"}, 'Row_keys_MZ'),
            )}),
            # section 9: the actions raised from this meeting, as they stand now (later changes do not alter the minutes)
            ('Get_raised_MZ', http('GET', L('act', "/items?$select=Id,Title,AssignedToId,DueDay,Status,SourceType,SourceId,PendingRequestKey,CreatedRequestKey&$filter=SourceId eq @{" + MID + "}&$top=5000"))),
            ('Raised_MZ', query("@body('Get_raised_MZ')?['value']", "@and(equals(string(" + IT_('SourceType') + "), 'Meeting'), not(and(not(empty(string(coalesce(" + IT_('PendingRequestKey') + ", '')))), "
                                                                   "equals(string(" + IT_('CreatedRequestKey') + "), concat('F|', string(" + IT_('PendingRequestKey') + "))))))")),
            ('Each_raised_MZ', {'type': 'Foreach', 'foreach': "@body('Raised_MZ')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                *frozen_row('_s_MZ', "concat('F|', " + MID + ", '|S|', " + idstr(FS + "?['Id']") + ")", {
                    'Title': "@{take(string(" + FS + "?['Title']), 255)}", 'RowType': 'Agenda Item', 'Section': 'Decisions and additional actions', 'SortOrder': '9',
                    'SourceType': 'Action', 'SourceId': '@{' + idstr(FS + "?['Id']") + '}', 'SnapshotOwner': '@{' + idstr(FS + "?['AssignedToId']") + '}',
                    'SnapshotStatus': "@{" + FS + "?['Status']}", 'SnapshotDueDate': "@{if(empty(" + idstr(FS + "?['DueDay']") + "), '', " + uk_form_date(due_iso(FS + "?['DueDay']")) + ")}"}, 'Row_keys_MZ'),
            )}),
            ('Get_fin_now_MZ', http('GET', L('mtg', "/items(@{" + MID + "})?$select=Id,Status"))),
            ('Apply_final_MZ', cond("@not(equals(string(body('Get_fin_now_MZ')?['Status']), 'Finalised'))", seq(
                ('Final_values_MZ', compose({'Status': 'Finalised', 'FinalisedAt': '@{' + EVENT_TIME + '}', 'FinalisedById': '@int(' + SENDER + ')',
                                             'PdfState': "@{if(" + PDF_ON + ", 'Pending', 'None')}", 'PdfAttempts': 0, 'PdfVersion': 0})),
                ('Save_final_MZ', merge(L('mtg', "/items(@{" + MID + "})"), 'Final_values_MZ')),
            ))),
            *event('_MZ', "'Minutes finalised'", 'Meeting Finalised'),
            *done('_MZ', "if(" + PDF_ON + ", 'Minutes finalised. The record is now read-only, and the PDF is being made.', 'Minutes finalised. The record is now read-only.')"),
        )

        # ---- amend (spec MTG-5): an amendment is added to the frozen record; the original stays as it was
        AMEND_KEY = "concat('F|', " + MID + ", '|M|', " + KEY + ")"
        amend = seq(
            ('Pdf_switch_MA', query("@body('Get_settings_M')?['value']", "@equals(item()?['Title'], 'PdfEnabled')")),
            ('Find_amend_MA', http('GET', L('items', "/items?$select=Id,RowKey&$filter=RowKey eq '@{" + esc("replace(" + AMEND_KEY + ", '|', '%7C')") + "}'"))),
            ('Amend_keys_MA', {'type': 'Select', 'inputs': {'from': "@body('Find_amend_MA')?['value']", 'select': "@string(item()?['RowKey'])"}}),
            *frozen_row('_MA', AMEND_KEY, {
                'Title': "@{take(concat('Amendment ', string(add(int(" + idq(M + "?['AmendmentCount']") + "), 1)), ' by ', string(" + ME + "?['Title'])), 255)}", 'RowType': 'Amendment', 'SortOrder': '10',
                'Notes': '@{' + TEXT('what') + '}', 'AmendmentReason': '@{' + TEXT('reason') + '}', 'AmendedBy': claims(ME)}, 'Amend_keys_MA'),
            ('Apply_amend_MA', cond("@not(" + ALREADY + ")", seq(
                ('Amend_values_MA', compose({'AmendmentCount': "@add(int(" + idq(M + "?['AmendmentCount']") + "), 1)",
                                             'PdfState': "@{if(not(equals(string(coalesce(first(body('Pdf_switch_MA'))?['Value'], 'Yes')), 'No')), 'Pending', 'None')}", 'PdfAttempts': 0,
                                             'Revision': "@add(int(" + idq(M + "?['Revision']") + "), 1)", 'LastRequestKey': '@{' + KEY + '}'})),
                ('Save_amend_MA', merge(L('mtg', "/items(@{" + MID + "})"), 'Amend_values_MA', if_match="@{" + M + "?['odata.etag']}")),
            ))),
            *event('_MA', "concat('Minutes amended: ', " + TEXT('reason') + ")", 'Meeting Amended', {'Note': '@{take(' + TEXT('reason') + ', 1000)}'}),
            *done('_MA', "'Amendment added. The original minutes are kept, and the amendment is shown with them.'"),
        )

        cases = ({'ScheduleMeeting': book, 'UpdateMeeting': update, 'CancelMeeting': cancel, 'StartMeeting': start_steps()} if domain == 'meetings'
                 else {'FinaliseMeeting': finalise, 'AmendMeeting': amend})
        return seq(*reads, *decide, ('Meeting_type', switch("@" + OWN, cases,
            reject('_MK', "'This kind of change is not recognised.'"))))

    def cleanup_switch():
        """Removing the test records before go-live (spec §7.4): every record marked as a test record, and any older
        one an administrator ticked, with everything that depends on it – History, comments and flags, requests, email
        rows, a meeting's folder and PDF minutes – goes to the recycle bin (recoverable for 93 days). An action that
        depends on a record being removed (raised from it, or linked to it) must be removed with it, or nothing is.
        What to remove is decided once and kept on the transaction, so a run that stops part-way finishes the same list.
        One audit event lists everything; then test marking is switched off."""
        sfx = '_X'
        IS_ADMIN = "and(equals(" + ME + "?['IsAdministrator'], true), equals(string(" + ME + "?['Status']), 'Active'))"
        TYPES = [('Action', 'act', ',SourceType,SourceId'), ('Notice', 'notices', ''), ('Register Entry', 'reg', ''), ('Meeting', 'mtg', ''), ('Feedback', 'fb', '')]
        code = {'Action': 'A', 'Notice': 'N', 'Register Entry': 'E', 'Meeting': 'M', 'Feedback': 'F'}
        INC = lambda t: "coalesce(" + P + "?['include']?['" + t + "'], json('[]'))"
        IT = lambda col: "item()?['" + col + "']"
        reads = []
        for t, key, extra in TYPES:
            c = code[t]
            ids_filter = ("if(empty(" + INC(t) + "), 'Id eq 0', join(body('Inc_ids_" + c + sfx + "'), ' or '))")
            reads += [
                ('Marked_' + c + sfx, http('GET', L(key, "/items?$select=Id,Title,FileDirRef" + extra + "&$filter=IsTestRecord eq 1&$top=5000"))),
                ('Inc_ids_' + c + sfx, {'type': 'Select', 'inputs': {'from': '@' + INC(t), 'select': "@concat('Id eq ', string(int(item())))"}}),
                ('Ticked_' + c + sfx, http('GET', L(key, "/items?$select=Id,Title,FileDirRef" + extra + "&$filter=@{" + ids_filter + "}&$top=500"))),
                ('Rows_' + c + sfx, compose("@union(body('Marked_" + c + sfx + "')?['value'], body('Ticked_" + c + sfx + "')?['value'])")),
                ('Sel_' + c + sfx, {'type': 'Select', 'inputs': {'from': "@outputs('Rows_" + c + sfx + "')", 'select': {
                    'type': t, 'id': "@int(" + idq(IT('Id')) + ")", 'title': "@string(coalesce(" + IT('Title') + ", ''))",
                    'area': "@last(split(string(" + IT('FileDirRef') + "), '/'))"}}}),
            ]
        ALL = "union(" + ", ".join("body('Sel_" + code[t] + sfx + "')" for t, _, _ in TYPES) + ")"
        KEYS = "body('Keys" + sfx + "')"
        # actions that depend on an entry or a meeting being removed
        SRC_IDS = "union(body('Src_e" + sfx + "'), body('Src_m" + sfx + "'))"
        dep_filter = "if(empty(" + SRC_IDS + "), 'SourceId eq 0', join(" + SRC_IDS + ", ' or '))"
        PLAN = "json(variables('varTxPlan'))?['records']"
        R = "items('Each_remove" + sfx + "')"
        T = "string(" + R + "?['type'])"
        ID = "string(" + R + "?['id'])"
        AREA = "string(" + R + "?['area'])"
        LIST_OF = ("if(equals(" + T + ", 'Action'), 'act', if(equals(" + T + ", 'Notice'), 'notices', if(equals(" + T + ", 'Register Entry'), 'reg', "
                   "if(equals(" + T + ", 'Meeting'), 'mtg', 'fb'))))")
        def recycle(name, uri, what):
            """Into the recycle bin; one already gone counts as done, anything else stops the run (it is tried again)."""
            return [(name, http('POST', uri)),
                    (name + '_ok', after(cond("@or(equals(actions('" + name + "')?['status'], 'Succeeded'), equals(outputs('" + name + "')?['statusCode'], 404))", None,
                                              seq((name + '_stop', fail_here(what + ' could not be moved to the recycle bin. See ' + name + '.')))), {name: TOLERANT}))]
        def each_dep(step, list_key, rows_expr):
            E = "items('Each_" + step + sfx + "')"
            return ('Each_' + step + sfx, {'type': 'Foreach', 'foreach': '@' + rows_expr, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                *recycle('Bin_' + step + sfx, L(list_key, "/items(@{" + idq(E + "?['Id']") + "})/recycle"), 'A related row'))})
        folder = lambda root, leaf: "_api/web/GetFolderByServerRelativePath(decodedurl='@{outputs('Ids')?['" + root + "']}/@{" + AREA + "}/" + leaf + "')/recycle"
        LISTING = "@{concat(string(length(" + PLAN + ")), ' records')}"
        lines = "body('Lines" + sfx + "')"
        ev_key = "concat(" + KEY + ", '|1')"
        ev_values, ev_call = create_in_folder('hist', "@{outputs('Ids')?['histRoot']}/Administration", 'X_event_values' + sfx, 'X_event_body' + sfx)
        CONFIRM = "trim(string(coalesce(" + P + "?['confirm'], '')))"
        TESTING = "first(body('Testing_row" + sfx + "'))"
        return seq(
            ('Get_settings' + sfx, http('GET', L('settings', "/items?$select=Id,Title,Value&$top=500"))),
            ('Testing_row' + sfx, query("@body('Get_settings" + sfx + "')?['value']", "@equals(item()?['Title'], 'PreGoLiveTesting')")),
            ('Decide' + sfx, cond('@' + UNDECIDED, seq(
                *reads,
                ('Keys' + sfx, {'type': 'Select', 'inputs': {'from': '@' + ALL, 'select': "@concat(string(" + IT('type') + "), ':', string(" + IT('id') + "))"}}),
                ('Src_e' + sfx, {'type': 'Select', 'inputs': {'from': "@body('Sel_E" + sfx + "')", 'select': "@concat('SourceId eq ', string(" + IT('id') + "))"}}),
                ('Src_m' + sfx, {'type': 'Select', 'inputs': {'from': "@body('Sel_M" + sfx + "')", 'select': "@concat('SourceId eq ', string(" + IT('id') + "))"}}),
                ('Get_dependent' + sfx, http('GET', L('act', "/items?$select=Id,Title,SourceType,SourceId&$filter=@{" + dep_filter + "}&$top=5000"))),
                ('Left_behind' + sfx, query("@body('Get_dependent" + sfx + "')?['value']", "@and(or(and(equals(" + IT('SourceType') + ", 'Register'), contains(" + KEYS + ", concat('Register Entry:', "
                                                                                       + idstr(IT('SourceId')) + "))), and(equals(" + IT('SourceType') + ", 'Meeting'), contains(" + KEYS + ", concat('Meeting:', "
                                                                                       + idstr(IT('SourceId')) + ")))), not(contains(" + KEYS + ", concat('Action:', " + idstr(IT('Id')) + "))))")),
                ('Left_titles' + sfx, {'type': 'Select', 'inputs': {'from': "@body('Left_behind" + sfx + "')", 'select': "@concat('ACT-', string(" + idstr(IT('Id')) + "), ' ', string(" + IT('Title') + "))"}}),
                ('Verdict_base' + sfx, compose('@' + chain(
                    ("not(" + IS_ADMIN + ")", 'Only a Competency Hub administrator can do this.'),
                    ("not(equals(" + CONFIRM + ", 'REMOVE TEST DATA'))", 'Type REMOVE TEST DATA to confirm.'),
                    ("or(empty(" + TESTING + "), not(equals(string(" + TESTING + "?['Value']), 'Yes')))", 'Test marking is already off: the Hub is live, so nothing is removed this way.')))),
                ('Verdict' + sfx, compose("@if(not(empty(outputs('Verdict_base" + sfx + "'))), outputs('Verdict_base" + sfx + "'), if(empty(body('Left_behind" + sfx + "')), '', "
                                          "concat('These actions depend on records being removed. Include them too: ', join(take(body('Left_titles" + sfx + "'), 10), '; '), '.')))")),
                ('Decided' + sfx, cond("@empty(outputs('Verdict" + sfx + "'))", seq(
                    ('Plan' + sfx, compose({'records': '@' + ALL})),
                    *tx_update('planned' + sfx, {'State': 'Planned', 'StepsDone': 'DECIDED', 'PreviousValue': "@{string(outputs('Plan" + sfx + "'))}"}),
                    ('Plan_kept' + sfx, set_var('varTxPlan', "@{string(outputs('Plan" + sfx + "'))}")),
                ), reject(sfx, "outputs('Verdict" + sfx + "')"))),
            ))),
            ('Each_remove' + sfx, {'type': 'Foreach', 'foreach': '@' + PLAN, 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                ('Dep_hist' + sfx, http('GET', L('hist', "/items?$select=Id,RecordType&$filter=RecordId eq @{" + ID + "}&$top=5000"))),
                ('Dep_upd' + sfx, http('GET', L('upd', "/items?$select=Id,ParentType&$filter=ParentId eq @{" + ID + "}&$top=5000"))),
                ('Dep_req' + sfx, http('GET', L('req', "/items?$select=Id,TargetType&$filter=TargetId eq @{" + ID + "}&$top=5000"))),
                ('Dep_mail' + sfx, http('GET', L('notif', "/items?$select=Id,RecordType&$filter=RecordId eq @{" + ID + "}&$top=5000"))),
                ('Rows_hist' + sfx, query("@body('Dep_hist" + sfx + "')?['value']", "@equals(string(" + IT('RecordType') + "), " + T + ")")),
                ('Rows_upd' + sfx, query("@body('Dep_upd" + sfx + "')?['value']", "@equals(string(" + IT('ParentType') + "), " + T + ")")),
                ('Rows_req' + sfx, query("@body('Dep_req" + sfx + "')?['value']", "@equals(string(" + IT('TargetType') + "), " + T + ")")),
                ('Rows_mail' + sfx, query("@body('Dep_mail" + sfx + "')?['value']", "@equals(string(" + IT('RecordType') + "), " + T + ")")),
                each_dep('hist', 'hist', "body('Rows_hist" + sfx + "')"),
                each_dep('upd', 'upd', "body('Rows_upd" + sfx + "')"),
                each_dep('req', 'req', "body('Rows_req" + sfx + "')"),
                each_dep('mail', 'notif', "body('Rows_mail" + sfx + "')"),
                ('Meeting_parts' + sfx, cond("@equals(" + T + ", 'Meeting')", seq(
                    ('Dep_items' + sfx, http('GET', L('items', "/items?$select=Id&$filter=MeetingId eq @{" + ID + "}&$top=5000"))),
                    each_dep('item', 'items', "body('Dep_items" + sfx + "')?['value']"),
                    ('Dep_pdfs' + sfx, http('GET', "_api/web/GetFolderByServerRelativePath(decodedurl='@{outputs('Ids')?['minutesRoot']}/@{" + AREA + "}')/Files?$select=Name,ServerRelativeUrl")),
                    ('Pdfs' + sfx, query("@coalesce(body('Dep_pdfs" + sfx + "')?['value'], json('[]'))", "@startsWith(string(" + IT('Name') + "), concat('MTG-', " + ID + ", '-v'))")),
                    ('Each_pdf' + sfx, {'type': 'Foreach', 'foreach': "@body('Pdfs" + sfx + "')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
                        *recycle('Bin_pdf' + sfx, "_api/web/GetFileByServerRelativePath(decodedurl='@{items('Each_pdf" + sfx + "')?['ServerRelativeUrl']}')/recycle", 'A PDF of the minutes'))}),
                    *recycle('Bin_mtg_folder' + sfx, folder('itemsRoot', "MTG-@{" + ID + "}"), 'The meeting\'s folder'),
                ))),
                ('Action_folders' + sfx, cond("@equals(" + T + ", 'Action')", seq(
                    *recycle('Bin_upd_folder' + sfx, folder('updRoot', "A@{" + ID + "}"), 'The action\'s updates folder'),
                    *recycle('Bin_hist_folder' + sfx, folder('histRoot', "A@{" + ID + "}"), 'The action\'s history folder'),
                ))),
                *recycle('Bin_record' + sfx, "_api/web/GetList('@{outputs('Ids')?[" + LIST_OF + "]}')/items(@{" + ID + "})/recycle", 'The record'),
            )}),
            ('Lines' + sfx, {'type': 'Select', 'inputs': {'from': '@' + PLAN, 'select': "@concat(string(" + IT('type') + "), ' ', string(" + IT('id') + "), ': ', string(" + IT('title') + "))"}}),
            ('Find_x_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('Need_x_event' + sfx, cond("@empty(body('Find_x_event" + sfx + "')?['value'])", seq(
                ('X_event_values' + sfx, form({'Title': "@{concat('Test records removed: ', string(length(" + PLAN + ")))}", 'RowKind': 'Event', 'RequestKey': '@{' + ev_key + '}',
                                               'RecordType': 'System', 'RecordId': '0', 'EventType': 'Test Records Removed', 'RequestType': 'RemoveTestRecords',
                                               'Note': "@{take(join(" + lines + ", '; '), 60000)}"})),
                ('X_event_body' + sfx, ev_values),
                ('X_event' + sfx, ev_call),
                *created_ok('X_event' + sfx, 'X_event_made' + sfx, 'The audit event could not be created. See X_event' + sfx + '.'),
            ))),
            ('Get_x_event' + sfx, http('GET', L('hist', "/items?$select=Id&$filter=RequestKey eq '@{" + esc(ev_key) + "}'"))),
            ('X_event_details' + sfx, compose({'ActorId': '@int(' + SENDER + ')', 'EventTime': '@{' + EVENT_TIME + '}', 'ProcessedAt': '@{utcNow()}'})),
            ('Save_x_event' + sfx, merge(L('hist', "/items(@{first(body('Get_x_event" + sfx + "')?['value'])?['Id']})"), 'X_event_details' + sfx)),
            ('Testing_off' + sfx, cond("@and(not(empty(" + TESTING + ")), not(equals(string(" + TESTING + "?['Value']), 'No')))", seq(
                ('Testing_value' + sfx, compose({'Value': 'No'})),
                ('Save_testing' + sfx, merge(L('settings', "/items(@{" + TESTING + "?['Id']})"), 'Testing_value' + sfx)),
            ))),
            *tx_update('applied' + sfx, {'State': 'Applied', 'ProcessedAt': '@{utcNow()}'}),
            *finish_request(sfx, 'Completed', "concat(string(length(" + PLAN + ")), ' test records removed, with everything that depended on them. They stay in the recycle bin for 93 days. Test marking is now off.')"),
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
        ('Get_requester', http('GET', L('people', "/items?$select=Id,Title,KnownAs,SiteUserId,Role,Status,IsAdministrator,Email,Person/Name,Person/EMail&$expand=Person&$filter=SiteUserId eq @{" + esc(SENDER) + "}"))),
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
                         # the name a person is known by: an administrator's change that alters nobody's access, handled here
                         # because Administration is at Power Automate's limit of 500 steps
                         seq(('Known_as', cond("@equals(string(" + TX + "?['RequestType']), 'SetKnownAs')", known_as_switch(),
                                               reject('_K', "'This kind of change is not recognised.'")))))
         if domain == 'actions' else scope(records_switch()) if domain == 'records' else scope(meetings_switch()) if domain in ('meetings', 'minutes') else
         scope(cleanup_switch()) if domain == 'cleanup' else
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
                  ('Initialize_varEntry', init_var('varEntry', 'object', {})),
                  ('Initialize_varSrcMtg', init_var('varSrcMtg', 'object', {})),
                  ('Initialize_varSrcNotice', init_var('varSrcNotice', 'object', {})),
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
                  ('Initialize_varNoticeList', init_var('varNoticeList', 'array', [])),
                  *([('Initialize_varMtg', init_var('varMtg', 'object', {})), ('Initialize_varFlagOn', init_var('varFlagOn', 'array', [])), ('Initialize_varFlagBy', init_var('varFlagBy', 'array', [])),
                      ('Initialize_varFlagAt', init_var('varFlagAt', 'array', [])),
                      ('Initialize_varFinCheck', init_var('varFinCheck', 'string', '')), ('Initialize_varFinMissing', init_var('varFinMissing', 'array', []))] + PDF_VARS + INVITE_VARS
                    if domain in ('meetings', 'minutes') else []))
    if domain == 'minutes':
        # 7 Minutes did not start reliably from the Requests trigger on the site (25 Oct 2026), so it runs on a timer:
        # every 5 minutes it looks for the oldest finalise or amend request still waiting, and stops at once if none.
        site_path = "if(endsWith(uriPath(" + SITE + "), '/'), take(uriPath(" + SITE + "), sub(length(uriPath(" + SITE + ")), 1)), uriPath(" + SITE + "))"
        pick = seq(
            ('Find_work', http('GET', "_api/web/GetList('@{" + site_path + "}/Lists/" + BY_KEY[LIST_URLS['req']]['url'] + "')/items"
                                      "?$select=ID,Id,RequestType,Status,FileDirRef&$filter=Status eq 'Submitted'&$orderby=ID&$top=500")),
            ('Waiting_minutes', query("@body('Find_work')?['value']", "@contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['minutes']) +
                                       "), string(item()?['RequestType']))")),
            ('Any_waiting', cond("@empty(body('Waiting_minutes'))", seq(('Nothing_waiting', terminate('Succeeded'))))),
            ('Initialize_varPick', init_var('varPick', 'object', "@first(body('Waiting_minutes'))")))
        first = list(actions)[0]
        actions[first] = dict(actions[first], runAfter={'Initialize_varPick': OK})
        actions = dict(pick, **actions)
    actions['Try'] = after(scope(try_actions), {list(actions)[-1]: OK})
    # emails for a change that is complete: a failure here never touches the request, and the daily run retries
    actions['Send_emails'] = after(scope(send_outbox_steps('')), {'Try': OK})
    # this flow is working again: if the monitor marked its part of processing as stopped, say it has recovered
    # (the app's banner goes at once, not at the monitor's next full run)
    part, why = {'actions': ('state', 'reason'), 'admin': ('admin', 'adminReason'), 'cleanup': ('admin', 'adminReason'),
                 'records': ('records', 'recordsReason'), 'meetings': ('meetings', 'meetingsReason'), 'minutes': ('meetings', 'meetingsReason')}[domain]
    HEALTH_ROW = "first(body('Health_now')?['value'])"
    HEALTH = "outputs('Health_was')"
    actions['Health_back'] = after(scope(seq(
        ('Health_now', http('GET', L('settings', "/items?$select=Id,Title,Value&$filter=Title eq 'QueueHealth'"))),
        ('Health_was', compose("@json(if(empty(string(coalesce(" + HEALTH_ROW + "?['Value'], ''))), '{}', string(" + HEALTH_ROW + "?['Value'])))")),
        ('Health_down', cond("@equals(string(coalesce(" + HEALTH + "?['" + part + "'], '')), 'Down')", seq(
            ('Health_fixed', compose({'Value': "@{string(setProperty(setProperty(" + HEALTH + ", '" + part + "', 'Healthy'), '" + why + "', ''))}"})),
            ('Save_health', merge(L('settings', "/items(@{" + HEALTH_ROW + "?['Id']})"), 'Health_fixed')),
        ))),
    )), {'Try': OK})
    if domain == 'meetings':
        # the Outlook invitation, once the meeting change is recorded: a failure here never touches the meeting,
        # and the queue monitor tries again (spec §5.4)
        actions['Send_invitation'] = after(scope(seq(('Invitation_due', cond(
            "@and(greater(variables('varActionId'), 0), contains(createArray('ScheduleMeeting', 'UpdateMeeting', 'CancelMeeting'), string(variables('varTx')?['RequestType'])))",
            seq(*invite_steps('', "variables('varActionId')")))))), {'Try': OK})
    if domain == 'minutes':
        # the PDF minutes, once finalising or an amendment is recorded: a failure here never touches the minutes,
        # and the queue monitor tries again (spec §5.4)
        actions['Make_pdf'] = after(scope(seq(('Pdf_due_now', cond(
            "@and(greater(variables('varActionId'), 0), contains(createArray('FinaliseMeeting', 'AmendMeeting'), string(variables('varTx')?['RequestType'])))",
            seq(*pdf_steps('', "variables('varActionId')")))))), {'Try': OK})
    actions['Catch'] = catch
    others = [t for d, types in DOMAIN_TYPES.items() if d != domain for t in types]
    mine = ("@not(contains(createArray(" + ", ".join(q(x) for x in others) + "), string(triggerBody()?['RequestType'])))" if domain == 'actions'
            else "@contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES[domain]) + "), string(triggerBody()?['RequestType']))")
    if domain == 'minutes':
        return definition({'Every_5_minutes': {'type': 'Recurrence', 'recurrence': {'frequency': 'Minute', 'interval': 5},
                                               'runtimeConfiguration': {'concurrency': {'runs': 1}}}}, actions)
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
    actions['Send_emails'] = after(scope(send_outbox_steps('')), {'Try': OK})
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
    ADMIN_TYPE = "contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['admin'] + DOMAIN_TYPES['cleanup']) + "), string(" + S + "?['RequestType']))"
    RECORD_TYPE = "contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['records']) + "), string(" + S + "?['RequestType']))"
    MEETING_TYPE = "contains(createArray(" + ", ".join(q(x) for x in DOMAIN_TYPES['meetings'] + DOMAIN_TYPES['minutes']) + "), string(" + S + "?['RequestType']))"
    # decided once, then carried out step by step: part-made as soon as it was decided
    DECIDED_TYPE = "contains(createArray(" + ", ".join(q(x) for x in DECIDED_TYPES) + "), string(" + S + "?['RequestType']))"
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
                ('Which_flow_down', cond("@" + ADMIN_TYPE, seq(('Mark_admin_down', set_var('varAdminDown', True))),
                                         seq(('Records_or_actions', cond("@" + RECORD_TYPE, seq(('Mark_records_down', set_var('varRecordsDown', True))),
                                                                         seq(('Meetings_or_actions', cond("@" + MEETING_TYPE, seq(('Mark_meetings_down', set_var('varMeetingsDown', True))),
                                                                                                          seq(('Mark_down', set_var('varDown', True))))))))))),
            ))),
            # three attempts, or a request that never got as far as its transaction after three tries
            ('Give_up', cond("@or(and(not(empty(" + TXM + ")), not(" + FINAL_M + "), greaterOrEquals(" + ATTEMPTS + ", 3)), "
                             "and(empty(" + TXM + "), not(equals(" + S + "?['Status'], 'Submitted')), greaterOrEquals(int(" + idq(S + "?['Attempts']") + "), 3)))", seq(
                # part-made: an administration change once it was decided (it may have changed groups already);
                # an action change when the action carries it: its lock (or, for a raise, the action exists)
                ('Part_unknown', set_var('varPart', False)),
                ('Find_part', cond("@empty(" + TXM + ")", None, seq(('Part_by_type', cond("@" + DECIDED_TYPE, seq(
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
                ('Attention_req', compose({'Status': 'Needs attention', 'ResultMessage': "@{if(" + PART + ", if(" + DECIDED_TYPE + ", " + q(partly_admin) + ", " + q(partly) + "), " + q(nothing) + ")}"})),
                ('Save_attention_req', merge(req_item, 'Attention_req')),
                alert_if('Attention_alert', 'true', "concat('request|', string(" + S + "?['Id']))",
                         "concat('A change could not be recorded: ', string(" + S + "?['Title']))",
                         "concat('It was sent by ', " + ASKER + ", ' on ', " + uk_when(S + "?['Created']") + ", ' and tried 3 times. ', if(" + PART + ", if(" + DECIDED_TYPE + ", "
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
        # Outlook invitations left part-way (spec §5.4): tried again, at most 3 times, then the administrators are told
        # (one query for both: invitations left part-way and PDF minutes still to make)
        ('Get_inv', http('GET', L('mtg', "/items?$select=Id,Title,InviteState,InviteAttempts,InviteError,PdfState,PdfAttempts,Modified,MeetingDate&$filter="
                                           + " or ".join(["InviteState eq '" + st + "'" for st in ('Creating', 'Updating', 'Cancelling', 'Unknown', 'Failed')]
                                                         + ["PdfState eq '" + st + "'" for st in ('Pending', 'Failed')]) + "&$top=5000"))),
        ('Inv_all', query("@body('Get_inv')?['value']", "@contains(" + INVITE_PENDING + ", string(coalesce(item()?['InviteState'], 'None')))")),
        ('Inv_retry', query("@body('Inv_all')", "@and(less(int(" + idq("item()?['InviteAttempts']") + "), 3), " + older('Modified', 10) + ")")),
        ('Each_invite', {'type': 'Foreach', 'foreach': "@body('Inv_retry')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}},
                         'actions': seq(*invite_steps('_v', "items('Each_invite')?['Id']"))}),
        ('Inv_given_up', query("@body('Inv_all')", "@greaterOrEquals(int(" + idq("item()?['InviteAttempts']") + "), 3)")),
        ('Each_invite_failed', {'type': 'Foreach', 'foreach': "@body('Inv_given_up')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            alert_if('Invite_alert', 'true', "concat('invite|', string(items('Each_invite_failed')?['Id']))",
                     "concat('A meeting invitation could not be sent: ', string(items('Each_invite_failed')?['Title']))",
                     "concat('The Outlook invitation for this meeting failed 3 times. The meeting itself stands, and people can add it to their calendar from the Hub. ', "
                     "'Last error: ', string(coalesce(items('Each_invite_failed')?['InviteError'], 'none recorded')), ' In Power Automate, check the Outlook connection of the ESG Competency Hub flows. ', "
                     "'To try again, change the meeting in the Hub.')"),
        )}),
        # PDF minutes still to make (spec §5.4): tried again, at most 3 times, then the administrators are told; the minutes stand
        ('Pdf_all', query("@body('Get_inv')?['value']", "@contains(createArray('Pending', 'Failed'), string(coalesce(item()?['PdfState'], 'None')))")),
        ('Pdf_retry', query("@body('Pdf_all')", "@and(less(int(" + idq("item()?['PdfAttempts']") + "), 3), " + older('Modified', 10) + ")")),
        ('Each_pdf', {'type': 'Foreach', 'foreach': "@body('Pdf_retry')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}},
                      'actions': seq(*pdf_steps('_p', "items('Each_pdf')?['Id']"))}),
        ('Pdf_given_up', query("@body('Pdf_all')", "@and(equals(string(item()?['PdfState']), 'Failed'), greaterOrEquals(int(" + idq("item()?['PdfAttempts']") + "), 3))")),
        ('Each_pdf_failed', {'type': 'Foreach', 'foreach': "@body('Pdf_given_up')", 'runtimeConfiguration': {'concurrency': {'repetitions': 1}}, 'actions': seq(
            alert_if('Pdf_alert', 'true', "concat('pdf|', string(items('Each_pdf_failed')?['Id']))",
                     "concat('The PDF minutes could not be made: ', string(items('Each_pdf_failed')?['Title']))",
                     "concat('The PDF of these finalised minutes failed 3 times. The minutes themselves are finalised and can be read and printed in the Hub. ', "
                     "'In Power Automate, look at the run history of ESG Competency Hub | 5 Meetings or 3 Queue monitor, and check the OneDrive connection. ', "
                     "'If OneDrive conversion is not allowed, set PDF minutes to No under Administration, Settings.')"),
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
                                  # notices and the register have their own flow: when only that one is behind, actions carry on
                                  'records': "@{if(variables('varRecordsDown'), 'Down', 'Healthy')}",
                                  'recordsReason': "@{if(variables('varRecordsDown'), 'Changes to notices and the register are not being picked up by ESG Competency Hub | 4 Records.', '')}",
                                  'meetings': "@{if(variables('varMeetingsDown'), 'Down', 'Healthy')}",
                                  'meetingsReason': "@{if(variables('varMeetingsDown'), 'Meeting bookings, changes or minutes are not being picked up by ESG Competency Hub | 5 Meetings or 7 Minutes.', '')}",
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
                  ('Initialize_varRecordsDown', init_var('varRecordsDown', 'boolean', False)),
                  ('Initialize_varMeetingsDown', init_var('varMeetingsDown', 'boolean', False)),
                  ('Initialize_varPart', init_var('varPart', 'boolean', False)),
                  *INVITE_VARS, *PDF_VARS)
    actions['Try'] = after(scope(try_actions), {list(actions)[-1]: OK})
    actions['Send_emails'] = after(scope(send_outbox_steps('')), {'Try': OK})
    actions['Catch'] = after(scope(seq(('Terminate_failed', terminate('Failed', 'The queue monitor failed. See the failed action in the run history.')))),
                             {'Try': FAILED})
    triggers = {'Every_15_minutes': {
        'type': 'Recurrence',
        'recurrence': {'frequency': 'Minute', 'interval': 15, 'startTime': '2026-10-01T00:00:00', 'timeZone': 'GMT Standard Time'},
        'runtimeConfiguration': {'concurrency': {'runs': 1}}}}
    return definition(triggers, actions)



def flow_probe_invitations():
    """Probe P-INV (spec §5.4), run by hand once, before invitations are relied on. On the flow account's calendar it
    makes a TEST event for tomorrow with the given attendee, moves it an hour, finds it again by its hidden reference,
    and cancels it. Each step's result is recorded, whatever the others do; the run's last step lists them all."""
    TOKEN = "outputs('Probe_reference')"
    day = "formatDateTime(addDays(convertFromUtc(utcNow(), 'GMT Standard Time'), 1), 'yyyy-MM-dd')"
    attendees = "@concat(string(triggerBody()?['text']), ';', string(coalesce(body('Probe_me')?['Email'], '')))"
    item = lambda start, end: {'table': 'Calendar', 'item/subject': 'TEST – ESG Competency Hub invitation probe',
                               'item/start': "@concat(" + day + ", 'T" + start + ":00')", 'item/end': "@concat(" + day + ", 'T" + end + ":00')",
                               'item/timeZone': OUTLOOK_TZ, 'item/requiredAttendees': attendees,
                               'item/body': "@concat('<p>A test of the ESG Competency Hub meeting invitations. Please ignore it; it is cancelled straight away.</p><p>Reference ', " + TOKEN + ", '</p>')",
                               'item/importance': 'normal', 'item/showAs': 'free', 'item/responseRequested': False}
    status = lambda step: "@{actions('" + step + "')?['status']}"
    actions = seq(
        *site_and_ids(),
        ('Probe_me', http('GET', '_api/web/currentuser?$select=Id,Email')),
        ('Probe_reference', compose("@concat('ESGPINV', take(replace(guid(), '-', ''), 10))")),
        ('Probe_create', outlook('V4CalendarPostItem', item('12:00', '12:15'))),
        ('Probe_update', after(outlook('V4CalendarPatchItem', dict(item('13:00', '13:15'), id="@{body('Probe_create')?['id']}")), {'Probe_create': TOLERANT})),
        ('Probe_search', after(outlook('GetEventsCalendarViewV3', {
            'calendarId': 'Calendar', 'search': '@' + TOKEN,
            'startDateTimeUtc': "@formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:ss')", 'endDateTimeUtc': "@formatDateTime(addDays(utcNow(), 3), 'yyyy-MM-ddTHH:mm:ss')"}),
            {'Probe_update': TOLERANT})),
        ('Probe_found', after(query("@if(equals(actions('Probe_search')?['status'], 'Succeeded'), coalesce(body('Probe_search')?['value'], json('[]')), json('[]'))",
                                    "@contains(string(coalesce(item()?['body'], '')), " + TOKEN + ")"), {'Probe_search': TOLERANT})),
        ('Probe_cancel', after(outlook('CalendarDeleteItem_V2', {'calendar': 'Calendar', 'event': "@{body('Probe_create')?['id']}"}), {'Probe_found': TOLERANT})),
        ('Probe_results', after(compose({
            'reference': '@{' + TOKEN + '}', 'create': status('Probe_create'), 'update': status('Probe_update'), 'search': status('Probe_search'),
            'foundByReference': "@equals(length(body('Probe_found')), 1)", 'organiser': "@{body('Probe_create')?['organizer']}", 'cancel': status('Probe_cancel'),
            'next': 'Check that the attendee received the invitation, the update and the cancellation, and that you are the organiser. Send these results.'}),
            {'Probe_cancel': TOLERANT})),
    )
    triggers = {'manual': {'type': 'Request', 'kind': 'Button', 'inputs': {'schema': {
        'type': 'object', 'required': ['text'],
        'properties': {'text': {'title': 'Attendee email', 'type': 'string', 'x-ms-dynamically-added': True,
                                'description': 'The test colleague who should receive the invitation, its update and its cancellation',
                                'x-ms-content-hint': 'TEXT'}}}}}}
    return definition(triggers, actions)


def flow_probe_pdf():
    """Probe P-PDF (spec §5.4), run by hand once, before PDF minutes are relied on. It writes a sample minutes page to the
    flow account's OneDrive, converts it with Convert file (PDF), saves the PDF in the Meeting Minutes library and removes
    the working file. Running at all also shows that the data policy allows OneDrive with SharePoint and Outlook. Each
    step's result is recorded whatever the others do; the last step lists them all."""
    NAME = "outputs('Probe_name')"
    status = lambda step: "@{actions('" + step + "')?['status']}"
    sample = ('<!doctype html><html><head><meta charset="utf-8"><title>Minutes</title>' + PDF_STYLE + '</head><body>'
              '<h1>TEST – sample monthly meeting</h1><p>A test of the ESG Competency Hub PDF minutes. It can be deleted.</p>'
              '<h2>1. Open actions</h2><table><tr><th>Item</th><th>Outcome</th><th>Notes</th></tr>'
              '<tr><td>TEST action</td><td>Discussed</td><td>Sample notes &amp; a second line.</td></tr></table></body></html>')
    actions = seq(
        *site_and_ids(),
        ('Probe_name', compose("@concat('TEST-PDF-probe-', formatDateTime(utcNow(), 'yyyyMMdd-HHmmss'))")),
        ('Probe_html', onedrive('CreateFile', {'folderPath': '/', 'name': "@{concat(" + NAME + ", '.html')}", 'body': sample})),
        ('Probe_convert', after(onedrive('ConvertFile', {'id': "@{body('Probe_html')?['Id']}", 'type': 'PDF'}), {'Probe_html': TOLERANT})),
        ('Probe_save', after(sp_create_file('/' + BY_KEY['minutes']['url'], "@{concat(" + NAME + ", '.pdf')}", "@body('Probe_convert')"), {'Probe_convert': TOLERANT})),
        ('Probe_cleanup', after(onedrive('DeleteFile', {'id': "@{body('Probe_html')?['Id']}"}), {'Probe_save': TOLERANT})),
        ('Probe_results', after(compose({
            'workingFile': status('Probe_html'), 'convert': status('Probe_convert'), 'saveToMeetingMinutes': status('Probe_save'), 'removeWorkingFile': status('Probe_cleanup'),
            'file': "@{concat('Meeting Minutes/', " + NAME + ", '.pdf')}",
            'next': 'Open the Meeting Minutes library, open the TEST PDF and check it looks right, then delete it. Send these results.'}),
            {'Probe_cleanup': TOLERANT})),
    )
    triggers = {'manual': {'type': 'Request', 'kind': 'Button', 'inputs': {'schema': {'type': 'object', 'properties': {}, 'required': []}}}}
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
     'connectors': ['shared_sharepointonline', 'shared_office365', 'shared_onedriveforbusiness'], 'on': False,
     'description': 'Every 15 minutes in working hours and hourly outside them: puts stalled changes back in the queue, retries emails, '
                    'tells the administrators about anything that needs them, and records whether processing is healthy.',
     'introduced': '1.3.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f04', 'name': 'ESG Competency Hub | 4 Records', 'build': lambda: flow_request_queue('records'),
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Records changes to notices, comments and the improvements and degradations register sent from the Competency Hub page, '
                    'and links between register entries and actions.',
     'introduced': '1.5.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f05', 'name': 'ESG Competency Hub | 5 Meetings', 'build': lambda: flow_request_queue('meetings'),
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Books, changes, cancels and starts monthly meetings sent from the Competency Hub page, sends the Outlook invitations, '
                    'and writes each meeting\'s agenda when it starts.',
     'introduced': '1.6.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f09', 'name': 'ESG Competency Hub | 7 Minutes', 'build': lambda: flow_request_queue('minutes'),
     'connectors': ['shared_sharepointonline', 'shared_office365', 'shared_onedriveforbusiness'], 'on': False,
     'description': 'Finalises and amends the minutes of monthly meetings sent from the Competency Hub page, and makes the PDF minutes.',
     'introduced': '1.7.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f0a', 'name': 'ESG Competency Hub | 8 Clean-up', 'build': lambda: flow_request_queue('cleanup'),
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Used once before go-live, by an administrator: moves the test records and everything that depends on them to the recycle bin, then switches test marking off.',
     'introduced': '1.8.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f07', 'name': 'ESG Competency Hub | P-INV Invitations probe', 'build': flow_probe_invitations,
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': 'Run once by hand before meeting invitations are relied on: makes a TEST event for tomorrow, moves it, finds it by its reference and cancels it.',
     'introduced': '1.6.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f08', 'name': 'ESG Competency Hub | P-PDF PDF probe', 'build': flow_probe_pdf,
     'connectors': ['shared_sharepointonline', 'shared_onedriveforbusiness'], 'on': False,
     'description': 'Run once by hand before PDF minutes are relied on: turns a sample page into a PDF with OneDrive and saves it in Meeting Minutes.',
     'introduced': '1.7.0.0'},
    {'id': '7c2e5b10-4a3d-4f6e-9b21-8d0c1e5a6f06', 'name': 'ESG Competency Hub | 6 Administration', 'build': lambda: flow_request_queue('admin'),
     'connectors': ['shared_sharepointonline', 'shared_office365'], 'on': False,
     'description': "Records administrators' changes from the Competency Hub page: people, their areas and permissions, settings, and decisions on changes needing attention.",
     'introduced': '1.3.0.0'},
]


KIND = {'P': 'probe', '1': 'daily', '2': 'queue', '3': 'monitor', '4': 'records', '5': 'meetings', '6': 'admin', '7': 'minutes', '8': 'cleanup'}


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
