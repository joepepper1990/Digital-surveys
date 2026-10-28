// How far a change has got, and about how long is left (app 1.3.1).
//
// The flows do not report their steps, so the page can see three stages for a change: sent (the request was written),
// picked up (the request reads Processing on a check, made every 15 seconds), and saved (confirmed on the record).
// The time left is an estimate from how long this person's recent changes of the same kind took, kept in the
// browser; before any are known, the figures the flows were measured at. It is always "about", and the ring never
// fills until the change is really confirmed.
CH.eta = (function () {
  var KEY = 'esg-competency-hub-timings';
  var KEEP = 12;             // samples kept per kind
  var CAP = 0.92;            // the ring stops here until the change is confirmed
  var SOON = 8;              // seconds: "any moment now"
  var LATE = 1.5;            // × the expected time: "taking a little longer than usual"

  // seconds: [pick-up, work] measured on the site on 28 October 2026 (Administration → How long changes take)
  var DEFAULTS = {
    RaiseAction: [30, 25], ScheduleMeeting: [30, 30], StartMeeting: [30, 60], FinaliseMeeting: [30, 90], AmendMeeting: [30, 60],
    RaiseRegisterEntry: [30, 25], EditNotice: [30, 25], ArchiveNotice: [30, 25], PinNotice: [30, 25], HideComment: [30, 25],
    UpdateRegisterEntry: [30, 25], LinkActionToEntry: [30, 25], UnlinkActionFromEntry: [30, 25],
    '*': [30, 20]
  };

  function readAll() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || 'null') || {}; } catch (_) { return {}; }
  }
  function writeAll(all) {
    try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* not remembered */ }
  }

  function median(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // What is expected for a kind of change: { pickup, work, total, learned } in seconds.
  // Live samples (pick-up and work seen by this browser) count first; totals read back from the person's own
  // finished requests next; the measured defaults last.
  function expected(type) {
    var d = DEFAULTS[type] || DEFAULTS['*'];
    var mine = readAll()[type] || {};
    var pickup = median(mine.pickup || []), work = median(mine.work || []), total = median(mine.total || []);
    if (pickup !== null && work !== null) return { pickup: pickup, work: work, total: pickup + work, learned: true };
    if (total !== null) {
      // only totals are known: split them in the defaults' proportion
      var share = d[0] / (d[0] + d[1]);
      return { pickup: total * share, work: total * (1 - share), total: total, learned: true };
    }
    return { pickup: d[0], work: d[1], total: d[0] + d[1], learned: false };
  }

  // Remember how long a finished change took. processingAt is when Processing was first seen (null when the change
  // was already finished on the first look); doneAt when it was confirmed.
  function learn(type, sentAt, processingAt, doneAt) {
    if (!type || !sentAt || !doneAt || doneAt < sentAt) return;
    var all = readAll();
    var mine = all[type] = all[type] || { pickup: [], work: [], total: [] };
    var total = (doneAt - sentAt) / 1000;
    push(mine.total, total);
    if (processingAt && processingAt >= sentAt && processingAt <= doneAt) {
      push(mine.pickup, (processingAt - sentAt) / 1000);
      push(mine.work, (doneAt - processingAt) / 1000);
    }
    writeAll(all);
  }
  function push(list, value) { list.push(Math.round(value)); while (list.length > KEEP) list.shift(); }

  // Totals read back from the person's finished requests (seeding a fresh browser): rows with RequestType, Created,
  // ProcessedAt. Only kinds with no live samples yet are seeded.
  function seed(rows) {
    var all = readAll(), changed = false;
    (rows || []).forEach(function (r) {
      var sent = Date.parse(r.Created), done = Date.parse(r.ProcessedAt);
      if (!r.RequestType || isNaN(sent) || isNaN(done) || done < sent) return;
      var mine = all[r.RequestType] = all[r.RequestType] || { pickup: [], work: [], total: [] };
      if (mine.pickup.length || mine.seeded) return;
      push(mine.total, (done - sent) / 1000);
      changed = true;
    });
    Object.keys(all).forEach(function (t) { if (all[t].total.length && !all[t].pickup.length) all[t].seeded = true; });
    if (changed) writeAll(all);
  }

  // eased progress through a stage: quick at first, slowing towards the end, never quite there
  function ease(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 2); }

  // How far a change has got. entry: { type, submittedAt (Date), processingAt?, doneAt?, state }. Returns
  // { stage: 'pickup' | 'work' | 'late' | 'done', fraction (0–1), seconds (left, or null), expected, learned }.
  function remaining(entry, now) {
    now = now || Date.now();
    var exp = expected(entry.type);
    if (entry.state === 'done') return { stage: 'done', fraction: 1, seconds: 0, expected: exp.total, learned: exp.learned };
    var sent = entry.submittedAt ? entry.submittedAt.getTime() : now;
    var elapsed = Math.max(0, (now - sent) / 1000);
    var pickupShare = exp.pickup / exp.total;
    var fraction, left;
    if (entry.processingAt) {
      var working = Math.max(0, (now - entry.processingAt) / 1000);
      fraction = pickupShare + (1 - pickupShare) * ease(working / exp.work);
      left = exp.work - working;
    } else {
      fraction = pickupShare * ease(elapsed / exp.pickup);
      left = exp.total - elapsed;
    }
    fraction = Math.min(CAP, fraction);
    var late = elapsed > exp.total * LATE;
    return { stage: late ? 'late' : entry.processingAt ? 'work' : 'pickup', fraction: fraction,
      seconds: late ? null : Math.max(0, Math.round(left / 5) * 5), expected: exp.total, learned: exp.learned };
  }

  function about(seconds) { return 'about ' + (seconds >= 90 ? Math.round(seconds / 30) / 2 + ' min' : Math.round(seconds) + ' s'); }

  // The words for a stage. Short: for a card ("about 40 s"); otherwise the stage as well.
  function words(r, short) {
    if (r.stage === 'done') return 'Saved';
    if (r.stage === 'queued') return short ? 'in turn' : 'Waiting its turn: it is sent as soon as the change before it is saved.';
    if (r.stage === 'late') return short ? 'a little longer' : 'Taking a little longer than usual – usually ' + about(r.expected) + ', but it will be saved.';
    if (r.seconds !== null && r.seconds <= SOON) return short ? 'any moment' : 'Any moment now.';
    var time = (r.learned ? '' : 'usually ') + about(r.seconds);
    if (short) return time;
    return (r.stage === 'work' ? 'Being recorded · ' : 'Waiting to be picked up · ') + time;
  }

  return { expected: expected, learn: learn, seed: seed, remaining: remaining, words: words, median: median, DEFAULTS: DEFAULTS, KEY: KEY, CAP: CAP };
})();
