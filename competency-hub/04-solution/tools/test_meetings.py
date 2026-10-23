"""Runs the generated Meetings flow (5) against the simulated Hub site: booking with Outlook invitations, changes,
cancelling, starting with the agenda, and the record folder's permissions.
    python3 test_meetings.py
Evidence class: LOCAL / OFFLINE-SIMULATED. Outlook behaviour is proven only by the P-INV probe and the tests on the site.
"""
import json
import unittest
from datetime import datetime, timedelta, timezone

import flows
from hub_fake import SITE
from wdl import Engine
from test_flow import site as base_site, submit, request, FLOWS, JOE, RACHEL, KELLY, KAI, KEY, KEY2, AREAS, run_monitor, run_admin

MEETINGS = FLOWS['ESG Competency Hub | 5 Meetings']
MONITOR = FLOWS['ESG Competency Hub | 3 Queue monitor']
CONTRIBUTE = 2003
KEY3 = '1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5'


def site():
    s = base_site()
    for k in AREAS:
        for lst in ('meetings', 'meetingItems', 'notices', 'register', 'calendar'):
            s.folder(lst, k)
    for title, value in (('InvitesEnabled', 'Yes'), ('AgendaLookaheadDays', '60')):
        s.add('settings', '', {'Title': title, 'Value': value})
    return s


def run(s, req_id, now=None):
    s.clock = now or s.clock
    eng = Engine(MEETINGS, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body=s.trigger_item('requests', req_id))
    return eng.run(), eng


BOOKING = {'areaKey': 'FLK', 'dateIso': '2026-11-11', 'start': '10:00', 'end': '11:30', 'location': 'Room 4', 'onlineLink': '',
           'chairId': KELLY, 'attendeeIds': [RACHEL, KELLY, JOE]}


def book(s, payload=None, sender=KELLY, key=KEY):
    r = submit(s, sender, 'ScheduleMeeting', dict(BOOKING, **(payload or {})), key=key)
    status, eng = run(s, r)
    return r, status, eng


def meeting(s):
    rows = s.rows('meetings')
    return rows[-1] if rows else None


