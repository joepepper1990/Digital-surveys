// ESG 1-to-1 – LOCAL MOCK of the SharePoint parts the frontend uses. For testing only; never uploaded.
//
// Emulates, in the browser, with entirely fictional people and data:
//   * Welcome's ctx.getWebPart() → { spHttpClient, pageContext.web.absoluteUrl }
//   * the REST endpoints one-to-one.js calls (nometadata JSON shapes)
//   * security trimming and item-level permissions exactly as IMPLEMENTATION_PLAN D.4 describes
//     (technician: EDIT own open Monthly Review, READ own locked review and own RELEASED Manager Review,
//      READ the 1-to-1 Settings list, nothing else; Team Leader: everything)
//   * field validation for validateUpdateListItem (choices, numbers, dd/MM/yyyy dates, yes/no, people)
//   * the observable effects of Flow 2 (submit → lock + stamp; a Team Leader amendment is not a submission),
//     Flow 3 (complete/close → release, and from 1.5 the agreed actions added to the tracker), Flow 8 (amendment → email the
//     technician, or Failed), Flow 9 (each action shared with its technician, their update folder), Flow 10 (a technician's
//     update checked and recorded, then locked) and Flow 11 (action emails: Sent / Failed / delivery unknown)
//   * etags (412 on a stale IF-MATCH), REST MERGE, unique columns, folders and folder permissions
// State persists in sessionStorage so you can switch user (TL ↔ Test A ↔ Test B) and carry on.
(function () {
  'use strict';
  var KEY = 'oto-mock-db-v9';
  var SITE = 'https://contoso.example/sites/esg-1to1';
  var TZ = 'Europe/London';

  var FOLLOW = [
    'Everything has been covered — no further discussion required at present.',
    'Quick, informal catch-up in the field.',
    'Arrange a dedicated 1-to-1 discussion.'
  ];
  var CHOICES = {
    ReviewStatus: ['Not Started', 'Draft', 'Submitted', 'Completed', 'Closed - Not Submitted'],
    ReviewState: ['Open', 'Submitted', 'Completed', 'Closed - Not Submitted'],
    YesNo: ['Yes', 'No'],
    Follow: FOLLOW,
    AppliesTo: ['Shared', 'Individual'],
    ActionsStatus: ['None', 'Open', 'Done'],
    WbStatus: ['Open', 'Submitted', 'Completed'],
    FbType: ['Fault', 'Improvement', 'Suggestion'],
    FbStatus: ['Pending', 'Sent', 'Failed', 'Read', 'Held'],
    Notify: ['Draft', 'Pending', 'Sending', 'Sent', 'Failed', 'Retry', 'Cancelled'],
    ActStatus: ['Open', 'In progress', 'Waiting', 'Ready for close-out', 'Closed'],
    Owner: ['Technician', 'Team Leader'],
    UpdKind: ['progress', 'waiting', 'followup', 'closeRequest'],
    Outcome: ['Satisfactory', 'Support', 'Ready'],
    Process: ['Pending', 'Processing', 'Applied', 'Rejected'],
    NoticeKind: ['E19', 'E20'],
    NoticeStatus: ['Pending', 'Sending', 'Sent', 'Failed', 'Retry', 'Cancelled']
  };
  // ?locale=uk (default) | us | uk-noiso | us-noiso – how this pretend SharePoint reads typed dates
  var LOCALE = (function () { try { return new URL(window.location.href).searchParams.get('locale') || 'uk'; } catch (_) { return 'uk'; } })();
  // field schemas: t = text | note | num | choice | date | datetime | bool | person
  function F(t, extra) { var f = { t: t }; Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; }); return f; }
  var SCHEMA = {
    'Technicians': { Title: F('text'), Technician: F('person'), TechnicianAadId: F('text'), Active: F('bool'), AppraisalDate: F('date'),
      NextWellbeingDate: F('date', { v14: true }), AppraisalCycleStart: F('date', { v14: true }), AppraisalHistoryJson: F('note', { v14: true }), AppraisalBoundaries: F('note', { v14: true }) },
    'Appraisal Expectations': { Title: F('text'), Measures: F('note'), AppraisalYear: F('text'), AppliesTo: F('choice', { c: CHOICES.AppliesTo }),
      Technician: F('person'), SortOrder: F('num'), Active: F('bool') },
    'Monthly Reviews': { Title: F('text'), Technician: F('person'), MonthKey: F('text'), MonthStart: F('date'), DueDate: F('datetime'),
      ReviewStatus: F('choice', { c: CHOICES.ReviewStatus }), Q1WentWell: F('note'), Q2Issue: F('note'), Q2Impact: F('note'), Q2Tried: F('note'), Q2Support: F('note'),
      Q3WorkloadRating: F('num', { min: 1, max: 5 }), Q3WorkloadComment: F('note'), Q4WellbeingRaise: F('choice', { c: CHOICES.YesNo }), Q4WellbeingDetail: F('note'),
      Q5PlanningRaise: F('choice', { c: CHOICES.YesNo }), Q5PlanningDetail: F('note'), Q6DevRaise: F('choice', { c: CHOICES.YesNo }), Q6DevWhat: F('note'), Q6DevWhy: F('note'),
      Q7ManagerFeedback: F('note'), ExpectationsJson: F('note'), Q9FollowUp: F('choice', { c: CHOICES.Follow }), Mood: F('num', { min: 1, max: 5 }), WinOfMonth: F('note'),
      AppraisalDate: F('date'), AppraisalBoundaries: F('note', { v14: true }) },
    'Manager Reviews': { Title: F('text'), ReviewKey: F('text'), ReviewItemId: F('num'), Technician: F('person'), TechnicianAadId: F('text'), MonthKey: F('text'),
      DueDate: F('datetime'), ReviewState: F('choice', { c: CHOICES.ReviewState }), LinkSentOn: F('datetime'), SubmittedOn: F('datetime'), SubmittedLate: F('bool'),
      TechFollowUp: F('text'), ExpectationSnapshotJson: F('note'), FB_Q1: F('note'), FB_Q2: F('note'), FB_Q3: F('note'), FB_Q4: F('note'), FB_Q5: F('note'),
      FB_Q6: F('note'), FB_Q7: F('note'), FB_Q9: F('note'), FB_Overall: F('note'), ExpectationFeedbackJson: F('note'), FollowUpDecision: F('choice', { c: CHOICES.Follow }),
      MeetingDate: F('date'), ActionsJson: F('note'), ActionsStatus: F('choice', { c: CHOICES.ActionsStatus }), NextActionDue: F('date'), CompletedOn: F('datetime'),
      CompletedBy: F('text'), ReleasedOn: F('datetime'), CorrectionLog: F('note'), ActionsSyncedOn: F('datetime', { v15: true }) },
    '1-to-1 Settings': { Title: F('text'), Value: F('note') },
    'Wellbeing Assessments': { Title: F('text'), Technician: F('person'), AssessmentStatus: F('choice', { c: CHOICES.WbStatus }), AssessmentDate: F('date'),
      Position: F('text'), EmployeeNumber: F('text'), AnswersJson: F('note'), PersonalJson: F('note'), ArrangementsJson: F('note'), ManagerNotes: F('note'),
      NextReviewDate: F('date'), SubmittedOn: F('datetime'), CompletedOn: F('datetime') },
    // Created and Author are set by SharePoint itself, not from formValues
    '1-to-1 Feedback': { Title: F('text'), FeedbackType: F('choice', { c: CHOICES.FbType }), Message: F('note'), PageName: F('text'), AppVersion: F('text'),
      DeliveryStatus: F('choice', { c: CHOICES.FbStatus }), SentOn: F('datetime'), Created: F('datetime'), Author: F('person'),
      HasUniqueRoleAssignments: F('bool') },   // set by 'Flow 6' when it locks the item (not writable from the page)
    // Owners only (no group access). Created / Author are SharePoint's own.
    '1-to-1 Amendments': { Title: F('text'), ReviewItemId: F('num'), ManagerReviewId: F('num'), MonthKey: F('text'), Technician: F('person'), Reason: F('note'),
      ChangedFields: F('note'), ChangesJson: F('note'), NotifyStatus: F('choice', { c: CHOICES.Notify }), NotifiedOn: F('datetime'), NotifyError: F('text'),
      Created: F('datetime'), Author: F('person') },
    // 1.5 action tracker. Actions: Owners only; flow 9 gives the action's technician Read. ActionKey is unique.
    '1-to-1 Actions': { Title: F('text'), ActionKey: F('text', { unique: true }), Technician: F('person'), Owner: F('choice', { c: CHOICES.Owner }), Criteria: F('note'),
      OriginReviewId: F('num'), OriginMgrId: F('num'), OriginMonth: F('text'), OriginalDue: F('date'), CurrentDue: F('date'), Status: F('choice', { c: CHOICES.ActStatus }),
      WaitingReason: F('note'), WaitingUntil: F('text'), LatestProgress: F('note'), LastUpdateOn: F('datetime'), LastUpdateBy: F('text'), ClosedOn: F('date'),
      DecisionNote: F('note'), HistoryJson: F('note'), SharedWith: F('text') },
    // one folder per technician (u<site user id>, only they can add to it); FileDirRef / FSObjType are SharePoint's own
    '1-to-1 Action Updates': { Title: F('text'), ActionId: F('num'), Kind: F('choice', { c: CHOICES.UpdKind }), Outcome: F('choice', { c: CHOICES.Outcome }), Message: F('note'),
      WaitingUntil: F('text'), ClientKey: F('text', { unique: true }), ProcessState: F('choice', { c: CHOICES.Process }), ProcessNote: F('text'),
      FileDirRef: F('text'), FSObjType: F('num'), Created: F('datetime'), Author: F('person') },
    '1-to-1 Action Notices': { Title: F('text'), NoticeKey: F('text', { unique: true }), Kind: F('choice', { c: CHOICES.NoticeKind }), ActionId: F('num'),
      Status: F('choice', { c: CHOICES.NoticeStatus }), Attempts: F('num'), LastError: F('text'), SentOn: F('datetime'), Created: F('datetime') }
  };
  var READ_ONLY = ['HasUniqueRoleAssignments', 'Author', 'Created', 'Modified', 'FileDirRef', 'FSObjType'];
  var TRACKER = ['1-to-1 Actions', '1-to-1 Action Updates', '1-to-1 Action Notices'];
  var LIST_URL = { '1-to-1 Actions': 'OneToOneActions', '1-to-1 Action Updates': 'OneToOneActionUpdates', '1-to-1 Action Notices': 'OneToOneActionNotices' };
  function listUrl(list) { return '/sites/esg-1to1/Lists/' + (LIST_URL[list] || list.replace(/\W/g, '')); }

  // ---------------------------------------------------------------- people (fictional)
  var USERS = [
    { key: 'tl', id: 1, title: 'Team Leader (mock)', email: 'team.leader@example.test', owner: true },
    { key: 'alex', id: 11, title: 'Alex Morgan', email: 'alex.morgan@example.test', label: 'Test A' },
    { key: 'sam', id: 12, title: 'Sam Patel', email: 'sam.patel@example.test', label: 'Test B' },
    { key: 'jordan', id: 13, title: 'Jordan Lee', email: 'jordan.lee@example.test' },
    { key: 'casey', id: 14, title: 'Casey Brooks', email: 'casey.brooks@example.test' },
    { key: 'riley', id: 15, title: 'Riley Evans', email: 'riley.evans@example.test' },
    { key: 'taylor', id: 16, title: 'Taylor Reed', email: 'taylor.reed@example.test' },
    { key: 'drew', id: 17, title: 'Drew Collins', email: 'drew.collins@example.test', extra: true, job: 'Technician' },
    { key: 'morgan', id: 18, title: 'Morgan Shaw', email: 'morgan.shaw@example.test', extra: true, job: 'Senior Technician' }
  ];
  function claimsOf(u) { return 'i:0#.f|membership|' + u.email; }
  function userByEmail(e) { return USERS.find(function (u) { return u.email === String(e || '').toLowerCase(); }) || null; }
  function userByClaims(c) { return USERS.find(function (u) { return claimsOf(u) === c; }) || null; }
  function person(u) { return u ? { Id: u.id, Title: u.title, EMail: u.email, Name: claimsOf(u) } : null; }

  // ---------------------------------------------------------------- dates (London)
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function londonToday() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
  function addMonths(key, n) { var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad(m + 1); }
  function lastDay(key) { return key + '-' + pad(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate()); }
  function offsetHours(iso) { var hr = new Date(iso + 'T12:00:00Z').toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }); return Number(hr) - 12; }
  // SharePoint stores a date-only value as midnight site time, returned as a UTC instant.
  // midnight UK time, checked at midnight itself (the clocks change at 01:00 GMT in March and 02:00 BST in October)
  function dateOnlyUtc(iso) {
    var base = Date.parse(iso + 'T00:00:00Z');
    for (var off = 1; off >= 0; off--) {
      var t = new Date(base - off * 3600000);
      var loc = t.toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      if (loc.slice(0, 10) === iso && /00:00$/.test(loc)) { return t.toISOString().replace('.000', ''); }
    }
    return new Date(base).toISOString().replace('.000', '');
  }
  function endOfDayUtc(iso) { var off = offsetHours(iso); return new Date(Date.parse(iso + 'T23:59:59Z') - off * 3600000).toISOString().replace('.000', ''); }
  function nowIso() { return new Date().toISOString().replace(/\.\d{3}/, ''); }
  function rng(seed) { var t0 = seed >>> 0; return function () { t0 = (t0 + 0x6D2B79F5) >>> 0; var t = t0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------------------------------------------------------------- attack strings (XSS mode)
  var X = [
    '<img src=x onerror=' + 'oto_xss(1)>',
    '<' + 'script>oto_xss(2)<' + '/' + 'script>',
    '"><svg onload=' + 'oto_xss(3)>',
    '{' + '{constructor.constructor("oto_xss(4)")()}' + '}',
    'javascript:' + 'oto_xss(5)'
  ];

  // ---------------------------------------------------------------- seed
  function seed(xss) {
    var db = { nextId: {}, lists: {}, perms: { 'Monthly Reviews': {}, 'Manager Reviews': {}, 'Wellbeing Assessments': {}, '1-to-1 Feedback': {}, '1-to-1 Actions': {}, '1-to-1 Action Updates': {} },
      folders: {}, fbFail: false, writes: [], emails: [], recycled: [], group: [], digest: 'MOCKDIGEST-' + Date.now() };
    Object.keys(SCHEMA).forEach(function (l) { db.lists[l] = []; db.nextId[l] = 1; });
    function add(list, fields) { var id = db.nextId[list]++; var it = { ID: id }; Object.keys(fields).forEach(function (k) { it[k] = fields[k]; }); db.lists[list].push(it); return it; }
    var today = londonToday(), CUR = today.slice(0, 7);
    var techUsers = USERS.filter(function (u) { return !u.owner && !u.extra; });
    techUsers.forEach(function (u) { db.group.push(u.email); });
    var apOffsets = { alex: [4, '12'], sam: [3, '05'], jordan: [2, '22'], casey: [1, '18'], riley: [5, '09'], taylor: [4, '26'] };
    var yearStart = (+CUR.slice(5, 7) >= 4 ? +CUR.slice(0, 4) : +CUR.slice(0, 4) - 1);
    var YEAR = yearStart + '/' + String(yearStart + 1).slice(2);
    // Period starts: Sam's last appraisal was completed four months ago (an earlier period is in the history); Jordan has
    // no start set yet; the others started before the first review. Next wellbeing dates: none for Sam.
    var starts = { alex: [-9, '15'], casey: [-10, '02'], riley: [-8, '20'], taylor: [-11, '28'] };
    var wbNext = { alex: 10, jordan: 280, casey: -5, riley: 60, taylor: 120 };
    techUsers.forEach(function (u) {
      var o = apOffsets[u.key], st = starts[u.key];
      var row = add('Technicians', { Title: u.title, Technician: claimsOf(u), TechnicianAadId: 'aad-' + u.key, Active: true, AppraisalDate: dateOnlyUtc(addMonths(CUR, o[0]) + '-' + o[1]) });
      if (st) { row.AppraisalCycleStart = dateOnlyUtc(addMonths(CUR, st[0]) + '-' + st[1]); }
      if (u.key === 'sam') {
        var done = addMonths(CUR, -4) + '-10', began = addMonths(CUR, -16) + '-05';
        row.AppraisalCycleStart = dateOnlyUtc(done);
        row.AppraisalHistoryJson = JSON.stringify([{ start: began, completed: done, nextDue: addMonths(CUR, 3) + '-05', recordedOn: done }]);
      }
      if (wbNext[u.key] !== undefined) { row.NextWellbeingDate = dateOnlyUtc(new Date(Date.parse(today + 'T12:00:00Z') + wbNext[u.key] * 86400000).toISOString().slice(0, 10)); }
      var b = [];
      if (row.AppraisalHistoryJson) { JSON.parse(row.AppraisalHistoryJson).forEach(function (x) { b.push(x.start, x.completed); }); }
      if (row.AppraisalCycleStart) { b.push(new Date(row.AppraisalCycleStart).toLocaleDateString('en-CA', { timeZone: TZ })); }
      row.AppraisalBoundaries = JSON.stringify(b.filter(function (x, i) { return b.indexOf(x) === i; }).sort());
    });
    var EXP = [
      ['Complete annual safety refresher training', 'Course passed and certificate recorded by the end of Q4.', 'Shared', '', 10],
      ['Keep instrument checks on schedule', 'All assigned weekly checks completed and recorded on time.', 'Shared', '', 20],
      ['Right-first-time paperwork', 'No permit, round sheet or calibration record returned for errors or omissions.', 'Shared', '', 30],
      ['Raise improvement ideas', 'At least one improvement idea or near-miss report each quarter.', 'Shared', '', 40],
      ['Mentor a newer team member', 'Regular buddy sessions held; mentee signs off two practical tasks.', 'Individual', 'alex', 50],
      ['Deliver two toolbox talks', 'Two talks delivered to the shift team and recorded.', 'Individual', 'alex', 60],
      ['Achieve task supervisor qualification', 'Assessment passed; first supervised task completed.', 'Individual', 'sam', 50],
      ['Complete radiation protection supervisor course', 'Course passed and appointed as RPS on the area roster.', 'Individual', 'jordan', 50],
      ['Reduce overdue maintenance backlog in area 3', 'Overdue routines in area 3 below five by year end.', 'Individual', 'casey', 50],
      ['Lead the outage survey team', 'Survey plan delivered on time with no rework.', 'Individual', 'riley', 50],
      ['Complete HNC module 2', 'Module passed and assignment feedback shared.', 'Individual', 'taylor', 50]
    ];
    EXP.forEach(function (e, i) {
      var u = USERS.find(function (x) { return x.key === e[3]; });
      add('Appraisal Expectations', { Title: xss && i === 2 ? e[0] + ' ' + X[0] : e[0], Measures: xss && i === 3 ? X[2] : e[1], AppraisalYear: YEAR, AppliesTo: e[2],
        Technician: u ? claimsOf(u) : null, SortOrder: e[4], Active: true });
    });
    add('Appraisal Expectations', { Title: 'Update local work instructions', Measures: 'Three instructions reviewed and reissued.', AppraisalYear: (yearStart - 1) + '/' + String(yearStart).slice(2), AppliesTo: 'Shared', Technician: null, SortOrder: 10, Active: false });
    add('1-to-1 Settings', { Title: 'Bands', Value: JSON.stringify([{ name: xss ? 'Not met ' + X[1] : 'Not met', max: 1.5 }, { name: 'Partially met', max: 2.25 }, { name: 'Met', max: 4 }, { name: 'Exceeded', max: null }]) });

    var BANK = {
      well: ['Closed out the outage survey backlog two days early.', 'Completed all routine checks on time and covered a colleague\'s area.', 'Good feedback from the shift team on the handover notes.', 'Finished the calibration round with no repeats.', 'Helped train the new starter on the round sheets.'],
      win: ['Found and fixed a recurring fault on the area 3 monitor.', 'First fully clean permit audit this year.', 'Delivered a toolbox talk on three-way communication.', 'Mentee signed off their first practical task.', 'Spotted a transposed tag number before it caused a wrong isolation.'],
      evidence: ['Booked onto the next course date.', 'All checks done and recorded this month.', 'Two buddy sessions held.', 'No forms returned this month.', 'Submitted one near-miss report.', 'Assessment booked for next month.'],
      overall: ['Solid month — thanks for the effort.', 'A strong month. Keep the momentum going.', 'Good progress; let\'s keep an eye on workload.', 'Steady month. Focus on the paperwork points we discussed.'],
      expfb: ['Good progress — keep it up.', 'On track; evidence is clear.', 'Let\'s talk about how to move this forward.', 'Strong evidence this month.'],
      actions: [
        ['Book supervisor course date', 'tech', 'Course confirmed in the training system and date shared with Team Leader.'],
        ['Escalate monitor spares order with stores', 'tl', 'Order raised with a confirmed delivery date.'],
        ['Re-brief round sheet completion standards', 'tl', 'Briefing delivered and attendance recorded.'],
        ['Agree revised dates for deferred area 3 routines', 'tech', 'Revised dates entered in the maintenance system.']
      ]
    };
    var PROFILE = {
      alex: { from: 2.5, to: 3.4, bias: 0.2, wl: 3, mood: 4, late: [], missed: [] },
      sam: { from: 3.0, to: 3.7, bias: 0.1, wl: 4, mood: 3, late: [], missed: [] },
      jordan: { from: 3.5, to: 3.6, bias: 0, wl: 3, mood: 4, late: [], missed: [] },
      casey: { from: 2.3, to: 1.6, bias: -0.3, wl: 2, mood: 2, late: [2], missed: [4, 7] },
      riley: { from: 4.0, to: 4.4, bias: 0, wl: 2, mood: 5, late: [7], missed: [] },
      taylor: { from: 2.9, to: 2.3, bias: -0.2, wl: 5, mood: 2, late: [5], missed: [] }
    };
    var exps = db.lists['Appraisal Expectations'];
    function snapFor(u) {
      return exps.filter(function (e) { return e.Active && e.AppraisalYear === YEAR && (e.AppliesTo === 'Shared' || e.Technician === claimsOf(u)); })
        .sort(function (a, b) { return a.SortOrder - b.SortOrder; })   // same as Flow 1: Active, this appraisal year, by SortOrder
        .map(function (e) { return { id: e.ID, title: e.Title, measures: e.Measures, year: e.AppraisalYear }; });
    }
    var hist = [];
    for (var k = 7; k >= 1; k--) { hist.push(addMonths(CUR, -k)); }

    techUsers.forEach(function (u, ti) {
      var P = PROFILE[u.key], R = rng(ti * 977 + 13), snap = snapFor(u), offs = {};
      var pick = function (arr) { return arr[Math.floor(R() * arr.length)]; };
      var techRow = db.lists['Technicians'].find(function (t) { return t.Technician === claimsOf(u); });
      snap.forEach(function (e) { offs[e.id] = (R() - 0.5) * 1.2; });
      function makeMonth(m, i, mode, base) {
        var due = endOfDayUtc(lastDay(m));
        var mr = add('Manager Reviews', { Title: u.title + ' – ' + m, ReviewKey: 'aad-' + u.key + '_' + m, ReviewItemId: null, Technician: claimsOf(u), TechnicianAadId: 'aad-' + u.key,
          MonthKey: m, DueDate: due, ReviewState: 'Open', LinkSentOn: dateOnlyUtc(m + '-01'), SubmittedOn: null, SubmittedLate: false, TechFollowUp: '',
          ExpectationSnapshotJson: JSON.stringify(snap), ActionsStatus: 'None', ActionsJson: '[]', ExpectationFeedbackJson: '[]', ReleasedOn: null });
        var rv = add('Monthly Reviews', { Title: u.title + ' – ' + m, Technician: claimsOf(u), MonthKey: m, MonthStart: dateOnlyUtc(m + '-01'), DueDate: due,
          ReviewStatus: 'Not Started', ExpectationsJson: JSON.stringify(snap.map(function (e) { return { id: e.id, title: e.title, measures: e.measures, year: e.year, rating: null, comment: '' }; })),
          AppraisalDate: techRow.AppraisalDate, AppraisalBoundaries: techRow.AppraisalBoundaries });
        mr.ReviewItemId = rv.ID;
        db.perms['Monthly Reviews'][rv.ID] = {}; db.perms['Monthly Reviews'][rv.ID][u.email] = 'edit';
        if (mode === 'blank' || mode === 'missed') {
          if (mode === 'missed') { mr.ReviewState = 'Closed - Not Submitted'; rv.ReviewStatus = 'Closed - Not Submitted'; mr.ReleasedOn = endOfDayUtc(lastDay(m)); release(rv, mr, u); }
          return { rv: rv, mr: mr };
        }
        rv.Mood = clamp(Math.round(P.mood + (R() - 0.5) * 1.6), 1, 5);
        rv.WinOfMonth = pick(BANK.win); rv.Q1WentWell = pick(BANK.well);
        if (R() < 0.35) { rv.Q2Issue = 'Waiting on spare parts for one monitor.'; rv.Q2Impact = 'Using a loan unit.'; rv.Q2Tried = 'Chased stores twice.'; rv.Q2Support = 'Help escalating the order.'; }
        rv.Q3WorkloadRating = clamp(Math.round(P.wl + (R() - 0.5) * 1.4), 1, 5);
        if (rv.Q3WorkloadRating >= 4) { rv.Q3WorkloadComment = 'Busy with outage support plus routine work.'; }
        rv.Q4WellbeingRaise = 'No';
        if (R() < 0.4) { rv.Q5PlanningRaise = 'Yes'; rv.Q5PlanningDetail = 'Annual leave 14–18 December.'; } else { rv.Q5PlanningRaise = 'No'; }
        if (R() < 0.3) { rv.Q6DevRaise = 'Yes'; rv.Q6DevWhat = 'Supervisor qualification course.'; rv.Q6DevWhy = 'To take on supervising tasks next year.'; } else { rv.Q6DevRaise = 'No'; }
        rv.ExpectationsJson = JSON.stringify(snap.map(function (e) { return { id: e.id, title: e.title, measures: e.measures, year: e.year, rating: clamp(Math.round(base + offs[e.id] + (R() - 0.5) * 0.8), 1, 5), comment: pick(BANK.evidence) }; }));
        rv.Q9FollowUp = rv.Q3WorkloadRating >= 5 ? FOLLOW[2] : (R() < 0.5 ? FOLLOW[0] : FOLLOW[1]);
        if (mode === 'draft') { rv.ReviewStatus = 'Draft'; return { rv: rv, mr: mr }; }
        // submitted (Flow 2 effect)
        var late = P.late.indexOf(i) >= 0;
        mr.ReviewState = 'Submitted'; mr.SubmittedOn = late ? dateOnlyUtc(addMonths(m, 1) + '-02') : dateOnlyUtc(m + '-' + pad(18 + Math.floor(R() * 9)));
        mr.SubmittedLate = late; mr.TechFollowUp = rv.Q9FollowUp; rv.ReviewStatus = 'Submitted';
        db.perms['Monthly Reviews'][rv.ID][u.email] = 'read';
        if (mode === 'submitted') { return { rv: rv, mr: mr }; }
        // completed (Flow 3 effect)
        mr.FB_Q1 = 'Thanks — good to see.'; mr.FB_Overall = pick(BANK.overall);
        mr.ExpectationFeedbackJson = JSON.stringify(snap.map(function (e) { return { id: e.id, feedback: pick(BANK.expfb), rating: clamp(Math.round(base + offs[e.id] + P.bias + (R() - 0.5) * 0.8), 1, 5) }; }));
        var acts = [];
        if (R() < 0.45) {
          var a = pick(BANK.actions), dueA = new Date(Date.parse(lastDay(m) + 'T12:00:00Z') + (20 + Math.floor(R() * 40)) * 86400000).toISOString().slice(0, 10);
          var closed = dueA < addMonths(CUR, 0) + '-01' ? R() < 0.9 : R() < 0.15;
          acts.push({ id: 'a' + rv.ID, text: a[0], owner: a[1] === 'tech' ? u.title : 'Team Leader', criteria: a[2], due: dueA, status: closed ? 'Closed' : 'Open', closedOn: closed ? (dueA < today ? dueA : today) : '' });
        }
        mr.ActionsJson = JSON.stringify(acts);
        mr.ActionsStatus = acts.length ? (acts.some(function (x) { return x.status === 'Open'; }) ? 'Open' : 'Done') : 'None';
        mr.ReviewState = 'Completed'; mr.ReleasedOn = mr.SubmittedOn; mr.CompletedOn = mr.SubmittedOn; mr.CompletedBy = 'team.leader@example.test';
        rv.ReviewStatus = 'Completed';
        release(rv, mr, u);
        return { rv: rv, mr: mr };
      }
      hist.forEach(function (m, i) {
        var base = P.from + (P.to - P.from) * i / (hist.length - 1);
        makeMonth(m, i, P.missed.indexOf(i) >= 0 ? 'missed' : 'completed', base);
      });
      var nb = P.to + (P.to - P.from) / (hist.length - 1);
      var curMode = { alex: 'draft', sam: 'submitted', jordan: 'completed', casey: 'blank', riley: 'submitted', taylor: 'draft' }[u.key];
      var c = makeMonth(CUR, hist.length, curMode, nb);
      if (u.key === 'alex') {
        var j = JSON.parse(c.rv.ExpectationsJson); j.forEach(function (x) { x.rating = null; x.comment = ''; }); c.rv.ExpectationsJson = JSON.stringify(j);
        ['Q2Issue', 'Q2Impact', 'Q2Tried', 'Q2Support', 'Q3WorkloadComment', 'Q4WellbeingRaise', 'Q5PlanningRaise', 'Q5PlanningDetail', 'Q6DevRaise', 'Q6DevWhat', 'Q6DevWhy', 'Q9FollowUp', 'WinOfMonth'].forEach(function (f) { delete c.rv[f]; });
        c.rv.Q1WentWell = 'Finished the instrument check backlog.'; c.rv.Q3WorkloadRating = 3; c.rv.Mood = 4;
      }
      if (u.key === 'sam') { c.rv.Q9FollowUp = FOLLOW[2]; c.mr.TechFollowUp = FOLLOW[2]; }
      if (xss && u.key === 'alex') {
        // attack strings in Test A's own current draft and in a released past review
        c.rv.Q1WentWell = X.join(' | '); c.rv.WinOfMonth = X[2]; c.rv.Q7ManagerFeedback = X[3];
        var past = db.lists['Manager Reviews'].filter(function (x) { return x.Technician === claimsOf(u) && x.ReviewState === 'Completed'; }).pop();
        past.FB_Overall = X.join(' '); past.FB_Q1 = X[0];
        past.ActionsJson = JSON.stringify([{ id: 'x1', text: X[0], owner: u.title, criteria: X[1], due: lastDay(CUR), status: 'Open', closedOn: '' }]);
        past.ExpectationFeedbackJson = JSON.stringify(JSON.parse(past.ExpectationSnapshotJson).map(function (e) { return { id: e.id, feedback: X[4], rating: 3 }; }));
      }
      if (xss && u.key === 'sam') {
        c.rv.Q1WentWell = X.join(' '); c.rv.Q2Issue = X[0]; c.rv.Q2Support = X[1]; c.rv.Q3WorkloadComment = X[2]; c.rv.Q5PlanningRaise = 'Yes'; c.rv.Q5PlanningDetail = X[3];
        c.rv.Q6DevRaise = 'Yes'; c.rv.Q6DevWhat = X[4]; c.rv.Q6DevWhy = X[0]; c.rv.WinOfMonth = X[1];
        var ej = JSON.parse(c.rv.ExpectationsJson); ej.forEach(function (x) { x.comment = X[2]; x.title = x.title + X[0]; }); c.rv.ExpectationsJson = JSON.stringify(ej);
      }
    });
    // the action tracker started three months ago (Setup 1.5): reviews released since then have their actions tracked (Flow 3)
    var startDay = addMonths(CUR, -3) + '-01';
    add('1-to-1 Settings', { Title: 'ActionsTrackerStart', Value: dateOnlyUtc(startDay) });
    db.trackerStart = dateOnlyUtc(startDay);
    db.lists['Manager Reviews'].forEach(function (mr) { if (mr.ReleasedOn) { trackRelease(db, mr, mr.ReleasedOn); } });
    seedTracker(db, today, xss);
    // wellbeing assessments (Flow 5 effects applied)
    function wbAns(issues, help) {
      var a = {}, ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'c1', 'c2', 'c3', 's1', 's2', 's3', 'r1', 'r2', 'r3', 'r4', 'r5', 'ro1', 'ro2', 'ro3', 'ro4', 'ro5', 'ro6', 'ro7', 'ro8', 'ro9', 'ch1', 'ch2', 'ch3'];
      ids.forEach(function (id, i) { var iss = issues.indexOf(id) >= 0; a[id] = { app: iss || i % 3 !== 2 ? 'Y' : 'NA', issue: iss ? 'Y' : (i % 3 !== 2 ? 'N' : 'NA'), help: iss ? help : '' }; });
      return JSON.stringify(a);
    }
    function wbPer(extra) {
      var p = { circ: 'No', mhBest: 'I have clear priorities and time to plan the week.', mhSigns: 'I go quiet and stop joining in at breaks.', supMgr: 'Check in when the workload spikes.', supOwn: 'Walk at lunchtime; switch off my phone after 8pm.', other: '' };
      Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; }); return JSON.stringify(p);
    }
    function addWb(uk, f, perm) { var u = USERS.find(function (x) { return x.key === uk; }); f.Title = u.title + ' – wellbeing assessment'; f.Technician = claimsOf(u); var it = add('Wellbeing Assessments', f); db.perms['Wellbeing Assessments'][it.ID] = {}; db.perms['Wellbeing Assessments'][it.ID][u.email] = perm; return it; }
    var past = addMonths(CUR, -13) + '-10', soon = new Date(Date.parse(today + 'T12:00:00Z') + 10 * 86400000).toISOString().slice(0, 10);
    addWb('alex', { AssessmentStatus: 'Completed', AssessmentDate: dateOnlyUtc(past), Position: 'Technician', EmployeeNumber: '100231', AnswersJson: wbAns(['d1', 'd8'], 'Agree a cut-off for out-of-hours calls.'),
      PersonalJson: wbPer(), ArrangementsJson: JSON.stringify([{ id: 'w1', text: 'No routine work calls after 20:00 unless on call.', review: addMonths(CUR, -10) + '-10', effective: 'Yes', next: '' }]),
      ManagerNotes: 'Good conversation. Call cut-off agreed with the shift team.', NextReviewDate: dateOnlyUtc(soon), SubmittedOn: dateOnlyUtc(addMonths(CUR, -13) + '-08'), CompletedOn: dateOnlyUtc(past) }, 'read');
    addWb('alex', { AssessmentStatus: 'Open', AssessmentDate: dateOnlyUtc(soon), Position: 'Technician', AnswersJson: xss ? JSON.stringify({ d1: { app: 'Y', issue: 'Y', help: X.join(' ') } }) : JSON.stringify({ d1: { app: 'Y', issue: 'N', help: '' }, d2: { app: 'Y', issue: 'Y', help: 'Help to prioritise the backlog when outages overlap.' } }),
      PersonalJson: xss ? wbPer({ mhBest: X[0], other: X[2] }) : '{}' }, 'edit');
    addWb('sam', { AssessmentStatus: 'Submitted', AssessmentDate: dateOnlyUtc(soon), Position: 'Technician', EmployeeNumber: '100318',
      AnswersJson: wbAns(['d2', 'd6', 'ro2'], xss ? X[1] : 'More notice of lone-working jobs and a check-in call.'), PersonalJson: wbPer({ circ: 'Yes', circKnow: xss ? X[3] : 'I am a carer for a parent.', circImpact: 'Occasional short-notice absence.', circNotice: 'I may be distracted or late.' }),
      SubmittedOn: dateOnlyUtc(today) }, 'read');
    addWb('jordan', { AssessmentStatus: 'Completed', AssessmentDate: dateOnlyUtc(addMonths(CUR, -3) + '-12'), Position: 'Senior Technician', AnswersJson: wbAns([], ''), PersonalJson: wbPer(),
      ArrangementsJson: '[]', ManagerNotes: 'No concerns raised.', NextReviewDate: dateOnlyUtc(addMonths(CUR, 9) + '-12'), SubmittedOn: dateOnlyUtc(addMonths(CUR, -3) + '-10'), CompletedOn: dateOnlyUtc(addMonths(CUR, -3) + '-12') }, 'read');
    if (xss) {
      var t = db.lists['Technicians'].find(function (x) { return x.Technician === claimsOf(USERS[5]); });
      t.Title = 'Riley ' + X[0];
    }
    // every item carries SharePoint's Modified stamp
    var stamp = new Date(Date.now() - 86400000).toISOString().replace(/\.\d{3}/, '');
    Object.keys(db.lists).forEach(function (l) { db.lists[l].forEach(function (it) { it.Modified = stamp; it.__v = it.__v || 1; }); });
    return db;

    function release(rv, mr, u) {
      db.perms['Monthly Reviews'][rv.ID] = {}; db.perms['Monthly Reviews'][rv.ID][u.email] = 'read';
      db.perms['Manager Reviews'][mr.ID] = {}; db.perms['Manager Reviews'][mr.ID][u.email] = 'read';
    }
  }

  // ---------------------------------------------------------------- 1.5 action tracker (flows 3, 9, 10, 11)
  function addItem(db, list, fields) { var id = db.nextId[list]++; var it = { ID: id, __v: 1, Modified: nowIso(), Created: nowIso() }; Object.keys(fields).forEach(function (k) { it[k] = fields[k]; }); db.lists[list].push(it); return it; }
  function touch(it) { it.__v = (it.__v || 1) + 1; it.Modified = nowIso(); }
  function userOfClaims(c) { return userByClaims(c); }
  // Flow 3 (1.5): after release, each agreed action is added once (key mr<id>-<action id>), then ActionsSyncedOn is stamped.
  // db.failCreateAt = n: only n are added this time (the run broke) – the daily run (runFlow1Sync) finishes it.
  function trackRelease(db, mr, releasedOn) {
    if (!db.trackerStart || db.v14 || db.v13 || !releasedOn || Date.parse(releasedOn) < Date.parse(db.trackerStart) || mr.ActionsSyncedOn) { return; }
    var acts = []; try { acts = JSON.parse(mr.ActionsJson || '[]'); } catch (_) { acts = []; }
    var u = userOfClaims(mr.Technician); if (!u) { return; }
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i], key = 'mr' + mr.ID + '-' + a.id;
      if (!a.id) { return; }
      if (db.lists['1-to-1 Actions'].some(function (x) { return x.ActionKey === key; })) { continue; }
      if (db.failCreateAt !== undefined && db.failCreateAt !== null) { if (db.failCreateAt <= 0) { db.failCreateAt = null; return; } db.failCreateAt--; }
      var owner = a.ownerRole === 'tl' || (!a.ownerRole && a.owner !== u.title) ? 'Team Leader' : 'Technician';
      var it = addItem(db, '1-to-1 Actions', { Title: String(a.text || '').slice(0, 250), ActionKey: key, Technician: claimsOf(u), Owner: owner, Criteria: a.criteria || '',
        OriginReviewId: mr.ReviewItemId, OriginMgrId: mr.ID, OriginMonth: mr.MonthKey, OriginalDue: a.due ? dateOnlyUtc(a.due) : null, CurrentDue: a.due ? dateOnlyUtc(a.due) : null,
        Status: a.status === 'Closed' ? 'Closed' : 'Open', ClosedOn: a.status === 'Closed' && a.closedOn ? dateOnlyUtc(a.closedOn) : null,
        HistoryJson: JSON.stringify([{ id: 'c', at: releasedOn, kind: 'created', month: mr.MonthKey, by: 'Agreed at the monthly 1-to-1' }]), SharedWith: '' });
      flow9(db, it);
    }
    mr.ActionsSyncedOn = nowIso();
  }
  // Flow 9: the action readable by exactly its technician; their update folder (only they can add to it)
  function flow9(db, it) {
    if (db.flow9Off) { return; }
    var u = userOfClaims(it.Technician); if (!u) { return; }
    db.perms['1-to-1 Actions'][it.ID] = {}; db.perms['1-to-1 Actions'][it.ID][u.email] = 'read';
    var f = 'u' + u.id;
    if (!db.folders[f]) { db.folders[f] = u.email; addItem(db, '1-to-1 Action Updates', { Title: f, FSObjType: 1, FileDirRef: listUrl('1-to-1 Action Updates') }); }
    db.folders[f] = u.email;
    if (it.SharedWith !== u.email) { it.SharedWith = u.email; touch(it); }
  }
  var CLOSE_REQ = function (k, o) { return k === 'closeRequest' || (k === 'followup' && o === 'Ready'); };
  // Flow 10: who sent it comes from the folder it is in (never Author / ActionId); applied once (u<id> in the history).
  function flow10(db, up) {
    if (db.flow10Off || up.FSObjType === 1 || up.ProcessState !== 'Pending') { return; }
    up.ProcessState = 'Processing'; touch(up);
    var dir = String(up.FileDirRef || ''), folder = dir.split('/').pop(), root = listUrl('1-to-1 Action Updates');
    var email = dir === root + '/' + folder && /^u\d+$/.test(folder) ? db.folders[folder] : null, sender = email ? userByEmail(email) : null;
    var ac = db.lists['1-to-1 Actions'].find(function (x) { return x.ID === Number(up.ActionId); });
    var kind = up.Kind || '', msg = String(up.Message || '').trim(), oc = up.Outcome || '';
    var verdict = !sender || ('u' + sender.id) !== folder ? 'Not sent from your own update folder' : !ac || ac.Technician !== claimsOf(sender) ? 'Not your action'
      : ac.Status === 'Closed' ? 'The action is closed' : CHOICES.UpdKind.indexOf(kind) < 0 ? 'Unknown kind of update'
      : (kind === 'progress' || kind === 'waiting') && !msg ? 'The update is empty' : kind === 'followup' && CHOICES.Outcome.indexOf(oc) < 0 ? 'Unknown follow-up outcome'
      : CLOSE_REQ(kind, oc) && ac.Owner !== 'Technician' ? 'Only the Team Leader closes their own actions' : '';
    db.perms['1-to-1 Action Updates'][up.ID] = {};
    if (sender) { db.perms['1-to-1 Action Updates'][up.ID][sender.email] = 'read'; }   // locked: Owners + the sender Read
    if (verdict) { up.ProcessState = 'Rejected'; up.ProcessNote = verdict; touch(up); return; }
    var hist = []; try { hist = JSON.parse(ac.HistoryJson || '[]'); } catch (_) { hist = []; }
    if (!hist.some(function (e) { return e && e.id === 'u' + up.ID; })) {
      var text = msg.slice(0, 2000);
      hist.push({ id: 'u' + up.ID, at: nowIso(), by: sender.title, kind: kind, outcome: oc, text: text, waitingUntil: up.WaitingUntil || '', key: String(up.ClientKey || '').slice(0, 60) });
      ac.Status = CLOSE_REQ(kind, oc) ? 'Ready for close-out' : kind === 'waiting' ? 'Waiting' : (kind === 'progress' && (ac.Status === 'Open' || ac.Status === 'Waiting')) ? 'In progress' : ac.Status;
      if (text) { ac.LatestProgress = text; }
      ac.LastUpdateOn = nowIso(); ac.LastUpdateBy = sender.title;
      if (kind === 'waiting') { ac.WaitingReason = text; ac.WaitingUntil = up.WaitingUntil || ''; } else if (kind === 'progress') { ac.WaitingReason = ''; ac.WaitingUntil = ''; }
      ac.HistoryJson = JSON.stringify(hist); touch(ac);
    }
    up.ProcessState = 'Applied'; up.ProcessNote = ''; touch(up);
    if (CLOSE_REQ(kind, oc)) { addNotice(db, 'E19-u' + up.ID, 'E19', ac.ID); }
  }
  function addNotice(db, key, kind, actionId) {
    if (db.lists['1-to-1 Action Notices'].some(function (n) { return n.NoticeKey === key; })) { return null; }
    var n = addItem(db, '1-to-1 Action Notices', { Title: key, NoticeKey: key, Kind: kind, ActionId: actionId, Status: 'Pending', Attempts: 0 });
    flow11(db, n); return n;
  }
  // Flow 11: Pending / Retry → Sending → Sent, or Failed (db.noticeFail). db.failAfterSend: the run dies mid-send (stays Sending).
  function flow11(db, n) {
    if (db.flow11Off || ['Pending', 'Retry'].indexOf(n.Status) < 0) { return; }
    var ac = db.lists['1-to-1 Actions'].find(function (x) { return x.ID === n.ActionId; }), u = ac ? userOfClaims(ac.Technician) : null;
    if (!ac || ac.Status === 'Closed' || (n.Kind === 'E19' && ac.Status !== 'Ready for close-out')) { n.Status = 'Cancelled'; touch(n); return; }
    n.Status = 'Sending'; touch(n);
    if (db.failAfterSend) { db.emails.push({ to: n.Kind === 'E19' ? 'TL' : u.email, template: n.Kind, actionId: ac.ID, unknown: true }); return; }
    if (db.noticeFail) { n.Status = 'Failed'; n.Attempts = (n.Attempts || 0) + 1; n.LastError = 'Mailbox unavailable (simulated)'; touch(n); return; }
    db.emails.push(n.Kind === 'E19' ? { to: 'TL', template: 'E19', actionId: ac.ID } : { to: u.email, cc: 'TL', template: 'E20', actionId: ac.ID });
    n.Status = 'Sent'; n.SentOn = nowIso(); n.Attempts = (n.Attempts || 0) + 1; n.LastError = ''; touch(n);
  }
  function seedTracker(db, today, xss) {
    var acts = db.lists['1-to-1 Actions'];
    function day(n) { return new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
    function hist(it, e) { var h0 = JSON.parse(it.HistoryJson || '[]'); h0.push(e); it.HistoryJson = JSON.stringify(h0); }
    var alex = USERS[1], sam = USERS[2], casey = USERS[4];
    // Test A: one in progress (overdue), one waiting on something outside it, one of theirs; plus one added by the Team Leader
    function mk(u, title, owner, due, extra) {
      var it = addItem(db, '1-to-1 Actions', { Title: title, ActionKey: 'tl-seed' + acts.length, Technician: claimsOf(u), Owner: owner, Criteria: 'Evidence shared with the Team Leader.',
        OriginMonth: today.slice(0, 7), OriginalDue: dateOnlyUtc(due), CurrentDue: dateOnlyUtc(due), Status: 'Open',
        HistoryJson: JSON.stringify([{ id: 'c', at: nowIso(), by: 'Team Leader (mock)', role: 'tl', kind: 'created', month: today.slice(0, 7), text: 'Added on the Actions page' }]), SharedWith: '' });
      Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
      flow9(db, it); return it;
    }
    var a1 = mk(alex, 'Complete the confined space refresher', 'Technician', day(-3), { OriginMonth: addMonths(today.slice(0, 7), -1) });
    a1.Status = 'In progress'; a1.LatestProgress = 'Booked onto the course; waiting for the joining pack.'; a1.LastUpdateOn = dateOnlyUtc(day(-12)); a1.LastUpdateBy = alex.title;
    hist(a1, { id: 'useed1', at: dateOnlyUtc(day(-12)), by: alex.title, kind: 'progress', text: a1.LatestProgress });
    var a2 = mk(alex, 'Replace the faulty area 3 monitor head', 'Team Leader', day(9));
    a2.Status = 'Waiting'; a2.WaitingReason = 'Spare part on order from the supplier (expected next week).'; a2.WaitingUntil = day(6);
    hist(a2, { id: 'tseed2', at: dateOnlyUtc(day(-4)), by: 'Team Leader (mock)', role: 'tl', kind: 'waiting', text: a2.WaitingReason, waitingUntil: a2.WaitingUntil });
    var a3 = mk(sam, 'Shadow two permit issues', 'Technician', day(20));
    a3.Status = 'Ready for close-out'; a3.LatestProgress = 'Both permit issues shadowed and signed off.'; a3.LastUpdateOn = dateOnlyUtc(day(-1)); a3.LastUpdateBy = sam.title;
    hist(a3, { id: 'useed3', at: dateOnlyUtc(day(-1)), by: sam.title, kind: 'closeRequest', text: a3.LatestProgress });
    var a4 = mk(casey, 'Review the area 3 routine schedule', 'Technician', day(-40), { OriginMonth: addMonths(today.slice(0, 7), -2) });
    a4.Status = 'Open';
    if (xss) {
      a1.Title = 'Refresher ' + X[0]; a1.Criteria = X[1]; a1.LatestProgress = X[2]; a2.WaitingReason = X[3]; a2.DecisionNote = X[4];
      hist(a1, { id: 'uxss', at: nowIso(), by: X[0], kind: 'progress', text: X.join(' '), month: X[2], outcome: X[1] });
      hist(a1, { id: 'uxss2', at: nowIso(), by: alex.title, kind: X[0], text: X[3] });
    }
  }

  // ---------------------------------------------------------------- persistence
  function loadDb(xss) {
    try { var raw = sessionStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); if (d && d.lists && !!d.xss === !!xss) { return d; } } } catch (_) { /* fresh */ }
    var db = seed(xss); db.xss = !!xss; saveDb(db); return db;
  }
  function saveDb(db) { try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* ignore */ } }

  // ---------------------------------------------------------------- permission model (D.4)
  function ownFolder(db, u) { var f = Object.keys(db.folders || {}).find(function (k) { return db.folders[k] === u.email; }); return f || null; }
  function canSeeList(db, list, u) {
    if (u.owner) { return !!db.lists[list]; }
    if (list === '1-to-1 Settings' || list === '1-to-1 Feedback') { return true; }   // group: Read / Submit (own items only)
    if (list === '1-to-1 Action Updates' && ownFolder(db, u)) { return true; }        // Limited Access through their own folder
    if (db.perms[list]) { return Object.keys(db.perms[list]).some(function (id) { return !!db.perms[list][id][u.email]; }); }
    return false;
  }
  // an update item without its own permissions inherits its folder's: the technician's Submit (add, read, edit – no delete)
  function updRole(db, it, u) {
    var p = db.perms['1-to-1 Action Updates'][it.ID];
    if (p) { return p[u.email] || null; }
    var folder = it.FSObjType === 1 ? it.Title : String(it.FileDirRef || '').split('/').pop();
    return db.folders[folder] === u.email ? 'edit' : null;
  }
  function canRead(db, list, id, u) {
    if (u.owner) { return true; }
    if (list === '1-to-1 Settings') { return true; }
    if (list === '1-to-1 Action Updates') { var it = db.lists[list].find(function (x) { return x.ID === id; }); return !!it && !!updRole(db, it, u); }
    return !!(db.perms[list] && db.perms[list][id] && db.perms[list][id][u.email]);
  }
  function canWrite(db, list, id, u) {
    if (u.owner) { return true; }
    if (list === '1-to-1 Action Updates') { var it = db.lists[list].find(function (x) { return x.ID === id; }); return !!it && it.FSObjType !== 1 && updRole(db, it, u) === 'edit'; }
    return !!(db.perms[list] && db.perms[list][id] && db.perms[list][id][u.email] === 'edit');
  }
  function etagOf(it) { return '"' + (it.__v || 1) + '"'; }
  function serialize(list, it, meta) {
    var out = {}, sc = SCHEMA[list];
    Object.keys(it).forEach(function (k) {
      if (k === '__v') { return; }
      if (sc[k] && sc[k].t === 'person') { out[k] = person(userByClaims(it[k])); } else { out[k] = it[k] === undefined ? null : it[k]; }
    });
    Object.keys(sc).forEach(function (k) { if (!(k in out)) { out[k] = sc[k].t === 'person' ? null : (sc[k].t === 'bool' ? false : null); } });
    if (list === '1-to-1 Action Updates') { out.FSObjType = it.FSObjType === 1 ? 1 : 0; out.FileDirRef = it.FileDirRef || listUrl(list); }
    out.Modified = it.Modified || null;
    if (meta) { out['odata.etag'] = etagOf(it); }
    return out;
  }
  // the simple $filter forms the page uses: Field eq 'v' / Field ne 'v' (joined by and)
  function filterRows(rows, q) {
    var m = /(?:^|&)\$filter=([^&]*)/.exec(q); if (!m) { return rows; }
    var f = decodeURIComponent(m[1].replace(/\+/g, ' '));
    var parts = f.split(/\s+and\s+/i).map(function (c) { var x = /^\s*(\w+)\s+(eq|ne)\s+'((?:[^']|'')*)'\s*$/.exec(c); return x ? { f: x[1], op: x[2], v: x[3].replace(/''/g, "'") } : null; });
    if (parts.some(function (x) { return !x; })) { return null; }
    return rows.filter(function (it) { return parts.every(function (c) { var v = it[c.f] === null || it[c.f] === undefined ? '' : String(it[c.f]); return c.op === 'eq' ? v === c.v : v !== c.v; }); });
  }
  function uniqueClash(db, list, name, value, selfId) {
    var f = SCHEMA[list][name];
    return !!(f && f.unique && value !== '' && value !== null && db.lists[list].some(function (x) { return x.ID !== selfId && x[name] === value; }));
  }

  // ---------------------------------------------------------------- value coercion (validateUpdateListItem)
  function coerce(list, name, value) {
    var f = SCHEMA[list][name];
    if (!f || READ_ONLY.indexOf(name) >= 0) { return { err: 'Column \'' + name + '\' does not exist or is read-only.' }; }
    var v = value === null || value === undefined ? '' : String(value);
    switch (f.t) {
      case 'text': if (v.length > 255) { return { err: 'Text too long (max 255)' }; } return { v: v };
      case 'note': return { v: v };
      case 'num':
        if (v === '') { return { v: null }; }
        if (!/^-?\d+(\.\d+)?$/.test(v)) { return { err: 'Enter a valid number.' }; }
        var n = Number(v);
        if (f.min !== undefined && (n < f.min || n > f.max)) { return { err: 'The value must be between ' + f.min + ' and ' + f.max + '.' }; }
        return { v: n };
      case 'choice':
        if (v === '') { return { v: null }; }
        if (f.c.indexOf(v) < 0) { return { err: 'Invalid choice value: ' + v }; }
        return { v: v };
      case 'bool':
        if (v === '1' || v === 'Yes' || v === 'true') { return { v: true }; }
        if (v === '0' || v === 'No' || v === 'false' || v === '') { return { v: false }; }
        return { err: 'Invalid yes/no value' };
      case 'date': case 'datetime':
        if (v === '') { return { v: null }; }
        var iso = null, mi = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v), m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
        if (mi && LOCALE.indexOf('noiso') < 0) { iso = v; }
        else if (m) { iso = LOCALE.indexOf('us') === 0 ? m[3] + '-' + m[1] + '-' + m[2] : m[3] + '-' + m[2] + '-' + m[1]; }
        if (!iso) { return { err: 'You must specify a valid date within the range of 01/01/1900 and 31/12/8900.' }; }
        var d = new Date(iso + 'T12:00:00Z');
        if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) { return { err: 'You must specify a valid date.' }; }
        return { v: dateOnlyUtc(iso) };
      case 'person':
        if (v === '') { return { v: null }; }
        var arr; try { arr = JSON.parse(v); } catch (_) { return { err: 'The user does not exist or is not unique.' }; }
        var u = Array.isArray(arr) && arr[0] ? userByClaims(arr[0].Key) : null;
        if (!u) { return { err: 'The user does not exist or is not unique.' }; }
        return { v: claimsOf(u) };
    }
    return { err: 'Unsupported' };
  }

  // ---------------------------------------------------------------- flow effects
  function flow2(db, rv, editor) {
    if (['Not Started', 'Draft'].indexOf(rv.ReviewStatus) >= 0) { return; }
    var mr = db.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === rv.ID; });
    if (!mr) { return; }
    var u = userByClaims(mr.Technician);
    var prev = mr.ReviewState;
    db.perms['Monthly Reviews'][rv.ID] = {}; db.perms['Monthly Reviews'][rv.ID][u.email] = 'read';   // the lock is always re-applied
    if (editor && editor.owner && prev !== 'Open') { db.flow2Cancelled = (db.flow2Cancelled || 0) + 1; return; }   // a Team Leader amendment
    if (prev === 'Open') {
      mr.ReviewState = 'Submitted'; mr.SubmittedOn = nowIso(); mr.SubmittedLate = Date.now() > Date.parse(mr.DueDate);
      mr.TechFollowUp = rv.Q9FollowUp || '';
      db.emails.push({ to: 'TL', template: 'E3', reviewId: rv.ID });
    }
    rv.ReviewStatus = prev === 'Open' ? 'Submitted' : prev;
  }
  function flow3(db, mr) {
    if (['Completed', 'Closed - Not Submitted'].indexOf(mr.ReviewState) < 0 || mr.ReleasedOn) { return; }
    var valid = (mr.ReviewState === 'Completed' && mr.SubmittedOn) ||
      (mr.ReviewState === 'Closed - Not Submitted' && !mr.SubmittedOn && Date.parse(mr.DueDate) < Date.now());
    if (!valid) { mr.ReviewState = mr.SubmittedOn ? 'Submitted' : 'Open'; db.emails.push({ to: 'TL', template: 'rejected', mrId: mr.ID }); return; }
    var u = userByClaims(mr.Technician);
    db.perms['Monthly Reviews'][mr.ReviewItemId] = {}; db.perms['Monthly Reviews'][mr.ReviewItemId][u.email] = 'read';
    db.perms['Manager Reviews'][mr.ID] = {}; db.perms['Manager Reviews'][mr.ID][u.email] = 'read';
    mr.ReleasedOn = nowIso(); mr.CompletedOn = mr.ReleasedOn; mr.CompletedBy = 'team.leader@example.test';
    var rv = db.lists['Monthly Reviews'].find(function (x) { return x.ID === mr.ReviewItemId; });
    if (rv) { rv.ReviewStatus = mr.ReviewState; }
    db.emails.push({ to: u.email, template: mr.ReviewState === 'Completed' ? 'E4' : 'E5', reviewId: mr.ReviewItemId });
    trackRelease(db, mr, mr.ReleasedOn);   // 1.5: the agreed actions go into the tracker (once each)
  }

  // Flow 4: the 1-to-1 group follows the Technicians list (Active = in the group)
  function flow4(db, it) {
    var u = userByClaims(it.Technician); if (!u) { return; }
    var i = db.group.indexOf(u.email);
    if (it.Active && i < 0) { db.group.push(u.email); db.emails.push({ to: 'TL', template: 'E8', who: u.email }); }
    if (!it.Active && i >= 0) { db.group.splice(i, 1); db.emails.push({ to: 'TL', template: 'E8', who: u.email }); }
  }
  // Flow 5: wellbeing item permissions and the trusted stamps. The trusted person is the one holding a
  // permission on the item (set by the flow), never the editable Technician column.
  function flow5(db, it, created) {
    var P = db.perms['Wellbeing Assessments'];
    if (created || !P[it.ID]) {
      var u0 = userByClaims(it.Technician); if (!u0) { return; }
      P[it.ID] = {}; P[it.ID][u0.email] = 'edit'; db.emails.push({ to: u0.email, template: 'E9', wbId: it.ID }); return;
    }
    var email = Object.keys(P[it.ID])[0], role = P[it.ID][email], u = userByEmail(email);
    if (role === 'edit' && it.AssessmentStatus !== 'Open') {
      P[it.ID][email] = 'read'; it.Technician = claimsOf(u);
      it.AssessmentStatus = 'Submitted'; it.SubmittedOn = nowIso(); it.ArrangementsJson = ''; it.ManagerNotes = ''; it.NextReviewDate = null; it.CompletedOn = null;
      db.emails.push({ to: 'TL', template: 'E10', wbId: it.ID }); return;
    }
    if (role === 'read' && it.AssessmentStatus === 'Completed' && !it.CompletedOn && it.SubmittedOn) {
      it.CompletedOn = nowIso(); db.emails.push({ to: email, template: 'E11', wbId: it.ID });
    }
  }

  // Flow 6: lock the feedback item to Owners, email the line manager; on a mail failure mark it Failed and send a short notice.
  function flow6(db, it, u) {
    delete db.perms['1-to-1 Feedback'][it.ID]; it.HasUniqueRoleAssignments = true;
    var day = Date.now() - 86400000;
    if (db.lists['1-to-1 Feedback'].filter(function (x) { return x.Author === it.Author && new Date(x.Created).getTime() > day; }).length > 10) {
      it.DeliveryStatus = 'Held'; it.SentOn = nowIso(); return;
    }
    if (db.fbFail) { it.DeliveryStatus = 'Failed'; db.emails.push({ to: 'TL', template: 'E13-notice', fbId: it.ID }); return; }
    it.DeliveryStatus = 'Sent'; it.SentOn = nowIso();
    db.emails.push({ to: 'TL', template: 'E13', fbId: it.ID, from: u.email, type: it.FeedbackType, page: it.PageName, message: it.Message });
  }

  // Flow 8: an amendment ready to send (Pending / Retry) → re-read, Sending, then Sent – or Failed and a notice to the TL.
  // db.flow8Off: the flow is off (the item stays Pending). db.amFail: the email to the technician fails.
  function flow8(db, it) {
    if (db.flow8Off || ['Pending', 'Retry'].indexOf(it.NotifyStatus) < 0) { return; }
    var u = userByClaims(it.Technician);
    it.NotifyStatus = 'Sending';
    if (db.amFail || !u) { it.NotifyStatus = 'Failed'; it.NotifyError = 'The email to the technician could not be sent.'; db.emails.push({ to: 'TL', template: 'E16-notice', amId: it.ID }); return; }
    it.NotifyStatus = 'Sent'; it.NotifiedOn = nowIso(); it.NotifyError = '';
    db.emails.push({ to: u.email, template: 'E16', amId: it.ID, reviewId: it.ReviewItemId, month: it.MonthKey });
  }

  // ---------------------------------------------------------------- REST router
  function resp(status, body) {
    var text = body === undefined ? '' : JSON.stringify(body);
    return Promise.resolve({ status: status, ok: status >= 200 && status < 300, text: function () { return Promise.resolve(text); }, json: function () { return Promise.resolve(body); } });
  }
  function spError(status, msg) { return resp(status, { 'odata.error': { code: '-2147024891, System.UnauthorizedAccessException', message: { lang: 'en-US', value: msg } } }); }
  function makeClient(db, u) {
    function handle(method, url, options) {
      var headers = (options && options.headers) || {};
      if (url.indexOf(SITE) !== 0) { return spError(400, 'Cross-site request blocked by the mock'); }
      var rest = url.slice(SITE.length), q = '';
      var qi = rest.indexOf('?'); if (qi >= 0) { q = rest.slice(qi + 1); rest = rest.slice(0, qi); }
      if (method === 'GET' && rest === '/_api/web/currentuser') { return resp(200, { Id: u.id, Title: u.title, Email: u.email, LoginName: claimsOf(u) }); }
      if (method === 'GET' && rest === '/_api/web/effectiveBasePermissions') { return resp(200, u.owner ? { High: '2147483647', Low: '4294967295' } : { High: '176', Low: '138612833' }); }
      if (method === 'POST' && rest === '/_api/contextinfo') { return resp(200, { FormDigestValue: db.digest, FormDigestTimeoutSeconds: 1800, WebFullUrl: SITE }); }
      if (method === 'POST' && rest === '/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.clientPeoplePickerSearchUser') {
        if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
        var qp = (JSON.parse(options.body || '{}').queryParams || {}), term = String(qp.QueryString || '').toLowerCase();
        var hits = USERS.filter(function (x) { return term && (x.title.toLowerCase().indexOf(term) >= 0 || x.email.indexOf(term) >= 0); }).slice(0, qp.MaximumEntitySuggestions || 8);
        return resp(200, { value: JSON.stringify(hits.map(function (x) { return { Key: claimsOf(x), DisplayText: x.title, IsResolved: true, EntityType: 'User', EntityData: { Email: x.email, Title: x.job || '' } }; })) });
      }
      var m = /^\/_api\/web\/lists\/getbytitle\('([^']*(?:''[^']*)*)'\)(\/.*)?$/.exec(rest);
      if (!m) { return spError(404, 'Not found: ' + rest); }
      var list = decodeURIComponent(m[1]).replace(/''/g, "'"), tail = m[2] || '';
      if (!db.lists[list] || (db.v13 && list === '1-to-1 Amendments') || ((db.v13 || db.v14) && TRACKER.indexOf(list) >= 0)) { return spError(404, 'List \'' + list + '\' does not exist at site with URL \'' + SITE + '\'.'); }
      if ((db.v13 || db.v14) && method === 'GET' && /ActionsSyncedOn/.test(decodeURIComponent(q))) {   // test hook: Setup 1.5 not run yet
        return resp(400, { 'odata.error': { code: '-1, System.ArgumentException', message: { lang: 'en-US', value: 'Column \'ActionsSyncedOn\' does not exist.' } } });
      }
      var meta = /minimalmetadata/.test(String(headers['Accept'] || ''));
      if (db.v13 && method === 'GET' && /AppraisalBoundaries|NextWellbeingDate|AppraisalCycleStart|AppraisalHistoryJson/.test(decodeURIComponent(q))) {   // test hook: Setup 1.4 not run yet
        return resp(400, { 'odata.error': { code: '-1, System.ArgumentException', message: { lang: 'en-US', value: 'Column does not exist.' } } });
      }
      if (!canSeeList(db, list, u)) { return spError(404, 'List \'' + list + '\' does not exist at site with URL \'' + SITE + '\'.'); }
      if (method === 'GET' && tail === '') { return u.owner ? resp(200, { Id: 'list-' + list.replace(/\W/g, '') }) : spError(403, 'Access denied.'); }
      if (method === 'GET' && tail === '/items' && list === 'Manager Reviews' && db.missingMrColumn && q.indexOf(db.missingMrColumn) >= 0) {   // test hook
        return resp(400, { 'odata.error': { code: '-1, System.ArgumentException', message: { lang: 'en-US', value: 'Column \'' + db.missingMrColumn + '\' does not exist.' } } });
      }
      if (method === 'GET' && tail === '/items') {
        var vis = db.lists[list].filter(function (it) { return canRead(db, list, it.ID, u); });
        if ((db.v13 || db.v14) && list === '1-to-1 Settings') { vis = vis.filter(function (it) { return it.Title !== 'ActionsTrackerStart'; }); }
        vis = filterRows(vis, q);
        if (!vis) { return resp(400, { 'odata.error': { code: '-1', message: { lang: 'en-US', value: 'Filter not supported by the mock' } } }); }
        return resp(200, { value: vis.map(function (it) { return serialize(list, it, meta); }) });
      }
      if (method === 'GET' && tail === '/RootFolder') { return u.owner || list === '1-to-1 Feedback' ? resp(200, { ServerRelativeUrl: listUrl(list) }) : spError(403, 'Access denied.'); }
      var im = /^\/items\((\d+)\)(\/validateUpdateListItem|\/recycle\(\))?$/.exec(tail);
      if (im) {
        var id = Number(im[1]);
        var it = db.lists[list].find(function (x) { return x.ID === id; });
        if (!it || !canRead(db, list, id, u)) { return spError(404, 'Item does not exist. It may have been deleted by another user.'); }
        if (method === 'GET' && !im[2]) { return resp(200, serialize(list, it, meta)); }
        // REST MERGE (the page: 1-to-1 Actions only, Team Leader). IF-MATCH must be '*' or the item's current etag, else 412.
        if (method === 'POST' && !im[2] && String(headers['X-HTTP-Method'] || '').toUpperCase() === 'MERGE') {
          if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
          if (!canWrite(db, list, id, u)) { return spError(403, 'Access denied. You do not have permission to perform this action or access this resource.'); }
          var im2 = headers['IF-MATCH'];
          if (!im2 || (im2 !== '*' && im2 !== etagOf(it))) { db.stale = (db.stale || 0) + 1; saveDb(db); return resp(412, { 'odata.error': { code: '-1, Microsoft.SharePoint.Client.ClientServiceException', message: { lang: 'en-US', value: 'The request ETag value does not match the object\'s ETag value.' } } }); }
          if (db.failWrites > 0) { db.failWrites--; return spError(500, 'Simulated server error'); }
          var mb = JSON.parse(options.body || '{}'), set = {}, bad = '';
          Object.keys(mb).forEach(function (k) {
            var f = SCHEMA[list][k];
            if (!f || READ_ONLY.indexOf(k) >= 0) { bad = bad || 'Column \'' + k + '\' does not exist.'; return; }
            var v = mb[k];
            if (f.t === 'choice' && v !== null && v !== '' && f.c.indexOf(v) < 0) { bad = bad || 'Invalid choice value: ' + v; return; }
            if ((f.t === 'date' || f.t === 'datetime') && v) { var d = new Date(v); if (isNaN(d.getTime())) { bad = bad || 'Invalid date'; return; } v = d.toISOString().replace('.000', ''); }
            if (f.t === 'text' && v && String(v).length > 255) { bad = bad || 'Text too long'; return; }
            if (uniqueClash(db, list, k, v, id)) { bad = bad || 'Duplicate value'; return; }
            set[k] = v === '' && (f.t === 'date' || f.t === 'datetime') ? null : v;
          });
          if (bad) { return resp(400, { 'odata.error': { code: '-1', message: { lang: 'en-US', value: bad } } }); }
          Object.keys(set).forEach(function (k) { it[k] = set[k]; });
          touch(it);
          db.writes.push({ as: u.key, list: list, id: id, merge: true, fields: Object.keys(set), values: set, ifMatch: im2 });
          if (list === '1-to-1 Actions') { flow9(db, it); }
          if (list === '1-to-1 Action Notices') { flow11(db, it); }
          saveDb(db);
          return resp(204);
        }
        if (method === 'POST' && im[2] === '/recycle()') {
          if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
          if (!u.owner) { return spError(403, 'Access denied. You do not have permission to perform this action or access this resource.'); }   // no Delete in the technicians' levels
          db.lists[list] = db.lists[list].filter(function (x) { return x !== it; });
          db.recycled.push({ list: list, item: it, by: u.key });
          db.writes.push({ as: u.key, list: list, id: id, recycle: true, fields: [] });
          saveDb(db);
          return resp(200, { value: 'recycle-' + list.replace(/\W/g, '') + '-' + id });
        }
        if (method === 'POST' && im[2] === '/validateUpdateListItem') {
          if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
          if (!canWrite(db, list, id, u)) { return spError(403, 'Access denied. You do not have permission to perform this action or access this resource.'); }
          if (db.failWrites > 0) { db.failWrites--; return spError(500, 'Simulated server error'); }   // test hook
          var body = JSON.parse(options.body || '{}');
          var results = [], ok = true, pending = {};
          (body.formValues || []).forEach(function (fv) {
            var c = coerce(list, fv.FieldName, fv.FieldValue);
            if (!c.err && uniqueClash(db, list, fv.FieldName, c.v, id)) { c = { err: 'The list item could not be added or updated because duplicate values were found in the following field(s) in the list: [' + fv.FieldName + '].' }; }
            if (c.err) { ok = false; results.push({ ErrorCode: -1, ErrorMessage: c.err, FieldName: fv.FieldName, FieldValue: fv.FieldValue, HasException: true, ItemId: id }); }
            else { pending[fv.FieldName] = c.v; results.push({ ErrorCode: 0, ErrorMessage: null, FieldName: fv.FieldName, FieldValue: fv.FieldValue, HasException: false, ItemId: id }); }
          });
          if (ok) {
            Object.keys(pending).forEach(function (k) { it[k] = pending[k]; });
            touch(it);
            db.writes.push({ as: u.key, list: list, id: id, fields: Object.keys(pending), values: (body.formValues || []).reduce(function (o, fv) { o[fv.FieldName] = fv.FieldValue; return o; }, {}) });
            if (list === 'Monthly Reviews') { flow2(db, it, u); }   // runs on every change, as the real trigger does
            if (list === 'Manager Reviews' && 'ReviewState' in pending) { flow3(db, it); }
            if (list === 'Technicians' && 'Active' in pending) { flow4(db, it); }
            if (list === 'Wellbeing Assessments') { flow5(db, it, false); }
            if (list === '1-to-1 Amendments' && 'NotifyStatus' in pending) { flow8(db, it); }
            if (list === '1-to-1 Actions') { flow9(db, it); }
            if (list === '1-to-1 Action Updates') { flow10(db, it); }
            if (list === '1-to-1 Action Notices' && 'Status' in pending) { flow11(db, it); }
            saveDb(db);
          }
          return resp(200, { value: results });
        }
      }
      if (method === 'POST' && tail === '/AddValidateUpdateItemUsingPath') {
        if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
        var b = JSON.parse(options.body || '{}');
        if (!b.listItemCreateInfo || !b.listItemCreateInfo.FolderPath || !b.listItemCreateInfo.FolderPath.DecodedUrl) { return spError(400, 'listItemCreateInfo is required'); }
        // where the item goes: the list's root, or (Action Updates) a person's folder – a technician may add only into their own
        var fp = String(b.listItemCreateInfo.FolderPath.DecodedUrl).replace(/\/+$/, ''), dirName = '';
        if (fp !== listUrl(list)) {
          var fm = fp.indexOf(listUrl(list) + '/') === 0 ? fp.slice(listUrl(list).length + 1) : null;
          if (list !== '1-to-1 Action Updates' || !fm || !db.folders[fm]) { return spError(u.owner ? 400 : 403, u.owner ? 'Folder not found' : 'Access denied.'); }
          dirName = fm;
        }
        if (!u.owner && !(list === '1-to-1 Feedback' && !dirName) && !(list === '1-to-1 Action Updates' && dirName && db.folders[dirName] === u.email)) { return spError(403, 'Access denied.'); }
        var item = { ID: db.nextId[list]++, Modified: nowIso(), __v: 1 }, res = [], good = true;
        if (list === '1-to-1 Action Updates') { item.FileDirRef = listUrl(list) + (dirName ? '/' + dirName : ''); item.FSObjType = 0; }
        (b.formValues || []).forEach(function (fv) {
          var c = coerce(list, fv.FieldName, fv.FieldValue);
          if (!c.err && uniqueClash(db, list, fv.FieldName, c.v, -1)) { c = { err: 'The list item could not be added or updated because duplicate values were found in the following field(s) in the list: [' + fv.FieldName + '].' }; }
          if (c.err) { good = false; res.push({ FieldName: fv.FieldName, HasException: true, ErrorMessage: c.err }); } else { item[fv.FieldName] = c.v; res.push({ FieldName: fv.FieldName, HasException: false, ErrorMessage: null }); }
        });
        if (good) {
          db.lists[list].push(item); res.push({ FieldName: 'Id', FieldValue: String(item.ID), HasException: false, ErrorMessage: null });
          if (list === 'Technicians') { flow4(db, item); }
          if (list === 'Wellbeing Assessments') { flow5(db, item, true); }
          if (list === '1-to-1 Feedback') {
            item.Author = claimsOf(u); item.Created = nowIso(); item.DeliveryStatus = item.DeliveryStatus || 'Pending';
            db.perms[list][item.ID] = {}; db.perms[list][item.ID][u.email] = 'edit';   // item-level security: own item only
            flow6(db, item, u);
          }
          if (list === '1-to-1 Amendments') { item.Author = claimsOf(u); item.Created = nowIso(); flow8(db, item); }
          if (list === '1-to-1 Actions') { item.Created = nowIso(); flow9(db, item); }
          if (list === '1-to-1 Action Updates') { item.Author = claimsOf(u); item.Created = nowIso(); item.ProcessState = item.ProcessState || 'Pending'; flow10(db, item); }
          if (list === '1-to-1 Action Notices') { item.Created = nowIso(); item.Status = item.Status || 'Pending'; flow11(db, item); }
          db.writes.push({ as: u.key, list: list, id: item.ID, create: true, fields: (b.formValues || []).map(function (fv) { return fv.FieldName; }), values: (b.formValues || []).reduce(function (o, fv) { o[fv.FieldName] = fv.FieldValue; return o; }, {}) });
          saveDb(db);
        } else { db.nextId[list]--; }
        return resp(200, { value: res });
      }
      return spError(405, 'Not supported by the mock: ' + method + ' ' + rest);
    }
    function Client() {}
    Client.configurations = { v1: { mock: true } };
    Client.prototype.get = function (url, cfg, options) { return handle('GET', url, options); };
    // test hook: db.latency (ms) delays every POST, like a real server, so double clicks can be tested
    Client.prototype.post = function (url, cfg, options) {
      if (!db.latency) { return handle('POST', url, options); }
      return new Promise(function (res) { setTimeout(function () { res(handle('POST', url, options)); }, db.latency); });
    };
    return new Client();
  }

  window.OTO_MOCK = {
    SITE: SITE, USERS: USERS, X: X,
    db: function (xss) { return loadDb(xss); },
    reset: function () { try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ } },
    // test hook: run Flow 8 for any amendment waiting (as if it had just been switched on)
    runFlow8: function () { var db = window.OTO_MOCK.current.db; db.lists['1-to-1 Amendments'].forEach(function (it) { flow8(db, it); }); saveDb(db); },
    // 1.5 hooks: the daily reconciliation (flow 1), and flows 9 / 10 / 11 catching up (as if they had just been switched on)
    runFlow1Sync: function () { var db = window.OTO_MOCK.current.db; db.lists['Manager Reviews'].forEach(function (mr) { if (mr.ReleasedOn) { trackRelease(db, mr, mr.ReleasedOn); } }); saveDb(db); },
    runFlow9: function () { var db = window.OTO_MOCK.current.db; db.lists['1-to-1 Actions'].forEach(function (it) { flow9(db, it); }); saveDb(db); },
    runFlow10: function () { var db = window.OTO_MOCK.current.db; db.lists['1-to-1 Action Updates'].forEach(function (it) { flow10(db, it); }); saveDb(db); },
    runFlow11: function () { var db = window.OTO_MOCK.current.db; db.lists['1-to-1 Action Notices'].forEach(function (it) { flow11(db, it); }); saveDb(db); },
    addNotice: function (key, kind, actionId) { var db = window.OTO_MOCK.current.db; var n = addNotice(db, key, kind, actionId); saveDb(db); return n ? n.ID : 0; },
    userByKey: function (k) { return USERS.find(function (u) { return u.key === k; }) || USERS[0]; },
    ctx: function (userKey, xss) {
      var db = loadDb(xss), u = window.OTO_MOCK.userByKey(userKey);
      var client = makeClient(db, u);
      window.OTO_MOCK.current = { db: db, user: u, client: client };
      return { getWebPart: function () { return { spHttpClient: client, pageContext: { web: { absoluteUrl: SITE } } }; } };
    }
  };
})();
