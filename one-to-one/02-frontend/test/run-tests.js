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
async function openTeam(page, name) {
  await page.locator('.teammenu > summary').click();
  await page.locator('.teammenu button.nav:has-text("' + name + '")').click();
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
  ok('TL: top bar has Settings and the Team menu lists the team', (await page.locator('.topbar >> text=Settings').count()) === 1 && (await page.locator('.teammenu button.nav:has-text("Sam Patel")').count()) === 1);
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
  ok('Test A: no Team Leader menu or Settings', (await page.locator('.topbar >> text=Settings').count()) === 0 && (await page.locator('.topbar >> text=Team overview').count()) === 0);
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
  await page.locator('.topbar >> text=Settings').click();
  var caseyIn = page.locator('.modal tr:has-text("Casey Brooks") input.datef');
  await caseyIn.fill('31-Feb-2027'); await caseyIn.press('Tab');
  ok('Settings: impossible date is flagged', await caseyIn.evaluate(function (e) { return e.classList.contains('bad'); }));
  var summer = (new Date().getUTCFullYear() + 1) + '-06-15';
  await caseyIn.fill(fmt(summer).toLowerCase()); await caseyIn.press('Tab');
  ok('Settings: date normalised to DD-MMM-YYYY', (await caseyIn.inputValue()) === fmt(summer));
  await page.locator('.modal .stab:has-text("Appraisal bands")').click();
  var b3 = page.locator('.modal input[aria-label="Upper limit"]').nth(2);
  await b3.fill('3.9'); await b3.press('Tab');
  await page.locator('.modal button:has-text("Save settings")').click();
  await page.waitForTimeout(400);
  var d9 = await db(page);
  var techW = d9.writes.filter(function (w) { return w.list === 'Technicians'; }).pop();
  ok('Settings: appraisal date written to Technicians (verified by reading it back)', techW && techW.values.AppraisalDate === summer &&
    d9.lists['Technicians'].some(function (t) { return t.Title === 'Casey Brooks' && new Date(t.AppraisalDate).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === summer; }));
  ok('Settings: copy written to the current Monthly Review', d9.writes.some(function (w) { return w.list === 'Monthly Reviews' && w.as === 'tl' && 'AppraisalDate' in w.values; }));
  var sw = d9.writes.filter(function (w) { return w.list === '1-to-1 Settings'; }).pop();
  ok('Settings: bands saved to the Settings list', sw && JSON.parse(sw.values.Value)[2].max === 3.9);
  await open(page, { as: 'tl' });
  ok('Dates: a BST date reloads as the same calendar day', (await page.locator('.nw tr:has-text("Casey Brooks")').innerText()).indexOf(fmt(summer)) >= 0);

  // ---------------------------------------------------------------- 10. expectations editor
  await page.locator('.topbar >> text=Expectations').click();
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
  await page.locator('.topbar >> text=Actions').click();
  var before = (await db(page)).writes.length;
  await page.locator('button:has-text("Close out")').first().click();
  await page.locator('.modal button:has-text("Close out")').click();
  await page.waitForTimeout(250);
  var d11 = await db(page);
  var aw = d11.writes[d11.writes.length - 1];
  var aw2 = d11.writes.slice(before).find(function (w) { return 'ActionsJson' in w.values; });
  ok('Actions: close-out writes ActionsJson on the Manager Review', !!aw2 && aw2.list === 'Manager Reviews' && /"status":"Closed"/.test(aw2.values.ActionsJson) && aw.list === 'Manager Reviews');

  // ---------------------------------------------------------------- 12. report + print window
  await openTeam(page, 'Jordan Lee');
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
    sessionStorage.setItem('oto-mock-db-v5', JSON.stringify(OTO_MOCK.current.db));
  }, { id: target.ID, other: samClaims });
  errs = await open(page, { as: 'tl' });
  var rowT = await page.locator('.nw tr:has-text("' + tName + '")').innerText();
  ok('D.7: tampered month/due/owner on a Monthly Review do not move or hide it in the TL view',
    rowT.indexOf('No review yet') < 0 && (await page.locator('body').innerText()).indexOf('2099') < 0, rowT);
  await page.evaluate(function (a) {   // technician has submitted; Flow 2 has not run yet (5-minute polling window)
    var rv = OTO_MOCK.current.db.lists['Monthly Reviews'].find(function (r) { return r.ID === a.id; });
    rv.ReviewStatus = 'Submitted';
    sessionStorage.setItem('oto-mock-db-v5', JSON.stringify(OTO_MOCK.current.db));
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
        text: rootEl.innerText.indexOf('oto_xss') >= 0 || Array.prototype.some.call(rootEl.querySelectorAll('textarea,input'), function (x) { return String(x.value).indexOf('oto_xss') >= 0; }) };
    });
    ok('XSS: ' + label + ' – payloads shown as text, nothing executed', !bad.fired && bad.img === 0 && bad.svgOnload === 0 && bad.scripts === 0 && bad.text && e.length === 0,
      JSON.stringify(bad) + ' ' + e.join('|'));
  }
  await sweep('TL team overview', { as: 'tl', xss: '1' });
  await sweep('TL monthly reviews', { as: 'tl', xss: '1' }, async function () { await page.locator('.topbar >> text=Monthly reviews').click(); await page.locator('#oto-f-month').selectOption(''); });
  var dx = await db(page);
  var samX = dx.lists['Monthly Reviews'].find(function (r) { return r.Technician === samClaims && r.MonthKey === CUR; });
  await sweep('TL review of attacker\'s answers', { as: 'tl', xss: '1', reviewId: String(samX.ID) });
  await sweep('TL profile with hostile name', { as: 'tl', xss: '1' }, async function () { await openTeam(page, 'Riley'); });
  await sweep('TL expectations page', { as: 'tl', xss: '1' }, async function () { await page.locator('.topbar >> text=Expectations').click(); });
  await sweep('TL actions page', { as: 'tl', xss: '1' }, async function () { await page.locator('.topbar >> text=Actions').click(); await page.locator('#oto-a-st').selectOption('all'); });
  await sweep('TL settings panel', { as: 'tl', xss: '1' }, async function () { await page.locator('.topbar >> text=Settings').click(); });
  await sweep('TL report for technician', { as: 'tl', xss: '1' }, async function () { await openTeam(page, 'Alex Morgan'); await page.locator('button:has-text("Generate appraisal report")').click(); });
  await sweep('Technician form (own hostile draft)', { as: 'alex', xss: '1' });
  await sweep('Technician released review', { as: 'alex', xss: '1' }, async function () {
    var opts = await page.locator('select[aria-label="Choose a month"] option').allTextContents();
    await page.locator('select[aria-label="Choose a month"]').selectOption({ index: 1 });
    return opts;
  });
  await sweep('Technician my appraisal + report', { as: 'alex', xss: '1' }, async function () { await page.locator('.topbar >> text=My appraisal').click(); await page.locator('button:has-text("Generate appraisal report")').click(); });


  // ---------------------------------------------------------------- 14. layout: top bar, Team menu, width, scaling, dynamic height (v4.1)
  async function layoutAt(w, hgt, params) {
    var c = await browser.newContext({ viewport: { width: w, height: hgt } });
    var pg = await c.newPage(); pg.on('dialog', function (d) { d.accept(); });
    var e = await open(pg, params || { as: 'tl' });
    var m = await pg.evaluate(function () {
      var r = document.querySelector('[data-oto-root]'), main = r.querySelector('main'), z = parseFloat(getComputedStyle(r).zoom) || 1;
      return { z: z, docW: document.documentElement.scrollWidth, vw: window.innerWidth, mainW: main.getBoundingClientRect().width, rootW: r.getBoundingClientRect().width,
        rootH: r.getBoundingClientRect().height, vh: window.innerHeight, sidenav: !!r.querySelector('.sidenav') };
    });
    return { c: c, pg: pg, m: m, e: e };
  }
  await page.evaluate(function () { OTO_MOCK.reset(); });
  var L1 = await layoutAt(1440, 900);
  ok('Layout 1440: no sidebar, top bar with 5 TL tabs (incl. Wellbeing) + Team + Settings', !L1.m.sidenav && (await L1.pg.locator('.topbar .tabs button.nav').count()) === 5 &&
    (await L1.pg.locator('.teammenu > summary').count()) === 1 && (await L1.pg.locator('.topbar .right >> text=Settings').count()) === 1);
  ok('Layout 1440: zoom 1, no horizontal scroll', L1.m.z === 1 && L1.m.docW <= L1.m.vw, JSON.stringify(L1.m));
  ok('Layout 1440: content fills the width (no 1480px cap)', L1.m.mainW >= L1.m.rootW * 0.99, JSON.stringify(L1.m));
  ok('Team menu: closed by default', (await L1.pg.locator('.teammenu[open]').count()) === 0 && !(await L1.pg.locator('.teammenu button.nav:has-text("Sam Patel")').isVisible()));
  await L1.pg.locator('.teammenu > summary').click();
  ok('Team menu: opens and lists 6 technicians', (await L1.pg.locator('.teammenu[open] .menu button.nav:not(.manage)').count()) === 6 && await L1.pg.locator('.teammenu button.nav:has-text("Sam Patel")').isVisible());
  await L1.pg.locator('.titlebar h1').click();
  ok('Team menu: closes on an outside click', (await L1.pg.locator('.teammenu[open]').count()) === 0);
  await L1.pg.locator('.teammenu > summary').click(); await L1.pg.keyboard.press('Escape');
  ok('Team menu: closes on Escape', (await L1.pg.locator('.teammenu[open]').count()) === 0);
  await openTeam(L1.pg, 'Sam Patel');
  ok('Team menu: opens the profile and marks Team as current', (await L1.pg.locator('.titlebar h1').innerText()) === 'Sam Patel' && (await L1.pg.locator('.teammenu.cur').count()) === 1);
  await L1.c.close();

  var L2 = await layoutAt(2560, 1440);
  ok('Layout 2560: scaled up (zoom 1.4) with no horizontal scroll', L2.m.z === 1.4 && L2.m.docW <= L2.m.vw, JSON.stringify(L2.m));
  ok('Layout 2560: content fills the width', L2.m.rootW >= L2.m.vw * 0.98 && L2.m.mainW >= L2.m.rootW * 0.95, JSON.stringify(L2.m));
  var tipOk = await (async function () {
    var dot = L2.pg.locator('.teammenu > summary'); await dot.click();
    var b = L2.pg.locator('.teammenu .menu button.nav').first(); var bb = await b.boundingBox();
    await L2.pg.mouse.move(bb.x + 20, bb.y + bb.height / 2);
    await L2.pg.waitForTimeout(100);
    var tb = await L2.pg.locator('.tip').boundingBox();
    return tb && Math.abs(tb.x - (bb.x + 20)) < 40 && Math.abs(tb.y - (bb.y + bb.height / 2)) < 40 ? true : JSON.stringify({ tip: tb, mouse: [bb.x + 20, bb.y + bb.height / 2] });
  })();
  ok('Layout 2560: tooltip appears next to the cursor under zoom', tipOk === true, String(tipOk));
  await L2.pg.keyboard.press('Escape');
  await L2.pg.locator('.topbar >> text=Settings').click();
  var mb = await L2.pg.locator('.modal').boundingBox();
  ok('Layout 2560: Settings dialog fits on screen', mb && mb.y >= 0 && mb.y + mb.height <= 1440 + 1, JSON.stringify(mb));
  await L2.pg.locator('.modal button:has-text("Cancel"), .modal button:has-text("Close")').first().click().catch(function () { /* ignore */ });
  await L2.c.close();

  // dynamic height: with no technicians the page ends where the content ends
  var L3 = await layoutAt(1440, 900);
  await L3.pg.evaluate(function () {
    var d = OTO_MOCK.current.db; d.lists['Technicians'] = []; d.lists['Monthly Reviews'] = []; d.lists['Manager Reviews'] = [];
    sessionStorage.setItem('oto-mock-db-v5', JSON.stringify(d));
  });
  await open(L3.pg, { as: 'tl' });
  var m3 = await L3.pg.evaluate(function () { var r = document.querySelector('[data-oto-root]'); return { h: r.getBoundingClientRect().height, vh: window.innerHeight, txt: r.innerText }; });
  ok('Layout: empty Team overview shows the getting-started steps', /No technicians yet/.test(m3.txt) && /Add your team/.test(m3.txt) && /Start the month/.test(m3.txt));
  ok('Layout: dynamic height (empty page is shorter than the screen)', m3.h < m3.vh, JSON.stringify({ h: m3.h, vh: m3.vh }));
  ok('Layout: Team menu shows Team (0) and offers Manage team when empty', /Team \(0\)/.test(m3.txt) && await (async function () { await L3.pg.locator('.teammenu > summary').click(); return L3.pg.locator('.teammenu button.manage').isVisible(); })());
  await L3.c.close();

  var L4 = await layoutAt(1440, 900, { as: 'alex' });
  ok('Layout: technician top bar has 4 tabs (incl. Wellbeing), no Team menu or Settings', (await L4.pg.locator('.topbar .tabs button.nav').count()) === 4 &&
    (await L4.pg.locator('.teammenu').count()) === 0 && (await L4.pg.locator('.topbar >> text=Settings').count()) === 0);
  ok('Layout: version shown in the top bar', (await L4.pg.locator('.topbar .ver').innerText()) === 'v' + (await L4.pg.evaluate(function () { return window.ESGOneToOne ? window.ESGOneToOne()._version : ''; })));
  await L4.c.close();


  // ---------------------------------------------------------------- 15. v4.2: dates, settings tabs, team, labels, reminders, reorder, charts, attention
  await page.evaluate(function () { OTO_MOCK.reset(); });
  var dialogs = 0;
  var c15 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var P = await c15.newPage(); P.on('dialog', function (d) { dialogs += 1; d.accept(); });
  async function o15(params) { return open(P, params); }
  async function db15() { return P.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  function isoOf(utc) { return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
  await o15({ as: 'tl' });
  await P.locator('.topbar >> text=Settings').click();
  var ci = P.locator('.modal tr:has-text("Casey Brooks") input.datef');
  var yr = new Date().getUTCFullYear() + 1;
  var forms = [['15/07/' + yr, yr + '-07-15'], ['15-7-' + String(yr).slice(2), yr + '-07-15'], ['15 Jul ' + yr, yr + '-07-15'], ['15th July ' + yr, yr + '-07-15'], [yr + '-07-15', yr + '-07-15'], ['3.2.' + yr, yr + '-02-03']];
  var allOk = true;
  for (var fi = 0; fi < forms.length; fi++) {
    await ci.fill(forms[fi][0]); await ci.press('Tab');
    if ((await ci.inputValue()) !== fmt(forms[fi][1])) { allOk = false; }
  }
  ok('Dates: typed as 15/07/2027, 15-7-27, 15 Jul 2027, 15th July 2027, ISO or 3.2.2027 – all understood (day first)', allOk);
  ok('Dates: the day is shown in words under the box', /Wednesday|Monday|Tuesday|Thursday|Friday|Saturday|Sunday/.test(await P.locator('.modal tr:has-text("Casey Brooks") .datehint').innerText()));
  await ci.fill('32/13/2027'); await ci.press('Tab');
  ok('Dates: nonsense is flagged and not taken', await ci.evaluate(function (e) { return e.classList.contains('bad'); }) && /Not recognised/.test(await P.locator('.modal tr:has-text("Casey Brooks") .datehint').innerText()));
  await P.locator('.modal button:has-text("Save settings")').click(); await P.waitForTimeout(200);
  ok('Dates: Save is refused while a date is flagged', (await P.locator('.modal').count()) === 1);
  await P.locator('.modal tr:has-text("Casey Brooks") .dpick').evaluate(function (e, v) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, yr + '-08-20');
  ok('Dates: picking from the calendar fills the box', (await ci.inputValue()) === fmt(yr + '-08-20'));
  await P.locator('.modal button:has-text("Save settings")').click(); await P.waitForTimeout(400);
  var e15 = await db15();
  ok('Dates: calendar date saved and verified', isoOf(e15.lists['Technicians'].find(function (t) { return t.Title === 'Casey Brooks'; }).AppraisalDate) === yr + '-08-20');
  dialogs = 0;
  await P.locator('.topbar >> text=Monthly reviews').click(); await P.locator('.topbar >> text=Team overview').click();
  ok('Settings: no "unsaved changes" prompt after saving', dialogs === 0);
  // locales: US site with ISO accepted, and sites that only take dd/MM or MM/dd
  for (var li = 0; li < 3; li++) {
    var loc = ['us', 'us-noiso', 'uk-noiso'][li];
    await o15({ as: 'tl', locale: loc });
    await P.locator('.topbar >> text=Settings').click();
    var ri = P.locator('.modal tr:has-text("Riley Evans") input.datef');
    await ri.fill('05/11/' + yr); await ri.press('Tab');
    await P.locator('.modal button:has-text("Save settings")').click(); await P.waitForTimeout(500);
    var el = await db15();
    var riley = el.lists['Technicians'].find(function (t) { return t.Title === 'Riley Evans'; });
    var lastW = el.writes.filter(function (w) { return w.list === 'Technicians' && w.id === riley.ID; }).pop();
    ok('Dates (' + loc + ' site): 05/11 is saved as 5 November, not 11 May (sent as ' + (lastW && lastW.values.AppraisalDate) + ')', isoOf(riley.AppraisalDate) === yr + '-11-05');
  }
  // names (labels)
  await o15({ as: 'tl' });
  await P.locator('.topbar >> text=Settings').click();
  await P.locator('.modal .stab:has-text("Names")').click();
  var nameIns = P.locator('.modal .settings-body input[type="text"]');
  await nameIns.nth(1).fill('Line Manager'); await nameIns.nth(2).fill('Engineer'); await nameIns.nth(3).fill('Engineers');
  await P.locator('.modal .stab:has-text("Reminders")').click();
  await P.locator('.modal select[aria-label="Reminder day 1"]').selectOption('15');
  await P.locator('.modal select[aria-label="Reminder day 2"]').selectOption('25');
  await P.locator('.modal select[aria-label="Reminder day 3"]').selectOption('');
  await P.locator('.modal button:has-text("Save settings")').click(); await P.waitForTimeout(400);
  var e16 = await db15();
  var labRow = e16.lists['1-to-1 Settings'].find(function (x) { return x.Title === 'Labels'; });
  var remRow = e16.lists['1-to-1 Settings'].find(function (x) { return x.Title === 'Reminders'; });
  ok('Names: saved to the Settings list as a Labels item', labRow && JSON.parse(labRow.Value).one === 'Engineer' && JSON.parse(labRow.Value).mgr === 'Line Manager');
  ok('Reminders: saved as [15,25]', remRow && remRow.Value === '[15,25]');
  var tl16 = await P.locator('[data-oto-root]').innerText();
  ok('Names: the page uses the new words (Engineer column, Line Manager role)', tl16.indexOf('ENGINEER') >= 0 && tl16.indexOf('Line Manager') >= 0 && tl16.toUpperCase().indexOf('TECHNICIAN\t') < 0);
  ok('Reminders: Needs your attention shows the new days', /reminders on the 15th and 25th/.test(tl16));
  await o15({ as: 'alex' });
  var a16 = await P.locator('[data-oto-root]').innerText();
  ok('Names: a team member sees the new words too', a16.indexOf('Engineer') >= 0 && a16.indexOf('Team Leader') < 0);
  await P.evaluate(function () { OTO_MOCK.reset(); });
  // team management
  await o15({ as: 'tl' });
  await openTeam(P, 'Sam Patel'); await P.locator('.topbar >> text=Team overview').click();
  await P.locator('.teammenu > summary').click(); await P.locator('.teammenu button.manage').click();
  ok('Team: Manage team opens Settings on the Team tab', (await P.locator('.modal .stab[aria-selected="true"]').innerText()).indexOf('Team') >= 0);
  await P.locator('#oto-p-q').fill('drew'); await P.locator('.modal button:has-text("Search")').click(); await P.waitForTimeout(300);
  ok('Team: people search finds a person', (await P.locator('.presult:has-text("Drew Collins")').count()) === 1);
  await P.locator('#oto-p-q').fill('sam.p'); await P.locator('.modal button:has-text("Search")').click(); await P.waitForTimeout(300);
  ok('Team: an existing member is shown as already in the team', (await P.locator('.presult:has-text("Sam Patel") >> text=Already in the team').count()) === 1);
  await P.locator('#oto-p-q').fill('drew'); await P.locator('.modal button:has-text("Search")').click(); await P.waitForTimeout(300);
  await P.locator('.presult:has-text("Drew Collins") button:has-text("Add")').click(); await P.waitForTimeout(400);
  var e17 = await db15();
  var drewRow = e17.lists['Technicians'].find(function (t) { return t.Title === 'Drew Collins'; });
  var cwT = e17.writes.filter(function (w) { return w.create && w.list === 'Technicians'; }).pop();
  ok('Team: Add creates a Technicians item with the person and Active', drewRow && drewRow.Active === true && cwT.values.Technician === JSON.stringify([{ Key: 'i:0#.f|membership|drew.collins@example.test' }]));
  ok('Team: the page itself never touches permissions (Flow 4 adds them to the group)', e17.group.indexOf('drew.collins@example.test') >= 0 && e17.writes.every(function (w) { return w.list !== '1-to-1 Technicians'; }));
  ok('Team: new person listed in the Team tab', (await P.locator('.modal tr:has-text("Drew Collins")').count()) === 1);
  await P.locator('.modal tr:has-text("Drew Collins") button:has-text("Deactivate")').click();
  await P.locator('.modal-back:last-child .modal button:has-text("Deactivate")').click(); await P.waitForTimeout(400);
  var e18 = await db15();
  ok('Team: Deactivate sets Active = No and Flow 4 removes them from the group', e18.lists['Technicians'].find(function (t) { return t.Title === 'Drew Collins'; }).Active === false && e18.group.indexOf('drew.collins@example.test') < 0);
  await P.locator('.modal button:has-text("Close")').click();
  ok('Team: closing Settings refreshes the team (6 active)', /Team \(6\)/.test(await P.locator('.topbar').innerText()));
  // expectations: reorder by buttons and by dragging
  await P.locator('.topbar >> text=Expectations').click();
  var sharedTitles = async function () { return P.evaluate(function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('tr.exprow')); return rows.slice(0, 4).map(function (r) { return r.children[1].textContent; }); }); };
  var before15 = await sharedTitles();
  ok('Expectations: no Order box on the form', (await P.locator('#oto-x-sort').count()) === 0);
  await P.locator('tr.exprow').first().locator('button[title="Move down"]').click(); await P.waitForTimeout(400);
  var after15 = await sharedTitles();
  var e19 = await db15();
  ok('Expectations: ▼ moves an expectation down and saves the new order', after15[0] === before15[1] && after15[1] === before15[0] &&
    e19.writes.slice(-2).every(function (w) { return w.list === 'Appraisal Expectations' && w.fields.length === 1 && w.fields[0] === 'SortOrder'; }));
  await P.locator('tr.exprow').nth(3).dragTo(P.locator('tr.exprow').nth(0)); await P.waitForTimeout(500);
  var after16 = await sharedTitles();
  ok('Expectations: drag and drop reorders within the group', after16[0] === after15[3] && after16[1] === after15[0]);
  var e20 = await db15();
  var shared20 = e20.lists['Appraisal Expectations'].filter(function (x) { return x.Active && x.AppliesTo === 'Shared'; }).sort(function (a, b) { return a.SortOrder - b.SortOrder; });
  ok('Expectations: SortOrder in the list matches the screen (10, 20, 30, 40)', shared20.map(function (x) { return x.Title; }).join('|') === after16.join('|') && shared20.map(function (x) { return x.SortOrder; }).join(',') === '10,20,30,40');
  await P.locator('#oto-x-title').fill('Support the area 2 outage'); await P.locator('#oto-x-meas').fill('Outage tasks closed on time');
  await P.locator('#oto-x-scope').selectOption('Individual'); await P.locator('#oto-x-tech').selectOption('Jordan Lee');
  await P.locator('button:has-text("Add expectation")').click(); await P.waitForTimeout(300);
  var e21 = await db15();
  ok('Expectations: a new individual one goes to the end of that person\'s list (after shared)', e21.lists['Appraisal Expectations'].find(function (x) { return x.Title === 'Support the area 2 outage'; }).SortOrder > 1000);
  // team overview: attention, chart switcher, no Energy column, report footer
  await P.locator('.topbar >> text=Team overview').click();
  var tv = await P.locator('[data-oto-root]').innerText();
  ok('Overview: "Needs your attention" replaces the duplicate status card', tv.indexOf('Needs your attention') >= 0 && tv.indexOf('review status') < 0);
  ok('Overview: attention lists waiting reviews and wellbeing to review', /Sam Patel – .* review is waiting for you/.test(tv) && /Sam Patel's wellbeing assessment is ready for your review/.test(tv));
  ok('Overview: Energy column removed from the appraisal outlook', (await P.locator('.nw th').allInnerTexts()).every(function (t) { return t.toUpperCase() !== 'ENERGY'; }));
  await P.locator('select.chartsel').selectOption('actions'); await P.waitForTimeout(150);
  ok('Overview: chart switches to open actions', (await P.locator('.chartcard .sub').innerText()).indexOf('Open agreed actions') === 0);
  await o15({ as: 'tl' });
  ok('Overview: the chart choice is remembered', (await P.locator('select.chartsel').inputValue()) === 'actions');
  for (var ck = 0; ck < 7; ck++) {
    var opt = ['workload', 'energy', 'actions', 'ratings', 'outcome', 'ontime', 'days'][ck];
    await P.locator('select.chartsel').selectOption(opt); await P.waitForTimeout(80);
  }
  ok('Overview: all 7 chart options draw without errors', (await P.locator('.chartcard svg').count()) >= 1);
  await P.locator('select.chartsel').selectOption('workload');
  await openTeam(P, 'Jordan Lee'); await P.locator('button:has-text("Generate appraisal report")').click();
  ok('Report: new footer wording', (await P.locator('.report-doc .note').innerText()) === 'Generated from the monthly 1-to-1 records. Wellbeing answers are deliberately excluded. The expected outcome is a guide only.');
  // appraisal timing (v4.2.1): best done in the calendar month before; a passed date is Overdue
  var cm = curMonth(), lastCm = cm + '-' + String(new Date(Date.UTC(+cm.slice(0, 4), +cm.slice(5, 7), 0)).getUTCDate());
  var aimName = new Date(cm + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  await o15({ as: 'tl' });
  var tA = await P.locator('[data-oto-root]').innerText();
  ok('Appraisal: due next month → "Aim to complete … by" the end of this month', tA.indexOf('Aim to complete Casey Brooks\'s appraisal by ' + fmt(lastCm)) >= 0, tA.slice(0, 600));
  ok('Appraisal: team table shows the aim month under Days to go', tA.indexOf('aim: in ' + aimName) >= 0 && (await P.locator('.aimnote.now').count()) >= 1);
  ok('Appraisal: dates further out are not flagged yet', tA.indexOf('Aim to complete Alex Morgan') < 0);
  await P.evaluate(function (iso) {
    var d = OTO_MOCK.current.db; d.lists['Technicians'].find(function (t) { return t.Title === 'Alex Morgan'; }).AppraisalDate = iso + 'T12:00:00Z';
    sessionStorage.setItem('oto-mock-db-v5', JSON.stringify(d));
  }, futureIso(-10));
  await o15({ as: 'tl' });
  var tO = await P.locator('[data-oto-root]').innerText();
  ok('Appraisal: a passed date says "Overdue by N days", never "Passed"', /Overdue by \d+ days/.test(tO) && tO.indexOf('Passed') < 0);
  ok('Appraisal: Needs your attention says it is overdue and to set the next date', /Alex Morgan's appraisal is overdue \(.*\) – once it's done, set the next date/.test(tO));
  ok('Appraisal: overdue tile replaces Next appraisal', /Appraisals overdue\s*1\s*Alex Morgan/i.test(tO), tO.slice(0, 500));
  await P.locator('.topbar >> text=Settings').click();
  ok('Appraisal: Settings → Team says Overdue too', /Overdue by \d+ days/.test(await P.locator('.modal').innerText()));
  await P.locator('.modal button:has-text("Cancel"), .modal button:has-text("Close")').first().click();
  await openTeam(P, 'Alex Morgan');
  ok('Appraisal: profile tile shows Overdue', /Days to appraisal\s*Overdue/i.test(await P.locator('.tiles').innerText()));
  await c15.close();

  // ---------------------------------------------------------------- 16. wellbeing assessments
  await page.evaluate(function () { OTO_MOCK.reset(); });
  var c16 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var W = await c16.newPage(); W.on('dialog', function (d) { d.accept(); });
  var eW = await open(W, { as: 'alex' });
  var dW = await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var alexWb = dW.lists['Wellbeing Assessments'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; });
  var alexOpen = alexWb.find(function (x) { return x.AssessmentStatus === 'Open'; });
  var samWb = dW.lists['Wellbeing Assessments'].find(function (x) { return x.Technician.indexOf('sam.') >= 0; });
  ok('Wellbeing: technician top bar shows Wellbeing with a to-do badge', (await W.locator('.topbar button.nav:has-text("Wellbeing") .badge').innerText()) === '1');
  var rW = await api(W, 'GET', "/_api/web/lists/getbytitle('Wellbeing%20Assessments')/items");
  ok('Wellbeing: REST returns only own assessments', rW.status === 200 && rW.json.value.length === alexWb.length && rW.json.value.every(function (x) { return x.Technician.EMail === 'alex.morgan@example.test'; }));
  ok('Wellbeing: cannot read someone else\'s by ID', (await api(W, 'GET', "/_api/web/lists/getbytitle('Wellbeing%20Assessments')/items(" + samWb.ID + ')')).status === 404);
  await W.locator('.topbar >> text=Wellbeing').click();
  await W.locator('button:has-text("Continue")').click();
  ok('Wellbeing: the form opens as steps (Start, 6 HSE areas, About you, Finish)', (await W.locator('.wbstep').count()) === 9);
  await W.locator('.wbstep').nth(1).click(); await W.waitForTimeout(120);
  ok('Wellbeing: "Is it an issue?" only shows once a question applies', !(await W.locator('.wbq').nth(4).locator('.wbq-a .wbcol').nth(1).isVisible()) &&
    await W.locator('.wbq').nth(1).locator('.wbq-a .wbcol').nth(1).isVisible());
  await W.locator('.wbstep').nth(0).click(); await W.waitForTimeout(120);
  await W.locator('#oto-wb-pos').fill('Instrument Technician');
  for (var stp = 1; stp <= 6; stp++) {
    await W.locator('.wbstep').nth(stp).click(); await W.waitForTimeout(120);
    var qs = W.locator('.wbq'), nq = await qs.count();
    for (var qi2 = 0; qi2 < nq; qi2++) {
      if (stp === 1 && qi2 === 7) {
        await qs.nth(qi2).locator('.wbq-a .wbcol').first().locator('button:has-text("Yes")').click();
        await qs.nth(qi2).locator('.wbq-a .wbcol').nth(1).locator('button:has-text("Yes")').click();
        await qs.nth(qi2).locator('.wbhelp textarea').fill('Agree a cut-off time for routine calls.');
      } else { await qs.nth(qi2).locator('.wbq-a .wbcol').first().locator('button:has-text("No")').click(); }
    }
  }
  ok('Wellbeing: each completed area gets a tick', (await W.locator('.wbstep.ok').count()) === 6);
  await W.locator('.wbstep').nth(7).click(); await W.waitForTimeout(150);
  await W.locator('.card:has-text("My circumstances") .seg button:has-text("No")').click();
  await W.locator('.wbstep').nth(8).click(); await W.waitForTimeout(150);
  ok('Wellbeing: Finish shows everything answered', (await W.locator('.done').innerText()).indexOf('Everything is answered') === 0);
  await W.locator('button:has-text("Submit to my")').click(); await W.locator('.modal button:has-text("Submit")').click(); await W.waitForTimeout(400);
  var dW2 = await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var aw16 = dW2.lists['Wellbeing Assessments'].find(function (x) { return x.ID === alexOpen.ID; });
  var wbw = dW2.writes.filter(function (w) { return w.list === 'Wellbeing Assessments' && w.as === 'alex'; });
  ok('Wellbeing: technician writes only their own fields', wbw.length >= 1 && wbw.every(function (w) { return w.id === alexOpen.ID && w.fields.every(function (f) { return ['Position', 'EmployeeNumber', 'AnswersJson', 'PersonalJson', 'AssessmentStatus'].indexOf(f) >= 0; }); }));
  ok('Wellbeing: submit → Flow 5 locks it (read-only) and stamps SubmittedOn', aw16.AssessmentStatus === 'Submitted' && !!aw16.SubmittedOn && dW2.perms['Wellbeing Assessments'][alexOpen.ID]['alex.morgan@example.test'] === 'read');
  ok('Wellbeing: answers saved (1 issue with help text)', JSON.parse(aw16.AnswersJson).d8.issue === 'Y' && JSON.parse(aw16.AnswersJson).d8.help.indexOf('cut-off') >= 0);
  ok('Wellbeing: after submit the page is read-only', (await W.locator('.wbstep').count()) === 0 && (await W.locator('text=Submitted – your').count()) === 1);
  // tamper: Test B (sam) has nothing open; use a fresh item for alex created by the TL
  await open(W, { as: 'tl' });
  await W.locator('.topbar >> text=Wellbeing').click();
  ok('Wellbeing: TL page lists the team with last completed / next review', (await W.locator('.card:has-text("Team wellbeing") tbody tr').count()) === 6);
  await W.locator('.card:has-text("Team wellbeing") tr:has-text("Casey Brooks") button:has-text("Start")').click();
  await W.locator('#oto-wb-date').fill('1/12/' + yr); await W.locator('#oto-wb-date').press('Tab');
  await W.locator('.modal button:has-text("Start assessment")').click(); await W.waitForTimeout(500);
  var dW3 = await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var casWb = dW3.lists['Wellbeing Assessments'].filter(function (x) { return x.Technician.indexOf('casey.') >= 0; }).pop();
  ok('Wellbeing: TL starts one → Flow 5 gives that person edit on that item only and emails them', casWb && casWb.AssessmentStatus === 'Open' && dW3.perms['Wellbeing Assessments'][casWb.ID]['casey.brooks@example.test'] === 'edit' &&
    dW3.emails.some(function (m) { return m.template === 'E9' && m.to === 'casey.brooks@example.test'; }) && isoOf(casWb.AssessmentDate) === yr + '-12-01');
  await open(W, { as: 'casey' });
  var tw = await api(W, 'POST', "/_api/web/lists/getbytitle('Wellbeing%20Assessments')/items(" + casWb.ID + ')/validateUpdateListItem', { formValues: [
    { FieldName: 'AssessmentStatus', FieldValue: 'Completed' }, { FieldName: 'ArrangementsJson', FieldValue: '[{"text":"Four-day week agreed"}]' },
    { FieldName: 'ManagerNotes', FieldValue: 'Approved by manager' }, { FieldName: 'NextReviewDate', FieldValue: (yr + 3) + '-01-01' },
    { FieldName: 'Technician', FieldValue: JSON.stringify([{ Key: samClaims }]) }], bNewDocumentUpdate: false });
  var dW4 = await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var cas4 = dW4.lists['Wellbeing Assessments'].find(function (x) { return x.ID === casWb.ID; });
  ok('Wellbeing tamper: a person setting "Completed" + manager fields + another owner is undone by Flow 5', tw.status === 200 && cas4.AssessmentStatus === 'Submitted' &&
    !cas4.ArrangementsJson && !cas4.ManagerNotes && !cas4.NextReviewDate && !cas4.CompletedOn && cas4.Technician.indexOf('casey.') >= 0 &&
    dW4.perms['Wellbeing Assessments'][casWb.ID]['casey.brooks@example.test'] === 'read');
  // TL reviews Sam's submitted one and completes it
  await open(W, { as: 'tl', wbId: String(samWb.ID) });
  ok('Wellbeing: ?wbId opens the assessment for the TL', (await W.locator('.pagehead h2').innerText()).indexOf('Sam Patel') >= 0);
  ok('Wellbeing: TL sees the areas flagged as an issue first', /3 areas flagged as an issue/.test(await W.locator('[data-oto-root]').innerText()));
  ok('Wellbeing: next review defaults to one year on', (await W.locator('.wbpanel input#' + (await W.locator('.wbpanel input.datef').nth(1).getAttribute('id'))).inputValue()) !== '');
  await W.locator('.wbpanel button:has-text("+ Add arrangement")').click();
  await W.locator('.wbpanel .wbarr textarea').first().fill('Check-in call before lone-working jobs');
  await W.locator('.wbpanel button:has-text("Complete")').click(); await W.locator('.modal button:has-text("Complete")').click(); await W.waitForTimeout(500);
  var dW5 = await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var sam5 = dW5.lists['Wellbeing Assessments'].find(function (x) { return x.ID === samWb.ID; });
  ok('Wellbeing: Complete saves arrangements + next review and Flow 5 stamps CompletedOn', sam5.AssessmentStatus === 'Completed' && !!sam5.CompletedOn && JSON.parse(sam5.ArrangementsJson)[0].text.indexOf('Check-in') === 0 && !!sam5.NextReviewDate &&
    dW5.emails.some(function (m) { return m.template === 'E11' && m.to === 'sam.patel@example.test'; }));
  var popW = W.waitForEvent('popup');
  await W.locator('button:has-text("Print / Save as PDF")').click();
  var pw = await popW; await pw.waitForLoadState();
  var pwt = await pw.locator('body').innerText();
  ok('Wellbeing: print has all six areas, personal input, arrangements and signature lines', ['Demands', 'Control', 'Support', 'Relationships', 'Role', 'Change', 'Personal input', 'Check-in call', 'Employee signature'].every(function (x) { return pwt.indexOf(x) >= 0; }));
  await pw.close();
  await open(W, { as: 'sam' });
  await W.locator('.topbar >> text=Wellbeing').click(); await W.locator('button:has-text("View")').first().click();
  ok('Wellbeing: the person sees the agreed arrangements once completed', (await W.locator('[data-oto-root]').innerText()).indexOf('Check-in call before lone-working jobs') >= 0);
  ok('Wellbeing: never appears in the appraisal report', true && (await (async function () { await W.locator('.topbar >> text=Appraisal report').click(); return (await W.locator('.report-doc').innerText()).indexOf('lone-working') < 0; })()));
  await c16.close();

  // ---------------------------------------------------------------- 17. XSS in wellbeing
  await page.evaluate(function () { OTO_MOCK.reset(); });
  await sweep('Technician wellbeing form (own hostile draft)', { as: 'alex', xss: '1' }, async function () { await page.locator('.topbar >> text=Wellbeing').click(); await page.locator('button:has-text("Continue")').click(); await page.locator('.wbstep').nth(1).click(); });
  var dxw = await db(page);
  var samXw = dxw.lists['Wellbeing Assessments'].find(function (x) { return x.Technician.indexOf('sam.') >= 0; });
  await sweep('TL wellbeing review of hostile answers', { as: 'tl', xss: '1', wbId: String(samXw.ID) });
  await sweep('TL wellbeing list', { as: 'tl', xss: '1' }, async function () { await page.locator('.topbar >> text=Wellbeing').click(); });

  await browser.close();
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) { process.exitCode = 1; }
}
main().catch(function (e) { console.error('TEST RUN ERROR', e); process.exitCode = 1; });
