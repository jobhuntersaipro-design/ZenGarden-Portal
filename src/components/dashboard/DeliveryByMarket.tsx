import Link from "next/link";
import type { DeliveryPerformance } from "@/lib/analytics/delivery";

/**
 * Did we deliver this market on time? (Phase 53 §4.4)
 *
 * The one card on the page whose figures are **not** narrowed to lines. On
 * time is a property of the order, so an order spanning Vietnam and Mydin
 * counts in both — it let both of them down. That would inflate a sum, which
 * is why money is never treated this way; it does not inflate a rate, and the
 * caption says whose orders each row is over so nobody adds the column up.
 */
export function DeliveryByMarket({ delivery }: { delivery: DeliveryPerformance }) {
  if (delivery.rows.length === 0 && delivery.undated === 0) return null;

  return (
    <section className="min-w-0 rounded-xl bg-surface p-xl">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        On-time delivery
      </p>
      <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        {delivery.counted} delivered {delivery.counted === 1 ? "order" : "orders"}
      </h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Reached Delivered on or before the date we promised
      </p>

      {delivery.rows.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing delivered in this range carries both a market and an expected
          date, so there is nothing to measure yet.
        </p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {delivery.rows.map((row) => {
            // Worst first, and the tone follows the figure rather than a
            // target nobody has set: green at four in five, red below half.
            const tone =
              row.rate === null
                ? "text-ink-tertiary"
                : row.rate >= 80
                  ? "text-accent-green"
                  : row.rate >= 50
                    ? "text-brand-amber"
                    : "text-accent-red";
            return (
              <li key={row.market} className="flex items-center gap-sm">
                <Link
                  href={`/products?market=${encodeURIComponent(row.market)}`}
                  title={row.market}
                  className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:rounded-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {row.market}
                </Link>
                <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                  {row.onTime}/{row.delivered}
                </span>
                <span
                  className={`w-14 shrink-0 text-right tabular-nums text-[length:var(--text-body-sm)] ${tone}`}
                >
                  {/* A market with nothing delivered prints a dash, never 0%:
                      a zero reads as "we never deliver on time". */}
                  {row.rate === null ? "—" : `${row.rate.toFixed(0)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-md border-t border-hairline pt-sm text-[length:var(--text-caption)] text-ink-tertiary">
        Each row is over the delivered orders touching that market, so an order
        spanning two counts in both and the rows do not add up.
        {delivery.undated > 0
          ? ` ${delivery.undated} delivered ${delivery.undated === 1 ? "order carries" : "orders carry"} no expected date and ${delivery.undated === 1 ? "is" : "are"} left out entirely.`
          : ""}
      </p>
    </section>
  );
}
