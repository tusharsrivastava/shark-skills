#!/usr/bin/env node
/**
 * Converts Lizard output to SARIF for shark:code-health.
 *
 * Usage:
 *   lizard2sarif.mjs [--ccn 10] [--ccn-block 20] [--nloc 60] [--params 5] [<lizard output file>]   (stdin without a file)
 *
 * Reads the CSV (`lizard --csv`), XML (`lizard --xml`), warning (`lizard -w`) or default table output. Writes one
 * SARIF log with one result per function over a budget (rules cx-ccn, cx-nloc, cx-params). The run also carries
 * every function's metrics in `properties.sharkFunctions`, which `health.mjs` uses for the delta check.
 *
 * Exit codes: 0 converted; 2 usage error or input that is not Lizard output.
 */
import { readFileSync } from "node:fs";

export const DEFAULT_BUDGETS = { ccnWarn: 10, ccnBlock: 20, nlocWarn: 60, paramsWarn: 5 };

function csvRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const clean = (p) => String(p).replace(/^\.\//, "");
const paramsOf = (sig) => {
  const m = String(sig).match(/\(([\s\S]*)\)/);
  if (!m || !m[1].trim()) return 0;
  return m[1].split(",").filter((s) => s.trim()).length;
};
const xmlUnescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Parses Lizard output.
 *
 * @returns {{ file: string, name: string, start: number, end: number, ccn: number, nloc: number, params: number }[] | null}
 *   The functions, or null when the text is not Lizard output.
 */
export function parseLizard(text) {
  const t = String(text ?? "");
  if (/<cppncss/.test(t)) {
    const out = [];
    const fnBlock = t.match(/<measure type="Function">([\s\S]*?)<\/measure>/);
    if (!fnBlock) return out;
    const labels = [...fnBlock[1].matchAll(/<label>([^<]*)<\/label>/g)].map((m) => m[1].toLowerCase());
    const iN = labels.indexOf("ncss");
    const iC = labels.indexOf("ccn");
    for (const m of fnBlock[1].matchAll(/<item name="([^"]*)">([\s\S]*?)<\/item>/g)) {
      const name = xmlUnescape(m[1]);
      const at = name.match(/^(.*) at (.*):(\d+)$/);
      if (!at) continue;
      const values = [...m[2].matchAll(/<value>([^<]*)<\/value>/g)].map((v) => Number(v[1]));
      out.push({
        file: clean(at[2]),
        name: at[1].replace(/\s*\((?:\.\.\.|[^()]*)\)\s*$/, "").trim() || at[1],
        start: Number(at[3]),
        end: Number(at[3]),
        ccn: values[iC] ?? 0,
        nloc: values[iN] ?? 0,
        // the XML format writes each signature as "(...)": the parameter count is not in it
        params: /\(\.\.\.\)\s*$/.test(at[1]) ? 0 : paramsOf(at[1]),
      });
    }
    return out;
  }
  const warn = [...t.matchAll(/^(.+?):(\d+): warning: (.+?) has (\d+) NLOC, (\d+) CCN, \d+ token, (\d+) PARAM, (\d+) length/gm)];
  if (warn.length) {
    return warn.map((m) => ({
      file: clean(m[1]),
      name: m[3].replace(/@.*$/, ""),
      start: Number(m[2]),
      end: Number(m[2]) + Number(m[7]) - 1,
      ccn: Number(m[5]),
      nloc: Number(m[4]),
      params: Number(m[6]),
    }));
  }
  const table = [...t.matchAll(/^\s*(\d+)\s+(\d+)\s+\d+\s+(\d+)\s+\d+\s+(.+)@(\d+)-(\d+)@(.+?)\s*$/gm)];
  if (table.length) {
    return table.map((m) => ({
      file: clean(m[7]),
      name: m[4].trim(),
      start: Number(m[5]),
      end: Number(m[6]),
      ccn: Number(m[2]),
      nloc: Number(m[1]),
      params: Number(m[3]),
    }));
  }
  const rows = csvRows(t);
  if (!rows.length) return /no function|^\s*$/i.test(t) ? [] : null;
  const body = /^nloc$/i.test(rows[0][0]?.trim()) ? rows.slice(1) : rows;
  const out = [];
  for (const r of body) {
    if (r.length < 11 || !/^\d+$/.test(r[0].trim())) return null;
    out.push({
      file: clean(r[6]),
      name: r[7],
      start: Number(r[9]),
      end: Number(r[10]),
      ccn: Number(r[1]),
      nloc: Number(r[0]),
      params: Number(r[3]),
    });
  }
  return out;
}

