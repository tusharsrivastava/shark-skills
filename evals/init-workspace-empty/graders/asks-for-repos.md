---
type: "regex"
target: "last_message"
match: "contains"
pattern: "(path|folder)[\\s\\S]{0,400}(url|clone)|(url|clone)[\\s\\S]{0,400}(path|folder)"
flags: "i"
---
In an empty workspace, init must ask for the folder paths or the URLs of the repositories.
