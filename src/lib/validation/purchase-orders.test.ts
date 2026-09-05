import { describe, expect, it } from "vitest";
import {
  PoDraftSchema,
  checkTotals,
  lineAmount,
} from "@/lib/validation/purchase-orders";

const draft = (over: Partial<Parameters<typeof checkTotals>[0]> = {}) => ({
  subtotal: "12000.00",
  tax: "400.00",
  total: "12400.00",
  lineItems: [{ amount: "12000.00" }],
  ...over,
});

describe("checkTotals", () => {
  it("matches when subtotal + tax equals the document total", () => {
    const result = checkTotals(draft());
    expect(result.matches).toBe(true);
    expect(result.computed).toBe("12400.00");
    expect(result.document).toBe("12400.00");
    expect(result.difference).toBe("0.00");
  });

  it("compares against the document total, not the line-item sum", () => {
    // Lines sum to the subtotal and tax is real, so a line-sum-vs-total test
    // would call this a mismatch. It is not one.
    const result = checkTotals(draft({ lineItems: [{ amount: "12000.00" }] }));
    expect(result.matches).toBe(true);
    expect(result.lineItemsMatchSubtotal).toBe(true);
  });

  it("reports the difference when the document says something else", () => {
    const result = checkTotals(draft({ total: "12000.00" }));
    expect(result.matches).toBe(false);
    expect(result.computed).toBe("12400.00");
    expect(result.document).toBe("12000.00");
    expect(result.difference).toBe("400.00");
  });

  it("signs the difference when the document total is higher", () => {
    const result = checkTotals(draft({ total: "12900.00" }));
    expect(result.difference).toBe("-500.00");
  });

  it("does not fall for float arithmetic", () => {
    // 0.1 + 0.2 is 0.30000000000000004 as a float; as Decimal it is 0.30.
    const result = checkTotals({
      subtotal: "0.10",
      tax: "0.20",
      total: "0.30",
      lineItems: [{ amount: "0.10" }],
    });
    expect(result.matches).toBe(true);
    expect(result.computed).toBe("0.30");
  });

  it("flags a line-item sum that disagrees with the subtotal as a hint only", () => {
    const result = checkTotals(draft({ lineItems: [{ amount: "11000.00" }] }));
    // The gate still passes; only the hint is false.
    expect(result.matches).toBe(true);
    expect(result.lineItemsMatchSubtotal).toBe(false);
    expect(result.lineItemSum).toBe("11000.00");
  });

  it("treats a missing or unparseable figure as zero rather than throwing", () => {
    const result = checkTotals({
      subtotal: "",
      tax: "not a number",
      total: "0.00",
      lineItems: [],
    });
    expect(result.matches).toBe(true);
    expect(result.computed).toBe("0.00");
  });
});

describe("lineAmount", () => {
  it("multiplies at two decimal places", () => {
    expect(lineAmount("20", "727.1613")).toBe("14543.23");
  });

  it("handles a zero unit price", () => {
    expect(lineAmount("3", "0")).toBe("0.00");
  });
});

describe("PoDraftSchema", () => {
  const valid = {
    poNumber: "PO-2026-0917",
    buyerId: "buy1",
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
        unitPrice: "727.1613",
        amount: "14543.23",
      },
    ],
    subtotal: "14543.23",
    tax: "0.00",
    total: "14543.23",
  };

  it("accepts a complete draft", () => {
    expect(PoDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a new buyer name instead of an id", () => {
    const { buyerId: _drop, ...rest } = valid;
    void _drop;
    expect(
      PoDraftSchema.safeParse({ ...rest, newBuyerName: "Acme Industrial Sdn Bhd" })
        .success,
    ).toBe(true);
  });

  it("refuses a draft with neither buyer id nor new buyer name", () => {
    const { buyerId: _drop, ...rest } = valid;
    void _drop;
    expect(PoDraftSchema.safeParse(rest).success).toBe(false);
  });

  it("refuses a draft with no line items", () => {
    expect(PoDraftSchema.safeParse({ ...valid, lineItems: [] }).success).toBe(false);
  });

  it("refuses a non-ISO date", () => {
    expect(PoDraftSchema.safeParse({ ...valid, poDate: "17/09/2026" }).success).toBe(
      false,
    );
  });

  it("refuses money that is not a number", () => {
    expect(PoDraftSchema.safeParse({ ...valid, total: "RM 14,543.23" }).success).toBe(
      false,
    );
  });
});
