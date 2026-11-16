import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { seedDemo } from "../lib/demo/seed";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DIRECT_DATABASE_URL) in .env.local");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  await seedDemo(db);
  console.log("Seeded demo org 'Lumina Skin'.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
