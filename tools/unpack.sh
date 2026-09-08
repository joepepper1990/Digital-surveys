#!/usr/bin/env bash
# Unpack a Power Platform solution ZIP into reviewable sources.
#
#   tools/unpack.sh source-original/<solution>.zip [dest]
#
# Produces, under dest (default source-working/):
#   solution/           the solution ZIP contents (solution.xml, customizations.xml, ...)
#   canvas/             pac canvas unpack --layout SourceCode output for the .msapp
#   manifest.json       record of what was unpacked, with hashes
#
# The input ZIP is never modified. Directive ref: §64 (preserve the original
# package unchanged), §76 (supported unpack approach only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_ZIP="${1:?usage: unpack.sh <solution.zip> [dest]}"
DEST="${2:-$ROOT/source-working}"

[[ -f "$SRC_ZIP" ]] || { echo "No such file: $SRC_ZIP" >&2; exit 1; }

SRC_ZIP="$(cd "$(dirname "$SRC_ZIP")" && pwd)/$(basename "$SRC_ZIP")"

echo "==> Verifying outer ZIP integrity"
unzip -tq "$SRC_ZIP"

rm -rf "$DEST/solution" "$DEST/canvas"
mkdir -p "$DEST/solution"

echo "==> Extracting solution"
unzip -q "$SRC_ZIP" -d "$DEST/solution"

MSAPP="$(find "$DEST/solution" -name '*.msapp' -print -quit)"
[[ -n "$MSAPP" ]] || { echo "No .msapp found inside solution" >&2; exit 1; }

echo "==> Verifying embedded .msapp integrity"
unzip -tq "$MSAPP"

echo "==> Unpacking canvas app sources"
"$ROOT/tools/pac" canvas unpack \
  --msapp "$MSAPP" \
  --sources "$DEST/canvas" \
  --layout SourceCode \
  --overwrite

python3 - "$SRC_ZIP" "$MSAPP" "$DEST" <<'PY'
import hashlib, json, os, sys

src_zip, msapp, dest = sys.argv[1:4]

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

manifest = {
    "solutionZip": {
        "name": os.path.basename(src_zip),
        "sha256": sha256(src_zip),
        "bytes": os.path.getsize(src_zip),
    },
    "msapp": {
        "name": os.path.basename(msapp),
        "sha256": sha256(msapp),
        "bytes": os.path.getsize(msapp),
    },
}
with open(os.path.join(dest, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)
    fh.write("\n")
print(json.dumps(manifest, indent=2))
PY

echo "==> Unpacked to $DEST"
