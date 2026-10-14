// ESG Monthly Technician 1-to-1 — production frontend (v4) for Welcome by Accelerator 365.
//
// Loaded by one-to-one.html (a Welcome custom layout) through Welcome's script-tag support, using the
// same lifecycle wrapper proven in Stage 0A/0B: window.ESGOneToOne(ctx) returns
// { onInitialize, onError, onDispose }.
//
// SECURITY RULES (IMPLEMENTATION_PLAN.md E.4 – release blockers)
//   S1  SharePoint data and user input only ever reach the page through textContent / text nodes.
//       No innerHTML / outerHTML / insertAdjacentHTML / document.write anywhere in this file.
//   S3  Links are built only from numbers.
//   S4  No eval, new Function, string timers or inline handlers. JSON.parse only inside try.
//   S5  No external resources: only same-origin /_api calls through Welcome's SPHttpClient.
//   S6  Writes only through spUpdate / spCreate, only to the lists and fields named in E.5–E.7.
//   Role (technician / Team Leader) comes from SharePoint (effectiveBasePermissions), never from
//   the browser. It is routing only: every read and write runs as the signed-in user, so
//   SharePoint item permissions remain the only security boundary.
window.ESGOneToOne = function (ctx) {
  'use strict';

  var VERSION = '4.0.0';

  // ---------------------------------------------------------------------------------------------
  // CONFIG — normally nothing to change. List titles must match the lists you created.
  // ---------------------------------------------------------------------------------------------
  var CONFIG = {
    lists: {
      reviews: 'Monthly Reviews',
      mgr: 'Manager Reviews',
      techs: 'Technicians',
      exp: 'Appraisal Expectations',
      settings: '1-to-1 Settings'
    },
    timeZone: 'Europe/London',     // must match the site's regional settings
    maxExpectations: 10
  };
  var MANAGE_PERMISSIONS_LOW = 0x02000000;

  // ---------------------------------------------------------------------------------------------
  // reference data (agreed wording)
  // ---------------------------------------------------------------------------------------------
  var WORKLOAD = [
    { value: 1, title: '1 – Very light', desc: 'Significantly below capacity' },
    { value: 2, title: '2 – Light', desc: 'Some spare capacity' },
    { value: 3, title: '3 – Manageable', desc: 'Appropriate workload' },
    { value: 4, title: '4 – Heavy', desc: 'Busy but manageable' },
    { value: 5, title: '5 – Excessive', desc: 'Struggling to manage' }
  ];
  var PROGRESS = [
    { value: 1, title: 'Not started', desc: 'No progress yet' },
    { value: 2, title: 'Early progress', desc: "Behind where I'd expect" },
    { value: 3, title: 'On track', desc: 'Progressing as expected' },
    { value: 4, title: 'Strong progress', desc: 'Ahead of expectations' },
    { value: 5, title: 'Fully met', desc: 'Achieved and evidenced' }
  ];
  var FOLLOW = [
    'Everything has been covered — no further discussion required at present.',
    'Quick, informal catch-up in the field.',
    'Arrange a dedicated 1-to-1 discussion.'
  ];
  var DEDICATED = FOLLOW[2];
  var MOODS = [
    { value: 1, emo: '🪫', label: 'Running low' },
    { value: 2, emo: '😕', label: 'A bit flat' },
    { value: 3, emo: '🙂', label: 'Steady' },
    { value: 4, emo: '😀', label: 'Good' },
    { value: 5, emo: '⚡', label: 'Full charge' }
  ];
  function defaultBands() {
    return [
      { max: 1.5, name: 'Not met', cls: 'b0' },
      { max: 2.25, name: 'Partially met', cls: 'b1' },
      { max: 4, name: 'Met', cls: 'b2' },
      { max: 99, name: 'Exceeded', cls: 'b3' }
    ];
  }
  var BAND_TINT = { b0: '#fbeaea', b1: '#fdf3dc', b2: '#e8f4ed', b3: '#e8f0fb' };
  var BAND_COL = { b0: '#d14b4b', b1: '#d99a12', b2: '#2f9a63', b3: '#2a78d6' };
  var C_SELF = '#2a78d6', C_TL = '#eb6834';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------------------------------------------------------------------------------------------
  // model (filled from SharePoint by load())
  // ---------------------------------------------------------------------------------------------
  var TODAY = '', CUR = '', CUR_YEAR = '';
  var ME = '', MY_EMAIL = '';
  var IS_TL = false;
  var TECHS = [];               // display names (TL: active technicians; technician: [ME])
  var TECH_INFO = {};           // name -> { appraisal: 'yyyy-mm-dd', itemId, email, claims }
  var MASTER_EXPECTATIONS = []; // TL only
  var REVIEWS = [];             // one object per Monthly Review item the viewer can read
  var SETTINGS = { bands: defaultBands(), itemId: 0 };

  var state = { view: '', reviewId: null, profileTech: null, backTo: '', month: '', techFilter: '', actFilter: 'open', actTech: '',
    expYear: '', showRetired: false, expEdit: null, report: null };
  var root = null, live = null, tipEl = null, http = null, httpConfig = null, siteUrl = '';
  var started = false, disposed = false, dirty = false, busyCount = 0;

  // ---------------------------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------------------------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addMonths(key, n) { var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad(m + 1); }
  function lastDay(key) { return key + '-' + pad(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate()); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monthDiff(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function avg(arr) { return arr.length ? arr.reduce(function (s, n) { return s + n; }, 0) / arr.length : null; }
  // All dates display as DD-MMM-YYYY, e.g. 12-Mar-2027
  function fmtDate(iso) { if (!iso) { return ''; } return iso.slice(8, 10) + '-' + MON[+iso.slice(5, 7) - 1] + '-' + iso.slice(0, 4); }
  function parseDate(str) {
    var m = /^\s*(\d{1,2})[-\s\/]([A-Za-z]{3})[A-Za-z]*[-\s\/](\d{4})\s*$/.exec(str || '');
    if (!m) { return null; }
    var mi = MON.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].toLowerCase());
    if (mi < 0) { return null; }
    var d = new Date(Date.UTC(+m[3], mi, +m[1]));
    if (d.getUTCMonth() !== mi || d.getUTCDate() !== +m[1]) { return null; }
    return d.toISOString().slice(0, 10);
  }
  function monthLabel(key) { return new Date(key + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function monthShort(key) { return MON[+key.slice(5, 7) - 1]; }
  function first(name) { return String(name || '').split(' ')[0]; }
  function f1(v) { return v === null || v === undefined || isNaN(v) ? '—' : v.toFixed(1); }
  // SharePoint returns dates as UTC instants; convert to the site's calendar date.
  function localDate(isoUtc) {
    if (!isoUtc) { return ''; }
    var d = new Date(isoUtc);
    if (isNaN(d.getTime())) { return ''; }
    try { return d.toLocaleDateString('en-CA', { timeZone: CONFIG.timeZone }); } catch (_) { return d.toISOString().slice(0, 10); }
  }
  // validateUpdateListItem takes dates in the site locale (English UK): dd/MM/yyyy
  function spDate(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function appraisalYearOf(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); var s = m >= 4 ? y : y - 1; return s + '/' + String(s + 1).slice(2); }
  function safeJson(str, fallback) {
    if (!str || typeof str !== 'string') { return fallback; }
    try { var v = JSON.parse(str); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; }
  }
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function num(v) { var n = Number(v); return v === null || v === undefined || v === '' || isNaN(n) ? null : n; }

  var uid = 0;
  function nid(p) { uid += 1; return 'oto-' + p + '-' + uid; }
  // The ONLY way elements are made. 'text' always lands via textContent (rule S1).
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { return; }
        if (k === 'class') { e.className = v; }
        else if (k === 'text') { e.textContent = String(v); }
        else if (k.indexOf('on') === 0 && typeof v === 'function') { e.addEventListener(k.substring(2), v); }
        else if (k.indexOf('on') === 0) { return; }
        else { e.setAttribute(k, v === true ? '' : String(v)); }
      });
    }
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) { return; }
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';   // namespace identifier only – nothing is fetched
  function s(tag, attrs, children) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) { return; }
        if (k === 'text') { e.textContent = String(v); } else { e.setAttribute(k, String(v)); }
      });
    }
    (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c) { e.appendChild(c); } });
    return e;
  }

  // ---------------------------------------------------------------------------------------------
  // SharePoint REST (through Welcome's SPHttpClient, as proven in Stage 0A/0B)
  // ---------------------------------------------------------------------------------------------
  function listPath(title) { return "/_api/web/lists/getbytitle('" + encodeURIComponent(String(title).replace(/'/g, "''")) + "')"; }
  async function req(method, path, body, headersExtra) {
    var headers = { 'Accept': 'application/json;odata=nometadata' };
    if (body !== undefined) { headers['Content-Type'] = 'application/json;odata=nometadata'; }
    Object.keys(headersExtra || {}).forEach(function (k) { headers[k] = headersExtra[k]; });
    var options = { headers: headers };
    if (body !== undefined) { options.body = JSON.stringify(body); }
    var url = path.indexOf('http') === 0 ? path : siteUrl + path;
    var response = method === 'GET' ? await http.get(url, httpConfig, options) : await http.post(url, httpConfig, options);
    var text = await response.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    return { status: response.status, ok: response.status >= 200 && response.status < 300, json: json };
  }
  function errText(res) {
    var m = res && res.json && (res.json['odata.error'] || res.json.error);
    var msg = m && m.message ? (m.message.value || m.message) : '';
    return '(' + (res ? res.status : '?') + ')' + (msg ? ' ' + msg : '');
  }
  // Read every item of a list the signed-in user can see. Returns [] when SharePoint hides the list.
  async function spGetAll(list, select, expand) {
    var path = listPath(list) + '/items?$select=' + select + (expand ? '&$expand=' + expand : '') + '&$top=5000';
    var rows = [];
    for (var guard = 0; guard < 20 && path; guard++) {
      var res = await req('GET', path);
      if (res.status === 401 || res.status === 403 || res.status === 404) { return rows; }
      if (!res.ok) { throw new Error('Could not read ' + list + ' ' + errText(res)); }
      rows = rows.concat((res.json && res.json.value) || []);
      path = res.json && res.json['odata.nextLink'] ? res.json['odata.nextLink'] : '';
    }
    return rows;
  }
  var digestCache = { value: '', expires: 0 };
  async function digest() {
    if (digestCache.value && Date.now() < digestCache.expires) { return digestCache.value; }
    var res = await req('POST', '/_api/contextinfo');
    var j = res.json || {};
    var v = j.FormDigestValue || (j.GetContextWebInformation && j.GetContextWebInformation.FormDigestValue) || '';
    if (!v) { throw new Error('Could not start a save ' + errText(res)); }
    digestCache = { value: v, expires: Date.now() + (Number(j.FormDigestTimeoutSeconds || 1800) - 60) * 1000 };
    return v;
  }
  function formValues(fields) {
    return Object.keys(fields).map(function (k) { var v = fields[k]; return { FieldName: k, FieldValue: v === null || v === undefined ? '' : String(v) }; });
  }
  function checkFieldErrors(res, what) {
    var bad = ((res.json && res.json.value) || []).filter(function (f) { return f.HasException; });
    if (bad.length) { throw new Error(what + ' failed: ' + bad.map(function (f) { return f.FieldName + ' – ' + f.ErrorMessage; }).join('; ')); }
  }
  // The ONLY update function (rule S6). fields = { InternalName: value }; '' clears a value.
  async function spUpdate(list, id, fields) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) { throw new Error('Invalid item'); }
    var res = await req('POST', listPath(list) + '/items(' + Number(id) + ')/validateUpdateListItem',
      { formValues: formValues(fields), bNewDocumentUpdate: false }, { 'X-RequestDigest': await digest() });
    if (res.status === 401 || res.status === 403) { throw new Error('SharePoint refused the save – this record is read-only for you.'); }
    if (!res.ok) { throw new Error('Save failed ' + errText(res)); }
    checkFieldErrors(res, 'Save');
  }
  var rootFolders = {};
  // The ONLY create function – Team Leader only (expectations, settings).
  async function spCreate(list, fields) {
    if (!rootFolders[list]) {
      var rf = await req('GET', listPath(list) + '/RootFolder?$select=ServerRelativeUrl');
      if (!rf.ok || !rf.json) { throw new Error('Could not open ' + list + ' ' + errText(rf)); }
      rootFolders[list] = rf.json.ServerRelativeUrl;
    }
    var res = await req('POST', listPath(list) + '/AddValidateUpdateItemUsingPath',
      { listItemCreateInfo: { FolderPath: { DecodedUrl: rootFolders[list] }, UnderlyingObjectType: 0 }, formValues: formValues(fields), bNewDocumentUpdate: false },
      { 'X-RequestDigest': await digest() });
    if (!res.ok) { throw new Error('Create failed ' + errText(res)); }
    checkFieldErrors(res, 'Create');
    var idRow = ((res.json && res.json.value) || []).find(function (f) { return f.FieldName === 'Id'; });
    return idRow ? Number(idRow.FieldValue) : 0;
  }
  function personValue(claims) { return claims ? JSON.stringify([{ Key: claims }]) : ''; }

  // ---------------------------------------------------------------------------------------------
  // load: build the model from SharePoint
  // ---------------------------------------------------------------------------------------------
  var MR_FIELDS = 'ID,Title,ReviewKey,ReviewItemId,MonthKey,DueDate,ReviewState,SubmittedOn,SubmittedLate,TechFollowUp,ExpectationSnapshotJson,' +
    'FB_Q1,FB_Q2,FB_Q3,FB_Q4,FB_Q5,FB_Q6,FB_Q7,FB_Q9,FB_Overall,ExpectationFeedbackJson,FollowUpDecision,MeetingDate,ActionsJson,ActionsStatus,NextActionDue,' +
    'ReleasedOn,TechnicianAadId,Technician/Id,Technician/Title,Technician/EMail';
  var REV_FIELDS = 'ID,Title,MonthKey,DueDate,ReviewStatus,Q1WentWell,Q2Issue,Q2Impact,Q2Tried,Q2Support,Q3WorkloadRating,Q3WorkloadComment,' +
    'Q4WellbeingRaise,Q4WellbeingDetail,Q5PlanningRaise,Q5PlanningDetail,Q6DevRaise,Q6DevWhat,Q6DevWhy,Q7ManagerFeedback,ExpectationsJson,Q9FollowUp,' +
    'Mood,WinOfMonth,AppraisalDate,Technician/Id,Technician/Title,Technician/EMail';

  function emptyFeedback() {
    return { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q9: '', overall: '', exp: {}, expRating: {}, followOverride: '', meeting: '', actions: [] };
  }
  function buildReview(rv, mr, techName) {
    var expJson = safeJson(rv.ExpectationsJson, []);
    if (!Array.isArray(expJson)) { expJson = []; }
    var snap;
    var trusted = mr ? safeJson(mr.ExpectationSnapshotJson, null) : null;
    if (IS_TL && Array.isArray(trusted)) {
      snap = trusted.map(function (e) { return { id: e.id, title: str(e.title), measures: str(e.measures), year: str(e.year) }; });
    } else {
      snap = expJson.map(function (e) { return { id: e.id, title: str(e.title), measures: str(e.measures), year: str(e.year) }; });
    }
    var status = str(rv.ReviewStatus) || 'Not Started';
    var st = mr && mr.ReviewState ? str(mr.ReviewState)
      : (status === 'Not Started' || status === 'Draft' ? 'Open' : status);
    var r = {
      id: rv.ID, mrId: mr ? mr.ID : 0, tech: techName, month: str(rv.MonthKey), due: localDate(rv.DueDate) || lastDay(str(rv.MonthKey)),
      state: st, draft: status === 'Draft', status: status,
      submittedOn: mr ? localDate(mr.SubmittedOn) : '', late: !!(mr && mr.SubmittedLate),
      snapshot: snap,
      released: !!(mr && (mr.ReleasedOn || (!IS_TL && mr))),
      appraisalDate: localDate(rv.AppraisalDate),
      answers: {
        mood: num(rv.Mood), win: str(rv.WinOfMonth),
        q1: str(rv.Q1WentWell), q2: { issue: str(rv.Q2Issue), impact: str(rv.Q2Impact), tried: str(rv.Q2Tried), support: str(rv.Q2Support) },
        q3: num(rv.Q3WorkloadRating), q3c: str(rv.Q3WorkloadComment),
        q4: str(rv.Q4WellbeingRaise) || null, q4d: str(rv.Q4WellbeingDetail),
        q5: str(rv.Q5PlanningRaise) || null, q5d: str(rv.Q5PlanningDetail),
        q6: str(rv.Q6DevRaise) || null, q6what: str(rv.Q6DevWhat), q6why: str(rv.Q6DevWhy),
        q7: str(rv.Q7ManagerFeedback),
        q8: snap.map(function (e) {
          var x = expJson.find(function (y) { return String(y.id) === String(e.id); }) || {};
          return { id: e.id, rating: num(x.rating), comment: str(x.comment) };
        }),
        q9: str(rv.Q9FollowUp) || null
      },
      fb: emptyFeedback()
    };
    if (mr) {
      var fb = r.fb;
      fb.q1 = str(mr.FB_Q1); fb.q2 = str(mr.FB_Q2); fb.q3 = str(mr.FB_Q3); fb.q4 = str(mr.FB_Q4); fb.q5 = str(mr.FB_Q5);
      fb.q6 = str(mr.FB_Q6); fb.q7 = str(mr.FB_Q7); fb.q9 = str(mr.FB_Q9); fb.overall = str(mr.FB_Overall);
      fb.followOverride = str(mr.FollowUpDecision); fb.meeting = localDate(mr.MeetingDate);
      var ef = safeJson(mr.ExpectationFeedbackJson, []);
      (Array.isArray(ef) ? ef : []).forEach(function (x) { fb.exp[x.id] = str(x.feedback); if (num(x.rating)) { fb.expRating[x.id] = num(x.rating); } });
      var acts = safeJson(mr.ActionsJson, []);
      fb.actions = (Array.isArray(acts) ? acts : []).map(function (a) {
        return { id: str(a.id) || String(Math.random()).slice(2, 10), text: str(a.text), owner: str(a.owner), criteria: str(a.criteria),
          due: /^\d{4}-\d{2}-\d{2}$/.test(str(a.due)) ? str(a.due) : '', status: str(a.status) === 'Closed' ? 'Closed' : 'Open',
          closedOn: /^\d{4}-\d{2}-\d{2}$/.test(str(a.closedOn)) ? str(a.closedOn) : '' };
      });
      if (!IS_TL) { r.released = true; }
      r.mrTechFollowUp = str(mr.TechFollowUp);
    }
    return r;
  }
  function parseBands(json) {
    var b = safeJson(json, null);
    if (!Array.isArray(b) || b.length !== 4) { return defaultBands(); }
    var def = defaultBands();
    var out = b.map(function (x, i) { return { max: i === 3 ? 99 : Number(x.max), name: str(x.name) || def[i].name, cls: def[i].cls }; });
    for (var i = 0; i < 3; i++) { if (isNaN(out[i].max) || out[i].max <= (i ? out[i - 1].max : 1) || out[i].max > 5) { return def; } }
    return out;
  }

  async function load() {
    var me = await req('GET', '/_api/web/currentuser?$select=Id,Title,Email');
    if (!me.ok || !me.json) { throw new Error('Could not identify you ' + errText(me)); }
    ME = str(me.json.Title); MY_EMAIL = str(me.json.Email).toLowerCase();
    var perms = await req('GET', '/_api/web/effectiveBasePermissions');
    var low = perms.json && (perms.json.Low !== undefined ? perms.json.Low : 0);
    IS_TL = (Number(low || 0) & MANAGE_PERMISSIONS_LOW) !== 0;

    var settingsRows = await spGetAll(CONFIG.lists.settings, 'ID,Title,Value');
    var bandsRow = settingsRows.find(function (x) { return str(x.Title) === 'Bands'; });
    SETTINGS = { bands: bandsRow ? parseBands(bandsRow.Value) : defaultBands(), itemId: bandsRow ? bandsRow.ID : 0 };

    var revs = await spGetAll(CONFIG.lists.reviews, REV_FIELDS, 'Technician');
    var mrs = await spGetAll(CONFIG.lists.mgr, MR_FIELDS, 'Technician');
    var mrByItem = {};
    mrs.forEach(function (m) { if (m.ReviewItemId) { mrByItem[Number(m.ReviewItemId)] = m; } });

    REVIEWS = []; TECHS = []; TECH_INFO = {}; MASTER_EXPECTATIONS = [];
    if (IS_TL) {
      var techs = await spGetAll(CONFIG.lists.techs, 'ID,Title,Active,AppraisalDate,TechnicianAadId,Technician/Id,Technician/Title,Technician/EMail,Technician/Name', 'Technician');
      var byEmail = {};
      techs.forEach(function (t) {
        var name = str(t.Title) || str(t.Technician && t.Technician.Title);
        var email = str(t.Technician && t.Technician.EMail).toLowerCase();
        TECH_INFO[name] = { appraisal: localDate(t.AppraisalDate), itemId: t.ID, email: email, claims: str(t.Technician && t.Technician.Name), active: !!t.Active };
        if (email) { byEmail[email] = name; }
        if (t.Active) { TECHS.push(name); }
      });
      TECHS.sort();
      revs.forEach(function (rv) {
        var email = str(rv.Technician && rv.Technician.EMail).toLowerCase();
        var name = byEmail[email] || str(rv.Technician && rv.Technician.Title) || 'Unknown';
        if (!TECH_INFO[name]) { TECH_INFO[name] = { appraisal: '', itemId: 0, email: email, claims: '', active: false }; }
        REVIEWS.push(buildReview(rv, mrByItem[Number(rv.ID)] || null, name));
      });
      var exps = await spGetAll(CONFIG.lists.exp, 'ID,Title,Measures,AppraisalYear,AppliesTo,SortOrder,Active,Technician/Id,Technician/Title,Technician/EMail,Technician/Name', 'Technician');
      MASTER_EXPECTATIONS = exps.map(function (e) {
        var email = str(e.Technician && e.Technician.EMail).toLowerCase();
        return { id: e.ID, title: str(e.Title), measures: str(e.Measures), year: str(e.AppraisalYear), scope: str(e.AppliesTo) === 'Individual' ? 'Individual' : 'Shared',
          tech: email ? (byEmail[email] || str(e.Technician.Title)) : '', sort: num(e.SortOrder) || 0, active: !!e.Active };
      });
    } else {
      revs.forEach(function (rv) {
        var name = str(rv.Technician && rv.Technician.Title) || ME;
        REVIEWS.push(buildReview(rv, mrByItem[Number(rv.ID)] || null, ME || name));
      });
      TECHS = [ME];
      var latest = REVIEWS.slice().sort(function (x, y) { return x.month < y.month ? 1 : -1; }).find(function (r) { return r.appraisalDate; });
      TECH_INFO[ME] = { appraisal: latest ? latest.appraisalDate : '' };
    }
    REVIEWS.sort(function (x, y) { return x.month === y.month ? (x.tech < y.tech ? -1 : 1) : (x.month < y.month ? -1 : 1); });
  }

  // ---------------------------------------------------------------------------------------------
  // calculations
  // ---------------------------------------------------------------------------------------------
  function isOverdue(r) { return r.state === 'Open' && TODAY > r.due; }
  function followOf(r) { return r.fb.followOverride || (r.state === 'Open' ? '' : (r.answers.q9 || r.mrTechFollowUp)) || ''; }
  function daysLeft(r) { return daysBetween(TODAY, r.due); }
  function reviewsOf(tech) { return REVIEWS.filter(function (r) { return r.tech === tech; }).sort(function (x, y) { return x.month < y.month ? -1 : 1; }); }
  function currentOf(tech) { return REVIEWS.find(function (r) { return r.tech === tech && r.month === CUR; }) || null; }
  function selfAvg(r) { return avg(r.answers.q8.filter(function (x) { return x.rating; }).map(function (x) { return x.rating; })); }
  function mgrAvg(r) { return avg(r.snapshot.map(function (e) { return r.fb.expRating[e.id]; }).filter(function (v) { return v; })); }
  function canSeeTl(r, aud) { return aud === 'tl' || r.released; }
  function isIn(r) { return r.state === 'Submitted' || r.state === 'Completed'; }
  function bandFor(score) {
    if (score === null || score === undefined || isNaN(score)) { return null; }
    for (var i = 0; i < SETTINGS.bands.length; i++) { if (score < SETTINGS.bands[i].max) { return SETTINGS.bands[i]; } }
    return SETTINGS.bands[SETTINGS.bands.length - 1];
  }
  function apDateOf(tech) { return (TECH_INFO[tech] && TECH_INFO[tech].appraisal) || ''; }
  function periodFor(tech) {
    var ap = apDateOf(tech) || addDays(TODAY, 180);   // no date yet: assume six months ahead (shown as "not set")
    var end = ap.slice(0, 7);
    return { apDate: ap, set: !!apDateOf(tech), end: end, start: addMonths(end, -12) };
  }
  function periodReviews(tech) { var p = periodFor(tech); return reviewsOf(tech).filter(function (r) { return r.month > p.start && r.month <= p.end; }); }
  function latestSnapshot(tech) {
    var rs = reviewsOf(tech);
    for (var i = rs.length - 1; i >= 0; i--) { if (rs[i].snapshot.length) { return rs[i].snapshot; } }
    return [];
  }

  // Expected appraisal outcome (method explained to the Team Leader in Settings)
  function expectedOutcome(tech, aud) {
    var p = periodFor(tech), prs = periodReviews(tech);
    var pts = prs.filter(isIn).map(function (r) {
      var self = selfAvg(r), tl = canSeeTl(r, aud) ? mgrAvg(r) : null;
      return { month: r.month, self: self, tl: tl, used: tl !== null ? tl : self };
    }).filter(function (pt) { return pt.used !== null; });
    var perExp = latestSnapshot(tech).map(function (e) {
      var hist = [];
      prs.filter(isIn).forEach(function (r) {
        var q = r.answers.q8.find(function (x) { return String(x.id) === String(e.id); });
        var inSnap = r.snapshot.some(function (x) { return String(x.id) === String(e.id); });
        if (!inSnap) { return; }
        var see = canSeeTl(r, aud);
        hist.push({ month: r.month, self: q && q.rating ? q.rating : null, tl: see ? (r.fb.expRating[e.id] || null) : null, comment: q ? q.comment : '', fb: see ? (r.fb.exp[e.id] || '') : '' });
      });
      var ls = null, lt = null;
      hist.forEach(function (x) { if (x.self) { ls = x.self; } if (x.tl) { lt = x.tl; } });
      return { e: e, hist: hist, latestSelf: ls, latestTl: lt, latest: lt !== null ? lt : ls };
    });
    if (!pts.length) { return { period: p, pts: [], current: null, projected: null, slope: 0, band: null, perExp: perExp, selfAvg: null, tlAvg: null }; }
    var ws = 0, sum = 0;
    pts.forEach(function (pt, i) { ws += i + 1; sum += (i + 1) * pt.used; });
    var current = sum / ws;
    var xs = pts.map(function (pt) { return monthDiff(p.start, pt.month); }), ys = pts.map(function (pt) { return pt.used; });
    var slope = 0, projected = current;
    if (pts.length >= 3) {
      var mx = avg(xs), my = avg(ys), nu = 0, de = 0;
      xs.forEach(function (x, i) { nu += (x - mx) * (ys[i] - my); de += (x - mx) * (x - mx); });
      slope = de ? nu / de : 0;
      var lastX = xs[xs.length - 1], fitNow = my + slope * (lastX - mx);
      var remaining = Math.max(0, monthDiff(p.start, p.end) - lastX);
      projected = clamp(fitNow + slope * remaining * 0.5, fitNow - 0.75, fitNow + 0.75);
    }
    projected = clamp(projected, 1, 5);
    var tlv = pts.filter(function (x) { return x.tl !== null; }).map(function (x) { return x.tl; });
    return { period: p, pts: pts, current: current, projected: projected, slope: slope, band: bandFor(projected), perExp: perExp,
      selfAvg: avg(pts.filter(function (x) { return x.self !== null; }).map(function (x) { return x.self; })), tlAvg: tlv.length ? avg(tlv) : null };
  }
  function streakOf(tech) {
    var ms = reviewsOf(tech).reverse(), n = 0;
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].state === 'Open' && !isOverdue(ms[i])) { continue; }
      if (isIn(ms[i]) && !ms[i].late) { n += 1; } else { break; }
    }
    return n;
  }
  function onTimeOf(tech) {
    var rs = periodReviews(tech).filter(function (r) { return r.state !== 'Open' || TODAY > r.due; });
    return { onTime: rs.filter(function (r) { return isIn(r) && !r.late; }).length, total: rs.length };
  }
  function actionsOf(filterFn, aud) {
    var out = [];
    REVIEWS.forEach(function (r) {
      if (aud === 'tech' && !r.released) { return; }
      r.fb.actions.forEach(function (ac) { if (!filterFn || filterFn(ac, r)) { out.push({ ac: ac, r: r }); } });
    });
    return out.sort(function (x, y) { return (x.ac.due || '9') < (y.ac.due || '9') ? -1 : 1; });
  }
  function acOverdue(ac) { return ac.status === 'Open' && ac.due && ac.due < TODAY; }
  function progressOf(a) {
    var items = [];
    items.push(!!(a.q1 && a.q1.trim())); items.push(!!a.q3);
    items.push(!!a.q4); if (a.q4 === 'Yes') { items.push(!!a.q4d.trim()); }
    items.push(!!a.q5); if (a.q5 === 'Yes') { items.push(!!a.q5d.trim()); }
    items.push(!!a.q6); if (a.q6 === 'Yes') { items.push(!!a.q6what.trim()); }
    a.q8.forEach(function (x) { items.push(!!x.rating); });
    items.push(!!a.q9);
    var done = items.filter(Boolean).length;
    return { total: items.length, done: done, pct: Math.round(done / items.length * 100) };
  }
  function missingItems(a) {
    var m = [];
    if (!a.q1.trim()) { m.push('Q1 What has gone well'); }
    if (!a.q3) { m.push('Q3 Workload'); }
    if (!a.q4) { m.push('Q4 Yes/No'); } else if (a.q4 === 'Yes' && !a.q4d.trim()) { m.push('Q4 details'); }
    if (!a.q5) { m.push('Q5 Yes/No'); } else if (a.q5 === 'Yes' && !a.q5d.trim()) { m.push('Q5 details'); }
    if (!a.q6) { m.push('Q6 Yes/No'); } else if (a.q6 === 'Yes' && !a.q6what.trim()) { m.push('Q6 details'); }
    if (a.q8.some(function (x) { return !x.rating; })) { m.push('Q8 a rating for each expectation'); }
    if (!a.q9) { m.push('Q9 Follow-up'); }
    return m;
  }
  function clearHidden(a) {
    if (a.q4 !== 'Yes') { a.q4d = ''; }
    if (a.q5 !== 'Yes') { a.q5d = ''; }
    if (a.q6 !== 'Yes') { a.q6what = ''; a.q6why = ''; }
  }

  // ---------------------------------------------------------------------------------------------
  // writes (the only places data leaves the page – rule S6)
  // ---------------------------------------------------------------------------------------------
  // Technician: Monthly Reviews, own item only (SharePoint enforces it).
  function techFields(r, status) {
    var a = r.answers;
    clearHidden(a);
    return {
      Q1WentWell: a.q1, Q2Issue: a.q2.issue, Q2Impact: a.q2.impact, Q2Tried: a.q2.tried, Q2Support: a.q2.support,
      Q3WorkloadRating: a.q3 || '', Q3WorkloadComment: a.q3c,
      Q4WellbeingRaise: a.q4 || '', Q4WellbeingDetail: a.q4d,
      Q5PlanningRaise: a.q5 || '', Q5PlanningDetail: a.q5d,
      Q6DevRaise: a.q6 || '', Q6DevWhat: a.q6what, Q6DevWhy: a.q6why,
      Q7ManagerFeedback: a.q7,
      ExpectationsJson: JSON.stringify(r.snapshot.map(function (e) {
        var x = a.q8.find(function (q) { return String(q.id) === String(e.id); }) || {};
        return { id: e.id, title: e.title, measures: e.measures, year: e.year, rating: x.rating || null, comment: x.comment || '' };
      })),
      Q9FollowUp: a.q9 || '',
      Mood: a.mood || '', WinOfMonth: a.win,
      ReviewStatus: status
    };
  }
  function actionsSummary(actions) {
    var open = actions.filter(function (a) { return a.status === 'Open'; });
    var due = open.map(function (a) { return a.due; }).filter(Boolean).sort()[0] || '';
    return { ActionsJson: JSON.stringify(actions), ActionsStatus: actions.length ? (open.length ? 'Open' : 'Done') : 'None', NextActionDue: spDate(due) };
  }
  // Team Leader: Manager Reviews feedback (never the state – that is a separate write).
  function mgrFields(r) {
    var fb = r.fb;
    var f = {
      FB_Q1: fb.q1, FB_Q2: fb.q2, FB_Q3: fb.q3, FB_Q4: fb.q4, FB_Q5: fb.q5, FB_Q6: fb.q6, FB_Q7: fb.q7, FB_Q9: fb.q9, FB_Overall: fb.overall,
      ExpectationFeedbackJson: JSON.stringify(r.snapshot.map(function (e) { return { id: e.id, feedback: fb.exp[e.id] || '', rating: fb.expRating[e.id] || null }; })),
      FollowUpDecision: fb.followOverride || '', MeetingDate: spDate(fb.meeting)
    };
    var sum = actionsSummary(fb.actions);
    Object.keys(sum).forEach(function (k) { f[k] = sum[k]; });
    return f;
  }
  async function busy(label, fn) {
    busyCount += 1; renderBusy();
    try { return await fn(); }
    catch (e) { toast(String(e && e.message ? e.message : e), true); throw e; }
    finally { busyCount -= 1; renderBusy(); }
  }
  function renderBusy() {
    if (!root) { return; }
    var b = root.querySelector('.oto-busy');
    if (busyCount > 0 && !b) { root.appendChild(h('div', { class: 'oto-busy', role: 'status', text: 'Saving…' })); }
    if (busyCount <= 0 && b) { b.remove(); }
  }

  // ---------------------------------------------------------------------------------------------
  // feedback UI
  // ---------------------------------------------------------------------------------------------
  function toast(msg, isErr) {
    if (!root) { return; }
    var t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status', text: msg });
    root.appendChild(t); if (live) { live.textContent = msg; }
    setTimeout(function () { t.remove(); }, isErr ? 6000 : 3200);
  }
  function confirmBox(title, body, okText, onOk) {
    var back = h('div', { class: 'modal-back' });
    var ok = h('button', { class: 'btn primary', type: 'button', text: okText, onclick: function () { back.remove(); onOk(); } });
    back.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('h3', { text: title }), h('p', { text: body }),
      h('div', { class: 'btn-row' }, [ok, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: function () { back.remove(); } })])
    ]));
    root.appendChild(back); ok.focus();
  }
  function confetti() {
    var wrap = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    var cols = ['#ef7d3a', '#1f7190', '#2f9a63', '#d99a12', '#6a4fb0', '#2a78d6'];
    for (var i = 0; i < 90; i++) {
      var p = h('i');
      p.style.left = Math.random() * 100 + 'vw'; p.style.background = cols[i % cols.length];
      p.style.animationDuration = (2.2 + Math.random() * 1.8) + 's'; p.style.animationDelay = (Math.random() * 0.5) + 's';
      wrap.appendChild(p);
    }
    root.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 4300);
  }
  function tip(el, text) {
    el.addEventListener('mouseenter', function (e) { if (!tipEl) { return; } tipEl.textContent = typeof text === 'function' ? text() : text; tipEl.style.display = 'block'; moveTip(e); });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', function () { if (tipEl) { tipEl.style.display = 'none'; } });
    return el;
  }
  function moveTip(e) { if (tipEl) { tipEl.style.left = (e.clientX + 14) + 'px'; tipEl.style.top = (e.clientY + 14) + 'px'; } }
  function go(view, extra) {
    if (dirty && !window.confirm('You have unsaved changes. Leave this page without saving?')) { return; }
    dirty = false;
    state.view = view; Object.keys(extra || {}).forEach(function (k) { state[k] = extra[k]; });
    render(true);
  }
  function markDirty() { dirty = true; }

  // ---------------------------------------------------------------------------------------------
  // generic UI pieces
  // ---------------------------------------------------------------------------------------------
  function card(title, sub, children, cls, right) {
    return h('section', { class: 'card ' + (cls || '') }, [
      title ? h('div', { class: 'card-h' }, [h('div', null, [h('h2', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null]), right || null]) : null
    ].concat(children));
  }
  function tile(label, value, sub, cls) {
    return h('div', { class: 'tile ' + (cls || '') }, [h('div', { class: 'tl', text: label }),
      typeof value === 'string' ? h('div', { class: 'tv', text: value }) : h('div', { class: 'tv' }, value),
      h('div', { class: 'ts' }, sub || '')]);
  }
  function bandChip(score, big) {
    var b = bandFor(score);
    return b ? h('span', { class: 'band ' + b.cls + (big ? ' big' : ''), text: b.name }) : h('span', { class: 'muted', text: 'Not enough data' });
  }
  function track(score) {
    return h('div', { class: 'track' }, score === null || score === undefined ? [] : [h('i', { style: 'left:' + ((score - 1) / 4 * 100) + '%' })]);
  }
  function chipFor(r) {
    if (!r) { return h('span', { class: 'chip', text: 'No review yet' }); }
    if (r.state === 'Completed') { return h('span', { class: 'chip green', text: 'Completed' + (r.late ? ' (late)' : '') }); }
    if (r.state === 'Submitted') { return h('span', { class: 'chip blue', text: (IS_TL ? 'Awaiting review' : 'Submitted') + (r.late ? ' (late)' : '') }); }
    if (r.state === 'Closed - Not Submitted') { return h('span', { class: 'chip', text: 'Closed – not submitted' }); }
    if (isOverdue(r)) { return h('span', { class: 'chip red', text: 'Overdue' }); }
    return h('span', { class: 'chip', text: r.draft ? 'Draft' : 'Not started' });
  }
  function textBox(label, value, onInput, disabled, rows) {
    var id = nid('t');
    var ta = h('textarea', { id: id, rows: rows || 3 });
    ta.value = value || ''; ta.disabled = !!disabled;
    ta.addEventListener('input', function () { markDirty(); onInput(ta.value); });
    return h('div', null, [label ? h('label', { class: 'field', for: id, text: label }) : null, ta]);
  }
  // Date entry in DD-MMM-YYYY (no native picker, which follows the browser locale)
  function dateField(iso, onChange, label) {
    var inp = h('input', { type: 'text', class: 'datef', 'aria-label': (label || 'Date') + ' (DD-MMM-YYYY)', title: 'DD-MMM-YYYY, e.g. 12-Mar-2027' });
    inp.value = fmtDate(iso);
    inp.addEventListener('change', function () {
      markDirty();
      if (!inp.value.trim()) { inp.classList.remove('bad'); onChange(''); return; }
      var v = parseDate(inp.value);
      if (v) { inp.value = fmtDate(v); inp.classList.remove('bad'); onChange(v); }
      else { inp.classList.add('bad'); onChange(''); toast('Use DD-MMM-YYYY, e.g. 12-Mar-2027.', true); }
    });
    return inp;
  }
  function seg(labels, value, onChange, disabled, wide, titles) {
    var g = h('div', { class: 'seg' + (wide ? ' wide' : ''), role: 'radiogroup' });
    labels.forEach(function (lab, i) {
      var v = lab.value, on = value !== null && value !== undefined && String(value) === String(v);
      var b = h('button', { type: 'button', role: 'radio', 'aria-pressed': on ? 'true' : 'false', 'aria-checked': on ? 'true' : 'false', disabled: !!disabled, text: lab.text });
      if (titles) { tip(b, titles[i]); }
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(g.children, function (c) { c.setAttribute('aria-pressed', 'false'); c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-pressed', 'true'); b.setAttribute('aria-checked', 'true');
        markDirty(); onChange(v);
      });
      g.appendChild(b);
    });
    return g;
  }
  function ynSeg(value, onChange, disabled) { return seg([{ value: 'Yes', text: 'Yes' }, { value: 'No', text: 'No' }], value, onChange, disabled, true); }
  function ratingSeg(value, onChange, disabled) {
    return seg([1, 2, 3, 4, 5].map(function (n) { return { value: n, text: String(n) }; }), value, onChange, disabled, false,
      PROGRESS.map(function (p) { return p.value + ' – ' + p.title + '\n' + p.desc; }));
  }
  function choiceGroup(label, options, value, onChange, disabled, cls) {
    var name = nid('g');
    var group = h('div', { class: 'choices ' + (cls || ''), role: 'radiogroup', 'aria-label': label });
    options.forEach(function (o) {
      var id = nid('c');
      var input = h('input', { type: 'radio', name: name, id: id, value: String(o.value) });
      input.checked = value !== null && value !== undefined && String(value) === String(o.value);
      input.disabled = !!disabled;
      input.addEventListener('change', function () { markDirty(); onChange(o.value); });
      group.appendChild(h('label', { class: 'choice', for: id }, [input, h('span', { class: 'ct', text: o.title }), o.desc ? h('span', { class: 'cd', text: o.desc }) : null]));
    });
    return group;
  }
  function qCard(numb, title, right, children) {
    return h('section', { class: 'card' }, [
      h('div', { class: 'q-head' + (children && children.length ? '' : ' only') }, [h('h3', null, [h('span', { class: 'qnum', text: String(numb) }), title]), right || null])
    ].concat(children || []));
  }
  function table(headers, rows, opts) {
    opts = opts || {};
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, [
      h('thead', null, h('tr', null, headers.map(function (x) { return h('th', { scope: 'col', text: x }); }))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: String(headers.length), class: 'muted', text: opts.empty || 'Nothing to show.' })))
    ]));
  }
  function tr(cells, cls) { return h('tr', { class: cls || null }, cells.map(function (c) { return c && c.tagName === 'TD' ? c : h('td', null, c === null || c === undefined ? '—' : c); })); }
  function legend(items) {
    return h('div', { class: 'legend' }, items.map(function (it) {
      return h('span', null, [h('i', { class: 'sw' + (it.dash ? ' dash' : ''), style: it.dash ? null : 'background:' + it.color }), it.label]);
    }));
  }
  function moodEmoji(v) { var m = MOODS.find(function (x) { return x.value === v; }); return m ? m.emo + ' ' + m.label : '—'; }
  function howWorked() {
    return h('details', { class: 'how' }, [
      h('summary', { text: 'ⓘ How the expected outcome is worked out' }),
      h('ol', null, [
        h('li', { text: 'The appraisal period is the 12 months up to each technician\'s appraisal date.' }),
        h('li', { text: 'Each submitted month gets a score: the average of the 1–5 ratings across all expectations. Where you have rated, your rating is used; otherwise the self-rating. Technicians only see your rating once a review is released.' }),
        h('li', { text: 'Current position = the average of those monthly scores, with recent months counting more.' }),
        h('li', { text: 'Projected = where the trend line puts them now, plus half of the trend carried forward to the appraisal date – a cautious estimate, never more than 0.75 from where they are now. With fewer than 3 months, the current position is used.' }),
        h('li', { text: 'The projected score is matched to the bands set below.' })
      ])
    ]);
  }

  // ---------------------------------------------------------------------------------------------
  // charts (SVG nodes only)
  // ---------------------------------------------------------------------------------------------
  function trendChart(tech, o, height) {
    var p = o.period, months = [];
    for (var k = 1; k <= 12; k++) { months.push(addMonths(p.start, k)); }
    var W = 640, H = height || 230, pl = 30, pr = 14, pt = 10, pb = 24, iw = W - pl - pr, ih = H - pt - pb, n = months.length;
    var x = function (i) { return pl + i * iw / (n - 1); }, y = function (v) { return pt + (5 - v) / 4 * ih; };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Monthly rating trend' });
    var lo = 1;
    SETTINGS.bands.forEach(function (b) { var hi = clamp(b.max, 1, 5); if (hi > lo) { svg.appendChild(s('rect', { x: pl, y: y(hi), width: iw, height: y(lo) - y(hi), fill: BAND_TINT[b.cls] })); } lo = Math.max(lo, hi); });
    [1, 2, 3, 4, 5].forEach(function (v) {
      svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: '#ffffff', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: pl - 8, y: y(v) + 4, 'text-anchor': 'end', text: String(v) }));
    });
    months.forEach(function (m, i) {
      var t = s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', text: monthShort(m) });
      if (m === p.end) { t.setAttribute('font-weight', '700'); t.setAttribute('style', 'fill:#16222c'); }
      svg.appendChild(t);
    });
    var idx = function (m) { return months.indexOf(m); };
    function series(key, color, name) {
      var pts = o.pts.filter(function (pt) { return pt[key] !== null && idx(pt.month) >= 0; });
      if (!pts.length) { return; }
      var d = pts.map(function (pt, i) { return (i ? 'L' : 'M') + x(idx(pt.month)).toFixed(1) + ' ' + y(pt[key]).toFixed(1); }).join(' ');
      svg.appendChild(s('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      pts.forEach(function (pt) {
        svg.appendChild(s('circle', { cx: x(idx(pt.month)), cy: y(pt[key]), r: 4, fill: color, stroke: '#fff', 'stroke-width': 2 }));
        var hit = s('circle', { cx: x(idx(pt.month)), cy: y(pt[key]), r: 11, fill: 'transparent' });
        tip(hit, name + ' – ' + monthLabel(pt.month) + '\n' + pt[key].toFixed(1) + ' / 5 (' + bandFor(pt[key]).name + ')');
        svg.appendChild(hit);
      });
    }
    series('self', C_SELF, 'Self-rating');
    series('tl', C_TL, 'Team Leader rating');
    if (o.pts.length && o.projected !== null) {
      var lastPt = o.pts[o.pts.length - 1], li = idx(lastPt.month), ei = idx(p.end);
      if (li >= 0 && ei > li) {
        svg.appendChild(s('line', { x1: x(li), y1: y(lastPt.used), x2: x(ei), y2: y(o.projected), stroke: '#16222c', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }));
        svg.appendChild(s('circle', { cx: x(ei), cy: y(o.projected), r: 5, fill: '#fff', stroke: '#16222c', 'stroke-width': 2 }));
        var hit = s('circle', { cx: x(ei), cy: y(o.projected), r: 12, fill: 'transparent' });
        tip(hit, 'Projected at appraisal (' + fmtDate(p.apDate) + ')\n' + o.projected.toFixed(1) + ' / 5 – ' + o.band.name);
        svg.appendChild(hit);
        svg.appendChild(s('text', { x: x(ei) - 8, y: y(o.projected) - 10, 'text-anchor': 'end', style: 'fill:#16222c;font-weight:700', text: 'Projected ' + o.projected.toFixed(1) }));
      }
    }
    return h('div', null, [legend([{ color: C_SELF, label: 'Self-rating' }, { color: C_TL, label: 'Team Leader rating' }, { dash: true, label: 'Projection to appraisal' }]), svg]);
  }
  function colChart(items, max, color, height, name, width) {
    var W = width || 640, H = height || 170, pl = 26, pr = 10, pt = 14, pb = 22, iw = W - pl - pr, ih = H - pt - pb, n = Math.max(1, items.length);
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': name });
    for (var v = 1; v <= max; v++) {
      svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: pt + ih - v / max * ih, y2: pt + ih - v / max * ih, stroke: '#edf0f3' }));
      svg.appendChild(s('text', { x: pl - 7, y: pt + ih - v / max * ih + 4, 'text-anchor': 'end', text: String(v) }));
    }
    svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: pt + ih, y2: pt + ih, stroke: '#c9d1d9' }));
    var bw = Math.min(34, iw / n * 0.55);
    items.forEach(function (it, i) {
      var cx = pl + (i + 0.5) * iw / n;
      svg.appendChild(s('text', { x: cx, y: H - 6, 'text-anchor': 'middle', text: it.label }));
      if (it.value === null || it.value === undefined) { return; }
      var bh = it.value / max * ih, x0 = cx - bw / 2, y0 = pt + ih - bh, r = Math.min(4, bh);
      var d = 'M' + x0 + ' ' + (pt + ih) + ' L' + x0 + ' ' + (y0 + r) + ' Q' + x0 + ' ' + y0 + ' ' + (x0 + r) + ' ' + y0 + ' L' + (x0 + bw - r) + ' ' + y0 + ' Q' + (x0 + bw) + ' ' + y0 + ' ' + (x0 + bw) + ' ' + (y0 + r) + ' L' + (x0 + bw) + ' ' + (pt + ih) + ' Z';
      svg.appendChild(s('path', { d: d, fill: it.color || color }));
      var hit = s('rect', { x: cx - iw / n / 2, y: pt, width: iw / n, height: ih, fill: 'transparent' });
      tip(hit, it.tipText || (it.label + ': ' + it.value));
      svg.appendChild(hit);
    });
    return svg;
  }
  function sparkline(values, color) {
    var W = 90, H = 26, vals = values.filter(function (v) { return v !== null; });
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' });
    if (vals.length < 2) { return svg; }
    var x = function (i) { return 3 + i * (W - 6) / (vals.length - 1); }, y = function (v) { return 3 + (5 - v) / 4 * (H - 6); };
    svg.appendChild(s('path', { d: vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.75 }));
    svg.appendChild(s('circle', { cx: x(vals.length - 1), cy: y(vals[vals.length - 1]), r: 3, fill: color }));
    return svg;
  }
  function stackBar(segs) {
    var total = segs.reduce(function (t, x) { return t + x.count; }, 0) || 1;
    var bar = h('div', { class: 'stackbar' }, segs.filter(function (x) { return x.count; }).map(function (x) {
      return tip(h('div', { style: 'flex:' + x.count + ';background:' + x.color }), x.label + ': ' + x.count + ' of ' + total);
    }));
    var lg = h('div', { class: 'slegend' }, segs.map(function (x) { return h('div', null, [h('i', { class: 'dot', style: 'background:' + x.color }), x.label, h('b', { text: String(x.count) })]); }));
    return h('div', null, [bar, lg]);
  }
  function pairBars(perExp) {
    if (!perExp.length) { return h('p', { class: 'muted', text: 'No appraisal expectations yet.' }); }
    return h('div', null, [legend([{ color: C_SELF, label: 'Latest self-rating' }, { color: C_TL, label: 'Latest Team Leader rating' }]),
      h('div', { class: 'pairbars' }, perExp.map(function (x) {
        function bar(v, c, who) {
          return [tip(h('div', { class: 'bar' }, v ? h('i', { style: 'width:' + (v / 5 * 100) + '%;background:' + c }) : null), x.e.title + '\n' + who + ': ' + (v ? v + ' – ' + PROGRESS[v - 1].title : 'not rated yet')),
            h('div', { class: 'v', text: v ? String(v) : '—' })];
        }
        return h('div', { class: 'row' }, [h('div', { class: 'lbl', title: x.e.title, text: x.e.title })].concat(bar(x.latestSelf, C_SELF, 'Self')).concat(bar(x.latestTl, C_TL, 'Team Leader')));
      }))]);
  }

  // ---------------------------------------------------------------------------------------------
  // TECHNICIAN – this month
  // ---------------------------------------------------------------------------------------------
  function techView() {
    var mine = reviewsOf(ME).slice().reverse();
    if (!mine.length) {
      return card('No 1-to-1 yet', null, [h('p', { text: 'You don\'t have a monthly 1-to-1 yet. It is created on the 1st of each month and you will receive an email with the link. If you think this is wrong, speak to your Team Leader.' })]);
    }
    var r = REVIEWS.find(function (x) { return x.id === state.reviewId; });
    if (state.reviewId && !r) {
      return card('Review not found', null, [h('p', { text: 'This review could not be found, or it isn\'t yours. Use the link in your latest email or contact your Team Leader.' })]);
    }
    r = r || mine[0];
    state.reviewId = r.id;
    var a = r.answers, editable = r.state === 'Open', ro = !editable;

    var missingBox = h('div', { 'aria-live': 'polite' });
    var meterFill = h('i'), meterTxt = h('span', { class: 'small muted' });
    function refresh() {
      if (!editable) { return; }
      var pr = progressOf(a);
      meterFill.style.width = pr.pct + '%';
      meterTxt.textContent = pr.pct === 100 ? 'All done — ready to submit ✓' : pr.done + ' of ' + pr.total + ' complete';
      missingBox.textContent = '';
      var m = missingItems(a);
      missingBox.appendChild(m.length ? h('div', { class: 'missing' }, [h('strong', { text: 'Still to complete: ' }), m.join(' · ')])
        : h('div', { class: 'done', text: 'Everything required is complete – you can submit when ready.' }));
    }
    var monthSel = h('select', { 'aria-label': 'Choose a month', style: 'width:180px', onchange: function () { go('tech', { reviewId: Number(monthSel.value) }); } },
      mine.map(function (x) { var o = h('option', { value: String(x.id), text: monthLabel(x.month) }); o.selected = x.id === r.id; return o; }));
    function save() {
      return busy('save', async function () {
        await spUpdate(CONFIG.lists.reviews, r.id, techFields(r, 'Draft'));
        r.draft = true; r.status = 'Draft'; dirty = false;
        toast('Draft saved at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '.');
      });
    }
    function submit() {
      var m = missingItems(a);
      if (m.length) { toast('Please complete: ' + m.join(', '), true); missingBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      confirmBox('Submit your 1-to-1?', "You won't be able to change it afterwards. Your Team Leader will be notified.", 'Submit', function () {
        busy('submit', async function () {
          await spUpdate(CONFIG.lists.reviews, r.id, techFields(r, 'Submitted'));
          r.state = 'Submitted'; r.status = 'Submitted'; dirty = false;
          confetti(); toast('🎉 Nice one — ' + monthShort(r.month) + ' done! Your Team Leader has been notified.'); render(false);
        }).catch(function () {});
      });
    }
    var dl = daysLeft(r);
    var head = h('div', { class: 'pagehead sticky', style: 'display:block' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:16px' }, [
        h('div', { class: 'ph-l' }, [h('h2', { text: 'Monthly 1-to-1' }), monthSel, chipFor(r),
          editable ? h('span', { class: 'chip ' + (dl < 0 ? 'red' : dl <= 3 ? 'amber' : 'green'), text: dl < 0 ? Math.abs(dl) + ' days overdue – you can still submit' : dl === 0 ? 'Due today' : dl + ' days left' }) : null,
          h('span', { class: 'meta', text: 'Deadline 23:59, ' + fmtDate(r.due) })]),
        editable ? h('div', { class: 'btn-row' }, [meterTxt, h('button', { class: 'btn', type: 'button', text: 'Save draft', onclick: function () { save().catch(function () {}); } }),
          h('button', { class: 'btn primary', type: 'button', text: 'Submit', onclick: submit })])
          : h('span', { class: 'muted', text: r.released ? 'Read-only – feedback released' : 'Submitted – awaiting your Team Leader' })
      ]),
      editable ? h('div', { class: 'meter' }, meterFill) : null
    ]);

    function fbBlock(text) { return r.released && text ? h('div', { class: 'feedback' }, [h('b', { text: 'Team Leader' }), text]) : null; }
    var cards = [];
    cards.push(qCard(1, 'What has gone well for you this month?', null, [
      textBox(null, a.q1, function (v) { a.q1 = v; refresh(); }, ro, 3), fbBlock(r.fb.q1)]));
    cards.push(qCard(2, 'Challenges, blockers and support needed', h('span', { class: 'small muted', text: 'Optional' }), [
      h('div', { class: 'fgrid c4' }, [
        textBox("What's the issue?", a.q2.issue, function (v) { a.q2.issue = v; }, ro, 3),
        textBox("What's the impact?", a.q2.impact, function (v) { a.q2.impact = v; }, ro, 3),
        textBox('What have you tried?', a.q2.tried, function (v) { a.q2.tried = v; }, ro, 3),
        textBox('What support is needed?', a.q2.support, function (v) { a.q2.support = v; }, ro, 3)
      ]), fbBlock(r.fb.q2)]));
    cards.push(qCard(3, 'How would you rate your current workload?', null, [
      choiceGroup('Workload rating', WORKLOAD, a.q3, function (v) { a.q3 = v; refresh(); }, ro, 'c5'),
      h('div', { class: 'detail' }, textBox('Comments (optional)', a.q3c, function (v) { a.q3c = v; }, ro, 2)), fbBlock(r.fb.q3)]));
    function ynCard(numb, title, key, detailFn) {
      var detail = h('div', { class: 'detail' }, detailFn());
      detail.hidden = a[key] !== 'Yes';
      return qCard(numb, title, ynSeg(a[key], function (v) { a[key] = v; detail.hidden = v !== 'Yes'; refresh(); }, ro), [detail, fbBlock(r.fb[key])].filter(Boolean));
    }
    cards.push(ynCard(4, 'Is there anything relating to your wellbeing, workplace support or reasonable adjustments you would like to raise?', 'q4', function () {
      return textBox('What would you like to raise?', a.q4d, function (v) { a.q4d = v; refresh(); }, ro, 3); }));
    cards.push(ynCard(5, 'Is there anything upcoming that your line manager should be aware of for planning purposes?', 'q5', function () {
      return textBox('Please give details', a.q5d, function (v) { a.q5d = v; refresh(); }, ro, 3); }));
    cards.push(ynCard(6, 'Do you have any training, development requirements or career aspirations you would like to discuss?', 'q6', function () {
      return h('div', { class: 'fgrid c2' }, [textBox('What would you like?', a.q6what, function (v) { a.q6what = v; refresh(); }, ro, 3),
        textBox('Why / what would it help with?', a.q6why, function (v) { a.q6why = v; }, ro, 3)]); }));
    cards.push(qCard(7, 'Do you have any feedback for your line manager?', h('span', { class: 'small muted', text: 'Optional' }), [
      textBox(null, a.q7, function (v) { a.q7 = v; }, ro, 3), fbBlock(r.fb.q7)]));

    var expHead = ['Expectation', 'Your rating', 'Evidence / comments'];
    if (r.released) { expHead = expHead.concat(['Team Leader']); }
    var expRows = r.snapshot.map(function (e) {
      var ans = a.q8.find(function (x) { return String(x.id) === String(e.id); });
      var lbl = h('div', { class: 'small muted', style: 'margin-top:4px', text: ans.rating ? PROGRESS[ans.rating - 1].title : 'Not rated' });
      var cells = [
        h('td', { class: 'top', style: 'width:32%' }, [h('div', { style: 'font-weight:650', text: e.title }), h('div', { class: 'small muted', text: e.measures })]),
        h('td', { class: 'top', style: 'width:200px' }, [ratingSeg(ans.rating, function (v) { ans.rating = v; lbl.textContent = PROGRESS[v - 1].title; refresh(); }, ro), lbl]),
        h('td', { class: 'top' }, textBox(null, ans.comment, function (v) { ans.comment = v; }, ro, 2))
      ];
      if (r.released) {
        var tv = r.fb.expRating[e.id];
        cells.push(h('td', { class: 'top', style: 'width:24%' }, [h('div', { style: 'font-weight:650', text: tv ? tv + ' – ' + PROGRESS[tv - 1].title : 'Not rated' }), r.fb.exp[e.id] ? h('div', { class: 'small', text: r.fb.exp[e.id] }) : null]));
      }
      return h('tr', null, cells);
    });
    cards.push(qCard(8, 'Appraisal expectations – how are you progressing?', h('span', { class: 'small muted', text: '1 Not started · 2 Early · 3 On track · 4 Strong · 5 Fully met' }), [
      r.snapshot.length ? table(expHead, expRows) : h('p', { class: 'muted', text: 'No appraisal expectations are set for you this month.' })]));
    cards.push(qCard(9, "How would you prefer to follow up on this month's review?", null, [
      choiceGroup('Follow-up preference', FOLLOW.map(function (f) { return { value: f, title: f }; }), a.q9, function (v) { a.q9 = v; refresh(); }, ro, 'c3'), fbBlock(r.fb.q9)]));
    if (r.released) {
      cards.push(card('Overall feedback and agreed actions', null, [
        h('div', { class: 'feedback', style: 'margin-top:0' }, [h('b', { text: 'Overall' }), r.fb.overall || '—']),
        h('div', { class: 'feedback' }, [h('b', { text: 'Follow-up' }), followOf(r) || '—']),
        r.fb.meeting ? h('div', { class: 'feedback' }, [h('b', { text: '1-to-1 meeting' }), fmtDate(r.fb.meeting)]) : null,
        h('div', { style: 'margin-top:12px' }, actionsTable(r.fb.actions.map(function (ac) { return { ac: ac, r: r }; }), {}))
      ]));
    }
    if (editable) {
      cards.push(missingBox);
      cards.push(h('div', { class: 'btn-row', style: 'justify-content:flex-end' }, [h('button', { class: 'btn', type: 'button', text: 'Save draft', onclick: function () { save().catch(function () {}); } }), h('button', { class: 'btn primary', type: 'button', text: 'Submit', onclick: submit })]));
    }
    refresh();
    return h('div', null, [head, h('div', { class: 'layout' }, [h('div', { class: 'stack' }, cards), h('aside', { class: 'stack side-sticky' }, techSide(r, mine))])]);
  }

  function techSide(r, mine) {
    var a = r.answers, editable = r.state === 'Open';
    var o = expectedOutcome(ME, 'tech');
    var moodLbl = h('span', { class: 'small muted', text: a.mood ? MOODS[a.mood - 1].label : 'Optional' });
    var mood = h('div', { class: 'mood', role: 'group', 'aria-label': 'Energy this month' }, MOODS.map(function (m) {
      var b = h('button', { type: 'button', 'aria-pressed': a.mood === m.value ? 'true' : 'false', 'aria-label': m.label, disabled: !editable, text: m.emo });
      tip(b, m.label);
      b.addEventListener('click', function () {
        a.mood = a.mood === m.value ? null : m.value; markDirty();
        Array.prototype.forEach.call(mood.children, function (c, i) { c.setAttribute('aria-pressed', a.mood === MOODS[i].value ? 'true' : 'false'); });
        moodLbl.textContent = a.mood ? MOODS[a.mood - 1].label : 'Optional';
      });
      return b;
    }));
    var energy = h('section', { class: 'card side-tile' }, [h('h3', null, ['Energy this month', moodLbl]), mood,
      h('div', { class: 'small muted', style: 'margin-top:6px', text: 'Shared with your Team Leader.' })]);
    var p = periodFor(ME), days = daysBetween(TODAY, p.apDate);
    var outlook = h('section', { class: 'card side-tile' }, [
      h('h3', null, ['Appraisal outlook', h('button', { class: 'btn small ghost', type: 'button', text: 'My appraisal →', onclick: function () { go('myapp'); } })]),
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [
        h('div', { class: 'big-score' }, [f1(o.projected), h('small', { text: ' / 5 projected' })]), bandChip(o.projected, true)]),
      track(o.projected),
      h('dl', { class: 'kv' }, [h('dt', { text: 'Appraisal date' }), h('dd', { text: p.set ? fmtDate(p.apDate) + ' (' + days + ' days)' : 'Not set yet' }),
        h('dt', { text: 'Current position' }), h('dd', { text: f1(o.current) + ' / 5' }),
        h('dt', { text: 'Trend' }), h('dd', { text: (o.slope >= 0 ? '+' : '') + o.slope.toFixed(2) + ' per month' })])
    ]);
    var streak = streakOf(ME);
    var prior = mine.filter(function (x) { return x.month < r.month && x.state !== 'Open' && x.state !== 'Closed - Not Submitted'; })[0];
    var quick = h('section', { class: 'card side-tile' }, [
      h('h3', null, ['Quick actions', streak ? h('span', { class: 'chip orange', text: '🔥 ' + streak + ' month' + (streak === 1 ? '' : 's') + ' on time' }) : null]),
      h('div', { class: 'stack', style: 'gap:8px' }, [
        editable && prior ? h('button', { class: 'btn', type: 'button', text: '⟳ Same as last month', onclick: function () {
          var pa = prior.answers;
          ['mood', 'q1', 'q3', 'q3c', 'q4', 'q4d', 'q5', 'q5d', 'q6', 'q6what', 'q6why', 'q7', 'q9'].forEach(function (k) { a[k] = pa[k]; });
          a.q2 = { issue: pa.q2.issue, impact: pa.q2.impact, tried: pa.q2.tried, support: pa.q2.support };
          a.q8.forEach(function (x) { var q = pa.q8.find(function (y) { return String(y.id) === String(x.id); }); if (q) { x.rating = q.rating; x.comment = q.comment; } });
          dirty = true;
          toast('Copied your ' + monthLabel(prior.month) + ' answers — update anything that has changed, then Save draft.'); render(false);
          dirty = true;
        } }) : h('div', { class: 'small muted', text: editable ? 'Nothing to copy from last month.' : (r.released ? 'Feedback released.' : 'This month is submitted.') })
      ])
    ]);
    var win = h('section', { class: 'card side-tile' }, [h('h3', { text: '🏅 Win of the month' }),
      textBox(null, a.win, function (v) { a.win = v; }, !editable, 3)]);
    return [energy, outlook, quick, win];
  }

  // ---------------------------------------------------------------------------------------------
  // PROFILE / MY APPRAISAL (technician sees their own; TL sees any technician)
  // ---------------------------------------------------------------------------------------------
  function profileView(tech, aud) {
    var o = expectedOutcome(tech, aud), p = o.period, days = daysBetween(TODAY, p.apDate);
    var ot = onTimeOf(tech), acts = actionsOf(function (ac, r) { return r.tech === tech; }, aud);
    var openActs = acts.filter(function (x) { return x.ac.status === 'Open'; });
    var head = h('div', { class: 'pagehead' }, [
      h('div', { class: 'ph-l' }, [
        aud === 'tl' ? h('button', { class: 'btn small ghost', type: 'button', text: '← Team overview', onclick: function () { go('team'); } }) : null,
        h('h2', { text: aud === 'tl' ? tech : 'My appraisal' }),
        h('span', { class: 'meta', text: 'Appraisal period ' + monthLabel(addMonths(p.start, 1)) + ' – ' + monthLabel(p.end) }),
        h('span', { class: 'chip ' + (p.set ? 'blue' : 'amber'), text: p.set ? 'Appraisal ' + fmtDate(p.apDate) : 'Appraisal date not set' })
      ]),
      h('button', { class: 'btn primary', type: 'button', text: '📄 Generate appraisal report', onclick: function () { state.report = { tech: tech, aud: aud }; render(false); } })
    ]);
    var tiles = h('div', { class: 'tiles', style: 'margin-top:14px' }, [
      tile('Expected outcome', [bandChip(o.projected, true)], 'Projected at appraisal'),
      tile('Projected score', [f1(o.projected), h('small', { text: ' / 5' })], 'Trend ' + (o.slope >= 0 ? '+' : '') + o.slope.toFixed(2) + ' per month'),
      tile('Current position', [f1(o.current), h('small', { text: ' / 5' })], 'Self ' + f1(o.selfAvg) + ' · Team Leader ' + f1(o.tlAvg)),
      tile('Days to appraisal', p.set ? String(Math.max(0, days)) : '—', p.set ? fmtDate(p.apDate) : 'Not set', p.set && days <= 30 ? 'warn' : ''),
      tile('On-time submissions', [String(ot.onTime), h('small', { text: ' of ' + ot.total })], 'In the appraisal period'),
      tile('Open actions', String(openActs.length), acts.filter(function (x) { return acOverdue(x.ac); }).length + ' overdue', acts.some(function (x) { return acOverdue(x.ac); }) ? 'bad' : '')
    ]);
    var rows = [h('div', { class: 'grid2' }, [
      card('Rating trend', 'Monthly score on the 1–5 scale; shading shows the bands', [trendChart(tech, o, 300)]),
      card('Expectations – where each one stands', 'Most recent rating in the period', [pairBars(o.perExp)])
    ])];
    var prs = periodReviews(tech).filter(function (r) { return r.month <= CUR; });
    if (aud === 'tl') {
      rows.push(h('div', { class: 'grid2' }, [
        card('Workload by month', '1 very light – 5 excessive', [colChart(prs.map(function (r) {
          var v = isIn(r) ? r.answers.q3 : null;
          return { label: monthShort(r.month), value: v, color: v >= 5 ? '#d14b4b' : v === 4 ? '#d99a12' : '#1f7190', tipText: monthLabel(r.month) + ': ' + (v ? WORKLOAD[v - 1].title : 'not submitted') };
        }), 5, '#1f7190', 170, 'Workload by month')]),
        card('Energy by month', '1 running low – 5 full charge', [colChart(prs.map(function (r) {
          var v = r.answers.mood || null;
          return { label: monthShort(r.month), value: v, tipText: monthLabel(r.month) + ': ' + moodEmoji(v) };
        }), 5, '#6a4fb0', 170, 'Energy by month')])
      ]));
    }
    var wins = prs.filter(function (r) { return r.answers.win; }).slice().reverse();
    rows.push(card('Actions', openActs.length + ' open · ' + (acts.length - openActs.length) + ' closed', [actionsTable(acts, { showMonth: true })]));
    rows.push(card('Wins & achievements', wins.length + ' logged in the period', [h('div', { class: 'list cols' }, wins.length ? wins.map(function (r) {
      return h('div', { class: 'li' }, [h('b', { text: monthLabel(r.month) }), r.answers.win]);
    }) : [h('div', { class: 'muted', text: 'None logged yet.' })])]));
    if (aud === 'tl') {
      rows.push(card('Monthly reviews in the period', null, [table(['Month', 'Status', 'Submitted', 'Self avg', 'Your avg', 'Workload', 'Energy', ''],
        prs.slice().reverse().map(function (r) {
          return tr([monthLabel(r.month), chipFor(r), r.submittedOn ? fmtDate(r.submittedOn) : '—', isIn(r) ? f1(selfAvg(r)) : '—', isIn(r) ? f1(mgrAvg(r)) : '—',
            isIn(r) && r.answers.q3 ? r.answers.q3 + ' / 5' : '—', r.answers.mood ? moodEmoji(r.answers.mood) : '—',
            h('button', { class: 'btn small', type: 'button', text: 'Open', onclick: function () { go('mgr', { reviewId: r.id, backTo: 'profile' }); } })]);
        }))]));
    }
    return h('div', null, [head, tiles, h('div', { class: 'stack', style: 'margin-top:14px' }, rows)]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – team overview
  // ---------------------------------------------------------------------------------------------
  function teamView() {
    if (!TECHS.length) {
      return card('No technicians yet', null, [h('p', { text: 'Add your technicians to the Technicians list (Active = Yes), then set their appraisal dates in ⚙ Settings. Flow 1 creates their reviews on its next run.' })]);
    }
    var cur = TECHS.map(currentOf).filter(Boolean);
    var outs = {};
    TECHS.forEach(function (t) { outs[t] = expectedOutcome(t, 'tl'); });
    function cnt(f) { return cur.filter(f).length; }
    var allActs = actionsOf(null, 'tl'), openA = allActs.filter(function (x) { return x.ac.status === 'Open'; });
    var nextAp = TECHS.filter(function (t) { return apDateOf(t) && apDateOf(t) >= TODAY; }).sort(function (x, y) { return apDateOf(x) < apDateOf(y) ? -1 : 1; })[0];
    var tiles = h('div', { class: 'tiles' }, [
      tile('Submitted – ' + monthShort(CUR), [String(cnt(isIn)), h('small', { text: ' of ' + TECHS.length })], cnt(function (r) { return r.state === 'Completed'; }) + ' completed'),
      tile('Awaiting your review', String(cnt(function (r) { return r.state === 'Submitted'; })), 'Submitted, not yet released', cnt(function (r) { return r.state === 'Submitted'; }) ? 'warn' : ''),
      tile('Not yet submitted', String(cnt(function (r) { return r.state === 'Open'; })), cnt(isOverdue) + ' overdue · due ' + fmtDate(lastDay(CUR)), cnt(isOverdue) ? 'bad' : ''),
      tile('Dedicated 1-to-1s requested', String(cnt(function (r) { return followOf(r) === DEDICATED; })), 'From this month\'s follow-up answers', cnt(function (r) { return followOf(r) === DEDICATED; }) ? 'warn' : ''),
      tile('Open actions', String(openA.length), openA.filter(function (x) { return acOverdue(x.ac); }).length + ' overdue', openA.some(function (x) { return acOverdue(x.ac); }) ? 'bad' : ''),
      tile('Next appraisal', nextAp ? String(daysBetween(TODAY, apDateOf(nextAp))) + ' days' : '—', nextAp ? nextAp + ' · ' + fmtDate(apDateOf(nextAp)) : 'Set dates in ⚙ Settings', nextAp && daysBetween(TODAY, apDateOf(nextAp)) <= 30 ? 'warn' : '')
    ]);
    var statusSegs = [
      { label: 'Completed', count: cnt(function (r) { return r.state === 'Completed'; }), color: '#2f9a63' },
      { label: 'Awaiting review', count: cnt(function (r) { return r.state === 'Submitted'; }), color: '#2a78d6' },
      { label: 'Draft', count: cnt(function (r) { return r.state === 'Open' && r.draft && !isOverdue(r); }), color: '#d99a12' },
      { label: 'Not started', count: cnt(function (r) { return r.state === 'Open' && !r.draft && !isOverdue(r); }), color: '#b8c1ca' },
      { label: 'Overdue', count: cnt(isOverdue), color: '#d14b4b' }
    ];
    var bandCounts = SETTINGS.bands.map(function (b) {
      var who = TECHS.filter(function (t) { return outs[t].band && outs[t].band.cls === b.cls; });
      return { label: b.name, value: who.length, color: BAND_COL[b.cls], tipText: b.name + ': ' + (who.length ? who.join(', ') : 'nobody') };
    });
    var wl = TECHS.map(function (t) {
      var r = currentOf(t), v = r && r.answers.q3 ? r.answers.q3 : null;
      return { label: first(t), value: v, color: v >= 5 ? '#d14b4b' : v === 4 ? '#d99a12' : '#1f7190', tipText: t + ': ' + (v ? WORKLOAD[v - 1].title + (r && isIn(r) ? '' : ' (draft)') : 'not given yet') };
    });
    var charts = h('div', { class: 'grid3', style: 'margin-top:14px' }, [
      card(monthLabel(CUR) + ' – review status', null, [stackBar(statusSegs),
        h('dl', { class: 'kv', style: 'margin-top:16px;border-top:1px solid #edf0f3;padding-top:10px' }, [
          h('dt', { text: 'Deadline' }), h('dd', { text: fmtDate(lastDay(CUR)) + ' (' + daysBetween(TODAY, lastDay(CUR)) + ' days)' }),
          h('dt', { text: 'Reminders' }), h('dd', { text: '20th and 27th, automatic' })])]),
      card('Expected appraisal outcomes', 'Number of technicians in each band', [colChart(bandCounts, Math.max(3, Math.max.apply(null, bandCounts.map(function (b) { return b.value; }))), '#1f7190', 170, 'Expected outcome bands', 420)]),
      card('Workload – ' + monthLabel(CUR), '1 very light – 5 excessive', [colChart(wl, 5, '#1f7190', 170, 'Workload this month', 420)])
    ]);
    var rows = TECHS.map(function (t) {
      var o = outs[t], r = currentOf(t), ap = apDateOf(t), days = ap ? daysBetween(TODAY, ap) : null;
      var oa = actionsOf(function (ac, rr) { return rr.tech === t && ac.status === 'Open'; }, 'tl');
      var od = oa.filter(function (x) { return acOverdue(x.ac); }).length;
      return h('tr', { class: r && followOf(r) === DEDICATED ? 'hl' : null }, [
        h('td', null, [h('a', { href: '#', style: 'font-weight:650;color:var(--navy)', text: t, onclick: function (e) { e.preventDefault(); go('profile', { profileTech: t }); } }),
          r && followOf(r) === DEDICATED ? tip(h('span', { text: ' 🗓' }), 'Dedicated 1-to-1 requested') : null]),
        h('td', { class: 'num', text: ap ? fmtDate(ap) : 'Not set' }),
        h('td', { class: 'num ' + (days !== null && days <= 30 ? 'overdue' : ''), text: days === null ? '—' : days >= 0 ? days + ' days' : 'Passed' }),
        h('td', { style: 'width:190px' }, [h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px' }, [bandChip(o.projected), h('b', { class: 'num', text: f1(o.projected) })]), track(o.projected)]),
        h('td', { class: 'num' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_SELF }), f1(o.selfAvg)]), h('br'), h('span', null, [h('i', { class: 'dot', style: 'background:' + C_TL }), f1(o.tlAvg)])]),
        h('td', null, tip(h('span', null, sparkline(o.pts.map(function (pt) { return pt.used; }), '#13516b')), 'Monthly score, oldest → newest\n' + o.pts.map(function (pt) { return monthShort(pt.month) + ' ' + pt.used.toFixed(1); }).join('  '))),
        h('td', null, chipFor(r)),
        r && r.answers.mood ? tip(h('td', { style: 'font-size:18px;text-align:center', text: MOODS[r.answers.mood - 1].emo }), moodEmoji(r.answers.mood)) : h('td', { text: '—' }),
        h('td', { class: 'num' + (od ? ' overdue' : ''), text: oa.length + (od ? ' · ' + od + ' overdue' : '') }),
        h('td', null, h('button', { class: 'btn small ghost', type: 'button', text: '📄 Report', onclick: function () { state.report = { tech: t, aud: 'tl' }; render(false); } }))
      ]);
    });
    var teamTbl = card('Team – appraisal outlook', 'Expected outcome at each appraisal date · dates and bands are set in ⚙ Settings', [
      legend([{ color: C_SELF, label: 'Self-rating average' }, { color: C_TL, label: 'Your rating average' }]),
      h('div', { class: 'nw' }, table(['Technician', 'Appraisal date', 'Days to go', 'Expected outcome', 'Self / you', 'Trend', monthShort(CUR) + ' review', 'Energy', 'Open actions', ''], rows))
    ]);
    return h('div', null, [tiles, charts, h('div', { style: 'margin-top:14px' }, teamTbl)]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – monthly reviews
  // ---------------------------------------------------------------------------------------------
  function reviewsView() {
    var months = Array.from(new Set(REVIEWS.map(function (r) { return r.month; }))).sort().reverse();
    if (state.month === '' && months.indexOf(CUR) >= 0 && !state.monthTouched) { state.month = CUR; }
    var monthSel = h('select', { id: 'oto-f-month', onchange: function () { state.month = monthSel.value; state.monthTouched = true; render(false); } },
      [h('option', { value: '', text: 'All months' })].concat(months.map(function (m) { var o = h('option', { value: m, text: monthLabel(m) }); o.selected = m === state.month; return o; })));
    var allTechs = Object.keys(TECH_INFO).sort();
    var techSel = h('select', { id: 'oto-f-tech', onchange: function () { state.techFilter = techSel.value; render(false); } },
      [h('option', { value: '', text: 'All technicians' })].concat(allTechs.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === state.techFilter; return o; })));
    var rs = REVIEWS.filter(function (r) { return (!state.month || r.month === state.month) && (!state.techFilter || r.tech === state.techFilter); })
      .sort(function (x, y) { return x.month === y.month ? (x.tech < y.tech ? -1 : 1) : (x.month < y.month ? 1 : -1); });
    var rows = rs.map(function (r) {
      var f = followOf(r);
      return tr([r.tech, monthLabel(r.month), chipFor(r),
        r.submittedOn ? fmtDate(r.submittedOn) : '—', isIn(r) && r.answers.q3 ? r.answers.q3 + ' / 5' : '—', isIn(r) && r.answers.mood ? moodEmoji(r.answers.mood) : '—',
        isIn(r) ? f1(selfAvg(r)) : '—', isIn(r) ? f1(mgrAvg(r)) : '—',
        f === DEDICATED ? h('strong', { text: '1-to-1 requested' }) : (f ? f.replace(/\.$/, '').replace(/ —.*/, '') : '—'),
        String(r.fb.actions.length || '—'),
        h('button', { class: 'btn small', type: 'button', text: 'Open', onclick: function () { go('mgr', { reviewId: r.id, backTo: 'reviews' }); } })], f === DEDICATED ? 'hl' : '');
    });
    return card('Monthly reviews', rs.length + ' shown', [
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-f-month', text: 'Month' }), monthSel]), h('div', null, [h('label', { for: 'oto-f-tech', text: 'Technician' }), techSel])]),
      table(['Technician', 'Month', 'Status', 'Submitted', 'Workload', 'Energy', 'Self avg', 'Your avg', 'Follow-up', 'Actions', ''], rows)
    ]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – appraisal expectations
  // ---------------------------------------------------------------------------------------------
  function expectationsView() {
    if (!state.expYear) { state.expYear = CUR_YEAR; }
    var years = Array.from(new Set(MASTER_EXPECTATIONS.map(function (e) { return e.year; }).concat([CUR_YEAR]))).filter(Boolean).sort().reverse();
    var editing = state.expEdit ? MASTER_EXPECTATIONS.find(function (e) { return e.id === state.expEdit; }) : null;
    var f = editing ? { title: editing.title, measures: editing.measures, year: editing.year, scope: editing.scope, tech: editing.tech, sort: editing.sort, active: editing.active }
      : { title: '', measures: '', year: CUR_YEAR, scope: 'Shared', tech: '', sort: 10, active: true };
    function activeCount(t, year, excludeId) {
      return MASTER_EXPECTATIONS.filter(function (e) { return e.active && e.year === year && e.id !== excludeId && (e.scope === 'Shared' || e.tech === t); }).length;
    }
    var tIn = h('input', { type: 'text', id: 'oto-x-title', maxlength: '255' }); tIn.value = f.title;
    var mIn = h('textarea', { id: 'oto-x-meas', rows: 3 }); mIn.value = f.measures;
    var yIn = h('input', { type: 'text', id: 'oto-x-year', maxlength: '20' }); yIn.value = f.year;
    var scSel = h('select', { id: 'oto-x-scope' }, ['Shared', 'Individual'].map(function (v) { var o = h('option', { value: v, text: v === 'Shared' ? 'Shared – all technicians' : 'Individual' }); o.selected = v === f.scope; return o; }));
    var teSel = h('select', { id: 'oto-x-tech' }, [h('option', { value: '', text: '—' })].concat(TECHS.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === f.tech; return o; })));
    teSel.disabled = f.scope !== 'Individual';
    scSel.addEventListener('change', function () { teSel.disabled = scSel.value !== 'Individual'; if (teSel.disabled) { teSel.value = ''; } });
    var soIn = h('input', { type: 'number', id: 'oto-x-sort', min: '0', step: '10' }); soIn.value = String(f.sort);
    var acIn = h('input', { type: 'checkbox', id: 'oto-x-active' }); acIn.checked = f.active;
    function fieldsFor(v) {
      return { Title: v.title, Measures: v.measures, AppraisalYear: v.year, AppliesTo: v.scope, SortOrder: String(v.sort), Active: v.active ? '1' : '0',
        Technician: v.scope === 'Individual' ? personValue(TECH_INFO[v.tech] && TECH_INFO[v.tech].claims) : '' };
    }
    function saveExp() {
      var v = { title: tIn.value.trim(), measures: mIn.value.trim(), year: yIn.value.trim(), scope: scSel.value, tech: scSel.value === 'Individual' ? teSel.value : '', sort: Number(soIn.value) || 0, active: acIn.checked };
      if (!v.title || !v.measures || !v.year) { toast('Title, measures and appraisal year are required.', true); return; }
      if (v.scope === 'Individual' && !v.tech) { toast('Choose the technician for an individual expectation.', true); return; }
      if (v.scope === 'Individual' && !(TECH_INFO[v.tech] && TECH_INFO[v.tech].claims)) { toast('That technician has no account set in the Technicians list.', true); return; }
      if (v.active) {
        var over = (v.scope === 'Shared' ? TECHS : [v.tech]).filter(function (t) { return activeCount(t, v.year, editing ? editing.id : -1) + 1 > CONFIG.maxExpectations; });
        if (over.length) { toast('Would take ' + over.join(', ') + ' over ' + CONFIG.maxExpectations + ' active expectations.', true); return; }
      }
      busy('exp', async function () {
        if (editing) {
          await spUpdate(CONFIG.lists.exp, editing.id, fieldsFor(v));
          Object.keys(v).forEach(function (k) { editing[k] = v[k]; });
          toast('Expectation updated – applies from next month\'s review.');
        } else {
          var newId = await spCreate(CONFIG.lists.exp, fieldsFor(v));
          v.id = newId || (Date.now() % 100000);
          MASTER_EXPECTATIONS.push(v);
          toast('Expectation added – applies from next month\'s review.');
        }
        state.expEdit = null; dirty = false; render(false);
      }).catch(function () {});
    }
    var form = card(editing ? 'Edit expectation' : 'Add an expectation', 'Changes apply from the next monthly review; past reviews never change', [
      h('div', { class: 'stack', style: 'gap:10px' }, [
        h('div', null, [h('label', { class: 'field', for: 'oto-x-title', text: 'Expectation' }), tIn]),
        h('div', null, [h('label', { class: 'field', for: 'oto-x-meas', text: 'How success is measured' }), mIn]),
        h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-x-scope', text: 'Applies to' }), scSel]), h('div', null, [h('label', { class: 'field', for: 'oto-x-tech', text: 'Technician' }), teSel])]),
        h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-x-year', text: 'Appraisal year' }), yIn]), h('div', null, [h('label', { class: 'field', for: 'oto-x-sort', text: 'Order' }), soIn])]),
        h('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center;font-weight:600' }, [acIn, 'Active']),
        h('div', { class: 'btn-row' }, [h('button', { class: 'btn primary', type: 'button', text: editing ? 'Save changes' : 'Add expectation', onclick: saveExp }),
          editing ? h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { state.expEdit = null; render(false); } }) : null])
      ])
    ]);
    var cov = card('Active expectations per technician', state.expYear + ' · maximum ' + CONFIG.maxExpectations, [
      legend([{ color: '#1f7190', label: 'Shared' }, { color: '#ef7d3a', label: 'Individual' }])
    ].concat(TECHS.map(function (t) {
      var sh = MASTER_EXPECTATIONS.filter(function (e) { return e.active && e.year === state.expYear && e.scope === 'Shared'; }).length;
      var ow = MASTER_EXPECTATIONS.filter(function (e) { return e.active && e.year === state.expYear && e.scope === 'Individual' && e.tech === t; }).length;
      var cells = []; for (var i = 0; i < CONFIG.maxExpectations; i++) { cells.push(h('i', { class: i < sh ? 's' : i < sh + ow ? 'o' : '' })); }
      return tip(h('div', { class: 'covbar' }, [h('span', { text: t }), h('div', { class: 'bar' }, cells), h('b', { class: 'num', text: (sh + ow) + ' / ' + CONFIG.maxExpectations })]), t + ': ' + sh + ' shared + ' + ow + ' individual');
    })));
    var yearSel = h('select', { id: 'oto-x-yf', onchange: function () { state.expYear = yearSel.value; render(false); } }, years.map(function (y) { var o = h('option', { value: y, text: y }); o.selected = y === state.expYear; return o; }));
    var retChk = h('input', { type: 'checkbox', onchange: function () { state.showRetired = retChk.checked; render(false); } }); retChk.checked = state.showRetired;
    var list = MASTER_EXPECTATIONS.filter(function (e) { return e.year === state.expYear && (state.showRetired || e.active); });
    function bySort(x, y) { return x.sort - y.sort; }
    function rowFor(e) {
      return h('tr', { class: e.active ? null : 'retired' }, [
        h('td', { class: 'num', style: 'width:54px', text: String(e.sort) }),
        h('td', { style: 'font-weight:650;width:30%', text: e.title }),
        h('td', { class: 'small', text: e.measures }),
        h('td', null, h('span', { class: 'chip ' + (e.active ? 'green' : ''), text: e.active ? 'Active' : 'Retired' })),
        h('td', { style: 'width:150px' }, h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' }, [
          h('button', { class: 'btn small', type: 'button', text: 'Edit', onclick: function () { state.expEdit = e.id; render(true); } }),
          h('button', { class: 'btn small ghost', type: 'button', text: e.active ? 'Retire' : 'Reactivate', onclick: function () {
            if (!e.active) {
              var over = (e.scope === 'Shared' ? TECHS : [e.tech]).filter(function (t) { return activeCount(t, e.year, e.id) + 1 > CONFIG.maxExpectations; });
              if (over.length) { toast('Would take ' + over.join(', ') + ' over ' + CONFIG.maxExpectations + ' active expectations.', true); return; }
            }
            busy('exp', async function () {
              await spUpdate(CONFIG.lists.exp, e.id, { Active: e.active ? '0' : '1' });
              e.active = !e.active; render(false);
            }).catch(function () {});
          } })]))
      ]);
    }
    var body = [];
    var shared = list.filter(function (e) { return e.scope === 'Shared'; }).sort(bySort);
    body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: 'Shared – applies to every technician (' + shared.filter(function (e) { return e.active; }).length + ' active)' })));
    body = body.concat(shared.length ? shared.map(rowFor) : [h('tr', null, h('td', { colspan: '5', class: 'muted', text: 'None.' }))]);
    TECHS.forEach(function (t) {
      var own = list.filter(function (e) { return e.scope === 'Individual' && e.tech === t; }).sort(bySort);
      body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: t + ' – individual (' + activeCount(t, state.expYear, -1) + ' of ' + CONFIG.maxExpectations + ' active including shared)' })));
      body = body.concat(own.length ? own.map(rowFor) : [h('tr', null, h('td', { colspan: '5', class: 'muted small', text: 'No individual expectations.' }))]);
    });
    var orphans = list.filter(function (e) { return e.scope === 'Individual' && TECHS.indexOf(e.tech) < 0; });
    if (orphans.length) {
      body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: 'Needs attention – individual expectations without an active technician' })));
      body = body.concat(orphans.map(rowFor));
    }
    var listCard = card('Expectations – ' + state.expYear, list.length + ' shown', [
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-x-yf', text: 'Appraisal year' }), yearSel]),
        h('label', { class: 'small', style: 'display:flex;gap:6px;align-items:center;font-weight:600;padding-bottom:8px' }, [retChk, 'Show retired'])]),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, [
        h('thead', null, h('tr', null, ['Order', 'Expectation', 'How success is measured', 'Status', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, body)]))
    ]);
    return h('div', { class: 'layout left', style: 'margin-top:0' }, [h('div', { class: 'stack' }, [form, cov]), h('div', { class: 'stack' }, [listCard])]);
  }

  // ---------------------------------------------------------------------------------------------
  // actions
  // ---------------------------------------------------------------------------------------------
  function actionsTable(items, opts) {
    opts = opts || {};
    var headers = [].concat(opts.showTech ? ['Technician'] : [], opts.showMonth ? ['From'] : [], ['Action', 'Owner', 'Close-out criteria', 'Deadline', 'Status'], opts.manage ? [''] : []);
    var rows = items.map(function (x) {
      var ac = x.ac, od = acOverdue(ac);
      var cells = [].concat(opts.showTech ? [x.r.tech] : [], opts.showMonth ? [monthShort(x.r.month)] : [], [
        h('span', { style: 'font-weight:600', text: ac.text }), ac.owner,
        h('span', { class: 'small', text: ac.criteria }),
        h('span', { class: od ? 'overdue' : '', text: fmtDate(ac.due) + (od ? ' – overdue' : '') }),
        h('span', { class: 'chip ' + (ac.status === 'Closed' ? 'green' : od ? 'red' : 'amber'), text: ac.status === 'Closed' ? 'Closed ' + (ac.closedOn ? fmtDate(ac.closedOn) : '') : 'Open' })
      ], opts.manage ? [h('button', { class: 'btn small ' + (ac.status === 'Open' ? '' : 'ghost'), type: 'button', text: ac.status === 'Open' ? 'Close out' : 'Reopen', onclick: function () {
        function apply(status, closedOn) {
          var prev = { status: ac.status, closedOn: ac.closedOn };
          ac.status = status; ac.closedOn = closedOn;
          busy('action', async function () {
            await spUpdate(CONFIG.lists.mgr, x.r.mrId, actionsSummary(x.r.fb.actions));
            render(false);
          }).catch(function () { ac.status = prev.status; ac.closedOn = prev.closedOn; render(false); });
        }
        if (ac.status === 'Open') {
          confirmBox('Close out this action?', 'Confirm the close-out criteria have been met: "' + ac.criteria + '"', 'Close out', function () { apply('Closed', TODAY); });
        } else { apply('Open', ''); }
      } })] : []);
      return tr(cells, od ? 'hl' : '');
    });
    return table(headers, rows, { empty: 'No actions.' });
  }
  function actionsView() {
    var all = actionsOf(null, 'tl');
    var soon = addDays(TODAY, 14);
    var techSel = h('select', { id: 'oto-a-tech', onchange: function () { state.actTech = techSel.value; render(false); } },
      [h('option', { value: '', text: 'All technicians' })].concat(Object.keys(TECH_INFO).sort().map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === state.actTech; return o; })));
    var stSel = h('select', { id: 'oto-a-st', onchange: function () { state.actFilter = stSel.value; render(false); } },
      [['open', 'Open'], ['overdue', 'Overdue'], ['closed', 'Closed'], ['all', 'All']].map(function (v) { var o = h('option', { value: v[0], text: v[1] }); o.selected = v[0] === state.actFilter; return o; }));
    var shown = all.filter(function (x) {
      if (state.actTech && x.r.tech !== state.actTech) { return false; }
      if (state.actFilter === 'open') { return x.ac.status === 'Open'; }
      if (state.actFilter === 'overdue') { return acOverdue(x.ac); }
      if (state.actFilter === 'closed') { return x.ac.status === 'Closed'; }
      return true;
    });
    var open = all.filter(function (x) { return x.ac.status === 'Open'; });
    var tiles = h('div', { class: 'tiles t4' }, [
      tile('Open', String(open.length), 'Across the team'),
      tile('Overdue', String(open.filter(function (x) { return acOverdue(x.ac); }).length), 'Past their deadline', open.some(function (x) { return acOverdue(x.ac); }) ? 'bad' : ''),
      tile('Due in 14 days', String(open.filter(function (x) { return !acOverdue(x.ac) && x.ac.due && x.ac.due <= soon; }).length), 'By ' + fmtDate(soon), ''),
      tile('Closed', String(all.length - open.length), 'All recorded actions')
    ]);
    return h('div', null, [tiles, h('div', { style: 'margin-top:14px' }, card('Agreed actions', 'Raised in monthly reviews – each needs close-out criteria and a deadline', [
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-a-st', text: 'Status' }), stSel]), h('div', null, [h('label', { for: 'oto-a-tech', text: 'Technician' }), techSel])]),
      actionsTable(shown, { showTech: true, showMonth: true, manage: true })
    ]))]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – review a technician's month
  // ---------------------------------------------------------------------------------------------
  function managerView() {
    var r = REVIEWS.find(function (x) { return x.id === state.reviewId; });
    if (!r) { return card('Review not found', null, [h('p', { text: 'This review could not be found. It may have been deleted.' })]); }
    if (!r.mrId) { return card('Review record missing', null, [h('p', { text: 'There is no Manager Reviews record for this Monthly Review. Check Flow 1 ran correctly (see the configuration reference).' })]); }
    var a = r.answers, fb = r.fb, has = r.state !== 'Open';
    function ans(text) { return h('div', { class: 'answer' + (text ? '' : ' empty'), text: text || (has ? '(left blank)' : '(not submitted yet)') }); }
    function fbBox(key, label) { return h('div', { style: 'margin-top:10px' }, textBox(label || 'Your feedback', fb[key], function (v) { fb[key] = v; }, false, 2)); }
    function yn(v, detail) { return has ? (v || '(not answered)') + (v === 'Yes' && detail ? ' – ' + detail : '') : ''; }
    var wl = WORKLOAD.find(function (w) { return w.value === a.q3; });
    var main = [
      qCard(1, 'What has gone well', null, [ans(has ? a.q1 : ''), fbBox('q1')]),
      qCard(2, 'Challenges, blockers and support needed', null, [has && (a.q2.issue || a.q2.impact || a.q2.tried || a.q2.support)
        ? h('div', { class: 'fgrid c4' }, [['Issue', a.q2.issue], ['Impact', a.q2.impact], ['Tried', a.q2.tried], ['Support needed', a.q2.support]].map(function (p) {
          return h('div', null, [h('div', { class: 'small muted', style: 'font-weight:600', text: p[0] }), ans(p[1])]); }))
        : ans(''), fbBox('q2')]),
      qCard(3, 'Workload', null, [ans(has && wl ? wl.title + ' – ' + wl.desc + (a.q3c ? '\n' + a.q3c : '') : ''), fbBox('q3')]),
      qCard(4, 'Wellbeing and support', null, [ans(yn(a.q4, a.q4d)), fbBox('q4')]),
      qCard(5, 'Upcoming planning', null, [ans(yn(a.q5, a.q5d)), fbBox('q5')]),
      qCard(6, 'Development, training and aspirations', null, [ans(yn(a.q6, a.q6what ? a.q6what + (a.q6why ? ' (' + a.q6why + ')' : '') : '')), fbBox('q6')]),
      qCard(7, 'Feedback for line manager', null, [ans(has ? a.q7 : ''), fbBox('q7', 'Your response')]),
      qCard(8, 'Appraisal expectations', h('span', { class: 'small muted', text: 'Your ratings feed the appraisal outlook' }), [r.snapshot.length ? table(['Expectation', 'Technician', 'Your rating', 'Your feedback'],
        r.snapshot.map(function (e) {
          var x = a.q8.find(function (q) { return String(q.id) === String(e.id); }) || {};
          var lbl = h('div', { class: 'small muted', style: 'margin-top:4px', text: fb.expRating[e.id] ? PROGRESS[fb.expRating[e.id] - 1].title : 'Not rated' });
          return h('tr', null, [
            h('td', { class: 'top', style: 'width:28%' }, [h('div', { style: 'font-weight:650', text: e.title }), h('div', { class: 'small muted', text: e.measures })]),
            h('td', { class: 'top', style: 'width:24%' }, has ? [h('div', { style: 'font-weight:650', text: x.rating ? x.rating + ' – ' + PROGRESS[x.rating - 1].title : 'Not rated' }), x.comment ? h('div', { class: 'small', text: x.comment }) : null] : h('span', { class: 'muted', text: '—' })),
            h('td', { class: 'top', style: 'width:200px' }, [ratingSeg(fb.expRating[e.id], function (v) { fb.expRating[e.id] = v; lbl.textContent = PROGRESS[v - 1].title; refreshSide(); }, false), lbl]),
            h('td', { class: 'top' }, textBox(null, fb.exp[e.id], function (v) { fb.exp[e.id] = v; }, false, 2))
          ]);
        })) : h('p', { class: 'muted', text: 'No expectations were set for this month.' })]),
      qCard(9, 'Follow-up', null, [ans(has ? 'Technician preference: ' + (a.q9 || r.mrTechFollowUp || '(not answered)') : ''), fbBox('q9', 'Your comment')]),
      card('Agreed actions', 'Add as many as needed – each needs an owner, close-out criteria and a deadline', [actionsEditor(r)]),
      card('Overall feedback', null, [textBox(null, fb.overall, function (v) { fb.overall = v; }, false, 3)])
    ];
    var canComplete = r.state === 'Submitted', canClose = r.state === 'Open' && TODAY > r.due;
    function incompleteActions() { return r.fb.actions.filter(function (ac) { return !ac.text.trim() || !ac.criteria.trim() || !ac.due; }).length; }
    function saveFeedback() {
      var n = incompleteActions();
      if (n) { toast(n + ' action' + (n === 1 ? ' is' : 's are') + ' missing the action, close-out criteria or deadline.', true); return Promise.reject(new Error('incomplete')); }
      return busy('fb', async function () {
        await spUpdate(CONFIG.lists.mgr, r.mrId, mgrFields(r));
        dirty = false;
      });
    }
    function command(newState, okMsg) {
      saveFeedback().then(function () {
        return busy('state', async function () {
          await spUpdate(CONFIG.lists.mgr, r.mrId, { ReviewState: newState });
          r.state = newState; r.released = true; toast(okMsg); render(false);
        });
      }).catch(function () {});
    }
    var actions = h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', type: 'button', text: 'Save feedback', onclick: function () {
        saveFeedback().then(function () { toast(r.released ? 'Saved – already released, so the technician sees this change.' : 'Saved – not visible to the technician until you complete the review.'); }).catch(function () {}); } }),
      h('button', { class: 'btn primary', type: 'button', text: 'Complete & release', disabled: !canComplete, onclick: function () {
        confirmBox('Complete this review?', 'Your feedback, ratings and actions will be released to ' + r.tech + ' and they will be emailed.', 'Complete & release', function () {
          command('Completed', 'Completed – the feedback is being released.'); });
      } }),
      h('button', { class: 'btn danger', type: 'button', text: 'Close – not submitted', disabled: !canClose, onclick: function () {
        confirmBox('Close as not submitted?', r.tech + ' will no longer be able to submit this review.', 'Close review', function () {
          command('Closed - Not Submitted', 'Closed.'); });
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: '← Back', onclick: function () { go(state.backTo === 'profile' ? 'profile' : (state.backTo || 'reviews')); } })
    ]);
    var head = h('div', { class: 'pagehead sticky' }, [
      h('div', { class: 'ph-l' }, [h('h2', { text: r.tech + ' – ' + monthLabel(r.month) }), chipFor(r),
        h('span', { class: 'meta', text: r.submittedOn ? 'Submitted ' + fmtDate(r.submittedOn) + (r.late ? ' (late)' : '') : 'Deadline ' + fmtDate(r.due) })]), actions]);
    var side = h('div', { class: 'stack' });
    function refreshSide() {
      side.textContent = '';
      var o = expectedOutcome(r.tech, 'tl'), streak = streakOf(r.tech), sa = selfAvg(r), ma = mgrAvg(r);
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'Technician check-in' }),
        h('dl', { class: 'kv', style: 'margin-top:0' }, [h('dt', { text: 'Energy' }), h('dd', { text: a.mood ? moodEmoji(a.mood) : '—' }),
          h('dt', { text: 'On-time streak' }), h('dd', { text: streak ? '🔥 ' + streak + ' month' + (streak === 1 ? '' : 's') : '—' }),
          h('dt', { text: 'Follow-up preference' }), h('dd', { text: followOf(r) === DEDICATED ? 'Dedicated 1-to-1' : (has && a.q9 ? (a.q9 === FOLLOW[0] ? 'Nothing further' : 'Quick catch-up') : '—') })])]));
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'This month\'s ratings' }),
        h('div', { class: 'small', style: 'display:flex;justify-content:space-between;margin-bottom:4px' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_SELF }), 'Technician']), h('b', { text: f1(sa) })]), track(sa),
        h('div', { class: 'small', style: 'display:flex;justify-content:space-between;margin:12px 0 4px' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_TL }), 'You']), h('b', { text: f1(ma) })]), track(ma)]));
      side.appendChild(h('section', { class: 'card side-tile' }, [
        h('h3', null, ['Appraisal outlook', h('button', { class: 'btn small ghost', type: 'button', text: 'Profile →', onclick: function () { go('profile', { profileTech: r.tech }); } })]),
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [h('div', { class: 'big-score' }, [f1(o.projected), h('small', { text: ' / 5' })]), bandChip(o.projected, true)]),
        track(o.projected),
        h('dl', { class: 'kv' }, [h('dt', { text: 'Appraisal' }), h('dd', { text: o.period.set ? fmtDate(o.period.apDate) : 'Not set' }), h('dt', { text: 'Current' }), h('dd', { text: f1(o.current) })])]));
      var followSel = h('select', { id: nid('s'), onchange: function () { fb.followOverride = followSel.value; markDirty(); } },
        [h('option', { value: '', text: 'Accept technician\'s preference' })].concat(FOLLOW.map(function (x) { var op = h('option', { value: x, text: x }); op.selected = fb.followOverride === x; return op; })));
      var meeting = dateField(fb.meeting, function (v) { fb.meeting = v; }, '1-to-1 meeting date'); meeting.id = nid('d'); meeting.style.width = '100%';
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'Follow-up decision' }),
        h('div', { class: 'stack', style: 'gap:8px' }, [followSel, h('div', null, [h('label', { class: 'field', for: meeting.id, text: '1-to-1 meeting date (optional)' }), meeting])])]));
    }
    refreshSide();
    var banners = [];
    if (followOf(r) === DEDICATED) { banners.push(h('div', { class: 'banner amber', text: 'Dedicated 1-to-1 discussion requested' })); }
    if (r.state === 'Completed' || r.state === 'Closed - Not Submitted') { banners.push(h('div', { class: 'banner info', text: 'Already released – any change you save is visible to the technician straight away. Record the reason in the Manager Reviews correction log.' })); }
    return h('div', null, [head, h('div', { class: 'layout' }, [h('div', { class: 'stack' }, banners.concat(main)), h('aside', { class: 'side-sticky' }, side)])]);
  }
  function actionsEditor(r) {
    var wrap = h('div');
    function draw() {
      wrap.textContent = '';
      wrap.appendChild(h('div', { class: 'acgrid achead' }, ['#', 'Action', 'Owner', 'Deadline', 'Status', ''].map(function (x) { return h('span', { text: x }); })));
      if (!r.fb.actions.length) { wrap.appendChild(h('div', { class: 'muted small', style: 'padding:8px 10px', text: 'No actions yet.' })); }
      r.fb.actions.forEach(function (ac, i) {
        var t = h('input', { type: 'text', 'aria-label': 'Action', maxlength: '300' }); t.value = ac.text; t.addEventListener('input', function () { ac.text = t.value; markDirty(); });
        var owners = [r.tech, 'Team Leader'];
        if (ac.owner && owners.indexOf(ac.owner) < 0) { owners.push(ac.owner); }
        var ow = h('select', { 'aria-label': 'Owner' }, owners.map(function (v) { var o = h('option', { value: v, text: v }); o.selected = ac.owner === v; return o; }));
        ow.addEventListener('change', function () { ac.owner = ow.value; markDirty(); });
        var cr = h('input', { type: 'text', 'aria-label': 'Close-out criteria', maxlength: '500' }); cr.value = ac.criteria; cr.addEventListener('input', function () { ac.criteria = cr.value; markDirty(); });
        var du = dateField(ac.due, function (v) { ac.due = v; }, 'Deadline'); du.style.width = '100%';
        var st = h('select', { 'aria-label': 'Status' }, ['Open', 'Closed'].map(function (v) { var o = h('option', { value: v, text: v }); o.selected = ac.status === v; return o; }));
        st.addEventListener('change', function () { ac.status = st.value; ac.closedOn = st.value === 'Closed' ? TODAY : ''; markDirty(); });
        wrap.appendChild(h('div', { class: 'acgrid acrow' }, [h('b', { class: 'num', text: String(i + 1) }), t, ow, du, st,
          h('button', { class: 'btn small ghost', type: 'button', text: '✕', 'aria-label': 'Remove action', onclick: function () { r.fb.actions.splice(i, 1); markDirty(); draw(); } }),
          h('div', { class: 'crit' }, [h('span', { text: 'Close-out criteria' }), cr])]));
      });
      wrap.appendChild(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', text: '+ Add action', onclick: function () {
        r.fb.actions.push({ id: String(Date.now()) + String(Math.floor(Math.random() * 1000)), text: '', owner: r.tech, criteria: '', due: '', status: 'Open', closedOn: '' });
        markDirty(); draw();
        var ins = wrap.querySelectorAll('.acrow input[aria-label="Action"]'); if (ins.length) { ins[ins.length - 1].focus(); }
      } })));
    }
    draw();
    return wrap;
  }

  // ---------------------------------------------------------------------------------------------
  // LINE MANAGER SETTINGS (appraisal dates + bands) – sidebar cog, Team Leader only
  // ---------------------------------------------------------------------------------------------
  function openSettings() {
    var dates = {}, bands = SETTINGS.bands.map(function (b) { return { max: b.max, name: b.name, cls: b.cls }; });
    TECHS.forEach(function (t) { dates[t] = apDateOf(t); });
    var back = h('div', { class: 'modal-back' });
    var body = h('div');
    function draw() {
      body.textContent = '';
      body.appendChild(h('h3', { class: 'sh', text: 'Appraisal dates' }));
      body.appendChild(table(['Technician', 'Appraisal date', 'Days to go', 'Period covered'], TECHS.map(function (t) {
        var daysTd = h('td', { class: 'num' }), perTd = h('td', { class: 'small muted' });
        function upd() {
          if (!dates[t]) { daysTd.textContent = '—'; perTd.textContent = 'Enter a date'; return; }
          var end = dates[t].slice(0, 7), d = daysBetween(TODAY, dates[t]);
          daysTd.textContent = d >= 0 ? d + ' days' : 'Passed';
          perTd.textContent = monthLabel(addMonths(end, -11)) + ' – ' + monthLabel(end);
        }
        upd();
        return h('tr', null, [h('td', { style: 'font-weight:600', text: t }), h('td', null, dateField(dates[t], function (v) { dates[t] = v; upd(); }, 'Appraisal date for ' + t)), daysTd, perTd]);
      })));
      body.appendChild(h('h3', { class: 'sh', text: 'Appraisal bands' }));
      body.appendChild(h('p', { class: 'small muted', style: 'margin:0 0 8px', text: 'The average 1–5 score is matched to these bands for every technician.' }));
      body.appendChild(table(['', 'Band name', 'Applies when the average is'], bands.map(function (b, i) {
        var nameIn = h('input', { type: 'text', 'aria-label': 'Band name', maxlength: '40' }); nameIn.value = b.name;
        nameIn.addEventListener('input', function () { b.name = nameIn.value; });
        var cell;
        if (i < 3) {
          var mx = h('input', { type: 'number', step: '0.05', min: '1', max: '5', style: 'width:90px', 'aria-label': 'Upper limit' }); mx.value = String(b.max);
          mx.addEventListener('change', function () { b.max = parseFloat(mx.value); draw(); });
          cell = h('span', { style: 'display:flex;gap:8px;align-items:center' }, [h('span', { class: 'small muted', text: (i === 0 ? 'under' : 'from ' + bands[i - 1].max + ' to under') }), mx]);
        } else { cell = h('span', { class: 'small muted', text: bands[i - 1].max + ' and above' }); }
        return h('tr', null, [h('td', { style: 'width:30px' }, h('i', { class: 'dot', style: 'background:' + BAND_COL[b.cls] })), h('td', { style: 'width:42%' }, nameIn), h('td', null, cell)]);
      })));
      body.appendChild(h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn small ghost', type: 'button', text: 'Reset bands to defaults', onclick: function () { bands = defaultBands(); draw(); } })));
      body.appendChild(howWorked());
    }
    draw();
    function save() {
      for (var i = 0; i < 3; i++) {
        var lo = i ? bands[i - 1].max : 1;
        if (isNaN(bands[i].max) || bands[i].max <= lo || bands[i].max > 5) { toast('Band limits must increase and sit between 1 and 5.', true); return; }
      }
      if (bands.some(function (b) { return !b.name.trim(); })) { toast('Every band needs a name.', true); return; }
      busy('settings', async function () {
        var problems = [];
        for (var k = 0; k < TECHS.length; k++) {
          var t = TECHS[k], v = dates[t] || '';
          if (v === apDateOf(t)) { continue; }
          try {
            await spUpdate(CONFIG.lists.techs, TECH_INFO[t].itemId, { AppraisalDate: spDate(v) });
            TECH_INFO[t].appraisal = v;
            var cr = currentOf(t);
            if (cr) { await spUpdate(CONFIG.lists.reviews, cr.id, { AppraisalDate: spDate(v) }); cr.appraisalDate = v; }
          } catch (e) { problems.push(t + ': ' + (e && e.message ? e.message : e)); }
        }
        var newBands = bands.map(function (b) { return { max: b.max, name: b.name.trim(), cls: b.cls }; });
        if (JSON.stringify(newBands) !== JSON.stringify(SETTINGS.bands)) {
          var value = JSON.stringify(newBands.map(function (b, i) { return { name: b.name, max: i === 3 ? null : b.max }; }));
          if (SETTINGS.itemId) { await spUpdate(CONFIG.lists.settings, SETTINGS.itemId, { Value: value }); }
          else { SETTINGS.itemId = await spCreate(CONFIG.lists.settings, { Title: 'Bands', Value: value }); }
          SETTINGS.bands = newBands;
        }
        if (problems.length) { throw new Error('Some dates were not saved – ' + problems.join(' | ')); }
        back.remove(); toast('Settings saved – appraisal outlooks updated.'); render(false);
      }).catch(function () { render(false); });
    }
    back.appendChild(h('div', { class: 'modal wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [h('h2', { style: 'font-size:18px', text: '⚙ Settings' }), h('span', { class: 'chip', text: 'Line manager only' })]),
      body,
      h('div', { class: 'btn-row', style: 'justify-content:flex-end;margin-top:16px;border-top:1px solid var(--line);padding-top:14px' }, [
        h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { back.remove(); } }),
        h('button', { class: 'btn primary', type: 'button', text: 'Save settings', onclick: save })])
    ]));
    root.appendChild(back);
  }

  // ---------------------------------------------------------------------------------------------
  // APPRAISAL REPORT (view in page; print / save as PDF from a clean window)
  // ---------------------------------------------------------------------------------------------
  function reportDoc(tech, aud) {
    var o = expectedOutcome(tech, aud), p = o.period;
    var prs = periodReviews(tech).filter(function (r) { return r.month <= CUR; });
    var subs = prs.filter(isIn), ot = onTimeOf(tech);
    var acts = actionsOf(function (ac, r) { return r.tech === tech; }, aud);
    var sorted = o.perExp.filter(function (x) { return x.latest; }).slice().sort(function (x, y) { return y.latest - x.latest; });
    function rsec(title, children) { return h('section', { class: 'rsec' }, [h('h2', { text: title })].concat(children)); }
    function rtable(headers, rows, empty) {
      return h('table', { class: 'rt' }, [h('thead', null, h('tr', null, headers.map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, rows.length ? rows.map(function (cells) { return h('tr', null, cells.map(function (c) { return h('td', null, c === null || c === undefined || c === '' ? '—' : c); })); })
          : h('tr', null, h('td', { colspan: String(headers.length), class: 'muted', text: empty || 'None in this period.' })))]);
    }
    return h('div', { class: 'report-doc' }, [
      h('div', { class: 'small muted', text: 'ESG Technician 1-to-1 · Appraisal evidence report · CONFIDENTIAL' }),
      h('h1', { text: tech }),
      h('div', { class: 'rmeta' }, [
        h('div', null, [h('span', { text: 'Appraisal date' }), h('b', { text: p.set ? fmtDate(p.apDate) : 'Not set' })]),
        h('div', null, [h('span', { text: 'Period covered' }), h('b', { text: monthLabel(addMonths(p.start, 1)) + ' – ' + monthLabel(p.end > CUR ? CUR : p.end) })]),
        h('div', null, [h('span', { text: 'Prepared for' }), h('b', { text: aud === 'tl' ? 'Team Leader' : tech + ' (self)' })]),
        h('div', null, [h('span', { text: 'Generated' }), h('b', { text: fmtDate(TODAY) })]),
        h('div', null, [h('span', { text: 'Monthly reviews submitted' }), h('b', { text: subs.length + ' (' + ot.onTime + ' of ' + ot.total + ' on time)' })]),
        h('div', null, [h('span', { text: 'Agreed actions' }), h('b', { text: acts.length + ' (' + acts.filter(function (x) { return x.ac.status === 'Open'; }).length + ' open)' })])
      ]),
      rsec('1. Summary', [
        h('div', { class: 'rsum' }, [
          h('div', null, [h('span', { text: 'Expected outcome' }), bandChip(o.projected, true)]),
          h('div', null, [h('span', { text: 'Projected at appraisal' }), h('b', { text: f1(o.projected) + ' / 5' })]),
          h('div', null, [h('span', { text: 'Current position' }), h('b', { text: f1(o.current) + ' / 5' })]),
          h('div', null, [h('span', { text: 'Self vs Team Leader' }), h('b', { text: f1(o.selfAvg) + ' vs ' + f1(o.tlAvg) })])
        ]),
        h('div', { class: 'fgrid c2', style: 'margin-top:12px' }, [
          h('div', null, [h('h3', { text: 'Strongest areas' }), h('ul', null, sorted.slice(0, 2).map(function (x) { return h('li', { text: x.e.title + ' (' + x.latest + ' – ' + PROGRESS[x.latest - 1].title + ')' }); }))]),
          h('div', null, [h('h3', { text: 'Areas to focus on' }), h('ul', null, sorted.slice(-2).reverse().map(function (x) { return h('li', { text: x.e.title + ' (' + x.latest + ' – ' + PROGRESS[x.latest - 1].title + ')' }); }))])
        ]),
        h('h3', { text: 'Rating trend' }), trendChart(tech, o, 210)
      ]),
      rsec('2. Appraisal expectations', o.perExp.length ? o.perExp.map(function (x) {
        return h('div', null, [
          h('div', { class: 'exphead' }, [h('h3', { text: x.e.title }), h('span', { class: 'small', text: 'Latest: self ' + (x.latestSelf || '—') + ' · Team Leader ' + (x.latestTl || '—') })]),
          h('div', { class: 'small muted', text: 'Measure: ' + x.e.measures }),
          rtable(['Month', 'Self', 'TL', 'Technician evidence', 'Team Leader feedback'], x.hist.map(function (hh) {
            return [monthShort(hh.month), hh.self ? String(hh.self) : '', hh.tl ? String(hh.tl) : '', hh.comment, hh.fb];
          }))
        ]);
      }) : [h('p', { class: 'muted', text: 'No expectations.' })]),
      rsec('3. Achievements', [rtable(['Month', 'Win of the month', 'What went well'], subs.map(function (r) { return [monthLabel(r.month), r.answers.win, r.answers.q1]; }))]),
      rsec('4. Development and training', [rtable(['Month', 'Requested', 'Why'], subs.filter(function (r) { return r.answers.q6 === 'Yes'; }).map(function (r) { return [monthLabel(r.month), r.answers.q6what, r.answers.q6why]; }))]),
      rsec('5. Challenges and support', [rtable(['Month', 'Issue', 'Impact', 'Support needed'], subs.filter(function (r) { return r.answers.q2.issue; }).map(function (r) { return [monthLabel(r.month), r.answers.q2.issue, r.answers.q2.impact, r.answers.q2.support]; }))]),
      rsec('6. Agreed actions', [rtable(['Raised', 'Action', 'Owner', 'Close-out criteria', 'Deadline', 'Status'], acts.map(function (x) {
        return [monthShort(x.r.month), x.ac.text, x.ac.owner, x.ac.criteria, fmtDate(x.ac.due), x.ac.status === 'Closed' ? 'Closed ' + fmtDate(x.ac.closedOn) : (acOverdue(x.ac) ? 'Open – overdue' : 'Open')];
      }))]),
      rsec('7. Line manager feedback', [rtable(['Month', 'Overall feedback'], prs.filter(function (r) { return r.state === 'Completed' && canSeeTl(r, aud) && r.fb.overall; }).map(function (r) { return [monthLabel(r.month), r.fb.overall]; }))]),
      rsec('8. Submission record', [rtable(['Month', 'Status', 'Submitted'], prs.map(function (r) {
        return [monthLabel(r.month), r.state === 'Closed - Not Submitted' ? 'Not submitted' : r.state === 'Open' ? (isOverdue(r) ? 'Overdue' : 'In progress') : (r.late ? 'Submitted late' : (r.submittedOn || !IS_TL ? 'Submitted' : 'Submitted')), r.submittedOn ? fmtDate(r.submittedOn) : ''];
      }))]),
      h('div', { class: 'note', text: 'Generated from the monthly 1-to-1 records. Wellbeing answers are deliberately excluded. The expected outcome is a guide for the appraisal conversation, not a decision.' })
    ]);
  }
  var REPORT_CSS = [
    'body{margin:0;font-family:"Segoe UI",system-ui,Arial,sans-serif;font-size:13px;color:#16222c;background:#fff}',
    '.report-doc{max-width:900px;margin:0 auto;padding:28px 36px}',
    'h1{font-size:22px;color:#13516b;margin:4px 0 0}h2{font-size:15px;color:#13516b;border-bottom:2px solid #13516b;padding-bottom:4px;margin:24px 0 10px}h3{font-size:13px;margin:14px 0 4px}',
    '.small{font-size:12px}.muted{color:#5b6774}',
    '.rmeta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;margin-top:12px;padding:12px 14px;background:#f6f8fa;border-radius:6px}',
    '.rmeta span,.rsum > div > span:first-child{display:block;font-size:11px;color:#5b6774;text-transform:uppercase;letter-spacing:.04em}',
    '.rsum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.rsum > div{border:1px solid #d9dfe5;border-radius:6px;padding:9px 11px}.rsum b{font-size:18px}',
    '.fgrid{display:grid;gap:12px}.fgrid.c2{grid-template-columns:1fr 1fr}',
    'table.rt{width:100%;border-collapse:collapse;margin-top:4px}table.rt th{text-align:left;font-size:11px;color:#5b6774;padding:5px 7px;border-bottom:1px solid #d9dfe5;background:#f6f8fa}table.rt td{padding:5px 7px;border-bottom:1px solid #edf0f3;vertical-align:top}',
    '.exphead{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:16px}',
    '.band{display:inline-block;font-size:13px;font-weight:700;padding:3px 12px;border-radius:12px}.band.b0{background:#fde8e9;color:#a4262c}.band.b1{background:#fff3d6;color:#8a5a00}.band.b2{background:#e6f3eb;color:#1b7a45}.band.b3{background:#e1edfb;color:#1659a8}',
    '.legend{display:flex;gap:14px;font-size:12px;color:#5b6774;margin-bottom:6px}.legend .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}.legend .sw.dash{height:0;border-top:2px dashed #5b6774;width:14px;vertical-align:3px}',
    'svg.chart{width:100%;height:auto;display:block}svg.chart text{font-size:11px;fill:#5b6774}',
    '.note{font-size:11px;color:#5b6774;margin-top:24px;border-top:1px solid #d9dfe5;padding-top:8px}',
    '@media print{@page{size:A4;margin:12mm}.report-doc{padding:0}.rsec{break-inside:avoid-page}}'
  ].join('\n');
  function printReport(tech, aud) {
    var w = window.open('', '_blank');
    if (!w) { toast('Your browser blocked the print window – allow pop-ups for this site and try again.', true); return; }
    var d = w.document;
    d.title = 'Appraisal report – ' + tech;
    var style = d.createElement('style'); style.textContent = REPORT_CSS; d.head.appendChild(style);
    d.body.appendChild(d.importNode(reportDoc(tech, aud), true));
    w.focus();
    setTimeout(function () { try { w.print(); } catch (_) { /* user can print manually */ } }, 400);
  }
  function reportView(tech, aud) {
    return h('div', { class: 'report-wrap', role: 'dialog', 'aria-label': 'Appraisal report' }, [
      h('div', { class: 'report-bar' }, [h('strong', { text: 'Appraisal report – ' + tech }), h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn primary', type: 'button', text: '🖨 Print / Save as PDF', onclick: function () { printReport(tech, aud); } }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { state.report = null; render(false); } })])]),
      reportDoc(tech, aud)
    ]);
  }

  // ---------------------------------------------------------------------------------------------
  // shell
  // ---------------------------------------------------------------------------------------------
  function render(scrollTop) {
    if (disposed || !root) { return; }
    root.textContent = '';
    live = h('div', { 'aria-live': 'polite', class: 'sr-only' });
    tipEl = h('div', { class: 'tip', role: 'tooltip' });
    var v = state.view;
    var activeNav = v === 'mgr' ? (state.backTo || 'reviews') : v;
    function navBtn(id, ico, label, onclick, extra, current) {
      var cur = current !== undefined ? current : activeNav === id;
      return h('button', { class: 'nav', type: 'button', 'aria-current': cur ? 'true' : 'false', onclick: onclick || function () { go(id, { reviewId: id === 'tech' ? state.reviewId : null }); } },
        [h('span', { class: 'ico', 'aria-hidden': 'true', text: ico }), h('span', { text: label }), extra || null]);
    }
    var nav = [h('div', { class: 'brand' }, [h('h1', { text: 'ESG Technician 1-to-1' }), h('span', { text: IS_TL ? 'Team Leader' : ME + ' · Technician' })])];
    if (!IS_TL) {
      nav.push(navBtn('tech', '📝', 'This month'));
      nav.push(navBtn('myapp', '📈', 'My appraisal'));
      nav.push(navBtn('report', '📄', 'Appraisal report', function () { state.report = { tech: ME, aud: 'tech' }; render(false); }, null, false));
    } else {
      var awaiting = TECHS.filter(function (t) { var c = currentOf(t); return c && c.state === 'Submitted'; }).length
        + REVIEWS.filter(function (r) { return r.state === 'Submitted' && r.month !== CUR; }).length;
      var overdueA = actionsOf(function (ac) { return acOverdue(ac); }, 'tl').length;
      nav.push(h('div', { class: 'sec', text: 'Manage' }));
      nav.push(navBtn('team', '🏠', 'Team overview'));
      nav.push(navBtn('reviews', '🗂', 'Monthly reviews', null, awaiting ? h('span', { class: 'badge', title: 'Awaiting your review', text: String(awaiting) }) : null));
      nav.push(navBtn('expect', '🎯', 'Expectations'));
      nav.push(navBtn('actions', '✅', 'Actions', null, overdueA ? h('span', { class: 'badge', title: 'Overdue', text: String(overdueA) }) : null));
      nav.push(h('div', { class: 'sec', text: 'Team' }));
      TECHS.forEach(function (t) {
        var o = expectedOutcome(t, 'tl'), r = currentOf(t);
        var needs = r && (r.state === 'Submitted' || isOverdue(r) || followOf(r) === DEDICATED);
        var cur = (v === 'profile' && state.profileTech === t) || (v === 'mgr' && state.backTo === 'profile' && REVIEWS.some(function (x) { return x.id === state.reviewId && x.tech === t; }));
        var b = navBtn('p-' + t, '', t, function () { go('profile', { profileTech: t }); }, needs ? h('span', { class: 'flag' }) : null, cur);
        b.querySelector('.ico').appendChild(h('i', { class: 'tdot', style: 'display:inline-block;background:' + (o.band ? BAND_COL[o.band.cls] : '#9aa4ae') }));
        nav.push(tip(b, t + '\nExpected: ' + (o.band ? o.band.name + ' (' + o.projected.toFixed(1) + ')' : '—') + '\n' + monthShort(CUR) + ': ' +
          (!r ? 'no review yet' : r.state === 'Submitted' ? 'awaiting your review' : r.state === 'Open' ? (r.draft ? 'draft' : 'not started') : r.state.toLowerCase()) +
          (r && followOf(r) === DEDICATED ? '\nDedicated 1-to-1 requested' : '')));
      });
      nav.push(h('div', { class: 'sec', text: 'Admin' }));
      nav.push(navBtn('settings', '⚙', 'Settings', function () { openSettings(); }, null, false));
    }
    var dl = daysBetween(TODAY, lastDay(CUR));
    nav.push(h('div', { class: 'foot' }, [h('b', { text: monthLabel(CUR) }), dl >= 0 ? 'Deadline ' + fmtDate(lastDay(CUR)) + ' · ' + dl + ' days' : 'Deadline passed',
      h('button', { class: 'linkbtn', type: 'button', text: '↻ Refresh data', onclick: function () { if (dirty && !window.confirm('Discard unsaved changes and reload?')) { return; } dirty = false; start(); } })]));

    var titles = { tech: ['My 1-to-1', 'This month'], myapp: ['', 'My appraisal'], team: ['', 'Team overview'], reviews: ['', 'Monthly reviews'],
      expect: ['', 'Appraisal expectations'], actions: ['', 'Actions'] };
    var tt = titles[v] || ['', ''];
    if (v === 'profile') { tt = ['Team overview ›', state.profileTech]; }
    if (v === 'mgr') { var rv = REVIEWS.find(function (x) { return x.id === state.reviewId; }); tt = rv ? [(state.backTo === 'profile' ? rv.tech : 'Monthly reviews') + ' ›', rv.tech + ' – ' + monthLabel(rv.month)] : ['', 'Review']; }
    var titlebar = h('div', { class: 'titlebar' }, [h('div', null, [tt[0] ? h('div', { class: 'crumb', text: tt[0] }) : null, h('h1', { text: tt[1] })]),
      h('span', { class: 'small muted', text: 'Today ' + fmtDate(TODAY) })]);
    var main = h('main');
    try {
      main.appendChild(v === 'tech' ? techView() : v === 'myapp' ? profileView(ME, 'tech') : v === 'team' ? teamView() : v === 'reviews' ? reviewsView()
        : v === 'expect' ? expectationsView() : v === 'actions' ? actionsView() : v === 'profile' ? profileView(state.profileTech, 'tl') : managerView());
    } catch (e) {
      main.appendChild(card('Something went wrong', null, [h('p', { text: 'This page could not be shown: ' + (e && e.message ? e.message : e) }), h('p', { class: 'small muted', text: 'Use ↻ Refresh data. If it keeps happening, tell your Team Leader (version ' + VERSION + ').' })]));
      if (window.console) { window.console.error('ESG 1-to-1 render error', e); }
    }
    root.appendChild(h('div', { class: 'shell' }, [h('nav', { class: 'sidenav', 'aria-label': 'Main menu' }, nav), h('div', { class: 'content' }, [titlebar, main])]));
    if (state.report) { root.appendChild(reportView(state.report.tech, state.report.aud)); }
    root.appendChild(live);
    root.appendChild(tipEl);
    if (busyCount > 0) { renderBusy(); }
    if (scrollTop && root.scrollIntoView) { try { root.scrollIntoView({ block: 'start' }); } catch (_) { /* ignore */ } }
  }
  function message(title, text) {
    if (!root) { return; }
    root.textContent = '';
    root.appendChild(h('div', { class: 'card', style: 'margin:24px;max-width:720px' }, [h('h2', { style: 'font-size:17px;margin-bottom:8px', text: title }), h('p', { text: text })]));
  }
  function findRoot() { return document.querySelector('[data-oto-root]'); }
  function queryParam(name) {
    try { return new URL(window.location.href).searchParams.get(name); } catch (_) { return null; }
  }

  async function start() {
    message('ESG Technician 1-to-1', 'Loading your 1-to-1…');
    TODAY = localDate(new Date().toISOString());
    CUR = TODAY.slice(0, 7);
    CUR_YEAR = appraisalYearOf(TODAY);
    await load();
    var rid = Number(queryParam('reviewId'));
    var hasRid = Number.isInteger(rid) && rid > 0;
    if (IS_TL) {
      if (!state.view) { state.view = hasRid ? 'mgr' : 'team'; state.reviewId = hasRid ? rid : null; state.backTo = 'reviews'; }
    } else {
      if (!state.view) { state.view = 'tech'; state.reviewId = hasRid ? rid : null; }
    }
    render(false);
  }
  function onBeforeUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; return ''; } return undefined; }

  async function init() {
    var wp = ctx && ctx.getWebPart ? ctx.getWebPart() : null;
    if (!wp || !wp.spHttpClient || !wp.pageContext || !wp.pageContext.web || !wp.pageContext.web.absoluteUrl) {
      throw new Error('Welcome SharePoint context / SPHttpClient unavailable');
    }
    http = wp.spHttpClient;
    httpConfig = http.constructor.configurations.v1;
    siteUrl = String(wp.pageContext.web.absoluteUrl).replace(/\/$/, '');
    window.addEventListener('beforeunload', onBeforeUnload);
    await start();
  }

  return {
    onInitialize: function () {
      if (started) { return; }
      started = true;
      var tries = 0;
      (function wait() {
        root = findRoot();
        if (!root && tries++ < 50) { setTimeout(wait, 100); return; }
        if (!root) { return; }
        init().catch(function (error) {
          message('The 1-to-1 could not load', String(error && error.message ? error.message : error) + ' — try refreshing the page. If it keeps happening, tell your Team Leader.');
          if (window.console) { window.console.error('ESG 1-to-1 load error', error); }
        });
      })();
    },
    onError: function (error) {
      if (window.console) { window.console.error('ESG 1-to-1: Welcome reported an error', error); }
    },
    onDispose: function () {
      disposed = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
    },
    // exposed for the local test harness only (no data, no side effects)
    _version: VERSION
  };
};
