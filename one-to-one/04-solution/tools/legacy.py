"""Legacy (non-solution) packages – the fallback when the environment has no Dataverse, so solutions can't be imported.

Legacy packages cannot carry environment variables, so the site URL and Team Leader email have to be written into
the flows as literal values. To keep tenant details out of the repository, build.py only produces *templates*
(with __ESG_SITE_URL__ / __ESG_TL_EMAIL__ tokens) inside legacy-package-builder.html; that page fills them in and
zips the six packages in the browser, offline.

Package layout copied from real exported legacy packages (Microsoft PnP samples):
  manifest.json
  Microsoft.Flow/flows/manifest.json
  Microsoft.Flow/flows/<resource id>/definition.json | apisMap.json | connectionsMap.json
"""
import copy
import json
import uuid

from flows import ENV_SITE, ENV_MAIL

SITE_TOKEN = '__ESG_SITE_URL__'
MAIL_TOKEN = '__ESG_TL_EMAIL__'
API = {
    'shared_sharepointonline': ('SharePoint', 'https://connectoricons-prod.azureedge.net/releases/v1.0.1578/1.0.1578.2813/sharepointonline/icon.png'),
    'shared_office365': ('Office 365 Outlook', 'https://connectoricons-prod.azureedge.net/releases/v1.0.1464/1.0.1464.2404/office365/icon.png'),
    'shared_office365users': ('Office 365 Users', 'https://connectoricons-prod.azureedge.net/releases/v1.0.1464/1.0.1464.2404/office365users/icon.png'),
}
NS = uuid.UUID('9b3f6a1e-3c1d-4f65-8f0a-1e2d3c4b5a69')


def stable(*parts):
    return str(uuid.uuid5(NS, '/'.join(parts)))


def literalise(defn):
    """Replace the environment-variable parameters with literal tokens (as whole values and inside expressions)."""
    d = copy.deepcopy(defn)
    for p in (ENV_SITE, ENV_MAIL):
        d['parameters'].pop(p, None)
    swaps = [("@parameters('{0}')".format(ENV_SITE), SITE_TOKEN), ("@parameters('{0}')".format(ENV_MAIL), MAIL_TOKEN)]
    inner = [("parameters('{0}')".format(ENV_SITE), "'" + SITE_TOKEN + "'"), ("parameters('{0}')".format(ENV_MAIL), "'" + MAIL_TOKEN + "'")]

    def walk(v):
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, str):
            for a, b in swaps:
                if v == a:
                    return b
            for a, b in inner:
                v = v.replace(a, b)
            return v
        return v
    d = walk(d)
    s = json.dumps(d)
    assert 'esg_SiteUrl' not in s and 'esg_ManagerEmail' not in s, 'environment variable left in legacy definition'
    return d


