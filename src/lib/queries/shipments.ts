import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus, PoStage, type ShipmentDocType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { STATUS_ORDER, shipmentChecklist, type ShipmentStatus, type SlotKey } from "@/lib/shipments/checklist";

/**
 * Shipments (Phase 63). Staff only: no shop route or shop query reads these
 * tables (`shop-shipment-leak.test.ts`).
 */

const BOOKING_SELECT = {
  id: true,
  bookingNumber: true,
  originalName: true,
  carrier: true,
  portOfLoading: true,
  portOfDischarge: true,
  etdPol: true,
  etaPod: true,
  feederVessel: true,
  motherVessel: true,
  uploadedAt: true,
} satisfies Prisma.BookingConfirmationSelect;

export type ShipmentBooking = Prisma.BookingConfirmationGetPayload<{ select: typeof BOOKING_SELECT }>;

/** A rolled booking is re-issued: the newest upload is the current one. */
const bookingsOf = {
  where: { status: { not: BookingStatus.UPLOADING } },
  orderBy: { uploadedAt: "desc" },
  select: BOOKING_SELECT,
} satisfies Prisma.Shipment$bookingsArgs;

const currentDocs = {
  where: { supersededAt: null },
  select: { type: true },
} satisfies Prisma.Shipment$documentsArgs;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** The one reading of a shipment's papers every screen shares. A PO's own card passes `hasOrders` true. */
const checklistOf = (s: {
  formDRequired: boolean;
  orders?: unknown[];
  bookings: unknown[];
  documents: { type: ShipmentDocType }[];
}) =>
  shipmentChecklist({
    hasOrders: s.orders ? s.orders.length > 0 : true,
    hasBooking: s.bookings.length > 0,
    current: s.documents.map((d) => d.type),
    formDRequired: s.formDRequired,
  });

export type ShipmentFilters = {
  q?: string;
  status?: ShipmentStatus;
  missing?: SlotKey;
  buyerId?: string;
  market?: string;
  etdFrom?: string;
  etdTo?: string;
  sort: "status" | "etd" | "eta" | "createdAt";
  dir: "asc" | "desc";
};

export function shipmentWhere(q?: string): Prisma.ShipmentWhereInput {
  if (!q) return {};
  const like = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { reference: like },
      { market: like },
      { buyer: { name: like } },
      {
        bookings: {
          some: {
            OR: [
              { bookingNumber: like },
              { feederVessel: like },
              { motherVessel: like },
              { portOfDischarge: like },
            ],
          },
        },
      },
      { containers: { some: { containerNo: like } } },
      {
        orders: {
          some: {
            purchaseOrder: {
              OR: [
                { poNumber: like },
                { buyerReference: like },
                { webOrder: { reference: like } },
              ],
            },
          },
        },
      },
    ],
  };
}

/**
 * The list, filtered and sorted in memory: status is derived from the papers,
 * not stored, so it cannot be a `where`.
 * ponytail: every shipment matching the search is read; push filters into SQL past a few thousand.
 */
