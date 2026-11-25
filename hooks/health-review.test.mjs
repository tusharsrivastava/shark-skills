import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_MS, MAX_BLOCKS, changed, review, start } from "./health-review.mjs";

const HOOK = fileURLToPath(new URL("./health-review.mjs", import.meta.url));
const TD = fileURLToPath(new URL("../skills/code-health/scripts/testdata/", import.meta.url));
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "health-review-"));
  dirs.push(d);
  return d;
};
process.env.SHARK_HEALTH_STATE_DIR = tmp();
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const SAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = ?", (customer_id,))\n`;
const UNSAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = " + customer_id)\n`;
const UNSAFE2 = `def other(db, name):\n    return db.execute("SELECT * FROM c WHERE name = '" + name + "'")\n`;

function agents({ cmd = `\`node ${TD}fake-sast.mjs {file}\` and \`node ${TD}fake-lizard.mjs {file}\``, budgets = "" } = {}) {
  return `# AGENTS.md\n\n## Commands\n\n| Key | Command | Note |\n| --- | --- | --- |\n| \`analyze:file\` | ${cmd} | |\n\n${budgets}`;
}

function repo(agentsText = agents(), dir = tmp()) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, { "src/q.py": SAFE, "README.md": "x\n", ...(agentsText ? { "AGENTS.md": agentsText } : {}) });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

let n = 0;
const sid = () => `s${process.pid}-${n++}`;
const stop = (dir, extra = {}) => ({ session_id: sid(), hook_event_name: "Stop", cwd: dir, stop_hook_active: false, ...extra });
const log = (dir) => readFileSync(join(dir, ".git/shark-health/events.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const budgets = (rows) => `## Quality budgets\n\n| Key | Default |\n| --- | --- |\n${rows}`;

describe("the review at the end of the work", () => {
  test("a new finding blocks the stop once, with the digest as the reason", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const r = await review(stop(dir));
    assert.match(r?.block ?? "", /sec\/sql-string-concat/);
    assert.match(r.block, /src\/q\.py/);
    assert.match(r.block, /baseline allow/, "the reason says how to accept a finding on purpose");
    assert.ok(log(dir).some((e) => e.kind === "digest" && e.event === "Stop"));
  });

  test("a clean change, a change to a file that is not source, and a project that did not opt in are silent", async () => {
    const dir = repo();
    write(dir, { "src/q.py": SAFE + "# ok\n", "README.md": "changed\n" });
    assert.equal(await review(stop(dir)), null);
    assert.ok(log(dir).some((e) => e.kind === "clean"));
    const plain = repo(null);
    write(plain, { "src/q.py": UNSAFE });
    assert.equal(await review(stop(plain)), null);
  });

  test("hook.review: off turns it off", async () => {
    const dir = repo(agents({ budgets: budgets("| `hook.review` | `off` |\n") }));
    write(dir, { "src/q.py": UNSAFE });
    assert.equal(await review(stop(dir)), null);
  });

  test("no change since the last review: no analysis at all", async () => {
    const dir = repo();
    write(dir, { "src/q.py": SAFE + "# ok\n" });
    const input = stop(dir);
    assert.equal(await review(input), null);
    const before = log(dir).length;
    assert.equal(await review({ ...input }), null);
    assert.equal(log(dir).length, before, "the second stop did not run the analyzers");
  });

  test("a finding that was told is not told again; a new one is", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const input = stop(dir);
    assert.ok((await review(input))?.block);
    write(dir, { "src/q.py": UNSAFE + "# still here\n" });
    assert.equal(await review({ ...input, stop_hook_active: true }), null, "the same finding after a later edit");
    write(dir, { "src/q.py": UNSAFE + UNSAFE2 });
    assert.match((await review({ ...input, stop_hook_active: true }))?.block ?? "", /L4|other|sql-string-concat/);
  });

  test(`at most ${MAX_BLOCKS} blocks in one session`, async () => {
    const dir = repo();
    const input = stop(dir);
    let blocks = 0;
    for (let i = 0; i < MAX_BLOCKS + 2; i++) {
      write(dir, { [`src/n${i}.py`]: UNSAFE.replace("find", `find${i}`).replace("customer_id)", `customer_id + "${i}")`) });
      if ((await review({ ...input, stop_hook_active: i > 0 }))?.block) blocks++;
    }
    assert.equal(blocks, MAX_BLOCKS);
  });

  test("the base is the commit at the session start: a finding that the agent committed is still reviewed", async () => {
    const dir = repo();
    const s = sid();
    await start({ session_id: s, hook_event_name: "SessionStart", cwd: dir, source: "startup" });
    write(dir, { "src/q.py": UNSAFE });
    git(dir, "commit", "-qam", "agent commit");
    assert.match((await review(stop(dir, { session_id: s })))?.block ?? "", /sec\/sql-string-concat/);
  });

  test("the files with the most changed lines come first", () => {
    const dir = repo();
    write(dir, { "src/small.py": "a = 1\n", "src/big.py": "a = 1\nb = 2\nc = 3\n", "notes.txt": "x\n" });
    const files = changed(dir, git(dir, "rev-parse", "HEAD"), (p) => p.endsWith(".py"));
    assert.deepEqual(files, ["src/big.py", "src/small.py"]);
  });
});

