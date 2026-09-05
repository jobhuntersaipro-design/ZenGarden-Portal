import { beforeEach, describe, expect, it, vi } from "vitest";

const poCreate = vi.fn();
const lineItemCreateMany = vi.fn();
const stageEventCreate = vi.fn();
const extractionUpdate = vi.fn();
const extractionFindUnique = vi.fn();
const extractionFindMany = vi.fn();
const poFindUnique = vi.fn();
const buyerUpsert = vi.fn();

const tx = {
  buyer: { upsert: buyerUpsert },
  purchaseOrder: { create: poCreate, findUnique: poFindUnique },
  lineItem: { createMany: lineItemCreateMany },
  poStageEvent: { create: stageEventCreate },
  extraction: { findUnique: extractionFindUnique, update: extractionUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    extraction: { findMany: extractionFindMany },
  },
}));
// Mocked outright rather than through importActual: the real module imports
// `@/lib/auth` -> next-auth -> next/server, which the node test environment
// cannot resolve and which none of these assertions need.
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "aisha@lovinghandsportal.com",
    name: "Aisha Rahman",
    image: null,
    role: "MEMBER",
    mustChangePassword: false,
  }),
}));
vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "k", EXTRACTION_MODEL: "m" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { confirmPurchaseOrder } = await import("@/actions/purchase-orders");

const draft = (over: Record<string, unknown> = {}) => ({
  poNumber: "PO-2026-0917",
  buyerId: "buyer-1",
  poDate: "2026-09-17",
  deliveryDate: null,
  currency: "MYR",
  buyerReference: null,
  paymentTerms: null,
  lineItems: [
    {
      description: "Stone lantern 60cm",
      quantity: "20",
      unit: "piece",
      unitPrice: "600.00",
      amount: "12000.00",
    },
  ],
  subtotal: "12000.00",
  tax: "400.00",
  total: "12400.00",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  poCreate.mockResolvedValue({ id: "po-1" });
  lineItemCreateMany.mockResolvedValue({ count: 1 });
  stageEventCreate.mockResolvedValue({});
  extractionUpdate.mockResolvedValue({});
  extractionFindUnique.mockResolvedValue({ documentId: "doc-1", status: "SUCCEEDED" });
  extractionFindMany.mockResolvedValue([]);
  buyerUpsert.mockResolvedValue({ id: "buyer-new" });
});

describe("confirmPurchaseOrder — the totals gate", () => {
  it("saves when subtotal + tax equals the document total", async () => {
    const result = await confirmPurchaseOrder("ext-1", draft());
    expect(result.success).toBe(true);
    expect(poCreate).toHaveBeenCalledOnce();
  });

  it("refuses a mismatch and writes nothing, even called directly", async () => {
    // This is the devtools path from acceptance criterion 9: no acknowledgement
    // flag, totals disagree.
    const result = await confirmPurchaseOrder("ext-1", draft({ total: "12000.00" }));
    expect(result).toEqual({
      success: false,
      error: "The totals don't match the document.",
    });
    expect(poCreate).not.toHaveBeenCalled();
    expect(lineItemCreateMany).not.toHaveBeenCalled();
    expect(extractionUpdate).not.toHaveBeenCalled();
  });

  it("saves a mismatch once it is acknowledged", async () => {
    const result = await confirmPurchaseOrder("ext-1", draft({ total: "12000.00" }), {
      totalsAcknowledged: true,
    });
    expect(result.success).toBe(true);
  });

  it("records the acknowledgement as an auditable EDIT event naming the figures", async () => {
    await confirmPurchaseOrder("ext-1", draft({ total: "12000.00" }), {
      totalsAcknowledged: true,
    });
    const edit = stageEventCreate.mock.calls
      .map((call) => call[0].data)
      .find((data) => data.kind === "EDIT");
    expect(edit).toBeDefined();
    expect(edit.changedById).toBe("user-1");
    expect(edit.note).toBe(
      "Confirmed with a totals mismatch: computed RM 12,400.00, document RM 12,000.00, difference RM 400.00",
    );
  });

  it("writes no EDIT event when the totals agree", async () => {
    await confirmPurchaseOrder("ext-1", draft(), { totalsAcknowledged: true });
    const kinds = stageEventCreate.mock.calls.map((call) => call[0].data.kind);
    expect(kinds).toEqual(["STAGE"]);
  });

  it("always writes the System stage event at Order placed", async () => {
    await confirmPurchaseOrder("ext-1", draft());
    const stage = stageEventCreate.mock.calls[0][0].data;
    expect(stage.toStage).toBe("ORDER_PLACED");
    // null renders as "System": confirming is not a person advancing the order.
    expect(stage.changedById).toBeNull();
  });
});

