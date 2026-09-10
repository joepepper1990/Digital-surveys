#!/usr/bin/env python3
"""Run the full validation suite and print a report.

    tests/run_all.py [--package outputs/<solution>.zip] [--sources source-working/canvas]

Exit codes:
    0  no ERROR findings
    1  at least one ERROR finding

BLOCKED findings never fail the run — they record a check that could not be
performed because a controlled source was not supplied. They are also never
reported as passes (§68, §77).
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from validators import (  # noqa: E402
    design_tokens, pa_source, rules_config, rules_package, rules_runtime, rules_static,
)
from validators.model import Finding, Report, Severity  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _default_package() -> pathlib.Path | None:
    candidates = sorted((ROOT / "outputs").glob("*.zip"))
    return candidates[-1] if candidates else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", default=None, help="Solution ZIP to validate")
    parser.add_argument("--sources", default=str(ROOT / "source-working" / "canvas"))
    parser.add_argument("--config", default=str(ROOT / "config"))
    args = parser.parse_args(argv)

    report = Report()

    # --- package ----------------------------------------------------------
    package = pathlib.Path(args.package) if args.package else _default_package()
    if package is None:
        report.add(
            Finding(
                rule="R100 package-present",
                severity=Severity.BLOCKED,
                message="No solution ZIP to validate.",
                location=str(ROOT / "outputs"),
                detail=(
                    "A 1.1.0.6 package cannot be produced until the 1.1.0.5 baseline "
                    "artefact is placed in source-original/. See "
                    "docs/BASELINE_REPORT_1_1_0_6.md."
                ),
            )
        )
    else:
        report.extend(rules_package.check(package))

    # --- static analysis --------------------------------------------------
    sources = pathlib.Path(args.sources)
    source = pa_source.load(sources)
    if source.is_empty:
        report.add(
            Finding(
                rule="R001-R020 static-analysis",
                severity=Severity.BLOCKED,
                message="No canvas sources to analyse.",
                location=str(sources),
                detail=(
                    "Run tools/unpack.sh against the baseline package first. The analysers "
                    "are self-tested against tests/fixtures — see tests/test_static_rules.py "
                    "and tests/test_runtime_rules.py."
                ),
            )
        )
    else:
        for rel, error in source.parse_errors:
            report.add(
                Finding(
                    rule="R000 source-parse",
                    severity=Severity.ERROR,
                    message=f"Could not parse source file '{rel}'.",
                    detail=error,
                )
            )
        report.extend(rules_static.run_all(source))
        report.extend(rules_runtime.run_all(source))

    # --- configuration ----------------------------------------------------
    report.extend(rules_config.run_all(pathlib.Path(args.config)))

    # --- design system ----------------------------------------------------
    report.extend(design_tokens.check())

    _print(report, package, source)
    return 1 if report.errors else 0


def _print(report: Report, package: pathlib.Path | None, source) -> None:
    width = 78
    print("=" * width)
    print("ESG Digital Radiological Surveys — validation suite")
    print("=" * width)
    print(f"package : {package or '(none)'}")
    print(f"controls analysed : {len(source.controls)}")
    print("-" * width)

    for severity in (Severity.ERROR, Severity.WARNING, Severity.BLOCKED, Severity.INFO):
        group = report.of(severity)
        if not group:
            continue
        print(f"\n{severity.value} ({len(group)})")
        print("-" * width)
        for finding in group:
            print(finding.render())
            print()

    print("=" * width)
    print(
        f"errors {len(report.errors)}  "
        f"warnings {len(report.warnings)}  "
        f"blocked {len(report.blocked)}  "
        f"info {len(report.of(Severity.INFO))}"
    )
    if report.blocked:
        print(
            "\nNOTE: BLOCKED checks did not run and must not be reported as passes.\n"
            "      STUDIO VERIFICATION REQUIRED regardless of this result — static\n"
            "      analysis proves nothing about Canvas runtime behaviour (§60)."
        )
    print("=" * width)


if __name__ == "__main__":
    raise SystemExit(main())
