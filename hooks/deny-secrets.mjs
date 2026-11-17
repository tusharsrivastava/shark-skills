#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

const DEFAULT_SECRETS = [".env", ".env.*", "secrets/**", "*.pem", "*.key"];
const DEFAULT_EXCEPTIONS = [];
const EXAMPLE_FILES = ["*.example", "*.sample", "*.template"];
const PROJECT_FILES = ["CLAUDE.md", "AGENTS.md"];
const DEBUGGER_TOOL = /^mcp__.*mcp-debugger.*__/;
const FILE_TOOLS = { Read: "file_path", Edit: "file_path", MultiEdit: "file_path", Write: "file_path", NotebookEdit: "notebook_path" };

export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

function listAfter(label, text) {
  const line = text.split("\n").find((l) => l.toLowerCase().includes(label));
  if (!line) return null;
  const tail = line.slice(line.toLowerCase().indexOf(label) + label.length).split(/(?:the only )?exception/i)[0];
  const quoted = [...tail.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  const items = (quoted.length ? quoted : [tail])
    .flatMap((q) => q.split(","))
    .map((s) => s.replace(/[<>]/g, "").replace(/\.$/, "").trim())
    .filter(Boolean);
  if (items.some((s) => /^(none|nothing)$/i.test(s))) return [];
  return items;
}

export function readPolicy(projectDir) {
  for (const name of PROJECT_FILES) {
    const file = join(projectDir, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const section = text.match(/^## Secrets\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (!section) continue;
    const secrets = listAfter("never read or write:", section[1]);
    if (secrets === null) continue;
    const exceptions = listAfter("exception:", section[1]) ?? [];
    return { secrets, exceptions, source: `${name} › ## Secrets` };
  }
  return { secrets: DEFAULT_SECRETS, exceptions: DEFAULT_EXCEPTIONS, source: "the shark default list" };
}

function matches(pattern, relPath) {
  const regex = globToRegExp(pattern);
  if (!pattern.includes("/")) return regex.test(basename(relPath));
  const parts = relPath.split("/");
  return parts.some((_, i) => regex.test(parts.slice(i).join("/")));
}

function isAllowed(relPath, policy) {
  return [...EXAMPLE_FILES, ...policy.exceptions].some((p) => matches(p, relPath));
}

export function secretFor(relPath, policy) {
  if (isAllowed(relPath, policy)) return null;
  return policy.secrets.find((p) => matches(p, relPath)) ?? null;
}

function toRelative(path, cwd, projectDir) {
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  const rel = relative(projectDir, abs);
  return rel.startsWith("..") ? abs.replace(/^\/+/, "") : rel;
}

function stringsIn(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

function sampleOf(pattern) {
  return pattern.replace(/\*\*/g, "x").replace(/[*?]/g, "x");
}

export function shellTokens(command) {
  return command
    .split(/[\s;&|<>()=`"']+/)
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("-") && !t.startsWith("$"));
}

export function checkBash(command, cwd, projectDir, policy, { wildcards = true } = {}) {
  for (const token of shellTokens(command)) {
    const rel = toRelative(token, cwd, projectDir);
    const hit = secretFor(rel, policy);
    if (hit) return { path: token, pattern: hit };
    if (wildcards && /[*?]/.test(token) && basename(token).replace(/[*?]/g, "")) {
      const tokenRegex = globToRegExp(basename(token));
      for (const pattern of policy.secrets) {
        const sample = basename(sampleOf(pattern));
        if (tokenRegex.test(sample) && !isAllowed(sample, policy)) {
          return { path: token, pattern };
        }
      }
    }
  }
  return null;
}

export function decide(input, projectDir) {
  const policy = readPolicy(projectDir);
  if (!policy.secrets.length) return null;
  const cwd = input.cwd || projectDir;
  const tool = input.tool_name;
  const args = input.tool_input || {};
  if (FILE_TOOLS[tool]) {
    const path = args[FILE_TOOLS[tool]];
    if (!path) return null;
    const hit = secretFor(toRelative(path, cwd, projectDir), policy);
    return hit ? { tool, path, pattern: hit, source: policy.source } : null;
  }
  if (tool === "Grep") {
    for (const path of [args.path, args.glob].filter(Boolean)) {
      const hit = secretFor(toRelative(path, cwd, projectDir), policy);
      if (hit) return { tool, path, pattern: hit, source: policy.source };
    }
    return null;
  }
  if (DEBUGGER_TOOL.test(tool)) {
    for (const text of stringsIn(args)) {
      const hit = checkBash(text, cwd, projectDir, policy, { wildcards: false });
      if (hit) return { tool, ...hit, source: policy.source };
    }
    return null;
  }
  if (tool === "Bash" && args.command) {
    const hit = checkBash(args.command, cwd, projectDir, policy);
    return hit ? { tool, ...hit, source: policy.source } : null;
  }
  return null;
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      process.stderr.write("shark deny-secrets: the hook input is not JSON. The tool call continues.\n");
      process.exit(1);
    }
    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const block = decide(input, projectDir);
    if (!block) process.exit(0);
    process.stderr.write(
      `shark blocked ${block.tool} on \`${block.path}\`: it matches the secret pattern \`${block.pattern}\` ` +
        `in ${block.source}. Do not read or write this file. Get the setting names from an example file or ` +
        `from the code. If the user must see the file, tell the user to open it.\n`,
    );
    process.exit(2);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
