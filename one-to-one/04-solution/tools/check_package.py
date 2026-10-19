"""Proves the packed solution is exactly the validated source, and that it can replace the previous package safely.

    python3 tools/check_package.py        (run_all.sh runs it after build.py)

Checks, on the zip itself:
  * every workflow JSON in the zip equals src/Workflows and what flows.build_all() generates (the validated source);
  * every packaged flow is within Power Automate's nesting limit (8) and action limit (500) – on the packaged JSON;
  * the same flows (names and IDs), connection references and environment variables as the previous package, so an
    upgrade import keeps the flows' identities, connections and settings;
  * solution.xml carries the new version;
  * the previous package is still there, unchanged (it is never overwritten).
"""
import glob
import hashlib
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
import build  # noqa: E402
import validate  # noqa: E402
from flows import build_all  # noqa: E402

ROOT = build.ROOT
PREVIOUS = os.path.join(ROOT, 'ESGOneToOne_1_5_0_0_unmanaged.zip')
PREVIOUS_SHA256 = '1271932084a82cf67f39840034982efb9ea266c39878e7f25c88e5b1b1c76803'   # as committed in 420cfbf

problems = []


def fail(msg):
    problems.append(msg)


def workflows(z):
    return {n: json.loads(z.read(n).decode('utf-8')) for n in z.namelist() if n.startswith('Workflows/') and n.endswith('.json')}


def conn_refs(z):
    return sorted(set(re.findall(r'connectionreferencelogicalname="([^"]+)"', z.read('customizations.xml').decode('utf-8'))))


def env_vars(z):
    return sorted({n.split('/')[1] for n in z.namelist() if n.startswith('environmentvariabledefinitions/')})


new = zipfile.ZipFile(build.ZIP)
packed = workflows(new)
generated = {f['id'].upper(): f['json'] for f in build_all()}
src = {os.path.basename(p): json.load(open(p, encoding='utf-8')) for p in glob.glob(os.path.join(build.SRC, 'Workflows', '*.json'))}

if len(packed) != len(generated):
    fail('the zip has {0} flows, the source {1}'.format(len(packed), len(generated)))
for name, defn in packed.items():
    fid = re.search(r'-([0-9A-F-]{36})\.json$', name).group(1)
    if src.get(os.path.basename(name)) != defn:
        fail(name + ': differs from src/Workflows')
    if generated.get(fid) != defn:
        fail(name + ': differs from the validated source (flows.py)')
    problems.extend(validate.check_nesting(name, defn['properties']['definition']))

sx = new.read('solution.xml').decode('utf-8')
if '<Version>' + build.VERSION + '</Version>' not in sx:
    fail('solution.xml does not say version ' + build.VERSION)

if not os.path.exists(PREVIOUS):
    fail('the previous package ' + os.path.basename(PREVIOUS) + ' is missing – it must never be overwritten or removed')
else:
    with open(PREVIOUS, 'rb') as fh:
        if hashlib.sha256(fh.read()).hexdigest() != PREVIOUS_SHA256:
            fail('the previous package ' + os.path.basename(PREVIOUS) + ' has changed')
    old = zipfile.ZipFile(PREVIOUS)
    if sorted(workflows(old)) != sorted(packed):
        fail('flow names / IDs differ from the previous package: ' + str(sorted(set(workflows(old)) ^ set(packed))))
    if conn_refs(old) != conn_refs(new):
        fail('connection references differ: {0} → {1}'.format(conn_refs(old), conn_refs(new)))
    if env_vars(old) != env_vars(new):
        fail('environment variables differ: {0} → {1}'.format(env_vars(old), env_vars(new)))
    # the rule really catches the 1.5.0.0 activation failure: its Flow 1 must fail, naming the actions Power Automate named
    old_daily = next(d for n, d in workflows(old).items() if 'Dailyscheduler' in n)
    old_probs = validate.check_nesting('1.5.0.0 Daily', old_daily['properties']['definition'])
    reported = ('S_Key', 'S_Has_id', 'S_Find', 'S_Not_yet', 'Notice_item', 'Create_notice', 'Recheck_notice', 'Notice_missing')
    if not all(any(' ' + a + ' is nested at level 9 ' in p for p in old_probs) for a in reported):
        fail('the nesting rule does not reproduce the 1.5.0.0 TemplateValidationError: ' + '; '.join(old_probs[:3]))
    for n in workflows(old):   # same connectors per flow, same trigger per flow
        a, b = workflows(old)[n]['properties'], packed[n]['properties']
        if a['connectionReferences'] != b['connectionReferences']:
            fail(n + ': connection references changed')
        if a['definition']['triggers'] != b['definition']['triggers']:
            fail(n + ': trigger changed')

if problems:
    print('\n'.join(problems))
    raise SystemExit('package check: {0} problem(s)'.format(len(problems)))
print('package check: {0} – {1} flows identical to the validated source, all within {2} nesting levels; same flow IDs, '
      'connection references, environment variables and triggers as 1.5.0.0; 1.5.0.0 zip unchanged'.format(
          os.path.basename(build.ZIP), len(packed), validate.MAX_NESTING))
