// ESG 1-to-1 frontend – action tracker tests (page 5.1.0 / solution 1.5) against the local SharePoint mock.
// Run from 02-frontend:   node tools/build-mock.js && node test/run-action-tests.js
// The mock plays flows 3, 9, 10 and 11 the way the simulations prove the real flows behave (fictional people only).
'use strict';
var fs = require('fs');
var path = require('path');
var PW = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright';
var CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium = require(PW).chromium;

var BASE = path.join(__dirname, '..');
var PAGE = 'file://' + path.join(BASE, 'mock', 'index.html');
var SHOTS = process.env.SHOTS_DIR || '';
var KEY = 'oto-mock-db-v9';
var A = '1-to-1 Actions', U = '1-to-1 Action Updates', N = '1-to-1 Action Notices';
var SAM = 'sam.patel@example.test', ALEX = 'alex.morgan@example.test';
var results = [];
function ok(name, cond, detail) { results.push({ name: name, pass: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail && !cond ? '  — ' + detail : '')); }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso) { return iso.slice(8, 10) + '-' + MON[+iso.slice(5, 7) - 1] + '-' + iso.slice(0, 4); }
function futureIso(days) { return new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
function london(v) { return v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : ''; }
function curMonth() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7); }
function claims(email) { return 'i:0#.f|membership|' + email; }
function lp(t) { return "/_api/web/lists/getbytitle('" + encodeURIComponent(t) + "')"; }
function hist(item) { try { return JSON.parse(item.HistoryJson || '[]'); } catch (_) { return null; } }

