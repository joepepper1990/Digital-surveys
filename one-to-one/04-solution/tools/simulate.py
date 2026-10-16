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
FLOWS = {f['name'].split('|')[1].strip()[0]: f for f in build_all()}  # '0', '1', '2', '3'
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
        'Manager Reviews': names(strings_after(js, 'var MR_FIELDS')),
        'Monthly Reviews': names(strings_after(js, 'var REV_FIELDS')),
        'Technicians': names(re.search(r"spGetAll\(CONFIG\.lists\.techs, '([^']+)'", js).group(1)),
        'Appraisal Expectations': names(re.search(r"spGetAll\(CONFIG\.lists\.exp, '([^']+)'", js).group(1)),
        '1-to-1 Settings': names(re.search(r"spGetAll\(CONFIG\.lists\.settings, '([^']+)'", js).group(1)),
        'Wellbeing Assessments': names(strings_after(js, 'var WB_FIELDS')),
        '1-to-1 Feedback': names(strings_after(js, 'var FB_FIELDS')) - {'HasUniqueRoleAssignments'},   # an item property, not a column
        '1-to-1 Challenges': names(strings_after(js, 'var CH_FIELDS')) | {'TlPing'},   # TlPing: written by the TL's page to wake Flow 7
    }
    need['Manager Reviews'] |= names(strings_after(js, 'var MR_CH_FIELDS'))
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
                          'OnQuickLaunch': False, 'ExcludeFromOfflineClient': True,
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
    ok('Flow 2: after release only re-applies Read; nothing else changes', st == 'Succeeded' and len(sp.emails) == n and
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
    n = len(sp.emails)
    run('1', sp, T('2027-03-03T07:00:00'), overrides={'varTestDate': '2027-03-03T07:00:00'})
    e12 = [e for e in sp.emails[n:] if e['subject'].startswith('Wellbeing review')]
    ok('Flow 1: TL emailed 7 days before a wellbeing review is due, with a link', len(e12) == 1 and e12[0]['to'] == 'team.leader@example.test' and
       'due in 7 days: Alex Morgan' in e12[0]['subject'] and '?wbId={0}"'.format(it['id']) in e12[0]['body'] and '10-Mar-2027' in e12[0]['body'], e12)
    sp.dates_as_instants = True
    n = len(sp.emails)
    run('1', sp, T('2027-03-10T07:00:00'), overrides={'varTestDate': '2027-03-10T07:00:00'})
    sp.dates_as_instants = False
    ok('Flow 1: and on the day (date returned as a UTC instant)', any(e['subject'].startswith('Wellbeing review due today') for e in sp.emails[n:]),
       [e['subject'] for e in sp.emails[n:]])
    n = len(sp.emails)
    run('1', sp, T('2027-03-05T07:00:00'), overrides={'varTestDate': '2027-03-05T07:00:00'})
    ok('Flow 1: no wellbeing email on other days', not any(e['subject'].startswith('Wellbeing review') for e in sp.emails[n:]))
    # summer time: a 10 June review date comes back as 2027-06-09T23:00:00Z
    sp.write_item(wb, it['id'], {'item/NextReviewDate': '2027-06-10'})
    def e12_on(day):
        m = len(sp.emails)
        st_, eng_ = run('1', sp, T(day + 'T07:00:00'), overrides={'varTestDate': day + 'T07:00:00'})
        return st_, eng_, [e['subject'] for e in sp.emails[m:] if e['subject'].startswith('Wellbeing review')]
    r3, r9, r10 = e12_on('2027-06-03'), e12_on('2027-06-09'), e12_on('2027-06-10')
    ok('Flow 1 (BST): a June review date is reminded 7 days before and on the day, not the day before', r3[2] == ['Wellbeing review due in 7 days: Alex Morgan']
       and r9[2] == [] and r10[2] == ['Wellbeing review due today: Alex Morgan'], (r3[2], r9[2], r10[2]))
    saved_done = it['fields'].get('CompletedOn')
    it['fields']['CompletedOn'] = None
    ok('Flow 1: no reminder for an assessment marked Completed that the flow never completed (no CompletedOn)', e12_on('2027-06-10')[2] == [])
    it['fields']['CompletedOn'] = saved_done
    sp.write_item(techs, alex['id'], {'item/Active': False})
    ok('Flow 1: no wellbeing reminder for someone no longer active', e12_on('2027-06-10')[2] == [])
    sp.write_item(techs, alex['id'], {'item/Active': True})
    sp.fail_uris = ['AssessmentStatus eq']
    m = len(sp.emails)
    st, eng = run('1', sp, T('2027-06-10T07:00:00'), overrides={'varTestDate': '2027-06-10T07:00:00'})
    sp.fail_uris = []
    e7 = [e for e in sp.emails[m:] if e['subject'] == '1-to-1 system: action needed']
    ok('Flow 1: if the wellbeing check fails, the run still finishes and the daily problem email says so', st == 'Succeeded' and len(e7) == 1 and
       'Wellbeing review reminders could not be checked' in e7[0]['body'], (st, eng.log[-5:] if eng else None, [e['subject'] for e in sp.emails[m:]]))

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


def challenge_checks():
    """Flow 7 and Flow 1's close: a technician challenges parts of their latest released feedback."""
    sp = fsp.FakeSP()
    run('0', sp, T('2026-10-01T06:00:00'))
    techs, mr, mgr, ch = (sp.list_by_title(x) for x in ('Technicians', 'Monthly Reviews', 'Manager Reviews', '1-to-1 Challenges'))
    EDIT, READ = sp.role_id('1-to-1 Edit'), sp.role_id('1-to-1 Read')
    sp.write_item(techs, None, {'item/Title': 'Alex Morgan', 'item/Technician/Claims': sp.users[11]['Claims'], 'item/TechnicianAadId': 'aad-alex'})
    sp.write_item(techs, None, {'item/Title': 'Sam Patel', 'item/Technician/Claims': sp.users[12]['Claims'], 'item/TechnicianAadId': 'aad-sam'})

    def mgr_of(uid, month):
        return next(i for i in mgr['items'].values() if i['fields']['Technician'] == uid and i['fields']['MonthKey'] == month)

    def release(uid, month, when):
        m = mgr_of(uid, month)
        sp.me = uid
        sp.write_item(mr, int(m['fields']['ReviewItemId']), {'item/ReviewStatus/Value': 'Submitted'})
        sp.me = 10
        fire('2', sp, 'Monthly Reviews', int(m['fields']['ReviewItemId']), T(when))
        sp.write_item(mgr, m['id'], {'item/FB_Overall': 'Good month', 'item/ReviewState/Value': 'Completed'})
        fire('3', sp, 'Manager Reviews', m['id'], T(when))
        return m

    def challenge(uid, mgr_id, sections='[{"key":"overall","note":"I <b>disagree</b> & here is why"}]', when='2026-12-10T09:00:00', title='Challenge'):
        sp.me = uid
        it = sp.write_item(ch, None, {'item/Title': title, 'item/ManagerReviewId': mgr_id, 'item/SectionsJson': sections})
        sp.me = 10
        n = len(sp.emails)
        st, eng = fire('7', sp, '1-to-1 Challenges', it['id'], T(when))
        return it, st, eng, sp.emails[n:]

    run('1', sp, T('2026-10-01T07:00:00'), overrides={'varTestDate': '2026-10-01T07:00:00'})
    oct_a = release(11, '2026-10', '2026-10-20T09:00:00')
    run('1', sp, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    nov_a = release(11, '2026-11', '2026-11-20T09:00:00')
    nov_s = release(12, '2026-11', '2026-11-20T09:10:00')
    run('1', sp, T('2026-12-01T07:00:00'), overrides={'varTestDate': '2026-12-01T07:00:00'})
    dec_s = mgr_of(12, '2026-12')

    # rejected: someone else's review, not the latest, not released, nothing in it
    for label, uid, target, sec in (('someone else\'s review', 12, nov_a['id'], None), ('an older review (not the latest released)', 11, oct_a['id'], None),
                                    ('a review not yet released', 12, dec_s['id'], None), ('an empty challenge', 11, nov_a['id'], '  '),
                                    ('a challenge that is not a list', 11, nov_a['id'], '{not json')):
        it, st, eng, mails = challenge(uid, target, sec if sec is not None else '[{"key":"overall"}]')
        tgt = mgr['items'][target]['fields']
        ok('Flow 7: a challenge of {0} is rejected – Owners only, nothing opened, no email'.format(label), st == 'Succeeded' and it['unique'] and
           uid not in it['ra'] and it['fields'].get('ChallengeStatus') == 'Rejected' and not tgt.get('ChallengeState') and not mails, (st, eng and eng.log, it['ra']))
        st2, _ = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-10T09:05:00'))
        ok('Flow 7: … and its own update does not run it again ({0})'.format(label), st2 == 'Cancelled', st2)

    # a blank or missing review id is a quiet reject, never a failed run (each failure emails the TL – a flood)
    n = len(sp.emails)
    for k in range(12):
        sp.me = 11
        bad = sp.write_item(ch, None, dict({'item/Title': 'x', 'item/SectionsJson': '[{"key":"overall"}]'}, **({'item/ManagerReviewId': ''} if k % 2 else {})))
        sp.me = 10
        st, eng = fire('7', sp, '1-to-1 Challenges', bad['id'], T('2026-12-10T08:00:00'))
        if st != 'Succeeded' or bad['fields'].get('ChallengeStatus') != 'Rejected' or 11 in bad['ra']:
            break
    ok('Flow 7: challenges with no review id are rejected quietly – 12 of them send the TL nothing', st == 'Succeeded' and len(sp.emails) == n and
       bad['fields'].get('ChallengeStatus') == 'Rejected', (st, eng and eng.log, len(sp.emails) - n))

    # accepted
    it, st, eng, mails = challenge(11, nov_a['id'])
    f = nov_a['fields']
    ok('Flow 7: a challenge of the latest released review is accepted – private to the technician (Edit) and the Owners', st == 'Succeeded' and it['unique'] and
       it['ra'].get(11) == {EDIT} and it['ra'].get(3) == {fsp.FULL} and set(it['ra']) <= {3, 10, 11}, (st, eng and eng.log, it['ra']))
    ok('Flow 7: the Manager Review records it (Open, sections, item, opened, close-by end of month)', f.get('ChallengeState') == 'Open' and
       int(f.get('ChallengeItemId')) == it['id'] and 'disagree' in f.get('ChallengeSectionsJson', '') and f.get('ChallengeOpenedOn') and
       f.get('ChallengeCloseBy') == '2026-12-31' and not f.get('ChallengeTlAgreedOn') and not f.get('ChallengeTechAgreedOn'), f)
    ok('Flow 7: E14 to the TL names the technician and month, with a link (no challenge text in the email)', len(mails) == 1 and mails[0]['to'] == 'team.leader@example.test' and
       'Alex Morgan' in mails[0]['subject'] and 'November 2026' in mails[0]['subject'] and '?reviewId=' in mails[0]['body'] and 'disagree' not in mails[0]['body'], mails)
    ok('Flow 7: the item shows Open and the month', it['fields'].get('ChallengeStatus') == 'Open' and it['fields'].get('MonthKey') == '2026-11', it['fields'])
    n = len(sp.emails)
    st, eng = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-10T09:05:00'))
    ok('Flow 7: its own update runs harmlessly (still open, no second email)', st == 'Succeeded' and f['ChallengeState'] == 'Open' and len(sp.emails) == n, (st, eng and eng.log))
    it2, st, _, mails = challenge(11, nov_a['id'], when='2026-12-10T09:10:00')
    ok('Flow 7: a second challenge of the same review is rejected', it2['fields'].get('ChallengeStatus') == 'Rejected' and 11 not in it2['ra'] and
       int(f['ChallengeItemId']) == it['id'] and not mails)
    # the technician can't close it alone, whatever they write on their item
    sp.me = 11
    sp.write_item(ch, it['id'], {'item/TechAgreedOn': '2026-12-11T09:00:00Z', 'item/ChallengeStatus/Value': 'Agreed'})
    sp.me = 10
    st, eng = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-11T09:05:00'))
    sp.me = 11
    sp.write_item(ch, it['id'], {'item/SectionsJson': '[{"key":"actions","note":"swapped after the TL looked"}]'})
    sp.me = 10
    fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-11T09:06:00'))
    ok('Flow 7: the topics are fixed once accepted (rewriting them on the item changes nothing)', 'disagree' in f['ChallengeSectionsJson'] and
       'swapped' not in f['ChallengeSectionsJson'], f['ChallengeSectionsJson'])
    ok('Flow 7: the technician agreeing (or writing Agreed on their item) does not close it without the TL', st == 'Succeeded' and f['ChallengeState'] == 'Open' and
       f.get('ChallengeTechAgreedOn') and it['ra'].get(11) == {EDIT}, (st, f))
    # the TL agrees on the Manager Review (the technician can only read that) and wakes the flow
    sp.write_item(mgr, nov_a['id'], {'item/ChallengeTlAgreedOn': '2026-12-12T09:00:00Z'})
    sp.write_item(ch, it['id'], {'item/TlPing': '2026-12-12T09:00:00Z'})
    st, eng = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-12T09:05:00'))
    ok('Flow 7: both agreed – Agreed, closed, and the item locked to Read', st == 'Succeeded' and f['ChallengeState'] == 'Agreed' and f.get('ChallengeClosedOn') and
       it['ra'].get(11) == {READ} and it['fields'].get('ChallengeStatus') == 'Agreed', (st, eng and eng.log, f, it['ra']))
    n = len(sp.emails)
    st, _ = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-12T09:10:00'))
    ok('Flow 7: closed – a later run changes nothing', st == 'Succeeded' and f['ChallengeState'] == 'Agreed' and it['ra'].get(11) == {READ} and len(sp.emails) == n)
    # the TL reopens it
    sp.write_item(mgr, nov_a['id'], {'item/ChallengeState/Value': 'Open', 'item/ChallengeTlAgreedOn': None, 'item/ChallengeTechAgreedOn': None,
                                     'item/ChallengeClosedOn': None, 'item/ChallengeCloseBy': '2026-12-31'})
    sp.write_item(ch, it['id'], {'item/TlPing': '2026-12-13T09:00:00Z', 'item/TechAgreedOn': None})
    n = len(sp.emails)
    st, eng = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-13T09:05:00'))
    ok('Flow 7: reopened by the TL – the technician gets Edit back and E15', st == 'Succeeded' and it['ra'].get(11) == {EDIT} and f['ChallengeState'] == 'Open' and
       len(sp.emails) == n + 1 and sp.emails[-1]['to'] == 'alex.morgan@example.test' and 'reopened' in sp.emails[-1]['subject'], (st, eng and eng.log))
    # tampering while open: two holders; pointing the item at another review
    it['ra'][12] = {EDIT}
    st, _ = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-13T09:10:00'))
    ok('Flow 7: two people holding a challenge stops the run (Failed)', st == 'Failed', st)
    del it['ra'][12]
    sp.me = 11
    sp.write_item(ch, it['id'], {'item/ManagerReviewId': nov_s['id']})
    sp.me = 10
    st, _ = fire('7', sp, '1-to-1 Challenges', it['id'], T('2026-12-13T09:15:00'))
    ok('Flow 7: pointing a challenge at another review is ignored', st == 'Cancelled' and not nov_s['fields'].get('ChallengeState'), st)
    ok('Flow 7: … and the moved item is locked to Read', it['ra'].get(11) == {READ}, it['ra'])
    sp.write_item(ch, it['id'], {'item/ManagerReviewId': nov_a['id']})
    it['ra'][11] = {EDIT}   # (as the TL's reopen left it)
    # last 7 days of a month: runs to the end of next month
    it3, st, _, _ = challenge(12, nov_s['id'], when='2026-12-27T09:00:00')
    ok('Flow 7: raised in the last 7 days of a month – closes at the end of next month', nov_s['fields'].get('ChallengeCloseBy') == '2027-01-31', nov_s['fields'])
    # Flow 1: past the close-by date -> Not agreed, still flagged, item back to Read
    st, eng = run('1', sp, T('2027-01-01T07:00:00'), overrides={'varTestDate': '2027-01-01T07:00:00'})
    ok('Flow 1: an open challenge past its close-by date closes as Not agreed and the item goes back to Read', st == 'Succeeded' and
       f['ChallengeState'] == 'Not agreed' and f.get('ChallengeClosedOn') and it['ra'].get(11) == {READ}, (st, eng and eng.log, f))
    ok('Flow 1: one not yet at its close-by date stays open', nov_s['fields']['ChallengeState'] == 'Open' and it3['ra'].get(12) == {EDIT})
    ok('Flow 1: … and the challenge item shows Not agreed', it['fields'].get('ChallengeStatus') == 'Not agreed', it['fields'])
    st, _ = fire('7', sp, '1-to-1 Challenges', it['id'], T('2027-01-01T08:00:00'))
    ok('Flow 7: a run after the close changes nothing', st == 'Succeeded' and it['fields'].get('ChallengeStatus') == 'Not agreed' and it['ra'].get(11) == {READ})
    # both agreed but the closing run never happened (the TL's wake-up failed, or Flow 7 was off): Flow 1 closes it as Agreed
    sp.write_item(mgr, nov_s['id'], {'item/ChallengeTlAgreedOn': '2027-01-20T09:00:00Z', 'item/ChallengeTechAgreedOn': '2027-01-21T09:00:00Z'})
    st, eng = run('1', sp, T('2027-02-01T07:00:00'), overrides={'varTestDate': '2027-02-01T07:00:00'})
    ok('Flow 1: past its close-by date with both agreements recorded, it closes as Agreed (not Not agreed)', st == 'Succeeded' and
       nov_s['fields']['ChallengeState'] == 'Agreed' and it3['fields'].get('ChallengeStatus') == 'Agreed' and it3['ra'].get(12) == {READ}, (st, eng and eng.log, nov_s['fields']))
    # before Setup has created the list (upgrade order): Flow 1 still runs
    sp2 = fsp.FakeSP()
    run('0', sp2, T('2026-10-01T06:00:00'))
    del sp2.lists[sp2.list_by_title('1-to-1 Challenges')['Id'] if 'Id' in sp2.list_by_title('1-to-1 Challenges') else next(k for k, v in sp2.lists.items() if v['Title'] == '1-to-1 Challenges')]
    st, eng = run('1', sp2, T('2026-11-01T07:00:00'), overrides={'varTestDate': '2026-11-01T07:00:00'})
    ok('Flow 1: runs normally on a site without the Challenges list', st == 'Succeeded', eng and eng.log)


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
    challenge_checks()
    passed = sum(1 for _, p in RESULTS if p)
    print('\n[{2}] {0} / {1} passed'.format(passed, len(RESULTS), MODE))
    sys.exit(0 if passed == len(RESULTS) else 1)
