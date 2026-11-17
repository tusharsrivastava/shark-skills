---
name: debug-rca
description: Debug a defect to its root cause by stepping through the running program with the mcp-debugger tools (create a session, set a breakpoint, start, read the stack, scopes and variables, step or continue, read the output, close), then pin it with a failing regression test and write a root cause analysis (RCA) with observed values and a Fix spec for the code writer. Language-agnostic, with launch notes for Python and JavaScript/TypeScript. Use when a test fails for a reason that is not clear, when behaviour contradicts the code as you read it, when a bug is intermittent, when a scenario or agent run fails and you must find why, or when the user asks for "debug", "root cause", "RCA", "why does this fail", or "step through it".
---

# Debug to a root cause

A debugger removes the need to guess. That is its full value, and it is the value that is easiest to lose. An
agent with many debug tools and no method sets fifteen breakpoints and steps two hundred times. Then it writes a
story that sounds like an explanation but contains no observation.

The method below makes the difference. The tools are the easy part.

This skill is the method of the `shark:code-debugger` agent. The agent finds the root cause, pins it with one
failing test, and returns a Fix spec. The `shark:code-writer` agent then makes the fix. The two jobs stay
separate, so that the fix rests on a diagnosis that another person can read.

## Project values

Read the project's `AGENTS.md` (or `CLAUDE.md`) first. This skill uses these sections:

| Section | Used for |
| --- | --- |
| `## Commands` › `test <paths>` | The command that runs one test without the debugger |
| `## Commands` › `setup`, `test-db:copy` | The environment and a test database for the reproduction |
| `## Invariants`, `## Architecture rules` | Rules that a defect often breaks: read them before the hypothesis |
| `## Docs layout` | The handbook or the pitfalls chapter of the area, and the decisions log |
| `## Secrets` | The files that you never read; how the environment is loaded at runtime |

If a section is missing, ask the user once. Suggest adding it to `AGENTS.md`.

## Before you start the debugger

**Reproduce the defect every time.** If you cannot cause a defect when you want, you cannot find its root cause.
You will "fix" it and never know. Get one command that fails every time. If the defect is intermittent, that _is_
the first finding. Say so, and look for the source of the nondeterminism first: order, time, concurrency, cached
state, a test that leaks state into the next test.

If the report is a description from a user and the tests pass, write the reproduction yourself. The test does
the reported steps and asserts the value that the user saw. **Run it without the debugger first**, with the
project's `test <path>`. One run shows that the defect is real and that the test loads. Then a launch problem
cannot look like the defect.

**Read the failure first.** Read the traceback, the assertion diff, the actual value. The error text fully
explains many defects. To attach a debugger to those is theater.

**Read the rules of the area.** Read the project's `## Invariants` and the handbook chapter of the area. Many rules
exist because of a specific failure. A defect often is one of those rules broken.

**Write down the hypothesis** in one sentence: _"I think that X has the wrong value when Y runs, because Z"_. A
breakpoint without a hypothesis is sightseeing: you look at what the screen shows, and you conclude what it
suggests.

Keep a hypotheses table while you work. It goes into the report and the RCA:

| # | Hypothesis | Prediction (what you expect to observe, where) | Observed | Result |
| --- | --- | --- | --- | --- |
| 1 | `<X>` is empty when `<Y>` runs, because `<Z>` | `<expression>` at `<file:line>` is `<value>` | `<value>` | confirmed / refuted |

## The golden path of the mcp-debugger tools

The kit declares the mcp-debugger server in its `.mcp.json`. In a plugin, its tools have a long namespaced ID.
Find them by function: the tools are deferred, so load them with ToolSearch (query `mcp-debugger`) before the
first call. The short tool names below are the names in the server's documentation.

