"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteProduct } from "@/actions/products";
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
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { productBlockedMessage } from "@/lib/product-delete-message";

/**
 * The danger zone at the foot of a product, shaped like `DeleteBuyer` because
 * it is the same act: the button is disabled with its reason beside it rather
 * than failing on click, since the counts are already on this page and a
 * reader can know it will be refused before pressing.
 */
export function DeleteProduct({
  productId,
  name,
  images,
  purchaseOrderLines,
  shopOrderLines,
}: {
  productId: string;
  name: string;
  images: number;
  purchaseOrderLines: number;
  shopOrderLines: number;
}) {
  const { push } = useUrlNavigation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const blocked = purchaseOrderLines > 0 || shopOrderLines > 0;

  // One close path for Cancel and `onOpenChange` alike, so a typed name can
  // never survive a Cancel and enable Delete on reopen — the defect the buyer
  // dialog carried until Phase 26.
  const close = () => {
    setOpen(false);
    setTyped("");
  };

  // Trimmed and case-insensitive, the rule the action applies: a dialog that
  // enables on something the server then rejects is worse than one that
  // never enabled.
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Danger zone
      </p>
      <div className="mt-xs flex flex-wrap items-center justify-between gap-md">
        <p className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink-secondary">
          {blocked
            ? productBlockedMessage(purchaseOrderLines, shopOrderLines)
            : `This removes ${name}${
                images > 0
                  ? `, its ${images} image${images === 1 ? "" : "s"}`
                  : ""
              } and its price history. No order refers to it.`}
        </p>
        <Button
          variant="secondary"
          disabled={blocked}
          // `bg-destructive` is the real token (`--color-destructive` →
          // `--color-accent-red`). There is no `brand-red`.
          className={blocked ? undefined : "bg-destructive text-canvas hover:bg-destructive/90"}
          onClick={() => setOpen(true)}
        >
          Delete product
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Type the product&apos;s name to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Type the product's name to confirm"
            placeholder={name}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!matches}
              pending={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const result = await deleteProduct(productId, typed);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  close();
                  toast.success(`${name} deleted.`);
                  push("/products");
                } catch {
                  toast.error("We couldn't reach the server. Try again.");
                } finally {
                  setPending(false);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
