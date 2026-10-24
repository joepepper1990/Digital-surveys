// Administration → Remove test data (spec §7.4, Q5), used once before go-live. While test marking is on, everything
// the flows and the app create is marked as a test record. This page lists them, and the older records made before
// marking existed, which an administrator ticks by hand – nothing is chosen by its title. Typing REMOVE TEST DATA sends
// one request to the Clean-up flow, which moves them and everything that depends on them to the recycle bin, writes one
// audit entry and switches test marking off.
CH.views = CH.views || {};
CH.views.cleanup = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var KINDS = [
    { type: 'Action', list: 'actions', label: 'Actions', ref: function (r) { return 'ACT-' + ('0000' + r.Id).slice(-5); }, extra: ',SourceType,SourceId' },
    { type: 'Notice', list: 'notices', label: 'Notices', ref: function (r) { return 'Notice ' + r.Id; }, extra: '' },
    { type: 'Register Entry', list: 'register', label: 'Improvements and degradations', ref: function (r) { return 'REG-' + ('0000' + r.Id).slice(-5); }, extra: '' },
    { type: 'Meeting', list: 'meetings', label: 'Meetings (with their agenda, record and PDF minutes)', ref: function (r) { return 'MTG-' + ('0000' + r.Id).slice(-5); }, extra: '' },
    { type: 'Feedback', list: 'feedback', label: 'Feedback', ref: function (r) { return 'Feedback ' + r.Id; }, extra: '' }
  ];
  var CONFIRM = 'REMOVE TEST DATA';

  // IsTestRecord is indexed: marked ones, and the unmarked ones an administrator may tick.
  async function refresh(app) {
    var st = app.cleanup = { loading: true, rows: {}, ticked: app.cleanup ? app.cleanup.ticked : {} };
    app.refreshView();
    try {
      await Promise.all(KINDS.map(async function (k) {
        var sel = '$select=Id,Title,FileDirRef,Created' + k.extra + '&$filter=IsTestRecord eq ';
        var res = await Promise.all([app.sp.items(CH.config.lists[k.list].title, sel + '1', 2000), app.sp.items(CH.config.lists[k.list].title, sel + '0', 500)]);
        st.rows[k.type] = { marked: res[0].rows, other: res[1].rows };
      }));
      st.loading = false;
    } catch (_) { st.loading = false; st.error = true; }
    if (app.cleanup === st) app.refreshView();
  }

  function chosen(st) {
    var out = {};
    KINDS.forEach(function (k) {
      var r = st.rows[k.type] || { marked: [], other: [] };
      out[k.type] = r.marked.map(function (x) { return x.Id; }).concat(r.other.filter(function (x) { return st.ticked[k.type + ':' + x.Id]; }).map(function (x) { return x.Id; }));
    });
    return out;
  }

  // The same rule as the flow: an action raised from a meeting, or linked to an entry, that is being removed goes too.
  function leftBehind(st) {
    var c = chosen(st);
    var actions = (st.rows.Action.marked || []).concat(st.rows.Action.other || []);
    return actions.filter(function (a) {
      var source = a.SourceType === 'Register' ? 'Register Entry' : a.SourceType === 'Meeting' ? 'Meeting' : null;
      return source && c[source].indexOf(Number(a.SourceId)) >= 0 && c.Action.indexOf(a.Id) < 0;
    });
  }

  function render(app) {
    if (!app.health || !app.health.testing) {
      return h('p', { class: 'section-note', text: 'Test marking is off: the Hub is live, so nothing can be removed this way.' });
    }
    var st = app.cleanup;
    if (!st) { setTimeout(function () { refresh(app); }, 0); return h('p', { class: 'muted', text: 'Finding the test records…' }); }
    if (st.loading) return h('p', { class: 'muted', text: 'Finding the test records…' });
    if (st.error) return h('p', { class: 'section-note', text: 'The records could not be read just now. Reload the page to try again.' });
    var c = chosen(st);
    var total = KINDS.reduce(function (n, k) { return n + c[k.type].length; }, 0);
    var behind = leftBehind(st);
    var e = app.tracker.entries().filter(function (x) { return x.type === 'RemoveTestRecords'; }).slice(-1)[0];
    var sending = e && (e.state === 'submitted' || e.state === 'slow');
    var confirm = h('input', { id: 'ch-cl-confirm', type: 'text', autocomplete: 'off', value: st.confirmText || '', oninput: function (ev) { st.confirmText = ev.target.value; } });
    var err = h('p', { class: 'form-error', role: 'alert', id: 'ch-cl-error' });
    var form = h('form', { class: 'dialog-body', novalidate: true },
      CH.ui.dialog.field('Type ' + CONFIRM + ' to confirm', confirm, 'Everything listed above, and everything that depends on it, goes to the recycle bin. It can be restored from there for 93 days.'),
      err, h('button', { type: 'submit', class: 'btn btn-main', text: 'Remove test data', disabled: sending || behind.length ? true : null }));
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (confirm.value.trim() !== CONFIRM) { err.textContent = 'Type ' + CONFIRM + ' exactly, in capitals.'; return; }
      try {
        await app.tracker.submit({ type: 'RemoveTestRecords', payload: { confirm: CONFIRM, include: c }, label: 'Remove ' + total + ' test records' });
        st.confirmText = '';
        app.refreshView();
      } catch (error) { err.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.'; }
    });
    return [
      h('p', { text: 'Before go-live, remove what was made while testing. Records marked as test records are listed and always removed. Records made before marking existed are listed underneath: tick the ones that were tests. Nothing is chosen by its title.' }),
      h('p', { class: 'muted small', text: 'Also removed with each: its history, comments and flags, requests and email records; for a meeting, its agenda, record and PDF minutes. One audit entry lists everything, and test marking is then switched off.' }),
      KINDS.map(function (k) {
        var r = st.rows[k.type] || { marked: [], other: [] };
        return ui.card(k.label + ' (' + c[k.type].length + ' to remove)', [
          r.marked.length ? h('ul', { class: 'plain cleanup' }, r.marked.map(function (x) {
            return h('li', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' ' + k.ref(x) + ' ' + (x.Title || '')), ui.chip('later', 'Test record'));
          })) : h('p', { class: 'muted small', text: 'None marked.' }),
          r.other.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Made before marking (' + r.other.length + ') – tick any that were tests' }),
            h('ul', { class: 'plain cleanup' }, r.other.map(function (x) {
              var key = k.type + ':' + x.Id;
              return h('li', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-key': key, checked: st.ticked[key] ? true : null,
                onchange: function (ev) { st.ticked[key] = ev.target.checked; app.refreshView(); } }), ' ' + k.ref(x) + ' ' + (x.Title || '')));
            }))) : null
        ]);
      }),
      behind.length ? h('div', { class: 'section-note', id: 'ch-cl-behind' }, h('b', { text: 'Include these too: ' }),
        behind.map(function (a) { return 'ACT-' + ('0000' + a.Id).slice(-5) + ' ' + a.Title; }).join('; ') +
        '. They were raised from, or linked to, a record being removed.') : null,
      e && e.state === 'done' ? h('p', { class: 'muted', role: 'status', text: e.message || 'Done.' }) : null,
      e && (e.state === 'rejected' || e.state === 'attention') ? h('p', { class: 'section-note', role: 'alert', text: e.message }) : null,
      sending ? h('p', { class: 'pending', role: 'status', text: 'Removing the test records – being recorded.' }) : null,
      total ? null : h('p', { class: 'muted', text: 'There is nothing to remove. Confirming still switches test marking off, ready for go-live.' }),
      form
    ];
  }

  return { render: render, refresh: refresh, chosen: chosen, leftBehind: leftBehind, CONFIRM: CONFIRM };
})();
