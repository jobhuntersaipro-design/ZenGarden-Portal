import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StageStepper } from "@/components/purchase-orders/StageStepper";
import { requireClient } from "@/lib/auth-guards";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cartCount } from "@/lib/queries/cart";
import { loadBuyerOrder } from "@/lib/queries/web-orders";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { id: userId, buyerId } = await requireClient();

  const [, , order] = await Promise.all([
    prisma.buyer.findUnique({ where: { id: buyerId }, select: { name: true } }),
    cartCount(userId),
    loadBuyerOrder(buyerId, id),
  ]);
  // Scoped to the caller's buyer, so another buyer's id is simply not found.
  if (!order) notFound();

  return (
    <main>
      <Link
        href={shopHref.orders()}
        className="mb-md inline-flex min-h-control-md items-center gap-xxs rounded-sm text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My orders
      </Link>

      <h1 className="font-display text-[length:var(--text-heading-md)] text-ink">
        {order.reference}
      </h1>
      <p className="text-[length:var(--text-body-sm)] text-ink-tertiary">
        {order.date ? formatDate(order.date) : "Not yet dated"}
      </p>

      {order.kind === "confirmed" && order.stage ? (
        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
          <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Progress
          </p>
          <StageStepper current={order.stage} events={order.events} />
        </section>
      ) : (
        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
          <p className="text-[length:var(--text-body-md)] text-ink">
            {order.kind === "declined"
              ? "The team could not accept this order."
              : "The team has your order and will confirm it shortly."}
          </p>
          {order.kind === "declined" && order.declinedReason ? (
            <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-secondary">
              {order.declinedReason}
            </p>
          ) : null}
        </section>
      )}

      <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
        <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Lines
        </p>
        <ul className="flex flex-col gap-xs">
          {order.lines.map((line, index) => (
            <li
              key={index}
              className="flex flex-wrap items-baseline justify-between gap-sm border-b border-hairline pb-xs last:border-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink">
                {line.description}
              </span>
              <span className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                {`${line.quantity} ${line.unit ?? "unit"} × ${formatMYR(Number(line.unitPrice))}`}
              </span>
              <span className="w-28 text-right text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                {formatMYR(Number(line.amount))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-md flex items-baseline justify-between gap-sm border-t border-hairline pt-md">
          <span className="text-[length:var(--text-body-md)] text-ink-secondary">
            Total
          </span>
          <span className="text-[length:var(--text-heading-sm)] font-semibold tabular-nums text-ink">
            {formatMYR(Number(order.total))}
          </span>
        </div>
      </section>
    </main>
  );
}
