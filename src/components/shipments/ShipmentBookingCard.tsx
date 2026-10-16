"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { linkBookingToShipment } from "@/actions/shipments";
import { VesselLink } from "@/components/booking-confirmations/VesselLink";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";
import { Button } from "@/components/ui/button";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import { toast } from "@/lib/toast";

export type CardBooking = {
  id: string;
  bookingNumber: string | null;
  originalName: string;
  carrier: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  etdPol: string | null;
  etaPod: string | null;
  feederVessel: string | null;
  motherVessel: string | null;
};

const nameOf = (bc: CardBooking) => (bc.bookingNumber ? `Booking ${bc.bookingNumber}` : bc.originalName);

/** The current booking, older ones as "Replaced", and the link to add one. */
export function ShipmentBookingCard({
  shipmentId,
  bookings,
  options,
  canManage,
  canUpload,
}: {
  shipmentId: string;
  bookings: CardBooking[];
  options: ComboboxOption[];
  canManage: boolean;
  canUpload: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [busy, setBusy] = useState(false);
  const [current, ...replaced] = bookings;

  const link = async (bookingId: string, to: string | null, done: string) => {
    setBusy(true);
    try {
      const result = await linkBookingToShipment({ bookingId, shipmentId: to });
      if (!result.success) return void toast.error(result.error);
      await refresh();
      toast.success(done);
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg" aria-busy={busy}>
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Booking confirmation</h2>
      {current ? (
        <div className="flex min-w-0 flex-col gap-xxs">
          <div className="flex min-w-0 items-center gap-sm">
            <Link
              href={`/booking-confirmations/${current.id}`}
              className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] font-semibold text-ink underline-offset-2 hover:underline"
            >
              {nameOf(current)}
            </Link>
            {canManage ? (
              <Button
                variant="ghost"
                className="size-11 p-0 sm:size-8"
                aria-label={`Take ${nameOf(current)} off this shipment`}
                onClick={() => link(current.id, null, "Booking taken off")}
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
          </div>
          {current.carrier ? (
            <p className="text-[length:var(--text-caption)] text-ink-secondary">{current.carrier}</p>
          ) : null}
          <p className="text-[length:var(--text-caption)] text-ink-secondary">
            {[current.portOfLoading, current.portOfDischarge].map((p) => p ?? "—").join(" → ")}
          </p>
          <p className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
            ETD {current.etdPol ? formatDate(current.etdPol) : "—"} · ETA{" "}
            {current.etaPod ? formatDate(current.etaPod) : "—"}
          </p>
          {[
            { label: "Feeder", vessel: current.feederVessel },
            { label: "Mother", vessel: current.motherVessel },
          ].map(({ label, vessel }) =>
            vessel ? (
              <div key={label} className="flex min-w-0 flex-col">
                <span className="text-[length:var(--text-body-sm)] text-ink">
                  {label} · {vessel}
                </span>
                <VesselLink vessel={vessel} />
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">No booking yet.</p>
      )}
      {replaced.length ? (
        <ul className="mt-sm flex flex-col gap-xxs border-t border-hairline pt-xs">
          {replaced.map((bc) => (
            <li key={bc.id} className="text-[length:var(--text-caption)] text-ink-tertiary">
              Replaced ·{" "}
              <Link href={`/booking-confirmations/${bc.id}`} className="underline-offset-2 hover:underline">
                {nameOf(bc)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {canManage ? (
        <div className="mt-md flex flex-col gap-xs border-t border-hairline pt-sm">
          {options.length ? (
            <Combobox
              value={null}
              options={options}
              placeholder="Link a booking"
              ariaLabel="Link a booking confirmation to this shipment"
              onSelect={(option) => link(option.id, shipmentId, "Booking linked")}
            />
          ) : null}
          {canUpload ? (
            <Link
              href="/booking-confirmations/upload"
              className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
            >
              Upload a booking
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
