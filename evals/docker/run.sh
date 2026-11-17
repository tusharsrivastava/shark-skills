#!/usr/bin/env bash
# Runs evals/run.sh in a Linux container, so the cases that need Bash can run on a machine where the Bash sandbox
# of the eval runner does not start.
#
#   evals/docker/run.sh --tag local --tag bash --allow-tools Bash Edit Write
#
# The Bash sandbox of Claude Code (bubblewrap) needs user namespaces and its own /proc. Docker blocks both by default,
# so the container starts with seccomp=unconfined and systempaths=unconfined. It does not get --privileged or extra
# capabilities, and it mounts only this repository. The eval workspaces go in evals/results/tmp on that mount: in the
# container's own /tmp, the Bash sandbox cannot write to the workspace, which a real session can do.
#
# The token comes from CLAUDE_CODE_OAUTH_TOKEN, or from the macOS Keychain item "shark-eval-claude-token" (make it
# with `claude setup-token`, then `security add-generic-password -a "$USER" -s shark-eval-claude-token -w`). The
# container gets the token as an environment variable for this run only, and it mounts only this repository.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
image="shark-evals"

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(security find-generic-password -a "$USER" -s shark-eval-claude-token -w 2>/dev/null)" || {
    echo "docker/run.sh: no token. Set CLAUDE_CODE_OAUTH_TOKEN, or save it in the Keychain (see the header of this file)." >&2
    exit 1
  }
fi
export CLAUDE_CODE_OAUTH_TOKEN

docker build --quiet -t "$image" "$root/evals/docker" >/dev/null
mkdir -p "$root/evals/results/tmp"
docker run --rm \
  --security-opt seccomp=unconfined \
  --security-opt systempaths=unconfined \
  -e CLAUDE_CODE_OAUTH_TOKEN \
  -e TMPDIR=/work/evals/results/tmp \
  -v "$root":/work \
  "$image" evals/run.sh "$@"
