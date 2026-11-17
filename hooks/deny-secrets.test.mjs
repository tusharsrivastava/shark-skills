import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide, readPolicy } from "./deny-secrets.mjs";

const HOOK = fileURLToPath(new URL("./deny-secrets.mjs", import.meta.url));
const dirs = [];

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shark-hook-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function call(dir, tool_name, tool_input) {
  return decide({ cwd: dir, tool_name, tool_input }, dir);
}

const AGENTS = `# AGENTS.md: demo

## Secrets

- Never read or write: \`.env\`, \`.env.*\`, \`config/credentials/**\`, \`*.pem\`. The only exception: \`.env.example\`.
- Enforced by: the shark hook.

## Docs layout
`;

after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("policy", () => {
  test("reads the patterns and the exception from ## Secrets", () => {
    const policy = readPolicy(project({ "AGENTS.md": AGENTS }));
    assert.deepEqual(policy.secrets, [".env", ".env.*", "config/credentials/**", "*.pem"]);
    assert.deepEqual(policy.exceptions, [".env.example"]);
  });

  test("reads the unfilled template list with angle brackets", () => {
    const policy = readPolicy(project({ "CLAUDE.md": "## Secrets\n\n- Never read or write: `<.env, .env.*, secrets/*, *.pem>`. The only exception: `<.env.example>`.\n" }));
    assert.deepEqual(policy.secrets, [".env", ".env.*", "secrets/*", "*.pem"]);
  });

  test("uses the default list when no project file has the section", () => {
    const policy = readPolicy(project({ "CLAUDE.md": "# demo\n" }));
    assert.ok(policy.secrets.includes(".env"));
    assert.equal(call(project({ "CLAUDE.md": "# demo\n" }), "Read", { file_path: ".env.example" }), null);
  });

  test("example files stay readable when the project lists no exception", () => {
    const dir = project({ "AGENTS.md": "## Secrets\n\n- Never read or write: `.env`, `.env.*`, `*.pem`. No exception.\n" });
    for (const file_path of [".env.example", "deploy/.env.sample", "config/.env.template"]) {
      assert.equal(call(dir, "Read", { file_path }), null, file_path);
    }
    assert.equal(call(dir, "Bash", { command: "cat .env.example" }), null);
    assert.equal(call(dir, "Read", { file_path: ".env.local" }).pattern, ".env.*");
  });

  test("turns the hook off when the list is none", () => {
    const dir = project({ "AGENTS.md": "## Secrets\n\n- Never read or write: none.\n" });
    assert.equal(call(dir, "Read", { file_path: ".env" }), null);
  });
});

describe("file tools", () => {
  const dir = project({ "AGENTS.md": AGENTS });

  for (const [tool, key] of [["Read", "file_path"], ["Edit", "file_path"], ["Write", "file_path"], ["NotebookEdit", "notebook_path"]]) {
    test(`${tool} on .env is blocked`, () => {
      assert.equal(call(dir, tool, { [key]: join(dir, ".env") }).pattern, ".env");
    });
  }

  test("a nested .env.local is blocked", () => {
    assert.equal(call(dir, "Read", { file_path: "services/api/.env.local" }).pattern, ".env.*");
  });

  test("a file under a secret folder is blocked", () => {
    assert.equal(call(dir, "Read", { file_path: "config/credentials/prod.json" }).pattern, "config/credentials/**");
  });

  test("a key outside the project is blocked", () => {
    assert.equal(call(dir, "Read", { file_path: "/etc/ssl/server.pem" }).pattern, "*.pem");
  });

  test("the exception is allowed", () => {
    assert.equal(call(dir, "Read", { file_path: ".env.example" }), null);
  });

  test("an ordinary file is allowed", () => {
    assert.equal(call(dir, "Edit", { file_path: "src/environment.py" }), null);
  });

  test("Grep with a secret path is blocked", () => {
    assert.equal(call(dir, "Grep", { pattern: "KEY", path: ".env" }).pattern, ".env");
  });

  test("Grep over the source tree is allowed", () => {
    assert.equal(call(dir, "Grep", { pattern: "KEY", path: "src" }), null);
  });
});

describe("Bash", () => {
  const dir = project({ "AGENTS.md": AGENTS });
  const blocked = ["cat .env", "source .env && run", "grep API_KEY .env.production", "cp .env /tmp/x", "head -5 < .env", "cat ./certs/server.pem", "cat .env*", "less config/credentials/prod.json"];
  const allowed = ["cat .env.example", "ls -la", "git status", "pytest -q tests", "ls *", "echo $HOME", "rm -f build/*.pyc"];

  for (const command of blocked) test(`blocks: ${command}`, () => assert.ok(call(dir, "Bash", { command }), command));
  for (const command of allowed) test(`allows: ${command}`, () => assert.equal(call(dir, "Bash", { command }), null));
});

describe("hook process", () => {
  const dir = project({ "AGENTS.md": AGENTS });
  const run = (input) => spawnSync("node", [HOOK], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });

  test("exits 2 with a reason for a secret file", () => {
    const result = run({ cwd: dir, tool_name: "Read", tool_input: { file_path: ".env" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /shark blocked Read on `\.env`/);
  });

  test("exits 0 for an ordinary file", () => {
    assert.equal(run({ cwd: dir, tool_name: "Read", tool_input: { file_path: "README.md" } }).status, 0);
  });

  test("exits 1 and lets the call continue when the input is not JSON", () => {
    const result = spawnSync("node", [HOOK], { input: "not json", encoding: "utf8" });
    assert.equal(result.status, 1);
  });
});
