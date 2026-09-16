import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany },
  },
}));

const { productsOutsideFamily } = await import("@/lib/queries/product-families");

beforeEach(() => {
  vi.clearAllMocks();
  productFindMany.mockResolvedValue([]);
});

describe("productsOutsideFamily", () => {
  /**
   * Prisma's `NOT` drops NULL rows outright — it does not mean "anything
   * that fails to equal this value", it means "anything that positively
   * fails the comparison", and SQL's three-valued logic makes a NULL
   * comparison neither true nor false. `NOT: { familyId }` therefore omits
   * every product that is in *no* family at all, which on a catalogue
   * before its family backfill (production, today) is every row — exactly
   * the ones this picker exists to surface. The query has to ask for
   * "unplaced, or placed somewhere else" explicitly.
   */
  it("includes unplaced products, not only ones in a different family", async () => {
    await productsOutsideFamily("fam-1");

    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ familyId: null }, { familyId: { not: "fam-1" } }] },
      }),
    );
  });

  it("carries the candidate's current family name, and null for an unplaced one", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "prd-placed",
        sku: "ZEN-SC-1000-GM",
        name: "ZEN 1L — Goat's Milk",
        brand: "Zen Garden",
        variant: "Goat's Milk",
        market: null,
        family: { name: "Zen Garden Shower Cream 1L" },
      },
      {
        id: "prd-unplaced",
        sku: "ZEN-HW-0500-LV",
        name: "ZEN Hand Wash 500ml — Lavender",
        brand: "Zen Garden",
        variant: "Lavender",
        market: "Malaysia",
        family: null,
      },
    ]);

    const rows = await productsOutsideFamily("fam-1");

    expect(rows).toEqual([
      {
        id: "prd-placed",
        sku: "ZEN-SC-1000-GM",
        name: "ZEN 1L — Goat's Milk",
        brand: "Zen Garden",
        variant: "Goat's Milk",
        market: null,
        familyName: "Zen Garden Shower Cream 1L",
      },
      {
        id: "prd-unplaced",
        sku: "ZEN-HW-0500-LV",
        name: "ZEN Hand Wash 500ml — Lavender",
        brand: "Zen Garden",
        variant: "Lavender",
        market: "Malaysia",
        familyName: null,
      },
    ]);
  });
});
