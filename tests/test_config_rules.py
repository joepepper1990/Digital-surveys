"""Configuration validator tests (§55–§58)."""
import copy
import json
import pathlib
import shutil

import pytest

from validators import rules_config
from validators.model import Severity

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"


@pytest.fixture
def config_dir(tmp_path):
    """A writable copy of the shipped configuration."""
    destination = tmp_path / "config"
    shutil.copytree(CONFIG, destination)
    return destination


def _write(path: pathlib.Path, data) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _errors(findings):
    return [f for f in findings if f.severity is Severity.ERROR]


def _rules(findings):
    return {f.rule.split()[0] for f in findings}


# --------------------------------------------------------------------------
# Shipped configuration
# --------------------------------------------------------------------------
def test_shipped_config_conforms_to_schemas():
    assert _errors(rules_config.schema_conformance(CONFIG)) == []


def test_shipped_month_schedule_matches_directive():
    findings = rules_config.month_schedule(CONFIG)
    assert _errors(findings) == [], "\n".join(f.render() for f in findings)


@pytest.mark.parametrize(
    "month,sections",
    sorted(rules_config.EXPECTED_SCHEDULE.items()),
)
def test_each_month_has_the_expected_sections(month, sections):
    """§56 spelled out one month at a time, so a failure names the month."""
    config = json.loads((CONFIG / "survey-schedule.json").read_text())
    entry = next(m for m in config["months"] if m["month"] == month)
    assert sorted(entry["sections"]) == sorted(sections)


def test_controlled_registers_report_blocked_not_passed():
    """An empty controlled register must never look like a clean pass (§77)."""
    for check in (
        rules_config.point_register,
        rules_config.instrument_register,
        rules_config.rwp_config,
        rules_config.alert_boundaries,
    ):
        findings = check(CONFIG)
        assert findings, f"{check.__name__} silently passed on empty controlled data"
        assert all(f.severity is Severity.BLOCKED for f in findings)


# --------------------------------------------------------------------------
# Month schedule mutations must be caught
# --------------------------------------------------------------------------
def test_dropped_section_is_detected(config_dir):
    path = config_dir / "survey-schedule.json"
    config = json.loads(path.read_text())
    config["months"][4]["sections"] = ["A1", "A2", "B"]  # May loses C
    _write(path, config)
    assert "R212" in _rules(_errors(rules_config.month_schedule(config_dir)))


def test_missing_month_is_detected(config_dir):
    path = config_dir / "survey-schedule.json"
    config = json.loads(path.read_text())
    config["months"] = config["months"][:11]
    _write(path, config)
    assert "R211" in _rules(_errors(rules_config.month_schedule(config_dir)))


def test_month_without_a1_is_detected(config_dir):
    path = config_dir / "survey-schedule.json"
    config = json.loads(path.read_text())
    config["months"][5]["sections"] = ["A2"]  # June loses A1
    _write(path, config)
    rules = _rules(_errors(rules_config.month_schedule(config_dir)))
    assert {"R212", "R214"} & rules


# --------------------------------------------------------------------------
# Point register
# --------------------------------------------------------------------------
def _point(point_id, **overrides):
    point = {
        "pointId": point_id,
        "displayName": f"Point {point_id}",
        "level": "Ground",
        "sections": ["A1"],
        "measurements": [
            {
                "measurementId": f"{point_id}-dr",
                "capabilityId": "GammaDoseRate",
                "label": "Contact dose rate",
                "unit": "uSv/h",
                "mandatory": True,
            }
        ],
        "source": {"document": "C07", "verified": True},
    }
    point.update(overrides)
    return point


def _populate_points(config_dir, points):
    path = config_dir / "controlled" / "point-register.json"
    _write(
        path,
        {
            "configId": "point-register",
            "source": {"document": "C07", "revision": "test", "verified": True},
            "points": points,
        },
    )
    return path


def test_populated_point_register_passes(config_dir):
    points = [_point("7a"), _point("33"), _point("1", sections=["A2"]),
              _point("2", sections=["B"]), _point("3", sections=["C"]),
              _point("4", sections=["D"])]
    _populate_points(config_dir, points)
    findings = rules_config.point_register(config_dir)
    assert _errors(findings) == [], "\n".join(f.render() for f in findings)


