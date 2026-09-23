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
import { shopAudience } from "@/lib/shop-market";
import { loadShopViewer } from "@/lib/shop-viewer";
import { PageTransition } from "@/components/portal/PageTransition";

export const metadata: Metadata = { title: "Zen Garden" };
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
 * Phase 17 made a guest welcome here. **2026-09-23 reversed that**: the
 * catalogue is scoped to the buyer's market, and a guest has no buyer and so
 * no market, so there is nothing that can correctly be shown to one. The
 * proxy turns a guest into a 307 to sign-in before this layout runs; the
 * check below is the second place that rule is held, because a rewrite rule
 * is easy to widen by accident and this one decides who sees prices.
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
  // Belt and braces with the proxy, which already redirects an
  // unauthenticated request to sign-in. Reached only if a guest ever gets
  // past it — and then they get the sign-in page rather than a catalogue.
  if (viewer.kind === "guest") redirect("/signin");

  // The category strip is part of the chrome, so it is scoped like every
  // other read: a buyer with no market gets no categories rather than the
  // whole catalogue's list, which would otherwise say which categories exist
  // in markets they cannot buy from. The components below already handle an
  // empty list — that is what the shop looked like before any product was
  // priced.
  const audience = shopAudience(viewer.market);
  const [categories, summary] = await Promise.all([
    audience.kind === "scoped"
      ? listShopCategories(audience.market)
      : Promise.resolve([]),
    cartSummary(viewer.id, viewer.market),
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
          <ShopHeader categories={categories} summary={summary} />
          <NavProgressProvider>
            {/* pb-section, not pb-xxl: MobileCartBar is taller than the old
                60px floor once its own safe-area padding is added, and it is
                only ever present below `md`. */}
            <main
              id="main"
              className="mx-auto w-full max-w-page px-md pb-section sm:px-lg md:pb-0"
            >
              <PageTransition>{children}</PageTransition>
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
