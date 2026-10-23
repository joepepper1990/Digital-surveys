// Scripted interactions for the browser tests. A scenario runs when the page is opened with
// ?drive=<name>; its result is written as JSON into <pre id="drive-result"> for the test runner.
window.MockDrivers = (function () {
  'use strict';
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function until(fn, ms) {
    var end = Date.now() + (ms || 4000);
    while (Date.now() < end) { var v = fn(); if (v) return v; await wait(50); }
    throw new Error('Timed out waiting');
  }
  function q(sel) { return document.querySelector('[data-ch-root] ' + sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll('[data-ch-root] ' + sel)); }
  function byText(sel, text) { return all(sel).filter(function (n) { return n.textContent.trim() === text; })[0]; }
  function text() { return document.querySelector('[data-ch-root]').textContent; }
  function type(el, value) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }

  function px(sel) { var n = q(sel); return n ? parseFloat(getComputedStyle(n).fontSize) : 0; }

  var scenarios = {
    // Sizes follow the app's width and the reader's text size (plan K6.9).
    sizes: async function () {
      await until(function () { return q('.tile b'); });
      await wait(200);
      var before = { tile: px('.tile b'), h1: px('h1'), scale: document.querySelector('[data-ch-root]').style.getPropertyValue('--scale') };
      var select = q('.textsize select');
      select.value = 'Larger';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(100);
      var larger = px('.tile b');
      var saved = window.localStorage.getItem('esg-competency-hub-text-size');
      select.value = 'Normal';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        width: document.querySelector('[data-ch-root]').clientWidth, tile: before.tile, h1: before.h1, scale: before.scale,
        larger: larger, saved: saved, scrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1
      };
    },
    // A technician posts on another area's noticeboard (K4.1): allowed, labelled, and the only write.
    postNoticeOutside: async function () {
      await until(function () { return q('.viewonly-bar'); });
      byText('.subtabs button', 'Notices & issues').click();
      byText('button', 'Post a notice').click();
      var title = await until(function () { return q('#ch-n-title'); });
      var outsideShown = q('.explain').style.display !== 'none';
      var importantHidden = q('#ch-n-imp').parentNode.style.display === 'none';
      type(title, 'Could someone check the drum labels?');
      type(q('#ch-n-body'), 'Spotted two drums with faded labels near bay 3.');
      q('#ch-n-cat').value = 'Request';
      q('form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Could someone check the drum labels?') >= 0 && !q('.scrim'); });
      return {
        outsideShown: outsideShown, importantHidden: importantHidden,
        labelled: text().indexOf('From Rachel Boulden, outside Radwaste') >= 0,
        writes: MockSharePoint.writes.slice()
      };
    },
    // Empty form: errors shown, focus moved, nothing sent.
    noticeValidation: async function () {
      await until(function () { return byText('button', 'Post a notice'); });
      byText('button', 'Post a notice').click();
      await until(function () { return q('#ch-n-title'); });
      q('form').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(100);
      return { titleError: q('#ch-n-title-err').textContent, bodyError: q('#ch-n-body-err').textContent,
        focused: document.activeElement && document.activeElement.id, writes: MockSharePoint.writes.length };
    },
    // Arrow keys move between the area tabs.
    keyboardTabs: async function () {
      var first = await until(function () { return q('.subtabs button'); });
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(50);
      var selected = all('.subtabs button').filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0];
      return { selected: selected && selected.textContent, focused: document.activeElement && document.activeElement.textContent };
    },
    // Raise an action through the three steps; it is recorded by the simulated flow and appears (plan K7).
    raiseAction: async function () {
      (await until(function () { return byText('button', 'Raise an action'); })).click();
      await until(function () { return q('#ch-r-title'); });
      var form = q('#ch-r form');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var emptyError = q('#ch-r-title-err').textContent;
      type(q('#ch-r-title'), 'Order replacement smear papers');
      type(q('#ch-r-description'), 'Stock is down to one box.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      var owners = all('#ch-r-ownerId option').map(function (o) { return o.textContent; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var due = await until(function () { return q('#ch-r-dueIso'); });
      due.value = '2020-01-01';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var pastError = q('#ch-r-dueIso-err').textContent;
      due.value = q('#ch-r-dueIso').max.slice(0, 4) - 1 + q('#ch-r-dueIso').min.slice(4);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      var summary = q('#ch-r .facts').textContent;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-r'); });
      var strip = await until(function () { return q('.request-strip'); });
      var stripText = strip.textContent;
      await until(function () { return text().indexOf('raised: Order replacement smear papers') >= 0; }, 120000);
      var req = MockSharePoint.data.Requests[0];
      var item = all('.items .item-open').filter(function (b) { return b.textContent.indexOf('Order replacement smear papers') >= 0; })[0];
      item.scrollIntoView({ block: 'center' });
      await wait(50);
      var box = item.getBoundingClientRect();
      var onTop = document.elementFromPoint(box.left + 5, box.top + 5);
      item.click();
      var opens = !!(await until(function () { return q('#ch-a .facts'); })) && q('#ch-a').textContent.indexOf('Stock is down to one box.') >= 0;
      return { reachable: !!onTop && item.contains(onTop), opens: opens, emptyError: emptyError, pastError: pastError, owners: owners, summary: summary, stripText: stripText,
        stripGone: !q('.request-strip'), listed: !!byText('.items .t', 'Order replacement smear papers'),
        request: { folder: req.FileDirRef.split('/').pop(), type: req.RequestType, status: req.Status },
        writes: MockSharePoint.writes.slice() };
    },
    // Open an action by its link, add an update, then ask for more time and see the new deadline confirmed.
    updateAndExtend: async function () {
      await until(function () { return q('#ch-a .facts'); });
      var before = q('#ch-a').textContent;
      byText('#ch-a button', 'Add an update').click();
      type(await until(function () { return q('#ch-u-body'); }), 'Supplier confirmed delivery on Friday.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a').textContent.indexOf('Supplier confirmed delivery on Friday.') >= 0; });
      byText('#ch-a button', 'I need more time').click();
      var date = await until(function () { return q('#ch-x-newDueIso'); });
      type(q('#ch-x-reason'), 'short');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var reasonError = q('#ch-x-reason-err').textContent;
      date.value = MockRules.dates.addDays(MockRules.dates.localDate(new Date()), 7);
      date.dispatchEvent(new Event('input'));
      var effect = q('#ch-a .explain').textContent;
      type(q('#ch-x-reason'), 'Waiting for the replacement probe to arrive.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a .pending'); });
      var pending = q('#ch-a .pending').textContent;
      var buttonsDisabled = all('#ch-a .actions-row .btn').every(function (b) { return b.disabled; });
      await until(function () { return text().indexOf('Deadline moved to') >= 0; }, 120000);
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('Show all deadline changes (2)') >= 0; });
      return { before: before, reasonError: reasonError, effect: effect, pending: pending, buttonsDisabled: buttonsDisabled,
        after: q('#ch-a').textContent, writes: MockSharePoint.writes.slice(),
        history: MockSharePoint.data.History.filter(function (h) { return h.RecordId === 40; }).length };
    },
    // Change status to "waiting on something": the blocker is required, then shown once recorded (plan K9).
    statusBlocker: async function () {
      await until(function () { return q('#ch-a .facts'); });
      q('#ch-a .more summary').click();
      byText('#ch-a .more button', 'Change status').click();
      var status = await until(function () { return q('#ch-s-status'); });
      status.value = 'Awaiting Input';
      status.dispatchEvent(new Event('change'));
      type(q('#ch-s-blocker'), 'parts');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var blockerError = q('#ch-s-blocker-err').textContent;
      type(q('#ch-s-blocker'), 'Waiting for the replacement probe from stores.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a .pending'); });
      await until(function () { return text().indexOf('Status changed to waiting on something.') >= 0; }, 120000);
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('Waiting on') >= 0; });
      return { blockerError: blockerError, panel: q('#ch-a').textContent,
        action: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0] };
    },
    // Reassign: the current owner is not offered; once recorded the action belongs to the new owner.
    reassign: async function () {
      await until(function () { return q('#ch-a .facts'); });
      q('#ch-a .more summary').click();
      byText('#ch-a .more button', 'Reassign').click();
      var owner = await until(function () { return q('#ch-g-ownerId'); });
      var options = all('#ch-g-ownerId option').map(function (o) { return o.textContent; });
      owner.value = String(126);
      type(q('#ch-g-reason'), 'Joe has the replacement probe.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Reassigned to Joe Pepper.') >= 0; }, 120000);
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('Joe Pepper is doing it') >= 0; });
      return { options: options, owner: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0].AssignedToId };
    },
    // Close with an outcome (a note is needed), then reopen the closed action from the same panel.
    closeAndReopen: async function () {
      await until(function () { return q('#ch-a .facts'); });
      q('#ch-a .more summary').click();
      byText('#ch-a .more button', 'Close with an outcome').click();
      var outcome = await until(function () { return q('#ch-l-outcome'); });
      outcome.value = 'Superseded';
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var noteError = q('#ch-l-note-err').textContent;
      type(q('#ch-l-note'), 'Replaced by the new probe action.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Action closed.') >= 0; }, 120000);
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('Closed on') >= 0; });
      var closedPanel = q('#ch-a').textContent;
      var listedAfterClose = text().indexOf('Replace FH40 probe') >= 0 && !!q('.items') && all('.items .t').some(function (t) { return t.textContent === 'Replace FH40 probe'; });
      byText('#ch-a button', 'Reopen').click();
      type(await until(function () { return q('#ch-o-reason'); }), 'The new probe failed as well.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Action reopened.') >= 0; }, 120000);
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('I need more time') >= 0; });
      return { noteError: noteError, closedPanel: closedPanel, listedAfterClose: listedAfterClose,
        action: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0] };
    },
    // Edit details: only what changed is sent.
    editDetails: async function () {
      await until(function () { return q('#ch-a .facts'); });
      q('#ch-a .more summary').click();
      byText('#ch-a .more button', 'Edit details').click();
      var title = await until(function () { return q('#ch-e-title'); });
      type(title, 'Replace FH40 probe (bay 3)');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Details saved.') >= 0; }, 120000);
      var req = MockSharePoint.data.Requests.filter(function (r) { return r.RequestType === 'EditActionDetails'; })[0];
      return { payload: JSON.parse(req.Payload), title: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0].Title };
    },
    // The raiser confirms the close-out of an action marked as done.
    closeOut: async function () {
      await until(function () { return q('#ch-a .facts'); });
      byText('#ch-a button', 'Confirm close-out').click();
      await until(function () { return q('#ch-l-note'); });
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Action closed.') >= 0; }, 120000);
      var a = MockSharePoint.data.Actions.filter(function (x) { return x.Id === 61; })[0];
      return { status: a.Status, outcome: a.CloseOutcome };
    },
    // My actions: the tabs, the area filter and the finished items read on demand.
    myActions: async function () {
      await until(function () { return q('#ch-m-area'); });
      var mine = all('.items .t').map(function (t) { return t.textContent; });
      var tabs = all('.subtabs button').map(function (b) { return b.textContent; });
      var areaSelect = q('#ch-m-area');
      areaSelect.value = 'RP';
      areaSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);
      var filtered = all('.items .t').map(function (t) { return t.textContent; });
      q('#ch-m-area').value = '';
      q('#ch-m-area').dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);
      byText('button', 'Show finished items').click();
      await until(function () { return text().indexOf('Old survey sheets archived') >= 0; });
      var finished = all('.finished .t').map(function (t) { return t.textContent; });
      all('.finished .item-open')[0].click();
      await until(function () { return q('#ch-a .facts'); });
      var panel = q('#ch-a').textContent;
      return { mine: mine, tabs: tabs, filtered: filtered, finished: finished, panel: panel, buttons: all('#ch-a .actions-row .btn').map(function (b) { return b.textContent; }) };
    },
    // Reloading while changes are being recorded (plan K7.9): the notes come back, the changes confirm,
    // and the new action opens on click without another reload.
    reloadWhilePending: async function () {
      await until(function () { return q('#ch-a .facts'); });
      byText('#ch-a button', 'I need more time').click();
      var date = await until(function () { return q('#ch-x-newDueIso'); });
      date.value = MockRules.dates.addDays(MockRules.dates.localDate(new Date()), 7);
      date.dispatchEvent(new Event('input'));
      type(q('#ch-x-reason'), 'Waiting for the replacement probe to arrive.');
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a .pending'); });
      MockSharePoint.reload();
      var item = await until(function () { return all('.items .item-open').filter(function (b) { return b.textContent.indexOf('Replace FH40 probe') >= 0; })[0]; });
      var noteAfterReload = item.textContent;
      await until(function () { return text().indexOf('Deadline moved to') >= 0; }, 120000);
      var confirmedNoteGone = all('.items .item-open').filter(function (b) { return b.textContent.indexOf('Replace FH40 probe') >= 0; })[0].textContent.indexOf('being recorded') < 0;
      // Raise an action, reload before the flow has run, then open the new action from the list.
      byText('button', 'Raise an action').click();
      type(await until(function () { return q('#ch-r-title'); }), 'Check spare filter stock');
      type(q('#ch-r-description'), 'Count the filters in store B.');
      var form = q('#ch-r form');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var due = await until(function () { return q('#ch-r-dueIso'); });
      due.value = MockRules.dates.addDays(MockRules.dates.localDate(new Date()), 14);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-r'); });
      MockSharePoint.reload();
      var strip = await until(function () { return q('.request-strip'); });
      var stripAfterReload = strip.textContent;
      await until(function () { return text().indexOf('raised: Check spare filter stock') >= 0; }, 120000);
      all('.dialog-x').forEach(function (x) { x.click(); });
      await until(function () { return !q('#ch-a'); });
      var listed = all('.items .item-open').filter(function (b) { return b.textContent.indexOf('Check spare filter stock') >= 0; })[0];
      listed.scrollIntoView({ block: 'center' });
      await wait(50);
      var x = listed.getBoundingClientRect();
      var onTop = document.elementFromPoint(x.left + 5, x.top + 5);
      listed.click();
      await until(function () { return q('#ch-a .facts'); });
      return { noteAfterReload: noteAfterReload, confirmedNoteGone: confirmedNoteGone, stripAfterReload: stripAfterReload,
        reachable: !!onTop && listed.contains(onTop), onTop: onTop ? onTop.tagName + '.' + onTop.className : null, opened: q('#ch-a').textContent.indexOf('Count the filters in store B.') >= 0 };
    },
    // An old copy of one app file: the reader is told to press Ctrl+F5.
    staleCopy: async function () {
      await until(function () { return q('.bar'); });
      return { banner: q('.stale-copy') ? q('.stale-copy').textContent : '' };
    },
    // Mark as done: an action with no close-out check is closed and leaves the open lists.
    markDone: async function () {
      await until(function () { return q('#ch-a .facts'); });
      byText('#ch-a button', 'Mark as done').click();
      await until(function () { return q('#ch-c-note'); });
      var explain = q('#ch-a .explain').textContent;
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Action closed.') >= 0; }, 120000);
      return { explain: explain, panel: q('#ch-a') ? q('#ch-a').textContent : '', status: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 53; })[0].Status };
    },
    // Someone else changes the action while it is open: the request is refused with the plain message.
    staleRevision: async function () {
      await until(function () { return q('#ch-a .facts'); });
      MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0].Revision += 1;
      byText('#ch-a button', 'Mark as done').click();
      await until(function () { return q('#ch-c-note'); });
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a').textContent.indexOf('Not accepted') >= 0; }, 120000);
      return { panel: q('#ch-a').textContent, status: MockSharePoint.data.Actions.filter(function (a) { return a.Id === 40; })[0].Status };
    },
    // A visitor reads an action in another area: no buttons, a plain explanation.
    viewOnlyAction: async function () {
      await until(function () { return q('#ch-a .facts'); });
      await until(function () { return q('#ch-a').textContent.indexOf('Loading updates') < 0; });
      return { buttons: all('#ch-a .actions-row .btn').length, panel: q('#ch-a').textContent };
    },
    // Keyboard: Escape closes a dialog and focus returns to the action that opened it.
    dialogKeyboard: async function () {
      var item = await until(function () { return q('.items .item-open'); });
      item.focus();
      item.click();
      await until(function () { return q('#ch-a'); });
      var inside = q('#ch-a').contains(document.activeElement);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(50);
      return { inside: inside, closed: !q('#ch-a'), focusBack: document.activeElement === item };
    },
    // Limited mode (plan REV5 REL-5): a banner for everyone; queued changes are not offered; the instant update still is.
    limitedMode: async function () {
      await until(function () { return q('.limited'); });
      var banner = q('.limited').textContent;
      byText('button', 'Raise an action').click();
      await wait(100);
      var raiseOpened = !!q('#ch-r');
      var toast = q('[data-ch-live]').textContent;
      (await until(function () { return all('.item-open').filter(function (b) { return b.textContent.indexOf('Replace FH40 probe') >= 0; })[0]; })).click();
      await until(function () { return q('#ch-a .actions-row'); });
      var buttons = all('#ch-a .actions-row .btn').map(function (b) { return [b.textContent, b.disabled]; });
      return { banner: banner, raiseOpened: raiseOpened, toast: toast, buttons: buttons, note: q('#ch-a .actions-row').textContent, writes: MockSharePoint.writes.length };
    },
    // A change the flow fails on is shown as retrying, never as saved and never as given up (plan REV5 REL-2).
    retrying: async function () {
      (await until(function () { return all('.item-open').filter(function (b) { return b.textContent.indexOf('Replace FH40 probe') >= 0; })[0]; })).click();
      await until(function () { return q('#ch-a .actions-row'); });
      byText('#ch-a button', 'Mark as done').click();
      await until(function () { return q('#ch-c-note'); });
      q('#ch-a form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-a .pending') && q('#ch-a .pending').textContent.indexOf('retrying automatically') >= 0; }, 120000);
      return { pending: q('#ch-a .pending').textContent, saved: text().indexOf('Action closed.') >= 0 };
    },
    // The administrator's page: health, the two changes that need attention, and the honest choices for each.
    adminPage: async function () {
      var line = (await until(function () { return q('.admin-line'); })).textContent;
      byText('button', 'Open Administration').click();
      await until(function () { return q('.admin-change'); }, 8000);
      var page = text();
      var items = all('.admin-change').map(function (li) { return { text: li.textContent, buttons: Array.prototype.map.call(li.querySelectorAll('.btn'), function (b) { return b.textContent; }) }; });
      var nothing = all('.admin-change').filter(function (li) { return li.textContent.indexOf('nothing was changed') >= 0; })[0];
      byText('.admin-change .btn', 'Cancel').click();
      var confirmText = nothing.textContent;
      byText('.admin-change .btn', 'Yes, cancel').click();
      await until(function () { return text().indexOf('Done: Cancelled. Nothing was changed.') >= 0 || text().indexOf('Every change has been recorded') >= 0; }, 120000);
      var partly = all('.admin-change').filter(function (li) { return li.textContent.indexOf('Part made') >= 0; })[0];
      byText('.admin-change .btn', 'Revert').click();
      byText('.admin-change .btn', 'Yes, revert').click();
      await until(function () { return text().indexOf('Every change has been recorded') >= 0; }, 120000);
      var tx = MockSharePoint.data.History.filter(function (h) { return h.RowKind === 'Transaction'; }).map(function (h) { return [h.RequestKey, h.State]; });
      return { line: line, page: page, items: items, confirmText: confirmText, partlyFound: !!partly, tx: tx,
        unlocked: !MockSharePoint.data.Actions[1].PendingRequestKey, writes: MockSharePoint.writes.slice() };
    },
    // Open every area and every tab: the shell must make no writes at all.
    readOnlyAudit: async function () {
      await until(function () { return q('.tile'); });
      var names = all('.tile b').map(function (b) { return b.firstChild.textContent; });
      for (var i = 0; i < names.length; i++) {
        var tile = all('.tile').filter(function (t) { return t.querySelector('b').firstChild.textContent === names[i]; })[0];
        if (!tile) { byText('button', '‹ Overview').click(); await wait(50); tile = all('.tile').filter(function (t) { return t.querySelector('b').firstChild.textContent === names[i]; })[0]; }
        tile.click();
        await until(function () { return q('.subtabs'); });
        for (var t = 0; t < 4; t++) { all('.subtabs button')[t].click(); await wait(20); }
        byText('button', '‹ Overview').click();
        await wait(50);
      }
      return { areasVisited: names.length, writes: MockSharePoint.writes.length,
        posts: MockSharePoint.requests.filter(function (r) { return r.indexOf('POST') === 0; }).length };
    }
  };

  function run(name) {
    var out = document.createElement('pre');
    out.id = 'drive-result';
    (scenarios[name] ? scenarios[name]() : Promise.reject(new Error('No scenario ' + name)))
      .then(function (r) { out.textContent = JSON.stringify({ ok: true, result: r }); })
      .catch(function (e) { out.textContent = JSON.stringify({ ok: false, error: String(e && e.message || e) }); })
      .then(function () { document.body.appendChild(out); });
  }

  return { run: run };
})();
