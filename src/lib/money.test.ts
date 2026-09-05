import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { formatMYR, parseMYR, sumDecimals } from "@/lib/money";

describe("formatMYR", () => {
  it("always shows two decimals", () => {
    expect(formatMYR(5)).toBe("RM 5.00");
    expect(formatMYR("1234.5")).toBe("RM 1,234.50");
  });

  it("groups thousands", () => {
    expect(formatMYR(1_000_000)).toBe("RM 1,000,000.00");
    expect(formatMYR(999)).toBe("RM 999.00");
  });

  it("keeps the minus outside the RM", () => {
    expect(formatMYR(-1234.5)).toBe("-RM 1,234.50");
  });

  it("does not lose precision the way a float would", () => {
    expect(formatMYR(new Prisma.Decimal("0.1").plus("0.2"))).toBe("RM 0.30");
  });
});

describe("parseMYR", () => {
  it("round-trips what formatMYR produces", () => {
    expect(parseMYR(formatMYR("98765.43")).toString()).toBe("98765.43");
  });

  it("accepts the prefix, commas and stray space", () => {
    expect(parseMYR(" RM 1,234.50 ").toString()).toBe("1234.5");
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
