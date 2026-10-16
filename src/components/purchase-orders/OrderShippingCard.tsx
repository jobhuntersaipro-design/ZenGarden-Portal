import Link from "next/link";
import { VesselLink } from "@/components/booking-confirmations/VesselLink";
import { ChecklistDots, ShipmentStatusBadge } from "@/components/shipments/ChecklistDots";
import { AddToShipment } from "@/components/shipments/AddToShipment";
import { formatDate } from "@/lib/dates";
import type { OrderShipment } from "@/lib/queries/shipments";

/**
 * The shipments carrying this order (Phase 63): each with its papers'
 * checklist and the current booking's route, dates and vessels, each vessel's
 * live position one click away on VesselFinder.
 */
export function OrderShippingCard({
  purchaseOrderId,
  shipments,
  addTo,
}: {
  purchaseOrderId: string;
  shipments: OrderShipment[];
  /** The buyer's open shipments, when the reader may add this order to one. */
  addTo: { id: string; reference: string }[] | null;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Shipping</h2>
      {shipments.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">Not on a shipment yet.</p>
      ) : (
        <ul className="flex flex-col gap-md">
          {shipments.map((s) => {
            const bc = s.booking;
            return (
              <li key={s.id} className="flex min-w-0 flex-col gap-xxs">
                <Link
                  href={`/shipments/${s.id}`}
                  className="truncate text-[length:var(--text-body-sm)] font-semibold text-ink underline-offset-2 hover:underline"
                >
                  Shipment {s.reference}
                </Link>
                <span className="flex flex-wrap items-center gap-xs">
                  <ShipmentStatusBadge status={s.checklist.status} />
                  {s.checklist.reason ? (
                    <span
                      className={`text-[length:var(--text-caption)] ${s.checklist.status === "overdue" ? "text-accent-red" : "text-ink-secondary"}`}
                    >
                      {s.checklist.reason}
                    </span>
                  ) : null}
                </span>
                <ChecklistDots slots={s.checklist.slots} withLabels />
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {s.checklist.requiredDone} of {s.checklist.requiredTotal} required documents
                </p>
                {bc ? (
                  <>
                    <Link
                      href={`/booking-confirmations/${bc.id}`}
                      className="truncate text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:underline"
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
                  </>
                ) : (
                  <p className="text-[length:var(--text-body-sm)] text-ink-secondary">No booking yet</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {addTo ? (
        <AddToShipment
          purchaseOrderId={purchaseOrderId}
          shipments={addTo.filter((open) => !shipments.some((s) => s.id === open.id))}
        />
      ) : null}
    </section>
  );
}
