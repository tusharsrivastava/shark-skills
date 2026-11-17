#!/usr/bin/env bash
# Print or check the shark "Working rules" block of a project file.
#
#   working-rules.sh print [template]            print the block, with its markers
#   working-rules.sh check <target> [template]   exit 0: same as the template
#                                                exit 1: the block differs (the project changed a rule)
#                                                exit 3: the target has no block
#   working-rules.sh diff <target> [template]    show the difference (unified diff)
#   working-rules.sh apply <target> [template]   add the block at the end of the target if it has none
#                                                exit 0: the target has the block now (added, or already the same)
#                                                exit 1: the block differs; nothing changed (show diff, ask the user)
#                                                exit 4: the target has a '## Working rules' section with no
#                                                        markers; nothing changed (ask the user how to merge)
#                                                exit 2: the script cannot read or write a file
#
# The template is the AGENTS.md at the kit root. The block in a project file sits between two markers, so a
# second run of /shark:init can find it and compare it. Only the lines between the markers belong to the kit.
set -euo pipefail

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "working-rules: $*" >&2; exit 2; }

here="$(cd "$(dirname "$0")" && pwd)"
default_template="${CLAUDE_PLUGIN_ROOT:-$here/../../..}/AGENTS.md"

BEGIN='<!-- shark:working-rules:begin (managed by /shark:init; make a rule stricter here, never weaker) -->'
END='<!-- shark:working-rules:end -->'

block() {
  local tmpl="$1"
  [ -f "$tmpl" ] || die "template not found: $tmpl"
  grep -q '^## Working rules$' "$tmpl" || die "template has no '## Working rules' section: $tmpl"
  echo "$BEGIN"
  awk '/^## Working rules$/ { on = 1 } on' "$tmpl"
  echo "$END"
}

current() {
  local target="$1"
  [ -f "$target" ] || die "target not found: $target"
  awk -v b="<!-- shark:working-rules:begin" -v e="$END" '
    index($0, b) == 1 { on = 1 }
    on { print }
    on && $0 == e { exit }
  ' "$target"
}

mode="${1:-}"
case "$mode" in
  -h | --help) usage; exit 0 ;;
  print)
    block "${2:-$default_template}"
    ;;
  check | diff)
    [ -n "${2:-}" ] || { usage >&2; exit 2; }
    target="$2"
    tmpl="${3:-$default_template}"
    have="$(current "$target")"
    [ -n "$have" ] || { echo "working-rules: no block in $target"; exit 3; }
    want="$(block "$tmpl")"
    if [ "$have" = "$want" ]; then
      echo "working-rules: $target matches the template"
      exit 0
    fi
    if [ "$mode" = diff ]; then
      diff -u <(printf '%s\n' "$want") <(printf '%s\n' "$have") \
        | sed '1s|.*|--- template|; 2s|.*|+++ '"$target"'|' || true
    else
      echo "working-rules: $target differs from the template"
    fi
    exit 1
    ;;
  apply)
    [ -n "${2:-}" ] || { usage >&2; exit 2; }
    target="$2"
    tmpl="${3:-$default_template}"
    [ -f "$target" ] || die "target not found: $target"
    want="$(block "$tmpl")"
    have="$(current "$target")"
    if [ -n "$have" ]; then
      if [ "$have" = "$want" ]; then
        echo "working-rules: $target has the block already"
        exit 0
      fi
      echo "working-rules: $target has a different block; nothing changed. Run diff and ask the user."
      exit 1
    fi
    if grep -q '^## Working rules$' "$target"; then
      echo "working-rules: $target has a '## Working rules' section with no markers; nothing changed. Ask the user how to merge."
      exit 4
    fi
    if [ -n "$(tail -c 1 "$target")" ]; then
      echo >> "$target" || die "cannot write to $target"
    fi
    { echo; printf '%s\n' "$want"; } >> "$target" || die "cannot write to $target"
    [ "$(current "$target")" = "$want" ] || die "the block is not in $target after the write"
    echo "working-rules: added the block at the end of $target"
    ;;
  *) usage >&2; exit 2 ;;
esac
