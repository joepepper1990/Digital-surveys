"""Power Fx static analysers.

The headline analyser is `cross_record_instrument_state`. Defects 4.1, 4.2 and
4.3 in the 1.0.0.9 directive are three instances of one class:

    a control that presents instrument X derives its state from instrument Y

Testing only the three known formulas would let the next instance ship. These
analysers therefore look for the *shape* of the defect, driven by
tests/rules/static-analysis.json.
"""
from __future__ import annotations

import collections
import json
import pathlib
import re

from .model import Finding, Severity
from .pa_source import CanvasSource, Control

_RULES_PATH = pathlib.Path(__file__).resolve().parents[1] / "rules" / "static-analysis.json"

# LookUp(colInstruments, Key="Neutron").CalDue
#         ^collection      ^keyprop ^literal  ^field
_LOOKUP = re.compile(
    r"""LookUp\s*\(\s*
        (?P<collection>[A-Za-z_][A-Za-z0-9_]*)\s*,\s*
        (?P<keyprop>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*
        "(?P<literal>[^"]*)"\s*
        (?:,[^()]*)?\)
        (?:\s*\.\s*(?P<field>[A-Za-z_][A-Za-z0-9_]*))?""",
    re.VERBOSE,
)

_VERSION_LITERAL = re.compile(r"(?<![\d.])(?P<v>\d+\.\d+\.\d+\.\d+)(?![\d.])")


def load_rules(path: str | pathlib.Path | None = None) -> dict:
    return json.loads(pathlib.Path(path or _RULES_PATH).read_text(encoding="utf-8"))


class _Access:
    """One LookUp against an instrument collection, with where it appeared."""

    __slots__ = ("collection", "keyprop", "literal", "field", "prop")

    def __init__(self, collection, keyprop, literal, field, prop):
        self.collection = collection
        self.keyprop = keyprop
        self.literal = literal
        self.field = field or ""
        self.prop = prop

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"{self.prop}: LookUp({self.collection},{self.keyprop}=\"{self.literal}\").{self.field}"


def _accesses(control: Control, collections_of_interest: set[str]) -> list[_Access]:
    found = []
    for prop, expression in control.formulas.items():
        for match in _LOOKUP.finditer(expression):
            if match.group("collection") in collections_of_interest:
                found.append(
                    _Access(
                        match.group("collection"),
                        match.group("keyprop"),
                        match.group("literal"),
                        match.group("field"),
                        prop,
                    )
                )
    return found


def _exception_keys(rules: dict, control: Control) -> set[str]:
    for entry in rules.get("documentedExceptions", []):
        if entry.get("control") in (control.name, control.path):
            return set(entry.get("keys", []))
    return set()


