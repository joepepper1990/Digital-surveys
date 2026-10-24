"""Runs the generated Clean-up flow (8) against the simulated Hub site: removing the test records before go-live.
    python3 test_cleanup.py
Evidence class: LOCAL / OFFLINE-SIMULATED.
"""
import unittest
from datetime import timedelta

import flows
from hub_fake import SITE
from wdl import Engine
from test_flow import submit, request, FLOWS, JOE, RACHEL, KELLY
import test_meetings as tm

CLEANUP = FLOWS['ESG Competency Hub | 8 Clean-up']
KEYC = '4f5a6b7c-8d9e-4f0a-9b1c-d2e3f4a5b6c7'
CONFIRM = 'REMOVE TEST DATA'


def site():
    """A finalised TEST meeting with its PDF, plus test and real records around it."""
    s = tm.started()
    tm.finalise(s)
    if not s.rows('settings', Title='PreGoLiveTesting'):
        s.add('settings', '', {'Title': 'PreGoLiveTesting', 'Value': 'Yes'})
    s.rows('settings', Title='PreGoLiveTesting')[0]['f']['Value'] = 'Yes'
    mark = lambda key, iid: s.item(key, iid)['f'].__setitem__('IsTestRecord', True)
    mark('meetings', s.mid)
    mark('actions', s.raised)                       # raised from the meeting: goes with it
    mark('notices', s.n1)
    s.fb = s.add('feedback', '', {'Title': 'TEST question', 'Type': 'Question', 'Description': 'x', 'Status': 'New', 'IsTestRecord': True}, author=RACHEL)
    # a comment on the test notice, and an email row about the test action
    s.comment = s.add('updates', 'FLK', {'ClientKey': 'c1', 'ParentType': 'Notice', 'ParentId': float(s.n1), 'EntryType': 'Comment', 'Body': 'x', 'IsFlagEvent': False})
    s.mail = s.add('notifications', '', {'Title': 'ASG', 'NotificationKey': 'ASG|x|1', 'RecordType': 'Action', 'RecordId': float(s.raised), 'State': 'Sent'})
    # an early TEST action, made before marking existed: removed only if ticked
    s.old = s.add('actions', 'FLK', {'Title': 'TEST early action', 'CompetencyId': 1, 'AssignedToId': JOE, 'Status': 'Open', 'IsOpen': True, 'Revision': 1.0,
                                     'CreatedRequestKey': 'F|early'})
    s.folder('updates', 'FLK/A{0}'.format(s.old))
    s.add('updates', 'FLK/A{0}'.format(s.old), {'ClientKey': 'u-old', 'ParentType': 'Action', 'ParentId': float(s.old), 'EntryType': 'Progress', 'Body': 'x', 'IsFlagEvent': False})
    return s


