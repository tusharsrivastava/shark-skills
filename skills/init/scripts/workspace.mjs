#!/usr/bin/env node
/**
 * shark init: the facts for a multi-repo workspace. It reads only; init writes the files after the user says yes.
 *
 *   workspace.mjs scan [--root <dir>]          Is the folder a repository, one project, or a workspace? Which git
 *                                              repositories does it hold (2 levels deep)? JSON on stdout.
 *   workspace.mjs check [--root <dir>] <path>... Is each path the root of a git repository? Its name, remote, project
 *                                              file, and its path relative to the workspace. JSON on stdout.
 *
 * Exit codes: 0 = done, 1 = a path in `check` is not a repository root, 2 = usage error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Build files that mark one project at the top of a folder. */
export const PROJECT_MARKERS = [
  "package.json", "pyproject.toml", "setup.py", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle",
  "build.gradle.kts", "Gemfile", "composer.json", "mix.exs", "deno.json", "Package.swift",
];
/** Entries that a workspace may hold and still count as empty. */
const WORKSPACE_FILES = new Set([".git", ".claude", ".gitignore", ".DS_Store", "AGENTS.md", "CLAUDE.md", "HANDOFF.md", "docs", ".shark"]);
const SKIP = new Set(["node_modules", ".venv", "venv", "vendor", "dist", "build", "target", "__pycache__"]);

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The facts of one repository root, or null when `dir` is not the root of a git repository. */
export function repoAt(dir, root) {
  if (!isDir(dir) || !existsSync(join(dir, ".git"))) return null;
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top || realpathSync(top) !== realpathSync(dir)) return null;
  const rel = relative(root, dir).split(sep).join("/") || ".";
  return {
    name: basename(dir),
    path: rel,
    inside: !rel.startsWith(".."),
    remote: git(dir, ["remote", "get-url", "origin"]),
    projectFile: ["CLAUDE.md", "AGENTS.md"].filter((f) => existsSync(join(dir, f))),
  };
}

/** True when the project file of `dir` already has a `## Repositories` section (a workspace made before). */
function hasRepositories(dir) {
  return ["CLAUDE.md", "AGENTS.md"].some((f) => {
    try {
      return /^## Repositories\s*$/m.test(readFileSync(join(dir, f), "utf8"));
    } catch {
      return false;
    }
  });
}

/**
 * What the folder is, and the repositories that it holds:
 * - `inside-repository`: a subfolder of a git repository (init works on that repository);
 * - `repository`: the root of a git repository that is not a workspace (submodules do not make it one);
 * - `project`: no git, but the build file of one project at the top;
 * - `workspace`: empty (also inside another repository: `outerRepository`), or holds git repositories, or its
 *   project file has `## Repositories`;
 * - `folder`: none of these (init asks the user).
 */
export function scan(root) {
  root = realpathSync(root);
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  const atTop = Boolean(top) && realpathSync(top) === root;
  const entries = readdirSync(root);
  const markers = PROJECT_MARKERS.filter((m) => entries.includes(m));
  const empty = entries.every((e) => WORKSPACE_FILES.has(e));
  const known = hasRepositories(root);
  const repos = [];
  const walk = (dir, depth) => {
    for (const e of readdirSync(dir).sort()) {
      if (e.startsWith(".") || SKIP.has(e)) continue;
      const p = join(dir, e);
      if (!isDir(p)) continue;
      const r = repoAt(p, root);
      if (r) repos.push(r);
      else if (depth < 2) walk(p, depth + 1);
    }
  };
  let kind;
  // An empty folder is a new workspace, also inside another repository (a home folder under git, for example).
  if (top && !atTop && !empty) kind = "inside-repository";
  else if (atTop && !empty && !known) kind = "repository";
  else {
    if (!empty) walk(root, 1);
    if (empty || known || repos.length) kind = "workspace";
    else if (markers.length) kind = "project";
    else kind = "folder";
  }
  const outerRepository = top && !atTop ? realpathSync(top) : null;
  return { root, kind, gitInit: atTop, empty, markers, repos, ...(outerRepository ? { outerRepository } : {}) };
}

/** Checks the paths that the user gave (relative to the workspace, or absolute). */
export function check(root, paths) {
  root = realpathSync(root);
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(root, p);
    if (!existsSync(abs)) return { given: p, ok: false, reason: "no such folder" };
    const r = repoAt(realpathSync(abs), root);
    if (!r) return { given: p, ok: false, reason: "not the root of a git repository" };
    return { given: p, ok: true, ...r };
  });
}

export function main(argv, cwd = process.cwd()) {
  const args = [...argv];
  let root = cwd;
  const i = args.indexOf("--root");
  if (i !== -1) {
    if (!args[i + 1]) return { code: 2, text: "workspace: --root needs a folder" };
    root = resolve(cwd, args[i + 1]);
    args.splice(i, 2);
  }
  const [cmd, ...rest] = args;
  if (!isDir(root)) return { code: 2, text: `workspace: no such folder ${root}` };
  if (cmd === "scan" && !rest.length) return { code: 0, text: JSON.stringify(scan(root), null, 2) };
  if (cmd === "check" && rest.length) {
    const res = check(root, rest);
    return { code: res.every((r) => r.ok) ? 0 : 1, text: JSON.stringify(res, null, 2) };
  }
  return { code: 2, text: "Usage: workspace.mjs scan [--root <dir>] | check [--root <dir>] <path>..." };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = main(process.argv.slice(2));
  process.stdout.write(`${r.text}\n`);
  process.exit(r.code);
}
