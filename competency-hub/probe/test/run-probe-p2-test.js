// Local test of the Release 2 permission probe against a fake Welcome context and a fake SharePoint.
// Usage: node competency-hub/probe/test/run-probe-p2-test.js <path-to-chromium>
// This is OFFLINE-SIMULATED evidence only; it proves nothing about the real site.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..');
const layout = fs.readFileSync(path.join(dir, 'CH_Probe_P2.html'), 'utf8');
const script = fs.readFileSync(path.join(dir, 'CH_Probe_P2.js'), 'utf8');
const chrome = process.argv[2] || '/opt/pw-browsers/chromium';
let failures = 0;

function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
  if (!ok) failures++;
}

const src = (layout.match(/<script\s+src="([^"]+)"/) || [])[1];
const exportsName = (layout.match(/data-exports="([^"]+)"/) || [])[1];
check('layout script src names the probe file', src === 'CH_Probe_P2.js');
check('data-exports matches the global the script defines', script.includes('window.' + exportsName + ' = function'));
check('no innerHTML, eval or new Function in the probe', !/innerHTML|\beval\(|new Function/.test(script));
check('no tenant address or real email domain in the probe', !/edfenergy|edf-energy/i.test(script + layout));

const inner = layout.split('<template id="layout">')[1].split('</template>')[0]
  .replace(/\.SCOPE /g, '.harness ')
  .replace(/<script[\s\S]*?<\/script>/, '');

// The fake site. "site" options: owner (the runner can manage permissions), leaky (lists that should be closed are
// open and notices can be edited), and the default, a correctly secured site.
function fakeSite(opts) {
  return `
const OPTS = ${JSON.stringify(opts)};
const ME = 140;
const requests = {};
function json(status, body) { return Promise.resolve({ status, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)) }); }
function fields(id) { return { value: [{ FieldName: 'Title', HasException: false }, { FieldName: 'Id', FieldValue: String(id), HasException: false }] }; }
function respond(method, url, body) {
  const b = body ? JSON.parse(body) : null;
  if (url.endsWith('/_api/contextinfo')) return json(200, { FormDigestValue: 'digest' });
  if (url.includes('/_api/web/currentuser')) return json(200, { Id: ME, Title: 'Test Technician', Email: 'test.tech@example.test' });
  if (url.includes('effectiveBasePermissions')) return json(200, { High: 0, Low: OPTS.owner ? 0x7FFFFFFF : 0x1 });
  if (url.includes("getbytitle('People')") && url.includes('SiteUserId eq')) return json(200, { value: [{ Id: 30, Title: 'Test Technician', Role: 'Technician', Status: 'Active', CanPostNotices: true, SiteUserId: ME }] });
  if (url.includes("getbytitle('People')")) return json(200, { value: [
    { SiteUserId: ME, Title: 'Test Technician', Role: 'Technician', IsAdministrator: false, Status: 'Active' },
    { SiteUserId: 126, Title: 'Admin Person', Role: 'Team Leader', IsAdministrator: true, Status: 'Active', Email: 'admin.person@example.test' }] });
  if (url.includes("getbytitle('Competencies')")) return json(200, { value: [{ Id: 1, CompetencyKey: 'FLK', Status: 'Active' }, { Id: 3, CompetencyKey: 'GRS', Status: 'Active' }, { Id: 10, CompetencyKey: 'RW', Status: 'Active' }] });
  if (url.includes("getbytitle('Competency Members')")) return json(200, { value: [{ CompetencyId: 1, CanManageMeetings: false, Status: 'Active' }, { CompetencyId: 3, CanManageMeetings: true, Status: 'Active' }] });
  if (method === 'GET' && url.includes("getbytitle('Feedback')")) return OPTS.leaky ? json(200, { value: [{ Id: 1 }] }) : json(403);
  if (method === 'GET' && url.includes("getbytitle('Notification Log')")) return json(403);
  if (method === 'GET' && url.includes("getbytitle('History')")) return json(200, { value: [] });
  if (method === 'GET' && url.includes("getbytitle('Actions')")) return json(200, { value: [{ Id: 1 }] });
  if (method === 'GET' && url.includes("getbytitle('Requests')") && url.includes('RequestKey eq')) {
    const key = decodeURIComponent(url).match(/RequestKey eq '([^']+)'/)[1];
    const area = requests[key];
    return json(200, { value: [area === 'GRS' ? { Status: 'Completed', ResultMessage: 'ACT-00099 raised.' }
      : { Status: 'Rejected', ResultMessage: 'As a technician you can raise actions for yourself in this area. Ask an engineer, or someone who runs meetings in this area, to raise it for someone else.' }] });
  }
  if (method === 'GET' && url.includes("getbytitle('Requests')")) return json(200, { value: [{ Id: 5, AuthorId: ME }] });
  if (method === 'GET' && url.includes("getbytitle('Noticeboard')/items(55)")) return json(200, { AuthorId: ME });
  if (url.includes('/ValidateUpdateListItem')) return OPTS.leaky ? json(200, { value: [{ FieldName: 'Title', HasException: false }] }) : json(403);
  if (url.includes('/recycle')) return json(403);
  if (url.includes('AddValidateUpdateItemUsingPath')) {
    const folder = b.listItemCreateInfo.FolderPath.DecodedUrl;
    if (folder.includes('/Lists/Noticeboard/')) return json(200, fields(55));
    if (folder.endsWith('/Lists/Requests/u' + ME)) {
      const v = {}; b.formValues.forEach(f => { v[f.FieldName] = f.FieldValue; });
      requests[v.RequestKey] = JSON.parse(v.Payload).areaKey;
      return json(200, fields(77));
    }
    return json(403);
  }
  return json(500);
}`;
}

function page(opts, writes) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="harness">${inner}</div>
<script>
${fakeSite(opts)}
function FakeClient() {}
FakeClient.configurations = { v1: {} };
FakeClient.prototype.get = function (url, c, o) { return respond('GET', url, null); };
FakeClient.prototype.post = function (url, c, o) { return respond('POST', url, o && o.body); };
const ctx = { getWebPart: () => ({ spHttpClient: new FakeClient(), pageContext: { web: { absoluteUrl: 'https://tenant.example/sites/ESGCompetencyHub' } } }) };
</script>
<script>${script}</script>
<script>
const api = window.ESGCompetencyHubProbeP2(ctx);
api.onInitialize();
const buttons = document.querySelectorAll('[data-chprobe2-controls] button');
buttons[${writes ? 1 : 0}].click();
(function finish() {
  if (!/Finished/.test(document.querySelector('[data-chprobe2-status]').textContent)) { setTimeout(finish, 1000); return; }
  const out = document.createElement('pre'); out.id = 'out'; out.textContent = document.querySelector('textarea').value; document.body.appendChild(out);
})();
</script></body></html>`;
}

function run(name, opts, writes) {
  const file = path.join(require('os').tmpdir(), 'ch-probe2-' + name + '.html');
  fs.writeFileSync(file, page(opts, writes));
  const dom = execFileSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu',
    '--virtual-time-budget=900000', '--dump-dom', 'file://' + file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  fs.unlinkSync(file);
  const text = (dom.match(/<pre id="out">([\s\S]*?)<\/pre>/) || [])[1] || '';
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
const line = (out, id) => (out.match(new RegExp('^' + id + ' \\| .*$', 'm')) || [''])[0];

const reads = run('reads', {}, false);
['R1', 'R2', 'R3', 'R4', 'R5'].forEach(id => check('secured site, read checks: ' + id + ' passes', /\| PASS \|/.test(line(reads, id)), line(reads, id)));
check('read checks make no writes', !/^(W|N|T)\d/m.test(reads), reads);

const writes = run('writes', {}, true);
['W1', 'W2', 'W3', 'W4', 'W5', 'N1', 'N2', 'N3', 'N4'].forEach(id => check('secured site, write checks: ' + id + ' passes', /\| PASS \|/.test(line(writes, id)), line(writes, id)));
check('technician raising for someone else without meeting rights is refused by the flow (T1)', /^T1 \| PASS \| Rejected/m.test(writes), line(writes, 'T1'));
check('raising for someone else where meeting rights are held is accepted (T2)', /^T2 \| PASS \| Completed/m.test(writes), line(writes, 'T2'));

check('results carry no names, email addresses or site address', !/example\.test|Test Technician|tenant\.example/.test(reads + writes), reads);

const leaky = run('leaky', { leaky: true }, true);
check('open feedback list is reported as a failure', /^R1 \| FAIL/m.test(leaky), line(leaky, 'R1'));
check('an editable notice is reported as a failure', /^N3 \| FAIL/m.test(leaky), line(leaky, 'N3'));

const owner = run('owner', { owner: true }, true);
check('a site owner is stopped before any check runs', /^P0 \| FAIL \| OWNER/m.test(owner) && !/^R1 /m.test(owner) && !/^W1 /m.test(owner), owner);

console.log(failures ? failures + ' check(s) failed' : 'All checks passed');
process.exit(failures ? 1 : 0);
