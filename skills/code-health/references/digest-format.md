# Code-health digest format

The digest is the only code-health text that enters an agent's context. Raw SARIF never does.

## Layout

```text
code-health: <n> new in <file, or "the diff"> (budget: ccn <ccn.warn>)
<k>. <ERROR|WARN > <rule>  <L<line> or file:line>  <message, at most 120 characters>
   <fix hint, at most 120 characters>
   id: <12-character fingerprint>
...
+<n> more. Not verified: <items, or none>.
```

- New findings only, sorted by severity, then by distance from the edited lines.
- At most `digest.max_findings` findings (default 5) and 1,500 characters. Above the cap, only the count shows
  (`+N more`). The full list is in `.git/shark-health/last-health.sarif`, which is never part of a diff.
- No code snippet: the agent already has the file.
- The last line always says what was not verified, so a report stays honest.
- About 375 tokens for a full digest. A clean edit costs 0.

## Rule names and levels

| Source | Rule shown as | Level |
| --- | --- | --- |
| Opengrep `ERROR` | `sec/<id>` (the rule id with `sec-` as `sec/`) | ERROR |
| Opengrep `WARNING` | `sec/<id>` | WARN |
| Architecture rule `deny` | `arch/<id>` | ERROR |
| CCN above `ccn.block` | `cx/ccn` | ERROR |
| CCN above `ccn.warn`, NLOC above `nloc.warn`, parameters above `params.warn` | `cx/ccn`, `cx/nloc`, `cx/params` | WARN |

## What "new" means

- **Security and architecture.** The fingerprint is the rule ID, the file, a hash of the trimmed source line, the
  enclosing function, and the occurrence index of that line in that function. Line numbers are not part of it: moved
  code keeps its fingerprint. A finding is new when its fingerprint is not in the committed baseline, not in an
  allow entry, and not in the same file at the base commit.
- **Complexity.** Each function is keyed by file, name and its order among same-name functions in the file. A
  finding is new when a function is new and over a budget, or when an over-budget metric of a function grows. A
  renamed function counts as new.
- **Base commit.** The edit hook uses HEAD at the first edit of the session. `diff` and `compare` take `--base`.
  The analysis of each file at the base is cached by its git blob in `.git/shark-health/cache/`.
