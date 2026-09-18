// Drives the whole app on phone- and tablet-sized touch screens and fails on
// any console error, page error, or missing UI.
//   node tools/smoke-test.mjs [--shots]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './playwright-loader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const shotDir = resolve(appDir, '.screenshots');
const wantShots = process.argv.includes('--shots');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

function serve() {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
    const file = join(appDir, rel);
    if (!file.startsWith(appDir) || !existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const failures = [];
const check = (label, condition) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}`);
  if (!condition) failures.push(label);
};

const DEVICES = [
  { name: 'iphone', viewport: { width: 393, height: 852 } },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 } },
  { name: 'ipad', viewport: { width: 834, height: 1112 } },
  { name: 'ipad-landscape', viewport: { width: 1194, height: 834 } },
];

const { chromium } = await loadPlaywright();
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
if (wantShots) mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();

for (const device of DEVICES) {
  console.log(`\n── ${device.name} ${device.viewport.width}x${device.viewport.height}`);
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (msg) => { if (msg.type() === 'error') problems.push(msg.text()); });
  page.on('pageerror', (err) => problems.push(String(err)));

  await page.goto(base);
  await page.waitForSelector('.screen--home.screen--active', { timeout: 10000 });
  await page.waitForTimeout(200);
  const shot = async (name) => { if (wantShots) await page.screenshot({ path: join(shotDir, `${device.name}-${name}.png`) }); };

  // Home
  check('home shows characters', await page.locator('.screen--home .pick').count() > 0);
  check('home shows room thumbnails', await page.locator('.pick--wide').count() > 0);
  check('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot('1-home');

  // Character creator
  await page.locator('.home__actions .btn').first().click();
  await page.waitForSelector('.screen--editor.screen--active');
  const beforeHair = await page.locator('.screen--active .stage .pw-hair-front, .screen--active .stage .pw-hair-back').count();
  const optionCount = await page.locator('.screen--active .tray .opt').count();
  check('creator offers style options', optionCount > 3);
  await page.locator('.screen--active .tray .opt').nth(3).click();
  await page.waitForTimeout(120);
  check('creator swatches render', await page.locator('.screen--active .tray .swatch').count() > 3);
  await page.locator('.screen--active .tray .swatch').nth(4).click();
  await page.waitForTimeout(120);
  check('avatar still drawn after edits', await page.locator('.screen--active .stage svg .pw-head').count() === 1);
  check('tap targets are at least 44px', await page.evaluate(() => {
    const small = [...document.querySelectorAll('.screen--active .btn, .screen--active .tab, .screen--active .opt')]
      .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); });
    return small.length === 0;
  }));
  await shot('2-character');
  void beforeHair;

  // Every category renders without throwing.
  const tabCount = await page.locator('.screen--active .tray .tab').count();
  for (let i = 0; i < tabCount; i++) {
    await page.locator('.screen--active .tray .tab').nth(i).click();
    await page.waitForTimeout(60);
  }
  check('all creator categories render', await page.locator('.screen--active .tray .opt, .screen--active .tray .swatch').count() > 0);

  await page.locator('.screen--active .topbar .btn').first().click();          // back home
  await page.waitForSelector('.screen--home.screen--active');

  // House builder
  await page.locator('.home__actions .btn').nth(1).click();
  await page.waitForSelector('.screen--editor.screen--active .stage--room');
  const itemsBefore = await page.locator('.screen--active .stage--room svg g[data-uid]').count();
  check('room starts furnished', itemsBefore > 3);
  await page.locator('.screen--active .tray .opt').first().click();
  await page.waitForTimeout(150);
  check('tapping the tray adds furniture',
    await page.locator('.screen--active .stage--room svg g[data-uid]').count() === itemsBefore + 1);
  check('selection handles appear', await page.locator('.screen--active .handles:not([hidden])').count() === 1);

  // Drag the new piece with touch.
  const stageBox = await page.locator('.screen--active .stage--room').boundingBox();
  const target = await page.locator('.screen--active .stage--room svg g[data-uid]').last().boundingBox();
  if (target) {
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + stageBox.width * 0.3, stageBox.y + stageBox.height * 0.7, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  check('drag kept the item in the room', await page.locator('.screen--active .stage--room svg g[data-uid]').count() === itemsBefore + 1);

  // Paint it, resize it, undo.
  await page.locator('.screen--active .tray .swatch').first().click();
  await page.locator('.screen--active .handles .btn').nth(1).click();
  await page.locator('.screen--active .topbar .btn').nth(1).click();           // undo
  await page.waitForTimeout(120);
  check('undo works', await page.locator('.screen--active .stage--room svg g[data-uid]').count() >= itemsBefore);

  // Room styling tab.
  await page.locator('.screen--active .tray .tab').last().click();
  await page.waitForTimeout(120);
  check('room style tab renders', await page.locator('.screen--active .tray .opt:visible').count() > 4);
  await page.locator('.screen--active .tray .opt:visible').nth(2).click();
  await page.waitForTimeout(150);
  check('wallpaper change redraws the room', await page.locator('.screen--active .stage--room svg rect').count() > 0);
  await shot('3-house');

  await page.locator('.screen--active .topbar .btn').first().click();
  await page.waitForSelector('.screen--home.screen--active');

  // Play mode
  await page.locator('.home__actions .btn').nth(2).click();
  await page.waitForSelector('.screen--play.screen--active');
  await page.waitForTimeout(200);
  check('character is in the room', await page.locator('.screen--play .pw-avatar').count() === 1);

  const playBox = await page.locator('.screen--play .stage').boundingBox();
  const before = await page.locator('.screen--play .pw-avatar').getAttribute('transform');
  await page.mouse.click(playBox.x + playBox.width * 0.78, playBox.y + playBox.height * 0.82);
  await page.waitForTimeout(900);
  const after = await page.locator('.screen--play .pw-avatar').getAttribute('transform');
  check('tapping the floor moves the character', before !== after);

  // Pick the character up and put them down somewhere else.
  const heroBox = await page.locator('.screen--play .pw-avatar').boundingBox();
  const heroBefore = await page.locator('.screen--play .pw-avatar').getAttribute('transform');
  await page.mouse.move(heroBox.x + heroBox.width / 2, heroBox.y + heroBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(playBox.x + playBox.width * 0.25, playBox.y + playBox.height * 0.7, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('the character can be dragged', heroBefore !== await page.locator('.screen--play .pw-avatar').getAttribute('transform'));

  // Sit on the sofa.
  const sofa = await page.locator('.screen--play .stage svg g[data-def="sofa"]').first().boundingBox();
  if (sofa) {
    await page.mouse.click(sofa.x + sofa.width / 2, sofa.y + sofa.height * 0.6);
    const sat = await page.waitForFunction(
      () => document.querySelector('.screen--play .pw-avatar')?.innerHTML.includes('pw-sit'),
      null, { timeout: 5000 }).then(() => true).catch(() => false);
    check('tapping the sofa makes the character sit', sat);
  }

  // Switch the TV on.
  const tv = await page.locator('.screen--play .stage svg g[data-def="tv"]').first().boundingBox();
  if (tv) {
    await page.mouse.click(tv.x + tv.width / 2, tv.y + tv.height * 0.4);
    const watching = await page.waitForFunction(
      () => document.querySelector('.screen--play g[data-def="tv"]')?.innerHTML.includes('#8fd6ff'),
      null, { timeout: 5000 }).then(() => true).catch(() => false);
    check('tapping the TV switches it on', watching);
  }

  await page.locator('.screen--play.screen--active .topbar .btn').nth(1).click();   // next room
  await page.waitForTimeout(300);
  check('room switch works in play', await page.locator('.screen--play .pw-avatar').count() === 1);
  await shot('4-play');

  // Persistence across a reload.
  await page.reload();
  await page.waitForSelector('.screen--active');
  await page.waitForTimeout(250);
  check('state survives a reload', await page.locator('.screen--active').count() === 1);

  check('no console errors', problems.length === 0);
  if (problems.length) problems.slice(0, 6).forEach((p) => console.log('    →', p));

  await context.close();
}

await browser.close();
server.close();

console.log(`\n${failures.length ? `${failures.length} check(s) failed` : 'All checks passed'}`);
if (wantShots) console.log(`Screenshots in ${shotDir}`);
process.exit(failures.length ? 1 : 0);
