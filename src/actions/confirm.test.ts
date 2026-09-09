import { beforeEach, describe, expect, it, vi } from "vitest";

const poCreate = vi.fn();
const lineItemCreateMany = vi.fn();
const stageEventCreate = vi.fn();
const extractionUpdate = vi.fn();
const extractionFindUnique = vi.fn();
const extractionFindMany = vi.fn();
const poFindUnique = vi.fn();
const buyerUpsert = vi.fn();
const productFindMany = vi.fn();

/** Ids the confirm-time liveness check should treat as archived or deleted. */
const archivedProductIds = new Set<string>();
/** Lines handed to createProductsForLines, so "only the new ones" is testable. */
const createdForLines: { sku: string | null }[] = [];

const tx = {
  buyer: { upsert: buyerUpsert },
  purchaseOrder: { create: poCreate, findUnique: poFindUnique },
  lineItem: { createMany: lineItemCreateMany },
  product: { findMany: productFindMany },
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
// Since Phase 12 confirm no longer re-resolves codes; it creates products only
// for the lines the reviewer marked "new". The stub records what it was given.
vi.mock("@/lib/extraction/resolve-products", () => ({
  suggestProducts: (lines: unknown[]) => Promise.resolve(lines.map(() => null)),
  createProductsForLines: (_tx: unknown, lines: { sku: string | null }[]) => {
    createdForLines.push(...lines);
    return Promise.resolve(lines.map((_, index) => `new-${index}`));
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { confirmPurchaseOrder } = await import("@/actions/purchase-orders");

const line = (over: Record<string, unknown> = {}) => ({
  sku: null,
  description: "Stone lantern 60cm",
  quantity: "20",
  unit: "piece",
  unitPrice: "600.00",
  amount: "12000.00",
  // Decided by default: every test that is not about the gate needs a draft
  // that passes it.
  productDecision: "linked",
  productId: "prd-existing",
  ...over,
});

/** What the transaction actually wrote, which is the only thing that matters. */
const writtenLines = () => lineItemCreateMany.mock.calls[0][0].data;

const draft = (over: Record<string, unknown> = {}) => ({
  poNumber: "PO-2026-0917",
  buyerId: "buyer-1",
  poDate: "2026-09-17",
  currency: "MYR",
  paymentTerms: null,
  lineItems: [line()],
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
  archivedProductIds.clear();
  createdForLines.length = 0;
  // Every linked product is live unless a test archives it.
  productFindMany.mockImplementation(
    ({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in
          .filter((id) => !archivedProductIds.has(id))
          .map((id) => ({ id })),
      ),
  );
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
          line({ description: "A", quantity: "1", unitPrice: "1.00", amount: "1.00" }),
          line({ description: "B", quantity: "1", unitPrice: "1.00", amount: "1.00" }),
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

describe("confirmPurchaseOrder — the product gate", () => {
  it("refuses a draft with an undecided line", async () => {
    const result = await confirmPurchaseOrder(
      "ext-1",
      draft({ lineItems: [line({ productDecision: "unset" })] }),
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(
      /every line needs a product/i,
    );
    expect(poCreate).not.toHaveBeenCalled();
  });

  it("writes the chosen product, not the one the printed code resolves to", async () => {
    // The whole point: a reviewer corrected the match by hand, and confirm
    // used to overwrite it by re-deriving productId from the code.
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [
          line({
            sku: "ZEN-SC-2100-GM-VN",
            productDecision: "linked",
            productId: "chosen",
          }),
        ],
      }),
    );
    expect(writtenLines()[0].productId).toBe("chosen");
  });

  it("writes no product for a line that is not a product", async () => {
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [line({ description: "Delivery", productDecision: "none" })],
      }),
    );
    expect(writtenLines()[0].productId).toBeNull();
  });

  it("creates a product only for the lines marked new", async () => {
    await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [
          line({ productDecision: "linked", productId: "chosen", amount: "6000.00" }),
          line({ sku: "BRAND-NEW-1", productDecision: "new", amount: "6000.00" }),
        ],
        subtotal: "12000.00",
      }),
    );
    expect(createdForLines).toHaveLength(1);
    expect(createdForLines[0].sku).toBe("BRAND-NEW-1");
    expect(writtenLines()[1].productId).toBe("new-0");
  });

  it("refuses a linked line whose product has since been archived, naming the line", async () => {
    archivedProductIds.add("gone");
    const result = await confirmPurchaseOrder(
      "ext-1",
      draft({
        lineItems: [line({ productDecision: "linked", productId: "gone" })],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/line 1/i);
  });
});