describe("confirmPurchaseOrder — revisions", () => {
  it("saves a first confirmation as revision 1 with no parent", async () => {
    await confirmPurchaseOrder("ext-1", draft());
    expect(poCreate.mock.calls[0][0].data.revision).toBe(1);
    expect(poCreate.mock.calls[0][0].data.revisionOfId).toBeNull();
  });

  it("numbers a revision from the PO it supersedes", async () => {
    poFindUnique.mockResolvedValue({ id: "po-old", revision: 1 });
    await confirmPurchaseOrder("ext-1", draft(), { revisedOf: "po-old" });
    expect(poCreate.mock.calls[0][0].data.revision).toBe(2);
    expect(poCreate.mock.calls[0][0].data.revisionOfId).toBe("po-old");
  });

  it("keeps counting up from revision 2", async () => {
    poFindUnique.mockResolvedValue({ id: "po-old", revision: 2 });
    await confirmPurchaseOrder("ext-1", draft(), { revisedOf: "po-old" });
    expect(poCreate.mock.calls[0][0].data.revision).toBe(3);
  });
});

describe("confirmPurchaseOrder — buyers and validation", () => {
  it("creates a buyer when the draft names a new one", async () => {
    const { buyerId: _drop, ...rest } = draft();
    void _drop;
    await confirmPurchaseOrder("ext-1", { ...rest, newBuyerName: "New Buyer Sdn Bhd" });
    expect(buyerUpsert).toHaveBeenCalledOnce();
    expect(poCreate.mock.calls[0][0].data.buyerId).toBe("buyer-new");
  });

  it("refuses a draft with no buyer at all", async () => {
    const { buyerId: _drop, ...rest } = draft();
    void _drop;
    const result = await confirmPurchaseOrder("ext-1", rest);
    expect(result.success).toBe(false);
    expect(poCreate).not.toHaveBeenCalled();
  });

  it("refuses a draft with no line items", async () => {
    const result = await confirmPurchaseOrder("ext-1", draft({ lineItems: [] }));
    expect(result.success).toBe(false);
    expect(poCreate).not.toHaveBeenCalled();
  });

  it("gives the line items their document order as positions", async () => {
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [
          { description: "A", quantity: "1", unit: null, unitPrice: "1.00", amount: "1.00" },
          { description: "B", quantity: "1", unit: null, unitPrice: "1.00", amount: "1.00" },
        ],
        subtotal: "2.00",
        tax: "0.00",
        total: "2.00",
      }),
    );
    expect(lineItemCreateMany.mock.calls[0][0].data.map((l: { position: number }) => l.position)).toEqual([0, 1]);
  });

  it("refuses to re-confirm an extraction that is already confirmed", async () => {
    extractionFindUnique.mockResolvedValue({ documentId: "doc-1", status: "CONFIRMED" });
    const result = await confirmPurchaseOrder("ext-1", draft());
    expect(result).toEqual({ success: false, error: "This one is already confirmed." });
  });
});

describe("confirmPurchaseOrder — the review queue", () => {
  it("returns the next open extraction in queue order", async () => {
    extractionFindMany.mockResolvedValue([{ id: "ext-3" }]);
    const result = await confirmPurchaseOrder("ext-1", draft(), {}, [
      "ext-1",
      "ext-2",
      "ext-3",
    ]);
    expect(result.success && result.data.nextExtractionId).toBe("ext-3");
  });

  it("returns null when nothing is left to review", async () => {
    extractionFindMany.mockResolvedValue([]);
    const result = await confirmPurchaseOrder("ext-1", draft(), {}, ["ext-1"]);
    expect(result.success && result.data.nextExtractionId).toBeNull();
  });
});
