# review-log.md (template)

```markdown
# Merge audit log (audit engineer, read-only)

Integration branch `<integration branch>`, worktree `<path>`. Round contract: `<path>`.

## Review <n>: merge <sha> (<UNIT>, pu/<UNIT> <sha>)
<or: Review <n>: <first sha> .. <last sha> (<units and lead fixes>)>

Verdict: **OK** | **ISSUE** (<n> blocking, <n> minor, <n> open gap).
Read: <notes>, <merge log entries>, `git show --cc` of <conflicted merges>, lead fixes <shas>.

Checked:
- Scope: <the diff = the files of the note | other files, named>.
- Invariant (1) <short name>: <the cases that you checked, file:line>. Holds | Broken. (observed | inferred)
- Pinned tests: <test file:line> unchanged | <what changed, and the evidence>.
- One definition: <shared names and their owner files>.
- Layers: <imports checked against the project's architecture rules>.

Conflict resolutions (all keep both sides | <which one does not>):
- `<file>` (<UNIT>+<UNIT>, <merge sha>): <what each side kept>, <file:line>.

Safety rules (the project's invariants and the kit rules):
- <rule>: <the evidence, file:line>.

Lead fixes: <sha>: test first <yes | no>; fails without the fix <observed | inferred>.

Items:

| # | Severity | File:line | Item | Fix spec for the lead |
|---|---|---|---|---|
| A1 | minor | `<file>:<line>` | <what is wrong and its effect now> | <behaviour after the fix; the test and its cases; what must not change> |

Not checked again here: <merges>, because <reason>. Design debt recorded by the lead: <items>, kept for the final
review.
```

Give each review its own letter, and number its items after the letter (A1, A2, … in the first review; B1, … in
the next). The operator and the lead then cite them.
