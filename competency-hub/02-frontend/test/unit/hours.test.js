// The out-of-hours heads-up (release 1.2.3): meeting minutes are finished on weekdays 07:00-19:00, UK time.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../load.js');
const CH = loadApp({});

test('no heads-up on a weekday 07:00-19:00 UK time; otherwise it says when minutes are finished', () => {
  const at = (iso) => CH.health.outOfHours(new Date(iso));
  assert.equal(at('2026-10-28T07:00:00Z'), '');                 // Wednesday 07:00 GMT
  assert.equal(at('2026-10-28T18:59:00Z'), '');
  assert.match(at('2026-10-28T19:00:00Z'), /from 07:00 tomorrow/);
  assert.match(at('2026-10-28T06:30:00Z'), /from 07:00 today/);
  assert.match(at('2026-10-30T19:30:00Z'), /on Monday/);          // Friday evening
  assert.match(at('2026-10-31T12:00:00Z'), /on Monday/);          // Saturday
  assert.match(at('2026-11-01T23:00:00Z'), /on Monday/);          // Sunday night
  assert.match(at('2026-11-02T06:59:00Z'), /from 07:00 today/);   // Monday early
  assert.equal(at('2026-06-10T06:30:00Z'), '');                 // summer: 07:30 BST
});
