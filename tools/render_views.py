#!/usr/bin/env python3
"""Render each view of the canvas app to HTML, from the real source geometry.

This is not a Power Apps emulator and does not pretend to be. It draws every
control that is or may be visible in a view as an absolutely-positioned box at
its real X/Y/Width/Height, with its real Fill, Color, Size, FontWeight, Align
and — where the text is a literal or a resolvable formula — its real text.

Why it exists: the 1.1.0.5 defects were *visual*, and this environment cannot
open Power Apps Studio. Reading coordinates out of YAML is how a full-screen
panel covering a form got missed. Drawing them and looking is much closer to
what a technician sees, and it catches the things coordinates alone do not:
crowding, ragged edges, dead space, unreadable contrast, text that overflows.

    tools/render_views.py --sources source-working/canvas/Src --out /tmp/views

Every unresolved formula is drawn as a dashed placeholder showing the property
it came from, so nothing is silently invented. What this cannot show is exactly
what STUDIO VERIFICATION REQUIRED refers to.
"""
from __future__ import annotations

import argparse
import html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tests"))

from validators import pa_source, rules_view                      # noqa: E402
from validators.powerfx import UNKNOWN, evaluate, is_true, visibility  # noqa: E402

CANVAS_W, CANVAS_H = 1440, 960

_RGBA = re.compile(
    r"RGBA\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)")


def css_colour(expression: str | None, env: dict, fallback: str) -> str:
    """First RGBA branch that a formula can take, as CSS."""
    if not expression:
        return fallback
    value = evaluate(expression, env)
    if isinstance(value, tuple) and len(value) == 4:
        r, g, b, a = value
        return f"rgba({float(r):.0f},{float(g):.0f},{float(b):.0f},{float(a)})"
    match = _RGBA.search(expression)
    if match:
        r, g, b, a = match.groups()
        return f"rgba({float(r):.0f},{float(g):.0f},{float(b):.0f},{float(a)})"
    return fallback


def literal_text(control, env: dict) -> tuple[str, bool]:
    """(text, resolved). Unresolved formulas are labelled, never guessed."""
    expression = control.formulas.get("Text")
    if not expression:
        return "", True
    value = evaluate(expression, env)
    if isinstance(value, str):
        return value, True
    if value is UNKNOWN or value is None:
        # Show the first string literal in the formula as a hint of intent.
        literals = re.findall(r'"((?:[^"]|""){2,})"', expression)
        hint = literals[0].replace('""', '"') if literals else ""
        return (hint or "⟨computed⟩"), False
    return str(value), True


def align_of(control, env: dict) -> str:
    expression = (control.formulas.get("Align") or "").lower()
    if "right" in expression:
        return "right"
    if "center" in expression:
        return "center"
    return "left"


def render_view(source, view: str, background: str | None,
                include_maybe: bool = False) -> str:
    env = {"varView": view}
    boxes = rules_view.boxes_in_view(source, view, include_maybe=include_maybe)
    parts: list[str] = []
    for box in boxes:
        control = box.control
        fill = css_colour(control.formulas.get("Fill"), env, "transparent")
        colour = css_colour(control.formulas.get("Color"), env, "rgb(32,42,54)")
        border = css_colour(control.formulas.get("BorderColor"), env, "transparent")
        thickness = evaluate(control.formulas.get("BorderThickness", "=0"), env)
        thickness = thickness if isinstance(thickness, (int, float)) else 0
        size = evaluate(control.formulas.get("Size", "=11"), env)
        size = size if isinstance(size, (int, float)) else 11
        weight = "700" if "bold" in (control.formulas.get("FontWeight") or "").lower() else "400"
        text, resolved = literal_text(control, env)
        wrap = (control.formulas.get("Wrap", "=true").lower().find("false") < 0)
        certain = is_true(box.visible)

        style = (
            f"left:{box.x}px;top:{box.y}px;width:{box.w}px;height:{box.h}px;"
            f"background:{fill};color:{colour};font-size:{size * 1.34:.1f}px;"
            f"font-weight:{weight};text-align:{align_of(control, env)};"
            f"z-index:{int(box.z[0])};"
        )
        if thickness:
            style += f"border:{thickness}px solid {border};box-sizing:border-box;"
        if not wrap:
            style += "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        classes = "c" + ("" if resolved else " unresolved") + ("" if certain else " maybe")
        parts.append(
            f'<div class="{classes}" style="{style}" '
            f'title="{html.escape(control.name)} ({box.x:.0f},{box.y:.0f}) '
            f'{box.w:.0f}x{box.h:.0f} z={box.z[0]:.0f}">'
            f'<span>{html.escape(text)}</span></div>'
        )

    bg = f'<img class="bg" src="{background}">' if background else ""
    return (
        f'<section><h2>{html.escape(view)} '
        f'<small>{len(boxes)} controls</small></h2>'
        f'<div class="canvas">{bg}{"".join(parts)}</div></section>'
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", default="source-working/canvas/Src")
    parser.add_argument("--out", default="/tmp/views")
    parser.add_argument("--views", default="", help="comma-separated subset")
    parser.add_argument("--include-maybe", action="store_true",
                        help="also draw controls whose visibility depends on runtime data")
    parser.add_argument("--bare", action="store_true",
                        help="hide captions so a screenshot is exactly the canvas")
    parser.add_argument("--map-background", default="",
                        help="PNG to draw behind the Map view (the baked artwork)")
    args = parser.parse_args(argv)

    source = pa_source.load(args.sources)
    views = [v for v in (args.views.split(",") if args.views else rules_view.discover_views(source)) if v]
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    style = """
    body{margin:0;background:#5a6470;font-family:'Segoe UI',system-ui,sans-serif}
    h2{color:#fff;font:600 15px/1.4 'Segoe UI',sans-serif;margin:18px 0 6px 8px}
    h2 small{color:#c9d2dc;font-weight:400}
    section{margin-bottom:10px}
    .canvas{position:relative;width:1440px;height:960px;background:#fff;
            overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.4)}
    .canvas .bg{position:absolute;left:0;top:0;width:1440px;height:960px}
    .c{position:absolute;display:flex;align-items:center;padding:0 6px;
       box-sizing:border-box;line-height:1.25}
    .c>span{width:100%}
    .c.unresolved{outline:1px dashed rgba(190,60,60,.55);outline-offset:-1px}
    .c.maybe{opacity:.92}
    """
    for view in views:
        background = None
        if view == "Map" and args.map_background:
            background = pathlib.Path(args.map_background).resolve().as_uri()
        page = (
            "<!doctype html><meta charset='utf-8'>"
            f"<title>{html.escape(view)}</title><style>{style}</style>"
            + render_view(source, view, background, args.include_maybe)
        )
        if args.bare:
            # Caption removed so a 1440x960 screenshot is exactly the canvas.
            page = page.replace("h2{color", "h2{display:none;color")
        (out / f"{view}.html").write_text(page, encoding="utf-8")
        print(f"  {view}.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
