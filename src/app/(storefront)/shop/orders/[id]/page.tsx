import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CheckoutSteps } from "@/components/shop/checkout/CheckoutSteps";
import { StageStepper } from "@/components/purchase-orders/StageStepper";
import { requireClient } from "@/lib/auth-guards";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { loadBuyerOrder } from "@/lib/queries/web-orders";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { buyerId } = await requireClient();

  const order = await loadBuyerOrder(buyerId, id);
  // Scoped to the caller's buyer, so another buyer's id is simply not found.
  if (!order) notFound();

  return (
    <div className="pt-lg">
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
          {/* All four checkout steps are behind a confirmed order, so the bar
              is complete and the fulfilment stages below carry the story on
              (Phase 33). */}
          <CheckoutSteps current={4} complete />
          <div className="mt-lg border-t border-hairline pt-lg">
            <StageStepper current={order.stage} events={order.events} />
          </div>
        </section>
      ) : (
        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
          {/* A declined order never reaches the fourth step, so the bar stops
              at Confirm rather than promising a call that is not coming. */}
          <CheckoutSteps current={order.kind === "declined" ? 3 : 4} />
          <p className="mt-lg text-[length:var(--text-body-md)] text-ink">
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
    </div>
  );
}
