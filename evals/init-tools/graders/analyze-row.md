---
type: "regex"
target: {"source": "file", "path": "AGENTS.md"}
match: "contains"
pattern: "^\\| `analyze:file` \\|[^\\n]*opengrep[^\\n]*lizard"
flags: "m"
---
