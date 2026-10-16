"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { linkBookingToShipment } from "@/actions/shipments";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";

const NONE: ComboboxOption = { id: "", label: "No shipment" };

/**
 * The shipment this booking belongs to (Phase 63; it named a purchase order
 * before). A reviewer picks it and it saves at once, or starts a new shipment
 * from this booking; anyone else reads it.
 */
export function BookingShipmentLink({
  bookingId,
  linked,
  options,
  canEdit,
  canCreate,
}: {
  bookingId: string;
  linked: { id: string; label: string } | null;
  options: ComboboxOption[];
  canEdit: boolean;
  canCreate: boolean;
}) {
  const [value, setValue] = useState(linked?.id ?? "");
  const all = linked && !options.some((o) => o.id === linked.id) ? [linked, ...options] : options;

  const choose = async (option: ComboboxOption) => {
    const previous = value;
    setValue(option.id);
    try {
      const result = await linkBookingToShipment({ bookingId, shipmentId: option.id || null });
      if (!result.success) {
        setValue(previous);
        toast.error(result.error);
      } else {
        toast.success(option.id ? "Added to the shipment" : "Taken off the shipment");
      }
    } catch {
      setValue(previous);
      toast.error("We couldn't reach the server. Try again.");
    }
  };

  const current = all.find((o) => o.id === value);
  return (
    <div className="flex min-w-0 flex-col gap-xxs">
      <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Shipment</span>
      {canEdit ? (
        <Combobox
          value={value || null}
          options={all}
          pinned={value ? [NONE] : undefined}
          placeholder="Choose the shipment this books"
          ariaLabel="Shipment this booking belongs to"
          onSelect={choose}
        />
      ) : null}
      {current ? (
        <Link
          href={`/shipments/${current.id}`}
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline"
        >
          Open {current.label.split(" · ")[0]}
        </Link>
      ) : canCreate ? (
        <Link
          href={`/shipments/new?booking=${bookingId}`}
          className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
        >
          New shipment from this booking
        </Link>
      ) : canEdit ? null : (
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">Not on a shipment</span>
      )}
    </div>
  );
}
