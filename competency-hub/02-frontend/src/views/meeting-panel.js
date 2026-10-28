// One monthly meeting (spec MTG-1 to MTG-6): when and where, who chairs and attends, whether the Outlook invitation
// has gone, and the agenda – a preview built by the same rules as the flow until the meeting starts, then the agenda
// the flow fixed. Those who run the area's meetings change, cancel or start it (queued). While it is in progress they
// run it here: attendance, each item's outcome and notes, decisions and items added by hand are instant writes to the
// meeting's record folder (which only they and management may write to); actions raised or changed from the meeting
// are queued and carry the meeting, so it is finalised only once they are recorded. Finalised minutes are read from
// the record the flow froze, with the PDF, Print and, for management, amendments.
CH.views = CH.views || {};
CH.views.meetingPanel = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var ui = CH.ui;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
  var STATUS = { 'Scheduled': ['later', 'Booked'], 'In Progress': ['soon', 'In progress'], 'Finalising': ['soon', 'Being finalised'],
    'Finalised': ['done', 'Minutes finalised'], 'Cancelled': ['late', 'Cancelled'] };
  var ATTENDANCE = ['Present', 'Apologies', 'Absent'];
  // release 1.2 (backlog 9): each agenda item says what kind of thing it is, and offers only the buttons that fit it
  var KINDS = { 'Action': ['action', 'Action'], 'Register Entry': ['issue', 'Issue'], 'Notice': ['notice', 'Notice'], 'New Business': ['other', 'Other business'], 'Date': ['other', 'Date'] };
  function kindOf(it) { return KINDS[it.type] || ['other', 'Item']; }
  function kindLabel(it) { var k = kindOf(it); return h('span', { class: 'kind ' + k[0], text: k[1] }); }
  // the outcomes offered as buttons; "Closed" comes only from "Close this action"
  var OUTCOME_BUTTONS = [['Discussed', 'Discussed'], ['Deferred', 'Carry forward'], ['Not reached', 'Not reached'], ['Action raised', 'Action raised']];
  function outcomeWords(o) { var b = OUTCOME_BUTTONS.filter(function (x) { return x[0] === o; })[0]; return b ? b[1] : o; }

  function inviteWords(app, mt) {
    var on = !app.health || app.health.invitesEnabled !== false;
    var s = mt.inviteState;
    if (mt.status === 'Cancelled') return s === 'Cancelled' ? 'The cancellation has gone to the attendees.' : s === 'None' ? '' : 'The cancellation is being sent.';
    if (mt.status === 'Finalised' || mt.status === 'Finalising') return '';
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

  // The meeting's rows, read once (MeetingId is indexed): the frozen ones in MTG-{id}, which only the flow writes, and
  // what was recorded live in MTG-{id}/Record, keyed "{id}|…". Anything else that names the meeting does not count.
  async function loadItems(app, mt) {
    var res = await app.sp.items(CH.config.lists.meetingItems.title,
      '$select=Id,Title,RowType,Section,SourceType,SourceId,SortOrder,AgendaMarker,SnapshotOwner,SnapshotStatus,SnapshotDueDate,SnapshotDetails,Notes,Outcome,' +
      'Attendance,AmendmentReason,RecordKey,FileDirRef,AuthorId,Created&$filter=MeetingId eq ' + Number(mt.id), 2000);
    var folder = '/' + mt.areaKey + '/MTG-' + mt.id;
    var dir = function (r) { return String(r.FileDirRef || ''); };
    var rows = res.rows.slice().sort(function (a, b) { return a.Id - b.Id; });
    return {
      frozen: rows.filter(function (r) { return dir(r).slice(-folder.length) === folder; }),
      live: rows.filter(function (r) { return dir(r).slice(-(folder.length + 7)) === folder + '/Record' && String(r.RecordKey || '').indexOf(mt.id + '|') === 0; })
    };
  }

  // The last row recorded for each key wins (people may record an outcome or attendance more than once).
  function latest(live) {
    var out = {};
    live.forEach(function (r) { out[r.RecordKey] = r; });
    return out;
  }

  function outcomeKey(mtId, type, sourceId) { return mtId + '|O|' + type + '|' + Number(sourceId); }

  // Agenda items as the panel shows them: from the flow's rows (with any outcome recorded), or from the preview.
  function fromRows(app, mt, rows, live) {
    var last = latest(live || []);
    var items = rows.filter(function (r) { return r.RowType === 'Agenda Item'; }).sort(function (a, b) { return (a.SortOrder || 0) - (b.SortOrder || 0) || a.Id - b.Id; })
      .map(function (r) {
        var it = describe(app, r.Section, r.SourceType || 'Date', r.SourceId, r.Title, r.AgendaMarker, r.SnapshotOwner, r.SnapshotDetails, r.SnapshotDueDate);
        it.key = r.SourceType ? outcomeKey(mt.id, r.SourceType, r.SourceId) : '';
        var rec = it.key && last[it.key];
        it.outcome = rec ? rec.Outcome || '' : r.Outcome || '';
        it.notes = rec ? rec.Notes || '' : r.Notes || '';
        return it;
      });
    // items added by hand (new business), until the flow freezes them into the agenda
    (live || []).filter(function (r) { return r.RowType === 'New Business'; }).forEach(function (r) {
      var key = outcomeKey(mt.id, 'New Business', r.Id);
      if (items.some(function (it) { return it.key === key; })) return;
      var rec = last[key];
      items.push({ section: 'New business', type: 'New Business', title: r.Title, detail: (r.Notes ? r.Notes + ' · ' : '') + 'added by ' + app.model.nameOf(r.AuthorId), key: key,
        outcome: rec ? rec.Outcome || '' : '', notes: rec ? rec.Notes || '' : '' });
    });
    return items;
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
    return { section: section, type: section === 'New business' && type === 'Date' ? 'New Business' : type, title: title || '', detail: bits.join(' · '), open: open, sourceId: id };
  }

  function agendaList(items, withOutcomes) {
    var groups = CH.agenda.SECTIONS.concat(['New business', 'Decisions and additional actions']).map(function (title) { return { title: title, rows: [] }; });
    items.forEach(function (it) {
      var g = groups.filter(function (x) { return x.title === it.section; })[0];
      if (g) g.rows.push(it);
    });
    return groups.filter(function (g) { return g.rows.length; }).map(function (g) {
      return [h('h4', { class: 'agenda-title', text: g.title + ' (' + g.rows.length + ')' }), h('ul', { class: 'plain agenda' }, g.rows.map(function (it) {
        return h('li', null, kindLabel(it), h('span', { class: 'agenda-text' }, h('b', { text: it.title }), it.detail ? [h('br'), h('span', { class: 'muted small', text: it.detail })] : null,
          withOutcomes && (it.outcome || it.notes) ? [h('br'), h('span', { class: 'small' }, it.outcome ? h('b', { text: outcomeWords(it.outcome) + (it.notes ? ': ' : '') }) : null, it.notes || '')] : null),
          it.open ? ui.linkButton('Open', it.open) : null);
      }))];
    });
  }

  var bufferSeq = 0;   // temporary numbers for rows kept until a booking is saved

  function open(app, id) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-mt', title: 'Meeting', wide: true, onClose: function () { app.panel = null; app.liveMeetingId = null; } });
    var view = 'main';
    var agenda = null;      // { kind: 'preview' | 'fixed', items, frozen, live } or 'error'
    var at = 0;             // the agenda item on screen while the meeting runs
    var adding = false;     // the "Add an item" form is in the item pane
    var openTitle = null;   // an item just added: opened as soon as the agenda is read again (backlog 6)
    var loads = 0;          // only the newest read of the agenda is shown
    var shown = '';         // what the screen shows, so a read that brings nothing new repaints nothing
    var mine = [];          // rows saved from this screen that a read may not include yet: kept on screen until it does
    var refreshTimer = null;
    var attOpen = null;     // the attendance list as the person left it (open or closed)

    function mt() {
      if (id < 0 && app.meetingAlias && app.meetingAlias[id] && app.model.meetingById[app.meetingAlias[id]]) { id = app.meetingAlias[id]; loadAgenda(true); }
      return app.model.meetingById[id];
    }

    // what is recorded for the meeting, with what waits on this screen for its booking to be saved
    async function readItems(x) {
      var rows = x.id < 0 ? { frozen: [], live: [] } : await loadItems(app, x);
      rows.live = rows.live.concat(app.bufferFor(x.id));
      return rows;
    }

    // the agenda items now: the fixed ones, or while the start is saved those built on this screen, with every outcome
    function itemsNow(x) {
      if (agenda.kind !== 'starting') return fromRows(app, x, agenda.frozen, agenda.live);
      var last = latest(agenda.live);
      return agenda.items.map(function (it) {
        if (!it.key) return it;
        var rec = last[it.key];
        return Object.assign({}, it, { outcome: rec ? rec.Outcome || '' : '', notes: rec ? rec.Notes || '' : '' });
      }).concat(fromRows(app, x, [], agenda.live));
    }

    // What the screen would show, in short: the meeting, its agenda and every latest outcome, and what is being saved.
    function signature(x, a) {
      if (!x || !a || a === 'error') return String(a);
      var last = latest(a.live);
      return JSON.stringify([x.status, x.revision, x.pdfState, x.pdfVersion, !!x.sending, !!x.starting, !!x.finalising, a.kind,
        (a.items || []).map(function (it) { return [it.key, it.title, it.detail]; }),
        a.frozen.map(function (r) { return [r.Id, r.Outcome, r.Notes, r.Attendance, r.Title]; }),
        Object.keys(last).sort().map(function (k) { return [k, last[k].Outcome, last[k].Notes, last[k].Attendance, last[k].Title]; }),
        meetingPending(x).map(function (e) { return e.label; }),
        (function () { var e = app.tracker.forTarget(x.id, 'Meeting'); return e ? [e.type, e.state] : null; })(),
        itemsNow2(x, a).filter(function (it) { return it.type === 'Action'; }).map(function (it) {
          var ac = app.model.actionById[it.sourceId]; return ac ? [ac.id, ac.done, ac.status, ac.revision] : null; })]);
    }
    function itemsNow2(x, a) { var keep = agenda; agenda = a; try { return itemsNow(x); } finally { agenda = keep; } }

    // quiet: a refresh while the meeting is open. Nothing is blanked; the screen is repainted only if something changed,
    // and stays on the item it was on.
    async function loadAgenda(quiet) {
      var x = mt();
      if (!x) return;
      var mineLoad = ++loads;
      var agendaWas = agenda;
      try {
        if (x.status === 'Scheduled') {
          var both = await Promise.all([CH.agenda.preview(app.sp, app.model, x, app.settings), readItems(x)]);
          agenda = { kind: 'preview', items: fromPreview(app, both[0]).concat(fromRows(app, x, [], both[1].live)), frozen: both[1].frozen, live: both[1].live };
        } else {
          var rows = await readItems(x);
          var fixed = rows.frozen.some(function (r) { return r.RowType === 'Agenda Item'; });
          if (x.status === 'In Progress' && !fixed) {
            // started on this screen (release 1.2): the agenda by the same rules the flow uses, until it has fixed it.
            // Outcomes are kept by their source, so they attach to the fixed agenda when it comes.
            var pre = await CH.agenda.preview(app.sp, app.model, x, app.settings);
            var items = fromPreview(app, pre).map(function (it) {
              if (it.type !== 'Date' && it.sourceId) it.key = outcomeKey(x.id, it.type, it.sourceId);
              return it;
            });
            agenda = { kind: 'starting', items: items, frozen: [], live: rows.live };
          } else {
            agenda = { kind: 'fixed', items: fromRows(app, x, rows.frozen, x.status === 'In Progress' || x.status === 'Finalising' || x.finalising ? rows.live : []),
              frozen: rows.frozen, live: rows.live };
          }
        }
      } catch (_) { agenda = quiet && agendaWas && agendaWas !== 'error' ? agendaWas : 'error'; }
      if (mineLoad !== loads) { agenda = agendaWas; return; }   // a newer read is on its way
      if (agenda && agenda !== 'error' && agenda !== agendaWas) {
        // rows saved here that this read does not include yet stay on screen, newest last
        var seen = {};
        agenda.live.forEach(function (r) { if (r.RowKey) seen[r.RowKey] = true; });
        mine = mine.filter(function (r) { return !seen[r.RowKey]; });
        agenda.live = agenda.live.concat(mine);
      }
      // stay on the item that was on screen, wherever it now sits
      if (agendaWas && agendaWas !== 'error' && agenda && agenda !== 'error' && !openTitle) {
        var before = itemsNow2(x, agendaWas)[at];
        if (before) {
          var now = itemsNow(mt());
          for (var j = 0; j < now.length; j++) if ((before.key && now[j].key === before.key) || (!before.key && now[j].title === before.title)) { at = j; break; }
        }
      }
      if (openTitle && agenda && agenda !== 'error') {
        var list = itemsNow(mt());
        for (var i = list.length - 1; i >= 0; i--) if (list[i].type === 'New Business' && list[i].title === openTitle) { at = i; break; }
        openTitle = null;
      }
      if ((view !== 'main' && view !== 'finalise') || !dlg.isOpen()) return;
      if (quiet && view === 'main' && signature(mt(), agenda) === shown) return;
      fill();
    }

    // changes made from this meeting that are still being recorded (they hold back finalising)
    function meetingPending(x) {
      return app.tracker.entries().filter(function (e) {
        return Number(e.meetingId) === Number(x.id) && (e.state === 'submitted' || e.state === 'slow');
      });
    }

    function pending(x) {
      if (app.finaliseLater[x.id]) {
        return h('p', { class: 'pending', role: 'status' }, app.mark({ sending: true }, 'Meeting'),
          ' Finalise the minutes – the minutes below are what will be saved. They are sent as soon as the meeting\'s start is saved, usually within a minute.');
      }
      var e = app.tracker.forTarget(x.id, 'Meeting');
      // release 1.2: a change to the booking already shows; a refusal has its own card, with Try again
      if (e && (e.state === 'submitted' || e.state === 'slow')) {
        var what = e.retrying ? e.message : e.type === 'StartMeeting' ? 'the meeting is on. Record it now; the agenda is fixed in the background.'
          : e.type === 'FinaliseMeeting' ? (app.outOfHours && app.outOfHours(new Date()) ? 'the minutes below are what is being saved. Out of hours, they and the PDF are completed from 07:00 on the next weekday.'
            : 'the minutes below are what is being saved. The PDF follows a few minutes after.')
          : 'you can carry on. The next steps are offered once it is saved.';
        return h('p', { class: 'pending', role: 'status' }, app.mark(x, 'Meeting') || app.mark({ sending: true }, 'Meeting'), ' ' + e.label + ' – ' + what);
      }
      var mark = app.mark(x, 'Meeting');
      return mark ? h('p', { class: 'mark-line' }, mark) : null;
    }

    function fill() {
      var keep = { body: dlg.body.scrollTop, nav: (dlg.body.querySelector('.agenda-list') || {}).scrollTop || 0,
        focus: document.activeElement && dlg.node.contains(document.activeElement) ? focusPath(document.activeElement) : null };
      paint();
      dlg.body.scrollTop = keep.body;
      var nav = dlg.body.querySelector('.agenda-list');
      if (nav) nav.scrollTop = keep.nav;
      if (keep.focus) { var el = findPath(keep.focus); if (el && el !== document.activeElement) el.focus({ preventScroll: true }); }
      shown = signature(mt(), agenda);
    }
    // a control found again after a repaint: by its id, or by its text within its group
    function focusPath(el) { return el.id ? { id: el.id } : { cls: el.parentNode && el.parentNode.className, text: el.textContent }; }
    function findPath(p) {
      if (p.id) return dlg.node.querySelector('#' + p.id);
      var all = dlg.body.querySelectorAll('button');
      for (var i = 0; i < all.length; i++) if (all[i].textContent === p.text && all[i].parentNode.className === p.cls) return all[i];
      return null;
    }

    function paint() {
      CH.dom.clear(dlg.body);
      var x = mt();
      if (!x) { dlg.setTitle('Meeting not available'); CH.dom.append(dlg.body, h('p', { text: 'This meeting could not be found. It may have been cancelled.' })); return; }
      dlg.setTitle(x.areaName + ' meeting, ' + D.weekday(x.dateIso) + ' ' + D.long(x.dateIso));
      if (view !== 'main') { CH.dom.append(dlg.body, form(view, x)); return; }
      var runs = app.access.runsMeetings(x.areaKey);
      var e = app.tracker.forTarget(x.id, 'Meeting');
      var saving = e && (e.state === 'submitted' || e.state === 'slow');
      // a start being saved does not hold the meeting up (release 1.2); any other change to the booking still does
      var busy = (saving && e.type !== 'StartMeeting') || app.meetingsBlocked();
      var live = runs && !busy && x.status === 'In Progress';
      app.liveMeetingId = live ? x.id : null;
      var st = STATUS[x.status] || ['later', x.status];
      var words = inviteWords(app, x);
      var people = x.attendeeIds.map(function (pid) { return app.model.nameOf(pid); }).sort();
      // while it runs the meeting gets the room: wider, and when, where and who on one line (release 1.2)
      dlg.node.classList.toggle('dialog-xl', live);
      CH.dom.append(dlg.body, [
        h('p', { class: 'what-label' }, 'Meeting · ' + (x.isNew ? 'not yet numbered' : x.ref) + ' · ' + x.areaName + ' ', ui.chip(st[0], st[1])),
        pending(x),
        live ? h('p', { class: 'muted small live-line', text: D.weekdayShort(x.dateIso) + ', ' + x.start + (x.location ? ' · ' + x.location : '') +
          (x.chairName ? ' · ' + x.chairName + ' chairs' : '') + ' · ' + people.length + ' invited' }) : h('dl', { class: 'facts' },
          h('dt', { text: 'When' }), h('dd', { text: D.weekday(x.dateIso) + ' ' + D.long(x.dateIso) + ', ' + x.start + (x.end ? ' to ' + x.end : '') }),
          h('dt', { text: 'Where' }), h('dd', null, x.location || (x.onlineLink ? 'Online' : 'Not given'),
            x.onlineLink ? [' · ', h('span', { class: 'muted small', text: x.onlineLink })] : null),
          h('dt', { text: 'Who' }), h('dd', { text: (x.chairName ? x.chairName + ' chairs. ' : '') + (people.length ? people.length + ' invited: ' + people.join(', ') + '.' : '') }),
          x.status === 'Cancelled' ? [h('dt', { text: 'Cancelled' }), h('dd', { class: 'notice-body', text: x.cancellationReason })] : null,
          x.status === 'Finalised' ? [h('dt', { text: 'Finalised' }), h('dd', { text: (x.finalisedIso ? D.long(x.finalisedIso) : '') + (x.finalisedByName ? ' by ' + x.finalisedByName : '') +
            (x.amendments ? '. ' + x.amendments + (x.amendments === 1 ? ' amendment.' : ' amendments.') : '') })] : null),
        words && !live ? h('p', { class: x.inviteState === 'Failed' ? 'section-note' : 'muted small', text: words }) : null,
        h('div', { class: 'row actions-row' },
          runs && !busy && x.status === 'Scheduled' ? ui.button('Start meeting', function () { show('start'); }, 'main') : null,
          runs && !busy && x.status === 'Scheduled' && x.id > 0 ? ui.button('Change', function () { dlg.close(); CH.views.meetingForm.open(app, x.areaKey, x); }) : null,
          live ? ui.button('Review and finalise', function () { show('finalise'); }, 'main') : null,
          runs && !busy && x.id > 0 && (x.status === 'Scheduled' || x.status === 'In Progress') ? ui.button('Cancel meeting', function () { show('cancel'); }) : null,
          x.status === 'Scheduled' || x.status === 'In Progress' ? ui.button('Add to my calendar', function () { download(x.ref + '.ics', ics(x, x.areaName)); }) : null,
          x.status === 'Finalised' && app.access.isManagement && !busy ? ui.button('Amend these minutes', function () { show('amend'); }) : null),
        x.status === 'Finalised' ? minutes(x) : live ? liveScreen(x) : [
          h('h3', { class: 'group-title', text: x.status === 'Scheduled' ? 'Agenda so far' : 'Agenda' }),
          x.status === 'Scheduled' ? h('p', { class: 'muted small', text: 'Built from today\'s records by the same rules as the meeting. It is fixed when the meeting starts.' }) : null,
          x.status === 'Finalising' ? h('p', { class: 'muted small', text: 'The minutes are being finalised. The record can no longer be changed.' }) : null,
          agendaBody(x.status !== 'Scheduled'),
          runs && x.status === 'Scheduled' ? addItemForm(x) : null]
      ]);
    }

    function agendaBody(withOutcomes) {
      return agenda === null ? h('p', { class: 'muted', text: 'Building the agenda…' }) : agenda === 'error' ? h('p', { class: 'section-note', text: 'The agenda could not be read just now.' })
        : agenda.items.length ? agendaList(agenda.items, withOutcomes) : h('p', { class: 'muted', text: 'Nothing on the agenda yet.' });
    }

    // ---- the meeting in progress (spec MTG-3): everything here saves at once to the record folder
    function saveRow(x, values, status) {
      var clientKey = CH.requests.newKey();
      status.textContent = 'Saving…';
      if (x.id < 0) {
        var row = Object.assign({ Id: -(++bufferSeq), AuthorId: app.person.SiteUserId, RowKey: 'U|' + clientKey, MeetingId: x.id }, values);
        (app.meetingBuffer[x.id] = app.meetingBuffer[x.id] || []).push(row);
        if (agenda && agenda !== 'error') agenda.live.push(row);
        status.textContent = 'Kept – sent as soon as the booking is saved';
        return Promise.resolve();
      }
      return app.sp.addToFolder('meetingItems', x.areaKey + '/MTG-' + x.id + '/Record', Object.assign({ RowKey: 'U|' + clientKey, MeetingId: x.id }, values))
        .then(function () {
          status.textContent = 'Saved';
          var row = Object.assign({ Id: Infinity, AuthorId: app.person.SiteUserId, RowKey: 'U|' + clientKey }, values);
          mine.push(row);
          if (agenda && agenda !== 'error') agenda.live.push(row);
        })
        .catch(function (error) {
          status.textContent = error.status === 403 ? 'Only the people who run this area\'s meetings, and the Team Leaders and Group Head, can record this.' : 'Not saved – try again in a moment.';
          throw error;
        });
    }

    function liveScreen(x) {
      if (agenda === null || agenda === 'error') return agendaBody(false);
      var last = latest(agenda.live);
      var items = itemsNow(x);
      at = Math.max(0, Math.min(at, items.length - 1));
      return [h('div', { class: 'meet' }, agendaNav(items), h('div', { class: 'item-pane' }, adding ? addItemForm(x) : items.length ? oneItem(x, items) : h('p', { class: 'muted', text: 'Nothing on the agenda.' }))),
        attendance(x, last), decisions(x)];
    }

    // the agenda, grouped by kind, each with how far it has got; "Add an item" sits with it (backlog 6)
    function agendaNav(items) {
      var groups = [['action', 'Actions'], ['issue', 'Issues'], ['notice', 'Notices'], ['other', 'Other business']];
      return h('nav', { class: 'agenda-list', 'aria-label': 'Agenda' }, groups.map(function (g) {
        var mine = items.map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return kindOf(x.it)[0] === g[0]; });
        if (!mine.length) return null;
        return [h('div', { class: 'sec', text: g[1] }), mine.map(function (x) {
          var o = x.it.outcome;
          var chip = o ? ui.chip(o === 'Not reached' || o === 'Deferred' ? 'soon' : 'done', outcomeWords(o))
            : R.DISCUSSION_SECTIONS.indexOf(x.it.section) >= 0 ? ui.chip('soon', 'Needs an outcome') : ui.chip('plain', 'To do');
          return h('button', { type: 'button', class: 'it' + (x.i === at && !adding ? ' on' : ''), 'aria-current': x.i === at && !adding ? 'true' : null,
            onclick: function () { adding = false; at = x.i; fill(); } }, h('span', { class: 'lbl', text: x.it.title }), chip);
        })];
      }), h('button', { type: 'button', class: 'btn btn-small add', text: '+ Add an item', onclick: function () { adding = true; fill(); var f = dlg.body.querySelector('#ch-mt-title'); if (f) f.focus(); } }));
    }

    function attendance(x, last) {
      var status = h('span', { class: 'muted small', role: 'status' });
      var done = x.attendeeIds.filter(function (pid) { return last[x.id + '|P|' + pid] && last[x.id + '|P|' + pid].Attendance; }).length;
      var d = h('details', { class: 'live-block', open: (attOpen === null ? done < x.attendeeIds.length : attOpen) ? true : null },
        h('summary', null, h('span', { class: 'group-title', text: 'Attendance' }), ' ', h('span', { class: 'muted small', text: done + ' of ' + x.attendeeIds.length + ' recorded' })), status,
        h('ul', { class: 'plain attendance' }, x.attendeeIds.map(function (pid) {
          var rec = last[x.id + '|P|' + pid];
          var sel = h('select', { id: 'ch-mt-att-' + pid, 'aria-label': 'Attendance of ' + app.model.nameOf(pid) },
            [h('option', { value: '', text: 'Not recorded' })].concat(ATTENDANCE.map(function (a) { return h('option', { value: a, text: a, selected: rec && rec.Attendance === a ? true : null }); })));
          sel.addEventListener('change', function () {
            if (!sel.value) return;
            saveRow(x, { Title: app.model.nameOf(pid), RecordKey: x.id + '|P|' + pid, RowType: 'Attendee', Section: 'Attendance', SourceId: pid, Attendance: sel.value }, status)
              .catch(function () {});
          });
          return h('li', null, h('span', { text: app.model.nameOf(pid) }), sel);
        })));
      d.addEventListener('toggle', function () { attOpen = d.open; });
      return d;
    }

    function oneItem(x, items) {
      var it = items[at];
      var status = h('span', { class: 'muted small', role: 'status' });
      var notes = h('textarea', { id: 'ch-mt-item-notes', rows: '3', maxlength: '4000', 'aria-label': 'Notes for the minutes' });
      notes.value = it.notes || '';
      var needs = R.DISCUSSION_SECTIONS.indexOf(it.section) >= 0;
      var kind = kindOf(it)[0];
      var action = it.type === 'Action' ? app.model.actionById[it.sourceId] : null;
      async function save(outcome, next) {
        if (!it.key) { if (next) go(at + 1); return; }
        try {
          await saveRow(x, { Title: it.title, RecordKey: it.key, RowType: 'Outcome', SourceType: it.key.split('|')[2], SourceId: Number(it.key.split('|')[3]),
            Outcome: outcome, Notes: notes.value.trim() }, status);
          if (next) go(at + 1); else fill();
        } catch (_) { /* the message is shown beside the buttons */ }
      }
      function go(i) { at = Math.max(0, Math.min(i, items.length - 1)); fill(); var o = dlg.body.querySelector('.outcomes button'); if (o) o.focus(); }
      // Close this action: recorded for the minutes as Closed, with the notes, and the action itself is closed (queued)
      async function closeIt() {
        var note = notes.value.trim();
        try {
          await save('Closed', false);
          await app.tracker.submit({ type: 'CloseAction', targetId: action.id, expectedRevision: action.revision, meetingId: x.id,
            payload: { outcome: 'Completed', note: note }, label: 'Close: ' + action.title });
          fill();
        } catch (error) { status.textContent = error.friendly || 'The action could not be closed just now. Try again in a moment.'; }
      }
      var r = action ? R.roles(action, app.person.SiteUserId, app.access) : null;
      var buttons = x.id < 0 ? [h('span', { class: 'muted small', text: 'Actions can be raised or closed from here once the booking is saved – usually within a minute.' })]
        : kind === 'action' ? [
        it.open ? ui.button('Open this action', it.open) : null,
        action && r.canClose && it.outcome !== 'Closed' && !action.done ? ui.button('Close this action', closeIt) : null,
        ui.button('Raise a further action', function () { CH.views.raiseForm.open(app, x.areaKey, { meeting: x, title: '' }); })]
        : kind === 'issue' || kind === 'notice' ? [
          it.open ? ui.button(kind === 'issue' ? 'Open this issue' : 'Open this notice', it.open) : null,
          ui.button('Turn into an action', function () { CH.views.raiseForm.open(app, x.areaKey, { meeting: x, title: it.title }); })]
        : it.type === 'New Business' ? [ui.button('Raise an action', function () { CH.views.raiseForm.open(app, x.areaKey, { meeting: x, title: it.title }); })] : [];
      return h('section', { class: 'live-item' },
        h('div', { class: 'row' }, kindLabel(it), h('span', { class: 'muted small', id: 'ch-mt-progress', text: 'Item ' + (at + 1) + ' of ' + items.length + ' · ' + it.section + (needs ? ' · needs an outcome' : '') })),
        h('h4', { id: 'ch-mt-item-title', text: it.title }),
        it.detail ? h('p', { class: 'muted small', text: it.detail }) : null,
        it.outcome === 'Closed' ? h('p', { class: 'small', text: 'Closed at this meeting – it will appear in the minutes under "Actions closed at this meeting".' }) : null,
        it.key ? [h('div', { class: 'what-label', text: 'Outcome' }),
          h('div', { class: 'outcomes', role: 'group', 'aria-label': 'Outcome' }, OUTCOME_BUTTONS.filter(function (o) { return o[0] !== 'Action raised' || kind !== 'action'; }).map(function (o) {
            return h('button', { type: 'button', 'aria-pressed': String(it.outcome === o[0]), text: o[1], onclick: function () { save(o[0], false); } });
          })),
          h('div', { class: 'what-label', text: 'Notes for the minutes' }), notes] : h('p', { class: 'muted small', text: 'For information.' }),
        h('div', { class: 'row foot' }, buttons, h('span', { class: 'grow' }), status,
          at > 0 ? ui.button('Previous', function () { go(at - 1); }) : null,
          ui.button(at < items.length - 1 ? 'Next item' : 'Last item', function () { if (it.key && notes.value.trim() !== (it.notes || '')) save(it.outcome, at < items.length - 1); else if (at < items.length - 1) go(at + 1); }, 'main')));
    }

    function decisions(x) {
      var list = agenda.live.filter(function (r) { return r.RowType === 'Decision'; });
      var title = h('input', { id: 'ch-mt-decision', type: 'text', maxlength: '255' });
      var details = h('textarea', { id: 'ch-mt-decision-details', rows: '2', maxlength: '2000' });
      var status = h('span', { class: 'muted small', role: 'status' });
      var f = h('form', { class: 'comment-form', novalidate: true }, field('Decision', title), field('Details', details, 'Optional.'),
        h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn', text: 'Record the decision' }), status));
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = title.value.trim();
        if (!t) { CH.ui.dialog.showErrors(f, 'ch-mt-', { decision: 'Say what was decided.' }, ['decision']); return; }
        saveRow(x, { Title: t, RecordKey: x.id + '|D|' + CH.requests.newKey(), RowType: 'Decision', Section: 'Decisions and additional actions', Notes: details.value.trim() }, status)
          .then(function () { fill(); }).catch(function () {});
      });
      return h('section', { class: 'live-block' }, h('h3', { class: 'group-title', text: 'Decisions' }),
        list.length ? h('ul', { class: 'plain' }, list.map(function (r) { return h('li', null, h('span', null, h('b', { text: r.Title }), r.Notes ? ' – ' + r.Notes : '')); })) : null, f);
    }

    // An agenda item added by hand: straight into the meeting's record folder.
    function addItemForm(x) {
      var title = h('input', { id: 'ch-mt-title', type: 'text', maxlength: '255' });
      var notes = h('textarea', { id: 'ch-mt-notes', rows: '2', maxlength: '2000' });
      var err = h('p', { class: 'form-error', role: 'alert' });
      var btn = h('button', { type: 'submit', class: 'btn btn-main', text: 'Add to the agenda' });
      var live = x.status === 'In Progress';
      var f = h('form', { class: 'comment-form', novalidate: true }, h('h4', { text: live ? 'Add an item' : 'Add an item before the meeting' }), field('Item', title), field('Details', notes, 'Optional.'), err,
        h('div', { class: 'row' }, btn, live ? ui.button('Back to the agenda', function () { adding = false; fill(); }) : null));
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        var t = title.value.trim();
        if (!t) { CH.ui.dialog.showErrors(f, 'ch-mt-', { title: 'Say what the item is.' }, ['title']); return; }
        btn.disabled = true; btn.textContent = 'Saving…';
        var clientKey = CH.requests.newKey();
        try {
          var nb = { Id: -(++bufferSeq), AuthorId: app.person.SiteUserId, Title: t, RowKey: 'U|' + clientKey, RecordKey: x.id + '|N|' + clientKey,
            MeetingId: x.id, RowType: 'New Business', SourceType: 'New Business', Section: 'New business', Notes: notes.value.trim() };
          if (x.id < 0) (app.meetingBuffer[x.id] = app.meetingBuffer[x.id] || []).push(nb);
          else { delete nb.Id; delete nb.AuthorId; await app.sp.addToFolder('meetingItems', x.areaKey + '/MTG-' + x.id + '/Record', nb); }
          adding = false;
          openTitle = t;
          fill();
          loadAgenda();
          CH.ui.toast(app.root, 'Added to the agenda.', 'ok');
        } catch (error) {
          btn.disabled = false; btn.textContent = 'Try again';
          err.textContent = error.status === 403 ? 'Only the people who run this area\'s meetings, and the Team Leaders and Group Head, can add items.' : 'The item could not be added just now. Your text has been kept.';
        }
      });
      return f;
    }

    // ---- finalised minutes (spec MTG-4 to MTG-6): only the record the flow froze. Release 1.2 (backlog 10): Open the PDF
    // and Download PDF; Print only when there is no PDF. Actions closed at the meeting, and those raised there, have tables.
    function minutes(x) {
      if (agenda === null || agenda === 'error') return agendaBody(true);
      // being finalised (release 1.2): the minutes as recorded, at once; the flow freezes the same record behind
      var draft = !!x.finalising;
      var rows = draft ? draftRows(x) : agenda.frozen;
      var items = draft ? itemsNow(x).filter(function (it) { return it.section !== 'Decisions and additional actions'; }) : fromRows(app, x, rows, []);
      var pdfOn = !app.health || app.health.pdfEnabled !== false;
      var pdf = x.pdfState === 'Ready' && x.pdfVersion > 0
        ? app.sp.siteRelative + '/' + CH.config.lists.minutes.url + '/' + x.areaKey + '/MTG-' + Number(x.id) + '-v' + Number(x.pdfVersion) + '.pdf' : '';
      var att = rows.filter(function (r) { return r.RowType === 'Attendee'; });
      var dec = rows.filter(function (r) { return r.RowType === 'Decision'; });
      var amend = rows.filter(function (r) { return r.RowType === 'Amendment'; });
      var closed = items.filter(function (it) { return it.outcome === 'Closed'; });
      var raised = draft ? rows.filter(function (r) { return r.RowType === 'Agenda Item' && r.Section === 'Decisions and additional actions'; })
        : items.filter(function (it) { return it.section === 'Decisions and additional actions'; });
      var rest = items.filter(function (it) { return it.outcome !== 'Closed' && it.section !== 'Decisions and additional actions'; });
      var raisedRows = rows.filter(function (r) { return r.RowType === 'Agenda Item' && r.Section === 'Decisions and additional actions'; });
      function table(head, body) {
        return h('table', { class: 't' }, h('thead', null, h('tr', null, head.map(function (x) { return h('th', { text: x }); }))),
          h('tbody', null, body.map(function (cells) { return h('tr', null, cells.map(function (c) { return h('td', { text: c }); })); })));
      }
      var sections = CH.agenda.SECTIONS.concat(['New business']).map(function (s) {
        var list = rest.filter(function (it) { return it.section === s; });
        return list.length ? [h('h4', { class: 'agenda-title', text: s }), table([s === 'New business' ? 'Item' : 'Item', 'Outcome', 'Notes'],
          list.map(function (it) { return [it.title, it.outcome ? outcomeWords(it.outcome) : '', it.notes || '']; }))] : null;
      });
      return h('section', { class: 'minutes print-area' },
        h('div', { class: 'row actions-row no-print' },
          pdf ? h('a', { class: 'btn btn-main', href: pdf, target: '_blank', rel: 'noopener', text: 'Open the PDF' }) : null,
          pdf ? h('a', { class: 'btn', href: pdf, download: x.ref + '.pdf', text: 'Download PDF' }) : null,
          !pdf && !pdfOn && !draft ? ui.button('Print the minutes', function () { window.print(); }) : null),
        draft ? h('p', { class: 'muted small no-print', text: 'These are the minutes being saved. Once they are, the PDF is made and they can be amended.' }) : null,
        !draft && !pdf && pdfOn && (x.pdfState === 'Pending' || x.pdfState === 'Failed') ? h('p', { class: 'muted small no-print', text: 'The PDF is being prepared. The minutes below are final.' }) : null,
        att.length ? table(['Attendance', ''], att.map(function (r) { return [r.SourceId ? app.model.nameOf(Number(r.SourceId)) : r.Title, r.Attendance || 'Not recorded']; }))
          : h('p', { class: 'muted', text: 'Attendance was not recorded.' }),
        sections,
        closed.length ? [h('h4', { class: 'agenda-title', text: 'Actions closed at this meeting' }), table(['Action', 'Notes'], closed.map(function (it) { return [it.title, it.notes || '']; }))] : null,
        raised.length ? [h('h4', { class: 'agenda-title', text: 'Actions raised at this meeting' }), table(['Action', 'Owner', 'Due'], raisedRows.map(function (r) {
          return [r.Title, r.SnapshotOwner ? app.model.nameOf(Number(r.SnapshotOwner)) : '', r.SnapshotDueDate ? D.short(D.localDate(r.SnapshotDueDate)) : ''];
        }))] : null,
        dec.length ? [h('h4', { class: 'agenda-title', text: 'Decisions' }), table(['Decision', 'Details'], dec.map(function (r) { return [r.Title, r.Notes || '']; }))] : null,
        amend.length ? [h('h4', { class: 'agenda-title', text: 'Amendments' }), table(['Amendment', 'Why'], amend.map(function (r) { return [(r.Title || '') + (r.Notes ? ': ' + r.Notes : ''), r.AmendmentReason || '']; }))] : null);
    }

    // The record as it will be frozen, built from what was recorded live: attendance (the latest choice for each person
    // invited), decisions, and the actions raised at this meeting.
    function draftRows(x) {
      var last = latest(agenda.live);
      var att = x.attendeeIds.map(function (pid) {
        var rec = last[x.id + '|P|' + pid];
        return { RowType: 'Attendee', SourceId: pid, Attendance: rec ? rec.Attendance : '' };
      });
      var dec = agenda.live.filter(function (r) { return r.RowType === 'Decision'; });
      var raised = app.model.actions.filter(function (a) { return a.sourceType === 'Meeting' && Number(a.sourceId) === Number(x.id); }).map(function (a) {
        return { RowType: 'Agenda Item', Section: 'Decisions and additional actions', Title: a.title, SnapshotOwner: a.ownerId, SnapshotDueDate: a.dueIso ? a.dueIso + 'T12:00:00Z' : '' };
      });
      return att.concat(dec, raised);
    }

    function form(kind, x) {
      var errorBox = h('p', { class: 'form-error', role: 'alert' });
      var fields = [];
      var reason = h('textarea', { id: 'ch-mt-reason', rows: '3', maxlength: '1000' });
      var what = h('textarea', { id: 'ch-mt-what', rows: '4', maxlength: '2000' });
      var blocked = false;
      if (kind === 'cancel') fields.push(field('Why is it cancelled?', reason, 'The attendees get an Outlook cancellation.'));
      else if (kind === 'amend') {
        fields.push(h('p', { class: 'explain', text: 'The amendment is added to the minutes with your name and the date. The original minutes are kept as they are, and a new PDF version is made.' }),
          field('What is the amendment?', what), field('Why is it needed?', reason));
      } else if (kind === 'finalise') {
        var items = agenda && agenda !== 'error' ? itemsNow(x) : [];
        var outcomes = {};
        items.forEach(function (it) { if (it.key) outcomes[it.key] = it.outcome; });
        var missing = R.missingOutcomes(items, outcomes);
        var waiting = meetingPending(x);
        blocked = !!missing.length || !!waiting.length;
        fields.push(h('p', { class: 'explain', text: 'Finalising makes the record read-only for good: the minutes are fixed as they are now, and a PDF is made. Team Leaders and the Group Head can add amendments later; the original stays.' }),
          h('p', { text: items.filter(function (it) { return it.outcome; }).length + ' of ' + items.length + ' items have an outcome.' }),
          missing.length ? h('div', { class: 'section-note', id: 'ch-mt-missing' }, h('b', { text: 'These items still need an outcome: ' }), missing.join('; ') + '.') : null,
          waiting.length ? h('div', { class: 'section-note', id: 'ch-mt-waiting' }, h('b', { text: 'Still being recorded: ' }), waiting.map(function (e) { return e.label; }).join('; ') +
            '. Finalise once they show as saved.') : null);
      } else fields.push(h('p', { class: 'explain', text: 'Starting fixes the agenda from the records as they are now. It cannot be undone.' }));
      var labels = { cancel: ['Cancel this meeting?', 'Cancel the meeting'], start: ['Start this meeting?', 'Start the meeting'],
        finalise: ['Finalise the minutes?', 'Finalise the minutes'], amend: ['Amend these minutes', 'Add the amendment'] }[kind];
      var submit = h('button', { type: 'submit', class: 'btn btn-main', text: labels[1], disabled: blocked ? true : null });
      var f = h('form', { class: 'dialog-body', novalidate: true }, h('h3', { text: labels[0] }), fields, errorBox,
        h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: function () { show('main'); } })));
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (blocked) return;
        var payload = {};
        if (kind === 'cancel') {
          var errs = R.validateCancelMeeting({ reason: reason.value });
          if (CH.ui.dialog.showErrors(f, 'ch-mt-', errs, ['reason'])) return;
          payload.reason = reason.value.trim();
        }
        if (kind === 'amend') {
          var aerrs = R.validateAmend({ what: what.value, reason: reason.value });
          if (CH.ui.dialog.showErrors(f, 'ch-mt-', aerrs, ['what', 'reason'])) return;
          payload = { what: what.value.trim(), reason: reason.value.trim() };
        }
        if (kind === 'start' && x.id < 0 && app.startWhenBooked(x)) { view = 'main'; fill(); loadAgenda(); return; }
        if (kind === 'finalise' && app.finaliseWhenReady(x)) { view = 'main'; fill(); loadAgenda(); return; }
        submit.disabled = true; submit.textContent = 'Sending…';
        var type = { cancel: 'CancelMeeting', start: 'StartMeeting', finalise: 'FinaliseMeeting', amend: 'AmendMeeting' }[kind];
        var verb = { cancel: 'Cancel the ', start: 'Start the ', finalise: 'Finalise the minutes of the ', amend: 'Amend the minutes of the ' }[kind];
        try {
          await app.tracker.submit({ type: type, targetId: x.id, targetType: 'Meeting', expectedRevision: x.revision, payload: payload, label: verb + x.areaName + ' meeting' });
          view = 'main';
          fill();
          if (kind === 'start' || kind === 'finalise') loadAgenda();
        } catch (error) {
          submit.disabled = false; submit.textContent = 'Try again';
          errorBox.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.';
        }
      });
      return f;
    }

    function show(next) { view = next; fill(); var first = dlg.body.querySelector('textarea, input'); if (first) first.focus(); }

    // Changes elsewhere (a request saved, the page read again) come in bursts while a meeting catches up: they are
    // gathered into one quiet read, and never repaint over what someone is typing or choosing.
    function refreshNow() {
      refreshTimer = null;
      if (!dlg.isOpen()) return;
      if (view !== 'main' && view !== 'finalise') return;
      var active = document.activeElement;
      if (active && dlg.body.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) { refreshTimer = setTimeout(refreshNow, 2000); return; }
      loadAgenda(true);
    }
    app.panel = { refresh: function () {
      if (!dlg.isOpen()) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshNow, 600);
    } };
    fill();
    loadAgenda();
    dlg.focusFirst();
  }

  return { open: open, ics: ics, inviteWords: inviteWords };
})();
