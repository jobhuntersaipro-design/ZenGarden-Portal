import { describe, expect, it } from "vitest";
import { parseShopQuery, shopQueryHref } from "@/lib/shop-filters";

describe("parseShopQuery", () => {
  it("parses comma-joined facets, a bounded page and a defaulted sort", () => {
    const q = parseShopQuery({ brand: "ZEN GARDEN,MR. KING", pack: "6,12,x", sort: "bogus", page: "0" });
    expect(q.brands).toEqual(["ZEN GARDEN", "MR. KING"]);
    expect(q.packSizes).toEqual([6, 12]);
    expect(q.sort).toBe("name");
    expect(q.page).toBe(1);
  });
});

describe("shopQueryHref", () => {
  it("resets the page when anything but the page changes", () => {
    const q = parseShopQuery({ page: "3", category: "Hair care" });
    expect(shopQueryHref(q, { brands: ["L.HANDS"] })).toBe("/products?category=Hair+care&brand=L.HANDS");
    expect(shopQueryHref(q, { page: 4 })).toBe("/products?category=Hair+care&page=4");
  });
});
