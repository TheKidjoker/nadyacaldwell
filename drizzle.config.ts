import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Config } from "drizzle-kit";

// drizzle-kit's CLI only auto-loads `.env`, never `.env.local`. Load
// `.env.local` here (without overriding anything already in the shell env)
// so `DATABASE_URL_UNPOOLED` is available for generate/migrate.
//
// This is NOT a general dotenv implementation: it does not handle `export `
// prefixes, `#` comments, or multi-line values. It's a minimal parser sized
// to this project's one `.env.local` file, not a drop-in replacement for
// the `dotenv` package.
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] ?? "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

// Neon splits its connection string in two and schema changes through the
// pooler are unreliable, so prefer the unpooled URL when one exists. Prisma
// Postgres exposes a single direct connection and sets no unpooled variable;
// there, DATABASE_URL is already the right one.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "No database URL. Set DATABASE_URL (or DATABASE_URL_UNPOOLED) in .env.local.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
} satisfies Config;
