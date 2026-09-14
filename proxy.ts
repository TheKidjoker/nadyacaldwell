import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";

/**
 * OPTIMISTIC check only. It reads the cookie's presence, not its validity,
 * so a forged cookie gets past this — verifySession() in the DAL is what
 * actually protects the data. This exists so strangers get bounced fast.
 *
 * getSessionCookie() rather than a literal cookie name: over HTTPS the cookie
 * is issued as `__Secure-better-auth.session_token`, and a hardcoded name
 * would bounce Nadya out of her own budget in production.
 *
 * Next.js 16 renamed middleware.ts to proxy.ts; the export is `proxy`.
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/budget/:path*", "/onboarding/:path*"],
};
