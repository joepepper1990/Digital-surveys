"""Readable step names for the Power Automate designer.

flows.py names its steps briefly, with a short code for the part of the flow each belongs to (Get_action_X is the
"get the action" step of a deadline change). Those names are kept in the code and the tests. When the solution is
built, every step is given a plain name instead (Get_the_action_(move_deadline) shows in the designer as
"Get the action (move deadline)", the same style as Power Automate's own Send_an_email_(V2)), and every reference to it is changed to match: runAfter, expressions such as
body('...') and outputs('...'), and the "See ..." pointers in failure messages.

Names use letters, digits, underscores and brackets only, are unique within a flow and at most 80 characters.
"""
import re

# The part of the flow a step belongs to, by the code at the end of its name. The same code can mean different
# things in different flows, so the table is per flow (by the number in the flow's name).
PARTS = {
    'queue': {'R': 'raise', 'U': 'change', 'X': 'move deadline', 'C': 'mark done', 'S': 'status', 'A': 'reassign',
              'L': 'close', 'O': 'reopen', 'E': 'edit', 'K': 'unknown kind', 'K0': 'unreadable', 'H': 'history folder',
              'r': 'retry', '': ''},
    'daily': {'D': 'reminders', 'A': 'alerts', 'c': 'reminder', 'x': 'temporary access', 'r': 'retry', '': ''},
    'monitor': {'A': 'alerts', 'm': 'stuck change', 'r': 'retry', 'v': 'invitation', 'p': 'PDF minutes', '': ''},
    'records': {'NE': 'edit notice', 'NA': 'archive notice', 'NP': 'pin notice', 'NH': 'hide comment', 'RR': 'raise entry',
                'RU': 'update entry', 'RL': 'link action', 'RX': 'unlink action', 'N': 'records', 'K': 'unknown kind', 'K0': 'unreadable',
                'missing': 'missing', 'r': 'retry', '': ''},
    'probe': {'': ''},
    'meetings': {'M': 'meeting', 'MB': 'book', 'MU': 'change meeting', 'MC': 'cancel meeting', 'MS': 'start meeting', 'MF': 'meeting folder', 'MR': 'record folder', 'M404': 'meeting missing', 'MK': 'unknown kind', 'K': 'unknown kind',
                 'MZ': 'finalise', 'MA': 'amend', 'back': 'back to in progress',
                 'K0': 'unreadable', 'r': 'retry', '': ''},
    'minutes': {'M': 'meeting', 'MZ': 'finalise', 'MA': 'amend', 'back': 'back to in progress', 'M404': 'meeting missing', 'MK': 'unknown kind',
                'K': 'unknown kind', 'K0': 'unreadable', 'r': 'retry', '': ''},
    'cleanup': {'X': 'clean-up', 'A': 'actions', 'N': 'notices', 'E': 'entries', 'M': 'meetings', 'F': 'feedback', 'K': 'unknown kind', 'K0': 'unreadable', 'r': 'retry', '': ''},
    'admin': {'T': 'decision', 'P': 'people', 'G': 'setting', 'RH': 'history folder', 'K0': 'unreadable', 'r': 'retry', '': ''},
}

# Words, as they are written in the short names.
WORDS = {
    'Pdf': 'PDF', 'pdf': 'PDF', 'nb': 'new business', 'att': 'attendance', 'dec': 'decision', 'Fin': 'Finalise', 'fin': 'finalise',
    'tx': 'change record', 'Tx': 'Change record', 'req': 'request', 'Req': 'Request', 'act': 'action', 'Act': 'Action',
    'fold': 'request folder', 'Fold': 'Request folder', 'id': 'ID', 'Ids': 'List addresses', 'uid': 'user ID',
    'json': 'details', 'Html': 'Email text', 'html': 'email text', 'ok': 'OK', 'comps': 'areas', 'notif': 'email',
    'Notice': 'Email', 'notice': 'email', 'Notices': 'Emails', 'P': 'person', 'm': 'monitor', 'S': 'step',
    'AllUsers': 'All Users', 'NoticePosters': 'Notice Posters', 'Management': 'Management', 'Administrators': 'Administrators',
    'prev': 'previous', 'Prev': 'Previous', 'vals': 'values', 'num': 'number', 'mgmt': 'management', 'admin': 'administrator',
    'Admin': 'Administrator', 'admins': 'administrators', 'Admins': 'Administrators', 'ev': 'event', 'Ev': 'Event',
    'H': 'History', 'qty': 'count', 'U': 'Updates', 'body': 'request', 'values': 'fields', 'Values': 'Fields',
    'Initialize': 'Initialise', 'Done': 'Stop', 'obj': 'object', 'mine': 'my', 'msg': 'message', 'Msg': 'Message',
    'Ok': 'OK', 'p': 'person', 'c': 'candidate', 'x': 'membership', 'r': 'retry', 'a': 'add', 'RH': 'History folder',
    'url': 'address', 's': 'setting', 'S': 'setting', 'In': 'Add to', 'Out': 'Remove from',
}

