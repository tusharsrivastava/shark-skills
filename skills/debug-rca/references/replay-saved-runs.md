# Failures of scenario runs: the saved run files and the offline replay

A **scenario run** is a recorded run of the system on a scripted case: an evaluation, a bench card, an agent
conversation, an end-to-end replay. When a case fails, the saved run file is often the only evidence of what the
model and the code did. Read it before you start a debugger.

## 1. Read the run file first

Find the saved file of the failed case (for example `<results folder>/<run>/<case>-r<n>.json`). For each step or
turn, it usually holds what the code decided. Look for these kinds of fields; the names change with the project:

| Kind of field | It shows |
| --- | --- |
| Events of the step | What happened, who did it (code, model, user), with the payload |
| Chosen steps, stage, transition | The path that the code chose, and the state move |
| Refusals | What a check or a gate refused, and why |
| Reply source | Which path wrote the output (code or model), and the reason |
| Tool calls | Each tool call, its result, and whether code or the model made it |
| Checks of the case | Which hard check failed |

Form the hypothesis from these fields. A label or a choice from a model is an **input**, not a defect of the
code. Compare it across the repeats of the same case before you blame the code.

## 2. Replay offline, with no model call

Replay the case with fakes: a scripted model that returns fixed replies, and fakes for every external service.
No live model call and no paid API call in a replay.

Python skeleton (adapt the names to the project):

```python
# <scratch>/replay_case.py; run it from the repository root with the project's interpreter
import asyncio

from <project>.evals.cases import load_cases  # the loader of the scenario cases
from <project>.evals.runner import Runner  # the runner that the bench uses
from tests.fakes import FakeModel  # a fake that matches the model protocol

[case] = [c for c in load_cases("<cases folder>") if c.case_id == "<case id>"]
runner = Runner(model=FakeModel(replies=["<reply>"]), clock_date="<the date of the run>")
result = asyncio.run(runner.run_case(case))
print(result.checks)
```

TypeScript skeleton:

```ts
// <scratch>/replay-case.ts; run it with the project's TS loader
import { loadCases } from "<project>/evals/cases";
import { Runner } from "<project>/evals/runner";
import { FakeModel } from "<project>/test/fakes";

const [testCase] = (await loadCases("<cases folder>")).filter((c) => c.id === "<case id>");
const runner = new Runner({ model: new FakeModel(["<reply>"]), clockDate: "<the date of the run>" });
console.log((await runner.runCase(testCase)).checks);
```

- Use the offline replay for a case with scripted user turns. A case that runs a simulated user also calls a model:
  script that side too, or do not replay it offline.
- Set the inputs that the run used before the runner loads them: the spec or configuration files, the date of the
  run, the settings.
- Fake modules in the test folder are often not part of the installed package. Put the repository root on the
  module path (Python: `PYTHONPATH=.`; Node: the path alias of the test config).
- The fake must match the protocol of the real model port. Check the fake with the type checker.
- The script is the `scriptPath` of the debugger start. A local environment may need the debug adapter first
  (see the launch notes in `SKILL.md`).
- **A fast program with only logpoints ends in about 1 s.** The debugger then reports a stopped session. That is
  not a failure: read the output for the logpoint lines.
