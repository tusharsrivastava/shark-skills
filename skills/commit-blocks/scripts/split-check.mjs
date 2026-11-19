#!/usr/bin/env node
// Mechanical checks for a commit split. None of them changes the branch, the index or the working tree.
//
//   split-check.mjs snapshot                     print the tree id of the working tree (tracked and untracked files,
//                                                not the ignored files). Keep it before you split.
//   split-check.mjs same <tree-or-commit>        exit 0 when HEAD has exactly this content; else print the
//                                                difference and exit 1. Proves that the split lost no line.
//   split-check.mjs refactor <commit> [--tests <regex>]
//                                                exit 1 when the commit changes a test file (a pure rename is
//                                                allowed). A refactor commit that keeps the tests passes the tests
//                                                of its parent: that is the behaviour check.
//   split-check.mjs wide <base> [--max <n>]      exit 1 when a commit in <base>..HEAD changes <n> or more files
//                                                (default 6). Lock files and pure renames do not count.
//
// Exit codes: 0 pass; 1 the check found a problem; 2 usage error.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_TESTS =
  "(^|/)(tests?|__tests__|spec|__snapshots__)/|(^|/)test_[^/]*\\.py$|_test\\.(py|go|rb|exs?)$|\\.(test|spec)\\.[cm]?[jt]sx?$";
export const LOCK_FILES =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|uv\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
export const DEFAULT_MAX = 6;

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

export function snapshot(cwd) {
  const dir = mkdtempSync(join(tmpdir(), "split-check-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
  try {
    git(["read-tree", "HEAD"], { cwd, env });
    git(["add", "-A"], { cwd, env });
    return git(["write-tree"], { cwd, env }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function same(cwd, ref) {
  const want = git(["rev-parse", `${ref}^{tree}`], { cwd }).trim();
  const have = git(["rev-parse", "HEAD^{tree}"], { cwd }).trim();
  return { ok: want === have, diff: want === have ? "" : git(["diff", "--stat", want, have], { cwd }) };
}

// name-status lines of one commit against its first parent (the empty tree for a root commit), renames detected
export function changes(cwd, commit) {
  const parents = git(["rev-list", "--parents", "-n", "1", commit], { cwd }).trim().split(" ").slice(1);
  const base = parents[0] || git(["hash-object", "-t", "tree", "/dev/null"], { cwd }).trim();
  return git(["diff", "--name-status", "-M", base, commit], { cwd })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, paths };
    });
}

export function refactorCheck(cwd, commit, testsPattern = DEFAULT_TESTS) {
  const tests = new RegExp(testsPattern);
  return changes(cwd, commit)
    .filter((c) => c.status !== "R100" && c.paths.some((p) => tests.test(p)))
    .map((c) => `${c.status}\t${c.paths.join(" -> ")}`);
}

export function wideCommits(cwd, base, max = DEFAULT_MAX) {
  const shas = git(["rev-list", "--reverse", `${base}..HEAD`], { cwd }).split("\n").filter(Boolean);
  const out = [];
  for (const sha of shas) {
    const counted = changes(cwd, sha).filter((c) => c.status !== "R100" && !c.paths.every((p) => LOCK_FILES.test(p)));
    if (counted.length >= max) {
      out.push({ sha: sha.slice(0, 12), files: counted.length, subject: git(["log", "-1", "--format=%s", sha], { cwd }).trim() });
    }
  }
  return out;
}

function flag(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

function main(argv) {
  const [cmd, ref, ...rest] = argv;
  const cwd = process.cwd();
  if (cmd === "snapshot") {
    console.log(snapshot(cwd));
    return 0;
  }
  if (cmd === "same" && ref) {
    const r = same(cwd, ref);
    if (r.ok) {
      console.log("split-check: HEAD has exactly the content of the snapshot. No line is lost or added.");
      return 0;
    }
    console.log("split-check: HEAD differs from the snapshot (snapshot -> HEAD):\n" + r.diff);
    return 1;
  }
  if (cmd === "refactor" && ref) {
    const bad = refactorCheck(cwd, ref, flag(rest, "--tests", DEFAULT_TESTS));
    if (!bad.length) {
      console.log("split-check: the commit changes no test file. Its gate run is the behaviour check.");
      return 0;
    }
    console.log("split-check: a refactor commit changes test files (move these to a behaviour commit):");
    for (const line of bad) console.log("  " + line);
    return 1;
  }
  if (cmd === "wide" && ref) {
    const max = Number(flag(rest, "--max", DEFAULT_MAX));
    const wide = wideCommits(cwd, ref, max);
    if (!wide.length) {
      console.log(`split-check: no commit in ${ref}..HEAD changes ${max} or more files.`);
      return 0;
    }
    console.log(`split-check: these commits change ${max} or more files (lock files and pure renames not counted):`);
    for (const w of wide) console.log(`  ${w.sha}  ${w.files} files  ${w.subject}`);
    return 1;
  }
  console.error("usage: split-check.mjs snapshot | same <ref> | refactor <commit> [--tests <regex>] | wide <base> [--max <n>]");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`split-check: ${(e.stderr || e.message || String(e)).trim()}`);
    process.exitCode = 2;
  }
}
