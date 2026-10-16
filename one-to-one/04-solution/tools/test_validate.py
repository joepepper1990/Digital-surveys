"""Proves the validator catches real mistakes: each mutation below must produce at least one problem.

    python3 tools/test_validate.py
"""
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from flows import build_all  # noqa: E402
import validate  # noqa: E402


def find(defn, name):
    stack = [defn['actions']]
    while stack:
        c = stack.pop()
        if name in c:
            return c, c[name]
        for a in c.values():
            if 'actions' in a:
                stack.append(a['actions'])
            if 'else' in a:
                stack.append(a['else']['actions'])
    raise KeyError(name)


def mutate_json(flow, old, new):
    s = json.dumps(flow['json'])
    assert old in s, old
    flow['json'] = json.loads(s.replace(old, new, 1))


MUTATIONS = []


def mutation(fn):
    MUTATIONS.append(fn)
    return fn


@mutation
def wrong_action_reference(fl):
    mutate_json(fl[1], "outputs('ReviewKey')", "outputs('Review_Key')")


@mutation
def items_outside_loop(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Send_E7')
    a['inputs']['parameters']['emailMessage/Subject'] = "@{items('Each_technician')?['Title']}"


@mutation
def unknown_column_in_patch(fl):
    _, a = find(fl[2]['json']['properties']['definition'], 'Stamp_submitted')
    a['inputs']['parameters']['item/SubmitedOn'] = '@utcNow()'


@mutation
def unknown_column_in_filter(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Get_technicians')
    a['inputs']['parameters']['$filter'] = 'Actve eq 1'


@mutation
def broken_json_body(fl):
    _, a = find(fl[0]['json']['properties']['definition'], 'Create_list')
    a['inputs']['parameters']['parameters/body'] = a['inputs']['parameters']['parameters/body'].replace('"BaseTemplate":100,', '"BaseTemplate":100')


@mutation
def unbalanced_expression(fl):
    _, a = find(fl[3]['json']['properties']['definition'], 'Cmd')
    a['inputs'] = "@triggerBody()?['ReviewState']?['Value'"


@mutation
def unknown_function(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'MonthKey')
    a['inputs'] = "@formatDate(outputs('ukNow'), 'yyyy-MM')"


@mutation
def uninitialised_variable(fl):
    mutate_json(fl[1], "variables('varProblems')", "variables('varProblem')")


@mutation
def run_after_non_sibling(fl):
    c, a = find(fl[2]['json']['properties']['definition'], 'Desired')
    a['runAfter'] = {'Send_E3': ['Succeeded']}


@mutation
def reference_into_other_loop(fl):
    _, a = find(fl[0]['json']['properties']['definition'], 'Email_summary')
    a['inputs']['parameters']['emailMessage/Subject'] = "@{body('Create_field')}"


@mutation
def unknown_list(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Get_technicians')
    a['inputs']['parameters']['table'] = 'Technician'


@mutation
def missing_required_param(fl):
    _, a = find(fl[3]['json']['properties']['definition'], 'Stamp_released')
    del a['inputs']['parameters']['id']


@mutation
def undeclared_parameter(fl):
    mutate_json(fl[2], "parameters('ESG 1-to-1 Team Leader email (esg_ManagerEmail)')", "parameters('TL email')")


@mutation
def unused_connection(fl):
    fl[2]['json']['properties']['connectionReferences']['shared_office365users'] = {
        'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': 'x'}, 'api': {'name': 'shared_office365users'}}


@mutation
def item_outside_query(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Day')
    a['inputs'] = "@item()?['x']"


@mutation
def orphan_action(fl):
    c, a = find(fl[1]['json']['properties']['definition'], 'MonthName')
    a['runAfter'] = {'MonthName': ['Succeeded']}


@mutation
def time_zone_without_start(fl):
    del fl[1]['json']['properties']['definition']['triggers']['Recurrence']['recurrence']['startTime']


@mutation
def continue_after_skipped(fl):
    c, a = find(fl[0]['json']['properties']['definition'], 'Group_needs_read')
    a['runAfter'] = {'I_have_direct_access': ['Succeeded', 'Failed', 'Skipped', 'TimedOut']}


@mutation
def unsecured_trigger(fl):
    t = list(fl[2]['json']['properties']['definition']['triggers'].values())[0]
    del t['runtimeConfiguration']['secureData']


@mutation
def unsecured_filter(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Outstanding_linked')
    del a['runtimeConfiguration']


@mutation
def new_list_by_connector(fl):
    # 1.1.0.0's Flow 1 failed to turn on after an upgrade from 1.0 because of a step like this
    _, a = find(fl[1]['json']['properties']['definition'], 'Get_technicians')
    a['inputs']['parameters'] = {'dataset': a['inputs']['parameters']['dataset'], 'table': 'Wellbeing Assessments'}


@mutation
def unsecured_record_compose(fl):
    _, a = find(fl[2]['json']['properties']['definition'], 'Mgr')
    del a['runtimeConfiguration']


@mutation
def new_list_by_url(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Get_technicians')
    a['inputs']['parameters'] = {'dataset': a['inputs']['parameters']['dataset'], 'table': 'Lists/WellbeingAssessments'}



@mutation
def new_column_by_connector_in_daily(fl):
    # Flow 1 is on during an upgrade: writing a 1.3 column with a connector step would break it until Setup has run
    _, a = find(fl[1]['json']['properties']['definition'], 'Stamp_LinkSentOn')
    a['inputs']['parameters']['item/ChallengeState/Value'] = 'Open'


@mutation
def secure_set_variable(fl):
    # 1.3.0.1: Set variable has no secure inputs; the setting stopped Flow 1 importing
    _, a = find(fl[1]['json']['properties']['definition'], 'Set_varTechAad')
    a['runtimeConfiguration'] = {'secureData': {'properties': ['inputs']}}


@mutation
def late_column_by_connector_create(fl):
    # a 1.4 column on an existing list written by a connector Create item step (the 1.3.0.2 activation failure)
    _, a = find(fl[1]['json']['properties']['definition'], 'Create_review')
    a['inputs']['parameters']['item/AppraisalBoundaries'] = '[]'


@mutation
def premium_connector(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'Send_E16')
    a['inputs']['host']['connectionName'] = 'shared_webcontents'


@mutation
def premium_http_action(fl):
    defn = fl[7]['json']['properties']['definition']
    _, a = find(defn, 'Mark_sending')
    a['type'] = 'Http'


@mutation
def amendment_record_unsecured(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'Get_current')
    a.pop('runtimeConfiguration', None)


# run-history leaks the security review showed the pattern-based rules missed (1.4)
@mutation
def compose_holds_audit_content(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'AmIds')
    a['inputs'] = "@triggerBody()?['ChangesJson']"


@mutation
def compose_holds_whole_trigger_item(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'AmIds')
    a['inputs'] = "@triggerBody()"


@mutation
def terminate_message_carries_reason(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'Already_handled')
    a['inputs'] = {'runStatus': 'Failed', 'runError': {'message': "@{triggerBody()?['Reason']}"}}


@mutation
def variable_holds_review_answer(fl):
    _, a = find(fl[1]['json']['properties']['definition'], 'Set_varTechAad')
    a['inputs']['value'] = "@items('Each_technician')?['Q1WentWell']"


@mutation
def exempt_step_carries_reason_in_uri(fl):
    _, a = find(fl[7]['json']['properties']['definition'], 'Get_lists')
    a['inputs']['parameters']['parameters/uri'] += "&r=@{triggerBody()?['Reason']}"


if __name__ == '__main__':
    base = build_all()
    assert validate.validate_all(base) == [], 'baseline must be clean'
    failed = 0
    for m in MUTATIONS:
        fl = copy.deepcopy(base)
        m(fl)
        probs = validate.validate_all(fl)
        ok = bool(probs) and (m.__name__ not in ('new_list_by_connector', 'new_list_by_url') or any('read it by REST' in p for p in probs))
        failed += not ok
        print(('PASS ' if ok else 'FAIL ') + m.__name__ + ('  → ' + probs[0] if probs else ''))
    print('\n{0} / {1} mutations caught'.format(len(MUTATIONS) - failed, len(MUTATIONS)))
    sys.exit(1 if failed else 0)
