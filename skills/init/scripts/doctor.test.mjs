import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { cmpVersion, detectLanguages, doctor, format, main, PINS, versionOf } from "./doctor.mjs";
import { dataDir, debugpyEnv, recordDataDir, toolEnv } from "../../code-health/scripts/toolenv.mjs";

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
function bin(tools, { links = [], data = tmp() } = {}) {
  const d = tmp();
  for (const name of ["git", "sh", ...links]) symlinkSync(execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim(), join(d, name));
  for (const [name, body] of Object.entries(tools)) {
    writeFileSync(join(d, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(d, name), 0o755);
  }
  return { ...process.env, PATH: [d, dirname(process.execPath)].join(":"), CLAUDE_PLUGIN_DATA: data, PYTHONPATH: "" };
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
    const data = env.CLAUDE_PLUGIN_DATA;
    for (const [name, tool] of [["opengrep", "opengrep"], ["lizard", "lizard"], ["python: debugpy", "debugpy"]]) {
      assert.equal(byItem(r, name).fix.command.split("install-tools.sh\" ")[1], `--dir "${data}" ${tool}`, name);
      assert.equal(byItem(r, name).fix.scope, "shark tool folder");
    }
    assert.equal(r.toolFolder, data);
    assert.equal(byItem(r, "python3 venv").status, "missing", "no python3 on this PATH");
    assert.match(byItem(r, "python3 venv").fix.command, /python3-venv/);
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

describe("the shark tool folder", () => {
  test("is CLAUDE_PLUGIN_DATA when Claude Code gives it", () => {
    assert.equal(dataDir({ CLAUDE_PLUGIN_DATA: "/d/x" }, "/any"), "/d/x");
  });
  test("is found from the install path of the plugin when the variable is not set", () => {
    assert.equal(dataDir({}, "/h/.claude/plugins/cache/shark-skills/shark/0.3.3"), "/h/.claude/plugins/data/shark-shark-skills");
  });
  test("is the folder whose record names the plugin root, when a session recorded it", () => {
    const home = tmp();
    const root = tmp();
    const data = join(home, ".claude/plugins/data/shark-shark-skills");
    assert.equal(recordDataDir({ CLAUDE_PLUGIN_DATA: data }, root), true);
    mkdirSync(join(home, ".claude/plugins/data/other-plugin"), { recursive: true });
    assert.equal(dataDir({ HOME: home }, root), data);
    assert.equal(dataDir({ HOME: home }, tmp()), join(home, ".claude/plugins/data/shark-local"), "another root has no record");
    assert.equal(recordDataDir({}, root), false, "no record without CLAUDE_PLUGIN_DATA");
  });
  test("is shark-local for a plugin loaded from a folder", () => {
    assert.equal(dataDir({ HOME: "/h" }, "/src/shark-skills"), "/h/.claude/plugins/data/shark-local");
    assert.equal(dataDir({ HOME: "/h", CLAUDE_CONFIG_DIR: "/c" }, "/src/shark-skills"), "/c/plugins/data/shark-local");
  });
  test("goes first on PATH only for the folders that exist, and keeps the rest of PATH", () => {
    const data = tmp();
    mkdirSync(join(data, "venv/bin"), { recursive: true });
    const env = toolEnv({ PATH: "/usr/bin:/bin" }, data);
    assert.equal(env.PATH, `${join(data, "venv/bin")}:/usr/bin:/bin`);
    assert.equal(toolEnv({ PATH: "/usr/bin" }, tmp()).PATH, "/usr/bin");
  });
  test("adds debugpy to PYTHONPATH only when it is installed", () => {
    const data = tmp();
    assert.equal(debugpyEnv({ PYTHONPATH: "/p" }, data).PYTHONPATH, "/p");
    mkdirSync(join(data, "debugpy/debugpy"), { recursive: true });
    assert.equal(debugpyEnv({ PYTHONPATH: "/p" }, data).PYTHONPATH, `${join(data, "debugpy")}:/p`);
  });

  const python3 = (() => {
    try {
      return execFileSync("sh", ["-c", "command -v python3"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();
  test("the tools in the folder are found with no PATH setup, and debugpy works for the project python3", { skip: !python3 && "no python3" }, () => {
    const data = tmp();
    write(data, {
      "bin/opengrep": "#!/bin/sh\necho 1.33.1\n",
      "venv/bin/lizard": "#!/bin/sh\necho 1.25.0\n",
      "debugpy/debugpy/__init__.py": "__version__ = '1.8.22'\n",
    });
    chmodSync(join(data, "bin/opengrep"), 0o755);
    chmodSync(join(data, "venv/bin/lizard"), 0o755);
    const dir = repo({ "app.py": "x = 1\n" });
    const r = doctor(dir, { env: bin({}, { links: ["python3"], data }), smoke: false });
    assert.equal(byItem(r, "opengrep").status, "ok");
    assert.equal(byItem(r, "lizard").status, "ok");
    assert.equal(byItem(r, "python: debugpy").status, "ok");
    assert.match(byItem(r, "python: debugpy").detail, /^debugpy 1\.8\.22 from the shark tool folder, for python3/);
    assert.equal(byItem(r, "python3 venv"), undefined, "nothing to install, so no python3 check");
  });
});

describe("install-tools.sh", () => {
  const script = fileURLToPath(new URL("./install-tools.sh", import.meta.url));
  const status = (...args) => {
    try {
      execFileSync("sh", [script, ...args], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  test("refuses a call with no folder, no tool, or an unknown tool, and installs nothing", () => {
    const data = tmp();
    assert.equal(status("lizard"), 2);
    assert.equal(status("--dir", data), 2);
    assert.equal(status("--dir", data, "pipx"), 2);
    assert.deepEqual(readdirSync(data), []);
  });
  test("pins each Python package with a hash", () => {
    for (const f of ["lizard.txt", "debugpy.txt"]) {
      const reqs = readFileSync(new URL(`./requirements/${f}`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
      assert.ok(reqs.length > 0);
      for (const r of reqs) assert.match(r, /^[\w.-]+==[\d.]+ --hash=sha256:[0-9a-f]{64}$/, r);
    }
    assert.match(readFileSync(new URL("./requirements/lizard.txt", import.meta.url), "utf8"), new RegExp(`^lizard==${PINS.lizard.replace(/\./g, "\\.")} `, "m"));
    assert.match(readFileSync(new URL("./requirements/debugpy.txt", import.meta.url), "utf8"), new RegExp(`^debugpy==${PINS.debugpy.replace(/\./g, "\\.")} `, "m"));
  });
});
