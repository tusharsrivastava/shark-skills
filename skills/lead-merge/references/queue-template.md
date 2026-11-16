# queue.md (template)

The operator writes and updates this file. The lead reads it at the start and at each restart. Keep the state
paragraph current after each batch report.

```markdown
# Lead queue (<operator>, <date> <time>) — <why this version: "first batch" | "restart after <cause>">

State: <integration branch> (worktree <path>) head <sha>.
Merged and logged in merge-log.md: <unit list, with the lead fixes in brackets: "<UNIT>(+fix <sha>)">. Nothing
pushed | pushed to <branch> at <sha> (owner rule or request: <which>).
Operator checks at <sha>: <gate:fast, gate:scoped folders: counts>. <A failure to fix first, with its
file:line.> Snapshot: <not run | <n> differences, mapped to <units>>.
<A scenario run on this head, if any: folder, pass count, and "do not tune these now" when the port is partial.>

Round contract: <path of the contract>. Shared names and their owners are decided there, not here.

Rules: <scratch>/port/pipeline.md "Lead engineer". Merge in batches of 3-4, one combined check per batch
(a timeout per run, at most 2 test runs at a time). After each merge REMOVE the merged worktree
(`git worktree remove <path>`; --force only if its only extra files are the known leftovers named below) and its
test database. Never touch <worktrees that are not yours>. Record every conflict resolution and every snapshot
difference in merge-log.md. <Pinned hash>: fails by design after <UNIT>; recompute ONCE at validation (<files>).
Do not re-record the snapshot per batch: map all differences at validation and re-record once.

## Batch <n>: <UNIT>, <UNIT>, <UNIT>
- <UNIT> pu/<UNIT> <sha>: <what it does, in the names of the code>. Snapshot: <n> differences = <fields>
  (confirm). <Leftover: untracked <file> in its worktree (--force ok).>
  FIX at merge (test first): <the merge item, as behaviour: "carry the union of the notes of the whole session">.
  Check: <a cross-unit check: "a filter still applies in the SAME step with <UNIT>; else log a follow-up">.
  Also run: <extra test files of importers>.

## Coming (operator sends): <units in flight>
```

## Merge items: write them as behaviour

| Weak item | Strong item |
| --- | --- |
| "Fix <UNIT>." | "Carry the union of the notes of the whole session, de-duplicated, first seen first." |
| "Check <UNIT> and <UNIT>." | "One owner for the title lookup: the two units duplicate a rule. Keep the empty case." |
| "Snapshot looks odd." | "Do not pass the setting as an undeclared case fact; pass it as a typed setting at build time." |
