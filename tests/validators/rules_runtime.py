"""Analysers for the defect classes behind visibly-broken runtime screens.

Static analysis cannot render a screen. It can, however, prove the two things
that made 1.1.0.5 look unfinished in Studio, because both are decidable from
the source:

  * **Geometry** — sibling controls whose rectangles overlap, or that sit
    outside the canvas, are wrong before anything renders. This is the class
    behind the Survey Plan header, where the navigation row crowded the status
    text beneath it.

  * **Unbacked state** — a screen whose every control is conditionally visible,
    or a formula reading a variable or record field that nothing in the
    application ever writes, renders blank. This is the class behind the Sign
    Out Instrument screen, where only CANCEL was visible.

As with `rules_static`, these detect the *shape*, not the two known instances.
A fix to the Survey Plan header alone would not stop the next screen shipping
with the same collision.

Honesty about coverage matters more here than anywhere else in the suite. A
control positioned by a formula this module cannot evaluate is **not checked**,
and `geometry_coverage` reports how many, so that "no collisions found" can
never be mistaken for "the layout was verified". Only Studio proves that (§60).
"""
from __future__ import annotations

import ast
import collections
import re

from .model import Finding, Severity
from .pa_source import CanvasSource, Control
from .powerfx import can_coexist

# --- state writes -----------------------------------------------------------
# Set(varX, ...) / UpdateContext({varX: ...}) / ClearCollect(colX, ...) etc.
_SET = re.compile(r"\bSet\s*\(\s*(?P<name>[A-Za-z_]\w*)\s*,")
_CONTEXT = re.compile(r"\bUpdateContext\s*\(\s*\{(?P<body>[^{}]*)\}")
_CONTEXT_NAME = re.compile(r"(?P<name>[A-Za-z_]\w*)\s*:")
_COLLECTION_WRITE = re.compile(
    r"\b(?:Clear)?Collect\s*\(\s*(?P<name>[A-Za-z_]\w*)\s*,"
    r"|\bClear\s*\(\s*(?P<clear>[A-Za-z_]\w*)\s*\)"
    r"|\bPatch\s*\(\s*(?P<patch>[A-Za-z_]\w*)\s*,"
    r"|\bRemove(?:If)?\s*\(\s*(?P<remove>[A-Za-z_]\w*)\s*[,)]"
)
_WITH_SCOPE = re.compile(r"\bWith\s*\(\s*\{(?P<body>[^{}]*)\}")

# Reads: any identifier using the app's varX / colX naming convention.
_STATE_READ = re.compile(r"\b(?P<name>(?:var|col|loc)[A-Z]\w*)\b")

# Record literals supplied to a collection write, for field-name checking.
_RECORD_WRITE = re.compile(
    r"\b(?:Clear)?Collect\s*\(\s*(?P<name>[A-Za-z_]\w*)\s*,\s*\{(?P<body>[^{}]*)\}"
    r"|\bPatch\s*\(\s*(?P<pname>[A-Za-z_]\w*)\s*,.*?\{(?P<pbody>[^{}]*)\}",
    re.DOTALL,
)
_FIELD_NAME = re.compile(r"(?P<name>[A-Za-z_]\w*)\s*:")

# Reads of a named field off a known collection.
_FIELD_READ = re.compile(
    r"\b(?:LookUp|First|Last)\s*\(\s*(?P<fn_coll>[A-Za-z_]\w*)\b[^()]*(?:\([^()]*\))?[^()]*\)"
    r"\s*\.\s*(?P<fn_field>[A-Za-z_]\w*)"
    r"|\b(?P<coll>(?:col)[A-Z]\w*)\s*\.\s*(?P<field>[A-Za-z_]\w*)"
)

_GEOMETRY_PROPS = ("X", "Y", "Width", "Height")

# Controls a technician touches; these carry the touch-target minimum.
_INTERACTIVE = {
    "Button", "Classic/Button", "Toggle", "Checkbox", "Radio", "Dropdown",
    "Combobox", "Slider", "Rating", "DatePicker", "TextInput", "Classic/TextInput",
    "ListBox", "Icon", "Classic/DropDown",
}