export async function listShipments(filters: ShipmentFilters, page: number, size: number) {
  const shipments = await prisma.shipment.findMany({
    where: shipmentWhere(filters.q),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      market: true,
      formDRequired: true,
      createdAt: true,
      buyer: { select: { id: true, name: true } },
      orders: { select: { purchaseOrder: { select: ORDER_IDENTITY_SELECT } } },
      bookings: bookingsOf,
      documents: currentDocs,
      containers: { orderBy: { createdAt: "asc" }, select: { containerNo: true, size: true } },
    },
  });
  const all = shipments.map((s) => {
    const checklist = checklistOf(s);
    return {
      id: s.id,
      reference: s.reference,
      market: s.market,
      buyer: s.buyer,
      createdAt: s.createdAt.toISOString(),
      orders: s.orders.map((o) => orderLabel(orderIdentity(o.purchaseOrder))),
      etd: day(s.bookings[0]?.etdPol),
      eta: day(s.bookings[0]?.etaPod),
      // The customer's sheet reads a shipment by these: where it goes, in
      // which box, on which ship (2026-10-17).
      portOfDischarge: s.bookings[0]?.portOfDischarge ?? null,
      vessel: s.bookings[0]?.feederVessel ?? s.bookings[0]?.motherVessel ?? null,
      containers: s.containers,
      checklist,
    };
  });
  // Options are read off the rows, so a select never offers what nothing carries.
  const buyers = [...new Map(all.map((r) => [r.buyer.id, r.buyer])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const markets = [...new Set(all.map((r) => r.market).filter((m): m is string => Boolean(m)))].sort();
  const resolved = {
    ...filters,
    buyerId: buyers.some((b) => b.id === filters.buyerId) ? filters.buyerId : undefined,
    market: markets.includes(filters.market ?? "") ? filters.market : undefined,
  };
  const narrowed = all.filter(
    (r) =>
      (!resolved.buyerId || r.buyer.id === resolved.buyerId) &&
      (!resolved.market || r.market === resolved.market) &&
      (!resolved.etdFrom || (r.etd !== null && r.etd >= resolved.etdFrom)) &&
      (!resolved.etdTo || (r.etd !== null && r.etd <= resolved.etdTo)) &&
      (!resolved.missing ||
        r.checklist.missing.includes(resolved.missing)),
  );
  const counts = Object.fromEntries(STATUS_ORDER.map((st) => [st, narrowed.filter((r) => r.checklist.status === st).length])) as Record<ShipmentStatus, number>;
  const rows = resolved.status ? narrowed.filter((r) => r.checklist.status === resolved.status) : narrowed;
  const sign = filters.dir === "asc" ? 1 : -1;
  const key = (r: (typeof rows)[number]) =>
    filters.sort === "status" ? String(STATUS_ORDER.indexOf(r.checklist.status)) : filters.sort === "createdAt" ? r.createdAt : r[filters.sort];
  rows.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    // A blank sorts last in both directions (00-master §4).
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return x < y ? -sign : x > y ? sign : (a.etd ?? "9").localeCompare(b.etd ?? "9");
  });
  return {
    total: rows.length,
    all: narrowed.length,
    counts,
    buyers,
    markets,
    resolved,
    rows: rows.slice((page - 1) * size, page * size),
  };
}

export type ShipmentListRow = Awaited<ReturnType<typeof listShipments>>["rows"][number];

const cartonsOf = (lines: { quantity: Prisma.Decimal }[]) =>
  lines.reduce((sum, line) => sum + Number(line.quantity), 0);

/** Matches `NOTE` in the shipments actions: a note on the shipment's feed. */
export const SHIPMENT_NOTE = "NOTE";

export async function loadShipment(id: string) {
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true } },
      createdBy: { select: { name: true, image: true, role: true } },
      orders: {
        orderBy: { addedAt: "asc" },
        select: {
          purchaseOrder: {
            select: {
              id: true,
              stage: true,
              poDate: true,
              ...ORDER_IDENTITY_SELECT,
              lineItems: { select: { quantity: true } },
            },
          },
        },
      },
      bookings: bookingsOf,
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          type: true,
          label: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedByName: true,
          uploadedAt: true,
          supersededAt: true,
        },
      },
      // Notes are read on their own below, so a busy feed never pushes one off.
      events: { where: { action: { not: SHIPMENT_NOTE } }, orderBy: { at: "desc" }, take: 50 },
      containers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          containerNo: true,
          sealNo: true,
          size: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
          media: {
            orderBy: { uploadedAt: "asc" },
            select: { id: true, kind: true, originalName: true, uploadedByName: true, uploadedAt: true },
          },
        },
      },
    },
  });
  if (!s) return null;
  const notes = await prisma.shipmentEvent.findMany({
    where: { shipmentId: id, action: SHIPMENT_NOTE },
    orderBy: { at: "desc" },
    select: { id: true, text: true, at: true, actorName: true, actor: { select: { image: true, role: true } } },
  });
  const orders = s.orders.map(({ purchaseOrder: po }) => ({
    id: po.id,
    stage: po.stage,
    poDate: po.poDate.toISOString(),
    label: orderLabel(orderIdentity(po)),
    cartons: cartonsOf(po.lineItems),
  }));
  return {
    ...s,
    notes,
    orders,
    cartons: orders.reduce((sum, o) => sum + o.cartons, 0),
    checklist: checklistOf({ ...s, documents: s.documents.filter((d) => !d.supersededAt) }),
  };
}

