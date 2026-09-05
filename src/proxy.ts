import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { authConfig } from "@/lib/auth.config";

/**
 * Route protection (docs/specs/02-auth.md §2). Runs on the Node runtime — Next
 * 16 `proxy`, not `middleware`.
 *
 * This instance is built from `authConfig` alone so nothing here imports
 * Prisma: it reads the JWT and nothing else. That makes it defence in depth,
 * not the only check — the authoritative disabled / demoted / signed-out-
 * everywhere check lives in the `jwt` callback in `src/lib/auth.ts`, which
 * every page, Server Action and route handler goes through, and every one of
 * those also calls `requireUser()` or `requireSuperAdmin()`.
 */
const { auth } = NextAuth(authConfig);

/** Reachable signed out. Everything else needs a session. */
const PUBLIC_PATHS = ["/signin", "/forgot-password", "/reset-password"];

/** Reachable while `mustChangePassword` is still set. */
const PASSWORD_CHANGE_PATH = "/account/password";

const startsWithPath = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((path) => startsWithPath(pathname, path));

  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    const signin = new URL("/signin", request.nextUrl);
    signin.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signin);
  }

  // A password the user has been told to change blocks every other page. The
  // sign-out route is exempt so nobody is trapped in the portal.
  if (
    session.user.mustChangePassword &&
    pathname !== PASSWORD_CHANGE_PATH &&
    !isPublic
  ) {
    return NextResponse.redirect(new URL(PASSWORD_CHANGE_PATH, request.nextUrl));
  }

  // 404, never 403: a member must not learn that /admin is a real route.
  // `/not-found` matches no route, so Next renders the app's not-found page.
  // The status is pinned rather than inferred — a rewrite to an unmatched path
  // can otherwise stream out as 200, and a scanner reading status codes would
  // still tell /admin apart from a genuine 404.
  if (
    startsWithPath(pathname, "/admin") &&
    session.user.role !== Role.SUPER_ADMIN
  ) {
    return NextResponse.rewrite(new URL("/not-found", request.nextUrl), {
      status: 404,
    });
  }

  // Nothing here redirects *away* from a public page on the strength of a
  // cookie. This instance never reads the database, so its idea of "signed in"
  // can be up to five minutes out of date — bouncing a visitor off /signin on
  // that basis loops forever against a page that has just decided the session
  // is dead. Sending an already-signed-in visitor to the portal is done by
  // /signin itself, which checks the session for real.

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next's own assets and static files. `/api/auth` is
    // matched on purpose — it is let through in the handler above, where the
    // reason is visible.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
