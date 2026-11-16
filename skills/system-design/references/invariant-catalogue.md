# Invariant catalogue (default, stack-neutral)

`shark:invariant-guard` uses this catalogue when the project's `AGENTS.md` (or `CLAUDE.md`) › `## Invariants` is
missing or thin. The project sections win: a project rule replaces the entry here that covers the same area.

Each entry has these parts:

- the **invariant**, as one testable sentence;
- the **failure** that it prevents;
- the **triggers**: what in a diff makes the entry apply;
- the **check**: what to verify, with evidence;
- the **stack examples**;
- the **usual severity** of a violation.

The index links each key to the lesson in this skill that explains why. The examples are labelled
by stack; they show the pattern to search for, not a rule of one stack. Project values (the permission list, the
banned SQL, the layer names) come from `AGENTS.md` › `## Invariants`, `## Architecture rules` and `## Secrets`.

Terms used in this catalogue:

- A **tenant** is one customer whose data must stay apart from the data of all other customers.
- A **unit of work** is one database transaction that holds a change and every record that the change implies.
- A **transactional outbox** is a table that receives each event in the same transaction as the change. A relay
  sends the rows to the broker after the commit.
- An **idempotency key** is a value that the caller sends with a request. A repeat with the same key returns the
  first result and makes no second change.
- A **connection pooler** in transaction mode gives a server connection to a client for one transaction only. The
  next transaction of the same client can get a different server connection.
- **Expand/contract** is a schema change in steps: add the new shape, move every reader and writer, then remove
  the old shape in a later release.

Severity scale (the agent uses the same scale):

| Severity | Meaning |
| --- | --- |
| BLOCKER | A concrete failure leaks data, gives a wrong amount, opens access, loses a write or an event, or exposes a secret. Fix before the merge. |
| MAJOR | A concrete failure needs a second condition (a retry, a concurrent request, a later caller, a new tenant), or the store does not enforce the rule. Fix before the merge, or the owner accepts it in writing. |
| MINOR | The code drifts from the rule, but no failure follows today. Fix in the same round, or record it. |
| OK-with-note | Checked and correct, with a note (a documented exception, a weak point to watch). |

## Index

