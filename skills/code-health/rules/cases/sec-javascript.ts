// Rule tests for sec-javascript.yaml: `opengrep scan --test -f skills/code-health/rules/sec-javascript.yaml skills/code-health/rules/cases/`
// (not in CI: the runner has no Opengrep). A `ruleid:` line must match the rule below it; an `ok:` line must not.

async function find(db: any, id: string) {
  // ruleid: sec-sql-string-concat
  await db.query("SELECT * FROM c WHERE id = " + id);
  // ruleid: sec-sql-string-concat
  await db.execute(`SELECT * FROM c WHERE id = ${id}`);
  // ok: sec-sql-string-concat
  await db.query("SELECT * FROM c WHERE id = $1", [id]);
}

// An identifier that went through a quoting function of the driver is not a value (seen on mikro-orm-8227).
function bump(knex: any, platform: any, prop: any) {
  // ok: sec-sql-string-concat
  return knex.raw(platform.quoteIdentifier(prop.fieldNames[0]) + " + 1");
}

function bumpEscaped(knex: any, platform: any, column: string) {
  // ok: sec-sql-string-concat
  return knex.raw(`${platform.quoteIdentifier(column)} + 1`);
}

function stillFlagged(knex: any, platform: any, column: string, value: string) {
  // ruleid: sec-sql-string-concat
  return knex.raw(`${platform.quoteIdentifier(column)} = ${value}`);
}

function otherCall(db: any, req: any) {
  // ruleid: sec-sql-string-concat
  return db.query(req.body.toString() + " limit 1");
}
