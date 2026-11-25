#!/usr/bin/env node
/**
 * shark code-health review hook: one review when the agent ends its work, like a code review.
 *
 * Stop (the main session) and SubagentStop (shark:code-writer and shark:lead-engineer only): it runs `analyze:file`
 * on each source file that changed since the session started, and compares each file with its version at that
 * commit. When there are new findings that the agent was not told yet, it blocks the stop and gives the digest as
 * the reason: the agent fixes each finding or accepts it on purpose (`health.mjs baseline allow`), then stops
 * again. A finding is told one time for each session, and a session gets at most MAX_BLOCKS blocks, so the review
 * cannot loop. When nothing changed since the last review, it only runs `git` (milliseconds).
 *
 * `node health-review.mjs start` (SessionStart) records the commit of each repository at the session start: the
 * base of the review, so changes that the agent commits are reviewed too. Without that record, the base is the commit
 * at the first review.
 *
 * It runs only in a project that opted in to code-health (an `analyze:*` or `arch:check` row with a command in
 * `## Commands`); `hook.review: off` (AGENTS.md › Quality budgets) turns it off. In a multi-repo workspace, it
 * reviews the session folder and each repository in the `## Repositories` table, each with its own project file.
 * It fails open: when an analyzer is missing, crashes or runs out of time, it blocks one time with "not verified",
 * then lets the agent stop.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEALTH = fileURLToPath(new URL("../skills/code-health/scripts/health.mjs", import.meta.url));
const AGENTS = /(^|:)(code-writer|lead-engineer)$/;

/** The time for all analyzer runs of one review: 10 s less than the timeout of the hook entries in hooks.json. */
export const BUDGET_MS = 170000;
/** The most stops that the review blocks in one session. */
export const MAX_BLOCKS = 3;

let healthMod = null;
async function health() {
  healthMod ??= await import(HEALTH);
  return healthMod;
}

