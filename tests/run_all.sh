#!/usr/bin/env bash
# Convenience entry point: unit tests for the validators, then the suite itself.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "==> Validator self-tests"
python3 -m pytest tests -q
echo
echo "==> Validation suite"
python3 tests/run_all.py "$@"
