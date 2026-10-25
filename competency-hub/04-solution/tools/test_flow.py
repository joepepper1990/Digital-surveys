"""Runs the generated Request queue flow (the real flow JSON) against the simulated Hub site.
    python3 test_flow.py
Evidence class: LOCAL / OFFLINE-SIMULATED. The tenant behaviour is proven only by the import and the tests on the site.
"""
import json
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import flows
from hub_fake import HubFake, SITE
from wdl import Engine

FLOWS = {f['name']: f['json']['properties']['definition'] for f in flows.build_all()}
FLOW = FLOWS['ESG Competency Hub | 2 Request queue']
DAILY = FLOWS['ESG Competency Hub | 1 Daily tasks']
MONITOR = FLOWS['ESG Competency Hub | 3 Queue monitor']
ADMIN = FLOWS['ESG Competency Hub | 6 Administration']
UK = ZoneInfo('Europe/London')
JOE, RACHEL, KELLY, KAI = 7, 112, 103, 110
KEY = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
KEY2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
AREAS = ['FLK', 'INS', 'GRS', 'RPE', 'BA', 'DOS', 'RP', 'DSL', 'ALS', 'RW']


def site():
    s = HubFake(me=JOE)
    for uid, title, email in ((JOE, 'Pepper Joseph', 'joseph.pepper@example.test'), (RACHEL, 'Boulden Rachel', 'rachel.boulden@example.test'),
                              (KELLY, 'Bates Kelly', 'kelly.bates@example.test'), (KAI, 'Todd Kai', 'kai.todd@example.test')):
        s.add_user(uid, title, email)
    # the Competency Hub groups, as Setup made them (plan E.4, spec §4.4)
    s.gid = {name: s.add_group('Competency Hub – ' + name) for name in ('All Users', 'Management', 'Administrators', 'Notice Posters')}
    for i, k in enumerate(AREAS):
        gid = s.add_group('Competency Hub – {0} Members'.format(k))
        s.gid[k] = gid
        s.add('competencies', '', {'Title': k, 'CompetencyKey': k, 'SortOrder': (i + 1) * 10, 'Status': 'Active', 'MembersGroupId': float(gid)})
        for lst in ('actions', 'updates', 'history', 'members'):
            s.folder(lst, k)
    s.folder('history', 'Transactions')
    s.folder('history', 'Administration')
    for uid in (JOE, RACHEL, KELLY, KAI):
        s.folder('requests', 'u{0}'.format(uid))
        # each person's own folder: its own permissions, the person can add and edit (Setup, plan E.4)
        s.folder_item('requests', 'u{0}'.format(uid)).update({'unique': True, 'ra': {s.me: {1073741829}, uid: {2003}}})
    for uid, title, role in ((JOE, 'Pepper Joseph', 'Team Leader'), (RACHEL, 'Boulden Rachel', 'Technician'),
                             (KELLY, 'Bates Kelly', 'Engineer'), (KAI, 'Todd Kai', 'Engineer')):
        s.add('people', '', {'Title': title, 'PersonId': uid, 'Email': title, 'SiteUserId': float(uid), 'Role': role, 'IsAdministrator': uid == JOE,
                             'Status': 'Active'})
    for uid in (JOE, RACHEL, KELLY, KAI):
        s.groups[s.gid['All Users']]['users'].add(uid)
        s.groups[s.gid['Notice Posters']]['users'].add(uid)
    s.groups[s.gid['Management']]['users'].add(JOE)
    s.groups[s.gid['Administrators']]['users'].add(JOE)
    for uid, key in ((RACHEL, 'FLK'), (RACHEL, 'GRS'), (KELLY, 'FLK'), (KAI, 'RW')):
        s.groups[s.gid[key]]['users'].add(uid)
    # Rachel: FLK and GRS; Kelly: FLK (engineer, runs meetings); Kai: RW only
    for uid, key, mtg in ((RACHEL, 'FLK', False), (RACHEL, 'GRS', False), (KELLY, 'FLK', True), (KAI, 'RW', True)):
        s.add('members', key, {'Title': key, 'CompetencyId': AREAS.index(key) + 1, 'PersonId': uid, 'MembershipKey': '{0}|{1}'.format(key, uid),
                               'CanManageMeetings': mtg, 'Status': 'Active'})
    # an existing action in FLK owned by Rachel, raised by Kelly, due 19 Oct 2026 (2 days late)
    s.action = s.add('actions', 'FLK', {
        'Title': 'Replace FH40 probe', 'Description': 'Probe failed its check.', 'CompetencyId': 1, 'AssignedToId': RACHEL, 'RaisedById': KELLY,
        'DateRaised': '2026-10-01T09:00:00Z', 'OriginalDueDate': '2026-10-11T23:00:00Z', 'CurrentDueDate': '2026-10-18T23:00:00Z',
        'DueDay': 20261019.0, 'Status': 'In Progress', 'IsOpen': True, 'Priority': 'Normal', 'RequiresCloseOut': False,
        'ExtensionCount': 1.0, 'Revision': 2.0, 'PendingRequestKey': None, 'LastRequestKey': None, 'CreatedRequestKey': 'IMPORT-1'})
    s.folder('updates', 'FLK/A{0}'.format(s.action))
    s.folder('history', 'FLK/A{0}'.format(s.action))   # made when the action was raised
    for title, value in (('OverdueReminderIntervalDays', '7'), ('ReminderDaysBefore', '7'), ('LastDailyRun', ''), ('QueueHealth', ''),
                         ('MonitorHours', '07:00|19:45|60'), ('MaxDeadlineYears', '2'), ('PreGoLiveTesting', 'Yes')):
        s.add('settings', '', {'Title': title, 'Value': value})
    s.monitor_alive = True    # the queue monitor reported a moment ago (healthy_monitor)
    s.daily_alive = True      # Daily tasks ran this morning (run_monitor)
    return s


