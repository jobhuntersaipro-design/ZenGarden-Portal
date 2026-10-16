"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteShipment, updateShipment } from "@/actions/shipments";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

/** Edit (market, Form D, note) and Delete while empty. */
export function ShipmentSettings({
  id,
  market,
  formDRequired,
  note,
  canDelete,
}: {
  id: string;
  market: string | null;
  formDRequired: boolean;
  note: string | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const [values, setValues] = useState({ market: market ?? "", formDRequired, note: note ?? "" });
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
            <DialogDescription>Market, Form D and the note.</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-xs">
            <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Market</span>
            <Input
              value={values.market}
              maxLength={80}
              className="h-control-md"
              onChange={(e) => setValues({ ...values, market: e.target.value })}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-sm">
            <Checkbox
              checked={values.formDRequired}
              onCheckedChange={(v) => setValues({ ...values, formDRequired: v === true })}
              aria-label="Needs Form D"
            />
            <span className="text-[length:var(--text-body-sm)]">Needs Form D</span>
          </label>
          <label className="flex flex-col gap-xs">
            <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Note</span>
            <Textarea
              value={values.note}
              maxLength={2000}
              onChange={(e) => setValues({ ...values, note: e.target.value })}
            />
          </label>
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
