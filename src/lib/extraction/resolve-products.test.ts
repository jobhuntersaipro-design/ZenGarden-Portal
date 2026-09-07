import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const createManyAndReturn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findMany, createManyAndReturn } },
}));

const { resolveProducts } = await import("@/lib/extraction/resolve-products");

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
});

describe("resolveProducts", () => {
  it("links a line whose code already exists", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await resolveProducts([line()])).toEqual(["p1"]);
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it("matches a code case-insensitively", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await resolveProducts([line({ sku: "scr-bam-180" })])).toEqual(["p1"]);
  });

  it("creates a product for an unknown code, marked for review", async () => {
    findMany.mockResolvedValueOnce([]);
    createManyAndReturn.mockResolvedValueOnce([{ id: "new1", sku: "SCR-BAM-200" }]);
    const result = await resolveProducts([
      line({
        sku: "SCR-BAM-200",
        description: "Bamboo screen 2.0m",
        unitPrice: "240.00",
      }),
    ]);
    expect(result).toEqual(["new1"]);
    expect(createManyAndReturn).toHaveBeenCalledWith(
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
    findMany.mockResolvedValueOnce([]);
    createManyAndReturn.mockResolvedValueOnce([{ id: "new1", sku: "NEW-1" }]);
    const result = await resolveProducts([
      line({ sku: "NEW-1" }),
      line({ sku: "new-1" }),
    ]);
    expect(createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
    expect(result).toEqual(["new1", "new1"]);
  });

  it("leaves a line with no code unmatched and never invents one", async () => {
    expect(await resolveProducts([line({ sku: null })])).toEqual([null]);
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it("never matches on description alone", async () => {
    // A product with this exact name exists, but the line carries no code.
    findMany.mockResolvedValueOnce([
      { id: "byname", sku: "OTHER", name: "Bamboo garden screen 1.8m" },
    ]);
    expect(await resolveProducts([line({ sku: null })])).toEqual([null]);
  });

  it("re-reads a code another upload won the race to create", async () => {
    findMany.mockResolvedValueOnce([]); // nothing exists yet
    createManyAndReturn.mockResolvedValueOnce([]); // skipDuplicates swallowed it
    findMany.mockResolvedValueOnce([{ id: "raced", sku: "NEW-1" }]);
    expect(await resolveProducts([line({ sku: "NEW-1" })])).toEqual(["raced"]);
  });

  it("falls back to a unit when the line has none", async () => {
    findMany.mockResolvedValueOnce([]);
    createManyAndReturn.mockResolvedValueOnce([{ id: "n", sku: "NEW-1" }]);
    await resolveProducts([line({ sku: "NEW-1", unit: null })]);
    expect(createManyAndReturn.mock.calls[0][0].data[0].unit).toBe("unit");
  });

  it("trims a padded code rather than creating a second product", async () => {
    findMany.mockResolvedValueOnce([{ id: "p1", sku: "SCR-BAM-180" }]);
    expect(await resolveProducts([line({ sku: "  SCR-BAM-180 " })])).toEqual(["p1"]);
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it("issues a bounded number of queries for a twenty-line document", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ sku: `C-${i}` }));
    await resolveProducts(lines);
    // one read, one write, one re-read — never one per line
    expect(
      findMany.mock.calls.length + createManyAndReturn.mock.calls.length,
    ).toBeLessThanOrEqual(3);
  });

  it("returns all nulls for an empty document", async () => {
    expect(await resolveProducts([])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
