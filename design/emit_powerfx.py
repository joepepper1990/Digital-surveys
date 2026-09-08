#!/usr/bin/env python3
"""Render design/tokens.json as Power Fx named formulas.

    python3 design/emit_powerfx.py            # write design/generated/DesignTokens.fx.txt
    python3 design/emit_powerfx.py --check    # fail if the generated file is stale

The output goes in App.Formulas. Named formulas are declarative and evaluated on
demand, so tokens cost nothing at startup and cannot drift the way a screenful of
Set() calls in OnStart does.

Controls reference tokens only — `Fill: =tokSurface`, never `Fill: =RGBA(255,255,255,1)`.
That is what makes a palette change one edit instead of several hundred (§8).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
TOKENS = ROOT / "tokens.json"
OUTPUT = ROOT / "generated" / "DesignTokens.fx.txt"

HEADER = """// ---------------------------------------------------------------------------
// DesignTokens — GENERATED FILE, DO NOT EDIT
//
// Source:    design/tokens.json
// Generator: design/emit_powerfx.py
//
// Paste into App.Formulas. Every control reads these names; no control declares
// a colour, spacing value, radius, height or type size of its own (§8).
// Regenerate with:  python3 design/emit_powerfx.py
// ---------------------------------------------------------------------------
"""


def _pascal(name: str) -> str:
    return name[:1].upper() + name[1:]


def _rgba(hex_colour: str) -> str:
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return f"RGBA({r}, {g}, {b}, 1)"


def _section(title: str) -> str:
    return f"\n// --- {title} " + "-" * max(0, 66 - len(title)) + "\n"


def render(tokens: dict) -> str:
    out: list[str] = [HEADER]

    out.append(_section("Colour"))
    for name, entry in tokens["color"].items():
        out.append(f"tok{_pascal(name)} = {_rgba(entry['hex'])};   // {entry['role']}\n")

    out.append(_section("Spacing"))
    for name, value in tokens["spacing"].items():
        out.append(f"tokSpace{name.upper()} = {value};\n")

    out.append(_section("Radius"))
    for name, value in tokens["radius"].items():
        out.append(f"tokRadius{_pascal(name)} = {value};\n")

    out.append(_section("Size"))
    for name, value in tokens["size"].items():
        out.append(f"tok{_pascal(name)} = {value};\n")

    out.append(_section("Typography"))
    family = tokens["typography"]["family"]
    fallback = tokens["typography"]["familyFallback"]
    out.append(f'tokFontFamily = "{family}";\n')
    out.append(f'tokFontFamilyFallback = "{fallback}";\n')
    for name, style in tokens["typography"]["scale"].items():
        out.append(f"tokType{_pascal(name)}Size = {style['size']};   // {style['role']}\n")
        out.append(f"tokType{_pascal(name)}Weight = FontWeight.{style['weight']};\n")

    out.append(_section("Elevation"))
    out.append(f"tokScrimFill = ColorFade(Color.Black, -{1 - tokens['elevation']['scrimOpacity']:.2f});\n")

    # Status styles become a table so a badge is one data-driven control rather
    # than one control per status (§16, §44).
    for group, formula_name, comment in (
        ("statusStyles", "tokStatusStyles", "Capability, point and instrument status (§16, §26)"),
        ("syncStyles", "tokSyncStyles", "Sync state, presented separately from workflow state (§37)"),
    ):
        out.append(_section(comment))
        out.append(f"{formula_name} = Table(\n")
        rows = []
        for key, style in tokens[group].items():
            if key.startswith("_"):
                continue
            rows.append(
                f'    {{ Key: "{key}", '
                f'Ink: tok{_pascal(style["ink"])}, '
                f'Surface: tok{_pascal(style["surface"])}, '
                f'Glyph: "{style["glyph"]}", '
                f'Label: "{style["label"]}" }}'
            )
        out.append(",\n".join(rows))
        out.append("\n);\n")

    out.append(_section("Lookup helpers"))
    out.append(
        "// Status is never colour alone: a badge renders Glyph, Label and Ink together.\n"
        "tokStatusOf(key: Text): Record = LookUp(tokStatusStyles, Key = key);\n"
        "tokSyncOf(key: Text): Record = LookUp(tokSyncStyles, Key = key);\n"
    )
    return "".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the generated file is stale")
    args = parser.parse_args(argv)

    rendered = render(json.loads(TOKENS.read_text(encoding="utf-8")))

    if args.check:
        if not OUTPUT.exists():
            print(f"{OUTPUT} does not exist. Run: python3 design/emit_powerfx.py", file=sys.stderr)
            return 1
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            print(f"{OUTPUT} is stale. Run: python3 design/emit_powerfx.py", file=sys.stderr)
            return 1
        print(f"{OUTPUT} is up to date.")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(rendered.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
