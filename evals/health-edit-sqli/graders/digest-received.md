---
type: "regex"
target: {"source": "file", "path": ".git/shark-health/events.log"}
match: "contains"
pattern: "\"kind\":\"digest\"[^\\n]*src/billing/db\\.py[^\\n]*sec/sql-string-concat"
---

The edit hook reported the new SQL concatenation in `src/billing/db.py` (the hook's event log, inside `.git`).
