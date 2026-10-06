import Link from "next/link";
import { PersonChip } from "@/components/ui/person";
import { formatDateTime } from "@/lib/dates";
import { describeStockMovement } from "@/lib/delivery-stock";
import type { StockMovementRow } from "@/lib/queries/stock";

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * Cartons taken when an order went out for delivery. A stocktake is a
 * different list: this one is the deduction log, one row per line.
 */
export function StockMovementFeed({
  rows,
  productHref = false,
}: {
  rows: StockMovementRow[];
  /** The catalogue feed names the product. A product's own history does not. */
  productHref?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {rows.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-xxs py-sm">
          <p className="text-[length:var(--text-body-sm)] text-ink">
            {productHref ? (
              <>
                <Link
                  href={`/products/${entry.productId}`}
                  className="font-medium hover:text-brand-link hover:underline"
                >
                  {entry.productName}
                </Link>
                {" — "}
              </>
            ) : null}
            {describeStockMovement(entry)}
          </p>
          <p className={`flex flex-wrap items-center gap-xs ${caption}`}>
            <Link
              href={`/purchase-orders/${entry.purchaseOrderId}`}
              className="hover:text-brand-link hover:underline"
            >
              {entry.poNumber ?? "Purchase order"}
            </Link>
            {entry.actorName ? (
              <PersonChip name={entry.actorName} />
            ) : (
              <span>System</span>
            )}
            <span>· {formatDateTime(entry.createdAt)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
