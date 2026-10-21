// Browser smoke test of the Setup page against the simulated site, in headless Chromium.
//   node test/browser.js [path-to-chromium]
// Evidence class: LOCAL / OFFLINE-SIMULATED. Nothing here proves behaviour on the real site.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PAGE = 'file://' + path.join(__dirname, '..', 'mock', 'index.html');
const SHOTS = path.join(__dirname, 'screenshots');

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
const ARGS = ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0', '--virtual-time-budget=30000'];

function open(query, extra) {
  const r = spawnSync(CHROME, ARGS.concat(extra, [PAGE + '?' + query]), { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  return { dom: r.stdout || '', errors: (r.stderr || '').split('\n').filter((l) => /Uncaught|SyntaxError|TypeError|ReferenceError/.test(l)) };
}
function result(dom) {
  const m = /data-chs-result="([^"]*)"/.exec(dom);
  return m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
}

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
  if (!ok) failures++;
}

const idle = open('', ['--dump-dom']);
check('page renders with no script errors', /Competency Hub Setup/.test(idle.dom) && !idle.errors.length, idle.errors.join(' | '));
check('Apply starts disabled', /<button[^>]*class="btn primary"[^>]*disabled/.test(idle.dom));

const checked = open('auto=check', ['--dump-dom']);
const c = result(checked.dom);
check('Check finishes with no problems and no writes', c && c.ok && c.mode === 'check' && c.writes === 0, JSON.stringify(c));
check('Check lists planned changes', /Would create group/.test(checked.dom) && /Would make .* the first administrator/.test(checked.dom));

const applied = open('auto=apply', ['--dump-dom']);
const a = result(applied.dom);
check('Apply finishes with no problems', a && a.ok && a.mode === 'apply' && a.writes > 0, JSON.stringify(a));
check('Apply reports the first administrator', /is now the first administrator/.test(applied.dom));

const stopped = open('scenario=notOwner&auto=check', ['--dump-dom']);
const s = result(stopped.dom);
check('A non-owner is stopped', s && !s.ok && /not an owner of this site/.test(stopped.dom), JSON.stringify(s));

fs.mkdirSync(SHOTS, { recursive: true });
open('auto=check', ['--window-size=1366,1100', '--screenshot=' + path.join(SHOTS, 'setup-check-1366.png')]);
open('auto=apply', ['--window-size=1366,1100', '--screenshot=' + path.join(SHOTS, 'setup-apply-1366.png')]);
check('screenshots written', fs.existsSync(path.join(SHOTS, 'setup-apply-1366.png')));

console.log(failures ? failures + ' failed' : 'All browser checks passed');
process.exit(failures ? 1 : 0);
