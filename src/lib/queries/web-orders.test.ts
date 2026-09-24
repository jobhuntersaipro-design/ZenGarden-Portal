import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindMany = vi.fn();
const poFindFirst = vi.fn();
const webFindMany = vi.fn();
const webFindFirst = vi.fn();
const webCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findMany: poFindMany, findFirst: poFindFirst },
    webOrder: { findMany: webFindMany, findFirst: webFindFirst, count: webCount },
  },
}));

const { listBuyerOrders, loadBuyerOrder, openWebOrderCount } = await import(
  "@/lib/queries/web-orders"
);

beforeEach(() => {
  vi.resetAllMocks();
  poFindMany.mockResolvedValue([]);
  webFindMany.mockResolvedValue([]);
  poFindFirst.mockResolvedValue(null);
  webFindFirst.mockResolvedValue(null);
  webCount.mockResolvedValue(0);
});

/**
 * Exactly what the list may ask a PurchaseOrder for. Written as an equality,
 * not a subset: a column added here later has to be a deliberate edit to this
 * line, which is the point.
 */
const ALLOWED_LIST_KEYS = [
  "id",
  "poNumber",
  "poDate",
  "stage",
  "stageChangedAt",
  // Phase 38, a deliberate edit to this line: the day the team committed to
  // is the buyer's own fact, and the list now has a column for it.
  "deliveryDate",
  "total",
  "buyerReference",
  // 2026-09-17, a deliberate edit to this line: the Order ID lives on the
  // shop order, and a confirmed shop order must show it as its own column
  // rather than in place of the buyer's PO number. Only `reference` is read.
  "webOrder",
  "_count",
];

/**
 * The shop must never show what the ops team wrote for itself. These are not
 * style assertions — each names a real column that carries internal text or
 * identifies a member of staff.
 */
const FORBIDDEN = [
  "notes",
  "confirmedBy",
  "confirmedById",
  "document",
  // The scan a customer emailed and ops uploaded. A buyer's own generated
  // purchase order is reached through `webOrder.documentId` instead.
  "documentId",
];

describe("listBuyerOrders is a narrow select, never an include", () => {
  it("asks for no forbidden column on the purchase order", async () => {
    await listBuyerOrders("b1");
    const args = poFindMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual([...ALLOWED_LIST_KEYS].sort());
    for (const key of FORBIDDEN) expect(args.select[key]).toBeUndefined();
    expect(args.select.webOrder).toEqual({ select: { reference: true } });
  });

  it("scopes to the caller's buyer", async () => {
    await listBuyerOrders("b1");
    expect(poFindMany.mock.calls[0][0].where.buyerId).toBe("b1");
    expect(webFindMany.mock.calls[0][0].where.buyerId).toBe("b1");
  });

  it("shows the revision that stands, not the ones it superseded", async () => {
    await listBuyerOrders("b1");
    expect(poFindMany.mock.calls[0][0].where.supersededBy).toBeNull();
  });

  it("never offers a client's own DRAFT cart as an order", async () => {
    await listBuyerOrders("b1");
    // Phase 41, a deliberate edit to this line: an order the team has
    // received but not yet confirmed is still in flight, not gone.
    expect(webFindMany.mock.calls[0][0].where.status.in).toEqual([
      "SUBMITTED",
      "RECEIVED",
      "DECLINED",
    ]);
  });
});

