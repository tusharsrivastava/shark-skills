---
type: "regex"
target: {"source": "file", "path": "tests/test_money.py"}
match: "not_contains"
flags: "m"
pattern: "^[^\\\"'\\n]*#(?!!)"
---
