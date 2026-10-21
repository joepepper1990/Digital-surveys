// Browser tests against the simulated SharePoint, in headless Chromium.
//   node test/browser/run.js [path-to-chromium]
// Evidence class: LOCAL / OFFLINE-SIMULATED. Nothing here proves behaviour on the real site.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = 'file://' + path.join(ROOT, 'mock', 'index.html');
const SHOTS = path.join(__dirname, '..', 'screenshots');

function findChrome() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    const dir = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().pop();
    if (dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  }
  throw new Error('Chromium not found: pass its path as the first argument or set CHROME_PATH.');
}
const CHROME = findChrome();
const BASE_ARGS = ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0', '--virtual-time-budget=15000'];

function open(query, extra) {
  const r = spawnSync(CHROME, BASE_ARGS.concat(extra || [], [PAGE + '?' + query]), { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const errors = (r.stderr || '').split('\n').filter((l) => /Uncaught|SyntaxError|TypeError|ReferenceError/.test(l));
  return { dom: r.stdout || '', errors };
}
const dump = (query) => open(query, ['--dump-dom']);
const text = (dom) => dom.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
  if (!ok) failures++;
}

const RACHEL = 112, RICHARD = 107, JOE = 126, ROBERT = 129;

// Front pages by role
let r = dump('as=' + RACHEL);
let t = text(r.dom);
check('technician home: no script errors', r.errors.length === 0, r.errors.join(' | '));
check('technician home: own areas, then other areas marked view only', t.includes('Your areas') && t.includes('Other areas') && t.includes('View only'));
check('technician home: own late action shown in plain words', t.includes('Replace FH40 probe') && t.includes('2 days late'));
check('technician home: uncommitted action never shown', !t.includes('Half-created'));
check('technician home: no management or engineer panels', !t.includes('Needs your attention') && !t.includes('For you to manage'));
check('environment badge says TEST', t.includes('TEST – not live data'));

r = dump('as=' + RICHARD);
t = text(r.dom);
check('engineer home: "For you to manage" panel', r.errors.length === 0 && t.includes('For you to manage') && t.includes('late actions in areas you look after'));

r = dump('as=' + ROBERT);
t = text(r.dom);
check('group head home: all areas, attention list, totals count shared actions once', r.errors.length === 0 && t.includes('All areas') &&
  t.includes('Needs your attention') && t.includes('26 open actions') && !t.includes('Other areas'));
r = dump('as=' + JOE);
check('team leader home: same overview as group head', text(r.dom).includes('Needs your attention'));

// Area pages
r = dump('as=' + RACHEL + '&area=RW');
t = text(r.dom);
check('non-member area: view-only bar, no raise or meeting buttons', t.includes('View only.') && !t.includes('Raise an action') && !t.includes('Start meeting'));
r = dump('as=' + RACHEL + '&area=FLK');
t = text(r.dom);
check('member area: raise and post available, no meeting control for a technician', t.includes('Raise an action') && t.includes('Post a notice') && !t.includes('Start meeting'));
t = text(dump('as=' + RACHEL + '&area=RP').dom);
check('a shared action appears in the linked area, labelled with its home area', t.includes('Contamination monitor checks') && t.includes('shared from Flask'));
r = dump('as=' + RICHARD + '&area=RW');
check('engineer in own area: meeting control offered', text(r.dom).includes('Start meeting'));
r = dump('as=' + ROBERT + '&area=DSL');
check('group head: writes in every area', text(r.dom).includes('Raise an action') && !text(r.dom).includes('View only.'));

// Fail-closed identity and error states
const states = [
  ['unknown user', 'mode=unknown', 'You do not have access yet'],
  ['duplicate person', 'mode=duplicate', 'appears more than once'],
  ['person marked Left', 'mode=left', 'marked as having left'],
  ['People list denied', 'mode=people403', 'We could not confirm your access']
];
states.forEach(([name, q, expect]) => {
  const d = text(dump('as=' + RACHEL + '&' + q).dom);
  check('fails closed – ' + name + ': message shown, no operational data', d.includes(expect) && !d.includes('Your areas') && !d.includes('Replace FH40 probe'));
});
t = text(dump('as=' + RACHEL + '&mode=actions404').dom);
check('missing Actions list: explained, not shown as "no actions"', t.includes('Could not load actions') && !t.includes('You have no open actions') && !t.includes('Nothing late') && t.includes('Action figures unavailable'));
t = text(dump('as=' + ROBERT + '&mode=actions404').dom);
check('missing Actions list: management sees no false totals', t.includes('Action figures could not be loaded') && !t.includes('open actions,') && !t.includes('Nothing needs your attention'));
t = text(dump('as=' + ROBERT + '&mode=actionsPartial').dom);
check('read limit reached: marked as not complete', t.includes('This list is not complete'));
t = text(dump('as=' + RACHEL + '&mode=slow').dom);
check('slow responses: page still completes', t.includes('Your areas'));

// Scripted interactions
function drive(query) {
  const d = dump(query);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  if (!m) return { ok: false, error: 'no result; script errors: ' + d.errors.join(' | ') };
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
let res = drive('as=' + RACHEL + '&area=RW&drive=postNoticeOutside');
check('non-member posts a notice: outside note shown, "important" hidden', res.ok && res.result.outsideShown && res.result.importantHidden, JSON.stringify(res));
check('non-member notice appears labelled as from outside the area', res.ok && res.result.labelled, JSON.stringify(res));
check('the notice is the only write, to the Noticeboard Radwaste folder', res.ok && res.result.writes.length === 1 &&
  res.result.writes[0].list === 'Noticeboard' && res.result.writes[0].folder === 'RW', JSON.stringify(res));
res = drive('as=' + RACHEL + '&area=FLK&drive=noticeValidation');
check('empty notice: errors shown, focus on title, nothing sent', res.ok && res.result.titleError && res.result.bodyError &&
  res.result.focused === 'ch-n-title' && res.result.writes === 0, JSON.stringify(res));
res = drive('as=' + RACHEL + '&area=FLK&drive=keyboardTabs');
check('arrow keys move between area tabs', res.ok && res.result.selected === 'Notices & issues' && res.result.focused === 'Notices & issues', JSON.stringify(res));
res = drive('as=' + ROBERT + '&drive=readOnlyAudit');
check('every area and tab opened: no writes, no POSTs', res.ok && res.result.areasVisited === 10 && res.result.writes === 0 && res.result.posts === 0, JSON.stringify(res));

// Sizes follow the width the app has, and the reader's text size (plan K6.9)
const sized = (w) => { const d = open('as=' + ROBERT + '&drive=sizes', ['--window-size=' + w + ',1200', '--dump-dom']); const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom); return m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : { ok: false }; };
const s1366 = sized(1366), s2560 = sized(2560);
check('text and tiles are larger on a wide screen', s1366.ok && s2560.ok && s2560.result.tile > s1366.result.tile * 1.3 && s2560.result.h1 > s1366.result.h1,
  JSON.stringify([s1366, s2560]));
check('no sideways scrolling at 1366 or 2560 px', s1366.ok && s2560.ok && !s1366.result.scrollsSideways && !s2560.result.scrollsSideways, JSON.stringify([s1366, s2560]));
check('"Larger" text size enlarges the text and is remembered', s1366.ok && s1366.result.larger > s1366.result.tile * 1.2 && s1366.result.saved === 'Larger',
  JSON.stringify(s1366));

// Screenshots: three roles at three widths, plus a view-only area
fs.mkdirSync(SHOTS, { recursive: true });
[['technician', RACHEL], ['engineer', RICHARD], ['group-head', ROBERT]].forEach(([name, id]) => {
  [2560, 1920, 1366, 768].forEach((w) => {
    open('as=' + id, ['--window-size=' + w + ',1500', '--screenshot=' + path.join(SHOTS, name + '-' + w + '.png')]);
  });
});
open('as=' + RACHEL + '&area=RW', ['--window-size=1366,1100', '--screenshot=' + path.join(SHOTS, 'technician-view-only-area-1366.png')]);
open('as=' + RACHEL + '&mode=unknown', ['--window-size=1366,700', '--screenshot=' + path.join(SHOTS, 'unknown-user-1366.png')]);
check('screenshots written', fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length >= 11);

console.log(failures ? failures + ' browser check(s) failed' : 'All browser checks passed');
process.exit(failures ? 1 : 0);
