"""Runs the generated flows against the fake SharePoint and checks the outcome end to end.

    python3 tools/simulate.py

Covers: setup builds exactly the documented lists (cross-checked with 01-sharepoint/lists.csv and with the
fields the frontend reads and writes), permissions, re-runs are harmless, the monthly cycle (create, private
links, reminders), submit → lock, complete → release, invalid decisions are reverted, and failures email the TL.
"""
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from flows import build_all, ENV_SITE, ENV_MAIL  # noqa: E402
from schema import LISTS, ROLES, DEFAULT_BANDS, FOLLOW  # noqa: E402
from wdl import Engine, eval_expr, Context  # noqa: E402
import fake_sharepoint as fsp  # noqa: E402

HERE = os.path.dirname(__file__)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PARAMS = {ENV_SITE: fsp.SITE, ENV_MAIL: 'team.leader@example.test'}
FLOWS = {f['name'].split('|')[1].split()[0]: f for f in build_all()}  # '0', '1', … '10', '11'
MODE = os.environ.get('ESG_SIM_MODE', 'solution')
if MODE == 'legacy':  # the same flows as the legacy builder page produces them (literal site URL and email)
    from legacy import literalise, fill
    for _f in FLOWS.values():
        _d = literalise(_f['json']['properties']['definition'])
        _f['json']['properties']['definition'] = json.loads(fill(json.dumps(_d), fsp.SITE, 'team.leader@example.test'))
RESULTS = []


def ok(name, cond, detail=''):
    RESULTS.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or not detail else '  — ' + str(detail)[:300]))


def run(key, sp, now, trigger_body=None, overrides=None):
    defn = FLOWS[key]['json']['properties']['definition']
    eng = Engine(defn, sp, PARAMS, now, trigger_body, overrides)
    return eng.run(), eng


def fire(key, sp, lst_title, item_id, now):
    """Evaluate the SharePoint trigger conditions for one changed item; run the flow if they pass."""
    lst = sp.list_by_title(lst_title)
    body = sp.item_out(lst, lst['items'][item_id])
    trig = list(FLOWS[key]['json']['properties']['definition']['triggers'].values())[0]
    assert trig['inputs']['parameters']['table'] == lst_title
    eng = Engine(FLOWS[key]['json']['properties']['definition'], sp, PARAMS, now, body)
    for c in trig.get('conditions', []):
        if not eval_expr(c['expression'][1:], Context(eng)):
            return 'NotTriggered', None
    return run(key, sp, now, body)


