"""Load test (spec Q2): the flows against a site the size of several years of use – 10,000 actions, 60,000 History rows,
5,000 notices and 10,000 updates – with SharePoint's list view threshold enforced on every query (hub_fake._threshold).
Every kind of run still completes, and quickly enough in the simulation to show no query reads a whole large list.
    python3 test_load.py
Evidence class: LOCAL / OFFLINE-SIMULATED. Real timings are measured on the site.
"""
import time
import unittest
from datetime import date, timedelta

import test_flow as tf
from test_flow import submit, request, run, run_daily, run_monitor, RACHEL
import test_meetings as tm

KEYL = '5a6b7c8d-9e0f-4a1b-8c2d-e3f4a5b6c7d8'
KEYL2 = '6b7c8d9e-0f1a-4b2c-9d3e-f4a5b6c7d8e9'


def big_site():
    s = tm.agenda_site()
    start = time.time()
    for i in range(10000):
        a = s.add('actions', 'FLK' if i % 10 == 0 else 'RW', {'Title': 'Old action {0}'.format(i), 'CompetencyId': 1 if i % 10 == 0 else 10, 'AssignedToId': RACHEL,
                                                             'Status': 'Closed' if i % 50 else 'Open', 'IsOpen': not bool(i % 50), 'DueDay': 20250101.0 + (i % 28),
                                                             'DateClosed': '2025-06-01T00:00:00Z', 'Revision': 1.0, 'CreatedRequestKey': 'IMPORT-L{0}'.format(i)})
        for j in range(6):
            s.add('history', 'RW', {'Title': 'Event', 'RowKind': 'Event', 'RequestKey': 'L{0}|{1}'.format(i, j), 'RecordType': 'Action', 'RecordId': float(a),
                                    'EventType': 'Progress Posted'})
        s.add('updates', 'RW', {'ClientKey': 'L{0}'.format(i), 'ParentType': 'Action', 'ParentId': float(a), 'EntryType': 'Progress', 'Body': 'x', 'IsFlagEvent': False})
    for i in range(5000):
        s.add('notices', 'RW', {'Title': 'Old notice {0}'.format(i), 'Body': 'x', 'Status': 'Archived', 'ClientKey': 'LN{0}'.format(i), 'Revision': 1.0})
    s.setup_seconds = time.time() - start
    return s


class Load(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = big_site()
        cls.timings = {}

    def timed(self, name, fn):
        t = time.time()
        out = fn()
        self.timings[name] = round(time.time() - t, 1)
        return out

    def test_1_raise_and_change_an_action(self):
        s = self.s
        r = submit(s, RACHEL, 'RaiseAction', tf.RaiseAction.good, key=KEYL)
        status, eng = self.timed('raise', lambda: run(s, r))
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        new = s.rows('actions', Title=tf.RaiseAction.good['title'])[0]
        r2 = submit(s, RACHEL, 'ExtendDeadline', {'newDueIso': '2026-11-20', 'reason': 'Waiting for the part.', 'expectedDueDay': new['f']['DueDay']},
                    target=new['id'], revision=new['f']['Revision'], key=KEYL2)
        status, eng = self.timed('extend', lambda: run(s, r2))
        self.assertEqual(request(s, r2)['Status'], 'Completed', eng.log)

    def test_2_daily_tasks_and_the_monitor(self):
        s = self.s
        status, eng = self.timed('daily', lambda: run_daily(s, date(2026, 10, 22)))
        self.assertEqual(status, 'Succeeded', eng.log)
        status, eng = self.timed('monitor', lambda: run_monitor(s, s.clock + timedelta(hours=3)))
        self.assertEqual(status, 'Succeeded', eng.log)

    def test_3_a_meeting_from_start_to_finalised(self):
        s = self.s
        tm.started(s)
        r, eng = self.timed('finalise', lambda: tm.finalise(s))
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertEqual(s.item('meetings', s.mid)['f']['PdfState'], 'Ready')

    @classmethod
    def tearDownClass(cls):
        print('\nLoad test: built {0} rows in {1:.0f}s; runs (simulated seconds of work): {2}'.format(
            sum(len(l['items']) for l in cls.s.lists.values()), cls.s.setup_seconds, cls.timings))


if __name__ == '__main__':
    unittest.main()
