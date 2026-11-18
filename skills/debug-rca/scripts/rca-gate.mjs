#!/usr/bin/env node
/**
 * Checks a root cause analysis (RCA) against the completeness gate of shark:debug-rca.
 *
 * Usage:
 *   rca-gate.mjs check <rca.md> [--root <repository root>]
 *   rca-gate.mjs run <rca.md> --cmd '<test command>' [--phase before|after] [--root <repository root>]
 *
 * `check` reads the RCA only. It finds the structure problems: a symptom with no cause or test, a matrix cell with
 * no result, a banned phrase, a test that the Fix spec does not list, a listed test that is not in its file. It also
 * runs the closure checks of shark:solution-spec (spec-check.mjs) on the RCA.
 *
 * `run` also runs the tests that the Fix spec lists. The command must write a JUnit XML report to `{junit}` and
 * run the test files in `{files}`. Examples:
 *   --cmd 'pnpm vitest run {files} --reporter=junit --outputFile={junit}'
 *   --cmd '.venv/bin/python -m pytest {files} --junitxml={junit}'
 * Phase `before` (the default) expects each regression test to fail and each guard test to pass. Phase `after`
 * expects all of them to pass, and it checks only the Fix spec and the tests: the structure was checked before.
 *
 * Exit codes: 0 the gate passed; 1 the gate found problems; 2 a usage error or a failed run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkClosure, codeSpans, SEARCH, sections, table, testNames } from "../../solution-spec/scripts/spec-check.mjs";

export { codeSpans, sections, table, testNames };

export const BANNED = [
  /not tested/i,
  /cut (it |them )?for time/i,
  /inferred:? same (path|code|merge)/i,
  /same path \(inferred\)/i,
  /i read (this|it) in the code/i,
  /did not test/i,
  /open:? no test/i,
  /no test yet/i,
];
const REQUIRED_AXES = [
  { name: "Scope", pattern: /scope/i },
  { name: "Actor", pattern: /actor|access|role/i },
];
const NOT_APPLICABLE = /^\s*(not applicable|n\/a)\b/i;

const DEFAULT_PROPERTIES = ["D-ISO", "D-GUARD", "D-TWIN", "D-INPUT"];

function column(header, pattern) {
  return header.findIndex((h) => pattern.test(h));
}

/**
 * Reads the tests of one list in the Fix spec.
 *
 * @param {string} fixSpec The body of the Fix spec section.
 * @param {RegExp} label The label of the list, for example /regression tests/i.
 * @returns {{ file: string, name: string }[]} The tests, each as "`file` › `name`".
 */
export function fixSpecTests(fixSpec, label) {
  const lines = (fixSpec ?? "").split("\n");
  const start = lines.findIndex((l) => /^\s*-\s+/.test(l) && label.test(l));
  if (start < 0) return [];
  const indent = /^(\s*)/.exec(lines[start])[1].length;
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    const own = /^(\s*)-\s+/.exec(line);
    if (own && own[1].length <= indent) break;
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  const tests = [];
  for (const m of block.join("\n").matchAll(/`([^`]+)`\s*(?:›|>|::)\s*`([^`]+)`/g)) {
    tests.push({ file: m[1].trim(), name: m[2].trim() });
  }
  return tests;
}

/**
 * Checks the structure of an RCA.
 *
 * @param {string} text The RCA Markdown.
 * @param {{ root?: string }} options The repository root, to find the test files.
 * @returns {{ problems: string[], regression: {file: string, name: string}[], guard: {file: string, name: string}[] }}
 *   The problems, and the tests of the Fix spec.
 */
