"""ESG 1-to-1 – the SharePoint schema, defined once.

Everything the setup flow creates comes from here: lists, columns (as SharePoint field XML), indexes,
views, list settings and list permissions. tools/simulate.py proves this matches
01-sharepoint/lists.csv and the frontend's field lists, so the flow, the docs and the app cannot drift.

Field XML uses single-quoted attributes on purpose: the flow inserts it into a JSON request body.
"""
from xml.sax.saxutils import escape

FOLLOW = [
    'Everything has been covered — no further discussion required at present.',
    'Quick, informal catch-up in the field.',
    'Arrange a dedicated 1-to-1 discussion.',
]
REVIEW_STATUS = ['Not Started', 'Draft', 'Submitted', 'Completed', 'Closed - Not Submitted']
REVIEW_STATE = ['Open', 'Submitted', 'Completed', 'Closed - Not Submitted']
ACTIONS_STATUS = ['None', 'Open', 'Done']
YES_NO = ['Yes', 'No']
APPLIES_TO = ['Shared', 'Individual']
WB_STATUS = ['Open', 'Submitted', 'Completed']
FEEDBACK_TYPES = ['Fault', 'Improvement', 'Suggestion']
DELIVERY_STATUS = ['Pending', 'Sent', 'Failed', 'Read', 'Held']
DEFAULT_REMINDERS = '[20,27]'

DEFAULT_BANDS = ('[{"name":"Not met","max":1.5},{"name":"Partially met","max":2.25},'
                 '{"name":"Met","max":4},{"name":"Exceeded","max":null}]')


def _attrs(name, extra=''):
    return "Name='{0}' StaticName='{0}' DisplayName='{0}' Required='FALSE'{1}".format(name, extra)


def _flags(indexed=False, unique=False):
    s = ''
    if indexed or unique:
        s += " Indexed='TRUE'"
    if unique:
        s += " EnforceUniqueValues='TRUE'"
    return s


def text(name, indexed=False, unique=False):
    return {'name': name, 'kind': 'text', 'indexed': indexed or unique, 'unique': unique,
            'xml': "<Field Type='Text' {0} MaxLength='255' />".format(_attrs(name, _flags(indexed, unique)))}


def note(name):
    return {'name': name, 'kind': 'note', 'indexed': False, 'unique': False,
            'xml': "<Field Type='Note' {0} NumLines='6' RichText='FALSE' RichTextMode='Compatible' "
                   "AppendOnly='FALSE' IsolateStyles='FALSE' Sortable='FALSE' />".format(_attrs(name))}


def number(name, lo=None, hi=None, indexed=False, default=None):
    extra = " Decimals='0'" + _flags(indexed)
    if lo is not None:
        extra += " Min='{0}'".format(lo)
    if hi is not None:
        extra += " Max='{0}'".format(hi)
    inner = '<Default>{0}</Default>'.format(default) if default is not None else ''
    return {'name': name, 'kind': 'num', 'indexed': indexed, 'unique': False, 'min': lo, 'max': hi, 'default': default,
            'xml': "<Field Type='Number' {0}>{1}</Field>".format(_attrs(name, extra), inner)}


def choice(name, choices, default=None, indexed=False):
    inner = ''
    if default is not None:
        inner += '<Default>{0}</Default>'.format(escape(default))
    inner += '<CHOICES>' + ''.join('<CHOICE>{0}</CHOICE>'.format(escape(c)) for c in choices) + '</CHOICES>'
    return {'name': name, 'kind': 'choice', 'indexed': indexed, 'unique': False, 'choices': choices, 'default': default,
            'xml': "<Field Type='Choice' {0} Format='Dropdown' FillInChoice='FALSE'>{1}</Field>".format(
                _attrs(name, _flags(indexed)), inner)}


