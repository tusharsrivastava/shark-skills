#!/usr/bin/env bash
# Check that each commit in <base>..HEAD passes the gate, so that git bisect stays trustworthy.
#
#   verify-bisectable.sh <base-ref> <gate command...>
#   verify-bisectable.sh --root <gate command...>      (every commit, including the root commit)
#
# The gate is the command that follows the ref, run once per commit, from the root of a clean checkout. It is
# the project's `gate:scoped` or `gate:full` command (AGENTS.md, section Commands). If you give no command, the
# script uses the environment variable VERIFY_GATE (a shell string). With neither, it stops: no default gate
# exists for every language.
#
# Optional environment variables:
#   VERIFY_SETUP   shell command that runs in the checkout before the gate of each commit (install the locked
#                  dependencies: `npm ci`, `uv sync --frozen`, `go mod download`). Default: none. A commit
#                  whose setup fails is reported as SETUP FAILED: it does not build on a clean checkout, which
#                  bisect cannot see from your own tree.
#   VERIFY_KEEP    space-separated paths that survive the clean step between commits (for example
#                  ".venv node_modules"), so that each setup after the first is incremental. Default: none.
#
# It runs in a temporary git worktree, so your branch, your working tree and your commit hashes do not change.
# `git rebase --exec` does a similar job, but it rewrites every hash in the range even when everything passes.
#
# Exit codes: 0 all commits pass; 1 at least one commit fails; 2 usage error.
set -euo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: verify-bisectable.sh <base-ref|--root> [gate command...]" >&2
  exit 2
fi
shift
GATE=("$@")
if [ ${#GATE[@]} -eq 0 ]; then
  if [ -z "${VERIFY_GATE:-}" ]; then
    echo "verify-bisectable: no gate. Give a command after the ref, or set VERIFY_GATE." >&2
    exit 2
  fi
  GATE=(sh -c "$VERIFY_GATE")
fi
SETUP="${VERIFY_SETUP:-}"
KEEP="${VERIFY_KEEP:-}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ "$BASE" != "--root" ] && ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "verify-bisectable: no such ref: $BASE" >&2
  exit 2
fi

RANGE="${BASE}..HEAD"
[ "$BASE" = "--root" ] && RANGE="the root commit..HEAD"

COMMITS=()
while IFS= read -r sha; do
  COMMITS+=("$sha")
done < <(if [ "$BASE" = "--root" ]; then git rev-list --reverse HEAD; else git rev-list --reverse "${BASE}..HEAD"; fi)

if [ ${#COMMITS[@]} -eq 0 ]; then
  echo "verify-bisectable: no commits in ${RANGE}"
  exit 0
fi

SCRATCH="$(mktemp -d)"
WORKTREE="$SCRATCH/wt"
LOG="$SCRATCH/verify.log"
cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree prune >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT INT TERM

echo "verify-bisectable: ${#COMMITS[@]} commit(s) in ${RANGE}"
git worktree add --detach --quiet "$WORKTREE" HEAD
echo

# Build the `git clean` exclusions from VERIFY_KEEP.
CLEAN_ARGS=(-fdq)
for keep in $KEEP; do CLEAN_ARGS+=(-e "$keep"); done

started=$(date +%s)
failed=0

for sha in "${COMMITS[@]}"; do
  short="$(git rev-parse --short "$sha")"
  subject="$(git log -1 --format=%s "$sha")"
  printf '  %s  %-56s ' "$short" "${subject:0:56}"

  if ! git -C "$WORKTREE" checkout --detach --force --quiet "$sha" 2>/dev/null; then
    echo "CHECKOUT FAILED"
    failed=$((failed + 1))
    continue
  fi
  # Untracked files from an earlier commit (for example a module that a later commit removed) must not leak.
  git -C "$WORKTREE" clean "${CLEAN_ARGS[@]}"

  if [ -n "$SETUP" ]; then
    if ! (cd "$WORKTREE" && sh -c "$SETUP") >"$LOG" 2>&1; then
      echo "SETUP FAILED"
      echo "      the setup command fails at this commit: it does not build on a clean checkout."
      sed 's/^/      /' "$LOG" | tail -8
      failed=$((failed + 1))
      continue
    fi
  fi

  if (cd "$WORKTREE" && "${GATE[@]}") >"$LOG" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    failed=$((failed + 1))
    sed 's/^/      /' "$LOG" | tail -12
  fi
done

elapsed=$(($(date +%s) - started))
echo
if [ "$failed" -eq 0 ]; then
  echo "verify-bisectable: all ${#COMMITS[@]} commit(s) pass the gate in ${elapsed}s. The range is bisectable."
  exit 0
fi
echo "verify-bisectable: $failed of ${#COMMITS[@]} commit(s) fail the gate (${elapsed}s)."
echo "  git bisect reports a failing commit in the middle as the cause of bugs that came later."
echo "  Fix the split, or squash the broken commit into the commit that completes it."
exit 1
