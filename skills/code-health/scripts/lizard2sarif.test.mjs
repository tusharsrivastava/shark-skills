import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isLizard, lizardToSarif, overBudget, parseLizard } from "./lizard2sarif.mjs";

const data = (name) => readFileSync(new URL(`./testdata/${name}`, import.meta.url), "utf8");
const SCRIPT = fileURLToPath(new URL("./lizard2sarif.mjs", import.meta.url));

// The testdata files are real lizard 1.25.0 output for testdata/src (see testdata/README.md).
describe("formats", () => {
  test("CSV has every function with its range and parameter count", () => {
    const fns = parseLizard(data("lizard.csv"));
    assert.equal(fns.length, 6);
    assert.deepEqual(fns.find((f) => f.name === "apply_discounts"), { file: "src/pricing.py", name: "apply_discounts", start: 1, end: 12, ccn: 7, nloc: 12, params: 3 });
    assert.equal(fns.find((f) => f.name === "(anonymous)").file, "src/format.ts");
  });
  test("XML has names and CCN, but no end line and no parameter count", () => {
    const fns = parseLizard(data("lizard.xml"));
    assert.equal(fns.length, 6);
    const f = fns.find((x) => x.name === "apply_discounts");
    assert.equal(f.ccn, 7);
    assert.equal(f.nloc, 12);
    assert.equal(f.params, 0);
    assert.ok(fns.some((x) => x.name === "(anonymous)"));
  });
  test("warning and table output", () => {
    assert.deepEqual(parseLizard(data("lizard.warn")).map((f) => [f.name, f.ccn, f.end]), [["label", 4, 8], ["apply_discounts", 7, 12]]);
    assert.equal(parseLizard(data("lizard.txt")).length, 6);
  });
  test("detects Lizard output and refuses other text", () => {
    for (const f of ["lizard.csv", "lizard.xml", "lizard.warn", "lizard.txt"]) assert.ok(isLizard(data(f)), f);
    assert.equal(isLizard('{"version":"2.1.0"}'), false);
    assert.equal(parseLizard("hello, world"), null);
  });
  test("a quoted name with a comma", () => {
    const [f] = parseLizard('3,2,9,2,3,"f@1-3@a.py","a.py","f","f( a , b )",1,3\n');
    assert.equal(f.params, 2);
  });
});

describe("budgets", () => {
  const fn = { file: "a.py", name: "f", start: 1, end: 9, ccn: 21, nloc: 70, params: 6 };
  test("one result per budget that the function passes, CCN over the block level is an error", () => {
    const r = overBudget(fn, { ccnWarn: 10, ccnBlock: 20, nlocWarn: 60, paramsWarn: 5 });
    assert.deepEqual(r.map((x) => [x.ruleId, x.level]), [["cx-ccn", "error"], ["cx-nloc", "warning"], ["cx-params", "warning"]]);
    assert.deepEqual(overBudget({ ...fn, ccn: 12, nloc: 10, params: 1 }).map((x) => x.level), ["warning"]);
    assert.deepEqual(overBudget({ ...fn, ccn: 10, nloc: 60, params: 5 }), []);
  });
  test("the SARIF run carries all functions for the delta check", () => {
    const log = lizardToSarif(parseLizard(data("lizard.csv")), { ccnWarn: 5, ccnBlock: 20, nlocWarn: 60, paramsWarn: 5 });
    assert.equal(log.runs[0].properties.sharkFunctions.length, 6);
    assert.deepEqual(log.runs[0].results.map((r) => r.ruleId), ["cx-ccn"]);
    assert.equal(log.runs[0].results[0].locations[0].physicalLocation.region.startLine, 1);
  });
});

describe("CLI", () => {
  test("converts a file and sets the budget", () => {
    const r = spawnSync("node", [SCRIPT, "--ccn", "3", fileURLToPath(new URL("./testdata/lizard.csv", import.meta.url))], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).runs[0].results.length, 2);
  });
  test("exit 2 on input that is not Lizard output, and on a bad option", () => {
    assert.equal(spawnSync("node", [SCRIPT], { input: "hello, world", encoding: "utf8" }).status, 2);
    assert.equal(spawnSync("node", [SCRIPT, "--ccn", "x"], { input: "", encoding: "utf8" }).status, 2);
  });
});
