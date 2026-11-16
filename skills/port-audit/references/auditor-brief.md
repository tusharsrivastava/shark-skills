# Auditor brief (template)

Copy this file to `<scratch>/audit/brief.md`. Fill each `<…>`. Send the same brief to each group auditor, with its
group name and its commits. The auditor is a read-only agent (for example `shark:code-debugger`, which loads
`shark:port-audit`).

```markdown
# Port audit brief (<operator>, <date> <time>; hard stop <time>)

Why: the rewrite of <repo> (commits <merge base>..<refactor head>) deleted code whose rules were not all ported.
Found so far one at a time: <the known gaps, with their commits>. Goal: find ALL such gaps in one static pass.
Do not list the known gaps again.

Repo: <repo path>. Current code: <refactor branch> (worktree <path>, READ ONLY). A merge may move it during your
run: read the current HEAD and note the sha.
Production (the reference): <reference branch> at <sha>. Old code at `<sha>^:<path>` is production code when
the commit is not in production (Step 0 list: <commits that production has>).
Decisions that remove behaviour on purpose: <decisions log of the project's `## Docs layout`> (rows <prefix>-n),
<spec decisions>, commit messages ("BREAKING", "delete … because").

Read-only work: `git show <sha>`, `git show <sha>^:<path>`, `git grep`, `git log -S`, file reads. Never edit the
repo, never check out, never run a test, the bench or a model. Never read an env file. Your only output is ONE
file: <scratch>/audit/<GROUP>.md (Write tool).

Your group: <GROUP> = <area>. Your commits: <sha list>.

Method for your commits:
1. For each deleted (or heavily rewritten) function, method, class or rule in <source folder>, write ONE row.
   Ignore pure moves and renames: check that the same logic exists under a new name (`git log -S`, `git grep` on
   distinctive literals, constants, spec keys, setting names, event names).
2. Row: rule (one line: what the behaviour did, for the user or the system) | old place (sha^:path:line,
   function) | status: PORTED (new file:line) / GAP (no reader or no replacement) / REMOVED ON PURPOSE (decision
   id or commit message quote) / UNSURE | evidence (the grep or file:line that proves it) | impact (user-facing
   output, business data, decision path, bench only) | severity (H: wrong or lost user-facing behaviour or
   business data; M: degraded; L: bench, evaluation or log only).
3. Also list spec keys, settings and event fields that are still PARSED or WRITTEN but have NO READER now: one
   row each, status GAP unless a decision removed it. Also list facts that code reads but nothing writes.
4. Order the file: GAP H first, then GAP M, UNSURE, GAP L, then PORTED and REMOVED (one line each is enough).
5. Top of the file: counts for each status, the sha you audited, the method (and your parallel readers, if
   any), the H rows that you checked by hand, and what you did not finish. Label each other row "inferred".

Timebox: <minutes> minutes, plus one automatic grace of 20 % to finish the item in progress (not to start new
work). Need more: ask the operator before the grace ends (SendMessage to `main`: what is left, why, the minutes).
Quality over coverage: an UNSURE with evidence beats a guess.
```

## Group file header (what each auditor writes first)

```markdown
# <GROUP> port audit: <area>

- **Audited code:** <refactor branch> at **<sha>**. <Note if the HEAD moved during the run.>
- **Commits:** <sha>: <files>; … Pure moves (checked with `git show -M`): <sha list>.
- **Method:** static reading only. <n> parallel readers; merged and de-duplicated. Checked by hand: <H row IDs>.

## Counts (after de-duplication)

| status | count |
|---|---|
| GAP H | |
| GAP M | |
| UNSURE | |
| GAP L | |
| PORTED | |
| REMOVED ON PURPOSE | |

## Not finished

<What the timebox stopped. Be exact.>

## Rows

| # | rule | old place | status | evidence | impact | sev |
|---|---|---|---|---|---|---|
| H1 | <behaviour> | <sha^:path:line `function`> | GAP | **Checked by hand.** <file:line evidence> | <who sees it> | H |
| M1 | <behaviour> | <sha^:path:line `function`> | GAP | Inferred. <grep with no hit> | <who sees it> | M |
```
