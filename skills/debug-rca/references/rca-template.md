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

## Properties

From the operator's step 1 (`references/zones.md` § 1). Each property, and its causes or the tests that show that it
holds.

| # | Observation | Property | Zones | Causes, or the tests that show that it holds |
| --- | --- | --- | --- | --- |
| P1 | <what the report says> | <the rule that it breaks> | Z1, Z2 | C1 |
| D-ISO | default | <scope isolation, for this area> | Z3 | <C…, or the tests that show that it holds> |
| D-GUARD | default | <guard preservation, for this area> | Z4 | <…> |
| D-TWIN | default | <twin equivalence, for this area> | Z5 | <…> |
| D-INPUT | default | <input forms, for this area> | Z2 | <…> |

## Rounds

| Round | Zones | Trigger | Status |
| --- | --- | --- | --- |
| 1 | Z1 to Z4 | | done |

A single-zone investigation writes one row: `| 1 | Z1 | | done |`.

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
| Scope | all locales | C1 | `<test name>` |
| Actor | denied by field access | C1 | `<test name>` |
| Value shape | cleared to an empty list | C1 | not applicable: the field has no list type, see `grep -n "type: 'array'" <config file>` |

The Scope and Actor rows are required. "Not applicable" on them needs the search command in backticks.

## Twins and history

What you searched for (the faulty expression, the helper, the parallel operation), with the command, and what you
found. A root cause found once usually acts in more than one place.

## Adjacent rules

| Rule | Source | The obvious fix that breaks it | Guard test (passes now) |
| --- | --- | --- | --- |
| <a status change needs status access> | `docs/spec.md` | <draft all locales without the access check> | `<test name>` |

## Guards on the path

From `shark:solution-spec`, step 1. Each condition that can stop or limit the fix, and what the fix does when it
fires.

| # | Guard | Location | When it fires | The new behaviour when it fires | Test |
| --- | --- | --- | --- | --- | --- |
| G1 | <access check> | `<file:line>` | <the actor cannot …> | <writes nothing> | `<test name>` |

## Behaviour table

From `shark:solution-spec`, steps 2 to 4. One row for each guard, input class and operation that the fix can reach.

| # | Condition | Expected outcome | Test | Kind |
| --- | --- | --- | --- | --- |
| B1 | <operation, scope, input> | <what a caller observes> | `<test name>` | regression / guard |

## Decisions

| # | Question | Decision | Reason | Status |
| --- | --- | --- | --- | --- |
| D1 | <a behaviour question that the report does not decide> | <the decision> | <why> | taken by default, owner to confirm |

## Adversarial check

| Simplest patch | What it breaks | Row added |
| --- | --- | --- |
| <the cheapest patch that passes the tests> | <the row or rule that it breaks> | <B…> |

## Fix spec

The input of `shark:code-writer`. Write behaviour, not a patch.

- **After the fix:** <what must be true, as behaviour>.
- **Files:** `<file>` (<why>); `<file>` (<why>).
- **Causes:** one part for each cause, C1, C2, …, each with the parts below.
- **Regression tests:** one for each cause and variant. They fail now and must pass after the fix.
  - `<test file>` › `<test name>`
- **Guard tests:** one for each adjacent rule. They pass now and must still pass.
  - `<test file>` › `<test name>`
- **Rejected:** <the obvious or narrower fix, and the symptom that it leaves or the adjacent rule that it breaks>.
  The next person will think of it too.
- **Must not change:** the guard rows and the behaviour rows of kind `guard` (G1, B2, …).
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
