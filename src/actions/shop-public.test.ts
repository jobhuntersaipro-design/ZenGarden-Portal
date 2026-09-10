import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindMany = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findMany: productFindMany } },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

// Deliberately not mocking "@/lib/auth-guards": priceCart is a public action
// and must not import it at all. If shop-public.ts pulled it in, importing
// this module would drag in "@/lib/auth" (real NextAuth config, unmocked
// here) and this import would throw or hang rather than the module loading
// cleanly.
const { priceCart } = await import("@/actions/shop-public");
const { Prisma } = await import("@/generated/prisma/client");

const dec = (v: string) => new Prisma.Decimal(v);

const product = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  sku: "ZEN-SC-1000-GM-VN",
  name: "Zen Shower Cream 1L — Goat's Milk",
  brand: "ZEN GARDEN",
  variant: "Goat's Milk",
  packSize: 12,
  unit: "carton",
  listPrice: dec("189.00"),
  active: true,
  needsReview: false,
  images: [],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  presignGet.mockResolvedValue("https://r2.example/signed");
});

describe("priceCart", () => {
  it("returns EMPTY_CART for an empty line list, without querying the catalogue", async () => {
    const result = await priceCart([]);
    expect(result).toEqual({
      success: true,
      data: { id: null, lines: [], subtotal: "0.00", cartonCount: 0 },
    });
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("drops a line whose product id the catalogue does not hold", async () => {
    productFindMany.mockResolvedValue([product()]);
    const result = await priceCart([
      { productId: "p1", cartons: 2 },
      { productId: "gone", cartons: 1 },
    ]);
    if (!result.success) throw new Error("expected success");
    expect(result.data.lines).toHaveLength(1);
    expect(result.data.lines[0].productId).toBe("p1");
  });

  it("marks a needsReview product unavailable and excludes it from the subtotal", async () => {
    productFindMany.mockResolvedValue([
      product({ id: "p1", needsReview: true }),
      product({ id: "p2", sku: "P2" }),
    ]);
    const result = await priceCart([
      { productId: "p1", cartons: 1 },
      { productId: "p2", cartons: 1 },
    ]);
    if (!result.success) throw new Error("expected success");
    const bySku = Object.fromEntries(
      result.data.lines.map((line) => [line.sku, line.unavailable]),
    );
    expect(bySku["ZEN-SC-1000-GM-VN"]).toBe(true);
    expect(bySku.P2).toBe(false);
    expect(result.data.subtotal).toBe("189.00");
  });

  it("refuses more than 100 lines with an error, and does not query the catalogue", async () => {
    const lines = Array.from({ length: 101 }, (_, i) => ({ productId: `p${i}`, cartons: 1 }));
    const result = await priceCart(lines);
    expect(result.success).toBe(false);
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("returns a typed error, rather than a rejected promise, when the query fails", async () => {
    productFindMany.mockRejectedValue(new Error("connection reset"));
    const result = await priceCart([{ productId: "p1", cartons: 1 }]);
    expect(result).toEqual({ success: false, error: "We couldn't price your cart." });
  });
});
