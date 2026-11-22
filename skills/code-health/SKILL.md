---
name: code-health
description: New security, complexity and architecture findings while you write code - how to read a code-health digest after an edit, fix it or accept it on purpose, and run the check for a diff. Use with shark:code-authoring when you write or correct code in a project whose AGENTS.md has analyze rows.
---

# Code health

A project that opts in names its analyzers in AGENTS.md (`## Commands`: `analyze:file`, `analyze:diff`,
`arch:check`, `analyze:full`) and its limits in `## Quality budgets`. Shark runs them and shows you only what is
**new**: a finding that is not in the committed baseline, not allowed on purpose, and not in the file at the commit
where your session started. Old debt never shows. AGENTS.md wins over a rule here.

## 1. After each edit: the digest

The shark hook `health-edit` runs `analyze:file` on each source file that you change (Edit, Write, or a Bash command
that changes a file). It prints nothing when nothing is new. When something is new, you get a digest. With
`hook.edit: async` (the default) the check runs in the background and the digest reaches you as hook feedback, at
the latest when you try to stop; with `on` it reaches you before your next step.

```text
code-health: 2 new in src/billing/invoice.py (budget: ccn 10)
1. ERROR sec/sql-string-concat  L42  SQL text built from a value at run time ...
   Fix: use a bound parameter, for example execute("... WHERE id = ?", (value,)).
   id: 3f9c0a12b4de
2. WARN  cx/ccn  L60  `apply_discounts` ccn 9 -> 14 (budget 10).
   Fix: see complexity-playbook.md (guard clauses, extract function, table-driven rules).
   id: 8a71c3e09f42
+0 more. Not verified: none.
```

Treat a digest like a failing test:

1. **Fix it in your next step.** An `ERROR` is a defect that you made. Fix the code, not the rule. The fix hint
   names the safe form. For complexity, use [references/complexity-playbook.md](references/complexity-playbook.md).
2. **Or accept it on purpose**, only when the finding is a false positive or the brief asks for this exact code:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/code-health/scripts/health.mjs" baseline allow <id> --reason "<why>" [--lane <lane name>]
   ```

   A lane always gives `--lane`: lanes never write `.shark/health-baseline.json`. The lead folds lane entries into
   the baseline at merge, and lists each one in the merge log. "It was faster" is not a reason.
3. **A layer violation (`arch/...`) is a shared decision.** Do not change the architecture rule and do not allow
   it. Return it to your caller with the import that you need and why.

A digest about a line that you did not change is still yours when your change caused it (for example, a function
that crossed the complexity budget because you added a branch).

`code-health: not verified (...)` means that an analyzer is missing, crashed or timed out. Continue, and write
"code-health: not verified" with the reason in your report. Never report the code as checked.

## 2. Before you report: the diff check

Run the check for all your changes, once, before your report:

```bash
node "${CLAUDE_PLUGIN_ROOT:-<directory of this skill>/../..}/skills/code-health/scripts/health.mjs" diff --base <the commit where your work started>
```

Exit 0: nothing new. Exit 1: the digest lists what is new; fix it or allow it as above. Exit 3: the project has no
analyze row (say "code-health: not configured"). Exit 4: an analyzer failed (say "code-health: not verified").
Your report has one line: `Code health: <n> new, <n> allowed (ids and reasons), not verified: <items or none>`.

## 3. Commands

| Command | Does |
| --- | --- |
| `health.mjs file <path> [--base <ref>]` | New findings of one file (what the hook runs). |
| `health.mjs diff [--base <ref>]` | New findings of all changed files, plus `arch:check`. |
| `health.mjs baseline record` | Records the committed baseline (`.shark/health-baseline.json`) from the current code. |
| `health.mjs baseline compare [--base <ref>]` | New, worsened and fixed findings. |
| `health.mjs baseline allow <id> --reason <text> [--lane <name>]` | Accepts one finding on purpose. |
| `health.mjs baseline fold` | Moves the lane allow files into the baseline (the lead, at merge). |
| `health.mjs sarif --out <file> [--only sec,arch,cx]` | Merged SARIF for CI, GitHub code scanning or SonarQube. |

Exit codes: 0 clean, 1 new findings, 2 usage error, 3 a command row is missing in AGENTS.md, 4 an analyzer crashed
or timed out.

## 4. Set it up in a project

Add the rows to AGENTS.md › Commands, and copy the starter rules of this skill (`rules/`) to `.shark/rules/`:

| Key | Example (Python and TS) |
| --- | --- |
| `analyze:file` | `opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output={out} {file}` and `lizard --csv {file}` |
| `analyze:diff` | none (shark runs `analyze:file` on each changed file) |
| `analyze:full` | `opengrep scan --quiet --disable-version-check -f .shark/rules --sarif-output={out} .` and `lizard --csv .` |

- Install Opengrep from its signed GitHub release binary, never from PyPI (a malicious package uses the name). Keep
  `--disable-version-check`. Do not use `--experimental`: in 1.33.1 it found nothing on the starter rules.
- One Opengrep 1.x scan of one file takes about 2 s, mostly start-up (p95 2.2 to 2.3 s, measured 2026-11-21). Shark
  scans the file and its base version in parallel. Because this is over the 2 s target, `hook.edit` is `async` by
  default; set `on` to get each digest before the next step, at about 2 s for each edit.
- Use `lizard --csv`: the XML format has no end line and no parameter count.
- Write your own rules ([references/rule-authoring.md](references/rule-authoring.md)). Never copy rules from the
  Semgrep registry: their license does not allow distribution.
- Commit `.shark/health-baseline.json` after `baseline record`. A project with no baseline still works: shark then
  compares each file with its content at the start of the session.

The digest format and its limits are in [references/digest-format.md](references/digest-format.md).
