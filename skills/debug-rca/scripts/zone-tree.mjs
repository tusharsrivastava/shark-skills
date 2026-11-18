#!/usr/bin/env node
/**
 * Makes, lists, diffs and removes the private trees of investigation zones.
 *
 * Usage:
 *   zone-tree.mjs create <zone id> [--root <repository>]
 *   zone-tree.mjs diff <zone id> [--root <repository>]
 *   zone-tree.mjs remove <zone id> | --all [--root <repository>]
 *   zone-tree.mjs list [--root <repository>]
 *
 * `create` copies the repository, its dependencies and its uncommitted files into `.shark-zones/<zone id>`. It uses
 * a copy-on-write copy (macOS `cp -c`, Linux `cp --reflink`), which takes seconds and almost no disk. When the file
 * system has no copy-on-write, it makes a git worktree, and the zone must run the project's `setup` there.
 * `diff` prints the changes of the zone tree to its start state, as a patch that `git apply` takes in the main tree.
 *
 * Exit codes: 0 success; 1 the operation failed; 2 a usage error.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = ".shark-zones";

function sh(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/**
 * Tries a copy-on-write copy of one path.
 *
 * @param {string} from The source path.
 * @param {string} to The destination path.
 * @returns {boolean} True when the copy succeeded as copy-on-write.
 */
function cowCopy(from, to) {
  const flags = process.platform === "darwin" ? ["-c", "-R"] : ["-R", "--reflink=always"];
  return sh("cp", [...flags, from, to]).status === 0;
}

function ignore(root) {
  const exclude = join(root, ".git", "info", "exclude");
  if (existsSync(join(root, ".git", "info")) && !(existsSync(exclude) && readFileSync(exclude, "utf8").includes(`${DIR}/`))) {
    appendFileSync(exclude, `\n${DIR}/\n`);
  }
}

/**
 * Records the start state of a zone tree as a git tree object, outside the zone tree.
 *
 * @param {string} root The repository root.
 * @param {string} id The zone ID.
 * @param {string} dest The zone tree.
 */
function recordBase(root, id, dest) {
  const index = join(root, DIR, `${id}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  spawnSync("git", ["read-tree", "HEAD"], { cwd: dest, env });
  spawnSync("git", ["add", "-A"], { cwd: dest, env });
  const tree = spawnSync("git", ["write-tree"], { cwd: dest, env, encoding: "utf8" }).stdout.trim();
  rmSync(index, { force: true });
  writeFileSync(join(root, DIR, `${id}.base`), `${tree}\n`);
}

/**
 * Makes the tree of one zone.
 *
 * @param {string} root The repository root.
 * @param {string} id The zone ID.
 * @returns {{ path: string, kind: "copy" | "worktree" }} The tree path and how it was made.
 */
export function create(root, id) {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`the zone id "${id}" must use letters, digits, ".", "_" or "-"`);
  const dest = join(root, DIR, id);
  if (existsSync(dest)) throw new Error(`${dest} exists: remove it first`);
  mkdirSync(dest, { recursive: true });
  ignore(root);
  let copied = true;
  for (const entry of readdirSync(root)) {
    if (entry === DIR) continue;
    if (!cowCopy(join(root, entry), join(dest, entry))) {
      copied = false;
      break;
    }
  }
  if (copied) {
    recordBase(root, id, dest);
    return { path: dest, kind: "copy" };
  }
  rmSync(dest, { recursive: true, force: true });
  const wt = sh("git", ["worktree", "add", "--detach", dest], root);
  if (wt.status !== 0) throw new Error(`git worktree add failed: ${wt.stderr.trim()}`);
  recordBase(root, id, dest);
  return { path: dest, kind: "worktree" };
}

/**
 * Gives the changes of a zone tree to its start state.
 *
 * @param {string} root The repository root.
 * @param {string} id The zone ID.
 * @returns {string} A patch for `git apply` in the main tree.
 */
export function diff(root, id) {
  const dest = join(root, DIR, id);
  const marker = join(root, DIR, `${id}.base`);
  if (!existsSync(dest) || !existsSync(marker)) throw new Error(`no zone tree ${id}`);
  const baseTree = readFileSync(marker, "utf8").trim();
  const index = join(root, DIR, `${id}.diff-index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  spawnSync("git", ["read-tree", baseTree], { cwd: dest, env });
  spawnSync("git", ["add", "-A"], { cwd: dest, env });
  const out = spawnSync("git", ["diff", "--cached", "--binary", baseTree], {
    cwd: dest,
    env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }).stdout;
  rmSync(index, { force: true });
  return out;
}

/**
 * Removes the tree of one zone.
 *
 * @param {string} root The repository root.
 * @param {string} id The zone ID.
 * @returns {boolean} True when a tree was removed.
 */
export function remove(root, id) {
  const dest = join(root, DIR, id);
  rmSync(join(root, DIR, `${id}.base`), { force: true });
  if (!existsSync(dest)) return false;
  const gitPath = join(dest, ".git");
  const isWorktree = existsSync(gitPath) && !statSync(gitPath).isDirectory();
  if (isWorktree) sh("git", ["worktree", "remove", "--force", dest], root);
  rmSync(dest, { recursive: true, force: true });
  if (isWorktree) sh("git", ["worktree", "prune"], root);
  return true;
}

function main(argv) {
  const [mode, ...rest] = argv;
  const i = rest.indexOf("--root");
  const root = resolve(i >= 0 ? rest[i + 1] : process.cwd());
  const args = rest.filter((v, k) => v !== "--root" && rest[k - 1] !== "--root");
  try {
    if (mode === "create" && args[0]) {
      const r = create(root, args[0]);
      console.log(`zone-tree: ${r.kind === "copy" ? "copy-on-write copy" : "git worktree (run the project setup in it)"}\npath: ${r.path}`);
      return 0;
    }
    if (mode === "diff" && args[0]) {
      process.stdout.write(diff(root, args[0]));
      return 0;
    }
    if (mode === "remove" && args[0]) {
      const ids = args[0] === "--all" ? (existsSync(join(root, DIR)) ? readdirSync(join(root, DIR)).filter((f) => !f.includes(".")) : []) : [args[0]];
      for (const id of ids) console.log(`zone-tree: ${remove(root, id) ? "removed" : "not found"} ${id}`);
      if (args[0] === "--all") rmSync(join(root, DIR), { recursive: true, force: true });
      return 0;
    }
    if (mode === "list") {
      const ids = existsSync(join(root, DIR)) ? readdirSync(join(root, DIR)).filter((f) => !f.includes(".")) : [];
      console.log(ids.length ? ids.map((id) => `${id}  ${join(root, DIR, id)}`).join("\n") : "zone-tree: no zone trees.");
      return 0;
    }
  } catch (error) {
    console.error(`zone-tree: ${error.message}`);
    return 1;
  }
  console.error("usage: zone-tree.mjs create <zone id> | diff <zone id> | remove <zone id>|--all | list [--root <dir>]");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
