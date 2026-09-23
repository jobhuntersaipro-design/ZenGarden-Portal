import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutSteps } from "@/components/shop/checkout/CheckoutSteps";
import { ReviewSendForm } from "@/components/shop/checkout/ReviewSendForm";
import { formatDate } from "@/lib/dates";
import { loadCart } from "@/lib/queries/cart";
import { loadReviewBuyer } from "@/lib/queries/shop-checkout";
import { shopHref } from "@/lib/shop-routes";
import { loadShopViewer } from "@/lib/shop-viewer";

export const metadata: Metadata = { title: "Review your order · Zen Garden" };
export const dynamic = "force-dynamic";

/**
 * Review and send (Phase 32).
 *
 * A guest has no order to review, so they are sent to sign in and brought
 * back here; the storefront layout already turns staff around to the portal.
 * An empty cart, or one holding a line that has left the shop, goes back to
 * the cart — that screen is where both are explained and fixed, and sending
 * either would fail in `submitWebOrder` anyway.
 */
export default async function CheckoutReviewPage() {
  const viewer = await loadShopViewer();
  if (viewer === "staff") return null;
  if (viewer.kind !== "client") {
    redirect(shopHref.signIn(shopHref.checkoutReview()));
  }

  const [cart, buyer] = await Promise.all([
    loadCart(viewer.id, viewer.market),
    loadReviewBuyer(viewer.buyerId),
  ]);

  if (cart.lines.length === 0) redirect(shopHref.cart());
  // Already covers a product that has left the buyer's market: `loadCart`
  // marks such a line unavailable, so this existing guard sends them back to
  // the cart to remove it rather than letting it reach `submitWebOrder`.
  if (cart.lines.some((line) => line.unavailable)) redirect(shopHref.cart());

  return (
    <div className="pt-lg pb-section">
      <Link
        href={shopHref.cart()}
        // h-11 and w-fit: a bare text link measured 15px tall at 390px,
        // under this project's 44px floor for a standalone control.
        className="flex h-11 w-fit items-center text-[length:var(--text-caption)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        ← Back to cart
      </Link>

      <div className="mt-sm">
        <CheckoutSteps current={2} />
      </div>

      <h1 className="mt-md font-display text-[length:var(--text-display-md)] font-[650] text-ink">
        Review and confirm your order
      </h1>
      <p className="mt-xs max-w-[65ch] text-[length:var(--text-body-sm)] text-ink-tertiary">
        Read the purchase order below, then confirm. Our team reviews every
        order and comes back to you before anything ships.
      </p>

      <ReviewSendForm
        cart={cart}
        buyer={buyer}
        orderDate={formatDate(new Date())}
      />
    </div>
  );
}
