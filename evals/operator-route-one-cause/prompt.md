---
runs: 1
tags: ["bash", "routing"]
max_turns: 12
timeout_seconds: 600
allowed_tools: ["Skill", "Read", "Glob", "Grep", "Bash"]
---

Use the shark:operator skill. Choose the path for this bug report and say it. Do not change files.

Bug report: two problems with a 15 % discount on an invoice with lines 0.1 x 3 and 0.2 x 1.
1. `Invoice.total()` returns 0.42. It must return 0.43 (round half up).
2. `charge()` in `src/billing/payments.py` charges 0.42 for this invoice instead of 0.43.

Cause: `charge()` takes its amount from `Invoice.as_text()`, which formats `total()`, so both come from the
rounding in `total()`.
