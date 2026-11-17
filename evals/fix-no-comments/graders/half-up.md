---
type: "regex"
target: {"source": "file", "path": "src/billing/invoice.py"}
match: "contains"
pattern: "ROUND_HALF_UP|\\+ ?50\\) ?// ?100"
---
