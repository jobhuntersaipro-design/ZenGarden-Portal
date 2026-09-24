import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCreate = vi.fn();
const userCount = vi.fn();
const tokenDeleteMany = vi.fn();
const tokenCreate = vi.fn();
const requestFindUnique = vi.fn();
const requestUpdate = vi.fn();
const sendEmail = vi.fn();

const tx = {
  user: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
  accessRequest: { update: requestUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
      create: userCreate,
      count: userCount,
    },
    accessRequest: { findUnique: requestFindUnique, update: requestUpdate },
    passwordResetToken: { deleteMany: tokenDeleteMany, create: tokenCreate },
    $transaction: (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (client: typeof tx) => unknown)(tx)
        : Promise.resolve([]),
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
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://portal.test" } }));

const { createUser, deleteUser, setPassword, updateUser, approveAccessRequest } =
  await import("@/actions/users");

const me = {
  id: "me",
  email: "chris@lovinghandsportal.com",
  name: "Chris Lam",
  image: null,
  role: "SUPER_ADMIN",
  mustChangePassword: false,
};

const base = {
  name: "Priya Menon",
  email: "priya@lovinghandsportal.com",
  role: "MEMBER" as const,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue(me);
  userUpdate.mockResolvedValue({});
  userCreate.mockResolvedValue({ id: "new", name: base.name, email: base.email });
  tokenDeleteMany.mockResolvedValue({ count: 0 });
  tokenCreate.mockResolvedValue({ id: "t1" });
  sendEmail.mockResolvedValue({ sent: true });
  // Another active super admin exists unless a test says otherwise.
  userCount.mockResolvedValue(1);
  userFindUnique.mockResolvedValue({
    role: "SUPER_ADMIN",
    disabledAt: null,
    email: base.email,
  });
});

