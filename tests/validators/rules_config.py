"""Configuration tests (directive §55–§58).

Two kinds of result matter here and must never be conflated:

  PASS     the check ran and the configuration satisfies it
  BLOCKED  the check could not run because the controlled source that would
           populate the configuration was not supplied

A BLOCKED check is not a pass. Directive §77 forbids reporting it as one.
"""
from __future__ import annotations

import collections
import json
import pathlib

import jsonschema
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from .model import Finding, Severity

_CONFIG_DIR = pathlib.Path(__file__).resolve().parents[2] / "config"
_SCHEMA_DIR = _CONFIG_DIR / "schemas"

SECTIONS = ["A1", "A2", "B", "C", "D"]

# Quoted verbatim from directive §56. The test asserts the shipped
# configuration matches; it does not re-derive the schedule from anything.
EXPECTED_SCHEDULE = {
    1: ["A1", "A2", "B"],
    2: ["A1", "A2", "C"],
    3: ["A1", "A2", "B"],
    4: ["A1", "A2", "D"],
    5: ["A1", "A2", "B", "C"],
    6: ["A1", "A2"],
    7: ["A1", "A2", "B"],
    8: ["A1", "A2", "C"],
    9: ["A1", "A2", "B"],
    10: ["A1", "A2", "D"],
    11: ["A1", "A2", "B", "C"],
    12: ["A1", "A2"],
}


