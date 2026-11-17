---
name: commit-blocks
description: Splits a working tree into conventional commits, each with one reason, and checks that each commit passes the gate on its own. Use when work is ready to commit.
---

# Commits that you can bisect

A commit message is documentation. A commit _boundary_ is a debugging tool.

`git bisect` assumes that each commit in the range is a valid build. If one commit does not build, bisect reports
it as the cause of a bug that came three commits later. The person who debugs believes it, because bisect is
mechanical. A broken commit in the middle does not only fail to help: it gives wrong information.

Thus one rule is more important than every rule of format: **each commit works on its own**. Verify it. Do not
assume it.

**Project values.** The gate commands come from the project `AGENTS.md`, section `## Commands` (keys
`gate:scoped <paths>`, `gate:full`, `setup`). Which gate to run comes from `## Test scope`. Never write a literal
gate command from memory. If a key is missing, ask the user once and suggest adding it to `AGENTS.md`.

## Conventional format

```
type(scope): subject

Body: why, not what. The diff already says what.

BREAKING CHANGE: what breaks, and what to do about it.
Refs: #123

<attribution trailer>
```

**Types:** `feat` (a new capability), `fix` (corrects behavior), `refactor` (no change of behavior), `perf`,
`test`, `docs`, `build` (dependencies, toolchain), `ci`, `chore` (nothing that a user or a developer sees).

**Scope** is where the change is, in the vocabulary of the repository: a module, package or service name, or one
of the common areas (`config`, `docs`, `ci`, `deps`, `agents` for the files of the AI tooling). Take the scope
words from the folder names and from the recent `git log`. If no scope fits, omit it. Do not make one up.

**Subject:** imperative mood, no full stop at the end, fewer than about 72 characters. Write "add the retry
queue", not "added" or "adds". Read it after the words "this commit will...". If that sentence is not
grammatical, write the subject again.

**Body:** the reason for the change, the constraint that shaped it, or the alternative that you rejected and why.
If the subject says everything, do not write a body. A body that repeats the subject is noise. Cite the spec or
the rule id where a rule comes from.

**Trailer:** end each commit message with the attribution line that the session or the project asks for (for
example a `Co-Authored-By:` line). Add none that is not asked for.

## Split by reason, not by file

Group the changes by **why** you made them, not by the directory that they touch. A commit has one answer to "why
did this change?". If the true answer has an "and" in it, split again.

| Signal | What to do |
|---|---|
| Two answers to "why?" | Two commits |
| A rename and a change of behavior | Two commits, the rename first |
| A dependency added for a feature | The same commit as the feature, or a `build(deps):` commit just before it |
| Tests for the code in this commit | The same commit: code and its tests ship together |
| A schema migration for a model change | The same commit as the model change |
| Formatting of a file that you also edited | The same commit. A separate `style:` commit for unrelated formatting is churn |
| A fix that you saw on the way | Its own `fix:` commit, before or after, never inside |
| The doc section that the change makes wrong | The same commit as the code, or a `docs:` commit just after it |

**Never mix a refactor with a change of behavior.** This is the worst case for bisect. When bisect points at the
commit, you cannot tell if the rename or the new logic caused the bug, and the diff is too large to read. Rename
in one commit. Change the behavior in the next commit.

## Order

Later commits can depend on earlier commits. The reverse is a broken build.

1. **Toolchain and dependencies** first (the manifest and its lock file). Nothing else builds without them.
2. **Schema and types** before the code that uses them (data models, migrations, domain values).
3. **Renames** before the changes of behavior that touch the renamed thing.
4. **Infrastructure** before the feature that uses it (an interface and its adapter before the service).
5. **Docs and config** last, unless a rule change caused the code change.

If commit N needs a symbol that commit N+1 adds, the split is wrong. Merge the two commits, or move the symbol
earlier.

## Verify each commit when you make it

A staged subset does not prove that it builds, because the working tree still holds everything else. Check the
staged state alone, in a temporary worktree. **Never use `git stash`** for this: an old stash entry can hold the
changes of another person, and `git stash pop` applies the newest entry, also when your own `stash push` saved
nothing.

```bash
git add <paths for this commit>
WT="$(mktemp -d)/wt"                         # outside the repository
git worktree add --detach --quiet "$WT" HEAD  # a clean checkout of the last commit
git diff --cached --binary | git -C "$WT" apply --index   # only the staged change, new files included
(cd "$WT" && <setup>)                         # `setup` (AGENTS.md > Commands), if the checkout needs it
(cd "$WT" && <gate:scoped <paths>>)           # the gate on exactly what you will commit
git worktree remove --force "$WT"
git commit                                    # only if the gate was green
```

