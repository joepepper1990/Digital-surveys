// "Post a notice": an instant write. Any active user may post on any active area's noticeboard (K4.1), on one
// or several at once, or on all of them: the notice is stored once (1.9.0.0). Only members mark it important.
CH.views = CH.views || {};
CH.views.noticeForm = (function () {
  var h = CH.dom.h;
  var CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

  // Validation shared by the form and the tests.
  function validate(values) {
    var errors = {};
    if (values.areas && !values.areas.length) errors.areas = 'Choose at least one noticeboard.';
    var title = (values.title || '').trim();
    var body = (values.body || '').trim();
    if (!title) errors.title = 'Enter a title.';
    else if (title.length > 255) errors.title = 'Keep the title to 255 characters or fewer.';
    if (!body) errors.body = 'Enter your message.';
    else if (body.length > 5000) errors.body = 'Keep the message to 5,000 characters or fewer.';
    if (CATEGORIES.indexOf(values.category) < 0) errors.category = 'Choose a category.';
    return errors;
  }

  function open(app, areaKey) {
    var areas = app.model.areas.filter(function (a) { return app.access.canPostNotice(a.key); });
    var clientKey = CH.requests.newKey();
    var field = CH.ui.dialog.field;

    var boxes = areas.map(function (a) {
      return h('input', { type: 'checkbox', value: a.key, checked: a.key === areaKey || (!areaKey && a === areas[0]) ? true : null });
    });
    var everyBox = h('input', { type: 'checkbox', id: 'ch-n-all' });
    var areaList = h('div', { class: 'checks', id: 'ch-n-areas' }, h('label', { class: 'check' }, everyBox, ' All noticeboards'),
      areas.map(function (a, i) { return h('label', { class: 'check' }, boxes[i], ' ' + a.name + (app.access.canWrite(a.key) ? '' : ' (not your area)')); }));
    function chosen() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
    everyBox.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = everyBox.checked; }); refreshArea(); });
    boxes.forEach(function (b) { b.addEventListener('change', function () { everyBox.checked = chosen().length === boxes.length; refreshArea(); }); });
    var title = h('input', { id: 'ch-n-title', type: 'text', maxlength: '255', autocomplete: 'off' });
    var body = h('textarea', { id: 'ch-n-body', rows: '6', maxlength: '5000' });
    var category = h('select', { id: 'ch-n-cat' }, CATEGORIES.map(function (c) { return h('option', { value: c, text: c }); }));
    var important = h('select', { id: 'ch-n-imp' }, [h('option', { value: '0', text: 'Not important' })].concat(CH.rules.IMPORTANT_FOR.map(function (o) {
      return h('option', { value: String(o[0]), text: o[1] });
    })));
    var importantRow = CH.ui.dialog.field('Important for', important);
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var outsideNote = h('p', { class: 'explain' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Post notice' });

    // the notice is kept in the first chosen area you belong to (or the first chosen): that area's moderators look after it
    function home() {
      var keys = chosen();
      return keys.filter(function (k) { return app.access.canWrite(k); })[0] || keys[0];
    }
    function refreshArea() {
      var key = home();
      var member = !!key && app.access.canWrite(key);
      importantRow.style.display = member ? '' : 'none';
      if (!member) important.value = '0';
      var outside = chosen().filter(function (k) { return !app.access.canWrite(k); });
      outsideNote.textContent = outside.length && outside.length < 4 ? 'You are not a member of ' + outside.map(function (k) { return app.model.areaByKey[k].name; }).join(', ') +
        '. Your notice will be shown there as coming from outside the area.' : outside.length ? 'Your notice will be shown as coming from outside the areas you are not a member of.' : '';
      outsideNote.style.display = outside.length ? '' : 'none';
    }

    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-n', title: 'Post a notice' });
    var form = h('form', { class: 'dialog-body', novalidate: true },
      field('Which noticeboards?', areaList),
      outsideNote,
      field('Title', title, 'A short summary people will recognise.'),
      field('Message', body),
      field('Category', category),
      importantRow,
      errorBox,
      h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
    dlg.body.appendChild(form);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      var values = { title: title.value, body: body.value, category: category.value, areas: chosen() };
      var errors = validate(values);
      if (CH.ui.dialog.showErrors(form, 'ch-n-', { areas: errors.areas, title: errors.title, body: errors.body, cat: errors.category }, ['areas', 'title', 'body', 'cat'])) return;

      var key = home();
      var days = app.access.canWrite(key) ? Number(important.value) : 0;
      var shownIn = values.areas.length === boxes.length && boxes.length > 1 ? 'All' : values.areas.length > 1 ? values.areas.join(';') : '';
      submit.disabled = true;
      submit.textContent = 'Posting…';
      try {
        await app.sp.addToFolder('notices', key, Object.assign({
          Title: values.title.trim(), Body: values.body.trim(), Category: values.category,
          IsImportant: days ? '1' : '0', ImportantDays: days ? String(days) : '', ShownIn: shownIn,
          ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active'
        }, app.testMark()));
        dlg.close();
        app.noticePosted(key);
      } catch (error) {
        // An unclear failure may still have saved the notice: look for it by its client key first.
        try {
          var found = await app.sp.items(CH.config.lists.notices.title,
            "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1);
          if (found.rows.length) { dlg.close(); app.noticePosted(key); return; }
        } catch (_) { /* fall through to the message */ }
        submit.disabled = false;
        submit.textContent = 'Try again';
        // The same client key is reused on retry, so a notice that did save is never duplicated.
        errorBox.textContent = error.status === 403
          ? 'SharePoint did not allow this notice to be posted. Your text has been kept.'
          : 'Your notice could not be posted just now. Your text has been kept – try again in a moment.';
      }
    });

    refreshArea();
    title.focus();
  }

  return { open: open, validate: validate, CATEGORIES: CATEGORIES };
})();
