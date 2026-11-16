# Debug mode

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

1. **Diagnose.** Send the intake, without changes, to `shark:code-debugger`. It loads `shark:debug-rca` and
   returns a root cause analysis (RCA), a failing regression test, and a Fix spec. Give the progress in one line.
2. **Check the RCA.**
   - Observed values in its Evidence section support the root cause. Reading the code alone is not sufficient
     proof.
   - The regression test fails now, for the stated reason.
   - The Fix spec states behaviour and constraints.

   Send back an RCA that does not meet these conditions. If the RCA quotes the failing output and `git status`
   shows only the test, accept the failure as reported. Run the test again only if the output is missing or does
   not agree with the stated cause. Your own run belongs to step 3, on code that nobody ran yet.
3. **Fix.** Send the Fix spec to `shark:code-writer` directly after a correct RCA (operator §9). Stop for the user
   only for an ask-first case of operator §9. **Done when** the regression test passes and the gate of
   `## Test scope` passes (scoped by default). Run the gate in the background.
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
