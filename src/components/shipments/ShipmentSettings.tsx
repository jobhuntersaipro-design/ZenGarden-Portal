"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteShipment, updateShipment } from "@/actions/shipments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarketSelect } from "@/components/shipments/MarketSelect";
import { ModeChoice } from "@/components/shipments/ModeChoice";
import type { ShipmentMode } from "@/generated/prisma/enums";
import { toast } from "@/lib/toast";
import { formDDefault } from "@/lib/shipments/checklist";

/** Edit (market; Form D follows the market; notes have their own card) and Delete while empty. */
export function ShipmentSettings({
  id,
  market,
  formDRequired,
  mode,
  canDelete,
  markets,
  flags,
}: {
  id: string;
  market: string | null;
  formDRequired: boolean;
  mode: ShipmentMode;
  canDelete: boolean;
  markets: string[];
  flags: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const [values, setValues] = useState({ market: market ?? "", formDRequired, mode });
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<{ success: boolean; error?: string }>, done: string, after?: () => void) => {
    setBusy(true);
    try {
      const result = await work();
      if (!result.success) return void toast.error(result.error ?? "Something went wrong.");
      setOpen(null);
      toast.success(done);
      after?.();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-sm">
      <Button variant="secondary" onClick={() => setOpen("edit")}>
        Edit
      </Button>
      {canDelete ? (
        <Button variant="destructive" onClick={() => setOpen("delete")}>
          Delete
        </Button>
      ) : null}

      <Dialog open={open === "edit"} onOpenChange={(o) => !busy && setOpen(o ? "edit" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shipment</DialogTitle>
            <DialogDescription>How and where it is going. Form D follows the market.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-xs">
            <span id="shipment-edit-mode" className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Delivery
            </span>
            <ModeChoice value={values.mode} onChange={(m) => setValues({ ...values, mode: m })} labelledBy="shipment-edit-mode" />
          </div>
          <div className="flex flex-col gap-xs">
            <label
              htmlFor="shipment-edit-market"
              className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
            >
              Market
            </label>
            <MarketSelect
              id="shipment-edit-market"
              value={values.market}
              options={markets}
              flags={flags}
              className="h-control-md w-full rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:text-[length:var(--text-body-sm)]"
              onChange={(m) => setValues({ ...values, market: m, formDRequired: formDDefault(m) })}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button pending={busy} onClick={() => run(() => updateShipment({ id, ...values }), "Shipment saved")}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "delete"} onOpenChange={(o) => !busy && setOpen(o ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this shipment?</DialogTitle>
            <DialogDescription>Its orders are not changed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={busy}
              onClick={() => run(() => deleteShipment({ id }), "Shipment deleted", () => router.push("/shipments"))}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
