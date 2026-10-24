// Administration → People (spec ADM-1 to ADM-3, ADM-6). Administrators add people, and for each person set the
// role, the areas (tick boxes), "Can run meetings" in each area, an optional end date, notice posting and the
// administrator flag – or mark them as left. Every change is one queued request, checked again by the
// Administration flow, which narrows access first and reads each group back. Nobody can change their own access.
CH.views = CH.views || {};
CH.views.people = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;
  var ROLES = ['Technician', 'Engineer', 'Team Leader', 'Group Head'];

  function rowsFor(app) {
    var q = String((app.peopleFilter || '')).trim().toLowerCase();
    return (app.people || []).filter(function (p) { return !q || String(p.Title).toLowerCase().indexOf(q) >= 0 || String(p.Email || '').toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (a.Status === b.Status ? 0 : a.Status === 'Active' ? -1 : 1) || String(a.Title).localeCompare(String(b.Title)); });
  }

  function areasOf(app, siteUserId) {
    return app.model.areas.filter(function (a) { return (app.model.membersByArea[a.key] || {})[siteUserId]; }).map(function (a) { return a.key; });
  }

  function list(app) {
    var search = h('input', { type: 'search', id: 'ch-p-search', placeholder: 'Find a person', 'aria-label': 'Find a person', value: app.peopleFilter || '',
      oninput: function (e) { app.peopleFilter = e.target.value; var box = app.root.querySelector('.people-list'); if (box) { CH.dom.clear(box); CH.dom.append(box, items(app)); } } });
    return [
      h('div', { class: 'row' }, search, ui.button('Add people', function () { addDialog(app); }, 'main')),
      h('ul', { class: 'items people-list' }, items(app))
    ];
  }

  function items(app) {
    var rows = rowsFor(app);
    if (!rows.length) return h('li', { class: 'muted', text: 'Nobody matches.' });
    return rows.map(function (p) {
      var areas = areasOf(app, p.SiteUserId);
      var notes = [p.Role, areas.length ? areas.length + (areas.length === 1 ? ' area' : ' areas') : (CH.config.managementRoles.indexOf(p.Role) >= 0 ? 'all areas' : 'no areas')];
      if (p.IsAdministrator) notes.push('administrator');
      if (p.CanPostNotices === false) notes.push('cannot post notices');
      return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { personDialog(app, p); } },
        h('span', null, h('span', { class: 't', text: p.Title }), h('span', { class: 's', text: notes.join(' · ') })),
        p.Status === 'Active' ? null : ui.chip('later', 'Left')));
    });
  }

  // The areas table shared by "Add people" and a person's page: member, can run meetings, ends on.
  function areaTable(app, prefix, current, role) {
    var rows = app.model.areas.filter(function (a) { return a.status === 'Active'; }).map(function (a) {
      var cur = current[a.key] || null;
      var member = h('input', { type: 'checkbox', id: prefix + a.key + '-m', checked: cur ? true : null, 'aria-label': 'Member of ' + a.name });
      var chair = h('input', { type: 'checkbox', id: prefix + a.key + '-c', checked: cur && cur.chair ? true : null, 'aria-label': 'Can run meetings in ' + a.name });
      var ends = h('input', { type: 'date', id: prefix + a.key + '-e', value: cur && cur.expires ? cur.expires : '', min: app.model.today, 'aria-label': 'Access to ' + a.name + ' ends on' });
      function sync() { chair.disabled = !member.checked; ends.disabled = !member.checked; if (!member.checked) { chair.checked = false; ends.value = ''; } }
      // engineers run their areas' meetings by default (plan E.1); an administrator can change it
      member.addEventListener('change', function () { if (member.checked && role() === 'Engineer') chair.checked = true; sync(); });
      sync();
      return { key: a.key, tr: h('tr', null, h('th', { scope: 'row', text: a.name }), h('td', null, member), h('td', null, chair), h('td', null, ends)),
        value: function () { return member.checked ? { key: a.key, chair: chair.checked, expires: ends.value || '' } : null; } };
    });
    var table = h('table', { class: 'area-table' }, h('thead', null, h('tr', null, h('th', { text: 'Area' }), h('th', { text: 'Member' }),
      h('th', { text: 'Can run meetings' }), h('th', { text: 'Access ends (optional)' }))), h('tbody', null, rows.map(function (r) { return r.tr; })));
    return { node: table, value: function () { return rows.map(function (r) { return r.value(); }).filter(Boolean); } };
  }

  function sendAndShow(app, box, spec) {
    CH.dom.clear(box);
    box.appendChild(h('p', { class: 'pending', role: 'status', text: 'Sent – being recorded (usually under 5 minutes).' }));
    return app.tracker.submit(spec).then(function (entry) { watch(app, box, entry); return entry; }, function (error) {
      CH.dom.clear(box);
      box.appendChild(h('p', { class: 'field-error', role: 'alert', text: error.friendly || 'Could not send that just now. Try again in a moment.' }));
    });
  }

  // Shows the outcome of one request when it settles: verified, or not done and why.
  function watch(app, box, entry) {
    (function check() {
      if (!box.isConnected) return;
      if (entry.state === 'submitted' || entry.state === 'slow') { setTimeout(check, 1000); return; }
      CH.dom.clear(box);
      box.appendChild(h('p', { class: entry.state === 'done' ? 'ok-note' : 'section-note', role: 'status',
        text: (entry.state === 'done' ? 'Done and verified: ' : 'Not done: ') + entry.message }));
    })();
  }

  function addDialog(app) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-pa', title: 'Add people', wide: true });
    var email = h('input', { id: 'ch-pa-email', type: 'email', autocomplete: 'off' });
    var role = h('select', { id: 'ch-pa-role' }, ROLES.map(function (r) { return h('option', { value: r, text: r }); }));
    var posts = h('input', { id: 'ch-pa-posts', type: 'checkbox', checked: true });
    var areas = areaTable(app, 'ch-pa-', {}, function () { return role.value; });
    var result = h('div', { class: 'result' });
    var paste = h('textarea', { id: 'ch-pa-list', rows: '8', placeholder: 'firstname.lastname@edf-energy.com, Technician, GRS RP' });
    var pasteResult = h('ul', { class: 'plain result' });
    CH.dom.append(dlg.body, [
      h('h3', { text: 'One person' }),
      CH.ui.dialog.field('Email address', email, 'Their work email, as in Outlook.'),
      CH.ui.dialog.field('Role', role),
      areas.node,
      h('label', { class: 'check' }, posts, ' Can post notices'),
      h('div', { class: 'row' }, ui.button('Add this person', function () {
        var v = email.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { CH.dom.clear(result); result.appendChild(h('p', { class: 'field-error', text: 'Enter their email address.' })); email.focus(); return; }
        sendAndShow(app, result, { type: 'AddPerson', payload: { email: v, role: role.value, areas: areas.value(), canPostNotices: posts.checked }, label: 'Add ' + v });
      }, 'main')),
      result,
      h('h3', { text: 'Or paste a list' }),
      h('p', { class: 'muted small', text: 'One person a line: email, role, then the area keys separated by spaces (for example FLK GRS RP). Engineers run their areas\' meetings; change that afterwards on their page.' }),
      CH.ui.dialog.field('People', paste),
      h('div', { class: 'row' }, ui.button('Add everyone in the list', function () {
        CH.dom.clear(pasteResult);
        parseList(app, paste.value).forEach(function (line) {
          var li = h('li', null, h('b', { text: line.email || line.text }), ' ');
          var box = h('span');
          li.appendChild(box);
          pasteResult.appendChild(li);
          if (line.error) { box.appendChild(h('span', { class: 'field-error', text: line.error })); return; }
          sendAndShow(app, box, { type: 'AddPerson', label: 'Add ' + line.email,
            payload: { email: line.email, role: line.role, canPostNotices: true, areas: line.keys.map(function (k) { return { key: k, chair: line.role === 'Engineer', expires: '' }; }) } });
        });
      })),
      pasteResult
    ]);
    dlg.focusFirst();
  }

  // "email, role, KEY KEY" lines, checked before anything is sent.
  function parseList(app, text) {
    var keys = app.model.areas.map(function (a) { return a.key; });
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; }).map(function (l) {
      var parts = l.split(',').map(function (p) { return p.trim(); });
      var out = { text: l, email: (parts[0] || '').toLowerCase(), role: parts[1] || '', keys: (parts[2] || '').split(/\s+/).filter(Boolean).map(function (k) { return k.toUpperCase(); }) };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) out.error = 'Not an email address.';
      else if (ROLES.indexOf(out.role) < 0) out.error = 'The role must be Technician, Engineer, Team Leader or Group Head.';
      else if (out.keys.some(function (k) { return keys.indexOf(k) < 0; })) out.error = 'Unknown area: ' + out.keys.filter(function (k) { return keys.indexOf(k) < 0; }).join(', ') + '.';
      return out;
    });
  }

  async function personDialog(app, p) {
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-pp', title: p.Title, wide: true });
    dlg.body.appendChild(h('p', { class: 'muted', text: 'Loading…' }));
    var memberships = [], history = [];
    try {
      memberships = (await app.sp.items(CH.config.lists.members.title, '$select=Id,CompetencyId,CanManageMeetings,AccessExpires,Status&$filter=PersonId eq ' + Number(p.SiteUserId), 100)).rows;
      history = (await app.sp.items(CH.config.lists.history.title, "$select=Id,Title,EventType,ActorId,EventTime,Created&$filter=RecordId eq " + Number(p.Id) + " and RecordType eq 'Person'", 200)).rows;
    } catch (_) { /* shown below as unavailable */ }
    CH.dom.clear(dlg.body);
    var current = {};
    memberships.filter(function (m) { return m.Status === 'Active'; }).forEach(function (m) {
      var area = app.model.areas.filter(function (a) { return a.id === m.CompetencyId; })[0];
      if (area) current[area.key] = { chair: !!m.CanManageMeetings, expires: m.AccessExpires ? D.localDate(m.AccessExpires) : '' };
    });
    var self = Number(p.SiteUserId) === Number(app.person.SiteUserId);
    var left = p.Status !== 'Active';
    var role = h('select', { id: 'ch-pp-role' }, ROLES.map(function (r) { return h('option', { value: r, text: r, selected: r === p.Role ? true : null }); }));
    var areas = areaTable(app, 'ch-pp-', current, function () { return role.value; });
    var posts = h('input', { id: 'ch-pp-posts', type: 'checkbox', checked: p.CanPostNotices === false ? null : true });
    var admin = h('input', { id: 'ch-pp-admin', type: 'checkbox', checked: p.IsAdministrator ? true : null });
    var result = h('div', { class: 'result' });
    var note = self ? h('p', { class: 'section-note', text: 'You can\'t change your own access. Ask another administrator.' })
      : left ? h('p', { class: 'section-note', text: p.Title + ' is marked as having left. Reactivate them to give them access again, then choose their areas.' }) : null;
    CH.dom.append(dlg.body, [
      h('p', { class: 'muted small', text: (p.Email || '') + (CH.config.managementRoles.indexOf(p.Role) >= 0 ? ' · Team Leaders and the Group Head work in every area through their role.' : '') }),
      note,
      left ? null : [
        CH.ui.dialog.field('Role', role),
        h('h3', { text: 'Areas' }), areas.node,
        h('h3', { text: 'Noticeboard and administration' }),
        h('label', { class: 'check' }, posts, ' Can post notices'),
        h('label', { class: 'check' }, admin, ' Competency Hub administrator')
      ],
      h('div', { class: 'row actions-row' },
        left ? ui.button('Reactivate', function () {
          sendAndShow(app, result, { type: 'ReactivatePerson', payload: { personId: p.SiteUserId }, label: 'Reactivate ' + p.Title });
        }, 'main') : [
          ui.button('Save changes', function () {
            sendAndShow(app, result, { type: 'UpdatePerson', label: 'Change access for ' + p.Title,
              payload: { personId: p.SiteUserId, role: role.value, areas: areas.value(), canPostNotices: posts.checked, administrator: admin.checked } });
          }, 'main'),
          ui.button('Mark as left', function () {
            CH.dom.clear(result);
            CH.dom.append(result, [h('span', { text: p.Title + ' will lose all access to the Hub. Their records and history stay. ' }),
              ui.button('Yes, mark as left', function () {
                sendAndShow(app, result, { type: 'PersonLeft', payload: { personId: p.SiteUserId }, label: p.Title + ' has left' });
              }), ui.linkButton('No', function () { CH.dom.clear(result); })]);
          })
        ]),
      result,
      h('h3', { class: 'group-title', text: 'Change history' }),
      history.length ? h('ul', { class: 'plain' }, history.sort(function (a, b) { return b.Id - a.Id; }).map(function (e) {
        return h('li', null, h('span', null, h('span', { text: e.Title }), h('br'),
          h('span', { class: 'muted small', text: app.model.nameOf(e.ActorId) + ' · ' + D.short(D.localDate(e.EventTime || e.Created)) + ' ' + D.ukTime(e.EventTime || e.Created) })));
      })) : h('p', { class: 'muted', text: 'No changes recorded yet.' })
    ]);
    if (self) Array.prototype.forEach.call(dlg.body.querySelectorAll('input, select, .actions-row .btn'), function (n) { n.disabled = true; });
    dlg.focusFirst();
  }

  return { list: list, parseList: parseList, personDialog: personDialog };
})();