describe("permissions", () => {
  const refused = { success: false, error: "This action needs super admin access." };

  beforeEach(() => {
    requireSuperAdmin.mockRejectedValue(
      new UnauthorizedError("This action needs super admin access."),
    );
  });

  it("refuses every user action to a non-super-admin", async () => {
    expect(await createUser(base)).toEqual(refused);
    expect(await updateUser("u1", base)).toEqual(refused);
    expect(await setPassword("u1", "Password12")).toEqual(refused);
    expect(await deleteUser("u1", base.email)).toEqual(refused);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe("updateUser — locking yourself out", () => {
  it("refuses to demote yourself", async () => {
    const result = await updateUser("me", { ...base, role: "MEMBER" });
    expect(result).toEqual({ success: false, error: "You can't demote yourself." });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to disable yourself", async () => {
    const result = await updateUser("me", {
      ...base,
      role: "SUPER_ADMIN",
      active: false,
    });
    expect(result).toEqual({ success: false, error: "You can't disable yourself." });
  });
});

describe("updateUser — the last super admin", () => {
  const lastAdminError = {
    success: false,
    error: "This is the last super admin. Promote someone else first.",
  };

  beforeEach(() => {
    // Nobody else is an active super admin.
    userCount.mockResolvedValue(0);
  });

  it("refuses to demote the last one", async () => {
    expect(await updateUser("other", { ...base, role: "MEMBER" })).toEqual(
      lastAdminError,
    );
  });

  // Phase 48: `demoting` is "the role moved away from SUPER_ADMIN", not "the
  // role became MEMBER", so the three new roles trip the same rule. Pinned
  // because a narrower check would have let a super admin demote themselves
  // to Warehouse and leave the portal unadministrable.
  it.each(["PRODUCTION_PLANNER", "QC", "WAREHOUSE"] as const)(
    "refuses to demote the last one to %s",
    async (role) => {
      expect(await updateUser("other", { ...base, role })).toEqual(
        lastAdminError,
      );
    },
  );

  it("refuses to disable the last one", async () => {
    expect(
      await updateUser("other", { ...base, role: "SUPER_ADMIN", active: false }),
    ).toEqual(lastAdminError);
  });

  it("allows demoting when another active super admin remains", async () => {
    userCount.mockResolvedValue(1);
    const result = await updateUser("other", { ...base, role: "MEMBER" });
    expect(result.success).toBe(true);
  });

  it("does not count a disabled super admin as cover", async () => {
    await updateUser("other", { ...base, role: "MEMBER" });
    // The guard must look for an *active* one.
    expect(userCount.mock.calls[0][0].where).toMatchObject({
      role: "SUPER_ADMIN",
      disabledAt: null,
    });
  });
});

describe("updateUser — sessions", () => {
  it("bumps sessionVersion when disabling, so the JWT refresh cuts them off", async () => {
    userFindUnique.mockResolvedValue({ role: "MEMBER", disabledAt: null });
    await updateUser("other", { ...base, active: false });
    expect(userUpdate.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
  });

  it("does not bump it for an ordinary edit", async () => {
    userFindUnique.mockResolvedValue({ role: "MEMBER", disabledAt: null });
    await updateUser("other", { ...base, name: "New name" });
    expect(userUpdate.mock.calls[0][0].data.sessionVersion).toBeUndefined();
  });
});

describe("setPassword", () => {
  it("ends every session and clears outstanding reset links", async () => {
    const result = await setPassword("other", "Password12");
    expect(result.success).toBe(true);
    // An unused reset link would be a second way in with a password the user
    // never chose.
    expect(tokenDeleteMany).toHaveBeenCalledWith({ where: { userId: "other" } });
  });

  it("refuses a password that fails the shared rules", async () => {
    expect((await setPassword("other", "short")).success).toBe(false);
  });

  // Without this, dropping the field would break nothing that is asserted:
  // the Security card on /settings is its only reader.
  it("records when the password was set", async () => {
    await setPassword("other", "Password12");
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordChangedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("createUser", () => {
  it("writes no password: the invitation carries a link to choose one", async () => {
    await createUser(base);
    const data = userCreate.mock.calls[0][0].data;
    expect(data).toEqual({ name: base.name, email: base.email, role: base.role });
  });

  it("emails an invitation with a week-long set-password link", async () => {
    const before = Date.now();
    const result = await createUser(base);
    expect(result).toEqual({
      success: true,
      data: { id: "new", invited: true, email: base.email },
    });
    const token = tokenCreate.mock.calls[0][0].data;
    expect(token.userId).toBe("new");
    expect(token.expiresAt.getTime() - before).toBeGreaterThan(6 * 24 * 60 * 60_000);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe(base.email);
  });

  it("says so when the invitation did not send, rather than reporting success", async () => {
    sendEmail.mockResolvedValue({ sent: false, error: "domain not verified" });
    const result = await createUser(base);
    expect(result).toEqual({
      success: true,
      data: { id: "new", invited: false, email: base.email },
    });
  });
});

describe("deleteUser", () => {
  it("refuses without an exact email match", async () => {
    // A near miss must not get through.
    expect(await deleteUser("other", "priya@lovinghands.m")).toEqual({
      success: false,
      error: "That email doesn't match.",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("accepts the email with different case and surrounding space", async () => {
    const result = await deleteUser("other", "  PRIYA@LovingHandsPortal.com ");
    expect(result.success).toBe(true);
  });

  it("refuses to delete yourself", async () => {
    expect(await deleteUser("me", base.email)).toEqual({
      success: false,
      error: "You can't delete yourself.",
    });
  });

  it("refuses to delete the last super admin", async () => {
    userCount.mockResolvedValue(0);
    const result = await deleteUser("other", base.email);
    expect(result.success).toBe(false);
  });

  it("soft deletes, keeping the row so attribution survives", async () => {
    await deleteUser("other", base.email);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data.name).toBe("Deleted user");
    expect(data.passwordHash).toBeNull();
    expect(data.disabledAt).toBeInstanceOf(Date);
    // The domain is what takes the row off the user list (listUsers).
    expect(data.email).toMatch(/^deleted\+[0-9a-f]{12}@lovinghandsportal\.invalid$/);
    expect(data.sessionVersion).toEqual({ increment: 1 });
  });
});

describe("approveAccessRequest", () => {
  beforeEach(() => {
    requestFindUnique.mockResolvedValue({
      email: "daniel.tan@gmail.com",
      name: "Daniel Tan",
      image: null,
      status: "PENDING",
    });
    userFindUnique.mockResolvedValue(null);
    requestUpdate.mockResolvedValue({});
  });

  it("creates the user, marks the request approved and emails them", async () => {
    const result = await approveAccessRequest("req-1", "MEMBER");
    expect(result.success).toBe(true);
    expect(userCreate).toHaveBeenCalledOnce();
    expect(requestUpdate.mock.calls[0][0].data).toMatchObject({
      status: "APPROVED",
      decidedById: "me",
    });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("does not create a second user when one already has that email", async () => {
    // Auto-approve, or a hand-created user, may have got there first.
    userFindUnique.mockResolvedValue({ id: "existing" });
    const result = await approveAccessRequest("req-1", "MEMBER");
    expect(result.success).toBe(true);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("refuses a request that was already decided", async () => {
    requestFindUnique.mockResolvedValue({
      email: "x@y.com",
      name: "X",
      image: null,
      status: "DECLINED",
    });
    expect(await approveAccessRequest("req-1", "MEMBER")).toEqual({
      success: false,
      error: "That request has already been decided.",
    });
  });
});