def _load(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _schema_registry() -> Registry:
    """Every schema in config/schemas, addressable by filename and by $id."""
    resources = []
    for schema_path in sorted(_SCHEMA_DIR.glob("*.json")):
        schema = _load(schema_path)
        resource = Resource.from_contents(schema, default_specification=DRAFT202012)
        resources.append((schema_path.name, resource))
        if "$id" in schema and schema["$id"] != schema_path.name:
            resources.append((schema["$id"], resource))
    return Registry().with_resources(resources)


def _blocked(rule: str, config_path: pathlib.Path, note: str) -> Finding:
    return Finding(
        rule=rule,
        severity=Severity.BLOCKED,
        message=f"Cannot run: {config_path.name} carries no controlled data.",
        location=str(config_path),
        detail=note,
    )


def _is_unpopulated(config: dict, key: str) -> bool:
    return not config.get(key) or config.get("source", {}).get("document") == "SOURCE_REQUIRED"


# --------------------------------------------------------------------------
# Schema conformance
# --------------------------------------------------------------------------
def schema_conformance(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    findings: list[Finding] = []
    registry = _schema_registry()

    targets = [
        (config_dir / "survey-schedule.json", "survey-schedule.schema.json"),
        (config_dir / "controlled" / "point-register.json", "point-register.schema.json"),
        (config_dir / "controlled" / "instrument-register.json", "instrument-register.schema.json"),
        (config_dir / "controlled" / "rwp-config.json", "rwp-config.schema.json"),
        (config_dir / "controlled" / "alert-rules.json", "alert-rules.schema.json"),
    ]
    for config_path, schema_name in targets:
        if not config_path.exists():
            findings.append(
                Finding(
                    rule="R200 config-present",
                    severity=Severity.ERROR,
                    message=f"Missing configuration file {config_path.name}.",
                    location=str(config_path),
                )
            )
            continue
        schema = _load(_SCHEMA_DIR / schema_name)
        validator = jsonschema.Draft202012Validator(schema, registry=registry)
        try:
            validator.validate(_load(config_path))
        except jsonschema.ValidationError as exc:
            findings.append(
                Finding(
                    rule="R201 config-schema-conformance",
                    severity=Severity.ERROR,
                    message=f"{config_path.name} does not conform to {schema_name}.",
                    location="/".join(str(p) for p in exc.absolute_path) or config_path.name,
                    detail=exc.message,
                )
            )
    return findings


# --------------------------------------------------------------------------
# §56 month schedule
# --------------------------------------------------------------------------
def month_schedule(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    path = config_dir / "survey-schedule.json"
    if not path.exists():
        return [
            Finding(
                rule="R210 month-schedule-present",
                severity=Severity.ERROR,
                message="survey-schedule.json is missing.",
                location=str(path),
            )
        ]

    config = _load(path)
    findings: list[Finding] = []
    by_month = {entry["month"]: entry for entry in config.get("months", [])}

    missing = sorted(set(EXPECTED_SCHEDULE) - set(by_month))
    if missing:
        findings.append(
            Finding(
                rule="R211 month-schedule-completeness",
                severity=Severity.ERROR,
                message=f"Schedule is missing months: {missing}. All 12 months must be defined (§55).",
                location=str(path),
            )
        )

    for month, expected_sections in EXPECTED_SCHEDULE.items():
        entry = by_month.get(month)
        if entry is None:
            continue
        actual = sorted(entry.get("sections", []))
        if actual != sorted(expected_sections):
            findings.append(
                Finding(
                    rule="R212 month-schedule-sections",
                    severity=Severity.ERROR,
                    message=(
                        f"Month {month} ({entry.get('name')}) is configured as "
                        f"{actual}, expected {sorted(expected_sections)} (§56)."
                    ),
                    location=str(path),
                )
            )

    declared = set(config.get("sections", []))
    if declared != set(SECTIONS):
        findings.append(
            Finding(
                rule="R213 declared-sections",
                severity=Severity.ERROR,
                message=f"Declared sections {sorted(declared)}, expected {SECTIONS}.",
                location=str(path),
            )
        )

    # A1 and A2 are due every month; the test states that explicitly so a
    # future edit that drops one from a month is caught.
    for month, entry in sorted(by_month.items()):
        for always in ("A1", "A2"):
            if always not in entry.get("sections", []):
                findings.append(
                    Finding(
                        rule="R214 monthly-section-membership",
                        severity=Severity.ERROR,
                        message=f"Section {always} is due every month but is absent from month {month} (§56).",
                        location=str(path),
                    )
                )
    return findings


# --------------------------------------------------------------------------
# §55 point register
# --------------------------------------------------------------------------
def point_register(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    path = config_dir / "controlled" / "point-register.json"
    if not path.exists():
        return [
            Finding(
                rule="R220 point-register-present",
                severity=Severity.ERROR,
                message="point-register.json is missing.",
                location=str(path),
            )
        ]

    config = _load(path)
    if _is_unpopulated(config, "points"):
        note = (
            "Point count, Point 7a, Point 33, PointID uniqueness, level and "
            "A1/A2/B/C/D membership, required measurements and map hit areas "
            "all remain unverified. Import the controlled register (C07 / the "
            "1.0.0.8 baseline) and re-run."
        )
        return [_blocked("R221 point-register-integrity", path, note)]

    findings: list[Finding] = []
    points = config["points"]
    ids = [p["pointId"] for p in points]

    duplicates = [pid for pid, count in collections.Counter(ids).items() if count > 1]
    if duplicates:
        findings.append(
            Finding(
                rule="R222 duplicate-point-id",
                severity=Severity.ERROR,
                message=f"Duplicate PointIDs: {sorted(duplicates)} (§55).",
                location=str(path),
            )
        )

    for required in ("7a", "33"):
        if required not in ids:
            findings.append(
                Finding(
                    rule="R223 required-point-present",
                    severity=Severity.ERROR,
                    message=f"Point '{required}' is absent from the register (§55).",
                    location=str(path),
                )
            )

    covered = {section for p in points for section in p.get("sections", [])}
    for section in SECTIONS:
        if section not in covered:
            findings.append(
                Finding(
                    rule="R224 section-membership",
                    severity=Severity.ERROR,
                    message=f"No point is a member of section {section} (§55).",
                    location=str(path),
                )
            )

    for point in points:
        if not point.get("level"):
            findings.append(
                Finding(
                    rule="R225 level-membership",
                    severity=Severity.ERROR,
                    message=f"Point {point['pointId']} has no level assigned (§55).",
                    location=str(path),
                )
            )
        if not point.get("measurements"):
            findings.append(
                Finding(
                    rule="R226 required-measurements",
                    severity=Severity.ERROR,
                    message=f"Point {point['pointId']} defines no required measurements (§55).",
                    location=str(path),
                )
            )
        for measurement in point.get("measurements", []):
            if not measurement.get("unit"):
                findings.append(
                    Finding(
                        rule="R227 measurement-unit",
                        severity=Severity.ERROR,
                        message=(
                            f"Measurement '{measurement.get('measurementId')}' at point "
                            f"{point['pointId']} has no unit. Units are always shown next to "
                            "the input (§29)."
                        ),
                        location=str(path),
                    )
                )
    return findings


# --------------------------------------------------------------------------
# §55 / §57 instrument register
# --------------------------------------------------------------------------
def instrument_register(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    path = config_dir / "controlled" / "instrument-register.json"
    if not path.exists():
        return [
            Finding(
                rule="R230 instrument-register-present",
                severity=Severity.ERROR,
                message="instrument-register.json is missing.",
                location=str(path),
            )
        ]

    config = _load(path)
    if _is_unpopulated(config, "instruments"):
        note = (
            "Capability matching, component/pairing integrity, serial and "
            "calibration requirements and background requirements remain "
            "unverified. The directive names FH40 G-L10 + FHZ 512A, Electra and "
            "RadEye SX detector combinations as systems whose pairing is "
            "currently missing (§4.5); that cannot be confirmed or fixed "
            "without the controlled register."
        )
        return [_blocked("R231 instrument-register-integrity", path, note)]

    findings: list[Finding] = []
    capability_ids = {c["capabilityId"] for c in config.get("capabilities", [])}
    seen_definitions: set[str] = set()

    for instrument in config["instruments"]:
        definition_id = instrument["instrumentDefinitionId"]
        if definition_id in seen_definitions:
            findings.append(
                Finding(
                    rule="R232 duplicate-instrument-definition",
                    severity=Severity.ERROR,
                    message=f"Duplicate InstrumentDefinitionID '{definition_id}'.",
                    location=str(path),
                )
            )
        seen_definitions.add(definition_id)

        components = instrument.get("components", [])
        roles = [c["role"] for c in components]

        if roles.count("Primary") != 1:
            findings.append(
                Finding(
                    rule="R233 component-primary",
                    severity=Severity.ERROR,
                    message=(
                        f"System '{definition_id}' declares {roles.count('Primary')} Primary "
                        "components; exactly one is required."
                    ),
                    location=str(path),
                )
            )

        # §4.5 — a ratemeter/probe or base-unit/probe system must actually
        # declare its second component, not fold it into the primary record.
        if instrument["systemType"] in ("RatemeterProbe", "BaseUnitProbe") and len(components) < 2:
            findings.append(
                Finding(
                    rule="R234 incomplete-pair",
                    severity=Severity.ERROR,
                    message=(
                        f"System '{definition_id}' is declared as {instrument['systemType']} but "
                        "has only one component. Probe/detector combinations must be modelled as "
                        "separate components (§4.5)."
                    ),
                    location=str(path),
                )
            )

        component_ids = [c["componentId"] for c in components]
        duplicate_components = [
            cid for cid, count in collections.Counter(component_ids).items() if count > 1
        ]
        if duplicate_components:
            findings.append(
                Finding(
                    rule="R235 duplicate-component-id",
                    severity=Severity.ERROR,
                    message=f"System '{definition_id}' has duplicate ComponentIDs {duplicate_components}.",
                    location=str(path),
                )
            )

        declared_capabilities = {
            cap for component in components for cap in component.get("capabilities", [])
        }
        unknown = declared_capabilities - capability_ids
        if unknown:
            findings.append(
                Finding(
                    rule="R236 unknown-capability",
                    severity=Severity.ERROR,
                    message=(
                        f"System '{definition_id}' references capabilities not in the capability "
                        f"list: {sorted(unknown)}."
                    ),
                    location=str(path),
                )
            )
        if instrument.get("active") and not declared_capabilities:
            findings.append(
                Finding(
                    rule="R237 capability-coverage",
                    severity=Severity.ERROR,
                    message=f"Active system '{definition_id}' satisfies no capability.",
                    location=str(path),
                )
            )
    return findings


# --------------------------------------------------------------------------
# §41 RWP configuration
# --------------------------------------------------------------------------
def rwp_config(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    path = config_dir / "controlled" / "rwp-config.json"
    if not path.exists():
        return [
            Finding(
                rule="R240 rwp-config-present",
                severity=Severity.ERROR,
                message="rwp-config.json is missing.",
                location=str(path),
            )
        ]

    config = _load(path)
    if _is_unpopulated(config, "rwps"):
        return [
            _blocked(
                "R241 rwp-config-integrity",
                path,
                "RWP identities, revisions, required capabilities and MUST KNOW content "
                "are controlled facts and were not supplied.",
            )
        ]

    findings: list[Finding] = []
    instrument_path = config_dir / "controlled" / "instrument-register.json"
    known_capabilities: set[str] = set()
    if instrument_path.exists():
        known_capabilities = {
            c["capabilityId"] for c in _load(instrument_path).get("capabilities", [])
        }

    for rwp in config["rwps"]:
        if not rwp.get("revision"):
            findings.append(
                Finding(
                    rule="R242 rwp-revision",
                    severity=Severity.ERROR,
                    message=f"RWP '{rwp['rwpId']}' has no revision. The revision is displayed to the technician (§13).",
                    location=str(path),
                )
            )
        unknown = set(rwp.get("requiredCapabilities", [])) - known_capabilities
        if known_capabilities and unknown:
            findings.append(
                Finding(
                    rule="R243 rwp-capability-resolvable",
                    severity=Severity.ERROR,
                    message=(
                        f"RWP '{rwp['rwpId']}' requires capabilities that no instrument declares: "
                        f"{sorted(unknown)}. This is the RWP/capability conflict case in §13."
                    ),
                    location=str(path),
                )
            )
    return findings


# --------------------------------------------------------------------------
# §58 alert boundaries
# --------------------------------------------------------------------------
def evaluate_rule(rule: dict, value: float) -> str:
    """The single place threshold comparison is decided.

    Equality is never inferred. Whatever the rule's `atThreshold` says is what
    happens at exactly the threshold — including "ReviewRequired" where the
    controlling document is ambiguous (§58).
    """
    threshold = rule["threshold"]
    if value < threshold:
        return rule["belowThreshold"]
    if value > threshold:
        return rule["aboveThreshold"]
    return rule["atThreshold"]


def alert_boundaries(config_dir: pathlib.Path | None = None) -> list[Finding]:
    config_dir = config_dir or _CONFIG_DIR
    path = config_dir / "controlled" / "alert-rules.json"
    if not path.exists():
        return [
            Finding(
                rule="R250 alert-rules-present",
                severity=Severity.ERROR,
                message="alert-rules.json is missing.",
                location=str(path),
            )
        ]

    config = _load(path)
    if _is_unpopulated(config, "rules"):
        return [
            _blocked(
                "R251 alert-boundary-cases",
                path,
                "Radiation thresholds are controlled facts described in the master brief, "
                "which was not supplied. The below/at/above harness is implemented and "
                "self-tested against synthetic rules, but no real threshold has been exercised.",
            )
        ]

    findings: list[Finding] = []
    for rule in config["rules"]:
        # Every rule must be exercised at all three boundary positions.
        for offset, expected_key in ((-1e-9, "belowThreshold"), (0.0, "atThreshold"), (1e-9, "aboveThreshold")):
            value = rule["threshold"] + offset
            outcome = evaluate_rule(rule, value)
            if outcome != rule[expected_key]:
                findings.append(
                    Finding(
                        rule="R252 boundary-evaluation",
                        severity=Severity.ERROR,
                        message=(
                            f"Rule '{rule['ruleId']}' evaluated {outcome} at {value}, "
                            f"expected {rule[expected_key]}."
                        ),
                        location=str(path),
                    )
                )
        if rule["atThreshold"] == "NoAction" and rule["aboveThreshold"] != "NoAction":
            findings.append(
                Finding(
                    rule="R253 equality-resolution",
                    severity=Severity.WARNING,
                    message=(
                        f"Rule '{rule['ruleId']}' silently passes the exact-threshold case while "
                        "the above-threshold case acts. Confirm the controlling document resolves "
                        "equality; otherwise atThreshold must be \"ReviewRequired\" (§58)."
                    ),
                    location=str(path),
                )
            )
    return findings


CHECKS = (
    schema_conformance,
    month_schedule,
    point_register,
    instrument_register,
    rwp_config,
    alert_boundaries,
)


def run_all(config_dir: pathlib.Path | None = None) -> list[Finding]:
    findings: list[Finding] = []
    for check in CHECKS:
        findings.extend(check(config_dir))
    return findings
