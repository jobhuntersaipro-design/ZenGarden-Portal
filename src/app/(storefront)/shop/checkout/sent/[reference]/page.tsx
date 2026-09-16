import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { CheckoutSteps } from "@/components/shop/checkout/CheckoutSteps";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { loadSentOrder } from "@/lib/queries/shop-checkout";
import { shopHref } from "@/lib/shop-routes";
import { loadShopViewer } from "@/lib/shop-viewer";

export const metadata: Metadata = { title: "Order sent · Zen Garden" };
export const dynamic = "force-dynamic";

/**
 * Order sent (Phase 32).
 *
 * The reference is in the URL so the page can be reloaded and shared with a
 * colleague at the same company, but `loadSentOrder` scopes it to the
 * caller's own buyer — another company's reference finds nothing, and answers
 * the same way a made-up one does.
 */
export default async function OrderSentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const viewer = await loadShopViewer();
  if (viewer === "staff") return null;
  if (viewer.kind !== "client") {
    redirect(shopHref.signIn(shopHref.orderSent(reference)));
  }

  const order = await loadSentOrder(viewer.buyerId, decodeURIComponent(reference));
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-panel-lg pt-xl pb-section">
      <div className="mb-lg flex justify-center">
        <CheckoutSteps current={4} />
      </div>

      <div className="rounded-xl border border-hairline bg-canvas p-xxl text-center">
        <span
          aria-hidden
          className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-soft"
        >
          <Check className="size-7 text-accent-green" />
        </span>

        <h1 className="mt-md font-display text-[length:var(--text-display-md)] font-[650] text-ink">
          Your order is with us
        </h1>
        <p className="mx-auto mt-sm max-w-[52ch] text-[length:var(--text-body-sm)] text-ink-secondary">
          {`We've sent a copy to ${order.placedByEmail}. Our team reviews every order and will come back to you to confirm the price and the delivery date.`}
        </p>

        <dl className="mt-lg grid grid-cols-1 gap-md border-y border-hairline py-md sm:grid-cols-3">
          <Cell label="Your PO number" value={order.buyerReference ?? "—"} mono />
          <Cell label="Our reference" value={order.reference} mono />
          <Cell label="Total" value={formatMYR(order.total)} />
        </dl>

        {order.submittedAt ? (
          <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
            {`Sent ${formatDate(order.submittedAt)}`}
          </p>
        ) : null}

        <div className="mt-lg flex flex-col items-center gap-sm">
          <Link
            href={shopHref.order(order.id)}
            className="flex h-control-lg w-full items-center justify-center rounded-pill bg-ink px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-fit"
          >
            Track this order
          </Link>
          <Link
            href={shopHref.catalogue()}
            className="flex h-11 items-center text-[length:var(--text-body-sm)] font-medium text-brand-link hover:text-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            ← Continue shopping
          </Link>
        </div>
      </div>

      {/* The document is drawn in the same background step that sends the
          emails, so on the first paint it usually does not exist yet. Rather
          than offer a link that would 404 for a second, the page says where
          the file is — and links it once a reload finds it. */}
      <p className="mt-md rounded-lg bg-surface p-md text-center text-[length:var(--text-caption)] text-ink-tertiary">
        {order.documentId ? (
          <>
            {"Your purchase order is "}
            <a
              href={shopHref.documentDownload(order.documentId)}
              className="font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              ready to download
            </a>
            {", and the same one is filed against your order in our system — so when you call us we are both looking at the same document."}
          </>
        ) : (
          "Your purchase order is attached to the email we just sent, and the same one is filed against your order in our system — so when you call us we are both looking at the same document."
        )}
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[length:var(--text-caption)] text-ink-tertiary">{label}</dt>
      <dd
        className={`mt-xxs text-[length:var(--text-body-md)] font-semibold text-ink ${mono ? "font-mono" : "tabular-nums"}`}
      >
        {value}
      </dd>
    </div>
  );
}
