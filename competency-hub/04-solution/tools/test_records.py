"""Runs the generated Records flow (4) against the simulated Hub site: notices, comments, the register and links.
    python3 test_records.py
Evidence class: LOCAL / OFFLINE-SIMULATED.
"""
import json
import unittest
from datetime import timedelta

import flows
from hub_fake import SITE
from wdl import Engine
from datetime import date
from test_flow import site as base_site, submit, request, FLOWS, JOE, RACHEL, KELLY, KAI, KEY, KEY2, AREAS, run_daily, due_on

RECORDS = FLOWS['ESG Competency Hub | 4 Records']
QUEUE = FLOWS['ESG Competency Hub | 2 Request queue']


def site():
    s = base_site()
    for k in AREAS:
        s.folder('notices', k)
        s.folder('register', k)
    # a notice Rachel posted in Flask, and a comment on it by Kai (posting and comments are direct writes)
    s.notice = s.add('notices', 'FLK', {'Title': 'Probe spares arrived', 'Body': 'In the stores cage.', 'CompetencyId': 1, 'Category': 'General',
                                         'IsImportant': False, 'Status': 'Active', 'ClientKey': 'n1', 'Revision': 1.0}, author=RACHEL)
    s.comment = s.add('updates', 'FLK', {'ClientKey': 'c1', 'ParentType': 'Notice', 'ParentId': float(s.notice), 'EntryType': 'Comment',
                                          'IsFlagEvent': False, 'Body': 'Thanks!', 'IsHidden': False}, author=KAI)
    # a register entry in Flask raised by Rachel, Kelly responsible
    s.entry = s.add('register', 'FLK', {'Title': 'Probe cable worn', 'Description': 'Cable sheath split.', 'CompetencyId': 1,
                                         'EntryType': 'Degradation', 'Impact': 'Medium', 'Status': 'Open', 'RaisedById': RACHEL,
                                         'ResponsiblePersonId': KELLY, 'Revision': 1.0, 'CreatedRequestKey': 'IMPORT-E1'})
    return s


