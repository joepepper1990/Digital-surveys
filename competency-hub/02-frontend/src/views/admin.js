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
    UpdateSetting: 'Change a setting', SetKnownAs: 'Change the name someone is known by', RetryTransaction: 'Try a change again', CancelTransaction: 'Cancel a change', RevertTransaction: 'Revert a change',
    EditNotice: 'Edit a notice', ArchiveNotice: 'Archive a notice', PinNotice: 'Pin or unpin a notice', HideComment: 'Hide a comment',
    RaiseRegisterEntry: 'Raise an improvement or degradation', UpdateRegisterEntry: 'Change an improvement or degradation',
    LinkActionToEntry: 'Link an action to an entry', UnlinkActionFromEntry: 'Unlink an action from an entry',
    ScheduleMeeting: 'Book a meeting', UpdateMeeting: 'Change a meeting', CancelMeeting: 'Cancel a meeting', StartMeeting: 'Start a meeting',
    FinaliseMeeting: 'Finalise the minutes', AmendMeeting: 'Amend the minutes', RemoveTestRecords: 'Remove test data'
  };
  var SETTING_WORDS = {
    OverdueReminderIntervalDays: 'days between late reminders', ReminderDaysBefore: 'days before the deadline for the first reminder',
    MaxDeadlineYears: 'furthest deadline in years', MonitorHours: 'queue monitor hours', DueSoonDays: 'days counted as due soon',
    InvitesEnabled: 'Outlook invitations', PdfEnabled: 'PDF minutes'
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
    if (hl.meetings === 'down') lines.push(h('li', null, h('span', null, h('b', { text: 'Meeting bookings and changes are not being processed. ' }), hl.meetingsReason,
      ' Everything else carries on. In Power Automate, check that ESG Competency Hub | 5 Meetings is turned on.'), ui.chip('late', 'Not working')));
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
            var entry = await app.tracker.submit({ type: choice[0], targetId: item.tx.Id, targetType: 'Transaction', payload: { txId: item.tx.Id, note: '' },
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

  // the decision already sent about this change, if any (found again after the list is read again)
  function sentFor(app, item) {
    if (item.sent) return item.sent;
    return app.tracker.entries().filter(function (e) {
      return e.targetType === 'Transaction' && Number(e.targetId) === Number(item.tx.Id) && !e.dismissed && e.state !== 'dropped';
    }).slice(-1)[0] || null;
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
        sentFor(app, item) ? sentLine(sentFor(app, item)) : choices(app, item, function () { app.refreshView(); })));
    }));
  }

  // Repaints only while the changes tab is showing, so a form being filled in on another tab is never wiped.
  async function refresh(app) {
    var showing = function () { return app.state.view === 'admin' && (app.adminTab || 0) === 0; };
    app.admin = { loading: true, items: [] };
    if (showing()) app.refreshView();
    var timed = loadTimings(app).catch(function () { return null; });
    try {
      app.admin = { loading: false, items: await load(app) };
    } catch (_) {
      app.admin = { loading: false, error: true, items: [] };
    }
    app.admin.timings = await timed;
    if (showing()) app.refreshView();
  }

  // ---- How long changes take (release 1.2): from the transactions of the last 7 days. Each applied one keeps when
  // its request was sent (EventTime), picked up by its flow (FirstClaimedAt, to the minute) and saved (ProcessedAt).
  var TIMING_DAYS = 7;
  async function loadTimings(app) {
    var since = new Date(Date.now() - TIMING_DAYS * 86400000).toISOString();
    var res = await app.sp.items(CH.config.lists.history.title, '$select=Id,RequestType,State,EventTime,FirstClaimedAt,ProcessedAt' +
      "&$filter=FirstClaimedAt ge datetime'" + since + "' and RowKind eq 'Transaction'", 2000);
    return timings(res.rows);
  }

  function median(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  }
  // rows: transaction rows. Only applied ones with all three times count; a time that runs backwards is not counted.
  function timings(rows) {
    var by = {};
    var all = { saves: [], picks: [] };
    (rows || []).forEach(function (r) {
      if (r.State !== 'Applied' || !r.EventTime || !r.ProcessedAt) return;
      var sent = new Date(r.EventTime).getTime();
      var saved = (new Date(r.ProcessedAt).getTime() - sent) / 1000;
      if (!(saved >= 0)) return;
      var picked = r.FirstClaimedAt ? Math.max(0, (new Date(r.FirstClaimedAt).getTime() - sent) / 1000) : null;
      var x = by[r.RequestType] = by[r.RequestType] || { type: r.RequestType, saves: [], picks: [] };
      x.saves.push(saved); all.saves.push(saved);
      if (picked !== null) { x.picks.push(Math.min(picked, saved)); all.picks.push(Math.min(picked, saved)); }
    });
    var list = Object.keys(by).map(function (k) {
      var x = by[k];
      return { type: k, label: WORDS[k] || k, count: x.saves.length, picked: median(x.picks), saved: median(x.saves), slowest: Math.max.apply(null, x.saves) };
    }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
    return { days: TIMING_DAYS, list: list, count: all.saves.length, picked: median(all.picks), saved: median(all.saves),
      slowest: all.saves.length ? Math.max.apply(null, all.saves) : null };
  }
  function took(sec) {
    if (sec === null || sec === undefined) return '–';
    if (sec < 60) return Math.round(sec) + ' s';
    if (sec < 600) return (Math.round(sec / 6) / 10) + ' min';
    if (sec < 5400) return Math.round(sec / 60) + ' min';
    return (Math.round(sec / 360) / 10) + ' h';
  }
  function timingsCard(app) {
    var t = app.admin && app.admin.timings;
    if (!app.admin || app.admin.loading) return null;
    if (!t) return ui.card('How long changes take', h('p', { class: 'section-note', text: 'The timings could not be read just now.' }));
    var row = function (label, x) { return h('tr', null, h('td', { text: label }), h('td', { class: 'num', text: String(x.count) }), h('td', { class: 'num', text: took(x.picked) }),
      h('td', { class: 'num', text: took(x.saved) }), h('td', { class: 'num', text: took(x.slowest) })); };
    return ui.card('How long changes take', [
      h('p', { class: 'muted small', text: 'Changes saved in the last ' + t.days + ' days: from being sent, how long until the flow picked each up, and until it was saved (the middle value, and the slowest). Picked up is to the nearest minute.' }),
      t.count ? h('table', { class: 't timings' }, h('thead', null, h('tr', null, ['Kind of change', 'Saved', 'Picked up after', 'Saved after', 'Slowest'].map(function (x, i) { return h('th', { class: i ? 'num' : null, text: x }); }))),
        h('tbody', null, row('All changes', t), t.list.map(function (x) { return row(x.label, x); })))
        : h('p', { class: 'muted', text: 'No changes have been saved with their times yet. Times are kept from solution 1.9.0.4 on.' })]);
  }

  // What this browser noticed going wrong lately (1.4.0): staff send theirs with their feedback.
  function lateCard() {
    var list = CH.log.recent(7);
    return ui.card('What went wrong lately on this computer', list.length
      ? [h('p', { class: 'muted small', text: 'The last 7 days. Other people\'s come with their feedback when they tick the box.' }),
        h('ul', { class: 'plain small' }, list.slice(0, 12).map(function (e) { return h('li', { text: CH.dates.ukTime(new Date(e.at)) + ' ' + e.at.slice(0, 10) + ' – ' + e.text }); }))]
      : h('p', { class: 'muted small', text: 'Nothing in the last 7 days.' }));
  }

  var TABS = ['Changes needing attention', 'People', 'Settings', 'Feedback', 'Remove test data'];

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
    var panel = tab === 1 ? CH.views.people.list(app) : tab === 2 ? CH.views.settings.render(app) : tab === 3 ? CH.views.feedback.review(app) : tab === 4 ? CH.views.cleanup.render(app) : [
      healthCard(app),
      timingsCard(app),
      lateCard(),
      ui.card('Changes needing attention', [
        h('p', { class: 'muted small', text: 'Changes that failed three times, and runs that stopped more than ' + QUIET_MINUTES + ' minutes ago. The queue monitor retries the rest by itself.' }),
        h('div', { class: 'row' }, ui.linkButton('Check again', function () { refresh(app); })),
        changeList(app)])];
    return [
      h('h1', { text: 'Administration' }),
      bar,
      h('div', { class: 'panel', role: 'tabpanel' }, panel)
    ];
  }

  return { render: render, load: load, refresh: refresh, timings: timings, took: took };
})();
