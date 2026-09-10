"""The analysers must fire on the defect fixture and stay silent on the clean one.

This is what makes the suite a regression test for the defect CLASS rather than
for three specific formulas (directive §54).
"""
import pathlib

import pytest

from validators import pa_source, rules_static
from validators.model import Severity

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="module")
def defective():
    return rules_static.run_all(pa_source.load(FIXTURES / "defective"))


@pytest.fixture(scope="module")
def clean():
    return rules_static.run_all(pa_source.load(FIXTURES / "clean"))


def _rules(findings):
    return {f.rule.split()[0] for f in findings}


def test_clean_fixture_is_silent(clean):
    assert clean == [], "\n".join(f.render() for f in clean)


def test_clean_fixture_actually_has_content():
    # Guards against the clean fixture passing because nothing parsed.
    source = pa_source.load(FIXTURES / "clean")
    assert len(source.controls) >= 10
    assert not source.parse_errors


@pytest.mark.parametrize(
    "rule,description",
    [
        ("R001/A", "defect 4.1 shape: one control, two instrument records"),
        ("R001/B", "defect 4.2 shape: display record != colour record"),
        ("R001/C", "defect 4.3 shape: paired display, primary state"),
        ("R002", "defect 4.4 shape: failure alert created already Resolved"),
        ("R003", "stale control reference"),
        ("R004", "duplicate control name"),
        ("R005", "forbidden legacy reference"),
        ("R006", "superseded version literal presented as current"),
        ("R008", "automatic background subtraction"),
        ("R009", "history used as capability authority"),
        ("R012", "hidden control still evaluating"),
        ("R013", "RWP branched in a screen formula"),
    ],
)
def test_rule_fires_on_defective_fixture(defective, rule, description):
    assert rule in _rules(defective), f"{rule} did not fire for: {description}"


def test_cross_record_findings_are_errors(defective):
    cross = [f for f in defective if f.rule.startswith("R001")]
    assert cross
    assert all(f.severity is Severity.ERROR for f in cross)


def test_cross_record_detector_is_key_agnostic():
    """The detector must not be hard-coded to the Neutron/Extra pair."""
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    source.controls.append(
        pa_source.Control(
            name="lblAlphaStatus",
            path="Screen/lblAlphaStatus",
            type="Label",
            file="synthetic",
            formulas={
                "Text": '=LookUp(colInstruments, Key="Alpha").Serial',
                "Fill": '=If(LookUp(colInstruments, Key="ReactorCO2").PostCheck = "Fail", Color.Red, Color.Green)',
            },
        )
    )
    findings = rules_static.cross_record_instrument_state(source, rules_static.load_rules())
    assert {f.rule.split()[0] for f in findings} >= {"R001/A", "R001/B"}


def test_documented_exception_suppresses_finding():
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    source.controls.append(
        pa_source.Control(
            name="lblComparison",
            path="Screen/lblComparison",
            type="Label",
            file="synthetic",
            formulas={
                "Text": '=LookUp(colInstruments, Key="Alpha").Serial',
                "Fill": '=If(LookUp(colInstruments, Key="Beta").PostCheck = "Fail", Color.Red, Color.Green)',
            },
        )
    )
    rules = rules_static.load_rules()
    rules["documentedExceptions"] = [
        {"control": "lblComparison", "keys": ["Alpha", "Beta"], "reason": "deliberate side-by-side comparison"}
    ]
    assert rules_static.cross_record_instrument_state(source, rules) == []


def test_single_record_control_is_not_flagged():
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    source.controls.append(
        pa_source.Control(
            name="lblGammaStatus",
            path="Screen/lblGammaStatus",
            type="Label",
            file="synthetic",
            formulas={
                "Text": '=LookUp(colInstruments, Key="Gamma").Serial',
                "Fill": '=If(LookUp(colInstruments, Key="Gamma").PostCheck = "Fail", Color.Red, Color.Green)',
            },
        )
    )
    assert rules_static.cross_record_instrument_state(source, rules_static.load_rules()) == []


# --- R009 precision (1.1.0.6) ----------------------------------------------
# R009 was tightened after it reported ten findings against 1.1.0.5 that were
# all co-presence noise. These tests pin both halves: the rule must still fire
# on history genuinely used as the capability authority, and must stay silent
# on an audit log that is merely written alongside a capability mention.

def _one(control_name, formulas):
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    source.controls.append(
        pa_source.Control(name=control_name, path=f"Scr/{control_name}",
                          type="Label", file="synthetic", formulas=formulas)
    )
    return source


def test_history_as_authority_still_fires_on_the_real_shape():
    source = _one("lblCoverage", {
        "Text": '=CountRows(Filter(colInstrumentHistory, RequiredCapability = varCapability))'
                ' & " capabilities covered"',
    })
    findings = rules_static.history_used_as_authority(source, rules_static.load_rules())
    assert [f.rule.split()[0] for f in findings] == ["R009"]


