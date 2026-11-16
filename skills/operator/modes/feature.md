# Feature mode

New or changed behaviour. The costly mistake here is to build the wrong thing well, so the interview is the
most important part.

## Interview: together, one question at a time

Ask one question in each message. Give **your recommended answer** and the reason, so that the user can reply
"yes" and continue. Ask only about what the user knows: the intent, the priorities, what "done" means, and what
must not change. Find all other answers yourself, in the code and in the spec (`## Docs layout`).

The spec wins over the code. Record each gap that you find between them in the decisions log (`## Docs layout`).
When older code is the reference for a rule, read it to learn the rule, not its structure. It can have defects;
the spec wins.

Cover these items before you stop:

- **The behaviour**, as a caller of the interface sees it (an API client, a user of the screen, a CLI user).
- **The business rules**, by their IDs if the spec has a rule catalogue. For each rule, agree how it is built:
  - as written, in the code;
  - behind a named setting with a default (agree the setting name and the default);
  - as typed configuration of a tenant or a customer, never as a branch on a name.
- **The acceptance tests**, as test names. Tag each test that covers a rule with its rule ID, if the project does
  this.
- **The interface and the permission.** Ask if the feature needs a new permission. A new permission is a
  decision of the user.
- **The data changes**: new tables, new columns, migrations.
- **The events and the jobs**: which events the change records, which jobs it enqueues, and on which queue.
- **What must not change.**

A design fork (two sensible designs) gets the same interview, also in a fast session (operator §9).

**Done when** you can write the spec below with no open question in it.

## Workflow

1. **Spec.** Write it in the conversation:
   - the behaviour;
   - the rule IDs and how each one is built, with the setting names and defaults;
   - the acceptance tests by name;
   - the interface: routes or commands, with their authentication and permission;
   - the tables and the migrations;
   - the events and the jobs;
   - the files that the change probably touches;
   - the constraints and the decisions already made.

   **Done when** the user says yes to this text.
2. **Plan the build.** One change in one area: one `shark:code-writer`. Work across modules or files: the round
   contract and the split (operator §6). Each lane gets a worktree, a test database and a migration number
   (operator §7).
3. **Build.** Send the spec, without changes, to `shark:code-writer` with the brief template
   (`references/brief-template.md`). Give the progress in one line. If the build needs a decision that the spec
   does not contain, the writer records it in its report. Do not let a shared decision pass without your check.
4. **Check the report of the writer** (brief template §4):
   - Each acceptance test is present and passes.
   - Each rule test has its rule tag.
   - Each decision in the report agrees with the spec, or you take it to the user.
   - You answer each open question before you send the work again.
5. **Review, only where the diff goes:**
   - The diff touches an item of `## Invariants`, for example tenant isolation, money, events, jobs,
     idempotency, permissions or raw SQL. Send the diff to `shark:invariant-guard` (read-only). It checks the
     diff against that list and the kit catalogue, and returns findings with a fix spec.
   - The diff changes a boundary, a layer or a module contract (`## Architecture rules`): send the question to
     `shark:architect`.
   - The diff makes a section of the spec or the handbook wrong: send it to `shark:doc-writer`.
   - The diff makes a cookbook chapter wrong: send it to `shark:cookbook-writer`.

   Send the findings to `shark:code-writer` as an addendum to the spec.
6. **Gate.** Run the gate after the last change, in the background: `gate:scoped <paths>`, or `gate:full` on the
   conditions of `## Test scope`. **Done when** it passes. Do not run the full gate again on a change that the
   scoped gate covers. A gate that can run longer than 10 minutes needs the owner's yes (`## Owner rules`).
7. **Commit** through `shark:commit-blocks` when the gate passes. Do not ask first. Ask before a push.
8. **Finish each worktree** (`references/parallel-builds.md` §5). After the merge into the main branch, run
   `gate:full` once.

## Reporting: decision level

- What works now, in the terms of the user, and the tests that prove it (with their rule IDs).
- The implementation decisions of the writer that the user can see differently.
- How a person sees the new behaviour: which rows, events, audit entries or log lines.
- The defects found and fixed during the work (operator §9), each with its regression test.
- What is left: paths not verified, items for later, files not committed.

## Register

A collaborator: propose, then ask. Short explanations are welcome, if they relate to this codebase.