def package_files(flow):
    """Files for one legacy package (as {path: text}), with tokens still in place."""
    rid = stable(flow['id'], 'resource')
    defn = literalise(flow['json']['properties']['definition'])
    refs, apis_map, conns_map, resources = {}, {}, {}, {}
    deps = []
    for c in flow['connectors']:
        disp, icon = API[c]
        api_id, conn_id = stable(c, 'api'), stable(flow['id'], c, 'connection')
        refs[c] = {'connectionName': 'shared-' + c[7:20] + '-' + stable(flow['id'], c, 'name'), 'source': 'Embedded',
                   'id': '/providers/Microsoft.PowerApps/apis/' + c, 'tier': 'NotSpecified'}
        apis_map[c], conns_map[c] = api_id, conn_id
        resources[api_id] = {'id': '/providers/Microsoft.PowerApps/apis/' + c, 'name': c, 'type': 'Microsoft.PowerApps/apis',
                             'suggestedCreationType': 'Existing', 'details': {'displayName': disp, 'iconUri': icon},
                             'configurableBy': 'System', 'hierarchy': 'Child', 'dependsOn': []}
        resources[conn_id] = {'type': 'Microsoft.PowerApps/apis/connections', 'suggestedCreationType': 'Existing',
                              'creationType': 'Existing', 'details': {'displayName': disp + ' connection', 'iconUri': icon},
                              'configurableBy': 'User', 'hierarchy': 'Child', 'dependsOn': [api_id]}
        deps += [api_id, conn_id]
    manifest = {'schema': '1.0',
                'details': {'displayName': flow['name'], 'description': flow['description'], 'createdTime': '2026-10-14T00:00:00.0000000Z',
                            'packageTelemetryId': stable(flow['id'], 'telemetry'), 'creator': 'N/A', 'sourceEnvironment': ''},
                'resources': dict({rid: {'type': 'Microsoft.Flow/flows', 'suggestedCreationType': 'New', 'creationType': 'Existing, New, Update',
                                         'details': {'displayName': flow['name']}, 'configurableBy': 'User', 'hierarchy': 'Root',
                                         'dependsOn': deps}}, **resources)}
    name = stable(flow['id'], 'flow')
    definition = {'name': name, 'id': '/providers/Microsoft.Flow/flows/' + name, 'type': 'Microsoft.Flow/flows',
                  'properties': {'apiId': '/providers/Microsoft.PowerApps/apis/shared_logicflows', 'displayName': flow['name'],
                                 'definition': defn, 'connectionReferences': refs, 'flowFailureAlertSubscribed': False, 'isManaged': False}}
    base = 'Microsoft.Flow/flows/' + rid + '/'
    return {
        'manifest.json': json.dumps(manifest, indent=2),
        'Microsoft.Flow/flows/manifest.json': json.dumps({'packageSchemaVersion': '1.0', 'flowAssets': {'assetPaths': [rid]}}),
        base + 'definition.json': json.dumps(definition, ensure_ascii=False),
        base + 'apisMap.json': json.dumps(apis_map),
        base + 'connectionsMap.json': json.dumps(conns_map),
    }


def fill(text, site, email):
    """What the builder page does: put the real values in (JSON-safe; inputs are validated to contain no quotes)."""
    return text.replace(SITE_TOKEN, site).replace(MAIL_TOKEN, email)


def zip_name(flow):
    return 'ESG-1to1-' + flow['name'].split('|')[1].strip().split(' ')[0] + '-legacy.zip'


