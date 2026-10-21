// Code rules S1–S8 (plan G.2.3), build reproducibility and naming.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { MODULES } = require('../../tools/build.js');
const { ROOT, loadApp, plain } = require('../load.js');

const sources = MODULES.map((m) => ({ name: m, text: fs.readFileSync(path.join(ROOT, m), 'utf8') }));

test('S1/S4: no HTML injection or dynamic code', () => {
  for (const s of sources) {
    assert.doesNotMatch(s.text, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, s.name);
    assert.doesNotMatch(s.text, /\beval\(|new Function|setTimeout\(\s*['"]/, s.name);
  }
});

test('S5: no external resources or absolute URLs', () => {
  for (const s of sources) assert.doesNotMatch(s.text, /https?:\/\//, s.name);
});

test('S6/S8: writes go only to notices, updates and the own request folder; no permission or sharing calls', () => {
  const all = sources.map((s) => s.text).join('\n');
  assert.doesNotMatch(all, /breakroleinheritance|roleassignments|ensureuser|sitegroups|validateUpdateListItem|X-HTTP-Method|MERGE/i);
  const writes = all.match(/addToFolder\('(\w+)'/g) || [];
  assert.deepEqual([...new Set(writes)].sort(), ["addToFolder('notices'", "addToFolder('requests'", "addToFolder('updates'"]);
  // Every call names its list literally, so the allow-list above is complete.
  const calls = all.match(/\.addToFolder\([^)]{0,20}/g) || [];
  assert.ok(calls.length >= 3 && calls.every((c) => /\.addToFolder\('/.test(c)), calls.join(' | '));
  // Requests are written only into the user's own folder, u{SiteUserId}.
  assert.match(all, /addToFolder\('requests', folder\(\)/);
  assert.match(all, /return 'u' \+ app\.person\.SiteUserId;/);
});

test('the build is reproducible and committed output is current', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/BUILD_MANIFEST.json'), 'utf8'));
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'dist/competency-hub.js'))).digest('hex');
  assert.equal(manifest.outputs['competency-hub.js'], hash);
});

test('every CSS rule in the layout is scoped to the Welcome container', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'dist/competency-hub.html'), 'utf8');
  const css = layout.split('<style>')[1].split('</style>')[0];
  const heads = css.split('}').map((r) => r.split('{')[0].trim()).filter((h) => h && !h.startsWith('@media'));
  for (const h of heads) for (const sel of h.split(',')) assert.match(sel.trim(), /^\.SCOPE \.ch/, sel);
  assert.match(layout, /data-exports="ESGCompetencyHub"/);
  assert.match(fs.readFileSync(path.join(ROOT, 'dist/competency-hub.js'), 'utf8'), /^\/\*[^\n]*\*\/\nwindow\.ESGCompetencyHub = function \(ctx\)/);
});

test('professional naming: no assistant or vendor-tool references in the shipped code', () => {
  const shipped = ['dist/competency-hub.js', 'dist/competency-hub.html'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.doesNotMatch(shipped, /claude|anthropic|chatgpt|openai|\bA\.?I\.? generated/i);
});

test('notice validation', () => {
  const v = loadApp().views.noticeForm.validate;
  assert.deepEqual(plain(v({ title: 'A', body: 'B', category: 'General' })), {});
  assert.ok(v({ title: ' ', body: 'B', category: 'General' }).title);
  assert.ok(v({ title: 'x'.repeat(256), body: 'B', category: 'General' }).title);
  assert.ok(v({ title: 'A', body: '', category: 'General' }).body);
  assert.ok(v({ title: 'A', body: 'B', category: 'Gossip' }).category);
});
