import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { budgetMs, decide as decideRaw, editedLines } from "./health-edit.mjs";

// The default mode is async: these tests call the async entry unless they say otherwise.
const decide = (input, opts = {}) => decideRaw(input, { async: true, ...opts });

const HOOK = fileURLToPath(new URL("./health-edit.mjs", import.meta.url));
const TD = fileURLToPath(new URL("../skills/code-health/scripts/testdata/", import.meta.url));
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "health-hook-"));
  dirs.push(d);
  return d;
};
process.env.SHARK_HEALTH_STATE_DIR = tmp();
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const SAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = ?", (customer_id,))\n`;
const UNSAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = " + customer_id)\n`;

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
const edit = (dir, file, extra = {}) => ({
  session_id: `s${process.pid}-${n++}`, hook_event_name: "PostToolUse", cwd: dir, tool_name: "Edit",
  tool_input: { file_path: join(dir, file), old_string: "?", new_string: "+ customer_id" }, ...extra,
});

describe("when the hook speaks", () => {
  test("a new finding after an Edit gives the digest", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const r = await decide(edit(dir, "src/q.py"));
    assert.match(r.context, /^code-health: 1 new in src\/q.py/);
    assert.match(r.context, /sec\/sql-string-concat {2}L2/);
  });
  test("each decision goes to .git/shark-health/events.log", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    await decide(edit(dir, "src/q.py"));
    const log = readFileSync(join(dir, ".git/shark-health/events.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log.at(-1).kind, "digest");
    assert.deepEqual(log.at(-1).files, ["src/q.py"]);
    assert.match(log.at(-1).text, /code-health: 1 new/);
  });
  test("a clean edit, a file that is not source, and another agent are silent", async () => {
    const dir = repo();
    write(dir, { "src/q.py": SAFE + "# ok\n", "README.md": "y\n" });
    assert.equal(await decide(edit(dir, "src/q.py")), null);
    assert.equal(await decide(edit(dir, "README.md")), null);
    write(dir, { "src/q.py": UNSAFE });
    assert.equal(await decide(edit(dir, "src/q.py", { agent_type: "shark:code-debugger" })), null);
    assert.ok(await decide(edit(dir, "src/q.py", { agent_type: "shark:code-writer" })));
  });
  test("silent in a project that did not opt in, and with hook.edit off", async () => {
    const plain = repo(null);
    write(plain, { "src/q.py": UNSAFE });
    assert.equal(await decide(edit(plain, "src/q.py")), null);
    const budgetsOnly = repo("# AGENTS.md\n\n## Commands\n\n| Key | Command |\n| --- | --- |\n| `analyze:file` | `<command>` or none |\n\n## Quality budgets\n\n| Key | Default |\n| --- | --- |\n| `ccn.warn` | 10 |\n");
    write(budgetsOnly, { "src/q.py": UNSAFE });
    assert.equal(await decide(edit(budgetsOnly, "src/q.py")), null, "a template placeholder row and a budgets section do not opt in");
    const off = repo(agents({ budgets: "## Quality budgets\n\n| Key | Default |\n| --- | --- |\n| `hook.edit` | `off` |\n" }));
    write(off, { "src/q.py": UNSAFE });
    assert.equal(await decide(edit(off, "src/q.py")), null);
  });
  test("a Bash edit of a source file is checked too", async () => {
    const dir = repo();
    const sid = `bash-${process.pid}`;
    const bash = { session_id: sid, hook_event_name: "PostToolUse", cwd: dir, tool_name: "Bash", tool_input: { command: "sed -i ..." } };
    assert.equal(await decide(bash, { now: Date.now() }), null, "nothing changed yet");
    await new Promise((r) => setTimeout(r, 20));
    write(dir, { "src/q.py": UNSAFE });
    const r = await decide(bash, { now: Date.now() + 10 });
    assert.match(r?.context ?? "", /sec\/sql-string-concat/);
    assert.equal(await decide(bash, { now: Date.now() + 20 }), null, "the same change is not reported again");
  });
  test("a missing analyzer says not verified one time for each session", async () => {
    const dir = repo(agents({ cmd: "`no-such-analyzer-xyz {file}`" }));
    write(dir, { "src/q.py": UNSAFE });
    const first = edit(dir, "src/q.py");
    const r = await decide(first);
    assert.match(r.context, /code-health: not verified \(`no-such-analyzer-xyz` not installed\)/);
    assert.equal(await decide({ ...first }), null);
  });
});

