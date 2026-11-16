# AGENTS.md: <project name>

## How to use this file

1. Copy this file to the root of the repository. Or run `/shark:init`: it does steps 1 to 5 for you, and it keeps
   the text that your project file has already.
2. Fill each section from `## Commands` to `## Session harness`. Replace each `<…>` value.
3. Delete the guidance lines (`>`) and the examples that do not apply to your stack.
4. Keep the section names exactly as they are. The shark skills find the project values by these names.
5. Keep "Working rules" as it is. Change a rule only to make it stricter for this project.

> **Claude Code:** Claude Code reads `AGENTS.md` only when the project has no `CLAUDE.md`, or when the
> `claude-md-and-agents-md` setting is on. Otherwise, rename this file to `CLAUDE.md`.

A rule in this file wins over a rule in a shark skill or agent. When a section is missing, a skill asks the user
one time and recommends to add the section here.

---

## Commands

> One row for each key. The skills run a key ("run `gate:fast`"), never a literal command. Mark the optional keys
> that you do not use as "none".

| Key | Command | Limit or note |
| --- | --- | --- |
| `setup` | `<command>` | Makes the environment from zero (dependencies, local services). |
| `gate:fast` | `<command>` | Lint, types, unit tests, wiring smoke tests. At most 5 min. |
| `gate:scoped <paths>` | `<command>` | `gate:fast` static checks plus the tests in `<paths>`. |
| `gate:full` | `<command>` | All CI gates, integration tests included. |
| `test <paths>` | `<command>` | Runs only the given test paths. |
| `lint` | `<command>` | |
| `format` | `<command>` | |
| `typecheck` | `<command>` | Checks the source and the tests. |
| `run` | `<command>` | Starts the full local stack. |
| `test-db:copy` | `<command>` or none | Optional. Copies a migrated template test database. |
| `bench` | `<command>` or none | Optional. The costly end-to-end measurement. |

Examples by stack:

| Key | Python | JS/TS | Go |
| --- | --- | --- | --- |
| `gate:fast` | `make fast` (`ruff check`, `mypy`, `pytest -m "not integration"`) | `pnpm lint && pnpm tsc --noEmit && vitest run` | `go vet ./... && golangci-lint run && go test -short ./...` |
| `test <paths>` | `pytest <paths> --reuse-db` | `vitest run <paths>` | `go test <packages>` |
| `typecheck` | `mypy src tests` | `tsc --noEmit -p .` | `go vet ./...` |
| `test-db:copy` | `psql -c "CREATE DATABASE <name> TEMPLATE <template>"` (Postgres) | same (Postgres); copy the file (SQLite) | same (Postgres) |

## Invariants

> The rules that every review checks. One line for each rule: the rule, how to see it in a diff, and the test or
> check that enforces it.

| # | Invariant | Check |
| --- | --- | --- |
| 1 | `<rule>` | `<test, lint rule, or review question>` |

Examples (keep the ones that apply):

- **Tenant isolation.** Each query on tenant data runs inside a tenant context. Postgres: row-level security
  policies. Any stack: a repository that takes the tenant ID as its first argument.
- **Money.** Money is an integer of minor units with a currency. Never a float. Each rounding call names its mode.
- **Idempotency.** A retried request with the same idempotency key (a client value that names one intent) gives
  the same result and makes one change.
- **One unit of work.** A write, its event and its job commit in one transaction. This is a transactional
  outbox: the event row commits with the data, and a relay sends it later.
- **Typed state.** Stored state, events and service contracts keep native types (money, date, enum). Text is made
  only at the presentation edge. Code never parses display text back into data.
- **One rule, one place.** A business rule or a tenant rule lives in configuration or in the spec. It never
  lives in a shared prompt or in a branch on a tenant name.

## Architecture rules

> The layers, the module boundaries, and the tool that enforces them. Name the paths that only
> `shark:code-writer` writes.

- Layers: `<outer> > <…> > <inner>`. An inner layer never imports an outer layer.
- Module boundary: other modules import only `<facade file or package>`.
- Enforced by: `<tool>` in `gate:fast`. Python: `import-linter`. JS/TS: `dependency-cruiser` or ESLint
  `no-restricted-imports`. Go: `internal/` packages and `depguard`.
- Production code paths (`shark:code-writer` only): `<src/>, <tests/>, <migrations/>, <config/>`.

## Test scope

> Keep the default. Add the paths that count as shared code in this project.

- **Scoped gate (the default)** for each change, fix and commit: `gate:scoped <paths>`. The paths are the test
  folder of each changed module, each changed test file, and the tests of each caller of a changed facade.
