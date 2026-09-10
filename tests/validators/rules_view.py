"""View-state-aware analysers: what the technician actually sees, per view.

This application is one screen. Every one of its ~28 logical views is a set of
controls on `scrSurveyMain` gated on `varView`, all siblings, all flat. Two
consequences drive this module:

  * **Paint order decides what is seen.** Among siblings the control with the
    higher `ZIndex` paints on top; where ZIndex ties, the later-declared one
    wins. An opaque full-bleed panel that paints *above* the form it was meant
    to sit behind hides that form completely. That is exactly what made the
    Sign Out Instrument screen render blank in 1.1.0.5: `pnlInstrumentEdit` is
    1440x960, opaque, and carries `ZIndex: =900`, while the whole sign-out form
    sits at ZIndex 552-602. Only `lblInstrumentEditTitle` (901) and
    `btnDraftCancel` (999) are above the panel — precisely the two controls the
    Studio screenshot shows.

  * **Nothing can be judged without fixing a state.** Controls for different
    views overlap by design; they are simply never on screen together. So
    every check here runs once per view, with `varView` bound, and uses
    `powerfx`'s three-valued logic to separate "definitely visible" from
    "may be visible".

`R014`-`R016` in `rules_runtime` remain the state-free geometry rules. These
are their state-aware counterparts, and only they can speak about this app.
"""
from __future__ import annotations

import collections
import re

from .model import Finding, Severity
from .pa_source import CanvasSource, Control
from .powerfx import UNKNOWN, alpha, can_coexist, evaluate, is_false, is_true, visibility

_GEOMETRY = ("X", "Y", "Width", "Height")
_PAINT = ("ZIndex",)

# Views are discovered from the source rather than hard-coded, so a new view
# is covered the moment it is added.
_VIEW_LITERAL = re.compile(r'varView\s*(?:=|<>)\s*"(?P<view>[^"]*)"')


def discover_views(source: CanvasSource) -> list[str]:
    views: set[str] = set()
    for control in source.controls:
        for expression in control.formulas.values():
            views.update(m.group("view") for m in _VIEW_LITERAL.finditer(expression))
    return sorted(views)


def _pair_exempt(entries: list, first: str, second: str) -> bool:
    """A pair documented as a deliberate overlap, matched either way round."""
    for entry in entries or []:
        pair = {entry.get("a"), entry.get("b")}
        if pair == {first, second}:
            return True
        prefixes = entry.get("prefixes")
        if prefixes and len(prefixes) == 2:
            one, two = prefixes
            if ((first.startswith(one) and second.startswith(two))
                    or (first.startswith(two) and second.startswith(one))):
                # Same trailing identifier, e.g. mapPoint11 / iconKnown11.
                if first[len(one):] if first.startswith(one) else True:
                    tail_a = first[len(one):] if first.startswith(one) else first[len(two):]
                    tail_b = second[len(two):] if second.startswith(two) else second[len(one):]
                    if tail_a == tail_b:
                        return True
    return False


def _occlusion_exempt(rules: dict, covered: str, cover: str) -> bool:
    """A pair whose disjointness rests on an app invariant, not on logic alone.

    Recorded as data with a reason rather than silently skipped, so the
    suppression is reviewable — the same contract as `documentedExceptions`
    for R001.
    """
    for entry in rules.get("documentedOcclusionExceptions", []):
        if entry.get("covered") == covered and entry.get("cover") == cover:
            return True
    return False


def _env(view: str, **extra) -> dict:
    env = {"varView": view}
    env.update(extra)
    return env


