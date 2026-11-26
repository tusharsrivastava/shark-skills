#!/usr/bin/env node
/**
 * Starts, reads and stops a program that waits for a debugger, so that a debug session can attach to it.
 *
 * Usage:
 *   debuggee.mjs start --cmd '<command with {port}>' [--cwd <dir>] [--port <n>] [--timeout <s>] [--ready <regex>]
 *   debuggee.mjs log <id> [--grep <text>] [--tail <n>]
 *   debuggee.mjs status <id>
 *   debuggee.mjs stop <id> | --all
 *   debuggee.mjs list
 *
 * `start` picks a free port, puts it in the command at `{port}`, starts the command in its own process group, and
 * waits until the port accepts a connection. It prints the id, the port, the process ID and the log file. Examples:
 *   --cmd 'node ./node_modules/vitest/vitest.mjs run --inspect-brk=127.0.0.1:{port} --no-file-parallelism t.spec.ts'
 *   --cmd '.venv/bin/python -m debugpy --listen 127.0.0.1:{port} --wait-for-client -m pytest -q tests/test_x.py'
 * `log` prints the output of the program. Logpoint messages of an attached session go to this output.
 * `stop` ends the whole process group and deletes the state and the log. Read the log before you stop.
 *
 * Exit codes: 0 success; 1 the program did not become ready, or it is not running; 2 a usage error.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { debugpyEnv } from "../../code-health/scripts/toolenv.mjs";

export const STATE_DIR = process.env.SHARK_DEBUGGEE_DIR || join(tmpdir(), "shark-debuggee");

const NOTES = [
  "Attach: create the debug session with this host and port. Set breakpoints by line; statement addressing is refused in attach mode.",
  'A breakpoint stays "Unbound" until its module loads, and the status can stay "Unbound" after it binds. Continue, then read the stop reason.',
  "The first stop is the pause of the inspector. Continue again; setup (databases, fixtures) can take 20 s or more before the test code runs.",
  "Logpoint messages go to the program output: read them with `debuggee.mjs log <id> --grep <text>`, not with the session output.",
  "To check that a file binds, set one logpoint there first. If the code ran and the log has no message, the file does not bind: move to a caller or a callee, or use a probe test.",
  "Close the debug session and run `debuggee.mjs stop <id>` when you finish.",
];

/**
 * Finds a free TCP port on the loopback interface.
 *
 * @returns {Promise<number>} The port.
 */
export function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.unref();
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/**
 * Tells if a TCP port accepts a connection.
 *
 * @param {number} port The port on 127.0.0.1.
 * @returns {Promise<boolean>} True when a connection opens.
 */
export function portOpen(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      done(false);
    });
  });
}

/**
 * Tells if a process is alive.
 *
 * @param {number} pid The process ID.
 * @returns {boolean} True when the process exists.
 */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function statePath(id) {
  return join(STATE_DIR, `${id}.json`);
}

