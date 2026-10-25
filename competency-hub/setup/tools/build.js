// Builds the Setup layout and script, with the schema embedded so nothing else is fetched.
//   node setup/tools/build.js          write setup/dist and setup/mock/index.html
//   node setup/tools/build.js --check  fail if the outputs are stale
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SCHEMA = path.join(ROOT, '..', '04-solution', 'schema', 'schema.json');
const MODULES = ['src/rest.js', 'src/engine.js', 'src/ui.js'];
// The Setup version, shown on the page and in the log, so an old copy left in the browser is plain to see.
const SETUP_VERSION = '1.4.3';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function build() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  const js = [
    '/* ESG Competency Hub Setup ' + SETUP_VERSION + ', schema ' + schema.schemaVersion + ' – built by setup/tools/build.js. Do not edit. */',
    'window.ESGCompetencyHubSetup = function (ctx) {',
    "  'use strict';",
    '  var CHS = { version: ' + JSON.stringify(SETUP_VERSION) + ' };',
    '  CHS.schema = ' + JSON.stringify(schema) + ';',
    MODULES.map((m) => '  /* ' + m + ' */\n' + read(m).split('\n').map((l) => l ? '  ' + l : l).join('\n')).join('\n'),
    '  var started = false;',
    '  return {',
    '    onInitialize: function () {',
    '      if (started) return;',
    '      started = true;',
    '      var tries = 0;',
    "      (function wait() { if (document.querySelector('[data-chs-root]')) CHS.ui.start(ctx, CHS.schema); else if (++tries < 50) setTimeout(wait, 100); })();",
    '    },',
    "    onError: function (e) { if (window.console) console.error('Competency Hub Setup: Welcome error', e); },",
    '    onDispose: function () {}',
    '  };',
    '};',
    ''
  ].join('\n');
  const layout = read('layout/setup.layout.html');
  const style = layout.split('<style>')[1].split('</style>')[0].split('.SCOPE').join('.mock-scope');
  const inner = layout.split('</style>')[1].split('<script')[0];
  const mock = ['<!doctype html>', '<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Competency Hub Setup – local test</title><style>body{margin:16px;background:#f3f6f8;font-family:Segoe UI,sans-serif}' + style + '</style></head><body>',
    '<p style="background:#222;color:#fff;padding:6px 10px;font-size:13px">Local test with a simulated SharePoint site – nothing real is changed. Add ?scenario=notOwner, membersShare, wrongRegion or withHubPage to try other cases.</p>',
    '<div class="mock-scope">' + inner + '</div>',
    '<script src="mock-admin.js"></script>', '<script src="../dist/CH_Setup.js"></script>',
    '<script>var params = new URLSearchParams(location.search); var site = MockAdmin.create(params.get("scenario") || ""); window.ESGCompetencyHubSetup(site.ctx).onInitialize(); window.mockSite = site;',
    // ?auto=check or ?auto=apply presses the buttons, for the headless browser test.
    '(function () { var auto = params.get("auto"); if (!auto) return; setTimeout(function () {',
    '  document.getElementById("chs-confirm").checked = true;',
    '  var buttons = document.querySelectorAll(".chs .btn");',
    '  if (auto === "check") { buttons[0].click(); return; }',
    '  var typed = document.getElementById("chs-typed"); typed.value = "SETUP"; typed.dispatchEvent(new Event("input")); buttons[1].click();',
    '}, 300); })();</script>',
    '</body></html>', ''].join('\n');
  const manifest = JSON.stringify({ product: 'ESG Competency Hub Setup', version: SETUP_VERSION, schemaVersion: schema.schemaVersion,
    outputs: { 'CH_Setup.js': sha256(js), 'CH_Setup.html': sha256(layout) } }, null, 2) + '\n';
  return { 'dist/CH_Setup.js': js, 'dist/CH_Setup.html': layout, 'dist/BUILD_MANIFEST.json': manifest, 'mock/index.html': mock };
}

if (require.main === module) {
  const files = build();
  if (process.argv.includes('--check')) {
    const stale = Object.keys(files).filter((f) => !fs.existsSync(path.join(ROOT, f)) || read(f) !== files[f]);
    if (stale.length) { console.error('Stale: ' + stale.join(', ') + '. Run node setup/tools/build.js'); process.exit(1); }
    console.log('Setup build output is up to date.');
  } else {
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    Object.keys(files).forEach((f) => fs.writeFileSync(path.join(ROOT, f), files[f]));
    console.log('Built ' + Object.keys(files).join(', '));
  }
}
module.exports = { MODULES, SCHEMA };
