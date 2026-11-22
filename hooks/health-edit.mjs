#!/usr/bin/env node
/**
 * shark code-health edit hook (PostToolUse on Edit, MultiEdit, Write and Bash).
 *
 * After an edit, it runs `health.mjs file` on the changed source file and gives the agent the digest of the new
 * findings as additional context. It prints nothing when nothing is new. It runs for the main session and for
 * shark:code-writer and shark:lead-engineer only, and only in a project that opted in to code-health (an
 * `analyze:*` or `arch:check` row with a command in `## Commands`). `hook.edit: off` turns it off.
 *
 * After a Bash call it checks the source files that changed since its last check (at most 3), because agents also
 * edit with sed or a script. It fails open: when the analyzer is missing, crashes or times out, it says "not
 * verified" one time for each session, then stays silent.
 *
 * `hook.edit` (AGENTS.md › Quality budgets): `async` (the default) runs in the background and wakes the agent with
 * the digest (exit 2, stderr); `on` runs before the next step (additionalContext, about 2 s for each edit); `off`.
 * hooks.json registers this script two times: plain for `on`, with `--async` (async, asyncRewake) for `async`.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEALTH = fileURLToPath(new URL("../skills/code-health/scripts/health.mjs", import.meta.url));
const AGENTS = /(^|:)(code-writer|lead-engineer)$/;
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write"]);
const MAX_BASH_FILES = 3;
const BUDGET_MS = 8000;

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
  const project = h.loadProject(input.cwd || process.cwd());
  if (!h.optedIn(project.text)) return null;
  const mode = String(project.budgets["hook.edit"] ?? "async").toLowerCase();
  if (mode === "off" || (mode === "async") !== isAsync) return null;

  const sf = stateFile(input.session_id);
  const state = loadState(sf);
  const save = () => writeFileSync(sf, JSON.stringify(state));
  if (!state.base) {
    state.base = git(project.root, ["rev-parse", "HEAD"]).trim() || "HEAD";
    state.since = now - 120000;
  }
  const isSource = (p) => h.SOURCE_EXT.test(p);

  let files = [];
  let near = [];
  if (EDIT_TOOLS.has(tool)) {
    const p = input.tool_input?.file_path;
    if (!p) return null;
    const abs = isAbsolute(p) ? p : resolve(input.cwd || project.root, p);
    if (!existsSync(abs)) return null;
    const rel = relative(realpathSync(project.root), realpathSync(abs)).split("\\").join("/");
    if (rel.startsWith("..") || !isSource(rel)) return null;
    files = [rel];
    near = editedLines(readFileSync(abs, "utf8"), input.tool_input);
  } else {
    files = changedSince(project.root, state.since, isSource);
  }
  state.since = now;
  save();
  if (!files.length) return null;
  const t0 = Date.now();
  logEvent(project, { session: input.session_id ?? null, tool, mode, files, kind: "start" });

  const texts = [];
  const notVerified = [];
  const deadline = Date.now() + BUDGET_MS;
  for (const rel of files) {
    const left = deadline - Date.now();
    if (left < 1000) {
      notVerified.push(`${rel}: no time left`);
      break;
    }
    const r = h.cmdFile(project, rel, { base: state.base, near, timeoutMs: left });
    if (r.code === h.EXIT.NEW && r.text) texts.push(r.text);
    else notVerified.push(...(r.notVerified ?? [])); // a failed analyzer, also when another one ran clean
  }
  const event = { session: input.session_id ?? null, agent: input.agent_type ?? "main", tool, mode, files, ms: Date.now() - t0 };
  if (texts.length) {
    logEvent(project, { ...event, kind: "digest", text: texts.join("\n\n") });
    return { context: texts.join("\n\n") };
  }
  if (notVerified.length && !state.warned) {
    state.warned = true;
    save();
    const context = `code-health: not verified (${notVerified.join("; ")}). Say "code-health: not verified" in your report.`;
    logEvent(project, { ...event, kind: "not-verified", text: context });
    return { context };
  }
  logEvent(project, { ...event, kind: "clean" });
  return null;
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
