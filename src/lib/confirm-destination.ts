import { can } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";

/**
 * Where a confirmed PO opens: the shipment that already carries it, else the
 * new-shipment form with it ticked. Null means stay on the PO with a link to
 * Shipments: this user cannot create a shipment, and that form would 404 for
 * them.
 */
export async function confirmDestination(poId: string): Promise<string | null> {
  const onShipment = await prisma.shipment.findFirst({
    where: { orders: { some: { purchaseOrderId: poId } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (onShipment) return `/shipments/${onShipment.id}`;
  return (await can("shipment.manage")) ? `/shipments/new?po=${poId}` : null;
}