def healthy_monitor(s):
    """The queue monitor's last report, a few minutes before the clock, unless a test has stopped it."""
    if s.monitor_alive:
        row = s.rows('settings', Title='QueueHealth')[0]
        row['f']['Value'] = json.dumps({'state': 'Healthy', 'reason': '', 'checkedAt': (s.clock - timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M:%SZ')})


def submit(s, sender, rtype, payload, target=None, revision=None, folder=None, key=KEY, created=None, author=None):
    return s.add('requests', folder if folder is not None else 'u{0}'.format(sender), {
        'Title': rtype, 'RequestKey': key, 'RequestType': rtype, 'TargetId': float(target) if target else None,
        'ExpectedRevision': float(revision) if revision else None, 'Payload': payload if isinstance(payload, str) else json.dumps(payload),
        'Status': 'Submitted'}, author=author or sender, created=created)


def run(s, req_id, now=None):
    s.clock = now or s.clock
    eng = Engine(FLOW, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', req_id))
    status = eng.run()
    return status, eng


def request(s, req_id):
    return s.item('requests', req_id)['f']


class RaiseAction(unittest.TestCase):
    good = {'areaKey': 'FLK', 'title': 'Order replacement smear papers', 'description': 'Stock is down to one box.',
            'ownerId': RACHEL, 'dueIso': '2026-10-28', 'priority': 'Normal', 'requiresCloseOut': False}

    def test_raised_with_every_record(self):
        s = site()
        r = submit(s, RACHEL, 'RaiseAction', self.good)
        status, eng = run(s, r)
        self.assertEqual(status, 'Succeeded', eng.log)
        req = request(s, r)
        self.assertEqual(req['Status'], 'Completed', req)
        a = s.rows('actions', CreatedRequestKey='F|' + KEY)
        self.assertEqual(len(a), 1)
        a = a[0]
        self.assertEqual(req['ResultId'], a['id'])
        self.assertEqual(req['ResultMessage'], 'ACT-{0:05d} raised.'.format(a['id']))
        f = a['f']
        self.assertEqual((f['Title'], f['CompetencyId'], f['AssignedToId'], f['RaisedById']), ('Order replacement smear papers', 1, RACHEL, RACHEL))
        # 28 October 2026 is after the clocks go back (25 October), so UK midnight is 00:00 UTC
        self.assertEqual((f['DueDay'], f['OriginalDueDate'], f['CurrentDueDate']), (20261028.0, '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z'))
        self.assertEqual((f['Status'], f['IsOpen'], f['Revision'], f['ExtensionCount']), ('Open', True, 1.0, 0.0))
        self.assertEqual(f['IsTestRecord'], True, 'marked as a test record while pre-go-live testing is on')
        self.assertEqual((f['PendingRequestKey'] or None, f['LastRequestKey']), (None, KEY), 'lock released, change confirmed')
        self.assertEqual(a['dir'], 'FLK')
        self.assertTrue(s._find_folder(s.by_key['updates'], 'FLK', 'A{0}'.format(a['id'])), 'Updates folder for the action')
        ev = s.rows('history', RequestKey=KEY + '|1')
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]['dir'], 'FLK/A{0}'.format(a['id']))
        self.assertEqual((ev[0]['f']['EventType'], ev[0]['f']['ActorId'], ev[0]['f']['RecordId'], ev[0]['f']['CompetencyId']),
                         ('Action Raised', RACHEL, float(a['id']), 1))
        tx = s.rows('history', RowKind='Transaction')
        self.assertEqual(len(tx), 1)
        self.assertEqual((tx[0]['dir'], tx[0]['f']['State'], tx[0]['f']['RequestKey']), ('Transactions', 'Applied', KEY))

    def test_refused_in_plain_words_and_nothing_created(self):
        cases = [({'areaKey': 'RW'}, 'Choose one of your areas.'),
                 ({'areaKey': 'XX'}, 'Choose one of your areas.'),
                 ({'ownerId': KAI}, 'Choose a member of this area or a Team Leader.'),
                 ({'ownerId': JOE}, flows.SELF_ONLY),
                 ({'title': '  '}, 'Enter what needs doing.'),
                 ({'title': 'x' * 256}, 'Keep the title to 255 characters or fewer.'),
                 ({'description': ''}, 'Add a short description.'),
                 ({'dueIso': '2026-10-20'}, 'The target date cannot be in the past.'),
                 ({'dueIso': '2026-10-21'}, None),
                 ({'dueIso': '2028-10-21'}, None),
                 ({'dueIso': '2028-10-22'}, 'Choose a date within 2 years.'),
                 ({'dueIso': '2026-13-45'}, 'Choose a target date.'),
                 ({'dueIso': 'soon'}, 'Choose a target date.'),
                 ({'priority': 'Urgent'}, 'Choose a priority.')]
        for change, message in cases:
            with self.subTest(change=change):
                s = site()
                r = submit(s, RACHEL, 'RaiseAction', dict(self.good, **change))
                status, eng = run(s, r)
                self.assertEqual(status, 'Succeeded', eng.log)
                req = request(s, r)
                if message is None:
                    self.assertEqual(req['Status'], 'Completed', (req, eng.log))
                    continue
                self.assertEqual((req['Status'], req['ResultMessage']), ('Rejected', message))
                self.assertEqual(s.rows('actions', CreatedRequestKey='F|' + KEY), [])
                self.assertEqual(s.rows('history', RowKind='Transaction')[0]['f']['State'], 'Void')

    def test_a_team_leader_raises_in_any_area(self):
        s = site()
        r = submit(s, JOE, 'RaiseAction', dict(self.good, areaKey='RW', ownerId=KAI))
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)


class Identity(unittest.TestCase):
    def test_only_the_own_folder_counts(self):
        payload = RaiseAction.good
        for folder, author in (('u103', RACHEL), ('', RACHEL), ('FLK', RACHEL)):
            with self.subTest(folder=folder):
                s = site()
                if folder == 'FLK':
                    s.folder('requests', 'FLK')
                r = submit(s, RACHEL, 'RaiseAction', payload, folder=folder, author=author)
                status, eng = run(s, r)
                self.assertEqual(status, 'Succeeded', eng.log)
                req = request(s, r)
                self.assertEqual((req['Status'], req['ResultMessage']), ('Rejected', 'This request was not sent from your own request folder.'))
                self.assertEqual(s.rows('history', RowKind='Transaction'), [], 'no transaction for an untrusted request')

    def test_a_folder_not_made_by_the_flow_account_is_not_trusted(self):
        s = site()
        s.folder('requests', 'u999', author=RACHEL)
        r = submit(s, RACHEL, 'RaiseAction', RaiseAction.good, folder='u999', author=RACHEL)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Rejected')

    def test_a_person_who_has_left_is_refused(self):
        s = site()
        s.rows('people', SiteUserId=float(RACHEL))[0]['f']['Status'] = 'Left'
        r = submit(s, RACHEL, 'RaiseAction', RaiseAction.good)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Rejected')


class Extend(unittest.TestCase):
    def payload(self, **kw):
        return dict({'newDueIso': '2026-10-28', 'reason': 'Waiting for the replacement probe.', 'expectedDueDay': 20261019}, **kw)

    def test_owner_extends_and_history_records_it(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', self.payload(), target=s.action, revision=2)
        status, eng = run(s, r)
        self.assertEqual(status, 'Succeeded', eng.log)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Completed', 'Deadline moved to 28 October 2026.'))
        a = s.item('actions', s.action)['f']
        self.assertEqual((float(a['DueDay']), a['CurrentDueDate'], float(a['ExtensionCount']), float(a['Revision'])), (20261028.0, '2026-10-28T00:00:00Z', 2.0, 3.0))
        self.assertEqual((a['PendingRequestKey'], a['LastRequestKey']), ('', KEY))
        ev = s.rows('history', RequestKey=KEY + '|1')[0]
        self.assertEqual(ev['dir'], 'FLK/A{0}'.format(s.action))
        e = ev['f']
        self.assertEqual((e['EventType'], e['ExtensionNumber'], e['Note']), ('Deadline Extended', 2.0, 'Waiting for the replacement probe.'))
        self.assertEqual((e['PreviousDueDate'], e['NewDueDate'], e['OriginalDueDate']), ('2026-10-18T23:00:00Z', '2026-10-28T00:00:00Z', '2026-10-11T23:00:00Z'))
        self.assertEqual((e['WasOverdue'], float(e['DaysOverdue']), e['IsOnBehalf']), (True, 2.0, False))

    def test_an_engineer_extends_on_behalf_of_the_owner(self):
        s = site()
        r = submit(s, KELLY, 'ExtendDeadline', self.payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertEqual(s.rows('history', RequestKey=KEY + '|1')[0]['f']['IsOnBehalf'], True)

    def test_refusals(self):
        cases = [(RACHEL, 1, {}, 'This action was updated by someone else. Review the latest details and try again.'),
                 (RACHEL, 2, {'expectedDueDay': 20261020}, 'This action was updated by someone else. Review the latest details and try again.'),
                 (KAI, 2, {}, 'Only the owner or the people who manage this action can move its deadline.'),
                 (RACHEL, 2, {'newDueIso': '2026-10-19'}, 'The new deadline must be after 19 October 2026.'),
                 (RACHEL, 2, {'newDueIso': '2026-10-20'}, 'The new deadline cannot be in the past.'),
                 (RACHEL, 2, {'newDueIso': '2026-10-21'}, None),
                 (RACHEL, 2, {'newDueIso': 'next week'}, 'Choose the new deadline.'),
                 (RACHEL, 2, {'reason': 'too short'}, 'Give a reason of at least 10 characters.'),
                 (RACHEL, 2, {'reason': 'x' * 1001}, 'Keep the reason to 1,000 characters or fewer.')]
        for sender, rev, change, message in cases:
            with self.subTest(sender=sender, rev=rev, change=change):
                s = site()
                before = dict(s.item('actions', s.action)['f'])
                r = submit(s, sender, 'ExtendDeadline', self.payload(**change), target=s.action, revision=rev)
                status, eng = run(s, r)
                req = request(s, r)
                if message is None:
                    self.assertEqual(req['Status'], 'Completed', eng.log)
                    continue
                self.assertEqual((req['Status'], req['ResultMessage']), ('Rejected', message), eng.log)
                self.assertEqual(s.item('actions', s.action)['f'], before, 'nothing changed')

    def test_a_locked_or_closed_action_is_refused(self):
        s = site()
        s.item('actions', s.action)['f']['PendingRequestKey'] = 'someone-else'
        r = submit(s, RACHEL, 'ExtendDeadline', self.payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'This action is being updated. Try again in a minute.')
        s = site()
        s.item('actions', s.action)['f']['Status'] = 'Completed'
        r = submit(s, RACHEL, 'ExtendDeadline', self.payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'This action is no longer open, so its deadline cannot be moved.')
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', self.payload(), target=999, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'That action could not be found.')

    def test_a_change_between_reading_and_writing_is_refused_not_overwritten(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', self.payload(), target=s.action, revision=2)
        original = s.rest

        def racing(method, uri, headers, body):
            # someone saves the action just before the flow's conditional write reaches it
            if headers.get('X-HTTP-Method') == 'MERGE' and headers.get('IF-MATCH', '*') != '*' and '/items({0})'.format(s.action) in uri:
                s.item('actions', s.action)['version'] += 1
            return original(method, uri, headers, body)
        s.rest = racing
        run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']),
                         ('Rejected', 'This action was updated by someone else. Review the latest details and try again.'))
        self.assertEqual(float(s.item('actions', s.action)['f']['DueDay']), 20261019.0)


class Complete(unittest.TestCase):
    def test_closes_without_close_out(self):
        s = site()
        r = submit(s, RACHEL, 'MarkComplete', {'note': 'Fitted and tested.'}, target=s.action, revision=2)
        status, eng = run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Completed', 'Action closed.'), eng.log)
        a = s.item('actions', s.action)['f']
        self.assertEqual((a['Status'], a['IsOpen'], a['ClosedById'], a['CloseOutcome'], float(a['Revision'])), ('Closed', False, RACHEL, 'Completed', 3.0))
        self.assertEqual(s.rows('history', RequestKey=KEY + '|1')[0]['f']['EventType'], 'Closed')

    def test_waits_for_close_out_when_required(self):
        s = site()
        s.item('actions', s.action)['f']['RequiresCloseOut'] = True
        r = submit(s, RACHEL, 'MarkComplete', {'note': ''}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Marked as done; waiting for a close-out check.')
        a = s.item('actions', s.action)['f']
        self.assertEqual((a['Status'], a['IsOpen'], a['DateClosed']), ('Completed', True, None))

    def test_a_technician_who_is_not_owner_cannot(self):
        s = site()
        s.item('actions', s.action)['f']['AssignedToId'] = KELLY
        s.item('actions', s.action)['f']['RaisedById'] = JOE
        r = submit(s, RACHEL, 'MarkComplete', {'note': ''}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Only the owner or the people who manage this action can mark it as done.')


class Robustness(unittest.TestCase):
    def snapshot(self, s):
        out = {}
        for key in ('actions', 'history', 'updates', 'requests'):
            rows = []
            for it in s.by_key[key]['items'].values():
                f = {k: v for k, v in it['f'].items() if k not in ('ProcessedAt', 'FirstClaimedAt', 'Attempts', 'LastError', 'StepsDone', 'NextAttemptAfter')}
                rows.append((it['dir'], it['fsobj'], json.dumps(f, sort_keys=True, default=str)))
            out[key] = sorted(rows)
        return out

    def interrupted_everywhere(self, rtype, payload, target=None, revision=None, sender=RACHEL, settle=False):
        ref = site()
        r = submit(ref, sender, rtype, payload, target=target and ref.action, revision=revision)
        status, eng = run(ref, r)
        self.assertEqual(request(ref, r)['Status'], 'Completed', eng.log)
        expected, total = self.snapshot(ref), len(ref.writes)
        for k in range(1, total + 1):
            with self.subTest(write=k, of=total, at=ref.writes[k - 1]):
                s = site()
                r = submit(s, sender, rtype, payload, target=target and s.action, revision=revision)
                s.fail_at = k
                first, eng1 = run(s, r)
                s.fail_at = None
                req = request(s, r)
                if req['Status'] == 'Completed':   # interrupted only after the request was marked Completed
                    continue
                self.assertIn(first, ('Failed', 'Cancelled'))
                req['Status'] = 'Submitted'          # an administrator puts it back in the queue
                second, eng2 = run(s, r, now=s.clock + timedelta(minutes=10))
                self.assertEqual(request(s, r)['Status'], 'Completed', eng2.log)
                if settle:   # emails queued by the stopped run are sent by the queue monitor within the hour
                    run_monitor(s, s.clock + timedelta(minutes=45))
                got = self.snapshot(s)
                for key in ('actions', 'history', 'updates'):
                    self.assertEqual(got[key], expected[key], key)
                # each email has exactly one row, and is never sent twice
                keys = sorted(it['f']['NotificationKey'] for it in s.by_key['notifications']['items'].values())
                self.assertEqual(keys, sorted(it['f']['NotificationKey'] for it in ref.by_key['notifications']['items'].values()))
                self.assertLessEqual(len(s.sent), len(ref.sent))

    def test_known_as_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('SetKnownAs', {'personId': RACHEL, 'knownAs': 'Rach'}, sender=JOE)

    def test_raise_with_co_owners_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('RaiseAction', dict(RaiseAction.good, coOwnerIds=[JOE], requiresCloseOut=True, checkerId=KELLY), sender=KELLY, settle=True)

    def test_reassign_with_co_owners_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('ReassignAction', {'ownerId': JOE, 'reason': 'Joe has the parts.', 'coOwnerIds': [RACHEL]}, target=True, revision=2, sender=KELLY, settle=True)

    def test_raise_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('RaiseAction', RaiseAction.good)

    def test_extend_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('ExtendDeadline', Extend().payload(), target=True, revision=2)

    def test_complete_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('MarkComplete', {'note': 'Done.'}, target=True, revision=2)

    def test_status_reassign_close_reopen_and_edit_survive_an_interruption_at_every_write(self):
        for rtype, payload in (('ChangeStatus', {'status': 'Awaiting Input', 'blocker': 'Waiting for the supplier.'}),
                               ('CloseAction', {'outcome': 'Superseded', 'note': 'Replaced by another action.'}),
                               ('ReassignAction', {'ownerId': JOE, 'reason': 'Joe will take this one on.'}),
                               ('EditActionDetails', {'title': 'New title', 'priority': 'High'})):
            with self.subTest(rtype):
                self.interrupted_everywhere(rtype, payload, target=True, revision=2, sender=KELLY)

    def test_a_completed_request_put_back_changes_nothing(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        before = self.snapshot(s)
        request(s, r)['Status'] = 'Submitted'
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')
        after = self.snapshot(s)
        for key in ('actions', 'history', 'updates'):
            self.assertEqual(after[key], before[key])

    def test_editing_the_request_after_the_claim_changes_nothing(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        s.fail_at = 9
        run(s, r)
        s.fail_at = None
        req = request(s, r)
        req['Payload'] = json.dumps(Extend().payload(newDueIso='2027-06-30'))   # the user edits their request item
        req['Status'] = 'Submitted'
        run(s, r)
        self.assertEqual(float(s.item('actions', s.action)['f']['DueDay']), 20261028.0, 'the private copy was used')

    def test_unreadable_payload_and_unknown_type_are_refused(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', '{not json', target=s.action, revision=2)
        run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', 'The request could not be read.'))
        s = site()
        r = submit(s, RACHEL, 'DeleteEverything', {}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'This kind of change is not recognised.')

    def test_event_time_rule(self):
        # created 10 minutes before the claim: the request's own time counts; 2 hours before: the claim time does
        for minutes, expect_created in ((10, True), (120, False)):
            s = site()
            created = (s.clock - timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%SZ')
            r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2, created=created)
            run(s, r)
            ev = s.rows('history', RequestKey=KEY + '|1')[0]['f']
            self.assertEqual(ev['EventTime'] == created, expect_created, (minutes, ev['EventTime']))

    def test_the_failure_path_marks_the_request_failed(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        s.fail_at = 6
        status, eng = run(s, r)
        self.assertEqual(status, 'Failed')
        self.assertEqual(request(s, r)['Status'], 'Failed')
        self.assertEqual(s.rows('history', RowKind='Transaction')[0]['f']['State'], 'Failed')


class Emails(unittest.TestCase):
    """Plan B.5 / F.4.2: one email per change and person, never to the person who made the change."""
    def notices(self, s):
        return {it['f']['NotificationKey']: it['f'] for it in s.by_key['notifications']['items'].values()}

    def test_raising_for_yourself_sends_nothing(self):
        s = site()
        r = submit(s, RACHEL, 'RaiseAction', RaiseAction.good)
        run(s, r)
        self.assertEqual((request(s, r)['Status'], s.sent, self.notices(s)), ('Completed', [], {}))

    def test_raising_for_someone_else_tells_them_and_covers_the_7_day_reminder(self):
        s = site()
        r = submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL, dueIso='2026-10-25'))
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertEqual([(m['to'], m['subject']) for m in s.sent], [('rachel.boulden@example.test', 'Action assigned to you: Order replacement smear papers')])
        body = s.sent[0]['body']
        for text in ('Bates Kelly has given you an action', '25 October 2026', 'Hub.aspx?action=', 'Reference ESGN'):
            self.assertIn(text, body)
        aid = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['id']
        n = self.notices(s)
        self.assertEqual(n['ASG|{0}|{1}'.format(KEY, RACHEL)]['State'], 'Sent')
        self.assertIn(n['ASG|{0}|{1}'.format(KEY, RACHEL)]['Token'], body)
        self.assertEqual(n['R7|{0}|20261025|{1}'.format(aid, RACHEL)]['State'], 'Skipped')

    def test_a_deadline_far_away_leaves_the_reminder_to_the_daily_run(self):
        s = site()
        r = submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL, dueIso='2026-11-30'))
        run(s, r)
        self.assertEqual(sorted(k.split('|')[0] for k in self.notices(s)), ['ASG'])

    def test_text_people_typed_is_escaped(self):
        s = site()
        r = submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL, title='<img src=x onerror=alert(1)> & "it\'s"'))
        run(s, r)
        body = s.sent[0]['body']
        self.assertNotIn('<img', body)
        self.assertIn('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;it&#39;s&quot;', body)

    def test_a_deadline_moved_on_the_owners_behalf_tells_the_owner(self):
        s = site()
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual([(m['to'], m['subject']) for m in s.sent], [('rachel.boulden@example.test', 'Deadline moved: Replace FH40 probe')])
        body = s.sent[0]['body']
        for text in ('Bates Kelly has moved the deadline', '28 October 2026 (originally 12 October 2026)', 'Was due', '19 October 2026',
                     'Reason', 'Waiting for the replacement probe.'):
            self.assertIn(text, body)

    def test_the_owner_moving_their_own_deadline_sends_nothing(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual(s.sent, [])

    def test_the_owner_closing_tells_nobody_and_a_close_out_asks_the_raiser(self):
        # spec D1: no closure email to the raiser (rejected); the close-out check is a request to act, so it stays
        for close_out, expected in ((False, []), (True, [('kelly.bates@example.test', 'Ready for your close-out check: Replace FH40 probe')])):
            with self.subTest(close_out=close_out):
                s = site()
                s.item('actions', s.action)['f']['RequiresCloseOut'] = close_out
                r = submit(s, RACHEL, 'MarkComplete', {'note': 'Probe fitted & tested.'}, target=s.action, revision=2)
                run(s, r)
                self.assertEqual([(m['to'], m['subject']) for m in s.sent], expected)
                if expected:
                    self.assertIn('Probe fitted &amp; tested.', s.sent[0]['body'])
                    self.assertEqual(list(self.notices(s)), ['RDY|{0}|{1}'.format(KEY, KELLY)])
                else:
                    self.assertEqual(list(self.notices(s)), [])

    def test_a_manager_closing_tells_the_owner_only(self):
        s = site()
        r = submit(s, KELLY, 'CloseAction', {'outcome': 'No longer required', 'note': 'The probe type is withdrawn.'}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual([(m['to'], m['subject']) for m in s.sent], [('rachel.boulden@example.test', 'Action closed: Replace FH40 probe')])

    def test_a_refused_send_is_failed_and_an_unclear_one_unknown(self):
        for outcome, state, sent in ((400, 'Failed', 0), (500, 'Unknown', 1), ('timeout', 'Unknown', 0)):
            with self.subTest(outcome):
                s = site()
                s.mail_fail = [outcome]
                r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
                status, eng = run(s, r)
                self.assertEqual(request(s, r)['Status'], 'Completed')   # the change stands whatever happens to the email
                row = list(self.notices(s).values())[0]
                self.assertEqual((row['State'], len(s.sent)), (state, sent))
                self.assertTrue(row['NextAttemptAfter'])


def run_daily(s, uk_day, hour=6):
    """The daily flow as it runs at 06:00 UK time on the given date."""
    s.clock = datetime(uk_day.year, uk_day.month, uk_day.day, hour, 0, tzinfo=UK).astimezone(timezone.utc)
    healthy_monitor(s)
    eng = Engine(DAILY, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock)
    return eng.run(), eng


def due_on(s, iso, action=None):
    a = s.item('actions', action or s.action)['f']
    d = date.fromisoformat(iso)
    a['DueDay'] = float(d.strftime('%Y%m%d'))
    a['CurrentDueDate'] = datetime(d.year, d.month, d.day, tzinfo=UK).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class Daily(unittest.TestCase):
    """Plan F.4.1 and the D.0.1 date matrix, run as the real flow on each morning."""
    def days(self, start, end):
        d = date.fromisoformat(start)
        while d <= date.fromisoformat(end):
            yield d
            d += timedelta(days=1)

    def emails_by_day(self, s, start, end, skip=()):
        out = []
        for d in self.days(start, end):
            if d.isoformat() in skip:
                continue
            before = len(s.sent)
            status, eng = run_daily(s, d)
            self.assertEqual(status, 'Succeeded', (d, eng.log))
            out += [(d.isoformat(), m['subject']) for m in s.sent[before:]]
        return out

    def test_the_7_day_reminder_comes_once_on_the_right_day(self):
        matrix = [('2026-10-28', '2026-10-21'), ('2026-11-02', '2026-10-26'), ('2026-11-01', '2026-10-25'), ('2026-12-31', '2026-12-24'),
                  ('2027-01-03', '2026-12-27'), ('2027-03-01', '2027-02-22'), ('2027-04-04', '2027-03-28'), ('2028-03-07', '2028-02-29'),
                  ('2028-03-01', '2028-02-23')]
        for due, expected in matrix:
            with self.subTest(due=due):
                s = site()
                due_on(s, due)
                start = (date.fromisoformat(due) - timedelta(days=10)).isoformat()
                last = (date.fromisoformat(due) - timedelta(days=1)).isoformat()
                got = self.emails_by_day(s, start, last)
                self.assertEqual(got, [(expected, 'Reminder: Replace FH40 probe is due in 7 days')])
                self.assertEqual(s.sent[0]['to'], 'rachel.boulden@example.test')

    def test_a_missed_morning_is_caught_up(self):
        s = site()
        due_on(s, '2026-10-28')
        got = self.emails_by_day(s, '2026-10-20', '2026-10-23', skip=('2026-10-21',))
        self.assertEqual(got, [('2026-10-22', 'Reminder: Replace FH40 probe is due in 6 days')])

    def test_due_today_and_late_reminders(self):
        s = site()
        due_on(s, '2026-10-19')
        got = self.emails_by_day(s, '2026-10-19', '2026-11-04')
        self.assertEqual(got, [('2026-10-19', 'Due today: Replace FH40 probe'), ('2026-10-20', 'Replace FH40 probe is 1 day late'),
                               ('2026-10-27', 'Replace FH40 probe is 8 days late'), ('2026-11-03', 'Replace FH40 probe is 15 days late')])

    def test_running_twice_on_one_morning_sends_once(self):
        s = site()
        due_on(s, '2026-10-28')
        run_daily(s, date(2026, 10, 21))
        run_daily(s, date(2026, 10, 21), hour=9)
        self.assertEqual(len(s.sent), 1)

    def test_an_assignment_within_7_days_covers_the_reminder(self):
        s = site()
        s.item('actions', s.action)['f'].update({'IsOpen': False, 'Status': 'Closed'})
        r = submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL, dueIso='2026-10-26'))
        run(s, r)
        got = self.emails_by_day(s, '2026-10-22', '2026-10-25')
        self.assertEqual(got, [])
        self.assertEqual(len(s.sent), 1)                     # the assignment only

    def test_closed_or_waiting_for_close_out_actions_get_no_reminder(self):
        for change in ({'IsOpen': False, 'Status': 'Closed'}, {'Status': 'Completed'}):
            with self.subTest(change):
                s = site()
                due_on(s, '2026-10-28')
                s.item('actions', s.action)['f'].update(change)
                self.assertEqual(self.emails_by_day(s, '2026-10-21', '2026-10-21'), [])

    def test_the_email_reads_well(self):
        s = site()
        due_on(s, '2026-10-28')
        run_daily(s, date(2026, 10, 25))
        body = s.sent[0]['body']
        for text in ('Your action is due in 3 days.', 'Replace FH40 probe', '28 October 2026 (originally 12 October 2026)', 'Hub.aspx?action='):
            self.assertIn(text, body)

    def test_the_run_is_recorded(self):
        s = site()
        run_daily(s, date(2026, 10, 21))
        self.assertTrue(s.rows('settings', Title='LastDailyRun')[0]['f']['Value'].startswith('2026-10-21T05:00:00'))

    def test_a_quiet_morning_uses_few_calls(self):
        s = site()
        due_on(s, '2026-12-31')
        run_daily(s, date(2026, 10, 21))
        self.assertLessEqual(len(s.calls), 10, s.calls)   # settings, people, actions, ledger, areas, memberships, 3 retry states, LastDailyRun


class Retries(unittest.TestCase):
    """Plan F.4.2: a refused email is tried again, an unclear one is sent again with a note, and three tries is the end."""
    def failed_extension_email(self, outcome):
        s = site()
        s.mail_fail = [outcome]
        # a deadline beyond the reminder window, so only this email is in play
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(newDueIso='2026-12-31'), target=s.action, revision=2)
        run(s, r)
        return s, next(iter(s.by_key['notifications']['items'].values()))['f']

    def test_a_refused_email_is_sent_the_next_morning(self):
        s, row = self.failed_extension_email(400)
        run_daily(s, date(2026, 10, 22))
        self.assertEqual((row['State'], float(row['Attempts']), len(s.sent)), ('Sent', 2.0, 1))
        self.assertNotIn('already received', s.sent[0]['body'])

    def test_an_unclear_email_is_sent_again_with_a_note(self):
        s, row = self.failed_extension_email('timeout')
        run_daily(s, date(2026, 10, 22))
        self.assertEqual(row['State'], 'Sent')
        self.assertIn('If you have already received this message, please ignore it.', s.sent[-1]['body'])

    def test_three_failures_and_it_is_abandoned(self):
        s, row = self.failed_extension_email(400)
        s.mail_fail = [400, 400]
        run_daily(s, date(2026, 10, 22))
        run_daily(s, date(2026, 10, 23))
        run_daily(s, date(2026, 10, 24))
        self.assertEqual((row['State'], float(row['Attempts'])), ('Abandoned', 3.0))
        # the email itself is not sent again; the administrators are told, once, with what was given up
        self.assertEqual([(m['to'], m['subject']) for m in s.sent],
                         [('joseph.pepper@example.test', 'Competency Hub needs attention: An email could not be sent: Deadline moved: Replace FH40 probe')])
        self.assertIn('rachel.boulden@example.test', s.sent[0]['body'])
        self.assertIn('Hub.aspx?view=admin', s.sent[0]['body'])
        run_daily(s, date(2026, 10, 25))
        self.assertEqual(len(s.sent), 1, 'an abandoned email is reported once')

    def test_an_email_that_no_longer_applies_is_skipped(self):
        s = site()
        due_on(s, '2026-10-28')
        s.mail_fail = [400]
        run_daily(s, date(2026, 10, 21))
        s.item('actions', s.action)['f'].update({'IsOpen': False, 'Status': 'Closed'})
        run_daily(s, date(2026, 10, 22))
        row = next(iter(s.by_key['notifications']['items'].values()))['f']
        self.assertEqual((row['State'], len(s.sent)), ('Skipped', 0))

    def test_an_email_left_sending_by_a_stopped_run_is_sent_with_a_note(self):
        s, row = self.failed_extension_email(None)
        row.update({'State': 'Sending', 'SendingSince': '2026-10-21T09:30:00Z'})
        sent = len(s.sent)
        run_daily(s, date(2026, 10, 22))
        self.assertEqual(row['State'], 'Sent')
        self.assertIn('already received', s.sent[sent]['body'])


class MoreChanges(unittest.TestCase):
    """Plan K9: status, reassign, close, reopen and edit details – each checked, locked, recorded and confirmed."""
    def change(self, sender, rtype, payload, s=None, revision=2):
        s = s or site()
        r = submit(s, sender, rtype, payload, target=s.action, revision=revision)
        status, eng = run(s, r)
        self.assertEqual(status, 'Succeeded', eng.log)
        return s, r, s.item('actions', s.action)['f'], request(s, r)

    def event(self, s):
        return s.rows('history', RequestKey=KEY + '|1')[0]['f']

    def test_status_waiting_on_something_stores_the_blocker_and_clears_it_later(self):
        s, r, a, req = self.change(RACHEL, 'ChangeStatus', {'status': 'Awaiting Input', 'blocker': 'Waiting for the supplier to deliver.'})
        self.assertEqual((req['Status'], req['ResultMessage']), ('Completed', 'Status changed to waiting on something.'))
        self.assertEqual((a['Status'], a['Blocker'], float(a['Revision']), a['PendingRequestKey'], a['LastRequestKey']),
                         ('Awaiting Input', 'Waiting for the supplier to deliver.', 3.0, '', KEY))
        e = self.event(s)
        self.assertEqual((e['EventType'], e['PreviousValue'], e['NewValue'], e['Note']),
                         ('Status Changed', 'In progress', 'Waiting on something', 'Waiting for the supplier to deliver.'))
        r2 = submit(s, RACHEL, 'ChangeStatus', {'status': 'In Progress'}, target=s.action, revision=3, key=KEY2)
        run(s, r2)
        a = s.item('actions', s.action)['f']
        self.assertEqual((request(s, r2)['Status'], a['Status'], a['Blocker']), ('Completed', 'In Progress', ''))

    def test_status_refusals(self):
        cases = [({'status': 'In Progress'}, 'Choose a different status.'), ({'status': 'Closed'}, 'Choose a status.'),
                 ({'status': 'Awaiting Input', 'blocker': 'parts'}, 'Say what it is waiting on (at least 10 characters).')]
        for payload, message in cases:
            with self.subTest(message):
                s, r, a, req = self.change(RACHEL, 'ChangeStatus', payload)
                self.assertEqual((req['Status'], req['ResultMessage'], float(a['Revision'])), ('Rejected', message, 2.0))
        s, r, a, req = self.change(KAI, 'ChangeStatus', {'status': 'Open'})
        self.assertEqual(req['ResultMessage'], 'Only the owner or the people who manage this action can change its status.')

    def test_reassign_moves_the_action_and_tells_both_people(self):
        s = site()
        s.add('members', 'FLK', {'Title': 'FLK', 'CompetencyId': 1, 'PersonId': KAI, 'MembershipKey': 'FLK|{0}'.format(KAI),
                                 'CanManageMeetings': False, 'Status': 'Active'})
        s, r, a, req = self.change(KELLY, 'ReassignAction', {'ownerId': KAI, 'reason': 'Kai has the replacement probe.'}, s=s)
        self.assertEqual((req['Status'], req['ResultMessage'], a['AssignedToId']), ('Completed', 'Reassigned to Todd Kai.', KAI))
        e = self.event(s)
        self.assertEqual((e['EventType'], e['PreviousValue'], e['NewValue'], e['Note']),
                         ('Reassigned', 'Boulden Rachel', 'Todd Kai', 'Kai has the replacement probe.'))
        sent = sorted((m['to'], m['subject']) for m in s.sent)
        self.assertEqual(sent, [('kai.todd@example.test', 'Action assigned to you: Replace FH40 probe'),
                                ('rachel.boulden@example.test', 'Action reassigned: Replace FH40 probe')])
        raw = next(m for m in s.sent if m['to'].startswith('rachel'))['body']
        self.assertIn('It is no longer yours to do.', raw)
        self.assertIn('Kai has the replacement probe.', raw)

    def test_reassign_refusals(self):
        cases = [(RACHEL, {'ownerId': KELLY, 'reason': 'Kelly has the parts.'}, 'Only the people who manage this action can reassign it.'),
                 (KELLY, {'ownerId': RACHEL, 'reason': 'Rachel has the parts.'}, 'Choose someone other than the current owner.'),
                 (KELLY, {'ownerId': KAI, 'reason': 'Kai has the parts here.'}, 'Choose a member of this area or a Team Leader.'),
                 (KELLY, {'ownerId': JOE, 'reason': 'short'}, 'Give a reason of at least 10 characters.'),
                 (KELLY, {'reason': 'Nobody in particular.'}, 'Choose who will do it.')]
        for sender, payload, message in cases:
            with self.subTest(message):
                s, r, a, req = self.change(sender, 'ReassignAction', payload)
                self.assertEqual((req['Status'], req['ResultMessage'], a['AssignedToId']), ('Rejected', message, RACHEL))
        s, r, a, req = self.change(KELLY, 'ReassignAction', {'ownerId': JOE, 'reason': 'Joe will take this on.'})
        self.assertEqual((req['Status'], a['AssignedToId']), ('Completed', JOE))   # a Team Leader may own any area's action

    def test_close_with_an_outcome_and_reopen(self):
        s, r, a, req = self.change(KELLY, 'CloseAction', {'outcome': 'Superseded', 'note': 'Replaced by the new probe action.'})
        self.assertEqual((req['ResultMessage'], a['Status'], a['IsOpen'], a['CloseOutcome'], a['ClosureNote'], a['ClosedById']),
                         ('Action closed.', 'Closed', False, 'Superseded', 'Replaced by the new probe action.', KELLY))
        self.assertTrue(a['DateClosed'])
        self.assertEqual([(m['to'], m['subject']) for m in s.sent], [('rachel.boulden@example.test', 'Action closed: Replace FH40 probe')])
        r2 = submit(s, KELLY, 'ReopenAction', {'reason': 'The new probe failed as well.'}, target=s.action, revision=3, key=KEY2)
        run(s, r2)
        a = s.item('actions', s.action)['f']
        self.assertEqual((request(s, r2)['ResultMessage'], a['Status'], a['IsOpen'], a['CloseOutcome'], a['DateClosed'], float(a['Revision'])),
                         ('Action reopened.', 'In Progress', True, None, None, 4.0))
        self.assertEqual(s.rows('history', RequestKey=KEY2 + '|1')[0]['f']['EventType'], 'Reopened')

    def test_close_refusals_and_the_close_out_check(self):
        s, r, a, req = self.change(KELLY, 'CloseAction', {'outcome': 'Other', 'note': 'n/a'})
        self.assertEqual(req['ResultMessage'], 'Explain the outcome in at least 10 characters.')
        s, r, a, req = self.change(RACHEL, 'CloseAction', {'outcome': 'Completed'})
        self.assertEqual(req['ResultMessage'], 'Only the people who manage this action can close it.')
        s = site()
        s.item('actions', s.action)['f']['Status'] = 'Completed'      # done, waiting for the raiser's close-out check
        s, r, a, req = self.change(KELLY, 'CloseAction', {'outcome': 'Completed'}, s=s)
        self.assertEqual((req['Status'], a['Status'], a['CloseOutcome']), ('Completed', 'Closed', 'Completed'))
        s, r, a, req = self.change(KELLY, 'ReopenAction', {'reason': 'It was never closed.'})
        self.assertEqual(req['ResultMessage'], 'This action is already open.')

    def test_edit_details_changes_only_what_was_given(self):
        s, r, a, req = self.change(KELLY, 'EditActionDetails', {'title': 'Replace FH40 probe (bay 3)', 'priority': 'High'})
        self.assertEqual((req['ResultMessage'], a['Title'], a['Priority'], a['Description']),
                         ('Details saved.', 'Replace FH40 probe (bay 3)', 'High', 'Probe failed its check.'))
        e = self.event(s)
        self.assertEqual(e['EventType'], 'Details Edited')
        self.assertIn('Replace FH40 probe', e['PreviousValue'])
        for payload, message in (({}, 'Nothing has changed.'), ({'title': ' '}, 'Enter what needs doing.'), ({'priority': 'Urgent'}, 'Choose a priority.')):
            with self.subTest(message):
                s, r, a, req = self.change(KELLY, 'EditActionDetails', payload)
                self.assertEqual(req['ResultMessage'], message)
        s, r, a, req = self.change(RACHEL, 'EditActionDetails', {'title': 'Mine now'})
        self.assertEqual(req['ResultMessage'], 'Only the people who manage this action can change its details.')

    def test_a_stale_revision_is_refused_for_every_kind(self):
        for rtype, payload in (('ChangeStatus', {'status': 'Open'}), ('CloseAction', {'outcome': 'Completed'}),
                               ('EditActionDetails', {'title': 'x'})):
            with self.subTest(rtype):
                s, r, a, req = self.change(KELLY, rtype, payload, revision=1)
                self.assertEqual(req['ResultMessage'], 'This action was updated by someone else. Review the latest details and try again.')


class Calls(unittest.TestCase):
    """Fewer SharePoint calls per request (plan K7.10): a first run skips every "already done?" look-up."""
    # SharePoint calls for the change itself; each email adds at most 3 (queue it, record the outcome, cover a reminder)
    # 1.9.0.0: raising reads the area's members and the active people, to check co-owners and the close-out check (+2)
    # 1.9.0.4: after Completed, one read of the QueueHealth row so a Down part clears itself (+1, not seen by the user)
    BUDGET = {'RaiseAction': 23, 'ExtendDeadline': 18, 'MarkComplete': 18}

    def first_run(self, rtype, s=None):
        s = s or site()
        payload = {'RaiseAction': RaiseAction.good, 'ExtendDeadline': Extend().payload(), 'MarkComplete': {'note': 'Done.'}}[rtype]
        r = submit(s, RACHEL, rtype, payload, target=None if rtype == 'RaiseAction' else s.action, revision=None if rtype == 'RaiseAction' else 2)
        status, eng = run(s, r)
        return s, r, status, eng

    def test_each_request_type_stays_within_its_call_budget(self):
        for rtype, budget in self.BUDGET.items():
            with self.subTest(rtype):
                s, r, status, eng = self.first_run(rtype)
                self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
                work = [c for c in s.calls if 'NotificationLog' not in c[1]]
                self.assertLessEqual(len(work), budget, '\n'.join(m + ' ' + u for m, u in work))
                self.assertLessEqual(len(s.calls) - len(work), 3 * len(s.sent), s.calls)

    def test_lists_are_reached_by_address_with_no_look_up(self):
        s, r, status, eng = self.first_run('RaiseAction')
        self.assertFalse([u for m, u in s.calls if u.startswith('_api/web/lists')], s.calls)

    def test_without_returned_ids_the_items_are_read_back(self):
        for rtype in ('RaiseAction', 'ExtendDeadline'):
            with self.subTest(rtype):
                s = site()
                s.return_new_id = False
                s, r, status, eng = self.first_run(rtype, s)
                self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
                ev = s.rows('history', RequestKey=KEY + '|1')[0]
                self.assertEqual(ev['f']['ActorId'], RACHEL)
                if rtype == 'RaiseAction':
                    a = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]
                    self.assertEqual(ev['dir'], 'FLK/A{0}'.format(a['id']))
                    self.assertEqual(int(request(s, r)['ResultId']), a['id'])

    def test_a_folder_that_already_exists_stops_a_first_run_and_the_resubmit_finishes(self):
        s = site()
        nxt = s.by_key['actions']['next']
        s.folder('updates', 'FLK/A{0}'.format(nxt), author=RACHEL)
        r = submit(s, RACHEL, 'RaiseAction', RaiseAction.good)
        first, _ = run(s, r)
        self.assertEqual((first, request(s, r)['Status']), ('Failed', 'Failed'))
        request(s, r)['Status'] = 'Submitted'
        run(s, r, now=s.clock + timedelta(minutes=10))
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertEqual(len(s.rows('actions', CreatedRequestKey='F|' + KEY)), 1)

    def test_an_action_without_its_history_folder_is_repaired_on_the_resubmit(self):
        s = site()
        fold = s._find_folder(s.by_key['history'], 'FLK', 'A{0}'.format(s.action))
        del s.by_key['history']['items'][fold['id']]
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        first, _ = run(s, r)
        self.assertEqual(first, 'Failed')
        request(s, r)['Status'] = 'Submitted'
        run(s, r, now=s.clock + timedelta(minutes=10))
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertEqual(s.rows('history', RequestKey=KEY + '|1')[0]['dir'], 'FLK/A{0}'.format(s.action))
        self.assertEqual(s.item('actions', s.action)['f']['PendingRequestKey'], '')

    def test_a_transaction_row_from_the_previous_version_still_resumes(self):
        s = site()
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        req = request(s, r)
        s.add('history', 'Transactions', {'Title': 'Request', 'RowKind': 'Transaction', 'RequestKey': KEY, 'RequestItemId': float(r),
                                          'RequestType': 'ExtendDeadline', 'RecordType': 'Action', 'RecordId': float(s.action),
                                          'ExpectedRevision': 2.0, 'Payload': req['Payload'], 'State': 'Received', 'Attempts': 1.0})
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        tx = s.rows('history', RowKind='Transaction')[0]['f']
        self.assertEqual((tx['State'], tx['FirstClaimedAt']), ('Applied', '2026-10-21T09:30:00Z'))

    def test_the_claim_time_is_kept_to_the_minute(self):
        s = site()
        s.clock = s.clock + timedelta(seconds=42)
        s, r, status, eng = self.first_run('ExtendDeadline', s)
        tx = s.rows('history', RowKind='Transaction')[0]['f']
        self.assertEqual(tx['FirstClaimedAt'], '2026-10-21T09:30:00Z')


# --------------------------------------------------------------------------------------------- safety net (spec REL-1 to REL-4)
WEEKDAY = datetime(2026, 10, 21, 10, 0, tzinfo=UK).astimezone(timezone.utc)      # Wednesday, working hours
NIGHT = datetime(2026, 10, 24, 3, 5, tzinfo=UK).astimezone(timezone.utc)         # Saturday, first run of the hour


def run_monitor(s, when):
    s.clock = when
    if s.daily_alive:
        s.rows('settings', Title='LastDailyRun')[0]['f']['Value'] = (when - timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%SZ')
    eng = Engine(MONITOR, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock)
    return eng.run(), eng


def run_admin(s, req_id, now=None):
    s.clock = now or s.clock
    eng = Engine(ADMIN, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', req_id))
    return eng.run(), eng


def age(s, key, item_id, minutes):
    """Makes an item look last changed `minutes` before the clock."""
    s.item(key, item_id)['modified'] = (s.clock - timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%SZ')


def health(s):
    return json.loads(s.rows('settings', Title='QueueHealth')[0]['f']['Value'])


def tx_of(s, req_id):
    return next(it for it in s.by_key['history']['items'].values() if it['f'].get('RowKind') == 'Transaction' and it['f'].get('RequestItemId') == float(req_id))


class HealthBack(unittest.TestCase):
    """1.9.0.4: a request that completes clears its own part of QueueHealth, so the app's banner goes without waiting for the monitor."""
    def set_health(self, s, value):
        s.rows('settings', Title='QueueHealth')[0]['f']['Value'] = json.dumps(value)

    def test_a_completed_request_clears_its_part_and_leaves_the_others(self):
        s = site()
        s.monitor_alive = False
        self.set_health(s, {'state': 'Down', 'reason': 'Oldest request waiting 25 minutes', 'records': 'Down', 'recordsReason': 'x', 'checkedAt': '2026-10-21T09:00:00Z'})
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        h = health(s)
        self.assertEqual((h['state'], h['reason']), ('Healthy', ''))
        self.assertEqual((h['records'], h['recordsReason']), ('Down', 'x'), 'only the actions part is cleared')
        self.assertEqual(h['checkedAt'], '2026-10-21T09:00:00Z')

    def test_a_healthy_row_is_not_written(self):
        s = site()
        s.monitor_alive = False
        self.set_health(s, {'state': 'Healthy', 'reason': ''})
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        self.assertFalse([p for m, p in s.writes if m == 'MERGE' and 'Settings' in p], s.writes)


class Monitor(unittest.TestCase):
    def test_outside_working_hours_only_the_first_run_of_the_hour_works(self):
        s = site()
        status, _ = run_monitor(s, NIGHT + timedelta(minutes=20))
        self.assertEqual(status, 'Succeeded')
        self.assertEqual(len(s.calls), 1, 'a quiet night run reads the settings and stops')
        s.calls.clear()
        run_monitor(s, NIGHT)
        self.assertGreater(len(s.calls), 1)
        self.assertEqual(health(s)['state'], 'Healthy')

    def test_a_quiet_working_hours_run_uses_few_calls(self):
        s = site()
        status, eng = run_monitor(s, WEEKDAY)
        self.assertEqual(status, 'Succeeded', eng.log)
        # settings, people, 3 request states, invitations to retry, needs attention, 3 email states, the health row
        self.assertLessEqual(len(s.calls), 11, s.calls)
        self.assertEqual(s.sent, [])
        self.assertEqual((health(s)['state'], health(s)['attention']), ('Healthy', 0))

    def test_a_missed_trigger_is_put_back_and_then_recorded(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        age(s, 'requests', r, 12)
        run_monitor(s, WEEKDAY)
        self.assertEqual((request(s, r)['Status'], request(s, r)['Attempts']), ('Submitted', 1.0))
        status, eng = run(s, r, now=WEEKDAY + timedelta(minutes=2))
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)

    def test_a_recent_request_is_left_alone(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        age(s, 'requests', r, 5)
        run_monitor(s, WEEKDAY)
        self.assertNotIn('Attempts', {k: v for k, v in request(s, r).items() if v})
        self.assertFalse(any(m == 'MERGE' and 'Requests' in p for m, p in s.writes))

    def test_a_run_stopped_at_any_write_is_finished_by_the_monitor(self):
        """No manual resubmit: the monitor puts the request back, the request flow resumes it, and the result is the
        same as a run that was never interrupted – one event, one email row."""
        ref = site()
        ref.clock = WEEKDAY
        r = submit(ref, KELLY, 'ExtendDeadline', Extend().payload(), target=ref.action, revision=2)
        run(ref, r)
        expected = Robustness().snapshot(ref)
        for k in range(1, len(ref.writes) + 1):
            for how in ('failed', 'stopped'):
                with self.subTest(write=k, how=how):
                    s = site()
                    s.clock = WEEKDAY
                    r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
                    s.fail_at = k
                    run(s, r)
                    s.fail_at = None
                    if request(s, r)['Status'] == 'Completed':
                        continue
                    if how == 'stopped':          # Power Automate stopped the run: no Catch, the request stays Processing
                        request(s, r)['Status'] = 'Processing'
                    age(s, 'requests', r, 16)
                    run_monitor(s, WEEKDAY)
                    self.assertEqual(request(s, r)['Status'], 'Submitted')
                    run(s, r, now=WEEKDAY + timedelta(minutes=2))
                    self.assertEqual(request(s, r)['Status'], 'Completed')
                    # an email the stopped run had queued but not sent goes with the next check after 30 minutes
                    run_monitor(s, WEEKDAY + timedelta(minutes=45))
                    self.assertEqual(len(s.sent), len(ref.sent))
                    got = Robustness().snapshot(s)
                    for key in ('actions', 'updates'):
                        self.assertEqual(got[key], expected[key], key)
                    self.assertEqual(sorted(x[2] for x in got['history'] if 'Event' in x[2]), sorted(x[2] for x in expected['history'] if 'Event' in x[2]))
                    self.assertEqual(sorted(s.by_key['notifications']['items'][i]['f']['NotificationKey'] for i in s.by_key['notifications']['items']),
                                     sorted(ref.by_key['notifications']['items'][i]['f']['NotificationKey'] for i in ref.by_key['notifications']['items']))

    def fail_three_times(self, s, r, fault):
        s.fail_if = fault
        run(s, r, now=WEEKDAY)
        for n in range(3):
            age(s, 'requests', r, 11)
            run_monitor(s, s.clock)
            if request(s, r)['Status'] == 'Submitted':
                run(s, r, now=s.clock + timedelta(minutes=1))
        return request(s, r)

    def test_three_failed_attempts_with_nothing_changed_go_to_the_administrators(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        before = dict(s.item('actions', s.action)['f'])
        req = self.fail_three_times(s, r, lambda m, path, where: m == 'MERGE' and path.startswith('Actions/'))
        self.assertEqual((req['Status'], req['ResultMessage']), ('Needs attention', 'Not recorded – an administrator has been told. Nothing was changed.'))
        self.assertEqual(tx_of(s, r)['f']['State'], 'Needs attention')
        self.assertEqual(s.item('actions', s.action)['f'], before)
        alerts = [m for m in s.sent if m['subject'].startswith('Competency Hub needs attention')]
        self.assertEqual([(m['to'], m['subject']) for m in alerts],
                         [('joseph.pepper@example.test', 'Competency Hub needs attention: A change could not be recorded: ExtendDeadline')])
        self.assertIn('Nothing was changed', alerts[0]['body'])
        run_monitor(s, s.clock + timedelta(minutes=15))
        self.assertEqual(len([m for m in s.sent if m['subject'].startswith('Competency Hub needs attention')]), 1, 'one alert a day')
        self.assertEqual(health(s)['attention'], 1)
        self.assertEqual(health(s)['state'], 'Healthy', 'one change needing attention does not stop processing')

    def test_a_part_made_change_says_so_and_keeps_its_lock(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        req = self.fail_three_times(s, r, lambda m, path, where: m == 'ADD' and path == 'History' and '/FLK/A' in where)
        self.assertEqual((req['Status'], req['ResultMessage']),
                         ('Needs attention', 'Not fully recorded – an administrator has been told. The record is locked until it is resolved.'))
        a = s.item('actions', s.action)['f']
        self.assertEqual((a['PendingRequestKey'], float(a['DueDay'])), (KEY, 20261028.0), 'the values are written and the lock is kept')
        self.assertIn('Part of it was made', [m for m in s.sent if 'needs attention' in m['subject']][0]['body'])

    def test_processing_is_down_when_changes_are_not_picked_up(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        age(s, 'requests', r, 11)
        run_monitor(s, WEEKDAY)
        self.assertEqual(health(s)['state'], 'Healthy', 'one put-back is normal')
        age(s, 'requests', r, 15)
        run_monitor(s, WEEKDAY + timedelta(minutes=15))
        self.assertEqual((health(s)['state'], health(s)['reason']), ('Down', 'Changes to actions are not being picked up by ESG Competency Hub | 2 Request queue.'))
        run(s, r, now=WEEKDAY + timedelta(minutes=20))
        run_monitor(s, WEEKDAY + timedelta(minutes=30))
        self.assertEqual(health(s)['state'], 'Healthy', 'back to normal by itself')

    def test_daily_tasks_and_the_monitor_watch_each_other(self):
        s = site()
        s.daily_alive = False
        s.rows('settings', Title='LastDailyRun')[0]['f']['Value'] = '2026-10-20T05:00:00Z'
        run_monitor(s, WEEKDAY)
        self.assertEqual([m['subject'] for m in s.sent], ['Competency Hub needs attention: Daily reminders have not run'])
        run_monitor(s, WEEKDAY + timedelta(minutes=15))
        self.assertEqual(len(s.sent), 1, 'once a day')
        t = site()
        t.monitor_alive = False
        run_daily(t, date(2026, 10, 22))
        self.assertEqual([m['subject'] for m in t.sent if 'needs attention' in m['subject']], ['Competency Hub needs attention: The queue monitor is not running'])

    def test_an_email_that_failed_is_retried_within_15_minutes(self):
        s = site()
        s.clock = WEEKDAY
        s.mail_fail = [400]
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        self.assertEqual(s.sent, [])
        run_monitor(s, WEEKDAY + timedelta(minutes=15))
        self.assertEqual([m['subject'] for m in s.sent], ['Deadline moved: Replace FH40 probe'])


class Administration(unittest.TestCase):
    def stuck(self, fault, rtype='ExtendDeadline', payload=None):
        s = site()
        s.clock = WEEKDAY
        target = None if rtype == 'RaiseAction' else s.action
        r = submit(s, KELLY, rtype, payload or Extend().payload(), target=target, revision=None if rtype == 'RaiseAction' else 2)
        Monitor.fail_three_times(self, s, r, fault)
        self.assertEqual(request(s, r)['Status'], 'Needs attention')
        s.fail_if = None
        return s, r

    def ask(self, s, rtype, r, sender=JOE, key=KEY2):
        tx = tx_of(s, r)['id']
        a = submit(s, sender, rtype, {'txId': tx, 'note': 'Checked the run history.'}, target=tx, key=key)
        status, eng = run_admin(s, a, now=s.clock + timedelta(minutes=1))
        self.assertEqual(status, 'Succeeded', eng.log)
        return request(s, a)

    nothing = staticmethod(lambda m, path, where: m == 'MERGE' and path.startswith('Actions/'))
    partly = staticmethod(lambda m, path, where: m == 'ADD' and path == 'History' and '/FLK/A' in where)

    def test_retry_puts_the_change_back_and_it_is_recorded(self):
        s, r = self.stuck(self.nothing)
        res = self.ask(s, 'RetryTransaction', r)
        self.assertEqual((res['Status'], res['ResultMessage']), ('Completed', 'Being tried again.'))
        self.assertEqual((request(s, r)['Status'], tx_of(s, r)['f']['State'], tx_of(s, r)['f']['Attempts']), ('Submitted', 'Failed', 0.0))
        run(s, r, now=s.clock + timedelta(minutes=2))
        self.assertEqual(request(s, r)['Status'], 'Completed')
        ev = s.rows('history', RequestKey=KEY2 + '|1')[0]
        self.assertEqual((ev['dir'], ev['f']['EventType'], ev['f']['ActorId'], ev['f']['Note']), ('Administration', 'Change Retried', JOE, 'Checked the run history.'))

    def test_finish_rolls_a_part_made_change_forward(self):
        s, r = self.stuck(self.partly)
        self.assertEqual(self.ask(s, 'RetryTransaction', r)['Status'], 'Completed')
        run(s, r, now=s.clock + timedelta(minutes=2))
        a = s.item('actions', s.action)['f']
        self.assertEqual((request(s, r)['Status'], a['PendingRequestKey'], a['LastRequestKey']), ('Completed', '', KEY))
        self.assertEqual(len(s.rows('history', RequestKey=KEY + '|1')), 1)

    def test_cancel_when_nothing_was_changed(self):
        s, r = self.stuck(self.nothing)
        before = dict(s.item('actions', s.action)['f'])
        res = self.ask(s, 'CancelTransaction', r)
        self.assertEqual((res['Status'], res['ResultMessage']), ('Completed', 'Cancelled. Nothing was changed.'))
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Cancelled', 'Cancelled by an administrator. Nothing was changed.'))
        self.assertEqual(tx_of(s, r)['f']['State'], 'Cancelled')
        self.assertEqual(s.item('actions', s.action)['f'], before)
        # a stray run of the request afterwards only mirrors the decision
        request(s, r)['Status'] = 'Submitted'
        run(s, r, now=s.clock + timedelta(minutes=5))
        self.assertEqual(request(s, r)['Status'], 'Cancelled')
        self.assertEqual(s.item('actions', s.action)['f'], before)

    def test_cancel_is_refused_once_part_of_the_change_is_made(self):
        s, r = self.stuck(self.partly)
        res = self.ask(s, 'CancelTransaction', r)
        self.assertEqual((res['Status'], res['ResultMessage']),
                         ('Rejected', 'Part of this change has already been made, so it cannot be cancelled. Use Finish (or Revert, for a change to an action).'))
        self.assertEqual(request(s, r)['Status'], 'Needs attention')

    def test_revert_writes_the_previous_values_back_and_says_so(self):
        s, r = self.stuck(self.partly)
        res = self.ask(s, 'RevertTransaction', r)
        self.assertEqual((res['Status'], res['ResultMessage']), ('Completed', 'Reverted.'))
        a = s.item('actions', s.action)['f']
        self.assertEqual((float(a['DueDay']), a['CurrentDueDate'], float(a['ExtensionCount']), a['PendingRequestKey'], a['LastRequestKey'], float(a['Revision'])),
                         (20261019.0, '2026-10-18T23:00:00Z', 1.0, '', KEY2, 4.0))
        self.assertEqual((request(s, r)['Status'], tx_of(s, r)['f']['State']), ('Reverted', 'Reverted'))
        self.assertIn('Reverted by an administrator', request(s, r)['ResultMessage'])
        ev = s.rows('history', RequestKey=KEY2 + '|2')[0]
        self.assertEqual((ev['dir'], ev['f']['EventType']), ('FLK/A{0}'.format(s.action), 'Change Reverted'))
        self.assertEqual(s.rows('history', RequestKey=KEY2 + '|1')[0]['f']['EventType'], 'Change Reverted')

    def test_revert_withdraws_a_part_made_raise(self):
        good = dict(RaiseAction.good, ownerId=RACHEL)
        s, r = self.stuck(lambda m, path, where: m == 'ADD' and path == 'History' and '/A' in where, 'RaiseAction', good)
        created = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]
        self.assertEqual(created['f']['PendingRequestKey'], KEY, 'uncommitted, so no one sees it yet')
        self.ask(s, 'RevertTransaction', r)
        f = created['f']
        self.assertEqual((f['Status'], f['IsOpen'], f['CloseOutcome'], f['PendingRequestKey']), ('Closed', False, 'Withdrawn', ''))
        ev = s.rows('history', RequestKey=KEY2 + '|2')[0]
        self.assertEqual((ev['f']['EventType'], ev['f']['CompletionKind']), ('Withdrawn', 'Withdrawn'))
        self.assertEqual(request(s, r)['Status'], 'Reverted')

    def test_revert_is_refused_when_nothing_is_part_made(self):
        s, r = self.stuck(self.nothing)
        res = self.ask(s, 'RevertTransaction', r)
        self.assertEqual(res['Status'], 'Rejected')
        self.assertIn('nothing to revert', res['ResultMessage'])

    def test_only_an_administrator_may_decide(self):
        s, r = self.stuck(self.nothing)
        res = self.ask(s, 'CancelTransaction', r, sender=KELLY)
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Only a Competency Hub administrator can do this.'))
        self.assertEqual(request(s, r)['Status'], 'Needs attention')

    def test_a_finished_change_cannot_be_touched(self):
        s = site()
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        res = self.ask(s, 'CancelTransaction', r)
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'This change is already finished.'))

    def test_an_administrators_decision_survives_an_interruption_at_every_write(self):
        for rtype, fault in (('CancelTransaction', self.nothing), ('RevertTransaction', self.partly), ('RetryTransaction', self.nothing)):
            ref, r = self.stuck(fault)
            ref.writes.clear()
            self.ask(ref, rtype, r)
            expected = Robustness().snapshot(ref)
            total = len(ref.writes)
            for k in range(1, total + 1):
                with self.subTest(rtype=rtype, write=k, of=total):
                    s, r2 = self.stuck(fault)
                    tx = tx_of(s, r2)['id']
                    a = submit(s, JOE, rtype, {'txId': tx, 'note': 'Checked the run history.'}, target=tx, key=KEY2)
                    s.writes.clear()
                    s.fail_at = k
                    run_admin(s, a, now=s.clock + timedelta(minutes=1))
                    s.fail_at = None
                    if request(s, a)['Status'] != 'Completed':
                        request(s, a)['Status'] = 'Submitted'
                        status, eng = run_admin(s, a, now=s.clock + timedelta(minutes=10))
                        self.assertEqual(request(s, a)['Status'], 'Completed', eng.log)
                    got = Robustness().snapshot(s)
                    for key in ('actions', 'history', 'updates', 'requests'):
                        norm = lambda rows: sorted(x for x in rows if 'ProcessedAt' not in x[2] and 'Modified' not in x[2])
                        self.assertEqual(len(got[key]), len(expected[key]), key)
                    self.assertEqual(request(s, r2)['Status'], request(ref, r)['Status'])
                    self.assertEqual(s.item('actions', s.action)['f'].get('LastRequestKey'), ref.item('actions', ref.action)['f'].get('LastRequestKey'))


class Routing(unittest.TestCase):
    def test_each_kind_of_request_goes_to_exactly_one_flow(self):
        from wdl import Context, eval_expr
        flows_by_name = {f['name']: f['json']['properties']['definition'] for f in flows.build_all()}
        takers = {n: d for n, d in flows_by_name.items() if 'When_a_request_is_submitted' in d['triggers']}
        s = site()
        for rtype in flows.ACTION_TYPES + flows.DOMAIN_TYPES['admin'] + ['SetKnownAs', 'SomethingNew']:
            r = submit(s, RACHEL, rtype, {}, key='k-' + rtype)
            body = s.trigger_item('requests', r)
            hits = []
            for name, d in takers.items():
                eng = Engine(d, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=body)
                if all(eval_expr(c['expression'][1:], Context(eng)) for c in d['triggers']['When_a_request_is_submitted']['conditions']):
                    hits.append(name)
            want = 'ESG Competency Hub | 6 Administration' if rtype in flows.DOMAIN_TYPES['admin'] else 'ESG Competency Hub | 2 Request queue'
            self.assertEqual(hits, [want], rtype)


class HistoryForReports(unittest.TestCase):
    """Spec H-1: every action event says who owned the action and which deadline was in force, and a completion
    or closure says what kind it was, so later statistics need nothing reconstructed."""
    def event(self, s, key=KEY):
        return s.rows('history', RequestKey=key + '|1')[0]['f']

    def test_raise_records_the_owner_and_deadline(self):
        s = site()
        run(s, submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL)))
        e = self.event(s)
        self.assertEqual((e['OwnerId'], e['DueDayAtEvent']), (float(RACHEL), 20261028.0))

    def test_reassign_records_both_owners(self):
        s = site()
        run(s, submit(s, KELLY, 'ReassignAction', {'ownerId': KELLY, 'reason': 'Rachel is on leave this month.'}, target=s.action, revision=2))
        e = self.event(s)
        self.assertEqual((e['PreviousOwnerId'], e['OwnerId'], e['DueDayAtEvent']), (float(RACHEL), float(KELLY), 20261019.0))

    def test_an_extension_records_the_new_deadline(self):
        s = site()
        run(s, submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2))
        self.assertEqual((self.event(s)['OwnerId'], self.event(s)['DueDayAtEvent']), (float(RACHEL), 20261028.0))

    def test_completion_kinds(self):
        cases = [(RACHEL, 'MarkComplete', {'note': ''}, False, 'In Progress', 'MarkedDone'),
                 (KELLY, 'CloseAction', {'outcome': 'Completed', 'note': ''}, False, 'In Progress', 'ClosedByManager'),
                 (KELLY, 'CloseAction', {'outcome': 'Completed', 'note': ''}, True, 'Completed', 'CloseOutConfirmed'),
                 (KELLY, 'CloseAction', {'outcome': 'Superseded', 'note': 'Replaced by ACT-00050.'}, False, 'In Progress', 'ClosedNotCompleted')]
        for sender, rtype, payload, close_out, status, kind in cases:
            with self.subTest(kind=kind):
                s = site()
                s.item('actions', s.action)['f'].update({'RequiresCloseOut': close_out, 'Status': status})
                run(s, submit(s, sender, rtype, payload, target=s.action, revision=2))
                e = self.event(s)
                self.assertEqual((e['CompletionKind'], e['OwnerId'], e['DueDayAtEvent']), (kind, float(RACHEL), 20261019.0))


class Permissions(unittest.TestCase):
    """Spec §4: meeting rights and the technician restriction, enforced by the flow whatever the page sends."""
    def chair(self, s, uid, key, on=True):
        row = next(r for r in s.rows('members', PersonId=uid) if r['f']['MembershipKey'] == '{0}|{1}'.format(key, uid))
        row['f']['CanManageMeetings'] = on

    def test_a_technician_without_meeting_rights_raises_only_for_themselves(self):
        s = site()
        r = submit(s, RACHEL, 'RaiseAction', dict(RaiseAction.good, ownerId=KELLY))
        run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', flows.SELF_ONLY))
        r = submit(s, RACHEL, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL), key=KEY2)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')

    def test_meeting_rights_in_the_area_let_a_technician_raise_for_others(self):
        s = site()
        self.chair(s, RACHEL, 'FLK')
        r = submit(s, RACHEL, 'RaiseAction', dict(RaiseAction.good, ownerId=KELLY))
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')

    def test_meeting_rights_in_another_area_do_not_count(self):
        s = site()
        self.chair(s, RACHEL, 'GRS')
        r = submit(s, RACHEL, 'RaiseAction', dict(RaiseAction.good, ownerId=KELLY))
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], flows.SELF_ONLY)

    def change(self, s, sender, rtype, payload, key=KEY):
        r = submit(s, sender, rtype, payload, target=s.action, revision=2, key=key)
        run(s, r)
        return request(s, r)

    def test_meeting_rights_edit_reassign_and_close_but_never_reopen(self):
        # Rachel owns the Flask action that Kelly raised; Doti (a technician) gets meeting rights in Flask
        for rtype, payload in (('EditActionDetails', {'title': 'Replace FH40 probe and test it'}),
                               ('ReassignAction', {'ownerId': KELLY, 'reason': 'Kelly has the new probe ready.'}),
                               ('CloseAction', {'outcome': 'No longer required', 'note': 'The probe type is withdrawn.'})):
            with self.subTest(rtype=rtype):
                s = site()
                s.add('members', 'FLK', {'Title': 'FLK', 'CompetencyId': 1, 'PersonId': KAI, 'MembershipKey': 'FLK|{0}'.format(KAI),
                                         'CanManageMeetings': False, 'Status': 'Active'})
                s.rows('people', SiteUserId=float(KAI))[0]['f']['Role'] = 'Technician'
                self.assertEqual(self.change(s, KAI, rtype, payload)['Status'], 'Rejected', 'no rights without the switch')
                self.chair(s, KAI, 'FLK')
                self.assertEqual(self.change(s, KAI, rtype, payload, key=KEY2)['Status'], 'Completed', 'the switch gives the right')
        s = site()
        s.item('actions', s.action)['f'].update({'Status': 'Closed', 'IsOpen': False})
        s.add('members', 'FLK', {'Title': 'FLK', 'CompetencyId': 1, 'PersonId': KAI, 'MembershipKey': 'FLK|{0}'.format(KAI),
                                 'CanManageMeetings': True, 'Status': 'Active'})
        s.rows('people', SiteUserId=float(KAI))[0]['f']['Role'] = 'Technician'
        res = self.change(s, KAI, 'ReopenAction', {'reason': 'The probe failed again this week.'})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Only the people who manage this action can reopen it.'))

    def test_a_technician_raiser_cannot_pass_their_action_on(self):
        s = site()
        s.item('actions', s.action)['f']['RaisedById'] = RACHEL
        res = self.change(s, RACHEL, 'ReassignAction', {'ownerId': KELLY, 'reason': 'I am away for two weeks.'})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Only the people who manage this action can reassign it.'))

    def test_editing_details_never_changes_the_owner(self):
        s = site()
        res = self.change(s, KELLY, 'EditActionDetails', {'title': 'New title', 'ownerId': KELLY})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'The owner is changed with Reassign.'))
        self.assertEqual(s.item('actions', s.action)['f']['AssignedToId'], RACHEL)

    def test_an_engineer_keeps_their_rights_without_the_meeting_switch(self):
        s = site()
        self.chair(s, KELLY, 'FLK', on=False)
        s.item('actions', s.action)['f']['RaisedById'] = KAI
        self.assertEqual(self.change(s, KELLY, 'CloseAction', {'outcome': 'Completed', 'note': ''})['Status'], 'Completed')


