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

/**
 * The storefront host, and where the storefront really lives.
 *
 * Read from `process.env` rather than `src/lib/env.ts` on purpose: that module
 * parses its whole schema at import and throws on a bad key, and this file runs
 * on every request to both hosts — a Zod failure here would 500 the entire
 * application rather than one route. Same rule as the doc comment above.
 *
 * Unset means "one host, everything is the portal", which is what makes
 * `npm run dev` and every preview deployment work: they have one hostname.
 */
const SHOP_HOST = process.env.SHOP_HOST?.trim().toLowerCase() || null;
const SHOP_URL = process.env.SHOP_URL?.trim() || null;
const APP_URL = process.env.APP_URL?.trim() || null;
const SHOP_PREFIX = "/shop";

/** Reachable while `mustChangePassword` is still set. */
const PASSWORD_CHANGE_PATH = "/account/password";

const startsWithPath = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Served from the same path on both hosts, so never rewritten under /shop. */
const isShared = (pathname: string) =>
  startsWithPath(pathname, PASSWORD_CHANGE_PATH) || pathname.startsWith("/api/");

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const onShopHost = Boolean(SHOP_HOST) && host === SHOP_HOST;

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

  // The storefront is reachable only through its own host. On the portal host
  // its real paths are a 404 — the same treatment, and the same pinned status,
  // that /admin gets below and for the same reason.
  if (!onShopHost && startsWithPath(pathname, SHOP_PREFIX)) {
    return NextResponse.rewrite(new URL("/not-found", request.nextUrl), {
      status: 404,
    });
  }

  // Each audience on its own host. A client has no buyer-scoped view of the
  // portal and every portal query is unscoped by design; an ops user has no
  // buyer at all, so a cart and an order list have nothing to scope to.
  // Sending each away is one rule, and it lets every storefront page assume
  // `requireClient()` succeeds rather than growing a "staff viewing" branch.
  if (session.user.role === Role.CLIENT && !onShopHost && SHOP_URL) {
    return NextResponse.redirect(new URL("/", SHOP_URL));
  }
  if (session.user.role !== Role.CLIENT && onShopHost && APP_URL) {
    return NextResponse.redirect(new URL("/", APP_URL));
  }

  // The shop host serves the storefront from its real paths. Links inside the
  // storefront are written unprefixed and revalidatePath uses the real path —
  // see src/lib/shop-routes.ts, which is the only place either is written.
  //
  // Sign-in, password reset, the forced password change and the API are shared
  // by both audiences and live at their own paths on either host. Rewriting
  // them would send /signin to /shop/signin, which is a 404 — and a signed-in
  // visitor reaches this line, so the unauthenticated early return above does
  // not cover it.
  if (onShopHost && !isPublic && !isShared(pathname)) {
    return NextResponse.rewrite(
      new URL(`${SHOP_PREFIX}${pathname === "/" ? "" : pathname}${search}`, request.nextUrl),
    );
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
