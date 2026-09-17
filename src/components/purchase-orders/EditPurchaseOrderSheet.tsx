"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { updatePurchaseOrder, type PurchaseOrderPatch } from "@/actions/stages";
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
 * PO number and PO date are shown, not edited (2026-09-17): they are what the
 * order was confirmed under. They still travel in the patch unchanged, which
 * is what the delivery-date check (not before the PO date) compares against.
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
  initial,
}: {
  poId: string;
  initial: PurchaseOrderPatch;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState(initial);
  const [pending, setPending] = useState(false);

  const set = (key: keyof PurchaseOrderPatch, value: string) =>
    setPatch((current) => ({ ...current, [key]: value || null }));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">Edit</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-panel-lg">
        <SheetHeader>
          <SheetTitle>Edit purchase order</SheetTitle>
          <SheetDescription>
            PO number, PO date, totals and line items are set at review and
            are not editable here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
          <div className="grid gap-md sm:grid-cols-2">
            <ReadOnlyField id="edit-poNumber" label="PO number" value={initial.poNumber} />
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

          <Button
            pending={pending}
            onClick={async () => {
              setPending(true);
              const result = await updatePurchaseOrder(poId, patch);
              setPending(false);
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              setOpen(false);
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
