import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface VerifiedSession {
  userId: string;
  email: string;
  name: string;
}

/**
 * The real authorization gate. Every server component, Server Action, and
 * query that touches budget data calls this FIRST and scopes its work to the
 * returned userId. proxy.ts is an optimistic redirect, not a substitute.
 *
 * Memoized per render pass with React's cache(), so calling it in a layout and
 * again in a page costs one lookup.
 */
export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/signin");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
});
