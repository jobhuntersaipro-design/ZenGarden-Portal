import Link from "next/link";
import type { PriceDrift } from "@/lib/analytics/price-drift";
import { formatMYR } from "@/lib/money";

/** A diverging bar centred at zero: up is green to the right, down red left. */
function DivergingBar({ percent }: { percent: number }) {
  const magnitude = Math.min(50, Math.abs(percent));
  const up = percent > 0;
  return (
    <span aria-hidden className="relative block h-1.5 w-24 rounded-pill bg-surface-soft">
      <span className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" />
      <span
        className={`absolute inset-y-0 rounded-pill ${up ? "bg-accent-green" : "bg-accent-red"}`}
        style={
          up
            ? { left: "50%", width: `${magnitude}%` }
            : { right: "50%", width: `${magnitude}%` }
        }
      />
    </span>
  );
}

export function PriceDriftList({ drift }: { drift: PriceDrift }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Product price drift
      </p>
      <p className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        {drift.upCount} up · {drift.downCount} down
      </p>
      <p className="text-[length:var(--text-caption)] text-ink-secondary">
        of {drift.comparedCount} products sold in both periods
      </p>

      {drift.rows.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          No product was sold in both this range and the one before it.
        </p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {drift.rows.map((row) => (
            <li key={row.productId} className="flex items-center gap-sm">
              <span className="min-w-0 flex-1">
                <Link
                  href={`/products/${row.productId}`}
                  title={row.productName}
                  className="block truncate rounded-xxs text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {row.productName}
                </Link>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary tabular-nums">
                  {formatMYR(row.previousPrice.toFixed(2))} →{" "}
                  {formatMYR(row.currentPrice.toFixed(2))} per unit
                </span>
              </span>
              <DivergingBar percent={row.deltaPercent} />
              <span
                className={`w-16 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] ${
                  row.deltaPercent > 0 ? "text-accent-green" : "text-accent-red"
                }`}
              >
                {row.deltaPercent > 0 ? "+" : ""}
                {row.deltaPercent.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
