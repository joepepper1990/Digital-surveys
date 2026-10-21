"""Proves the solution zip has the structure of a solution that Power Automate has imported: the ESG 1-to-1 solution,
packed by Microsoft's pac CLI. Compares, element by element, the zip's file layout and order, encodings and line
endings, solution.xml, customizations.xml (each Workflow element and connection reference), the environment
variable definitions and [Content_Types].xml. Also re-checks the packed flows (validation, nesting, size).
    python3 check_package.py [reference.zip]
Without a reference path it reads the 1-to-1 zip from this repository's history.
"""
import io
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

import build_solution
import validate

REF_PATH = 'one-to-one/04-solution/ESGOneToOne_1_5_0_1_unmanaged.zip'


def reference_bytes():
    """The 1-to-1 zip from whichever branch of this repository holds it."""
    commit = subprocess.run(['git', 'log', '--all', '-1', '--format=%H', '--', ':/' + REF_PATH], capture_output=True, text=True, check=True,
                            cwd=build_solution.ROOT).stdout.strip()
    if not commit:
        raise SystemExit('The ESG 1-to-1 reference zip was not found in this repository; pass its path as an argument.')
    return subprocess.run(['git', 'show', commit + ':' + REF_PATH], capture_output=True, check=True, cwd=build_solution.ROOT).stdout


def kind(name):
    if name.startswith('Workflows/'):
        return 'Workflows/*.json'
    if name.startswith('environmentvariabledefinitions/'):
        return 'environmentvariabledefinitions/*/environmentvariabledefinition.xml'
    return name


def shape(el):
    """An element's tag, attribute names and children's shapes – values ignored."""
    return (el.tag, tuple(sorted(el.attrib)), tuple(shape(c) for c in el))


def encoding(b):
    return (b[:3] == b'\xef\xbb\xbf', b'\r\n' in b, b.endswith(b'\r\n'))


def compare(ref, ours):
    probs = []
    rn, on = ref.namelist(), ours.namelist()
    order = lambda names: [k for i, k in enumerate(map(kind, names)) if k not in list(map(kind, names))[:i]]
    if order(rn) != order(on):
        probs.append('file order differs: {0} vs {1}'.format(order(rn), order(on)))
    for kinds in set(map(kind, rn)) | set(map(kind, on)):
        r = next(n for n in rn if kind(n) == kinds) if any(kind(n) == kinds for n in rn) else None
        o = next(n for n in on if kind(n) == kinds) if any(kind(n) == kinds for n in on) else None
        if r is None or o is None:
            probs.append('{0}: present in only one package'.format(kinds))
            continue
        rb, ob = ref.read(r), ours.read(o)
        if encoding(rb) != encoding(ob):
            probs.append('{0}: encoding (BOM, CRLF, final CRLF) {1} vs {2}'.format(kinds, encoding(rb), encoding(ob)))
        if ref.getinfo(r).compress_type != ours.getinfo(o).compress_type:
            probs.append('{0}: compression differs'.format(kinds))
        if kinds.endswith('.json'):
            rj, oj = json.loads(rb.decode('utf-8')), json.loads(ob.decode('utf-8'))
            if set(rj) != set(oj) or set(rj['properties']) != set(oj['properties']):
                probs.append('{0}: top-level keys differ'.format(kinds))
            continue
        rx, ox = ET.fromstring(rb.decode('utf-8-sig')), ET.fromstring(ob.decode('utf-8-sig'))
        if kinds == 'customizations.xml':
            rw, ow = rx.find('Workflows')[0], ox.find('Workflows')[0]
            if shape(rw) != shape(ow):
                probs.append('Workflow element differs: {0} vs {1}'.format(shape(rw), shape(ow)))
            rc, oc = rx.find('connectionreferences')[0], ox.find('connectionreferences')[0]
            if shape(rc) != shape(oc):
                probs.append('connectionreference element differs')
            if [c.tag for c in rx] != [c.tag for c in ox]:
                probs.append('customizations.xml sections differ: {0} vs {1}'.format([c.tag for c in rx], [c.tag for c in ox]))
            if sorted(rx.attrib) != sorted(ox.attrib):
                probs.append('customizations.xml root attributes differ')
        elif kinds == 'solution.xml':
            rm, om = rx.find('SolutionManifest'), ox.find('SolutionManifest')
            if [c.tag for c in rm] != [c.tag for c in om]:
                probs.append('SolutionManifest children differ')
            if shape(rm.find('Publisher')) != shape(om.find('Publisher')):
                probs.append('Publisher element differs')
            for rc in rm.find('RootComponents'):
                same = [c for c in om.find('RootComponents') if c.get('type') == rc.get('type')]
                if same and sorted(same[0].attrib) != sorted(rc.attrib):
                    probs.append('RootComponent type {0} attributes differ'.format(rc.get('type')))
            if sorted(rx.attrib) != sorted(ox.attrib):
                probs.append('solution.xml root attributes differ')
        elif shape(rx) != shape(ox):
            probs.append('{0}: structure differs'.format(kinds))
    return probs