describe("loadBuyerOrder", () => {
  it("scopes by buyer, so a guessed id from another buyer returns nothing", async () => {
    const found = await loadBuyerOrder("b1", "someone-elses-po");
    expect(poFindFirst.mock.calls[0][0].where).toEqual({
      id: "someone-elses-po",
      buyerId: "b1",
    });
    expect(found).toBeNull();
  });

  it("selects no forbidden column on the detail either", async () => {
    await loadBuyerOrder("b1", "po1");
    const args = poFindFirst.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    for (const key of FORBIDDEN) expect(args.select[key]).toBeUndefined();
    // and the lines carry no stage note or person
    expect(Object.keys(args.select.lineItems.select).sort()).toEqual([
      "amount",
      "description",
      "position",
      "product",
      "quantity",
      "sku",
      "unit",
      "unitPrice",
    ]);
    // The product is reached for its code, pack size, the variant and market
    // the document captions (Phase 42) and the cartons per pallet its pack
    // line prints (Phase 44) — and nothing else.
    expect(Object.keys(args.select.lineItems.select.product.select).sort()).toEqual([
      "cartonsPerPallet",
      "market",
      "packSize",
      "sku",
      "variant",
    ]);
    // Stage dates are the client's own facts; the note and the person are not.
    expect(Object.keys(args.select.stageEvents.select).sort()).toEqual([
      "changedAt",
      "toStage",
    ]);
    // An EDIT event carries the totals-mismatch note written for the ops team.
    expect(args.select.stageEvents.where).toEqual({ kind: "STAGE" });
  });

  /**
   * The detail now prints the buyer's own company on the purchase order, which
   * means it reads a `Buyer` — the row that carries `remark`, the internal note
   * ops keeps about this customer. Asserted by equality rather than by checking
   * `remark` alone: the next column somebody adds to `Buyer` is unknown today,
   * and a subset check would wave it through.
   */
  it("reads the buyer's own details and never the internal remark", async () => {
    await loadBuyerOrder("b1", "po1");
    const select = poFindFirst.mock.calls[0][0].select.buyer.select;
    expect(Object.keys(select).sort()).toEqual([
      "address",
      "contactName",
      "email",
      "name",
      "paymentTerms",
    ]);
    expect(select.remark).toBeUndefined();
  });

  /**
   * `PurchaseOrder.notes` may have been typed or edited by an ops user, so it
   * stays forbidden above. The note the document prints comes from the order
   * the buyer placed themselves, through the `webOrder` relation — which is why
   * "notes" appears here and must not appear at the top level.
   */
  it("takes the buyer's own words from their own order, not the ops remark", async () => {
    await loadBuyerOrder("b1", "po1");
    const args = poFindFirst.mock.calls[0][0];
    expect(args.select.notes).toBeUndefined();
    // `documentId` joined this list in Phase 37 — deliberately, and only
    // here: it is the *shop order's* generated file, which belongs to the
    // buyer. `PurchaseOrder.documentId` stays out of the top-level select,
    // because on a scan-origin order that is the ops team's own upload.
    // `reference` joined on 2026-09-17: the shop order's Order ID, shown as
    // its own field rather than as the buyer's PO number.
    expect(Object.keys(args.select.webOrder.select).sort()).toEqual([
      "buyerReference",
      "documentId",
      "notes",
      "reference",
    ]);
    expect(args.select.documentId).toBeUndefined();
  });
});


describe("listBuyerOrders paging", () => {
  const po = (n: number) => ({
    id: `po${n}`,
    poNumber: `PO-${n}`,
    poDate: new Date(2026, 0, n),
    stage: "DELIVERED",
    stageChangedAt: new Date(2026, 0, n),
    deliveryDate: null,
    total: { toFixed: () => "1.00" },
    _count: { lineItems: 1 },
  });

  it("returns one page and the true total, newest first", async () => {
    poFindMany.mockResolvedValue([po(1), po(5), po(3)]);
    const { orders, total } = await listBuyerOrders("b1", 1, 2);
    expect(total).toBe(3);
    expect(orders.map((o) => o.id)).toEqual(["po5", "po3"]);
  });

  it("walks to the next page", async () => {
    poFindMany.mockResolvedValue([po(1), po(5), po(3)]);
    const { orders } = await listBuyerOrders("b1", 2, 2);
    expect(orders.map((o) => o.id)).toEqual(["po1"]);
  });
});

