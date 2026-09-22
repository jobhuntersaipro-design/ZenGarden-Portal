import Link from "next/link";
import { StockActivityFeed } from "@/components/stock/StockActivityFeed";
import { StockTrend } from "@/components/stock/StockTrend";
import { formatDate } from "@/lib/dates";
import { latestCount, type StockCountRow } from "@/lib/stock";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * A product's stock: what it reads now, how it has moved, and every count
 * behind it. The counting itself happens at `/stock`, which is the point of
 * the phase — this page reports, it does not edit.
 */
export function ProductStockCard({
  productId,
  rows,
}: {
  productId: string;
  rows: StockCountRow[];
}) {
  const latest = latestCount(rows);

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className={label}>Stock</p>
          <p className="font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
            {latest === null
              ? "Not counted yet"
              : `${latest.cartons.toLocaleString("en-MY")} cartons`}
          </p>
          <p className={caption}>
            {latest === null
              ? "Nobody has counted this product."
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
      </div>
    </section>
  );
}
