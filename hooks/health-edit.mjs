#!/usr/bin/env node
/**
 * shark code-health edit hook (PostToolUse on Edit, MultiEdit, Write and Bash).
 *
 * After an edit, it runs `health.mjs file` on the changed source file and gives the agent the digest of the new
 * findings as additional context. It prints nothing when nothing is new. It runs for the main session and for
 * shark:code-writer and shark:lead-engineer only, and only in a project that opted in to code-health (an
 * `analyze:*` or `arch:check` row with a command in `## Commands`). `hook.edit: off` turns it off.
 *
 * It tells each finding one time for each session (by its id): the base is the commit at the start of the session,
 * so a finding that the agent keeps stays new after each later edit of that file.
 *
 * After a Bash call it checks the source files that changed since its last check (at most 3), because agents also
 * edit with sed or a script. It fails open: when the analyzer is missing, crashes or times out, it says "not
 * verified" one time for each session, then stays silent.
 *
 * In a multi-repo workspace, each repository's own project file decides: an edit is checked with the commands, the
 * budgets and the git base of the repository that holds the file. After a Bash call it checks the session folder and
 * each repository in the `## Repositories` table of the workspace project file.
 *
 * `hook.edit` (AGENTS.md › Quality budgets): `async` (the default) runs in the background and wakes the agent with
 * the digest (exit 2, stderr); `on` runs before the next step (additionalContext, about 2 s for each edit); `off`.
 * hooks.json registers this script two times: plain for `on`, with `--async` (async, asyncRewake) for `async`.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEALTH = fileURLToPath(new URL("../skills/code-health/scripts/health.mjs", import.meta.url));
const AGENTS = /(^|:)(code-writer|lead-engineer)$/;
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);
const MAX_BASH_FILES = 3;

/**
 * The time for all analyzer runs of one hook call: 2 s less than the timeout of its entry in hooks.json (10 s for the
 * sync entry, 30 s for the async one). One Opengrep scan takes about 2 to 4 s, and a Bash command can change up to
 * MAX_BASH_FILES files.
 */
export function budgetMs(isAsync) {
  return isAsync ? 28000 : 8000;
}

let healthMod = null;
async function health() {
  healthMod ??= await import(HEALTH);
  return healthMod;
}

