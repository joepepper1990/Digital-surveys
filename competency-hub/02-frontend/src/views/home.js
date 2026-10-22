// Front pages by role (plan K1/K2): tiles at full width, then three columns of useful lists.
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

  function myActions(app) {
    var mine = app.model.actions.filter(function (a) { return a.ownerId === app.person.SiteUserId; });
    return ui.card('Your actions', [
      h('div', { class: 'row card-link' }, ui.linkButton('See all, including ones you raised', function () { app.showMine(0); })),
      ui.sectionNote(app.model.sections.actions, 'actions'),
      ui.actionList(mine, function (a) { return a.areaName; }, 'You have no open actions. Nice work.', app.model.sections.actions, app.openAction, app.pendingNote)
    ]);
  }

  function meetingsCard(app, keys, title) {
    var list = keys.map(function (k) { return { area: app.model.areaByKey[k], s: app.model.stats[k] }; })
      .filter(function (x) { return x.area && x.s.nextMeeting; })
      .sort(function (a, b) { return a.s.nextMeeting.localeCompare(b.s.nextMeeting); }).slice(0, 5);
    return ui.card(title, [
      ui.sectionNote(app.model.sections.meetings, 'meetings'),
      list.length ? h('ul', { class: 'plain' }, list.map(function (x) {
        return h('li', null,
          h('span', null, h('b', { text: x.area.name }), h('br'), h('span', { class: 'muted small', text: D.weekdayShort(x.s.nextMeeting) })),
          x.s.flagged ? ui.chip('later', x.s.flagged + ' to discuss') : null);
      })) : h('p', { class: 'muted', text: 'No meetings booked in your areas yet.' })
    ]);
  }

  function noticesCard(app, keys) {
    var list = app.model.notices.filter(function (n) { return keys.indexOf(n.areaKey) >= 0; }).slice(0, 4);
    return ui.card('New on your noticeboards', [
      ui.sectionNote(app.model.sections.notices, 'notices'),
      list.length ? h('ul', { class: 'plain' }, list.map(function (n) {
        return h('li', null, h('span', null, h('span', { text: n.title }), h('br'),
          h('span', { class: 'muted small', text: app.model.areaByKey[n.areaKey].name + ' · ' + n.authorName + ' · ' + D.short(n.createdIso) +
            (n.fromOutside ? ' · from outside the area' : '') })));
      })) : h('p', { class: 'muted', text: 'Nothing new on your noticeboards.' })
    ]);
  }

  function manageCard(app) {
    var keys = app.model.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
    if (app.model.sections.actions === 'unavailable') return ui.card('For you to manage', ui.sectionNote('unavailable', 'actions'), 'manage');
    // Each action counts once, even when it is shared between several of these areas.
    var mine = app.model.actions.filter(function (a) { return keys.some(function (k) { return app.model.inArea(a, k); }); });
    var closeOut = mine.filter(function (a) { return a.waitingCloseOut; }).length;
    var late = mine.filter(function (a) { return a.group === 'late'; }).length;
    var flagged = keys.reduce(function (n, k) { return n + app.model.stats[k].flagged; }, 0);
    var runs = keys.filter(function (k) { return app.access.runsMeetings(k) && app.model.stats[k].nextMeeting; })
      .sort(function (a, b) { return app.model.stats[a].nextMeeting.localeCompare(app.model.stats[b].nextMeeting); });
    var next = runs[0];
    return ui.card('For you to manage', [
      h('div', { class: 'manage-grid' },
        h('div', null, h('span', { class: 'num', text: closeOut }), 'actions waiting for a close-out check'),
        h('div', null, h('span', { class: 'num' + (late ? ' txt-late' : ''), text: late }), 'late actions in areas you look after'),
        h('div', null, h('span', { class: 'num', text: flagged }), 'items flagged for discussion')),
      next ? h('p', null, h('b', { text: 'Next meeting to prepare: ' }),
        app.model.areaByKey[next].name + ', ' + D.weekdayShort(app.model.stats[next].nextMeeting) + '.')
        : h('p', { class: 'muted', text: 'No meetings for you to run are booked.' })
    ], 'manage');
  }

  function attentionCard(app) {
    var m = app.model;
    var items = [];
    m.areas.forEach(function (a) {
      if (a.status === 'Active' && m.stats[a.key].meetingStale) {
        items.push(h('li', null, h('span', null, h('b', { text: a.name }),
          m.stats[a.key].lastMeeting ? ' has not met since ' + D.long(m.stats[a.key].lastMeeting) : ' has no meeting on record',
          h('br'), h('span', { class: 'muted small', text: 'No meeting booked' })), ui.chip('soon', 'Meeting overdue')));
      }
    });
    if (m.sections.actions !== 'unavailable') m.actions.filter(function (a) { return a.group === 'late'; })
      .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); }).slice(0, 6).forEach(function (a) {
        items.push(h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
          h('span', null, h('b', { text: a.title }), h('br'),
            h('span', { class: 'muted small', text: a.areaName + ' · ' + a.ownerName + (a.extensions >= 2 ? ' · deadline moved ' + a.extensions + ' times' : '') })),
          ui.chip('late', a.dueText))));
      });
    var closeOut = m.actions.filter(function (a) { return a.waitingCloseOut; }).length;
    if (closeOut) items.push(h('li', null, h('span', null, h('b', { text: closeOut + (closeOut === 1 ? ' action is' : ' actions are') }), ' waiting for a close-out check')));
    return ui.card('Needs your attention', [
      ui.sectionNote(m.sections.actions, 'actions'),
      items.length ? h('ul', { class: 'plain' }, items) : m.sections.actions === 'unavailable' ? null : h('p', { class: 'muted', text: 'Nothing needs your attention right now.' })
    ]);
  }

  function render(app) {
    var m = app.model;
    var acc = app.access;
    var out = [h('h1', { text: greeting(firstName(app)) })];
    var postFirst = acc.memberAreas[0] || (m.areas[0] && m.areas[0].key);

    if (acc.isManagement) {
      // Totals count each action once, even when it is shared between areas (MGT-01).
      var open = m.actions.length;
      var late = m.actions.filter(function (a) { return a.group === 'late'; }).length;
      var stale = m.areas.filter(function (a) { return a.status === 'Active' && m.stats[a.key].meetingStale; }).length;
      if (m.sections.actions === 'unavailable') out.push(h('p', { class: 'sentence', text: 'Action figures could not be loaded just now. Reload the page to try again.' }));
      else out.push(h('p', { class: 'sentence' }, 'Across the group: ', h('b', { text: open + ' open actions' }), ', ',
        h('b', { class: late ? 'txt-late' : '', text: late + ' late' }), stale ? [', and ', h('b', { text: stale + (stale === 1 ? ' area' : ' areas') }), ' with no recent meeting.'] : '.'));
      out.push(h('div', { class: 'row actions-row' },
        ui.button('Raise an action', function () { app.raiseAction(postFirst); }, 'main'),
        ui.button('Post a notice', function () { app.postNotice(postFirst); })));
      out.push(h('h2', { text: 'All areas' }));
      out.push(ui.tileGrid(m.areas.filter(function (a) { return a.status === 'Active'; }), m, false, app.openArea));
      out.push(h('div', { class: 'cols3' },
        h('div', null, attentionCard(app)),
        h('div', null, myActions(app)),
        h('div', null, meetingsCard(app, m.areas.map(function (a) { return a.key; }), 'Coming meetings'))));
    } else {
      out.push(h('p', { class: 'lead', text: acc.isEngineer ? 'Your actions, and what you look after as an engineer.' : 'Here is what needs your attention.' }));
      out.push(h('div', { class: 'row actions-row' },
        acc.memberAreas.length ? ui.button('Raise an action', function () { app.raiseAction(acc.memberAreas[0]); }, 'main') : null,
        ui.button('Post a notice', function () { app.postNotice(postFirst); })));
      var mine = m.areas.filter(function (a) { return acc.isMember(a.key) && a.status === 'Active'; });
      var others = m.areas.filter(function (a) { return !acc.isMember(a.key) && a.status === 'Active'; });
      out.push(h('h2', { text: 'Your areas' }));
      out.push(mine.length ? ui.tileGrid(mine, m, false, app.openArea)
        : h('p', { class: 'muted', text: 'You are not a member of any area yet. Ask a Team Leader to add you.' }));
      var keys = mine.map(function (a) { return a.key; });
      out.push(acc.isEngineer
        ? h('div', { class: 'cols3' }, h('div', null, manageCard(app)), h('div', null, myActions(app)), h('div', null, meetingsCard(app, keys, 'Your next meetings'), noticesCard(app, keys)))
        : h('div', { class: 'cols3' }, h('div', null, myActions(app)), h('div', null, meetingsCard(app, keys, 'Your next meetings')), h('div', null, noticesCard(app, keys))));
      if (others.length) {
        out.push(h('h2', { class: 'other-heading', text: 'Other areas' }));
        out.push(h('p', { class: 'muted other-note', text: 'You can see everything in these areas and post on their noticeboards. Only their members can change anything else.' }));
        out.push(ui.tileGrid(others, m, true, app.openArea));
      }
    }
    return out;
  }

  return { render: render, greeting: greeting, firstName: firstName };
})();
