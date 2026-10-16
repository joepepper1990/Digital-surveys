#!/usr/bin/env bash
# Build, validate, pack and test the ESG 1-to-1 solution. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH" DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}" DOTNET_CLI_TELEMETRY_OPTOUT=1
python3 tools/build.py | grep -Ev '^(Processing|Packing| - |$)' || true
test -f ESGOneToOne_1_3_0_0_unmanaged.zip
python3 tools/test_validate.py | tail -1
python3 tools/simulate.py | tail -1
ESG_SIM_MODE=legacy python3 tools/simulate.py | tail -1
node tools/test_builder.js | tail -3
python3 tools/check_builder_zips.py | tail -1
echo "ALL CHECKS PASSED"
