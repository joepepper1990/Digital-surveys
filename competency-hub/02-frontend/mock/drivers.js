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