def run(s, req_id, flow=RECORDS, now=None):
    s.clock = now or s.clock
    eng = Engine(flow, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', req_id))
    return eng.run(), eng


def event(s, key=KEY):
    ev = s.rows('history', RequestKey=key + '|1')
    return ev[0] if ev else None


class Notices(unittest.TestCase):
    def test_the_author_edits_their_notice_and_history_records_it(self):
        s = site()
        r = submit(s, RACHEL, 'EditNotice', {'title': 'Probe spares are in', 'body': 'Cage B, top shelf.', 'important': True}, target=s.notice, revision=1)
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        n = s.item('notices', s.notice)['f']
        self.assertEqual((n['Title'], n['Body'], n['IsImportant'], n['Revision'], n['LastRequestKey']), ('Probe spares are in', 'Cage B, top shelf.', True, 2.0, KEY))
        self.assertTrue(n['ImportantUntil'], 'important for a limited time')
        ev = event(s)
        self.assertEqual((ev['dir'], ev['f']['RecordType'], ev['f']['EventType'], ev['f']['ActorId'], ev['f']['CompetencyId']),
                         ('FLK', 'Notice', 'Notice Edited', RACHEL, 1))

    def test_who_may_change_a_notice(self):
        for who, ok in ((KELLY, True), (JOE, True), (KAI, False)):
            with self.subTest(who=who):
                s = site()
                r = submit(s, who, 'ArchiveNotice', {}, target=s.notice, revision=1)
                run(s, r)
                req = request(s, r)
                self.assertEqual(req['Status'], 'Completed' if ok else 'Rejected', req)
                self.assertEqual(s.item('notices', s.notice)['f']['Status'], 'Archived' if ok else 'Active')

    def test_only_moderators_pin(self):
        s = site()
        r = submit(s, RACHEL, 'PinNotice', {'pinned': True}, target=s.notice)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Only the engineers of the area and management can pin notices.')
        r = submit(s, KELLY, 'PinNotice', {'pinned': True}, target=s.notice, key=KEY2)
        run(s, r)
        n = s.item('notices', s.notice)['f']
        self.assertEqual((request(s, r)['Status'], n['IsImportant'], n.get('ImportantUntil')), ('Completed', True, None))

    def test_refusals_in_plain_words(self):
        cases = [({'title': ''}, 'Give the notice a title.'), ({'body': 'x' * 5001}, 'Keep the notice to 5,000 characters or fewer.'),
                 ({'category': 'Gossip'}, 'Choose a category.')]
        for payload, message in cases:
            with self.subTest(payload=payload):
                s = site()
                r = submit(s, RACHEL, 'EditNotice', payload, target=s.notice, revision=1)
                run(s, r)
                self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', message))
                self.assertEqual(s.item('notices', s.notice)['f']['Title'], 'Probe spares arrived')
        s = site()
        r = submit(s, RACHEL, 'EditNotice', {'title': 'New'}, target=s.notice, revision=7)
        run(s, r)
        self.assertIn('changed by someone else', request(s, r)['ResultMessage'])

    def test_a_moderator_hides_a_comment(self):
        s = site()
        r = submit(s, RACHEL, 'HideComment', {}, target=s.comment)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Rejected')
        r = submit(s, KELLY, 'HideComment', {}, target=s.comment, key=KEY2)
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertTrue(s.item('updates', s.comment)['f']['IsHidden'])
        self.assertEqual(event(s, KEY2)['f']['EventType'], 'Comment Hidden')


class Register(unittest.TestCase):
    good = {'areaKey': 'FLK', 'entryType': 'Improvement', 'impact': 'Low', 'title': 'Shadow board for tools',
            'description': 'Outline each tool so missing ones are obvious.', 'responsibleId': KELLY}

    def test_raised_with_every_record(self):
        s = site()
        r = submit(s, RACHEL, 'RaiseRegisterEntry', self.good)
        status, eng = run(s, r)
        req = request(s, r)
        self.assertEqual(req['Status'], 'Completed', eng.log)
        e = s.rows('register', CreatedRequestKey='F|' + KEY)
        self.assertEqual(len(e), 1)
        f = e[0]['f']
        self.assertEqual((e[0]['dir'], f['EntryType'], f['Status'], f['RaisedById'], f['ResponsiblePersonId'], f['IsTestRecord']),
                         ('FLK', 'Improvement', 'Open', RACHEL, KELLY, True))
        self.assertEqual(req['ResultMessage'], 'REG-{0:05d} raised.'.format(e[0]['id']))
        self.assertEqual(event(s)['f']['EventType'], 'Entry Raised')

    def test_raise_refusals(self):
        cases = [({'areaKey': 'RW'}, 'Choose one of your areas.'), ({'entryType': 'Rumour'}, 'Choose the type of entry.'),
                 ({'impact': ''}, 'Choose the impact.'), ({'title': ' '}, 'Give the entry a title.'), ({'description': ''}, 'Describe it.'),
                 ({'responsibleId': KAI}, 'Choose a member of this area or a Team Leader.')]
        for change, message in cases:
            with self.subTest(change=change):
                s = site()
                r = submit(s, RACHEL, 'RaiseRegisterEntry', dict(self.good, **change))
                run(s, r)
                self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', message))
                self.assertEqual(s.rows('register', CreatedRequestKey='F|' + KEY), [])

    def test_resolving_needs_an_outcome_and_records_the_date(self):
        s = site()
        r = submit(s, KELLY, 'UpdateRegisterEntry', {'status': 'Resolved'}, target=s.entry, revision=1)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Record the outcome (at least 10 characters).')
        r = submit(s, KELLY, 'UpdateRegisterEntry', {'status': 'Resolved', 'outcome': 'New cable fitted and tested.'}, target=s.entry, revision=1, key=KEY2)
        status, eng = run(s, r)
        f = s.item('register', s.entry)['f']
        self.assertEqual((request(s, r)['Status'], f['Status'], f['Outcome'], f['Revision']), ('Completed', 'Resolved', 'New cable fitted and tested.', 2.0), eng.log)
        self.assertTrue(f['DateResolved'])
        self.assertEqual((event(s, KEY2)['f']['EventType'], event(s, KEY2)['f']['NewValue']), ('Entry Status Changed', 'Resolved'))

    def test_who_may_change_an_entry(self):
        # the raiser and the responsible person may; an engineer of another area may not
        for who, ok in ((RACHEL, True), (KELLY, True), (JOE, True), (KAI, False)):
            with self.subTest(who=who):
                s = site()
                r = submit(s, who, 'UpdateRegisterEntry', {'impact': 'High'}, target=s.entry, revision=1)
                run(s, r)
                self.assertEqual(request(s, r)['Status'], 'Completed' if ok else 'Rejected')

    def test_link_and_unlink_an_action(self):
        s = site()
        r = submit(s, KELLY, 'LinkActionToEntry', {'actionId': s.action}, target=s.entry)
        status, eng = run(s, r)
        a = s.item('actions', s.action)['f']
        self.assertEqual((request(s, r)['Status'], a['SourceType'], a['SourceId']), ('Completed', 'Register', float(s.entry)), eng.log)
        self.assertEqual(a['Revision'], 2.0, 'linking does not count as a change to the action itself')
        r = submit(s, KELLY, 'UnlinkActionFromEntry', {'actionId': s.action}, target=s.entry, key=KEY2)
        run(s, r)
        a = s.item('actions', s.action)['f']
        self.assertEqual((request(s, r)['Status'], a['SourceType'], a.get('SourceId')), ('Completed', 'None', None))

    def test_link_refusals(self):
        s = site()
        other = s.add('actions', 'RW', {'Title': 'Drum labels', 'CompetencyId': 10, 'AssignedToId': KAI, 'RaisedById': KAI, 'Status': 'Open',
                                         'IsOpen': True, 'DueDay': 20261030.0, 'Revision': 1.0})
        r = submit(s, KELLY, 'LinkActionToEntry', {'actionId': other}, target=s.entry)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Choose an action in the same area as this entry.')
        r = submit(s, KAI, 'LinkActionToEntry', {'actionId': s.action}, target=s.entry, key=KEY2)
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Rejected')

    def test_raise_a_linked_action_from_an_entry(self):
        s = site()
        r = submit(s, KELLY, 'RaiseAction', {'areaKey': 'FLK', 'title': 'Replace probe cable', 'description': 'Fit the new cable.', 'ownerId': RACHEL,
                                             'dueIso': '2026-10-30', 'priority': 'Normal', 'requiresCloseOut': False, 'sourceEntryId': s.entry})
        status, eng = run(s, r, flow=QUEUE)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        a = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['f']
        self.assertEqual((a['SourceType'], a['SourceId']), ('Register', float(s.entry)))
        r = submit(s, KELLY, 'RaiseAction', {'areaKey': 'GRS', 'title': 'X', 'description': 'Y', 'ownerId': RACHEL, 'dueIso': '2026-10-30',
                                             'priority': 'Normal', 'sourceEntryId': s.entry}, key=KEY2)
        run(s, r, flow=QUEUE)
        self.assertEqual(request(s, r)['Status'], 'Rejected')


class Reminders(unittest.TestCase):
    """Two fixes made in 1.5.0.0."""
    def test_the_cover_window_follows_the_reminder_setting(self):
        # with the first reminder 10 days ahead, an assignment 9 days before the deadline makes it unnecessary
        s = site()
        s.rows('settings', Title='ReminderDaysBefore')[0]['f']['Value'] = '10'
        r = submit(s, KELLY, 'RaiseAction', {'areaKey': 'FLK', 'title': 'Order filters', 'description': 'Two boxes.', 'ownerId': RACHEL,
                                             'dueIso': '2026-10-30', 'priority': 'Normal'})
        run(s, r, flow=QUEUE)
        aid = s.rows('actions', CreatedRequestKey='F|' + KEY)[0]['id']
        keys = {it['f']['NotificationKey']: it['f']['State'] for it in s.by_key['notifications']['items'].values()}
        self.assertEqual(keys.get('R7|{0}|20261030|{1}'.format(aid, RACHEL)), 'Skipped', keys)

    def test_a_reminder_sent_again_on_a_later_day_says_how_many_days_are_left_that_day(self):
        s = site()
        due_on(s, '2026-10-28')
        s.mail_fail = [400]
        run_daily(s, date(2026, 10, 21))        # the 7-day reminder is refused
        self.assertEqual(s.sent, [])
        run_daily(s, date(2026, 10, 22))        # and sent the next morning, with 6 days left
        subjects = [m['subject'] for m in s.sent]
        self.assertIn('Reminder: Replace FH40 probe is due in 6 days', subjects, subjects)
        body = [m['body'] for m in s.sent if 'due in 6 days' in m['subject']][0]
        self.assertIn('Your action is due in 6 days.', body)
        self.assertNotIn('due in 7 days', body)


class Robustness(unittest.TestCase):
    def snapshot(self, s):
        out = {}
        for key in ('notices', 'register', 'updates', 'actions', 'history'):
            rows = []
            for it in s.by_key[key]['items'].values():
                f = {k: v for k, v in it['f'].items() if k not in ('ProcessedAt', 'FirstClaimedAt', 'Attempts', 'LastError', 'StepsDone', 'NextAttemptAfter',
                                                                     'PreviousValue', 'State')}
                rows.append((it['dir'], it['fsobj'], json.dumps(f, sort_keys=True, default=str)))
            out[key] = sorted(rows)
        return out

    def interrupted_everywhere(self, sender, rtype, payload, target=None, revision=None):
        ref = site()
        r = submit(ref, sender, rtype, payload, target=target and getattr(ref, target), revision=revision)
        run(ref, r)
        self.assertEqual(request(ref, r)['Status'], 'Completed')
        expected, total = self.snapshot(ref), len(ref.writes)
        for k in range(1, total + 1):
            with self.subTest(write=k, of=total, at=ref.writes[k - 1]):
                s = site()
                r = submit(s, sender, rtype, payload, target=target and getattr(s, target), revision=revision)
                s.fail_at = k
                first, _ = run(s, r)
                s.fail_at = None
                req = request(s, r)
                if req['Status'] == 'Completed':
                    continue
                req['Status'] = 'Submitted'
                second, eng2 = run(s, r, now=s.clock + timedelta(minutes=10))
                self.assertEqual(request(s, r)['Status'], 'Completed', eng2.log)
                got = self.snapshot(s)
                for key in ('notices', 'register', 'updates', 'actions'):
                    self.assertEqual(got[key], expected[key], key)
                self.assertEqual(len(s.rows('history', RowKind='Event')), len(ref.rows('history', RowKind='Event')))

    def test_every_kind_survives_an_interruption_at_every_write(self):
        cases = [(RACHEL, 'EditNotice', {'title': 'New title'}, 'notice', 1), (KELLY, 'ArchiveNotice', {}, 'notice', 1),
                 (KELLY, 'PinNotice', {'pinned': True}, 'notice', None), (KELLY, 'HideComment', {}, 'comment', None),
                 (RACHEL, 'RaiseRegisterEntry', Register.good, None, None),
                 (KELLY, 'UpdateRegisterEntry', {'status': 'Closed', 'outcome': 'No longer an issue.'}, 'entry', 1),
                 (KELLY, 'LinkActionToEntry', {'actionId': 'ACTION'}, 'entry', None)]
        for sender, rtype, payload, target, revision in cases:
            with self.subTest(kind=rtype):
                if payload.get('actionId') == 'ACTION':
                    payload = {'actionId': site().action}
                self.interrupted_everywhere(sender, rtype, payload, target, revision)

    def test_unknown_kind_is_refused(self):
        s = site()
        r = submit(s, RACHEL, 'EditNotice', {}, target=s.notice)
        s.item('requests', r)['f']['RequestType'] = 'DeleteEverything'
        run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Rejected')


if __name__ == '__main__':
    unittest.main(verbosity=1)
