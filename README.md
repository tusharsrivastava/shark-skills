# shark: an orchestration kit for Claude Code

| Item | Value |
| --- | --- |
| Document | Install and conventions guide |
| Status | Draft for review |
| Audience | Engineers who use Claude Code and want to run parallel builds, merges, reviews and debugging with subagents |
| Systems | Plugin `shark` (`.claude-plugin/plugin.json`), marketplace `shark-skills` (`.claude-plugin/marketplace.json`) |
| Related | `AGENTS.md` (the project file to copy), `docs/CONTRACT-v0.1.md` (the build contract of v0.1) |

## 1. What the kit is

`shark` is a Claude Code plugin (a package of agents, skills, MCP servers and output styles that Claude Code loads
as one unit). It gives a session these parts:

- an operator harness;
- parallel build, merge and audit workflows;
- root-cause debugging with a real debugger;
- a design check;
- documents in ASD-STE100.

The skills and the agents contain no project values. They read the commands, the invariants and the owner rules from the `AGENTS.md` (or `CLAUDE.md`) of
the project.

## 2. Components

Claude Code puts the plugin name in front of each name: agent `shark:<agent>`, skill `/shark:<skill>`.

### 2.1 Agents

| Agent | What it does |
| --- | --- |
| `shark:architect` | Senior read-only review of the architecture, the code and its math, for accuracy. Costly: use it for a large design. |
| `shark:lead-engineer` | Merges the branches of parallel lanes, checks them against the round contract, runs `gate:fast`, moves the integration branch. |
| `shark:code-writer` | Implements a spec or a fix spec as production code, test first. |
| `shark:code-debugger` | Finds the root cause of a defect with the debugger, writes a failing regression test and a fix spec. Changes no production code. |
| `shark:doc-writer` | Writes specs (with a quantitative model), design notes, findings reports and runbooks in ASD-STE100. |
| `shark:cookbook-writer` | Writes and checks tutorial chapters (the reading level included). |
| `shark:invariant-guard` | Read-only audit of a diff against the project's `## Invariants` and a stack-neutral default catalogue. Returns findings with `file:line` evidence and a fix spec. Changes no file. |

### 2.2 Skills

| Skill | What it does |
| --- | --- |
| `/shark:operator` | The session harness. Sets the mode (feature, review, debug) and names the agent or skill for each situation. Invoke it first. |
| `/shark:system-design` | Design check: SOLID, refactoring patterns, typed state, one rule in one place, pinned contracts, evaluation first. |
| `/shark:debug-rca` | Steps through the running program with the debugger and writes a root cause analysis from observed values. |
| `/shark:goal-loop` | Fix rounds toward one goal on N failing scenarios: classify, contract, fix in lanes, merge, run again. |
| `/shark:port-audit` | Finds the rules that a rewrite lost, by a static audit of the deleting commits against production. |
| `/shark:patch-fanout` | Ports many independent patch units in parallel, one agent and one branch for each unit. |
| `/shark:lead-merge` | The long-running lead merges patch branches in batches from a queue file. |
| `/shark:merge-audit` | A read-only reviewer checks each merge of the lead against the patch notes and the invariants. |
| `/shark:commit-blocks` | Splits a working tree into conventional commits that each pass the gate (bisectable history). |
| `/shark:handoff` | Records and prunes the handoff file (the state that carries between sessions). |
| `/shark:gitignore` | Makes or refreshes `.gitignore` from gitignore.io templates and keeps the project rules. |
| `/shark:cookbook-writing` | The method and the reading-level script behind `shark:cookbook-writer`. |

### 2.3 Other parts

| Part | File |
| --- | --- |
| Output style `shark:asd-ste100` | `output-styles/asd-ste100.md` |
| Debugger MCP server `mcp-debugger` | `.mcp.json` |
| Project file to copy (best-practice `AGENTS.md`) | `AGENTS.md` |
| Mirror for other tools | `.agents/agents -> ../agents`, `.agents/skills -> ../skills` (relative symlinks) |

## 3. Install

The kit is a local marketplace (a catalogue of plugins that Claude Code reads from a folder or a git repository).
In the commands below, `/path/to/shark-skills` is the absolute path of the kit folder.

1. In Claude Code, add the marketplace:

   ```
   /plugin marketplace add /path/to/shark-skills
   ```

2. Install the plugin:

   ```
   /plugin install shark@shark-skills
   ```

3. Choose the scope when Claude Code asks:

| Scope | Effect | Use it when |
| --- | --- | --- |
| User | The plugin is on in each project on this machine. | You use the kit in all your repositories. |
| Project | The setting goes in `.claude/settings.json` of the repository and is shared with the team. | The team uses the kit in this repository. |
| Local | The setting goes in `.claude/settings.local.json` and is not shared. | You test the kit in one repository. |

For a one-off session with no install, start Claude Code with the plugin folder:

