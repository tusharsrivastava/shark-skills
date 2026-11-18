# Orchestration

Read this file only on the orchestrated path (operator `SKILL.md` §0). The section numbers are the same as in the
operator skill: §9 (scope, known defects) and §10 (voice) stay in `SKILL.md`.

## 1. Read the project facts

Read the project `AGENTS.md` (or `CLAUDE.md`) at the repository root. Use these sections by their exact names:

| Section | The operator uses it for |
| --- | --- |
| `## Commands` | The keys `gate:fast`, `gate:scoped <paths>`, `gate:full`, `test <paths>`, `lint`, `format`, `typecheck`, `run`, `setup`, and the optional `test-db:copy` and `bench`. Never a literal command in a brief. |
| `## Invariants` | The checklist of each review and each merge audit. |
| `## Architecture rules` | Layers, module boundaries and import contracts that a lane must keep. |
| `## Test scope` | The choice between the scoped gate and the full gate. |
| `## Secrets` | The files that no agent reads, and how the environment loads at runtime. |
| `## Docs layout` | The paths of the spec, handbook, cookbook, decisions log and handoff file. |
| `## Owner rules` | Push, long checks, deploy and approvals. |
| `## Session harness` | Who leads the session. If it names another orchestrator, the operator works on call: it takes the work that the user or that orchestrator gives it, and it does not take over the session. |

If a section is missing, ask the user once, in one message for all missing sections. Give a suggested value for
each. Suggest that they run `/shark:init`, which adds the missing sections to the project file (the template is
`${CLAUDE_PLUGIN_ROOT}/AGENTS.md`). Use the
answer for the rest of the session. Do not ask again.

**Defaults** until `## Owner rules` says otherwise:

- Push only when the user asks.
- A check that can run longer than 10 minutes starts only after the owner says yes, each time.

## 2. The role on the orchestrated path

- **The main session briefs, checks and talks.** Long work runs in background agents: gates, full test suites,
  benches, container test runs, merges and reviews. Short reads (a file, `git log`, a search) are fine here.
- **You write** the spec, the round contract, the briefs and the plan. You edit small docs, plans, and the
  project's skill and agent files directly.
- **You delegate** the rest:

| Work | Agent | Skill that the agent loads |
| --- | --- | --- |
| A closed spec for a build or a round of lanes | the operator, `shark:architect` or `shark:lead-engineer` | `shark:solution-spec` |
| Production code, tests, migrations, configuration | `shark:code-writer` | `shark:code-authoring`, `shark:system-design`, `shark:commit-blocks` |
| A defect: root cause, failing test, Fix spec | `shark:code-debugger` | `shark:debug-rca` |
| The merge of parallel lanes or patches | `shark:lead-engineer` | `shark:code-authoring`, `shark:lead-merge`, `shark:merge-audit`, `shark:commit-blocks` |
| An architecture or design question, a design review | `shark:architect` | `shark:system-design` |
| A diff that touches `## Invariants` (data isolation, money, events, jobs, idempotency, routes, permissions, raw queries, migrations, secrets) | `shark:invariant-guard` (read-only) | the catalogue of `shark:system-design` |
| A spec, report, design note or runbook; docs that a change made wrong | `shark:doc-writer` | (output style only) |
| A tutorial chapter | `shark:cookbook-writer` | `shark:cookbook-writing` |

`shark:architect` is costly. Send it only a complete brief and a question that is not small or local.
Choose its model when you start it (the `model` option of the Agent tool). Its default is `opus`. Ask for `fable`
when the question spans more than one service or module boundary, when it changes a data model, a contract or a
money, tenant or permission rule, when the math has more than one step, or when an `opus` review left the cause
open. `fable` costs more for each token, so say which condition applies in the brief.

`shark:code-writer` runs on `sonnet` at medium effort, on a closed spec. A spec is closed when `spec-check.mjs` of
`shark:solution-spec` exits with 0 (for an RCA, `rca-gate.mjs check` runs it). The strong model closes the spec;
the fast model builds it. Ask for `opus` (the `model` option) only when the spec cannot be closed (a design that
the writer must explore), or when a `sonnet` run broke a guard test or a baseline test. Say which condition
applies in the brief.

`shark:invariant-guard` runs on the orchestrated path only, on `sonnet` at medium effort. Ask for `opus` (the
`model` option) when the diff changes a migration or a data model, a tenant-isolation or permission rule, or the
money or event path across more than one module, or when a `sonnet` check reports a result that is not clear. Say
which condition applies in the brief.

## 3. Choose the mode (orchestrated path)

Read the first request of the user. Choose one mode:

