---
type: "regex"
target: {"source": "file", "path": ".git/shark-health/events.log"}
match: "contains"
pattern: "\"kind\":\"clean\""
---

The hook checked the edit (so the silence is a clean result, not a hook that did not run).
