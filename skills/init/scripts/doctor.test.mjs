import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { cmpVersion, detectLanguages, doctor, format, main, PINS, versionOf } from "./doctor.mjs";

const TD = fileURLToPath(new URL("../../code-health/scripts/testdata/", import.meta.url));
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "doctor-"));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

/**
 * A PATH with only the stub tools, links to git and sh, and the folder of node. Not /usr/bin: a CI runner has Go,
 * Python and other tools there, and the tests must not depend on them.
 */
function bin(tools) {
  const d = tmp();
  for (const name of ["git", "sh"]) symlinkSync(execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim(), join(d, name));
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(d, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(d, name), 0o755);
  }
  return { ...process.env, PATH: [d, dirname(process.execPath)].join(":") };
}

function repo(files) {
  const dir = tmp();
  write(dir, files);
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "base");
  return dir;
}

const AGENTS = (rows) => `# AGENTS.md\n\n## Commands\n\n| Key | Command | Note |\n| --- | --- | --- |\n${rows}\n\n## Secrets\n\n- Never read or write: \`.env\`.\n\n## Invariants\n\n| # | Invariant | Check |\n| --- | --- | --- |\n| 1 | Money is integer cents | review |\n`;
const byItem = (r, name) => r.items.find((i) => i.item === name);

describe("versions", () => {
  test("reads and compares versions", () => {
    assert.equal(versionOf("Opengrep v1.33.1"), "1.33.1");
    assert.equal(versionOf("lizard 1.25.0"), "1.25.0");
    assert.equal(cmpVersion("1.30.1", PINS.opengrepMinSafe), -1);
    assert.equal(cmpVersion("1.33.1", "1.33.1"), 0);
  });
});

describe("languages", () => {
  test("counts each language and skips vendored and test-data folders", () => {
    const l = detectLanguages(["a.py", "b/c.py", "web/x.ts", "node_modules/z.js", "svc/main.go", "x/testdata/y.py"]);
    assert.deepEqual(Object.keys(l), ["python", "typescript", "go"]);
    assert.equal(l.python.length, 2);
  });
});

describe("a project with no tools and no setup", () => {
  const dir = repo({ "app.py": "x = 1\n", "web/f.ts": "export const a = 1;\n", "svc/main.go": "package main\n" });
  const env = bin({});
  const r = doctor(dir, { env, smoke: true });
  test("each missing tool has a pinned install command", () => {
    assert.match(byItem(r, "opengrep").fix.command, /install-opengrep\.sh/);
    assert.match(byItem(r, "lizard").fix.command, new RegExp(`lizard==${PINS.lizard.replace(/\./g, "\\.")}`));
    assert.match(byItem(r, "python: debugpy").fix.command, new RegExp(`debugpy==${PINS.debugpy.replace(/\./g, "\\.")}`));
    const go = byItem(r, "go: delve");
    assert.equal(go.status, "missing");
    assert.match(go.detail, /Go toolchain is not installed/);
    assert.match(go.fix.command, new RegExp(`go install github\\.com/go-delve/delve/cmd/dlv@${PINS.delve}`));
  });
  test("rows, rules and baseline are missing, and the exit code is 1", () => {
    assert.equal(byItem(r, "analyze:file row").status, "missing");
    assert.equal(byItem(r, "rules: sec-python.yaml").status, "missing");
    assert.match(byItem(r, "rules: sec-python.yaml").fix.command, /health\.mjs" rules add$/);
    assert.equal(byItem(r, "rules: sec-javascript.yaml").status, "missing");
    assert.equal(byItem(r, "rules: go").status, "warn");
    assert.equal(byItem(r, "baseline").status, "missing");
    assert.equal(byItem(r, "deny-secrets lists").status, "missing");
    assert.ok(!r.items.some((i) => i.item.startsWith("smoke:")), "no smoke check without an analyze:file row");
    assert.equal(main(["--root", dir, "--no-smoke"]).code, 1);
  });
  test("the text report is a Markdown table", () => {
    assert.match(format(r), /^\| missing \| debugger \| go: delve \|/m);
  });
});

describe("a project that is set up", () => {
  const row = `| \`analyze:file\` | \`node ${TD}fake-sast.mjs {file}\` and \`node ${TD}fake-lizard.mjs {file}\` | |\n| \`analyze:full\` | \`node ${TD}fake-lizard.mjs .\` | |\n| \`arch:check\` | \`true\` | |`;
  const dir = repo({
    "app.py": "def f(x):\n    return x\n", "AGENTS.md": AGENTS(row), ".gitignore": ".claude/mcp-debugger.log\n",
    ".shark/rules/sec-python.yaml": "rules: []\n", ".shark/health-baseline.json": "{\"version\":1,\"files\":{}}\n",
  });
  const venv = join(dir, ".venv/bin");
  mkdirSync(venv, { recursive: true });
  writeFileSync(join(venv, "python"), "#!/bin/sh\necho 1.8.22\n");
  chmodSync(join(venv, "python"), 0o755);
  const env = bin({ opengrep: "echo 1.33.1", lizard: "echo 1.25.0", npx: "exit 0" });
  const r = doctor(dir, { env, smoke: true });
  test("every item is ok, the smoke check ran, and the exit code is 0", () => {
    const bad = r.items.filter((i) => i.status === "missing" || i.status === "fail");
    assert.deepEqual(bad, []);
    assert.match(byItem(r, "python: debugpy").detail, /\.venv\//);
    assert.match(byItem(r, "smoke: python").detail, /app\.py analyzed in \d+ ms/);
    assert.equal(byItem(r, "arch:check row").status, "ok");
  });
  test("analyzer rows with other tools do not ask for opengrep or lizard", () => {
    assert.equal(byItem(r, "opengrep"), undefined);
    assert.equal(byItem(r, "lizard"), undefined);
  });
});

describe("unsafe or broken tools", () => {
  test("an opengrep before the fixed version fails", () => {
    const dir = repo({ "app.py": "x = 1\n" });
    const r = doctor(dir, { env: bin({ opengrep: "echo 1.29.0" }), smoke: false });
    assert.equal(byItem(r, "opengrep").status, "fail");
    assert.match(byItem(r, "opengrep").detail, /advisories/);
  });
  test("an analyzer row whose tool is missing fails the smoke check", () => {
    const dir = repo({ "app.py": "x = 1\n", "AGENTS.md": AGENTS("| `analyze:file` | `no-such-tool-xyz {file}` | |") });
    const r = doctor(dir, { env: bin({}), smoke: true });
    assert.equal(byItem(r, "smoke: python").status, "fail");
    assert.match(byItem(r, "smoke: python").detail, /no-such-tool-xyz/);
  });
  test("an import-linter config with no arch:check row is reported with the row to add", () => {
    const dir = repo({ "app.py": "x = 1\n", ".importlinter": "[importlinter]\nroot_package = app\n" });
    const r = doctor(dir, { env: bin({}), smoke: false });
    assert.match(byItem(r, "arch:check row").fix.command, /lint-imports/);
  });
});

describe("command line", () => {
  test("an unknown option is a usage error", () => {
    assert.equal(main(["--nope"]).code, 2);
  });
});
