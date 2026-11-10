import Link from "next/link";
import { ChecklistDots, ShipmentStatusBadge } from "@/components/shipments/ChecklistDots";
import { formatDate } from "@/lib/dates";
import type { BookingPreview as Booking, ShipmentPreview as Shipment } from "@/lib/queries/shipments";

const CAPTION = "text-[length:var(--text-caption)]";
const OPEN = `${CAPTION} self-start font-medium text-brand-link underline-offset-2 hover:underline`;

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-sm gap-y-xxs ${CAPTION}`}>
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-tertiary">{label}</dt>
          <dd className="min-w-0 break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Hovering a booking no.: the shipment it books space for. */
export function ShipmentPreview({ shipment }: { shipment: Shipment | null }) {
  if (!shipment)
    return (
      <div className="flex max-w-72 flex-col gap-xxs">
        <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">Not on a shipment yet</p>
        <p className={`${CAPTION} text-ink-secondary`}>Open the booking to link it to one.</p>
      </div>
    );
  const { checklist } = shipment;
  return (
    <div className="flex w-72 max-w-full flex-col gap-xs">
      <span className="flex items-center justify-between gap-sm">
        <span className="font-mono text-[length:var(--text-body-sm)] font-semibold text-ink">{shipment.reference}</span>
        <ShipmentStatusBadge status={checklist.status} />
      </span>
      <Facts
        facts={[
          ["Buyer", shipment.buyerName],
          [shipment.orders.length === 1 ? "PO" : "POs", shipment.orders.join(", ") || "—"],
          ["Documents", `${checklist.requiredDone} of ${checklist.requiredTotal}`],
        ]}
      />
      <ChecklistDots slots={checklist.slots} />
      {checklist.reason ? <p className={`${CAPTION} text-ink-secondary`}>{checklist.reason}</p> : null}
      {shipment.replacedBy ? (
        <p className={`${CAPTION} text-brand-amber-strong`}>Replaced on this shipment by {shipment.replacedBy}.</p>
      ) : null}
      <Link href={`/shipments/${shipment.id}`} className={OPEN}>
        Open shipment
      </Link>
    </div>
  );
}

/** Hovering a shipment row: its current booking. */
export function BookingPreview({ booking, earlier }: { booking: Booking | null; earlier: number }) {
  if (!booking)
    return (
      <div className="flex max-w-72 flex-col gap-xxs">
        <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">No booking yet</p>
        <p className={`${CAPTION} text-ink-secondary`}>Link or upload one on the shipment&apos;s page.</p>
      </div>
    );
  const vessel = [booking.feederVessel, booking.motherVessel].filter(Boolean).join(" / ");
  return (
    <div className="flex w-72 max-w-full flex-col gap-xs">
      <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">
        {booking.bookingNumber ? `Booking ${booking.bookingNumber}` : booking.originalName}
      </p>
      <Facts
        facts={[
          ["Carrier", booking.carrier ?? "—"],
          ["Route", `${booking.portOfLoading ?? "—"} → ${booking.portOfDischarge ?? "—"}`],
          ["ETD", booking.etdPol ? formatDate(booking.etdPol) : "—"],
          ["ETA", booking.etaPod ? formatDate(booking.etaPod) : "—"],
          ["Vessel", vessel || "—"],
        ]}
      />
      {earlier ? (
        <p className={`${CAPTION} text-ink-tertiary`}>
          Replaces {earlier} earlier {earlier === 1 ? "booking" : "bookings"}.
        </p>
      ) : null}
      <Link href={`/booking-confirmations/${booking.id}`} className={OPEN}>
        Open booking confirmation
      </Link>
    </div>
  );
}
