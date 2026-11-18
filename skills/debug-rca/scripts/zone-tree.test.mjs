import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./zone-tree.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "zone-tree-test-"));
  dirs.push(dir);
  const git = (...a) => spawnSync("git", a, { cwd: dir });
  git("init", "-q");
  mkdirSync(join(dir, "tests"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "app.js"), "export const a = 1\n");
  writeFileSync(join(dir, "tests/a.test.js"), "test a\n");
  writeFileSync(join(dir, "node_modules/dep.js"), "dep\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "base");
  writeFileSync(join(dir, "notes.md"), "uncommitted\n");
  return dir;
}

const run = (dir, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, "--root", dir], { encoding: "utf8" });

describe("zone-tree", () => {
  test("create copies the repository with its dependencies and uncommitted files", () => {
    const dir = repo();
    const r = run(dir, "create", "Z1");
    assert.equal(r.status, 0, r.stderr);
    const path = /^path: (.+)$/m.exec(r.stdout)[1];
    assert.ok(existsSync(join(path, "node_modules/dep.js")));
    assert.ok(existsSync(join(path, "notes.md")));
    assert.equal(existsSync(join(path, ".shark-zones")), false);
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).stdout;
    assert.doesNotMatch(status, /shark-zones/);
  });

  test("diff gives only the changes of the zone, and the main tree takes the patch", () => {
    const dir = repo();
    const path = /^path: (.+)$/m.exec(run(dir, "create", "Z2").stdout)[1];
    writeFileSync(join(path, "tests/a.test.js"), "test a\ntest a2\n");
    writeFileSync(join(path, "tests/zone.test.js"), "zone test\n");
    const patch = run(dir, "diff", "Z2").stdout;
    assert.match(patch, /tests\/zone\.test\.js/);
    assert.match(patch, /\+test a2/);
    assert.doesNotMatch(patch, /notes\.md|node_modules/);
    const apply = spawnSync("git", ["apply", "-"], { cwd: dir, input: patch, encoding: "utf8" });
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(readFileSync(join(dir, "tests/zone.test.js"), "utf8"), "zone test\n");
  });

  test("remove --all deletes every zone tree", () => {
    const dir = repo();
    run(dir, "create", "Z3");
    run(dir, "create", "Z4");
    assert.match(run(dir, "list").stdout, /Z3[\s\S]*Z4/);
    assert.equal(run(dir, "remove", "--all").status, 0);
    assert.equal(existsSync(join(dir, ".shark-zones")), false);
  });

  test("a zone id with a slash is refused", () => {
    assert.equal(run(repo(), "create", "../x").status, 1);
  });
});
