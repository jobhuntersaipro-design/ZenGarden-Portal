import { beforeEach, describe, expect, it, vi } from "vitest";

const stockFindMany = vi.fn();
const stockFindFirst = vi.fn();
const stockCreate = vi.fn();
const productUpdate = vi.fn();
const requirePermission = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        stockCount: { findMany: stockFindMany, findFirst: stockFindFirst, create: stockCreate },
        product: { update: productUpdate },
      }),
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/permissions/require", () => ({ requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveStockCounts } = await import("@/actions/stock");

beforeEach(() => {
  vi.resetAllMocks();
  requirePermission.mockResolvedValue({ id: "usr1" });
  stockFindMany.mockResolvedValue([]);
  stockFindFirst.mockResolvedValue({ cartons: 12 });
});

const input = {
  countedOn: "2026-09-12",
  note: "Back shelf only",
  entries: [{ productId: "p1", cartons: 40 }],
};

describe("saveStockCounts", () => {
  it("writes a count with its author, its day and its note", async () => {
    const result = await saveStockCounts(input);
    expect(result).toMatchObject({ success: true });
    expect(stockCreate.mock.calls[0][0].data).toEqual({
      productId: "p1",
      countedOn: new Date("2026-09-12T00:00:00.000Z"),
      cartons: 40,
      note: "Back shelf only",
      countedById: "usr1",
      supersedesId: null,
    });
  });

  /** `@db.Date` truncates in UTC, so a KL count must not land the day before. */
  it("stores the day as UTC midnight", async () => {
    await saveStockCounts(input);
    const stored = stockCreate.mock.calls[0][0].data.countedOn as Date;
    expect(stored.toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("supersedes the standing count for a day already counted", async () => {
    stockFindMany.mockResolvedValue([{ id: "old", productId: "p1" }]);
    const result = await saveStockCounts(input);
    expect(stockCreate.mock.calls[0][0].data.supersedesId).toBe("old");
    expect(result).toMatchObject({ success: true, data: { saved: 1, corrected: 1 } });
  });

  /**
   * The cache is rewritten from the ledger, never from what was just typed:
   * correcting a past day must leave the current figure alone.
   */
  it("rewrites Product.stockCartons from the ledger, not from the entry", async () => {
    stockFindFirst.mockResolvedValue({ cartons: 80 });
    await saveStockCounts(input);
    expect(productUpdate.mock.calls[0][0]).toEqual({
      where: { id: "p1" },
      data: { stockCartons: 80 },
    });
  });

  it("refuses a negative count, and writes nothing", async () => {
    const result = await saveStockCounts({
      ...input,
      entries: [{ productId: "p1", cartons: -1 }],
    });
    expect(result).toMatchObject({ success: false });
    expect(stockCreate).not.toHaveBeenCalled();
  });

  it("refuses a count of nothing at all", async () => {
    const result = await saveStockCounts({ ...input, entries: [] });
    expect(result).toMatchObject({ success: false, error: "Nothing was counted" });
    expect(stockCreate).not.toHaveBeenCalled();
  });

  it("takes zero as a real count", async () => {
    await saveStockCounts({ ...input, entries: [{ productId: "p1", cartons: 0 }] });
    expect(stockCreate.mock.calls[0][0].data.cartons).toBe(0);
  });
});
