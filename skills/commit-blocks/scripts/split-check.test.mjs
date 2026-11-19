import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { refactorCheck, same, snapshot, wideCommits } from "./split-check.mjs";

const SCRIPT = fileURLToPath(new URL("./split-check.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "split-check-test-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  git(dir, "config", "commit.gpgsign", "false");
  return dir;
}

function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

function commit(dir, msg) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
}

describe("snapshot and same", () => {
  test("a split that keeps every line has the content of the snapshot", () => {
    const dir = repo();
    write(dir, { "src/a.py": "a = 1\n", "tests/test_a.py": "def test(): pass\n" });
    commit(dir, "base");
    write(dir, { "src/a.py": "a = 2\n", "src/b.py": "b = 1\n", "tests/test_a.py": "def test(): assert 1\n" });
    const snap = snapshot(dir);
    assert.equal(git(dir, "diff", "--cached", "--name-only"), "", "the snapshot must not touch the index");
    git(dir, "add", "src/b.py");
    git(dir, "commit", "-q", "-m", "first part: only the staged file");
    assert.equal(same(dir, snap).ok, false, "after the first part, the rest is not yet in HEAD");
    commit(dir, "second part");
    assert.equal(same(dir, snap).ok, true);
  });

  test("a lost hunk is found even when the file stat stays the same", () => {
    const dir = repo();
    write(dir, { "a.txt": "one\ntwo\n" });
    commit(dir, "base");
    write(dir, { "a.txt": "one\nTWO\n" });
    const snap = snapshot(dir);
    write(dir, { "a.txt": "one\nTwo\n" }); // same line count, other content: a --stat check sees no difference
    commit(dir, "split with a wrong hunk");
    const r = same(dir, snap);
    assert.equal(r.ok, false);
    assert.match(r.diff, /a\.txt/);
  });

  test("untracked files are in the snapshot, ignored files are not", () => {
    const dir = repo();
    write(dir, { ".gitignore": "build/\n", "a.txt": "a\n" });
    commit(dir, "base");
    write(dir, { "new.txt": "n\n", "build/out.bin": "x\n" });
    const snap = snapshot(dir);
    commit(dir, "add new");
    assert.equal(same(dir, snap).ok, true);
  });
});

describe("refactor check", () => {
  test("a refactor that changes a test file is reported", () => {
    const dir = repo();
    write(dir, { "src/calc.ts": "export const f = 1\n", "src/calc.test.ts": "expect(f).toBe(1)\n" });
    commit(dir, "base");
    write(dir, { "src/calc.ts": "export const g = 1\n", "src/calc.test.ts": "expect(g).toBe(2)\n" });
    const sha = commit(dir, "refactor: rename f");
    assert.deepEqual(refactorCheck(dir, sha), ["M\tsrc/calc.test.ts"]);
  });

  test("a pure rename of a test file is allowed", () => {
    const dir = repo();
    write(dir, { "tests/test_old.py": "def test_x():\n    assert True\n" + "# line\n".repeat(20), "src/m.py": "x = 1\n" });
    commit(dir, "base");
    renameSync(join(dir, "tests/test_old.py"), join(dir, "tests/test_new.py"));
    write(dir, { "src/m.py": "y = 1\n" });
    const sha = commit(dir, "refactor: rename module");
    assert.deepEqual(refactorCheck(dir, sha), []);
  });

  test("a project test pattern replaces the default", () => {
    const dir = repo();
    write(dir, { "checks/a.check": "1\n" });
    commit(dir, "base");
    write(dir, { "checks/a.check": "2\n" });
    const sha = commit(dir, "refactor: x");
    assert.deepEqual(refactorCheck(dir, sha), []);
    assert.deepEqual(refactorCheck(dir, sha, "\\.check$"), ["M\tchecks/a.check"]);
  });
});

describe("wide commits", () => {
  test("counts files, not lock files or pure renames", () => {
    const dir = repo();
    const many = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`src/f${i}.js`, `${i}\n`]));
    write(dir, { "keep.txt": "k\n".repeat(20) });
    const base = commit(dir, "base");
    write(dir, many);
    commit(dir, "feat: one big commit");
    write(dir, { "src/f0.js": "changed\n", "package-lock.json": "{}\n", "pnpm-lock.yaml": "x\n" });
    renameSync(join(dir, "keep.txt"), join(dir, "kept.txt"));
    commit(dir, "fix: small");
    const wide = wideCommits(dir, base, 6);
    assert.equal(wide.length, 1);
    assert.equal(wide[0].files, 6);
    assert.equal(wide[0].subject, "feat: one big commit");
    assert.equal(wideCommits(dir, base, 7).length, 0);
  });
});

describe("command line", () => {
  test("exit codes: 0 pass, 1 problem, 2 usage", () => {
    const dir = repo();
    write(dir, { "a.txt": "a\n" });
    commit(dir, "base");
    const snap = spawnSync("node", [SCRIPT, "snapshot"], { cwd: dir, encoding: "utf8" }).stdout.trim();
    assert.equal(spawnSync("node", [SCRIPT, "same", snap], { cwd: dir }).status, 0);
    write(dir, { "a.txt": "b\n" });
    commit(dir, "change");
    assert.equal(spawnSync("node", [SCRIPT, "same", snap], { cwd: dir }).status, 1);
    assert.equal(spawnSync("node", [SCRIPT, "nonsense"], { cwd: dir }).status, 2);
  });
});