# Whole names (without the part code) that read better written out in full.
PHRASES = {
    'Need_tx': 'Create the change record if new', 'Find_tx': 'Find the change record', 'Set_tx': 'Use the change record',
    'Get_tx': 'Read the change record', 'Set_tx_read': 'Use the change record read', 'Set_tx_new': 'Use the new change record',
    'Tx_new': 'New change record', 'Tx_new_id': 'ID of the new change record', 'Has_tx_id': 'Was the new ID returned',
    'Tx_values': 'Change record fields', 'Tx_body': 'Change record request', 'Create_tx': 'Create the change record',
    'Tx_created': 'Check the change record was created', 'Set_tx_id': 'Keep the change record ID', 'Set_tx_plan': 'Keep the stored plan',
    'Set_fresh': 'Note this is the first run', 'Claim_now': 'Time of this claim', 'Claim_time': 'Time first claimed',
    'Key_ok': 'Check the request reference', 'Ids': 'List addresses', 'Site_path': 'Site path', 'Try': 'Try', 'Catch': 'Catch',
    'Who': 'Who is it for', 'Who_P': 'Who is it for', 'Ensure': 'Look up the email in Microsoft 365',
    'Ensure_failed': 'Microsoft 365 did not answer', 'Ensure_stop': 'Stop as Microsoft 365 did not answer',
    'Set_uid': 'Person from the request', 'Set_uid_new': 'Person found in Microsoft 365', 'Set_login_new': 'Their sign-in name',
    'Set_name_new': 'Their name', 'Bad_dates': 'Access end dates in the past', 'Bad_areas': 'Areas that do not exist',
    'Leaving_areas': 'Areas being taken away', 'Owned_areas': 'Areas where they own open actions',
    'Blocked_comps': 'Areas that cannot be taken away', 'Blocked': 'Names of those areas', 'Before': 'Access before the change',
    'Decide': 'Decide once', 'Verdict': 'Reason to refuse if any', 'Decided': 'Refused or allowed',
    'Want_a': 'Is this area ticked', 'Rows_r': 'Their row in this area', 'Rows_a': 'Their existing row in this area',
    'Fold_values': 'Request folder fields', 'Fold_body': 'Request folder request', 'Create_fold': 'Create their request folder',
    'Fold_made': 'Check the request folder was made', 'Find_fold': 'Does their request folder exist',
    'Need_fold': 'Create their request folder if missing', 'Break_fold': 'Give the request folder its own permissions',
    'Find_old_fold': 'Does a request folder exist', 'Has_old_fold': 'Make their request folder read-only',
    'Left_c': 'Days until due', 'Kind_c': 'Reminder type', 'Round_c': 'Late reminder number', 'Key_c': 'Reminder key',
    'New_c': 'Add the reminder if new', 'Owner_c': 'Owner of the action', 'Add_reminder': 'Add the reminder',
    'Out_x': 'Remove from the area group', 'Back_x': 'Check the group again', 'Gone_x': 'Removed from the group',
    'Member_x': 'Still in the area group', 'Out_x_needed': 'Remove them if still in it', 'Area_x': 'The area',
    'Who_x': 'The person', 'Owned_x': 'Their open actions in the area', 'Can_remove_x': 'No open actions there',
    'Ended_x': 'Membership ended', 'Save_ended_x': 'Save the ended membership', 'Live': 'Actions to remind about',
    'Covers': 'Does this email make a reminder unnecessary', 'Covered': 'Reminder already covered',
    'Do': 'Carry out the decision', 'Find_tx_m': 'Find the change record', 'Not_ours': 'Stop as another run has it',
    'Mirror_final': 'Copy the final state to the request', 'Requester': 'Person who sent it', 'Sender_id': 'Sender ID',
    'Asker': 'Person who sent it', 'Stuck': 'Changes that have stalled', 'Each_stuck': 'Each stalled change',
    'Give_up': 'Hand over after three attempts', 'Refire': 'Put back in the queue', 'Refire_body': 'Back in the queue',
    'Count_attempt': 'Count the attempt', 'Not_picked_up': 'Not picked up by its flow', 'Which_flow_down': 'Which flow has stopped',
    'Mark_down': 'Request queue has stopped', 'Mark_admin_down': 'Administration flow has stopped',
    'Find_part': 'Was part of it made', 'Part_by_type': 'By kind of change', 'Set_part_admin': 'Decided means partly made',
    'Find_action_part': 'Did the action change', 'Has_tx_m': 'Is there a change record', 'Attention_tx': 'Needs attention',
    'Save_attention_tx': 'Save on the change record', 'Attention_req': 'Needs attention message',
    'Save_attention_req': 'Save on the request', 'Due': 'Is a check due now', 'Not_now': 'Not now', 'Minute': 'Minute of the day',
    'Working': 'In working hours', 'Hours_row': 'Monitor hours setting', 'Now_uk': 'UK time now', 'Today': 'Today in the UK',
    'Retry_due': 'Emails due another try', 'Each_retry': 'Each email to try again', 'Render_r': 'The stored email',
    'Give_up_r': 'Three attempts already', 'Abandon_body': 'Abandoned', 'Abandon': 'Mark as abandoned',
    'Abandoned_here': 'Tell the administrators', 'Abandon_alerts': 'Alert for each administrator', 'Person_r': 'Is the recipient active',
    'Get_action_r': 'Read the action', 'Still_wanted_r': 'Is the email still wanted', 'Claim_body_r': 'Sending again',
    'Claim_r': 'Claim the email', 'Claimed_here_r': 'Claimed by this run', 'Requeue_r': 'Add to the emails to send',
    'Skip_body_r': 'No longer needed', 'Skip_r': 'Mark as not needed', 'Skipped_r': 'Done with it',
    'Get_failed': 'Emails that failed', 'Get_unknown': 'Emails with an unclear outcome', 'Get_sending': 'Emails left sending',
    'Health_row': 'Health setting', 'Health': 'Last health report', 'Health_value': 'Health now', 'Health_body': 'Health setting value',
    'Record_health': 'Save the health', 'Save_health': 'Save the health setting', 'Run_row': 'Last daily run setting',
    'Ran_body': 'Time of this run', 'Record_run': 'Record this run', 'Save_run': 'Save the time of this run',
    'Temporary_access': 'End temporary access', 'Each_expired': 'Each ended membership', 'Expired': 'Memberships past their end date',
    'Get_temporary': 'Active memberships', 'Get_comps': 'Areas', 'To_remind': 'Reminders to send',
    'Send_emails': 'Send the emails', 'Terminate_failed': 'Stop as failed', 'Get_attention': 'Changes needing attention',
    'Get_people': 'People', 'Admins': 'Active administrators', 'Interval': 'Days between late reminders',
    'Get_settings': 'Settings', 'Known_keys': 'Reminders already made', 'Get_candidates': 'Open actions due soon or late',
    'Each_candidate': 'Each action', 'Get_ledger': 'Reminders already in the email log',
    'Hours_start': 'Start of working hours', 'Hours_end': 'End of working hours', 'Hours_gap': 'Minutes between checks outside them',
    'Hours_ok': 'Are the hours valid', 'New_value': 'New value', 'Setting_row': 'The setting', 'Get_setting': 'Settings',
    'Previous': 'Value before', 'Setting_value': 'New setting value', 'Save_setting': 'Save the setting',
    'Initialize_varTx': 'Initialise change record', 'Initialize_varOutbox': 'Initialise emails to send',
    'Initialize_varAlerts': 'Initialise alerts', 'Initialize_varNotices': 'Initialise reminders',
    'Initialize_varDown': 'Initialise request queue stopped', 'Initialize_varAdminDown': 'Initialise administration stopped',
    'Initialize_varPart': 'Initialise partly made',
    'Done_untrusted': 'Stop as not sent from its own folder', 'Done_payload': 'Stop as the request is unreadable',
    'Done_type': 'Stop as the kind of change is not known', 'Done_already': 'Stop as already finished',
    'Done_K': 'Stop as the kind of change is not known', 'Done_K0': 'Stop as the request reference is unusable',
    'Html_action': 'Email text for an action', 'Html_alert': 'Email text for an alert', 'Html': 'Email text',
    'Get_flow_account': 'Read the flow account', 'Get_my_memberships': 'Read their area memberships',
    'Get_request': 'Read the request', 'Get_requester': 'Read the person who sent it', 'Get_people_U': 'Read the people',
    'Get_people': 'Read the people', 'Get_settings': 'Read the settings', 'Get_settings_R': 'Read the settings',
    'Get_setting': 'Read the settings', 'Get_comps': 'Read the areas', 'Get_temporary': 'Read active memberships',
    'Get_attention': 'Read changes needing attention', 'Get_candidates': 'Read open actions due soon or late',
    'Already_final': 'Already finished', 'Final_status': 'Final status', 'Final_body': 'Final state',
    'Failed_body': 'Failed and retrying', 'Mail_sent': 'Was the email sent', 'Each_email': 'Each email to send',
    'Claim': 'Claim the request', 'Claim_body': 'Being processed', 'Claimed': 'Claimed by this run',
    'Claimed_at': 'Claim time', 'Claim_conflict': 'Claimed by another run', 'Claim_failed': 'Claim failed',
    'Event_time': 'Time of the change', 'Folder_name': 'Folder of the request', 'Folder_item': 'Folder details',
    'By_type': 'By kind of change', 'Action_type': 'Which action change', 'Check_by_type': 'Checks for this kind of change',
    'Has_tx': 'Has a change record',
    'Fields_set': 'Fields to change', 'Emails_set': 'Emails to send', 'Plan_set': 'Plan with the values before',
    'Set_plan_now': 'Keep the plan', 'Get_action_now': 'Read the action again', 'Get_owner_now': 'Read the owner again',
    'Get_person_now': 'Read the person again', 'Person_now': 'Person fields', 'Years_row': 'Furthest deadline setting',
    'Interval_row': 'Late reminder interval setting', 'Health_now': 'Health now', 'Is_a_check_due_now': 'Is a check due now',
    'Member_now': 'Membership fields', 'Need_row': 'Create their row if new', 'Has_row': 'Do they have a row here',
    'Removed_row': 'Row marked removed', 'Before_row': 'Row before', 'Nothing_to_do': 'Nothing to do',
    'Grant_fold': 'Give them Contribute on their new request folder', 'Fold_read': 'Give Read on their request folder',
    'Fold_no_contribute': 'Take away Contribute on their request folder', 'Fold_contribute': 'Give Contribute on their request folder',
    'Fold_no_read': 'Take away Read on their request folder', 'Mark_sent': 'Mark the email sent',
    'Mark_unsent': 'Mark the email not sent', 'Mark_tx_failed': 'Mark the change record failed', 'Find_created': 'Find the new action',
    'Person_now': 'Person fields to save', 'Done_type': 'Stop as this kind of change is not handled', 'Out_area': 'Leave the area group', 'In_area': 'Join the area group',
}

