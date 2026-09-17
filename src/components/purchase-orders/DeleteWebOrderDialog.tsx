"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteWebOrder } from "@/actions/web-orders";
import { RowDeleteButton } from "@/components/purchase-orders/RowDeleteButton";
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

/**
 * Deleting a shop order nobody has confirmed. Super admin only, and typed back
 * like a purchase order, because it is still somebody's order: the buyer
 * sent it, and it leaves their My orders with no email to say so. The dialog
 * says that, and points at Decline for the case where the buyer should know.
 */
export function DeleteWebOrderDialog({
  webOrderId,
  reference,
  lineCount,
}: {
  webOrderId: string;
  reference: string;
  lineCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const matches = typed.trim().toLowerCase() === reference.trim().toLowerCase();

  return (
    <>
      <RowDeleteButton
        label={`Delete ${reference}`}
        onOpen={() => setOpen(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {reference}?</DialogTitle>
            <DialogDescription>
              Removes the buyer&rsquo;s order, its {lineCount}{" "}
              {lineCount === 1 ? "line" : "lines"} and the purchase-order PDF
              made for it.
            </DialogDescription>
          </DialogHeader>

          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            The buyer isn&rsquo;t emailed, and the order disappears from their
            orders too. To turn it down with a reason they can see, open the
            order and decline it instead.
          </p>

          <label
            htmlFor="confirm-order-reference"
            className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
          >
            Confirm the order reference
          </label>
          <Input
            id="confirm-order-reference"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Type {reference} to confirm
          </p>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="bg-ink text-canvas hover:bg-ink-deep"
              disabled={!matches}
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await deleteWebOrder({
                  id: webOrderId,
                  typedReference: typed,
                });
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(`${reference} deleted`);
              }}
            >
              Delete order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