# --------------------------------------------------------------------------------------------- people (spec §3.2, §4)
SADIE = None


def run_people(s, sender, rtype, payload, key=KEY2, now=None):
    r = submit(s, sender, rtype, payload, key=key)
    status, eng = run_admin(s, r, now=now)
    return request(s, r), eng


def member_row(s, uid, key):
    rows = [r for r in s.rows('members', PersonId=uid) if r['f']['MembershipKey'] == '{0}|{1}'.format(key, uid)]
    return rows[0]['f'] if rows else None


class People(unittest.TestCase):
    def new_site(self):
        s = site()
        s.tenant['sadie.young@example.test'] = 'Young Sadie'
        return s

    def sadie(self, s):
        return next(u for u in s.users.values() if u['Email'] == 'sadie.young@example.test')['Id']

    def test_an_administrator_adds_a_person_with_areas_and_meeting_rights(self):
        s = self.new_site()
        res, eng = run_people(s, JOE, 'AddPerson', {'email': 'Sadie.Young@example.test ', 'role': 'Technician',
                                                     'areas': [{'key': 'GRS', 'chair': False}, {'key': 'DOS', 'chair': True, 'expires': '2026-12-31'}]})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Completed', 'Added Young Sadie.'), eng.log)
        uid = self.sadie(s)
        p = s.rows('people', SiteUserId=float(uid))[0]['f']
        self.assertEqual((p['Role'], p['Status'], p['IsAdministrator'], p['CanPostNotices'], p['Email']), ('Technician', 'Active', False, True, 'sadie.young@example.test'))
        self.assertTrue(p['AccessVerifiedOn'])
        for g in ('All Users', 'Notice Posters', 'GRS', 'DOS'):
            self.assertIn(uid, s.groups[s.gid[g]]['users'], g)
        for g in ('Management', 'Administrators', 'FLK'):
            self.assertNotIn(uid, s.groups[s.gid[g]]['users'], g)
        self.assertEqual((member_row(s, uid, 'GRS')['CanManageMeetings'], member_row(s, uid, 'DOS')['CanManageMeetings']), (False, True))
        self.assertEqual(member_row(s, uid, 'DOS')['AccessExpires'], '2026-12-31T00:00:00Z')
        # her own request folder, which only she (and the owners) can use
        fold = s.folder_item('requests', 'u{0}'.format(uid))
        self.assertTrue(fold['unique'])
        self.assertEqual(fold['ra'][uid], {2003})
        ev = s.rows('history', RequestKey=KEY2 + '|1')[0]
        self.assertEqual((ev['dir'], ev['f']['EventType'], ev['f']['ActorId'], ev['f']['Title']), ('Administration', 'Person Added', JOE, 'Added Young Sadie'))
        self.assertIn('"DOS"', ev['f']['NewValue'])

    def test_someone_not_in_microsoft_365_or_already_here_is_refused(self):
        s = self.new_site()
        res, _ = run_people(s, JOE, 'AddPerson', {'email': 'nobody@example.test', 'role': 'Technician', 'areas': []})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'That email address was not found in Microsoft 365. Check the spelling.'))
        res, _ = run_people(s, JOE, 'AddPerson', {'email': 'kai.todd@example.test', 'role': 'Engineer', 'areas': []}, key='k3')
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Todd Kai is already in the Hub.'))

    def test_only_administrators_and_never_for_themselves(self):
        s = self.new_site()
        res, _ = run_people(s, KELLY, 'UpdatePerson', {'personId': RACHEL, 'canPostNotices': False})
        self.assertEqual(res['ResultMessage'], 'Only a Competency Hub administrator can do this.')
        res, _ = run_people(s, JOE, 'UpdatePerson', {'personId': JOE, 'role': 'Engineer'}, key='k3')
        self.assertEqual(res['ResultMessage'], "You can't change your own access. Ask another administrator.")
        self.assertIn(RACHEL, s.groups[s.gid['Notice Posters']]['users'])

    def test_areas_and_meeting_rights_change_together_narrowing_first(self):
        s = self.new_site()
        # Rachel leaves Green Stream, joins Radwaste, and gets meeting rights in Flask
        res, eng = run_people(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'areas': [{'key': 'FLK', 'chair': True}, {'key': 'RW', 'chair': False}]})
        self.assertEqual(res['Status'], 'Completed', eng.log)
        self.assertNotIn(RACHEL, s.groups[s.gid['GRS']]['users'])
        self.assertIn(RACHEL, s.groups[s.gid['RW']]['users'])
        self.assertEqual((member_row(s, RACHEL, 'GRS')['Status'], member_row(s, RACHEL, 'FLK')['CanManageMeetings'], member_row(s, RACHEL, 'RW')['Status']),
                         ('Removed', True, 'Active'))
        # the group was left before the record said so, and joined only after the record said so
        order = [w for w in s.writes if w[0] in ('REMOVE', 'ADDUSER') or w[1].startswith('Competency Members') or w[0] == 'ADD' and w[1] == 'Competency Members']
        self.assertEqual(order[0][0], 'REMOVE')
        self.assertEqual(order[-1][0], 'ADDUSER')

    def test_an_area_with_their_open_actions_is_not_removed(self):
        s = self.new_site()
        res, _ = run_people(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'areas': [{'key': 'GRS', 'chair': False}]})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Not removed from FLK: open actions there are still theirs. Reassign them first.'))
        self.assertIn(RACHEL, s.groups[s.gid['FLK']]['users'])

    def test_notice_posting_off_and_on_again(self):
        s = self.new_site()
        res, _ = run_people(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'canPostNotices': False})
        self.assertEqual(res['Status'], 'Completed')
        self.assertNotIn(RACHEL, s.groups[s.gid['Notice Posters']]['users'])
        self.assertEqual(s.rows('people', SiteUserId=float(RACHEL))[0]['f']['CanPostNotices'], False)
        # nothing else changed
        self.assertIn(RACHEL, s.groups[s.gid['All Users']]['users'])
        self.assertEqual({k for k in AREAS if RACHEL in s.groups[s.gid[k]]['users']}, {'FLK', 'GRS'})
        res, _ = run_people(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'canPostNotices': True}, key='k3')
        self.assertIn(RACHEL, s.groups[s.gid['Notice Posters']]['users'])

    def test_a_role_change_moves_the_management_group(self):
        s = self.new_site()
        run_people(s, JOE, 'UpdatePerson', {'personId': KELLY, 'role': 'Team Leader'})
        self.assertIn(KELLY, s.groups[s.gid['Management']]['users'])
        run_people(s, JOE, 'UpdatePerson', {'personId': KELLY, 'role': 'Engineer'}, key='k3')
        self.assertNotIn(KELLY, s.groups[s.gid['Management']]['users'])

    def test_administrators_are_made_and_unmade_by_another_administrator(self):
        s = self.new_site()
        run_people(s, JOE, 'UpdatePerson', {'personId': KELLY, 'administrator': True})
        self.assertIn(KELLY, s.groups[s.gid['Administrators']]['users'])
        self.assertEqual(s.rows('people', SiteUserId=float(KELLY))[0]['f']['IsAdministrator'], True)
        res, _ = run_people(s, KELLY, 'UpdatePerson', {'personId': JOE, 'administrator': False}, key='k3')
        self.assertEqual(res['Status'], 'Completed')
        self.assertNotIn(JOE, s.groups[s.gid['Administrators']]['users'])

    def test_a_leaver_loses_all_access_and_comes_back_by_reactivation(self):
        s = self.new_site()
        res, _ = run_people(s, JOE, 'PersonLeft', {'personId': RACHEL})
        self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', 'Boulden Rachel still has 1 open action. Reassign them first.'))
        s.item('actions', s.action)['f']['AssignedToId'] = KELLY
        res, eng = run_people(s, JOE, 'PersonLeft', {'personId': RACHEL}, key='k3')
        self.assertEqual(res['Status'], 'Completed', eng.log)
        self.assertFalse(any(RACHEL in g['users'] for g in s.groups.values()))
        p = s.rows('people', SiteUserId=float(RACHEL))[0]['f']
        self.assertEqual((p['Status'], p['IsAdministrator']), ('Left', False))
        self.assertEqual({member_row(s, RACHEL, k)['Status'] for k in ('FLK', 'GRS')}, {'Removed'})
        fold = s.folder_item('requests', 'u{0}'.format(RACHEL))
        self.assertEqual(fold['ra'][RACHEL], {2001}, 'her old requests stay readable to her, nothing more')
        res, _ = run_people(s, JOE, 'ReactivatePerson', {'personId': RACHEL}, key='k4')
        self.assertEqual(res['Status'], 'Completed')
        self.assertTrue({RACHEL} <= s.groups[s.gid['All Users']]['users'] & s.groups[s.gid['Notice Posters']]['users'])
        self.assertEqual(s.folder_item('requests', 'u{0}'.format(RACHEL))['ra'][RACHEL], {2003})
        self.assertEqual(s.rows('people', SiteUserId=float(RACHEL))[0]['f']['Status'], 'Active')

    def test_an_expiry_date_in_the_past_is_refused(self):
        s = self.new_site()
        res, _ = run_people(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'areas': [{'key': 'FLK'}, {'key': 'GRS'}, {'key': 'DOS', 'expires': '2026-10-01'}]})
        self.assertEqual(res['ResultMessage'], 'An end date for access cannot be in the past.')

    def test_adding_and_changing_survive_an_interruption_at_every_write(self):
        cases = [('AddPerson', {'email': 'sadie.young@example.test', 'role': 'Technician', 'areas': [{'key': 'GRS'}, {'key': 'DOS', 'chair': True}]}),
                 ('UpdatePerson', {'personId': RACHEL, 'areas': [{'key': 'FLK', 'chair': True}, {'key': 'RW'}], 'canPostNotices': False})]
        for rtype, payload in cases:
            ref = self.new_site()
            r = submit(ref, JOE, rtype, payload, key=KEY2)
            ref.writes.clear()
            run_admin(ref, r)
            self.assertEqual(request(ref, r)['Status'], 'Completed')
            total = len(ref.writes)
            want_groups = {g: set(v['users']) for g, v in ref.groups.items()}
            want_rows = sorted((x['f']['MembershipKey'], x['f']['Status'], x['f']['CanManageMeetings']) for x in ref.rows('members'))
            for k in range(1, total + 1):
                with self.subTest(rtype=rtype, write=k, of=total):
                    s = self.new_site()
                    r = submit(s, JOE, rtype, payload, key=KEY2)
                    s.writes.clear()
                    s.fail_at = k
                    run_admin(s, r)
                    s.fail_at = None
                    if request(s, r)['Status'] != 'Completed':
                        request(s, r)['Status'] = 'Submitted'
                        status, eng = run_admin(s, r, now=s.clock + timedelta(minutes=10))
                        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
                    self.assertEqual({g: set(v['users']) for g, v in s.groups.items()}, want_groups)
                    self.assertEqual(sorted((x['f']['MembershipKey'], x['f']['Status'], x['f']['CanManageMeetings']) for x in s.rows('members')), want_rows)
                    self.assertEqual(len(s.rows('people')), len(ref.rows('people')))
                    self.assertEqual(len(s.rows('history', RequestKey=KEY2 + '|1')), 1)


