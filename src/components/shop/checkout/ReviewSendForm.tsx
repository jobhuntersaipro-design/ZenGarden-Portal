"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PurchaseOrderPreview } from "@/components/shop/checkout/PurchaseOrderPreview";
import { submitWebOrder } from "@/actions/cart";
import { formatMYR } from "@/lib/money";
import { buildPoDocument, documentAgreesWithOrder } from "@/lib/purchase-order-document";
import { shopHref } from "@/lib/shop-routes";
import type { Cart } from "@/lib/queries/cart";
import type { ReviewBuyer } from "@/lib/queries/shop-checkout";
import type { SupplierDetails } from "@/lib/org-settings";

/**
 * Review and send (Phase 32, from the Phase 18 design).
 *
 * The order's own facts — the client's PO number and anything the team
 * should know — are collected *here*, on a screen whose job is to show what is
 * about to be sent. They used to be two unlabelled inputs beside the cart's
 * Send button.
 *
 * There is no requested delivery date (Phase 42): the team sets the expected
 * date when they confirm, and the buyer is told it then.
 *
 * Nothing is written until Send. Local state only, one Server Action.
 */
export function ReviewSendForm({
  cart,
  buyer,
  supplier,
  orderDate,
}: {
  cart: Cart;
  buyer: ReviewBuyer | null;
  /** Printed on the purchase order, and behind "Ask us to change this". */
  supplier: SupplierDetails;
  /** Today, already formatted, so the document and the server agree on it. */
  orderDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buyerReference, setBuyerReference] = useState("");
  const [notes, setNotes] = useState("");

  const cartonCount = cart.lines.reduce((sum, line) => sum + line.cartons, 0);
  const supplierEmail = supplier.email;

  // Rebuilt on every keystroke, which is the point: the document below is the
  // one that will be filed, so the PO number and the note appear on
  // it as they are typed rather than after the order is already sent.
  const document = buildPoDocument({
    lines: cart.lines,
    subtotal: cart.subtotal,
    buyer,
    supplier,
    buyerReference: buyerReference || null,
    ourReference: cart.reference,
    notes: notes || null,
    paymentTerms: buyer?.paymentTerms ?? null,
    orderDate,
  });
  // Refuse to draw a document that contradicts the figure beside Confirm.
  const documentIsSound = documentAgreesWithOrder(document, cart.subtotal);

  const send = () =>
    startTransition(async () => {
      const result = await submitWebOrder({
        buyerReference: buyerReference.trim() || null,
        notes: notes.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push(shopHref.orderSent(result.data.reference));
    });

  return (
    <div className="mt-lg flex flex-col gap-xl">
      {/* The two short cards pair up from `md`; with no buyer on the session
          there is only one, so the grid is not applied at all rather than
          leaving half the row empty. `min-w-0` on each item because a grid
          item defaults to `min-width: auto` and will not shrink below its
          content (the same trap Phase 25 hit on /admin/buyers/[id]). */}
      <div className={buyer ? "grid gap-lg md:grid-cols-2 md:items-start" : ""}>
        <div className="min-w-0">
          <Card title="Order details">
            <Field
              label="Your own PO number (optional)"
              hint={
                cart.reference
                  ? `Printed at the top of your purchase order. Leave it blank and we'll use our reference, ${cart.reference}.`
                  : "Printed at the top of your purchase order."
              }
            >
              <Input
                value={buyerReference}
                onChange={(event) => setBuyerReference(event.target.value)}
                maxLength={64}
                className="font-mono"
                aria-label="Your own PO number"
              />
            </Field>
          </Card>
        </div>

        {buyer ? (
          <div className="min-w-0">
            <Card title="Deliver to">
              <p className="text-[length:var(--text-body-md)] font-semibold text-ink">
                {buyer.name}
              </p>
              {buyer.address ? (
                <p className="mt-xxs whitespace-pre-line text-[length:var(--text-body-sm)] text-ink-secondary">
                  {buyer.address}
                </p>
              ) : null}
              {buyer.contactName || buyer.email ? (
                <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
                  {[buyer.contactName, buyer.email].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
                This is the address we hold for your company. Changing it is a
                message to our team rather than an edit, so your invoicing
                details stay correct.
              </p>
              {supplierEmail ? (
                <a
                  href={`mailto:${supplierEmail}?subject=${encodeURIComponent(`Change of details for ${buyer.name}`)}`}
                  className="mt-sm flex h-control-md w-fit items-center rounded-pill border border-hairline-strong px-md text-[length:var(--text-button-md)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Ask us to change this
                </a>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>

      <Card title="Anything we should know?">
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          className="min-h-24"
          aria-label="Anything we should know"
        />
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          Appears on your purchase order and reaches our team with the order.
        </p>
      </Card>

      {/* `min-w-0`: the A4 document inside is 794px wide and would otherwise
          stretch this column to its own width and push the *page* sideways
          (measured 856 against 390). With it, the document scrolls inside its
          own container, which is this project's rule for wide content. */}
      <section className="min-w-0">
        <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
          Your purchase order
        </h2>
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-tertiary">
          This is the document we file against your order. It updates as you
          fill in the fields above.
        </p>
        <div className="mt-md">
          {documentIsSound ? (
            <PurchaseOrderPreview document={document} />
          ) : (
            <p className="rounded-lg border border-accent-red p-md text-[length:var(--text-body-sm)] text-accent-red">
              We couldn&rsquo;t draw your purchase order. Go back to the cart and
              try again.
            </p>
          )}
        </div>
      </section>

      {/* Last, because it is the last thing you do: the buyer reads the
          document above, then confirms the figures underneath it. */}
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
          {`${cart.lines.length} product${cart.lines.length === 1 ? "" : "s"} · ${cartonCount} carton${cartonCount === 1 ? "" : "s"}`}
        </h2>

        <ul className="mt-md flex flex-col gap-sm">
          {cart.lines.map((line) => (
            <li key={line.productId} className="flex items-start justify-between gap-sm">
              <div className="min-w-0">
                <p className="truncate text-[length:var(--text-body-sm)] text-ink" title={line.name}>
                  {line.name}
                </p>
                <p className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                  {`${line.cartons} × ${formatMYR(line.unitPrice)}`}
                </p>
              </div>
              <p className="shrink-0 text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {line.amount}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-md flex items-baseline justify-between border-t-2 border-ink pt-sm">
          <span className="text-[length:var(--text-body-md)] font-semibold text-ink">
            Total
          </span>
          <span className="text-[length:var(--text-heading-md)] font-[650] tabular-nums text-ink">
            {formatMYR(cart.subtotal)}
          </span>
        </div>

        {/* The wrapper does the centring, not `mx-auto` on the button: the
            Button primitive is `inline-flex`, and auto margins have no effect
            on an inline-level box. */}
        <div className="mt-md sm:flex sm:justify-center">
          <Button
            pending={pending}
            onClick={send}
            className="h-control-lg w-full gap-xs sm:w-auto sm:min-w-80"
          >
            <Send className="size-4 shrink-0" aria-hidden />
            Confirm order
          </Button>
        </div>

        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary sm:text-center">
          Prices are fixed at the figures above the moment you confirm. Delivery
          is quoted separately when our team confirms.
        </p>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">{title}</h2>
      <div className="mt-md">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[length:var(--text-caption)] font-semibold text-ink">{label}</p>
      <div className="mt-xxs">{children}</div>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">{hint}</p>
    </div>
  );
}