`git diff --cached` is the exact content of the next commit, and `HEAD` is exactly its parent. Thus the
temporary worktree holds what a clean checkout of the new commit will hold. Your working tree and your index do
not change. If the project keeps its build or install folders out of git (for example `node_modules`, `.venv`),
the first setup in a new worktree takes longer: that cost is the price of a true result.

For the paths in `gate:scoped <paths>`, use the tests of the modules that the commit changes (see `## Test
scope`). Run `gate:full` one time, on the last commit, only when the series touches shared code, a migration,
settings or dependencies.

If the gate fails, the split is wrong, not the code: the commit does not have something that it depends on. Add
that dependency to the commit, or change the order.

**CAUTION:** Never use `git commit --no-verify`. The commit hooks (lint, secret scan, import contracts) are part
of the check. If a hook fails, fix the cause.

### When one file belongs to two commits

Interactive staging (`git add -p`) is not available to an agent. Stage a part of a file from a patch instead:

1. Write the patch of the hunks that belong to this commit to a file in the scratch folder, with the Write tool.
   Start from `git diff -U0 -- <path>` and keep only those hunks.
2. Stage the patch alone: `git apply --cached <patch file>`. The working tree is not touched.
3. Check that the index is what you want (`git diff --cached`), verify it with the procedure above, and commit.
4. Repeat for the next part. The last part is the rest of the file: `git add <path>`.
5. At the end, `git status` must show a clean tree, and `git diff HEAD~<n> --stat` must equal the diff that you
   had before you split. If it does not, a hunk is lost: find it before you go on.

If you want to keep a copy of the whole change while you work, copy the changed files to a scratch folder first
(or commit on a temporary branch). Never keep it in a stash. Run each step as its own command: in a chain, a
failed step leaves later variables unset.

## Verify the whole chain before you push

Checks for each commit can still leave a chain that fails when you replay it. Check the full range:

```bash
"${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/commit-blocks/scripts/verify-bisectable.sh" <base-ref> <gate command...>
```

Use `--root` in place of `<base-ref>` to check every commit, including the root commit of the repository.

Give the gate after the ref: the project's `gate:scoped <paths>` command when the range does not touch shared
code, else `gate:full`. If you give none, the script reads the `VERIFY_GATE` environment variable, and without
both it stops (no gate is the same for every language).

The script checks out each commit in `<base-ref>..HEAD` in a temporary git worktree and runs the gate there. It
reports the commits that fail. It never changes your branch or your working tree. (`git rebase --exec` rewrites
every hash in the range, even when everything passes.) Two optional environment variables:

- `VERIFY_SETUP`: a command that runs in the checkout before the gate of each commit. Use the project's `setup`
  command or the locked install (examples: Python `uv sync --frozen`, JavaScript `npm ci`, Go
  `go mod download`). A commit whose setup fails is reported as `SETUP FAILED`: it builds in your checkout (the
  packages are already there) and fails on a clean checkout, the kind of false result that makes bisect
  untrustworthy. Default: none.
- `VERIFY_KEEP`: paths that stay between commits (for example `.venv node_modules`), so that each setup after
  the first is incremental. Default: none.

Find the script relative to the directory of this skill, never with a fixed path. `CLAUDE_PLUGIN_ROOT` is set when
the skill is part of a plugin, and the harness gives the base directory when it loads the skill.

**NOTE:** If the gate needs a test database or a port, check that a second checkout does not share it with your
main checkout (see `## Commands`, key `test-db:copy`, and `## Test scope`). A shared database gives results that
you cannot trust.

## Rules

1. **Each commit builds and passes the gate.** Verified, not assumed.
2. **One reason for each commit.** An "and" in the why means another commit.
3. **Never mix a refactor with a change of behavior.**
4. **Code and its tests ship together.** If the tests come in a later commit, bisect blames the wrong commit.
5. **No commit depends on a later commit.**
6. **Secrets and generated files never go into a commit.** Check what is staged, not only what changed. The
   files in `AGENTS.md`, section `## Secrets`, and the build output are ignored on purpose.
7. **Never `git stash`, never `--no-verify`, never a force push.** Use a temporary worktree or a scratch copy.
8. **Do not commit unless the user asked.** The split and the messages are the work. The user decides when
   `git commit` runs, unless they said otherwise. Push only when the user asks.
