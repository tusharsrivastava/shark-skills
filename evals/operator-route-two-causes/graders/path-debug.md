---
type: "regex"
target: "trace"
match: "contains"
pattern: "(?<!`Path: direct` or `)Path:\\**\\s*\\**\\s*debug"
---

The rounding in `total()` and the idempotency cache in `charge()` are two causes in two modules: no one confirmed
cause explains both symptoms, so the operator takes debug mode.
