#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ATTESTATION = "evals/attestation.json";
const INPUTS = ["agents", "skills", "output-styles", "hooks", ".claude-plugin", ".mcp.json", "AGENTS.md", "evals"];
const EXCLUDED = [/^evals\/results\//, /^evals\/attestation\.json$/, /^evals\/README\.md$/, /^evals\/docker\//];
const REQUIRED_TAGS = ["local", "bash"];
const RUN_RULES = { style: { minRuns: 3, minPassed: 2 } };
const DEFAULT_RULE = { minRuns: 1, minPassed: 1 };

export function ruleFor(tags) {
  const tag = tags.find((t) => RUN_RULES[t]);
  return tag ? RUN_RULES[tag] : DEFAULT_RULE;
}

function casePasses(c) {
  const rule = ruleFor(c.tags);
  const needed = Math.max(rule.minPassed, c.runs - (rule.minRuns - rule.minPassed));
  return c.runs >= rule.minRuns && c.runsPassed >= needed;
}

export function inputFiles(root = ROOT) {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...INPUTS], {
    cwd: root,
    encoding: "utf8",
  });
  return [...new Set(listed.split("\0").filter(Boolean))]
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)))
    .filter((file) => existsSync(join(root, file)))
    .sort();
}

function contentOf(root, file) {
  const content = readFileSync(join(root, file));
  if (file !== ".claude-plugin/plugin.json") return content;
  const { version, ...manifest } = JSON.parse(content.toString("utf8"));
  return JSON.stringify(manifest);
}

export function fingerprint(root = ROOT) {
  const files = inputFiles(root);
  const manifest = files
    .map((file) => `${createHash("sha256").update(contentOf(root, file)).digest("hex")}  ${file}`)
    .join("\n");
  return { sha256: createHash("sha256").update(manifest).digest("hex"), files: files.length };
}

function caseTags(root = ROOT) {
  const tags = {};
  for (const entry of readdirSync(join(root, "evals"), { withFileTypes: true })) {
    const prompt = join(root, "evals", entry.name, "prompt.md");
    if (!entry.isDirectory() || !existsSync(prompt)) continue;
    const line = readFileSync(prompt, "utf8").match(/^tags:\s*(.*)$/m);
    tags[entry.name] = line ? JSON.parse(line[1]) : [];
  }
  return tags;
}

function write(resultPath) {
  const resultDir = dirname(resultPath);
  const started = readFileSync(join(resultDir, "fingerprint.txt"), "utf8").trim();
  const now = fingerprint();
  if (now.sha256 !== started) {
    fail(`the files changed after the run started (run ${started.slice(0, 12)}, now ${now.sha256.slice(0, 12)}). Run the evals again.`);
  }
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  const tags = caseTags();
  const cases = result.cases.map((c) => {
    const runs = c.arms.with;
    const entry = {
      name: c.name,
      tags: tags[c.name] ?? [],
      runs: runs.length,
      runsPassed: runs.filter((r) => r.passed).length,
      score: Number(c.aggregates.score.toFixed(3)),
    };
    return { ...entry, passed: casePasses(entry) };
  });
  const attestation = {
    fingerprint: `sha256:${now.sha256}`,
    files: now.files,
    ranAt: result.startedAt,
    claudeVersion: result.claudeVersion,
    costUsd: Number((result.costUsd ?? 0).toFixed(2)),
    casesPassed: cases.filter((c) => c.passed).length,
    casesTotal: cases.length,
    cases,
  };
  writeFileSync(join(ROOT, ATTESTATION), `${JSON.stringify(attestation, null, 2)}\n`);
  console.log(`attest: wrote ${ATTESTATION} for ${attestation.fingerprint.slice(0, 19)}: ${attestation.casesPassed} of ${attestation.casesTotal} cases passed.`);
}

function verify() {
  if (!existsSync(join(ROOT, ATTESTATION))) fail(`${ATTESTATION} does not exist. Run the evals and attest the result.`);
  const attestation = JSON.parse(readFileSync(join(ROOT, ATTESTATION), "utf8"));
  const now = fingerprint();
  const problems = [];
  if (attestation.fingerprint !== `sha256:${now.sha256}`) {
    problems.push(`the files changed since the evals ran (attested ${attestation.fingerprint.slice(7, 19)}, now ${now.sha256.slice(0, 12)}).`);
  }
  const attested = new Set(attestation.cases.map((c) => c.name));
  for (const [name, tags] of Object.entries(caseTags())) {
    if (tags.some((t) => REQUIRED_TAGS.includes(t)) && !attested.has(name)) problems.push(`the case ${name} did not run.`);
  }
  for (const c of attestation.cases) {
    const rule = ruleFor(c.tags);
    if (!casePasses(c)) problems.push(`the case ${c.name} failed: ${c.runsPassed} of ${c.runs} runs passed (it needs ${rule.minRuns} or more runs, with at most ${rule.minRuns - rule.minPassed} failed).`);
  }
  if (problems.length) fail(problems.join("\n  "));
  const passed = attestation.cases.filter(casePasses).length;
  console.log(`attest: ok. ${passed} of ${attestation.cases.length} cases passed on ${attestation.fingerprint.slice(0, 19)} (${attestation.ranAt}).`);
}

function fail(message) {
  console.error(`attest: ${message}`);
  process.exit(1);
}

const [command, arg] = process.argv.slice(2);
if (command === "fingerprint") console.log(fingerprint().sha256);
else if (command === "write" && arg) write(arg);
else if (command === "verify") verify();
else fail("usage: attest.mjs fingerprint | write <result.json> | verify");