class Settings(unittest.TestCase):
    def setting(self, s, name):
        return s.rows('settings', Title=name)[0]['f']['Value']

    def test_safe_settings_are_checked_and_recorded(self):
        s = site()
        for name, value, message in (('OverdueReminderIntervalDays', '14', 'Setting saved.'), ('OverdueReminderIntervalDays', '45', 'Enter a whole number of days from 1 to 30.'),
                                     ('OverdueReminderIntervalDays', '7x', 'Enter a whole number of days from 1 to 30.'),
                                     ('MonitorHours', '06:30|18:00|30', 'Setting saved.'), ('MonitorHours', '18:00|06:30|30', None), ('MonitorHours', '6:30|18:00|30', None),
                                     ('MonitorHours', '06:30|18:00|5', None), ('LastDailyRun', '2026', 'Choose a setting.')):
            with self.subTest(name=name, value=value):
                res, eng = run_people(s, JOE, 'UpdateSetting', {'name': name, 'value': value}, key='k-' + name + value.replace('|', '-'))
                if message == 'Setting saved.':
                    self.assertEqual((res['Status'], self.setting(s, name)), ('Completed', value), eng.log)
                else:
                    self.assertEqual(res['Status'], 'Rejected')
                    if message:
                        self.assertEqual(res['ResultMessage'], message)
        ev = s.rows('history', RequestKey='k-OverdueReminderIntervalDays14|1')[0]['f']
        self.assertEqual((ev['PreviousValue'], ev['NewValue'], ev['ActorId']), ('7', '14', JOE))
        res, _ = run_people(s, KELLY, 'UpdateSetting', {'name': 'OverdueReminderIntervalDays', 'value': '3'}, key='k-kelly')
        self.assertEqual(res['ResultMessage'], 'Only a Competency Hub administrator can do this.')




