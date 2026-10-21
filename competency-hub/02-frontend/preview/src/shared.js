(function () {
  'use strict';

  var LAYOUT = window.PREVIEW_LAYOUT;

  var AREAS = [
    { k: 'FLK', name: 'Flask', open: 12, late: 1, moved: 2, next: 'Wed 11 Nov', last: '14 Oct', flagged: 3, issues: 1 },
    { k: 'INS', name: 'Instruments', open: 8, late: 0, moved: 1, next: 'Thu 12 Nov', last: '15 Oct', flagged: 1, issues: 0 },
    { k: 'GRS', name: 'Green Stream', open: 18, late: 3, moved: 3, next: null, last: '2 Sep', flagged: 0, issues: 2, noMeeting: true },
    { k: 'RPE', name: 'RPE', open: 6, late: 0, moved: 0, next: 'Wed 18 Nov', last: '20 Oct', flagged: 0, issues: 0 },
    { k: 'BA', name: 'BA', open: 4, late: 0, moved: 0, next: 'Fri 13 Nov', last: '9 Oct', flagged: 1, issues: 0 },
    { k: 'DOS', name: 'Dosimetry', open: 7, late: 0, moved: 1, next: 'Thu 19 Nov', last: '21 Oct', flagged: 2, issues: 0 },
    { k: 'RP', name: 'Radiological Protection', open: 21, late: 2, moved: 2, next: 'Tue 17 Nov', last: '13 Oct', flagged: 1, issues: 1 },
    { k: 'DSL', name: 'DSL', open: 5, late: 0, moved: 0, next: 'Fri 20 Nov', last: '16 Oct', flagged: 0, issues: 0 },
    { k: 'ALS', name: 'Active Lab & Sampling', open: 9, late: 0, moved: 1, next: 'Tue 24 Nov', last: '22 Oct', flagged: 0, issues: 1 },
    { k: 'RW', name: 'Radwaste', open: 6, late: 3, moved: 1, next: 'Thu 12 Nov', last: '8 Oct', flagged: 3, issues: 0 }
  ];
  var BY_KEY = {};
  AREAS.forEach(function (a) { BY_KEY[a.k] = a; });

  var USERS = {
    tech: {
      first: 'Rachel', role: 'Technician', areas: ['FLK', 'INS', 'GRS', 'DOS', 'RP', 'ALS'],
      actions: [
        ['Replace FH40 probe', 'FLK', 'late', '2 days late'],
        ['Update dosimetry issue log', 'DOS', 'soon', 'Due Thursday'],
        ['Review RP survey frequencies', 'RP', 'soon', 'Due Sunday'],
        ['Check sampling line flow rates', 'ALS', 'later', 'Due 9 Nov'],
        ['Green Stream handover notes', 'GRS', 'later', 'Due 20 Nov']
      ]
    },
    eng: {
      first: 'Richard', role: 'Engineer', areas: ['GRS', 'RP', 'DSL', 'RW'],
      actions: [
        ['Approve revised drum store labels', 'RW', 'late', '4 days late'],
        ['Review Green Stream sample results', 'GRS', 'soon', 'Due Friday'],
        ['Update DSL operating instruction', 'DSL', 'later', 'Due 16 Nov']
      ]
    },
    mgmt: {
      first: 'Joe', role: 'Group Head', areas: AREAS.map(function (a) { return a.k; }),
      actions: [
        ['Agree Q4 training priorities', 'RP', 'soon', 'Due Friday'],
        ['Sign off Radwaste audit response', 'RW', 'later', 'Due 27 Nov']
      ]
    }
  };

  var AREA_ACTIONS = {
    FLK: [['Replace FH40 probe', 'Rachel Boulden', 'late', '2 days late'], ['Update Flask procedure FLK-03', 'Nick Pearce', 'soon', 'Due Friday'], ['Leak-test kit replacement quote', 'Matt Henley', 'later', 'Due 3 Nov'], ['Contamination monitor checks', 'Steve Punnett', 'later', 'Due 12 Nov']],
    GRS: [['Green Stream sampling backlog', 'Luke Cain', 'late', '9 days late'], ['Pump seal inspection', 'Kevin Hewitt', 'late', '3 days late'], ['Review Green Stream sample results', 'Richard Harrisson', 'soon', 'Due Friday'], ['Green Stream handover notes', 'Rachel Boulden', 'later', 'Due 20 Nov']],
    RW: [['Approve revised drum store labels', 'Richard Harrisson', 'late', '4 days late'], ['Drum inventory reconciliation', 'Adam Washford', 'late', '2 days late'], ['Waste route survey', 'Trevor Baldwin', 'late', '1 day late'], ['Update waste transfer notes', 'Adrian Cooke', 'later', 'Due 30 Nov']]
  };
  var DEFAULT_ACTIONS = [['Monthly equipment checks', 'Mark Buckley', 'soon', 'Due Thursday'], ['Update local instruction', 'Charlie Everitt', 'later', 'Due 10 Nov'], ['Training records review', 'Sadie Young', 'later', 'Due 25 Nov']];

  var state = { role: 'tech', view: 'overview' };

  function user() { return USERS[state.role]; }
  function isMgmt() { return state.role === 'mgmt'; }
  function canManage() { return state.role !== 'tech'; }
  function isMember(k) { return isMgmt() || user().areas.indexOf(k) >= 0; }
  function otherAreas() { return AREAS.filter(function (a) { return user().areas.indexOf(a.k) < 0; }); }

  function whenChip(cls, text) { return '<span class="when w-' + cls + '">' + text + '</span>'; }

  function lateText(a) { return a.late ? a.late + ' late' : 'None late'; }
  function meetingText(a) { return a.next ? 'Meeting ' + a.next : 'No meeting booked'; }

  function actionList(list, showArea) {
    var groups = [['late', 'Late', 'var(--late)'], ['soon', 'Due this week', 'var(--soon)'], ['later', 'Coming up', '#9aa5af']];
    var out = '';
    groups.forEach(function (g) {
      var rows = list.filter(function (x) { return x[2] === g[0]; });
      if (!rows.length) return;
      out += '<div class="group-title"><span class="dot" style="background:' + g[2] + '"></span>' + g[1] + '</div><ul class="items">';
      rows.forEach(function (x) {
        var sub = showArea ? BY_KEY[x[1]].name : x[1];
        out += '<li><span><span class="t">' + x[0] + '</span><span class="s">' + sub + '</span></span>' + whenChip(x[2], x[3]) + '</li>';
      });
      out += '</ul>';
    });
    return out || '<p class="muted">You have no open actions. Nice work.</p>';
  }

  function tile(a, viewOnly) {
    var cls = (a.late ? 'has-late' : (a.noMeeting ? 'has-warn' : '')) + (viewOnly ? ' view-only' : '');
    var status = (a.late ? '<span style="color:var(--late);font-weight:600">' + a.late + ' late</span>' : '<span style="color:var(--ok);font-weight:600">Nothing late</span>') +
      ' · ' + a.open + ' open';
    return '<button class="tile ' + cls + '" data-area="' + a.k + '"><b>' + a.name + (viewOnly ? ' <span class="vo">View only</span>' : '') + '</b><span class="status">' + status + '</span><span class="status">' +
      (a.noMeeting ? '<span style="color:var(--soon);font-weight:600">No meeting since ' + a.last + '</span>' : meetingText(a)) +
      (a.flagged ? ' · ' + a.flagged + ' to discuss' : '') + '</span></button>';
  }

  function tileGrid(list, viewOnly) {
    var cols = list.length <= 6 ? list.length : 5;
    return '<div class="tiles' + (viewOnly ? ' tiles-small' : '') + '" style="--cols:' + cols + '">' + list.map(function (a) { return tile(a, viewOnly); }).join('') + '</div>';
  }

  function nextMeetings(u, title) {
    var list = u.areas.map(function (k) { return BY_KEY[k]; }).filter(function (a) { return a.next; }).slice(0, 4);
    return '<div class="card"><h2>' + (title || 'Your next meetings') + '</h2><ul class="plain">' + list.map(function (a) {
      return '<li><span><b>' + a.name + '</b><br><span class="muted small">' + a.next + '</span></span>' +
        (a.flagged ? '<span class="when w-later">' + a.flagged + ' to discuss</span>' : '') + '</li>';
    }).join('') + '</ul></div>';
  }

  var NOTICES = [
    ['Calibration rig out of service', 'FLK', 'notice · yesterday'],
    ['Drum store labelling not clear', 'RW', 'issue · yesterday'],
    ['Revised survey route map', 'RP', 'notice · 2 days ago'],
    ['Sampling pump wear', 'ALS', 'issue · this week'],
    ['Green Stream pump seal leak', 'GRS', 'issue · this week'],
    ['New DSL operating instruction issued', 'DSL', 'notice · last week']
  ];
  function latestNotices() {
    var mine = NOTICES.filter(function (n) { return user().areas.indexOf(n[1]) >= 0; }).slice(0, 3);
    return '<div class="card"><h2>New in your areas</h2><ul class="plain">' + mine.map(function (n) {
      return '<li><span>' + n[0] + '<br><span class="muted small">' + BY_KEY[n[1]].name + ' · ' + n[2] + '</span></span></li>';
    }).join('') + '</ul></div>';
  }

  function manageCard() {
    return '<div class="card manage"><h2>For you to manage</h2><div class="manage-grid">' +
      '<div><span class="num">2</span>actions waiting for your close-out check</div>' +
      '<div><span class="num" style="color:var(--late)">8</span>late actions in areas you look after</div>' +
      '<div><span class="num">4</span>items flagged for your meetings</div></div>' +
      '<p style="margin:0 0 12px"><b>Next meeting to prepare:</b> Radiological Protection, Tue 17 Nov (1 item flagged)</p>' +
      '<div class="row"><button class="btn btn-main">Prepare agenda</button><button class="btn">Review close-outs</button></div></div>';
  }

  function statusTable() {
    return '<div class="card"><h2>All areas</h2><table><tr><th>Area</th><th>Open</th><th>Late</th><th>Deadlines moved twice or more</th><th>Next meeting</th></tr>' +
      AREAS.map(function (a) {
        return '<tr class="click" data-area="' + a.k + '"><td><b>' + a.name + '</b></td><td>' + a.open + '</td><td>' +
          whenChip(a.late ? 'late' : 'ok', lateText(a)) + '</td><td>' + (a.moved || '–') + '</td><td>' +
          (a.next ? a.next : whenChip('soon', 'Not booked – last ' + a.last)) + '</td></tr>';
      }).join('') + '</table><p class="muted small" style="margin:10px 0 0">Select an area to open it.</p></div>';
  }

  function attention() {
    return '<div class="card"><h2>Needs your attention</h2><ul class="plain">' +
      '<li><span><b>Green Stream</b> has not met since 2 September<br><span class="muted small">No meeting booked</span></span>' + whenChip('soon', '7 weeks') + '</li>' +
      '<li><span><b>Green Stream sampling backlog</b><br><span class="muted small">Luke Cain · deadline moved 3 times</span></span>' + whenChip('late', '9 days late') + '</li>' +
      '<li><span><b>Approve revised drum store labels</b><br><span class="muted small">Radwaste · Richard Harrisson</span></span>' + whenChip('late', '4 days late') + '</li>' +
      '<li><span><b>Sampling pump wear</b><br><span class="muted small">Active Lab &amp; Sampling · unresolved degradation</span></span>' + whenChip('later', 'Under review') + '</li>' +
      '<li><span><b>3 items flagged</b> for the Radwaste meeting<br><span class="muted small">Thu 12 Nov</span></span></li>' +
      '</ul><button class="btn-link">Show everything that needs attention (11)</button></div>';
  }

  function overview() {
    var u = user();
    var tilesFirst = LAYOUT === 'C';
    var h = '<h1>Good morning, ' + u.first + '</h1>';

    if (isMgmt()) {
      h += '<p class="sentence">Across the group: <b>84 open actions</b>, <b style="color:var(--late)">9 late</b>, and <b>1 area</b> with no recent meeting.</p>';
      h += '<div class="row" style="margin-bottom:24px"><button class="btn btn-main">Raise an action</button><button class="btn">Full management report</button></div>';
      h += tilesFirst ? '<h2>All areas</h2>' + tileGrid(AREAS) : statusTable();
      if (tilesFirst) {
        h += '<div class="cols3"><div>' + attention() + '</div><div><div class="card"><h2>Your own actions</h2>' + actionList(u.actions, true) +
          '</div></div><div>' + nextMeetings(u, 'Coming meetings') + '</div></div>';
      } else {
        h += '<div class="cols"><div>' + attention() + '</div><div><div class="card"><h2>Your own actions</h2>' + actionList(u.actions, true) + '</div></div></div>';
      }
      return h;
    }

    h += '<p class="lead">' + (state.role === 'eng' ? 'Your actions, and what you look after as an Engineer.' : 'Here is what needs your attention.') + '</p>';
    h += '<div class="row" style="margin-bottom:24px"><button class="btn btn-main">Raise an action</button><button class="btn">Add a notice</button></div>';
    if (tilesFirst) {
      h += '<h2>Your areas</h2>' + tileGrid(u.areas.map(function (k) { return BY_KEY[k]; }));
      var mine = '<div class="card"><h2>Your actions</h2>' + actionList(u.actions, true) + '</div>';
      if (canManage()) h += '<div class="cols3"><div>' + manageCard() + '</div><div>' + mine + '</div><div>' + nextMeetings(u) + latestNotices() + '</div></div>';
      else h += '<div class="cols3"><div>' + mine + '</div><div>' + nextMeetings(u) + '</div><div>' + latestNotices() + '</div></div>';
      h += '<h2 style="margin-top:28px">Other areas</h2><p class="muted" style="margin:-6px 0 14px">You can see everything in these areas. Only their members can add or change things.</p>' + tileGrid(otherAreas(), true);
      return h;
    }
    h += '<div class="cols"><div>';
    if (canManage()) h += manageCard();
    h += '<div class="card"><h2>Your actions</h2>' + actionList(u.actions, true) + '</div></div><div>' + nextMeetings(u) + latestNotices() + '</div></div>';
    return h;
  }

  function areaPage(k) {
    var a = BY_KEY[k];
    var acts = AREA_ACTIONS[k] || DEFAULT_ACTIONS;
    var h = '<h1>' + a.name + '</h1>';
    h += '<p class="sentence">' + a.open + ' open actions, ' + (a.late ? '<b style="color:var(--late)">' + a.late + ' late</b>' : 'none late') + '. ' +
      (a.noMeeting ? '<b style="color:var(--soon)">No meeting since ' + a.last + '.</b>' : 'Next meeting ' + a.next + '.') + '</p>';
    if (!isMember(k)) h += '<div class="viewonly-bar"><b>View only.</b> You are not a member of ' + a.name + ', so you can read everything here but cannot add or change anything. Speak to one of the ' + a.name + ' engineers or your Team Leader if something needs doing.</div>';
    else h += '<div class="row" style="margin-bottom:20px"><button class="btn btn-main">Raise an action</button>' +
      (canManage() ? '<button class="btn">' + (a.next ? 'Start meeting' : 'Book a meeting') + '</button><button class="btn">Review close-outs</button>' : '<button class="btn">Add a notice</button>') + '</div>';
    h += '<div class="subtabs" role="tablist">' +
      ['Actions', 'Notices &amp; issues', 'Calendar', 'Meetings'].map(function (t, i) {
        return '<button role="tab" data-sub="' + i + '" aria-selected="' + (i === 0) + '">' + t + '</button>';
      }).join('') + '</div>';
    h += '<div class="panel on" data-panel="0">' + actionList(acts.map(function (x) { return [x[0], x[1], x[2], x[3]]; }), false) +
      '<button class="btn-link">Show all ' + a.open + '</button> · <button class="btn-link">Show finished items</button></div>';
    h += '<div class="panel" data-panel="1"><ul class="plain">' +
      '<li><span><b>Calibration rig out of service</b><br><span class="muted small">Notice · Nick Pearce · yesterday</span></span><span class="when w-later">For next meeting</span></li>' +
      '<li><span><b>Leak-test kit ageing</b><br><span class="muted small">Degradation · under review</span></span>' + whenChip('soon', 'Unresolved') + '</li>' +
      '<li><span><b>Spare probe stock levels</b><br><span class="muted small">Notice · Kelly Bates · last week</span></span></li></ul></div>';
    h += '<div class="panel" data-panel="2"><ul class="plain">' +
      '<li><span><b>Audit preparation</b><br><span class="muted small">Fri 30 Oct, all day</span></span></li>' +
      '<li><span><b>Probe calibration window</b><br><span class="muted small">Thu 5 Nov, 09:00–12:00</span></span></li>' +
      '<li><span><b>Monthly meeting</b><br><span class="muted small">' + (a.next || 'Not booked') + '</span></span></li></ul></div>';
    h += '<div class="panel" data-panel="3"><ul class="plain">' +
      '<li><span><b>Next meeting</b><br><span class="muted small">' + (a.next || 'Not booked') + (a.flagged ? ' · ' + a.flagged + ' items to discuss' : '') + '</span></span>' +
      (canManage() ? '<button class="btn">' + (a.next ? 'Open agenda' : 'Book a meeting') + '</button>' : '') + '</li>' +
      '<li><span><b>Last meeting</b><br><span class="muted small">' + a.last + ' · minutes available</span></span><button class="btn-link">View minutes</button></li></ul></div>';
    return h;
  }

  function header() {
    var names = { A: 'Layout A · Top tabs', B: 'Layout B · Side menu', C: 'Layout C · Home tiles' };
    return '<div class="note">Design preview with sample data — not connected to SharePoint.</div>' +
      '<header class="bar"><div class="bar-in"><div class="brand">ESG Competency Hub<small>Environmental Safety Group</small></div>' +
      '<div class="bar-right"><span class="layout-name">' + names[LAYOUT] + '</span><label>Preview as <select id="role">' +
      '<option value="tech"' + (state.role === 'tech' ? ' selected' : '') + '>Technician (Rachel)</option>' +
      '<option value="eng"' + (state.role === 'eng' ? ' selected' : '') + '>Engineer (Richard)</option>' +
      '<option value="mgmt"' + (state.role === 'mgmt' ? ' selected' : '') + '>Group Head / Team Leader (Joe)</option>' +
      '</select></label></div></div></header>';
  }

  function content() { return state.view === 'overview' ? overview() : areaPage(state.view); }

  function lateBadge(a, cls) {
    return a.late ? '<span class="' + cls + '">' + a.late + ' late</span>' : '';
  }

  function render() {
    var u = user();
    var h = header();
    if (LAYOUT === 'A') {
      h += '<nav class="tabbar" aria-label="Areas"><div class="tabbar-in" role="tablist">' +
        '<button role="tab" data-area="overview" aria-selected="' + (state.view === 'overview') + '">' + (isMgmt() ? 'Group overview' : 'My overview') + '</button>' +
        u.areas.map(function (k) {
          var a = BY_KEY[k];
          return '<button role="tab" data-area="' + k + '" aria-selected="' + (state.view === k) + '">' + a.name + lateBadge(a, 'late-count') + '</button>';
        }).join('') + '</div></nav><main>' + content() + '</main>';
    } else if (LAYOUT === 'B') {
      h += '<div class="wrap"><nav class="side" aria-label="Areas">' +
        '<button data-area="overview"' + (state.view === 'overview' ? ' aria-current="page"' : '') + '>' + (isMgmt() ? 'Group overview' : 'My overview') + '</button>' +
        '<div class="label">' + (isMgmt() ? 'All competencies' : 'My competencies') + '</div>' +
        u.areas.map(function (k) {
          var a = BY_KEY[k];
          return '<button data-area="' + k + '"' + (state.view === k ? ' aria-current="page"' : '') + '><span>' + a.name + '</span>' +
            (a.late ? lateBadge(a, 'late-count') : '<span class="ok-count">' + a.open + ' open</span>') + '</button>';
        }).join('') + '</nav><main>' + content() + '</main></div>';
    } else {
      var inner;
      if (state.view === 'overview') inner = overview();
      else inner = '<div class="areastrip" role="tablist"><button class="back" data-area="overview">‹ Overview</button>' +
        AREAS.map(function (a) {
          var mine = isMember(a.k);
          return '<button role="tab" class="' + (mine ? '' : 'other') + '" data-area="' + a.k + '" aria-selected="' + (state.view === a.k) + '"' + (mine ? '' : ' title="View only"') + '>' + a.name + '</button>';
        }).join('') + '</div>' + areaPage(state.view);
      h += '<main>' + inner + '</main>';
    }
    h += '<footer>ESG Competency Hub · preview</footer>';
    document.getElementById('app').innerHTML = h;
    document.body.className = 'layout-' + LAYOUT.toLowerCase();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-area],[data-sub]');
    if (!t) return;
    if (t.dataset.area) {
      state.view = t.dataset.area;
      render();
      window.scrollTo(0, 0);
      return;
    }
    var page = t.closest('main');
    page.querySelectorAll('[data-sub]').forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); });
    page.querySelectorAll('[data-panel]').forEach(function (p) { p.classList.toggle('on', p.dataset.panel === t.dataset.sub); });
  });

  document.addEventListener('change', function (e) {
    if (e.target.id !== 'role') return;
    state.role = e.target.value;
    state.view = 'overview';
    render();
  });

  var params = new URLSearchParams(location.search);
  if (USERS[params.get('role')]) state.role = params.get('role');
  if (params.get('area') && BY_KEY[params.get('area')]) state.view = params.get('area');
  render();
})();
