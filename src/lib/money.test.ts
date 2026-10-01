import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { formatGrouped, formatMYR, formatMYRCompact, parseMYR, sumDecimals } from "@/lib/money";

describe("formatMYR", () => {
  it("always shows two decimals", () => {
    expect(formatMYR(5)).toBe("RM\u00A05.00");
    expect(formatMYR("1234.5")).toBe("RM\u00A01,234.50");
  });

  it("groups thousands", () => {
    expect(formatMYR(1_000_000)).toBe("RM\u00A01,000,000.00");
    expect(formatMYR(999)).toBe("RM\u00A0999.00");
  });

  it("keeps RM on the same line as its figure (S-18)", () => {
    expect(formatMYR("10252851.5")).toBe("RM\u00A010,252,851.50");
    expect(formatMYR("1")).not.toContain("RM ");
  });

  it("keeps the minus outside the RM", () => {
    expect(formatMYR(-1234.5)).toBe("-RM\u00A01,234.50");
  });

  it("does not lose precision the way a float would", () => {
    expect(formatMYR(new Prisma.Decimal("0.1").plus("0.2"))).toBe("RM\u00A00.30");
  });
});

describe("formatGrouped", () => {
  it("groups the thousands without a currency", () => {
    expect(formatGrouped("1420661.5")).toBe("1,420,661.50");
    expect(formatGrouped("999.00")).toBe("999.00");
    expect(formatGrouped(1200, 0)).toBe("1,200");
    expect(formatGrouped("-12345.678")).toBe("-12,345.68");
  });
});

describe("parseMYR", () => {
  it("round-trips what formatMYR produces", () => {
    expect(parseMYR(formatMYR("98765.43")).toString()).toBe("98765.43");
  });

  it("accepts the prefix, commas and stray space", () => {
    expect(parseMYR(" RM 1,234.50 ").toString()).toBe("1234.5");
    // What formatMYR itself prints since S-18, read back.
    expect(parseMYR(formatMYR("1234.5")).toString()).toBe("1234.5");
  });

  it("throws rather than returning NaN", () => {
    expect(() => parseMYR("")).toThrow();
    expect(() => parseMYR("abc")).toThrow();
    expect(() => parseMYR("RM")).toThrow();
  });
});

describe("sumDecimals", () => {
  it("is exact across many fractional values", () => {
    expect(sumDecimals(Array(10).fill("0.1")).toString()).toBe("1");
  });

  it("returns zero for an empty list", () => {
    expect(sumDecimals([]).toString()).toBe("0");
  });
});

describe("formatMYRCompact", () => {
  it("shortens a figure for a small space, keeping RM with it", () => {
    expect(formatMYRCompact(642043.26)).toBe("RM\u00A0642K");
    expect(formatMYRCompact(1507428.31)).toBe("RM\u00A01.5M");
    expect(formatMYRCompact(950)).toBe("RM\u00A0950");
    expect(formatMYRCompact(-12400)).toBe("-RM\u00A012K");
  });
});
