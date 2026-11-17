---
runs: 3
tags: ["local", "comments", "style"]
max_turns: 30
timeout_seconds: 900
allowed_tools: ["Agent", "Read", "Glob", "Grep", "Write", "Edit", "Skill"]
---

Use the shark:code-writer agent for this. Add a public function convert_to_cents(amount: str, currency: str) -> int in src/billing/money.py that turns a decimal string like '12.345' into integer minor units, rounding half up, with JPY having 0 decimals, KWD 3, and all others 2. Raise ValueError for an unknown or malformed amount. Add tests in tests/test_money.py. Do not run anything; only write the files. Don't commit.
