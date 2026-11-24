---
name: init
description: Sets up a repository, or a multi-repo workspace, for shark one time. Adds the missing template sections to CLAUDE.md or AGENTS.md with values from the repository, the Working rules block, one session start rule, and the shark:asd-ste100 output style. In a folder that is not a repository, it can set up a workspace that manages several repositories (inside it or next to it), and asks for their paths or URLs. Keeps existing text. Use when the user says init or set up shark, or after a kit update.
---

# Init

This skill makes the project file of a repository follow the shark template. Run it one time for each project. Run
it again after a kit update: a second run on an unchanged template changes nothing.

It also sets up a **multi-repo workspace**: a folder, with its own git repository and no remote, that holds the
shared project file of several repositories. The repositories are inside the workspace or next to it (for example
`../api`). Step 0 decides which procedure applies.

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
6. **Exactly one start rule.** After the run, the project file has one instruction about what runs first in a
   session. Never add a second one next to an orchestrator that the project already uses.
7. **Never invent a repository.** In a workspace, use only the repositories that the scan finds and the user picks,
   and the paths and URLs that the user gives. Run `git init` and `git clone` only after a yes.

## Procedure

### 0. Repository or workspace

Run the scan in the folder where the session runs:

```bash
node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/workspace.mjs" scan
```

