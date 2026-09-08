#!/usr/bin/env bash
# Acquire the pinned Power Platform CLI toolchain used to unpack/pack the
# canvas app. Everything lands under tools/.toolchain/ which is git-ignored.
#
# Verified working on linux-x64 in the ESG development container:
#   pac 2.11.2+g47bc199 (.NET 10.0.0)
#
# Directive ref: §76 (use supported unpack/pack approaches; no binary patching).
set -euo pipefail

PAC_VERSION="2.11.2"
DOTNET_VERSION="10.0.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TC="$ROOT/tools/.toolchain"
DOTNET_DIR="$TC/dotnet"
PAC_DIR="$TC/pac"

mkdir -p "$TC"

fetch() {
  # fetch <url> <dest>
  curl --fail --silent --show-error --location --retry 4 --retry-delay 2 \
       --output "$2" "$1"
}

if [[ ! -x "$DOTNET_DIR/dotnet" ]]; then
  echo "==> Installing .NET ${DOTNET_VERSION} runtimes"
  mkdir -p "$DOTNET_DIR"
  fetch "https://builds.dotnet.microsoft.com/dotnet/Runtime/${DOTNET_VERSION}/dotnet-runtime-${DOTNET_VERSION}-linux-x64.tar.gz" \
        "$TC/dotnet-runtime.tar.gz"
  fetch "https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/${DOTNET_VERSION}/aspnetcore-runtime-${DOTNET_VERSION}-linux-x64.tar.gz" \
        "$TC/aspnetcore-runtime.tar.gz"
  tar -xzf "$TC/dotnet-runtime.tar.gz"     -C "$DOTNET_DIR"
  tar -xzf "$TC/aspnetcore-runtime.tar.gz" -C "$DOTNET_DIR"
  rm -f "$TC/dotnet-runtime.tar.gz" "$TC/aspnetcore-runtime.tar.gz"
fi

if [[ ! -f "$PAC_DIR/tools/pac.dll" ]]; then
  echo "==> Installing Power Platform CLI ${PAC_VERSION}"
  mkdir -p "$PAC_DIR"
  fetch "https://api.nuget.org/v3-flatcontainer/microsoft.powerapps.cli.core.linux-x64/${PAC_VERSION}/microsoft.powerapps.cli.core.linux-x64.${PAC_VERSION}.nupkg" \
        "$TC/pac.nupkg"
  ( cd "$PAC_DIR" && unzip -q -o "$TC/pac.nupkg" )
  rm -f "$TC/pac.nupkg"
fi

echo "==> Toolchain ready"
"$ROOT/tools/pac" --version 2>/dev/null || true
