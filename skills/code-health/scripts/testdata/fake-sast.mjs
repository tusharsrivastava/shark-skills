// A stand-in for Opengrep in the unit tests: flags `execute(` calls whose SQL is built with `+` or an f-string.
import { readFileSync } from "node:fs";
const file = process.argv[2];
if (process.env.FAKE_SAST_CRASH) process.exit(5);
if (process.env.FAKE_SAST_SLEEP) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_SAST_SLEEP));
const results = [];
readFileSync(file, "utf8").split("\n").forEach((line, i) => {
  if (/execute\((f"|.*"\s*\+)/.test(line)) {
    results.push({
      ruleId: "shark.rules.sec-sql-string-concat",
      level: "error",
      message: { text: "SQL text built from a value at run time. Fix: use a bound parameter." },
      locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: i + 1 } } }],
    });
  }
});
process.stdout.write(JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "opengrep", rules: [] } }, results }] }));
