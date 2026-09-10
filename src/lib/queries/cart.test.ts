import { beforeEach, describe, expect, it, vi } from "vitest";

const webOrderFindFirst = vi.fn();
const presignGet = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { webOrder: { findFirst: webOrderFindFirst } },
}));
vi.mock("@/lib/r2", () => ({ presignGet }));

const { priceProductLines, cartSummary } = await import("@/lib/queries/cart");
const { Prisma } = await import("@/generated/prisma/client");

const dec = (v: string) => new Prisma.Decimal(v);

const product = (over: Partial<Record<string, unknown>> = {}) => ({
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

describe("priceProductLines", () => {
  it("prices each line through lineTotal", async () => {
    const { lines } = await priceProductLines([
      { productId: "p1", cartons: 3, product: product() },
    ]);
    expect(lines[0].unitPrice).toBe("189.00");
    expect(lines[0].amount).toBe("567.00");
  });

  it("marks a line unavailable when the product is inactive, needs review or has no price", async () => {
    const { lines } = await priceProductLines([
      { productId: "p1", cartons: 1, product: product({ active: false }) },
      { productId: "p2", cartons: 1, product: product({ sku: "P2", needsReview: true }) },
      { productId: "p3", cartons: 1, product: product({ sku: "P3", listPrice: dec("0.00") }) },
      { productId: "p4", cartons: 1, product: product({ sku: "P4" }) },
    ]);
    const bySku = Object.fromEntries(lines.map((l) => [l.sku, l.unavailable]));
    expect(bySku["ZEN-SC-1000-GM-VN"]).toBe(true);
    expect(bySku.P2).toBe(true);
    expect(bySku.P3).toBe(true);
    expect(bySku.P4).toBe(false);
  });

  it("excludes unavailable lines from the subtotal", async () => {
    const { subtotal } = await priceProductLines([
      { productId: "p1", cartons: 1, product: product({ sku: "AVAILABLE" }) },
      { productId: "p2", cartons: 5, product: product({ sku: "GONE", active: false }) },
    ]);
    expect(subtotal).toBe("189.00");
  });

  it("counts cartons across every line, available or not", async () => {
    const { cartonCount } = await priceProductLines([
      { productId: "p1", cartons: 3, product: product({ sku: "A" }) },
      { productId: "p2", cartons: 2, product: product({ sku: "B", active: false }) },
    ]);
    expect(cartonCount).toBe(5);
  });

  it("sorts by name then sku", async () => {
    const { lines } = await priceProductLines([
      { productId: "p1", cartons: 1, product: product({ sku: "Z", name: "Zebra Wash" }) },
      { productId: "p2", cartons: 1, product: product({ sku: "A", name: "Aloe Wash" }) },
      { productId: "p3", cartons: 1, product: product({ sku: "B", name: "Aloe Wash" }) },
    ]);
    expect(lines.map((l) => l.sku)).toEqual(["A", "B", "Z"]);
  });
});

describe("priceProductLines — thumbnail presigning", () => {
  it("presigns the thumbnail, preferring thumbKey over r2Key", async () => {
    presignGet.mockResolvedValue("https://r2.example/thumb.webp");
    const { lines } = await priceProductLines([
      {
        productId: "p1",
        cartons: 1,
        product: product({
          images: [{ thumbKey: "products/p1/thumb.webp", r2Key: "products/p1/original.jpg" }],
        }),
      },
    ]);
    expect(presignGet).toHaveBeenCalledWith("products/p1/thumb.webp");
    expect(lines[0].imageUrl).toBe("https://r2.example/thumb.webp");
  });

  it("falls back to r2Key when the product has no thumbnail", async () => {
    presignGet.mockResolvedValue("https://r2.example/original.jpg");
    const { lines } = await priceProductLines([
      {
        productId: "p1",
        cartons: 1,
        product: product({ images: [{ thumbKey: null, r2Key: "products/p1/original.jpg" }] }),
      },
    ]);
    expect(presignGet).toHaveBeenCalledWith("products/p1/original.jpg");
    expect(lines[0].imageUrl).toBe("https://r2.example/original.jpg");
  });

  it("leaves imageUrl null, without failing the line, when presigning throws", async () => {
    presignGet.mockRejectedValue(new Error("R2 unreachable"));
    const { lines } = await priceProductLines([
      { productId: "p1", cartons: 1, product: product({ images: [{ thumbKey: "t", r2Key: "r" }] }) },
    ]);
    expect(lines[0].imageUrl).toBeNull();
    expect(lines[0].amount).toBe("189.00");
  });

  it("leaves imageUrl null when the product has no images at all", async () => {
    const { lines } = await priceProductLines([
      { productId: "p1", cartons: 1, product: product() },
    ]);
    expect(lines[0].imageUrl).toBeNull();
    expect(presignGet).not.toHaveBeenCalled();
  });
});

describe("cartSummary", () => {
  it("returns count, cartonCount, subtotal and the id/carton pairs", async () => {
    webOrderFindFirst.mockResolvedValue({
      lines: [
        { productId: "p1", cartons: 3, product: product({ sku: "A" }) },
        { productId: "p2", cartons: 2, product: product({ sku: "B", active: false }) },
      ],
    });
    const summary = await cartSummary("user-1");
    expect(summary.count).toBe(2);
    expect(summary.cartonCount).toBe(5);
    expect(summary.subtotal).toBe("567.00");
    expect(summary.lines).toEqual([
      { productId: "p1", cartons: 3 },
      { productId: "p2", cartons: 2 },
    ]);
  });

  it("returns an empty summary when the client has no draft order", async () => {
    webOrderFindFirst.mockResolvedValue(null);
    const summary = await cartSummary("user-1");
    expect(summary).toEqual({ count: 0, cartonCount: 0, subtotal: "0.00", lines: [] });
  });
});
