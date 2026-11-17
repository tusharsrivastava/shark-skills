---
type: "regex"
target: {"source": "file", "path": "src/billing/money.py"}
match: "not_contains"
pattern: "\\((?:ties?|away|round|half|e\\.g\\.|i\\.e\\.|for example|note)[^)]*\\)"
flags: "i"
---
