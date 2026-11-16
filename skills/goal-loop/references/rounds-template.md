# rounds.md, defects-r<n>.md and contract-r<n>.md (templates)

Commands in angle brackets (`<bench>`, `<gate:fast>`) are the keys of the project `AGENTS.md`, section
`## Commands`.

## rounds.md

```markdown
# Goal loop: <N> failing scenarios (<owner>, <date>)

Goal: all <N> scenarios pass every hard check. At most <R> rounds; stop earlier when all pass (confirm with one
more run). Each round: classify each failure, fix the causes (lanes + lead merge on <integration branch>), run
the <N> again (run.sh).
Classes: RULE (spec or business rule), CODE (implementation), DATA (input, fixture, projection), MISSING
(feature not built), HARNESS (case, check or runner fault, no production effect).
(Profile: if the project uses its own names, map each to one generic class here: <PROJECT NAME> = <CLASS>, ...)
Config: <the production settings of the arm>. Spend cap of one run: <limit>.
Scenarios: <id-1>, <id-2>, ...
After the loop: the <n> scenarios that passed before run once as a regression guard.

## Owner decisions

- OD-<n> (<date>, answers <question id>): <the rule, as behaviour>. <Scope: shared default; a per-customer spec
  can supersede it.> <Supersedes OD-<m> in part: <scope>.>

| Round | Head | Pass | Failing checks | Notes |
|---|---|---|---|---|
| r1 | <sha> | <p>/<N> | <scenario check, ...> | <what changed; cost; folder> |
| r0 | <sha> | <p>/<N> | <check counts> | start point; <cost>; folder r0/<run id> |
```

Put the newest round at the top of the table.

## defects-r<n>.md

```markdown
# Goal loop round <n>: defect list (<date>), base <branch> <sha>

Sources: <k> `shark:code-debugger` reports (groups A, B, C) on the run of round <n-1> (<folder>). Regression tests
(uncommitted) are in worktrees:
- gl-A: <path> (branch gl/A): <test files> (one new failing test each, names below)

A lane copies the test it owns from that worktree into its own branch (Write tool), sees it fail, then fixes.

## Defects that need no owner decision

| ID | Class | Scenarios / checks | Root cause (file:line) | Fix spec | Test |
|---|---|---|---|---|---|
| H1 | HARNESS | <scenario check, ...> | <file:line and the mechanism> | <behaviour after the fix; what stays unchanged> | <worktree test file::test name> |

## Defects that need an owner decision

| ID | Class | Scenarios / checks | Root cause | Question (recommendation first) |
|---|---|---|---|---|
```

Prefix the IDs with a letter for each class (R, C, D, M, H), so that a lane row can cite them.

## contract-r<n>.md (head)

```markdown
# Round contract: goal loop round <n> (<repo>)

| Item | Value |
| --- | --- |
| Base | `<branch>` at `<sha>` (code read in <worktree>, read only) |
| Inputs | `defects-r<n>.md` (section "Defects that need no owner decision"); owner decisions OD-<a>..OD-<b> |
| Scope | <defect IDs and OD IDs>. OUT: <what this round does not do> |
| Rule | Accuracy before speed. No customer name or customer fact in shared code. No per-customer spec change in this round. No external model call in any test or script. |
| Paths | Under `<source folder>` unless they start with `tests/`, `docs/` or `scratch:` (= `<scratch>/`) |
| Lane setup | `git worktree add ../<repo name>-wt-r<n>-<LANE> -b r<n>/<LANE> <base>`; then `<setup>`; `<test-db:copy>` when the lane needs a database. Process rules, report, commit trailer: as `lane-header-r<n>.md`. Timebox <m> min, hard. |

Every lane reads this file first. A lane that needs a shared name that is not in section 3, or a file or function
of another lane, stops and reports.

## 1. Lanes

| Lane | Defects | Files it owns (functions) | Starts from (failing test) | Must keep | Snapshot |
| --- | --- | --- | --- | --- | --- |
| L-<X> | <IDs> | `<file>` **only** `<function>` | copy from <worktree>: `<test>` | <decision IDs and behaviours that stay> | <no change / change allowed only in <fields> of cases where <condition>; any other difference: stop> |

### Checks for every code lane
<The light checks: <lint> and <format> on its files, <typecheck> on its files, <gate:scoped <paths>> with its
tests and the tests of the importers of its files, the architecture tests; then the snapshot test alone. Never
re-record. Never <bench>.>

## 2. Design of the shared mechanism
<Only when two lanes share a mechanism: what the code does today (verified, file:line), the new interface, the
new names, the order of the stages, and the one call site that each lane fills.>

## 3. Shared names (one owner file each)

| Name | Owner file | Writers | Readers |
| --- | --- | --- | --- |

## 4. Invariants and owner decisions to keep
## 5. Merge order and merge items
## 6. Stop conditions
```
