// Date rules from plan D.0.1. Canonical dates are UK calendar strings 'YYYY-MM-DD'.
// Arithmetic is done on calendar dates through Date.UTC, never on yyyymmdd integers.
CH.dates = (function () {
  var DAY_MS = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ukParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parts(instant) {
    var out = {};
    ukParts.formatToParts(instant).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }

  // The UK calendar date of an instant (a Date, or an ISO string with a time).
  function localDate(instant) {
    var p = parts(instant instanceof Date ? instant : new Date(instant));
    return p.year + '-' + p.month + '-' + p.day;
  }

  function ukTime(instant) {
    var p = parts(instant instanceof Date ? instant : new Date(instant));
    return p.hour + ':' + p.minute;
  }

  function isIso(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso); }

  function toUtc(iso) {
    if (!isIso(iso)) throw new Error('Not a calendar date: ' + iso);
    return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  }

  function fromUtc(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(iso, n) {
    return fromUtc(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
  }

  function dayOfWeek(iso) { return new Date(toUtc(iso)).getUTCDay(); }

  // Monday of the week containing iso, used for weekly keys (never ISO week numbers).
  function mondayOf(iso) { return addDays(iso, -((dayOfWeek(iso) + 6) % 7)); }

  function toDueDay(iso) { return Number(iso.replace(/-/g, '')); }

  function fromDueDay(n) {
    var s = String(Math.round(Number(n)));
    if (!/^\d{8}$/.test(s)) throw new Error('Not a DueDay: ' + n);
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }

  function short(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS[+iso.slice(5, 7) - 1]; }
  function shortYear(iso) { return short(iso) + ' ' + iso.slice(0, 4); }
  function long(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS_LONG[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4); }
  function weekday(iso) { return DAYS[dayOfWeek(iso)]; }
  function weekdayShort(iso) { return weekday(iso).slice(0, 3) + ' ' + short(iso); }

  // Plain-English wording for a deadline relative to today (plan C.9).
  function dueWords(dueIso, todayIso) {
    var d = daysBetween(todayIso, dueIso);
    if (d < 0) return { group: 'late', text: (-d) + (d === -1 ? ' day late' : ' days late') };
    if (d === 0) return { group: 'soon', text: 'Due today' };
    if (d === 1) return { group: 'soon', text: 'Due tomorrow' };
    if (d < 7) return { group: 'soon', text: 'Due ' + weekday(dueIso) };
    if (d === 7) return { group: 'soon', text: 'Due ' + short(dueIso) };
    return { group: 'later', text: 'Due ' + short(dueIso) };
  }

  return {
    localDate: localDate, ukTime: ukTime, addDays: addDays, daysBetween: daysBetween, dayOfWeek: dayOfWeek,
    mondayOf: mondayOf, toDueDay: toDueDay, fromDueDay: fromDueDay, isIso: isIso,
    short: short, shortYear: shortYear, long: long, weekday: weekday, weekdayShort: weekdayShort, dueWords: dueWords
  };
})();