class Box:
    __slots__ = ("control", "x", "y", "w", "h", "visible", "z")

    def __init__(self, control: Control, x, y, w, h, visible, z):
        self.control = control
        self.x, self.y, self.w, self.h = x, y, w, h
        self.visible = visible
        self.z = z
        """Paint order: (ZIndex, document order). Higher paints on top."""

    def paints_over(self, other: "Box") -> bool:
        return self.z > other.z

    @property
    def right(self):
        return self.x + self.w

    @property
    def bottom(self):
        return self.y + self.h

    def contains(self, other: "Box") -> bool:
        return (
            self.x <= other.x and self.y <= other.y
            and self.right >= other.right and self.bottom >= other.bottom
        )

    def overlap(self, other: "Box") -> tuple[float, float]:
        return (
            min(self.right, other.right) - max(self.x, other.x),
            min(self.bottom, other.bottom) - max(self.y, other.y),
        )

    def __repr__(self) -> str:                      # pragma: no cover
        return f"{self.control.name}({self.x:g},{self.y:g},{self.w:g}x{self.h:g})"


def _number(control: Control, prop: str, env: dict, default: float | None) -> float | None:
    """Geometry value under this state, or None when not decidable."""
    if prop not in control.formulas:
        return default
    value = evaluate(control.formulas[prop], env)
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def boxes_in_view(source: CanvasSource, view: str, include_maybe: bool = True) -> list[Box]:
    """Every control that can be on screen in `view`, with its rectangle.

    X and Y default to 0 when absent, matching Power Apps. Width and Height
    have no safe default, so a control missing them is skipped rather than
    guessed at.
    """
    env = _env(view)
    result: list[Box] = []
    for control in source.controls:
        if not control.formulas:
            continue
        state = visibility(control.formulas.get("Visible"), env)
        if is_false(state):
            continue
        if state is UNKNOWN and not include_maybe:
            continue
        x = _number(control, "X", env, 0.0)
        y = _number(control, "Y", env, 0.0)
        w = _number(control, "Width", env, None)
        h = _number(control, "Height", env, None)
        if None in (x, y, w, h):
            continue
        zindex = _number(control, "ZIndex", env, None)
        # A control with no ZIndex is ordered only by declaration position.
        z = (zindex if zindex is not None else 0.0, float(control.order))
        result.append(Box(control, x, y, w, h, state, z))
    return sorted(result, key=lambda b: b.z)


def occluded_controls(source: CanvasSource, rules: dict) -> list[Finding]:
    """R021 — a control hidden behind a later-declared opaque control.

    The root cause of the blank Sign Out Instrument screen. Reported only when
    the covering control is opaque in *every* branch its Fill can take, fully
    contains the covered control, and both are visible in the same view.
    """
    findings: list[Finding] = []
    for view in discover_views(source):
        boxes = boxes_in_view(source, view)
        covers = []
        for box in boxes:
            opacity = alpha(box.control.formulas.get("Fill"))
            if isinstance(opacity, float) and opacity > 0:
                covers.append(box)
        if not covers:
            continue
        for box in boxes:
            hidden_by = [
                cover for cover in covers
                if cover.paints_over(box)
                and cover.control is not box.control
                and cover.contains(box)
                and not _occlusion_exempt(rules, box.control.name, cover.control.name)
                and can_coexist(
                    box.control.formulas.get("Visible"),
                    cover.control.formulas.get("Visible"),
                    _env(view),
                    invariants=rules.get("variableInvariants"),
                )
            ]
            if not hidden_by:
                continue
            cover = hidden_by[0]
            certain = is_true(box.visible) and is_true(cover.visible)
            findings.append(
                Finding(
                    rule="R021 control-occluded-by-later-sibling",
                    severity=Severity.ERROR if certain else Severity.WARNING,
                    message=(
                        f"In view '{view}', '{box.control.name}' is completely covered by "
                        f"'{cover.control.name}', which is opaque and paints on top of it "
                        f"(ZIndex {cover.z[0]:g} > {box.z[0]:g}). "
                        + ("It cannot be seen at runtime."
                           if certain else
                           "It cannot be seen whenever both are visible.")
                    ),
                    location=box.control.location,
                    detail=f"{box!r} under {cover!r}",
                )
            )
    return findings


