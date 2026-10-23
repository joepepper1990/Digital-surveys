// "Raise an action": a three-step guided form (plan C.9), then a summary. The action is created by the
// request flow; until then the request shows as being recorded.
CH.views = CH.views || {};
CH.views.raiseForm = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
  var STEPS = [
    { title: 'What needs doing?', keys: ['title', 'description'] },
    { title: 'Who will do it, and in which area?', keys: ['areaKey', 'ownerId'] },
    { title: 'By when?', keys: ['dueIso', 'priority'] },
    { title: 'Check and raise', keys: [] }
  ];

  function open(app, areaKey) {
    var m = app.model;
    var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key); });
    if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise actions.', 'info'); return; }
    var today = m.today;
    // the limit an administrator sets (MaxDeadlineYears), the same one the flow checks
    var maxYears = (app.health && app.health.maxDeadlineYears) || CH.config.maxDeadlineYears;
    var step = 0;
    var key = CH.requests.newKey();

    var title = h('input', { id: 'ch-r-title', type: 'text', maxlength: '255', autocomplete: 'off' });
    var description = h('textarea', { id: 'ch-r-description', rows: '5', maxlength: '5000' });
    var area = h('select', { id: 'ch-r-areaKey' }, mine.map(function (a) {
      return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name });
    }));
    var owner = h('select', { id: 'ch-r-ownerId' });
    var due = h('input', { id: 'ch-r-dueIso', type: 'date', min: today, max: R.addYears(today, maxYears) });
    var priority = h('select', { id: 'ch-r-priority' }, R.PRIORITIES.map(function (p) { return h('option', { value: p, selected: p === 'Normal' ? true : null, text: p }); }));
    var closeOut = h('input', { id: 'ch-r-closeOut', type: 'checkbox' });
    var closeOutTouched = false;
    closeOut.addEventListener('change', function () { closeOutTouched = true; });
    priority.addEventListener('change', function () { if (!closeOutTouched) closeOut.checked = priority.value === 'High'; });

    var selfNote = h('p', { class: 'explain', id: 'ch-r-self-only', text: 'As a technician you can raise actions for yourself in this area. An engineer, or someone who runs meetings in this area, can raise them for someone else.' });
    function fillOwners() {
      var current = owner.value || String(app.person.SiteUserId);
      CH.dom.clear(owner);
      owner.appendChild(h('option', { value: '', text: 'Choose a person' }));
      // a technician without meeting rights in this area is offered only themselves (spec §4.2)
      m.ownersFor(area.value).filter(function (p) { return app.access.canRaiseFor(area.value, p.id, app.person.SiteUserId); }).forEach(function (p) {
        owner.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
          text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') + (CH.config.managementRoles.indexOf(p.role) >= 0 ? ' – ' + p.role : '') }));
      });
      var selfOnly = !app.access.canRaiseFor(area.value, -1, app.person.SiteUserId) && app.access.canWrite(area.value);
      selfNote.style.display = selfOnly ? '' : 'none';
      if (selfOnly) { owner.removeChild(owner.firstChild); owner.value = String(app.person.SiteUserId); }
    }
    area.addEventListener('change', fillOwners);
    fillOwners();

    function values() {
      return { title: title.value, description: description.value, areaKey: area.value, ownerId: owner.value,
        dueIso: due.value, priority: priority.value, requiresCloseOut: closeOut.checked };
    }
    function errorsFor(keys) {
      var all = R.validateRaise(values(), {
        today: today, maxYears: maxYears, canWrite: app.access.canWrite,
        canRaiseFor: function (k, id) { return app.access.canRaiseFor(k, id, app.person.SiteUserId); },
        ownerAllowed: function (k, id) { return m.ownersFor(k).some(function (p) { return Number(p.id) === id; }); }
      });
      var out = {};
      keys.forEach(function (k) { if (all[k]) out[k] = all[k]; });
      return out;
    }

    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-r', title: 'Raise an action' });
    var progress = h('p', { class: 'muted small', 'aria-live': 'polite' });
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var stepBox = h('div');
    var nextBtn = h('button', { type: 'submit', class: 'btn btn-main' });
    var backBtn = h('button', { type: 'button', class: 'btn' });
    var form = h('form', { class: 'dialog-body', novalidate: true }, progress, stepBox, errorBox, h('div', { class: 'row' }, nextBtn, backBtn));
    dlg.body.appendChild(form);

    var panes = [
      [field('Title', title, 'A short summary, for example "Replace FH40 probe".'), field('Description', description, 'What needs doing and anything the owner should know.')],
      [field('Area', area), field('Who will do it?', owner, 'Members of the area, and Team Leaders and the Group Head.'), selfNote],
      [field('Target date', due, 'From today up to ' + maxYears + (maxYears === 1 ? ' year' : ' years') + ' ahead.'),
        h('details', { class: 'more' }, h('summary', { text: 'More options' }),
          field('Priority', priority), h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'))],
      null
    ];

    function summary() {
      var v = values();
      var ownerName = m.nameOf(Number(v.ownerId));
      return h('dl', { class: 'facts' },
        h('dt', { text: 'What' }), h('dd', null, h('b', { text: v.title.trim() }), h('br'), h('span', { class: 'notice-body', text: v.description.trim() })),
        h('dt', { text: 'Who' }), h('dd', { text: ownerName + ', in ' + m.areaByKey[v.areaKey].name }),
        h('dt', { text: 'When' }), h('dd', { text: 'By ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) }),
        h('dt', { text: 'Also' }), h('dd', { text: v.priority + ' priority' + (v.requiresCloseOut ? ', with a close-out check' : '') }));
    }

    function go(n) {
      step = Math.max(0, Math.min(STEPS.length - 1, n));
      errorBox.textContent = '';
      progress.textContent = 'Step ' + (step + 1) + ' of ' + STEPS.length + ' – ' + STEPS[step].title;
      Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (x) { x.textContent = ''; });
      CH.dom.clear(stepBox);
      CH.dom.append(stepBox, panes[step] || summary());
      nextBtn.textContent = step === STEPS.length - 1 ? 'Raise action' : 'Next';
      backBtn.textContent = step === 0 ? 'Cancel' : 'Back';
      var first = stepBox.querySelector('input, select, textarea');
      if (first) first.focus(); else nextBtn.focus();
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      if (step < STEPS.length - 1) {
        var errors = errorsFor(STEPS[step].keys);
        if (CH.ui.dialog.showErrors(form, 'ch-r-', errors, STEPS[step].keys)) return;
        go(step + 1);
        return;
      }
      var all = errorsFor(['title', 'description', 'areaKey', 'ownerId', 'dueIso', 'priority']);
      if (Object.keys(all).length) { errorBox.textContent = 'Something needs changing: ' + all[Object.keys(all)[0]]; return; }
      var v = values();
      nextBtn.disabled = true;
      nextBtn.textContent = 'Sending…';
      try {
        await app.tracker.submit({ key: key, type: 'RaiseAction', label: 'Raise “' + v.title.trim() + '”', payload: {
          areaKey: v.areaKey, title: v.title.trim(), description: v.description.trim(), ownerId: Number(v.ownerId),
          dueIso: v.dueIso, priority: v.priority, requiresCloseOut: v.requiresCloseOut } });
        dlg.close();
        CH.ui.toast(app.root, 'Your action has been sent. It will appear in a few minutes.', 'ok');
      } catch (error) {
        nextBtn.disabled = false;
        nextBtn.textContent = 'Try again';
        errorBox.textContent = 'Your action could not be sent just now. Nothing has been lost – try again in a moment.';
      }
    });
    backBtn.addEventListener('click', function () { if (step === 0) dlg.close(); else go(step - 1); });
    go(0);
  }

  return { open: open, STEPS: STEPS };
})();
