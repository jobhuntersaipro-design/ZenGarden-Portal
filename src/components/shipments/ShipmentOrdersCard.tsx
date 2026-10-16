"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { PoStage } from "@/generated/prisma/enums";
import { addOrdersToShipment, removeOrderFromShipment } from "@/actions/shipments";
import { StageBadge } from "@/components/portal/StatusBadge";
import { OrderPicker } from "@/components/shipments/OrderPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import type { ShippableOrder } from "@/lib/queries/shipments";
import { toast } from "@/lib/toast";

type Order = { id: string; stage: PoStage; label: string; cartons: number };

export function ShipmentOrdersCard({
  shipmentId,
  orders,
  candidates,
  canManage,
}: {
  shipmentId: string;
  orders: Order[];
  candidates: ShippableOrder[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    setBusy(true);
    try {
      const result = await work();
      if (!result.success) return void toast.error(result.error ?? "Something went wrong.");
      await refresh();
      toast.success(done);
      setAdding(false);
      setRemoving(null);
      setPicked([]);
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex items-center justify-between gap-sm">
        <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Orders</h2>
        {canManage ? (
          <Button variant="secondary" className="h-control-md sm:h-control-sm" onClick={() => setAdding(true)}>
            Add order
          </Button>
        ) : null}
      </div>
      <ul className="mt-sm flex flex-col">
        {orders.map((o) => (
          <li key={o.id} className="flex min-w-0 items-center gap-sm border-b border-hairline py-xs last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-xxs">
              <Link
                href={`/purchase-orders/${o.id}`}
                className="truncate text-[length:var(--text-body-sm)] font-medium text-ink underline-offset-2 hover:underline"
              >
                {o.label}
              </Link>
              <span className="flex flex-wrap items-center gap-xs text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                <StageBadge stage={o.stage} />
                {o.cartons.toLocaleString("en-MY")} cartons
              </span>
            </div>
            {canManage && orders.length > 1 ? (
              <Button
                variant="ghost"
                className="size-11 p-0 sm:size-8"
                aria-label={`Remove ${o.label} from this shipment`}
                onClick={() => setRemoving(o)}
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog open={adding} onOpenChange={(open) => !busy && setAdding(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add orders</DialogTitle>
            <DialogDescription>The same buyer&apos;s orders that are not delivered yet.</DialogDescription>
          </DialogHeader>
          <div className="max-h-preview overflow-y-auto">
            <OrderPicker
              orders={candidates}
              selected={picked}
              onChange={setPicked}
              exclude={orders.map((o) => o.id)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              pending={busy}
              disabled={!picked.length}
              onClick={() =>
                run(() => addOrdersToShipment({ shipmentId, purchaseOrderIds: picked }), "Orders added")
              }
            >
              Add {picked.length || ""} {picked.length === 1 ? "order" : "orders"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this order?</DialogTitle>
            <DialogDescription>
              {removing ? `${removing.label} comes off this shipment. The order itself is not changed.` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={busy}
              onClick={() =>
                removing &&
                run(() => removeOrderFromShipment({ shipmentId, purchaseOrderId: removing.id }), "Order removed")
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
