import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindFirst = vi.fn();
const webFindFirst = vi.fn();
const productFindMany = vi.fn();
const lineUpsert = vi.fn();
const requireClient = vi.fn();
const openCart = vi.fn();
const listBuyerOrders = vi.fn();

const tx = { webOrderLine: { upsert: lineUpsert } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    purchaseOrder: { findFirst: poFindFirst },
    webOrder: { findFirst: webFindFirst },
    product: { findMany: productFindMany },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries/web-orders", () => ({ listBuyerOrders }));
// The real orderability rule and the real upsert; only the cart's creation is
// stubbed, since it reaches for the module-level client.
vi.mock("@/lib/cart-writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cart-writes")>();
  return { ...actual, openCart };
});

const { UnauthorizedError } = await import("@/lib/auth-guards");
const { reorderOrder, reorderLast } = await import("@/actions/reorder");
const { Prisma } = await import("@/generated/prisma/client");

const product = (id: string, market = "Vietnam") => ({
  id,
  active: true,
  needsReview: false,
  listPrice: new Prisma.Decimal("210.00"),
  market,
});
const item = (productId: string | null, quantity: string, name = productId ?? "Loose line") => ({
  productId,
  quantity: new Prisma.Decimal(quantity),
  description: name,
  product: productId ? { name } : null,
});

beforeEach(() => {
  vi.resetAllMocks();
  requireClient.mockResolvedValue({ id: "u1", buyerId: "b1", market: "Vietnam" });
  openCart.mockResolvedValue({ id: "cart1" });
  poFindFirst.mockResolvedValue(null);
  webFindFirst.mockResolvedValue(null);
  productFindMany.mockResolvedValue([product("p1"), product("p2"), product("p3")]);
});

describe("reorderOrder", () => {
  it("adds every line of a three-line order with its cartons, incrementing", async () => {
    poFindFirst.mockResolvedValue({
      lineItems: [item("p1", "3"), item("p2", "5"), item("p3", "1")],
    });
    const result = await reorderOrder({ id: "po1" });
    expect(result).toEqual({ success: true, data: { added: 3, skipped: [] } });
    expect(lineUpsert).toHaveBeenCalledTimes(3);
    expect(lineUpsert).toHaveBeenCalledWith({
      where: { webOrderId_productId: { webOrderId: "cart1", productId: "p1" } },
      create: { webOrderId: "cart1", productId: "p1", cartons: 3 },
      update: { cartons: { increment: 3 } },
    });
  });

  it("scopes the lookup to the buyer, so another buyer's order is not found", async () => {
    const result = await reorderOrder({ id: "someone-elses" });
    expect(poFindFirst.mock.calls[0][0].where).toEqual({ id: "someone-elses", buyerId: "b1" });
    expect(webFindFirst.mock.calls[0][0].where).toMatchObject({ id: "someone-elses", buyerId: "b1" });
    expect(result).toEqual({ success: false, error: "We couldn't find that order." });
    expect(lineUpsert).not.toHaveBeenCalled();
  });

  it("skips and names a product that has left the buyer's market", async () => {
    productFindMany.mockResolvedValue([product("p1"), product("p2"), product("p3", "Mydin")]);
    poFindFirst.mockResolvedValue({
      lineItems: [item("p1", "3"), item("p2", "5"), item("p3", "1", "ZEN 1L — Goat's Milk")],
    });
    const result = await reorderOrder({ id: "po1" });
    expect(result).toEqual({
      success: true,
      data: { added: 2, skipped: ["ZEN 1L — Goat's Milk"] },
    });
    expect(lineUpsert).toHaveBeenCalledTimes(2);
  });

  it("skips a line with no product and a part-carton quantity", async () => {
    poFindFirst.mockResolvedValue({
      lineItems: [item("p1", "2"), item(null, "4", "Freight"), item("p2", "1.5", "Half a carton")],
    });
    const result = await reorderOrder({ id: "po1" });
    expect(result).toEqual({
      success: true,
      data: { added: 1, skipped: ["Freight", "Half a carton"] },
    });
  });

  it("adds a product printed twice as one line with both quantities", async () => {
    poFindFirst.mockResolvedValue({ lineItems: [item("p1", "2"), item("p1", "3")] });
    await reorderOrder({ id: "po1" });
    expect(lineUpsert).toHaveBeenCalledTimes(1);
    expect(lineUpsert.mock.calls[0][0].update).toEqual({ cartons: { increment: 5 } });
  });

  it("reads a shop order the team has not confirmed", async () => {
    webFindFirst.mockResolvedValue({
      lines: [{ productId: "p2", cartons: 4, product: { name: "p2" } }],
    });
    const result = await reorderOrder({ id: "w1" });
    expect(result).toEqual({ success: true, data: { added: 1, skipped: [] } });
  });

  it("refuses when nothing can be ordered, and writes nothing", async () => {
    requireClient.mockResolvedValue({ id: "u1", buyerId: "b1", market: null });
    poFindFirst.mockResolvedValue({ lineItems: [item("p1", "3")] });
    const result = await reorderOrder({ id: "po1" });
    expect(result.success).toBe(false);
    expect(openCart).not.toHaveBeenCalled();
  });

  it("refuses a guest", async () => {
    requireClient.mockRejectedValue(new UnauthorizedError("Sign in."));
    expect(await reorderOrder({ id: "po1" })).toEqual({ success: false, error: "Sign in." });
    expect(poFindFirst).not.toHaveBeenCalled();
  });
});

describe("reorderLast", () => {
  it("repeats the newest order on My orders", async () => {
    listBuyerOrders.mockResolvedValue({ orders: [{ id: "po9" }], total: 1 });
    poFindFirst.mockResolvedValue({ lineItems: [item("p1", "1")] });
    await reorderLast();
    expect(listBuyerOrders).toHaveBeenCalledWith("b1", 1, 1);
    expect(poFindFirst.mock.calls[0][0].where).toEqual({ id: "po9", buyerId: "b1" });
  });

  it("says so when there is nothing to repeat", async () => {
    listBuyerOrders.mockResolvedValue({ orders: [], total: 0 });
    expect(await reorderLast()).toEqual({
      success: false,
      error: "You have no orders to repeat yet.",
    });
  });
});
