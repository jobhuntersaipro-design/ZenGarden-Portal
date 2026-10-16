import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus, PoStage, type ShipmentDocType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { shipmentChecklist } from "@/lib/shipments/checklist";

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

const checklistOf = (s: {
  formDRequired: boolean;
  bookings: unknown[];
  documents: { type: ShipmentDocType }[];
}) =>
  shipmentChecklist({
    hasBooking: s.bookings.length > 0,
    current: s.documents.map((d) => d.type),
    formDRequired: s.formDRequired,
  });


export function shipmentWhere(q?: string): Prisma.ShipmentWhereInput {
  if (!q) return {};
  const like = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { reference: like },
      { market: like },
      { buyer: { name: like } },
      { bookings: { some: { bookingNumber: like } } },
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

export async function listShipments({ q, page, size }: { q?: string; page: number; size: number }) {
  const where = shipmentWhere(q);
  const [rows, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
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
      },
    }),
    prisma.shipment.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      reference: s.reference,
      market: s.market,
      buyer: s.buyer,
      createdAt: s.createdAt.toISOString(),
      orders: s.orders.map((o) => orderLabel(orderIdentity(o.purchaseOrder))),
      etd: s.bookings[0]?.etdPol?.toISOString() ?? null,
      eta: s.bookings[0]?.etaPod?.toISOString() ?? null,
      checklist: checklistOf(s),
    })),
  };
}

export type ShipmentListRow = Awaited<ReturnType<typeof listShipments>>["rows"][number];

const cartonsOf = (lines: { quantity: Prisma.Decimal }[]) =>
  lines.reduce((sum, line) => sum + Number(line.quantity), 0);

export async function loadShipment(id: string) {
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
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
      events: { orderBy: { at: "desc" }, take: 50 },
    },
  });
  if (!s) return null;
  const orders = s.orders.map(({ purchaseOrder: po }) => ({
    id: po.id,
    stage: po.stage,
    poDate: po.poDate.toISOString(),
    label: orderLabel(orderIdentity(po)),
    cartons: cartonsOf(po.lineItems),
  }));
  return {
    ...s,
    orders,
    cartons: orders.reduce((sum, o) => sum + o.cartons, 0),
    checklist: checklistOf({
      ...s,
      documents: s.documents.filter((d) => !d.supersededAt),
    }),
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