```
claude --plugin-dir /path/to/shark-skills
```

## 4. Update

1. Get the new version of the kit: `git pull` in the kit folder.
2. In Claude Code, run `/plugin marketplace update shark-skills`.
3. Start a new session. A running session keeps the old agents and skills.

## 5. Enable the kit in a repository

Put these keys in `.claude/settings.json` of the repository. A team member who opens the repository then gets
the marketplace and the plugin.

```json
{
  "extraKnownMarketplaces": {
    "shark-skills": {
      "source": { "source": "directory", "path": "/path/to/shark-skills" }
    }
  },
  "enabledPlugins": {
    "shark@shark-skills": true
  },
  "outputStyle": "shark:asd-ste100"
}
```

When the kit gets a git remote, change the source to `{ "source": "git", "url": "<remote URL>" }`.

## 6. Output style

The output style (a system-prompt addition that sets the voice of the main session) is ASD-STE100. Set it for one
session with `/output-style shark:asd-ste100`. Set it for a repository with the `outputStyle` key of section 5.
The agents and the skills write their reports in ASD-STE100 also when the main session has another style.

## 7. Debugger MCP server

`shark:code-debugger` and `/shark:debug-rca` use the `mcp-debugger` server (an MCP server that drives real
step-through debuggers for Python, JS/TS, Go, Rust, Java, .NET and other languages).

- It needs Node.js with `npx` on the `PATH`. `.mcp.json` starts a pinned version with `npx -y`.
- Claude Code starts the server when the plugin is on. If Claude Code asks you to approve the server, approve it
  one time.
- In a plugin, the tool names start with `mcp__plugin_shark_mcp-debugger__`. The skills name the tools by
  function ("set a breakpoint"), not by ID.
- The server writes its log to `.claude/mcp-debugger.log` in the project folder. Add it to `.gitignore`.

## 8. The `.agents/` mirror

Claude Code does not read `.agents/`. The folder holds links to `agents/` and `skills/` for other tools that read
agent and skill files from `.agents/`. Edit the files in `agents/` and `skills/` only; the links follow.

## 9. Adopt the kit in a project

1. Install or enable the plugin (section 3 or section 5).
2. Copy the `AGENTS.md` of the kit root to the root of the repository.
3. Fill each project section: `## Commands`, `## Invariants`, `## Architecture rules`, `## Test scope`,
   `## Secrets`, `## Docs layout`, `## Owner rules`.
4. Keep the section names exactly. The skills find the project values by these names.
5. If the repository has a `CLAUDE.md`, merge the sections into that `CLAUDE.md`, or keep `AGENTS.md` and turn on
   the `claude-md-and-agents-md` setting. Claude Code reads `AGENTS.md` only when there is no `CLAUDE.md`, or with
   that setting.
6. Add a hook that denies access to the secret files of `## Secrets`. The kit does not install one.
7. Start a session and invoke `/shark:operator`.

## 10. Conventions for a new skill or agent

### 10.1 Files

| Part | Path | Frontmatter |
| --- | --- | --- |
| Skill | `skills/<name>/SKILL.md`, with `scripts/` and `references/` if needed | `name`; `description` (what it does, then "Use when …", at most 1024 characters); `allowed-tools` (optional) |
| Agent | `agents/<name>.md` | `name`; `description`; `tools`; `model` (`sonnet` for `code-writer`, `opus` for the others) |

Do not put `hooks`, `mcpServers` or `permissionMode` in the frontmatter of an agent. Claude Code ignores them in a
plugin. An MCP server goes in `.mcp.json`.

### 10.2 Content rules

- **No project values.** No project names, tenant names, people, repository names, paths, URLs, decision IDs or
  incident dates. A lesson keeps its substance, not its story.
- **No stack lock-in.** A stack fact is a labelled example for at least two stacks, for example "(Python:
  `pytest -k`, JS: `vitest run`, Go: `go test ./...`)".
- **Project values come from `AGENTS.md`.** Write "run the project's `gate:fast` (AGENTS.md › Commands)", never a
  literal command. If the section is missing, the skill asks the user one time and recommends that the user adds
  it.
- **Names with the namespace.** Refer to the other parts as `shark:code-writer` (agent) and `shark:commit-blocks`
  (skill).
- **Tools by function.** Write "set a breakpoint with the mcp-debugger tools", not a tool ID.
- **Voice.** Reports and documents in ASD-STE100: outcome first, observed and inferred claims labelled, Markdown
  files with full paths, never published pages.
- **Timebox.** Each agent brief states the timebox and the grace rule (`AGENTS.md`, Working rules §2).

### 10.3 Add the part to the kit

1. Write the file in `agents/` or `skills/`.
2. Add one row to the table of section 2.
3. Test it with `claude --plugin-dir <kit folder>` in a project that has a filled `AGENTS.md`.
4. Raise the `version` in `.claude-plugin/plugin.json`.
