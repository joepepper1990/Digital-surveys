// Local test of the Phase 0 probe against a fake Welcome context and fake SharePoint.
// Usage: node competency-hub/probe/test/run-probe-test.js <path-to-chromium>
// This is OFFLINE-SIMULATED evidence only; it proves nothing about the real site.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..');
const layout = fs.readFileSync(path.join(dir, 'CH_Probe_P0.html'), 'utf8');
const script = fs.readFileSync(path.join(dir, 'CH_Probe_P0.js'), 'utf8');
const chrome = process.argv[2];
let failures = 0;

function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failures++;
}

// Static checks on the Welcome layout contract.
const src = (layout.match(/<script\s+src="([^"]+)"/) || [])[1];
const exportsName = (layout.match(/data-exports="([^"]+)"/) || [])[1];
check('layout script src names the probe file', src === 'CH_Probe_P0.js');
check('data-exports matches the global the script defines', script.includes('window.' + exportsName + ' = function'));
check('no innerHTML, eval or new Function in the probe', !/innerHTML|\beval\(|new Function/.test(script));
check('no list writes in the probe (only contextinfo POST)', !/validateUpdateListItem|AddValidateUpdateItem|\/items\(/.test(script));

// Build a page from the layout template, with a fake Welcome context.
const inner = layout.split('<template id="layout">')[1].split('</template>')[0]
  .replace(/\.SCOPE /g, '.harness ')
  .replace(/<script[\s\S]*?<\/script>/, '');

const scenarios = {
  ok: {
    '/_api/web/currentuser': [200, { Id: 7, Title: 'Test Owner', Email: 'owner@example.test' }],
    '/_api/web?': [200, { Title: 'ESG Competency Hub', ServerRelativeUrl: '/sites/ESGCompetencyHub', WebTemplate: 'SITEPAGEPUBLISHING', Language: 2057 }],
    '/_api/web/effectiveBasePermissions': [200, { High: 0, Low: 0x7FFFFFFF }],
    '/_api/web/regionalsettings/timezone': [200, { Id: 2, Description: '(UTC+00:00) Dublin, Edinburgh, Lisbon, London' }],
    '/_api/web/regionalsettings?': [200, { LocaleId: 2057, Time24: true }],
    "getbytitle('Welcome Web Part - Custom Layouts')": [200, { Title: 'Welcome Web Part - Custom Layouts', ItemCount: 1 }],
    "getbytitle('Welcome Web Part - Errors')": [200, { Title: 'Welcome Web Part - Errors' }],
    'getbytitle(': [404, null],
    '/_api/contextinfo': [200, { FormDigestValue: 'digest' }]
  },
  wrongRegion: {
    '/_api/web/currentuser': [200, { Id: 9, Title: 'Visitor', Email: 'v@example.test' }],
    '/_api/web?': [200, { Title: 'Site', WebTemplate: 'SITEPAGEPUBLISHING', Language: 1033 }],
    '/_api/web/effectiveBasePermissions': [200, { High: 0, Low: 0x1 }],
    '/_api/web/regionalsettings/timezone': [200, { Id: 13, Description: '(UTC-08:00) Pacific Time' }],
    '/_api/web/regionalsettings?': [200, { LocaleId: 1033 }],
    "getbytitle('Welcome Web Part - Errors')": [403, null],
    'getbytitle(': [404, null],
    '/_api/contextinfo': [200, { FormDigestValue: 'digest' }]
  },
  noUser: {
    '/_api/web/currentuser': [401, null]
  }
};

function page(scenario) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="harness">${inner}</div>
<script>
const routes = ${JSON.stringify(scenarios[scenario])};
function respond(url) {
  const key = Object.keys(routes).find(k => url.includes(k));
  const [status, body] = key ? routes[key] : [500, null];
  return Promise.resolve({ status, text: () => Promise.resolve(body ? JSON.stringify(body) : '') });
}
function FakeClient() {}
FakeClient.configurations = { v1: {} };
FakeClient.prototype.get = function (url) { return respond(url); };
FakeClient.prototype.post = function (url) { return respond(url); };
const ctx = { getWebPart: () => ({ spHttpClient: new FakeClient(), pageContext: { web: { absoluteUrl: 'https://tenant.example/sites/ESGCompetencyHub' } } }) };
</script>
<script>${script}</script>
<script>
const api = window.ESGCompetencyHubProbeP0(ctx);
api.onInitialize();
setTimeout(() => { const out = document.createElement('pre'); out.id = 'out'; out.textContent = document.querySelector('textarea').value; document.body.appendChild(out); }, 800);
</script></body></html>`;
}

function run(scenario) {
  const file = path.join(require('os').tmpdir(), 'ch-probe-' + scenario + '.html');
  fs.writeFileSync(file, page(scenario));
  const dom = execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu',
    '--virtual-time-budget=3000', '--dump-dom', 'file://' + file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  fs.unlinkSync(file);
  const text = (dom.match(/<pre id="out">([\s\S]*?)<\/pre>/) || [])[1] || '';
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const ok = run('ok');
['C1', 'C2', 'C3', 'C5', 'C6', 'C7', 'C8', 'C10'].forEach(id =>
  check('ok site: ' + id + ' passes', new RegExp('^' + id + ' \\| PASS', 'm').test(ok)));
check('ok site: C9 reports no Hub lists', /^C9 \| NOTE .*None found/m.test(ok));
check('ok site: results are redacted', ok.includes('<EMAIL>') && !ok.includes('owner@example.test'));

const wrong = run('wrongRegion');
check('wrong region: C5 fails', /^C5 \| FAIL/m.test(wrong));
check('wrong region: missing errors-list access fails C8', /^C8 \| FAIL \| DENIED/m.test(wrong));
check('wrong region: non-owner reported', /^C4 \| NOTE .*Not a site owner/m.test(wrong));

const noUser = run('noUser');
check('no user: C2 fails and the probe stops', /^C2 \| FAIL/m.test(noUser) && !/^C3 /m.test(noUser));

console.log(failures ? failures + ' check(s) failed' : 'All checks passed');
process.exit(failures ? 1 : 0);
