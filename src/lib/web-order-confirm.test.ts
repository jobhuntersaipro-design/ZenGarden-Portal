import { beforeEach, describe, expect, it, vi } from "vitest";
import { productCerts, type ProductCerts } from "@/lib/certification";

const writePurchaseOrder = vi.fn().mockResolvedValue("po_1");
const updateMany = vi.fn().mockResolvedValue({ count: 1 });
const tx = {
  webOrder: {
    findUnique: vi.fn().mockResolvedValue({
      id: "wo_1",
      status: "SUBMITTED",
      buyerId: "b_1",
      buyerReference: "ACME-1",
      reference: "W-2610-00001",
      placedBy: { email: "buyer@example.test" },
    }),
    updateMany,
  },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/actions/purchase-orders", () => ({ writePurchaseOrder }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://portal.test" } }));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/web-order-document", () => ({ attachWebOrderDocument: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/po-email", () => ({
  preparePoEmail: vi.fn().mockResolvedValue({ attachments: [], attached: false, document: null, buyerLogo: null, preview: false }),
}));
const order = {
  id: "wo_1",
  status: "SUBMITTED",
  buyerId: "b_1",
  buyerPaymentTerms: "30 days",
  subtotal: "192.00",
  lines: [
    { productId: "p_green", sku: "A", name: "A", cartons: 1, packSize: 12, unit: "carton", unitPrice: "96.00", amount: "96.00" },
    { productId: "p_other", sku: "B", name: "B", cartons: 1, packSize: 12, unit: "carton", unitPrice: "96.00", amount: "96.00" },
  ],
};
vi.mock("@/lib/queries/web-orders", () => ({ loadWebOrderForReview: () => Promise.resolve(order) }));
let certs = new Map<string, ProductCerts>();
vi.mock("@/lib/queries/certificates", () => ({ loadProductCerts: () => Promise.resolve(certs) }));

const { autoApproveWebOrder } = await import("@/lib/web-order-confirm");

const TODAY = new Date().toISOString().slice(0, 10);
const green = productCerts(
  (["NOT", "HL", "COA"] as const).map((type) => ({ type, expiresOn: "2099-01-01" })),
  [],
  TODAY,
);

describe("autoApproveWebOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves the order for review when one product is not all green", async () => {
    certs = new Map([["p_green", green], ["p_other", productCerts([], [], TODAY)]]);
    expect(await autoApproveWebOrder("wo_1", null)).toBe(false);
    expect(writePurchaseOrder).not.toHaveBeenCalled();
  });

  it("confirms an all-green order with no confirmer and no promised date", async () => {
    certs = new Map([["p_green", green], ["p_other", green]]);
    expect(await autoApproveWebOrder("wo_1", null)).toBe(true);
    expect(writePurchaseOrder).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ confirmedById: null, deliveryDate: null, buyerId: "b_1" }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED", reviewedById: null }) }),
    );
    expect(sendEmail.mock.calls[0][0].subject).toBe("Order ACME-1 confirmed");
  });
});
