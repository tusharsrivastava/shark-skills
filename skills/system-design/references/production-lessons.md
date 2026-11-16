# Production lessons

Rules that production systems need. Some come from public sources (linked); others come from our own rebuilds,
where each one cost real rework. Each lesson gives the **rule**, **why** (the failure that it prevents) and
**check** (how a review or a test proves it). Project values (the exact layers, the invariants, the commands) come
from the project's `AGENTS.md` › `## Invariants` and `## Architecture rules`.

## A. Structure

### A1. Layers with one dependency direction
**Rule.** Order the layers of each module, for example: public facade > presentation | infrastructure >
application > ports > domain. A layer imports only layers below it. Presentation and infrastructure never import
each other. The domain imports only the standard library and shared value types.
**Why.** Without a direction, a database detail leaks into a business rule, and a vendor change edits the domain.
**Check.** An import-contract tool in the gate (Python: `import-linter`; JS/TS: `dependency-cruiser`;
Java: `ArchUnit`).

### A2. Ports and adapters, wired in one place
**Rule.** The application defines ports (interfaces). Infrastructure implements them as adapters. One wiring
place per module builds the adapters and registers them at startup.
**Why.** Scattered construction hides which adapter runs; tests need the real network or database.
**Check.** Every port has a fake and a real adapter that pass the same contract tests. A smoke test proves that
each module's adapters are wired at startup.
**Source.** Alistair Cockburn, <https://alistair.cockburn.us/hexagonal-architecture/>.

### A3. Facades between modules
**Rule.** A module calls another module only through its facade. Keep a table of the allowed calls between
modules, and check it in the gate.
**Why.** Calls into internals make every refactor a cross-module change (Inappropriate Intimacy).
**Check.** Import contracts; a review flags any import of a non-facade path of another module.

### A4. One rule, one place
**Rule.** Each business rule lives in one function or one configuration row. Per-customer or per-tenant
behaviour is configuration or a spec, never a branch on a name in shared code or in a shared prompt.
**Why.** The same rule in two call sites drifts: one site gets a fix, the other does not. A rule tied to one
customer's name in shared code makes each tuning a code change and a deploy, and it leaks into other customers.
**Check.** Search for name checks (`if tenant ==`, `slug ==`, a customer name in a prompt). For each rule in the
spec, find exactly one owner in the code. A tenant change must be a configuration-only diff.

### A5. Design terms name real structures
**Rule.** Before you build on a design term ("context graph", "event log", "projection"), find the structure in
the code that it names.
**Why.** A term mapped to a different structure (for example, a "history" that is only a snapshot of current
facts) hides the gap; many symptom fixes follow, and none fixes the cause.
**Check.** The design document gives file:line for each term, or marks it "to build".

## B. Data and state

### B1. Typed state; text only at the presentation edge
**Rule.** State, events, messages, stored results and service calls keep native types (money, dates, enums,
numbers). Make text only at the presentation edge (the user interface, a message to a person, a model prompt).
Never parse display text back into data.
**Why.** Once a value is only text, every reader must parse it, and each parser fails on a new format
(currency signs, locales, thousands separators). One missing typed field causes many data defects.
**Check.** Flag code that formats a domain value into a stored field, and any regex over money, dates or ids of
text that the system made. Tests compare formatted output with the formatter of the native value.

### B2. One typed reader per external shape
**Rule.** Each external or tool result has one typed reader. A contract test runs the reader against the real
writer's output.
**Why.** Readers that each guess the nesting fail silently when the shape differs (a field nested one level
deeper reads as empty). Each reader passes its own tests.
**Check.** Search for direct key access into the same payload in more than one place.

### B3. Integer money, named rounding
**Rule.** Money is an integer in minor units (or an exact decimal type) with its currency. Never use binary
floating point. Every rounding call names its mode (half-even, half-up, down).
**Why.** Floats lose cents; unnamed rounding gives totals that differ between services.
**Check.** Type check: no float in money fields. Search rounding calls for a mode argument.
**Source.** Martin Fowler, Money pattern: <https://martinfowler.com/eaaCatalog/money.html>.

### B4. Sortable unique keys
**Rule.** Use globally unique, time-ordered keys (for example UUIDv7, ULID). Do not use database sequences as
keys that leave the service.
**Why.** Sequences leak counts, collide when you merge data, and need a round trip to create. Random UUIDs
fragment indexes.
**Check.** Schema review. **Source.** RFC 9562 (UUID version 7): <https://www.rfc-editor.org/rfc/rfc9562>.

### B5. Tenant isolation at the data layer
**Rule.** Enforce tenant isolation where the data lives (row-level security, a tenant key in each index, a
tenant-scoped connection), and open tenant data only inside a tenant-scoped unit of work. Cross-tenant sweeps go
through one audited function that returns ids and tenant keys; the handler then runs once per tenant.
**Why.** An application filter that one query forgets leaks data of another tenant.
**Check.** A test reads with tenant A's context and expects zero rows of tenant B, for each tenant table.
Example: PostgreSQL row security <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>.

## C. Consistency and failure

### C1. One unit of work for write + event + job
**Rule.** A state change, the events that it records, and the jobs that it enqueues commit in one transaction.
A relay sends the events after the commit (transactional outbox).
**Why.** A write that commits while its event fails (or the reverse) leaves other modules out of step for good.
**Check.** Search for event or queue calls outside the unit of work. A test rolls back and expects no event.
**Source.** <https://microservices.io/patterns/data/transactional-outbox.html>;
<https://martinfowler.com/eaaCatalog/unitOfWork.html>.

