import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";

const upsert = vi.fn();
const auditCreate = vi.fn();
const tx = { permissionGrant: { upsert }, auditEvent: { create: auditCreate } };
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));

class UnauthorizedError extends Error {}
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError }));

const requirePermission = vi.fn();
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => requirePermission(key),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updatePermissions } = await import("@/actions/permissions");

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
  auditCreate.mockResolvedValue({});
  requirePermission.mockResolvedValue({ id: "admin1", role: Role.SUPER_ADMIN });
});

describe("updatePermissions", () => {
  it("asks for permission.manage", async () => {
    await updatePermissions([
      { role: Role.QC, action: "po.upload", granted: false },
    ]);
    expect(requirePermission).toHaveBeenCalledWith("permission.manage");
  });

  it("writes each change and exactly one audit row", async () => {
    const result = await updatePermissions([
      { role: Role.QC, action: "po.upload", granted: false },
      { role: Role.WAREHOUSE, action: "po.edit", granted: true },
    ]);
    expect(result).toEqual({ success: true, data: { changed: 2 } });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe("PERMISSIONS_CHANGED");
    expect(audit.actorId).toBe("admin1");
    // Keys and booleans only — the trail never carries a person's data.
    expect(audit.detail).toEqual({
      changes: [
        { role: Role.QC, action: "po.upload", granted: false },
        { role: Role.WAREHOUSE, action: "po.edit", granted: true },
      ],
    });
  });

  it("stamps who changed the cell", async () => {
    await updatePermissions([
      { role: Role.QC, action: "po.upload", granted: false },
    ]);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      role_action: { role: Role.QC, action: "po.upload" },
    });
    expect(call.update).toEqual({ granted: false, updatedById: "admin1" });
  });

  it("refuses a change to the super admin column", async () => {
    const result = await updatePermissions([
      { role: Role.SUPER_ADMIN, action: "po.delete", granted: false },
    ]);
    expect(result).toEqual({
      success: false,
      error: "A super admin's permissions can't be changed.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a locked administration row", async () => {
    const result = await updatePermissions([
      { role: Role.QC, action: "user.manage", granted: true },
    ]);
    expect(result).toEqual({
      success: false,
      error:
        "Manage users can't be changed. Everything under Admin is super admin only.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when one cell is illegal", async () => {
    const result = await updatePermissions([
      { role: Role.QC, action: "po.upload", granted: false },
      { role: Role.QC, action: "permission.manage", granted: true },
    ]);
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses an action key that is not in the registry", async () => {
    const result = await updatePermissions([
      { role: Role.QC, action: "po.edti" as never, granted: true },
    ]);
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a CLIENT, which has no column", async () => {
    const result = await updatePermissions([
      { role: Role.CLIENT as never, action: "po.view", granted: true },
    ]);
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a caller without permission.manage", async () => {
    requirePermission.mockRejectedValue(
      new UnauthorizedError("Your role can't manage permissions."),
    );
    const result = await updatePermissions([
      { role: Role.QC, action: "po.upload", granted: false },
    ]);
    expect(result).toEqual({
      success: false,
      error: "Your role can't manage permissions.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses an empty batch", async () => {
    const result = await updatePermissions([]);
    expect(result.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