| Step | Tool function | Notes |
| --- | --- | --- |
| 1 | Create a debug session (`create_debug_session`) | Give the language. Give the interpreter of the project as `executablePath` |
| 2 | Set a breakpoint (`set_breakpoint`) | ABSOLUTE file path. Prefer `statement` (the line text) or `function` to a line number |
| 3 | Start the program (`start_debugging`) | ABSOLUTE `scriptPath`: the entry script of the test runner, not the interpreter binary |
| 4 | Read the stack (`get_stack_trace`) | Each frame has an `id` |
| 5 | Read the scopes (`get_scopes`) | Give the `frameId` from the stack frame |
| 6 | Read the values (`get_variables`, `get_local_variables`, `evaluate_expression`) | Expand a value that has a `variablesReference` |
| 7 | Step or continue (`step_over`, `step_into`, `step_out`, `continue_execution`) | Only while the session is paused |
| 8 | Read the program output (`get_output`) | Pass the returned cursor back to read only new lines |
| 9 | Close the session (`close_debug_session`) | Always, also after a failure. A session holds a process |

Other tool functions that help:

- **Logpoint:** a breakpoint with `logMessage` (`"order={order_id}"`) writes to the output and does not pause.
  It is the safe way to watch a hot path.
- **Move the window:** list, remove and clear breakpoints while the program runs, to move a bisection window
  without a restart.
- **Restart:** restart the session with the same configuration; the breakpoints apply again, and the output
  buffer starts from zero.
- **Attach:** connect to a process that waits under a listener (a container, a remote host, a pod with a port
  forward). See "Attach to a running process".
- **Expose:** give a read-only mirror of the session to the human's IDE. Execution control stays with you.

A breakpoint can stay unverified until its module loads. That is normal. If the response says "requested line N,
bound to line M", trust the bound line. Pass `expectedContent` with a line number to catch an off-by-one line
before it wastes a session.

## The loop

1. **Set the breakpoint at the boundary, not at the crash.** The crash site shows the symptom. The boundary is
   where correct state becomes incorrect. Put the breakpoint where the value _enters_ the suspect region.
2. **Observe. Do not infer.** Read the actual values with the variable and evaluate tools. "It must be empty
   here" is the sentence that comes before most lost hours.
3. **Bisect the state.** Find the last point where the state is correct, and the first point where it is wrong.
   The defect is between those two points. This is the method of `git bisect`, applied to execution instead of
   history.
4. **Confirm by prediction.** Before the last step, say what you expect to see. If the prediction is correct, you
   understand the defect. If it is not correct, your hypothesis was wrong and you learned something. Start again
   at step 1. Do not change the story to fit the observation.
5. **Separate the root cause from the proximate cause.** "The value was empty" is proximate. "Nothing sets it,
   because the unit of work ran without the tenant context" is root. Continue to ask _why_ until the next answer
   is a design decision, not a mechanism.
6. **Close the session.** A session holds a process.

## Restraint

- **Few breakpoints.** Two or three, moved on purpose, are better than fifteen set by guess. You must reason
  about each breakpoint that you add.
- **Prefer evaluate to stepping.** One expression often answers what fifty steps answer.
- **Do not step through library or framework code** unless the evidence points there. It usually does not. Turn
  on "just my code" where the adapter has it.
- **Stop when the observation confirms the hypothesis.** If you continue to explore after the answer, a clear
  finding becomes unclear.
- **Read the code to make the hypothesis: that is the method, not a shortcut.** The debugger adds the Evidence:
  observed values that confirm a prediction. A cause that you found by reading and did not observe is only a
  hypothesis.

## Observed and inferred

Label each statement of the report and the RCA:

| Label | Use it when |
| --- | --- |
| Observed | You read the value in the debugger, in the program output, in a log, or in a database row |
| Inferred | It follows from observed values, but you did not see it directly |

A root cause that is only inferred stays a hypothesis in the RCA status ("investigating"), not "root cause
confirmed".

## Launch: one test under the debugger

Debug one test, not the full suite. Use the interpreter and the dependencies of the project, never a global one.
The general recipe, for each language:

