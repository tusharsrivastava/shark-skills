#!/usr/bin/env bash
# Tests for working-rules.sh. Run: bash skills/init/scripts/working-rules.test.sh
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/working-rules.sh"
template="$here/../../../AGENTS.md"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
failures=0

expect() {
  local name="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "FAIL $name: exit $got, expected $want"; failures=$((failures + 1)); fi
}

printf '# AGENTS.md: demo\n\n## Commands\n\nrows\n' > "$dir/new.md"
expect "check: a file with no block gives 3" 3 "$script" check "$dir/new.md" "$template"
expect "apply: adds the block" 0 "$script" apply "$dir/new.md" "$template"
expect "check: the block now matches" 0 "$script" check "$dir/new.md" "$template"
grep -q '^## Commands$' "$dir/new.md" && echo "ok   apply: keeps the existing text" || { echo "FAIL apply: lost the existing text"; failures=$((failures + 1)); }
cp "$dir/new.md" "$dir/again.md"
expect "apply: a second run gives 0" 0 "$script" apply "$dir/again.md" "$template"
cmp -s "$dir/new.md" "$dir/again.md" && echo "ok   apply: a second run changes nothing" || { echo "FAIL apply: a second run changed the file"; failures=$((failures + 1)); }

printf 'no newline at the end' > "$dir/nonl.md"
expect "apply: a file with no final newline" 0 "$script" apply "$dir/nonl.md" "$template"
head -1 "$dir/nonl.md" | grep -qx 'no newline at the end' && echo "ok   apply: keeps the last line whole" || { echo "FAIL apply: joined the last line with the block"; failures=$((failures + 1)); }

cp "$dir/new.md" "$dir/stricter.md"
awk '{ print } /^### 1\. / { print ""; print "- A stricter project rule." }' "$dir/stricter.md" > "$dir/stricter.tmp" && mv "$dir/stricter.tmp" "$dir/stricter.md"
cp "$dir/stricter.md" "$dir/stricter.before"
expect "apply: a different block gives 1" 1 "$script" apply "$dir/stricter.md" "$template"
cmp -s "$dir/stricter.md" "$dir/stricter.before" && echo "ok   apply: a different block stays as it is" || { echo "FAIL apply: changed a different block"; failures=$((failures + 1)); }

printf '# demo\n\n## Working rules\n\nour own rules\n' > "$dir/unmarked.md"
cp "$dir/unmarked.md" "$dir/unmarked.before"
expect "apply: an unmarked section gives 4" 4 "$script" apply "$dir/unmarked.md" "$template"
cmp -s "$dir/unmarked.md" "$dir/unmarked.before" && echo "ok   apply: an unmarked section stays as it is" || { echo "FAIL apply: changed an unmarked section"; failures=$((failures + 1)); }

printf '# demo\n' > "$dir/mode.md"; chmod 644 "$dir/mode.md"
"$script" apply "$dir/mode.md" "$template" >/dev/null
[ "$(ls -l "$dir/mode.md" | cut -c1-10)" = "-rw-r--r--" ] && echo "ok   apply: keeps the file mode" || { echo "FAIL apply: changed the file mode"; failures=$((failures + 1)); }

printf '# demo\n' > "$dir/readonly.md"; chmod 444 "$dir/readonly.md"
expect "apply: a file that it cannot write gives 2" 2 "$script" apply "$dir/readonly.md" "$template"
chmod 644 "$dir/readonly.md"

expect "apply: a missing target gives 2" 2 "$script" apply "$dir/missing.md" "$template"

[ "$failures" -eq 0 ] && echo "working-rules tests: all passed" || { echo "working-rules tests: $failures failed"; exit 1; }
