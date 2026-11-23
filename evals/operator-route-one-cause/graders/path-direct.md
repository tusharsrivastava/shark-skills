---
type: "regex"
target: "trace"
match: "contains"
pattern: "Path:\\**\\s*\\**\\s*direct(?!` or `Path: debug)"
---

`charge()` takes its amount from `Invoice.as_text()`, so one cause (the rounding in `total()`) explains both
symptoms: the operator counts causes, not phrasings, and takes the direct path.