describe("listBuyerOrders sorting", () => {
  // A scanned order: its PO number is the one printed on the document.
  const po = (n: number, total: string, ref: string | null, delivery: Date | null = null) => ({
    id: `po${n}`,
    poNumber: ref,
    poDate: new Date(2026, 0, n),
    stage: "DELIVERED",
    stageChangedAt: new Date(2026, 0, n),
    deliveryDate: delivery,
    total: { toFixed: () => total },
    buyerReference: null,
    webOrder: null,
    _count: { lineItems: n },
  });

  /**
   * Sorting runs before the slice. Asserted on page 2 on purpose: sorting the
   * rows a page already holds would pass a page-1 test and still be wrong.
   */
  it("sorts the whole list, not the page", async () => {
    poFindMany.mockResolvedValue([
      po(1, "10.00", null),
      po(2, "30.00", null),
      po(3, "20.00", null),
    ]);
    const { orders } = await listBuyerOrders("b1", 2, 2, {
      key: "total",
      dir: "desc",
    });
    expect(orders.map((o) => o.total)).toEqual(["10.00"]);
  });

  it("sorts ascending when asked", async () => {
    poFindMany.mockResolvedValue([
      po(1, "10.00", null),
      po(2, "30.00", null),
      po(3, "20.00", null),
    ]);
    const { orders } = await listBuyerOrders("b1", 1, 10, {
      key: "total",
      dir: "asc",
    });
    expect(orders.map((o) => o.total)).toEqual(["10.00", "20.00", "30.00"]);
  });

  /**
   * The delivery date is blank on every order the team has not confirmed, so
   * it is the column most likely to be half empty — and the blanks must sink
   * in both directions like every other.
   */
  it("sinks orders with no delivery date, whichever way it is sorted", async () => {
    const rows = [
      po(1, "10.00", null, null),
      po(2, "30.00", null, new Date(2026, 1, 20)),
      po(3, "20.00", null, new Date(2026, 1, 10)),
    ];
    poFindMany.mockResolvedValue(rows);
    const ascending = await listBuyerOrders("b1", 1, 10, {
      key: "deliveryDate",
      dir: "asc",
    });
    expect(ascending.orders.map((o) => o.id)).toEqual([
      "po3",
      "po2",
      "po1",
    ]);

    poFindMany.mockResolvedValue(rows);
    const descending = await listBuyerOrders("b1", 1, 10, {
      key: "deliveryDate",
      dir: "desc",
    });
    // The two dated rows flip; the undated one stays at the bottom.
    expect(descending.orders.map((o) => o.id)).toEqual([
      "po2",
      "po3",
      "po1",
    ]);
  });

  /**
   * A blank is not a small value: it sinks in both directions, and the blanks
   * keep their date order among themselves rather than shuffling on each load.
   */
  it("sinks rows with no value in the sorted column, in both directions", async () => {
    const rows = [
      po(1, "10.00", null),
      po(2, "30.00", "ACME-2"),
      po(3, "20.00", null),
    ];
    poFindMany.mockResolvedValue(rows);
    const ascending = await listBuyerOrders("b1", 1, 10, {
      key: "buyerReference",
      dir: "asc",
    });
    expect(ascending.orders.map((o) => o.id)).toEqual([
      "po2",
      "po3",
      "po1",
    ]);

    poFindMany.mockResolvedValue(rows);
    const descending = await listBuyerOrders("b1", 1, 10, {
      key: "buyerReference",
      dir: "desc",
    });
    // The one row with a value stays on top; only the blanks' position is at
    // stake, and it does not move.
    expect(descending.orders.map((o) => o.id)).toEqual([
      "po2",
      "po3",
      "po1",
    ]);
  });
});

/**
 * Order ID and PO number are two things (2026-09-17). Until then a confirmed
 * shop order's "reference" was its PO number column, which confirm had filled
 * with the Order ID.
 */