def cross_record_instrument_state(source: CanvasSource, rules: dict) -> list[Finding]:
    """A control must not derive state for instrument X from instrument Y.

    Three independent shapes are reported:

    A. one control reads *state* fields for two or more different instrument
       keys (defect 4.1 shape);
    B. a display property reads one instrument record while a state/colour
       property reads a different one (defect 4.2 shape);
    C. a display property reads a paired-component field while the state
       property reads the primary component's counterpart (defect 4.3 shape).
    """
    findings: list[Finding] = []
    of_interest = set(rules["instrumentCollections"])
    state_fields = set(rules["stateFields"])
    display_props = set(rules["displayProperties"])
    state_props = set(rules["stateProperties"])
    pair_prefix = rules.get("pairedFieldPrefix", "Pair")

    for control in source.controls:
        accesses = _accesses(control, of_interest)
        if not accesses:
            continue
        allowed = _exception_keys(rules, control)

        # --- Shape A: more than one instrument key behind state fields -------
        state_keys = {a.literal for a in accesses if a.field in state_fields}
        if len(state_keys - allowed) > 1:
            detail = "; ".join(sorted(repr(a) for a in accesses if a.field in state_fields))
            findings.append(
                Finding(
                    rule="R001/A cross-record-instrument-state",
                    severity=Severity.ERROR,
                    message=(
                        f"Control derives instrument state from {len(state_keys)} different "
                        f"records ({', '.join(sorted(state_keys))}). A control must represent "
                        "one instrument record unless the mix is a documented exception."
                    ),
                    location=control.location,
                    detail=detail,
                )
            )

        # --- Shape B: display record != state record -------------------------
        display_keys = {a.literal for a in accesses if a.prop in display_props}
        colour_keys = {a.literal for a in accesses if a.prop in state_props}
        mismatch = (display_keys | colour_keys) - allowed
        if display_keys and colour_keys and display_keys != colour_keys and len(mismatch) > 1:
            findings.append(
                Finding(
                    rule="R001/B display-state-record-mismatch",
                    severity=Severity.ERROR,
                    message=(
                        f"Control displays instrument {sorted(display_keys)} but derives its "
                        f"visual state from {sorted(colour_keys)}. Colour must follow the record "
                        "that is displayed."
                    ),
                    location=control.location,
                    detail="; ".join(sorted(repr(a) for a in accesses)),
                )
            )

        # --- Shape C: paired display, primary state --------------------------
        display_fields = {a.field for a in accesses if a.prop in display_props and a.field}
        state_fields_used = {a.field for a in accesses if a.prop in state_props and a.field}
        for shown in display_fields:
            if not shown.startswith(pair_prefix):
                continue
            primary = shown[len(pair_prefix):]
            if primary and primary in state_fields_used:
                findings.append(
                    Finding(
                        rule="R001/C paired-component-state-mismatch",
                        severity=Severity.ERROR,
                        message=(
                            f"Control displays the paired component field '{shown}' but derives "
                            f"its state from the primary component field '{primary}'. Primary and "
                            "paired components require independent state (§4.3)."
                        ),
                        location=control.location,
                        detail="; ".join(sorted(repr(a) for a in accesses)),
                    )
                )
    return findings


def self_resolving_alerts(source: CanvasSource, rules: dict) -> list[Finding]:
    """An alert must not be created already Resolved (defect 4.4).

    Flags any expression that writes Status:"Resolved" in the same statement
    that records a failure, and any Patch/Collect that sets Status:"Resolved"
    with no accompanying disposition field.
    """
    findings: list[Finding] = []
    resolved = re.compile(r'Status\s*:\s*"Resolved"', re.IGNORECASE)
    fail_words = re.compile(r'"(Fail(ed)?|PostUseFail|PreUseFail)"', re.IGNORECASE)
    disposition = re.compile(r"\bDisposition\w*\s*:", re.IGNORECASE)

    for formula in source.formulas:
        expression = formula.expression
        if not resolved.search(expression):
            continue
        if fail_words.search(expression):
            findings.append(
                Finding(
                    rule="R002 self-resolving-failure-alert",
                    severity=Severity.ERROR,
                    message=(
                        "A failure is recorded and its alert is created with Status=\"Resolved\" "
                        "in the same expression. The failure would never reach review (§4.4)."
                    ),
                    location=formula.location,
                    detail=expression.strip()[:400],
                )
            )
        elif not disposition.search(expression):
            findings.append(
                Finding(
                    rule="R002 alert-resolved-without-disposition",
                    severity=Severity.WARNING,
                    message=(
                        "Alert set to Status=\"Resolved\" with no disposition recorded. "
                        "Resolution must be explicit and attributable (§25, §48)."
                    ),
                    location=formula.location,
                    detail=expression.strip()[:400],
                )
            )
    return findings


