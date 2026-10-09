import Link from "next/link";
import { VesselLink } from "@/components/booking-confirmations/VesselLink";
import { formatDate } from "@/lib/dates";

export type OrderBooking = {
  id: string;
  bookingNumber: string | null;
  originalName: string;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  etdPol: Date | null;
  etaPod: Date | null;
  feederVessel: string | null;
  motherVessel: string | null;
};

/**
 * The booking confirmations that ship this order, with each vessel's live
 * position one click away on VesselFinder.
 */
export function OrderShippingCard({ bookings }: { bookings: OrderBooking[] }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Shipping</h2>
      {bookings.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          No vessel set. Link this order from its booking confirmation.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {bookings.map((bc) => (
            <li key={bc.id} className="flex min-w-0 flex-col gap-xxs">
              <Link
                href={`/booking-confirmations/${bc.id}`}
                className="truncate text-[length:var(--text-body-sm)] font-semibold text-ink underline-offset-2 hover:underline"
                title={bc.bookingNumber ?? bc.originalName}
              >
                {bc.bookingNumber ? `Booking ${bc.bookingNumber}` : bc.originalName}
              </Link>
              {bc.portOfLoading || bc.portOfDischarge ? (
                <p className="text-[length:var(--text-caption)] text-ink-secondary">
                  {[bc.portOfLoading, bc.portOfDischarge].map((port) => port ?? "—").join(" → ")}
                </p>
              ) : null}
              <p className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
                ETD {bc.etdPol ? formatDate(bc.etdPol) : "—"} · ETA {bc.etaPod ? formatDate(bc.etaPod) : "—"}
              </p>
              {[
                { label: "Feeder", vessel: bc.feederVessel },
                { label: "Mother", vessel: bc.motherVessel },
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
              {!bc.feederVessel && !bc.motherVessel ? (
                <p className="text-[length:var(--text-body-sm)] text-ink-secondary">No vessel set</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
