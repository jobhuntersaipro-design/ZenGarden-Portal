import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NavProgressProvider } from "@/components/portal/NavProgress";
import { SkipLink } from "@/components/portal/SkipLink";
import { Toaster } from "@/components/ui/sonner";
import { CartSummaryProvider, GuestCartProvider } from "@/components/shop/GuestCartProvider";
import { GuestCartMerge } from "@/components/shop/GuestCartMerge";
import { MobileCartBar } from "@/components/shop/MobileCartBar";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopUtilityBar } from "@/components/shop/ShopUtilityBar";
import { ShopViewerProvider } from "@/components/shop/ShopViewer";
import { env } from "@/lib/env";
import { cartSummary } from "@/lib/queries/cart";
import { listShopCategories } from "@/lib/queries/shop-catalogue";
import { loadShopViewer } from "@/lib/shop-viewer";

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
 * Phase 17: a guest now gets this layout too — no `requireClient()` here any
 * more. Every page below still calls it for its own data (Tasks 8–11 rewrite
 * them to read `useShopViewer()` instead), so a guest reaches a page and is
 * turned back only where the page actually needs a buyer.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await loadShopViewer();
  // Staff go to the portal, not to an empty shop. Done here rather than in the
  // proxy because a cross-host redirect issued from the proxy comes back with
  // its origin stripped — both hosts are one deployment — and the browser then
  // loops against the same host (measured 2026-09-09).
  if (viewer === "staff") redirect(env.APP_URL);

  const [categories, summary] = await Promise.all([
    listShopCategories(),
    viewer.kind === "client" ? cartSummary(viewer.id) : Promise.resolve(null),
  ]);

  return (
    <ShopViewerProvider viewer={viewer}>
      <GuestCartProvider>
        <CartSummaryProvider summary={summary}>
          {/* Before the chrome, not inside NavProgressProvider with `main` —
              same placement as the portal's Sidebar (00-master.md, SkipLink's
              own doc comment): without it a keyboard user walks the wordmark,
              the search field, the cart pill and the category strip before
              ever reaching the page they asked for. */}
          <SkipLink />
          <ShopUtilityBar />
          <ShopHeader
            categories={categories}
            summary={summary}
            supplierEmail={env.SUPPLIER_EMAIL ?? null}
          />
          <NavProgressProvider>
            {/* pb-section, not pb-xxl: MobileCartBar is taller than the old
                60px floor once its own safe-area padding is added, and it is
                only ever present below `md`. */}
            <main
              id="main"
              className="mx-auto w-full max-w-page px-md pb-section sm:px-lg md:pb-0"
            >
              {children}
            </main>
          </NavProgressProvider>
          <ShopFooter categories={categories} />
          <MobileCartBar />
          {/* Renders nothing; moves a guest's localStorage cart into their
              account the moment they sign in. */}
          <GuestCartMerge />
          <Toaster />
        </CartSummaryProvider>
      </GuestCartProvider>
    </ShopViewerProvider>
  );
}
