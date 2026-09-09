import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { SubmittedOrderPane } from "@/components/web-orders/SubmittedOrderPane";
import { WebOrderReviewForm } from "@/components/web-orders/WebOrderReviewForm";
import { requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { loadWebOrderForReview } from "@/lib/queries/web-orders";

export const metadata: Metadata = { title: "Shop order · Loving Hands Portal" };
export const dynamic = "force-dynamic";

/**
 * The ops review screen for an order placed on the shop.
 *
 * Two panes, mirroring `/review/[id]`'s geometry so it reads as the same job:
 * what the buyer sent on the left, the purchase order being written on the
 * right.
 */
export default async function WebOrderReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const order = await loadWebOrderForReview(id);
  if (!order) notFound();

  // Already dealt with: send the reader to the order it became rather than to
  // a form that would refuse them.
  if (order.status === "CONFIRMED") {
    const po = await prisma.webOrder.findUnique({
      where: { id },
      select: { purchaseOrderId: true },
    });
    redirect(
      po?.purchaseOrderId
        ? `/purchase-orders/${po.purchaseOrderId}`
        : "/purchase-orders",
    );
  }

  return (
    <>
      <BackLink fallbackHref="/purchase-orders?status=web" />
      <PageHeader eyebrow="From the shop" title={order.reference} />

      {order.status === "DECLINED" ? (
        <p className="mt-lg rounded-lg border border-hairline bg-surface p-lg text-[length:var(--text-body-md)] text-ink">
          This order was declined and the buyer has been told.
        </p>
      ) : (
        <div className="mt-lg grid min-w-0 gap-lg lg:grid-cols-2">
          <SubmittedOrderPane order={order} />
          <WebOrderReviewForm order={order} />
        </div>
      )}
    </>
  );
}
