import Link from "next/link";
import type { BuyerChurn } from "@/lib/analytics/churn";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";

export function ChurnList({ churn }: { churn: BuyerChurn }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Buyer churn
          </p>
          <p className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink tabular-nums">
            {churn.churnRate.toFixed(0)}%
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-secondary">
            {churn.lapsedCount} lapsed of {churn.activeLastPeriod} active last
            period · {churn.atRiskCount} at risk
          </p>
        </div>
        <p className="max-w-64 text-[length:var(--text-caption)] text-ink-tertiary">
          Lapsed: ordered last period, not this one. At risk: silent for more
          than twice their own usual gap.
        </p>
      </div>

      {churn.rows.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          No lapsed or at-risk buyers in this range.
        </p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {churn.rows.map((row) => (
            <li key={row.buyerId} className="flex items-center gap-sm">
              <span className="min-w-0 flex-1">
                <Link
                  href={`/buyers/${row.buyerId}`}
                  title={row.buyerName}
                  className="block truncate text-[length:var(--text-body-sm)] text-ink hover:text-brand-link"
                >
                  {row.buyerName}
                </Link>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  Last order {formatDate(row.lastOrderAt)} · {row.daysSilent} days
                  silent
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                {formatMYR(row.previousValue.toFixed(2))}
              </span>
              <span
                className={`shrink-0 rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${
                  row.klass === "lapsed" ? "text-accent-red" : "text-brand-amber"
                }`}
              >
                {row.klass === "lapsed" ? "Lapsed" : "At risk"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
