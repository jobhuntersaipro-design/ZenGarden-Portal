import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Role } from "@/generated/prisma/enums";

// Not imported from `@/lib/password-reset`: that module imports `@/lib/prisma`,
// and a static import would run the prisma mock factory before the spies it
// closes over exist.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const userFindUnique = vi.fn();
const tokenCreate = vi.fn();
const auditCreate = vi.fn();
const sendEmail = vi.fn();
const requireSuperAdmin = vi.fn();
const revalidatePath = vi.fn();

const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    passwordResetToken: { create: tokenCreate },
    auditEvent: { create: auditCreate },
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: transaction, user: { findUnique: userFindUnique } },
}));
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
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const templateArgs: { name: string; resetUrl: string }[] = [];
vi.mock("@/emails/PasswordReset", () => ({
  PasswordReset: (props: { name: string; resetUrl: string }) => {
    templateArgs.push(props);
    return null;
  },
  passwordResetSubject: () => "Reset your password",
}));

const { sendPasswordResetLink } = await import("@/actions/reset-links");

const client = {
  id: "c1",
  name: "Siti",
  email: "siti@acme.com",
  role: Role.CLIENT,
  buyerId: "buyer-1",
  passwordHash: "$2a$12$hash",
  disabledAt: null,
};
const member = {
  ...client,
  id: "u1",
  name: "Aisha",
  email: "aisha@lovinghandsportal.com",
  role: Role.MEMBER,
  buyerId: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  templateArgs.length = 0;
  requireSuperAdmin.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      passwordResetToken: { create: tokenCreate },
      auditEvent: { create: auditCreate },
    }),
  );
  userFindUnique.mockResolvedValue(client);
  tokenCreate.mockResolvedValue({ id: "t1" });
  auditCreate.mockResolvedValue({ id: "evt-1" });
  sendEmail.mockResolvedValue({ sent: true });
});

describe("sendPasswordResetLink", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("This action needs super admin access."));
    const result = await sendPasswordResetLink("c1");
    expect(result).toEqual({ success: false, error: "This action needs super admin access." });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("refuses an empty id before touching the database", async () => {
    const result = await sendPasswordResetLink("");
    expect(result).toEqual({ success: false, error: "That account is gone." });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("refuses a Google-only user and says why", async () => {
    userFindUnique.mockResolvedValue({ ...member, passwordHash: null });
    const result = await sendPasswordResetLink("u1");
    expect(result).toEqual({
      success: false,
      error: "They sign in with Google, so there is no password to reset.",
    });
    expect(tokenCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a disabled account", async () => {
    userFindUnique.mockResolvedValue({ ...client, disabledAt: new Date() });
    const result = await sendPasswordResetLink("c1");
    expect(result).toEqual({ success: false, error: "Restore their access first." });
    expect(tokenCreate).not.toHaveBeenCalled();
  });

  it("points a buyer contact at the shop host", async () => {
    await sendPasswordResetLink("c1");
    expect(templateArgs[0]?.resetUrl).toMatch(/^https:\/\/shop\.example\.com\/reset-password\/.+/);
  });

  it("points a member at the portal", async () => {
    userFindUnique.mockResolvedValue(member);
    await sendPasswordResetLink("u1");
    expect(templateArgs[0]?.resetUrl).toMatch(/^https:\/\/www\.example\.com\/reset-password\/.+/);
  });

  it("stores only the hash of the token it emailed, with the 30-minute expiry", async () => {
    const before = Date.now();
    await sendPasswordResetLink("c1");
    const token = templateArgs[0]!.resetUrl.split("/reset-password/")[1]!;
    const data = tokenCreate.mock.calls[0]![0].data;
    expect(data.userId).toBe("c1");
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toContain(token);
    const ttl = data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(30 * 60_000 - 50);
    expect(ttl).toBeLessThanOrEqual(30 * 60_000 + 5_000);
  });

  it("reports a failed send honestly, and keeps the token", async () => {
    sendEmail.mockResolvedValue({ sent: false });
    const result = await sendPasswordResetLink("c1");
    expect(result).toEqual({ success: true, data: { sent: false, email: "siti@acme.com" } });
    expect(tokenCreate).toHaveBeenCalledTimes(1);
  });

  it("records RESET_LINK_SENT against the buyer and the contact, inside the transaction, with no token", async () => {
    await sendPasswordResetLink("c1");
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      action: "RESET_LINK_SENT",
      actorId: "admin",
      buyerId: "buyer-1",
      subjectUserId: "c1",
      detail: { name: "Siti" },
    });
    const token = templateArgs[0]!.resetUrl.split("/reset-password/")[1]!;
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("records a member's link with no buyer", async () => {
    userFindUnique.mockResolvedValue(member);
    await sendPasswordResetLink("u1");
    expect(auditCreate.mock.calls[0]![0].data).toMatchObject({ buyerId: null, subjectUserId: "u1" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the buyer's pages so the timeline shows the send", async () => {
    await sendPasswordResetLink("c1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/buyers/buyer-1");
    expect(revalidatePath).toHaveBeenCalledWith("/buyers/buyer-1");
  });

  it("does not send when the transaction failed", async () => {
    transaction.mockRejectedValue(new Error("neon down"));
    const result = await sendPasswordResetLink("c1");
    expect(result).toEqual({ success: false, error: "We couldn't send that link." });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
