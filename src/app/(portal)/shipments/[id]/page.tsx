import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { PagedList } from "@/components/portal/PagedList";
import { ShipmentProgress, ShipmentStatusBadge } from "@/components/shipments/ChecklistDots";
import { ContainersCard } from "@/components/shipments/ContainersCard";
import { ShipmentBookingCard } from "@/components/shipments/ShipmentBookingCard";
import { ShipmentDocumentsCard } from "@/components/shipments/ShipmentDocumentsCard";
import { ShipmentNotesCard } from "@/components/shipments/ShipmentNotesCard";
import { ShipmentOrdersCard } from "@/components/shipments/ShipmentOrdersCard";
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

async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePagePermission("shipment.view");
  const shipment = await loadShipment((await params).id);
  if (!shipment) notFound();
  const [canManage, canUpload] = await Promise.all([can("shipment.manage"), can("bc.upload")]);
  const [candidates, bookingOptions] = canManage
    ? await Promise.all([shippableOrders(shipment.buyer.id), unlinkedBookingOptions()])
    : [[], []];
  const { checklist } = shipment;

  return (
    <>
      <BackLink fallbackHref="/shipments" />
      <PageHeader
        eyebrow={`Shipment ${shipment.reference}`}
        title={shipment.buyer.name}
        action={
          canManage ? (
            <ShipmentSettings
              id={shipment.id}
              market={shipment.market}
              formDRequired={shipment.formDRequired}
              canDelete={shipment.documents.length === 0 && shipment.bookings.length === 0}
            />
          ) : null
        }
      />
      <div className="mb-lg flex flex-col gap-xs text-[length:var(--text-body-sm)] text-ink-secondary">
        <p>
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
            canManage={canManage}
          />
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
          <ShipmentOrdersCard
            shipmentId={shipment.id}
            orders={shipment.orders}
            candidates={candidates}
            canManage={canManage}
          />
          <ShipmentBookingCard
            shipmentId={shipment.id}
            bookings={shipment.bookings.map((b) => ({ ...b, etdPol: iso(b.etdPol), etaPod: iso(b.etaPod) }))}
            options={bookingOptions}
            canManage={canManage}
            canUpload={canUpload}
          />
        </div>
      </div>
      <section className="mt-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Activity</h2>
        {shipment.events.length ? (
          <PagedList className="flex flex-col gap-xs">
            {shipment.events.map((e) => (
              <li key={e.id} className="text-[length:var(--text-body-sm)] text-ink">
                {e.actorName} {e.text}
                <span className="block text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatDateTime(e.at)}
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
