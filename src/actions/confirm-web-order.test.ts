import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webFindUnique = vi.fn();
const webUpdate = vi.fn();
const webUpdateMany = vi.fn();
const requireUser = vi.fn();
const writePurchaseOrder = vi.fn();

const tx = {
  webOrder: { findUnique: webFindUnique, update: webUpdate },
};

const webFindUniqueOuter = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    webOrder: { updateMany: webUpdateMany, findUnique: webFindUniqueOuter },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
// The writer is exercised by confirm.test.ts; here what matters is *how* it is
// called — above all, with the document the order carries.
vi.mock("@/actions/purchase-orders", () => ({ writePurchaseOrder }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Phase 38: a delivery date that moves emails the buyer, so this module now
// reaches the env and the mailer. `after` is run inline and its promise kept,
// so a test asserting on an email cannot race the send.
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail }));
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
const attachWebOrderDocument = vi.fn();
vi.mock("@/lib/web-order-document", () => ({ attachWebOrderDocument }));

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

/** Confirming a shop order requires a delivery date (Phase 38). */
const OPTIONS = { deliveryDate: "2026-10-02" };

/**
 * What the buyer actually reads. The templates are called as plain functions,
 * so the element that reaches `sendEmail` carries `Layout`'s props rather than
 * the component's — asserting on `react.props.x` reads `undefined` and passes
 * for the wrong reason. Rendering is the honest check.
 */
const mailBody = () => renderToStaticMarkup(sendEmail.mock.calls[0][0].react);

beforeEach(() => {
  vi.resetAllMocks();
  afterTasks.length = 0;
  sendEmail.mockResolvedValue({ sent: true });
  requireUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
  webFindUnique.mockResolvedValue({
    id: "wo1",
    // Confirmable: a shop order must be received before it can be
    // confirmed, so this is the state a default confirm fixture is in.
    status: "RECEIVED",
    buyerId: "b1",
    buyerReference: "ACME-PO-771",
    reference: "W-2609-00001",
    placedBy: { email: "buyer@acme.test" },
    _count: { lines: 1 },
  });
  webUpdate.mockResolvedValue({});
  webUpdateMany.mockResolvedValue({ count: 1 });
  webFindUniqueOuter.mockResolvedValue({
    reference: "W-2609-00001",
    placedBy: { email: "buyer@acme.test" },
  });
  writePurchaseOrder.mockResolvedValue("po-new");
  attachWebOrderDocument.mockResolvedValue({
    documentId: "doc1",
    filename: "W-2609-00001 purchase order.pdf",
    bytes: new Uint8Array([37, 80]),
  });
});

