---
runs: 1
tags: ["bash", "init"]
max_turns: 60
timeout_seconds: 1200
allowed_tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash", "Skill", "ToolSearch"]
---

/shark:init

I approve every suggested value in advance, and I have no other orchestrator. Do not install anything in this run: tell me what to install. Do not wait for my answer: show the summary, then write the files in this same turn. Don't commit.