BUILDER_HTML = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESG 1-to-1 legacy packages</title>
<!-- GENERATED by 04-solution/tools/build.py – do not edit by hand. Works offline; nothing is sent anywhere. -->
<style>
  :root { --navy: #13516b; --line: #d7dee4; --muted: #5b6b77; }
  body { margin: 0; background: #eef2f5; font: 15px/1.5 "Segoe UI", Arial, sans-serif; color: #16222c; }
  main { max-width: 760px; margin: 32px auto; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 26px 30px; }
  h1 { font-size: 21px; margin: 0 0 4px; color: var(--navy); }
  p.lead { color: var(--muted); margin: 0 0 18px; }
  label { display: block; font-weight: 600; margin: 14px 0 4px; }
  input { width: 100%; box-sizing: border-box; font: inherit; padding: 8px 10px; border: 1px solid #b9c4cc; border-radius: 6px; }
  .hint { font-size: 13px; color: var(--muted); }
  button { margin-top: 18px; font: inherit; font-weight: 600; color: #fff; background: var(--navy); border: 0; border-radius: 6px; padding: 9px 18px; cursor: pointer; }
  #msg { margin-top: 14px; font-size: 14px; }
  #msg.err { color: #a4262c; }
  ul#files { padding-left: 20px; }
  ol { padding-left: 20px; }
  .box { background: #f6f8fa; border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin-top: 18px; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>ESG 1-to-1 – legacy flow packages</h1>
  <p class="lead">Use this only if <b>Solutions</b> can't be imported in your environment (no Dataverse). It writes your site address and email into the six flows and saves six <code>.zip</code> packages for <b>My flows → Import → Import Package (Legacy)</b>. It works offline; nothing leaves this page.</p>
  <label for="site">1-to-1 site address</label>
  <input id="site" type="url" autocomplete="off" spellcheck="false" placeholder="https://yourtenant.sharepoint.com/sites/yoursite">
  <div class="hint">The full address of the private 1-to-1 site, without a trailing slash.</div>
  <label for="mail">Team Leader email</label>
  <input id="mail" type="email" autocomplete="off" spellcheck="false" placeholder="firstname.lastname@yourcompany.com">
  <div class="hint">Receives submissions, problem reports and the setup summary.</div>
  <button id="go" type="button">Create the six packages</button>
  <div id="msg" role="status" aria-live="polite"></div>
  <ul id="files"></ul>
  <div class="box">
    <b>Then, for each package (0 to 5, in order):</b>
    <ol>
      <li>Power Automate → <b>My flows → Import → Import Package (Legacy)</b> → upload the zip.</li>
      <li>Under <b>Related resources</b>, click each connection and pick (or create) your own SharePoint / Outlook / Office 365 Users connection.</li>
      <li>Click <b>Import</b>. Run flow 0 once, then turn on flows 1, 2 and 3 (see 04-solution/IMPORT_GUIDE.md).</li>
    </ol>
  </div>
</main>
<script id="templates" type="application/json">__TEMPLATES__</script>
<script>
(function () {
  'use strict';
  var templates = JSON.parse(document.getElementById('templates').textContent);
  var SITE = /^https:\/\/[A-Za-z0-9.-]+\/(sites|teams)\/[A-Za-z0-9._-]+$/;
  var MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) { c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); } return (c ^ 0xFFFFFFFF) >>> 0; }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  // Minimal ZIP writer (stored entries, UTF-8 names) – standard format any unzip tool reads.
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.path), data = enc.encode(f.text), crc = crc32(data);
      var head = [].concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push([].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)), name);
      offset += head.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c, i) { if (i % 2 === 0) { parts.push(new Uint8Array(c)); cdSize += c.length; } else { parts.push(c); cdSize += c.length; } });
    parts.push(new Uint8Array([].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(parts, { type: 'application/zip' });
  }
  function say(text, err) { var m = document.getElementById('msg'); m.textContent = text; m.className = err ? 'err' : ''; }
  document.getElementById('go').addEventListener('click', function () {
    var site = document.getElementById('site').value.trim().replace(/\/+$/, '');
    var mail = document.getElementById('mail').value.trim();
    if (!SITE.test(site)) { say('Enter the site address like https://yourtenant.sharepoint.com/sites/yoursite', true); return; }
    if (!MAIL.test(mail)) { say('Enter a valid email address.', true); return; }
    var list = document.getElementById('files');
    while (list.firstChild) { list.removeChild(list.firstChild); }
    templates.forEach(function (pkg) {
      var files = Object.keys(pkg.files).map(function (p) {
        return { path: p, text: pkg.files[p].split('__ESG_SITE_URL__').join(site).split('__ESG_TL_EMAIL__').join(mail) };
      });
      var url = URL.createObjectURL(zip(files));
      var a = document.createElement('a');
      a.href = url; a.download = pkg.zip; a.textContent = pkg.zip;
      var li = document.createElement('li'); li.appendChild(a);
      li.appendChild(document.createTextNode(' – ' + pkg.name));
      list.appendChild(li);
      a.click();
    });
    say('Four packages created. If your browser blocked some downloads, click the links below.');
  });
})();
</script>
</body>
</html>
'''


def builder_html(flows):
    templates = [{'name': f['name'], 'zip': zip_name(f), 'files': package_files(f)} for f in flows]
    data = json.dumps(templates, ensure_ascii=False).replace('</', '<\\/')
    return BUILDER_HTML.replace('__TEMPLATES__', data, 1)