describe("subagents", () => {
  test("SubagentStop reviews shark:code-writer and shark:lead-engineer only", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const sub = (agent_type) => stop(dir, { hook_event_name: "SubagentStop", ...(agent_type ? { agent_type } : {}) });
    assert.equal(await review(sub("Explore")), null);
    assert.equal(await review(sub("shark:code-debugger")), null);
    assert.equal(await review(sub(undefined)), null, "a subagent that is not named is not reviewed");
    assert.ok((await review(sub("shark:code-writer")))?.block);
    assert.ok((await review(sub("shark:lead-engineer")))?.block);
  });
});

describe("analyzers that fail", () => {
  test("a missing analyzer blocks one time with not verified, then lets the agent stop", async () => {
    const dir = repo(agents({ cmd: "`no-such-analyzer-xyz {file}`" }));
    write(dir, { "src/q.py": UNSAFE });
    const input = stop(dir);
    assert.match((await review(input))?.block ?? "", /code-health: not verified \(`no-such-analyzer-xyz` not installed\)/);
    write(dir, { "src/q.py": UNSAFE + "# x\n" });
    assert.equal(await review({ ...input, stop_hook_active: true }), null);
    const kinds = log(dir).filter((e) => e.kind !== "start").map((e) => e.kind);
    assert.deepEqual(kinds, ["not-verified", "not-verified"], "the second review is still not verified, never clean");
  });

  test("a clean result from the other analyzer still says not verified", async () => {
    const dir = repo(agents({ cmd: `\`no-such-sast-xyz {file}\` and \`node ${TD}fake-lizard.mjs {file}\`` }));
    write(dir, { "src/q.py": SAFE + "# ok\n" });
    assert.match((await review(stop(dir)))?.block ?? "", /not verified \(`no-such-sast-xyz` not installed/);
  });
});

describe("multi-repo workspace", () => {
  function workspace() {
    const parent = tmp();
    const ws = repo(`# AGENTS.md: demo workspace\n\n## Repositories\n\n| Name | Path | Remote | Role |\n| --- | --- | --- | --- |\n| api | \`../api\` | none | API |\n| web | \`../web\` | none | UI |\n`, join(parent, "ws"));
    const api = repo(agents(), join(parent, "api"));
    const web = repo(null, join(parent, "web"));
    return { ws, api, web };
  }

  test("a stop in the workspace reviews each repository in ## Repositories with its own project file", async () => {
    const { ws, api, web } = workspace();
    write(api, { "src/q.py": UNSAFE });
    write(web, { "src/q.py": UNSAFE });
    const r = await review(stop(ws));
    assert.match(r?.block ?? "", /\.\.\/api\/src\/q\.py/, "the path names the repository folder");
    assert.doesNotMatch(r.block, /web/, "web did not opt in");
    assert.ok(log(api).some((e) => e.kind === "digest"), "the event goes to the log of that repository");
  });
});

describe("time budget", () => {
  test("files left when the time ends are named as not verified", async () => {
    const dir = repo();
    write(dir, { "src/a.py": SAFE + "# a\n", "src/b.py": SAFE + "# b\nx = 1\n" });
    process.env.FAKE_SAST_SLEEP = "1500";
    try {
      const r = await review(stop(dir), { budgetMs: 2500 });
      assert.match(r?.block ?? "", /not verified[^\n]*no time left/);
    } finally {
      delete process.env.FAKE_SAST_SLEEP;
    }
  });

  test("the budget ends at least 10 s before the timeout of the hook entries in hooks.json", () => {
    const cfg = JSON.parse(readFileSync(fileURLToPath(new URL("./hooks.json", import.meta.url)), "utf8"));
    const entries = ["Stop", "SubagentStop"].flatMap((ev) => (cfg.hooks[ev] ?? []).flatMap((h) => h.hooks));
    const mine = entries.filter((h) => (h.args ?? []).some((a) => a.endsWith("health-review.mjs")));
    assert.equal(mine.length, 2, "one entry for Stop and one for SubagentStop");
    for (const h of mine) {
      assert.equal(h.command, "node");
      assert.ok(h.timeout * 1000 >= BUDGET_MS + 10000, `timeout ${h.timeout} s`);
    }
    const start = (cfg.hooks.SessionStart ?? []).flatMap((h) => h.hooks).filter((h) => (h.args ?? []).includes("start"));
    assert.equal(start.length, 1, "SessionStart records the base");
    assert.ok(!JSON.stringify(cfg).includes("health-edit"), "the per-edit hook is gone");
  });
});

describe("process", () => {
  test("the hook prints the block decision as JSON and exits 0", () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const r = spawnSync("node", [HOOK], { input: JSON.stringify(stop(dir)), encoding: "utf8" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /sec\/sql-string-concat/);
    assert.equal(spawnSync("node", [HOOK], { input: "nope", encoding: "utf8" }).status, 0);
    const s = spawnSync("node", [HOOK, "start"], { input: JSON.stringify({ session_id: sid(), hook_event_name: "SessionStart", cwd: dir }), encoding: "utf8" });
    assert.equal(s.status, 0);
    assert.equal(s.stdout, "");
  });

  test("two reviews that overlap in one session tell a finding one time", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const input = JSON.stringify(stop(dir));
    const env = { ...process.env, FAKE_SAST_SLEEP: "1500" };
    const run = () =>
      new Promise((done) => {
        const p = spawn("node", [HOOK], { env });
        let out = "";
        p.stdout.on("data", (c) => (out += c));
        p.on("close", () => done(out));
        p.stdin.end(input);
      });
    const outs = await Promise.all([run(), run()]);
    assert.equal(outs.filter((o) => /sql-string-concat/.test(o)).length, 1, outs.join(" | "));
  });
});
