// Application controller: Welcome lifecycle, identity, loading and navigation.
CH.app = (function () {
  var h = CH.dom.h;

  function create(ctx) {
    var started = false;
    var disposed = false;
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

    function frame(content) {
      var C = CH.config;
      return [
        h('header', { class: 'bar' }, h('div', { class: 'bar-in' },
          h('div', { class: 'brand' }, 'ESG Competency Hub', h('small', { text: 'Environmental Safety Group' })),
          C.ENVIRONMENT !== 'PRODUCTION' ? h('span', { class: 'env', text: C.ENVIRONMENT + ' – not live data' }) : null,
          app.person ? h('span', { class: 'who', text: app.person.Title + ' · ' + app.person.Role }) : null)),
        h('main', { id: 'ch-main', tabindex: '-1' }, content),
        h('p', { class: 'toast', 'data-ch-live': true, role: 'status', 'aria-live': 'polite' }),
        h('footer', { text: 'ESG Competency Hub · version ' + C.VERSION })
      ];
    }

    function paint(content) {
      if (disposed) return;
      CH.dom.clear(app.root);
      CH.dom.append(app.root, frame(content));
    }

    function stateScreen(title, message, detail) {
      paint(h('section', { class: 'card state-card' }, h('h1', { text: title }), h('p', { text: message }),
        detail ? h('p', { class: 'muted small', text: detail }) : null));
    }

    app.goHome = function () { app.state = { view: 'home', area: null, tab: 0 }; render(true); };
    app.openArea = function (key) { app.state = { view: 'area', area: key, tab: 0 }; render(true); };
    app.comingSoon = function (what) { CH.ui.toast(app.root, what + ' will be available in the next version of the Competency Hub.', 'info'); };
    app.postNotice = function (key) { CH.views.noticeForm.open(app, key); };
    app.noticePosted = async function (key) {
      await reload();
      if (app.state.view === 'area' && app.state.area === key) app.state.tab = 1;
      render(false);
      CH.ui.toast(app.root, 'Your notice has been posted on the ' + app.model.areaByKey[key].name + ' noticeboard.', 'ok');
    };

    function render(moveFocus) {
      if (!app.model) return;
      var content = app.state.view === 'area' && app.model.areaByKey[app.state.area]
        ? CH.views.area.render(app, app.state.area, app.state.tab)
        : CH.views.home.render(app);
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
      try {
        await reload();
      } catch (error) {
        stateScreen('The Competency Hub could not load', 'Some of the information could not be read. Please reload the page in a few minutes.',
          'Details for the administrator: ' + (error.status ? 'HTTP ' + error.status : error.message));
        return;
      }
      var params = new URLSearchParams(window.location.search);
      var areaParam = (params.get('area') || '').toUpperCase();
      if (app.model.areaByKey[areaParam]) app.state = { view: 'area', area: areaParam, tab: 0 };
      render(false);
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
      onDispose: function () { disposed = true; }
    };
  }

  return { create: create };
})();