def run(s, sender=JOE, payload=None, key=KEYC, now=None):
    r = submit(s, sender, 'RemoveTestRecords', payload if payload is not None else {'confirm': CONFIRM, 'include': {'Action': [s.old]}}, key=key)
    s.clock = now or s.clock
    eng = Engine(CLEANUP, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', r))
    eng.run()
    return r, eng


class RemoveTestRecords(unittest.TestCase):
    def test_the_test_records_and_everything_that_depends_on_them_go_to_the_recycle_bin(self):
        s = site()
        pdfs = [p for p in s.files if '/MTG-{0}-'.format(s.mid) in p]
        self.assertTrue(pdfs)
        r, eng = run(s)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertEqual(request(s, r)['ResultMessage'], '5 test records removed, with everything that depended on them. They stay in the recycle bin for 93 days. '
                                                         'Test marking is now off.')
        gone = lambda key, iid: iid not in s.by_key[key]['items']
        for key, iid in (('meetings', s.mid), ('actions', s.raised), ('actions', s.old), ('notices', s.n1), ('feedback', s.fb),
                         ('updates', s.comment), ('notifications', s.mail)):
            self.assertTrue(gone(key, iid), (key, iid))
        # the meeting's folder (agenda, record, frozen minutes) and its PDFs
        self.assertIsNone(s.folder_item('meetingItems', 'FLK/MTG-{0}'.format(s.mid)))
        self.assertFalse([it for it in s.by_key['meetingItems']['items'].values() if it['f'].get('MeetingId') == float(s.mid)])
        self.assertFalse([p for p in s.files if '/MTG-{0}-'.format(s.mid) in p])
        # the early action's updates folder, and History about any of them
        self.assertIsNone(s.folder_item('updates', 'FLK/A{0}'.format(s.old)))
        self.assertFalse([it for it in s.by_key['history']['items'].values() if it['f'].get('RecordType') == 'Meeting' and it['f'].get('RecordId') == float(s.mid)])
        # nothing else: other records stay
        for key, iid in (('actions', s.action), ('notices', s.n2), ('register', s.e_new)):
            self.assertFalse(gone(key, iid), (key, iid))
        ev = s.rows('history', RequestKey=KEYC + '|1')[0]
        self.assertEqual((ev['dir'], ev['f']['EventType'], ev['f']['ActorId']), ('Administration', 'Test Records Removed', JOE))
        self.assertIn('Action {0}: TEST early action'.format(s.old), ev['f']['Note'])
        self.assertIn('Meeting {0}'.format(s.mid), ev['f']['Note'])
        self.assertEqual(s.rows('settings', Title='PreGoLiveTesting')[0]['f']['Value'], 'No')

    def test_refused_in_plain_words_and_nothing_removed(self):
        cases = [
            (KELLY, {'confirm': CONFIRM}, 'Only a Competency Hub administrator can do this.'),
            (JOE, {'confirm': 'remove test data'}, 'Type REMOVE TEST DATA to confirm.'),
        ]
        for sender, payload, message in cases:
            with self.subTest(message=message):
                s = site()
                before = sum(len(l['items']) for l in s.lists.values())
                r, eng = run(s, sender=sender, payload=payload)
                self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', message))
                self.assertEqual(s.recycled, [])
        s = site()
        s.rows('settings', Title='PreGoLiveTesting')[0]['f']['Value'] = 'No'
        r, eng = run(s)
        self.assertEqual(request(s, r)['ResultMessage'], 'Test marking is already off: the Hub is live, so nothing is removed this way.')
        self.assertEqual(s.recycled, [])

    def test_an_action_left_behind_stops_everything(self):
        s = site()
        s.item('actions', s.raised)['f']['IsTestRecord'] = False   # raised from the test meeting, but not included
        r, eng = run(s)
        self.assertEqual(request(s, r)['Status'], 'Rejected', eng.log)
        self.assertEqual(request(s, r)['ResultMessage'], 'These actions depend on records being removed. Include them too: ACT-{0} Order spare probes.'.format(s.raised))
        self.assertEqual(s.recycled, [])

    def test_survives_an_interruption_at_every_write(self):
        ref = site()
        r, eng = run(ref)
        self.assertEqual(request(ref, r)['Status'], 'Completed', eng.log)
        snapshot = lambda s: {k: sorted(l['items']) for k, l in s.by_key.items() if k not in ('requests', 'history')}
        expected, files, total = snapshot(ref), sorted(ref.files), len(ref.writes)
        writes = list(ref.writes)
        for k in range(1, total + 1):
            with self.subTest(write=k, of=total, at=writes[k - 1]):
                s = site()
                s.writes = []
                s.fail_at = len(s.writes) + k
                r, eng = run(s)
                s.fail_at = None
                if request(s, r)['Status'] != 'Completed':
                    request(s, r)['Status'] = 'Submitted'
                    eng = Engine(CLEANUP, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock + timedelta(minutes=10), trigger_body=s.trigger_item('requests', r))
                    eng.run()
                    self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
                self.assertEqual(snapshot(s), expected)
                self.assertEqual(sorted(s.files), files)
                self.assertEqual(len(s.rows('history', RequestKey=KEYC + '|1')), 1)


if __name__ == '__main__':
    unittest.main()
