import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindUnique = vi.fn();
const webOrderFindFirst = vi.fn();
const webOrderCreate = vi.fn();
const webOrderUpdate = vi.fn();
const webOrderCount = vi.fn();
const lineUpsert = vi.fn();
const lineUpdateMany = vi.fn();
const lineDeleteMany = vi.fn();
const lineUpdate = vi.fn();
const requireClient = vi.fn();

const tx = {
  webOrder: { findFirst: webOrderFindFirst, update: webOrderUpdate },
  webOrderLine: { update: lineUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    product: { findUnique: productFindUnique },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    webOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: webOrderFindFirst,
      create: webOrderCreate,
      update: webOrderUpdate,
      count: webOrderCount,
    },
    webOrderLine: {
      upsert: lineUpsert,
      updateMany: lineUpdateMany,
      deleteMany: lineDeleteMany,
    },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://www.example.com" } }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
// `after` runs the ops notification once the response is out. Invoked inline
// here so its failure modes are still exercised rather than silently skipped.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const { addToCart, setCartons, submitWebOrder } = await import("@/actions/cart");
const { Prisma } = await import("@/generated/prisma/client");

const dec = (v: string) => new Prisma.Decimal(v);

const sellable = {
  id: "p1",
  active: true,
  needsReview: false,
  listPrice: dec("189.00"),
};

beforeEach(() => {
  vi.resetAllMocks();
  requireClient.mockResolvedValue({ id: "c1", buyerId: "b1", role: "CLIENT" });
  productFindUnique.mockResolvedValue(sellable);
  webOrderFindFirst.mockResolvedValue({ id: "cart1", reference: "W-2609-00001", lines: [] });
  webOrderCount.mockResolvedValue(0);
  lineUpsert.mockResolvedValue({});
  lineUpdateMany.mockResolvedValue({ count: 1 });
  lineUpdate.mockResolvedValue({});
  webOrderUpdate.mockResolvedValue({});
});

describe("addToCart", () => {
  it("adds the same product twice as one line, not two", async () => {
    await addToCart({ productId: "p1", cartons: 2 });
    const call = lineUpsert.mock.calls[0][0];
    expect(call.where.webOrderId_productId).toEqual({
      webOrderId: "cart1",
      productId: "p1",
    });
    expect(call.update).toEqual({ cartons: { increment: 2 } });
  });

  it("stores cartons and the product, and no price at all", async () => {
    await addToCart({ productId: "p1", cartons: 2 });
    const created = lineUpsert.mock.calls[0][0].create;
    expect(Object.keys(created).sort()).toEqual(["cartons", "productId", "webOrderId"]);
  });

  it.each([
    ["archived", { ...sellable, active: false }],
    ["still needing review", { ...sellable, needsReview: true }],
    ["unpriced", { ...sellable, listPrice: dec("0") }],
    ["gone", null],
  ])("refuses a product that is %s", async (_label, product) => {
    productFindUnique.mockResolvedValue(product);
    const result = await addToCart({ productId: "p1", cartons: 1 });
    expect(result.success).toBe(false);
    expect(lineUpsert).not.toHaveBeenCalled();
  });

  it.each([0, -3, 1.5, 10_000])("refuses %s cartons", async (cartons) => {
    const result = await addToCart({ productId: "p1", cartons });
    expect(result.success).toBe(false);
    expect(lineUpsert).not.toHaveBeenCalled();
  });
});

describe("setCartons", () => {
  it("can only touch the caller's own draft", async () => {
    await setCartons({ productId: "p1", cartons: 4 });
    expect(lineUpdateMany.mock.calls[0][0].where.webOrder).toEqual({
      placedById: "c1",
      status: "DRAFT",
    });
  });

  it("says so when the line has already gone", async () => {
    lineUpdateMany.mockResolvedValue({ count: 0 });
    const result = await setCartons({ productId: "p1", cartons: 4 });
    expect(result.success).toBe(false);
  });
});

describe("submitWebOrder", () => {
  const cartWith = (lines: unknown[]) => ({
    id: "cart1",
    reference: "W-2609-00001",
    lines,
  });
  const line = (over: Record<string, unknown> = {}) => ({
    id: "l1",
    cartons: 12,
    product: { packSize: 6, unit: "carton", ...sellable },
    ...over,
  });

  it("snapshots today's price onto every line — the only place a price is written", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([line()]));
    await submitWebOrder();
    const written = lineUpdate.mock.calls[0][0].data;
    expect(written.unitPrice.toFixed(2)).toBe("189.00");
    expect(written.amount.toFixed(2)).toBe("2268.00"); // 12 x 189.00
    expect(written.packSize).toBe(6);
    expect(written.unit).toBe("carton");
  });

  it("totals the order from those same figures", async () => {
    webOrderFindFirst.mockResolvedValue(
      cartWith([line(), line({ id: "l2", cartons: 1 })]),
    );
    await submitWebOrder();
    const update = webOrderUpdate.mock.calls.at(-1)![0].data;
    expect(update.subtotal.toFixed(2)).toBe("2457.00"); // 2268.00 + 189.00
    expect(update.status).toBe("SUBMITTED");
    expect(update.submittedAt).toBeInstanceOf(Date);
  });

  it("refuses an empty cart", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([]));
    const result = await submitWebOrder();
    expect(result).toEqual({ success: false, error: "Your order is empty." });
    expect(webOrderUpdate).not.toHaveBeenCalled();
  });

  it("refuses when a line left the shop while the cart sat open", async () => {
    webOrderFindFirst.mockResolvedValue(
      cartWith([line({ product: { packSize: 6, unit: "carton", ...sellable, active: false } })]),
    );
    const result = await submitWebOrder();
    expect(result.success).toBe(false);
    expect(webOrderUpdate).not.toHaveBeenCalled();
  });

  it("caps how many orders a buyer can leave waiting on the ops team", async () => {
    webOrderCount.mockResolvedValue(5);
    const result = await submitWebOrder();
    expect(result.success).toBe(false);
    expect(webOrderFindFirst).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not a client", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireClient.mockRejectedValue(new UnauthorizedError("not a shop account"));
    const result = await submitWebOrder();
    expect(result).toEqual({ success: false, error: "not a shop account" });
  });
});
