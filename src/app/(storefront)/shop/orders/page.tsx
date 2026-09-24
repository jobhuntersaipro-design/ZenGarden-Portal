import type { Metadata } from "next";
import {
  BuyerOrdersTable,
  type BuyerOrderRow,
} from "@/components/shop/orders/BuyerOrdersTable";
import { BuyerOrdersToolbar } from "@/components/shop/orders/BuyerOrdersToolbar";
import { requireClient } from "@/lib/auth-guards";
import { parseBuyerOrderFilter } from "@/lib/buyer-order-filter";
import { buyerOrderStatus } from "@/lib/buyer-order-status";
import { formatDate } from "@/lib/dates";
import { parseSort } from "@/lib/queries/pagination";
import {
  BUYER_ORDER_SORT_KEYS,
  listBuyerOrders,
  type BuyerOrderSortKey,
} from "@/lib/queries/web-orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My orders · Zen Garden" };

const PER_PAGE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { buyerId } = await requireClient();
  const query = await searchParams;
  const raw = query.page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  const sort = parseSort<BuyerOrderSortKey>(query, BUYER_ORDER_SORT_KEYS, {
    key: "date",
    dir: "desc",
  });

  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const filter = parseBuyerOrderFilter(one(query.filter));
  const q = (one(query.q) ?? "").trim();
  const narrowed = filter !== "all" || q !== "";

  const { orders, total } = await listBuyerOrders(
    buyerId,
    page,
    PER_PAGE,
    sort,
    { filter, q },
  );

  // Crossed to strings here, in the server component: a client component may
  // be handed neither a Date nor a Decimal.
  const rows: BuyerOrderRow[] = orders.map((order) => ({
    id: order.id,
    orderId: order.orderId,
    buyerReference: order.buyerReference,
    date: order.date ? formatDate(order.date) : null,
    deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : null,
    status: buyerOrderStatus(order),
    declined: order.kind === "declined",
    lineCount: order.lineCount,
    total: order.total,
  }));

  return (
    <div className="pt-lg">
      <h1 className="font-display text-[length:var(--text-heading-md)] text-ink">
        My orders
      </h1>
      <p className="mt-xxs mb-md text-[length:var(--text-body-sm)] text-ink-tertiary">
        Orders you send and orders the team keys in for you, together. Open one
        to read its purchase order.
      </p>

      {/* No controls on an empty history: there is nothing to narrow. */}
      {total > 0 || narrowed ? <BuyerOrdersToolbar filter={filter} q={q} /> : null}

      {total === 0 ? (
        <p className="rounded-lg border border-hairline bg-canvas p-lg text-[length:var(--text-body-md)] text-ink-secondary">
          {narrowed
            ? q
              ? `No order matches "${q}". Check the number, or clear the search.`
              : "No orders here yet."
            : "Nothing yet. Orders you send, and orders the team keys in for you, both appear here."}
        </p>
      ) : (
        <BuyerOrdersTable
          rows={rows}
          sort={sort}
          page={page}
          size={PER_PAGE}
          total={total}
        />
      )}
    </div>
  );
}
