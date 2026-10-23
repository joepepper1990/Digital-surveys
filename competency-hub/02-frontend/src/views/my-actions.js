// My actions (plan B.3 ACT-09, K9.3): the actions I own, the ones I raised and, for people who manage, those in
// their areas. One Area filter. Finished actions are read only when asked for ("Show finished items").
CH.views = CH.views || {};
CH.views.myActions = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;

  function tabsFor(app) {
    var me = app.person.SiteUserId;
    var tabs = [
      { label: 'Mine', who: 'AssignedToId', pick: function (a) { return Number(a.ownerId) === Number(me); } },
      { label: 'Raised by me', who: 'RaisedById', pick: function (a) { return Number(a.raisedById) === Number(me); } }
    ];
    var managed = app.model.areas.filter(function (a) { return app.access.canManage(a.key); }).map(function (a) { return a.key; });
    if (managed.length) {
      tabs.push({ label: app.access.isManagement ? 'All areas' : 'In my areas',
        pick: function (a) { return managed.some(function (k) { return app.model.inArea(a, k); }); } });
    }
    return tabs;
  }

  function finishedList(app, rows) {
    if (!rows.length) return h('p', { class: 'muted', text: 'No finished actions.' });
    app.finished = app.finished || {};
    return h('ul', { class: 'items' }, rows.map(function (row) {
      var a = app.model.actionFrom(row);
      app.finished[a.id] = a;
      return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
        h('span', null, h('span', { class: 't', text: a.title }),
          h('span', { class: 's', text: a.areaName + ' · ' + a.ownerName + (a.closeOutcome ? ' · ' + a.closeOutcome.toLowerCase() : '') })),
        ui.chip('done', a.closedIso ? 'Closed ' + D.short(a.closedIso) : 'Closed')));
    }));
  }

  function render(app) {
    var st = app.state;
    var tabs = tabsFor(app);
    var tab = Math.min(st.tab || 0, tabs.length - 1);
    var areaKey = st.areaFilter || '';
    var list = app.model.actions.filter(tabs[tab].pick).filter(function (a) { return !areaKey || app.model.inArea(a, areaKey); });
    var bar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'My actions' }, tabs.map(function (t, i) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), tabindex: i === tab ? '0' : '-1', text: t.label,
        onclick: function () { app.showMine(i, areaKey); },
        onkeydown: function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          app.showMine((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, areaKey, true);
        } });
    }));
    var filter = h('select', { id: 'ch-m-area', 'aria-label': 'Area', onchange: function (e) { app.showMine(tab, e.target.value); } },
      [h('option', { value: '', text: 'All areas' })].concat(app.model.areas.map(function (a) {
        return h('option', a.key === areaKey ? { value: a.key, selected: true, text: a.name } : { value: a.key, text: a.name });
      })));
    var finished = h('div', { class: 'finished' });
    if (tabs[tab].who) {
      finished.appendChild(ui.linkButton('Show finished items', async function (e) {
        e.target.disabled = true;
        e.target.textContent = 'Loading finished items…';
        try {
          var rows = await CH.model.loadFinished(app.sp, tabs[tab].who, app.person.SiteUserId);
          rows = rows.filter(function (r) { return !areaKey || (app.model.areas.filter(function (x) { return x.id === r.CompetencyId; })[0] || {}).key === areaKey; });
          CH.dom.clear(finished);
          CH.dom.append(finished, [h('h3', { class: 'group-title', text: 'Finished' }), finishedList(app, rows)]);
        } catch (_) {
          e.target.disabled = false;
          e.target.textContent = 'Could not load finished items – try again';
        }
      }));
    }
    return [
      h('div', { class: 'row' }, ui.linkButton('‹ Overview', app.goHome)),
      h('h1', { text: 'My actions' }),
      h('div', { class: 'row' }, h('label', { for: 'ch-m-area', text: 'Area ' }), filter),
      bar,
      h('div', { class: 'panel', role: 'tabpanel' },
        ui.sectionNote(app.model.sections.actions, 'actions'),
        ui.actionList(list, function (a) { return a.areaName + (tab === 0 ? '' : ' · ' + a.ownerName) + (a.blocker ? ' · waiting on something' : ''); },
          tab === 0 ? 'You have no open actions.' : 'No open actions here.', app.model.sections.actions, app.openAction, app.pendingNote),
        finished)
    ];
  }

  return { render: render };
})();
