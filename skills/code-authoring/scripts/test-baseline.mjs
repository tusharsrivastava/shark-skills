#!/usr/bin/env node
/**
 * Records the test results of an area before a change, and finds the tests that the change broke.
 *
 * Usage:
 *   test-baseline.mjs record --cmd '<test command with {files} and {junit}>' --out <baseline.json> <test file>...
 *   test-baseline.mjs compare --cmd '<test command with {files} and {junit}>' --baseline <baseline.json> [--allow <name>]...
 *
 * `record` runs the test files and saves the outcome of each test. Run it before you change the code.
 * `compare` runs the same files again. A test that passed in the baseline and fails now is a regression. A test that
 * the baseline does not have is new, and it is listed apart. Use `--allow` for a test that the spec changes on
 * purpose; name the spec part in your report. Examples of a command:
 *   --cmd 'pnpm vitest run {files} --reporter=junit --outputFile={junit}'
 *   --cmd '.venv/bin/python -m pytest {files} --junitxml={junit}'
 *
 * Exit codes: 0 no regression; 1 one or more regressions; 2 a usage error or a failed run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads the test cases of a JUnit XML report.
 *
 * @param {string} xml The report.
 * @returns {Record<string, "passed" | "failed" | "skipped">} The outcome of each test, keyed by its full name.
 */
export function outcomes(xml) {
  const out = {};
  const unescape = (v) =>
    v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1]);
    const cls = /\bclassname="([^"]*)"/.exec(m[1]);
    const key = `${unescape(cls ? cls[1] : "")} :: ${unescape(name ? name[1] : "")}`;
    const inner = m[3] ?? "";
    const outcome = /<(failure|error)\b/.test(inner) ? "failed" : /<skipped\b/.test(inner) ? "skipped" : "passed";
    out[key] = out[key] === "failed" ? "failed" : outcome;
  }
  return out;
}

/**
 * Compares two sets of outcomes.
 *
 * @param {Record<string, string>} before The baseline outcomes.
 * @param {Record<string, string>} after The outcomes now.
 * @param {string[]} allow The test names that may change on purpose.
 * @returns {{ broken: string[], fixed: string[], added: string[], missing: string[], allowed: string[] }} The
 *   tests that passed and fail now, failed and pass now, are new, are gone, and broke on purpose.
 */
export function compare(before, after, allow = []) {
  const allowed = (key) => allow.some((a) => key.endsWith(a));
  const r = { broken: [], fixed: [], added: [], missing: [], allowed: [] };
  for (const [key, now] of Object.entries(after)) {
    const was = before[key];
    if (was === undefined) r.added.push(`${key} (${now})`);
    else if (was === "passed" && now === "failed") (allowed(key) ? r.allowed : r.broken).push(key);
    else if (was === "failed" && now === "passed") r.fixed.push(key);
  }
  for (const [key, was] of Object.entries(before)) {
    if (!(key in after) && was === "passed") r.missing.push(key);
  }
  return r;
}

/**
 * Runs the test files and reads the outcomes.
 *
 * @param {string} cmd The command with `{files}` and `{junit}`.
 * @param {string[]} files The test files.
 * @returns {{ outcomes?: Record<string, string>, error?: string }} The outcomes, or the error.
 */
export function runFiles(cmd, files) {
  const dir = mkdtempSync(join(tmpdir(), "test-baseline-"));
  const junit = join(dir, "junit.xml");
  const quote = (v) => `'${v.replace(/'/g, `'\\''`)}'`;
  const command = cmd.replaceAll("{files}", files.map(quote).join(" ")).replaceAll("{junit}", quote(junit));
  const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(junit)) {
    rmSync(dir, { recursive: true, force: true });
    const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
    return { error: `The command wrote no JUnit report (exit ${result.status}).\n${tail}` };
  }
  const found = outcomes(readFileSync(junit, "utf8"));
  rmSync(dir, { recursive: true, force: true });
  return { outcomes: found };
}

function main(argv) {
  const [mode, ...rest] = argv;
  const values = (name) => rest.flatMap((v, i) => (rest[i - 1] === `--${name}` ? [v] : []));
  const opt = (name) => values(name)[0];
  const flags = new Set(["--cmd", "--out", "--baseline", "--allow"]);
  const files = rest.filter((v, i) => !v.startsWith("--") && !flags.has(rest[i - 1]));
  const cmd = opt("cmd");
  if (!["record", "compare"].includes(mode) || !cmd || !cmd.includes("{files}") || !cmd.includes("{junit}")) {
    console.error("usage: test-baseline.mjs record --cmd '<command with {files} and {junit}>' --out <file> <test file>...\n       test-baseline.mjs compare --cmd '<command>' --baseline <file> [--allow <test name>]...");
    return 2;
  }
  if (mode === "record") {
    const out = opt("out");
    if (!out || files.length === 0) {
      console.error("test-baseline: record needs --out and one or more test files.");
      return 2;
    }
    const run = runFiles(cmd, files);
    if (run.error) {
      console.error(`test-baseline: ${run.error}`);
      return 2;
    }
    writeFileSync(out, JSON.stringify({ files, outcomes: run.outcomes }, null, 1));
    const counts = Object.values(run.outcomes).reduce((a, o) => ({ ...a, [o]: (a[o] ?? 0) + 1 }), {});
    console.log(`test-baseline: recorded ${Object.keys(run.outcomes).length} tests in ${resolve(out)}: ${JSON.stringify(counts)}`);
    return 0;
  }
  const path = opt("baseline");
  if (!path || !existsSync(path)) {
    console.error("test-baseline: compare needs --baseline <file> from record.");
    return 2;
  }
  const base = JSON.parse(readFileSync(path, "utf8"));
  const run = runFiles(cmd, base.files);
  if (run.error) {
    console.error(`test-baseline: ${run.error}`);
    return 2;
  }
  const r = compare(base.outcomes, run.outcomes, values("allow"));
  const list = (title, items) => items.length && console.log(`${title} (${items.length}):\n${items.map((i) => `  - ${i}`).join("\n")}`);
  list("Broken: passed before, fail now", r.broken);
  list("Gone: passed before, not in the results now", r.missing);
  list("Changed on purpose (--allow)", r.allowed);
  list("Fixed: failed before, pass now", r.fixed);
  list("New tests", r.added);
  if (r.broken.length || r.missing.length) {
    console.log(`test-baseline: ${r.broken.length + r.missing.length} regressions. Fix them, or name the spec part that changes each one.`);
    return 1;
  }
  console.log("test-baseline: no regression.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
