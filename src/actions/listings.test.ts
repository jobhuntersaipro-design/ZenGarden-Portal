import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { product: { findMany: productFindMany } } }));

class UnauthorizedError extends Error {}
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireSuperAdmin: () => requireSuperAdmin(),
}));

const { lookupListing } = await import("@/actions/listings");

const entering = {
  brand: "Zen Garden",
  name: "Zen Garden Shower Cream 2.1L",
  variant: "Carrot",
  market: "Indonesia",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "user-1", role: "SUPER_ADMIN" });
});

describe("lookupListing", () => {
  it("reports the family a matching product carries", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "a",
        brand: "Zen Garden",
        name: "Zen Garden Shower Cream 2.1L",
        variant: "Goat's Milk",
        market: "Indonesia",
        familyId: "fam-1",
        family: { name: "Zen Garden Shower Cream 2.1L" },
      },
    ]);

    const result = await lookupListing(entering);

    expect(result).toEqual({
      success: true,
      data: { kind: "family", familyId: "fam-1", familyName: "Zen Garden Shower Cream 2.1L", members: 1 },
    });
  });

  it("narrows the read to the brand and the market", async () => {
    productFindMany.mockResolvedValue([]);
    await lookupListing(entering);
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { brand: "Zen Garden", market: "Indonesia" } }),
    );
  });

  it("says new when nothing matches", async () => {
    productFindMany.mockResolvedValue([]);
    await expect(lookupListing(entering)).resolves.toEqual({
      success: true,
      data: { kind: "new" },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    const result = await lookupListing(entering);
    expect(result).toEqual({ success: false, error: "This action needs super admin access." });
    expect(productFindMany).not.toHaveBeenCalled();
  });
});
