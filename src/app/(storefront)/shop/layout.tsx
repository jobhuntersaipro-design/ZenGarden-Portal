import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { UnauthorizedError, getSessionUser, requireClient } from "@/lib/auth-guards";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Loving Hands" };
export const dynamic = "force-dynamic";

/**
 * The storefront. Reached on the shop host, which rewrites `/x` to `/shop/x`
 * in `src/proxy.ts` — a route group cannot vary by host, and a second
 * `page.tsx` at `/` would not build.
 *
 * Two opposite rules follow from that rewrite, and `src/lib/shop-routes.ts` is
 * the only place either may be written:
 *
 * - every `<Link>` here is browser-relative (`/cart`, never `/shop/cart`), or
 *   a client lands on `/shop/shop/cart`;
 * - every `revalidatePath` names the real path (`/shop/cart`), because
 *   revalidation keys on the resolved route, not the URL the browser asked for.
 *
 * `requireClient()` runs once here, so every page below may assume a buyer
 * rather than growing a "staff viewing" branch.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Staff go to the portal, not to an empty shop. Done here rather than in the
  // proxy because a cross-host redirect issued from the proxy comes back with
  // its origin stripped — both hosts are one deployment — and the browser then
  // loops against the same host (measured 2026-09-09).
  const account = await getSessionUser();
  if (account && account.role !== Role.CLIENT) redirect(env.APP_URL);

  try {
    await requireClient();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) redirect("/signin");
    throw cause;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-page p-md sm:p-lg lg:p-xl">
      {children}
    </div>
  );
}
