---
type: "regex"
target: {"source": "file", "path": ".git/shark-health/events.log"}
match: "contains"
pattern: "\"kind\":\"not-verified\"[^\\n]*opengrep-not-installed"
---

The hook failed open: it named the missing analyzer, one time, and did not block.
