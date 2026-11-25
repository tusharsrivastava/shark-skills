# Writing code-health rules

Rules are Opengrep (Semgrep-syntax) YAML files in `.shark/rules/`. The starter rules of this skill (`rules/`) cover
SQL built from strings, shell commands built from strings, eval of non-constant text, unsafe deserialization, weak
password hashes, TLS checks turned off and HTML written from values, for Python and JavaScript/TypeScript.

## License rule

Never copy a rule from the Semgrep registry or from a repository that holds registry rules. Since December 2024 the
Semgrep-maintained rules use the Semgrep Rules License v1.0: internal use only, no distribution. Write each rule
yourself, or take it from a source whose license allows redistribution, and record that source in a comment.

## Rule shape

```yaml
rules:
  - id: sec-sql-string-concat        # sec- (security) or arch- (architecture); shown as sec/sql-string-concat
    languages: [python]
    severity: ERROR                  # ERROR blocks at merge; WARNING warns
    message: >-
      What is wrong, in one sentence. Fix: the safe form, in one sentence.
    metadata:
      invariant: injection           # the AGENTS.md › Invariants entry that this rule protects, if any
    pattern-either:
      - pattern: $DB.execute($A + $B, ...)
```

- End the message with `Fix: ...`. The digest shows it as the fix hint.
- One rule, one defect class. Prefer a narrow pattern with no false positives to a wide one: agents act on each
  finding, and a false positive costs a fix or an allow entry.
- Add `pattern-not` for the safe forms (a constant string, a bound parameter).

## Test each rule

Keep a small file with bad lines and good lines next to the rule, and run the rule on it in a container:

```bash
opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output=out.sarif samples/
```

Each bad line must give one finding, and no good line may give one.
