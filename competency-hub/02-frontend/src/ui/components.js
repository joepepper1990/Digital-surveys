// Small, plain building blocks shared by the views. Status is always words first, colour second.
CH.ui = (function () {
  var h = CH.dom.h;
  var D = CH.dates;

  function chip(group, text) { return h('span', { class: 'when w-' + group, text: text }); }

  function card(title, children, extraClass) {
    return h('section', { class: 'card' + (extraClass ? ' ' + extraClass : '') }, title ? h('h2', { text: title }) : null, children);
  }

  // One press, one change (release 1.3): while a handler's promise is on its way the button is disabled, so a
  // double click, or a click while a slow send is still going, can never send twice.
  function guarded(onclick) {
    return function (e) {
      var b = e.currentTarget;
      if (b.dataset.busy) return;
      var r = onclick(e);
      if (r && typeof r.then === 'function') {
        b.dataset.busy = '1';
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
        r.catch(function () {}).then(function () { delete b.dataset.busy; b.disabled = false; b.removeAttribute('aria-busy'); });
      }
      return r;
    };
  }

  function button(label, onclick, kind) {
    return h('button', { type: 'button', class: 'btn' + (kind ? ' btn-' + kind : ''), onclick: guarded(onclick), text: label });
  }

  function linkButton(label, onclick) {
    return h('button', { type: 'button', class: 'btn-link', onclick: guarded(onclick), text: label });
  }

  // A plain note when a list could not be read completely. Never shown as an empty result.
  function sectionNote(state, what) {
    if (state === 'unavailable') return h('p', { class: 'section-note', role: 'status', text: 'Could not load ' + what + ' just now. Reload the page to try again.' });
    if (state === 'partial') return h('p', { class: 'section-note', role: 'status', text: 'Showing the first ' + CH.config.maxRows + ' ' + what + ' only. This list is not complete.' });
    return null;
  }

  var GROUPS = [['late', 'Late', 'var(--late)'], ['soon', 'Due within 7 days', 'var(--soon)'], ['later', 'Coming up', '#9aa5af']];

  // Actions grouped as Late / Due within 7 days / Coming up. sub(action) gives the grey second line.
  // Each action opens with open(action); mark(action) gives its ✓ Sent / ✓✓ Saved mark, if any (release 1.2).
  function actionList(actions, sub, emptyText, state, open, mark) {
    if (state === 'unavailable') return null;
    if (!actions.length) return h('p', { class: 'muted', text: emptyText });
    var out = [];
    GROUPS.forEach(function (g) {
      var rows = actions.filter(function (a) { return a.group === g[0]; })
        .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); });
      if (!rows.length) return;
      out.push(h('h3', { class: 'group-title' }, h('span', { class: 'dot', style: 'background:' + g[2], 'aria-hidden': 'true' }), g[1]));
      out.push(h('ul', { class: 'items' }, rows.map(function (a) {
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: open ? function () { open(a); } : null, disabled: open ? null : true },
          h('span', null, h('span', { class: 't', text: a.title }), h('span', { class: 's' }, sub(a), mark ? mark(a) : null)),
          chip(a.waitingCloseOut ? 'later' : a.group, a.dueText)));
      })));
    });
    return out;
  }

  // actionsState: 'complete', 'partial' or 'unavailable'. Figures from a failed read are never shown as zero.
  function areaStatusLines(stats, actionsState) {
    var late = actionsState === 'unavailable'
      ? h('span', { class: 'txt-soon', text: 'Action figures unavailable' })
      : stats.late
      ? h('span', { class: 'txt-late', text: stats.late + ' late' })
      : h('span', { class: 'txt-ok', text: 'Nothing late' });
    var meeting = stats.nextMeeting
      ? h('span', { text: 'Meeting ' + D.weekdayShort(stats.nextMeeting) + (stats.flagged ? ' · ' + stats.flagged + ' to discuss' : '') })
      : stats.meetingStale
        ? h('span', { class: 'txt-soon', text: stats.lastMeeting ? 'No meeting since ' + D.short(stats.lastMeeting) : 'No meeting booked' })
        : h('span', { text: 'No meeting booked' });
    var open = actionsState === 'unavailable' ? '' : ' · ' + stats.open + ' open' + (actionsState === 'partial' ? ' (incomplete)' : '');
    return [h('span', { class: 'status' }, late, open), h('span', { class: 'status' }, meeting)];
  }

  function tile(area, stats, viewOnly, onopen, actionsState) {
    var cls = 'tile' + (actionsState !== 'unavailable' && stats.late ? ' has-late' : stats.meetingStale ? ' has-warn' : '') + (viewOnly ? ' view-only' : '');
    return h('button', { type: 'button', class: cls, onclick: onopen, 'aria-label': area.name + (viewOnly ? ', view only' : '') },
      h('b', null, area.name, viewOnly ? h('span', { class: 'vo', text: 'View only' }) : null),
      areaStatusLines(stats, actionsState),
      area.status === 'Archived' ? h('span', { class: 'status', text: 'Archived' }) : null);
  }

  function tileGrid(areas, model, viewOnly, open) {
    var cols = areas.length <= 6 ? Math.max(areas.length, 1) : 5;
    return h('div', { class: 'tiles' + (viewOnly ? ' tiles-small' : ''), style: '--cols:' + cols },
      areas.map(function (a) { return tile(a, model.stats[a.key], viewOnly, function () { open(a.key); }, model.sections.actions); }));
  }

  function toast(root, text, kind) {
    var region = root.querySelector('[data-ch-live]');
    if (!region) return;
    region.textContent = '';
    region.className = 'toast' + (kind ? ' toast-' + kind : '');
    region.textContent = text;
    setTimeout(function () { if (region.textContent === text) { region.textContent = ''; region.className = 'toast'; } }, 6000);
  }


  // Said to screen readers only (release 1.2): a change that is now saved. Sighted readers see ✓✓ Saved beside it.
  function say(root, text) {
    var region = root.querySelector('[data-ch-said]');
    if (region) region.textContent = text;
  }

  // Collapsed sections on the home page, remembered in this browser only (storage may be unavailable).
  var FOLD_KEY = 'esg-competency-hub-home';
  function folded() {
    try { return JSON.parse(window.localStorage.getItem(FOLD_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveFolded(state) { try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(state)); } catch (_) { /* not remembered */ } }

  // One home panel: a header button (title, summary, arrow), an optional link, and a body.
  function panel(id, title, summary, body, opts) {
    var o = opts || {};
    var closed = !!o.closed;
    var bodyId = 'ch-hp-' + id;
    var arrow = h('span', { class: 'hm-chev', 'aria-hidden': 'true', text: '›' });
    return h('section', { class: 'hm-panel' + (closed ? ' closed' : '') + (o.extraClass ? ' ' + o.extraClass : ''), 'data-panel': id },
      h('div', { class: 'hm-ph' },
        h('button', { type: 'button', class: 'hm-tg', 'aria-expanded': String(!closed), 'aria-controls': bodyId, onclick: o.onToggle },
          h('h2', { text: title }), summary ? h('span', { class: 'hm-sum', text: summary }) : null, arrow),
        o.link ? linkButton(o.link[0], o.link[1]) : null),
      h('div', { class: 'hm-pb', id: bodyId }, body));
  }

  // A list that shows only the items that fit, then "+ n more". It never scrolls and never cuts an item.
  var fits = [];
  function fitList(items, moreLabel, onMore, extraClass) {
    var list = h('div', { class: 'hm-fit' + (extraClass ? ' ' + extraClass : '') }, items);
    var more = h('button', { type: 'button', class: 'btn-link hm-more', onclick: onMore });
    function fit() {
      items.forEach(function (x) { x.hidden = false; });
      more.hidden = true;
      if (!list.isConnected || getComputedStyle(list).overflow === 'visible') return;
      var over = function () { return list.scrollHeight > list.clientHeight + 1; };
      if (!over()) return;
      more.hidden = false;
      var shown = items.length;
      while (shown > 0 && over()) { shown--; items[shown].hidden = true; }
      if (shown === items.length) { more.hidden = true; return; }
      more.textContent = shown ? '+ ' + (items.length - shown) + ' more – ' + moreLabel : items.length + ' – ' + moreLabel;
    }
    var entry = { fit: fit, observer: null };
    if (typeof window.ResizeObserver === 'function') {
      var last = -1;
      entry.observer = new window.ResizeObserver(function () { if (list.clientHeight !== last) { last = list.clientHeight; fit(); } });
      entry.observer.observe(list);
    }
    fits.push(entry);
    more.hidden = true;
    return [list, more];
  }
  function refit() { fits.forEach(function (f) { f.fit(); }); }
  function resetFits() { fits.forEach(function (f) { if (f.observer) f.observer.disconnect(); }); fits = []; }

  // Size steps by the width the app has (plan K6.9), so wide screens are not left with small text.
  var SCALE_STEPS = [[2400, 1.5], [2000, 1.35], [1700, 1.2], [1400, 1.1]];
  function scaleFor(width) {
    for (var i = 0; i < SCALE_STEPS.length; i++) if (width >= SCALE_STEPS[i][0]) return SCALE_STEPS[i][1];
    return 1;
  }

  // The reader's text size, remembered in this browser only. Storage can be unavailable; then Normal is used.
  var TEXT_SIZES = [['Normal', 1], ['Large', 1.15], ['Larger', 1.3]];
  var TEXT_KEY = 'esg-competency-hub-text-size';
  function textSize() {
    var saved = null;
    try { saved = window.localStorage.getItem(TEXT_KEY); } catch (_) { saved = null; }
    return TEXT_SIZES.some(function (t) { return t[0] === saved; }) ? saved : 'Normal';
  }
  function textFactor(name) { return (TEXT_SIZES.filter(function (t) { return t[0] === name; })[0] || TEXT_SIZES[0])[1]; }
  function saveTextSize(name) { try { window.localStorage.setItem(TEXT_KEY, name); } catch (_) { /* not remembered */ } }

  // A thing someone is editing is never rebuilt (app 1.3.2). repaint() may clear and refill the container; what was
  // typed or chosen in any input, textarea or select with a keep key (its id, or data-keep where an id is not enough
  // to say which thing it belongs to) is put back on the element with the same key, with focus and the caret.
  var KEEPABLE = 'input, textarea, select';
  function keepKey(el) { return el.getAttribute('data-keep') || el.id || ''; }
  function defaultIndex(sel) { for (var i = 0; i < sel.options.length; i++) if (sel.options[i].defaultSelected) return i; return 0; }
  function keepInputs(container, repaint) {
    var kept = {}, focused = null;
    var active = typeof document !== 'undefined' ? document.activeElement : null;
    var els = container.querySelectorAll(KEEPABLE);
    for (var i = 0; i < els.length; i++) {
      var el = els[i], key = keepKey(el);
      if (!key) continue;
      var state = { value: el.value, checked: el.checked, touched: el.tagName === 'SELECT' ? el.selectedIndex !== defaultIndex(el) : el.value !== (el.defaultValue || '') || el.checked !== el.defaultChecked };
      if (el === active) {
        focused = key;
        try { state.start = el.selectionStart; state.end = el.selectionEnd; } catch (_) { /* not a text field */ }
      }
      kept[key] = state;
    }
    var scrolls = [];
    var scrollers = container.querySelectorAll('[data-keep-scroll]');
    for (var s = 0; s < scrollers.length; s++) scrolls.push([scrollers[s].getAttribute('data-keep-scroll'), scrollers[s].scrollTop]);
    var top = container.scrollTop;
    repaint();
    container.scrollTop = top;
    scrolls.forEach(function (sc) { var el = container.querySelector('[data-keep-scroll="' + sc[0] + '"]'); if (el) el.scrollTop = sc[1]; });
    var after = container.querySelectorAll(KEEPABLE);
    for (var j = 0; j < after.length; j++) {
      var n = after[j], k = keepKey(n), was = kept[k];
      if (!was) continue;
      if (was.touched) {
        if (n.type === 'checkbox' || n.type === 'radio') n.checked = was.checked; else n.value = was.value;
      }
      if (k === focused) {
        n.focus({ preventScroll: true });
        if (was.start !== undefined) { try { n.setSelectionRange(was.start, was.end); } catch (_) { /* not a text field */ } }
      }
    }
    return focused;
  }

  var SVG = 'http://www.w3.org/2000/svg';
  var RING_R = 8, RING_C = 2 * Math.PI * RING_R;
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, String(attrs[k])); });
    return el;
  }

  // A ring that fills as a change goes through (app 1.3.1): sent, picked up by the flow, saved. words: what to
  // say beside it; r: CH.eta.remaining(entry). data-eta-key lets refreshRings move it on every second in place.
  function progressRing(entry, r, short) {
    var words = CH.eta.words(r, short);
    var svg = svgEl('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { class: 'track', cx: 10, cy: 10, r: RING_R }));
    svg.appendChild(svgEl('circle', { class: 'arc', cx: 10, cy: 10, r: RING_R, 'stroke-dasharray': (r.fraction * RING_C).toFixed(1) + ' ' + RING_C.toFixed(1) }));
    return h('span', { class: 'ring' + (r.stage === 'late' ? ' late' : ''), role: 'img', 'aria-label': CH.eta.words(r, false), 'data-eta-key': entry.key, 'data-eta-short': short ? '1' : '' },
      svg, h('span', { class: 'ring-text', text: words }));
  }

  // The green circle with a tick, shown once a change is saved; it fades after a moment.
  function savedMark(delayMs) {
    var svg = svgEl('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 10, cy: 10, r: 9 }));
    svg.appendChild(svgEl('path', { d: 'M5.5 10.5l3 3 6-6', fill: 'none' }));
    return h('span', { class: 'mark saved', role: 'img', 'aria-label': 'Saved', title: 'Saved', style: 'animation-delay:' + Math.round(delayMs) + 'ms' }, svg, h('span', { class: 'ring-text', text: 'Saved' }));
  }

  // Every ring and timing text on the page moves on, without rebuilding the page (so nothing jumps).
  function refreshRings(root, tracker) {
    if (!root || !tracker || !CH.eta) return;
    var rings = root.querySelectorAll('.ring[data-eta-key]');
    for (var i = 0; i < rings.length; i++) {
      var el = rings[i];
      var entry = tracker.byKey(el.getAttribute('data-eta-key'));
      if (!entry || entry.state === 'queued' || entry.state === 'held') continue;
      var r = CH.eta.remaining(entry);
      var arc = el.querySelector('.arc');
      if (arc) arc.setAttribute('stroke-dasharray', (r.fraction * RING_C).toFixed(1) + ' ' + RING_C.toFixed(1));
      var text = el.querySelector('.ring-text');
      var words = CH.eta.words(r, !!el.getAttribute('data-eta-short'));
      if (text && text.textContent !== words) text.textContent = words;
      el.setAttribute('aria-label', CH.eta.words(r, false));
      el.classList.toggle('late', r.stage === 'late');
    }
  }

  return {
    keepInputs: keepInputs, progressRing: progressRing, savedMark: savedMark, refreshRings: refreshRings,
    scaleFor: scaleFor, TEXT_SIZES: TEXT_SIZES, textSize: textSize, textFactor: textFactor, saveTextSize: saveTextSize,
    chip: chip, card: card, button: button, linkButton: linkButton, sectionNote: sectionNote,
    actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast, say: say,
    folded: folded, saveFolded: saveFolded, panel: panel, fitList: fitList, refit: refit, resetFits: resetFits
  , guarded: guarded };
})();
