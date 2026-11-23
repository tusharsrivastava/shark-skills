---
type: "regex"
target: "last_message"
match: "contains"
pattern: "\\b(go|delve|dlv)\\b[^\\n]{0,160}(not (verified|installed|available|found)|missing)|(not (verified|installed|available|found)|missing)[^\\n]{0,160}\\b(go|delve|dlv)\\b"
flags: "i"
---