- **Full gate**, one time, only when:
  - the change touches shared code: `<shared paths, for example core/, config/, test fixtures>`;
  - the change adds or edits a migration, or changes settings or dependencies;
  - a branch merges into the main branch;
  - the user asks for it.
- Each report names the gate that ran and its paths.

## Secrets

- Never read or write: `<.env, .env.*, secrets/*, *.pem>`. The only exception: `<.env.example>`.
- Enforced by: `<hook path, for example .claude/hooks/deny-env-access.sh>`. The hook refuses each tool call on these
  files.
- The application loads the values at runtime: `<the loader, for example docker compose env_file, direnv>`.
- A report or a document names a setting, never its value.

## Docs layout

| Item | Path |
| --- | --- |
| Specification | `<docs/spec/>` |
| Handbook (how the code works) | `<docs/handbook/>` |
| Cookbook (tutorials) | `<docs/cookbook/>` |
| Decisions log | `<docs/decisions.md>` |
| Handoff file (state between sessions) | `<HANDOFF.md>` |

> When code and the spec disagree, say which one wins: `<the spec wins>`. Record each resolved gap in the
> decisions log.

## Owner rules

| Item | Rule |
| --- | --- |
| Push | `<Push only when the owner asks.>` |
| Long checks | `<A check that can run longer than 10 min starts only after the owner's OK, each time.>` |
| Deploy | `<who deploys, and the restart order>` |
| Approvals | `<new permissions, new runtime dependencies, business-rule changes>` |

## Session harness

> The one skill that runs first in each session. Keep exactly one start rule in this file. If the project already
> has its own orchestrator, name it here and keep `/shark:operator` on call.

Invoke `/shark:operator` first, before the first answer.

---

## Working rules

These rules come from the build of a production system. Each one prevents a failure that cost hours.

### 1. How a session runs

- **The session harness runs first**, before the first answer. The `## Session harness` section names it. The
  default is `/shark:operator`, which sets the mode (feature, review, debug).
- **The main session is the operator.** It talks with the user, writes briefs and checks results. Long work
  (fixes, gates, merges, reviews) runs in background agents.
- **`shark:code-writer` writes production code** (the paths in "Architecture rules"). The main session writes
  specs, docs and configuration of the agents.
- **A bug goes to `shark:code-debugger` first.** It returns a root cause, a failing regression test and a fix spec.
  Then `shark:code-writer` fixes it.
- **Specialists:**

| Need | Agent or skill |
| --- | --- |
| Design check, SOLID, patterns, contracts | `shark:system-design` skill; `shark:architect` for a costly senior review |
| Merge of parallel lanes | `shark:lead-engineer` with `shark:lead-merge` |
| Independent check of each merge | `shark:merge-audit` |
| A diff that touches an item of "Invariants" | `shark:invariant-guard` (read-only) |
| Fix rounds on N failing scenarios | `shark:goal-loop` |
| Rules that a rewrite lost | `shark:port-audit`, then `shark:patch-fanout` |
| Commits | `shark:commit-blocks` |
| Specs, reports, runbooks | `shark:doc-writer` |
| Tutorials | `shark:cookbook-writer` |
| State between sessions | `shark:handoff` |

- **Ask the design question before the build.** When two designs are sensible, ask the owner, with a
  recommendation. A trade-off on behaviour, latency, cost or data loss goes to the owner as a question, also under
  "decide for me". Build on the recommended default and mark it "taken by default, owner to confirm".

### 2. Split, timebox, merge

1. **List every known defect first**, each with its failure and `file:line`. Find wiring gaps with one static scan
   (each produced value has a reader, each read value has a producer). Do not run slow flows again and again.
2. **Contract step before the split.** One agent (5 to 10 min) writes the round contract:
   - each shared name with its one owner file;
   - every writer and reader of each new or changed event or field;
   - the invariants and owner decisions to keep;
   - each rule to delete, with its callers and its new owner;
   - the lane boundaries.

   Lanes read it first. A lane never decides a shared thing alone: it stops and reports. The merge checks against
   the contract.
3. **Split by module:** one module and one cause per lane. No two lanes on one cause, module or function. Prefer
   one behaviour end to end per lane.
4. **A core change splits by file.** First a design spec with the math and a boundary table. Then a file plan
   (one row for each file: interface, tests, dependencies). Then one writer for each file, in parallel, 5 to 10 min
   each.
5. **Timebox:** 20 min for a lane, 5 to 10 min for a one-file writer, 40 min for a merge. Each agent gets one
   automatic grace of 20 % to finish the step in progress, not to start new work. For more time, it asks the
   operator before the grace ends. Only the operator extends. With no answer, the agent commits what is green and
   reports the rest.
