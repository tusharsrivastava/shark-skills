// Rule tests for sec-javascript.yaml: a test file builds SQL for its own test database, so the rule skips it.

async function seed(db: any, table: string) {
  // ok: sec-sql-string-concat
  await db.execute(`select version from ${table}`);
}
