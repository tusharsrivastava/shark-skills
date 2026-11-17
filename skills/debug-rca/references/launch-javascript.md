# Launch recipe: JavaScript and TypeScript (Node, js-debug)

Part of `shark:debug-rca` › "Launch: one test under the debugger". Read the general recipe there first.

Status: partly verified on a Vitest 5 monorepo (Payload CMS). Record what you observe in your report, so that this
section can be corrected.

- **Launch mode does not reach test workers.** A runner that runs tests in child processes or worker threads (Vitest
  by default) keeps the breakpoint "Unbound": the adapter attaches to the main process only. Observed with Vitest 5.
- **Attach mode reaches the worker.** Start the runner yourself in the background with its inspector option, then
  attach: `vitest run --inspect-brk=127.0.0.1:<port> --no-file-parallelism <test file> -t "<name>"`, and create the
  debug session with `host` and `port`. The session pauses at the start of the test file. Observed.
- **A runner that transforms modules can keep source breakpoints unbound.** Vite's module runner evaluates the
  transformed code itself, and a breakpoint on the `.ts` source did not bind in Vitest 5. Observed. Then use a
  probe: a test with a precise assertion that prints the value, or a temporary log line that you delete before you
  finish. The value is still observed.
- The adapter can ignore `executablePath` and use the `node` on the `PATH`. Check the first output line.

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
