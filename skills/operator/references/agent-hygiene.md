# Background agents: liveness, shells, cleanup

Rules that keep background agents moving and the machine clean. A background agent that is blocked sends no
notice, so you check by clock, not by notice.

## 1. Track each agent

Keep one line for each background agent in the plan file or the session scratchpad:

| Agent | Task | Start | Timebox | Grace ends | Output |
| --- | --- | --- | --- | --- | --- |
| `shark:code-writer` lane A | <goal> | <hh:mm> | <hh:mm> | <hh:mm> | <output file or agent id> |

## 2. Check by clock

1. At the timebox, send a status message to the agent and ask for a report.
2. At timebox + 5 minutes with no result, read its output file.
3. If it waits on a permission prompt, stop it. Start it again with a narrower tool set, or with only the
   allow-listed tools that it needs.
4. If it is not near done, merge what is ready and move the rest to the next round.
5. Do not rely on one watchdog or one timer for liveness. Check each agent at its own time.

Before unattended time (the owner sleeps or is away), give each agent only allow-listed tools, for example
read-only shell patterns. Tell it never to ask. An agent on a permission prompt can stop for hours.

## 3. Shells, wait loops and containers

- **One check shell for each agent** at a time. Many parallel whole-repository checks make each check 5 to 10
  times slower.
- **Every wait loop has an end condition and a time limit.** The agent stops its own loops before it reports.
- **Never wait on a summary line.** Some runners print no "passed" line in quiet mode. Run the command in the
  background and read the exit code from the completion notice.
- **Never wait with a process search that matches itself.** A loop such as `until ! pgrep -f "<pattern>"` has
  the pattern in its own command line, so the search always finds it and the loop never ends.
- **At the end of a round,** list the processes (`ps`) and stop the stale loops and shells of this session.
- **Containers:** stop the test containers that the session started for one task. Never stop a shared,
  long-running database container that the project keeps (see `## Owner rules`).
- **Load:** on one machine, at most 6 to 8 test runs at a time, each under a timeout of 600 seconds.

## 4. Cleanup

After the work of a worktree is merged or stopped:

1. The agent commits its source changes on its branch.
2. Remove the worktree (`git worktree remove`, then `git worktree prune`) and check that the folder is gone.
3. Drop the test databases that you made for the worktree or for a review.
4. Delete the branch with `git branch -d` when it is merged. A branch that landed by cherry-pick: delete it with
   `git branch -D` only when `git cherry <target> <branch>` prints no `+` line. Otherwise keep the branch.

Before the session ends, run `git worktree list` in each repository of the session. Keep the root tree and one
active feature worktree. Put the cleanup step in every brief that makes a worktree, also for the timebox and
failure cases.