### C2. Idempotency keys
**Rule.** Each retried or client-repeated write carries an idempotency key. The server stores the first result in
the same unit of work as the change, and returns it again for a repeat.
**Why.** Networks retry; without a key, a retry charges twice or books twice.
**Check.** A test sends the same request twice and expects one change and two identical responses.
**Source.** Stripe, <https://stripe.com/blog/idempotency>; IETF draft "The Idempotency-Key HTTP Header Field",
<https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>.

### C3. Deny by default
**Rule.** Every route declares its authentication and one named permission from a canonical list. The router
checks membership (none → not found), then the permission (→ forbidden), then runs the view in the tenant
context. Public routes are listed in one allow-list file. Read routes cannot write or enqueue.
**Why.** A route that forgets a check is open. A read with a side effect breaks caching and retries.
**Check.** A test walks all routes and fails on a route with no permission that is not in the allow-list.

### C4. Pooler-safe database use
**Rule.** With a transaction-mode connection pooler, application SQL holds no session state: no session
settings, session locks, sequences by session, listeners or prepared statements by name. Use transaction-scoped
locks or a lease row. Only a few named processes use a direct connection.
**Why.** Session state pins or leaks across clients that share one server connection.
**Check.** A static test greps application SQL for the banned statements. Example: PgBouncer feature table,
<https://www.pgbouncer.org/features.html>.

### C5. Accuracy before speed
**Rule.** Judge each speed lever by its effect on accuracy first. Overlap, caching and transport are allowed. A
shorter wait that drops results, a cheaper model or a lower effort for a step whose output later steps keep, is
allowed only after a measured A/B shows no accuracy loss.
**Why.** A wrong stored result compounds: every later step builds on it.
**Check.** Each speed change cites its accuracy measurement.

## D. Change

### D1. Expand/contract migrations; data changes as backfill jobs
**Rule.** A schema change is expand (add, nullable or with default), migrate callers, then contract (remove).
Data changes run as resumable backfill jobs, not in schema migrations.
**Why.** A destructive migration breaks the running old version during a rolling deploy; a long data update in
a migration locks tables and cannot resume.
**Check.** Review each migration: no drop or rename of a column that the previous release reads.
**Source.** <https://martinfowler.com/bliki/ParallelChange.html>.

### D2. Pinned contracts between services
**Rule.** A contract between services (schema, prompt, enum list, event shape) has a version or a content hash
that both sides pin. A change updates both sides byte-identical in the same release plan, and a check compares
the hashes.
**Why.** Two copies of a contract drift; each side passes its own tests and the integration fails in production.
**Check.** A gate step computes the hash of each side's copy and fails on a difference.
**Source.** Consumer-driven contracts, <https://martinfowler.com/articles/consumerDrivenContracts.html>.

### D3. A rewrite loses rules: port audit first
**Rule.** Before a rebuild replaces the production code, audit the deleting commits against the production
branch. Give each deleted rule a row: ported, gap, removed on purpose, or unsure (`shark:port-audit`).
**Why.** Rules hidden in old code (an edge case, a guard, a default) vanish, each one passes the new tests, and
users find them one at a time.
**Check.** The audit table exists, and every gap has a patch unit or an owner decision.

### D4. No parallel old path after a rebuild
**Rule.** A rebuild replaces code. Do not keep the old path alive behind a switch, and do not freeze it with a
byte-for-byte test. The branch and the release rollback are the safety. Count progress by what you removed.
**Why.** With both paths alive, every lane does the work twice, the old logic keeps acting, and the integration
breaks.
**Check.** The plan has removal steps with counts. Compare old and new by measurement (a benchmark on the main
branch), not by a shadow run.

### D5. Design with the math first, then one file per task
**Rule.** For a core change: write the spec with symbols, formulas, invariants and measured numbers, and a
boundary table; then a file plan with the interface of each file; then build the files in parallel, one task per
file; then validate (lint, types, code-to-spec review, unit tests), merge, integrate in a timebox, and measure last.
**Why.** Symptom-by-symptom fix lanes repeat work; most of the analysis belongs before code.
**Check.** The design document has the math and the file plan before the build starts.

## E. Measurement and observability

### E1. Evaluation first
**Rule.** Measure a baseline before you add complexity (embeddings, a cache, a second model, a new service).
Keep the change only if it beats the baseline on the named metric.
**Why.** Complexity without a baseline cannot show a gain, and it stays forever.
**Check.** The design cites the baseline number and the target.

### E2. Signals that name the work
**Rule.** Logs, metrics and traces carry the request id, the tenant, and the unit of work. Track the four golden
signals: latency, traffic, errors, saturation.
**Why.** Without correlation ids, one failure across services takes hours to follow.
**Check.** One request id joins the log lines of every service that it touches.
**Source.** Google SRE book, <https://sre.google/sre-book/monitoring-distributed-systems/>; OpenTelemetry signals,
<https://opentelemetry.io/docs/concepts/signals/>.

### E3. Cost accounting prices cache reads and writes
**Rule.** A cost model for metered services (for example model tokens, cloud storage) prices each line item
separately: input, output, cache writes and cache reads, at their own rates.
**Why.** A model that prices all input at one rate reports only an upper bound, and cache wins or losses stay
hidden.
**Check.** A unit test computes the cost of a known usage record with cache lines and matches the price table.
