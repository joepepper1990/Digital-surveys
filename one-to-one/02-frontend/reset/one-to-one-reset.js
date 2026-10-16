// ESG 1-to-1 – ONE-TIME TEST-DATA RESET TOOL (temporary Welcome layout "ESG 1-to-1 reset tool").
//
// Clears test 1-to-1 records before go-live, in a controlled way: inventory → choose → backup (download) → dry run →
// typed confirmation → delete to the site recycle bin → verify (download a report). Use it on a temporary page that only
// the Team Leader can open, with Flow 1 turned off, then delete the page and these two files (see RESET_PROCEDURE.md).
//
// It NEVER touches: Technicians (people, accounts, active status, appraisal / wellbeing dates and period history),
// 1-to-1 Settings, list or item permissions, groups, flows. Those lists are not in its list of lists at all, and the one
// delete function refuses anything else.
//
// Same security rules as the main page: data reaches the page only through textContent; no external resources; the
// signed-in user's own permissions apply to every request (a technician has no Delete permission, so SharePoint refuses).
window.ESGOneToOneReset = function (ctx) {
  'use strict';

  var VERSION = '1.0.0';
  // The only lists this tool reads or deletes from. Expectations are listed but never selected by default.
  var LISTS = [
    { key: 'reviews', title: 'Monthly Reviews', select: 'ID,Title,MonthKey,ReviewStatus,Created,Technician/Title', expand: 'Technician', who: 'Technician', month: 'MonthKey', status: 'ReviewStatus' },
    { key: 'mgr', title: 'Manager Reviews', select: 'ID,Title,MonthKey,ReviewState,ReviewItemId,Created,Technician/Title', expand: 'Technician', who: 'Technician', month: 'MonthKey', status: 'ReviewState' },
    { key: 'wellbeing', title: 'Wellbeing Assessments', select: 'ID,Title,AssessmentStatus,AssessmentDate,Created,Technician/Title', expand: 'Technician', who: 'Technician', month: 'AssessmentDate', status: 'AssessmentStatus' },
    { key: 'feedback', title: '1-to-1 Feedback', select: 'ID,Title,FeedbackType,DeliveryStatus,Created,Author/Title', expand: 'Author', who: 'Author', month: 'Created', status: 'DeliveryStatus' },
    { key: 'challenges', title: '1-to-1 Challenges', select: 'ID,Title,MonthKey,ChallengeStatus,Created,Author/Title', expand: 'Author', who: 'Author', month: 'MonthKey', status: 'ChallengeStatus' },
    { key: 'amendments', title: '1-to-1 Amendments', select: 'ID,Title,MonthKey,NotifyStatus,Created,Technician/Title', expand: 'Technician', who: 'Technician', month: 'MonthKey', status: 'NotifyStatus' },
    { key: 'exp', title: 'Appraisal Expectations', select: 'ID,Title,AppliesTo,AppraisalYear,Active,Created,Technician/Title', expand: 'Technician', who: 'Technician', month: 'Created', status: 'AppliesTo', optIn: true }
  ];
  var NEVER = ['Technicians', '1-to-1 Settings'];
  var MANAGE_PERMISSIONS_LOW = 0x02000000;

  var root = null, http = null, httpConfig = null, siteUrl = '', me = { title: '', email: '' }, digestCache = { value: '', expires: 0 };
  var inv = null;          // { key: { list, missing, rows: [{ id, title, who, month, status }] } }
  var picked = {};         // 'key:id' -> true
  var backup = null;       // { sig, at, count }
  var dry = null;          // { sig }
  var result = null;       // { deleted: [...], failed: [...], verify: {...} }
  var filt = { who: '', month: '' }, flowOff = false, busyNow = false, msg = null;

  // ------------------------------------------------------------------ DOM (textContent only)
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'class') { e.className = v; } else if (k === 'text') { e.textContent = String(v); }
      else if (k.indexOf('on') === 0 && typeof v === 'function') { e.addEventListener(k.substring(2), v); }
      else if (k.indexOf('on') !== 0) { e.setAttribute(k, v === true ? '' : String(v)); }
    });
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) { return; }
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function str(v) { return v === null || v === undefined ? '' : String(v); }

  // ------------------------------------------------------------------ SharePoint REST
  function listPath(title) { return "/_api/web/lists/getbytitle('" + encodeURIComponent(String(title).replace(/'/g, "''")) + "')"; }
  async function req(method, path, body, extra) {
    var headers = { 'Accept': 'application/json;odata=nometadata' };
    if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json;odata=nometadata'; }
    Object.keys(extra || {}).forEach(function (k) { headers[k] = extra[k]; });
    var options = { headers: headers };
    if (body !== undefined && body !== null) { options.body = JSON.stringify(body); }
    var r = method === 'GET' ? await http.get(siteUrl + path, httpConfig, options) : await http.post(siteUrl + path, httpConfig, options);
    var text = await r.text(), json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: json };
  }
  function errText(r) { var m = r && r.json && (r.json['odata.error'] || r.json.error); return '(' + (r ? r.status : '?') + ')' + (m && m.message ? ' ' + (m.message.value || m.message) : ''); }
  async function digest() {
    if (digestCache.value && Date.now() < digestCache.expires) { return digestCache.value; }
    var r = await req('POST', '/_api/contextinfo');
    var v = r.json && r.json.FormDigestValue;
    if (!v) { throw new Error('Could not get a request digest ' + errText(r)); }
    digestCache = { value: v, expires: Date.now() + 20 * 60000 };
    return v;
  }
  async function getAll(title, query) {
    var path = listPath(title) + '/items?' + query + '&$top=5000', rows = [];
    for (var guard = 0; guard < 40 && path; guard++) {
      var r = await req('GET', path);
      if (r.status === 404) { return null; }   // the list doesn't exist on this site
      if (!r.ok) { throw new Error('Could not read ' + title + ' ' + errText(r)); }
      rows = rows.concat((r.json && r.json.value) || []);
      var next = r.json && r.json['odata.nextLink'] ? String(r.json['odata.nextLink']) : '';
      path = next ? next.slice(next.indexOf('/_api/')) : '';
    }
    return rows;
  }
  // The ONLY delete: one item of one of the lists above, to the site recycle bin (restorable for about 93 days).
  async function recycle(title, id) {
    if (NEVER.indexOf(title) >= 0 || !LISTS.some(function (l) { return l.title === title; })) { throw new Error('Refused: ' + title + ' is never reset.'); }
    if (!Number.isInteger(id) || id <= 0) { throw new Error('Invalid item'); }
    var r = await req('POST', listPath(title) + '/items(' + id + ')/recycle()', null, { 'X-RequestDigest': await digest() });
    if (!r.ok) { throw new Error(errText(r)); }
  }

  // ------------------------------------------------------------------ steps
  // a date or time as its UK month (SharePoint returns date-only values as midnight UK time in UTC: 1 July = 30 June 23:00Z)
  function monthOf(v) {
    var s = str(v);
    if (/T\d{2}:/.test(s)) { var d = new Date(s); if (!isNaN(d.getTime())) { return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7); } }
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  }
  async function inventory() {
    var out = {};
    for (var i = 0; i < LISTS.length; i++) {
      var l = LISTS[i];
      var rows = await getAll(l.title, '$select=' + l.select + '&$expand=' + l.expand + '&$orderby=ID');
      out[l.key] = { list: l, missing: rows === null, rows: (rows || []).map(function (x) {
        var w = x[l.who];
        return { id: Number(x.ID), title: str(x.Title), who: str(w && w.Title), month: monthOf(x[l.month]), status: str(x[l.status] && x[l.status].Value !== undefined ? x[l.status].Value : x[l.status]),
          pair: l.key === 'mgr' ? Number(x.ReviewItemId) || 0 : 0 };
      }) };
    }
    return out;
  }
  // A Monthly Review and its Manager Review are always kept or deleted together: half a pair left behind would stay
  // visible, and Flow 1 would create the month again and email the link a second time.
  function partnerOf(key, r) {
    if (!inv) { return null; }
    if (key === 'mgr' && r.pair) { var rv = inv.reviews.rows.find(function (x) { return x.id === r.pair; }); return rv ? { key: 'reviews', row: rv } : null; }
    if (key === 'reviews') { var m = inv.mgr.rows.find(function (x) { return x.pair === r.id; }); return m ? { key: 'mgr', row: m } : null; }
    return null;
  }
  function pick(key, r, on) {
    picked[key + ':' + r.id] = on;
    var p = partnerOf(key, r);
    if (p) { picked[p.key + ':' + p.row.id] = on; }
  }
  function selected() {
    var out = [];
    LISTS.forEach(function (l) { var s = inv && inv[l.key]; if (!s) { return; } s.rows.forEach(function (r) { if (picked[l.key + ':' + r.id]) { out.push({ list: l, row: r }); } }); });
    return out;
  }
  function sig() { return selected().map(function (x) { return x.list.key + ':' + x.row.id; }).join(','); }
  function download(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = h('a', { download: name, style: 'display:none' });
    a.href = URL.createObjectURL(blob);
    root.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
  async function makeBackup() {
    var sel = selected(), byList = {}, out = { tool: 'ESG 1-to-1 reset tool ' + VERSION, createdAt: new Date().toISOString(), createdBy: me.title, lists: {} };
    sel.forEach(function (x) { (byList[x.list.title] = byList[x.list.title] || []).push(x.row.id); });
    var n = 0;
    for (var title in byList) {
      if (!Object.prototype.hasOwnProperty.call(byList, title)) { continue; }
      var all = await getAll(title, '$orderby=ID');   // every column of every item, then only the chosen ones are kept
      if (all === null) { throw new Error(title + ' could not be read for the backup.'); }
      var want = byList[title], keep = all.filter(function (x) { return want.indexOf(Number(x.ID)) >= 0; });
      if (keep.length !== want.length) { throw new Error('Some ' + title + ' records could not be read for the backup – nothing was saved. Reload and try again.'); }
      out.lists[title] = keep; n += keep.length;
    }
    out.count = n;
    download('esg-1to1-backup-' + stamp() + '.json', out);
    return { sig: sig(), at: new Date().toISOString(), count: n };
  }
  async function runDelete() {
    var sel = selected(), done = [], failed = [];
    // the audit / notice records first, the reviews last, so nothing is ever left pointing at a missing review
    var order = ['amendments', 'feedback', 'challenges', 'wellbeing', 'mgr', 'reviews', 'exp'];
    sel.sort(function (a, b) { return order.indexOf(a.list.key) - order.indexOf(b.list.key); });
    for (var i = 0; i < sel.length; i++) {
      var x = sel[i];
      try { await recycle(x.list.title, x.row.id); done.push({ list: x.list.title, id: x.row.id, title: x.row.title }); }
      catch (e) { failed.push({ list: x.list.title, id: x.row.id, title: x.row.title, error: String(e && e.message ? e.message : e) }); }
      msg = { text: 'Deleting… ' + (i + 1) + ' of ' + sel.length };
      render();
    }
    return { deleted: done, failed: failed };
  }
  async function verify(res) {
    var after = await inventory(), left = [];
    res.deleted.forEach(function (d) {
      var l = LISTS.find(function (x) { return x.title === d.list; }), s = after[l.key];
      if (s && s.rows.some(function (r) { return r.id === d.id; })) { left.push(d); }
    });
    var counts = {};
    LISTS.forEach(function (l) { counts[l.title] = after[l.key].missing ? null : after[l.key].rows.length; });
    return { after: after, stillThere: left, counts: counts };
  }

  // ------------------------------------------------------------------ screen
  function step(n, title, body, state) {
    return h('section', { class: 'rs-step' + (state ? ' ' + state : '') }, [h('h3', null, [h('span', { class: 'rs-n', text: String(n) }), title])].concat(body));
  }
  function btn(text, onclick, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'rs-btn' + (opts.cls ? ' ' + opts.cls : ''), disabled: !!opts.disabled || busyNow, text: text, onclick: onclick });
  }
  function act(label, fn) {
    if (busyNow) { return; }
    busyNow = true; msg = { text: label + '…' }; render();
    Promise.resolve().then(fn).then(function (m) { busyNow = false; msg = m ? { text: m } : null; render(); },
      function (e) { busyNow = false; msg = { text: String(e && e.message ? e.message : e), bad: true }; render(); });
  }
  function visible(l) {
    return inv[l.key].rows.filter(function (r) { return (!filt.who || r.who === filt.who) && (!filt.month || r.month === filt.month); });
  }
  function render() {
    if (!root) { return; }
    root.textContent = '';
    var wrap = h('div', { class: 'rs' });
    root.appendChild(wrap);
    wrap.appendChild(h('div', { class: 'rs-head' }, [h('h2', { text: 'ESG 1-to-1 – one-time test-data reset' }), h('span', { class: 'rs-ver', text: 'v' + VERSION })]));
    if (msg) { wrap.appendChild(h('div', { class: 'rs-msg' + (msg.bad ? ' bad' : ''), role: 'status', text: msg.text })); }
    if (!inv) { return; }
    wrap.appendChild(h('p', { class: 'rs-warn', text: 'Never touched: Technicians (people, accounts, active status, appraisal and wellbeing dates, period history), 1-to-1 Settings, permissions, groups and flows. Deleted records go to the site recycle bin (restorable for about 93 days).' }));

    // 1. inventory and selection
    var whoSet = {}, monthSet = {};
    LISTS.forEach(function (l) { inv[l.key].rows.forEach(function (r) { if (r.who) { whoSet[r.who] = 1; } if (r.month) { monthSet[r.month] = 1; } }); });
    var whoSel = h('select', { 'aria-label': 'Filter by person', onchange: function () { filt.who = whoSel.value; render(); } },
      [h('option', { value: '', text: 'Everyone' })].concat(Object.keys(whoSet).sort().map(function (w) { var o = h('option', { value: w, text: w }); o.selected = filt.who === w; return o; })));
    var monSel = h('select', { 'aria-label': 'Filter by month', onchange: function () { filt.month = monSel.value; render(); } },
      [h('option', { value: '', text: 'All months' })].concat(Object.keys(monthSet).sort().reverse().map(function (m) { var o = h('option', { value: m, text: m }); o.selected = filt.month === m; return o; })));
    var lists = LISTS.map(function (l) {
      var s = inv[l.key];
      if (s.missing) { return h('div', { class: 'rs-list' }, [h('h4', { text: l.title }), h('p', { class: 'rs-muted', text: 'Not on this site – nothing to do.' })]); }
      var rows = visible(l), nPicked = s.rows.filter(function (r) { return picked[l.key + ':' + r.id]; }).length;
      var all = h('input', { type: 'checkbox', 'aria-label': 'Select all shown in ' + l.title });
      all.checked = rows.length > 0 && rows.every(function (r) { return picked[l.key + ':' + r.id]; });
      all.addEventListener('change', function () { rows.forEach(function (r) { pick(l.key, r, all.checked); }); render(); });
      var body = rows.map(function (r) {
        var c = h('input', { type: 'checkbox', 'aria-label': 'Select ' + l.title + ' ' + r.id });
        c.checked = !!picked[l.key + ':' + r.id];
        c.addEventListener('change', function () { pick(l.key, r, c.checked); render(); });
        return h('tr', null, [h('td', null, c), h('td', { text: String(r.id) }), h('td', { text: r.title }), h('td', { text: r.who }), h('td', { text: r.month }), h('td', { text: r.status })]);
      });
      return h('details', { class: 'rs-list', open: nPicked > 0 || null }, [
        h('summary', null, [h('b', { text: l.title }), h('span', { class: 'rs-muted', text: ' – ' + s.rows.length + ' record' + (s.rows.length === 1 ? '' : 's') + ' · ' + nPicked + ' selected' + (l.optIn ? ' · opt-in only' : '') })]),
        l.optIn ? h('p', { class: 'rs-muted', text: 'Expectations are your real set-up – select them only if they were test data. Past reviews keep their own copies.' }) : null,
        h('table', { class: 'rs-tbl' }, [h('thead', null, h('tr', null, [h('th', null, all), h('th', { text: 'ID' }), h('th', { text: 'Title' }), h('th', { text: 'Person' }), h('th', { text: 'Month' }), h('th', { text: 'Status' })])),
          h('tbody', null, body.length ? body : h('tr', null, h('td', { colspan: '6', class: 'rs-muted', text: 'Nothing matches the filter.' })))])
      ]);
    });
    var sel = selected(), curSig = sig();
    wrap.appendChild(step(1, 'Inventory and choose', [h('div', { class: 'rs-filters' }, [whoSel, monSel,
      btn('Select all shown (except expectations)', function () { LISTS.forEach(function (l) { if (!l.optIn && !inv[l.key].missing) { visible(l).forEach(function (r) { pick(l.key, r, true); }); } }); render(); }),
      btn('Clear selection', function () { picked = {}; render(); }),
      btn('Re-read', function () { act('Reading', async function () { inv = await inventory(); picked = {}; backup = dry = null; }); })])].concat(lists), sel.length ? 'done' : ''));

    // 2. backup
    var backed = backup && backup.sig === curSig && sel.length;
    wrap.appendChild(step(2, 'Back up the selected records', [
      h('p', { text: 'Downloads every column of the ' + sel.length + ' selected record' + (sel.length === 1 ? '' : 's') + ' as a JSON file. Keep it somewhere safe and private (it holds personal data).' }),
      btn('Download backup', function () { act('Making the backup', async function () { backup = await makeBackup(); dry = null; return 'Backup downloaded: ' + backup.count + ' records.'; }); }, { disabled: !sel.length }),
      backed ? h('span', { class: 'rs-ok', text: '✓ Backed up ' + backup.count + ' records' }) : (backup ? h('span', { class: 'rs-muted', text: 'The selection changed – download a new backup.' }) : null)
    ], backed ? 'done' : ''));

    // 3. dry run
    var dried = backed && dry && dry.sig === curSig;
    var per = LISTS.map(function (l) { var n = sel.filter(function (x) { return x.list.key === l.key; }).length; return n ? h('li', { text: l.title + ': ' + n }) : null; }).filter(Boolean);
    wrap.appendChild(step(3, 'Dry run', [
      h('p', { text: 'Shows exactly what would be deleted. Nothing is changed. A monthly review and its manager review are always selected together.' }),
      btn('Run the dry run', function () { dry = { sig: curSig }; msg = { text: 'Dry run: ' + sel.length + ' records would be deleted. Nothing was changed.' }; render(); }, { disabled: !backed }),
      dried ? h('div', null, [h('ul', null, per), h('details', null, [h('summary', { text: 'Every record' }), h('ul', null, sel.map(function (x) { return h('li', { text: x.list.title + ' #' + x.row.id + ' – ' + x.row.title + (x.row.who ? ' (' + x.row.who + ')' : '') }); }))])]) : null
    ], dried ? 'done' : ''));

    // 4. confirm and delete
    var phrase = 'DELETE ' + sel.length + ' RECORDS';
    var flowChk = h('input', { type: 'checkbox', id: 'rs-flow1' }); flowChk.checked = flowOff;
    flowChk.addEventListener('change', function () { flowOff = flowChk.checked; render(); });
    var typed = h('input', { type: 'text', 'aria-label': 'Type the confirmation', autocomplete: 'off', spellcheck: 'false' });
    var go = btn('Delete ' + sel.length + ' records', function () {
      if (typed.value.trim() !== phrase) { msg = { text: 'Type exactly: ' + phrase, bad: true }; render(); return; }
      act('Deleting', async function () {
        var res = await runDelete();
        res.verify = await verify(res);
        inv = res.verify.after; picked = {}; backup = dry = null; result = res;
        return 'Finished: ' + res.deleted.length + ' deleted, ' + res.failed.length + ' failed, ' + res.verify.stillThere.length + ' still there.';
      });
    }, { cls: 'danger', disabled: !dried || !flowOff });
    wrap.appendChild(step(4, 'Confirm and delete', [
      h('label', { class: 'rs-chk', for: 'rs-flow1' }, [flowChk, ' Flow "ESG 1-to-1 | 1 Daily scheduler" is turned off']),
      h('p', null, ['Type ', h('b', { text: phrase }), ' to confirm:']), typed, go
    ]));

    // 5. verification
    if (result) {
      var rep = { tool: 'ESG 1-to-1 reset tool ' + VERSION, finishedAt: new Date().toISOString(), by: me.title, deleted: result.deleted, failed: result.failed,
        stillThere: result.verify.stillThere, countsAfter: result.verify.counts };
      wrap.appendChild(step(5, 'Verification', [
        h('p', { class: result.failed.length || result.verify.stillThere.length ? 'rs-bad' : 'rs-ok', text: result.deleted.length + ' deleted · ' + result.failed.length + ' failed · ' + result.verify.stillThere.length + ' still there (re-read from SharePoint)' }),
        result.failed.length ? h('ul', null, result.failed.map(function (f) { return h('li', { text: f.list + ' #' + f.id + ' – ' + f.error }); })) : null,
        h('ul', null, Object.keys(rep.countsAfter).map(function (k) { return h('li', { text: k + ': ' + (rep.countsAfter[k] === null ? 'not on this site' : rep.countsAfter[k] + ' left') }); })),
        btn('Download the report', function () { download('esg-1to1-reset-report-' + stamp() + '.json', rep); })
      ], 'done'));
    }
  }

  async function start() {
    var wp = ctx && ctx.getWebPart ? ctx.getWebPart() : null;
    if (!wp || !wp.spHttpClient || !wp.pageContext) { throw new Error('Welcome SharePoint context unavailable'); }
    http = wp.spHttpClient; httpConfig = http.constructor.configurations.v1;
    siteUrl = String(wp.pageContext.web.absoluteUrl).replace(/\/$/, '');
    var u = await req('GET', '/_api/web/currentuser?$select=Title,Email');
    me = { title: str(u.json && u.json.Title), email: str(u.json && u.json.Email) };
    var p = await req('GET', '/_api/web/effectiveBasePermissions');
    var low = Number((p.json && p.json.Low) || 0);
    if ((low & MANAGE_PERMISSIONS_LOW) === 0) { msg = { text: 'This tool is for the Team Leader (site owner) only.', bad: true }; render(); return; }
    msg = { text: 'Reading the lists…' }; render();
    inv = await inventory(); msg = null; render();
  }
  return {
    onInitialize: function () {
      var tries = 0;
      (function wait() {
        root = document.querySelector('[data-reset-root]');
        if (!root && tries++ < 50) { setTimeout(wait, 100); return; }
        if (root) { start().catch(function (e) { msg = { text: 'Could not start: ' + String(e && e.message ? e.message : e), bad: true }; render(); }); }
      })();
    },
    onError: function (e) { if (window.console) { window.console.error('ESG 1-to-1 reset: Welcome reported an error', e); } },
    onDispose: function () { root = null; },
    _version: VERSION
  };
};