def date(name, with_time=False):
    fmt = 'DateTime' if with_time else 'DateOnly'
    return {'name': name, 'kind': 'datetime' if with_time else 'date', 'indexed': False, 'unique': False,
            'xml': "<Field Type='DateTime' {0} Format='{1}' FriendlyDisplayFormat='Disabled' />".format(
                _attrs(name), fmt)}


def yesno(name, default, indexed=False):
    return {'name': name, 'kind': 'bool', 'indexed': indexed, 'unique': False, 'default': default,
            'xml': "<Field Type='Boolean' {0}><Default>{1}</Default></Field>".format(
                _attrs(name, _flags(indexed)), '1' if default else '0')}


def person(name):
    return {'name': name, 'kind': 'person', 'indexed': False, 'unique': False,
            'xml': "<Field Type='User' {0} List='UserInfo' ShowField='ImnName' UserSelectionMode='PeopleOnly' "
                   "UserSelectionScope='0' Mult='FALSE' />".format(_attrs(name))}


def view(title, fields, query, row_limit=100):
    return {'title': title, 'fields': fields, 'query': query, 'rowLimit': row_limit}


def _eq_choice(field, value):
    return "<Eq><FieldRef Name='{0}'/><Value Type='Choice'>{1}</Value></Eq>".format(field, value)


def _eq_bool(field, value):
    return "<Eq><FieldRef Name='{0}'/><Value Type='Boolean'>{1}</Value></Eq>".format(field, value)


