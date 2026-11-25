// A stand-in for `lizard --csv` in the unit tests: Python `def` blocks, CCN = 1 + branch keywords in the body.
import { readFileSync } from "node:fs";
const file = process.argv[2];
const lines = readFileSync(file, "utf8").split("\n");
const out = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)def\s+(\w+)\(([^)]*)\)/);
  if (!m) continue;
  let end = i;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() && lines[j].match(/^\s*/)[0].length <= m[1].length) break;
    if (lines[j].trim()) end = j;
  }
  const body = lines.slice(i, end + 1).join("\n");
  const ccn = 1 + (body.match(/\b(if|elif|for|while|and|or|except)\b/g) ?? []).length;
  const params = m[3].split(",").filter((s) => s.trim()).length;
  const nloc = lines.slice(i, end + 1).filter((l) => l.trim()).length;
  out.push(`${nloc},${ccn},10,${params},${end - i + 1},"${m[2]}@${i + 1}-${end + 1}@${file}","${file}","${m[2]}","${m[2]}( )",${i + 1},${end + 1}`);
}
process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
