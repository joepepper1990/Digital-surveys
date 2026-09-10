#!/usr/bin/env python3
"""Verify a delivered solution ZIP, from the ZIP rather than the source tree.

    tools/verify_package.py outputs/<solution>.zip [--baseline <previous>.zip]
                            [--expect-version 1.1.0.6]

A source tree that passes proves nothing about the artefact that ships. This
re-opens the delivered ZIP, walks into the .msapp inside it, and checks the
structural claims a release makes: version, managed flag, archive integrity,
the checksum manifest, control-name and control-ID uniqueness, that the app
still declares no data sources, and — with `--baseline` — exactly which files
changed against the previous release.

Exit code 1 if any check fails. Structural only: STUDIO VERIFICATION REQUIRED.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tests"))


class Checks:
    def __init__(self) -> None:
        self.rows: list[tuple[bool, str, str]] = []

    def add(self, ok: bool, name: str, detail: str = "") -> bool:
        self.rows.append((ok, name, detail))
        return ok

    @property
    def failed(self) -> list[tuple[bool, str, str]]:
        return [row for row in self.rows if not row[0]]

    def report(self) -> None:
        width = max(len(name) for _, name, _ in self.rows)
        for ok, name, detail in self.rows:
            mark = "PASS" if ok else "FAIL"
            print(f"  [{mark}] {name:<{width}}  {detail}")
        print(f"\n  {len(self.rows) - len(self.failed)}/{len(self.rows)} checks passed")


def _msapp_bytes(zf: zipfile.ZipFile) -> tuple[str, bytes]:
    for name in zf.namelist():
        if name.lower().endswith(".msapp"):
            return name, zf.read(name)
    raise SystemExit("no .msapp inside the solution ZIP")


def _walk_controls(node: dict, out: list[dict]) -> None:
    out.append(node)
    for child in node.get("Children") or []:
        if isinstance(child, dict):
            _walk_controls(child, out)


def verify(package: pathlib.Path, baseline: pathlib.Path | None,
           expect_version: str | None) -> int:
    checks = Checks()
    print(f"Package: {package}")
    print(f"SHA-256: {hashlib.sha256(package.read_bytes()).hexdigest()}")
    print(f"Size:    {package.stat().st_size} bytes\n")

    checks.add(package.exists() and package.stat().st_size > 0, "package exists")

    with zipfile.ZipFile(package) as zf:
        checks.add(zf.testzip() is None, "outer ZIP integrity", "no corrupt entries")

        names = set(zf.namelist())
        for required in ("solution.xml", "customizations.xml", "[Content_Types].xml"):
            checks.add(required in names, f"contains {required}")

        raw_solution = zf.read("solution.xml")
        root = ET.fromstring(raw_solution)
        version = root.findtext(".//SolutionManifest/Version") or ""
        managed = root.findtext(".//SolutionManifest/Managed") or ""
        unique = root.findtext(".//SolutionManifest/UniqueName") or ""
        checks.add(bool(version), "solution version present", version)
        if expect_version:
            checks.add(version == expect_version, "solution version matches expected",
                       f"{version} == {expect_version}")
        checks.add(managed == "0", "solution is unmanaged", f"Managed={managed}")
        checks.add(unique == "ESGDigitalRadiologicalSurveys", "solution identity preserved", unique)

        # A Dataverse export carries a BOM on solution.xml and customizations.xml;
        # the .msapp payload files must not. Both directions are checked.
        bom = b"\xef\xbb\xbf"
        checks.add(raw_solution.startswith(bom), "solution.xml keeps its BOM",
                   "as exported by Dataverse")

        msapp_name, msapp_raw = _msapp_bytes(zf)
        checks.add(True, "contains .msapp", msapp_name.split("/")[-1])

    with zipfile.ZipFile(io.BytesIO(msapp_raw)) as mf:
        checks.add(mf.testzip() is None, "msapp integrity", "no corrupt entries")
        inner = mf.namelist()
        checks.add("checksum.json" in inner, "checksum.json present")

        manifest = json.loads(mf.read("checksum.json"))
        per_file = manifest.get("ClientPerFileChecksums", {})
        checks.add(bool(per_file), "checksum manifest populated",
                   f"{len(per_file)} entries")
        checks.add(bool(manifest.get("ClientStampedChecksum")),
                   "stamped checksum present")
        listed = {name.replace("\\", "/") for name in per_file}
        present = {name.replace("\\", "/") for name in inner}
        checks.add(listed <= present, "every checksummed file is in the archive",
                   f"{len(listed - present)} missing")

        for name in inner:
            if name.endswith(".json"):
                body = mf.read(name)
                checks.add(not body.startswith(b"\xef\xbb\xbf"),
                           f"no BOM in {name.split('/')[-1]}")

        controls_files = [n for n in inner if n.replace("\\", "/").startswith("Controls/")]
        checks.add(bool(controls_files), "Controls JSON present",
                   ", ".join(sorted(n.split("\\")[-1] for n in controls_files)))

        all_controls: list[dict] = []
        for name in controls_files:
            data = json.loads(mf.read(name))
            top = data.get("TopParent", data)
            if isinstance(top, dict):
                _walk_controls(top, all_controls)
        checks.add(bool(all_controls), "control tree parses",
                   f"{len(all_controls)} controls")

        control_names = [c.get("Name") for c in all_controls if c.get("Name")]
        duplicates = {n for n in control_names if control_names.count(n) > 1}
        checks.add(not duplicates, "control names unique",
                   f"{len(control_names)} names"
                   + (f", duplicates: {sorted(duplicates)}" if duplicates else ""))

        ids = [c.get("ControlUniqueId") for c in all_controls if c.get("ControlUniqueId")]
        dup_ids = {i for i in ids if ids.count(i) > 1}
        checks.add(not dup_ids, "control IDs unique",
                   f"{len(ids)} ids" + (f", duplicates: {sorted(dup_ids)}" if dup_ids else ""))

        sources = json.loads(mf.read("References\\DataSources.json")
                             if "References\\DataSources.json" in inner
                             else mf.read("References/DataSources.json"))
        declared = sources.get("DataSources", [])
        checks.add(not declared, "no data sources declared",
                   "no cloud or Dataverse dependency"
                   if not declared else f"{len(declared)} declared")

        properties = json.loads(mf.read("Properties.json"))
        width = properties.get("DocumentLayoutWidth")
        height = properties.get("DocumentLayoutHeight")
        checks.add((width, height) == (1440, 960), "canvas is 1440x960",
                   f"{width}x{height}")

        sarif = "AppCheckerResult.sarif" in inner
        checks.add(sarif, "App Checker result carried through",
                   "not regenerated in this environment; original retained")

    # --- delta against the previous release -------------------------------
    if baseline and baseline.exists():
        print(f"\nBaseline: {baseline}")
        with zipfile.ZipFile(baseline) as bz:
            _, base_msapp = _msapp_bytes(bz)
            base_solution = bz.read("solution.xml")
        with zipfile.ZipFile(io.BytesIO(base_msapp)) as bm, \
             zipfile.ZipFile(io.BytesIO(msapp_raw)) as nm:
            base_files = {n: hashlib.sha256(bm.read(n)).hexdigest() for n in bm.namelist()}
            new_files = {n: hashlib.sha256(nm.read(n)).hexdigest() for n in nm.namelist()}
        added = sorted(set(new_files) - set(base_files))
        removed = sorted(set(base_files) - set(new_files))
        checks.add(not added and not removed, "no msapp files added or removed",
                   f"added: {added or 'none'}, removed: {removed or 'none'}")

        # pac rewrites every JSON payload with its own formatting and
        # normalises CRLF to LF inside the embedded control template, so a
        # byte comparison flags a dozen files that carry identical data.
        # Compare the data instead, and name the files that really differ.
        with zipfile.ZipFile(io.BytesIO(base_msapp)) as bm, \
             zipfile.ZipFile(io.BytesIO(msapp_raw)) as nm:
            semantic: list[str] = []
            cosmetic: list[str] = []
            for name in sorted(set(bm.namelist()) & set(nm.namelist())):
                before_bytes, after_bytes = bm.read(name), nm.read(name)
                if before_bytes == after_bytes:
                    continue
                if name.endswith((".json", ".sarif")):
                    try:
                        if json.loads(before_bytes) == json.loads(after_bytes):
                            cosmetic.append(name)
                            continue
                    except ValueError:
                        pass
                elif b"".join(before_bytes.split()) == b"".join(after_bytes.split()):
                    cosmetic.append(name)
                    continue
                semantic.append(name)
        expected = {"Controls\\4.json", "Controls/4.json",
                    "References\\Templates.json", "References/Templates.json",
                    "checksum.json"}
        checks.add(set(semantic) <= expected,
                   "only the control tree changed in substance",
                   f"changed: {semantic or 'none'}; reformatted only: {len(cosmetic)}")
        # solution.xml must differ only in its version text.
        import re
        normalise = lambda raw: re.sub(rb"<Version>[^<]*</Version>", b"<Version/>", raw)
        checks.add(normalise(base_solution) == normalise(raw_solution),
                   "solution.xml differs only in version")

    print()
    checks.report()
    print("\n  STUDIO VERIFICATION REQUIRED — these are structural checks only.")
    return 1 if checks.failed else 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package")
    parser.add_argument("--baseline", default=None)
    parser.add_argument("--expect-version", default=None)
    args = parser.parse_args(argv)
    return verify(
        pathlib.Path(args.package),
        pathlib.Path(args.baseline) if args.baseline else None,
        args.expect_version,
    )


if __name__ == "__main__":
    raise SystemExit(main())
