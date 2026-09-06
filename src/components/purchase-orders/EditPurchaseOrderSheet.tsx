"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePurchaseOrder, type PurchaseOrderPatch } from "@/actions/stages";
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

const LABELS: { key: keyof PurchaseOrderPatch; label: string; type?: string }[] = [
  { key: "poNumber", label: "PO number" },
  { key: "poDate", label: "PO date", type: "date" },
  { key: "deliveryDate", label: "Delivery date", type: "date" },
  { key: "buyerReference", label: "Buyer reference" },
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
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit purchase order</SheetTitle>
          <SheetDescription>
            Totals and line items are set at review and are not editable here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
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
              Notes
            </label>
            <Textarea
              id="edit-notes"
              rows={3}
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
