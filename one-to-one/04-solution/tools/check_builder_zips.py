"""Checks the zips produced by tools/test_builder.js: standard zip files, exactly the expected files, contents equal to
the legacy templates filled with the test values (trailing slash removed), valid JSON, and the same layout as a real
exported legacy package."""
import json
import os
import shutil
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from flows import build_all  # noqa: E402
import legacy  # noqa: E402
import validate  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '.builder-test')
fails = 0


def ok(name, cond, detail=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or not detail else '  — ' + str(detail)[:300]))
    fails += not cond


for f in build_all():
    zpath = os.path.join(OUT, legacy.zip_name(f))
    ok('Zip present: ' + legacy.zip_name(f), os.path.exists(zpath))
    if not os.path.exists(zpath):
        continue
    with zipfile.ZipFile(zpath) as z:
        ok(legacy.zip_name(f) + ': passes zip integrity test', z.testzip() is None)
        want = {p: legacy.fill(t, 'https://contoso.sharepoint.com/sites/esg-1to1', 'team.leader@example.test')
                for p, t in legacy.package_files(f).items()}
        got = {n: z.read(n).decode('utf-8') for n in z.namelist()}
    ok(legacy.zip_name(f) + ': exactly the expected files', set(got) == set(want), set(got) ^ set(want))
    ok(legacy.zip_name(f) + ': contents equal the filled templates', got == want)
    parsed = {p: json.loads(t) for p, t in got.items()}
    man = parsed['manifest.json']
    root = [k for k, v in man['resources'].items() if v['type'] == 'Microsoft.Flow/flows']
    ok(legacy.zip_name(f) + ': manifest has one flow and its folder exists', len(root) == 1 and
       'Microsoft.Flow/flows/{0}/definition.json'.format(root[0]) in got and
       parsed['Microsoft.Flow/flows/manifest.json']['flowAssets']['assetPaths'] == root)
    d = parsed['Microsoft.Flow/flows/{0}/definition.json'.format(root[0])]['properties']
    s = json.dumps(d)
    ok(legacy.zip_name(f) + ': site and email filled in, no tokens or environment variables left',
       '__ESG_' not in s and 'esg_SiteUrl' not in s and 'https://contoso.sharepoint.com/sites/esg-1to1' in s and
       not s.count('sites/esg-1to1/'), s[:200])
    nest = validate.check_nesting(legacy.zip_name(f), d['definition'])
    ok(legacy.zip_name(f) + ': within Power Automate\'s 8 nesting levels and 500 actions (deepest level {0})'.format(validate.max_nesting(d['definition'])),
       not nest, nest[:3])
    apis = parsed['Microsoft.Flow/flows/{0}/apisMap.json'.format(root[0])]
    conns = parsed['Microsoft.Flow/flows/{0}/connectionsMap.json'.format(root[0])]
    ok(legacy.zip_name(f) + ': every connection reference has an api and a connection resource',
       set(d['connectionReferences']) == set(apis) == set(conns) and all(apis[k] in man['resources'] and conns[k] in man['resources'] for k in apis))
shutil.rmtree(OUT, ignore_errors=True)
sys.exit(1 if fails else 0)