def test_history_as_authority_fires_when_lookup_is_the_query():
    source = _one("lblCap", {
        "Visible": '=Not(IsBlank(LookUp(colInstrumentHistory, Capability = varRequiredCapabilityCode)))',
    })
    assert rules_static.history_used_as_authority(source, rules_static.load_rules())


def test_audit_write_beside_a_capability_mention_is_not_a_finding():
    # The 1.1.0.5 shape: an OnSelect that records an audit row and also names a
    # required capability. Nothing is being decided from the audit log.
    source = _one("btnDraftSave", {
        "OnSelect": '=Collect(colAuditLog,{AuditID:Text(GUID()),EventType:"INSTRUMENT_ISSUED",'
                    'Detail:"issued"});Set(varRequiredCapabilityCode,"");'
                    'Set(varView,"Instruments")',
    })
    assert rules_static.history_used_as_authority(source, rules_static.load_rules()) == []


def test_audit_log_counted_for_display_is_not_a_finding():
    # The Team Leader card counting entry-error corrections: an audit log used
    # as an audit log.
    source = _one("cardTLCorrections", {
        "Text": '="ENTRY-ERROR CORRECTIONS" & Char(10) & '
                'CountRows(Filter(colAuditLog,SurveyID=varSurveyID && EventType="ENTRY_ERROR_CLEARED"))',
    })
    assert rules_static.history_used_as_authority(source, rules_static.load_rules()) == []


def test_colaudit_does_not_match_colauditlog_by_substring():
    rules = rules_static.load_rules()
    assert "colAudit" in rules["historyCollections"]
    source = _one("lblRequired", {
        "Text": '=CountRows(Filter(colAuditLog, Capability = varRequiredCapabilityCode))',
    })
    # colAuditLog is a different collection from the configured colAudit.
    findings = rules_static.history_used_as_authority(source, rules)
    assert all("colAudit'" not in f.message for f in findings)


# --- R002 precision (1.1.0.6) ----------------------------------------------
# R002 reported 16 findings against 1.1.0.5: four real creations in retired
# controls, plus the schema seed and 22 legitimate resolutions. It now
# distinguishes creating an alert from closing one.

def test_alert_created_already_resolved_still_fires():
    # The real 1.1.0.5 shape: the post-use result is patched to "Fail" and the
    # alert for it is created already Resolved, in one handler.
    source = _one("btnPostGamma", {
        "OnSelect": '=Patch(colInstruments,LookUp(colInstruments,Key="Gamma"),'
                    '{PostCheck:"Fail"}); Collect(colAlerts,{AlertKey:"INST_POST_Gamma",'
                    'RuleCode:"INSTRUMENT_POST_FAIL",Status:"Resolved"})',
    })
    findings = rules_static.self_resolving_alerts(source, rules_static.load_rules())
    assert [f.rule.split()[0] for f in findings] == ["R002"]
    assert findings[0].severity is Severity.ERROR


def test_patch_that_closes_an_existing_alert_is_not_a_finding():
    source = _one("numDone", {
        "OnSelect": '=If(Not(IsBlank(LookUp(colPointData,PointID=varSelectedPoint).Dose05m)),'
                    'Patch(colAlerts,LookUp(colAlerts,AlertKey=Text(varSelectedPoint)&"-DOSE05M_REQ"),'
                    '{Status:"Resolved"}))',
    })
    assert rules_static.self_resolving_alerts(source, rules_static.load_rules()) == []


def test_schema_seed_row_removed_in_the_same_expression_is_not_an_alert():
    source = _one("App", {
        "OnVisible": '=ClearCollect(colAlerts,{AlertKey:"SEED",PointID:0,RuleCode:"",'
                     'Status:"Resolved",Action:"",Comment:""}); RemoveIf(colAlerts,AlertKey="SEED")',
    })
    assert rules_static.self_resolving_alerts(source, rules_static.load_rules()) == []


def test_seed_that_is_never_removed_is_still_reported():
    source = _one("App", {
        "OnVisible": '=ClearCollect(colAlerts,{AlertKey:"SEED",Status:"Resolved"})',
    })
    assert rules_static.self_resolving_alerts(source, rules_static.load_rules())


def test_live_post_use_path_creating_an_open_alert_is_not_a_finding():
    source = _one("btnReturnPost2_1", {
        "OnSelect": '=Collect(colAlerts,{AlertKey:akey,RuleCode:"INSTRUMENT_POST_FAIL",'
                    'Message:"component 2 failed the post-use check",Status:"Open"})',
    })
    assert rules_static.self_resolving_alerts(source, rules_static.load_rules()) == []
