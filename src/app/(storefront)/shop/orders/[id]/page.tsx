import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { CheckoutSteps } from "@/components/shop/checkout/CheckoutSteps";
import { PurchaseOrderPreview } from "@/components/shop/checkout/PurchaseOrderPreview";
import { PrintOrderButton } from "@/components/shop/orders/PrintOrderButton";
import { StageStepper } from "@/components/purchase-orders/StageStepper";
import { requireClient } from "@/lib/auth-guards";
import { buyerOrderStatus } from "@/lib/buyer-order-status";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { loadSupplierDetails } from "@/lib/org-settings";
import {
  buildPoDocumentFromOrder,
  documentAgreesWithOrder,
} from "@/lib/purchase-order-document";
import { loadBuyerOrder } from "@/lib/queries/web-orders";
import { shopHref } from "@/lib/shop-routes";

export const dynamic = "force-dynamic";

/**
 * The order's own reference in the tab, so a buyer with three orders open can
 * tell them apart. Scoped like the page itself — an id belonging to another
 * buyer titles the tab "Order", never their reference.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { buyerId } = await requireClient();
  const order = await loadBuyerOrder(buyerId, id);
  return { title: `${order?.reference ?? "Order"} · Zen Garden` };
}

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

  // The same document the buyer read before confirming, drawn from the order
  // as it now stands. One builder and one `PurchaseOrderPreview` serve both
  // screens, so a checkout version and a history version cannot drift apart.
  const supplier = await loadSupplierDetails();
  const document = buildPoDocumentFromOrder({
    order,
    supplier,
    orderDate: order.date ? formatDate(order.date) : "—",
    deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : null,
  });
  // A confirmed purchase order carries its own total, and a scan-origin one can
  // carry tax on top of its lines. Where the document's own arithmetic does not
  // reach that figure, the buyer is told to ask rather than shown a document
  // whose rows contradict the amount they owe.
  const documentIsSound = documentAgreesWithOrder(document, order.total);

  return (
    <div className="pt-lg">
      <Link
        href={shopHref.orders()}
        className="mb-md inline-flex min-h-control-md items-center gap-xxs rounded-sm text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <h1 className="font-display text-[length:var(--text-heading-md)] text-ink">
            {order.reference}
          </h1>
          <p className="text-[length:var(--text-body-sm)] text-ink-tertiary">
            {[
              order.date ? formatDate(order.date) : "Not yet dated",
              buyerOrderStatus(order),
              order.deliveryDate
                ? `Expected delivery ${formatDate(order.deliveryDate)}`
                : null,
              order.buyerReference ? `Your ref ${order.buyerReference}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          {/* A real link, not a fetch: the route answers a 302 to a
              short-lived presigned URL, so no key is ever rendered into the
              page and the browser does the rest. Offered only when the file
              exists — an order placed before Phase 37, or one whose render
              failed, still has Print. */}
          {order.documentId ? (
            <a
              href={shopHref.documentDownload(order.documentId)}
              className="flex h-control-md items-center gap-xs rounded-pill border border-hairline-strong px-md text-[length:var(--text-button-md)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Download className="size-4 shrink-0" aria-hidden />
              Download PDF
            </a>
          ) : null}
          {documentIsSound ? <PrintOrderButton /> : null}
        </div>
      </div>

      {order.kind === "confirmed" && order.stage ? (
        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
          <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Progress
          </p>
          {/* All four checkout steps are behind a confirmed order, so the bar
              is complete and the fulfilment stages below carry the story on
              (Phase 33). */}
          <CheckoutSteps current={4} state="confirmed" />
          {order.deliveryDate ? (
            <p className="mt-sm text-[length:var(--text-body-md)] text-ink">
              {`Confirmed by our team. Expected delivery ${formatDate(order.deliveryDate)}.`}
            </p>
          ) : null}
          <div className="mt-lg border-t border-hairline pt-lg">
            <StageStepper current={order.stage} events={order.events} />
          </div>
        </section>
      ) : (
        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
          {/* A declined order never reaches the fourth step, so the bar stops
              at Confirm rather than promising a call that is not coming. */}
          <CheckoutSteps
            current={order.kind === "declined" ? 3 : 4}
            state={
              order.kind === "confirmed"
                ? "confirmed"
                : order.kind === "received"
                  ? "received"
                  : "pending"
            }
          />
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

      {/* The lines above and the document below say the same thing on purpose.
          A4 is 794px and scrolls inside its own container on a phone, which is
          readable but not comfortable; the card is the quick read, the document
          is the record — and it is the record the buyer asked to be able to
          review. `data-print-region` is what Print keeps. */}
      <section className="mt-lg min-w-0" data-print-region>
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
            Your purchase order
          </h2>
        </div>
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-tertiary">
          The document we hold against this order.
        </p>
        <div className="mt-md">
          {documentIsSound ? (
            <PurchaseOrderPreview
              document={document}
              footnote={
                order.kind === "confirmed"
                  ? "Confirmed by our team. This is the order we are fulfilling."
                  : order.kind === "declined"
                    ? "This order was not accepted. Nothing will be delivered against it."
                    : "Sent to our team. They confirm the figures and come back to you."
              }
            />
          ) : (
            <p className="rounded-lg border border-accent-red p-md text-[length:var(--text-body-sm)] text-accent-red">
              We couldn&rsquo;t draw the purchase order for this order. Its
              lines come to {formatMYR(document.total)} against a total of{" "}
              {formatMYR(Number(order.total))} — please ask our team before
              working from either figure.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