def T(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------------------------------- reference data
def lists_csv():
    rows = list(csv.DictReader(open(os.path.join(REPO, '01-sharepoint', 'lists.csv'), encoding='utf-8')))
    out = {}
    for r in rows:
        out.setdefault(r['List'], {})[r['InternalName']] = r
    return out


def frontend_fields():
    js = open(os.path.join(REPO, '02-frontend', 'one-to-one.js'), encoding='utf-8').read()
    tests = open(os.path.join(REPO, '02-frontend', 'test', 'run-tests.js'), encoding='utf-8').read()

    def strings_after(src, marker, end=';'):
        i = src.index(marker)
        j = src.index(end, i)
        return ''.join(re.findall(r"'([^']*)'", src[i:j]))

    def names(s):
        return {x.split('/')[0] for x in s.split(',') if x}
    need = {
        'Manager Reviews': names(strings_after(js, 'var MR_FIELDS')) | names(strings_after(js, 'var MR_V15_FIELDS')),
        'Monthly Reviews': names(strings_after(js, 'var REV_FIELDS')) | names(strings_after(js, 'var REV_V14_FIELDS')),
        'Technicians': names(strings_after(js, 'var TECH_FIELDS')) | names(strings_after(js, 'var TECH_V14_FIELDS')),
        'Appraisal Expectations': names(re.search(r"spGetAll\(CONFIG\.lists\.exp, '([^']+)'", js).group(1)),
        '1-to-1 Settings': names(re.search(r"spGetAll\(CONFIG\.lists\.settings, '([^']+)'", js).group(1)),
        'Wellbeing Assessments': names(strings_after(js, 'var WB_FIELDS')),
        '1-to-1 Feedback': names(strings_after(js, 'var FB_FIELDS')) - {'HasUniqueRoleAssignments'},   # an item property, not a column
        '1-to-1 Amendments': names(strings_after(js, 'var AM_FIELDS')) - {'Created', 'Modified', 'Author'},   # built-in columns
        '1-to-1 Actions': names(strings_after(js, 'var ACT_FIELDS')) - {'Created', 'Modified', 'Author'},
        '1-to-1 Action Updates': names(strings_after(js, 'var UPD_FIELDS')) - {'Created', 'Modified', 'Author', 'FileDirRef', 'FSObjType'},
        '1-to-1 Action Notices': names(strings_after(js, 'var NOTICE_FIELDS')) - {'Created', 'Modified'},
    }
    need['Monthly Reviews'] |= set(re.findall(r"'([^']+)'", strings_after(tests, 'var TECH_ALLOWED', ']')))
    need['Manager Reviews'] |= set(re.findall(r"'([^']+)'", strings_after(tests, 'var MGR_ALLOWED', ']')))
    return need


TYPE_MAP = {'Single line of text': 'Text', 'Multiple lines (plain)': 'Note', 'Choice': 'Choice', 'Date only': 'DateTime',
            'Date and time': 'DateTime', 'Yes/No': 'Boolean'}


def csv_type(t):
    if t.startswith('Person'):
        return 'User'
    if t.startswith('Number'):
        return 'Number'
    return TYPE_MAP.get(t, t)


# ------------------------------------------------------------------------------------------- scenarios
def setup_checks():
    sp = fsp.FakeSP()
    status, eng = run('0', sp, T('2026-10-14T09:00:00'))
    ok('Setup: run succeeds', status == 'Succeeded', eng.log)
    ok('Setup: no warnings and no failed steps on a correctly configured site', eng.vars.get('varWarnings') == [] and not eng.log,
       (eng.vars.get('varWarnings'), eng.log))
    by_url = {l['url']: l for l in sp.lists.values()}
    ref = lists_csv()
    front = frontend_fields()
    for spec in LISTS:
        l = by_url.get(spec['url'])
        ok('Setup: list {0} created at /Lists/{1}'.format(spec['title'], spec['url']), l is not None)
        if not l:
            continue
        ok('Setup: {0} display name'.format(spec['title']), l['Title'] == spec['title'], l['Title'])
        ok('Setup: {0} settings (versioning 100, no attachments, not in search, offline off, not on quick launch)'.format(spec['title']),
           l['props'] == {'EnableVersioning': True, 'MajorVersionLimit': 100, 'EnableAttachments': False, 'NoCrawl': True,
                          'OnQuickLaunch': False, 'ExcludeFromOfflineClient': True, 'EnableFolderCreation': bool(spec.get('folders')),
                          'ReadSecurity': spec.get('readSecurity', 1), 'WriteSecurity': spec.get('writeSecurity', 1)}, l['props'])
        csvl = ref[spec['title']]
        made = {n: f for n, f in l['fields'].items() if n not in ('ID', 'Created', 'Modified', 'Author', 'Editor', 'Attachments',
                                                                  'ContentType', 'LinkTitle')}
        ok('Setup: {0} columns match lists.csv exactly'.format(spec['title']), set(made) == set(csvl),
           'extra {0} missing {1}'.format(set(made) - set(csvl), set(csvl) - set(made)))
        bad = []
        for name, r in csvl.items():
            if name == 'Title' or name not in made:
                continue
            f = made[name]
            if f['Type'] != csv_type(r['Type']):
                bad.append('{0} type {1} vs {2}'.format(name, f['Type'], r['Type']))
            if f['Type'] == 'DateTime' and (f.get('Format') == 'DateTime') != (r['Type'] == 'Date and time'):
                bad.append(name + ' date/time format')
            if r['Type'] == 'Choice' and f['choices'] != r['Choices / settings'].split('|'):
                bad.append(name + ' choices')
            if f['Type'] == 'Number' and 'min' in r['Choices / settings'] and (f.get('Min'), f.get('Max')) != ('1', '5'):
                bad.append(name + ' min/max')
            want_default = r['Default'] if r['Default'] not in ('', '(none)') else None
            got_default = f.get('Default')
            if f['Type'] == 'Boolean':
                got_default = {'1': 'Yes', '0': 'No'}[got_default]
            if want_default != got_default and not (f['Type'] == 'Boolean' and want_default is None and got_default == 'No'):
                bad.append('{0} default {1!r} vs {2!r}'.format(name, got_default, want_default))
            if (r['Indexed'] == 'Yes') != f['Indexed']:
                bad.append(name + ' index')
            if 'Enforce unique' in r['Choices / settings'] and not f['EnforceUniqueValues']:
                bad.append(name + ' unique')
            if f['Type'] == 'Note' and f.get('RichText') != 'FALSE':
                bad.append(name + ' rich text')
            if f['Type'] == 'User' and (f.get('UserSelectionMode') != 'PeopleOnly' or f.get('Mult') != 'FALSE'):
                bad.append(name + ' person settings')
        ok('Setup: {0} column types, choices, defaults, ranges and indexes match lists.csv'.format(spec['title']), not bad, bad)
        missing = {n for n in front[spec['title']] if n not in l['fields'] and n not in ('Id',)}
        ok('Setup: {0} has every column the frontend reads and writes'.format(spec['title']), not missing, missing)
        ok('Setup: {0} views'.format(spec['title']), set(v['title'] for v in spec['views']) <= set(l['views']), l['views'])
        want_ra = {3: {fsp.FULL}}
        gid = next(g for g, d in sp.groups.items() if d['Title'] == '1-to-1 Technicians')
        if spec['groupRead']:
            want_ra[gid] = {fsp.READ}
        if spec.get('groupContribute'):
            want_ra[gid] = {sp.role_id('1-to-1 Submit')}   # Contribute without delete, versions, alerts or personal views
        ok('Setup: {0} permissions are exactly {1}'.format(spec['title'], 'Owners FC + technicians Read' if spec['groupRead'] else
                                                         'Owners FC + technicians 1-to-1 Submit (own items only)' if spec.get('groupContribute') else 'Owners FC'),
           l['unique'] and l['ra'] == want_ra, l['ra'])
    for r in ROLES:
        got = next((x for x in sp.roles if x['Name'] == r['name']), None)
        ok('Setup: permission level {0} created with the planned rights'.format(r['name']),
           got and got['BasePermissions'] == {'High': str(r['high']), 'Low': str(r['low'])}, got)
    g = [d for d in sp.groups.values() if d['Title'] == '1-to-1 Technicians']
    ok('Setup: group 1-to-1 Technicians created, members hidden, no requests', len(g) == 1 and
       g[0]['props']['OnlyAllowMembersViewMembership'] is True and g[0]['props']['AllowRequestToJoinLeave'] is False)
    ok('Setup: group has no site-level permission', all(gid != g[0]['Id'] for gid in sp.web_ra))
    settings = by_url['OneToOneSettings']
    bands = [i for i in settings['items'].values() if i['fields'].get('Title') == 'Bands']
    ok('Setup: Bands item created with the default thresholds', len(bands) == 1 and bands[0]['fields']['Value'] == DEFAULT_BANDS)
    rem = [i for i in settings['items'].values() if i['fields'].get('Title') == 'Reminders']
    ok('Setup: Reminders item created (20th and 27th)', len(rem) == 1 and rem[0]['fields']['Value'] == '[20,27]', rem)
    ok('Setup: summary email sent to the TL', sp.emails and sp.emails[-1]['to'] == 'team.leader@example.test' and
       sp.emails[-1]['subject'] == 'ESG 1-to-1 setup: complete', sp.emails[-1:])
    snapshot = json.dumps({u: (l['Title'], sorted(l['fields']), l['views'], {k: sorted(v) for k, v in l['ra'].items()}, len(l['items']))
                           for u, l in by_url.items()}, sort_keys=True)
    roles_before, groups_before = len(sp.roles), len(sp.groups)
    status2, eng2 = run('0', sp, T('2026-10-14T09:30:00'))
    snapshot2 = json.dumps({l['url']: (l['Title'], sorted(l['fields']), l['views'], {k: sorted(v) for k, v in l['ra'].items()}, len(l['items']))
                            for l in sp.lists.values()}, sort_keys=True)
    ok('Setup: second run succeeds with no warnings and no failed steps', status2 == 'Succeeded' and eng2.vars['varWarnings'] == []
       and not eng2.log, eng2.log)
    ok('Setup: second run changes nothing (idempotent)', snapshot == snapshot2 and len(sp.roles) == roles_before and
       len(sp.groups) == groups_before and not any(x.startswith('Created') or x.startswith('Added') for x in eng2.vars['varLog']),
       eng2.vars['varLog'])
    return sp


def partial_site_checks():
    sp = fsp.FakeSP(locale=1033, tz='(UTC-08:00) Pacific Time (US and Canada)', site_admin=False)
    l = sp._new_list('Technicians', 'Technicians', '')
    sp.add_field(l, "<Field Type='User' Name='Technician' StaticName='Technician' DisplayName='Technician' List='UserInfo' "
                    "UserSelectionMode='PeopleOnly' Mult='FALSE' />")
    sp.add_field(l, "<Field Type='Text' Name='TechnicianAadId' StaticName='TechnicianAadId' DisplayName='TechnicianAadId' />")
    m = sp._new_list('Monthly Reviews', 'MonthlyReviews', '')
    m['unique'], m['ra'] = True, {3: {fsp.FULL}, 4: {fsp.EDIT}, 5: {fsp.READ}, 10: {fsp.FULL}}  # broken by hand, groups copied
    sp.roles.append({'Id': 1073741999, 'Name': '1-to-1 Edit', 'RoleTypeKind': 0, 'BasePermissions': {'High': '432', 'Low': '1011028719'}})
    status, eng = run('0', sp, T('2026-10-14T09:00:00'))
    w = ' | '.join(eng.vars['varWarnings'])
    ok('Setup (hand-built site): completes', status == 'Succeeded', eng.log)
    ok('Setup (hand-built site): adds the missing columns to an existing list', {'Active', 'AppraisalDate'} <= set(l['fields']))
    ok('Setup (hand-built site): indexes a column that existed without one', l['fields']['TechnicianAadId']['Indexed'] is True)
    ok('Setup (hand-built site): warns that the existing 1-to-1 Edit level differs and leaves it alone',
       'differ' in w and next(r for r in sp.roles if r['Name'] == '1-to-1 Edit')['BasePermissions']['Low'] == '1011028719', w)
    ok('Setup (hand-built site): removes Members, Visitors and the direct TL entry from a list broken by hand',
       m['ra'] == {3: {fsp.FULL}}, m['ra'])
    ok('Setup (hand-built site): warns about regional settings', 'Regional settings' in w, w)
    ok('Setup (hand-built site): warns when the TL is not Site Collection Admin', 'Site Collection Administrator' in w, w)
    ok('Setup (hand-built site): summary says there are items to check', 'items to check' in sp.emails[-1]['subject'])


def monthly_checks(sp):
    techs = sp.list_by_title('Technicians')
    exp = sp.list_by_title('Appraisal Expectations')
    mgr = sp.list_by_title('Manager Reviews')
    mr = sp.list_by_title('Monthly Reviews')
    alex = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'],
                                       'item/AppraisalDate': '2027-02-12'})
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'],
                                'item/TechnicianAadId': 'aad-sam'})
    sp.write_item(techs, None, {'item/Title': 'Old Leaver', 'item/Technician/Claims': sp.users[10]['Claims'], 'item/Active': False})
    sp.write_item(exp, None, {'item/Title': 'Shared safety refresher', 'item/Measures': 'Passed by Q4', 'item/AppraisalYear': '2026/27',
                              'item/SortOrder': 10})
    sp.write_item(exp, None, {'item/Title': 'Alex: RP supervisor module', 'item/Measures': 'Module 2', 'item/AppraisalYear': '2026/27',
                              'item/AppliesTo/Value': 'Individual', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/SortOrder': 20})
    sp.write_item(exp, None, {'item/Title': 'Retired one', 'item/AppraisalYear': '2025/26', 'item/Active': False})
    sp.write_item(exp, None, {'item/Title': 'Next year, entered early', 'item/AppraisalYear': '2027/28', 'item/SortOrder': 5})
    ok('Fake: Active defaults to Yes and AppliesTo to Shared', alex['fields']['Active'] is True and
       exp['items'][1]['fields']['AppliesTo'] == 'Shared')

    n_emails = len(sp.emails)
    status, eng = run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    ok('Flow 1: run succeeds', status == 'Succeeded', eng.log)
    ok('Flow 1: one Manager Review and one Monthly Review per ACTIVE technician', len(mgr['items']) == 2 and len(mr['items']) == 2)
    m_alex = next(i for i in mgr['items'].values() if i['fields']['Technician'] == 11)
    r_alex = mr['items'][m_alex['fields']['ReviewItemId']]
    f = m_alex['fields']
    ok('Flow 1: Manager Review fields (key, month, due 30-Nov 23:59:59 UK, state Open, JSON columns initialised)',
       f['ReviewKey'] == 'aad-alex_2026-11' and f['MonthKey'] == '2026-11' and f['DueDate'].startswith('2026-11-30T23:59:59') and
       f['ReviewState'] == 'Open' and f['ActionsStatus'] == 'None' and f['ActionsJson'] == '[]' and f['ExpectationFeedbackJson'] == '[]', f)
    snap = json.loads(f['ExpectationSnapshotJson'])
    ok('Flow 1: snapshot = this appraisal year\'s shared + own individual expectations, in SortOrder, active only',
       [s['title'] for s in snap] == ['Shared safety refresher', 'Alex: RP supervisor module'], snap)
    m_sam = next(i for i in mgr['items'].values() if i['fields']['Technician'] == 12)
    ok('Flow 1: another technician gets only the shared expectation',
       [s['title'] for s in json.loads(m_sam['fields']['ExpectationSnapshotJson'])] == ['Shared safety refresher'])
    rf = r_alex['fields']
    ok('Flow 1: Monthly Review fields (status Not Started, month start, appraisal date copied, technician copy of expectations)',
       rf['ReviewStatus'] == 'Not Started' and rf['MonthStart'] == '2026-11-01' and rf['AppraisalDate'] == '2027-02-12' and
       [e['id'] for e in json.loads(rf['ExpectationsJson'])] == [s['id'] for s in snap] and
       all(e['comment'] == '' and 'rating' in e and e['rating'] is None for e in json.loads(rf['ExpectationsJson'])), rf)
    ok('Flow 1: missing Entra ID looked up and saved on Technicians', alex['fields']['TechnicianAadId'] == 'aad-alex')
    ok('Flow 1: review private – Owners Full Control + only that technician with 1-to-1 Edit',
       r_alex['unique'] and r_alex['ra'].get(3) == {fsp.FULL} and r_alex['ra'].get(11) == {sp.role_id('1-to-1 Edit')} and
       12 not in r_alex['ra'], r_alex['ra'])
    ok('Flow 1: Test B has no access to Test A\'s review, Manager Review not shared yet',
       not sp.roles_on(12, mr, r_alex) and not sp.roles_on(11, mgr, m_alex) and not m_alex['unique'] and mgr['ra'] == {3: {fsp.FULL}})
    e1 = [e for e in sp.emails[n_emails:] if e['subject'] == 'Your 1-to-1 for November 2026 is ready']
    ok('Flow 1: E1 to each technician with their own link', sorted(e['to'] for e in e1) ==
       ['alex.morgan@example.test', 'sam.patel@example.test'] and
       any(fsp.SITE + '/SitePages/OneToOne.aspx?reviewId={0}"'.format(r_alex['id']) in e['body'] and 'Hi Alex,' in e['body'] for e in e1), e1)
    ok('Flow 1: deadline text in DD-MMM-YYYY style', any('23:59 on Monday 30-Nov-2026' in e['body'] for e in e1))
    ok('Flow 1: LinkSentOn stamped', all(i['fields'].get('LinkSentOn') for i in mgr['items'].values()))
    ok('Flow 1: no problem report when all is well', not any(e['subject'] == '1-to-1 system: action needed' for e in sp.emails[n_emails:]))

    before = (len(mgr['items']), len(mr['items']), len(sp.emails))
    status, eng = run('1', sp, T('2026-11-02T07:00:00'), overrides={'varTestDate': '2026-11-02T07:00:00'})
    ok('Flow 1: second run creates nothing and sends nothing', status == 'Succeeded' and before == (len(mgr['items']), len(mr['items']), len(sp.emails)), eng.log)

    # technician submits
    sp.me = 11
    sp.write_item(mr, r_alex['id'], {'item/Q1WentWell': 'Closed the backlog', 'item/ReviewStatus/Value': 'Draft'})
    st, _ = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-10T12:00:00'))
    ok('Flow 2: a draft save does not trigger', st == 'NotTriggered')
    sp.write_item(mr, r_alex['id'], {'item/Q9FollowUp/Value': FOLLOW[2], 'item/ReviewStatus/Value': 'Submitted'})
    sp.me = 10
    n = len(sp.emails)
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-10T12:05:00'))
    ok('Flow 2: submission run succeeds', st == 'Succeeded', eng and eng.log)
    ok('Flow 2: review locked – technician now has 1-to-1 Read only', r_alex['ra'].get(11) == {sp.role_id('1-to-1 Read')}, r_alex['ra'])
    ok('Flow 2: Manager Review stamped Submitted, on time, follow-up copied', m_alex['fields']['ReviewState'] == 'Submitted' and
       m_alex['fields']['SubmittedLate'] is False and m_alex['fields']['SubmittedOn'] and m_alex['fields']['TechFollowUp'] == FOLLOW[2], m_alex['fields'])
    e3 = sp.emails[n:]
    ok('Flow 2: E3 to the TL, tagged [1-to-1 REQUESTED], link to the review',
       len(e3) == 1 and e3[0]['to'] == 'team.leader@example.test' and e3[0]['subject'].startswith('[1-to-1 REQUESTED] 1-to-1 submitted: Alex Morgan') and
       'reviewId={0}"'.format(r_alex['id']) in e3[0]['body'] and 'on time' in e3[0]['body'], e3)
    n = len(sp.emails)
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-10T12:10:00'))
    ok('Flow 2: re-trigger after its own update sends nothing new', st == 'Succeeded' and len(sp.emails) == n, eng and eng.log)

    # forced status by the API (P10): technician sets Completed on Sam's own draft
    r_sam = mr['items'][m_sam['fields']['ReviewItemId']]
    sp.write_item(mr, r_sam['id'], {'item/ReviewStatus/Value': 'Completed', 'item/DueDate': '2099-12-31T00:00:00Z'})
    st, eng = fire('2', sp, 'Monthly Reviews', r_sam['id'], T('2026-12-02T09:00:00'))
    ok('Flow 2 (P10): forced "Completed" is treated as a submission, normalised to Submitted, lateness from the TRUSTED due date',
       st == 'Succeeded' and r_sam['fields']['ReviewStatus'] == 'Submitted' and m_sam['fields']['ReviewState'] == 'Submitted' and
       m_sam['fields']['SubmittedLate'] is True, (eng and eng.log, r_sam['fields'].get('ReviewStatus'), m_sam['fields']))
    ok('Flow 2 (P10): E3 says late', 'late' in sp.emails[-1]['body'])

    # TL completes Alex
    sp.write_item(mgr, m_alex['id'], {'item/FB_Overall': 'Good month', 'item/ReviewState/Value': 'Completed'})
    n = len(sp.emails)
    st, eng = fire('3', sp, 'Manager Reviews', m_alex['id'], T('2026-11-12T09:00:00'))
    ok('Flow 3: release run succeeds', st == 'Succeeded', eng and eng.log)
    ok('Flow 3: feedback released – technician has 1-to-1 Read on their Manager Review only',
       m_alex['unique'] and m_alex['ra'].get(11) == {sp.role_id('1-to-1 Read')} and 12 not in m_alex['ra'] and m_alex['ra'].get(3) == {fsp.FULL})
    ok('Flow 3: stamps ReleasedOn / CompletedOn / CompletedBy', m_alex['fields'].get('ReleasedOn') and m_alex['fields'].get('CompletedOn') and
       m_alex['fields'].get('CompletedBy') == 'team.leader@example.test', m_alex['fields'])
    ok('Flow 3: Monthly Review status Completed and still read-only', r_alex['fields']['ReviewStatus'] == 'Completed' and
       r_alex['ra'].get(11) == {sp.role_id('1-to-1 Read')})
    ok('Flow 3: E4 to the technician', len(sp.emails) == n + 1 and sp.emails[-1]['to'] == 'alex.morgan@example.test' and
       sp.emails[-1]['subject'] == 'Feedback on your 1-to-1 (November 2026) is ready', sp.emails[-1:])
    st, _ = fire('3', sp, 'Manager Reviews', m_alex['id'], T('2026-11-12T09:05:00'))
    ok('Flow 3: does not re-trigger after release', st == 'NotTriggered')

    # Flow 2 runs again because Flow 3 wrote the status – must not reopen or email
    n = len(sp.emails)
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-12T09:06:00'))
    ok('Flow 2: a change by the TL\'s account after processing (here Flow 3) is not a submission – cancelled, nothing changes', st == 'Cancelled' and len(sp.emails) == n and
       r_alex['fields']['ReviewStatus'] == 'Completed' and m_alex['fields']['ReviewState'] == 'Completed', eng and eng.log)
    return sp, mgr, mr


def month_two_checks(sp, mgr, mr):
    n = len(sp.emails)
    status, eng = run('1', sp, T('2026-12-01T07:00:00'), overrides={'varTestDate': '2026-12-01T07:00:00'})
    ok('Flow 1 (next month): creates December reviews', status == 'Succeeded' and len(mgr['items']) == 4, eng.log)
    dec = {i['fields']['Technician']: i for i in mgr['items'].values() if i['fields']['MonthKey'] == '2026-12'}
    # Invalid: TL completes Sam's December review while still Open
    sp.write_item(mgr, dec[12]['id'], {'item/ReviewState/Value': 'Completed'})
    st, eng = fire('3', sp, 'Manager Reviews', dec[12]['id'], T('2026-12-05T09:00:00'))
    ok('Flow 3: completing an unsubmitted review is rejected and reverted to Open', st == 'Cancelled' and
       dec[12]['fields']['ReviewState'] == 'Open' and not dec[12]['unique'], (st, eng and eng.log))
    ok('Flow 3: TL told "not done"', sp.emails[-1]['subject'] == '1-to-1: not done')
    # Closing before the deadline is also rejected
    sp.write_item(mgr, dec[12]['id'], {'item/ReviewState/Value': 'Closed - Not Submitted'})
    st, _ = fire('3', sp, 'Manager Reviews', dec[12]['id'], T('2026-12-05T09:10:00'))
    ok('Flow 3: closing before the deadline is rejected', st == 'Cancelled' and dec[12]['fields']['ReviewState'] == 'Open')
    # Reminder on the 20th goes only to those still Open
    rev = mr['items'][dec[11]['fields']['ReviewItemId']]
    sp.write_item(mr, rev['id'], {'item/ReviewStatus/Value': 'Submitted'})
    fire('2', sp, 'Monthly Reviews', rev['id'], T('2026-12-10T09:00:00'))
    n = len(sp.emails)
    status, eng = run('1', sp, T('2026-12-20T07:00:00'), overrides={'varTestDate': '2026-12-20T07:00:00'})
    e2 = [e for e in sp.emails[n:] if e['subject'].startswith('Reminder:')]
    ok('Flow 1 (20th): E2 reminder only to the technician who has not submitted', status == 'Succeeded' and
       [e['to'] for e in e2] == ['sam.patel@example.test'] and 'Thursday 31-Dec-2026' in e2[0]['subject'], (e2, eng.log))
    # Close after the deadline works
    sp.write_item(mgr, dec[12]['id'], {'item/ReviewState/Value': 'Closed - Not Submitted'})
    st, eng = fire('3', sp, 'Manager Reviews', dec[12]['id'], T('2027-01-02T09:00:00'))
    ok('Flow 3: close after the deadline releases read-only access and sends E5', st == 'Succeeded' and
       dec[12]['ra'].get(12) == {sp.role_id('1-to-1 Read')} and sp.emails[-1]['subject'] == 'Your 1-to-1 (December 2026) has been closed',
       (st, eng and eng.log))
    # Leap-year and BST due dates (F19, F20)
    for when, due in (('2028-02-01T07:00:00', '2028-02-29T23:59:59'), ('2027-03-01T07:00:00', '2027-03-31T22:59:59'),
                      ('2026-10-01T07:00:00', '2026-10-31T23:59:59')):
        run('1', sp, T(when), overrides={'varTestDate': when})
        got = [i['fields']['DueDate'] for i in mgr['items'].values() if i['fields']['MonthKey'] == when[:7]]
        ok('Flow 1: DueDate for {0} is {1}Z'.format(when[:7], due), got and all(g.startswith(due) for g in got), got)


def extra_checks():
    # setup: a refused column becomes a warning, not a failed run; version history limit never lowered;
    # a clashing title is reported; the runner keeps access when not SCA and not in Owners
    sp = fsp.FakeSP(site_admin=False)
    sp.groups[3]['members'] = set()
    sp.fail_fields = {'WinOfMonth'}
    t = sp._new_list('Technicians', 'Technicians', '')
    t['props']['EnableVersioning'], t['props']['MajorVersionLimit'] = True, 500
    sp._new_list('Manager Reviews', 'OldManagerReviews', '')
    status, eng = run('0', sp, T('2026-10-14T09:00:00'))
    w = ' | '.join(eng.vars['varWarnings'])
    ok('Setup: a column SharePoint refuses is reported and the run still succeeds', status == 'Succeeded' and
       'Could not add column WinOfMonth' in w, (status, eng.log))
    ok('Setup: never lowers an existing version-history limit', t['props']['MajorVersionLimit'] == 500, t['props'])
    ok('Setup: warns when another list already has a target title', 'is already called "Manager Reviews"' in w, w)
    by_url = {l['url']: l for l in sp.lists.values()}
    ok('Setup: creates the real list at its own URL despite the clash', 'ManagerReviews' in by_url)
    ok('Setup: keeps the runner\'s own access when they are neither Site Collection Admin nor in Owners',
       all(10 in by_url[u]['ra'] for u in ('Technicians', 'MonthlyReviews')), {u: by_url[u]['ra'] for u in ('Technicians',)})

    # setup: an essential permission step that fails must fail the run (not be hidden by a later tolerant step)
    sp = fsp.FakeSP()
    sp.fail_break = True
    status, eng = run('0', sp, T('2026-10-14T09:00:00'))
    ok('Setup: a failed permission step fails the run and emails the TL (never reported as complete)',
       status == 'Failed' and sp.emails and 'action needed' in sp.emails[-1]['subject'] and
       not any('setup: complete' in e['subject'] for e in sp.emails), (status, [e['subject'] for e in sp.emails]))

    # Flow 1: appraisal date arriving as a UTC instant (BST) is stored as the same calendar day
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    techs = sp.list_by_title('Technicians')
    sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'],
                                'item/TechnicianAadId': 'aad-alex', 'item/AppraisalDate': '2027-07-15'})
    sp.dates_as_instants = True
    status, eng = run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    rv = list(sp.list_by_title('Monthly Reviews')['items'].values())
    ok('Flow 1: a summer appraisal date returned as a UTC instant is copied as the same day', status == 'Succeeded' and
       rv and rv[0]['fields']['AppraisalDate'] == '2027-07-15', (eng.log, rv and rv[0]['fields'].get('AppraisalDate')))
    sp.dates_as_instants = False

    # Flow 3: a second, stale trigger after release does nothing; closing a review that was never created
    mgr = sp.list_by_title('Manager Reviews')
    m = next(iter(mgr['items'].values()))
    sp.write_item(mgr, m['id'], {'item/ReviewState/Value': 'Closed - Not Submitted'})
    stale = sp.item_out(mgr, m)
    st, eng = fire('3', sp, 'Manager Reviews', m['id'], T('2026-12-02T09:00:00'))
    n = len(sp.emails)
    eng2 = Engine(FLOWS['3']['json']['properties']['definition'], sp, PARAMS, T('2026-12-02T09:01:00'), stale)
    st2 = eng2.run()
    ok('Flow 3: a stale second trigger after release is cancelled and sends nothing', st == 'Succeeded' and st2 == 'Cancelled' and
       len(sp.emails) == n, (st, st2, eng2.log))
    orphan = sp.write_item(mgr, None, {'item/Title': 'Alex Morgan – 2026-10', 'item/ReviewKey': 'aad-alex_2026-10',
                                       'item/Technician/Claims': sp.users[11]['Claims'], 'item/MonthKey': '2026-10',
                                       'item/DueDate': '2026-10-31T23:59:59Z', 'item/ReviewState/Value': 'Closed - Not Submitted'})
    st, eng = fire('3', sp, 'Manager Reviews', orphan['id'], T('2026-11-02T09:00:00'))
    ok('Flow 3: closing a Manager Review whose Monthly Review was never created still releases it and sends E5',
       st == 'Succeeded' and orphan['ra'].get(11) == {sp.role_id('1-to-1 Read')} and
       sp.emails[-1]['subject'].endswith('has been closed') and 'OneToOne.aspx"' in sp.emails[-1]['body'], (st, eng and eng.log))


