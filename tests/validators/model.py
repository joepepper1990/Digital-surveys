"""Common result types for the validator suite.

A validator returns Findings. A Finding is either an ERROR (the build should
not be released), a WARNING (needs a human decision), or INFO.

Nothing in this suite proves runtime behaviour. See docs/VALIDATION_REPORT_1_0_0_9.md
for what static checks do and do not establish (directive §60, §68, §77).
"""
from __future__ import annotations

import dataclasses
import enum
from typing import Iterable


class Severity(enum.Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    BLOCKED = "BLOCKED"   # check could not run: controlled source not supplied
    INFO = "INFO"


@dataclasses.dataclass(frozen=True)
class Finding:
    rule: str
    severity: Severity
    message: str
    location: str = ""
    detail: str = ""

    def render(self) -> str:
        head = f"[{self.severity.value}] {self.rule}: {self.message}"
        if self.location:
            head += f"\n    at {self.location}"
        if self.detail:
            head += f"\n    {self.detail}"
        return head


@dataclasses.dataclass
class Report:
    findings: list[Finding] = dataclasses.field(default_factory=list)
    checks_run: int = 0

    def add(self, finding: Finding) -> None:
        self.findings.append(finding)

    def extend(self, findings: Iterable[Finding]) -> None:
        self.findings.extend(findings)

    def of(self, severity: Severity) -> list[Finding]:
        return [f for f in self.findings if f.severity is severity]

    @property
    def errors(self) -> list[Finding]:
        return self.of(Severity.ERROR)

    @property
    def warnings(self) -> list[Finding]:
        return self.of(Severity.WARNING)

    @property
    def blocked(self) -> list[Finding]:
        """Checks that could not run. Never counted as a pass (§68, §77)."""
        return self.of(Severity.BLOCKED)

    @property
    def ok(self) -> bool:
        return not self.errors
