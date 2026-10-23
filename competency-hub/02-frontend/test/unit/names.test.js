'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../load.js');

const CH = loadApp();

test('names stored surname first are shown first name first', () => {
  assert.equal(CH.names.display('Pepper Joseph', 'joseph.pepper@example.test'), 'Joseph Pepper');
  assert.equal(CH.names.display('Cange-Ainsworth Doti', 'doti.cangeainsworth@example.test'), 'Doti Cange-Ainsworth');
});

test('names already first name first, or that cannot be matched, are left as they are', () => {
  assert.equal(CH.names.display('Rachel Boulden', 'rachel.boulden@example.test'), 'Rachel Boulden');
  assert.equal(CH.names.display('Pepper Joseph', ''), 'Pepper Joseph');
  assert.equal(CH.names.display('Pepper Joseph', 'jpepper@example.test'), 'Pepper Joseph');
  assert.equal(CH.names.display('Starbuck', 'robert.starbuck@example.test'), 'Starbuck');
  assert.equal(CH.names.display('', 'a.b@example.test'), '');
});
