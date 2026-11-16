# Review mode

A judgement on changes that exist. The value of this mode is findings that the user can trust and act on. One
false finding costs more trust than one missed small issue.

## Interview: minimal

Get two items. Ask only for what the request does not give, in one message:

- **Scope**: the diff to examine. Default: the working tree plus the commits since the main branch.
- **Depth**: a quick pass for correctness defects, or a full pass that also covers the standards and
  simplification. Default: full.

**Done when** the user or the defaults set both items.

## Workflow

1. **Standards and spec.** Examine the scope against:
   - `## Invariants` and `## Architecture rules` of `AGENTS.md`;
   - the code style chapter of the handbook, if the project has one (`## Docs layout`);
   - the spec, with the business rules by ID, and the original spec of the change if one exists.
2. **Specialists, only where the diff goes:**
   - The diff touches an item of `## Invariants` (data isolation, money, events, jobs, idempotency, routes,
     permissions, raw queries, migrations, secrets): `shark:invariant-guard`, with the scope of the review.
   - A design or boundary question that you cannot settle from the rules: `shark:architect`, with a complete
     brief.
   - A merge that nobody reviewed: `shark:merge-audit`.
   - A spec, handbook or cookbook section that the diff makes wrong: `shark:doc-writer`.
3. **Verify each finding** before you give it to the user. Read the code again at the line that you cite. State
   the failure: the inputs, the state, and the wrong result. If a finding has no failure scenario, remove it or
   mark it as a question.
4. **Fixes.** Fix a verified defect in local work as operator §9 says. Give a Fix spec to `shark:code-writer`, or
   go to debug mode first if the cause is not clear. Only report the findings about standards and
   simplification. Only report the findings on a branch or a pull request that is not checked out here. Fix
   them when the user asks.

## Reporting: findings only

Give the findings in order of severity, the most severe first. For each finding:

- `file:line`;
- one sentence that states the defect;
- the failure scenario;
- the direction of the fix.

Then, in one line, state what you examined and found correct. "No findings" is a complete report. A long review
goes to a Markdown file; give its absolute path.

## Register

Direct, and based on evidence. Each claim has a line reference. Do not praise the diff, and do not summarize
what it does.
