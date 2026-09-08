#!/usr/bin/env bash
# Repack edited sources into a solution ZIP.
#
#   tools/pack.sh [version] [dest-zip]
#
# Reverses unpack.sh: packs source-working/canvas back into the .msapp inside
# source-working/solution, stamps the solution version, rezips, then verifies
# the result extracts and re-unpacks cleanly.
#
# Directive ref: §76 (never emit a ZIP with the right filename but a corrupt
# payload) — the round-trip verification below is not optional.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-1.0.0.9}"
DEST_ZIP="${2:-$ROOT/outputs/ESGDigitalRadiologicalSurveys_${VERSION//./_}_UNMANAGED.zip}"
WORK="$ROOT/source-working"

[[ -d "$WORK/canvas" ]]   || { echo "Missing $WORK/canvas — run unpack.sh first" >&2; exit 1; }
[[ -d "$WORK/solution" ]] || { echo "Missing $WORK/solution — run unpack.sh first" >&2; exit 1; }

MSAPP="$(find "$WORK/solution" -name '*.msapp' -print -quit)"
[[ -n "$MSAPP" ]] || { echo "No .msapp in $WORK/solution" >&2; exit 1; }

echo "==> Packing canvas sources into .msapp"
"$ROOT/tools/pac" canvas pack \
  --sources "$WORK/canvas" \
  --msapp "$MSAPP" \
  --layout SourceCode \
  --overwrite

echo "==> Stamping solution version $VERSION"
python3 - "$WORK/solution/solution.xml" "$VERSION" <<'PY'
import sys, xml.etree.ElementTree as ET
path, version = sys.argv[1], sys.argv[2]
tree = ET.parse(path)
node = tree.getroot().find(".//SolutionManifest/Version")
if node is None:
    raise SystemExit("Could not locate SolutionManifest/Version in solution.xml")
node.text = version
tree.write(path, encoding="utf-8", xml_declaration=True)
print(f"solution.xml Version -> {version}")
PY

echo "==> Building solution ZIP"
mkdir -p "$(dirname "$DEST_ZIP")"
rm -f "$DEST_ZIP"
( cd "$WORK/solution" && zip -q -r -X "$DEST_ZIP" . )

echo "==> Verifying output"
unzip -tq "$DEST_ZIP"
VERIFY="$(mktemp -d)"
trap 'rm -rf "$VERIFY"' EXIT
unzip -q "$DEST_ZIP" -d "$VERIFY"
VMSAPP="$(find "$VERIFY" -name '*.msapp' -print -quit)"
unzip -tq "$VMSAPP"
"$ROOT/tools/pac" canvas unpack --msapp "$VMSAPP" --sources "$VERIFY/canvas" --layout SourceCode --overwrite >/dev/null

echo "==> Output: $DEST_ZIP"
sha256sum "$DEST_ZIP"
ls -l "$DEST_ZIP"
echo
echo "STUDIO VERIFICATION REQUIRED: structural checks only. Import into Power"
echo "Apps Studio and exercise the workflows before treating this as runnable."
