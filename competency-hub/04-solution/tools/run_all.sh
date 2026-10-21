#!/bin/sh
# Every check for the solution, in order. Evidence class: LOCAL / OFFLINE-SIMULATED.
set -e
cd "$(dirname "$0")"
python3 build_solution.py --check
python3 test_validate.py
python3 test_flow.py
python3 check_package.py