def history_used_as_authority(source: CanvasSource, rules: dict) -> list[Finding]:
    """Current capability coverage must not be satisfied from history (§4.6)."""
    findings: list[Finding] = []
    history = set(rules["historyCollections"])
    coverage = re.compile(r"\b(CountRows|CountIf|LookUp|Filter|First)\b")
    capability_hint = re.compile(r"(?i)capabilit|coverage|required")

    for formula in source.formulas:
        for name in history:
            if name not in formula.expression:
                continue
            if coverage.search(formula.expression) and capability_hint.search(
                formula.expression + " " + formula.control
            ):
                findings.append(
                    Finding(
                        rule="R009 history-as-capability-authority",
                        severity=Severity.ERROR,
                        message=(
                            f"Capability coverage is being derived from the history collection "
                            f"'{name}'. History/audit data must never be the authoritative source "
                            "for the currently valid active instrument set (§4.6)."
                        ),
                        location=formula.location,
                        detail=formula.expression.strip()[:400],
                    )
                )
                break
    return findings


def background_subtraction(source: CanvasSource, rules: dict) -> list[Finding]:
    """Background must never be automatically subtracted from a reading (§53)."""
    findings: list[Finding] = []
    bkg = "|".join(re.escape(f) for f in rules["backgroundFields"])
    rdg = "|".join(re.escape(f) for f in rules["readingFields"])
    qual = r"(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)*"
    pattern = re.compile(
        rf"{qual}(?:{rdg})\w*\s*-\s*{qual}(?:{bkg})\w*"
        rf"|{qual}(?:{bkg})\w*\s*-\s*{qual}(?:{rdg})\w*",
        re.IGNORECASE,
    )

    for formula in source.formulas:
        if pattern.search(formula.expression):
            findings.append(
                Finding(
                    rule="R008 automatic-background-subtraction",
                    severity=Severity.ERROR,
                    message=(
                        "Background appears to be subtracted from a reading. Raw reading and "
                        "background must be stored and shown separately (§53)."
                    ),
                    location=formula.location,
                    detail=formula.expression.strip()[:400],
                )
            )
    return findings


def duplicate_control_names(source: CanvasSource, rules: dict) -> list[Finding]:
    counts = collections.Counter(c.name for c in source.controls if c.name)
    findings = []
    for name, count in sorted(counts.items()):
        if count > 1:
            where = [c.location for c in source.controls if c.name == name]
            findings.append(
                Finding(
                    rule="R004 duplicate-control-name",
                    severity=Severity.ERROR,
                    message=f"Control name '{name}' is declared {count} times.",
                    location=where[0],
                    detail="also at: " + "; ".join(where[1:]),
                )
            )
    return findings


def stale_control_references(source: CanvasSource, rules: dict) -> list[Finding]:
    """Formulas referencing a control name that no longer exists (§42)."""
    known = {c.name for c in source.controls if c.name}
    if not known:
        return []
    # Only consider Name.Property references, which is how one control reads another.
    reference = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]{2,})\s*\.\s*(?:Text|Value|Selected|Fill|Visible|SelectedItems|Result)\b")
    # Anything that is a known control, a collection, a variable or a function is fine.
    ignorable = re.compile(r"^(col|var|gbl|loc|Self|Parent|ThisItem|ThisRecord|App|Acr|Color|Font|Align|Display|Screen)")

    findings: list[Finding] = []
    for formula in source.formulas:
        for match in reference.finditer(formula.expression):
            name = match.group(1)
            if name in known or ignorable.match(name):
                continue
            findings.append(
                Finding(
                    rule="R003 stale-control-reference",
                    severity=Severity.WARNING,
                    message=f"Formula references '{name}', which is not a control in this app.",
                    location=formula.location,
                    detail=formula.expression.strip()[:300],
                )
            )
    return findings


