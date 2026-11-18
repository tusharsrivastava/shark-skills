# Debug mode

Use this mode for a bug report with two or more symptoms, a defect in a twin path that the report names
(two separate code paths that implement the same behaviour, such as collection and global operations), or a
one-symptom defect that the direct path could not
reproduce or fix (operator §0, first check). A one-symptom defect with no named twin path starts on the direct path:
fix it with the test first, and keep the scope rule (operator §9).

The behaviour is wrong. The value of this mode is a root cause that observed values prove, a test that holds it,
and a fix written against that diagnosis.

## Interview: intake, all in one message

The reporter knows the answers already. Ask for all missing items in one message:

- **Symptom**, in the words of the reporter: what they saw.
- **Expected**: what they had to see instead.
- **Steps**: how to get there. The request, the command, the data, the tenant or account, the role.
- **Frequency**: every time, sometimes, or one time.
- **Since when**: always, or after a known change.
- **What makes it stop**, if anything: a restart, a retry, time.

A failing test or a stack trace answers most of these items. Ask only for what it does not answer. **Done when**
`shark:code-debugger` can write a reproduction from what you have.

## Workflow

Scripts are in `shark:debug-rca`: `rca-gate.mjs`, `zone-tree.mjs`, `debuggee.mjs`. The zone method, the briefs and
the reports are in its reference `zones.md`. Read it before step 1.

1. **Properties (you).** Write each observation of the report as a row, and the property that it breaks: a rule
   that must hold for every operation, input and actor (`zones.md` § 1). Keep the report word for word next to the
   table. Read only what you need to name the area, the entities and the test command. Do not investigate causes:
   that narrows the zones to your first theory. Then add the four default properties of `zones.md` § 1 (D-ISO,
   D-GUARD, D-TWIN, D-INPUT), written for the area. They do not depend on the wording of the report. Give the
   progress in one line.
2. **Zones (you).** Cross each property with the axis checklist (operations, input kinds, guards × scopes, twins)
   and keep the cells where the property can break (`zones.md` § 2). A one-symptom defect that comes here after a failed
   direct attempt is one zone: send it to one `shark:code-debugger` in single mode, with what the direct attempt
   observed, and continue at step 4 with its RCA. Never fan out zones for a one-symptom report.
3. **Fan out (you).** Make a tree for each zone (`zone-tree.mjs create <zone id>`). Start one `shark:code-debugger`
   for each zone, **all in one message and in the foreground**, each with the zone brief of `zones.md` § 3: the
   report word for word, its property, axis and cells, its tree, its own test file, the test command, and a timebox
   of 25 minutes. Its effort is medium; ask for `higher` for a zone on concurrency, timing or data order.
4. **Merge (`shark:code-debugger`, merge mode).** Send it the zone reports and the trees. It applies the zone
   tests, combines the causes, writes the RCA with the Properties and Rounds tables, closes the spec with
   `shark:solution-spec`, runs `rca-gate.mjs check` and `run --phase before`, and removes the trees.
   - **Iteration.** If its Rounds table has a trigger (an unexplained observation, a property with no result,
     two zones in conflict, an adversarial gap that needs investigation), start round 2 for the zones that the
     triggers name, in one message, with the trigger in each brief. Then continue the same merge agent with
     `SendMessage`. **One extra round at most.** A trigger that is still open after round 2 goes to step 5.
   - **Check what the script cannot:** observed values support each cause; each property has causes or tests that
     show that it holds; the guards on the path match the conditions that you can see in the code.
5. **Architect, only when the diagnosis is not conclusive.** The conditions: `rca-gate.mjs` still fails after
   round 2, a trigger is "open: step 5", two causes need opposite behaviour from the same code, or an ask-first
   decision is open. Send the RCA and the open items to `shark:architect` with `model: fable` and `effort: medium`,
   in its step-5 role: it corrects the spec as rows, tests and decisions, and it names each new test. Send its
   corrections to the merge agent (`SendMessage`), which writes the tests and runs the gate again.
6. **Fix (`shark:code-writer`).** Send the closed spec with every part. A closed spec goes to `sonnet`. If the
   `sonnet` run breaks a guard test or a baseline test, send it back once with the failure output; after a second
   failure, start `shark:code-writer` again with `model: opus`. Stop for the user only for an ask-first case of
   operator §9. **Done when** `rca-gate.mjs run <rca.md> --phase after --cmd '<test command>'` exits with 0, and
   the gate of `## Test scope` passes (scoped by default). Run the gate in the background.
7. **Report** the properties, the causes, the key evidence and the fix together.
8. **Improve the method.** If an agent reports that `shark:debug-rca` or the debugger tools gave wrong guidance,
   verify the claim. Then write a finding for the kit owner as a Markdown note: the skill file, the wrong guidance
   and the observed result. Do not edit the installed plugin copy, because an update replaces it.
9. **Record** each defect that stays without a fix in the handoff file (`shark:handoff`, section Queue), with its
   root cause and its failing test.

Timeboxes: 25 minutes for each zone, 15 minutes for the merge. A round takes about 40 minutes of wall time.

## Reporting: evidence level

- The root cause and the proximate cause, each with `file:line`.
- The evidence table: location, expression, expected value, observed value.
- The hypotheses that you tried, one line each, with the observation that decided each one.
- The regression test by name, failing before the fix and passing after it.
- The blast radius: other paths through the same code. For an isolation, money or permission defect, state if
  data of another tenant or account was visible or changed.

## Register

Investigative. Label each claim as observed or inferred, and keep the two apart. The user decides whether to act
on the difference.
