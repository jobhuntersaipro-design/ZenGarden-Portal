import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const requireSuperAdmin = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { orgSettings: { upsert } } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSuperAdmin,
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
vi.mock("next/cache", () => ({ revalidatePath }));

const { updateSupplierDetails } = await import("@/actions/org-settings");

const patch = {
  supplierName: "Kim Brothers",
  supplierEmail: "no-reply@kim-brothers.com",
  supplierPhone: "+60 12-345 6789",
  supplierAddress: "12 Jalan Satu\nPuchong",
};

beforeEach(() => {
  vi.resetAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
  upsert.mockResolvedValue({});
});

describe("updateSupplierDetails", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    expect(await updateSupplierDetails(patch)).toEqual({
      success: false,
      error: "Super admin only.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the singleton and records who saved it", async () => {
    await updateSupplierDetails(patch);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: "singleton" });
    expect(args.create.id).toBe("singleton");
    expect(args.create.updatedById).toBe("admin-1");
    expect(args.update.updatedById).toBe("admin-1");
    expect(args.update.supplierEmail).toBe("no-reply@kim-brothers.com");
  });

  it("stores null rather than an empty string, so a cleared field falls back to env", async () => {
    await updateSupplierDetails({ ...patch, supplierPhone: "   " });
    expect(upsert.mock.calls[0][0].update.supplierPhone).toBeNull();
  });

  it("refuses a malformed email and writes nothing", async () => {
    const result = await updateSupplierDetails({ ...patch, supplierEmail: "nope" });
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("revalidates the storefront's real paths, not the browser-relative ones", async () => {
    await updateSupplierDetails(patch);
    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    // `/shop/...`, because revalidation keys on the resolved route rather than
    // the URL the browser asked for (src/lib/shop-routes.ts).
    expect(paths).toContain("/shop");
    expect(paths.every((path: string) => path.startsWith("/shop") || path === "/admin")).toBe(true);
  });
});
