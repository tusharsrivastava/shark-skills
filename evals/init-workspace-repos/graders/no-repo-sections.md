---
type: "regex"
target: {"source": "file", "path": "AGENTS.md"}
match: "not_contains"
pattern: "^## (Commands|Architecture rules|Test scope)\\s*$"
flags: "m"
---
Commands, architecture rules and test scope belong to each repository, not to the workspace file.
