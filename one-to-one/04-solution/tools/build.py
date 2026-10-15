"""Build the ESG 1-to-1 Power Platform solution.

    python3 tools/build.py            # generate src/, validate, pack ESGOneToOne_<version>_unmanaged.zip with pac (if installed)

1. Writes the unpacked solution (SolutionPackager layout, as `pac solution unpack` produces it) to ../src.
2. Validates every flow statically (expressions, references, scopes, runAfter) – see validate.py.
3. Packs it with the Power Platform CLI (`pac solution pack`) and unpacks the zip again to prove the round trip.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
import zipfile
from xml.sax.saxutils import escape, quoteattr

sys.path.insert(0, os.path.dirname(__file__))
from flows import build_all, CONN, ENV_VARS  # noqa: E402
import validate  # noqa: E402
import legacy  # noqa: E402

VERSION = '1.1.1.0'
UNIQUE = 'ESGOneToOne'
DISPLAY = 'ESG 1-to-1'
PUBLISHER = {'unique': 'ESGOneToOne', 'display': 'ESG 1-to-1', 'prefix': 'esg', 'option': '41236'}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'src')
BUILDER = os.path.join(ROOT, 'legacy-package-builder.html')
ZIP = os.path.join(ROOT, '{0}_{1}_unmanaged.zip'.format(UNIQUE, VERSION.replace('.', '_')))
CONN_DISPLAY = {
    'shared_sharepointonline': ('ESG 1-to-1 SharePoint', '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'),
    'shared_office365': ('ESG 1-to-1 Outlook', '/providers/Microsoft.PowerApps/apis/shared_office365'),
    'shared_office365users': ('ESG 1-to-1 Office 365 Users', '/providers/Microsoft.PowerApps/apis/shared_office365users'),
}
HEAD = ('<ImportExportXml version="9.2.25093.138" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.25093.138" '
        'OrganizationSchemaType="Full" CRMServerServiceabilityVersion="9.2.25095.00139">')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(text)


def file_base(name, wid):
    return re.sub(r'[^A-Za-z0-9]', '', name) + '-' + wid.upper()


def solution_xml(flows):
    addr = ''.join(
        '        <Address>\n          <AddressNumber>{0}</AddressNumber>\n          <AddressTypeCode>1</AddressTypeCode>\n'
        '          <ShippingMethodCode>1</ShippingMethodCode>\n        </Address>\n'.format(n) for n in (1, 2))
    roots = ''.join('      <RootComponent type="29" id="{{{0}}}" behavior="0" />\n'.format(f['id']) for f in flows)
    roots += ''.join('      <RootComponent type="380" schemaName="{0}" behavior="0" />\n'.format(ev['schema']) for ev in ENV_VARS)
    return ('<?xml version="1.0" encoding="utf-8"?>\n' + HEAD + '\n'
            '  <SolutionManifest>\n'
            '    <UniqueName>' + UNIQUE + '</UniqueName>\n'
            '    <LocalizedNames>\n      <LocalizedName description="' + DISPLAY + '" languagecode="1033" />\n    </LocalizedNames>\n'
            '    <Descriptions>\n      <Description description="ESG Monthly Technician 1-to-1: setup flow, daily scheduler, '
            'submission and manager-decision flows." languagecode="1033" />\n    </Descriptions>\n'
            '    <Version>' + VERSION + '</Version>\n'
            '    <Managed>0</Managed>\n'
            '    <Publisher>\n'
            '      <UniqueName>' + PUBLISHER['unique'] + '</UniqueName>\n'
            '      <LocalizedNames>\n        <LocalizedName description="' + PUBLISHER['display'] + '" languagecode="1033" />\n      </LocalizedNames>\n'
            '      <Descriptions />\n'
            '      <EMailAddress xsi:nil="true"></EMailAddress>\n'
            '      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>\n'
            '      <CustomizationPrefix>' + PUBLISHER['prefix'] + '</CustomizationPrefix>\n'
            '      <CustomizationOptionValuePrefix>' + PUBLISHER['option'] + '</CustomizationOptionValuePrefix>\n'
            '      <Addresses>\n' + addr + '      </Addresses>\n'
            '    </Publisher>\n'
            '    <RootComponents>\n' + roots + '    </RootComponents>\n'
            '    <MissingDependencies />\n'
            '  </SolutionManifest>\n'
            '</ImportExportXml>\n')


def customizations_xml():
    refs = ''
    for key, logical in CONN.items():
        disp, cid = CONN_DISPLAY[key]
        refs += ('    <connectionreference connectionreferencelogicalname="' + logical + '">\n'
                 '      <connectionreferencedisplayname>' + escape(disp) + '</connectionreferencedisplayname>\n'
                 '      <connectorid>' + cid + '</connectorid>\n'
                 '      <iscustomizable>1</iscustomizable>\n'
                 '      <promptingbehavior>0</promptingbehavior>\n'
                 '      <statecode>0</statecode>\n'
                 '      <statuscode>1</statuscode>\n'
                 '    </connectionreference>\n')
    head = HEAD.replace('version="9.2.25093.138" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" ', '')
    return ('<?xml version="1.0" encoding="utf-8"?>\n' + head + '\n'
            '  <Entities />\n  <Roles />\n  <Workflows />\n  <FieldSecurityProfiles />\n  <Templates />\n'
            '  <EntityMaps />\n  <EntityRelationships />\n  <OrganizationSettings />\n  <optionsets />\n'
            '  <CustomControls />\n  <EntityDataProviders />\n'
            '  <connectionreferences>\n' + refs + '  </connectionreferences>\n'
            '  <Languages>\n    <Language>1033</Language>\n  </Languages>\n'
            '</ImportExportXml>\n')


def workflow_data_xml(f, base):
    on = f['on']
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<Workflow WorkflowId="{' + f['id'] + '}" Name=' + quoteattr(f['name']) + ' Description=' + quoteattr(f['description']) +
            ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
            '  <JsonFileName>/Workflows/' + base + '.json</JsonFileName>\n'
            '  <Type>1</Type>\n  <Subprocess>0</Subprocess>\n  <Category>5</Category>\n  <Mode>0</Mode>\n  <Scope>4</Scope>\n'
            '  <OnDemand>0</OnDemand>\n  <TriggerOnCreate>0</TriggerOnCreate>\n  <TriggerOnDelete>0</TriggerOnDelete>\n'
            '  <AsyncAutodelete>0</AsyncAutodelete>\n  <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>\n'
            '  <StateCode>' + ('1' if on else '0') + '</StateCode>\n  <StatusCode>' + ('2' if on else '1') + '</StatusCode>\n'
            '  <RunAs>1</RunAs>\n  <IsTransacted>1</IsTransacted>\n  <IntroducedVersion>' + VERSION + '</IntroducedVersion>\n'
            '  <IsCustomizable>1</IsCustomizable>\n  <BusinessProcessType>0</BusinessProcessType>\n'
            '  <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>\n'
            '  <ModernFlowType>0</ModernFlowType>\n  <PrimaryEntity>none</PrimaryEntity>\n'
            '  <LocalizedNames>\n    <LocalizedName languagecode="1033" description=' + quoteattr(f['name']) + ' />\n  </LocalizedNames>\n'
            '</Workflow>\n')


def env_var_xml(ev):
    return ('<environmentvariabledefinition schemaname="' + ev['schema'] + '">\n'
            '  <description default=' + quoteattr(ev['description']) + '>\n'
            '    <label description=' + quoteattr(ev['description']) + ' languagecode="1033" />\n  </description>\n'
            '  <displayname default=' + quoteattr(ev['display']) + '>\n'
            '    <label description=' + quoteattr(ev['display']) + ' languagecode="1033" />\n  </displayname>\n'
            '  <introducedversion>' + VERSION + '</introducedversion>\n'
            '  <iscustomizable>1</iscustomizable>\n'
            '  <isrequired>1</isrequired>\n'
            '  <secretstore>0</secretstore>\n'
            '  <type>100000000</type>\n'
            '</environmentvariabledefinition>\n')


def generate():
    flows = build_all()
    if os.path.isdir(SRC):
        shutil.rmtree(SRC)
    write(os.path.join(SRC, 'Other', 'Solution.xml'), solution_xml(flows))
    write(os.path.join(SRC, 'Other', 'Customizations.xml'), customizations_xml())
    for ev in ENV_VARS:
        write(os.path.join(SRC, 'environmentvariabledefinitions', ev['schema'], 'environmentvariabledefinition.xml'), env_var_xml(ev))
    for f in flows:
        base = file_base(f['name'], f['id'])
        write(os.path.join(SRC, 'Workflows', base + '.json'), json.dumps(f['json'], indent=2, ensure_ascii=False) + '\n')
        write(os.path.join(SRC, 'Workflows', base + '.json.data.xml'), workflow_data_xml(f, base))
    return flows


def pac():
    for c in ('pac', os.path.expanduser('~/.dotnet/tools/pac')):
        if shutil.which(c) or os.path.exists(c):
            return c
    return None


def pack(flows):
    exe = pac()
    if not exe:
        print('pac (Power Platform CLI) not found – src/ generated and validated, zip not rebuilt.')
        return False
    if os.path.exists(ZIP):
        os.remove(ZIP)
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1', PAC_CLI_TELEMETRY_OPTOUT='1')
    r = subprocess.run([exe, 'solution', 'pack', '--zipfile', ZIP, '--folder', SRC, '--packagetype', 'Unmanaged'],
                       capture_output=True, text=True, env=env)
    print(r.stdout[-1500:], r.stderr[-1500:])
    if r.returncode != 0 or not os.path.exists(ZIP):
        raise SystemExit('pac solution pack failed')
    # round trip: unpack into a temp folder and compare the flow JSON
    tmp = os.path.join(ROOT, '.roundtrip')
    shutil.rmtree(tmp, ignore_errors=True)
    r = subprocess.run([exe, 'solution', 'unpack', '--zipfile', ZIP, '--folder', tmp, '--packagetype', 'Unmanaged',
                        '--allowDelete', 'true', '--allowWrite', 'true'], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        print(r.stdout[-1500:], r.stderr[-1500:])
        raise SystemExit('pac solution unpack (round trip) failed')
    for f in flows:
        base = file_base(f['name'], f['id'])
        with open(os.path.join(tmp, 'Workflows', base + '.json'), encoding='utf-8-sig') as fh:
            back = json.load(fh)
        assert back == f['json'], 'round trip changed ' + f['name']
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(ZIP) as z:
        names = sorted(z.namelist())
    print('zip contents:', ', '.join(names))
    for need in ('solution.xml', 'customizations.xml', '[Content_Types].xml'):
        assert need in names, need + ' missing from zip'
    assert sum(1 for n in names if n.startswith('Workflows/') and n.endswith('.json')) == len(flows)
    assert sum(1 for n in names if n.startswith('environmentvariabledefinitions/')) >= len(ENV_VARS)
    return True


if __name__ == '__main__':
    flows = generate()
    problems = validate.validate_all(flows)
    if problems:
        print('\n'.join(problems))
        raise SystemExit('{0} validation problem(s)'.format(len(problems)))
    print('validation: {0} flows OK'.format(len(flows)))
    with open(BUILDER, 'w', encoding='utf-8') as fh:
        fh.write(legacy.builder_html(flows))
    print('legacy builder:', os.path.relpath(BUILDER, ROOT))
    if pack(flows):
        print('packed:', os.path.relpath(ZIP, ROOT))
