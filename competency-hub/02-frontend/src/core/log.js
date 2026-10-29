// What the Hub noticed going wrong on this screen (1.4.0): a list SharePoint could not give, the page started a
// second time, an error in the page itself. Kept in this browser only (the last 50, at most one of a kind a
// minute), shown under Administration and sent with feedback when the person agrees, so a report of a glitch comes
// with the evidence.
CH.log = (function () {
  var KEY = 'esg-competency-hub-log';
  var KEEP = 50;
  var QUIET_MS = 60 * 1000;
  var lastOf = {};

  function read() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]') || []; } catch (_) { return []; }
  }
  function write(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* not remembered */ }
  }

  function note(kind, text) {
    var now = Date.now();
    if (lastOf[kind] && now - lastOf[kind] < QUIET_MS) return;
    lastOf[kind] = now;
    var list = read();
    list.push({ at: new Date(now).toISOString(), kind: String(kind).slice(0, 40), text: String(text || '').slice(0, 300) });
    while (list.length > KEEP) list.shift();
    write(list);
  }

  // the newest first, within the last days given
  function recent(days) {
    var since = Date.now() - (days || 7) * 86400000;
    return read().filter(function (e) { return Date.parse(e.at) >= since; }).reverse();
  }

  function asText(days) {
    return recent(days).map(function (e) { return e.at.slice(0, 16).replace('T', ' ') + ' ' + e.kind + ': ' + e.text; }).join('\n');
  }

  return { note: note, recent: recent, asText: asText, KEY: KEY };
})();
