import { describe, expect, it } from "vitest";
import { shopAudience, shopVisible } from "@/lib/shop-market";

describe("shopAudience", () => {
  it("scopes a buyer that carries a market", () => {
    expect(shopAudience("Vietnam")).toEqual({ kind: "scoped", market: "Vietnam" });
  });

  it("is unassigned when nobody has set one", () => {
    expect(shopAudience(null)).toEqual({ kind: "unassigned" });
    expect(shopAudience(undefined)).toEqual({ kind: "unassigned" });
  });

  it("treats an empty or whitespace market as unassigned, not as a market", () => {
    // A buyer saved with "" would otherwise scope to products whose market is
    // "" — an empty shop with no explanation on screen.
    expect(shopAudience("")).toEqual({ kind: "unassigned" });
    expect(shopAudience("   ")).toEqual({ kind: "unassigned" });
  });

  it("trims, so a stray space cannot split one market into two", () => {
    expect(shopAudience(" Mydin ")).toEqual({ kind: "scoped", market: "Mydin" });
  });
});

describe("shopVisible", () => {
  it("carries the market alongside the three catalogue conditions", () => {
    expect(shopVisible("Vietnam")).toEqual({
      active: true,
      needsReview: false,
      listPrice: { gt: 0 },
      market: "Vietnam",
    });
  });

  it("never admits a product carrying no market", () => {
    // The user's rule (2026-09-23): an unmarketed product is one nobody has
    // finished setting up, not a general-catalogue product. A predicate
    // written as `OR [{ market }, { market: null }]` would pass every other
    // test in this file and leak the whole unmarketed catalogue to everyone.
    const where = shopVisible("Vietnam");
    expect(where.market).toBe("Vietnam");
    expect(where.OR).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain("null");
  });

  it("keeps the pre-existing catalogue conditions, so scoping only ever narrows", () => {
    const where = shopVisible("Mydin");
    expect(where.active).toBe(true);
    expect(where.needsReview).toBe(false);
    expect(where.listPrice).toEqual({ gt: 0 });
  });

  it("matches exactly — a different casing is a different market", () => {
    // Both sides come from the same CatalogLabel vocabulary, which already
    // refuses two spellings of one value. A `mode: "insensitive"` here would
    // only ever widen who can see a product.
    const where = shopVisible("Mydin") as Record<string, unknown>;
    expect(where.market).toBe("Mydin");
    expect(JSON.stringify(where)).not.toContain("insensitive");
  });
});