# Layering, not collision: a control that fully contains a sibling is a panel,
# card or backdrop behind it. Only partial overlaps are reported.


def _static_number(expression: str) -> float | None:
    """Evaluate a geometry formula, but only if it is pure arithmetic.

    Returns None for anything referencing a control, parent or function — those
    are not decidable here and must be reported as unchecked, never as clean.
    """
    text = expression.strip()
    if text.startswith("="):
        text = text[1:]
    text = text.strip()
    if not text:
        return None
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError:
        return None

    allowed = (
        ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant,
        ast.Add, ast.Sub, ast.Mult, ast.Div, ast.USub, ast.UAdd,
    )
    for node in ast.walk(tree):
        if not isinstance(node, allowed):
            return None
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            return None
    try:
        value = eval(compile(tree, "<geometry>", "eval"), {"__builtins__": {}}, {})
    except (ZeroDivisionError, ValueError, TypeError):
        return None
    return float(value) if isinstance(value, (int, float)) else None


class _Rect:
    __slots__ = ("control", "x", "y", "w", "h")

    def __init__(self, control: Control, x: float, y: float, w: float, h: float):
        self.control = control
        self.x, self.y, self.w, self.h = x, y, w, h

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h

    def overlap(self, other: "_Rect") -> tuple[float, float]:
        dx = min(self.right, other.right) - max(self.x, other.x)
        dy = min(self.bottom, other.bottom) - max(self.y, other.y)
        return dx, dy

    def contains(self, other: "_Rect") -> bool:
        return (
            self.x <= other.x and self.y <= other.y
            and self.right >= other.right and self.bottom >= other.bottom
        )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"{self.control.name}({self.x:g},{self.y:g},{self.w:g}x{self.h:g})"


def _rect(control: Control) -> _Rect | None:
    values = []
    for prop in _GEOMETRY_PROPS:
        if prop not in control.formulas:
            return None
        value = _static_number(control.formulas[prop])
        if value is None:
            return None
        values.append(value)
    return _Rect(control, *values)


def _visible(control: Control) -> str:
    """The Visible formula, normalised. Absent means visible (Power Fx default)."""
    return control.formulas.get("Visible", "=true").strip().lstrip("=").strip()


_EQ_LITERAL = re.compile(r'^(?P<name>[A-Za-z_][\w.]*)\s*=\s*"(?P<literal>[^"]*)"$')


def _mutually_exclusive(a: str, b: str) -> bool:
    """True when two Visible formulas provably cannot both hold.

    Deliberately conservative: only exact complements are recognised, so an
    unrecognised pair is treated as *able* to collide and gets reported.
    """
    a, b = a.strip(), b.strip()
    if "false" in (a.lower(), b.lower()):
        return True
    ma, mb = _EQ_LITERAL.match(a), _EQ_LITERAL.match(b)
    if ma and mb:
        return (
            ma.group("name") == mb.group("name")
            and ma.group("literal") != mb.group("literal")
        )
    negations = {f"!{a}", f"Not({a})", f"!({a})", f"Not( {a} )"}
    return b in negations or a in {f"!{b}", f"Not({b})", f"!({b})"}


def _parent_of(control: Control) -> str:
    return control.path.rsplit("/", 1)[0] if "/" in control.path else ""


def _screen_of(control: Control) -> str:
    return control.path.split("/")[0] if control.path else control.file


def _is_view_driven(source: CanvasSource) -> bool:
    """True when the app builds its screens by gating siblings on one variable.

    Such an app has no meaningful state-free geometry: nearly every sibling
    pair shares pixels and nearly none shares a moment. `rules_view` answers
    the question properly, per view, so this module stands aside rather than
    restating it thousands of times.
    """
    from .rules_view import discover_views

    return len(discover_views(source)) >= 3


