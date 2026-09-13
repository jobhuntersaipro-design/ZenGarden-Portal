"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteBuyer } from "@/actions/customers";
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

/**
 * The button is disabled with its reason beside it rather than failing on
 * click: the counts are already on the page, so a reader can know it will be
 * refused before they press it.
 */
export function DeleteCustomer({
  buyerId,
  name,
  contacts,
  purchaseOrders,
  webOrders,
}: {
  buyerId: string;
  name: string;
  contacts: number;
  purchaseOrders: number;
  webOrders: number;
}) {
  const { push } = useUrlNavigation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const blocked = purchaseOrders > 0 || webOrders > 0;
  const parts: string[] = [];
  if (purchaseOrders > 0) {
    parts.push(`${purchaseOrders} purchase order${purchaseOrders === 1 ? "" : "s"}`);
  }
  if (webOrders > 0) parts.push(`${webOrders} shop order${webOrders === 1 ? "" : "s"}`);

  // Case-insensitive and trimmed, the same rule the action applies — a dialog
  // that enables on something the server then rejects is a worse experience
  // than one that never enabled.
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Danger zone
      </p>
      <div className="mt-xs flex flex-wrap items-center justify-between gap-md">
        <p className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink-secondary">
          {blocked
            ? `${parts.join(" and ")} reference this customer, so it can't be deleted. Disable their shop contacts instead.`
            : `This removes ${name}${
                contacts > 0
                  ? ` and its ${contacts} shop contact${contacts === 1 ? "" : "s"}`
                  : ""
              }. There are no orders to lose.`}
        </p>
        <Button
          variant="secondary"
          disabled={blocked}
          // `bg-destructive` is the real token (`--color-destructive` →
          // `--color-accent-red`). There is no `brand-red`.
          className={blocked ? undefined : "bg-destructive text-canvas hover:bg-destructive/90"}
          onClick={() => setOpen(true)}
        >
          Delete customer
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Type the customer&apos;s name to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Type the customer's name to confirm"
            placeholder={name}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!matches}
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await deleteBuyer(buyerId, typed);
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(`${name} deleted.`);
                push("/admin/customers");
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
