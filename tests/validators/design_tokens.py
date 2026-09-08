"""Design token checks (directive §8, §10, §16, §45).

The interesting property here is that accessibility is *measured*, not claimed:
every ink/surface pair declared in design/tokens.json is checked against the
WCAG 2.1 contrast formula, and every status must carry a glyph and a label so
that it never depends on colour alone.
"""
from __future__ import annotations

import json
import pathlib
import re

from .model import Finding, Severity

_TOKENS_PATH = pathlib.Path(__file__).resolve().parents[2] / "design" / "tokens.json"
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def load_tokens(path: str | pathlib.Path | None = None) -> dict:
    return json.loads(pathlib.Path(path or _TOKENS_PATH).read_text(encoding="utf-8"))


def _channel(value: int) -> float:
    srgb = value / 255.0
    return srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_colour: str) -> float:
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast_ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted(
        (relative_luminance(foreground), relative_luminance(background)), reverse=True
    )
    return (lighter + 0.05) / (darker + 0.05)


def check(tokens: dict | None = None) -> list[Finding]:
    tokens = tokens or load_tokens()
    findings: list[Finding] = []
    colours = tokens["color"]

    for name, entry in colours.items():
        if not _HEX.match(entry["hex"]):
            findings.append(
                Finding(
                    rule="R300 token-colour-format",
                    severity=Severity.ERROR,
                    message=f"Colour token '{name}' is not a 6-digit hex value: {entry['hex']!r}.",
                    location="design/tokens.json",
                )
            )
        if not entry.get("role"):
            findings.append(
                Finding(
                    rule="R301 token-role-documented",
                    severity=Severity.WARNING,
                    message=f"Colour token '{name}' has no documented role.",
                    location="design/tokens.json",
                )
            )

    # --- contrast ---------------------------------------------------------
    for pair in tokens["contrastPairs"]:
        ink, on, minimum = pair["ink"], pair["on"], pair["minRatio"]
        if ink not in colours or on not in colours:
            findings.append(
                Finding(
                    rule="R302 contrast-pair-resolvable",
                    severity=Severity.ERROR,
                    message=f"Contrast pair references an unknown token: {ink} on {on}.",
                    location="design/tokens.json",
                )
            )
            continue
        ratio = contrast_ratio(colours[ink]["hex"], colours[on]["hex"])
        if ratio < minimum:
            findings.append(
                Finding(
                    rule="R303 text-contrast",
                    severity=Severity.ERROR,
                    message=(
                        f"'{ink}' on '{on}' has a contrast ratio of {ratio:.2f}:1, "
                        f"below the required {minimum}:1 (§45)."
                    ),
                    location="design/tokens.json",
                )
            )

    # --- status must not depend on colour alone ---------------------------
    for group_name in ("statusStyles", "syncStyles"):
        for status, style in tokens[group_name].items():
            if status.startswith("_"):
                continue
            for required in ("glyph", "label"):
                if not style.get(required):
                    findings.append(
                        Finding(
                            rule="R304 status-not-colour-alone",
                            severity=Severity.ERROR,
                            message=(
                                f"Status '{group_name}.{status}' has no {required}. Status must "
                                "carry text and a symbol as well as colour (§16, §26, §45)."
                            ),
                            location="design/tokens.json",
                        )
                    )
            for key in ("ink", "surface"):
                token = style.get(key)
                if token and token not in colours:
                    findings.append(
                        Finding(
                            rule="R305 status-token-resolvable",
                            severity=Severity.ERROR,
                            message=f"Status '{group_name}.{status}.{key}' references unknown token '{token}'.",
                            location="design/tokens.json",
                        )
                    )

    # --- touch and readability floors -------------------------------------
    size = tokens["size"]
    if size["minTouchTarget"] < 44:
        findings.append(
            Finding(
                rule="R306 touch-target",
                severity=Severity.ERROR,
                message=(
                    f"minTouchTarget is {size['minTouchTarget']}px. Tablet-grade gloved use "
                    "needs at least 44px (§10, §45)."
                ),
                location="design/tokens.json",
            )
        )
    for key in ("fieldHeight", "buttonHeight"):
        if size[key] < size["minTouchTarget"]:
            findings.append(
                Finding(
                    rule="R306 touch-target",
                    severity=Severity.ERROR,
                    message=f"{key} ({size[key]}px) is below minTouchTarget ({size['minTouchTarget']}px).",
                    location="design/tokens.json",
                )
            )

    typography = tokens["typography"]
    floor = typography["minimumReadableSize"]
    for name, style in typography["scale"].items():
        if style["size"] < floor:
            findings.append(
                Finding(
                    rule="R307 type-size-floor",
                    severity=Severity.ERROR,
                    message=(
                        f"Type style '{name}' is {style['size']}px, below the readable floor "
                        f"of {floor}px for tablet use in plant (§45)."
                    ),
                    location="design/tokens.json",
                )
            )
    return findings
