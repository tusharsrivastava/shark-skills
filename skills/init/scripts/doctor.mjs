#!/usr/bin/env node
// Checks that the tools behind the shark hooks, guards and MCP server work in this project.
//
//   node doctor.mjs [--json] [--no-smoke] [--root <dir>]
//
// It finds the languages of the repository, then checks each part: the mcp-debugger server and the debug adapter of
// each language, the code-health analyzers, rules, rows and baseline, and the guard sections of AGENTS.md. Each item
// that is not ok has a fix: a pinned install command, a file to copy, or a row to add. The script never installs or
// writes anything: init shows the fixes and runs them after the user says yes.
//
// Exit codes: 0 every item ok (warnings allowed), 1 an item is missing or failed, 2 usage error.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cmdFile, loadProject, optedIn, readCommands } from "../../code-health/scripts/health.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(HERE, "../../..");

/** Pinned versions. Each one was at least two weeks old when it was pinned (2026-11-22). */
export const PINS = {
  opengrep: "1.33.1", // signed release binary; 1.30.1 and older have the 2026-11-10 advisories
  opengrepMinSafe: "1.30.2",
  lizard: "1.25.0",
  debugpy: "1.8.22",
  delve: "v1.27.2",
};

const LANGS = {
  python: /\.(py|pyi)$/i,
  javascript: /\.(js|mjs|cjs|jsx)$/i,
  typescript: /\.(ts|tsx|mts|cts)$/i,
  go: /\.go$/i,
  rust: /\.rs$/i,
  java: /\.(java|kt|kts)$/i,
  ruby: /\.rb$/i,
  csharp: /\.cs$/i,
  c: /\.(c|h|cc|cpp|cxx|hpp)$/i,
};
/** The starter rule file of each language that has one. */
export const STARTER_RULES = { python: "sec-python.yaml", javascript: "sec-javascript.yaml", typescript: "sec-javascript.yaml" };
const IGNORE_DIRS = new Set([".git", "node_modules", ".venv", "venv", "vendor", "dist", "build", "target", "__pycache__", ".shark", "testdata", "fixtures", "_fixtures"]);

// ---------------------------------------------------------------- helpers

function run(cmd, args, { cwd, env, timeout = 15000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", timeout });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), missing: r.error?.code === "ENOENT" };
}

/** "1.33.1" from any text that holds a version. */
export function versionOf(text) {
  return /v?(\d+\.\d+(?:\.\d+)?)/.exec(text ?? "")?.[1] ?? null;
}

export function cmpVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function section(text, name) {
  const m = new RegExp(`^##\\s+${name}\\s*$`, "m").exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The tracked and untracked (not ignored) files; a walk when the folder is not a git repository. */
export function listFiles(root) {
  const r = run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root });
  if (r.ok) return r.out.split("\n").filter(Boolean);
  const out = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), p);
      else out.push(p);
      if (out.length > 20000) return;
    }
  };
  walk(root, "");
  return out;
}

/** { language: [files] } for the languages of the repository, most files first. */
export function detectLanguages(files) {
  const out = {};
  for (const f of files) {
    if (f.split("/").some((part) => IGNORE_DIRS.has(part))) continue;
    for (const [lang, re] of Object.entries(LANGS)) {
      if (re.test(f)) (out[lang] ??= []).push(f);
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].length - a[1].length));
}

/** The project's Python: a virtual environment in the root, else python3. */
export function projectPython(root) {
  for (const v of [".venv", "venv", "env"]) {
    const p = join(root, v, "bin", "python");
    if (existsSync(p)) return { cmd: p, venv: v };
  }
  return { cmd: "python3", venv: null };
}

function which(name, env) {
  const r = run("sh", ["-c", `command -v ${name}`], { env });
  return r.ok ? r.out.split("\n")[0] : null;
}

/** The command that installs a Python command-line tool for this user, not into the project. */
function pyToolInstall(pkg, env) {
  if (which("pipx", env)) return `pipx install ${pkg}`;
  if (which("uv", env)) return `uv tool install ${pkg}`;
  return `python3 -m pip install --user ${pkg}`;
}

// ---------------------------------------------------------------- checks

const item = (area, name, status, detail, fix = null) => ({ area, item: name, status, detail, ...(fix ? { fix } : {}) });