export type LoadedShipment = NonNullable<Awaited<ReturnType<typeof loadShipment>>>;
export type ShipmentDocumentRow = LoadedShipment["documents"][number];

/** The shipments carrying one PO, for its Shipping card. */
export async function shipmentsForOrder(purchaseOrderId: string) {
  const shipments = await prisma.shipment.findMany({
    where: { orders: { some: { purchaseOrderId } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reference: true,
      formDRequired: true,
      createdAt: true,
      bookings: bookingsOf,
      documents: currentDocs,
    },
  });
  return shipments.map((s) => ({
    id: s.id,
    reference: s.reference,
    booking: s.bookings[0] ?? null,
    checklist: checklistOf(s),
  }));
}

export type OrderShipment = Awaited<ReturnType<typeof shipmentsForOrder>>[number];

/** A buyer's shipments still waiting on their bill of lading, newest first. */
export function openShipmentsForBuyer(buyerId: string) {
  return prisma.shipment.findMany({
    where: {
      buyerId,
      documents: { none: { type: "BILL_OF_LADING", supersededAt: null } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, reference: true },
  });
}

/** Every shipment, for the BC page's picker. ponytail: newest 500. */
export async function shipmentOptions() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, reference: true, createdAt: true, buyer: { select: { name: true } } },
  });
  return shipments.map((s) => ({
    id: s.id,
    label: `${s.reference} · ${s.buyer.name}`,
    hint: formatDate(s.createdAt),
  }));
}

/** Bookings on no shipment, for "Link a booking". */
export async function unlinkedBookingOptions() {
  const bookings = await prisma.bookingConfirmation.findMany({
    where: { shipmentId: null, status: { not: BookingStatus.UPLOADING } },
    orderBy: { uploadedAt: "desc" },
    take: 200,
    select: { id: true, bookingNumber: true, originalName: true, etdPol: true },
  });
  return bookings.map((b) => ({
    id: b.id,
    label: b.bookingNumber ? `Booking ${b.bookingNumber}` : b.originalName,
    hint: b.etdPol ? `ETD ${formatDate(b.etdPol)}` : b.originalName,
  }));
}

/** Buyers with something to ship, for the new-shipment form. */
export function shipmentBuyerOptions() {
  return prisma.buyer.findMany({
    where: { purchaseOrders: { some: { stage: { not: PoStage.DELIVERED }, supersededBy: null } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, market: true },
  });
}

/** A buyer's live orders not yet delivered, newest first, each with any shipment it is already on. */
export async function shippableOrders(buyerId: string) {
  const orders = await prisma.purchaseOrder.findMany({
    where: { buyerId, stage: { not: PoStage.DELIVERED }, supersededBy: null },
    orderBy: [{ poDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      stage: true,
      poDate: true,
      ...ORDER_IDENTITY_SELECT,
      lineItems: { select: { quantity: true } },
      shipments: { select: { shipment: { select: { reference: true } } } },
    },
  });
  return orders.map((po) => ({
    id: po.id,
    stage: po.stage,
    label: orderLabel(orderIdentity(po)),
    poDate: po.poDate.toISOString(),
    cartons: cartonsOf(po.lineItems),
    onShipments: po.shipments.map((s) => s.shipment.reference),
  }));
}

export type ShippableOrder = Awaited<ReturnType<typeof shippableOrders>>[number];
