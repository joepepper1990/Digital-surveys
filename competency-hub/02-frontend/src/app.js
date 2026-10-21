// Application controller: Welcome lifecycle, identity, loading and navigation.
CH.app = (function () {
  var h = CH.dom.h;

  function create(ctx) {
    var started = false;
    var disposed = false;
    var observer = null;
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
          app.person ? h('span', { class: 'who', text: app.person.Title + ' · ' + app.person.Role }) : null,
          textSizeControl())),
        h('main', { id: 'ch-main', tabindex: '-1' }, content),
        h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
        h('footer', { text: 'ESG Competency Hub · version ' + C.VERSION })
      ];
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
    }

    // Raised actions being recorded, changes that were not accepted, and requests that never left the browser.
    function requestStrip() {
      if (!app.tracker) return null;
      var items = app.tracker.entries().filter(function (e) {
        if (e.dismissed) return false;
        if (e.type === 'RaiseAction') return e.state !== 'done';
        return e.state === 'rejected' || e.state === 'failed';
      }).map(function (e) {
        var waiting = e.state === 'submitted' || e.state === 'slow';
        return h('li', { class: waiting ? 'pending' : 'section-note' }, h('b', { text: e.label }),
          waiting ? ' – submitted ' + CH.dates.ukTime(e.submittedAt) + ', being recorded (usually under 5 minutes).' + (e.state === 'slow' ? ' ' + e.message : '')
            : ' – ' + (e.state === 'rejected' ? 'not accepted: ' : 'not recorded yet: ') + e.message + ' ',
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

    function onRequestChange(entry) {
      if (entry.state !== 'done') { render(false); if (app.panel) app.panel.refresh(); return; }
      reload().then(function () {
        render(false);
        if (app.panel) app.panel.refresh();
        var a = app.model.actionById[entry.resultId];
        CH.ui.toast(app.root, entry.type === 'RaiseAction' && a ? a.ref + ' raised: ' + a.title + '.' : entry.message, 'ok');
      }).catch(function () { CH.ui.toast(app.root, entry.message + ' Reload the page to see it.', 'ok'); });
    }

    function stateScreen(title, message, detail) {
      paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
        detail ? h('p', { class: 'muted small', text: detail }) : null));
    }

    app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
    app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
    app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
    app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
    app.raiseAction = function (key) { CH.views.raiseForm.open(app, key); };
    app.openAction = function (a) { CH.views.actionPanel.open(app, a.id); };
    app.pendingNote = function (a) {
      var e = app.tracker && app.tracker.forTarget(a.id);
      if (e && (e.state === 'submitted' || e.state === 'slow')) return 'change being recorded';
      if (e && e.state === 'rejected') return 'change not accepted';
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
        : CH.views.home.render(app)];
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
        people = (await app.sp.items(CH.config.lists.people.title, '$select=Id,Title,SiteUserId,Email,Role,IsAdministrator,Status')).rows;
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
      if (app.model.areaByKey[areaParam]) app.state = { view: 'area', area: areaParam, tab: 0 };
      render(false);
      var actionParam = Number(params.get('action'));
      if (actionParam) CH.views.actionPanel.open(app, actionParam);
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
        if (observer) observer.disconnect();
        window.removeEventListener('resize', applySize);
      }
    };
  }

  return { create: create };
})();
