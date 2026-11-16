# Run script of the loop (template)

The script runs the N scenarios once, at production settings, on a frozen copy of the code, with the project's
`bench` command (`AGENTS.md`, section `## Commands`). It writes the run files to `<scratch>/goal-loop/<round>/`
and the log to `<scratch>/goal-loop/<round>.log`. Run it once per round, in the background.

```bash
#!/bin/bash
# Goal loop (<owner>, <date>): the <N> failing scenarios, production settings, one run each.
# Usage: run.sh <round>   e.g. run.sh r0
set -u
round=$1
L=<scratch>/goal-loop                       # loop folder: results and logs
CODE=<path of the frozen worktree>          # a worktree at a fixed sha, with its own installed dependencies
KEYS=<path of the checkout that holds the key file, if the run needs one; else $CODE>

cd "$KEYS" || exit 9                         # the runner loads the key file from the working folder; never copy it
mkdir -p "$L/$round"
git -C "$CODE" log -1 --format='%h %s' > "$L/$round/head.txt"
# Arm "<name>" = production: <the settings that differ from the code defaults, and why>.
export <SETTING>=<value>
exec timeout <seconds> <the project's `bench` command, run from $CODE> \
  --scenarios <id-1>,<id-2>,...,<id-N> \
  --arm <name> --parallel <p> --repeats 1 \
  --spend-cap <limit> --out "$L/$round" > "$L/$round.log" 2>&1
```

The flag names above (`--scenarios`, `--arm`, `--spend-cap`, `--out`) are examples: use the options of the
project's runner. A runner that lacks one of these needs: a way to name the arm, a way to pick the scenarios, a
spend cap, and an output folder.

## Rules

| Rule | Why |
| --- | --- |
| Run the code of the frozen worktree (`$CODE`) | A merge can move the integration worktree during a long run; the result then mixes two heads |
| `cd` into the checkout that holds the key file | The runner reads the provider key from it. A copy of the key file is a leak |
| `head.txt` from `$CODE` | Each result names the sha that ran |
| A named arm | The results and the summary name the settings |
| `timeout` and the spend cap | A stuck run or a loop of paid calls stops by itself |
| `--repeats 1` with a small `--parallel` | The default of the loop; a second run confirms a pass or a failure |
| `bash`, with quoted variables | zsh does not split an unquoted variable into words, so a list in one variable breaks |

## Make the frozen copy

```bash
git -C <repo> worktree add ../<repo name>-wt-bench-<short sha> <sha>   # detached, no branch
cd ../<repo name>-wt-bench-<short sha> && <setup>                      # the project's `setup` command
```

Remove it after the round: `git worktree remove ../<repo name>-wt-bench-<short sha>`.
