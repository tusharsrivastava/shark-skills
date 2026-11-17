---
runs: 1
tags: ["slow", "debugger"]
max_turns: 40
timeout_seconds: 1200
allowed_tools: ["Agent", "Read", "Glob", "Grep", "Edit", "Write", "Bash", "Skill", "ToolSearch", "mcp__plugin_shark_mcp-debugger"]
---

Use the shark:code-debugger agent to find the root cause of the test_discount failure. It must use the debugger with a breakpoint. Use python3 from PATH.
