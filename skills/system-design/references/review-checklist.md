# Design review checklist (expanded)

Use this list on a design, a spec or a diff. For each check, report **OK**, **ISSUE** (file:line, the smell or
lesson, one fix), or **N/A**. Examples use Python and TypeScript; the same checks apply to any stack. Project
values (layer names, permission list, banned SQL) come from `AGENTS.md` › `## Invariants` and
`## Architecture rules`.

Report format (one row per ISSUE):

| # | Check | File:line | Observed | Fix (refactoring or lesson) |
|---|---|---|---|---|

## Boundaries and dependencies

**1. One reason to change per module** (SRP; [solid.md](solid.md)).
Look for: one file edited by unrelated features in recent history (`git log --format= --name-only | sort | uniq -c`).
Fix: Extract Class / split the module by actor.

**2. Dependencies point inward** (DIP; lesson A1).
Bad (Python): `from sqlalchemy import Session` in `domain/pricing.py`.
Bad (TS): `import { PrismaClient } from "@prisma/client"` in `src/domain/pricing.ts`.
Fix: define a port in the application layer; move the import to an adapter.

**3. Facade-only calls between modules** (lesson A3).
Bad (Python): `from billing.infrastructure.repo import InvoiceRepo` in another module.
Bad (TS): `import { invoiceRepo } from "../billing/internal/repo"`.
Fix: call `billing.public` / `billing/index.ts`. Check: `import-linter` contracts; `dependency-cruiser` rules.

**4. Adapters wired in one place** (lesson A2).
Bad: `PaymentsClient(api_key=...)` built inside a use case. Good: the wiring module builds it at startup and
registers it; the use case receives the port (Python: a provider registry; TS: a composition root in `main.ts`).

**5. Presentation and infrastructure stay apart** (lesson A1).
Bad: an HTTP view that runs raw SQL; a repository that returns an HTTP response object.

## State and data

**6. Native types in state and events** (lesson B1).
Bad (Python): `event = {"total": f"₹{total:,}"}`. Good: `event = {"total": Money(2880000, "INR")}`, serialised as
`{"amount_minor": 2880000, "currency": "INR"}`.
Bad (TS): `status: "Confirmed ✅"`. Good: `status: BookingStatus.Confirmed`; the label comes from the view.

**7. No parsing of display text** (lesson B1).
Bad (Python): `re.search(r"[\d,]+", reply_text)` to recover a price.
Bad (TS): `parseFloat(label.replace(/[^\d.]/g, ""))`.
Fix: read the stored native value.

**8. Integer money, named rounding** (lesson B3).
Bad (Python): `price * 1.18` on a float; `round(x)` with no mode.
Good: `Money.multiply(rate, rounding=ROUND_HALF_EVEN)`.
Bad (TS): `amount: number` in rupees with decimals. Good: `amountMinor: bigint` or a decimal library with an
explicit rounding mode.

**9. Sortable unique keys** (lesson B4).
Bad: `id SERIAL` exposed in a URL. Good: UUIDv7 (Python: `uuid6.uuid7()`; TS: `uuidv7()` from a library).

**10. One typed reader per external shape** (lesson B2).
Bad: three call sites read `result["items"]` while the writer returns `{"batch": {"items": [...]}}`.
Good (Python): one `parse_batch(raw) -> Batch` (pydantic or dataclass) with a test on the real writer output.
Good (TS): one `BatchSchema.parse(raw)` (zod) with the same test.

## Rules and invariants

**11. One rule, one place** (lesson A4; smell Shotgun Surgery).
Look for: the same date, price or eligibility logic in two functions. Fix: Extract Method into the owner module;
callers use it.

**12. No customer-name branches** (lesson A4; smell Switch Statements).
Bad (Python): `if company.slug == "acme": fee = 0`. Bad (TS): `if (tenant.name === "Acme")`.
Bad (prompt): "For Acme, always offer a free upgrade." in a shared prompt.
Fix: a configuration field or spec rule read through a Strategy.

**13. Each invariant at one point** (lesson A4).
Look for: permission, isolation or rounding checks repeated in views. Fix: move the check to the router, the data
layer or the value type, and delete the copies.

**14. Tenant isolation at the data layer** (lesson B5).
Good (Postgres example): row-level security policy on each tenant table + index starting with the tenant key.
Good (document store example): tenant key in the partition key, enforced by the data-access layer.
Test: tenant A context reads zero rows of tenant B.

**15. Deny-by-default routes** (lesson C3).
Good (Python): `router.get("/bookings", auth=Member, permission="bookings.read")`.
Good (TS): `route.get("/bookings", requirePermission("bookings.read"), handler)`.
Test: walk the route table; fail on a route with no permission that is not on the public allow-list.

## Consistency and failure

**16. One unit of work for write + event + job** (lesson C1).
Bad (Python): `repo.save(order); session.commit(); broker.publish(evt)`.
Good: `with unit_of_work(tenant): repo.save(order); outbox.record(evt); jobs.enqueue(job)`.
Bad (TS): `await db.order.create(...); await sqs.send(...)`.
Good: `await db.$transaction([createOrder, insertOutboxRow])`; a relay sends the outbox rows.

**17. Idempotency keys on retried writes** (lesson C2).
Good: the handler stores `(key, status, body)` in the same transaction as the change and returns it on repeat.
Test: two identical requests → one change, two identical responses.

**18. Reads have no side effects** (Separate Query from Modifier; lesson C3).
Bad: a GET that updates `last_seen` or enqueues a job. Fix: move the write to a command, or to an async event.

**19. Pooler-safe SQL** (lesson C4).
Bad (Postgres example): `SET search_path`, `pg_advisory_lock`, `LISTEN` in request code behind a transaction pooler.
Good: `SET LOCAL` inside the transaction, `pg_advisory_xact_lock`, or a lease row.

**20. Explicit timeouts, retries, budgets** (lesson C5, E2).
Bad (Python): `requests.get(url)` with no timeout. Bad (TS): `fetch(url)` with no `AbortSignal.timeout(...)`.
Good: a timeout, a bounded retry with backoff, and an idempotency key on each retried write.

## Change and contracts

**21. Expand/contract; backfills as jobs** (lesson D1).
Bad: one migration that renames a column and updates all rows. Good: add column → dual-write → backfill job →
switch reads → drop old column in a later release.

**22. Pinned contracts between services** (lesson D2).
Good: `contracts/booking_event.schema.json` with its SHA-256 in both repositories; a gate step fails when the
hashes differ (Python: `hashlib.sha256`; TS: `crypto.createHash("sha256")`).

**23. Rebuild: port audit, then delete the old path** (lessons D3, D4).
Look for: a feature flag that keeps the old flow alive, or a test that freezes old output byte-for-byte.
Fix: port audit (`shark:port-audit`), port the gaps, delete the old code, compare by benchmark.

## Measurement

**24. Baseline before complexity** (lesson E1).
Look for: a new cache, index, model or service with no before-number. Fix: measure the baseline on fixed inputs,
state the target, keep the change only on a measured gain.

**25. Observability and cost** (lessons E2, E3).
Good (Python): structured log with `request_id`, `tenant_id`, `uow_id`; OpenTelemetry spans per external call.
Good (TS): the same fields through `pino` child loggers and OpenTelemetry.
Cost: price `cache_read` and `cache_write` tokens (or storage reads/writes) at their own rates; a test checks one
known usage record against the price table.
