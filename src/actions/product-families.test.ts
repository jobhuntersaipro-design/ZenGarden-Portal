import { beforeEach, describe, expect, it, vi } from "vitest";

const productUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { update: productUpdate },
  },
}));

class UnauthorizedError extends Error {}
const requireSuperAdmin = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireSuperAdmin: () => requireSuperAdmin(),
}));
const __permissionGuard = () => requireSuperAdmin();
// Phase 48: the actions ask the permission grid. It delegates to the guard
// mock above, so every test's existing setup still drives the refusal path.
const permissionKeys: string[] = [];
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => {
    permissionKeys.push(key);
    return __permissionGuard();
  },
  rolesWithPermission: () => Promise.resolve([]),
  unauthorizedStatus: () => 403,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { addProductToFamily, removeProductFromFamily } = await import(
  "@/actions/product-families"
);
const { Prisma } = await import("@/generated/prisma/client");

const admin = {
  id: "user-1",
  email: "chris@lovinghandsportal.com",
  name: "Chris Lam",
  image: null,
  role: "SUPER_ADMIN",
  mustChangePassword: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addProductToFamily", () => {
  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    productUpdate.mockResolvedValue({ id: "prd-1" });
  });

  it("stamps the family on the product", async () => {
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prd-1" },
      data: { familyId: "fam-1" },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: false, error: "This action needs super admin access." });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("says so when the product is gone", async () => {
    productUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("gone", { code: "P2025", clientVersion: "7" }),
    );
    const result = await addProductToFamily("prd-1", "fam-1");
    expect(result).toEqual({ success: false, error: "That product is gone." });
  });
});

describe("removeProductFromFamily", () => {
  beforeEach(() => {
    requireSuperAdmin.mockResolvedValue(admin);
    productUpdate.mockResolvedValue({ id: "prd-1" });
  });

  it("clears the family and leaves the product alone otherwise", async () => {
    const result = await removeProductFromFamily("prd-1");
    expect(result).toEqual({ success: true, data: undefined });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prd-1" },
      data: { familyId: null },
    });
  });

  it("refuses anyone who is not a super admin", async () => {
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    expect(await removeProductFromFamily("prd-1")).toEqual({
      success: false,
      error: "This action needs super admin access.",
    });
  });
});
