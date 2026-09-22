import Link from "next/link";
import { PersonChip } from "@/components/ui/person";
import { formatDate, formatDateTime } from "@/lib/dates";
import { describeStockCount, stockActivity, type StockCountRow } from "@/lib/stock";

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * Who counted what, when, and what they said about it.
 *
 * Ordered by when the count was **typed**, not by the day it counts, so a
 * correction to a fortnight ago appears where the work happened rather than
 * buried a fortnight down. A superseded row stays in the feed and says so —
 * that is the whole point of a ledger that never overwrites.
 */
export function StockActivityFeed({
  rows,
  productHref,
  emptyText = "Nothing counted yet.",
}: {
  rows: (StockCountRow & { productId?: string; productName?: string })[];
  /** Given on the all-products feed, where each row names its product. */
  productHref?: boolean;
  emptyText?: string;
}) {
  const entries = stockActivity(rows);
  const named = new Map(rows.map((row) => [row.id, row]));

  if (entries.length === 0) {
    return <p className={`${caption} py-md`}>{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {entries.map((entry) => {
        const source = named.get(entry.id);
        return (
          <li key={entry.id} className="flex flex-col gap-xxs py-sm">
            <p className="text-[length:var(--text-body-sm)] text-ink">
              {productHref && source?.productId ? (
                <>
                  <Link
                    href={`/products/${source.productId}`}
                    className="font-medium hover:text-brand-link hover:underline"
                  >
                    {source.productName}
                  </Link>
                  {" — "}
                </>
              ) : null}
              {describeStockCount(entry)}
              <span className={caption}> for {formatDate(entry.countedOn)}</span>
              {entry.superseded ? (
                <span className={`${caption} italic`}> · since corrected</span>
              ) : null}
            </p>

            {entry.note ? (
              <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
                &ldquo;{entry.note}&rdquo;
              </p>
            ) : null}

            <p className={`flex flex-wrap items-center gap-xs ${caption}`}>
              {entry.countedByName ? (
                <PersonChip name={entry.countedByName} image={entry.countedByImage} />
              ) : (
                <span>System</span>
              )}
              <span>· {formatDateTime(entry.createdAt)}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
