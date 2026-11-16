# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

Only the latest release gets security fixes.

## Report a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub:

1. Go to the [Security tab](https://github.com/tusharsrivastava/shark-skills/security) of this repository.
2. Select **Report a vulnerability**.
3. Give the affected file, the steps to reproduce, and the effect.

You get a first answer within 7 days. When the problem is confirmed, the fix goes into a new release, and the
advisory names you if you agree.

## Scope

**In scope:**

- The scripts in `skills/*/scripts/`. For example, a script that runs a command it should not run, or that changes
  files outside its target.
- The skills and agents. For example, an instruction that tells an agent to read secret files, to bypass git hooks,
  or to send project data to an outside service.
- The plugin configuration: `.claude-plugin/`, `.mcp.json` and `output-styles/`.

**Out of scope:**

- The `mcp-debugger` server. It is a separate project. Report its problems to
  [debugmcp/mcp-debugger](https://github.com/debugmcp/mcp-debugger).
- Claude Code itself. Report its problems to Anthropic.
- The general risk of prompt injection through files that an agent reads. Report it here only when a **shark**
  instruction makes that risk larger.

## Good practice for users

- The kit does not install a hook that blocks access to secret files. Add one for the files in the `## Secrets`
  section of your `AGENTS.md`.
- Give unattended background agents only the tools that you allow-list.
- `.mcp.json` pins the `mcp-debugger` version. The pin covers the top package only, not its dependencies.