def failure_checks():
    sp = fsp.FakeSP()
    n = len(sp.emails)
    status, eng = run('1', sp, T('2026-11-01T07:00:00'))
    ok('Flow 1 before setup: run fails safely and emails the TL', status == 'Failed' and
       sp.emails[n:] and sp.emails[-1]['subject'] == '1-to-1 system: action needed (ESG 1-to-1 | 1 Daily scheduler)', (status, sp.emails[n:]))
    ok('Flow 1 before setup: the failing step names the fix', any('STOP_run_the_setup_flow_first' in x for x in eng.log), eng.log)
    # one technician failing does not stop the others
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    techs = sp.list_by_title('Technicians')
    sp.users[13] = {'Id': 13, 'Title': 'Ghost', 'Email': 'ghost@example.test', 'aad': 'aad-ghost', 'Claims': 'i:0#.f|membership|ghost@example.test'}
    sp.write_item(techs, None, {'item/Title': 'Ghost', 'item/Technician/Claims': sp.users[13]['Claims'], 'item/TechnicianAadId': 'aad-ghost'})
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})
    sp.ensure_fail.add(13)  # account removed from the organisation: ensureuser fails for Ghost
    status, eng = run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    mgr = sp.list_by_title('Manager Reviews')
    e7 = [e for e in sp.emails if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1: one technician failing does not stop the others', any(e['to'] == 'sam.patel@example.test' for e in sp.emails))
    ok('Flow 1: the failure is reported to the TL (E7) and no link goes to the failed technician',
       e7 and 'FAILED for Ghost' in e7[-1]['body'] and not any(e['to'] == 'ghost@example.test' for e in sp.emails), (e7, eng.log))


def team_and_wellbeing_checks():
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    techs = sp.list_by_title('Technicians')
    gid = next(g for g, d in sp.groups.items() if d['Title'] == '1-to-1 Technicians')
    # Flow 4: the group follows the Technicians list
    alex = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims']})
    n = len(sp.emails)
    st, eng = fire('4', sp, 'Technicians', alex['id'], T('2026-10-15T10:00:00'))
    ok('Flow 4: a new active team member is added to the 1-to-1 group and the TL is told', st == 'Succeeded' and
       11 in sp.groups[gid]['members'] and len(sp.emails) == n + 1 and sp.emails[-1]['subject'] == '1-to-1: access given to Alex Morgan', (st, eng and eng.log))
    n = len(sp.emails)
    st, _ = fire('4', sp, 'Technicians', alex['id'], T('2026-10-15T10:05:00'))
    ok('Flow 4: a later edit (e.g. appraisal date) changes nothing and sends nothing', st == 'Succeeded' and len(sp.emails) == n)
    ok('Flow 4: the group still has no site-level permission', gid not in sp.web_ra)
    sp.write_item(techs, alex['id'], {'item/Active': False})
    st, eng = fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T10:00:00'))
    ok('Flow 4: deactivating removes them from the group and tells the TL', st == 'Succeeded' and 11 not in sp.groups[gid]['members'] and
       sp.emails[-1]['subject'] == '1-to-1: access removed for Alex Morgan', (st, eng and eng.log))
    sp.write_item(techs, alex['id'], {'item/Active': True})
    fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T11:00:00'))
    ok('Flow 4: reactivating adds them back', 11 in sp.groups[gid]['members'])
    # full sync: anyone in the group without an Active row is removed, whoever put them there
    sp.groups[gid]['members'].add(12)
    n = len(sp.emails)
    st, eng = fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T12:00:00'))
    ok('Flow 4 (full sync): someone added to the group by hand with no Active row is removed and listed for the TL', st == 'Succeeded' and
       12 not in sp.groups[gid]['members'] and 11 in sp.groups[gid]['members'] and len(sp.emails) == n + 1 and
       'not active in the team list' in sp.emails[-1]['subject'] and 'Sam Patel' in sp.emails[-1]['body'], (st, eng and eng.log))
    sp.write_item(techs, alex['id'], {'item/Technician/Claims': sp.users[12]['Claims']})
    st, eng = fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T12:05:00'))
    ok('Flow 4 (full sync): changing the person on a row gives the new person access and removes the old one', st == 'Succeeded' and
       12 in sp.groups[gid]['members'] and 11 not in sp.groups[gid]['members'], (st, eng and eng.log, sp.groups[gid]['members']))
    sp.write_item(techs, alex['id'], {'item/Technician/Claims': sp.users[11]['Claims']})
    n = len(sp.emails)
    st, _ = fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T12:10:00'))
    ok('Flow 4 (full sync): and back again', st == 'Succeeded' and sp.groups[gid]['members'] == {11})
    n = len(sp.emails)
    st, _ = fire('4', sp, 'Technicians', alex['id'], T('2026-10-16T12:15:00'))
    ok('Flow 4 (full sync): nothing to do → no email', st == 'Succeeded' and len(sp.emails) == n and sp.groups[gid]['members'] == {11})

    # Flow 5: wellbeing assessment lifecycle
    wb = sp.list_by_title('Wellbeing Assessments')
    it = sp.write_item(wb, None, {'item/Title': 'Alex Morgan – wellbeing assessment', 'item/Technician/Claims': sp.users[11]['Claims'],
                                  'item/AssessmentDate': '2026-11-02'})
    ok('Fake: AssessmentStatus defaults to Open', it['fields'].get('AssessmentStatus') == 'Open')
    n = len(sp.emails)
    st, eng = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-20T09:00:00'))
    edit, read = sp.role_id('1-to-1 Edit'), sp.role_id('1-to-1 Read')
    ok('Flow 5: new assessment → private (Owners FC + only that person with 1-to-1 Edit) and E9 with a ?wbId link', st == 'Succeeded' and
       it['unique'] and it['ra'].get(3) == {fsp.FULL} and it['ra'].get(11) == {edit} and 12 not in it['ra'] and
       sp.emails[-1]['to'] == 'alex.morgan@example.test' and '?wbId={0}"'.format(it['id']) in sp.emails[-1]['body'], (st, eng and eng.log, it['ra']))
    ok('Flow 5: the list itself stays Owners-only', wb['ra'] == {3: {fsp.FULL}}, wb['ra'])
    n = len(sp.emails)
    st, _ = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-20T09:10:00'))
    ok('Flow 5: draft saves by the person change nothing', st == 'Succeeded' and len(sp.emails) == n and it['ra'].get(11) == {edit})
    # the person submits – and also tries to pre-fill the manager's part, mark it Completed and give it to someone else
    sp.me = 11
    sp.write_item(wb, it['id'], {'item/AnswersJson': '{"d1":{"app":"Y","issue":"Y","help":"x"}}', 'item/AssessmentStatus/Value': 'Completed',
                                 'item/ArrangementsJson': '[{"text":"fake"}]', 'item/ManagerNotes': 'approved', 'item/NextReviewDate': '2030-01-01',
                                 'item/CompletedOn': '2026-10-21T09:00:00Z', 'item/Technician/Claims': sp.users[12]['Claims']})
    sp.me = 10
    st, eng = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-21T09:05:00'))
    f = it['fields']
    ok('Flow 5: submission locks it (1-to-1 Read) whatever status was set', st == 'Succeeded' and it['ra'].get(11) == {read} and
       f['AssessmentStatus'] == 'Submitted' and f.get('SubmittedOn'), (st, eng and eng.log, it['ra'], f.get('AssessmentStatus')))
    ok('Flow 5 (D.7): anything the person wrote in the manager\'s fields is wiped and the owner restored',
       not f.get('ArrangementsJson') and not f.get('ManagerNotes') and not f.get('NextReviewDate') and not f.get('CompletedOn') and
       f['Technician'] == 11 and 12 not in it['ra'], f)
    ok('Flow 5: answers kept', 'd1' in f['AnswersJson'])
    ok('Flow 5: E10 to the TL', sp.emails[-1]['to'] == 'team.leader@example.test' and sp.emails[-1]['subject'] == 'Wellbeing assessment submitted: Alex Morgan')
    n = len(sp.emails)
    st, _ = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-21T09:10:00'))
    ok('Flow 5: its own update re-triggers harmlessly', st == 'Succeeded' and len(sp.emails) == n and f['AssessmentStatus'] == 'Submitted')
    # the TL completes it
    sp.write_item(wb, it['id'], {'item/ArrangementsJson': '[{"text":"Call cut-off 20:00"}]', 'item/NextReviewDate': '2027-03-10',
                                 'item/AssessmentStatus/Value': 'Completed'})
    st, eng = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-11-02T15:00:00'))
    ok('Flow 5: completion stamps CompletedOn, keeps the arrangements and emails the person (E11)', st == 'Succeeded' and f.get('CompletedOn') and
       'Call cut-off' in f['ArrangementsJson'] and sp.emails[-1]['to'] == 'alex.morgan@example.test' and it['ra'].get(11) == {read}, (st, eng and eng.log))
    n = len(sp.emails)
    st, _ = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-11-02T15:05:00'))
    ok('Flow 5: no second completion email', st == 'Succeeded' and len(sp.emails) == n)
    # Flow 1: reminder days from Settings, wellbeing review reminders
    settings = sp.list_by_title('1-to-1 Settings')
    rid = next(i['id'] for i in settings['items'].values() if i['fields'].get('Title') == 'Reminders')
    sp.write_item(settings, rid, {'item/Value': '[15]'})
    st1, eng1 = run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    n = len(sp.emails)
    run('1', sp, T('2026-11-20T07:00:00'), overrides={'varTestDate': '2026-11-20T07:00:00'})
    none20 = not any(e['subject'].startswith('Reminder:') for e in sp.emails[n:])
    n = len(sp.emails)
    run('1', sp, T('2026-11-15T07:00:00'), overrides={'varTestDate': '2026-11-15T07:00:00'})
    ok('Flow 1: reminder days come from 1-to-1 Settings (15th, not the 20th)', st1 == 'Succeeded' and none20 and
       any(e['subject'].startswith('Reminder:') and e['to'] == 'alex.morgan@example.test' for e in sp.emails[n:]), eng1.log)
    sp.write_item(settings, rid, {'item/Value': 'nonsense'})
    st, eng = run('1', sp, T('2026-11-16T07:00:00'), overrides={'varTestDate': '2026-11-16T07:00:00'})
    ok('Flow 1: a hand-edited, invalid reminder value never fails the run', st == 'Succeeded', eng.log)
    # Flow 1: wellbeing (E12) and appraisal (E17) reminders from the dates the TL keeps on the Technicians list
    tf = techs['items'][alex['id']]['fields']
    sp.write_item(techs, alex['id'], {'item/NextWellbeingDate': '2027-03-10'})
    def subj_on(day, prefix):
        m = len(sp.emails)
        st_, eng_ = run('1', sp, T(day + 'T07:00:00'), overrides={'varTestDate': day + 'T07:00:00'})
        return st_, eng_, [e for e in sp.emails[m:] if e['subject'].startswith(prefix)]
    def subjects(r):
        return [e['subject'] for e in r[2]]
    r = subj_on('2027-03-03', 'Wellbeing assessment')
    ok('Flow 1: TL emailed 7 days before the next wellbeing date on the Team record, with a link', r[0] == 'Succeeded' and len(r[2]) == 1 and
       r[2][0]['to'] == 'team.leader@example.test' and 'due in 7 days: Alex Morgan' in r[2][0]['subject'] and '10-Mar-2027' in r[2][0]['body'] and
       'href=' in r[2][0]['body'], (r[0], r[2], r[1] and r[1].log[-5:]))
    sp.dates_as_instants = True
    r = subj_on('2027-03-10', 'Wellbeing assessment')
    sp.dates_as_instants = False
    ok('Flow 1: and on the day (date returned as a UTC instant)', subjects(r) == ['Wellbeing assessment due today: Alex Morgan'], subjects(r))
    ok('Flow 1: no wellbeing email on the days in between', subj_on('2027-03-05', 'Wellbeing assessment')[2] == [] and subj_on('2027-03-16', 'Wellbeing assessment')[2] == [])
    r17, r20, r24 = subj_on('2027-03-17', 'Wellbeing assessment'), subj_on('2027-03-20', 'Wellbeing assessment'), subj_on('2027-03-24', 'Wellbeing assessment')
    ok('Flow 1: while overdue, a wellbeing reminder every 7 days (7 and 14 days after), not in between', subjects(r17) == ['Wellbeing assessment overdue: Alex Morgan'] and
       'was due 7 days ago' in r17[2][0]['body'] and r20[2] == [] and subjects(r24) == ['Wellbeing assessment overdue: Alex Morgan'], (subjects(r17), subjects(r20), subjects(r24)))
    # summer time: a 10 June date comes back as 2027-06-09T23:00:00Z
    sp.write_item(techs, alex['id'], {'item/NextWellbeingDate': '2027-06-10'})
    sp.dates_as_instants = True
    r3, r9, r10 = subj_on('2027-06-03', 'Wellbeing'), subj_on('2027-06-09', 'Wellbeing'), subj_on('2027-06-10', 'Wellbeing')
    sp.dates_as_instants = False
    ok('Flow 1 (BST): a June date is reminded 7 days before and on the day, not the day before', subjects(r3) == ['Wellbeing assessment due in 7 days: Alex Morgan']
       and r9[2] == [] and subjects(r10) == ['Wellbeing assessment due today: Alex Morgan'], (subjects(r3), subjects(r9), subjects(r10)))
    sp.write_item(techs, alex['id'], {'item/Active': False})
    ok('Flow 1: no wellbeing reminder for someone no longer active', subj_on('2027-06-10', 'Wellbeing')[2] == [])
    sp.write_item(techs, alex['id'], {'item/Active': True})
    sp.write_item(techs, alex['id'], {'item/NextWellbeingDate': None})
    rnone = subj_on('2027-06-10', 'Wellbeing')
    ok('Flow 1: no wellbeing date set – no reminder and no error', rnone[0] == 'Succeeded' and rnone[2] == [] and
       not any(e['subject'] == '1-to-1 system: action needed' for e in sp.emails[-3:]))
    # appraisal reminders (E17) from AppraisalDate, same pattern
    sp.write_item(techs, alex['id'], {'item/AppraisalDate': '2027-07-01'})
    a24, a01, a05, a08 = (subj_on(d, 'Appraisal') for d in ('2027-06-24', '2027-07-01', '2027-07-05', '2027-07-08'))
    ok('Flow 1: appraisal reminders (E17) 7 days before, on the day and weekly while overdue', subjects(a24) == ['Appraisal due in 7 days: Alex Morgan'] and
       subjects(a01) == ['Appraisal due today: Alex Morgan'] and a05[2] == [] and subjects(a08) == ['Appraisal overdue: Alex Morgan'] and
       'Mark appraisal completed' in a24[2][0]['body'], (subjects(a24), subjects(a01), subjects(a05), subjects(a08)))
    # a value the flow can't read never stops the run: the problem email says so
    saved = tf.get('NextWellbeingDate')
    tf['NextWellbeingDate'] = 'garbage'
    m = len(sp.emails)
    st, eng = run('1', sp, T('2027-07-02T07:00:00'), overrides={'varTestDate': '2027-07-02T07:00:00'})
    tf['NextWellbeingDate'] = saved
    e7 = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1: if the date reminders fail, the run still finishes and the daily problem email says so', st == 'Succeeded' and len(e7) == 1 and
       'reminders could not all be checked' in e7[0]['body'], (st, eng.log[-5:] if eng else None, [e['subject'] for e in sp.emails[m:]]))

    # upgrade safety: a site set up with 1.0 (no wellbeing list, no Reminders item) keeps working with 1.1's Flow 1
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    for lid in [k for k, l in sp.lists.items() if l['url'] == 'WellbeingAssessments']:
        del sp.lists[lid]
    st_l = sp.list_by_title('1-to-1 Settings')
    for iid in [k for k, i in st_l['items'].items() if i['fields'].get('Title') == 'Reminders']:
        del st_l['items'][iid]
    techs = sp.list_by_title('Technicians')
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})
    run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    n = len(sp.emails)
    st, eng = run('1', sp, T('2026-11-27T07:00:00'), overrides={'varTestDate': '2026-11-27T07:00:00'})
    ok('Upgrade: before setup is re-run, Flow 1 still works and reminds on the default 27th', st == 'Succeeded' and
       any(e['subject'].startswith('Reminder:') for e in sp.emails[n:]), eng.log)