function stateFile(sessionId) {
  const dir = join(process.env.SHARK_HEALTH_STATE_DIR || tmpdir(), "shark-health-hook");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${String(sessionId || "nosession").replace(/[^\w.-]/g, "_")}.json`);
}

/**
 * Claims one finding for the session: true only for the first caller. Async hook entries run in parallel, so the
 * claim is a file made with the exclusive flag, not a list in the state file (read at the start, written at the end).
 */
function claim(sessionId, fp) {
  const dir = stateFile(sessionId).replace(/\.json$/, ".told");
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, String(fp).replace(/[^\w.-]/g, "_")), "", { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

function loadState(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}

/** 1-based lines where the new text of an Edit starts, for sorting the digest by distance. */
export function editedLines(text, input) {
  const pieces = [input?.new_string, ...(input?.edits ?? []).map((e) => e.new_string)].filter((s) => s && s.trim());
  const lines = [];
  for (const p of pieces) {
    const i = text.indexOf(p);
    if (i >= 0) lines.push(text.slice(0, i).split("\n").length);
  }
  return lines;
}

/** The source files that changed since `since` (ms), from git status. */
export function changedSince(root, since, isSource) {
  const out = [];
  for (const line of git(root, ["status", "--porcelain", "--untracked-files=all"]).split("\n")) {
    const p = line.slice(3).trim().replace(/^"|"$/g, "").split(" -> ").pop();
    if (!p || !isSource(p)) continue;
    try {
      if (statSync(join(root, p)).mtimeMs > since) out.push(p);
    } catch {
      /* deleted */
    }
  }
  return out.slice(0, MAX_BASH_FILES);
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

/**
 * Decides what to tell the agent. Returns { context } (text for additionalContext), or null for silence.
 */
export async function decide(input, { now = Date.now(), async: isAsync = false } = {}) {
  const tool = input.tool_name;
  if (!EDIT_TOOLS.has(tool) && tool !== "Bash") return null;
  if (input.agent_type && !AGENTS.test(input.agent_type)) return null;
  const h = await health();
  const session = h.loadProject(input.cwd || process.cwd());
  const active = (project) => {
    if (!h.optedIn(project.text)) return false;
    const mode = String(project.budgets["hook.edit"] ?? "async").toLowerCase();
    return mode !== "off" && (mode === "async") === isAsync;
  };
  const isSource = (p) => h.SOURCE_EXT.test(p);

  // An edit: the repository that holds the file. A Bash call: the session folder and the workspace repositories.
  let candidates;
  let editRel = null;
  let near = [];
  if (EDIT_TOOLS.has(tool)) {
    const p = input.tool_input?.file_path;
    if (!p) return null;
    const abs = isAbsolute(p) ? p : resolve(input.cwd || session.root, p);
    if (!existsSync(abs)) return null;
    const own = h.loadProject(dirname(abs));
    const project = own.gitDir ? own : session;
    const rel = relative(realpathSync(project.root), realpathSync(abs)).split("\\").join("/");
    if (rel.startsWith("..") || !isSource(rel)) return null;
    candidates = [project];
    editRel = rel;
    near = editedLines(readFileSync(abs, "utf8"), input.tool_input);
  } else {
    const roots = [session.root, ...workspaceRepos(session)].filter((r) => existsSync(r));
    const seen = new Set();
    candidates = [];
    for (const r of roots) {
      const project = r === session.root ? session : h.loadProject(r);
      const key = realpathSync(project.root);
      if (!seen.has(key)) seen.add(key) && candidates.push(project);
    }
  }
  const projects = candidates.filter(active);
  if (!projects.length) return null;

  const sf = stateFile(input.session_id);
  const state = loadState(sf);
  const save = () => writeFileSync(sf, JSON.stringify(state));
  state.bases ??= {};
  const since = state.since ?? now - 120000;
  const work = [];
  for (const project of projects) {
    const key = realpathSync(project.root);
    state.bases[key] ??= git(project.root, ["rev-parse", "HEAD"]).trim() || "HEAD";
    const files = editRel ? [editRel] : changedSince(project.root, since, isSource);
    if (files.length) work.push({ project, base: state.bases[key], files });
  }
  state.since = now;
  save();
  if (!work.length) return null;
  const t0 = Date.now();
  for (const w of work) logEvent(w.project, { session: input.session_id ?? null, tool, files: w.files, kind: "start" });

  const texts = [];
  const notVerified = [];
  const retold = new Map();
  const deadline = Date.now() + budgetMs(isAsync);
  outer: for (const w of work) {
    for (const rel of w.files.slice(0, MAX_BASH_FILES)) {
      const left = deadline - Date.now();
      if (left < 1000) {
        notVerified.push(`${rel}: no time left`);
        break outer;
      }
      const r = h.cmdFile(w.project, rel, { base: w.base, near, timeoutMs: left });
      // In a workspace, a path names its repository folder, so the agent knows where the file is.
      const scope = projects.length > 1 || w.project !== session ? join(relative(session.root, w.project.root), rel).split("\\").join("/") : rel;
      if (r.code === h.EXIT.NEW && r.findings?.length) {
        // The base is the commit at the start of the session, so a finding stays new until it is fixed. Tell each
        // finding one time: the agent has it, and fixes it or accepts it (`baseline allow`).
        const fresh = r.findings.filter((f) => claim(input.session_id, f.fp));
        retold.set(w.project, (retold.get(w.project) ?? 0) + r.findings.length - fresh.length);
        if (fresh.length) texts.push(h.digest(fresh, { scope, budgets: w.project.budgets, notVerified: r.notVerified ?? [], near }));
      } else notVerified.push(...(r.notVerified ?? [])); // a failed analyzer, also when another one ran clean
    }
  }
  const context = texts.length
    ? texts.join("\n\n")
    : notVerified.length && !state.warned
      ? `code-health: not verified (${notVerified.join("; ")}). Say "code-health: not verified" in your report.`
      : null;
  if (!texts.length && context) {
    state.warned = true;
    save();
  }
  for (const w of work) {
    const n = retold.get(w.project) ?? 0;
    const mode = String(w.project.budgets["hook.edit"] ?? "async").toLowerCase();
    const event = { session: input.session_id ?? null, agent: input.agent_type ?? "main", tool, mode, files: w.files, ms: Date.now() - t0, ...(n ? { retold: n } : {}) };
    const kind = texts.length ? "digest" : context ? "not-verified" : n ? "told" : "clean";
    logEvent(w.project, { ...event, kind, ...(context ? { text: context } : {}) });
  }
  return context ? { context } : null;
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
    const isAsync = process.argv.includes("--async");
    try {
      const r = await decide(input, { async: isAsync });
      if (r?.context && isAsync) {
        process.stderr.write(r.context + "\n");
        process.exit(2); // asyncRewake: wakes the agent with stderr
      }
      if (r?.context) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: r.context } }));
      }
    } catch (e) {
      if (process.env.SHARK_HEALTH_DEBUG) process.stderr.write(`shark code-health hook: ${e.stack}\n`);
    }
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
