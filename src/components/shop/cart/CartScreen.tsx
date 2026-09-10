import Link from "next/link";
import type { ReactNode } from "react";
import { CartLines, cartCaptions, type SetCartonsResult } from "@/components/shop/cart/CartLines";
import { OrderSummary } from "@/components/shop/cart/OrderSummary";
import type { CartLine } from "@/lib/queries/cart";
import { shopHref } from "@/lib/shop-routes";

/**
 * The one screen §5.5 asks for: `GuestCart` and `ClientCart` differ only in
 * where `lines`, the mutators and `cta` come from — the h1, both captions,
 * the two-column grid and the empty state all live here once, so the two
 * wrappers cannot drift apart on markup the way the pre-fix versions had.
 */
export function CartScreen({
  lines,
  onSetCartons,
  onRemove,
  subtotal,
  cta,
  skeleton,
}: {
  lines: CartLine[];
  onSetCartons: (productId: string, cartons: number) => Promise<SetCartonsResult>;
  onRemove: (productId: string) => void;
  subtotal: string;
  cta: ReactNode;
  /** Rendered in place of the captions/grid while a caller is still waiting
   * on its own data (only `GuestCart`, before `priceCart` first answers). */
  skeleton?: ReactNode;
}) {
  const captions = cartCaptions(lines);

  return (
    <div className="pt-lg">
      <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
        Your cart
      </h1>

      {skeleton ? (
        skeleton
      ) : lines.length === 0 ? (
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
      ) : (
        <>
          <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-tertiary">
            {captions.totalLabel}. Prices are today&rsquo;s and are confirmed by our
            team before delivery.
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
              cta={cta}
            />
          </div>
        </>
      )}
    </div>
  );
}
