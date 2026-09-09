import { describe, expect, it } from "vitest";
import { DraftLineItemSchema } from "@/lib/validation/purchase-orders";

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