def view_geometry_collisions(source: CanvasSource, rules: dict) -> list[Finding]:
    """R022 — two controls that can be visible together partially overlap.

    The Survey Plan header shape. A pair is reported as an ERROR when both are
    *certainly* visible in the view, and as a WARNING when at least one is
    conditional but the two can still hold at once — the case that let the Map
    legend and the "returned by Team Leader" notice occupy the same 550 px of
    the status band whenever a validation message was present. Pairs proven
    mutually exclusive are silent.
    """
    tolerance = float(rules.get("geometryOverlapTolerance", 0))
    findings: list[Finding] = []
    seen: set[tuple[str, str]] = set()
    for view in discover_views(source):
        boxes = boxes_in_view(source, view)
        for i, first in enumerate(boxes):
            for second in boxes[i + 1:]:
                if first.contains(second) or second.contains(first):
                    continue
                dx, dy = first.overlap(second)
                if dx <= tolerance or dy <= tolerance:
                    continue
                key = tuple(sorted((first.control.name, second.control.name)))
                if key in seen:
                    continue
                if _pair_exempt(
                    rules.get("documentedCoexistenceExceptions"),
                    first.control.name, second.control.name,
                ):
                    continue
                if not can_coexist(
                    first.control.formulas.get("Visible"),
                    second.control.formulas.get("Visible"),
                    _env(view),
                    invariants=rules.get("variableInvariants"),
                ):
                    continue
                seen.add(key)
                certain = is_true(first.visible) and is_true(second.visible)
                findings.append(
                    Finding(
                        rule="R022 view-geometry-collision",
                        severity=Severity.ERROR if certain else Severity.WARNING,
                        message=(
                            f"In view '{view}', '{first.control.name}' and "
                            f"'{second.control.name}' overlap by {dx:g}x{dy:g} px and "
                            + ("are both always visible."
                               if certain else
                               "can both be visible at once.")
                        ),
                        location=first.control.location,
                        detail=f"{first!r} vs {second!r}",
                    )
                )
    return findings


# Rough advance width per character at Size 1, measured against the app's own
# labels. Only used to flag a *risk*: real text metrics depend on the font the
# device has, so this never asserts truncation, it asks for a look.
_CHAR_WIDTH_RATIO = 0.62
_PADDING = 16.0


def truncation_risk(source: CanvasSource, rules: dict) -> list[Finding]:
    """R028 — a non-wrapping label whose literal text is wider than the control.

    "INSTRUMENTS / CHANGE" in a 200 px button rendered as "INSTRUMENTS / CHAN..."
    in Studio. Only literal strings are measured; anything computed at runtime
    is skipped rather than estimated.
    """
    ratio = float(rules.get("characterWidthRatio", _CHAR_WIDTH_RATIO))
    findings: list[Finding] = []
    reported: set[str] = set()
    for view in discover_views(source):
        env = _env(view)
        for box in boxes_in_view(source, view, include_maybe=False):
            control = box.control
            if control.name in reported:
                continue
            if (control.formulas.get("Wrap", "=true").strip().lstrip("=").lower()
                    != "false"):
                continue
            text = control.formulas.get("Text")
            if not text:
                continue
            value = evaluate(text, env)
            if not isinstance(value, str) or not value.strip():
                continue
            size = _number(control, "Size", env, 11.0) or 11.0
            estimated = len(value) * size * ratio + _PADDING
            if estimated <= box.w:
                continue
            reported.add(control.name)
            findings.append(
                Finding(
                    rule="R028 truncation-risk",
                    severity=Severity.WARNING,
                    message=(
                        f"'{control.name}' does not wrap and its text needs about "
                        f"{estimated:.0f} px at size {size:g}, but the control is only "
                        f"{box.w:g} px wide. It will be clipped with an ellipsis."
                    ),
                    location=control.location,
                    detail=f'text: "{value[:80]}"',
                )
            )
    return findings


