import type { Metadata } from "next";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { NewShipmentForm } from "@/components/shipments/NewShipmentForm";
import { requirePagePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";
import { shipmentBuyerOptions, shippableOrders } from "@/lib/queries/shipments";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "New shipment · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function NewShipmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission("shipment.manage");
  const params = await searchParams;
  const poId = firstParam(params, "po") ?? null;
  const bookingId = firstParam(params, "booking") ?? null;
  // `?po=` from a PO page picks that order's buyer and ticks the order.
  const fromOrder = poId
    ? await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { id: true, buyerId: true } })
    : null;
  const buyerId = firstParam(params, "buyer") ?? fromOrder?.buyerId ?? null;
  const [buyers, orders] = await Promise.all([
    shipmentBuyerOptions(),
    buyerId ? shippableOrders(buyerId) : Promise.resolve([]),
  ]);

  return (
    <>
      <BackLink fallbackHref="/shipments" />
      <PageHeader eyebrow="Shipments" title="New shipment" />
      <NewShipmentForm
        key={buyerId ?? "none"}
        buyers={buyers}
        buyerId={buyers.some((b) => b.id === buyerId) ? buyerId : null}
        orders={orders}
        preselected={fromOrder && fromOrder.buyerId === buyerId ? [fromOrder.id] : []}
        bookingId={bookingId}
      />
    </>
  );
}

export default withLoadingFloor(NewShipmentPage);
