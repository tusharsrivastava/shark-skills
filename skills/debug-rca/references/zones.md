# Zones: a defect investigated in parallel

Part of `shark:debug-rca`. The operator uses it in debug mode (`shark:operator` › `modes/debug.md`) for a report with
more than one symptom or a twin path. One `shark:code-debugger` investigates each zone; one more `shark:code-debugger`
merges the zones and closes the spec.

The method finds the defects next to the reported ones. One investigation with one timebox stops at the first
plausible set of causes. In the kit's Payload benchmark, the missed defects were each one step from a reported one:
the same damage through another operation, the same change through another kind of field, two guards that meet.
A zone for each property and axis reaches them by construction.

## 1. Properties (the operator, step 1)

Write each observation of the report as a row. Then write the property that the observation breaks: a rule that
must hold for every operation, input and actor, not only for the reported steps.

| # | Observation (from the report) | Property that it breaks |
| --- | --- | --- |
| P1 | the status of another locale does not show a shared draft change | a locale's status shows each pending change that affects it |
| P2 | a read-then-save in another locale loses a shared draft change | an operation in one locale never changes the stored data of another locale, unless the data is shared |

A property is wider than its symptom. P2 also covers an unpublish, a publish or a restore in one locale.

**Add the four default properties to each investigation.** A property that the operator writes from a symptom
tends to stay as narrow as the symptom ("no operation discards a *shared draft* change"). The defaults do not depend
on the wording of the report. Write each one for the area of the report:

| # | Default property | It reaches |
| --- | --- | --- |
| D-ISO | **Scope isolation.** An operation in one scope (locale, tenant, account, key) never changes the stored data or the status of another scope, published or draft, except data that is shared by design. | an unpublish in one locale that writes the pending draft of another locale |
| D-GUARD | **Guard preservation.** Each guard on the path (access, field access, a filter of reachable records or locales, validation) keeps its effect on the changed behaviour, in each scope, also in the "all" scope. | an "all locales" save that drafts a locale the actor cannot reach; a status change that field access denies |
| D-TWIN | **Twin equivalence.** Twin paths (collection and global, single and bulk, one scope and all scopes, write and read) give the same observable result for the same input. | a fix that works for collections and not for globals |
| D-INPUT | **Input forms.** Each kind and form of value that the code reads (absent, `null`, empty, the same value sent again, a nested child) gives a defined result, never a crash. | a shared list cleared to `null` that crashes the merge |

Each default property gets zones like the other properties. A default that the area cannot break gets one row with
the reason and the search that shows it.

## 2. Zones (the operator, step 2)

A zone is one property crossed with one axis. Use this axis checklist for each property, and keep the cells where
the property can break. Merge cells that read the same code.

| Axis | The zone asks | Typical find |
| --- | --- | --- |
| Operations | each operation (create, update, draft save, publish, unpublish one, unpublish all, restore, autosave, delete, read) while the state of the defect exists, and while **another scope** has a pending state | an unpublish in one locale writes the pending draft of another locale |
| Input kinds | each kind of value that the code reads (scalar, list, block list, group, relation, a child with a different property than its parent) × each form (absent, `null`, empty, the same value sent again, another type) | a list cleared to `null` crashes the merge |
| Guards × scopes | each guard on the path (access, field access, a filter of reachable records or locales, validation) × each scope (one, all, bulk) × each intent in the request (a status, a flag) without a data change | an "all locales" draft save with a locale filter and only a status in the payload |
| Twins | each twin path (collection and global, single and bulk, write and read) | the global path compares values with other code |

Give each zone an ID (Z1, Z2, …), its property, its axis, and the cells to test. Four zones is a typical size for
a report with three or four symptoms.

## 3. The zone brief (the operator, step 3)

Start all zones in one message, each a `shark:code-debugger` in the foreground. Give each zone its own tree, so that
test runs and test databases do not collide:

```bash
node "${CLAUDE_PLUGIN_ROOT:-<directory of the skill>/../..}/skills/debug-rca/scripts/zone-tree.mjs" create <zone id>
```

The script makes a copy-on-write copy of the repository (with its dependencies) in `.shark-zones/<zone id>` and
prints its path. On a file system with no copy-on-write, it makes a git worktree, and the zone runs the project's
`setup` first.

Brief of a zone:

```markdown
Zone <Z1> of a defect investigation. Load `shark:debug-rca` and follow its zone mode.

- Report (word for word): <the report>
- Property: <P2: an operation in one locale never changes the stored data of another locale>
- Axis and cells: <Operations: unpublish one, publish one, restore; each with a pending draft in another locale>
- Your tree: <path printed by zone-tree.mjs>. Work and run tests only there.
- Your test file: <a new spec file for this zone>. Put a fixture in the config only when no existing one fits.
- Test command: <command>. Timebox: 25 minutes, one grace of 20 %.
- Return the zone report of `references/zones.md` § 4. Do not change production code.
```

## 4. The zone report (a `shark:code-debugger` in zone mode)

In zone mode, do the loop of `shark:debug-rca` (reproduce, hypothesis, observe, root cause) for the cells of your
zone only. Write a test for each cell: a regression test fails now, a guard test passes now. Do not close the spec;
the merge does it. Return:

| Item | Content |
| --- | --- |
| Causes | each cause that you confirmed, with `file:line`, the observed values, and the cells that it explains |
| Cells | each cell: its test (`file` › `name`) and its result now (fails or passes), or "not applicable" with the search that shows it |
| Unexplained observations | each value or failure that no confirmed cause explains: a crash, a value that you did not predict |
| Guards seen | each guard on the path that you read, with its location |
| Tree | the path of your tree, and `zone-tree.mjs diff <zone id>` to get your test changes |

An unexplained observation is a finding. Do not drop it because it is outside the zone.

## 5. The merge (a `shark:code-debugger` in merge mode, step 4)

1. Apply the test changes of each zone to the main tree: `zone-tree.mjs diff <zone id> | git apply`. Resolve a
   conflict in a shared fixture by hand, and run the tests of each zone again in the main tree.
2. Combine the causes. Two zones that found the same mechanism give one cause. Two zones that need opposite
   behaviour from the same code are a conflict: record it in the Rounds table.
3. Write the RCA from the template, with the Properties table (each property and its causes or the tests that show
   that it holds) and the Rounds table.
4. Close the spec with `shark:solution-spec`, and run `rca-gate.mjs check` and `run --phase before`.
5. Remove the zone trees: `zone-tree.mjs remove --all`.

## 6. Rounds and the iteration rule

The Rounds table records each round and each trigger:

| Round | Zones | Trigger | Status |
| --- | --- | --- | --- |
| 1 | Z1 to Z4 | | done |
| 2 | Z3b | Z3: a list cleared to `null` crashes (unexplained) | done: cause C4 |

A trigger is one of these:

- an unexplained observation of a zone;
- a property with no cause and no test that shows that it holds;
- two zones that need opposite behaviour from the same code;
- an adversarial check that finds a gap that needs investigation, not only one more test.

**One extra round at most.** The operator starts round 2 only for the zones that a trigger names, with the
trigger in the brief, and continues the same merge agent with `SendMessage`. A trigger that is still open after
round 2 has the status "open: step 5". Then the operator sends the RCA to `shark:architect` (step 5 of debug mode).