ALLOWED = re.compile(r'[^A-Za-z0-9_()]')


def _code(name, part_codes):
    """Splits off the part code: Get_action_X -> ('Get_action', 'X'). Longest codes first (RH before H)."""
    codes = sorted((c for c in part_codes if c), key=len, reverse=True)
    for code in codes:
        if name.endswith('_' + code):
            return name[:-len(code) - 1], code
    # a code in the middle, as in Out_area_P_do (lower-case words after it), or Groups_P_AllUsers
    for tail in (r'((?:_[a-z]+)+)$', r'((?:_[A-Za-z]+)+)$'):
        for code in codes:
            m = re.match(r'^(.*)_' + re.escape(code) + tail, name)
            if m:
                return m.group(1) + m.group(2), code
    return name, ''


# The steps of a group or folder permission change: check, change if needed, read back, confirm.
TAILS = {'now': 'check first', 'change': 'if needed', 'do': '', 'back': 'read back', 'kept': 'confirm', 'stop': 'stop if not',
         'levels': 'levels', 'levels_back': 'levels read back'}


PROPER = ('All', 'Management', 'Administrators', 'Notice', 'History', 'Updates', 'Microsoft', 'ID', 'UK', 'OK')


def _inner(text):
    """Words placed inside a sentence: lower-case first letter, except for names."""
    return text if text.split(' ')[0] in PROPER else text[:1].lower() + text[1:]


