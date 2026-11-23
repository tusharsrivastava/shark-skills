---
name: init
description: Sets up a repository for shark one time. Adds the missing template sections to CLAUDE.md or AGENTS.md with values from the repository, the Working rules block, one session start rule, and the shark:asd-ste100 output style. Checks and sets up the tools behind the hooks, the guards and the debugger for the languages of the project (debug adapters, code-health analyzers, rules and baseline). Keeps existing text. Use when the user says init, set up shark or check the shark tools, or after a kit update.
---

# Init

This skill makes the project file of a repository follow the shark template, and makes the tools work that the
shark hooks, guards and debugger need in this project. Run it one time for each project. Run it again after a kit
update: a second run on an unchanged template changes nothing.

The plugin loads its hooks (`deny-secrets`, `wide-commits`, `health-edit`) and its MCP server (`mcp-debugger`) by
itself. They work only when the project gives them what they read: the `## Secrets` lists, the `analyze:*` rows,
the rules in `.shark/rules/`, a debug adapter for each language. The check script `doctor.mjs` (step 6) finds what is
missing and gives the pinned fix for each item.

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
5. **Do not commit.** Tell the user which files changed. The commit is a decision of the user.
6. **Install only after a yes, and only the commands that `doctor.mjs` prints.** They are pinned. Never install
   Opengrep from PyPI (a malicious package uses the name), never use `sudo`, and never install a Python debug
   adapter outside the project environment. When the user says "do not install", list the commands and install
   nothing.
7. **Exactly one start rule.** After the run, the project file has one instruction about what runs first in a
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
| Secrets | `.env.example`, `.gitignore` rules for env files, the loader (docker compose `env_file`, direnv, a settings module). Write "Enforced by: the shark hook `deny-secrets`", unless the project has its own hook. The hook always allows example files (`*.example`, `*.sample`, `*.template`), so agents can read the setting names. |
| Docs layout | The `docs/` tree, a decisions log, a handoff file |
| Invariants | Do not guess. Suggest the template examples that fit the code (for example "Money" when the code has prices), and ask. |
| Owner rules | Do not guess. Suggest the template defaults ("Push only when the owner asks", the 10-minute rule for long checks). |
| `analyze:file`, `analyze:full` | Take the rows that `doctor.mjs` gives (step 6). Keep existing analyzer rows. |
| `analyze:diff` | `none`, unless the project has its own diff scanner. |
| `arch:check` | The row that `doctor.mjs` gives when the project configures import-linter, dependency-cruiser or depguard. Else `none`. |

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

If you find one, ask the user which one leads. Put the question in the message of step 7. Name the orchestrator and
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

### 5. Set the output style

The kit ships the output style `shark:asd-ste100`. The skills and agents write their reports for it. Set it for the
project in `.claude/settings.json`, the settings file that the team shares:

```json
{
  "outputStyle": "shark:asd-ste100"
}
```

| `.claude/settings.json` | Action |
| --- | --- |
| Does not exist | Make it with only the `outputStyle` key. |
| Exists, with no `outputStyle` key | Add the key. Keep every other key and its value. |
| Has `"outputStyle": "shark:asd-ste100"` | Change nothing. |
| Has a different `outputStyle` | Ask in the message of step 7. Quote the current value. Recommend `shark:asd-ste100`. Change it only after a yes. |

Also read `.claude/settings.local.json`, if it exists. Its `outputStyle` overrides the shared file for one user. Do
not change that file: it is personal. If it sets a different style, name it in the report.

If git ignores `.claude/settings.json` (`git check-ignore -q .claude/settings.json` exits with `0`), the setting
stays on this machine only. Name this in the report.

### 6. Check the tools

Run the check script:

```bash
node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/doctor.mjs" --no-smoke
```

It finds the languages of the repository and checks each part. It installs and writes nothing.

| Area | Items |
| --- | --- |
| debugger | The `mcp-debugger` server in the npm cache; `.claude/mcp-debugger.log` in `.gitignore`; the debug adapter of each language (Python: `debugpy` in the project environment; JS/TS: Node 18 or later; Go: Delve) |
| code-health | Opengrep (the fixed version or later) and Lizard; the starter rules for each language in `.shark/rules/`; the `analyze:file` and `analyze:full` rows; the baseline |
| guards | The `## Secrets` lists (`deny-secrets`), the `## Invariants` rules (`shark:invariant-guard`), the `arch:check` row |

Each row has a status (`ok`, `warn`, `missing`, `fail`) and, when it is not ok, the fix and its scope. Exit code `0`:
nothing missing. Exit code `1`: one or more items are missing or failed. Put the fixes in the message of step 7, in
three groups:

1. **Installs** (each with its scope: the project environment, the user tool folder, the npm cache).
2. **Files** that init adds: the starter rules in `.shark/rules/`, the `.gitignore` line.
3. **Rows** that init adds to `## Commands`.

