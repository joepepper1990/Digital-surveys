// Administration (spec REL-3): whether automatic processing is working, and the changes that need an
// administrator. Each change shows what was asked, by whom and when, how far it got and the last error, with the
// choices that are honest for its state: Try again or Cancel when nothing was changed; Finish or Revert when part
// of it was made. Every choice is a queued request checked again by the Administration flow.
CH.views = CH.views || {};
CH.views.admin = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;
  var OPEN_STATES = ['Needs attention', 'Failed', 'Received', 'Planned', 'Applying'];
  var QUIET_MINUTES = 15;
  var ACTION_TYPES = ['RaiseAction', 'ExtendDeadline', 'MarkComplete', 'ChangeStatus', 'ReassignAction', 'CloseAction', 'ReopenAction', 'EditActionDetails'];
  var WORDS = {
    RaiseAction: 'Raise an action', ExtendDeadline: 'Move a deadline', MarkComplete: 'Mark an action as done', ChangeStatus: 'Change the status of an action',
    ReassignAction: 'Reassign an action', CloseAction: 'Close an action', ReopenAction: 'Reopen an action', EditActionDetails: 'Edit the details of an action',
    AddPerson: 'Add a person', UpdatePerson: 'Change a person\'s access', PersonLeft: 'Mark a person as left', ReactivatePerson: 'Reactivate a person',
    UpdateSetting: 'Change a setting', RetryTransaction: 'Try a change again', CancelTransaction: 'Cancel a change', RevertTransaction: 'Revert a change',
    EditNotice: 'Edit a notice', ArchiveNotice: 'Archive a notice', PinNotice: 'Pin or unpin a notice', HideComment: 'Hide a comment',
    RaiseRegisterEntry: 'Raise an improvement or degradation', UpdateRegisterEntry: 'Change an improvement or degradation',
    LinkActionToEntry: 'Link an action to an entry', UnlinkActionFromEntry: 'Unlink an action from an entry'
  };
  var SETTING_WORDS = {
    OverdueReminderIntervalDays: 'days between late reminders', ReminderDaysBefore: 'days before the deadline for the first reminder',
    MaxDeadlineYears: 'furthest deadline in years', MonitorHours: 'queue monitor hours', DueSoonDays: 'days counted as due soon'
  };

  function parse(text) { try { return JSON.parse(text || '{}') || {}; } catch (_) { return {}; } }

  // The open transactions, oldest first, with the action each is for (read as it is now).
  async function load(app) {
    var title = CH.config.lists.history.title;
    var rows = [];
    for (var i = 0; i < OPEN_STATES.length; i++) {
      var res = await app.sp.items(title, '$select=Id,Title,RequestKey,RequestType,RecordId,State,Attempts,LastError,FirstClaimedAt,ActorId,Payload,StepsDone,Created,Modified' +
        "&$filter=RowKind eq 'Transaction' and State eq '" + OPEN_STATES[i] + "'", 500);
      rows = rows.concat(res.rows);
    }
    var now = Date.now();
    rows = rows.filter(function (r) {
      return r.State === 'Needs attention' || (now - new Date(r.Modified || r.Created).getTime()) / 60000 >= QUIET_MINUTES;
    }).sort(function (a, b) { return a.Id - b.Id; });
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var action = null;
      var payload = parse(r.Payload);
      if (ACTION_TYPES.indexOf(r.RequestType) < 0) {
        // people, settings and decisions: once decided, groups or rows may already have changed
        out.push({ tx: r, action: null, partly: String(r.StepsDone || '').indexOf('DECIDED') >= 0, payload: payload, admin: true });
        continue;
      }
      try {
        var q = r.RequestType === 'RaiseAction'
          ? "$filter=CreatedRequestKey eq '" + CH.sp.escapeOData('F|' + r.RequestKey) + "'"
          : '$filter=Id eq ' + (Number(r.RecordId) || 0);
        var found = await app.sp.items(CH.config.lists.actions.title, '$select=Id,Title,PendingRequestKey,LastRequestKey&' + q, 1);
        action = found.rows[0] || null;
      } catch (_) { action = null; }
      var partly = !!action && action.PendingRequestKey === r.RequestKey;
      out.push({ tx: r, action: action, partly: partly, payload: payload });
    }
    return out;
  }

  function describe(app, item) {
    var r = item.tx;
    var what = WORDS[r.RequestType] || r.RequestType;
    var p = item.payload;
    if (item.action) what += ': ' + 'ACT-' + ('0000' + item.action.Id).slice(-5) + ' ' + item.action.Title;
    else if (r.RequestType === 'RaiseAction' && p.title) what += ': ' + p.title;
    else if (r.RequestType === 'AddPerson' && p.email) what += ': ' + p.email;
    else if (p.personId) what += ': ' + app.model.nameOf(p.personId);
    else if (r.RequestType === 'UpdateSetting' && p.name) what += ': ' + (SETTING_WORDS[p.name] || p.name);
    else if (p.title) what += ': ' + p.title;
    return what;
  }

  function stateWords(item) {
    if (item.tx.State === 'Needs attention') {
      if (!item.partly) return 'Not made – nothing was changed';
      return item.admin ? 'Partly done – choose Finish to complete it' : 'Partly done – the action stays locked until you finish or revert it';
    }
    if (item.tx.State === 'Failed') return 'Failed – being tried again automatically';
    return 'Interrupted – being tried again automatically';
  }

  function healthCard(app) {
    var hl = app.health || {};
    var lines = [];
    if (hl.processing === 'ok') lines.push(h('li', null, h('span', null, h('b', { text: 'Automatic processing is working. ' }),
      'Last checked at ' + D.ukTime(hl.checkedAt) + '.'), ui.chip('done', 'Working')));
    else if (hl.processing === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Automatic processing is not working. ' }), hl.reason,
      ' Staff cannot send changes until it recovers. In Power Automate, check the flows ESG Competency Hub | 2 Request queue and 3 Queue monitor.'), ui.chip('late', 'Not working')));
    else lines.push(h('li', null, h('span', null, h('b', { text: 'The queue monitor has not reported yet. ' }),
      'Check that the flow ESG Competency Hub | 3 Queue monitor is turned on.'), ui.chip('soon', 'Unknown')));
    if (hl.records === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Changes to notices and the register are not being processed. ' }), hl.recordsReason,
      ' Actions carry on as normal. In Power Automate, check that ESG Competency Hub | 4 Records is turned on.'), ui.chip('late', 'Not working')));
    if (hl.administration === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Administration changes are not being processed. ' }), hl.adminReason,
      ' Staff can carry on as normal. In Power Automate, check that ESG Competency Hub | 6 Administration is turned on.'), ui.chip('late', 'Not working')));
    if (hl.reminders === 'ok') lines.push(h('li', null, h('span', null, h('b', { text: 'Reminders ran ' }), D.short(D.localDate(hl.lastDailyRun)) + ' at ' + D.ukTime(hl.lastDailyRun) + '.'), ui.chip('done', 'Working')));
    else lines.push(h('li', null, h('span', null, h('b', { text: hl.reminders === 'stale' ? 'Reminders have not run for more than a day. ' : 'Reminders have not run yet. ' }),
      'Check that the flow ESG Competency Hub | 1 Daily tasks is turned on.'), ui.chip('soon', 'Check')));
    return ui.card('Automatic processing', h('ul', { class: 'plain' }, lines));
  }

  function choices(app, item, onDone) {
    var isAction = ACTION_TYPES.indexOf(item.tx.RequestType) >= 0;
    var list = item.partly
      ? [['RetryTransaction', 'Finish', 'Try the rest of this change again. What was already made stays.'],
        isAction && !item.admin ? ['RevertTransaction', 'Revert', item.tx.RequestType === 'RaiseAction'
          ? 'Withdraw the half-created action. It is closed as withdrawn and kept in the history.'
          : 'Put the action back as it was before this change. The reversal is recorded in the history.'] : null]
      : [['RetryTransaction', 'Try again', 'Put this change back in the queue to be tried again.'],
        ['CancelTransaction', 'Cancel', 'Close this change without making it. The person who asked sees that it was cancelled.']];
    var box = h('div', { class: 'row' });
    function confirmStep(choice) {
      CH.dom.clear(box);
      CH.dom.append(box, [h('span', { text: choice[2] + ' ' }),
        ui.button('Yes, ' + choice[1].toLowerCase(), async function (e) {
          e.target.disabled = true;
          try {
            var entry = await app.tracker.submit({ type: choice[0], targetId: item.tx.Id, payload: { txId: item.tx.Id, note: '' },
              label: choice[1] + ': ' + describe(app, item) });
            item.sent = entry;
            onDone();
          } catch (error) {
            CH.dom.clear(box);
            CH.dom.append(box, h('span', { class: 'field-error', text: 'Could not send that just now. Try again in a moment.' }));
          }
        }, 'main'),
        ui.linkButton('No', function () { CH.dom.clear(box); CH.dom.append(box, buttons()); })]);
    }
    function buttons() {
      return list.filter(Boolean).map(function (c) { return ui.button(c[1], function () { confirmStep(c); }); });
    }
    CH.dom.append(box, buttons());
    return box;
  }

  function sentLine(entry) {
    if (!entry) return null;
    var waiting = entry.state === 'submitted' || entry.state === 'slow';
    if (waiting) return h('p', { class: 'pending', role: 'status', text: entry.label + ' – sent at ' + D.ukTime(entry.submittedAt) + ', waiting for the result.' });
    return h('p', { class: entry.state === 'done' ? 'ok-note' : 'section-note', role: 'status',
      text: (entry.state === 'done' ? 'Done: ' : 'Not done: ') + entry.message });
  }

  function changeList(app) {
    var st = app.admin;
    if (!st || st.loading) return h('p', { class: 'muted', text: 'Loading the changes that need attention…' });
    if (st.error) return h('p', { class: 'section-note', text: 'The changes could not be read just now. Reload the page to try again.' });
    if (!st.items.length) return h('p', { class: 'muted', text: 'Nothing needs your attention. Every change has been recorded.' });
    return h('ul', { class: 'plain admin-changes' }, st.items.map(function (item) {
      var r = item.tx;
      return h('li', { class: 'admin-change' }, h('div', null,
        h('b', { text: describe(app, item) }), h('br'),
        h('span', { class: 'muted small', text: 'Asked by ' + app.model.nameOf(r.ActorId) + ' at ' +
          D.short(D.localDate(r.FirstClaimedAt || r.Created)) + ' ' + D.ukTime(r.FirstClaimedAt || r.Created) +
          ' · ' + (Number(r.Attempts) || 0) + (Number(r.Attempts) === 1 ? ' attempt' : ' attempts') + ' · reference ' + r.RequestKey }),
        h('p', null, ui.chip(item.partly ? 'late' : 'soon', stateWords(item))),
        r.LastError ? h('p', { class: 'muted small', text: 'Last error: ' + r.LastError }) : null,
        item.sent ? sentLine(item.sent) : choices(app, item, function () { app.refreshView(); })));
    }));
  }

  // Repaints only while the changes tab is showing, so a form being filled in on another tab is never wiped.
  async function refresh(app) {
    var showing = function () { return app.state.view === 'admin' && (app.adminTab || 0) === 0; };
    app.admin = { loading: true, items: [] };
    if (showing()) app.refreshView();
    try {
      app.admin = { loading: false, items: await load(app) };
    } catch (_) {
      app.admin = { loading: false, error: true, items: [] };
    }
    if (showing()) app.refreshView();
  }

  var TABS = ['Changes needing attention', 'People', 'Settings', 'Feedback'];

  function render(app) {
    if (!app.access.isAdministrator) {
      return [h('h1', { text: 'Administration' }), h('p', { text: 'Only Competency Hub administrators can use this page.' })];
    }
    var tab = app.adminTab || 0;
    if (tab === 0 && !app.admin) setTimeout(function () { refresh(app); }, 0);
    var bar = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Administration' }, TABS.map(function (t, i) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), tabindex: i === tab ? '0' : '-1', text: t,
        onclick: function () { app.adminTab = i; app.refreshView(); },
        onkeydown: function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          app.adminTab = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
          app.refreshView();
          var sel = app.root.querySelector('.subtabs [aria-selected="true"]');
          if (sel) sel.focus();
        } });
    }));
    var panel = tab === 1 ? CH.views.people.list(app) : tab === 2 ? CH.views.settings.render(app) : tab === 3 ? CH.views.feedback.review(app) : [
      healthCard(app),
      ui.card('Changes needing attention', [
        h('p', { class: 'muted small', text: 'Changes that failed three times, and runs that stopped more than ' + QUIET_MINUTES + ' minutes ago. The queue monitor retries the rest by itself.' }),
        h('div', { class: 'row' }, ui.linkButton('Check again', function () { refresh(app); })),
        changeList(app)])];
    return [
      h('div', { class: 'row' }, ui.linkButton('‹ Overview', app.goHome)),
      h('h1', { text: 'Administration' }),
      bar,
      h('div', { class: 'panel', role: 'tabpanel' }, panel)
    ];
  }

  return { render: render, load: load, refresh: refresh };
})();
