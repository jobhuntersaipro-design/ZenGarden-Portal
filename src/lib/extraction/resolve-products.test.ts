import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const createManyAndReturn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findMany, createManyAndReturn } },
}));

const { suggestProducts, createProductsForLines } = await import(
  "@/lib/extraction/resolve-products"
);

// createProductsForLines writes through the confirm transaction, never through
// the module-level client — which is what lets the suggest tests below prove
// that reading creates nothing.
const txFindMany = vi.fn();
const txCreateManyAndReturn = vi.fn();
const tx = {
  product: { findMany: txFindMany, createManyAndReturn: txCreateManyAndReturn },
} as unknown as Parameters<typeof createProductsForLines>[0];

const line = (
  over: Partial<{
    description: string;
    sku: string | null;
    unit: string | null;
    unitPrice: string;
  }> = {},
) => ({
  description: "Bamboo garden screen 1.8m",
  sku: "SCR-BAM-180" as string | null,
  unit: "panel" as string | null,
  unitPrice: "202.48",
  ...over,
});

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: `clear` empties the call history but
  // leaves the mockResolvedValueOnce queue intact, so an `once` a test never
  // consumed leaks into the next one and fails it for the wrong reason.
  vi.resetAllMocks();
  findMany.mockResolvedValue([]);
  createManyAndReturn.mockResolvedValue([]);
  txFindMany.mockResolvedValue([]);
  txCreateManyAndReturn.mockResolvedValue([]);
});

describe("suggestProducts", () => {
  it("returns the product for an exact code", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await suggestProducts([line()])).toEqual(["p1"]);
  });

  it("matches case-insensitively", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await suggestProducts([line({ sku: "scr-bam-180" })])).toEqual(["p1"]);
  });

  it("trims a padded code rather than missing the product", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await suggestProducts([line({ sku: "  SCR-BAM-180 " })])).toEqual(["p1"]);
  });

  it("returns null for a code the catalogue has never seen", async () => {
    expect(await suggestProducts([line({ sku: "NOT-A-CODE" })])).toEqual([null]);
  });

  it("returns null for a line with no code", async () => {
    expect(await suggestProducts([line({ sku: null })])).toEqual([null]);
  });

  it("never matches on description alone", async () => {
    // A product with this exact name exists, but the line carries no code.
    findMany.mockResolvedValueOnce([
      { id: "byname", sku: "OTHER", name: "Bamboo garden screen 1.8m" },
    ]);
    expect(await suggestProducts([line({ sku: null })])).toEqual([null]);
  });

  it("creates nothing — a discarded draft must leave no products behind", async () => {
    await suggestProducts([line({ sku: "NOT-A-CODE" })]);
    expect(createManyAndReturn).not.toHaveBeenCalled();
    expect(txCreateManyAndReturn).not.toHaveBeenCalled();
  });

  it("issues one query for a twenty-line document", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ sku: `C-${i}` }));
    await suggestProducts(lines);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("returns all nulls for an empty document without querying", async () => {
    expect(await suggestProducts([])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("createProductsForLines", () => {
  it("creates a product for a new code, marked for review", async () => {
    txCreateManyAndReturn.mockResolvedValueOnce([
      { id: "new1", sku: "SCR-BAM-200" },
    ]);
    const result = await createProductsForLines(tx, [
      line({
        sku: "SCR-BAM-200",
        description: "Bamboo screen 2.0m",
        unitPrice: "240.00",
      }),
    ]);
    expect(result).toEqual(["new1"]);
    expect(txCreateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            sku: "SCR-BAM-200",
            name: "Bamboo screen 2.0m",
            unit: "panel",
            listPrice: "240.00",
            category: "Uncategorised",
            needsReview: true,
            active: true,
          }),
        ],
      }),
    );
  });

  it("creates exactly one product when two lines carry the same new code", async () => {
    txCreateManyAndReturn.mockResolvedValueOnce([{ id: "new1", sku: "NEW-1" }]);
    const result = await createProductsForLines(tx, [
      line({ sku: "NEW-1" }),
      line({ sku: "new-1" }),
    ]);
    expect(txCreateManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
    expect(result).toEqual(["new1", "new1"]);
  });

  it("leaves a line with no code unmatched and never invents one", async () => {
    expect(await createProductsForLines(tx, [line({ sku: null })])).toEqual([null]);
    expect(txCreateManyAndReturn).not.toHaveBeenCalled();
  });

  it("re-reads a code another confirm won the race to create", async () => {
    txCreateManyAndReturn.mockResolvedValueOnce([]); // skipDuplicates swallowed it
    txFindMany.mockResolvedValueOnce([{ id: "raced", sku: "NEW-1" }]);
    expect(await createProductsForLines(tx, [line({ sku: "NEW-1" })])).toEqual([
      "raced",
    ]);
  });

  it("falls back to a unit when the line has none", async () => {
    txCreateManyAndReturn.mockResolvedValueOnce([{ id: "n", sku: "NEW-1" }]);
    await createProductsForLines(tx, [line({ sku: "NEW-1", unit: null })]);
    expect(txCreateManyAndReturn.mock.calls[0][0].data[0].unit).toBe("unit");
  });

  it("issues a bounded number of queries for a twenty-line document", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ sku: `C-${i}` }));
    await createProductsForLines(tx, lines);
    // one write and at most one re-read — never one query per line
    expect(
      txFindMany.mock.calls.length + txCreateManyAndReturn.mock.calls.length,
    ).toBeLessThanOrEqual(2);
  });

  it("returns all nulls for an empty document", async () => {
    expect(await createProductsForLines(tx, [])).toEqual([]);
    expect(txCreateManyAndReturn).not.toHaveBeenCalled();
  });
});
