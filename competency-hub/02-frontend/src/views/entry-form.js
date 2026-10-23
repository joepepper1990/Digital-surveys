// "Raise an improvement or degradation" (spec REG-1): one form, sent as a queued request. The Records flow
// creates the entry in the area's folder; until then it shows as being recorded.
CH.views = CH.views || {};
CH.views.entryForm = (function () {
  var h = CH.dom.h;
  var R = CH.rules;
  var HINTS = {
    'Improvement': 'Something that would make the work better or safer.',
    'Degradation': 'Something that has got worse and needs watching or fixing.',
    'Concern': 'Something that worries you but is not yet a degradation.',
    'Opportunity': 'A chance to do something better.',
    'Positive Observation': 'Something going well that others should know about.'
  };

  function open(app, areaKey) {
    var m = app.model;
    var mine = m.areas.filter(function (a) { return app.access.canWrite(a.key); });
    if (!mine.length) { CH.ui.toast(app.root, 'You are not a member of any area yet, so you cannot raise entries.', 'info'); return; }
    if (app.recordsBlocked()) { CH.ui.toast(app.root, 'Raising entries is paused while changes can\'t be processed. Please try again later.', 'info'); return; }
    var field = CH.ui.dialog.field;
    var key = CH.requests.newKey();

    var area = h('select', { id: 'ch-e-areaKey' }, mine.map(function (a) { return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name }); }));
    var type = h('select', { id: 'ch-e-entryType' }, R.ENTRY_TYPES.map(function (t) { return h('option', { value: t, text: t }); }));
    var typeHint = h('p', { class: 'explain' });
    var impact = h('select', { id: 'ch-e-impact' }, R.IMPACTS.map(function (x) { return h('option', { value: x, selected: x === 'Medium' ? true : null, text: x }); }));
    var title = h('input', { id: 'ch-e-title', type: 'text', maxlength: '255', autocomplete: 'off' });
    var description = h('textarea', { id: 'ch-e-description', rows: '5', maxlength: '5000' });
    var resp = h('select', { id: 'ch-e-responsibleId' });
    function fillPeople() {
      var current = resp.value || String(app.person.SiteUserId);
      CH.dom.clear(resp);
      m.ownersFor(area.value).forEach(function (p) {
        resp.appendChild(h('option', { value: String(p.id), selected: String(p.id) === current ? true : null,
          text: p.name + (Number(p.id) === Number(app.person.SiteUserId) ? ' (you)' : '') }));
      });
    }
    function showHint() { typeHint.textContent = HINTS[type.value] || ''; }
    area.addEventListener('change', fillPeople);
    type.addEventListener('change', showHint);
    fillPeople();
    showHint();

    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Raise entry' });
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-e', title: 'Raise an improvement or degradation' });
    var form = h('form', { class: 'dialog-body', novalidate: true },
      field('Area', area), field('Type', type), typeHint, field('Impact', impact),
      field('Title', title, 'A short summary people will recognise.'), field('Description', description),
      field('Who is responsible?', resp, 'Members of the area, and Team Leaders and the Group Head.'),
      errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
    dlg.body.appendChild(form);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      var v = { areaKey: area.value, entryType: type.value, impact: impact.value, title: title.value, description: description.value, responsibleId: Number(resp.value) };
      var errors = R.validateEntry(v, { canWrite: app.access.canWrite,
        ownerAllowed: function (k, id) { return m.ownersFor(k).some(function (p) { return Number(p.id) === id; }); } });
      if (CH.ui.dialog.showErrors(form, 'ch-e-', errors, ['areaKey', 'entryType', 'impact', 'title', 'description', 'responsibleId'])) return;
      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        await app.tracker.submit({ key: key, type: 'RaiseRegisterEntry', label: 'Raise “' + v.title.trim() + '”', payload: {
          areaKey: v.areaKey, entryType: v.entryType, impact: v.impact, title: v.title.trim(), description: v.description.trim(), responsibleId: v.responsibleId } });
        dlg.close();
        CH.ui.toast(app.root, 'Your entry has been sent. It will appear in a few minutes.', 'ok');
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Try again';
        errorBox.textContent = error.friendly || 'Your entry could not be sent just now. Nothing has been lost – try again in a moment.';
      }
    });
    title.focus();
  }

  return { open: open };
})();
