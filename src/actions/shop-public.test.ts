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
const { EMPTY_CART } = await import("@/lib/queries/cart");

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
  /**
   * Closed on 2026-09-23. The shop requires a sign-in since the catalogue
   * became market-scoped, so there is no guest cart to price — and this
   * action looked products up by id, outside any catalogue filter, so left
   * answering it would have let an unauthenticated caller read back a
   * product's name, brand, variant, market and pack size. These tests pin
   * the closure rather than the pricing it used to do.
   */
  it("returns EMPTY_CART however many lines it is handed", async () => {
    const result = await priceCart([
      { productId: "p1", cartons: 2 },
      { productId: "p2", cartons: 1 },
    ]);
    // Against the exported constant, not a hand-built copy of its shape:
    // a field added to `Cart` should not fail this test for the wrong reason.
    expect(result).toEqual({ success: true, data: EMPTY_CART });
  });

  it("returns EMPTY_CART for an empty line list too", async () => {
    expect(await priceCart([])).toEqual({ success: true, data: EMPTY_CART });
  });

  it("never reads the catalogue, whatever ids it is given", async () => {
    // The assertion that matters: a signed-out caller cannot turn a guessed
    // product id into a name, a market or a pack size. If this action is
    // ever reopened, it has to be reopened deliberately and this test has to
    // be rewritten with it.
    await priceCart([
      { productId: "p1", cartons: 1 },
      { productId: "definitely-not-a-product", cartons: 1 },
    ]);
    expect(productFindMany).not.toHaveBeenCalled();
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("leaks nothing about a product a caller names", async () => {
    // Even with the catalogue mocked to return a real row, nothing of it
    // reaches the response — the action never asks.
    productFindMany.mockResolvedValue([product()]);
    const result = await priceCart([{ productId: "p1", cartons: 2 }]);
    if (!result.success) throw new Error("expected success");
    expect(result.data.lines).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("ZEN-SC-1000-GM-VN");
    expect(JSON.stringify(result)).not.toContain("189.00");
  });
});
