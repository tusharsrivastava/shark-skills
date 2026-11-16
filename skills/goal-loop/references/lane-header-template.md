# Lane header (template)

Every lane of a round reads this header first. Copy it to `<scratch>/goal-loop/lane-header-r<n>.md`. The brief of
each lane is then short: the lane ID, the base, and "read the lane header". Commands in angle brackets are the
keys of the project `AGENTS.md`, section `## Commands`.

```markdown
# Goal loop round <n> - lane header (read before anything else)

Repo <repo path>. Its AGENTS.md wins over the rules of your agent file.
Base: <branch> <sha> (later waves: the base that the operator gives in the brief).
Setup: `git -C <repo> worktree add ../<repo name>-wt-r<n>-<LANE> -b r<n>/<LANE> <base>`; then `<setup>` in it;
`<test-db:copy>` if your tests need a database (never build one from zero).
(scratchpad = <scratch>)

READ FIRST: <scratch>/goal-loop/contract-r<n>.md (ALL of it: shared names, writers and readers, keep, YOUR lane
row and its function boundaries, the snapshot column, stop conditions, checks),
<scratch>/goal-loop/defects-r<n>.md (the defects and evidence), <scratch>/goal-loop/rounds.md (owner decisions).

Starting tests: some lanes start from an uncommitted failing test in a debugger worktree (<paths>). Read it there
and copy it into YOUR worktree with the Write or Edit tool (never cp, git apply, sed, or a heredoc). Never edit,
commit, or remove the debugger worktrees.

OWNER RULES: accuracy before speed. A lane changes only the behaviour of its row; any change outside its row is a
stop. The snapshot test (<command>, own process): NEVER re-record. If your row allows a snapshot difference,
report the diff and map each difference to the allowed one; any other difference is a stop. No customer name or
customer rule in code beyond the shared vocabulary. Per-customer spec files are never edited by a lane. Never
parse display text for state.

PROCESS RULES:
- Edit files ONLY with the Edit or Write tool. Never sed, awk, cp, git apply, a heredoc into a file, or a script
  that writes a file.
- Touch only the files and functions of your lane row. Anything in the stop conditions: stop and report.
- Test first: the test fails for the expected reason, then the code.
- No real model call or paid external call in any test or run. No env file read or printed. Do not run <bench>.
- Fast checks only: <lint> + <format> + <typecheck> on your files; <gate:scoped <paths>> for the tests of your
  files, their importers, the architecture tests; the snapshot test. No check over 10 minutes. No hand-written
  wait loops.
- Never git stash, --no-verify, push, rebase, merge. Do not change the git identity of the repository.
- Commit messages: conventional commits that end with "<attribution trailer>". One commit for each logical change
  on your branch (see shark:commit-blocks).
- Before the commit: `git diff --stat`; state in the report that no file was written by a shell command.
- Timebox <m> minutes, plus one automatic grace of 20 % to finish the step in progress. Need more: ask the
  operator before the grace ends (`SendMessage` to `main`); only the operator extends. Else commit what is green
  and report the rest.

REPORT (short, outcome first): branch and commit sha(s); the test that failed first; the snapshot result; the
checks that you ran; decisions a reviewer may challenge; stop conditions hit; the git diff --stat statement.
```

## What changed from round 1 to round 2 (keep these)

- The rule "Edit or Write only" names `cp` and `git apply` too, and says why. Round 1 lanes broke the rule, and
  the merge read every such file again.
- The owner rule "never parse display text for state" is in the header, not only in the contract.
