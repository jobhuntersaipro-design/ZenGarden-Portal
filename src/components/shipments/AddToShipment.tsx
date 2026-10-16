"use client";

import { useState } from "react";
import Link from "next/link";
import { addOrdersToShipment } from "@/actions/shipments";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { toast } from "@/lib/toast";

/** Puts this order on one of its buyer's open shipments, or starts a new one. */
export function AddToShipment({
  purchaseOrderId,
  shipments,
}: {
  purchaseOrderId: string;
  shipments: { id: string; reference: string }[];
}) {
  const refresh = useAwaitableRefresh();
  const [busy, setBusy] = useState(false);
  const choose = async (option: ComboboxOption) => {
    setBusy(true);
    try {
      const result = await addOrdersToShipment({ shipmentId: option.id, purchaseOrderIds: [purchaseOrderId] });
      if (!result.success) return void toast.error(result.error);
      await refresh();
      toast.success(`Added to ${option.label}`);
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-md flex min-w-0 flex-col gap-xs border-t border-hairline pt-sm" aria-busy={busy}>
      {shipments.length ? (
        <Combobox
          value={null}
          options={shipments.map((s) => ({ id: s.id, label: s.reference }))}
          placeholder="Add to a shipment"
          ariaLabel="Add this order to a shipment"
          onSelect={choose}
        />
      ) : null}
      <Link
        href={`/shipments/new?po=${purchaseOrderId}`}
        className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
      >
        New shipment with this order
      </Link>
    </div>
  );
}