| `kind` | Meaning | Action |
| --- | --- | --- |
| `repository` | The root of a git repository | Steps 1 to 9 on this repository. |
| `inside-repository` | A subfolder of a git repository | Steps 1 to 9 on the repository root. Tell the user. |
| `project` | No git, but the build file of one project (`markers`) | Steps 1 to 9 on this folder. |
| `workspace` | Empty, or it holds git repositories (`repos`), or its project file has `## Repositories` | Ask: "Set up this folder as a multi-repo workspace?" On a yes, do [Workspace mode](#workspace-mode). On a no, steps 1 to 9. |
| `folder` | None of these | Ask the user if it is one project or a workspace. |

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

If you find one, ask the user which one leads. Put the question in the message of step 6. Name the orchestrator and
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
| Has a different `outputStyle` | Ask in the message of step 6. Quote the current value. Recommend `shark:asd-ste100`. Change it only after a yes. |

Also read `.claude/settings.local.json`, if it exists. Its `outputStyle` overrides the shared file for one user. Do
not change that file: it is personal. If it sets a different style, name it in the report.

If git ignores `.claude/settings.json` (`git check-ignore -q .claude/settings.json` exits with `0`), the setting
stays on this machine only. Name this in the report.

### 6. Ask for the rest

Send one message with every value that is still unknown. Use a table: section, item, suggested value, why. Use the
answer for the rest of the run.

### 7. Plan the Working rules block

Do not write the block in this step. Check the target with the script, and choose the action:

```bash
"${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/working-rules.sh" check <target>
```

| Exit code | Meaning | Action |
| --- | --- | --- |
| `0` | The block is the same as the template. | Change nothing. |
| `3` | The target has no block. | Add it in step 8 with `working-rules.sh apply <target>`. |
| `1` | The block differs. | Show `working-rules.sh diff <target>`. A project can make a rule stricter. Ask the user which lines to keep. Never replace the block without a yes. |

If the target already has a `## Working rules` section with no markers, do not add a second one. Show the
difference against `working-rules.sh print`, and ask the user how to merge.

The first Working rule says that the session harness runs first. The `## Session harness` section names it.

### 8. Write and check

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
3. Run `working-rules.sh check <target>` again. Expect exit code `0`, or `1` when the user kept a stricter rule. If
   it gives `3`, the block is missing: add it again as in step 2, and check again.
4. Check that each of the eight section headings occurs one time in the target.
5. Check that the target has one start rule only: the `## Session harness` section, and no other "first" instruction
   that names a different skill (unless the user chose "Theirs leads", where the existing rule and the section name
   the same skill).
6. Check that `.claude/settings.json` is valid JSON and that its `outputStyle` is the value that the user agreed:
   `node -e 'console.log(JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8")).outputStyle)'`.

### 9. Report

Report in ASD-STE100: outcome first. Name:

- the target file, and each section and row that you added;
- the session harness that leads, and the orchestrator that you found, if any;
- the output style in `.claude/settings.json`, a different style in `.claude/settings.local.json`, and whether git
  ignores the shared settings file;
- each value that is a suggestion and that the user did not confirm;
- the next steps for the user:
  - start a new session, so that Claude Code reads the new project file and the output style;
  - check the two lists in `## Secrets`: the `deny-secrets` hook of the kit reads them and refuses tool calls on those
    files;
  - add `.claude/mcp-debugger.log` to `.gitignore` (`shark:gitignore` can do this).

Do not commit the files.

## Workspace mode

A workspace holds the shared rules of several repositories. Its project file names the repositories. Each repository
keeps its own project file for its own values (commands, gates, secrets, architecture rules); that file wins for work
in that repository. Both secret lists apply: the `deny-secrets` hook reads the workspace file and the file of the
repository that holds each path.

### W1. Get the repositories

| Scan result | Action |
| --- | --- |
| `empty: true` | Do not search. Ask the user for the repositories to manage: a folder path for each repository that exists (inside the workspace or next to it, for example `../api`), or a git URL to clone into the workspace. |
| `repos` not empty | Show the found repositories (path, remote). Ask which ones to manage. The user can add more paths or URLs. |
| `empty: false`, no `repos` | Tell the user that you found no repository, and ask as for an empty workspace. |

Ask in one message, together with the questions of W2. Then check every path that the user gave:

```bash
node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/init/scripts/workspace.mjs" check <path>...
```

A path with `ok: false` is not used. Tell the user its `reason`, and ask one time for a correct path.

For each URL: the folder name is the last part of the URL without `.git`, unless the user gives one. A folder with
that name must not exist. After the yes of W3, clone it: `git clone <url> <name>` in the workspace, one clone in
each Bash command. A failed clone stops only that repository: report it, and continue with the others.

### W2. Values to ask for

In the same message as W1, ask for the values that you cannot find. Give a suggestion for each:

- a short role for each repository (for example "backend API", "web app");
- the rules that cross repositories, for `## Invariants` (for example "the web app uses only the API contract in
  `api/openapi.yaml`"). Do not guess; suggest none when the user gives none;
- the session harness (step 4 of the procedure, on the workspace folder);
- the owner rules (the template defaults).

### W3. Show the plan, then write after a yes

Show the summary: `git init` (when `gitInit` is false; no remote), the clones, the workspace project file, the
`.claude/settings.json` change, the `.gitignore` lines. Write after the user says yes, in this order:

1. `git init` in the workspace, when `gitInit` is false. Do not add a remote. When the scan gives
   `outerRepository`, the workspace is inside another repository: say so in the summary. The workspace becomes a
   repository of its own inside it. Do not change the outer repository; tell the user that it can ignore the
   workspace folder.
2. The clones of W1.
3. The project file of the workspace (step 1 chooses the target: `AGENTS.md` when the folder has none). Write these
   sections, with the values of W1 and W2. A section that exists stays as it is; add only the rows that are missing
   in `## Repositories`.

   ```markdown
   # AGENTS.md: <workspace name> workspace

   ## Repositories

   This folder is a multi-repo workspace. Each repository's own project file (AGENTS.md or CLAUDE.md) gives its
   commands, gates, secrets and architecture rules, and wins for work in that repository. Read it before you work
   in a repository. The Working rules and the secret lists of both files always apply. Each repository has its own
   git history: commit, branch and open pull requests in the repository, never in the workspace.

   | Name | Path | Remote | Role |
   | --- | --- | --- | --- |
   | <name> | `<path from the check>` | <remote, or none> | <role> |

   ## Invariants
   ## Secrets
   ## Docs layout
   ## Owner rules
   ## Session harness
   ```

   Fill `## Invariants`, `## Secrets`, `## Docs layout`, `## Owner rules` and `## Session harness` as in steps 3 and 4
   (`## Secrets`: the template default list; `## Docs layout`: the handoff file and the decisions log in the
   workspace). Do not add `## Commands`, `## Architecture rules` or `## Test scope`: they belong to each repository.
4. `working-rules.sh apply <target>`, as in step 8.
5. `.claude/settings.json` of the workspace, with the Edit tool (the Write tool for a new file), keeping every other
   key: the `outputStyle` of step 5, and each repository outside the workspace (`inside: false`) in
   `permissions.additionalDirectories`, with the path from the check. Without it, a session in the workspace cannot
   read or edit that repository.

   ```json
   {
     "outputStyle": "shark:asd-ste100",
     "permissions": { "additionalDirectories": ["../api", "../web"] }
   }
   ```

6. `.gitignore` of the workspace, with the Edit tool (the Write tool for a new file): one line `/<path>/` for each
   repository inside the workspace, so that the workspace repository does not track it.

### W4. Check

1. `working-rules.sh check <target>` gives `0`.
2. The target has `## Repositories` one time, with one row for each repository, and one start rule.
3. `workspace.mjs check <each path of the table>` exits `0`.
4. `.claude/settings.json` is valid JSON, and `permissions.additionalDirectories` names each repository outside the
   workspace.

### W5. Each repository

Ask one time: "Set up the project file of each repository now?" For each repository that the user picks, do steps 1
to 9 with the repository root as the root. Its `## Session harness` names the same harness as the workspace, so that
there is one start rule. The repository file is complete (Working rules included), because a session can also start
in the repository alone. Its values win for that repository.

### W6. Report

As in step 9, and also: the workspace folder and whether you ran `git init`, the repositories (path, remote, cloned
or found), each repository outside the workspace in `additionalDirectories`, the `.gitignore` lines, and the
repositories that are not set up yet. Tell the user to start the next session in the workspace folder.

Do not commit the files: not in the workspace, and not in a repository.
