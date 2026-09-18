"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import type { OrderIdentity } from "@/lib/order-identity";
import { updatePurchaseOrder, type PurchaseOrderPatch } from "@/actions/stages";
import { REASON_REQUIRED } from "@/lib/validation/purchase-orders";
import { ReadOnlyField } from "@/components/review/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

/**
 * Order ID, PO number and PO date are shown, not edited (2026-09-17): they are
 * what the order was confirmed under. The PO date still travels in the patch
 * unchanged, which is what the delivery-date check (not before the PO date)
 * compares against.
 */
const LABELS: { key: keyof PurchaseOrderPatch; label: string; type?: string }[] = [
  // Phase 38. Editable after the fact, and a change here emails the buyer
  // when the order came from the shop — a date that moves silently is what
  // they would ring up about.
  { key: "deliveryDate", label: "Expected delivery", type: "date" },
  { key: "paymentTerms", label: "Payment terms" },
];

/**
 * Header fields only. Money and line items are what the review screen's totals
 * gate exists to protect, so they are not editable from here — changing them
 * after confirmation would slip past that gate entirely.
 */
export function EditPurchaseOrderSheet({
  poId,
  identity,
  initial,
}: {
  poId: string;
  identity: OrderIdentity;
  initial: PurchaseOrderPatch;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState(initial);
  const [pending, setPending] = useState(false);
  const [reasonMissing, setReasonMissing] = useState(false);

  const set = (key: keyof PurchaseOrderPatch, value: string) =>
    setPatch((current) => ({ ...current, [key]: value || null }));

  /**
   * The date the buyer is waiting on does not move unattributed: the reason
   * appears the moment the date differs from the one the order holds, and it
   * is recorded on that edit's own activity row — not in the order's standing
   * Remark, which the next edit would overwrite.
   */
  const deliveryMoved = (patch.deliveryDate ?? null) !== (initial.deliveryDate ?? null);
  const reasonBlank = !patch.reason?.trim();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">Edit</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-panel-lg">
        <SheetHeader>
          <SheetTitle>Edit purchase order</SheetTitle>
          <SheetDescription>
            Order ID, PO number, PO date, totals and line items are set at
            review and are not editable here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
          <div className="grid gap-md sm:grid-cols-2">
            <ReadOnlyField id="edit-orderId" label="Order ID" value={identity.orderId ?? ""} />
            <ReadOnlyField id="edit-poNumber" label="PO number" value={identity.poNumber ?? ""} />
            <ReadOnlyField
              id="edit-poDate"
              label="PO date"
              value={initial.poDate ? formatDate(initial.poDate) : ""}
            />
          </div>

          {LABELS.map(({ key, label, type }) => (
            <div key={key} className="flex flex-col gap-xxs">
              <label
                htmlFor={`edit-${key}`}
                className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
              >
                {label}
              </label>
              <Input
                id={`edit-${key}`}
                type={type ?? "text"}
                // The picker offers no delivery day before the PO date; the
                // action refuses a typed one (2026-09-17).
                min={key === "deliveryDate" ? patch.poDate || undefined : undefined}
                value={patch[key] ?? ""}
                onChange={(event) => set(key, event.target.value)}
              />
            </div>
          ))}

          <div className="flex flex-col gap-xxs">
            <label
              htmlFor="edit-notes"
              className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
            >
              Remark
            </label>
            <Textarea
              id="edit-notes"
              rows={3}
              maxLength={2000}
              value={patch.notes ?? ""}
              onChange={(event) => set("notes", event.target.value)}
            />
          </div>

          {deliveryMoved ? (
            <div className="flex flex-col gap-xxs">
              <label
                htmlFor="edit-reason"
                className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
              >
                Why is the date moving?
              </label>
              <Textarea
                id="edit-reason"
                rows={2}
                maxLength={2000}
                aria-invalid={reasonMissing || undefined}
                aria-describedby={reasonMissing ? "edit-reason-error" : undefined}
                value={patch.reason ?? ""}
                onChange={(event) => {
                  set("reason", event.target.value);
                  if (reasonMissing) setReasonMissing(false);
                }}
              />
              <p
                id={reasonMissing ? "edit-reason-error" : undefined}
                className={`text-[length:var(--text-caption)] ${
                  reasonMissing ? "text-accent-red" : "text-ink-tertiary"
                }`}
              >
                {reasonMissing
                  ? REASON_REQUIRED
                  : "Recorded with this change, beside the old and new dates."}
              </p>
            </div>
          ) : null}

          <Button
            pending={pending}
            onClick={async () => {
              // Pressable, then told what is missing — the pattern the shop's
              // confirm form settled on (2026-09-17) rather than a button that
              // sits greyed out saying nothing.
              if (deliveryMoved && reasonBlank) {
                setReasonMissing(true);
                document.getElementById("edit-reason")?.focus();
                return;
              }
              setPending(true);
              const result = await updatePurchaseOrder(poId, patch);
              setPending(false);
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              setOpen(false);
              setReasonMissing(false);
              // Typed per edit: the next one starts blank rather than
              // re-using the last reason.
              setPatch((current) => ({ ...current, reason: null }));
              toast.success("Changes saved");
              router.refresh();
            }}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