def off_canvas_in_view(source: CanvasSource, rules: dict) -> list[Finding]:
    """R023 — a control that leaves the canvas in a view where it is visible."""
    width = float(rules.get("canvasWidth", 1440))
    height = float(rules.get("canvasHeight", 960))
    findings: list[Finding] = []
    reported: set[str] = set()
    for view in discover_views(source):
        for box in boxes_in_view(source, view, include_maybe=False):
            if box.control.name in reported:
                continue
            breaches = []
            if box.x < 0:
                breaches.append(f"X={box.x:g}")
            if box.y < 0:
                breaches.append(f"Y={box.y:g}")
            if box.right > width:
                breaches.append(f"right {box.right:g}>{width:g}")
            if box.bottom > height:
                breaches.append(f"bottom {box.bottom:g}>{height:g}")
            if breaches:
                reported.add(box.control.name)
                findings.append(
                    Finding(
                        rule="R023 off-canvas-in-view",
                        severity=Severity.ERROR,
                        message=(
                            f"In view '{view}', '{box.control.name}' extends outside the "
                            f"{width:g}x{height:g} canvas ({'; '.join(breaches)}) and is clipped."
                        ),
                        location=box.control.location,
                    )
                )
    return findings


def unreachable_controls(source: CanvasSource, rules: dict) -> list[Finding]:
    """R024 — a control whose Visible is false in every view it names.

    Catches `Visible: =varView="X" && false` — a control left permanently off,
    which is dead weight that still evaluates its other formulas.
    """
    findings: list[Finding] = []
    views = discover_views(source)
    for control in source.controls:
        expression = control.formulas.get("Visible")
        if not expression:
            continue
        if not _VIEW_LITERAL.search(expression):
            continue
        states = [visibility(expression, _env(view)) for view in views]
        if all(is_false(state) for state in states):
            findings.append(
                Finding(
                    rule="R024 control-unreachable",
                    severity=Severity.WARNING,
                    message=(
                        f"'{control.name}' can never be visible: its Visible formula is false "
                        "in every view. It is dead, but still evaluates its other formulas."
                    ),
                    location=control.location,
                    detail=f"Visible: {expression[:140]}",
                )
            )
    return findings


def views_that_render_blank(source: CanvasSource, rules: dict) -> list[Finding]:
    """R025 — a view with no control that is certainly visible and has content.

    The state-aware counterpart of R017: a view whose every control depends on
    a runtime lookup renders as an empty page when that lookup returns nothing.
    """
    findings: list[Finding] = []
    for view in discover_views(source):
        certain = [
            box for box in boxes_in_view(source, view, include_maybe=False)
            if _has_content(box.control)
        ]
        if certain:
            continue
        maybe = boxes_in_view(source, view)
        if not maybe:
            continue
        findings.append(
            Finding(
                rule="R025 view-renders-blank",
                severity=Severity.ERROR,
                message=(
                    f"View '{view}' has {len(maybe)} candidate controls but not one is "
                    "certain to be visible with content. If every runtime condition fails "
                    "the technician sees an empty page."
                ),
                location=f"view '{view}'",
            )
        )
    return findings


def _has_content(control: Control) -> bool:
    """True when the control shows something a technician can read or press."""
    if "OnSelect" in control.formulas:
        return True
    text = control.formulas.get("Text")
    if not text:
        return False
    value = evaluate(text, {})
    if value is UNKNOWN:
        return True
    return bool(str(value or "").strip())


def touch_targets_in_view(source: CanvasSource, rules: dict) -> list[Finding]:
    """R026 — an interactive control below the minimum touch target (§12).

    Every control in this app is a `label`, so "interactive" means it carries
    an OnSelect, not that it uses a Button template.
    """
    minimum = float(rules.get("minimumTouchTargetPx", 48))
    findings: list[Finding] = []
    reported: set[str] = set()
    for view in discover_views(source):
        for box in boxes_in_view(source, view, include_maybe=False):
            control = box.control
            if control.name in reported or "OnSelect" not in control.formulas:
                continue
            if box.w <= 0 or box.h <= 0:
                continue
            if box.w < minimum or box.h < minimum:
                reported.add(control.name)
                findings.append(
                    Finding(
                        rule="R026 touch-target-undersize-in-view",
                        severity=Severity.WARNING,
                        message=(
                            f"'{control.name}' is {box.w:g}x{box.h:g} px in view '{view}', "
                            f"below the {minimum:g} px minimum for gloved tablet use."
                        ),
                        location=control.location,
                    )
                )
    return findings


