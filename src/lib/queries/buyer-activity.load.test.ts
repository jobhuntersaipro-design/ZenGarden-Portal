import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebOrderStatus } from "@/generated/prisma/enums";

const auditFindMany = vi.fn();
const auditCount = vi.fn();
const webOrderFindMany = vi.fn();
const webOrderCount = vi.fn();
const purchaseOrderFindMany = vi.fn();
const purchaseOrderCount = vi.fn();
const poStageEventFindMany = vi.fn();
const poStageEventCount = vi.fn();
const userFindMany = vi.fn();
const loginAttemptFindMany = vi.fn();
const loginAttemptCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditEvent: { findMany: auditFindMany, count: auditCount },
    webOrder: { findMany: webOrderFindMany, count: webOrderCount },
    purchaseOrder: { findMany: purchaseOrderFindMany, count: purchaseOrderCount },
    poStageEvent: { findMany: poStageEventFindMany, count: poStageEventCount },
    user: { findMany: userFindMany },
    loginAttempt: { findMany: loginAttemptFindMany, count: loginAttemptCount },
  },
}));

const { loadBuyerActivity } = await import("@/lib/queries/buyer-activity");

beforeEach(() => {
  vi.resetAllMocks();
  auditFindMany.mockResolvedValue([]);
  auditCount.mockResolvedValue(0);
  webOrderFindMany.mockResolvedValue([]);
  webOrderCount.mockResolvedValue(0);
  purchaseOrderFindMany.mockResolvedValue([]);
  purchaseOrderCount.mockResolvedValue(0);
  poStageEventFindMany.mockResolvedValue([]);
  poStageEventCount.mockResolvedValue(0);
  userFindMany.mockResolvedValue([]);
  loginAttemptFindMany.mockResolvedValue([]);
  loginAttemptCount.mockResolvedValue(0);
});

// A cart IS a WebOrder: `openCart` (src/actions/cart.ts) creates one at the
// schema default status DRAFT the moment a signed-in client adds their first
// item. Left unfiltered, the timeline would print "placed an order" for
// everyone who ever abandoned a cart. This test only sees the query Prisma
// was asked to run, not any row shape, so it is the only thing that can
// catch the exclusion going missing.
describe("loadBuyerActivity never surfaces a draft web order", () => {
  it("excludes DRAFT from the WebOrder query", async () => {
    await loadBuyerActivity("b1", { page: 1, kind: "all" });

    expect(webOrderFindMany).toHaveBeenCalledTimes(1);
    const call = webOrderFindMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ buyerId: "b1", status: { not: WebOrderStatus.DRAFT } });
  });
});

// Each of the five sources is read with `take: page * ACTIVITY_PAGE_SIZE`, so
// `mergeActivity`'s own `all.length` is the size of a *truncated* union, not
// the real row count — wrong the moment a customer's history exceeds one
// page for any one source. `loadBuyerActivity` must compute the
// authoritative total from `count()` queries, filtered exactly like the
// reads, and use it instead.
describe("loadBuyerActivity's total reflects real row counts, not the truncated reads", () => {
  it("does not cap the total at what the take-bounded read fetched", async () => {
    // 100 confirmed purchase orders exist; the bounded read only returns the
    // first page's worth (20), the same as production would for a buyer
    // carrying up to 400 purchase orders.
    purchaseOrderFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `po${i}`,
        poNumber: `PO-${i}`,
        total: "100.00",
        confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
        document: null,
        confirmedBy: null,
      })),
    );
    purchaseOrderCount.mockResolvedValue(100);

    const result = await loadBuyerActivity("b1", { page: 1, kind: "purchase-order" });

    expect(result.total).toBe(100);
  });

  it("totals purchase orders and their stage events together, under one kind", async () => {
    purchaseOrderCount.mockResolvedValue(40);
    poStageEventCount.mockResolvedValue(65);

    const result = await loadBuyerActivity("b1", { page: 1, kind: "purchase-order" });

    expect(result.total).toBe(105);
  });

  it("counts sign-ins from both the audit trail and failed attempts, under one kind", async () => {
    auditCount.mockImplementation(async ({ where }: { where: { action: unknown } }) =>
      where.action === "SIGNED_IN" ? 12 : 0,
    );
    userFindMany.mockResolvedValue([{ email: "siti@acme.com" }]);
    loginAttemptCount.mockResolvedValue(3);

    const result = await loadBuyerActivity("b1", { page: 1, kind: "sign-in" });

    expect(result.total).toBe(15);
  });

  it("sums every source under kind 'all'", async () => {
    auditCount.mockImplementation(async ({ where }: { where: { action: unknown } }) =>
      where.action === "SIGNED_IN" ? 2 : 3,
    );
    webOrderCount.mockResolvedValue(4);
    purchaseOrderCount.mockResolvedValue(5);
    poStageEventCount.mockResolvedValue(6);
    userFindMany.mockResolvedValue([{ email: "a@acme.com" }]);
    loginAttemptCount.mockResolvedValue(1);

    const result = await loadBuyerActivity("b1", { page: 1, kind: "all" });

    expect(result.total).toBe(2 + 3 + 4 + 5 + 6 + 1);
  });

  it("counts the failed-attempt window with the same filter the read uses", async () => {
    userFindMany.mockResolvedValue([{ email: "siti@acme.com" }, { email: "raj@acme.com" }]);

    await loadBuyerActivity("b1", { page: 1, kind: "sign-in" });

    expect(loginAttemptCount).toHaveBeenCalledTimes(1);
    const countArgs = loginAttemptCount.mock.calls[0]?.[0];
    const readArgs = loginAttemptFindMany.mock.calls[0]?.[0];
    expect(countArgs.where).toEqual(readArgs.where);
  });

  it("counts zero failed attempts, and never calls count, when the buyer has no contacts", async () => {
    userFindMany.mockResolvedValue([]);

    const result = await loadBuyerActivity("b1", { page: 1, kind: "sign-in" });

    expect(loginAttemptCount).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it("filters the WebOrder count exactly like the read: no DRAFT", async () => {
    await loadBuyerActivity("b1", { page: 1, kind: "shop-order" });

    expect(webOrderCount).toHaveBeenCalledTimes(1);
    const call = webOrderCount.mock.calls[0]?.[0];
    expect(call.where).toEqual({ buyerId: "b1", status: { not: WebOrderStatus.DRAFT } });
  });
});
