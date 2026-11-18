import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { compare, outcomes } from "./test-baseline.mjs";

const SCRIPT = fileURLToPath(new URL("./test-baseline.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "test-baseline-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const xml = (cases) =>
  `<testsuites>${cases.map(([n, o]) => `<testcase classname="a.spec.ts" name="${n}">${o === "failed" ? "<failure/>" : o === "skipped" ? "<skipped/>" : ""}</testcase>`).join("")}</testsuites>`;

function runner(name, cases) {
  const script = join(dir, `${name}.sh`);
  writeFileSync(script, `#!/bin/sh\ncat > "$1" <<'XML'\n${xml(cases)}\nXML\n`, { mode: 0o755 });
  return `${script} {junit} {files}`;
}

describe("outcomes and compare", () => {
  test("reads the class and the name of each case", () => {
    const o = outcomes(xml([["Suite &gt; keeps status", "passed"], ["Suite &gt; drafts all", "failed"]]));
    assert.deepEqual(o, { "a.spec.ts :: Suite > keeps status": "passed", "a.spec.ts :: Suite > drafts all": "failed" });
  });

  test("finds broken, fixed, new and gone tests", () => {
    const before = { "f :: a": "passed", "f :: b": "failed", "f :: c": "passed", "f :: d": "passed" };
    const after = { "f :: a": "failed", "f :: b": "passed", "f :: c": "passed", "f :: e": "passed" };
    const r = compare(before, after);
    assert.deepEqual(r.broken, ["f :: a"]);
    assert.deepEqual(r.fixed, ["f :: b"]);
    assert.deepEqual(r.added, ["f :: e (passed)"]);
    assert.deepEqual(r.missing, ["f :: d"]);
  });

  test("an allowed test is not a regression", () => {
    const r = compare({ "f :: S > old rule": "passed" }, { "f :: S > old rule": "failed" }, ["old rule"]);
    assert.deepEqual(r.broken, []);
    assert.deepEqual(r.allowed, ["f :: S > old rule"]);
  });
});

describe("command line", () => {
  test("record, then compare finds the test that the change broke", () => {
    const base = join(dir, "base.json");
    const rec = spawnSync(process.execPath, [SCRIPT, "record", "--cmd", runner("before", [["keeps status", "passed"], ["drafts all", "failed"]]), "--out", base, "a.spec.ts"], { encoding: "utf8" });
    assert.equal(rec.status, 0, rec.stderr);
    const cmp = spawnSync(process.execPath, [SCRIPT, "compare", "--cmd", runner("after", [["keeps status", "failed"], ["drafts all", "passed"]]), "--baseline", base], { encoding: "utf8" });
    assert.equal(cmp.status, 1);
    assert.match(cmp.stdout, /Broken: passed before, fail now \(1\):\n {2}- a\.spec\.ts :: keeps status/);
    assert.match(cmp.stdout, /Fixed: failed before, pass now \(1\)/);
  });

  test("compare with no regression gives exit 0", () => {
    const base = join(dir, "base2.json");
    spawnSync(process.execPath, [SCRIPT, "record", "--cmd", runner("b2", [["keeps status", "passed"]]), "--out", base, "a.spec.ts"]);
    const cmp = spawnSync(process.execPath, [SCRIPT, "compare", "--cmd", runner("a2", [["keeps status", "passed"], ["new one", "passed"]]), "--baseline", base], { encoding: "utf8" });
    assert.equal(cmp.status, 0, cmp.stdout);
    assert.match(cmp.stdout, /New tests \(1\)/);
  });

  test("a command without {junit} is a usage error", () => {
    assert.equal(spawnSync(process.execPath, [SCRIPT, "record", "--cmd", "pytest {files}", "--out", "x", "a"]).status, 2);
  });
});
