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

  function noticesTab(app, area) {
    var list = app.model.notices.filter(function (n) { return n.areaKey === area.key; });
    return [
      h('div', { class: 'row tab-actions' }, ui.button('Post a notice', function () { app.postNotice(area.key); })),
      ui.sectionNote(app.model.sections.notices, 'notices'),
      list.length ? h('ul', { class: 'plain' }, list.map(function (n) {
        return h('li', null, h('span', null,
          h('b', { text: n.title }), n.important ? ui.chip('soon', 'Important') : null, h('br'),
          h('span', { class: 'notice-body', text: n.body.length > 240 ? n.body.slice(0, 240) + '…' : n.body }), h('br'),
          h('span', { class: 'muted small', text: n.category + ' · ' + (n.fromOutside ? 'From ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.short(n.createdIso) })));
      })) : h('p', { class: 'muted', text: 'Nothing has been posted on the ' + area.name + ' noticeboard yet.' }),
      h('p', { class: 'muted small', text: 'The improvements and degradations register appears here in the next version.' })
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

  function meetingsTab(app, area) {
    var s = app.model.stats[area.key];
    return [ui.sectionNote(app.model.sections.meetings, 'meetings'), h('ul', { class: 'plain' },
      h('li', null, h('span', null, h('b', { text: 'Next meeting' }), h('br'),
        h('span', { class: 'muted small', text: (s.nextMeeting ? D.weekday(s.nextMeeting) + ' ' + D.long(s.nextMeeting) : 'Not booked') + (s.flagged ? ' · ' + s.flagged + ' items to discuss' : '') }))),
      h('li', null, h('span', null, h('b', { text: 'Last meeting' }), h('br'),
        h('span', { class: 'muted small', text: s.lastMeeting ? D.long(s.lastMeeting) : 'None on record' })))),
      h('p', { class: 'muted small', text: 'Running meetings, agendas and minutes arrive in a later version.' })];
  }

  function render(app, key, tabIndex) {
    var m = app.model;
    var area = m.areaByKey[key];
    var acc = app.access;
    var s = m.stats[key];
    var out = [];

    out.push(h('nav', { class: 'areastrip', 'aria-label': 'Areas' },
      h('button', { type: 'button', class: 'back', onclick: app.goHome, text: '‹ Overview' }),
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
        'You are not a member of ' + area.name + ', so you can read everything here and post on its noticeboard, but cannot change anything else. ' +
        'Speak to one of the ' + area.name + ' engineers or your Team Leader if something needs doing.'));
    } else {
      out.push(h('div', { class: 'row actions-row' },
        ui.button('Raise an action', function () { app.raiseAction(key); }, 'main'),
        ui.button('Post a notice', function () { app.postNotice(key); }),
        acc.runsMeetings(key) ? ui.button(s.nextMeeting ? 'Start meeting' : 'Book a meeting', function () { app.comingSoon('Meetings'); }) : null));
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