# General shapes, tried in order, for names built by the same helpers.
RULES = [
    (r'^Refused_Create_(.+)$', 'Was creating {0} refused'),
    (r'^Refused_(.+)$', 'Was {0} refused'),
    (r'^(.+)_(?:made|created)_stop$', 'Stop if {0} was not created'),
    (r'^(.+)_(?:made|created)$', 'Check {0} was created'),
    (r'^Need_(.+)$', 'Create {0} if missing'),
    (r'^Join_(.+)$', 'Add to {0} if wanted'),
    (r'^Leave_(.+)$', 'Remove from {0} if not wanted'),
    (r'^Mark_(.+)$', 'Mark the request {0}'),
]


def _words(stem):
    if stem in PHRASES:
        return PHRASES[stem]
    m = re.match(r'^((?:In|Out|Grant|Fold)_.+?)_(levels_back|levels|now|change|do|back|kept|stop)$', stem)
    if m:
        return (_words(m.group(1)) + ' ' + TAILS[m.group(2)]).strip()
    # a step of making the History or Updates folder for an action (ensure_folder)
    m = re.match(r'^(.*)_(H|U|RH)((?:_[a-z]+)?)$', stem)
    if m and m.group(1) and m.group(1) not in WORDS:
        where = {'H': 'History', 'RH': 'History', 'U': 'Updates'}[m.group(2)]
        return re.sub(r'\b[Ff]older\b', where + ' folder', _words(m.group(1) + m.group(3)))
    for pattern, shape in RULES:
        m = re.match(pattern, stem)
        if m:
            return shape.format(*[_inner(_words(g)) for g in m.groups()])
    out = []
    for w in stem.split('_'):
        if w.startswith('var') and len(w) > 3:
            out += ['ID' if x == 'Id' else WORDS.get(x.lower(), WORDS.get(x, x)).lower() for x in re.findall(r'[A-Z][a-z]*', w[3:])]
            continue
        out.append(WORDS.get(w, w))
    s = ' '.join(out)
    return s[:1].upper() + s[1:]


