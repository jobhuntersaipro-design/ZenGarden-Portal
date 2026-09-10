import Link from "next/link";
import type { ReactNode } from "react";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";

/**
 * The summary card, shared verbatim by `GuestCart` and `ClientCart` (§5.5).
 * `cta` is the one thing that differs by viewer — a guest's sign-in pill and
 * footnote, or a client's reference/notes/Send order block — so this
 * component never has to know which cart it is showing.
 */
export function OrderSummary({
  productCount,
  cartonCount,
  subtotal,
  cta,
}: {
  /** Counts excluding unavailable lines — this row sits beside the subtotal,
   * which already excludes them. */
  productCount: number;
  cartonCount: number;
  subtotal: string;
  cta: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg shadow-sm">
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] tracking-[-0.54px] text-ink">
        Order summary
      </h2>

      <div className="flex items-baseline justify-between gap-sm py-sm">
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {`${productCount} product${productCount === 1 ? "" : "s"} · ${cartonCount} carton${cartonCount === 1 ? "" : "s"}`}
        </span>
        <span className="text-[length:var(--text-body-md)] font-semibold tabular-nums text-ink">
          {formatMYR(subtotal)}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-sm border-t border-hairline py-sm">
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">Delivery</span>
        <span className="max-w-panel-xs text-right text-[length:var(--text-caption)] text-ink-tertiary">
          Quoted by our team when they confirm your order
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-sm border-t border-hairline pt-md">
        <span className="font-display text-[length:var(--text-heading-sm)] font-[650] tracking-[-0.54px] text-ink">
          Total
        </span>
        <span className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] tabular-nums text-ink">
          {formatMYR(subtotal)}
        </span>
      </div>

      <div className="mt-lg">{cta}</div>

      <div className="mt-lg flex items-center justify-center border-t border-hairline pt-md">
        <Link
          href={shopHref.catalogue()}
          className="text-[length:var(--text-body-sm)] font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          ← Continue shopping
        </Link>
      </div>
    </section>
  );
}
