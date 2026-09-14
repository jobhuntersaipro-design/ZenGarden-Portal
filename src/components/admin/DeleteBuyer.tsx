"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteBuyer } from "@/actions/admin-buyers";
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
import { blockedMessage } from "@/lib/buyer-delete-message";

/**
 * The button is disabled with its reason beside it rather than failing on
 * click: the counts are already on the page, so a reader can know it will be
 * refused before they press it.
 */
export function DeleteBuyer({
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

  // One close path, called from both Cancel and `onOpenChange` (Escape,
  // overlay click, the built-in X): Cancel used to call `setOpen(false)`
  // directly, which skipped the `setTyped("")` cleanup that only lived in
  // `onOpenChange`. That let a typed name survive a Cancel and reopen,
  // enabling Delete with nothing re-typed — the opposite of what typing the
  // name is for.
  const close = () => {
    setOpen(false);
    setTyped("");
  };

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
            ? blockedMessage(purchaseOrders, webOrders)
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
          Delete buyer
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
              Type the buyer&apos;s name to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Type the buyer's name to confirm"
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
                  const result = await deleteBuyer(buyerId, typed);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  close();
                  toast.success(`${name} deleted.`);
                  push("/admin/buyers");
                } catch {
                  // An unguarded await here is what left the avatar picker
                  // permanently disabled on 2026-09-08 — the same trap,
                  // guarded the same way.
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