export function checkDebugger(root, langs, { env = process.env } = {}) {
  const items = [];
  let mcp = null;
  try {
    mcp = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".mcp.json"), "utf8")).mcpServers?.["mcp-debugger"] ?? null;
  } catch {
    /* no .mcp.json */
  }
  const pkg = mcp?.args?.find((a) => a.startsWith("@debugmcp/")) ?? "@debugmcp/mcp-debugger";
  if (!which("npx", env)) {
    items.push(item("debugger", "mcp-debugger server", "missing", "npx not found: the server starts with npx", { kind: "install", command: "Install Node.js 20 or later (it gives npx)", scope: "machine" }));
  } else {
    const cached = run("npx", ["--offline", "-y", pkg, "--help"], { env, timeout: 30000 });
    items.push(cached.ok
      ? item("debugger", "mcp-debugger server", "ok", `${pkg} is in the npm cache`)
      : item("debugger", "mcp-debugger server", "warn", `${pkg} is not in the npm cache: the first session downloads it (needs the network)`, { kind: "install", command: `npm cache add ${pkg}`, scope: "user npm cache" }));
  }
  const ignored = run("git", ["check-ignore", "-q", ".claude/mcp-debugger.log"], { cwd: root });
  items.push(ignored.ok
    ? item("debugger", "server log ignored", "ok", ".claude/mcp-debugger.log is in .gitignore")
    : item("debugger", "server log ignored", "missing", "git does not ignore .claude/mcp-debugger.log", { kind: "edit", command: "Add `.claude/mcp-debugger.log` to .gitignore", scope: "project" }));

  for (const lang of Object.keys(langs)) {
    if (lang === "python") {
      const py = projectPython(root);
      const r = run(py.cmd, ["-c", "import debugpy; print(debugpy.__version__)"], { cwd: root, env });
      const where = py.venv ? `the project environment ${py.venv}/` : "python3 (no project virtual environment found)";
      if (r.ok) items.push(item("debugger", "python: debugpy", "ok", `debugpy ${versionOf(r.out)} in ${where}`));
      else items.push(item("debugger", "python: debugpy", "missing", r.missing ? `${py.cmd} not found` : `debugpy is not installed in ${where}`, {
        kind: "install",
        command: py.venv ? `${py.venv}/bin/python -m pip install debugpy==${PINS.debugpy}` : `python3 -m pip install debugpy==${PINS.debugpy}  (activate the project environment first)`,
        scope: "project environment",
      }));
    } else if (lang === "javascript" || lang === "typescript") {
      const r = run("node", ["--version"], { env });
      const v = versionOf(r.out);
      if (!r.ok) items.push(item("debugger", `${lang}: node --inspect`, "missing", "node not found", { kind: "install", command: "Install Node.js 20 or later", scope: "machine" }));
      else if (cmpVersion(v, "18.0.0") < 0) items.push(item("debugger", `${lang}: node --inspect`, "warn", `node ${v}: the debugger needs 18 or later`, { kind: "install", command: "Install Node.js 20 or later", scope: "machine" }));
      else items.push(item("debugger", `${lang}: node --inspect`, "ok", `node ${v} (the inspector is built in)${lang === "typescript" ? "; run TypeScript with source maps (the test runner, or tsx)" : ""}`));
    } else if (lang === "go") {
      const r = run("dlv", ["version"], { env });
      const go = which("go", env);
      if (r.ok) items.push(item("debugger", "go: delve", "ok", `dlv ${versionOf(r.out)}`));
      else items.push(item("debugger", "go: delve", "missing", go ? "dlv not found" : "dlv not found, and the Go toolchain is not installed", {
        kind: "install",
        command: `${go ? "" : "Install Go, then: "}go install github.com/go-delve/delve/cmd/dlv@${PINS.delve}`,
        scope: "user (GOPATH/bin)",
      }));
    } else {
      items.push(item("debugger", `${lang}: adapter`, "warn", "not checked by this script: see debug-rca references/launch-other.md", null));
    }
  }
  return items;
}

