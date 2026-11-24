#!/usr/bin/env node
// Before `gh pr create`: when a commit of the branch changes many files, ask the user before the pull request opens.
// One reason can touch many files (a rename), so the hook asks; it does not refuse. Lock files and pure renames do
// not count. SHARK_WIDE_COMMIT_FILES sets the limit (default 6; 0 turns the hook off).
import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_MAX, wideCommits } from "../skills/commit-blocks/scripts/split-check.mjs";

const PR_CREATE = /(^|[\s;&|(])gh\s+pr\s+create(\s|$)/;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return "";
  }
}

export function baseOf(command, cwd) {
  const named = command.match(/--base(?:=|\s+)["']?([^\s"']+)/)?.[1];
  const candidates = named
    ? [`origin/${named}`, named]
    : [tryGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd), "origin/main", "origin/master", "main", "master"];
  for (const ref of candidates.filter(Boolean)) {
    const base = tryGit(["merge-base", "HEAD", ref], cwd);
    if (base) return base;
  }
  return "";
}

/**
 * The folder where `gh pr create` runs: the last `cd <dir>` before it in the command, else the session folder. In a
 * multi-repo workspace the session folder is the workspace, and the agent changes into a repository first.
 */
export function dirOf(command, cwd) {
  const head = command.slice(0, command.search(PR_CREATE) + 1);
  let dir = cwd;
  for (const m of head.matchAll(/(?:^|[;&|(]\s*)cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|)]+))/g)) {
    const target = m[1] ?? m[2] ?? m[3];
    if (target.startsWith("$") || target.startsWith("~") || target === "-") continue;
    dir = isAbsolute(target) ? target : resolve(dir, target);
  }
  return dir;
}

export function decide(input, env = process.env) {
  const command = input?.tool_input?.command;
  if (input?.tool_name !== "Bash" || typeof command !== "string" || !PR_CREATE.test(command)) return null;
  const max = Number(env.SHARK_WIDE_COMMIT_FILES ?? DEFAULT_MAX);
  if (!Number.isFinite(max) || max <= 0) return null;
  const cwd = dirOf(command, input.cwd || process.cwd());
  const base = baseOf(command, cwd);
  if (!base) return null;
  const wide = wideCommits(cwd, base, max);
  if (!wide.length) return null;
  const list = wide.map((w) => `${w.sha} (${w.files} files) ${w.subject}`).join("; ");
  return (
    `shark: ${wide.length} commit(s) of this branch change ${max} or more files: ${list}. A wide commit often holds ` +
    `more than one reason. Split it with shark:commit-blocks (split after the fact), or approve if it has one reason.`
  );
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let reason = null;
    try {
      reason = decide(JSON.parse(raw));
    } catch {
      process.exit(0); // never stop the tool call because of a hook fault
    }
    if (!reason) process.exit(0);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason },
      }),
    );
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
