#!/bin/sh
# Installs the Opengrep release binary that shark tested, and checks its SHA-256 before it is made executable.
#
#   sh install-opengrep.sh [<directory>]     (default: ~/.local/bin)
#
# Never install Opengrep from PyPI: a malicious package uses the name. The sums are the GitHub release digests of
# v1.33.1; the two Linux binaries were also checked with cosign on 2026-11-21. Versions before 1.30.2 have the
# security advisories of 2026-11-10.
set -eu

version=v1.33.1
dest="${1:-$HOME/.local/bin}"

os="$(uname -s)"
arch="$(uname -m)"
libc=manylinux
if [ "$os" = Linux ] && ldd --version 2>&1 | grep -qi musl; then libc=musllinux; fi
case "$os/$arch" in
  Linux/x86_64)          asset="opengrep_${libc}_x86" ;;
  Linux/aarch64|Linux/arm64) asset="opengrep_${libc}_aarch64" ;;
  Darwin/arm64)          asset=opengrep_osx_arm64 ;;
  Darwin/x86_64)         asset=opengrep_osx_x86 ;;
  *) echo "install-opengrep: no release binary for $os/$arch" >&2; exit 1 ;;
esac
case "$asset" in
  opengrep_manylinux_x86)      sum=46e8133cc490f9f50518061590ce2f6be5a08afaeda034471c0ceda4b3899808 ;;
  opengrep_manylinux_aarch64)  sum=d1433f63a90b8bc0b6ad4b498a13b372b856ce9a754a43484ba4920fe2d76dcf ;;
  opengrep_musllinux_x86)      sum=aa03c3bfff105dc122cbbe6e239dc39a5cae486f1837bba3af7a16bca173f8d6 ;;
  opengrep_musllinux_aarch64)  sum=17c6917b53d8f8af794d8effb13c1a068018c602435d33fefc105aaa23d96f4b ;;
  opengrep_osx_arm64)          sum=a17c1881bb40e3214266a7a291cf4f2ae3bc56c1715628b5712d2ec816bc3e2d ;;
  opengrep_osx_x86)            sum=c3bd18e0d898d44e28419d95dad57c8928bb46ab32889a0ee1f72a87ad9627af ;;
esac

if command -v sha256sum >/dev/null 2>&1; then hash() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then hash() { shasum -a 256 "$1" | cut -d' ' -f1; }
else echo "install-opengrep: no sha256sum or shasum" >&2; exit 1; fi

mkdir -p "$dest"
tmp="$(mktemp "$dest/.opengrep.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
curl -fsSL -o "$tmp" "https://github.com/opengrep/opengrep/releases/download/$version/$asset"
got="$(hash "$tmp")"
if [ "$got" != "$sum" ]; then
  echo "install-opengrep: SHA-256 mismatch for $asset: got $got, expected $sum. Nothing installed." >&2
  exit 1
fi
chmod 755 "$tmp"
mv "$tmp" "$dest/opengrep"
trap - EXIT
echo "install-opengrep: installed $version ($asset) at $dest/opengrep"
case ":$PATH:" in *":$dest:"*) ;; *) echo "install-opengrep: add $dest to PATH" ;; esac