describe("listBuyerOrders keeps the Order ID and the PO number apart", () => {
  const confirmed = (over: Record<string, unknown>) => ({
    id: "po1",
    poNumber: null,
    poDate: new Date(2026, 8, 17),
    stage: "ORDER_PLACED",
    stageChangedAt: new Date(2026, 8, 17),
    deliveryDate: null,
    total: { toFixed: () => "1.00" },
    buyerReference: null,
    webOrder: { reference: "W-2609-00014" },
    _count: { lineItems: 1 },
    ...over,
  });

  it("shows a shop order's Order ID, and its PO number only when the buyer gave one", async () => {
    poFindMany.mockResolvedValue([
      confirmed({ id: "with", buyerReference: "ACME-771" }),
      confirmed({ id: "without", webOrder: { reference: "W-2609-00015" } }),
    ]);
    const { orders } = await listBuyerOrders("b1");
    const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
    expect(byId.with).toMatchObject({ orderId: "W-2609-00014", buyerReference: "ACME-771" });
    expect(byId.without).toMatchObject({ orderId: "W-2609-00015", buyerReference: null });
  });

  it("gives a scanned order its printed PO number and no Order ID", async () => {
    poFindMany.mockResolvedValue([
      confirmed({ poNumber: "SVPPPO26090009", webOrder: null, buyerReference: "old field" }),
    ]);
    const { orders } = await listBuyerOrders("b1");
    expect(orders[0]).toMatchObject({ orderId: null, buyerReference: "SVPPPO26090009" });
  });

  it("gives an order still waiting its Order ID, and no PO number the buyer did not type", async () => {
    webFindMany.mockResolvedValue([
      {
        id: "w1",
        reference: "W-2609-00016",
        submittedAt: new Date(2026, 8, 17),
        subtotal: { toFixed: () => "1.00" },
        status: "SUBMITTED",
        declinedReason: null,
        buyerReference: null,
        _count: { lines: 1 },
      },
    ]);
    const { orders } = await listBuyerOrders("b1");
    expect(orders[0]).toMatchObject({ orderId: "W-2609-00016", buyerReference: null });
  });
});

describe("openWebOrderCount", () => {
  /**
   * A RECEIVED order is still waiting on a person — the team has picked it
   * up but not yet confirmed it — so it belongs in the dashboard queue
   * beside SUBMITTED. Pinned by equality: a status added here later has to
   * be a deliberate edit to this line.
   */
  it("counts submitted and received orders, never anything else", async () => {
    await openWebOrderCount();
    expect(webCount).toHaveBeenCalledWith({
      where: { status: { in: ["SUBMITTED", "RECEIVED"] } },
    });
  });
});

/**
 * Phase 57 J5: My orders narrows by a chip and a search. Filtered before the
 * count and the slice, so the total under the table is the narrowed list's.
 */
describe("listBuyerOrders narrowing", () => {
  const po = (n: number, stage: string, ref: string) => ({
    id: `po${n}`,
    poNumber: ref,
    poDate: new Date(2026, 0, n),
    stage,
    stageChangedAt: new Date(2026, 0, n),
    deliveryDate: null,
    total: { toFixed: () => "1.00" },
    buyerReference: null,
    webOrder: null,
    _count: { lineItems: 1 },
  });
  const sort = { key: "date" as const, dir: "desc" as const };

  beforeEach(() => {
    poFindMany.mockResolvedValue([
      po(1, "DELIVERED", "ACME-771"),
      po(2, "IN_PRODUCTION", "ACME-772"),
      po(3, "DELIVERED", "ACME-900"),
    ]);
    webFindMany.mockResolvedValue([
      {
        id: "w1",
        reference: "W-2609-00014",
        submittedAt: new Date(2026, 0, 4),
        subtotal: { toFixed: () => "1.00" },
        status: "DECLINED",
        declinedReason: null,
        buyerReference: "ACME-773",
        _count: { lines: 1 },
      },
    ]);
  });

  it("counts only the delivered orders under Delivered", async () => {
    const { orders, total } = await listBuyerOrders("b1", 1, 20, sort, { filter: "delivered", q: "" });
    expect(total).toBe(2);
    expect(orders.map((o) => o.id)).toEqual(["po3", "po1"]);
  });

  it("leaves a declined order out of In progress", async () => {
    const { orders } = await listBuyerOrders("b1", 1, 20, sort, { filter: "open", q: "" });
    expect(orders.map((o) => o.id)).toEqual(["po2"]);
  });

  it("finds an order by its PO number or its Order ID, ignoring case", async () => {
    const byPo = await listBuyerOrders("b1", 1, 20, sort, { filter: "all", q: "acme-772" });
    expect(byPo.orders.map((o) => o.id)).toEqual(["po2"]);
    const byOrderId = await listBuyerOrders("b1", 1, 20, sort, { filter: "all", q: "w-2609-00014" });
    expect(byOrderId.orders.map((o) => o.id)).toEqual(["w1"]);
  });

  it("combines the chip and the search", async () => {
    const { total } = await listBuyerOrders("b1", 1, 20, sort, { filter: "delivered", q: "772" });
    expect(total).toBe(0);
  });
});
