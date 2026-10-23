// Management overview (spec MGT-1 to MGT-3): figures for the whole group and each area, and every figure opens
// exactly the actions it counts, by the same rule. Everyone can read every area's actions (E.0), so this page
// gathers them for management; it hides nothing that needs protecting. Closed actions are read on demand.
CH.views = CH.views || {};
CH.views.dashboard = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var ui = CH.ui;
  var PERIODS = [['30', 'Last 30 days'], ['90', 'Last 3 months'], ['365', 'Last 12 months']];

  // Closed actions in the period, newest first. IsOpen is indexed, so it leads the filter.
  async function loadClosed(app, days) {
    var since = D.addDays(app.model.today, -Number(days));
    var res = await app.sp.items(CH.config.lists.actions.title, CH.model.QUERIES.actions.replace('&$filter=IsOpen eq 1 and FSObjType eq 0',
      '&$filter=IsOpen eq 0 and FSObjType eq 0'), 5000);
    var rows = res.rows.filter(function (r) { return !CH.model.isUncommitted(r) && r.DateClosed && D.localDate(r.DateClosed) >= since; });
    app.finished = app.finished || {};
    var list = rows.map(function (r) { var a = app.model.actionFrom(r); app.finished[a.id] = a; return a; })
      .sort(function (a, b) { return String(b.closedIso).localeCompare(String(a.closedIso)); });
    return { list: list, complete: res.complete };
  }

  async function refresh(app) {
    var st = app.dash = app.dash || { days: '90', pick: null };
    var showing = function () { return app.state.view === 'manage'; };
    st.loading = true; st.error = false;
    if (showing()) app.refreshView();
    try { var got = await loadClosed(app, st.days); st.closed = got.list; st.closedComplete = got.complete; } catch (_) { st.error = true; st.closed = []; }
    st.loading = false;
    if (showing()) app.refreshView();
  }

  // The figures, each with the rule that picks its actions; the drill-down uses the same rule.
  function measures(app, key) {
    var m = app.model;
    var st = app.dash;
    var open = m.actions.filter(function (a) { return !key || m.inArea(a, key); });
    var closed = (st.closed || []).filter(function (a) { return !key || m.inArea(a, key); });
    var completed = closed.filter(function (a) { return a.closeOutcome === 'Completed'; });
    return {
      open: { label: 'Open', list: open },
      late: { label: 'Late', list: open.filter(function (a) { return a.group === 'late'; }), kind: 'late' },
      soon: { label: 'Due soon', list: open.filter(function (a) { return a.group === 'soon' && !a.waitingCloseOut; }), kind: 'soon' },
      closeOut: { label: 'Waiting for close-out', list: open.filter(function (a) { return a.waitingCloseOut; }) },
      completed: { label: 'Completed', list: completed, kind: 'done', closed: true },
      closed: { label: 'All closed', list: closed, closed: true }
    };
  }

  function figure(app, key, name, x) {
    var st = app.dash;
    var picked = st.pick && st.pick.key === (key || '') && st.pick.name === name;
    var pending = x.closed && (st.loading || !st.closed);
    return h('button', { type: 'button', class: 'dash-fig' + (picked ? ' on' : '') + (x.kind ? ' k-' + x.kind : ''), 'aria-pressed': String(picked),
      disabled: pending ? true : null,
      onclick: function () { st.pick = picked ? null : { key: key || '', name: name }; app.refreshView(); } },
      h('b', { text: pending ? '…' : String(x.list.length) }), h('span', { text: x.label }));
  }

  function drill(app) {
    var st = app.dash;
    if (!st.pick) return null;
    var m = app.model;
    var x = measures(app, st.pick.key)[st.pick.name];
    var where = st.pick.key ? m.areaByKey[st.pick.key].name : 'All areas';
    var rows = x.list.slice().sort(function (a, b) { return x.closed ? String(b.closedIso).localeCompare(String(a.closedIso)) : a.dueIso.localeCompare(b.dueIso); });
    return ui.card(where + ' – ' + x.label.toLowerCase() + ' (' + rows.length + ')', [
      rows.length ? h('ul', { class: 'items' }, rows.map(function (a) {
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { app.openAction(a); } },
          h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.areaName + ' · ' + a.ownerName +
            (x.closed ? ' · ' + (a.closeOutcome || 'Closed') : a.extensions ? ' · deadline moved ' + (a.extensions === 1 ? 'once' : a.extensions + ' times') : '') })),
          ui.chip(x.closed ? 'done' : a.waitingCloseOut ? 'later' : a.group, x.closed ? 'Closed ' + (a.closedIso ? D.short(a.closedIso) : '') : a.dueText)));
      })) : h('p', { class: 'muted', text: 'No actions.' }),
      h('div', { class: 'row' }, ui.linkButton('Close this list', function () { st.pick = null; app.refreshView(); }))], 'dash-drill');
  }

  function render(app) {
    if (!app.access.isManagement) {
      return [h('h1', { text: 'Management' }), h('p', { text: 'This page is for Team Leaders and the Group Head.' })];
    }
    var m = app.model;
    var st = app.dash;
    if (!st) { app.dash = { days: '90', pick: null }; setTimeout(function () { refresh(app); }, 0); st = app.dash; }
    var period = h('select', { 'aria-label': 'Closed in', onchange: function (e) { st.days = e.target.value; st.pick = null; refresh(app); } },
      PERIODS.map(function (p) { return h('option', { value: p[0], selected: p[0] === st.days ? true : null, text: p[1] }); }));
    var all = measures(app, '');
    var names = ['open', 'late', 'soon', 'closeOut', 'completed', 'closed'];
    var active = m.areas.filter(function (a) { return a.status === 'Active'; });
    var degr = active.reduce(function (n, a) { return n + m.stats[a.key].degradations; }, 0);
    var table = h('table', { class: 'dash-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Area' }), ['Open', 'Late', 'Due soon', 'Completed'].map(function (t) { return h('th', { scope: 'col', text: t }); }),
        h('th', { scope: 'col', text: 'Open issues' }), h('th', { scope: 'col', text: 'Next meeting' }))),
      h('tbody', null, active.map(function (a) {
        var x = measures(app, a.key);
        var s = m.stats[a.key];
        return h('tr', null, h('th', { scope: 'row' }, ui.linkButton(a.name, function () { app.openArea(a.key); })),
          ['open', 'late', 'soon', 'completed'].map(function (n) { return h('td', null, figure(app, a.key, n, x[n])); }),
          h('td', { text: s.openEntries ? s.openEntries + (s.degradations ? ' (' + s.degradations + ' degradation' + (s.degradations === 1 ? '' : 's') + ')' : '') : '–' }),
          h('td', { class: s.meetingStale ? 'txt-soon' : '', text: s.nextMeeting ? D.weekdayShort(s.nextMeeting) : s.lastMeeting ? 'None since ' + D.short(s.lastMeeting) : 'None booked' }));
      })));
    return [
      h('div', { class: 'row' }, ui.linkButton('‹ Overview', app.goHome)),
      h('h1', { text: 'Management' }),
      h('p', { class: 'sentence' }, 'Across the group: ' + all.open.list.length + ' open actions, ',
        all.late.list.length ? h('b', { class: 'txt-late', text: all.late.list.length + ' late' }) : 'none late',
        degr ? ', and ' + degr + ' unresolved degradation' + (degr === 1 ? '' : 's') + '.' : '.'),
      ui.sectionNote(m.sections.actions, 'actions'),
      st.error ? h('p', { class: 'section-note', text: 'Closed actions could not be read just now, so the completed figures are missing. ' }, ui.linkButton('Try again', function () { refresh(app); })) : null,
      st.closedComplete === false ? h('p', { class: 'section-note', text: 'Only the first 5,000 closed actions were read; the completed figures may be low.' }) : null,
      h('div', { class: 'row filters' }, h('label', null, 'Completed and closed in ', period)),
      h('div', { class: 'dash-figs' }, names.map(function (n) { return figure(app, '', n, all[n]); })),
      drill(app),
      ui.card('By area', [h('p', { class: 'muted small', text: 'Choose any number to see the actions it counts. An action shared with another area counts in both areas, and once in the group figures.' }), table]),
      h('p', { class: 'muted small', text: 'Everyone in the Hub can read every area\'s actions; this page gathers them in one place.' })
    ];
  }

  return { render: render, refresh: refresh, measures: measures, PERIODS: PERIODS };
})();