export function check(text, { root = process.cwd() } = {}) {
  const s = sections(text);
  const problems = [];
  const need = (name, title) => {
    const key = [...s.keys()].find((k) => k.startsWith(name));
    if (!key) problems.push(`The section "## ${title}" is missing.`);
    return key ? s.get(key) : undefined;
  };

  const symptomMap = need("symptom map", "Symptom map");
  const evidence = need("evidence", "Evidence");
  const matrix = need("variant matrix", "Variant matrix");
  const twins = need("twin", "Twins and history");
  const adjacent = need("adjacent rules", "Adjacent rules");
  const fixSpec = need("fix spec", "Fix spec");

  const regression = fixSpecTests(fixSpec, /regression tests/i);
  const guard = fixSpecTests(fixSpec, /guard tests/i);
  if (fixSpec !== undefined && regression.length === 0) {
    problems.push('Fix spec: "Regression tests" lists no test as `file` › `name`.');
  }
  if (fixSpec !== undefined && guard.length === 0) {
    problems.push('Fix spec: "Guard tests" lists no test as `file` › `name`.');
  }
  const listed = new Set([...regression, ...guard].map((t) => t.name));
  const unlisted = (where, names) => {
    if (listed.size === 0) return;
    for (const n of names) if (!listed.has(n)) problems.push(`${where}: the test \`${n}\` is not in the Fix spec lists.`);
  };

  if (symptomMap !== undefined) {
    const { header, rows } = table(symptomMap);
    const cause = column(header, /cause/);
    const test = column(header, /test/);
    if (rows.length === 0) problems.push("Symptom map: the table has no rows.");
    if (cause < 0 || test < 0) problems.push('Symptom map: the table needs a "Cause" and a "Failing test" column.');
    for (const row of rows) {
      if (cause < 0 || test < 0) break;
      const id = row[0] || "a row";
      if (/^(precondition|action|setup|not applicable|n\/a)\b/i.test(row[cause] ?? "")) continue;
      const notReproduced = /not reproduced/i.test(row.join(" "));
      if (!notReproduced && !/\bC\d+\b/.test(row[cause] ?? "")) problems.push(`Symptom map ${id}: no cause (C1, C2, ...).`);
      const names = testNames(row[test]);
      if (!notReproduced && names.length === 0 && !/precondition/i.test(row.join(" "))) {
        problems.push(`Symptom map ${id}: no failing test in backticks.`);
      }
      unlisted(`Symptom map ${id}`, names);
    }
  }

  if (evidence !== undefined && !/\bobserved\b/i.test(evidence)) {
    problems.push('Evidence: no row is labelled "observed".');
  }

  if (matrix !== undefined) {
    const { header, rows } = table(matrix);
    const axis = column(header, /axis/);
    if (rows.length === 0) problems.push("Variant matrix: the table has no rows.");
    for (const required of REQUIRED_AXES) {
      if (!rows.some((r) => required.pattern.test(r[axis >= 0 ? axis : 0] ?? ""))) {
        problems.push(`Variant matrix: no row for the ${required.name} axis.`);
      }
    }
    for (const row of rows) {
      const label = row.slice(0, 2).join(" / ");
      const results = row.slice(axis >= 0 ? axis + 2 : 1);
      const names = results.flatMap(testNames);
      const naAt = results.findIndex((c) => NOT_APPLICABLE.test(c));
      const cell = naAt >= 0 ? results.slice(naAt).join(" ") : results.join(" ");
      if (names.length === 0 && naAt >= 0) {
        const reason = cell.replace(NOT_APPLICABLE, "").replace(/^[\s:,.-]+/, "");
        if (reason.split(/\s+/).filter(Boolean).length < 4) {
          problems.push(`Variant matrix ${label}: "not applicable" needs a reason.`);
        }
        const special = REQUIRED_AXES.some((a) => a.pattern.test(row[axis >= 0 ? axis : 0] ?? ""));
        if (special && !SEARCH.test(cell)) {
          problems.push(`Variant matrix ${label}: "not applicable" on this axis needs the search command in backticks.`);
        }
      } else if (names.length === 0) {
        problems.push(`Variant matrix ${label}: no test name in backticks, and not "not applicable".`);
      } else {
        unlisted(`Variant matrix ${label}`, names);
      }
    }
  }

  if (twins !== undefined && twins.trim().length < 20) problems.push("Twins and history: the section is empty.");

  if (adjacent !== undefined) {
    const { header, rows } = table(adjacent);
    const test = column(header, /guard|test/);
    for (const row of rows) {
      const names = testNames(row[test >= 0 ? test : row.length - 1]);
      if (names.length === 0) problems.push(`Adjacent rules "${row[0]}": no guard test in backticks.`);
      unlisted(`Adjacent rules "${row[0]}"`, names);
    }
  }

  for (const [name, body] of s) {
    if (!/symptom map|variant matrix|adjacent rules|fix spec/.test(name)) continue;
    for (const line of body.split("\n")) {
      const hit = BANNED.find((b) => b.test(line));
      if (hit) problems.push(`${name}: a banned phrase (${hit.source}) marks an open cell: "${line.trim().slice(0, 120)}".`);
    }
  }

  const props = [...s.keys()].find((k) => k.startsWith("properties"));
  if (props !== undefined) {
    const { header, rows } = table(s.get(props));
    const result = header.findIndex((h) => /cause|result/.test(h));
    for (const id of DEFAULT_PROPERTIES) {
      if (!rows.some((r) => (r[0] ?? "").toUpperCase() === id)) {
        problems.push(`Properties: the default property ${id} is missing (references/zones.md § 1).`);
      }
    }
    for (const row of rows) {
      const cell = row[result >= 0 ? result : row.length - 1] ?? "";
      if (!/\bC\d+\b/.test(cell) && testNames(cell).length === 0) {
        problems.push(`Properties ${row[0]}: no cause (C1, ...) and no test that shows that the property holds.`);
      }
    }
  }
  const rounds = [...s.keys()].find((k) => k.startsWith("rounds"));
  if (rounds !== undefined) {
    const { header, rows } = table(s.get(rounds));
    const status = header.findIndex((h) => /status/.test(h));
    const round = header.findIndex((h) => /round/.test(h));
    for (const row of rows) {
      const st = row[status >= 0 ? status : row.length - 1] ?? "";
      if (/^\s*open\b/i.test(st) && !/step 5/i.test(st)) problems.push(`Rounds ${row[0]}: an open trigger. Start round 2 for it, or mark it "open: step 5".`);
      if (Number.parseInt(row[round >= 0 ? round : 0], 10) > 2) problems.push(`Rounds ${row[0]}: more than one extra round. The limit is round 2; then step 5.`);
    }
  }

  const closure = checkClosure(text);
  problems.push(...closure.problems);
  unlisted("Solution spec", closure.tests);

  for (const t of [...regression, ...guard]) {
    const path = resolve(root, t.file);
    if (!existsSync(path)) {
      problems.push(`Fix spec: the test file ${t.file} does not exist.`);
    } else if (!readFileSync(path, "utf8").includes(t.name)) {
      problems.push(`Fix spec: the test "${t.name}" is not in ${t.file}.`);
    }
  }

  return { problems, regression, guard };
}