6. **A lane checks only its files:** lint, format and types on its files, and its own tests. At most one check
   shell for each agent. The lead runs the test folders and the whole-repository type check once for each batch.
7. **One merge for each round.** It runs `gate:fast` (at most 5 min) and writes one blocker table. The next round
   starts from it.
8. **Costly runs last, once each:** `gate:full`, integration tests, `bench`. Never an early full gate "while
   waiting". Freeze new lanes when the last costly run starts; its findings go to the next round.
9. **An estimate is one round.** A round that finds more than it fixes stops. Tell the owner and list again.

### 3. Worktrees and test databases

- Each parallel build gets its own worktree and its own test database. The brief names both.
- Make a test database with `test-db:copy` from a template that is migrated to the head of the shared branch.
  It takes seconds. A build from zero applies every migration and can take 30 min or more.
- Run tests with the "reuse the database" option (Python `pytest-django`: `--reuse-db`; Rails: run only the new migrations on the test database, do not reset it). A new migration then
  costs seconds.
- Rebuild from zero only when a migration that the database has already was edited. Even then, copy the template
  again.
- The brief gives each build its migration numbers and the part of each shared file that it owns.
- After a merge or a stop: commit the branch, remove the worktree (`git worktree remove`, `git worktree prune`),
  drop its test databases. Keep the root tree and one active worktree. Each worktree with its dependencies can
  take hundreds of MB.

### 4. Git rules

| Rule | Reason |
| --- | --- |
| Never `git stash`. | A stash in a shared tree takes the work of another agent. |
| Never `--no-verify`. | The hooks are the gate. |
| Never force push. | Other worktrees build on the shared branch. |
| `git branch -d`, never `-D`. | `-d` refuses a branch that is not merged. |
| Push only when the owner asks. | Push is an owner decision ("Owner rules"). |
| Each commit passes the gate on its own. | `git bisect` stays reliable. |
| One reason for each commit; a refactor never in the same commit as a behaviour change. | A review and a revert stay small. |
| Never push a red gate to a shared branch. | Each lane then starts from a failure. |

### 5. Known defects: fix, then report

A defect is known when you can state the failure: the inputs, the state, the wrong result. Fix it in the same
session. The regression test comes first; the fix is its own change. Report the defect, its test (failing, then
passing) and the fix. Ask the owner first only when the fix:

- chooses between two behaviours that the spec does not decide;
- changes a business rule or the default of a setting;
- adds a permission or changes the permission matrix;
- adds an external service or a runtime dependency;
- changes a spec or a behaviour that the owner approved.

### 6. Decisions

- A newer decision **supersedes** an older one. Never call the older one "wrong", and never delete it.
- Record the link both ways, with the date and the scope. Old row: "Superseded in part by <new> (<date>): <scope>".
  New row: "Supersedes <old> in part: <scope>".
- Read each row before you mark it superseded. Never mark rows in bulk.

### 7. Reports

- ASD-STE100 (the output style `shark:asd-ste100`). Outcome first.
- Label each claim: observed (seen in code, a log, an output) or inferred.
- One recommendation, with its reason. The alternatives in one line.
- Reports, reviews and diagrams are Markdown files with their full path. Never publish them as pages.
- Name the gate that ran, what is not verified, and each file that is changed but not committed.

### 8. Evaluation first

- Measure a baseline before you add complexity (a cache, embeddings, a new model, a new service).
- Compare a rebuild with the old version by measurement on the main branch. Do not keep the old path alive
  behind a switch: the removal is the work.
- A speed change never degrades correctness. Overlap, caching and transport are allowed. A change that drops data
  or uses a cheaper model needs a measured A/B result and the owner's OK.

### 9. Deploy pitfalls

- A running worker keeps the old modules in memory. Restart every worker type before or with the migration, and
  before it serves new code.
- Restart every worker type, also the relay that sends outbox events. A worker that is not restarted can stop the
  delivery of events without an error.
- A task queue has time limits (Python Celery: soft and hard limits). Long work needs a budget and a
  continuation, or its own limit.

### 10. Agent hygiene

- Each brief states the timebox, the grace rule, the gate, the worktree, the test database and the files that
  the agent owns.
- Note the start time of each background agent. At timebox + 5 min with no result, read its output or send it a
  status message.
- A background agent that waits on a permission prompt sends no notice. Give unattended agents only allow-listed
  tools, and tell them never to ask.
- Run long tests in the background and read the exit code from the completion notice. Never wait in a
  `until grep …; do sleep …; done` loop.
- Each wait loop has an end condition and a time limit. Stop your own wait loops before you report.

### 11. Pitfalls

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