def missing_explicit_size(source: CanvasSource, rules: dict) -> list[Finding]:
    """R030 — a visible control with no explicit Width or Height.

    Such a control falls back to its template's default size, which is not
    visible in the source and does not match an app that sizes everything else
    explicitly. Seven controls in 1.1.0.5 were in this state, among them the
    Instruments page's AVAILABLE NOW capability strip — which is also why the
    geometry rules could not check it.

    X and Y are excluded: Power Fx defaults both to 0, and a full-bleed backdrop
    declaring neither is idiomatic rather than accidental.
    """
    system = set(rules.get("platformControls", ()))
    findings: list[Finding] = []
    reported: set[str] = set()
    for view in discover_views(source):
        env = _env(view)
        for control in source.controls:
            if control.name in reported or not control.formulas:
                continue
            if "/" not in control.path or not control.path:
                continue
            if control.name in system:
                continue
            if is_false(visibility(control.formulas.get("Visible"), env)):
                continue
            absent = [p for p in ("Width", "Height") if p not in control.formulas]
            if not absent:
                continue
            reported.add(control.name)
            defaults = (rules.get("templateSizeDefaults") or {}).get(control.type, {})
            known = {p: defaults[p] for p in absent if p in defaults}
            if len(known) == len(absent):
                findings.append(
                    Finding(
                        rule="R030/default size-from-template-default",
                        severity=Severity.INFO,
                        message=(
                            f"'{control.name}' declares no {' or '.join(absent)} and takes its "
                            f"'{control.type}' template default "
                            + ", ".join(f"{p}={v}" for p, v in sorted(known.items()))
                            + ". Deterministic on this layout, but the phone default differs, so "
                              "an explicit value is preferable. Note that pac strips a property "
                              "whose value equals the default, so it cannot simply be written back."
                        ),
                        location=control.location,
                    )
                )
                continue
            findings.append(
                Finding(
                    rule="R030 no-explicit-size",
                    severity=Severity.WARNING,
                    message=(
                        f"'{control.name}' declares no {' or '.join(absent)} and falls back to "
                        f"its template default, so its real size is not in the source and "
                        f"cannot be checked. First seen in view '{view}'."
                    ),
                    location=control.location,
                )
            )
    return findings


def view_coverage(source: CanvasSource, rules: dict) -> list[Finding]:
    """R027 — per-view coverage, so a silent result is never read as verified."""
    views = discover_views(source)
    if not views:
        return []
    total = sum(1 for c in source.controls if c.formulas)
    undecidable = 0
    for control in source.controls:
        if not control.formulas:
            continue
        if any(
            prop in control.formulas
            and evaluate(control.formulas[prop], _env(views[0])) is UNKNOWN
            for prop in _GEOMETRY
        ):
            undecidable += 1
    counts = {view: len(boxes_in_view(source, view)) for view in views}
    busiest = sorted(counts.items(), key=lambda kv: -kv[1])[:3]
    return [
        Finding(
            rule="R027 view-coverage",
            severity=Severity.INFO,
            message=(
                f"{len(views)} views analysed across {total} controls; {undecidable} have at "
                "least one geometry property that is not statically decidable and were NOT "
                "geometry-checked. Silence here is not a verified layout — only Studio is."
            ),
            location=str(source.root),
            detail="busiest views: " + ", ".join(f"{v} ({n})" for v, n in busiest),
        )
    ]


ANALYSERS = (
    occluded_controls,
    view_geometry_collisions,
    truncation_risk,
    off_canvas_in_view,
    unreachable_controls,
    views_that_render_blank,
    touch_targets_in_view,
    missing_explicit_size,
    view_coverage,
)


def run_all(source: CanvasSource, rules: dict | None = None) -> list[Finding]:
    from .rules_static import load_rules

    rules = rules if rules is not None else load_rules()
    findings: list[Finding] = []
    for analyser in ANALYSERS:
        findings.extend(analyser(source, rules))
    return findings
