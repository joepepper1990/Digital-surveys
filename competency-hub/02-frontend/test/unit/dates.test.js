// Plan D.0.1 date rules, including the full reminder matrix (T-DATE-01 to T-DATE-06).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('../load.js');
const D = loadApp().dates;

test('seven-day reminder dates across month ends, year ends, leap years and clock changes', () => {
  const rows = [
    ['2026-10-28', '2026-10-21', 'Wednesday'],  // ordinary
    ['2026-11-02', '2026-10-26', 'Monday'],     // month end
    ['2026-11-01', '2026-10-25', 'Sunday'],     // BST ends on the reminder day
    ['2026-12-31', '2026-12-24', 'Thursday'],   // year end
    ['2027-01-03', '2026-12-27', 'Sunday'],     // crosses a year end
    ['2027-03-01', '2027-02-22', 'Monday'],     // non-leap February
    ['2027-04-04', '2027-03-28', 'Sunday'],     // BST starts on the reminder day
    ['2028-03-07', '2028-02-29', 'Tuesday'],    // leap day
    ['2028-03-01', '2028-02-23', 'Wednesday'],  // leap-year 1 March
    ['2027-07-01', '2027-06-24', 'Thursday']    // date-only value read in BST
  ];
  for (const [due, reminder, weekday] of rows) {
    assert.equal(D.addDays(due, -7), reminder, due);
    assert.equal(D.weekday(reminder), weekday, reminder);
    assert.equal(D.daysBetween(reminder, due), 7, due);
  }
});

test('incrementing a yyyymmdd number is never used: 28 Oct + 7 is 4 Nov', () => {
  assert.equal(D.addDays('2026-10-28', 7), '2026-11-04');
  assert.equal(D.daysBetween('2026-10-31', '2026-11-01'), 1);
});

test('missed run catch-up and overdue intervals', () => {
  assert.equal(D.daysBetween('2026-10-22', '2026-10-28'), 6);
  const due = '2026-10-19';
  const overdueDays = ['2026-10-20', '2026-10-27', '2026-11-03'].map((d) => D.daysBetween(due, d));
  assert.deepEqual(overdueDays, [1, 8, 15]);
  assert.deepEqual(overdueDays.map((n) => Math.floor((n - 1) / 7)), [0, 1, 2]);
});

test('date-only values stored as UK midnight in UTC read back as the right UK date', () => {
  assert.equal(D.localDate('2027-06-30T23:00:00Z'), '2027-07-01');
  assert.equal(D.localDate('2026-10-24T23:00:00Z'), '2026-10-25');
  assert.equal(D.localDate('2026-10-26T00:00:00Z'), '2026-10-26');
  assert.equal(D.localDate('2027-03-28T00:00:00Z'), '2027-03-28');
});

test('a run at 00:30 UK time uses the UK date', () => {
  assert.equal(D.localDate(new Date('2026-10-18T23:30:00Z')), '2026-10-19'); // BST
  assert.equal(D.localDate(new Date('2026-12-01T00:30:00Z')), '2026-12-01'); // GMT
  assert.equal(D.ukTime(new Date('2026-10-18T23:30:00Z')), '00:30');
});

test('DueDay conversions, including a value that arrives as a decimal', () => {
  assert.equal(D.toDueDay('2026-10-28'), 20261028);
  assert.equal(D.fromDueDay(20261028), '2026-10-28');
  assert.equal(D.fromDueDay('20261028.0'), '2026-10-28');
  assert.throws(() => D.fromDueDay(2026102));
});

test('weekly keys use the Monday date across a year end', () => {
  ['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03'].forEach((d) => assert.equal(D.mondayOf(d), '2026-12-28'));
  assert.equal(D.mondayOf('2027-01-04'), '2027-01-04');
});

test('every range bound from 2026 to 2030 is a valid date and agrees with day differences', () => {
  let day = '2026-01-01';
  while (day < '2031-01-01') {
    const plus7 = D.addDays(day, 7);
    assert.ok(D.isIso(plus7));
    assert.equal(D.daysBetween(day, plus7), 7);
    assert.equal(D.fromDueDay(D.toDueDay(plus7)), plus7);
    assert.ok(D.toDueDay(plus7) > D.toDueDay(day));
    day = D.addDays(day, 1);
  }
});

test('deadline wording is plain English', () => {
  const today = '2026-10-21'; // a Wednesday
  assert.deepEqual(plain(D.dueWords('2026-10-19', today)), { group: 'late', text: '2 days late' });
  assert.deepEqual(plain(D.dueWords('2026-10-20', today)), { group: 'late', text: '1 day late' });
  assert.deepEqual(plain(D.dueWords('2026-10-21', today)), { group: 'soon', text: 'Due today' });
  assert.deepEqual(plain(D.dueWords('2026-10-22', today)), { group: 'soon', text: 'Due tomorrow' });
  assert.deepEqual(plain(D.dueWords('2026-10-24', today)), { group: 'soon', text: 'Due Saturday' });
  assert.deepEqual(plain(D.dueWords('2026-10-28', today)), { group: 'soon', text: 'Due 28 Oct' });
  assert.deepEqual(plain(D.dueWords('2026-11-09', today)), { group: 'later', text: 'Due 9 Nov' });
});
