---
type: "regex"
target: "last_message"
match: "contains"
pattern: "\\.claude/settings\\.json[\\s\\S]{0,600}shark:asd-ste100|shark:asd-ste100[\\s\\S]{0,600}\\.claude/settings\\.json"
---
The output-style step of init. In the eval sandbox `.claude/settings.json` cannot be written (a person must approve
the write, and a file that does not exist is masked), so this checks that init attempted the change or told the user
the exact change to make.
