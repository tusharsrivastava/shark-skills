import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, fixSpecTests, junitCases, outcomeOf, runTests } from "./rca-gate.mjs";

const SCRIPT = fileURLToPath(new URL("./rca-gate.mjs", import.meta.url));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "rca-gate-test-"));
  dirs.push(dir);
  mkdirSync(join(dir, "tests"));
  writeFileSync(
    join(dir, "tests/test_cart.py"),
    [
      "def test_total_rounds_half_up(): assert False",
      "def test_bulk_total_rounds_half_up(): assert False",
      "def test_total_of_another_tenant_is_hidden(): assert True",
      "def test_denied_user_cannot_see_total(): assert True",
      "",
    ].join("\n"),
  );
  return dir;
}

const GOOD = `# RCA: totals round down

| Item | Value |
| --- | --- |
| Status | root causes confirmed |

## Symptom map

| # | Symptom | Path and data | Cause | Failing test |
| --- | --- | --- | --- | --- |
| S1 | The total rounds down | single cart | C1 | \`test_total_rounds_half_up\` |
| S2 | The bulk total rounds down | bulk | C2 | \`test_bulk_total_rounds_half_up\` |

## Evidence

| Location | Expression | Expected | Observed | Label |
|---|---|---|---|---|
| \`cart.py:12\` | \`total\` | \`10.01\` | \`10.00\` | observed |

## Variant matrix

| Axis | Value | Cause | Test, or "not applicable" and why |
| --- | --- | --- | --- |
| Twin path | bulk | C2 | \`test_bulk_total_rounds_half_up\` |
| Scope | another tenant | C1 | \`test_total_of_another_tenant_is_hidden\` |
| Actor | denied | C1 | \`test_denied_user_cannot_see_total\` |
| Value shape | empty cart | C1 | not applicable: an empty cart has no line to round, see \`grep -n "if not lines" cart.py\` |

## Twins and history

\`grep -rn "quantize" app\` found the bulk path; \`git log -S quantize\` shows one older fix.

## Adjacent rules

| Rule | Source | The obvious fix that breaks it | Guard test (passes now) |
| --- | --- | --- | --- |
| Tenant isolation | Invariants | a cache keyed by cart only | \`test_total_of_another_tenant_is_hidden\` |
| Access | spec | totals for all | \`test_denied_user_cannot_see_total\` |

## Guards on the path

| # | Guard | Location | When it fires | The new behaviour when it fires | Test |
| --- | --- | --- | --- | --- | --- |
| G1 | tenant filter | \`cart.py:5\` | the cart is of another tenant | no total | \`test_total_of_another_tenant_is_hidden\` |

## Behaviour table

| # | Condition | Expected outcome | Test | Kind |
| --- | --- | --- | --- | --- |
| B1 | single cart | the total rounds half up | \`test_total_rounds_half_up\` | regression |
| B2 | bulk | each total rounds half up | \`test_bulk_total_rounds_half_up\` | regression |
| B3 | denied user | no total | \`test_denied_user_cannot_see_total\` | guard |

## Decisions

| # | Question | Decision | Reason | Status |
| --- | --- | --- | --- | --- |
| D1 | the mode on a tie | half up | the spec says so | decided |

## Adversarial check

| Simplest patch | What it breaks | Row added |
| --- | --- | --- |
| round in the view only | the bulk total | B2 |

## Fix spec

- **After the fix:** each total rounds half up.
- **Regression tests:**
  - \`tests/test_cart.py\` › \`test_total_rounds_half_up\`
  - \`tests/test_cart.py\` › \`test_bulk_total_rounds_half_up\`
- **Guard tests:**
  - \`tests/test_cart.py\` › \`test_total_of_another_tenant_is_hidden\`
  - \`tests/test_cart.py\` › \`test_denied_user_cannot_see_total\`
- **Rejected:** round in the view only.
`;

