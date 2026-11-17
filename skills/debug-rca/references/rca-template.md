# RCA: <one-line symptom>

| Item | Value |
| --- | --- |
| Status | investigating / root causes confirmed (the completeness gate passed) / fixed |
| Causes | <the number of root causes found> |
| Severity | What it costs while it is not fixed: wrong money, data of another tenant or customer, lost work, noise |

## Symptom

What was observed, in the words of the reporter, with the exact command that fails and its output. Not what you
think is wrong: what was seen.

```
$ <the project's `test` command> <path to the test file>
FAILED test_retry_handler::test_message_runs_once - assert 2 == 1
```

## Symptom map

| # | Symptom (as reported or found) | Path and data | Cause | Failing test |
| --- | --- | --- | --- | --- |
| S1 | <what was seen> | <operation, entity, locale, data> | C1 | `<test name>` |

## Reproduction

The single command that fails every time, and what the reader needs to get there. Examples: the project's
`setup`, a test database from `test-db:copy`, a fixture, a setting. If the defect is intermittent, say so and give the observed
rate. That is a finding, not a caveat.

## Hypotheses

| # | Hypothesis | Prediction (what, where) | Observed | Result |
| --- | --- | --- | --- | --- |
| 1 | <X has the wrong value when Y runs, because Z> | `<expression>` at `<file:line>` is `<value>` | `<value>` | confirmed / refuted |

## Root causes

One part for each cause (C1, C2, …). For each: the specific line, and the design decision behind it. Continue to ask
_why_ until the answer is not a mechanism.

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

## Variant matrix

| Axis | Value | Cause | Test, or "not applicable" and why |
| --- | --- | --- | --- |
| Twin path | global | C1 | `<test name>` |

## Twins and history

What you searched for (the faulty expression, the helper, the parallel operation), with the command, and what you
found. A root cause found once usually acts in more than one place.

## Adjacent rules

| Rule | Source | The obvious fix that breaks it | Guard test (passes now) |
| --- | --- | --- | --- |
| <a status change needs status access> | `docs/spec.md` | <draft all locales without the access check> | `<test name>` |

## Fix spec

The input of `shark:code-writer`. Write behaviour, not a patch.

- **After the fix:** <what must be true, as behaviour>.
- **Files:** `<file>` (<why>); `<file>` (<why>).
- **Causes:** one part for each cause, C1, C2, …, each with the parts below.
- **Regression tests:** `<test file>` › `<test name>`, one for each cause and variant. They fail now and must pass
  after the fix.
- **Guard tests:** `<test file>` › `<test name>`, one for each adjacent rule. They pass now and must still pass.
- **Rejected:** <the obvious or narrower fix, and the symptom that it leaves or the adjacent rule that it breaks>.
  The next person will think of it too.
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
