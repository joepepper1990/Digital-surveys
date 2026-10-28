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
check('technician home: this week, actions and all ten areas, other areas marked view only', t.includes('Coming up this week') && t.includes('Your to-dos') && (r.dom.match(/class="tile hm-tile/g) || []).length === 10 && t.includes('View only'));
check('technician home: own late action shown in plain words', t.includes('Replace FH40 probe') && t.includes('2 days late'));
check('technician home: uncommitted action never shown', !t.includes('Half-created'));
check('technician home: no management or engineer panels', !t.includes('Needs your attention') && !t.includes('For you to manage'));
check('environment badge says TEST', t.includes('TEST – not live data'));

r = dump('as=' + RICHARD);
t = text(r.dom);
check('engineer home: "For you to manage" lists late work in their areas, with owners', r.errors.length === 0 && t.includes('For you to manage') && t.includes('Green Stream sampling backlog (Luke Cain)'));

r = dump('as=' + ROBERT);
t = text(r.dom);
// release 1.2: the greeting stands alone; group totals (each shared action counted once) are on the Overview page
check('group head home: all areas and the attention list, nothing view only', r.errors.length === 0 && (r.dom.match(/class="tile hm-tile/g) || []).length === 10 &&
  t.includes('Needs your attention') && !t.includes('View only'));
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
// release 1.2: each tab carries its own buttons; the Actions tab opens first
check('member area: "Raise an action here" on the Actions tab, no meeting control for a technician', t.includes('Raise an action here') && t.includes('Show finished items') && !t.includes('Start meeting') && !t.includes('Book a meeting'));
t = text(dump('as=' + RACHEL + '&view=area&area=RP').dom);
check('a shared action appears in the linked area, labelled with its home area', t.includes('Contamination monitor checks') && t.includes('shared from Flask'));
r = dump('as=' + RICHARD + '&area=RW');
check('engineer in own area: meeting control offered', text(r.dom).includes('Book a meeting'));
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
  check('fails closed – ' + name + ': message shown, no operational data', d.includes(expect) && !d.includes('Coming up this week') && !d.includes('Replace FH40 probe'));
});
t = text(dump('as=' + RACHEL + '&mode=actions404').dom);
check('missing Actions list: explained, not shown as "no actions"', t.includes('Could not load actions') && !t.includes('You have no open actions') && !t.includes('Nothing late') && t.includes('Action figures unavailable'));
t = text(dump('as=' + ROBERT + '&mode=actions404').dom);
check('missing Actions list: management sees no false totals', t.includes('Action figures could not be loaded') && !t.includes('open actions,') && !t.includes('Nothing needs your attention'));
t = text(dump('as=' + ROBERT + '&mode=actionsPartial').dom);
check('read limit reached: marked as not complete', t.includes('This list is not complete'));
t = text(dump('as=' + RACHEL + '&mode=slow').dom);
check('slow responses: page still completes', t.includes('Coming up this week'));

// Scripted interactions
function drive(query, budget, extra) {
  const d = open(query, ['--dump-dom'].concat(extra || []), budget);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  if (!m) return { ok: false, error: 'no result; script errors: ' + d.errors.join(' | ') };
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}
let res = drive('as=' + RACHEL + '&view=area&area=RW&drive=postNoticeOutside');
check('non-member posts a notice: outside note shown, "important" hidden', res.ok && res.result.outsideShown && res.result.importantHidden, JSON.stringify(res));
check('non-member notice appears labelled as from outside the area', res.ok && res.result.labelled, JSON.stringify(res));
check('the notice is the only write, to the Noticeboard Radwaste folder', res.ok && res.result.writes.length === 1 &&
  res.result.writes[0].list === 'Noticeboard' && res.result.writes[0].folder === 'RW', JSON.stringify(res));
res = drive('as=' + RACHEL + '&view=area&area=FLK&drive=noticeMany');
check('notice on several noticeboards: stored once in the first, shown in both, important for the chosen 2 weeks', res.ok &&
  JSON.stringify(res.result.ticked) === '["FLK"]' && res.result.durations.join('|') === 'Not important|1 week|2 weeks|1 month|3 months' &&
  res.result.stored && res.result.stored.folder === 'FLK' && res.result.stored.shown === 'FLK;INS' && res.result.stored.days === 14 && res.result.writes === 1 &&
  /posted on the Flask and Instruments noticeboards\./.test(res.result.toast), JSON.stringify(res));
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
check('raise from the top bar: no area is chosen for you, one must be chosen; the step line says where you are', res.ok && res.result.areaBefore === '' &&
  /Choose the area this action belongs to/.test(res.result.areaError) && /Step 2 of 4 · Who and where – next: by when/.test(res.result.stepLine) &&
  /“Order replacement smear papers” in Green Stream/.test(res.result.summary), JSON.stringify(res));
check('raise: summary shown, then the new action at once, marked with the progress ring until the flow confirms it', res.ok && /Order replacement smear papers/.test(res.result.summary) &&
  /about \d+ s|any moment|a little longer/.test(res.result.stripText), JSON.stringify(res));
check('raise: once confirmed it keeps its place and the ring goes', res.ok && res.result.listed && res.result.stripGone && res.result.request.status === 'Completed', JSON.stringify(res));
check('raise: once confirmed, the new action opens on click without a reload', res.ok && res.result.reachable && res.result.opens, JSON.stringify(res));
check('raise: the only write is a request in the user\'s own folder', res.ok && res.result.writes.length === 1 && res.result.writes[0].list === 'Requests' &&
  res.result.writes[0].folder === 'u' + RICHARD && res.result.request.type === 'RaiseAction', JSON.stringify(res && res.result && res.result.writes));
res = drive('as=' + RACHEL + '&action=40&drive=updateAndExtend', SLOW);
check('action panel: what, who and when in plain words, with the original deadline', res.ok && /2 days late/.test(res.result.before) && /Was due/.test(res.result.before) &&
  /Owner: Rachel Boulden/.test(res.result.before) && /Deadline moved once \(was/.test(res.result.before), JSON.stringify(res && res.result && res.result.before));
check('update: saved instantly into the action\'s own folder and listed', res.ok && res.result.writes[0].list === 'Updates' && res.result.writes[0].folder === 'FLK/A40', JSON.stringify(res));
check('extend: a short reason is refused; the effect is explained', res.ok && /10 characters/.test(res.result.reasonError) && /The new deadline will be/.test(res.result.effect), JSON.stringify(res));
check('extend: the new deadline shows at once with the ring, the buttons stay, the status line says it is saving; then the green Saved tick and the history shows both changes', res.ok &&
  /about \d+ s|any moment|a little longer/.test(res.result.pending) && /Deadline moved 2 times/.test(res.result.shownAtOnce) && !res.result.buttonsDisabled && /1 change still saving: New deadline/.test(res.result.status) &&
  /Saved/.test(res.result.saved) && /Everything is up to date/.test(res.result.statusAfter) &&
  /Show all deadline changes \(2\)/.test(res.result.after) && res.result.history === 2, JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=reloadWhilePending', SLOW);
check('reload while an extension is being saved: the change and its ring come back, then the mark clears once confirmed', res.ok && /about \d+ s|any moment|a little longer/.test(res.result.noteAfterReload) &&
  res.result.confirmedNoteGone, JSON.stringify(res));
check('reload while a raised action is being saved: it shows again with its ring, and once saved opens on click', res.ok && /about \d+ s|any moment|a little longer/.test(res.result.stripAfterReload) &&
  res.result.reachable && res.result.opened, JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=staleCopy&stamp=0.0.1');
check('an old copy of an app file is reported, with Ctrl+F5', res.ok && /Ctrl\+F5/.test(res.result.banner), JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=staleCopy');
check('matching files: no old-copy banner', res.ok && res.result.banner === '', JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=53&drive=markDone', SLOW);
check('mark as done: explained, then the action is closed', res.ok && /will be closed/.test(res.result.explain) && res.result.status === 'Closed', JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=staleRevision', SLOW);
check('a change based on an old version: shown at once, then refused in plain words with Try again; the screen goes back to the action as it is', res.ok &&
  /Closed/.test(res.result.atOnce) && /Someone else changed this a moment ago/.test(res.result.panel) && JSON.stringify(res.result.buttons) === '["Try again","Dismiss"]' &&
  /I need more time/.test(res.result.panel) && res.result.status === 'In Progress', JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=53&mode=faultOnce&drive=faultTryAgain', SLOW);
check('a system fault: the change goes back, a card says an administrator has been told and that trying again is safe', res.ok &&
  /could not process this change/.test(res.result.cardText) && /an administrator has been told/.test(res.result.cardText) && /can never make the change twice/.test(res.result.cardText) &&
  res.result.reverted, JSON.stringify(res));
check('Try again after a fault resumes the same request (no second one), and it is saved', res.ok && JSON.stringify(res.result.requests) === '["MarkComplete:Completed"]' &&
  res.result.status === 'Closed' && JSON.stringify(res.result.writes) === '["Requests","Requests:update"]', JSON.stringify(res));
res = drive('as=' + RICHARD + '&mode=flowStages&drive=progressRing', SLOW);
check('progress ring: at once it says "Waiting to be picked up" with "usually about N s" (no history yet), on the card and the status line', res.ok &&
  /^Waiting to be picked up · usually about \d+ s$/.test(res.result.atOnce.label) && /^usually about \d+ s$/.test(res.result.atOnce.card) &&
  /1 change still saving: Mark as done: Review Green Stream sample results · Waiting to be picked up · usually about \d+ s/.test(res.result.atOnce.status), JSON.stringify(res));
check('progress ring: it moves on every second in place (same elements, a different arc, no scroll)', res.ok && res.result.moved.sameRing && res.result.moved.sameStatus &&
  res.result.moved.arc !== res.result.atOnce.arc && !res.result.moved.scrolled, JSON.stringify(res && res.result && res.result.moved));
check('progress ring: once the flow has picked it up it says "Being recorded", further along', res.ok && /^Being recorded · usually about \d+ s$/.test(res.result.pickedUp.label) &&
  parseFloat(res.result.pickedUp.arc) > parseFloat(res.result.moved.arc) && /Being recorded/.test(res.result.pickedUp.status), JSON.stringify(res && res.result && res.result.pickedUp));
check('progress ring: saved shows a green circle with a tick that fades; the time it took is remembered for next time', res.ok &&
  res.result.savedShape.circle && res.result.savedShape.tick && res.result.savedShape.text === 'Saved' && res.result.savedShape.label === 'Saved' && res.result.savedShape.fades &&
  res.result.learned && res.result.learned.pickup.length === 1 && res.result.learned.work.length === 1 && res.result.learned.pickup[0] >= 2 && res.result.learned.pickup[0] <= 20,
  JSON.stringify(res && res.result && [res.result.savedShape, res.result.learned]));
res = drive('as=' + RICHARD + '&drive=quickDone', SLOW);
check('home: Mark as done on a to-do card shows Done at once with the ring, then the Saved tick; it stays with Reopen, which puts it back', res.ok &&
  /Done/.test(res.result.sent) && /Reopen/.test(res.result.sent) && /Saved/.test(res.result.saved) && res.result.closed === 'Closed' &&
  /Mark as done/.test(res.result.after) && res.result.status === 'In Progress' && JSON.stringify(res.result.requests) === '["MarkComplete:Completed","ReopenAction:Completed"]', JSON.stringify(res));
// Release 1.3: quick presses, chains of changes to one record, reloads, other people
const KELLY = 102, CRAIG = 105;
res = drive('as=' + RICHARD + '&drive=doubleClick', SLOW);
check('one press, one change: a double click on a card, and a form sent twice, each make one request', res.ok && res.result.fromCard === 1 &&
  JSON.stringify(res.result.requests) === '["MarkComplete:Completed","ExtendDeadline:Completed"]', JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=chainFive', 400000);
check('four quick changes to one action: all shown at once, sent one at a time against the revision the last one left, saved in order, nothing refused',
  res.ok && res.result.atOnce && res.result.maxOpen === 1 && JSON.stringify(res.result.order) === '["ExtendDeadline","ChangeStatus","EditActionDetails","MarkComplete"]' &&
  JSON.stringify(res.result.revisions) === '[2,3,4,5]' && res.result.action.Status === 'Closed' && /\(chain\)/.test(res.result.action.Title) && res.result.action.Revision === 6 &&
  res.result.problems === 0, JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=reloadMidChain', 400000);
check('a reload part-way through a chain loses nothing: the waiting changes go on, in order', res.ok && res.result.sentBefore === 1 && res.result.shownAfter &&
  JSON.stringify(res.result.order) === '["ExtendDeadline","EditActionDetails","MarkComplete"]' && res.result.action.Status === 'Closed' && /after reload/.test(res.result.action.Title) &&
  JSON.stringify(res.result.left) === '[]', JSON.stringify(res));
res = drive('as=' + KELLY + '&action=40&drive=refusedChain', 400000);
check('the first of a chain refused: the rest is held and never sent, one card names it, and Try again sends the lot in order', res.ok && res.result.cardsShown === 1 &&
  /Someone else changed this first \(Rachel Boulden: Touched by Rachel\)/.test(res.result.cardText) && /One more change to it \(Edit/.test(res.result.cardText) && res.result.sentWhileHeld === 1 &&
  JSON.stringify(res.result.requests) === '["ExtendDeadline:Rejected","ExtendDeadline:Completed","EditActionDetails:Completed"]' && /\(held\)/.test(res.result.action.Title), JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=otherNoClash', 400000);
check('someone else changed another field first: the refused change is sent again by itself, on top of theirs, and both stand', res.ok &&
  /Someone else changed the title meanwhile; your change \(New deadline/.test(res.result.toast) && JSON.stringify(res.result.requests) === '["ExtendDeadline:Rejected","ExtendDeadline:Completed"]' &&
  res.result.problems === 0 && res.result.action.Title === 'Replace FH40 probe (Kelly)' && res.result.action.DueDay === res.result.dueDay, JSON.stringify(res));
res = drive('as=' + RACHEL + '&action=40&drive=othersAppear', 400000);
check('another person\'s change appears without a reload, with "updated by someone else", under this person\'s own pending change; a hidden tab reads nothing', res.ok &&
  res.result.updatedLine && res.result.stillMine && res.result.reads >= 1 && res.result.whileHidden === 0, JSON.stringify(res));

// Finishing actions (plan K9): status, reassign, close and reopen, edit, close-out, My actions
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
check('there is no text size control in the bar', s1366.ok && s1366.result.hasControl === false, JSON.stringify(s1366));

res = drive('as=' + JOE + '&drive=knownAs', SLOW);
check('known as: an administrator sets their own name; it shows in the bar, and their access stays locked', res.ok && res.result.boxEnabled && res.result.roleLocked === true &&
  res.result.stored === 'Joe' && res.result.who.indexOf('Joe · Team Leader') === 0, JSON.stringify(res));

// A notice shown in another area: an engineer there turns it into an action; a technician is not offered it (1.9.0.0)
res = drive('as=' + KELLY + '&mode=shownIn&notice=2&drive=noticeConvert', SLOW);
check('turn a notice into an action: the notice says where it is shown; the title is filled in; one action carries the notice', res.ok && res.result.button &&
  /Flask, Instruments noticeboards/.test(res.result.header) && res.result.prefilled === 'Spare probe stock levels' && res.result.areas.indexOf('INS') >= 0 &&
  JSON.stringify(res.result.source) === '["Noticeboard",2]', JSON.stringify(res));
res = drive('as=' + RACHEL + '&mode=shownIn&notice=2&drive=noticeConvert', SLOW);
check('turn a notice into an action: a technician member is not offered it', res.ok && res.result.button === false, JSON.stringify(res));

// Co-owners and the named close-out check (solution 1.9.0.0)
res = drive('as=' + RICHARD + '&drive=raiseShared', SLOW);
check('raise: co-owners exclude the owner; the checker appears with the close-out box, defaults to the raiser and excludes the owner', res.ok &&
  res.result.coOffered.indexOf(112) < 0 && res.result.hiddenBefore && res.result.checkerDefault === String(RICHARD) && res.result.checkerOffered.indexOf(112) < 0, JSON.stringify(res));
check('raise: the co-owner and checker are in the summary, the request and the stored action', res.ok && /co-owners Kelly/.test(res.result.summary) && /check by Kelly/.test(res.result.summary) &&
  res.result.payload.co.join() === '102' && res.result.payload.checker === 102 && res.result.stored.co === '["102"]' && res.result.stored.checker === 102, JSON.stringify(res));
const ADAM = 124;
res = drive('as=' + ADAM + '&mode=shared&drive=shared', SLOW);
check('co-owner: the shared action and the close-out check waiting for them are in their to-dos', res.ok && res.result.shared && res.result.check, JSON.stringify(res));
check('co-owner: the action names the co-owners; they can add an update but not move the deadline or mark it done', res.ok && /Co-owners: Adam/.test(res.result.who) &&
  res.result.buttons.indexOf('Add an update') >= 0 && res.result.buttons.indexOf('I need more time') < 0 && res.result.buttons.indexOf('Mark as done') < 0, JSON.stringify(res));
res = drive('as=' + ADAM + '&mode=shared&action=53&drive=sharedCheck', SLOW);
check('named checker: the action says who checks it, and they are offered "Confirm close-out"', res.ok && /Checked by: Adam/.test(res.result.who) &&
  res.result.buttons.indexOf('Confirm close-out') >= 0, JSON.stringify(res));
res = drive('as=' + RACHEL + '&mode=shared&action=53&drive=sharedCheck', SLOW);
check('named checker: the owner is not offered "Confirm close-out"', res.ok && res.result.buttons.indexOf('Confirm close-out') < 0, JSON.stringify(res));

// No page scrolls, for a Team Leader who sees every page, at the WebView size and on a laptop
[['1920,960', '1920 × 960'], ['1366,768', '1366 × 768']].forEach(([size, label]) => {
  const d = open('as=' + JOE + '&drive=pagesFit', ['--window-size=' + size, '--dump-dom'], 40000);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  const res = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : { ok: false };
  check('no page scrolls at ' + label + ', and every dropdown has the form style', res.ok && res.result.anyScroll.length === 0 && res.result.plainSelects === 0 &&
    Object.keys(res.result.pages).length >= 8, JSON.stringify(res));
});

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
check('limited mode: the status line explains that changes are paused and nothing is lost', res.ok && /can't be processed at the moment/.test(res.result.banner) && /nothing you have sent is lost/.test(res.result.banner), JSON.stringify(res));
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


// Release 3: notices, comments and flags; the register; feedback; settings; the management overview
res = drive('as=' + RACHEL + '&area=FLK&notice=1&drive=noticeRead', SLOW);
check('notice: read in full with its comments; hidden comments are not shown', res.ok && res.result.body && res.result.kellysComment && !res.result.hiddenShown && res.result.flagged, JSON.stringify(res));
check('notice: a technician who did not post it gets no edit, pin or archive, and cannot withdraw another\'s flag', res.ok && res.result.buttons.length === 0 && !res.result.withdraw, JSON.stringify(res));
check('notice: a comment is saved at once, in the area\'s Updates folder', res.ok && res.result.saved &&
  JSON.stringify(res.result.update) === '[{"folder":"FLK","type":"Comment","parent":"Notice:1","flag":false}]', JSON.stringify(res));
check('notice: the author may edit and archive their own notice in another area, but not comment there', res.ok &&
  JSON.stringify(res.result.own.buttons) === '["Edit this notice","Archive it"]' && !res.result.own.canComment && /Members of DSL, and the Team Leaders and Group Head, can comment/.test(res.result.own.note), JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&notice=2&drive=noticeFits', 15000, ['--window-size=1920,1047']);
check('notice dialog at 1920 × 960: the notice and its comments side by side, no scrollbar', res.ok && res.result.columns === 2 && !res.result.scrolls, JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&notice=2&drive=noticeModerate', SLOW);
check('notice: pinning is shown as being recorded, then confirmed', res.ok && /Pin “Spare probe stock levels”/.test(res.result.pending) && res.result.pinned, JSON.stringify(res));
check('notice: an edit is checked against its revision and saved', res.ok && res.result.title === 'Spare probes: two left in stores' && res.result.revision === 3, JSON.stringify(res));
check('notice: flags are withdrawn and raised again, with a discussion history', res.ok && /Flag withdrawn by Kelly Bates/.test(res.result.history), JSON.stringify(res));
check('notice: a moderator hides a comment', res.ok && res.result.hidden === true, JSON.stringify(res));
check('notice: each change is a request to the Records flow, confirmed by its History event', res.ok &&
  JSON.stringify(res.result.requests) === '["PinNotice:Completed:Notice","EditNotice:Completed:Notice","HideComment:Completed:Comment"]' &&
  JSON.stringify(res.result.events) === '["Notice Pinned","Notice Edited","Comment Hidden"]', JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&drive=registerFlow', SLOW);
check('register: an empty entry is refused before sending', res.ok && /Give the entry a title/.test(res.result.emptyError), JSON.stringify(res));
check('register: a raised entry appears in the area, in its folder, raised by the sender', res.ok && res.result.created &&
  res.result.created.folder === 'FLK' && res.result.created.type === 'Degradation' && res.result.created.raisedBy === KELLY, JSON.stringify(res));
check('register: an entry lists its linked actions', res.ok && res.result.linked, JSON.stringify(res));
check('register: resolving needs an outcome; with one it is saved', res.ok && /Record the outcome/.test(res.result.outcomeError) && res.result.status === 'Resolved' &&
  /recalibrated/.test(res.result.outcome) && !res.result.resolvedButtons, JSON.stringify(res));
check('register: an existing action is linked (only unlinked actions of the area are offered)', res.ok && res.result.link === 2 &&
  !res.result.choices.some((c) => /Replace FH40 probe/.test(c)) && res.result.choices.every((c) => !/Instrument|Green Stream/.test(c)), JSON.stringify(res));
check('register: every change was a request from the sender\'s own folder', res.ok && res.result.writes.every((w) => w === 'Requests/u' + KELLY), JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&entry=2&drive=raiseLinked', SLOW);
check('register: "Raise a linked action" raises one action carrying the entry, in the entry\'s area', res.ok && /REG-00002/.test(res.result.heading) &&
  JSON.stringify(res.result.areas) === '["FLK"]' && /REG-00002/.test(res.result.summary) && JSON.stringify(res.result.source) === '["Register",2]' && res.result.payloadEntry === 2, JSON.stringify(res));
res = drive('as=' + RACHEL + '&drive=feedback');
check('feedback: errors before sending, then "Thanks" only once saved', res.ok && /Tell us a little more/.test(res.result.emptyError) && /Thanks – your feedback has been sent/.test(res.result.toast), JSON.stringify(res));
check('feedback: saved at the Feedback list root, by the sender; they can read only their own', res.ok && res.result.row && res.result.row.folder === 'Feedback' &&
  res.result.row.author === RACHEL && res.result.row.status === 'New' && res.result.visible === 2 && JSON.stringify(res.result.writes) === '["Feedback/"]', JSON.stringify(res));
[['1920,990', 'fitted home page'], ['1366,768', 'laptop']].forEach(([size, label]) => {
  const d = open('as=' + RACHEL + '&drive=bubblePlace', ['--window-size=' + size, '--dump-dom']);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  const x = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : { ok: false };
  check('feedback button (' + label + '): in view, covering no other control, here and on My actions', x.ok && x.result.home.inView && !x.result.home.overlaps.length && !x.result.mine.length, JSON.stringify(x));
});
res = drive('as=' + JOE + '&drive=feedbackReview', SLOW);
check('feedback review: administrators see the list, respond and set the status', res.ok && res.result.listed.length === 2 && /From Rachel Boulden/.test(res.result.from) &&
  res.result.status === 'Answered' && /fixed in the next version/.test(res.result.response) && res.result.by === JOE && res.result.on, JSON.stringify(res));
check('feedback review: filters narrow the list', res.ok && res.result.doneFilter, JSON.stringify(res));
res = drive('as=' + JOE + '&drive=settings', SLOW);
check('settings: the seven values are shown', res.ok && JSON.stringify(res.result.shown) === '["First reminder","Due soon","Late reminders","Furthest deadline","Queue monitor hours","Outlook invitations","PDF minutes"]', JSON.stringify(res));
check('settings: out-of-range values are refused; a good one is sent and recorded', res.ok && /from 1 to 30/.test(res.result.rangeError) &&
  res.result.request.type === 'UpdateSetting' && res.result.request.payload.name === 'DueSoonDays' && res.result.request.payload.value === '10' && res.result.value === '10', JSON.stringify(res));
res = drive('as=' + ROBERT + '&drive=dashboard', SLOW);
check('management: group figures, and each opens exactly the actions it counts', res.ok && res.result.figs.Open === 26 && res.result.lateRows === res.result.figs.Late &&
  /All areas – late/.test(res.result.lateTitle) && res.result.completedRows === res.result.figs.Completed && res.result.figs.Completed === 1, JSON.stringify(res));
check('management: the area table drills down by the same rule, and the page writes nothing', res.ok && res.result.areaRows === 10 && res.result.rwDrill === res.result.rwLate &&
  res.result.posts === 0, JSON.stringify(res));
check('staff see no overview of all areas page', !/<button[^>]*>Overview of all areas<\/button>/.test(dump('as=' + RACHEL).dom) && /<button[^>]*>Overview of all areas<\/button>/.test(dump('as=' + ROBERT).dom));
res = drive('as=' + RACHEL + '&view=area&area=FLK&drive=areaRegister');
check('area page: Notices & issues lists the noticeboard (pinned first) and the open register entries, with a filter', res.ok &&
  res.result.notices[0] === 'Calibration rig out of service' && JSON.stringify(res.result.entries) === '["REG-00002 Shared probe sign-out sheet","REG-00001 Calibration rig drift"]' &&
  res.result.all === 3 && res.result.raise, JSON.stringify(res));

// Release 4: meetings
res = drive('as=' + KELLY + '&area=FLK&drive=bookMeeting', SLOW);
check('book: the area\'s members are ticked and only people who run meetings can chair', res.ok && res.result.ticked >= 13 && res.result.chairs.indexOf('Rachel Boulden') < 0 &&
  res.result.chairs.indexOf('Kelly Bates') >= 0, JSON.stringify(res));
check('book: a missing date and an end before the start are refused before sending', res.ok && /Choose a date/.test(res.result.dateError) && /end after it starts/.test(res.result.endError), JSON.stringify(res));
check('book: "this and the next 2 months" sends three bookings from your own folder, and they appear', res.ok && res.result.booked === 3 &&
  JSON.stringify(res.result.types) === '["ScheduleMeeting","ScheduleMeeting","ScheduleMeeting"]' && res.result.writes.every((w) => w === 'Requests/u' + KELLY), JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=meetingChangeStart', SLOW);
check('meeting: the agenda preview is shown before it starts', res.ok && res.result.preview, JSON.stringify(res));
check('meeting: an item added by hand goes into the meeting\'s record folder', res.ok && JSON.stringify(res.result.added) === '["MeetingItems/FLK/MTG-2/Record"]', JSON.stringify(res));
check('meeting: a change is recorded, and starting fixes the agenda', res.ok && res.result.start === '11:00' && res.result.status === 'In Progress' && res.result.agendaRows > 0 &&
  res.result.fixed && res.result.noStart, JSON.stringify(res));
check('start is instant: the live screen comes before the flow has fixed the agenda, and an outcome recorded then stays with its item', res.ok && res.result.instant && res.result.kept, JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=meetingFastRun', SLOW);
check('a meeting gone through fast while it catches up: never blanks, never jumps to another item, keeps every outcome, then stays still', res.ok &&
  res.result.blanks === 0 && res.result.titles === res.result.clicked && res.result.stayed && res.result.withOutcome > 3 && res.result.outcomes === res.result.withOutcome &&
  res.result.pressed === res.result.withOutcome && res.result.idleRepaints === 0, JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=notesKept', SLOW);
check('notes typed on an agenda item are saved when another item is clicked, and are there when the person comes back', res.ok &&
  /notes typed, not saved/.test(res.result.saved) && /notes typed, not saved/.test(res.result.shownAgain), JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&drive=meetingBeforeBooked', SLOW);
check('a meeting booked a moment ago can be started at once; what is recorded is sent to its record folder when the booking is saved', res.ok && res.result.unnumbered &&
  !res.result.change && res.result.live && res.result.raiseNote && res.result.kept && res.result.status === 'In Progress' &&
  res.result.attFolder === 'MeetingItems/FLK/MTG-' + res.result.realId + '/Record' && res.result.attKey.indexOf(res.result.realId + '|P|') === 0, JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&drive=meetingBookedFinalise', 400000);
check('booked, started, recorded and finalised before the booking is saved: finalising is not held back, nothing recorded disappears, and every outcome is frozen',
  res.ok && !res.result.booked && res.result.enabled && res.result.draft && res.result.given >= 3 && res.result.low === res.result.given &&
  res.result.frozenDiscussed === res.result.given && JSON.stringify(res.result.newItem) === '["Discussed"]', JSON.stringify(res));
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=meetingCancel', SLOW);
check('meeting: cancelling needs a reason, then shows as cancelled', res.ok && /at least 10 characters/.test(res.result.reasonError) && /Most of the area is on the outage/.test(res.result.text), JSON.stringify(res));
res = drive('as=' + RACHEL + '&area=FLK&meeting=2&drive=meetingAsTechnician', SLOW);
check('meeting: someone who does not run meetings can read it and add it to their calendar, nothing else', res.ok && JSON.stringify(res.result.buttons) === '["Add to my calendar"]' &&
  !res.result.canAdd && !res.result.bookButton && /BEGIN:VCALENDAR/.test(res.result.ics) && /SUMMARY:Flask monthly meeting/.test(res.result.ics), JSON.stringify(res));

// Release 5: running a meeting, finalising, the minutes and amendments
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=runMeeting', 400000);
check('live meeting: finalising is held back while items for discussion have no outcome', res.ok && res.result.early.disabled && /still need an outcome: Spare probe stock levels/.test(res.result.early.missing), JSON.stringify(res));
check('live meeting: an action raised from the meeting is in its area and carries the meeting', res.ok && res.result.heading === 'Raise an action from the meeting' &&
  JSON.stringify(res.result.areas) === '["FLK"]' && res.result.requestMeeting === 2 && JSON.stringify(res.result.source) === '["Meeting",2]', JSON.stringify(res));
check('live meeting: attendance, outcomes and decisions go only to the meeting\'s record folder', res.ok && res.result.writesInRecord && res.result.items >= 5, JSON.stringify(res));
check('finalised: the minutes show attendance, outcomes, the decision and the action raised, with the PDF', res.ok && res.result.frozenNotes === 1 &&
  /Rachel Boulden\s*Apologies/.test(res.result.minutes) && /Probe checks stay monthly/.test(res.result.minutes) && /Actions raised at this meeting\s*ActionOwnerDue\s*Order spare probes/.test(res.result.minutes) &&
  res.result.pdf === '/sites/ESGCompetencyHub/MeetingMinutes/FLK/MTG-2-v1.pdf', JSON.stringify(res));
check('finalise is instant: the minutes as recorded show at once, before the flow has frozen them', res.ok && !res.result.draft.flowDone &&
  /being saved/.test(res.result.draft.minutes) && /Rachel Boulden\s*Apologies/.test(res.result.draft.minutes) && /Order spare probes/.test(res.result.draft.minutes), JSON.stringify(res && res.result && res.result.draft));
res = drive('as=' + KELLY + '&area=FLK&meeting=2&drive=meetingKinds', SLOW);
check('live meeting: the agenda is grouped by kind and each item is labelled; an action offers Close this action and Raise a further action, an issue Turn into an action', res.ok &&
  res.result.groups.join('|') === 'Actions|Issues|Notices|Other business' && res.result.first.kind === 'Action' &&
  ['Open this action', 'Close this action', 'Raise a further action'].every((b) => res.result.first.buttons.includes(b)) &&
  res.result.second.kind === 'Issue' && res.result.second.buttons.includes('Turn into an action') && !res.result.second.buttons.includes('Close this action'), JSON.stringify(res));
check('live meeting: Close this action records Closed with the notes and closes the action, carrying the meeting', res.ok && res.result.closeMeeting === 2 &&
  res.result.closePayload.outcome === 'Completed' && /checked against the source/.test(res.result.closePayload.note), JSON.stringify(res));
check('live meeting: an item added during the meeting opens straight away, as Other business', res.ok && res.result.newKind === 'Other business' &&
  res.result.newButtons.includes('Raise an action') && !res.result.newButtons.includes('Close this action'), JSON.stringify(res));
res = drive('as=' + RACHEL + '&area=FLK&meeting=1&drive=minutesAsTechnician', SLOW);
check('minutes: everyone can read them, open or download the PDF (and print from it); only Team Leaders and the Group Head amend', res.ok && JSON.stringify(res.result.buttons) === '["Open the PDF","Download PDF"]' &&
  /Carry forward\s*Waiting for the stores count/.test(res.result.minutes), JSON.stringify(res));
res = drive('as=' + RACHEL + '&area=FLK&notice=2&drive=noticeHistory', SLOW);
check('notice: its discussion history lists the meeting that took it up, and the outcome', res.ok && /Flask meeting, \d+ \w+ 2026: Deferred – Waiting for the stores count/.test(res.result.history), JSON.stringify(res));
res = drive('as=' + ROBERT + '&meeting=1&drive=amendMinutes', 300000);
check('amend: what and why are needed; the amendment is added beside the original, and a second PDF version follows', res.ok && /at least 10 characters/.test(res.result.errors[0]) &&
  /Amendment 1 by Robert Starbuck: Nick Pearce attended/.test(res.result.minutes) && /Kelly Bates\s*Present/.test(res.result.minutes) && /MTG-1-v2\.pdf$/.test(res.result.pdf), JSON.stringify(res));

// Release 6: test marking and removing the test records
res = drive('as=' + RACHEL + '&drive=testMarkedNotice', SLOW);
check('before go-live, a notice posted straight from the Hub is marked as a test record', res.ok && res.result.marked, JSON.stringify(res));
res = drive('as=' + JOE + '&view=admin&drive=removeTestData', SLOW);
check('remove test data: marked records are listed and always included; older ones only if ticked; the confirmation must match',
  res.ok && res.result.marked === 2 && /exactly, in capitals/.test(res.result.wrong) && res.result.payload.include.Action.indexOf(res.result.ticked) >= 0, JSON.stringify(res));
check('remove test data: the records go, and test marking is switched off', res.ok && res.result.gone && res.result.testing === 'No' && /3 test records removed/.test(res.result.result), JSON.stringify(res));
res = drive('as=' + JOE + '&drive=queryAudit', 300000);
check('query audit: every view reads the large lists only in ways SharePoint allows past 5,000 items', res.ok && res.result.areas === 10 && res.result.views.length === 3 &&
  !res.result.hits.length, JSON.stringify(res));
// XSS sweep: attack strings in every typed value; nothing runs, nothing is injected, they show as text
res = drive('as=' + KELLY + '&mode=xss&drive=xssSweep', SLOW);
check('XSS sweep: home, area panel, an action, the area page and a meeting show attack strings as text only', res.ok && !res.result.xss && !res.result.injectedImgs &&
  !res.result.injectedScripts && !res.result.injectedBold && res.result.shownAsText, JSON.stringify(res));
['notice=1', 'entry=1', 'meeting=1'].forEach((link) => {
  res = drive('as=' + KELLY + '&area=FLK&mode=xss&' + link + '&drive=xssCheck', SLOW);
  check('XSS sweep: ' + link.split('=')[0] + ' panel shows attack strings as text only', res.ok && !res.result.xss && !res.result.injectedImgs && !res.result.injectedScripts &&
    !res.result.injectedBold && res.result.shownAsText, JSON.stringify(res));
});
// Accessibility (Q3): names for every control, labelled modal dialogs, unique ids; 200 % zoom on a 1366 px screen
res = drive('as=' + KELLY + '&drive=a11yAudit', SLOW);
check('accessibility: every control in ten views and forms has an accessible name, dialogs are modal and labelled, ids are unique',
  res.ok && res.result.views.length >= 10 && !res.result.problems.length, JSON.stringify(res));
[['engineer', KELLY], ['team leader', JOE]].forEach(([who, id]) => {
  const d = open('as=' + id + '&drive=narrowFit', ['--window-size=683,800', '--dump-dom']);
  const m = /<pre id="drive-result">([\s\S]*?)<\/pre>/.exec(d.dom);
  const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : { ok: false, error: d.errors.join(' | ') };
  check('200 % zoom (683 px wide, ' + who + '): home, area panel and a dialog never scroll sideways', r.ok && !r.result.homeScrollsSideways &&
    !r.result.areaScrollsSideways && !r.result.dialogScrollsSideways, JSON.stringify(r));
});
console.log(failures ? failures + ' browser check(s) failed' : 'All browser checks passed');
process.exit(failures ? 1 : 0);