def geometry_collisions(source: CanvasSource, rules: dict) -> list[Finding]:
    """R014 — sibling controls whose rectangles partially overlap.

    The header shape: navigation buttons and the status text beneath them
    occupying the same pixels. Siblings only, so a control sitting inside its
    own container is never reported; and containment is layering, so only
    partial overlaps count.

    On a view-driven app this defers to `R022`, which binds the view first.
    """
    if _is_view_driven(source):
        return []
    tolerance = float(rules.get("geometryOverlapTolerance", 0))
    findings: list[Finding] = []
    by_parent: dict[str, list[_Rect]] = collections.defaultdict(list)
    for control in source.controls:
        rect = _rect(control)
        if rect is not None and _visible(control).lower() != "false":
            by_parent[_parent_of(control)].append(rect)

    for parent, rects in sorted(by_parent.items()):
        for i, first in enumerate(rects):
            for second in rects[i + 1:]:
                if first.contains(second) or second.contains(first):
                    continue
                dx, dy = first.overlap(second)
                if dx <= tolerance or dy <= tolerance:
                    continue
                if _mutually_exclusive(_visible(first.control), _visible(second.control)):
                    continue
                # The cheap complement test above only recognises exact
                # opposites. Ask the solver before reporting: on a single-screen
                # app whose views are all gated on one variable, almost every
                # sibling pair shares pixels and almost none shares a moment.
                if not can_coexist(
                    first.control.formulas.get("Visible"),
                    second.control.formulas.get("Visible"),
                    invariants=rules.get("variableInvariants"),
                ):
                    continue
                findings.append(
                    Finding(
                        rule="R014 control-geometry-collision",
                        severity=Severity.ERROR,
                        message=(
                            f"'{first.control.name}' and '{second.control.name}' overlap by "
                            f"{dx:g}x{dy:g} px and can be visible at the same time. Controls "
                            "that collide render as crowded or clipped."
                        ),
                        location=first.control.location,
                        detail=(
                            f"{first!r} vs {second!r} in '{parent or '(root)'}'"
                        ),
                    )
                )
    return findings


def off_canvas_controls(source: CanvasSource, rules: dict) -> list[Finding]:
    """R015 — a control whose rectangle leaves the canvas is invisible or clipped."""
    width = float(rules.get("canvasWidth", 1440))
    height = float(rules.get("canvasHeight", 960))
    findings: list[Finding] = []
    for control in source.controls:
        if _screen_of(control) == control.path:      # the screen itself
            continue
        if _parent_of(control).count("/"):           # nested: parent-relative
            continue
        rect = _rect(control)
        if rect is None or _visible(control).lower() == "false":
            continue
        breaches = []
        if rect.x < 0:
            breaches.append(f"X={rect.x:g}")
        if rect.y < 0:
            breaches.append(f"Y={rect.y:g}")
        if rect.right > width:
            breaches.append(f"right edge {rect.right:g} > {width:g}")
        if rect.bottom > height:
            breaches.append(f"bottom edge {rect.bottom:g} > {height:g}")
        if breaches:
            findings.append(
                Finding(
                    rule="R015 off-canvas-control",
                    severity=Severity.ERROR,
                    message=(
                        f"'{control.name}' falls outside the {width:g}x{height:g} canvas "
                        f"({'; '.join(breaches)}). It will be clipped or invisible at runtime."
                    ),
                    location=control.location,
                )
            )
    return findings


def touch_target_size(source: CanvasSource, rules: dict) -> list[Finding]:
    """R016 — interactive controls below the minimum touch target (§12, gloves)."""
    minimum = float(rules.get("minimumTouchTargetPx", 48))
    findings: list[Finding] = []
    for control in source.controls:
        if control.type not in _INTERACTIVE:
            continue
        rect = _rect(control)
        if rect is None or _visible(control).lower() == "false":
            continue
        if rect.w < minimum or rect.h < minimum:
            findings.append(
                Finding(
                    rule="R016 touch-target-undersize",
                    severity=Severity.WARNING,
                    message=(
                        f"'{control.name}' is {rect.w:g}x{rect.h:g} px, below the {minimum:g} px "
                        "minimum touch target for gloved tablet use."
                    ),
                    location=control.location,
                )
            )
    return findings