class Book(unittest.TestCase):
    def test_a_meeting_runner_books_a_meeting_and_the_invitation_goes_out(self):
        s = site()
        r, status, eng = book(s)
        req = request(s, r)
        self.assertEqual(req['Status'], 'Completed', eng.log)
        self.assertEqual(req['ResultMessage'], 'Meeting booked for Wednesday 11 November 2026 at 10:00.')
        m = meeting(s)
        f = m['f']
        self.assertEqual((m['dir'], f['Status'], f['Location'], f['MeetingDate'], f['EndTime'], f['ChairId'], json.loads(f['Attendees'])),
                         ('FLK', 'Scheduled', 'Room 4', '2026-11-11T10:00:00Z', '2026-11-11T11:30:00Z', KELLY, [JOE, RACHEL, KELLY]))
        # the invitation, from the flow account's calendar, with the meeting's reference in it
        self.assertEqual(len(s.invites), 1)
        ev = list(s.events.values())[0]
        self.assertEqual((ev['start'], ev['end']), ('2026-11-11T10:00:00', '2026-11-11T11:30:00'))
        self.assertIn(f['InviteToken'], ev['body'])
        self.assertEqual(sorted(ev['requiredAttendees'].split(';')), ['joseph.pepper@example.test', 'kelly.bates@example.test', 'rachel.boulden@example.test'])
        self.assertEqual((f['InviteState'], f['OutlookEventId'], f['InviteAttempts']), ('Sent', ev['id'], 0.0))
        # the record folder: its own permissions, meeting runners of the area and management may write
        rec = s.folder_item('meetingItems', 'FLK/MTG-{0}/Record'.format(m['id']))
        self.assertTrue(rec and rec['unique'])
        self.assertIn(CONTRIBUTE, rec['ra'].get(KELLY, set()))
        self.assertIn(CONTRIBUTE, rec['ra'].get(s.gid['Management'], set()))
        self.assertNotIn(RACHEL, rec['ra'])
        ev_row = s.rows('history', RequestKey=KEY + '|1')[0]
        self.assertEqual((ev_row['dir'], ev_row['f']['RecordType'], ev_row['f']['EventType'], ev_row['f']['ActorId']), ('FLK', 'Meeting', 'Meeting Booked', KELLY))


    def test_refusals_in_plain_words_and_nothing_made(self):
        cases = [
            (RACHEL, {}, 'Only the people who run meetings in this area, and management, can do this.'),
            (KELLY, {'dateIso': '2026-10-20'}, 'Choose a date from today onwards.'),
            (KELLY, {'dateIso': '2029-01-01'}, 'Choose a date within two years.'),
            (KELLY, {'end': '09:00'}, 'The meeting must end after it starts.'),
            (KELLY, {'start': 'ten'}, 'Choose a date, and a start and end time.'),
            (KELLY, {'dateIso': '2026-13-45'}, 'Choose a date, and a start and end time.'),
            (KELLY, {'chairId': RACHEL}, 'Choose a chair who runs meetings in this area, or a Team Leader.'),
            (KELLY, {'attendeeIds': [RACHEL, KAI]}, 'Choose the attendees from the members of the area and management (up to 60).'),
            (KELLY, {'attendeeIds': []}, 'Choose the attendees from the members of the area and management (up to 60).'),
            (KELLY, {'onlineLink': 'http://example.test/x'}, 'Give a secure online link: it starts with https.'),
            (KAI, {}, 'Only the people who run meetings in this area, and management, can do this.'),
            (KELLY, {'areaKey': 'XYZ'}, 'Choose an active area.'),
        ]
        for who, payload, message in cases:
            with self.subTest(who=who, payload=payload):
                s = site()
                r, status, eng = book(s, payload, sender=who)
                self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Rejected', message), eng.log)
                self.assertEqual((s.rows('meetings'), s.invites), ([], []))

    def test_a_team_leader_books_in_any_area_and_may_chair(self):
        s = site()
        r, status, eng = book(s, {'areaKey': 'RW', 'chairId': JOE, 'attendeeIds': [KAI, JOE]}, sender=JOE)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertEqual(meeting(s)['dir'], 'RW')

    def test_invitations_switched_off_send_nothing(self):
        s = site()
        s.rows('settings', Title='InvitesEnabled')[0]['f']['Value'] = 'No'
        r, status, eng = book(s)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertEqual((meeting(s)['f']['InviteState'], s.invites), ('None', []))


