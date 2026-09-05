"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExtractionStatus } from "@/generated/prisma/enums";
import {
  checkDuplicate,
  confirmPurchaseOrder,
  discardExtraction,
  retryExtraction,
  saveDraft,
  type DuplicateMatch,
} from "@/actions/purchase-orders";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";
import { draftReducer } from "@/components/review/draft-reducer";
import { Field, FieldShell } from "@/components/review/Field";
import {
  LineItemsTable,
  LineItemSum,
  type ProductOption,
} from "@/components/review/LineItemsTable";
import { TotalsBanner } from "@/components/review/TotalsBanner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PoDraftSchema, checkTotals, type PoDraft } from "@/lib/validation/purchase-orders";

const SAVE_DEBOUNCE_MS = 800;

export function ReviewForm({
  extractionId,
  status,
  extractionError,
  initialDraft,
  confidence,
  buyers,
  products,
  queue,
}: {
  extractionId: string;
  status: ExtractionStatus;
  extractionError: string | null;
  initialDraft: PoDraft;
  confidence: Record<string, number>;
  buyers: ComboboxOption[];
  products: ProductOption[];
  queue: string[];
}) {
  const router = useRouter();
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  /**
   * The exact mismatch the reviewer accepted, as `computed:document`. Holding
   * the figures rather than a boolean is what stops an acknowledgement of one
   * difference from silently authorising a later, different one — tick, fix the
   * numbers, break them again, and the gate closes as it should.
   */
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [isRevision, setIsRevision] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const first = useRef(true);

  const totals = useMemo(() => checkTotals(draft), [draft]);
  const parsed = useMemo(() => PoDraftSchema.safeParse(draft), [draft]);

  /** Every change lands in the database 800 ms later, so a refresh loses nothing. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveDraft(extractionId, draft).then((result) =>
        setSaveState(result.success ? "saved" : "idle"),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, extractionId]);

  /** A confirmed PO with this buyer and number already exists — or does not. */
  useEffect(() => {
    if (!draft.buyerId || !draft.poNumber) return;
    let cancelled = false;
    void checkDuplicate(draft.buyerId, draft.poNumber).then((result) => {
      if (!cancelled && result.success) setDuplicate(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.buyerId, draft.poNumber]);

  // Both of these are derived rather than synchronised into state. A duplicate
  // kept after the buyer was cleared would lock Confirm over nothing.
  const mismatchKey = `${totals.computed}:${totals.document}`;
  const acknowledgedNow = !totals.matches && acknowledgedFor === mismatchKey;
  const duplicateNow =
    draft.buyerId && draft.poNumber && duplicate?.poNumber === draft.poNumber
      ? duplicate
      : null;

  const blockedByDuplicate = Boolean(duplicateNow) && !isRevision;
  const blockedByTotals = !totals.matches && !acknowledgedNow;
  const canConfirm =
    !confirming &&
    parsed.success &&
    !blockedByTotals &&
    !blockedByDuplicate &&
    status !== ExtractionStatus.RUNNING;

  const onConfirm = useCallback(async () => {
    setConfirming(true);
    setFormError(null);
    const result = await confirmPurchaseOrder(
      extractionId,
      draft,
      {
        revisedOf: isRevision && duplicateNow ? duplicateNow.poId : null,
        totalsAcknowledged: acknowledgedNow,
      },
      queue,
    );
    setConfirming(false);
    if (!result.success) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(`${draft.poNumber} saved`, {
      action: {
        label: "View",
        onClick: () => router.push(`/purchase-orders/${result.data.poId}`),
      },
    });
    router.push(
      result.data.nextExtractionId
        ? `/review/${result.data.nextExtractionId}?queue=${encodeURIComponent(queue.join(","))}`
        : "/purchase-orders",
    );
  }, [acknowledgedNow, draft, duplicateNow, extractionId, isRevision, queue, router]);

  const fieldError = (path: string) =>
    parsed.success
      ? undefined
      : parsed.error.issues.find((issue) => issue.path.join(".") === path)?.message;

  return (
    <>
      <TotalsBanner
        totals={totals}
        acknowledged={acknowledgedNow}
        onAcknowledge={(value) => setAcknowledgedFor(value ? mismatchKey : null)}
      />

      {status === ExtractionStatus.FAILED ? (
        <div className="mb-lg rounded-lg border border-hairline bg-surface-soft p-md">
          <p className="text-[length:var(--text-body-sm)] text-accent-red">
            {extractionError ?? "We couldn't read this document."}
          </p>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary">
            You can fill it in by hand and confirm, or try reading it again.
          </p>
          <Button
            variant="secondary"
            className="mt-sm"
            onClick={async () => {
              const result = await retryExtraction(extractionId);
              if (result.success) router.refresh();
              else toast.error(result.error);
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {duplicateNow ? (
        <div className="mb-lg rounded-lg border border-hairline bg-surface-soft p-md">
          <p className="text-[length:var(--text-body-sm)] text-ink">
            {draft.poNumber} already exists for this buyer.{" "}
            <Link
              href={`/purchase-orders/${duplicateNow.poId}`}
              className="text-brand-link underline-offset-2 hover:underline"
            >
              See revision {duplicateNow.revision}
            </Link>
          </p>
          <label className="mt-xs flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Checkbox
              checked={isRevision}
              onCheckedChange={(value) => setIsRevision(value === true)}
            />
            This is a revised PO
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-md">
        {/* Buyer leads on its own full-width row so a long buyer name is never
            the value that truncates (G4, design reference §3.4). */}
        <FieldShell label="Buyer" confidence={confidence.buyerName}>
          <div className="flex items-center gap-xs">
            <div className="min-w-0 flex-1">
              <Combobox
                ariaLabel="Buyer"
                value={draft.buyerId ?? null}
                options={buyers}
                placeholder={draft.newBuyerName ?? "Choose a buyer"}
                createLabel={(query) => `Create “${query}”`}
                onSelect={(option) =>
                  dispatch({ type: "buyer", buyerId: option.id, newBuyerName: null })
                }
                onCreate={(name) =>
                  dispatch({ type: "buyer", buyerId: null, newBuyerName: name })
                }
              />
            </div>
            {draft.buyerId ? (
              <span className="shrink-0 rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-accent-green">
                Known buyer
              </span>
            ) : null}
          </div>
          {fieldError("buyerId") ? (
            <p className="text-[length:var(--text-caption)] text-accent-red">
              {fieldError("buyerId")}
            </p>
          ) : null}
        </FieldShell>

        <div className="grid gap-md sm:grid-cols-2">
          <Field
            id="poNumber"
            label="PO number"
            value={draft.poNumber}
            confidence={confidence.poNumber}
            error={fieldError("poNumber")}
            onChange={(value) => dispatch({ type: "field", field: "poNumber", value })}
          />
          <Field
            id="poDate"
            label="PO date"
            type="date"
            value={draft.poDate}
            confidence={confidence.poDate}
            error={fieldError("poDate")}
            onChange={(value) => dispatch({ type: "field", field: "poDate", value })}
          />
          <Field
            id="deliveryDate"
            label="Delivery date"
            type="date"
            value={draft.deliveryDate ?? ""}
            confidence={confidence.deliveryDate}
            onChange={(value) =>
              dispatch({ type: "field", field: "deliveryDate", value: value || null })
            }
          />
          <Field
            id="currency"
            label="Currency"
            value={draft.currency}
            confidence={confidence.currency}
            onChange={(value) => dispatch({ type: "field", field: "currency", value })}
          />
          <Field
            id="buyerReference"
            label="Buyer reference"
            value={draft.buyerReference ?? ""}
            confidence={confidence.buyerReference}
            onChange={(value) =>
              dispatch({ type: "field", field: "buyerReference", value: value || null })
            }
          />
          <Field
            id="paymentTerms"
            label="Payment terms"
            value={draft.paymentTerms ?? ""}
            confidence={confidence.paymentTerms}
            onChange={(value) =>
              dispatch({ type: "field", field: "paymentTerms", value: value || null })
            }
          />
        </div>

        <section>
          <div className="flex items-baseline justify-between gap-sm">
            <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Line items
            </h2>
            {typeof confidence.lineItems === "number" ? (
              <span className="tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                {Math.round(confidence.lineItems)}
              </span>
            ) : null}
          </div>
          <LineItemsTable
            lineItems={draft.lineItems}
            products={products}
            dispatch={dispatch}
          />
        </section>

        <section
          className={`grid gap-md rounded-lg border p-md sm:grid-cols-3 ${
            totals.matches ? "border-hairline" : "border-accent-red"
          }`}
        >
          <Field
            id="subtotal"
            label="Subtotal"
            value={draft.subtotal}
            confidence={confidence.subtotal}
            error={fieldError("subtotal")}
            onChange={(value) => dispatch({ type: "field", field: "subtotal", value })}
          />
          <Field
            id="tax"
            label="Tax"
            value={draft.tax}
            confidence={confidence.tax}
            error={fieldError("tax")}
            onChange={(value) => dispatch({ type: "field", field: "tax", value })}
          />
          <Field
            id="total"
            label="Total on the document"
            value={draft.total}
            confidence={confidence.total}
            error={fieldError("total")}
            onChange={(value) => dispatch({ type: "field", field: "total", value })}
          />
          <div className="sm:col-span-3">
            <LineItemSum lineItems={draft.lineItems} />
            {totals.matches ? null : (
              <p className="mt-xxs text-[length:var(--text-caption)] text-accent-red">
                The totals don&rsquo;t match the document — see above
              </p>
            )}
          </div>
        </section>

        {formError ? (
          <p role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-md">
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>

          <div className="flex items-center gap-md">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Discard</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Discard this file?</DialogTitle>
                  <DialogDescription>
                    The upload is kept for 30 days.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    onClick={async () => {
                      const result = await discardExtraction(extractionId);
                      if (result.success) router.push("/purchase-orders");
                      else toast.error(result.error);
                    }}
                  >
                    Discard
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="text-right">
              <Button disabled={!canConfirm} onClick={onConfirm}>
                {confirming ? "Saving…" : "Confirm & save"}
              </Button>
              {blockedByTotals ? (
                <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
                  Locked — totals don&rsquo;t match
                </p>
              ) : null}
              {blockedByDuplicate ? (
                <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
                  Locked — tick “This is a revised PO”
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
