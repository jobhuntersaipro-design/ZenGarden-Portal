import Link from "next/link";
import type { Attribution } from "@/lib/analytics/line-filter";
import type { MarketMix } from "@/lib/analytics/market-mix";
import { formatMYR } from "@/lib/money";

/**
 * Which way each market is moving (Phase 53 §4.2).
 *
 * The donut beside it says what the mix *is*; this says what it is doing,
 * which is the question a donut cannot answer however long you look at it.
 *
 * Share is of the value that could be put in a market — never of total sales
 * — and the footer names that denominator alongside what it excludes, because
 * `Σ(markets) ≤ Σ(lines)` always and a reader who is not told will take these
 * rows for the whole business.
 */
export function MarketMixCard({
  mix,
  attribution,
}: {
  mix: MarketMix;
  attribution: Attribution;
}) {
  if (mix.rows.length === 0) return null;

  return (
    <section className="min-w-0 rounded-xl bg-surface p-xl">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Market mix
      </p>
      <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        {mix.rows.length} {mix.rows.length === 1 ? "market" : "markets"}
      </h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Share of attributed sales, against the period before
      </p>

      <ul className="mt-md flex flex-col gap-sm">
        {mix.rows.map((row) => (
          <li key={row.market} className="flex flex-col gap-xxs">
            <div className="flex items-baseline justify-between gap-sm">
              <Link
                href={`/products?market=${encodeURIComponent(row.market)}`}
                title={row.market}
                className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:rounded-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {row.market}
              </Link>
              <span className="shrink-0 tabular-nums text-[length:var(--text-body-sm)] text-ink">
                {formatMYR(row.value.toFixed(2))}
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums text-[length:var(--text-caption)]">
                {row.isNew ? (
                  // Not "+40pp": arriving from nothing is not a share that
                  // moved, and printing one reads as growth against a base
                  // that never existed.
                  <span className="text-ink-secondary">New</span>
                ) : row.isGone ? (
                  <span className="text-accent-red">Gone</span>
                ) : row.deltaShare === null ? (
                  <span className="text-ink-tertiary">—</span>
                ) : (
                  <span
                    className={
                      row.deltaShare >= 0 ? "text-accent-green" : "text-accent-red"
                    }
                  >
                    {row.deltaShare >= 0 ? "+" : ""}
                    {row.deltaShare.toFixed(1)}pp
                  </span>
                )}
              </span>
            </div>
            {/* The bar is the share; the caption is the figure it is of. */}
            <div className="flex items-center gap-xs">
              <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-soft">
                <div
                  className="h-full rounded-pill bg-ink"
                  style={{ width: `${Math.max(row.share, 0).toFixed(2)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                {row.share.toFixed(1)}%
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-md border-t border-hairline pt-sm text-[length:var(--text-caption)] text-ink-tertiary">
        {`Shares are of ${formatMYR(mix.total.toFixed(2))} in line value that carries a market.`}
        {attribution.unattributed > 0
          ? ` A further ${formatMYR(attribution.unattributed.toFixed(2))} is in no market — ${formatMYR(attribution.noMarket.toFixed(2))} on products carrying none, ${formatMYR(attribution.noProduct.toFixed(2))} on lines that matched no product.`
          : ""}
      </p>
    </section>
  );
}
