import Link from "next/link";
import { StockActivityFeed } from "@/components/stock/StockActivityFeed";
import { StockMovementFeed } from "@/components/stock/StockMovementFeed";
import { StockTrend } from "@/components/stock/StockTrend";
import { formatDate } from "@/lib/dates";
import { latestCount, type StockCountRow } from "@/lib/stock";
import type { StockMovementRow } from "@/lib/queries/stock";
import { plural } from "@/lib/plural";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * A product's stock: what it reads now, how it has moved, and every count
 * behind it. The counting itself happens at `/stock`, which is the point of
 * the phase — this page reports, it does not edit.
 */
export function ProductStockCard({
  productId,
  onHand,
  rows,
  movements = [],
}: {
  productId: string;
  /** `Product.stockCartons`: the count, minus cartons sent out for delivery. */
  onHand: number | null;
  rows: StockCountRow[];
  movements?: StockMovementRow[];
}) {
  const latest = latestCount(rows);
  // The cache is the on-hand figure once a delivery has moved it. A product
  // whose cache was never written still reads as its last count.
  const figure = onHand ?? latest?.cartons ?? null;
  const sentOut = latest !== null && onHand !== null && onHand !== latest.cartons;

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className={label}>Stock</p>
          <p className="font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
            {figure === null ? "Not counted yet" : plural(figure, "carton")}
          </p>
          <p className={caption}>
            {latest === null
              ? "Nobody has counted this product."
              : sentOut
                ? `On hand, after deliveries. Last counted ${formatDate(latest.countedOn)} at ${plural(latest.cartons, "carton")}.`
                : `Counted ${formatDate(latest.countedOn)}${
                    latest.countedByName ? ` by ${latest.countedByName}` : ""
                  }`}
          </p>
        </div>
        <Link
          href={`/stock?product=${productId}`}
          className="flex min-h-control-md items-center rounded-sm border border-hairline-strong px-sm text-[length:var(--text-body-sm)] font-medium text-ink hover:border-ink-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Count stock
        </Link>
      </div>

      <div className="mt-md">
        <StockTrend rows={rows} />
      </div>

      <div className="mt-md">
        <p className={label}>History</p>
        <StockActivityFeed
          rows={rows}
          emptyText="No counts yet. Count it from the Stock page."
        />
        {movements.length > 0 ? (
          <div className="mt-sm">
            <p className={label}>Out for delivery</p>
            <StockMovementFeed rows={movements} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
