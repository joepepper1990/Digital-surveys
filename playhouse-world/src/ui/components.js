// Shared bits of chrome: the top bar, the option tray, toasts and dialogs.

import { el, tick } from '../util.js';
import { play } from './sound.js';

/** A button that clicks with a sound and a little haptic. */
export function button(label, opts = {}) {
  const { variant = '', round = false, big = false, onTap, sound = 'tap', title } = opts;
  const plain = title || String(label).replace(/<[^>]*>/g, '').trim();
  return el('button', {
    class: `btn ${variant ? 'btn--' + variant : ''} ${round ? 'btn--round' : ''} ${big ? 'btn--big' : ''} ${opts.class || ''}`,
    type: 'button',
    'aria-label': plain,
    title: plain,
    html: label,
    onclick: (event) => { play(sound); tick(); onTap?.(event); },
  });
}

export function topBar({ title, onBack, left = [], right = [] }) {
  const backBtn = onBack ? button('‹', { round: true, onTap: onBack, title: 'Back', sound: 'woosh' }) : null;
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar__side' }, [backBtn, ...left].filter(Boolean)),
    el('h1', { class: 'topbar__title', text: title }),
    el('div', { class: 'topbar__side' }, right),
  ]);
}

export function tabButton(label, emoji, on, onTap) {
  return el('button', {
    class: `tab ${on ? 'tab--on' : ''}`, type: 'button',
    onclick: () => { play('tap'); tick(); onTap(); },
  }, [el('span', { class: 'btn__emoji', text: emoji || '' }), label]);
}

export function swatch(color, on, onTap) {
  return el('button', {
    class: `swatch ${on ? 'swatch--on' : ''}`, type: 'button',
    style: `background:${color}`, 'aria-label': `colour ${color}`,
    onclick: () => { play('pop'); tick(); onTap(); },
  });
}

export function optionTile(svgMarkup, { label, on, onTap }) {
  const node = el('button', {
    class: `opt ${on ? 'opt--on' : ''}`, type: 'button', html: svgMarkup,
    'aria-label': label,
    onclick: () => { play('pop'); tick(); onTap(); },
  });
  if (label) node.append(el('span', { class: 'opt__label', text: label }));
  return node;
}

/** Floating toast inside a stage. */
export function toast(parent, text, ms = 1600) {
  let node = parent.querySelector('.hint');
  if (!node) {
    node = el('div', { class: 'hint' });
    parent.append(node);
  }
  node.textContent = text;
  node.classList.add('hint--show');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('hint--show'), ms);
}

/**
 * Modal dialog. Returns a promise: the entered text, true, or null on cancel.
 * fields: { prompt, value, placeholder, confirm, cancel, danger }
 */
export function askSheet(root, { title, prompt = '', value = null, placeholder = '', confirm = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const input = value !== null
      ? el('input', { class: 'field', type: 'text', value, placeholder, maxlength: '18', autocomplete: 'off' })
      : null;

    const close = (result) => { wrap.remove(); resolve(result); };

    const card = el('div', { class: 'sheet__card' }, [
      el('h2', { text: title }),
      prompt ? el('p', { text: prompt, style: 'margin:0;font-weight:600;color:var(--ink-soft)' }) : null,
      input,
      el('div', { class: 'sheet__row' }, [
        button(cancel, { variant: 'ghost', onTap: () => close(null) }),
        button(confirm, { variant: danger ? 'berry' : 'mint', onTap: () => close(input ? input.value.trim() || value : true) }),
      ]),
    ].filter(Boolean));

    const wrap = el('div', { class: 'sheet', onclick: (e) => { if (e.target === wrap) close(null); } }, [card]);
    root.append(wrap);
    if (input) setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}
