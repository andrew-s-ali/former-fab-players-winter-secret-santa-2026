import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema";

const createDatabase = () => drizzle({ schema });
type Database = ReturnType<typeof createDatabase>;
let database: Database | undefined;

export function getDb(): Database {
  database ??= createDatabase();
  return database;
}
