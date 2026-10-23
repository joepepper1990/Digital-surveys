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
        // Limited mode (spec REL-5): only the changes that need automatic processing are paused.
        app.queueBlocked() ? h('p', { class: 'stale-copy limited', role: 'alert' }, h('b', { text: 'Changes can\'t be processed at the moment. ' }),
          'You can still read everything, add updates to actions and post notices. Raising and changing actions will be back shortly – nothing you have already sent is lost.') : null,
        h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
          h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
          C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
          app.person && app.model ? nav() : null,
          app.person && app.model && app.state.view === 'home' ? homeButtons() : null,
          app.person ? h('span', { class: 'who', text: CH.names.display(app.person.Title, app.person.Email) + ' · ' + app.person.Role }) : null,
          textSizeControl())),
        h('main', { id: 'ch-main', tabindex: '-1' }, content),
        h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
        // the feedback button sits in its own place in the footer, so it never covers anything (spec FB-1)
        h('footer', null, h('span'), h('span', { text: 'ESG Competency Hub · version ' + C.VERSION }),
          h('span', { class: 'fb-slot' }, app.person && app.model ? CH.views.feedback.bubble(app) : null))
      ];
    }

    // Main pages, as pills in the bar. Only pages that exist are listed.
    function nav() {
      var v = app.state.view;
      var items = [['My week', v === 'home', app.goHome], ['My actions', v === 'mine', function () { app.showMine(0); }]];
      if (app.access && app.access.isManagement) items.push(['Management', v === 'manage', app.showDashboard]);
      if (app.access && app.access.isAdministrator) items.push(['Administration', v === 'admin', app.showAdmin]);
      return h('nav', { class: 'pills', 'aria-label': 'Main' }, items.map(function (x) {
        return h('button', { type: 'button', 'aria-current': x[1] ? 'page' : null, onclick: x[2], text: x[0] });
      }));
    }

    function homeButtons() {
      var acc = app.access;
      var first = acc.memberAreas[0] || (app.model.areas[0] && app.model.areas[0].key);
      return h('span', { class: 'bar-btns' },
        acc.canPostNotice(first) ? CH.ui.button('Post a notice', function () { app.postNotice(first); }) : null,
        acc.memberAreas.length || acc.isManagement ? CH.ui.button('Raise an action', function () { app.raiseAction(first); }, 'main') : null);
    }

    // On the home page the app fills the window exactly, so the page itself never scrolls. Small windows
    // (phones, or very short windows) keep ordinary scrolling.
    function fitToWindow() {
      if (!app.root || !app.root.style || !app.root.classList) return;
      var fit = app.state.view === 'home' && !!app.model && window.innerWidth > 900 && window.innerHeight > 560;
      app.root.classList.toggle('ch-fit', fit);
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
      app.root.style.setProperty('--text', String(CH.ui.textFactor(CH.ui.textSize())));
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

    function textSizeControl() {
      var current = CH.ui.textSize();
      return h('label', { class: 'textsize' }, 'Text size ',
        h('select', {
          'aria-label': 'Text size',
          onchange: function (e) { CH.ui.saveTextSize(e.target.value); applySize(); }
        }, CH.ui.TEXT_SIZES.map(function (t) {
          return h('option', t[0] === current ? { value: t[0], selected: 'selected' } : { value: t[0] }, t[0]);
        })));
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

    // Raised actions being recorded, changes that were not accepted, and requests that never left the browser.
    function requestStrip() {
      if (!app.tracker) return null;
      var items = app.tracker.entries().filter(function (e) {
        if (e.dismissed) return false;
        if (CH.requests.ADMIN_TYPES.indexOf(e.type) >= 0) return false;   // shown on the Administration page
        if (e.type === 'RaiseAction' || e.type === 'RaiseRegisterEntry') return e.state !== 'done';
        return ['rejected', 'attention', 'cancelled', 'reverted'].indexOf(e.state) >= 0;
      }).map(function (e) {
        var waiting = e.state === 'submitted' || e.state === 'slow';
        var how = { rejected: 'not accepted: ', attention: 'not recorded: ', cancelled: 'cancelled: ', reverted: 'reverted: ' }[e.state];
        return h('li', { class: waiting ? 'pending' : 'section-note' }, h('b', { text: e.label }),
          waiting ? ' – submitted ' + CH.dates.ukTime(e.submittedAt) + (e.retrying ? '. ' + e.message
            : (e.processing ? ', being recorded now.' : ', waiting to be recorded (usually under 5 minutes).') + (e.state === 'slow' ? ' ' + e.message : ''))
            : ' – ' + how + e.message + ' ',
          waiting ? null : CH.ui.linkButton('Dismiss', function () { app.tracker.dismiss(e); }));
      });
      var unsent = app.tracker.unsent();
      if (unsent.length) {
        items.push(h('li', { class: 'section-note' }, h('b', { text: unsent.length === 1 ? '1 change was not sent. ' : unsent.length + ' changes were not sent. ' }),
          'Your connection dropped before it reached SharePoint. ', CH.ui.linkButton('Send again', async function () {
            try { await app.tracker.resend(); render(false); } catch (_) { CH.ui.toast(app.root, 'Still could not send. Try again in a moment.', 'info'); }
          })));
      }
      return items.length ? h('ul', { class: 'request-strip', 'aria-live': 'polite' }, items) : null;
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

    function onRequestChange(entry) {
      if (CH.requests.ADMIN_TYPES.indexOf(entry.type) >= 0) {
        // a saved setting is read again, so the page shows the new value and uses it (DueSoonDays, MaxDeadlineYears)
        if (entry.type === 'UpdateSetting' && entry.state === 'done') { reload().then(function () { render(false); }).catch(function () { render(false); }); return; }
        render(false);
        if (entry.state === 'done' && app.state.view === 'admin') setTimeout(function () { CH.views.admin.refresh(app); }, 1500);
        return;
      }
      if (entry.state !== 'done') { render(false); if (app.panel) app.panel.refresh(); return; }
      reload().then(function () {
        render(false);
        if (app.panel) app.panel.refresh();
        var a = app.model.actionById[entry.resultId];
        var e = app.model.entryById[entry.resultId];
        CH.ui.toast(app.root, entry.type === 'RaiseAction' && a ? a.ref + ' raised: ' + a.title + '.'
          : entry.type === 'RaiseRegisterEntry' && e ? e.ref + ' raised: ' + e.title + '.' : entry.message, 'ok');
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
    // "being recorded" and the like for a notice or entry in a list (kind: 'Notice' or 'Register Entry')
    app.recordNote = function (kind, id) {
      var e = app.tracker && app.tracker.forTarget(id, kind);
      if (e && (e.state === 'submitted' || e.state === 'slow')) return 'change being recorded';
      if (e && e.state === 'rejected') return 'change not accepted';
      if (e && e.state === 'attention') return 'change not recorded';
      return '';
    };
    // After an instant write (a flag, a comment): read the lists again and repaint, keeping any open panel.
    app.recordChanged = async function () {
      await reload();
      render(false);
      if (app.panel) app.panel.refresh();
    };
    app.pendingNote = function (a) {
      var e = app.tracker && app.tracker.forTarget(a.id);
      if (e && (e.state === 'submitted' || e.state === 'slow')) return 'change being recorded';
      if (e && e.state === 'rejected') return 'change not accepted';
      if (e && e.state === 'attention') return 'change not recorded';
      return a.locked ? 'being updated' : '';
    };
    app.noticePosted = async function (key) {
      await reload();
      if (app.state.view === 'area' && app.state.area === key) app.state.tab = 1;
      render(false);
      CH.ui.toast(app.root, 'Your notice has been posted on the ' + app.model.areaByKey[key].name + ' noticeboard.', 'ok');
    };

    function render(moveFocus) {
      if (!app.model) return;
      var content = [requestStrip(), app.state.view === 'area' && app.model.areaByKey[app.state.area]
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

    async function reload() {
      var raw = await CH.model.load(app.sp);
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
      app.model = CH.model.build(raw, app.people, app.access, today, now);
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
        people = (await app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,CanPostNotices,Status')).rows;
      } catch (error) {
        stateScreen('We could not confirm your access', CH.access.MESSAGES.UNAVAILABLE + ' Please reload the page. If this keeps happening, contact a Competency Hub administrator.',
          'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
        return;
      }
      var identity = CH.access.resolveIdentity(user, people);
      if (!identity.ok) {
        var admins = people.filter(function (p) { return p.IsAdministrator && p.Status === 'Active'; }).map(function (p) { return p.Title; });
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
