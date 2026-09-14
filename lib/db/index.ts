import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy it from the Vercel dashboard into .env.local.",
  );
}

// The dev server re-evaluates this module on every hot reload. Without a
// cached pool the process accumulates one — and its open connections — per
// edit, until Postgres refuses new ones.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // The provider pools on its side. A small ceiling here stops one
    // serverless instance from holding connections the others then want.
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