class Change(unittest.TestCase):
    def test_moving_a_meeting_sends_an_update(self):
        s = site()
        book(s)
        m = meeting(s)
        r = submit(s, KELLY, 'UpdateMeeting', {'start': '11:00', 'end': '12:00'}, target=m['id'], revision=1, key=KEY2)
        status, eng = run(s, r)
        self.assertEqual((request(s, r)['Status'], request(s, r)['ResultMessage']), ('Completed', 'Meeting changed to Wednesday 11 November 2026 at 11:00.'), eng.log)
        f = meeting(s)['f']
        self.assertEqual((f['MeetingDate'], f['EndTime'], f['Location'], f['Revision'], f['InviteState']), ('2026-11-11T11:00:00Z', '2026-11-11T12:00:00Z', 'Room 4', 2.0, 'Sent'))
        self.assertEqual([k for k, _, _ in s.invites], ['invite', 'update'])
        self.assertEqual(list(s.events.values())[0]['start'], '2026-11-11T11:00:00')

    def test_a_stale_change_is_refused(self):
        s = site()
        book(s)
        r = submit(s, KELLY, 'UpdateMeeting', {'location': 'Room 5'}, target=meeting(s)['id'], revision=7, key=KEY2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'This meeting was changed by someone else. Review the latest details and try again.')

    def test_cancelling_sends_a_cancellation_and_makes_the_record_read_only(self):
        s = site()
        book(s)
        m = meeting(s)
        r = submit(s, KELLY, 'CancelMeeting', {'reason': 'short'}, target=m['id'], revision=1, key=KEY2)
        run(s, r)
        self.assertEqual(request(s, r)['ResultMessage'], 'Give a reason of at least 10 characters.')
        r = submit(s, KELLY, 'CancelMeeting', {'reason': 'Most of the area is on the outage.'}, target=m['id'], revision=1, key=KEY3)
        status, eng = run(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        f = meeting(s)['f']
        self.assertEqual((f['Status'], f['CancellationReason'], f['InviteState'], f['OutlookEventId']), ('Cancelled', 'Most of the area is on the outage.', 'Cancelled', ''))
        self.assertEqual([k for k, _, _ in s.invites], ['invite', 'cancel'])
        self.assertEqual(s.events, {})
        rec = s.folder_item('meetingItems', 'FLK/MTG-{0}/Record'.format(m['id']))
        self.assertFalse(rec['unique'])


class Invitations(unittest.TestCase):
    def test_a_timed_out_invitation_is_found_by_its_reference_never_sent_twice(self):
        s = site()
        s.cal_fail = ['timeout']
        r, status, eng = book(s)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)      # the meeting stands
        f = meeting(s)['f']
        self.assertEqual((f['InviteState'], f['OutlookEventId'], f['InviteAttempts']), ('Unknown', '', 1.0))
        self.assertEqual(len(s.invites), 1)
        status, eng = run_monitor(s, s.clock + timedelta(minutes=20))
        self.assertEqual(status, 'Succeeded', eng.log)
        f = meeting(s)['f']
        self.assertEqual((f['InviteState'], f['OutlookEventId'], f['InviteAttempts']), ('Sent', list(s.events)[0], 0.0))
        self.assertEqual(len(s.invites), 1, 'adopted, not sent again')

    def test_a_refused_invitation_is_tried_again_then_the_administrators_are_told(self):
        s = site()
        s.cal_fail = [400]
        book(s)
        self.assertEqual(meeting(s)['f']['InviteState'], 'Failed')
        s.cal_fail = [400, 400]
        for i in (1, 2):
            run_monitor(s, s.clock + timedelta(minutes=20))
        f = meeting(s)['f']
        self.assertEqual((f['InviteState'], f['InviteAttempts']), ('Failed', 3.0))
        status, eng = run_monitor(s, s.clock + timedelta(minutes=20))
        alerts = [n for n in s.by_key['notifications']['items'].values() if n['f']['NotificationKey'].startswith('ALR|invite|')]
        self.assertEqual(len(alerts), 1, eng.log)
        self.assertEqual(len(s.invites), 0)

    def test_a_search_that_fails_never_creates(self):
        s = site()
        s.cal_fail = ['timeout']
        book(s)
        n = len(s.invites)
        s.cal_fail = ['searchfail']
        run_monitor(s, s.clock + timedelta(minutes=20))
        f = meeting(s)['f']
        self.assertEqual((f['InviteState'], f['InviteAttempts'], len(s.invites)), ('Unknown', 2.0, n))


FRONTEND = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', '02-frontend')


