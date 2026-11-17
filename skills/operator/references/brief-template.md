# Subagent brief template

Every subagent gets a brief with these parts, in this order. A subagent knows only what the brief says, the
files it reads, and its own agent and skill files. Write each fact that it needs; do not expect it to know the
conversation.

## 1. The template

Copy the block, then fill each `<…>`. Delete a line only when it cannot apply (for example no worktree for a
read-only review).

```text
Goal: <one sentence: the result, not the activity. "the orders list returns 404 for a non-member", not "look at auth">
Skill: <shark:<skill> to load first, if a skill holds the method; else "none">
Context: <what is known; what was checked already, with its result; links to the spec, the plan, the issue>
Files owned: <paths that you may change>
Read-only: <paths that you may read but not change>
Do not touch: <paths of other lanes, shared files that the lead owns>
Contract: <absolute path of the round contract>. Read it first. If a shared name, event, field or rule
  is not in it, stop and report. Never decide a shared thing alone.
Workspace: worktree <absolute path>, branch <name>, test database <name>
  (make it with the project's test-db:copy), migration number <n>, after <n-1> of <other lane>
Checks: only your files. Run the project's lint, format, typecheck and test <your test files>
  (AGENTS.md › Commands). Never gate:full, the integration suite or the bench in a lane.
  At most one check shell at a time. Run tests in the background and read the exit code.
  A check that can run longer than 10 minutes: do not start it; report it.
Timebox: <N> minutes, from <hh:mm> to <hh:mm>. At the timebox you get one automatic grace of 20 %
  (<n> minutes) to finish the step in progress (a running gate, a commit, a push), not to start new work.
  To get more time, SendMessage to `main` before the grace ends: what is left, why, the minutes you need.
  Keep working during the grace. With no answer at the end of the grace, commit what is green and report the rest.
Rules: Never ask the user. Record each decision in the report with its reason.
  Never read env or secret files (AGENTS.md › Secrets).
  Never `git stash`, `--no-verify`, a force push, or `git branch -D` (the lead may, after a `git cherry` check). Push only if this brief says so.
  Every wait loop has an end condition and a time limit. Stop your shells and wait loops before you report.
Report: in ASD-STE100, outcome first, in this order:
  1. Outcome (one sentence: done, partly done, or blocked).
  2. Files changed, with absolute paths; commits with their hashes.
  3. Checks that you ran, with the command key and the result.
  4. Decisions that you took, each with its reason (the operator can change them).
  5. Open items and blockers; each claim labelled observed or inferred.
  6. What is not verified.
```

## 2. Rules for the brief

| Rule | Reason |
| --- | --- |
| Use command keys (`gate:fast`, `test <paths>`), never literal commands. | The project owns its commands in `AGENTS.md`; a literal command goes stale. |
| Give the clock times of the timebox, not only the minutes. | The agent and the operator check the same clock. |
| Give the worktree, the test database and the migration number for each parallel build. | Two builds on one test database or one migration number make both results unreliable. |
| List what was checked already, with the result. | The agent does not run the same slow check again. |
| Name the skill; do not copy its method into the brief. | One rule, one place. The skill stays the source. |
| For a defect, give the failure: the inputs, the state, the wrong result. | A writer that guesses the failure fixes the wrong thing. |
| For `shark:architect`, check the brief first: the question, the files, the constraints, the decision owner. | The architect is costly and stops on an incomplete brief. |
| Before unattended time (the owner sleeps), give only allow-listed tools and say "never ask". | An agent that waits on a permission prompt stops for hours with no notice. |

## 3. Short form

When a skill holds the method, the brief is short:

```text
Goal: apply patch unit <id> from <absolute path of the patch list>.
Skill: shark:patch-fanout (you are one patch writer).
Files owned: <paths of the unit>. Contract: <path>.
Workspace: <worktree>, branch <name>, test database <name>.
<the Checks, Timebox, Rules and Report blocks of §1, without change>
```

The Checks, Timebox, Rules and Report blocks are never shortened.

## 4. Check the report

| Check | Action when it fails |
| --- | --- |
| The outcome agrees with the files and the commits (`git log`, `git status` in its worktree). | Ask the agent; do not report its claim as observed. |
| Each decision agrees with the spec and the contract. | Take it to the user, or send it back with the answer. |
| Each check ran on the files that changed. | Run the missing check in the background. |
| No shells or wait loops of the agent still run. | Stop them (see `agent-hygiene.md`). |
| A decision that changes visible behaviour, latency, cost, data safety or a business rule. | Put it in the question list for the user, with your recommendation. |
