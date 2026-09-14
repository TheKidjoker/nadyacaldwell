import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/**
 * Whether she has already been through the first-run welcome.
 *
 * Takes the id explicitly instead of calling verifySession() like the rest of
 * the read layer does. The only page that asks this is "/", which has a
 * legitimate signed-out state; verifySession() would redirect it to /signin
 * rather than return, which is exactly wrong there.
 *
 * Server-side rather than localStorage on purpose: a per-device flag would
 * replay the whole thing on her phone after she had already seen it on a
 * laptop, turning a once-in-a-lifetime moment into a bug.
 */
export async function hasSeenWelcome(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ welcomedAt: user.welcomedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row?.welcomedAt != null;
}
