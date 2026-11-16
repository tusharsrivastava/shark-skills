# merge-log.md (template)

The lead writes this file. One row in the table for each merge, and one entry for each merge or batch that has
conflicts, lead fixes, snapshot differences or notes. The audit engineer (`shark:merge-audit`) reads it next to
the merge diff.

```markdown
# Port merge log (lead engineer)

Integration branch `<integration branch>`, worktree `<path>`. Base: <refactor branch> <sha>.

| # | Unit | Branch / sha | Merge sha | Result | Snapshot differences | Notes |
|---|---|---|---|---|---|---|
| 0 | PROD (<production-only commits>) | <reference> <sha> | <sha> | merged; <n> passed (<folders>) | none | <n> conflicts |
| 1 | <UNIT> | pu/<UNIT> <sha> | <sha> | merged, no conflict; <n> passed | not run | entry 1 |

## Batch <n>: <units> (one combined check)

Merges: <UNIT> <sha>; … Lead commits: <sha> (<UNIT> fix), …

Conflicts and resolutions:
- <UNIT> `<file>` `<function>`: <what each side added>; kept <both | which, and why>. Invariants of both notes
  kept: <the invariants, in short>.

Lead fixes (each test first):
- <sha> <UNIT>: <defect, evidence file:line, the fix, the test>.

Read-ahead findings (for the next batch):
- <UNIT>: <duplicate name | layer break | file damage>, <file:line>, <the item>.

Checks (one combined run at <sha>): `gate:fast` <result>; `gate:scoped` <folders>: <n> passed, <n> failed =
<names> (<"by design after <UNIT>" | cause>). <time>.

Snapshot (not re-recorded; grouping script <path>): <total> differences at <sha>, <new in this batch>:
- <count> × `<field>: new` (<UNIT>); <count> changed = <UNIT> entry <n> (<fields>).
- Not predicted by a note: <none | each one, with the check that you did>.

Worktrees removed: <list> (<--force: only the known leftover>). Test databases removed: <list>.
Follow-ups for the operator: F-<UNIT>: <behaviour>.

## Restart (lead, after <cause>) - <sha>
- <What the restart found and fixed first.>

## Blocker table

| Test | Cause | Evidence |
|---|---|---|
| <test id> | <cause, or "pre-existing flake"> | <"fails on base <sha> too" | file:line> |
```