def screens_that_can_render_blank(source: CanvasSource, rules: dict) -> list[Finding]:
    """R017 — a screen that shows nothing in the state it first loads in.

    The Sign Out Instrument shape: every control gated on a variable or draft
    record, so when that state is absent the technician sees an empty page.

    "Unconditionally visible" is the wrong test for a view-driven app, which
    legitimately gates everything — what matters is whether anything is on
    screen at first load. So every variable the app reads is bound to blank,
    which is what Power Fx actually starts with, and the question becomes: does
    this screen render anything at all? A control gated on `IsBlank(varView)`
    answers yes, and is not a defect.
    """
    from .powerfx import UNKNOWN as _U, is_true, visibility

    exempt = set(rules.get("intentionallyConditionalScreens", []))
    screens = [c for c in source.controls if "/" not in c.path and c.path]
    blank_env = {name: None for name in _state_names(source)}
    findings: list[Finding] = []
    for screen in screens:
        if screen.name in exempt:
            continue
        prefix = screen.path + "/"
        children = [
            c for c in source.controls
            if c.path.startswith(prefix) and "/" not in c.path[len(prefix):]
        ]
        if not children:
            continue
        always = [
            c for c in children
            if is_true(visibility(c.formulas.get("Visible"), blank_env))
        ]
        if always:
            continue
        gates = sorted({_visible(c) for c in children})
        findings.append(
            Finding(
                rule="R017 screen-renders-blank",
                severity=Severity.ERROR,
                message=(
                    f"Screen '{screen.name}' has {len(children)} controls and not one of them is "
                    "visible in the state the app loads in, with every variable blank. The "
                    "technician's first sight of it is an empty page."
                ),
                location=screen.location,
                detail="gates: " + "; ".join(gates[:6]) + ("; ..." if len(gates) > 6 else ""),
            )
        )
    return findings


def _state_names(source: CanvasSource) -> set[str]:
    """Every var/col name the application mentions, read or written."""
    names: set[str] = set()
    for control in source.controls:
        for expression in control.formulas.values():
            names.update(m.group("name") for m in _STATE_READ.finditer(expression))
    return names


def _unreachable_controls(source: CanvasSource) -> set[str]:
    """Controls hard-coded `Visible: =false`, which cannot be tapped."""
    return {
        control.name for control in source.controls
        if _visible(control).lower() == "false"
    }


def _written_names(source: CanvasSource) -> set[str]:
    written: set[str] = set()
    for control in source.controls:
        for expression in control.formulas.values():
            written.update(m.group("name") for m in _SET.finditer(expression))
            for match in _COLLECTION_WRITE.finditer(expression):
                written.update(v for v in match.groupdict().values() if v)
            for pattern in (_CONTEXT, _WITH_SCOPE):
                for match in pattern.finditer(expression):
                    written.update(
                        m.group("name") for m in _CONTEXT_NAME.finditer(match.group("body"))
                    )
    return written


def state_never_written(source: CanvasSource, rules: dict) -> list[Finding]:
    """R018 — a formula reads a variable or collection nothing ever writes.

    A name that is never assigned is blank at runtime, so every control gated on
    it disappears. This is the most likely root cause of a blank screen and the
    cheapest to prove from source.
    """
    exempt = set(rules.get("externallyProvidedState", []))
    written = _written_names(source) | exempt
    reads: dict[str, list[Control]] = collections.defaultdict(list)
    for control in source.controls:
        for prop, expression in control.formulas.items():
            for match in _STATE_READ.finditer(expression):
                bucket = reads[match.group("name")]
                if control not in bucket:
                    bucket.append(control)

    unreachable = _unreachable_controls(source)
    findings = []
    for name in sorted(reads):
        if name in written:
            continue
        readers = reads[name]
        live = [c for c in readers if c.name not in unreachable]
        control = (live or readers)[0]
        if live:
            findings.append(
                Finding(
                    rule="R018 state-never-written",
                    severity=Severity.ERROR,
                    message=(
                        f"'{name}' is read but never written anywhere in the application. It is "
                        "blank at runtime, so anything derived from it is empty or invisible."
                    ),
                    location=control.location,
                    detail="read by live control(s): "
                           + ", ".join(sorted(c.name for c in live)[:8]),
                )
            )
        else:
            findings.append(
                Finding(
                    rule="R018/dead state-never-written-in-dead-control",
                    severity=Severity.WARNING,
                    message=(
                        f"'{name}' is never written, and every control that reads it is "
                        "hard-coded Visible=false, so the path cannot run. Retired code, not a "
                        "live defect — but it would misbehave if any of these were re-enabled."
                    ),
                    location=control.location,
                    detail="dead readers: " + ", ".join(sorted(c.name for c in readers)[:8]),
                )
            )
    return findings


