"use client";

import { useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/review/Field";
import { TotalsBanner } from "@/components/review/TotalsBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { draftReducer } from "@/components/review/draft-reducer";
import { confirmWebOrder, declineWebOrder, receiveWebOrder } from "@/actions/web-orders";
import { todayISO } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
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
  // Scopes the Receive button's own spinner, the same shape as `declining`
  // scopes Decline's — so clicking one button never makes another look busy
  // too. Reset in a `finally` rather than only on the happy path, so a
  // thrown action (not just a `{success:false}` result) cannot leave it
  // stuck true and the spinner stuck on Receive forever.
  const [receiving, setReceiving] = useState(false);
  const [reason, setReason] = useState("");
  /**
   * The day the team commits to (Phase 38), prefilled with the day the buyer
   * asked for. It is not part of the draft: the draft is the purchase order
   * as printed, and this is a promise the team is making now.
   *
   * `requestedDate` is stored as UTC midnight of the chosen day, so slicing
   * the ISO string gives back that same day rather than the one before it.
   */
  const [deliveryDate, setDeliveryDate] = useState(
    order.requestedDate ? order.requestedDate.toISOString().slice(0, 10) : "",
  );

  const [draft, dispatch] = useReducer(draftReducer, {
    // Defaults a reviewer can type over: the shop reference as the PO number,
    // today as the PO date, and the buyer's standing terms.
    poNumber: order.reference,
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
  const blockedByTotals = !totals.matches && !acknowledged;
  const received = order.status === "RECEIVED";

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Confirm as a purchase order
      </p>

      <div className="mt-md grid gap-sm sm:grid-cols-2">
        <Field
          id="poNumber"
          label="PO number"
          value={draft.poNumber}
          onChange={(value) => dispatch({ type: "field", field: "poNumber", value })}
        />
        <Field
          id="poDate"
          label="PO date"
          type="date"
          value={draft.poDate}
          onChange={(value) => dispatch({ type: "field", field: "poDate", value })}
        />
        <Field
          id="deliveryDate"
          label="Expected delivery"
          type="date"
          value={deliveryDate}
          onChange={setDeliveryDate}
        />
        <Field
          id="paymentTerms"
          label="Payment terms"
          value={draft.paymentTerms ?? ""}
          onChange={(value) =>
            dispatch({ type: "field", field: "paymentTerms", value })
          }
        />
        <Field
          id="tax"
          label="Tax"
          value={draft.tax}
          onChange={(value) => dispatch({ type: "field", field: "tax", value })}
        />
      </div>

      <ul className="mt-md flex flex-col gap-xs">
        {draft.lineItems.map((line, index) => (
          <li key={index} className="flex flex-wrap items-center gap-xs">
            <span
              className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
              title={line.description}
            >
              {line.description}
            </span>
            <Input
              aria-label={`Quantity, line ${index + 1}`}
              value={line.quantity}
              className="w-20"
              onChange={(event) =>
                dispatch({
                  type: "line",
                  index,
                  field: "quantity",
                  value: event.target.value,
                })
              }
            />
            <Input
              aria-label={`Unit price, line ${index + 1}`}
              value={line.unitPrice}
              className="w-28"
              onChange={(event) =>
                dispatch({
                  type: "line",
                  index,
                  field: "unitPrice",
                  value: event.target.value,
                })
              }
            />
            <span className="w-28 text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
              {formatMYR(Number(line.amount))}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-md flex items-baseline justify-between gap-sm border-t border-hairline pt-md">
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
          Order total
        </span>
        <span className="text-[length:var(--text-heading-sm)] font-semibold tabular-nums text-ink">
          {formatMYR(Number(submitted.total))}
        </span>
      </div>

      <div className="mt-md">
        <TotalsBanner
          totals={totals}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      </div>

      <div className="mt-md flex flex-wrap items-center gap-sm">
        {received ? null : (
          <Button
            pending={pending && receiving}
            onClick={() =>
              startTransition(async () => {
                setDeclining(false);
                setReceiving(true);
                try {
                  const result = await receiveWebOrder(order.id);
                  if (result.success) {
                    toast.success("Order received. The buyer has been told.");
                  } else {
                    toast.error(result.error);
                  }
                } finally {
                  setReceiving(false);
                }
              })
            }
          >
            Receive order
          </Button>
        )}
        <Button
          variant={received ? "default" : "secondary"}
          pending={pending && !declining && !receiving}
          disabled={blockedByTotals || !deliveryDate || !received}
          onClick={() =>
            startTransition(async () => {
              setDeclining(false);
              setReceiving(false);
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
            })
          }
        >
          Confirm order
        </Button>
        <Button variant="secondary" onClick={() => setDeclining((v) => !v)}>
          {declining ? "Cancel" : "Decline"}
        </Button>
        {!received ? (
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Receive this order before confirming it.
          </p>
        ) : blockedByTotals ? (
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Locked — totals don&rsquo;t match
          </p>
        ) : !deliveryDate ? (
          // The buyer is emailed this date the moment Confirm is pressed, so
          // there is no confirming without one.
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Locked — set an expected delivery date
          </p>
        ) : deliveryDate < todayISO() ? (
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
                    router.push("/purchase-orders?status=web");
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
