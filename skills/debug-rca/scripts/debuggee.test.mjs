import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./debuggee.mjs", import.meta.url));
const stateDir = mkdtempSync(join(tmpdir(), "debuggee-test-"));
const env = { ...process.env, SHARK_DEBUGGEE_DIR: stateDir };
after(() => {
  run("stop", "--all");
  rmSync(stateDir, { recursive: true, force: true });
});

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: "utf8", timeout: 60000 });
}

const field = (out, name) => new RegExp(`^${name}: (.+)$`, "m").exec(out)?.[1];
const node = JSON.stringify(process.execPath);

describe("debuggee", () => {
  test("start waits for the inspector port, log reads the output, stop ends the process", async () => {
    const program = `setInterval(() => {}, 1000); console.log('LOGPOINT value=42')`;
    const started = run("start", "--cmd", `${node} --inspect=127.0.0.1:{port} -e "${program}"`);
    assert.equal(started.status, 0, started.stdout + started.stderr);
    const id = field(started.stdout, "id");
    const port = Number(field(started.stdout, "port"));
    const pid = Number(field(started.stdout, "pid"));
    assert.match(started.stdout, /statement addressing is refused/);

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    assert.ok(targets[0].webSocketDebuggerUrl.includes(`:${port}/`));

    let log = "";
    for (let i = 0; i < 40 && !log.includes("1 lines"); i++) {
      log = run("log", id, "--grep", "LOGPOINT").stdout;
      if (!log.includes("1 lines")) await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(log, /LOGPOINT value=42/);
    assert.match(run("list").stdout, new RegExp(`${id}.*running`));

    assert.equal(run("stop", id).status, 0);
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        gone = true;
      }
    }
    assert.ok(gone, "the process still runs after stop");
    assert.equal(existsSync(join(stateDir, `${id}.json`)), false);
  });

  test("stop ends the children of a shell command too", async () => {
    const started = run("start", "--cmd", `sh -c '${process.execPath} --inspect=127.0.0.1:{port} -e "setInterval(() => {}, 1000)"; echo done'`);
    assert.equal(started.status, 0, started.stdout + started.stderr);
    const port = Number(field(started.stdout, "port"));
    assert.equal(run("stop", field(started.stdout, "id")).status, 0);
    await new Promise((r) => setTimeout(r, 300));
    await assert.rejects(fetch(`http://127.0.0.1:${port}/json/list`));
  });

  test("a program that ends before its port opens is a failure with its output", () => {
    const r = run("start", "--cmd", "echo cannot start on {port}; exit 3", "--timeout", "10");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ended before its port opened/);
    assert.match(r.stdout, /cannot start on \d+/);
    assert.match(run("list").stdout, /no started programs/);
  });

  test("a command with no {port} is a usage error", () => {
    assert.equal(run("start", "--cmd", "node app.js").status, 2);
  });

  test("log of an unknown id is a usage error", () => {
    assert.equal(run("log", "dbg-0-none").status, 2);
  });

  test("stop --all with nothing started succeeds", () => {
    const r = run("stop", "--all");
    assert.equal(r.status, 0);
  });

  test("the log file is deleted on stop", () => {
    const started = run("start", "--cmd", `${node} --inspect=127.0.0.1:{port} -e "setInterval(() => {}, 1000)"`);
    const logPath = field(started.stdout, "log");
    assert.ok(existsSync(logPath));
    assert.ok(readFileSync(logPath, "utf8").includes("Debugger listening"));
    run("stop", field(started.stdout, "id"));
    assert.equal(existsSync(logPath), false);
  });
});
