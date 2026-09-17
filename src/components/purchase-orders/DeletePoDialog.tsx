"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePurchaseOrder } from "@/actions/purchase-orders";
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
 * Deleting is rare and deliberate, so the friction is the point: the button
 * stays disabled until the order's identifier is typed back — its Order ID
 * for a shop order, the buyer's PO number for a scan, and the dialog says
 * which (2026-09-17). The action checks it again — this is the friction, not
 * the gate.
 *
 * The copy states the two consequences that are otherwise invisible: the
 * figures move, and deleting a revision brings the order it superseded back
 * into view.
 *
 * There is no "a later revision will survive" case: a superseded order
 * redirects to its newer revision, and the list shows the latest revision
 * alone, so both places only ever offer the current one.
 */
export function DeletePoDialog({
  poId,
  orderId,
  poNumber,
  lineItemCount,
  monthLabel,
  supersedesRevision,
  fromShop = false,
  variant = "button",
}: {
  poId: string;
  /** Our internal tracking ID; null on a scan. */
  orderId: string | null;
  /** The buyer's own PO number; null where they gave none. */
  poNumber: string | null;
  lineItemCount: number;
  /** e.g. "September 2026" — the month whose totals change. */
  monthLabel: string;
  /**
   * The revision number this order superseded, when it is itself a revision.
   * Deleting it un-hides that earlier order, which nobody would guess.
   */
  supersedesRevision: number | null;
  /**
   * A confirmed shop order has no upload to return to. Its web order goes
   * back to the queue instead, and the copy has to say that.
   */
  fromShop?: boolean;
  /**
   * `button` on the order's own page, which is gone once this succeeds, so it
   * returns to the list. `row` in the list's last column, which stays put:
   * the action's revalidation redraws the table without the row.
   */
  variant?: "button" | "row";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  // Whichever identifier the order has, named for what it is.
  const reference = orderId ?? poNumber ?? "";
  const referenceLabel = orderId ? "Order ID" : "PO number";
  const matches =
    reference !== "" && typed.trim().toLowerCase() === reference.trim().toLowerCase();

  return (
    <>
      {variant === "row" ? (
        <RowDeleteButton
          label={`Delete ${reference}`}
          onOpen={() => setOpen(true)}
        />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Delete
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {reference}?</DialogTitle>
            <DialogDescription>
              Removes the order, its {lineItemCount}{" "}
              {lineItemCount === 1 ? "line item" : "line items"} and its stage
              history.{" "}
              {fromShop
                ? "The buyer's order goes back to the queue as Needs review."
                : "The original document is kept, and this upload goes back to the review queue."}
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
            htmlFor="confirm-po-reference"
            className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
          >
            Confirm the {referenceLabel}
          </label>
          <Input
            id="confirm-po-reference"
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
                const result = await deletePurchaseOrder({
                  id: poId,
                  typedReference: typed,
                });
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(`${reference} deleted`);
                if (variant === "button") router.push("/purchase-orders");
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