| Mode | The request is… | File |
| --- | --- | --- |
| **feature** | new or changed behaviour | [`modes/feature.md`](../modes/feature.md) |
| **review** | a judgement on changes that exist: a diff, a branch, a pull request, a file | [`modes/review.md`](../modes/review.md) |
| **debug** | wrong behaviour: a bug report, a failing test, a value that is not correct | [`modes/debug.md`](../modes/debug.md) |

A question, an explanation, or a small change to docs, skills or configuration needs no mode. Answer it directly,
in the voice of operator §10.

Announce the mode in one line, for example "Debug mode: I start with the report." Then read the mode file and
follow it. The user can change the mode with one word; change it without argument.

A session can move between modes. A review finds a bug (go to debug). A debug session ends in a fix (go to the
feature workflow for the change). Announce each change in one line and follow the new mode file from its start.
Keep what you know; do not ask the interview questions again.

## 4. Situation → skill

Choose the method by the situation. Give each agent its skill by name. The method is in the skill, not in the brief.

| Situation | Skill | Who runs it |
| --- | --- | --- |
| N failing scenarios and one goal ("make these pass") | `shark:goal-loop` | you; debuggers classify, lanes fix, one lead merges |
| A rewrite or refactor may have lost rules | `shark:port-audit` (prove the production baseline first) | read-only auditors in parallel, then one index agent |
| Many independent patch units from an audit | `shark:patch-fanout` | one `shark:code-writer` for each unit, 6 to 8 at a time |
| Patches arrive and must land on one branch | `shark:lead-merge` | one long-running `shark:lead-engineer`, fed from a queue file |
| Each merge needs an independent check | `shark:merge-audit` | one read-only auditor next to the lead |
| A diff touches an item of `## Invariants`, in feature mode, review mode, or before a merge | none (the method is in the agent) | `shark:invariant-guard`, read-only, next to the writer or the lead |
| A defect with a cause that is not clear | `shark:debug-rca` | `shark:code-debugger` |
| Work is ready to commit | `shark:commit-blocks` | the writer or the lead |
| State that the code and the commits do not record | `shark:handoff` | you |
| A design choice, a boundary, a refactor plan | `shark:system-design` | `shark:architect` or `shark:code-writer` |
| The ignore file of the repository changes | `shark:gitignore` | you |

## 5. Brief every subagent

Every brief has the same parts: goal, context, files owned, contract link, checks, and timebox with grace and
extension. It has also the rule "never ask the user; record decisions", and the report format. Use
[`brief-template.md`](brief-template.md). When a skill holds the method, the brief is the
skill name, the unit of work, and the fixed block of the template.

## 6. Split, timebox, merge

Run large work and fix rounds in rounds. Full method: [`split-timebox-merge.md`](split-timebox-merge.md).

1. **List** every known defect first, with its failure and `file:line`. Find wiring gaps with one static scan.
2. **Contract step.** One agent (5 to 10 minutes) writes the round contract. Lanes read it first; on a shared
   decision they stop and report.
3. **Split**: one module and one cause for each lane; a complex build splits by file.
4. **Timebox** each agent, with one automatic grace of 20 %. Only you extend a timebox.
5. **Lanes check only their files.** One merge for each round runs `gate:fast` (5 minutes at most).
6. **Costly runs last**, once each. When a round finds more than it fixes, stop, tell the user, and list again.

## 7. Parallel builds

Details: [`parallel-builds.md`](parallel-builds.md).

- Ask the design question before the build when two designs are sensible (operator §9).
- Give each build its own worktree and a test database copied from a migrated template (`test-db:copy`).
- Give the migration numbers and the owner of each part of a shared file in the brief.
- Check the branch of another person before you merge it. Never push a red gate to a shared branch.

## 8. Background agents

Details: [`agent-hygiene.md`](agent-hygiene.md). Pitfalls of lanes, test databases and wait loops: [`pitfalls.md`](pitfalls.md).

- Note the start time and the timebox of each agent. "No notice" looks the same as "still working".
- At timebox + 5 minutes with no result, read its output and send a status message. An agent on a permission
  prompt sends nothing. Stop it. Start it again with a narrower tool set.
- Stop runaway shells, wait loops and containers that the session started.
- Remove each finished worktree and its test databases. Keep the root tree and one active feature worktree.

## 11. Before you end a turn with work done

- After a merge into the main branch, run `gate:full` in the background (with the owner's yes if it is long).
  Send docs that the change made wrong to `shark:doc-writer`.
- State what is not verified.
- Name each file that is changed but not committed.
- Name each background agent that still runs, with its timebox.
- Record state that the code and the commits do not hold in the handoff file (`shark:handoff`).
