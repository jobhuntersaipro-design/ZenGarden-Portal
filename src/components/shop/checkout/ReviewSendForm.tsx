"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginRouteProgress } from "@/lib/route-progress";
import { ChevronDown, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PurchaseOrderPreview } from "@/components/shop/checkout/PurchaseOrderPreview";
import { submitWebOrder } from "@/actions/cart";
import { PO_NUMBER_REQUIRED } from "@/lib/validation/cart";
import { formatMYR } from "@/lib/money";
import { buildPoDocument, documentAgreesWithOrder } from "@/lib/purchase-order-document";
import { shopHref } from "@/lib/shop-routes";
import type { Cart } from "@/lib/queries/cart";
import type { ReviewBuyer } from "@/lib/queries/shop-checkout";

/** Also the anchor for the error message and the focus target. */
const PO_FIELD_ID = "buyerReference";

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
 *
 * Confirm order asks a second time (2026-09-20). Sending is the one
 * irreversible thing a buyer does here — it files a purchase order against
 * their company and emails our team — and it is a full-width pill at the
 * bottom of a phone screen, where it is reached by the same thumb that has
 * been scrolling. The dialog restates what is about to be sent, so it is a
 * check rather than a speed bump: the PO number the order is filed under,
 * the counts, and the total the prices are fixed at.
 */