function readState(id) {
  const path = statePath(id);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function tail(path, n) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").split("\n").slice(-n).join("\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a command that waits for a debugger, and waits until its port is open.
 *
 * @param {{ cmd: string, cwd?: string, port?: number, timeout?: number, ready?: string }} options
 *   The command with `{port}`, its directory, a fixed port, the wait limit in seconds, a regex of a ready line.
 * @returns {Promise<{ ok: boolean, state: object, message?: string }>} The state of the started program.
 */
export async function start({ cmd, cwd = process.cwd(), port, timeout = 60, ready }) {
  mkdirSync(STATE_DIR, { recursive: true });
  const chosen = port ?? (await freePort());
  const id = `dbg-${chosen}-${Date.now().toString(36)}`;
  const log = join(STATE_DIR, `${id}.log`);
  const fd = openSync(log, "a");
  const command = cmd.replaceAll("{port}", String(chosen));
  // The shark debugpy is first on PYTHONPATH, so `python -m debugpy` works with the project's own interpreter.
  const child = spawn("/bin/sh", ["-c", command], { cwd: resolve(cwd), env: debugpyEnv(), detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  closeSync(fd);
  const state = { id, pid: child.pid, port: chosen, host: "127.0.0.1", log, cwd: resolve(cwd), command, startedAt: new Date().toISOString() };
  writeFileSync(statePath(id), JSON.stringify(state, null, 2));
  const pattern = ready ? new RegExp(ready) : null;
  const limit = Date.now() + timeout * 1000;
  while (Date.now() < limit) {
    if (!alive(child.pid)) {
      return { ok: false, state, message: `The program ended before its port opened. Last output:\n${tail(log, 20)}` };
    }
    const lineReady = pattern ? pattern.test(readFileSync(log, "utf8")) : true;
    if (lineReady && (await portOpen(chosen))) return { ok: true, state };
    await sleep(250);
  }
  return { ok: false, state, message: `The port did not open in ${timeout} s. Last output:\n${tail(log, 20)}` };
}

/**
 * Stops the process group of a started program and deletes its state.
 *
 * @param {string} id The id that `start` printed.
 * @returns {Promise<boolean>} True when the program was found.
 */
export async function stop(id) {
  const state = readState(id);
  if (!state) return false;
  const signal = (sig) => {
    try {
      process.kill(-state.pid, sig);
    } catch {
      try {
        process.kill(state.pid, sig);
      } catch {}
    }
  };
  signal("SIGTERM");
  for (let i = 0; i < 20 && alive(state.pid); i++) await sleep(150);
  if (alive(state.pid)) signal("SIGKILL");
  rmSync(statePath(id), { force: true });
  rmSync(state.log, { force: true });
  return true;
}

/**
 * Lists the started programs that have a state file.
 *
 * @returns {object[]} The state of each program, with `running`.
 */
export function list() {
  if (!existsSync(STATE_DIR)) return [];
  return readdirSync(STATE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(STATE_DIR, f), "utf8")))
    .map((s) => ({ ...s, running: alive(s.pid) }));
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const usage = "usage: debuggee.mjs start --cmd '<command with {port}>' [--cwd <dir>] [--port <n>] [--timeout <s>] [--ready <regex>]\n       debuggee.mjs log <id> [--grep <text>] [--tail <n>] | status <id> | stop <id>|--all | list";
  if (mode === "start") {
    const cmd = opt("cmd");
    if (!cmd || !cmd.includes("{port}")) {
      console.error("debuggee: --cmd must contain {port}.");
      return 2;
    }
    const result = await start({
      cmd,
      cwd: opt("cwd"),
      port: opt("port") ? Number(opt("port")) : undefined,
      timeout: opt("timeout") ? Number(opt("timeout")) : undefined,
      ready: opt("ready"),
    });
    const s = result.state;
    if (!result.ok) {
      console.log(`debuggee: not ready. ${result.message}`);
      await stop(s.id);
      return 1;
    }
    console.log(`debuggee: ready.\nid: ${s.id}\nhost: ${s.host}\nport: ${s.port}\npid: ${s.pid}\nlog: ${s.log}`);
    console.log(NOTES.map((n) => `- ${n}`).join("\n"));
    return 0;
  }
  if (mode === "log" || mode === "status") {
    const id = rest[0];
    const s = id && readState(id);
    if (!s) {
      console.error(`debuggee: no program with the id ${id}. Run \`debuggee.mjs list\`.`);
      return 2;
    }
    if (mode === "status") {
      console.log(`id: ${s.id}\nrunning: ${alive(s.pid)}\nport open: ${await portOpen(s.port)}\nlog: ${s.log}\n--- last output ---\n${tail(s.log, 10)}`);
      return alive(s.pid) ? 0 : 1;
    }
    const lines = readFileSync(s.log, "utf8").split("\n");
    const filter = opt("grep");
    const picked = filter ? lines.filter((l) => l.includes(filter)) : lines;
    const n = opt("tail") ? Number(opt("tail")) : picked.length;
    console.log(picked.slice(-n).join("\n"));
    if (filter) console.log(`debuggee: ${picked.length} lines contain "${filter}".`);
    return 0;
  }
  if (mode === "stop") {
    const ids = rest[0] === "--all" ? list().map((s) => s.id) : rest[0] ? [rest[0]] : [];
    if (ids.length === 0) {
      console.log(rest[0] === "--all" ? "debuggee: nothing to stop." : usage);
      return rest[0] === "--all" ? 0 : 2;
    }
    for (const id of ids) console.log(`debuggee: ${(await stop(id)) ? "stopped" : "not found"} ${id}`);
    return 0;
  }
  if (mode === "list") {
    const all = list();
    if (all.length === 0) console.log("debuggee: no started programs.");
    for (const s of all) console.log(`${s.id}  port ${s.port}  pid ${s.pid}  ${s.running ? "running" : "ended"}  ${s.log}`);
    return 0;
  }
  console.error(usage);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
