---
type: "regex"
target: {"source": "file", "path": ".gitignore"}
match: "contains"
pattern: "(?=[\\s\\S]*^/?api/?\\s*$)(?=[\\s\\S]*^/?apps/web/?\\s*$)"
flags: "m"
---
The workspace repository does not track the repositories inside it.
