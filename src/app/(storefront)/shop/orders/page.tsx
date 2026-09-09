import Link from "next/link";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { requireClient } from "@/lib/auth-guards";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { stageLabel } from "@/lib/po-stages";
import { prisma } from "@/lib/prisma";
import { cartCount } from "@/lib/queries/cart";
import { listBuyerOrders } from "@/lib/queries/web-orders";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { id: userId, buyerId } = await requireClient();
  const [buyer, count, orders] = await Promise.all([
    prisma.buyer.findUnique({ where: { id: buyerId }, select: { name: true } }),
    cartCount(userId),
    listBuyerOrders(buyerId),
  ]);

  return (
    <main>
      <ShopHeader buyerName={buyer?.name ?? ""} cartCount={count} />
      <h1 className="mb-md font-display text-[length:var(--text-heading-md)] text-ink">
        My orders
      </h1>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-canvas p-lg text-[length:var(--text-body-md)] text-ink-secondary">
          Nothing yet. Orders you send, and orders the team keys in for you,
          both appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {orders.map((order) => (
            <li key={`${order.kind}-${order.id}`}>
              <Link
                href={shopHref.order(order.id)}
                className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-hairline bg-canvas p-md hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <div className="min-w-0">
                  <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">
                    {order.reference}
                  </p>
                  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                    {[
                      order.date ? formatDate(order.date) : null,
                      `${order.lineCount} line${order.lineCount === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-sm">
                  <span className="text-[length:var(--text-caption)] text-ink-secondary">
                    {order.kind === "confirmed" && order.stage
                      ? stageLabel(order.stage)
                      : order.kind === "declined"
                        ? "Not accepted"
                        : "With the team"}
                  </span>
                  <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                    {formatMYR(Number(order.total))}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
