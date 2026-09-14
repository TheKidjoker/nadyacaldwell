import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, schema } from "@/lib/db";

// Normalized once, at module load, so every comparison below is against the
// same shape. An unset value is a configuration error, not a default.
const allowedEmail = process.env.ALLOWED_EMAIL?.toLowerCase().trim();

if (!allowedEmail) {
  throw new Error("ALLOWED_EMAIL is not set — refusing to start an open sign-up.");
}

/**
 * A second address that may sign in on a DEVELOPMENT BUILD ONLY, so the tool
 * can be tested without borrowing her account.
 *
 * The guard is NODE_ENV, which Next sets to "production" for every production
 * build and every deployment. There is therefore no value of
 * DEV_ALLOWED_EMAIL that the live app will ever read: this cannot widen
 * production access, even if the variable is set in Vercel by mistake.
 */
const devAllowedEmail =
  process.env.NODE_ENV === "production"
    ? undefined
    : process.env.DEV_ALLOWED_EMAIL?.toLowerCase().trim() || undefined;

function isAllowed(email: string | null | undefined): boolean {
  const candidate = email?.toLowerCase().trim();
  if (!candidate) return false;
  return candidate === allowedEmail || candidate === devAllowedEmail;
}

export const auth = betterAuth({
  // The four auth tables already live in lib/db/schema.ts under the singular
  // names the adapter expects (user, session, account, verification).
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  databaseHooks: {
    /**
     * Re-checked on EVERY sign-in, not just on account creation.
     *
     * The create hook below only fires when a row is being inserted. Once a
     * row exists it is never consulted again — and development and production
     * share one database, so a row created under DEV_ALLOWED_EMAIL would
     * otherwise be able to sign in to the live app, where that variable is
     * deliberately ignored. This is the gate that actually holds: no session
     * is issued to an address the current environment does not allow.
     */
    session: {
      create: {
        before: async (session) => {
          const [row] = await db
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);

          if (!isAllowed(row?.email)) {
            return false;
          }

          return { data: session };
        },
      },
    },
    user: {
      create: {
        // The allowlist. This runs before the insert, so a stranger who
        // completes Google's consent screen still ends up with no user row,
        // no account row, and no session — the sign-in simply fails.
        before: async (user) => {
          if (!isAllowed(user.email)) {
            return false;
          }
          return { data: user };
        },
      },
    },
  },
});
