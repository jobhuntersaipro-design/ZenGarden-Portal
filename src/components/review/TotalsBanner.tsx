"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatMYR } from "@/lib/money";
import type { TotalsCheck } from "@/lib/validation/purchase-orders";

/**
 * Sits above the two-column split, not inside the form, and does not dismiss.
 * There are exactly two ways past it: make the numbers agree, or tick the
 * acknowledgement — which is written to the PO's activity log with the name of
 * whoever ticked it (docs/specs/04-extraction-review.md §3).
 */
export function TotalsBanner({
  totals,
  acknowledged,
  onAcknowledge,
}: {
  totals: TotalsCheck;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  if (totals.matches) return null;

  return (
    <section
      role="alert"
      className="mb-lg rounded-lg border border-hairline bg-surface-soft p-lg"
    >
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] tracking-[-0.54px] text-ink">
        The totals don&rsquo;t match the document
      </h2>

      <dl className="mt-sm flex flex-wrap gap-xl">
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Computed total
          </dt>
          <dd className="tabular-nums text-[length:var(--text-body-md)] text-ink">
            {formatMYR(totals.computed)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Document says
          </dt>
          <dd className="tabular-nums text-[length:var(--text-body-md)] text-ink">
            {formatMYR(totals.document)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Difference
          </dt>
          <dd className="tabular-nums text-[length:var(--text-body-md)] text-accent-red">
            {formatMYR(totals.difference)}
          </dd>
        </div>
      </dl>

      <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        Usually a line the extraction missed, or a different tax rate.
        {totals.lineItemsMatchSubtotal
          ? null
          : ` The line items add up to ${formatMYR(totals.lineItemSum)}, which is not the subtotal either.`}
      </p>

      <label className="mt-md flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(value) => onAcknowledge(value === true)}
        />
        I checked the source — save with this mismatch
      </label>
    </section>
  );
}
