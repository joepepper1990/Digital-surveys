"""Load an unpacked canvas app into a flat list of (control, property, formula).

Three input shapes are understood, so the analyser works whether or not the
Power Platform CLI is available:

  *.pa.yaml   pac canvas unpack --layout SourceCode   (current)
  *.fx.yaml   pac canvas unpack --layout Experimental (legacy, deprecated)
  Controls/*.json  the raw control JSON inside an extracted .msapp

The parser is deliberately tolerant: it walks the tree looking for control-ish
mappings and for scalar strings that are Power Fx (leading '='), rather than
assuming a schema version. An unknown key never aborts the scan.
"""
from __future__ import annotations

import dataclasses
import json
import pathlib
from typing import Iterator

import yaml

# Keys whose presence marks a mapping as describing a control rather than a
# plain property bag.
_CONTROL_MARKERS = {"Control", "Properties", "Children", "Variant"}


@dataclasses.dataclass(frozen=True)
class Formula:
    """One Power Fx expression bound to one property of one control."""

    file: str
    control: str
    control_path: str
    control_type: str
    prop: str
    expression: str

    @property
    def location(self) -> str:
        return f"{self.file}::{self.control_path}.{self.prop}"


@dataclasses.dataclass
class Control:
    name: str
    path: str
    type: str
    file: str
    formulas: dict[str, str] = dataclasses.field(default_factory=dict)

    @property
    def location(self) -> str:
        return f"{self.file}::{self.path}"


@dataclasses.dataclass
class CanvasSource:
    root: pathlib.Path
    controls: list[Control] = dataclasses.field(default_factory=list)
    files: list[str] = dataclasses.field(default_factory=list)
    parse_errors: list[tuple[str, str]] = dataclasses.field(default_factory=list)

    @property
    def formulas(self) -> Iterator[Formula]:
        for control in self.controls:
            for prop, expression in control.formulas.items():
                yield Formula(
                    file=control.file,
                    control=control.name,
                    control_path=control.path,
                    control_type=control.type,
                    prop=prop,
                    expression=expression,
                )

    @property
    def is_empty(self) -> bool:
        return not self.controls


def _is_formula(value: object) -> bool:
    return isinstance(value, str) and value.lstrip().startswith("=")


def _looks_like_control(value: object) -> bool:
    return isinstance(value, dict) and bool(_CONTROL_MARKERS & value.keys())


def _walk_yaml(node: object, path: list[str], file: str, out: list[Control]) -> None:
    """Recursively collect controls and their formulas from a .pa.yaml tree."""
    if isinstance(node, list):
        for item in node:
            _walk_yaml(item, path, file, out)
        return
    if not isinstance(node, dict):
        return

    for key, value in node.items():
        # Containers that add no name to the control path.
        if key in ("Screens", "Children", "Properties", "ComponentDefinitions", "Components"):
            _walk_yaml(value, path, file, out)
            continue

        if _looks_like_control(value):
            name = str(key)
            child_path = path + [name]
            control = Control(
                name=name,
                path="/".join(child_path),
                type=str(value.get("Control", "") or ""),
                file=file,
            )
            for prop, prop_value in (value.get("Properties") or {}).items():
                if _is_formula(prop_value):
                    control.formulas[str(prop)] = str(prop_value)
            # Formulas can also sit directly on the control mapping.
            for prop, prop_value in value.items():
                if _is_formula(prop_value):
                    control.formulas.setdefault(str(prop), str(prop_value))
            out.append(control)
            _walk_yaml(value, child_path, file, out)
            continue

        if isinstance(value, (dict, list)):
            _walk_yaml(value, path, file, out)


def _walk_msapp_json(node: dict, path: list[str], file: str, out: list[Control]) -> None:
    """Collect controls from the raw control JSON found inside an .msapp."""
    name = str(node.get("Name", "") or "")
    child_path = path + [name] if name else path
    template = node.get("Template") or {}
    control = Control(
        name=name,
        path="/".join(child_path),
        type=str(template.get("Name", "") or node.get("ControlUniqueId", "") or ""),
        file=file,
    )
    for rule in node.get("Rules") or []:
        prop = str(rule.get("Property", "") or "")
        expression = rule.get("InvariantScript")
        if prop and isinstance(expression, str):
            # msapp JSON stores the expression without the leading '='.
            control.formulas[prop] = expression if expression.startswith("=") else "=" + expression
    if name:
        out.append(control)
    for child in node.get("Children") or []:
        if isinstance(child, dict):
            _walk_msapp_json(child, child_path, file, out)


def load(root: str | pathlib.Path) -> CanvasSource:
    """Load every recognised source file under `root`."""
    root = pathlib.Path(root)
    source = CanvasSource(root=root)
    if not root.exists():
        return source

    patterns = ("**/*.pa.yaml", "**/*.fx.yaml", "**/*.json")
    seen: set[pathlib.Path] = set()
    for pattern in patterns:
        for path in sorted(root.glob(pattern)):
            if path in seen or not path.is_file():
                continue
            seen.add(path)
            rel = str(path.relative_to(root))
            try:
                if path.name.endswith((".pa.yaml", ".fx.yaml")):
                    data = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
                    if data is None:
                        continue
                    before = len(source.controls)
                    _walk_yaml(data, [], rel, source.controls)
                    if len(source.controls) > before:
                        source.files.append(rel)
                else:
                    data = json.loads(path.read_text(encoding="utf-8-sig"))
                    if isinstance(data, dict) and ("TopParent" in data or "Rules" in data):
                        top = data.get("TopParent", data)
                        if isinstance(top, dict):
                            before = len(source.controls)
                            _walk_msapp_json(top, [], rel, source.controls)
                            if len(source.controls) > before:
                                source.files.append(rel)
            except (yaml.YAMLError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                source.parse_errors.append((rel, str(exc)))
    return source
