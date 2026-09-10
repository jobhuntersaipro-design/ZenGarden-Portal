"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Shimmer } from "@/components/portal/Skeletons";
import { CartLines, cartCaptions, type SetCartonsResult } from "@/components/shop/cart/CartLines";
import { OrderSummary } from "@/components/shop/cart/OrderSummary";
import { useGuestCart } from "@/components/shop/GuestCartProvider";
import type { CartLine } from "@/lib/queries/cart";
import { shopHref } from "@/lib/shop-routes";

/**
 * A guest's cart: `useGuestCart().priced` is the same `Cart` shape
 * `loadCart` returns for a client, just kept in `localStorage` and priced
 * live rather than read from a `WebOrder` row (§5.5's "same screen from the
 * same components").
 */
export function GuestCart() {
  const { hydrated, cart, priced, set, remove } = useGuestCart();

  return (
    <div className="pt-lg">
      <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
        Your cart
      </h1>

      {/* Before hydration `cart.lines` is always empty — localStorage has not
          been read yet — so a reload of a cart that actually holds lines must
          not flash "Your cart is empty" in between. Once hydrated, a stored
          line count that is genuinely zero can show the empty state at once;
          it needs no round trip through `priceCart` to know that. */}
      {!hydrated || (cart.lines.length > 0 && priced === null) ? (
        <CartLoadingRows count={cart.lines.length || 3} />
      ) : cart.lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <FilledCart
          lines={priced?.lines ?? []}
          subtotal={priced?.subtotal ?? "0.00"}
          onSetCartons={(productId, cartons) => {
            set(productId, cartons);
            return Promise.resolve({ success: true });
          }}
          onRemove={remove}
        />
      )}
    </div>
  );
}

function FilledCart({
  lines,
  subtotal,
  onSetCartons,
  onRemove,
}: {
  lines: CartLine[];
  subtotal: string;
  onSetCartons: (productId: string, cartons: number) => Promise<SetCartonsResult>;
  onRemove: (productId: string) => void;
}) {
  const captions = cartCaptions(lines);

  return (
    <>
      <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-tertiary">
        {captions.totalLabel}. Prices are today&rsquo;s and are confirmed by our team
        before delivery.
      </p>
      {captions.unavailableLabel ? (
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {captions.unavailableLabel}
        </p>
      ) : null}

      <div className="mt-lg grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <CartLines lines={lines} onSetCartons={onSetCartons} onRemove={onRemove} />
        <OrderSummary
          productCount={captions.availableCount}
          cartonCount={captions.availableCartons}
          subtotal={subtotal}
          cta={<GuestCta />}
        />
      </div>
    </>
  );
}

function GuestCta() {
  return (
    <div>
      <Link
        href={shopHref.signIn("/cart")}
        className="flex h-control-lg w-full items-center justify-center gap-xs rounded-pill bg-ink text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Lock className="size-[18px]" aria-hidden />
        Sign in to send this order
      </Link>
      <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
        You&rsquo;re browsing as a guest. Your cart is kept on this device and moves
        to your account when you sign in.
      </p>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="mt-lg rounded-lg border border-hairline p-xxl text-center">
      <p className="text-[length:var(--text-body-md)] text-ink-secondary">
        Your cart is empty.
      </p>
      <Link
        href={shopHref.catalogue()}
        className="mx-auto mt-md flex h-control-lg w-fit items-center rounded-pill bg-ink px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Browse the catalogue
      </Link>
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
              <Shimmer className="size-[88px] shrink-0 rounded-md" />
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
