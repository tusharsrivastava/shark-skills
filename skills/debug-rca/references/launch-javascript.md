# Launch recipe: JavaScript and TypeScript (Node, js-debug)

Part of `shark:debug-rca` › "Launch: one test under the debugger". Read the general recipe there first.

Status: verified on a Vitest 5 monorepo (Payload CMS, macOS) with the mcp-debugger attach mode. Record what you
observe in your report, so that this section can be corrected.

- **Launch mode does not reach test workers.** A runner that runs tests in child processes or worker threads (Vitest
  by default) keeps the breakpoint "Unbound": the adapter attaches to the main process only. Observed with Vitest 5.
- **Attach mode reaches the test code.** Start the runner with `debuggee.mjs` and attach with the printed host and
  port. Observed:
  `debuggee.mjs start --cmd 'node ./node_modules/vitest/vitest.mjs run --inspect-brk=127.0.0.1:{port} --no-file-parallelism <test file> -t "<name>"'`.
- **Source maps work for the project source.** Vite gives each `.ts` module an inline source map. A breakpoint on a
  `.ts` line paused at that line, and the stack and the values were correct. Observed. The "Could not read source
  map" messages for packages in `node_modules` (for example `ajv`) are noise.
- **Set breakpoints by line in attach mode.** `statement` addressing is refused ("a class name or remote path").
  Observed.
- **"Unbound" is not a failure.** A breakpoint stays "Unbound" until its module loads, and `list_breakpoints` can
  still show "Unbound" after the breakpoint paused. Observed. Continue, then read the stop reason.
- **The first stop is the inspector pause** ("Paused on debugger statement"). Continue again. Setup (a database
  reset, a seed) can take 20 s or more before the test code runs. Observed.
- **Logpoint messages go to the program output**, not to the session output. Read them with
  `debuggee.mjs log <id> --grep <text>`. Observed.
- **Some modules do not bind.** In Payload, breakpoints and logpoints in `updateByID.ts` and
  `replaceWithDraftIfAvailable.ts` never fired, by line, by a lower-case path, or by function name, while the code
  ran. Breakpoints in `update.ts` in the same package fired. Observed; the cause is not known. Check each file with
  one logpoint first. If it does not fire, move to a caller or a callee that binds, or use a probe test.
- The adapter can ignore `executablePath` and use the `node` on the `PATH`. Check the first output line.

Launch mode, for a runner that runs the test in its main process:

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
- **TypeScript needs source maps.** A breakpoint on a `.ts` file binds through the source map. A loader that
  transforms TypeScript (Vite, `tsx`, `ts-node`) usually gives inline maps. For compiled output, set
  `"sourceMap": true` in `tsconfig.json`.
- A `function` breakpoint takes the dotted runtime path of the function. A function in a module that loads late
  binds at the next pause.
- An `async` call chain shows across `await` only when the adapter keeps async stack traces. Put the breakpoint
  after the `await` that gives the value, not before it.
