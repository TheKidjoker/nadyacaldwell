import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Config } from "drizzle-kit";

// drizzle-kit's CLI only auto-loads `.env`, never `.env.local`. Load
// `.env.local` here (without overriding anything already in the shell env)
// so `DATABASE_URL_UNPOOLED` is available for generate/migrate.
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

// Migrations must go through the unpooled connection: schema changes
// through the pooler are unreliable. Runtime queries use DATABASE_URL.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
} satisfies Config;
