#!/usr/bin/env bash
# A workspace folder (no git) that holds two repositories: api (with its own AGENTS.md) and apps/web.
set -euo pipefail
mk() {
  mkdir -p "$1"
  ( cd "$1"
    git init -q -b main
    git remote add origin "$2"
    shift 2
    for f in "$@"; do mkdir -p "$(dirname "$f")"; printf 'x\n' > "$f"; done
    git add -A
    git -c user.name=eval -c user.email=eval@example.com commit -qm init )
}
mk api git@example.com:acme/api.git package.json src/server.ts
printf '# AGENTS.md: api\n\n## Secrets\n\n- Never read or write: `.env`, `config/prod.yaml`.\n' > api/AGENTS.md
( cd api && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm "project file" )
mk apps/web git@example.com:acme/web.git package.json src/main.tsx