/** Whether `text` looks like any Lizard output format. */
export function isLizard(text) {
  const t = String(text ?? "");
  if (/<cppncss/.test(t) || / warning: .+ has \d+ NLOC, \d+ CCN/.test(t)) return true;
  if (/NLOC\s+CCN\s+token\s+PARAM/.test(t)) return true;
  const firstLine = t.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return /^NLOC,CCN,token,PARAM/i.test(firstLine) || /^\d+,\d+,\d+,\d+,\d+,"?[^,]*@\d+-\d+@/.test(firstLine);
}

/** The over-budget results for one function, as absolute checks (no baseline). */
export function overBudget(fn, budgets = DEFAULT_BUDGETS) {
  const out = [];
  if (fn.ccn > budgets.ccnWarn) {
    out.push({
      ruleId: "cx-ccn",
      level: fn.ccn > budgets.ccnBlock ? "error" : "warning",
      text: `\`${fn.name}\` ccn ${fn.ccn} (budget ${budgets.ccnWarn}).`,
    });
  }
  if (fn.nloc > budgets.nlocWarn) out.push({ ruleId: "cx-nloc", level: "warning", text: `\`${fn.name}\` nloc ${fn.nloc} (budget ${budgets.nlocWarn}).` });
  if (fn.params > budgets.paramsWarn) out.push({ ruleId: "cx-params", level: "warning", text: `\`${fn.name}\` has ${fn.params} parameters (budget ${budgets.paramsWarn}).` });
  return out;
}

/** Lizard functions to one SARIF log. */
export function lizardToSarif(functions, budgets = DEFAULT_BUDGETS) {
  const results = [];
  for (const fn of functions) {
    for (const r of overBudget(fn, budgets)) {
      results.push({
        ruleId: r.ruleId,
        level: r.level,
        message: { text: r.text },
        locations: [{ physicalLocation: { artifactLocation: { uri: fn.file }, region: { startLine: fn.start || 1 } } }],
      });
    }
  }
  return {
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "lizard",
            rules: [
              { id: "cx-ccn", shortDescription: { text: "Cyclomatic complexity over budget" } },
              { id: "cx-nloc", shortDescription: { text: "Function length over budget" } },
              { id: "cx-params", shortDescription: { text: "Too many parameters" } },
            ],
          },
        },
        results,
        properties: { sharkFunctions: functions },
      },
    ],
  };
}

function main(argv) {
  const budgets = { ...DEFAULT_BUDGETS };
  const flags = { "--ccn": "ccnWarn", "--ccn-block": "ccnBlock", "--nloc": "nlocWarn", "--params": "paramsWarn" };
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (flags[argv[i]]) {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) return usage();
      budgets[flags[argv[i - 1]]] = v;
    } else if (argv[i].startsWith("-")) return usage();
    else file = argv[i];
  }
  let text;
  try {
    text = readFileSync(file ?? 0, "utf8");
  } catch (e) {
    process.stderr.write(`lizard2sarif: cannot read input: ${e.message}\n`);
    return 2;
  }
  const fns = parseLizard(text);
  if (!fns) {
    process.stderr.write("lizard2sarif: the input is not Lizard CSV, XML, warning or table output.\n");
    return 2;
  }
  process.stdout.write(JSON.stringify(lizardToSarif(fns, budgets), null, 1) + "\n");
  return 0;
}

function usage() {
  process.stderr.write("usage: lizard2sarif.mjs [--ccn N] [--ccn-block N] [--nloc N] [--params N] [file]\n");
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
