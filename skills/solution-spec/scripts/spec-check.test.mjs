import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkClosure } from "./spec-check.mjs";

const SCRIPT = fileURLToPath(new URL("./spec-check.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "spec-check-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const CLOSED = `# Spec: shared drafts

## Guards on the path

| # | Guard | Location | When it fires | The new behaviour when it fires | Test |
| --- | --- | --- | --- | --- | --- |
| G1 | \`_status\` field access | \`update.ts:210\` | the actor cannot update \`_status\` | writes no status | \`should keep every status when field access denies the status\` |

## Behaviour table

| # | Condition | Expected outcome | Test | Kind |
| --- | --- | --- | --- | --- |
| B1 | draft save, a shared field changes | every locale is draft | \`should mark every locale as draft\` | regression |
| B2 | only a localized child of a shared list changes | only that locale is draft | \`should keep the other locale published\` | guard |

## Decisions

| # | Question | Decision | Reason | Status |
| --- | --- | --- | --- | --- |
| D1 | locale all with localized changes only | unchanged locales stay published | the report asks it | taken by default, owner to confirm |

## Adversarial check

| Simplest patch | What it breaks | Row added |
| --- | --- | --- |
| draft all locales when a shared key is in data | B2 | B2 |

## Fix spec

- **Must not change:** B2 and G1.
`;

describe("checkClosure", () => {
  test("a closed spec has no open item", () => {
    const r = checkClosure(CLOSED);
    assert.deepEqual(r.problems, []);
    assert.equal(r.tests.length, 3);
  });

  test("a guard with no outcome is open", () => {
    const r = checkClosure(CLOSED.replace("| writes no status |", "| |"));
    assert.ok(r.problems.some((p) => p.startsWith("Guards on the path G1: no outcome")), r.problems.join("\n"));
  });

  test("a behaviour row with no test is open", () => {
    const r = checkClosure(CLOSED.replace("| `should keep the other locale published` | guard |", "| see code | guard |"));
    assert.ok(r.problems.some((p) => p.startsWith("Behaviour table B2: no test")), r.problems.join("\n"));
  });

  test("a decision left to the writer is open", () => {
    const r = checkClosure(CLOSED.replace("| unchanged locales stay published |", "| the writer decides |"));
    assert.ok(r.problems.some((p) => p.includes("left to the writer")), r.problems.join("\n"));
  });

  test("an empty decision is open", () => {
    const r = checkClosure(CLOSED.replace("| unchanged locales stay published |", "| TBD |"));
    assert.ok(r.problems.some((p) => p.startsWith("Decisions D1: no decision")), r.problems.join("\n"));
  });

  test("a must-not-change sentence with no test or row is open", () => {
    const r = checkClosure(CLOSED.replace("- **Must not change:** B2 and G1.", "- **Must not change:** the publish branch."));
    assert.ok(r.problems.some((p) => p.includes("has no test")), r.problems.join("\n"));
  });

  test("a missing section is open", () => {
    const r = checkClosure(CLOSED.replace(/## Adversarial check[\s\S]*?## Fix spec/, "## Fix spec"));
    assert.ok(r.problems.some((p) => p.includes('"## Adversarial check" is missing')), r.problems.join("\n"));
  });
});

describe("command line", () => {
  test("exit 0 on a closed spec and 1 on an open one", () => {
    writeFileSync(join(dir, "closed.md"), CLOSED);
    writeFileSync(join(dir, "open.md"), CLOSED.replace("| TBD |", "").replace("| unchanged locales stay published |", "| ? |"));
    assert.equal(spawnSync(process.execPath, [SCRIPT, join(dir, "closed.md")]).status, 0);
    assert.equal(spawnSync(process.execPath, [SCRIPT, join(dir, "open.md")]).status, 1);
  });
});