describe("confirmWebOrder", () => {
  /**
   * Phase 37 closes the `documentId: null` gap Phase 16 opened. Usually this
   * is a read — the file was drawn when the order was sent — and the id is
   * carried onto the purchase order so the ops detail page can preview it.
   */
  it("carries the generated purchase order onto the confirmed order", async () => {
    await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(attachWebOrderDocument).toHaveBeenCalledExactlyOnceWith("wo1");
    expect(writePurchaseOrder.mock.calls[0][1].documentId).toBe("doc1");
  });

  it("still confirms with no document when the file cannot be produced", async () => {
    attachWebOrderDocument.mockResolvedValue(null);
    const result = await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(result.success).toBe(true);
    // Nullable since Phase 16 for exactly this: a missing PDF must not block
    // the team from confirming an order they have already agreed.
    expect(writePurchaseOrder.mock.calls[0][1].documentId).toBeNull();
  });

  it("carries the buyer's own reference onto the purchase order", async () => {
    await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(writePurchaseOrder.mock.calls[0][1].buyerReference).toBe(
      "ACME-PO-771",
    );
  });

  it("links the web order to the purchase order it became", async () => {
    const result = await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(result).toEqual({ success: true, data: { poId: "po-new" } });
    const data = webUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("CONFIRMED");
    expect(data.purchaseOrderId).toBe("po-new");
    expect(data.reviewedById).toBe("u1");
  });

  it("applies the totals gate, and writes nothing when it fails", async () => {
    const result = await confirmWebOrder("wo1", draft({ total: "999.00" }), OPTIONS);
    expect(result).toEqual({
      success: false,
      error: "The totals don't match the order.",
    });
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("saves a mismatch once it is acknowledged, and says so to the writer", async () => {
    const result = await confirmWebOrder("wo1", draft({ total: "999.00" }), {
      ...OPTIONS,
      totalsAcknowledged: true,
    });
    expect(result.success).toBe(true);
    expect(writePurchaseOrder.mock.calls[0][1].totalsAcknowledged).toBe(true);
  });

  it("refuses a line nobody decided", async () => {
    const result = await confirmWebOrder(
      "wo1",
      draft({ lineItems: [line({ productDecision: "unset" })] }),
      OPTIONS,
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
    const result = await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(result).toEqual({
      success: false,
      error: "This one has already been reviewed.",
    });
  });

  /**
   * The date is a promise the team makes, and the buyer is emailed it the
   * moment Confirm is pressed. There is no confirming a shop order without
   * one — and `confirm.test.ts`, which covers uploaded purchase orders, still
   * passes unchanged, which is the proof that gate did not spread.
   */
  it("refuses to confirm a shop order with no delivery date", async () => {
    const result = await confirmWebOrder("wo1", draft(), {});
    expect(result).toEqual({
      success: false,
      error: "An expected delivery date is required.",
    });
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("refuses a delivery date that is not a calendar day", async () => {
    const result = await confirmWebOrder("wo1", draft(), {
      deliveryDate: "next tuesday",
    });
    expect(result.success).toBe(false);
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("carries the delivery date to the writer", async () => {
    await confirmWebOrder("wo1", draft(), { deliveryDate: "2026-10-02" });
    expect(writePurchaseOrder.mock.calls[0][1].deliveryDate).toBe("2026-10-02");
  });

  it("tells the buyer their order is on, and when", async () => {
    await confirmWebOrder("wo1", draft(), OPTIONS);
    await flushAfter();

    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(["buyer@acme.test"]);
    expect(call.subject).toBe(
      "Order W-2609-00001 confirmed · delivery expected 2 Oct 2026",
    );
    const body = mailBody();
    expect(body).toContain("2 Oct 2026");
    expect(body).toContain("Order W-2609-00001 is confirmed");
    // Not the "date has moved" wording: this is the first confirmation.
    expect(body).not.toContain("has moved");
  });

  it("confirms even when the email cannot be sent", async () => {
    sendEmail.mockRejectedValue(new Error("Resend is down"));
    const result = await confirmWebOrder("wo1", draft(), OPTIONS);
    await flushAfter().catch(() => {});
    expect(result).toEqual({ success: true, data: { poId: "po-new" } });
  });

  it("refuses a client, because requireUser now means staff", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireUser.mockRejectedValue(
      new UnauthorizedError("This is not a portal account."),
    );
    const result = await confirmWebOrder("wo1", draft(), OPTIONS);
    expect(result).toEqual({
      success: false,
      error: "This is not a portal account.",
    });
  });

  it("refuses an order nobody has received yet, and says which mistake it is", async () => {
    webFindUnique.mockResolvedValue({
      id: "w1",
      status: "SUBMITTED",
      buyerId: "b1",
      buyerReference: null,
      reference: "W-2609-00001",
      placedBy: { email: "buyer@example.com" },
      _count: { lines: 1 },
    });

    const result = await confirmWebOrder("w1", draft(), {
      deliveryDate: "2026-10-02",
    });

    expect(result).toEqual({
      success: false,
      error: "Receive this order before confirming it.",
    });
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("confirms an order that has been received", async () => {
    webFindUnique.mockResolvedValue({
      id: "w1",
      status: "RECEIVED",
      buyerId: "b1",
      buyerReference: null,
      reference: "W-2609-00001",
      placedBy: { email: "buyer@example.com" },
      _count: { lines: 1 },
    });
    writePurchaseOrder.mockResolvedValue("po1");

    const result = await confirmWebOrder("w1", draft(), {
      deliveryDate: "2026-10-02",
    });

    expect(result.success).toBe(true);
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
      status: { in: ["SUBMITTED", "RECEIVED"] },
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

  /**
   * The form has told the reviewer since Phase 16 that "the buyer sees this".
   * Until Phase 38 that was true only if the buyer went looking; now the
   * reason is the email, quoted as written.
   */
  it("sends the buyer the reason the reviewer typed", async () => {
    webFindUniqueOuter.mockResolvedValue({
      reference: "W-2609-00001",
      placedBy: { email: "buyer@acme.test" },
    });

    await declineWebOrder("wo1", { reason: "Out of stock until October." });
    await flushAfter();

    const call = sendEmail.mock.calls[0][0];
    expect(call.to).toEqual(["buyer@acme.test"]);
    expect(call.subject).toBe("About your order W-2609-00001");
    expect(mailBody()).toContain("Out of stock until October.");
  });

  it("sends nothing when nothing was declined", async () => {
    webUpdateMany.mockResolvedValue({ count: 0 });
    await declineWebOrder("wo1", { reason: "Out of stock." });
    await flushAfter();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("declines an order that has already been received", async () => {
    webUpdateMany.mockResolvedValue({ count: 1 });
    webFindUniqueOuter.mockResolvedValue({
      reference: "W-2609-00001",
      placedBy: { email: "buyer@example.com" },
    });

    const result = await declineWebOrder("w1", { reason: "Out of stock" });

    expect(result.success).toBe(true);
    // An order a person has looked at is exactly the one they may turn down.
    expect(webUpdateMany.mock.calls[0]![0].where).toEqual({
      id: "w1",
      status: { in: ["SUBMITTED", "RECEIVED"] },
    });
  });
});
