"""The checks must catch real mistakes: each deliberately broken copy of the flow (or the package) must be rejected.
    python3 test_validate.py
"""
import copy
import io
import json
import sys
import unittest
import zipfile

import build_solution
import check_package
import flows
import validate

GOOD = flows.build_all(raw=True)   # the checks below break steps by their short names


def broken(change):
    fl = copy.deepcopy(GOOD)
    change(fl[0]['json']['properties']['definition'], fl[0])
    return validate.validate_all(fl)


def find(defn, name):
    def walk(actions):
        for n, a in actions.items():
            if n == name:
                return a
            for k in ('actions',):
                if k in a:
                    r = walk(a[k])
                    if r:
                        return r
            if 'else' in a:
                r = walk(a['else']['actions'])
                if r:
                    return r
            for c in (a.get('cases') or {}).values():
                r = walk(c['actions'])
                if r:
                    return r
            if a.get('default'):
                r = walk(a['default']['actions'])
                if r:
                    return r
        return None
    return walk(defn['actions'])


class BrokenFlowsAreRejected(unittest.TestCase):
    def test_the_real_flow_passes(self):
        self.assertEqual(validate.validate_all(copy.deepcopy(GOOD)), [])

    def expect(self, change, fragment):
        probs = broken(change)
        self.assertTrue(any(fragment in p for p in probs), probs)

    def test_expression_too_long(self):
        long_expr = "@concat(" + ", ".join(["'x'"] * 2100) + ")"
        self.expect(lambda d, f: find(d, 'Folder_name').__setitem__('inputs', long_expr), 'over the 8192 Power Automate allows')

    def test_unknown_function(self):
        self.expect(lambda d, f: find(d, 'Folder_name').__setitem__('inputs', "@lastItem(split('a', '/'))"), 'unknown function lastItem')

    def test_unbalanced_expression(self):
        self.expect(lambda d, f: find(d, 'Folder_name').__setitem__('inputs', "@last(split('a', '/')"), 'unclosed bracket')

    def test_reference_to_a_missing_action(self):
        self.expect(lambda d, f: find(d, 'Requester').__setitem__('inputs', "@first(body('Get_requesters')?['value'])"), "no such action")

    def test_runafter_outside_the_container(self):
        self.expect(lambda d, f: find(d, 'Verdict_R').__setitem__('runAfter', {'Get_request': ['Succeeded']}), 'not in the same container')

    def test_uninitialised_variable(self):
        self.expect(lambda d, f: find(d, 'Set_tx').__setitem__('inputs', {'name': 'varNope', 'value': 1}), 'unknown variable varNope')

    def test_set_variable_reading_itself(self):
        # Power Automate refuses to save such a step ("Self reference is not supported"), so the flow cannot be turned on
        def change(d, f):
            d['actions']['Self_ref'] = {'type': 'SetVariable', 'runAfter': {}, 'inputs': {'name': next(iter(
                v['name'] for a in d['actions'].values() if a.get('type') == 'InitializeVariable' for v in a['inputs']['variables'])),
                'value': None}}
            name = d['actions']['Self_ref']['inputs']['name']
            d['actions']['Self_ref']['inputs']['value'] = "@variables('" + name + "')"
        self.expect(change, 'Self reference is not supported')

    def test_outputs_of_a_filter_step_used_as_a_list(self):
        # Power Automate: outputs() of a Filter array step is {"body": [...]}; a Filter array 'from' it fails at run time
        fl = copy.deepcopy(GOOD)
        hit = [one for one in fl if find(one['json']['properties']['definition'], 'Pdf_retry')]
        self.assertTrue(hit)
        find(hit[0]['json']['properties']['definition'], 'Pdf_retry')['inputs']['from'] = "@outputs('Pdf_all')"
        probs = validate.validate_all(fl)
        self.assertTrue(any('is an object, not a list' in p for p in probs), probs)

    def test_empty_create_array(self):
        # Power Automate: createArray() with no parameters fails at run time (found on the site, 24 Oct 2026)
        fl = copy.deepcopy(GOOD)
        fl[0]['json']['properties']['definition']['actions']['Empty_list'] = {'type': 'Compose', 'inputs': '@createArray()', 'runAfter': {}}
        probs = validate.validate_all(fl)
        self.assertTrue(any('createArray() with no parameters' in p for p in probs), probs)

    def test_windows_time_zone_on_an_outlook_event(self):
        # The Outlook V4 event actions take the connector's display names, not 'GMT Standard Time'
        fl = copy.deepcopy(GOOD)
        hit = []
        for one in fl:
            def walk(actions):
                for n, a in actions.items():
                    if a.get('type') == 'OpenApiConnection' and a['inputs']['host']['operationId'] == 'V4CalendarPatchItem':
                        a['inputs']['parameters']['item/timeZone'] = 'GMT Standard Time'
                        hit.append(n)
                    for k in ('actions',):
                        if k in a:
                            walk(a[k])
                    if 'else' in a:
                        walk(a['else']['actions'])
                    for c in (a.get('cases') or {}).values():
                        walk(c['actions'])
                    if a.get('default'):
                        walk(a['default']['actions'])
            walk(one['json']['properties']['definition']['actions'])
        self.assertTrue(hit)
        probs = validate.validate_all(fl)
        self.assertTrue(any('defined enum values' in p for p in probs), probs)

    def test_secure_data_on_set_variable(self):
        self.expect(lambda d, f: find(d, 'Set_tx').__setitem__('runtimeConfiguration', {'secureData': {'properties': ['inputs']}}), 'not supported on a SetVariable')

    def test_premium_http_action(self):
        self.expect(lambda d, f: find(d, 'Try')['actions'].__setitem__('Call_out', {'type': 'Http', 'inputs': {}, 'runAfter': {'Get_request': ['Succeeded']}}), 'premium or not allowed')

    def test_misspelt_column_in_a_rest_call(self):
        def change(d, f):
            a = find(d, 'Get_requester')
            a['inputs']['parameters']['parameters/uri'] = a['inputs']['parameters']['parameters/uri'].replace('SiteUserId,Role', 'SiteUserID,Role')
        self.expect(change, 'column SiteUserID is not in People')

    def test_trigger_not_secured(self):
        self.expect(lambda d, f: d['triggers']['When_a_request_is_submitted'].pop('runtimeConfiguration'), 'trigger When_a_request_is_submitted is not secured')

    def test_connector_list_step_instead_of_rest(self):
        def change(d, f):
            a = find(d, 'Get_requester')
            a['inputs']['host']['operationId'] = 'GetItems'
            a['inputs']['parameters'] = {'dataset': a['inputs']['parameters']['dataset'], 'table': 'People'}
        self.expect(change, 'write and read lists by REST')

    def test_nesting_too_deep(self):
        def change(d, f):
            inner = {'Deep': {'type': 'Compose', 'inputs': 'x', 'runAfter': {}}}
            for i in range(9):
                inner = {'Level_{0}'.format(i): {'type': 'Scope', 'actions': inner, 'runAfter': {}}}
            d['actions']['Too_deep'] = dict(list(inner.values())[0], runAfter={'Catch': ['Succeeded', 'Skipped']})
        self.expect(change, 'nested at level 9')

    def test_unused_connection_reference(self):
        def change(d, f):
            f['json']['properties']['connectionReferences']['shared_office365users'] = {'runtimeSource': 'embedded'}
        self.expect(change, 'declared but unused')

    def test_an_email_showing_typed_text_unescaped(self):
        def change(d, f):
            a = find(d, 'Html_R')
            a['inputs'] += "@{items('Each_new_notice_R')?['title']}"
        self.expect(change, 'a typed value is not HTML-escaped')

    def test_hidden_failure(self):
        self.expect(lambda d, f: find(d, 'Requester').__setitem__('runAfter', {'Get_requester': ['Succeeded', 'Skipped']}), 'upstream failure would be hidden')


