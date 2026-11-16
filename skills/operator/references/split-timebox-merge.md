# Split, timebox, merge

The method for large builds and fix rounds with parallel agents. It prevents two costs. Lanes find only the next
blocker each, and merges spend their time on rework when the lanes have no shared agenda.

## 1. List first

1. List every known defect before any lane starts. Give each one its failure (inputs, state, wrong result) and
   its `file:line`.
2. Find wiring gaps with one static scan, not with slow flows again and again. Examples of a scan: each declared
   fact or field has a producer and a reader; each adapter is registered; each new route has a permission.
3. Check the list for shared causes. Two defects with one cause are one lane.

## 2. Contract step

Before the split, one agent writes the round contract (5 to 10 minutes). The contract is a Markdown file with
these items:

| Item | Content |
| --- | --- |
| Shared names | Each shared name (type, function, event, field, setting, table) with its one owner file. |
| Writers and readers | Every writer and every reader of each new or changed event or field. |
| Invariants and decisions | The invariants (`## Invariants`) and the owner decisions that the round must keep. |
| Deletions | Each rule to delete, with its callers and its new owner. |
| Lane boundaries | The files of each lane, and the files that nobody in the round changes. |

A contract that deletes code without the deletion list loses rules (see `shark:port-audit`). Lanes read the
contract first. They never decide a shared thing alone: they stop and report. The merge checks each lane against
the contract.

## 3. Split

- Split by module: one module and one cause for each lane. No two lanes on one cause, module or function.
- Prefer one behaviour end to end in a lane over one file of a cross-cutting change.
- A complex build splits by file. Write a short spec with the interface of each file. Then start one
  `shark:code-writer` for each file, all in parallel, 5 to 10 minutes each.
- Give each lane its files, its worktree, its test database and its migration number (`parallel-builds.md`).

## 4. Timebox, grace, extension

| Agent | Timebox |
| --- | --- |
| A lane | 20 minutes |
| A one-file writer | 5 to 10 minutes |
| A contract writer | 5 to 10 minutes |
| A merge | 40 minutes |

- At the timebox, each agent gets one automatic grace of 20 % of its timebox. The grace finishes the step in
  progress (a running gate, a commit, a push). It does not start new work.
- An agent that needs more time asks you (`SendMessage` to `main`) before the grace ends: what is left, why,
  and the minutes. It keeps working during the grace.
- Only you extend a timebox. Answer at once. Extend when the step is nearly done and the cost is low. Ask the
  owner when the extension changes a deadline or a cost.
- With no answer at the end of the grace, the agent commits what is green and reports the rest.
- At each timebox, ask the agent for a report. If it is not near done, merge what is ready and move the rest to
  the next round.

## 5. Checks in a lane

- A lane checks only what it changed: lint, format and types on its files, and its own test files.
- One check shell for each agent at a time.
- On one machine, at most 6 to 8 test runs at a time, each under a timeout of 600 seconds.
- Never the full suite, the integration suite or the bench in a lane. Parallel full checks run 5 to 10 times
  slower each, and they block the machine.

## 6. Merge

1. One merge for each round, or for each batch of patches, by `shark:lead-engineer` with `shark:lead-merge`.
   Put `shark:merge-audit` next to it when each merge needs an independent check.
2. The lead runs the fast path once: `gate:fast` (lint, types, import contracts, unit tests, wiring smoke tests),
   5 minutes at most. It must pass before any costly run.
3. The lead runs the test folders and the architecture tests once for each batch.
4. The merge writes one blocker table: blocker, `file:line`, cause, lane for the next round. The next round
   starts from it.

## 7. Costly runs last

- `gate:full`, the integration suite, the migration round-trip tests and `bench` run last, once each.
- A run that can take longer than 10 minutes starts only after the owner says yes (`## Owner rules`).
- Do not run an early full gate "while you wait". The gate runs once, after the last merge.
- Freeze before the last measurement: when you announce the final bench with an estimate, start no new lane.
  Its findings go to the list of the next round, not to a fix-and-measure-again loop.

## 8. Estimates and stops

- An estimate is one round. Give it as a range, and include one fix round after the final measurement.
- When a round finds more than it fixes, stop. Tell the user, and list again (§1).
