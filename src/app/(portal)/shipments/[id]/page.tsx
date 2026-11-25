import { marketFlags } from "@/lib/flags";
import type { Metadata } from "next";
import Link from "next/link";
import { Ship, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { PagedList } from "@/components/portal/PagedList";
import { ShipmentProgress, ShipmentStatusBadge } from "@/components/shipments/ChecklistDots";
import { ContainersCard } from "@/components/shipments/ContainersCard";
import { LandDeliveryCard } from "@/components/shipments/LandDeliveryCard";
import { ShipmentBookingCard } from "@/components/shipments/ShipmentBookingCard";
import { ShipmentDocumentsCard } from "@/components/shipments/ShipmentDocumentsCard";
import { ShipmentNotesCard } from "@/components/shipments/ShipmentNotesCard";
import { ShipmentOrdersCard } from "@/components/shipments/ShipmentOrdersCard";
import { ShipmentPalletsCard } from "@/components/shipments/ShipmentPalletsCard";
import { PersonAvatar } from "@/components/ui/person";
import { roleLabel } from "@/lib/permissions/roles";
import { listLabels } from "@/lib/queries/products";
import { ShipmentSettings } from "@/components/shipments/ShipmentSettings";
import { formatDateTime } from "@/lib/dates";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { loadShipment, shippableOrders, unlinkedBookingOptions } from "@/lib/queries/shipments";
import { withLoadingFloor } from "@/lib/loading-floor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const shipment = (await can("shipment.view")) ? await loadShipment((await params).id) : null;
  return { title: `${shipment ? `Shipment ${shipment.reference}` : "Shipment"} · Zen Garden Portal` };
}

const iso = (d: Date | null) => d?.toISOString() ?? null;
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";

