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
VERSION="${1:-1.1.0.6}"
DEST_ZIP="${2:-$ROOT/outputs/ESGDigitalRadiologicalSurveys_${VERSION//./_}_FINAL_UNMANAGED.zip}"
WORK="$ROOT/source-working"

[[ -d "$WORK/canvas" ]]   || { echo "Missing $WORK/canvas — run unpack.sh first" >&2; exit 1; }
[[ -d "$WORK/solution" ]] || { echo "Missing $WORK/solution — run unpack.sh first" >&2; exit 1; }

MSAPP="$(find "$WORK/solution" -name '*.msapp' -print -quit)"
[[ -n "$MSAPP" ]] || { echo "No .msapp in $WORK/solution" >&2; exit 1; }

echo "==> Packing canvas sources into .msapp"
# The SourceCode layout cannot represent this app: its Src/*.pa.yaml is a
# documented stub and the authoritative control tree is Controls/4.json, which
# only the Experimental layout round-trips. Proven byte-identical by an
# unpack -> pack -> unpack cycle before any edit was made.
"$ROOT/tools/pac" canvas pack \
  --sources "$WORK/canvas" \
  --msapp "$MSAPP" \
  --layout Experimental \
  --overwrite

echo "==> Stamping solution version $VERSION"
# Byte-preserving. ElementTree would rewrite the whole document, dropping the
# byte-order mark the Dataverse export carries and reordering attributes, so
# only the version text itself is replaced.
python3 "$ROOT/tools/stamp_version.py" "$WORK/solution/solution.xml" "$VERSION"

echo "==> Building solution ZIP"
mkdir -p "$(dirname "$DEST_ZIP")"
rm -f "$DEST_ZIP"
# Entry names are listed explicitly so they match the incoming package rather
# than whatever `zip -r .` happens to emit.
( cd "$WORK/solution" \
  && zip -q -X "$DEST_ZIP" customizations.xml solution.xml "[Content_Types].xml" \
  && zip -q -X -r "$DEST_ZIP" CanvasApps )

echo "==> Verifying output"
unzip -tq "$DEST_ZIP"
VERIFY="$(mktemp -d)"
trap 'rm -rf "$VERIFY"' EXIT
unzip -q "$DEST_ZIP" -d "$VERIFY"
VMSAPP="$(find "$VERIFY" -name '*.msapp' -print -quit)"
unzip -tq "$VMSAPP"
"$ROOT/tools/pac" canvas unpack --msapp "$VMSAPP" --sources "$VERIFY/canvas" \
  --layout Experimental >/dev/null

echo "==> Output: $DEST_ZIP"
sha256sum "$DEST_ZIP"
ls -l "$DEST_ZIP"
echo
echo "STUDIO VERIFICATION REQUIRED: structural checks only. Import into Power"
echo "Apps Studio and exercise the workflows before treating this as runnable."
