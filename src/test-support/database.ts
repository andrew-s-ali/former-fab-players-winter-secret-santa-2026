import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "#db/schema";

/**
 * A real Postgres for tests, running in-process.
 *
 * The database paths — card selections, deck builds, sign-up rows — had no
 * coverage at all: the unit tests exercised the pure halves and every drizzle
 * query first ran in production. PGlite is Postgres compiled to WebAssembly,
 * so it supports what this schema actually uses (jsonb columns, `ON CONFLICT`
 * upserts, transactions, `pg_advisory_xact_lock`) without a container or a
 * connection string, which means it runs in CI unchanged.
 *
 * It is not a substitute for a Deploy Preview — it does not prove the Netlify
 * driver connects — but it does prove the SQL and the logic around it.
 */
const MIGRATIONS = "netlify/database/migrations";

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

let current: TestDatabase | null = null;
let client: PGlite | null = null;

/**
 * Applies the committed migrations, in filename order.
 *
 * The real migrations rather than a hand-kept copy of the schema, so a
 * migration that does not apply cleanly fails here rather than on deploy.
 */
async function migrate(db: TestDatabase): Promise<void> {
  const directories = (await readdir(MIGRATIONS)).sort();
  for (const directory of directories) {
    const file = join(MIGRATIONS, directory, "migration.sql");
    const source = await readFile(file, "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") {
        await db.execute(sql.raw(statement));
      }
    }
  }
}

/** A new, empty database with the schema applied. Call in `beforeEach`. */
export async function freshDatabase(): Promise<TestDatabase> {
  await closeDatabase();
  client = new PGlite();
  current = drizzle({ client, schema });
  await migrate(current);
  return current;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  current = null;
}

/**
 * Stands in for `getDb` from `#db/index`.
 *
 * Tests mock that module onto this one, so the code under test is the real
 * code — no injected client, no test-only branch in production.
 */
export function getDb(): TestDatabase {
  if (!current) {
    throw new Error("No test database. Call freshDatabase() in a beforeEach.");
  }
  return current;
}
