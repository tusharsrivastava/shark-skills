import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { digest, main, readBudgets, readCommands } from "./health.mjs";

const SCRIPT = fileURLToPath(new URL("./health.mjs", import.meta.url));
const SAST = fileURLToPath(new URL("./testdata/fake-sast.mjs", import.meta.url));
const LIZ = fileURLToPath(new URL("./testdata/fake-lizard.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function agents({ file = true, budgets = "" } = {}) {
  const row = file ? `| \`analyze:file\` | \`node ${SAST} {file}\` and \`node ${LIZ} {file}\` | under 2 s |\n` : "";
  return `# AGENTS.md: demo\n\n## Commands\n\n| Key | Command | Limit or note |\n| --- | --- | --- |\n| \`gate:fast\` | \`pytest\` | |\n${row}\n${budgets}\n## Invariants\n`;
}

function repo(files, opts) {
  const dir = mkdtempSync(join(tmpdir(), "health-test-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, { "AGENTS.md": agents(opts), ...files });
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

const SAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = ?", (customer_id,))\n`;
const UNSAFE = `def find(db, customer_id):\n    return db.execute("SELECT * FROM c WHERE id = " + customer_id)\n`;
const LEGACY = `def old(db, x):\n    return db.execute("SELECT 1 WHERE x = " + x)\n\n`;
const branches = (name, n) => `def ${name}(a):\n${Array.from({ length: n }, (_, i) => `    if a == ${i}:\n        return ${i}\n`).join("")}    return -1\n`;

describe("AGENTS.md rows", () => {
  test("several code spans or && make several commands; placeholders and none are missing rows", () => {
    const cmds = readCommands(
      "## Commands\n\n| Key | Command |\n| --- | --- |\n| `analyze:file` | `lizard --csv {file}` and `opengrep scan {file}` |\n| `analyze:diff` | `a {base} && b {base}` |\n| `arch:check` | `<command>` |\n| `analyze:full` | none |\n",
    );
    assert.deepEqual(cmds["analyze:file"], ["lizard --csv {file}", "opengrep scan {file}"]);
    assert.deepEqual(cmds["analyze:diff"], ["a {base}", "b {base}"]);
    assert.equal(cmds["arch:check"], undefined);
    assert.equal(cmds["analyze:full"], undefined);
  });
  test("only the first table counts: the header row and an examples table below it are not project values", () => {
    const cmds = readCommands("## Commands\n\n| Key | Command |\n| --- | --- |\n| `analyze:file` | `<command>` or none |\n\nExamples:\n\n| Key | Python |\n| --- | --- |\n| `analyze:file` | `lizard {file}` |\n");
    assert.deepEqual(cmds, {});
  });
  test("quality budgets override the defaults", () => {
    const b = readBudgets("## Quality budgets\n\n| Key | Default | Meaning |\n| --- | --- | --- |\n| `ccn.warn` | 8 | x |\n| `hook.edit` | `async` | y |\n");
    assert.equal(b["ccn.warn"], 8);
    assert.equal(b["hook.edit"], "async");
    assert.equal(b["ccn.block"], 20);
  });
});

describe("file: only new findings", () => {
  test("a clean edit prints nothing", () => {
    const dir = repo({ "src/q.py": SAFE });
    write(dir, { "src/q.py": SAFE + "\n# note\n" });
    const r = main(["file", "src/q.py"], dir);
    assert.equal(r.code, 0);
    assert.equal(r.text, "");
  });
  test("a new SQL concatenation is reported with its fix hint and id", () => {
    const dir = repo({ "src/q.py": SAFE });
    write(dir, { "src/q.py": UNSAFE });
    const r = main(["file", "src/q.py"], dir);
    assert.equal(r.code, 1);
    assert.match(r.text, /^code-health: 1 new in src\/q.py \(budget: ccn 10\)/);
    assert.match(r.text, /1\. ERROR sec\/sql-string-concat {2}L2 {2}SQL text built/);
    assert.match(r.text, /Fix: use a bound parameter\./);
    assert.match(r.text, /id: [0-9a-f]{12}/);
    assert.match(r.text, /\+0 more\. Not verified: none\.$/);
  });
  test("a finding that was in the file at HEAD is old, also after the code moved", () => {
    const dir = repo({ "src/q.py": LEGACY + SAFE });
    write(dir, { "src/q.py": "import os\n\n\n" + LEGACY + SAFE });
    assert.equal(main(["file", "src/q.py"], dir).code, 0);
  });
  test("a new file is new: each finding counts", () => {
    const dir = repo({});
    write(dir, { "src/new.py": UNSAFE });
    assert.equal(main(["file", "src/new.py"], dir).code, 1);
  });
  test("the base result is cached inside .git, never in the working tree", () => {
    const dir = repo({ "src/q.py": SAFE });
    write(dir, { "src/q.py": UNSAFE });
    main(["file", "src/q.py"], dir);
    assert.ok(existsSync(join(dir, ".git/shark-health/cache")));
    assert.ok(existsSync(join(dir, ".git/shark-health/last-health.sarif")));
    assert.equal(git(dir, "status", "--porcelain", "--untracked-files=all"), "M src/q.py");
  });
});

describe("file: complexity delta", () => {
  test("a new function over budget is reported", () => {
    const dir = repo({ "src/c.py": SAFE });
    write(dir, { "src/c.py": SAFE + branches("route", 12) });
    const r = main(["file", "src/c.py"], dir);
    assert.equal(r.code, 1);
    assert.match(r.text, /WARN  cx\/ccn {2}L\d+ {2}`route` ccn 13 \(budget 10\)/);
  });
  test("an over-budget function that gets worse is reported with before and after", () => {
    const dir = repo({ "src/c.py": branches("route", 11) });
    write(dir, { "src/c.py": branches("route", 13) });
    assert.match(main(["file", "src/c.py"], dir).text, /`route` ccn 12 -> 14 \(budget 10\)/);
  });
  test("an over-budget function that did not get worse is silent; over the block level is an error", () => {
    const dir = repo({ "src/c.py": branches("route", 11) });
    write(dir, { "src/c.py": "# top\n" + branches("route", 11) });
    assert.equal(main(["file", "src/c.py"], dir).code, 0);
    write(dir, { "src/c.py": branches("route", 25) });
    assert.match(main(["file", "src/c.py"], dir).text, /ERROR cx\/ccn/);
  });
});

describe("exit codes", () => {
  test("3 when the analyze:file row is missing", () => {
    const dir = repo({ "src/q.py": SAFE }, { file: false });
    assert.equal(main(["file", "src/q.py"], dir).code, 3);
  });
  test("4 when every analyzer fails; one failing analyzer is listed as not verified", () => {
    const dir = repo({ "src/q.py": SAFE });
    write(dir, { "AGENTS.md": agents().replace(`node ${LIZ} {file}`, "no-such-analyzer-xyz {file}") });
    write(dir, { "src/q.py": UNSAFE });
    const r = main(["file", "src/q.py"], dir);
    assert.equal(r.code, 1);
    assert.match(r.text, /Not verified: `no-such-analyzer-xyz` not installed/);
    write(dir, { "AGENTS.md": agents().replace(/`node [^`]+` and `node [^`]+`/, "`no-such-analyzer-xyz {file}`") });
    assert.equal(main(["file", "src/q.py"], dir).code, 4);
  });
  test("4 on a timeout", () => {
    const dir = repo({ "src/q.py": SAFE });
    write(dir, { "src/q.py": UNSAFE });
    const r = spawnSync("node", [SCRIPT, "file", "src/q.py", "--timeout-ms", "300"], { cwd: dir, encoding: "utf8", env: { ...process.env, FAKE_SAST_SLEEP: "3000" } });
    assert.equal(r.status, 4, r.stderr);
  });
  test("2 on a usage error", () => {
    const dir = repo({});
    assert.equal(spawnSync("node", [SCRIPT, "nope"], { cwd: dir }).status, 2);
    assert.equal(spawnSync("node", [SCRIPT, "baseline", "allow", "abc"], { cwd: dir }).status, 2);
  });
});

describe("digest", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({
    tool: "opengrep", ruleId: `sec-r${i}`, level: i % 2 ? "warning" : "error", file: "a.py", line: 10 * (i + 1),
    message: `${"x".repeat(200)} Fix: ${"y".repeat(200)}`, help: "", fp: `${i}`.padStart(12, "0"),
  }));
  test("caps at 1,500 characters with long messages, errors first, long messages cut", () => {
    const t = digest(many, { scope: "a.py" });
    assert.ok(t.length <= 1500, t.length);
    assert.match(t, /\+3 more\. Not verified: none\.$/);
    assert.equal((t.match(/^\d\. ERROR/gm) ?? []).length, 4);
    assert.ok(t.split("\n").every((l) => l.length <= 160), "each line is short");
  });
  test("caps at 5 findings with short messages", () => {
    const t = digest(many.map((f) => ({ ...f, message: "short. Fix: do x." })), { scope: "a.py" });
    assert.match(t, /\+2 more\. Not verified: none\.$/);
    assert.equal((t.match(/^\d\. /gm) ?? []).length, 5);
  });
  test("sorts by distance from the edited line inside one severity", () => {
    const two = [many[0], many[2]];
    assert.match(digest(two, { scope: "a.py", near: [30] }), /^1\. ERROR sec\/r2/m);
  });
  test("empty when nothing is new", () => {
    assert.equal(digest([], { scope: "a.py" }), "");
  });
});

describe("baseline", () => {
  test("record makes a committed baseline that hides old findings; allow hides one on purpose", () => {
    const dir = repo({ "src/a.py": SAFE });
    write(dir, { "src/a.py": UNSAFE });
    git(dir, "commit", "-qam", "legacy debt");
    write(dir, { "AGENTS.md": agents() });
    const rec = main(["baseline", "record"], dir);
    assert.equal(rec.code, 0, rec.text);
    const b = JSON.parse(readFileSync(join(dir, ".shark/health-baseline.json"), "utf8"));
    assert.equal(Object.keys(b.files["src/a.py"].findings).length, 1);
    write(dir, { "src/a.py": UNSAFE + UNSAFE.replace("find", "find2") });
    const r = main(["file", "src/a.py", "--base", "HEAD~1"], dir);
    assert.equal(r.findings.length, 1, r.text);
    const id = r.findings[0].fp;
    assert.equal(main(["baseline", "allow", id], dir).code, 2, "a reason is required");
    assert.equal(main(["baseline", "allow", id, "--reason", "test fixture"], dir).code, 0);
    assert.equal(main(["file", "src/a.py", "--base", "HEAD~1"], dir).code, 0);
  });
  test("a lane writes its own allow file; fold moves it into the baseline", () => {
    const dir = repo({ "src/a.py": SAFE });
    write(dir, { "src/a.py": UNSAFE });
    const id = main(["file", "src/a.py"], dir).findings[0].fp;
    main(["baseline", "allow", id, "--reason", "spike", "--lane", "lane-a"], dir);
    assert.ok(existsSync(join(dir, ".shark/health-allow/lane-a.json")));
    assert.ok(!existsSync(join(dir, ".shark/health-baseline.json")), "the lane does not write the baseline");
    assert.equal(main(["file", "src/a.py"], dir).code, 0);
    const f = main(["baseline", "fold"], dir);
    assert.match(f.text, /folded 1 allow entries/);
    assert.ok(!existsSync(join(dir, ".shark/health-allow/lane-a.json")));
    assert.equal(JSON.parse(readFileSync(join(dir, ".shark/health-baseline.json"), "utf8")).allow[0].id, id);
  });
  test("compare lists new and fixed findings", () => {
    const dir = repo({ "src/a.py": UNSAFE, "src/b.py": SAFE });
    write(dir, { "src/a.py": SAFE, "src/b.py": UNSAFE.replace("find", "g") });
    const r = main(["baseline", "compare"], dir);
    assert.equal(r.code, 1);
    assert.match(r.text, /1 new, 0 worsened, 1 fixed/);
    assert.match(r.text, /^fixed: sec\/sql-string-concat src\/a.py:2$/m);
  });
});

describe("diff and sarif", () => {
  test("diff reports the new findings of all changed files and says arch:check is missing", () => {
    const dir = repo({ "src/a.py": SAFE, "src/b.py": SAFE });
    write(dir, { "src/a.py": UNSAFE, "src/c.py": UNSAFE.replace("find", "h") });
    const r = main(["diff"], dir);
    assert.equal(r.code, 1);
    assert.match(r.text, /code-health: 2 new in the diff/);
    assert.match(r.text, /src\/a.py:2/);
    assert.match(r.text, /src\/c.py:2/);
    assert.match(r.text, /Not verified: arch:check missing\./);
  });
  test("sarif --only filters by category", () => {
    const dir = repo({ "src/a.py": UNSAFE + branches("route", 12) });
    const out = join(dir, "out.sarif");
    assert.equal(main(["sarif", "--out", out], dir).code, 0);
    const all = JSON.parse(readFileSync(out, "utf8")).runs.flatMap((r) => r.results.map((x) => x.ruleId));
    assert.deepEqual(all.sort(), ["cx-ccn", "shark.rules.sec-sql-string-concat"]);
    main(["sarif", "--out", out, "--only", "sec,arch"], dir);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")).runs.flatMap((r) => r.results.map((x) => x.ruleId)), ["shark.rules.sec-sql-string-concat"]);
  });
});

describe("rules add", () => {
  test("copies the starter rules for the languages of the project and keeps a rule file that exists", () => {
    const dir = repo({ "app.py": SAFE, "web/f.ts": "export const a = 1;\n", ".shark/rules/sec-python.yaml": "rules: [] # project copy\n" });
    const r = main(["rules", "add"], dir);
    assert.equal(r.code, 0);
    assert.match(r.text, /added: sec-javascript\.yaml/);
    assert.match(r.text, /kept: sec-python\.yaml/);
    assert.match(readFileSync(join(dir, ".shark/rules/sec-javascript.yaml"), "utf8"), /id: sec-sql-string-concat/);
    assert.equal(readFileSync(join(dir, ".shark/rules/sec-python.yaml"), "utf8"), "rules: [] # project copy\n");
  });
  test("a project with no language that has starter rules gets none", () => {
    const dir = repo({ "main.go": "package main\n" });
    const r = main(["rules", "add"], dir);
    assert.equal(r.code, 0);
    assert.match(r.text, /no starter rules/);
    assert.equal(existsSync(join(dir, ".shark/rules")), false);
  });
});
