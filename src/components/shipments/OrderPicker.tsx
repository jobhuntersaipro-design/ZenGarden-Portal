"use client";

import { StageBadge } from "@/components/portal/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/dates";
import type { ShippableOrder } from "@/lib/queries/shipments";

/** A buyer's live orders as checkboxes: Order ID / PO number, PO date, cartons, stage. */
export function OrderPicker({
  orders,
  selected,
  onChange,
  exclude = [],
}: {
  orders: ShippableOrder[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Orders already on this shipment: shown nowhere. */
  exclude?: string[];
}) {
  const shown = orders.filter((o) => !exclude.includes(o.id));
  if (!shown.length) {
    return (
      <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
        No orders waiting to ship for this buyer.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
      {shown.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <li key={o.id}>
            <label className="flex min-w-0 cursor-pointer items-start gap-sm px-sm py-xs">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onChange(value ? [...selected, o.id] : selected.filter((id) => id !== o.id))
                }
                aria-label={o.label}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-xxs">
                <span className="flex flex-wrap items-center gap-xs">
                  <span className="text-[length:var(--text-body-sm)] font-medium text-ink">{o.label}</span>
                  <StageBadge stage={o.stage} />
                </span>
                <span className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                  PO date {formatDate(o.poDate)} · {o.cartons.toLocaleString("en-MY")} cartons
                  {o.onShipments.length ? ` · Also on ${o.onShipments.join(", ")}` : ""}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
