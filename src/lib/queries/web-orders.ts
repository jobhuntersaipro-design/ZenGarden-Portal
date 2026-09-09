import { PoEventKind, WebOrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { PoStage } from "@/generated/prisma/enums";

export type ClientOrderLine = {
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  amount: string;
};

export type ClientOrder = {
  kind: "confirmed" | "submitted" | "declined";
  id: string;
  /** The PO number once confirmed, otherwise the shop reference. */
  reference: string;
  date: Date | null;
  stage: PoStage | null;
  stageChangedAt: Date | null;
  total: string;
  lineCount: number;
  declinedReason?: string | null;
};

/**
 * What a client may read about their own orders.
 *
 * **This is an explicit, narrow projection and must never become a `findMany`
 * with `include`.** The rows behind it carry things written for the ops team
 * and nobody else:
 *
 * - `PurchaseOrder.notes` is a free remark an ops user typed;
 * - `PoStageEvent.note` carries internal reasons, and `confirmPurchaseOrder`
 *   writes the totals-mismatch acknowledgement into one verbatim;
 * - `confirmedBy` and `changedBy` name and photograph the ops team.
 *
 * None of that is selected here. An `include` would pull all of it, and a
 * schema change months from now would turn that into a leak nobody edited.
 */
export async function listBuyerOrders(buyerId: string): Promise<ClientOrder[]> {
  const [confirmed, web] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        buyerId,
        // A superseded revision is not a separate order to the buyer; they see
        // the one that stands.
        supersededBy: null,
      },
      select: {
        id: true,
        poNumber: true,
        poDate: true,
        stage: true,
        stageChangedAt: true,
        total: true,
        _count: { select: { lineItems: true } },
      },
      orderBy: { poDate: "desc" },
      take: 100,
    }),
    prisma.webOrder.findMany({
      where: {
        buyerId,
        status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.DECLINED] },
      },
      select: {
        id: true,
        reference: true,
        submittedAt: true,
        subtotal: true,
        status: true,
        declinedReason: true,
        _count: { select: { lines: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    }),
  ]);

  const rows: ClientOrder[] = [
    ...confirmed.map((po) => ({
      kind: "confirmed" as const,
      id: po.id,
      reference: po.poNumber,
      date: po.poDate,
      stage: po.stage,
      stageChangedAt: po.stageChangedAt,
      total: po.total.toFixed(2),
      lineCount: po._count.lineItems,
    })),
    ...web.map((order) => ({
      kind:
        order.status === WebOrderStatus.DECLINED
          ? ("declined" as const)
          : ("submitted" as const),
      id: order.id,
      reference: order.reference,
      date: order.submittedAt,
      stage: null,
      stageChangedAt: null,
      total: order.subtotal.toFixed(2),
      lineCount: order._count.lines,
      declinedReason: order.declinedReason,
    })),
  ];

  return rows.sort(
    (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  );
}

/**
 * Stage dates for the client's own order. `toStage` and `changedAt` are facts
 * about their goods; `note` and `changedBy` are not selected, and the person is
 * forced to null so the stepper cannot render a member of staff even if a
 * future caller passes one.
 */
export type ClientStageEvent = {
  toStage: PoStage;
  changedAt: string;
  changedByName: null;
};

export type ClientOrderDetail = ClientOrder & {
  lines: ClientOrderLine[];
  events: ClientStageEvent[];
};

/** One order, scoped to the caller's buyer. A guessed id returns null. */
export async function loadBuyerOrder(
  buyerId: string,
  id: string,
): Promise<ClientOrderDetail | null> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, buyerId },
    select: {
      id: true,
      poNumber: true,
      poDate: true,
      stage: true,
      stageChangedAt: true,
      total: true,
      lineItems: {
        orderBy: { position: "asc" },
        select: {
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          amount: true,
        },
      },
      stageEvents: {
        // STAGE only. An EDIT event carries the totals-mismatch note
        // confirmPurchaseOrder writes verbatim, which is for the ops team.
        where: { kind: PoEventKind.STAGE },
        orderBy: { changedAt: "asc" },
        select: { toStage: true, changedAt: true },
      },
    },
  });
  if (po) {
    return {
      kind: "confirmed",
      id: po.id,
      reference: po.poNumber,
      date: po.poDate,
      stage: po.stage,
      stageChangedAt: po.stageChangedAt,
      total: po.total.toFixed(2),
      lineCount: po.lineItems.length,
      events: po.stageEvents.map((event) => ({
        toStage: event.toStage,
        changedAt: event.changedAt.toISOString(),
        changedByName: null as null,
      })),
      lines: po.lineItems.map((line) => ({
        description: line.description,
        quantity: line.quantity.toFixed(0),
        unit: line.unit,
        unitPrice: line.unitPrice.toFixed(2),
        amount: line.amount.toFixed(2),
      })),
    };
  }

  const web = await prisma.webOrder.findFirst({
    where: {
      id,
      buyerId,
      status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.DECLINED] },
    },
    select: {
      id: true,
      reference: true,
      submittedAt: true,
      subtotal: true,
      status: true,
      declinedReason: true,
      lines: {
        select: {
          cartons: true,
          unit: true,
          unitPrice: true,
          amount: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!web) return null;

  return {
    kind: web.status === WebOrderStatus.DECLINED ? "declined" : "submitted",
    id: web.id,
    reference: web.reference,
    date: web.submittedAt,
    stage: null,
    stageChangedAt: null,
    total: web.subtotal.toFixed(2),
    lineCount: web.lines.length,
    declinedReason: web.declinedReason,
    events: [],
    lines: web.lines.map((line) => ({
      description: line.product.name,
      quantity: String(line.cartons),
      unit: line.unit,
      unitPrice: line.unitPrice.toFixed(2),
      amount: line.amount.toFixed(2),
    })),
  };
}