/**
 * Reads the test cases of a JUnit XML report.
 *
 * @param {string} xml The report.
 * @returns {{ name: string, outcome: "passed" | "failed" | "skipped" }[]} Each test case with its outcome.
 */
export function junitCases(xml) {
  const cases = [];
  const unescape = (v) =>
    v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1]);
    const inner = m[3] ?? "";
    const outcome = /<(failure|error)\b/.test(inner) ? "failed" : /<skipped\b/.test(inner) ? "skipped" : "passed";
    cases.push({ name: unescape(name ? name[1] : ""), outcome });
  }
  return cases;
}

/**
 * Finds the outcome of one test in a list of JUnit test cases.
 *
 * @param {{ name: string, outcome: string }[]} cases The test cases.
 * @param {string} name The test name from the RCA.
 * @returns {string} The outcome, or "missing".
 */
export function outcomeOf(cases, name) {
  const hit = cases.filter(
    (c) => c.name === name || c.name.endsWith(` > ${name}`) || c.name.endsWith(` ${name}`) || c.name.startsWith(`${name}[`),
  );
  if (hit.length === 0) return "missing";
  if (hit.some((c) => c.outcome === "failed")) return "failed";
  if (hit.every((c) => c.outcome === "skipped")) return "skipped";
  return "passed";
}

