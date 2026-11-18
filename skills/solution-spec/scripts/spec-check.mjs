#!/usr/bin/env node
/**
 * Checks that a spec is closed: each behaviour decision is a row with a test (shark:solution-spec).
 *
 * Usage:
 *   spec-check.mjs <spec.md>
 *
 * The spec needs the sections "Guards on the path", "Behaviour table", "Decisions" and "Adversarial check". The
 * check finds a guard with no outcome or no test, a behaviour row with no test, an open decision, and a "must not
 * change" sentence outside the tables with no test.
 *
 * Exit codes: 0 the spec is closed; 1 the spec has open items; 2 a usage error.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SEARCH = /`\s*(grep|rg|git|find|ag)\s[^`]*`/;
const OPEN_DECISION = /^\s*(\?|tbd|todo|open|unknown|writer decides|to decide|-)?\s*$/i;
const WRITER_CHOICE = /\b(writer|implementer|implementation) (decides|chooses|can choose)\b/i;

/**
 * Splits a Markdown document into its level-2 sections.
 *
 * @param {string} text The Markdown text.
 * @returns {Map<string, string>} The body of each section, keyed by its heading in lower case without a number.
 */
export function sections(text) {
  const out = new Map();
  let name = null;
  let body = [];
  for (const line of text.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading && !line.startsWith("###")) {
      if (name !== null) out.set(name, body.join("\n"));
      name = heading[1].toLowerCase().replace(/^\d+[.)]\s*/, "");
      body = [];
    } else if (name !== null) {
      body.push(line);
    }
  }
  if (name !== null) out.set(name, body.join("\n"));
  return out;
}

/**
 * Finds a section by the start of its heading.
 *
 * @param {Map<string, string>} all The sections.
 * @param {string} start The start of the heading, in lower case.
 * @returns {string | undefined} The body of the first section that matches.
 */
export function section(all, start) {
  const key = [...all.keys()].find((k) => k.startsWith(start));
  return key === undefined ? undefined : all.get(key);
}

/**
 * Reads the first Markdown table of a section.
 *
 * @param {string | undefined} body The section body.
 * @returns {{ header: string[], rows: string[][] }} The header cells in lower case and the data rows.
 */
export function table(body) {
  const lines = (body ?? "").split("\n").filter((l) => l.trim().startsWith("|"));
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = cells(lines[0]).map((c) => c.toLowerCase());
  const rows = lines.slice(1).filter((l) => !/^\|?\s*:?-{3,}/.test(l.trim())).map(cells);
  return { header, rows };
}

/**
 * Gives the code spans of a text.
 *
 * @param {string} text The text.
 * @returns {string[]} The text inside each pair of backticks.
 */
export function codeSpans(text) {
  return [...(text ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

/**
 * Gives the code spans of a text that are test names: a sentence of three words or more, a `test_` identifier, or
 * an ID with `::`.
 *
 * @param {string} text The text.
 * @returns {string[]} The test names.
 */
export function testNames(text) {
  return codeSpans(text).filter(
    (n) => !SEARCH.test(`\`${n}\``) && (n.split(/\s+/).length >= 3 || /^test[_A-Z]/.test(n) || n.includes("::")),
  );
}

function column(header, pattern) {
  return header.findIndex((h) => pattern.test(h));
}

/**
 * Checks that a spec is closed.
 *
 * @param {string} text The spec Markdown.
 * @returns {{ problems: string[], tests: string[] }} The open items, and the test names of the behaviour table.
 */
export function checkClosure(text) {
  const all = sections(text);
  const problems = [];
  const need = (start, title) => {
    const body = section(all, start);
    if (body === undefined) problems.push(`The section "## ${title}" is missing (shark:solution-spec).`);
    return body;
  };
  const guards = need("guards on the path", "Guards on the path");
  const behaviour = need("behaviour table", "Behaviour table");
  const decisions = need("decisions", "Decisions");
  const adversarial = need("adversarial check", "Adversarial check");
  const tests = [];

  if (guards !== undefined) {
    const { header, rows } = table(guards);
    const outcome = column(header, /new behaviour|outcome/);
    const test = column(header, /test/);
    if (rows.length === 0) problems.push("Guards on the path: the table has no rows. Write the guards that you read, or one row that says the path has none and why.");
    for (const row of rows) {
      const id = row[0] || "a guard";
      if (/\bnone\b/i.test(row.join(" ")) && rows.length === 1) continue;
      if (outcome >= 0 && (row[outcome] ?? "").replace(/[`\s-]/g, "").length < 3) problems.push(`Guards on the path ${id}: no outcome for the new behaviour when the guard fires.`);
      const names = testNames(row[test >= 0 ? test : row.length - 1]);
      if (names.length === 0) problems.push(`Guards on the path ${id}: no test in backticks.`);
      tests.push(...names);
    }
  }

  if (behaviour !== undefined) {
    const { header, rows } = table(behaviour);
    const outcome = column(header, /outcome/);
    const test = column(header, /test/);
    if (rows.length === 0) problems.push("Behaviour table: the table has no rows.");
    for (const row of rows) {
      const id = row[0] || "a row";
      if (outcome >= 0 && (row[outcome] ?? "").length < 3) problems.push(`Behaviour table ${id}: no expected outcome.`);
      const names = testNames(row[test >= 0 ? test : row.length - 1]);
      if (names.length === 0) problems.push(`Behaviour table ${id}: no test in backticks.`);
      if (WRITER_CHOICE.test(row.join(" "))) problems.push(`Behaviour table ${id}: the row leaves the behaviour to the writer.`);
      tests.push(...names);
    }
  }

  if (decisions !== undefined) {
    const { header, rows } = table(decisions);
    const decision = column(header, /decision/);
    for (const row of rows) {
      const id = row[0] || "a decision";
      if (decision < 0 || OPEN_DECISION.test(row[decision] ?? "")) problems.push(`Decisions ${id}: no decision. Decide it, with your recommendation.`);
      if (WRITER_CHOICE.test(row.join(" "))) problems.push(`Decisions ${id}: the decision is left to the writer.`);
    }
  }

  if (adversarial !== undefined && table(adversarial).rows.length === 0 && adversarial.trim().length < 40) {
    problems.push("Adversarial check: write the simplest patch that passes the tests, and what it breaks.");
  }

  for (const [name, body] of all) {
    if (/guards on the path|behaviour table|decisions|adversarial/.test(name)) continue;
    for (const line of body.split("\n")) {
      if (/must not change|must stay|do not change/i.test(line) && testNames(line).length === 0 && !/\bB\d+\b/.test(line)) {
        problems.push(`${name}: "${line.trim().slice(0, 100)}" has no test. Make it a behaviour row with a test.`);
      }
    }
  }
  return { problems, tests };
}

function main(argv) {
  const [file] = argv;
  if (!file || !existsSync(file)) {
    console.error("usage: spec-check.mjs <spec.md>");
    return 2;
  }
  const { problems, tests } = checkClosure(readFileSync(file, "utf8"));
  console.log(`spec-check: ${tests.length} tests in the guards and the behaviour table.`);
  if (problems.length === 0) {
    console.log("spec-check: the spec is closed.");
    return 0;
  }
  console.log(`spec-check: ${problems.length} open items. The spec is not closed.`);
  for (const p of problems) console.log(`- ${p}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
