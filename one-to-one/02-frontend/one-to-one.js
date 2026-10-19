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

  var VERSION = '5.1.0';

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
      feedback: '1-to-1 Feedback',
      amendments: '1-to-1 Amendments',
      actions: '1-to-1 Actions',              // 1.5 action tracker
      actionUpdates: '1-to-1 Action Updates',
      actionNotices: '1-to-1 Action Notices'
    },
    updatesUrl: 'OneToOneActionUpdates',     // web address of 1-to-1 Action Updates (each technician's folder is inside it)
    timeZone: 'Europe/London'      // must match the site's regional settings
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
    actOwner: '', actDue: '', actNeed: '', actFocus: null, expYear: '', showRetired: false, expEdit: null, report: null, amend: null };
  var V14 = false, AMENDMENTS = [];   // solution 1.4 columns / lists present (false until Setup 1.4 has run)
  // solution 1.5 action tracker (V15 once Setup 1.5 has written its start date). ACTIONS: tracked actions the viewer can read;
  // MY_UPDATES: a technician's own updates; UPD_OPEN / NOTICES: updates not yet recorded and emails not sent (Team Leader).
  var V15 = false, MR_V15 = false, TRACKER_START = '', MY_ID = 0, ACTIONS = [], MY_UPDATES = [], UPD_OPEN = [], NOTICES = [];
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
  // Reads with the 1.4 columns, or without them if SharePoint says a column doesn't exist yet (Setup 1.4 not run)
  async function getAllMaybe(list, select, extra, expand, release) {
    if (!extra) { return spGetAll(list, select, expand); }
    try { return await spGetAll(list, select + extra, expand); } catch (e) {
      console.warn('ESG 1-to-1: newer columns not found on ' + list + ' – run 0 Setup (' + (release || '1.4') + ') again.', e);
      if (release === '1.5') { MR_V15 = false; } else { V14 = false; }
      return spGetAll(list, select, expand);
    }
  }
  // opts.meta: also return each item's etag ('odata.etag'); opts.filter: an OData $filter
  async function spGetAll(list, select, expand, opts) {
    opts = opts || {};
    var path = listPath(list) + '/items?$select=' + select + (expand ? '&$expand=' + expand : '') + (opts.filter ? '&$filter=' + encodeURIComponent(opts.filter) : '') + '&$top=5000';
    var rows = [];
    for (var guard = 0; guard < 20 && path; guard++) {
      var res = await req('GET', path, undefined, opts.meta ? { 'Accept': 'application/json;odata=minimalmetadata' } : null);
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
  // The ONLY create function. Line manager: expectations, settings, team members, wellbeing assessments, actions.
  // Everyone: feedback from the bubble (1-to-1 Feedback list, own items only until Flow 6 locks them).
  // Technician: an action update, into their own folder of 1-to-1 Action Updates (the only place SharePoint lets them add one).
  async function spCreate(list, fields, folder) {
    if (!folder && !rootFolders[list]) {
      var rf = await req('GET', listPath(list) + '/RootFolder?$select=ServerRelativeUrl');
      if (!rf.ok || !rf.json) { throw new Error('Could not open ' + list + ' ' + errText(rf)); }
      rootFolders[list] = rf.json.ServerRelativeUrl;
    }
    var res = await req('POST', listPath(list) + '/AddValidateUpdateItemUsingPath',
      { listItemCreateInfo: { FolderPath: { DecodedUrl: folder || rootFolders[list] }, UnderlyingObjectType: 0 }, formValues: formValues(fields), bNewDocumentUpdate: false },
      { 'X-RequestDigest': await digest() });
    if (res.status === 401 || res.status === 403 || res.status === 404) { throw new Error('SharePoint refused it (' + res.status + ') – Access denied.'); }
    if (!res.ok) { throw new Error('Create failed ' + errText(res)); }
    checkFieldErrors(res, 'Create');
    var idRow = ((res.json && res.json.value) || []).find(function (f) { return f.FieldName === 'Id'; });
    return idRow ? Number(idRow.FieldValue) : 0;
  }
  // The ONLY delete: the Team Leader removing a retired expectation. It goes to the site recycle bin (restorable for about
  // 93 days). Technicians can't delete anything – their permission levels have no Delete – so SharePoint refuses it for them.
  async function spRecycle(list, id) {
    if (!IS_TL) { throw new Error('Only the ' + L.mgr + ' can delete.'); }
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) { throw new Error('Invalid item'); }
    var res = await req('POST', listPath(list) + '/items(' + Number(id) + ')/recycle()', null, { 'X-RequestDigest': await digest() });
    if (res.status === 401 || res.status === 403) { throw new Error('SharePoint refused the delete.'); }
    if (!res.ok) { throw new Error('Delete failed ' + errText(res)); }
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
  var FB_FIELDS = 'ID,Title,FeedbackType,Message,PageName,AppVersion,DeliveryStatus,SentOn,Created,HasUniqueRoleAssignments,Author/Title,Author/EMail';
  var REV_FIELDS = 'ID,Title,MonthKey,DueDate,ReviewStatus,Q1WentWell,Q2Issue,Q2Impact,Q2Tried,Q2Support,Q3WorkloadRating,Q3WorkloadComment,' +
    'Q4WellbeingRaise,Q4WellbeingDetail,Q5PlanningRaise,Q5PlanningDetail,Q6DevRaise,Q6DevWhat,Q6DevWhy,Q7ManagerFeedback,ExpectationsJson,Q9FollowUp,' +
    'Mood,WinOfMonth,AppraisalDate,Technician/Id,Technician/Title,Technician/EMail';
  // Columns added in solution 1.4. Read only when they exist, so the page still loads if it is uploaded before Setup 1.4 runs.
  var REV_V14_FIELDS = ',AppraisalBoundaries';
  var TECH_FIELDS = 'ID,Title,Active,AppraisalDate,TechnicianAadId,Technician/Id,Technician/Title,Technician/EMail,Technician/Name';
  var TECH_V14_FIELDS = ',NextWellbeingDate,AppraisalCycleStart,AppraisalHistoryJson,AppraisalBoundaries';
  // Amendments audit (Owners only): who and when come from SharePoint's own Author / Created
  var AM_FIELDS = 'ID,Title,ReviewItemId,ManagerReviewId,MonthKey,Reason,ChangedFields,ChangesJson,NotifyStatus,NotifiedOn,NotifyError,Created,Modified,' +
    'Author/Title,Technician/Title,Technician/EMail';
  // 1.5 action tracker. Actions: TL + Flow 9 / 10 write; a technician reads only their own (Flow 9 shares each item).
  var MR_V15_FIELDS = ',ActionsSyncedOn';
  var ACT_FIELDS = 'ID,Title,ActionKey,Owner,Criteria,OriginReviewId,OriginMgrId,OriginMonth,OriginalDue,CurrentDue,Status,WaitingReason,WaitingUntil,' +
    'LatestProgress,LastUpdateOn,LastUpdateBy,ClosedOn,DecisionNote,HistoryJson,SharedWith,Modified,Technician/Id,Technician/Title,Technician/EMail';
  // Action Updates: what a technician sent (their own folder only); Flow 10 records it on the action
  var UPD_FIELDS = 'ID,Title,ActionId,Kind,Outcome,Message,WaitingUntil,ClientKey,ProcessState,ProcessNote,Created,FileDirRef,FSObjType';
  var NOTICE_FIELDS = 'ID,Title,NoticeKey,Kind,ActionId,Status,Attempts,LastError,SentOn,Created,Modified';

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
      releasedOn: mr && mr.ReleasedOn ? new Date(mr.ReleasedOn).toISOString() : '', syncedOn: str(mr && mr.ActionsSyncedOn),
      appraisalDate: localDate(rv.AppraisalDate),
      boundaries: parseBoundaries(rv.AppraisalBoundaries),
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
        // ownerRole (5.1) says who owns it whatever the names are; earlier entries: the technician's name, else the Team Leader
        var role = str(a.ownerRole) === 'tl' || str(a.ownerRole) === 'tech' ? str(a.ownerRole) : (str(a.owner) === techName ? 'tech' : 'tl');
        return { id: str(a.id) || String(Math.random()).slice(2, 10), text: str(a.text), owner: str(a.owner), ownerRole: role, criteria: str(a.criteria),
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
    ME = str(me.json.Title); MY_EMAIL = str(me.json.Email).toLowerCase(); MY_ID = Number(me.json.Id) || 0;
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
    // Setup 1.5 writes the tracker's start once: only reviews released after it have their actions tracked
    var startRow = srow('ActionsTrackerStart'), startAt = startRow ? new Date(str(startRow.Value)) : null;
    TRACKER_START = startAt && !isNaN(startAt.getTime()) ? startAt.toISOString() : '';
    V15 = !!TRACKER_START && (!IS_TL || (await req('GET', listPath(CONFIG.lists.actions) + '/items?$select=Id&$top=1')).ok);
    MR_V15 = V15 && IS_TL;
    ACTIONS = []; MY_UPDATES = []; UPD_OPEN = []; NOTICES = [];

    V14 = IS_TL && (await req('GET', listPath(CONFIG.lists.amendments) + '/items?$select=Id&$top=1')).ok;
    var revs = await getAllMaybe(CONFIG.lists.reviews, REV_FIELDS, REV_V14_FIELDS, 'Technician');
    var mrs = await getAllMaybe(CONFIG.lists.mgr, MR_FIELDS, MR_V15 ? MR_V15_FIELDS : '', 'Technician', '1.5');
    var mrByItem = {};
    mrs.forEach(function (m) { if (m.ReviewItemId) { mrByItem[Number(m.ReviewItemId)] = m; } });

    REVIEWS = []; TECHS = []; TECH_INFO = {}; MASTER_EXPECTATIONS = []; FEEDBACK_ISSUES = [];
    if (IS_TL) {
      var techs = await getAllMaybe(CONFIG.lists.techs, TECH_FIELDS, V14 ? TECH_V14_FIELDS : '', 'Technician');
      var byEmail = {};
      techs.forEach(function (t) {
        var name = str(t.Title) || str(t.Technician && t.Technician.Title);
        var email = str(t.Technician && t.Technician.EMail).toLowerCase();
        // two people with the same name are kept apart (everything on the page is keyed by this name)
        if (TECH_INFO[name] && TECH_INFO[name].email !== email) { name = name + ' (' + (email || ('item ' + t.ID)) + ')'; }
        TECH_INFO[name] = { appraisal: localDate(t.AppraisalDate), itemId: t.ID, email: email, claims: str(t.Technician && t.Technician.Name), active: !!t.Active,
          nextWellbeing: localDate(t.NextWellbeingDate), cycleStart: localDate(t.AppraisalCycleStart), history: parseHistory(t.AppraisalHistoryJson) };
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
      // Feedback the line manager hasn't had by email. Only items Flow 6 has handled (locked, so the sender can no longer
      // change them) are trusted to say Failed or Held; anything not locked an hour after it was sent means Flow 6 is off.
      FEEDBACK_ISSUES = [];
      var heldBy = {};
      (await spGetAll(CONFIG.lists.feedback, FB_FIELDS, 'Author')).forEach(function (f) {
        var st = str(f.DeliveryStatus), locked = f.HasUniqueRoleAssignments === true, age = Date.now() - new Date(f.Created).getTime();
        if (locked && st === 'Failed') { FEEDBACK_ISSUES.push({ kind: 'failed', items: [f] }); }
        else if (locked && st === 'Held') {
          var k = str(f.Author && f.Author.EMail).toLowerCase() || 'unknown';
          if (!heldBy[k]) { heldBy[k] = { kind: 'held', items: [] }; FEEDBACK_ISSUES.push(heldBy[k]); }
          heldBy[k].items.push(f);
        } else if (!locked && age > 3600000) { FEEDBACK_ISSUES.push({ kind: 'pending', items: [f] }); }
      });
      AMENDMENTS = V14 ? (await spGetAll(CONFIG.lists.amendments, AM_FIELDS, 'Author,Technician')).map(buildAmendment) : [];
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
      if (V15) { await loadTracker(byEmail); }
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
      TECH_INFO[ME] = { appraisal: latest ? latest.appraisalDate : '', boundaries: latest ? latest.boundaries : [] };
      WB_AVAILABLE = true;
      WELLBEING = (await spGetAll(CONFIG.lists.wellbeing, WB_FIELDS, 'Technician')).filter(isMine).map(function (w) { return buildWb(w, ME); });
      if (dropped) { console.warn('ESG 1-to-1: ' + dropped + ' record(s) not belonging to you were readable and have been hidden. Tell the site owner.'); }
      if (V15) { await loadTracker({}); }
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
  // ---- appraisal periods. A period runs from the date the previous appraisal was actually completed (or a baseline the
  // Team Leader sets) to the next completion – any length, never an assumed 12 months. A monthly 1-to-1 belongs to the
  // period by its own month: after the start's month, up to and including the completion's month. The next *due* date only
  // moves the projection's end point; it never changes which period a review is in.
  function isoDay(v) { var d = localDate(v); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; }
  function uniqSorted(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }).sort(); }
  function parseHistory(raw) {
    return jsonList(raw).map(function (x) { return { start: isoDay(x.start), completed: isoDay(x.completed), nextDue: isoDay(x.nextDue), prevDue: isoDay(x.prevDue), recordedOn: str(x.recordedOn) }; })
      .filter(function (x) { return x.completed; }).sort(function (x, y) { return x.completed < y.completed ? -1 : 1; });
  }
  function parseBoundaries(raw) { var v = safeJson(raw, []); return Array.isArray(v) ? uniqSorted(v.map(function (x) { return isoDay(x); })) : []; }
  function boundariesOf(tech) {
    var t = TECH_INFO[tech] || {};
    if (!IS_TL) { return t.boundaries || []; }   // the technician's copy (the Team Leader never relies on it)
    var b = [], hist = t.history || [];
    if (hist.length && hist[0].start) { b.push(hist[0].start); }
    hist.forEach(function (x) { b.push(x.completed); });
    if (t.cycleStart) { b.push(t.cycleStart); }
    return uniqSorted(b);
  }
  function periodsOf(tech) {
    var b = boundariesOf(tech), ap = apDateOf(tech), out = [], all = reviewsOf(tech);
    // reviews from before the first recorded start (no baseline was set then) are kept together, never dropped
    if (b.length && all.length && all[0].month <= b[0].slice(0, 7)) {
      out.push({ idx: 0, startDate: '', endDate: b[0], start: addMonths(all[0].month, -1), end: b[0].slice(0, 7), apDate: b[0], set: true, closed: true, noBaseline: true });
    }
    for (var i = 0; i + 1 < b.length; i++) {
      out.push({ idx: out.length, startDate: b[i], endDate: b[i + 1], start: b[i].slice(0, 7), end: b[i + 1].slice(0, 7), apDate: b[i + 1], set: true, closed: true });
    }
    var first = all[0];
    var start = b.length ? b[b.length - 1].slice(0, 7) : addMonths(first ? first.month : CUR, -1);
    out.push({ idx: out.length, startDate: b.length ? b[b.length - 1] : '', endDate: '', start: start, end: ap ? ap.slice(0, 7) : '', apDate: ap, set: !!ap,
      closed: false, noBaseline: !b.length });
    return out;
  }
  // the current period, or one picked on the profile / report
  function periodFor(tech, idx) {
    var ps = periodsOf(tech);
    return (idx !== undefined && idx !== null && ps[idx]) || ps[ps.length - 1];
  }
  function inPeriod(p, month) { return month > p.start && (!p.closed || month <= p.end); }
  function periodReviews(tech, p) { p = p || periodFor(tech); return reviewsOf(tech).filter(function (r) { return inPeriod(p, r.month); }); }
  // calendar months the period has run so far (or in total, once closed)
  function periodMonths(p) { var last = p.closed ? p.end : CUR; return Math.max(0, monthDiff(p.start, last)); }
  // A missed month (closed without a submission, or now overdue) is never a score and never in a denominator.
  function isMissed(r) { return r.state === 'Closed - Not Submitted' || isOverdue(r); }
  function isRated(r, aud) { return isIn(r) && (selfAvg(r) !== null || (canSeeTl(r, aud) && mgrAvg(r) !== null)); }
  function periodCounts(tech, p, aud) {
    var prs = periodReviews(tech, p);
    return { months: periodMonths(p), rated: prs.filter(function (r) { return isRated(r, aud); }).length, missed: prs.filter(isMissed).length };
  }
  function periodLabel(p) {
    if (p.noBaseline && p.closed) { return 'Up to ' + monthLabel(p.end) + ' (appraisal completed ' + fmtDate(p.endDate) + ')'; }
    if (p.noBaseline) { return 'All reviews so far – no period start set yet'; }
    var from = monthLabel(addMonths(p.start, 1));
    return p.closed ? from + ' – ' + monthLabel(p.end) + ' (appraisal completed ' + fmtDate(p.endDate) + ')'
      : from + ' – now' + (p.set ? ' (appraisal due ' + fmtDate(p.apDate) + ')' : ' (next appraisal not set)');
  }
  function countsText(c) { return plural(c.rated, 'rated review') + ' of ' + plural(c.months, 'month') + (c.missed ? ' · ' + c.missed + ' missed' : ''); }
  function latestSnapshot(tech, prs) {
    var rs = prs && prs.some(function (r) { return r.snapshot.length; }) ? prs : reviewsOf(tech);
    for (var i = rs.length - 1; i >= 0; i--) { if (rs[i].snapshot.length) { return rs[i].snapshot; } }
    return [];
  }

  // Expected appraisal outcome (method explained to the Team Leader in Settings)
  function expectedOutcome(tech, aud, p) {
    p = p || periodFor(tech);
    var prs = periodReviews(tech, p);
    var pts = prs.filter(isIn).map(function (r) {
      var self = selfAvg(r), tl = canSeeTl(r, aud) ? mgrAvg(r) : null;
      return { month: r.month, self: self, tl: tl, used: tl !== null ? tl : self };
    }).filter(function (pt) { return pt.used !== null; });
    var perExp = latestSnapshot(tech, prs).map(function (e) {
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
    // projection only towards a known appraisal date in a period with a real start
    if (pts.length >= 3 && p.set && !p.noBaseline) {
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
  // The 3 expectations with the lowest average rating across the appraisal period (the ratings this audience can see),
  // shown as what to work on to reach the next band. null when there is nothing to go on.
  function focusAreas(o) {
    if (!o.band) { return null; }
    var rows = o.perExp.map(function (x, i) {
      var vals = x.hist.map(function (hh) { return hh.tl !== null ? hh.tl : hh.self; }).filter(function (v) { return v; });
      return { e: x.e, i: i, avg: vals.length ? avg(vals) : null };
    }).filter(function (x) { return x.avg !== null; });
    if (!rows.length) { return null; }
    rows.sort(function (x, y) { return x.avg - y.avg || x.i - y.i; });
    var bi = SETTINGS.bands.findIndex(function (b) { return b.cls === o.band.cls; });
    return { band: o.band, next: bi >= 0 ? SETTINGS.bands[bi + 1] || null : null, items: rows.slice(0, 3) };
  }
  function trendWord(o) { return o.pts.length < 3 ? 'Too early to tell' : o.slope > 0.05 ? 'Improving ↗' : o.slope < -0.05 ? 'Dipping ↘' : 'Steady →'; }
  function progressWord(v) { return v ? PROGRESS[clamp(Math.round(v), 1, 5) - 1].title : 'not rated yet'; }
  // Months on time in a row, newest first. A missed month neither extends nor breaks it; a late one breaks it.
  function streakOf(tech) {
    var ms = reviewsOf(tech).reverse(), n = 0;
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].state === 'Open' || isMissed(ms[i])) { continue; }
      if (isIn(ms[i]) && !ms[i].late) { n += 1; } else { break; }
    }
    return n;
  }
  // On time out of the reviews actually submitted in the period – missed months are not in the denominator
  function onTimeOf(tech, p) {
    var prs = periodReviews(tech, p), subs = prs.filter(isIn);
    return { onTime: subs.filter(function (r) { return !r.late; }).length, total: subs.length, missed: prs.filter(isMissed).length };
  }
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
  // Required items still to answer, as keys (q8:<id> per expectation) – used to mark the controls themselves
  function missingKeys(a) {
    var k = [];
    if (!a.q1.trim()) { k.push('q1'); }
    if (!a.q3) { k.push('q3'); }
    [['q4', 'q4d'], ['q5', 'q5d'], ['q6', 'q6what']].forEach(function (p) {
      if (!a[p[0]]) { k.push(p[0]); } else if (a[p[0]] === 'Yes' && !a[p[1]].trim()) { k.push(p[1]); }
    });
    a.q8.forEach(function (x) { if (!x.rating) { k.push('q8:' + x.id); } });
    if (!a.q9) { k.push('q9'); }
    return k;
  }
  var MISSING_LABEL = { q1: 'Q1 What has gone well', q3: 'Q3 Workload', q4: 'Q4 Yes/No', q4d: 'Q4 details', q5: 'Q5 Yes/No', q5d: 'Q5 details',
    q6: 'Q6 Yes/No', q6what: 'Q6 details', q9: 'Q9 Follow-up' };
  function missingItems(a) {
    var m = [];
    missingKeys(a).forEach(function (k) {
      var l = k.indexOf('q8:') === 0 ? 'Q8 a rating for each expectation' : MISSING_LABEL[k];
      if (m.indexOf(l) < 0) { m.push(l); }
    });
    return m;
  }
  // Orange = still to answer; red = Submit was pressed while it was still missing. Clears as soon as it's answered.
  function markRequired(els, keys, showErrors) {
    Object.keys(els).forEach(function (k) {
      var t = els[k], miss = keys.indexOf(k) >= 0;
      t.classList.toggle('need', miss && !showErrors);
      t.classList.toggle('invalid', miss && !!showErrors);
      if (miss && showErrors) { t.setAttribute('aria-invalid', 'true'); } else { t.removeAttribute('aria-invalid'); }
    });
  }
  function focusFirst(els, keys) {
    var t = null;
    for (var i = 0; i < keys.length && !t; i++) { t = els[keys[i]] || null; }
    if (!t) { return false; }
    t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var f = t.matches('textarea, input, button') ? t : t.querySelector('textarea, input:not([type="radio"]), button, input');
    if (f) { try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); } }
    return true;
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
  // Every agreed action keeps its id and who owns it (ownerRole): flow 3 adds it to the tracker as mr<review>-<id> at release
  function actionsSummary(actions) {
    var open = actions.filter(function (a) { return a.status === 'Open'; });
    return { ActionsJson: JSON.stringify(actions.map(function (a) {
      return { id: a.id, text: a.text, owner: a.owner, ownerRole: a.ownerRole === 'tl' ? 'tl' : 'tech', criteria: a.criteria, due: a.due, status: a.status, closedOn: a.closedOn };
    })), ActionsStatus: actions.length ? (open.length ? 'Open' : 'Done') : 'None' };
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
    Array.prototype.forEach.call(root.querySelectorAll('.toast'), function (old) { old.remove(); });   // never stack on top of each other
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
  // A small form dialog. onOk returns an error message (shown, dialog stays open) or a promise; it closes when that resolves.
  function formBox(title, intro, fields, okText, onOk) {
    var back = h('div', { class: 'modal-back' }), err = h('div', { class: 'small bad', role: 'alert' });
    var ok = h('button', { class: 'btn primary', type: 'button', text: okText, onclick: function () {
      err.textContent = '';
      var res = onOk();
      if (typeof res === 'string' && res) { err.textContent = res; return; }
      Promise.resolve(res).then(function () { back.remove(); }, function () { /* the toast explains; stay open */ });
    } });
    back.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('h3', { text: title }), intro ? h('p', { text: intro }) : null, h('div', { class: 'stack', style: 'gap:10px' }, fields), err,
      h('div', { class: 'btn-row', style: 'margin-top:12px' }, [ok, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: function () { back.remove(); } })])
    ]));
    root.appendChild(back);
    return back;
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
    dirty = false; state.amend = null;
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
        show('Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timeZone }));
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
  // Coloured bar following the bands set in Settings, with a marker – no number shown
  var TRACK_COL = { b0: '#f2c2c3', b1: '#f5dc9e', b2: '#bfe2cd', b3: '#bcd6f3' };
  function track(score) {
    var lo = 0, stops = [];
    SETTINGS.bands.forEach(function (b) {
      var hi = (clamp(b.max, 1, 5) - 1) / 4 * 100;
      if (hi > lo || b === SETTINGS.bands[SETTINGS.bands.length - 1]) { hi = Math.max(hi, lo); stops.push(TRACK_COL[b.cls] + ' ' + lo.toFixed(2) + '% ' + (b === SETTINGS.bands[SETTINGS.bands.length - 1] ? 100 : hi).toFixed(2) + '%'); lo = hi; }
    });
    var t = h('div', { class: 'track' }, score === null || score === undefined ? [] : [h('i', { style: 'left:' + ((clamp(score, 1, 5) - 1) / 4 * 100) + '%' })]);
    t.style.background = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
    return t;
  }
  function focusBlock(f, showNums) {
    if (!f) { return null; }
    if (!f.next) { return h('div', { class: 'focus' }, [h('b', { text: showNums ? 'Top band' : 'Keep it up' }), h('div', { class: 'small', text: showNums ? 'Already in the top band.' : "You're in the top band – keep doing what you're doing." })]); }
    return h('div', { class: 'focus' }, [
      h('div', null, ['To move up to ', h('span', { class: 'band ' + f.next.cls, text: f.next.name }), ', focus on:']),
      h('ul', null, f.items.map(function (x) { return h('li', { text: x.e.title + (showNums ? ' (average ' + f1(x.avg) + ')' : '') }); }))
    ]);
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
  function textBox(label, value, onInput, disabled, rows, ariaLabel) {
    var id = nid('t');
    var ta = h('textarea', { id: id, rows: rows || 3, 'aria-label': label ? null : (ariaLabel || null) });
    ta.value = value || ''; ta.disabled = !!disabled;
    ta.addEventListener('input', function () { markDirty(); onInput(ta.value); });
    var w = h('div', null, [label ? h('label', { class: 'field', for: id, text: label }) : null, ta]);
    w.input = ta;   // so a required box can be marked
    return w;
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
    var g = h('div', { class: 'seg' + (wide === true ? ' wide' : wide ? ' ' + wide : ''), role: 'radiogroup' });
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
  function labelled(el, text) { el.setAttribute('aria-label', text); return el; }
  function ynSeg(value, onChange, disabled) { return seg([{ value: 'Yes', text: 'Yes' }, { value: 'No', text: 'No' }], value, onChange, disabled, true); }
  // words: the technician's version – the scale in words only (the 1–5 values stay in the stored data)
  function ratingSeg(value, onChange, disabled, words) {
    if (words) {
      return seg(PROGRESS.map(function (p) { return { value: p.value, text: p.title }; }), value, onChange, disabled, 'words',
        PROGRESS.map(function (p) { return p.desc; }));
    }
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
        h('li', { text: ('The appraisal period runs from the date the ' + lc(L.one) + '\'s previous appraisal was completed (Settings → Team → Mark appraisal completed, or the period start you set) up to their next one – any length. Changing the next appraisal date never moves a review into another period.') }),
        h('li', { text: ('Only months with a submitted review count. A missed month is left out completely – it is not a zero, and it is not counted in averages, trends or the on-time figure.') }),
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
  // words: the technician's version – band names instead of the 1–5 axis, and no numbers in tooltips
  function trendChart(tech, o, height, words) {
    var p = o.period, months = [];
    // every month of the period (any length), through to the appraisal month when it is still ahead
    var last = p.closed ? p.end : (p.end && p.end > CUR ? p.end : CUR);
    for (var k = 1; k <= Math.max(2, monthDiff(p.start, last)); k++) { months.push(addMonths(p.start, k)); }
    var labelEvery = Math.max(1, Math.ceil(months.length / 13));
    var W = 640, H = height || 230, pl = words ? 96 : 30, pr = 14, pt = 10, pb = 24, iw = W - pl - pr, ih = H - pt - pb, n = months.length;
    var x = function (i) { return pl + i * iw / (n - 1); }, y = function (v) { return pt + (5 - v) / 4 * ih; };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Monthly rating trend' });
    var lo = 1;
    SETTINGS.bands.forEach(function (b) {
      var hi = clamp(b.max, 1, 5);
      if (hi > lo) {
        svg.appendChild(s('rect', { x: pl, y: y(hi), width: iw, height: y(lo) - y(hi), fill: BAND_TINT[b.cls] }));
        if (words && y(lo) - y(hi) >= 12) { svg.appendChild(s('text', { x: pl - 8, y: (y(lo) + y(hi)) / 2 + 4, 'text-anchor': 'end', text: b.name })); }
      }
      lo = Math.max(lo, hi);
    });
    [1, 2, 3, 4, 5].forEach(function (v) {
      svg.appendChild(s('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: '#ffffff', 'stroke-width': 1 }));
      if (!words) { svg.appendChild(s('text', { x: pl - 8, y: y(v) + 4, 'text-anchor': 'end', text: String(v) })); }
    });
    months.forEach(function (m, i) {
      if (i % labelEvery && m !== p.end && i !== months.length - 1) { return; }
      var t = s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', text: monthShort(m) + (months.length > 13 ? ' ' + m.slice(2, 4) : '') });
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
        tip(hit, name + ' – ' + monthLabel(pt.month) + '\n' + (words ? bandFor(pt[key]).name : pt[key].toFixed(1) + ' / 5 (' + bandFor(pt[key]).name + ')'));
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
        tip(hit, 'Projected at appraisal (' + fmtDate(p.apDate) + ')\n' + (words ? o.band.name : o.projected.toFixed(1) + ' / 5 – ' + o.band.name));
        svg.appendChild(hit);
        svg.appendChild(s('text', { x: x(ei) - 8, y: y(o.projected) - 10, 'text-anchor': 'end', style: 'fill:#16222c;font-weight:700', text: 'Projected ' + (words ? o.band.name : o.projected.toFixed(1)) }));
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
  function pairBars(perExp, words) {
    if (!perExp.length) { return h('p', { class: 'muted', text: 'No appraisal expectations yet.' }); }
    return h('div', null, [legend([{ color: C_SELF, label: 'Latest self-rating' }, { color: C_TL, label: ('Latest ' + L.mgr + ' rating') }]),
      h('div', { class: 'pairbars' + (words ? ' words' : '') }, perExp.map(function (x) {
        function bar(v, c, who) {
          return [tip(h('div', { class: 'bar' }, v ? h('i', { style: 'width:' + (v / 5 * 100) + '%;background:' + c }) : null), x.e.title + '\n' + who + ': ' + (v ? (words ? '' : v + ' – ') + PROGRESS[v - 1].title : 'not rated yet')),
            h('div', { class: 'v', text: v ? (words ? PROGRESS[v - 1].title : String(v)) : '—' })];
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
    function item(label, text, reply, privateItem) { raised.push({ label: label, text: text, reply: rel ? reply : '', priv: !!privateItem }); }
    if (pa.q2.issue || pa.q2.support) { item('Challenge', pa.q2.issue + (pa.q2.support ? (pa.q2.issue ? ' – ' : '') + 'support needed: ' + pa.q2.support : ''), pf.q2); }
    if (pa.q4 === 'Yes') { item('Wellbeing', pa.q4d || 'You asked to talk about it', pf.q4, true); }
    if (pa.q5 === 'Yes') { item('Planning', pa.q5d || 'Something coming up', pf.q5); }
    if (pa.q6 === 'Yes') { item('Development', pa.q6what || 'Training or development', pf.q6); }
    if (pa.q9 === DEDICATED) { item('1-to-1', 'You asked for a dedicated 1-to-1', pf.q9 || (pf.meeting ? 'Meeting on ' + fmtDate(pf.meeting) : '')); }
    // with the tracker, actions are in their own card below (Outstanding actions)
    var acts = V15 ? [] : actionsOf(function (ac) { return ac.status === 'Open' || (ac.closedOn && ac.closedOn >= prior.month + '-01'); }, 'tech')
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
          if (x.priv) {   // health information: not on screen until they choose to see it
            var hid = h('span', null, [clip(x.text, 140), x.reply ? h('div', { class: 'since-reply' }, [h('b', { text: L.mgr + ': ' }), clip(x.reply, 160)]) : null]);
            hid.hidden = true;
            var showBtn = h('button', { class: 'linkbtn', type: 'button', text: 'show', onclick: function () { hid.hidden = false; showBtn.remove(); } });
            return h('li', null, [h('b', { text: x.label + ': ' }), h('span', { class: 'muted', text: 'you raised a wellbeing point ' }), showBtn, hid]);
          }
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
  // ---- appraisal periods and next-due dates (Team Leader). Every write here is deliberate: dates never move by themselves.
  function boundaryList(t) { return JSON.stringify(boundariesOf(t)); }
  // The boundaries are copied to the person's own reviews so their My appraisal shows the same periods
  async function writeBoundaries(t) {
    var info = TECH_INFO[t], list = boundaryList(t);
    await spUpdate(CONFIG.lists.techs, info.itemId, { AppraisalBoundaries: list });
    var rs = reviewsOf(t);
    for (var i = 0; i < rs.length; i++) {
      // a submission still waiting for Flow 2 is left alone: Flow 2 times the submission from the item's last change
      if (JSON.stringify(rs[i].boundaries) === list || rs[i].processing) { continue; }
      await spUpdate(CONFIG.lists.reviews, rs[i].id, { AppraisalBoundaries: list });
      rs[i].boundaries = JSON.parse(list);
    }
  }
  // The next wellbeing date lives on the person's Team record; the latest completed assessment shows the same date to them
  async function setWellbeingDate(t, v) {
    var info = TECH_INFO[t];
    await writeDates(CONFIG.lists.techs, info.itemId, { NextWellbeingDate: v });
    info.nextWellbeing = v;
    var last = wbLastCompleted(t);
    if (last && (last.nextReview || '') !== v) { await writeDates(CONFIG.lists.wellbeing, last.id, { NextReviewDate: v }); last.nextReview = v; }
  }
  async function recordCompletion(t, completed, nextDue) {
    var info = TECH_INFO[t], hist = (info.history || []).slice(), b = boundariesOf(t);
    var last = hist[hist.length - 1];
    var entry = { start: b.length ? b[b.length - 1] : '', completed: completed, nextDue: nextDue, prevDue: info.appraisal || '', recordedOn: TODAY };
    if (last && last.completed.slice(0, 7) === completed.slice(0, 7)) { entry.start = last.start; entry.prevDue = last.prevDue || ''; hist[hist.length - 1] = entry; }   // a correction
    else { hist.push(entry); }
    await spUpdate(CONFIG.lists.techs, info.itemId, { AppraisalHistoryJson: JSON.stringify(hist) });
    info.history = hist;
    await writeDates(CONFIG.lists.techs, info.itemId, { AppraisalCycleStart: completed, AppraisalDate: nextDue });
    info.cycleStart = completed; info.appraisal = nextDue;
    var cr = currentOf(t);
    if (cr && !cr.processing) { await writeDates(CONFIG.lists.reviews, cr.id, { AppraisalDate: nextDue }); cr.appraisalDate = nextDue; }
    await writeBoundaries(t);
  }
  async function undoCompletion(t) {
    var info = TECH_INFO[t], hist = (info.history || []).slice(), gone = hist.pop();
    if (!gone) { return; }
    var start = hist.length ? hist[hist.length - 1].completed : gone.start;
    await spUpdate(CONFIG.lists.techs, info.itemId, { AppraisalHistoryJson: JSON.stringify(hist) });
    info.history = hist;
    var due = gone.prevDue && info.appraisal === gone.nextDue ? gone.prevDue : info.appraisal;   // only if not changed since
    await writeDates(CONFIG.lists.techs, info.itemId, { AppraisalCycleStart: start || '', AppraisalDate: due || '' });
    info.cycleStart = start || ''; info.appraisal = due || '';
    await writeBoundaries(t);
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
    var reqEls = {}, showErrors = false;
    function req(key, el) { if (editable) { reqEls[key] = el.input || el; } return el; }
    function refresh() {
      if (!editable) { return; }
      markRequired(reqEls, missingKeys(a), showErrors);
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
      if (m.length) {
        showErrors = true; refresh();
        toast('Please complete the questions marked in red: ' + m.join(', '), true);
        if (!focusFirst(reqEls, missingKeys(a))) { missingBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
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
    if (V15 && (editable || r.month === mine[0].month)) { var carry = carryForwardCard(r, 'tech'); if (carry) { cards.push(carry); } }
    cards.push(qCard(1, 'What has gone well for you this month?', null, [
      req('q1', textBox(null, a.q1, function (v) { a.q1 = v; refresh(); }, ro, 3, 'What has gone well for you this month?')), fbBlock(r.fb.q1)]));
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
      req('q3', choiceGroup('Workload rating', WORKLOAD, a.q3, function (v) { a.q3 = v; refresh(); }, ro, 'c5')),
      h('div', { class: 'detail' }, textBox('Comments (optional)', a.q3c, function (v) { a.q3c = v; }, ro, 2)), fbBlock(r.fb.q3)]));
    function ynCard(numb, title, key, detailFn) {
      var detail = h('div', { class: 'detail' }, detailFn());
      detail.hidden = a[key] !== 'Yes';
      var c = qCard(numb, title, req(key, labelled(ynSeg(a[key], function (v) { a[key] = v; detail.hidden = v !== 'Yes'; c.classList.toggle('compact', v === 'No'); refresh(); }, ro), title)),
        [detail, fbBlock(r.fb[key])].filter(Boolean));
      if (a[key] === 'No') { c.classList.add('compact'); }   // answered No: one line
      return c;
    }
    cards.push(ynCard(4, 'Is there anything relating to your wellbeing, workplace support or reasonable adjustments you would like to raise?', 'q4', function () {
      return req('q4d', textBox('What would you like to raise?', a.q4d, function (v) { a.q4d = v; refresh(); }, ro, 3)); }));
    cards.push(ynCard(5, 'Is there anything upcoming that your line manager should be aware of for planning purposes?', 'q5', function () {
      return req('q5d', textBox('Please give details', a.q5d, function (v) { a.q5d = v; refresh(); }, ro, 3)); }));
    cards.push(ynCard(6, 'Do you have any training, development requirements or career aspirations you would like to discuss?', 'q6', function () {
      return h('div', { class: 'fgrid c2' }, [req('q6what', textBox('What would you like?', a.q6what, function (v) { a.q6what = v; refresh(); }, ro, 3)),
        textBox('Why / what would it help with? (optional)', a.q6why, function (v) { a.q6why = v; }, ro, 3)]); }));
    cards.push(qCard(7, 'Do you have any feedback for your line manager?', h('span', { class: 'small muted', text: 'Optional' }), [
      textBox(null, a.q7, function (v) { a.q7 = v; }, ro, 3, 'Feedback for your line manager (optional)'), fbBlock(r.fb.q7)]));

    var expHead = ['Expectation', 'Your rating', 'Evidence / comments'];
    if (r.released) { expHead = expHead.concat([L.mgr]); }
    var expRows = r.snapshot.map(function (e) {
      var ans = a.q8.find(function (x) { return String(x.id) === String(e.id); });
      var lbl = h('div', { class: 'small muted', style: 'margin-top:4px', text: ans.rating ? PROGRESS[ans.rating - 1].desc : 'Not rated yet' });
      var cells = [
        h('td', { class: 'top', style: 'width:30%' }, [h('div', { style: 'font-weight:650', text: e.title }), h('div', { class: 'small muted', text: e.measures })]),
        h('td', { class: 'top', style: 'width:170px' }, [req('q8:' + e.id, labelled(ratingSeg(ans.rating, function (v) { ans.rating = v; lbl.textContent = PROGRESS[v - 1].desc; refresh(); }, ro, true), 'Your rating for ' + e.title)), lbl]),
        h('td', { class: 'top' }, textBox(null, ans.comment, function (v) { ans.comment = v; }, ro, 2, 'Evidence or comments for ' + e.title + ' (optional)'))
      ];
      if (r.released) {
        var tv = r.fb.expRating[e.id];
        cells.push(h('td', { class: 'top', style: 'width:24%' }, [h('div', { style: 'font-weight:650', text: tv ? PROGRESS[tv - 1].title : 'Not rated' }), r.fb.exp[e.id] ? h('div', { class: 'small', text: r.fb.exp[e.id] }) : null]));
      }
      return h('tr', null, cells);
    });
    cards.push(qCard(8, 'Appraisal expectations – how are you progressing?', h('span', { class: 'small muted', text: 'Choose the one that fits best' }), [
      r.snapshot.length ? table(expHead, expRows) : h('p', { class: 'muted', text: 'No appraisal expectations are set for you this month.' })]));
    cards.push(qCard(9, "How would you prefer to follow up on this month's review?", null, [
      req('q9', choiceGroup('Follow-up preference', FOLLOW.map(function (f) { return { value: f, title: f }; }), a.q9, function (v) { a.q9 = v; refresh(); }, ro, 'c3')), fbBlock(r.fb.q9)]));
    if (r.released) {
      cards.push(card('Overall feedback and agreed actions', null, [
        h('div', { class: 'feedback', style: 'margin-top:0' }, [h('b', { text: 'Overall' }), r.fb.overall || '—']),
        h('div', { class: 'feedback' }, [h('b', { text: 'Follow-up' }), followOf(r) || '—']),
        r.fb.meeting ? h('div', { class: 'feedback' }, [h('b', { text: '1-to-1 meeting' }), fmtDate(r.fb.meeting)]) : null,
        h('div', { style: 'margin-top:12px' }, [V15 && r.fb.actions.length ? h('div', { class: 'small muted', style: 'margin-bottom:6px' }, ['Agreed at this meeting. Follow them and send updates in ',
          h('button', { class: 'linkbtn', type: 'button', text: 'My actions', onclick: function () { go('myactions'); } }), '.']) : null,
          actionsTable(r.fb.actions.map(function (ac) { return { ac: ac, r: r }; }), {})])
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
        h('span', { class: 'small muted', text: 'Expected at your appraisal' }), bandChip(o.projected, true)]),
      track(o.projected),
      h('dl', { class: 'kv' }, [h('dt', { text: 'Appraisal date' }), h('dd', { class: p.set && days < 0 ? 'overdue' : null, text: p.set ? fmtDate(p.apDate) + (days < 0 ? ' (overdue)' : ' (' + daysToGo(apStatus(p.apDate)).toLowerCase() + ')') : 'Not set yet' }),
        p.set && days >= 0 ? h('dt', { text: 'Aim to complete' }) : null, p.set && days >= 0 ? h('dd', { text: apStatus(p.apDate).state === 'due' ? 'This month – it\'s due ' + fmtDate(p.apDate) : 'In ' + monthLabel(apStatus(p.apDate).aimMonth) }) : null,
        h('dt', { text: 'Trend' }), h('dd', { text: trendWord(o) })]),
      focusBlock(focusAreas(o), false)
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
      textBox(null, a.win, function (v) { a.win = v; }, !editable, 3, 'Win of the month (optional)')]);
    return [energy, outlook, quick, win];
  }

  // ---------------------------------------------------------------------------------------------
  // PROFILE / MY APPRAISAL (technician sees their own; TL sees any technician)
  // ---------------------------------------------------------------------------------------------
  function profileView(tech, aud) {
    var periods = periodsOf(tech), pIdx = state.periodTech === tech && periods[state.periodIdx] ? state.periodIdx : periods.length - 1;
    var p0 = periods[pIdx], o = expectedOutcome(tech, aud, p0), p = o.period, counts = periodCounts(tech, p, aud);
    var ot = onTimeOf(tech, p), acts = actionsForPeriod(tech, p, aud);
    var periodSel = periods.length > 1 ? h('select', { 'aria-label': 'Appraisal period', style: 'width:auto', onchange: function () {
      state.periodTech = tech; state.periodIdx = Number(periodSel.value); render(false); } }, periods.slice().reverse().map(function (x) {
      var op = h('option', { value: String(x.idx), text: x.closed ? 'Period to ' + fmtDate(x.endDate) : 'Current period' }); op.selected = x.idx === pIdx; return op;
    })) : null;
    var openActs = acts.filter(function (x) { return acOpen(x.ac); });
    var head = h('div', { class: 'pagehead' }, [
      h('div', { class: 'ph-l' }, [
        aud === 'tl' ? h('button', { class: 'btn small ghost', type: 'button', text: '← Team overview', onclick: function () { go('team'); } }) : null,
        h('h2', { text: aud === 'tl' ? tech : 'My appraisal' }),
        periodSel,
        h('span', { class: 'meta', text: periodLabel(p) + ' · ' + countsText(counts) }),
        p.closed ? h('span', { class: 'chip', text: 'Completed period' }) :
          h('span', { class: 'chip ' + (p.set ? 'blue' : 'amber'), text: p.set ? 'Appraisal ' + fmtDate(p.apDate) : 'Appraisal date not set' })
      ]),
      h('button', { class: 'btn primary', type: 'button', text: '📄 Generate appraisal report', onclick: function () { state.report = { tech: tech, aud: aud, period: pIdx }; render(false); } })
    ]);
    var tiles = h('div', { class: 'tiles', style: 'margin-top:14px' }, [
      tile('Expected outcome', [bandChip(o.projected, true)], 'Projected at appraisal'),
      aud === 'tl' ? tile('Projected score', [f1(o.projected), h('small', { text: ' / 5' })], 'Trend ' + (o.slope >= 0 ? '+' : '') + o.slope.toFixed(2) + ' per month')
        : tile('Trend', trendWord(o), o.pts.length ? 'Over ' + plural(o.pts.length, 'month') + ' so far' : 'No months yet'),
      aud === 'tl' ? tile('Current position', [f1(o.current), h('small', { text: ' / 5' })], 'Self ' + f1(o.selfAvg) + (' · ' + L.mgr + ' ') + f1(o.tlAvg))
        : tile('Where you are now', [bandChip(o.current, true)], 'Based on the months so far'),
      (function () {
        if (p.closed) { return tile('Appraisal completed', fmtDate(p.endDate), 'End of this period'); }
        var s = p.set ? apStatus(p.apDate) : null;
        if (!s) { return tile('Days to appraisal', '—', 'Not set'); }
        if (s.state === 'overdue') { return tile('Days to appraisal', 'Overdue', fmtDate(s.ap) + ' · ' + (-s.days) + ' day' + (s.days === -1 ? '' : 's') + ' ago', 'bad'); }
        return tile('Days to appraisal', s.days === 0 ? 'Today' : String(s.days), fmtDate(s.ap) + ' · ' + (s.state === 'due' ? 'due this month' : 'aim for ' + monthName(s.aimMonth)), apSoon(s) ? 'warn' : '');
      })(),
      tile('On-time submissions', ot.total ? [String(ot.onTime), h('small', { text: ' of ' + ot.total })] : '–',
        ot.total ? 'Of those submitted' + (ot.missed ? ' · ' + ot.missed + ' missed' : '') : (ot.missed ? ot.missed + ' missed – none submitted' : 'None submitted yet')),
      tile('Open actions', String(openActs.length), acts.filter(function (x) { return acOverdue(x.ac); }).length + ' overdue' + (V15 ? ' · ' + openActs.filter(function (x) { return x.ac.status === 'Waiting'; }).length + ' waiting' : ''), acts.some(function (x) { return acOverdue(x.ac); }) ? 'bad' : '')
    ]);
    var rows = [h('div', { class: 'grid2' }, [
      card('Rating trend', aud === 'tl' ? 'Monthly score on the 1–5 scale; shading shows the bands' : 'Each month against the bands', [trendChart(tech, o, 300, aud !== 'tl')]),
      card('Expectations – where each one stands', 'Most recent rating in the period', [pairBars(o.perExp, aud !== 'tl'), focusBlock(focusAreas(o), aud === 'tl')])
    ])];
    var prs = periodReviews(tech, p).filter(function (r) { return r.month <= CUR; });
    var wins = prs.filter(function (r) { return r.answers.win; }).slice().reverse();
    rows.push(card('Actions', openActs.length + ' open · ' + (acts.length - openActs.length) + ' closed' + (V15 ? ' in the period' : ''), [actionsTable(acts, { showMonth: true }),
      V15 && aud !== 'tl' ? h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn small', type: 'button', text: 'Update my actions →', onclick: function () { go('myactions'); } })) : null]));
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
    if (V15) { actionAttention().forEach(function (x) { items.push(x); }); }
    else {
      actionsOf(function (ac, r) { return acOverdue(ac) && TECH_INFO[r.tech] && TECH_INFO[r.tech].active; }, 'tl').forEach(function (x) {
        items.push({ pri: 2, ico: '✅', text: 'Overdue action for ' + x.r.tech + ': ' + x.ac.text + ' (due ' + fmtDate(x.ac.due) + ')', btn: 'Actions', fn: function () { go('actions'); } });
      });
    }
    wellbeingAttention().forEach(function (x) { items.push(x); });
    amendmentAttention().forEach(function (x) { items.push(x); });
    FEEDBACK_ISSUES.forEach(function (g) {
      var f = g.items[0], who = str(f.Author && f.Author.Title) || 'someone';
      items.push({ pri: g.kind === 'failed' ? 1 : 2, ico: '💬', btn: 'Read', fn: function () { openFeedbackItem(g); },
        text: g.kind === 'held' ? who + ' sent ' + plural(g.items.length, 'more feedback message') + ' than are emailed in a day (10) – read them here'
          : 'Feedback from ' + who + (g.kind === 'failed' ? ' couldn\'t be emailed' : ' hasn\'t been emailed yet') + ' – read it here' });
    });
    TECHS.forEach(function (t) {
      var ap = apDateOf(t), ti = TECH_INFO[t];
      if (V14 && ti && !ti.cycleStart && !ti.history.length) { items.push({ pri: 3, ico: '📅', text: 'Set the appraisal period start for ' + t + ' (the date their last appraisal was completed)', btn: 'Set start', fn: function () { openSettings('team'); } }); }
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
  function teamView() {
    if (!TECHS.length) {
      var steps = [
        ['Add your team', '⚙ Settings → Team → + Add a person. Search by name or email and click Add – access is set up for you.'],
        ['Set appraisal dates', '⚙ Settings → Team → each person\'s appraisal date (type it or use 📅) → Save settings.'],
        ['Add expectations', 'Expectations → Shared ones for everyone and Individual ones per person. Drag to reorder.'],
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
    var allActs = actionsOf(null, 'tl'), openA = allActs.filter(function (x) { return acOpen(x.ac); });
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
    // Needs your attention takes the full width (the outcome and workload charts were duplicates of the table below)
    var charts = h('div', { style: 'margin-top:14px' }, [attentionCard()]);
    var rows = TECHS.map(function (t) {
      var o = outs[t], r = currentOf(t), ap = apDateOf(t);
      var oa = actionsOf(function (ac, rr) { return rr.tech === t && acOpen(ac); }, 'tl');
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
      h('div', { class: 'nw' }, table([L.one, 'Month', 'Status', 'Submitted', 'Workload', 'Energy', 'Self avg', 'Your avg', 'Follow-up', 'Actions', ''], rows))
    ]);
  }

  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – appraisal expectations
  // ---------------------------------------------------------------------------------------------
  function groupOf(e) { return e.scope === 'Shared' ? 'S' : 'I:' + e.tech; }
  // SortOrder orders items within their own group only (Flow 1 puts every shared item before the individual ones), so any
  // number of either can never collide. Older individual items numbered 1010, 1020 … still sort correctly.
  function nextSort(v) {
    var g = groupOf(v);
    return MASTER_EXPECTATIONS.filter(function (e) { return groupOf(e) === g; }).reduce(function (m, e) { return Math.max(m, e.sort); }, 0) + 10;
  }
  // An expectation's year is the first appraisal year it applies to; it carries on until it is retired (Flow 1 looks back five years)
  function yearBack(y, n) { var a = +y.slice(0, 4) - n; return a + '/' + String(a + 1).slice(2); }
  function appliesIn(e, y) { return !e.year || (e.year <= y && e.year >= yearBack(y, 5)); }
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
      var changes = [];
      list2.forEach(function (e, k) { var ns = 10 * (k + 1); if (e.sort !== ns) { changes.push([e, ns]); } });
      busy('order', async function () {
        for (var c = 0; c < changes.length; c++) { await spUpdate(CONFIG.lists.exp, changes[c][0].id, { SortOrder: String(changes[c][1]) }); changes[c][0].sort = changes[c][1]; }
        toast('Order saved – applies from the next monthly review.'); render(false);
      }).catch(function () { render(false); });
    }
    function activeCount(t, year, scope) {
      return MASTER_EXPECTATIONS.filter(function (e) { return e.active && appliesIn(e, year) && (scope ? e.scope === scope && (scope === 'Shared' || e.tech === t) : (e.scope === 'Shared' || e.tech === t)); }).length;
    }
    var tIn = h('input', { type: 'text', id: 'oto-x-title', maxlength: '255' }); tIn.value = f.title;
    var mIn = h('textarea', { id: 'oto-x-meas', rows: 3 }); mIn.value = f.measures;
    var yIn = h('input', { type: 'text', id: 'oto-x-year', maxlength: '20' }); yIn.value = f.year;
    var scSel = h('select', { id: 'oto-x-scope' }, ['Shared', 'Individual'].map(function (v) { var o = h('option', { value: v, text: v === 'Shared' ? 'Shared (everyone)' : 'Individual' }); o.selected = v === f.scope; return o; }));
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
      // order is set by dragging in the list; a new item (or one moved to another group) goes to the end of its group
      v.sort = editing && groupOf(editing) === groupOf(v) ? editing.sort : nextSort(v);
      if (!v.title || !v.measures || !v.year) { toast('Title, measures and appraisal year are required.', true); return; }
      // the year must be exactly yyyy/yy (e.g. 2026/27): it is compared as text, so anything else would never reach a review
      if (!/^\d{4}\/\d{2}$/.test(v.year) || (Number(v.year.slice(2, 4)) + 1) % 100 !== Number(v.year.slice(5))) {
        toast('Appraisal year must look like ' + CUR_YEAR + ' (April to March).', true); return;
      }
      if (v.scope === 'Individual' && !v.tech) { toast(('Choose the ' + lc(L.one) + ' for an individual expectation.'), true); return; }
      if (v.scope === 'Individual' && !(TECH_INFO[v.tech] && TECH_INFO[v.tech].claims)) { toast(('That ' + lc(L.one) + ' has no account set in the ' + L.many + ' list.'), true); return; }
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
        h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', for: 'oto-x-year', text: 'First appraisal year it applies to' }), yIn]),
          h('div', { class: 'small muted', style: 'align-self:end;padding-bottom:6px', text: 'It carries on into later years until you retire it.' })]),
        h('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center;font-weight:600' }, [acIn, 'Active']),
        h('div', { class: 'btn-row' }, [h('button', { class: 'btn primary', type: 'button', text: editing ? 'Save changes' : 'Add expectation', onclick: saveExp }),
          editing ? h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { state.expEdit = null; render(false); } }) : null])
      ])
    ]);
    var cov = card(('Active expectations per ' + lc(L.one)), 'In ' + state.expYear + ' · no limit', [table([L.one, 'Shared', 'Individual', 'Total'], TECHS.map(function (t) {
      var sh = activeCount(t, state.expYear, 'Shared'), ow = activeCount(t, state.expYear, 'Individual');
      return tr([h('b', { text: t }), String(sh), String(ow), h('b', { text: String(sh + ow) })]);
    }), { empty: 'No ' + lc(L.many) + ' yet.' }),
      MASTER_EXPECTATIONS.some(function (e) { return e.active; }) && TECHS.some(function (t) { return activeCount(t, state.expYear) > 30; })
        ? h('div', { class: 'banner amber', style: 'margin-top:8px', text: 'More than 30 active for someone – that works, but each monthly form gets long.' }) : null]);
    var yearSel = h('select', { id: 'oto-x-yf', onchange: function () { state.expYear = yearSel.value; render(false); } }, years.map(function (y) { var o = h('option', { value: y, text: y }); o.selected = y === state.expYear; return o; }));
    var retChk = h('input', { type: 'checkbox', onchange: function () { state.showRetired = retChk.checked; render(false); } }); retChk.checked = state.showRetired;
    var list = MASTER_EXPECTATIONS.filter(function (e) { return appliesIn(e, state.expYear) && (state.showRetired || e.active); });
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
        h('td', { style: 'font-weight:650;width:30%' }, [e.title, e.year && e.year !== state.expYear ? h('div', { class: 'small muted', style: 'font-weight:400', text: 'Since ' + e.year }) : null]),
        h('td', { class: 'small', text: e.measures }),
        h('td', null, h('span', { class: 'chip ' + (e.active ? 'green' : ''), text: e.active ? 'Active' : 'Retired' })),
        h('td', { style: 'width:1%;white-space:nowrap' }, h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' }, [
          h('button', { class: 'btn small', type: 'button', text: 'Edit', onclick: function () { state.expEdit = e.id; render(true); } }),
          h('button', { class: 'btn small ghost', type: 'button', text: e.active ? 'Retire' : 'Reactivate', onclick: function () {
            busy('exp', async function () {
              await spUpdate(CONFIG.lists.exp, e.id, { Active: e.active ? '0' : '1' });
              e.active = !e.active; render(false);
            }).catch(function () {});
          } }),
          // only a retired item can be deleted – past reviews keep their own copy, so their history never changes
          e.active ? null : h('button', { class: 'btn small danger', type: 'button', text: 'Delete permanently', onclick: function () {
            confirmBox('Delete "' + e.title + '" permanently?', 'It is removed from the expectations list for good (SharePoint keeps it in the site recycle bin for about 93 days in case of a mistake). Past monthly reviews and reports keep their own copy and ratings – they are not changed.', 'Delete permanently', function () {
              busy('expdel', async function () {
                await spRecycle(CONFIG.lists.exp, e.id);
                MASTER_EXPECTATIONS = MASTER_EXPECTATIONS.filter(function (x) { return x !== e; });
                if (state.expEdit === e.id) { state.expEdit = null; }
                toast('Deleted.'); render(false);
              }).catch(function () {});
            });
          } })]))
      ].forEach(function (c) { row.appendChild(c); });
      return row;
    }
    // one compact section per group: Shared, then each person's own
    function group(title, sub, kind, items, empty) {
      return h('section', { class: 'expgroup ' + kind }, [
        h('header', null, [h('span', { class: 'eg-title', text: title }), h('span', { class: 'small muted', text: sub })]),
        items.length ? h('table', { class: 'tbl' }, h('tbody', null, items.map(rowFor))) : h('div', { class: 'muted small', style: 'padding:8px 12px', text: empty })
      ]);
    }
    var shared = list.filter(function (e) { return e.scope === 'Shared'; }).sort(bySort);
    var groups = [group('Shared', 'Applies to every ' + lc(L.one) + ' · ' + shared.filter(function (e) { return e.active; }).length + ' active', 'shared', shared, 'None.')];
    TECHS.forEach(function (t) {
      var own = list.filter(function (e) { return e.scope === 'Individual' && e.tech === t; }).sort(bySort);
      groups.push(group(t, own.filter(function (e) { return e.active; }).length + ' individual · ' + activeCount(t, state.expYear) + ' in total with shared', 'ind', own, 'No individual expectations.'));
    });
    var orphans = list.filter(function (e) { return e.scope === 'Individual' && TECHS.indexOf(e.tech) < 0; }).sort(bySort);
    if (orphans.length) { groups.push(group('Needs attention', 'Individual expectations without an active ' + lc(L.one), 'orphan', orphans, '')); }
    var listCard = card('Expectations – ' + state.expYear, list.length + ' shown', [
      h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-x-yf', text: 'Appraisal year' }), yearSel]),
        h('label', { class: 'small', style: 'display:flex;gap:6px;align-items:center;font-weight:600;padding-bottom:8px' }, [retChk, 'Show retired'])]),
      h('div', { class: 'expgroups' }, groups)
    ]);
    return h('div', { class: 'layout left', style: 'margin-top:0' }, [h('div', { class: 'stack' }, [form, cov]), h('div', { class: 'stack' }, [listCard])]);
  }

  // ---------------------------------------------------------------------------------------------
  // actions
  // ---------------------------------------------------------------------------------------------
  // Read-only list of actions: a review's agreed actions (ActionsJson, the record of that meeting) or tracked actions.
  function actionsTable(items, opts) {
    opts = opts || {};
    var tracked = items.some(function (x) { return x.ac.tracked; });
    var headers = [].concat(opts.showTech ? [L.one] : [], opts.showMonth ? ['From'] : [], ['Action', 'Owner', 'Close-out criteria', 'Deadline', 'Status'], tracked ? ['Latest progress'] : []);
    var rows = items.map(function (x) {
      var ac = x.ac, od = acOverdue(ac);
      var cells = [].concat(opts.showTech ? [x.r.tech] : [], opts.showMonth ? [x.r.month ? monthShort(x.r.month) + ' ' + x.r.month.slice(2, 4) : '—'] : [], [
        h('span', { style: 'font-weight:600', text: ac.text }), ac.owner,
        h('span', { class: 'small', text: ac.criteria }),
        h('span', { class: od ? 'overdue' : '', text: dueText(ac) }),
        acChip(ac)
      ], tracked ? [h('span', { class: 'small' }, [clip(ac.latest || '', 90), ac.status === 'Waiting' && ac.waitingReason ? h('div', { class: 'small muted', text: 'Waiting on: ' + ac.waitingReason }) : null])] : []);
      return tr(cells, od ? 'hl' : '');
    });
    return table(headers, rows, { empty: 'No actions.' });
  }
  // Before solution 1.5 the Actions page only lists what was agreed in each review (read-only; the tracker manages them after).
  function actionsView() {
    if (V15) { return trackerView(); }
    var all = actionsOf(null, 'tl');
    var techSel = h('select', { id: 'oto-a-tech', onchange: function () { state.actTech = techSel.value; render(false); } },
      [h('option', { value: '', text: ('All ' + lc(L.many)) })].concat(Object.keys(TECH_INFO).sort().map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === state.actTech; return o; })));
    var shown = all.filter(function (x) { return !state.actTech || x.r.tech === state.actTech; });
    return h('div', null, [h('div', { class: 'banner info', text: 'Actions can be updated, carried forward and closed once solution 1.5 is installed: run 0 Setup (1.5), then Refresh. Until then this page only lists what was agreed in each review.' }),
      h('div', { style: 'margin-top:14px' }, card('Agreed actions', 'Raised in monthly reviews', [
        h('div', { class: 'filters' }, [h('div', null, [h('label', { for: 'oto-a-tech', text: L.one }), techSel])]),
        actionsTable(shown, { showTech: true, showMonth: true })
      ]))]);
  }

  // ---------------------------------------------------------------------------------------------
  // ACTION TRACKER (solution 1.5). After release the 1-to-1 Actions list is the only live record of an action (ActionsJson stays
  // as what was agreed at that meeting). Flow 3 adds a released review's actions; Flow 1 finishes any it couldn't. The Team
  // Leader writes an action only with the etag it was read with, so a change made meanwhile (a technician's update recorded
  // by Flow 10) is never overwritten. Technicians never write an action: each update is a new item in their own folder of
  // 1-to-1 Action Updates, and Flow 10 checks and records it. Nothing here scores actions.
  // ---------------------------------------------------------------------------------------------
  var ACT_STATUS = ['Open', 'In progress', 'Waiting', 'Ready for close-out', 'Closed'];
  var OUTCOMES = [{ value: 'Satisfactory', text: 'Progress satisfactory' }, { value: 'Support', text: 'Further support required' }, { value: 'Ready', text: 'Ready to close' }];
  var UPD_KIND = { progress: 'Progress update', waiting: 'Waiting on something', closeRequest: 'Request to close', followup: 'Follow-up' };
  var UPD_KEY = 'esg1to1.unsentUpdates';
  var actDrafts = {}, pollTimer = null, pollLeft = 0;
  function isoOk(v) { return /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : ''; }
  function ukMonthOf(instant) { var d = localDate(instant); return d ? d.slice(0, 7) : ''; }
  // midnight UK time on that day, as the UTC instant SharePoint stores for a date-only column (BST: 23:00 the day before)
  function ukMidnightUtc(iso) {
    var off = 0;
    try { off = Number(new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, hour: '2-digit', hour12: false }).format(new Date(iso + 'T12:00:00Z'))) - 12; } catch (_) { off = 0; }
    return new Date(Date.parse(iso + 'T00:00:00Z') - off * 3600000).toISOString().replace('.000', '');
  }
  function addWorkingDays(iso, n) {
    var d = iso, left = n;
    while (left > 0) { d = addDays(d, 1); var wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd !== 0 && wd !== 6) { left -= 1; } }
    return d;
  }
  // A history entry as read: every value text, unknown kinds kept (shown plainly)
  function cleanEntry(e) {
    var o = {};
    ['id', 'at', 'by', 'kind', 'outcome', 'text', 'month', 'from', 'to', 'waitingUntil', 'key', 'role'].forEach(function (k) { o[k] = str(e[k]).slice(0, 4000); });
    if (!o.month && o.key) { var m = /^fu-(\d{4}-\d{2})-/.exec(o.key); if (m) { o.month = m[1]; } }
    return o;
  }
  function buildAction(x, techName) {
    var who = x.Technician || {}, raw = safeJson(x.HistoryJson, []);
    var hist = Array.isArray(raw) ? raw.filter(function (e) { return e && typeof e === 'object' && !Array.isArray(e); }).map(cleanEntry) : [];
    var seen = {};
    hist = hist.filter(function (e) { if (!e.id) { return true; } if (seen[e.id]) { return false; } seen[e.id] = true; return true; });
    hist.forEach(function (e, i) { e.t = Date.parse(e.at) || 0; e.i = i; });   // flow times have more decimals than the page's: compare as times
    hist.sort(function (p, q) { return p.t - q.t || p.i - q.i; });
    var made = hist.find(function (e) { return e.kind === 'created'; });
    var role = str(x.Owner) === 'Team Leader' ? 'tl' : 'tech';
    var ac = {
      tracked: true, id: Number(x.ID), key: str(x.ActionKey), fromReview: /^mr\d+-/.test(str(x.ActionKey)), text: str(x.Title), tech: techName, techId: Number(who.Id) || 0, techEmail: str(who.EMail).toLowerCase(),
      ownerRole: role, owner: role === 'tl' ? L.mgr : techName, criteria: str(x.Criteria),
      originMonth: /^\d{4}-\d{2}$/.test(str(x.OriginMonth)) ? str(x.OriginMonth) : '', originMgrId: Number(x.OriginMgrId) || 0, originReviewId: Number(x.OriginReviewId) || 0,
      originalDue: localDate(x.OriginalDue), due: localDate(x.CurrentDue), status: ACT_STATUS.indexOf(str(x.Status)) >= 0 ? str(x.Status) : 'Open',
      waitingReason: str(x.WaitingReason), waitingUntil: isoOk(x.WaitingUntil), latest: str(x.LatestProgress), lastOn: str(x.LastUpdateOn), lastBy: str(x.LastUpdateBy),
      closedOn: localDate(x.ClosedOn), decision: str(x.DecisionNote), history: hist, historyOk: Array.isArray(raw) || !x.HistoryJson, rawHistory: Array.isArray(raw) ? raw : [],
      shared: str(x.SharedWith).toLowerCase(), etag: str(x['odata.etag']), modified: str(x.Modified), created: made ? made.at : str(x.Modified)
    };
    var last = [ac.lastOn, ac.created].concat(hist.map(function (e) { return e.at; })).filter(function (v) { return !isNaN(Date.parse(v)); })
      .sort(function (p, q) { return Date.parse(p) - Date.parse(q); }).pop();
    ac.lastActivity = last || '';
    return ac;
  }
  function acOpen(ac) { return ac.status !== 'Closed'; }
  function acOverdue(ac) { return acOpen(ac) && !!ac.due && ac.due < TODAY; }
  function acSoon(ac) { return acOpen(ac) && !acOverdue(ac) && !!ac.due && ac.due <= addWorkingDays(TODAY, 10); }
  function acStale(ac) { return acOpen(ac) && ac.status !== 'Waiting' && ac.status !== 'Ready for close-out' && !!ac.lastActivity && daysBetween(localDate(ac.lastActivity), TODAY) > 30; }
  function acShared(ac) { return !!ac.techEmail && ac.shared === ac.techEmail; }
  function dueText(ac) {
    if (!ac.due) { return 'No deadline'; }
    return fmtDate(ac.due) + (acOverdue(ac) ? ' – overdue' : '') + (ac.tracked && ac.originalDue && ac.originalDue !== ac.due ? ' (was ' + fmtDate(ac.originalDue) + ')' : '');
  }
  // Waiting explains a delay; it never moves the deadline. An overdue action that is waiting says what it waits on.
  function acStatusText(ac) {
    if (ac.status === 'Closed') { return 'Closed' + (ac.closedOn ? ' ' + fmtDate(ac.closedOn) : ''); }
    if (acOverdue(ac)) { return ac.status === 'Waiting' ? 'Overdue – waiting on: ' + (ac.waitingReason || 'not given') : 'Overdue' + (ac.status === 'Ready for close-out' ? ' – awaiting close-out' : ''); }
    return ac.status === 'Ready for close-out' ? 'Awaiting close-out' : ac.status;
  }
  function acChip(ac) {
    var cls = ac.status === 'Closed' ? 'green' : acOverdue(ac) ? 'red' : ac.status === 'Ready for close-out' ? 'blue' : ac.status === 'Waiting' ? 'amber' : ac.status === 'In progress' ? 'blue' : '';
    var t = ac.status === 'Closed' ? acStatusText(ac) : acOverdue(ac) ? (ac.status === 'Waiting' ? 'Overdue – waiting' : 'Overdue') : ac.status === 'Ready for close-out' ? 'Awaiting close-out' : ac.status;
    return h('span', { class: 'chip ' + cls, text: t });
  }
  function actionsOf(filterFn, aud) {
    var out = [];
    if (V15) {
      ACTIONS.forEach(function (ac) { var r = { tech: ac.tech, month: ac.originMonth }; if (!filterFn || filterFn(ac, r)) { out.push({ ac: ac, r: r }); } });
    } else {
      REVIEWS.forEach(function (r) {
        if (aud === 'tech' && !r.released) { return; }
        r.fb.actions.forEach(function (ac) { if (!filterFn || filterFn(ac, r)) { out.push({ ac: ac, r: r }); } });
      });
    }
    return out.sort(function (x, y) { return (x.ac.due || '9') < (y.ac.due || '9') ? -1 : 1; });
  }
  // Tracked actions shown with an appraisal period: open now, or closed or raised within it (actions are never scored)
  function actionsForPeriod(tech, p, aud) {
    return actionsOf(function (ac, r) {
      if (r.tech !== tech) { return false; }
      if (!V15 || acOpen(ac)) { return true; }
      var c = (ac.closedOn || '').slice(0, 7), o = ac.originMonth;
      return (c && c > p.start && (!p.closed || c <= p.end)) || (o && inPeriod(p, o));
    }, aud);
  }
  function entryText(e) {
    var t = e.text, until = isoOk(e.waitingUntil);
    var oc = OUTCOMES.find(function (o) { return o.value === e.outcome; });
    switch (e.kind) {
      case 'created': return (e.by || 'Added') + (e.month ? ' (' + monthLabel(e.month) + ')' : '') + (t ? ' – ' + t : '');
      case 'progress': return 'Progress: ' + t;
      case 'waiting': return 'Waiting on: ' + t + (until ? ' · next check ' + fmtDate(until) : '');
      case 'closeRequest': return 'Asked to close' + (t ? ': ' + t : '');
      case 'followup': return 'Follow-up' + (e.month ? ' (' + monthLabel(e.month) + ' review)' : '') + ': ' + (oc ? oc.text : e.outcome) + (t ? ' – ' + t : '');
      case 'deadline': return 'Deadline changed from ' + (isoOk(e.from) ? fmtDate(e.from) : 'none') + ' to ' + (isoOk(e.to) ? fmtDate(e.to) : 'none') + ' – ' + t;
      case 'owner': return 'Owner changed from ' + e.from + ' to ' + e.to + ' – ' + t;
      case 'accept': return 'Close-out agreed – closed' + (t ? ': ' + t : '');
      case 'close': return 'Closed' + (t ? ': ' + t : '');
      case 'reject': return 'Close-out not agreed yet: ' + t;
      case 'reopen': return 'Reopened: ' + t;
      case 'status': return 'Status ' + e.from + ' → ' + e.to + (t ? ' – ' + t : '');
      case 'repair': return 'Sharing re-checked';
      default: return (e.kind || 'Note') + (t ? ': ' + t : '');
    }
  }
  function historyList(ac) {
    var items = ac.history.slice().reverse();
    if (!items.length) { return h('p', { class: 'small muted', text: 'No history yet.' }); }
    return h('ol', { class: 'acthist' }, items.map(function (e) {
      var when = localDate(e.at);
      return h('li', null, [h('span', { class: 'small muted', text: (when ? fmtDate(when) : '') + (e.by && e.kind !== 'created' ? ' · ' + e.by : '') }), h('div', { text: entryText(e) })]);
    }).concat(ac.historyOk ? [] : [h('li', { class: 'small bad', text: 'Part of this history could not be read – check the item in the 1-to-1 Actions list.' })]));
  }
  function historyBlock(ac, open) {
    var d = h('details', { class: 'acthist-d' }, [h('summary', { text: 'History (' + ac.history.length + ')' }), historyList(ac)]);
    if (open) { d.open = true; }
    return d;
  }
  // the latest follow-up outcome each person recorded for a review month
  function followupsOf(ac, month, upds) {
    var out = { tech: null, tl: null };
    ac.history.forEach(function (e) {
      if (e.kind !== 'followup' || e.month !== month) { return; }
      if (e.role === 'tl') { out.tl = e; } else { out.tech = e; }
    });
    (upds || []).forEach(function (u) {   // the technician's own, not recorded yet
      if (u.actionId === ac.id && u.kind === 'followup' && u.month === month && u.state !== 'Rejected' && u.state !== 'Applied') { out.tech = { outcome: u.outcome, pending: true, text: u.message }; }
    });
    return out;
  }

  // ---- reads
  async function loadTracker(byEmail) {
    var rows = await spGetAll(CONFIG.lists.actions, ACT_FIELDS, 'Technician', { meta: true });
    if (IS_TL) {
      ACTIONS = rows.map(function (x) { var em = str(x.Technician && x.Technician.EMail).toLowerCase(); return buildAction(x, byEmail[em] || str(x.Technician && x.Technician.Title) || 'Unknown'); });
      UPD_OPEN = (await spGetAll(CONFIG.lists.actionUpdates, UPD_FIELDS, '', { filter: "ProcessState ne 'Applied'" })).filter(function (u) { return Number(u.FSObjType) === 0; }).map(buildUpdate);
      NOTICES = (await spGetAll(CONFIG.lists.actionNotices, NOTICE_FIELDS, '', { filter: "Status ne 'Sent'" })).map(function (n) {
        return { id: n.ID, key: str(n.NoticeKey), kind: str(n.Kind), actionId: Number(n.ActionId) || 0, status: str(n.Status), attempts: Number(n.Attempts) || 0, error: str(n.LastError), modified: str(n.Modified), created: str(n.Created) };
      });
    } else {
      var dropped = 0;
      ACTIONS = rows.filter(function (x) {   // defence in depth, as for reviews
        var ok = (!!MY_EMAIL && str(x.Technician && x.Technician.EMail).toLowerCase() === MY_EMAIL) || Number(x.Technician && x.Technician.Id) === MY_ID;
        if (!ok) { dropped++; }
        return ok;
      }).map(function (x) { return buildAction(x, ME); });
      MY_UPDATES = (await spGetAll(CONFIG.lists.actionUpdates, UPD_FIELDS)).filter(function (u) { return Number(u.FSObjType) === 0 && str(u.FileDirRef).split('/').pop() === 'u' + MY_ID; }).map(buildUpdate);
      if (dropped) { console.warn('ESG 1-to-1: ' + dropped + ' action(s) not belonging to you were readable and have been hidden. Tell the site owner.'); }
      unsentUpdates().forEach(function (s) {
        if (MY_UPDATES.some(function (u) { return u.key === s.key; })) { forgetUnsent(s.key); }
        else { MY_UPDATES.push({ id: 0, actionId: s.actionId, kind: s.kind, outcome: s.outcome, message: s.message, waitingUntil: s.waitingUntil, key: s.key, month: s.month, state: 'Unsent', note: '', created: s.at }); }
      });
    }
  }
  function buildUpdate(u) {
    var key = str(u.ClientKey), m = /^fu-(\d{4}-\d{2})-/.exec(key);
    return { id: u.ID, actionId: Number(u.ActionId) || 0, kind: str(u.Kind), outcome: str(u.Outcome), message: str(u.Message), waitingUntil: isoOk(u.WaitingUntil), key: key,
      month: m ? m[1] : '', state: str(u.ProcessState) || 'Pending', note: str(u.ProcessNote), created: str(u.Created), folder: str(u.FileDirRef) };
  }
  // ---- per-viewer convenience: an update whose send was interrupted (refresh, network) is offered again with the same key
  function unsentUpdates() { try { var v = JSON.parse(window.localStorage.getItem(UPD_KEY) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x.key === 'string' && x.owner === MY_ID; }) : []; } catch (_) { return []; } }
  function rememberUnsent(u) { try { var v = unsentUpdates().filter(function (x) { return x.key !== u.key; }); v.push(u); window.localStorage.setItem(UPD_KEY, JSON.stringify(v.slice(-20))); } catch (_) { /* not available */ } }
  function forgetUnsent(key) { try { window.localStorage.setItem(UPD_KEY, JSON.stringify(unsentUpdates().filter(function (x) { return x.key !== key; }))); } catch (_) { /* not available */ } }

  // ---- Team Leader writes (the 1-to-1 Actions list only, always with the etag the action was read with)
  async function readAction(id) {
    var res = await req('GET', listPath(CONFIG.lists.actions) + '/items(' + Number(id) + ')?$select=' + ACT_FIELDS + '&$expand=Technician', undefined, { 'Accept': 'application/json;odata=minimalmetadata' });
    if (!res.ok || !res.json) { throw new Error('Couldn\'t read the action ' + errText(res)); }
    return res.json;
  }
  function replaceAction(x) {
    var old = ACTIONS.find(function (a) { return a.id === Number(x.ID); });
    var ac = buildAction(x, old ? old.tech : (Object.keys(TECH_INFO).find(function (t) { return TECH_INFO[t].email === str(x.Technician && x.Technician.EMail).toLowerCase(); }) || str(x.Technician && x.Technician.Title)));
    if (old) { ACTIONS[ACTIONS.indexOf(old)] = ac; } else { ACTIONS.push(ac); }
    return ac;
  }
  function staleError() { var e = new Error('This action was updated since you opened it (for example a ' + lc(L.one) + '\'s update was recorded). Nothing was saved – it has been reloaded, so check it and make your change again.'); e.stale = true; return e; }
  // The ONLY write to an action (besides creating one): REST MERGE with IF-MATCH. SharePoint answers 412 if the action changed.
  async function spMerge(list, id, fields, etag) {
    if (list !== CONFIG.lists.actions || !IS_TL) { throw new Error('Only the ' + L.mgr + ' changes actions.'); }
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) { throw new Error('Invalid item'); }
    if (!etag) { throw staleError(); }
    var res = await req('POST', listPath(list) + '/items(' + Number(id) + ')', fields, { 'X-RequestDigest': await digest(), 'X-HTTP-Method': 'MERGE', 'IF-MATCH': etag });
    if (res.status === 412) { throw staleError(); }
    if (res.status === 401 || res.status === 403) { throw new Error('SharePoint refused the save – this record is read-only for you.'); }
    if (!res.ok) { throw new Error('Save failed ' + errText(res)); }
  }
  function entryId() { return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  // fields: columns to change (dates as yyyy-mm-dd, '' clears); entries: what is added to the history (appended, never rewritten)
  async function changeAction(ac, fields, entries) {
    if (!ac.historyOk) { throw new Error('This action\'s history couldn\'t be read, so it wasn\'t changed – check the item in the 1-to-1 Actions list.'); }
    var body = {}, dates = {}, now = new Date().toISOString();
    Object.keys(fields).forEach(function (k) {
      if (k === 'OriginalDue' || k === 'CurrentDue' || k === 'ClosedOn') { dates[k] = fields[k]; body[k] = fields[k] ? ukMidnightUtc(fields[k]) : null; } else { body[k] = fields[k]; }
    });
    if (entries.length) {
      body.HistoryJson = JSON.stringify(ac.rawHistory.concat(entries.map(function (e) { var o = { id: entryId(), at: now, by: ME, role: 'tl' }; Object.keys(e).forEach(function (k) { o[k] = e[k]; }); return o; })));
    }
    body.LastUpdateOn = now; body.LastUpdateBy = ME;
    try { await spMerge(CONFIG.lists.actions, ac.id, body, ac.etag); }
    catch (e) { if (e.stale) { try { replaceAction(await readAction(ac.id)); } catch (_) { /* the message still applies */ } rerender(); } throw e; }
    var back = replaceAction(await readAction(ac.id));
    var wrong = Object.keys(dates).filter(function (k) { return (k === 'ClosedOn' ? back.closedOn : k === 'OriginalDue' ? back.originalDue : back.due) !== dates[k]; });
    if (wrong.length) { throw new Error('SharePoint stored a different date for the action – check Site settings → Regional settings (time zone London), then set it again.'); }
    return back;
  }
  function actionChange(ac, fields, entries, okMsg) {
    return busy('act-' + ac.id, async function () { await changeAction(ac, fields, entries); toast(okMsg); rerender(); });
  }
  // redraw after a tracker change without losing a pending auto-save of the form underneath
  function rerender() { render(false); if (dirty) { autosave.kick(); } }
  async function createAction(v) {
    var info = TECH_INFO[v.tech];
    if (!info || !info.claims) { throw new Error(v.tech + ' isn\'t in Settings → Team.'); }
    var id = 0;
    try {
      id = await spCreate(CONFIG.lists.actions, { Title: v.text.slice(0, 250), ActionKey: v.key, Technician: personValue(info.claims), Owner: v.ownerRole === 'tl' ? 'Team Leader' : 'Technician',
        Criteria: v.criteria, Status: 'Open', OriginMonth: CUR, LastUpdateBy: ME,
        HistoryJson: JSON.stringify([{ id: 'c', at: new Date().toISOString(), by: ME, role: 'tl', kind: 'created', month: CUR, text: 'Added on the Actions page' }]) });
    } catch (e) {   // a retry after a lost reply: the unique key says whether the first try landed
      var f = await req('GET', listPath(CONFIG.lists.actions) + "/items?$select=ID&$filter=ActionKey eq '" + v.key + "'");
      id = f.ok && f.json && f.json.value && f.json.value[0] ? Number(f.json.value[0].ID) : 0;
      if (!id) { throw e; }
    }
    // the deadline is written with the new item's etag (Flow 9 may share it in between: read again and retry once)
    for (var i = 0; i < 2; i++) {
      var ac = replaceAction(await readAction(id));
      if (ac.due === v.due && ac.originalDue === v.due) { return ac; }
      try {
        await spMerge(CONFIG.lists.actions, id, { OriginalDue: ukMidnightUtc(v.due), CurrentDue: ukMidnightUtc(v.due) }, ac.etag);
      } catch (e) { if (!e.stale || i) { throw new Error('The action was added, but its deadline wasn\'t saved – use Update to set it. ' + e.message); } }
    }
    var back = replaceAction(await readAction(id));
    if (back.due !== v.due) { throw new Error('The action was added, but SharePoint stored a different deadline – use Update to set it.'); }
    return back;
  }
  // Repair: any change makes Flow 9 check the action's and the folder's permissions again and fix them
  function repairAccess(list) {
    return busy('repair', async function () {
      var failed = 0;
      for (var i = 0; i < list.length; i++) {
        try { await spMerge(CONFIG.lists.actions, list[i].id, { SharedWith: '' }, list[i].etag); replaceAction(await readAction(list[i].id)); } catch (e) { failed++; }
      }
      toast(failed ? failed + ' couldn\'t be changed – Refresh and try again.' : 'Asked Flow 9 to check sharing for ' + plural(list.length, 'action') + ' – it takes a few minutes.', !!failed);
      render(false);
    });
  }
  function resendNotice(n) {
    return busy('notice-' + n.id, async function () {
      await spUpdate(CONFIG.lists.actionNotices, n.id, { Status: 'Retry' });
      n.status = 'Retry'; n.modified = new Date().toISOString();
      toast('Queued to send again.'); render(false);
    });
  }

  // ---- Team Leader dialogs
  function noteField(label, value, onInput, maxlen, rows) {
    var id = nid('n'), ta = h('textarea', { id: id, rows: rows || 3, maxlength: String(maxlen || 2000) });
    ta.value = value || '';
    ta.addEventListener('input', function () { onInput(ta.value); ta.classList.remove('invalid'); });
    var w = h('div', null, [h('label', { class: 'field', for: id, text: label }), ta]);
    w.input = ta;
    return w;
  }
  function actSummary(ac) {
    return h('div', { class: 'actsum' }, [h('div', { style: 'font-weight:650', text: ac.text }),
      h('div', { class: 'small muted', text: ac.tech + ' · owner ' + ac.owner + ' · deadline ' + dueText(ac) + ' · ' + acStatusText(ac) }),
      ac.criteria ? h('div', { class: 'small', text: 'Close-out criteria: ' + ac.criteria }) : null,
      ac.latest ? h('div', { class: 'small', text: 'Latest: ' + ac.latest }) : null]);
  }
  function wide(back) { var m = back.querySelector('.modal'); if (m) { m.classList.add('wide'); } return back; }
  function updateDialog(ac) {
    var v = { note: '', status: ac.status, reason: '', wReason: ac.waitingReason, wUntil: ac.waitingUntil, due: ac.due, dueReason: '', owner: ac.ownerRole, ownerReason: '' };
    var stSel = h('select', { 'aria-label': 'Status' }, ACT_STATUS.map(function (s) { var o = h('option', { value: s, text: s }); o.selected = s === ac.status; return o; }));
    var waitBox = h('div', { class: 'stack', style: 'gap:8px' }, [
      noteField('Waiting on (required)', v.wReason, function (x) { v.wReason = x; }, 1000, 2),
      h('div', null, [h('label', { class: 'field', text: 'Next check (optional) – the deadline stays as it is' }), dateField(v.wUntil, function (x) { v.wUntil = x; }, 'Next check', { noDirty: true })])]);
    var reasonLbl = h('label', { class: 'field' }), reasonBox = noteField('', '', function (x) { v.reason = x; }, 2000, 2);
    reasonBox.replaceChild(reasonLbl, reasonBox.firstChild); reasonLbl.setAttribute('for', reasonBox.input.id);
    var dueReason = noteField('Why the deadline is changing (required)', '', function (x) { v.dueReason = x; }, 1000, 2);
    var ownerReason = noteField('Why the owner is changing (required)', '', function (x) { v.ownerReason = x; }, 1000, 2);
    var ownSel = h('select', { 'aria-label': 'Owner' }, [['tech', ac.tech], ['tl', L.mgr]].map(function (p) { var o = h('option', { value: p[0], text: p[1] }); o.selected = p[0] === ac.ownerRole; return o; }));
    function sync() {
      v.status = stSel.value; v.owner = ownSel.value;
      waitBox.hidden = v.status !== 'Waiting';
      var reopen = ac.status === 'Closed' && v.status !== 'Closed', reject = ac.status === 'Ready for close-out' && v.status !== 'Closed' && v.status !== 'Ready for close-out';
      reasonBox.hidden = !(reopen || reject || (v.status === 'Closed' && ac.status !== 'Closed'));
      reasonLbl.textContent = reopen ? 'Why it is being reopened (required)' : reject ? 'Why the close-out isn\'t agreed yet (required – ' + first(ac.tech) + ' sees this)' : 'Close-out note (optional)';
      dueReason.hidden = v.due === ac.due;
      ownerReason.hidden = v.owner === ac.ownerRole;
    }
    stSel.addEventListener('change', sync); ownSel.addEventListener('change', sync);
    var dueField = dateField(ac.due, function (x) { v.due = x; sync(); }, 'Deadline', { noDirty: true });
    var fields = [actSummary(ac),
      noteField('Progress note (optional)', '', function (x) { v.note = x; }, 2000, 2),
      h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', text: 'Status' }), stSel]), h('div', null, [h('label', { class: 'field', text: 'Owner' }), ownSel])]),
      waitBox, reasonBox,
      h('div', null, [h('label', { class: 'field', text: 'Deadline' + (ac.originalDue && ac.originalDue !== ac.due ? ' (originally ' + fmtDate(ac.originalDue) + ')' : '') }), dueField]),
      dueReason, ownerReason, historyBlock(ac, false)];
    sync();
    wide(formBox('Update action', null, fields, 'Save', function () {
      if (badDates(root.querySelector('.modal-back:last-child'))) { return 'A date isn\'t recognised – fix it first.'; }
      var f = {}, en = [], note = v.note.trim(), reason = v.reason.trim();
      if (note) { f.LatestProgress = note; en.push({ kind: 'progress', text: note }); }
      if (v.status !== ac.status || (v.status === 'Waiting' && (v.wReason.trim() !== ac.waitingReason || v.wUntil !== ac.waitingUntil))) {
        if (v.status === 'Waiting') {
          if (!v.wReason.trim()) { return 'Say what the action is waiting on.'; }
          f.WaitingReason = v.wReason.trim(); f.WaitingUntil = v.wUntil || '';
          en.push({ kind: 'waiting', text: v.wReason.trim(), waitingUntil: v.wUntil || '' });
        } else { f.WaitingReason = ''; f.WaitingUntil = ''; }
        if (v.status !== ac.status) {
          f.Status = v.status;
          if (ac.status === 'Closed') {
            if (!reason) { return 'Give the reason for reopening.'; }
            f.ClosedOn = ''; f.DecisionNote = reason; en.push({ kind: 'reopen', text: reason, from: 'Closed', to: v.status });
          } else if (v.status === 'Closed') {
            f.ClosedOn = TODAY; f.DecisionNote = reason; en.push({ kind: ac.status === 'Ready for close-out' ? 'accept' : 'close', text: reason, from: ac.status, to: 'Closed' });
          } else if (ac.status === 'Ready for close-out') {
            if (!reason) { return 'Give the reason the close-out isn\'t agreed yet.'; }
            f.DecisionNote = reason; en.push({ kind: 'reject', text: reason, from: ac.status, to: v.status });
          } else if (v.status !== 'Waiting') { en.push({ kind: 'status', from: ac.status, to: v.status, text: '' }); }
        }
      }
      if (v.due !== ac.due) {
        if (!v.due) { return 'An action needs a deadline.'; }
        if (!v.dueReason.trim()) { return 'Give the reason the deadline is changing.'; }
        f.CurrentDue = v.due; if (!ac.originalDue) { f.OriginalDue = ac.due || v.due; }
        en.push({ kind: 'deadline', from: ac.due, to: v.due, text: v.dueReason.trim() });
      }
      if (v.owner !== ac.ownerRole) {
        if (!v.ownerReason.trim()) { return 'Give the reason the owner is changing.'; }
        f.Owner = v.owner === 'tl' ? 'Team Leader' : 'Technician';
        en.push({ kind: 'owner', from: ac.owner, to: v.owner === 'tl' ? L.mgr : ac.tech, text: v.ownerReason.trim() });
      }
      if (!en.length) { return 'Nothing has changed yet.'; }
      return actionChange(ac, f, en, 'Action updated.');
    }));
  }
  function acceptClose(ac) {
    var v = { note: '' };
    wide(formBox('Agree close-out and close', null, [actSummary(ac), noteField('Close-out note (optional)', '', function (x) { v.note = x; }, 2000, 2)], 'Close action', function () {
      return actionChange(ac, { Status: 'Closed', ClosedOn: TODAY, DecisionNote: v.note.trim(), WaitingReason: '', WaitingUntil: '' }, [{ kind: 'accept', text: v.note.trim(), from: ac.status, to: 'Closed' }], 'Closed.');
    }));
  }
  function rejectClose(ac) {
    var v = { why: '' }, box = noteField('Why the close-out isn\'t agreed yet (required – ' + first(ac.tech) + ' sees this)', '', function (x) { v.why = x; }, 2000, 3);
    wide(formBox('Not ready to close', null, [actSummary(ac), box], 'Save', function () {
      if (!v.why.trim()) { box.input.classList.add('invalid'); return 'Give the reason.'; }
      return actionChange(ac, { Status: 'In progress', DecisionNote: v.why.trim() }, [{ kind: 'reject', text: v.why.trim(), from: ac.status, to: 'In progress' }], 'Saved – the action stays open.');
    }));
  }
  function newActionDialog(preTech) {
    var v = { tech: preTech || state.actTech || TECHS[0] || '', text: '', criteria: '', due: '', ownerRole: 'tech', key: 'tl-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36) };
    var techSel = h('select', { 'aria-label': L.one, onchange: function () { v.tech = techSel.value; } }, TECHS.map(function (t) { var o = h('option', { value: t, text: t }); o.selected = t === v.tech; return o; }));
    var ownSel = h('select', { 'aria-label': 'Owner', onchange: function () { v.ownerRole = ownSel.value; } }, [h('option', { value: 'tech', text: L.one }), h('option', { value: 'tl', text: L.mgr })]);
    var tx = noteField('Action', '', function (x) { v.text = x; }, 250, 2), cr = noteField('Close-out criteria', '', function (x) { v.criteria = x; }, 1000, 2);
    var due = dateField('', function (x) { v.due = x; }, 'Deadline', { noDirty: true });
    if (!TECHS.length) { toast('Add your team first (⚙ Settings → Team).', true); return; }
    wide(formBox('New action', 'For actions agreed outside a monthly review. ' + L.one + 's see their own actions and can send updates; only you close them.', [
      h('div', { class: 'fgrid c2' }, [h('div', null, [h('label', { class: 'field', text: L.one }), techSel]), h('div', null, [h('label', { class: 'field', text: 'Owner' }), ownSel])]),
      tx, cr, h('div', null, [h('label', { class: 'field', text: 'Deadline' }), due])], 'Add action', function () {
      if (badDates(root.querySelector('.modal-back:last-child'))) { return 'The deadline isn\'t recognised – fix it first.'; }
      if (!v.text.trim()) { tx.input.classList.add('invalid'); return 'Describe the action.'; }
      if (!v.criteria.trim()) { cr.input.classList.add('invalid'); return 'Add the close-out criteria.'; }
      if (!v.due) { return 'Add a deadline.'; }
      return busy('act-new', async function () {
        await createAction({ tech: v.tech, text: v.text.trim(), criteria: v.criteria.trim(), due: v.due, ownerRole: v.ownerRole, key: v.key });
        toast('Action added – ' + first(v.tech) + ' can see it once Flow 9 has shared it (a few minutes).'); render(false);
      });
    }));
  }

  // ---- Team Leader: the Actions page
  function trackerNeeds() {
    var open = ACTIONS.filter(acOpen);
    return {
      close: open.filter(function (a) { return a.status === 'Ready for close-out'; }),
      overdue: open.filter(acOverdue),
      soon: open.filter(acSoon),
      waiting: open.filter(function (a) { return a.status === 'Waiting'; }),
      stale: open.filter(acStale),
      notices: NOTICES.filter(noticeProblem),
      access: open.filter(function (a) { return !acShared(a) && Date.now() - new Date(a.modified || 0).getTime() > 15 * 60000; })
    };
  }
  function noticeAge(n) { return Date.now() - new Date(n.modified || n.created || 0).getTime(); }
  function noticeProblem(n) {
    if (n.status === 'Failed') { return true; }
    if (n.status === 'Sending' || n.status === 'Pending' || n.status === 'Retry') { return noticeAge(n) > 3600000; }
    return false;
  }
  function noticeText(n) {
    var ac = ACTIONS.find(function (a) { return a.id === n.actionId; });
    var what = (n.kind === 'E19' ? 'The close-out request email' : 'The deadline reminder') + (ac ? ' for ' + ac.tech + ' (' + clipText(ac.text, 60) + ')' : '');
    if (n.status === 'Failed') { return what + ' couldn\'t be sent' + (n.attempts ? ' (' + plural(n.attempts, 'attempt') + ')' : '') + (n.error ? ': ' + clipText(n.error, 120) : ''); }
    if (n.status === 'Sending') { return what + ': delivery unknown – the send didn\'t finish, so it may or may not have arrived'; }
    return what + ' is still waiting to be sent – check flow 11 is on';
  }
  function clipText(t, n) { t = str(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function trackerView() {
    var needs = trackerNeeds(), all = ACTIONS.slice();
    var NEEDS = [['close', 'Awaiting close-out', 'Asked to close', 'warn'], ['overdue', 'Overdue', 'Past the deadline', 'bad'], ['soon', 'Due soon', 'In the next 10 working days', ''],
      ['waiting', 'Waiting', 'On something outside the action', ''], ['stale', 'No recent progress', 'Nothing for 30 days', ''], ['problems', 'Needs a fix', 'Emails or sharing', 'bad']];
    var nProblems = needs.notices.length + needs.access.length;
    var strip = h('div', { class: 'tiles needs' }, NEEDS.map(function (n) {
      var count = n[0] === 'problems' ? nProblems : needs[n[0]].length;
      var t = tile(n[1], String(count), n[2], count ? n[3] : '');
      var b = h('button', { type: 'button', class: 'tilebtn', 'aria-pressed': state.actNeed === n[0] ? 'true' : 'false', 'aria-label': n[1] + ': ' + count, onclick: function () {
        state.actNeed = state.actNeed === n[0] ? '' : n[0]; render(false); } }, [t]);
      return b;
    }));
    function sel(id, label, opts, val, key) {
      var s = h('select', { id: id, onchange: function () { state[key] = s.value; render(false); } }, opts.map(function (o) { var e = h('option', { value: o[0], text: o[1] }); e.selected = o[0] === val; return e; }));
      return h('div', null, [h('label', { for: id, text: label }), s]);
    }
    var techs = Array.from(new Set(all.map(function (a) { return a.tech; }).concat(TECHS))).sort();
    var filters = h('div', { class: 'filters wrap' }, [
      sel('oto-a-tech', L.one, [['', 'All ' + lc(L.many)]].concat(techs.map(function (t) { return [t, t]; })), state.actTech, 'actTech'),
      sel('oto-a-own', 'Owner', [['', 'Anyone'], ['tech', L.one], ['tl', L.mgr]], state.actOwner, 'actOwner'),
      sel('oto-a-st', 'Status', [['open', 'Not closed'], ['Open', 'Open'], ['In progress', 'In progress'], ['Waiting', 'Waiting'], ['Ready for close-out', 'Awaiting close-out'], ['Closed', 'Closed'], ['all', 'All']], state.actFilter, 'actFilter'),
      sel('oto-a-due', 'Deadline', [['', 'Any'], ['overdue', 'Overdue'], ['soon', 'Next 10 working days'], ['none', 'No deadline']], state.actDue, 'actDue')
    ]);
    var needSet = state.actNeed === 'problems' ? needs.access : state.actNeed ? needs[state.actNeed] : null;
    var shown = all.filter(function (a) {
      if (needSet && needSet.indexOf(a) < 0) { return false; }
      if (state.actTech && a.tech !== state.actTech) { return false; }
      if (state.actOwner && a.ownerRole !== state.actOwner) { return false; }
      if (!needSet) {
        if (state.actFilter === 'open' && !acOpen(a)) { return false; }
        if (state.actFilter !== 'open' && state.actFilter !== 'all' && a.status !== state.actFilter) { return false; }
      }
      if (state.actDue === 'overdue' && !acOverdue(a)) { return false; }
      if (state.actDue === 'soon' && !acSoon(a)) { return false; }
      if (state.actDue === 'none' && a.due) { return false; }
      return true;
    }).sort(function (x, y) {
      var px = x.status === 'Ready for close-out' ? 0 : acOverdue(x) ? 1 : acOpen(x) ? 2 : 3, py = y.status === 'Ready for close-out' ? 0 : acOverdue(y) ? 1 : acOpen(y) ? 2 : 3;
      return px - py || ((x.due || '9') < (y.due || '9') ? -1 : (x.due || '9') > (y.due || '9') ? 1 : x.id - y.id);
    });
    var rows = [];
    shown.forEach(function (a) {
      var focus = state.actFocus === a.id, histRow = h('tr', { class: 'acthist-row' }, [h('td', { colspan: '7' }, historyList(a))]);
      histRow.hidden = !focus;
      var btns = [h('button', { class: 'btn small', type: 'button', text: 'Update…', onclick: function () { updateDialog(a); } })];
      if (a.status === 'Ready for close-out') {
        btns.unshift(h('button', { class: 'btn small primary', type: 'button', text: 'Agree & close', onclick: function () { acceptClose(a); } }),
          h('button', { class: 'btn small', type: 'button', text: 'Not yet…', onclick: function () { rejectClose(a); } }));
      }
      btns.push(h('button', { class: 'btn small ghost', type: 'button', text: 'History', 'aria-expanded': focus ? 'true' : 'false', onclick: function (e) {
        histRow.hidden = !histRow.hidden; e.currentTarget.setAttribute('aria-expanded', histRow.hidden ? 'false' : 'true'); } }));
      rows.push(h('tr', { class: (focus ? 'focus ' : '') + (acOverdue(a) ? 'hl' : ''), 'data-action': String(a.id) }, [
        h('td', null, [h('b', { text: a.tech }), h('div', { class: 'small muted', text: a.fromReview && a.originMonth ? 'From ' + monthLabel(a.originMonth) : 'Added' + (a.originMonth ? ' ' + monthLabel(a.originMonth) : '') })]),
        h('td', { class: 'top' }, [h('div', { style: 'font-weight:600', text: a.text }), a.criteria ? h('div', { class: 'small muted', text: 'Close-out: ' + a.criteria }) : null]),
        h('td', { text: a.owner }),
        h('td', { class: acOverdue(a) ? 'overdue nw1' : 'nw1', text: dueText(a) }),
        h('td', null, [acChip(a), a.status === 'Waiting' ? h('div', { class: 'small', text: 'On: ' + a.waitingReason + (a.waitingUntil ? ' · check ' + fmtDate(a.waitingUntil) : '') }) : null,
          !acShared(a) && acOpen(a) ? h('div', { class: 'small muted', text: 'Not shared yet' }) : null]),
        h('td', { class: 'small' }, [clip(a.latest || '—', 110), a.lastOn ? h('div', { class: 'muted', text: fmtDate(localDate(a.lastOn)) + (a.lastBy ? ' · ' + a.lastBy : '') }) : null]),
        h('td', null, h('div', { class: 'btn-col' }, btns))
      ]));
      rows.push(histRow);
    });
    var tbl = h('div', { class: 'tblwrap' }, table([L.one, 'Action', 'Owner', 'Deadline', 'Status', 'Latest progress', ''], rows, { empty: needSet ? 'Nothing here ✓' : 'No actions match.' }));
    var extra = [];
    if (needs.notices.length && (!state.actNeed || state.actNeed === 'problems')) {
      extra.push(card('Email problems', 'Reminders and close-out requests are sent by flow 11. A resend may arrive twice if the first one did get through.', [h('div', { class: 'attn' }, needs.notices.map(function (n) {
        return h('div', { class: 'attn-row' }, [h('span', { class: 'attn-ico', 'aria-hidden': 'true', text: '✉' }), h('span', { class: 'attn-text', text: noticeText(n) }),
          h('button', { class: 'btn small', type: 'button', text: 'Resend', onclick: function () { resendNotice(n).catch(function () {}); } })]);
      }))]));
    }
    if (needs.access.length && (!state.actNeed || state.actNeed === 'problems')) {
      extra.push(card('Not shared yet', plural(needs.access.length, 'action') + ' can\'t be seen by the ' + lc(L.one) + ' yet. Flow 9 shares each action; Repair asks it to check again.', [
        h('button', { class: 'btn', type: 'button', text: 'Repair sharing', onclick: function () { repairAccess(needs.access).catch(function () {}); } })]));
    }
    var head = h('div', { class: 'pagehead' }, [h('div', { class: 'ph-l' }, [h('h2', { text: 'Actions' }), h('span', { class: 'meta', text: plural(ACTIONS.filter(acOpen).length, 'open action') + ' across the team' })]),
      h('button', { class: 'btn primary', type: 'button', text: '+ New action', onclick: function () { newActionDialog(); } })]);
    if (state.actFocus) {
      setTimeout(function () { var el = root && root.querySelector('tr[data-action="' + Number(state.actFocus) + '"]'); if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); } }, 0);
    }
    return h('div', null, [head, strip, h('div', { class: 'stack', style: 'margin-top:14px' }, extra.concat([
      card(state.actNeed ? NEEDS.find(function (n) { return n[0] === state.actNeed; })[1] : 'All actions', state.actNeed ? 'Click the tile again to show everything' : 'Agreed in monthly 1-to-1s or added here · only you close them', [
        state.actNeed ? null : filters, tbl].filter(Boolean))]))]);
  }
  function actionAttention() {
    var items = [], open = ACTIONS.filter(acOpen);
    var go2 = function (need, id) { return function () { state.actNeed = need; state.actFocus = id || null; go('actions'); }; };
    open.filter(function (a) { return a.status === 'Ready for close-out'; }).forEach(function (a) {
      items.push({ pri: 1, ico: '✅', text: a.tech + ' asked to close an action: ' + clipText(a.text, 90), btn: 'Decide', fn: go2('close', a.id) });
    });
    open.filter(function (a) { return acOverdue(a) && a.status !== 'Ready for close-out' && TECH_INFO[a.tech] && TECH_INFO[a.tech].active; }).forEach(function (a) {
      items.push({ pri: 2, ico: '⏰', text: (a.status === 'Waiting' ? 'Overdue – waiting on ' + clipText(a.waitingReason, 60) + ': ' : 'Overdue action for ') + a.tech + ': ' + clipText(a.text, 80) + ' (due ' + fmtDate(a.due) + ')', btn: 'Actions', fn: go2('overdue', a.id) });
    });
    var stale = open.filter(acStale);
    if (stale.length) { items.push({ pri: 3, ico: '💤', text: plural(stale.length, 'open action') + ' with no progress for 30 days', btn: 'Show', fn: go2('stale') }); }
    REVIEWS.forEach(function (r) {
      if (!r.released || !r.fb.actions.length || r.syncedOn || !r.releasedOn || !TRACKER_START || r.releasedOn < TRACKER_START) { return; }
      if (Date.now() - new Date(r.releasedOn).getTime() < 3600000) { return; }
      items.push({ pri: 1, ico: '⚠', text: 'The agreed actions from ' + r.tech + '\'s ' + monthLabel(r.month) + ' 1-to-1 aren\'t all in the tracker yet – check flows 3 and 1 are on (flow 1 finishes them each morning)', btn: 'Open',
        fn: function () { go('mgr', { reviewId: r.id, backTo: 'team' }); } });
    });
    NOTICES.filter(noticeProblem).forEach(function (n) {
      items.push({ pri: n.status === 'Failed' || n.status === 'Sending' ? 1 : 2, ico: '✉', text: noticeText(n), btn: n.status === 'Failed' || n.status === 'Sending' ? 'Resend' : 'Actions',
        fn: n.status === 'Failed' || n.status === 'Sending' ? function () { resendNotice(n).catch(function () {}); } : go2('problems') });
    });
    var stuck = UPD_OPEN.filter(function (u) { return (u.state === 'Pending' || u.state === 'Processing') && Date.now() - new Date(u.created || 0).getTime() > 3600000; });
    if (stuck.length) { items.push({ pri: 1, ico: '⏳', text: plural(stuck.length, L.one.toLowerCase() + ' update') + ' sent over an hour ago ' + (stuck.length === 1 ? 'isn\'t' : 'aren\'t') + ' recorded yet – check flow 10 is on', btn: 'Actions', fn: go2('') }); }
    var unshared = trackerNeeds().access;
    if (unshared.length) { items.push({ pri: 2, ico: '🔒', text: plural(unshared.length, 'action') + ' not shared with the ' + lc(L.one) + ' yet – flow 9 shares them', btn: 'Repair', fn: function () { repairAccess(unshared).catch(function () {}); } }); }
    return items;
  }

  // ---- Technician: My actions
  function myUpdatesFor(ac) { return MY_UPDATES.filter(function (u) { return u.actionId === ac.id; }).sort(function (x, y) { return (x.created || '') < (y.created || '') ? -1 : 1; }); }
  function updState(u) {
    if (u.state === 'Sending') { return h('div', { class: 'updstate', role: 'status', text: 'Sending…' }); }
    if (u.state === 'Unsent') {
      return h('div', { class: 'updstate bad', role: 'status' }, [h('span', { text: UPD_KIND[u.kind] + ' not sent' + (u.note ? ' – ' + u.note : '') + '. ' }),
        h('button', { class: 'btn small', type: 'button', text: 'Send again', onclick: function () { sendUpdate(u).catch(function () {}); } }),
        h('button', { class: 'linkbtn', type: 'button', text: 'Discard', onclick: function () { forgetUnsent(u.key); MY_UPDATES.splice(MY_UPDATES.indexOf(u), 1); render(false); } })]);
    }
    if (u.state === 'Pending' || u.state === 'Processing') { return h('div', { class: 'updstate', role: 'status', text: UPD_KIND[u.kind] + ' received – being recorded (usually within 5 minutes)' }); }
    if (u.state === 'Rejected') { return h('div', { class: 'updstate bad', role: 'status', text: UPD_KIND[u.kind] + ' not recorded: ' + (u.note || 'refused') }); }
    return h('div', { class: 'updstate ok', role: 'status', text: UPD_KIND[u.kind] + ' recorded ✓' });
  }
  function newKey(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36); }
  // An update is a new item in the technician's own folder; SharePoint refuses it anywhere else. Retrying uses the same key
  // (unique), so it is never recorded twice. Success is shown only once flow 10 has recorded it.
  async function sendUpdate(u) {
    if (busyLabels['upd-' + u.key]) { return; }
    busyLabels['upd-' + u.key] = true;
    if (MY_UPDATES.indexOf(u) < 0) { MY_UPDATES.push(u); }
    u.state = 'Sending'; u.note = '';
    rememberUnsent({ key: u.key, actionId: u.actionId, kind: u.kind, outcome: u.outcome, message: u.message, waitingUntil: u.waitingUntil, month: u.month, at: new Date().toISOString(), owner: MY_ID });
    rerender();
    try {
      var id = 0;
      try {
        id = await spCreate(CONFIG.lists.actionUpdates, { Title: 'Update ' + u.key, ActionId: u.actionId, Kind: u.kind, Outcome: u.outcome || '', Message: u.message || '',
          WaitingUntil: u.waitingUntil || '', ClientKey: u.key }, myUpdateFolder());
      } catch (e) {
        var found = await findMyUpdate(u.key).catch(function () { return null; });
        if (!found) { throw e; }
        id = found.ID;
      }
      u.id = id; u.state = 'Pending'; u.created = new Date().toISOString();
      forgetUnsent(u.key);
      schedulePoll();
    } catch (e) {
      u.state = 'Unsent';
      u.note = /refused|403|Access denied/i.test(String(e && e.message)) ? 'SharePoint refused it – your update folder may not be set up yet; tell your ' + lc(L.mgr) : 'it didn\'t reach SharePoint, check your connection';
    } finally { delete busyLabels['upd-' + u.key]; }
    rerender();
  }
  function myUpdateFolder() {
    var path = siteUrl.replace(/^https?:\/\/[^/]+/, '');
    return path + '/Lists/' + CONFIG.updatesUrl + '/u' + MY_ID;
  }
  async function findMyUpdate(key) {
    var res = await req('GET', listPath(CONFIG.lists.actionUpdates) + "/items?$select=" + UPD_FIELDS + "&$filter=ClientKey eq '" + key.replace(/[^a-z0-9-]/gi, '') + "'");
    return res.ok && res.json && res.json.value && res.json.value[0] ? res.json.value[0] : null;
  }
  // after sending: look again at 20 s, 1 and 2 minutes (and on Refresh), without disturbing typing or an open dialog
  function schedulePoll() { pollLeft = 3; clearTimeout(pollTimer); pollTimer = setTimeout(pollNow, 20000); }
  function pollNow() {
    if (disposed || !V15 || IS_TL) { return; }
    var busyTyping = root && (root.querySelector('.modal-back') || (document.activeElement && root.contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName) && document.activeElement.value));
    var waiting = MY_UPDATES.some(function (u) { return u.state === 'Pending' || u.state === 'Processing'; });
    if (!waiting) { return; }
    pollLeft -= 1;
    var again = function () { if (pollLeft > 0) { pollTimer = setTimeout(pollNow, pollLeft === 2 ? 40000 : 60000); } };
    if (busyTyping || dirty) { pollLeft += 1; pollTimer = setTimeout(pollNow, 15000); return; }
    loadTracker({}).then(function () { if (!dirty) { render(false); } again(); }, again);
  }
  function quickUpdate(ac) {
    var d = actDrafts[ac.id] = actDrafts[ac.id] || { text: '', mode: '', until: '' };
    var wrap = h('div', { class: 'quickupd' });
    function draw() {
      wrap.textContent = '';
      var id = nid('q'), ta = h('textarea', { id: id, rows: 2, maxlength: '2000', placeholder: d.mode === 'waiting' ? 'What is it waiting on? (required)' : 'What has happened since the last update?' });
      ta.value = d.text;
      ta.addEventListener('input', function () { d.text = ta.value; ta.classList.remove('invalid'); });
      wrap.appendChild(h('label', { class: 'field', for: id, text: d.mode === 'waiting' ? 'Waiting on something' : d.mode === 'close' ? 'Ask your ' + lc(L.mgr) + ' to close it' : 'Add an update' }));
      wrap.appendChild(ta);
      function send(kind) {
        var msg = d.text.trim();
        if ((kind === 'progress' || kind === 'waiting') && !msg) { ta.classList.add('invalid'); ta.focus(); toast(kind === 'waiting' ? 'Say what it is waiting on.' : 'Write the update first.', true); return; }
        var u = { id: 0, actionId: ac.id, kind: kind, outcome: '', message: msg, waitingUntil: kind === 'waiting' ? d.until : '', key: newKey('up'), month: '', state: 'Sending', note: '', created: '' };
        actDrafts[ac.id] = { text: '', mode: '', until: '' };
        sendUpdate(u).catch(function () {});
      }
      var row = h('div', { class: 'btn-row', style: 'margin-top:8px' });
      if (d.mode === 'waiting') {
        row.appendChild(h('div', { class: 'small' }, [h('label', { class: 'field', text: 'Next check (optional) – your deadline doesn\'t change' }), dateField(d.until, function (x) { d.until = x; }, 'Next check', { noDirty: true })]));
        row.appendChild(h('button', { class: 'btn primary', type: 'button', text: 'Send', onclick: function () { if (badDates(wrap)) { toast('The date isn\'t recognised.', true); return; } send('waiting'); } }));
        row.appendChild(h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { d.mode = ''; draw(); } }));
      } else if (d.mode === 'close') {
        row.appendChild(h('span', { class: 'small', text: 'Close-out criteria: ' + (ac.criteria || '—') }));
        row.appendChild(h('button', { class: 'btn primary', type: 'button', text: 'Ask to close', onclick: function () { send('closeRequest'); } }));
        row.appendChild(h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { d.mode = ''; draw(); } }));
      } else {
        row.appendChild(h('button', { class: 'btn primary', type: 'button', text: 'Send update', onclick: function () { send('progress'); } }));
        row.appendChild(h('button', { class: 'btn', type: 'button', text: 'Waiting on something…', onclick: function () { d.mode = 'waiting'; draw(); wrap.querySelector('textarea').focus(); } }));
        if (ac.ownerRole === 'tech' && ac.status !== 'Ready for close-out') {
          row.appendChild(h('button', { class: 'btn', type: 'button', text: 'Ready to close…', onclick: function () { d.mode = 'close'; draw(); wrap.querySelector('textarea').focus(); } }));
        }
      }
      wrap.appendChild(row);
    }
    draw();
    return wrap;
  }
  function actionCard(ac) {
    var ups = myUpdatesFor(ac), last = ups[ups.length - 1];
    var shownStates = ups.filter(function (u) { return u.state !== 'Applied'; });
    if (last && last.state === 'Applied' && Date.now() - new Date(last.created || 0).getTime() < 7 * 86400000) { shownStates.push(last); }
    var kv = [['Deadline', dueText(ac)], ['Close-out criteria', ac.criteria || '—'], ['Raised', ac.fromReview && ac.originMonth ? monthLabel(ac.originMonth) + ' 1-to-1' : 'Added by your ' + lc(L.mgr) + (ac.originMonth ? ' (' + monthLabel(ac.originMonth) + ')' : '')]];
    if (ac.status === 'Waiting') { kv.push(['Waiting on', ac.waitingReason + (ac.waitingUntil ? ' (next check ' + fmtDate(ac.waitingUntil) + ')' : '')]); }
    if (ac.latest) { kv.push(['Latest progress', ac.latest + (ac.lastOn ? ' – ' + fmtDate(localDate(ac.lastOn)) + (ac.lastBy ? ', ' + ac.lastBy : '') : '')]); }
    if (ac.decision) { kv.push([L.mgr + '\'s note', ac.decision]); }
    if (ac.status === 'Closed') { kv.push(['Closed', fmtDate(ac.closedOn)]); }
    var focus = state.actFocus === ac.id;
    return h('section', { class: 'card actcard' + (focus ? ' focus' : '') + (acOverdue(ac) ? ' od' : ''), 'data-action': String(ac.id) }, [
      h('div', { class: 'card-h' }, [h('div', null, [h('h2', { text: ac.text }), h('div', { class: 'sub' }, [
        h('span', { class: 'chip ' + (ac.ownerRole === 'tech' ? 'orange' : ''), text: ac.ownerRole === 'tech' ? 'Yours' : L.mgr + '\'s action' }), ' ', acChip(ac)])])]),
      h('dl', { class: 'actkv' }, [].concat.apply([], kv.map(function (p) { return [h('dt', { text: p[0] }), h('dd', { text: p[1] })]; }))),
      acOverdue(ac) && ac.status === 'Waiting' ? h('div', { class: 'small muted', text: 'Past the deadline while waiting on something outside the action – your ' + lc(L.mgr) + ' can see what it is waiting on.' }) : null,
      ac.status === 'Ready for close-out' ? h('div', { class: 'small', text: 'You asked to close this – your ' + lc(L.mgr) + ' will agree the close-out or say what is still needed.' }) : null,
      h('div', null, shownStates.map(updState)),
      acOpen(ac) ? quickUpdate(ac) : null,
      historyBlock(ac, focus)
    ]);
  }
  function myActionsView() {
    if (!V15) { return card('My actions', null, [h('p', { text: 'Your agreed actions are shown in each released 1-to-1. Once your ' + lc(L.mgr) + ' turns on action tracking, you can follow and update them here.' })]); }
    var open = ACTIONS.filter(acOpen).sort(function (x, y) { return (x.due || '9') < (y.due || '9') ? -1 : 1; }), closed = ACTIONS.filter(function (a) { return !acOpen(a); });
    var orphan = MY_UPDATES.filter(function (u) { return u.state === 'Unsent' && !ACTIONS.some(function (a) { return a.id === u.actionId; }); });
    if (state.actFocus) {
      setTimeout(function () { var el = root && root.querySelector('[data-action="' + Number(state.actFocus) + '"]'); if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'start' }); } }, 0);
    }
    var head = h('div', { class: 'pagehead' }, [h('div', { class: 'ph-l' }, [h('h2', { text: 'My actions' }),
      h('span', { class: 'meta', text: plural(open.length, 'open action') + (open.filter(acOverdue).length ? ' · ' + open.filter(acOverdue).length + ' overdue' : '') })])]);
    var intro = h('p', { class: 'small muted', style: 'margin:0 0 12px', text: 'Send a quick update whenever something changes – it is recorded on the action for you and your ' + lc(L.mgr) + '. Only your ' + lc(L.mgr) + ' closes an action; for your own actions you can ask them to.' });
    return h('div', null, [head, intro, h('div', { class: 'stack' }, (open.length ? open.map(actionCard) : [card('Nothing open', null, [h('p', { class: 'muted', text: 'You have no open actions.' })])])
      .concat(orphan.map(function (u) { return card('An update wasn\'t sent', null, [updState(u)]); }))
      .concat(closed.length ? [h('details', { class: 'card closedacts' }, [h('summary', { text: 'Closed actions (' + closed.length + ')' }), h('div', { class: 'stack', style: 'margin-top:10px' }, closed.map(actionCard))])] : []))]);
  }

  // ---- Carry-forward: open actions (and those closed since the last review) shown in each monthly 1-to-1, with an optional
  // follow-up outcome. The technician's outcome goes through flow 10; the Team Leader's is written to the action.
  function carryForwardCard(r, aud) {
    if (!V15) { return null; }
    var prev = reviewsOf(r.tech).filter(function (x) { return x.month < r.month; }).pop();
    var since = prev ? prev.month + '-01' : '';
    var list = ACTIONS.filter(function (a) {
      if (a.tech !== r.tech || (r.mrId && a.originMgrId === r.mrId)) { return false; }
      if (acOpen(a)) { return !a.originMonth || a.originMonth <= r.month; }
      return !!a.closedOn && a.closedOn >= (since || r.month + '-01');
    }).sort(function (x, y) { return (acOpen(x) ? 0 : 1) - (acOpen(y) ? 0 : 1) || ((x.due || '9') < (y.due || '9') ? -1 : 1); });
    var latest = currentOf(r.tech);
    var canAct = aud === 'tech' ? r.state === 'Open' : (!!latest && latest.id === r.id);
    var body = list.length ? list.map(function (a) { return carryRow(a, r, aud, canAct, since, prev); })
      : [h('p', { class: 'small muted', style: 'margin:0', text: 'No actions carried forward.' })];
    return card('Outstanding actions', 'Carried forward from earlier 1-to-1s' + (prev ? ' – what changed since the ' + monthLabel(prev.month) + ' review' : '') + (canAct ? ' · a follow-up outcome is optional' : ''),
      [h('div', { class: 'carry' }, body)], 'carry-card');
  }
  function carryRow(a, r, aud, canAct, since, prev) {
    var changes = a.history.filter(function (e) { return since && localDate(e.at) >= since && e.kind !== 'created'; });
    var fu = followupsOf(a, r.month, aud === 'tech' ? MY_UPDATES : null), mine = aud === 'tech' ? fu.tech : fu.tl;
    var needsFollow = acOpen(a) && !!since && !changes.length;
    var info = h('div', { class: 'carry-main' }, [
      h('div', null, [h('b', { text: a.text }), ' ', acChip(a), needsFollow ? h('span', { class: 'chip amber', style: 'margin-left:6px', text: 'Follow-up needed' }) : null]),
      h('div', { class: 'small muted', text: (a.fromReview && a.originMonth ? 'From ' + monthLabel(a.originMonth) : 'Added by the ' + lc(L.mgr)) + ' · owner ' + a.owner + ' · deadline ' + dueText(a) }),
      a.status === 'Waiting' ? h('div', { class: 'small', text: 'Waiting on: ' + a.waitingReason }) : null,
      a.latest ? h('div', { class: 'small' }, [h('span', { class: 'muted', text: 'Latest: ' }), clip(a.latest, 140)]) : null,
      prev ? h('div', { class: 'small muted', text: changes.length ? plural(changes.length, 'change') + ' since the ' + monthLabel(prev.month) + ' review: ' + clipText(entryText(changes[changes.length - 1]), 120) : 'No change since the ' + monthLabel(prev.month) + ' review' }) : null,
      fu.tech || fu.tl ? h('div', { class: 'small' }, [fu.tech ? 'Follow-up from ' + (aud === 'tech' ? 'you' : first(r.tech)) + ': ' + outcomeText(fu.tech) + (fu.tech.pending ? ' (being recorded)' : '') : null,
        fu.tech && fu.tl ? ' · ' : null, fu.tl ? 'From ' + (aud === 'tl' ? 'you' : 'your ' + lc(L.mgr)) + ': ' + outcomeText(fu.tl) : null]) : null
    ]);
    var outs = h('div', { class: 'carry-out' });
    if (canAct && acOpen(a)) {
      OUTCOMES.forEach(function (o) {
        if (o.value === 'Ready' && aud === 'tech' && a.ownerRole !== 'tech') { return; }
        var on = !!mine && mine.outcome === o.value;
        outs.appendChild(h('button', { class: 'btn small' + (on ? ' primary' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', text: o.text, onclick: function () {
          if (on) { return; }
          if (aud === 'tech') { techOutcome(a, r, o.value); } else { tlOutcome(a, r, o.value); }
        } }));
      });
    }
    var ups = aud === 'tech' ? myUpdatesFor(a).filter(function (u) { return u.kind === 'followup' && u.month === r.month && u.state !== 'Applied'; }) : [];
    return h('div', { class: 'carry-row' + (acOverdue(a) ? ' od' : '') }, [info, outs, ups.length ? h('div', null, ups.map(updState)) : null]);
  }
  function outcomeText(e) { var o = OUTCOMES.find(function (x) { return x.value === e.outcome; }); return (o ? o.text : e.outcome) + (e.text ? ' – ' + e.text : ''); }
  function techOutcome(a, r, value) {
    function send(msg) { sendUpdate({ id: 0, actionId: a.id, kind: 'followup', outcome: value, message: msg, waitingUntil: '', key: newKey('fu-' + r.month), month: r.month, state: 'Sending', note: '', created: '' }).catch(function () {}); }
    if (value === 'Satisfactory') { send(''); return; }
    var v = { text: '' };
    var box = noteField(value === 'Support' ? 'What support would help? (optional)' : 'Anything to add? (optional)', '', function (x) { v.text = x; }, 2000, 3);
    wide(formBox(value === 'Support' ? 'Further support required' : 'Ready to close', value === 'Ready' ? 'Your ' + lc(L.mgr) + ' is asked to agree the close-out (criteria: ' + (a.criteria || '—') + ').' : null,
      [actSummary(a), box], 'Send', function () { send(v.text.trim()); }));
  }
  function tlOutcome(a, r, value) {
    var v = { text: '', close: true };
    var fields = [actSummary(a)];
    var box = noteField(value === 'Support' ? 'Details (optional)' : 'Note (optional)', '', function (x) { v.text = x; }, 2000, 2);
    if (value === 'Ready') {
      var how = h('select', { 'aria-label': 'Close now or mark ready', onchange: function () { v.close = how.value === 'close'; } },
        [h('option', { value: 'close', text: 'Close it now' }), h('option', { value: 'ready', text: 'Mark ready for close-out' })]);
      fields.push(h('div', null, [h('label', { class: 'field', text: 'What next' }), how]));
    }
    fields.push(box);
    function entry() { return { kind: 'followup', outcome: value, month: r.month, text: v.text.trim() }; }
    if (value === 'Satisfactory') { actionChange(a, {}, [entry()], 'Follow-up recorded.').catch(function () {}); return; }
    wide(formBox(OUTCOMES.find(function (o) { return o.value === value; }).text, null, fields, 'Save', function () {
      if (value === 'Ready' && v.close) {
        return actionChange(a, { Status: 'Closed', ClosedOn: TODAY, DecisionNote: v.text.trim(), WaitingReason: '', WaitingUntil: '' },
          [entry(), { kind: a.status === 'Ready for close-out' ? 'accept' : 'close', text: v.text.trim(), from: a.status, to: 'Closed' }], 'Closed.');
      }
      if (value === 'Ready') { return actionChange(a, { Status: 'Ready for close-out' }, [entry(), { kind: 'status', from: a.status, to: 'Ready for close-out', text: '' }], 'Marked ready for close-out.'); }
      return actionChange(a, {}, [entry()], 'Follow-up recorded.');
    }));
  }
  // where a released review's agreed actions stand in the tracker
  function syncNote(r) {
    if (!V15 || !r.released || !r.fb.actions.length) { return null; }
    if (!r.releasedOn || !TRACKER_START || r.releasedOn < TRACKER_START) { return h('div', { class: 'small muted', text: 'Agreed before action tracking started – kept here as the record of this meeting.' }); }
    var keys = r.fb.actions.map(function (a) { return 'mr' + r.mrId + '-' + a.id; });
    var have = keys.filter(function (k) { return ACTIONS.some(function (x) { return x.key === k; }); }).length;
    if (have === keys.length) { return h('div', { class: 'small ok', text: 'In the action tracker ✓ – progress and close-out are on the Actions page.' }); }
    return h('div', { class: 'small', text: 'Being added to the action tracker (' + have + ' of ' + keys.length + ' so far) – this takes a few minutes after release.' });
  }

  // ---------------------------------------------------------------------------------------------
  // TL amendments: any change after release, or any change to a technician's submitted answers.
  // Each is recorded first (Draft) in the Owners-only 1-to-1 Amendments list, then the review is written, then the
  // record goes to Pending and Flow 8 emails the technician that it was amended (no content). Who and when are
  // SharePoint's own Author and Created.
  // ---------------------------------------------------------------------------------------------
  var AMEND_LABELS = {
    Q1WentWell: 'Q1 What has gone well', Q2Issue: 'Q2 Issue', Q2Impact: 'Q2 Impact', Q2Tried: 'Q2 What was tried', Q2Support: 'Q2 Support needed',
    Q3WorkloadRating: 'Q3 Workload rating', Q3WorkloadComment: 'Q3 Workload comment', Q4WellbeingRaise: 'Q4 Wellbeing (Yes/No)', Q4WellbeingDetail: 'Q4 Wellbeing detail',
    Q5PlanningRaise: 'Q5 Planning (Yes/No)', Q5PlanningDetail: 'Q5 Planning detail', Q6DevRaise: 'Q6 Development (Yes/No)', Q6DevWhat: 'Q6 Development – what',
    Q6DevWhy: 'Q6 Development – why', Q7ManagerFeedback: 'Q7 Feedback for line manager', ExpectationsJson: 'Q8 Self-ratings and comments', Q9FollowUp: 'Q9 Follow-up preference',
    Mood: 'Energy', WinOfMonth: 'Win of the month',
    FB_Q1: 'Feedback on Q1', FB_Q2: 'Feedback on Q2', FB_Q3: 'Feedback on Q3', FB_Q4: 'Feedback on Q4', FB_Q5: 'Feedback on Q5', FB_Q6: 'Feedback on Q6',
    FB_Q7: 'Response to Q7', FB_Q9: 'Comment on Q9', FB_Overall: 'Overall feedback', ExpectationFeedbackJson: 'Q8 Your ratings and feedback',
    FollowUpDecision: 'Follow-up decision', ActionsJson: 'Agreed actions', ActionsStatus: 'Actions status', MeetingDate: '1-to-1 meeting date', NextActionDue: 'Next action deadline'
  };
  var NOTIFY = ['Draft', 'Pending', 'Sending', 'Sent', 'Failed', 'Retry', 'Cancelled'];
  function buildAmendment(x) {
    var ch = safeJson(x.ChangesJson, []);
    return { id: x.ID, reviewId: Number(x.ReviewItemId) || 0, mrId: Number(x.ManagerReviewId) || 0, month: str(x.MonthKey), reason: str(x.Reason),
      fields: str(x.ChangedFields), changes: Array.isArray(ch) ? ch.filter(function (c) { return c && typeof c === 'object' && Object.prototype.hasOwnProperty.call(AMEND_LABELS, c.f); }) : [],
      status: NOTIFY.indexOf(str(x.NotifyStatus)) >= 0 ? str(x.NotifyStatus) : 'Draft', notifiedOn: str(x.NotifiedOn), error: str(x.NotifyError),
      created: str(x.Created), modified: str(x.Modified), by: str(x.Author && x.Author.Title), tech: str(x.Technician && x.Technician.Title) };
  }
  function amendmentsOf(r) { return AMENDMENTS.filter(function (x) { return x.reviewId === r.id; }).sort(function (p, q) { return p.created < q.created ? -1 : 1; }); }
  function amendAge(x, fromChange) { var t = new Date(fromChange && x.modified ? x.modified : x.created).getTime(); return isNaN(t) ? 0 : Date.now() - t; }
  // Every column an amendment can change, with its value now: the review's own columns and the Manager Review's.
  function amendValues(r, answers, fb) {
    var v = { answers: answers, fb: fb, snapshot: r.snapshot }, out = {};
    var t = techFields(v, r.status), m = mgrFields(v), d = mgrDates(v);
    delete t.ReviewStatus;
    Object.keys(t).forEach(function (k) { out['rv:' + k] = String(t[k] === null || t[k] === undefined ? '' : t[k]); });
    Object.keys(m).concat(Object.keys(d)).forEach(function (k) { var x = k in m ? m[k] : d[k]; out['mr:' + k] = String(x === null || x === undefined ? '' : x); });
    return out;
  }
  function amendDiff(r, base) {
    var b = amendValues(r, base.answers, base.fb), a = amendValues(r, r.answers, r.fb);
    return Object.keys(a).filter(function (k) { return a[k] !== b[k]; }).map(function (k) {
      var f = k.slice(3);
      return { l: k.slice(0, 2), f: f, n: AMEND_LABELS[f] || f, b: b[k], a: a[k] };
    });
  }
  // A Draft left behind (the page closed mid-save): has the review got the new values?
  function draftLanded(x) {
    if (AMENDMENTS.some(function (y) { return y.reviewId === x.reviewId && y.created > x.created && y.status !== 'Draft' && y.status !== 'Cancelled'; })) { return false; }
    var r = REVIEWS.find(function (y) { return y.id === x.reviewId; });
    if (!r || !x.changes.length) { return false; }
    var now = amendValues(r, r.answers, r.fb);
    return x.changes.some(function (c) { var k = (c.l === 'mr' ? 'mr:' : 'rv:') + c.f; return k in now && now[k] === String(c.a) && String(c.a) !== String(c.b); });
  }
  function setNotify(x, status, msg) {
    return busy('notify' + x.id, async function () {
      await spUpdate(CONFIG.lists.amendments, x.id, { NotifyStatus: status });
      x.status = status; x.modified = new Date().toISOString();
      toast(msg); render(false);
    }).catch(function () {});
  }
  function amendmentAttention() {
    var items = [];
    AMENDMENTS.forEach(function (x) {
      var who = x.tech || 'a team member', when = monthLabel(x.month), age = amendAge(x), queued = amendAge(x, true);
      if (x.status === 'Failed') {
        items.push({ pri: 1, ico: '✉', btn: 'Resend', text: 'The amendment email to ' + who + ' (' + when + ') couldn\'t be sent' + (x.error ? ': ' + x.error.slice(0, 120) : ''),
          fn: function () { setNotify(x, 'Retry', 'Sending the amendment email again.'); } });
      } else if ((x.status === 'Pending' || x.status === 'Retry' || x.status === 'Sending') && queued > 3600000) {
        items.push({ pri: 2, ico: '✉', btn: 'Resend', text: 'The amendment email to ' + who + ' (' + when + ') hasn\'t been sent yet – check Flow 8 is on',
          fn: function () { setNotify(x, 'Retry', 'Sending the amendment email again.'); } });
      } else if (x.status === 'Draft' && age > 600000) {
        if (draftLanded(x)) {
          items.push({ pri: 1, ico: '✎', btn: 'Send notice', text: 'An amendment to ' + who + '\'s ' + when + ' 1-to-1 was saved but ' + first(who) + ' wasn\'t told yet',
            fn: function () { setNotify(x, 'Pending', first(who) + ' will be emailed that the 1-to-1 was amended.'); } });
        } else {
          items.push({ pri: 2, ico: '✎', btn: 'Dismiss', text: 'An amendment to ' + who + '\'s ' + when + ' 1-to-1 wasn\'t saved – open it and amend again if it is still needed',
            fn: function () {
              confirmBox('Dismiss the unsaved amendment?', 'The 1-to-1 still has its earlier answers. The record stays in the audit, marked Cancelled, and nobody is emailed.', 'Dismiss', function () {
                setNotify(x, 'Cancelled', 'Dismissed.'); });
            } });
        }
      }
    });
    return items;
  }
  function amendStatusChip(x) {
    var cls = { Sent: 'green', Failed: 'red', Draft: 'amber', Cancelled: '' }[x.status];
    var txt = { Draft: 'Not finished', Pending: 'Email queued', Retry: 'Email queued', Sending: 'Sending email', Sent: 'Emailed ' + (x.notifiedOn ? fmtDate(localDate(x.notifiedOn)) : ''), Failed: 'Email failed', Cancelled: 'Cancelled – not saved' }[x.status];
    return h('span', { class: 'chip ' + (cls === undefined ? 'blue' : cls), text: txt });
  }
  function amendHistoryCard(r) {
    var list = amendmentsOf(r);
    if (!list.length) { return null; }
    return card('Amended (' + list.length + ')', 'Restricted audit – only you can see this. ' + r.tech + ' is told it was amended, not what changed.', list.map(function (x) {
      var when = new Date(x.created);
      return h('details', { class: 'amend' }, [
        h('summary', null, [h('b', { text: isNaN(when.getTime()) ? '—' : fmtDate(localDate(x.created)) + ' ' + when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timeZone }) }),
          h('span', { text: ' · ' + (x.by || '—') + ' · ' + (x.fields || x.changes.map(function (c) { return c.n; }).join('; ')) + ' ' }), amendStatusChip(x)]),
        h('div', { class: 'small', style: 'margin:6px 0' }, [h('b', { text: 'Reason: ' }), x.reason || '—']),
        table(['Field', 'Before', 'After'], x.changes.map(function (c) {
          return tr([AMEND_LABELS[c.f] || c.f, h('span', { class: 'amend-val', text: amendShow(c.f, c.b, r) }), h('span', { class: 'amend-val', text: amendShow(c.f, c.a, r) })]);
        }), { empty: 'No details recorded.' })
      ]);
    }));
  }
  // Before/after values in words (JSON columns are shown as readable lines)
  function amendShow(f, v, r) {
    v = String(v === null || v === undefined ? '' : v);
    if (!v) { return '(blank)'; }
    var j = /Json$/.test(f) ? safeJson(v, null) : null;
    if (Array.isArray(j)) {
      if (!j.length) { return '(none)'; }
      return j.filter(function (e) { return e && typeof e === 'object'; }).map(function (e) {
        if (f === 'ActionsJson') { return '• ' + str(e.text) + ' – ' + str(e.owner) + ', due ' + (str(e.due) ? fmtDate(str(e.due)) : '—') + ', ' + str(e.status); }
        var sn = r && r.snapshot.find(function (x) { return String(x.id) === String(e.id); });
        var title = str(e.title) || (sn ? sn.title : 'Expectation');
        return '• ' + title + ': ' + (r15(e.rating) ? r15(e.rating) + ' – ' + PROGRESS[r15(e.rating) - 1].title : 'not rated') + (str(e.comment || e.feedback) ? ' – ' + str(e.comment || e.feedback) : '');
      }).join('\n');
    }
    if (/Date$|Due$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(v)) { return fmtDate(v); }
    if (f === 'Mood') { return moodEmoji(Number(v)); }
    if (f === 'Q3WorkloadRating') { var w = WORKLOAD.find(function (x) { return String(x.value) === v; }); return w ? w.title : v; }
    return v;
  }


  // ---------------------------------------------------------------------------------------------
  // TEAM LEADER – review a technician's month
  // ---------------------------------------------------------------------------------------------
  function managerView() {
    var r = REVIEWS.find(function (x) { return x.id === state.reviewId; });
    if (!r) { return card('Review not found', null, [h('p', { text: 'This review could not be found. It may have been deleted.' })]); }
    if (!r.mrId) { return card('Review record missing', null, [h('p', { text: 'There is no Manager Reviews record for this Monthly Review. Check Flow 1 ran correctly (see the configuration reference).' })]); }
    var a = r.answers, fb = r.fb, has = r.state !== 'Open';
    // Released: read-only unless amending. Submitted (not released): your feedback saves as normal; the answers change only by amending.
    var amending = !!(state.amend && state.amend.id === r.id), canAmend = V14 && (r.released || r.state === 'Submitted');
    var amendTech = amending && r.state !== 'Closed - Not Submitted';
    var editTl = r.released ? amending : !amending, ro = !editTl;
    function ans(text) { return h('div', { class: 'answer' + (text ? '' : ' empty'), text: text || (has ? '(left blank)' : '(not submitted yet)') }); }
    function fbBox(key, label) { return h('div', { style: 'margin-top:10px' }, textBox(label || 'Your feedback', fb[key], function (v) { fb[key] = v; }, ro, 2)); }
    function yn(v, detail) { return has ? (v || '(not answered)') + (v === 'Yes' && detail ? ' – ' + detail : '') : ''; }
    function tb(label, key, rows) { return textBox(label, a[key], function (v) { a[key] = v; }, false, rows || 2); }
    function ynEdit(key, title, details) {
      var box = h('div', { class: 'stack', style: 'gap:8px' }, details);
      box.hidden = a[key] !== 'Yes';   // details are kept only with a Yes, as on the technician's form
      return h('div', { class: 'stack amend-edit', style: 'gap:8px' }, [labelled(ynSeg(a[key], function (v) { a[key] = v; box.hidden = v !== 'Yes'; }), title + ' – ' + L.one + '\'s answer'), box]);
    }
    var wl = WORKLOAD.find(function (w) { return w.value === a.q3; });
    var main = [
      qCard(1, 'What has gone well', null, [amendTech ? tb(L.one + '\'s answer', 'q1', 3) : ans(has ? a.q1 : ''), fbBox('q1')]),
      qCard(2, 'Challenges, blockers and support needed', null, [amendTech
        ? h('div', { class: 'fgrid c4' }, [['Issue', 'issue'], ['Impact', 'impact'], ['Tried', 'tried'], ['Support needed', 'support']].map(function (p) {
          return textBox(p[0], a.q2[p[1]], function (v) { a.q2[p[1]] = v; }, false, 3); }))
        : has && (a.q2.issue || a.q2.impact || a.q2.tried || a.q2.support)
          ? h('div', { class: 'fgrid c4' }, [['Issue', a.q2.issue], ['Impact', a.q2.impact], ['Tried', a.q2.tried], ['Support needed', a.q2.support]].map(function (p) {
            return h('div', null, [h('div', { class: 'small muted', style: 'font-weight:600', text: p[0] }), ans(p[1])]); }))
          : ans(''), fbBox('q2')]),
      qCard(3, 'Workload', null, [amendTech ? h('div', { class: 'stack amend-edit', style: 'gap:8px' }, [choiceGroup('Workload rating', WORKLOAD, a.q3, function (v) { a.q3 = v; }, false, 'c5'), tb('Comment', 'q3c')])
        : ans(has && wl ? wl.title + ' – ' + wl.desc + (a.q3c ? '\n' + a.q3c : '') : ''), fbBox('q3')]),
      qCard(4, 'Wellbeing and support', null, [amendTech ? ynEdit('q4', 'Wellbeing', [tb('Details', 'q4d')]) : ans(yn(a.q4, a.q4d)), fbBox('q4')]),
      qCard(5, 'Upcoming planning', null, [amendTech ? ynEdit('q5', 'Planning', [tb('Details', 'q5d')]) : ans(yn(a.q5, a.q5d)), fbBox('q5')]),
      qCard(6, 'Development, training and aspirations', null, [amendTech ? ynEdit('q6', 'Development', [h('div', { class: 'fgrid c2' }, [tb('What', 'q6what'), tb('Why', 'q6why')])])
        : ans(yn(a.q6, a.q6what ? a.q6what + (a.q6why ? ' (' + a.q6why + ')' : '') : '')), fbBox('q6')]),
      qCard(7, 'Feedback for ' + lc(L.mgr), null, [amendTech ? tb(L.one + '\'s answer', 'q7', 3) : ans(has ? a.q7 : ''), fbBox('q7', 'Your response')]),
      qCard(8, 'Appraisal expectations', h('span', { class: 'small muted', text: 'Your ratings feed the appraisal outlook' }), [r.snapshot.length ? table(['Expectation', L.one, 'Your rating', 'Your feedback'],
        r.snapshot.map(function (e) {
          var x = a.q8.find(function (q) { return String(q.id) === String(e.id); }) || {};
          var lbl = h('div', { class: 'small muted', style: 'margin-top:4px', text: fb.expRating[e.id] ? PROGRESS[fb.expRating[e.id] - 1].title : 'Not rated' });
          var techCell = amendTech
            ? [labelled(ratingSeg(x.rating, function (v) { x.rating = v; refreshSide(); }, false), L.one + '\'s rating for ' + e.title),
              h('div', { style: 'margin-top:6px' }, textBox(null, x.comment, function (v) { x.comment = v; }, false, 2, L.one + '\'s comment for ' + e.title))]
            : has ? [h('div', { style: 'font-weight:650', text: x.rating ? x.rating + ' – ' + PROGRESS[x.rating - 1].title : 'Not rated' }), x.comment ? h('div', { class: 'small', text: x.comment }) : null] : h('span', { class: 'muted', text: '—' });
          return h('tr', null, [
            h('td', { class: 'top', style: 'width:28%' }, [h('div', { style: 'font-weight:650', text: e.title }), h('div', { class: 'small muted', text: e.measures })]),
            h('td', { class: 'top', style: amendTech ? 'width:220px' : 'width:24%' }, techCell),
            h('td', { class: 'top', style: 'width:200px' }, [ratingSeg(fb.expRating[e.id], function (v) { fb.expRating[e.id] = v; lbl.textContent = PROGRESS[v - 1].title; refreshSide(); }, ro), lbl]),
            h('td', { class: 'top' }, textBox(null, fb.exp[e.id], function (v) { fb.exp[e.id] = v; }, ro, 2, 'Your feedback on ' + e.title))
          ]);
        })) : h('p', { class: 'muted', text: 'No expectations were set for this month.' })]),
      qCard(9, 'Follow-up', null, [amendTech ? h('div', { class: 'amend-edit' }, choiceGroup('Follow-up preference', FOLLOW.map(function (f) { return { value: f, title: f }; }), a.q9, function (v) { a.q9 = v; }, false, 'c3'))
        : ans(has ? (L.one + ' preference: ') + (a.q9 || r.mrTechFollowUp || '(not answered)') : ''), fbBox('q9', 'Your comment')]),
      amendTech ? card('Energy and win of the month', L.one + '\'s answers', [h('div', { class: 'stack amend-edit', style: 'gap:10px' }, [
        labelled(seg([{ value: 0, text: 'Not given' }].concat(MOODS.map(function (m) { return { value: m.value, text: m.emo + ' ' + m.label }; })), a.mood || 0, function (v) { a.mood = v || null; refreshSide(); }, false, 'words'), 'Energy'),
        tb('Win of the month', 'win')])]) : null,
      V15 ? carryForwardCard(r, 'tl') : null,
      card('Agreed actions', V15 && r.released ? 'Agreed at this meeting – kept as it was agreed. The tracker is the live record: manage them on the Actions page.'
        : ro ? null : 'Add as many as needed – each needs an owner, close-out criteria and a deadline', [syncNote(r), actionsEditor(r, ro || (V15 && r.released))]),
      card('Overall feedback', null, [textBox(null, fb.overall, function (v) { fb.overall = v; }, ro, 3, 'Overall feedback')]),
      amendHistoryCard(r)
    ].filter(Boolean);
    var canComplete = r.state === 'Submitted' && !amending, canClose = r.state === 'Open' && TODAY > r.due && !r.processing;
    function incompleteActions() { return r.fb.actions.filter(function (ac) { return !ac.text.trim() || !ac.criteria.trim() || !ac.due; }).length; }
    function checkForm() {
      if (badDates(root)) { toast('A date isn\'t recognised – fix the highlighted date first.', true); return false; }
      var n = incompleteActions();
      if (n) {
        markActions(root, r);
        toast(n + ' action' + (n === 1 ? ' is' : 's are') + ' missing the action, close-out criteria or deadline (marked in red).', true);
        return false;
      }
      return true;
    }
    function saveFeedback() {
      if (r.released) { return Promise.resolve(); }   // released: changes go through Amend only
      if (!checkForm()) { return Promise.reject(new Error('incomplete')); }
      return busy('fb', async function () {
        await spUpdate(CONFIG.lists.mgr, r.mrId, mgrFields(r));
        await writeDates(CONFIG.lists.mgr, r.mrId, mgrDates(r));
        dirty = false;
      });
    }
    // Auto-save only before release and never while amending: half-typed text must never reach the technician.
    var mgrStatus = h('span', { class: 'autosave', role: 'status' });
    if (!r.released && !amending && (r.state === 'Open' || r.state === 'Submitted')) {
      autosave.set(function () {
        if (badDates(root)) { return 'skip'; }
        if (incompleteActions()) { markActions(root, r); return 'skip'; }
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
    // Amend: re-read both records so the change starts from what SharePoint holds now
    function startAmend() {
      function go2() {
        busy('amend-start', async function () {
          await autosave.settle();
          var f = await freshReview(r);
          var i = REVIEWS.indexOf(r); if (i >= 0) { REVIEWS[i] = f.review; }
          state.amend = { id: f.review.id, answers: clone(f.review.answers), fb: clone(f.review.fb), rvMod: f.rvMod, mrMod: f.mrMod, state: f.review.state };
          dirty = false; render(false);
        }).catch(function () {});
      }
      if (dirty && !r.released) { saveFeedback().then(go2).catch(function () {}); } else { go2(); }
    }
    function cancelAmend() {
      var base = state.amend;
      function undo() { r.answers = clone(base.answers); r.fb = clone(base.fb); state.amend = null; dirty = false; render(false); }
      if (amendDiff(r, base).length) { confirmBox('Discard this amendment?', 'Nothing has been saved. The 1-to-1 stays as it was.', 'Discard', undo); } else { undo(); }
    }
    function saveAmend() {
      if (!checkForm()) { return; }
      var base = state.amend, changes = amendDiff(r, base);
      if (!changes.length) { toast('Nothing has changed yet.'); return; }
      var info = TECH_INFO[r.tech] || {};
      if (!info.claims) { toast(r.tech + ' isn\'t in Settings → Team, so they can\'t be emailed – add them back first.', true); return; }
      if (!r.released) {
        var mgrOnly = changes.filter(function (c) { return c.l === 'mr'; });
        if (mgrOnly.length === changes.length) { toast('Only your feedback changed – that saves normally until you release. Cancel the amendment and save it.', true); return; }
      }
      var reason = '';
      var names = changes.filter(function (c) { return c.f !== 'ActionsStatus' && c.f !== 'NextActionDue'; }).map(function (c) { return c.n; });
      var box = textBox('Reason (required – kept in the restricted audit, not emailed)', '', function (v) { reason = v; }, false, 3);
      box.input.setAttribute('maxlength', '2000');
      formBox('Save amendment', 'Changing: ' + names.join('; ') + '. ' + first(r.tech) + ' will be emailed that their ' + monthLabel(r.month) + ' 1-to-1 was amended by you (the email doesn\'t include the changes or the reason).',
        [box], 'Save amendment', function () {
          if (!reason.trim()) { box.input.classList.add('invalid'); return 'Please give the reason for the amendment.'; }
          return busy('amend', async function () {
            // 1. nothing changed elsewhere since the amendment started
            var now = await stamps(r);
            if (now.rvMod !== base.rvMod || now.mrMod !== base.mrMod || now.state !== base.state) {
              throw new Error('This 1-to-1 was changed elsewhere since you started amending (if you have just completed it, the release takes a few minutes). Cancel, Refresh, then amend again.');
            }
            // 2. the audit record first, so no change is ever made without one
            var rec = { Title: r.tech + ' – ' + monthLabel(r.month), ReviewItemId: r.id, ManagerReviewId: r.mrId, MonthKey: r.month, Technician: personValue(info.claims),
              Reason: reason.trim(), ChangedFields: names.join('; '), ChangesJson: JSON.stringify(changes.map(function (c) { return { l: c.l, f: c.f, b: c.b, a: c.a }; })), NotifyStatus: 'Draft' };
            if (base.failedAmId) {   // a failed attempt wrote nothing (it passed the check above): close its Draft
              await spUpdate(CONFIG.lists.amendments, base.failedAmId, { NotifyStatus: 'Cancelled' });
              var old = AMENDMENTS.find(function (x) { return x.id === base.failedAmId; }); if (old) { old.status = 'Cancelled'; }
              base.failedAmId = 0;
            }
            var amId = await spCreate(CONFIG.lists.amendments, rec);
            if (!amId) { throw new Error('The amendment record couldn\'t be created – nothing was changed.'); }
            var local = buildAmendment({ ID: amId, ReviewItemId: r.id, ManagerReviewId: r.mrId, MonthKey: r.month, Reason: rec.Reason, ChangedFields: rec.ChangedFields,
              ChangesJson: rec.ChangesJson, NotifyStatus: 'Draft', Created: new Date().toISOString(), Author: { Title: ME }, Technician: { Title: r.tech } });
            AMENDMENTS.push(local);
            // 3. only the columns that changed
            var rv = {}, mr = {}, dates = {};
            changes.forEach(function (c) {
              if (c.l === 'rv') { rv[c.f] = c.f === 'Mood' || c.f === 'Q3WorkloadRating' ? (c.a ? Number(c.a) : '') : c.a; }
              else if (c.f === 'MeetingDate' || c.f === 'NextActionDue') { dates[c.f] = c.a; }
              else { mr[c.f] = c.a; }
            });
            try {
              if (Object.keys(rv).length) { await spUpdate(CONFIG.lists.reviews, r.id, rv); }
              if (Object.keys(mr).length) { await spUpdate(CONFIG.lists.mgr, r.mrId, mr); }
              if (Object.keys(dates).length) { await writeDates(CONFIG.lists.mgr, r.mrId, dates); }
            } catch (e) {
              base.failedAmId = amId;
              throw new Error('The amendment wasn\'t fully saved (' + (e && e.message ? e.message : e) + '). Nobody has been emailed – Refresh and check the 1-to-1; Needs your attention lists it.');
            }
            state.amend = null; dirty = false;
            // 4. queue the email (Flow 8)
            try { await spUpdate(CONFIG.lists.amendments, amId, { NotifyStatus: 'Pending' }); local.status = 'Pending'; }
            catch (e) { toast('Saved, but the email to ' + first(r.tech) + ' isn\'t queued yet – use Send notice in Needs your attention.', true); render(false); return; }
            toast('Amendment saved – ' + first(r.tech) + ' will be emailed that it was amended.'); render(false);
          });
        });
    }
    var buttons;
    if (amending) {
      buttons = [h('button', { class: 'btn primary', type: 'button', text: 'Save amendment…', onclick: saveAmend }),
        h('button', { class: 'btn', type: 'button', text: 'Cancel amendment', onclick: cancelAmend }),
        h('span', { class: 'small muted', text: 'Amending – nothing saves until you click Save amendment.' })];
    } else {
      buttons = [
        r.released ? null : h('button', { class: 'btn', type: 'button', text: 'Save feedback', onclick: function () {
          saveFeedback().then(function () { toast('Saved – not visible to the ' + lc(L.one) + ' until you complete the review.'); }).catch(function () {}); } }),
        canAmend ? h('button', { class: 'btn', type: 'button', text: r.released ? 'Amend…' : 'Amend answers…', title: 'Change this 1-to-1 with a recorded reason – ' + first(r.tech) + ' is emailed that it was amended', onclick: startAmend }) : null,
        r.released ? null : h('button', { class: 'btn primary', type: 'button', text: 'Complete & release', disabled: !canComplete, onclick: function () {
          confirmBox('Complete this review?', 'Your feedback, ratings and actions will be released to ' + r.tech + ' and they will be emailed.', 'Complete & release', function () {
            command('Completed', 'Completed – the feedback is being released.'); });
        } }),
        r.released ? null : h('button', { class: 'btn danger', type: 'button', text: 'Close – not submitted', disabled: !canClose, onclick: function () {
          confirmBox('Close as not submitted?', r.tech + ' will no longer be able to submit this review.', 'Close review', function () {
            command('Closed - Not Submitted', 'Closed.'); });
        } }),
        h('button', { class: 'btn ghost', type: 'button', text: '← Back', onclick: function () { go(state.backTo === 'profile' ? 'profile' : (state.backTo || 'reviews')); } }),
        r.released ? h('span', { class: 'small muted', text: canAmend ? 'Released – read-only. Use Amend to change it.' : 'Released – read-only.' }) : mgrStatus
      ];
    }
    var actions = h('div', { class: 'btn-row' }, buttons.filter(Boolean));
    var head = h('div', { class: 'pagehead sticky' }, [
      h('div', { class: 'ph-l' }, [h('h2', { text: r.tech + ' – ' + monthLabel(r.month) }), chipFor(r),
        amendmentsOf(r).length ? h('span', { class: 'chip', text: 'Amended (' + amendmentsOf(r).length + ')' }) : null,
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
      var followSel = h('select', { id: nid('s'), disabled: ro, onchange: function () { fb.followOverride = followSel.value; markDirty(); } },
        [h('option', { value: '', text: ('Accept ' + lc(L.one) + '\'s preference') })].concat(FOLLOW.map(function (x) { var op = h('option', { value: x, text: x }); op.selected = fb.followOverride === x; return op; })));
      var mid = nid('d'), meeting = dateField(fb.meeting, function (v) { fb.meeting = v; }, '1-to-1 meeting date', { id: mid, badText: fb.meetingRaw, onBad: function (t) { fb.meetingRaw = t; } });
      if (ro) { lockControls(meeting); }
      side.appendChild(h('section', { class: 'card side-tile' }, [h('h3', { text: 'Follow-up decision' }),
        h('div', { class: 'stack', style: 'gap:8px' }, [followSel, h('div', null, [h('label', { class: 'field', for: mid, text: '1-to-1 meeting date (optional)' }), meeting])])]));
    }
    refreshSide();
    var banners = [];
    if (followOf(r) === DEDICATED) { banners.push(h('div', { class: 'banner amber', text: 'Dedicated 1-to-1 discussion requested' })); }
    if (amending) {
      banners.push(h('div', { class: 'banner amber', text: 'Amending ' + first(r.tech) + '\'s ' + monthLabel(r.month) + ' 1-to-1. ' + (r.released ? 'Their answers and your feedback can be changed.' : 'Their answers can be changed; your feedback stays as saved.') +
        ' When you save, you give a reason, the before and after are kept in a restricted audit, and ' + first(r.tech) + ' is emailed that it was amended. Nothing saves automatically.' }));
    } else if (r.released) {
      banners.push(h('div', { class: 'banner info', text: canAmend ? ('Released – ' + first(r.tech) + ' can see this. To change anything, click Amend: you give a reason, the change is kept in a restricted audit and ' + first(r.tech) + ' is emailed that it was amended.')
        : 'Released – read-only. Changing a released 1-to-1 needs solution 1.4: run 0 Setup (1.4), then Refresh.' }));
    }
    return h('div', null, [head, h('div', { class: 'layout' }, [h('div', { class: 'stack' + (amending ? ' amending' : '') }, banners.concat(main)), h('aside', { class: 'side-sticky' }, side)])]);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function lockControls(el) { Array.prototype.forEach.call(el.querySelectorAll('input, button, select, textarea'), function (c) { c.disabled = true; }); return el; }
  // Modified stamps and the trusted state, to refuse an amendment over a change made elsewhere
  async function stamps(r) {
    var a = await req('GET', listPath(CONFIG.lists.reviews) + '/items(' + Number(r.id) + ')?$select=Modified');
    var b = await req('GET', listPath(CONFIG.lists.mgr) + '/items(' + Number(r.mrId) + ')?$select=Modified,ReviewState');
    if (!a.ok || !a.json || !b.ok || !b.json) { throw new Error('Couldn\'t re-read this 1-to-1 ' + errText(a.ok ? b : a)); }
    return { rvMod: str(a.json.Modified), mrMod: str(b.json.Modified), state: str(b.json.ReviewState) };
  }
  async function freshReview(r) {
    var a = await req('GET', listPath(CONFIG.lists.reviews) + '/items(' + Number(r.id) + ')?$select=' + REV_FIELDS + (V14 ? REV_V14_FIELDS : '') + ',Modified&$expand=Technician');
    var b = await req('GET', listPath(CONFIG.lists.mgr) + '/items(' + Number(r.mrId) + ')?$select=' + MR_FIELDS + ',Modified&$expand=Technician');
    if (!a.ok || !a.json || !b.ok || !b.json) { throw new Error('Couldn\'t re-read this 1-to-1 ' + errText(a.ok ? b : a)); }
    var f = buildReview(a.json, b.json, r.tech);
    if (!(f.released || f.state === 'Submitted')) { throw new Error('This 1-to-1 is no longer submitted – Refresh the page.'); }
    return { review: f, rvMod: str(a.json.Modified), mrMod: str(b.json.Modified) };
  }
  // Marks the empty parts of incomplete action rows in red (cleared as each is filled)
  function markActions(root, r) {
    var rows = root.querySelectorAll('.acrow');
    r.fb.actions.forEach(function (ac, i) {
      if (!rows[i]) { return; }
      [['input[aria-label="Action"]', !ac.text.trim()], ['input[aria-label="Close-out criteria"]', !ac.criteria.trim()], ['input.datef', !ac.due]].forEach(function (p) {
        var el = rows[i].querySelector(p[0]);
        if (el) { el.classList.toggle('invalid', p[1]); if (p[1]) { el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('aria-invalid'); } }
      });
    });
  }
  function clearInvalid(el) { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); }
  function actionsEditor(r, readOnly) {
    var wrap = h('div');
    function draw() {
      wrap.textContent = '';
      if (readOnly) { wrap.appendChild(actionsTable(r.fb.actions.map(function (ac) { return { ac: ac, r: r }; }), {})); return; }
      wrap.appendChild(h('div', { class: 'acgrid achead' }, ['#', 'Action', 'Owner', 'Deadline', 'Status', ''].map(function (x) { return h('span', { text: x }); })));
      if (!r.fb.actions.length) { wrap.appendChild(h('div', { class: 'muted small', style: 'padding:8px 10px', text: 'No actions yet.' })); }
      r.fb.actions.forEach(function (ac, i) {
        var t = h('input', { type: 'text', 'aria-label': 'Action', maxlength: '300' }); t.value = ac.text; t.addEventListener('input', function () { ac.text = t.value; if (t.value.trim()) { clearInvalid(t); } markDirty(); });
        var owners = [r.tech, L.mgr];
        if (ac.owner && owners.indexOf(ac.owner) < 0) { owners.push(ac.owner); }
        var ow = h('select', { 'aria-label': 'Owner' }, owners.map(function (v) { var o = h('option', { value: v, text: v }); o.selected = ac.owner === v; return o; }));
        ow.addEventListener('change', function () { ac.owner = ow.value; ac.ownerRole = ow.selectedIndex === 1 ? 'tl' : (ow.value === r.tech ? 'tech' : ac.ownerRole); markDirty(); });
        var cr = h('input', { type: 'text', 'aria-label': 'Close-out criteria', maxlength: '500' }); cr.value = ac.criteria; cr.addEventListener('input', function () { ac.criteria = cr.value; if (cr.value.trim()) { clearInvalid(cr); } markDirty(); });
        var du = dateField(ac.due, function (v) { ac.due = v; if (v) { clearInvalid(du.querySelector('input.datef')); } }, 'Deadline');
        var st = h('select', { 'aria-label': 'Status' }, ['Open', 'Closed'].map(function (v) { var o = h('option', { value: v, text: v }); o.selected = ac.status === v; return o; }));
        st.addEventListener('change', function () { ac.status = st.value; ac.closedOn = st.value === 'Closed' ? TODAY : ''; markDirty(); });
        wrap.appendChild(h('div', { class: 'acgrid acrow' }, [h('b', { class: 'num', text: String(i + 1) }), t, ow, du, st,
          h('button', { class: 'btn small ghost', type: 'button', text: '✕', 'aria-label': 'Remove action', onclick: function () { r.fb.actions.splice(i, 1); markDirty(); draw(); } }),
          h('div', { class: 'crit' }, [h('span', { text: 'Close-out criteria' }), cr])]));
      });
      wrap.appendChild(h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', text: '+ Add action', onclick: function () {
        r.fb.actions.push({ id: String(Date.now()) + String(Math.floor(Math.random() * 1000)), text: '', owner: r.tech, ownerRole: 'tech', criteria: '', due: '', status: 'Open', closedOn: '' });
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
  // The next wellbeing date: the one the Team Leader keeps in Settings → Team (1.4). Before Setup 1.4, the last assessment's.
  function wbNextDue(t) {
    if (V14) { return (TECH_INFO[t] && TECH_INFO[t].nextWellbeing) || ''; }
    var last = wbLastCompleted(t);
    return last ? last.nextReview || '' : '';
  }
  function wellbeingAttention() {
    if (!IS_TL || !WB_AVAILABLE) { return []; }
    var items = [];
    TECHS.forEach(function (t) {
      var open = wbOpenOne(t), last = wbLastCompleted(t), next = wbNextDue(t);
      var go1 = function (w) { return function () { go('wb', { wbId: w.id }); }; };
      if (open && wbState(open) === 'Submitted') { items.push({ pri: 1, ico: '💚', text: t + '\'s wellbeing assessment is ready for your review', btn: 'Open', fn: go1(open) }); }
      if (next && !open) {
        var d = daysBetween(TODAY, next);
        if (d < 0) { items.push({ pri: 2, ico: '💚', text: t + '\'s wellbeing assessment is overdue (due ' + fmtDate(next) + ')', btn: 'Start', fn: function () { startWellbeing(t); } }); }
        else if (d <= 14) { items.push({ pri: 2, ico: '💚', text: t + '\'s wellbeing assessment is due in ' + plural(d, 'day') + ' (' + fmtDate(next) + ')', btn: 'Start', fn: function () { startWellbeing(t); } }); }
      }
      if (V14 && !next) {
        if (last && last.nextReview) {
          // a date from an earlier assessment – used only if the Team Leader says so
          items.push({ pri: 3, ico: '💚', text: 'No next wellbeing date set for ' + t + ' – their last assessment says ' + fmtDate(last.nextReview), btn: 'Use it',
            fn: function () { busy('wbdate', async function () { await setWellbeingDate(t, last.nextReview); toast(t + ': next wellbeing date set to ' + fmtDate(last.nextReview) + '.'); render(false); }).catch(function () {}); } });
        } else {
          items.push({ pri: 3, ico: '💚', text: 'No next wellbeing date set for ' + t, btn: 'Set date', fn: function () { openSettings('team'); } });
        }
      } else if (!V14 && !open && (!last || (!last.nextReview && daysBetween(last.completedOn || last.date || TODAY, TODAY) > 365))) {
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
    var none = TECHS.filter(function (t) { var n = wbNextDue(t); return !wbOpenOne(t) && n && daysBetween(TODAY, n) < 0; });
    var due = TECHS.filter(function (t) { var n = wbNextDue(t); return n && daysBetween(TODAY, n) >= 0 && daysBetween(TODAY, n) <= 30 && !wbOpenOne(t); });
    var unset = TECHS.filter(function (t) { return !wbNextDue(t); });
    var tiles = h('div', { class: 'tiles t4' }, [
      tile('Ready for your review', String(submitted.length), 'Submitted by the person', submitted.length ? 'warn' : ''),
      tile('Being completed', String(withThem.length), 'Waiting for the person'),
      tile('Due in 30 days', String(due.length), 'Next wellbeing date coming up', due.length ? 'warn' : ''),
      tile('Overdue', String(none.length), unset.length ? unset.length + ' with no date set' : 'Next wellbeing date passed', none.length ? 'bad' : (unset.length ? 'warn' : ''))
    ]);
    var rows = TECHS.map(function (t) {
      var last = wbLastCompleted(t), open = wbOpenOne(t), next = wbNextDue(t), d = next ? daysBetween(TODAY, next) : null;
      return tr([h('b', { text: t }), last ? fmtDate(last.completedOn || last.date) : 'Never',
        open ? wbChip(open) : h('span', { class: 'muted', text: '—' }),
        next ? h('span', { class: d < 0 ? 'overdue' : '', text: fmtDate(next) + (d < 0 ? ' – overdue' : d <= 30 ? ' (' + (d ? plural(d, 'day') : 'today') + ')' : '') })
          : h('span', { class: 'muted', text: 'Not set' }),
        h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' }, [
          open ? h('button', { class: 'btn small primary', type: 'button', text: 'Open', onclick: function () { go('wb', { wbId: open.id }); } })
            : h('button', { class: 'btn small', type: 'button', text: '+ Start', onclick: function () { startWellbeing(t); } }),
          last ? h('button', { class: 'btn small ghost', type: 'button', text: 'Last one', onclick: function () { go('wb', { wbId: last.id }); } }) : null])]);
    });
    var all = WELLBEING.slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    var guide = h('details', { class: 'how' }, [h('summary', { text: 'ⓘ Guidance for ' + lc(L.mgr) + 's' })].concat(WB_INTRO_MGR.map(function (p) { return h('p', { text: p }); })).concat([h('p', { text: WB_STRESS })]));
    return h('div', { class: 'stack' }, [tiles,
      card('Team wellbeing', 'Next dates are set in ⚙ Settings → Team · only you and each person can see their assessment', [guide,
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
    var marks = [];   // required controls on the current step: orange until answered, red after a blocked Submit
    function mark(el, missFn) { marks.push({ el: el.input || el, miss: missFn }); return el; }
    function applyMarks() {
      var se = !!state.wbShowErr;
      marks.forEach(function (m) {
        var x = m.miss();
        m.el.classList.toggle('need', x && !se); m.el.classList.toggle('invalid', x && se);
        if (x && se) { m.el.setAttribute('aria-invalid', 'true'); } else { m.el.removeAttribute('aria-invalid'); }
      });
    }
    function draw() {
      nav.textContent = ''; area.textContent = ''; marks = [];
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
          var issueWrap = h('div', { class: 'wbcol' }, [h('span', { class: 'wblab', text: 'Is it an issue?' }), mark(seg(WB_YNA, a.issue, function (v) { a.issue = v; helpBox.hidden = v !== 'Y'; drawNav(); }, false, true), function () { return a.app === 'Y' && !a.issue; })]);
          helpBox.hidden = a.issue !== 'Y'; issueWrap.style.visibility = a.app === 'Y' ? '' : 'hidden';   // keep the column in place
          var appSeg = seg(WB_YNA, a.app, function (v) {
            a.app = v; if (v !== 'Y') { a.issue = 'NA'; helpBox.hidden = true; } else if (a.issue === 'NA') { a.issue = ''; }
            issueWrap.style.visibility = v === 'Y' ? '' : 'hidden'; if (v === 'Y') { var ib = issueWrap.querySelector('.seg'); Array.prototype.forEach.call(ib.children, function (c) { c.setAttribute('aria-pressed', 'false'); c.setAttribute('aria-checked', 'false'); }); }
            drawNav();
          }, false, true);
          mark(appSeg, function () { return !a.app; });
          return h('div', { class: 'wbq' }, [h('div', { class: 'wbq-t' }, [h('span', { class: 'qnum', text: String(qi + 1) }), h('span', { text: q[1] })]),
            h('div', { class: 'wbq-a' }, [h('div', { class: 'wbcol' }, [h('span', { class: 'wblab', text: 'Does this apply to you?' }), appSeg]), issueWrap]), helpBox]);
        }))));
      } else if (cur.k === 'you') {
        var p = w.personal;
        var circBox = h('div', { class: 'stack', style: 'gap:10px;margin-top:10px' }, WB_PERSONAL.map(function (f) {
          var tb = textBox(f[1], p[f[0]], function (v) { p[f[0]] = v; drawNav(); }, false, 2);
          return f[0] === 'circKnow' ? mark(tb, function () { return p.circ === 'Yes' && !p.circKnow.trim(); }) && tb : tb;
        }));
        circBox.hidden = p.circ !== 'Yes';
        area.appendChild(card('My circumstances', 'Life events or ongoing situations that may affect you at work', [
          h('p', { class: 'small muted', text: 'For example a medical condition, carer duties or another situation. This can change from time to time as life events occur – marriage, divorce, a birth, a bereavement – or it may be ongoing.' }),
          h('div', { class: 'q-head' }, [h('h3', { text: 'Do you have things that may affect you at work that may have an impact?' }), mark(ynSeg(p.circ || null, function (v) { p.circ = v; circBox.hidden = v !== 'Yes'; drawNav(); }), function () { return !p.circ; })]), circBox]));
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
      drawNav();
    }
    function drawNav() {
      Array.prototype.forEach.call(nav.children, function (b, i) {
        var st2 = steps[i], ok = done(st2) && st2.k !== 'start';
        b.classList.toggle('ok', ok); b.textContent = (ok ? '✓ ' : '') + st2.t;
        b.classList.toggle('miss', !!state.wbShowErr && !ok && st2.k !== 'start' && st2.k !== 'finish');
      });
      applyMarks();
    }
    function submit() {
      var miss = wbMissing(w);
      if (miss.length) {
        state.wbShowErr = true;
        toast('Please answer the questions marked in red: ' + miss.join(', '), true);
        var first = steps.findIndex(function (st2) { return st2.k !== 'start' && st2.k !== 'finish' && !done(st2); });
        if (first >= 0) { goStep(first); }
        return;
      }
      confirmBox('Submit your wellbeing assessment?', 'Your ' + lc(L.mgr) + ' will be told it is ready and will go through it with you. You can\'t change it afterwards.', 'Submit', function () {
        save('Submitted').then(function () { w.rawStatus = 'Submitted'; state.wbStep = 0; state.wbShowErr = false; toast('Submitted – thank you.'); render(false); }).catch(function () {});
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
    // 1.4: the next date is the one in Settings → Team, and is only changed when the Team Leader chooses to change it
    var notes = w.notes, date = w.date, next = V14 ? (wbNextDue(w.tech) || w.nextReview || '') : (w.nextReview || (st === 'Submitted' ? oneYearOn(date || TODAY) : ''));
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
    function saveAll(complete, chosenNext) {
      if (complete && V14) { next = chosenNext; }
      if (badDates(root)) { toast('A date isn\'t recognised – fix the highlighted date first.', true); return; }
      if (arr.some(function (a) { return !a.text.trim(); })) { toast('Each arrangement needs a description (or remove the empty one).', true); return; }
      busy('wb', async function () {
        await spUpdate(CONFIG.lists.wellbeing, w.id, { ArrangementsJson: JSON.stringify(arr), ManagerNotes: notes });
        await writeDates(CONFIG.lists.wellbeing, w.id, { NextReviewDate: next || '', AssessmentDate: date || '' });
        w.arrangements = arr; w.notes = notes; w.nextReview = next; w.date = date; dirty = false;
        if (V14 && (next || '') !== wbNextDue(w.tech)) { await setWellbeingDate(w.tech, next || ''); }
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
      children.push(h('div', null, [h('label', { class: 'field', for: nid1, text: V14 ? 'Next wellbeing assessment' : 'Next review date' }), dateField(next, function (v) { next = v; }, 'Next review date', { id: nid1 }),
        h('div', { class: 'small muted', style: 'margin-top:3px', text: V14 ? 'The same date as in Settings → Team – changing it here changes it there. You\'re emailed a week before, on the day and weekly if overdue.'
          : 'Once a year by default – bring it forward if you feel one is needed sooner. You\'re emailed a week before it is due.' })]));
    }
    children.push(h('div', { class: 'btn-row' }, [h('button', { class: 'btn', type: 'button', text: can ? 'Save' : 'Save meeting date', onclick: function () { saveAll(false); } }),
      st === 'Submitted' ? h('button', { class: 'btn primary', type: 'button', text: 'Complete', onclick: function () {
        if (!V14) {
          confirmBox('Complete this wellbeing assessment?', w.tech + ' will be emailed that the agreed record is ready to view. You can still update arrangements later (e.g. at the review).', 'Complete', function () { saveAll(true); });
          return;
        }
        // the next date is never changed silently: the Team Leader confirms it (or sets a new one) as part of completing
        var cur = wbNextDue(w.tech), chosen = next || cur, fid = nid('wbnx');
        formBox('Complete ' + first(w.tech) + '\'s wellbeing assessment', w.tech + ' will be emailed that the agreed record is ready to view.', [
          h('div', null, [h('label', { class: 'field', for: fid, text: 'Next wellbeing assessment' }), dateField(chosen, function (v) { chosen = v; }, 'Next wellbeing assessment', { id: fid, noDirty: true }),
            h('div', { class: 'small muted', style: 'margin-top:3px', text: cur ? 'Currently ' + fmtDate(cur) + ' in Settings → Team. Keep it, or change it.' : 'No date set yet – a year on would be ' + fmtDate(oneYearOn(date || TODAY)) + '.' })])
        ], 'Complete', function () {
          if (badDates(root)) { return 'The date isn\'t recognised.'; }
          if (!chosen) { return 'Choose the next wellbeing assessment date.'; }
          if (chosen <= TODAY) { return 'The next assessment must be after today.'; }
          saveAll(true, chosen);
        });
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
        h('div', null, [h('span', { text: 'Employee number' }), h('b', { text: w.empNo })]), h('div', null, [h('span', { text: L.mgr }), h('b', { text: IS_TL ? ME : '' })])]),
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
    memberNames().forEach(function (t) { var i = TECH_INFO[t]; dates[t] = { ap: apDateOf(t), wb: i.nextWellbeing || '', start: i.cycleStart || '' }; });
    function dateChanged(t) { var i = TECH_INFO[t], d = dates[t]; return d.ap !== (apDateOf(t) || '') || d.wb !== (i.nextWellbeing || '') || d.start !== (i.cycleStart || ''); }
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
      return memberNames().some(dateChanged) || badDates(back) ||
        JSON.stringify(bands.map(function (b) { return [b.max, b.name]; })) !== JSON.stringify(SETTINGS.bands.map(function (b) { return [b.max, b.name]; })) ||
        rem.join(',') !== SETTINGS.reminders.join(',') || ['app', 'mgr', 'one', 'many'].some(function (k) { return labels[k] !== L[k]; });
    }
    function close() {
      if (unsaved() && !window.confirm('Close Settings without saving your changes?')) { return; }
      back.remove(); if (teamChanged) { render(false); }
    }
    function markCompleted(t) {
      var info = TECH_INFO[t], b = boundariesOf(t), cur = b.length ? b[b.length - 1] : '', last = (info.history || []).slice(-1)[0];
      var done = '', next = '';
      var cid = nid('d'), nid2 = nid('d');
      var fields = [
        h('div', null, [h('label', { class: 'field', for: cid, text: 'Date the appraisal was actually completed' }), dateField('', function (v) { done = v; }, 'Completion date', { id: cid, noDirty: true })]),
        h('div', null, [h('label', { class: 'field', for: nid2, text: 'Next appraisal due' }), dateField('', function (v) { next = v; }, 'Next appraisal date', { id: nid2, noDirty: true })]),
        h('p', { class: 'small muted', text: 'This closes the current period (its reviews and ratings stay in its history and its report) and starts a new one with no ratings yet.' })
      ];
      formBox('Mark ' + t + '\'s appraisal completed', cur ? 'Current period started ' + fmtDate(cur) + '.' : 'No period start has been set yet – earlier reviews are kept together as one earlier period.', fields, 'Record completion', function () {
        if (!done || !next) { return 'Enter both dates.'; }
        if (badDates(root)) { return 'A date isn\'t recognised.'; }
        if (done > TODAY) { return 'The completion date can\'t be in the future.'; }
        var correction = last && last.completed.slice(0, 7) === done.slice(0, 7);
        var floor = correction ? last.start : cur;
        if (floor && done.slice(0, 7) <= floor.slice(0, 7)) { return 'The completion must be in a later month than the start of the period (' + fmtDate(floor) + ') – to correct the start, change the period start instead.'; }
        if (next <= done) { return 'The next appraisal must be after the completion date.'; }
        return new Promise(function (resolve, reject) {
          confirmBox('Record ' + t + '\'s appraisal as completed on ' + fmtDate(done) + '?',
            (correction ? 'This replaces the completion already recorded for ' + monthLabel(done.slice(0, 7)) + '. ' : '') +
            'Reviews up to ' + monthLabel(done.slice(0, 7)) + ' stay in the period that ends here. The new period starts with ' +
            monthLabel(addMonths(done.slice(0, 7), 1)) + ', and the next appraisal is due ' + fmtDate(next) + '.', 'Record completion', function () {
              busy('cycle', async function () {
                await recordCompletion(t, done, next);
                dates[t].ap = next; dates[t].start = done; teamChanged = true;
                toast(t + ': appraisal completed ' + fmtDate(done) + ' – new period started.'); draw();
              }).then(resolve, reject);
            });
        });
      });
    }
    function undoCompleted(t) {
      var last = (TECH_INFO[t].history || []).slice(-1)[0];
      if (!last) { return; }
      confirmBox('Undo the completion recorded for ' + fmtDate(last.completed) + '?', 'The period that started then is joined back onto the one before. No reviews or ratings are changed.' + (last.prevDue && apDateOf(t) === last.nextDue ? ' The next appraisal date goes back to ' + fmtDate(last.prevDue) + '.' : ' Check the next appraisal date afterwards.'), 'Undo', function () {
        busy('cycle', async function () {
          await undoCompletion(t);
          dates[t].start = TECH_INFO[t].cycleStart || ''; dates[t].ap = TECH_INFO[t].appraisal || ''; teamChanged = true;
          toast('Completion removed.'); draw();
        }).catch(function () {});
      });
    }
    // ---- Team
    function teamTab() {
      var out = [];
      out.push(h('p', { class: 'small muted', style: 'margin:0 0 10px', text: 'Everyone in this list gets a monthly 1-to-1 while Active. Adding someone gives them access to the 1-to-1 page within about 5 minutes; their first review is created at 07:00 the next morning (or run Flow 1 now). Deactivating stops new reviews and removes their access to the page; their records are kept.' }));
      var names = memberNames();
      if (!V14) { out.push(h('div', { class: 'banner amber', text: 'Run "ESG 1-to-1 | 0 Setup" again (solution 1.4) to add the wellbeing date and appraisal periods. Until then only the appraisal date can be set here.' })); }
      out.push(table(V14 ? [L.one, 'Status', 'Next appraisal', 'Days to go', 'Next wellbeing', 'Appraisal period', '']
        : [L.one, 'Status', 'Appraisal date', 'Days to go', ''], names.map(function (t) {
        var info = TECH_INFO[t], d = dates[t];
        var daysTd = h('td'), perTd = h('td', { class: 'small' });
        function upd() {
          apDaysCell(daysTd, d.ap || '');
          if (!V14) { return; }
          perTd.textContent = '';
          var hist = info.history || [];
          if (hist.length) {
            perTd.appendChild(h('div', { text: 'Since ' + fmtDate(info.cycleStart || hist[hist.length - 1].completed) }));
            perTd.appendChild(h('div', { class: 'muted', text: 'Last appraisal completed ' + fmtDate(hist[hist.length - 1].completed) }));
          } else {
            perTd.appendChild(h('div', { class: 'small muted', text: 'Period start', title: 'The date their last appraisal was completed. Editable until the first completion is recorded here.' }));
            perTd.appendChild(dateField(d.start, function (v) { d.start = v; }, 'Appraisal period start for ' + t, { noDirty: true }));
          }
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
        var tools = h('div', { class: 'stack', style: 'gap:6px;align-items:stretch;min-width:170px' }, [
          V14 ? h('button', { class: 'btn small', type: 'button', text: 'Mark appraisal completed…', onclick: function () { markCompleted(t); } }) : null,
          V14 && (info.history || []).length ? h('button', { class: 'btn small ghost', type: 'button', text: 'Undo last', title: 'Undo the last recorded completion', onclick: function () { undoCompleted(t); } }) : null,
          toggle]);
        var nameTd = h('td', null, [h('div', { style: 'font-weight:600', text: t }), h('div', { class: 'small muted', text: info.email || '—' })]);
        var status = h('td', null, h('span', { class: 'chip ' + (info.active ? 'green' : ''), text: info.active ? 'Active' : 'Inactive' }));
        var apTd = h('td', { style: 'min-width:170px' }, dateField(d.ap, function (v) { d.ap = v; upd(); }, 'Next appraisal date for ' + t, { noDirty: true }));
        if (!V14) { return h('tr', { class: info.active ? null : 'retired' }, [nameTd, status, apTd, daysTd, h('td', null, toggle)]); }
        var wbTd = h('td', { style: 'min-width:170px' }, dateField(d.wb, function (v) { d.wb = v; }, 'Next wellbeing assessment date for ' + t, { noDirty: true }));
        return h('tr', { class: info.active ? null : 'retired' }, [nameTd, status, apTd, daysTd, wbTd, perTd, h('td', null, tools)]);
      }), { empty: 'Nobody yet – add the first person below.' }));
      out.push(h('p', { class: 'small muted', text: 'Dates never move by themselves. Change the next appraisal or wellbeing date here whenever it is brought forward or put back – it never changes which period a monthly 1-to-1 belongs to. When an appraisal has actually happened, use "Mark appraisal completed…" to start the new period.' }));
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
          preview.textContent = rem.length ? 'Reminders on the ' + remindersText(rem) + ' of each month.' : 'No reminders will be sent.';
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
      var lateStart = memberNames().filter(function (t) { return dates[t].start && dates[t].start > TODAY; })[0];
      if (lateStart) { cur = 'team'; draw(); toast(lateStart + ': the period start is the date their last appraisal was done, so it can\'t be in the future.', true); return; }
      busy('settings', async function () {
        var problems = [];
        var names = memberNames();
        for (var k = 0; k < names.length; k++) {
          var t = names[k], d = dates[t], info = TECH_INFO[t];
          if (!dateChanged(t)) { continue; }
          try {
            if (d.ap !== (apDateOf(t) || '')) {
              await writeDates(CONFIG.lists.techs, info.itemId, { AppraisalDate: d.ap });
              info.appraisal = d.ap;
              var cr = currentOf(t);
              // not while a submission waits for Flow 2: it times the submission from the item's last change
              if (cr && !cr.processing) { await writeDates(CONFIG.lists.reviews, cr.id, { AppraisalDate: d.ap }); cr.appraisalDate = d.ap; }
            }
            if (V14 && d.wb !== (info.nextWellbeing || '')) { await setWellbeingDate(t, d.wb); }
            if (V14 && d.start !== (info.cycleStart || '') && !(info.history || []).length) {
              await writeDates(CONFIG.lists.techs, info.itemId, { AppraisalCycleStart: d.start });
              info.cycleStart = d.start;
              await writeBoundaries(t);
            }
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
  function reportDoc(tech, aud, idx) {
    var o = expectedOutcome(tech, aud, periodFor(tech, idx)), p = o.period;
    var prs = periodReviews(tech, p).filter(function (r) { return r.month <= CUR; });
    var subs = prs.filter(isIn), ot = onTimeOf(tech, p), counts = periodCounts(tech, p, aud);
    var acts = actionsForPeriod(tech, p, aud);
    var sorted = o.perExp.filter(function (x) { return x.latest; }).slice().sort(function (x, y) { return y.latest - x.latest; });
    var words = aud !== 'tl', fa = focusAreas(o);
    function rl(v) { return words ? PROGRESS[v - 1].title : v + ' – ' + PROGRESS[v - 1].title; }
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
        h('div', null, [h('span', { text: p.closed ? 'Appraisal completed' : 'Appraisal date' }), h('b', { text: p.closed ? fmtDate(p.endDate) : p.set ? fmtDate(p.apDate) : 'Not set' })]),
        h('div', null, [h('span', { text: 'Period covered' }), h('b', { text: periodLabel(p) })]),
        h('div', null, [h('span', { text: 'Reviews in the period' }), h('b', { text: countsText(counts) })]),
        h('div', null, [h('span', { text: 'Prepared for' }), h('b', { text: aud === 'tl' ? L.mgr : tech + ' (self)' })]),
        h('div', null, [h('span', { text: 'Generated' }), h('b', { text: fmtDate(TODAY) })]),
        h('div', null, [h('span', { text: 'Monthly reviews submitted' }), h('b', { text: subs.length + (ot.total ? ' (' + ot.onTime + ' on time)' : '') })]),
        h('div', null, [h('span', { text: 'Agreed actions' }), h('b', { text: acts.length + ' (' + acts.filter(function (x) { return acOpen(x.ac); }).length + ' open)' })])
      ]),
      rsec('1. Summary', [
        h('div', { class: 'rsum' }, [
          h('div', null, [h('span', { text: 'Expected outcome' }), bandChip(o.projected, true)])
        ].concat(words ? [
          h('div', null, [h('span', { text: 'Where you are now' }), bandChip(o.current)]),
          h('div', null, [h('span', { text: 'Trend' }), h('b', { text: trendWord(o) })])
        ] : [
          h('div', null, [h('span', { text: 'Projected at appraisal' }), h('b', { text: f1(o.projected) + ' / 5' })]),
          h('div', null, [h('span', { text: 'Current position' }), h('b', { text: f1(o.current) + ' / 5' })]),
          h('div', null, [h('span', { text: ('Self vs ' + L.mgr) }), h('b', { text: f1(o.selfAvg) + ' vs ' + f1(o.tlAvg) })])
        ])),
        h('div', { class: 'fgrid c2', style: 'margin-top:12px' }, [
          h('div', null, [h('h3', { text: 'Strongest areas' }), h('ul', null, sorted.slice(0, Math.min(2, Math.ceil(sorted.length / 2))).map(function (x) { return h('li', { text: x.e.title + ' (' + rl(x.latest) + ')' }); }))]),
          h('div', null, [h('h3', { text: 'Areas to focus on' }), focusBlock(fa, !words) || h('p', { class: 'muted', text: 'Not enough ratings yet.' })])
        ]),
        h('h3', { text: 'Rating trend' }), trendChart(tech, o, 210, words)
      ]),
      rsec('2. Appraisal expectations', o.perExp.length ? o.perExp.map(function (x) {
        return h('div', null, [
          h('div', { class: 'exphead' }, [h('h3', { text: x.e.title }), h('span', { class: 'small', text: 'Latest: self ' + (x.latestSelf ? (words ? PROGRESS[x.latestSelf - 1].title : x.latestSelf) : '—') + (' · ' + L.mgr + ' ') + (x.latestTl ? (words ? PROGRESS[x.latestTl - 1].title : x.latestTl) : '—') })]),
          h('div', { class: 'small muted', text: 'Measure: ' + x.e.measures }),
          rtable(['Month', 'Self', L.mgr, (L.one + ' evidence'), (L.mgr + ' feedback')], x.hist.map(function (hh) {
            return [monthShort(hh.month), hh.self ? (words ? PROGRESS[hh.self - 1].title : String(hh.self)) : '', hh.tl ? (words ? PROGRESS[hh.tl - 1].title : String(hh.tl)) : '', hh.comment, hh.fb];
          }))
        ]);
      }) : [h('p', { class: 'muted', text: 'No expectations.' })]),
      rsec('3. Achievements', [rtable(['Month', 'Win of the month', 'What went well'], subs.map(function (r) { return [monthLabel(r.month), r.answers.win, r.answers.q1]; }))]),
      rsec('4. Development and training', [rtable(['Month', 'Requested', 'Why'], subs.filter(function (r) { return r.answers.q6 === 'Yes'; }).map(function (r) { return [monthLabel(r.month), r.answers.q6what, r.answers.q6why]; }))]),
      rsec('5. Challenges and support', [rtable(['Month', 'Issue', 'Impact', 'Support needed'], subs.filter(function (r) { return r.answers.q2.issue; }).map(function (r) { return [monthLabel(r.month), r.answers.q2.issue, r.answers.q2.impact, r.answers.q2.support]; }))]),
      rsec('6. Agreed actions', [rtable(['Raised', 'Action', 'Owner', 'Close-out criteria', 'Deadline', 'Status'].concat(V15 ? ['Latest progress'] : []), acts.map(function (x) {
        return [x.r.month ? monthShort(x.r.month) + ' ' + x.r.month.slice(2, 4) : '', x.ac.text, x.ac.owner, x.ac.criteria, dueText(x.ac), x.ac.tracked ? acStatusText(x.ac) : (x.ac.status === 'Closed' ? 'Closed ' + fmtDate(x.ac.closedOn) : (acOverdue(x.ac) ? 'Open – overdue' : 'Open'))]
          .concat(V15 ? [x.ac.latest] : []);
      })), V15 ? h('div', { class: 'small muted', text: 'Actions open now, or raised or closed in the period. "Waiting" shows a dependency outside the action; actions are a record of support and follow-up, not a score.' }) : null].filter(Boolean)),
      rsec('7. ' + L.mgr + ' feedback', [rtable(['Month', 'Overall feedback'], prs.filter(function (r) { return r.state === 'Completed' && canSeeTl(r, aud) && r.fb.overall; }).map(function (r) { return [monthLabel(r.month), r.fb.overall]; }))]),
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
    '.focus{border-left:3px solid #ef7d3a;background:#fdf0e7;padding:8px 11px;border-radius:0 6px 6px 0}.focus ul{margin:6px 0 0 18px;padding:0}.focus .band{font-size:11px}',
    '.rsum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.rsum > div{border:1px solid #d9dfe5;border-radius:6px;padding:9px 11px}.rsum b{font-size:18px}',
    '.fgrid{display:grid;gap:12px}.fgrid.c2{grid-template-columns:1fr 1fr}',
    'table.rt{width:100%;border-collapse:collapse;margin-top:4px}table.rt th{text-align:left;font-size:11px;color:#5b6774;padding:5px 7px;border-bottom:1px solid #d9dfe5;background:#f6f8fa}table.rt td{padding:5px 7px;border-bottom:1px solid #edf0f3;vertical-align:top}',
    '.exphead{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:16px}',
    '.band{display:inline-block;font-size:13px;font-weight:700;padding:3px 12px;border-radius:12px}.band.b0{background:#fde8e9;color:#a4262c}.band.b1{background:#fff3d6;color:#8a5a00}.band.b2{background:#e6f3eb;color:#1b7a45}.band.b3{background:#e1edfb;color:#1659a8}',
    '.legend{display:flex;gap:14px;font-size:12px;color:#5b6774;margin-bottom:6px}.legend .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}.legend .sw.dash{height:0;border-top:2px dashed #5b6774;width:14px;vertical-align:3px}',
    'svg.chart{width:100%;height:auto;display:block}svg.chart text{font-size:11px;fill:#5b6774}',
    '.note{font-size:11px;color:#5b6774;margin-top:24px;border-top:1px solid #d9dfe5;padding-top:8px}',
    '@media print{@page{size:A4;margin:12mm}.report-doc{padding:0}.rsec h2{break-after:avoid}.rt tr,.fgrid>div{break-inside:avoid}.rt td:nth-child(n+4){white-space:nowrap}}'
  ].join('\n');
  function printReport(tech, aud, idx) {
    var w = window.open('', '_blank');
    if (!w) { toast('Your browser blocked the print window – allow pop-ups for this site and try again.', true); return; }
    var d = w.document;
    d.title = 'Appraisal report – ' + tech;
    var style = d.createElement('style'); style.textContent = REPORT_CSS; d.head.appendChild(style);
    d.body.appendChild(d.importNode(reportDoc(tech, aud, idx), true));
    w.focus();
    setTimeout(function () { try { w.print(); } catch (_) { /* user can print manually */ } }, 400);
  }
  function reportView(tech, aud, idx) {
    return h('div', { class: 'report-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Appraisal report' }, [
      h('div', { class: 'report-bar' }, [h('strong', { text: 'Appraisal report – ' + tech }), h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn primary', type: 'button', text: '🖨 Print / Save as PDF', onclick: function () { printReport(tech, aud, idx); } }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { state.report = null; render(false); } })])]),
      reportDoc(tech, aud, idx)
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
  function openFeedbackItem(g) {
    var back = h('div', { class: 'modal-back' }), first0 = g.items[0];
    function row(k, v) { return h('tr', null, [h('th', { text: k }), h('td', { text: v })]); }
    function when(f) {
      var c = f.Created ? new Date(f.Created) : null;
      return c && !isNaN(c) ? fmtDate(localDate(f.Created)) + ' ' + c.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timeZone }) : '';
    }
    var status = g.kind === 'failed' ? 'Could not be delivered' : g.kind === 'held' ? 'Not emailed – more than 10 from one person in a day'
      : 'Not sent yet – check ESG 1-to-1 | 6 Feedback is On';
    var blocks = g.items.map(function (f) {
      return h('div', { class: 'fbk-item' }, [h('div', { class: 'small muted', text: (str(f.FeedbackType) || 'Suggestion') + ' · ' + when(f) + ' · ' + str(f.PageName) +
        (f.AppVersion ? ' (version ' + str(f.AppVersion) + ')' : '') }), h('div', { class: 'fbk-msg', text: str(f.Message) })]);
    });
    back.appendChild(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Feedback' }, [
      h('h3', { text: g.items.length > 1 ? plural(g.items.length, 'feedback message') : 'Feedback – ' + (str(first0.FeedbackType) || 'Suggestion') }),
      h('table', { class: 'tbl' }, [h('tbody', null, [
        // as recorded by SharePoint (the person signed in when it was sent)
        row('From', str(first0.Author && first0.Author.Title) + (first0.Author && first0.Author.EMail ? ' (' + str(first0.Author.EMail) + ')' : '')),
        row('Email', status)])]),
      h('div', { class: 'fbk-list' }, blocks),
      h('div', { class: 'btn-row', style: 'margin-top:14px' }, [
        h('button', { class: 'btn primary', type: 'button', text: g.items.length > 1 ? 'Mark all as read' : 'Mark as read', onclick: function () {
          busy('fb', async function () {
            for (var i = 0; i < g.items.length; i++) { await spUpdate(CONFIG.lists.feedback, g.items[i].ID, { DeliveryStatus: 'Read' }); }
            FEEDBACK_ISSUES = FEEDBACK_ISSUES.filter(function (x) { return x !== g; });
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
      if (V15) {
        var myOd = ACTIONS.filter(acOverdue).length, myOpen = ACTIONS.filter(acOpen).length;
        tabs.push(navBtn('myactions', '✅', 'My actions', null, myOpen ? h('span', { class: 'badge' + (myOd ? '' : ' soft'), title: myOd ? myOd + ' overdue' : 'Open', text: String(myOpen) }) : null));
      }
      tabs.push(navBtn('myapp', '📈', 'My appraisal'));
      var wbTodo = WELLBEING.filter(function (w) { return wbState(w) === 'Open'; }).length;
      tabs.push(navBtn('wellbeing', '💚', 'Wellbeing', null, wbTodo ? h('span', { class: 'badge', title: 'To complete', text: String(wbTodo) }) : null));
      tabs.push(navBtn('report', '📄', 'Appraisal report', function () { state.report = { tech: ME, aud: 'tech' }; render(false); }, null, false));
    } else {
      var awaiting = TECHS.filter(function (t) { var c = currentOf(t); return c && c.state === 'Submitted'; }).length
        + REVIEWS.filter(function (r) { return r.state === 'Submitted' && r.month !== CUR; }).length;
      var overdueA = actionsOf(function (ac) { return acOverdue(ac) || ac.status === 'Ready for close-out'; }, 'tl').length;
      tabs.push(navBtn('team', '🏠', 'Team overview'));
      tabs.push(navBtn('reviews', '🗂', 'Monthly reviews', null, awaiting ? h('span', { class: 'badge', title: 'Awaiting your review', text: String(awaiting) }) : null));
      tabs.push(navBtn('expect', '🎯', 'Expectations'));
      tabs.push(navBtn('actions', '✅', 'Actions', null, overdueA ? h('span', { class: 'badge', title: V15 ? 'Overdue or awaiting close-out' : 'Overdue', text: String(overdueA) }) : null));
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
      expect: ['', 'Appraisal expectations'], actions: ['', 'Actions'], myactions: ['', 'My actions'], wellbeing: ['', 'Wellbeing assessments'], wb: ['Wellbeing ›', 'Wellbeing assessment'] };
    var tt = titles[v] || ['', ''];
    if (v === 'profile') { tt = ['Team overview ›', state.profileTech]; }
    if (v === 'mgr') { var rv = REVIEWS.find(function (x) { return x.id === state.reviewId; }); tt = rv ? [(state.backTo === 'profile' ? rv.tech : state.backTo === 'team' ? 'Team overview' : 'Monthly reviews') + ' ›', rv.tech + ' – ' + monthLabel(rv.month)] : ['', 'Review']; }
    var titlebar = h('div', { class: 'titlebar' }, [h('div', null, [tt[0] ? h('div', { class: 'crumb', text: tt[0] }) : null, h('h1', { text: tt[1] })])]);
    var main = h('main');
    try {
      main.appendChild(v === 'tech' ? techView() : v === 'myactions' ? myActionsView() : v === 'myapp' ? profileView(ME, 'tech') : v === 'team' ? teamView() : v === 'reviews' ? reviewsView()
        : v === 'expect' ? expectationsView() : v === 'actions' ? actionsView() : v === 'profile' ? profileView(state.profileTech, 'tl')
        : v === 'wellbeing' ? wellbeingView() : v === 'wb' ? wbView() : managerView());
    } catch (e) {
      main.appendChild(card('Something went wrong', null, [h('p', { text: 'This page could not be shown: ' + (e && e.message ? e.message : e) }), h('p', { class: 'small muted', text: ('Use ↻ Refresh. If it keeps happening, tell your ' + lc(L.mgr) + ' (version ') + VERSION + ').' })]));
      if (window.console) { window.console.error('ESG 1-to-1 render error', e); }
    }
    root.appendChild(h('div', { class: 'shell' }, [topbar, h('div', { class: 'content' }, [titlebar, main])]));
    if (!state.report) { root.appendChild(feedbackWidget(tt[1] || v)); }
    if (state.report) { root.appendChild(reportView(state.report.tech, state.report.aud, state.report.period)); }
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
    state.amend = null;   // a reload always leaves an amendment that wasn't saved
    message(L.app, 'Loading your 1-to-1…');
    TODAY = localDate(new Date().toISOString());
    CUR = TODAY.slice(0, 7);
    CUR_YEAR = appraisalYearOf(TODAY);
    await load();
    var rid = Number(queryParam('reviewId'));
    var hasRid = Number.isInteger(rid) && rid > 0;
    var wid = Number(queryParam('wbId')), aid = Number(queryParam('actionId'));
    if (!state.view && Number.isInteger(wid) && wid > 0) { state.view = 'wb'; state.wbId = wid; }
    if (!state.view && V15 && Number.isInteger(aid) && aid > 0) { state.view = IS_TL ? 'actions' : 'myactions'; state.actFocus = aid; state.actNeed = ''; state.actFilter = 'all'; }
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
      } else if (state.report) { e.preventDefault(); state.report = null; render(false); }
      else if (FBK.open) { e.preventDefault(); closeFeedback(); }
    });
    // Return focus to whatever opened a dialog once it closes.
    if (window.MutationObserver) {
      var opener = null;
      new window.MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) {
            if (n.classList && n.classList.contains('modal-back')) {
              opener = document.activeElement;
              // move focus into the dialog (first field, else its first button) unless something inside already has it
              setTimeout(function () {
                if (!n.isConnected || n.contains(document.activeElement)) { return; }
                var f = n.querySelector('input:not([type=hidden]):not([disabled]):not(.dpick), select, textarea, button');
                if (f) { try { f.focus(); } catch (_) { /* ignore */ } }
              }, 0);
            }
          });
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
    _version: VERSION,
    _focusAreas: function (o) { return focusAreas(o); },
    // The period and statistics calculations run on a made-up model, in a fresh instance that has not loaded (no requests).
    _calc: function (m) {
      if (root) { throw new Error('test hook only'); }
      IS_TL = m.tl !== false; V14 = true; TODAY = m.today; CUR = TODAY.slice(0, 7); CUR_YEAR = appraisalYearOf(TODAY);
      SETTINGS = { bands: defaultBands(), reminders: [] }; L = defaultLabels();
      TECH_INFO = {}; TECH_INFO.T = { appraisal: m.ap || '', cycleStart: isoDay(m.start || ''), history: parseHistory(JSON.stringify(m.history || [])), boundaries: m.boundaries || [], active: true };
      REVIEWS = m.reviews.map(function (x, i) {
        var st = x.state || 'Completed';
        return { id: i + 1, mrId: i + 1, tech: 'T', month: x.month, due: lastDay(x.month), state: st, late: !!x.late, processing: false,
          released: st === 'Completed' || st === 'Closed - Not Submitted', snapshot: [{ id: 1, title: 'E1', measures: '', year: '' }],
          answers: { q8: [{ id: 1, rating: x.self || null, comment: '' }] }, fb: { exp: {}, expRating: x.tl ? { 1: x.tl } : {}, actions: [] } };
      });
      return { streak: streakOf('T'), periods: periodsOf('T').map(function (p) {
        var o = expectedOutcome('T', 'tl', p), c = periodCounts('T', p, 'tl');
        return { label: periodLabel(p), closed: p.closed, noBaseline: !!p.noBaseline, months: periodReviews('T', p).map(function (r) { return r.month; }),
          counts: c, text: countsText(c), current: o.current, projected: o.projected, points: o.pts.length, onTime: onTimeOf('T', p) };
      }) };
    }
  };
};
