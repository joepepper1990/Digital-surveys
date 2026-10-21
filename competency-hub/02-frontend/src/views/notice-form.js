// "Post a notice": the one instant write in this version. Any active user may post on any active
// area's noticeboard (K4.1); only members may mark a notice as important.
CH.views = CH.views || {};
CH.views.noticeForm = (function () {
  var h = CH.dom.h;
  var CATEGORIES = ['General', 'Request', 'Improvement idea', 'Safety', 'Equipment', 'Other'];

  function newKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }

  // Validation shared by the form and the tests.
  function validate(values) {
    var errors = {};
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
    var root = app.root;
    var areas = app.model.areas.filter(function (a) { return app.access.canPostNotice(a.key); });
    var clientKey = newKey();
    var previousFocus = document.activeElement;

    var areaSelect = h('select', { id: 'ch-n-area' }, areas.map(function (a) {
      return h('option', { value: a.key, selected: a.key === areaKey ? true : null, text: a.name + (app.access.canWrite(a.key) ? '' : ' (not your area)') });
    }));
    var title = h('input', { id: 'ch-n-title', type: 'text', maxlength: '255', autocomplete: 'off' });
    var body = h('textarea', { id: 'ch-n-body', rows: '6', maxlength: '5000' });
    var category = h('select', { id: 'ch-n-cat' }, CATEGORIES.map(function (c) { return h('option', { value: c, text: c }); }));
    var important = h('input', { id: 'ch-n-imp', type: 'checkbox' });
    var importantRow = h('label', { class: 'check' }, important, ' Mark as important for 30 days');
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var outsideNote = h('p', { class: 'explain' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Post notice' });

    function field(label, input, hint, errId) {
      return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), hint ? h('span', { class: 'hint', text: hint }) : null, input,
        h('span', { class: 'field-error', id: errId }));
    }

    function refreshArea() {
      var key = areaSelect.value;
      var member = app.access.canWrite(key);
      importantRow.style.display = member ? '' : 'none';
      if (!member) important.checked = false;
      outsideNote.textContent = member ? '' : 'You are not a member of ' + app.model.areaByKey[key].name +
        '. Your notice will be shown as coming from outside the area, and its members will see it.';
      outsideNote.style.display = member ? 'none' : '';
    }
    areaSelect.addEventListener('change', refreshArea);

    var form = h('form', { class: 'dialog-body', novalidate: true },
      field('Which noticeboard?', areaSelect, null, 'ch-n-area-err'),
      outsideNote,
      field('Title', title, 'A short summary people will recognise.', 'ch-n-title-err'),
      field('Message', body, null, 'ch-n-body-err'),
      field('Category', category, null, 'ch-n-cat-err'),
      importantRow,
      errorBox,
      h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: close })));

    var dialog = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ch-n-heading' },
      h('h2', { id: 'ch-n-heading', text: 'Post a notice' }), form);
    var scrim = h('div', { class: 'scrim', onclick: function (e) { if (e.target === scrim) close(); } }, dialog);

    function close() {
      scrim.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var focusable = dialog.querySelectorAll('select, input, textarea, button');
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      ['area', 'title', 'body', 'cat'].forEach(function (k) { var n = form.querySelector('#ch-n-' + k + '-err'); if (n) n.textContent = ''; });
      errorBox.textContent = '';
      var values = { title: title.value, body: body.value, category: category.value };
      var errors = validate(values);
      if (errors.title) form.querySelector('#ch-n-title-err').textContent = errors.title;
      if (errors.body) form.querySelector('#ch-n-body-err').textContent = errors.body;
      if (errors.category) form.querySelector('#ch-n-cat-err').textContent = errors.category;
      if (Object.keys(errors).length) { (errors.title ? title : errors.body ? body : category).focus(); return; }

      var key = areaSelect.value;
      submit.disabled = true;
      submit.textContent = 'Posting…';
      try {
        await app.sp.addToFolder('notices', key, {
          Title: values.title.trim(), Body: values.body.trim(), Category: values.category,
          IsImportant: important.checked && app.access.canWrite(key) ? '1' : '0',
          ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active'
        });
        close();
        app.noticePosted(key);
      } catch (error) {
        // An unclear failure may still have saved the notice: look for it by its client key first.
        try {
          var found = await app.sp.items(CH.config.lists.notices.title,
            "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1);
          if (found.rows.length) { close(); app.noticePosted(key); return; }
        } catch (_) { /* fall through to the message */ }
        submit.disabled = false;
        submit.textContent = 'Try again';
        // The same client key is reused on retry, so a notice that did save is never duplicated.
        errorBox.textContent = error.status === 403
          ? 'SharePoint did not allow this notice to be posted. Your text has been kept.'
          : 'Your notice could not be posted just now. Your text has been kept – try again in a moment.';
      }
    });

    document.addEventListener('keydown', onKey, true);
    root.appendChild(scrim);
    refreshArea();
    title.focus();
  }

  return { open: open, validate: validate, CATEGORIES: CATEGORIES };
})();