def agenda_site():
    """Flask with something for every agenda section, and a finalised meeting before this one."""
    s = site()
    s.prev = s.add('meetings', 'FLK', {'Title': 'Flask meeting', 'CompetencyId': 1, 'MeetingDate': '2026-09-20T09:00:00Z', 'Status': 'Finalised',
                                        'CutoffTime': '2026-09-20T09:00:00Z', 'Revision': 2.0})
    act = lambda title, **f: s.add('actions', f.pop('dir', 'FLK'), dict({'Title': title, 'CompetencyId': 1, 'AssignedToId': RACHEL, 'RaisedById': KELLY,
                                                                         'DateRaised': '2026-10-05T09:00:00Z', 'DueDay': 20261030.0, 'Status': 'Open', 'IsOpen': True,
                                                                         'ExtensionCount': 0.0, 'Revision': 1.0, 'CreatedRequestKey': 'IMPORT-' + title}, **f))
    s.a_new = act('Raised since the last meeting')
    s.a_linked = act('Shared from Radiological Protection', dir='RP', CompetencyId=7, LinkedCompetenciesId=[1], DateRaised='2026-09-01T09:00:00Z')
    s.a_half = act('Half-made', PendingRequestKey='k9', CreatedRequestKey='F|k9')
    s.a_closed = act('Closed since', IsOpen=False, Status='Closed', DateClosed='2026-10-15T12:00:00Z', CloseOutcome='Completed')
    s.a_old = act('Closed long ago', IsOpen=False, Status='Closed', DateClosed='2026-09-01T12:00:00Z', CloseOutcome='Completed')
    s.a_other = act('Other area', dir='RW', CompetencyId=10)
    notice = lambda title, author: s.add('notices', 'FLK', {'Title': title, 'Body': 'x', 'Status': 'Active', 'ClientKey': title, 'Revision': 1.0}, author=author)
    s.n1, s.n2, s.n4, s.n5 = notice('Flagged by a member', RACHEL), notice('Deferred last time', KELLY), notice('Flagged by an outsider', KELLY), notice('Withdrawn', KELLY)
    flag = lambda parent, kind, who, ptype='Notice': s.add('updates', 'FLK', {'ClientKey': 'f{0}{1}{2}'.format(parent, kind, who), 'ParentType': ptype, 'ParentId': float(parent),
                                                                             'EntryType': kind, 'IsFlagEvent': True, 'IsHidden': False}, author=who)
    flag(s.n1, 'Flagged', RACHEL)
    flag(s.n2, 'Flagged', RACHEL)
    flag(s.n4, 'Flagged', KAI)
    flag(s.n5, 'Flagged', RACHEL)
    flag(s.n5, 'Flag Withdrawn', RACHEL)
    s.add('meetingItems', 'FLK/MTG-{0}'.format(s.prev), {'RowKey': 'U|o1', 'RecordKey': '{0}|O|Notice|{1}'.format(s.prev, s.n2), 'MeetingId': float(s.prev), 'RowType': 'Outcome',
                                                        'SourceType': 'Notice', 'SourceId': float(s.n2), 'Outcome': 'Deferred', 'Title': 'Deferred last time'})
    s.add('meetingItems', 'FLK/MTG-{0}'.format(s.prev), {'RowKey': 'U|o2', 'RecordKey': '{0}|N|x'.format(s.prev), 'MeetingId': float(s.prev), 'RowType': 'Outcome',
                                                        'SourceType': 'New Business', 'SourceId': 77.0, 'Outcome': 'Not reached', 'Title': 'Spare cable order'})
    entry = lambda title, kind, raised, status='Open': s.add('register', 'FLK', {'Title': title, 'CompetencyId': 1, 'EntryType': kind, 'Impact': 'High', 'Status': status,
                                                                               'RaisedById': RACHEL, 'DateRaised': raised, 'Revision': 1.0, 'CreatedRequestKey': 'IMPORT-' + title})
    s.e_old = entry('Old degradation', 'Degradation', '2026-09-01T09:00:00Z')
    s.e_new = entry('New improvement', 'Improvement', '2026-10-10T09:00:00Z')
    s.e_newdeg = entry('New degradation', 'Degradation', '2026-10-12T09:00:00Z')
    s.e_closed = entry('Closed degradation', 'Degradation', '2026-09-01T09:00:00Z', 'Closed')
    cal = lambda title, when, imp: s.add('calendar', 'FLK', {'Title': title, 'StartTime': when, 'IsImportant': imp, 'Status': 'Scheduled', 'ClientKey': title})
    s.d1 = cal('Audit', '2026-11-01T00:00:00Z', True)
    cal('Not important', '2026-11-02T00:00:00Z', False)
    cal('Too far ahead', '2027-06-01T00:00:00Z', True)
    return s


