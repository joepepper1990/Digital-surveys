"""Package validator tests, driven by synthetic solution ZIPs built in-process."""
import json
import pathlib
import zipfile

import pytest

from validators import rules_package
from validators.model import Severity

SOLUTION_XML = """<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml>
  <SolutionManifest>
    <UniqueName>ESGRadiologicalSurveys</UniqueName>
    <Version>{version}</Version>
    <Managed>{managed}</Managed>
    <Publisher><UniqueName>esg</UniqueName></Publisher>
  </SolutionManifest>
</ImportExportXml>
"""


def _make_msapp(path: pathlib.Path, **overrides) -> None:
    properties = {
        "Name": "ESG Radiological Surveys",
        "DocumentLayoutWidth": 1440,
        "DocumentLayoutHeight": 960,
        "DocumentLayoutOrientation": "Landscape",
    }
    properties.update(overrides)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("Properties.json", json.dumps(properties))
        archive.writestr("Controls/1.json", json.dumps({"TopParent": {"Name": "App", "Rules": []}}))


def _make_solution(tmp_path, version="1.0.0.9", managed="0", customizations=True, **msapp) -> pathlib.Path:
    msapp_path = tmp_path / "app.msapp"
    _make_msapp(msapp_path, **msapp)
    zip_path = tmp_path / f"solution-{version}.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("solution.xml", SOLUTION_XML.format(version=version, managed=managed))
        if customizations:
            archive.writestr("customizations.xml", "<ImportExportXml />")
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.write(msapp_path, "CanvasApps/esg_app.msapp")
    return zip_path


def _errors(findings):
    return [f for f in findings if f.severity is Severity.ERROR]


def test_well_formed_package_has_no_errors(tmp_path):
    findings = rules_package.check(_make_solution(tmp_path))
    assert _errors(findings) == [], "\n".join(f.render() for f in findings)


def test_wrong_version_is_an_error(tmp_path):
    findings = rules_package.check(_make_solution(tmp_path, version="1.0.0.8"))
    assert any(f.rule.startswith("R104") for f in _errors(findings))


def test_managed_package_is_rejected(tmp_path):
    findings = rules_package.check(_make_solution(tmp_path, managed="1"))
    assert any(f.rule.startswith("R105") for f in _errors(findings))


def test_missing_required_member_is_an_error(tmp_path):
    findings = rules_package.check(_make_solution(tmp_path, customizations=False))
    assert any(f.rule.startswith("R102") for f in _errors(findings))


def test_canvas_geometry_is_checked(tmp_path):
    findings = rules_package.check(
        _make_solution(tmp_path, DocumentLayoutWidth=1366, DocumentLayoutHeight=768)
    )
    rules = {f.rule.split()[0] for f in _errors(findings)}
    assert {"R112", "R113"} <= rules


def test_renamed_canvas_app_is_flagged(tmp_path):
    findings = rules_package.check(_make_solution(tmp_path, Name="Something Else"))
    assert any(f.rule.startswith("R111") for f in findings)


def test_corrupt_zip_is_detected(tmp_path):
    broken = tmp_path / "broken.zip"
    broken.write_bytes(b"PK\x03\x04 not really a zip")
    findings = rules_package.check(broken)
    assert any(f.rule.startswith("R101") for f in _errors(findings))


def test_corrupt_embedded_msapp_is_detected(tmp_path):
    zip_path = tmp_path / "bad-msapp.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("solution.xml", SOLUTION_XML.format(version="1.0.0.9", managed="0"))
        archive.writestr("customizations.xml", "<ImportExportXml />")
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("CanvasApps/esg_app.msapp", b"not a zip at all")
    findings = rules_package.check(zip_path)
    assert any(f.rule.startswith("R109") for f in _errors(findings))


def test_malformed_xml_is_detected(tmp_path):
    zip_path = tmp_path / "bad-xml.zip"
    msapp_path = tmp_path / "app2.msapp"
    _make_msapp(msapp_path)
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("solution.xml", "<ImportExportXml><SolutionManifest>")
        archive.writestr("customizations.xml", "<ImportExportXml />")
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.write(msapp_path, "CanvasApps/esg_app.msapp")
    findings = rules_package.check(zip_path)
    assert any(f.rule.startswith("R103") for f in _errors(findings))


def test_missing_package_reports_cleanly():
    findings = rules_package.check("/definitely/not/here.zip")
    assert len(findings) == 1 and findings[0].rule.startswith("R100")


def test_sha256_is_stable(tmp_path):
    package = _make_solution(tmp_path)
    assert rules_package.sha256(package) == rules_package.sha256(package)
    assert len(rules_package.sha256(package)) == 64
