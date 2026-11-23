---
type: "regex"
target: {"source": "file", "path": ".shark/health-baseline.json"}
match: "contains"
pattern: "\"version\":\\s*1[\\s\\S]*\"files\""
---
