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
  ok('Deletes only through spRecycle: one recycle() endpoint, called only for retired expectations', (code.match(/recycle\(\)/g) || []).length === 1 &&
    (code.match(/spRecycle\(/g) || []).length === 2 && /spRecycle\(CONFIG\.lists\.exp,/.test(code));
  ok('No permission endpoints called from the frontend', !/roleassignments|breakroleinheritance|resetroleinheritance|ensureuser/i.test(code.replace(/HasUniqueRoleAssignments/g, '')));
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
  await page.locator('section.card:has-text("Challenges, blockers") button:has-text("+ Add")').click();   // Q2 is folded while empty (v4.4)
  await page.locator('section.card:has-text("Challenges, blockers") textarea').first().fill('Waiting for spares');
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
  for (var i = 0; i < nSeg; i++) { await segs.nth(i).locator('button:has-text("On track")').click(); }
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
  ok('Test A: sees Team Leader ratings per expectation, in words only', (await page.locator('td:has-text("Strong progress")').count()) > 0 && (await page.locator('td:has-text("4 – Strong progress")').count()) === 0);

  // ---------------------------------------------------------------- 8. Test B cannot see Test A's released records
  await open(page, { as: 'sam' });
  var r8 = await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items");
  ok('Test B: none of Test A\'s Manager Reviews are returned', r8.json.value.every(function (x) { return x.Technician.EMail === 'sam.patel@example.test'; }));
  ok('Test B: Test A\'s released Manager Review is not readable by ID', (await api(page, 'GET', "/_api/web/lists/getbytitle('Manager%20Reviews')/items(" + alexCurMr.ID + ')')).status === 404);
  ok('Test B: submitted review is read-only in the page', (await page.locator('.pagehead button:has-text("Save draft")').count()) === 0);

  // ---------------------------------------------------------------- 9. settings (dates + bands) and BST-safe dates
  await open(page, { as: 'tl' });
  await page.locator('.topbar >> text=Settings').click();
  var caseyIn = page.locator('.modal input[aria-label="Next appraisal date for Casey Brooks"]');
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
  var sw = d9.writes.filter(function (w) { return w.list === '1-to-1 Settings' && /"max"/.test(w.values.Value || ''); }).pop();   // the Bands write
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
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(OTO_MOCK.current.db));
  }, { id: target.ID, other: samClaims });
  errs = await open(page, { as: 'tl' });
  var rowT = await page.locator('.nw tr:has-text("' + tName + '")').innerText();
  ok('D.7: tampered month/due/owner on a Monthly Review do not move or hide it in the TL view',
    rowT.indexOf('No review yet') < 0 && (await page.locator('body').innerText()).indexOf('2099') < 0, rowT);
  await page.evaluate(function (a) {   // technician has submitted; Flow 2 has not run yet (5-minute polling window)
    var rv = OTO_MOCK.current.db.lists['Monthly Reviews'].find(function (r) { return r.ID === a.id; });
    rv.ReviewStatus = 'Submitted';
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(OTO_MOCK.current.db));
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
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
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
  var ci = P.locator('.modal input[aria-label="Next appraisal date for Casey Brooks"]');
  var yr = new Date().getUTCFullYear() + 1;
  var forms = [['15/07/' + yr, yr + '-07-15'], ['15-7-' + String(yr).slice(2), yr + '-07-15'], ['15 Jul ' + yr, yr + '-07-15'], ['15th July ' + yr, yr + '-07-15'], [yr + '-07-15', yr + '-07-15'], ['3.2.' + yr, yr + '-02-03']];
  var allOk = true;
  for (var fi = 0; fi < forms.length; fi++) {
    await ci.fill(forms[fi][0]); await ci.press('Tab');
    if ((await ci.inputValue()) !== fmt(forms[fi][1])) { allOk = false; }
  }
  ok('Dates: typed as 15/07/2027, 15-7-27, 15 Jul 2027, 15th July 2027, ISO or 3.2.2027 – all understood (day first)', allOk);
  ok('Dates: the day is shown in words under the box', /Wednesday|Monday|Tuesday|Thursday|Friday|Saturday|Sunday/.test(await P.locator('.modal tr:has-text("Casey Brooks") .datehint >> nth=0').innerText()));
  await ci.fill('32/13/2027'); await ci.press('Tab');
  ok('Dates: nonsense is flagged and not taken', await ci.evaluate(function (e) { return e.classList.contains('bad'); }) && /Not recognised/.test(await P.locator('.modal tr:has-text("Casey Brooks") .datehint >> nth=0').innerText()));
  await P.locator('.modal button:has-text("Save settings")').click(); await P.waitForTimeout(200);
  ok('Dates: Save is refused while a date is flagged', (await P.locator('.modal').count()) === 1);
  await P.locator('.modal tr:has-text("Casey Brooks") .dpick >> nth=0').evaluate(function (e, v) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, yr + '-08-20');
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
    var ri = P.locator('.modal input[aria-label^="Next appraisal date for Riley"]');
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
  var jIndiv = e21.lists['Appraisal Expectations'].filter(function (x) { return x.AppliesTo === 'Individual' && x.Technician === claims('jordan.lee@example.test'); });
  var jNew = jIndiv.find(function (x) { return x.Title === 'Support the area 2 outage'; });
  ok('Expectations: a new individual one goes to the end of that person\'s list (shared always first)', jNew && jIndiv.every(function (x) { return x === jNew || x.SortOrder < jNew.SortOrder; }) &&
    (await P.locator('section.expgroup:has-text("Jordan Lee") tr').last().innerText()).indexOf('Support the area 2 outage') >= 0);
  // team overview: attention, chart switcher, no Energy column, report footer
  await P.locator('.topbar >> text=Team overview').click();
  var tv = await P.locator('[data-oto-root]').innerText();
  ok('Overview: "Needs your attention" replaces the duplicate status card', tv.indexOf('Needs your attention') >= 0 && tv.indexOf('review status') < 0);
  ok('Overview: attention lists waiting reviews and wellbeing to review', /Sam Patel – .* review is waiting for you/.test(tv) && /Sam Patel's wellbeing assessment is ready for your review/.test(tv));
  ok('Overview: Energy column removed from the appraisal outlook', (await P.locator('.nw th').allInnerTexts()).every(function (t) { return t.toUpperCase() !== 'ENERGY'; }));
  ok('Overview: the chart switcher and its charts are gone (v5)', (await P.locator('select.chartsel').count()) === 0 && (await P.locator('.chartcard').count()) === 0);
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
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
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
  ok('Wellbeing: no next date is invented – Sam has none in Settings → Team, so the box is empty', (await W.locator('.wbpanel input.datef').nth(1).inputValue()) === '');
  await W.locator('.wbpanel button:has-text("+ Add arrangement")').click();
  await W.locator('.wbpanel .wbarr textarea').first().fill('Check-in call before lone-working jobs');
  await W.locator('.wbpanel button:has-text("Complete")').click();
  var wbDlg = W.locator('.modal:has-text("wellbeing assessment")');
  await wbDlg.locator('button:has-text("Complete")').click();
  ok('Wellbeing: completing asks for the next assessment date (required, never set silently)', /Choose the next wellbeing assessment date/.test(await wbDlg.innerText()));
  var wbNext = futureIso(365);
  await wbDlg.locator('input.datef').fill(fmt(wbNext)); await wbDlg.locator('input.datef').press('Tab');
  await wbDlg.locator('button:has-text("Complete")').click(); await W.waitForTimeout(600);
  var samTech = (await W.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); })).lists['Technicians'].find(function (t) { return t.Title === 'Sam Patel'; });
  ok('Wellbeing: the confirmed date becomes the Team record\'s next wellbeing date', new Date(samTech.NextWellbeingDate).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === wbNext);
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

  // ---------------------------------------------------------------- 18. independent review fixes (v4.2.2)
  var c18 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var R = await c18.newPage(), dlg18 = [];
  R.on('dialog', function (d) { dlg18.push(d.message()); d.accept(); });
  async function save18(fn, arg) {
    await R.evaluate(function (a) { var d = OTO_MOCK.current.db; (new Function('d', 'arg', a.body))(d, a.arg); sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); }, { body: fn, arg: arg });
  }
  await open(R, { as: 'tl' }); await R.evaluate(function () { OTO_MOCK.reset(); });
  await open(R, { as: 'tl' });
  // privacy: another person's records that are (wrongly) readable are never shown
  await save18("var sam = d.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('sam.') >= 0; }).pop();" +
    "sam.Q1WentWell = 'SAM-PRIVATE-TEXT'; (d.perms['Monthly Reviews'][sam.ID] = d.perms['Monthly Reviews'][sam.ID] || {})['alex.morgan@example.test'] = 'read';" +
    "var mr = d.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === sam.ID; }); if (mr) { mr.FB_Overall = 'SAM-PRIVATE-FB'; (d.perms['Manager Reviews'][mr.ID] = d.perms['Manager Reviews'][mr.ID] || {})['alex.morgan@example.test'] = 'read'; }" +
    "var w = d.lists['Wellbeing Assessments'].find(function (x) { return x.Technician.indexOf('sam.') >= 0; }); w.Position = 'SAM-WB-PRIVATE'; (d.perms['Wellbeing Assessments'][w.ID] = d.perms['Wellbeing Assessments'][w.ID] || {})['alex.morgan@example.test'] = 'read';" +
    // and an unreleased Manager Review of Alex's own that Alex can (wrongly) read
    "var a = d.lists['Manager Reviews'].filter(function (m) { return m.Technician.indexOf('alex.') >= 0 && !m.ReleasedOn; }).pop(); a.FB_Overall = 'UNRELEASED-FB'; (d.perms['Manager Reviews'][a.ID] = d.perms['Manager Reviews'][a.ID] || {})['alex.morgan@example.test'] = 'read';");
  var errs18 = await open(R, { as: 'alex' });
  var d18 = await R.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var alexCount = d18.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length;
  var monthOpts = await R.locator('select[aria-label="Choose a month"] option').count();
  var t18 = await R.locator('[data-oto-root]').innerText();
  ok('Privacy: a readable review of someone else is not listed for a technician', monthOpts === alexCount && t18.indexOf('SAM-PRIVATE') < 0 && !errs18.length, monthOpts + ' vs ' + alexCount);
  await R.locator('.topbar >> text=Wellbeing').click();
  var t18w = await R.locator('[data-oto-root]').innerText();
  ok('Privacy: a readable wellbeing assessment of someone else is not shown', t18w.indexOf('SAM-WB-PRIVATE') < 0 && (await R.locator('[data-oto-root] table tbody tr').count()) ===
    d18.lists['Wellbeing Assessments'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length);
  var seenUnreleased = false;
  for (var mo = 0; mo < monthOpts; mo++) {
    await R.locator('.topbar >> text=This month').click();
    var optV = await R.locator('select[aria-label="Choose a month"] option').nth(mo).getAttribute('value');
    await R.locator('select[aria-label="Choose a month"]').selectOption(optV); await R.waitForTimeout(60);
    if ((await R.locator('[data-oto-root]').innerText()).indexOf('UNRELEASED-FB') >= 0) { seenUnreleased = true; }
  }
  ok('Privacy: unreleased feedback is not shown even if the record is readable', !seenUnreleased);
  // ratings outside 1–5 (or not whole) in technician-editable fields don't break the TL's pages
  await R.evaluate(function () { OTO_MOCK.reset(); });
  await save18("d.lists['Monthly Reviews'].forEach(function (x) { x.Q3WorkloadRating = 2.5; x.Mood = 9; x.ExpectationsJson = JSON.stringify((JSON.parse(x.ExpectationsJson || '[]') || []).map(function (e) { e.rating = 6; return e; })); });");
  var errsR = await open(R, { as: 'tl' });
  var tR = await R.locator('[data-oto-root]').innerText();
  ok('Robustness: out-of-range ratings do not crash Team overview', !errsR.length && tR.indexOf('Team – appraisal outlook') >= 0 && tR.indexOf('could not load') < 0, errsR.join('; '));
  await openTeam(R, 'Alex Morgan');
  ok('Robustness: … nor the profile', /days to appraisal/i.test(await R.locator('[data-oto-root]').innerText()));
  await R.locator('button:has-text("Generate appraisal report")').click();
  ok('Robustness: … nor the appraisal report', (await R.locator('.report-doc').count()) === 1);
  // Close – not submitted is not offered while a submission is still being processed
  await R.evaluate(function () { OTO_MOCK.reset(); });
  var prev18 = await R.evaluate(function () { var d = OTO_MOCK.current.db, cm = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
    var y = +cm.slice(0, 4), m = +cm.slice(5, 7) - 1; if (m === 0) { y -= 1; m = 12; } var pm = y + '-' + String(m).padStart(2, '0');
    var rv = d.lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('jordan.') >= 0 && x.MonthKey === pm; });
    var mr = d.lists['Manager Reviews'].find(function (x) { return x.ReviewItemId === rv.ID; });
    rv.ReviewStatus = 'Submitted'; mr.ReviewState = 'Open'; mr.ReleasedOn = null; mr.SubmittedOn = null;
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); return rv.ID; });
  await open(R, { as: 'tl', reviewId: String(prev18) });
  ok('Close – not submitted is disabled while the submission is being processed', await R.locator('button:has-text("Close – not submitted")').isDisabled());
  // toasts survive the redraw that follows a save
  await open(R, { as: 'tl' });
  await R.locator('.topbar >> text=Settings').click(); await R.locator('.modal button:has-text("Save settings")').click(); await R.waitForTimeout(300);
  ok('Feedback: the "Settings saved." message stays visible after the page redraws', (await R.locator('.toast').allInnerTexts()).some(function (t) { return t.indexOf('Settings saved') >= 0; }));
  // Escape closes a dialog; closing Settings with unsaved changes asks first
  await R.locator('.topbar >> text=Settings').click();
  await R.keyboard.press('Escape'); await R.waitForTimeout(100);
  ok('Accessibility: Escape closes the Settings dialog', (await R.locator('.modal').count()) === 0);
  await R.locator('.topbar >> text=Settings').click();
  var ci18 = R.locator('.modal input[aria-label="Next appraisal date for Casey Brooks"]');
  await ci18.fill('01/02/2031'); await ci18.press('Tab');
  dlg18 = [];
  await R.locator('.modal button:has-text("Close")').click(); await R.waitForTimeout(100);
  ok('Settings: closing with an unsaved date asks first', dlg18.some(function (m) { return /without saving/.test(m); }));
  // leaving without saving really discards the typed text
  await open(R, { as: 'alex' });
  var q1 = R.locator('textarea').first();
  var before18 = await q1.inputValue();
  await q1.fill('DISCARD-ME-PLEASE');
  dlg18 = [];
  await R.locator('.topbar >> text=My appraisal').click(); await R.waitForTimeout(400);
  await R.locator('.topbar >> text=This month').click(); await R.waitForTimeout(200);
  ok('Unsaved changes: leaving without saving restores the saved text', dlg18.length === 1 && (await R.locator('textarea').first().inputValue()) === before18);
  await c18.close();

  // ---------------------------------------------------------------- 19. feedback bubble (v4.3)
  var c19 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var B = await c19.newPage();
  B.on('dialog', function (d) { d.accept(); });
  await open(B, { as: 'alex' }); await B.evaluate(function () { OTO_MOCK.reset(); });
  var e19 = await open(B, { as: 'alex' });
  ok('Feedback: the bubble is shown to a technician', await B.locator('.fbk-bubble').isVisible() && !e19.length);
  await B.locator('.fbk-bubble').click();
  ok('Feedback: the panel opens with the three types and Send disabled while empty', (await B.locator('.fbk-types button').count()) === 3 &&
    await B.locator('.fbk-panel button:has-text("Send")').isDisabled());
  await B.keyboard.press('Escape'); await B.waitForTimeout(80);
  ok('Feedback: Escape closes the panel and returns focus to the bubble', (await B.locator('.fbk-panel').count()) === 0 &&
    await B.evaluate(function () { return document.activeElement && document.activeElement.classList.contains('fbk-bubble'); }));
  var q1v = await B.locator('textarea').first().inputValue();
  await B.locator('textarea').first().fill(q1v + ' (still typing)');   // an unsaved answer on the form
  await B.locator('.fbk-bubble').click();
  await B.locator('#oto-fbk-text').fill('The 📅 button on the meeting date does nothing.\nWindows laptop.');
  await B.locator('.fbk-types button:has-text("Fault")').click();
  await B.locator('.fbk-panel button:has-text("Send")').click(); await B.waitForTimeout(250);
  var d19 = await B.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  var fb19 = d19.lists['1-to-1 Feedback'][0];
  ok('Feedback: sending creates one item with the type, message, page and version', d19.lists['1-to-1 Feedback'].length === 1 && fb19.FeedbackType === 'Fault' &&
    fb19.Message.indexOf('does nothing.\nWindows laptop.') > 0 && fb19.PageName === 'This month' && fb19.AppVersion === (await B.evaluate(function () { return window.ESGOneToOne()._version; })) &&
    fb19.Title.indexOf('The 📅 button') === 0, JSON.stringify(fb19));
  ok('Feedback: the thank-you message reads exactly as agreed', (await B.locator('.fbk-note').innerText()).trim() === 'Thank you. Your feedback has been submitted to your Team Leader.');
  ok('Feedback: it is emailed to the TL naming the sender, and locked (the sender can no longer read it)', d19.emails.some(function (m) { return m.template === 'E13' && m.from === 'alex.morgan@example.test'; }) &&
    !d19.perms['1-to-1 Feedback'][fb19.ID] && (await api(B, 'GET', "/_api/web/lists/getbytitle('1-to-1 Feedback')/items")).json.value.length === 0);
  ok('Feedback: sending does not touch the unsaved form', (await B.locator('textarea').first().inputValue()) === q1v + ' (still typing)');
  // email fails → the TL sees it in Needs your attention and can read it
  await B.evaluate(function () { var d = OTO_MOCK.current.db; d.fbFail = true; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); });
  await open(B, { as: 'sam' });
  await B.locator('.fbk-bubble').click(); await B.locator('.fbk-types button:has-text("Suggestion")').click();
  await B.locator('#oto-fbk-text').fill('Could the report include last year too?'); await B.locator('.fbk-panel button:has-text("Send")').click(); await B.waitForTimeout(250);
  await open(B, { as: 'tl' });
  var at19 = await B.locator('.attn').innerText();
  ok('Feedback (email failed): the TL sees it in Needs your attention', /Feedback from Sam Patel couldn't be emailed – read it here/.test(at19), at19);
  ok('Feedback: the TL has the bubble too', await B.locator('.fbk-bubble').isVisible());
  await B.locator('.attn-row:has-text("Feedback from Sam Patel") button').click();
  ok('Feedback: the TL can read it in full', (await B.locator('.modal .fbk-msg').innerText()) === 'Could the report include last year too?' &&
    /Could not be delivered/.test(await B.locator('.modal').innerText()));
  await B.locator('.modal button:has-text("Mark as read")').click(); await B.waitForTimeout(250);
  var d19b = await B.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); });
  ok('Feedback: Mark as read removes it from the list and records Read', !/Feedback from Sam Patel/.test(await B.locator('[data-oto-root]').innerText()) &&
    d19b.lists['1-to-1 Feedback'].find(function (x) { return x.Message.indexOf('last year') >= 0; }).DeliveryStatus === 'Read');
  // a site where the Feedback list doesn't exist yet (solution not upgraded): a clear message, the text is kept
  await B.evaluate(function () { var d = OTO_MOCK.current.db; delete d.lists['1-to-1 Feedback']; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); });
  var e19c = await open(B, { as: 'tl' });
  ok('Feedback: the TL page still loads without the Feedback list', !e19c.length && (await B.locator('.attn-card').count()) === 1);
  await open(B, { as: 'jordan' });
  await B.locator('.fbk-bubble').click(); await B.locator('#oto-fbk-text').fill('Hello'); await B.locator('.fbk-panel button:has-text("Send")').click(); await B.waitForTimeout(250);
  ok('Feedback: without the list, a clear message and the text is kept', /isn't switched on yet/.test(await B.locator('.fbk-note').innerText()) &&
    (await B.locator('#oto-fbk-text').inputValue()) === 'Hello');
  await c19.close();
  // ---------------------------------------------------------------- 20. v4.4: auto-save, shorter form, Since last time
  var c20 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var S = await c20.newPage();
  S.on('dialog', function (d) { d.accept(); });
  async function db20() { return S.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  function writesBy(d, who, list) { return d.writes.filter(function (w) { return w.as === who && w.list === list && !w.create; }); }
  await open(S, { as: 'alex' }); await S.evaluate(function () { OTO_MOCK.reset(); });
  await open(S, { as: 'alex' });
  ok('Shorter form: progress shows the time left', /about \d+ min left/.test(await S.locator('.meterwrap').innerText()));
  ok('Auto-save: the status line says changes save automatically', /Changes save automatically/.test(await S.locator('.meterwrap .autosave').innerText()));
  var w0 = writesBy(await db20(), 'alex', 'Monthly Reviews').length;
  await S.locator('section.card:has-text("What has gone well") textarea').fill('Auto-saved answer');
  await S.waitForTimeout(5500);
  var d20 = await db20();
  var cur20 = d20.lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('alex.') >= 0 && x.MonthKey === curMonth(); });
  ok('Auto-save: an answer saves itself as a Draft about 4 s after typing stops, with no pop-up', writesBy(d20, 'alex', 'Monthly Reviews').length === w0 + 1 &&
    cur20.Q1WentWell === 'Auto-saved answer' && cur20.ReviewStatus === 'Draft' && /Saved \d\d:\d\d/.test(await S.locator('.meterwrap .autosave').innerText()) &&
    (await S.locator('.toast').count()) === 0);
  ok('Auto-save: a draft does not count as submitted (Manager Review still Open)', d20.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === cur20.ID; }).ReviewState === 'Open');
  await open(S, { as: 'alex' });
  w0 = writesBy(await db20(), 'alex', 'Monthly Reviews').length;
  var q1 = S.locator('section.card:has-text("What has gone well") textarea');
  await q1.fill('Edit one'); await S.waitForTimeout(1500); await q1.fill('Edit two'); await S.waitForTimeout(5500);
  d20 = await db20();
  ok('Auto-save: quick successive edits make one save, with the latest text', writesBy(d20, 'alex', 'Monthly Reviews').length === w0 + 1 &&
    d20.lists['Monthly Reviews'].find(function (x) { return x.ID === cur20.ID; }).Q1WentWell === 'Edit two');
  await open(S, { as: 'alex' });
  await S.evaluate(function () { OTO_MOCK.current.db.failWrites = 1; });
  await S.locator('section.card:has-text("What has gone well") textarea').fill('Will fail first');
  await S.waitForTimeout(5500);
  ok('Auto-save: a failed save says so quietly (no pop-up)', /Not saved/.test(await S.locator('.meterwrap .autosave').innerText()) && (await S.locator('.toast').count()) === 0);
  await S.locator('section.card:has-text("What has gone well") textarea').fill('Saved on retry');
  await S.waitForTimeout(5500);
  ok('Auto-save: the next change saves it', /Saved/.test(await S.locator('.meterwrap .autosave').innerText()) &&
    (await db20()).lists['Monthly Reviews'].find(function (x) { return x.ID === cur20.ID; }).Q1WentWell === 'Saved on retry');
  // shorter form
  await open(S, { as: 'alex' });
  var q2c = S.locator('section.card:has-text("Challenges, blockers")');
  ok('Shorter form: Q2 is folded to one line while empty', (await q2c.getAttribute('class')).indexOf('compact') >= 0 && !(await q2c.locator('textarea').first().isVisible()));
  await q2c.locator('button:has-text("+ Add")').click();
  ok('Shorter form: + Add opens Q2', await q2c.locator('textarea').first().isVisible());
  var q4c = S.locator('section.card:has-text("wellbeing, workplace support")');
  await q4c.locator('button:has-text("No")').click();
  ok('Shorter form: a question answered No folds to one line', (await q4c.getAttribute('class')).indexOf('compact') >= 0);
  await q4c.locator('button:has-text("Yes")').click();
  ok('Shorter form: changing it to Yes opens it again', (await q4c.getAttribute('class')).indexOf('compact') < 0 && await q4c.locator('textarea').isVisible());
  await S.evaluate(function (id) { var d = OTO_MOCK.current.db; d.lists['Monthly Reviews'].find(function (x) { return x.ID === id; }).Q2Issue = 'Van tyre slow puncture'; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); }, cur20.ID);
  await open(S, { as: 'alex' });
  ok('Shorter form: Q2 with text is open on load', (await S.locator('section.card:has-text("Challenges, blockers") textarea').first().inputValue()) === 'Van tyre slow puncture' &&
    await S.locator('section.card:has-text("Challenges, blockers") textarea').first().isVisible());
  // Since last time
  var since = await S.locator('.since').innerText();
  ok('Since last time: shows what was raised last month and the actions', /What you raised in/i.test(since) && /YOUR ACTIONS|Your actions/i.test(since), since.slice(0, 300));
  await S.locator('.since button:has-text("Hide")').click();
  await open(S, { as: 'alex' });
  ok('Since last time: Hide is remembered', !(await S.locator('.since .since-body').isVisible()));
  await S.locator('.since button:has-text("Show")').click();
  var opts20 = await S.locator('select[aria-label="Choose a month"] option').allTextContents();
  await S.locator('select[aria-label="Choose a month"]').selectOption({ index: 1 });
  ok('Since last time: not shown on past (read-only) months', (await S.locator('.since').count()) === 0);
  await S.evaluate(function (id) {
    var d = OTO_MOCK.current.db, rv = d.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0 && x.ID !== id; }).sort(function (x, y) { return x.MonthKey < y.MonthKey ? 1 : -1; })[0];
    rv.Q5PlanningRaise = 'Yes'; rv.Q5PlanningDetail = 'Leave in December';
    var mr = d.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === rv.ID; }); mr.FB_Q5 = 'UNRELEASED-REPLY'; mr.ReleasedOn = null; mr.ReviewState = 'Submitted';
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
  }, cur20.ID);
  await open(S, { as: 'alex' });
  var since2 = await S.locator('.since').innerText();
  ok('Since last time: unreleased feedback is never shown, with a note instead', /Feedback not released yet/.test(since2) && since2.indexOf('UNRELEASED-REPLY') < 0 && /Leave in December/.test(since2), since2.slice(0, 300));
  // the line manager's review: auto-save before release only
  await open(S, { as: 'tl' }); await S.evaluate(function () { OTO_MOCK.reset(); });
  var d20b = await (async function () { await open(S, { as: 'tl' }); return db20(); })();
  var samRv = d20b.lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('sam.') >= 0 && x.MonthKey === curMonth(); });
  var samMr = d20b.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === samRv.ID; });
  await open(S, { as: 'tl', reviewId: String(samRv.ID) });
  await S.locator('section.card:has-text("What has gone well") textarea').first().fill('TL auto-saved feedback');
  await S.waitForTimeout(5500);
  ok('Auto-save (TL): feedback on an unreleased review saves itself', (await db20()).lists['Manager Reviews'].find(function (m) { return m.ID === samMr.ID; }).FB_Q1 === 'TL auto-saved feedback');
  var relMr = d20b.lists['Manager Reviews'].find(function (m) { return m.ReleasedOn && m.ReviewItemId; });
  await open(S, { as: 'tl', reviewId: String(relMr.ReviewItemId) });
  var before20 = (await db20()).writes.length;
  ok('Released review (v5): read-only – no auto-save and no editing outside Amend', await S.locator('section.card:has-text("What has gone well") textarea').first().isDisabled() &&
    /Released – read-only\. Use Amend to change it/.test(await S.locator('[data-oto-root]').innerText()));
  await S.waitForTimeout(500);
  ok('Auto-save (TL): never on a released review (it would go live half-typed)', (await db20()).writes.length === before20);
  // the technician's wellbeing form
  await open(S, { as: 'alex' });
  await S.locator('.topbar >> text=Wellbeing').click(); await S.locator('button:has-text("Continue")').first().click(); await S.waitForTimeout(150);
  var wbw = (await db20()).writes.filter(function (w) { return w.list === 'Wellbeing Assessments'; }).length;
  await S.locator('#oto-wb-pos').fill('Senior Technician');
  await S.waitForTimeout(5500);
  ok('Auto-save: the wellbeing form saves itself too', (await db20()).writes.filter(function (w) { return w.list === 'Wellbeing Assessments'; }).length === wbw + 1);
  await c20.close();

  // ---------------------------------------------------------------- 21. bugs found by adversarial testing (16-Oct-2026)
  var c21 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var Q = await c21.newPage();
  Q.on('dialog', function (d) { d.accept(); });
  async function db21() { return Q.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  async function put21(body) { await Q.evaluate(function (b) { var d = OTO_MOCK.current.db; (new Function('d', b))(d); sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); }, body); }
  await open(Q, { as: 'alex' }); await Q.evaluate(function () { OTO_MOCK.reset(); });
  await open(Q, { as: 'alex' });
  // details of a question switched to No and back to Yes are kept and saved
  var q4c21 = Q.locator('section.card:has-text("wellbeing, workplace support")');
  await q4c21.locator('button:has-text("Yes")').click();
  await q4c21.locator('textarea').fill('Back pain after the long drive');
  await q4c21.locator('button:has-text("No")').click();
  await Q.locator('.pagehead button:has-text("Save draft")').click(); await Q.waitForTimeout(250);
  await q4c21.locator('button:has-text("Yes")').click();
  ok('Answers: details hidden by No and shown again by Yes are not lost', (await q4c21.locator('textarea').inputValue()) === 'Back pain after the long drive' &&
    !/Q4 details/.test(await Q.locator('[data-oto-root]').innerText()));
  await Q.locator('.pagehead button:has-text("Save draft")').click(); await Q.waitForTimeout(250);
  ok('Answers: … and are saved', (await db21()).lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('alex.') >= 0 && x.MonthKey === curMonth(); }).Q4WellbeingDetail === 'Back pain after the long drive');
  // "Same as last month" is auto-saved
  var w21 = (await db21()).writes.length;
  var same = Q.locator('button:has-text("Same as last month")');
  if (await same.count()) { await same.click(); await Q.waitForTimeout(5500); }
  ok('Auto-save: "Same as last month" is saved without clicking Save', !(await same.count()) || (await db21()).writes.length > w21);
  // a broken link no longer traps the technician
  await open(Q, { as: 'alex', reviewId: '99999' });
  await Q.locator('.topbar >> text=This month').click(); await Q.waitForTimeout(150);
  ok('Links: after "Review not found", This month opens the current review', (await Q.locator('select[aria-label="Choose a month"]').count()) === 1);
  // null entries in JSON columns and bad Bands don't stop the page loading
  await put21("var rv = d.lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('sam.') >= 0; }); rv.ExpectationsJson = '[null]';" +
    "var mr = d.lists['Manager Reviews'][0]; mr.ActionsJson = '[null]'; mr.ExpectationFeedbackJson = '[null,1]'; mr.ExpectationSnapshotJson = '[null]';" +
    "var w = d.lists['Wellbeing Assessments'][0]; if (w) { w.ArrangementsJson = '[null]'; }" +
    "var b = d.lists['1-to-1 Settings'].find(function (x) { return x.Title === 'Bands'; }); b.Value = '[null,null,null,null]';");
  var e21 = await open(Q, { as: 'tl' });
  ok('Robustness: null entries in JSON columns and broken Bands do not stop the TL page', !e21.length && /Team – appraisal outlook/.test(await Q.locator('[data-oto-root]').innerText()), e21.join('; '));
  var e21b = await open(Q, { as: 'sam' });
  ok('Robustness: … nor the technician page', !e21b.length && (await Q.locator('select[aria-label="Choose a month"]').count()) === 1, e21b.join('; '));
  // Reminders: the page reads the setting exactly as Flow 1 does, and Save rewrites an unreadable value
  await put21("d.lists['1-to-1 Settings'].push({ ID: d.nextId['1-to-1 Settings']++, Title: 'Reminders', Value: 'nonsense' });");
  await open(Q, { as: 'tl' });
  ok('Reminders: an unreadable setting shows as off (as Flow 1 would behave)', /reminders off/.test(await Q.locator('.attn-card').innerText()));
  await Q.locator('.topbar >> text=Settings').click(); await Q.locator('.modal button:has-text("Save settings")').click(); await Q.waitForTimeout(300);
  ok('Reminders: Save rewrites it as a clean value', (await db21()).lists['1-to-1 Settings'].find(function (x) { return x.Title === 'Reminders'; }).Value === '[]');
  // two people with the same name stay separate
  await put21("d.lists['Technicians'].find(function (x) { return x.Title === 'Sam Patel'; }).Title = 'Alex Morgan';");
  await open(Q, { as: 'tl' });
  await Q.locator('.teammenu > summary').click();
  var menu21 = await Q.locator('.teammenu .menu').innerText();
  ok('Names: two people with the same name are listed separately', /Alex Morgan \(sam\.patel@example\.test\)/.test(menu21) && (menu21.match(/Alex Morgan/g) || []).length === 2, menu21);
  // appraisal year must be in the form Flow 1 understands
  await open(Q, { as: 'tl' });
  await Q.locator('.topbar >> text=Expectations').click();
  var n21 = (await db21()).lists['Appraisal Expectations'].length;
  await Q.locator('#oto-x-title').fill('Year format check'); await Q.locator('#oto-x-meas').fill('m');
  await Q.locator('#oto-x-year').fill('2026-27');
  await Q.locator('button:has-text("Add expectation")').click(); await Q.waitForTimeout(250);
  ok('Expectations: a year like 2026-27 is refused (Flow 1 needs 2026/27)', (await db21()).lists['Appraisal Expectations'].length === n21);
  // double clicks don't create duplicates (slow server)
  await Q.evaluate(function () { OTO_MOCK.current.db.latency = 400; });
  await Q.locator('#oto-x-year').fill(await Q.evaluate(function () { var t = new Date(), y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return y + '/' + String(y + 1).slice(2); }));
  await Q.locator('button:has-text("Add expectation")').dblclick(); await Q.waitForTimeout(2500);
  ok('Double click: Add expectation creates one item, not two', (await db21()).lists['Appraisal Expectations'].filter(function (x) { return x.Title === 'Year format check'; }).length === 1);
  await Q.evaluate(function () { OTO_MOCK.current.db.latency = 0; });
  // security review: the page only trusts feedback states that Flow 6 set (item locked); floods are grouped
  await put21("var now = new Date().toISOString(), a = 'i:0#.f|membership|sam.patel@example.test';" +
    "d.lists['1-to-1 Feedback'].push({ ID: 801, Title: 'FORGED', FeedbackType: 'Fault', Message: 'FORGED-FAILED', PageName: 'p', AppVersion: 'v', DeliveryStatus: 'Failed', Created: now, Author: a });" +
    "for (var k = 0; k < 3; k++) { d.lists['1-to-1 Feedback'].push({ ID: 810 + k, Title: 'held ' + k, FeedbackType: 'Suggestion', Message: 'HELD-' + k, PageName: 'p', AppVersion: 'v', DeliveryStatus: 'Held', HasUniqueRoleAssignments: true, Created: now, Author: a }); }");
  await open(Q, { as: 'tl' });
  var at21 = await Q.locator('.attn').innerText();
  ok('Security: a sender-set "Failed" on an item the flow never handled is not shown to the TL', at21.indexOf('FORGED') < 0 && !/Feedback from Sam Patel couldn't be emailed/.test(at21), at21);
  ok('Security: messages held by the flood guard show as one row', /Sam Patel sent 3 more feedback messages than are emailed in a day/.test(at21), at21);
  await Q.locator('.attn-row:has-text("more feedback messages") button').click();
  ok('Security: the held messages can all be read and marked read together', (await Q.locator('.modal .fbk-msg').count()) === 3 &&
    await Q.locator('.modal button:has-text("Mark all as read")').isVisible());
  await Q.locator('.modal button:has-text("Close")').click();
  var tech21 = await api(Q, 'POST', "/_api/web/lists/getbytitle('1-to-1%20Feedback')/items(810)/validateUpdateListItem", { formValues: [{ FieldName: 'HasUniqueRoleAssignments', FieldValue: '1' }], bNewDocumentUpdate: false });
  ok('Security: the locked state is not a column anyone can write', tech21.status === 200 && tech21.json.value[0].HasException === true);
  // health information is not on the first screen of "Since last time"
  await put21("var rv = d.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).sort(function (x, y) { return x.MonthKey < y.MonthKey ? 1 : -1; })[1];" +
    "rv.Q4WellbeingRaise = 'Yes'; rv.Q4WellbeingDetail = 'PRIVATE-HEALTH-DETAIL';");
  await open(Q, { as: 'alex' });
  ok('Privacy: a wellbeing point in "Since last time" stays hidden until they choose Show', (await Q.locator('.since').innerText()).indexOf('PRIVATE-HEALTH-DETAIL') < 0 &&
    /you raised a wellbeing point/.test(await Q.locator('.since').innerText()));
  await Q.locator('.since button:has-text("show")').click();
  ok('Privacy: … and Show reveals it', (await Q.locator('.since').innerText()).indexOf('PRIVATE-HEALTH-DETAIL') >= 0);
  await c21.close();

  // XSS: hostile feedback shown to the TL, and typed into the panel
  await open(page, { as: 'tl', xss: '1' });
  await page.evaluate(function () {
    var d = OTO_MOCK.current.db, x = OTO_MOCK.X.join(' ');
    d.lists['1-to-1 Feedback'].push({ ID: 900, Title: x.slice(0, 60), FeedbackType: 'Fault', Message: x, PageName: x, AppVersion: x, DeliveryStatus: 'Failed', HasUniqueRoleAssignments: true,
      Created: new Date().toISOString(), Author: 'i:0#.f|membership|riley.evans@example.test' });
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
  });
  await sweep('TL reading hostile feedback', { as: 'tl', xss: '1' }, async function () { await page.locator('.attn-row:has-text("Feedback from") button').first().click(); });
  await sweep('Since last time with hostile earlier answers', { as: 'alex', xss: '1' }, async function () {
    if (!(await page.locator('.since').count())) { throw new Error('Since last time card missing'); }
    var m = page.locator('.since button:has-text("more")'); var n = await m.count(); for (var i = 0; i < n; i++) { await m.nth(0).click(); }
  });
  await sweep('Feedback panel with hostile text', { as: 'alex', xss: '1' }, async function () {
    await page.locator('.fbk-bubble').click(); await page.locator('#oto-fbk-text').fill(await page.evaluate(function () { return OTO_MOCK.X.join(' '); }));
  });

  // ---------------------------------------------------------------- 22. v4.5: clearer forms, words not numbers, focus areas
  var c22 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  var F = await c22.newPage();
  F.on('dialog', function (d) { d.accept(); });
  await open(F, { as: 'alex' }); await F.evaluate(function () { OTO_MOCK.reset(); });
  await open(F, { as: 'alex' });
  var q1card = F.locator('section.card:has-text("What has gone well")');
  await q1card.locator('textarea').fill('');
  await F.waitForTimeout(100);
  var nNeed = await F.locator('.need').count();
  ok('Forms: unanswered required questions have a subtle orange border before Submit', nNeed > 0 && (await F.locator('.invalid').count()) === 0 &&
    (await q1card.locator('textarea.need').count()) === 1, String(nNeed));
  ok('Forms: optional questions are never marked', (await F.locator('section.card:has-text("feedback for your line manager") .need').count()) === 0 &&
    (await F.locator('.side-tile .need').count()) === 0);
  await F.locator('.pagehead button:has-text("Submit")').click();
  await F.waitForTimeout(500);
  ok('Forms: Submit with something missing turns those questions red (no Submit dialog)', (await F.locator('.invalid').count()) === nNeed && (await F.locator('.need').count()) === 0 &&
    (await F.locator('.modal').count()) === 0 && (await F.locator('[aria-invalid="true"]').count()) === nNeed);
  ok('Forms: the first missing question gets the focus', await F.evaluate(function () { var a = document.activeElement; return !!a && !!a.closest('.invalid, textarea.invalid') || (a && a.classList.contains('invalid')); }));
  await q1card.locator('textarea').fill('Filled in now');
  await F.waitForTimeout(100);
  ok('Forms: the red clears as soon as that question is answered', (await q1card.locator('.invalid').count()) === 0 && (await F.locator('.invalid').count()) === nNeed - 1);
  ok('Forms: rating buttons are words for the technician (no 1–5)', (await F.locator('td .seg.words button:has-text("On track")').count()) > 0 &&
    (await F.locator('td .seg button').evaluateAll(function (bs) { return bs.filter(function (b) { return /^\s*[1-5]\s*$/.test(b.textContent); }).length; })) === 0);
  // TL: blocked save marks the empty parts of the action row
  await open(F, { as: 'tl', reviewId: String((await db(F)).lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('sam.') >= 0 && x.MonthKey === curMonth(); }).ID) });
  await F.locator('button:has-text("+ Add action")').click();
  await F.locator('.acrow').last().locator('input[aria-label="Action"]').fill('Half-written action');
  await F.locator('button:has-text("Save feedback")').first().click();
  await F.waitForTimeout(300);
  ok('Forms: TL – an incomplete action row has its empty parts marked red', (await F.locator('.acrow').last().locator('input.invalid').count()) === 2 &&
    (await F.locator('.acrow').last().locator('input[aria-label="Action"].invalid').count()) === 0);
  await F.locator('.acrow').last().locator('input[aria-label="Close-out criteria"]').fill('Done when booked');
  ok('Forms: TL – the red clears as each part is filled', (await F.locator('.acrow').last().locator('input.invalid').count()) === 1);
  // wellbeing: a blocked Submit jumps to the first unanswered step and marks it
  await F.evaluate(function () { OTO_MOCK.reset(); });
  await open(F, { as: 'alex' });
  if (await F.locator('.topbar >> text=Wellbeing').count()) {
    await F.locator('.topbar >> text=Wellbeing').click(); await F.waitForTimeout(200);
    await F.locator('button:has-text("Continue")').click(); await F.waitForTimeout(200);
    var wbSubmit = F.locator('.wbstep:has-text("Finish")');
    if (await wbSubmit.count()) {
      await wbSubmit.click(); await F.waitForTimeout(200);
      await F.locator('button:has-text("Submit to my")').click(); await F.waitForTimeout(400);
      ok('Forms: wellbeing – Submit with gaps jumps to the first unanswered area and marks it red', (await F.locator('.wbstep.on').innerText()).indexOf('Finish') < 0 &&
        (await F.locator('.seg.invalid').count()) > 0 && (await F.locator('.wbstep.miss').count()) > 0 && (await F.locator('.modal').count()) === 0);
    } else { ok('Forms: wellbeing – Submit with gaps jumps to the first unanswered area and marks it red', false, 'no open wellbeing form for alex'); }
  } else { ok('Forms: wellbeing – Submit with gaps jumps to the first unanswered area and marks it red', false, 'no Wellbeing tab'); }

  // no rating numbers anywhere a technician looks
  var NUM_RE = /\b\d\.\d\b|\/\s?5\b|\b[1-5] – (Not started|Early progress|On track|Strong progress|Fully met)|[+-]\d\.\d\d per month/;
  async function techText(Pg) { return (await Pg.locator('[data-oto-root]').innerText()).replace(/v\d+\.\d+\.\d+/g, ''); }
  async function hoverTips(Pg, sel) {
    var out = [], els = Pg.locator(sel), n = Math.min(await els.count(), 40);
    for (var i = 0; i < n; i++) { try { await els.nth(i).hover({ force: true, timeout: 1500 }); out.push(await Pg.locator('.tip').innerText()); } catch (_) { /* hidden */ } }
    return out.join('\n');
  }
  await open(F, { as: 'jordan' });
  var tf = await techText(F);
  ok('Words not numbers: technician form and side panel show no scores', !NUM_RE.test(tf), (tf.match(NUM_RE) || [''])[0]);
  ok('Words not numbers: the outlook tile shows the band, a trend word and what to focus on', (await F.locator('.side-tile:has-text("Appraisal outlook") .band').count()) > 0 &&
    /Improving|Steady|Dipping|Too early/.test(await F.locator('.side-tile:has-text("Appraisal outlook")').innerText()) &&
    (await F.locator('.side-tile:has-text("Appraisal outlook") .focus').count()) === 1);
  await F.locator('.topbar >> text=My appraisal').click(); await F.waitForTimeout(200);
  var tp = await techText(F);
  var tips = await hoverTips(F, 'svg.chart circle[fill="transparent"], .pairbars .bar');
  ok('Words not numbers: My appraisal (tiles, chart axis, bars, tooltips) shows no scores', !NUM_RE.test(tp) && !NUM_RE.test(tips) && tips.length > 0,
    (tp.match(NUM_RE) || tips.match(NUM_RE) || [''])[0]);
  ok('Words not numbers: the chart is labelled with the band names', /Exceeded/.test(await F.locator('svg.chart').first().textContent()));
  await F.locator('button:has-text("Generate appraisal report")').click(); await F.waitForTimeout(200);
  var tr = (await F.locator('.report-doc').innerText()).replace(/v\d+\.\d+\.\d+/g, '');
  ok('Words not numbers: the technician\'s appraisal report shows no scores', !NUM_RE.test(tr), (tr.match(NUM_RE) || [''])[0]);
  ok('Focus areas: the report lists up to 3 expectations to focus on', (await F.locator('.report-doc .focus li').count()) >= 1 && (await F.locator('.report-doc .focus li').count()) <= 3);
  await open(F, { as: 'tl' }); await openTeam(F, 'Jordan Lee');
  ok('Words not numbers: the Team Leader still sees the numbers', /\d\.\d/.test(await F.locator('.tiles').innerText()) && /\(average \d\.\d\)/.test(await F.locator('[data-oto-root]').innerText()));
  // focus maths: the 3 lowest averages, next band, and the top band
  var fm = await F.evaluate(function () {
    var fa = window.ESGOneToOne()._focusAreas;
    function ex(id, t, hist) { return { e: { id: id, title: t }, hist: hist.map(function (v) { return { self: v[0], tl: v[1] }; }) }; }
    var perExp = [ex(1, 'A', [[4, 4], [5, null]]), ex(2, 'B', [[2, 2], [3, 2]]), ex(3, 'C', [[3, null]]), ex(4, 'D', [[2, 1], [2, 2]]), ex(5, 'E', [[null, null]]), ex(6, 'F', [[3, 3], [4, 4]])];
    var r1 = fa({ band: { name: 'Partially met', cls: 'b1' }, perExp: perExp });
    var r2 = fa({ band: { name: 'Exceeded', cls: 'b3' }, perExp: perExp });
    var r3 = fa({ band: null, perExp: perExp });
    var names = r1 ? r1.items.map(function (x) { return x.e.title; }).join('') : '';
    return { names: names, next: r1 && r1.next ? r1.next.name : null, top: r2 ? r2.next : 'x', none: r3,
      ok: names === 'DBC' && r1.next.name === 'Met' && r2 && r2.next === null && r3 === null };
  });
  ok('Focus areas: picks the 3 lowest averages and the next band up; top band says keep it up', !!fm && fm.ok, JSON.stringify(fm));
  await c22.close();

  // ---------------------------------------------------------------- 24. fixes from the final break-it round
  var c24 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  var K = await c24.newPage();
  K.on('dialog', function (d) { d.accept(); });
  async function dbK() { return K.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  // schedule: one entry per validateUpdateListItem call, true = that call fails
  async function failSchedule(sched) {
    await K.evaluate(function (sc) {
      var d = OTO_MOCK.current.db, i = 0, dec = false;
      Object.defineProperty(d, 'failWrites', { configurable: true, enumerable: false,
        get: function () { if (dec) { dec = false; return 1; } var v = !!sc[i++]; if (v) { dec = true; } return v ? 1 : 0; }, set: function () {} });
    }, sched);
  }
  await open(K, { as: 'tl' }); await K.evaluate(function () { OTO_MOCK.reset(); });
  var dA = await dbK();
  // L1: auto-save paused on an incomplete action marks it
  var samCur = dA.lists['Monthly Reviews'].find(function (x) { return x.Technician.indexOf('sam.') >= 0 && x.MonthKey === curMonth(); });
  await open(K, { as: 'tl', reviewId: String(samCur.ID) });
  await K.locator('button:has-text("+ Add action")').click();
  await K.locator('.acrow').last().locator('input[aria-label="Action"]').fill('Half done');
  await K.waitForTimeout(5500);
  ok('Break-it fix: "auto-save paused – finish the highlighted item" really highlights it', (await K.locator('.acrow').last().locator('input.invalid').count()) === 2);
  // L2 / L3: next band by position, not name; third person for the TL
  var bandsFix = await K.evaluate(function () {
    var fa = window.ESGOneToOne()._focusAreas, pe = [{ e: { id: 1, title: 'A' }, hist: [{ self: 2, tl: null }] }];
    var r = fa({ band: { name: 'Developing', cls: 'b0' }, perExp: pe });
    return { next: r && r.next ? r.next.cls : null };
  });
  ok('Break-it fix: the next band is found by position (two bands with the same name)', bandsFix.next === 'b1', JSON.stringify(bandsFix));
  // L4: required controls have accessible names
  await open(K, { as: 'alex' });
  ok('Break-it fix: required boxes and button groups have accessible names', await K.evaluate(function () {
    var r = document.querySelector('[data-oto-root]');
    var tas = Array.prototype.every.call(r.querySelectorAll('textarea'), function (t) { return t.getAttribute('aria-label') || (t.id && r.querySelector('label[for="' + t.id + '"]')); });
    var segs = Array.prototype.every.call(r.querySelectorAll('.q-head .seg, td .seg'), function (g) { return !!g.getAttribute('aria-label'); });
    return tas && segs;
  }));
  await c24.close();

  // ---------------------------------------------------------------- 25. v5: appraisal periods and missed months (calculations)
  var c25 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  var V = await c25.newPage();
  V.on('dialog', function (d) { d.accept(); });
  async function dbV() { return V.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  async function calc(m) { return V.evaluate(function (mm) { return window.ESGOneToOne()._calc(mm); }, m); }
  function addM(key, n) { var y = +key.slice(0, 4), mo = +key.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + (mo < 9 ? '0' : '') + (mo + 1); }
  function monthsFrom(first, n, f) { var out = []; for (var i = 0; i < n; i++) { out.push(Object.assign({ month: addM(first, i), self: 3, tl: 3 }, f ? f(i) : {})); } return out; }
  await open(V, { as: 'tl' }); await V.evaluate(function () { OTO_MOCK.reset(); });
  // 12 months: completed 20-Apr-2026, the period before ran from the 10-Apr-2025 start
  var p12 = await calc({ today: '2026-05-10', ap: '2027-04-30', history: [{ start: '2025-04-10', completed: '2026-04-20', nextDue: '2027-04-30' }], start: '2026-04-20',
    reviews: monthsFrom('2025-05', 13) });
  ok('Periods: a 12-month period holds May–Apr; the completion month belongs to the period it ends', p12.periods.length === 2 && p12.periods[0].months.length === 12 &&
    p12.periods[0].months[0] === '2025-05' && p12.periods[0].months[11] === '2026-04' && p12.periods[1].months.join() === '2026-05', JSON.stringify(p12.periods.map(function (p) { return p.months; })));
  ok('Periods: the new period starts with only its own reviews (no carry-over of ratings)', p12.periods[1].points === 1 && p12.periods[0].points === 12);
  // 15 months
  var p15 = await calc({ today: '2026-05-02', ap: '2027-03-31', history: [{ start: '2025-01-15', completed: '2026-04-15', nextDue: '2027-03-31' }], start: '2026-04-15', reviews: monthsFrom('2025-02', 15) });
  ok('Periods: a 15-month period (completed later than a year) keeps all 15 reviews', p15.periods[0].months.length === 15 && p15.periods[0].counts.months === 15 && p15.periods[0].closed);
  // 23 months, 17 rated, 5 missed, current month still open
  var r23 = monthsFrom('2024-06', 23, function (i) {
    if (i === 22) { return { state: 'Open', self: null, tl: null }; }
    if ([3, 7, 11, 15, 19].indexOf(i) >= 0) { return { state: 'Closed - Not Submitted', self: null, tl: null }; }
    return { late: i === 1 || i === 2 };
  });
  var p23 = await calc({ today: '2026-04-20', ap: '2026-06-30', start: '2024-05-10', reviews: r23 });
  var cur23 = p23.periods[p23.periods.length - 1];
  ok('Missed months: 23-month period shows "17 rated reviews of 23 months · 5 missed"', cur23.text === '17 rated reviews of 23 months · 5 missed', cur23.text);
  ok('Missed months: the average and forecast use only the 17 rated reviews', cur23.points === 17 && Math.abs(cur23.current - 3) < 1e-9 && Math.abs(cur23.projected - 3) < 1e-9);
  ok('Missed months: on time is out of the reviews submitted (15 of 17), not of 23 months', cur23.onTime.onTime === 15 && cur23.onTime.total === 17 && cur23.onTime.missed === 5);
  ok('Missed months: a missed month neither extends nor breaks the on-time streak; a late one breaks it', p23.streak === 14, String(p23.streak));
  var p23b = await calc({ today: '2026-04-20', ap: '2026-06-30', start: '2024-05-10', reviews: r23.filter(function (r) { return r.state !== 'Closed - Not Submitted'; }) });
  var cur23b = p23b.periods[p23b.periods.length - 1];
  ok('Missed months: removing the missed months entirely gives the same average and forecast', Math.abs(cur23b.current - cur23.current) < 1e-9 && Math.abs(cur23b.projected - cur23.projected) < 1e-9);
  var allMissed = await calc({ today: '2026-04-20', ap: '2026-06-30', start: '2025-12-01', reviews: monthsFrom('2026-01', 3, function () { return { state: 'Closed - Not Submitted', self: null, tl: null }; }) });
  var am = allMissed.periods[allMissed.periods.length - 1];
  ok('Missed months: none submitted – no score, "0 rated reviews of 4 months · 3 missed", on time 0 of 0', am.current === null && am.projected === null && am.text === '0 rated reviews of 4 months · 3 missed' && am.onTime.total === 0, am.text);
  // the next due date never changes membership
  var hist2 = [{ start: '2024-05-10', completed: '2025-09-12', nextDue: '2026-09-30' }];
  var later = await calc({ today: '2026-04-20', ap: '2027-12-31', history: hist2, start: '2025-09-12', reviews: monthsFrom('2024-06', 22) });
  var sooner = await calc({ today: '2026-04-20', ap: '2026-05-31', history: hist2, start: '2025-09-12', reviews: monthsFrom('2024-06', 22) });
  ok('Periods: postponing or bringing forward the next appraisal never moves a review between periods',
    JSON.stringify(later.periods.map(function (p) { return p.months; })) === JSON.stringify(sooner.periods.map(function (p) { return p.months; })) && later.periods[0].months.length === 16);
  // platform change: completed early (8 months in), next one 23 months later
  var plat = await calc({ today: '2026-04-20', ap: '2028-02-29', history: [{ start: '2025-04-01', completed: '2025-12-05', nextDue: '2028-02-29' }], start: '2025-12-05', reviews: monthsFrom('2025-05', 12) });
  ok('Periods: an early completion (role move) closes an 8-month period; the next runs towards a date 23 months away', plat.periods[0].months.length === 8 &&
    plat.periods[1].months.join() === '2026-01,2026-02,2026-03,2026-04' && !plat.periods[1].closed);
  // reviews from before the first recorded start are kept as their own earlier period
  var pre = await calc({ today: '2026-04-20', ap: '2026-12-31', start: '2025-10-15', reviews: monthsFrom('2025-06', 11) });
  ok('Periods: reviews before the first period start are kept together as an earlier, closed period', pre.periods.length === 2 && pre.periods[0].noBaseline && pre.periods[0].closed &&
    pre.periods[0].months.join() === '2025-06,2025-07,2025-08,2025-09,2025-10' && pre.periods[1].months.length === 6);
  var none = await calc({ today: '2026-04-20', ap: '2026-12-31', reviews: monthsFrom('2025-10', 6, function (i) { return { self: 2 + i * 0.4 > 5 ? 5 : Math.round(2 + i * 0.4), tl: Math.round(2 + i * 0.4) }; }) });
  ok('Periods: with no period start there is one period and no forecast beyond the current score', none.periods.length === 1 && none.periods[0].noBaseline && none.periods[0].projected === none.periods[0].current);
  // a completion stored as UK midnight in summer (23:00 the day before in UTC) stays on the 1st
  var bst = await calc({ today: '2026-08-10', ap: '2027-06-30', history: [{ start: '2025-06-10', completed: '2026-05-31T23:00:00Z', nextDue: '2027-06-30' }], start: '2026-05-31T23:00:00Z', reviews: monthsFrom('2026-04', 4) });
  ok('Periods: a completion on 1 June (BST) belongs to June, not May', bst.periods[bst.periods.length - 2].months.indexOf('2026-06') >= 0 && bst.periods[bst.periods.length - 1].months.join() === '2026-07', JSON.stringify(bst.periods.map(function (p) { return p.months; })));
  // April–March boundary: the period and its reviews ignore the financial year
  ok('Periods: a period crossing 1 April keeps every month on both sides', p12.periods[0].months.indexOf('2026-03') >= 0 && p12.periods[0].months.indexOf('2026-04') >= 0 && p15.periods[0].months.indexOf('2025-04') >= 0);

  // ---------------------------------------------------------------- 26. v5: screens (Settings → Team, profile, overview, expectations, bubble)
  await open(V, { as: 'tl' });
  var root25 = await V.locator('[data-oto-root]').innerText();
  ok('UI: no "Today dd-MMM-yyyy" in the title bar', !/Today\s+\d{2}-[A-Z][a-z]{2}-\d{4}/.test(await V.locator('.titlebar').innerText()));
  ok('UI: Team overview has no "Expected appraisal outcomes" or "Workload this month" charts', !/Expected appraisal outcomes|Workload this month/.test(root25) && (await V.locator('.attn-card').count()) === 1);
  ok('UI: the feedback bubble is a pill with a visible "Feedback" label', await V.evaluate(function () {
    var b = document.querySelector('.fbk-btn, .fbk'); var l = document.querySelector('.fbk-lbl');
    return !!l && l.offsetWidth > 0 && /Feedback/.test(l.textContent);
  }));
  ok('Attention: a person with no period start is listed (Jordan)', /Set the appraisal period start for Jordan Lee/.test(root25));
  ok('Attention: a person with no next wellbeing date is listed (Sam)', /No next wellbeing date set for Sam Patel/.test(root25));
  ok('Attention: an overdue wellbeing date from the Team record is listed (Casey)', /Casey Brooks's wellbeing assessment is overdue/.test(root25));
  await V.locator('.nw a:has-text("Sam Patel")').click(); await V.waitForTimeout(200);
  var prof = await V.locator('[data-oto-root]').innerText();
  ok('Profile: Workload by month and Energy by month are gone', !/Workload by month|Energy by month/.test(prof));
  ok('Profile: shows rated reviews of calendar months for the period', /\d+ rated reviews? of \d+ months?/.test(prof), prof.slice(0, 400));
  var perSel = V.locator('select[aria-label="Appraisal period"], #oto-period');
  ok('Profile: Sam has a period selector with the earlier period', (await perSel.count()) === 1 && (await perSel.locator('option').count()) >= 2);
  // Settings → Team: wellbeing date and completion
  await V.locator('.topbar >> text=Settings').click();
  var samWbIn = V.locator('.modal input[aria-label^="Next wellbeing assessment date for Sam"]');
  ok('Settings: each person has a next wellbeing date box (typed or calendar)', (await samWbIn.count()) === 1 && (await V.locator('.modal input[aria-label^="Next wellbeing assessment date for"]').count()) >= 6);
  var wbDate = futureIso(40);
  await samWbIn.fill(fmt(wbDate)); await samWbIn.press('Tab');
  await V.locator('.modal button:has-text("Save settings")').click(); await V.waitForTimeout(500);
  var d26 = await dbV();
  var samT = d26.lists['Technicians'].find(function (t) { return t.Title === 'Sam Patel'; });
  ok('Settings: the next wellbeing date is saved on the Technicians record (verified)', samT && new Date(samT.NextWellbeingDate).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === wbDate);
  var apBefore = d26.lists['Technicians'].find(function (t) { return t.Title === 'Riley Evans'; }).AppraisalDate;
  await open(V, { as: 'tl' });
  await V.locator('.topbar >> text=Settings').click();
  await V.locator('.modal tr:has-text("Riley Evans") button:has-text("Mark appraisal completed")').click();
  var mc = V.locator('.modal').last();
  await mc.locator('input.datef').nth(0).fill(fmt(futureIso(3))); await mc.locator('input.datef').nth(0).press('Tab');
  await mc.locator('input.datef').nth(1).fill(fmt(futureIso(400))); await mc.locator('input.datef').nth(1).press('Tab');
  await mc.locator('button:has-text("Record completion")').click();
  ok('Completion: a date in the future is refused', /can't be in the future/.test(await mc.innerText()));
  var doneIso = futureIso(-2), nextIso = futureIso(380);
  await mc.locator('input.datef').nth(0).fill(fmt(doneIso)); await mc.locator('input.datef').nth(0).press('Tab');
  await mc.locator('input.datef').nth(1).fill(fmt(doneIso)); await mc.locator('input.datef').nth(1).press('Tab');
  await mc.locator('button:has-text("Record completion")').click();
  ok('Completion: the next appraisal must be after the completion', /must be after the completion/.test(await mc.innerText()));
  await mc.locator('input.datef').nth(1).fill(fmt(nextIso)); await mc.locator('input.datef').nth(1).press('Tab');
  await mc.locator('button:has-text("Record completion")').click();
  await V.locator('.modal:has-text("Record Riley Evans") button:has-text("Record completion")').click(); await V.waitForTimeout(600);
  var d26b = await dbV(), rileyT = d26b.lists['Technicians'].find(function (t) { return t.Title === 'Riley Evans'; });
  var rh = JSON.parse(rileyT.AppraisalHistoryJson || '[]');
  ok('Completion: history entry added with the actual date, start = completion, next due set', rh.length === 1 && rh[0].completed === doneIso &&
    new Date(rileyT.AppraisalCycleStart).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === doneIso &&
    new Date(rileyT.AppraisalDate).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === nextIso && rileyT.AppraisalDate !== apBefore, JSON.stringify(rh));
  var rileyRevs = d26b.lists['Monthly Reviews'].filter(function (r) { return r.Technician === claims('riley.evans@example.test'); });
  ok('Completion: every one of the person\'s reviews carries the new period boundaries (their own view)', rileyRevs.length > 0 && rileyRevs.every(function (r) { return JSON.parse(r.AppraisalBoundaries || '[]').indexOf(doneIso) >= 0; }));
  ok('Completion: no ratings or reviews were changed (only boundaries and Technicians written)', d26b.writes.filter(function (w) { return w.as === 'tl' && w.list === 'Monthly Reviews' && w.fields.some(function (f) { return f !== 'AppraisalBoundaries' && f !== 'AppraisalDate'; }); }).length === 0 &&
    d26b.writes.filter(function (w) { return w.list === 'Manager Reviews'; }).length === d26.writes.filter(function (w) { return w.list === 'Manager Reviews'; }).length);
  // expectations: grouped cards, no cap, delete permanently
  await open(V, { as: 'tl' });
  await V.locator('.topbar >> text=Expectations').click();
  var exText = await V.locator('[data-oto-root]').innerText();
  ok('Expectations: the "New items go to the end…" sentence and the 10 limit are gone', !/New items go to the end|at most|\/\s*10\b/.test(exText));
  ok('Expectations: a Shared section and one card per person', (await V.locator('section.expgroup').count()) >= 7 && /Shared/.test(await V.locator('section.expgroup').first().innerText()));
  for (var ei = 0; ei < 9; ei++) {
    await V.locator('#oto-x-title').fill('Extra shared expectation ' + (ei + 1));
    await V.locator('#oto-x-meas').fill('Measure ' + (ei + 1));
    await V.locator('#oto-x-scope').selectOption('Shared');
    await V.locator('button:has-text("Add expectation")').click(); await V.waitForTimeout(150);
  }
  var d26c = await dbV(), sharedNow = d26c.lists['Appraisal Expectations'].filter(function (x) { return x.Active && x.AppliesTo === 'Shared'; });
  var sorts = sharedNow.map(function (x) { return x.SortOrder; });
  ok('Expectations: 13 shared expectations saved – no limit of 10', sharedNow.length === 13, String(sharedNow.length));
  ok('Expectations: new items get unique SortOrders at the end of their own group', sorts.filter(function (v, i) { return sorts.indexOf(v) === i; }).length === sorts.length &&
    Math.max.apply(null, sorts) === sharedNow.find(function (x) { return x.Title === 'Extra shared expectation 9'; }).SortOrder);
  await V.locator('label:has-text("Show retired") input').check(); await V.waitForTimeout(200);
  var retRow = V.locator('tr:has-text("Update local work instructions")');
  ok('Expectations: "Delete permanently" is offered on retired items only', (await retRow.locator('button:has-text("Delete permanently")').count()) === 1 &&
    (await V.locator('tr:has-text("Right-first-time paperwork") button:has-text("Delete permanently")').count()) === 0);
  await retRow.locator('button:has-text("Delete permanently")').click();
  ok('Expectations: the confirmation warns it is removed (recycle bin) and history is kept', /recycle bin/.test(await V.locator('.modal').innerText()) && /keep their own copy/.test(await V.locator('.modal').innerText()));
  await V.locator('.modal button:has-text("Delete permanently")').click(); await V.waitForTimeout(300);
  var d26d = await dbV();
  ok('Expectations: deleted to the recycle bin, not from any review', d26d.recycled.length === 1 && d26d.recycled[0].item.Title === 'Update local work instructions' &&
    !d26d.lists['Appraisal Expectations'].some(function (x) { return x.Title === 'Update local work instructions'; }));
  await open(V, { as: 'alex' });
  var tdel = await api(V, 'POST', "/_api/web/lists/getbytitle('Appraisal%20Expectations')/items(1)/recycle()", null);
  ok('Security: a technician cannot delete anything (recycle → 403)', tdel.status === 403 || tdel.status === 404);
  // historic snapshots keep a deleted expectation's title
  ok('Expectations: reviews still hold their own copy of every expectation', d26d.lists['Monthly Reviews'].every(function (r) { return !r.ExpectationsJson || Array.isArray(JSON.parse(r.ExpectationsJson)); }));

  // ---------------------------------------------------------------- 27. v5: Team Leader amendments
  await open(V, { as: 'tl' }); await V.evaluate(function () { OTO_MOCK.reset(); });
  await open(V, { as: 'tl' });
  var d27 = await dbV();
  var jRv = d27.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims('jordan.lee@example.test') && r.MonthKey === curMonth(); });
  var jMr = d27.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === jRv.ID; });
  await open(V, { as: 'tl', reviewId: String(jRv.ID) });
  ok('Amend: a released review is read-only – no Save feedback, an Amend button', (await V.locator('.pagehead button:has-text("Save feedback")').count()) === 0 &&
    (await V.locator('.pagehead button:has-text("Amend")').count()) === 1 && await V.locator('section.card:has-text("Overall feedback") textarea').isDisabled());
  await V.locator('.pagehead button:has-text("Amend")').click(); await V.waitForTimeout(300);
  ok('Amend: amend mode makes the technician\'s answers editable', (await V.locator('section.card:has-text("What has gone well") textarea').count()) === 2 &&
    !(await V.locator('section.card:has-text("Overall feedback") textarea').isDisabled()));
  await V.locator('section.card:has-text("What has gone well") textarea').first().fill('Corrected: finished the calibration round.');
  await V.locator('section.card:has-text("Overall feedback") textarea').fill('Overall feedback corrected after our chat.');
  await V.locator('.pagehead button:has-text("Save amendment")').click();
  var amModal = V.locator('.modal:has-text("Save amendment")');
  ok('Amend: the dialog lists what changed', /Q1 What has gone well/.test(await amModal.innerText()) && /Overall feedback/.test(await amModal.innerText()));
  await amModal.locator('button:has-text("Save amendment")').click();
  ok('Amend: a reason is required', /give the reason/.test(await amModal.innerText()) && (await dbV()).lists['1-to-1 Amendments'].length === 0);
  await amModal.locator('textarea').fill('Typo in the answer, agreed with Jordan in our meeting.');
  await amModal.locator('button:has-text("Save amendment")').click(); await V.waitForTimeout(600);
  var d27b = await dbV(), am1 = d27b.lists['1-to-1 Amendments'][0];
  var ch1 = am1 ? JSON.parse(am1.ChangesJson) : [];
  ok('Amend: audit record with reason, fields and before/after; who and when from SharePoint', !!am1 && am1.Reason.indexOf('Typo') === 0 && am1.Author === claims('team.leader@example.test') && !!am1.Created &&
    ch1.some(function (c) { return c.f === 'Q1WentWell' && c.a === 'Corrected: finished the calibration round.' && c.b === jRv.Q1WentWell; }) &&
    ch1.some(function (c) { return c.f === 'FB_Overall' && c.b === jMr.FB_Overall; }) && am1.Technician === claims('jordan.lee@example.test'), JSON.stringify(am1));
  var rvNow = d27b.lists['Monthly Reviews'].find(function (r) { return r.ID === jRv.ID; }), mrNow = d27b.lists['Manager Reviews'].find(function (m) { return m.ID === jMr.ID; });
  ok('Amend: the review and the Manager Review hold the new values', rvNow.Q1WentWell === 'Corrected: finished the calibration round.' && mrNow.FB_Overall === 'Overall feedback corrected after our chat.');
  var aw = d27b.writes.slice(d27.writes.length);
  var iCreate = aw.findIndex(function (w) { return w.list === '1-to-1 Amendments' && w.create; }), iRev = aw.findIndex(function (w) { return w.list === 'Monthly Reviews'; });
  ok('Amend: the audit record is written first, then only the changed columns, then queued', iCreate === 0 && iRev > iCreate &&
    aw.filter(function (w) { return w.list === 'Monthly Reviews'; }).every(function (w) { return w.fields.join() === 'Q1WentWell'; }) &&
    aw.filter(function (w) { return w.list === 'Manager Reviews'; }).every(function (w) { return w.fields.join() === 'FB_Overall'; }) &&
    aw[aw.length - 1].list === '1-to-1 Amendments' && aw[aw.length - 1].values.NotifyStatus === 'Pending', JSON.stringify(aw.map(function (w) { return w.list + ':' + w.fields.join('+'); })));
  ok('Amend: not a resubmission – Flow 2 cancels, no "submitted" email, state and lock unchanged', d27b.flow2Cancelled >= 1 && !d27b.emails.slice(d27.emails.length).some(function (e) { return e.template === 'E3'; }) &&
    mrNow.ReviewState === 'Completed' && d27b.perms['Monthly Reviews'][jRv.ID]['jordan.lee@example.test'] === 'read');
  var e16 = d27b.emails.filter(function (e) { return e.template === 'E16'; });
  ok('Amend: Flow 8 emails the technician once (E16) and marks it Sent', e16.length === 1 && e16[0].to === 'jordan.lee@example.test' && am1.NotifyStatus === 'Sent' && !!am1.NotifiedOn);
  await open(V, { as: 'tl', reviewId: String(jRv.ID) });
  ok('Amend: the review shows "Amended (1)" with the details for the TL', (await V.locator('.pagehead .chip:has-text("Amended (1)")').count()) === 1 &&
    /Typo in the answer/.test(await V.locator('section.card:has-text("Amended (1)")').textContent()));
  await open(V, { as: 'tl' }); await open(V, { as: 'tl' });
  ok('Amend: reloading never sends the email again', (await dbV()).emails.filter(function (e) { return e.template === 'E16'; }).length === 1);
  await open(V, { as: 'jordan' });
  var jText = await V.evaluate(function () { var r = document.querySelector('[data-oto-root]'); return r.innerText + ' ' + Array.prototype.map.call(r.querySelectorAll('textarea'), function (t) { return t.value; }).join(' '); });
  ok('Amend: the technician sees the amended review', /Corrected: finished the calibration round/.test(jText) && /Overall feedback corrected/.test(jText));
  var amRead = await api(V, 'GET', "/_api/web/lists/getbytitle('1-to-1%20Amendments')/items", null);
  ok('Security: a technician cannot read the amendment audit (list hidden)', amRead.status === 404 || amRead.status === 403);
  var jForge = await api(V, 'POST', "/_api/web/lists/getbytitle('Monthly%20Reviews')/items(" + jRv.ID + ')/validateUpdateListItem', { formValues: [{ FieldName: 'Q1WentWell', FieldValue: 'tamper' }], bNewDocumentUpdate: false });
  ok('Security: the technician still cannot edit the locked review (403)', jForge.status === 403);
  // amending a submitted (not released) review: answers only, feedback keeps saving as normal
  var rRv = d27.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims('riley.evans@example.test') && r.MonthKey === curMonth(); });
  await open(V, { as: 'tl', reviewId: String(rRv.ID) });
  ok('Amend: a submitted review keeps Save feedback and Complete, plus "Amend answers"', (await V.locator('.pagehead button:has-text("Save feedback")').count()) === 1 &&
    (await V.locator('.pagehead button:has-text("Amend answers")').count()) === 1);
  await V.locator('.pagehead button:has-text("Amend answers")').click(); await V.waitForTimeout(300);
  ok('Amend: on a submitted review only the answers are editable', await V.locator('section.card:has-text("Overall feedback") textarea').isDisabled() &&
    !(await V.locator('section.card:has-text("What has gone well") textarea').first().isDisabled()));
  // a change made elsewhere since the amendment started is refused
  await V.locator('section.card:has-text("What has gone well") textarea').first().fill('Changed while someone else edited');
  await V.evaluate(function (id) { var d = OTO_MOCK.current.db; d.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === id; }).Modified = '2099-01-01T00:00:00Z'; }, rRv.ID);
  await V.locator('.pagehead button:has-text("Save amendment")').click();
  await V.locator('.modal:has-text("Save amendment") textarea').fill('Test'); await V.locator('.modal:has-text("Save amendment") button:has-text("Save amendment")').click(); await V.waitForTimeout(400);
  var d27c = await dbV();
  ok('Amend: refused when the review changed elsewhere – nothing written, no audit record', /changed elsewhere/.test(await V.locator('.toast').innerText()) &&
    d27c.lists['1-to-1 Amendments'].length === 1 && d27c.lists['Monthly Reviews'].find(function (r) { return r.ID === rRv.ID; }).Q1WentWell !== 'Changed while someone else edited');
  // a failed email is visible and can be resent
  await V.evaluate(function () { OTO_MOCK.current.db.amFail = true; });
  var sRv = d27.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims('sam.patel@example.test') && r.MonthKey === curMonth(); });
  await open(V, { as: 'tl', reviewId: String(sRv.ID) });
  await V.evaluate(function () { var d = OTO_MOCK.current.db; d.amFail = true; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); });
  await V.locator('.pagehead button:has-text("Amend answers")').click(); await V.waitForTimeout(300);
  await V.locator('section.card:has-text("Feedback for") textarea').first().fill('Added after the meeting');
  await V.locator('.pagehead button:has-text("Save amendment")').click();
  await V.locator('.modal:has-text("Save amendment") textarea').fill('Sam asked me to add this'); await V.locator('.modal:has-text("Save amendment") button:has-text("Save amendment")').click(); await V.waitForTimeout(500);
  await open(V, { as: 'tl' });
  var failRow = V.locator('.attn-row:has-text("couldn\'t be sent")');
  ok('Amend: a failed email shows in Needs your attention with Resend, and the TL got a notice', (await failRow.count()) === 1 && (await dbV()).emails.some(function (e) { return e.template === 'E16-notice'; }));
  await V.evaluate(function () { var d = OTO_MOCK.current.db; d.amFail = false; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); });
  await failRow.locator('button:has-text("Resend")').click(); await V.waitForTimeout(400);
  var d27d = await dbV(), am2 = d27d.lists['1-to-1 Amendments'][1];
  ok('Amend: Resend sends it (Retry → Sent), one email for that amendment', am2.NotifyStatus === 'Sent' && d27d.emails.filter(function (e) { return e.template === 'E16' && e.amId === am2.ID; }).length === 1);
  // left half-way (page closed after the audit record): Needs your attention explains it
  await V.evaluate(function (ids) {
    var d = OTO_MOCK.current.db, old = new Date(Date.now() - 3600000).toISOString();
    d.lists['1-to-1 Amendments'].push({ ID: 90, Title: 'x', ReviewItemId: ids.r, ManagerReviewId: 0, MonthKey: ids.m, Technician: 'i:0#.f|membership|riley.evans@example.test', Reason: 'r',
      ChangedFields: 'Q1 What has gone well', ChangesJson: JSON.stringify([{ l: 'rv', f: 'Q1WentWell', b: 'old', a: 'a value never saved' }]), NotifyStatus: 'Draft', Created: old, Modified: old, Author: 'i:0#.f|membership|team.leader@example.test' });
    sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
  }, { r: rRv.ID, m: curMonth() });
  await open(V, { as: 'tl' });
  var draftRow = V.locator('.attn-row:has-text("wasn\'t saved")');
  ok('Amend: an amendment left unfinished is listed', (await draftRow.count()) === 1);
  await draftRow.locator('button:has-text("Dismiss")').click(); await V.locator('.modal button:has-text("Dismiss")').click(); await V.waitForTimeout(300);
  ok('Amend: dismissing marks it Cancelled and emails nobody', (await dbV()).lists['1-to-1 Amendments'].find(function (x) { return x.ID === 90; }).NotifyStatus === 'Cancelled' &&
    (await dbV()).emails.filter(function (e) { return e.amId === 90; }).length === 0);
  // before Setup 1.4 the page still loads and released reviews are read-only
  await V.evaluate(function () { var d = OTO_MOCK.current.db; d.v13 = true; sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d)); });
  var e13 = await open(V, { as: 'tl', reviewId: String(jRv.ID) });
  ok('Upgrade order: before Setup 1.4 the page loads, released reviews are read-only and say why', e13.length === 0 && (await V.locator('.pagehead button:has-text("Amend")').count()) === 0 &&
    /needs solution 1\.4/.test(await V.locator('[data-oto-root]').innerText()), e13.join('|'));
  var e13t = await open(V, { as: 'alex' });
  ok('Upgrade order: before Setup 1.4 the technician\'s page loads', e13t.length === 0);
  await c25.close();
  await sweep('amendment reason and before/after read by the TL', { as: 'tl', xss: '1' }, async function () {
    var dd = await db(page), rv = dd.lists['Monthly Reviews'].find(function (r) { return r.ReviewStatus === 'Completed'; });
    await page.evaluate(function (id) {
      var d = OTO_MOCK.current.db, x = OTO_MOCK.X.join(' '), old = new Date(Date.now() - 7200000).toISOString();
      d.lists['1-to-1 Amendments'].push({ ID: 91, Title: x, ReviewItemId: id, ManagerReviewId: 0, MonthKey: '2026-01', Technician: 'i:0#.f|membership|alex.morgan@example.test', Reason: x,
        ChangedFields: x, ChangesJson: JSON.stringify([{ l: 'rv', f: 'Q1WentWell', b: x, a: x }, { l: 'mr', f: 'ActionsJson', b: '[]', a: JSON.stringify([{ text: x, owner: x, status: 'Open' }]) }]),
        NotifyStatus: 'Failed', NotifyError: x, Created: old, Modified: old, Author: 'i:0#.f|membership|team.leader@example.test' });
      sessionStorage.setItem('oto-mock-db-v8', JSON.stringify(d));
    }, rv.ID);
    await open(page, { as: 'tl', xss: '1', reviewId: String(rv.ID) });
    await page.locator('details.amend summary').first().click();
    if (!(await page.locator('details.amend').count())) { throw new Error('no amendment history'); }
  });
  await sweep('amend mode with hostile answers', { as: 'tl', xss: '1' }, async function () {
    var dd = await db(page), rv = dd.lists['Monthly Reviews'].find(function (r) { return r.Technician === samClaims && r.MonthKey === CUR; });
    await open(page, { as: 'tl', xss: '1', reviewId: String(rv.ID) });
    await page.locator('.pagehead button:has-text("Amend answers")').click(); await page.waitForTimeout(300);
  });

  await browser.close();
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) { process.exitCode = 1; }
}
main().catch(function (e) { console.error('TEST RUN ERROR', e); process.exitCode = 1; });
