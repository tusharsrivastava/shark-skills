<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img alt="shark" src="assets/logo-light.png" width="520">
  </picture>
</p>

<p align="center"><b>Running Claude Code like an engineering team: one operator, parallel lanes, audited merges.</b></p>

<p align="center">
  <a href="https://github.com/tusharsrivastava/shark-skills/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/tusharsrivastava/shark-skills?style=flat&color=0e7490"></a>
  <a href="https://github.com/tusharsrivastava/shark-skills/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/tusharsrivastava/shark-skills?style=flat&color=0e7490"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0e7490?style=flat"></a>
  <a href="https://docs.claude.com/en/docs/claude-code/plugins"><img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude_Code-plugin-0e7490?style=flat&logo=claude&logoColor=white"></a>
</p>

<p align="center">
  <a href="#installation-2-minute-setup">Install</a> •
  <a href="#why-shark-exists">Why <b>shark</b></a> •
  <a href="#reference">Reference</a> •
  <a href="#contributing">Contributing</a>
</p>

---

**My Claude Code setup for building real features with a team of agents.**

Using a single Claude Code session for a small fix works fine. Using it for a real feature usually turns into a mess
of conflicting edits, silently dropped rules during merges, half-baked bug patches, and a giant commit at the end.

Throwing more agents at it doesn't fix that on its own. Parallel agents with no shared plan just make code messier, faster.

**shark** is what I ended up with after building a production system this way.

The main session never writes code. It becomes the **operator**: it briefs the subagents, checks what they hand
back, and talks to you. Lanes build in parallel against one shared contract. Every merge gets audited, and every bug
gets a root cause before it gets a fix.

Every rule in here exists because breaking it cost me hours. Steal them. Change them. Make them stricter for your
project.

## See It in Action

<p align="center">
  <img alt="shark setup: install the plugin, run /shark:init, and a new session loads the operator by itself" src="assets/demo.gif" width="100%">
  <br>
  <sub>A real session, recorded with <a href="https://asciinema.org">asciinema</a>.</sub>
</p>

## Installation (2-minute setup)

### 1. Get the plugin

In Claude Code:

```text
/plugin marketplace add tusharsrivastava/shark-skills
/plugin install shark@shark-skills
```

You'll also need git, and Node.js with `npx`. The debugger MCP server runs through it.

<details>
<summary><strong>Try it without installing</strong></summary>

```bash
git clone https://github.com/tusharsrivastava/shark-skills
claude --plugin-dir ./shark-skills
```

</details>

<details>
<summary><strong>Turn it on for your whole team</strong></summary>

Add this to `.claude/settings.json` in your repo. Everyone who opens the repo gets the plugin.

```json
{
  "extraKnownMarketplaces": {
    "shark-skills": { "source": { "source": "github", "repo": "tusharsrivastava/shark-skills" } }
  },
  "enabledPlugins": { "shark@shark-skills": true },
  "outputStyle": "shark:asd-ste100"
}
```

To update, run `/plugin marketplace update shark-skills` and start a new session.

</details>

### 2. Run `/shark:init`

You only need to configure it once per project. In your repo, run:

```text
/shark:init
```

It will:

- Find your `AGENTS.md` or `CLAUDE.md`, or create an `AGENTS.md` if you have neither
- Add the sections **shark** needs (commands, invariants, architecture rules, test scope, secrets, docs layout,
  owner rules and session harness) and the working rules, without touching what you already have
- Notice if you already run your own orchestrator, and ask which one leads, so your file never gets two start rules
- Ask for each value it can't find, with a suggested value for each
- Set the project's output style to `shark:asd-ste100` in `.claude/settings.json`, so replies are short, outcome-first
  and end with a summary and action items

The skills never hardcode a command. They run a key from your `Commands` table, so the same kit works on Python,
JS/TS, Go, or anything with a test command.

<details>
<summary>Example</summary>

```markdown
| Key | Command | Limit or note |
| --- | --- | --- |
| `gate:fast` | `pnpm lint && pnpm tsc --noEmit && vitest run` | At most 5 min. |
| `test <paths>` | `vitest run <paths>` | |
```

When a skill says "run `gate:fast`", this is the line it runs.

</details>

> [!TIP]
> After `/shark:init`, your project file tells Claude to load `/shark:operator` at the start of each session. You
> don't need to type it every time, and your session becomes a full-fledged engineering team. Already use your own
> orchestration loop? Keep it in charge, and **shark** stays on call.