1. Check that the debug adapter is installed for the interpreter of the project.
2. Create the session with the interpreter of the project.
3. Start the entry script of the test runner as `scriptPath`, with the ID of one test in `args`.
4. Turn off parallel workers and caches of the runner, so that one process runs the test.
5. Set the environment that the project's `test` command sets (a settings module, a test flag). Never copy a
   secret value into a launch configuration: the project loads secrets at runtime (`## Secrets`).

### Python (debugpy)

Status: observed in several sessions with pytest.

```jsonc
// create a debug session
{ "language": "python", "executablePath": "<abs>/<venv>/bin/python" }

// start the program
{
  "language": "python",
  "scriptPath": "<abs>/<venv>/bin/pytest",           // the pytest entry script, NOT the python binary
  "args": ["<test id>", "-p", "no:cacheprovider", "-x", "-q", "-s"],
  "adapterLaunchConfig": {
    "python": "<abs>/<venv>/bin/python",
    "cwd": "<abs repository root>",
    "env": { "<SETTINGS_VARIABLE>": "<test settings>" },
    "justMyCode": true
  }
}
```

- A pytest test ID has the form `<path>/test_file.py::test_name`.
- **Give the interpreter as `executablePath`** when you create the session. `adapterLaunchConfig.python` alone
  is not sufficient: the start then fails with "debugpy not installed for <system python>". `executablePath`
  overrides `adapterLaunchConfig.python`. To change the interpreter, close the session and create a new one.
- **`scriptPath` is a source file.** The interpreter binary with `args: ["-m", "pytest", …]` fails at once with
  `SyntaxError: source code string cannot contain null bytes`. The start then returns `"state": "stopped"`, and
  the next call says "Session is terminated". Only the output shows the cause. A driver script that calls
  `pytest.main([...])` also works as `scriptPath`.
- First check: `<venv>/bin/python -c "import debugpy"`. If the import fails, install `debugpy` into a local
  environment only (for example a worktree environment), never into the lock file.
- `-p no:cacheprovider` keeps pytest from writing its cache during the run. Turn off `pytest-xdist` workers
  (`-p no:xdist` or `-n 0`): a worker is a second process, and it can build a new test database.
- If the default options of the project leave out a test marker (for example integration tests), add the marker
  to `args` (`-m integration`). Else pytest deselects the test and the session ends at once.
- Wrap an expression in `repr(...)` to see nested values: the evaluate tool shows nested tuples as `(...)`. Ask
  for names directly: `locals()` mixes in the module globals.
- A `logMessage` does not accept `!r`: `{x!r}` prints only "invalid syntax". Write `{repr(x)}`.
- A breakpoint on a line with a generator expression can stop next in the `<genexpr>` frame, where the locals of
  the function are not visible. Put the breakpoint on the line before it, or use a logpoint.

### JavaScript and TypeScript (Node, js-debug)

Status: inferred from the server documentation. No session of this kit has verified this recipe yet. Record what
you observe in your report, so that this section can be corrected.

```jsonc
// create a debug session
{ "language": "javascript", "executablePath": "<abs>/<node binary of the project>" }

// start the program: the runner's JS entry file, not a shell wrapper in node_modules/.bin
{
  "language": "javascript",
  "scriptPath": "<abs>/node_modules/<runner>/<entry>.mjs",
  "args": ["<runner subcommand>", "<test file>", "-t", "<test name>"],
  "adapterLaunchConfig": { "cwd": "<abs repository root>", "env": { "NODE_ENV": "test" } }
}
```

- **Run one process.** Turn off the workers of the runner (Jest: `--runInBand`; Vitest: `--no-file-parallelism`
  or a single-fork pool). A test that runs in a worker does not stop at a breakpoint of the main process. To
  confirm for the runner version of the project.
- **`scriptPath` is a JavaScript file.** A file in `node_modules/.bin` is often a shell wrapper. Point to the
  JavaScript entry that the wrapper calls.