def test_duplicate_point_id_is_detected(config_dir):
    _populate_points(config_dir, [_point("7a"), _point("7a"), _point("33")])
    assert "R222" in _rules(_errors(rules_config.point_register(config_dir)))


@pytest.mark.parametrize("missing", ["7a", "33"])
def test_required_points_are_checked(config_dir, missing):
    present = [p for p in ("7a", "33") if p != missing]
    _populate_points(config_dir, [_point(p) for p in present])
    assert "R223" in _rules(_errors(rules_config.point_register(config_dir)))


def test_measurement_without_unit_is_detected(config_dir):
    point = _point("7a")
    point["measurements"][0]["unit"] = ""
    _populate_points(config_dir, [point, _point("33")])
    assert "R227" in _rules(_errors(rules_config.point_register(config_dir)))


def test_uncovered_section_is_detected(config_dir):
    # Nothing is a member of D.
    _populate_points(config_dir, [_point("7a"), _point("33"), _point("1", sections=["A2"]),
                                  _point("2", sections=["B"]), _point("3", sections=["C"])])
    assert "R224" in _rules(_errors(rules_config.point_register(config_dir)))


# --------------------------------------------------------------------------
# Instrument register (§57)
# --------------------------------------------------------------------------
BASE_REGISTER = {
    "configId": "instrument-register",
    "source": {"document": "test", "verified": True},
    "capabilities": [
        {"capabilityId": "GammaDoseRate", "displayName": "Gamma Dose Rate", "unit": "uSv/h"},
        {"capabilityId": "BetaGamma", "displayName": "Beta/Gamma Contamination", "unit": "cps",
         "backgroundRequired": True},
    ],
    "instruments": [
        {
            "instrumentDefinitionId": "SINGLE-1",
            "displayName": "Single unit monitor",
            "baseModel": "Model S",
            "systemType": "SingleUnit",
            "active": True,
            "source": {"document": "test", "verified": True},
            "components": [
                {
                    "componentId": "SINGLE-1-P",
                    "role": "Primary",
                    "model": "Model S",
                    "serialRequired": True,
                    "calibrationRequired": True,
                    "preUseRequired": True,
                    "postUseRequired": True,
                    "capabilities": ["GammaDoseRate"],
                }
            ],
        },
        {
            "instrumentDefinitionId": "PAIR-1",
            "displayName": "Ratemeter and probe",
            "baseModel": "Model R",
            "systemType": "RatemeterProbe",
            "active": True,
            "source": {"document": "test", "verified": True},
            "components": [
                {
                    "componentId": "PAIR-1-RM",
                    "role": "Primary",
                    "model": "Model R",
                    "serialRequired": True,
                    "calibrationRequired": True,
                    "preUseRequired": True,
                    "postUseRequired": True,
                    "capabilities": [],
                },
                {
                    "componentId": "PAIR-1-PR",
                    "role": "Probe",
                    "model": "Probe P",
                    "serialRequired": True,
                    "calibrationRequired": True,
                    "preUseRequired": True,
                    "postUseRequired": True,
                    "backgroundRequired": True,
                    "capabilities": ["BetaGamma"],
                },
            ],
        },
    ],
}


def _populate_instruments(config_dir, register):
    _write(config_dir / "controlled" / "instrument-register.json", register)


def test_populated_instrument_register_passes(config_dir):
    _populate_instruments(config_dir, copy.deepcopy(BASE_REGISTER))
    findings = rules_config.instrument_register(config_dir)
    assert _errors(findings) == [], "\n".join(f.render() for f in findings)


def test_incomplete_pair_is_detected(config_dir):
    """§4.5 — a ratemeter/probe system that declares only one component."""
    register = copy.deepcopy(BASE_REGISTER)
    register["instruments"][1]["components"] = register["instruments"][1]["components"][:1]
    _populate_instruments(config_dir, register)
    assert "R234" in _rules(_errors(rules_config.instrument_register(config_dir)))


def test_unknown_capability_is_detected(config_dir):
    register = copy.deepcopy(BASE_REGISTER)
    register["instruments"][0]["components"][0]["capabilities"] = ["Neutron"]
    _populate_instruments(config_dir, register)
    assert "R236" in _rules(_errors(rules_config.instrument_register(config_dir)))