def forbidden_and_stale_references(source: CanvasSource, rules: dict) -> list[Finding]:
    """Known-forbidden legacy strings and superseded version literals (§5, §42)."""
    findings: list[Finding] = []
    patterns = [(re.compile(e["pattern"]), e["reason"]) for e in rules["forbiddenReferences"]]
    superseded = set(rules["supersededVersions"])
    authoritative = rules["authoritativeVersion"]

    for formula in source.formulas:
        for pattern, reason in patterns:
            if pattern.search(formula.expression):
                findings.append(
                    Finding(
                        rule="R005 forbidden-legacy-reference",
                        severity=Severity.ERROR,
                        message=reason,
                        location=formula.location,
                        detail=formula.expression.strip()[:300],
                    )
                )
        for match in _VERSION_LITERAL.finditer(formula.expression):
            found = match.group("v")
            if found in superseded and found != authoritative:
                findings.append(
                    Finding(
                        rule="R006 superseded-version-literal",
                        severity=Severity.ERROR,
                        message=(
                            f"Superseded version literal \"{found}\" is presented as current. "
                            f"Derive from the single authoritative app-version value ({authoritative}, §5)."
                        ),
                        location=formula.location,
                        detail=formula.expression.strip()[:300],
                    )
                )
    return findings


def rwp_branching(source: CanvasSource, rules: dict) -> list[Finding]:
    """RWP-dependent behaviour must be table-driven, not branched in screens (§41)."""
    pattern = re.compile(r"(?i)\bIf\s*\([^)]*[A-Za-z_]*RWP\w*\s*=\s*\"", re.DOTALL)
    return [
        Finding(
            rule="R013 hard-coded-rwp-branch",
            severity=Severity.WARNING,
            message=(
                "RWP identity is branched on inside a control formula. RWP-dependent behaviour "
                "belongs in rwp-config.json (§41)."
            ),
            location=formula.location,
            detail=formula.expression.strip()[:300],
        )
        for formula in source.formulas
        if pattern.search(formula.expression)
    ]


def hidden_controls_still_evaluating(source: CanvasSource, rules: dict) -> list[Finding]:
    """Controls hard-coded invisible that still carry non-trivial logic (§42, §46)."""
    findings: list[Finding] = []
    for control in source.controls:
        visible = control.formulas.get("Visible", "").strip()
        if visible.lower().replace(" ", "") not in ("=false",):
            continue
        heavy = [
            prop
            for prop, expression in control.formulas.items()
            if prop != "Visible" and len(expression) > 80
        ]
        if heavy:
            findings.append(
                Finding(
                    rule="R012 hidden-control-still-evaluating",
                    severity=Severity.WARNING,
                    message=(
                        f"Control is Visible=false but still carries {len(heavy)} non-trivial "
                        "formula(s), which continue to evaluate. Remove or quarantine it (§42)."
                    ),
                    location=control.location,
                    detail="properties: " + ", ".join(sorted(heavy)),
                )
            )
    return findings


def screen_control_density(source: CanvasSource, rules: dict) -> list[Finding]:
    """Guard against recreating the monolithic 621-control screen (§4.9)."""
    budget = rules["screenControlBudget"]
    per_screen: collections.Counter = collections.Counter()
    for control in source.controls:
        root = control.path.split("/")[0] if control.path else control.file
        per_screen[root] += 1
    return [
        Finding(
            rule="R011 screen-control-density",
            severity=Severity.WARNING,
            message=(
                f"Screen '{screen}' declares {count} controls, over the budget of {budget}. "
                "1.0.0.8 concentrated ~621 controls on one physical screen; do not recreate it (§4.9)."
            ),
            location=screen,
        )
        for screen, count in sorted(per_screen.items())
        if count > budget
    ]


ANALYSERS = (
    cross_record_instrument_state,
    self_resolving_alerts,
    history_used_as_authority,
    background_subtraction,
    duplicate_control_names,
    stale_control_references,
    forbidden_and_stale_references,
    rwp_branching,
    hidden_controls_still_evaluating,
    screen_control_density,
)


def run_all(source: CanvasSource, rules: dict | None = None) -> list[Finding]:
    rules = rules or load_rules()
    findings: list[Finding] = []
    for analyser in ANALYSERS:
        findings.extend(analyser(source, rules))
    return findings
