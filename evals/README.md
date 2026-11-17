# Eval suite

These cases check that the kit keeps its behaviour after a change: the output style, the comment rules, `/shark:init`,
the secrets hook and the debugger agent. Each case copies the project in `_fixtures/billing-mini` into a temporary
workspace, runs one prompt, and grades the reply, the transcript and the files.

## Run it

```bash
evals/docker/run.sh --tag local --tag bash --runs 1 --allow-tools Bash Edit Write   # the cases that the attestation needs
evals/docker/run.sh --tag slow --runs 1 --allow-real-servers --allow-tools Bash Edit Write 'mcp__*'   # the real debugger
evals/run.sh --tag local --runs 1 --allow-tools Write Edit   # without Docker: the cases that need no Bash
```

`evals/docker/run.sh` runs `evals/run.sh` in a Linux container (`evals/docker/Dockerfile`: Node, Python with pytest
and debugpy, git, bubblewrap, Claude Code). Use it when the Bash sandbox of the eval runner does not start on your
machine. It mounts only this repository. It reads the Claude token from `CLAUDE_CODE_OAUTH_TOKEN`, or on macOS from
the Keychain item `shark-eval-claude-token`:

1. Make a token: `claude setup-token` (it needs a Claude subscription).
2. Save it: `security add-generic-password -a "$USER" -s shark-eval-claude-token -w` (it asks for the value, so the
   token does not go into the shell history).

Never put the token in a file in this repository: `run.sh` copies the repository into the plugin under test.

`run.sh` passes each option to `claude plugin eval`. Results go to `evals/results/<time>/` (git ignores it):
`report.html`, `result.json` and `aggregate-result.json`. Add `--max-cost-usd <usd>` to set a limit.

## Attest the result

CI does not run the evals: they need a Claude credential. You run them on your machine, and you commit an attestation
that ties the result to the files that the evals tested.

1. Run the evals: `evals/docker/run.sh --tag local --tag bash --runs 1 --allow-tools Bash Edit Write`. `run.sh` records the fingerprint of
   the files when the run starts.
2. Record the result: `node evals/attest.mjs write evals/results/<time>/result.json`. This writes
   `evals/attestation.json`. It refuses when the files changed after the run started.
3. Commit `evals/attestation.json` with the change.

The fingerprint is the SHA-256 of a list of the SHA-256 of each file in `agents/`, `skills/`, `output-styles/`,
`hooks/`, `.claude-plugin/`, `.mcp.json`, `AGENTS.md` and `evals/` (not `evals/results/`, `evals/docker/`, this file
or the attestation). A change to the README or other docs does not change it.

The `checks` workflow runs `node evals/attest.mjs verify` on each push and pull request. It fails when:

- the fingerprint of the files is not the attested fingerprint, so the evals did not run on this version;
- a case with the `local` or `bash` tag did not run;
- an attested case failed.

The attestation shows that someone ran the suite on these files. It does not prove it: a person can edit the file.
Review a change to `evals/attestation.json` like any other change.

## Tags

| Tag | Cases | Needs |
| --- | --- | --- |
| `local` | `style-short-answer`, `style-safe-delete`, `writer-doc-comments`, `secrets-hook-read` | Read, Write and Edit only |
| `bash` | `fix-no-comments`, `init-*`, `secrets-hook-bash` | The Bash sandbox. It does not start on a machine whose credential folders (for example `~/.kube`) hold a symbolic link: use `evals/docker/run.sh`. |
| `slow` | `debugger-rca` | The real mcp-debugger server and `debugpy` |

## Why run.sh copies the plugin

The eval runner ignores the project and user settings, so a case cannot select the output style. `run.sh` copies the
plugin to a temporary folder and sets `force-for-plugin: true` in the copy of `shark:asd-ste100`. The plugin in the
repository does not change.

## Add a case

1. Make a folder `evals/<name>/` with `case.yaml`, `setup.sh`, `prompt.md` and `graders/*.md`. Copy an existing case.
2. `setup.sh` calls `../_fixtures/setup.sh billing-mini [extras]`. The extras are `env-canary` (`.env` files with
   canary values) and `team-settings` (a shared `.claude/settings.json`).
3. Prefer `regex` and `tool_used` graders. The runner refuses writes to `.claude/settings*.json` (a person must
   approve them), so check the attempted `Write` or `Edit` with `tool_used` and `input_match`, not the file. Use an
   `llm` grader only for a rule that a pattern cannot check.
4. Give the case one tag from the table.
