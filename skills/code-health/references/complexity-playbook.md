# Complexity playbook

A `cx/ccn` finding means that a function has too many paths. Each `if`, `elif`, loop, `case`, `catch`, `and` and
`or` adds one. Lower it with a move that keeps the behaviour, and keep the tests green after each move.

| Smell | Move |
| --- | --- |
| Nested `if` blocks that check preconditions | **Guard clauses**: return or raise early for each invalid case, then write the main path without nesting. |
| A long `if`/`elif` chain that maps a value to a result or a handler | **Table**: a dict or map from the value to the result or to a function. A new case is a new row, not a new branch. |
| One function that does several steps | **Extract function**: one function for each step, named for what it does. The parent reads as a list of steps. |
| A flag parameter that switches between two behaviours | **Two functions**, one for each behaviour. Callers choose by name. |
| A compound condition repeated in several places | **Name it**: a small predicate function (`is_billable(line)`). |
| A loop with special cases for the first or the last item | Handle the special case before or after the loop. |

- `cx/nloc` (too long): extract function.
- `cx/params` (too many parameters): group the parameters that travel together into one typed object.
- A function that was already over budget: do not make it worse. If your change must add a branch, first extract
  the part that you change, then add the branch in the small function.
- When the brief requires the complex form (a parser, a state machine), accept the finding with
  `health.mjs baseline allow <id> --reason "<why>"` and say so in your report.