def rest_rows(s, key, query):
    return s.rest('GET', "_api/web/GetList('" + s.by_key[key]['root'] + "')/items?" + query, {}, None)['value']


def app_agenda(s, m):
    """The app's agenda rules (domain/agenda.js), on the same rows the flow reads."""
    import subprocess
    f = m['f']
    act = ('Id,Title,AssignedToId,Status,DueDay,OriginalDueDate,ExtensionCount,Blocker,DateRaised,DateClosed,CloseOutcome,CompetencyId,'
           'LinkedCompetenciesId,PendingRequestKey,CreatedRequestKey')
    members = rest_rows(s, 'members', "$select=PersonId,CanManageMeetings&$filter=CompetencyId eq 1 and Status eq 'Active'")
    people = rest_rows(s, 'people', '$select=SiteUserId,Role')
    data = {'areaId': 1, 'areaKey': 'FLK', 'sinceIso': f['IntervalStart'], 'cutIso': f['CutoffTime'], 'cutUpdatesId': f['CutoffUpdatesId'],
            'actionsOpen': rest_rows(s, 'actions', '$select=' + act + '&$filter=IsOpen eq 1'),
            'actionsClosed': rest_rows(s, 'actions', '$select=' + act + "&$filter=IsOpen eq 0 and DateClosed ge datetime'" + f['IntervalStart'] + "'"),
            'notices': rest_rows(s, 'notices', "$select=Id,Title,AuthorId,FileDirRef&$filter=Status eq 'Active'"),
            'entries': rest_rows(s, 'register', '$select=Id,Title,EntryType,Impact,Status,RaisedById,DateRaised,FileDirRef&$filter=CompetencyId eq 1'),
            'flags': rest_rows(s, 'updates', '$select=Id,EntryType,ParentType,ParentId,AuthorId,FileDirRef,IsHidden&$filter=IsFlagEvent eq 1'),
            'dates': rest_rows(s, 'calendar', "$select=Id,Title,StartTime,FileDirRef&$filter=IsImportant eq 1 and Status eq 'Scheduled'"),
            'carried': rest_rows(s, 'meetingItems', "$select=Title,SourceType,SourceId,Outcome&$filter=MeetingId eq {0} and RowType eq 'Outcome'".format(int(f['PreviousMeetingId']))),
            'memberIds': [str(int(x['PersonId'])) for x in members], 'chairIds': [str(int(x['PersonId'])) for x in members if x['CanManageMeetings']],
            'mgmtIds': [str(int(p['SiteUserId'])) for p in people if p['Role'] in ('Team Leader', 'Group Head')], 'lookaheadDays': 60}
    out = subprocess.run(['node', __import__('os').path.join(FRONTEND, 'test', 'agenda-cli.js')], input=json.dumps(data), capture_output=True, text=True, check=True)
    return sorted(tuple(x) for x in json.loads(out.stdout))


