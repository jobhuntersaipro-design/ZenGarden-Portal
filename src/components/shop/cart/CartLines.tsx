"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import { Reveal } from "@/components/portal/Reveal";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { CartLine } from "@/lib/queries/cart";
import { CONCEAL_MS } from "@/hooks/usePresence";

export type SetCartonsResult = { success: boolean; error?: string };

/**
 * The line-item list, shared verbatim by `GuestCart` and `ClientCart` (§5.5
 * "the same screen from the same components"). Every prop is plain data or a
 * callback — this component never knows whether it is looking at a guest's
 * `localStorage` cart or a client's `WebOrder`.
 */
export function CartLines({
  lines,
  onSetCartons,
  onRemove,
}: {
  lines: CartLine[];
  onSetCartons: (productId: string, cartons: number) => Promise<SetCartonsResult>;
  onRemove: (productId: string) => void | Promise<unknown>;
}) {
  // A removed line folds away before it goes, so the lines and the summary
  // below close the gap rather than jump into it (2026-09-25: 0.15 of the
  // screen moved in one frame on a phone). If the removal fails, the line
  // is still in `lines` and simply opens again.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const remove = async (productId: string) => {
    setLeaving((current) => new Set(current).add(productId));
    await new Promise((resolve) => setTimeout(resolve, CONCEAL_MS));
    try {
      await onRemove(productId);
    } finally {
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <div className="hidden bg-surface px-lg py-sm text-[length:var(--text-caption)] text-ink-tertiary md:grid md:grid-cols-[88px_1fr_140px_120px_40px] md:items-center md:gap-md">
        <span aria-hidden />
        <span>Product</span>
        <span>Cartons</span>
        <span className="text-right">Amount</span>
        <span aria-hidden />
      </div>
      <ul>
        {lines.map((line) => (
          // The rule is on the item, not the row: the row now sits inside the
          // folding box, where it is always its parent's last child.
          <li key={line.productId} className="border-b border-hairline last:border-b-0">
            <Reveal closing={leaving.has(line.productId)} appear={false}>
              <CartRow
                line={line}
                onSetCartons={onSetCartons}
                onRemove={(productId) => void remove(productId)}
              />
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartRow({
  line,
  onSetCartons,
  onRemove,
}: {
  line: CartLine;
  onSetCartons: (productId: string, cartons: number) => Promise<SetCartonsResult>;
  onRemove: (productId: string) => void;
}) {
  const meta = [line.brand, line.variant, unitLabel(line.packSize, line.unit)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`grid grid-cols-[88px_minmax(0,1fr)] items-start gap-sm p-md md:grid-cols-[88px_1fr_140px_120px_40px] md:items-center md:gap-md md:p-lg ${
        line.unavailable ? "bg-surface" : "bg-canvas"
      }`}
    >
      <div
        className={`size-cart-thumb shrink-0 overflow-hidden rounded-md bg-surface-soft ${
          line.unavailable ? "opacity-50" : ""
        }`}
      >
        <ProductThumb name={line.name} url={line.imageUrl} />
      </div>

      <div className="min-w-0">
        <Link
          href={shopHref.product(line.productId)}
          className={`block break-words text-[length:var(--text-body-sm)] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            line.unavailable ? "text-ink-tertiary" : "text-ink"
          }`}
        >
          {line.name}
        </Link>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">{meta}</p>
        {line.unavailable ? (
          <span className="mt-xxs inline-flex h-6 w-fit max-w-full items-center gap-xxs rounded-pill border border-accent-red px-sm text-[length:var(--text-caption)] font-medium text-accent-red">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">No longer available</span>
          </span>
        ) : (
          <p className="mt-xxs text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
            {/* The pieces live under the stepper, where they move with the
                count; a second copy here was the same figure a line apart
                (Phase 58). */}
            {`${formatMYR(line.unitPrice)} per ${line.unit}`}
          </p>
        )}
      </div>

      {/* The stepper alone is 160px, and the amount plus the remove control
          need the rest. Below `md` that row used to sit in the title's column
          (~210px at 390px), so the card's overflow clipped the title on one
          line and wrapped the amount to "R / 198.0". The row now spans the
          card and wraps, amount and remove staying together. */}
      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-sm gap-y-xs md:contents">
        <div className={line.unavailable ? "shrink-0 opacity-45" : "shrink-0"}>
          <CartonStepper
            value={line.cartons}
            packSize={line.packSize}
            unit={line.unit}
            label={line.name}
            disabled={line.unavailable}
            onChange={(cartons) => onSetCartons(line.productId, cartons)}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-sm md:contents">
          <p
            className={`text-right text-[length:var(--text-body-md)] font-semibold whitespace-nowrap tabular-nums md:whitespace-normal ${
              line.unavailable ? "text-ink-disabled" : "text-ink"
            }`}
          >
            {line.unavailable ? "—" : formatMYR(line.amount)}
          </p>
          <button
            type="button"
            aria-label={`Remove ${line.name}`}
            onClick={() => onRemove(line.productId)}
            className={`flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              line.unavailable
                ? "text-accent-red"
                : "text-ink-tertiary hover:text-ink"
            }`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export type CartCaptions = {
  /** "{n} products · {c} cartons" over every line, available or not. */
  totalLabel: string;
  /** The second caption, shown under the first — null when nothing is unavailable. */
  unavailableLabel: string | null;
  /** Counts excluding unavailable lines — what `OrderSummary`'s own row shows,
   * matching the subtotal it sits beside. */
  availableCount: number;
  availableCartons: number;
};

/**
 * The cart's header captions and `OrderSummary`'s own row figures, computed
 * once here so `GuestCart` and `ClientCart` cannot drift apart on how a
 * product is counted.
 */
export function cartCaptions(lines: CartLine[]): CartCaptions {
  const totalCartons = lines.reduce((sum, line) => sum + line.cartons, 0);
  const available = lines.filter((line) => !line.unavailable);
  const availableCartons = available.reduce((sum, line) => sum + line.cartons, 0);
  const unavailableCount = lines.length - available.length;

  const totalLabel = `${lines.length} product${lines.length === 1 ? "" : "s"} · ${totalCartons} carton${totalCartons === 1 ? "" : "s"}`;

  const unavailableLabel =
    unavailableCount === 0
      ? null
      : unavailableCount === 1
        ? "One product is no longer on sale. It is shown so you can remove it, and it is left out of the total below."
        : `${unavailableCount} products are no longer on sale. They are shown so you can remove them, and they are left out of the total below.`;

  return {
    totalLabel,
    unavailableLabel,
    availableCount: available.length,
    availableCartons,
  };
}
