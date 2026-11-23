#!/usr/bin/env node
/**
 * shark:code-health. Runs the analyzers that the project names in AGENTS.md and reports only the findings that are
 * new: not in the committed baseline, not allowed on purpose, and not in the same file at the base commit.
 *
 * Usage:
 *   health.mjs file <path> [--base <ref>] [--near <line>] [--timeout-ms 8000] [--json]
 *   health.mjs diff [--base <ref>] [--json]
 *   health.mjs arch [--json]
 *   health.mjs baseline record [--ref <ref>]
 *   health.mjs baseline compare [--base <ref>]
 *   health.mjs baseline allow <id> --reason <text> [--lane <name>]
 *   health.mjs baseline fold
 *   health.mjs sarif --out <file> [--only sec,arch,cx]
 *
 * Commands come from the `## Commands` table of AGENTS.md (or CLAUDE.md): `analyze:file`, `analyze:diff`,
 * `arch:check`, `analyze:full`. A cell can hold several commands (several code spans, or `&&`). Each command writes
 * SARIF or Lizard output to stdout, or to `{out}`. Placeholders: `{file}`, `{base}`, `{out}`.
 *
 * Files: `.shark/health-baseline.json` (committed), `.shark/health-allow/<lane>.json` (lane allow entries, folded
 * at merge), `.git/shark-health/` (cache of base-commit results and the last full SARIF; never in a diff).
 *
 * Exit codes: 0 clean; 1 new findings; 2 usage error; 3 a needed command row is missing in AGENTS.md;
 * 4 an analyzer crashed or timed out (no usable output).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isLizard, lizardToSarif, parseLizard } from "./lizard2sarif.mjs";
import { category, displayRule, fingerprint, flatten, functionsOf, hash, LEVELS, parseSarif, toSarif } from "./sarif.mjs";

export const EXIT = { CLEAN: 0, NEW: 1, USAGE: 2, MISSING: 3, ANALYZER: 4 };
export const DEFAULT_BUDGETS = {
  "ccn.warn": 10,
  "ccn.block": 20,
  "ccn.no_increase_over": 10,
  "nloc.warn": 60,
  "params.warn": 5,
  "security.block": "error",
  "digest.max_findings": 5,
  "hook.edit": "async",
};
export const SOURCE_EXT =
  /\.(py|pyi|js|mjs|cjs|jsx|ts|tsx|mts|cts|go|rs|java|kt|kts|scala|rb|php|cs|c|h|cc|cpp|cxx|hpp|swift|m|mm|lua|dart|vue|svelte|sol|ex|exs|erl)$/i;
const PROJECT_FILES = ["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"];
const DIGEST_CHARS = 1500;
const MESSAGE_CHARS = 120;

// ---------------------------------------------------------------- project config

function cells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  return t.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
}

function section(text, name) {
  const re = new RegExp(`^##\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

const unquote = (s) => s.replace(/^`|`$/g, "").trim();

/** The `## Commands` rows as { key: [command, ...] }. A row whose value is a placeholder or "none" is left out. */
export function readCommands(text) {
  const body = section(text, "Commands");
  const out = {};
  if (!body) return out;
  let rows = false;
  for (const line of body.split("\n")) {
    const c = cells(line);
    if (!c) {
      if (rows) break; // only the first table: the examples table below it is guidance, not project values
      continue;
    }
    if (c.length < 2) continue;
    if (/^-+$/.test(c[0].replace(/[: ]/g, ""))) {
      rows = true; // the separator line: the header is above it
      continue;
    }
    if (!rows) continue;
    const key = unquote(c[0]).replace(/\s.*$/, "");
    const spans = [...c[1].matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    const raw = spans.length ? spans : [c[1]];
    const cmds = raw.flatMap((s) => s.split(/\s&&\s/)).map((s) => s.trim()).filter(Boolean);
    if (!cmds.length || cmds.some((s) => /^<.*>$/.test(s)) || cmds.every((s) => /^none$/i.test(s))) continue;
    out[key] = cmds;
  }
  return out;
}

/** The `## Quality budgets` values merged over the defaults. */
export function readBudgets(text) {
  const out = { ...DEFAULT_BUDGETS };
  const body = section(text, "Quality budgets");
  if (!body) return out;
  for (const line of body.split("\n")) {
    const c = cells(line);
    if (!c || c.length < 2) continue;
    const key = unquote(c[0]);
    if (!(key in DEFAULT_BUDGETS)) continue;
    const v = unquote(c[1]);
    out[key] = typeof DEFAULT_BUDGETS[key] === "number" && /^\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}

/** Whether the project opted in to code-health: an `analyze:*` or `arch:check` row with a real command. */
export function optedIn(text) {
  return Object.keys(readCommands(text)).some((k) => /^(analyze:|arch:)/.test(k));
}

function git(root, args, opts = {}) {
  const r = spawnSync("git", args, { cwd: root, encoding: opts.encoding ?? "utf8", maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout : null;
}

export function loadProject(cwd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  const root = top ? top.trim() : resolve(cwd);
  let text = "";
  let file = null;
  for (const name of PROJECT_FILES) {
    const p = join(root, name);
    if (existsSync(p)) {
      const t = readFileSync(p, "utf8");
      if (section(t, "Commands") || section(t, "Quality budgets")) {
        text = t;
        file = name;
        break;
      }
      if (!file) {
        text = t;
        file = name;
      }
    }
  }
  const gitDir = top ? git(root, ["rev-parse", "--absolute-git-dir"])?.trim() : null;
  return { root, text, file, commands: readCommands(text), budgets: readBudgets(text), gitDir };
}

// ---------------------------------------------------------------- analyzers

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function parseOutput(text, cmd, status, stderr, budgets) {
  const sarif = parseSarif(text);
  if (sarif) return { log: sarif };
  if (isLizard(text) || (status === 0 && /lizard/.test(cmd) && !String(text).trim())) {
    const fns = parseLizard(text) ?? [];
    return {
      log: lizardToSarif(fns, { ccnWarn: Number(budgets["ccn.warn"]), ccnBlock: Number(budgets["ccn.block"]), nlocWarn: Number(budgets["nloc.warn"]), paramsWarn: Number(budgets["params.warn"]) }),
    };
  }
  const why = status === 127 || /not found/i.test(stderr ?? "") ? "not installed" : `exit ${status}, no SARIF or Lizard output`;
  return { error: `\`${cmd.split(" ")[0]}\` ${why}` };
}

/**
 * Runs the commands of one row for several sides at the same time (for example the working copy and the base
 * version of a file). Each command runs once for each side, in parallel; the commands of the row run in order.
 *
 * @param {string[]} cmds The commands.
 * @param {{ file?: string, base?: string }[]} sides Placeholder values, one set for each side.
 * @returns {{ log: object, errors: string[], failed: boolean }[]} One result for each side.
 */
export function runSides(cmds, sides, { cwd, timeoutMs = 600000, budgets = DEFAULT_BUDGETS } = {}) {
  const deadline = Date.now() + timeoutMs;
  const res = sides.map(() => ({ logs: [], errors: [] }));
  const tmp = mkdtempSync(join(tmpdir(), "shark-health-"));
  try {
    cmds.forEach((cmd, i) => {
      const left = deadline - Date.now();
      if (left <= 0) {
        res.forEach((r) => r.errors.push(`timed out before \`${cmd.split(" ")[0]}\``));
        return;
      }
      const f = (k, name) => join(tmp, `${name}-${i}-${k}`);
      const parts = sides.map((vars, k) => {
        const line = cmd
          .replace(/\{file\}/g, vars.file !== undefined ? shq(vars.file) : "{file}")
          .replace(/\{base\}/g, vars.base !== undefined ? shq(vars.base) : "{base}")
          .replace(/\{out\}/g, shq(f(k, "out")));
        return `( ( ${line} ) > ${shq(f(k, "stdout"))} 2> ${shq(f(k, "stderr"))}; echo $? > ${shq(f(k, "rc"))} ) &`;
      });
      const r = spawnSync("sh", ["-c", `${parts.join("\n")}\nwait`], { cwd, encoding: "utf8", timeout: left, killSignal: "SIGKILL" });
      const timedOut = r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL";
      sides.forEach((_, k) => {
        const read = (name) => (existsSync(f(k, name)) ? readFileSync(f(k, name), "utf8") : "");
        if (timedOut && !existsSync(f(k, "rc"))) {
          res[k].errors.push(`\`${cmd.split(" ")[0]}\` timed out`);
          return;
        }
        const status = Number(read("rc").trim() || 1);
        const text = cmd.includes("{out}") && existsSync(f(k, "out")) ? read("out") : read("stdout");
        const out = parseOutput(text, cmd, status, read("stderr"), budgets);
        if (out.log) res[k].logs.push(out.log);
        else res[k].errors.push(out.error);
      });
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return res.map((r) => ({ log: { version: "2.1.0", runs: r.logs.flatMap((l) => l.runs) }, errors: r.errors, failed: r.logs.length === 0 && r.errors.length > 0 }));
}

/** Runs the commands of one row once. */
export function runRow(cmds, vars, opts = {}) {
  return runSides(cmds, [vars], opts)[0];
}

// ---------------------------------------------------------------- baseline

const baselinePath = (root) => join(root, ".shark", "health-baseline.json");

export function loadBaseline(root) {
  const p = baselinePath(root);
  let b = { version: 1, files: {}, allow: [] };
  if (existsSync(p)) {
    try {
      b = { ...b, ...JSON.parse(readFileSync(p, "utf8")) };
    } catch {
      /* a broken baseline counts as none */
    }
  }
  const laneDir = join(root, ".shark", "health-allow");
  if (existsSync(laneDir)) {
    for (const name of readdirSync(laneDir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const lane = JSON.parse(readFileSync(join(laneDir, name), "utf8"));
        b.allow = [...b.allow, ...(lane.allow ?? [])];
      } catch {
        /* skip a broken lane file */
      }
    }
  }
  return b;
}

function writeJson(p, obj) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 1) + "\n");
}

/** Function keys: file + name + order among the functions of the same name in that file. */
export function functionKeys(functions) {
  const n = new Map();
  return functions.map((f) => {
    const base = `${f.file}::${f.name}`;
    const k = n.get(base) ?? 0;
    n.set(base, k + 1);
    return { ...f, key: `${base}#${k}` };
  });
}

// ---------------------------------------------------------------- one-side analysis

function cacheDir(project) {
  return project.gitDir ? join(project.gitDir, "shark-health") : join(project.root, ".shark", ".cache");
}

function rulesStamp(root) {
  const dir = join(root, ".shark", "rules");
  if (!existsSync(dir)) return "";
  const parts = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else parts.push(`${p}:${statSync(p).mtimeMs}:${statSync(p).size}`);
    }
  };
  walk(dir);
  return hash(parts.sort().join("\n"));
}

const EMPTY = { findings: [], functions: [], errors: [], failed: false };

/**
 * Prepares one side of a file: the working copy, or its content at a ref (a temp copy at the same relative path).
 * Returns { done } when the result is known without a run (cached, or no such file at the ref).
 */
function prepareSide(project, relPath, ref, cmds) {
  const { root } = project;
  if (!ref) {
    const target = join(root, relPath);
    return { target, text: existsSync(target) ? readFileSync(target, "utf8") : "" };
  }
  const blob = git(root, ["rev-parse", "--verify", "-q", `${ref}:${relPath}`])?.trim();
  if (!blob) return { done: EMPTY };
  const cacheFile = join(cacheDir(project), "cache", `${hash([blob, cmds.join("\n"), rulesStamp(root), JSON.stringify(project.budgets)].join("|"))}.json`);
  if (existsSync(cacheFile)) {
    try {
      return { done: JSON.parse(readFileSync(cacheFile, "utf8")) };
    } catch {
      /* recompute */
    }
  }
  const text = git(root, ["cat-file", "blob", blob]) ?? "";
  const tmp = mkdtempSync(join(tmpdir(), "shark-health-base-"));
  const target = join(tmp, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return { target, text, tmp, cacheFile };
}

function finishSide(project, relPath, side, run) {
  const { root } = project;
  const remap = [[side.target, relPath]];
  const read = (f) => (f === relPath ? side.text : existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : null);
  const functions = functionKeys(functionsOf(run.log, { root, remap }).filter((f) => f.file === relPath));
  const findings = fingerprint(
    flatten(run.log, { root, remap }).filter((f) => f.tool !== "lizard" && (f.file === relPath || !f.file)),
    read,
    functions,
  );
  const result = { findings, functions, errors: run.errors, failed: run.failed };
  if (side.cacheFile && !run.failed && !run.errors.length) writeJson(side.cacheFile, result);
  return result;
}

/**
 * Analyzes a file on several sides at once (null = the working copy, or a ref). The sides that need a run run in
 * parallel. Returns one { findings, functions, errors, failed } for each side, with repo paths and fingerprints.
 */
export function analyzeSides(project, relPath, refs, { timeoutMs, cmds } = {}) {
  const sides = refs.map((ref) => prepareSide(project, relPath, ref, cmds));
  const todo = sides.filter((x) => !x.done);
  try {
    const runs = todo.length ? runSides(cmds, todo.map((x) => ({ file: x.target })), { cwd: project.root, timeoutMs, budgets: project.budgets }) : [];
    return sides.map((x) => x.done ?? finishSide(project, relPath, x, runs[todo.indexOf(x)]));
  } finally {
    for (const x of sides) if (x.tmp) rmSync(x.tmp, { recursive: true, force: true });
  }
}

/** Analyzes one file: the working copy, or its content at a ref. */
export function analyzeFile(project, relPath, { ref = null, timeoutMs, cmds } = {}) {
  return analyzeSides(project, relPath, [ref], { timeoutMs, cmds })[0];
}

// ---------------------------------------------------------------- delta

/**
 * The new findings of one file: security and arch findings whose fingerprint is not old, and complexity findings
 * for functions that are new and over budget, or over budget and worse than before.
 */
export function delta(current, base, baseline, budgets, relPath) {
  const allowed = new Set((baseline.allow ?? []).map((a) => a.id));
  const committed = baseline.files?.[relPath] ?? {};
  const oldFps = new Set([...base.findings.map((f) => f.fp), ...Object.keys(committed.findings ?? {})]);
  const out = current.findings.filter((f) => !oldFps.has(f.fp) && !allowed.has(f.fp));

  const before = new Map(base.functions.map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(committed.functions ?? {})) if (!before.has(k)) before.set(k, v);
  const warn = Number(budgets["ccn.warn"]);
  const block = Number(budgets["ccn.block"]);
  const noInc = Number(budgets["ccn.no_increase_over"]);
  for (const fn of current.functions) {
    const old = before.get(fn.key);
    const checks = [
      { rule: "cx-ccn", value: fn.ccn, prev: old?.ccn, over: fn.ccn > warn, worse: old && fn.ccn > old.ccn && fn.ccn > noInc, budget: warn },
      { rule: "cx-nloc", value: fn.nloc, prev: old?.nloc, over: fn.nloc > Number(budgets["nloc.warn"]), worse: old && fn.nloc > old.nloc, budget: budgets["nloc.warn"] },
      { rule: "cx-params", value: fn.params, prev: old?.params, over: fn.params > Number(budgets["params.warn"]), worse: old && fn.params > old.params, budget: budgets["params.warn"] },
    ];
    for (const c of checks) {
      if (!c.over && !(c.rule === "cx-ccn" && c.worse)) continue;
      if (old && !c.worse) continue;
      const fp = hash(`${c.rule}|${fn.key}|${c.value}`, 12);
      if (allowed.has(fp)) continue;
      const metric = c.rule.slice(3);
      const change = old ? `${c.prev} -> ${c.value}` : `${c.value}`;
      out.push({
        tool: "lizard",
        ruleId: c.rule,
        level: c.rule === "cx-ccn" && fn.ccn > block ? "error" : "warning",
        file: relPath,
        line: fn.start,
        message: `\`${fn.name}\` ${metric} ${change} (budget ${c.budget}).`,
        help: "Fix: see complexity-playbook.md (guard clauses, extract function, table-driven rules).",
        fp,
        fn: fn.name,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- digest

function splitFix(f) {
  const m = f.message.match(/^([\s\S]*?)\s*Fix:\s*([\s\S]*)$/);
  if (m) return { msg: m[1], fix: `Fix: ${m[2]}` };
  return { msg: f.message, fix: /Fix:/.test(f.help) ? f.help.slice(f.help.indexOf("Fix:")) : f.help ? `Fix: ${f.help}` : "" };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** Severity first, then distance from the edited line. */
export function sortFindings(findings, near = []) {
  const dist = (f) => (near.length ? Math.min(...near.map((n) => Math.abs((f.line || 0) - n))) : 0);
  return [...findings].sort((a, b) => LEVELS[b.level] - LEVELS[a.level] || dist(a) - dist(b) || a.file.localeCompare(b.file) || a.line - b.line);
}

/** The digest text (at most `max` findings and 1,500 characters), or "" when there is nothing new. */
export function digest(findings, { scope, budgets = DEFAULT_BUDGETS, notVerified = [], near = [] } = {}) {
  if (!findings.length && !notVerified.length) return "";
  const max = Number(budgets["digest.max_findings"]) || 5;
  const sorted = sortFindings(findings, near);
  const head = `code-health: ${findings.length} new in ${scope} (budget: ccn ${budgets["ccn.warn"]})`;
  const tail = (shown) => `+${findings.length - shown} more. Not verified: ${notVerified.length ? notVerified.join("; ") : "none"}.`;
  const items = [];
  let text = head;
  for (const f of sorted.slice(0, max)) {
    const { msg, fix } = splitFix(f);
    const where = scope.includes(",") || scope === "the diff" ? `${f.file}:${f.line}` : `L${f.line}`;
    const lvl = f.level === "error" ? "ERROR" : "WARN ";
    let item = `${items.length + 1}. ${lvl} ${displayRule(f.ruleId)}  ${where}  ${clip(msg, MESSAGE_CHARS)}`;
    if (fix) item += `\n   ${clip(fix, MESSAGE_CHARS)}`;
    item += `\n   id: ${f.fp}`;
    const next = `${text}\n${item}`;
    if (next.length + tail(items.length + 1).length + 1 > DIGEST_CHARS) break;
    items.push(item);
    text = next;
  }
  return `${text}\n${tail(items.length)}`;
}

// ---------------------------------------------------------------- commands

function changedFiles(project, base) {
  const { root } = project;
  const tracked = git(root, ["diff", "--name-only", "--no-renames", base]) ?? "";
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]) ?? "";
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")])]
    .map((s) => s.trim())
    .filter((p) => p && SOURCE_EXT.test(p) && existsSync(join(root, p)));
}

function saveLast(project, findings) {
  try {
    writeJson(join(cacheDir(project), "last-health.sarif"), toSarif(findings));
  } catch {
    /* best effort */
  }
}

export function cmdFile(project, relPath, { base = "HEAD", near = [], timeoutMs = 8000 } = {}) {
  const cmds = project.commands["analyze:file"];
  if (!cmds) return { code: EXIT.MISSING, findings: [], notVerified: ["analyze:file row missing"], text: "" };
  const [cur, old] = analyzeSides(project, relPath, [null, base], { cmds, timeoutMs });
  if (cur.failed) return { code: EXIT.ANALYZER, findings: [], notVerified: cur.errors, text: "" };
  const baseline = loadBaseline(project.root);
  const notVerified = [...cur.errors, ...(old.failed || old.errors.length ? ["base version not analyzed"] : [])];
  const findings = old.failed ? delta(cur, { findings: [], functions: [] }, baseline, project.budgets, relPath) : delta(cur, old, baseline, project.budgets, relPath);
  saveLast(project, findings);
  const text = findings.length ? digest(findings, { scope: relPath, budgets: project.budgets, notVerified, near }) : "";
  return { code: findings.length ? EXIT.NEW : EXIT.CLEAN, findings, notVerified, text };
}

export function cmdDiff(project, { base = "HEAD" } = {}) {
  const fileCmds = project.commands["analyze:file"];
  const diffCmds = project.commands["analyze:diff"];
  if (!fileCmds && !diffCmds) return { code: EXIT.MISSING, findings: [], notVerified: ["analyze:file and analyze:diff rows missing"], text: "" };
  const files = changedFiles(project, base);
  const baseline = loadBaseline(project.root);
  const all = [];
  const notVerified = [];
  let crashed = 0;
  if (diffCmds) {
    const run = runRow(diffCmds, { base }, { cwd: project.root, budgets: project.budgets });
    if (run.failed) crashed++;
    notVerified.push(...run.errors);
    const fns = functionKeys(functionsOf(run.log, { root: project.root }));
    const flat = flatten(run.log, { root: project.root }).filter((f) => f.tool !== "lizard");
    const read = (f) => (existsSync(join(project.root, f)) ? readFileSync(join(project.root, f), "utf8") : null);
    fingerprint(flat, read, fns);
    for (const f of new Set([...files, ...flat.map((x) => x.file)])) {
      const cur = { findings: flat.filter((x) => x.file === f), functions: fns.filter((x) => x.file === f) };
      const old = fileCmds ? analyzeFile(project, f, { ref: base, cmds: fileCmds }) : { findings: [], functions: [] };
      all.push(...delta(cur, old, baseline, project.budgets, f));
    }
  } else {
    for (const f of files) {
      const cur = analyzeFile(project, f, { cmds: fileCmds });
      if (cur.failed) {
        crashed++;
        notVerified.push(`${f}: ${cur.errors.join(", ")}`);
        continue;
      }
      const old = analyzeFile(project, f, { ref: base, cmds: fileCmds });
      all.push(...delta(cur, old, baseline, project.budgets, f));
    }
  }
  const arch = project.commands["arch:check"];
  if (arch) {
    const run = runRow(arch, {}, { cwd: project.root, budgets: project.budgets });
    notVerified.push(...run.errors);
    const read = (f) => (existsSync(join(project.root, f)) ? readFileSync(join(project.root, f), "utf8") : null);
    const flat = fingerprint(flatten(run.log, { root: project.root }).filter((f) => files.includes(f.file)), read);
    for (const f of files) all.push(...delta({ findings: flat.filter((x) => x.file === f), functions: [] }, { findings: [], functions: [] }, baseline, project.budgets, f));
  } else notVerified.push("arch:check missing");
  if (crashed && !all.length && crashed === (diffCmds ? 1 : files.length)) return { code: EXIT.ANALYZER, findings: [], notVerified, text: "" };
  saveLast(project, all);
  const text = digest(all, { scope: "the diff", budgets: project.budgets, notVerified });
  return { code: all.length ? EXIT.NEW : EXIT.CLEAN, findings: all, notVerified, text, files };
}

function trackedSources(project) {
  return (git(project.root, ["ls-files"]) ?? "").split("\n").filter((p) => p && SOURCE_EXT.test(p));
}

function fullFindings(project) {
  const full = project.commands["analyze:full"];
  const read = (f) => (existsSync(join(project.root, f)) ? readFileSync(join(project.root, f), "utf8") : null);
  if (full) {
    const run = runRow(full, {}, { cwd: project.root, budgets: project.budgets });
    const fns = functionKeys(functionsOf(run.log, { root: project.root }));
    const flat = fingerprint(flatten(run.log, { root: project.root }), read, fns);
    return { findings: flat, functions: fns, errors: run.errors, failed: run.failed };
  }
  const cmds = project.commands["analyze:file"];
  if (!cmds) return null;
  const out = { findings: [], functions: [], errors: [], failed: false };
  for (const f of trackedSources(project)) {
    const r = analyzeFile(project, f, { cmds });
    out.findings.push(...r.findings);
    out.functions.push(...r.functions);
    out.errors.push(...r.errors.map((e) => `${f}: ${e}`));
  }
  return out;
}

export function cmdBaselineRecord(project) {
  const res = fullFindings(project);
  if (!res) return { code: EXIT.MISSING, text: "code-health: analyze:full and analyze:file rows missing; no baseline recorded." };
  if (res.failed) return { code: EXIT.ANALYZER, text: `code-health: analyzer failed: ${res.errors.join("; ")}` };
  const old = loadBaseline(project.root);
  const files = {};
  for (const f of res.findings.filter((x) => x.tool !== "lizard")) {
    files[f.file] ??= { findings: {}, functions: {} };
    files[f.file].findings[f.fp] = { ruleId: f.ruleId, line: f.line, level: f.level };
  }
  for (const fn of res.functions) {
    files[fn.file] ??= { findings: {}, functions: {} };
    files[fn.file].functions[fn.key] = { ccn: fn.ccn, nloc: fn.nloc, params: fn.params };
  }
  const p = baselinePath(project.root);
  const committedAllow = existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).allow ?? []) : old.allow;
  writeJson(p, { version: 1, ref: git(project.root, ["rev-parse", "HEAD"])?.trim() ?? null, files, allow: committedAllow });
  const n = res.findings.filter((x) => x.tool !== "lizard").length;
  return { code: EXIT.CLEAN, text: `code-health: baseline recorded: ${n} findings, ${res.functions.length} functions in ${Object.keys(files).length} files.${res.errors.length ? ` Not verified: ${res.errors.join("; ")}.` : ""}` };
}

export function cmdBaselineCompare(project, { base = "HEAD" } = {}) {
  const r = cmdDiff(project, { base });
  if (r.code > 1) return r;
  const fixed = [];
  for (const f of r.files ?? []) {
    const cmds = project.commands["analyze:file"];
    if (!cmds) break;
    const cur = analyzeFile(project, f, { cmds });
    const old = analyzeFile(project, f, { ref: base, cmds });
    const now = new Set(cur.findings.map((x) => x.fp));
    fixed.push(...old.findings.filter((x) => !now.has(x.fp)).map((x) => `${displayRule(x.ruleId)} ${f}:${x.line}`));
  }
  const worse = r.findings.filter((f) => /->/.test(f.message));
  const added = r.findings.filter((f) => !/->/.test(f.message));
  const lines = [
    `code-health compare against ${base}: ${added.length} new, ${worse.length} worsened, ${fixed.length} fixed.`,
    ...added.map((f) => `new: ${displayRule(f.ruleId)} ${f.file}:${f.line} ${clip(f.message, MESSAGE_CHARS)} (id ${f.fp})`),
    ...worse.map((f) => `worsened: ${displayRule(f.ruleId)} ${f.file}:${f.line} ${clip(f.message, MESSAGE_CHARS)} (id ${f.fp})`),
    ...fixed.map((s) => `fixed: ${s}`),
    `Not verified: ${r.notVerified.length ? r.notVerified.join("; ") : "none"}.`,
  ];
  return { code: r.findings.length ? EXIT.NEW : EXIT.CLEAN, text: lines.join("\n") };
}

export function cmdBaselineAllow(project, id, { reason, lane } = {}) {
  if (!id || !/^[0-9a-f]{12}$/.test(id)) return { code: EXIT.USAGE, text: "code-health: give the 12-character finding id from the digest." };
  if (!reason || !reason.trim()) return { code: EXIT.USAGE, text: "code-health: --reason is required: say why this finding is accepted." };
  const entry = { id, reason: reason.trim(), at: new Date().toISOString(), ...(lane ? { lane } : {}) };
  const p = lane ? join(project.root, ".shark", "health-allow", `${lane.replace(/[^\w.-]/g, "_")}.json`) : baselinePath(project.root);
  const doc = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : lane ? { allow: [] } : { version: 1, files: {}, allow: [] };
  doc.allow = [...(doc.allow ?? []).filter((a) => a.id !== id), entry];
  writeJson(p, doc);
  return { code: EXIT.CLEAN, text: `code-health: allowed ${id} (${lane ? `lane ${lane}` : "baseline"}): ${entry.reason}` };
}

export function cmdBaselineFold(project) {
  const dir = join(project.root, ".shark", "health-allow");
  const p = baselinePath(project.root);
  const doc = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { version: 1, files: {}, allow: [] };
  const folded = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const lane = JSON.parse(readFileSync(join(dir, name), "utf8"));
      for (const a of lane.allow ?? []) {
        doc.allow = [...(doc.allow ?? []).filter((x) => x.id !== a.id), a];
        folded.push(`${a.id} (${a.lane ?? name.replace(/\.json$/, "")}): ${a.reason}`);
      }
      unlinkSync(join(dir, name));
    }
  }
  writeJson(p, doc);
  return { code: EXIT.CLEAN, text: folded.length ? `code-health: folded ${folded.length} allow entries:\n${folded.join("\n")}` : "code-health: no lane allow entries." };
}

/** The starter rule file of each source extension that has one. */
const STARTER_RULES = [
  [/\.(py|pyi)$/i, "sec-python.yaml"],
  [/\.(js|mjs|cjs|jsx|ts|tsx|mts|cts)$/i, "sec-javascript.yaml"],
];
const RULES_DIR = fileURLToPath(new URL("../rules/", import.meta.url));

/** Copies the starter rules for the languages of the project to .shark/rules/. A file that exists stays as it is. */
export function cmdRulesAdd(project) {
  const want = new Set();
  for (const f of trackedSources(project)) {
    for (const [re, file] of STARTER_RULES) if (re.test(f)) want.add(file);
  }
  if (!want.size) return { code: EXIT.CLEAN, text: "code-health: no starter rules for the languages of this project. Write rules with references/rule-authoring.md." };
  const dir = join(project.root, ".shark", "rules");
  const added = [];
  const kept = [];
  for (const file of [...want].sort()) {
    const dest = join(dir, file);
    if (existsSync(dest)) {
      kept.push(file);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(dest, readFileSync(join(RULES_DIR, file), "utf8"));
    added.push(file);
  }
  return { code: EXIT.CLEAN, text: `code-health: rules in .shark/rules/: added: ${added.join(", ") || "none"}; kept: ${kept.join(", ") || "none"}.` };
}

export function cmdSarif(project, { out, only } = {}) {
  if (!out) return { code: EXIT.USAGE, text: "code-health: sarif needs --out <file>." };
  const res = fullFindings(project);
  if (!res) return { code: EXIT.MISSING, text: "code-health: analyze:full and analyze:file rows missing." };
  if (res.failed) return { code: EXIT.ANALYZER, text: `code-health: analyzer failed: ${res.errors.join("; ")}` };
  const keep = only ? new Set(only.split(",").map((s) => s.trim())) : null;
  const cx = res.functions.flatMap((fn) => delta({ findings: [], functions: [fn] }, { findings: [], functions: [] }, { allow: [] }, project.budgets, fn.file));
  const findings = [...res.findings.filter((f) => f.tool !== "lizard"), ...cx].filter((f) => !keep || keep.has(category(f)));
  writeJson(resolve(out), toSarif(findings));
  return { code: EXIT.CLEAN, text: `code-health: wrote ${findings.length} results to ${out}.` };
}

export function cmdArch(project) {
  const arch = project.commands["arch:check"];
  if (!arch) return { code: EXIT.MISSING, text: "code-health: arch:check row missing." };
  const run = runRow(arch, {}, { cwd: project.root, budgets: project.budgets });
  if (run.failed) return { code: EXIT.ANALYZER, text: `code-health: arch:check failed: ${run.errors.join("; ")}` };
  const read = (f) => (existsSync(join(project.root, f)) ? readFileSync(join(project.root, f), "utf8") : null);
  const findings = fingerprint(flatten(run.log, { root: project.root }), read);
  const baseline = loadBaseline(project.root);
  const files = [...new Set(findings.map((f) => f.file))];
  const fresh = files.flatMap((f) => delta({ findings: findings.filter((x) => x.file === f), functions: [] }, { findings: [], functions: [] }, baseline, project.budgets, f));
  return { code: fresh.length ? EXIT.NEW : EXIT.CLEAN, findings: fresh, text: digest(fresh, { scope: "the repository", budgets: project.budgets, notVerified: run.errors }) };
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opt.json = true;
    else if (a.startsWith("--")) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      opt[a.slice(2)] = v;
      i++;
    } else pos.push(a);
  }
  return { pos, opt };
}

const USAGE = `usage:
  health.mjs file <path> [--base <ref>] [--near <line>] [--timeout-ms 8000] [--json]
  health.mjs diff [--base <ref>] [--json]
  health.mjs arch
  health.mjs baseline record | compare [--base <ref>] | allow <id> --reason <text> [--lane <name>] | fold
  health.mjs sarif --out <file> [--only sec,arch,cx]
  health.mjs rules add`;

export function main(argv, cwd = process.cwd()) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    return { code: EXIT.USAGE, text: `code-health: ${e.message}\n${USAGE}` };
  }
  const { pos, opt } = args;
  const project = loadProject(cwd);
  const [cmd, sub, arg] = pos;
  if (cmd === "file" && sub) {
    const abs = resolve(cwd, sub);
    const real = existsSync(abs) ? realpathSync(abs) : abs;
    const rootReal = realpathSync(project.root);
    const rel = real.startsWith(rootReal + "/") ? real.slice(rootReal.length + 1) : sub;
    const near = opt.near ? String(opt.near).split(",").map(Number).filter(Number.isFinite) : [];
    return cmdFile(project, rel.split("\\").join("/"), { base: opt.base ?? "HEAD", near, timeoutMs: Number(opt["timeout-ms"] ?? 8000) });
  }
  if (cmd === "diff") return cmdDiff(project, { base: opt.base ?? "HEAD" });
  if (cmd === "arch") return cmdArch(project);
  if (cmd === "baseline" && sub === "record") return cmdBaselineRecord(project);
  if (cmd === "baseline" && sub === "compare") return cmdBaselineCompare(project, { base: opt.base ?? "HEAD" });
  if (cmd === "baseline" && sub === "allow") return cmdBaselineAllow(project, arg, { reason: opt.reason, lane: opt.lane });
  if (cmd === "baseline" && sub === "fold") return cmdBaselineFold(project);
  if (cmd === "rules" && sub === "add") return cmdRulesAdd(project);
  if (cmd === "sarif") return cmdSarif(project, { out: opt.out, only: opt.only });
  if (cmd === "hotspots") return { code: EXIT.USAGE, text: "code-health: hotspots comes in a later release (milestone M4)." };
  return { code: EXIT.USAGE, text: USAGE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const r = main(argv);
  if (argv.includes("--json")) process.stdout.write(JSON.stringify({ code: r.code, notVerified: r.notVerified ?? [], findings: r.findings ?? [], text: r.text ?? "" }) + "\n");
  else if (r.text) (r.code === EXIT.USAGE ? process.stderr : process.stdout).write(r.text + "\n");
  else if (r.code === EXIT.ANALYZER || r.code === EXIT.MISSING) process.stderr.write(`code-health: not verified: ${(r.notVerified ?? []).join("; ")}\n`);
  process.exit(r.code);
}
