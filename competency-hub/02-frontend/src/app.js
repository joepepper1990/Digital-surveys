// Application controller: Welcome lifecycle, identity, loading and navigation.
CH.app = (function () {
  var h = CH.dom.h;

  function create(ctx) {
    var started = false;
    var disposed = false;
    var observer = null;
    var healthTimer = null;
    var HEALTH_EVERY_MS = 5 * 60 * 1000;
    var app = { state: { view: 'home', area: null, tab: 0 } };

    function findRoot() { return document.querySelector('[data-ch-root]'); }

    function waitForRoot() {
      return new Promise(function (resolve, reject) {
        var tries = 0;
        (function look() {
          var root = findRoot();
          if (root) return resolve(root);
          if (++tries > 50) return reject(new Error('The Competency Hub layout did not load.'));
          setTimeout(look, 100);
        })();
      });
    }

    // The layout carries the version it was built with. A different script version means the browser kept an
    // old copy of one of the two files (plan K7.9).
    function staleCopy() {
      var built = app.root && app.root.getAttribute && app.root.getAttribute('data-ch-version');
      return !!built && built !== CH.config.VERSION;
    }

    function frame(content) {
      var C = CH.config;
      return [
        app.stale ? h('p', { class: 'stale-copy', role: 'alert' }, h('b', { text: 'A newer version of the Competency Hub is available. ' }),
          'Press Ctrl+F5 to load it. Until then some buttons may not work.') : null,
        h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
          h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
          C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
          app.person && app.model ? nav() : null,
          app.person && app.model && app.state.view === 'home' ? homeButtons() : null,
          app.person ? h('span', { class: 'who', text: CH.names.of(app.person) + ' · ' + app.person.Role }) : null)),
        app.person && app.model ? statusLine() : null,
        h('main', { id: 'ch-main', tabindex: '-1' }, content),
        app.person && app.model ? problems() : null,
        h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
        h('p', { class: 'sr-only', 'data-ch-said': true, role: 'status', 'aria-live': 'polite' }),
        // the feedback button sits in its own place in the footer, so it never covers anything (spec FB-1)
        h('footer', null, h('span'), h('span', { text: 'ESG Competency Hub · version ' + C.VERSION }),
          h('span', { class: 'fb-slot' }, app.person && app.model ? CH.views.feedback.bubble(app) : null))
      ];
    }

    // Main pages, as pills in the bar. Only pages that exist are listed.
    function nav() {
      var v = app.state.view;
      var items = [['My week', v === 'home', app.goHome], ['My to-dos', v === 'mine', function () { app.showMine(0); }]];
      if (app.access && app.access.isManagement) items.push(['Overview of all areas', v === 'manage', app.showDashboard]);
      if (app.access && app.access.isAdministrator) items.push(['Administration', v === 'admin', app.showAdmin]);
      return h('nav', { class: 'pills', 'aria-label': 'Main' }, items.map(function (x) {
        return h('button', { type: 'button', 'aria-current': x[1] ? 'page' : null, onclick: x[2], text: x[0] });
      }));
    }

    function homeButtons() {
      var acc = app.access;
      var first = acc.memberAreas[0] || (app.model.areas[0] && app.model.areas[0].key);
      return h('span', { class: 'bar-btns' },
        acc.canPostNotice(first) ? CH.ui.button('Post a notice', function () { app.postNotice(app.state.homeArea || first); }) : null,
        // the area is never guessed: the open area, else the person chooses (backlog 12)
        acc.memberAreas.length || acc.isManagement ? CH.ui.button('Raise an action', function () { app.raiseAction(app.state.homeArea || null); }, 'main') : null);
    }

    // On the home page the app fills the window exactly, so the page itself never scrolls. Small windows
    // (phones, or very short windows) keep ordinary scrolling.
    function fitToWindow() {
      if (!app.root || !app.root.style || !app.root.classList) return;
      // Every page fits the window on a desktop: the home page by its own layout, the others by scrolling inside.
      var fit = !!app.model && window.innerWidth > 900 && window.innerHeight > 560;
      app.root.classList.toggle('ch-fit', fit);
      app.root.classList.toggle('ch-page', fit && app.state.view !== 'home');
      if (!fit) { app.root.style.height = ''; return; }
      var top = app.root.getBoundingClientRect().top + (window.scrollY || 0);
      app.root.style.height = Math.max(window.innerHeight - top, 480) + 'px';
      CH.ui.refit();
    }

    function onKey(e) {
      if (e.key !== 'Escape' || app.state.view !== 'home' || !app.state.homeArea) return;
      if (app.layer && app.layer.firstChild) return;   // a dialog is open; it handles Escape itself
      app.openAreaHere(null);
    }

    function applySize() {
      if (!app.root || !app.root.style) return;
      app.root.style.setProperty('--scale', String(CH.ui.scaleFor(app.root.clientWidth || 0)));
      app.root.style.setProperty('--text', '1');
    }

    // Follows the width Welcome gives the app; nothing else is observed.
    function watchSize() {
      applySize();
      if (typeof window.ResizeObserver === 'function') {
        observer = new window.ResizeObserver(function () { if (!disposed) applySize(); });
        observer.observe(app.root);
      } else {
        window.addEventListener('resize', applySize);
      }
    }

    // The page is repainted inside app.shell; dialogs live in app.layer, so an open dialog keeps its focus.
    function paint(content) {
      if (disposed) return;
      if (!app.shell || app.shell.parentNode !== app.root) {
        CH.dom.clear(app.root);
        app.shell = h('div', { class: 'shell' });
        app.layer = h('div', { class: 'layer' });
        CH.dom.append(app.root, [app.shell, app.layer]);
      }
      CH.dom.clear(app.shell);
      CH.dom.append(app.shell, frame(content));
      fitToWindow();
    }

    // Changes the page shows itself (release 1.2); administrators' changes are followed on the Administration page.
    function followed(e) { return CH.requests.ADMIN_TYPES.indexOf(e.type) < 0; }
    function saving(e) { return e.state === 'submitted' || e.state === 'slow'; }

    // One line under the bar, always there (so nothing below moves): what is still being saved, a pause in automatic
    // processing, or requests a dropped connection kept back. Otherwise "Everything is up to date."
    function statusLine() {
      var entries = app.tracker ? app.tracker.entries().filter(function (e) { return followed(e) && saving(e); }) : [];
      var unsent = app.tracker ? app.tracker.unsent() : [];
      var text, kind = '', extra = null;
      if (app.queueBlocked()) {
        kind = 'down';
        text = 'Changes can\'t be processed at the moment. You can still read everything, add updates and post notices – nothing you have sent is lost.';
      } else if (unsent.length) {
        kind = 'down';
        text = (unsent.length === 1 ? '1 change was not sent' : unsent.length + ' changes were not sent') + ': your connection dropped before it reached SharePoint. ';
        extra = CH.ui.linkButton('Send again', async function () {
          try { await app.tracker.resend(); render(false); } catch (_) { CH.ui.toast(app.root, 'Still could not send. Try again in a moment.', 'info'); }
        });
      } else if (entries.length) {
        kind = 'busy';
        var e = entries[0];
        var how = entries.some(function (x) { return x.retrying; }) ? ' – retrying automatically, you can carry on.'
          : entries.some(function (x) { return x.state === 'slow'; }) ? ' – taking longer than usual, but it will be saved. You can carry on.' : ' – you can carry on.';
        text = (entries.length === 1 ? '1 change still saving: ' + e.label : entries.length + ' changes still saving') + how;
      } else {
        text = 'Everything is up to date.';
      }
      var away = outOfHours(new Date());
      return h('div', { class: 'status-line' + (kind ? ' ' + kind : ''), role: 'status', 'aria-live': 'polite' },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { text: text }), extra,
        away ? h('span', { class: 'muted small away', title: away, text: away }) : null);
    }

    var outOfHours = CH.health.outOfHours;
    app.outOfHours = outOfHours;

    // A change that was not saved: what happened, and Try again where that can work. Shown until dismissed.
    function problems() {
      if (!app.tracker) return null;
      var list = app.tracker.entries().filter(function (e) {
        return followed(e) && !e.dismissed && ['rejected', 'attention', 'cancelled', 'reverted'].indexOf(e.state) >= 0;
      }).slice(-3);
      if (!list.length) return null;
      return h('div', { class: 'problems', role: 'alert' }, list.map(function (e) {
        var text, again = false;
        if (e.state === 'rejected') {
          again = CH.requests.isConflict(e);
          text = again ? 'Someone else changed this a moment ago, so your change was not applied. Nothing was changed – the screen shows it as it is now.'
            : e.message + ' Nothing was changed.';
        } else if (e.state === 'attention') {
          again = true;
          text = /locked|Not fully/i.test(e.message)
            ? 'The Hub could not finish this change, and an administrator has been told. Part of it was made, so the record is locked until it is finished. Trying again is safe – it can never make the change twice.'
            : 'The Hub could not process this change. Nothing was changed, and an administrator has been told. Trying again is safe – it can never make the change twice.';
        } else {
          text = e.message;
        }
        return h('div', { class: 'problem' }, h('b', { text: (e.state === 'cancelled' ? 'Cancelled: ' : e.state === 'reverted' ? 'Reverted: ' : 'Not saved: ') + e.label }),
          h('p', { text: text }),
          h('div', { class: 'row' },
            again ? CH.ui.button('Try again', function () { tryAgain(e); }, 'main') : null,
            CH.ui.button('Dismiss', function () { app.tracker.dismiss(e); })));
      }));
    }

    async function tryAgain(e) {
      var rec = e.targetType === 'Notice' ? app.model.noticeById[e.targetId] : e.targetType === 'Register Entry' ? app.model.entryById[e.targetId]
        : e.targetType === 'Meeting' ? app.model.meetingById[e.targetId] : app.model.actionById[e.targetId];
      try {
        await app.tracker.retry(e, e.state === 'rejected' && rec && e.spec && e.spec.expectedRevision ? rec.revision : undefined);
      } catch (error) {
        CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info');
      }
      render(false);
    }

    // Every few minutes: is automatic processing still working (or working again)? Repaints only on a change.
    async function checkHealth() {
      if (disposed) return;
      try {
        var res = await app.sp.items(CH.config.lists.settings.title, CH.model.QUERIES.settings);
        var next = CH.health.judge(res.rows, new Date());
        var changed = !app.health || next.processing !== app.health.processing || next.reminders !== app.health.reminders;
        app.health = next;
        if (changed) render(false);
      } catch (_) { /* the next check tries again */ }
    }

    // ---- a meeting used before its booking is saved (release 1.2). It has a temporary (negative) number; what is
    // recorded meanwhile waits here, and when the flow has made the meeting and its record folder it is sent there,
    // under the real number, and a Start pressed meanwhile is sent too.
    app.meetingAlias = {};
    app.meetingBuffer = {};
    // ids: items added by hand before the booking was saved, by their temporary number -> the number SharePoint gave them
    function retarget(values, from, to, ids) {
      var v = Object.assign({}, values, { MeetingId: to });
      delete v.Id;
      if (v.RecordKey && String(v.RecordKey).indexOf(from + '|') === 0) v.RecordKey = to + String(v.RecordKey).slice(String(from).length);
      if (v.SourceType === 'New Business' && v.RowType === 'Outcome' && ids[v.SourceId]) {
        v.SourceId = ids[v.SourceId];
        v.RecordKey = to + '|O|New Business|' + v.SourceId;
      }
      return v;
    }
    async function meetingBooked(entry) {
      var tmp = -entry.tempId;
      var real = Number(entry.resultId);
      var mt = real && app.model.meetingById[real];
      if (!mt) return;
      app.meetingAlias[tmp] = real;
      if (entry.startNow) {
        try {
          await app.tracker.submit({ type: 'StartMeeting', targetId: real, targetType: 'Meeting', expectedRevision: mt.revision, payload: {},
            label: 'Start the ' + mt.areaName + ' meeting' });
        } catch (_) { CH.ui.toast(app.root, 'The meeting could not be started just now. Open it and press Start meeting again.', 'info'); }
      }
      flush(mt, tmp, real);
    }
    async function flush(mt, tmp, real) {
      var rows = app.meetingBuffer[tmp] || [];
      delete app.meetingBuffer[tmp];
      var ids = {};
      for (var i = 0; i < rows.length; i++) {
        try {
          var made = await app.sp.addToFolder('meetingItems', mt.areaKey + '/MTG-' + real + '/Record', retarget(rows[i], tmp, real, ids));
          if (rows[i].RowType === 'New Business' && made) ids[rows[i].Id] = made;
        } catch (_) { CH.ui.toast(app.root, 'Part of what was recorded before the booking was saved could not be sent. Check the meeting and record it again.', 'info'); }
      }
      if (rows.length && app.panel) app.panel.refresh();
    }
    // A Start pressed on a meeting whose booking is still being saved: shown at once, sent when it is booked.
    app.startWhenBooked = function (mt) {
      var e = app.tracker.entries().filter(function (x) { return x.key === mt.sending; })[0];
      if (!e) return false;
      e.startNow = true;
      rebuild();
      render(false);
      return true;
    };

    // The lists a saved change can alter (release 1.2: only these are read again). Health comes with the settings.
    function listsFor(type) {
      if (CH.requests.RECORD_TYPES.indexOf(type) >= 0) return ['notices', 'register', 'actions', 'settings'];
      if (CH.requests.MEETING_TYPES.indexOf(type) >= 0) return ['meetings', 'actions', 'settings'];
      return ['actions', 'settings'];
    }

    function onRequestChange(entry) {
      if (CH.requests.ADMIN_TYPES.indexOf(entry.type) >= 0) {
        // a saved setting is read again, so the page shows the new value and uses it (DueSoonDays, MaxDeadlineYears)
        if (entry.type === 'UpdateSetting' && entry.state === 'done') { reload().then(function () { render(false); }).catch(function () { render(false); }); return; }
        if (['SetKnownAs', 'AddPerson', 'UpdatePerson', 'PersonLeft', 'ReactivatePerson'].indexOf(entry.type) >= 0 && entry.state === 'done') {
          reloadPeople().then(function () { render(false); }).catch(function () { render(false); });
          return;
        }
        render(false);
        if (entry.state === 'done' && app.state.view === 'admin') setTimeout(function () { CH.views.admin.refresh(app); }, 1500);
        return;
      }
      if (entry.state !== 'done') {
        rebuild();
        render(false);
        if (app.panel) app.panel.refresh();
        return;
      }
      reload(listsFor(entry.type)).then(async function () {
        // a meeting started before its booking was saved is started now, before the screen shows it as booked
        if (entry.type === 'ScheduleMeeting' && entry.tempId) await meetingBooked(entry);
        render(false);
        if (app.panel) app.panel.refresh();
        var a = app.model.actionById[entry.resultId];
        var e = app.model.entryById[entry.resultId];
        // a new record gets its number now; other changes just show ✓✓ Saved where they are (and are told to screen readers)
        if (entry.type === 'RaiseAction' && a) CH.ui.toast(app.root, a.ref + ' raised: ' + a.title + '.', 'ok');
        else if (entry.type === 'RaiseRegisterEntry' && e) CH.ui.toast(app.root, e.ref + ' raised: ' + e.title + '.', 'ok');
        CH.ui.say(app.root, 'Saved: ' + entry.label + '. ' + entry.message);
      }).catch(function () { CH.ui.toast(app.root, entry.message + ' Reload the page to see it.', 'ok'); });
    }

    function stateScreen(title, message, detail) {
      paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
        detail ? h('p', { class: 'muted small', text: detail }) : null));
    }

    app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
    app.showAdmin = function () { app.admin = null; app.feedback = null; app.state = { view: 'admin', area: null, tab: 0 }; render(true); };
    app.showDashboard = function () { app.dash = null; app.state = { view: 'manage', area: null, tab: 0 }; render(true); };
    app.refreshView = function (moveFocus) { render(!!moveFocus); };
    // Opens an area in place on the home page (key), or closes it (null). Focus stays with the area's tile.
    app.openAreaHere = function (key) {
      var was = app.state.homeArea;
      app.state = { view: 'home', area: null, tab: 0, homeArea: key || null };
      render(false);
      var tile = app.root.querySelector('.hm-tile[data-area="' + (key || was || '') + '"]');
      if (tile) tile.focus();
    };
    // True while automatic processing is down: queued changes are not offered and not sent.
    app.queueBlocked = function () { return !!app.health && app.health.processing === 'down'; };
    // Notices and the register have their own flow (4 Records); it pauses with the queue, or on its own.
    app.recordsBlocked = function () { return app.queueBlocked() || (!!app.health && app.health.records === 'down'); };
    // Meetings have their own flow too (5 Meetings).
    app.meetingsBlocked = function () { return app.queueBlocked() || (!!app.health && app.health.meetings === 'down'); };
    app.openMeeting = function (mt) { CH.views.meetingPanel.open(app, mt.id); };
    // before go-live, what people add directly is marked as a test record (spec §7.4), as the flows mark theirs
    app.testMark = function () { return app.health && app.health.testing ? { IsTestRecord: '1' } : {}; };
    app.bookMeeting = function (key) { CH.views.meetingForm.open(app, key); };
    app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
    app.showMine = function (tab, areaKey, keepFocus) {
      app.state = { view: 'mine', area: null, tab: tab || 0, areaFilter: areaKey || '' };
      render(!keepFocus);
      if (keepFocus) { var t = app.root.querySelector('.subtabs [aria-selected="true"]'); if (t) t.focus(); }
    };
    app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
    app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
    app.raiseAction = function (key) {
      if (app.queueBlocked()) { CH.ui.toast(app.root, 'Raising actions is paused while changes can\'t be processed. Please try again later.', 'info'); return; }
      CH.views.raiseForm.open(app, key);
    };
    app.openAction = function (a) { CH.views.actionPanel.open(app, a.id); };
    app.openNotice = function (n) { CH.views.recordPanel.openNotice(app, n.id); };
    app.openEntry = function (e) { CH.views.recordPanel.openEntry(app, e.id); };
    app.raiseEntry = function (key) { CH.views.entryForm.open(app, key); };
    // The mark beside a record (release 1.2): ✓ Sent while it is being saved, ✓✓ Saved for three seconds (it then fades),
    // ✕ Not saved after a refusal or a fault. kind: 'Action', 'Notice', 'Register Entry' or 'Meeting'.
    app.mark = function (rec, kind) {
      if (!rec || !app.tracker) return null;
      if (rec.sending) return h('span', { class: 'mark sent', title: 'Sent – being saved', text: '✓ Sent' });
      var e = app.tracker.forRecord(rec.id, kind);
      var since = e && e.state === 'done' && e.doneAt ? Date.now() - e.doneAt : Infinity;
      if (since < 4000) {
        return h('span', { class: 'mark saved', title: 'Saved', text: '✓✓ Saved', style: 'animation-delay:' + Math.round(3000 - since) + 'ms' });
      }
      if (e && !e.dismissed && (e.state === 'rejected' || e.state === 'attention')) return h('span', { class: 'mark refused', text: '✕ Not saved' });
      if (rec.locked) return h('span', { class: 'mark sent', text: 'being updated' });
      return null;
    };
    app.markAction = function (a) { return app.mark(a, 'Action'); };
    // "Mark as done" straight from a to-do card; "Reopen" on a card just marked done, if it was a slip (release 1.2)
    app.quickDone = function (a) {
      return app.tracker.submit({ type: 'MarkComplete', targetId: a.id, expectedRevision: a.revision, payload: { note: '' }, label: 'Mark as done: ' + a.title })
        .catch(function (error) { CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info'); });
    };
    app.quickReopen = function (a) {
      return app.tracker.submit({ type: 'ReopenAction', targetId: a.id, expectedRevision: a.revision, payload: { reason: 'Reopened straight after it was marked as done.' },
        label: 'Reopen: ' + a.title }).catch(function (error) { CH.ui.toast(app.root, error.friendly || 'It could not be sent just now. Try again in a moment.', 'info'); });
    };
    // After an instant write (a flag): read the flags again and repaint, keeping any open panel.
    app.recordChanged = async function () {
      await reload(['updates']);
      render(false);
      if (app.panel) app.panel.refresh();
    };
    // keys: every noticeboard it was posted to (the first is where it is kept); all of them reads "every noticeboard"
    app.noticePosted = async function (key, keys) {
      await reload(['notices']);
      keys = keys && keys.length ? keys : [key];
      if (app.state.view === 'area' && keys.indexOf(app.state.area) >= 0) app.state.tab = 1;
      render(false);
      var names = keys.map(function (k) { return app.model.areaByKey[k].name; });
      var where = keys.length > 1 && keys.length === app.model.areas.length ? 'every noticeboard'
        : names.length === 1 ? 'the ' + names[0] + ' noticeboard'
        : 'the ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' noticeboards';
      CH.ui.toast(app.root, 'Your notice has been posted on ' + where + '.', 'ok');
    };

    function render(moveFocus) {
      if (!app.model) return;
      if (moveFocus && app.keep && Object.keys(app.keep).length) { app.keep = {}; rebuild(); }
      var content = [app.state.view === 'area' && app.model.areaByKey[app.state.area]
        ? CH.views.area.render(app, app.state.area, app.state.tab)
        : app.state.view === 'mine' ? CH.views.myActions.render(app)
        : app.state.view === 'manage' ? CH.views.dashboard.render(app)
        : app.state.view === 'admin' ? CH.views.admin.render(app) : CH.views.home.render(app)];
      paint(content);
      if (moveFocus) {
        var main = app.root.querySelector('#ch-main');
        if (main) main.focus();
        window.scrollTo(0, 0);
      }
    }

    function readPeople() {
      return app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,CanPostNotices,Status,KnownAs', null, ['KnownAs'])
        .then(function (res) { return res.rows; });
    }

    // People are read again after a change to them (a new name shows at once), then everything else.
    async function reloadPeople() {
      var people = await readPeople();
      var me = people.filter(function (p) { return Number(p.SiteUserId) === Number(app.person.SiteUserId); })[0];
      app.people = people;
      if (me) app.person = me;
      await reload();
    }

    // only: the lists to read again (release 1.2); everything when not given
    async function reload(only) {
      var raw = await CH.model.load(app.sp, only, app.raw);
      var now = new Date();
      var today = CH.dates.localDate(now);
      var memberships = (raw.members.rows || [])
        .filter(function (m) { return Number(m.PersonId) === Number(app.person.SiteUserId); })
        .map(function (m) {
          var c = (raw.competencies.rows || []).filter(function (x) { return x.Id === m.CompetencyId; })[0];
          return c ? { areaKey: c.CompetencyKey, canManageMeetings: !!m.CanManageMeetings } : null;
        }).filter(Boolean);
      var areasByKey = {};
      (raw.competencies.rows || []).forEach(function (c) { areasByKey[c.CompetencyKey] = { status: c.Status }; });
      if (raw.competencies.error !== undefined) throw new CH.sp.SpError(raw.competencies.error, 'The list of areas could not be loaded.');
      if (raw.members.error !== undefined) throw new CH.sp.SpError(raw.members.error, 'Area memberships could not be loaded.');
      app.access = CH.access.build(app.person, memberships, areasByKey);
      app.health = CH.health.judge(raw.settings.rows, now);
      app.settings = raw.settings.rows || [];
      // the "due soon" window an administrator sets (DueSoonDays, 1 to 30 days)
      var soon = (app.settings.filter(function (r) { return r.Title === 'DueSoonDays'; })[0] || {}).Value;
      CH.config.dueSoonDays = /^\d{1,2}$/.test(String(soon || '')) && Number(soon) >= 1 && Number(soon) <= 30 ? Number(soon) : 7;
      app.raw = raw;
      rebuild();
    }

    // The model from the rows last read plus every change still being saved (CH.optimistic). Actions closed on this
    // screen are kept, marked Done, until the person moves to another page.
    function rebuild() {
      if (!app.raw || !app.access) return;
      var now = new Date();
      var today = CH.dates.localDate(now);
      var entries = app.tracker ? app.tracker.entries() : [];
      app.keep = app.keep || {};
      var view = CH.optimistic.apply(app.raw, entries, app.keep, { personId: app.person.SiteUserId, today: today, now: now });
      entries.forEach(function (e) {
        var closing = e.type === 'MarkComplete' || e.type === 'CloseAction';
        if (closing && saving(e)) {
          var row = (view.actions.rows || []).filter(function (r) { return Number(r.Id) === Number(e.targetId); })[0];
          if (row && row.Status === 'Closed') app.keep[e.targetId] = Object.assign({}, row, { _sending: '' });
        }
        if (closing && ['rejected', 'attention', 'cancelled'].indexOf(e.state) >= 0) delete app.keep[e.targetId];
        if (e.type === 'ReopenAction' && e.state === 'done') delete app.keep[e.targetId];
      });
      app.model = CH.model.build(view, app.people, app.access, today, now);
    }

    async function start() {
      app.root = await waitForRoot();
      app.stale = staleCopy();
      watchSize();
      var webPart = ctx.getWebPart();
      if (!webPart || !webPart.spHttpClient || !webPart.pageContext || !webPart.pageContext.web) {
        throw new Error('Welcome did not provide a SharePoint connection.');
      }
      app.sp = CH.sp.create(webPart);
      stateScreen('Loading the Competency Hub…', 'Checking your access.');

      // Identity fails closed: any doubt shows a message, never operational data.
      var user, people;
      try {
        user = await app.sp.currentUser();
        people = await readPeople();
      } catch (error) {
        stateScreen('We could not confirm your access', CH.access.MESSAGES.UNAVAILABLE + ' Please reload the page. If this keeps happening, contact a Competency Hub administrator.',
          'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
        return;
      }
      var identity = CH.access.resolveIdentity(user, people);
      if (!identity.ok) {
        var admins = people.filter(function (p) { return p.IsAdministrator && p.Status === 'Active'; }).map(function (p) { return CH.names.of(p); });
        stateScreen('You do not have access yet', CH.access.MESSAGES[identity.reason] + ' ' +
          (admins.length ? 'Please contact ' + admins.join(' or ') + '.' : 'Please contact a Competency Hub administrator.'));
        return;
      }
      app.person = identity.person;
      app.loginName = user.LoginName || '';
      app.people = people;
      app.firstName = await app.sp.myFirstName();
      app.tracker = CH.requests.tracker(app, onRequestChange);
      try {
        await Promise.all([reload(), app.tracker.resume().catch(function () { return 0; })]);
        rebuild();   // the changes still being saved, read back with the requests, show again
      } catch (error) {
        stateScreen('The Competency Hub could not load', 'Some of the information could not be read. Please reload the page in a few minutes.',
          'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
        return;
      }
      var params = new URLSearchParams(window.location.search);
      var areaParam = (params.get('area') || '').toUpperCase();
      // ?area=KEY opens the area on the home page; ?view=area&area=KEY opens its full page.
      if (app.model.areaByKey[areaParam]) app.state = params.get('view') === 'area' ? { view: 'area', area: areaParam, tab: 0 } : { view: 'home', area: null, tab: 0, homeArea: areaParam };
      if (params.get('view') === 'mine') app.state = { view: 'mine', area: null, tab: 0, areaFilter: '' };
      if (params.get('view') === 'admin') app.state = { view: 'admin', area: null, tab: 0 };
      if (params.get('view') === 'manage' && app.access.isManagement) app.state = { view: 'manage', area: null, tab: 0 };
      healthTimer = setInterval(checkHealth, HEALTH_EVERY_MS);
      window.addEventListener('resize', fitToWindow);
      document.addEventListener('keydown', onKey);
      render(false);
      var actionParam = Number(params.get('action'));
      if (actionParam) CH.views.actionPanel.open(app, actionParam);
      else if (Number(params.get('notice'))) CH.views.recordPanel.openNotice(app, Number(params.get('notice')));
      else if (Number(params.get('entry'))) CH.views.recordPanel.openEntry(app, Number(params.get('entry')));
      else if (Number(params.get('meeting'))) CH.views.meetingPanel.open(app, Number(params.get('meeting')));
    }

    return {
      onInitialize: function () {
        if (started) return;
        started = true;
        start().catch(function (error) {
          var root = findRoot();
          if (root) {
            app.root = root;
            stateScreen('The Competency Hub could not start', 'Please reload the page. If this keeps happening, contact a Competency Hub administrator.', String(error && error.message || error));
          }
        });
      },
      onError: function (error) {
        if (window.console) console.error('Competency Hub: Welcome reported an error', error);
      },
      onDispose: function () {
        disposed = true;
        if (app.tracker) app.tracker.stop();
        if (healthTimer) clearInterval(healthTimer);
        if (observer) observer.disconnect();
        window.removeEventListener('resize', applySize);
        window.removeEventListener('resize', fitToWindow);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  return { create: create };
})();
