// The feedback bubble (spec FB-1 to FB-3) and the administrators' review of it (ADM-5). Sending is an instant
// write to the Feedback list, where everyone may add but only administrators may read; "Thanks" is shown only once
// SharePoint has confirmed the save. Who sent it and when come from SharePoint's own Created By and Created.
CH.views = CH.views || {};
CH.views.feedback = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var ui = CH.ui;
  var TYPES = ['Suggest an improvement', 'Report a bug', 'Ask a question', 'Other feedback'];
  var STATUSES = ['New', 'In review', 'Answered', 'Done'];

  function validate(v) {
    var e = {};
    if (TYPES.indexOf(v.type) < 0) e.type = 'Choose what kind of feedback this is.';
    var d = String(v.description || '').trim();
    if (!d) e.description = 'Tell us a little more.';
    else if (d.length > 4000) e.description = 'Keep it to 4,000 characters or fewer.';
    return e;
  }

  function bubble(app) {
    // a speech bubble, drawn as an inline SVG (release 1.2)
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    ['M4 5h16v11H9l-5 4z', 'M8 9h8M8 12h5'].forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return h('button', { type: 'button', class: 'fb-bubble', 'aria-label': 'Send feedback about the Competency Hub', title: 'Send feedback',
      onclick: function () { openForm(app); } }, h('span', { class: 'ic', 'aria-hidden': 'true' }, svg), h('span', { class: 'fb-label', text: 'Feedback' }));
  }

  function openForm(app) {
    var field = CH.ui.dialog.field;
    var clientKey = CH.requests.newKey();
    var type = h('select', { id: 'ch-fb-type' }, TYPES.map(function (t) { return h('option', { value: t, text: t }); }));
    var description = h('textarea', { id: 'ch-fb-description', rows: '6', maxlength: '4000' });
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Send feedback' });
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-fb', title: 'Send feedback' });
    var form = h('form', { class: 'dialog-body', novalidate: true },
      h('p', { class: 'explain', text: 'Your feedback goes to the Competency Hub administrators. Only they can read it.' }),
      field('What kind of feedback?', type), field('Your feedback', description, 'What happened, or what you would like. Include the page you were on if it helps.'),
      errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
    dlg.body.appendChild(form);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      var v = { type: type.value, description: description.value };
      if (CH.ui.dialog.showErrors(form, 'ch-fb-', validate(v), ['type', 'description'])) return;
      submit.disabled = true;
      submit.textContent = 'Sending…';
      var values = { Title: (v.type + ': ' + v.description.trim()).slice(0, 255), FeedbackType: v.type, Description: v.description.trim(), Status: 'New',
        PageView: String(app.state.view || 'home').slice(0, 100), ClientKey: clientKey };
      try {
        await app.sp.addToFolder('feedback', '', Object.assign(values, app.testMark()));
      } catch (error) {
        // An unclear failure may still have saved it. The sender can read their own item, so look for it first.
        var found = await app.sp.items(CH.config.lists.feedback.title, "$select=Id&$filter=ClientKey eq '" + CH.sp.escapeOData(clientKey) + "'", 1).catch(function () { return { rows: [] }; });
        if (!found.rows.length) {
          submit.disabled = false;
          submit.textContent = 'Try again';
          errorBox.textContent = 'Your feedback could not be sent just now. Your text has been kept – try again in a moment.';
          return;
        }
      }
      dlg.close();
      CH.ui.toast(app.root, 'Thanks – your feedback has been sent.', 'ok');
    });
    description.focus();
  }

  // ---- review (administrators): a list with filters; open an item, respond and set its status
  async function load(app) {
    var res = await app.sp.items(CH.config.lists.feedback.title,
      '$select=Id,Title,FeedbackType,Description,Status,Response,RespondedById,RespondedOn,PageView,AuthorId,Created&$filter=FSObjType eq 0', 2000);
    return res.rows.sort(function (a, b) { return b.Id - a.Id; });
  }

  async function refresh(app) {
    var showing = function () { return app.state.view === 'admin' && app.adminTab === 3; };
    app.feedback = { loading: true, rows: [], filter: (app.feedback && app.feedback.filter) || { type: '', status: 'open' } };
    if (showing()) app.refreshView();
    try { app.feedback.rows = await load(app); } catch (_) { app.feedback.error = true; }
    app.feedback.loading = false;
    if (showing()) app.refreshView();
  }

  function respond(app, row) {
    var field = CH.ui.dialog.field;
    var status = h('select', { id: 'ch-fr-status' }, STATUSES.map(function (s) { return h('option', { value: s, selected: s === row.Status ? true : null, text: s }); }));
    var response = h('textarea', { id: 'ch-fr-response', rows: '5', maxlength: '4000' });
    response.value = row.Response || '';
    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: 'Save' });
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-fr', title: row.FeedbackType, wide: true });
    var form = h('form', { class: 'dialog-body', novalidate: true },
      h('p', { class: 'muted small', text: 'From ' + app.model.nameOf(row.AuthorId) + ' · ' + D.long(D.localDate(row.Created)) + ' ' + D.ukTime(row.Created) +
        (row.PageView ? ' · on the ' + row.PageView + ' page' : '') }),
      h('p', { class: 'notice-body notice-full', text: row.Description || '' }),
      field('Status', status), field('Response', response, 'Kept with the feedback for other administrators. The sender is not emailed.'),
      errorBox, h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
    dlg.body.appendChild(form);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (response.value.length > 4000) { errorBox.textContent = 'Keep the response to 4,000 characters or fewer.'; return; }
      submit.disabled = true;
      submit.textContent = 'Saving…';
      var values = { Status: status.value, Response: response.value.trim() };
      if (response.value.trim() !== (row.Response || '').trim()) {
        values.RespondedOn = D.ukFormDateTime(new Date());
        if (app.loginName) values.RespondedBy = JSON.stringify([{ Key: app.loginName }]);
      }
      try {
        await app.sp.update('feedback', row.Id, values);
        dlg.close();
        CH.ui.toast(app.root, 'Saved.', 'ok');
        refresh(app);
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Try again';
        errorBox.textContent = 'This could not be saved just now. Your text has been kept.';
      }
    });
    status.focus();
  }

  function review(app) {
    var st = app.feedback;
    if (!st) { setTimeout(function () { refresh(app); }, 0); return h('p', { class: 'muted', text: 'Loading feedback…' }); }
    if (st.loading) return h('p', { class: 'muted', text: 'Loading feedback…' });
    if (st.error) return h('p', { class: 'section-note', text: 'The feedback could not be read just now. Reload the page to try again.' });
    var f = st.filter;
    var rows = st.rows.filter(function (r) {
      return (!f.type || r.FeedbackType === f.type) && (f.status === '' || (f.status === 'open' ? r.Status !== 'Done' : r.Status === f.status));
    });
    function setFilter(k) { return function (e) { st.filter[k] = e.target.value; app.refreshView(); }; }
    var typeSel = h('select', { 'aria-label': 'Type', onchange: setFilter('type') }, [h('option', { value: '', text: 'All types' })].concat(TYPES.map(function (t) {
      return h('option', { value: t, selected: t === f.type ? true : null, text: t }); })));
    var statusSel = h('select', { 'aria-label': 'Status', onchange: setFilter('status') }, [['open', 'Not done'], ['', 'Any status']].concat(STATUSES.map(function (s) { return [s, s]; })).map(function (s) {
      return h('option', { value: s[0], selected: s[0] === f.status ? true : null, text: s[1] }); }));
    return [
      h('div', { class: 'row filters' }, h('label', null, 'Type ', typeSel), h('label', null, 'Status ', statusSel), ui.linkButton('Check again', function () { refresh(app); })),
      rows.length ? h('ul', { class: 'items' }, rows.map(function (r) {
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: function () { respond(app, r); } },
          h('span', null, h('span', { class: 't', text: r.Description ? (r.Description.length > 140 ? r.Description.slice(0, 140) + '…' : r.Description) : r.Title }),
            h('span', { class: 's', text: r.FeedbackType + ' · ' + app.model.nameOf(r.AuthorId) + ' · ' + D.short(D.localDate(r.Created)) + (r.Response ? ' · answered' : '') })),
          ui.chip(r.Status === 'Done' ? 'done' : r.Status === 'New' ? 'soon' : 'later', r.Status)));
      })) : h('p', { class: 'muted', text: st.rows.length ? 'No feedback matches these filters.' : 'No feedback has been sent yet.' })
    ];
  }

  return { bubble: bubble, openForm: openForm, review: review, refresh: refresh, validate: validate, TYPES: TYPES, STATUSES: STATUSES };
})();
