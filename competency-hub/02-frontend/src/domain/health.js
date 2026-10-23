// Whether the automatic processing behind the Hub is working (plan REV5 REL-5). The queue monitor writes its
// findings to the Settings row QueueHealth; Daily tasks writes LastDailyRun. The app judges both itself, so a
// monitor that has stopped is noticed too: its report simply goes stale. Each part is judged on its own –
// stale reminders never stop people changing actions.
CH.health = (function () {
  var DAILY_LIMIT_HOURS = 26;
  var WORKING_SLACK_MINUTES = 45;

  function value(rows, title) {
    var row = (rows || []).filter(function (r) { return r.Title === title; })[0];
    return row && row.Value ? String(row.Value) : '';
  }

  // "07:00|19:45|60": working hours start and end, and minutes between checks outside them.
  function hours(text) {
    var p = String(text || '').split('|');
    var minutes = function (hhmm, fallback) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
    };
    return { start: minutes(p[0], 7 * 60), end: minutes(p[1], 19 * 60 + 45), interval: Math.max(15, Number(p[2]) || 60) };
  }

  function ukClock(now) {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now);
    var get = function (type) { return (parts.filter(function (p) { return p.type === type; })[0] || {}).value; };
    return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  }

  function parse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  // rows: Settings rows { Title, Value }. Returns { processing, reminders, reason, checkedAt, lastDailyRun, attention }:
  // processing 'ok' | 'down' | 'unknown' (the monitor has never reported: nothing is blocked); reminders 'ok' | 'stale' | 'unknown'.
  function judge(rows, now) {
    now = now || new Date();
    var report = parse(value(rows, 'QueueHealth'));
    var h = hours(value(rows, 'MonitorHours'));
    var clock = ukClock(now);
    var working = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(clock.weekday) >= 0 && clock.minutes >= h.start && clock.minutes <= h.end;
    var out = { processing: 'unknown', reminders: 'unknown', reason: '', checkedAt: null, lastDailyRun: null, attention: 0 };
    if (report && report.checkedAt) {
      out.checkedAt = new Date(report.checkedAt);
      out.attention = Number(report.attention) || 0;
      var limit = working ? WORKING_SLACK_MINUTES : h.interval + WORKING_SLACK_MINUTES;
      var age = (now.getTime() - out.checkedAt.getTime()) / 60000;
      if (report.state === 'Down') { out.processing = 'down'; out.reason = report.reason || 'Changes are not being processed.'; }
      else if (age > limit) { out.processing = 'down'; out.reason = 'The queue monitor has not reported since ' + CH.dates.ukTime(out.checkedAt) + '.'; }
      else out.processing = 'ok';
    }
    var daily = value(rows, 'LastDailyRun');
    if (daily) {
      out.lastDailyRun = new Date(daily);
      out.reminders = (now.getTime() - out.lastDailyRun.getTime()) / 3600000 > DAILY_LIMIT_HOURS ? 'stale' : 'ok';
    }
    return out;
  }

  return { judge: judge, hours: hours };
})();
