// Size steps by the app's width and the reader's text size (plan K6.9).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../load.js');

const CH = loadApp();

test('the scale grows in steps with the width the app has', () => {
  const cases = [[768, 1], [1366, 1], [1399, 1], [1400, 1.1], [1699, 1.1], [1700, 1.2], [2000, 1.35], [2400, 1.5], [3840, 1.5]];
  cases.forEach(([w, s]) => assert.equal(CH.ui.scaleFor(w), s, w + ' px'));
});

test('text sizes are Normal, Large and Larger, and anything unknown means Normal', () => {
  assert.equal(CH.ui.textFactor('Normal'), 1);
  assert.equal(CH.ui.textFactor('Large'), 1.15);
  assert.equal(CH.ui.textFactor('Larger'), 1.3);
  assert.equal(CH.ui.textFactor('Huge'), 1);
});
