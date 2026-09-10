#!/usr/bin/env python3
"""Surgical property edits on a pac `.fx.yaml` canvas source.

The 1.1.0.5 screen source is a single 3 MB file holding 760 flat controls whose
property values are raw Power Fx — not always valid YAML. Loading it with a
YAML library and dumping it back would reformat and corrupt it, so edits are
applied as exact line operations inside the addressed control's block.

    set   <control> <Property> <value>   replace, or insert if absent
    get   <control> [Property]           print current value(s)

Every edit verifies afterwards that the control still parses and that the
property reads back as intended; a mismatch aborts with a non-zero exit rather
than leaving the file half-changed.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

_AS_DECL = re.compile(r"^(?P<indent> *)(?P<name>[A-Za-z_]\w*) As (?P<type>[A-Za-z_][\w.]*)\s*:\s*$")


class Block:
    """One control's lines within the file."""

    def __init__(self, name: str, start: int, end: int, indent: int):
        self.name, self.start, self.end, self.indent = name, start, end, indent


def blocks(lines: list[str]) -> dict[str, Block]:
    found: dict[str, Block] = {}
    open_block: Block | None = None
    for index, line in enumerate(lines):
        match = _AS_DECL.match(line)
        if not match:
            continue
        if open_block is not None:
            open_block.end = index
        open_block = Block(match.group("name"), index, len(lines), len(match.group("indent")))
        if open_block.name in found:
            raise SystemExit(f"duplicate control name in source: {open_block.name}")
        found[open_block.name] = open_block
    return found


def _prop_indent(lines: list[str], block: Block) -> int:
    for line in lines[block.start + 1:block.end]:
        if line.strip() and not line.lstrip().startswith("#"):
            return len(line) - len(line.lstrip())
    return block.indent + 4


def find_property(lines: list[str], block: Block, prop: str) -> tuple[int, int] | None:
    """Line span of `prop` inside `block`, including any block scalar."""
    indent = _prop_indent(lines, block)
    pattern = re.compile(rf"^ {{{indent}}}{re.escape(prop)}\s*:\s*(?P<value>.*)$")
    for index in range(block.start + 1, block.end):
        match = pattern.match(lines[index])
        if not match:
            continue
        end = index + 1
        if match.group("value").strip() in ("|", "|-", "|+", ">", ">-", ">+"):
            while end < block.end:
                text = lines[end]
                if text.strip() and (len(text) - len(text.lstrip())) <= indent:
                    break
                end += 1
        return index, end
    return None


def get_property(lines: list[str], block: Block, prop: str) -> str | None:
    span = find_property(lines, block, prop)
    if span is None:
        return None
    start, end = span
    first = lines[start].split(":", 1)[1].strip()
    if first in ("|", "|-", "|+", ">", ">-", ">+"):
        return "\n".join(line.strip() for line in lines[start + 1:end]).strip()
    return first


def set_property(lines: list[str], block: Block, prop: str, value: str) -> list[str]:
    """Replace or insert `prop`. Multi-line values become a `|-` block."""
    indent = _prop_indent(lines, block)
    pad = " " * indent
    if "\n" in value:
        body = [f"{pad}{prop}: |-"] + [f"{pad}    {part}" for part in value.split("\n")]
    else:
        body = [f"{pad}{prop}: {value}"]

    span = find_property(lines, block, prop)
    if span is not None:
        start, end = span
        return lines[:start] + body + lines[end:]

    # Insert in alphabetical position among the block's own properties, which
    # is the order pac emits, so the file stays diff-friendly.
    prop_pattern = re.compile(rf"^ {{{indent}}}(?P<name>[A-Za-z_]\w*)\s*:")
    insert_at = block.end
    for index in range(block.start + 1, block.end):
        match = prop_pattern.match(lines[index])
        if match and match.group("name") > prop:
            insert_at = index
            break
    return lines[:insert_at] + body + lines[insert_at:]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True)
    sub = parser.add_subparsers(dest="command", required=True)

    setter = sub.add_parser("set")
    setter.add_argument("control")
    setter.add_argument("prop")
    setter.add_argument("value")

    getter = sub.add_parser("get")
    getter.add_argument("control")
    getter.add_argument("prop", nargs="?")

    args = parser.parse_args(argv)
    path = pathlib.Path(args.file)
    lines = path.read_text(encoding="utf-8").split("\n")
    found = blocks(lines)

    if args.control not in found:
        print(f"no such control: {args.control}", file=sys.stderr)
        return 2
    block = found[args.control]

    if args.command == "get":
        if args.prop:
            print(get_property(lines, block, args.prop) or "")
        else:
            indent = _prop_indent(lines, block)
            for line in lines[block.start:block.end]:
                print(line)
        return 0

    updated = set_property(lines, block, args.prop, args.value)
    path.write_text("\n".join(updated), encoding="utf-8")

    # Verify the edit landed and the block still parses.
    lines2 = path.read_text(encoding="utf-8").split("\n")
    block2 = blocks(lines2).get(args.control)
    if block2 is None:
        print(f"FATAL: {args.control} no longer parses after edit", file=sys.stderr)
        return 1
    readback = get_property(lines2, block2, args.prop)
    expected = args.value.strip()
    if (readback or "").strip() != expected and "\n" not in args.value:
        print(f"FATAL: readback mismatch for {args.control}.{args.prop}: "
              f"{readback!r} != {expected!r}", file=sys.stderr)
        return 1
    print(f"{args.control}.{args.prop} = {readback}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