<details>
<summary>Prefer to set it up by hand?</summary>

Copy [`AGENTS.md`](AGENTS.md) to your repo root and fill in the sections at the top. Already have a `CLAUDE.md`?
Merge the sections into it. Claude Code only reads `AGENTS.md` when there's no `CLAUDE.md`, or when the
`claude-md-and-agents-md` setting is on.

</details>

### 3. That's it. You're running a team now.

## Why **shark** Exists

Before building **shark**, I built [baseline](https://github.com/friedbotstudio/baseline), but it became too bulky
for newer and improved coding models. **shark** skills are lean, and they scale in parallel without impacting the
code quality I yearn for.

**shark** turns your harness into a lean, mean coding machine.

### #1: The Agents Stepped On Each Other

> "Adding manpower to a late software project makes it later."
>
> Fred Brooks, _The Mythical Man-Month_

**The Problem**: You run three agents in parallel. It looks three times faster. Then you merge. Two agents changed
the name of the same function. A third agent made its own version of an event. The merge takes a third of your
afternoon.

**The Fix**: Write a contract before you split the work. One agent writes the round contract in 5 to 10 minutes.
The contract gives each shared name one owner file. It lists each writer and each reader of each event. It sets the
boundaries of each lane. Each lane reads the contract first. When a lane finds a shared item, it stops and reports.
It does not decide alone.

- [`/shark:operator`](./skills/operator/SKILL.md) does the contract step and writes the briefs.
- [`shark:code-writer`](./agents/code-writer.md) builds one lane in its own worktree. It writes the test first.
- [`shark:lead-engineer`](./agents/lead-engineer.md) merges the lanes. It checks each lane against the contract.

### #2: A Refactor Missed Some Business Rules

> "If you don't see the use of it, I certainly won't let you clear it away."
>
> G.K. Chesterton, _The Thing_

**The Problem**: Rules hide in small places: a guard clause, a branch in a helper, a check from an old incident. A
rewrite or a merge removes one of them. All the tests still pass. You find the problem in production.

**The Fix**: Write your invariants one time. Then check each diff against them. Do not remove a rule until you know
why it is there.

- [`shark:invariant-guard`](./agents/invariant-guard.md) compares a diff with your `## Invariants`. It reports each
  break with `file:line` evidence. It is read-only, so it cannot change your code.
- [`/shark:merge-audit`](./skills/merge-audit/SKILL.md) checks each merge against the patch notes. A different
  agent does the audit, not the agent that did the merge.
- [`/shark:port-audit`](./skills/port-audit/SKILL.md) finds the rules that a rewrite removed.
  [`/shark:patch-fanout`](./skills/patch-fanout/SKILL.md) puts them back, in parallel.

<details>
<summary>Example invariants</summary>

- **Tenant isolation.** Each query on tenant data runs inside a tenant context.
- **Money.** Money is an integer of minor units with a currency. Never a float.
- **Idempotency.** A retried request with the same key gives the same result. It makes one change only.
- **One unit of work.** A write, its event and its job commit in one transaction.

</details>

### #3: Production Is On Fire And You're On The Call

> "Quit thinking and look."
>
> David J. Agans, _Debugging: The 9 Indispensable Rules_

**The Problem**: You ask an agent to fix a bug. The agent reads the code and makes a guess. It changes the code at
the symptom. Two days later, the bug occurs again with a new stack trace.

**The Fix**: Find the cause first. Fix it second. Two different agents do these two tasks.

[`shark:code-debugger`](./agents/code-debugger.md) runs your program in a real step-through debugger (Python,
JS/TS, Go, Rust, Java, .NET, C/C++). It records the real values. It gives you three items: the root cause, a
failing regression test, and a fix spec. Then `shark:code-writer` changes the production code.

A bug report with one symptom takes the direct path: a failing test first, then the fix. A report with two or more
symptoms, or a defect in twin code paths, gets more. The operator writes the properties that the report breaks,
plus four default properties (scope isolation, guard preservation, twin equivalence, input forms). It splits them
into zones, and one `shark:code-debugger` investigates each zone in parallel, in its own copy of the repository. A
merge debugger combines the zones and closes the spec with [`/shark:solution-spec`](./skills/solution-spec/SKILL.md):
each behaviour decision is a row with a test. Then a Sonnet `shark:code-writer` builds it. Scripts check each step:
`rca-gate.mjs` refuses an RCA with an open cell or an open spec.

A report with more than one symptom gets more. The operator writes the properties that the report breaks, and four
default properties (scope isolation, guard preservation, twin equivalence, input forms). It splits them into zones,
and one `shark:code-debugger` investigates each zone in parallel, in its own copy of the repository. A merge
debugger combines the zones and closes the spec with [`/shark:solution-spec`](./skills/solution-spec/SKILL.md):
each behaviour decision is a row with a test. Then a Sonnet `shark:code-writer` builds it. Scripts check each
step: `rca-gate.mjs` refuses an RCA with an open cell or an open spec.

[`/shark:debug-rca`](./skills/debug-rca/SKILL.md) contains the method. You can also use it yourself.

### #4: One Giant Commit At The End

> "Make the change easy (warning: this may be hard), then make the easy change."
>
> Kent Beck

**The Problem**: An agent works for a long time. It changes the structure of the code and adds three behaviours.
All of it goes into one commit of 4,000 lines. Nobody can review it. You cannot revert one part of it. `git bisect`
cannot find the bad change.

**The Fix**: Change the structure first, in its own commit. Then change the behaviour, in a different commit.

[`/shark:commit-blocks`](./skills/commit-blocks/SKILL.md) splits the working tree into conventional commits. Each
commit has one reason. A refactor and a behaviour change never share a commit. A script checks that each commit
passes the gate. Thus `git bisect` works on your history.

### #5: Hours Spent Finding One Blocker At A Time

> "How does a project get to be a year late? ... One day at a time."
>
> Fred Brooks, _The Mythical Man-Month_

**The Problem**: The agent runs the slow end-to-end flow. It finds one failure and fixes it. Then it runs the flow
again and finds the next failure. Each cycle takes 20 minutes. The estimate grows by hours, and nobody sees it.

**The Fix**: Find all the known defects first, with one static scan. Then fix them in rounds.

- [`/shark:goal-loop`](./skills/goal-loop/SKILL.md) sorts the failing scenarios and writes the contract. It fixes
  them in lanes, merges one time, and runs the flow again.
- Each agent has a timebox: 20 minutes for a lane. It gets one grace period of 20% to complete its current step.
- The costly checks run last, one time each: `gate:full`, integration tests and benchmarks.

> [!TIP]
> The `Working rules` section of [`AGENTS.md`](AGENTS.md) lists all the rules. Each rule names the failure that it
> prevents. An example: `pytest` with a folder and a file in that folder collects only the file.

### Summary

AI made writing code cheap, but the engineering is still expensive. With **shark**, you can build production-grade
systems with confidence: systems that are well written, well documented, and easy to debug when production is on
fire. That's not vibe coding. That's real engineering. It is my decade of experience building and maintaining
production-scale systems, distilled into this setup.

## Reference

### Session

- **[/shark:init](./skills/init/SKILL.md)**: Set up a project once. Brings your `AGENTS.md` or `CLAUDE.md` in line
  with the **shark** template, so every session starts with the operator, or with your own orchestrator if you keep
  it. Sets the `shark:asd-ste100` output style for the project.
- **[/shark:operator](./skills/operator/SKILL.md)**: Run the session. Sets the mode, writes the briefs, routes the
  work to agents, and checks what comes back. Loads by itself after `/shark:init`.
- **[/shark:handoff](./skills/handoff/SKILL.md)**: Record and prune the handoff file, so the next session picks up
  where this one stopped.

### Build and merge

**Skills**

- **[/shark:goal-loop](./skills/goal-loop/SKILL.md)**: Fix rounds toward one goal across N failing scenarios:
  classify, contract, fix in lanes, merge, run again.
- **[/shark:patch-fanout](./skills/patch-fanout/SKILL.md)**: Port many independent patches in parallel, one agent
  and one branch each.
- **[/shark:lead-merge](./skills/lead-merge/SKILL.md)**: Merge patch branches in batches from a queue file.
- **[/shark:merge-audit](./skills/merge-audit/SKILL.md)**: Review each merge against the patch notes and your
  invariants.
- **[/shark:port-audit](./skills/port-audit/SKILL.md)**: Find the rules a rewrite lost, by auditing the commits that
  deleted them.
- **[/shark:commit-blocks](./skills/commit-blocks/SKILL.md)**: Split a working tree into conventional commits that
  each pass the gate.
- **[/shark:code-authoring](./skills/code-authoring/SKILL.md)**: The writing rules of `code-writer` and
  `lead-engineer`: regression safety with a test baseline, scope, test first, logging, comments.
- **[/shark:solution-spec](./skills/solution-spec/SKILL.md)**: Close a spec before a Sonnet writer builds it: the
  guards on the path, a behaviour table with a test for each row, the decisions, an adversarial check.
- **[/shark:code-authoring](./skills/code-authoring/SKILL.md)**: The writing rules of `code-writer` and
  `lead-engineer`: regression safety with a test baseline, scope, test first, logging, comments.
- **[/shark:solution-spec](./skills/solution-spec/SKILL.md)**: Close a spec before a Sonnet writer builds it: the
  guards on the path, a behaviour table with a test for each row, the decisions, an adversarial check.

**Agents**

- **[shark:code-writer](./agents/code-writer.md)**: Turn a spec or a fix spec into production code, test first.
- **[shark:lead-engineer](./agents/lead-engineer.md)**: Merge parallel lanes, check them against the round
  contract, and run `gate:fast`.

### Debug and design

**Skills**

- **[/shark:debug-rca](./skills/debug-rca/SKILL.md)**: Step through the running program and write a root-cause
  analysis from observed values.
- **[/shark:system-design](./skills/system-design/SKILL.md)**: Check a design: SOLID, typed state, one rule in one
  place, pinned contracts, evaluation first.

**Agents**

- **[shark:code-debugger](./agents/code-debugger.md)**: Find the root cause in the debugger, then write a failing
  regression test and a fix spec.
- **[shark:invariant-guard](./agents/invariant-guard.md)**: Audit a diff against your invariants, read-only, with
  `file:line` evidence.
- **[shark:architect](./agents/architect.md)**: Senior read-only review of the architecture, the code and its
  math. Costly, so save it for big designs.

### Docs and upkeep

**Skills**

- **[/shark:cookbook-writing](./skills/cookbook-writing/SKILL.md)**: The method and reading-level script for
  tutorial chapters.
- **[/shark:gitignore](./skills/gitignore/SKILL.md)**: Create or refresh `.gitignore` from gitignore.io without
  losing your own rules.

**Agents**

- **[shark:doc-writer](./agents/doc-writer.md)**: Write specs, design notes, findings reports and runbooks.
- **[shark:cookbook-writer](./agents/cookbook-writer.md)**: Write tutorial chapters and check their reading level.

### Also in the box

- **[deny-secrets hook](./hooks/deny-secrets.mjs)**: Refuses Read, Edit, Write, Grep and Bash calls on the secret
  files that your `## Secrets` section lists (`.env`, `*.pem` and similar by default). Example files
  (`.env.example` and similar) always stay readable, so agents still learn the setting names.
- **[mcp-debugger](https://github.com/debugmcp/mcp-debugger)**: The MCP server behind `shark:code-debugger`. Real
  breakpoints, stepping and variable reads for Python, JS/TS, Go, Rust, Java, .NET and C/C++. It writes its log to
  `.claude/mcp-debugger.log`, so add that to your `.gitignore`.
- **[shark:asd-ste100](./output-styles/asd-ste100.md)**: An output style in Simplified Technical English. Short
  sentences, outcome first, observed and inferred claims labelled. Your agents' reports stop rambling.
- **[AGENTS.md](AGENTS.md)**: The project template, with the working rules. `/shark:init` applies it for you.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. The short version: no project
values, no stack lock-in, and commands named by their `AGENTS.md` key. Test your change with
`claude --plugin-dir <kit folder>` in a project that has a filled `AGENTS.md`.

Found a security problem? Follow [SECURITY.md](SECURITY.md), and don't open a public issue.

## License

[MIT](LICENSE). The `AGENTS.md` template and the logo in `assets/` are
[CC0](https://creativecommons.org/publicdomain/zero/1.0/), so you can copy them with no notice at all.

ASD-STE100 and Simplified Technical English are trademarks of ASD, Brussels. **shark** isn't affiliated with ASD. The
debugger is [`@debugmcp/mcp-debugger`](https://github.com/debugmcp/mcp-debugger) (MIT). It runs through `npx` and
isn't bundled.

