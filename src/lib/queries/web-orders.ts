import { PoEventKind, WebOrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { unitLabel } from "@/lib/cartons";
import type { PoStage } from "@/generated/prisma/enums";

export type ClientOrderLine = {
  position: number;
  /** The seller's product code. Empty where the line carries none. */
  sku: string;
  description: string;
  /** "6 per carton · 36 pieces". Empty where the pack size is unknown. */
  packCaption: string;
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
  /**
   * The buyer's own PO number, where they gave one. Stored on both sources
   * since Phase 32 and shown on no screen until now — it is the number their
   * own system uses, so it is how they will look an order up.
   */
  buyerReference: string | null;
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
export const BUYER_ORDER_SORT_KEYS = [
  "reference",
  "buyerReference",
  "date",
  "status",
  "lineCount",
  "total",
] as const;

export type BuyerOrderSortKey = (typeof BUYER_ORDER_SORT_KEYS)[number];

/**
 * Where a row sits when sorted by status: the order a buyer cares about, which
 * is how far along their goods are, not the alphabet. "Not accepted" sorts
 * last because it is the only outcome with nothing still to come.
 */
const STATUS_RANK: Record<string, number> = {
  submitted: 0,
  ORDER_PLACED: 1,
  IN_PRODUCTION: 2,
  QC_PASSED: 3,
  IN_WAREHOUSE: 4,
  DELIVERING: 5,
  DELIVERED: 6,
  declined: 7,
};

const statusRank = (order: ClientOrder) =>
  order.kind === "confirmed" && order.stage
    ? (STATUS_RANK[order.stage] ?? 0)
    : (STATUS_RANK[order.kind] ?? 0);

/**
 * Whether a row has nothing in the sorted column. Only two columns can be
 * empty: a buyer's own PO number is optional, and an order has no date until
 * it is sent.
 */
function isBlank(order: ClientOrder, key: BuyerOrderSortKey): boolean {
  if (key === "buyerReference") return !order.buyerReference;
  if (key === "date") return order.date === null;
  return false;
}

/**
 * Compares two rows on one column, in ascending order. Text goes through
 * `localeCompare` with `numeric`, so "PO-10" sorts after "PO-9" the way a
 * person reads them rather than before it the way a byte comparison would.
 *
 * Blanks are not handled here, on purpose: they must sort last in *both*
 * directions, and anything this function returns is multiplied by the
 * direction by its caller.
 */
function compareOrders(
  a: ClientOrder,
  b: ClientOrder,
  key: BuyerOrderSortKey,
): number {
  switch (key) {
    case "reference":
      return a.reference.localeCompare(b.reference, undefined, { numeric: true });
    case "buyerReference":
      return (a.buyerReference ?? "").localeCompare(b.buyerReference ?? "", undefined, {
        numeric: true,
      });
    case "status":
      return statusRank(a) - statusRank(b);
    case "lineCount":
      return a.lineCount - b.lineCount;
    case "total":
      return Number(a.total) - Number(b.total);
    case "date":
    default:
      return (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
  }
}

export async function listBuyerOrders(
  buyerId: string,
  page = 1,
  perPage = 20,
  sort: { key: BuyerOrderSortKey; dir: "asc" | "desc" } = {
    key: "date",
    dir: "desc",
  },
): Promise<{ orders: ClientOrder[]; total: number }> {
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
        buyerReference: true,
        _count: { select: { lineItems: true } },
      },
      orderBy: { poDate: "desc" },
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
        buyerReference: true,
        _count: { select: { lines: true } },
      },
      orderBy: { submittedAt: "desc" },
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
      buyerReference: po.buyerReference,
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
      buyerReference: order.buyerReference,
    })),
  ];

  // Merged in memory because the two sources have different date columns and
  // there is no shared cursor. A buyer's own history is small — hundreds, not
  // millions — so this is cheaper than a UNION and far easier to read. Paged
  // afterwards, because the walkthrough on 2026-09-10 rendered 60-odd rows in
  // one wall.
  //
  // Sorting happens here, before the slice, so page 2 of a sort is the second
  // page of that sort rather than the second page of the default one re-sorted
  // in the browser.
  //
  // Two passes, and the first is not redundant: newest-first is the tie-break
  // for every other column, and `Array.prototype.sort` is stable, so rows that
  // compare equal on the chosen column keep the date order underneath.
  //
  // A row with nothing in the sorted column sinks to the bottom whichever
  // direction is asked for — an empty cell is not a small value, and somebody
  // sorting by "Your PO no." wants the orders that have one, not a screenful of
  // em dashes at the top.
  const direction = sort.dir === "asc" ? 1 : -1;
  const sorted = rows
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .sort((a, b) => {
      const aBlank = isBlank(a, sort.key);
      const bBlank = isBlank(b, sort.key);
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      if (aBlank) return 0;
      return compareOrders(a, b, sort.key) * direction;
    });
  const start = Math.max(0, (page - 1) * perPage);
  return { orders: sorted.slice(start, start + perPage), total: sorted.length };
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

