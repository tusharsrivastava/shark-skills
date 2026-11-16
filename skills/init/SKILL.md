---
name: init
description: Sets up a repository for the shark kit, one time for each project. Finds the project file that Claude Code reads (CLAUDE.md or AGENTS.md, or makes AGENTS.md), adds the missing project sections of the shark template (Commands, Invariants, Architecture rules, Test scope, Secrets, Docs layout, Owner rules, Session harness) with values found in the repository, and adds the Working rules block between markers. It keeps all existing text. It detects an orchestrator that the project already uses and asks which one leads, so the file never has two start rules. By default the Session harness makes Claude load shark:operator at the start of each session. Use when the user says "init", "set up shark", "adopt shark", "configure this repo for shark", when a project has no AGENTS.md or CLAUDE.md sections that the shark skills need, or after a kit update to refresh the Working rules.
---

# Init

This skill makes the project file of a repository follow the shark template. Run it one time for each project. Run
it again after a kit update: a second run on an unchanged template changes nothing.

The template is `${CLAUDE_PLUGIN_ROOT}/AGENTS.md`. Read it first. It has three parts:

| Part | Lines | What init does with it |
| --- | --- | --- |
| "How to use this file" | From the top to the first `---` | Nothing. It is for people who copy the file by hand. |
| Project sections | `## Commands` to `## Session harness` | Adds each missing section, with values from the repository. |
| `## Working rules` | To the end of the file | Adds it between markers, word for word, with the script. |

## Rules

1. **Never remove or rewrite text that is already in the project file.** Only add sections, rows and the marked
   block. If an existing section has a name that is near a template name (for example `## Build commands`), ask the
   user if it is the same section. Do not rename it without a yes.
2. **Never read a secret file.** Do not open `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, or files that the
   project's `## Secrets` section names. Find the setting names from `.env.example` or from the code, never from
   the secret file.
3. **Ask one time.** Collect every value that you cannot find, and ask for all of them in one message. Give a
   suggested value for each. Do not ask again in the same run.
4. **Show the change before you write it.** Show a short summary and the new sections. Write only after the user
   says yes.
5. **Do not commit.** Tell the user which file changed. The commit is a decision of the user.
6. **Exactly one start rule.** After the run, the project file has one instruction about what runs first in a
   session. Never add a second one next to an orchestrator that the project already uses.

## Procedure

### 1. Choose the project file

Claude Code reads `CLAUDE.md`. It reads `AGENTS.md` only when there is no `CLAUDE.md`, or when the
`claude-md-and-agents-md` setting is on.

| The repository root has | Target |
| --- | --- |
| `CLAUDE.md` only | `CLAUDE.md` |
| `AGENTS.md` only | `AGENTS.md` |
| Both, and `CLAUDE.md` imports `AGENTS.md` (a line `@AGENTS.md`) | `AGENTS.md` |
| Both, with no import | Ask the user. Recommend `CLAUDE.md`, because Claude Code always reads it. |
| Neither | Make `AGENTS.md`, with the title `# AGENTS.md: <project name>` |

If the target has changes that are not committed, tell the user before you change it.

### 2. Find the sections that are missing

Find each project section by its exact heading: `## Commands`, `## Invariants`, `## Architecture rules`,
`## Test scope`, `## Secrets`, `## Docs layout`, `## Owner rules`, `## Session harness`. A section that exists stays
as it is.

In an existing `## Commands` table, find the keys that are missing. Add only those rows.

### 3. Find the values in the repository

Read only the build and configuration files. Each value that you find is a suggestion. The user confirms it.

| Value | Where to look (examples for more than one stack) |
| --- | --- |
| Commands | `package.json` scripts, `Makefile`, `justfile`, `Taskfile.yml`, `pyproject.toml`, `tox.ini`, `noxfile.py`, `go.mod` with `go test`, `Cargo.toml`, the CI workflow files |
| `gate:fast` | The fast checks of CI: lint, type check, unit tests. Not the integration tests. |
| `gate:full` | All the CI jobs, with the integration tests |
| Architecture rules | An import-linter, dependency-cruiser, ESLint `no-restricted-imports` or depguard configuration; the top-level source folders |
| Secrets | `.env.example`, `.gitignore` rules for env files, the loader (docker compose `env_file`, direnv, a settings module) |
| Docs layout | The `docs/` tree, a decisions log, a handoff file |
| Invariants | Do not guess. Suggest the template examples that fit the code (for example "Money" when the code has prices), and ask. |
| Owner rules | Do not guess. Suggest the template defaults ("Push only when the owner asks", the 10-minute rule for long checks). |

