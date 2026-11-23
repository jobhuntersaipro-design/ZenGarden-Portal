import { describe, expect, it } from "vitest";
import {
  DraftLineItemSchema,
  PoDraftSchema,
  draftIssueMessage,
} from "@/lib/validation/purchase-orders";

const line = (over: Record<string, unknown> = {}) => ({
  sku: null,
  description: "Zen shower cream 2.1L",
  quantity: "1",
  unit: null,
  unitPrice: "10.00",
  amount: "10.00",
  ...over,
});

describe("DraftLineItemSchema — productDecision", () => {
  it("defaults to unset, so a draft written before this phase must be reviewed", () => {
    const parsed = DraftLineItemSchema.parse(line());
    expect(parsed.productDecision).toBe("unset");
  });

  it("rejects a linked line with no product, which would point at nothing", () => {
    const parsed = DraftLineItemSchema.safeParse(
      line({ productDecision: "linked", productId: null }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a linked line carrying its product", () => {
    const parsed = DraftLineItemSchema.safeParse(
      line({ productDecision: "linked", productId: "prd1" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts new and none without a product", () => {
    for (const productDecision of ["new", "none"] as const) {
      expect(
        DraftLineItemSchema.safeParse(line({ productDecision })).success,
      ).toBe(true);
    }
  });
});

describe("draftIssueMessage", () => {
  const draft = {
    poNumber: "PO2600500",
    newBuyerName: "FAIN PTE LTD",
    poDate: "2026-10-30",
    currency: "MYR",
    paymentTerms: "14",
    subtotal: "10.00",
    tax: "0.00",
    total: "10.00",
    lineItems: [
      { sku: null, description: "A", quantity: "1", unit: null, unitPrice: "10", amount: "10.00", productDecision: "none" },
    ],
  };
  const message = (patch: object) => {
    const parsed = PoDraftSchema.safeParse({ ...draft, ...patch });
    return parsed.success ? null : draftIssueMessage(parsed.error.issues);
  };

  it("names payment terms read off the page as words", () => {
    expect(message({ paymentTerms: "14 DAYS" })).toBe(
      "Payment terms are a whole number of days, 0 or more.",
    );
  });

  it("names the line, counting from 1, and how many more", () => {
    expect(
      message({
        lineItems: [draft.lineItems[0], { ...draft.lineItems[0], unitPrice: "x" }],
        currency: "",
      }),
    ).toBe("Currency is required (and 1 more)");
    expect(
      message({ lineItems: [draft.lineItems[0], { ...draft.lineItems[0], unitPrice: "" }] }),
    ).toBe("Line 2: Unit price is required");
    expect(
      message({ lineItems: [draft.lineItems[0], { ...draft.lineItems[0], unitPrice: "x" }] }),
    ).toBe("Line 2: Unit price must be a number");
  });

  it("is null for a draft that parses", () => {
    expect(message({})).toBeNull();
  });
});
