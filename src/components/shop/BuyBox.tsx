"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AddToCart } from "@/components/shop/AddToCart";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { lineTotal } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";

/**
 * Owns the carton count for the whole box — the price, the stepper, the
 * derived caption and Line total, and Add to cart all read one piece of
 * state, so incrementing the stepper moves the total in the same render
 * rather than waiting on a round trip. Everything crossing in is a plain
 * string or number (§5.4's controller note): no `Decimal` instance reaches
 * the browser, only the two-decimal strings the server already formatted.
 */
export function BuyBox({
  productId,
  name,
  unit,
  packSize,
  listPrice,
  perPieceLabel,
}: {
  productId: string;
  name: string;
  unit: string;
  packSize: number | null;
  listPrice: string;
  /** "RM 37.58 a piece · 6 per carton", pre-formatted server-side through
   * `Prisma.Decimal`. Null when the catalogue carries no pack size. */
  perPieceLabel: string | null;
}) {
  const viewer = useShopViewer();
  const [cartons, setCartons] = useState(1);
  const pieces = packSize === null ? null : cartons * packSize;

  return (
    <section className="rounded-lg border border-hairline p-lg">
      <div className="flex items-baseline gap-xs">
        <span className="font-display text-[length:var(--text-display-md)] font-[650] tabular-nums text-ink">
          {formatMYR(listPrice)}
        </span>
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          per {unit}
        </span>
      </div>
      {perPieceLabel ? (
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
          {perPieceLabel}
        </p>
      ) : null}

      <div className="mt-lg flex flex-wrap items-center gap-md">
        <CartonStepper
          size="lg"
          value={cartons}
          packSize={packSize}
          unit={unit}
          onChange={async (next) => {
            setCartons(next);
            return { success: true };
          }}
          label={name}
        />
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {unit}s
          {pieces !== null ? (
            <span className="text-ink-tertiary">
              {" "}
              = {pieces} piece{pieces === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
        <div className="ml-auto text-right">
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">Line total</p>
          <p className="text-[length:var(--text-body-lg)] font-semibold tabular-nums text-ink">
            {formatMYR(lineTotal(cartons, listPrice))}
          </p>
        </div>
      </div>

      <div className="mt-lg flex gap-sm">
        <div className="flex-1">
          <AddToCart
            productId={productId}
            name={name}
            unit={unit}
            packSize={packSize}
            variant="buybox"
            cartons={cartons}
          />
        </div>
        <Link
          href={shopHref.cart()}
          className="flex h-control-lg items-center rounded-pill border border-hairline-strong px-lg text-[length:var(--text-button-md)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          View cart
        </Link>
      </div>

      {viewer.kind !== "client" ? (
        <div className="mt-sm flex items-center gap-xs">
          <Check className="size-4 shrink-0 text-accent-green" aria-hidden />
          <span className="text-[length:var(--text-caption)] text-ink-secondary">
            No account needed to add to your cart — sign in when you send the order.
          </span>
        </div>
      ) : null}
    </section>
  );
}
