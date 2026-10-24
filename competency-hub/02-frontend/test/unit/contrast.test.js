// Colour contrast (WCAG 2.2 AA, spec Q3): every text colour on the background it is used on, from styles/app.css.
// Normal text needs 4.5:1; the chips and buttons are normal-size text, so they need it too.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'app.css'), 'utf8');
const token = (name) => new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(css)[1];
const rule = (selector, prop) => {
  const m = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css);
  const v = new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;]+)').exec(m[1])[1].trim();
  const t = /var\(--([\w-]+)\)/.exec(v);
  return t ? token(t[1]) : v;
};
function lum(hex) {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) hex = '#' + hex.slice(1).split('').map((c) => c + c).join('');
  assert.match(hex, /^#[0-9a-fA-F]{6}$/, 'a colour the test can read');
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('text colours meet 4.5:1 on their backgrounds', () => {
  const pairs = [
    ['body text', token('ink'), token('bg')], ['body text on cards', token('ink'), token('card')],
    ['muted text', token('muted'), token('card')], ['muted text on the page', token('muted'), token('bg')],
    ['top bar', '#ffffff', token('navy')], ['top bar subtitle', rule('.brand small', 'color'), token('navy')],
    ['top bar name and text size', rule('.who', 'color'), token('navy')],
    ['main button', rule('.btn-main', 'color'), rule('.btn-main', 'background')],
    ['late chip', rule('.w-late', 'color'), rule('.w-late', 'background')], ['due-soon chip', rule('.w-soon', 'color'), rule('.w-soon', 'background')],
    ['later chip', rule('.w-later', 'color'), rule('.w-later', 'background')], ['done chip', rule('.w-done', 'color'), rule('.w-done', 'background')],
    ['ok chip', rule('.w-ok', 'color'), rule('.w-ok', 'background')], ['test banner', rule('.env', 'color'), rule('.env', 'background')]
  ];
  const failing = pairs.filter((p) => !(ratio(p[1], p[2]) >= 4.5)).map((p) => p[0] + ' ' + ratio(p[1], p[2]).toFixed(2) + ':1');
  assert.deepEqual(failing, []);
});
