# Contributing to shark

Thank you for your help. This file tells you how to propose a change, and the rules that each skill and agent must
follow.

## Before you start

- **A bug or a small fix:** open a pull request.
- **A new skill, a new agent, or a change to a working rule:** open an issue first. Describe the failure that the
  change prevents. Each rule in the kit exists because of a real failure.
- **A security problem:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Repository layout

| Part | Path |
| --- | --- |
| Plugin manifest | `.claude-plugin/plugin.json` |
| Marketplace | `.claude-plugin/marketplace.json` |
| Agents | `agents/<name>.md` |
| Skills | `skills/<name>/SKILL.md`, with `scripts/` and `references/` if needed |
| Output style | `output-styles/asd-ste100.md` |
| Debugger MCP server | `.mcp.json` |
| Hooks | `hooks/hooks.json`, with each script and its `*.test.mjs` (run `node --test hooks/*.test.mjs`) |
| Eval suite | `evals/`. See [evals/README.md](evals/README.md). A pull request that changes a skill, an agent, a hook or the output style runs the `local` and `bash` evals and commits `evals/attestation.json` (see the eval README). CI checks it. |
| Project template | `AGENTS.md` |
| Mirror for other tools | `.agents/agents -> ../agents`, `.agents/skills -> ../skills` (relative symlinks) |

Claude Code does not read `.agents/`. The links are for other tools that read agent and skill files from that folder.
Edit the files in `agents/` and `skills/` only. The links follow.

## Files and frontmatter

| Part | Frontmatter |
| --- | --- |
| Skill | `name`; `description` (what it does, then "Use when …", at most 1024 characters); `allowed-tools` (optional) |
| Agent | `name`; `description`; `tools`; `model` (`sonnet` for `code-writer`, `opus` for the others); `effort` (optional) |

Do not put `hooks`, `mcpServers` or `permissionMode` in the frontmatter of an agent. Claude Code ignores them in a
plugin. An MCP server goes in `.mcp.json`.

## Content rules

- **No project values.** Do not write project names, tenant names, people, repository names, paths, URLs, decision
  IDs or incident dates. A lesson keeps its substance, not its story.
- **No stack lock-in.** A stack fact is a labelled example for at least two stacks. For example: "(Python:
  `pytest -k`, JS: `vitest run`, Go: `go test ./...`)".
- **Project values come from `AGENTS.md`.** Write "run the project's `gate:fast` (AGENTS.md › Commands)". Never write
  a literal command. If the section is missing, the skill asks the user one time and recommends that the user adds
  it.
- **Names with the namespace.** Refer to other parts as `shark:code-writer` (agent) and `shark:commit-blocks`
  (skill).
- **Tools by function.** Write "set a breakpoint with the mcp-debugger tools". Do not write a tool ID.
- **Voice.** Reports and documents use ASD-STE100: outcome first, observed and inferred claims labelled, Markdown
  files with full paths.
- **Timebox.** Each agent brief states the timebox and the grace rule (`AGENTS.md`, Working rules §2).

## Add a part to the kit

1. Write the file in `agents/` or `skills/`.
2. Add one line to the Reference section of `README.md`.
3. Test it with `claude --plugin-dir <kit folder>` in a project that has a filled `AGENTS.md`.
4. Raise the `version` in `.claude-plugin/plugin.json`.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(skills): …`, `fix(agents): …`,
  `docs: …`.
- Give each commit one reason. Do not put a refactor and a behaviour change in the same commit.
- Each commit must work on its own. `/shark:commit-blocks` can split a working tree for you.
- Do not use `--no-verify`, and do not force push.
- In the pull request, say what you tested and what you did not test.

## License of contributions

The kit is under the [MIT License](LICENSE). The `AGENTS.md` template and the logo in `assets/` are under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). When you send a pull request, you agree that your
contribution is under the same terms as the files that it changes.
