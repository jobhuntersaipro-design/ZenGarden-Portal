import { describe, expect, it } from "vitest";
import { parseBuyerOrderFilter } from "@/lib/buyer-order-filter";

describe("parseBuyerOrderFilter", () => {
  it("reads a chip the URL names", () => {
    expect(parseBuyerOrderFilter("delivered")).toBe("delivered");
    expect(parseBuyerOrderFilter("open")).toBe("open");
  });

  it("reads anything else as no filter", () => {
    expect(parseBuyerOrderFilter(undefined)).toBe("all");
    expect(parseBuyerOrderFilter("shipped")).toBe("all");
  });
});
