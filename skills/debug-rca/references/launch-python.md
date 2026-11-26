# Launch recipe: Python (debugpy)

Part of `shark:debug-rca` › "Launch: one test under the debugger". Read the general recipe there first.

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
- **debugpy comes from the shark tool folder.** The MCP server of the kit puts it on `PYTHONPATH`, so each project
  interpreter can import it without an install in the project. If the start says "debugpy not installed", run
  `/shark:doctor` (it installs the pinned debugpy into that folder after a yes). Never install debugpy into the
  project environment or its lock file. When `adapterLaunchConfig.env` sets `PYTHONPATH`, keep the shark folder in
  it: the server environment has it.
- `-p no:cacheprovider` keeps pytest from writing its cache during the run. Turn off `pytest-xdist` workers
  (`-p no:xdist` or `-n 0`): a worker is a second process, and it can build a new test database.
- If the default options of the project leave out a test marker (for example integration tests), add the marker
  to `args` (`-m integration`). Else pytest deselects the test and the session ends at once.
- Wrap an expression in `repr(...)` to see nested values: the evaluate tool shows nested tuples as `(...)`. Ask
  for names directly: `locals()` mixes in the module globals.
- A `logMessage` does not accept `!r`: `{x!r}` prints only "invalid syntax". Write `{repr(x)}`.
- A breakpoint on a line with a generator expression can stop next in the `<genexpr>` frame, where the locals of
  the function are not visible. Put the breakpoint on the line before it, or use a logpoint.
