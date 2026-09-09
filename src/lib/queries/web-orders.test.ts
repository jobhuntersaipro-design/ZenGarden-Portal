import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindMany = vi.fn();
const poFindFirst = vi.fn();
const webFindMany = vi.fn();
const webFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findMany: poFindMany, findFirst: poFindFirst },
    webOrder: { findMany: webFindMany, findFirst: webFindFirst },
  },
}));

const { listBuyerOrders, loadBuyerOrder } = await import("@/lib/queries/web-orders");

beforeEach(() => {
  vi.resetAllMocks();
  poFindMany.mockResolvedValue([]);
  webFindMany.mockResolvedValue([]);
  poFindFirst.mockResolvedValue(null);
  webFindFirst.mockResolvedValue(null);
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
  "total",
  "_count",
];

/**
 * The shop must never show what the ops team wrote for itself. These are not
 * style assertions — each names a real column that carries internal text or
 * identifies a member of staff.
 */
const FORBIDDEN = ["notes", "confirmedBy", "confirmedById", "document"];

describe("listBuyerOrders is a narrow select, never an include", () => {
  it("asks for no forbidden column on the purchase order", async () => {
    await listBuyerOrders("b1");
    const args = poFindMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual([...ALLOWED_LIST_KEYS].sort());
    for (const key of FORBIDDEN) expect(args.select[key]).toBeUndefined();
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
    expect(webFindMany.mock.calls[0][0].where.status.in).toEqual([
      "SUBMITTED",
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
      "quantity",
      "unit",
      "unitPrice",
    ]);
    // Stage dates are the client's own facts; the note and the person are not.
    expect(Object.keys(args.select.stageEvents.select).sort()).toEqual([
      "changedAt",
      "toStage",
    ]);
    // An EDIT event carries the totals-mismatch note written for the ops team.
    expect(args.select.stageEvents.where).toEqual({ kind: "STAGE" });
  });
});
