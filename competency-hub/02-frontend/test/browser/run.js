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
const BASE_ARGS = ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0'];

function open(query, extra, budget) {
  const r = spawnSync(CHROME, BASE_ARGS.concat(['--virtual-time-budget=' + (budget || 15000)], extra || [], [PAGE + '?' + query]), { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
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
check('technician home: this week, actions and all ten areas, other areas marked view only', t.includes('This week') && t.includes('Your actions') && t.includes('10 areas') && t.includes('View only'));
check('technician home: own late action shown in plain words', t.includes('Replace FH40 probe') && t.includes('2 days late'));
check('technician home: uncommitted action never shown', !t.includes('Half-created'));
check('technician home: no management or engineer panels', !t.includes('Needs your attention') && !t.includes('For you to manage'));
check('environment badge says TEST', t.includes('TEST – not live data'));

r = dump('as=' + RICHARD);
t = text(r.dom);
check('engineer home: "For you to manage" lists late work in their areas, with owners', r.errors.length === 0 && t.includes('For you to manage') && t.includes('Green Stream sampling backlog (Luke Cain)'));

r = dump('as=' + ROBERT);
t = text(r.dom);
check('group head home: all areas, attention list, totals count shared actions once', r.errors.length === 0 && t.includes('10 areas') &&
  t.includes('Needs your attention') && t.includes('26 open actions') && !t.includes('View only'));
r = dump('as=' + JOE);
check('team leader home: same overview as group head', text(r.dom).includes('Needs your attention'));


// Home page fits the window with no page scrolling, for every role, with and without an area open
[[1920, 990], [1366, 798]].forEach(([w, hh]) => {
  [['technician', RACHEL], ['engineer', RICHARD], ['group head', ROBERT]].forEach(([who, id]) => {
    const d = open('as=' + id + '&drive=homeFit', ['--window-size=' + w + ',' + hh, '--dump-dom']);
    const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
    const res = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : { ok: false, error: d.errors.join(' | ') };
    const x = res.result || {};
    check('home fits ' + w + '×' + hh + ' (' + who + '): no page scroll, nothing cut off', res.ok && x.home.fitted && !x.home.scrolls && !x.home.cut, JSON.stringify(res));
    check('area opens in place ' + w + '×' + hh + ' (' + who + '): other sections fold, still no scroll', res.ok && x.opened.name === x.name &&
      x.opened.compact && x.opened.weekFolded && x.opened.actionsFolded && !x.opened.scrolls && !x.opened.cut, JSON.stringify(res));
    if (w === 1920 && id === RACHEL) {
      check('Escape closes the area, puts the sections back and returns focus to its tile', res.ok && x.closed.gone && x.closed.weekOpen && !!x.closed.focus, JSON.stringify(res));
      check('a folded section is remembered after a reload', res.ok && x.remembered, JSON.stringify(res));
    }
  });
});
t = text(dump('as=' + RACHEL + '&area=FLK').dom);
check('?area=FLK opens Flask in place on the home page', t.includes('Flask') && t.includes('Raise an action here') && t.includes('Full page'));
t = text(dump('as=' + RACHEL + '&area=RW').dom);
check('an area you are not a member of opens view only, with no raise button', t.includes('View only') && !t.includes('Raise an action here') && t.includes('Post a notice here'));

// Area pages
r = dump('as=' + RACHEL + '&view=area&area=RW');
t = text(r.dom);
check('non-member area: view-only bar, no raise or meeting buttons', t.includes('View only.') && !t.includes('Raise an action') && !t.includes('Start meeting'));
r = dump('as=' + RACHEL + '&view=area&area=FLK');
t = text(r.dom);
check('member area: raise and post available, no meeting control for a technician', t.includes('Raise an action') && t.includes('Post a notice') && !t.includes('Start meeting'));
t = text(dump('as=' + RACHEL + '&view=area&area=RP').dom);
check('a shared action appears in the linked area, labelled with its home area', t.includes('Contamination monitor checks') && t.includes('shared from Flask'));
r = dump('as=' + RICHARD + '&view=area&area=RW');
check('engineer in own area: meeting control offered', text(r.dom).includes('Start meeting'));
r = dump('as=' + ROBERT + '&view=area&area=DSL');
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
  check('fails closed – ' + name + ': message shown, no operational data', d.includes(expect) && !d.includes('This week') && !d.includes('Replace FH40 probe'));
});
t = text(dump('as=' + RACHEL + '&mode=actions404').dom);
check('missing Actions list: explained, not shown as "no actions"', t.includes('Could not load actions') && !t.includes('You have no open actions') && !t.includes('Nothing late') && t.includes('Action figures unavailable'));
t = text(dump('as=' + ROBERT + '&mode=actions404').dom);
check('missing Actions list: management sees no false totals', t.includes('Action figures could not be loaded') && !t.includes('open actions,') && !t.includes('Nothing needs your attention'));
t = text(dump('as=' + ROBERT + '&mode=actionsPartial').dom);
check('read limit reached: marked as not complete', t.includes('This list is not complete'));
t = text(dump('as=' + RACHEL + '&mode=slow').dom);
check('slow responses: page still completes', t.includes('This week'));

// Scripted interactions
function drive(query, budget) {
  const d = open(query, ['--dump-dom'], budget);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  if (!m) return { ok: false, error: 'no result; script errors: ' + d.errors.join(' | ') };
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
let res = drive('as=' + RACHEL + '&view=area&area=RW&drive=postNoticeOutside');
check('non-member posts a notice: outside note shown, "important" hidden', res.ok && res.result.outsideShown && res.result.importantHidden, JSON.stringify(res));
check('non-member notice appears labelled as from outside the area', res.ok && res.result.labelled, JSON.stringify(res));
check('the notice is the only write, to the Noticeboard Radwaste folder', res.ok && res.result.writes.length === 1 &&
  res.result.writes[0].list === 'Noticeboard' && res.result.writes[0].folder === 'RW', JSON.stringify(res));
res = drive('as=' + RACHEL + '&view=area&area=FLK&drive=noticeValidation');
check('empty notice: errors shown, focus on title, nothing sent', res.ok && res.result.titleError && res.result.bodyError &&
  res.result.focused === 'ch-n-title' && res.result.writes === 0, JSON.stringify(res));
res = drive('as=' + RACHEL + '&view=area&area=FLK&drive=keyboardTabs');
check('arrow keys move between area tabs', res.ok && res.result.selected === 'Notices & issues' && res.result.focused === 'Notices & issues', JSON.stringify(res));
res = drive('as=' + ROBERT + '&drive=readOnlyAudit');
check('every area and tab opened: no writes, no POSTs', res.ok && res.result.areasVisited === 10 && res.result.writes === 0 && res.result.posts === 0, JSON.stringify(res));

// Actions (plan K7): raise, update, extend, mark as done, stale changes, view only, keyboard
const SLOW = 200000;
res = drive('as=' + RICHARD + '&drive=raiseAction', SLOW);
check('raise: empty title and a past date are refused, in plain words', res.ok && /Enter what needs doing/.test(res.result.emptyError) && /past/.test(res.result.pastError), JSON.stringify(res));
check('raise: an engineer\'s owner list holds area members and management, with "(you)"', res.ok && res.result.owners.some((o) => /Richard Harrisson \(you\)/.test(o)) &&
  res.result.owners.some((o) => /Robert Starbuck – Group Head/.test(o)) && res.result.owners.length > 5, JSON.stringify(res && res.result && res.result.owners));
check('raise: summary shown, then "being recorded" until the flow confirms it', res.ok && /Order replacement smear papers/.test(res.result.summary) &&
  /(being|to be) recorded/.test(res.result.stripText), JSON.stringify(res));
check('raise: the new action appears once confirmed, and the note goes', res.ok && res.result.listed && res.result.stripGone && res.result.request.status === 'Completed', JSON.stringify(res));
check('raise: once confirmed, the new action opens on click without a reload', res.ok && res.result.reachable && res.result.opens, JSON.stringify(res));
check('raise: the only write is a request in the user\'s own folder', res.ok && res.result.writes.length === 1 && res.result.writes[0].list === 'Requests' &&
  res.result.writes[0].folder === 'u' + RICHARD && res.result.request.type === 'RaiseAction', JSON.stringify(res && res.result && res.result.writes));
res = drive('as=' + RACHEL + '&action=40&drive=updateAndExtend', SLOW);
check('action panel: what, who and when in plain words, with the original deadline', res.ok && /2 days late/.test(res.result.before) && /Was due/.test(res.result.before) &&
  /Rachel Boulden is doing it/.test(res.result.before) && /Deadline moved once \(was/.test(res.result.before), JSON.stringify(res && res.result && res.result.before));
check('update: saved instantly into the action\'s own folder and listed', res.ok && res.result.writes[0].list === 'Updates' && res.result.writes[0].folder === 'FLK/A40', JSON.stringify(res));
check('extend: a short reason is refused; the effect is explained', res.ok && /10 characters/.test(res.result.reasonError) && /The new deadline will be/.test(res.result.effect), JSON.stringify(res));
check('extend: pending while recorded, buttons disabled, then the history shows both changes', res.ok && /(being|to be) recorded/.test(res.result.pending) &&
  res.result.buttonsDisabled && /Show all deadline changes \(2\)/.test(res.result.after) && res.result.history === 2, JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=reloadWhilePending', SLOW);
check('reload while an extension is recorded: the note comes back, then clears once confirmed', res.ok && /change being recorded/.test(res.result.noteAfterReload) &&
  res.result.confirmedNoteGone, JSON.stringify(res));
check('reload while a raised action is recorded: the strip comes back, and the new action opens on click', res.ok && /(being|to be) recorded/.test(res.result.stripAfterReload) &&
  res.result.reachable && res.result.opened, JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=staleCopy&stamp=0.0.1');
check('an old copy of an app file is reported, with Ctrl+F5', res.ok && /Ctrl\+F5/.test(res.result.banner), JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=staleCopy');
check('matching files: no old-copy banner', res.ok && res.result.banner === '', JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=53&drive=markDone', SLOW);
check('mark as done: explained, then the action is closed', res.ok && /will be closed/.test(res.result.explain) && res.result.status === 'Closed', JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=staleRevision', SLOW);
check('a change based on an old version is refused with the plain message, and nothing changes', res.ok &&
  /updated by someone else/.test(res.result.panel) && res.result.status === 'In Progress', JSON.stringify(res));
// Finishing actions (plan K9): status, reassign, close and reopen, edit, close-out, My actions
const KELLY = 102, CRAIG = 105;
res = drive('as=' + RACHEL + '&action=40&drive=statusBlocker', SLOW);
check('status: "waiting on something" needs what it waits on, then shows it', res.ok && /at least 10 characters/.test(res.result.blockerError) &&
  /Waiting on/.test(res.result.panel) && res.result.action.Status === 'Awaiting Input' && /replacement probe/.test(res.result.action.Blocker), JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=reassign', SLOW);
check('reassign: the current owner is not offered; the action moves to the new owner', res.ok && !res.result.options.some((o) => /Rachel Boulden/.test(o)) &&
  res.result.owner === JOE, JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=closeAndReopen', SLOW);
check('close: a note is needed for "Superseded"; the panel then shows it closed', res.ok && /at least 10 characters/.test(res.result.noteError) &&
  /Closed on .* superseded/.test(res.result.closedPanel), JSON.stringify(res && res.result && res.result.closedPanel));
check('reopen: the closed action opens again as In progress', res.ok && res.result.action.Status === 'In Progress' && res.result.action.IsOpen === true, JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=editDetails', SLOW);
check('edit details: only the changed title is sent, and saved', res.ok && JSON.stringify(res.result.payload) === JSON.stringify({ title: 'Replace FH40 probe (bay 3)' }) &&
  res.result.title === 'Replace FH40 probe (bay 3)', JSON.stringify(res));
res = drive('as=' + CRAIG + '&action=61&drive=closeOut', SLOW);
check('close-out: the raiser confirms a done action and it is closed as Completed', res.ok && res.result.status === 'Closed' && res.result.outcome === 'Completed', JSON.stringify(res));
res = drive('as=' + RACHEL + '&view=mine&drive=myActions');
check('my actions: my open actions, the tabs, and the area filter', res.ok && res.result.mine.includes('Replace FH40 probe') &&
  res.result.tabs.join('|') === 'Mine|Raised by me' && res.result.filtered.length && res.result.filtered.every((t) => !/FH40/.test(t)), JSON.stringify(res));
check('my actions: finished items are read on demand and open read-only for the owner', res.ok && res.result.finished.includes('Replace FH30 probe') &&
  /Closed on/.test(res.result.panel) && !res.result.buttons.includes('Reopen'), JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=62&drive=viewOnlyAction');
check('view only: an action in another area has no buttons and says why', res.ok && res.result.buttons === 0 && /You can read this action/.test(res.result.panel) &&
  !/More options/.test(res.result.panel), JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=dialogKeyboard');
check('keyboard: focus moves into the action, Escape closes it and focus returns', res.ok && res.result.inside && res.result.closed && res.result.focusBack, JSON.stringify(res));

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
open('as=' + RACHEL + '&view=area&area=RW', ['--window-size=1366,1100', '--screenshot=' + path.join(SHOTS, 'technician-view-only-area-1366.png')]);
open('as=' + RACHEL + '&mode=unknown', ['--window-size=1366,700', '--screenshot=' + path.join(SHOTS, 'unknown-user-1366.png')]);
check('screenshots written', fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length >= 11);

// Safety net (spec REL-2, REL-3, REL-5)
res = drive('as=' + RACHEL + '&mode=limited&drive=limitedMode');
check('limited mode: a banner explains that changes are paused and nothing is lost', res.ok && /can't be processed at the moment/.test(res.result.banner) && /nothing you have already sent is lost/.test(res.result.banner), JSON.stringify(res));
check('limited mode: raising is not offered, with a plain message', res.ok && !res.result.raiseOpened && /Raising actions is paused/.test(res.result.toast), JSON.stringify(res));
check('limited mode: only "Add an update" stays available in an action', res.ok && res.result.buttons.every((b) => b[1] === (b[0] !== 'Add an update')) && /You can still add an update/.test(res.result.note) && res.result.writes === 0, JSON.stringify(res));
res = drive('as=' + RACHEL + '&mode=flowFail&drive=retrying', SLOW);
check('a failed change is shown as retrying automatically, never as saved', res.ok && /retrying automatically/.test(res.result.pending) && !res.result.saved, JSON.stringify(res));
res = drive('as=' + JOE + '&mode=attention&drive=adminPage', SLOW);
check('administrator home: says how many changes need attention, with a link', res.ok && /2 changes need your attention/.test(res.result.line), JSON.stringify(res));
check('admin page: health, then each change with who asked, attempts and the last error', res.ok && /Automatic processing is working/.test(res.result.page) && /Reminders ran/.test(res.result.page) &&
  res.result.items.length === 2 && res.result.items.every((i) => /Asked by Rachel Boulden/.test(i.text) && /3 attempts/.test(i.text) && /Last error/.test(i.text)), JSON.stringify(res));
check('admin page: nothing changed offers Try again or Cancel; part made offers Finish or Revert', res.ok &&
  JSON.stringify(res.result.items.map((i) => i.buttons)) === JSON.stringify([['Try again', 'Cancel'], ['Finish', 'Revert']]), JSON.stringify(res && res.result && res.result.items));
check('admin page: a choice is confirmed in plain words before it is sent', res.ok && /Close this change without making it/.test(res.result.confirmText), JSON.stringify(res));
check('admin page: Cancel and Revert are sent as requests and their results shown; the locked action is released',
  res.ok && res.result.unlocked && JSON.stringify(res.result.tx) === JSON.stringify([['tx-nothing', 'Cancelled'], ['tx-partly', 'Reverted']]) &&
  res.result.writes.every((w) => w.list === 'Requests' && w.folder === 'u' + JOE), JSON.stringify(res));
t = text(dump('as=' + RACHEL + '&mode=attention').dom);
check('staff see no administration line', !t.includes('Open Administration') && !t.includes('need your attention'));
t = text(dump('as=' + RACHEL + '&view=admin').dom);
check('the admin page refuses anyone who is not an administrator', t.includes('Only Competency Hub administrators can use this page.') && !t.includes('Automatic processing'));

// People administration and the technician restriction (spec §3.2, §4.2)
res = drive('as=' + JOE + '&drive=peoplePage', SLOW);
check('people: everyone is listed and the search narrows the list', res.ok && res.result.names >= 28 && JSON.stringify(res.result.found) === '["Rachel Boulden"]', JSON.stringify(res));
check('people: an empty email is refused before anything is sent', res.ok && /Enter their email address/.test(res.result.emptyError), JSON.stringify(res));
check('people: one person and a pasted list are added and verified; bad lines are refused with a reason', res.ok &&
  JSON.stringify(res.result.added) === '["Test Person","Second Person"]' && /Not an email address/.test(res.result.pasted) && /Unknown area: XYZ/.test(res.result.pasted) &&
  res.result.secondRows.length === 2 && res.result.secondRows.every((r) => r[1]), JSON.stringify(res));
check('people: meeting rights are saved for an area', res.ok && res.result.chair, JSON.stringify(res));
check('people: you cannot change your own access', res.ok && /can't change your own access/.test(res.result.selfNote), JSON.stringify(res));
check('people: every change is a request from your own folder', res.ok && res.result.writes.length && res.result.writes.every((w) => w === 'Requests/u' + JOE), JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=technicianRaise');
check('a technician without meeting rights can only choose themselves as owner, and is told why', res.ok &&
  JSON.stringify(res.result.owners) === '["Rachel Boulden (you)"]' && res.result.shown && /for yourself in this area/.test(res.result.note), JSON.stringify(res));

console.log(failures ? failures + ' browser check(s) failed' : 'All browser checks passed');
process.exit(failures ? 1 : 0);
