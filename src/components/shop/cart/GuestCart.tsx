"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Shimmer } from "@/components/portal/Skeletons";
import { Button } from "@/components/ui/button";
import { CartScreen } from "@/components/shop/cart/CartScreen";
import { useGuestCart } from "@/components/shop/GuestCartProvider";
import { shopHref } from "@/lib/shop-routes";
import type { CartLine } from "@/lib/queries/cart";

/**
 * A guest's cart: `useGuestCart().priced` is the same `Cart` shape
 * `loadCart` returns for a client, just kept in `localStorage` and priced
 * live rather than read from a `WebOrder` row. `CartScreen` is the shared
 * "one screen" (§5.5) — this component supplies only the guest's data
 * source, its mutators, its own CTA and its loading-rows skeleton.
 */
export function GuestCart() {
  const { hydrated, cart, priced, pricingFailed, retryPricing, set, remove } = useGuestCart();

  // Before hydration `cart.lines` is always empty — localStorage has not
  // been read yet — so a reload of a cart that actually holds lines must not
  // flash "Your cart is empty" in between. Once hydrated, a stored line
  // count that is genuinely zero can show the empty state at once; it needs
  // no round trip through `priceCart` to know that.
  const showError = hydrated && cart.lines.length > 0 && priced === null && pricingFailed;
  const loading = !hydrated || (cart.lines.length > 0 && priced === null && !pricingFailed);

  // Rows come from `cart.lines` — the guest's own local truth, updated
  // synchronously by every mutator (`set`, `remove`) — not from `priced`,
  // which only moves after the debounce plus a round trip. That is what
  // makes a removed line disappear at once instead of sitting there for
  // ~0.5s, and what stops the carton stepper's `useOptimistic` value from
  // reverting: its `value` prop is now this same synchronous number, not the
  // stale one still in `priced`. Money, name and image come from `priced`
  // where a match exists; a line just added has no priced counterpart yet
  // and is simply not shown until pricing catches up — no different from
  // before, when `lines` came from `priced` alone.
  const lines: CartLine[] = cart.lines.flatMap(({ productId, cartons }) => {
    const pricedLine = priced?.lines.find((line) => line.productId === productId);
    return pricedLine ? [{ ...pricedLine, cartons }] : [];
  });

  return (
    <CartScreen
      lines={lines}
      subtotal={priced?.subtotal ?? "0.00"}
      onSetCartons={(productId, cartons) => {
        set(productId, cartons);
        return Promise.resolve({ success: true });
      }}
      onRemove={remove}
      cta={<GuestCta />}
      skeleton={
        showError ? (
          <PricingErrorCard onRetry={retryPricing} />
        ) : loading ? (
          <CartLoadingRows count={cart.lines.length || 3} />
        ) : undefined
      }
    />
  );
}

function PricingErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-lg rounded-lg border border-hairline p-xxl text-center">
      <p className="text-[length:var(--text-body-md)] text-ink-secondary">
        We couldn&rsquo;t price your cart.
      </p>
      <Button className="mt-md" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function GuestCta() {
  return (
    <div>
      <Link
        href={shopHref.signIn("/cart")}
        className="flex h-control-lg w-full items-center justify-center gap-xs rounded-pill bg-ink text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Lock className="size-4" aria-hidden />
        Sign in to send this order
      </Link>
      <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
        You&rsquo;re browsing as a guest. Your cart is kept on this device and moves
        to your account when you sign in.
      </p>
    </div>
  );
}

/** One shimmer row per stored line, at `CartLines`' row geometry, so a
 * reload never collapses to nothing while `priceCart` is still in flight. */
function CartLoadingRows({ count }: { count: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading your cart…</span>
      <Shimmer className="mt-xs h-4 w-72" />
      <div className="mt-lg grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-lg border border-hairline">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-md border-b border-hairline p-md last:border-b-0 md:p-lg"
            >
              <Shimmer className="size-cart-thumb shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <Shimmer className="h-4 w-3/4" />
                <Shimmer className="mt-xs h-3 w-1/2" />
              </div>
              <Shimmer className="hidden h-11 w-28 shrink-0 rounded-pill sm:block" />
              <Shimmer className="h-4 w-14 shrink-0" />
            </div>
          ))}
        </div>
        <Shimmer className="h-80 rounded-lg" />
      </div>
    </div>
  );
}
