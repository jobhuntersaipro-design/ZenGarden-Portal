import { beforeEach, describe, expect, it, vi } from "vitest";

const webFindUnique = vi.fn();
const webUpdate = vi.fn();
const webUpdateMany = vi.fn();
const requireUser = vi.fn();
const writePurchaseOrder = vi.fn();

const tx = {
  webOrder: { findUnique: webFindUnique, update: webUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    webOrder: { updateMany: webUpdateMany },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
// The writer is exercised by confirm.test.ts; here what matters is *how* it is
// called — above all, with documentId null.
vi.mock("@/actions/purchase-orders", () => ({ writePurchaseOrder }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { confirmWebOrder, declineWebOrder } =
  await import("@/actions/web-orders");

const line = (over: Record<string, unknown> = {}) =>
  ({
    sku: null,
    description: "Bamboo garden screen 1.8m",
    quantity: "3",
    unit: "panel",
    unitPrice: "225.50",
    amount: "676.50",
    productDecision: "linked",
    productId: "prd1",
    ...over,
  }) as Parameters<typeof confirmWebOrder>[1]["lineItems"][number];

const draft = (over: Record<string, unknown> = {}) =>
  ({
    poNumber: "W-2609-00001",
    buyerId: "b1",
    poDate: "2026-09-10",
    currency: "MYR",
    paymentTerms: null,
    lineItems: [line()],
    subtotal: "676.50",
    tax: "0.00",
    total: "676.50",
    ...over,
  }) as Parameters<typeof confirmWebOrder>[1];

beforeEach(() => {
  vi.resetAllMocks();
  requireUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
  webFindUnique.mockResolvedValue({
    id: "wo1",
    status: "SUBMITTED",
    buyerId: "b1",
    buyerReference: "ACME-PO-771",
  });
  webUpdate.mockResolvedValue({});
  webUpdateMany.mockResolvedValue({ count: 1 });
  writePurchaseOrder.mockResolvedValue("po-new");
});

describe("confirmWebOrder", () => {
  it("writes the purchase order with no document — the whole reason documentId is nullable", async () => {
    await confirmWebOrder("wo1", draft());
    expect(writePurchaseOrder.mock.calls[0][1].documentId).toBeNull();
  });

  it("carries the buyer's own reference onto the purchase order", async () => {
    await confirmWebOrder("wo1", draft());
    expect(writePurchaseOrder.mock.calls[0][1].buyerReference).toBe(
      "ACME-PO-771",
    );
  });

  it("links the web order to the purchase order it became", async () => {
    const result = await confirmWebOrder("wo1", draft());
    expect(result).toEqual({ success: true, data: { poId: "po-new" } });
    const data = webUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("CONFIRMED");
    expect(data.purchaseOrderId).toBe("po-new");
    expect(data.reviewedById).toBe("u1");
  });

  it("applies the totals gate, and writes nothing when it fails", async () => {
    const result = await confirmWebOrder("wo1", draft({ total: "999.00" }));
    expect(result).toEqual({
      success: false,
      error: "The totals don't match the order.",
    });
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("saves a mismatch once it is acknowledged, and says so to the writer", async () => {
    const result = await confirmWebOrder("wo1", draft({ total: "999.00" }), {
      totalsAcknowledged: true,
    });
    expect(result.success).toBe(true);
    expect(writePurchaseOrder.mock.calls[0][1].totalsAcknowledged).toBe(true);
  });

  it("refuses a line nobody decided", async () => {
    const result = await confirmWebOrder(
      "wo1",
      draft({ lineItems: [line({ productDecision: "unset" })] }),
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(
      /every line needs a product/i,
    );
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("refuses an order somebody has already reviewed", async () => {
    webFindUnique.mockResolvedValue({
      id: "wo1",
      status: "CONFIRMED",
      buyerId: "b1",
      buyerReference: null,
    });
    const result = await confirmWebOrder("wo1", draft());
    expect(result).toEqual({
      success: false,
      error: "This one has already been reviewed.",
    });
  });

  it("refuses a client, because requireUser now means staff", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireUser.mockRejectedValue(
      new UnauthorizedError("This is not a portal account."),
    );
    const result = await confirmWebOrder("wo1", draft());
    expect(result).toEqual({
      success: false,
      error: "This is not a portal account.",
    });
  });
});

describe("declineWebOrder", () => {
  it("requires a reason, because the buyer is shown it", async () => {
    const result = await declineWebOrder("wo1", { reason: "   " });
    expect(result.success).toBe(false);
    expect(webUpdateMany).not.toHaveBeenCalled();
  });

  it("guards on the status the reviewer last saw, so two people cannot both win", async () => {
    await declineWebOrder("wo1", { reason: "Out of stock until October." });
    expect(webUpdateMany.mock.calls[0][0].where).toEqual({
      id: "wo1",
      status: "SUBMITTED",
    });
  });

  it("says so when somebody else got there first", async () => {
    webUpdateMany.mockResolvedValue({ count: 0 });
    const result = await declineWebOrder("wo1", { reason: "Out of stock." });
    expect(result).toEqual({
      success: false,
      error: "This one has already been reviewed.",
    });
  });
});
