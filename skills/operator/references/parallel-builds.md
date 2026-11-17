# Parallel builds

Rules for two or more builds at the same time, and for the merge of a branch that you did not write. They
prevent rework from shared test databases, colliding migration numbers and merges that bring back old code.

## 1. Before the build

- **Ask the design question first.** When two designs are sensible and the user can choose, ask the user before
  the build, with your recommendation. A build on the wrong design costs more than one question. This applies
  also in a fast session.
- **Write the round contract** (`split-timebox-merge.md` §2) when the builds share a name, an event, a field or
  a file.

## 2. Resources for each build

| Resource | Rule | In the brief |
| --- | --- | --- |
| Worktree | One worktree for each build, with its own dependency environment (Python: a virtual environment; JS: `node_modules`). | The worktree path and the branch. |
| Test database | One test database for each worktree, copied from a migrated template. | The database name and the `test-db:copy` key. |
| Migration numbers | You give the numbers. Two branches of one module never take the same number. | "Your migration is 0059, after 0058 of the other build." |
| Shared files | When two builds change one file (a contract, a settings file, a decisions table), each build owns a named part. | The part that the build owns, and the part that it does not touch. |
| Disk | Each worktree with its dependencies takes hundreds of MB. | Remove the worktree after the merge (`agent-hygiene.md` §4). |

The number of worktrees has no fixed limit. The machine and the file overlaps set it.

## 3. Test databases: copy, do not build

A new test database applies every migration before the first test. On a large project that takes tens of
minutes. A copy of a migrated database takes seconds.

1. **Keep one template test database for each repository**, migrated to the head of the shared branch. Make it
   one time with the normal test command, then rename it. Refresh it after a merge that adds migrations.
2. **Give a new worktree a copy of the template** with the project's `test-db:copy`. Examples: Postgres
   `CREATE DATABASE <copy> TEMPLATE <template>;` (no session may be connected to the template during the copy);
   SQLite: copy the file.
3. **Keep the database between runs**, so that the test runner applies only the new migrations. Examples:
   Python with pytest-django: `--reuse-db`; Rails: run the new migrations on the test database, do not reset it.
4. **Build from zero only when a migration that the database has was edited or renumbered.** Even then, copy the
   template again (step 2) and keep the database (step 3).
5. **Run the slow migration tests once, before the push** (the tests that migrate back and forward). Leave them
   out of each iteration by path or by marker.

If `## Commands` has no `test-db:copy`, ask the user once for the command and suggest adding it.

## 4. Merge a branch of another person

Merge it in its own worktree, and check it first:

1. Find its base (`git merge-base`). Make sure that the shared branch has that base.
2. List its commits, its files and its migrations.
3. Check its migrations against the shared branch and against production:
   - a number that collides;
   - a migration that changes a field that a later migration also changes;
   - a statement that recreates a view or a function from an older definition. The old definition removes
     the columns that later migrations added.
4. Check its contract changes against the deployed contract (for example protobuf field numbers, API schema
   versions, pinned contract hashes). A deployed number never moves.
5. Run the project's gates on the merge. If its own code fails a gate, tell the user before the push. Never push
   a red gate to a shared branch.

Rebase a worktree branch on the shared branch before the merge.

## 5. Finish a worktree

1. If the dependencies changed, run the project's `setup` in the main checkout.
2. Rebase the branch on the main branch, then fast-forward the main branch to it.
3. If the merge adds a migration, apply it on the main checkout.
4. Remove the worktree (`git worktree remove`, then `git worktree prune`). Check that the folder is gone.
5. Delete the branch with `git branch -d`. It refuses work that is not merged, so it is the safe delete. After a
   cherry-pick, use `git branch -D` only when `git cherry <target> <branch>` prints no `+` line.
6. Drop the test databases of the worktree.

**Done when** `git worktree list` and `git branch --no-merged <main branch>` show only work in progress.

## 6. Pitfalls

| Pitfall | Effect | Treatment |
| --- | --- | --- |
| Python (pytest): a folder and a file inside that folder in one call. | pytest collects only the file; the folder tests do not run. | Give folders and files in separate calls, or give only the folder. Check the count of collected tests. |
| Python (pytest-xdist): parallel workers with a copied test database. | Each worker makes its own new database from zero. | Run without parallel workers in a lane, or give each worker a copy. |
| A test runner that prints no summary line in quiet mode. | A wait loop that looks for "passed" never ends. | Run the tests in the background and read the exit code. |
| Two worktrees that run migrations on one test database. | The results of both builds are unreliable. | One database for each worktree (§2). |
