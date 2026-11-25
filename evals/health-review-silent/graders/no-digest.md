---
type: "regex"
target: {"source": "file", "path": ".git/shark-health/events.log"}
match: "not_contains"
pattern: "\"kind\":\"(digest|not-verified)\""
---

A clean change to a file whose only finding is old debt gives no code-health text at all.