describe("check", () => {
  test("a complete RCA passes", () => {
    const r = check(GOOD, { root: repo() });
    assert.deepEqual(r.problems, []);
    assert.equal(r.regression.length, 2);
    assert.equal(r.guard.length, 2);
  });

  test("a cell marked as not tested is an open cell", () => {
    const text = GOOD.replace("| Twin path | bulk | C2 | `test_bulk_total_rounds_half_up` |", "| Twin path | bulk | C2 | not tested; inferred same path |");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.includes("banned phrase")), r.problems.join("\n"));
  });

  test("a reason from the code with no test is refused", () => {
    const text = GOOD.replace("| Twin path | bulk | C2 | `test_bulk_total_rounds_half_up` |", "| Twin path | bulk | C2 | I read this in the code; it uses the same helper |");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.includes("Variant matrix Twin path / bulk")), r.problems.join("\n"));
  });

  test("the Actor axis is required", () => {
    const text = GOOD.replace(/\| Actor \| denied .*\n/, "");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.includes("Variant matrix: no row for the Actor axis."), r.problems.join("\n"));
  });

  test('"not applicable" on the Scope axis needs a search command', () => {
    const text = GOOD.replace("| Scope | another tenant | C1 | `test_total_of_another_tenant_is_hidden` |", "| Scope | all tenants | C1 | not applicable: there is no bulk operation for tenants here |");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.includes("needs the search command")), r.problems.join("\n"));
  });

  test("a test name that starts with a search word is still a test name", () => {
    const text = GOOD.replaceAll("test_total_of_another_tenant_is_hidden", "should find the total of the own tenant only");
    const dir = repo();
    writeFileSync(join(dir, "tests/test_cart.py"), "should find the total of the own tenant only\ntest_total_rounds_half_up test_bulk_total_rounds_half_up test_denied_user_cannot_see_total\n");
    assert.deepEqual(check(text, { root: dir }).problems, []);
  });

  test("a symptom with no cause and no test is refused", () => {
    const text = GOOD.replace("| S2 | The bulk total rounds down | bulk | C2 | `test_bulk_total_rounds_half_up` |", "| S2 | The bulk total rounds down | bulk | ? | |");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.startsWith("Symptom map S2: no cause")), r.problems.join("\n"));
    assert.ok(r.problems.some((p) => p.startsWith("Symptom map S2: no failing test")), r.problems.join("\n"));
  });

  test("a test in the matrix that the Fix spec does not list is refused", () => {
    const text = GOOD.replace("`test_denied_user_cannot_see_total` |\n| Value", "`test_denied_admin_link` |\n| Value");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.includes("`test_denied_admin_link` is not in the Fix spec")), r.problems.join("\n"));
  });

  test("a listed test that is not in its file is refused", () => {
    const text = GOOD.replace("`tests/test_cart.py` › `test_total_rounds_half_up`", "`tests/test_cart.py` › `test_total_is_rounded`");
    const r = check(text, { root: repo() });
    assert.ok(r.problems.some((p) => p.includes('"test_total_is_rounded" is not in tests/test_cart.py')), r.problems.join("\n"));
  });

  test("a property with no cause and no test is refused", () => {
    const props = "## Properties\n\n| # | Observation | Property | Zones | Causes, or the tests that show that it holds |\n| --- | --- | --- | --- | --- |\n| P1 | totals round down | totals round half up | Z1 | C1 |\n| P2 | bulk differs | twins agree | Z2 | unknown |\n| D-ISO | default | rule | Z1 | `test_total_rounds_half_up` |\n| D-GUARD | default | rule | Z1 | `test_total_rounds_half_up` |\n| D-TWIN | default | rule | Z1 | `test_total_rounds_half_up` |\n| D-INPUT | default | rule | Z1 | `test_total_rounds_half_up` |\n\n";
    const r = check(props + GOOD, { root: repo() });
    assert.ok(r.problems.some((p) => p.startsWith("Properties P2: no cause")), r.problems.join("\n"));
    assert.ok(!r.problems.some((p) => p.startsWith("Properties P1")), r.problems.join("\n"));
  });

  test("a missing default property is refused", () => {
    const props = "## Properties\n\n| # | Observation | Property | Zones | Causes, or the tests that show that it holds |\n| --- | --- | --- | --- | --- |\n| P1 | totals round down | totals round half up | Z1 | C1 |\n| D-ISO | default | rule | Z1 | C1 |\n\n";
    const r = check(props + GOOD, { root: repo() });
    assert.ok(r.problems.includes("Properties: the default property D-GUARD is missing (references/zones.md § 1)."), r.problems.join("\n"));
    assert.ok(!r.problems.some((p) => p.includes("D-ISO is missing")), r.problems.join("\n"));
  });

  test("an open trigger needs round 2 or step 5, and round 3 is refused", () => {
    const rounds = (rows) => `## Rounds\n\n| Round | Zones | Trigger | Status |\n| --- | --- | --- | --- |\n${rows}\n\n`;
    const open = check(rounds("| 2 | Z3b | a crash | open |") + GOOD, { root: repo() });
    assert.ok(open.problems.some((p) => p.includes("an open trigger")), open.problems.join("\n"));
    const step5 = check(rounds("| 2 | Z3b | a crash | open: step 5 |") + GOOD, { root: repo() });
    assert.ok(!step5.problems.some((p) => p.startsWith("Rounds")), step5.problems.join("\n"));
    const third = check(rounds("| 3 | Z3c | a crash | done |") + GOOD, { root: repo() });
    assert.ok(third.problems.some((p) => p.includes("more than one extra round")), third.problems.join("\n"));
  });

  test("an RCA with no Evidence section is refused", () => {
    const r = check(GOOD.replace(/## Evidence[\s\S]*?## Variant matrix/, "## Variant matrix"), { root: repo() });
    assert.ok(r.problems.some((p) => p.includes('"## Evidence" is missing')), r.problems.join("\n"));
  });
});

