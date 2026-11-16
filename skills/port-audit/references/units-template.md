# SUMMARY.md and UNITS.md (templates)

## SUMMARY.md

```markdown
# Port audit summary (<date>, <start>-<end>), <refactor branch> <sha> vs <reference branch> <sha>

Group files (rows with old place, evidence, severity): G1 <area>, G2 <area>, … in this folder. Static pass only
(git reads, greps); nothing ran.

| Group | GAP H | GAP M | UNSURE | GAP L | PORTED | REMOVED ON PURPOSE |
|---|---|---|---|---|---|---|
| G1 <area> | | | | | | |
| Sum (with duplicates) | | | | | | |

Duplicates across groups (one cause each): <cause> (G2, G4); … Unique GAP H ≈ <n>.

## GAP H by theme (unique causes)

A. <theme, for example delivery>
- A1 <cause in one line> (<group row IDs>, <checked by hand | inferred>).

B. <theme> …

## Notes
- Which branch production runs, and how Step 0 proved it.
- Docs that disagree with the code (decision rows with no code, code with no decision row).
- Root cause (process): <why the rewrite lost the rules>.
```

## UNITS.md

```markdown
# Patch units of the <repo> re-port (<date>)

Sources: SUMMARY.md and G1–G<n>.md in this folder (static audit, <refactor branch> <sha>). Each GAP H, GAP M and
UNSURE row is in exactly one unit. Row IDs: <how rows with no number are counted, for example "G2-H1 = first GAP
H row of G2">. Paths of "current place" are under `<source folder>` at <sha>.

**Pre-existing in prod:** `git merge-base --is-ancestor` shows that <shas> are ancestors of <reference branch>
(<sha>). All other deleting commits cited (<shas>) are not. Rows from <shas> are marked "yes".

**Conflict group:** units that change the same function were merged into one unit (the merged rows are listed in
"source rows"). The label groups units that change the same file or the same reader/writer seam: the lead merges
them in sequence. "—" = no conflict group. Same-function merges are judged from the audit line ranges: the lead
checks them again.

Old-path shorthands: `<xx>` = `<sha>^:<path>`; …

## Units

### H (<n>)

| unit | sev | title (behaviour for the user / system) | source rows | old reference | current place to change | decisions cited | bench-only | pre-existing in prod | conflict group |
|---|---|---|---|---|---|---|---|---|---|
| U01 | H | <behaviour that must be true> | G4-H1 | `<xx>:<function>` | `<file>:<function>` | <IDs or —> | no | no | — |

### M (<n>)

### UNSURE (<n>)

## Counts

**H <n> · M <n> · UNSURE <n> · total <n> units. <n> conflict groups.** Pre-existing in prod: <unit list>.
Bench-only: <unit list>.

Conflict groups (units): CG-<name> (<units>) · …

## Same-function merges (rows → one unit)

U<nn> (<rows>: one reader `<function>` and its call), …

## Removed on purpose

<Rows with a decision, or "None of the GAP H, GAP M or UNSURE rows">. A possible supersession stays a unit.

## Notes for the lead

- <Disagreements between the sources, for example two claims about the production branch.>
- No fix is chosen here. Places are the auditors' evidence; "place to confirm" means the audit named no function.

### Added by the operator

| U<nn> | <sev> | <follow-up behaviour> | <patch report or merge-log entry> | <old reference> | <place> | <IDs> | no | no | <CG or "after U<nn>"> |
```

Number the follow-up units from a new range above the last unit (for example the next hundred), so that no unit
ID moves.
