import Link from "next/link";
import { formatDate } from "@/lib/dates";

export type OrderStockMove = {
  id: string;
  productId: string;
  productName: string;
  fromCartons: number;
  cartons: number;
  createdAt: string;
  byName: string | null;
};

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";
const cartons = (n: number) => n.toLocaleString("en-MY");

/**
 * What this order did to stock (2026-10-08): going out for delivery takes its
 * cartons off each counted product, moving back puts them back. Each row says
 * from what to what, so the figure on /stock can be traced to the order.
 */
export function OrderStockCard({
  moves,
  products,
  outForDelivery,
}: {
  moves: OrderStockMove[];
  /** The order's matched products and their cartons, to name the ones
      nothing was taken from and the ones stock could not cover. */
  products: { id: string; name: string; cartons: number }[];
  /** At Delivering or later. */
  outForDelivery: boolean;
}) {
  const moved = new Set(moves.map((move) => move.productId));
  const ordered = new Map(products.map((p) => [p.id, p.cartons]));
  const uncounted = outForDelivery ? products.filter((p) => !moved.has(p.id)) : [];

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Stock
      </h2>
      {moves.length === 0 && !outForDelivery ? (
        <p className={caption}>
          Its cartons come off stock when this order goes out for delivery.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {moves.map((move) => {
          const delta = move.cartons - move.fromCartons;
          // Stock stops at zero, so an order bigger than the count says so.
          const wanted = ordered.get(move.productId) ?? 0;
          return (
            <li key={move.id} className="border-b border-hairline py-xs first:pt-0">
              <div className="flex items-baseline justify-between gap-sm">
                <Link
                  href={`/products/${move.productId}`}
                  className="min-w-0 text-[length:var(--text-body-sm)] text-ink hover:text-brand-link hover:underline"
                >
                  {move.productName}
                </Link>
                <span className="shrink-0 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                  {cartons(move.fromCartons)} → {cartons(move.cartons)}
                </span>
              </div>
              <p className={`mt-xxs tabular-nums ${caption}`}>
                {[
                  delta <= 0
                    ? `${cartons(-delta)} cartons taken off for delivery`
                    : `${cartons(delta)} cartons put back`,
                  delta < 0 && -delta < wanted
                    ? `order is for ${cartons(wanted)}, ${cartons(wanted + delta)} short`
                    : null,
                  formatDate(move.createdAt),
                  move.byName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
        {uncounted.map((product) => (
          <li key={product.id} className="border-b border-hairline py-xs first:pt-0">
            <div className="flex items-baseline justify-between gap-sm">
              <Link
                href={`/products/${product.id}`}
                className="min-w-0 text-[length:var(--text-body-sm)] text-ink hover:text-brand-link hover:underline"
              >
                {product.name}
              </Link>
              <span className="shrink-0 text-[length:var(--text-body-sm)] text-ink-tertiary">—</span>
            </div>
            {/* An uncounted product, or an order that went out before stock moved
                with delivery (2026-10-08). */}
            <p className={`mt-xxs ${caption}`}>Nothing taken off stock</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
