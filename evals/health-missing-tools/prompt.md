---
runs: 1
tags: ["bash", "code-health"]
max_turns: 25
timeout_seconds: 900
allowed_tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"]
---

Add a function `invoice_count(conn)` to `src/billing/db.py` that returns the number of rows in the `invoices`
table. Do not commit. Then report what you changed and which checks ran.
