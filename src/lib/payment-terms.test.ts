import { describe, expect, it } from "vitest";
import {
  formatPaymentTerms,
  optionalPaymentTermsSchema,
  parsePaymentTermsDays,
  paymentTermsSchema,
} from "@/lib/payment-terms";

describe("paymentTermsSchema", () => {
  it("accepts a whole number of days, zero included", () => {
    expect(paymentTermsSchema.parse("30")).toBe("30 days");
    expect(paymentTermsSchema.parse("0")).toBe("0 days");
    expect(paymentTermsSchema.parse(" 45 ")).toBe("45 days");
    expect(paymentTermsSchema.parse("1")).toBe("1 day");
  });

  it("reads an empty field as no terms rather than zero", () => {
    expect(paymentTermsSchema.parse("")).toBeNull();
    expect(paymentTermsSchema.parse(null)).toBeNull();
    expect(optionalPaymentTermsSchema.parse(null)).toBeNull();
  });

  /**
   * An absent key stays absent, so a patch naming only the remark cannot
   * clear the terms — the Phase 23 defect, guarded here rather than re-met.
   */
  it("passes an omitted key straight through", () => {
    expect(optionalPaymentTermsSchema.parse(undefined)).toBeUndefined();
  });

  /**
   * The whole point. A negative sign, a decimal point and free text are all
   * refused on the server, whatever the input element allowed.
   */
  it("refuses anything that is not a whole number of days", () => {
    for (const bad of ["-1", "-30", "30.5", "1e3", "Net 30", "COD", "30 days", "٣٠"]) {
      expect(paymentTermsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("parsePaymentTermsDays", () => {
  it("opens what is already stored", () => {
    expect(parsePaymentTermsDays("30 days")).toBe(30);
    expect(parsePaymentTermsDays("1 day")).toBe(1);
    expect(parsePaymentTermsDays("45")).toBe(45);
    expect(parsePaymentTermsDays("Net 30")).toBe(30);
  });

  it("reads a value carrying no number as nothing to show", () => {
    for (const none of ["COD", "", null, undefined]) {
      expect(parsePaymentTermsDays(none)).toBeNull();
    }
  });

  it("round-trips through the form", () => {
    const stored = "30 days";
    const days = parsePaymentTermsDays(stored)!;
    expect(paymentTermsSchema.parse(String(days))).toBe(stored);
  });
});

describe("formatPaymentTerms", () => {
  it("says day once and days otherwise", () => {
    expect(formatPaymentTerms(1)).toBe("1 day");
    expect(formatPaymentTerms(0)).toBe("0 days");
    expect(formatPaymentTerms(60)).toBe("60 days");
  });
});