LISTS = [
    {
        'key': 'techs', 'url': 'Technicians', 'title': 'Technicians', 'groupRead': False,
        'description': 'ESG 1-to-1: technician roster (Team Leader only).',
        'fields': [
            person('Technician'),
            text('TechnicianAadId', indexed=True),
            yesno('Active', True, indexed=True),
            date('AppraisalDate'),
        ],
        'views': [],
    },
    {
        'key': 'exp', 'url': 'AppraisalExpectations', 'title': 'Appraisal Expectations', 'groupRead': False,
        'description': 'ESG 1-to-1: appraisal expectations, shared and individual (Team Leader only).',
        'fields': [
            note('Measures'),
            text('AppraisalYear'),
            choice('AppliesTo', APPLIES_TO, default='Shared'),
            person('Technician'),
            number('SortOrder', default=100),
            yesno('Active', True, indexed=True),
        ],
        'views': [
            view('Active', ['LinkTitle', 'AppliesTo', 'Technician', 'AppraisalYear', 'SortOrder'],
                 "<GroupBy Collapse='FALSE' GroupLimit='30'><FieldRef Name='AppliesTo'/></GroupBy>"
                 "<OrderBy><FieldRef Name='SortOrder'/></OrderBy><Where>" + _eq_bool('Active', 1) + "</Where>"),
            view('Needs attention', ['LinkTitle', 'AppliesTo', 'Technician', 'AppraisalYear'],
                 "<Where><And>" + _eq_choice('AppliesTo', 'Individual') +
                 "<IsNull><FieldRef Name='Technician'/></IsNull></And></Where>"),
            view('Retired', ['LinkTitle', 'AppliesTo', 'Technician', 'AppraisalYear'],
                 "<Where>" + _eq_bool('Active', 0) + "</Where>"),
        ],
    },
    {
        'key': 'reviews', 'url': 'MonthlyReviews', 'title': 'Monthly Reviews', 'groupRead': False,
        'description': "ESG 1-to-1: technicians' monthly answers. Item permissions are set by the flows.",
        'fields': [
            person('Technician'),
            text('MonthKey'),
            date('MonthStart'),
            date('DueDate', with_time=True),
            choice('ReviewStatus', REVIEW_STATUS, default='Not Started'),
            note('Q1WentWell'),
            note('Q2Issue'), note('Q2Impact'), note('Q2Tried'), note('Q2Support'),
            number('Q3WorkloadRating', 1, 5),
            note('Q3WorkloadComment'),
            choice('Q4WellbeingRaise', YES_NO), note('Q4WellbeingDetail'),
            choice('Q5PlanningRaise', YES_NO), note('Q5PlanningDetail'),
            choice('Q6DevRaise', YES_NO), note('Q6DevWhat'), note('Q6DevWhy'),
            note('Q7ManagerFeedback'),
            note('ExpectationsJson'),
            choice('Q9FollowUp', FOLLOW),
            number('Mood', 1, 5),
            note('WinOfMonth'),
            date('AppraisalDate'),
        ],
        'views': [],
    },
    {
        'key': 'mgr', 'url': 'ManagerReviews', 'title': 'Manager Reviews', 'groupRead': False,
        'description': 'ESG 1-to-1: the authoritative review record, Team Leader feedback and actions.',
        'fields': [
            text('ReviewKey', unique=True),
            number('ReviewItemId', indexed=True),
            person('Technician'),
            text('TechnicianAadId'),
            text('MonthKey', indexed=True),
            date('DueDate', with_time=True),
            choice('ReviewState', REVIEW_STATE, default='Open', indexed=True),
            date('LinkSentOn', with_time=True),
            date('SubmittedOn', with_time=True),
            yesno('SubmittedLate', False),
            text('TechFollowUp'),
            note('ExpectationSnapshotJson'),
            note('FB_Q1'), note('FB_Q2'), note('FB_Q3'), note('FB_Q4'), note('FB_Q5'), note('FB_Q6'), note('FB_Q7'),
            note('FB_Q9'),
            note('FB_Overall'),
            note('ExpectationFeedbackJson'),
            choice('FollowUpDecision', FOLLOW),
            date('MeetingDate'),
            note('ActionsJson'),
            choice('ActionsStatus', ACTIONS_STATUS, default='None', indexed=True),
            date('NextActionDue'),
            date('CompletedOn', with_time=True),
            text('CompletedBy'),
            date('ReleasedOn', with_time=True),
            note('CorrectionLog'),
        ],
        'views': [
            view('Overdue', ['LinkTitle', 'Technician', 'MonthKey', 'DueDate', 'ReviewState'],
                 "<OrderBy><FieldRef Name='DueDate'/></OrderBy><Where><And>" + _eq_choice('ReviewState', 'Open') +
                 "<Lt><FieldRef Name='DueDate'/><Value Type='DateTime'><Today/></Value></Lt></And></Where>"),
            view('Open actions', ['LinkTitle', 'Technician', 'MonthKey', 'ActionsStatus', 'NextActionDue'],
                 "<OrderBy><FieldRef Name='NextActionDue'/></OrderBy><Where>" + _eq_choice('ActionsStatus', 'Open') +
                 "</Where>"),
        ],
    },
    {
        'key': 'wellbeing', 'url': 'WellbeingAssessments', 'title': 'Wellbeing Assessments', 'groupRead': False,
        'description': 'ESG 1-to-1: wellbeing assessments. Each item is visible only to the line manager and that person (Flow 5).',
        'fields': [
            person('Technician'),
            choice('AssessmentStatus', WB_STATUS, default='Open', indexed=True),
            date('AssessmentDate'),
            text('Position'),
            text('EmployeeNumber'),
            note('AnswersJson'),
            note('PersonalJson'),
            note('ArrangementsJson'),
            note('ManagerNotes'),
            date('NextReviewDate'),
            date('SubmittedOn', with_time=True),
            date('CompletedOn', with_time=True),
        ],
        'views': [
            view('Reviews due', ['LinkTitle', 'Technician', 'AssessmentStatus', 'CompletedOn', 'NextReviewDate'],
                 "<OrderBy><FieldRef Name='NextReviewDate'/></OrderBy><Where>" + _eq_choice('AssessmentStatus', 'Completed') + "</Where>"),
        ],
    },
    {
        # Anyone in the group may add an item (Contribute) but, with item-level security, sees and edits only their own;
        # Flow 6 then makes each item Owners-only and emails the line manager.
        'key': 'feedback', 'url': 'OneToOneFeedback', 'title': '1-to-1 Feedback', 'groupRead': False,
        'groupContribute': True, 'readSecurity': 2, 'writeSecurity': 2,
        'description': 'ESG 1-to-1: faults and suggestions sent from the page. Each person sees only their own until Flow 6 emails it and makes it Owners-only.',
        'fields': [
            choice('FeedbackType', FEEDBACK_TYPES, default='Suggestion'),
            note('Message'),
            text('PageName'),
            text('AppVersion'),
            choice('DeliveryStatus', DELIVERY_STATUS, default='Pending'),
            date('SentOn', with_time=True),
        ],
        'views': [],
    },
    {
        'key': 'settings', 'url': 'OneToOneSettings', 'title': '1-to-1 Settings', 'groupRead': True,
        'description': 'ESG 1-to-1: bands, reminder days and on-screen names (no personal data). Technicians group: Read.',
        'fields': [note('Value')],
        'views': [],
    },
]

