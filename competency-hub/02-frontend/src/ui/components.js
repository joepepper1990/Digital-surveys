// Small, plain building blocks shared by the views. Status is always words first, colour second.
CH.ui = (function () {
  var h = CH.dom.h;
  var D = CH.dates;

  function chip(group, text) { return h('span', { class: 'when w-' + group, text: text }); }

  function card(title, children, extraClass) {
    return h('section', { class: 'card' + (extraClass ? ' ' + extraClass : '') }, title ? h('h2', { text: title }) : null, children);
  }

  function button(label, onclick, kind) {
    return h('button', { type: 'button', class: 'btn' + (kind ? ' btn-' + kind : ''), onclick: onclick, text: label });
  }

  function linkButton(label, onclick) {
    return h('button', { type: 'button', class: 'btn-link', onclick: onclick, text: label });
  }

  // A plain note when a list could not be read completely. Never shown as an empty result.
  function sectionNote(state, what) {
    if (state === 'unavailable') return h('p', { class: 'section-note', role: 'status', text: 'Could not load ' + what + ' just now. Reload the page to try again.' });
    if (state === 'partial') return h('p', { class: 'section-note', role: 'status', text: 'Showing the first ' + CH.config.maxRows + ' ' + what + ' only. This list is not complete.' });
    return null;
  }

  var GROUPS = [['late', 'Late', 'var(--late)'], ['soon', 'Due within 7 days', 'var(--soon)'], ['later', 'Coming up', '#9aa5af']];

  // Actions grouped as Late / Due within 7 days / Coming up. sub(action) gives the grey second line.
  // Each action opens with open(action); pending(action) gives a "being recorded" note, if any.
  function actionList(actions, sub, emptyText, state, open, pending) {
    if (state === 'unavailable') return null;
    if (!actions.length) return h('p', { class: 'muted', text: emptyText });
    var out = [];
    GROUPS.forEach(function (g) {
      var rows = actions.filter(function (a) { return a.group === g[0]; })
        .sort(function (a, b) { return a.dueIso.localeCompare(b.dueIso); });
      if (!rows.length) return;
      out.push(h('h3', { class: 'group-title' }, h('span', { class: 'dot', style: 'background:' + g[2], 'aria-hidden': 'true' }), g[1]));
      out.push(h('ul', { class: 'items' }, rows.map(function (a) {
        var note = pending ? pending(a) : '';
        return h('li', null, h('button', { type: 'button', class: 'item-open', onclick: open ? function () { open(a); } : null, disabled: open ? null : true },
          h('span', null, h('span', { class: 't', text: a.title }), h('span', { class: 's', text: sub(a) + (note ? ' · ' + note : '') })),
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

  return {
    scaleFor: scaleFor, TEXT_SIZES: TEXT_SIZES, textSize: textSize, textFactor: textFactor, saveTextSize: saveTextSize,
    chip: chip, card: card, button: button, linkButton: linkButton, sectionNote: sectionNote,
    actionList: actionList, tile: tile, tileGrid: tileGrid, areaStatusLines: areaStatusLines, toast: toast
  };
})();
