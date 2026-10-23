// The home page ("My week", approved 23 October 2026): it fits the window without scrolling. Sections are
// panels that collapse to their header; lists show what fits, then "+ n more". The ten area tiles open an
// area in place, and the other sections fold away to make room for it.
CH.views = CH.views || {};
CH.views.home = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;

  function greeting(first) {
    var hour = Number(D.ukTime(new Date()).slice(0, 2));
    return (hour < 12 ? 'Good morning, ' : hour < 18 ? 'Good afternoon, ' : 'Good evening, ') + first;
  }

  // Profile first name; otherwise the part of firstname.lastname@ addresses before the dot. Display names at
  // EDF are "Surname Firstname", so the display name is the last resort.
  function firstName(app) {
    if (app.firstName) return app.firstName;
    var local = String(app.person.Email || '').split('@')[0];
    if (/^[a-z]+[.]/i.test(local)) {
      var f = local.split('.')[0];
      return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
    }
    return (app.person.Title || '').split(' ')[0];
  }

  // Administrators see at once when something needs them (spec REL-4, REL-5).
  function adminLine(app) {
    if (!app.access.isAdministrator) return null;
    var hl = app.health || {};
    var notes = [];
    if (hl.attention) notes.push(hl.attention + (hl.attention === 1 ? ' change needs' : ' changes need') + ' your attention.');
    if (hl.processing === 'down') notes.push('Automatic processing is not working.');
    if (hl.processing === 'unknown') notes.push('The queue monitor has not reported yet.');
    if (hl.reminders === 'stale') notes.push('Reminders have not run for more than a day.');
    return h('p', { class: notes.length ? 'section-note admin-line' : 'admin-line muted' }, notes.length ? h('b', { text: notes.join(' ') + ' ' }) : 'Everything is running. ',
      ui.linkButton('Open Administration', app.showAdmin));
  }

  function byDue(a, b) { return a.dueIso.localeCompare(b.dueIso); }

  // A uniform card: title on one line, then a meta line with chips. Opens the action when given one.
  function actionCard(app, a, meta) {
    var note = app.pendingNote(a);
    return h('button', { type: 'button', class: 'item-open hm-card', title: a.title, onclick: function () { app.openAction(a); } },
      h('span', { class: 't', text: a.title }),
      h('span', { class: 'hm-meta' }, meta, note ? h('span', { class: 'hm-note', text: note }) : null,
        h('span', { class: 'when w-' + (a.waitingCloseOut ? 'later' : a.group), text: a.dueText })));
  }
  function infoCard(text, kind, kindClass, onclick) {
    return h(onclick ? 'button' : 'div', onclick ? { type: 'button', class: 'item-open hm-card', title: text, onclick: onclick } : { class: 'hm-card', title: text },
      h('span', { class: 't', text: text }), h('span', { class: 'hm-meta' }, h('span', { class: 'when w-' + (kindClass || 'later'), text: kind })));
  }

  function lane(title, colour, cards, emptyText, onMore) {
    var body = cards.length ? ui.fitList(cards, 'see all', onMore, 'items') : h('p', { class: 'hm-empty', text: emptyText });
    return h('div', { class: 'hm-lane' },
      h('h3', null, h('span', { class: 'dot', style: 'background:' + colour, 'aria-hidden': 'true' }), title, h('span', { class: 'hm-count', text: String(cards.length) })),
      body);
  }

  // Engineers: what they look after in their areas (close-out checks, late work, flags, overdue meetings).
  function manageCards(app) {
    var m = app.model;
    var keys = m.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
    var cards = [];
    var mineInAreas = m.actions.filter(function (a) { return keys.some(function (k) { return m.inArea(a, k); }); });
    mineInAreas.filter(function (a) { return a.waitingCloseOut; }).forEach(function (a) {
      cards.push(infoCard(a.title + ' is done – check and close it', 'Close-out check', 'later', function () { app.openAction(a); }));
    });
    mineInAreas.filter(function (a) { return a.group === 'late' && a.ownerId !== app.person.SiteUserId; }).sort(byDue).forEach(function (a) {
      cards.push(infoCard(a.title + ' (' + a.ownerName + ')', a.dueText, 'late', function () { app.openAction(a); }));
    });
    keys.forEach(function (k) {
      var s = m.stats[k];
      if (s.flagged) cards.push(infoCard(s.flagged + (s.flagged === 1 ? ' item' : ' items') + ' flagged for the ' + m.areaByKey[k].name + ' meeting', 'For the meeting', 'soon'));
      if (app.access.runsMeetings(k) && s.meetingStale) cards.push(infoCard(s.lastMeeting ? 'No ' + m.areaByKey[k].name + ' meeting since ' + D.short(s.lastMeeting) : 'No ' + m.areaByKey[k].name + ' meeting booked', 'Meeting', 'soon'));
    });
    return cards;
  }

  // Team Leaders and the Group Head: what needs attention across the group.
  function attentionCards(app) {
    var m = app.model;
    var cards = [];
    m.areas.forEach(function (a) {
      var s = m.stats[a.key];
      if (a.status === 'Active' && s.meetingStale) cards.push(infoCard(a.name + (s.lastMeeting ? ' has not met since ' + D.long(s.lastMeeting) : ' has no meeting on record'), 'Meeting overdue', 'soon'));
    });
    m.actions.filter(function (a) { return a.group === 'late'; }).sort(byDue).forEach(function (a) {
      cards.push(infoCard(a.title + ' · ' + a.areaName + ' · ' + a.ownerName + (a.extensions >= 2 ? ' · deadline moved ' + a.extensions + ' times' : ''), a.dueText, 'late', function () { app.openAction(a); }));
    });
    var closeOut = m.actions.filter(function (a) { return a.waitingCloseOut; }).length;
    if (closeOut) cards.push(infoCard(closeOut + (closeOut === 1 ? ' action is' : ' actions are') + ' waiting for a close-out check', 'Close-out', 'later'));
    return cards;
  }

  function areaKeysForMe(app) {
    return app.model.areas.filter(function (a) { return a.status === 'Active' && (app.access.isManagement || app.access.isMember(a.key)); }).map(function (a) { return a.key; });
  }

  // Seven days from today: my actions due each day (late ones on today) and meetings in my areas.
  function weekStrip(app, mine) {
    var m = app.model;
    var keys = areaKeysForMe(app);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var iso = D.addDays(m.today, i);
      var dow = D.weekday(iso);
      var evs = mine.filter(function (a) { return !a.waitingCloseOut && (a.dueIso === iso || (i === 0 && a.group === 'late')); }).sort(byDue).map(function (a) {
        return h('button', { type: 'button', class: 'hm-ev ' + (a.group === 'late' ? 'late' : 'soon'), title: a.title + ' – ' + a.dueText, onclick: function () { app.openAction(a); }, text: a.title });
      }).concat(keys.filter(function (k) { return m.stats[k].nextMeeting === iso; }).map(function (k) {
        return h('span', { class: 'hm-ev mtg', title: m.areaByKey[k].name + ' meeting', text: m.areaByKey[k].name + ' meeting' });
      }));
      var weekend = dow === 'Saturday' || dow === 'Sunday';
      days.push(h('div', { class: 'hm-day' + (i === 0 ? ' today' : '') + (weekend ? ' weekend' : '') },
        h('div', { class: 'hm-dh' }, h('b', { text: String(Number(iso.slice(8, 10))) }), h('span', { text: dow.slice(0, 3) }), i === 0 ? h('em', { text: 'Today' }) : null),
        evs.slice(0, 2), evs.length > 2 ? h('span', { class: 'hm-plus', text: '+ ' + (evs.length - 2) + ' more' }) : null,
        evs.length ? null : h('span', { class: 'hm-none', text: weekend ? 'Weekend' : 'Nothing due' })));
    }
    var due = mine.filter(function (a) { return !a.waitingCloseOut && D.daysBetween(m.today, a.dueIso) < 7; }).length;
    var meets = keys.filter(function (k) { var n = m.stats[k].nextMeeting; return n && D.daysBetween(m.today, n) < 7; }).length;
    return { el: h('div', { class: 'hm-week' }, days), summary: due + ' due · ' + meets + (meets === 1 ? ' meeting' : ' meetings') };
  }

  function tileFor(app, a) {
    var m = app.model;
    var s = m.stats[a.key];
    var viewOnly = !app.access.canWrite(a.key);
    var unavailable = m.sections.actions === 'unavailable';
    var open = app.state.homeArea === a.key;
    return h('button', { type: 'button', class: 'tile hm-tile' + (viewOnly ? ' view-only' : ''), 'data-area': a.key, 'aria-pressed': String(open),
      'aria-label': a.name + (viewOnly ? ', view only' : ''), onclick: function () { app.openAreaHere(open ? null : a.key); } },
      h('b', null, a.name),
      h('span', { class: 'hm-tr' }, unavailable ? h('span', { class: 'when w-soon', text: 'Action figures unavailable' })
        : h('span', { class: 'when w-' + (s.late ? 'late' : 'ok'), text: s.late ? s.late + ' late' : s.open + ' open' }),
        viewOnly ? h('span', { class: 'vo', text: 'View only' }) : null),
      h('span', { class: 'hm-tm' + (s.meetingStale ? ' txt-soon' : ''), text: s.nextMeeting ? 'Meets ' + D.weekdayShort(s.nextMeeting)
        : s.meetingStale ? (s.lastMeeting ? 'No meeting since ' + D.short(s.lastMeeting) : 'No meeting booked') : 'No meeting booked' }));
  }

  // The chosen area, opened in place: its actions, notices and meetings.
  function areaPanel(app, key) {
    var m = app.model;
    var acc = app.access;
    var area = m.areaByKey[key];
    var s = m.stats[key];
    var order = { late: 0, soon: 1, later: 2 };
    var acts = m.actions.filter(function (a) { return m.inArea(a, key); })
      .sort(function (a, b) { return (order[a.group] - order[b.group]) || byDue(a, b); })
      .map(function (a) { return actionCard(app, a, h('span', { class: 'hm-x', text: a.ownerName + (a.areaKey !== key ? ' · shared from ' + a.areaName : '') })); });
    // Pinned and important notices first; then the other notices and the open register entries, newest first.
    var notices = m.notices.filter(function (n) { return n.areaKey === key; });
    var entries = m.entries.filter(function (e) { return e.areaKey === key && e.open; });
    var rest = notices.filter(function (n) { return !n.important; }).map(function (n) { return { n: n, at: n.createdIso }; })
      .concat(entries.map(function (e) { return { e: e, at: e.raisedIso }; }))
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var news = notices.filter(function (n) { return n.important; }).map(function (n) { return { n: n }; }).concat(rest).map(function (x) {
      if (x.e) {
        var en = x.e;
        var note = app.recordNote('Register Entry', en.id);
        return h('button', { type: 'button', class: 'hm-rw item-open', title: en.title, onclick: function () { app.openEntry(en); } },
          h('span', { class: 'hm-dot' + (en.entryType === 'Degradation' ? ' bad' : ''), title: en.entryType }),
          h('span', { class: 'hm-tx' }, h('b', { text: en.title }),
            h('small', { text: en.entryType + ' · ' + en.impact + ' impact · ' + en.raisedByName + (en.raisedIso ? ' · ' + D.short(en.raisedIso) : '') +
              (en.flagged ? ' · flagged' : '') + (note ? ' · ' + note : '') })));
      }
      var n = x.n;
      var nnote = app.recordNote('Notice', n.id);
      return h('button', { type: 'button', class: 'hm-rw item-open', title: n.title, onclick: function () { app.openNotice(n); } },
        h('span', { class: 'hm-dot' + (n.important ? ' on' : ''), title: n.important ? 'Important' : null }),
        h('span', { class: 'hm-tx' }, h('b', { text: n.title }),
          h('small', { text: (n.pinned ? 'Pinned · ' : n.important ? 'Important · ' : '') + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) +
            ' · ' + D.short(n.createdIso) + (n.flagged ? ' · flagged' : '') + (nnote ? ' · ' + nnote : '') })));
    });
    var diary = [];
    if (s.nextMeeting) diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-ok', text: D.weekdayShort(s.nextMeeting) }),
      h('span', { class: 'hm-tx' }, h('b', { text: 'Next meeting' }), h('small', { text: s.flagged ? s.flagged + (s.flagged === 1 ? ' item' : ' items') + ' flagged for discussion' : 'Nothing flagged yet' }))));
    else diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-soon', text: 'Not booked' }),
      h('span', { class: 'hm-tx' }, h('b', { text: 'No meeting booked' }), h('small', { text: 'Someone who runs meetings here can book one' }))));
    diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-later', text: 'Last met' }),
      h('span', { class: 'hm-tx' }, h('b', { text: s.lastMeeting ? D.long(s.lastMeeting) : 'None on record' }), h('small', { text: s.meetingStale ? 'A meeting is overdue' : 'Minutes are kept with the meeting' }))));
    m.calendar.filter(function (e) { return e.areaKey === key; }).forEach(function (e) {
      diary.push(h('div', { class: 'hm-rw' }, h('span', { class: 'when w-later', text: D.weekdayShort(e.dateIso) }),
        h('span', { class: 'hm-tx' }, h('b', { text: e.title }), h('small', { text: e.important ? 'Important date' : 'In the calendar' }))));
    });
    function full(tab) { return function () { app.state = { view: 'area', area: key, tab: tab }; app.refreshView(true); }; }
    function col(title, count, list) {
      return h('div', { class: 'hm-col' }, h('h3', null, title, count === null ? null : h('span', { class: 'hm-count', text: String(count) })), list);
    }
    var unavailable = m.sections.actions === 'unavailable';
    return h('section', { class: 'hm-panel hm-area', 'aria-label': area.name },
      h('div', { class: 'hm-ph' },
        h('h2', { text: area.name }),
        h('span', { class: 'hm-sum', text: (unavailable ? 'Action figures unavailable' : s.open + ' open · ' + (s.late ? s.late + ' late' : 'none late')) + ' · ' +
          (s.nextMeeting ? 'next meeting ' + D.weekdayShort(s.nextMeeting) : s.lastMeeting ? 'no meeting since ' + D.short(s.lastMeeting) : 'no meeting booked') }),
        acc.canWrite(key) ? null : h('span', { class: 'vo', text: 'View only' }),
        h('span', { class: 'hm-acts' },
          acc.canWrite(key) && area.status === 'Active' ? ui.button('Raise an action here', function () { app.raiseAction(key); }) : null,
          acc.canPostNotice(key) ? ui.button('Post a notice here', function () { app.postNotice(key); }) : null,
          acc.canWrite(key) && area.status === 'Active' ? ui.button('Raise an issue', function () { app.raiseEntry(key); }) : null,
          ui.linkButton('Full page', full(0)),
          h('button', { type: 'button', class: 'hm-x-btn', 'aria-label': 'Close ' + area.name, text: '✕', onclick: function () { app.openAreaHere(null); } }))),
      h('div', { class: 'hm-pb' }, h('div', { class: 'hm-cols' },
        col('Actions', unavailable ? null : acts.length, unavailable ? ui.sectionNote('unavailable', 'actions')
          : acts.length ? ui.fitList(acts, 'all ' + area.name + ' actions', full(0), 'items') : h('p', { class: 'hm-empty', text: 'There are no open actions in ' + area.name + '.' })),
        col('Notices & issues', news.length, [ui.sectionNote(m.sections.notices, 'notices'), ui.sectionNote(m.sections.register, 'improvements and degradations'),
          news.length ? ui.fitList(news, 'all notices and issues', full(1)) : h('p', { class: 'hm-empty', text: 'No notices, and no open improvements or degradations, in ' + area.name + '.' })]),
        col('Meetings & dates', null, ui.fitList(diary, 'calendar', full(2))))));
  }

  function render(app) {
    var m = app.model;
    var acc = app.access;
    var openKey = app.state.homeArea && m.areaByKey[app.state.homeArea] ? app.state.homeArea : null;
    var fold = ui.folded();
    // On a laptop-height window the areas start folded, so your actions get the room; the choice is then remembered.
    if (fold.areas === undefined && window.innerHeight < 900) fold.areas = true;
    var unavailable = m.sections.actions === 'unavailable';
    ui.resetFits();

    var mine = m.actions.filter(function (a) { return a.ownerId === app.person.SiteUserId; }).sort(byDue);
    var late = mine.filter(function (a) { return a.group === 'late'; });
    var soon = mine.filter(function (a) { return a.group === 'soon' && !a.waitingCloseOut; });
    var later = mine.filter(function (a) { return a.group === 'later' || a.waitingCloseOut; });
    var keys = areaKeysForMe(app);
    var next = keys.filter(function (k) { return m.stats[k].nextMeeting; }).sort(function (a, b) { return m.stats[a].nextMeeting.localeCompare(m.stats[b].nextMeeting); })[0];

    // One line: greeting, then the day in a sentence. Management sees group totals (each action counted once).
    var summary;
    if (unavailable) summary = [h('span', { text: acc.isManagement ? 'Action figures could not be loaded just now. Reload the page to try again.' : 'Your actions could not be loaded just now.' })];
    else {
      var groupLate = m.actions.filter(function (a) { return a.group === 'late'; }).length;
      var lateN = acc.isManagement ? groupLate : late.length;
      summary = [acc.isManagement ? 'Across the group: ' + m.actions.length + ' open actions · ' : '',
        lateN ? h('b', { class: 'txt-late', text: lateN + ' late' }) : 'nothing late',
        ' · ' + soon.length + (acc.isManagement ? ' of yours' : '') + ' due this week',
        next ? ' · next meeting ' + m.areaByKey[next].name + ', ' + D.weekdayShort(m.stats[next].nextMeeting) : ''];
    }
    var out = [h('div', { class: 'hm-hello' }, h('h1', { text: greeting(firstName(app)) }), h('p', null, summary)), adminLine(app)];

    function toggle(id) {
      return function () {
        if (openKey) { app.state.homeArea = null; fold[id] = false; }
        else fold[id] = !fold[id];
        ui.saveFolded(fold);
        app.refreshView();
      };
    }

    var week = weekStrip(app, mine);
    var weekClosed = openKey ? true : !!fold.week;
    var actsClosed = openKey ? true : !!fold.actions;
    var areasClosed = openKey ? false : !!fold.areas;

    var lanes = [];
    if (!unavailable) {
      if (acc.isManagement) lanes.push(lane('Needs your attention', 'var(--navy)', attentionCards(app), 'Nothing needs your attention right now.', function () { app.showMine(0); }));
      else if (acc.isEngineer) lanes.push(lane('For you to manage', 'var(--navy)', manageCards(app), 'Nothing for you to manage right now.', function () { app.showMine(0); }));
      lanes.push(lane('Late', 'var(--late)', late.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing late.', function () { app.showMine(0); }));
      lanes.push(lane('Due this week', 'var(--soon)', soon.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing due this week.', function () { app.showMine(0); }));
      lanes.push(lane('Coming up', '#8a95a5', later.map(function (a) { return actionCard(app, a, h('span', { class: 'when hm-area-chip', text: a.areaName })); }), 'Nothing further ahead.', function () { app.showMine(0); }));
    }
    var actionsBody = [ui.sectionNote(m.sections.actions, 'actions'), lanes.length ? h('div', { class: 'hm-lanes', style: '--n:' + lanes.length }, lanes) : null];
    var actsSummary = unavailable ? 'Could not load actions' : late.length + ' late · ' + soon.length + ' this week · ' + later.length + ' later';

    var active = m.areas.filter(function (a) { return a.status === 'Active'; });
    var lateAreas = active.filter(function (a) { return m.stats[a.key].late; }).length;
    var tiles = h('div', { class: 'hm-tiles' + (openKey ? ' compact' : '') }, active.map(function (a) { return tileFor(app, a); }));

    var stack = h('div', { class: 'hm-stack' + (openKey ? ' area-open' : '') + (actsClosed ? ' acts-closed' : '') },
      ui.panel('week', 'This week', week.summary, week.el, { closed: weekClosed, onToggle: toggle('week') }),
      ui.panel('actions', acc.isManagement ? 'Your work' : 'Your actions', actsSummary, actionsBody,
        { closed: actsClosed, onToggle: toggle('actions'), link: ['All my actions', function () { app.showMine(0); }] }),
      ui.panel('areas', 'Areas', active.length + ' areas' + (unavailable ? '' : ' · ' + lateAreas + ' with late actions') + (openKey ? '' : ' · choose one to open it'), tiles,
        { closed: areasClosed, onToggle: toggle('areas') }),
      openKey ? areaPanel(app, openKey) : null);
    out.push(stack);
    return out;
  }

  return { render: render, greeting: greeting, firstName: firstName };
})();
