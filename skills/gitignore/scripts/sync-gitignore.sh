#!/usr/bin/env bash
# Sync the generated part of .gitignore from gitignore.io. The project part stays as it is.
#
#   sync-gitignore.sh "python,macos" [path-to-.gitignore]
#
# The file has two blocks:
#
#   generated block     the script replaces it on every run
#   project block       the script never changes it, and it is always LAST
#
# The order is a correctness rule. git uses the last rule that matches. The templates contain their own `.env`
# rules: if the generated block came after the project block, it could ignore `.env.example` again.
set -euo pipefail

usage() { echo 'usage: sync-gitignore.sh <templates, comma-separated, e.g. "python,node,macos"> [path-to-.gitignore]'; }
case "${1:-}" in
  -h | --help) usage; exit 0 ;;
  "" | -*) usage >&2; exit 2 ;;
esac

TEMPLATES="$1"
TARGET="${2:-.gitignore}"

BEGIN='# >>> gitignore.io generated — do not edit by hand >>>'
END='# <<< gitignore.io generated <<<'
CUSTOM='# === project-specific — never regenerated, must stay last ==='

fetched="$(mktemp)"
merged="$(mktemp)"
trap 'rm -f "$fetched" "$merged"' EXIT

if ! curl -fsS --max-time 30 "https://www.toptal.com/developers/gitignore/api/${TEMPLATES}" -o "$fetched"; then
  echo "sync-gitignore: the fetch failed. ${TARGET} is not changed." >&2
  exit 1
fi

# A truncated or error response must never replace a working ignore file.
if [ ! -s "$fetched" ] || ! head -1 "$fetched" | grep -q '^# Created by'; then
  echo "sync-gitignore: the response is not a gitignore.io file. ${TARGET} is not changed." >&2
  exit 1
fi

if [ ! -f "$TARGET" ]; then
  { echo "$BEGIN"; cat "$fetched"; echo "$END"; echo; echo "$CUSTOM"; } >"$TARGET"
  echo "sync-gitignore: created ${TARGET} (${TEMPLATES})"
  exit 0
fi

if ! grep -qF "$BEGIN" "$TARGET" || ! grep -qF "$END" "$TARGET"; then
  echo "sync-gitignore: ${TARGET} has no generated block. Put these markers around it first:" >&2
  echo "    $BEGIN" >&2
  echo "    $END" >&2
  exit 1
fi

# Replace the lines between the markers (markers included). awk: no language runtime is needed.
awk -v begin="$BEGIN" -v end="$END" -v src="$fetched" '
  $0 == begin { print begin; while ((getline line < src) > 0) print line; skip = 1; next }
  $0 == end { print end; skip = 0; next }
  !skip { print }
' "$TARGET" >"$merged"

if ! grep -qF "$CUSTOM" "$merged"; then
  echo "sync-gitignore: the project block marker is missing. ${TARGET} is not changed." >&2
  exit 1
fi
cat "$merged" >"$TARGET"
echo "sync-gitignore: refreshed the generated block in ${TARGET} (${TEMPLATES})"