def own_checks(ours):
    probs = []
    sol = ET.fromstring(ours.read('solution.xml').decode('utf-8-sig')).find('SolutionManifest')
    prefix = sol.find('Publisher/CustomizationPrefix').text
    if not re.match(r'^[a-z][a-z0-9]{1,7}$', prefix):
        probs.append('publisher prefix {0!r} is not 2-8 lowercase letters and digits'.format(prefix))
    if not 10000 <= int(sol.find('Publisher/CustomizationOptionValuePrefix').text) <= 99999:
        probs.append('option value prefix must be 10000-99999')
    cust = ET.fromstring(ours.read('customizations.xml').decode('utf-8-sig'))
    for cr in cust.find('connectionreferences'):
        if not cr.get('connectionreferencelogicalname').startswith(prefix + '_'):
            probs.append('connection reference does not start with the publisher prefix')
    for rc in sol.find('RootComponents'):
        if rc.get('type') == '380' and not rc.get('schemaName').startswith(prefix + '_'):
            probs.append('environment variable does not start with the publisher prefix')
    ids = {rc.get('id').strip('{}') for rc in sol.find('RootComponents') if rc.get('type') == '29'}
    for wf in cust.find('Workflows'):
        wid = wf.get('WorkflowId').strip('{}')
        if wid not in ids:
            probs.append('workflow {0} is not a root component'.format(wid))
        path = wf.find('JsonFileName').text.lstrip('/')
        if path not in ours.namelist():
            probs.append('JsonFileName {0} is not in the zip'.format(path))
            continue
        flow = json.loads(ours.read(path).decode('utf-8'))
        defn = flow['properties']['definition']
        probs += validate.check_nesting(wf.get('Name'), defn)
        for ref in flow['properties']['connectionReferences'].values():
            names = [c.get('connectionreferencelogicalname') for c in cust.find('connectionreferences')]
            if ref['connection']['connectionReferenceLogicalName'] not in names:
                probs.append('flow uses a connection reference the solution does not define')
        for p, v in defn['parameters'].items():
            schema = (v.get('metadata') or {}).get('schemaName')
            if schema and not any(rc.get('schemaName') == schema for rc in sol.find('RootComponents')):
                probs.append('flow parameter {0} names an environment variable the solution does not define'.format(p))
    return probs


def main():
    if len(sys.argv) > 1:
        ref_bytes = open(sys.argv[1], 'rb').read()
    else:
        ref_bytes = reference_bytes()
    ref = zipfile.ZipFile(io.BytesIO(ref_bytes))
    ours = zipfile.ZipFile(build_solution.ZIP)
    probs = compare(ref, ours) + own_checks(ours)
    if probs:
        raise SystemExit('Package check failed:\n  ' + '\n  '.join(probs))
    print('Package matches the structure of the imported 1-to-1 solution, element by element; {0} flow(s) within the limits.'.format(
        sum(1 for n in ours.namelist() if n.startswith('Workflows/'))))


if __name__ == '__main__':
    main()
