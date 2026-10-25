// One notice, or one improvement or degradation, read in full (spec NB-1 to NB-6, REG-1 to REG-5).
// Comments and flags are instant writes to Updates/{area}; everything else is a queued request checked again by
// the Records flow. Only the choices this person may make are offered.
CH.views = CH.views || {};
CH.views.recordPanel = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var ui = CH.ui;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
  var STATUS_WORDS = { 'Open': 'Open', 'Under Review': 'Under review', 'Resolved': 'Resolved', 'Closed': 'Closed' };

  // Comments in the record's own area folder only, oldest first; hidden ones are left out.
  async function loadComments(app, parentType, rec) {
    var res = await app.sp.items(CH.config.lists.updates.title,
      "$select=Id,EntryType,Body,AuthorId,Created,FileDirRef,IsHidden&$filter=ParentId eq " + rec.id + " and ParentType eq '" + parentType + "'", 500);
    return res.rows.filter(function (u) {
      return u.EntryType === 'Comment' && !u.IsHidden && CH.sp.folderOf(u.FileDirRef) === rec.areaKey;
    }).sort(function (a, b) { return a.Id - b.Id; });
  }

  function pendingLine(app, id, kind, locked) {
    // release 1.2: the change already shows; this line says it is on its way. A refusal has its own card, with Try again.
    var entry = app.tracker.forTarget(id, kind);
    var rec = kind === 'Notice' ? app.model.noticeById[id] : app.model.entryById[id];
    if (entry && (entry.state === 'submitted' || entry.state === 'slow')) {
      return h('p', { class: 'pending', role: 'status' }, app.mark(rec || { sending: true }, kind), ' ' + entry.label + ' – ' + (entry.retrying ? entry.message : 'you can carry on.'));
    }
    if (locked) return h('p', { class: 'pending', role: 'status', text: 'Being updated… Try again in a minute.' });
    var mark = app.mark(rec, kind);
    return mark ? h('p', { class: 'mark-line' }, mark) : null;
  }

  function busy(app, id, kind) {
    var e = app.tracker.forTarget(id, kind);
    return !!e && (e.state === 'submitted' || e.state === 'slow');
  }

  // The panel shared by notices and entries: a main view and one form at a time.
  function panel(app, cfg) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-rec', title: cfg.title, wide: true, onClose: function () { app.panel = null; } });
    var view = 'main';
    var comments = null;
    var discussed = [];
    var sending = false;

    function rec() { return cfg.get(); }

    async function loadExtras() {
      var r = rec();
      if (!r) return;
      try { comments = await loadComments(app, cfg.parentType, r); } catch (_) { comments = 'error'; }
      try { discussed = await loadDiscussed(r); } catch (_) { discussed = []; }
      if (view === 'main' && dlg.isOpen()) fill();
    }

    // Finalised meetings that took this up (spec NB-6): their frozen agenda rows, by the (indexed) source id.
    async function loadDiscussed(r) {
      var res = await app.sp.items(CH.config.lists.meetingItems.title, '$select=MeetingId,SourceType,Outcome,Notes,FileDirRef&$filter=SourceId eq ' + Number(r.id) +
        " and RowType eq 'Agenda Item'", 500);
      return res.rows.filter(function (x) {
        var m = app.model.meetingById[x.MeetingId];
        return x.SourceType === cfg.parentType && m && m.status === 'Finalised' && CH.sp.folderOf(x.FileDirRef) === 'MTG-' + m.id && x.Outcome;
      }).map(function (x) {
        var m = app.model.meetingById[x.MeetingId];
        return { iso: m.dateIso, text: m.areaName + ' meeting, ' + D.long(m.dateIso) + ': ' + x.Outcome + (x.Notes ? ' – ' + x.Notes : '') };
      });
    }

    // Instant writes: a comment, a flag or a flag withdrawn, in the record's area folder (plan F.5).
    async function writeUpdate(entryType, body) {
      var r = rec();
      var clientKey = CH.requests.newKey();
      var values = { Title: (body || entryType + ': ' + r.title).slice(0, 80), ClientKey: clientKey, ParentType: cfg.parentType, ParentId: r.id,
        EntryType: entryType, IsFlagEvent: entryType === 'Comment' ? '0' : '1', Body: body || '' };
      try {
        await app.sp.addToFolder('updates', r.areaKey, Object.assign(values, app.testMark()));
      } catch (error) {
        // an unclear failure may still have saved it: look for it by its key before reporting a failure
        var found = await app.sp.items(CH.config.lists.updates.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1).catch(function () { return { rows: [] }; });
        if (!found.rows.length) throw error;
      }
    }

    function commentBox(r) {
      if (!app.access.canWrite(r.areaKey)) return h('p', { class: 'muted small', text: 'Members of ' + app.model.areaByKey[r.areaKey].name + ', and the Team Leaders and Group Head, can comment here.' });
      var box = h('textarea', { id: 'ch-rec-body', rows: '3', maxlength: '2000' });
      var err = h('p', { class: 'form-error', role: 'alert' });
      var btn = h('button', { type: 'submit', class: 'btn', text: 'Add comment' });
      var form = h('form', { class: 'comment-form', novalidate: true }, field('Add a comment', box), err, btn);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var errors = R.validateComment({ body: box.value });
        if (CH.ui.dialog.showErrors(form, 'ch-rec-', errors, ['body'])) return;
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await writeUpdate('Comment', box.value.trim());
          box.value = '';
          comments = null;
          fill();
          await loadExtras();
          CH.ui.toast(app.root, 'Comment added.', 'ok');
        } catch (error) {
          btn.disabled = false; btn.textContent = 'Try again';
          err.textContent = 'Your comment could not be saved just now. Your text has been kept.';
        }
      });
      return form;
    }

    function commentList(r) {
      var mod = app.access.canModerate(r.areaKey);
      if (comments === null) return h('p', { class: 'muted', text: 'Loading comments…' });
      if (comments === 'error') return h('p', { class: 'section-note', text: 'Could not load the comments just now.' });
      if (!comments.length) return h('p', { class: 'muted', text: 'No comments yet.' });
      return h('ul', { class: 'plain comments' }, comments.map(function (c) {
        var hiding = app.tracker.forTarget(c.Id, 'Comment');
        var waiting = hiding && (hiding.state === 'submitted' || hiding.state === 'slow');
        return h('li', null, h('span', null, h('span', { class: 'notice-body', text: c.Body || '' }), h('br'),
          h('span', { class: 'muted small', text: app.model.nameOf(c.AuthorId) + ' · ' + D.short(D.localDate(c.Created)) + ' ' + D.ukTime(c.Created) +
            (waiting ? ' · being hidden' : '') })),
          mod && !waiting && !app.recordsBlocked() ? ui.linkButton('Hide', async function (e) {
            e.target.disabled = true;
            try {
              await app.tracker.submit({ type: 'HideComment', targetId: c.Id, targetType: 'Comment', payload: {}, label: 'Hide a comment on “' + r.title + '”' });
              fill();
            } catch (_) { e.target.disabled = false; CH.ui.toast(app.root, 'Could not send that just now. Try again in a moment.', 'info'); }
          }) : null);
      }));
    }

    function flagRow(r) {
      var slot = app.model.flags[cfg.parentType + ':' + r.id] || { flagged: false, history: [] };
      var area = app.model.areaByKey[r.areaKey];
      var me = app.person.SiteUserId;
      var canFlag = app.access.canWrite(r.areaKey) && !slot.flagged;
      var canWithdraw = slot.flagged && (Number(slot.flaggedBy) === Number(me) || app.access.isManagement || app.access.chairs(r.areaKey) ||
        Number(cfg.ownerOf(r)) === Number(me));
      async function act(kind, done) {
        if (sending) return;
        sending = true;
        try {
          await writeUpdate(kind, '');
          await app.recordChanged();
          CH.ui.toast(app.root, done, 'ok');
        } catch (_) {
          CH.ui.toast(app.root, 'That could not be saved just now. Try again in a moment.', 'info');
        }
        sending = false;
        fill();
      }
      return [
        h('p', null, slot.flagged ? ui.chip('soon', 'Flagged for the next ' + area.name + ' meeting') : h('span', { class: 'muted small', text: 'Not flagged for a meeting.' }), ' ',
          canFlag ? ui.button('Flag for the next meeting', function () { act('Flagged', 'Flagged for the next ' + area.name + ' meeting.'); }) : null,
          canWithdraw ? ui.button('Withdraw the flag', function () { act('Flag Withdrawn', 'Flag withdrawn.'); }) : null),
        slot.history.length || discussed.length ? h('details', { class: 'ext-list' }, h('summary', { text: 'Discussion history (' + (slot.history.length + discussed.length) + ')' }),
          h('ul', { class: 'plain' }, slot.history.map(function (x) { return { iso: x.iso, text: x.kind + (x.by ? ' by ' + x.by : '') + ' · ' + D.short(x.iso) }; })
            .concat(discussed).sort(function (a, b) { return String(a.iso).localeCompare(String(b.iso)); }).map(function (x) {
              return h('li', null, h('span', { text: x.text }));
            }))) : null
      ];
    }

    function fill() {
      CH.dom.clear(dlg.body);
      var r = rec();
      if (!r) {
        dlg.setTitle(cfg.missingTitle);
        CH.dom.append(dlg.body, h('p', { text: cfg.missingText }));
        return;
      }
      dlg.setTitle(r.title);
      if (view !== 'main') { CH.dom.append(dlg.body, cfg.form(view, r, ctl)); return; }
      CH.dom.append(dlg.body, [
        cfg.header(r),
        pendingLine(app, r.id, cfg.parentType, false),
        cfg.facts(r),
        cfg.buttons(r, ctl),
        h('h3', { class: 'group-title', text: 'For the meeting' }),
        flagRow(r),
        cfg.extra ? cfg.extra(r, ctl) : null,
        h('h3', { class: 'group-title', text: 'Comments' }),
        commentList(r),
        commentBox(r)
      ]);
    }

    function show(next) { view = next; fill(); var f = dlg.body.querySelector('input, select, textarea'); if (f) f.focus(); }

    // Sends a queued change from one of the forms; errors are shown on the form, which stays open.
    async function send(form, spec, errorBox) {
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await app.tracker.submit(spec);
        view = 'main';
        fill();
      } catch (error) {
        btn.disabled = false; btn.textContent = 'Try again';
        errorBox.textContent = error.friendly || 'This could not be sent just now. Nothing has been lost – try again in a moment.';
      }
    }

    var ctl = { show: show, send: send, busy: function (r) { return busy(app, r.id, cfg.parentType) || app.recordsBlocked(); }, dlg: dlg };
    app.panel = { refresh: function () { if (dlg.isOpen()) { if (view === 'main') { comments = null; fill(); loadExtras(); } } } };
    fill();
    loadExtras();
    dlg.focusFirst();
    return dlg;
  }

  function formShell(title, fields, submitLabel, onSubmit, ctl) {
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var form = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: title }), fields, errorBox,
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-main', text: submitLabel }),
        h('button', { type: 'button', class: 'btn', text: 'Back', onclick: function () { ctl.show('main'); } })));
    form.addEventListener('submit', function (e) { e.preventDefault(); errorBox.textContent = ''; onSubmit(form, errorBox); });
    return form;
  }

  // ---- notices
  function openNotice(app, id) {
    var m = function () { return app.model; };
    return panel(app, {
      parentType: 'Notice', title: 'Notice', missingTitle: 'Notice not available',
      missingText: 'This notice is not available. It may have been archived.',
      get: function () { return m().noticeById[id]; },
      ownerOf: function (n) { return n.authorId; },
      header: function (n) {
        var area = m().areaByKey[n.areaKey];
        var where = n.shownAll ? 'Every noticeboard' : n.areaKeys.length > 1 ? n.areaKeys.map(function (k) { return m().areaByKey[k].name; }).join(', ') + ' noticeboards' : area.name + ' noticeboard';
        return h('p', { class: 'muted small', text: where + ' · ' + n.category + ' · ' +
          (n.fromOutside ? 'from ' + n.authorName + ', outside ' + area.name : n.authorName) + ' · ' + D.long(n.createdIso) +
          (n.pinned ? ' · Pinned' : n.important ? ' · Important' : '') });
      },
      facts: function (n) { return h('p', { class: 'notice-body notice-full', text: n.body }); },
      // actions made from this notice, and "Turn into an action" for the engineers, meeting leads and management of an area it is shown in
      extra: function (n, ctl) {
        var list = m().actions.filter(function (a) { return a.sourceType === 'Noticeboard' && Number(a.sourceId) === Number(n.id); });
        var areas = n.areaKeys.filter(function (k) { return R.canConvert(k, app.access); });
        if (!list.length && !areas.length) return null;
        return [h('h3', { class: 'group-title', text: 'Actions from this notice' }),
          list.length ? h('ul', { class: 'items linked' }, list.map(function (a) {
            return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { ctl.dlg.close(); app.openAction(a); } },
              h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.ownerName })), ui.chip(a.group, a.dueText)));
          })) : h('p', { class: 'muted', text: 'No actions have been made from this notice yet.' }),
          areas.length ? h('div', { class: 'row' }, ui.button('Turn into an action', function () {
            ctl.dlg.close();
            if (!app.queueBlocked()) CH.views.raiseForm.open(app, areas.indexOf(n.areaKey) >= 0 ? n.areaKey : areas[0], { notice: n, areas: areas });
          })) : null];
      },
      buttons: function (n, ctl) {
        var r = R.noticeRoles(n, app.person.SiteUserId, app.access);
        if (!r.canEdit && !r.canPin) return null;
        if (ctl.busy(n)) return h('p', { class: 'muted small', text: app.recordsBlocked() ? 'Changes to notices are paused for the moment.' : '' });
        return h('div', { class: 'row actions-row' },
          r.canEdit ? ui.button('Edit', function () { ctl.show('edit'); }) : null,
          r.canPin ? ui.button(n.pinned ? 'Unpin' : 'Pin', function () { ctl.show('pin'); }) : null,
          r.canArchive ? ui.button('Archive', function () { ctl.show('archive'); }) : null);
      },
      form: function (view, n, ctl) {
        var label = function (what) { return what + ' “' + n.title + '”'; };
        if (view === 'edit') {
          var r = R.noticeRoles(n, app.person.SiteUserId, app.access);
          var title = h('input', { id: 'ch-ne-title', type: 'text', maxlength: '255', value: n.title });
          var body = h('textarea', { id: 'ch-ne-body', rows: '8', maxlength: '5000' });
          body.value = n.body;
          var cat = h('select', { id: 'ch-ne-category' }, R.NOTICE_CATEGORIES.map(function (c) { return h('option', { value: c, selected: c === n.category ? true : null, text: c }); }));
          // "Important for": not important, or 1 week to 3 months from today
          var imp = h('select', { id: 'ch-ne-important' }, [h('option', { value: '0', text: 'Not important' })].concat(R.IMPORTANT_FOR.map(function (o) {
            return h('option', { value: String(o[0]), text: o[1] + ' from today' });
          })));
          if (n.important && !n.pinned) imp.value = String(n.importantDays || 30);
          return formShell('Edit the notice', [field('Title', title), field('Message', body), field('Category', cat),
            r.canMarkImportant && !n.pinned ? field('Important for', imp) : null],
          'Save changes', function (form, errorBox) {
            var v = {};
            if (title.value.trim() !== n.title) v.title = title.value;
            if (body.value.trim() !== n.body.trim()) v.body = body.value;
            if (cat.value !== n.category) v.category = cat.value;
            var was = n.important && !n.pinned ? String(n.importantDays || 30) : '0';
            if (r.canMarkImportant && !n.pinned && imp.value !== was) { v.important = imp.value !== '0'; if (v.important) v.importantDays = Number(imp.value); }
            var errors = R.validateNoticeEdit(v);
            if (CH.ui.dialog.showErrors(form, 'ch-ne-', errors, ['title', 'body', 'category'])) return;
            if (errors.notice) { errorBox.textContent = errors.notice; return; }
            if ('title' in v) v.title = v.title.trim();
            if ('body' in v) v.body = v.body.trim();
            ctl.send(form, { type: 'EditNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: v, label: label('Edit') }, errorBox);
          }, ctl);
        }
        if (view === 'pin') {
          return formShell(n.pinned ? 'Unpin this notice?' : 'Pin this notice?',
            h('p', { class: 'explain', text: n.pinned ? 'It stops being shown first on the noticeboard.' : 'It is shown first, as important, until someone unpins it.' }),
            n.pinned ? 'Unpin' : 'Pin', function (form, errorBox) {
              ctl.send(form, { type: 'PinNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: { pinned: !n.pinned },
                label: label(n.pinned ? 'Unpin' : 'Pin') }, errorBox);
            }, ctl);
        }
        return formShell('Archive this notice?',
          h('p', { class: 'explain', text: 'It leaves the noticeboard. It is kept, with its comments, in the history of the area.' }),
          'Archive', function (form, errorBox) {
            ctl.send(form, { type: 'ArchiveNotice', targetId: n.id, targetType: 'Notice', expectedRevision: n.revision, payload: {}, label: label('Archive') }, errorBox);
          }, ctl);
      }
    });
  }

  // ---- improvements and degradations
  function entryChip(e) {
    var kind = e.status === 'Resolved' || e.status === 'Closed' ? 'done' : e.entryType === 'Degradation' ? 'late' : 'later';
    return ui.chip(kind, STATUS_WORDS[e.status] || e.status);
  }

  function openEntry(app, id) {
    var m = function () { return app.model; };
    function ownersFor(key) { return m().ownersFor(key); }
    function allowed(key, pid) { return ownersFor(key).some(function (p) { return Number(p.id) === Number(pid); }); }
    function linkedActions(e) { return m().actions.filter(function (a) { return a.sourceType === 'Register' && Number(a.sourceId) === Number(e.id); }); }
    return panel(app, {
      parentType: 'Register Entry', title: 'Improvement or degradation', missingTitle: 'Entry not available',
      missingText: 'This entry is not available. It may have been removed.',
      get: function () { return m().entryById[id]; },
      ownerOf: function (e) { return e.raisedById; },
      header: function (e) {
        return h('p', { class: 'muted small' }, e.ref + ' · ' + m().areaByKey[e.areaKey].name + ' · ' + e.entryType + ' · ' + e.impact + ' impact ', entryChip(e));
      },
      facts: function (e) {
        return h('dl', { class: 'facts' },
          h('dt', { text: 'What' }), h('dd', { class: 'notice-body', text: e.description || 'No description.' }),
          h('dt', { text: 'Who' }), h('dd', { text: 'Raised by ' + e.raisedByName + (e.raisedIso ? ' on ' + D.long(e.raisedIso) : '') + '.' }),
          e.outcome ? [h('dt', { text: 'Outcome' }), h('dd', { class: 'notice-body', text: e.outcome + (e.resolvedIso ? ' (' + D.long(e.resolvedIso) + ')' : '') })] : null);
      },
      buttons: function (e, ctl) {
        var can = R.managesEntry(e, app.person.SiteUserId, app.access);
        if (!can) return h('p', { class: 'muted small', text: 'The person who raised it, the area\'s engineers and meeting runners, and the Team Leaders and Group Head can change this entry.' });
        if (ctl.busy(e)) return h('p', { class: 'muted small', text: app.recordsBlocked() ? 'Changes to the register are paused for the moment.' : '' });
        return h('div', { class: 'row actions-row' },
          ui.button('Change status', function () { ctl.show('status'); }, 'main'),
          ui.button('Edit details', function () { ctl.show('edit'); }));
      },
      extra: function (e, ctl) {
        var list = linkedActions(e);
        var can = R.managesEntry(e, app.person.SiteUserId, app.access) && !ctl.busy(e);
        var convert = R.canConvert(e.areaKey, app.access) && e.open && !ctl.busy(e);
        return [h('h3', { class: 'group-title', text: 'Linked actions' }),
          list.length ? h('ul', { class: 'items linked' }, list.map(function (a) {
            return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { ctl.dlg.close(); app.openAction(a); } },
              h('span', null, h('span', { class: 't', text: a.ref + ' ' + a.title }), h('span', { class: 's', text: a.ownerName })), ui.chip(a.group, a.dueText)),
              can ? ui.linkButton('Unlink', function () { ctl.show('unlink:' + a.id); }) : null);
          })) : h('p', { class: 'muted', text: 'No actions are linked to this entry yet.' }),
          (can || convert) && e.open ? h('div', { class: 'row' },
            convert ? ui.button('Turn into an action', function () { ctl.dlg.close(); if (!app.queueBlocked()) CH.views.raiseForm.open(app, e.areaKey, { entry: e }); }) : null,
            can ? ui.button('Link an existing action', function () { ctl.show('link'); }) : null) : null];
      },
      form: function (view, e, ctl) {
        var label = function (what) { return what + ' ' + e.ref; };
        if (view === 'status') {
          var status = h('select', { id: 'ch-re-status' }, R.ENTRY_STATUSES.map(function (s) { return h('option', { value: s, selected: s === e.status ? true : null, text: STATUS_WORDS[s] }); }));
          var outcome = h('textarea', { id: 'ch-re-outcome', rows: '4', maxlength: '2000' });
          outcome.value = e.outcome;
          return formShell('Change the status', [field('Status', status), field('Outcome', outcome, 'Needed to resolve or close it: what was done or decided.')],
            'Save', function (form, errorBox) {
              var v = { status: status.value, outcome: outcome.value };
              var errors = R.validateEntryUpdate(e, v, { ownerAllowed: allowed });
              if (CH.ui.dialog.showErrors(form, 'ch-re-', errors, ['status', 'outcome'])) return;
              v.outcome = v.outcome.trim();
              ctl.send(form, { type: 'UpdateRegisterEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: v,
                label: label('Status of') + ' to ' + STATUS_WORDS[v.status].toLowerCase() }, errorBox);
            }, ctl);
        }
        if (view === 'edit') {
          var title = h('input', { id: 'ch-re-title', type: 'text', maxlength: '255', value: e.title });
          var desc = h('textarea', { id: 'ch-re-description', rows: '5', maxlength: '5000' });
          desc.value = e.description;
          var impact = h('select', { id: 'ch-re-impact' }, R.IMPACTS.map(function (x) { return h('option', { value: x, selected: x === e.impact ? true : null, text: x }); }));
          return formShell('Edit the details', [field('Title', title), field('Description', desc), field('Impact', impact)],
            'Save changes', function (form, errorBox) {
              var v = {};
              if (title.value.trim() !== e.title) v.title = title.value.trim();
              if (desc.value.trim() !== e.description.trim()) v.description = desc.value.trim();
              if (impact.value !== e.impact) v.impact = impact.value;
              var errors = R.validateEntryUpdate(e, v, { ownerAllowed: allowed });
              if (CH.ui.dialog.showErrors(form, 'ch-re-', errors, ['title', 'description', 'impact'])) return;
              if (errors.entry) { errorBox.textContent = errors.entry; return; }
              ctl.send(form, { type: 'UpdateRegisterEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: v, label: label('Edit') }, errorBox);
            }, ctl);
        }
        if (view === 'link') {
          var choices = m().actions.filter(function (a) { return a.areaKey === e.areaKey && a.sourceType !== 'Register' && !a.locked; });
          if (!choices.length) {
            return formShell('Link an existing action', h('p', { class: 'muted', text: 'There are no open ' + m().areaByKey[e.areaKey].name + ' actions that can be linked.' }), 'Link', function () {}, ctl);
          }
          var pick = h('select', { id: 'ch-re-actionId' }, choices.map(function (a) { return h('option', { value: String(a.id), text: a.ref + ' ' + a.title + ' (' + a.ownerName + ')' }); }));
          return formShell('Link an existing action', [field('Which action?', pick, 'Open actions in the same area. The action itself is linked; nothing is copied.')],
            'Link', function (form, errorBox) {
              ctl.send(form, { type: 'LinkActionToEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: { actionId: Number(pick.value) },
                label: 'Link ' + pick.options[pick.selectedIndex].text.split(' (')[0] + ' to ' + e.ref }, errorBox);
            }, ctl);
        }
        var actionId = Number(String(view).split(':')[1]);
        var a = m().actionById[actionId];
        return formShell('Unlink this action?', h('p', { class: 'explain', text: (a ? a.ref + ' ' + a.title : 'The action') + ' stays as it is; it is just no longer linked to ' + e.ref + '.' }),
          'Unlink', function (form, errorBox) {
            ctl.send(form, { type: 'UnlinkActionFromEntry', targetId: e.id, targetType: 'Register Entry', expectedRevision: e.revision, payload: { actionId: actionId },
              label: 'Unlink ' + (a ? a.ref : 'an action') + ' from ' + e.ref }, errorBox);
          }, ctl);
      }
    });
  }

  return { openNotice: openNotice, openEntry: openEntry, entryChip: entryChip, loadComments: loadComments, STATUS_WORDS: STATUS_WORDS };
})();