function stateDir() {
  const dir = join(process.env.SHARK_HEALTH_STATE_DIR || tmpdir(), "shark-health-review");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const safe = (s) => String(s || "nosession").replace(/[^\w.-]/g, "_");
const stateFile = (sessionId) => join(stateDir(), `${safe(sessionId)}.json`);

function loadState(sessionId) {
  try {
    return JSON.parse(readFileSync(stateFile(sessionId), "utf8"));
  } catch {
    return {};
  }
}

function saveState(sessionId, state) {
  writeFileSync(stateFile(sessionId), JSON.stringify(state));
}

/**
 * Claims one finding for the session: true only for the first caller. Two reviews can overlap (a subagent and the main
 * session), so the claim is a file made with the exclusive flag.
 */
function claim(sessionId, fp) {
  const dir = join(stateDir(), `${safe(sessionId)}.told`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, safe(fp)), "", { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

/** The repository roots in the `## Repositories` table of a workspace project file (the Path column). */
export function workspaceRepos(project) {
  const m = /^## Repositories\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(project.text || "");
  if (!m) return [];
  const roots = [];
  for (const line of m[1].split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const path = /^`([^`]+)`$/.exec(cells[2] ?? "")?.[1];
    if (path && !path.startsWith("<")) roots.push(resolve(project.root, path));
  }
  return roots;
}

/** The session folder and the workspace repositories, each loaded once. */
async function projects(cwd) {
  const h = await health();
  const session = h.loadProject(cwd);
  const out = [];
  const seen = new Set();
  for (const root of [session.root, ...workspaceRepos(session)]) {
    if (!existsSync(root)) continue;
    const project = root === session.root ? session : h.loadProject(root);
    const key = realpathSync(project.root);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ project, key });
    }
  }
  return { session, all: out };
}

/** The source files that changed against `base` (committed, staged, not staged, untracked): most changed lines first. */
export function changed(root, base, isSource) {
  const lines = new Map();
  for (const row of git(root, ["diff", "--numstat", "--no-renames", base]).split("\n")) {
    const [add, del, p] = row.split("\t");
    if (p) lines.set(p, (Number(add) || 0) + (Number(del) || 0));
  }
  for (const p of git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n")) {
    if (!p.trim()) continue;
    try {
      lines.set(p, readFileSync(join(root, p), "utf8").split("\n").length);
    } catch {
      /* unreadable */
    }
  }
  return [...lines]
    .filter(([p]) => isSource(p) && existsSync(join(root, p)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p);
}

/** A short text that changes when one of the files changes: no new review when it is the same. */
function signature(root, files) {
  return files
    .map((p) => {
      try {
        const s = statSync(join(root, p));
        return `${p}:${s.size}:${s.mtimeMs}`;
      } catch {
        return `${p}:gone`;
      }
    })
    .join("|");
}

/** Appends one line to `.git/shark-health/events.log`: what the hook told the agent (never in a diff). */
function logEvent(project, entry) {
  if (!project.gitDir) return;
  try {
    const dir = join(project.gitDir, "shark-health");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "events.log"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* best effort */
  }
}

/** SessionStart: records the commit of each repository at the session start (the base of the review). */
export async function start(input) {
  const { all } = await projects(input.cwd || process.cwd());
  const state = loadState(input.session_id);
  state.bases ??= {};
  for (const { project, key } of all) {
    if (project.gitDir) state.bases[key] ??= git(project.root, ["rev-parse", "HEAD"]).trim() || "HEAD";
  }
  saveState(input.session_id, state);
}

/** Decides the review. Returns { block } (the reason that Claude gets), or null to let the agent stop. */
export async function review(input, { budgetMs = BUDGET_MS } = {}) {
  const event = input.hook_event_name || "Stop";
  if (event === "SubagentStop" && !AGENTS.test(input.agent_type ?? "")) return null;
  const h = await health();
  const sid = input.session_id;
  const { session, all } = await projects(input.cwd || process.cwd());
  const active = all.filter(({ project }) => h.optedIn(project.text) && String(project.budgets["hook.review"] ?? "on").toLowerCase() !== "off");
  if (!active.length) return null;

  const state = loadState(sid);
  state.bases ??= {};
  state.sigs ??= {};
  const isSource = (p) => h.SOURCE_EXT.test(p);
  const work = [];
  for (const { project, key } of active) {
    state.bases[key] ??= git(project.root, ["rev-parse", "HEAD"]).trim() || "HEAD";
    const files = changed(project.root, state.bases[key], isSource);
    const sig = signature(project.root, files);
    if (files.length && state.sigs[key] !== sig) work.push({ project, key, files, sig, base: state.bases[key] });
  }
  saveState(sid, state);
  if (!work.length) return null;
  const agent = input.agent_type ?? "main";
  if ((state.blocks ?? 0) >= MAX_BLOCKS) {
    for (const w of work) logEvent(w.project, { session: sid ?? null, event, agent, files: w.files, kind: "capped" });
    return null;
  }

  const t0 = Date.now();
  const deadline = t0 + budgetMs;
  const texts = [];
  const notVerified = [];
  let retold = 0;
  for (const w of work) {
    logEvent(w.project, { session: sid ?? null, event, agent, files: w.files, kind: "start" });
    let complete = true;
    for (const rel of w.files) {
      const left = deadline - Date.now();
      if (left < 1000) {
        notVerified.push(`${w.files.slice(w.files.indexOf(rel)).length} file(s) from ${rel}: no time left`);
        complete = false;
        break;
      }
      const r = h.cmdFile(w.project, rel, { base: w.base, timeoutMs: left });
      // In a workspace, a path names its repository folder, so the agent knows where the file is.
      const scope = w.project === session ? rel : join(relative(session.root, w.project.root), rel).split("\\").join("/");
      if (r.code === h.EXIT.NEW && r.findings?.length) {
        const fresh = r.findings.filter((f) => claim(sid, f.fp));
        retold += r.findings.length - fresh.length;
        if (fresh.length) texts.push(h.digest(fresh, { scope, budgets: w.project.budgets, notVerified: r.notVerified ?? [] }));
      } else if (r.code !== h.EXIT.CLEAN || r.notVerified?.length) {
        notVerified.push(...(r.notVerified ?? []));
        complete = false;
      }
    }
    if (complete) state.sigs[w.key] = w.sig;
  }

  let reason = null;
  let kind = notVerified.length ? "not-verified" : retold ? "told" : "clean";
  if (texts.length) {
    reason =
      "code-health review of the changes in this session (shark:code-health §1):\n\n" +
      texts.join("\n\n") +
      "\n\nFix each finding, or accept it on purpose with `node <shark>/skills/code-health/scripts/health.mjs " +
      'baseline allow <id> --reason "<why>"`. Then finish, and name each accepted finding in your report.';
    kind = "digest";
  } else if (notVerified.length && !state.warned) {
    state.warned = true;
    reason = `code-health: not verified (${notVerified.join("; ")}). Say "code-health: not verified" in your report, then finish.`;
    kind = "not-verified";
  }
  if (reason) state.blocks = (state.blocks ?? 0) + 1;
  saveState(sid, state);
  for (const w of work) {
    logEvent(w.project, { session: sid ?? null, event, agent, files: w.files, ms: Date.now() - t0, kind, ...(retold ? { retold } : {}), ...(reason ? { text: reason } : {}) });
  }
  return reason ? { block: reason } : null;
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      process.exit(0);
    }
    try {
      if (process.argv.includes("start")) await start(input);
      else {
        const r = await review(input);
        if (r?.block) process.stdout.write(JSON.stringify({ decision: "block", reason: r.block }));
      }
    } catch (e) {
      if (process.env.SHARK_HEALTH_DEBUG) process.stderr.write(`shark code-health review: ${e.stack}\n`);
    }
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