class CoOwnersAndCheck(unittest.TestCase):
    """One owner plus co-owners (who share it: they see it and add updates, and are told it is shared), and a named
    person who does the close-out check (1.9.0.0)."""
    def raise_(self, s, sender=KELLY, key=KEY, **extra):
        r = submit(s, sender, 'RaiseAction', dict(RaiseAction.good, **extra), key=key)
        _, eng = run(s, r)
        return request(s, r), eng

    def test_raised_with_co_owners_and_a_checker(self):
        s = site()
        res, eng = self.raise_(s, ownerId=RACHEL, coOwnerIds=[JOE], requiresCloseOut=True, checkerId=KELLY)
        self.assertEqual(res['Status'], 'Completed', eng.log)
        a = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['f']
        self.assertEqual((json.loads(a['CoOwnerIds']), a['CloseOutById']), (['7'], KELLY))
        subjects = sorted((m['to'], m['subject']) for m in s.sent)
        self.assertEqual(subjects, [('joseph.pepper@example.test', 'Action shared with you: Order replacement smear papers'),
                                    ('rachel.boulden@example.test', 'Action assigned to you: Order replacement smear papers')])
        joe = [m for m in s.sent if m['to'] == 'joseph.pepper@example.test'][0]
        self.assertIn('has made you a co-owner of an action', joe['body'])

    def test_the_raiser_checks_it_unless_someone_else_is_named(self):
        s = site()
        res, eng = self.raise_(s, ownerId=RACHEL, requiresCloseOut=True)
        self.assertEqual(res['Status'], 'Completed', eng.log)
        self.assertEqual(s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['f']['CloseOutById'], KELLY)
        self.assertFalse(s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['f'].get('CoOwnerIds'))

    def test_refused_in_plain_words(self):
        for sender, extra, message in (
                (KELLY, {'coOwnerIds': [KAI]}, 'Choose co-owners from the members of this area, and the Team Leaders and Group Head, other than the owner.'),
                (KELLY, {'coOwnerIds': [RACHEL]}, 'Choose co-owners from the members of this area, and the Team Leaders and Group Head, other than the owner.'),
                (KELLY, {'coOwnerIds': [JOE, JOE, JOE, JOE, JOE, JOE]}, 'Choose up to 5 co-owners.'),
                (RACHEL, {'coOwnerIds': [KELLY]}, flows.SELF_ONLY),
                (KELLY, {'requiresCloseOut': True, 'checkerId': RACHEL}, 'Choose someone other than the owner to do the close-out check.'),
                (RACHEL, {'requiresCloseOut': True}, 'Choose someone other than the owner to do the close-out check.'),
                (KELLY, {'requiresCloseOut': True, 'checkerId': KAI}, 'Choose a member of this area or a Team Leader to do the close-out check.')):
            with self.subTest(sender=sender, extra=extra):
                s = site()
                res, eng = self.raise_(s, sender=sender, ownerId=RACHEL, **extra)
                self.assertEqual((res['Status'], res['ResultMessage']), ('Rejected', message), eng.log)
                self.assertFalse(s.rows('actions', CreatedRequestKey='F|' + KEY))

    def with_check(self, checker):
        s = site()
        a = s.item('actions', s.action)['f']
        a.update({'RequiresCloseOut': True, 'CloseOutById': float(checker) if checker else None})
        return s

    def test_marked_done_asks_the_named_checker_and_only_they_or_a_team_leader_confirm(self):
        s = self.with_check(JOE)
        r = submit(s, RACHEL, 'MarkComplete', {'note': ''}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertEqual([(m['to'], m['subject']) for m in s.sent], [('joseph.pepper@example.test', 'Ready for your close-out check: Replace FH40 probe')])
        # Kelly raised it and runs FLK's meetings, but Joe was named to check it
        r2 = submit(s, KELLY, 'CloseAction', {'outcome': 'Completed', 'note': ''}, target=s.action, revision=3, key=KEY2)
        run(s, r2)
        self.assertEqual((request(s, r2)['Status'], request(s, r2)['ResultMessage']),
                         ('Rejected', 'Only the person named to check it, or a Team Leader or the Group Head, can confirm the close-out.'))
        r3 = submit(s, JOE, 'CloseAction', {'outcome': 'Completed', 'note': ''}, target=s.action, revision=3, key='k-joe-closes')
        run(s, r3)
        self.assertEqual(request(s, r3)['Status'], 'Completed')
        self.assertEqual(s.item('actions', s.action)['f']['Status'], 'Closed')

    def test_an_action_from_before_names_no_checker_and_works_as_before(self):
        s = self.with_check(None)
        r = submit(s, RACHEL, 'MarkComplete', {'note': ''}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual([m['to'] for m in s.sent], ['kelly.bates@example.test'])
        r2 = submit(s, KELLY, 'CloseAction', {'outcome': 'Completed', 'note': ''}, target=s.action, revision=3, key=KEY2)
        run(s, r2)
        self.assertEqual(request(s, r2)['Status'], 'Completed')

    def test_reassign_changes_co_owners_and_tells_only_the_new_ones(self):
        s = site()
        s.item('actions', s.action)['f']['CoOwnerIds'] = json.dumps(['103'])
        r = submit(s, KELLY, 'ReassignAction', {'ownerId': JOE, 'reason': 'Joe has the parts.', 'coOwnerIds': [RACHEL, KELLY]}, target=s.action, revision=2)
        _, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        a = s.item('actions', s.action)['f']
        self.assertEqual((a['AssignedToId'], json.loads(a['CoOwnerIds'])), (JOE, ['112', '103']))
        self.assertEqual(sorted((m['to'], m['subject'].split(':')[0]) for m in s.sent),
                         [('joseph.pepper@example.test', 'Action assigned to you'), ('rachel.boulden@example.test', 'Action reassigned'),
                          ('rachel.boulden@example.test', 'Action shared with you')])

    def test_reassigning_to_a_co_owner_takes_them_off_the_co_owners(self):
        s = site()
        s.item('actions', s.action)['f']['CoOwnerIds'] = json.dumps(['7'])
        r = submit(s, KELLY, 'ReassignAction', {'ownerId': JOE, 'reason': 'Joe has the parts.'}, target=s.action, revision=2)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed')
        self.assertFalse(s.item('actions', s.action)['f']['CoOwnerIds'])

    def test_edit_names_or_changes_the_checker(self):
        s = site()
        r = submit(s, KELLY, 'EditActionDetails', {'requiresCloseOut': True, 'checkerId': JOE}, target=s.action, revision=2)
        _, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertEqual((s.item('actions', s.action)['f']['RequiresCloseOut'], s.item('actions', s.action)['f']['CloseOutById']), (True, JOE))
        r2 = submit(s, KELLY, 'EditActionDetails', {'checkerId': RACHEL}, target=s.action, revision=3, key=KEY2)
        run(s, r2)
        self.assertEqual(request(s, r2)['ResultMessage'], 'Choose someone other than the owner to do the close-out check.')
        r3 = submit(s, KELLY, 'EditActionDetails', {'requiresCloseOut': False}, target=s.action, revision=3, key='k-off')
        run(s, r3)
        self.assertEqual((s.item('actions', s.action)['f']['RequiresCloseOut'], s.item('actions', s.action)['f'].get('CloseOutById')), (False, None))


class KnownAs(unittest.TestCase):
    """The name a person is known by: set by an administrator for anyone, themselves included, and audited. It is
    handled by the Request queue flow (Administration is at Power Automate's step limit)."""
    def test_set_for_yourself_and_others_cleared_and_refused(self):
        s = site()
        for sender, who, name, want, message in ((JOE, JOE, '  Joe ', 'Completed', None), (JOE, RACHEL, 'Rach', 'Completed', None),
                                                   (JOE, RACHEL, '', 'Completed', None), (KELLY, RACHEL, 'R', 'Rejected', 'Only a Competency Hub administrator can do this.'),
                                                   (JOE, RACHEL, 'x' * 41, 'Rejected', 'Keep the name to 40 characters or fewer.'),
                                                   (JOE, 999, 'Nobody', 'Rejected', 'This person is not in the Hub.')):
            with self.subTest(sender=sender, who=who, name=name):
                key = 'kn-{0}-{1}-{2}'.format(sender, who, len(name))
                r = submit(s, sender, 'SetKnownAs', {'personId': who, 'knownAs': name}, key=key)
                _, eng = run(s, r)
                res = request(s, r)
                self.assertEqual(res['Status'], want, (res.get('ResultMessage'), eng.log))
                if message:
                    self.assertEqual(res['ResultMessage'], message)
                else:
                    self.assertEqual(s.rows('people', SiteUserId=float(who))[0]['f'].get('KnownAs') or '', name.strip())
                    ev = s.rows('history', RequestKey=key + '|1')[0]
                    self.assertEqual((ev['dir'], ev['f']['RecordType'], ev['f']['NewValue'] or '', ev['f']['ActorId']), ('Administration', 'Person', name.strip(), JOE))
        self.assertEqual(request(s, s.rows('requests', RequestKey='kn-7-112-4')[0]['id'])['ResultMessage'].endswith(' is now shown as Rach.'), True)

    def test_emails_use_the_known_as_name(self):
        s = site()
        s.rows('people', SiteUserId=float(KELLY))[0]['f']['KnownAs'] = 'Kel'
        r = submit(s, KELLY, 'RaiseAction', dict(RaiseAction.good, ownerId=RACHEL, dueIso='2026-10-25'))
        run(s, r)
        self.assertIn('Kel has given you an action', s.sent[0]['body'])


class TemporaryAccess(unittest.TestCase):
    def expire(self, s, uid, key, iso):
        row = next(r for r in s.rows('members', PersonId=uid) if r['f']['MembershipKey'] == '{0}|{1}'.format(key, uid))
        d = date.fromisoformat(iso)
        row['f']['AccessExpires'] = datetime(d.year, d.month, d.day, tzinfo=UK).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        return row['f']

    def test_access_ends_the_day_after_its_end_date(self):
        s = site()
        row = self.expire(s, RACHEL, 'GRS', '2026-10-21')
        run_daily(s, date(2026, 10, 21))
        self.assertEqual(row['Status'], 'Active', 'still theirs on the end date itself')
        run_daily(s, date(2026, 10, 22))
        self.assertEqual(row['Status'], 'Removed')
        self.assertNotIn(RACHEL, s.groups[s.gid['GRS']]['users'])
        ev = [r for r in s.rows('history') if str(r['f'].get('RequestKey', '')).startswith('SYS|Expire|')]
        self.assertEqual((len(ev), ev[0]['dir'], ev[0]['f']['EventType']), (1, 'Administration', 'Temporary Access Ended'))
        run_daily(s, date(2026, 10, 23))
        self.assertEqual(len([r for r in s.rows('history') if str(r['f'].get('RequestKey', '')).startswith('SYS|Expire|')]), 1)

    def test_open_actions_keep_the_access_and_the_administrators_are_told_once_a_day(self):
        s = site()
        row = self.expire(s, RACHEL, 'FLK', '2026-10-20')
        run_daily(s, date(2026, 10, 22))
        self.assertEqual(row['Status'], 'Active')
        self.assertIn(RACHEL, s.groups[s.gid['FLK']]['users'])
        alerts = [m for m in s.sent if 'needs attention' in m['subject']]
        self.assertEqual([m['subject'] for m in alerts], ['Competency Hub needs attention: Temporary access has ended, but open actions remain: Boulden Rachel in FLK'])
        run_daily(s, date(2026, 10, 22), hour=7)
        self.assertEqual(len([m for m in s.sent if 'needs attention' in m['subject']]), 1)


class ReviewFindings(unittest.TestCase):
    """Faults found in the review of 23 October 2026, each reproduced first and kept here so they stay fixed."""

    def test_an_administration_change_is_checked_again_after_an_early_failure(self):
        s = site()
        s.tenant['sadie.young@example.test'] = 'Young Sadie'
        s.clock = WEEKDAY
        # Kelly is not an administrator; the first run fails at the Microsoft 365 look-up, before anything is decided
        r = submit(s, KELLY, 'AddPerson', {'email': 'sadie.young@example.test', 'role': 'Team Leader', 'administrator': True, 'areas': []}, key=KEY2)
        s.writes.clear()
        s.fail_at = 3
        run_admin(s, r)
        s.fail_at = None
        age(s, 'requests', r, 11)
        run_monitor(s, s.clock)
        run_admin(s, r, now=s.clock + timedelta(minutes=1))
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', 'Only a Competency Hub administrator can do this.'))
        self.assertFalse([u for u in s.users.values() if u['Email'] == 'sadie.young@example.test' and u['Id'] in s.groups[s.gid['Administrators']]['users']])

    def test_emails_about_a_reverted_change_are_not_sent(self):
        from wdl import ActionFailed
        s = site()
        s.clock = WEEKDAY
        orig, on = s.rest, {'v': True}

        def release_fails(method, uri, headers, body):
            if on['v'] and headers.get('X-HTTP-Method') == 'MERGE' and 'Actions' in uri and body and 'LastRequestKey' in body:
                raise ActionFailed('500 release failed')
            return orig(method, uri, headers, body)
        s.rest = release_fails
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        Monitor.fail_three_times(None, s, r, None)
        on['v'] = False
        a = submit(s, JOE, 'RevertTransaction', {'txId': tx_of(s, r)['id'], 'note': ''}, target=tx_of(s, r)['id'], key=KEY2)
        run_admin(s, a, now=s.clock + timedelta(minutes=1))
        self.assertEqual(request(s, r)['Status'], 'Reverted')
        run_monitor(s, s.clock + timedelta(minutes=45))
        self.assertEqual([m['subject'] for m in s.sent if 'needs attention' not in m['subject']], [])
        self.assertEqual(s.rows('notifications', NotificationType='EXT')[0]['f']['State'], 'Skipped')
        ev = [h['f'] for h in s.rows('history') if h['f'].get('RequestKey') == KEY2 + '|2'][0]
        self.assertTrue(ev['OwnerId'] and ev['DueDayAtEvent'] and ev['ActorId'] and ev['EventTime'], ev)

    def test_a_retry_taken_by_the_other_flow_is_skipped_not_failed(self):
        s, row = Retries().failed_extension_email(400)
        due_on(s, '2026-10-22')
        orig = s.rest

        def monitor_got_there_first(method, uri, headers, body):
            out = orig(method, uri, headers, body)
            if method == 'GET' and "State eq 'Failed'" in uri:
                for it in s.by_key['notifications']['items'].values():
                    if it['f'].get('State') == 'Failed':
                        it['version'] += 1
            return out
        s.rest = monitor_got_there_first
        st, _ = run_daily(s, date(2026, 10, 22))
        self.assertEqual(st, 'Succeeded')
        self.assertTrue(s.rows('settings', Title='LastDailyRun')[0]['f']['Value'])
        self.assertIn('Due today: Replace FH40 probe', [m['subject'] for m in s.sent])

    def test_one_bad_membership_never_stops_the_reminders(self):
        s = site()
        due_on(s, '2026-10-22')
        TemporaryAccess().expire(s, RACHEL, 'GRS', '2026-10-20')
        s.rows('competencies', CompetencyKey='GRS')[0]['f']['MembersGroupId'] = 9999.0
        st, _ = run_daily(s, date(2026, 10, 22))
        subjects = [m['subject'] for m in s.sent]
        self.assertEqual(st, 'Succeeded')
        self.assertIn('Due today: Replace FH40 probe', subjects)
        self.assertTrue(any('Temporary access could not be ended' in x for x in subjects), subjects)
        self.assertTrue(s.rows('settings', Title='LastDailyRun')[0]['f']['Value'])

    def test_a_request_that_can_never_be_recorded_is_refused_not_retried_for_ever(self):
        s = site()
        s.clock = WEEKDAY
        r1 = submit(s, RACHEL, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r1)
        r2 = submit(s, RACHEL, 'ChangeStatus', {'status': 'Open'}, target=s.action, revision=3, key=KEY + '|1')
        run(s, r2)
        self.assertEqual(request(s, r2)['Status'], 'Rejected')

    def test_a_stopped_administration_flow_does_not_stop_staff(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, JOE, 'UpdateSetting', {'name': 'ReminderDaysBefore', 'value': '5'}, key=KEY2)
        age(s, 'requests', r, 11)
        run_monitor(s, WEEKDAY)
        age(s, 'requests', r, 15)
        run_monitor(s, WEEKDAY + timedelta(minutes=15))
        self.assertEqual((health(s)['state'], health(s)['admin']), ('Healthy', 'Down'))

    def test_a_short_outlook_outage_loses_no_email(self):
        s = site()
        s.clock = WEEKDAY
        s.mail_fail = [429, 429]          # Outlook throttling for about half an hour
        r = submit(s, KELLY, 'ExtendDeadline', Extend().payload(), target=s.action, revision=2)
        run(s, r)
        for m in (16, 32, 48):
            run_monitor(s, WEEKDAY + timedelta(minutes=m))
        row = s.rows('notifications', NotificationType='EXT')[0]['f']
        self.assertNotEqual(row['State'], 'Abandoned')
        run_monitor(s, WEEKDAY + timedelta(hours=7))
        self.assertEqual(row['State'], 'Sent')

    def test_an_unknown_kind_of_change_is_refused_without_reading_anything(self):
        s = site()
        r = submit(s, RACHEL, 'DeleteEverything', {})
        run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', 'This kind of change is not recognised.'))

    def test_a_partly_made_people_change_cannot_be_cancelled(self):
        s = site()
        s.clock = WEEKDAY
        r = submit(s, JOE, 'UpdatePerson', {'personId': RACHEL, 'areas': [{'key': 'FLK'}], 'role': 'Technician'})
        s.fail_if = lambda m, path, where: m == 'MERGE' and path.startswith('People/')
        run_admin(s, r)
        for _ in range(3):
            age(s, 'requests', r, 11)
            run_monitor(s, s.clock)
            if request(s, r)['Status'] == 'Submitted':
                run_admin(s, r, now=s.clock + timedelta(minutes=1))
        s.fail_if = None
        self.assertEqual(request(s, r)['ResultMessage'], 'Not fully recorded – an administrator has been told and will finish it.')
        c = submit(s, JOE, 'CancelTransaction', {'txId': tx_of(s, r)['id'], 'note': ''}, target=tx_of(s, r)['id'], key=KEY2)
        run_admin(s, c, now=s.clock + timedelta(minutes=1))
        self.assertEqual(request(s, c)['Status'], 'Rejected')


if __name__ == '__main__':
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
