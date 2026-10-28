// One action (plan C.9): What, Who and When in plain words, three buttons, and its updates.
// "Add an update" is an instant write; "I need more time" and "Mark as done" are queued requests.
CH.views = CH.views || {};
CH.views.actionPanel = (function () {
  // a record someone else changed since this page last read it (release 1.3): said plainly, above the details
  function othersLine(mark) {
    if (!mark) return null;
    return CH.dom.h('p', { class: 'muted small others-line', role: 'status', text: 'Updated by someone else at ' + CH.dates.ukTime(mark.at) + ' – this is the latest.' });
  }
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var ui = CH.ui;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };

  function timeOf(date) { return D.ukTime(date); }

  // The panel's line about a change being saved (release 1.2: the change already shows; this says it is on its way).
  // A refusal or a fault is explained in its own card, with Try again.
  function pendingLine(app, action) {
    var entry = app.tracker.forTarget(action.id);
    if (action.isNew) return h('p', { class: 'pending', role: 'status' }, app.mark(action, 'Action'), ' Being saved – it gets its number in a moment, and can then be changed.');
    if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
      return h('p', { class: 'pending', role: 'status' }, app.mark(action, 'Action'), ' ' + entry.label + ' – ' +
        (entry.retrying ? entry.message : entry.state === 'slow' ? 'taking longer than usual, but it will be saved.' : 'you can carry on.'));
    }
    if (action.locked) return h('p', { class: 'pending', role: 'status', text: 'Someone else\'s change to this action is being saved… Try again in a minute.' });
    var mark = app.mark(action, 'Action');
    return mark ? h('p', { class: 'mark-line' }, mark) : null;
  }

  var STATUS_WORDS = { 'Open': 'Open', 'In Progress': 'In progress', 'Awaiting Input': 'Waiting on something' };

  function whenText(action) {
    if (action.status === 'Closed') {
      return 'Closed' + (action.closedIso ? ' on ' + D.long(action.closedIso) : '') + (action.closeOutcome ? ' – ' + action.closeOutcome.toLowerCase() : '') + '.' +
        (action.closureNote ? ' “' + action.closureNote + '”' : '');
    }
    if (action.waitingCloseOut) return 'Done – waiting for a close-out check by ' + action.raisedByName + '.';
    var text = (action.group === 'late' ? 'Was due ' : 'Due ') + D.weekday(action.dueIso) + ' ' + D.long(action.dueIso) + '.';
    if (action.extensions) {
      text += ' Deadline moved ' + (action.extensions === 1 ? 'once' : action.extensions + ' times') +
        (action.originalIso !== action.dueIso ? ' (was ' + D.long(action.originalIso) + ').' : '.');
    }
    return text;
  }

  // Updates count only in the action's own folder, {area}/A{id} (plan F.5). Each query starts with an indexed
  // column (ParentId, RecordId), so it keeps working once the list passes 5,000 items.
  async function loadUpdates(app, action) {
    var res = await app.sp.items(CH.config.lists.updates.title,
      "$select=Id,EntryType,Body,AuthorId,Created,FileDirRef,IsHidden&$filter=ParentId eq " + action.id + " and ParentType eq 'Action'", 500);
    var folder = '/' + action.areaKey + '/A' + action.id;
    return res.rows.filter(function (u) {
      return !u.IsHidden && String(u.FileDirRef || '').slice(-folder.length) === folder && u.EntryType !== 'Flagged' && u.EntryType !== 'Flag Withdrawn';
    }).sort(function (a, b) { return b.Id - a.Id; });
  }

  async function loadExtensions(app, action) {
    var res = await app.sp.items(CH.config.lists.history.title,
      "$select=Id,EventType,ActorId,EventTime,PreviousDueDate,NewDueDate,Note,ExtensionNumber,IsOnBehalf&$filter=RecordId eq " + action.id + " and RecordType eq 'Action'", 500);
    return res.rows.filter(function (r) { return r.EventType === 'Deadline Extended'; })
      .sort(function (a, b) { return (a.ExtensionNumber || 0) - (b.ExtensionNumber || 0); });
  }

  function open(app, id) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-a', title: 'Action', wide: true, onClose: function () { app.panel = null; } });
    var view = 'main';
    var updates = null;
    var extensions = null;
    var notFound = false;

    // An open action comes with the page; a finished one is read on demand and kept in app.finished.
    function action() { return app.model.actionById[id] || (app.finished || {})[id]; }

    async function readMissing() {
      try {
        var row = await CH.model.loadAction(app.sp, id);
        if (row) { app.finished = app.finished || {}; app.finished[id] = app.model.actionFrom(row); }
      } catch (_) { /* shown as not available */ }
    }

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
      // your own change still saving does not stop the next one: they go one at a time, in order (release 1.3), and
      // so does a raise not yet numbered. Someone else's change being saved does hold it.
      var busy = a.locked && !app.tracker.isMine(a.lockKey);
      var finished = a.status === 'Closed' || a.waitingCloseOut;
      // the less common changes sit under "More for this action" (plan C.9), only those this person may make
      // release 1.2: each button names what it acts on (backlog 11)
      var more = [
        r.canEdit ? ui.linkButton('Edit this action', function () { show('edit'); }) : null,
        r.canReassign ? ui.linkButton('Give it to someone else', function () { show('reassign'); }) : null,
        r.canStatus ? ui.linkButton('Change its status', function () { show('status'); }) : null,
        r.canClose && !a.waitingCloseOut ? ui.linkButton('Close this action', function () { show('close'); }) : null
      ].filter(Boolean);
      dlg.setTitle(a.title);
      CH.dom.append(dlg.body, [
        h('p', { class: 'what-label', text: 'Action · ' + (a.isNew ? 'not yet numbered' : a.ref) + ' · ' + a.areaName + (a.priority === 'High' ? ' · High priority' : '') }),
        othersLine(app.changedByOthers('Action', a.id)),
        pendingLine(app, a),
        h('dl', { class: 'facts' },
          h('dt', { text: 'When' }), h('dd', null, ui.chip(a.waitingCloseOut ? 'later' : a.group, a.dueText), ' ', whenText(a)),
          a.blocker ? [h('dt', { text: 'Waiting on' }), h('dd', { class: 'notice-body', text: a.blocker })] : null,
          h('dt', { text: 'Who' }), h('dd', { text: 'Owner: ' + a.ownerName + (a.coOwnerNames.length ? ' · Co-owners: ' + a.coOwnerNames.join(', ') : '') +
            ' · Raised by: ' + a.raisedByName + (a.raisedIso ? ', ' + D.shortYear(a.raisedIso) : '') +
            (a.requiresCloseOut ? ' · Checked by: ' + (a.checkerName || a.raisedByName) : '') }),
          h('dt', { text: 'What' }), h('dd', { class: 'notice-body', text: a.description || 'No description.' })),
        extensions && extensions.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Show all deadline changes (' + extensions.length + ')' }),
          h('ul', { class: 'plain' }, extensions.map(function (x) {
            return h('li', null, h('span', null,
              h('s', { text: x.PreviousDueDate ? D.short(D.localDate(x.PreviousDueDate)) : '' }), ' → ', h('b', { text: x.NewDueDate ? D.long(D.localDate(x.NewDueDate)) : '' }),
              h('br'), h('span', { class: 'muted small', text: app.model.nameOf(x.ActorId) + (x.IsOnBehalf ? ' (on behalf of the owner)' : '') +
                (x.EventTime ? ' · ' + D.short(D.localDate(x.EventTime)) : '') + ' · “' + (x.Note || '') + '”' })));
          }))) : null,
        h('div', { class: 'row actions-row' },
          r.canUpdate && !finished ? ui.button('Add an update', function () { show('update'); }, 'main') : null,
          r.canExtend ? ui.button('I need more time', function () { show('extend'); }) : null,
          r.canComplete ? ui.button('Mark as done', function () { show('complete'); }) : null,
          a.waitingCloseOut && r.canClose ? ui.button('Confirm close-out', function () { show('closeout'); }, 'main') : null,
          r.canReopen ? ui.button('Reopen', function () { show('reopen'); }) : null),
        more.length ? h('details', { class: 'more' }, h('summary', { text: 'More for this action' }), h('div', { class: 'row' }, more)) : null,
        !r.canUpdate && !r.canExtend && !r.canComplete && !r.canReopen ? h('p', { class: 'muted small', text: 'You can read this action. Only its owner, the people who manage it and members of ' + a.areaName + ' can change it.' }) : null,
        h('h3', { class: 'group-title', text: 'Updates' }),
        updates === null ? h('p', { class: 'muted', text: 'Loading updates…' })
          : updates === 'error' ? h('p', { class: 'section-note', text: 'Could not load the updates just now.' })
          : updates.length ? h('ul', { class: 'plain' }, updates.map(function (u) {
            return h('li', null, h('span', null, h('span', { class: 'notice-body', text: u.Body || '' }), h('br'),
              h('span', { class: 'muted small', text: app.model.nameOf(u.AuthorId) + ' · ' + D.short(D.localDate(u.Created)) + ' ' + D.ukTime(u.Created) +
                (u.EntryType === 'Blocker' ? ' · blocker' : '') })));
          })) : h('p', { class: 'muted', text: 'No updates yet.' })
      ]);
      // In limited mode only the instant update stays available (spec REL-5).
      var blocked = app.queueBlocked();
      Array.prototype.forEach.call(dlg.body.querySelectorAll('.actions-row .btn, .more .btn-link'), function (b) {
        b.disabled = !!busy || (blocked && b.textContent !== 'Add an update');
      });
      if (blocked && !finished) CH.dom.append(dlg.body.querySelector('.actions-row'), h('span', { class: 'muted small',
        text: 'Changes to actions are paused while they can\'t be processed. You can still add an update.' }));
    }

    function show(which) {
      view = which;
      CH.dom.clear(dlg.body);
      var a = action();
      if (which === 'update') updateForm(a);
      if (which === 'extend') extendForm(a);
      if (which === 'complete') completeForm(a);
      if (which === 'status') statusForm(a);
      if (which === 'reassign') reassignForm(a);
      if (which === 'close') closeForm(a, false);
      if (which === 'closeout') closeForm(a, true);
      if (which === 'reopen') reopenForm(a);
      if (which === 'edit') editForm(a);
      dlg.focusFirst();
    }
    function back() { view = 'main'; fill(); dlg.focusFirst(); }

    var formKey = null;
    function formShell(title, fields, submitLabel, onSubmit) {
      formKey = CH.requests.newKey();   // one change per form, however often Try again is pressed
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
            await app.sp.addToFolder('updates', a.areaKey + '/A' + a.id, Object.assign({
              Title: text.slice(0, 80), ClientKey: clientKey, ParentType: 'Action', ParentId: a.id,
              EntryType: 'Progress', IsFlagEvent: '0', IsHidden: '0', Body: text
            }, app.testMark()));
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
          var now = action() || a;
          await app.tracker.submit({ key: formKey, type: 'ExtendDeadline', targetId: now.id, creationKey: now.isNew ? now.sending : null, expectedRevision: now.revision,
            payload: { newDueIso: v.newDueIso, reason: v.reason.trim(), expectedDueDay: a.dueDay }, label: 'New deadline ' + D.short(v.newDueIso) });
          back();
          return true;
        });
    }

    function completeForm(a) {
      var note = h('textarea', { id: 'ch-c-note', rows: '3', maxlength: '1000' });
      formShell('Mark as done', [
        h('p', { class: 'explain', text: a.requiresCloseOut
          ? 'It will then wait for a close-out check by ' + (a.checkerName || a.raisedByName) + ' before it is closed.'
          : 'The action will be closed. It stays in the history of ' + a.areaName + '.' }),
        field('Anything to add? (optional)', note)], 'Mark as done',
        async function (form) {
          var errors = R.validateComplete(a, { note: note.value });
          if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
          if (CH.ui.dialog.showErrors(form, 'ch-c-', errors, ['note'])) return false;
          var now = action() || a;
          await app.tracker.submit({ key: formKey, type: 'MarkComplete', targetId: now.id, creationKey: now.isNew ? now.sending : null, expectedRevision: now.revision,
            payload: { note: note.value.trim() }, label: 'Mark as done' });
          back();
          return true;
        });
    }

    // A queued change, sent with the revision the person saw; the panel then shows it as being recorded.
    async function send(form, type, payload, label, errors, order, prefix) {
      if (errors.action) { form.querySelector('.form-error').textContent = errors.action; return false; }
      if (CH.ui.dialog.showErrors(form, prefix, errors, order)) return false;
      var a = action();
      await app.tracker.submit({ key: formKey, type: type, targetId: id, creationKey: a.isNew ? a.sending : null, expectedRevision: a.revision, payload: payload, label: label });
      back();
      return true;
    }

    function statusForm(a) {
      var status = h('select', { id: 'ch-s-status' }, R.OPEN_STATUSES.filter(function (st) { return st !== a.status; }).map(function (st) {
        return h('option', { value: st, text: STATUS_WORDS[st] });
      }));
      var blocker = h('textarea', { id: 'ch-s-blocker', rows: '3', maxlength: '1000' });
      var blockerField = field('What is it waiting on?', blocker, 'For example a part, a decision or another team. Everyone who can see this action can read it.');
      function toggle() { blockerField.style.display = status.value === 'Awaiting Input' ? '' : 'none'; }
      status.addEventListener('change', toggle);
      toggle();
      formShell('Change status', [h('p', { class: 'muted', text: 'Now: ' + STATUS_WORDS[a.status] + '.' }), field('New status', status), blockerField], 'Change status',
        function (form) {
          var v = { status: status.value, blocker: blocker.value };
          return send(form, 'ChangeStatus', { status: v.status, blocker: v.status === 'Awaiting Input' ? v.blocker.trim() : '' },
            'Status: ' + STATUS_WORDS[v.status].toLowerCase(), R.validateStatus(a, v), ['status', 'blocker'], 'ch-s-');
        });
    }

    function reassignForm(a) {
      var owners = app.model.ownersFor(a.areaKey).filter(function (o) { return Number(o.id) !== Number(a.ownerId); });
      var owner = h('select', { id: 'ch-g-ownerId' }, [h('option', { value: '', text: 'Choose a person' })].concat(owners.map(function (o) {
        return h('option', { value: String(o.id), text: o.name + (CH.config.managementRoles.indexOf(o.role) >= 0 ? ' – ' + o.role : '') });
      })));
      var reason = h('textarea', { id: 'ch-g-reason', rows: '3', maxlength: '1000' });
      // co-owners: everyone eligible, the current ones ticked; the new owner is never also a co-owner
      var coBox = h('div', { class: 'checks', id: 'ch-g-coOwnerIds' }, app.model.ownersFor(a.areaKey).map(function (o) {
        return h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(o.id), checked: a.coOwnerIds.indexOf(Number(o.id)) >= 0 ? true : null }), ' ' + o.name);
      }));
      formShell('Reassign', [h('p', { class: 'muted', text: 'Now: ' + a.ownerName + '. Both people get an email.' }),
        field('New owner', owner), field('Co-owners (optional)', coBox), field('Why?', reason, 'At least 10 characters.')], 'Reassign',
        function (form) {
          var v = { ownerId: owner.value ? Number(owner.value) : '', reason: reason.value,
            coOwnerIds: Array.prototype.filter.call(coBox.querySelectorAll('input'), function (x) { return x.checked && Number(x.value) !== Number(owner.value); }).map(function (x) { return Number(x.value); }) };
          var allowed = { ownerAllowed: function (key, pid) { return app.model.ownersFor(key).some(function (o) { return Number(o.id) === pid; }); } };
          var name = (owners.filter(function (o) { return Number(o.id) === v.ownerId; })[0] || {}).name;
          return send(form, 'ReassignAction', { ownerId: v.ownerId, reason: v.reason.trim(), coOwnerIds: v.coOwnerIds }, 'Reassign to ' + name,
            R.validateReassign(a, v, allowed), ['ownerId', 'coOwnerIds', 'reason'], 'ch-g-');
        });
    }

    function closeForm(a, closeOut) {
      var outcome = h('select', { id: 'ch-l-outcome' }, R.OUTCOMES.map(function (o) { return h('option', { value: o, text: o }); }));
      var note = h('textarea', { id: 'ch-l-note', rows: '3', maxlength: '1000' });
      var outcomeField = field('Outcome', outcome);
      if (closeOut) outcomeField.style.display = 'none';
      formShell(closeOut ? 'Confirm close-out' : 'Close with an outcome', [
        h('p', { class: 'explain', text: closeOut ? a.ownerName + ' has marked this action as done. Closing it confirms the work is complete.'
          : 'The action will be closed. ' + a.ownerName + ' gets an email, and it stays in the history of ' + a.areaName + '.' }),
        outcomeField, field(closeOut ? 'Anything to add? (optional)' : 'Note', note, closeOut ? '' : 'Needed unless the outcome is Completed.')],
        closeOut ? 'Close the action' : 'Close', function (form) {
          var v = { outcome: closeOut ? 'Completed' : outcome.value, note: note.value };
          return send(form, 'CloseAction', { outcome: v.outcome, note: v.note.trim() }, 'Close: ' + v.outcome.toLowerCase(),
            R.validateClose(a, v), ['outcome', 'note'], 'ch-l-');
        });
    }

    function reopenForm(a) {
      var reason = h('textarea', { id: 'ch-o-reason', rows: '3', maxlength: '1000' });
      formShell('Reopen', [h('p', { class: 'explain', text: 'The action goes back to In progress with ' + a.ownerName + ', with its deadline unchanged.' }),
        field('Why?', reason, 'At least 10 characters.')], 'Reopen', function (form) {
        var v = { reason: reason.value };
        return send(form, 'ReopenAction', { reason: v.reason.trim() }, 'Reopen', R.validateReopen(a, v), ['reason'], 'ch-o-');
      });
    }

    function editForm(a) {
      var title = h('input', { id: 'ch-e-title', type: 'text', maxlength: '255', value: a.title });
      var description = h('textarea', { id: 'ch-e-description', rows: '5', maxlength: '5000' });
      description.value = a.description;
      var priority = h('select', { id: 'ch-e-priority' }, R.PRIORITIES.map(function (p) { return h('option', p === a.priority ? { value: p, selected: true, text: p } : { value: p, text: p }); }));
      var closeOut = h('input', { id: 'ch-e-closeout', type: 'checkbox' });
      closeOut.checked = a.requiresCloseOut;
      var current = Number(a.checkerId || a.raisedById);
      var checker = h('select', { id: 'ch-e-checkerId' }, app.model.ownersFor(a.areaKey).filter(function (o) { return Number(o.id) !== Number(a.ownerId); }).map(function (o) {
        return h('option', { value: String(o.id), selected: Number(o.id) === current ? true : null, text: o.name });
      }));
      var checkerField = field('Who checks it?', checker);
      function showChecker() { checkerField.style.display = closeOut.checked ? '' : 'none'; }
      closeOut.addEventListener('change', showChecker);
      showChecker();
      formShell('Edit details', [field('What needs doing', title), field('Description', description), field('Priority', priority),
        h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'), checkerField], 'Save changes',
        function (form) {
          var v = {};
          if (title.value.trim() !== a.title) v.title = title.value.trim();
          if (description.value.trim() !== a.description) v.description = description.value.trim();
          if (priority.value !== a.priority) v.priority = priority.value;
          if (closeOut.checked !== a.requiresCloseOut) v.requiresCloseOut = closeOut.checked;
          if (closeOut.checked && checker.value && Number(checker.value) !== current) v.checkerId = Number(checker.value);
          var allowed = { ownerAllowed: function (key, pid) { return app.model.ownersFor(key).some(function (o) { return Number(o.id) === pid; }); } };
          return send(form, 'EditActionDetails', v, 'Edit details', R.validateEdit(a, v, allowed), ['title', 'description', 'priority', 'checkerId'], 'ch-e-');
        });
    }

    async function refresh() {
      if (view !== 'main') return;
      updates = null;
      if (!action()) await readMissing();
      fill();
      loadExtras();
    }

    (action() ? Promise.resolve() : readMissing()).then(function () {
      notFound = !action();
      fill();
      dlg.focusFirst();
      loadExtras();
    });
    app.panel = { id: id, refresh: refresh };
  }

  return { open: open };
})();
