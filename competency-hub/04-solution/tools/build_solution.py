"""Builds the ESG Competency Hub solution: src/ (the unpacked solution, in the layout `pac solution unpack` produces)
and the importable zip, after validating every flow.
    python3 build_solution.py            write src/ and the zip
    python3 build_solution.py --check    fail if src/ or the zip are stale

The zip is written here in the layout Microsoft's Power Platform CLI (pac) writes: the files, their order, encodings
and line endings follow the ESG 1-to-1 solution that pac packed and that imported in the tenant, and check_package.py
compares the two element by element. src/ holds the same files unzipped, for review.
"""
import hashlib
import io
import json
import os
import re
import shutil
import sys
import zipfile

import flows
import validate

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(ROOT, 'src')
VERSION = '1.3.0.0'
INTRODUCED = '1.0.0.0'   # the version the request flow and environment variable first appeared in
UNIQUE = 'ESGCompetencyHub'
DISPLAY = 'ESG Competency Hub'
PREFIX = 'esghub'
OPTION_PREFIX = '63587'
ZIP = os.path.join(ROOT, 'ESGCompetencyHub_{0}_unmanaged.zip'.format(VERSION.replace('.', '_')))
BOM = '﻿'
DESCRIPTION = 'ESG Competency Hub: the request queue flow that applies changes sent from the Competency Hub page, and the daily reminders.'
CONN_DISPLAY = {'shared_sharepointonline': 'ESG Competency Hub SharePoint', 'shared_office365': 'ESG Competency Hub Outlook'}


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def file_base(f):
    return re.sub('[^A-Za-z0-9]', '', f['name']) + '-' + f['id'].upper()


def flow_text(f):
    return json.dumps(f['json'], indent=2, ensure_ascii=False).replace('\n', '\r\n') + '\r\n'


def workflow_xml(f):
    on = f['on']
    return '\n'.join([
        '    <Workflow WorkflowId="{{{0}}}" Name="{1}" Description="{2}">'.format(f['id'], esc(f['name']), esc(f['description'])),
        '      <JsonFileName>/Workflows/{0}.json</JsonFileName>'.format(file_base(f)),
        '      <Type>1</Type>', '      <Subprocess>0</Subprocess>', '      <Category>5</Category>', '      <Mode>0</Mode>',
        '      <Scope>4</Scope>', '      <OnDemand>0</OnDemand>', '      <TriggerOnCreate>0</TriggerOnCreate>',
        '      <TriggerOnDelete>0</TriggerOnDelete>', '      <AsyncAutodelete>0</AsyncAutodelete>',
        '      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>',
        '      <StateCode>{0}</StateCode>'.format(1 if on else 0), '      <StatusCode>{0}</StatusCode>'.format(2 if on else 1),
        '      <RunAs>1</RunAs>', '      <IsTransacted>1</IsTransacted>', '      <IntroducedVersion>{0}</IntroducedVersion>'.format(f.get('introduced', INTRODUCED)),
        '      <IsCustomizable>1</IsCustomizable>', '      <BusinessProcessType>0</BusinessProcessType>',
        '      <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>',
        '      <ModernFlowType>0</ModernFlowType>', '      <PrimaryEntity>none</PrimaryEntity>',
        '      <LocalizedNames>', '        <LocalizedName languagecode="1033" description="{0}" />'.format(esc(f['name'])), '      </LocalizedNames>',
        '    </Workflow>'])


def customizations(fl):
    conns = sorted({c for f in fl for c in f['connectors']})
    lines = ['<?xml version="1.0" encoding="utf-8"?>',
             '<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.25093.138" '
             'OrganizationSchemaType="Full" CRMServerServiceabilityVersion="9.2.25095.00139">',
             '  <Entities />', '  <Roles />', '  <Workflows>'] + [workflow_xml(f) for f in fl] + [
             '  </Workflows>', '  <FieldSecurityProfiles />', '  <Templates />', '  <EntityMaps />', '  <EntityRelationships />',
             '  <OrganizationSettings />', '  <optionsets />', '  <CustomControls />', '  <EntityDataProviders />', '  <connectionreferences>']
    for c in conns:
        lines += ['    <connectionreference connectionreferencelogicalname="{0}">'.format(flows.CONN[c]),
                  '      <connectionreferencedisplayname>{0}</connectionreferencedisplayname>'.format(CONN_DISPLAY[c]),
                  '      <connectorid>/providers/Microsoft.PowerApps/apis/{0}</connectorid>'.format(c),
                  '      <iscustomizable>1</iscustomizable>', '      <promptingbehavior>0</promptingbehavior>',
                  '      <statecode>0</statecode>', '      <statuscode>1</statuscode>', '    </connectionreference>']
    lines += ['  </connectionreferences>', '  <Languages>', '    <Language>1033</Language>', '  </Languages>', '</ImportExportXml>']
    return BOM + '\n'.join(lines)


