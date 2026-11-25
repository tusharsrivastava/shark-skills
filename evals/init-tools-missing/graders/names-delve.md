---
type: "regex"
target: "last_message"
match: "contains"
pattern: "go install github\\.com/go-delve/delve/cmd/dlv@v?\\d"
flags: "i"
---
The report gives the pinned install command for the missing Go debug adapter.