- **TypeScript needs source maps.** A breakpoint on a `.ts` file binds through the source map. If it stays
  unverified after the module loaded, check the source maps. Set `"sourceMap": true` in `tsconfig.json`, or the
  source-map option of the loader.
- A `function` breakpoint takes the dotted runtime path of the function. A function in a module that loads late
  binds at the next pause.
- An `async` call chain shows across `await` only when the adapter keeps async stack traces. Put the breakpoint
  after the `await` that gives the value, not before it.

### Other languages

The server also has adapters for Go, Rust, Ruby, Java, .NET and C/C++. The recipe is the same: the project
interpreter or the debug build, one test, one process. Logpoints do not work in Java and .NET. Ruby does not stop
on uncaught exceptions by default.

## Attach to a running process

Use attach when the test runs in a container, on another host, or under an interpreter that the server cannot
launch.

1. Start the test under a listener that waits for the debugger before the test starts. Examples:
   - Python: `python -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m pytest <test id>`;
   - Node: `node --inspect-brk=0.0.0.0:9229 <runner entry> <test file>`.
2. Publish the port of the container (for example `-p 5678:5678`).
3. Wait until the listener is up. An attach before the listener is up fails with "Proxy exited during
   initialization".
4. Attach with the host and the port.
5. Set breakpoints on the paths that the target process sees (the container paths), not on the host paths. Use
   `line`: read the line number from the host copy of the file.
6. To debug code that is not the main checkout (a worktree, an export), mount it at the source path of the
   container.

**CAUTION:** In one session, `pathMappings` had no effect in attach mode. A breakpoint on a host path stayed
unverified ("Breakpoint in file that does not exist"). The `statement` and `expectedContent` options need a
source file that the server can read, so they fail on a container path. Use container paths and line numbers.

## Observe the database

Observe the database while the debugger holds the test at a breakpoint.

- A test that runs inside one transaction (the default of many test frameworks) rolls back its rows at the end.
  Another connection does not see these rows until a commit. To observe the rows from a second client, debug a
  test in the mode that commits, or evaluate the query in the test process.
- A session-local setting (a tenant context, a role, a search path) is local to its transaction or connection. In
  a client in autocommit mode, the setting is gone at the next statement. Set it and query inside one
  transaction, then roll back.
- Observe as the runtime role of the application, not as an administrator. An administrator role can bypass the
  row rules that cause the defect.

## Read the responses of the tools

- **`"state": "stopped"` right after the start can mean that the process already exited**, often with an import
  error or a database error. Read the output first.
- **A breakpoint that stays unbound** after the program started has one of two causes. The file did not load in
  the process of the debugger, or the path is not absolute.
- **An evaluated method call runs.** A cache read can change the counters of the cache. A query costs a round
  trip inside the test transaction. Read fields directly when you can.
- **A caller's variables need its `frameId`** from the stack. Without it, the evaluation runs in the top frame.
- **After a continue, wait for a new stop** before you read the stack. Right after the continue, the stack can be
  empty, with the old stop time. The list of sessions shows the new stop.
- **A fast program with only logpoints ends in about 1 s.** The session then reports "stopped". That is not a
  failure: read the output for the logpoint lines.
- **Redacted values.** The server masks values that look like credentials (`<redacted:…>`). The program state is
  not changed. Do not try to read a secret: the project's `## Secrets` rules apply in the debugger too.

## Failures of scenario runs and LLM agents

A failure can be in a saved scenario run: an evaluation, a bench, an agent conversation. Then the saved run
files are often the only evidence of the model run.

1. Read the saved run file of the failed case before any replay. Its records hold what the code decided.
2. Form the hypothesis from those fields.
3. Replay the case offline, with a scripted model (a fake) and no live model call. The breakpoint then stops at
   the boundary that you want.

The method and a replay skeleton are in `references/replay-saved-runs.md` in this skill folder. To classify many
failed cases, use the classification of `shark:goal-loop`.

