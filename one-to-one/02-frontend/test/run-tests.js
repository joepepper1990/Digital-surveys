// ESG 1-to-1 frontend – automated tests against the local SharePoint mock (no tenant, no network).
// Run from 02-frontend:   node tools/build-mock.js && node test/run-tests.js
// Needs Playwright + Chromium (set PLAYWRIGHT_MODULE / CHROMIUM_PATH if they are not on the default paths).
'use strict';
var fs = require('fs');
var path = require('path');
var PW = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright';
var CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium = require(PW).chromium;

var BASE = path.join(__dirname, '..');
var PAGE = 'file://' + path.join(BASE, 'mock', 'index.html');
var results = [];
function ok(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || '' }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail && !cond ? '  — ' + detail : '')); }

var TECH_ALLOWED = ['Q1WentWell', 'Q2Issue', 'Q2Impact', 'Q2Tried', 'Q2Support', 'Q3WorkloadRating', 'Q3WorkloadComment', 'Q4WellbeingRaise', 'Q4WellbeingDetail',
  'Q5PlanningRaise', 'Q5PlanningDetail', 'Q6DevRaise', 'Q6DevWhat', 'Q6DevWhy', 'Q7ManagerFeedback', 'ExpectationsJson', 'Q9FollowUp', 'Mood', 'WinOfMonth', 'ReviewStatus'];
var MGR_ALLOWED = ['FB_Q1', 'FB_Q2', 'FB_Q3', 'FB_Q4', 'FB_Q5', 'FB_Q6', 'FB_Q7', 'FB_Q9', 'FB_Overall', 'ExpectationFeedbackJson', 'FollowUpDecision', 'MeetingDate',
  'ActionsJson', 'ActionsStatus', 'NextActionDue', 'ReviewState'];
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso) { return iso.slice(8, 10) + '-' + MON[+iso.slice(5, 7) - 1] + '-' + iso.slice(0, 4); }
function futureIso(days) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }

