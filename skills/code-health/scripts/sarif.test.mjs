import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { category, displayRule, enclosingFunction, fingerprint, flatten, parseSarif, toRepoPath, toSarif } from "./sarif.mjs";

const log = (results, name = "opengrep", rules = []) => ({ version: "2.1.0", runs: [{ tool: { driver: { name, rules } }, results }] });
const result = (ruleId, uri, line, text = "msg", level) => ({
  ruleId,
  ...(level ? { level } : {}),
  message: { text },
  locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } }],
});

describe("read and flatten", () => {
  test("parses SARIF and refuses other text", () => {
    assert.ok(parseSarif(JSON.stringify(log([]))));
    assert.equal(parseSarif("NLOC,CCN"), null);
    assert.equal(parseSarif('{"a":1}'), null);
    assert.equal(parseSarif("{broken"), null);
  });
  test("maps file URIs, absolute paths and temp copies to repo paths", () => {
    assert.equal(toRepoPath("file:///repo/src/a.py", "/repo"), "src/a.py");
    assert.equal(toRepoPath("/repo/src/a.py", "/repo"), "src/a.py");
    assert.equal(toRepoPath("./src/a.py", "/repo"), "src/a.py");
    assert.equal(toRepoPath("/tmp/x/src/a.py", "/repo", [["/tmp/x/src/a.py", "src/a.py"]]), "src/a.py");
  });
  test("takes the level from the result, then the rule default, then warning", () => {
    const rules = [{ id: "r2", defaultConfiguration: { level: "error" } }];
    const flat = flatten(log([result("r1", "a.py", 1, "m", "note"), result("r2", "a.py", 2), result("r3", "a.py", 3)], "x", rules));
    assert.deepEqual(flat.map((f) => f.level), ["note", "error", "warning"]);
  });
  test("one finding for each rule and line", () => {
    assert.equal(flatten(log([result("r", "a.py", 3), result("r", "a.py", 3), result("r", "a.py", 4)])).length, 2);
  });
  test("rule display names and categories", () => {
    assert.equal(displayRule("shark.rules.sec-sql-string-concat"), "sec/sql-string-concat");
    assert.equal(displayRule("cx-ccn"), "cx/ccn");
    assert.equal(category({ ruleId: "arch-domain-no-infra", tool: "opengrep" }), "arch");
    assert.equal(category({ ruleId: "cx-ccn", tool: "lizard" }), "cx");
    assert.equal(category({ ruleId: "python.lang.x", tool: "opengrep" }), "sec");
  });
});

describe("enclosing function", () => {
  const src = ["import os", "", "def outer(x):", "    y = 1", "    def inner():", "        return os.system(x)", "    return y", "", "class A:", "    async def m(self):", "        pass"];
  test("finds the nearest declaration that is indented less", () => {
    assert.equal(enclosingFunction(src, 6), "inner");
    assert.equal(enclosingFunction(src, 7), "outer");
    assert.equal(enclosingFunction(src, 11), "m");
    assert.equal(enclosingFunction(src, 1), "<module>");
  });
  test("prefers complexity ranges", () => {
    assert.equal(enclosingFunction(src, 7, [{ name: "outer", start: 3, end: 7 }, { name: "inner", start: 5, end: 6 }]), "outer");
    assert.equal(enclosingFunction(src, 6, [{ name: "outer", start: 3, end: 7 }, { name: "inner", start: 5, end: 6 }]), "inner");
  });
  test("JS, Go and Rust declarations, and no false match on a call", () => {
    const js = ["export async function load(id) {", "  return run(id)", "}", "const f = async (a) =>", "  go(a)"];
    assert.equal(enclosingFunction(js, 2), "load");
    assert.equal(enclosingFunction(["func (s *S) Get(k string) {", "\treturn s.m[k]", "}"], 2), "Get");
    assert.equal(enclosingFunction(["pub fn parse(x: &str) {", "    x.len()", "}"], 2), "parse");
    assert.equal(enclosingFunction(["    return foo(x)", "        bar()"], 2), "<module>");
  });
});

describe("fingerprints", () => {
  const before = ["def q(db, i):", "    db.execute('x' + i)", "    db.execute('x' + i)"].join("\n");
  const after = ["# a new comment", "", "def q(db, i):", "    db.execute('x' + i)", "    db.execute('x' + i)"].join("\n");
  const fps = (text, lines) => fingerprint(lines.map((l) => ({ ruleId: "r", file: "a.py", line: l, message: "" })), () => text).map((f) => f.fp);
  test("moved lines keep their fingerprints", () => {
    assert.deepEqual(fps(before, [2, 3]), fps(after, [4, 5]));
  });
  test("two equal lines in one function get two fingerprints", () => {
    const [a, b] = fps(before, [2, 3]);
    assert.notEqual(a, b);
  });
  test("the same line in another function is a new fingerprint", () => {
    const other = ["def other(db, i):", "    db.execute('x' + i)"].join("\n");
    assert.notEqual(fps(before, [2])[0], fps(other, [2])[0]);
  });
});

describe("SARIF output", () => {
  test("has the fields that SonarQube and GitHub need", () => {
    const out = toSarif([{ tool: "opengrep", ruleId: "sec-x", level: "error", file: "src/a.py", line: 3, message: "m", fp: "abc" }]);
    assert.equal(out.version, "2.1.0");
    const run = out.runs[0];
    assert.equal(run.tool.driver.name, "opengrep");
    const r = run.results[0];
    assert.equal(r.ruleId, "sec-x");
    assert.equal(r.level, "error");
    assert.equal(r.message.text, "m");
    assert.equal(r.locations[0].physicalLocation.artifactLocation.uri, "src/a.py");
    assert.equal(r.partialFingerprints["sharkHash/v1"], "abc");
  });
});
