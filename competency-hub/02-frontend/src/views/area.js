// One competency area: summary sentence, then Actions / Notices & issues / Calendar / Meetings.
// Non-members get a clear "View only" page; they may still post a notice (K4.1).
CH.views = CH.views || {};
CH.views.area = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;
  var TABS = ['Actions', 'Notices & issues', 'Calendar', 'Meetings'];

  function sentence(area, s, actionsState) {
    return h('p', { class: 'sentence' },
      actionsState === 'unavailable' ? 'Action figures could not be loaded. '
        : [s.open + ' open actions' + (actionsState === 'partial' ? ' (incomplete)' : '') + ', ', s.late ? h('b', { class: 'txt-late', text: s.late + ' late' }) : 'none late', '. '],
      s.nextMeeting ? 'Next meeting ' + D.weekdayShort(s.nextMeeting) + '.'
        : h('b', { class: 'txt-soon', text: s.lastMeeting ? 'No meeting since ' + D.short(s.lastMeeting) + '.' : 'No meeting booked.' }));
  }

  function actionsTab(app, area) {
    var list = app.model.actions.filter(function (a) { return app.model.inArea(a, area.key); });
    return [
      ui.sectionNote(app.model.sections.actions, 'actions'),
      ui.actionList(list, function (a) {
        return a.ownerName + (a.areaKey !== area.key ? ' · shared from ' + a.areaName : '') + (a.extensions ? ' · deadline moved ' + (a.extensions === 1 ? 'once' : a.extensions + ' times') : '');
      }, 'There are no open actions in ' + area.name + '.', app.model.sections.actions, app.openAction, app.pendingNote)
    ];
  }

  // Notices first (pinned and important at the top), then the improvements and degradations register (spec NB-1, REG-4).
  function noticesTab(app, area) {
    var m = app.model;
    var list = m.notices.filter(function (n) { return n.areaKeys.indexOf(area.key) >= 0; });
    list = list.filter(function (n) { return n.important; }).concat(list.filter(function (n) { return !n.important; }));
    var filter = app.state.entryFilter || 'open';
    var entries = m.entries.filter(function (e) {
      return e.areaKey === area.key && (filter === 'all' || (filter === 'open' ? e.open : e.entryType === filter));
    });
    var typeSel = h('select', { 'aria-label': 'Show', onchange: function (e) { app.state.entryFilter = e.target.value; app.refreshView(); } },
      [['open', 'Open entries'], ['all', 'All entries']].concat(CH.rules.ENTRY_TYPES.map(function (t) { return [t, t + 's']; })).map(function (o) {
        return h('option', { value: o[0], selected: o[0] === filter ? true : null, text: o[1] });
      }));
    return [
      h('div', { class: 'row tab-actions' },
        app.access.canPostNotice(area.key) ? ui.button('Post a notice', function () { app.postNotice(area.key); }) : null,
        app.access.canWrite(area.key) && area.status === 'Active' ? ui.button('Raise an improvement or degradation', function () { app.raiseEntry(area.key); }) : null),
      h('h2', { class: 'group-title', text: 'Noticeboard' }),
      ui.sectionNote(m.sections.notices, 'notices'),
      list.length ? h('ul', { class: 'items' }, list.map(function (n) {
        var note = app.recordNote('Notice', n.id);
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openNotice(n); } },
          h('span', null, h('span', { class: 't', text: n.title }),
            h('span', { class: 's notice-body', text: n.body.length > 240 ? n.body.slice(0, 240) + '…' : n.body }),
            h('span', { class: 's', text: n.category + ' · ' + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.short(n.createdIso) +
              (n.flagged ? ' · flagged for the meeting' : '') + (note ? ' · ' + note : '') })),
          n.pinned ? ui.chip('soon', 'Pinned') : n.important ? ui.chip('soon', 'Important') : null));
      })) : h('p', { class: 'muted', text: 'Nothing has been posted on the ' + area.name + ' noticeboard yet.' }),
      h('h2', { class: 'group-title' }, 'Improvements and degradations ', h('label', { class: 'inline-filter' }, typeSel)),
      ui.sectionNote(m.sections.register, 'improvements and degradations'),
      entries.length ? h('ul', { class: 'items' }, entries.map(function (e) {
        var note = app.recordNote('Register Entry', e.id);
        var linked = m.actions.filter(function (a) { return a.sourceType === 'Register' && Number(a.sourceId) === e.id; }).length;
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openEntry(e); } },
          h('span', null, h('span', { class: 't', text: e.ref + ' ' + e.title }),
            h('span', { class: 's', text: e.entryType + ' · ' + e.impact + ' impact · ' + (e.responsibleName ? e.responsibleName + ' responsible · ' : '') +
              (e.raisedIso ? D.short(e.raisedIso) : '') + (linked ? ' · ' + linked + (linked === 1 ? ' linked action' : ' linked actions') : '') +
              (e.flagged ? ' · flagged for the meeting' : '') + (note ? ' · ' + note : '') })),
          CH.views.recordPanel.entryChip(e)));
      })) : h('p', { class: 'muted', text: filter === 'open' ? 'No open improvements or degradations in ' + area.name + '.' : 'No entries to show.' })
    ];
  }

  function calendarTab(app, area) {
    var list = app.model.calendar.filter(function (e) { return e.areaKey === area.key; });
    var s = app.model.stats[area.key];
    var rows = list.map(function (e) {
      return h('li', null, h('span', null, h('b', { text: e.title }), h('br'), h('span', { class: 'muted small', text: D.weekday(e.dateIso) + ' ' + D.long(e.dateIso) })),
        e.important ? ui.chip('soon', 'Important') : null);
    });
    if (s.nextMeeting) rows.unshift(h('li', null, h('span', null, h('b', { text: 'Monthly meeting' }), h('br'), h('span', { class: 'muted small', text: D.weekday(s.nextMeeting) + ' ' + D.long(s.nextMeeting) }))));
    return [ui.sectionNote(app.model.sections.calendar, 'calendar entries'),
      rows.length ? h('ul', { class: 'plain' }, rows) : h('p', { class: 'muted', text: 'Nothing in the calendar for the next 60 days.' })];
  }

  // Meetings to come, and those held or cancelled, newest first (spec MTG-1).
  function meetingsTab(app, area) {
    var m = app.model;
    var list = m.meetings.filter(function (x) { return x.areaKey === area.key; });
    var coming = list.filter(function (x) { return x.status === 'In Progress' || (x.status === 'Scheduled' && x.dateIso >= m.today); });
    var past = list.filter(function (x) { return coming.indexOf(x) < 0; }).reverse();
    var item = function (x) {
      var st = { 'Scheduled': ['later', 'Booked'], 'In Progress': ['soon', 'In progress'], 'Finalised': ['done', 'Minutes'], 'Cancelled': ['late', 'Cancelled'] }[x.status] || ['later', x.status];
      return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openMeeting(x); } },
        h('span', null, h('span', { class: 't', text: D.weekday(x.dateIso) + ' ' + D.long(x.dateIso) + ', ' + x.start }),
          h('span', { class: 's', text: [x.location || (x.onlineLink ? 'Online' : ''), x.chairName ? x.chairName + ' chairs' : '', x.attendeeIds.length + ' invited'].filter(Boolean).join(' · ') })),
        ui.chip(st[0], st[1])));
    };
    return [
      h('div', { class: 'row tab-actions' }, app.access.runsMeetings(area.key) ? ui.button('Book a meeting', function () { app.bookMeeting(area.key); }) : null),
      ui.sectionNote(m.sections.meetings, 'meetings'),
      h('h2', { class: 'group-title', text: 'Coming up' }),
      coming.length ? h('ul', { class: 'items' }, coming.map(item)) : h('p', { class: 'muted', text: 'No meeting is booked.' }),
      h('h2', { class: 'group-title', text: 'Earlier' }),
      past.length ? h('ul', { class: 'items' }, past.map(item)) : h('p', { class: 'muted', text: 'No earlier meetings in the Hub.' })
    ];
  }

  function render(app, key, tabIndex) {
    var m = app.model;
    var area = m.areaByKey[key];
    var acc = app.access;
    var s = m.stats[key];
    var out = [];

    out.push(h('nav', { class: 'areastrip', 'aria-label': 'Areas' },
      h('button', { type: 'button', class: 'back', onclick: app.goHome, text: '‹ My week' }),
      m.areas.filter(function (a) { return a.status === 'Active' || a.key === key; }).map(function (a) {
        var mine = acc.canWrite(a.key);
        return h('button', { type: 'button', class: mine ? '' : 'other', 'aria-current': a.key === key ? 'page' : null,
          title: mine ? null : 'View only', onclick: function () { app.openArea(a.key); }, text: a.name });
      })));

    out.push(h('h1', { text: area.name }));
    out.push(sentence(area, s, m.sections.actions));

    if (area.status !== 'Active') {
      out.push(h('div', { class: 'viewonly-bar', role: 'note' }, h('b', { text: 'Archived. ' }), 'This area is kept for reference and can no longer be changed.'));
    } else if (!acc.canWrite(key)) {
      out.push(h('div', { class: 'viewonly-bar', role: 'note' }, h('b', { text: 'View only. ' }),
        'You are not a member of ' + area.name + ', so you can read everything here' + (acc.canPostNotice(key) ? ' and post on its noticeboard' : '') + ', but cannot change anything else. ' +
        'Speak to one of the ' + area.name + ' engineers or your Team Leader if something needs doing.'));
    } else {
      out.push(h('div', { class: 'row actions-row' },
        ui.button('Raise an action', function () { app.raiseAction(key); }, 'main'),
        acc.canPostNotice(key) ? ui.button('Post a notice', function () { app.postNotice(key); }) : null,
        acc.runsMeetings(key) ? ui.button('Book a meeting', function () { app.bookMeeting(key); }) : null));
    }

    var tabs = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': area.name + ' sections' });
    var panel = h('div', { class: 'panel', role: 'tabpanel' });
    function show(i) {
      app.state.tab = i;
      Array.prototype.forEach.call(tabs.children, function (b, j) {
        b.setAttribute('aria-selected', String(i === j));
        b.tabIndex = i === j ? 0 : -1;
      });
      CH.dom.clear(panel);
      CH.dom.append(panel, [actionsTab, noticesTab, calendarTab, meetingsTab][i](app, area));
    }
    TABS.forEach(function (label, i) {
      tabs.appendChild(h('button', { type: 'button', role: 'tab', text: label, onclick: function () { show(i); },
        onkeydown: function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          var next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
          show(next);
          tabs.children[next].focus();
        } }));
    });
    out.push(tabs, panel);
    show(tabIndex || 0);
    return out;
  }

  return { render: render };
})();
