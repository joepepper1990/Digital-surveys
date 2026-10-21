"""Runs the generated Request queue flow (the real flow JSON) against the simulated Hub site.
    python3 test_flow.py
Evidence class: LOCAL / OFFLINE-SIMULATED. The tenant behaviour is proven only by the import and the tests on the site.
"""
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone

import flows
from hub_fake import HubFake, SITE
from wdl import Engine

FLOW = flows.build_all()[0]['json']['properties']['definition']
JOE, RACHEL, KELLY, KAI = 7, 112, 103, 110
KEY = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
AREAS = ['FLK', 'INS', 'GRS', 'RPE', 'BA', 'DOS', 'RP', 'DSL', 'ALS', 'RW']


def site():
    s = HubFake(me=JOE)
    for uid, title, email in ((JOE, 'Pepper Joseph', 'joseph.pepper@example.test'), (RACHEL, 'Boulden Rachel', 'rachel.boulden@example.test'),
                              (KELLY, 'Bates Kelly', 'kelly.bates@example.test'), (KAI, 'Todd Kai', 'kai.todd@example.test')):
        s.add_user(uid, title, email)
    for i, k in enumerate(AREAS):
        s.add('competencies', '', {'Title': k, 'CompetencyKey': k, 'SortOrder': (i + 1) * 10, 'Status': 'Active'})
        for lst in ('actions', 'updates', 'history', 'members'):
            s.folder(lst, k)
    s.folder('history', 'Transactions')
    s.folder('history', 'Administration')
    for uid in (JOE, RACHEL, KELLY, KAI):
        s.folder('requests', 'u{0}'.format(uid))
    for uid, title, role in ((JOE, 'Pepper Joseph', 'Team Leader'), (RACHEL, 'Boulden Rachel', 'Technician'),
                             (KELLY, 'Bates Kelly', 'Engineer'), (KAI, 'Todd Kai', 'Engineer')):
        s.add('people', '', {'Title': title, 'PersonId': uid, 'Email': title, 'SiteUserId': float(uid), 'Role': role, 'IsAdministrator': uid == JOE,
                             'Status': 'Active'})
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
    return s


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
                 ({'ownerId': JOE}, None),
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
                f = {k: v for k, v in it['f'].items() if k not in ('ProcessedAt', 'FirstClaimedAt', 'Attempts', 'LastError', 'StepsDone')}
                rows.append((it['dir'], it['fsobj'], json.dumps(f, sort_keys=True, default=str)))
            out[key] = sorted(rows)
        return out

    def interrupted_everywhere(self, rtype, payload, target=None, revision=None):
        ref = site()
        r = submit(ref, RACHEL, rtype, payload, target=target and ref.action, revision=revision)
        status, eng = run(ref, r)
        self.assertEqual(request(ref, r)['Status'], 'Completed', eng.log)
        expected, total = self.snapshot(ref), len(ref.writes)
        for k in range(1, total + 1):
            with self.subTest(write=k, of=total, at=ref.writes[k - 1]):
                s = site()
                r = submit(s, RACHEL, rtype, payload, target=target and s.action, revision=revision)
                s.fail_at = k
                first, eng1 = run(s, r)
                self.assertIn(first, ('Failed', 'Cancelled'))
                s.fail_at = None
                req = request(s, r)
                if req['Status'] == 'Completed':   # interrupted only after the request was marked Completed
                    continue
                req['Status'] = 'Submitted'          # an administrator puts it back in the queue
                second, eng2 = run(s, r, now=s.clock + timedelta(minutes=10))
                self.assertEqual(request(s, r)['Status'], 'Completed', eng2.log)
                got = self.snapshot(s)
                for key in ('actions', 'history', 'updates'):
                    self.assertEqual(got[key], expected[key], key)

    def test_raise_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('RaiseAction', RaiseAction.good)

    def test_extend_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('ExtendDeadline', Extend().payload(), target=True, revision=2)

    def test_complete_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere('MarkComplete', {'note': 'Done.'}, target=True, revision=2)

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
        self.assertEqual(request(s, r)['ResultMessage'], 'This kind of request is not handled yet.')

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


class Calls(unittest.TestCase):
    """Fewer SharePoint calls per request (plan K7.10): a first run skips every "already done?" look-up."""
    BUDGET = {'RaiseAction': 20, 'ExtendDeadline': 16, 'MarkComplete': 16}

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
                self.assertLessEqual(len(s.calls), budget, '\n'.join(m + ' ' + u for m, u in s.calls))

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


if __name__ == '__main__':
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
