#!/usr/bin/env bash
# Runs the shark eval suite.
#
#   evals/run.sh [claude plugin eval options...]
#   evals/run.sh --tag local --runs 1          # the cases that need no Bash
#   evals/run.sh --tag bash --allow-tools Bash Edit Write
#
# The eval runner ignores the project and user settings, so a case cannot select the output style. This script
# copies the plugin to a temporary folder, sets `force-for-plugin: true` in the copy of `shark:asd-ste100`, and runs
# `claude plugin eval` on the copy. The plugin in the repository does not change. Results go to evals/results/.
# It records the fingerprint of the files (evals/attest.mjs) when the run starts.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

rsync -a --exclude .git --exclude .claude --exclude .config --exclude evals/results "$root/" "$work/plugin/"
style="$work/plugin/output-styles/asd-ste100.md"
grep -q '^keep-coding-instructions: true$' "$style" || { echo "run.sh: the style frontmatter changed; update run.sh" >&2; exit 1; }
sed -i.bak 's/^keep-coding-instructions: true$/keep-coding-instructions: true\nforce-for-plugin: true/' "$style"
rm -f "$style.bak"
grep -q '^force-for-plugin: true$' "$style" || { echo "run.sh: could not set force-for-plugin" >&2; exit 1; }

out="$root/evals/results/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$out"
node "$root/evals/attest.mjs" fingerprint > "$out/fingerprint.txt"
set +e
claude plugin eval "$work/plugin" --trust-plugin --no-publish --scaffold --ablation none \
  --output-dir "$out" --report "$out/report.html" --json "$out/result.json" "$@"
status=$?
set -e
echo "run.sh: results in $out (exit $status)"
echo "run.sh: to record this run, run: node evals/attest.mjs write $out/result.json"
exit "$status"