// ------------------------------------------------------------------ 1. static checks
function staticChecks() {
  var js = fs.readFileSync(path.join(BASE, 'one-to-one.js'), 'utf8');
  var html = fs.readFileSync(path.join(BASE, 'one-to-one.html'), 'utf8');
  var code = js.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
  ok('S1 no innerHTML/outerHTML/insertAdjacentHTML/document.write', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code));
  ok('S4 no eval / new Function / string timers', !/\beval\s*\(|new Function|setTimeout\(\s*['"]|setInterval\(/.test(code));
  var urls = (code.match(/https?:\/\/[^\s'"]+/g) || []).filter(function (u) { return u !== 'http://www.w3.org/2000/svg'; });
  ok('S5 no external URLs in the script (SVG namespace only)', urls.length === 0, urls.join(', '));
  ok('S5 no external URLs in the layout', !/https?:\/\//.test(html));
  ok('No Handlebars expressions in layout or script', html.indexOf('{' + '{') < 0 && js.indexOf('{' + '{') < 0);
  ok('Layout exports the ESGOneToOne factory', /data-exports="ESGOneToOne"/.test(html) && /window\.ESGOneToOne\s*=/.test(js));
  ok('No email addresses or tenant hosts in shipped files', !/[\w.-]+@[\w-]+\.[\w.]+/.test(js + html) && !/sharepoint\.com/i.test(js + html));
  ok('Writes only through spUpdate/spCreate (single validateUpdateListItem + AddValidate path)',
    (code.match(/validateUpdateListItem/g) || []).length === 1 && (code.match(/AddValidateUpdateItemUsingPath/g) || []).length === 1);
  ok('No permission endpoints called from the frontend', !/roleassignments|breakroleinheritance|resetroleinheritance|ensureuser/i.test(code));
}

// ------------------------------------------------------------------ helpers
async function open(page, params) {
  var errs = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', function (e) { errs.push(e.message); });
  var u = new URL(PAGE); Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
  await page.goto(u.toString());
  await page.waitForSelector('.shell', { timeout: 8000 });
  await page.waitForTimeout(150);
  return errs;
}
async function db(page) { return page.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
async function api(page, method, p, body) {
  return page.evaluate(async function (a) {
    var c = OTO_MOCK.current.client, url = OTO_MOCK.SITE + a.p;
    var opts = { headers: { 'X-RequestDigest': OTO_MOCK.current.db.digest } };
    if (a.body) { opts.body = JSON.stringify(a.body); }
    var r = a.method === 'GET' ? await c.get(url, {}, opts) : await c.post(url, {}, opts);
    var t = await r.text(); var j = null; try { j = JSON.parse(t); } catch (_) { j = null; }
    return { status: r.status, json: j };
  }, { method: method, p: p, body: body });
}
function curMonth() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7); }
function claims(email) { return 'i:0#.f|membership|' + email; }

async function main() {
  staticChecks();
  var browser = await chromium.launch({ executablePath: CHROME });
  var ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await ctxB.newPage();
  page.on('dialog', function (d) { d.accept(); });
  var CUR = curMonth();

  // ---------------------------------------------------------------- 2. TL loads
  var errs = await open(page, { as: 'tl' });
  await page.evaluate(function () { OTO_MOCK.reset(); });
  errs = await open(page, { as: 'tl' });
  ok('TL: dashboard loads without errors', errs.length === 0, errs.join(' | '));
  ok('TL: Team overview shows 6 technicians', (await page.locator('.nw tbody tr').count()) === 6);
  ok('TL: sidebar lists the team and Settings', (await page.locator('.sidenav >> text=Settings').count()) === 1 && (await page.locator('.sidenav >> text=Sam Patel').count()) === 1);
  var d0 = await db(page);
  var alexClaims = claims('alex.morgan@example.test'), samClaims = claims('sam.patel@example.test');
  var alexCur = d0.lists['Monthly Reviews'].find(function (r) { return r.Technician === alexClaims && r.MonthKey === CUR; });
  var samCur = d0.lists['Monthly Reviews'].find(function (r) { return r.Technician === samClaims && r.MonthKey === CUR; });
  var alexCurMr = d0.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === alexCur.ID; });
  var samCurMr = d0.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === samCur.ID; });

  // ---------------------------------------------------------------- 3. technician isolation
  errs = await open(page, { as: 'alex' });
  ok('Test A: page loads without errors', errs.length === 0, errs.join(' | '));
  var alexCount = d0.lists['Monthly Reviews'].filter(function (r) { return r.Technician === alexClaims; }).length;
  ok('Test A: month picker lists only own reviews (' + alexCount + ')', (await page.locator('select[aria-label="Choose a month"] option').count()) === alexCount);
  var bodyText = await page.locator('[data-oto-root]').innerText();
  ok('Test A: no other technician names on the page', ['Sam Patel', 'Jordan Lee', 'Casey Brooks', 'Riley Evans', 'Taylor Reed'].every(function (n) { return bodyText.indexOf(n) < 0; }));
  ok('Test A: no Team Leader menu or Settings', (await page.locator('.sidenav >> text=Settings').count()) === 0 && (await page.locator('.sidenav >> text=Team overview').count()) === 0);
  var r1 = await api(page, 'GET', "/_api/web/lists/getbytitle('Monthly%20Reviews')/items");
  ok('Test A: REST returns only own Monthly Reviews', r1.status === 200 && r1.json.value.every(function (x) { return x.Technician && x.Technician.EMail === 'alex.morgan@example.test'; }));
  var r2 = await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items");
  ok('Test A: REST returns only own RELEASED Manager Reviews', r2.status === 200 && r2.json.value.length > 0 && r2.json.value.every(function (x) { return x.Technician.EMail === 'alex.morgan@example.test' && x.ReleasedOn; }));
  ok('Test A: cannot read own UNRELEASED Manager Review', (await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items(" + alexCurMr.ID + ')')).status === 404);
  ok('Test A: cannot read Test B\'s review by guessing its ID', (await api(page, 'GET', "/_api/web/lists/getbytitle('Monthly%20Reviews')/items(" + samCur.ID + ')')).status === 404);
  ok('Test A: cannot read Technicians or Appraisal Expectations', (await api(page, 'GET', "/_api/web/lists/getbytitle('Technicians')/items")).status === 404 &&
    (await api(page, 'GET', "/_api/web/lists/getbytitle('Appraisal%20Expectations')/items")).status === 404);
  ok('Test A: can read the 1-to-1 Settings (bands)', (await api(page, 'GET', "/_api/web/lists/getbytitle('1-to-1%20Settings')/items")).status === 200);
  var w0 = await api(page, 'POST', "/_api/web/lists/getbytitle('1-to-1%20Settings')/items(1)/validateUpdateListItem", { formValues: [{ FieldName: 'Value', FieldValue: '[]' }], bNewDocumentUpdate: false });
  ok('Test A: cannot change the Settings list', w0.status === 403);
  var w1 = await api(page, 'POST', "/_api/web/lists/getbytitle('Monthly%20Reviews')/items(" + samCur.ID + ')/validateUpdateListItem', { formValues: [{ FieldName: 'Q1WentWell', FieldValue: 'hack' }], bNewDocumentUpdate: false });
  ok('Test A: cannot write Test B\'s review', w1.status === 404 || w1.status === 403);
  var w2 = await api(page, 'POST', "/_api/web/lists/getbytitle('Appraisal%20Expectations')/AddValidateUpdateItemUsingPath", { listItemCreateInfo: { FolderPath: { DecodedUrl: '/x' } }, formValues: [], bNewDocumentUpdate: false });
  ok('Test A: cannot create items', w2.status === 404 || w2.status === 403);

  // ---------------------------------------------------------------- 4. draft save payload
  await page.locator('.q-head .seg button:has-text("No")').nth(0).click();
  await page.locator('textarea').nth(1).fill('Waiting for spares');
  await page.locator('.mood button[aria-label="Steady"]').click();
  await page.locator('.side-tile:has-text("Win of the month") textarea').fill('Closed two permits right first time');
  await page.locator('.pagehead button:has-text("Save draft")').click();
  await page.waitForTimeout(250);
  var d1 = await db(page);
  var lw = d1.writes[d1.writes.length - 1];
  ok('Draft save writes only the technician\'s own Monthly Review', lw && lw.as === 'alex' && lw.list === 'Monthly Reviews' && lw.id === alexCur.ID);
  ok('Draft save writes only allowed fields', lw && lw.fields.every(function (f) { return TECH_ALLOWED.indexOf(f) >= 0; }), lw && lw.fields.join(','));
  ok('Draft save sets ReviewStatus = Draft and clears hidden Q4 detail', lw && lw.values.ReviewStatus === 'Draft' && lw.values.Q4WellbeingDetail === '');
  var it1 = d1.lists['Monthly Reviews'].find(function (x) { return x.ID === alexCur.ID; });
  ok('Draft save stored mood and win of the month', it1.Mood === 3 && it1.WinOfMonth === 'Closed two permits right first time');

  // ---------------------------------------------------------------- 5. submit → lock (Flow 2)
  await page.locator('.q-head .seg button:has-text("No")').nth(1).click();
  await page.locator('.q-head .seg button:has-text("No")').nth(2).click();
  var segs = page.locator('td .seg');
  var nSeg = await segs.count();
  for (var i = 0; i < nSeg; i++) { await segs.nth(i).locator('button:has-text("3")').click(); }
  await page.locator('label.choice:has-text("Quick, informal catch-up")').click();
  await page.locator('.pagehead button:has-text("Submit")').click();
  await page.locator('.modal button:has-text("Submit")').click();
  await page.waitForTimeout(400);
  var d2 = await db(page);
  var mr2 = d2.lists['Manager Reviews'].find(function (m) { return m.ID === alexCurMr.ID; });
  ok('Submit: write carries ReviewStatus = Submitted', d2.writes.some(function (w) { return w.as === 'alex' && w.id === alexCur.ID && w.values.ReviewStatus === 'Submitted'; }));
  ok('Submit: Flow 2 stamped the trusted record', mr2.ReviewState === 'Submitted' && !!mr2.SubmittedOn);
  ok('Submit: review is now read-only for the technician', d2.perms['Monthly Reviews'][alexCur.ID]['alex.morgan@example.test'] === 'read');
  var w3 = await api(page, 'POST', "/_api/web/lists/getbytitle('Monthly%20Reviews')/items(" + alexCur.ID + ')/validateUpdateListItem', { formValues: [{ FieldName: 'Q1WentWell', FieldValue: 'changed after submit' }], bNewDocumentUpdate: false });
  ok('Submit: a later write by the technician is refused', w3.status === 403);
  ok('Submit: page shows read-only state', (await page.locator('.pagehead button:has-text("Submit")').count()) === 0);

  // ---------------------------------------------------------------- 6. TL review, actions, complete (Flow 3)
  errs = await open(page, { as: 'tl', reviewId: String(alexCur.ID) });
  ok('TL: ?reviewId opens the review screen', (await page.locator('.titlebar h1').innerText()).indexOf('Alex Morgan') === 0, errs.join('|'));
  var tSegs = page.locator('td .seg');
  var nT = await tSegs.count();
  for (var j = 0; j < nT; j++) { await tSegs.nth(j).locator('button:has-text("4")').click(); }
  await page.locator('button:has-text("+ Add action")').click();
  var row = page.locator('.acrow').last();
  await row.locator('input[aria-label="Action"]').fill('Book RPS course');
  await page.locator('.pagehead button:has-text("Complete & release")').click();
  await page.locator('.modal button:has-text("Complete & release")').click();
  await page.waitForTimeout(250);
  var d3 = await db(page);
  ok('TL: Complete is blocked while an action lacks criteria/deadline', d3.lists['Manager Reviews'].find(function (m) { return m.ID === alexCurMr.ID; }).ReviewState === 'Submitted');
  var due = futureIso(40);
  await row.locator('input[aria-label="Close-out criteria"]').fill('Course date confirmed in the training system');
  await row.locator('input.datef').fill(fmt(due)); await row.locator('input.datef').press('Tab');
  await page.locator('textarea').last().fill('Strong month – well done.');
  await page.locator('.pagehead button:has-text("Complete & release")').click();
  await page.locator('.modal button:has-text("Complete & release")').click();
  await page.waitForTimeout(400);
  var d4 = await db(page);
  var mr4 = d4.lists['Manager Reviews'].find(function (m) { return m.ID === alexCurMr.ID; });
  var fbWrite = d4.writes.filter(function (w) { return w.as === 'tl' && w.list === 'Manager Reviews' && w.id === alexCurMr.ID; });
  ok('TL: feedback writes only allowed Manager Reviews fields', fbWrite.length >= 2 && fbWrite.every(function (w) { return w.fields.every(function (f) { return MGR_ALLOWED.indexOf(f) >= 0; }); }));
  ok('TL: state is written separately from feedback', fbWrite.some(function (w) { return w.fields.length === 1 && w.fields[0] === 'ReviewState'; }) && fbWrite.some(function (w) { return w.fields.indexOf('ReviewState') < 0; }));
  var acts = JSON.parse(mr4.ActionsJson || '[]');
  ok('TL: action saved with owner, close-out criteria and deadline', acts.length === 1 && acts[0].criteria && acts[0].due === due && acts[0].owner === 'Alex Morgan');
  ok('TL: ActionsStatus/NextActionDue summary written', mr4.ActionsStatus === 'Open' && !!mr4.NextActionDue);
  var ef = JSON.parse(mr4.ExpectationFeedbackJson);
  ok('TL: per-expectation ratings saved', ef.length > 0 && ef.every(function (x) { return x.rating === 4; }));
  ok('TL: Flow 3 released the feedback', !!mr4.ReleasedOn && d4.perms['Manager Reviews'][alexCurMr.ID]['alex.morgan@example.test'] === 'read');

  // ---------------------------------------------------------------- 7. technician sees released feedback
  errs = await open(page, { as: 'alex', reviewId: String(alexCur.ID) });
  var t7 = await page.locator('[data-oto-root]').innerText();
  ok('Test A: sees released overall feedback and the action', t7.indexOf('Strong month – well done.') >= 0 && t7.indexOf('Book RPS course') >= 0 && t7.indexOf(fmt(due)) >= 0, errs.join('|'));
  ok('Test A: sees Team Leader ratings per expectation', (await page.locator('td:has-text("4 – Strong progress")').count()) > 0);

  // ---------------------------------------------------------------- 8. Test B cannot see Test A's released records
  await open(page, { as: 'sam' });
  var r8 = await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items");
  ok('Test B: none of Test A\'s Manager Reviews are returned', r8.json.value.every(function (x) { return x.Technician.EMail === 'sam.patel@example.test'; }));
  ok('Test B: Test A\'s released Manager Review is not readable by ID', (await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items(" + alexCurMr.ID + ')')).status === 404);
  ok('Test B: submitted review is read-only in the page', (await page.locator('.pagehead button:has-text("Save draft")').count()) === 0);

  // ---------------------------------------------------------------- 9. settings (dates + bands) and BST-safe dates
  await open(page, { as: 'tl' });
  await page.locator('.sidenav >> text=Settings').click();
  var caseyIn = page.locator('.modal tr:has-text("Casey Brooks") input.datef');
  await caseyIn.fill('31-Feb-2027'); await caseyIn.press('Tab');
  ok('Settings: impossible date is flagged', await caseyIn.evaluate(function (e) { return e.classList.contains('bad'); }));
  var summer = (new Date().getUTCFullYear() + 1) + '-06-15';
  await caseyIn.fill(fmt(summer).toLowerCase()); await caseyIn.press('Tab');
  ok('Settings: date normalised to DD-MMM-YYYY', (await caseyIn.inputValue()) === fmt(summer));
  var b3 = page.locator('.modal input[aria-label="Upper limit"]').nth(2);
  await b3.fill('3.9'); await b3.press('Tab');
  await page.locator('.modal button:has-text("Save settings")').click();
  await page.waitForTimeout(400);
  var d9 = await db(page);
  var techW = d9.writes.filter(function (w) { return w.list === 'Technicians'; }).pop();
  ok('Settings: appraisal date written to Technicians as dd/MM/yyyy', techW && techW.values.AppraisalDate === summer.slice(8, 10) + '/' + summer.slice(5, 7) + '/' + summer.slice(0, 4));
  ok('Settings: copy written to the current Monthly Review', d9.writes.some(function (w) { return w.list === 'Monthly Reviews' && w.as === 'tl' && 'AppraisalDate' in w.values; }));
  var sw = d9.writes.filter(function (w) { return w.list === '1-to-1 Settings'; }).pop();
  ok('Settings: bands saved to the Settings list', sw && JSON.parse(sw.values.Value)[2].max === 3.9);
  await open(page, { as: 'tl' });
  ok('Dates: a BST date reloads as the same calendar day', (await page.locator('.nw tr:has-text("Casey Brooks")').innerText()).indexOf(fmt(summer)) >= 0);

  // ---------------------------------------------------------------- 10. expectations editor
  await page.locator('.sidenav >> text=Expectations').click();
  await page.locator('#oto-x-title').fill('Complete confined space refresher');
  await page.locator('#oto-x-meas').fill('Course passed and recorded');
  await page.locator('#oto-x-scope').selectOption('Individual');
  await page.locator('#oto-x-tech').selectOption('Sam Patel');
  await page.locator('button:has-text("Add expectation")').click();
  await page.waitForTimeout(300);
  var d10 = await db(page);
  var cw = d10.writes.filter(function (w) { return w.create; }).pop();
  ok('Expectations: create writes the person field for an individual expectation', cw && cw.list === 'Appraisal Expectations' && cw.values.Technician === JSON.stringify([{ Key: samClaims }]) && cw.values.AppliesTo === 'Individual');
  ok('Expectations: new row appears under the technician', (await page.locator('tr:has-text("Complete confined space refresher")').count()) === 1);
  await page.locator('tr:has-text("Complete confined space refresher") button:has-text("Retire")').click();
  await page.waitForTimeout(250);
  var d10b = await db(page);
  ok('Expectations: retire writes Active = 0', d10b.writes[d10b.writes.length - 1].values.Active === '0');

  // ---------------------------------------------------------------- 11. actions page close-out
  await page.locator('.sidenav >> text=Actions').click();
  var before = (await db(page)).writes.length;
  await page.locator('button:has-text("Close out")').first().click();
  await page.locator('.modal button:has-text("Close out")').click();
  await page.waitForTimeout(250);
  var d11 = await db(page);
  var aw = d11.writes[d11.writes.length - 1];
  ok('Actions: close-out writes ActionsJson on the Manager Review', d11.writes.length === before + 1 && aw.list === 'Manager Reviews' && /"status":"Closed"/.test(aw.values.ActionsJson));

  // ---------------------------------------------------------------- 12. report + print window
  await page.locator('.sidenav >> text=Jordan Lee').click();
  await page.locator('button:has-text("Generate appraisal report")').click();
  ok('Report: opens with all eight sections', (await page.locator('.report-doc h2').count()) === 8);
  var popupP = page.waitForEvent('popup');
  await page.locator('button:has-text("Print / Save as PDF")').click();
  var popup = await popupP;
  await popup.waitForLoadState();
  ok('Report: print window contains the report', (await popup.locator('.report-doc h1').innerText()) === 'Jordan Lee');
  await popup.close();
  await page.locator('.report-bar button:has-text("Close")').click();

  // ---------------------------------------------------------------- 12b. plan D.7: TL views ignore technician-editable copies; "processing" state
  await open(page, { as: 'tl' });
  var dt = await db(page);
  var target = dt.lists['Monthly Reviews'].find(function (r) {
    var m = dt.lists['Manager Reviews'].find(function (x) { return x.ReviewItemId === r.ID; });
    return r.MonthKey === CUR && m && m.ReviewState === 'Open' && r.Technician !== samClaims && r.Technician.indexOf('alex.') < 0;
  });
  var tName = await page.evaluate(function (c) { return OTO_MOCK.USERS.find(function (u) { return 'i:0#.f|membership|' + u.email === c; }).title; }, target.Technician);
  await page.evaluate(function (a) {   // what a technician could do to their own open review through REST
    var rv = OTO_MOCK.current.db.lists['Monthly Reviews'].find(function (r) { return r.ID === a.id; });
    rv.MonthKey = '2099-01'; rv.DueDate = '2099-12-31T23:59:59Z'; rv.Technician = a.other;
    sessionStorage.setItem('oto-mock-db-v4', JSON.stringify(OTO_MOCK.current.db));
  }, { id: target.ID, other: samClaims });
  errs = await open(page, { as: 'tl' });
  var rowT = await page.locator('.nw tr:has-text("' + tName + '")').innerText();
  ok('D.7: tampered month/due/owner on a Monthly Review do not move or hide it in the TL view',
    rowT.indexOf('No review yet') < 0 && (await page.locator('body').innerText()).indexOf('2099') < 0, rowT);
  await page.evaluate(function (a) {   // technician has submitted; Flow 2 has not run yet (5-minute polling window)
    var rv = OTO_MOCK.current.db.lists['Monthly Reviews'].find(function (r) { return r.ID === a.id; });
    rv.ReviewStatus = 'Submitted';
    sessionStorage.setItem('oto-mock-db-v4', JSON.stringify(OTO_MOCK.current.db));
  }, { id: target.ID });
  errs = await open(page, { as: 'tl' });
  ok('Status: a submission waiting for Flow 2 shows "Submitted – processing", not "Not started"',
    (await page.locator('.nw tr:has-text("' + tName + '")').innerText()).indexOf('Submitted – processing') >= 0, errs.join('|'));

  // ---------------------------------------------------------------- 13. XSS sweep (attack strings in every field)
  await page.evaluate(function () { OTO_MOCK.reset(); });
  async function sweep(label, params, steps) {
    var e = await open(page, params);
    if (steps) { await steps(); await page.waitForTimeout(200); }
    var bad = await page.evaluate(function () {
      var rootEl = document.querySelector('[data-oto-root]');
      return { fired: !!window.__otoXssFired, img: rootEl.querySelectorAll('img').length, svgOnload: document.querySelectorAll('svg[onload]').length,
        scripts: rootEl.querySelectorAll('script').length + Array.prototype.filter.call(document.querySelectorAll('script'), function (s) { return /oto_xss\(\d\)/.test(s.textContent); }).length,
        text: rootEl.innerText.indexOf('oto_xss') >= 0 };
    });
    ok('XSS: ' + label + ' – payloads shown as text, nothing executed', !bad.fired && bad.img === 0 && bad.svgOnload === 0 && bad.scripts === 0 && bad.text && e.length === 0,
      JSON.stringify(bad) + ' ' + e.join('|'));
  }
  await sweep('TL team overview', { as: 'tl', xss: '1' });
  await sweep('TL monthly reviews', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav >> text=Monthly reviews').click(); await page.locator('#oto-f-month').selectOption(''); });
  var dx = await db(page);
  var samX = dx.lists['Monthly Reviews'].find(function (r) { return r.Technician === samClaims && r.MonthKey === CUR; });
  await sweep('TL review of attacker\'s answers', { as: 'tl', xss: '1', reviewId: String(samX.ID) });
  await sweep('TL profile with hostile name', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav button.nav:has-text("Riley")').click(); });
  await sweep('TL expectations page', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav >> text=Expectations').click(); });
  await sweep('TL actions page', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav >> text=Actions').click(); await page.locator('#oto-a-st').selectOption('all'); });
  await sweep('TL settings panel', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav >> text=Settings').click(); });
  await sweep('TL report for technician', { as: 'tl', xss: '1' }, async function () { await page.locator('.sidenav button.nav:has-text("Alex Morgan")').click(); await page.locator('button:has-text("Generate appraisal report")').click(); });
  await sweep('Technician form (own hostile draft)', { as: 'alex', xss: '1' });
  await sweep('Technician released review', { as: 'alex', xss: '1' }, async function () {
    var opts = await page.locator('select[aria-label="Choose a month"] option').allTextContents();
    await page.locator('select[aria-label="Choose a month"]').selectOption({ index: 1 });
    return opts;
  });
  await sweep('Technician my appraisal + report', { as: 'alex', xss: '1' }, async function () { await page.locator('.sidenav >> text=My appraisal').click(); await page.locator('button:has-text("Generate appraisal report")').click(); });

  await browser.close();
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) { process.exitCode = 1; }
}
main().catch(function (e) { console.error('TEST RUN ERROR', e); process.exitCode = 1; });