A `warn` is not a blocker. Name it in the report (for example "no starter rules for Go: Lizard checks complexity
only"). A language that the script does not check gets "not verified" in the report, never "ok".

The `mcp-debugger` tools can also be checked in the session: search the deferred tools for `mcp-debugger`. Do not
start a debug session in init.

### 7. Ask for the rest

Send one message with every value that is still unknown, and the fixes of step 6. Use a table: section, item,
suggested value, why. Recommend each fix. Use the answer for the rest of the run.

### 8. Plan the Working rules block

Do not write the block in this step. Check the target with the script, and choose the action:

```bash
"${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/working-rules.sh" check <target>
```

| Exit code | Meaning | Action |
| --- | --- | --- |
| `0` | The block is the same as the template. | Change nothing. |
| `3` | The target has no block. | Add it in step 9 with `working-rules.sh apply <target>`. |
| `1` | The block differs. | Show `working-rules.sh diff <target>`. A project can make a rule stricter. Ask the user which lines to keep. Never replace the block without a yes. |

If the target already has a `## Working rules` section with no markers, do not add a second one. Show the
difference against `working-rules.sh print`, and ask the user how to merge.

The first Working rule says that the session harness runs first. The `## Session harness` section names it.

### 9. Write, set up the tools, and check

1. Show the summary: the target file, the sections added, the rows added, the Working rules action, and the
   output style action.
2. After the user says yes, write the files in this order:
   1. Write the project sections to the target (the Write tool for a new file, the Edit tool for an existing one).
   2. Then run `working-rules.sh apply <target>`. It adds the block at the end of the target, and it is the last
      write to the target. Do not write the block yourself, except as in step 3. Do not use the Write tool on the target after
      `apply`: a Write replaces the whole file and removes the block. If you must change a section after `apply`,
      use the Edit tool.
   3. If `apply` exits with `2`, the shell cannot write the file (for example in a sandbox). Then run
      `working-rules.sh print`, and add its output, unchanged, at the end of the target with the Edit tool: replace
      the last line of the target with that line, a blank line, and the block. Do not retype or shorten the block.
   4. Change `.claude/settings.json` with the Edit tool (or the Write tool for a new file), not with a script, so
      that its other keys and its format stay the same.
   5. Add the starter rules with the command that step 6 named (`health.mjs rules add`: it copies the rules for the
      languages of the project to `.shark/rules/` and keeps a rule file that exists). Add the `.gitignore` line
      with the Edit tool (or the Write tool when there is no `.gitignore`).
   6. Run the install commands that the user approved, one at a time, exactly as `doctor.mjs` printed them.

   Run one action in each Bash command; do not chain writes with `&&`. When a write or a command fails or is
   refused, stop only that item: keep its error for the report, and continue with the next item and with the
   checks below.
3. Run `working-rules.sh check <target>` again. Expect exit code `0`, or `1` when the user kept a stricter rule. If
   it gives `3`, the block is missing: add it again as in step 2, and check again.
4. Check that each of the eight section headings occurs one time in the target.
5. Check that the target has one start rule only: the `## Session harness` section, and no other "first" instruction
   that names a different skill (unless the user chose "Theirs leads", where the existing rule and the section name
   the same skill).
6. Check that `.claude/settings.json` is valid JSON and that its `outputStyle` is the value that the user agreed:
   `node -e 'console.log(JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8")).outputStyle)'`.
7. Run `doctor.mjs` again, without `--no-smoke`. The smoke check runs `analyze:file` on one source file of each
   language. Each item that was fixed must now be `ok`.
8. When the analyze rows and the analyzers are `ok`, record the baseline:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/code-health/scripts/health.mjs" baseline record
   ```

   It writes `.shark/health-baseline.json` with the findings that exist now, so that the hook shows only new ones.
   Give its counts in the report. Do not record a baseline when an analyzer is missing or failed: a baseline with a
   missing analyzer hides nothing and misleads the next run.

### 10. Report

Report in ASD-STE100: outcome first. Name:

- the target file, and each section and row that you added;
- the session harness that leads, and the orchestrator that you found, if any;
- the output style in `.claude/settings.json`, a different style in `.claude/settings.local.json`, and whether git
  ignores the shared settings file;
- each value that is a suggestion and that the user did not confirm;
- the final `doctor.mjs` result, as a table: item, status (the word that the script printed: `ok`, `warn`,
  `missing`, `fail`, or "not verified" when the script did not check it), and the fix command. Give each install
  that ran with its version. Never call a tool ready when the last check did not show it as `ok`;
- the baseline counts, and that `.shark/health-baseline.json` and `.shark/rules/` are for the user to commit;
- the next steps for the user:
  - start a new session, so that Claude Code reads the new project file and the output style;
  - check the two lists in `## Secrets`: the `deny-secrets` hook of the kit reads them and refuses tool calls on those
    files;
  - run `doctor.mjs` again after a new language or a new machine.

Do not commit the files.