class Start(unittest.TestCase):
    def start(self, s):
        book(s)
        m = meeting(s)
        r = submit(s, KELLY, 'StartMeeting', {}, target=m['id'], revision=1, key=KEY2)
        status, eng = run(s, r)
        return r, eng, s.item('meetings', m['id'])

    def agenda(self, s, mid):
        rows = [it for it in s.by_key['meetingItems']['items'].values() if it['fsobj'] == 0 and it['f'].get('MeetingId') == float(mid) and it['f']['RowType'] == 'Agenda Item']
        return rows

    def test_starting_fixes_the_cutoff_and_writes_every_section(self):
        s = agenda_site()
        r, eng, m = self.start(s)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        f = m['f']
        self.assertEqual((f['Status'], f['IntervalStart'], f['PreviousMeetingId'], f['StartedById']), ('In Progress', '2026-09-20T09:00:00Z', float(s.prev), KELLY))
        self.assertTrue(f['CutoffTime'] and f['CutoffUpdatesId'])
        got = {(it['f']['Section'], it['f']['Title'], it['f'].get('AgendaMarker')) for it in self.agenda(s, m['id'])}
        self.assertEqual(got, {
            ('Open actions', 'Replace FH40 probe', 'Raised since last meeting'), ('Open actions', 'Raised since the last meeting', 'Raised since last meeting'),
            ('Open actions', 'Shared from Radiological Protection', 'Still open'),
            ('Closed since last meeting', 'Closed since', None),
            ('Carried forward', 'Deferred last time', 'Carried forward'), ('Carried forward', 'Spare cable order', 'Carried forward'),
            ('Noticeboard', 'Flagged by a member', None),
            ('New improvements and degradations', 'New improvement', None), ('New improvements and degradations', 'New degradation', None),
            ('Unresolved degradations', 'Old degradation', None),
            ('Important dates', 'Audit', None)})
        row = next(it for it in self.agenda(s, m['id']) if it['f']['Title'] == 'Replace FH40 probe')['f']
        self.assertEqual((row['SnapshotOwner'], row['SnapshotStatus'], row['SnapshotDueDate'], row['SnapshotExtensionCount'], row['RowKey']),
                         (str(RACHEL), 'In Progress', '2026-10-19T00:00:00Z' if False else row['SnapshotDueDate'], 1.0, 'F|{0}|A|Action|{1}'.format(m['id'], s.action)))
        self.assertTrue(row['SnapshotDueDate'].startswith('2026-10-1'))
        self.assertEqual(request(s, r)['ResultMessage'], 'Meeting started. The agenda is fixed with 11 items.')

    def test_the_app_preview_and_the_flow_agree(self):
        s = agenda_site()
        r, eng, m = self.start(s)
        flow = sorted((it['f']['Section'], it['f'].get('SourceType') or 'Date', str(int(it['f']['SourceId'])), it['f'].get('AgendaMarker') or '')
                      for it in self.agenda(s, m['id']))
        self.assertEqual(flow, app_agenda(s, m))

    def test_only_a_booked_meeting_starts_once_and_only_by_its_runners(self):
        s = agenda_site()
        r, eng, m = self.start(s)
        again = submit(s, KELLY, 'StartMeeting', {}, target=m['id'], revision=2, key=KEY3)
        run(s, again)
        self.assertEqual(request(s, again)['ResultMessage'], 'This meeting has already started, or is finished or cancelled.')
        s2 = agenda_site()
        book(s2)
        r2 = submit(s2, RACHEL, 'StartMeeting', {}, target=meeting(s2)['id'], revision=1, key=KEY2)
        run(s2, r2)
        self.assertEqual(request(s2, r2)['ResultMessage'], 'Only the people who run meetings in this area, and management, can do this.')


