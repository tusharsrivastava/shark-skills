---
type: "regex"
target: {"source": "file", "path": "src/billing/db.py"}
match: "contains"
pattern: "def find_customer\\([^)]*\\):[\\s\\S]*?execute\\(\\s*[\"'][^\"'\\n]*\\?[^\"'\\n]*[\"']\\s*,"
---

`find_customer` passes the id as a bound parameter (`?`).
