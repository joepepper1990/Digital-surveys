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
  // a row in the open area's "Notices & issues" column, by part of its title
  async function openRow(part) {
    var row = await until(function () { return all('.hm-area .hm-rw').filter(function (b) { return b.textContent.indexOf(part) >= 0; })[0]; });
    row.click();
  }
  // a list read as the signed-in person, through the simulated site
  async function readAs(list) {
    var res = await MockSharePoint.ctx.getWebPart().spHttpClient.get("https://contoso.example/sites/ESGCompetencyHub/_api/web/lists/getbytitle('" + list + "')/items?$select=Id&$top=100");
    return JSON.parse(await res.text()).value.length;
  }

  function px(sel) { var n = q(sel); return n ? parseFloat(getComputedStyle(n).fontSize) : 0; }

  var scenarios = {
    // Sizes follow the app's width and the reader's text size (plan K6.9).
    sizes: async function () {
      await until(function () { return q('.tile b'); });
      await wait(200);
      var before = { tile: px('.tile b'), h1: px('h1'), scale: document.querySelector('[data-ch-root]').style.getPropertyValue('--scale') };
      var hasControl = !!q('.textsize');
      return {
        width: document.querySelector('[data-ch-root]').clientWidth, tile: before.tile, h1: before.h1, scale: before.scale,
        hasControl: hasControl, scrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1
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
    // One notice on two noticeboards, important for 2 weeks: stored once, in the first area, and shown in both (1.9.0.0).
    noticeMany: async function () {
      await until(function () { return byText('button', 'Post a notice'); });
      byText('button', 'Post a notice').click();
      await until(function () { return q('#ch-n-title'); });
      var ticked = all('#ch-n-areas input:checked').map(function (x) { return x.value; });
      all('#ch-n-areas input').filter(function (x) { return x.value === 'INS'; })[0].click();
      var durations = all('#ch-n-imp option').map(function (o) { return o.textContent; });
      q('#ch-n-imp').value = '14';
      type(q('#ch-n-title'), 'Shared probe stock');
      type(q('#ch-n-body'), 'Flask and Instruments now share the probe stock.');
      q('form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-n'); });
      var toast = await until(function () { return q('.toast') && q('.toast').textContent; });
      var n = MockSharePoint.data.Noticeboard.filter(function (x) { return x.Title === 'Shared probe stock'; })[0];
      var allBox = q('#ch-n-all');
      return { ticked: ticked, durations: durations, stored: n && { folder: n.FileDirRef.split('/').pop(), shown: n.ShownIn, days: n.ImportantDays, important: n.IsImportant },
        writes: MockSharePoint.writes.length, allGone: !allBox, toast: toast };
    },
    // The notice shows on the other noticeboard too, and an engineer there turns it into an action.
    noticeConvert: async function () {
      await until(function () { return q('#ch-rec .facts, #ch-rec .notice-full'); });
      var header = q('#ch-rec').textContent;
      var btn = byText('#ch-rec button', 'Turn into an action');
      if (!btn) return { header: header, button: false };
      btn.click();
      var form = await until(function () { return q('#ch-r form'); });
      var prefilled = q('#ch-r-title').value;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      var areas = all('#ch-r-areaKey option').map(function (o) { return o.value; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var due = await until(function () { return q('#ch-r-dueIso'); });
      due.value = q('#ch-r-dueIso').max.slice(0, 4) - 1 + q('#ch-r-dueIso').min.slice(4);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Actions.filter(function (x) { return x.Title === prefilled; })[0]; }, 120000);
      var a = MockSharePoint.data.Actions.filter(function (x) { return x.Title === prefilled; })[0];
      return { header: header, button: true, prefilled: prefilled, areas: areas, source: [a.SourceType, a.SourceId], area: a.CompetencyId };
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
      await until(function () { return q('#ch-a') && q('#ch-a').textContent.indexOf('Owner: Joe Pepper') >= 0; });
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
      var confirmedNoteGone = all('.items .item-open').filter(function (b) { return b.textContent.indexOf('Replace FH40 probe') >= 0; })[0].textContent.indexOf('recorded') < 0;
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
    // Limited mode (spec REL-5): a banner for everyone; queued changes are not offered; the instant update still is.
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
    // A change the flow fails on is shown as retrying, never as saved and never as given up (spec REL-2).
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
    // People administration (spec ADM-1 to ADM-3): add one person, change someone's areas, and never your own.
    peoplePage: async function () {
      byText('button', 'Open Administration').click();
      (await until(function () { return byText('.subtabs button', 'People'); })).click();
      await until(function () { return q('#ch-p-search'); });
      var names = all('.people-list .item-open .t').map(function (n) { return n.textContent; });
      type(q('#ch-p-search'), 'boul');
      await wait(100);
      var found = all('.people-list .item-open .t').map(function (n) { return n.textContent; });
      byText('button', 'Add people').click();
      await until(function () { return q('#ch-pa-email'); });
      byText('#ch-pa button', 'Add this person').click();
      await wait(50);
      var emptyError = q('#ch-pa .result .field-error') ? q('#ch-pa .result .field-error').textContent : '';
      q('#ch-pa-email').value = 'test.person@example.com';
      q('#ch-pa-GRS-m').checked = true;
      byText('#ch-pa button', 'Add this person').click();
      await until(function () { return text().indexOf('Done and verified: Added Test Person.') >= 0; }, 120000);
      type(q('#ch-pa-list'), 'second.person@example.com, Engineer, FLK RP\nnot-an-email, Technician, FLK\nthird.person@example.com, Technician, XYZ');
      byText('#ch-pa button', 'Add everyone in the list').click();
      await until(function () { return text().indexOf('Done and verified: Added Second Person.') >= 0; }, 120000);
      var pasted = q('#ch-pa ul.result').textContent;
      q('#ch-pa .dialog-x').click();
      await wait(100);
      var added = MockSharePoint.data.People.filter(function (p) { return /example\.com$/.test(p.Email); }).map(function (p) { return p.Title; });
      var secondRows = MockSharePoint.data['Competency Members'].filter(function (m) {
        return m.PersonId === MockSharePoint.data.People.filter(function (p) { return p.Email === 'second.person@example.com'; })[0].SiteUserId; });
      // Rachel: give her meeting rights in Green Stream.
      type(q('#ch-p-search'), 'Rachel');
      await wait(100);
      byText('.people-list .item-open .t', 'Rachel Boulden').closest('button').click();
      await until(function () { return q('#ch-pp-GRS-c'); });
      q('#ch-pp-GRS-c').checked = true;
      byText('#ch-pp button', 'Save changes').click();
      await until(function () { return text().indexOf('Done and verified: Saved the changes for Rachel Boulden.') >= 0; }, 120000);
      var grs = MockSharePoint.data.Competencies.filter(function (c) { return c.CompetencyKey === 'GRS'; })[0].Id;
      var chair = MockSharePoint.data['Competency Members'].filter(function (m) { return m.PersonId === 112 && m.CompetencyId === grs; })[0].CanManageMeetings;
      q('#ch-pp .dialog-x').click();
      await wait(100);
      type(q('#ch-p-search'), 'Joe');
      await wait(100);
      byText('.people-list .item-open .t', 'Joe Pepper').closest('button').click();
      await until(function () { return q('#ch-pp .section-note'); });
      var selfNote = q('#ch-pp .section-note').textContent;
      var selfButtons = all('#ch-pp .actions-row .btn').map(function (b) { return b.disabled; });
      return { names: names.length, found: found, emptyError: emptyError, added: added, pasted: pasted, secondRows: secondRows.map(function (m) { return [m.CompetencyId, !!m.CanManageMeetings]; }),
        chair: !!chair, selfNote: selfNote, selfButtons: selfButtons,
        writes: MockSharePoint.writes.map(function (w) { return w.list + '/' + w.folder; }) };
    },
    // A technician without meeting rights raises only for themselves (spec §4.2).
    technicianRaise: async function () {
      (await until(function () { return byText('button', 'Raise an action'); })).click();
      await until(function () { return q('#ch-r-title'); });
      type(q('#ch-r-title'), 'Check the spare probe');
      type(q('#ch-r-description'), 'Before the next survey.');
      q('#ch-r form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      var owners = all('#ch-r-ownerId option').map(function (o) { return o.textContent; });
      var note = q('#ch-r-self-only');
      return { owners: owners, note: note.textContent, shown: note.style.display !== 'none' };
    },

    // The home page (approved 23 October 2026): fits the window, opens an area in place, Escape closes it and
    // focus returns to its tile, and folded sections are remembered after a reload.
    homeFit: async function () {
      window.localStorage.removeItem('esg-competency-hub-home');
      await until(function () { return q('.hm-stack'); });
      await wait(300);
      function scrolls() { return document.documentElement.scrollHeight > window.innerHeight + 1; }
      function cutNodes() {
        return all('.hm-fit, .hm-day, .hm-card').filter(function (n) { return n.offsetParent && n.scrollHeight > n.clientHeight + 1; });
      }
      function cut() { return cutNodes().length; }
      window.__cutWhy = function () { return cutNodes().map(function (n) { return n.className + ' ' + n.scrollHeight + '>' + n.clientHeight + ' ' + n.textContent.slice(0, 60); }); };
      await until(function () { return cut() === 0; }, 3000).catch(function () {});
      var home = { scrolls: scrolls(), cut: cut(), why: window.__cutWhy(), fitted: document.querySelector('[data-ch-root]').classList.contains('ch-fit') };
      var areasPanel = q('[data-panel="areas"]');
      if (areasPanel.classList.contains('closed')) { areasPanel.querySelector('.hm-tg').click(); await wait(200); }
      var tile = all('.hm-tile')[2];
      var name = tile.querySelector('b').textContent;
      tile.focus();
      tile.click();
      await until(function () { return q('.hm-area'); });
      await wait(200);
      // the lists refit as the panel settles (ResizeObserver): measure once it has, or after 3 seconds
      await until(function () { return cut() === 0; }, 3000).catch(function () {});
      var opened = { name: q('.hm-area h2').textContent, scrolls: scrolls(), cut: cut(), why: window.__cutWhy(), compact: !!q('.hm-tiles.compact'),
        weekFolded: q('[data-panel="week"]').classList.contains('closed'), actionsFolded: q('[data-panel="actions"]').classList.contains('closed') };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(100);
      var closed = { gone: !q('.hm-area'), focus: document.activeElement && document.activeElement.getAttribute('data-area'), weekOpen: !q('[data-panel="week"]').classList.contains('closed') };
      q('[data-panel="week"] .hm-tg').click();
      await wait(100);
      MockSharePoint.reload();
      await until(function () { return q('.hm-stack'); });
      await wait(200);
      var remembered = q('[data-panel="week"]').classList.contains('closed');
      window.localStorage.removeItem('esg-competency-hub-home');
      return { home: home, name: name, opened: opened, closed: closed, remembered: remembered };
    },
    // ---- Release 3: notices, comments, flags, the register, feedback, settings and the dashboard
    // A technician reads a notice in full, comments on it, and sees no moderation; then edits their own notice elsewhere.
    noticeRead: async function () {
      var dlg = await until(function () { return q('#ch-rec .notice-full'); });
      await until(function () { return q('#ch-rec .comments') || /No comments yet/.test(q('#ch-rec').textContent); });
      var before = q('#ch-rec').textContent;
      var buttons = all('#ch-rec .actions-row button').map(function (b) { return b.textContent; });
      var withdraw = !!byText('#ch-rec button', 'Withdraw the flag');
      type(q('#ch-rec-body'), 'Spare part arrives Thursday, I will fit it.');
      q('#ch-rec .comment-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-rec').textContent.indexOf('Spare part arrives Thursday') >= 0; });
      var saved = q('#ch-rec').textContent;
      q('#ch-rec .dialog-x').click();
      // notice 7 is Rachel's own, on the DSL noticeboard, where she is not a member
      var item = await until(function () { return q('.hm-tile[data-area="DSL"]'); });
      item.click();
      (await until(function () { return all('.hm-area .hm-rw').filter(function (b) { return b.textContent.indexOf('shared checklist') >= 0; })[0]; })).click();
      await until(function () { return q('#ch-rec .notice-full'); });
      var own = { buttons: all('#ch-rec .actions-row button').map(function (b) { return b.textContent; }), canComment: !!q('#ch-rec-body'),
        note: q('#ch-rec').textContent };
      return { body: before.indexOf('out of service until the replacement part arrives') >= 0, kellysComment: before.indexOf('The part is due on Thursday.') >= 0,
        hiddenShown: before.indexOf('A comment a moderator has hidden.') >= 0, flagged: before.indexOf('Flagged for the next Flask meeting') >= 0,
        buttons: buttons, withdraw: withdraw, saved: saved.indexOf('Rachel Boulden') >= 0, own: own, writes: MockSharePoint.writes.slice(),
        update: MockSharePoint.data.Updates.filter(function (u) { return u.Body === 'Spare part arrives Thursday, I will fit it.'; }).map(function (u) {
          return { folder: u.FileDirRef.split('/').pop(), type: u.EntryType, parent: u.ParentType + ':' + u.ParentId, flag: u.IsFlagEvent };
        }) };
    },
    // An engineer moderates: pins a notice, edits it, hides a comment and flags it for the meeting.
    noticeModerate: async function () {
      await until(function () { return q('#ch-rec .notice-full'); });
      byText('#ch-rec .actions-row button', 'Pin').click();
      var pinForm = await until(function () { return q('#ch-rec form.dialog-body'); });
      pinForm.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-rec .pending'); });
      var pending = q('#ch-rec .pending').textContent;
      await until(function () { var hd = q('#ch-rec .muted.small'); return hd && !q('#ch-rec .pending') && /Pinned/.test(hd.textContent); }, 120000);
      byText('#ch-rec .actions-row button', 'Edit').click();
      var title = await until(function () { return q('#ch-ne-title'); });
      type(title, 'Spare probes: two left in stores');
      q('#ch-rec form.dialog-body').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-rec .pending') && q('#ch-rec .dialog-head').textContent.indexOf('Spare probes: two left in stores') >= 0; }, 120000);
      // already flagged by Matt; Kelly runs Flask meetings, so may withdraw it, and flag it again
      byText('#ch-rec button', 'Withdraw the flag').click();
      await until(function () { return byText('#ch-rec button', 'Flag for the next meeting'); });
      byText('#ch-rec button', 'Flag for the next meeting').click();
      await until(function () { return byText('#ch-rec button', 'Withdraw the flag'); });
      var history = q('#ch-rec .ext-list') ? q('#ch-rec .ext-list').textContent : '';
      q('#ch-rec .dialog-x').click();
      await openRow('Calibration rig out of service');
      await until(function () { return q('#ch-rec .comments'); });
      byText('#ch-rec .comments button', 'Hide').click();
      await until(function () { return q('#ch-rec').textContent.indexOf('The part is due on Thursday.') < 0; }, 120000);
      var n2 = MockSharePoint.data.Noticeboard.filter(function (n) { return n.Id === 2; })[0];
      return { pending: pending, pinned: n2.IsImportant && !n2.ImportantUntil, title: n2.Title, revision: n2.Revision, history: history,
        hidden: MockSharePoint.data.Updates.filter(function (u) { return u.Id === 101; })[0].IsHidden,
        requests: MockSharePoint.data.Requests.map(function (r) { return r.RequestType + ':' + r.Status + ':' + r.TargetType; }),
        events: MockSharePoint.data.History.filter(function (h) { return /\|1$/.test(h.RequestKey) && h.RecordType !== 'Action'; }).map(function (h) { return h.EventType; }) };
    },
    // An engineer raises an entry, resolves another (an outcome is required) and links an existing action to it.
    registerFlow: async function () {
      (await until(function () { return byText('.hm-area .btn', 'Raise an issue'); })).click();
      var form = await until(function () { return q('#ch-e form'); });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var emptyError = q('#ch-e-title-err').textContent;
      q('#ch-e-entryType').value = 'Degradation';
      q('#ch-e-impact').value = 'High';
      type(q('#ch-e-title'), 'Probe holder cracked');
      type(q('#ch-e-description'), 'The holder on rig 2 has a hairline crack.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-e'); });
      await until(function () { return all('.hm-area .hm-rw').some(function (b) { return b.textContent.indexOf('Probe holder cracked') >= 0; }); }, 120000);
      all('.hm-area .hm-rw').filter(function (b) { return b.textContent.indexOf('Calibration rig drift') >= 0; })[0].click();
      await until(function () { return q('#ch-rec .facts'); });
      var linked = q('#ch-rec').textContent.indexOf('Replace FH40 probe') >= 0;
      byText('#ch-rec .actions-row button', 'Change status').click();
      await until(function () { return q('#ch-re-status'); });
      q('#ch-re-status').value = 'Resolved';
      q('#ch-rec form.dialog-body').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var outcomeError = q('#ch-re-outcome-err').textContent;
      type(q('#ch-re-outcome'), 'Rig recalibrated and drift checked over a week.');
      q('#ch-rec form.dialog-body').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { var hd = q('#ch-rec .muted.small'); return hd && !q('#ch-rec .pending') && /Resolved/.test(hd.textContent); }, 120000);
      var resolvedButtons = !!byText('#ch-rec button', 'Raise a linked action');
      q('#ch-rec .dialog-x').click();
      await openRow('Shared probe sign-out sheet');
      await until(function () { return q('#ch-rec .facts'); });
      byText('#ch-rec button', 'Link an existing action').click();
      var pick = await until(function () { return q('#ch-re-actionId'); });
      var choices = all('#ch-re-actionId option').map(function (o) { return o.textContent; });
      pick.value = String(MockSharePoint.data.Actions.filter(function (a) { return a.Title === 'Update Flask procedure FLK-03'; })[0].Id);
      q('#ch-rec form.dialog-body').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-rec .facts') && !q('#ch-rec .pending') && q('#ch-rec').textContent.indexOf('ACT-00041 Update Flask procedure FLK-03') >= 0; }, 120000);
      var e1 = MockSharePoint.data['Improvements and Degradations'].filter(function (e) { return e.Id === 1; })[0];
      var created = MockSharePoint.data['Improvements and Degradations'].filter(function (e) { return e.Title === 'Probe holder cracked'; })[0];
      return { emptyError: emptyError, linked: linked, outcomeError: outcomeError, status: e1.Status, outcome: e1.Outcome, resolvedButtons: resolvedButtons,
        choices: choices, link: MockSharePoint.data.Actions.filter(function (a) { return a.Title === 'Update Flask procedure FLK-03'; })[0].SourceId,
        created: created && { folder: created.FileDirRef.split('/').pop(), type: created.EntryType, raisedBy: created.RaisedById },
        writes: MockSharePoint.writes.map(function (w) { return w.list + '/' + w.folder; }) };
    },
    // An action raised from an entry carries the link (one action, never a copy).
    raiseLinked: async function () {
      await until(function () { return q('#ch-rec .facts'); });
      byText('#ch-rec button', 'Turn into an action').click();
      var form = await until(function () { return q('#ch-r form'); });
      var heading = q('#ch-r h2').textContent;
      type(q('#ch-r-title'), 'Design a sign-out sheet');
      type(q('#ch-r-description'), 'A one-page sheet for the probe store.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      var areas = all('#ch-r-areaKey option').map(function (o) { return o.value; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var due = await until(function () { return q('#ch-r-dueIso'); });
      due.value = q('#ch-r-dueIso').max.slice(0, 4) - 1 + q('#ch-r-dueIso').min.slice(4);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      var summary = q('#ch-r .facts').textContent;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('raised: Design a sign-out sheet') >= 0; }, 120000);
      var a = MockSharePoint.data.Actions.filter(function (x) { return x.Title === 'Design a sign-out sheet'; })[0];
      var payload = JSON.parse(MockSharePoint.data.Requests[0].Payload);
      return { heading: heading, areas: areas, summary: summary, source: a && [a.SourceType, a.SourceId], payloadEntry: payload.sourceEntryId };
    },
    // The feedback button: errors before sending, then a confirmed save; the sender reads only their own feedback.
    feedback: async function () {
      (await until(function () { return q('footer .fb-bubble'); })).click();
      var form = await until(function () { return q('#ch-fb form'); });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var emptyError = q('#ch-fb-description-err').textContent;
      q('#ch-fb-type').value = 'Ask a question';
      type(q('#ch-fb-description'), 'How do I see actions I raised for others?');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-fb'); });
      var toast = await until(function () { return q('.toast').textContent; });
      var mine = await readAs('Feedback');
      var row = MockSharePoint.data.Feedback.filter(function (f) { return f.Description === 'How do I see actions I raised for others?'; })[0];
      return { emptyError: emptyError, toast: toast, row: row && { type: row.FeedbackType, status: row.Status, author: row.AuthorId, folder: row.FileDirRef.split('/Lists/')[1] },
        visible: mine, writes: MockSharePoint.writes.map(function (w) { return w.list + '/' + w.folder; }) };
    },
    // An administrator sets the name they are known by on their own page: it changes nobody's access, so it is allowed.
    knownAs: async function () {
      (await until(function () { return byText('.pills button', 'Administration'); })).click();
      (await until(function () { return byText('.subtabs button', 'People'); })).click();
      var me = await until(function () { return all('.people-list .item-open').filter(function (b) { return b.textContent.indexOf('Joe Pepper') >= 0; })[0]; });
      me.click();
      var box = await until(function () { return q('#ch-pp-known'); });
      var disabledElsewhere = q('#ch-pp-role') ? q('#ch-pp-role').disabled : null;
      box.value = 'Joe';
      byText('#ch-pp button', 'Save name').click();
      await until(function () { return q('#ch-pp .ok-note') || q('#ch-pp .section-note[role="status"]'); }, 60000);
      await until(function () { return q('.who') && q('.who').textContent.indexOf('Joe · ') === 0; }, 20000);
      var row = MockSharePoint.data.People.filter(function (x) { return x.SiteUserId === 126; })[0];
      return { boxEnabled: !box.disabled, roleLocked: disabledElsewhere, who: q('.who').textContent, stored: row.KnownAs, note: (q('#ch-pp .ok-note') || q('#ch-pp .section-note[role="status"]')).textContent };
    },
    // A co-owner sees the shared action in their to-dos and can add updates, but not move the deadline;
    // the person named to check a done action is offered "Confirm close-out".
    shared: async function () {
      var t40 = MockSharePoint.data.Actions.filter(function (x) { return x.Id === 40; })[0].Title;
      var t53 = MockSharePoint.data.Actions.filter(function (x) { return x.Id === 53; })[0].Title;
      await until(function () { return q('.hm-tile'); });
      await wait(300);
      byText('.pills button', 'My to-dos').click();
      await until(function () { return q('.subtabs'); });
      await wait(300);
      var listed = all('.items .t').map(function (n) { return n.textContent; });
      var item = all('.items .item-open').filter(function (b) { return b.textContent.indexOf(t40) >= 0; })[0];
      if (item) item.click();
      await until(function () { return q('#ch-a .facts'); });
      var who = q('#ch-a .facts').textContent;
      var buttons = all('#ch-a button').map(function (b) { return b.textContent.trim(); });
      q('#ch-a .dialog-close, #ch-a [aria-label="Close"]') && q('#ch-a .dialog-close, #ch-a [aria-label="Close"]').click();
      await wait(200);
      return { shared: listed.indexOf(t40) >= 0, check: listed.indexOf(t53) >= 0, who: who, buttons: buttons };
    },
    // Raise with a co-owner and a named close-out check: both reach the request and the stored action.
    raiseShared: async function () {
      (await until(function () { return byText('button', 'Raise an action'); })).click();
      await until(function () { return q('#ch-r-title'); });
      var form = q('#ch-r form');
      type(q('#ch-r-title'), 'Calibrate the dose-rate meters');
      type(q('#ch-r-description'), 'Two are past their date.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var owner = await until(function () { return q('#ch-r-ownerId'); });
      owner.value = '112'; owner.dispatchEvent(new Event('change', { bubbles: true }));
      var coOffered = all('#ch-r-coOwnerIds input').map(function (x) { return Number(x.value); });
      all('#ch-r-coOwnerIds input').filter(function (x) { return x.value === '102'; })[0].checked = true;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      var due = await until(function () { return q('#ch-r-dueIso'); });
      due.value = q('#ch-r-dueIso').min.slice(0, 4) * 1 + 1 + q('#ch-r-dueIso').min.slice(4);
      var hiddenBefore = q('#ch-r-checkerId').closest('.field').style.display === 'none';
      var box = q('#ch-r-closeOut'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      var checkerDefault = q('#ch-r-checkerId').value;
      var checkerOffered = all('#ch-r-checkerId option').map(function (o) { return Number(o.value); });
      q('#ch-r-checkerId').value = '102';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      var summary = q('#ch-r .facts').textContent;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-r'); });
      await until(function () { return MockSharePoint.data.Actions.filter(function (x) { return x.Title === 'Calibrate the dose-rate meters'; })[0]; }, 120000);
      var a = MockSharePoint.data.Actions.filter(function (x) { return x.Title === 'Calibrate the dose-rate meters'; })[0];
      var payload = JSON.parse(MockSharePoint.data.Requests[0].Payload);
      return { coOffered: coOffered, hiddenBefore: hiddenBefore, checkerDefault: checkerDefault, checkerOffered: checkerOffered, summary: summary,
        payload: { co: payload.coOwnerIds, checker: payload.checkerId }, stored: { co: a.CoOwnerIds, checker: a.CloseOutById } };
    },
    sharedCheck: async function () {
      await until(function () { return q('#ch-a .facts'); });
      return { who: q('#ch-a .facts').textContent, buttons: all('#ch-a button').map(function (b) { return b.textContent.trim(); }) };
    },
    // Every page fits the window: the page itself never scrolls (a long list scrolls inside the page instead).
    pagesFit: async function () {
      await until(function () { return q('.hm-tile'); });
      await wait(300);
      var scrolls = function () { return document.documentElement.scrollHeight > window.innerHeight + 1 || document.documentElement.scrollWidth > window.innerWidth + 1; };
      var out = { home: scrolls() };
      var pills = ['My to-dos', 'Overview of all areas', 'Administration'];
      for (var i = 0; i < pills.length; i++) {
        var b = byText('.pills button', pills[i]);
        if (!b) continue;
        b.click(); await wait(500);
        out[pills[i]] = scrolls();
        if (pills[i] === 'Administration') {
          for (var k = 0; k < all('.subtabs button').length; k++) { all('.subtabs button')[k].click(); await wait(400); out['Administration – ' + all('.subtabs button')[k].textContent] = scrolls(); }
        }
      }
      var selects = all('select').filter(function (x) { return x.offsetParent; }).map(function (x) { return getComputedStyle(x).borderTopLeftRadius; });
      return { pages: out, anyScroll: Object.keys(out).filter(function (k) { return out[k]; }), plainSelects: selects.filter(function (r) { return r === '0px'; }).length };
    },
    // The feedback button never covers another control, on the fitted home page and on a long page.
    bubblePlace: async function () {
      var b = await until(function () { return q('footer .fb-bubble'); });
      await wait(300);
      function overlaps() {
        var r = b.getBoundingClientRect();
        return all('button, a, select, input, textarea').filter(function (n) {
          if (n === b || b.contains(n) || !n.offsetParent) return false;
          var o = n.getBoundingClientRect();
          return o.width && o.height && !(o.right <= r.left || o.left >= r.right || o.bottom <= r.top || o.top >= r.bottom);
        }).map(function (n) { return n.textContent.trim().slice(0, 30); });
      }
      var home = { overlaps: overlaps(), inView: b.getBoundingClientRect().bottom <= window.innerHeight + 1 };
      byText('.pills button', 'My to-dos').click();
      await until(function () { return q('.subtabs'); });
      await wait(200);
      return { home: home, mine: overlaps() };
    },
    // Administrators review feedback: filter, open, respond and set the status.
    feedbackReview: async function () {
      (await until(function () { return byText('.pills button', 'Administration'); })).click();
      (await until(function () { return byText('.subtabs button', 'Feedback'); })).click();
      await until(function () { return q('.items .item-open'); });
      var listed = all('.items .t').map(function (n) { return n.textContent; });
      all('.items .item-open').filter(function (b) { return b.textContent.indexOf('calendar') >= 0; })[0].click();
      await until(function () { return q('#ch-fr-status'); });
      var from = q('#ch-fr .muted.small').textContent;
      q('#ch-fr-status').value = 'Answered';
      type(q('#ch-fr-response'), 'Thanks – this is fixed in the next version.');
      q('#ch-fr form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-fr') && /answered/.test(text()); });
      var row = MockSharePoint.data.Feedback.filter(function (f) { return f.Id === 1; })[0];
      var statusSel = all('.filters select')[1];
      statusSel.value = 'Done';
      statusSel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);
      return { listed: listed, from: from, status: row.Status, response: row.Response, by: row.RespondedById, on: !!row.RespondedOn,
        doneFilter: /No feedback matches/.test(text()), writes: MockSharePoint.writes.slice() };
    },
    // Administrators change a setting: checked here, sent as a request, and shown once recorded.
    settings: async function () {
      (await until(function () { return byText('.pills button', 'Administration'); })).click();
      (await until(function () { return byText('.subtabs button', 'Settings'); })).click();
      await until(function () { return q('.settings'); });
      var shown = all('.settings .setting').map(function (n) { return n.querySelector('b').textContent; });
      all('.settings li').filter(function (li) { return li.textContent.indexOf('Due soon') >= 0; })[0].querySelector('button.btn').click();
      var input = await until(function () { return q('#ch-set-DueSoonDays'); });
      input.value = '40';
      q('.setting-edit').dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var rangeError = q('#ch-set-DueSoonDays-err').textContent;
      q('#ch-set-DueSoonDays').value = '10';
      q('.setting-edit').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return /Done: Change due soon to 10 days/.test(text()); }, 120000);
      var req = MockSharePoint.data.Requests[0];
      await until(function () { return /10 days/.test(all('.settings li').filter(function (li) { return li.textContent.indexOf('Due soon') >= 0; })[0].textContent); });
      return { shown: shown, rangeError: rangeError, request: { type: req.RequestType, payload: JSON.parse(req.Payload), status: req.Status },
        value: MockSharePoint.data['Competency Hub Settings'].filter(function (r) { return r.Title === 'DueSoonDays'; })[0].Value };
    },
    // Management overview: every figure opens exactly the actions it counts.
    dashboard: async function () {
      (await until(function () { return byText('.pills button', 'Overview of all areas'); })).click();
      await until(function () { return q('.dash-figs .dash-fig:not([disabled])') && !all('.dash-figs .dash-fig').some(function (b) { return b.disabled; }); });
      var figs = {};
      all('.dash-figs .dash-fig').forEach(function (b) { figs[b.querySelector('span').textContent] = Number(b.querySelector('b').textContent); });
      byText('.dash-figs .dash-fig span', 'Late').parentNode.click();
      await until(function () { return q('.dash-drill'); });
      var lateRows = all('.dash-drill .items li').length;
      var lateTitle = q('.dash-drill h2').textContent;
      byText('.dash-figs .dash-fig span', 'Completed').parentNode.click();
      await until(function () { return /completed/.test(q('.dash-drill h2').textContent); });
      var completedRows = all('.dash-drill .items li').length;
      var rows = all('.dash-table tbody tr');
      var rw = rows.filter(function (r) { return r.querySelector('th').textContent === 'Radwaste'; })[0];
      var rwLate = Number(rw.querySelectorAll('td')[1].querySelector('b').textContent);
      rw.querySelectorAll('td')[1].querySelector('button').click();
      await until(function () { return /Radwaste – late/.test(q('.dash-drill h2').textContent); });
      return { figs: figs, lateRows: lateRows, lateTitle: lateTitle, completedRows: completedRows, areaRows: rows.length, rwLate: rwLate,
        rwDrill: all('.dash-drill .items li').length, posts: MockSharePoint.requests.filter(function (r) { return r.indexOf('POST') === 0; }).length };
    },
    areaRegister: async function () {
      (await until(function () { return byText('.subtabs button', 'Notices & issues'); })).click();
      await until(function () { return q('.inline-filter select'); });
      var lists = all('.panel ul.items');
      var notices = Array.prototype.map.call(lists[0].querySelectorAll('.t'), function (n) { return n.textContent; });
      var entries = Array.prototype.map.call(lists[1].querySelectorAll('.t'), function (n) { return n.textContent; });
      var sel = q('.inline-filter select');
      sel.value = 'all';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(50);
      var allCount = all('.panel ul.items')[1].querySelectorAll('li').length;
      return { notices: notices, entries: entries, all: allCount, raise: !!byText('.tab-actions button', 'Raise an improvement or degradation') };
    },
    // ---- Release 4: meetings
    bookMeeting: async function () {
      (await until(function () { return byText('.hm-area .btn', 'Book a meeting'); })).click();
      var form = await until(function () { return q('#ch-m form'); });
      var ticked = all('#ch-m-attendeeIds input').filter(function (i) { return i.checked; }).length;
      var chairs = all('#ch-m-chairId option').map(function (o) { return o.textContent; });
      q('#ch-m-dateIso').value = '';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var dateError = q('#ch-m-dateIso-err').textContent;
      q('#ch-m-dateIso').value = MockSharePoint.data.today || q('#ch-m-dateIso').min;
      q('#ch-m-start').value = '14:00';
      q('#ch-m-end').value = '13:00';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var endError = q('#ch-m-end-err').textContent;
      q('#ch-m-end').value = '15:00';
      type(q('#ch-m-location'), 'Flask office');
      q('#ch-m-repeat').value = '2';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-m'); });
      await until(function () { return MockSharePoint.data.Requests.length === 3 && MockSharePoint.data.Requests.every(function (r) { return r.Status === 'Completed'; }); }, 120000);
      var booked = MockSharePoint.data.Meetings.filter(function (m) { return m.Location === 'Flask office'; });
      await until(function () { return all('.hm-area .hm-rw').some(function (b) { return b.textContent.indexOf('14:00 · Flask office') >= 0; }); }, 120000);
      return { ticked: ticked, chairs: chairs, dateError: dateError, endError: endError, booked: booked.length,
        dates: booked.map(function (m) { return m.MeetingDate.slice(0, 10); }), types: MockSharePoint.data.Requests.map(function (r) { return r.RequestType; }),
        writes: MockSharePoint.writes.map(function (w) { return w.list + '/' + w.folder; }) };
    },
    meetingChangeStart: async function () {
      await until(function () { return q('#ch-mt .facts'); });
      await until(function () { return /Open actions/.test(q('#ch-mt').textContent); });
      var preview = q('#ch-mt').textContent;
      // an item added by hand, straight into the meeting's record folder
      type(q('#ch-mt-title'), 'Spare cable order');
      q('#ch-mt .comment-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-mt').textContent.indexOf('Spare cable order') >= 0; });
      byText('#ch-mt .btn', 'Change').click();
      var form = await until(function () { return q('#ch-m form'); });
      q('#ch-m-start').value = '11:00';
      q('#ch-m-end').value = '12:00';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Requests.some(function (r) { return r.RequestType === 'UpdateMeeting' && r.Status === 'Completed'; }); }, 120000);
      await wait(2000);
      var reopen = await until(function () { return all('.hm-area .hm-rw').filter(function (b) { return b.textContent.indexOf('11:00') >= 0; })[0]; }, 120000)
        .catch(function () { throw new Error('rows: ' + all('.hm-area .hm-rw').map(function (b) { return b.textContent; }).join(' | ')); });
      reopen.click();
      await until(function () { return q('#ch-mt .facts') && byText('#ch-mt .btn', 'Start meeting'); });
      byText('#ch-mt .btn', 'Start meeting').click();
      (await until(function () { return q('#ch-mt form.dialog-body'); })).dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Requests.some(function (r) { return r.RequestType === 'StartMeeting' && r.Status === 'Completed'; }); }, 120000);
      // the people who run it now have the live screen: the fixed agenda, one item at a time
      await until(function () { return q('#ch-mt') && /In progress/.test(q('#ch-mt').textContent) && q('#ch-mt-progress'); }, 120000);
      var fixed = q('#ch-mt').textContent;
      var mt = MockSharePoint.data.Meetings.filter(function (m) { return m.Id === 2; })[0];
      return { preview: /Open actions \(\d+\)/.test(preview) && /Replace FH40 probe/.test(preview), added: MockSharePoint.data['Meeting Items'].filter(function (x) { return x.RowType === 'New Business'; }).map(function (x) {
        return x.FileDirRef.split('/Lists/')[1]; }), status: mt.Status, start: mt.MeetingDate.slice(11, 16), agendaRows: MockSharePoint.data['Meeting Items'].filter(function (x) { return x.RowType === 'Agenda Item'; }).length,
        fixed: /Item 1 of \d+ · Open actions/.test(fixed) && !/preview/.test(fixed) && fixed.indexOf('Spare cable order') >= 0, noStart: !byText('#ch-mt .btn', 'Start meeting') };
    },
    meetingCancel: async function () {
      await until(function () { return q('#ch-mt .facts'); });
      byText('#ch-mt .btn', 'Cancel meeting').click();
      var form = await until(function () { return q('#ch-mt form.dialog-body'); });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var reasonError = q('#ch-mt-reason-err').textContent;
      type(q('#ch-mt-reason'), 'Most of the area is on the outage.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Meetings.filter(function (m) { return m.Id === 2; })[0].Status === 'Cancelled'; }, 120000);
      await until(function () { return q('#ch-mt') && /Cancelled/.test(q('#ch-mt .muted.small').textContent); }, 120000);
      return { reasonError: reasonError, text: q('#ch-mt').textContent };
    },
    meetingAsTechnician: async function () {
      await until(function () { return q('#ch-mt .facts'); });
      await until(function () { return /Open actions/.test(q('#ch-mt').textContent); });
      var buttons = all('#ch-mt .actions-row .btn').map(function (b) { return b.textContent; });
      var calls = [];
      var original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { calls.push(blob); return 'blob:test'; };
      byText('#ch-mt .btn', 'Add to my calendar').click();
      URL.createObjectURL = original;
      var ics = calls.length ? await calls[0].text() : '';
      return { buttons: buttons, canAdd: !!q('#ch-mt-title'), ics: ics, bookButton: !!byText('.hm-area .btn', 'Book a meeting') };
    },
    // ---- Release 5: running a meeting, finalising, the minutes and amendments
    runMeeting: async function () {
      var M = function () { return MockSharePoint.data.Meetings.filter(function (m) { return m.Id === 2; })[0]; };
      var items = function () { return MockSharePoint.data['Meeting Items']; };
      await until(function () { return q('#ch-mt .facts'); });
      byText('#ch-mt .btn', 'Start meeting').click();
      (await until(function () { return q('#ch-mt form.dialog-body'); })).dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return M().Status === 'In Progress'; }, 120000);
      await until(function () { return q('#ch-mt-outcome') || byText('#ch-mt .btn', 'Next'); }, 120000);
      // attendance saves at once
      var att = q('#ch-mt-att-112');
      att.value = 'Apologies';
      att.dispatchEvent(new Event('change'));
      await until(function () { return items().some(function (r) { return r.RowType === 'Attendee' && r.Attendance === 'Apologies' && /\/Record$/.test(r.FileDirRef); }); });
      // finalising is held back while items for discussion have no outcome
      byText('#ch-mt .btn', 'Review and finalise').click();
      await until(function () { return q('#ch-mt form.dialog-body'); });
      var early = { missing: (q('#ch-mt-missing') || {}).textContent || '', disabled: byText('#ch-mt form .btn', 'Finalise the minutes').disabled };
      byText('#ch-mt form .btn', 'Back').click();
      // raise an action from the first item
      await until(function () { return q('#ch-mt-item-title'); });
      byText('#ch-mt .btn', 'Raise an action').click();
      var form = await until(function () { return q('#ch-r form'); });
      var heading = q('#ch-r h2').textContent;
      type(q('#ch-r-title'), 'Order spare probes');
      type(q('#ch-r-description'), 'Agreed at the meeting.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-ownerId'); });
      var areas = all('#ch-r-areaKey option').map(function (o) { return o.value; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-r-dueIso'); });
      q('#ch-r-dueIso').value = q('#ch-r-dueIso').min;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return text().indexOf('Check and raise') >= 0; });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return !q('#ch-r'); });
      var request = MockSharePoint.data.Requests.filter(function (r) { return r.RequestType === 'RaiseAction'; })[0];
      // every item, one at a time: those for discussion get an outcome
      var seen = [];
      for (var i = 0; i < 40; i++) {
        var progress = await until(function () { return q('#ch-mt-item-title') && q('#ch-mt-progress'); });
        var label = /Item (\d+) of (\d+)/.exec(progress.textContent);
        var title = q('#ch-mt-item-title').textContent;
        seen.push(title);
        var before = items().length;
        if (q('#ch-mt-outcome')) {
          if (/needs an outcome/.test(progress.textContent)) q('#ch-mt-outcome').value = 'Discussed';
          if (i === 0) type(q('#ch-mt-item-notes'), 'Probe stock is the priority.');
          byText('#ch-mt .btn', 'Save and next').click();
          await until(function () { return items().length > before; });
        } else {
          byText('#ch-mt .btn', 'Next').click();
        }
        if (label[1] === label[2]) break;
        await until(function () { return q('#ch-mt-item-title') && q('#ch-mt-item-title').textContent !== title; });
      }
      // a decision
      type(await until(function () { return q('#ch-mt-decision'); }), 'Probe checks stay monthly');
      q('#ch-mt-decision').form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return items().some(function (r) { return r.RowType === 'Decision' && r.Title === 'Probe checks stay monthly'; }); });
      await until(function () { return MockSharePoint.data.Actions.some(function (a) { return a.Title === 'Order spare probes'; }); }, 120000);
      await wait(1500);
      byText('#ch-mt .btn', 'Review and finalise').click();
      await until(function () { return q('#ch-mt form.dialog-body') && !byText('#ch-mt form .btn', 'Finalise the minutes').disabled; }, 120000)
        .catch(function () { throw new Error('review: ' + (q('#ch-mt form.dialog-body') || {}).textContent + ' seen: ' + seen.join(' | ')); });
      q('#ch-mt form.dialog-body').dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return M().Status === 'Finalised'; }, 120000);
      await until(function () { return q('#ch-mt .minutes') && /Probe checks stay monthly/.test(q('#ch-mt .minutes').textContent); }, 120000);
      var minutes = q('#ch-mt .minutes').textContent;
      var a = MockSharePoint.data.Actions.filter(function (x) { return x.Title === 'Order spare probes'; })[0];
      return { early: early, heading: heading, areas: areas, requestMeeting: request && request.MeetingId, source: a && [a.SourceType, a.SourceId], items: seen.length,
        frozenNotes: items().filter(function (r) { return /MTG-2$/.test(r.FileDirRef) && r.Notes === 'Probe stock is the priority.'; }).length,
        pdf: (q('#ch-mt .minutes a.btn') || {}).getAttribute ? q('#ch-mt .minutes a.btn').getAttribute('href') : '', minutes: minutes,
        writesInRecord: MockSharePoint.writes.filter(function (w) { return w.list === 'Meeting Items'; }).every(function (w) { return /^FLK\/MTG-2\/Record$/.test(w.folder); }) };
    },
    liveView: async function () {
      await until(function () { return q('#ch-mt .facts'); });
      byText('#ch-mt .btn', 'Start meeting').click();
      (await until(function () { return q('#ch-mt form.dialog-body'); })).dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return q('#ch-mt-progress'); }, 120000);
      return { ok: true };
    },
    minutesAsTechnician: async function () {
      await until(function () { return q('#ch-mt .minutes'); }, 60000);
      var m = q('#ch-mt .minutes').textContent;
      var buttons = all('#ch-mt .actions-row .btn').map(function (b) { return b.textContent; });
      return { minutes: m, buttons: buttons, pdf: q('#ch-mt .minutes a.btn').getAttribute('href') };
    },
    noticeHistory: async function () {
      await until(function () { return q('#ch-rec .notice-full'); });
      await until(function () { return /meeting, /.test((q('#ch-rec details.ext-list') || {}).textContent || ''); }, 60000)
        .catch(function () { throw new Error('panel: ' + q('#ch-rec').textContent); });
      return { history: q('#ch-rec details.ext-list').textContent };
    },
    amendMinutes: async function () {
      await until(function () { return q('#ch-mt .minutes'); }, 60000);
      byText('#ch-mt .btn', 'Amend the minutes').click();
      var form = await until(function () { return q('#ch-mt form.dialog-body'); });
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var errors = [q('#ch-mt-what-err').textContent, q('#ch-mt-reason-err').textContent];
      type(q('#ch-mt-what'), 'Nick Pearce attended for the second half.');
      type(q('#ch-mt-reason'), 'Attendance was recorded before he arrived.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Meetings.filter(function (m) { return m.AmendmentCount === 1; }).length; }, 120000);
      await until(function () { return q('#ch-mt .minutes') && /Amendments/.test(q('#ch-mt .minutes').textContent); }, 120000);
      return { errors: errors, minutes: q('#ch-mt .minutes').textContent, pdf: q('#ch-mt .minutes a.btn').getAttribute('href') };
    },
    // ---- Release 6: removing the test records before go-live
    removeTestData: async function () {
      await until(function () { return byText('.subtabs button', 'Remove test data'); });
      byText('.subtabs button', 'Remove test data').click();
      await until(function () { return q('#ch-cl-confirm'); }, 60000);
      var marked = all('.cleanup input[disabled]').length;
      // tick an early action raised before marking existed
      var box = q('.cleanup input[data-key^="Action:"]');
      var key = box.getAttribute('data-key');
      box.closest('details').open = true;
      box.click();
      await until(function () { return q('#ch-cl-confirm') && q('.cleanup input[data-key="' + key + '"]').checked; });
      type(q('#ch-cl-confirm'), 'remove test data');
      q('#ch-cl-confirm').form.dispatchEvent(new Event('submit', { cancelable: true }));
      await wait(50);
      var wrong = q('#ch-cl-error').textContent;
      type(q('#ch-cl-confirm'), 'REMOVE TEST DATA');
      q('#ch-cl-confirm').form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Requests.some(function (r) { return r.RequestType === 'RemoveTestRecords' && r.Status === 'Completed'; }); }, 120000);
      var id = Number(key.split(':')[1]);
      var req = MockSharePoint.data.Requests.filter(function (r) { return r.RequestType === 'RemoveTestRecords'; })[0];
      return { marked: marked, wrong: wrong, payload: JSON.parse(req.Payload), result: req.ResultMessage,
        gone: !MockSharePoint.data.Actions.some(function (a) { return a.Id === id; }) && !MockSharePoint.data.Noticeboard.some(function (n) { return n.Id === 4; }),
        testing: MockSharePoint.data['Competency Hub Settings'].filter(function (x) { return x.Title === 'PreGoLiveTesting'; })[0].Value, ticked: id };
    },
    testMarkedNotice: async function () {
      await until(function () { return q('.hm-stack'); });
      byText('.btn', 'Post a notice').click();
      var form = await until(function () { return q('#ch-n form'); });
      type(q('#ch-n-title'), 'TEST marking check');
      type(q('#ch-n-body'), 'Made while testing.');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await until(function () { return MockSharePoint.data.Noticeboard.some(function (n) { return n.Title === 'TEST marking check'; }); });
      return { marked: MockSharePoint.data.Noticeboard.filter(function (n) { return n.Title === 'TEST marking check'; })[0].IsTestRecord === true };
    },
    // Every view an administrator and Team Leader can open, with the list view threshold enforced by the mock: no query
    // may be one SharePoint would refuse once the large lists pass 5,000 items (spec Q2, query audit).
    queryAudit: async function () {
      var visit = async function (label) { var b = byText('button, a', label); if (b) { b.click(); await wait(400); } return !!b; };
      await until(function () { return q('.hm-stack'); });
      var seen = [];
      for (var i = 0; i < all('.hm-tile').length; i++) {
        all('.hm-tile')[i].click();
        await until(function () { return q('.hm-area'); });
        await wait(200);
        seen.push(q('.hm-area h2').textContent);
        (byText('.hm-area .btn-link', 'Full page') || {}).click && byText('.hm-area .btn-link', 'Full page').click();
        await until(function () { return q('.subtabs'); });
        for (var t = 0; t < all('.subtabs button').length; t++) { all('.subtabs button')[t].click(); await wait(100); }
        byText('button', '‹ My week').click();
        await until(function () { return q('.hm-stack'); });
      }
      var views = [];
      for (var v of ['My to-dos', 'Overview of all areas', 'Administration']) {
        if (await visit(v)) {
          views.push(v);
          for (var k = 0; k < all('.subtabs button').length; k++) { all('.subtabs button')[k].click(); await wait(400); }
          var back = byText('button', '‹ My week'); if (back) { back.click(); await wait(200); }
        }
      }
      return { areas: seen.length, views: views, hits: MockSharePoint.thresholdHits.slice(), gets: MockSharePoint.requests.filter(function (r) { return r.indexOf('GET') === 0; }).length };
    },
    // Every kind of view, with attack strings in every typed value (mode=xss): nothing runs, nothing is injected.
    xssSweep: async function () {
      var opened = [];
      var settle = async function (sel) { await until(function () { return q(sel); }, 60000); await wait(300); opened.push(sel); };
      var closeDlg = async function () { var x = q('.dialog-x'); if (x) { x.click(); await wait(100); } };
      await settle('.hm-stack');
      all('.hm-tile')[0].click();
      await settle('.hm-area');
      var item = q('.hm-area .item-open');
      if (item) { item.click(); await settle('.dialog'); await closeDlg(); }
      byText('.hm-area .btn-link', 'Full page').click();
      await settle('.subtabs');
      for (var t = 0; t < all('.subtabs button').length; t++) { all('.subtabs button')[t].click(); await wait(200); }
      var html = document.querySelector('[data-ch-root]').innerHTML;
      return { opened: opened, xss: window.__xss === 1, injectedImgs: all('img[src="x"]').length, injectedScripts: document.querySelectorAll('[data-ch-root] script').length,
        injectedBold: document.querySelectorAll('[data-ch-root] b').length && all('b').some(function (b) { return b.textContent === 'bold'; }),
        shownAsText: html.indexOf('&lt;img src=x onerror=') >= 0 };
    },
    // One panel opened by its link (?notice=, ?entry=, ?meeting=), in mode=xss
    xssCheck: async function () {
      await until(function () { return q('.dialog .dialog-content') && q('.dialog .dialog-content').textContent.length > 80; }, 60000);
      await wait(1500);
      var html = q('.dialog').innerHTML;
      return { xss: window.__xss === 1, injectedImgs: all('img[src="x"]').length, injectedScripts: document.querySelectorAll('[data-ch-root] script').length,
        injectedBold: all('.dialog b').some(function (b) { return b.textContent === 'bold'; }), shownAsText: html.indexOf('&lt;img src=x onerror=') >= 0 };
    },
    // Accessibility (spec Q3): in every view and form opened here, each control has an accessible name, each dialog is
    // modal and labelled, and no id is used twice. Reported as a list of problems (none expected).
    a11yAudit: async function () {
      var problems = [];
      var seen = [];
      var nameOf = function (el) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
        if (el.id && document.querySelector('label[for="' + el.id + '"]')) return true;
        if (el.closest('label')) return true;
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return (el.textContent || '').trim().length > 0;
        return false;
      };
      var audit = function (where) {
        seen.push(where);
        all('input:not([type=hidden]), select, textarea, button, a[href]').filter(function (el) { return el.offsetParent !== null; }).forEach(function (el) {
          if (!nameOf(el)) problems.push(where + ': ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' has no accessible name');
        });
        all('[role=dialog]').forEach(function (d) {
          if (d.getAttribute('aria-modal') !== 'true' || !document.getElementById(d.getAttribute('aria-labelledby') || '-')) problems.push(where + ': dialog ' + d.id + ' not modal or not labelled');
        });
        var ids = {};
        all('[id]').forEach(function (el) { if (ids[el.id]) problems.push(where + ': id ' + el.id + ' used twice'); ids[el.id] = true; });
      };
      var close = async function () { var x = q('.dialog-x'); if (x) { x.click(); await wait(150); } };
      await until(function () { return q('.hm-stack'); });
      await wait(300);
      audit('home');
      byText('.btn', 'Raise an action').click();
      await until(function () { return q('#ch-r form'); });
      audit('raise form');
      await close();
      byText('.btn', 'Post a notice').click();
      await until(function () { return q('#ch-n form'); });
      audit('notice form');
      await close();
      all('.hm-tile')[0].click();
      await until(function () { return q('.hm-area'); });
      await wait(300);
      audit('area panel');
      var bookBtn = byText('.hm-area .btn', 'Book a meeting');
      if (bookBtn) { bookBtn.click(); await until(function () { return q('#ch-m form'); }); audit('booking form'); await close(); }
      var item = q('.hm-area .item-open');
      item.click();
      await until(function () { return q('.dialog .facts'); });
      await wait(300);
      audit('action panel');
      await close();
      byText('.hm-area .btn-link', 'Full page').click();
      await until(function () { return q('.subtabs'); });
      for (var t = 0; t < all('.subtabs button').length; t++) { all('.subtabs button')[t].click(); await wait(200); audit('area page tab ' + (t + 1)); }
      var fb = byText('button', 'Feedback');
      if (fb) { fb.click(); await until(function () { return q('#ch-fb form') || q('.dialog form'); }); audit('feedback form'); await close(); }
      return { views: seen, problems: problems };
    },
    narrowFit: async function () {
      await until(function () { return q('.hm-stack'); });
      await wait(500);
      var wide = function () { return document.documentElement.scrollWidth > window.innerWidth + 1; };
      var home = wide();
      all('.hm-tile')[0].click();
      await until(function () { return q('.hm-area'); });
      await wait(300);
      var area = wide();
      q('.hm-area .item-open').click();
      await until(function () { return q('.dialog .facts'); });
      await wait(300);
      return { width: window.innerWidth, homeScrollsSideways: home, areaScrollsSideways: area, dialogScrollsSideways: wide() };
    },
    // Open every area and every tab: the shell must make no writes at all.
    readOnlyAudit: async function () {
      await until(function () { return q('.tile'); });
      var names = all('.tile b').map(function (b) { return b.firstChild.textContent; });
      for (var i = 0; i < names.length; i++) {
        var tile = all('.tile').filter(function (t) { return t.querySelector('b').firstChild.textContent === names[i]; })[0];
        if (!tile) { byText('button', '‹ My week').click(); await wait(50); tile = all('.tile').filter(function (t) { return t.querySelector('b').firstChild.textContent === names[i]; })[0]; }
        tile.click();
        (await until(function () { return byText('.hm-area .btn-link', 'Full page'); })).click();
        await until(function () { return q('.subtabs'); });
        for (var t = 0; t < 4; t++) { all('.subtabs button')[t].click(); await wait(20); }
        byText('button', '‹ My week').click();
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
      .catch(function (e) { out.textContent = JSON.stringify({ ok: false, error: String(e && e.message || e), at: String(e && e.stack || '').split('\n').slice(0, 3).join(' | ') }); })
      .then(function () { document.body.appendChild(out); });
  }

  return { run: run };
})();
