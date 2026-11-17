---
type: "regex"
target: {"source": "file", "path": ".claude/settings.json"}
match: "contains"
pattern: "\"Bash\\(ls:\\*\\)\"[\\s\\S]*\"Bash\\(git status:\\*\\)\""
---