class BrokenPackagesAreRejected(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ref = zipfile.ZipFile(io.BytesIO(check_package.reference_bytes()))
        cls.files, _, _ = build_solution.build()

    def package(self, edit):
        files = [(n, edit(n, t)) for n, t in self.files]
        return zipfile.ZipFile(io.BytesIO(build_solution.zip_bytes(files)))

    def test_the_real_package_passes(self):
        z = self.package(lambda n, t: t)
        self.assertEqual(check_package.compare(self.ref, z) + check_package.own_checks(z), [])

    def test_missing_workflow_element_child(self):
        z = self.package(lambda n, t: t.replace('      <RunAs>1</RunAs>\n', '') if n == 'customizations.xml' else t)
        self.assertTrue(any('Workflow element differs' in p for p in check_package.compare(self.ref, z)))

    def test_lf_line_endings_in_a_flow(self):
        z = self.package(lambda n, t: t.replace('\r\n', '\n') if n.startswith('Workflows/') else t)
        self.assertTrue(any('encoding' in p for p in check_package.compare(self.ref, z)))

    def test_no_bom_on_solution_xml(self):
        z = self.package(lambda n, t: t.lstrip('﻿') if n == 'solution.xml' else t)
        self.assertTrue(any('solution.xml: encoding' in p for p in check_package.compare(self.ref, z)))

    def test_wrong_prefix_on_environment_variable(self):
        z = self.package(lambda n, t: t.replace('schemaName="esghub_', 'schemaName="esg_') if n == 'solution.xml' else t)
        self.assertTrue(any('publisher prefix' in p or 'does not define' in p for p in check_package.own_checks(z)))


if __name__ == '__main__':
    result = unittest.main(exit=False, verbosity=1).result
    sys.exit(0 if result.wasSuccessful() else 1)