def feedback_checks():
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    fb = sp.list_by_title('1-to-1 Feedback')
    # Alex sends a fault from the page (item created as Alex; inherits the list: group Contribute, own items only)
    sp.me = 11
    it = sp.write_item(fb, None, {'item/Title': 'Date box <b>rejects</b> 31/12', 'item/FeedbackType/Value': 'Fault',
                                  'item/Message': 'Typing 31/12/2026 <script>alert(1)</script> & pressing Tab\nclears it',
                                  'item/PageName': 'This month', 'item/AppVersion': '4.3.0'})
    sp.me = 10
    ok('Fake: a new feedback item is Pending', it['fields'].get('DeliveryStatus') == 'Pending')
    n = len(sp.emails)
    st, eng = fire('6', sp, '1-to-1 Feedback', it['id'], T('2026-10-20T09:00:00'))
    e = sp.emails[-1] if len(sp.emails) > n else {}
    ok('Flow 6: the item is locked to Owners only (the sender can no longer see or change it)', st == 'Succeeded' and it['unique'] and
       it['ra'].get(3) == {fsp.FULL} and 11 not in it['ra'] and not any(k not in (3, 10) for k in it['ra']), (st, eng and eng.log, it['ra']))
    ok('Flow 6: E13 to the TL names the sender, type, page and version', len(sp.emails) == n + 1 and e.get('to') == 'team.leader@example.test' and
       e['subject'].startswith('1-to-1 feedback (Fault): ') and 'Alex Morgan' in e['body'] and 'alex.morgan@example.test' in e['body'] and
       'This month' in e['body'] and '4.3.0' in e['body'], e)
    ok('Flow 6: what they typed is HTML-escaped in the email', '&lt;script&gt;' in e.get('body', '') and '<script>' not in e.get('body', '') and
       '&amp; pressing' in e.get('body', ''), e.get('body'))
    ok('Flow 6: SentOn stamped and DeliveryStatus = Sent', it['fields'].get('SentOn') and it['fields'].get('DeliveryStatus') == 'Sent', it['fields'])
    n = len(sp.emails)
    st, _ = fire('6', sp, '1-to-1 Feedback', it['id'], T('2026-10-20T09:05:00'))
    ok('Flow 6: its own update does not run it again (no second email)', st in ('NotTriggered', 'Cancelled') and len(sp.emails) == n, st)
    # the mail service refuses the email
    sp.me = 12
    it2 = sp.write_item(fb, None, {'item/Title': 'Idea', 'item/FeedbackType/Value': 'Suggestion', 'item/Message': 'Dark mode please',
                                   'item/PageName': 'My appraisal', 'item/AppVersion': '4.3.0'})
    sp.me = 10
    sp.fail_mail = ['1-to-1 feedback (']
    n = len(sp.emails)
    st, eng = fire('6', sp, '1-to-1 Feedback', it2['id'], T('2026-10-21T09:00:00'))
    sp.fail_mail = []
    new = sp.emails[n:]
    ok('Flow 6 (email fails): the item is still locked and marked Failed', it2['unique'] and 12 not in it2['ra'] and
       it2['fields'].get('DeliveryStatus') == 'Failed' and not it2['fields'].get('SentOn'), it2['fields'])
    ok('Flow 6 (email fails): the TL gets a short notice without the content, and the run ends Failed', st == 'Failed' and len(new) == 1 and
       new[0]['to'] == 'team.leader@example.test' and 'could not be delivered' in new[0]['subject'] and 'Dark mode' not in new[0]['body'],
       (st, new))
    n = len(sp.emails)
    st, _ = fire('6', sp, '1-to-1 Feedback', it2['id'], T('2026-10-21T09:05:00'))
    ok('Flow 6 (email fails): marking it Failed does not set off a retry loop', st in ('NotTriggered', 'Cancelled') and len(sp.emails) == n, st)
    # nothing at all can be emailed: the run still ends Failed (Power Automate's own failure notice) and the item says Failed
    sp.me = 11
    it3 = sp.write_item(fb, None, {'item/Title': 'x', 'item/FeedbackType/Value': 'Improvement', 'item/Message': 'x', 'item/PageName': 'p', 'item/AppVersion': 'v'})
    sp.me = 10
    sp.fail_mail = ['1-to-1 feedback']
    st, _ = fire('6', sp, '1-to-1 Feedback', it3['id'], T('2026-10-22T09:00:00'))
    sp.fail_mail = []
    ok('Flow 6 (mail service down): run Failed, item Failed, still locked', st == 'Failed' and it3['fields'].get('DeliveryStatus') == 'Failed' and
       11 not in it3['ra'], (st, it3['fields']))
    # the sender can't stop their item being locked by pre-setting the delivery columns
    for forged in ({'item/DeliveryStatus/Value': 'Sent'}, {'item/SentOn': '2026-10-22T08:00:00Z'}, {'item/DeliveryStatus/Value': 'Failed'}):
        sp.me = 11
        f = sp.write_item(fb, None, dict({'item/Title': 'forged', 'item/FeedbackType/Value': 'Fault', 'item/Message': 'x', 'item/PageName': 'p', 'item/AppVersion': 'v'}, **forged))
        sp.me = 10
        n = len(sp.emails)
        st, _ = fire('6', sp, '1-to-1 Feedback', f['id'], T('2026-10-22T10:00:00'))
        ok('Flow 6: a sender pre-setting {0} is still locked and emailed'.format(list(forged)[0].split('/')[1]), st == 'Succeeded' and f['unique'] and
           11 not in f['ra'] and f['fields'].get('DeliveryStatus') == 'Sent' and len(sp.emails) == n + 1, (st, f['fields']))
    # flood guard: from the 11th message in 24 hours, items are kept (Held) and locked, but not emailed one by one
    fb2 = fsp.FakeSP(); run('0', fb2, T('2026-10-14T09:00:00')); L2 = fb2.list_by_title('1-to-1 Feedback')
    fb2.clock = '2026-10-23T09:00:00Z'
    sent = []
    for k in range(12):
        fb2.me = 11
        it_k = fb2.write_item(L2, None, {'item/Title': 'msg %d' % k, 'item/FeedbackType/Value': 'Suggestion', 'item/Message': 'm', 'item/PageName': 'p', 'item/AppVersion': 'v'})
        fb2.me = 10
        n = len(fb2.emails)
        st, _ = fire('6', fb2, '1-to-1 Feedback', it_k['id'], T('2026-10-23T09:05:00'))
        sent.append((st, len(fb2.emails) - n, it_k['fields'].get('DeliveryStatus'), it_k['unique']))
    ok('Flow 6: a flood is capped – 10 emails, then items are Held (still locked, not emailed)',
       [x[1] for x in sent] == [1] * 10 + [0, 0] and [x[2] for x in sent[10:]] == ['Held', 'Held'] and all(x[3] for x in sent), sent)
    fb2.clock = '2026-10-24T09:10:00Z'
    fb2.me = 11
    it_n = fb2.write_item(L2, None, {'item/Title': 'next day', 'item/FeedbackType/Value': 'Suggestion', 'item/Message': 'm', 'item/PageName': 'p', 'item/AppVersion': 'v'})
    fb2.me = 10
    n = len(fb2.emails)
    fire('6', fb2, '1-to-1 Feedback', it_n['id'], T('2026-10-24T09:15:00'))
    ok('Flow 6: the next day they are emailed again', len(fb2.emails) == n + 1 and it_n['fields'].get('DeliveryStatus') == 'Sent')



