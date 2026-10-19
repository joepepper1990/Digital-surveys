// ESG 1-to-1 reset tool – automated tests against the local SharePoint mock (no tenant, no network).
// Run from 02-frontend:   node tools/build-mock.js && node test/run-reset-tests.js
'use strict';
var fs = require('fs');
var path = require('path');
var PW = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright';
var CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium = require(PW).chromium;
var BASE = path.join(__dirname, '..');
var PAGE = 'file://' + path.join(BASE, 'mock', 'reset.html');
var results = [];
function ok(name, cond, detail) { results.push({ name: name, pass: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail && !cond ? '  — ' + detail : '')); }

function staticChecks() {
  var js = fs.readFileSync(path.join(BASE, 'reset', 'one-to-one-reset.js'), 'utf8');
  var html = fs.readFileSync(path.join(BASE, 'reset', 'one-to-one-reset.html'), 'utf8');
  var code = js.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
  ok('Reset static: no innerHTML/outerHTML/insertAdjacentHTML/document.write', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code));
  ok('Reset static: no eval / new Function / string timers', !/\beval\s*\(|new Function|setTimeout\(\s*['"]|setInterval\(/.test(code));
  ok('Reset static: no external URLs', !/https?:\/\//.test(code) && !/https?:\/\//.test(html));
  ok('Reset static: one delete call (recycle), no update or create, no permission endpoints', (code.match(/recycle\(\)/g) || []).length === 1 &&
    !/validateUpdateListItem|AddValidateUpdateItemUsingPath|roleassignment|breakroleinheritance|resetroleinheritance|deleteObject|DeleteObject/i.test(code));
  ok('Reset static: Technicians and 1-to-1 Settings are not in its lists', !/title: 'Technicians'|title: '1-to-1 Settings'/.test(code));
  ok('Reset static: no email addresses or tenant hosts', !/[\w.-]+@[\w-]+\.[\w.]+/.test(js + html) && !/sharepoint\.com/i.test(js + html));
  ok('Reset static: layout exports ESGOneToOneReset and has no Handlebars', /data-exports="ESGOneToOneReset"/.test(html) && html.indexOf('{' + '{') < 0);
}

async function main() {
  staticChecks();
  var browser = await chromium.launch({ executablePath: CHROME });
  var context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  var page = await context.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(e.message); });
  async function open(params) {
    var u = new URL(PAGE); Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); });
    await page.goto(u.toString());
    await page.waitForFunction(function () { var r = document.querySelector('[data-reset-root]'); return r && /reset|Team Leader/.test(r.innerText) && !/Reading the lists/.test(r.innerText); }, null, { timeout: 8000 });
    await page.waitForTimeout(150);
  }
  async function db() { return page.evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  function step(n) { return page.locator('section.rs-step').nth(n - 1); }

  await open({ as: 'tl' });
  await page.evaluate(function () { OTO_MOCK.reset(); });
  await open({ as: 'tl' });
  var d0 = await db();
  var keep = JSON.stringify({ t: d0.lists['Technicians'], s: d0.lists['1-to-1 Settings'], p: d0.perms, g: d0.group });
  var text0 = await page.locator('[data-reset-root]').innerText();
  ok('Inventory: every list counted (reviews, manager reviews, wellbeing, feedback, amendments, expectations)', ['Monthly Reviews', 'Manager Reviews', 'Wellbeing Assessments', '1-to-1 Feedback', '1-to-1 Amendments', 'Appraisal Expectations'].every(function (l) {
    return text0.indexOf(l + ' – ' + d0.lists[l].length + ' record') >= 0; }), text0.slice(0, 600));
  ok('Inventory: a list that doesn\'t exist on the site (Challenges) is shown as nothing to do', /1-to-1 Challenges[\s\S]*Not on this site/.test(text0));
  ok('Inventory: nothing is selected to start with, and Technicians / Settings are not offered', /0 selected/.test(text0) && !/Technicians –|1-to-1 Settings –/.test(text0));
  ok('Steps: backup, dry run and delete are disabled with nothing selected', await step(2).locator('button:has-text("Download backup")').isDisabled() &&
    await step(3).locator('button').isDisabled() && await step(4).locator('button.danger').isDisabled());

  // a Monthly Review and its Manager Review are always picked together
  await page.locator('details.rs-list:has-text("Manager Reviews") summary').click();
  await page.locator('details.rs-list:has-text("Manager Reviews") tbody input[type="checkbox"]').first().check();
  ok('Pairs: ticking a Manager Review also ticks its Monthly Review', /Monthly Reviews – \d+ records · 1 selected/.test(await page.locator('section.rs-step').first().innerText()) &&
    (await step(4).locator('button.danger').innerText()) === 'Delete 2 records');
  await page.locator('details.rs-list:has-text("Manager Reviews") tbody input[type="checkbox"]').first().uncheck();
  ok('Pairs: unticking it unticks both', (await step(4).locator('button.danger').innerText()) === 'Delete 0 records');
  // choose: everything for Sam Patel, except expectations
  await page.locator('select[aria-label="Filter by person"]').selectOption('Sam Patel');
  await page.locator('button:has-text("Select all shown")').click();
  var samRv = d0.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('sam.') >= 0; }).length;
  var samMr = d0.lists['Manager Reviews'].filter(function (x) { return x.Technician.indexOf('sam.') >= 0; }).length;
  var samWb = d0.lists['Wellbeing Assessments'].filter(function (x) { return x.Technician.indexOf('sam.') >= 0; }).length;
  var n = samRv + samMr + samWb;
  ok('Choose: filter by person + select all picks only that person\'s records, never expectations', (await page.locator('section.rs-step').first().innerText()).indexOf('Appraisal Expectations – ' + d0.lists['Appraisal Expectations'].length + ' records · 0 selected') >= 0 &&
    (await step(4).locator('button.danger').innerText()) === 'Delete ' + n + ' records');
  ok('Steps: the dry run waits for a backup', await step(3).locator('button').isDisabled());
  var dl = page.waitForEvent('download');
  await step(2).locator('button:has-text("Download backup")').click();
  var file = await dl;
  var bk = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  await page.waitForTimeout(200);
  var bRv = bk.lists['Monthly Reviews'] || [];
  ok('Backup: a JSON file with every selected record and all its columns', bk.count === n && bRv.length === samRv && (bk.lists['Manager Reviews'] || []).length === samMr &&
    bRv.every(function (r) { return 'Q1WentWell' in r && 'ExpectationsJson' in r && 'ReviewStatus' in r; }) && !bk.lists['Technicians'] && !bk.lists['Appraisal Expectations'], JSON.stringify(Object.keys(bk.lists)));
  ok('Backup: nothing was changed by it', JSON.stringify((await db()).lists) === JSON.stringify(d0.lists));
  await step(3).locator('button').click();
  var dryText = await step(3).innerText();
  ok('Dry run: lists what would go, per list, and changes nothing', dryText.indexOf('Monthly Reviews: ' + samRv) >= 0 && dryText.indexOf('Manager Reviews: ' + samMr) >= 0 &&
    JSON.stringify((await db()).lists) === JSON.stringify(d0.lists) && (await db()).recycled.length === 0);
  ok('Delete: still disabled until Flow 1 is confirmed off', await step(4).locator('button.danger').isDisabled());
  await step(4).locator('#rs-flow1').check();
  await step(4).locator('input[type="text"]').fill('delete them');
  await step(4).locator('button.danger').click(); await page.waitForTimeout(200);
  ok('Delete: the wrong confirmation text deletes nothing', /Type exactly: DELETE/.test(await page.locator('.rs-msg').innerText()) && (await db()).recycled.length === 0);
  // changing the selection after the backup needs a new backup
  await page.locator('select[aria-label="Filter by person"]').selectOption('');
  var other = page.locator('details.rs-list:has-text("Wellbeing Assessments") tbody tr:not(:has-text("Sam Patel")) input[type="checkbox"]').first();
  await other.check();
  ok('Selection: changing it after the backup asks for a new backup', /The selection changed/.test(await step(2).innerText()) && await step(3).locator('button').isDisabled());
  await page.locator('details.rs-list:has-text("Wellbeing Assessments") tbody tr:not(:has-text("Sam Patel")) input[type="checkbox"]').first().uncheck();
  // back to the backed-up selection: the backup matches again
  ok('Selection: back to what was backed up, the backup counts again', /Backed up/.test(await step(2).innerText()));
  await step(3).locator('button').click();
  await step(4).locator('#rs-flow1').check();
  await step(4).locator('input[type="text"]').fill('DELETE ' + n + ' RECORDS');
  await step(4).locator('button.danger').click();
  await page.waitForFunction(function () { return /Verification/.test(document.querySelector('[data-reset-root]').innerText); }, null, { timeout: 8000 });
  var d1 = await db();
  ok('Delete: exactly the selected records went to the recycle bin', d1.recycled.length === n &&
    d1.recycled.every(function (x) { return String(x.item.Technician || '').indexOf('sam.') >= 0; }) &&
    !d1.lists['Monthly Reviews'].some(function (x) { return x.Technician.indexOf('sam.') >= 0; }) &&
    d1.lists['Monthly Reviews'].length === d0.lists['Monthly Reviews'].length - samRv, String(d1.recycled.length));
  ok('Delete: Technicians, Settings, permissions and the group are byte-for-byte unchanged', JSON.stringify({ t: d1.lists['Technicians'], s: d1.lists['1-to-1 Settings'], p: d1.perms, g: d1.group }) === keep);
  ok('Delete: no item was edited or created (deletes only)', d1.writes.length === d0.writes.length + n && d1.writes.slice(d0.writes.length).every(function (w) { return w.recycle; }));
  ok('Delete: everyone else\'s records are untouched', d1.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length ===
    d0.lists['Monthly Reviews'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length && d1.lists['Appraisal Expectations'].length === d0.lists['Appraisal Expectations'].length);
  var ver = await step(5).innerText();
  ok('Verification: re-reads SharePoint and reports 0 failed, 0 still there, and the counts left', ver.indexOf(n + ' deleted · 0 failed · 0 still there') >= 0 && /Monthly Reviews: \d+ left/.test(ver), ver);
  var dl2 = page.waitForEvent('download');
  await step(5).locator('button:has-text("Download the report")').click();
  var rep = JSON.parse(fs.readFileSync(await (await dl2).path(), 'utf8'));
  ok('Verification: a downloadable report lists every deleted record', rep.deleted.length === n && rep.failed.length === 0 && rep.stillThere.length === 0);
  // a failure part-way is reported, not hidden
  await page.evaluate(function () {
    var d = OTO_MOCK.current.db, orig = OTO_MOCK.current.client.post.bind(OTO_MOCK.current.client), k = 0;
    OTO_MOCK.current.client.post = function (url, c, o) { if (/recycle/.test(url) && k++ === 1) { return Promise.resolve({ status: 500, ok: false, text: function () { return Promise.resolve('{}'); } }); } return orig(url, c, o); };
  });
  await page.locator('select[aria-label="Filter by person"]').selectOption('Riley Evans');
  await page.locator('button:has-text("Select all shown")').click();
  var dl3 = page.waitForEvent('download'); await step(2).locator('button:has-text("Download backup")').click(); await dl3; await page.waitForTimeout(150);
  await step(3).locator('button').click(); await step(4).locator('#rs-flow1').check();
  var nR = Number((await step(4).locator('button.danger').innerText()).replace(/\D/g, ''));
  await step(4).locator('input[type="text"]').fill('DELETE ' + nR + ' RECORDS'); await step(4).locator('button.danger').click();
  await page.waitForFunction(function () { return /Finished/.test(document.querySelector('[data-reset-root]').innerText); }, null, { timeout: 8000 });
  ok('Failure: a record SharePoint refused is reported as failed (and stays)', /(\d+) deleted · 1 failed · 0 still there/.test(await step(5).innerText()), await step(5).innerText());

  // ---- 1.5 action tracker: a separate, separately authorised group; an action goes with its updates and emails
  await page.evaluate(function () { OTO_MOCK.reset(); });
  await open({ as: 'tl' });
  await page.evaluate(function () {
    var d = OTO_MOCK.current.db, a = d.lists['1-to-1 Actions'].find(function (x) { return x.Title === 'Complete the confined space refresher'; }), now = new Date().toISOString();
    d.lists['1-to-1 Action Updates'].push({ ID: d.nextId['1-to-1 Action Updates']++, __v: 1, Title: 'Update', ActionId: a.ID, Kind: 'progress', Message: 'x', ClientKey: 'up-r1', ProcessState: 'Applied',
      FileDirRef: '/sites/esg-1to1/Lists/OneToOneActionUpdates/u11', FSObjType: 0, Created: now, Modified: now, Author: 'i:0#.f|membership|alex.morgan@example.test' });
    d.lists['1-to-1 Action Updates'].push({ ID: d.nextId['1-to-1 Action Updates']++, __v: 1, Title: 'Update', ActionId: 99999, Kind: 'progress', Message: 'orphan', ClientKey: 'up-orphan', ProcessState: 'Rejected',
      FileDirRef: '/sites/esg-1to1/Lists/OneToOneActionUpdates/u11', FSObjType: 0, Created: now, Modified: now, Author: 'i:0#.f|membership|alex.morgan@example.test' });
    d.lists['1-to-1 Action Notices'].push({ ID: d.nextId['1-to-1 Action Notices']++, __v: 1, Title: 'E20-a' + a.ID + '-x', NoticeKey: 'E20-a' + a.ID + '-x', Kind: 'E20', ActionId: a.ID, Status: 'Sent', Attempts: 1, Created: now, Modified: now });
    sessionStorage.setItem('oto-mock-db-v9', JSON.stringify(d));
  });
  await open({ as: 'tl' });
  var t0 = await db(), tA = t0.lists['1-to-1 Actions'].find(function (x) { return x.Title === 'Complete the confined space refresher'; });
  var alexActs0 = t0.lists['1-to-1 Actions'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length;
  var tt = await page.locator('[data-reset-root]').innerText();
  ok('Tracker: tracked actions are hidden until "Include tracked actions" is ticked', !/1-to-1 Actions –/.test(tt) && /Include tracked actions/.test(tt) && /separate written approval/.test(tt));
  // deleting a person's reviews never deletes their actions
  await page.locator('select[aria-label="Filter by person"]').selectOption('Alex Morgan');
  await page.locator('#rs-tracker').check();
  await page.locator('button:has-text("Select all shown")').click();
  var tt2 = await page.locator('section.rs-step').first().innerText();
  ok('Tracker: "Select all shown" never picks tracked actions, even with the group shown', /1-to-1 Actions – \d+ records · 0 selected/.test(tt2) && /1-to-1 Action Updates – \d+ records · 0 selected/.test(tt2), tt2.slice(0, 900));
  await page.locator('#rs-tracker').uncheck();
  var nA = Number((await step(4).locator('button.danger').innerText()).replace(/\D/g, ''));
  var dlA = page.waitForEvent('download'); await step(2).locator('button:has-text("Download backup")').click(); await dlA; await page.waitForTimeout(150);
  await step(3).locator('button').click(); await step(4).locator('#rs-flow1').check();
  await step(4).locator('input[type="text"]').fill('DELETE ' + nA + ' RECORDS'); await step(4).locator('button.danger').click();
  await page.waitForFunction(function () { return /Finished/.test(document.querySelector('[data-reset-root]').innerText); }, null, { timeout: 8000 });
  var t1 = await db();
  ok('Tracker: deleting a person\'s reviews leaves their actions, updates and emails alone', t1.lists['1-to-1 Actions'].filter(function (x) { return x.Technician.indexOf('alex.') >= 0; }).length === alexActs0 &&
    t1.lists['1-to-1 Action Updates'].length === t0.lists['1-to-1 Action Updates'].length && t1.lists['1-to-1 Action Notices'].length === t0.lists['1-to-1 Action Notices'].length &&
    !t1.recycled.some(function (x) { return /^1-to-1 Action/.test(x.list); }));
  // selecting an action selects its updates and emails; they go first; nothing else does
  await open({ as: 'tl' });
  await page.locator('#rs-tracker').check();
  var invT = await page.locator('section.rs-step').first().innerText();
  var realUpd = t1.lists['1-to-1 Action Updates'].filter(function (x) { return x.FSObjType !== 1; }).length;
  ok('Tracker: update folders are never listed (only updates)', invT.indexOf('1-to-1 Action Updates – ' + realUpd + ' record') >= 0, invT.slice(0, 900));
  await page.locator('details.rs-list:has-text("1-to-1 Actions –") summary').click();
  await page.locator('details.rs-list:has-text("1-to-1 Actions –") tr:has-text("Complete the confined space refresher") input[type="checkbox"]').check();
  var btnTxt = await step(4).locator('button.danger').innerText();
  ok('Tracker: ticking an action ticks its update and its email too (3 records)', btnTxt === 'Delete 3 records', btnTxt);
  ok('Tracker: an update that belongs to an action can\'t be ticked on its own', await page.locator('details.rs-list:has-text("1-to-1 Action Updates") input[title^="Selected with its action"]').first().isDisabled());
  var dlT = page.waitForEvent('download'); await step(2).locator('button:has-text("Download backup")').click(); var bkT = JSON.parse(fs.readFileSync(await (await dlT).path(), 'utf8')); await page.waitForTimeout(150);
  ok('Tracker: the backup holds the action, its update and its email, every column', (bkT.lists['1-to-1 Actions'] || []).length === 1 && 'HistoryJson' in bkT.lists['1-to-1 Actions'][0] &&
    (bkT.lists['1-to-1 Action Updates'] || []).length === 1 && (bkT.lists['1-to-1 Action Notices'] || []).length === 1);
  await step(3).locator('button').click(); await step(4).locator('#rs-flow1').check();
  await step(4).locator('input[type="text"]').fill('DELETE 3 RECORDS'); await step(4).locator('button.danger').click(); await page.waitForTimeout(200);
  ok('Tracker: the confirmation phrase names the tracker records', /Type exactly: DELETE 3 RECORDS INCLUDING 3 TRACKER RECORDS/.test(await page.locator('.rs-msg').innerText()));
  await step(4).locator('input[type="text"]').fill('DELETE 3 RECORDS INCLUDING 3 TRACKER RECORDS'); await step(4).locator('button.danger').click();
  await page.waitForFunction(function () { return /Finished/.test(document.querySelector('[data-reset-root]').innerText); }, null, { timeout: 8000 });
  var t2 = await db(), rec = t2.recycled.slice(t1.recycled.length);
  ok('Tracker: the email and update go first, then the action – no orphans left', rec.length === 3 && rec[0].list === '1-to-1 Action Notices' && rec[1].list === '1-to-1 Action Updates' && rec[2].list === '1-to-1 Actions' &&
    rec[2].item.ID === tA.ID && !t2.lists['1-to-1 Action Updates'].some(function (x) { return x.ActionId === tA.ID; }) && !t2.lists['1-to-1 Action Notices'].some(function (x) { return x.ActionId === tA.ID; }));
  ok('Tracker: folders, other actions and their permissions are untouched', t2.lists['1-to-1 Action Updates'].filter(function (x) { return x.FSObjType === 1; }).length === t1.lists['1-to-1 Action Updates'].filter(function (x) { return x.FSObjType === 1; }).length &&
    t2.lists['1-to-1 Actions'].length === t1.lists['1-to-1 Actions'].length - 1 && JSON.stringify(t2.folders) === JSON.stringify(t1.folders));
  await page.locator('#rs-tracker').check().catch(function () {});
  await page.locator('details.rs-list:has-text("1-to-1 Action Updates") summary').click();
  await page.locator('details.rs-list:has-text("1-to-1 Action Updates") tbody input[type="checkbox"]:not([disabled])').first().check();
  ok('Tracker: an update whose action is already gone can be ticked on its own', (await step(4).locator('button.danger').innerText()) === 'Delete 1 records');
  await page.locator('#rs-tracker').uncheck();
  ok('Tracker: unticking "Include tracked actions" clears tracker selections', (await step(4).locator('button.danger').innerText()) === 'Delete 0 records');

  // technician: refused by the page and by SharePoint
  await open({ as: 'alex' });
  ok('Security: a technician gets "Team Leader only" and no inventory', /Team Leader \(site owner\) only/.test(await page.locator('[data-reset-root]').innerText()) && (await page.locator('section.rs-step').count()) === 0);
  var forged = await page.evaluate(async function () {
    var c = OTO_MOCK.current.client, dg = OTO_MOCK.current.db.digest;
    var r = await c.post(OTO_MOCK.SITE + "/_api/web/lists/getbytitle('Monthly%20Reviews')/items(1)/recycle()", {}, { headers: { 'X-RequestDigest': dg } });
    return r.status;
  });
  ok('Security: a technician calling recycle() directly is refused by SharePoint', forged === 403 || forged === 404, String(forged));

  // hostile text in the records is shown as text
  await open({ as: 'tl', xss: '1' }); await page.evaluate(function () { OTO_MOCK.reset(); }); await open({ as: 'tl', xss: '1' });
  await page.evaluate(function () {
    var d = OTO_MOCK.current.db, x = OTO_MOCK.X.join(' ');
    d.lists['Monthly Reviews'][0].Title = x; d.lists['Manager Reviews'][0].MonthKey = x; d.lists['Wellbeing Assessments'][0].Title = x;
    d.lists['Appraisal Expectations'][0].Title = x; d.lists['Appraisal Expectations'][0].AppraisalYear = x;
    sessionStorage.setItem('oto-mock-db-v9', JSON.stringify(d));
  });
  await open({ as: 'tl', xss: '1' });
  await page.evaluate(function () { Array.prototype.forEach.call(document.querySelectorAll('details.rs-list'), function (d) { d.open = true; }); });
  var x = await page.evaluate(function () { var r = document.querySelector('[data-reset-root]'); return { fired: window.__otoXssFired, img: r.querySelectorAll('img').length, scripts: r.querySelectorAll('script').length, text: r.innerText.indexOf('oto_xss') >= 0 }; });
  ok('XSS: hostile titles and names in the inventory are shown as text, nothing runs', !x.fired && x.img === 0 && x.scripts === 0 && x.text, JSON.stringify(x));
  ok('No page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) { process.exitCode = 1; }
}
main().catch(function (e) { console.error('TEST RUN ERROR', e); process.exitCode = 1; });
