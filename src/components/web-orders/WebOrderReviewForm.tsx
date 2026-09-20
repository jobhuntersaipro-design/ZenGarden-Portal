"use client";

import { useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field, ReadOnlyField } from "@/components/review/Field";
import { TotalsBanner } from "@/components/review/TotalsBanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { draftReducer } from "@/components/review/draft-reducer";
import { confirmWebOrder, declineWebOrder } from "@/actions/web-orders";
import { formatDate, todayISO } from "@/lib/dates";
import { checkTotals, type PoDraft } from "@/lib/validation/purchase-orders";
// The browser entry: this is a client component, and the `client` entry
// drags PrismaClient into the bundle.
import { Prisma } from "@/generated/prisma/browser";
import type { OpsWebOrder } from "@/lib/queries/web-orders";

/**
 * Built standalone rather than by extracting a shared editor out of
 * `ReviewForm`. That one is document-driven — a PDF pane, an 800ms debounced
 * saveDraft, an extraction queue, a poller — and a shop order has none of it:
 * the buyer is known and every line already carries a productId, so the
 * hardest parts of that form have nothing to do here.
 *
 * What it does share is the parts that must not diverge: PoDraftSchema,
 * checkTotals, and the same confirm gate on the server.
 */
export function WebOrderReviewForm({ order }: { order: OpsWebOrder }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  /**
   * The day the team commits to (Phase 38). It is not part of the draft: the
   * draft is the purchase order as printed, and this is a promise the team is
   * making now. It starts empty since Phase 42 — buyers no longer ask for a
   * day, so there is nothing to prefill it from.
   */
  const [deliveryDate, setDeliveryDate] = useState("");
  /**
   * Set by the first Confirm pressed with a required field empty (2026-09-17).
   * Until then nothing is red: an untouched form is not a mistake yet. After
   * it, each message clears the moment its field is filled.
   */
  const [attempted, setAttempted] = useState(false);

  const [draft, dispatch] = useReducer(draftReducer, {
    // No PO number in the draft: the buyer's own is on the order and the
    // Order ID is never one (2026-09-17). Today as the PO date, read-only; the
    // buyer's standing terms, editable.
    poNumber: "",
    buyerId: order.buyerId,
    newBuyerName: null,
    poDate: todayISO(),
    currency: "MYR",
    paymentTerms: order.buyerPaymentTerms,
    notes: null,
    lineItems: order.lines.map((line) => ({
      sku: line.sku,
      description: line.name,
      productId: line.productId,
      quantity: String(line.cartons),
      unit: line.unit,
      unitPrice: line.unitPrice,
      amount: line.amount,
      // Every line arrived already linked to a catalogue product — that is
      // what placing an order on the shop means — so the Phase 12 gate is
      // satisfied without the reviewer touching a picker.
      productDecision: "linked" as const,
    })),
    subtotal: order.subtotal,
    // Always zero since 2026-09-20: we charge no tax, and the field that used
    // to let a reviewer type one is gone. Kept on the draft because
    // `PurchaseOrder.tax` is NOT NULL and `checkTotals` takes it.
    tax: "0.00",
    total: order.subtotal,
  } satisfies PoDraft);

  /**
   * A shop order has no printed document, so its subtotal is not something to
   * check against — it is derived from the lines, every time one changes.
   *
   * This is the one place this form must differ from `/review/[id]`. There,
   * `checkTotals` compares the document's own printed subtotal + tax against
   * its printed total, and a disagreement is the reviewer's to resolve. Here
   * there is nothing printed to disagree with: leaving subtotal and total as
   * the buyer's original figures while a reviewer edits a quantity would write
   * a purchase order whose total contradicts its own lines, and the gate would
   * not catch it, because subtotal + tax would still equal total.
   */
  const submitted: PoDraft = useMemo(() => {
    const subtotal = draft.lineItems
      .reduce((sum, line) => sum.plus(new Prisma.Decimal(line.amount || "0")), new Prisma.Decimal(0))
      .toFixed(2);
    const total = new Prisma.Decimal(subtotal).plus(new Prisma.Decimal(draft.tax || "0")).toFixed(2);
    return { ...draft, subtotal, total };
  }, [draft]);

  const totals = useMemo(() => checkTotals(submitted), [submitted]);
  // Both are settled by the team at confirm and printed on the buyer's
  // purchase order, so neither may be left blank. The server says the same.
  const missing = {
    // The picker greys out days before the PO date, but a date can still be
    // typed, and the PO date can move after one was picked (2026-09-17).
    deliveryDate: !deliveryDate
      ? "Set an expected delivery date."
      : draft.poDate && deliveryDate < draft.poDate
        ? "Expected delivery can't be before the PO date."
        : null,
    paymentTerms: draft.paymentTerms?.trim() ? null : "Enter the payment terms.",
  };
  const firstMissing = (Object.keys(missing) as (keyof typeof missing)[]).find(
    (field) => missing[field] !== null,
  );
  const blockedByTotals = !totals.matches && !acknowledged;

  return (
    <section className="@container min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Confirm as a purchase order
      </p>

      {/* One column in the side rail, two where the form has the room: a
          container query, because the same form sits in a 22rem rail beside
          the order's PDF and in half the page when there is no PDF. */}
      <div className="mt-md grid gap-sm @md:grid-cols-2">
        {/* Read-only (2026-09-17). Order ID is ours; PO number is the buyer's
            own, blank when they gave none — never the Order ID. */}
        <ReadOnlyField id="orderId" label="Order ID" value={order.reference} />
        <ReadOnlyField id="poNumber" label="PO number" value={order.buyerReference ?? ""} />
        <ReadOnlyField
          id="poDate"
          label="PO date"
          value={draft.poDate ? formatDate(draft.poDate) : ""}
        />
        <Field
          id="deliveryDate"
          label="Expected delivery"
          type="date"
          value={deliveryDate}
          min={draft.poDate || undefined}
          onChange={setDeliveryDate}
          error={attempted ? (missing.deliveryDate ?? undefined) : undefined}
        />
        <Field
          id="paymentTerms"
          label="Payment terms"
          value={draft.paymentTerms ?? ""}
          onChange={(value) =>
            dispatch({ type: "field", field: "paymentTerms", value })
          }
          error={attempted ? (missing.paymentTerms ?? undefined) : undefined}
        />
      </div>

      {/* No line inputs and no total (2026-09-17, at the user's request): the
          confirmed purchase order carries the lines exactly as the buyer sent
          them, shown with their total in the left pane. No Tax field either
          since 2026-09-20 — we charge none, so it is written as zero and no
          tax row is printed on the document. */}
      <div className="mt-md">
        <TotalsBanner
          totals={totals}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      </div>

      <div className="mt-md flex flex-wrap items-center gap-sm">
        {/* Straight to Confirm: the Receive step was removed on 2026-09-17. */}
        <Button
          pending={pending && !declining}
          // Not disabled for an empty date or terms: a greyed-out button does
          // not say which field is missing. Pressing it does, under the field.
          disabled={blockedByTotals}
          onClick={() => {
            if (firstMissing) {
              setAttempted(true);
              document.getElementById(firstMissing)?.focus();
              return;
            }
            startTransition(async () => {
              setDeclining(false);
              const result = await confirmWebOrder(order.id, submitted, {
                totalsAcknowledged: acknowledged,
                deliveryDate,
              });
              if (result.success) {
                toast.success("Order confirmed.");
                router.push(`/purchase-orders/${result.data.poId}`);
              } else {
                toast.error(result.error);
              }
            });
          }}
        >
          Confirm order
        </Button>
        <Button variant="secondary" onClick={() => setDeclining((v) => !v)}>
          {declining ? "Cancel" : "Decline"}
        </Button>
        {blockedByTotals ? (
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Locked — totals don&rsquo;t match
          </p>
        ) : attempted && firstMissing ? (
          <p role="alert" className="text-[length:var(--text-caption)] text-accent-red">
            Check the expected delivery date and payment terms to confirm.
          </p>
        ) : deliveryDate && deliveryDate < todayISO() ? (
          // Allowed, not blocked: backdating a date the goods already went
          // out on is legitimate. It is said out loud because it is usually
          // a typo.
          <p className="text-[length:var(--text-caption)] text-brand-amber">
            That delivery date is in the past
          </p>
        ) : null}
      </div>

      {declining ? (
        <div className="mt-md flex flex-col gap-xs border-t border-hairline pt-md">
          <label
            htmlFor="decline-reason"
            className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
          >
            Why, in a sentence — the buyer sees this
          </label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div>
            <Button
              variant="secondary"
              pending={pending && declining}
              onClick={() =>
                startTransition(async () => {
                  const result = await declineWebOrder(order.id, { reason });
                  if (result.success) {
                    toast.success("Order declined and the buyer told.");
                    // Not `?status=web`: since Phase 46 that chip holds
                    // confirmed shop orders only, and a declined one is in
                    // neither the queue nor the table.
                    router.push("/purchase-orders");
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Decline order
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