def solution(fl):
    roots = ['      <RootComponent type="29" id="{{{0}}}" behavior="0" />'.format(f['id']) for f in fl]
    roots += ['      <RootComponent type="380" schemaName="{0}" behavior="0" />'.format(ev['schema']) for ev in flows.ENV_VARS]
    lines = ['<?xml version="1.0" encoding="utf-8"?>',
             '<ImportExportXml version="9.2.25093.138" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" '
             'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.25093.138" OrganizationSchemaType="Full" '
             'CRMServerServiceabilityVersion="9.2.25095.00139">',
             '  <SolutionManifest>', '    <UniqueName>{0}</UniqueName>'.format(UNIQUE),
             '    <LocalizedNames>', '      <LocalizedName description="{0}" languagecode="1033" />'.format(DISPLAY), '    </LocalizedNames>',
             '    <Descriptions>', '      <Description description="{0}" languagecode="1033" />'.format(esc(DESCRIPTION)), '    </Descriptions>',
             '    <Version>{0}</Version>'.format(VERSION), '    <Managed>0</Managed>',
             '    <Publisher>', '      <UniqueName>{0}</UniqueName>'.format(UNIQUE),
             '      <LocalizedNames>', '        <LocalizedName description="{0}" languagecode="1033" />'.format(DISPLAY), '      </LocalizedNames>',
             '      <Descriptions />', '      <EMailAddress xsi:nil="true"></EMailAddress>', '      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>',
             '      <CustomizationPrefix>{0}</CustomizationPrefix>'.format(PREFIX),
             '      <CustomizationOptionValuePrefix>{0}</CustomizationOptionValuePrefix>'.format(OPTION_PREFIX),
             '      <Addresses>', '        <Address>', '          <AddressNumber>1</AddressNumber>', '          <AddressTypeCode>1</AddressTypeCode>',
             '          <ShippingMethodCode>1</ShippingMethodCode>', '        </Address>', '        <Address>', '          <AddressNumber>2</AddressNumber>',
             '          <AddressTypeCode>1</AddressTypeCode>', '          <ShippingMethodCode>1</ShippingMethodCode>', '        </Address>', '      </Addresses>',
             '    </Publisher>', '    <RootComponents>'] + roots + ['    </RootComponents>', '    <MissingDependencies />', '  </SolutionManifest>',
             '</ImportExportXml>']
    return BOM + '\n'.join(lines)


def env_var(ev):
    d = esc(ev['description'])
    return '\r\n'.join([
        '<environmentvariabledefinition schemaname="{0}">'.format(ev['schema']),
        '  <description default="{0}">'.format(d), '    <label description="{0}" languagecode="1033" />'.format(d), '  </description>',
        '  <displayname default="{0}">'.format(esc(ev['display'])), '    <label description="{0}" languagecode="1033" />'.format(esc(ev['display'])),
        '  </displayname>', '  <introducedversion>{0}</introducedversion>'.format(INTRODUCED), '  <iscustomizable>1</iscustomizable>',
        '  <isrequired>1</isrequired>', '  <secretstore>0</secretstore>', '  <type>100000000</type>',
        '</environmentvariabledefinition>']) + '\r\n'


CONTENT_TYPES = (BOM + '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="xml" ContentType="application/octet-stream" /><Default Extension="json" ContentType="application/octet-stream" /></Types>')


def package_files(fl):
    """The zip's files in pac's order: customizations, solution, workflows, environment variables, content types."""
    files = [('customizations.xml', customizations(fl)), ('solution.xml', solution(fl))]
    files += [('Workflows/{0}.json'.format(file_base(f)), flow_text(f)) for f in sorted(fl, key=lambda f: file_base(f))]
    files += [('environmentvariabledefinitions/{0}/environmentvariabledefinition.xml'.format(ev['schema']), env_var(ev)) for ev in flows.ENV_VARS]
    files += [('[Content_Types].xml', CONTENT_TYPES)]
    return files


def zip_bytes(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in files:
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 21, 12, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, text.encode('utf-8'))
    return buf.getvalue()


def build():
    fl = flows.build_all()
    probs = validate.validate_all(fl)
    if probs:
        raise SystemExit('Flow validation failed:\n  ' + '\n  '.join(probs))
    files = package_files(fl)
    src = {name: text for name, text in files}
    return files, src, zip_bytes(files)


def main():
    files, src, data = build()
    if '--check' in sys.argv:
        stale = [p for p, t in src.items() if not os.path.exists(os.path.join(SRC, p)) or open(os.path.join(SRC, p), encoding='utf-8', newline='').read() != t]
        current = os.path.exists(ZIP) and [(n, zipfile.ZipFile(ZIP).read(n).decode('utf-8')) for n in zipfile.ZipFile(ZIP).namelist()] == files
        if stale or not current:
            raise SystemExit('Stale solution output: ' + ', '.join(stale + ([] if current else [os.path.basename(ZIP)])) + '. Run python3 build_solution.py')
        print('Solution output is up to date.')
        return
    if os.path.isdir(SRC):
        shutil.rmtree(SRC)
    for p, t in src.items():
        os.makedirs(os.path.dirname(os.path.join(SRC, p)), exist_ok=True)
        with open(os.path.join(SRC, p), 'w', encoding='utf-8', newline='') as fh:
            fh.write(t)
    with open(ZIP, 'wb') as fh:
        fh.write(data)
    print('Packed:', os.path.relpath(ZIP, ROOT), hashlib.sha256(data).hexdigest()[:16])


if __name__ == '__main__':
    main()
