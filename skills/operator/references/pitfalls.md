# Pitfalls

Read this file before a parallel build or a fix round. The rules come from the Working rules of the template.

## Deploy pitfalls

- A running worker keeps the old modules in memory. Restart every worker type before or with the migration, and
  before it serves new code.
- Restart every worker type, also the relay that sends outbox events. A worker that is not restarted can stop the
  delivery of events without an error.
- A task queue has time limits (Python Celery: soft and hard limits). Long work needs a budget and a
  continuation, or its own limit.

## Agent hygiene

- Each brief states the timebox, the grace rule, the gate, the worktree, the test database and the files that
  the agent owns.
- Note the start time of each background agent. At timebox + 5 min with no result, read its output or send it a
  status message.
- A background agent that waits on a permission prompt sends no notice. Give unattended agents only allow-listed
  tools, and tell them never to ask.
- Run long tests in the background and read the exit code from the completion notice. Never wait in a
  `until grep …; do sleep …; done` loop.
- Each wait loop has an end condition and a time limit. Stop your own wait loops before you report.

## Pitfalls table

| Pitfall | Effect | Rule |
| --- | --- | --- |
| Lanes run long flows on isolated branches | Each lane finds only the next blocker; the estimate grows by hours | List all defects first; one merge for each round (§2) |
| Lanes with no shared contract | A third of the time goes to merge rework: copied rules, lost checks | Contract step first (§2) |
| Many agents run whole-repository checks at once | Each check runs 5 to 10 times slower | Each lane checks only its files (§2) |
| A test database built from zero for each run | 30 min or more for each run | Copy a migrated template; reuse it (§3) |
| Python: a test folder and a file inside it in one `pytest` call | pytest collects only the file; the folder tests do not run | Give folders, or files, not both |
| Python: `pytest-xdist` with database tests | Each worker makes its own new test database (`_gw<N>`) | Copy the template for each worker name, or run without `-n` |
| Type check on the source only | Type errors in the tests pass | `typecheck` checks the source and the tests |
| The default gate skips integration tests | An integration test stays red, not seen | `gate:full` includes them |
| `until ! pgrep -f "<pattern>"` wait loop | The loop matches its own command line and never ends | Wait on the completion notice |
| A running worker after a deploy | It runs the old code against the new schema | Restart every worker type (§9) |
| Stored display text ("$28.80") parsed back into money | Wrong values that pass the tests | Typed state; text only at the edge |
| The same rule in two call sites | The copies drift | One rule, one place |
| A reader that assumes the shape of a result by itself | It reads `None` with no error when the shape differs | One typed reader for each shape, with a contract test against the real writer |
| A rewrite deletes code without a list of its rules | Rules are lost and found one at a time | `shark:port-audit` before the rewrite replaces production |
