// "Raise an action": a three-step guided form (plan C.9), then a summary. The action is created by the
// request flow; until then the request shows as being recorded.
CH.views = CH.views || {};
CH.views.raiseForm = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;
  var field = function (l, i, hint) { return CH.ui.dialog.field(l, i, hint); };
  // release 1.2: short step names, shown as "Step 2 of 4 · Who and where – next: by when" with a progress bar
  var STEPS = [
    { title: 'What needs doing', keys: ['title', 'description'] },
    { title: 'Who and where', keys: ['areaKey', 'ownerId', 'coOwnerIds'] },
    { title: 'By when', keys: ['dueIso', 'priority', 'checkerId'] },
    { title: 'Check and raise', keys: [] }
  ];

  // opts: { entry } raises an action linked to an improvement or degradation, in that entry's area (spec REG-3);
  // { meeting, title } raises one from a meeting in progress, in its area (spec MTG-3);
  // { notice, areas } turns a notice into an action, in one of the areas it is shown in that the person may do this for (1.9.0.0).
  function open(app, areaKey, opts) {
    var m = app.model;
    var entry = opts && opts.entry;
    var meeting = opts && opts.meeting;
    var notice = opts && opts.notice;
    var fixedArea = entry ? entry.areaKey : meeting ? meeting.areaKey : null;
    var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key) && (!fixedArea || a.key === fixedArea) && (!notice || opts.areas.indexOf(a.key) >= 0); });
    if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise actions.', 'info'); return; }
    var today = m.today;
    // the limit an administrator sets (MaxDeadlineYears), the same one the flow checks
    var maxYears = (app.health && app.health.maxDeadlineYears) || CH.config.maxDeadlineYears;
    var step = 0;
    var key = CH.requests.newKey();

    var source = notice || entry;
    var title = h('input', { id: 'ch-r-title', type: 'text', maxlength: '255', autocomplete: 'off', value: (opts && opts.title) || (source ? source.title : '') });
    var description = h('textarea', { id: 'ch-r-description', rows: '5', maxlength: '5000' });
    if (source) description.value = String(notice ? notice.body : entry.description || '').slice(0, 5000);
    // which area: never guessed (backlog 12). It is preselected only when the form is opened from an area, or the
    // person can raise in just one; otherwise they choose it.
    var preset = mine.length === 1 ? mine[0].key : mine.some(function (a) { return a.key === areaKey; }) ? areaKey : '';
    var area = h('select', { id: 'ch-r-areaKey' }, (preset ? [] : [h('option', { value: '', text: 'Choose an area…' })]).concat(mine.map(function (a) {
      return h('option', { value: a.key, selected: a.key === preset ? true : null, text: a.name });
    })));
    var owner = h('select', { id: 'ch-r-ownerId' });
    var due = h('input', { id: 'ch-r-dueIso', type: 'date', min: today, max: R.addYears(today, maxYears) });
    var priority = h('select', { id: 'ch-r-priority' }, R.PRIORITIES.map(function (p) { return h('option', { value: p, selected: p === 'Normal' ? true : null, text: p }); }));
    var closeOut = h('input', { id: 'ch-r-closeOut', type: 'checkbox' });
    var closeOutTouched = false;
    closeOut.addEventListener('change', function () { closeOutTouched = true; });
    priority.addEventListener('change', function () { if (!closeOutTouched) closeOut.checked = priority.value === 'High'; showChecker(); });
    var me = Number(app.person.SiteUserId);
    // co-owners share the action with the owner (up to 5); the close-out check is done by someone other than the owner
    var coBox = h('div', { class: 'checks', id: 'ch-r-coOwnerIds' });
    var coField = field('Co-owners (optional)', coBox, 'They see the action in their to-dos and can add updates.');
    var checker = h('select', { id: 'ch-r-checkerId' });
    var checkerField = field('Who checks it?', checker);
    function eligible() { return m.ownersFor(area.value); }
    function fillCo() {
      var ticked = coIds();
      CH.dom.clear(coBox);
      eligible().filter(function (p) { return String(p.id) !== owner.value; }).forEach(function (p) {
        coBox.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(p.id), checked: ticked.indexOf(Number(p.id)) >= 0 ? true : null }), ' ' + p.name));
      });
      coField.style.display = app.access.canRaiseFor(area.value, -1, me) && coBox.firstChild ? '' : 'none';
    }
    function coIds() {
      return Array.prototype.filter.call(coBox.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return Number(x.value); });
    }
    // the raiser checks it unless someone else is chosen (and the raiser is not the owner)
    var checkerChosen = false;
    checker.addEventListener('change', function () { checkerChosen = true; });
    function fillChecker() {
      var current = checkerChosen ? checker.value : String(me);
      CH.dom.clear(checker);
      eligible().filter(function (p) { return String(p.id) !== owner.value; }).forEach(function (p) {
        checker.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null, text: p.name + (Number(p.id) === me ? ' (you)' : '') }));
      });
    }
    function showChecker() { checkerField.style.display = closeOut.checked ? '' : 'none'; }
    closeOut.addEventListener('change', showChecker);
    owner.addEventListener('change', function () { fillCo(); fillChecker(); });

    var selfNote = h('p', { class: 'explain', id: 'ch-r-self-only', text: 'As a technician you can raise actions for yourself in this area. An engineer, or someone who runs meetings in this area, can raise them for someone else.' });
    function fillOwners() {
      var current = owner.value || String(app.person.SiteUserId);
      CH.dom.clear(owner);
      owner.appendChild(h('option', { value: '', text: area.value ? 'Choose a person' : 'Choose the area first' }));
      if (!area.value) { selfNote.style.display = 'none'; return; }
      // a technician without meeting rights in this area is offered only themselves (spec §4.2)
      m.ownersFor(area.value).filter(function (p) { return app.access.canRaiseFor(area.value, p.id, app.person.SiteUserId); }).forEach(function (p) {
        owner.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
          text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') + (CH.config.managementRoles.indexOf(p.role) >= 0 ? ' – ' + p.role : '') }));
      });
      var selfOnly = !app.access.canRaiseFor(area.value, -1, app.person.SiteUserId) && app.access.canWrite(area.value);
      selfNote.style.display = selfOnly ? '' : 'none';
      if (selfOnly) { owner.removeChild(owner.firstChild); owner.value = String(app.person.SiteUserId); }
    }
    area.addEventListener('change', function () { fillOwners(); fillCo(); fillChecker(); });
    fillOwners();
    fillCo();
    fillChecker();
    showChecker();

    function values() {
      return { title: title.value, description: description.value, areaKey: area.value, ownerId: owner.value,
        dueIso: due.value, priority: priority.value, requiresCloseOut: closeOut.checked,
        coOwnerIds: coField.style.display === 'none' ? [] : coIds(), checkerId: closeOut.checked ? Number(checker.value || me) : undefined };
    }
    function errorsFor(keys) {
      var all = R.validateRaise(values(), {
        today: today, maxYears: maxYears, canWrite: app.access.canWrite, me: me,
        canRaiseFor: function (k, id) { return app.access.canRaiseFor(k, id, app.person.SiteUserId); },
        ownerAllowed: function (k, id) { return m.ownersFor(k).some(function (p) { return Number(p.id) === id; }); }
      });
      var out = {};
      keys.forEach(function (k) { if (all[k]) out[k] = all[k]; });
      return out;
    }

    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-r', title: entry ? 'Turn ' + entry.ref + ' into an action' : notice ? 'Turn a notice into an action' : meeting ? 'Raise an action from the meeting' : 'Raise an action' });
    var progress = h('div', { class: 'progress', 'aria-live': 'polite' });
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var stepBox = h('div');
    var nextBtn = h('button', { type: 'submit', class: 'btn btn-main' });
    var backBtn = h('button', { type: 'button', class: 'btn' });
    var form = h('form', { class: 'dialog-body', novalidate: true }, progress, stepBox, errorBox, h('div', { class: 'row' }, nextBtn, backBtn));
    dlg.body.appendChild(form);

    var panes = [
      [field('Title', title, 'A short summary, for example "Replace FH40 probe".'), field('Description', description, 'What needs doing and anything the owner should know.')],
      [field('Which area is it for?', area), field('Who will do it?', owner), selfNote, coField],
      [field('Target date', due, 'From today up to ' + maxYears + (maxYears === 1 ? ' year' : ' years') + ' ahead.'),
        h('details', { class: 'more' }, h('summary', { text: 'More options' }),
          field('Priority', priority), h('label', { class: 'check' }, closeOut, ' Needs a close-out check before it is closed'), checkerField)],
      null
    ];

    function summary() {
      var v = values();
      var ownerName = m.nameOf(Number(v.ownerId));
      return [h('div', { class: 'raise-summary' }, h('span', { class: 'muted small', text: 'You are raising' }),
        h('b', { class: 'big', text: '“' + v.title.trim() + '” in ' + m.areaByKey[v.areaKey].name }),
        h('span', { class: 'small', text: 'for ' + ownerName + ', by ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) })),
      h('dl', { class: 'facts' },
        h('dt', { text: 'What' }), h('dd', null, h('b', { text: v.title.trim() }), h('br'), h('span', { class: 'notice-body', text: v.description.trim() })),
        h('dt', { text: 'Who' }), h('dd', { text: ownerName + ', in ' + m.areaByKey[v.areaKey].name +
          (v.coOwnerIds.length ? ' – co-owners ' + v.coOwnerIds.map(function (id) { return m.nameOf(id); }).join(', ') : '') }),
        h('dt', { text: 'When' }), h('dd', { text: 'By ' + D.weekday(v.dueIso) + ' ' + D.long(v.dueIso) }),
        h('dt', { text: 'Also' }), h('dd', { text: v.priority + ' priority' + (v.requiresCloseOut ? ', with a close-out check by ' + m.nameOf(v.checkerId) : '') }),
        entry ? [h('dt', { text: 'For' }), h('dd', { text: entry.ref + ' ' + entry.title })] : null,
        notice ? [h('dt', { text: 'From' }), h('dd', { text: 'The notice “' + notice.title + '”' })] : null)];
    }

    function go(n) {
      step = Math.max(0, Math.min(STEPS.length - 1, n));
      errorBox.textContent = '';
      CH.dom.clear(progress);
      CH.dom.append(progress, [h('div', { class: 'lbl' }, 'Step ' + (step + 1) + ' of ' + STEPS.length + ' · ', h('b', { text: STEPS[step].title }),
        STEPS[step + 1] ? h('span', { class: 'muted', text: ' – next: ' + STEPS[step + 1].title.toLowerCase() }) : null),
        h('div', { class: 'track', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: 'width:' + Math.round((step + 1) * 100 / STEPS.length) + '%' }))]);
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
      var all = errorsFor(['title', 'description', 'areaKey', 'ownerId', 'coOwnerIds', 'dueIso', 'priority', 'checkerId']);
      if (Object.keys(all).length) { errorBox.textContent = 'Something needs changing: ' + all[Object.keys(all)[0]]; return; }
      var v = values();
      nextBtn.disabled = true;
      nextBtn.textContent = 'Sending…';
      try {
        await app.tracker.submit({ key: key, type: 'RaiseAction', label: 'Raise “' + v.title.trim() + '”', payload: {
          areaKey: v.areaKey, title: v.title.trim(), description: v.description.trim(), ownerId: Number(v.ownerId),
          dueIso: v.dueIso, priority: v.priority, requiresCloseOut: v.requiresCloseOut,
          coOwnerIds: v.coOwnerIds.length ? v.coOwnerIds : undefined, checkerId: v.checkerId, sourceEntryId: entry ? entry.id : undefined, sourceNoticeId: notice ? notice.id : undefined,
          sourceMeetingId: meeting ? meeting.id : undefined }, meetingId: meeting ? meeting.id : undefined });
        dlg.close();
        CH.ui.toast(app.root, 'Sent. It shows ✓✓ Saved as soon as it is recorded – you can carry on.', 'ok');
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