| Key | Invariant | Usual severity | Lesson |
| --- | --- | --- | --- |
| `isolation` | Each query is scoped to one tenant, and the store enforces it. | BLOCKER | [B5](production-lessons.md#b5-tenant-isolation-at-the-data-layer) |
| `access` | Each route denies by default: authentication, membership, one permission. | BLOCKER | [C3](production-lessons.md#c3-deny-by-default) |
| `money` | Money is an integer in minor units (or a decimal type); each rounding names its mode. | BLOCKER | [B3](production-lessons.md#b3-integer-money-named-rounding) |
| `unit-of-work` | A write, its event and its job commit in one transaction; external calls come after the commit. | BLOCKER | [C1](production-lessons.md#c1-one-unit-of-work-for-write--event--job) |
| `idempotency` | Each external effect and each consumer is safe to run twice. | MAJOR | [C2](production-lessons.md#c2-idempotency-keys) |
| `pure-reads` | A read path does not write and does not enqueue. | MAJOR | [checklist 18](review-checklist.md#consistency-and-failure) |
| `keys` | Keys are unique, stable and sortable; no exposed sequences; tokens from a secure random source. | MAJOR | [B4](production-lessons.md#b4-sortable-unique-keys) |
| `pooler-safe-sql` | Application SQL keeps no session state; locks and settings are transaction-scoped. | BLOCKER | [C4](production-lessons.md#c4-pooler-safe-database-use) |
| `migrations` | Schema changes are expand/contract; data changes run as backfill jobs. | MAJOR | [D1](production-lessons.md#d1-expandcontract-migrations-data-changes-as-backfill-jobs) |
| `boundaries` | Only public facades cross modules; layers point one way. | MAJOR | [A1](production-lessons.md#a1-layers-with-one-dependency-direction), [A3](production-lessons.md#a3-facades-between-modules) |
| `secrets` | No secret in code, logs, responses or fixtures; only the config loader reads the environment. | BLOCKER | — (this file) |
| `personal-data` | No personal data in logs, error details or event payloads that do not need it. | MAJOR | — (this file) |
| `time` | Instants are stored in UTC; a zone is explicit at each edge; business dates are dates. | MAJOR | — (this file) |
| `typed-state` | State and events keep native types; no code parses display text. | MAJOR | [B1](production-lessons.md#b1-typed-state-text-only-at-the-presentation-edge) |
| `contracts` | Contracts between services are pinned and change on both sides together. | BLOCKER | [D2](production-lessons.md#d2-pinned-contracts-between-services) |
| `concurrency` | Shared state changes with a constraint, a lock or a lease, never check-then-act. | MAJOR | — (this file) |
| `errors` | A write path never swallows an error; each failure is recorded. | MAJOR | — (this file) |
| `config-not-branches` | Per-tenant behaviour is configuration, never a branch on a tenant name or ID. | MAJOR | [A4](production-lessons.md#a4-one-rule-one-place) |

## `isolation`: data isolation at the data layer

**Invariant.** Each read and each write of tenant data is scoped to one tenant, and the store enforces the scope.
Application filters alone are not enough.

**Failure.** A user of tenant A sends the ID of a row of tenant B and gets the row, because one query has no
tenant filter.

**Triggers.** A new or changed model, table, query, repository method, raw SQL string, index or migration. A
changed database role or grant. A job that reads data for more than one tenant.

**Check.**
1. Each new tenant table has the store-level guard of the project, in the migration that creates the table.
   Examples of a guard: a row policy, a partition key, a scoped connection.
2. Each query runs inside the tenant context of the project (a scoped session, a unit of work with the tenant ID).
3. Each lookup by ID also matches the tenant. An ID in a URL is not proof of ownership.
4. Each index on a tenant table starts with the tenant key, unless the project documents a global lookup.
5. No runtime role can bypass the guard: no table owner, superuser or bypass flag on a runtime connection.
6. A cross-tenant job gets only IDs and tenant keys from a narrow privileged function, then does each tenant's
   work in that tenant's context.

**Stack examples.**
- Store (Postgres example): `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on the table; a table owner
  bypasses the policy without `FORCE`; a role with `BYPASSRLS` bypasses it always.
- Store (document or key-value store example): the tenant key is the prefix of the partition key, and the data
  access layer adds it.
- Python (SQLAlchemy, Django ORM): `select(Order).where(Order.id == oid)` with no tenant term;
  `Order.objects.get(pk=oid)` outside the tenant context; `connection.cursor()` or `.raw()` in a view.
- TypeScript (Prisma, Knex): `prisma.order.findUnique({ where: { id } })` with no `tenantId`;
  `$queryRawUnsafe(...)`; `knex("orders").where({ id })`.
- Go (`database/sql`, sqlx): `db.QueryContext(ctx, "SELECT ... FROM orders WHERE id = $1", id)` on a pool that has
  no tenant scope.

**Usual severity.** BLOCKER. A missing store guard with correct application filters is MAJOR.

## `access`: deny by default

**Invariant.** Each route, handler or RPC method declares its authentication and exactly one permission. A route
with no declaration fails closed. The order is: no authentication → 401; no membership of the tenant → 404 (do
not show that the resource exists); no permission → 403.

**Failure.** A new handler goes live with no permission check. Or a handler returns 403 for a resource of another
tenant, and so confirms that the resource exists.

**Triggers.** A new or changed route table, router, controller, resolver, RPC service, middleware, permission
list, public allow-list or role grant.

**Check.**
1. Each new route has the project's guard and one permission name from the canonical list.
2. Each public route is on the project's public allow-list, with a reason.
3. An object-level check compares the object's tenant with the caller's tenant (no insecure direct object
   reference).
4. A new permission name is in the canonical list and has a role that grants it.
5. A test or a route walk fails on a route with no permission.

**Stack examples.**
- Python (FastAPI, Django): `@router.get("/orders")` with no `Depends(require_permission(...))`; a Django view
  with no permission decorator or mixin.
- TypeScript (Express, NestJS): `app.get("/orders", handler)` with no guard middleware; a controller method with no
  `@UseGuards(...)`.
- Go (chi, gin): a route registered outside the `r.Group(...)` that has the auth middleware.

**Usual severity.** BLOCKER.

## `money`: integer money, named rounding

**Invariant.** Money is an integer in minor units with its currency (or a decimal type with a fixed scale). Each
rounding call names its mode. A split sums to the whole.

**Failure.** `0.1 + 0.2` gives `0.30000000000000004`; an invoice line is one minor unit off; a split of 100 into
3 parts loses 1.

**Triggers.** A new or changed field, column, calculation, tax, discount, fee, currency conversion, split or
formatter that touches an amount.

**Check.**
1. No amount is a binary float in code, a column, an event or an API field.
2. Each rounding call names its mode (half-even, half-up, down) and the place where it rounds.
3. Each amount carries its currency; no arithmetic mixes two currencies.
4. An allocation gives the remainder to a named part, and a test checks the sum.

**Stack examples.**
- SQL: a `FLOAT`, `REAL` or `DOUBLE PRECISION` amount column. `NUMERIC(p, s)` or `BIGINT` minor units is correct.
- Python: `price * 1.18`; `round(x)` with no mode; `Decimal(...).quantize(q)` with no `rounding=`.
- TypeScript: `amount: number` with decimals; `toFixed(2)` as rounding; `Math.round(a * 100) / 100`.
- Go: `float64` amounts; `math.Round(x*100) / 100`.

**Usual severity.** BLOCKER for a wrong amount; MINOR for an unnamed mode whose result is correct today.

## `unit-of-work`: one transaction for write, event and job

**Invariant.** A write, the event that it records and the job that it enqueues commit in one transaction
(transactional outbox). A call to an external system runs after the commit, or in a job.

**Failure.** The write commits and the process stops before the publish: the event is lost. Or the publish runs
and the transaction rolls back: consumers act on a change that does not exist. An external call inside the
transaction holds locks for the length of a network call.

**Triggers.** A new or changed write next to a broker client, a job queue, an event publisher, an email or payment
client, or an HTTP client.

**Check.**
1. The event record and the job enqueue use the project's outbox or job port inside the same transaction as the
   write.
2. No broker publish, HTTP call or email send runs inside the transaction or before the commit.
3. An after-commit hook or a job does the external call, and that call is idempotent (see `idempotency`).

**Stack examples.**
- Python (SQLAlchemy, Django, Celery): `session.commit(); producer.send(evt)`; `task.delay()` inside
  `transaction.atomic()` (the worker can run before the commit) instead of `transaction.on_commit(...)` or an outbox
  row.
- TypeScript (Prisma, BullMQ, SQS): `await prisma.order.create(...); await queue.add(...)` outside
  `prisma.$transaction(...)`; `await sqs.send(...)` before the commit.
- Go (`database/sql`, Kafka): `tx.Commit()` then `producer.Produce(...)` with no outbox row; `http.Post(...)`
  between `db.BeginTx` and `tx.Commit()`.

**Usual severity.** BLOCKER for a lost or phantom event; MAJOR for an external call inside the transaction.

## `idempotency`: safe repeats of external effects

**Invariant.** Each external effect, job handler, event consumer and retried request is safe to run twice. A
repeat returns the first result and makes no second change. Delivery is at least once; the receiver deduplicates.

**Failure.** A client retries a payment after a timeout, and the customer pays twice. A consumer gets an event
again after a restart, and sends a second email.

**Triggers.** A new or changed POST/PUT handler with side effects, job handler, event subscriber, webhook
receiver or retry policy. A new call to a payment, email or message provider.

**Check.**
1. A retried write stores the idempotency key, the status and the response in the same transaction as the change.
2. A consumer records the event ID with a unique constraint before or with its change, in one transaction.
3. A job handler uses an upsert or a conditional update, so a second run changes nothing.
4. An outbound call to a provider sends a stable idempotency key that the provider supports.
5. A test sends the same request or event twice and checks one change and two equal responses.

**Stack examples.**
- Python (Celery, Kafka): `acks_late=True` with no dedupe table; a handler that does `INSERT` with no unique key.
- TypeScript (BullMQ, Stripe SDK): `queue.add(name, data)` with no `jobId`; `stripe.paymentIntents.create(...)`
  with no `idempotencyKey`.
- Go (Kafka, NATS): the consumer commits the offset before the change (at most once), or processes with no dedupe
  (duplicates).

**Usual severity.** MAJOR; BLOCKER for money or a message to a person.

## `pure-reads`: read paths have no side effects

**Invariant.** A GET handler, a query resolver or a read method does not write and does not enqueue a job.

**Failure.** A crawler or a prefetch changes state; a retry of a read makes a second change; a read replica route
fails on a write.

**Triggers.** A new or changed GET route, query resolver, read use case, or a "get or create" helper.

**Check.**
1. No insert, update, delete, job enqueue or event record in the read path, including the helpers that it calls.
2. A "last seen" or counter update moves to a command or to an asynchronous event.
3. If the project makes read paths read-only by mechanism (a read-only transaction, a guard that raises), the new
   code runs under it.

**Stack examples.**
- Python (Django, FastAPI): `get_or_create(...)` or `.save()` in a GET view; `task.delay()` in a GET view.
- TypeScript (Express, GraphQL): `prisma.user.update(...)` in `app.get(...)`; a `Query` resolver that mutates.
- Go (net/http): `db.ExecContext(...)` in a handler for `http.MethodGet`.

**Usual severity.** MAJOR.

## `keys`: stable unique keys

**Invariant.** Each new key is unique, never reused, and sortable by time (for example UUIDv7). A sequence is not
exposed where the project forbids it. A secret token comes from a secure random source.

**Failure.** A sequential ID in a URL lets a caller count and guess other rows. Two services make the same ID. A
deleted ID comes back for a new row. An attacker guesses a token from a weak generator.

**Triggers.** A new table, primary key, ID generator, public identifier, token, or URL with an ID.

**Check.**
1. A new primary key uses the project's ID generator.
2. No auto-increment or sequence ID appears in a URL, an event or an API response, if the project forbids it.
3. A token, a reset code or an API key uses a secure random source, never a general random generator.

**Stack examples.**
- SQL: `SERIAL`, `BIGSERIAL`, `AUTO_INCREMENT`, `nextval(...)` on a new table.
- Python: `AutoField` or `BigAutoField`; `uuid.uuid4()` as a key (not sortable: MINOR); `random.choice` for a
  token instead of `secrets.token_urlsafe`.
- TypeScript: `@default(autoincrement())` in a Prisma schema; `Math.random()` for a token instead of
  `crypto.randomBytes` or `crypto.randomUUID`.
- Go: `math/rand` for a token instead of `crypto/rand`.

**Usual severity.** MAJOR; BLOCKER for a weak token; MINOR for a key that is unique but not sortable.

## `pooler-safe-sql`: no session state behind a pooler

**Invariant.** Application SQL keeps no state on the server session: no session settings, session locks,
listeners, named prepared statements or session temporary tables. It uses the transaction-scoped forms. Only the
code paths that the project names (for example a leader lock) use a direct connection.

**Failure.** The pooler gives the next transaction a different server connection. A setting leaks into the
request of another tenant; a lock stays on a connection that nobody owns; a prepared statement is not found.

**Triggers.** Raw SQL, a driver option, a connection setup hook, a lock, a notification listener, a new direct
connection.

**Check.**
1. No session `SET`, session-level config call, session advisory lock, `LISTEN` or named `PREPARE` in application
   SQL.
2. A lock is transaction-scoped, or a lease row with an expiry.
3. A driver with a statement cache is set for the pooler mode, if the project uses one.
4. Only the paths that `AGENTS.md` names open a direct connection.

**Stack examples.**
- Postgres behind PgBouncer (example): `SET search_path`, `set_config(..., false)`, `pg_advisory_lock(...)`,
  `LISTEN`; correct forms are `SET LOCAL`, `set_config(..., true)`, `pg_advisory_xact_lock(...)`.
- MySQL behind ProxySQL (example): `SET @var`, `GET_LOCK(...)`, `LOCK TABLES`, temporary tables.
- Python (psycopg 3, asyncpg): `prepare_threshold` not set to `None`; `statement_cache_size` not set to `0`, where
  the pooler does not support prepared statements.
- TypeScript (`pg`): a query object with a `name:` (a named prepared statement).
- Go (pgx): the default extended protocol with a statement cache, where the pooler needs the simple protocol.

**Usual severity.** BLOCKER for a setting or a lock that can leak; MAJOR for a driver option.

## `migrations`: expand/contract, data in backfill jobs

**Invariant.** A schema change is backward compatible with the code that runs during the deploy. A rename or a
drop comes in a later release, after every reader moved. A data change runs as a backfill job, not in a migration.

**Failure.** The old code reads a column that the migration dropped; a migration that updates every row locks a
large table and the deploy times out.

**Triggers.** A new or changed migration file, schema file, ORM model field, or `NOT NULL` constraint.

**Check.**
1. No drop or rename of a column, table or enum value that the current release still reads.
2. A new `NOT NULL` column has a default, or comes after a backfill.
3. No row update, delete or copy loop in a migration; it is a backfill job (batched, resumable, idempotent).
4. A new index on a large table uses the non-locking form of the store, if the project needs it.
5. An edit of an applied migration happens only if `AGENTS.md` allows it (for example before the first deploy).

**Stack examples.**
- Python (Alembic, Django): `op.alter_column(..., new_column_name=...)`, `RenameField`, `RunPython` that updates
  all rows.
- TypeScript (Prisma, Knex): `ALTER TABLE ... RENAME COLUMN` in a generated migration; `knex("t").update(...)` in
  `up()`.
- Go (goose, golang-migrate): an `.sql` file with `UPDATE ... SET` over the whole table; `CREATE INDEX` with no
  `CONCURRENTLY` (Postgres example).

**Usual severity.** MAJOR; BLOCKER for a drop that the running code reads.

## `boundaries`: module boundaries and layer direction

**Invariant.** A module calls another module only through its public facade, in the allowed direction. The layers
of a module point one way. The domain imports no framework, database or network code.

**Failure.** A change inside one module breaks another module that imported an internal file; a database detail
leaks into a business rule.

**Triggers.** A new or changed import between modules or layers, a new module, a change to the allowed-dependency
table or to the import contracts.

**Check.** Use [review-checklist.md](review-checklist.md) checks 2 to 5 on each changed import. In addition:
1. The import-contract configuration did not get weaker in the diff (a removed contract, a new ignore line).
2. A new module is in the allowed-dependency table of `AGENTS.md` › `## Architecture rules`.

**Stack examples.**
- Python (import-linter): `from billing.infrastructure.repo import ...` in another module; an `ignore_imports`
  line added to the contracts.
- TypeScript (dependency-cruiser, ESLint): `import ... from "../billing/internal/repo"`; an
  `eslint-disable no-restricted-imports` comment.
- Go: an import of another module's adapter package from a domain package. The compiler blocks only `internal/`
  paths, so other packages need a lint rule.

**Usual severity.** MAJOR; MINOR for a correct call through a facade that the table does not list yet.

## `secrets`: secrets stay out of code, logs and responses

**Invariant.** No secret is in code, a fixture, a log, an error response or an event. Only the config loader reads
the environment or a secret store. Env files are never committed and never read by other code paths.

**Failure.** A key stays in the version history for ever. A stack trace in a response shows a connection string.
A log line carries a bearer token to a log vendor.

**Triggers.** Any diff. Look closely at config files, tests, fixtures, logger calls, error handlers and HTTP
client setup. Also look at added files with names like `.env`, `*.pem`, `*.key`, `credentials*`.

**Check.**
1. No secret-shaped literal: a provider key prefix, a private key header, a password in a URL, a long random
   string in a fixture.
2. No secret file in the diff. List such a file by its path only; never print its content.
3. No log or error detail that holds a header, a token, a password, a cookie or a connection string.
4. No read of the environment outside the config loader.
5. An error response to a client has no stack trace and no internal detail.

**Stack examples.**
- Any stack: literals that start with `sk_live_`, `AKIA`, `ghp_`, `xoxb-`, or `-----BEGIN ... PRIVATE KEY-----`.
  A secret scanner (for example gitleaks or trufflehog) finds more.
- Python: `os.environ[...]` or `os.getenv(...)` outside the settings module; `logger.info("headers %s",
  request.headers)`.
- TypeScript: `process.env.X` outside the config module; `console.log(req.headers)`.
- Go: `os.Getenv(...)` outside the config package; `log.Printf("%+v", req)`.

**Usual severity.** BLOCKER.

## `personal-data`: no personal data in logs

**Invariant.** Logs, metrics labels, traces and error details carry IDs, not personal data. An event payload
carries personal data only when its consumer needs it.

**Failure.** Names, phone numbers, email addresses or message texts go to a log vendor that is not approved for
them. A deletion request cannot reach them there.

**Triggers.** A new or changed logger call, trace attribute, metric label, error message, analytics call or event
payload.

**Check.**
1. A log call names the record by its ID, not by the person's name, email, phone, address or message text.
2. No log call writes a whole object (a user, a request body, a message) that can hold personal data.
3. A new event field with personal data has a consumer that needs it.

**Stack examples.**
- Python: `logger.info(f"sent to {user.email}")`; `logger.debug("payload %s", body)`.
- TypeScript: `logger.info({ user })`; `console.log(message)`.
- Go: `slog.Any("user", u)`; `log.Printf("%+v", msg)`.

**Usual severity.** MAJOR.

## `time`: UTC inside, explicit zones at the edge

**Invariant.** An instant is stored and compared in UTC with a zone-aware type. A zone is explicit where the
system reads or shows time. A business date (a check-in day, a due date) is a date, not an instant.

**Failure.** A server in another zone moves a booking by one day. A daylight saving change runs a job twice, or not
at all. A naive time compares wrong with an aware time.

**Triggers.** New or changed code that reads the clock, parses or formats a time, computes a date, or schedules a
job; a new time column.

**Check.**
1. Each clock read is zone-aware UTC, or goes through the project's clock port (so tests can fix the time).
2. Each parse of a time string needs an offset or names the zone.
3. A business date comes from the instant and the tenant's or the user's zone, by name.
4. A time column is zone-aware where the store supports it.

**Stack examples.**
- SQL: `timestamp without time zone` for an instant (Postgres example; `timestamptz` is correct).
- Python: `datetime.now()` or `datetime.utcnow()` (naive); `date.today()` for a tenant's business date.
- TypeScript: `new Date().getHours()` (local zone); `new Date("2026-03-01")` read as a local date.
- Go: `time.Now().Local()` in business logic; `time.Parse` with no zone, which gives UTC by assumption.

**Usual severity.** MAJOR; MINOR for a naive read that is converted at once.

## `typed-state`: native types, no parse of display text

**Invariant.** State, events, messages and stored results keep native types (money, dates, enums, numbers). Text
is made only at the presentation edge. No code parses display text that the system made.

**Failure.** A parser fails on a new currency sign, locale or thousands separator, and a price or a date becomes
wrong or empty.

**Triggers.** A new or changed event field, stored result, tool result, formatter, regex over output, or prompt
that carries values.

**Check.** Use [review-checklist.md](review-checklist.md) checks 6, 7 and 10 on each changed shape.

**Stack examples.**
- Python: `re.search(r"[\d,]+", reply_text)` to get a price back; `event["total"] = f"{total:,}"`.
- TypeScript: `parseFloat(label.replace(/[^\d.]/g, ""))`; `status: "Confirmed"` as free text instead of an enum.
- Go: `strconv.ParseFloat(strings.TrimLeft(text, "$"), 64)` on a label that the system formatted.

**Usual severity.** MAJOR.

## `contracts`: pinned contracts between services

**Invariant.** A contract between services (an event schema, an API schema, a protobuf, a shared type) is pinned
by version or hash. A change updates both sides together, byte-identical, and an incompatible change follows
expand/contract.

**Failure.** One service renames a field; the other service reads an empty value, with no error, until a customer
reports it.

**Triggers.** A changed schema file, protobuf, OpenAPI document, event payload class, serializer or JSON field name.

**Check.**
1. The pin (version, hash, generated file) changed with the schema, and the gate compares it.
2. The other side of the contract has the same change, or the change is additive.
3. No field is removed, renamed or retyped without expand/contract.
4. Protobuf: no field number is reused or changed.

**Stack examples.**
- Python (pydantic, dataclasses): a renamed field on an event model with no alias for old payloads.
- TypeScript (zod, OpenAPI): a schema change with no regenerated client or no hash update.
- Go (encoding/json, protobuf): a changed `json:"..."` tag; a renumbered protobuf field.

**Usual severity.** BLOCKER for a silent break of the other side; MAJOR for a missing pin.

## `concurrency`: constraints, locks and leases, not check-then-act

**Invariant.** A change to shared state uses a unique constraint with an upsert, a conditional update, a row lock,
a transaction-scoped lock or a lease row. It never reads, decides in application code, then writes.

**Failure.** Two requests both see "no booking yet" and both insert; two workers both run a job that must run once;
a counter loses an increment.

**Triggers.** A new "if not exists, then create", a counter, a status change, a scheduler or a singleton job, a
process-local lock.

**Check.**
1. Each uniqueness rule has a unique constraint in the store, not only a check in code.
2. Each read-modify-write is one statement, a row lock, or a compare-and-set on a version column.
3. A process-local lock does not guard state that other processes or instances share.
4. A lease has an expiry and an owner, and the holder checks it before each write.

**Stack examples.**
- Python (Django, SQLAlchemy): `if not Model.objects.filter(...).exists(): Model.objects.create(...)` with no
  unique constraint; `obj.count += 1; obj.save()`.
- TypeScript (Prisma): `findFirst(...)` then `create(...)` instead of `upsert(...)`; an in-memory `Map` as a lock
  in a service with more than one instance.
- Go: `sync.Mutex` that guards database state across instances; `SELECT` then `UPDATE` with no `FOR UPDATE`.

**Usual severity.** MAJOR; BLOCKER for money or a duplicate external effect.

## `errors`: no swallowed failures on write paths

**Invariant.** A write path never swallows an error. Each failure is recorded (a status, a log event with the ID,
a metric, a dead-letter row) and either propagates or has a bounded retry.

**Failure.** A payment write fails, the code continues, and the user sees "done". A job fails with no trace, and
nobody knows that the data is incomplete.

**Triggers.** A new or changed `try`/`catch`, error return, retry wrapper, background task, or promise chain.

**Check.**
1. No empty handler and no broad handler that only logs and continues on a write path.
2. Each error return on a write path is checked.
3. Each retry has a limit, a backoff, and a final failure record.
4. Each asynchronous call is awaited or has an error handler.

**Stack examples.**
- Python: `except Exception: pass`; `except Exception as e: logger.warning(e)` and continue after a failed write.
- TypeScript: `.catch(() => {})`; an empty `catch {}`; a call to an async function with no `await` (a floating
  promise).
- Go: `_ = tx.Commit()`; `res, _ := db.ExecContext(...)`; an `err` that is set and never read.

**Usual severity.** MAJOR; BLOCKER when the swallowed error hides a lost write or a lost payment.

## `config-not-branches`: per-tenant behaviour is configuration

**Invariant.** Per-tenant or per-customer behaviour is a setting, a feature flag or a spec rule. Shared code and
shared prompts never branch on a tenant name, slug or ID.

**Failure.** A rule for one customer leaks to other customers, and each change for that customer needs a code
change and a deploy.

**Triggers.** A new comparison with a tenant attribute, a customer name in code, a test fixture or a shared prompt.

**Check.** Use [production-lessons.md](production-lessons.md) A4 and [review-checklist.md](review-checklist.md)
check 12 on each changed line.

**Stack examples.**
- Python: `if tenant.slug == "...":`.
- TypeScript: `if (tenant.name === "...")`.
- Go: `switch tenant.ID { case "...": }`.

**Usual severity.** MAJOR.
