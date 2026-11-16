# Patch note (template)

Each patch agent writes one note: `<scratch>/port/notes/<UNIT>.md`. The lead (`shark:lead-merge`) resolves a merge
conflict from the notes of both sides. The audit engineer (`shark:merge-audit`) checks the merge against the
INVARIANTS section. Write each invariant so that a reader can check it in the merged code.

```markdown
# Patch note <UNIT> - <behaviour in one line> (branch pu/<UNIT>, commit <sha>, base <sha>)
<Add "PARTIAL (timebox)" to the title when the NOT PORTED section is not empty.>

## WHAT
- `<file>` `<function or class>`: <the change>. New names: `<name>` (<its one owner file>).
- <The rule in one or two sentences, with its conditions: "X when A and (B or C)".>

## WHY
Production: `<reference or sha^>:<path>:<line>` `<function>` <what it did>. Decisions: <IDs>.
Integration head: <file:line> <what is missing or broken, and the effect that a user or the lead sees>.

## INVARIANTS
- <Behaviour that must stay true after any merge. One line each. Name the actor, the source, the order.>
- <What of the current code the patch keeps on purpose, and why.>
- <The cases with no change: "<other channel>: no event, no change".>

## TESTS
`<test file>`: `<test name>` (<n> tests, incl. <the important cases>).
Failed first with: <the failure>. Snapshot test: <passes unchanged | <n> expected differences: <fields>>.

## NOT PORTED
<Only when PARTIAL. One item per line, each usable as a follow-up unit: what, where, the production reference.>

## KNOWN OVERLAPS
- <Other units that touch the same function, file or seam, and how the lead keeps both.>
- <Conflict spots: the functions, signatures or maps where a textual conflict is likely.>
- <Unrelated failures that you saw (for example a known flaky test), with evidence that the base has them too.>
```

## A good invariant

| Weak | Strong |
| --- | --- |
| "The confirmation works." | "The confirmation event has actor CODE, never USER, so a value that the code made gives no consent." |
| "Notes are kept." | "A later update never erases earlier notes: the union of the whole session, first seen first." |
| "No change for other tenants." | "With the setting off and no stored answer, the step writes no event." |