def qa_regression_checks():
    """Bugs found by adversarial testing (16-Oct-2026)."""
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    techs, mr, mgr = sp.list_by_title('Technicians'), sp.list_by_title('Monthly Reviews'), sp.list_by_title('Manager Reviews')
    gid = next(g for g, d in sp.groups.items() if d['Title'] == '1-to-1 Technicians')
    alex = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/TechnicianAadId': 'aad-alex'})
    sam = sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})
    fire('4', sp, 'Technicians', alex['id'], T('2026-10-15T10:00:00'))
    fire('4', sp, 'Technicians', sam['id'], T('2026-10-15T10:01:00'))
    run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    # deactivated people get no reminders
    sp.write_item(techs, sam['id'], {'item/Active': False})
    n = len(sp.emails)
    run('1', sp, T('2026-11-20T07:00:00'), overrides={'varTestDate': '2026-11-20T07:00:00'})
    rem = [e for e in sp.emails[n:] if e['subject'].startswith('Reminder:')]
    ok('Flow 1: reminders go only to people still active (not to a deactivated person)', len(rem) == 1 and rem[0]['to'] == 'alex.morgan@example.test', rem)
    sp.write_item(techs, sam['id'], {'item/Active': True})
    # a duplicate row being deactivated must not remove a person who still has an Active row
    dup = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims']})
    fire('4', sp, 'Technicians', dup['id'], T('2026-11-21T10:00:00'))
    sp.write_item(techs, dup['id'], {'item/Active': False})
    n = len(sp.emails)
    st, eng = fire('4', sp, 'Technicians', dup['id'], T('2026-11-21T10:05:00'))
    ok('Flow 4: deactivating a duplicate row keeps access while another row is Active', st == 'Succeeded' and 11 in sp.groups[gid]['members'] and
       not any('access removed' in e['subject'] for e in sp.emails[n:]), (st, eng and eng.log, [e['subject'] for e in sp.emails[n:]]))
    # submitted at 23:58 on the deadline day, flow runs at 00:02 next month: on time, stamped with the submission time
    r_alex = next(i for i in mr['items'].values() if i['fields'].get('TechnicianAadId', 'aad-alex') and i['fields'].get('Title', '').startswith('Alex'))
    sp.me = 11
    sp.write_item(mr, r_alex['id'], {'item/ReviewStatus/Value': 'Submitted'})
    sp.me = 10
    r_alex['fields']['Modified'] = '2026-11-30T23:58:00Z'
    n = len(sp.emails)
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-12-01T00:02:00'))
    m_alex = next(i for i in mgr['items'].values() if str(i['fields'].get('ReviewItemId', '')).split('.')[0] == str(r_alex['id']))
    ok('Flow 2: a submission just before the deadline is on time, even if the flow runs after midnight', st == 'Succeeded' and
       m_alex['fields'].get('SubmittedLate') is False and str(m_alex['fields'].get('SubmittedOn', '')).startswith('2026-11-30T23:58') and
       any('on time' in e['body'] for e in sp.emails[n:]), (st, eng and eng.log, m_alex['fields'].get('SubmittedOn'), m_alex['fields'].get('SubmittedLate')))
    r_sam = next(i for i in mr['items'].values() if i['fields'].get('Title', '').startswith('Sam'))
    sp.me = 12
    sp.write_item(mr, r_sam['id'], {'item/ReviewStatus/Value': 'Submitted'})
    sp.me = 10
    r_sam['fields']['Modified'] = '2026-11-02T08:00:00Z'   # back-dated by the technician
    st, eng = fire('2', sp, 'Monthly Reviews', r_sam['id'], T('2026-12-03T09:00:00'))
    m_sam = next(i for i in mgr['items'].values() if str(i['fields'].get('ReviewItemId', '')).split('.')[0] == str(r_sam['id']))
    ok('Flow 2: a Modified time more than 30 minutes old is not trusted (no back-dating)', st == 'Succeeded' and m_sam['fields'].get('SubmittedLate') is True,
       (st, m_sam['fields'].get('SubmittedOn')))



def wellbeing_hardening_checks():
    """Security review (16-Oct-2026): Flow 5 trusts only the item permission, never columns the person can edit."""
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-14T09:00:00'))
    wb = sp.list_by_title('Wellbeing Assessments')
    edit = sp.role_id('1-to-1 Edit')
    it = sp.write_item(wb, None, {'item/Title': 'Alex Morgan – wellbeing assessment', 'item/Technician/Claims': sp.users[11]['Claims']})
    fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-20T09:00:00'))
    # while it's open, Alex re-labels it as Sam's and fakes the submitted stamp and manager notes
    sp.me = 11
    sp.write_item(wb, it['id'], {'item/Technician/Claims': sp.users[12]['Claims'], 'item/SubmittedOn': '2026-10-20T09:01:00Z', 'item/ManagerNotes': 'approved'})
    sp.me = 10
    st, eng = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-20T09:05:00'))
    f = it['fields']
    ok('Flow 5: while open, the person column, stamps and manager fields are put back on the next run', st == 'Succeeded' and f['Technician'] == 11 and
       not f.get('SubmittedOn') and not f.get('ManagerNotes') and f.get('AssessmentStatus') == 'Open' and it['ra'].get(11) == {edit}, (st, eng and eng.log, f))
    # a second person holding it (owner-side permission mistake): stop, don't guess
    it['ra'][12] = {edit}
    st, _ = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-20T09:10:00'))
    ok('Flow 5: two people holding one assessment → the run fails (TL emailed), nothing changed', st == 'Failed' and it['ra'].get(11) == {edit})
    del it['ra'][12]
    # a submitted assessment that nobody holds any more is never re-shared
    sp.me = 11
    sp.write_item(wb, it['id'], {'item/AssessmentStatus/Value': 'Submitted'})
    sp.me = 10
    fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-21T09:00:00'))
    it['ra'] = {k: v for k, v in it['ra'].items() if k != 11}   # e.g. the person was removed from the site
    n = len(sp.emails)
    st, _ = fire('5', sp, 'Wellbeing Assessments', it['id'], T('2026-10-22T09:00:00'))
    ok('Flow 5: a submitted assessment nobody holds any more is not re-shared (run fails, TL told)', st == 'Failed' and 11 not in it['ra'] and
       not any(e['subject'] == 'Your wellbeing assessment is ready to complete' for e in sp.emails[n:]) and it['fields'].get('AssessmentStatus') == 'Submitted')


def v14_checks():
    """Solution 1.4: appraisal boundaries copied to the technician's review, expectation order / no cap / year carry-over,
    Flow 2 ignoring Team Leader amendments, the missed-submission check, Flow 8 amendment notices, retiring challenges."""
    sp = fsp.FakeSP()
    # a 1.3 site: the challenges list exists with the technicians group on it, an item made private, a challenge open
    run('0', sp, T('2026-10-14T09:00:00'))
    from schema import RETIRED_LISTS
    ch_spec = RETIRED_LISTS[0]
    ch = sp._new_list(ch_spec['title'], ch_spec['url'], '')
    gid = next(g for g, d in sp.groups.items() if d['Title'] == '1-to-1 Technicians')
    ch['unique'], ch['ra'] = True, {3: {fsp.FULL}, gid: {sp.role_id('1-to-1 Submit')}}
    ch['items'][1] = {'id': 1, 'fields': {'Title': 'challenge'}, 'unique': True, 'ra': {3: {fsp.FULL}, 11: {sp.role_id('1-to-1 Submit')}}, 'author': 11}
    ch['next'] = 2
    techs, mgr, mr, exp = (sp.list_by_title(t) for t in ('Technicians', 'Manager Reviews', 'Monthly Reviews', 'Appraisal Expectations'))
    old_mr = sp.write_item(mgr, None, {'item/Title': 'Alex – 2026-09', 'item/ReviewKey': 'aad-alex_2026-09', 'item/MonthKey': '2026-09',
                                       'item/ReviewState/Value': 'Completed'})
    if 'ChallengeState' in mgr['fields']:
        old_mr['fields']['ChallengeState'] = 'Open'
    st, eng = run('0', sp, T('2026-10-15T09:00:00'))
    ok('Setup 1.4: re-run on a 1.3 site succeeds and adds the Amendments list', st == 'Succeeded' and
       any(l['url'] == 'OneToOneAmendments' for l in sp.lists.values()), eng.log)
    am = sp.list_by_title('1-to-1 Amendments')
    ok('Setup 1.4: Amendments list is Owners only (no group access) with versioning', am['unique'] and am['ra'] == {3: {fsp.FULL}} and
       am['props']['EnableVersioning'] is True, (am['ra'], am['props']))
    ok('Setup 1.4: Technicians and Monthly Reviews have the new date / period columns',
       {'NextWellbeingDate', 'AppraisalCycleStart', 'AppraisalHistoryJson', 'AppraisalBoundaries'} <= set(techs['fields']) and 'AppraisalBoundaries' in mr['fields'])
    ok('Setup 1.4: challenges retired – the technicians group is off the list, items back to Owners only, data kept',
       gid not in ch['ra'] and not ch['items'][1]['unique'] and len(ch['items']) == 1, (ch['ra'], ch['items'][1]))
    if 'ChallengeState' in mgr['fields']:
        ok('Setup 1.4: an open challenge is closed as Not agreed (nothing deleted)', old_mr['fields'].get('ChallengeState') == 'Not agreed', old_mr['fields'].get('ChallengeState'))
    snap = json.dumps({l['url']: (sorted(l['fields']), {k: sorted(v) for k, v in l['ra'].items()}, len(l['items'])) for l in sp.lists.values()}, sort_keys=True)
    st2, eng2 = run('0', sp, T('2026-10-15T09:30:00'))
    snap2 = json.dumps({l['url']: (sorted(l['fields']), {k: sorted(v) for k, v in l['ra'].items()}, len(l['items'])) for l in sp.lists.values()}, sort_keys=True)
    ok('Setup 1.4: a second run changes nothing', st2 == 'Succeeded' and snap == snap2 and not eng2.log, eng2.log)

    # Flow 1: boundaries, order, no cap, years
    alex = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/TechnicianAadId': 'aad-alex',
                                       'item/AppraisalDate': '2027-02-12', 'item/AppraisalBoundaries': '["2025-01-10","2026-02-20"]'})
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})
    for i in range(12):
        sp.write_item(exp, None, {'item/Title': 'Shared {0}'.format(i + 1), 'item/AppraisalYear': '2026/27', 'item/SortOrder': 100 + i})
    sp.write_item(exp, None, {'item/Title': 'Carried over from last year', 'item/AppraisalYear': '2025/26', 'item/SortOrder': 200})
    sp.write_item(exp, None, {'item/Title': 'No year', 'item/SortOrder': 300})
    sp.write_item(exp, None, {'item/Title': 'Next year, entered early', 'item/AppraisalYear': '2027/28', 'item/SortOrder': 1})
    sp.write_item(exp, None, {'item/Title': 'Mistyped year', 'item/AppraisalYear': '26/27 oops', 'item/SortOrder': 2})
    sp.write_item(exp, None, {'item/Title': 'Alex individual', 'item/AppraisalYear': '2026/27', 'item/AppliesTo/Value': 'Individual',
                              'item/Technician/Claims': sp.users[11]['Claims'], 'item/SortOrder': 1})
    n = len(sp.emails)
    st, eng = run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    ok('Flow 1 (1.4): run succeeds', st == 'Succeeded', eng.log)
    m_alex = next(i for i in mgr['items'].values() if i['fields'].get('Technician') == 11 and i['fields'].get('MonthKey') == '2026-11')
    r_alex = mr['items'][m_alex['fields']['ReviewItemId']]
    titles = [x['title'] for x in json.loads(m_alex['fields']['ExpectationSnapshotJson'])]
    ok('Flow 1 (1.4): no limit of 10 – all 14 shared that apply, then the individual one', len(titles) == 15 and titles[-1] == 'Alex individual' and
       titles[:12] == ['Shared {0}'.format(i + 1) for i in range(12)], titles)
    ok('Flow 1 (1.4): an earlier year carries on, no year always applies; next year and a mistyped year stay out',
       'Carried over from last year' in titles and 'No year' in titles and 'Next year, entered early' not in titles and 'Mistyped year' not in titles, titles)
    ok('Flow 1 (1.4): the period boundaries are copied to the technician\'s own review', json.loads(r_alex['fields'].get('AppraisalBoundaries') or '[]') == ['2025-01-10', '2026-02-20'],
       r_alex['fields'].get('AppraisalBoundaries'))
    r_sam = next(i for i in mr['items'].values() if i['fields'].get('Technician') == 12)
    ok('Flow 1 (1.4): no boundaries to copy – the column is left empty and nothing fails', not r_sam['fields'].get('AppraisalBoundaries'))
    # April: the earlier year's expectations do not disappear
    st, eng = run('1', sp, T('2027-04-01T07:00:00'), overrides={'varTestDate': '2027-04-01T07:00:00'})
    m_apr = next(i for i in mgr['items'].values() if i['fields'].get('Technician') == 11 and i['fields'].get('MonthKey') == '2027-04')
    t_apr = [x['title'] for x in json.loads(m_apr['fields']['ExpectationSnapshotJson'])]
    ok('Flow 1 (1.4): in April the 2026/27 expectations carry on and the 2027/28 one starts', st == 'Succeeded' and 'Shared 1' in t_apr and
       'Next year, entered early' in t_apr and 'Mistyped year' not in t_apr, t_apr)

    # Flow 2: a TL amendment is not a submission; a real submission is always processed
    sp.me = 11
    sp.write_item(mr, r_alex['id'], {'item/Q1WentWell': 'Done', 'item/ReviewStatus/Value': 'Submitted'})
    sp.me = 10
    sp.write_item(mr, r_alex['id'], {'item/AppraisalBoundaries': '["2025-01-10","2026-02-20"]'})   # the TL's account touches it before Flow 2 ran
    n = len(sp.emails)
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-10T12:05:00'))
    ok('Flow 2 (1.4): a submission is processed even when the TL\'s account changed it before the flow ran', st == 'Succeeded' and
       m_alex['fields']['ReviewState'] == 'Submitted' and any(e['subject'].startswith('1-to-1 submitted') for e in sp.emails[n:]), (st, eng and eng.log))
    n, ra_before = len(sp.emails), json.dumps({k: sorted(v) for k, v in r_alex['ra'].items()})
    sp.write_item(mr, r_alex['id'], {'item/Q1WentWell': 'Amended by the TL'})
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-12T09:00:00'))
    ok('Flow 2 (1.4): a TL amendment after processing is cancelled – no email, no re-stamp, permissions unchanged', st == 'Cancelled' and len(sp.emails) == n and
       json.dumps({k: sorted(v) for k, v in r_alex['ra'].items()}) == ra_before, (st, eng and eng.log))
    # an edit that claims to be the TL's (Editor) never skips the lock: a technician left with Edit by a failed step loses it
    r_alex['ra'][11] = {sp.role_id('1-to-1 Edit')}
    sp.write_item(mr, r_alex['id'], {'item/Q1WentWell': 'Edited after the lock failed'})   # sp.me is the TL: Editor = TL
    st, eng = fire('2', sp, 'Monthly Reviews', r_alex['id'], T('2026-11-12T09:30:00'))
    ok('Flow 2 (1.4): the lock is re-applied before an amendment run is cancelled (Edit taken back to Read)', st == 'Cancelled' and
       r_alex['ra'].get(11) == {sp.role_id('1-to-1 Read')}, (st, r_alex['ra']))
    # Flow 1: a submitted review whose Manager Review is still Open (Flow 2 never ran) is reported
    r_sam['fields']['Title'] = '<a href="https://evil.example/x">Open the run</a><img src=x>'
    r_sam['fields']['ReviewStatus'] = 'Submitted'
    m = len(sp.emails)
    run('1', sp, T('2026-11-12T07:00:00'), overrides={'varTestDate': '2026-11-12T07:00:00'})
    e7 = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1 (1.4): a submission Flow 2 never processed is reported to the TL, its (technician-editable) title escaped', len(e7) == 1 and 'submitted but not processed' in e7[0]['body'] and
       '&lt;a href=' in e7[0]['body'] and 'evil.example/x">' not in e7[0]['body'] and '<img' not in e7[0]['body'], [e['body'][:300] for e in e7])

    # Flow 8: amendment notices
    def amend(status):
        return sp.write_item(am, None, {'item/Title': 'Alex Morgan – November 2026', 'item/ReviewItemId': r_alex['id'], 'item/ManagerReviewId': m_alex['id'],
                                        'item/MonthKey': '2026-11', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/Reason': 'SECRET reason text',
                                        'item/ChangedFields': 'Q1 What has gone well', 'item/ChangesJson': '[{"f":"Q1WentWell","b":"SECRET before","a":"SECRET after"}]',
                                        'item/NotifyStatus/Value': status})
    a1 = amend('Draft')
    st, _ = fire('8', sp, '1-to-1 Amendments', a1['id'], T('2026-11-12T10:00:00'))
    ok('Flow 8: a Draft (the review not written yet) never sends', st == 'NotTriggered')
    a1['fields']['NotifyStatus'] = 'Pending'
    n = len(sp.emails)
    stale = sp.item_out(am, a1)
    st, eng = fire('8', sp, '1-to-1 Amendments', a1['id'], T('2026-11-12T10:05:00'))
    e16 = sp.emails[n:]
    ok('Flow 8: Pending → one email to the technician, then Sent with NotifiedOn', st == 'Succeeded' and len(e16) == 1 and e16[0]['to'] == 'alex.morgan@example.test' and
       a1['fields']['NotifyStatus'] == 'Sent' and a1['fields'].get('NotifiedOn'), (st, eng and eng.log, e16))
    ok('Flow 8: the email names the month and links to the review, with no changes or reason in it', e16 and 'November 2026' in e16[0]['body'] and
       '?reviewId={0}"'.format(r_alex['id']) in e16[0]['body'] and 'SECRET' not in e16[0]['body'] + e16[0]['subject'], e16)
    st, _ = fire('8', sp, '1-to-1 Amendments', a1['id'], T('2026-11-12T10:10:00'))
    ok('Flow 8: its own Sent update does not start it again', st == 'NotTriggered')
    n = len(sp.emails)
    st, eng = run('8', sp, T('2026-11-12T10:11:00'), stale)
    ok('Flow 8: a second, stale trigger re-reads the item and sends nothing', st == 'Cancelled' and len(sp.emails) == n, (st, eng.log))
    a2 = amend('Pending')
    sp.fail_mail = ['has been amended']
    n = len(sp.emails)
    st, eng = fire('8', sp, '1-to-1 Amendments', a2['id'], T('2026-11-12T11:00:00'))
    sp.fail_mail = []
    ok('Flow 8: a failed email → Failed with a reason on the record, a notice to the TL, run Failed', st == 'Failed' and a2['fields']['NotifyStatus'] == 'Failed' and
       a2['fields'].get('NotifyError') and any(e['to'] == 'team.leader@example.test' and 'not sent' in e['subject'] for e in sp.emails[n:]), (st, a2['fields'], sp.emails[n:]))
    sp.write_item(am, a2['id'], {'item/NotifyStatus/Value': 'Retry'})
    n = len(sp.emails)
    st, eng = fire('8', sp, '1-to-1 Amendments', a2['id'], T('2026-11-12T11:30:00'))
    ok('Flow 8: Retry (Resend on the page) sends it and clears the error', st == 'Succeeded' and a2['fields']['NotifyStatus'] == 'Sent' and
       not a2['fields'].get('NotifyError') and len(sp.emails) == n + 1, (st, eng and eng.log, a2['fields']))
    for status in ('Cancelled', 'Sending', 'Failed'):
        a3 = amend(status)
        ok('Flow 8: {0} never triggers a send'.format(status), fire('8', sp, '1-to-1 Amendments', a3['id'], T('2026-11-12T12:00:00'))[0] == 'NotTriggered')


