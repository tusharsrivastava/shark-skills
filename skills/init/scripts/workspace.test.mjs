import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, scan } from "./workspace.mjs";

const SCRIPT = fileURLToPath(new URL("./workspace.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function top() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "shark-workspace-")));
  dirs.push(d);
  return d;
}
function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}
function repo(dir, { remote, files = { "README.md": "r\n" } } = {}) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  write(dir, files);
  if (remote) git(dir, "remote", "add", "origin", remote);
  return dir;
}

describe("scan", () => {
  test("an empty folder is a workspace, with no repositories to find", () => {
    const ws = join(top(), "ws");
    mkdirSync(ws);
    const r = scan(ws);
    assert.equal(r.kind, "workspace");
    assert.equal(r.empty, true);
    assert.deepEqual(r.repos, []);
  });
  test("an empty folder inside another repository is a workspace, and names that repository", () => {
    // Seen in the eval sandbox, and on a machine whose home folder is a git repository (dotfiles): the outer
    // repository made the empty folder look like a subfolder to set up.
    const outer = repo(join(top(), "home"));
    const ws = join(outer, "acme-ws");
    mkdirSync(ws);
    const r = scan(ws);
    assert.equal(r.kind, "workspace");
    assert.equal(r.outerRepository, outer);
    assert.equal(r.gitInit, false);
    write(ws, { "src/a.ts": "x\n" });
    assert.equal(scan(ws).kind, "inside-repository", "a folder with files keeps the old answer");
  });
  test("an empty folder after git init and with its AGENTS.md is still a workspace", () => {
    const ws = repo(join(top(), "ws"), { files: { "AGENTS.md": "# AGENTS.md: ws\n" } });
    assert.equal(scan(ws).kind, "workspace");
  });
  test("a folder with repositories finds them, 2 levels deep, with their remotes and project files", () => {
    const ws = join(top(), "ws");
    repo(join(ws, "api"), { remote: "git@example.com:acme/api.git", files: { "AGENTS.md": "# api\n" } });
    repo(join(ws, "apps/web"));
    repo(join(ws, "a/b/too-deep"));
    write(ws, { "notes.txt": "x\n" });
    const r = scan(ws);
    assert.equal(r.kind, "workspace");
    assert.deepEqual(r.repos.map((x) => x.path), ["api", "apps/web"]);
    assert.equal(r.repos[0].remote, "git@example.com:acme/api.git");
    assert.deepEqual(r.repos[0].projectFile, ["AGENTS.md"]);
    assert.equal(r.repos[1].remote, null);
  });
  test("a repository, a folder inside one, and one project without git keep the normal init", () => {
    const base = top();
    const app = repo(join(base, "app"), { files: { "package.json": "{}\n", "src/a.ts": "x\n" } });
    repo(join(app, "vendor-sub"));
    assert.equal(scan(app).kind, "repository", "a nested repository does not make it a workspace");
    assert.equal(scan(join(app, "src")).kind, "inside-repository");
    const plain = join(base, "plain");
    write(plain, { "pyproject.toml": "[project]\n" });
    assert.equal(scan(plain).kind, "project");
  });
  test("a git repository whose project file has ## Repositories is a workspace", () => {
    const ws = repo(join(top(), "ws"), { files: { "AGENTS.md": "# AGENTS.md: ws\n\n## Repositories\n", "HANDOFF.md": "h\n", "notes.md": "n\n" } });
    assert.equal(scan(ws).kind, "workspace");
  });
});

describe("check", () => {
  test("paths next to the workspace and inside it; a folder that is not a repository root fails", () => {
    const base = top();
    const ws = join(base, "ws");
    mkdirSync(ws);
    repo(join(base, "api"), { remote: "https://example.com/api.git" });
    repo(join(ws, "web"));
    mkdirSync(join(base, "api", "src"));
    const r = check(ws, ["../api", "web", join(base, "api", "src"), "../missing"]);
    assert.deepEqual(r.map((x) => [x.ok, x.path ?? x.reason]), [
      [true, "../api"],
      [true, "web"],
      [false, "not the root of a git repository"],
      [false, "no such folder"],
    ]);
    assert.equal(r[0].inside, false);
    assert.equal(r[0].remote, "https://example.com/api.git");
    assert.equal(r[1].inside, true);
  });
});

describe("command line", () => {
  test("scan prints JSON; check exits 1 when a path fails; a wrong call exits 2", () => {
    const base = top();
    const ws = join(base, "ws");
    mkdirSync(ws);
    repo(join(base, "api"));
    const run = (...args) => spawnSync("node", [SCRIPT, ...args], { cwd: ws, encoding: "utf8" });
    const s = run("scan");
    assert.equal(s.status, 0);
    assert.equal(JSON.parse(s.stdout).kind, "workspace");
    assert.equal(run("check", "../api").status, 0);
    assert.equal(run("check", "../api", "../nope").status, 1);
    assert.equal(run("check").status, 2);
    assert.equal(run("scan", "--root").status, 2);
  });
});
