// Whether the automatic processing behind the Hub is working (spec REL-5). The queue monitor writes its
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

  // MaxDeadlineYears: a whole number from 1 to 5, as the flow accepts it; 2 when missing or unreadable.
  function years(text) {
    var n = /^\d{1,2}$/.test(String(text || '').trim()) ? Number(text) : 0;
    return n >= 1 && n <= 5 ? n : CH.config.maxDeadlineYears;
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
    var weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(clock.weekday) >= 0;
    // The tighter limit starts only once the first working-hours check has had time to report: until then the
    // latest report may be the last one from outside working hours.
    var working = weekday && clock.minutes >= h.start + WORKING_SLACK_MINUTES && clock.minutes <= h.end;
    var out = { processing: 'unknown', reminders: 'unknown', administration: 'ok', adminReason: '', records: 'ok', recordsReason: '', meetings: 'ok', meetingsReason: '', reason: '', checkedAt: null, lastDailyRun: null,
      attention: 0, maxDeadlineYears: years(value(rows, 'MaxDeadlineYears')) };
    if (report && report.checkedAt) {
      out.checkedAt = new Date(report.checkedAt);
      out.attention = Number(report.attention) || 0;
      var limit = working ? WORKING_SLACK_MINUTES : h.interval + WORKING_SLACK_MINUTES;
      var age = (now.getTime() - out.checkedAt.getTime()) / 60000;
      if (report.state === 'Down') { out.processing = 'down'; out.reason = report.reason || 'Changes are not being processed.'; }
      else if (age > limit) { out.processing = 'down'; out.reason = 'The queue monitor has not reported since ' + CH.dates.ukTime(out.checkedAt) + '.'; }
      else out.processing = 'ok';
      // Administration changes go through their own flow: when only that one is behind, staff can carry on.
      if (report.admin === 'Down') { out.administration = 'down'; out.adminReason = report.adminReason || 'Administration changes are not being picked up.'; }
      // Notices and the register also have their own flow (4 Records).
      if (report.records === 'Down') { out.records = 'down'; out.recordsReason = report.recordsReason || 'Changes to notices and the register are not being picked up.'; }
      // and meetings (5 Meetings)
      if (report.meetings === 'Down') { out.meetings = 'down'; out.meetingsReason = report.meetingsReason || 'Meeting bookings and changes are not being picked up.'; }
    }
    var daily = value(rows, 'LastDailyRun');
    // the switches that fall back when Outlook invitations or PDF conversion cannot be used (Setup 1.3); Yes unless set to No
    out.invitesEnabled = value(rows, 'InvitesEnabled') !== 'No';
    out.pdfEnabled = value(rows, 'PdfEnabled') !== 'No';
    // before go-live (spec §7.4): what people create is marked as a test record, so it can be removed in one go
    out.testing = value(rows, 'PreGoLiveTesting') === 'Yes';
    if (daily) {
      out.lastDailyRun = new Date(daily);
      out.reminders = (now.getTime() - out.lastDailyRun.getTime()) / 3600000 > DAILY_LIMIT_HOURS ? 'stale' : 'ok';
    }
    return out;
  }

    // Meeting minutes are finished by 7 Minutes on weekdays 07:00-19:00 (UK). Outside those hours: a heads-up, or ''.
  function outOfHours(now) {
    var D = CH.dates, today = D.localDate(now), hhmm = D.ukTime(now);
    var day = new Date(today + 'T12:00:00Z').getUTCDay();
    var weekday = day >= 1 && day <= 5;
    if (weekday && hhmm >= '07:00' && hhmm < '19:00') return '';
    var when = weekday && hhmm < '07:00' ? 'from 07:00 today' : day === 5 || day === 6 || day === 0 ? 'from 07:00 on Monday' : 'from 07:00 tomorrow';
    return 'Out of hours: changes still show straight away, but finalised meeting minutes and their PDF are completed ' + when + '.';
  }

return { outOfHours: outOfHours, judge: judge, hours: hours };
})();