def v15_checks():
    """Solution 1.5 – the action tracker: Setup, Flow 3 / Flow 1 adding agreed actions (after the tracker started only,
    once each, finishing a partial release), Flow 9 permissions, Flow 10 technician updates (identity from the folder,
    forged ids, etag concurrency, retries), Flow 11 emails (claim, Sent / Failed / Retry), Flow 1 deadline reminders."""
    sp = fsp.FakeSP()
    sp.clock = '2026-10-31T09:00:00Z'
    run('0', sp, T('2026-10-31T09:00:00'))
    act, upd, notc = (sp.list_by_title(t) for t in ('1-to-1 Actions', '1-to-1 Action Updates', '1-to-1 Action Notices'))
    techs, mgr, mr, settings = (sp.list_by_title(t) for t in ('Technicians', 'Manager Reviews', 'Monthly Reviews', '1-to-1 Settings'))
    start = [i for i in settings['items'].values() if i['fields'].get('Title') == 'ActionsTrackerStart']
    ok('Setup 1.5: the action lists exist – Owners only, unique keys, folders allowed for updates',
       act['ra'] == {3: {fsp.FULL}} and upd['ra'] == {3: {fsp.FULL}} and notc['ra'] == {3: {fsp.FULL}} and
       act['fields']['ActionKey']['EnforceUniqueValues'] and upd['fields']['ClientKey']['EnforceUniqueValues'] and
       notc['fields']['NoticeKey']['EnforceUniqueValues'] and upd['props']['EnableFolderCreation'] is True and
       'ActionsSyncedOn' in mgr['fields'], (act['ra'], upd['props']))
    ok('Setup 1.5: the tracker start is recorded once', len(start) == 1 and start[0]['fields']['Value'].startswith('2026-10-31T09:00'))
    run('0', sp, T('2026-11-02T09:00:00'))
    start2 = [i for i in settings['items'].values() if i['fields'].get('Title') == 'ActionsTrackerStart']
    ok('Setup 1.5: a re-run keeps the original start (nothing old is pulled in later)', len(start2) == 1 and start2[0]['fields']['Value'] == start[0]['fields']['Value'])

    alex = sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/TechnicianAadId': 'aad-alex',
                                       'item/AppraisalDate': '2027-06-30'})
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})
    # a review released BEFORE the tracker started, with actions: never imported
    old = sp.write_item(mgr, None, {'item/Title': 'Alex – 2026-09', 'item/ReviewKey': 'aad-alex_2026-09', 'item/MonthKey': '2026-09',
                                    'item/Technician/Claims': sp.users[11]['Claims'], 'item/ReviewState/Value': 'Completed',
                                    'item/ReleasedOn': '2026-10-01T10:00:00Z',
                                    'item/ActionsJson': '[{"id":"old1","text":"Old test action","owner":"Alex Morgan","ownerRole":"tech","criteria":"x","due":"2026-11-01","status":"Open"}]'})
    sp.clock = None
    run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    ok('Flow 1: a review released before the tracker started is never imported (its actions stay in the review)',
       not act['items'] and not old['fields'].get('ActionsSyncedOn'))
    m_alex = next(i for i in mgr['items'].values() if i['fields'].get('Technician') == 11 and i['fields'].get('MonthKey') == '2026-11')
    m_sam = next(i for i in mgr['items'].values() if i['fields'].get('Technician') == 12 and i['fields'].get('MonthKey') == '2026-11')
    agreed = ('[{"id":"1730000000001","text":"Book the RPS course","owner":"Alex Morgan","ownerRole":"tech","criteria":"Course date confirmed",'
              '"due":"2026-12-09","status":"Open"},{"id":"1730000000002","text":"Order the spare monitor <b>now</b>","owner":"Team Leader",'
              '"ownerRole":"tl","criteria":"Delivery date known","due":"2027-06-10","status":"Open"}]')
    for m in (m_alex, m_sam):
        m['fields']['SubmittedOn'] = '2026-11-20T10:00:00Z'
        m['fields']['ReviewState'] = 'Submitted'
        sp.write_item(mgr, m['id'], {'item/ActionsJson': agreed, 'item/ReviewState/Value': 'Completed'})
    st, eng = fire('3', sp, 'Manager Reviews', m_alex['id'], T('2026-11-21T09:00:00'))
    items = sorted(act['items'].values(), key=lambda i: i['id'])
    ok('Flow 3: releasing a review adds each agreed action to the tracker once, with owner, deadlines and origin', st == 'Succeeded' and len(items) == 2 and
       items[0]['fields']['ActionKey'] == 'mr{0}-1730000000001'.format(m_alex['id']) and items[0]['fields']['Owner'] == 'Technician' and
       items[1]['fields']['Owner'] == 'Team Leader' and items[0]['fields']['Technician'] == 11 and items[0]['fields']['OriginalDue'] == '2026-12-09' and
       items[0]['fields']['CurrentDue'] == '2026-12-09' and items[1]['fields']['CurrentDue'] == '2027-06-10' and items[0]['fields']['Status'] == 'Open' and
       int(items[0]['fields']['OriginMgrId']) == m_alex['id'] and items[0]['fields']['OriginMonth'] == '2026-11' and
       '"kind": "created"' in items[0]['fields']['HistoryJson'].replace('":"', '": "') and m_alex['fields'].get('ActionsSyncedOn'),
       (st, eng and eng.log, [i['fields'] for i in items]))
    ok('Flow 3: a BST deadline (10 June) is stored as that UK day', items[1]['fields']['CurrentDue'] == '2027-06-10')
    st2, _ = fire('3', sp, 'Manager Reviews', m_alex['id'], T('2026-11-21T09:10:00'))
    run('1', sp, T('2026-11-22T07:00:00'), overrides={'varTestDate': '2026-11-22T07:00:00'})
    ok('Flow 3 / Flow 1: running again (or the daily sync) never duplicates an action', st2 == 'NotTriggered' and len(act['items']) == 2)
    # a release interrupted: the tracker write fails, the release stands, the daily run finishes it
    sp.fail_uris = ["lists(guid'" + act['Id'] + "')/items"]
    st, eng = fire('3', sp, 'Manager Reviews', m_sam['id'], T('2026-11-21T09:20:00'))
    sp.fail_uris = []
    ok('Flow 3: if adding the actions fails, the release still completes and the review is left unsynced', st == 'Succeeded' and
       m_sam['fields'].get('ReleasedOn') and not m_sam['fields'].get('ActionsSyncedOn') and len(act['items']) == 2, (st, eng and eng.log[-3:]))
    # one of the two already there (a partial earlier attempt): only the other is added
    sp.write_item(act, None, {'item/Title': 'Book the RPS course', 'item/ActionKey': 'mr{0}-1730000000001'.format(m_sam['id']),
                              'item/Technician/Id': 12, 'item/Status/Value': 'Open'})
    m = len(sp.emails)
    st, eng = run('1', sp, T('2026-11-22T07:00:00'), overrides={'varTestDate': '2026-11-22T07:00:00'})
    sam_actions = [i for i in act['items'].values() if i['fields'].get('Technician') == 12]
    ok('Flow 1: the daily sync finishes an interrupted release – only the missing action is added, then the review is stamped',
       st == 'Succeeded' and len(sam_actions) == 2 and m_sam['fields'].get('ActionsSyncedOn') and
       len({i['fields']['ActionKey'] for i in sam_actions}) == 2, (st, eng.log[-5:]))
    ok('Flow 1: nothing to report when all went well', not any(e['subject'] == '1-to-1 system: action needed' for e in sp.emails[m:]))

    # Flow 9: access
    a1, a2 = items
    s1 = next(i for i in sam_actions if i['fields']['ActionKey'].endswith('1730000000001'))
    read, submit = sp.role_id('1-to-1 Read'), sp.role_id('1-to-1 Submit')
    for a in (a1, a2, s1):
        st, eng = fire('9', sp, '1-to-1 Actions', a['id'], T('2026-11-21T10:00:00'))
    folder = next(i for i in upd['items'].values() if i.get('fsobj') == 1 and i['fields']['Title'] == 'u11')
    sfolder = next(i for i in upd['items'].values() if i.get('fsobj') == 1 and i['fields']['Title'] == 'u12')
    def others(ra):
        return {k: v for k, v in ra.items() if k != 10}
    ok('Flow 9: each action is visible to its technician (Read) and the Owners only', a1['unique'] and others(a1['ra']) == {3: {fsp.FULL}, 11: {read}} and
       others(s1['ra']) == {3: {fsp.FULL}, 12: {read}} and 12 not in a1['ra'] and a1['fields']['SharedWith'] == 'alex.morgan@example.test', a1['ra'])
    ok('Flow 9: each technician gets their own update folder that only they can add to (1-to-1 Submit)',
       folder['unique'] and others(folder['ra']) == {3: {fsp.FULL}, 11: {submit}} and others(sfolder['ra']) == {3: {fsp.FULL}, 12: {submit}}, folder['ra'])
    v = a1['version']
    fire('9', sp, '1-to-1 Actions', a1['id'], T('2026-11-21T10:05:00'))
    ok('Flow 9: running again changes nothing (no write to the action, no extra folder)', a1['version'] == v and
       len([i for i in upd['items'].values() if i.get('fsobj') == 1]) == 2)
    a1['ra'][12] = {read}
    folder['ra'][12] = {submit}
    fire('9', sp, '1-to-1 Actions', a1['id'], T('2026-11-21T10:10:00'))
    ok('Flow 9: a wrongly shared action or folder is repaired (the other technician removed)', 12 not in a1['ra'] and 12 not in folder['ra'] and
       others(a1['ra']) == {3: {fsp.FULL}, 11: {read}}, (a1['ra'], folder['ra']))

    # Flow 10: updates
    seq_no = [0]
    def send(as_user, folder_name, fields):
        seq_no[0] += 1
        sp.me = as_user
        try:
            p = {'item/Title': 'update', 'item/ClientKey': 'k{0}'.format(seq_no[0])}
            p.update({'item/' + k: v for k, v in fields.items()})
            it = sp.add_in_folder(upd, folder_name, p)
        finally:
            sp.me = 10
        st_, eng_ = fire('10', sp, '1-to-1 Action Updates', it['id'], T('2026-11-25T10:00:00'))
        return it, st_, eng_
    u1, st, eng = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'Course found, waiting for dates'})
    hist = json.loads(a1['fields']['HistoryJson'])
    ok('Flow 10: a technician update is recorded on their action – status In progress, latest progress, who and when',
       st == 'Succeeded' and u1['fields']['ProcessState'] == 'Applied' and a1['fields']['Status'] == 'In progress' and
       a1['fields']['LatestProgress'] == 'Course found, waiting for dates' and a1['fields']['LastUpdateBy'] == 'Alex Morgan' and
       hist[-1]['id'] == 'u{0}'.format(u1['id']) and hist[-1]['by'] == 'Alex Morgan', (st, eng and eng.log, a1['fields']))
    ok('Flow 10: the history entry keeps the update\'s client key (the page reads the follow-up month from it)', hist[-1].get('key') == 'k{0}'.format(seq_no[0]), hist[-1])
    ok('Flow 10: the update is then locked – the technician can read it but no longer change it', u1['unique'] and others(u1['ra']) == {3: {fsp.FULL}, 11: {read}})
    stale = dict(sp.item_out(upd, u1), ProcessState={'Value': 'Pending'})
    st, _ = run('10', sp, T('2026-11-25T10:01:00'), stale)
    ok('Flow 10: a second (stale) trigger for the same update records nothing more', st == 'Cancelled' and len(json.loads(a1['fields']['HistoryJson'])) == len(hist))
    blocked = False
    try:
        sp.me = 12
        sp.add_in_folder(upd, 'u11', {'item/Title': 'x', 'item/ClientKey': 'evil', 'item/ActionId': a1['id'], 'item/Message': 'pwned'})
    except Exception:
        blocked = True
    finally:
        sp.me = 10
    ok('Security: a technician cannot add an update to another technician\'s folder', blocked)
    u2, st, _ = send(12, 'u12', {'ActionId': a1['id'], 'Kind/Value': 'closeRequest', 'Message': 'done (not really)'})
    ok('Security: an update naming someone else\'s action (forged ActionId) is rejected – their action is untouched', u2['fields']['ProcessState'] == 'Rejected' and
       u2['fields']['ProcessNote'] == 'Not your action' and a1['fields']['Status'] == 'In progress' and others(u2['ra']) == {3: {fsp.FULL}, 12: {read}})
    sp.me = 11
    root_item = sp.write_item(upd, None, {'item/Title': 'x', 'item/ClientKey': 'root1', 'item/ActionId': a1['id'], 'item/Kind/Value': 'closeRequest'})
    sp.me = 10
    st, _ = fire('10', sp, '1-to-1 Action Updates', root_item['id'], T('2026-11-25T10:05:00'))
    ok('Security: an update not in the sender\'s own folder (identity unknown) is rejected and made Owners-only', root_item['fields']['ProcessState'] == 'Rejected' and
       others(root_item['ra']) == {3: {fsp.FULL}} and a1['fields']['Status'] == 'In progress', (st, root_item['fields']))
    folder['ra'][12] = {submit}
    u3, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'more'})
    ok('Security: if the folder has been shared with anyone else, the update is rejected (the sender can\'t be proved)', u3['fields']['ProcessState'] == 'Rejected')
    del folder['ra'][12]
    u4, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'waiting', 'Message': ''})
    u5, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'waiting', 'Message': 'Waiting for training dates', 'WaitingUntil': '2026-12-15'})
    ok('Flow 10: Waiting needs a reason; with one, the action is Waiting with the reason and next date, deadline unchanged',
       u4['fields']['ProcessState'] == 'Rejected' and u5['fields']['ProcessState'] == 'Applied' and a1['fields']['Status'] == 'Waiting' and
       a1['fields']['WaitingReason'] == 'Waiting for training dates' and a1['fields']['WaitingUntil'] == '2026-12-15' and a1['fields']['CurrentDue'] == '2026-12-09')
    u6, st, _ = send(11, 'u11', {'ActionId': a2['id'], 'Kind/Value': 'closeRequest', 'Message': 'I think this is done'})
    ok('Flow 10: a technician cannot ask to close the Team Leader\'s own action', u6['fields']['ProcessState'] == 'Rejected' and
       a2['fields']['Status'] == 'Open' and u6['fields']['ProcessNote'] == 'Only the Team Leader closes their own actions')
    # concurrency: the Team Leader saves the action between Flow 10 reading and writing it – both changes survive
    sp.bump_once = {('1-to-1 Actions', a1['id']): {'fields': {'item/DecisionNote': 'TL note added meanwhile'}}}
    u7, st, eng = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'closeRequest', 'Message': 'Course booked for 3 Dec'})
    hist = json.loads(a1['fields']['HistoryJson'])
    ok('Flow 10: a Team Leader change in between (stale etag) is kept, and the update is still recorded – once',
       st == 'Succeeded' and a1['fields']['DecisionNote'] == 'TL note added meanwhile' and a1['fields']['Status'] == 'Ready for close-out' and
       [h['id'] for h in hist].count('u{0}'.format(u7['id'])) == 1, (st, eng and eng.log))
    e19 = [i for i in notc['items'].values() if i['fields'].get('NoticeKey') == 'E19-u{0}'.format(u7['id'])]
    ok('Flow 10: a close-out request queues one E19 email', len(e19) == 1 and e19[0]['fields']['Status'] == 'Pending' and e19[0]['fields']['Kind'] == 'E19')
    # a run that stopped after recording but before finishing: retried, nothing duplicated
    u7['fields']['ProcessState'] = 'Pending'
    st, _ = fire('10', sp, '1-to-1 Action Updates', u7['id'], T('2026-11-25T11:00:00'))
    ok('Flow 10: a retried update is not recorded twice and queues no second email', st == 'Succeeded' and
       [h['id'] for h in json.loads(a1['fields']['HistoryJson'])].count('u{0}'.format(u7['id'])) == 1 and
       len([i for i in notc['items'].values() if i['fields'].get('NoticeKey') == 'E19-u{0}'.format(u7['id'])]) == 1)
    sp.write_item(act, a2['id'], {'item/Status/Value': 'Closed'})
    u8, st, _ = send(11, 'u11', {'ActionId': a2['id'], 'Kind/Value': 'progress', 'Message': 'late note'})
    ok('Flow 10: nothing is recorded on a closed action', u8['fields']['ProcessState'] == 'Rejected' and u8['fields']['ProcessNote'] == 'The action is closed')
    sp.write_item(act, a2['id'], {'item/Status/Value': 'Open'})

    # review round: Flow 10 checks the rules again after a 412 – the Team Leader may have closed it or taken it over meanwhile
    sp.write_item(act, a1['id'], {'item/Status/Value': 'In progress'})
    sp.bump_once = {('1-to-1 Actions', a1['id']): {'fields': {'item/Status/Value': 'Closed', 'item/ClosedOn': '2026-11-25'}}}
    r1, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'waiting', 'Message': 'Waiting for the provider'})
    ok('Flow 10 (review fix): closed by the Team Leader between read and write – the update is rejected, the action stays Closed',
       r1['fields']['ProcessState'] == 'Rejected' and r1['fields']['ProcessNote'] == 'The action is closed' and a1['fields']['Status'] == 'Closed' and
       a1['fields'].get('ClosedOn') == '2026-11-25' and 'u{0}'.format(r1['id']) not in a1['fields']['HistoryJson'], (r1['fields'], a1['fields']['Status']))
    sp.write_item(act, a1['id'], {'item/Status/Value': 'In progress', 'item/ClosedOn': None})
    sp.bump_once = {('1-to-1 Actions', a1['id']): {'fields': {'item/Owner/Value': 'Team Leader'}}}
    r2, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'closeRequest', 'Message': 'done'})
    ok('Flow 10 (review fix): taken over by the Team Leader meanwhile – a close-out request is rejected, no E19',
       r2['fields']['ProcessState'] == 'Rejected' and a1['fields']['Status'] == 'In progress' and
       not [i for i in notc['items'].values() if i['fields'].get('NoticeKey') == 'E19-u{0}'.format(r2['id'])])
    sp.write_item(act, a1['id'], {'item/Owner/Value': 'Technician'})
    good_hist = a1['fields']['HistoryJson']
    sp.write_item(act, a1['id'], {'item/HistoryJson': '[{"id": broken'})
    r3, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'after a bad edit'})
    ok('Flow 10 (review fix): an unreadable history rejects the update with a clear note (no endless retry loop)',
       st == 'Succeeded' and r3['fields']['ProcessState'] == 'Rejected' and 'history could not be read' in r3['fields']['ProcessNote'], (st, r3['fields']))
    sp.write_item(act, a1['id'], {'item/HistoryJson': good_hist})
    nxt = max(upd['items']) + 2
    send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'decoy', 'ClientKey': 'u{0}'.format(nxt)})
    r5, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'the real one'})
    ok('Flow 10 (review fix): a client key that looks like the next update id does not make it count as already recorded',
       r5['id'] == nxt and r5['fields']['ProcessState'] == 'Applied' and a1['fields']['LatestProgress'] == 'the real one')
    sp.write_item(act, a1['id'], {'item/Status/Value': 'Waiting', 'item/WaitingReason': 'Parts on order'})
    send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'followup', 'Outcome/Value': 'Support', 'Message': 'need a chaser'})
    ok('Flow 10 (review fix): a follow-up outcome leaves the status alone (Waiting stays Waiting, with its reason)',
       a1['fields']['Status'] == 'Waiting' and a1['fields']['WaitingReason'] == 'Parts on order')
    sp.write_item(act, a1['id'], {'item/Status/Value': 'In progress', 'item/WaitingReason': ''})
    folder['ra'][12] = {submit}
    fire('9', sp, '1-to-1 Actions', a1['id'], T('2026-11-25T12:00:00'))
    ok('Flow 9 (review fix): repairing a folder keeps its recorded updates locked (Read only)',
       others(folder['ra']) == {3: {fsp.FULL}, 11: {submit}} and u1['unique'] and others(u1['ra']) == {3: {fsp.FULL}, 11: {read}}, (folder['ra'], u1['ra']))
    sp.write_item(act, a1['id'], {'item/Status/Value': 'Ready for close-out'})   # as the E19 below expects

    # Flow 11: emails
    n19 = e19[0]
    m = len(sp.emails)
    st, eng = fire('11', sp, '1-to-1 Action Notices', n19['id'], T('2026-11-25T11:05:00'))
    mails = sp.emails[m:]
    ok('Flow 11: E19 goes to the Team Leader once, and the notice is marked Sent', st == 'Succeeded' and len(mails) == 1 and
       mails[0]['to'] == 'team.leader@example.test' and 'Close-out requested' in mails[0]['subject'] and
       '?actionId={0}"'.format(a1['id']) in mails[0]['body'] and n19['fields']['Status'] == 'Sent' and n19['fields'].get('SentOn'), (st, eng and eng.log, mails))
    st, _ = fire('11', sp, '1-to-1 Action Notices', n19['id'], T('2026-11-25T11:10:00'))
    stale = dict(sp.item_out(notc, n19), Status={'Value': 'Pending'})
    st2, _ = run('11', sp, T('2026-11-25T11:11:00'), stale)
    ok('Flow 11: a Sent notice never sends again (its own update, or a stale trigger)', st == 'NotTriggered' and st2 == 'Cancelled' and len(sp.emails) == m + 1)

    # Flow 1: 5-working-day reminders (to the technician, copy to the Team Leader)
    def set_due(a, d):
        sp.write_item(act, a['id'], {'item/CurrentDue': d, 'item/Status/Value': 'In progress'})
    def e20_for(a):
        return [i for i in notc['items'].values() if i['fields'].get('Kind') == 'E20' and int(i['fields']['ActionId']) == a['id']]
    def daily(day):
        st_, eng_ = run('1', sp, T(day + 'T07:00:00'), overrides={'varTestDate': day + 'T07:00:00'})
        return st_, eng_
    set_due(a1, '2026-12-09')   # Wednesday
    daily('2026-12-01')
    none_before = not e20_for(a1)
    daily('2026-12-02')
    first_day = len(e20_for(a1)) == 1 and e20_for(a1)[0]['fields']['NoticeKey'] == 'E20-a{0}-2026-12-09'.format(a1['id'])
    daily('2026-12-02')
    daily('2026-12-03')
    ok('Flow 1: E20 is queued 5 working days before a weekday deadline (Wed → previous Wed), once only',
       none_before and first_day and len(e20_for(a1)) == 1, [i['fields'] for i in e20_for(a1)])
    n20 = e20_for(a1)[0]
    m = len(sp.emails)
    st, eng = fire('11', sp, '1-to-1 Action Notices', n20['id'], T('2026-12-02T07:10:00'))
    ok('Flow 11: E20 goes to the technician with the Team Leader copied, the title escaped', st == 'Succeeded' and len(sp.emails) == m + 1 and
       sp.emails[-1]['to'] == 'alex.morgan@example.test' and sp.emails[-1]['cc'] == 'team.leader@example.test' and
       '09-Dec-2026' in sp.emails[-1]['body'] and n20['fields']['Status'] == 'Sent', (st, eng and eng.log, sp.emails[m:]))
    set_due(a1, '2026-12-19')   # Saturday → Monday 14th
    daily('2026-12-11')
    sat_before = len(e20_for(a1)) == 1
    daily('2026-12-14')
    ok('Flow 1: a Saturday deadline is reminded on the Monday 5 working days before; a changed deadline gets one new reminder',
       sat_before and len(e20_for(a1)) == 2 and any(i['fields']['NoticeKey'].endswith('2026-12-19') for i in e20_for(a1)))
    set_due(a1, '2026-12-20')   # Sunday → Monday 14th as well; flow was "off" that day → caught up on the 16th
    daily('2026-12-16')
    ok('Flow 1: a Sunday deadline counts back to Monday; a missed day is caught up (once)', len(e20_for(a1)) == 3)
    set_due(a1, '2026-12-17')
    daily('2026-12-18')
    ok('Flow 1: no reminder once the deadline has passed (overdue shows on the page instead)', len(e20_for(a1)) == 3)
    sp.dates_as_instants = True
    set_due(a2, '2027-06-10')
    daily('2027-06-02')
    early = not e20_for(a2)
    daily('2027-06-03')
    sp.dates_as_instants = False
    ok('Flow 1 (BST): a 10 June deadline returned as 9 June 23:00Z is reminded on 3 June, not before', early and len(e20_for(a2)) == 1, [i['fields'] for i in e20_for(a2)])
    sp.write_item(act, a2['id'], {'item/Status/Value': 'Closed'})
    n_closed = e20_for(a2)[0]
    st, _ = fire('11', sp, '1-to-1 Action Notices', n_closed['id'], T('2027-06-03T07:10:00'))
    ok('Flow 11: a reminder for an action closed meanwhile is not sent (Cancelled)', n_closed['fields']['Status'] == 'Cancelled')

    # failures and housekeeping
    sp.write_item(act, a2['id'], {'item/Status/Value': 'In progress', 'item/CurrentDue': '2027-07-07'})
    daily('2027-06-30')
    n_fail = next(i for i in e20_for(a2) if i['fields']['NoticeKey'].endswith('2027-07-07'))
    sp.fail_mail = ['Action due']
    st, eng = fire('11', sp, '1-to-1 Action Notices', n_fail['id'], T('2027-06-30T07:10:00'))
    sp.fail_mail = []
    ok('Flow 11: a failed email is marked Failed with the attempt counted (run Failed)', st == 'Failed' and n_fail['fields']['Status'] == 'Failed' and
       int(n_fail['fields']['Attempts']) == 1 and n_fail['fields'].get('LastError'), (st, n_fail['fields']))
    daily('2027-07-01')
    retried = n_fail['fields']['Status'] == 'Retry'
    st, _ = fire('11', sp, '1-to-1 Action Notices', n_fail['id'], T('2027-07-01T07:10:00'))
    ok('Flow 1 retries a failed email (Retry), and it is then sent', retried and n_fail['fields']['Status'] == 'Sent' and int(n_fail['fields']['Attempts']) == 2)
    sp.clock = '2027-07-01T05:00:00Z'
    stuck = sp.add_in_folder(upd, 'u11', {'item/Title': 'u', 'item/ClientKey': 'stuck1', 'item/ActionId': a2['id'], 'item/Kind/Value': 'progress',
                                          'item/Message': 'stuck one', 'item/ProcessState/Value': 'Processing'})
    sp.clock = None
    daily('2027-07-01')
    ok('Flow 1: an update stuck mid-way for over an hour is put back to Pending (Flow 10 picks it up again)', stuck['fields']['ProcessState'] == 'Pending' and
       stuck['fields']['ProcessNote'] == 'Retried by the daily run')
    st, _ = fire('10', sp, '1-to-1 Action Updates', stuck['id'], T('2027-07-01T07:20:00'))
    ok('… and is then recorded', stuck['fields']['ProcessState'] == 'Applied' and a2['fields']['LatestProgress'] == 'stuck one')

    # review round: a reminder for a deadline that has since moved, or whose date has passed, is not sent
    set_due(a1, '2027-08-11')
    daily('2027-08-04')
    n_old = next(i for i in e20_for(a1) if i['fields']['NoticeKey'].endswith('2027-08-11'))
    set_due(a1, '2027-08-20')
    m = len(sp.emails)
    fire('11', sp, '1-to-1 Action Notices', n_old['id'], T('2027-08-04T07:10:00'))
    ok('Flow 11 (review fix): a reminder for a deadline that has moved is cancelled, not sent with the new date', n_old['fields']['Status'] == 'Cancelled' and len(sp.emails) == m)
    daily('2027-08-13')
    n_new = next(i for i in e20_for(a1) if i['fields']['NoticeKey'].endswith('2027-08-20'))
    fire('11', sp, '1-to-1 Action Notices', n_new['id'], T('2027-08-21T07:10:00'))
    ok('Flow 11 (review fix): a late retry after the deadline date sends nothing (Cancelled)', n_new['fields']['Status'] == 'Cancelled' and len(sp.emails) == m)

    # review round: one review that can't be added never stops the reminders or the rest of the daily work; older entries'
    # owner comes from the name (the Team Leader's stays the Team Leader's)
    sp.write_item(mgr, None, {'item/Title': 'Alex – 2027-08', 'item/ReviewKey': 'test-noid', 'item/MonthKey': '2027-08',
                              'item/Technician/Claims': sp.users[11]['Claims'], 'item/ReviewState/Value': 'Completed', 'item/ReleasedOn': '2027-08-30T10:00:00Z',
                              'item/ActionsJson': '[{"text":"no id here","owner":"Alex Morgan","criteria":"x","due":"2027-10-01","status":"Open"}]'})
    legacy = sp.write_item(mgr, None, {'item/Title': 'Alex – 2027-07', 'item/ReviewKey': 'test-legacy', 'item/MonthKey': '2027-07',
                                       'item/Technician/Claims': sp.users[11]['Claims'], 'item/ReviewState/Value': 'Completed', 'item/ReleasedOn': '2027-08-30T11:00:00Z',
                                       'item/ActionsJson': '[{"id":"L1","text":"legacy TL one","owner":"Team Leader","criteria":"x","due":"2027-10-01","status":"Open"},'
                                                           '{"id":"L2","text":"legacy own one","owner":"Alex Morgan","criteria":"x","due":"2027-10-01","status":"Open"}]'})
    set_due(a1, '2027-09-08')
    m = len(sp.emails)
    st, eng = daily('2027-09-01')
    probs = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    owners = {i['fields']['Title']: i['fields']['Owner'] for i in act['items'].values() if i['fields'].get('Title', '').startswith('legacy')}
    ok('Flow 1 (review fix): a review that can\'t be added is reported by name, and the other review and the day\'s reminder still go ahead',
       any(i['fields']['NoticeKey'].endswith('2027-09-08') for i in e20_for(a1)) and len(probs) == 1 and 'Alex – 2027-08' in probs[0]['body'] and
       legacy['fields'].get('ActionsSyncedOn'), (st, [e['body'][:300] for e in probs]))
    ok('Flow 3 / 1 (review fix): an older entry without ownerRole keeps its owner – the Team Leader\'s stays the Team Leader\'s',
       owners == {'legacy TL one': 'Team Leader', 'legacy own one': 'Technician'}, owners)

    # 1.5.0.1 (nesting fix): a reminder that can't be queued still fails that part only, is reported in E7, and the review
    # sync and the retries still run in the same daily run
    set_due(a1, '2027-10-13')   # Wednesday → reminded from 6 October
    stuck2 = sp.add_in_folder(upd, 'u11', {'item/Title': 'u', 'item/ClientKey': 'stuck2', 'item/ActionId': a1['id'], 'item/Kind/Value': 'progress',
                                           'item/Message': 'stuck again', 'item/ProcessState/Value': 'Processing'})
    stuck2['fields']['Modified'] = '2027-10-06T04:00:00Z'
    sync_me = sp.write_item(mgr, None, {'item/Title': 'Alex – 2027-09', 'item/ReviewKey': 'test-sync-1501', 'item/MonthKey': '2027-09',
                                        'item/Technician/Claims': sp.users[11]['Claims'], 'item/ReviewState/Value': 'Completed', 'item/ReleasedOn': '2027-10-01T10:00:00Z',
                                        'item/ActionsJson': '[{"id":"N1","text":"added on the bad reminder day","owner":"Alex Morgan","ownerRole":"tech","criteria":"x","due":"2027-12-01","status":"Open"}]'})
    sp.fail_uris = ["POST _api/web/lists(guid'" + notc['Id'] + "')/items"]
    m = len(sp.emails)
    st, eng = daily('2027-10-06')
    sp.fail_uris = []
    probs = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1 (1.5.0.1): a deadline reminder that can\'t be queued is reported in E7, while the review sync and the retries still run',
       st == 'Succeeded' and not any(i['fields']['NoticeKey'].endswith('2027-10-13') for i in e20_for(a1)) and len(probs) == 1 and
       'deadline reminders could not be queued' in probs[0]['body'] and bool(sync_me['fields'].get('ActionsSyncedOn')) and
       any(i['fields'].get('Title') == 'added on the bad reminder day' for i in act['items'].values()) and stuck2['fields']['ProcessState'] == 'Pending',
       (st, [e['body'][:300] for e in probs], stuck2['fields']['ProcessState']))
    daily('2027-10-07')
    ok('Flow 1 (1.5.0.1): … and the reminder is queued once on the next run (catch-up)', len([i for i in e20_for(a1) if i['fields']['NoticeKey'].endswith('2027-10-13')]) == 1)

    # 1.5.0.1: an action that can't be created (and isn't there on the re-check) still stops that review – reported by name,
    # left unsynced – and is added on the next run
    lost = sp.write_item(mgr, None, {'item/Title': 'Alex – 2027-10', 'item/ReviewKey': 'test-lost-1501', 'item/MonthKey': '2027-10',
                                     'item/Technician/Claims': sp.users[11]['Claims'], 'item/ReviewState/Value': 'Completed', 'item/ReleasedOn': '2027-10-08T10:00:00Z',
                                     'item/ActionsJson': '[{"id":"Z1","text":"create refused once","owner":"Alex Morgan","ownerRole":"tech","criteria":"x","due":"2027-12-01","status":"Open"}]'})
    sp.fail_uris = ["POST _api/web/lists(guid'" + act['Id'] + "')/items"]
    m = len(sp.emails)
    st, eng = daily('2027-10-09')
    sp.fail_uris = []
    probs = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1 (1.5.0.1): an action that can\'t be added (not there on the re-check) fails that review only – reported by name, not marked synced',
       st == 'Succeeded' and not lost['fields'].get('ActionsSyncedOn') and len(probs) == 1 and 'Alex – 2027-10' in probs[0]['body'] and
       eng.results.get('S_Still_missing', {}).get('status') == 'Failed' and 'could not be added to the tracker' in json.dumps(eng.results['S_Still_missing'].get('outputs')),
       (st, eng.results.get('S_Still_missing'), [e['body'][:200] for e in probs]))
    daily('2027-10-10')
    ok('Flow 1 (1.5.0.1): … and the next run adds it once and marks the review synced', bool(lost['fields'].get('ActionsSyncedOn')) and
       len([i for i in act['items'].values() if i['fields'].get('Title') == 'create refused once']) == 1)

    # security review: a folder renamed or otherwise changed by its holder is never trusted (it could pose as someone else's)
    sp.me = 11
    sp.write_item(upd, folder['id'], {'item/Title': 'u11'})   # any change by the technician makes them its last editor
    sp.me = 10
    r6, st, _ = send(11, 'u11', {'ActionId': a1['id'], 'Kind/Value': 'progress', 'Message': 'from a changed folder'})
    ok('Security (review fix): an update in a folder changed by anyone but the flow is rejected', r6['fields']['ProcessState'] == 'Rejected' and
       r6['fields']['ProcessNote'] == 'Not sent from your own update folder' and a1['fields']['LatestProgress'] != 'from a changed folder')
    st, eng = fire('9', sp, '1-to-1 Actions', a1['id'], T('2027-09-01T12:00:00'))
    ok('Security (review fix): flow 9 never adopts a changed folder – it closes it to Owners and the run fails, so the Team Leader is told',
       st == 'Failed' and folder['unique'] and others(folder['ra']) == {3: {fsp.FULL}}, (st, folder['ra']))

    # a 1.4 site without the action lists: flows 1 and 3 still work
    sp2 = fsp.FakeSP()
    run('0', sp2, T('2026-10-14T09:00:00'))
    for t in ('1-to-1 Actions', '1-to-1 Action Updates', '1-to-1 Action Notices'):
        del sp2.lists[sp2.list_by_title(t)['Id']]
    st, eng = run('1', sp2, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    ok('Upgrade order: before Setup 1.5 adds the action lists, Flow 1 still runs cleanly', st == 'Succeeded' and
       not any(e['subject'] == '1-to-1 system: action needed' for e in sp2.emails), eng.log[-5:])


if __name__ == '__main__':
    site = setup_checks()
    partial_site_checks()
    sp, mgr, mr = monthly_checks(site)
    month_two_checks(sp, mgr, mr)
    failure_checks()
    extra_checks()
    team_and_wellbeing_checks()
    feedback_checks()
    qa_regression_checks()
    wellbeing_hardening_checks()
    v14_checks()
    v15_checks()
    passed = sum(1 for _, p in RESULTS if p)
    print('\n[{2}] {0} / {1} passed'.format(passed, len(RESULTS), MODE))
    sys.exit(0 if passed == len(RESULTS) else 1)
