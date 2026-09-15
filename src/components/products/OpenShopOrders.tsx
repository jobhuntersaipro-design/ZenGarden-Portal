import Link from "next/link";
import { formatDate } from "@/lib/dates";
import type { OpenShopOrderRow } from "@/lib/queries/product-detail";

/**
 * Shop orders containing this product that nobody has confirmed yet
 * (Phase 38).
 *
 * The order history below this reads confirmed purchase-order lines, so until
 * now demand sitting in the review queue was invisible on this page: a
 * product in five unconfirmed orders looked like a product nobody wanted.
 * Once an order is confirmed it leaves this section and appears in that
 * history, which is why the two cannot double-count.
 *
 * Rendered only when there is something in it — the rule `WorkQueue` follows:
 * an empty queue is nothing to report.
 */
export function OpenShopOrders({ rows }: { rows: OpenShopOrderRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Open shop orders ·{" "}
        <span className="text-brand-amber">
          {rows.length} awaiting confirmation
        </span>
      </p>
      <ul className="mt-sm divide-y divide-hairline">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-xxs py-xs"
          >
            <span className="min-w-0 flex-1">
              <Link
                href={`/web-orders/${row.id}`}
                className="font-mono text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {row.reference}
              </Link>
              <span
                title={row.buyerName}
                className="ml-xs truncate text-[length:var(--text-body-sm)] text-ink"
              >
                {row.buyerName}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[length:var(--text-body-sm)] text-ink">
              {`${row.cartons} ${row.cartons === 1 ? "carton" : "cartons"}`}
            </span>
            <span className="shrink-0 text-[length:var(--text-caption)] text-ink-tertiary">
              {[
                row.submittedAt ? `placed ${formatDate(row.submittedAt)}` : null,
                row.requestedDate
                  ? `wants ${formatDate(row.requestedDate)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
