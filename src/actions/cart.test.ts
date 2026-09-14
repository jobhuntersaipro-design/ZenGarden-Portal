import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindUnique = vi.fn();
const productFindMany = vi.fn();
const webOrderFindFirst = vi.fn();
const webOrderCreate = vi.fn();
const webOrderUpdate = vi.fn();
const webOrderCount = vi.fn();
const lineUpsert = vi.fn();
const lineUpdateMany = vi.fn();
const lineDeleteMany = vi.fn();
const lineUpdate = vi.fn();
const requireClient = vi.fn();
const prismaWebOrderFindUnique = vi.fn();
const userFindMany = vi.fn();

const tx = {
  webOrder: { findFirst: webOrderFindFirst, update: webOrderUpdate },
  webOrderLine: { update: lineUpdate, upsert: lineUpsert },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    product: { findUnique: productFindUnique, findMany: productFindMany },
    user: { findMany: userFindMany },
    webOrder: {
      findUnique: prismaWebOrderFindUnique,
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
const loadCart = vi.fn();
vi.mock("@/lib/queries/cart", () => ({ loadCart }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://www.example.com" } }));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail }));
// `after` runs the notifications once the response is out. Invoked inline
// here so their failure modes are still exercised rather than silently
// skipped — and the returned promise is *kept*, because `submitWebOrder`
// does not await it: without `flushAfter()` a test asserting on an email
// would race the send and read zero calls.
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterTasks.push(Promise.resolve(fn()));
  },
}));
const flushAfter = async () => {
  await Promise.all(afterTasks);
  afterTasks.length = 0;
};

const { addToCart, setCartons, removeFromCart, submitWebOrder, mergeGuestCart } =
  await import("@/actions/cart");
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
  productFindMany.mockResolvedValue([sellable]);
  webOrderFindFirst.mockResolvedValue({ id: "cart1", reference: "W-2609-00001", lines: [] });
  webOrderCount.mockResolvedValue(0);
  lineUpsert.mockResolvedValue({});
  lineUpdateMany.mockResolvedValue({ count: 1 });
  lineUpdate.mockResolvedValue({});
  webOrderUpdate.mockResolvedValue({});
  prismaWebOrderFindUnique.mockResolvedValue(null);
  userFindMany.mockResolvedValue([]);
  sendEmail.mockResolvedValue({ sent: true });
  afterTasks.length = 0;
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
    expect(loadCart).not.toHaveBeenCalled();
  });

  it("answers with the caller's re-priced cart, so the screen needs no refresh", async () => {
    const repriced = { id: "cart1", lines: [], subtotal: "756.00", cartonCount: 4 };
    loadCart.mockResolvedValue(repriced);
    const result = await setCartons({ productId: "p1", cartons: 4 });
    expect(loadCart).toHaveBeenCalledWith("c1");
    expect(result).toEqual({ success: true, data: repriced });
  });
});

describe("removeFromCart", () => {
  it("answers with the caller's re-priced cart, so the screen needs no refresh", async () => {
    lineDeleteMany.mockResolvedValue({ count: 1 });
    const repriced = { id: "cart1", lines: [], subtotal: "0.00", cartonCount: 0 };
    loadCart.mockResolvedValue(repriced);
    const result = await removeFromCart("p1");
    expect(lineDeleteMany.mock.calls[0][0].where.webOrder).toEqual({
      placedById: "c1",
      status: "DRAFT",
    });
    expect(loadCart).toHaveBeenCalledWith("c1");
    expect(result).toEqual({ success: true, data: repriced });
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

  it("stores the requested date as the calendar day the client picked", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([line()]));
    await submitWebOrder({ requestedDate: "2026-09-20" });

    const update = webOrderUpdate.mock.calls.at(-1)![0].data;
    // UTC midnight, so a `@db.Date` column stores the 20th and not the 19th:
    // a timestamp compared against a date column is truncated in UTC.
    expect(update.requestedDate.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("stores no requested date when the client did not pick one", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([line()]));
    await submitWebOrder({});
    expect(webOrderUpdate.mock.calls.at(-1)![0].data.requestedDate).toBeNull();
  });

  it("refuses a requested date that is not a calendar day", async () => {
    const result = await submitWebOrder({ requestedDate: "next tuesday" });
    expect(result.success).toBe(false);
    expect(webOrderUpdate).not.toHaveBeenCalled();
  });

  it("sends the client their own receipt, not just the ops notification", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([line()]));
    prismaWebOrderFindUnique.mockResolvedValue({
      id: "w1",
      reference: "W-2609-00001",
      buyerReference: null,
      subtotal: dec("2268.00"),
      buyer: { name: "Acme" },
      placedBy: { name: "Aisha", email: "aisha@acme.test" },
      _count: { lines: 1 },
    });
    userFindMany.mockResolvedValue([{ email: "ops@lovinghands.test" }]);

    await submitWebOrder();
    await flushAfter();

    const recipients = sendEmail.mock.calls.map((call) => call[0].to);
    expect(recipients).toContainEqual(["aisha@acme.test"]);
    expect(recipients).toContainEqual(["ops@lovinghands.test"]);
  });

  it("still sends the client their receipt when there is no ops staff to tell", async () => {
    webOrderFindFirst.mockResolvedValue(cartWith([line()]));
    prismaWebOrderFindUnique.mockResolvedValue({
      id: "w1",
      reference: "W-2609-00001",
      buyerReference: null,
      subtotal: dec("2268.00"),
      buyer: { name: "Acme" },
      placedBy: { name: "Aisha", email: "aisha@acme.test" },
      _count: { lines: 1 },
    });
    userFindMany.mockResolvedValue([]);

    await submitWebOrder();
    await flushAfter();

    expect(sendEmail.mock.calls.map((call) => call[0].to)).toEqual([
      ["aisha@acme.test"],
    ]);
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

describe("mergeGuestCart", () => {
  it("refuses a guest", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireClient.mockRejectedValue(new UnauthorizedError("not a shop account"));
    const result = await mergeGuestCart([{ productId: "p1", cartons: 2 }]);
    expect(result).toEqual({ success: false, error: "not a shop account" });
  });

  it("increments an existing line through the same upsert addToCart uses", async () => {
    const result = await mergeGuestCart([{ productId: "p1", cartons: 3 }]);
    const call = lineUpsert.mock.calls[0][0];
    expect(call.where.webOrderId_productId).toEqual({
      webOrderId: "cart1",
      productId: "p1",
    });
    expect(call.update).toEqual({ cartons: { increment: 3 } });
    expect(result).toEqual({ success: true, data: { merged: 1, skipped: 0 } });
  });

  it("skips an unavailable product and reports skipped: 1", async () => {
    productFindMany.mockResolvedValue([{ ...sellable, active: false }]);
    const result = await mergeGuestCart([{ productId: "p1", cartons: 3 }]);
    expect(result).toEqual({ success: true, data: { merged: 0, skipped: 1 } });
    expect(lineUpsert).not.toHaveBeenCalled();
  });

  it("returns merged and skipped counts without opening a cart for an empty array", async () => {
    const result = await mergeGuestCart([]);
    expect(result).toEqual({ success: true, data: { merged: 0, skipped: 0 } });
    expect(webOrderFindFirst).not.toHaveBeenCalled();
    expect(webOrderCreate).not.toHaveBeenCalled();
    expect(productFindMany).not.toHaveBeenCalled();
  });
});