export function ReviewSendForm({
  cart,
  buyer,
  orderDate,
}: {
  cart: Cart;
  buyer: ReviewBuyer | null;
  /** Today, already formatted, so the document and the server agree on it. */
  orderDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buyerReference, setBuyerReference] = useState("");
  const [notes, setNotes] = useState("");
  // Phone only: whether the purchase order is unfolded below the form.
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * Set by the first Confirm pressed with the PO number empty (2026-09-20).
   * Until then nothing is red: an untouched form is not a mistake yet. The
   * message clears the moment the field is filled. Same shape as the ops
   * confirm form's own required-field gate.
   */
  const [attempted, setAttempted] = useState(false);
  /** The second ask. Opened only once the form has nothing left to correct. */
  const [confirmOpen, setConfirmOpen] = useState(false);

  const missingPoNumber = buyerReference.trim() ? null : PO_NUMBER_REQUIRED;

  const cartonCount = cart.lines.reduce((sum, line) => sum + line.cartons, 0);

  // Rebuilt on every keystroke, which is the point: the document above is the
  // one that will be filed, so the PO number and the note appear on
  // it as they are typed rather than after the order is already sent.
  const document = buildPoDocument({
    lines: cart.lines,
    subtotal: cart.subtotal,
    buyer,
    poNumber: buyerReference || null,
    orderId: cart.reference,
    notes: notes || null,
    paymentTerms: buyer?.paymentTerms ?? null,
    orderDate,
  });
  // Refuse to draw a document that contradicts the figure beside Confirm.
  const documentIsSound = documentAgreesWithOrder(document, cart.subtotal);

  /**
   * What Confirm order does. The field gate runs *before* the dialog opens —
   * asking someone to confirm an order and only then telling them the PO
   * number is missing would make the second ask the thing that found the
   * mistake, two taps after the one that should have.
   */
  const requestConfirm = () => {
    // Nothing is sent while the PO number is missing: the message under the
    // field says which one, where a greyed-out button could not.
    if (missingPoNumber) {
      setAttempted(true);
      // `window.` because `document` in this scope is the purchase order
      // being previewed, not the DOM.
      window.document.getElementById(PO_FIELD_ID)?.focus();
      return;
    }
    setConfirmOpen(true);
  };

  const send = () => {
    startTransition(async () => {
      const result = await submitWebOrder({
        buyerReference: buyerReference.trim(),
        notes: notes.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      beginRouteProgress();
      router.push(shopHref.orderSent(result.data.reference));
    });
  };

  const preview = documentIsSound ? (
    <PurchaseOrderPreview document={document} />
  ) : (
    <p className="rounded-lg border border-accent-red p-md text-[length:var(--text-body-sm)] text-accent-red">
      We couldn&rsquo;t draw your purchase order. Go back to the cart and
      try again.
    </p>
  );

  return (
    <div className="mt-lg flex flex-col gap-xl">
      {/* First from `md` (2026-09-17): the document is what this screen is
          for, so it leads, full width and fitted to it; the fields that fill
          it in follow. Below `md` it moves under the form (2026-09-24): at
          390 it fits at 29%, too small to read, and it pushed the one field
          the buyer must fill below the first screen (y=1,077). It is rendered
          in each place rather than reordered with CSS `order`, so keyboard and
          screen-reader order always match what is on screen.
          `min-w-0`: the sheet is laid out at 1070px and would otherwise stretch
          this column to its own width and push the *page* sideways (measured
          856 against 390 when it was A4). */}
      <section className="hidden min-w-0 md:block">
        <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
          Your purchase order
        </h2>
        <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-tertiary">
          This is the document we file against your order. It updates as you
          fill in the fields below.
        </p>
        <div className="mt-md">{preview}</div>
      </section>

      {/* The two short cards pair up from `md`; with no buyer on the session
          there is only one, so the grid is not applied at all rather than
          leaving half the row empty. `min-w-0` on each item because a grid
          item defaults to `min-width: auto` and will not shrink below its
          content (the same trap Phase 25 hit on /admin/buyers/[id]). */}
      <div className={buyer ? "grid gap-lg md:grid-cols-2 md:items-start" : ""}>
        <div className="min-w-0">
          <Card title="Order details">
            <Field
              id={PO_FIELD_ID}
              label="Your own PO number"
              hint={
                cart.reference
                  ? `Printed on your purchase order as its PO number. We also track this order by its Order ID, ${cart.reference}.`
                  : "Printed on your purchase order as its PO number."
              }
              error={attempted ? (missingPoNumber ?? undefined) : undefined}
            >
              <Input
                id={PO_FIELD_ID}
                value={buyerReference}
                onChange={(event) => setBuyerReference(event.target.value)}
                maxLength={64}
                className="font-mono"
                aria-label="Your own PO number"
                aria-invalid={attempted && missingPoNumber ? true : undefined}
                aria-describedby={
                  attempted && missingPoNumber ? `${PO_FIELD_ID}-error` : undefined
                }
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
              {/* The "Ask us to change this" mailto went with the supplier
                  record on 2026-09-18 — there is no address left to send to. */}
              <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
                This is the address we hold for your company. It is not edited
                here — tell our team if it has changed, so your invoicing
                details stay correct.
              </p>
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

      {/* The phone's copy of the document, after the fields that fill it
          in and before Confirm. Folded by default; a document that could not
          be drawn says so without being opened. */}
      <section className="min-w-0 md:hidden">
        {documentIsSound ? (
          <>
            <button
              type="button"
              aria-expanded={previewOpen}
              aria-controls="po-preview-phone"
              onClick={() => setPreviewOpen((open) => !open)}
              className="flex min-h-control-lg w-full items-center justify-between gap-sm rounded-lg border border-hairline bg-canvas px-md py-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span>
                <span className="block text-[length:var(--text-body-md)] font-semibold text-ink">
                  {previewOpen ? "Hide your purchase order" : "Preview your purchase order"}
                </span>
                <span className="mt-xxs block text-[length:var(--text-caption)] text-ink-tertiary">
                  The document we file against your order, with your PO number on it.
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={`size-4 shrink-0 text-ink-tertiary transition-transform duration-200 motion-reduce:transition-none ${
                  previewOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {previewOpen ? (
              <div id="po-preview-phone" className="mt-md">
                {preview}
              </div>
            ) : null}
          </>
        ) : (
          preview
        )}
      </section>

      {/* Last, because it is the last thing you do: the buyer reads the
          document at the top, then confirms the figures down here. */}
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
            onClick={requestConfirm}
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

      {/* The second ask. While the order is in flight the dialog cannot be
          dismissed — by the ✕, by Escape or by a tap outside — because all
          three route through `onOpenChange`, and closing it would leave the
          buyer on a page whose Confirm button is still spinning with nothing
          to say whether the order went. */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!pending) setConfirmOpen(next);
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Send this order?</DialogTitle>
            <DialogDescription>
              Your purchase order goes to our team and can&rsquo;t be changed
              here afterwards. They confirm the expected delivery date and
              payment terms, and email you.
            </DialogDescription>
          </DialogHeader>

          {/* The three facts worth re-reading: what it is filed under, how
              much of it there is, and the figure the prices are fixed at. */}
          <dl className="flex flex-col gap-xs">
            <SummaryRow label="Your PO number" value={buyerReference.trim()} mono />
            <SummaryRow
              label="Order"
              value={`${cart.lines.length} product${cart.lines.length === 1 ? "" : "s"} · ${cartonCount} carton${cartonCount === 1 ? "" : "s"}`}
            />
            <SummaryRow label="Total" value={formatMYR(cart.subtotal)} />
          </dl>

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="gap-xs bg-ink text-canvas hover:bg-ink-deep"
              pending={pending}
              onClick={send}
            >
              <Send className="size-4 shrink-0" aria-hidden />
              {pending ? "Sending…" : "Send order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One line of the confirm dialog's summary. */
function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-sm">
      <dt className="text-[length:var(--text-caption)] text-ink-tertiary">{label}</dt>
      <dd
        className={`min-w-0 truncate text-[length:var(--text-body-sm)] font-semibold text-ink ${mono ? "font-mono" : "tabular-nums"}`}
        title={value}
      >
        {value}
      </dd>
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
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[length:var(--text-caption)] font-semibold text-ink">{label}</p>
      <div className="mt-xxs">{children}</div>
      {/* The error replaces the hint rather than stacking under it: the hint
          explains the field, and once it is wrong the correction is the only
          thing worth reading. */}
      {error ? (
        <p
          id={id ? `${id}-error` : undefined}
          role="alert"
          className="mt-xxs text-[length:var(--text-caption)] text-accent-red"
        >
          {error}
        </p>
      ) : (
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">{hint}</p>
      )}
    </div>
  );
}