## Time and history

- **A test that went red "after many merges": pin the date first.** A test clock that moves with the real date
  (for example "the most recent Monday") can make an absolute date in a test fail. Run the test again with an
  older fixed date before you bisect. If it passes, look for an absolute date in the test, not for a bad commit.
- **The first bad commit, fast.** Check out only the source folder of each commit (`git checkout <commit> --
  <source folder>`) and run the failing test. Limit: a file that a later commit added stays in the tree. Check the
  result against a clean checkout of the bad commit. Restore the tree when you finish.
- **Long runs.** Start a long run (a gate, a suite) as a background task and wait for its notice. A foreground
  wait loop moves to the background after a few minutes and cannot wait for a long run.

## Everything else

- Stop a running local worker or scheduler before you debug code that it also runs, so that it does not take the
  same jobs.
- The kit `.mcp.json` writes the server log to `.claude/mcp-debugger.log` in the working directory, with run
  folders next to it. Make sure that git ignores them (`shark:gitignore`). Leave them.

## Without the debugger

If the MCP server is not available, the method still applies: hypothesis, boundary, bisect the state, confirm by
prediction. Use a temporary probe as the instrument: an assertion in the regression test, or a log line that you
delete before you finish. Label each result "inferred", because the confidence that you can give is lower.

If the tools do not show, check the server with `/mcp` or `claude mcp list`. The kit pins the server version,
so the debugger does not change during an investigation.

## What you can change

- **Temporary probes:** a driver script or a probe test. Keep each probe untracked, and delete it before you
  finish.
- **One regression test**, in the test file that owns the behaviour. It must fail today, for the reason that the
  RCA gives. Name it as a behaviour sentence, in the style of the tests near it. If the project tags tests with a
  business-rule ID, tag it. Run it and quote the failure. Write no explanation comments in it: the test name gives
  the behaviour, and the RCA gives the reason. A test docstring is allowed, in ASD-STE100: one sentence that says
  what the test proves, with no notes in brackets.
- **Nothing else.** Do not change production code, migrations, settings or configuration. If you must change code
  to observe the defect, say in the report what you changed and why, and undo it.

## The RCA

Write it only after an observation confirmed the hypothesis. The template is `references/rca-template.md` in this
skill folder (`${CLAUDE_PLUGIN_ROOT}/skills/debug-rca/references/rca-template.md`). Find it relative to this
skill, never with a fixed path. Write it as a Markdown file, and give its full path.

The section that gives the document its value is **Evidence**: actual observed values at named locations. An RCA
without observed values is a hypothesis with formatting, and the next person cannot tell the difference.

The **Fix spec** section is the input of `shark:code-writer`. Write it as a spec, not as a patch:

- what must be true after the fix, as behaviour;
- the files that are involved, and why;
- the regression test, by name, which must pass after the fix;
- a narrower fix that you rejected, and why;
- what the fix must not change: the callers that depend on the current behaviour.

Leave the implementation decisions to the writer. If you saw a decision that matters, state the constraint that
decides it, not the line to type.

End with **Prevention**: the test that catches this defect, and what catches the whole class of defect. A root
cause analysis that does not end in a test is an essay.

## Finish

1. Close every debug session.
2. Make sure that no debuggee that you started still runs (for example `pgrep -fl debugpy`, `pgrep -fl inspect`).
3. Delete the probes. `git status` shows only the regression test.
4. Run the project's `typecheck` with no paths, so that it uses the project configuration. A type checker on
   single files can give false import errors.

## Report (outcome first, ASD-STE100)

- The root cause and the proximate cause, each with `file:line`.
- The hypotheses table: each hypothesis, its prediction, and whether an observation confirmed it.
- The observed values that make the evidence (labelled observed or inferred).
- The regression test, and its failure output now.
- The Fix spec.
- The full path of the RCA file.
- Where this skill or the tools gave wrong guidance, exactly, so that the skill can be corrected.
