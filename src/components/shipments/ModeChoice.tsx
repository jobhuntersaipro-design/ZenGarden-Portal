"use client";

import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import type { ShipmentMode } from "@/generated/prisma/enums";

/** By sea or by land (2026-11-24): a shipment is one or the other. */
export function ModeChoice({
  value,
  onChange,
  labelledBy,
}: {
  value: ShipmentMode;
  onChange: (mode: ShipmentMode) => void;
  labelledBy: string;
}) {
  return (
    <RadioCards
      aria-labelledby={labelledBy}
      layout="grid"
      minColumnWidth={180}
      value={value}
      onValueChange={(next) => onChange(next as ShipmentMode)}
      options={[
        { value: "SEA", label: "By sea", description: "Booking, container and bill of lading" },
        { value: "LAND", label: "By land", description: "Truck details typed in by hand" },
      ]}
    />
  );
}
