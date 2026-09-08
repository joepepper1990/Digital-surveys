"""Package-level integrity and identity checks (directive §54).

These prove that the ZIP is well formed and says what it should say. They prove
nothing at all about runtime behaviour — §3 of the directive is explicit that a
structurally valid package can still be semantically wrong.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import tempfile
import xml.etree.ElementTree as ET
import zipfile

from .model import Finding, Severity

_EXPECTED_PATH = pathlib.Path(__file__).resolve().parents[1] / "rules" / "expected-package.json"


def load_expected(path: str | pathlib.Path | None = None) -> dict:
    return json.loads(pathlib.Path(path or _EXPECTED_PATH).read_text(encoding="utf-8"))


def sha256(path: str | pathlib.Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _zip_is_intact(path: pathlib.Path) -> tuple[bool, str]:
    try:
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
        return (bad is None, "" if bad is None else f"CRC failure in member '{bad}'")
    except zipfile.BadZipFile as exc:
        return (False, str(exc))


def _text(root: ET.Element, path: str) -> str | None:
    node = root.find(path)
    return None if node is None or node.text is None else node.text.strip()


def check(package: str | pathlib.Path, expected: dict | None = None) -> list[Finding]:
    """Validate a solution ZIP. Returns findings; an empty list means clean."""
    expected = expected or load_expected()
    package = pathlib.Path(package)
    findings: list[Finding] = []

    if not package.exists():
        return [
            Finding(
                rule="R100 package-present",
                severity=Severity.ERROR,
                message=f"Solution package not found: {package}",
            )
        ]

    intact, detail = _zip_is_intact(package)
    if not intact:
        return [
            Finding(
                rule="R101 outer-zip-integrity",
                severity=Severity.ERROR,
                message="Outer solution ZIP failed integrity check.",
                location=str(package),
                detail=detail,
            )
        ]

    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        with zipfile.ZipFile(package) as archive:
            archive.extractall(work)
            names = set(archive.namelist())

        # --- required members -------------------------------------------------
        for required in expected["requiredSolutionFiles"]:
            if not any(n == required or n.endswith("/" + required) for n in names):
                findings.append(
                    Finding(
                        rule="R102 required-solution-file",
                        severity=Severity.ERROR,
                        message=f"Solution is missing required member '{required}'.",
                        location=str(package),
                    )
                )

        # --- XML validity -----------------------------------------------------
        for xml_path in sorted(work.rglob("*.xml")):
            try:
                ET.parse(xml_path)
            except ET.ParseError as exc:
                findings.append(
                    Finding(
                        rule="R103 xml-validity",
                        severity=Severity.ERROR,
                        message=f"Malformed XML in '{xml_path.relative_to(work)}'.",
                        location=str(package),
                        detail=str(exc),
                    )
                )

        # --- solution identity ------------------------------------------------
        solution_xml = work / "solution.xml"
        if solution_xml.exists():
            try:
                root = ET.parse(solution_xml).getroot()
            except ET.ParseError:
                root = None
            if root is not None:
                version = _text(root, ".//SolutionManifest/Version")
                if version != expected["expectedVersion"]:
                    findings.append(
                        Finding(
                            rule="R104 solution-version",
                            severity=Severity.ERROR,
                            message=(
                                f"solution.xml declares version '{version}', expected "
                                f"'{expected['expectedVersion']}' (§5)."
                            ),
                            location="solution.xml",
                        )
                    )
                managed = _text(root, ".//SolutionManifest/Managed")
                is_managed = managed == "1"
                if is_managed != expected["expectedManaged"]:
                    findings.append(
                        Finding(
                            rule="R105 solution-managed-flag",
                            severity=Severity.ERROR,
                            message=(
                                f"Solution Managed={managed}; expected an "
                                f"{'un' if not expected['expectedManaged'] else ''}managed package."
                            ),
                            location="solution.xml",
                        )
                    )
                for key, xpath, rule in (
                    ("expectedSolutionUniqueName", ".//SolutionManifest/UniqueName", "R106 solution-unique-name"),
                    ("expectedPublisherUniqueName", ".//SolutionManifest/Publisher/UniqueName", "R107 publisher-unique-name"),
                ):
                    want = expected.get(key)
                    got = _text(root, xpath)
                    if want is None:
                        findings.append(
                            Finding(
                                rule=rule,
                                severity=Severity.INFO,
                                message=f"Recorded {xpath.rsplit('/', 1)[-1]} = '{got}' (no expected value configured).",
                                location="solution.xml",
                            )
                        )
                    elif got != want:
                        findings.append(
                            Finding(
                                rule=rule,
                                severity=Severity.ERROR,
                                message=f"Expected '{want}', found '{got}' (§75 preserve solution identity).",
                                location="solution.xml",
                            )
                        )

        # --- embedded canvas app ---------------------------------------------
        msapps = sorted(work.rglob("*.msapp"))
        if not msapps:
            findings.append(
                Finding(
                    rule="R108 canvas-app-present",
                    severity=Severity.ERROR,
                    message="No .msapp found inside the solution.",
                    location=str(package),
                )
            )
        for msapp in msapps:
            intact, detail = _zip_is_intact(msapp)
            if not intact:
                findings.append(
                    Finding(
                        rule="R109 msapp-integrity",
                        severity=Severity.ERROR,
                        message=f"Embedded .msapp '{msapp.name}' failed integrity check.",
                        detail=detail,
                    )
                )
                continue
            findings.extend(_check_msapp_properties(msapp, expected))

    return findings


def _check_msapp_properties(msapp: pathlib.Path, expected: dict) -> list[Finding]:
    """Read Properties.json / Header.json from inside the .msapp."""
    findings: list[Finding] = []
    with zipfile.ZipFile(msapp) as archive:
        members = {name.lower(): name for name in archive.namelist()}
        properties = None
        for candidate in ("properties.json", "header.json"):
            if candidate in members:
                try:
                    properties = json.loads(archive.read(members[candidate]).decode("utf-8-sig"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    findings.append(
                        Finding(
                            rule="R110 msapp-properties-readable",
                            severity=Severity.ERROR,
                            message=f"Could not parse '{candidate}' inside {msapp.name}.",
                            detail=str(exc),
                        )
                    )
                if properties:
                    break

    if not properties:
        return findings

    name = properties.get("Name") or properties.get("DisplayName")
    if expected.get("expectedCanvasAppName") and name != expected["expectedCanvasAppName"]:
        findings.append(
            Finding(
                rule="R111 canvas-app-name",
                severity=Severity.WARNING,
                message=(
                    f"Canvas app name is '{name}', expected "
                    f"'{expected['expectedCanvasAppName']}' (§75 preserve app identity)."
                ),
                location=msapp.name,
            )
        )

    width = properties.get("DocumentLayoutWidth")
    height = properties.get("DocumentLayoutHeight")
    orientation = properties.get("DocumentLayoutOrientation")
    for got, want, label, rule in (
        (width, expected.get("expectedCanvasWidth"), "width", "R112 canvas-width"),
        (height, expected.get("expectedCanvasHeight"), "height", "R113 canvas-height"),
    ):
        if want is not None and got is not None and int(got) != int(want):
            findings.append(
                Finding(
                    rule=rule,
                    severity=Severity.ERROR,
                    message=f"Canvas {label} is {got}, expected {want} (§3).",
                    location=msapp.name,
                )
            )
    want_orientation = expected.get("expectedCanvasOrientation")
    if want_orientation and orientation and str(orientation).lower() != want_orientation.lower():
        findings.append(
            Finding(
                rule="R114 canvas-orientation",
                severity=Severity.ERROR,
                message=f"Canvas orientation is '{orientation}', expected '{want_orientation}' (§3).",
                location=msapp.name,
            )
        )
    return findings
