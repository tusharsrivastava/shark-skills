# RCA: <one-line symptom>

| Item | Value |
| --- | --- |
| Status | investigating / root cause confirmed / fixed |
| Severity | What it costs while it is not fixed: wrong money, data of another tenant or customer, lost work, noise |

## Symptom

What was observed, in the words of the reporter, with the exact command that fails and its output. Not what you
think is wrong: what was seen.

```
$ <the project's `test` command> <path to the test file>
FAILED test_retry_handler::test_message_runs_once - assert 2 == 1
```

## Reproduction

The single command that fails every time, and what the reader needs to get there. Examples: the project's
`setup`, a test database from `test-db:copy`, a fixture, a setting. If the defect is intermittent, say so and give the observed
rate. That is a finding, not a caveat.

## Hypotheses

| # | Hypothesis | Prediction (what, where) | Observed | Result |
| --- | --- | --- | --- | --- |
| 1 | <X has the wrong value when Y runs, because Z> | `<expression>` at `<file:line>` is `<value>` | `<value>` | confirmed / refuted |

## Root cause

The specific line, and the design decision behind it. Continue to ask _why_ until the answer is not a mechanism.

> `claim_message` commits on its own connection, but the handler writes in a different transaction. A crash
> between the two leaves the message claimed with no effect, and a retry claims it again.

Keep this separate from the **proximate cause** ("the count read 2 instead of 1"), which is the symptom one layer
down.

## Evidence

**This section makes the document an analysis, not a hypothesis.** Actual values, observed at named locations, in
the order seen. Label each row: observed (read in the debugger, the output, a log, a row) or inferred.

| Location | Expression | Expected | Observed | Label |
|---|---|---|---|---|
| `retry_handler:140` before the claim | `connection.name` | `default` | `default` | observed |
| `retry_handler:142` in the handler | `transaction.is_open()` | `True` | `True` | observed |
| `claims:95` on the second delivery | `claim_message(name, id)` | `False` | **`True`** | observed |

Say which prediction confirmed the hypothesis: _"if the claim commits on its own, a second delivery after a
handler failure claims again"_. It did.

## Blast radius

What else runs through the same path and is therefore also wrong, if anyone noticed or not. A root cause found
once usually acts in more than one place. List them, or say that you checked and it does not.

## Fix spec

The input of `shark:code-writer`. Write behaviour, not a patch.

- **After the fix:** <what must be true, as behaviour>.
- **Files:** `<file>` (<why>); `<file>` (<why>).
- **Regression test:** `<test file>` › `<test name>`. It fails now and must pass after the fix.
- **Rejected:** <a narrower fix, and why it is not sufficient>. The next person will think of it too.
- **Must not change:** <the callers or the behaviour that depend on the current code>.
- **Constraints:** <a decision that matters, as a constraint: "the claim and the effect commit in one unit of
  work">.
- **Spec or decision:** <the spec rule or the decision that the fix changes, with its path in the project's
  `## Docs layout`; or "none">.

## Prevention

The test that catches this, written and failing before the fix. Name it.

> `<test file>` › `test_a_failed_handler_does_not_keep_the_claim`. It fails before the fix and passes after it.

If an existing test already caught it, name that test. Then say what catches the whole class of defect, not only
this instance. Examples: an architecture test, an invariant check, a type, a lint rule, an import contract.

A value can be hard to observe: private, cached, or visible only inside a transaction. Then name what makes it
visible: a returned value, a log event, an audit row, a counter.

If no test can catch it, say why. Then name what changes instead: a type, an invariant, a lint rule, an import
contract, a deleted affordance.
