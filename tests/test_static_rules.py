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