async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePagePermission("shipment.view");
  const shipment = await loadShipment((await params).id);
  if (!shipment) notFound();
  const [canManage, canUpload] = await Promise.all([can("shipment.manage"), can("bc.upload")]);
  const [candidates, bookingOptions, markets] = canManage
    ? await Promise.all([shippableOrders(shipment.buyer.id), unlinkedBookingOptions(), listLabels("market")])
    : [[], [], []];
  const { checklist } = shipment;
  const land = shipment.mode === "LAND";
  const ModeIcon = land ? Truck : Ship;

  return (
    <>
      <BackLink fallbackHref="/shipments" />
      <PageHeader
        eyebrow={
          shipment.orders.length ? (
            <span className="break-words">
              {shipment.orders.length === 1 ? "PO number " : "PO numbers "}
              {shipment.orders.map((o, i) => (
                <span key={o.id}>
                  {i > 0 ? ", " : null}
                  <Link href={`/purchase-orders/${o.id}`} className="text-ink-secondary underline-offset-2 hover:underline">
                    {o.poNumber}
                  </Link>
                </span>
              ))}
            </span>
          ) : (
            "No PO yet"
          )
        }
        title={shipment.buyer.name}
        action={
          canManage ? (
            <ShipmentSettings
              id={shipment.id}
              market={shipment.market}
              formDRequired={shipment.formDRequired}
              mode={shipment.mode}
              canDelete={shipment.documents.length === 0 && shipment.bookings.length === 0}
              markets={markets}
              flags={marketFlags(markets)}
            />
          ) : null
        }
      />
      <div className="mb-lg flex flex-col gap-xs text-[length:var(--text-body-sm)] text-ink-secondary">
        <p className="flex flex-wrap items-center gap-x-xs">
          <span className="inline-flex items-center gap-xxs text-ink">
            <ModeIcon aria-hidden className={`size-4 ${land ? "text-mode-land" : "text-accent-blue"}`} />
            {land ? "By land" : "By sea"}
          </span>
          <span aria-hidden>·</span>
          {shipment.market ?? "No market"} · {shipment.orders.length}{" "}
          {shipment.orders.length === 1 ? "order" : "orders"} · {shipment.cartons.toLocaleString("en-MY")} cartons
          {" · "}
          <Link href={`/buyers/${shipment.buyer.id}`} className="text-brand-link underline-offset-2 hover:underline">
            Buyer
          </Link>
        </p>
      </div>

      <section className="mb-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <div className="mb-sm flex flex-wrap items-center gap-sm">
          <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Progress</h2>
          <ShipmentStatusBadge status={checklist.status} />
          <span className="text-[length:var(--text-body-sm)] tabular-nums text-ink-secondary">
            {checklist.requiredDone} of {checklist.requiredTotal} documents
          </span>
        </div>
        <ShipmentProgress slots={checklist.slots} />
      </section>

      {/* Orders first, with the pallets they make up (2026-11-25); on a land
          shipment the truck's share sits beside them. */}
      <div className={`mb-lg grid grid-cols-1 gap-lg ${land ? "lg:grid-cols-2" : ""}`}>
        <ShipmentOrdersCard
          shipmentId={shipment.id}
          orders={shipment.orders}
          pallets={shipment.pallets}
          candidates={candidates}
          canManage={canManage}
        />
        {land ? (
          <ShipmentPalletsCard
            total={shipment.pallets}
            unpalletedLines={shipment.unpalletedLines}
            trucks={shipment.trucks.map((t) => ({ pallets: t.landPallets, status: t.landStatus }))}
          />
        ) : null}
      </div>

      {/* The trucks sit under the orders and pallets they carry (2026-11-25). */}
      {land ? (
        <div className="mb-lg">
          <LandDeliveryCard
            shipmentId={shipment.id}
            canManage={canManage}
            trucks={shipment.trucks.map((t) => ({
              id: t.id,
              landCompany: t.landCompany ?? "",
              landVehiclePlate: t.landVehiclePlate ?? "",
              landDriverName: t.landDriverName ?? "",
              landDriverIc: t.landDriverIc ?? "",
              landDriverPhone: t.landDriverPhone ?? "",
              landBorderCrossing: t.landBorderCrossing ?? "",
              landPickupOn: day(t.landPickupOn),
              landEtaOn: day(t.landEtaOn),
              landDeliveredOn: day(t.landDeliveredOn),
              landPallets: t.landPallets?.toString() ?? "",
              landStatus: t.landStatus,
            }))}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-lg xl:grid-cols-document">
        <div className="flex min-w-0 flex-col gap-lg">
          <ShipmentDocumentsCard
            shipmentId={shipment.id}
            slots={checklist.slots}
            documents={shipment.documents.map((d) => ({
              ...d,
              uploadedAt: d.uploadedAt.toISOString(),
              supersededAt: iso(d.supersededAt),
            }))}
            booking={
              shipment.bookings[0]
                ? {
                    id: shipment.bookings[0].id,
                    bookingNumber: shipment.bookings[0].bookingNumber,
                    originalName: shipment.bookings[0].originalName,
                    uploadedByName: shipment.bookings[0].uploadedBy.name,
                    uploadedAt: shipment.bookings[0].uploadedAt.toISOString(),
                  }
                : null
            }
            canManage={canManage}
          />
          {land ? null : (
            <ContainersCard
            shipmentId={shipment.id}
            canManage={canManage}
            containers={shipment.containers.map((c) => ({
              ...c,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
              createdBy: c.createdBy.name,
              updatedBy: c.updatedBy?.name ?? null,
              media: c.media.map((m) => ({ ...m, uploadedAt: m.uploadedAt.toISOString() })),
            }))}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-lg">
          <ShipmentNotesCard
            shipmentId={shipment.id}
            canManage={canManage}
            notes={shipment.notes.map((n) => ({
              id: n.id,
              text: n.text,
              at: n.at.toISOString(),
              editedAt: iso(n.editedAt),
              author: n.actorName,
              image: n.actor?.image ?? null,
              role: n.actor?.role ?? null,
              canChange: canManage && (n.actorId === viewer.id || viewer.role === "SUPER_ADMIN"),
            }))}
          />
          {land ? null : (
            <ShipmentBookingCard
              shipmentId={shipment.id}
              bookings={shipment.bookings.map((b) => ({ ...b, etdPol: iso(b.etdPol), etaPod: iso(b.etaPod) }))}
              options={bookingOptions}
              canManage={canManage}
              canUpload={canUpload}
            />
          )}
        </div>
      </div>
      <section className="mt-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Activity</h2>
        {shipment.events.length ? (
          <PagedList as="ol" className="flex flex-col gap-sm">
            {/* The purchase order's feed, row for row (2026-11-25). */}
            {shipment.events.map((e) => (
              <li key={e.id} className="flex items-start gap-sm border-b border-hairline pb-sm last:border-0 last:pb-0">
                <PersonAvatar name={e.actorName} image={e.actor?.image ?? null} className="mt-xxs" />
                <span className="flex min-w-0 flex-col gap-xxs">
                  <span className="self-start rounded-pill bg-surface-soft px-xs py-xxs font-mono text-[length:var(--text-caption)] text-ink-secondary">
                    Activity
                  </span>
                  <span className="break-words text-[length:var(--text-body-sm)] leading-loose text-ink">
                    {e.actorName} {e.text}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                    {e.actorName}
                    {e.actor?.role ? ` · ${roleLabel(e.actor.role)}` : ""} · {formatDateTime(e.at)}
                  </span>
                </span>
              </li>
            ))}
          </PagedList>
        ) : (
          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">Nothing yet.</p>
        )}
      </section>
    </>
  );
}

export default withLoadingFloor(ShipmentPage);
