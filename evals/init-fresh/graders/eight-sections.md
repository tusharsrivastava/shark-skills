---
type: "regex"
target: {"source": "file", "path": "AGENTS.md"}
match: "contains"
pattern: "(?=[\\s\\S]*^## Commands\\s*$)(?=[\\s\\S]*^## Invariants\\s*$)(?=[\\s\\S]*^## Architecture rules\\s*$)(?=[\\s\\S]*^## Test scope\\s*$)(?=[\\s\\S]*^## Secrets\\s*$)(?=[\\s\\S]*^## Docs layout\\s*$)(?=[\\s\\S]*^## Owner rules\\s*$)(?=[\\s\\S]*^## Session harness\\s*$)"
flags: "m"
---
