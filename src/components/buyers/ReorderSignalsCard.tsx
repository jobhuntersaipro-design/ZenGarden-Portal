import Link from "next/link";
import type { ReorderBadge, ReorderSignals } from "@/lib/analytics/reorder";
import { formatDate } from "@/lib/dates";

const BADGE: Record<ReorderBadge, string> = {
  overdue: "text-accent-red",
  // Amber survives here because a future due date genuinely exists — unlike
  // the roster's Overdue column, which only counts what is already past.
  "due-now": "text-brand-amber",
  due: "text-accent-green",
};

export function ReorderSignalsCard({
  buyerId,
  reorder,
}: {
  buyerId: string;
  reorder: ReorderSignals;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Reorder signals
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            From this buyer&rsquo;s full history, not the selected range
          </p>
        </div>
        <div className="text-right">
          {/* A signal is only useful if acting on it is one click away. The
              label names what happens: Loving Hands is the seller, so nothing
              here is being bought. */}
          <Link
            href={`/upload?buyer=${encodeURIComponent(buyerId)}`}
            className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Upload PO
          </Link>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Opens the upload screen with this buyer preselected
          </p>
        </div>
      </div>

      {reorder.signals.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing bought often enough yet to predict a reorder.
        </p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {reorder.signals.map((signal) => (
            <li key={signal.productId} className="flex items-center gap-sm">
              <span className="min-w-0 flex-1">
                <span
                  title={signal.productName}
                  className="block truncate text-[length:var(--text-body-sm)] text-ink"
                >
                  {signal.productName}
                </span>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  Every ~{signal.intervalDays.toFixed(0)} days · last{" "}
                  {formatDate(signal.lastPurchase)} · {signal.purchases}×
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${BADGE[signal.badge]}`}
              >
                {signal.badge === "overdue"
                  ? `Overdue ${Math.round(signal.daysPastDue)}d`
                  : signal.badge === "due-now"
                    ? "Due now"
                    : `Due ${formatDate(signal.dueAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
