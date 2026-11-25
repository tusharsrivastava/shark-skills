/**
 * SARIF helpers for shark:code-health: read, merge, normalize, fingerprint and write.
 *
 * Shark works on a flat finding record, not on raw SARIF:
 *   { tool, ruleId, level, file, line, message, help, fp }
 * `fp` is the fingerprint: ruleId + file + hash(trimmed source line) + enclosing function + occurrence index within
 * that function. Line numbers are not part of it, so moved code keeps its fingerprint.
 *
 * Node standard library only.
 */
import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LEVELS = { error: 3, warning: 2, note: 1, none: 0 };

/** Parses text as SARIF. Returns null when the text is not a SARIF log. */
export function parseSarif(text) {
  const t = String(text ?? "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const log = JSON.parse(t);
    return Array.isArray(log?.runs) ? log : null;
  } catch {
    return null;
  }
}

/** A URI or path from a SARIF location as a repository-relative path with forward slashes. */
export function toRepoPath(uri, root, remap = []) {
  if (!uri) return "";
  let p = String(uri);
  if (p.startsWith("file://")) {
    try {
      p = fileURLToPath(p);
    } catch {
      p = p.slice(7);
    }
  }
  for (const [from, to] of remap) {
    if (p === from) return to;
  }
  if (isAbsolute(p) && root) p = relative(root, p);
  return p.split(sep).join("/").replace(/^\.\//, "");
}

/** The short display name of a rule ID: the last dotted segment, with a `sec-`, `arch-` or `cx-` prefix as `sec/`. */
export function displayRule(ruleId) {
  const last = String(ruleId ?? "").split(".").pop();
  return last.replace(/^(sec|arch|cx)-/, "$1/");
}

/** The category of a finding: `arch`, `cx` (complexity) or `sec` (everything else). */
export function category(f) {
  const r = displayRule(f.ruleId);
  if (r.startsWith("arch/") || f.tool === "shark-arch") return "arch";
  if (r.startsWith("cx/") || f.tool === "lizard") return "cx";
  return "sec";
}

function ruleIndex(run) {
  const map = new Map();
  for (const r of run?.tool?.driver?.rules ?? []) map.set(r.id, r);
  return map;
}

/**
 * Flattens a SARIF log to finding records (without fingerprints).
 *
 * @param {object} log A SARIF log.
 * @param {{ root?: string, remap?: [string, string][] }} opts `remap` maps analyzed temp paths back to repo paths.
 */
export function flatten(log, { root, remap = [] } = {}) {
  const out = [];
  const seen = new Set();
  for (const run of log?.runs ?? []) {
    const tool = String(run?.tool?.driver?.name ?? "unknown").toLowerCase();
    const rules = ruleIndex(run);
    for (const r of run.results ?? []) {
      const loc = r.locations?.[0]?.physicalLocation;
      const rule = rules.get(r.ruleId) ?? (r.ruleIndex !== undefined ? run.tool?.driver?.rules?.[r.ruleIndex] : null);
      const level = r.level ?? rule?.defaultConfiguration?.level ?? "warning";
      const ruleId = r.ruleId ?? rule?.id ?? "unknown";
      const file = toRepoPath(loc?.artifactLocation?.uri, root, remap);
      const line = loc?.region?.startLine ?? 0;
      const key = `${tool}|${ruleId}|${file}|${line}`;
      if (seen.has(key)) continue; // one finding for each rule and line, also when two patterns match it
      seen.add(key);
      out.push({
        tool,
        ruleId,
        level: LEVELS[level] !== undefined ? level : "warning",
        file,
        line,
        message: String(r.message?.text ?? rule?.shortDescription?.text ?? "").trim(),
        help: String(rule?.help?.text ?? rule?.fullDescription?.text ?? "").trim(),
        ...(r.properties?.shark ? { shark: r.properties.shark } : {}),
      });
    }
  }
  return out;
}

/** The complexity metrics that a run carries in `properties.sharkFunctions` (lizard2sarif output). */
export function functionsOf(log, { root, remap = [] } = {}) {
  const out = [];
  for (const run of log?.runs ?? []) {
    for (const f of run?.properties?.sharkFunctions ?? []) out.push({ ...f, file: toRepoPath(f.file, root, remap) });
  }
  return out;
}

const DECL = [
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, // Python
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, // JS/TS function
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, // arrow
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, // Go
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, // Rust
  /^\s*(?:(?:public|private|protected|static|async|override|final)\s+)+(?:[\w<>[\],]+\s+)?([A-Za-z_]\w*)\s*\([^;]*$/, // methods
  /^\s*(?:class|interface|struct)\s+([A-Za-z_]\w*)/,
];

/**
 * The name of the function that holds a 1-based line. Uses complexity ranges when they exist, otherwise the nearest
 * declaration line above it that is indented less than the line.
 */
export function enclosingFunction(lines, line, ranges = []) {
  let best = null;
  for (const r of ranges) {
    if (r.start <= line && line <= r.end && (!best || r.start >= best.start)) best = r;
  }
  if (best) return best.name;
  const indent = (s) => s.match(/^\s*/)[0].length;
  const own = indent(lines[line - 1] ?? "");
  for (let i = line - 1; i >= 0; i--) {
    const s = lines[i] ?? "";
    if (!s.trim()) continue;
    if (i < line - 1 && indent(s) >= own) continue;
    for (const re of DECL) {
      const m = s.match(re);
      if (m) return m[1];
    }
  }
  return "<module>";
}

export const hash = (s, n = 16) => createHash("sha256").update(s).digest("hex").slice(0, n);

/**
 * Adds `fp` (fingerprint) and `fn` (enclosing function) to each finding.
 *
 * @param {object[]} findings Flat findings.
 * @param {(file: string) => string | null} readFile Returns the source text of a repo file, or null.
 * @param {object[]} functions Complexity ranges ({ file, name, start, end }).
 */
export function fingerprint(findings, readFile, functions = []) {
  const cache = new Map();
  const lines = (file) => {
    if (!cache.has(file)) cache.set(file, (readFile(file) ?? "").split(/\r?\n/));
    return cache.get(file);
  };
  const seen = new Map();
  const sorted = [...findings].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  for (const f of sorted) {
    const src = lines(f.file);
    const text = (src[f.line - 1] ?? "").trim();
    f.fn = enclosingFunction(src, f.line, functions.filter((r) => r.file === f.file));
    const key = [f.ruleId, f.file, hash(text), f.fn].join("|");
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    f.fp = hash(`${key}|${n}`, 12);
  }
  return findings;
}

/** Builds one SARIF 2.1.0 log from finding records, with the fields that SonarQube and GitHub need. */
export function toSarif(findings) {
  const byTool = new Map();
  for (const f of findings) {
    if (!byTool.has(f.tool)) byTool.set(f.tool, []);
    byTool.get(f.tool).push(f);
  }
  const runs = [...byTool.entries()].map(([tool, list]) => {
    const rules = [...new Set(list.map((f) => f.ruleId))].map((id) => ({ id, name: displayRule(id) }));
    return {
      tool: { driver: { name: tool, informationUri: "https://github.com/tusharsrivastava/shark-skills", rules } },
      results: list.map((f) => ({
        ruleId: f.ruleId,
        level: f.level,
        message: { text: f.message || displayRule(f.ruleId) },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file, uriBaseId: "%SRCROOT%" },
              region: { startLine: Math.max(1, f.line || 1) },
            },
          },
        ],
        ...(f.fp ? { partialFingerprints: { "sharkHash/v1": f.fp } } : {}),
      })),
    };
  });
  return { $schema: "https://json.schemastore.org/sarif-2.1.0.json", version: "2.1.0", runs };
}
