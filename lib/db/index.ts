import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Reuse one client across hot reloads / warm serverless invocations.
const globalForDb = globalThis as unknown as { __verityDb?: DB };

export function getDb(): DB {
  if (globalForDb.__verityDb) return globalForDb.__verityDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  // prepare:false is required for Supabase's transaction pooler (pgbouncer).
  const client = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  globalForDb.__verityDb = drizzle(client, { schema });
  return globalForDb.__verityDb;
}

export { schema };
