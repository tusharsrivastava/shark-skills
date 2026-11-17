# Debug mode

Use this mode for a defect whose cause is not clear, that crosses modules, that the report gives with more than one
symptom, or that sits in a path with a twin (collection and global, single and bulk, two channels). A defect with
one symptom, a clear reproduction and no twin path takes the direct path (operator §0): fix it with the test first,
and keep the scope rule (operator §9).

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

1. **Diagnose.** Send the intake, without changes, to `shark:code-debugger`. The brief gives the report word for
   word. Do not restate it as one mechanism and do not add required semantics: that narrows the investigation to
   your first theory. Put your own observations, if any, in a separate part named "Operator notes (unverified)".
   Do not investigate the code before the brief: read only what you need to name the area and the test command. It loads `shark:debug-rca` and
   returns a root cause analysis (RCA) with every cause it found, a failing regression test for each cause and
   variant, guard tests for the adjacent rules, and a Fix spec. Give the progress in one line.
   Set its reasoning effort when you start it (the `effort` option of the Agent tool). Its default is medium.
   Ask for one step higher (`effort: higher`) when the defect is intermittent, depends on timing, concurrency or
   data, crosses more than one module, or when a medium run did not prove the root cause.
2. **Check the RCA against the completeness gate of `shark:debug-rca`.**
   - Each reported symptom has a row in the symptom map, with a confirmed cause and a failing test.
   - The variant matrix covers the twin paths and the value shapes; each cell has a test or a reason.
   - The adjacent rules have guard tests that pass now, and the Fix spec names the fix that would break them.
   - Observed values in its Evidence section support each cause. Reading the code alone is not sufficient proof.
   - The Fix spec states behaviour and constraints, one part for each cause.

   Send back an RCA that does not meet these conditions. If the RCA quotes the failing output and `git status`
   shows only the test, accept the failure as reported. Run the test again only if the output is missing or does
   not agree with the stated cause. Your own run belongs to step 3, on code that nobody ran yet.
3. **Fix.** Send the Fix spec to `shark:code-writer` directly after a correct RCA (operator §9), with every part
   of it. The writer implements each part; a part that it thinks is not needed comes back to you as a question, it
   is never skipped. Stop for the user
   only for an ask-first case of operator §9. **Done when** every regression test passes, every guard test still
   passes, and the gate of `## Test scope` passes (scoped by default). Run the gate in the background.
4. **Report** the root cause, the key evidence and the fix together.
5. **Improve the method.** If `shark:code-debugger` reports that `shark:debug-rca` or the debugger tools gave
   wrong guidance, verify the claim. Then write a finding for the kit owner as a Markdown note.
   The note gives the skill file, the wrong guidance and the observed result. Do not edit the installed plugin
   copy, because an update replaces it.
6. **Record** each defect that stays without a fix in the handoff file (`shark:handoff`, section Queue). Give its
   root cause and its failing test.

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
