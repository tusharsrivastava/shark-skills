---
type: "regex"
target: {"source": "file", "path": ".git/shark-health/events.log"}
match: "contains"
pattern: "\"kind\":\"not-verified\"[^\\n]*opengrep-not-installed"
---

The review failed open: it named the missing analyzer one time, then let the agent stop.