def test_duplicate_definition_is_detected(config_dir):
    register = copy.deepcopy(BASE_REGISTER)
    register["instruments"].append(copy.deepcopy(register["instruments"][0]))
    _populate_instruments(config_dir, register)
    assert "R232" in _rules(_errors(rules_config.instrument_register(config_dir)))


def test_two_primary_components_is_detected(config_dir):
    register = copy.deepcopy(BASE_REGISTER)
    register["instruments"][1]["components"][1]["role"] = "Primary"
    _populate_instruments(config_dir, register)
    assert "R233" in _rules(_errors(rules_config.instrument_register(config_dir)))


def test_active_instrument_with_no_capability_is_detected(config_dir):
    register = copy.deepcopy(BASE_REGISTER)
    register["instruments"][0]["components"][0]["capabilities"] = []
    _populate_instruments(config_dir, register)
    assert "R237" in _rules(_errors(rules_config.instrument_register(config_dir)))


# --------------------------------------------------------------------------
# RWP configuration (§13, §41)
# --------------------------------------------------------------------------
def test_rwp_requiring_unavailable_capability_is_detected(config_dir):
    _populate_instruments(config_dir, copy.deepcopy(BASE_REGISTER))
    _write(
        config_dir / "controlled" / "rwp-config.json",
        {
            "configId": "rwp-config",
            "source": {"document": "test", "verified": True},
            "rwps": [
                {
                    "rwpId": "TEST-1",
                    "displayName": "Test RWP",
                    "revision": "1",
                    "requiredCapabilities": ["GammaDoseRate", "Neutron"],
                    "source": {"document": "test", "verified": True},
                }
            ],
        },
    )
    assert "R243" in _rules(_errors(rules_config.rwp_config(config_dir)))


def test_rwp_without_revision_is_detected(config_dir):
    _write(
        config_dir / "controlled" / "rwp-config.json",
        {
            "configId": "rwp-config",
            "source": {"document": "test", "verified": True},
            "rwps": [
                {
                    "rwpId": "TEST-1",
                    "displayName": "Test RWP",
                    "revision": "",
                    "requiredCapabilities": [],
                    "source": {"document": "test", "verified": True},
                }
            ],
        },
    )
    assert "R242" in _rules(_errors(rules_config.rwp_config(config_dir)))


# --------------------------------------------------------------------------
# Alert boundaries (§58)
# --------------------------------------------------------------------------
def _rule(**overrides):
    rule = {
        "ruleId": "TEST-1",
        "capabilityId": "GammaDoseRate",
        "unit": "uSv/h",
        "threshold": 7.5,
        "belowThreshold": "NoAction",
        "atThreshold": "ReviewRequired",
        "aboveThreshold": "ActionRequired",
        "source": {"document": "test", "verified": True},
    }
    rule.update(overrides)
    return rule


@pytest.mark.parametrize(
    "value,expected",
    [(7.4, "NoAction"), (7.5, "ReviewRequired"), (7.6, "ActionRequired")],
)
def test_below_at_above_are_evaluated_distinctly(value, expected):
    assert rules_config.evaluate_rule(_rule(), value) == expected


def test_ambiguous_equality_never_silently_passes():
    """§58 — an unresolved equality case must be ReviewRequired, not NoAction."""
    assert rules_config.evaluate_rule(_rule(), 7.5) == "ReviewRequired"


def test_equality_resolution_warning_is_raised(config_dir):
    _write(
        config_dir / "controlled" / "alert-rules.json",
        {
            "configId": "alert-rules",
            "source": {"document": "test", "verified": True},
            "rules": [_rule(atThreshold="NoAction")],
        },
    )
    findings = rules_config.alert_boundaries(config_dir)
    assert "R253" in _rules(findings)
    assert all(f.severity is not Severity.BLOCKED for f in findings)


def test_populated_alert_rules_evaluate_cleanly(config_dir):
    _write(
        config_dir / "controlled" / "alert-rules.json",
        {
            "configId": "alert-rules",
            "source": {"document": "test", "verified": True},
            "rules": [_rule(), _rule(ruleId="TEST-2", threshold=0.5, aboveThreshold="Advisory")],
        },
    )
    findings = rules_config.alert_boundaries(config_dir)
    assert _errors(findings) == []
