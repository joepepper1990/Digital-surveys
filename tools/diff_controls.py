#!/usr/bin/env python3
"""Diff the control trees of two solution ZIPs, property by property.

    tools/diff_controls.py <baseline>.zip <candidate>.zip [--json out.json]

"Formulas preserved" is the claim a release most needs to prove and least often
does. This opens both packages, walks into the .msapp inside each, reads the
authoritative control JSON, and reports every control added, removed or renamed
and every single property whose invariant script changed.

An intended change shows up here. So does an unintended one, which is the
point: if the report lists anything the change log does not, the release is
wrong.
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import zipfile


def _msapp(package: pathlib.Path) -> bytes:
    with zipfile.ZipFile(package) as zf:
        for name in zf.namelist():
            if name.lower().endswith(".msapp"):
                return zf.read(name)
    raise SystemExit(f"no .msapp inside {package}")


def _controls(msapp_raw: bytes) -> dict[str, dict[str, str]]:
    """{control name: {property: invariant script}} for every control."""
    out: dict[str, dict[str, str]] = {}

    def walk(node: dict) -> None:
        name = node.get("Name")
        if name:
            rules = {}
            for rule in node.get("Rules") or []:
                prop = rule.get("Property")
                if prop:
                    rules[prop] = rule.get("InvariantScript")
            out[name] = rules
        for child in node.get("Children") or []:
            if isinstance(child, dict):
                walk(child)

    with zipfile.ZipFile(io.BytesIO(msapp_raw)) as mf:
        for entry in mf.namelist():
            if not entry.replace("\\", "/").startswith("Controls/"):
                continue
            data = json.loads(mf.read(entry))
            top = data.get("TopParent", data)
            if isinstance(top, dict):
                walk(top)
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline")
    parser.add_argument("candidate")
    parser.add_argument("--json", default=None)
    args = parser.parse_args(argv)

    before = _controls(_msapp(pathlib.Path(args.baseline)))
    after = _controls(_msapp(pathlib.Path(args.candidate)))

    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    changes: list[tuple[str, str, str | None, str | None]] = []
    for name in sorted(set(before) & set(after)):
        for prop in sorted(set(before[name]) | set(after[name])):
            old, new = before[name].get(prop), after[name].get(prop)
            if old != new:
                changes.append((name, prop, old, new))

    print(f"baseline  : {args.baseline}")
    print(f"candidate : {args.candidate}")
    print(f"controls  : {len(before)} -> {len(after)}")
    print(f"added     : {added or 'none'}")
    print(f"removed   : {removed or 'none'}")
    print(f"property changes: {len(changes)}\n")

    def show(value):
        if value is None:
            return "(absent)"
        text = " ".join(str(value).split())
        return text if len(text) <= 90 else text[:87] + "..."

    by_control: dict[str, list] = {}
    for name, prop, old, new in changes:
        by_control.setdefault(name, []).append((prop, old, new))
    for name in sorted(by_control):
        print(f"  {name}")
        for prop, old, new in by_control[name]:
            print(f"      {prop:16s} {show(old)}  ->  {show(new)}")

    if args.json:
        pathlib.Path(args.json).write_text(json.dumps({
            "added": added, "removed": removed,
            "changes": [
                {"control": n, "property": p, "before": o, "after": w}
                for n, p, o, w in changes
            ],
        }, indent=2), encoding="utf-8")
        print(f"\nwritten: {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
