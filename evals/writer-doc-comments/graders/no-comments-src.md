---
type: "regex"
target: {"source": "file", "path": "src/billing/money.py"}
match: "not_contains"
flags: "m"
pattern: "^[^\\\"'\\n]*#(?!!)"
---
