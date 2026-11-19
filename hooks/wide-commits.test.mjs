import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide } from "./wide-commits.mjs";

const HOOK = fileURLToPath(new URL("./wide-commits.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// a repository with main, and a branch with one commit of `width` files
function repo(width) {
  const dir = mkdtempSync(join(tmpdir(), "wide-commits-test-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "README"), "r\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "work");
  for (let i = 0; i < width; i++) writeFileSync(join(dir, `f${i}.js`), `${i}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "feat: everything at once");
  return dir;
}

const bash = (dir, command) => ({ tool_name: "Bash", cwd: dir, tool_input: { command } });

describe("decide", () => {
  test("asks before gh pr create when a commit is wide", () => {
    const reason = decide(bash(repo(6), 'gh pr create --title "x" --body "y"'), {});
    assert.match(reason, /1 commit\(s\) of this branch change 6 or more files/);
    assert.match(reason, /feat: everything at once/);
  });

  test("passes a narrow branch, other commands and other tools", () => {
    const narrow = repo(5);
    assert.equal(decide(bash(narrow, "gh pr create --fill"), {}), null);
    const wide = repo(6);
    assert.equal(decide(bash(wide, "gh pr list"), {}), null);
    assert.equal(decide(bash(wide, "echo gh pr creates"), {}), null);
    assert.equal(decide({ tool_name: "Read", cwd: wide, tool_input: { file_path: "x" } }, {}), null);
  });

  test("finds the command inside a chain", () => {
    assert.notEqual(decide(bash(repo(6), "git push -u origin work && gh pr create --fill"), {}), null);
  });

  test("uses --base, the limit from the environment, and 0 turns it off", () => {
    const dir = repo(6);
    assert.notEqual(decide(bash(dir, "gh pr create --base main --fill"), {}), null);
    assert.equal(decide(bash(dir, "gh pr create --fill"), { SHARK_WIDE_COMMIT_FILES: "7" }), null);
    assert.equal(decide(bash(dir, "gh pr create --fill"), { SHARK_WIDE_COMMIT_FILES: "0" }), null);
  });

  test("outside a repository the call continues", () => {
    const dir = mkdtempSync(join(tmpdir(), "wide-commits-norepo-"));
    dirs.push(dir);
    assert.equal(decide(bash(dir, "gh pr create --fill"), {}), null);
  });
});

describe("hook process", () => {
  test("prints an ask decision, and nothing for a narrow branch", () => {
    const wide = spawnSync("node", [HOOK], { input: JSON.stringify(bash(repo(6), "gh pr create --fill")), encoding: "utf8" });
    assert.equal(wide.status, 0);
    const out = JSON.parse(wide.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, "ask");
    assert.equal(out.hookEventName, "PreToolUse");
    const narrow = spawnSync("node", [HOOK], { input: JSON.stringify(bash(repo(2), "gh pr create --fill")), encoding: "utf8" });
    assert.equal(narrow.status, 0);
    assert.equal(narrow.stdout, "");
    const bad = spawnSync("node", [HOOK], { input: "not json", encoding: "utf8" });
    assert.equal(bad.status, 0);
  });
});
