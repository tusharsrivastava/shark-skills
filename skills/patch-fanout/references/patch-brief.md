# Patch-agent brief (template)

Send this brief to each patch agent. Fill each `<…>`. The agent type is `shark:code-writer`, unless the project's
`AGENTS.md` names another code writer.

```markdown
You port ONE patch unit: <UNIT> (<severity>): <title of the unit>.

Repo: <repo path>. Its AGENTS.md (or CLAUDE.md) wins over the rules of your agent file.
Base: <integration branch> at <sha> (or the branch pu/<UNIT it depends on> at <sha>).
Read first: <scratch>/port/pipeline.md (the "Patch agent" part), your row in <scratch>/audit/UNITS.md, its
source rows in <scratch>/audit/G<n>.md, the owner decisions in <decisions log> (<IDs>).

Steps:
0. Read the files above.
1. VERIFY FIRST (5 minutes at most): the rule exists in production (`git show <reference>:<path>`, or the old
   reference `<sha>^:<path>`, which is production code) and is missing or broken at the base. If the rule is
   present at the base, or a decision removed it: STOP, report "NOT A GAP" with the evidence. If production
   does not have it either (pre-existing): port it only if the unit says so; else report.
2. Worktree: `git -C <repo> worktree add ../<repo name>-wt-pu-<UNIT> -b pu/<UNIT> <base sha>`; then the
   project's `setup` in it (and `test-db:copy` if the tests need a database; never build one from zero).
3. Test first: a test that pins the production behaviour (cite the decision ID in a comment), failing for the
   expected reason.
4. Port the rule into the current architecture (the module and layer that the unit names; keep the project's
   `## Invariants` and `## Architecture rules`; never revive a deleted module as a whole; no customer or tenant
   names; tenant rules from configuration or a spec; typed state, never parse display text; import the owner of
   each shared name).
5. Checks (LIGHT): the project's `lint`, `format` and `typecheck` on YOUR changed files only; the project's
   `test` on YOUR new or changed test files only. No folder runs, no snapshot test, no architecture folder: the
   lead runs them for each batch. If you add a new module, also run <the architecture test for deleted names and
   one definition>.
6. One commit on pu/<UNIT>: a conventional message that ends with "<attribution trailer>".
7. PATCH NOTE: write <scratch>/port/notes/<UNIT>.md (Write tool) from
   <skill folder>/references/patch-note-template.md: WHAT, WHY, INVARIANTS, TESTS, KNOWN OVERLAPS.
   All patch agents run in parallel from the same base: do not wait for other units, even in the same file.
8. REPORT (short, outcome first): see below.

Rules: Edit/Write tools only for files (never sed, awk, cp, git apply, a heredoc, or a script write); no live
model or paid API call; no env file; never stash, push, merge, rebase or --no-verify; touch only what the unit
needs; never decide a shared name alone (stop and report); no check over 10 minutes. Timebox 20 minutes, plus one
automatic grace of 20 % (4 minutes) to finish the step in progress, not to start new work. Need more: ask the
operator before the grace ends (SendMessage to `main`: what is left, why, the minutes). With no answer: commit
what is green, mark the note PARTIAL, and report.

Report:
- unit ID; the VERIFY result (production evidence, base evidence);
- the commit sha; the test that failed first, and its failure;
- the checks that you ran, and their results;
- the snapshot differences that you expect (the lead checks them);
- the files that you changed (full paths);
- the shared names that you added, and anything another unit must know;
- what you did not port (PARTIAL), as items for a follow-up unit;
- the statement that no file was written by a shell command.
```