def record_field_never_written(source: CanvasSource, rules: dict) -> list[Finding]:
    """R019 — a field read off a collection that no write to it ever supplies.

    The draft-field-name-mismatch shape: the sign-out form reads
    `colInstrumentDraft.SerialNumber` while the write supplies `Serial`. Only
    collections with at least one record-literal write are checked, so a
    collection whose shape is unknown is never reported.
    """
    supplied: dict[str, set[str]] = collections.defaultdict(set)
    for control in source.controls:
        for expression in control.formulas.values():
            for match in _RECORD_WRITE.finditer(expression):
                name = match.group("name") or match.group("pname")
                body = match.group("body") or match.group("pbody") or ""
                if name:
                    supplied[name].update(m.group("name") for m in _FIELD_NAME.finditer(body))

    findings: list[Finding] = []
    seen: set[tuple[str, str]] = set()
    for control in source.controls:
        for expression in control.formulas.values():
            for match in _FIELD_READ.finditer(expression):
                name = match.group("fn_coll") or match.group("coll")
                field = match.group("fn_field") or match.group("field")
                if not name or not field or name not in supplied:
                    continue
                if field in supplied[name] or (name, field) in seen:
                    continue
                seen.add((name, field))
                findings.append(
                    Finding(
                        rule="R019 record-field-never-written",
                        severity=Severity.ERROR,
                        message=(
                            f"'{name}.{field}' is read, but no write to '{name}' supplies a "
                            f"'{field}' field. It is blank at runtime."
                        ),
                        location=control.location,
                        detail="written fields: " + ", ".join(sorted(supplied[name])),
                    )
                )
    return findings


def geometry_rule_scope(source: CanvasSource, rules: dict) -> list[Finding]:
    """R029 — record when the state-free geometry rules stood aside, and why."""
    if not _is_view_driven(source):
        return []
    from .rules_view import discover_views

    return [
        Finding(
            rule="R029 geometry-rules-deferred",
            severity=Severity.INFO,
            message=(
                f"R014 (state-free sibling overlap) stood aside: this app gates its "
                f"{len(discover_views(source))} views on varView, so geometry is only "
                "meaningful per view. R021-R028 carry the geometry checks instead."
            ),
            location=str(source.root),
        )
    ]


def geometry_coverage(source: CanvasSource, rules: dict) -> list[Finding]:
    """R020 — how much of the layout the geometry rules could actually check.

    Reported so that a clean R014/R015/R016 result is never read as a verified
    layout. Controls positioned by formulas referencing Parent or another
    control are not decidable here (§60).
    """
    positioned = [c for c in source.controls if any(p in c.formulas for p in _GEOMETRY_PROPS)]
    if not positioned:
        return []
    checked = [c for c in positioned if _rect(c) is not None]
    unchecked = len(positioned) - len(checked)
    return [
        Finding(
            rule="R020 geometry-coverage",
            severity=Severity.INFO,
            message=(
                f"Geometry checked on {len(checked)} of {len(positioned)} positioned controls; "
                f"{unchecked} use non-static formulas and were NOT checked. A clean geometry "
                "result does not mean the layout was verified — only Studio proves that."
            ),
            location=str(source.root),
        )
    ]


ANALYSERS = (
    geometry_collisions,
    off_canvas_controls,
    touch_target_size,
    screens_that_can_render_blank,
    geometry_rule_scope,
    state_never_written,
    record_field_never_written,
    geometry_coverage,
)


def run_all(source: CanvasSource, rules: dict | None = None) -> list[Finding]:
    from .rules_static import load_rules

    rules = rules if rules is not None else load_rules()
    findings: list[Finding] = []
    for analyser in ANALYSERS:
        findings.extend(analyser(source, rules))
    return findings
