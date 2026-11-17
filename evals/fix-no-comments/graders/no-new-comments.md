---
type: "regex"
target: {"source": "file", "path": "src/billing/invoice.py"}
match: "not_contains"
flags: "m"
pattern: "^(?!.*# in dollars)[^\\\"'\\n]*#"
---