/** A party as the purchase order prints it. */
export type ClientOrderParty = {
  name: string;
  address: string | null;
  /** "Aisha Rahman · orders@acme.test" — either half may be missing. */
  contact: string | null;
};

export type ClientOrderDetail = ClientOrder & {
  lines: ClientOrderLine[];
  events: ClientStageEvent[];
  /** Everything the purchase-order document prints that the list does not. */
  requestedDate: Date | null;
  /**
   * The buyer's **own** note, from the order they placed. Never
   * `PurchaseOrder.notes`, which an ops user may have typed or edited — see
   * this module's opening comment.
   */
  notes: string | null;
  paymentTerms: string | null;
  currency: string;
  subtotal: string;
  /** Null where the order has none — a shop order never does. */
  tax: string | null;
  buyer: ClientOrderParty;
};

const joinContact = (name: string | null, email: string | null): string | null => {
  const parts = [name, email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

/**
 * The buyer's own company, as the document prints it.
 *
 * `remark` is **not** selected and must never be: it is the internal note ops
 * keeps about this customer, and `prisma/schema.prisma` says so on the column
 * itself. The same rule is pinned by equality on `loadShopViewer`'s select in
 * `shop-viewer.test.ts`; this select is pinned by `web-orders.test.ts`.
 */
const BUYER_PARTY_SELECT = {
  name: true,
  address: true,
  contactName: true,
  email: true,
  paymentTerms: true,
} as const;

/** "6 per carton · 36 pieces", from whatever the line actually knows. */
export function packCaptionFor(
  packSize: number | null,
  unit: string | null,
  cartons: number,
): string {
  if (!unit) return "";
  const pieces = packSize === null ? null : packSize * cartons;
  return [
    unitLabel(packSize, unit),
    pieces === null ? null : `${pieces} pieces`,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
      subtotal: true,
      tax: true,
      total: true,
      currency: true,
      paymentTerms: true,
      buyerReference: true,
      buyer: { select: BUYER_PARTY_SELECT },
      // The order the buyer placed on the shop, where this PO came from one.
      // Its reference, requested date and note are the buyer's own words —
      // unlike `PurchaseOrder.notes`, which ops may have typed or edited, and
      // which is deliberately not selected anywhere in this file.
      webOrder: {
        select: { buyerReference: true, requestedDate: true, notes: true },
      },
      lineItems: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          sku: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          amount: true,
          product: { select: { sku: true, packSize: true } },
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
      buyerReference: po.webOrder?.buyerReference ?? po.buyerReference,
      date: po.poDate,
      stage: po.stage,
      stageChangedAt: po.stageChangedAt,
      subtotal: po.subtotal.toFixed(2),
      tax: po.tax.toFixed(2),
      total: po.total.toFixed(2),
      currency: po.currency,
      paymentTerms: po.paymentTerms ?? po.buyer.paymentTerms,
      requestedDate: po.webOrder?.requestedDate ?? null,
      notes: po.webOrder?.notes ?? null,
      lineCount: po.lineItems.length,
      buyer: {
        name: po.buyer.name,
        address: po.buyer.address,
        contact: joinContact(po.buyer.contactName, po.buyer.email),
      },
      events: po.stageEvents.map((event) => ({
        toStage: event.toStage,
        changedAt: event.changedAt.toISOString(),
        changedByName: null as null,
      })),
      lines: po.lineItems.map((line) => ({
        position: line.position,
        // The code the buyer printed, where the document carried one;
        // otherwise the catalogue's own, which is what they would quote back.
        sku: line.sku ?? line.product?.sku ?? "",
        description: line.description,
        packCaption: packCaptionFor(
          line.product?.packSize ?? null,
          line.unit,
          Number(line.quantity),
        ),
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
      buyerReference: true,
      requestedDate: true,
      notes: true,
      currency: true,
      buyer: { select: BUYER_PARTY_SELECT },
      lines: {
        select: {
          cartons: true,
          packSize: true,
          unit: true,
          unitPrice: true,
          amount: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });
  if (!web) return null;

  return {
    kind: web.status === WebOrderStatus.DECLINED ? "declined" : "submitted",
    id: web.id,
    reference: web.reference,
    buyerReference: web.buyerReference,
    date: web.submittedAt,
    stage: null,
    stageChangedAt: null,
    subtotal: web.subtotal.toFixed(2),
    // The cart quotes no tax; the team settles it when they confirm.
    tax: null,
    total: web.subtotal.toFixed(2),
    currency: web.currency,
    paymentTerms: web.buyer.paymentTerms,
    requestedDate: web.requestedDate,
    notes: web.notes,
    lineCount: web.lines.length,
    declinedReason: web.declinedReason,
    buyer: {
      name: web.buyer.name,
      address: web.buyer.address,
      contact: joinContact(web.buyer.contactName, web.buyer.email),
    },
    events: [],
    // A cart has no position column (the schema says why), so the document's
    // numbering comes from the order the rows are read in.
    lines: web.lines.map((line, index) => ({
      position: index + 1,
      sku: line.product.sku,
      description: line.product.name,
      packCaption: packCaptionFor(line.packSize, line.unit, line.cartons),
      quantity: String(line.cartons),
      unit: line.unit,
      unitPrice: line.unitPrice.toFixed(2),
      amount: line.amount.toFixed(2),
    })),
  };
}

/**
 * Everything the generated purchase order is drawn from (Phase 37).
 *
 * **Unscoped by buyer on purpose** — this is not a screen, it is the file we
 * write for an order we have already accepted, and the one caller
 * (`attachWebOrderDocument`) owns the order id it was handed. Every screen
 * that shows a buyer their own order still goes through `loadBuyerOrder`.
 *
 * The shape of `order` is exactly what `buildPoDocumentFromOrder` takes, and
 * the lines are read the same way `loadBuyerOrder`'s web branch reads them, so
 * the file and the page cannot describe the order differently.
 */
export async function loadWebOrderDocumentSource(webOrderId: string) {
  const order = await prisma.webOrder.findUnique({
    where: { id: webOrderId },
    select: {
      id: true,
      reference: true,
      status: true,
      placedById: true,
      submittedAt: true,
      requestedDate: true,
      buyerReference: true,
      notes: true,
      currency: true,
      subtotal: true,
      documentId: true,
      buyer: { select: BUYER_PARTY_SELECT },
      lines: {
        select: {
          cartons: true,
          packSize: true,
          unit: true,
          unitPrice: true,
          amount: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    placedById: order.placedById,
    submittedAt: order.submittedAt,
    requestedDate: order.requestedDate,
    documentId: order.documentId,
    order: {
      reference: order.reference,
      buyerReference: order.buyerReference,
      currency: order.currency,
      paymentTerms: order.buyer.paymentTerms,
      notes: order.notes,
      // The cart quotes no tax; the team settles it when they confirm.
      tax: null as string | null,
      buyer: {
        name: order.buyer.name,
        address: order.buyer.address,
        contact: joinContact(order.buyer.contactName, order.buyer.email),
      },
      // A cart has no position column, so the numbering is the read order —
      // the same rule `loadBuyerOrder` applies to the same rows.
      lines: order.lines.map((line, index) => ({
        position: index + 1,
        sku: line.product.sku,
        description: line.product.name,
        packCaption: packCaptionFor(line.packSize, line.unit, line.cartons),
        quantity: String(line.cartons),
        unitPrice: line.unitPrice.toFixed(2),
        amount: line.amount.toFixed(2),
      })),
    },
  };
}

export type OpsWebOrder = {
  id: string;
  reference: string;
  status: string;
  buyerId: string;
  buyerName: string;
  buyerPaymentTerms: string | null;
  placedByName: string;
  placedByEmail: string;
  submittedAt: Date | null;
  buyerReference: string | null;
  notes: string | null;
  subtotal: string;
  lines: {
    productId: string;
    sku: string;
    name: string;
    cartons: number;
    packSize: number | null;
    unit: string;
    unitPrice: string;
    amount: string;
  }[];
};

/** The ops-side view: everything the reviewer needs to check the form against. */
export async function loadWebOrderForReview(
  id: string,
): Promise<OpsWebOrder | null> {
  const order = await prisma.webOrder.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      buyerId: true,
      buyerReference: true,
      notes: true,
      subtotal: true,
      submittedAt: true,
      buyer: { select: { name: true, paymentTerms: true } },
      placedBy: { select: { name: true, email: true } },
      lines: {
        select: {
          productId: true,
          cartons: true,
          packSize: true,
          unit: true,
          unitPrice: true,
          amount: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    buyerId: order.buyerId,
    buyerName: order.buyer.name,
    buyerPaymentTerms: order.buyer.paymentTerms,
    placedByName: order.placedBy.name,
    placedByEmail: order.placedBy.email,
    submittedAt: order.submittedAt,
    buyerReference: order.buyerReference,
    notes: order.notes,
    subtotal: order.subtotal.toFixed(2),
    lines: order.lines
      .map((line) => ({
        productId: line.productId,
        sku: line.product.sku,
        name: line.product.name,
        cartons: line.cartons,
        packSize: line.packSize,
        unit: line.unit,
        unitPrice: line.unitPrice.toFixed(2),
        amount: line.amount.toFixed(2),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Submitted shop orders waiting on a person. Unscoped by date, like the queue. */
export const openWebOrderCount = () =>
  prisma.webOrder.count({ where: { status: WebOrderStatus.SUBMITTED } });
