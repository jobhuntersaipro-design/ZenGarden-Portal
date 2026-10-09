"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { linkBookingToPurchaseOrder } from "@/actions/booking-confirmations";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";

const NONE: ComboboxOption = { id: "", label: "No purchase order" };

/**
 * The purchase order this booking ships. A reviewer picks it and it saves at
 * once; anyone else reads it. The order's page then shows this booking's vessels.
 */
export function BookingOrderLink({
  bookingId,
  linked,
  options,
  canEdit,
}: {
  bookingId: string;
  linked: { id: string; label: string } | null;
  options: ComboboxOption[];
  canEdit: boolean;
}) {
  const [value, setValue] = useState(linked?.id ?? "");
  // The linked order may be older than the newest 500 the picker offers.
  const all = linked && !options.some((o) => o.id === linked.id) ? [linked, ...options] : options;

  const choose = async (option: ComboboxOption) => {
    const previous = value;
    setValue(option.id);
    try {
      const result = await linkBookingToPurchaseOrder(bookingId, option.id || null);
      if (!result.success) {
        setValue(previous);
        toast.error(result.error);
      } else {
        toast.success(option.id ? "Purchase order linked" : "Purchase order unlinked");
      }
    } catch {
      setValue(previous);
      toast.error("We couldn't reach the server. Try again.");
    }
  };

  const current = all.find((o) => o.id === value);
  return (
    <div className="flex min-w-0 flex-col gap-xxs">
      <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Purchase order</span>
      {canEdit ? (
        <Combobox
          value={value || null}
          options={all}
          pinned={value ? [NONE] : undefined}
          placeholder="Choose the order this ships"
          ariaLabel="Purchase order this booking ships"
          onSelect={choose}
        />
      ) : null}
      {current ? (
        <Link
          href={`/purchase-orders/${current.id}`}
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline"
        >
          Open {current.label}
        </Link>
      ) : canEdit ? null : (
        <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">—</span>
      )}
    </div>
  );
}
