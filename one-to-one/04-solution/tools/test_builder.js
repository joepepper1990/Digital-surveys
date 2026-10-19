// Headless test of legacy-package-builder.html: rejects bad input, makes no network requests, and produces eight
// standard zip files whose contents are exactly the legacy templates with the values filled in.
// Run from 04-solution:  node tools/test_builder.js   (then python3 tools/check_builder_zips.py checks the zips)
'use strict';
var path = require('path');
var fs = require('fs');
var PW = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright';
var CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium = require(PW).chromium;
var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, '.builder-test');

(async function () {
  var fails = 0;
  function ok(name, cond, detail) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || !detail ? '' : '  — ' + detail)); if (!cond) { fails++; } }
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
  var browser = await chromium.launch({ executablePath: CHROME });
  var ctx = await browser.newContext({ acceptDownloads: true });
  var page = await ctx.newPage();
  var external = [], errors = [];
  page.on('request', function (r) { if (!r.url().startsWith('file:') && !r.url().startsWith('blob:')) { external.push(r.url()); } });
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto('file://' + path.join(ROOT, 'legacy-package-builder.html'));
  await page.fill('#site', 'not a url'); await page.fill('#mail', 'tl@example.test'); await page.click('#go');
  ok('Builder: rejects a bad site address', /site address/.test(await page.textContent('#msg')));
  await page.fill('#site', "https://contoso.sharepoint.com/sites/x'y"); await page.click('#go');
  ok('Builder: rejects quotes in the site address', /site address/.test(await page.textContent('#msg')));
  await page.fill('#site', 'https://contoso.sharepoint.com/sites/esg-1to1/'); await page.fill('#mail', 'bad'); await page.click('#go');
  ok('Builder: rejects a bad email', /valid email/.test(await page.textContent('#msg')));
  await page.fill('#mail', 'team.leader@example.test');
  var downloads = [];
  page.on('download', function (d) { downloads.push(d); });
  await page.click('#go');
  for (var w = 0; w < 40 && downloads.length < 11; w++) { await page.waitForTimeout(250); }
  await page.waitForTimeout(300);
  // browsers allow about 10 automatic downloads at once; the page lists every package as a link for the rest
  var got = downloads.map(function (d) { return d.suggestedFilename(); });
  var links = await page.$$('#files a');
  for (var li = 0; li < links.length; li++) {
    var nm = await links[li].textContent();
    if (got.indexOf(nm) < 0) { var dl = page.waitForEvent('download'); await links[li].click(); await dl; await page.waitForTimeout(200); }
  }
  ok('Builder: eleven downloads', downloads.length === 11, downloads.length);
  for (var i = 0; i < downloads.length; i++) { await downloads[i].saveAs(path.join(OUT, downloads[i].suggestedFilename())); }
  ok('Builder: eleven links listed', (await page.$$('#files a')).length === 11);
  ok('Builder: no network requests', external.length === 0, external.join(', '));
  ok('Builder: no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