describe("Fix spec and JUnit parsing", () => {
  test("reads the tests of one list only", () => {
    const fix = "- **Regression tests:**\n  - `a.ts` › `one`\n  - `a.ts` › `two`\n- **Guard tests:** `b.ts` › `three`\n";
    assert.deepEqual(fixSpecTests(fix, /regression tests/i).map((t) => t.name), ["one", "two"]);
    assert.deepEqual(fixSpecTests(fix, /guard tests/i).map((t) => t.name), ["three"]);
  });

  test("reads Vitest and pytest names, failures and skips", () => {
    const xml = `<testsuite>
      <testcase classname="a.spec.ts" name="Drafts &gt; should keep &quot;es&quot; published" time="1"></testcase>
      <testcase classname="a.spec.ts" name="Drafts &gt; should draft all locales"><failure message="x"/></testcase>
      <testcase classname="tests.test_cart" name="test_total[EUR]"/>
      <testcase classname="tests.test_cart" name="test_skip"><skipped/></testcase>
    </testsuite>`;
    const cases = junitCases(xml);
    assert.equal(outcomeOf(cases, 'should keep "es" published'), "passed");
    assert.equal(outcomeOf(cases, "should draft all locales"), "failed");
    assert.equal(outcomeOf(cases, "test_total"), "passed");
    assert.equal(outcomeOf(cases, "test_skip"), "skipped");
    assert.equal(outcomeOf(cases, "test_absent"), "missing");
  });
});

describe("run", () => {
  const fakeRunner = (dir, body) => {
    const script = join(dir, "runner.sh");
    writeFileSync(script, `#!/bin/sh\ncat > "$1" <<'XML'\n${body}\nXML\n`, { mode: 0o755 });
    return `${script} {junit} {files}`;
  };
  const tests = {
    regression: [{ file: "tests/test_cart.py", name: "test_total_rounds_half_up" }],
    guard: [{ file: "tests/test_cart.py", name: "test_denied_user_cannot_see_total" }],
  };

  test("before the fix: the regression test fails and the guard passes", () => {
    const dir = repo();
    const cmd = fakeRunner(dir, '<testcase name="test_total_rounds_half_up"><failure/></testcase><testcase name="test_denied_user_cannot_see_total"/>');
    const r = runTests(tests, { cmd, phase: "before", root: dir });
    assert.deepEqual(r.problems, []);
  });

  test("before the fix: a regression test that passes is a problem", () => {
    const dir = repo();
    const cmd = fakeRunner(dir, '<testcase name="test_total_rounds_half_up"/><testcase name="test_denied_user_cannot_see_total"/>');
    const r = runTests(tests, { cmd, phase: "before", root: dir });
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /is passed; it must be failed before the fix/);
  });

  test("after the fix: a broken guard is a problem", () => {
    const dir = repo();
    const cmd = fakeRunner(dir, '<testcase name="test_total_rounds_half_up"/><testcase name="test_denied_user_cannot_see_total"><failure/></testcase>');
    const r = runTests(tests, { cmd, phase: "after", root: dir });
    assert.match(r.problems.join("\n"), /guard test "test_denied_user_cannot_see_total" is failed/);
  });

  test("a command that writes no report is a run error", () => {
    const r = runTests(tests, { cmd: "echo boom; exit 3 # {files} {junit}", phase: "before", root: repo() });
    assert.match(r.error, /no JUnit report \(exit 3\)/);
  });
});

describe("command line", () => {
  test("check gives exit 0 on a complete RCA and 1 on an open cell", () => {
    const dir = repo();
    writeFileSync(join(dir, "good.md"), GOOD);
    writeFileSync(join(dir, "open.md"), GOOD.replace("`test_bulk_total_rounds_half_up` |\n| Scope", "cut for time |\n| Scope"));
    assert.equal(spawnSync(process.execPath, [SCRIPT, "check", "good.md"], { cwd: dir }).status, 0);
    const open = spawnSync(process.execPath, [SCRIPT, "check", "open.md"], { cwd: dir, encoding: "utf8" });
    assert.equal(open.status, 1);
    assert.match(open.stdout, /stays "investigating"/);
  });

  test("run without {junit} is a usage error", () => {
    const dir = repo();
    writeFileSync(join(dir, "good.md"), GOOD);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "run", "good.md", "--cmd", "pytest {files}"], { cwd: dir }).status, 2);
  });
});