def readable_names(names, flow_kind):
    """{short name: designer name} for every step of one flow; unique, at most 80 characters."""
    parts = PARTS[flow_kind]
    out, used = {}, {}
    for n in sorted(names):
        if n in PHRASES:
            stem, code = n, ''
        else:
            stem, code = _code(n, parts)
        text = _words(stem)
        if parts.get(code):
            text += ' (' + parts[code] + ')'
        name = ALLOWED.sub('', text.replace(' ', '_'))[:80].rstrip('_')
        base, k = name, 2
        while name in used:
            name = (base[:76] + '_' + str(k))
            k += 1
        used[name] = n
        out[n] = name
    return out


REF_FUNCS = ('body', 'outputs', 'actions', 'result', 'items', 'iterationIndexes', 'actionBody', 'actionOutputs')


def rename(definition, mapping):
    """Gives every step its designer name and changes every reference to it."""
    ref = re.compile(r"\b(" + '|'.join(REF_FUNCS) + r")\('([^']+)'\)")
    see = re.compile(r"\bSee ([A-Za-z0-9_]+)([.\s'])")

    def text(s):
        s = ref.sub(lambda m: m.group(1) + "('" + mapping.get(m.group(2), m.group(2)) + "')", s)
        return see.sub(lambda m: 'See ' + mapping.get(m.group(1), m.group(1)).replace('_', ' ') + m.group(2), s)

    def value(v):
        if isinstance(v, str):
            return text(v)
        if isinstance(v, list):
            return [value(x) for x in v]
        if isinstance(v, dict):
            return {k: value(x) for k, x in v.items()}
        return v

    def acts(actions):
        new = {}
        for n, a in actions.items():
            a = dict(a)
            for k in list(a):
                if k == 'actions':
                    a[k] = acts(a[k])
                elif k == 'else' and a[k]:
                    a[k] = dict(a[k], actions=acts(a[k]['actions']))
                elif k == 'cases':
                    a[k] = {c: dict(v, actions=acts(v['actions'])) for c, v in a[k].items()}
                elif k == 'default' and a[k]:
                    a[k] = dict(a[k], actions=acts(a[k]['actions']))
                elif k == 'runAfter':
                    a[k] = {mapping.get(r, r): s for r, s in a[k].items()}
                else:
                    a[k] = value(a[k])
            new[mapping.get(n, n)] = a
        return new

    d = dict(definition)
    d['actions'] = acts(definition['actions'])
    return d


def all_names(definition):
    names = set()

    def walk(actions):
        for n, a in actions.items():
            names.add(n)
            if 'actions' in a:
                walk(a['actions'])
            if a.get('else'):
                walk(a['else']['actions'])
            for c in (a.get('cases') or {}).values():
                walk(c['actions'])
            if a.get('default'):
                walk(a['default']['actions'])
    walk(definition['actions'])
    return names
