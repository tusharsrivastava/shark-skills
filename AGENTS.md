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
| `analyze:file` | `<command>` or none | Optional (`shark:code-health`). Takes `{file}`; writes SARIF or Lizard output to stdout or `{out}`. Under 2 s on one file. |
| `analyze:diff` | `<command>` or none | Optional. Takes `{base}`; scans the changed files. With none, shark runs `analyze:file` on each changed file. |
| `arch:check` | `<command>` or none | Optional. The whole repository; SARIF to `{out}`. Checks `## Architecture rules`. |
| `analyze:full` | `<command>` or none | Optional. The whole repository, for CI and SonarQube. |

Examples by stack:

| Key | Python | JS/TS | Go |
| --- | --- | --- | --- |
| `gate:fast` | `make fast` (`ruff check`, `mypy`, `pytest -m "not integration"`) | `pnpm lint && pnpm tsc --noEmit && vitest run` | `go vet ./... && golangci-lint run && go test -short ./...` |
| `test <paths>` | `pytest <paths> --reuse-db` | `vitest run <paths>` | `go test <packages>` |
| `typecheck` | `mypy src tests` | `tsc --noEmit -p .` | `go vet ./...` |
| `test-db:copy` | `psql -c "CREATE DATABASE <name> TEMPLATE <template>"` (Postgres) | same (Postgres); copy the file (SQLite) | same (Postgres) |
| `analyze:file` | `opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output={out} {file}` and `lizard --csv {file}` | same | same |

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

## Quality budgets

> Optional. The limits of `shark:code-health`. Without this section, the defaults below apply. Delete the section if
> the project has no `analyze:*` row.

| Key | Default | Meaning |
| --- | --- | --- |
| `ccn.warn` | 10 | A new or changed function with a cyclomatic complexity above this gets a warning. |
| `ccn.block` | 20 | Above this, the finding is an error, and `shark:lead-engineer` refuses the merge unless the brief allows it. |
| `ccn.no_increase_over` | 10 | An edit that raises the complexity of a function that is already above this is always reported. |
| `nloc.warn` | 60 | Function length in lines that are not comments. |
| `params.warn` | 5 | Parameter count. |
| `security.block` | `error` | The SARIF level of a security finding that blocks the merge. |
| `digest.max_findings` | 5 | The most findings in one digest. |
| `hook.edit` | `async` | The digest after each edit: `async` (in the background; the agent gets it before it stops), `on` (before its next step; about 2 s for each edit) or `off`. |

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
- Enforced by: the shark hook `deny-secrets`. It reads the two lists above and refuses each tool call on these files
  (Read, Edit, Write, Grep, and Bash commands that name them). Example files (`*.example`, `*.sample`, `*.template`)
  always stay readable. Write `none` in the first list to turn the hook off.
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

These rules come from the build of a production system. Each one prevents a failure that cost hours. The full
methods are in the `shark:operator` references; agents get them in their briefs.

### 1. How a session runs

- **The session harness runs first**, before the first answer. `## Session harness` names it; the default is
  `/shark:operator`.
- **Small and medium work stays in the main session:** a question, a review, or a change with a clear expected
  result in 3 modules or fewer and about 10 files or fewer, with no migration and no unapproved public-interface
  change. The main session checks its own diff against `## Invariants`. Larger work goes to agents:
  `shark:code-writer` writes production code, `shark:code-debugger` finds a cause that is not clear,
  `shark:lead-engineer` merges, and `shark:invariant-guard` checks a diff that touches `## Invariants`.
- **Ask the design question before the build.** When two designs are sensible, or a trade-off changes behaviour,
  latency, cost or data safety, ask the owner with a recommendation. A default that you build on is marked "taken by
  default, owner to confirm".

### 2. Split, timebox, merge

List every known defect first. A contract step comes before parallel lanes; a lane never decides a shared thing
alone. One module and one cause for each lane. Timebox: 20 min for a lane, 5 to 10 min for a one-file writer, 40 min
for a merge, with one grace of 20 %; only the operator extends. A lane checks only its files; one merge for each
round runs `gate:fast`. Costly runs (`gate:full`, `bench`) come last, one time each.

### 3. Worktrees and test databases

Each parallel build gets its own worktree and a test database copied with `test-db:copy` from a migrated template.
Reuse the database between runs; rebuild from zero only after an edited migration. After a merge or a stop, commit,
remove the worktree and drop its test databases.

### 4. Git rules

| Rule | Reason |
| --- | --- |
| Never `git stash`. | A stash in a shared tree takes the work of another agent. |
| Never `--no-verify`. | The hooks are the gate. |
| Never force push. | Other worktrees build on the shared branch. |
| `git branch -d`. Use `-D` only when `git cherry <target> <branch>` prints no `+` line. | `-d` refuses a branch that is not merged. A branch that landed by cherry-pick or rebase is not merged for git, but `git cherry` shows that each of its commits is on the target. |
| `git worktree remove --force` only on a temporary worktree that you made in this run, or when the only extra files are known leftovers that the merge queue names. | `--force` deletes the work that is not committed in that worktree. |
| Push only when the owner asks. | Push is an owner decision ("Owner rules"). |
| Each commit passes the gate on its own. | `git bisect` stays reliable. |
| One reason for each commit; a refactor never in the same commit as a behaviour change. | A review and a revert stay small. |
| Never push a red gate to a shared branch. | Each lane then starts from a failure. |

### 5. Known defects: fix, then report

**Stay in scope.** Do what the request asks. Keep each public interface (a signature, a type or unit, a file or
wire format, a command, a setting name). List the other defects that you find, each with its failure, and fix them
only when the user asks or when the request needs it and the interface stays.

A defect is known when you can state the failure: the inputs, the state, the wrong result. Fix it in the same
session. The regression test comes first; the fix is its own change. Report the defect, its test (failing, then
passing) and the fix. Ask the owner first only when the fix:

- chooses between two behaviours that the spec does not decide;
- changes a business rule or the default of a setting;
- adds a permission or changes the permission matrix;
- adds an external service or a runtime dependency;
- changes a spec or a behaviour that the owner approved;
- changes a public interface. Recommend the smallest fix that keeps it. Never take this change by default.

### 6. Decisions

A newer decision supersedes an older one: never call the older one "wrong", and never delete it. Record the link
both ways, with the date and the scope. Read each row before you mark it superseded.

### 7. Reports

ASD-STE100 (the output style `shark:asd-ste100`), outcome first, each claim labelled observed or inferred, one
recommendation. A report or a diagram is a Markdown file, never a published page. Name the gate that ran, what is
not verified, and each changed file that is not committed.

### 8. Evaluation first

Measure a baseline before you add complexity. A speed change never degrades correctness. A change that drops data or
uses a cheaper model needs a measured A/B result and the owner's OK.

### 9. Deploy

Restart every worker type, also the outbox relay, before or with a migration. A worker that is not restarted runs
old code against the new schema.

### 10. Agent hygiene

Each brief states the timebox, the grace, the gate, the worktree, the test database and the files that the agent
owns. Wait on completion notices, never in a sleep loop. Give unattended agents only allow-listed tools.

### 11. Pitfalls

The pitfalls table (lane, test-database, type-check and wait-loop traps, with the rule for each) is in the
`shark:operator` reference `pitfalls.md`.