function staticChecks() {
  var js = fs.readFileSync(path.join(BASE, 'one-to-one.js'), 'utf8');
  var code = js.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
  ok('Tracker static: one MERGE call site (spMerge)', (code.match(/X-HTTP-Method/g) || []).length === 1 && /async function spMerge\(/.test(code));
  var calls = code.match(/spMerge\((?!list, id)[^,]*/g) || [];
  ok('Tracker static: spMerge refuses any list but 1-to-1 Actions, and every call passes it', /list !== CONFIG\.lists\.actions \|\| !IS_TL/.test(code) && calls.length >= 3 &&
    calls.every(function (c) { return c === 'spMerge(CONFIG.lists.actions'; }), calls.join(' | '));
  ok('Tracker static: never IF-MATCH * (every write carries the etag it read)', !/IF-MATCH'?\s*:\s*'\*'/.test(code));
  ok('Tracker static: the old Actions-page bypass is gone (no Close out / Reopen writing Manager Reviews)', !/'Close out'|actionsSummary\(x\.r\.fb\.actions\)/.test(code));
  ok('Tracker static: technicians add updates only into their own folder', /spCreate\(CONFIG\.lists\.actionUpdates, \{[\s\S]{0,400}?\}, myUpdateFolder\(\)\)/.test(code) && /'\/u' \+ MY_ID/.test(code));
  ok('Tracker static: still one validateUpdateListItem and one AddValidate path', (code.match(/validateUpdateListItem/g) || []).length === 1 && (code.match(/AddValidateUpdateItemUsingPath/g) || []).length === 1);
}

async function main() {
  staticChecks();
  var browser = await chromium.launch({ executablePath: CHROME });
  var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  var page = await ctx.newPage();
  page.on('dialog', function (d) { d.accept(); });
  var CUR = curMonth();

  async function open(p, params) {
    var errs = [];
    p.removeAllListeners('pageerror');
    p.on('pageerror', function (e) { errs.push(e.message); });
    var u = new URL(PAGE); Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    await p.goto(u.toString());
    await p.waitForSelector('.shell', { timeout: 8000 });
    await p.waitForTimeout(150);
    return errs;
  }
  async function db(p) { return (p || page).evaluate(function () { return JSON.parse(JSON.stringify(OTO_MOCK.current.db)); }); }
  async function api(method, p, body, headers) {
    return page.evaluate(async function (a) {
      var c = OTO_MOCK.current.client, url = OTO_MOCK.SITE + a.p;
      var opts = { headers: Object.assign({ 'X-RequestDigest': OTO_MOCK.current.db.digest }, a.headers || {}) };
      if (a.body) { opts.body = JSON.stringify(a.body); }
      var r = a.method === 'GET' ? await c.get(url, {}, opts) : await c.post(url, {}, opts);
      var t = await r.text(); var j = null; try { j = JSON.parse(t); } catch (_) { j = null; }
      return { status: r.status, json: j };
    }, { method: method, p: p, body: body, headers: headers });
  }
  // change the mock data the way a flow or another person would, and keep it
  async function mutate(fn, arg) {
    await page.evaluate(function (a) { var d = OTO_MOCK.current.db; (new Function('d', 'arg', a.src))(d, a.arg); sessionStorage.setItem(a.key, JSON.stringify(d)); }, { src: '(' + fn.toString() + ')(d, arg);', arg: arg, key: KEY });
  }
  async function nav(label) { await page.locator('.topbar button.nav:has-text("' + label + '")').click(); await page.waitForTimeout(150); }
  async function rootText() { return page.locator('[data-oto-root]').innerText(); }
  function upd(kind, actionId, msg, key, extra) {
    var f = [{ FieldName: 'Title', FieldValue: 'Update' }, { FieldName: 'ActionId', FieldValue: String(actionId) }, { FieldName: 'Kind', FieldValue: kind },
      { FieldName: 'Message', FieldValue: msg }, { FieldName: 'ClientKey', FieldValue: key }];
    Object.keys(extra || {}).forEach(function (k) { f.push({ FieldName: k, FieldValue: extra[k] }); });
    return f;
  }
  async function createUpd(folder, fields) {
    return api('POST', lp(U) + '/AddValidateUpdateItemUsingPath', { listItemCreateInfo: { FolderPath: { DecodedUrl: '/sites/esg-1to1/Lists/OneToOneActionUpdates' + (folder ? '/' + folder : '') }, UnderlyingObjectType: 0 },
      formValues: fields, bNewDocumentUpdate: false });
  }
  function shot(name) { return SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }) : Promise.resolve(); }

  // ================================================================ 29. lifecycle – agreed in a review, followed to closure
  await open(page, { as: 'tl' });
  await page.evaluate(function () { OTO_MOCK.reset(); });
  var errs = await open(page, { as: 'tl' });
  ok('§29 TL: page 5.1.0 loads with the tracker, no errors', errs.length === 0 && /v5\.1\.0/.test(await page.locator('.topbar .ver').innerText()), errs.join('|'));
  var d0 = await db();
  var samRv = d0.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims(SAM) && r.MonthKey === CUR; });
  var samMr = d0.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === samRv.ID; });
  var writes0 = d0.writes.length;
  await open(page, { as: 'tl', reviewId: String(samRv.ID) });
  ok('§29 Review: the carry-forward card lists the person\'s outstanding actions', (await page.locator('.carry-card').count()) === 1 && /Shadow two permit issues/.test(await page.locator('.carry-card').innerText()));
  await page.locator('button:has-text("+ Add action")').click();
  var row = page.locator('.acrow').last();
  await row.locator('input[aria-label="Action"]').fill('Complete the RPS refresher');
  await row.locator('input[aria-label="Close-out criteria"]').fill('Certificate uploaded');
  var due = futureIso(30);
  await row.locator('input.datef').fill(fmt(due)); await row.locator('input.datef').press('Tab');
  await page.locator('button:has-text("+ Add action")').click();
  var row2 = page.locator('.acrow').last();
  await row2.locator('input[aria-label="Action"]').fill('Arrange an RPS mentor');
  await row2.locator('select[aria-label="Owner"]').selectOption({ index: 1 });
  await row2.locator('input[aria-label="Close-out criteria"]').fill('Mentor named and first session booked');
  await row2.locator('input.datef').fill(fmt(futureIso(20))); await row2.locator('input.datef').press('Tab');
  await page.locator('.pagehead button:has-text("Complete & release")').click();
  await page.locator('.modal button:has-text("Complete & release")').click();
  await page.waitForTimeout(500);
  var d1 = await db();
  var mr1 = d1.lists['Manager Reviews'].find(function (m) { return m.ID === samMr.ID; });
  var aj = JSON.parse(mr1.ActionsJson || '[]');
  ok('§29 Release: each agreed action is saved with an id and who owns it', aj.length === 2 && aj.every(function (a) { return a.id; }) && aj[0].ownerRole === 'tech' && aj[1].ownerRole === 'tl', mr1.ActionsJson);
  var tracked = d1.lists[A].filter(function (x) { return x.OriginMgrId === samMr.ID; });
  var act = tracked.find(function (x) { return x.Owner === 'Technician'; }), tlAct = tracked.find(function (x) { return x.Owner === 'Team Leader'; });
  ok('§29 Release: flow 3 adds each agreed action once, keyed mr<review>-<action>', tracked.length === 2 && !!act && !!tlAct &&
    tracked.every(function (x) { return aj.some(function (a) { return x.ActionKey === 'mr' + samMr.ID + '-' + a.id; }); }));
  ok('§29 Release: deadlines kept as agreed (original = current), Open, a "created" history entry', act && london(act.OriginalDue) === due && london(act.CurrentDue) === due && act.Status === 'Open' &&
    hist(act).length === 1 && hist(act)[0].kind === 'created' && hist(act)[0].month === CUR);
  ok('§29 Release: shared with exactly that technician (flow 9), and ActionsSyncedOn stamped', act && JSON.stringify(d1.perms[A][act.ID]) === JSON.stringify({ 'sam.patel@example.test': 'read' }) && act.SharedWith === SAM && !!mr1.ActionsSyncedOn);
  ok('§29 Release: the page itself writes nothing to the tracker (the server adds them)', d1.writes.slice(writes0).every(function (w) { return w.list !== A && w.list !== U; }));
  await page.evaluate(function () { OTO_MOCK.runFlow1Sync(); OTO_MOCK.runFlow1Sync(); });
  ok('§29 Release: the daily reconciliation run twice adds nothing more', (await db()).lists[A].filter(function (x) { return x.OriginMgrId === samMr.ID; }).length === 2);
  await open(page, { as: 'tl', reviewId: String(samRv.ID) });
  ok('§29 Release: the review says the actions are in the tracker, and shows them read-only', /In the action tracker/.test(await rootText()) && (await page.locator('.acrow').count()) === 0);
  await page.locator('.pagehead button:has-text("Amend")').click(); await page.waitForTimeout(300);
  ok('§29 Amend mode: released actions stay read-only (the tracker is the live record)', (await page.locator('.acrow').count()) === 0 && (await page.locator('.amending').count()) === 1);
  await page.locator('.pagehead button:has-text("Cancel amendment")').click();

  // technician: My actions, progress update (shown as received until flow 10 has recorded it)
  errs = await open(page, { as: 'sam' });
  await nav('My actions');
  var card = page.locator('.actcard[data-action="' + act.ID + '"]');
  ok('§29 Technician: My actions shows the action, deadline, criteria and owner', (await card.count()) === 1 && (await card.innerText()).indexOf(fmt(due)) >= 0 &&
    /Certificate uploaded/.test(await card.innerText()) && /Yours/.test(await card.innerText()), errs.join('|'));
  ok('§29 Technician: their Team Leader\'s action shows as the Team Leader\'s, with no "Ready to close"', /Team Leader's action/.test(await page.locator('.actcard[data-action="' + tlAct.ID + '"]').innerText()) &&
    (await page.locator('.actcard[data-action="' + tlAct.ID + '"] button:has-text("Ready to close")').count()) === 0);
  await page.evaluate(function () { OTO_MOCK.current.db.flow10Off = true; });
  await card.locator('textarea').fill('Booked the refresher for next week');
  await card.locator('button:has-text("Send update")').click();
  await page.waitForTimeout(300);
  var ct = await card.innerText();
  ok('§29 Technician: after sending it says "received – being recorded", not recorded yet', /received – being recorded/.test(ct) && !/recorded ✓/.test(ct), ct.slice(0, 400));
  var d2 = await db();
  var up1 = d2.lists[U].filter(function (x) { return x.ActionId === act.ID && x.FSObjType !== 1; });
  ok('§29 Technician: the update is one item, in their own folder, with a unique client key', up1.length === 1 && /\/OneToOneActionUpdates\/u12$/.test(up1[0].FileDirRef) && /^up-/.test(up1[0].ClientKey) && up1[0].ProcessState === 'Pending');
  await page.evaluate(function () { OTO_MOCK.current.db.flow10Off = false; OTO_MOCK.runFlow10(); });
  await open(page, { as: 'sam' }); await nav('My actions');
  ct = await card.innerText();
  var d3 = await db(), a3 = d3.lists[A].find(function (x) { return x.ID === act.ID; });
  ok('§29 Flow 10: recorded – In progress, latest progress, history entry u<id>; page shows "recorded ✓"', a3.Status === 'In progress' && a3.LatestProgress === 'Booked the refresher for next week' &&
    hist(a3).some(function (e) { return e.id === 'u' + up1[0].ID; }) && /recorded ✓/.test(ct));
  ok('§29 Flow 10: the update is locked to Read for its sender', JSON.stringify(d3.perms[U][up1[0].ID]) === JSON.stringify({ 'sam.patel@example.test': 'read' }));
  var w = await api('POST', lp(U) + '/items(' + up1[0].ID + ')/validateUpdateListItem', { formValues: [{ FieldName: 'Message', FieldValue: 'rewritten later' }], bNewDocumentUpdate: false });
  var del = await api('POST', lp(U) + '/items(' + up1[0].ID + ')/recycle()');
  ok('§29 Security: a recorded update can no longer be changed or deleted by its sender', w.status === 403 && del.status === 403);

  // Team Leader: deadline change needs a reason, keeps the original; written with the etag
  await open(page, { as: 'tl' }); await nav('Actions');
  var trow = page.locator('tr[data-action="' + act.ID + '"]');
  await trow.locator('button:has-text("Update")').click();
  var modal = page.locator('.modal');
  await modal.locator('textarea').first().fill('Discussed at the 1-to-1 – going well');
  var newDue = futureIso(45);
  await modal.locator('input[aria-label="Deadline"]').fill(fmt(newDue)); await modal.locator('input[aria-label="Deadline"]').press('Tab');
  var wBefore = (await db()).writes.length;
  await modal.locator('button:has-text("Save")').click(); await page.waitForTimeout(250);
  ok('§29 TL: a deadline change without a reason is refused (nothing written)', (await modal.count()) === 1 && /reason/i.test(await modal.innerText()) && (await db()).writes.length === wBefore);
  await modal.locator('div:has(> label:has-text("Why the deadline")) textarea').fill('Course moved by the provider');
  await modal.locator('button:has-text("Save")').click(); await page.waitForTimeout(400);
  var d4 = await db(), a4 = d4.lists[A].find(function (x) { return x.ID === act.ID; });
  var mw = d4.writes.slice(wBefore).filter(function (x) { return x.merge; });
  ok('§29 TL: one MERGE on the action, with its etag (never *)', mw.length === 1 && mw[0].list === A && /^"\d+"$/.test(mw[0].ifMatch), JSON.stringify(mw));
  ok('§29 TL: the deadline moved with its reason; the original deadline is kept', london(a4.CurrentDue) === newDue && london(a4.OriginalDue) === due &&
    hist(a4).some(function (e) { return e.kind === 'deadline' && e.to === newDue && e.from === due && e.text === 'Course moved by the provider' && e.role === 'tl'; }));
  ok('§29 TL: the Actions page writes no Manager Review', d4.writes.slice(wBefore).every(function (x) { return x.list !== 'Manager Reviews'; }));

  // concurrency: a technician's update is recorded while the TL has the dialog open → 412, reload, nothing lost
  await open(page, { as: 'tl' }); await nav('Actions');
  await page.locator('tr[data-action="' + act.ID + '"] button:has-text("Update")').click();
  await page.locator('.modal textarea').first().fill('TL note written meanwhile');
  await mutate(function (d, id) {
    var L = '1-to-1 Action Updates', now = new Date().toISOString();
    d.lists[L].push({ ID: d.nextId[L]++, __v: 1, Title: 'Update', ActionId: id, Kind: 'progress', Message: 'Sam update recorded meanwhile', ClientKey: 'up-meanwhile', ProcessState: 'Pending',
      FileDirRef: '/sites/esg-1to1/Lists/OneToOneActionUpdates/u12', FSObjType: 0, Created: now, Modified: now });
  }, act.ID);
  await page.evaluate(function () { OTO_MOCK.runFlow10(); });
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(400);
  var toastT = await page.locator('.toast').innerText().catch(function () { return ''; });
  var d5 = await db(), a5 = d5.lists[A].find(function (x) { return x.ID === act.ID; });
  ok('§29 Concurrency: the stale save is refused (412) and says to check and save again', /updated since you opened it/.test(toastT) && d5.stale >= 1, toastT);
  ok('§29 Concurrency: the technician\'s update is kept and the TL note was not written over it', hist(a5).some(function (e) { return e.text === 'Sam update recorded meanwhile'; }) &&
    !hist(a5).some(function (e) { return e.text === 'TL note written meanwhile'; }));
  await page.locator('tr[data-action="' + act.ID + '"] button:has-text("Update")').click();
  await page.locator('.modal textarea').first().fill('TL note written meanwhile');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(400);
  var a5b = (await db()).lists[A].find(function (x) { return x.ID === act.ID; });
  ok('§29 Concurrency: after the reload the TL\'s change saves, and both are in the history', hist(a5b).some(function (e) { return e.text === 'TL note written meanwhile'; }) && hist(a5b).some(function (e) { return e.text === 'Sam update recorded meanwhile'; }));

  // close-out: requested by the technician, not agreed (reason), requested again, agreed and closed; reopened with a reason
  await open(page, { as: 'sam' }); await nav('My actions');
  await card.locator('button:has-text("Ready to close")').click();
  await card.locator('textarea').fill('Certificate uploaded today');
  await card.locator('button:has-text("Ask to close")').click(); await page.waitForTimeout(300);
  var d6 = await db(), a6 = d6.lists[A].find(function (x) { return x.ID === act.ID; });
  var e19 = d6.lists[N].filter(function (n) { return n.ActionId === act.ID && n.Kind === 'E19'; });
  ok('§29 Close request: the action is Ready for close-out and one E19 email is sent to the TL', a6.Status === 'Ready for close-out' && e19.length === 1 && e19[0].Status === 'Sent' &&
    d6.emails.filter(function (m) { return m.template === 'E19' && m.actionId === act.ID; }).length === 1);
  await page.evaluate(function () { OTO_MOCK.runFlow11(); OTO_MOCK.runFlow10(); });
  ok('§29 Close request: running flows 10 and 11 again sends nothing more', (await db()).emails.filter(function (m) { return m.template === 'E19' && m.actionId === act.ID; }).length === 1);
  var c1 = await createUpd('u12', upd('close', act.ID, 'I closed it myself', 'up-hack-close'));
  ok('§29 Only the TL closes: a technician cannot send a "close" (no such kind)', c1.status !== 200 || (c1.json.value || []).some(function (f) { return f.HasException; }));
  await open(page, { as: 'tl' });
  ok('§29 TL: Needs your attention lists the close-out request', /Sam Patel asked to close an action: Complete the RPS refresher/.test(await page.locator('.attn-card').innerText()));
  await nav('Actions');
  await page.locator('tr[data-action="' + act.ID + '"] button:has-text("Not yet")').click();
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(200);
  ok('§29 TL: "Not yet" needs a reason', (await page.locator('.modal').count()) === 1);
  await page.locator('.modal textarea').fill('Please upload the certificate to the training system as well');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(300);
  var a7 = (await db()).lists[A].find(function (x) { return x.ID === act.ID; });
  ok('§29 TL: not agreed – back to In progress with the reason the technician can see', a7.Status === 'In progress' && a7.DecisionNote === 'Please upload the certificate to the training system as well' &&
    hist(a7).some(function (e) { return e.kind === 'reject'; }));
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§29 Technician: sees the Team Leader\'s note', /Please upload the certificate to the training system as well/.test(await card.innerText()));
  await card.locator('button:has-text("Ready to close")').click();
  await card.locator('textarea').fill('Uploaded to the training system');
  await card.locator('button:has-text("Ask to close")').click(); await page.waitForTimeout(300);
  await open(page, { as: 'tl' }); await nav('Actions');
  await page.locator('tr[data-action="' + act.ID + '"] button:has-text("Agree & close")').click();
  await page.locator('.modal textarea').fill('Evidence seen');
  await page.locator('.modal button:has-text("Close action")').click(); await page.waitForTimeout(300);
  var a8 = (await db()).lists[A].find(function (x) { return x.ID === act.ID; });
  ok('§29 TL: agreed and closed today, with the note', a8.Status === 'Closed' && london(a8.ClosedOn) === futureIso(0) && hist(a8).some(function (e) { return e.kind === 'accept' && e.text === 'Evidence seen'; }));
  await page.locator('#oto-a-st').selectOption('all');
  await page.locator('tr[data-action="' + act.ID + '"] button:has-text("Update")').click();
  await page.locator('.modal select[aria-label="Status"]').selectOption('In progress');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(200);
  ok('§29 TL: reopening needs a reason', (await page.locator('.modal').count()) === 1 && /reopen/i.test(await page.locator('.modal').innerText()));
  await page.locator('.modal div:has(> label:has-text("Why it is being reopened")) textarea').fill('Provider withdrew the certificate');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(300);
  var a9 = (await db()).lists[A].find(function (x) { return x.ID === act.ID; }), h9 = hist(a9);
  ok('§29 TL: reopened – In progress, closed date cleared, reason kept', a9.Status === 'In progress' && !a9.ClosedOn && h9.some(function (e) { return e.kind === 'reopen' && e.text === 'Provider withdrew the certificate'; }));
  var kinds = h9.map(function (e) { return e.kind; }), ids = h9.map(function (e) { return e.id; });
  ok('§29 History: complete, in order, no duplicates', ['created', 'progress', 'deadline', 'closeRequest', 'reject', 'accept', 'reopen'].every(function (k) { return kinds.indexOf(k) >= 0; }) &&
    ids.every(function (x, i) { return ids.indexOf(x) === i; }) && h9.every(function (e, i) { return !i || Date.parse(h9[i - 1].at) <= Date.parse(e.at); }), kinds.join(','));
  // survives a completed appraisal (new period) and a missed review
  await mutate(function (d, email) {
    var t = d.lists['Technicians'].find(function (x) { return x.Technician === 'i:0#.f|membership|' + email; });
    t.AppraisalCycleStart = new Date().toISOString(); t.AppraisalBoundaries = JSON.stringify([new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })]);
    var m = d.lists['Manager Reviews'].filter(function (x) { return x.Technician === t.Technician && x.ReviewState === 'Completed'; })[0];
    m.ReviewState = 'Closed - Not Submitted';
  }, SAM);
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§29 Carry-forward: the action survives a completed appraisal and a missed review', (await card.count()) === 1);
  await nav('My appraisal');
  ok('§29 Profile: open actions are shown whatever the appraisal period', /Complete the RPS refresher/.test(await rootText()));

  // ================================================================ 30. reliability
  // a release that breaks part-way: the daily run finishes it, no duplicates, attention until then
  var rileyRv = d0.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims('riley.evans@example.test') && r.MonthKey === CUR; });
  var rileyMr = d0.lists['Manager Reviews'].find(function (m) { return m.ReviewItemId === rileyRv.ID; });
  await open(page, { as: 'tl', reviewId: String(rileyRv.ID) });
  for (var k = 0; k < 2; k++) {
    await page.locator('button:has-text("+ Add action")').click();
    var rr = page.locator('.acrow').last();
    await rr.locator('input[aria-label="Action"]').fill('Survey plan step ' + (k + 1));
    await rr.locator('input[aria-label="Close-out criteria"]').fill('Done');
    await rr.locator('input.datef').fill(fmt(futureIso(25 + k))); await rr.locator('input.datef').press('Tab');
  }
  await page.evaluate(function () { OTO_MOCK.current.db.failCreateAt = 1; });
  await page.locator('.pagehead button:has-text("Complete & release")').click();
  await page.locator('.modal button:has-text("Complete & release")').click(); await page.waitForTimeout(500);
  var r1 = await db(), part = r1.lists[A].filter(function (x) { return x.OriginMgrId === rileyMr.ID; }), rmr = r1.lists['Manager Reviews'].find(function (m) { return m.ID === rileyMr.ID; });
  ok('§30 Interrupted release: one of two added, not stamped as done', part.length === 1 && !rmr.ActionsSyncedOn);
  await mutate(function (d, id) { var m = d.lists['Manager Reviews'].find(function (x) { return x.ID === id; }); m.ReleasedOn = new Date(Date.now() - 2 * 3600000).toISOString(); }, rileyMr.ID);
  await open(page, { as: 'tl' });
  ok('§30 Interrupted release: after an hour Needs your attention says so (never shown as done)', /Riley Evans's .* 1-to-1 aren't all in the tracker yet/.test(await page.locator('.attn-card').innerText()));
  await open(page, { as: 'tl', reviewId: String(rileyRv.ID) });
  ok('§30 Interrupted release: the review shows 1 of 2 so far', /1 of 2 so far/.test(await rootText()));
  await page.evaluate(function () { OTO_MOCK.runFlow1Sync(); OTO_MOCK.runFlow1Sync(); });
  var r2 = await db(), all2 = r2.lists[A].filter(function (x) { return x.OriginMgrId === rileyMr.ID; });
  ok('§30 Interrupted release: the daily run adds only the missing one and stamps it', all2.length === 2 && all2[0].ActionKey !== all2[1].ActionKey && !!r2.lists['Manager Reviews'].find(function (m) { return m.ID === rileyMr.ID; }).ActionsSyncedOn);
  await open(page, { as: 'tl' });
  ok('§30 Interrupted release: the attention item clears', !/Riley Evans's .* aren't all in the tracker/.test(await page.locator('.attn-card').innerText()));

  // two tabs / a quick second update / a send interrupted by a refresh – every update recorded once
  var a2 = d0.lists[A].find(function (x) { return x.Title === 'Shadow two permit issues'; });
  var tlA2 = (await db()).lists[A].find(function (x) { return x.Title === 'Arrange an RPS mentor'; });
  await open(page, { as: 'sam' }); await nav('My actions');
  var c2 = page.locator('.actcard[data-action="' + tlA2.ID + '"]');
  await page.evaluate(function () { OTO_MOCK.current.db.latency = 300; });
  await c2.locator('textarea').fill('First quick update');
  await c2.locator('button:has-text("Send update")').click(); await page.waitForTimeout(500);
  await c2.locator('textarea').fill('Second quick update');
  await c2.locator('button:has-text("Send update")').click(); await page.waitForTimeout(500);
  await page.evaluate(function () { OTO_MOCK.current.db.latency = 0; });
  var other = await createUpd('u12', upd('progress', tlA2.ID, 'Sent from another tab', 'up-othertab'));
  var t1 = await db(), tA = t1.lists[A].find(function (x) { return x.ID === tlA2.ID; });
  var texts = hist(tA).map(function (e) { return e.text; });
  ok('§30 Two tabs and a quick second update: three updates, all recorded, none lost', other.status === 200 && ['First quick update', 'Second quick update', 'Sent from another tab'].every(function (t) { return texts.indexOf(t) >= 0; }) &&
    t1.lists[U].filter(function (x) { return x.ActionId === tlA2.ID; }).length === 3);
  var dup = await createUpd('u12', upd('progress', tlA2.ID, 'Same key again', 'up-othertab'));
  ok('§30 A retry with the same client key is refused by SharePoint (unique) – never recorded twice', (dup.json.value || []).some(function (f) { return f.HasException; }) &&
    (await db()).lists[U].filter(function (x) { return x.ClientKey === 'up-othertab'; }).length === 1);
  // the page was refreshed before the reply came: the update is offered again, with the same key
  await page.evaluate(function (id) {
    localStorage.setItem('esg1to1.unsentUpdates', JSON.stringify([{ key: 'up-refresh-1', actionId: id, kind: 'progress', outcome: '', message: 'Sent just before a refresh', waitingUntil: '', month: '', at: new Date().toISOString(), owner: 12 }]));
  }, tlA2.ID);
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§30 Refresh: an update that never arrived is shown as not sent, with Send again', /Progress update not sent/.test(await c2.innerText()));
  await c2.locator('button:has-text("Send again")').click(); await page.waitForTimeout(400);
  var t2 = await db();
  ok('§30 Refresh: Send again stores it once with the same key and it is recorded', t2.lists[U].filter(function (x) { return x.ClientKey === 'up-refresh-1'; }).length === 1 &&
    hist(t2.lists[A].find(function (x) { return x.ID === tlA2.ID; })).some(function (e) { return e.text === 'Sent just before a refresh'; }));
  // it did arrive (the reply was lost): nothing is sent again
  await createUpd('u12', upd('progress', tlA2.ID, 'Arrived but the reply was lost', 'up-landed'));
  await page.evaluate(function (id) {
    localStorage.setItem('esg1to1.unsentUpdates', JSON.stringify([{ key: 'up-landed', actionId: id, kind: 'progress', outcome: '', message: 'Arrived but the reply was lost', waitingUntil: '', month: '', at: new Date().toISOString(), owner: 12 }]));
  }, tlA2.ID);
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§30 Refresh: an update that did arrive is not offered again (no duplicate)', !/not sent/.test(await c2.innerText()) &&
    (await db()).lists[U].filter(function (x) { return x.ClientKey === 'up-landed'; }).length === 1 && (await page.evaluate(function () { return localStorage.getItem('esg1to1.unsentUpdates'); })) === '[]');
  // flow 10 retried / triggered twice: one history entry
  var done = (await db()).lists[U].find(function (x) { return x.ClientKey === 'up-landed'; });
  await mutate(function (d, id) { var x = d.lists['1-to-1 Action Updates'].find(function (y) { return y.ID === id; }); x.ProcessState = 'Pending'; }, done.ID);
  await page.evaluate(function () { OTO_MOCK.runFlow10(); OTO_MOCK.runFlow10(); });
  ok('§30 Flow 10 run again on the same update: still one history entry', hist((await db()).lists[A].find(function (x) { return x.ID === tlA2.ID; })).filter(function (e) { return e.id === 'u' + done.ID; }).length === 1);
  // states shown to the technician: refused by SharePoint, rejected by flow 10
  await mutate(function (d) { delete d.folders.u12; });
  await open(page, { as: 'sam' }); await nav('My actions');
  await c2.locator('textarea').fill('Folder missing');
  await c2.locator('button:has-text("Send update")').click(); await page.waitForTimeout(300);
  ok('§30 States: an update SharePoint refuses is shown as not sent (never as success)', /not sent – SharePoint refused it/.test(await c2.innerText()) && !/Folder missing/.test(JSON.stringify((await db()).lists[A])));
  await page.evaluate(function () { OTO_MOCK.runFlow9(); });
  await c2.locator('button:has-text("Send again")').click(); await page.waitForTimeout(300);
  ok('§30 States: once flow 9 has repaired the folder, Send again records it', hist((await db()).lists[A].find(function (x) { return x.ID === tlA2.ID; })).some(function (e) { return e.text === 'Folder missing'; }));

  // ================================================================ 31. security – a technician using REST directly
  await open(page, { as: 'alex' });
  var dd = await db(), samActs = dd.lists[A].filter(function (x) { return x.Technician === claims(SAM); }), alexActs = dd.lists[A].filter(function (x) { return x.Technician === claims(ALEX); });
  var alexTl = alexActs.find(function (x) { return x.Owner === 'Team Leader' && x.Status !== 'Closed'; }), alexOwn = alexActs.find(function (x) { return x.Owner === 'Technician' && x.Status !== 'Closed'; });
  var ra = await api('GET', lp(A) + '/items');
  ok('§31 Test A: reads only their own actions', ra.status === 200 && ra.json.value.length === alexActs.length && ra.json.value.every(function (x) { return x.Technician.EMail === ALEX; }));
  ok('§31 Test A: cannot read Test B\'s action by id', (await api('GET', lp(A) + '/items(' + samActs[0].ID + ')')).status === 404);
  var ru = await api('GET', lp(U) + '/items');
  ok('§31 Test A: sees only items in their own update folder', ru.status === 200 && ru.json.value.every(function (x) { return /\/u11$/.test(x.FileDirRef) || x.Title === 'u11'; }));
  ok('§31 Test A: cannot read the notices list', (await api('GET', lp(N) + '/items')).status === 404);
  ok('§31 Test A: cannot add an update to Test B\'s folder, the list root or a made-up folder', (await createUpd('u12', upd('progress', samActs[0].ID, 'x', 'up-a1'))).status === 403 &&
    (await createUpd('', upd('progress', alexOwn.ID, 'x', 'up-a2'))).status === 403 && (await createUpd('u99', upd('progress', alexOwn.ID, 'x', 'up-a3'))).status === 403);
  var mg = await api('POST', lp(A) + '/items(' + alexOwn.ID + ')', { Status: 'Closed' }, { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' });
  var vu = await api('POST', lp(A) + '/items(' + alexOwn.ID + ')/validateUpdateListItem', { formValues: [{ FieldName: 'Status', FieldValue: 'Closed' }, { FieldName: 'CurrentDue', FieldValue: '2099-01-01' }], bNewDocumentUpdate: false });
  var ca = await api('POST', lp(A) + '/AddValidateUpdateItemUsingPath', { listItemCreateInfo: { FolderPath: { DecodedUrl: '/sites/esg-1to1/Lists/OneToOneActions' } }, formValues: [{ FieldName: 'Title', FieldValue: 'x' }], bNewDocumentUpdate: false });
  ok('§31 Test A: cannot change an action (status, deadline, owner) or create one', mg.status === 403 && vu.status === 403 && ca.status === 403);
  var fa = await createUpd('u11', upd('progress', samActs[0].ID, 'Forged action id', 'up-forged'));
  var fx = (await db()).lists[U].find(function (x) { return x.ClientKey === 'up-forged'; });
  ok('§31 Forged ActionId (someone else\'s action): rejected, their action untouched', fa.status === 200 && fx.ProcessState === 'Rejected' && fx.ProcessNote === 'Not your action' &&
    !/Forged action id/.test(JSON.stringify((await db()).lists[A])));
  var fau = await createUpd('u11', upd('progress', alexOwn.ID, 'Forged author', 'up-author', { Author: JSON.stringify([{ Key: claims(SAM) }]) }));
  ok('§31 Forged Author: the column cannot be written', (fau.json.value || []).some(function (f) { return f.FieldName === 'Author' && f.HasException; }));
  await createUpd('u11', upd('closeRequest', alexTl.ID, 'Please close yours', 'up-tlclose'));
  await createUpd('u11', upd('followup', alexTl.ID, '', 'fu-' + CUR + '-x', { Outcome: 'Ready' }));
  await createUpd('u11', upd('waiting', alexOwn.ID, '   ', 'up-emptywait'));
  var sx = (await db()).lists[U];
  function note(key) { var x = sx.find(function (y) { return y.ClientKey === key; }); return x ? x.ProcessState + ':' + x.ProcessNote : 'missing'; }
  ok('§31 Rules: close request / "ready" on the Team Leader\'s action is rejected', note('up-tlclose') === 'Rejected:Only the Team Leader closes their own actions' && note('fu-' + CUR + '-x') === 'Rejected:Only the Team Leader closes their own actions');
  ok('§31 Rules: Waiting needs a reason', note('up-emptywait') === 'Rejected:The update is empty');
  var closed = (await db()).lists[A].find(function (x) { return x.Technician === claims(ALEX) && x.Status === 'Closed'; });
  ok('§31 Fixture: Test A has a closed action', !!closed);
  if (closed) {
    await createUpd('u11', upd('progress', closed.ID, 'On a closed action', 'up-closed'));
    var cu = (await db()).lists[U].find(function (y) { return y.ClientKey === 'up-closed'; });
    ok('§31 Rules: an update on a closed action is rejected', !!cu && cu.ProcessState === 'Rejected' && cu.ProcessNote === 'The action is closed');
  }
  await open(page, { as: 'alex', actionId: String(samActs[0].ID) });
  ok('§31 Deep link to someone else\'s action: nothing of theirs is shown', (await page.locator('[data-action="' + samActs[0].ID + '"]').count()) === 0 && !/Sam Patel/.test(await rootText()));
  // flow 9 repairs wrong sharing; the page's Repair asks it to check again
  var samOpen = samActs.find(function (x) { return x.Title === 'Shadow two permit issues'; });
  await mutate(function (d, id) { var a = d.lists['1-to-1 Actions'].find(function (x) { return x.ID === id; }); a.SharedWith = ''; d.perms['1-to-1 Actions'][id] = { 'alex.morgan@example.test': 'read' }; d.flow9Off = true; a.Modified = new Date(Date.now() - 3600000).toISOString(); }, samOpen.ID);
  await open(page, { as: 'tl' });
  ok('§31 Wrong sharing: Needs your attention says an action isn\'t shared', /not shared with the technician yet/.test(await page.locator('.attn-card').innerText()));
  await mutate(function (d) { d.flow9Off = false; });
  await page.locator('.attn-row:has-text("not shared") button:has-text("Repair")').click(); await page.waitForTimeout(400);
  var fixed = await db();
  ok('§31 Repair: flow 9 shares it again with exactly its technician', JSON.stringify(fixed.perms[A][samOpen.ID]) === JSON.stringify({ 'sam.patel@example.test': 'read' }) &&
    fixed.lists[A].find(function (x) { return x.ID === samOpen.ID; }).SharedWith === SAM);

  // ================================================================ 32. notices – failed, unknown, resent, cancelled
  await open(page, { as: 'tl' });
  var ed = await db(), seededReq = ed.lists[A].find(function (x) { return x.Title === 'Shadow two permit issues'; });
  await mutate(function (d) { d.noticeFail = true; });
  var nid1 = await page.evaluate(function (id) { return OTO_MOCK.addNotice('E20-a' + id + '-test', 'E20', id); }, alexOwn.ID);
  var n1 = (await db()).lists[N].find(function (n) { return n.ID === nid1; });
  ok('§32 E20: a failed reminder is recorded as Failed with the attempt and error', n1.Status === 'Failed' && n1.Attempts === 1 && /simulated/.test(n1.LastError));
  await mutate(function (d) { d.noticeFail = false; });
  await open(page, { as: 'tl' });
  ok('§32 E20: Needs your attention shows the failed email with Resend', /The deadline reminder for Alex Morgan .* couldn't be sent/.test(await page.locator('.attn-card').innerText()));
  await page.locator('.attn-row:has-text("deadline reminder") button:has-text("Resend")').click(); await page.waitForTimeout(400);
  var n2 = await db();
  ok('§32 E20: Resend sends it – to the technician, copied to the TL – and clears the item', n2.lists[N].find(function (n) { return n.ID === nid1; }).Status === 'Sent' &&
    n2.emails.some(function (m) { return m.template === 'E20' && m.to === ALEX && m.cc === 'TL' && m.actionId === alexOwn.ID; }) && !/deadline reminder for Alex Morgan/.test(await page.locator('.attn-card').innerText()));
  await mutate(function (d) { d.failAfterSend = true; });
  var nid2 = await page.evaluate(function (id) { return OTO_MOCK.addNotice('E20-a' + id + '-unknown', 'E20', id); }, alexOwn.ID);
  await mutate(function (d, id) { var n = d.lists['1-to-1 Action Notices'].find(function (x) { return x.ID === id; }); n.Modified = new Date(Date.now() - 2 * 3600000).toISOString(); d.failAfterSend = false; }, nid2);
  await open(page, { as: 'tl' });
  ok('§32 Delivery unknown: a send that didn\'t finish is shown as unknown, not as sent', /delivery unknown/.test(await page.locator('.attn-card').innerText()));
  var nid3 = await page.evaluate(function (id) { return OTO_MOCK.addNotice('E19-test-closed', 'E19', id); }, (await db()).lists[A].find(function (x) { return x.Status === 'Closed'; }).ID);
  ok('§32 A notice for an action that is closed by now is cancelled, not sent', (await db()).lists[N].find(function (n) { return n.ID === nid3; }).Status === 'Cancelled');

  // ================================================================ 33. carry-forward with follow-up outcomes
  var alexRv = d0.lists['Monthly Reviews'].find(function (r) { return r.Technician === claims(ALEX) && r.MonthKey === CUR; });
  await open(page, { as: 'alex' });
  var carry = page.locator('.carry-card');
  ok('§33 Technician form: Outstanding actions carried forward with status, deadline and latest progress', (await carry.count()) === 1 && /Complete the confined space refresher/.test(await carry.innerText()) &&
    /Booked onto the course/.test(await carry.innerText()));
  var a1 = (await db()).lists[A].find(function (x) { return x.Title === 'Complete the confined space refresher'; });
  var crow = carry.locator('.carry-row:has-text("Complete the confined space refresher")');
  await crow.locator('button:has-text("Progress satisfactory")').click(); await page.waitForTimeout(300);
  var f1 = (await db()).lists[U].filter(function (x) { return x.ActionId === a1.ID && x.Kind === 'followup'; });
  ok('§33 Follow-up: one click records "Progress satisfactory" for this review month', f1.length === 1 && f1[0].Outcome === 'Satisfactory' && f1[0].ClientKey.indexOf('fu-' + CUR + '-') === 0 &&
    hist((await db()).lists[A].find(function (x) { return x.ID === a1.ID; })).some(function (e) { return e.kind === 'followup' && e.outcome === 'Satisfactory'; }));
  await open(page, { as: 'alex' });
  await crow.locator('button:has-text("Progress satisfactory")').click(); await page.waitForTimeout(300);
  ok('§33 Follow-up: choosing the same outcome again adds nothing (no duplicate)', (await db()).lists[U].filter(function (x) { return x.ActionId === a1.ID && x.Kind === 'followup'; }).length === 1 &&
    (await crow.locator('button[aria-pressed="true"]:has-text("Progress satisfactory")').count()) === 1);
  await crow.locator('button:has-text("Further support required")').click();
  await page.locator('.modal textarea').fill('Help to find a course date');
  await page.locator('.modal button:has-text("Send")').click(); await page.waitForTimeout(300);
  var a1b = (await db()).lists[A].find(function (x) { return x.ID === a1.ID; });
  ok('§33 Follow-up: "Further support required" with details; the change is a new history entry', hist(a1b).filter(function (e) { return e.kind === 'followup'; }).length === 2 &&
    hist(a1b).some(function (e) { return e.outcome === 'Support' && e.text === 'Help to find a course date'; }));
  var tlRow = carry.locator('.carry-row:has-text("Replace the faulty area 3 monitor head")');
  ok('§33 Follow-up: "Ready to close" is not offered on the Team Leader\'s action', (await tlRow.count()) === 1 && (await tlRow.locator('button:has-text("Ready to close")').count()) === 0);
  await open(page, { as: 'tl', reviewId: String(alexRv.ID) });
  var tcarry = page.locator('.carry-card .carry-row:has-text("Complete the confined space refresher")');
  ok('§33 TL review: sees the technician\'s outcome', /Follow-up from Alex: Further support required – Help to find a course date/.test(await tcarry.innerText()));
  await tcarry.locator('button:has-text("Ready to close")').click();
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(400);
  var a1c = (await db()).lists[A].find(function (x) { return x.ID === a1.ID; });
  ok('§33 TL: "Ready to close" → Close it now closes it, recorded as a follow-up and a close', a1c.Status === 'Closed' && hist(a1c).some(function (e) { return e.kind === 'followup' && e.role === 'tl' && e.outcome === 'Ready'; }) &&
    hist(a1c).some(function (e) { return e.kind === 'close'; }));
  await open(page, { as: 'alex' });
  ok('§33 Technician form: the Team Leader\'s outcome is visible to them too', /From your team leader: Ready to close/.test(await page.locator('.carry-card').innerText()));

  // ================================================================ 34. compatibility and legacy data
  var dl = await db(), oldMr = dl.lists['Manager Reviews'].find(function (m) { return m.ReleasedOn && Date.parse(m.ReleasedOn) < Date.parse(dl.trackerStart) && JSON.parse(m.ActionsJson || '[]').length; });
  ok('§34 Legacy: actions agreed before the tracker started are never imported', !!oldMr && !dl.lists[A].some(function (x) { return x.OriginMgrId === oldMr.ID; }));
  await open(page, { as: 'tl', reviewId: String(oldMr.ReviewItemId) });
  ok('§34 Legacy: the old review still shows what was agreed, marked as before tracking started', /Agreed before action tracking started/.test(await rootText()) && (await page.locator('.card:has-text("Agreed actions") tbody tr').count()) >= 1);
  await open(page, { as: 'tl' }); await nav('Actions'); await page.locator('#oto-a-st').selectOption('all');
  ok('§34 Legacy: the Actions page lists tracker records only', (await page.locator('tr[data-action]').count()) === dl.lists[A].length);
  await open(page, { as: 'tl', actionId: String(seededReq.ID) });
  ok('§34 Deep link: ?actionId opens the Actions page on that action', (await page.locator('tr.focus[data-action="' + seededReq.ID + '"]').count()) === 1);
  // a site where Setup 1.5 hasn't run: the page still works, with the 5.0 behaviour
  await mutate(function (d) { d.v14 = true; });
  errs = await open(page, { as: 'tl' });
  ok('§34 Before Setup 1.5: the Team Leader page loads without errors', errs.length === 0, errs.join('|'));
  await nav('Actions');
  ok('§34 Before Setup 1.5: Actions lists what was agreed, read-only, and says to run Setup 1.5', /run 0 Setup \(1\.5\)/.test(await rootText()) && (await page.locator('button:has-text("Update")').count()) === 0);
  errs = await open(page, { as: 'alex' });
  ok('§34 Before Setup 1.5: the technician page loads, with no My actions tab', errs.length === 0 && (await page.locator('.topbar button.nav:has-text("My actions")').count()) === 0, errs.join('|'));
  await mutate(function (d) { d.v14 = false; });

  // ================================================================ 35. new action outside a review, layout at 1366 px
  await open(page, { as: 'tl' }); await nav('Actions');
  await page.locator('button:has-text("+ New action")').click();
  var nm = page.locator('.modal');
  await nm.locator('select[aria-label="Technician"]').selectOption('Jordan Lee');
  await nm.locator('div:has(> label:has-text("Action")) textarea').first().fill('Update the area 2 checklist');
  await nm.locator('button:has-text("Add action")').click(); await page.waitForTimeout(150);
  ok('§35 New action: needs criteria and a deadline', (await nm.count()) === 1);
  await nm.locator('div:has(> label:has-text("Close-out criteria")) textarea').fill('Checklist reissued');
  var nd = futureIso(14);
  await nm.locator('input[aria-label="Deadline"]').fill(fmt(nd)); await nm.locator('input[aria-label="Deadline"]').press('Tab');
  await nm.locator('button:has-text("Add action")').click(); await page.waitForTimeout(500);
  var na = (await db()).lists[A].filter(function (x) { return x.Title === 'Update the area 2 checklist'; });
  ok('§35 New action: one item, key tl-…, Jordan, deadline set and verified, shared by flow 9', na.length === 1 && /^tl-/.test(na[0].ActionKey) && na[0].Technician === claims('jordan.lee@example.test') &&
    london(na[0].CurrentDue) === nd && london(na[0].OriginalDue) === nd && na[0].SharedWith === 'jordan.lee@example.test');
  var wide = await page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth + 1; });
  ok('§35 Layout: the Actions page fits 1366 px without sideways scrolling', wide);
  await shot('1366-tl-actions');
  await page.locator('tr[data-action] button:has-text("Update")').first().click(); await shot('1366-tl-update-dialog');
  await page.locator('.modal button:has-text("Cancel")').click();
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§35 Layout: My actions fits 1366 px', await page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth + 1; }));
  await shot('1366-tech-my-actions');
  await open(page, { as: 'alex' }); await shot('1366-tech-form-carry-forward');

  // ================================================================ 37. fixes from the independent reviews
  await open(page, { as: 'tl' }); await nav('Actions'); await page.locator('#oto-a-st').selectOption('all');
  var rf = (await db()).lists[A].find(function (x) { return x.Title === 'Update the area 2 checklist'; });
  await page.locator('tr[data-action="' + rf.ID + '"] button:has-text("Update")').click();
  await page.locator('.modal input[aria-label="Deadline"]').fill('28/03/2027'); await page.locator('.modal input[aria-label="Deadline"]').press('Tab');
  await page.locator('.modal div:has(> label:has-text("Why the deadline")) textarea').fill('Clock-change test');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(400);
  var rf2 = (await db()).lists[A].find(function (x) { return x.ID === rf.ID; });
  ok('§37 Dates: a deadline on the last Sunday of March (clocks change) is stored as that UK day', london(rf2.CurrentDue) === '2027-03-28' && rf2.CurrentDue === '2027-03-28T00:00:00Z' &&
    (await page.locator('.modal').count()) === 0, rf2.CurrentDue);
  await page.locator('tr[data-action="' + rf.ID + '"] button:has-text("Update")').click();
  await page.locator('.modal input[aria-label="Deadline"]').fill('25/10/2026'); await page.locator('.modal input[aria-label="Deadline"]').press('Tab');
  await page.locator('.modal div:has(> label:has-text("Why the deadline")) textarea').fill('Clock-change test 2');
  await page.locator('.modal button:has-text("Save")').click(); await page.waitForTimeout(400);
  var rf3 = (await db()).lists[A].find(function (x) { return x.ID === rf.ID; });
  ok('§37 Dates: and on the last Sunday of October', london(rf3.CurrentDue) === '2026-10-25' && rf3.CurrentDue === '2026-10-24T23:00:00Z', rf3.CurrentDue);
  // an update created as "Applied" by its sender (never processed) is not shown as recorded
  await open(page, { as: 'sam' });
  var samOpen2 = (await db()).lists[A].find(function (x) { return x.Title === 'Arrange an RPS mentor'; });
  await page.evaluate(function () { OTO_MOCK.current.db.flow10Off = true; });
  var selfA = await createUpd('u12', upd('progress', samOpen2.ID, 'Self-marked as applied', 'up-selfapplied', { ProcessState: 'Applied' }));
  ok('§37 Fixture: the self-marked update was created', selfA.status === 200 && !(selfA.json.value || []).some(function (f) { return f.HasException; }), JSON.stringify(selfA));
  await page.evaluate(function () { OTO_MOCK.current.db.flow10Off = false; sessionStorage.setItem('oto-mock-db-v9', JSON.stringify(OTO_MOCK.current.db)); });
  await open(page, { as: 'sam' }); await nav('My actions');
  var sc = await page.locator('.actcard[data-action="' + samOpen2.ID + '"]').innerText();
  ok('§37 States: "recorded ✓" only once the update is in the action\'s history (its state alone is not trusted)', /received – being recorded/.test(sc) && !/recorded ✓/.test(sc), sc.slice(0, 500));
  // unsent drafts are kept at most 7 days
  await page.evaluate(function (id) {
    localStorage.setItem('esg1to1.unsentUpdates', JSON.stringify([{ key: 'up-old', actionId: id, kind: 'progress', outcome: '', message: 'Old draft', waitingUntil: '', month: '', at: new Date(Date.now() - 9 * 86400000).toISOString(), owner: 12 }]));
  }, samOpen2.ID);
  await open(page, { as: 'sam' }); await nav('My actions');
  ok('§37 Privacy: an unsent update older than 7 days is no longer offered (or kept)', !/Old draft|not sent/.test(await page.locator('.actcard[data-action="' + samOpen2.ID + '"]').innerText()));
  // the Team Leader's own "ready" isn't shown as the technician asking; a waiting action past its next check is flagged
  await mutate(function (d, id) {
    var a = d.lists['1-to-1 Actions'].find(function (x) { return x.ID === id; }), h = JSON.parse(a.HistoryJson || '[]');
    h.push({ id: 'tready', at: new Date().toISOString(), by: 'Team Leader (mock)', role: 'tl', kind: 'status', from: 'In progress', to: 'Ready for close-out' });
    a.HistoryJson = JSON.stringify(h); a.Status = 'Ready for close-out'; a.__v++;
    var w = d.lists['1-to-1 Actions'].find(function (x) { return x.Title === 'Replace the faulty area 3 monitor head'; });
    if (w) { w.Status = 'Waiting'; w.WaitingUntil = '2000-01-01'; w.__v++; }
  }, rf.ID);
  await open(page, { as: 'tl' });
  var at = await page.locator('.attn-card').innerText();
  ok('§37 Attention: an action you marked ready says so (not "<name> asked to close")', /you marked it ready\) – Jordan Lee: Update the area 2 checklist/.test(at) && !/Jordan Lee asked to close/.test(at), at.slice(0, 800));
  ok('§37 Attention: a waiting action past its next check date is flagged', /waiting action past its next check date/.test(at));

  // ================================================================ 36. XSS – attack strings in every tracker field
  async function sweep(label, params, steps) {
    var e = await open(page, params);
    if (steps) { await steps(); await page.waitForTimeout(200); }
    var bad = await page.evaluate(function () {
      var rootEl = document.querySelector('[data-oto-root]');
      return { fired: !!window.__otoXssFired, img: rootEl.querySelectorAll('img').length, svgOnload: document.querySelectorAll('svg[onload]').length,
        scripts: rootEl.querySelectorAll('script').length, text: rootEl.innerText.indexOf('oto_xss') >= 0 };
    });
    ok('§36 XSS: ' + label + ' – shown as text, nothing executed', !bad.fired && bad.img === 0 && bad.svgOnload === 0 && bad.scripts === 0 && bad.text && e.length === 0, JSON.stringify(bad) + ' ' + e.join('|'));
  }
  await open(page, { as: 'tl', xss: '1' });
  await page.evaluate(function () { OTO_MOCK.reset(); });
  await sweep('TL Actions page with every history open', { as: 'tl', xss: '1' }, async function () {
    await nav('Actions'); await page.locator('#oto-a-st').selectOption('all');
    var hb = page.locator('tr[data-action] button:has-text("History")'), n = await hb.count();
    for (var i = 0; i < n; i++) { await hb.nth(i).click(); }
  });
  await sweep('TL update dialog', { as: 'tl', xss: '1' }, async function () { await nav('Actions'); await page.locator('tr[data-action]:has-text("Refresher ") button:has-text("Update")').first().click(); await page.locator('.modal details summary').click(); });
  await sweep('TL Needs your attention', { as: 'tl', xss: '1' });
  await sweep('Technician My actions with history', { as: 'alex', xss: '1' }, async function () { await nav('My actions'); await page.evaluate(function () { Array.prototype.forEach.call(document.querySelectorAll('[data-oto-root] details'), function (d) { d.open = true; }); }); });
  await sweep('Technician form carry-forward', { as: 'alex', xss: '1' });
  await sweep('Appraisal report actions', { as: 'alex', xss: '1' }, async function () { await nav('Appraisal report'); });

  await browser.close();
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' passed');
  if (failed.length) { process.exitCode = 1; }
}
main().catch(function (e) { console.error('TEST RUN ERROR', e); process.exitCode = 1; });