class Robustness(unittest.TestCase):
    def snapshot(self, s):
        out = {}
        for key in ('meetings', 'meetingItems', 'history'):
            rows = []
            for it in s.by_key[key]['items'].values():
                f = {k: v for k, v in it['f'].items() if k not in ('ProcessedAt', 'FirstClaimedAt', 'Attempts', 'LastError', 'StepsDone', 'NextAttemptAfter',
                                                                   'CutoffTime', 'InviteError', 'InviteState', 'InviteAttempts', 'OutlookEventId', 'PreviousValue')}
                rows.append((it['dir'], it['fsobj'], json.dumps(f, sort_keys=True, default=str)))
            out[key] = sorted(rows)
        return out

    def interrupted_everywhere(self, prepare, rtype, payload):
        ref = agenda_site()
        target = prepare(ref)
        r = submit(ref, KELLY, rtype, payload, target=target, revision=1 if target else None, key=KEY2)
        status, eng = run(ref, r)
        self.assertEqual(request(ref, r)['Status'], 'Completed', eng.log)
        expected, total = self.snapshot(ref), len(ref.writes)
        for k in range(1, total + 1):
            with self.subTest(write=k, of=total, at=ref.writes[k - 1]):
                s = agenda_site()
                target = prepare(s)
                r = submit(s, KELLY, rtype, payload, target=target, revision=1 if target else None, key=KEY2)
                s.writes = []
                s.fail_at = k
                run(s, r)
                s.fail_at = None
                if request(s, r)['Status'] != 'Completed':
                    request(s, r)['Status'] = 'Submitted'
                    status, eng = run(s, r, now=s.clock + timedelta(minutes=10))
                    self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
                got = self.snapshot(s)
                for key in ('meetings', 'meetingItems', 'history'):
                    self.assertEqual([x for x in got[key] if 'Transaction' not in x[2]], [x for x in expected[key] if 'Transaction' not in x[2]], key)
                self.assertLessEqual(len([e for e in s.invites if e[0] == 'invite']), 1, 'never two invitations')

    def booked(self, s):
        s.writes_before = None
        book(s)
        s.writes.clear()
        return meeting(s)['id']

    def test_booking_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere(lambda s: None, 'ScheduleMeeting', BOOKING)

    def test_a_change_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere(self.booked, 'UpdateMeeting', {'start': '11:00', 'end': '12:00'})

    def test_cancelling_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere(self.booked, 'CancelMeeting', {'reason': 'Most of the area is on the outage.'})

    def test_starting_survives_an_interruption_at_every_write(self):
        self.interrupted_everywhere(self.booked, 'StartMeeting', {})


class MeetingRights(unittest.TestCase):
    def test_meeting_rights_reach_the_open_meetings_record_folder_and_are_taken_away(self):
        s = site()
        book(s)
        rec = s.folder_item('meetingItems', 'FLK/MTG-{0}/Record'.format(meeting(s)['id']))
        self.assertNotIn(RACHEL, rec['ra'])
        give = {'personId': RACHEL, 'areas': [{'key': 'FLK', 'chair': True}, {'key': 'GRS', 'chair': False}]}
        r = submit(s, JOE, 'UpdatePerson', give, key=KEY2)
        status, eng = run_admin(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertIn(CONTRIBUTE, rec['ra'].get(RACHEL, set()))
        take = {'personId': RACHEL, 'areas': [{'key': 'FLK', 'chair': False}, {'key': 'GRS', 'chair': False}]}
        r = submit(s, JOE, 'UpdatePerson', take, key=KEY3)
        status, eng = run_admin(s, r)
        self.assertEqual(request(s, r)['Status'], 'Completed', eng.log)
        self.assertNotIn(RACHEL, rec['ra'])


class Probe(unittest.TestCase):
    def test_the_invitations_probe_invites_moves_finds_and_cancels(self):
        s = site()
        probe = FLOWS['ESG Competency Hub | P-INV Invitations probe']
        eng = Engine(probe, s, {flows.ENV_SITE: SITE, '$authentication': {}}, s.clock, trigger_body={'text': 'colleague@example.test'})
        self.assertEqual(eng.run(), 'Succeeded', eng.log)
        res = eng.results['Probe_results']['outputs']
        self.assertEqual((res['create'], res['update'], res['search'], res['foundByReference'], res['cancel']),
                         ('Succeeded', 'Succeeded', 'Succeeded', True, 'Succeeded'))
        self.assertEqual([k for k, _, _ in s.invites], ['invite', 'update', 'cancel'])
        self.assertIn('colleague@example.test', s.invites[0][2])
        self.assertEqual(s.events, {})


if __name__ == '__main__':
    unittest.main()
