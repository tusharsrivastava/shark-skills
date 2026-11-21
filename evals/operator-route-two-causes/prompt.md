---
runs: 1
tags: ["bash", "routing"]
max_turns: 12
timeout_seconds: 600
allowed_tools: ["Skill", "Read", "Glob", "Grep", "Bash"]
---

Use the shark:operator skill. Choose the path for this bug report and say it. Do not change files.

Bug report: two problems in billing.
1. `Invoice.total()` returns 0.42 for a 15 % discount on lines 0.1 x 3 and 0.2 x 1. It must return 0.43 (round half
   up).
2. `charge()` in `src/billing/payments.py`: a second call with the same idempotency key but a different card returns
   the first result, with the first card, and charges nothing. It must refuse a reused key with a different card.
