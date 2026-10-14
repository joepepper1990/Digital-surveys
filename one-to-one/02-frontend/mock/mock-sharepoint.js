// ESG 1-to-1 – LOCAL MOCK of the SharePoint parts the frontend uses. For testing only; never uploaded.
//
// Emulates, in the browser, with entirely fictional people and data:
//   * Welcome's ctx.getWebPart() → { spHttpClient, pageContext.web.absoluteUrl }
//   * the REST endpoints one-to-one.js calls (nometadata JSON shapes)
//   * security trimming and item-level permissions exactly as IMPLEMENTATION_PLAN D.4 describes
//     (technician: EDIT own open Monthly Review, READ own locked review and own RELEASED Manager Review,
//      READ the 1-to-1 Settings list, nothing else; Team Leader: everything)
//   * field validation for validateUpdateListItem (choices, numbers, dd/MM/yyyy dates, yes/no, people)
//   * the observable effects of Flow 2 (submit → lock + stamp) and Flow 3 (complete/close → release)
// State persists in sessionStorage so you can switch user (TL ↔ Test A ↔ Test B) and carry on.
(function () {
  'use strict';
  var KEY = 'oto-mock-db-v4';
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
    ActionsStatus: ['None', 'Open', 'Done']
  };
  // field schemas: t = text | note | num | choice | date | datetime | bool | person
  function F(t, extra) { var f = { t: t }; Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; }); return f; }
  var SCHEMA = {
    'Technicians': { Title: F('text'), Technician: F('person'), TechnicianAadId: F('text'), Active: F('bool'), AppraisalDate: F('date') },
    'Appraisal Expectations': { Title: F('text'), Measures: F('note'), AppraisalYear: F('text'), AppliesTo: F('choice', { c: CHOICES.AppliesTo }),
      Technician: F('person'), SortOrder: F('num'), Active: F('bool') },
    'Monthly Reviews': { Title: F('text'), Technician: F('person'), MonthKey: F('text'), MonthStart: F('date'), DueDate: F('datetime'),
      ReviewStatus: F('choice', { c: CHOICES.ReviewStatus }), Q1WentWell: F('note'), Q2Issue: F('note'), Q2Impact: F('note'), Q2Tried: F('note'), Q2Support: F('note'),
      Q3WorkloadRating: F('num', { min: 1, max: 5 }), Q3WorkloadComment: F('note'), Q4WellbeingRaise: F('choice', { c: CHOICES.YesNo }), Q4WellbeingDetail: F('note'),
      Q5PlanningRaise: F('choice', { c: CHOICES.YesNo }), Q5PlanningDetail: F('note'), Q6DevRaise: F('choice', { c: CHOICES.YesNo }), Q6DevWhat: F('note'), Q6DevWhy: F('note'),
      Q7ManagerFeedback: F('note'), ExpectationsJson: F('note'), Q9FollowUp: F('choice', { c: CHOICES.Follow }), Mood: F('num', { min: 1, max: 5 }), WinOfMonth: F('note'),
      AppraisalDate: F('date') },
    'Manager Reviews': { Title: F('text'), ReviewKey: F('text'), ReviewItemId: F('num'), Technician: F('person'), TechnicianAadId: F('text'), MonthKey: F('text'),
      DueDate: F('datetime'), ReviewState: F('choice', { c: CHOICES.ReviewState }), LinkSentOn: F('datetime'), SubmittedOn: F('datetime'), SubmittedLate: F('bool'),
      TechFollowUp: F('text'), ExpectationSnapshotJson: F('note'), FB_Q1: F('note'), FB_Q2: F('note'), FB_Q3: F('note'), FB_Q4: F('note'), FB_Q5: F('note'),
      FB_Q6: F('note'), FB_Q7: F('note'), FB_Q9: F('note'), FB_Overall: F('note'), ExpectationFeedbackJson: F('note'), FollowUpDecision: F('choice', { c: CHOICES.Follow }),
      MeetingDate: F('date'), ActionsJson: F('note'), ActionsStatus: F('choice', { c: CHOICES.ActionsStatus }), NextActionDue: F('date'), CompletedOn: F('datetime'),
      CompletedBy: F('text'), ReleasedOn: F('datetime'), CorrectionLog: F('note') },
    '1-to-1 Settings': { Title: F('text'), Value: F('note') }
  };

  // ---------------------------------------------------------------- people (fictional)
  var USERS = [
    { key: 'tl', id: 1, title: 'Team Leader (mock)', email: 'team.leader@example.test', owner: true },
    { key: 'alex', id: 11, title: 'Alex Morgan', email: 'alex.morgan@example.test', label: 'Test A' },
    { key: 'sam', id: 12, title: 'Sam Patel', email: 'sam.patel@example.test', label: 'Test B' },
    { key: 'jordan', id: 13, title: 'Jordan Lee', email: 'jordan.lee@example.test' },
    { key: 'casey', id: 14, title: 'Casey Brooks', email: 'casey.brooks@example.test' },
    { key: 'riley', id: 15, title: 'Riley Evans', email: 'riley.evans@example.test' },
    { key: 'taylor', id: 16, title: 'Taylor Reed', email: 'taylor.reed@example.test' }
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
  function dateOnlyUtc(iso) { var off = offsetHours(iso); return new Date(Date.parse(iso + 'T00:00:00Z') - off * 3600000).toISOString().replace('.000', ''); }
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
    var db = { nextId: {}, lists: {}, perms: { 'Monthly Reviews': {}, 'Manager Reviews': {} }, writes: [], emails: [], digest: 'MOCKDIGEST-' + Date.now() };
    Object.keys(SCHEMA).forEach(function (l) { db.lists[l] = []; db.nextId[l] = 1; });
    function add(list, fields) { var id = db.nextId[list]++; var it = { ID: id }; Object.keys(fields).forEach(function (k) { it[k] = fields[k]; }); db.lists[list].push(it); return it; }
    var today = londonToday(), CUR = today.slice(0, 7);
    var techUsers = USERS.filter(function (u) { return !u.owner; });
    var apOffsets = { alex: [4, '12'], sam: [3, '05'], jordan: [2, '22'], casey: [1, '18'], riley: [5, '09'], taylor: [4, '26'] };
    var yearStart = (+CUR.slice(5, 7) >= 4 ? +CUR.slice(0, 4) : +CUR.slice(0, 4) - 1);
    var YEAR = yearStart + '/' + String(yearStart + 1).slice(2);
    techUsers.forEach(function (u) {
      var o = apOffsets[u.key];
      add('Technicians', { Title: u.title, Technician: claimsOf(u), TechnicianAadId: 'aad-' + u.key, Active: true, AppraisalDate: dateOnlyUtc(addMonths(CUR, o[0]) + '-' + o[1]) });
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
        .sort(function (a, b) { return a.AppliesTo !== b.AppliesTo ? (a.AppliesTo === 'Shared' ? -1 : 1) : a.SortOrder - b.SortOrder; })
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
          AppraisalDate: techRow.AppraisalDate });
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
          acts.push({ id: 'a' + rv.ID, text: a[0], owner: a[1] === 'tech' ? u.title : 'Team Leader', criteria: a[2], due: dueA, status: closed ? 'Closed' : 'Open', closedOn: closed ? dueA : '' });
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
    if (xss) {
      var t = db.lists['Technicians'].find(function (x) { return x.Technician === claimsOf(USERS[5]); });
      t.Title = 'Riley ' + X[0];
    }
    return db;

    function release(rv, mr, u) {
      db.perms['Monthly Reviews'][rv.ID] = {}; db.perms['Monthly Reviews'][rv.ID][u.email] = 'read';
      db.perms['Manager Reviews'][mr.ID] = {}; db.perms['Manager Reviews'][mr.ID][u.email] = 'read';
    }
  }

  // ---------------------------------------------------------------- persistence
  function loadDb(xss) {
    try { var raw = sessionStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); if (d && d.lists && !!d.xss === !!xss) { return d; } } } catch (_) { /* fresh */ }
    var db = seed(xss); db.xss = !!xss; saveDb(db); return db;
  }
  function saveDb(db) { try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* ignore */ } }

  // ---------------------------------------------------------------- permission model (D.4)
  function canSeeList(db, list, u) {
    if (u.owner) { return !!db.lists[list]; }
    if (list === '1-to-1 Settings') { return true; }
    if (db.perms[list]) { return Object.keys(db.perms[list]).some(function (id) { return !!db.perms[list][id][u.email]; }); }
    return false;
  }
  function canRead(db, list, id, u) {
    if (u.owner) { return true; }
    if (list === '1-to-1 Settings') { return true; }
    return !!(db.perms[list] && db.perms[list][id] && db.perms[list][id][u.email]);
  }
  function canWrite(db, list, id, u) {
    if (u.owner) { return true; }
    return !!(db.perms[list] && db.perms[list][id] && db.perms[list][id][u.email] === 'edit');
  }
  function serialize(list, it) {
    var out = {}, sc = SCHEMA[list];
    Object.keys(it).forEach(function (k) {
      if (sc[k] && sc[k].t === 'person') { out[k] = person(userByClaims(it[k])); } else { out[k] = it[k] === undefined ? null : it[k]; }
    });
    Object.keys(sc).forEach(function (k) { if (!(k in out)) { out[k] = sc[k].t === 'person' ? null : (sc[k].t === 'bool' ? false : null); } });
    return out;
  }

  // ---------------------------------------------------------------- value coercion (validateUpdateListItem)
  function coerce(list, name, value) {
    var f = SCHEMA[list][name];
    if (!f) { return { err: 'Column \'' + name + '\' does not exist.' }; }
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
        var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
        if (!m) { return { err: 'You must specify a valid date within the range of 01/01/1900 and 31/12/8900.' }; }
        var iso = m[3] + '-' + m[2] + '-' + m[1];
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
  function flow2(db, rv) {
    if (['Not Started', 'Draft'].indexOf(rv.ReviewStatus) >= 0) { return; }
    var mr = db.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === rv.ID; });
    if (!mr) { return; }
    var u = userByClaims(mr.Technician);
    var prev = mr.ReviewState;
    db.perms['Monthly Reviews'][rv.ID] = {}; db.perms['Monthly Reviews'][rv.ID][u.email] = 'read';
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
      var m = /^\/_api\/web\/lists\/getbytitle\('([^']*(?:''[^']*)*)'\)(\/.*)?$/.exec(rest);
      if (!m) { return spError(404, 'Not found: ' + rest); }
      var list = decodeURIComponent(m[1]).replace(/''/g, "'"), tail = m[2] || '';
      if (!db.lists[list]) { return spError(404, 'List \'' + list + '\' does not exist at site with URL \'' + SITE + '\'.'); }
      if (!canSeeList(db, list, u)) { return spError(404, 'List \'' + list + '\' does not exist at site with URL \'' + SITE + '\'.'); }
      if (method === 'GET' && tail === '/items') {
        var rows = db.lists[list].filter(function (it) { return canRead(db, list, it.ID, u); }).map(function (it) { return serialize(list, it); });
        return resp(200, { value: rows });
      }
      if (method === 'GET' && tail === '/RootFolder') { return u.owner ? resp(200, { ServerRelativeUrl: '/sites/esg-1to1/Lists/' + list.replace(/\W/g, '') }) : spError(403, 'Access denied.'); }
      var im = /^\/items\((\d+)\)(\/validateUpdateListItem)?$/.exec(tail);
      if (im) {
        var id = Number(im[1]);
        var it = db.lists[list].find(function (x) { return x.ID === id; });
        if (!it || !canRead(db, list, id, u)) { return spError(404, 'Item does not exist. It may have been deleted by another user.'); }
        if (method === 'GET' && !im[2]) { return resp(200, serialize(list, it)); }
        if (method === 'POST' && im[2]) {
          if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
          if (!canWrite(db, list, id, u)) { return spError(403, 'Access denied. You do not have permission to perform this action or access this resource.'); }
          var body = JSON.parse(options.body || '{}');
          var results = [], ok = true, pending = {};
          (body.formValues || []).forEach(function (fv) {
            var c = coerce(list, fv.FieldName, fv.FieldValue);
            if (c.err) { ok = false; results.push({ ErrorCode: -1, ErrorMessage: c.err, FieldName: fv.FieldName, FieldValue: fv.FieldValue, HasException: true, ItemId: id }); }
            else { pending[fv.FieldName] = c.v; results.push({ ErrorCode: 0, ErrorMessage: null, FieldName: fv.FieldName, FieldValue: fv.FieldValue, HasException: false, ItemId: id }); }
          });
          if (ok) {
            Object.keys(pending).forEach(function (k) { it[k] = pending[k]; });
            db.writes.push({ as: u.key, list: list, id: id, fields: Object.keys(pending), values: (body.formValues || []).reduce(function (o, fv) { o[fv.FieldName] = fv.FieldValue; return o; }, {}) });
            if (list === 'Monthly Reviews' && 'ReviewStatus' in pending) { flow2(db, it); }
            if (list === 'Manager Reviews' && 'ReviewState' in pending) { flow3(db, it); }
            saveDb(db);
          }
          return resp(200, { value: results });
        }
      }
      if (method === 'POST' && tail === '/AddValidateUpdateItemUsingPath') {
        if (headers['X-RequestDigest'] !== db.digest) { return spError(403, 'The security validation for this page is invalid.'); }
        if (!u.owner) { return spError(403, 'Access denied.'); }
        var b = JSON.parse(options.body || '{}');
        if (!b.listItemCreateInfo || !b.listItemCreateInfo.FolderPath || !b.listItemCreateInfo.FolderPath.DecodedUrl) { return spError(400, 'listItemCreateInfo is required'); }
        var item = { ID: db.nextId[list]++ }, res = [], good = true;
        (b.formValues || []).forEach(function (fv) {
          var c = coerce(list, fv.FieldName, fv.FieldValue);
          if (c.err) { good = false; res.push({ FieldName: fv.FieldName, HasException: true, ErrorMessage: c.err }); } else { item[fv.FieldName] = c.v; res.push({ FieldName: fv.FieldName, HasException: false, ErrorMessage: null }); }
        });
        if (good) {
          db.lists[list].push(item); res.push({ FieldName: 'Id', FieldValue: String(item.ID), HasException: false, ErrorMessage: null });
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
    Client.prototype.post = function (url, cfg, options) { return handle('POST', url, options); };
    return new Client();
  }

  window.OTO_MOCK = {
    SITE: SITE, USERS: USERS, X: X,
    db: function (xss) { return loadDb(xss); },
    reset: function () { try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ } },
    userByKey: function (k) { return USERS.find(function (u) { return u.key === k; }) || USERS[0]; },
    ctx: function (userKey, xss) {
      var db = loadDb(xss), u = window.OTO_MOCK.userByKey(userKey);
      var client = makeClient(db, u);
      window.OTO_MOCK.current = { db: db, user: u, client: client };
      return { getWebPart: function () { return { spHttpClient: client, pageContext: { web: { absoluteUrl: SITE } } }; } };
    }
  };
})();
