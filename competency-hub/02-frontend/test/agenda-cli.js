// Runs the app's agenda rules (domain/agenda.js) on JSON from standard input and prints the agenda as JSON.
// Used by 04-solution/tools/test_meetings.py to check that the app's preview and the Meetings flow agree.
'use strict';
const { loadApp } = require('./load.js');
const CH = loadApp();
let text = '';
process.stdin.on('data', (d) => { text += d; });
process.stdin.on('end', () => {
  const out = CH.agenda.build(JSON.parse(text)).map((x) => [x.section, x.sourceType, x.sourceId, x.marker]);
  process.stdout.write(JSON.stringify(out));
});
