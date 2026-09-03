import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required for PostgreSQL database mode");
    }

    pool = new Pool({
      connectionString,
      max: 10,
    });
  }

  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
