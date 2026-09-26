import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { SubmittedOrderPane } from "@/components/web-orders/SubmittedOrderPane";
import { WebOrderReviewForm } from "@/components/web-orders/WebOrderReviewForm";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { loadWebOrderForReview } from "@/lib/queries/web-orders";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Shop order · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * The ops review screen for an order placed on the shop.
 *
 * The order's purchase-order PDF leads, with the confirm form and what the
 * buyer sent in a side rail — the same geometry as `/review/[id]`, so it reads
 * as the same job. An order with no PDF keeps the two half-width panes.
 */
async function WebOrderReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Phase 48: reading a shop order is `po.view` — it was a bare
  // `requireUser()`, which is every ops role whatever the grid says.
  await requirePagePermission("po.view");
  // Phase 48: reading a shop order is `po.view`; deciding it is `po.confirm`.
  // Without it the page is the summary alone, with no form to submit.
  const canConfirm = await can("po.confirm");

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
      <PageHeader eyebrow="From the shop · Order ID" title={order.reference} />

      {order.status === "DECLINED" ? (
        <p className="mt-lg rounded-lg border border-hairline bg-surface p-lg text-[length:var(--text-body-md)] text-ink">
          This order was declined and the buyer has been told.
        </p>
      ) : order.document ? (
        // The purchase order's PDF is the primary pane (2026-09-17): most of
        // the width and the viewport's height, held in view while the rail
        // beside it — confirm form, then the buyer's summary — scrolls.
        <div className="mt-lg grid min-w-0 gap-lg xl:grid-cols-document">
          <section className="min-w-0 xl:sticky xl:top-md xl:self-start">
            <p className="mb-xs font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Purchase order · as the buyer received it
            </p>
            <DocumentPreview
              documentId={order.document.id}
              originalName={order.document.originalName}
            />
          </section>
          <div className="flex min-w-0 flex-col gap-lg">
            {canConfirm ? <WebOrderReviewForm order={order} /> : null}
            <SubmittedOrderPane order={order} />
          </div>
        </div>
      ) : (
        <div className="mt-lg grid min-w-0 gap-lg lg:grid-cols-2">
          <SubmittedOrderPane order={order} />
          {canConfirm ? <WebOrderReviewForm order={order} /> : null}
        </div>
      )}
    </>
  );
}

export default withLoadingFloor(WebOrderReviewPage);
