// One action (plan C.9): What, Who and When in plain words, three buttons, and its updates.
// "Add an update" is an instant write; "I need more time" and "Mark as done" are queued requests.
CH.views = CH.views || {};
CH.views.actionPanel = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var ui = CH.ui;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };

  function timeOf(date) { return D.ukTime(date); }

  // The panel's line about a change in progress, rejected or not yet recorded.
  function pendingLine(app, action) {
    var entry = app.tracker.forTarget(action.id);
    if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
      return h('p', { class: 'pending', role: 'status' }, h('b', { text: entry.label }), ' – submitted ' + timeOf(entry.submittedAt) +
        ', being recorded (usually under 5 minutes).' + (entry.state === 'slow' ? ' ' + entry.message : ''));
    }
    if (entry && (entry.state === 'rejected' || entry.state === 'failed')) {
      return h('div', { class: 'section-note', role: 'alert' }, h('b', { text: entry.state === 'rejected' ? 'Not accepted: ' : 'Not recorded yet: ' }),
        entry.message + ' ', ui.linkButton('Dismiss', function () { app.tracker.dismiss(entry); }));
    }
    if (action.locked) return h('p', { class: 'pending', role: 'status', text: 'Being updated… Try again in a minute.' });
    return null;
  }

  function whenText(action) {
    if (action.waitingCloseOut) return 'Done – waiting for a close-out check by ' + action.raisedByName + '.';
    var text = (action.group === 'late' ? 'Was due ' : 'Due ') + D.weekday(action.dueIso) + ' ' + D.long(action.dueIso) + '.';
    if (action.extensions) {
      text += ' Deadline moved ' + (action.extensions === 1 ? 'once' : action.extensions + ' times') +
        (action.originalIso !== action.dueIso ? ' (was ' + D.long(action.originalIso) + ').' : '.');
    }
    return text;
  }

  // Updates count only in the action's own folder, {area}/A{id} (plan F.5).
  async function loadUpdates(app, action) {
    var res = await app.sp.items(CH.config.lists.updates.title,
      "$select=Id,EntryType,Body,AuthorId,Created,FileDirRef,IsHidden&$filter=ParentType eq 'Action' and ParentId eq " + action.id, 500);
    var folder = '/' + action.areaKey + '/A' + action.id;
    return res.rows.filter(function (u) {
      return !u.IsHidden && String(u.FileDirRef || '').slice(-folder.length) === folder && u.EntryType !== 'Flagged' && u.EntryType !== 'Flag Withdrawn';
    }).sort(function (a, b) { return b.Id - a.Id; });
  }

  async function loadExtensions(app, action) {
    var res = await app.sp.items(CH.config.lists.history.title,
      "$select=Id,EventType,ActorId,EventTime,PreviousDueDate,NewDueDate,Note,ExtensionNumber,IsOnBehalf&$filter=RecordType eq 'Action' and RecordId eq " + action.id, 500);
    return res.rows.filter(function (r) { return r.EventType === 'Deadline Extended'; })
      .sort(function (a, b) { return (a.ExtensionNumber || 0) - (b.ExtensionNumber || 0); });
  }

  function open(app, id) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-a', title: 'Action', wide: true, onClose: function () { app.panel = null; } });
    var view = 'main';
    var updates = null;
    var extensions = null;
    var notFound = false;

    function action() { return app.model.actionById[id]; }

    async function loadExtras() {
      var a = action();
      if (!a) return;
      try { updates = await loadUpdates(app, a); } catch (_) { updates = 'error'; }
      try { extensions = a.extensions ? await loadExtensions(app, a) : []; } catch (_) { extensions = []; }
      if (view === 'main' && dlg.isOpen()) fill();
    }

    function fill() {
      CH.dom.clear(dlg.body);
      var a = action();
      if (!a) {
        dlg.setTitle('Action not available');
        CH.dom.append(dlg.body, h('p', { text: notFound ? 'This action is not available. It may have been closed, or you may not have access to it.'
          : 'This action could not be found.' }));
        return;
      }
      var r = R.roles(a, app.person.SiteUserId, app.access);
      var entry = app.tracker.forTarget(a.id);
      var busy = a.locked || (entry && (entry.state === 'submitted' || entry.state === 'slow'));
      dlg.setTitle(a.title);
      CH.dom.append(dlg.body, [
        h('p', { class: 'muted small', text: a.ref + ' · ' + a.areaName + (a.priority === 'High' ? ' · High priority' : '') }),
        pendingLine(app, a),
        h('dl', { class: 'facts' },
          h('dt', { text: 'When' }), h('dd', null, ui.chip(a.waitingCloseOut ? 'later' : a.group, a.dueText), ' ', whenText(a)),
          h('dt', { text: 'Who' }), h('dd', { text: a.ownerName + ' is doing it. Raised by ' + a.raisedByName + (a.raisedIso ? ' on ' + D.long(a.raisedIso) : '') + '.' }),
          h('dt', { text: 'What' }), h('dd', { class: 'notice-body', text: a.description || 'No description.' })),
        extensions && extensions.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Show all deadline changes (' + extensions.length + ')' }),
          h('ul', { class: 'plain' }, extensions.map(function (x) {
            return h('li', null, h('span', null,
              h('s', { text: x.PreviousDueDate ? D.short(D.localDate(x.PreviousDueDate)) : '' }), ' → ', h('b', { text: x.NewDueDate ? D.long(D.localDate(x.NewDueDate)) : '' }),
              h('br'), h('span', { class: 'muted small', text: app.model.nameOf(x.ActorId) + (x.IsOnBehalf ? ' (on behalf of the owner)' : '') +
                (x.EventTime ? ' · ' + D.short(D.localDate(x.EventTime)) : '') + ' · “' + (x.Note || '') + '”' })));
          }))) : null,
        h('div', { class: 'row actions-row' },
          r.canUpdate ? ui.button('Add an update', function () { show('update'); }, 'main') : null,
          r.canExtend ? ui.button('I need more time', function () { show('extend'); }) : null,
          r.canComplete ? ui.button('Mark as done', function () { show('complete'); }) : null),
        !r.canUpdate && !r.canExtend && !r.canComplete ? h('p', { class: 'muted small', text: 'You can read this action. Only its owner, the people who manage it and members of ' + a.areaName + ' can change it.' }) : null,
        h('h3', { class: 'group-title', text: 'Updates' }),
        updates === null ? h('p', { class: 'muted', text: 'Loading updates…' })
          : updates === 'error' ? h('p', { class: 'section-note', text: 'Could not load the updates just now.' })
          : updates.length ? h('ul', { class: 'plain' }, updates.map(function (u) {
            return h('li', null, h('span', null, h('span', { class: 'notice-body', text: u.Body || '' }), h('br'),
              h('span', { class: 'muted small', text: app.model.nameOf(u.AuthorId) + ' · ' + D.short(D.localDate(u.Created)) + ' ' + D.ukTime(u.Created) +
                (u.EntryType === 'Blocker' ? ' · blocker' : '') })));
          })) : h('p', { class: 'muted', text: 'No updates yet.' })
      ]);
      Array.prototype.forEach.call(dlg.body.querySelectorAll('.actions-row .btn'), function (b) { b.disabled = !!busy; });
    }

    function show(which) {
      view = which;
      CH.dom.clear(dlg.body);
      var a = action();
      if (which === 'update') updateForm(a);
      if (which === 'extend') extendForm(a);
      if (which === 'complete') completeForm(a);
      dlg.focusFirst();
    }
    function back() { view = 'main'; fill(); dlg.focusFirst(); }

    function formShell(title, fields, submitLabel, onSubmit) {
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: submitLabel });
      var form = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: title }), fields, errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: back })));
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorBox.textContent = '';
        submit.disabled = true;
        try {
          var ok = await onSubmit(form);
          if (!ok) submit.disabled = false;
        } catch (error) {
          submit.disabled = false;
          submit.textContent = 'Try again';
          errorBox.textContent = error.status === 403
            ? 'SharePoint did not allow this change. Your text has been kept.'
            : 'This could not be sent just now. Your text has been kept – try again in a moment.';
        }
      });
      dlg.body.appendChild(form);
      return form;
    }

    function updateForm(a) {
      var body = h('textarea', { id: 'ch-u-body', rows: '5', maxlength: '2000' });
      var clientKey = CH.requests.newKey();
      formShell('Add an update', [field('Your update', body, 'What has happened, or what is next. Everyone who can see this action can read it.')], 'Save update',
        async function (form) {
          var errors = R.validateUpdate({ body: body.value });
          if (CH.ui.dialog.showErrors(form, 'ch-u-', errors, ['body'])) return false;
          var text = body.value.trim();
          try {
            await app.sp.addToFolder('updates', a.areaKey + '/A' + a.id, {
              Title: text.slice(0, 80), ClientKey: clientKey, ParentType: 'Action', ParentId: a.id,
              EntryType: 'Progress', IsFlagEvent: '0', IsHidden: '0', Body: text
            });
          } catch (error) {
            var found = await app.sp.items(CH.config.lists.updates.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1)
              .catch(function () { return { rows: [] }; });
            if (!found.rows.length) throw error;
          }
          ui.toast(app.root, 'Your update has been saved.', 'ok');
          updates = null;
          back();
          loadExtras();
          return true;
        });
    }

    function extendForm(a) {
      var today = app.model.today;
      var min = D.addDays(a.dueIso > today ? a.dueIso : D.addDays(today, -1), 1);
      var date = h('input', { id: 'ch-x-newDueIso', type: 'date', min: min, max: R.addYears(today, CH.config.maxDeadlineYears) });
      var reason = h('textarea', { id: 'ch-x-reason', rows: '4', maxlength: '1000' });
      var r = R.roles(a, app.person.SiteUserId, app.access);
      var effect = h('p', { class: 'explain', role: 'status' });
      function explain() {
        effect.textContent = (D.isIso(date.value) ? 'The new deadline will be ' + D.weekday(date.value) + ' ' + D.long(date.value) + '. ' : '') +
          'The original deadline (' + D.long(a.originalIso) + ') stays on record, and everyone who can see this action can read your reason.' +
          (r.owner ? '' : ' This will be recorded as done on behalf of ' + a.ownerName + '.');
      }
      date.addEventListener('input', explain);
      explain();
      formShell('I need more time', [
        h('p', { class: 'muted', text: 'Current deadline: ' + D.weekday(a.dueIso) + ' ' + D.long(a.dueIso) + '.' }),
        field('New deadline', date), field('Why?', reason, 'At least 10 characters.'), effect], 'Ask for more time',
        async function (form) {
          var v = { newDueIso: date.value, reason: reason.value };
          var errors = R.validateExtend(a, v, { today: today });
          if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
          if (CH.ui.dialog.showErrors(form, 'ch-x-', errors, ['newDueIso', 'reason'])) return false;
          await app.tracker.submit({ type: 'ExtendDeadline', targetId: a.id, expectedRevision: a.revision,
            payload: { newDueIso: v.newDueIso, reason: v.reason.trim(), expectedDueDay: a.dueDay }, label: 'New deadline ' + D.short(v.newDueIso) });
          back();
          return true;
        });
    }

    function completeForm(a) {
      var note = h('textarea', { id: 'ch-c-note', rows: '3', maxlength: '1000' });
      formShell('Mark as done', [
        h('p', { class: 'explain', text: a.requiresCloseOut
          ? 'It will then wait for a close-out check by ' + a.raisedByName + ' before it is closed.'
          : 'The action will be closed. It stays in the history of ' + a.areaName + '.' }),
        field('Anything to add? (optional)', note)], 'Mark as done',
        async function (form) {
          var errors = R.validateComplete(a, { note: note.value });
          if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
          if (CH.ui.dialog.showErrors(form, 'ch-c-', errors, ['note'])) return false;
          await app.tracker.submit({ type: 'MarkComplete', targetId: a.id, expectedRevision: a.revision,
            payload: { note: note.value.trim() }, label: 'Mark as done' });
          back();
          return true;
        });
    }

    notFound = !action();
    fill();
    dlg.focusFirst();
    loadExtras();
    app.panel = { id: id, refresh: function () { if (view === 'main') { updates = null; fill(); loadExtras(); } } };
  }

  return { open: open };
})();