# Indexes are declared in the field XML (Indexed='TRUE'); the flow re-applies them to columns that already
# existed, so a list built by hand gets them too.
GROUP_TITLE = '1-to-1 Technicians'
GROUP_DESCRIPTION = 'ESG 1-to-1 technicians. Read on the 1-to-1 page, the layouts library, the Welcome Errors list and 1-to-1 Settings only.'

# Permission levels: copies of Contribute / Read with the plan's unticks (plan D.3, G Part 2).
# SPBasePermissions bits. Contribute = High 432 / Low 1011028719, Read = High 176 / Low 138612833.
_LOW = {'AddListItems': 0x2, 'DeleteListItems': 0x8, 'ViewVersions': 0x40, 'DeleteVersions': 0x80,
        'ManagePersonalViews': 0x200, 'AddDelPrivateWebParts': 0x10000000, 'UpdatePersonalWebParts': 0x20000000}
_HIGH = {'CreateAlerts': 0x80}
CONTRIBUTE = (432, 1011028719)
READ = (176, 138612833)
EDIT_LOW = CONTRIBUTE[1]
for _k in ['AddListItems', 'DeleteListItems', 'DeleteVersions', 'ManagePersonalViews', 'AddDelPrivateWebParts',
           'UpdatePersonalWebParts']:
    EDIT_LOW &= ~_LOW[_k]
EDIT_HIGH = CONTRIBUTE[0]
READ1_LOW = READ[1] & ~_LOW['ViewVersions']
READ1_HIGH = READ[0] & ~_HIGH['CreateAlerts']
# Feedback list only: add (and edit their own item until Flow 6 locks it) – no delete, no versions, no alerts (an alert
# could email someone else's new item before it is locked), no personal views or web parts.
SUBMIT_LOW = CONTRIBUTE[1]
for _k in ['DeleteListItems', 'ViewVersions', 'DeleteVersions', 'ManagePersonalViews', 'AddDelPrivateWebParts', 'UpdatePersonalWebParts']:
    SUBMIT_LOW &= ~_LOW[_k]
SUBMIT_HIGH = CONTRIBUTE[0] & ~_HIGH['CreateAlerts']

ROLES = [
    {'name': '1-to-1 Edit', 'high': EDIT_HIGH, 'low': EDIT_LOW, 'order': 200,
     'description': "ESG 1-to-1: technician on their own open review. Copy of Contribute without add, delete, "
                    "delete versions or personal views/web parts."},
    {'name': '1-to-1 Read', 'high': READ1_HIGH, 'low': READ1_LOW, 'order': 201,
     'description': "ESG 1-to-1: technician on a submitted or released review. Copy of Read without View Versions "
                    "or Create Alerts."},
    {'name': '1-to-1 Submit', 'high': SUBMIT_HIGH, 'low': SUBMIT_LOW, 'order': 202,
     'description': "ESG 1-to-1: the technicians group on the Feedback list only. Copy of Contribute without delete, "
                    "versions, alerts or personal views/web parts."},
]