For a key that the project does not use (for example `test-db:copy` or `bench`), write `none`.

Do not copy the guidance lines (`>`) or the "Examples by stack" tables of the template into the project file. Copy
only the table structure and the project values.

### 4. Find an existing orchestrator

Some projects already run their own session harness: an orchestration loop, a conductor skill, or a workflow that
starts each session. Look for:

| Sign | Where |
| --- | --- |
| A start rule: "run `/x` first", "at the start of every session", "always begin with" | The target file, and `CLAUDE.md`, `AGENTS.md` and their imported files |
| A `SessionStart` hook | `.claude/settings.json`, `.claude/settings.local.json` |
| A skill or agent whose job is to run the session (names such as `orchestrat*`, `conductor`, `loop`, `operator`, `workflow`) | `.claude/skills/`, `.claude/agents/`. Read its description. |

If you find none, the `## Session harness` section gets the template default: "Invoke `/shark:operator` first,
before the first answer."

If you find one, ask the user which one leads. Put the question in the message of step 5. Name the orchestrator and
quote the rule or file where you found it. Give these choices:

| Choice | `## Session harness` text | The existing start rule |
| --- | --- | --- |
| **Theirs leads, shark on call** (recommended: it keeps the workflow that the team has) | "This project's session harness is `/x`. Use `/shark:operator` only when the user asks, or when `/x` hands work to it. The shark agents and skills stay available. Working rules §1 (How a session runs) apply only while `/shark:operator` runs; the other Working rules apply to all work." | Stays as it is. |
| **shark leads** | "Invoke `/shark:operator` first, before the first answer. The operator may hand a task to `/x` when the task fits it." | Must change, so that there is one start rule. Show the exact old line and the new line, and change it only after a yes. |
| **Split by mode** | "Use `/x` for <the work the user names>. Use `/shark:operator` for <the rest>. Ask the user when a request fits both." | Stays, if it does not say "always first". If it does, handle it as in "shark leads". |

When an existing `## Session harness` section names a harness, keep it. Do not ask again.

When **shark** leads, check the description of the orchestrator's own skill or agent file. If it says "use at the
start of every session" or similar, tell the user to change that phrase (for example to "Use when the operator
hands a task to it"). Do not change that file yourself: it is not the project file.

### 5. Ask for the rest

Send one message with every value that is still unknown. Use a table: section, item, suggested value, why. Use the
answer for the rest of the run.

### 6. Add the Working rules block

Check the target with the script:

```bash
"${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/working-rules.sh" check <target>
```

| Exit code | Meaning | Action |
| --- | --- | --- |
| `0` | The block is the same as the template. | Change nothing. |
| `3` | The target has no block. | Add the output of `working-rules.sh print` at the end of the target. |
| `1` | The block differs. | Show `working-rules.sh diff <target>`. A project can make a rule stricter. Ask the user which lines to keep. Never replace the block without a yes. |

If the target already has a `## Working rules` section with no markers, do not add a second one. Show the
difference against `working-rules.sh print`, and ask the user how to merge.

The first Working rule says that the session harness runs first. The `## Session harness` section names it.

### 7. Write and check

1. Show the summary: the target file, the sections added, the rows added, and the Working rules action.
2. After the user says yes, write the file.
3. Run `working-rules.sh check <target>` again. Expect exit code `0`, or `1` when the user kept a stricter rule.
4. Check that each of the eight section headings occurs one time in the target.
5. Check that the target has one start rule only: the `## Session harness` section, and no other "first" instruction
   that names a different skill (unless the user chose "Theirs leads", where the existing rule and the section name
   the same skill).

### 8. Report

Report in ASD-STE100: outcome first. Name:

- the target file, and each section and row that you added;
- the session harness that leads, and the orchestrator that you found, if any;
- each value that is a suggestion and that the user did not confirm;
- the next steps for the user:
  - start a new session, so that Claude Code reads the new project file;
  - add a hook that blocks access to the files of `## Secrets` (the kit does not install one);
  - add `.claude/mcp-debugger.log` to `.gitignore` (`shark:gitignore` can do this).

Do not commit the file.
