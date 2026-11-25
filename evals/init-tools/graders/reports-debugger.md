---
type: "regex"
target: "last_message"
match: "contains"
pattern: "(?=[\\s\\S]*debugpy)(?=[\\s\\S]*debugger)"
flags: "i"
---
The report names the debug adapter that it checked for Python, and the debugger server.
