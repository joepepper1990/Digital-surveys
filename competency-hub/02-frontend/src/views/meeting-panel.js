// One monthly meeting (spec MTG-1, MTG-2): when and where, who chairs and attends, whether the Outlook invitation
// has gone, and the agenda – a preview built by the same rules as the flow until the meeting starts, then the agenda
// the flow fixed. Those who run the area's meetings change, cancel or start it (queued) and add agenda items by hand
// (an instant write to the meeting's record folder, which only they and management may write to).
CH.views = CH.views || {};
CH.views.meetingPanel = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var ui = CH.ui;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
  var STATUS = { 'Scheduled': ['later', 'Booked'], 'In Progress': ['soon', 'In progress'], 'Finalising': ['soon', 'Being finalised'],
    'Finalised': ['done', 'Minutes finalised'], 'Cancelled': ['late', 'Cancelled'] };

  function inviteWords(app, mt) {
    var on = !app.health || app.health.invitesEnabled !== false;
    var s = mt.inviteState;
    if (mt.status === 'Cancelled') return s === 'Cancelled' ? 'The cancellation has gone to the attendees.' : s === 'None' ? '' : 'The cancellation is being sent.';
    if (s === 'Sent') return 'The Outlook invitation has gone to the attendees.';
    if (s === 'Creating' || s === 'Updating') return 'The Outlook invitation is being sent.';
    if (s === 'Unknown') return 'The Outlook invitation is being checked and tried again automatically.';
    if (s === 'Failed') return 'The Outlook invitation could not be sent; it is tried again automatically, and the administrators are told if it keeps failing.';
    return on ? '' : 'Outlook invitations are switched off. Add the meeting to your calendar with the download below.';
  }

  // A calendar file for this meeting (used when invitations are off, or for anyone who wants it in their own calendar).
  function ics(mt, areaName) {
    var stamp = function (iso) { return String(iso).replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z'; };
    var escape = function (t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ESG Competency Hub//Meetings//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + (mt.inviteToken || mt.ref) + '@esg-competency-hub', 'DTSTAMP:' + stamp(new Date().toISOString()),
      'DTSTART:' + stamp(mt.startUtc), 'DTEND:' + stamp(mt.endUtc || mt.startUtc), 'SUMMARY:' + escape(areaName + ' monthly meeting'),
      'LOCATION:' + escape(mt.location || mt.onlineLink), 'DESCRIPTION:' + escape('ESG Competency Hub ' + mt.ref + (mt.onlineLink ? '. Online: ' + mt.onlineLink : '')),
      mt.status === 'Cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    var a = h('a', { download: name });
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // The fixed agenda and the record rows (items added by hand), read for one meeting. MeetingId is indexed.
  async function loadItems(app, mt) {
    var res = await app.sp.items(CH.config.lists.meetingItems.title,
      '$select=Id,Title,RowType,Section,SourceType,SourceId,SortOrder,AgendaMarker,SnapshotOwner,SnapshotStatus,SnapshotDueDate,SnapshotDetails,Notes,RecordKey,FileDirRef,AuthorId,Created' +
      '&$filter=MeetingId eq ' + Number(mt.id), 2000);
    var record = '/' + mt.areaKey + '/MTG-' + mt.id;
    return res.rows.filter(function (r) {
      var dir = String(r.FileDirRef || '');
      // agenda rows in the meeting's folder (written by the flow); items added by hand in its Record folder
      return r.RowType === 'Agenda Item' ? dir.slice(-record.length) === record
        : dir.slice(-(record.length + 7)) === record + '/Record' && String(r.RecordKey || '').indexOf(mt.id + '|') === 0;
    });
  }

  function agendaList(items) {
    var groups = CH.agenda.SECTIONS.concat(['New business']).map(function (title) { return { title: title, rows: [] }; });
    items.forEach(function (it) {
      var g = groups.filter(function (x) { return x.title === it.section; })[0];
      if (g) g.rows.push(it);
    });
    return groups.filter(function (g) { return g.rows.length; }).map(function (g) {
      return [h('h4', { class: 'agenda-title', text: g.title + ' (' + g.rows.length + ')' }), h('ul', { class: 'plain agenda' }, g.rows.map(function (it) {
        return h('li', null, h('span', null, h('b', { text: it.title }), it.detail ? [h('br'), h('span', { class: 'muted small', text: it.detail })] : null),
          it.open ? ui.linkButton('Open', it.open) : null);
      }))];
    });
  }

  // Agenda rows as the panel shows them: from the flow's rows, or from the preview.
  function fromRows(app, rows) {
    var m = app.model;
    return rows.filter(function (r) { return r.RowType === 'Agenda Item'; }).sort(function (a, b) { return (a.SortOrder || 0) - (b.SortOrder || 0) || String(a.Title).localeCompare(String(b.Title)); })
      .map(function (r) { return describe(app, r.Section, r.SourceType || 'Date', r.SourceId, r.Title, r.AgendaMarker, r.SnapshotOwner, r.SnapshotDetails, r.SnapshotDueDate); })
      .concat(rows.filter(function (r) { return r.RowType === 'New Business'; }).map(function (r) {
        return { section: 'New business', title: r.Title, detail: (r.Notes ? r.Notes + ' · ' : '') + 'added by ' + m.nameOf(r.AuthorId) };
      }));
  }
  function fromPreview(app, list) {
    return list.map(function (x) {
      var r = x.row;
      return describe(app, x.section, x.sourceType, x.sourceId, r.Title, x.marker, r.AssignedToId,
        x.sourceType === 'Register Entry' ? r.EntryType + ' · ' + r.Impact + ' impact' : x.sourceType === 'Date' ? (r.StartTime ? D.long(D.localDate(r.StartTime)) : '') : '',
        r.DueDay ? D.fromDueDay(r.DueDay) : '');
    });
  }
  function describe(app, section, type, sourceId, title, marker, ownerId, details, due) {
    var m = app.model;
    var id = Number(sourceId);
    var open = type === 'Action' ? function () { app.openAction({ id: id }); } : type === 'Notice' && m.noticeById[id] ? function () { app.openNotice({ id: id }); }
      : type === 'Register Entry' && m.entryById[id] ? function () { app.openEntry({ id: id }); } : null;
    var bits = [];
    if (type === 'Action' && ownerId) bits.push(m.nameOf(Number(ownerId)));
    if (type === 'Action' && due) bits.push('due ' + D.short(String(due).slice(0, 10)));
    if (details) bits.push(details);
    if (marker) bits.push(marker.toLowerCase());
    return { section: section, title: title || '', detail: bits.join(' · '), open: open };
  }

  function open(app, id) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-mt', title: 'Meeting', wide: true, onClose: function () { app.panel = null; } });
    var view = 'main';
    var agenda = null;      // { kind: 'preview' | 'fixed', items } or 'error'

    function mt() { return app.model.meetingById[id]; }

    async function loadAgenda() {
      var x = mt();
      if (!x) return;
      try {
        if (x.status === 'Scheduled') {
          var both = await Promise.all([CH.agenda.preview(app.sp, app.model, x, app.settings), loadItems(app, x)]);
          agenda = { kind: 'preview', items: fromPreview(app, both[0]).concat(fromRows(app, both[1])) };
        } else {
          agenda = { kind: 'fixed', items: fromRows(app, await loadItems(app, x)) };
        }
      } catch (_) { agenda = 'error'; }
      if (view === 'main' && dlg.isOpen()) fill();
    }

    function pending(x) {
      var e = app.tracker.forTarget(x.id, 'Meeting');
      if (e && (e.state === 'submitted' || e.state === 'slow')) {
        return h('p', { class: 'pending', role: 'status' }, h('b', { text: e.label }), ' – submitted ' + D.ukTime(e.submittedAt) + ', being recorded (usually under 5 minutes).');
      }
      var heading = { rejected: 'Not accepted: ', attention: 'Not recorded: ', cancelled: 'Cancelled: ' }[e && e.state];
      return heading ? h('div', { class: 'section-note', role: 'alert' }, h('b', { text: heading }), e.message + ' ', ui.linkButton('Dismiss', function () { app.tracker.dismiss(e); })) : null;
    }

    function fill() {
      CH.dom.clear(dlg.body);
      var x = mt();
      if (!x) { dlg.setTitle('Meeting not available'); CH.dom.append(dlg.body, h('p', { text: 'This meeting could not be found. It may have been cancelled.' })); return; }
      dlg.setTitle(x.areaName + ' meeting, ' + D.weekday(x.dateIso) + ' ' + D.long(x.dateIso));
      if (view !== 'main') { CH.dom.append(dlg.body, form(view, x)); return; }
      var runs = app.access.runsMeetings(x.areaKey);
      var e = app.tracker.forTarget(x.id, 'Meeting');
      var busy = (e && (e.state === 'submitted' || e.state === 'slow')) || app.meetingsBlocked();
      var st = STATUS[x.status] || ['later', x.status];
      var words = inviteWords(app, x);
      var people = x.attendeeIds.map(function (pid) { return app.model.nameOf(pid); }).sort();
      CH.dom.append(dlg.body, [
        h('p', { class: 'muted small' }, x.ref + ' · ' + x.areaName + ' ', ui.chip(st[0], st[1])),
        pending(x),
        h('dl', { class: 'facts' },
          h('dt', { text: 'When' }), h('dd', { text: D.weekday(x.dateIso) + ' ' + D.long(x.dateIso) + ', ' + x.start + (x.end ? ' to ' + x.end : '') }),
          h('dt', { text: 'Where' }), h('dd', null, x.location || (x.onlineLink ? 'Online' : 'Not given'),
            x.onlineLink ? [' · ', h('span', { class: 'muted small', text: x.onlineLink })] : null),
          h('dt', { text: 'Who' }), h('dd', { text: (x.chairName ? x.chairName + ' chairs. ' : '') + (people.length ? people.length + ' invited: ' + people.join(', ') + '.' : '') }),
          x.status === 'Cancelled' ? [h('dt', { text: 'Cancelled' }), h('dd', { class: 'notice-body', text: x.cancellationReason })] : null),
        words ? h('p', { class: x.inviteState === 'Failed' ? 'section-note' : 'muted small', text: words }) : null,
        h('div', { class: 'row actions-row' },
          runs && !busy && x.status === 'Scheduled' ? ui.button('Start meeting', function () { show('start'); }, 'main') : null,
          runs && !busy && x.status === 'Scheduled' ? ui.button('Change', function () { dlg.close(); CH.views.meetingForm.open(app, x.areaKey, x); }) : null,
          runs && !busy && (x.status === 'Scheduled' || x.status === 'In Progress') ? ui.button('Cancel meeting', function () { show('cancel'); }) : null,
          x.status !== 'Cancelled' ? ui.button('Add to my calendar', function () { download(x.ref + '.ics', ics(x, x.areaName)); }) : null),
        h('h3', { class: 'group-title', text: x.status === 'Scheduled' ? 'Agenda – preview' : 'Agenda' }),
        x.status === 'Scheduled' ? h('p', { class: 'muted small', text: 'Built from today\'s records by the same rules as the meeting. It is fixed when the meeting starts.' }) : null,
        agenda === null ? h('p', { class: 'muted', text: 'Building the agenda…' }) : agenda === 'error' ? h('p', { class: 'section-note', text: 'The agenda could not be read just now.' })
          : agenda.items.length ? agendaList(agenda.items) : h('p', { class: 'muted', text: 'Nothing on the agenda yet.' }),
        runs && (x.status === 'Scheduled' || x.status === 'In Progress') ? addItemForm(x) : null
      ]);
    }

    // An agenda item added by hand: straight into the meeting's record folder.
    function addItemForm(x) {
      var title = h('input', { id: 'ch-mt-title', type: 'text', maxlength: '255' });
      var notes = h('textarea', { id: 'ch-mt-notes', rows: '2', maxlength: '2000' });
      var err = h('p', { class: 'form-error', role: 'alert' });
      var btn = h('button', { type: 'submit', class: 'btn', text: 'Add to the agenda' });
      var f = h('form', { class: 'comment-form', novalidate: true }, h('h4', { text: 'Add an item' }), field('Item', title), field('Details', notes, 'Optional.'), err, btn);
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        var t = title.value.trim();
        if (!t) { CH.ui.dialog.showErrors(f, 'ch-mt-', { title: 'Say what the item is.' }, ['title']); return; }
        btn.disabled = true; btn.textContent = 'Saving…';
        var clientKey = CH.requests.newKey();
        try {
          await app.sp.addToFolder('meetingItems', x.areaKey + '/MTG-' + x.id + '/Record', { Title: t, RowKey: 'U|' + clientKey, RecordKey: x.id + '|N|' + clientKey,
            MeetingId: x.id, RowType: 'New Business', SourceType: 'New Business', Section: 'New business', Notes: notes.value.trim() });
          agenda = null;
          fill();
          loadAgenda();
          CH.ui.toast(app.root, 'Added to the agenda.', 'ok');
        } catch (error) {
          btn.disabled = false; btn.textContent = 'Try again';
          err.textContent = error.status === 403 ? 'Only the people who run this area\'s meetings, and management, can add items.' : 'The item could not be added just now. Your text has been kept.';
        }
      });
      return f;
    }

    function form(kind, x) {
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var fields = [];
      var reason = h('textarea', { id: 'ch-mt-reason', rows: '3', maxlength: '1000' });
      if (kind === 'cancel') fields.push(field('Why is it cancelled?', reason, 'The attendees get an Outlook cancellation.'));
      else fields.push(h('p', { class: 'explain', text: 'Starting fixes the agenda from the records as they are now. It cannot be undone.' }));
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: kind === 'cancel' ? 'Cancel the meeting' : 'Start the meeting' });
      var f = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: kind === 'cancel' ? 'Cancel this meeting?' : 'Start this meeting?' }), fields, errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: function () { show('main'); } })));
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        var payload = {};
        if (kind === 'cancel') {
          var errs = R.validateCancelMeeting({ reason: reason.value });
          if (CH.ui.dialog.showErrors(f, 'ch-mt-', errs, ['reason'])) return;
          payload.reason = reason.value.trim();
        }
        submit.disabled = true; submit.textContent = 'Sending…';
        try {
          await app.tracker.submit({ type: kind === 'cancel' ? 'CancelMeeting' : 'StartMeeting', targetId: x.id, targetType: 'Meeting', expectedRevision: x.revision,
            payload: payload, label: (kind === 'cancel' ? 'Cancel' : 'Start') + ' the ' + x.areaName + ' meeting' });
          view = 'main';
          fill();
        } catch (error) {
          submit.disabled = false; submit.textContent = 'Try again';
          errorBox.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.';
        }
      });
      return f;
    }

    function show(next) { view = next; fill(); var first = dlg.body.querySelector('textarea, input'); if (first) first.focus(); }

    app.panel = { refresh: function () { if (dlg.isOpen() && view === 'main') { agenda = null; fill(); loadAgenda(); } } };
    fill();
    loadAgenda();
    dlg.focusFirst();
  }

  return { open: open, ics: ics, inviteWords: inviteWords };
})();
