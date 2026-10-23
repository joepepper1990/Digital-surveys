// Sample data shared by the five design previews. Nothing here connects to SharePoint.
(function () {
  'use strict';
  var TODAY = new Date(Date.UTC(2026, 9, 23)); // Friday 23 October 2026
  var DAY = 86400000;
  function d(offset) { return new Date(TODAY.getTime() + offset * DAY); }
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function short(dt) { return dt.getUTCDate() + ' ' + MO[dt.getUTCMonth()]; }
  function wdShort(dt) { return WD[dt.getUTCDay()].slice(0, 3) + ' ' + short(dt); }

  var AREAS = [
    { key: 'FLK', name: 'Flask', open: 12, late: 1, soon: 2, moved: 2, next: 19, last: -9, flagged: 3, issues: 1 },
    { key: 'INS', name: 'Instruments', open: 8, late: 0, soon: 1, moved: 1, next: 20, last: -8, flagged: 1, issues: 0 },
    { key: 'GRS', name: 'Green Stream', open: 18, late: 3, soon: 4, moved: 3, next: null, last: -51, flagged: 0, issues: 2 },
    { key: 'RPE', name: 'RPE', open: 6, late: 0, soon: 0, moved: 0, next: 26, last: -3, flagged: 0, issues: 0 },
    { key: 'BA', name: 'BA', open: 4, late: 0, soon: 1, moved: 0, next: 21, last: -14, flagged: 1, issues: 0 },
    { key: 'DOS', name: 'Dosimetry', open: 7, late: 0, soon: 2, moved: 1, next: 27, last: -2, flagged: 2, issues: 0 },
    { key: 'RP', name: 'Radiological Protection', open: 21, late: 2, soon: 3, moved: 2, next: 4, last: -10, flagged: 1, issues: 1 },
    { key: 'DSL', name: 'DSL', open: 5, late: 0, soon: 0, moved: 0, next: 28, last: -7, flagged: 0, issues: 0 },
    { key: 'ALS', name: 'Active Lab & Sampling', open: 9, late: 0, soon: 1, moved: 1, next: 32, last: -1, flagged: 0, issues: 1 },
    { key: 'RW', name: 'Radwaste', open: 6, late: 3, soon: 1, moved: 1, next: 20, last: -15, flagged: 3, issues: 0 }
  ];
  var BY = {};
  AREAS.forEach(function (a) { BY[a.key] = a; });

  var PEOPLE = {
    tech: { first: 'Rachel', full: 'Rachel Boulden', initials: 'RB', role: 'Technician', areas: ['FLK', 'INS', 'GRS', 'DOS', 'RP', 'ALS'] },
    eng: { first: 'Kelly', full: 'Kelly Bates', initials: 'KB', role: 'Engineer', areas: ['FLK', 'GRS', 'RP', 'DSL', 'RW'] },
    mgmt: { first: 'Joseph', full: 'Joseph Pepper', initials: 'JP', role: 'Team Leader', areas: AREAS.map(function (a) { return a.key; }) }
  };

  // [reference, title, area, due offset in days, extra]
  var MINE = {
    tech: [
      ['ACT-00042', 'Replace FH40 probe', 'FLK', -2, { moved: 1 }],
      ['ACT-00057', 'Update dosimetry issue log', 'DOS', 0, {}],
      ['ACT-00061', 'Review RP survey frequencies', 'RP', 2, {}],
      ['ACT-00064', 'Calibrate sampling line flow meter', 'ALS', 5, { waiting: 'Spare parts on order' }],
      ['ACT-00070', 'Green Stream handover notes', 'GRS', 17, {}],
      ['ACT-00071', 'Instrument loan register tidy-up', 'INS', 28, {}]
    ],
    eng: [
      ['ACT-00038', 'Approve revised drum store labels', 'RW', -4, { moved: 2 }],
      ['ACT-00055', 'Review Green Stream sample results', 'GRS', 1, {}],
      ['ACT-00066', 'Update DSL operating instruction', 'DSL', 6, {}],
      ['ACT-00073', 'Flask procedure FLK-03 rewrite', 'FLK', 24, {}]
    ],
    mgmt: [
      ['ACT-00049', 'Agree Q4 training priorities', 'RP', 3, {}],
      ['ACT-00068', 'Sign off Radwaste audit response', 'RW', 35, {}]
    ]
  };

  var MANAGE = {
    eng: [
      { kind: 'Close-out check', text: 'Leak-test kit replacement is done – check and close it', area: 'FLK', ref: 'ACT-00031' },
      { kind: 'Late', text: 'Green Stream sampling backlog is 9 days late (Luke Cain)', area: 'GRS', ref: 'ACT-00022' },
      { kind: 'Late', text: 'Drum inventory reconciliation is 2 days late (Adam Washford)', area: 'RW', ref: 'ACT-00040' },
      { kind: 'For the meeting', text: '3 items flagged for the Radwaste meeting', area: 'RW' },
      { kind: 'Meeting', text: 'No Green Stream meeting since 2 September', area: 'GRS' }
    ],
    mgmt: [
      { kind: 'Late', text: '9 actions are late across 4 areas', area: null },
      { kind: 'Meeting', text: 'Green Stream has not met since 2 September', area: 'GRS' },
      { kind: 'Deadlines', text: '6 actions have had their deadline moved twice or more', area: null },
      { kind: 'Issue', text: '2 degradations are unresolved in Green Stream', area: 'GRS' },
      { kind: 'Late', text: 'Radwaste has 3 late actions out of 6 open', area: 'RW' }
    ]
  };

  var NOTICES = [
    { area: 'RP', title: 'New contamination survey forms from Monday', by: 'Andrea Medlicott', age: 0, important: true },
    { area: 'FLK', title: 'FH40 spares now in the stores cage', by: 'Nick Pearce', age: 1, important: false },
    { area: 'GRS', title: 'Sampling point SP-4 out of use until further notice', by: 'Kai Todd', age: 2, important: true },
    { area: 'DOS', title: 'Dosimeter issue times change in November', by: 'Doti Cange-Ainsworth', age: 3, important: false },
    { area: 'ALS', title: 'Fume cupboard 2 back in service', by: 'Trevor Baldwin', age: 4, important: false }
  ];

  var DATES = [
    { area: 'RP', title: 'Instrument calibration day', day: 6 },
    { area: 'GRS', title: 'Station outage planning review', day: 11 },
    { area: 'FLK', title: 'External audit visit', day: 14 }
  ];

  function dueText(off) {
    if (off < -1) return (-off) + ' days late';
    if (off === -1) return '1 day late';
    if (off === 0) return 'Due today';
    if (off === 1) return 'Due tomorrow';
    if (off < 7) return 'Due ' + WD[d(off).getUTCDay()];
    return 'Due ' + short(d(off));
  }
  function band(off) { return off < 0 ? 'late' : off < 7 ? 'soon' : 'later'; }


  // Area detail for the area panel: actions generated from each area's counts, notices and register entries.
  var TITLES = ['Monthly equipment checks', 'Update local instruction', 'Training records review', 'Calibration certificates filed', 'Survey meter source check',
    'Review of work instructions', 'Spares stock count', 'Housekeeping inspection', 'Procedure walk-down', 'Lessons learned write-up', 'Check alarm set points',
    'Replace worn labels', 'Data sheet sign-off', 'Contractor briefing pack', 'Waste route review', 'Sample bottle reorder', 'Log book audit',
    'Equipment loan returns', 'Risk assessment refresh', 'Shift handover checklist', 'Fault report follow-up', 'Quality check of records'];
  var OWNERS = ['Andrea Medlicott', 'Kelly Bates', 'Ben Beak', 'Dave Beeching', 'Aiden Gorham', 'Jake Stafford', 'Chloe Tilly', 'Trevor Baldwin',
    'Rachel Boulden', 'Mark Buckley', 'Luke Cain', 'Adrian Cooke', 'Charlie Everitt', 'Matt Henley', 'Kevin Hewitt', 'Richard Howe', 'Nick Pearce', 'Steve Punnett'];
  var ISSUES = {
    GRS: [['Degradation', 'Sampling pump flow drifting low', 'Open'], ['Degradation', 'SP-4 sample point blocked', 'Under review'], ['Improvement', 'Move logbook to tablet', 'Open']],
    FLK: [['Degradation', 'FH40 probe cable worn', 'Under review'], ['Improvement', 'Shadow board for flask tools', 'Open']],
    RP: [['Degradation', 'Survey meter battery life short', 'Open'], ['Improvement', 'Pre-filled survey forms', 'Resolved']],
    ALS: [['Degradation', 'Fume cupboard 2 low face velocity', 'Resolved']],
    RW: [['Improvement', 'Colour-coded drum labels', 'Open']]
  };
  function areaDetail(key) {
    var a = BY[key], i = AREAS.indexOf(a), list = [], n = 0;
    function add(off) { list.push({ title: TITLES[(i * 5 + n) % TITLES.length], owner: OWNERS[(i * 7 + n * 3) % OWNERS.length], off: off, due: dueText(off), band: band(off) }); n++; }
    for (var k = 0; k < a.late; k++) add(-(2 + k * 3));
    for (k = 0; k < a.soon; k++) add(1 + k * 2 > 6 ? 6 : 1 + k * 2);
    for (k = 0; k < a.open - a.late - a.soon; k++) add(9 + k * 4);
    return {
      area: a, actions: list,
      notices: NOTICES.filter(function (x) { return x.area === key; }).map(function (x) { return { title: x.title, by: x.by, when: x.age === 0 ? 'Today' : x.age === 1 ? 'Yesterday' : x.age + ' days ago', important: x.important, kind: 'Notice' }; })
        .concat([{ title: 'Reminder: keep the area log up to date', by: OWNERS[(i * 3) % OWNERS.length], when: '6 days ago', important: false, kind: 'Notice' }]),
      issues: (ISSUES[key] || []).map(function (x) { return { kind: x[0], title: x[1], status: x[2] }; }),
      next: a.next === null ? null : { when: wdShort(d(a.next)), time: '10:00', place: 'Admin building, room 2', items: a.flagged + a.late + 4, flagged: a.flagged },
      last: { when: wdShort(d(a.last)), stale: a.last < -35 },
      dates: DATES.filter(function (x) { return x.area === key; }).map(function (x) { return { title: x.title, when: wdShort(d(x.day)) }; })
    };
  }

  window.CHDATA = function (role) {
    var p = PEOPLE[role];
    var mine = MINE[role].map(function (r) {
      return { ref: r[0], title: r[1], area: BY[r[2]], off: r[3], due: dueText(r[3]), band: band(r[3]), date: d(r[3]), moved: r[4].moved || 0, waiting: r[4].waiting || '' };
    });
    var areas = p.areas.map(function (k) {
      var a = BY[k];
      return {
        key: a.key, name: a.name, open: a.open, late: a.late, soon: a.soon, moved: a.moved, flagged: a.flagged, issues: a.issues,
        next: a.next === null ? null : d(a.next), nextText: a.next === null ? 'No meeting booked' : 'Meeting ' + wdShort(d(a.next)),
        lastText: 'Last met ' + short(d(a.last)), stale: a.last < -35, nextIn: a.next
      };
    });
    var meetings = areas.filter(function (a) { return a.next; }).sort(function (x, y) { return x.next - y.next; }).slice(0, 4)
      .map(function (a) { return { area: a, date: a.next, when: wdShort(a.next), time: '10:00', place: 'Admin building, room 2', items: a.flagged + a.late + 4 }; });
    var group = AREAS.reduce(function (t, a) { t.open += a.open; t.late += a.late; t.soon += a.soon; t.moved += a.moved; t.issues += a.issues; return t; }, { open: 0, late: 0, soon: 0, moved: 0, issues: 0, done30: 23 });
    var hour = 9;
    return {
      role: role, isMgmt: role === 'mgmt', canManage: role !== 'tech', person: p,
      greeting: (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + p.first,
      todayLong: 'Friday 23 October 2026',
      mine: mine,
      late: mine.filter(function (a) { return a.band === 'late'; }),
      soon: mine.filter(function (a) { return a.band === 'soon'; }),
      later: mine.filter(function (a) { return a.band === 'later'; }),
      areas: areas, allAreas: AREAS,
      manage: MANAGE[role] || [],
      meetings: meetings,
      notices: NOTICES.filter(function (n) { return p.areas.indexOf(n.area) >= 0; }).map(function (n) {
        return { area: BY[n.area], title: n.title, by: n.by, when: n.age === 0 ? 'Today' : n.age === 1 ? 'Yesterday' : n.age + ' days ago', important: n.important };
      }),
      dates: DATES.filter(function (x) { return p.areas.indexOf(x.area) >= 0; }).map(function (x) { return { area: BY[x.area], title: x.title, when: wdShort(d(x.day)), date: d(x.day) }; }),
      group: group,
      week: [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        var dt = d(i);
        return {
          date: dt, label: WD[dt.getUTCDay()].slice(0, 3), num: dt.getUTCDate(), today: i === 0, weekend: dt.getUTCDay() === 0 || dt.getUTCDay() === 6,
          actions: mine.filter(function (a) { return a.off === i || (i === 0 && a.off < 0); }),
          meetings: meetings.filter(function (m) { return Math.round((m.date - TODAY) / DAY) === i; })
        };
      }),
      tiles: AREAS.map(function (a) { return { key: a.key, name: a.name, open: a.open, late: a.late, member: p.areas.indexOf(a.key) >= 0, stale: a.last < -35,
        nextText: a.last < -35 ? 'No meeting since ' + short(d(a.last)) : a.next === null ? 'No meeting booked' : 'Meets ' + wdShort(d(a.next)) }; }),
      areaDetail: areaDetail,
      helpers: { short: short, wdShort: wdShort }
    };
  };

  // Tiny element helper: h('div', {class: 'x', text: 'y'}, child, ...)
  window.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };
})();
