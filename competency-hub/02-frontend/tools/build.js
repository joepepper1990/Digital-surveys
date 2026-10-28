// Builds the Welcome layout and script from src/ and styles/. No bundler, no dependencies.
//   node tools/build.js          write dist/ and mock/index.html
//   node tools/build.js --check  fail if the committed outputs are stale
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const MODULES = [
  'src/core/config.js', 'src/core/dom.js', 'src/core/names.js', 'src/core/dates.js', 'src/core/sp.js', 'src/core/requests.js',
  'src/domain/access.js', 'src/domain/rules.js', 'src/domain/model.js', 'src/domain/optimistic.js', 'src/domain/health.js', 'src/domain/eta.js', 'src/domain/agenda.js',
  'src/ui/components.js', 'src/ui/dialog.js',
  'src/views/home.js', 'src/views/area.js', 'src/views/notice-form.js', 'src/views/raise-form.js', 'src/views/action-panel.js', 'src/views/my-actions.js', 'src/views/people.js', 'src/views/record-panel.js', 'src/views/entry-form.js', 'src/views/feedback.js', 'src/views/settings.js',
  'src/views/dashboard.js', 'src/views/meeting-form.js', 'src/views/meeting-panel.js', 'src/views/cleanup.js', 'src/views/admin.js',
  'src/app.js'
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Prefix every selector with the Welcome scope. Handles @media blocks; nothing else is needed here.
function scopeCss(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith('@media')) {
      out += head + ' {\n' + scopeCss(body, scope) + '}\n';
    } else {
      const selectors = head.split(',').map((s) => s.trim()).map((s) =>
        s === '.ch' || s.startsWith('.ch.') ? scope + ' ' + s : s === '*' ? scope + ' .ch *' : scope + ' .ch ' + s);
      out += selectors.join(', ') + ' {' + body.trim().replace(/\s+/g, ' ') + '}\n';
    }
    i = j;
  }
  return out;
}

// The lists that can pass SharePoint's list view threshold (plan D.4), and their indexed columns (schema.json).
const BIG_LISTS = ['actions', 'history', 'updates', 'meetingItems', 'notifications', 'requests'];
function bigListIndexes() {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '04-solution', 'schema', 'schema.json'), 'utf8'));
  const out = {};
  schema.lists.filter((l) => BIG_LISTS.includes(l.key)).forEach((l) => {
    const cols = l.fields.concat(l.standard ? schema.standardColumns : []).filter((f) => f.indexed).map((f) => f.name);
    out[l.title] = cols;
  });
  return out;
}

function build() {
  const pkgVersion = /VERSION: '([^']+)'/.exec(read('src/core/config.js'))[1];
  const js = [
    '/* ESG Competency Hub ' + pkgVersion + ' – built from src/ by tools/build.js. Do not edit. */',
    'window.ESGCompetencyHub = function (ctx) {',
    "  'use strict';",
    '  var CH = {};',
    MODULES.map((m) => '  /* ' + m + ' */\n' + read(m).split('\n').map((l) => l ? '  ' + l : l).join('\n')).join('\n'),
    '  return CH.app.create(ctx);',
    '};',
    ''
  ].join('\n');

  const css = scopeCss(read('styles/app.css'), '.SCOPE');
  const layout = read('layout/competency-hub.layout.html').replace('/*CSS*/', css).replace('/*VERSION*/', pkgVersion);

  const mockCss = css.split('.SCOPE').join('.mock-scope');
  const mock = [
    '<!doctype html>',
    '<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Competency Hub – local test</title>',
    '<style>body{margin:0;background:#f3f6f8} .mock-bar{font:13px Segoe UI,sans-serif;background:#222;color:#fff;padding:6px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
    '.mock-bar select{font:inherit}',
    mockCss,
    '</style></head><body>',
    '<div class="mock-bar"><b>Local test with simulated SharePoint – synthetic data only</b><label>Sign in as <select id="mock-user"></select></label>',
    '<label>Simulate <select id="mock-mode"><option value="">Normal</option><option value="slow">Slow responses</option>' +
      '<option value="people403">People list denied (403)</option><option value="actions404">Actions list missing (404)</option>' +
      '<option value="actionsPartial">Actions over the read limit</option><option value="unknown">Unknown user</option>' +
      '<option value="duplicate">Duplicate person</option><option value="left">Person marked Left</option><option value="flowStages">Request flow in slow stages</option><option value="flowSlow">Request flow very slow</option>' +
      '<option value="flowFail">Request flow fails</option><option value="limited">Processing down (limited mode)</option>' +
      '<option value="attention">Changes needing attention</option></select></label></div>',
    '<div class="mock-scope"><div class="ch" data-ch-root data-ch-version="' + pkgVersion + '"><p>Loading the ESG Competency Hub…</p></div></div>',
    '<script src="seed.js"></script>',
    '<script src="rules.js"></script>',
    '<script src="flow-sim.js"></script>',
    '<script src="mock-sharepoint.js"></script>',
    '<script src="drivers.js"></script>',
    '<script src="../dist/competency-hub.js"></script>',
    '<script>MockSharePoint.start();</script>',
    '</body></html>',
    ''
  ].join('\n');

  const manifest = JSON.stringify({
    product: 'ESG Competency Hub',
    version: pkgVersion,
    outputs: { 'competency-hub.js': sha256(js), 'competency-hub.html': sha256(layout) },
    sources: Object.fromEntries(MODULES.concat(['styles/app.css', 'layout/competency-hub.layout.html']).map((m) => [m, sha256(read(m))]))
  }, null, 2) + '\n';

  // The simulated request flow in the mock applies the same rules as the app (plan K7.3).
  const rules = ['/* Built by tools/build.js from src/core/config.js, dates.js, domain/rules.js and agenda.js for the mock. Do not edit. */',
    'window.MockRules = (function () {', "  'use strict';", '  var CH = {};',
    ['src/core/config.js', 'src/core/dates.js', 'src/domain/rules.js', 'src/domain/agenda.js'].map((m) => read(m).split('\n').map((l) => l ? '  ' + l : l).join('\n')).join('\n'),
    '  return { config: CH.config, dates: CH.dates, rules: CH.rules, agenda: CH.agenda };', '})();',
    // the indexed columns of the lists that can pass the list view threshold, from the schema Setup builds
    'window.MockIndexes = ' + JSON.stringify(bigListIndexes()) + ';', ''].join('\n');

  return { 'dist/competency-hub.js': js, 'dist/competency-hub.html': layout, 'dist/BUILD_MANIFEST.json': manifest, 'mock/index.html': mock, 'mock/rules.js': rules };
}

const files = require.main === module ? build() : null;
if (!files) {
  // Loaded by the tests for MODULES and scopeCss only.
} else if (process.argv.includes('--check')) {
  const stale = Object.keys(files).filter((f) => !fs.existsSync(path.join(ROOT, f)) || read(f) !== files[f]);
  if (stale.length) { console.error('Stale build output: ' + stale.join(', ') + '. Run node tools/build.js'); process.exit(1); }
  console.log('Build output is up to date.');
} else {
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  Object.keys(files).forEach((f) => fs.writeFileSync(path.join(ROOT, f), files[f]));
  console.log('Built ' + Object.keys(files).join(', '));
}

module.exports = { MODULES, scopeCss };