/**
 * Runs the Fix spec tests and compares each outcome with the phase.
 *
 * @param {{ regression: {file: string, name: string}[], guard: {file: string, name: string}[] }} tests The tests.
 * @param {{ cmd: string, phase: "before" | "after", root: string }} options The command template, the phase, the root.
 * @returns {{ problems: string[], lines: string[], error?: string }} The problems and one line for each test.
 */
export function runTests(tests, { cmd, phase, root }) {
  const dir = mkdtempSync(join(tmpdir(), "rca-gate-"));
  const junit = join(dir, "junit.xml");
  const files = [...new Set([...tests.regression, ...tests.guard].map((t) => t.file))];
  const quote = (v) => `'${v.replace(/'/g, `'\\''`)}'`;
  const command = cmd.replaceAll("{files}", files.map(quote).join(" ")).replaceAll("{junit}", quote(junit));
  const result = spawnSync("/bin/sh", ["-c", command], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(junit)) {
    rmSync(dir, { recursive: true, force: true });
    const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
    return { problems: [], lines: [], error: `The command wrote no JUnit report (exit ${result.status}).\n${tail}` };
  }
  const cases = junitCases(readFileSync(junit, "utf8"));
  rmSync(dir, { recursive: true, force: true });
  const problems = [];
  const lines = [];
  const expect = (kind, t, want) => {
    const got = outcomeOf(cases, t.name);
    const ok = got === want;
    lines.push(`${ok ? "ok  " : "FAIL"} ${kind} ${t.file} › ${t.name}: ${got}, expected ${want}`);
    if (!ok) problems.push(`${kind} test "${t.name}" is ${got}; it must be ${want} ${phase} the fix.`);
  };
  for (const t of tests.regression) expect("regression", t, phase === "before" ? "failed" : "passed");
  for (const t of tests.guard) expect("guard", t, "passed");
  return { problems, lines };
}

function main(argv) {
  const [mode, file, ...rest] = argv;
  const opt = (name, fallback) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : fallback;
  };
  if (!["check", "run"].includes(mode) || !file) {
    console.error("usage: rca-gate.mjs check <rca.md> [--root <dir>]\n       rca-gate.mjs run <rca.md> --cmd '<command with {files} and {junit}>' [--phase before|after] [--root <dir>]");
    return 2;
  }
  if (!existsSync(file)) {
    console.error(`rca-gate: ${file} does not exist.`);
    return 2;
  }
  const root = resolve(opt("root", process.cwd()));
  const result = check(readFileSync(file, "utf8"), { root });
  let problems = result.problems;
  console.log(`rca-gate: ${result.regression.length} regression tests, ${result.guard.length} guard tests in the Fix spec.`);
  if (mode === "run") {
    const cmd = opt("cmd");
    const phase = opt("phase", "before");
    if (!cmd || !cmd.includes("{junit}") || !cmd.includes("{files}")) {
      console.error("rca-gate: --cmd must contain {files} and {junit}.");
      return 2;
    }
    if (!["before", "after"].includes(phase)) {
      console.error("rca-gate: --phase is before or after.");
      return 2;
    }
    const run = runTests(result, { cmd, phase, root });
    if (run.error) {
      console.error(`rca-gate: ${run.error}`);
      return 2;
    }
    for (const line of run.lines) console.log(line);
    const structure = phase === "after" ? problems.filter((p) => p.startsWith("Fix spec")) : problems;
    problems = [...structure, ...run.problems];
  }
  if (problems.length === 0) {
    console.log("rca-gate: passed.");
    return 0;
  }
  const verdict = mode === "run" && opt("phase") === "after" ? "The fix is not complete." : 'The RCA status stays "investigating".';
  console.log(`rca-gate: ${problems.length} problems. ${verdict}`);
  for (const p of problems) console.log(`- ${p}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
