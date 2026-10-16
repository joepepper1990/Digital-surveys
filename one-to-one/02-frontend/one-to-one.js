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

  var VERSION = '4.4.0';

  // ---------------------------------------------------------------------------------------------
  // CONFIG — normally nothing to change. List titles must match the lists you created.
  // ---------------------------------------------------------------------------------------------
  var CONFIG = {
    lists: {
      reviews: 'Monthly Reviews',
      mgr: 'Manager Reviews',
      techs: 'Technicians',
      exp: 'Appraisal Expectations',
      settings: '1-to-1 Settings',
      wellbeing: 'Wellbeing Assessments',
      feedback: '1-to-1 Feedback'
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
  // ---------------------------------------------------------------------------------------------
  // WELLBEING ASSESSMENT – wording from the ESG wellbeing assessment form (HSE management standards).
  // Answers live in the Wellbeing Assessments list, one item per assessment, visible only to the
  // line manager and that person (item permissions set by Flow 5). Never used in reports or charts.
  // ---------------------------------------------------------------------------------------------
  var WB_SECTIONS = [
    { key: 'demands', title: 'Demands', about: 'Includes issues such as workload, work patterns, and the work environment.',
      standard: ['employees indicate that they are able to cope with the demands of their jobs; and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['the organisation provides employees with adequate and achievable demands in relation to the agreed hours of work',
        'people\'s skills and abilities are matched to the job demands', 'jobs are designed to be within the capabilities of employees and',
        'employees\' concerns regarding their work environment are addressed'],
      q: [['d1', 'Do you feel that you have to work intensively or at speed at times?'], ['d2', 'Have you had to neglect some tasks due to your workload?'],
        ['d3', 'Do you have frequent demands from different work groups?'], ['d4', 'Are you a day worker who works excessive hours or works at home after hours?'],
        ['d5', 'Are you a shift worker?'], ['d6', 'Are there times when you are lone working or working remotely?'],
        ['d7', 'Are you part of the emergency scheme or carrying out on call duties?'], ['d8', 'Are you disturbed at home with work related calls?'],
        ['d9', 'Is regular travel (home or abroad) or working away from home a regular part of your work?']] },
    { key: 'control', title: 'Control', about: 'How much say the person has in the way they perform within their role.',
      standard: ['employees indicate that they are able to have a say about the way they perform within their role; and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['where possible, employees have control over their pace of work', 'employees are encouraged to use their skills and initiative to do their work',
        'where possible, employees are encouraged to develop new skills to help them undertake new and challenging pieces of work',
        'the organisation encourages employees to develop their skills', 'employees have a say over when breaks can be taken and', 'employees are consulted over their work patterns.'],
      q: [['c1', 'Do you feel that you have a say in how you do your work?'], ['c2', 'During busy times are you able to prioritise your own work?'],
        ['c3', 'Do you feel that as far as possible your work environment is reasonable?']] },
    { key: 'support', title: 'Support', about: 'Includes the encouragement, sponsorship and resources provided by the organisation, line management and colleagues.',
      standard: ['employees indicate that they receive adequate information and support from their colleagues and superiors and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['the organisation has policies and procedures to adequately support employees', 'systems are in place to enable and encourage managers to support their staff',
        'systems are in place to enable and encourage employees to support their colleagues', 'employees know what support is available and how and when to access it',
        'employees know how to access the required resources to do their job and', 'employees receive regular and constructive feedback.'],
      q: [['s1', 'Do you feel that you could rely on your line manager to help you with a work problem?'],
        ['s2', 'Do you feel that you could speak to your line manager about something that has upset or annoyed you at work?'],
        ['s3', 'Do you have regular feedback and encouragement from your line manager regarding your work?']] },
    { key: 'relationships', title: 'Relationships', about: 'Includes promoting positive working to avoid conflict and dealing with unacceptable behaviour.',
      standard: ['employees indicate that they are not subjected to unacceptable behaviours, e.g. bullying at work; and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['the organisation promotes positive behaviours at work to avoid conflict and ensure fairness;', 'employees share information relevant to their work;',
        'the organisation has agreed policies and procedures to prevent or resolve unacceptable behaviour;', 'systems are in place to enable and encourage managers to deal with unacceptable behaviour; and',
        'systems are in place to enable and encourage employees to report unacceptable behaviour.'],
      q: [['r1', 'Do you feel that your colleagues would help you if work became difficult?'], ['r2', 'Are your colleagues willing to listen to your work related problems?'],
        ['r3', 'Do you feel there are interpersonal conflicts with either team members or team leader/manager?'],
        ['r4', 'Have you felt harassed in any way by the words or actions of others at work?'], ['r5', 'Have you recently felt bullied at work?']] },
    { key: 'role', title: 'Role', about: 'Whether people understand their role within the organisation and whether the organisation ensures that the person does not have conflicting roles.',
      standard: ['employees indicate that they understand their role and responsibilities; and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['the organisation ensures that, as far as possible, the different requirements it places upon employees are compatible;',
        'the organisation provides information to enable employees to understand their role and responsibilities;',
        'the organisation ensures that, as far as possible, the requirements it places upon employees are clear; and',
        'systems are in place to enable employees to raise concerns about any uncertainties or conflicts they have in their role and responsibilities.'],
      q: [['ro1', 'Do you feel under-utilised?'], ['ro2', 'Do you feel under-valued?'], ['ro3', 'Do you feel able to say ‘no’?'],
        ['ro4', 'Do you feel you are not working to your full potential?'], ['ro5', 'Do you feel that you have scope to progress within the organisation?'],
        ['ro6', 'Do you feel you have the respect of your colleagues in the role you perform?'], ['ro7', 'Are you clear on the goals and objectives in your team?'],
        ['ro8', 'Are you clear on your role?'], ['ro9', 'Are you required to supervise others?']] },
    { key: 'change', title: 'Change', about: 'How organisational change (large or small) is managed and communicated in the organisation.',
      standard: ['employees indicate that the organisation engages them frequently when undergoing an organisational change; and', 'systems are in place locally to respond to any individual concerns.'],
      states: ['the organisation provides employees with timely information to enable them to understand the reasons for proposed changes;',
        'the organisation ensures adequate employee consultation on changes and provides opportunities for employees to influence proposals;',
        'employees are aware of the probable impact of any changes to their jobs. If necessary, employees are given training to support any changes in their jobs;',
        'employees are aware of timetables for changes; and', 'employees have access to relevant support during changes.'],
      q: [['ch1', 'Do you feel sufficiently informed of any changes taking place in your team?'], ['ch2', 'Are you clear on the goals and objectives for your team?'],
        ['ch3', 'Do you feel sufficiently informed on any changes in the wider organisation?']] }
  ];
  var WB_YNA = [{ value: 'Y', text: 'Yes' }, { value: 'N', text: 'No' }, { value: 'NA', text: 'n/a' }];
  function wbYna(v) { return v === 'Y' ? 'Yes' : v === 'N' ? 'No' : v === 'NA' ? 'n/a' : '—'; }
  var WB_INTRO_ME = 'This form is designed to help you talk to your line manager about things that are a source of stress for you and discuss supportive measures that can help your wellbeing at work. There are no right or wrong answers.';
  var WB_INTRO_MGR = ['Supporting and maintaining wellbeing is key to ensuring our people thrive at work and remain safe. The wellbeing assessment provides an opportunity to understand what causes stress for our people via an open and honest conversation. The aim is to identify key stressors and what can be done to support your team member appropriately at work. The discussion will also provide an understanding of how to spot the signs their mental health is changing at work so that you can respond appropriately.',
    'Arrange for wellbeing to be the main focus of conversation during a dedicated, hour long session to provide time for a meaningful discussion. The assessment must take place with the individual and line manager together in an undisturbed, confidential meeting in a private area. Active listening is key. A good outcome is a good or improved understanding of the key stressors for your team member and how you can support them at work.',
    'This wellbeing assessment must be completed on an annual basis, as a minimum, with the option to use it more often – for example on a return to work following a period of absence or as part of a discussion with the manager. It is not recommended to complete it alongside the annual appraisal. If risks are identified, supportive measures must be put in place with a review date to check they work. Further assistance can be obtained from Occupational Health or Human Resources.'];
  var WB_STRESS = 'Stress is defined as the reaction arising in an individual when the demand placed upon them exceeds their perceived capacity to cope. These pressures and demands can be work or home related or a combination of factors. The form provides a framework to understand what is having an impact so that appropriate supportive measures can be put in place.';
  var WB_SUPPORT = ['Supportive measures (where reasonably practicable) may include temporary adjustments such as alternative hours, duties, training or development, or tools to further support you in your role. On occasions it may be necessary to seek temporary redeployment or special leave; advice is available via Human Resources.',
    'Wellbeing support can be accessed via the Employee Assistance Programme, Occupational Health, or signposted via Mental Health First Aiders. Further information can be found on the Alongside You pages of eNZO. The Employee mental health pack and the Manager’s mental health pack outline the support available and how to access it.'];
  var WB_PERSONAL = [
    ['circKnow', 'If yes, I’d like you to know the following'], ['circImpact', 'How this can impact on me at work'],
    ['circNotice', 'How you might notice this is having a negative impact on me at work']];
  var WB_MORE = [
    ['mhBest', 'I feel at my best at work when…', 'e.g. I have set deadlines for work, take a break away from my desk, have regular feedback from my manager'],
    ['mhSigns', 'Signs that my mental health is changing at work', 'e.g. I’m quiet, more reactive to people'],
    ['supMgr', 'As my manager, the best way you can support me at work is…', ''],
    ['supOwn', 'Actions I take to look after my own wellbeing at work', ''],
    ['other', 'Can you identify anything else that may be a source of stress for you at home or work?', '']];
  // Names shown on screen (⚙ Settings → Names). Permissions never depend on them.
  function defaultLabels() { return { app: 'ESG Technician 1-to-1', mgr: 'Team Leader', one: 'Technician', many: 'Technicians' }; }
  var L = defaultLabels();
  function parseLabels(json) {
    var d = defaultLabels(), v = safeJson(json, {});
    Object.keys(d).forEach(function (k) { var x = str(v && v[k]).replace(/\s+/g, ' ').trim().slice(0, 40); if (x) { d[k] = x; } });
    return d;
  }
  // lower-case the first letter for use mid-sentence, but leave acronyms (e.g. "SQEP") alone
  function lc(x) { return String(x || '').split(' ').map(function (w) { return w.length > 1 && w.charAt(1) === w.charAt(1).toLowerCase() ? w.charAt(0).toLowerCase() + w.slice(1) : w; }).join(' '); }
  function defaultReminders() { return [20, 27]; }
  // Read exactly as Flow 1 does: it emails on any day whose number appears in the stored list, so only plain whole
  // numbers count, and anything unreadable means no reminders (the page shows 'off', and Save rewrites it cleanly).
  function parseReminders(json) {
    var v = safeJson(json, null);
    if (!Array.isArray(v)) { return []; }
    return v.filter(function (n, i, a) { return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 31 && a.indexOf(n) === i; })
      .sort(function (x, y) { return x - y; });
  }
  function ordinal(n) { var s2 = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s2[(v - 20) % 10] || s2[v] || s2[0]); }
  function remindersText(days) { if (!days.length) { return 'none'; } var o = days.map(ordinal); return o.length === 1 ? o[0] : o.slice(0, -1).join(', ') + ' and ' + o[o.length - 1]; }
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
  var WELLBEING = [], WB_AVAILABLE = false;   // wellbeing assessments the viewer can read
  var FEEDBACK_ISSUES = [];     // line manager only: feedback that Flow 6 couldn't email (or hasn't yet)
  var FBK = { open: false, type: 'Fault', text: '', note: '', err: false, busy: false };   // the feedback bubble
  var REVIEWS = [];             // one object per Monthly Review item the viewer can read
  var SETTINGS = { bands: defaultBands(), itemId: 0, reminders: defaultReminders(), remindersId: 0, labelsId: 0 };

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
  // Accepts the ways people type dates in the UK (day before month): 15/07/2027, 15-7-27, 15.07.2027,
  // 15 Jul 2027, 15-July-27, 15th July 2027, and ISO 2027-07-15 (what the calendar picker returns).
  function parseDate(str) {
    var t = String(str || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ');
    var y, mo, d, m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[-\s\/.]+(\d{1,2})[-\s\/.]+(\d{2}|\d{4})$/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{1,2})[-\s\/.]*([a-z]{3,9})\.?[-\s\/.]*(\d{2}|\d{4})$/.exec(t))) {
      var mi = MON.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].slice(0, 3));
      if (mi < 0) { return null; }
      d = +m[1]; mo = mi + 1; y = +m[3];
    } else { return null; }
    if (y < 100) { y += 2000; }
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12) { return null; }
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) { return null; }
    return dt.toISOString().slice(0, 10);
  }
  function longDate(iso) { return iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''; }
  function monthLabel(key) { return new Date(key + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function monthShort(key) { return MON[+key.slice(5, 7) - 1]; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function first(name) { return String(name || '').split(' ')[0]; }
  function f1(v) { return v === null || v === undefined || isNaN(v) ? '—' : v.toFixed(1); }
  // SharePoint returns dates as UTC instants; convert to the site's calendar date.
  function localDate(isoUtc) {
    if (!isoUtc) { return ''; }
    var d = new Date(isoUtc);
    if (isNaN(d.getTime())) { return ''; }
    try {
      // build yyyy-mm-dd from parts rather than relying on a locale's output format
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
        .forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (_) { return d.toISOString().slice(0, 10); }
  }
  // validateUpdateListItem reads date text using the site's (or the user's) regional settings, so a date
  // is written in the first format SharePoint accepts AND reads back as the same calendar day (writeDates).
  var DATE_FORMATS = {
    iso: function (iso) { return iso; },
    dmy: function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); },
    mdy: function (iso) { return iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4); }
  };
  var dateFormat = '';   // learned on the first successful verified write
  function appraisalYearOf(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); var s = m >= 4 ? y : y - 1; return s + '/' + String(s + 1).slice(2); }
  function safeJson(str, fallback) {
    if (!str || typeof str !== 'string') { return fallback; }
    try { var v = JSON.parse(str); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; }
  }
  // A JSON column that should hold a list of objects: anything else (null entries, numbers, a bare object) is ignored.
  function jsonList(raw) { var v = safeJson(raw, []); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); }) : []; }
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
      var next = res.json && res.json['odata.nextLink'] ? String(res.json['odata.nextLink']) : '';
      path = next && next.indexOf(siteUrl + '/') === 0 ? next : '';   // never follow a paging link off this site
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
  // The ONLY create function. Line manager: expectations, settings, team members, wellbeing assessments.
  // Everyone: feedback from the bubble (1-to-1 Feedback list, own items only until Flow 6 locks them).
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
  // Date-only columns: write { Field: 'yyyy-mm-dd' or '' } and prove SharePoint stored the same calendar day.
  async function writeDates(list, id, dates) {
    var keys = Object.keys(dates);
    if (!keys.length) { return; }
    var clears = {}, sets = keys.filter(function (k) { if (!dates[k]) { clears[k] = ''; return false; } return true; });
    if (Object.keys(clears).length) { await spUpdate(list, id, clears); }
    if (!sets.length) { return; }
    var order = [dateFormat, 'iso', 'dmy', 'mdy'].filter(function (f, i, a) { return f && a.indexOf(f) === i; });
    for (var i = 0; i < order.length; i++) {
      var fv = {};
      sets.forEach(function (k) { fv[k] = DATE_FORMATS[order[i]](dates[k]); });
      // Only a rejected value is a format problem; a server, throttling or network failure is reported as such.
      var retry = new Error('Couldn\'t reach SharePoint to save the date – please try again.');
      try { await spUpdate(list, id, fv); } catch (e) {
        var m = String(e && e.message);
        if (/refused|read-only|Invalid item/.test(m)) { throw e; }
        if (e instanceof TypeError || /^Save failed \((?!400\))/.test(m)) { throw retry; }
        continue;
      }
      var back = await req('GET', listPath(list) + '/items(' + Number(id) + ')?$select=' + sets.join(','));
      if (!back.ok) { throw retry; }
      if (back.ok && back.json && sets.every(function (k) { return localDate(back.json[k]) === dates[k]; })) { dateFormat = order[i]; return; }
    }
    throw new Error('SharePoint did not store the date correctly. Check Site settings → Regional settings (Locale English (United Kingdom), ' +
      'time zone London) and your own Microsoft 365 language and region (English UK), then try again.');
  }

  // ---------------------------------------------------------------------------------------------
  // load: build the model from SharePoint
  // ---------------------------------------------------------------------------------------------
  var MR_FIELDS = 'ID,Title,ReviewKey,ReviewItemId,MonthKey,DueDate,ReviewState,SubmittedOn,SubmittedLate,TechFollowUp,ExpectationSnapshotJson,' +
    'FB_Q1,FB_Q2,FB_Q3,FB_Q4,FB_Q5,FB_Q6,FB_Q7,FB_Q9,FB_Overall,ExpectationFeedbackJson,FollowUpDecision,MeetingDate,ActionsJson,ActionsStatus,NextActionDue,' +
    'ReleasedOn,TechnicianAadId,Technician/Id,Technician/Title,Technician/EMail';
  var WB_FIELDS = 'ID,Title,AssessmentStatus,AssessmentDate,Position,EmployeeNumber,AnswersJson,PersonalJson,ArrangementsJson,ManagerNotes,NextReviewDate,' +
    'SubmittedOn,CompletedOn,Technician/Id,Technician/Title,Technician/EMail';
  // Feedback list: only failed / undelivered items are read (line manager only), to show in Needs your attention.
  var FB_FIELDS = 'ID,Title,FeedbackType,Message,PageName,AppVersion,DeliveryStatus,SentOn,Created,Author/Title,Author/EMail';
  var REV_FIELDS = 'ID,Title,MonthKey,DueDate,ReviewStatus,Q1WentWell,Q2Issue,Q2Impact,Q2Tried,Q2Support,Q3WorkloadRating,Q3WorkloadComment,' +
    'Q4WellbeingRaise,Q4WellbeingDetail,Q5PlanningRaise,Q5PlanningDetail,Q6DevRaise,Q6DevWhat,Q6DevWhy,Q7ManagerFeedback,ExpectationsJson,Q9FollowUp,' +
    'Mood,WinOfMonth,AppraisalDate,Technician/Id,Technician/Title,Technician/EMail';

  // Ratings are whole numbers 1–5; anything else in an (editable) record is treated as not given.
  function r15(v) { var n = num(v); return n !== null && n >= 1 && n <= 5 && Math.floor(n) === n ? n : null; }
  function emptyFeedback() {
    return { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q9: '', overall: '', exp: {}, expRating: {}, followOverride: '', meeting: '', actions: [] };
  }
  function buildReview(rv, mr, techName) {
    var expJson = jsonList(rv.ExpectationsJson);
    var snap;
    var trusted = mr && Array.isArray(safeJson(mr.ExpectationSnapshotJson, null)) ? jsonList(mr.ExpectationSnapshotJson) : null;
    if (IS_TL && trusted) {
      snap = trusted.map(function (e) { return { id: e.id, title: str(e.title), measures: str(e.measures), year: str(e.year) }; });
    } else {
      snap = expJson.map(function (e) { return { id: e.id, title: str(e.title), measures: str(e.measures), year: str(e.year) }; });
    }
    var status = str(rv.ReviewStatus) || 'Not Started';
    var st = mr && mr.ReviewState ? str(mr.ReviewState)
      : (status === 'Not Started' || status === 'Draft' ? 'Open' : status);
    // Plan D.7: Monthly Review columns are technician-editable, so month and due date come from the
    // trusted Manager Review whenever it is readable (always for the TL; after release for a technician).
    var month = str(mr && mr.MonthKey) || str(rv.MonthKey);
    var due = (mr && localDate(mr.DueDate)) || localDate(rv.DueDate) || lastDay(month);
    var r = {
      id: rv.ID, mrId: mr ? mr.ID : 0, tech: techName, month: month, due: due,
      state: st, draft: status === 'Draft', status: status,
      processing: st === 'Open' && status !== 'Not Started' && status !== 'Draft',
      submittedOn: mr ? localDate(mr.SubmittedOn) : '', late: !!(mr && mr.SubmittedLate),
      snapshot: snap,
      released: !!(mr && (mr.ReleasedOn || str(mr.ReviewState) === 'Completed' || str(mr.ReviewState) === 'Closed - Not Submitted')),
      appraisalDate: localDate(rv.AppraisalDate),
      answers: {
        mood: r15(rv.Mood), win: str(rv.WinOfMonth),
        q1: str(rv.Q1WentWell), q2: { issue: str(rv.Q2Issue), impact: str(rv.Q2Impact), tried: str(rv.Q2Tried), support: str(rv.Q2Support) },
        q3: r15(rv.Q3WorkloadRating), q3c: str(rv.Q3WorkloadComment),
        q4: str(rv.Q4WellbeingRaise) || null, q4d: str(rv.Q4WellbeingDetail),
        q5: str(rv.Q5PlanningRaise) || null, q5d: str(rv.Q5PlanningDetail),
        q6: str(rv.Q6DevRaise) || null, q6what: str(rv.Q6DevWhat), q6why: str(rv.Q6DevWhy),
        q7: str(rv.Q7ManagerFeedback),
        q8: snap.map(function (e) {
          var x = expJson.find(function (y) { return String(y.id) === String(e.id); }) || {};
          return { id: e.id, rating: r15(x.rating), comment: str(x.comment) };
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
      jsonList(mr.ExpectationFeedbackJson).forEach(function (x) { fb.exp[x.id] = str(x.feedback); if (r15(x.rating)) { fb.expRating[x.id] = r15(x.rating); } });
      fb.actions = jsonList(mr.ActionsJson).map(function (a) {
        return { id: str(a.id) || String(Math.random()).slice(2, 10), text: str(a.text), owner: str(a.owner), criteria: str(a.criteria),
          due: /^\d{4}-\d{2}-\d{2}$/.test(str(a.due)) ? str(a.due) : '', status: str(a.status) === 'Closed' ? 'Closed' : 'Open',
          closedOn: /^\d{4}-\d{2}-\d{2}$/.test(str(a.closedOn)) ? str(a.closedOn) : '' };
      });
      r.mrTechFollowUp = str(mr.TechFollowUp);
    }
    return r;
  }
  function parseBands(json) {
    var b = safeJson(json, null);
    if (!Array.isArray(b) || b.length !== 4 || b.some(function (x) { return !x || typeof x !== 'object'; })) { return defaultBands(); }
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
    function srow(t) { return settingsRows.find(function (x) { return str(x.Title) === t; }); }
    var bandsRow = srow('Bands'), remRow = srow('Reminders'), labRow = srow('Labels');
    SETTINGS = { bands: bandsRow ? parseBands(bandsRow.Value) : defaultBands(), itemId: bandsRow ? bandsRow.ID : 0,
      reminders: remRow ? parseReminders(remRow.Value) : defaultReminders(), remindersId: remRow ? remRow.ID : 0, labelsId: labRow ? labRow.ID : 0,
      remindersRaw: remRow ? str(remRow.Value) : null };
    L = labRow ? parseLabels(labRow.Value) : defaultLabels();

    var revs = await spGetAll(CONFIG.lists.reviews, REV_FIELDS, 'Technician');
    var mrs = await spGetAll(CONFIG.lists.mgr, MR_FIELDS, 'Technician');
    var mrByItem = {};
    mrs.forEach(function (m) { if (m.ReviewItemId) { mrByItem[Number(m.ReviewItemId)] = m; } });

    REVIEWS = []; TECHS = []; TECH_INFO = {}; MASTER_EXPECTATIONS = []; FEEDBACK_ISSUES = [];
    if (IS_TL) {
      var techs = await spGetAll(CONFIG.lists.techs, 'ID,Title,Active,AppraisalDate,TechnicianAadId,Technician/Id,Technician/Title,Technician/EMail,Technician/Name', 'Technician');
      var byEmail = {};
      techs.forEach(function (t) {
        var name = str(t.Title) || str(t.Technician && t.Technician.Title);
        var email = str(t.Technician && t.Technician.EMail).toLowerCase();
        // two people with the same name are kept apart (everything on the page is keyed by this name)
        if (TECH_INFO[name] && TECH_INFO[name].email !== email) { name = name + ' (' + (email || ('item ' + t.ID)) + ')'; }
        TECH_INFO[name] = { appraisal: localDate(t.AppraisalDate), itemId: t.ID, email: email, claims: str(t.Technician && t.Technician.Name), active: !!t.Active };
        if (email) { byEmail[email] = name; }
        if (t.Active) { TECHS.push(name); }
      });
      TECHS.sort();
      revs.forEach(function (rv) {
        var mr = mrByItem[Number(rv.ID)] || null;
        var who = (mr && mr.Technician) || rv.Technician;   // owner from the trusted record (plan D.7)
        var email = str(who && who.EMail).toLowerCase();
        var name = byEmail[email] || str(who && who.Title) || 'Unknown';
        if (!TECH_INFO[name]) { TECH_INFO[name] = { appraisal: '', itemId: 0, email: email, claims: '', active: false }; }
        REVIEWS.push(buildReview(rv, mr, name));
      });
      // feedback the line manager hasn't received by email: Failed, or still Pending after an hour (Flow 6 off?)
      FEEDBACK_ISSUES = (await spGetAll(CONFIG.lists.feedback, FB_FIELDS, 'Author')).filter(function (f) {
        var st = str(f.DeliveryStatus) || 'Pending', age = Date.now() - new Date(f.Created).getTime();
        return st === 'Failed' || (st === 'Pending' && age > 3600000);
      });
      var exps = await spGetAll(CONFIG.lists.exp, 'ID,Title,Measures,AppraisalYear,AppliesTo,SortOrder,Active,Technician/Id,Technician/Title,Technician/EMail,Technician/Name', 'Technician');
      var wbChk = await req('GET', listPath(CONFIG.lists.wellbeing) + '?$select=Id');
      WB_AVAILABLE = wbChk.ok;
      WELLBEING = WB_AVAILABLE ? (await spGetAll(CONFIG.lists.wellbeing, WB_FIELDS, 'Technician')).map(function (w) {
        var em = str(w.Technician && w.Technician.EMail).toLowerCase();
        return buildWb(w, byEmail[em] || str(w.Technician && w.Technician.Title) || 'Unknown');
      }) : [];
      MASTER_EXPECTATIONS = exps.map(function (e) {
        var email = str(e.Technician && e.Technician.EMail).toLowerCase();
        return { id: e.ID, title: str(e.Title), measures: str(e.Measures), year: str(e.AppraisalYear), scope: str(e.AppliesTo) === 'Individual' ? 'Individual' : 'Shared',
          tech: email ? (byEmail[email] || str(e.Technician.Title)) : '', sort: num(e.SortOrder) || 0, active: !!e.Active };
      });
    } else {
      // Defence in depth: SharePoint item permissions keep other people's records away, but if one is ever readable
      // (a permission step failed or lagged) it is dropped here, never shown or written to.
      var myId = Number(me.json.Id) || -1, dropped = 0;
      var isMine = function (x) {
        var who = x && x.Technician, em = str(who && who.EMail).toLowerCase();
        var ok = (!!MY_EMAIL && em === MY_EMAIL) || (!!who && Number(who.Id) === myId);
        if (!ok) { dropped++; }
        return ok;
      };
      Object.keys(mrByItem).forEach(function (k) { if (!isMine(mrByItem[k])) { delete mrByItem[k]; } });
      revs.filter(isMine).forEach(function (rv) {
        REVIEWS.push(buildReview(rv, mrByItem[Number(rv.ID)] || null, ME));
      });
      TECHS = [ME];
      var latest = REVIEWS.slice().sort(function (x, y) { return x.month < y.month ? 1 : -1; })[0];
      TECH_INFO[ME] = { appraisal: latest ? latest.appraisalDate : '' };
      WB_AVAILABLE = true;
      WELLBEING = (await spGetAll(CONFIG.lists.wellbeing, WB_FIELDS, 'Technician')).filter(isMine).map(function (w) { return buildWb(w, ME); });
      if (dropped) { console.warn('ESG 1-to-1: ' + dropped + ' record(s) not belonging to you were readable and have been hidden. Tell the site owner.'); }
    }
    REVIEWS.sort(function (x, y) { return x.month === y.month ? (x.tech < y.tech ? -1 : 1) : (x.month < y.month ? -1 : 1); });
  }

  // ---------------------------------------------------------------------------------------------
  // calculations
  // ---------------------------------------------------------------------------------------------
  function isOverdue(r) { return r.state === 'Open' && !r.processing && TODAY > r.due; }
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
  // The appraisal date is the deadline, but it is best done in the calendar month before ("aim" from the 1st of that month).
  function monthName(key) { return new Date(key + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }); }
  function apStatus(ap) {
    if (!ap) { return null; }
    var days = daysBetween(TODAY, ap), aimMonth = addMonths(ap.slice(0, 7), -1);
    return { ap: ap, days: days, aimMonth: aimMonth, aimBy: lastDay(aimMonth), state: days < 0 ? 'overdue' : TODAY > lastDay(aimMonth) ? 'due' : TODAY >= aimMonth + '-01' ? 'aim' : 'ok' };
  }
  // states: ok (aim month still ahead) · aim (in the aim month) · due (in the appraisal month, before the date) · overdue
  function apSoon(s) { return !!s && (s.state === 'aim' || s.state === 'due'); }
  function aimText(s) { return s.state === 'due' ? 'due this month' : 'aim: in ' + monthName(s.aimMonth); }
  function overdueText(s) { return 'Overdue by ' + (-s.days) + ' day' + (s.days === -1 ? '' : 's'); }
  function daysToGo(s) { return s.days === 0 ? 'Today' : s.days + ' day' + (s.days === 1 ? '' : 's'); }
  // "Days to go" cell: Overdue in red, otherwise days plus a subtle "aim: in December" (amber once that month has started).
  function apDaysCell(td, ap) {
    var s = apStatus(ap);
    while (td.firstChild) { td.removeChild(td.firstChild); }
    td.className = 'num' + (s && s.state === 'overdue' ? ' overdue' : '');
    if (!s) { td.textContent = '—'; return td; }
    if (s.state === 'overdue') { td.textContent = overdueText(s); return td; }
    td.appendChild(document.createTextNode(daysToGo(s)));
    td.appendChild(h('div', { class: 'aimnote' + (apSoon(s) ? ' now' : ''), text: aimText(s) }));
    return td;
  }
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
  // ---------------------------------------------------------------------------------------------
  // writes (the only places data leaves the page – rule S6)
  // ---------------------------------------------------------------------------------------------
  // Technician: Monthly Reviews, own item only (SharePoint enforces it).
  function techFields(r, status) {
    // Details of a question answered No are sent as blank, but the in-memory answers (and the boxes on screen)
    // keep them, so switching back to Yes shows – and saves – exactly what is on screen.
    var a = r.answers, y4 = a.q4 === 'Yes', y5 = a.q5 === 'Yes', y6 = a.q6 === 'Yes';
    return {
      Q1WentWell: a.q1, Q2Issue: a.q2.issue, Q2Impact: a.q2.impact, Q2Tried: a.q2.tried, Q2Support: a.q2.support,
      Q3WorkloadRating: a.q3 || '', Q3WorkloadComment: a.q3c,
      Q4WellbeingRaise: a.q4 || '', Q4WellbeingDetail: y4 ? a.q4d : '',
      Q5PlanningRaise: a.q5 || '', Q5PlanningDetail: y5 ? a.q5d : '',
      Q6DevRaise: a.q6 || '', Q6DevWhat: y6 ? a.q6what : '', Q6DevWhy: y6 ? a.q6why : '',
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
    return { ActionsJson: JSON.stringify(actions), ActionsStatus: actions.length ? (open.length ? 'Open' : 'Done') : 'None' };
  }
  function nextActionDue(actions) {
    return actions.filter(function (a) { return a.status === 'Open'; }).map(function (a) { return a.due; }).filter(Boolean).sort()[0] || '';
  }
  // Team Leader: Manager Reviews feedback (never the state – that is a separate write).
  function mgrFields(r) {
    var fb = r.fb;
    var f = {
      FB_Q1: fb.q1, FB_Q2: fb.q2, FB_Q3: fb.q3, FB_Q4: fb.q4, FB_Q5: fb.q5, FB_Q6: fb.q6, FB_Q7: fb.q7, FB_Q9: fb.q9, FB_Overall: fb.overall,
      ExpectationFeedbackJson: JSON.stringify(r.snapshot.map(function (e) { return { id: e.id, feedback: fb.exp[e.id] || '', rating: fb.expRating[e.id] || null }; })),
      FollowUpDecision: fb.followOverride || ''
    };
    var sum = actionsSummary(fb.actions);
    Object.keys(sum).forEach(function (k) { f[k] = sum[k]; });
    return f;
  }
  function mgrDates(r) { return { MeetingDate: r.fb.meeting || '', NextActionDue: nextActionDue(r.fb.actions) }; }
  var busyLabels = {};
  async function busy(label, fn) {
    // a second click while the same action is still running is ignored (no duplicate items, no second email)
    if (busyLabels[label]) { return new Promise(function () {}); }
    busyLabels[label] = true;
    busyCount += 1; renderBusy();
    try { return await fn(); }
    catch (e) { toast(String(e && e.message ? e.message : e), true); throw e; }
    finally { busyCount -= 1; delete busyLabels[label]; renderBusy(); }
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
  // The layout is scaled with CSS zoom on large screens; fixed-position offsets are in zoomed px, so divide the mouse position by it.
  function zoomOf() { var z = root ? parseFloat(window.getComputedStyle(root).zoom) : 1; return z > 0 ? z : 1; }
  function moveTip(e) { if (tipEl) { var z = zoomOf(); tipEl.style.left = (e.clientX / z + 14) + 'px'; tipEl.style.top = (e.clientY / z + 14) + 'px'; } }
  // Close the Team menu on a click outside it or on Escape (listeners added once, on the layout root).
  function closeMenus(e) {
    if (!root) { return; }
    Array.prototype.forEach.call(root.querySelectorAll('details.teammenu[open]'), function (d) {
      if (!e || e.type === 'keydown' || !d.contains(e.target)) { d.removeAttribute('open'); }
    });
  }
  // Returns false if the person chose to stay. Edits are applied to the in-memory records as they are typed,
  // so leaving without saving reloads from SharePoint – discarded text can't be saved later by another action.
  function go(view, extra) {
    var discard = dirty;
    if (dirty && !window.confirm('You have unsaved changes. Leave this page without saving?')) { return false; }
    dirty = false;
    state.view = view; Object.keys(extra || {}).forEach(function (k) { state[k] = extra[k]; });
    if (discard) { start().catch(loadFailed); } else { render(true); }
    return true;
  }
  function markDirty() { dirty = true; editGen += 1; autosave.kick(); }
  var editGen = 0;
  // Auto-save: the open form registers a saver; it runs 4 s after the last change (at most every 20 s, to keep
  // list versions down), silently – a small status line shows Saving… / Saved 10:42 / Not saved. render() clears it.
  var autosave = (function () {
    var saver = null, statusEl = null, timer = null, retry = null, lastAt = 0, running = false, inflight = null;
    var DELAY = 4000, MIN_GAP = 20000, RETRY = 30000;
    function show(text, cls) { if (statusEl) { statusEl.textContent = text; statusEl.className = 'autosave' + (cls ? ' ' + cls : ''); } }
    function stop() { if (timer) { clearTimeout(timer); timer = null; } if (retry) { clearTimeout(retry); retry = null; } }
    function clear() { stop(); saver = null; statusEl = null; }
    function set(fn, el) { clear(); saver = fn; statusEl = el; show('Changes save automatically'); }
    function kick() {
      if (!saver) { return; }
      if (timer) { clearTimeout(timer); }
      timer = setTimeout(run, Math.max(DELAY, MIN_GAP - (Date.now() - lastAt)));
    }
    function run() {
      timer = null;
      if (!saver || !dirty) { return; }
      if (running || busyCount > 0) { kick(); return; }
      var fn = saver, gen = editGen, el = statusEl;
      running = true; show('Saving…');
      inflight = Promise.resolve().then(fn);
      inflight.then(function (result) {
        running = false;
        if (statusEl !== el) { return; }   // the page moved on
        if (result === 'skip') { show('Auto-save paused – finish the highlighted item', 'warn'); return; }
        lastAt = Date.now();
        if (editGen === gen) { dirty = false; } else { kick(); }   // typed while saving: save again
        show('Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      }).catch(function () {
        running = false;
        if (statusEl !== el) { return; }
        show('Not saved – will retry', 'warn');
        retry = setTimeout(function () { retry = null; kick(); }, RETRY);
      });
    }
    // Submit / Complete stop auto-save and wait for a save already on its way, so a late draft can't overwrite them.
    function settle() { clear(); var p = inflight; return p ? p.then(function () {}, function () {}) : Promise.resolve(); }
    return { set: set, kick: kick, clear: clear, settle: settle };
  })();

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
    if (r.processing) { return h('span', { class: 'chip blue', text: 'Submitted – processing' }); }
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
  // Date entry: type it the usual UK way (15/07/2027, 15 Jul 27 …) or pick it from the calendar.
  // The day is shown in words underneath so a wrong date is obvious before saving. An unrecognised
  // entry is flagged and never saved (the previous value is kept). opts: { id, noDirty }.
  function dateField(iso, onChange, label, opts) {
    opts = opts || {};
    var inp = h('input', { type: 'text', class: 'datef', id: opts.id || null, placeholder: 'dd/mm/yyyy', autocomplete: 'off', 'aria-label': label || 'Date',
      title: 'Type e.g. 15/07/2027 or 15 Jul 2027, or use the calendar button' });
    inp.value = fmtDate(iso);
    var hint = h('span', { class: 'datehint', 'aria-live': 'polite', text: iso ? longDate(iso) : '' });
    var pick = h('input', { type: 'date', class: 'dpick', tabindex: '-1', 'aria-hidden': 'true' });
    pick.value = iso || '';
    function bad(text) {
      inp.classList.add('bad'); hint.classList.add('bad');
      hint.textContent = 'Not recognised – type e.g. 15/07/2027 or use 📅';
      if (opts.onBad) { opts.onBad(text); }   // lets a caller keep the typed text across a redraw
    }
    if (opts.badText) { inp.value = opts.badText; bad(opts.badText); }
    function set(v) {
      if (opts.onBad) { opts.onBad(''); }
      inp.value = fmtDate(v); pick.value = v || ''; inp.classList.remove('bad');
      hint.textContent = v ? longDate(v) : ''; hint.classList.remove('bad');
      if (!opts.noDirty) { markDirty(); }
      onChange(v);
    }
    inp.addEventListener('change', function () {
      if (!inp.value.trim()) { set(''); return; }
      var v = parseDate(inp.value);
      if (v) { set(v); return; }
      bad(inp.value);
    });
    pick.addEventListener('change', function () { if (pick.value) { set(pick.value); } });
    var btn = h('button', { type: 'button', class: 'calbtn', title: 'Choose from a calendar', 'aria-label': 'Choose ' + (label || 'date') + ' from a calendar', text: '📅', onclick: function () {
      try { if (typeof pick.showPicker === 'function') { pick.showPicker(); return; } } catch (_) { /* fall back below */ }
      pick.focus(); pick.click();
    } });
    return h('span', { class: 'datewrap' }, [inp, btn, pick, hint]);
  }
  function badDates(el) { return el ? el.querySelectorAll('input.datef.bad').length : 0; }
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
        h('li', { text: ('The appraisal period is the 12 months up to each ' + lc(L.one) + '\'s appraisal date.') }),
        h('li', { text: ('Each submitted month gets a score: the average of the 1–5 ratings across all expectations. Where you have rated, your rating is used; otherwise the self-rating. ' + L.many + ' only see your rating once a review is released.') }),
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
    series('tl', C_TL, (L.mgr + ' rating'));
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
    return h('div', null, [legend([{ color: C_SELF, label: 'Self-rating' }, { color: C_TL, label: (L.mgr + ' rating') }, { dash: true, label: 'Projection to appraisal' }]), svg]);
  }
  function colChart(items, max, color, height, name, width, step) {
    var W = width || 640, H = height || 170, pl = 30, pr = 10, pt = 14, pb = 22, iw = W - pl - pr, ih = H - pt - pb, n = Math.max(1, items.length);
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': name });
    step = step || (max <= 10 ? 1 : Math.ceil(max / 5));
    for (var v = step; v <= max; v += step) {
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
  // two bars per person (e.g. self-rating vs line manager rating) on a 1–max scale
  function pairChart(items, max, ca, cb, width) {
    var W = width || 640, H = 170, pl = 30, pr = 10, pt = 14, pb = 22, iw = W - pl - pr, ih = H - pt - pb, n = Math.max(1, items.length);
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Self vs ' + L.mgr + ' rating' });
    for (var v = 1; v <= max; v++) {
      svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: pt + ih - v / max * ih, y2: pt + ih - v / max * ih, stroke: '#edf0f3' }));
      svg.appendChild(s('text', { x: pl - 7, y: pt + ih - v / max * ih + 4, 'text-anchor': 'end', text: String(v) }));
    }
    svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: pt + ih, y2: pt + ih, stroke: '#c9d1d9' }));
    var bw = Math.min(16, iw / n * 0.28);
    items.forEach(function (it, i) {
      var cx = pl + (i + 0.5) * iw / n;
      svg.appendChild(s('text', { x: cx, y: H - 6, 'text-anchor': 'middle', text: it.label }));
      [[it.a, ca, -1], [it.b, cb, 1]].forEach(function (p) {
        if (p[0] === null || p[0] === undefined) { return; }
        var bh = p[0] / max * ih;
        svg.appendChild(s('rect', { x: cx + (p[2] < 0 ? -bw - 1 : 1), y: pt + ih - bh, width: bw, height: bh, rx: 3, fill: p[1] }));
      });
      var hit = s('rect', { x: cx - iw / n / 2, y: pt, width: iw / n, height: ih, fill: 'transparent' });
      tip(hit, it.tipText); svg.appendChild(hit);
    });
    return h('div', null, [legend([{ color: ca, label: 'Self-rating' }, { color: cb, label: 'Your rating' }]), svg]);
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
    return h('div', null, [legend([{ color: C_SELF, label: 'Latest self-rating' }, { color: C_TL, label: ('Latest ' + L.mgr + ' rating') }]),
      h('div', { class: 'pairbars' }, perExp.map(function (x) {
        function bar(v, c, who) {
          return [tip(h('div', { class: 'bar' }, v ? h('i', { style: 'width:' + (v / 5 * 100) + '%;background:' + c }) : null), x.e.title + '\n' + who + ': ' + (v ? v + ' – ' + PROGRESS[v - 1].title : 'not rated yet')),
            h('div', { class: 'v', text: v ? String(v) : '—' })];
        }
        return h('div', { class: 'row' }, [h('div', { class: 'lbl', title: x.e.title, text: x.e.title })].concat(bar(x.latestSelf, C_SELF, 'Self')).concat(bar(x.latestTl, C_TL, L.mgr)));
      }))]);
  }

  // ---------------------------------------------------------------------------------------------
  // TECHNICIAN – this month
  // ---------------------------------------------------------------------------------------------
  // "Since last time": what this person raised last month, the line manager's reply, and how their actions stand.
  // Everything comes from records already loaded for them; unreleased feedback is never shown (canSeeTl).
  function sinceHidden(v) {
    try { if (v !== undefined) { window.localStorage.setItem('esg1to1.sinceHidden', v ? '1' : '0'); } return window.localStorage.getItem('esg1to1.sinceHidden') === '1'; }
    catch (_) { return !!v; }
  }
  function clip(text, n) {
    text = str(text);
    if (text.length <= n) { return h('span', { text: text }); }
    var sp = h('span', { text: text.slice(0, n).replace(/\s+\S*$/, '') + '… ' });
    var more = h('button', { class: 'linkbtn', type: 'button', text: 'more', onclick: function () { sp.textContent = text; more.remove(); } });
    return h('span', null, [sp, more]);
  }
  function sinceLastTime(r, mine) {
    var prior = mine.filter(function (x) { return x.month < r.month; })[0];
    if (!prior) { return null; }
    var pa = prior.answers, pf = prior.fb, rel = prior.released, raised = [];
    function item(label, text, reply) { raised.push({ label: label, text: text, reply: rel ? reply : '' }); }
    if (pa.q2.issue || pa.q2.support) { item('Challenge', pa.q2.issue + (pa.q2.support ? (pa.q2.issue ? ' – ' : '') + 'support needed: ' + pa.q2.support : ''), pf.q2); }
    if (pa.q4 === 'Yes') { item('Wellbeing', pa.q4d || 'You asked to talk about it', pf.q4); }
    if (pa.q5 === 'Yes') { item('Planning', pa.q5d || 'Something coming up', pf.q5); }
    if (pa.q6 === 'Yes') { item('Development', pa.q6what || 'Training or development', pf.q6); }
    if (pa.q9 === DEDICATED) { item('1-to-1', 'You asked for a dedicated 1-to-1', pf.q9 || (pf.meeting ? 'Meeting on ' + fmtDate(pf.meeting) : '')); }
    var acts = actionsOf(function (ac) { return ac.status === 'Open' || (ac.closedOn && ac.closedOn >= prior.month + '-01'); }, 'tech')
      .filter(function (x) { return x.r.tech === ME; })
      .sort(function (x, y) { return (x.ac.status === y.ac.status ? 0 : x.ac.status === 'Open' ? -1 : 1) || (x.ac.due < y.ac.due ? -1 : 1); });
    var hidden = sinceHidden();
    var body = h('div', { class: 'since-body' });
    body.hidden = hidden;
    var toggle = h('button', { class: 'linkbtn', type: 'button', text: hidden ? 'Show' : 'Hide', 'aria-expanded': hidden ? 'false' : 'true', onclick: function () {
      var hide = !body.hidden; body.hidden = hide; sinceHidden(hide); toggle.textContent = hide ? 'Show' : 'Hide'; toggle.setAttribute('aria-expanded', hide ? 'false' : 'true');
    } });
    if (!raised.length && !acts.length) {
      body.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'Nothing was raised last time – no open actions.' }));
    } else {
      if (raised.length) {
        body.appendChild(h('div', { class: 'since-h', text: 'What you raised in ' + monthLabel(prior.month) }));
        if (!rel) { body.appendChild(h('div', { class: 'small muted', text: 'Feedback not released yet – your ' + lc(L.mgr) + '\'s replies will show here.' })); }
        body.appendChild(h('ul', { class: 'since-list' }, raised.map(function (x) {
          return h('li', null, [h('b', { text: x.label + ': ' }), clip(x.text, 140),
            x.reply ? h('div', { class: 'since-reply' }, [h('b', { text: L.mgr + ': ' }), clip(x.reply, 160)]) : null]);
        })));
      }
      if (acts.length) {
        body.appendChild(h('div', { class: 'since-h', text: 'Your actions' }));
        body.appendChild(h('ul', { class: 'since-list' }, acts.slice(0, 6).map(function (x) {
          var od = acOverdue(x.ac);
          return h('li', null, [h('span', { class: x.ac.status === 'Open' ? (od ? 'overdue' : '') : 'ok', text: x.ac.status === 'Open' ? (od ? '⏰ ' : '○ ') : '✓ ' }),
            clip(x.ac.text, 120), h('span', { class: 'small muted', text: x.ac.status === 'Open' ? ' – due ' + fmtDate(x.ac.due) + (od ? ' (overdue)' : '') : ' – done' })]);
        })));
        if (acts.length > 6) { body.appendChild(h('button', { class: 'linkbtn', type: 'button', text: '+' + (acts.length - 6) + ' more → My appraisal', onclick: function () { go('myapp'); } })); }
      }
    }
    return h('section', { class: 'card since' }, [h('div', { class: 'card-h' }, [h('h2', { text: 'Since last time' }), toggle]), body]);
  }
  function techView() {
    var mine = reviewsOf(ME).slice().reverse();
    if (!mine.length) {
      return card('No 1-to-1 yet', null, [h('p', { text: ('You don\'t have a monthly 1-to-1 yet. It is created on the 1st of each month and you will receive an email with the link. If you think this is wrong, speak to your ' + L.mgr + '.') })]);
    }
    var r = REVIEWS.find(function (x) { return x.id === state.reviewId; });
    if (state.reviewId && !r) {
      state.reviewId = null;   // so 'This month' goes back to the current review
      return card('Review not found', null, [h('p', { text: ('This review could not be found, or it isn\'t yours. Use the link in your latest email or contact your ' + L.mgr + '.') })]);
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
      var left = pr.total - pr.done;
      meterTxt.textContent = pr.pct === 100 ? 'All done — ready to submit ✓'
        : pr.done + ' of ' + pr.total + ' complete · about ' + Math.max(1, Math.ceil(left * 0.75)) + ' min left';
      missingBox.textContent = '';
      var m = missingItems(a);
      missingBox.appendChild(m.length ? h('div', { class: 'missing' }, [h('strong', { text: 'Still to complete: ' }), m.join(' · ')])
        : h('div', { class: 'done', text: 'Everything required is complete – you can submit when ready.' }));
    }
    var saveStatus = h('span', { class: 'autosave', role: 'status' });
    if (editable) {
      autosave.set(function () {
        return spUpdate(CONFIG.lists.reviews, r.id, techFields(r, 'Draft')).then(function () { r.draft = true; r.status = 'Draft'; });
      }, saveStatus);
    }
    var monthSel = h('select', { 'aria-label': 'Choose a month', style: 'width:180px', onchange: function () { if (!go('tech', { reviewId: Number(monthSel.value) })) { monthSel.value = String(r.id); } } },
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
      confirmBox('Submit your 1-to-1?', ("You won't be able to change it afterwards. Your " + L.mgr + " will be notified."), 'Submit', function () {
        busy('submit', async function () {
          await autosave.settle();
          await spUpdate(CONFIG.lists.reviews, r.id, techFields(r, 'Submitted'));
          r.state = 'Submitted'; r.status = 'Submitted'; dirty = false;
          confetti(); toast('🎉 Nice one — ' + monthShort(r.month) + (' done! Your ' + L.mgr + ' has been notified.')); render(false);
        }).catch(function () {});
      });
    }
    var dl = daysLeft(r);
    var head = h('div', { class: 'pagehead sticky', style: 'display:block' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:16px' }, [
        h('div', { class: 'ph-l' }, [h('h2', { text: 'Monthly 1-to-1' }), monthSel, chipFor(r),
          editable ? h('span', { class: 'chip ' + (dl < 0 ? 'red' : dl <= 3 ? 'amber' : 'green'), text: dl < 0 ? plural(-dl, 'day') + ' overdue – you can still submit' : dl === 0 ? 'Due today' : plural(dl, 'day') + ' left' }) : null,
          h('span', { class: 'meta', text: 'Deadline 23:59, ' + fmtDate(r.due) })]),
        editable ? h('div', { class: 'btn-row' }, [h('div', { class: 'meterwrap' }, [meterTxt, saveStatus]), h('button', { class: 'btn', type: 'button', text: 'Save draft', onclick: function () { save().catch(function () {}); } }),
          h('button', { class: 'btn primary', type: 'button', text: 'Submit', onclick: submit })])
          : h('span', { class: 'muted', text: r.released ? 'Read-only – feedback released' : ('Submitted – awaiting your ' + L.mgr) })
      ]),
      editable ? h('div', { class: 'meter' }, meterFill) : null
    ]);

    function fbBlock(text) { return r.released && text ? h('div', { class: 'feedback' }, [h('b', { text: L.mgr }), text]) : null; }
    var cards = [];
    if (editable) { var since = sinceLastTime(r, mine); if (since) { cards.push(since); } }
    cards.push(qCard(1, 'What has gone well for you this month?', null, [
      textBox(null, a.q1, function (v) { a.q1 = v; refresh(); }, ro, 3), fbBlock(r.fb.q1)]));
    // Q2 is optional: folded while empty, so it takes one line unless there's something to say
    var q2has = !!(a.q2.issue || a.q2.impact || a.q2.tried || a.q2.support);
    var q2grid = h('div', { class: 'fgrid c4' }, [
      textBox("What's the issue?", a.q2.issue, function (v) { a.q2.issue = v; }, ro, 3),
      textBox("What's the impact?", a.q2.impact, function (v) { a.q2.impact = v; }, ro, 3),
      textBox('What have you tried?', a.q2.tried, function (v) { a.q2.tried = v; }, ro, 3),
      textBox('What support is needed?', a.q2.support, function (v) { a.q2.support = v; }, ro, 3)
    ]);
    q2grid.hidden = !q2has;
    var q2add = h('button', { class: 'btn small', type: 'button', text: '+ Add', 'aria-expanded': 'false', onclick: function () {
      q2grid.hidden = false; q2add.remove(); q2card.classList.remove('compact');
      var f = q2grid.querySelector('textarea'); if (f) { f.focus(); }
    } });
    var q2card = qCard(2, 'Challenges, blockers and support needed', q2has || ro ? h('span', { class: 'small muted', text: q2has ? 'Optional' : 'Nothing raised' }) : q2add,
      [q2grid, fbBlock(r.fb.q2)].filter(Boolean));
    if (!q2has) { q2card.classList.add('compact'); }
    cards.push(q2card);
    cards.push(qCard(3, 'How would you rate your current workload?', null, [
      choiceGroup('Workload rating', WORKLOAD, a.q3, function (v) { a.q3 = v; refresh(); }, ro, 'c5'),
      h('div', { class: 'detail' }, textBox('Comments (optional)', a.q3c, function (v) { a.q3c = v; }, ro, 2)), fbBlock(r.fb.q3)]));
    function ynCard(numb, title, key, detailFn) {
      var detail = h('div', { class: 'detail' }, detailFn());
      detail.hidden = a[key] !== 'Yes';
      var c = qCard(numb, title, ynSeg(a[key], function (v) { a[key] = v; detail.hidden = v !== 'Yes'; c.classList.toggle('compact', v === 'No'); refresh(); }, ro),
        [detail, fbBlock(r.fb[key])].filter(Boolean));
      if (a[key] === 'No') { c.classList.add('compact'); }   // answered No: one line
      return c;
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
    if (r.released) { expHead = expHead.concat([L.mgr]); }
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
      h('div', { class: 'small muted', style: 'margin-top:6px', text: ('Shared with your ' + L.mgr + '.') })]);
    var p = periodFor(ME), days = daysBetween(TODAY, p.apDate);
    var outlook = h('section', { class: 'card side-tile' }, [
      h('h3', null, ['Appraisal outlook', h('button', { class: 'btn small ghost', type: 'button', text: 'My appraisal →', onclick: function () { go('myapp'); } })]),
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [
        h('div', { class: 'big-score' }, [f1(o.projected), h('small', { text: ' / 5 projected' })]), bandChip(o.projected, true)]),
      track(o.projected),
      h('dl', { class: 'kv' }, [h('dt', { text: 'Appraisal date' }), h('dd', { class: p.set && days < 0 ? 'overdue' : null, text: p.set ? fmtDate(p.apDate) + (days < 0 ? ' (overdue)' : ' (' + daysToGo(apStatus(p.apDate)).toLowerCase() + ')') : 'Not set yet' }),
        p.set && days >= 0 ? h('dt', { text: 'Aim to complete' }) : null, p.set && days >= 0 ? h('dd', { text: apStatus(p.apDate).state === 'due' ? 'This month – it\'s due ' + fmtDate(p.apDate) : 'In ' + monthLabel(apStatus(p.apDate).aimMonth) }) : null,
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
          toast('Copied your ' + monthLabel(prior.month) + ' answers — update anything that has changed.'); render(false);
          markDirty();   // and let auto-save store it
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
    var o = expectedOutcome(tech, aud), p = o.period;
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
      tile('Current position', [f1(o.current), h('small', { text: ' / 5' })], 'Self ' + f1(o.selfAvg) + (' · ' + L.mgr + ' ') + f1(o.tlAvg)),
      (function () {
        var s = p.set ? apStatus(p.apDate) : null;
        if (!s) { return tile('Days to appraisal', '—', 'Not set'); }
        if (s.state === 'overdue') { return tile('Days to appraisal', 'Overdue', fmtDate(s.ap) + ' · ' + (-s.days) + ' day' + (s.days === -1 ? '' : 's') + ' ago', 'bad'); }
        return tile('Days to appraisal', s.days === 0 ? 'Today' : String(s.days), fmtDate(s.ap) + ' · ' + (s.state === 'due' ? 'due this month' : 'aim for ' + monthName(s.aimMonth)), apSoon(s) ? 'warn' : '');
      })(),
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
  // "Needs your attention": one actionable row per thing waiting on the line manager.
  function attentionItems() {
    var items = [];
    REVIEWS.filter(function (r) { return TECH_INFO[r.tech] && TECH_INFO[r.tech].active; }).forEach(function (r) {
      var open = function () { go('mgr', { reviewId: r.id, backTo: 'team' }); };
      if (r.state === 'Submitted') { items.push({ pri: 1, ico: '📝', text: r.tech + ' – ' + monthLabel(r.month) + ' review is waiting for you', btn: 'Review', fn: open }); }
      else if (isOverdue(r)) { items.push({ pri: 2, ico: '⏰', text: r.tech + ' – ' + monthLabel(r.month) + ' review is overdue (not submitted)', btn: 'Open', fn: open }); }
      if (r.month === CUR && followOf(r) === DEDICATED && r.state !== 'Completed') { items.push({ pri: 1, ico: '🗓', text: r.tech + ' asked for a dedicated 1-to-1', btn: 'Open', fn: open }); }
    });
    actionsOf(function (ac, r) { return acOverdue(ac) && TECH_INFO[r.tech] && TECH_INFO[r.tech].active; }, 'tl').forEach(function (x) {
      items.push({ pri: 2, ico: '✅', text: 'Overdue action for ' + x.r.tech + ': ' + x.ac.text + ' (due ' + fmtDate(x.ac.due) + ')', btn: 'Actions', fn: function () { state.actFilter = 'overdue'; go('actions'); } });
    });
    wellbeingAttention().forEach(function (x) { items.push(x); });
    FEEDBACK_ISSUES.forEach(function (f) {
      var who = str(f.Author && f.Author.Title) || 'someone';
      items.push({ pri: str(f.DeliveryStatus) === 'Failed' ? 1 : 2, ico: '💬', btn: 'Read', fn: function () { openFeedbackItem(f); },
        text: 'Feedback from ' + who + (str(f.DeliveryStatus) === 'Failed' ? ' couldn\'t be emailed' : ' hasn\'t been emailed yet') + ' – read it here' });
    });
    TECHS.forEach(function (t) {
      var ap = apDateOf(t);
      if (!ap) { items.push({ pri: 3, ico: '📅', text: 'No appraisal date set for ' + t, btn: 'Set date', fn: function () { openSettings('team'); } }); }
      else {
        var s = apStatus(ap), report = function () { state.report = { tech: t, aud: 'tl' }; render(false); };
        if (s.state === 'overdue') { items.push({ pri: 2, ico: '⏰', text: t + '\'s appraisal is overdue (' + fmtDate(ap) + ') – once it\'s done, set the next date', btn: 'Set date', fn: function () { openSettings('team'); } }); }
        else if (apSoon(s)) {
          items.push({ pri: 2, ico: '📄', btn: 'Report', fn: report, text: s.state === 'aim' ? 'Aim to complete ' + t + '\'s appraisal by ' + fmtDate(s.aimBy) + ' (due ' + fmtDate(ap) + ')'
            : t + '\'s appraisal is due ' + (s.days === 0 ? 'today' : 'in ' + daysToGo(s).toLowerCase()) + ' (' + fmtDate(ap) + ')' });
        }
      }
    });
    return items.sort(function (x, y) { return x.pri - y.pri; });
  }
  function attentionCard() {
    var items = attentionItems();
    var dl = daysBetween(TODAY, lastDay(CUR));
    var sub = 'Deadline ' + fmtDate(lastDay(CUR)) + (dl > 0 ? ' (' + plural(dl, 'day') + ')' : dl === 0 ? ' (today)' : '') + ' · reminders ' + (SETTINGS.reminders.length ? 'on the ' + remindersText(SETTINGS.reminders) : 'off');
    return card('Needs your attention', sub, [items.length ? h('div', { class: 'attn' }, items.map(function (x) {
      return h('div', { class: 'attn-row' }, [h('span', { class: 'attn-ico', 'aria-hidden': 'true', text: x.ico }), h('span', { class: 'attn-text', text: x.text }),
        h('button', { class: 'btn small', type: 'button', text: x.btn, onclick: x.fn })]);
    })) : h('div', { class: 'done', text: 'Nothing needs you right now ✓' })], 'attn-card', items.length ? h('span', { class: 'chip ' + (items.some(function (x) { return x.pri === 1; }) ? 'orange' : ''), text: String(items.length) }) : null);
  }
  // Third chart: the line manager picks what it shows (remembered on this computer only).
  var TEAM_CHARTS = [
    ['workload', 'Workload this month'], ['energy', 'Energy this month'], ['actions', 'Open actions'], ['ratings', 'Self vs your rating (latest)'],
    ['outcome', 'Expected outcome score'], ['ontime', 'On-time submissions (last 6 months)'], ['days', 'Days to appraisal']
  ];
  function chartPref(v) {
    try { if (v) { window.localStorage.setItem('esg1to1.teamChart', v); return v; } return window.localStorage.getItem('esg1to1.teamChart') || 'workload'; } catch (_) { return v || state.teamChart || 'workload'; }
  }
  function teamChartCard(outs) {
    var key = state.teamChart || chartPref();
    if (!TEAM_CHARTS.some(function (c) { return c[0] === key; })) { key = 'workload'; }
    var sel = h('select', { 'aria-label': 'Choose what this chart shows', class: 'chartsel', onchange: function () { state.teamChart = sel.value; chartPref(sel.value); render(false); } },
      TEAM_CHARTS.map(function (c) { var o = h('option', { value: c[0], text: c[1] }); o.selected = c[0] === key; return o; }));
    var sub = '', chart;
    if (key === 'workload' || key === 'energy') {
      var isW = key === 'workload';
      sub = isW ? monthLabel(CUR) + ' · 1 very light – 5 excessive' : monthLabel(CUR) + ' · 1 running low – 5 full charge';
      chart = colChart(TECHS.map(function (t) {
        var r = currentOf(t), v = r ? (isW ? r.answers.q3 : r.answers.mood) || null : null;
        return { label: first(t), value: v, color: isW ? (v >= 5 ? '#d14b4b' : v === 4 ? '#d99a12' : '#1f7190') : (v && v <= 2 ? '#d14b4b' : '#6a4fb0'),
          tipText: t + ': ' + (v ? (isW ? WORKLOAD[v - 1].title : moodEmoji(v)) + (r && isIn(r) ? '' : ' (draft)') : 'not given yet') };
      }), 5, '#1f7190', 170, sub, 420);
    } else if (key === 'actions') {
      var vals = TECHS.map(function (t) {
        var oa = actionsOf(function (ac, rr) { return rr.tech === t && ac.status === 'Open'; }, 'tl'), od = oa.filter(function (x) { return acOverdue(x.ac); }).length;
        return { label: first(t), value: oa.length, color: od ? '#d14b4b' : '#1f7190', tipText: t + ': ' + oa.length + ' open' + (od ? ', ' + od + ' overdue' : '') };
      });
      sub = 'Open agreed actions per person · red = has an overdue action';
      chart = colChart(vals, Math.max(3, Math.max.apply(null, vals.map(function (v) { return v.value; }))), '#1f7190', 170, sub, 420);
    } else if (key === 'ratings') {
      sub = 'Latest submitted month · blue = self-rating, orange = your rating';
      chart = pairChart(TECHS.map(function (t) {
        var r = reviewsOf(t).filter(isIn).pop();
        return { label: first(t), a: r ? selfAvg(r) : null, b: r ? mgrAvg(r) : null, tipText: t + (r ? ' – ' + monthLabel(r.month) + '\nSelf ' + f1(selfAvg(r)) + ' · You ' + f1(mgrAvg(r)) : ': nothing submitted yet') };
      }), 5, C_SELF, C_TL, 420);
    } else if (key === 'outcome') {
      sub = 'Projected score at each appraisal date (1–5)';
      chart = colChart(TECHS.map(function (t) {
        var o = outs[t];
        return { label: first(t), value: o.projected, color: o.band ? BAND_COL[o.band.cls] : '#9aa4ae', tipText: t + ': ' + (o.band ? f1(o.projected) + ' – ' + o.band.name : 'not enough data') };
      }), 5, '#1f7190', 170, sub, 420);
    } else if (key === 'ontime') {
      sub = 'Of the last 6 months that were due';
      chart = colChart(TECHS.map(function (t) {
        var rs = reviewsOf(t).filter(function (r) { return r.month < CUR || TODAY > r.due; }).slice(-6);
        var n = rs.filter(function (r) { return isIn(r) && !r.late; }).length;
        return { label: first(t), value: rs.length ? n : null, color: rs.length && n < rs.length ? '#d99a12' : '#2f9a63', tipText: t + ': ' + n + ' of ' + rs.length + ' on time' };
      }), 6, '#2f9a63', 170, sub, 420);
    } else {
      var dvals = TECHS.map(function (t) {
        var ap = apDateOf(t), s = apStatus(ap);
        return { label: first(t) + (s && s.state === 'overdue' ? ' ⚠' : ''), value: s && s.state !== 'overdue' ? s.days : null, color: apSoon(s) ? '#d99a12' : '#1f7190',
          tipText: t + ': ' + (!s ? 'no date set' : s.state === 'overdue' ? overdueText(s).toLowerCase() + ' (' + fmtDate(ap) + ')' : daysToGo(s).toLowerCase() + ' (' + fmtDate(ap) + ') · ' + (s.state === 'due' ? 'due this month' : 'aim for ' + monthName(s.aimMonth))) };
      });
      var mx = Math.max(30, Math.max.apply(null, dvals.map(function (v) { return v.value || 0; })));
      sub = 'Days until each appraisal · amber = in the aim month or due this month · ⚠ overdue';
      chart = colChart(dvals, Math.ceil(mx / 30) * 30, '#1f7190', 170, sub, 420, 30);
    }
    return card(null, null, [h('div', { class: 'card-h' }, [h('div', null, [sel, h('div', { class: 'sub', text: sub })])]), chart], 'chartcard');
  }
  function teamView() {
    if (!TECHS.length) {
      var steps = [
        ['Add your team', '⚙ Settings → Team → + Add a person. Search by name or email and click Add – access is set up for you.'],
        ['Set appraisal dates', '⚙ Settings → Team → each person\'s appraisal date (type it or use 📅) → Save settings.'],
        ['Add expectations', 'Expectations → Shared ones for everyone and Individual ones per person (10 at most each). Drag to reorder.'],
        ['Start the month', 'Flow 1 creates each review and emails the link at 07:00 on the 1st – or run it now from Power Automate.']
      ];
      return h('div', { class: 'stack' }, [
        h('div', { class: 'tiles' }, [tile('Submitted – ' + monthShort(CUR), '0', ('of 0 ' + lc(L.many))), tile('Awaiting your review', '0', 'Submitted, not yet released'),
          tile('Not yet submitted', '0', 'Due ' + fmtDate(lastDay(CUR))), tile('Dedicated 1-to-1s requested', '0', 'From follow-up answers'),
          tile('Open actions', '0', 'Across the team'), tile('Next appraisal', '—', 'Set dates in ⚙ Settings')]),
        card(('No ' + lc(L.many) + ' yet'), 'Four steps to get the team started', [h('div', { class: 'grid2', style: 'grid-template-columns:repeat(4,1fr);margin-top:6px' }, steps.map(function (st, i) {
          return h('div', { class: 'li', style: 'background:var(--soft);border-radius:8px;padding:12px 14px' }, [h('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:6px' },
            [h('span', { class: 'qnum', text: String(i + 1) }), h('b', { text: st[0] })]), h('div', { class: 'small', text: st[1] })]);
        }))])
      ]);
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
      (function () {
        var late = TECHS.filter(function (t) { var s = apStatus(apDateOf(t)); return s && s.state === 'overdue'; });
        if (late.length) { return tile('Appraisals overdue', String(late.length), late.length === 1 ? late[0] + ' · ' + fmtDate(apDateOf(late[0])) : late.map(first).join(', '), 'bad'); }
        var s = nextAp ? apStatus(apDateOf(nextAp)) : null;
        return tile('Next appraisal', s ? daysToGo(s) : '—', s ? nextAp + ' · ' + fmtDate(s.ap) + (s.state === 'due' ? '' : ' · aim by ' + fmtDate(s.aimBy).slice(0, 6)) : 'Set dates in ⚙ Settings', apSoon(s) ? 'warn' : '');
      })()
    ]);
    var bandCounts = SETTINGS.bands.map(function (b) {
      var who = TECHS.filter(function (t) { return outs[t].band && outs[t].band.cls === b.cls; });
      return { label: b.name, value: who.length, color: BAND_COL[b.cls], tipText: b.name + ': ' + (who.length ? who.join(', ') : 'nobody') };
    });
    var charts = h('div', { class: 'grid3', style: 'margin-top:14px' }, [
      attentionCard(),
      card('Expected appraisal outcomes', ('Number of ' + lc(L.many) + ' in each band'), [colChart(bandCounts, Math.max(3, Math.max.apply(null, bandCounts.map(function (b) { return b.value; }))), '#1f7190', 170, 'Expected outcome bands', 420)]),
      teamChartCard(outs)
    ]);
    var rows = TECHS.map(function (t) {
      var o = outs[t], r = currentOf(t), ap = apDateOf(t);
      var oa = actionsOf(function (ac, rr) { return rr.tech === t && ac.status === 'Open'; }, 'tl');
      var od = oa.filter(function (x) { return acOverdue(x.ac); }).length;
      return h('tr', { class: r && followOf(r) === DEDICATED ? 'hl' : null }, [
        h('td', null, [h('a', { href: '#', style: 'font-weight:650;color:var(--navy)', text: t, onclick: function (e) { e.preventDefault(); go('profile', { profileTech: t }); } }),
          r && followOf(r) === DEDICATED ? tip(h('span', { text: ' 🗓' }), 'Dedicated 1-to-1 requested') : null]),
        h('td', { class: 'num', text: ap ? fmtDate(ap) : 'Not set' }),
        apDaysCell(h('td'), ap),
        h('td', { style: 'width:170px' }, [h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px' }, [bandChip(o.projected), h('b', { class: 'num', text: f1(o.projected) })]), track(o.projected)]),
        h('td', { class: 'num' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_SELF }), f1(o.selfAvg)]), h('br'), h('span', null, [h('i', { class: 'dot', style: 'background:' + C_TL }), f1(o.tlAvg)])]),
        h('td', null, tip(h('span', null, sparkline(o.pts.map(function (pt) { return pt.used; }), '#13516b')), 'Monthly score, oldest → newest\n' + o.pts.map(function (pt) { return monthShort(pt.month) + ' ' + pt.used.toFixed(1); }).join('  '))),
        h('td', null, chipFor(r)),
        h('td', { class: 'num' + (od ? ' overdue' : ''), text: oa.length + (od ? ' · ' + od + ' overdue' : '') }),
        h('td', null, h('button', { class: 'btn small ghost', type: 'button', text: '📄', title: 'Appraisal report for ' + t, 'aria-label': 'Appraisal report for ' + t, onclick: function () { state.report = { tech: t, aud: 'tl' }; render(false); } }))
      ]);
    });
    var teamTbl = card('Team – appraisal outlook', 'Expected outcome at each appraisal date · dates and bands are set in ⚙ Settings', [
      legend([{ color: C_SELF, label: 'Self-rating average' }, { color: C_TL, label: 'Your rating average' }]),
      h('div', { class: 'nw' }, table([L.one, 'Appraisal date', 'Days to go', 'Expected outcome', 'Self / you', 'Trend', monthShort(CUR) + ' review', 'Open actions', ''], rows))
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
      [h('option', { value: '', text: ('All ' + lc(L.many)) })].concat(allTechs.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === state.techFilter; return o; })));
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
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-f-month', text: 'Month' }), monthSel]), h('div', null, [h('label', { for: 'oto-f-tech', text: L.one }), techSel])]),
      table([L.one, 'Month', 'Status', 'Submitted', 'Workload', 'Energy', 'Self avg', 'Your avg', 'Follow-up', 'Actions', ''], rows)
    ]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – appraisal expectations
  // ---------------------------------------------------------------------------------------------
  function groupOf(e) { return e.scope === 'Shared' ? 'S' : 'I:' + e.tech; }
  // Shared expectations are numbered 10, 20 … and individual ones 1010, 1020 … so shared always come first
  // on a review form (Flow 1 copies them in SortOrder).
  function nextSort(v) {
    var g = groupOf(v), base = g === 'S' ? 0 : 1000;
    return MASTER_EXPECTATIONS.filter(function (e) { return e.year === v.year && groupOf(e) === g; }).reduce(function (m, e) { return Math.max(m, e.sort); }, base) + 10;
  }
  function expectationsView() {
    if (!state.expYear) { state.expYear = CUR_YEAR; }
    var years = Array.from(new Set(MASTER_EXPECTATIONS.map(function (e) { return e.year; }).concat([CUR_YEAR]))).filter(Boolean).sort().reverse();
    var editing = state.expEdit ? MASTER_EXPECTATIONS.find(function (e) { return e.id === state.expEdit; }) : null;
    var f = editing ? { title: editing.title, measures: editing.measures, year: editing.year, scope: editing.scope, tech: editing.tech, active: editing.active }
      : { title: '', measures: '', year: CUR_YEAR, scope: 'Shared', tech: '', active: true };
    var drag = null;
    function reorder(arr, from, to) {
      if (to < 0 || to >= arr.length || from === to) { return; }
      var list2 = arr.slice(), moved = list2.splice(from, 1)[0];
      list2.splice(to, 0, moved);
      var base = groupOf(moved) === 'S' ? 0 : 1000, changes = [];
      list2.forEach(function (e, k) { var ns = base + 10 * (k + 1); if (e.sort !== ns) { changes.push([e, ns]); } });
      busy('order', async function () {
        for (var c = 0; c < changes.length; c++) { await spUpdate(CONFIG.lists.exp, changes[c][0].id, { SortOrder: String(changes[c][1]) }); changes[c][0].sort = changes[c][1]; }
        toast('Order saved – applies from the next monthly review.'); render(false);
      }).catch(function () { render(false); });
    }
    function activeCount(t, year, excludeId) {
      return MASTER_EXPECTATIONS.filter(function (e) { return e.active && e.year === year && e.id !== excludeId && (e.scope === 'Shared' || e.tech === t); }).length;
    }
    var tIn = h('input', { type: 'text', id: 'oto-x-title', maxlength: '255' }); tIn.value = f.title;
    var mIn = h('textarea', { id: 'oto-x-meas', rows: 3 }); mIn.value = f.measures;
    var yIn = h('input', { type: 'text', id: 'oto-x-year', maxlength: '20' }); yIn.value = f.year;
    var scSel = h('select', { id: 'oto-x-scope' }, ['Shared', 'Individual'].map(function (v) { var o = h('option', { value: v, text: v === 'Shared' ? ('Shared – all ' + lc(L.many)) : 'Individual' }); o.selected = v === f.scope; return o; }));
    var teSel = h('select', { id: 'oto-x-tech' }, [h('option', { value: '', text: '—' })].concat(TECHS.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === f.tech; return o; })));
    teSel.disabled = f.scope !== 'Individual';
    scSel.addEventListener('change', function () { teSel.disabled = scSel.value !== 'Individual'; if (teSel.disabled) { teSel.value = ''; } });
    var acIn = h('input', { type: 'checkbox', id: 'oto-x-active' }); acIn.checked = f.active;
    function fieldsFor(v) {
      return { Title: v.title, Measures: v.measures, AppraisalYear: v.year, AppliesTo: v.scope, SortOrder: String(v.sort), Active: v.active ? '1' : '0',
        Technician: v.scope === 'Individual' ? personValue(TECH_INFO[v.tech] && TECH_INFO[v.tech].claims) : '' };
    }
    function saveExp() {
      var v = { title: tIn.value.trim(), measures: mIn.value.trim(), year: yIn.value.trim(), scope: scSel.value, tech: scSel.value === 'Individual' ? teSel.value : '', active: acIn.checked };
      // order is set by dragging in the list; a new item (or one moved to another group/year) goes to the end of its group
      v.sort = editing && groupOf(editing) === groupOf(v) && editing.year === v.year ? editing.sort : nextSort(v);
      if (!v.title || !v.measures || !v.year) { toast('Title, measures and appraisal year are required.', true); return; }
      // Flow 1 matches the year exactly (e.g. 2026/27), so anything else would never reach a review
      if (!/^\d{4}\/\d{2}$/.test(v.year) || (Number(v.year.slice(2, 4)) + 1) % 100 !== Number(v.year.slice(5))) {
        toast('Appraisal year must look like ' + CUR_YEAR + ' (April to March).', true); return;
      }
      if (v.scope === 'Individual' && !v.tech) { toast(('Choose the ' + lc(L.one) + ' for an individual expectation.'), true); return; }
      if (v.scope === 'Individual' && !(TECH_INFO[v.tech] && TECH_INFO[v.tech].claims)) { toast(('That ' + lc(L.one) + ' has no account set in the ' + L.many + ' list.'), true); return; }
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
        h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-x-scope', text: 'Applies to' }), scSel]), h('div', null, [h('label', { class: 'field', for: 'oto-x-tech', text: L.one }), teSel])]),
        h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-x-year', text: 'Appraisal year' }), yIn]), h('div', { class: 'small muted', style: 'align-self:end;padding-bottom:6px', text: 'New items go to the end of their list – drag ⋮⋮ to reorder.' })]),
        h('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center;font-weight:600' }, [acIn, 'Active']),
        h('div', { class: 'btn-row' }, [h('button', { class: 'btn primary', type: 'button', text: editing ? 'Save changes' : 'Add expectation', onclick: saveExp }),
          editing ? h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { state.expEdit = null; render(false); } }) : null])
      ])
    ]);
    var cov = card(('Active expectations per ' + lc(L.one)), state.expYear + ' · maximum ' + CONFIG.maxExpectations, [
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
    function bySort(x, y) { return x.sort - y.sort || x.id - y.id; }
    function rowFor(e, i, arr) {
      var row = h('tr', { class: 'exprow' + (e.active ? '' : ' retired'), draggable: 'true', 'data-eid': String(e.id) });
      row.addEventListener('dragstart', function (ev) { drag = { arr: arr, from: i }; row.classList.add('dragging'); try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(e.id)); } catch (_) { /* ignore */ } });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); drag = null; });
      row.addEventListener('dragover', function (ev) { if (drag && drag.arr === arr) { ev.preventDefault(); row.classList.add('dropover'); } });
      row.addEventListener('dragleave', function () { row.classList.remove('dropover'); });
      row.addEventListener('drop', function (ev) { ev.preventDefault(); row.classList.remove('dropover'); if (drag && drag.arr === arr && drag.from !== i) { reorder(arr, drag.from, i); } });
      [h('td', { class: 'dragcell' }, [h('span', { class: 'grip', title: 'Drag to reorder', 'aria-hidden': 'true', text: '⋮⋮' }),
        h('button', { class: 'mv', type: 'button', 'aria-label': 'Move ' + e.title + ' up', title: 'Move up', disabled: i === 0, text: '▲', onclick: function () { reorder(arr, i, i - 1); } }),
        h('button', { class: 'mv', type: 'button', 'aria-label': 'Move ' + e.title + ' down', title: 'Move down', disabled: i === arr.length - 1, text: '▼', onclick: function () { reorder(arr, i, i + 1); } })]),
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
      ].forEach(function (c) { row.appendChild(c); });
      return row;
    }
    var body = [];
    var shared = list.filter(function (e) { return e.scope === 'Shared'; }).sort(bySort);
    body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: ('Shared – applies to every ' + lc(L.one) + ' (') + shared.filter(function (e) { return e.active; }).length + ' active)' })));
    body = body.concat(shared.length ? shared.map(rowFor) : [h('tr', null, h('td', { colspan: '5', class: 'muted', text: 'None.' }))]);
    TECHS.forEach(function (t) {
      var own = list.filter(function (e) { return e.scope === 'Individual' && e.tech === t; }).sort(bySort);
      body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: t + ' – individual (' + activeCount(t, state.expYear, -1) + ' of ' + CONFIG.maxExpectations + ' active including shared)' })));
      body = body.concat(own.length ? own.map(rowFor) : [h('tr', null, h('td', { colspan: '5', class: 'muted small', text: 'No individual expectations.' }))]);
    });
    var orphans = list.filter(function (e) { return e.scope === 'Individual' && TECHS.indexOf(e.tech) < 0; });
    if (orphans.length) {
      body.push(h('tr', { class: 'grp' }, h('td', { colspan: '5', text: ('Needs attention – individual expectations without an active ' + lc(L.one)) })));
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
    var headers = [].concat(opts.showTech ? [L.one] : [], opts.showMonth ? ['From'] : [], ['Action', 'Owner', 'Close-out criteria', 'Deadline', 'Status'], opts.manage ? [''] : []);
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
          var saved = false;
          busy('action', async function () {
            await spUpdate(CONFIG.lists.mgr, x.r.mrId, actionsSummary(x.r.fb.actions));
            saved = true;   // the action itself is stored; only the "next due" summary date may still fail
            await writeDates(CONFIG.lists.mgr, x.r.mrId, { NextActionDue: nextActionDue(x.r.fb.actions) });
            render(false);
          }).catch(function () { if (!saved) { ac.status = prev.status; ac.closedOn = prev.closedOn; } render(false); });
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
      [h('option', { value: '', text: ('All ' + lc(L.many)) })].concat(Object.keys(TECH_INFO).sort().map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === state.actTech; return o; })));
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
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-a-st', text: 'Status' }), stSel]), h('div', null, [h('label', { for: 'oto-a-tech', text: L.one }), techSel])]),
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
      qCard(8, 'Appraisal expectations', h('span', { class: 'small muted', text: 'Your ratings feed the appraisal outlook' }), [r.snapshot.length ? table(['Expectation', L.one, 'Your rating', 'Your feedback'],
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
      qCard(9, 'Follow-up', null, [ans(has ? (L.one + ' preference: ') + (a.q9 || r.mrTechFollowUp || '(not answered)') : ''), fbBox('q9', 'Your comment')]),
      card('Agreed actions', 'Add as many as needed – each needs an owner, close-out criteria and a deadline', [actionsEditor(r)]),
      card('Overall feedback', null, [textBox(null, fb.overall, function (v) { fb.overall = v; }, false, 3)])
    ];
    var canComplete = r.state === 'Submitted', canClose = r.state === 'Open' && TODAY > r.due && !r.processing;
    function incompleteActions() { return r.fb.actions.filter(function (ac) { return !ac.text.trim() || !ac.criteria.trim() || !ac.due; }).length; }
    function saveFeedback() {
      if (badDates(root)) { toast('A date isn\'t recognised – fix the highlighted date first.', true); return Promise.reject(new Error('bad date')); }
      var n = incompleteActions();
      if (n) { toast(n + ' action' + (n === 1 ? ' is' : 's are') + ' missing the action, close-out criteria or deadline.', true); return Promise.reject(new Error('incomplete')); }
      return busy('fb', async function () {
        await spUpdate(CONFIG.lists.mgr, r.mrId, mgrFields(r));
        await writeDates(CONFIG.lists.mgr, r.mrId, mgrDates(r));
        dirty = false;
      });
    }
    // Auto-save only before release: once released, every save is visible to the technician straight away,
    // so half-typed text must never go live – that stays a deliberate Save.
    var mgrStatus = h('span', { class: 'autosave', role: 'status' });
    if (!r.released && (r.state === 'Open' || r.state === 'Submitted')) {
      autosave.set(function () {
        if (badDates(root) || incompleteActions()) { return 'skip'; }
        return spUpdate(CONFIG.lists.mgr, r.mrId, mgrFields(r)).then(function () { return writeDates(CONFIG.lists.mgr, r.mrId, mgrDates(r)); });
      }, mgrStatus);
    }
    function command(newState, okMsg) {
      saveFeedback().then(function () {
        return busy('state', async function () {
          await autosave.settle();
          await spUpdate(CONFIG.lists.mgr, r.mrId, { ReviewState: newState });
          r.state = newState; r.released = true; toast(okMsg); render(false);
        });
      }).catch(function () {});
    }
    var actions = h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', type: 'button', text: 'Save feedback', onclick: function () {
        saveFeedback().then(function () { toast(r.released ? ('Saved – already released, so the ' + lc(L.one) + ' sees this change.') : ('Saved – not visible to the ' + lc(L.one) + ' until you complete the review.')); }).catch(function () {}); } }),
      h('button', { class: 'btn primary', type: 'button', text: 'Complete & release', disabled: !canComplete, onclick: function () {
        confirmBox('Complete this review?', 'Your feedback, ratings and actions will be released to ' + r.tech + ' and they will be emailed.', 'Complete & release', function () {
          command('Completed', 'Completed – the feedback is being released.'); });
      } }),
      h('button', { class: 'btn danger', type: 'button', text: 'Close – not submitted', disabled: !canClose, onclick: function () {
        confirmBox('Close as not submitted?', r.tech + ' will no longer be able to submit this review.', 'Close review', function () {
          command('Closed - Not Submitted', 'Closed.'); });
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: '← Back', onclick: function () { go(state.backTo === 'profile' ? 'profile' : (state.backTo || 'reviews')); } }),
      r.released ? h('span', { class: 'small muted', text: 'Released – changes save only when you click Save feedback.' }) : mgrStatus
    ]);
    var head = h('div', { class: 'pagehead sticky' }, [
      h('div', { class: 'ph-l' }, [h('h2', { text: r.tech + ' – ' + monthLabel(r.month) }), chipFor(r),
        h('span', { class: 'meta', text: r.submittedOn ? 'Submitted ' + fmtDate(r.submittedOn) + (r.late ? ' (late)' : '') : 'Deadline ' + fmtDate(r.due) })]), actions]);
    var side = h('div', { class: 'stack' });
    function refreshSide() {
      side.textContent = '';
      var o = expectedOutcome(r.tech, 'tl'), streak = streakOf(r.tech), sa = selfAvg(r), ma = mgrAvg(r);
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: (L.one + ' check-in') }),
        h('dl', { class: 'kv', style: 'margin-top:0' }, [h('dt', { text: 'Energy' }), h('dd', { text: a.mood ? moodEmoji(a.mood) : '—' }),
          h('dt', { text: 'On-time streak' }), h('dd', { text: streak ? '🔥 ' + streak + ' month' + (streak === 1 ? '' : 's') : '—' }),
          h('dt', { text: 'Follow-up preference' }), h('dd', { text: followOf(r) === DEDICATED ? 'Dedicated 1-to-1' : (has && a.q9 ? (a.q9 === FOLLOW[0] ? 'Nothing further' : 'Quick catch-up') : '—') })])]));
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'This month\'s ratings' }),
        h('div', { class: 'small', style: 'display:flex;justify-content:space-between;margin-bottom:4px' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_SELF }), L.one]), h('b', { text: f1(sa) })]), track(sa),
        h('div', { class: 'small', style: 'display:flex;justify-content:space-between;margin:12px 0 4px' }, [h('span', null, [h('i', { class: 'dot', style: 'background:' + C_TL }), 'You']), h('b', { text: f1(ma) })]), track(ma)]));
      side.appendChild(h('section', { class: 'card side-tile' }, [
        h('h3', null, ['Appraisal outlook', h('button', { class: 'btn small ghost', type: 'button', text: 'Profile →', onclick: function () { go('profile', { profileTech: r.tech }); } })]),
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, [h('div', { class: 'big-score' }, [f1(o.projected), h('small', { text: ' / 5' })]), bandChip(o.projected, true)]),
        track(o.projected),
        h('dl', { class: 'kv' }, [h('dt', { text: 'Appraisal' }), h('dd', { text: o.period.set ? fmtDate(o.period.apDate) : 'Not set' }), h('dt', { text: 'Current' }), h('dd', { text: f1(o.current) })])]));
      var followSel = h('select', { id: nid('s'), onchange: function () { fb.followOverride = followSel.value; markDirty(); } },
        [h('option', { value: '', text: ('Accept ' + lc(L.one) + '\'s preference') })].concat(FOLLOW.map(function (x) { var op = h('option', { value: x, text: x }); op.selected = fb.followOverride === x; return op; })));
      var mid = nid('d'), meeting = dateField(fb.meeting, function (v) { fb.meeting = v; }, '1-to-1 meeting date', { id: mid, badText: fb.meetingRaw, onBad: function (t) { fb.meetingRaw = t; } });
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'Follow-up decision' }),
        h('div', { class: 'stack', style: 'gap:8px' }, [followSel, h('div', null, [h('label', { class: 'field', for: mid, text: '1-to-1 meeting date (optional)' }), meeting])])]));
    }
    refreshSide();
    var banners = [];
    if (followOf(r) === DEDICATED) { banners.push(h('div', { class: 'banner amber', text: 'Dedicated 1-to-1 discussion requested' })); }
    if (r.state === 'Completed' || r.state === 'Closed - Not Submitted') { banners.push(h('div', { class: 'banner info', text: ('Already released – any change you save is visible to the ' + lc(L.one) + ' straight away. Record the reason in the Manager Reviews correction log.') })); }
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
        var owners = [r.tech, L.mgr];
        if (ac.owner && owners.indexOf(ac.owner) < 0) { owners.push(ac.owner); }
        var ow = h('select', { 'aria-label': 'Owner' }, owners.map(function (v) { var o = h('option', { value: v, text: v }); o.selected = ac.owner === v; return o; }));
        ow.addEventListener('change', function () { ac.owner = ow.value; markDirty(); });
        var cr = h('input', { type: 'text', 'aria-label': 'Close-out criteria', maxlength: '500' }); cr.value = ac.criteria; cr.addEventListener('input', function () { ac.criteria = cr.value; markDirty(); });
        var du = dateField(ac.due, function (v) { ac.due = v; }, 'Deadline');
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
  // WELLBEING – model, list pages, the form (technician), the review panel (line manager), print
  // ---------------------------------------------------------------------------------------------
  function okYna(v) { return v === 'Y' || v === 'N' || v === 'NA' ? v : ''; }
  function buildWb(w, name) {
    var ans = safeJson(w.AnswersJson, {});
    if (!ans || typeof ans !== 'object' || Array.isArray(ans)) { ans = {}; }
    var answers = {};
    WB_SECTIONS.forEach(function (sec) { sec.q.forEach(function (q) { var x = ans[q[0]] || {}; answers[q[0]] = { app: okYna(x.app), issue: okYna(x.issue), help: str(x.help) }; }); });
    var per = safeJson(w.PersonalJson, {});
    if (!per || typeof per !== 'object' || Array.isArray(per)) { per = {}; }
    var personal = { circ: per.circ === 'Yes' || per.circ === 'No' ? per.circ : '' };
    WB_PERSONAL.concat(WB_MORE).forEach(function (f) { personal[f[0]] = str(per[f[0]]); });
    var arr = jsonList(w.ArrangementsJson);
    var status = str(w.AssessmentStatus);
    return {
      id: w.ID, tech: name, rawStatus: ['Open', 'Submitted', 'Completed'].indexOf(status) >= 0 ? status : 'Open',
      date: localDate(w.AssessmentDate), position: str(w.Position), empNo: str(w.EmployeeNumber), answers: answers, personal: personal,
      arrangements: arr.map(function (a) {
        return { id: str(a.id) || String(Math.random()).slice(2, 10), text: str(a.text), review: /^\d{4}-\d{2}-\d{2}$/.test(str(a.review)) ? str(a.review) : '',
          effective: a.effective === 'Yes' || a.effective === 'No' ? a.effective : '', next: str(a.next) };
      }),
      notes: str(w.ManagerNotes), nextReview: localDate(w.NextReviewDate), submittedOn: localDate(w.SubmittedOn), completedOn: localDate(w.CompletedOn)
    };
  }
  // Status shown on screen. CompletedOn and SubmittedOn are stamped by Flow 5; the status column alone is
  // never trusted (plan D.7) – a person's own "Submitted" waits for Flow 5 to lock the form.
  function wbState(w) {
    if (w.completedOn && w.rawStatus === 'Completed') { return 'Completed'; }
    if (w.submittedOn && w.rawStatus !== 'Open') { return 'Submitted'; }
    if (w.rawStatus !== 'Open') { return 'Processing'; }
    return 'Open';
  }
  function wbChip(w) {
    var st = wbState(w);
    if (st === 'Completed') { return h('span', { class: 'chip green', text: 'Completed' }); }
    if (st === 'Submitted') { return h('span', { class: 'chip blue', text: IS_TL ? 'Ready for your review' : 'Submitted' }); }
    if (st === 'Processing') { return h('span', { class: 'chip blue', text: 'Submitted – processing' }); }
    return h('span', { class: 'chip amber', text: IS_TL ? 'With ' + first(w.tech) + ' to complete' : 'To complete' });
  }
  function oneYearOn(iso) { var y = String(+iso.slice(0, 4) + 1) + iso.slice(4); return parseDate(y) || addDays(iso, 365); }
  function wbOf(tech) { return WELLBEING.filter(function (w) { return w.tech === tech; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : a.date === b.date ? a.id - b.id : 1; }); }
  function wbLastCompleted(tech) { return wbOf(tech).filter(function (w) { return wbState(w) === 'Completed'; }).pop() || null; }
  function wbOpenOne(tech) { return wbOf(tech).filter(function (w) { return wbState(w) !== 'Completed'; }).pop() || null; }
  function wbIssues(w) {
    var out = [];
    WB_SECTIONS.forEach(function (sec) { sec.q.forEach(function (q) { if (w.answers[q[0]].issue === 'Y') { out.push({ sec: sec.title, q: q[1], help: w.answers[q[0]].help }); } }); });
    return out;
  }
  function wbSectionDone(w, sec) { return sec.q.every(function (q) { var a = w.answers[q[0]]; return a.app && (a.app !== 'Y' || a.issue); }); }
  function wbYouDone(w) { return !!w.personal.circ && (w.personal.circ !== 'Yes' || !!w.personal.circKnow.trim()); }
  function wbMissing(w) {
    var m = [];
    WB_SECTIONS.forEach(function (sec) { if (!wbSectionDone(w, sec)) { m.push(sec.title); } });
    if (!wbYouDone(w)) { m.push('About you – your circumstances'); }
    return m;
  }
  function wellbeingAttention() {
    if (!IS_TL || !WB_AVAILABLE) { return []; }
    var items = [];
    TECHS.forEach(function (t) {
      var open = wbOpenOne(t), last = wbLastCompleted(t);
      var go1 = function (w) { return function () { go('wb', { wbId: w.id }); }; };
      if (open && wbState(open) === 'Submitted') { items.push({ pri: 1, ico: '💚', text: t + '\'s wellbeing assessment is ready for your review', btn: 'Open', fn: go1(open) }); }
      if (last && last.nextReview && !open) {
        var d = daysBetween(TODAY, last.nextReview);
        if (d < 0) { items.push({ pri: 2, ico: '💚', text: 'Wellbeing review for ' + t + ' was due ' + fmtDate(last.nextReview), btn: 'Open', fn: go1(last) }); }
        else if (d <= 14) { items.push({ pri: 2, ico: '💚', text: 'Wellbeing review for ' + t + ' is due in ' + d + ' day' + (d === 1 ? '' : 's'), btn: 'Open', fn: go1(last) }); }
      }
      if (!open && (!last || (!last.nextReview && daysBetween(last.completedOn || last.date || TODAY, TODAY) > 365))) {
        items.push({ pri: 3, ico: '💚', text: 'No wellbeing assessment for ' + t + ' in the last 12 months', btn: 'Start', fn: function () { startWellbeing(t); } });
      }
    });
    return items;
  }
  function startWellbeing(preset) {
    var who = preset || '', date = '';
    var back = h('div', { class: 'modal-back' });
    var sel = h('select', { id: 'oto-wb-who' }, [h('option', { value: '', text: 'Choose…' })].concat(TECHS.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === who; return o; })));
    sel.addEventListener('change', function () { who = sel.value; });
    var df = dateField('', function (v) { date = v; }, 'Meeting date', { id: 'oto-wb-date', noDirty: true });
    function create() {
      if (!who) { toast('Choose who the assessment is for.', true); return; }
      if (badDates(back)) { toast('The meeting date isn\'t recognised.', true); return; }
      var info = TECH_INFO[who];
      if (!info || !info.claims) { toast(who + ' has no account set in the ' + L.many + ' list.', true); return; }
      busy('wb', async function () {
        var id = await spCreate(CONFIG.lists.wellbeing, { Title: who + ' – wellbeing assessment', Technician: personValue(info.claims), AssessmentStatus: 'Open' });
        // keep the new item even if the date then fails, so a retry can't create a duplicate
        var nw = buildWb({ ID: id, AssessmentStatus: 'Open', AssessmentDate: null }, who), dateOk = true;
        WELLBEING.push(nw);
        if (date) { try { await writeDates(CONFIG.lists.wellbeing, id, { AssessmentDate: date }); nw.date = date; } catch (_) { dateOk = false; } }
        back.remove();
        toast(dateOk ? 'Started. ' + first(who) + ' gets an email within about 5 minutes with a link to complete their part.'
          : 'Started, but the meeting date didn\'t save – set it in the panel below. ' + first(who) + ' still gets the email.', !dateOk);
        go('wb', { wbId: id });
      }).catch(function () {});
    }
    back.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start a wellbeing assessment' }, [
      h('h3', { text: 'Start a wellbeing assessment' }),
      h('p', { class: 'small muted', text: 'They complete their part first (they get an email with the link). You then go through it together in a private, hour-long conversation, agree any supportive arrangements and a review date, and complete it.' }),
      h('div', { class: 'stack', style: 'gap:10px' }, [h('div', null, [h('label', { class: 'field', for: 'oto-wb-who', text: 'Who' }), sel]),
        h('div', null, [h('label', { class: 'field', for: 'oto-wb-date', text: 'Meeting date (optional – you can add it later)' }), df])]),
      h('div', { class: 'btn-row', style: 'margin-top:14px' }, [h('button', { class: 'btn primary', type: 'button', text: 'Start assessment', onclick: create }),
        h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: function () { back.remove(); } })])
    ]));
    root.appendChild(back);
  }
  function wellbeingView() {
    if (!IS_TL) {
      var mine = wbOf(ME).slice().reverse();
      var intro = card('Wellbeing assessments', 'Private between you and your ' + lc(L.mgr), [h('p', { text: WB_INTRO_ME }), h('p', { class: 'small muted', text: WB_STRESS })]);
      if (!mine.length) { return h('div', { class: 'stack' }, [intro, card('Nothing to complete', null, [h('p', { text: 'You don\'t have a wellbeing assessment yet. Your ' + lc(L.mgr) + ' will start one with you – you\'ll get an email with the link. If you\'d like one sooner, just ask.' })])]); }
      return h('div', { class: 'stack' }, [intro, card('Your assessments', null, [table(['Started for', 'Status', 'Submitted', 'Completed', 'Next review', ''], mine.map(function (w) {
        return tr([w.date ? fmtDate(w.date) : 'Date to be agreed', wbChip(w), w.submittedOn ? fmtDate(w.submittedOn) : '—', w.completedOn ? fmtDate(w.completedOn) : '—',
          w.nextReview ? fmtDate(w.nextReview) : '—', h('button', { class: 'btn small ' + (wbState(w) === 'Open' ? 'primary' : ''), type: 'button', text: wbState(w) === 'Open' ? 'Continue' : 'View', onclick: function () { go('wb', { wbId: w.id }); } })]);
      }))])]);
    }
    if (!WB_AVAILABLE) {
      return card('Wellbeing assessments are not set up yet', null, [h('p', { text: 'Import solution version 1.1 and run "ESG 1-to-1 | 0 Setup" again – it adds the Wellbeing Assessments list. Then turn on "ESG 1-to-1 | 5 Wellbeing".' })]);
    }
    var submitted = WELLBEING.filter(function (w) { return wbState(w) === 'Submitted'; });
    var withThem = WELLBEING.filter(function (w) { return wbState(w) === 'Open' || wbState(w) === 'Processing'; });
    var none = TECHS.filter(function (t) { var l = wbLastCompleted(t); return !wbOpenOne(t) && (!l || (l.nextReview ? daysBetween(TODAY, l.nextReview) < 0 : daysBetween(l.completedOn || l.date || TODAY, TODAY) > 365)); });
    var due = TECHS.filter(function (t) { var l = wbLastCompleted(t); return l && l.nextReview && daysBetween(TODAY, l.nextReview) <= 30 && !wbOpenOne(t) && none.indexOf(t) < 0; });
    var tiles = h('div', { class: 'tiles t4' }, [
      tile('Ready for your review', String(submitted.length), 'Submitted by the person', submitted.length ? 'warn' : ''),
      tile('Being completed', String(withThem.length), 'Waiting for the person'),
      tile('Reviews due in 30 days', String(due.length), 'Next review date coming up', due.length ? 'warn' : ''),
      tile('Due an assessment', String(none.length), 'Review date passed, or none in 12 months', none.length ? 'bad' : '')
    ]);
    var rows = TECHS.map(function (t) {
      var last = wbLastCompleted(t), open = wbOpenOne(t), d = last && last.nextReview ? daysBetween(TODAY, last.nextReview) : null;
      return tr([h('b', { text: t }), last ? fmtDate(last.completedOn || last.date) : 'Never',
        open ? wbChip(open) : h('span', { class: 'muted', text: '—' }),
        last && last.nextReview ? h('span', { class: d < 0 ? 'overdue' : '', text: fmtDate(last.nextReview) + (d < 0 ? ' – overdue' : d <= 30 ? ' (' + (d ? plural(d, 'day') : 'today') + ')' : '') }) : '—',
        h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' }, [
          open ? h('button', { class: 'btn small primary', type: 'button', text: 'Open', onclick: function () { go('wb', { wbId: open.id }); } })
            : h('button', { class: 'btn small', type: 'button', text: '+ Start', onclick: function () { startWellbeing(t); } }),
          last ? h('button', { class: 'btn small ghost', type: 'button', text: 'Last one', onclick: function () { go('wb', { wbId: last.id }); } }) : null])]);
    });
    var all = WELLBEING.slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    var guide = h('details', { class: 'how' }, [h('summary', { text: 'ⓘ Guidance for line managers' })].concat(WB_INTRO_MGR.map(function (p) { return h('p', { text: p }); })).concat([h('p', { text: WB_STRESS })]));
    return h('div', { class: 'stack' }, [tiles,
      card('Team wellbeing', 'Completed at least once a year · only you and each person can see their assessment', [guide,
        h('div', { style: 'margin-top:10px' }, table([L.one, 'Last completed', 'In progress', 'Next review', ''], rows, { empty: 'No ' + lc(L.many) + ' yet.' })),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn primary', type: 'button', text: '+ Start a wellbeing assessment', onclick: function () { startWellbeing(); } }))]),
      card('All assessments', all.length + ' recorded', [table([L.one, 'Meeting date', 'Status', 'Submitted', 'Completed', 'Issues flagged', ''], all.map(function (w) {
        return tr([w.tech, w.date ? fmtDate(w.date) : '—', wbChip(w), w.submittedOn ? fmtDate(w.submittedOn) : '—', w.completedOn ? fmtDate(w.completedOn) : '—',
          wbState(w) === 'Open' ? '—' : String(wbIssues(w).length), h('button', { class: 'btn small', type: 'button', text: 'Open', onclick: function () { go('wb', { wbId: w.id }); } })]);
      }), { empty: 'None yet.' })])]);
  }
  // read-only answers, one table per section (issues highlighted)
  function wbAnswersView(w) {
    return WB_SECTIONS.map(function (sec) {
      return card(sec.title, sec.about, [table(['Question', 'Applies?', 'An issue?', 'What actions or adjustments would help?'], sec.q.map(function (q) {
        var a = w.answers[q[0]];
        return tr([h('span', { text: q[1] }), wbYna(a.app), a.issue === 'Y' ? h('b', { class: 'overdue', text: 'Yes' }) : wbYna(a.issue), a.help || '—'], a.issue === 'Y' ? 'hl' : '');
      }))]);
    });
  }
  function wbPersonalView(w) {
    var p = w.personal, rows = [h('div', { class: 'feedback', style: 'margin-top:0' }, [h('b', { text: 'Things that may affect me at work' }), p.circ || '—'])];
    if (p.circ === 'Yes') { WB_PERSONAL.forEach(function (f) { rows.push(h('div', { class: 'feedback' }, [h('b', { text: f[1] }), p[f[0]] || '—'])); }); }
    WB_MORE.forEach(function (f) { rows.push(h('div', { class: 'feedback' }, [h('b', { text: f[1] }), p[f[0]] || '—'])); });
    return card('About you – personal input', null, rows);
  }
  function wbArrangementsView(w) {
    var has = w.arrangements.length || w.notes || w.nextReview;
    return card('Agreed arrangements', 'Supportive measures agreed together, with a review date', has ? [
      table(['Arrangement', 'Review date', 'Was it effective?', 'If not, new arrangement'], w.arrangements.map(function (a) {
        return tr([a.text, a.review ? fmtDate(a.review) : '—', a.effective || '—', a.next || '—']); }), { empty: 'No arrangements recorded.' }),
      w.notes ? h('div', { class: 'feedback' }, [h('b', { text: 'Notes from the meeting' }), w.notes]) : null,
      h('div', { class: 'feedback' }, [h('b', { text: 'Next review' }), w.nextReview ? fmtDate(w.nextReview) : 'Not set'])
    ] : [h('p', { class: 'muted', text: 'Nothing recorded yet.' })]);
  }
  function wbSupportCard() { return card('Support available', null, WB_SUPPORT.map(function (p) { return h('p', { class: 'small', text: p }); })); }
  function wbHse(sec) {
    return h('details', { class: 'how hse' }, [h('summary', { text: 'ⓘ HSE management standard – ' + lc(sec.title) }),
      h('p', { class: 'small', text: sec.about }), h('div', { class: 'small', style: 'font-weight:650', text: 'The standard is that:' }), h('ul', null, sec.standard.map(function (x) { return h('li', { text: x }); })),
      h('div', { class: 'small', style: 'font-weight:650', text: 'What should be happening:' }), h('ul', null, sec.states.map(function (x) { return h('li', { text: x }); }))]);
  }
  function wbView() {
    var w = WELLBEING.find(function (x) { return x.id === state.wbId; });
    if (!w) { return card('Assessment not found', null, [h('p', { text: 'This wellbeing assessment could not be found, or it isn\'t yours.' })]); }
    var st = wbState(w);
    var head = h('div', { class: 'pagehead sticky' }, [h('div', { class: 'ph-l' }, [
      h('button', { class: 'btn small ghost', type: 'button', text: '← Wellbeing', onclick: function () { go('wellbeing'); } }),
      h('h2', { text: IS_TL ? 'Wellbeing assessment – ' + w.tech : 'Your wellbeing assessment' }), wbChip(w),
      h('span', { class: 'meta', text: w.date ? 'Meeting ' + fmtDate(w.date) : 'Meeting date to be agreed' })]),
      h('div', { class: 'btn-row', id: 'oto-wb-actions' }, [h('button', { class: 'btn', type: 'button', text: '🖨 Print / Save as PDF', onclick: function () { printWb(w); } })])]);
    if (!IS_TL && st === 'Open') { return h('div', null, [head, wbForm(w, head)]); }
    var parts = [];
    if (!IS_TL) {
      parts.push(h('div', { class: 'banner info', text: st === 'Completed' ? 'Completed – this is the agreed record of your conversation.' : 'Submitted – your ' + lc(L.mgr) + ' will go through it with you in a private meeting.' }));
    } else if (st === 'Open' || st === 'Processing') {
      parts.push(h('div', { class: 'banner amber', text: st === 'Open' ? 'Waiting for ' + w.tech + ' to complete their part. You\'ll get an email when they submit.' : w.tech + ' has submitted – the form locks within about 5 minutes.' }));
    }
    if (IS_TL && (st === 'Submitted' || st === 'Completed')) {
      var iss = wbIssues(w);
      parts.push(card(iss.length ? iss.length + ' area' + (iss.length === 1 ? '' : 's') + ' flagged as an issue' : 'No areas flagged as an issue', 'Start the conversation here', [iss.length
        ? h('div', { class: 'list' }, iss.map(function (x) { return h('div', { class: 'li' }, [h('b', { text: x.sec }), x.q + (x.help ? ' — would help: ' + x.help : '')]); }))
        : h('p', { class: 'muted', text: 'Nothing flagged – still talk through each area.' })]));
    }
    if (st !== 'Open' || IS_TL) {
      parts.push(card('Details', null, [h('dl', { class: 'kv', style: 'margin-top:0' }, [h('dt', { text: 'Name' }), h('dd', { text: w.tech }), h('dt', { text: 'Position' }), h('dd', { text: w.position || '—' }),
        h('dt', { text: 'Employee number' }), h('dd', { text: w.empNo || '—' }), h('dt', { text: 'Line manager' }), h('dd', { text: IS_TL ? ME : L.mgr })])]));
    }
    if (st !== 'Open') { parts = parts.concat(wbAnswersView(w)); parts.push(wbPersonalView(w)); }
    var side = [];
    if (IS_TL) { side.push(wbManagerPanel(w, head)); }
    else if (w.arrangements.length || w.notes || w.nextReview) { parts.push(wbArrangementsView(w)); }
    side.push(wbSupportCard());
    return h('div', null, [head, h('div', { class: 'layout' }, [h('div', { class: 'stack' }, parts), h('aside', { class: 'stack side-sticky' }, side)])]);
  }
  // Technician: step-by-step form so it is never one long page
  function wbForm(w, head) {
    var steps = [{ k: 'start', t: 'Start' }].concat(WB_SECTIONS.map(function (s2) { return { k: s2.key, t: s2.title, sec: s2 }; })).concat([{ k: 'you', t: 'About you' }, { k: 'finish', t: 'Finish' }]);
    if (state.wbStep === undefined || state.wbStep === null || state.wbStep >= steps.length) { state.wbStep = 0; }
    var area = h('div', { class: 'stack' });
    var nav = h('div', { class: 'wbsteps', role: 'tablist', 'aria-label': 'Sections' });
    function done(st2) { return st2.sec ? wbSectionDone(w, st2.sec) : st2.k === 'you' ? wbYouDone(w) : st2.k === 'start' ? true : false; }
    function writeWb(status) {
      return (async function () {
        var a = {};
        Object.keys(w.answers).forEach(function (k) { var x = w.answers[k]; if (x.app || x.issue || x.help) { a[k] = { app: x.app, issue: x.issue, help: x.issue === 'Y' ? x.help : '' }; } });
        var p = {}; Object.keys(w.personal).forEach(function (k) { p[k] = w.personal[k]; });
        if (p.circ !== 'Yes') { WB_PERSONAL.forEach(function (f) { p[f[0]] = ''; }); }
        await spUpdate(CONFIG.lists.wellbeing, w.id, { Position: w.position, EmployeeNumber: w.empNo, AnswersJson: JSON.stringify(a), PersonalJson: JSON.stringify(p), AssessmentStatus: status });
      })();
    }
    function save(status) {
      return busy('wb', function () {
        return (status === 'Open' ? Promise.resolve() : autosave.settle()).then(function () { return writeWb(status); }).then(function () { dirty = false; });
      });
    }
    var wbStatus = h('span', { class: 'autosave', role: 'status' });
    if (!IS_TL && wbState(w) === 'Open') { autosave.set(function () { return writeWb('Open'); }, wbStatus); }
    function goStep(i) {
      var leaving = dirty;
      state.wbStep = i;
      (leaving ? save('Open').then(function () { toast('Saved.'); }) : Promise.resolve()).catch(function () {}).then(draw);
    }
    function draw() {
      nav.textContent = ''; area.textContent = '';
      steps.forEach(function (st2, i) {
        nav.appendChild(h('button', { type: 'button', role: 'tab', class: 'wbstep' + (i === state.wbStep ? ' on' : '') + (done(st2) && st2.k !== 'start' ? ' ok' : ''), 'aria-selected': i === state.wbStep ? 'true' : 'false',
          text: (done(st2) && st2.k !== 'start' ? '✓ ' : '') + st2.t, onclick: function () { goStep(i); } }));
      });
      var cur = steps[state.wbStep];
      if (cur.k === 'start') {
        var pos = h('input', { type: 'text', id: 'oto-wb-pos', maxlength: '120' }); pos.value = w.position; pos.addEventListener('input', function () { w.position = pos.value; markDirty(); });
        var emp = h('input', { type: 'text', id: 'oto-wb-emp', maxlength: '40' }); emp.value = w.empNo; emp.addEventListener('input', function () { w.empNo = emp.value; markDirty(); });
        area.appendChild(card('Before you start', 'About 15–20 minutes · you can save and come back', [h('p', { text: WB_INTRO_ME }),
          h('p', { class: 'small muted', text: WB_STRESS }),
          h('p', { class: 'small', text: 'For each question choose whether it applies to you and whether it is causing an issue. If it is, say what actions or adjustments you feel would help. Your ' + lc(L.mgr) + ' will go through it with you in a private conversation. Only the two of you can see it.' })]));
        area.appendChild(card('Your details', null, [h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-wb-pos', text: 'Position' }), pos]),
          h('div', null, [h('label', { class: 'field', for: 'oto-wb-emp', text: 'Employee number (optional)' }), emp])])]));
      } else if (cur.sec) {
        var sec = cur.sec;
        area.appendChild(card(sec.title, sec.about, [wbHse(sec)].concat(sec.q.map(function (q, qi) {
          var a = w.answers[q[0]];
          var helpBox = h('div', { class: 'wbhelp' }, textBox('What actions or adjustments do you feel would help?', a.help, function (v) { a.help = v; }, false, 2));
          var issueWrap = h('div', { class: 'wbcol' }, [h('span', { class: 'wblab', text: 'Is it an issue?' }), seg(WB_YNA, a.issue, function (v) { a.issue = v; helpBox.hidden = v !== 'Y'; drawNav(); }, false, true)]);
          helpBox.hidden = a.issue !== 'Y'; issueWrap.hidden = a.app !== 'Y';
          var appSeg = seg(WB_YNA, a.app, function (v) {
            a.app = v; if (v !== 'Y') { a.issue = 'NA'; helpBox.hidden = true; } else if (a.issue === 'NA') { a.issue = ''; }
            issueWrap.hidden = v !== 'Y'; if (v === 'Y') { var ib = issueWrap.querySelector('.seg'); Array.prototype.forEach.call(ib.children, function (c) { c.setAttribute('aria-pressed', 'false'); c.setAttribute('aria-checked', 'false'); }); }
            drawNav();
          }, false, true);
          return h('div', { class: 'wbq' }, [h('div', { class: 'wbq-t' }, [h('span', { class: 'qnum', text: String(qi + 1) }), h('span', { text: q[1] })]),
            h('div', { class: 'wbq-a' }, [h('div', { class: 'wbcol' }, [h('span', { class: 'wblab', text: 'Does this apply to you?' }), appSeg]), issueWrap]), helpBox]);
        }))));
      } else if (cur.k === 'you') {
        var p = w.personal;
        var circBox = h('div', { class: 'stack', style: 'gap:10px;margin-top:10px' }, WB_PERSONAL.map(function (f) { return textBox(f[1], p[f[0]], function (v) { p[f[0]] = v; drawNav(); }, false, 2); }));
        circBox.hidden = p.circ !== 'Yes';
        area.appendChild(card('My circumstances', 'Life events or ongoing situations that may affect you at work', [
          h('p', { class: 'small muted', text: 'For example a medical condition, carer duties or another situation. This can change from time to time as life events occur – marriage, divorce, a birth, a bereavement – or it may be ongoing.' }),
          h('div', { class: 'q-head' }, [h('h3', { text: 'Do you have things that may affect you at work that may have an impact?' }), ynSeg(p.circ || null, function (v) { p.circ = v; circBox.hidden = v !== 'Yes'; drawNav(); })]), circBox]));
        area.appendChild(card('My mental health and support', null, [h('div', { class: 'stack', style: 'gap:12px' }, WB_MORE.slice(0, 4).map(function (f) {
          return h('div', null, [textBox(f[0] === 'supMgr' ? 'As my ' + lc(L.mgr) + ', the best way you can support me at work is…' : f[1], p[f[0]], function (v) { p[f[0]] = v; }, false, 2), f[2] ? h('div', { class: 'small muted', style: 'margin-top:3px', text: f[2] }) : null]);
        }))]));
      } else {
        var p2 = w.personal, miss = wbMissing(w);
        area.appendChild(card('Anything else?', null, [textBox(WB_MORE[4][1], p2.other, function (v) { p2.other = v; }, false, 3)]));
        area.appendChild(wbSupportCard());
        area.appendChild(miss.length ? h('div', { class: 'missing' }, [h('strong', { text: 'Still to answer: ' }), miss.join(' · ')])
          : h('div', { class: 'done', text: 'Everything is answered – submit when you\'re ready. You can\'t change it afterwards.' }));
        area.appendChild(h('div', { class: 'btn-row', style: 'justify-content:flex-end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Submit to my ' + lc(L.mgr), onclick: submit })]));
      }
      area.appendChild(h('div', { class: 'btn-row', style: 'justify-content:space-between' }, [
        state.wbStep > 0 ? h('button', { class: 'btn', type: 'button', text: '← Back', onclick: function () { goStep(state.wbStep - 1); } }) : h('span'),
        h('div', { class: 'btn-row' }, [wbStatus, h('button', { class: 'btn', type: 'button', text: 'Save draft', onclick: function () { save('Open').then(function () { toast('Draft saved.'); }).catch(function () {}); } }),
          state.wbStep < steps.length - 1 ? h('button', { class: 'btn primary', type: 'button', text: 'Next →', onclick: function () { goStep(state.wbStep + 1); } }) : null])]));
    }
    function drawNav() {
      Array.prototype.forEach.call(nav.children, function (b, i) { var ok = done(steps[i]) && steps[i].k !== 'start'; b.classList.toggle('ok', ok); b.textContent = (ok ? '✓ ' : '') + steps[i].t; });
    }
    function submit() {
      var miss = wbMissing(w);
      if (miss.length) { toast('Please answer: ' + miss.join(', '), true); return; }
      confirmBox('Submit your wellbeing assessment?', 'Your ' + lc(L.mgr) + ' will be told it is ready and will go through it with you. You can\'t change it afterwards.', 'Submit', function () {
        save('Submitted').then(function () { w.rawStatus = 'Submitted'; state.wbStep = 0; toast('Submitted – thank you.'); render(false); }).catch(function () {});
      });
    }
    draw();
    return h('div', { class: 'stack', style: 'margin-top:14px' }, [nav, area]);
  }
  // Line manager: arrangements, notes, review date, complete
  function wbManagerPanel(w, head) {
    var st = wbState(w), can = st === 'Submitted' || st === 'Completed';
    var arr = w.arrangements.map(function (a) { return { id: a.id, text: a.text, review: a.review, effective: a.effective, next: a.next }; });
    // yearly by default; the line manager can bring it forward by choosing an earlier date
    var notes = w.notes, date = w.date, next = w.nextReview || (st === 'Submitted' ? oneYearOn(date || TODAY) : '');
    var box = h('div', { class: 'stack', style: 'gap:10px' });
    function drawArr() {
      box.textContent = '';
      if (!arr.length) { box.appendChild(h('div', { class: 'small muted', text: 'No arrangements yet.' })); }
      arr.forEach(function (a, i) {
        var t = h('textarea', { rows: 2, 'aria-label': 'Arrangement ' + (i + 1), disabled: !can }); t.value = a.text; t.addEventListener('input', function () { a.text = t.value; markDirty(); });
        var eff = h('select', { 'aria-label': 'Was it effective?', disabled: !can }, [['', 'Effective? (at review)'], ['Yes', 'Yes – effective'], ['No', 'No – not effective']].map(function (o) { var op = h('option', { value: o[0], text: o[1] }); op.selected = a.effective === o[0]; return op; }));
        var nx = h('textarea', { rows: 2, 'aria-label': 'New arrangement', disabled: !can }); nx.value = a.next; nx.addEventListener('input', function () { a.next = nx.value; markDirty(); });
        var nxWrap = h('div', null, [h('span', { class: 'small muted', text: 'If not, new arrangement' }), nx]); nxWrap.hidden = a.effective !== 'No';
        eff.addEventListener('change', function () { a.effective = eff.value; nxWrap.hidden = eff.value !== 'No'; markDirty(); });
        box.appendChild(h('div', { class: 'wbarr' }, [h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [h('b', { class: 'small', text: 'Arrangement ' + (i + 1) }),
          can ? h('button', { class: 'btn small ghost', type: 'button', text: '✕', 'aria-label': 'Remove arrangement', onclick: function () { arr.splice(i, 1); markDirty(); drawArr(); } }) : null]),
          t, h('div', { class: 'fgrid c2' }, [h('div', null, [h('span', { class: 'small muted', text: 'Review date' }), dateField(a.review, function (v) { a.review = v; }, 'Review date for arrangement ' + (i + 1))]), eff]), nxWrap]));
      });
      if (can) { box.appendChild(h('button', { class: 'btn small', type: 'button', text: '+ Add arrangement', onclick: function () { arr.push({ id: String(Date.now()), text: '', review: '', effective: '', next: '' }); markDirty(); drawArr(); } })); }
    }
    drawArr();
    function saveAll(complete) {
      if (badDates(root)) { toast('A date isn\'t recognised – fix the highlighted date first.', true); return; }
      if (arr.some(function (a) { return !a.text.trim(); })) { toast('Each arrangement needs a description (or remove the empty one).', true); return; }
      busy('wb', async function () {
        await spUpdate(CONFIG.lists.wellbeing, w.id, { ArrangementsJson: JSON.stringify(arr), ManagerNotes: notes });
        await writeDates(CONFIG.lists.wellbeing, w.id, { NextReviewDate: next || '', AssessmentDate: date || '' });
        w.arrangements = arr; w.notes = notes; w.nextReview = next; w.date = date; dirty = false;
        if (complete) {
          await spUpdate(CONFIG.lists.wellbeing, w.id, { AssessmentStatus: 'Completed' });
          w.rawStatus = 'Completed'; w.completedOn = w.completedOn || TODAY;
          var older = wbOf(w.tech).filter(function (x) { return x.id !== w.id && x.nextReview && wbState(x) === 'Completed'; });
          for (var i = 0; i < older.length; i++) { await writeDates(CONFIG.lists.wellbeing, older[i].id, { NextReviewDate: '' }); older[i].nextReview = ''; }
          toast('Completed – ' + first(w.tech) + ' is emailed that the record is ready.');
        } else { toast(can ? 'Saved – ' + first(w.tech) + ' can see this straight away.' : 'Meeting date saved.'); }
        render(false);
      }).catch(function () {});
    }
    var nid1 = nid('wbn'), nid2 = nid('wbd');
    var notesBox = textBox('Notes from the meeting (seen by both of you)', notes, function (v) { notes = v; }, !can, 3);
    var children = [
      h('div', null, [h('label', { class: 'field', for: nid2, text: 'Meeting date' }), dateField(date, function (v) { date = v; }, 'Meeting date', { id: nid2 })])];
    if (can) {
      children.push(h('div', null, [h('div', { class: 'field', text: 'Agreed arrangements' }), box]));
      children.push(notesBox);
      children.push(h('div', null, [h('label', { class: 'field', for: nid1, text: 'Next review date' }), dateField(next, function (v) { next = v; }, 'Next review date', { id: nid1 }),
        h('div', { class: 'small muted', style: 'margin-top:3px', text: 'Once a year by default – bring it forward if you feel one is needed sooner. You\'re emailed a week before it is due.' })]));
    }
    children.push(h('div', { class: 'btn-row' }, [h('button', { class: 'btn', type: 'button', text: can ? 'Save' : 'Save meeting date', onclick: function () { saveAll(false); } }),
      st === 'Submitted' ? h('button', { class: 'btn primary', type: 'button', text: 'Complete', onclick: function () {
        confirmBox('Complete this wellbeing assessment?', w.tech + ' will be emailed that the agreed record is ready to view. You can still update arrangements later (e.g. at the review).', 'Complete', function () { saveAll(true); });
      } }) : null]));
    if (can) { children.push(h('div', { class: 'small muted', text: 'Everything here is visible to ' + w.tech + ' as soon as you save.' })); }
    return h('section', { class: 'card side-tile wbpanel' }, [h('h3', { text: 'Your part' })].concat([h('div', { class: 'stack', style: 'gap:12px' }, children)]));
  }
  // printable record (same layout as the paper form, with signature lines)
  function wbDoc(w) {
    function rt(headers, rows) {
      return h('table', { class: 'rt' }, [h('thead', null, h('tr', null, headers.map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, rows.map(function (cells) { return h('tr', null, cells.map(function (c) { return h('td', null, c === null || c === undefined || c === '' ? '—' : c); })); }))]);
    }
    var p = w.personal;
    return h('div', { class: 'report-doc' }, [
      h('div', { class: 'small muted', text: L.app + ' · Wellbeing assessment · CONFIDENTIAL' }),
      h('h1', { text: 'Wellbeing Assessment' }),
      h('div', { class: 'rmeta' }, [
        h('div', null, [h('span', { text: 'Employee name' }), h('b', { text: w.tech })]), h('div', null, [h('span', { text: 'Assessment date' }), h('b', { text: w.date ? fmtDate(w.date) : '' })]),
        h('div', null, [h('span', { text: 'Position' }), h('b', { text: w.position })]), h('div', null, [h('span', { text: 'Review date' }), h('b', { text: w.nextReview ? fmtDate(w.nextReview) : '' })]),
        h('div', null, [h('span', { text: 'Employee number' }), h('b', { text: w.empNo })]), h('div', null, [h('span', { text: 'Line manager' }), h('b', { text: IS_TL ? ME : '' })])]),
      h('p', { class: 'small', text: WB_STRESS })
    ].concat(WB_SECTIONS.map(function (sec) {
      return h('section', { class: 'rsec' }, [h('h2', { text: sec.title }), rt(['Question', 'Applicable?', 'An issue?', 'Actions / adjustments that would help'], sec.q.map(function (q) {
        var a = w.answers[q[0]]; return [q[1], wbYna(a.app), wbYna(a.issue), a.help]; }))]);
    })).concat([
      h('section', { class: 'rsec' }, [h('h2', { text: 'Personal input' }), rt(['', ''], [['My circumstances – things that may affect me at work', p.circ]]
        .concat(p.circ === 'Yes' ? WB_PERSONAL.map(function (f) { return [f[1], p[f[0]]]; }) : []).concat(WB_MORE.map(function (f) { return [f[1], p[f[0]]]; })))]),
      h('section', { class: 'rsec' }, [h('h2', { text: 'My arrangements – adjustments agreed with my manager' }), rt(['Arrangement', 'Review date', 'Effective?', 'If not, new arrangement'],
        w.arrangements.length ? w.arrangements.map(function (a) { return [a.text, a.review ? fmtDate(a.review) : '', a.effective, a.next]; }) : [['', '', '', '']]),
        w.notes ? h('p', null, [h('b', { text: 'Notes: ' }), w.notes]) : null]),
      h('section', { class: 'rsec' }, [h('h2', { text: 'Support available' })].concat(WB_SUPPORT.map(function (t) { return h('p', { class: 'small', text: t }); }))),
      h('div', { class: 'sigs' }, [h('div', null, [h('div', { class: 'sigline' }), 'Employee signature', h('div', { class: 'sigline' }), 'Date']),
        h('div', null, [h('div', { class: 'sigline' }), L.mgr + ' / Manager signature', h('div', { class: 'sigline' }), 'Date'])]),
      h('div', { class: 'note', text: 'Confidential – shared only between the employee and their line manager. Further assistance: Occupational Health or Human Resources.' })
    ]));
  }
  function printWb(w) {
    var win = window.open('', '_blank');
    if (!win) { toast('Your browser blocked the print window – allow pop-ups for this site and try again.', true); return; }
    var d = win.document;
    d.title = 'Wellbeing assessment – ' + w.tech;
    var style = d.createElement('style'); style.textContent = REPORT_CSS + '\n.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px;font-size:12px;color:#5b6774}.sigline{border-bottom:1px solid #16222c;height:34px;margin-bottom:4px}';
    d.head.appendChild(style);
    d.body.appendChild(d.importNode(wbDoc(w), true));
    win.focus();
    setTimeout(function () { try { win.print(); } catch (_) { /* user can print manually */ } }, 400);
  }

  // ---------------------------------------------------------------------------------------------
  // LINE MANAGER SETTINGS – Team (members, appraisal dates), Reminders, Names, Bands. Line manager only.
  // Adding or deactivating a person is saved straight away; the other tabs are saved with "Save settings".
  // The page never changes permissions: Flow 4 adds/removes people in the 1-to-1 group from the
  // Technicians list.
  // ---------------------------------------------------------------------------------------------
  async function searchPeople(q) {
    var res = await req('POST', '/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.clientPeoplePickerSearchUser',
      { queryParams: { AllowEmailAddresses: false, AllowMultipleEntities: false, AllUrlZones: false, MaximumEntitySuggestions: 8, PrincipalSource: 15, PrincipalType: 1, QueryString: q } },
      { 'X-RequestDigest': await digest() });
    if (!res.ok) { throw new Error('People search failed ' + errText(res)); }
    var raw = res.json ? (res.json.value !== undefined ? res.json.value : (res.json.d && res.json.d.ClientPeoplePickerSearchUser)) : '';
    var arr = typeof raw === 'string' ? safeJson(raw, []) : raw;
    return (Array.isArray(arr) ? arr : []).filter(function (e) { return e && e.Key && e.EntityData && e.EntityData.Email; }).map(function (e) {
      return { claims: str(e.Key), name: str(e.DisplayText), email: str(e.EntityData.Email).toLowerCase(), job: str(e.EntityData.Title) };
    }).filter(function (p) { return p.email !== MY_EMAIL; });
  }
  function memberNames() { return Object.keys(TECH_INFO).filter(function (t) { return TECH_INFO[t].itemId; }).sort(); }
  function openSettings(tab) {
    var cur = tab || 'team';
    var dates = {}, bands = SETTINGS.bands.map(function (b) { return { max: b.max, name: b.name, cls: b.cls }; });
    var rem = SETTINGS.reminders.slice(), labels = { app: L.app, mgr: L.mgr, one: L.one, many: L.many };
    var teamChanged = false;
    memberNames().forEach(function (t) { dates[t] = apDateOf(t); });
    var back = h('div', { class: 'modal-back' });
    var body = h('div', { class: 'settings-body' });
    var tabsBar = h('div', { class: 'stabs', role: 'tablist' });
    var TABS = [['team', '👥 Team'], ['reminders', '🔔 Reminders'], ['names', '🏷 Names'], ['bands', '📊 Appraisal bands']];
    function drawTabs() {
      tabsBar.textContent = '';
      TABS.forEach(function (t) {
        tabsBar.appendChild(h('button', { type: 'button', role: 'tab', class: 'stab', 'aria-selected': cur === t[0] ? 'true' : 'false', text: t[1], onclick: function () { cur = t[0]; draw(); } }));
      });
    }
    function unsaved() {
      return memberNames().some(function (t) { return (dates[t] || '') !== (apDateOf(t) || ''); }) || badDates(back) ||
        JSON.stringify(bands.map(function (b) { return [b.max, b.name]; })) !== JSON.stringify(SETTINGS.bands.map(function (b) { return [b.max, b.name]; })) ||
        rem.join(',') !== SETTINGS.reminders.join(',') || ['app', 'mgr', 'one', 'many'].some(function (k) { return labels[k] !== L[k]; });
    }
    function close() {
      if (unsaved() && !window.confirm('Close Settings without saving your changes?')) { return; }
      back.remove(); if (teamChanged) { render(false); }
    }
    // ---- Team
    function teamTab() {
      var out = [];
      out.push(h('p', { class: 'small muted', style: 'margin:0 0 10px', text: 'Everyone in this list gets a monthly 1-to-1 while Active. Adding someone gives them access to the 1-to-1 page within about 5 minutes; their first review is created at 07:00 the next morning (or run Flow 1 now). Deactivating stops new reviews and removes their access to the page; their records are kept.' }));
      var names = memberNames();
      out.push(table([L.one, 'Email', 'Status', 'Appraisal date', 'Days to go', 'Period covered', ''], names.map(function (t) {
        var info = TECH_INFO[t];
        var daysTd = h('td'), perTd = h('td', { class: 'small muted' });
        function upd() {
          if (!dates[t]) { apDaysCell(daysTd, ''); perTd.textContent = info.active ? 'Enter a date' : ''; return; }
          var end = dates[t].slice(0, 7);
          apDaysCell(daysTd, dates[t]);
          perTd.textContent = monthLabel(addMonths(end, -11)) + ' – ' + monthLabel(end);
        }
        upd();
        var toggle = h('button', { class: 'btn small ' + (info.active ? 'ghost' : ''), type: 'button', text: info.active ? 'Deactivate' : 'Reactivate', onclick: function () {
          var on = !info.active;
          confirmBox(on ? 'Reactivate ' + t + '?' : 'Deactivate ' + t + '?',
            on ? t + ' gets monthly 1-to-1s again and access to the page within about 5 minutes.'
              : t + ' gets no new monthly reviews and loses access to the 1-to-1 page within about 5 minutes. Their past records are kept.',
            on ? 'Reactivate' : 'Deactivate', function () {
              busy('member', async function () {
                await spUpdate(CONFIG.lists.techs, info.itemId, { Active: on ? '1' : '0' });
                info.active = on; teamChanged = true;
                TECHS = memberNames().filter(function (x) { return TECH_INFO[x].active; });
                toast(on ? t + ' reactivated.' : t + ' deactivated.'); draw();
              }).catch(function () {});
            });
        } });
        return h('tr', { class: info.active ? null : 'retired' }, [h('td', { style: 'font-weight:600', text: t }), h('td', { class: 'small', text: info.email || '—' }),
          h('td', null, h('span', { class: 'chip ' + (info.active ? 'green' : ''), text: info.active ? 'Active' : 'Inactive' })),
          h('td', { style: 'min-width:190px' }, dateField(dates[t], function (v) { dates[t] = v; upd(); }, 'Appraisal date for ' + t, { noDirty: true })), daysTd, perTd, h('td', null, toggle)]);
      }), { empty: 'Nobody yet – add the first person below.' }));
      // add a person
      var q = h('input', { type: 'text', id: 'oto-p-q', placeholder: 'Start typing a name or email…', autocomplete: 'off', 'aria-label': 'Search for a person to add' });
      var results = h('div', { class: 'presults', 'aria-live': 'polite' });
      var timer = null, seq = 0;
      function doSearch() {
        var term = q.value.trim(), my = ++seq;
        results.textContent = '';
        if (term.length < 3) { if (term) { results.appendChild(h('div', { class: 'small muted', text: 'Type at least 3 letters.' })); } return; }
        results.appendChild(h('div', { class: 'small muted', text: 'Searching…' }));
        searchPeople(term).then(function (people) {
          if (my !== seq) { return; }
          results.textContent = '';
          if (!people.length) { results.appendChild(h('div', { class: 'small muted', text: 'No one found. Check the spelling, or try their email address.' })); return; }
          people.forEach(function (p) {
            var existing = memberNames().find(function (t) { return TECH_INFO[t].email === p.email; });
            var action = existing ? (TECH_INFO[existing].active ? h('span', { class: 'chip green', text: 'Already in the team' })
              : h('span', { class: 'chip', text: 'Inactive – use Reactivate above' }))
              : h('button', { class: 'btn small primary', type: 'button', text: '+ Add', onclick: function () { addPerson(p); } });
            results.appendChild(h('div', { class: 'presult' }, [h('div', null, [h('b', { text: p.name }), h('div', { class: 'small muted', text: p.email + (p.job ? ' · ' + p.job : '') })]), action]));
          });
        }).catch(function (e) { if (my === seq) { results.textContent = ''; results.appendChild(h('div', { class: 'small bad', text: String(e && e.message ? e.message : e) })); } });
      }
      q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(doSearch, 350); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); doSearch(); } });
      function addPerson(p) {
        var title = p.name;
        if (TECH_INFO[title] && TECH_INFO[title].email !== p.email) { title = p.name + ' (' + p.email.split('@')[0] + ')'; }
        busy('member', async function () {
          var id = await spCreate(CONFIG.lists.techs, { Title: title, Technician: personValue(p.claims), Active: '1' });
          TECH_INFO[title] = { appraisal: '', itemId: id, email: p.email, claims: p.claims, active: true };
          dates[title] = '';
          TECHS = memberNames().filter(function (x) { return TECH_INFO[x].active; });
          teamChanged = true; q.value = ''; results.textContent = '';
          toast(title + ' added. Access is set up within about 5 minutes; their first review is created at 07:00 tomorrow (or run Flow 1 now).');
          draw();
        }).catch(function () {});
      }
      out.push(h('div', { class: 'addperson' }, [h('label', { class: 'field', for: 'oto-p-q', text: '+ Add a person' }),
        h('div', { style: 'display:flex;gap:8px' }, [q, h('button', { class: 'btn', type: 'button', text: 'Search', onclick: function () { clearTimeout(timer); doSearch(); } })]), results]));
      return out;
    }
    // ---- Reminders
    function remindersTab() {
      var sels = [0, 1, 2].map(function (i) {
        var sel = h('select', { 'aria-label': 'Reminder day ' + (i + 1), style: 'width:120px' }, [h('option', { value: '', text: '—' })].concat(
          Array.from({ length: 28 }, function (_, k) { var o = h('option', { value: String(k + 1), text: ordinal(k + 1) }); o.selected = rem[i] === k + 1; return o; })));
        sel.addEventListener('change', function () {
          rem = sels.map(function (x) { return Number(x.value); }).filter(function (n, j, a) { return n && a.indexOf(n) === j; }).sort(function (x, y) { return x - y; });
          preview.textContent = 'Reminders on the ' + remindersText(rem) + ' of each month.';
        });
        return sel;
      });
      var preview = h('div', { class: 'banner info', style: 'margin-top:12px', text: rem.length ? 'Reminders on the ' + remindersText(rem) + ' of each month.' : 'No reminders will be sent.' });
      return [
        h('p', { style: 'margin:0 0 10px', text: 'How reminders work: Flow 1 runs every morning at 07:00 UK time. On each reminder day it emails everyone whose review for the current month is still not submitted, with a link to their own form. People who have submitted get nothing. Emails come from your mailbox. The deadline is always 23:59 on the last day of the month.' }),
        h('label', { class: 'field', text: 'Reminder days (up to 3, days 1–28)' }),
        h('div', { style: 'display:flex;gap:10px' }, sels), preview
      ];
    }
    // ---- Names
    function namesTab() {
      var d = defaultLabels();
      function field(key, label, help) {
        var id = nid('l'), inp = h('input', { type: 'text', id: id, maxlength: '40', placeholder: d[key] }); inp.value = labels[key];
        inp.addEventListener('input', function () { labels[key] = inp.value; });
        return h('div', null, [h('label', { class: 'field', for: id, text: label }), inp, h('div', { class: 'small muted', style: 'margin-top:3px', text: help })]);
      }
      return [
        h('p', { class: 'small muted', style: 'margin:0 0 10px', text: 'Choose the words shown on screen. This only changes labels – who can see and do what never changes.' }),
        h('div', { class: 'fgrid c2' }, [
          field('app', 'App name', 'Shown at the top of every page and on reports'),
          field('mgr', 'Manager role', 'e.g. Team Leader, Line Manager, Supervisor'),
          field('one', 'Team member role (one person)', 'e.g. Technician, Engineer, Operator'),
          field('many', 'Team member role (more than one)', 'e.g. Technicians, Engineers, Operators')]),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small ghost', type: 'button', text: 'Reset names to defaults', onclick: function () { labels = defaultLabels(); draw(); } }))
      ];
    }
    // ---- Bands
    function bandsTab() {
      var out = [h('p', { class: 'small muted', style: 'margin:0 0 8px', text: ('The average 1–5 score is matched to these bands for every ' + lc(L.one) + '.') })];
      out.push(table(['', 'Band name', 'Applies when the average is'], bands.map(function (b, i) {
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
      out.push(h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn small ghost', type: 'button', text: 'Reset bands to defaults', onclick: function () { bands = defaultBands(); draw(); } })));
      out.push(howWorked());
      return out;
    }
    function draw() {
      drawTabs();
      body.textContent = '';
      (cur === 'team' ? teamTab() : cur === 'reminders' ? remindersTab() : cur === 'names' ? namesTab() : bandsTab()).forEach(function (x) { body.appendChild(x); });
    }
    draw();
    function save() {
      if (badDates(back)) { toast('A date isn\'t recognised – fix the highlighted date first.', true); return; }
      for (var i = 0; i < 3; i++) {
        var lo = i ? bands[i - 1].max : 1;
        if (isNaN(bands[i].max) || bands[i].max <= lo || bands[i].max > 5) { cur = 'bands'; draw(); toast('Band limits must increase and sit between 1 and 5.', true); return; }
      }
      if (bands.some(function (b) { return !b.name.trim(); })) { cur = 'bands'; draw(); toast('Every band needs a name.', true); return; }
      busy('settings', async function () {
        var problems = [];
        var names = memberNames();
        for (var k = 0; k < names.length; k++) {
          var t = names[k], v = dates[t] || '';
          if (v === apDateOf(t)) { continue; }
          try {
            await writeDates(CONFIG.lists.techs, TECH_INFO[t].itemId, { AppraisalDate: v });
            TECH_INFO[t].appraisal = v;
            var cr = currentOf(t);
            if (cr) { await writeDates(CONFIG.lists.reviews, cr.id, { AppraisalDate: v }); cr.appraisalDate = v; }
          } catch (e) { problems.push(t + ': ' + (e && e.message ? e.message : e)); }
        }
        async function saveItem(title, idKey, value) {
          if (SETTINGS[idKey]) { await spUpdate(CONFIG.lists.settings, SETTINGS[idKey], { Value: value }); }
          else { SETTINGS[idKey] = await spCreate(CONFIG.lists.settings, { Title: title, Value: value }); }
        }
        var newBands = bands.map(function (b) { return { max: b.max, name: b.name.trim(), cls: b.cls }; });
        if (JSON.stringify(newBands) !== JSON.stringify(SETTINGS.bands)) {
          await saveItem('Bands', 'itemId', JSON.stringify(newBands.map(function (b, i) { return { name: b.name, max: i === 3 ? null : b.max }; })));
          SETTINGS.bands = newBands;
        }
        // also rewrites a stored value the flow can't read cleanly, even if the days shown are unchanged
        if (JSON.stringify(rem) !== SETTINGS.remindersRaw) { await saveItem('Reminders', 'remindersId', JSON.stringify(rem)); SETTINGS.reminders = rem.slice(); SETTINGS.remindersRaw = JSON.stringify(rem); }
        var newL = parseLabels(JSON.stringify(labels));
        if (JSON.stringify(newL) !== JSON.stringify(L)) { await saveItem('Labels', 'labelsId', JSON.stringify(newL)); L = newL; }
        if (problems.length) { teamChanged = true; throw new Error('Some dates were not saved – ' + problems.join(' | ')); }
        back.remove(); toast('Settings saved.'); render(false);
      }).catch(function () { /* the toast explains; the dialog stays open */ });
    }
    back.appendChild(h('div', { class: 'modal wide settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [h('h2', { style: 'font-size:18px', text: '⚙ Settings' }), h('span', { class: 'chip', text: L.mgr + ' only' })]),
      tabsBar, body,
      h('div', { class: 'btn-row', style: 'justify-content:flex-end;margin-top:16px;border-top:1px solid var(--line);padding-top:14px' }, [
        h('button', { class: 'btn ghost', type: 'button', text: 'Close', onclick: close }),
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
      h('div', { class: 'small muted', text: (L.app + ' · Appraisal evidence report · CONFIDENTIAL') }),
      h('h1', { text: tech }),
      h('div', { class: 'rmeta' }, [
        h('div', null, [h('span', { text: 'Appraisal date' }), h('b', { text: p.set ? fmtDate(p.apDate) : 'Not set' })]),
        h('div', null, [h('span', { text: 'Period covered' }), h('b', { text: monthLabel(addMonths(p.start, 1)) + ' – ' + monthLabel(p.end > CUR ? CUR : p.end) })]),
        h('div', null, [h('span', { text: 'Prepared for' }), h('b', { text: aud === 'tl' ? L.mgr : tech + ' (self)' })]),
        h('div', null, [h('span', { text: 'Generated' }), h('b', { text: fmtDate(TODAY) })]),
        h('div', null, [h('span', { text: 'Monthly reviews submitted' }), h('b', { text: subs.length + ' (' + ot.onTime + ' of ' + ot.total + ' on time)' })]),
        h('div', null, [h('span', { text: 'Agreed actions' }), h('b', { text: acts.length + ' (' + acts.filter(function (x) { return x.ac.status === 'Open'; }).length + ' open)' })])
      ]),
      rsec('1. Summary', [
        h('div', { class: 'rsum' }, [
          h('div', null, [h('span', { text: 'Expected outcome' }), bandChip(o.projected, true)]),
          h('div', null, [h('span', { text: 'Projected at appraisal' }), h('b', { text: f1(o.projected) + ' / 5' })]),
          h('div', null, [h('span', { text: 'Current position' }), h('b', { text: f1(o.current) + ' / 5' })]),
          h('div', null, [h('span', { text: ('Self vs ' + L.mgr) }), h('b', { text: f1(o.selfAvg) + ' vs ' + f1(o.tlAvg) })])
        ]),
        h('div', { class: 'fgrid c2', style: 'margin-top:12px' }, [
          h('div', null, [h('h3', { text: 'Strongest areas' }), h('ul', null, sorted.slice(0, Math.min(2, Math.ceil(sorted.length / 2))).map(function (x) { return h('li', { text: x.e.title + ' (' + x.latest + ' – ' + PROGRESS[x.latest - 1].title + ')' }); }))]),
          h('div', null, [h('h3', { text: 'Areas to focus on' }), h('ul', null, sorted.slice(Math.min(2, Math.ceil(sorted.length / 2))).slice(-2).reverse().map(function (x) { return h('li', { text: x.e.title + ' (' + x.latest + ' – ' + PROGRESS[x.latest - 1].title + ')' }); }))])
        ]),
        h('h3', { text: 'Rating trend' }), trendChart(tech, o, 210)
      ]),
      rsec('2. Appraisal expectations', o.perExp.length ? o.perExp.map(function (x) {
        return h('div', null, [
          h('div', { class: 'exphead' }, [h('h3', { text: x.e.title }), h('span', { class: 'small', text: 'Latest: self ' + (x.latestSelf || '—') + (' · ' + L.mgr + ' ') + (x.latestTl || '—') })]),
          h('div', { class: 'small muted', text: 'Measure: ' + x.e.measures }),
          rtable(['Month', 'Self', L.mgr, (L.one + ' evidence'), (L.mgr + ' feedback')], x.hist.map(function (hh) {
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
        return [monthLabel(r.month), r.state === 'Closed - Not Submitted' ? 'Not submitted' : r.state === 'Open' ? (isOverdue(r) ? 'Overdue' : 'In progress') : (r.late ? 'Submitted late' : 'Submitted'), r.submittedOn ? fmtDate(r.submittedOn) : ''];
      }))]),
      h('div', { class: 'note', text: 'Generated from the monthly 1-to-1 records. Wellbeing answers are deliberately excluded. The expected outcome is a guide only.' })
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
  // FEEDBACK BUBBLE – anyone can report a fault or suggest an improvement. It creates an item in 1-to-1 Feedback;
  // Flow 6 makes it Owners-only and emails it to the line manager. Drawn in place, so it never disturbs the page.
  // ---------------------------------------------------------------------------------------------
  var FBK_TYPES = [['Fault', '🐞 Fault'], ['Improvement', '💡 Improvement'], ['Suggestion', '💬 Suggestion']];
  var FBK_MAX = 2000;
  function feedbackWidget(pageLabel) {
    var wrap = h('div', { class: 'fbk' });
    function draw(focusBox) {
      wrap.textContent = '';
      var bubble = h('button', { class: 'fbk-bubble', type: 'button', 'aria-expanded': FBK.open ? 'true' : 'false', 'aria-controls': 'oto-fbk',
        title: 'Report a fault or suggest an improvement', onclick: function () { FBK.open = !FBK.open; FBK.note = FBK.open ? FBK.note : ''; draw(FBK.open); } },
        [h('span', { 'aria-hidden': 'true', text: '💬' }), h('span', { class: 'fbk-lbl', text: 'Feedback' })]);
      var box = null;
      if (FBK.open) {
        box = h('textarea', { id: 'oto-fbk-text', rows: '5', maxlength: String(FBK_MAX), 'aria-label': 'Your feedback',
          placeholder: 'What went wrong, or what would make this better?' });
        box.value = FBK.text;
        var count = h('span', { class: 'small muted', text: FBK.text.length + ' / ' + FBK_MAX });
        var send = h('button', { class: 'btn primary', type: 'button', text: FBK.busy ? 'Sending…' : 'Send' });
        send.disabled = FBK.busy || !FBK.text.trim();
        box.addEventListener('input', function () {
          FBK.text = box.value; count.textContent = box.value.length + ' / ' + FBK_MAX; send.disabled = FBK.busy || !box.value.trim();
        });
        var types = h('div', { class: 'fbk-types', role: 'radiogroup', 'aria-label': 'Type' }, FBK_TYPES.map(function (t) {
          return h('button', { type: 'button', role: 'radio', 'aria-checked': FBK.type === t[0] ? 'true' : 'false', class: FBK.type === t[0] ? 'on' : '',
            text: t[1], onclick: function () { FBK.type = t[0]; draw(); } });
        }));
        send.addEventListener('click', function () {
          var text = FBK.text.trim();
          if (!text || FBK.busy) { return; }
          FBK.busy = true; FBK.note = ''; draw();
          spCreate(CONFIG.lists.feedback, { Title: text.replace(/\s+/g, ' ').slice(0, 60), FeedbackType: FBK.type, Message: text,
            PageName: pageLabel, AppVersion: VERSION }).then(function () {
            FBK.busy = false; FBK.text = ''; FBK.err = false;
            FBK.note = 'Thank you. Your feedback has been submitted to your ' + L.mgr + '.';
            redrawFeedback(); if (live) { live.textContent = FBK.note; }
          }).catch(function (e) {
            var m = String(e && e.message ? e.message : e);
            FBK.busy = false; FBK.err = true;   // the text stays in the box
            FBK.note = /\((403|404)\)|does not exist/.test(m) ? 'Feedback isn\'t switched on yet – please tell your ' + L.mgr + '.'
              : 'Your feedback couldn\'t be sent – please try again. ' + m;
            redrawFeedback();
          });
        });
        wrap.appendChild(h('section', { class: 'fbk-panel', id: 'oto-fbk', role: 'dialog', 'aria-label': 'Report a fault or suggest an improvement' }, [
          h('h3', { text: 'Report a fault or suggest an improvement' }), types, box,
          h('div', { class: 'fbk-meta' }, [h('span', { class: 'small muted', text: 'Sent to your ' + L.mgr + ' with your name, this page (' + pageLabel + ') and the version.' }), count]),
          FBK.note ? h('div', { class: 'fbk-note' + (FBK.err ? ' bad' : ' good'), role: 'status', text: FBK.note }) : null,
          h('div', { class: 'btn-row' }, [send, h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { closeFeedback(); } })])
        ]));
      }
      wrap.appendChild(bubble);
      // redrawing replaced the button that had focus: move focus now (not later), so Escape still reaches the page
      if (focusBox && box) { try { box.focus(); } catch (_) { /* ignore */ } }
    }
    wrap.redraw = draw;
    draw();
    return wrap;
  }
  // the page may have been redrawn while sending, so redraw whichever bubble is on screen now
  function redrawFeedback() { var w = root && root.querySelector('.fbk'); if (w && w.redraw) { w.redraw(); } }
  function closeFeedback() {
    FBK.open = false; FBK.note = '';
    var w = root && root.querySelector('.fbk');
    if (w && w.redraw) { w.redraw(); var b = w.querySelector('.fbk-bubble'); if (b) { b.focus(); } }
  }
  // Line manager: read feedback that wasn't emailed, and mark it read.
  function openFeedbackItem(f) {
    var back = h('div', { class: 'modal-back' });
    function row(k, v) { return h('tr', null, [h('th', { text: k }), h('td', { text: v })]); }
    var created = f.Created ? new Date(f.Created) : null;
    back.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Feedback' }, [
      h('h3', { text: 'Feedback – ' + (str(f.FeedbackType) || 'Suggestion') }),
      h('table', { class: 'tbl' }, [h('tbody', null, [
        row('From', str(f.Author && f.Author.Title) + (f.Author && f.Author.EMail ? ' (' + str(f.Author.EMail) + ')' : '')),
        row('Sent', created && !isNaN(created) ? fmtDate(localDate(f.Created)) + ' ' + created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timeZone }) : ''),
        row('Page', str(f.PageName) + (f.AppVersion ? ' (version ' + str(f.AppVersion) + ')' : '')),
        row('Email', str(f.DeliveryStatus) === 'Failed' ? 'Could not be delivered' : 'Not sent yet – check ESG 1-to-1 | 6 Feedback is On')])]),
      h('div', { class: 'fbk-msg', text: str(f.Message) }),
      h('div', { class: 'btn-row', style: 'margin-top:14px' }, [
        h('button', { class: 'btn primary', type: 'button', text: 'Mark as read', onclick: function () {
          busy('fb', async function () {
            await spUpdate(CONFIG.lists.feedback, f.ID, { DeliveryStatus: 'Read' });
            FEEDBACK_ISSUES = FEEDBACK_ISSUES.filter(function (x) { return x.ID !== f.ID; });
            back.remove(); toast('Marked as read. It stays in the 1-to-1 Feedback list.'); render(false);
          }).catch(function () {});
        } }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { back.remove(); } })])
    ]));
    root.appendChild(back);
  }

  // ---------------------------------------------------------------------------------------------
  // shell
  // ---------------------------------------------------------------------------------------------
  function render(scrollTop) {
    if (disposed || !root) { return; }
    autosave.clear();
    // toasts and confetti outlive a redraw, so a message shown just before render() (e.g. a save error) stays visible
    var keep = Array.prototype.filter.call(root.children, function (c) { return c.classList.contains('toast') || c.classList.contains('confetti'); });
    root.textContent = '';
    live = h('div', { 'aria-live': 'polite', class: 'sr-only' });
    tipEl = h('div', { class: 'tip', role: 'tooltip' });
    var v = state.view;
    var activeNav = v === 'mgr' ? (state.backTo || 'reviews') : v === 'wb' ? 'wellbeing' : v;
    function navBtn(id, ico, label, onclick, extra, current) {
      var cur = current !== undefined ? current : activeNav === id;
      return h('button', { class: 'nav', type: 'button', 'aria-current': cur ? 'true' : 'false', onclick: onclick || function () { go(id, { reviewId: id === 'tech' ? state.reviewId : null }); } },
        [h('span', { class: 'ico', 'aria-hidden': 'true', text: ico }), h('span', { text: label }), extra || null]);
    }
    var brand = h('div', { class: 'brand' }, [h('h1', { text: L.app }), h('span', { text: IS_TL ? L.mgr : ME + (' · ' + L.one) })]);
    var tabs = [], right = [];
    if (!IS_TL) {
      tabs.push(navBtn('tech', '📝', 'This month'));
      tabs.push(navBtn('myapp', '📈', 'My appraisal'));
      var wbTodo = WELLBEING.filter(function (w) { return wbState(w) === 'Open'; }).length;
      tabs.push(navBtn('wellbeing', '💚', 'Wellbeing', null, wbTodo ? h('span', { class: 'badge', title: 'To complete', text: String(wbTodo) }) : null));
      tabs.push(navBtn('report', '📄', 'Appraisal report', function () { state.report = { tech: ME, aud: 'tech' }; render(false); }, null, false));
    } else {
      var awaiting = TECHS.filter(function (t) { var c = currentOf(t); return c && c.state === 'Submitted'; }).length
        + REVIEWS.filter(function (r) { return r.state === 'Submitted' && r.month !== CUR; }).length;
      var overdueA = actionsOf(function (ac) { return acOverdue(ac); }, 'tl').length;
      tabs.push(navBtn('team', '🏠', 'Team overview'));
      tabs.push(navBtn('reviews', '🗂', 'Monthly reviews', null, awaiting ? h('span', { class: 'badge', title: 'Awaiting your review', text: String(awaiting) }) : null));
      tabs.push(navBtn('expect', '🎯', 'Expectations'));
      tabs.push(navBtn('actions', '✅', 'Actions', null, overdueA ? h('span', { class: 'badge', title: 'Overdue', text: String(overdueA) }) : null));
      var wbWait = WELLBEING.filter(function (w) { return wbState(w) === 'Submitted'; }).length;
      tabs.push(navBtn('wellbeing', '💚', 'Wellbeing', null, wbWait ? h('span', { class: 'badge', title: 'Ready for your review', text: String(wbWait) }) : null));
      var anyCur = false, anyFlag = false;
      var members = TECHS.map(function (t) {
        var o = expectedOutcome(t, 'tl'), r = currentOf(t);
        var needs = r && (r.state === 'Submitted' || isOverdue(r) || followOf(r) === DEDICATED);
        var cur = (v === 'profile' && state.profileTech === t) || (v === 'mgr' && state.backTo === 'profile' && REVIEWS.some(function (x) { return x.id === state.reviewId && x.tech === t; }));
        if (cur) { anyCur = true; }
        if (needs) { anyFlag = true; }
        var b = navBtn('p-' + t, '', t, function () { go('profile', { profileTech: t }); }, needs ? h('span', { class: 'flag', title: 'Needs attention' }) : null, cur);
        b.querySelector('.ico').appendChild(h('i', { class: 'tdot', style: 'background:' + (o.band ? BAND_COL[o.band.cls] : '#9aa4ae') }));
        return tip(b, t + '\nExpected: ' + (o.band ? o.band.name + ' (' + o.projected.toFixed(1) + ')' : '—') + '\n' + monthShort(CUR) + ': ' +
          (!r ? 'no review yet' : r.state === 'Submitted' ? 'awaiting your review' : r.state === 'Open' ? (r.draft ? 'draft' : 'not started') : r.state.toLowerCase()) +
          (r && followOf(r) === DEDICATED ? '\nDedicated 1-to-1 requested' : ''));
      });
      var summary = h('summary', { 'aria-label': 'Team members' }, [h('span', { 'aria-hidden': 'true', text: '👥' }), h('span', { text: 'Team (' + TECHS.length + ')' }),
        anyFlag ? h('span', { class: 'flag', title: 'Someone needs attention' }) : null, h('span', { 'aria-hidden': 'true', text: '▾' })]);
      var menu = h('details', { class: 'teammenu' + (anyCur ? ' cur' : '') + (TECHS.length ? '' : ' empty') }, [summary,
        h('div', { class: 'menu', role: 'menu' }, [h('div', { class: 'mh', text: ('Open a ' + lc(L.one)) })].concat(members.length ? members : [h('p', { class: 'small muted', style: 'padding:6px 10px', text: ('No ' + lc(L.many) + ' yet.') })])
          .concat([h('div', { class: 'menu-sep' }), h('button', { class: 'nav manage', type: 'button', text: '⚙ Manage team…', onclick: function () { closeMenus(); openSettings('team'); } })]))]);
      right.push(menu);
      right.push(navBtn('settings', '⚙', 'Settings', function () { openSettings(); }, null, false));
    }
    var dl = daysBetween(TODAY, lastDay(CUR));
    right.push(h('div', { class: 'status' }, [h('b', { text: monthLabel(CUR) }), h('br'),
      h('span', { text: dl >= 0 ? 'Deadline ' + fmtDate(lastDay(CUR)) + ' · ' + dl + (dl === 1 ? ' day' : ' days') : 'Deadline passed' }), h('br'),
      h('button', { class: 'linkbtn', type: 'button', text: '↻ Refresh', onclick: function () { if (dirty && !window.confirm('Discard unsaved changes and reload?')) { return; } dirty = false; start().catch(loadFailed); } }),
      h('span', { class: 'ver', style: 'margin-left:8px;opacity:.7', text: 'v' + VERSION })]));
    var topbar = h('header', { class: 'topbar' }, [brand, h('nav', { class: 'tabs', 'aria-label': 'Main menu' }, tabs), h('div', { class: 'right' }, right)]);

    var titles = { tech: ['My 1-to-1', 'This month'], myapp: ['', 'My appraisal'], team: ['', 'Team overview'], reviews: ['', 'Monthly reviews'],
      expect: ['', 'Appraisal expectations'], actions: ['', 'Actions'], wellbeing: ['', 'Wellbeing assessments'], wb: ['Wellbeing ›', 'Wellbeing assessment'] };
    var tt = titles[v] || ['', ''];
    if (v === 'profile') { tt = ['Team overview ›', state.profileTech]; }
    if (v === 'mgr') { var rv = REVIEWS.find(function (x) { return x.id === state.reviewId; }); tt = rv ? [(state.backTo === 'profile' ? rv.tech : 'Monthly reviews') + ' ›', rv.tech + ' – ' + monthLabel(rv.month)] : ['', 'Review']; }
    var titlebar = h('div', { class: 'titlebar' }, [h('div', null, [tt[0] ? h('div', { class: 'crumb', text: tt[0] }) : null, h('h1', { text: tt[1] })]),
      h('span', { class: 'small muted', text: 'Today ' + fmtDate(TODAY) })]);
    var main = h('main');
    try {
      main.appendChild(v === 'tech' ? techView() : v === 'myapp' ? profileView(ME, 'tech') : v === 'team' ? teamView() : v === 'reviews' ? reviewsView()
        : v === 'expect' ? expectationsView() : v === 'actions' ? actionsView() : v === 'profile' ? profileView(state.profileTech, 'tl')
        : v === 'wellbeing' ? wellbeingView() : v === 'wb' ? wbView() : managerView());
    } catch (e) {
      main.appendChild(card('Something went wrong', null, [h('p', { text: 'This page could not be shown: ' + (e && e.message ? e.message : e) }), h('p', { class: 'small muted', text: ('Use ↻ Refresh. If it keeps happening, tell your ' + lc(L.mgr) + ' (version ') + VERSION + ').' })]));
      if (window.console) { window.console.error('ESG 1-to-1 render error', e); }
    }
    root.appendChild(h('div', { class: 'shell' }, [topbar, h('div', { class: 'content' }, [titlebar, main])]));
    if (!state.report) { root.appendChild(feedbackWidget(tt[1] || v)); }
    if (state.report) { root.appendChild(reportView(state.report.tech, state.report.aud)); }
    root.appendChild(live);
    root.appendChild(tipEl);
    keep.forEach(function (c) { root.appendChild(c); });
    if (busyCount > 0) { renderBusy(); }
    if (scrollTop && root.scrollIntoView) { try { root.scrollIntoView({ block: 'start' }); } catch (_) { /* ignore */ } }
  }
  function message(title, text) {
    if (!root) { return; }
    root.textContent = '';
    root.appendChild(h('div', { class: 'card', style: 'margin:24px;max-width:720px' }, [h('h2', { style: 'font-size:17px;margin-bottom:8px', text: title }), h('p', { text: text })]));
  }
  function loadFailed(error) {
    message('The 1-to-1 could not load', String(error && error.message ? error.message : error) + ' — try refreshing the page. If it keeps happening, tell your ' + lc(L.mgr) + '.');
    if (window.console) { window.console.error('ESG 1-to-1 load error', error); }
  }
  function findRoot() { return document.querySelector('[data-oto-root]'); }
  function queryParam(name) {
    try { return new URL(window.location.href).searchParams.get(name); } catch (_) { return null; }
  }

  async function start() {
    message(L.app, 'Loading your 1-to-1…');
    TODAY = localDate(new Date().toISOString());
    CUR = TODAY.slice(0, 7);
    CUR_YEAR = appraisalYearOf(TODAY);
    await load();
    var rid = Number(queryParam('reviewId'));
    var hasRid = Number.isInteger(rid) && rid > 0;
    var wid = Number(queryParam('wbId'));
    if (!state.view && Number.isInteger(wid) && wid > 0) { state.view = 'wb'; state.wbId = wid; }
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
    root.addEventListener('click', closeMenus);
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      closeMenus(e);
      // Escape closes the top dialog through its own Cancel/Close button (so unsaved-change prompts still apply)
      var dlg = root.querySelectorAll('.modal-back'), top = dlg[dlg.length - 1];
      if (top) {
        var btn = Array.prototype.filter.call(top.querySelectorAll('button'), function (b) { return /^(Cancel|Close)$/.test(b.textContent.trim()); }).pop();
        if (btn) { e.preventDefault(); btn.click(); }
      } else if (FBK.open) { e.preventDefault(); closeFeedback(); }
    });
    // Return focus to whatever opened a dialog once it closes.
    if (window.MutationObserver) {
      var opener = null;
      new window.MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.classList && n.classList.contains('modal-back')) { opener = document.activeElement; } });
          Array.prototype.forEach.call(m.removedNodes, function (n) {
            if (n.classList && n.classList.contains('modal-back') && opener && opener.isConnected && !root.querySelector('.modal-back')) { try { opener.focus(); } catch (_) { /* ignore */ } opener = null; }
          });
        });
      }).observe(root, { childList: true });
    }
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
        init().catch(loadFailed);
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
