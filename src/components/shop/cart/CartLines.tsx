"use client";

import Link from "next/link";
import { AlertCircle, Trash2 } from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { CartLine } from "@/lib/queries/cart";

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
  onRemove: (productId: string) => void;
}) {
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
          <li key={line.productId}>
            <CartRow line={line} onSetCartons={onSetCartons} onRemove={onRemove} />
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
      className={`grid grid-cols-[88px_1fr] items-start gap-sm border-b border-hairline p-md last:border-b-0 md:grid-cols-[88px_1fr_140px_120px_40px] md:items-center md:gap-md md:p-lg ${
        line.unavailable ? "bg-surface" : "bg-canvas"
      }`}
    >
      <div
        className={`size-[88px] shrink-0 overflow-hidden rounded-md bg-surface-soft ${
          line.unavailable ? "opacity-50" : ""
        }`}
      >
        <ProductThumb name={line.name} url={line.imageUrl} />
      </div>

      <div className="min-w-0">
        <Link
          href={shopHref.product(line.productId)}
          className={`text-[length:var(--text-body-sm)] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            line.unavailable ? "text-ink-tertiary" : "text-ink"
          }`}
        >
          {line.name}
        </Link>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">{meta}</p>
        {line.unavailable ? (
          <span className="mt-xxs inline-flex h-6 w-fit max-w-full items-center gap-xxs rounded-pill border border-accent-red px-sm text-[length:var(--text-caption)] font-medium text-accent-red">
            <AlertCircle className="size-[13px] shrink-0" aria-hidden />
            <span className="truncate">No longer available</span>
          </span>
        ) : (
          <p className="mt-xxs text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
            {`${formatMYR(line.unitPrice)} per ${line.unit}`}
          </p>
        )}
      </div>

      <div className="col-start-2 flex items-center justify-between gap-sm md:contents">
        <div className={line.unavailable ? "pointer-events-none opacity-45" : ""}>
          <CartonStepper
            value={line.cartons}
            packSize={line.packSize}
            unit={line.unit}
            label={line.name}
            onChange={(cartons) => onSetCartons(line.productId, cartons)}
          />
        </div>
        <p
          className={`text-right text-[length:var(--text-body-md)] font-semibold tabular-nums ${
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
          <Trash2 className="size-[18px]" aria-hidden />
        </button>
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