describe("each finding is told one time for each session", () => {
  // The hook compares with the commit at the start of the session, so a finding that the agent keeps (on purpose,
  // or until a later step) was told again after each edit of that file: 4 times for one accepted nloc warning on
  // mikro-orm-8227, and the agent then searched for a way to make it stop.
  const UNSAFE2 = UNSAFE + `def find_all(db, name):\n    return db.execute("SELECT * FROM c WHERE n = " + name)\n`;
  test("a finding that was already told is not told again; a new one is", async () => {
    const dir = repo();
    const session = { session_id: `told-${process.pid}` };
    write(dir, { "src/q.py": UNSAFE });
    assert.match((await decide(edit(dir, "src/q.py", session))).context, /1 new in src\/q.py/);
    write(dir, { "src/q.py": "# note\n" + UNSAFE });
    assert.equal(await decide(edit(dir, "src/q.py", session)), null, "the same finding after the next edit");
    write(dir, { "src/q.py": "# note\n" + UNSAFE2 });
    const r = await decide(edit(dir, "src/q.py", session));
    assert.match(r.context, /1 new in src\/q.py/);
    assert.match(r.context, /L5 /);
    const log = readFileSync(join(dir, ".git/shark-health/events.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(log.filter((e) => e.kind !== "start").map((e) => e.kind), ["digest", "told", "digest"]);
  });
  test("another session is told again", async () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    assert.ok(await decide(edit(dir, "src/q.py", { session_id: `a-${process.pid}` })));
    assert.ok(await decide(edit(dir, "src/q.py", { session_id: `b-${process.pid}` })));
  });
});

describe("multi-repo workspace", () => {
  // <parent>/ws is the workspace (its own git repository, no Commands); <parent>/api and <parent>/web sit next to it.
  function workspace() {
    const parent = tmp();
    const ws = repo(`# AGENTS.md: demo workspace\n\n## Repositories\n\n| Name | Path | Remote | Role |\n| --- | --- | --- | --- |\n| api | \`../api\` | none | API |\n| web | \`../web\` | none | UI |\n`, join(parent, "ws"));
    const api = repo(agents(), join(parent, "api"));
    const web = repo(null, join(parent, "web"));
    return { ws, api, web };
  }

  test("an Edit in a repository next to the workspace uses that repository's project file", async () => {
    const { ws, api } = workspace();
    write(api, { "src/q.py": UNSAFE });
    const r = await decide({ ...edit(api, "src/q.py"), cwd: ws });
    assert.match(r?.context ?? "", /sec\/sql-string-concat/);
    assert.match(r.context, /\.\.\/api\/src\/q.py/, "the path names the repository folder");
    const log = readFileSync(join(api, ".git/shark-health/events.log"), "utf8");
    assert.match(log, /"kind":"digest"/, "the event goes to the log of that repository");
  });

  test("an Edit in a repository that did not opt in is silent", async () => {
    const { ws, web } = workspace();
    write(web, { "src/q.py": UNSAFE });
    assert.equal(await decide({ ...edit(web, "src/q.py"), cwd: ws }), null);
  });

  test("a Bash command in the workspace checks the repositories in ## Repositories", async () => {
    const { ws, api } = workspace();
    const bash = { session_id: `wsbash-${process.pid}`, hook_event_name: "PostToolUse", cwd: ws, tool_name: "Bash", tool_input: { command: "cd ../api && sed -i ..." } };
    assert.equal(await decide(bash, { now: Date.now() }), null, "nothing changed yet");
    await new Promise((r) => setTimeout(r, 20));
    write(api, { "src/q.py": UNSAFE });
    const r = await decide(bash, { now: Date.now() + 10 });
    assert.match(r?.context ?? "", /sec\/sql-string-concat/);
  });
});

describe("one analyzer fails", () => {
  test("a clean result from the other analyzer still says not verified, one time", async () => {
    const dir = repo(agents({ cmd: `\`no-such-sast-xyz {file}\` and \`node ${TD}fake-lizard.mjs {file}\`` }));
    write(dir, { "src/q.py": SAFE + "# ok\n" });
    const first = edit(dir, "src/q.py");
    assert.match((await decide(first)).context, /not verified \(`no-such-sast-xyz` not installed/);
    assert.equal(await decide({ ...first }), null);
  });
});

describe("time budget", () => {
  test("async: three files changed by one Bash command, each about 3 s to analyze, are all checked", async () => {
    // Opengrep takes about 2 to 4 s for each file in a container; the sync budget (8 s) left the third file unchecked.
    const dir = repo();
    const sid = `budget-${process.pid}`;
    const bash = { session_id: sid, hook_event_name: "PostToolUse", cwd: dir, tool_name: "Bash", tool_input: { command: "python3 edit.py" } };
    assert.equal(await decide(bash, { now: Date.now() }), null);
    await new Promise((r) => setTimeout(r, 20));
    // three new files; git status lists them by path, so the unsafe one is checked last
    write(dir, { "src/a.py": SAFE + "# a\n", "src/b.py": SAFE + "# b\n", "src/c.py": UNSAFE });
    process.env.FAKE_SAST_SLEEP = "3000";
    try {
      const r = await decide(bash, { now: Date.now() + 10 });
      assert.match(r?.context ?? "", /sec\/sql-string-concat/, r?.context);
    } finally {
      delete process.env.FAKE_SAST_SLEEP;
    }
  });
  test("each budget ends at least 2 s before the timeout of its hook entry in hooks.json", () => {
    const hooks = JSON.parse(readFileSync(new URL("./hooks.json", import.meta.url), "utf8")).hooks.PostToolUse;
    const entries = hooks.flatMap((h) => h.hooks).filter((h) => h.command.includes("health-edit.mjs"));
    for (const e of entries) assert.ok(budgetMs(!!e.async) <= (e.timeout - 2) * 1000, `${e.command}: ${budgetMs(!!e.async)} ms`);
    assert.ok(budgetMs(true) >= 20000, "async has room for three files");
  });
});

describe("helpers and process", () => {
  test("edited lines come from the new text of the edit", () => {
    assert.deepEqual(editedLines("a\nb\nc\nd\n", { new_string: "c\nd" }), [3]);
    assert.deepEqual(editedLines("a\nb\n", { edits: [{ new_string: "b" }] }), [2]);
  });
  test("async (the default): the --async entry wakes the agent with exit 2 and the digest on stderr", () => {
    const dir = repo();
    write(dir, { "src/q.py": UNSAFE });
    const sync = spawnSync("node", [HOOK], { input: JSON.stringify(edit(dir, "src/q.py")), encoding: "utf8" });
    assert.equal(sync.status, 0);
    assert.equal(sync.stdout, "", "the plain entry is silent in async mode");
    const r = spawnSync("node", [HOOK, "--async"], { input: JSON.stringify(edit(dir, "src/q.py")), encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^code-health: 1 new/);
    write(dir, { "src/q.py": SAFE });
    const clean = spawnSync("node", [HOOK, "--async"], { input: JSON.stringify(edit(dir, "src/q.py")), encoding: "utf8" });
    assert.equal(clean.status, 0);
    assert.equal(clean.stderr, "");
    assert.equal(spawnSync("node", [HOOK, "--async"], { input: "nope", encoding: "utf8" }).status, 0);
  });
  test("on: the plain entry prints additionalContext JSON, and the --async entry is silent", () => {
    const dir = repo(agents({ budgets: "## Quality budgets\n\n| Key | Default |\n| --- | --- |\n| `hook.edit` | `on` |\n" }));
    write(dir, { "src/q.py": UNSAFE });
    const r = spawnSync("node", [HOOK], { input: JSON.stringify(edit(dir, "src/q.py")), encoding: "utf8" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /code-health: 1 new/);
    const a = spawnSync("node", [HOOK, "--async"], { input: JSON.stringify(edit(dir, "src/q.py")), encoding: "utf8" });
    assert.equal(a.status, 0);
    assert.equal(a.stderr, "");
  });
});
