#!/usr/bin/env python3
"""Stamp the solution version, changing only those bytes.

    tools/stamp_version.py <solution.xml> <version>

Parsing and re-serialising the XML would rewrite the whole document: the
Dataverse export carries a UTF-8 byte-order mark, self-closing tags and an
attribute order that a round-trip through ElementTree does not preserve. A
release must differ from its predecessor only where intended, so this replaces
the version text in place and asserts that nothing else moved.
"""
from __future__ import annotations

import pathlib
import re
import sys

_VERSION = re.compile(rb"(<Version>)([^<]*)(</Version>)")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    path, version = pathlib.Path(argv[1]), argv[2]
    raw = path.read_bytes()
    match = _VERSION.search(raw)
    if match is None:
        print("Could not locate <Version> in solution.xml", file=sys.stderr)
        return 1

    was = match.group(2).decode()
    updated = _VERSION.sub(
        rb"\g<1>" + version.encode() + rb"\g<3>", raw, count=1)
    if len(updated) - len(raw) != len(version) - len(was):
        print("Refusing to write: unexpected length change", file=sys.stderr)
        return 1
    if updated[:3] != raw[:3]:
        print("Refusing to write: byte-order mark changed", file=sys.stderr)
        return 1
    # Everything either side of the version text must be untouched.
    if (updated[:match.start(2)] != raw[:match.start(2)]
            or updated[match.start(2) + len(version):] != raw[match.end(2):]):
        print("Refusing to write: bytes outside <Version> changed", file=sys.stderr)
        return 1
    path.write_bytes(updated)
    print(f"solution.xml Version {was} -> {version} (only those bytes changed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