export function checkCodeHealth(root, langs, { env = process.env, smoke = true } = {}) {
  const items = [];
  const project = loadProject(root);
  const rows = readCommands(project.text);
  const opted = optedIn(project.text);
  const rowText = [...(rows["analyze:file"] ?? []), ...(rows["analyze:full"] ?? [])].join(" ");
  // A tool is needed when the project has no rows yet (init proposes it), or when a row runs it as a command.
  const wants = (tool) => !opted || new RegExp(`(^|[\\s/])${tool}(?=\\s|$)`).test(rowText);

  if (wants("opengrep")) {
    const bin = /(^|\s)(\S*opengrep)(?=\s)/.exec(rowText)?.[2] ?? "opengrep";
    const r = run(bin, ["--version"], { cwd: root, env });
    const v = versionOf(r.out);
    const fix = { kind: "install", command: `sh "${join(PLUGIN_ROOT, "skills/code-health/scripts/install-opengrep.sh")}"`, scope: "user (~/.local/bin)" };
    if (!r.ok || !v) items.push(item("code-health", "opengrep", "missing", `${bin} not found (install the signed release binary, never the PyPI package)`, fix));
    else if (cmpVersion(v, PINS.opengrepMinSafe) < 0) items.push(item("code-health", "opengrep", "fail", `opengrep ${v} has the 2026-11-10 security advisories; ${PINS.opengrepMinSafe} or later fixes them`, fix));
    else if (v !== PINS.opengrep) items.push(item("code-health", "opengrep", "warn", `opengrep ${v}; shark tested ${PINS.opengrep}`));
    else items.push(item("code-health", "opengrep", "ok", `opengrep ${v}`));
  }
  if (wants("lizard")) {
    const r = run("lizard", ["--version"], { cwd: root, env });
    const v = versionOf(r.out);
    if (!r.ok || !v) items.push(item("code-health", "lizard", "missing", "lizard not found", { kind: "install", command: pyToolInstall(`lizard==${PINS.lizard}`, env), scope: "user" }));
    else items.push(item("code-health", "lizard", v === PINS.lizard ? "ok" : "warn", v === PINS.lizard ? `lizard ${v}` : `lizard ${v}; shark tested ${PINS.lizard}`));
  }

  const needed = [...new Set(Object.keys(langs).map((l) => STARTER_RULES[l]).filter(Boolean))];
  for (const file of needed) {
    const have = existsSync(join(root, ".shark/rules", file));
    items.push(have
      ? item("code-health", `rules: ${file}`, "ok", `.shark/rules/${file}`)
      : item("code-health", `rules: ${file}`, "missing", `the starter rules for ${Object.keys(STARTER_RULES).filter((l) => STARTER_RULES[l] === file && langs[l]).join(" and ")} are not in .shark/rules/`, {
        kind: "copy", command: `node "${join(PLUGIN_ROOT, "skills/code-health/scripts/health.mjs")}" rules add`, scope: "project",
      }));
  }
  for (const lang of Object.keys(langs).filter((l) => !STARTER_RULES[l])) {
    items.push(item("code-health", `rules: ${lang}`, "warn", `no starter rules for ${lang}: Lizard still checks complexity; write security rules with references/rule-authoring.md`));
  }

  if (!rows["analyze:file"]) {
    items.push(item("code-health", "analyze:file row", "missing", `no analyze:file row in ${project.file ?? "AGENTS.md"} › Commands`, {
      kind: "edit",
      command: "| `analyze:file` | `opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output={out} {file}` and `lizard --csv {file}` | Under 2 s on one file. |",
      scope: "project file",
    }));
  } else items.push(item("code-health", "analyze:file row", "ok", rows["analyze:file"].join(" and ")));
  if (!rows["analyze:full"]) {
    items.push(item("code-health", "analyze:full row", "missing", "no analyze:full row: `baseline record` and `sarif` need it", {
      kind: "edit",
      command: "| `analyze:full` | `opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output={out} .` and `lizard --csv .` | The whole repository. |",
      scope: "project file",
    }));
  } else items.push(item("code-health", "analyze:full row", "ok", rows["analyze:full"].join(" and ")));

  if (smoke && rows["analyze:file"]) {
    for (const [lang, files] of Object.entries(langs)) {
      const file = files.find((f) => !/(^|\/)(test|tests|__tests__)\//.test(f) && !/(^|\/)__init__\.py$|\.d\.ts$/.test(f)) ?? files[0];
      const t0 = Date.now();
      let r;
      try {
        r = cmdFile(project, file, { timeoutMs: 20000 });
      } catch (e) {
        r = { code: 4, notVerified: [String(e.message ?? e)] };
      }
      const ms = Date.now() - t0;
      if (r.code === 0 || r.code === 1) {
        const partial = r.notVerified?.filter((x) => x !== "base version not analyzed") ?? [];
        items.push(item("code-health", `smoke: ${lang}`, partial.length ? "fail" : "ok", partial.length ? `${file}: not verified (${partial.join("; ")})` : `${file} analyzed in ${ms} ms`));
      } else items.push(item("code-health", `smoke: ${lang}`, "fail", `${file}: ${r.notVerified?.join("; ") || `exit ${r.code}`}`));
    }
  }

  const baseline = existsSync(join(root, ".shark/health-baseline.json"));
  items.push(baseline
    ? item("code-health", "baseline", "ok", ".shark/health-baseline.json")
    : item("code-health", "baseline", "missing", "no committed baseline: each session then compares with its start commit", {
      kind: "run", command: `node "${join(PLUGIN_ROOT, "skills/code-health/scripts/health.mjs")}" baseline record`, scope: "project (commit the file)",
    }));
  items.push(item("code-health", "hook.review", "ok", `${project.budgets["hook.review"]}${project.budgets["hook.review"] === "on" ? " (the default: a review when the agent ends its work)" : ""}`));
  return items;
}

const ARCH_CONFIGS = [
  [/^\.importlinter$|^setup\.cfg$|^pyproject\.toml$/, /importlinter/, "import-linter", "lint-imports"],
  [/^\.dependency-cruiser\.(c?js|json|mjs)$/, null, "dependency-cruiser", "npx depcruise --output-type err ."],
  [/^\.golangci\.ya?ml$/, /depguard/, "golangci-lint depguard", "golangci-lint run --enable-only depguard ./..."],
];

export function checkGuards(root, files) {
  const items = [];
  const project = loadProject(root);
  const text = project.text;
  const secrets = section(text, "Secrets");
  if (!secrets) items.push(item("guards", "deny-secrets lists", "missing", "no ## Secrets section: the deny-secrets hook has no list", { kind: "edit", command: "Add ## Secrets (init step 3)", scope: "project file" }));
  else if (/<\.env, \.env\.\*/.test(secrets)) items.push(item("guards", "deny-secrets lists", "missing", "## Secrets still has the template placeholders", { kind: "edit", command: "Fill the two lists in ## Secrets", scope: "project file" }));
  else items.push(item("guards", "deny-secrets lists", "ok", "## Secrets is filled"));

  const inv = section(text, "Invariants");
  const real = inv?.split("\n").some((l) => /^\|\s*\d+\s*\|/.test(l) && !/`<rule>`/.test(l));
  items.push(real ? item("guards", "invariants", "ok", "## Invariants has rules: shark:invariant-guard checks them")
    : item("guards", "invariants", "warn", "## Invariants has no rule: shark:invariant-guard has nothing to check"));

  const rows = readCommands(text);
  if (rows["arch:check"]) items.push(item("guards", "arch:check row", "ok", rows["arch:check"].join(" and ")));
  else {
    let found = null;
    for (const [re, content, tool, cmd] of ARCH_CONFIGS) {
      const f = files.find((x) => re.test(x));
      if (!f) continue;
      if (content) {
        try {
          if (!content.test(readFileSync(join(root, f), "utf8"))) continue;
        } catch {
          continue;
        }
      }
      found = { f, tool, cmd };
      break;
    }
    items.push(found
      ? item("guards", "arch:check row", "missing", `${found.f} configures ${found.tool}, but there is no arch:check row`, { kind: "edit", command: `| \`arch:check\` | \`${found.cmd}\` | |`, scope: "project file" })
      : item("guards", "arch:check row", "warn", "no architecture tool found: the layer rules are checked only by review"));
  }
  items.push(item("guards", "plugin hooks", "ok", "deny-secrets, wide-commits and health-review load with the plugin (see /hooks)"));
  return items;
}

export function doctor(root, opts = {}) {
  const files = listFiles(root);
  const langs = detectLanguages(files);
  const items = [...checkDebugger(root, langs, opts), ...checkCodeHealth(root, langs, opts), ...checkGuards(root, files)];
  const count = (s) => items.filter((i) => i.status === s).length;
  return {
    root,
    languages: Object.fromEntries(Object.entries(langs).map(([l, f]) => [l, f.length])),
    items,
    summary: { ok: count("ok"), warn: count("warn"), missing: count("missing"), fail: count("fail") },
  };
}

export function format(report) {
  const langs = Object.entries(report.languages).map(([l, n]) => `${l} (${n})`).join(", ") || "none found";
  const lines = [`shark doctor: ${report.root}`, `Languages: ${langs}`, "", "| Status | Area | Item | Detail | Fix |", "| --- | --- | --- | --- | --- |"];
  for (const i of report.items) {
    const fix = i.fix ? `${i.fix.command.replace(/\|/g, "\\|")} (${i.fix.scope})` : "";
    lines.push(`| ${i.status} | ${i.area} | ${i.item} | ${i.detail.replace(/\|/g, "\\|")} | ${fix} |`);
  }
  const s = report.summary;
  lines.push("", `${s.ok} ok, ${s.warn} warn, ${s.missing} missing, ${s.fail} failed.`);
  return lines.join("\n");
}

export function main(argv, cwd = process.cwd()) {
  const args = [...argv];
  const json = args.includes("--json");
  const smoke = !args.includes("--no-smoke");
  const i = args.indexOf("--root");
  const bad = args.filter((a, k) => !["--json", "--no-smoke", "--root"].includes(a) && !(i !== -1 && k === i + 1));
  if (bad.length) return { code: 2, text: `doctor: unknown option ${bad[0]}. Usage: doctor.mjs [--json] [--no-smoke] [--root <dir>]` };
  const root = realpathSync(i !== -1 ? resolve(cwd, args[i + 1]) : cwd);
  const top = run("git", ["rev-parse", "--show-toplevel"], { cwd: root });
  const report = doctor(top.ok ? top.out : root, { smoke });
  const code = report.summary.missing || report.summary.fail ? 1 : 0;
  return { code, text: json ? JSON.stringify(report, null, 2) : format(report) };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = main(process.argv.slice(2));
  process.stdout.write(`${r.text}\n`);
  process.exit(r.code);
}
