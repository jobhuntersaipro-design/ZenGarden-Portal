"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePurchaseOrder } from "@/actions/purchase-orders";
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
 * Deleting is rare and deliberate, so the friction is the point: the button
 * stays disabled until the PO number is typed back. The action checks it
 * again — this is the friction, not the gate.
 *
 * The copy states the two consequences that are otherwise invisible: the
 * figures move, and deleting a revision brings the order it superseded back
 * into view.
 *
 * There is no "a later revision will survive" case: a superseded order
 * redirects to its newer revision, so this page only ever shows the current
 * one.
 */
export function DeletePoDialog({
  poId,
  poNumber,
  lineItemCount,
  monthLabel,
  supersedesRevision,
}: {
  poId: string;
  poNumber: string;
  lineItemCount: number;
  /** e.g. "September 2026" — the month whose totals change. */
  monthLabel: string;
  /**
   * The revision number this order superseded, when it is itself a revision.
   * Deleting it un-hides that earlier order, which nobody would guess.
   */
  supersedesRevision: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const matches = typed.trim().toLowerCase() === poNumber.trim().toLowerCase();

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {poNumber}?</DialogTitle>
            <DialogDescription>
              Removes the order, its {lineItemCount}{" "}
              {lineItemCount === 1 ? "line item" : "line items"} and its stage
              history. The original document is kept, and this upload goes back
              to the review queue.
            </DialogDescription>
          </DialogHeader>

          {supersedesRevision !== null ? (
            <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
              This replaced revision {supersedesRevision}, which will become the
              current order again.
            </p>
          ) : null}

          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            This changes sales figures for {monthLabel}.
          </p>

          <label
            htmlFor="confirm-po-number"
            className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
          >
            Confirm the PO number
          </label>
          <Input
            id="confirm-po-number"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Type {poNumber} to confirm
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
                const result = await deletePurchaseOrder({
                  id: poId,
                  typedPoNumber: typed,
                });
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(`${poNumber} deleted`);
                router.push("/purchase-orders");
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
