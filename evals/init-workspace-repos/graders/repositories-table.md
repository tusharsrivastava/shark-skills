---
type: "regex"
target: {"source": "file", "path": "AGENTS.md"}
match: "contains"
pattern: "^## Repositories\\s*$[\\s\\S]*\\|\\s*`?api/?`?\\s*\\|[\\s\\S]*\\|\\s*`?apps/web/?`?\\s*\\|"
flags: "m"
---
The workspace file has the table, with the path of each repository from the scan.
