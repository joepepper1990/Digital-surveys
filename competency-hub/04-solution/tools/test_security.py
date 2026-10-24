"""Security sweep (spec Q1, §8): every kind of request, hand-built and sent by someone with no right to make it – an
active technician who belongs to no area and is not an administrator – is refused by its flow, and no business record
changes. A request placed in someone else's request folder is refused by every flow.
    python3 test_security.py
Evidence class: LOCAL / OFFLINE-SIMULATED. The permission probe (P2) proves SharePoint's own refusals on the site.
"""
import json
import unittest

import flows
from hub_fake import SITE
from wdl import Engine
from test_flow import submit, request, FLOWS, RACHEL, KELLY
import test_meetings as tm

OUT = 120
FLOW_OF = {'actions': 'ESG Competency Hub | 2 Request queue', 'records': 'ESG Competency Hub | 4 Records', 'meetings': 'ESG Competency Hub | 5 Meetings',
           'minutes': 'ESG Competency Hub | 7 Minutes', 'admin': 'ESG Competency Hub | 6 Administration', 'cleanup': 'ESG Competency Hub | 8 Clean-up'}
BUSINESS = ('actions', 'notices', 'register', 'updates', 'meetings', 'meetingItems', 'people', 'members', 'settings', 'competencies', 'feedback', 'calendar')


def site():
    s = tm.started()
    s.add_user(OUT, 'Outsider Owen', 'owen.outsider@example.test')
    s.add('people', '', {'Title': 'Outsider Owen', 'PersonId': OUT, 'Email': 'x', 'SiteUserId': float(OUT), 'Role': 'Technician', 'IsAdministrator': False, 'Status': 'Active'})
    s.folder('requests', 'u{0}'.format(OUT))
    s.folder_item('requests', 'u{0}'.format(OUT)).update({'unique': True, 'ra': {s.me: {1073741829}, OUT: {2003}}})
    return s


def cases(s):
    """(type, target, payload): each aimed at a real record, shaped as the app would send it."""
    a, n, e, m = s.action, s.n1, s.e_new, s.mid
    return [
        ('RaiseAction', None, {'areaKey': 'FLK', 'title': 'x', 'description': 'x', 'ownerId': RACHEL, 'dueIso': '2026-11-20', 'priority': 'Normal'}),
        ('ExtendDeadline', a, {'newDueIso': '2026-12-01', 'reason': 'A long enough reason.', 'expectedDueDay': 20261019}),
        ('MarkComplete', a, {'note': 'x'}), ('ChangeStatus', a, {'status': 'Open'}),
        ('ReassignAction', a, {'ownerId': KELLY, 'reason': 'A long enough reason.'}),
        ('CloseAction', a, {'outcome': 'Completed', 'note': 'x'}), ('ReopenAction', a, {'reason': 'A long enough reason.'}),
        ('EditActionDetails', a, {'title': 'Changed'}),
        ('EditNotice', n, {'title': 'Changed', 'body': 'x'}), ('ArchiveNotice', n, {}), ('PinNotice', n, {'pinned': True}), ('HideComment', 1, {}),
        ('RaiseRegisterEntry', None, {'areaKey': 'FLK', 'entryType': 'Improvement', 'impact': 'Low', 'title': 'x', 'description': 'x', 'responsibleId': RACHEL}),
        ('UpdateRegisterEntry', e, {'status': 'Closed', 'outcome': 'x'}), ('LinkActionToEntry', e, {'actionId': a}), ('UnlinkActionFromEntry', e, {'actionId': a}),
        ('ScheduleMeeting', None, dict(tm.BOOKING)), ('UpdateMeeting', m, {'start': '09:00'}), ('CancelMeeting', m, {'reason': 'A long enough reason.'}),
        ('StartMeeting', m, {}), ('FinaliseMeeting', m, {}), ('AmendMeeting', m, {'what': 'A long enough change.', 'reason': 'A long enough reason.'}),
        ('RetryTransaction', 1, {}), ('CancelTransaction', 1, {}), ('RevertTransaction', 1, {}),
        ('AddPerson', None, {'email': 'new.person@example.test', 'role': 'Engineer', 'areas': {'FLK': True}}),
        ('UpdatePerson', 1, {'role': 'Team Leader', 'administrator': True}), ('PersonLeft', 1, {}), ('ReactivatePerson', 1, {}),
        ('UpdateSetting', None, {'name': 'DueSoonDays', 'value': '9'}),
        ('SetKnownAs', None, {'personId': RACHEL, 'knownAs': 'Rach'}),
        ('RemoveTestRecords', None, {'confirm': 'REMOVE TEST DATA', 'include': {}}),
    ]


def domain_of(t):
    return next((d for d, types in flows.DOMAIN_TYPES.items() if t in types), 'actions')


def business(s):
    return {k: json.dumps({i: it['f'] for i, it in s.by_key[k]['items'].items()}, sort_keys=True, default=str) for k in BUSINESS}


class Refusals(unittest.TestCase):
    def test_every_kind_of_request_from_someone_not_allowed_is_refused_and_changes_nothing(self):
        all_types = set(flows.ACTION_TYPES) | {t for types in flows.DOMAIN_TYPES.values() for t in types} | {'SetKnownAs'}
        covered = set()
        for t, target, payload in cases(site()):
            covered.add(t)
            with self.subTest(type=t):
                s = site()
                before = business(s)
                r = submit(s, OUT, t, payload, target=target, revision=1 if target else None, key='9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a')
                eng = Engine(FLOWS[FLOW_OF[domain_of(t)]], s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', r))
                eng.run()
                self.assertEqual(request(s, r)['Status'], 'Rejected', (request(s, r).get('ResultMessage'), eng.log))
                self.assertEqual(business(s), before)
        self.assertEqual(all_types - covered, set(), 'every kind of request is in the sweep')

    def test_a_badly_shaped_request_is_refused_not_failed(self):
        s = site()
        from test_flow import JOE
        r = submit(s, JOE, 'AddPerson', {'email': 'new.person@example.test', 'role': 'Engineer', 'areas': {'FLK': True}}, key='7d6c5b4a-3928-4170-8e5d-4c3b2a1f0e9d')
        s.tenant['new.person@example.test'] = 'New Person'
        eng = Engine(FLOWS[FLOW_OF['admin']], s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', r))
        eng.run()
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', 'Choose areas from the list.'), eng.log)

    def test_a_request_in_someone_elses_folder_is_refused_by_every_flow(self):
        for domain, t in (('actions', 'ChangeStatus'), ('records', 'ArchiveNotice'), ('meetings', 'StartMeeting'), ('minutes', 'FinaliseMeeting'),
                          ('admin', 'UpdateSetting'), ('cleanup', 'RemoveTestRecords')):
            with self.subTest(flow=domain):
                s = site()
                before = business(s)
                # Owen puts a request in Kelly's folder (she runs Flask's meetings)
                r = submit(s, KELLY, t, {}, target=s.mid, folder='u{0}'.format(KELLY), author=OUT, key='8e7d6c5b-4a39-4281-8f6e-5d4c3b2a1f0e')
                eng = Engine(FLOWS[FLOW_OF[domain]], s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', r))
                eng.run()
                self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', 'This request was not sent from your own request folder.'))
                self.assertEqual(business(s), before)


if __name__ == '__main__':
    unittest.main()
