import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    permissionGrant: { findMany: (args: unknown) => findMany(args) },
  },
}));

class UnauthorizedErrorStub extends Error {}

const getSessionUser = vi.fn();
const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: UnauthorizedErrorStub,
  getSessionUser: () => getSessionUser(),
  requireUser: () => requireUser(),
}));

// React's cache() is request-scoped; outside a request it is identity. Making
// that explicit keeps each test's mock from leaking into the next.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

const load = () => import("@/lib/permissions/require");

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset();
  getSessionUser.mockReset();
  requireUser.mockReset();
});

describe("roleCan", () => {
  it("is true for a super admin without reading the table", async () => {
    // A table that denies everything. The short circuit is the lock-out
    // guarantee: no saved edit and no corrupt row may take the portal away
    // from its administrators.
    findMany.mockResolvedValue([]);
    const { roleCan } = await load();
    expect(await roleCan(Role.SUPER_ADMIN, "po.delete")).toBe(true);
    expect(await roleCan(Role.SUPER_ADMIN, "permission.manage")).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is false for a client even when the table grants it", async () => {
    findMany.mockResolvedValue([{ action: "po.view" }]);
    const { roleCan } = await load();
    expect(await roleCan(Role.CLIENT, "po.view")).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads the table for every other role", async () => {
    findMany.mockResolvedValue([{ action: "po.advance.order_placed" }]);
    const { roleCan } = await load();
    expect(await roleCan(Role.PRODUCTION_PLANNER, "po.advance.order_placed")).toBe(
      true,
    );
    expect(await roleCan(Role.PRODUCTION_PLANNER, "po.advance.qc_passed")).toBe(
      false,
    );
  });

  it("asks only for the viewer's own granted rows", async () => {
    findMany.mockResolvedValue([]);
    const { roleCan } = await load();
    await roleCan(Role.QC, "po.confirm");
    expect(findMany).toHaveBeenCalledWith({
      where: { role: Role.QC, granted: true },
      select: { action: true },
    });
  });

  it("denies a key with no row at all", async () => {
    findMany.mockResolvedValue([]);
    const { roleCan } = await load();
    expect(await roleCan(Role.WAREHOUSE, "po.confirm")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns the user when the grant is there", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.WAREHOUSE });
    findMany.mockResolvedValue([{ action: "po.advance.delivering" }]);
    const { requirePermission } = await load();
    await expect(requirePermission("po.advance.delivering")).resolves.toMatchObject(
      { id: "u1" },
    );
  });

  it("throws when it is not", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.WAREHOUSE });
    findMany.mockResolvedValue([]);
    const { requirePermission } = await load();
    await expect(requirePermission("po.confirm")).rejects.toThrow(
      "Your role can't confirm or decline an order.",
    );
  });

  it("carries the caller's own message when given one", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.QC });
    findMany.mockResolvedValue([]);
    const { requirePermission } = await load();
    await expect(
      requirePermission("po.advance.qc_passed", "Warehouse advances this stage."),
    ).rejects.toThrow("Warehouse advances this stage.");
  });

  it("lets a guest's refusal through untouched", async () => {
    requireUser.mockRejectedValue(new UnauthorizedErrorStub("You are not signed in."));
    const { requirePermission } = await load();
    await expect(requirePermission("po.view")).rejects.toThrow(
      "You are not signed in.",
    );
  });
});

describe("can", () => {
  it("is false for a guest", async () => {
    getSessionUser.mockResolvedValue(null);
    const { can } = await load();
    expect(await can("po.view")).toBe(false);
  });

  it("follows the viewer's role", async () => {
    getSessionUser.mockResolvedValue({ id: "u1", role: Role.MEMBER });
    findMany.mockResolvedValue([{ action: "po.view" }]);
    const { can } = await load();
    expect(await can("po.view")).toBe(true);
    expect(await can("po.edit")).toBe(false);
  });
});

describe("rolesWithPermission", () => {
  it("names the ops roles that hold a key, super admin always included", async () => {
    findMany.mockResolvedValue([{ role: Role.WAREHOUSE }]);
    const { rolesWithPermission } = await load();
    expect(await rolesWithPermission("po.advance.qc_passed")).toEqual([
      Role.SUPER_ADMIN,
      Role.WAREHOUSE,
    ]);
  });

  it("returns the super admin alone when nobody else holds it", async () => {
    findMany.mockResolvedValue([]);
    const { rolesWithPermission } = await load();
    expect(await rolesWithPermission("po.revert")).toEqual([Role.SUPER_ADMIN]);
  });
});

describe("requirePermissionResponse", () => {
  it("answers 403 for a signed-in user who may not", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.MEMBER });
    findMany.mockResolvedValue([]);
    const { requirePermissionResponse } = await load();
    const gate = await requirePermissionResponse("po.upload");
    expect("response" in gate && gate.response.status).toBe(403);
  });

  it("answers 401 for a guest", async () => {
    requireUser.mockRejectedValue(new UnauthorizedErrorStub("You are not signed in."));
    const { requirePermissionResponse } = await load();
    const gate = await requirePermissionResponse("po.upload");
    expect("response" in gate && gate.response.status).toBe(401);
  });

  it("hands the user back when allowed", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.QC });
    findMany.mockResolvedValue([{ action: "po.upload" }]);
    const { requirePermissionResponse } = await load();
    const gate = await requirePermissionResponse("po.upload");
    expect("user" in gate && gate.user.id).toBe("u1");
  });
});
