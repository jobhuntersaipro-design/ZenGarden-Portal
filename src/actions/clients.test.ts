import { beforeEach, describe, expect, it, vi } from "vitest";

const userCreate = vi.fn();
const userUpdate = vi.fn();
const userFindUnique = vi.fn();
const buyerFindUnique = vi.fn();
const sendEmail = vi.fn();
const requireSuperAdmin = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: userCreate, update: userUpdate, findUnique: userFindUnique },
    buyer: { findUnique: buyerFindUnique },
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSuperAdmin,
}));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action calls the template as a function, so `react` is its rendered
// output rather than an element carrying the props. Mocked here so the
// arguments — which is what the assertion is about — stay reachable.
const templateArgs: { signInUrl: string; password: string; name: string }[] = [];
vi.mock("@/emails/TemporaryPassword", () => ({
  TemporaryPassword: (props: { signInUrl: string; password: string; name: string }) => {
    templateArgs.push(props);
    return null;
  },
  temporaryPasswordSubject: () => "Your temporary password",
}));

const { inviteBuyerContact, resendClientInvite, setClientAccess, updateBuyerContact } =
  await import("@/actions/clients");

beforeEach(() => {
  vi.resetAllMocks();
  templateArgs.length = 0;
  requireSuperAdmin.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
  buyerFindUnique.mockResolvedValue({ id: "buyer-1" });
  userCreate.mockResolvedValue({ id: "c1", name: "Siti", email: "siti@buyer.com" });
  userUpdate.mockResolvedValue({});
  sendEmail.mockResolvedValue({ sent: true });
});

const input = {
  buyerId: "buyer-1",
  name: "Siti",
  email: "siti@buyer.com",
  username: "Siti.Ops",
  phone: " +60 12-345 6789 ",
};

describe("inviteBuyerContact", () => {
  it("writes CLIENT *with* the buyer — the CHECK refuses one without", async () => {
    await inviteBuyerContact(input);
    const data = userCreate.mock.calls[0][0].data;
    expect(data.role).toBe("CLIENT");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.mustChangePassword).toBe(true);
  });

  it("never stores the password in the clear", async () => {
    await inviteBuyerContact(input);
    const data = userCreate.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("emails the shop, not the portal — a client sent to the portal is bounced out", async () => {
    await inviteBuyerContact(input);
    expect(templateArgs.at(-1)?.signInUrl).toBe("https://shop.example.com/signin");
  });

  it("emails the password that was hashed, not a different one", async () => {
    const { compare } = await import("bcryptjs");
    await inviteBuyerContact(input);
    const sent = templateArgs.at(-1)!.password;
    const stored = userCreate.mock.calls[0][0].data.passwordHash;
    expect(await compare(sent, stored)).toBe(true);
  });

  it("refuses a duplicate address in plain language", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    userCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["email"] },
      }),
    );
    const result = await inviteBuyerContact(input);
    expect(result).toEqual({
      success: false,
      error: "That email address is already in use.",
    });
  });

  it("refuses a buyer that is gone rather than creating an unlinked client", async () => {
    buyerFindUnique.mockResolvedValueOnce(null);
    const result = await inviteBuyerContact(input);
    expect(result.success).toBe(false);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not a super admin", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValueOnce(new UnauthorizedError("nope"));
    const result = await inviteBuyerContact(input);
    expect(result).toEqual({ success: false, error: "nope" });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("writes the handle lower-cased and the phone trimmed", async () => {
    await inviteBuyerContact(input);
    const data = userCreate.mock.calls[0][0].data;
    expect(data.username).toBe("siti.ops");
    expect(data.phone).toBe("+60 12-345 6789");
  });

  it("refuses a contact with no handle", async () => {
    const { username, ...rest } = input;
    const result = await inviteBuyerContact(rest as typeof input);
    expect(result.success).toBe(false);
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe("resendClientInvite", () => {
  it("bumps sessionVersion, so an invite that went astray leaves no session open", async () => {
    userFindUnique.mockResolvedValue({
      id: "c1", name: "Siti", email: "siti@buyer.com", role: "CLIENT", buyerId: "buyer-1",
    });
    await resendClientInvite("c1");
    expect(userUpdate.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    expect(userUpdate.mock.calls[0][0].data.mustChangePassword).toBe(true);
  });

  it("will not touch an ops user through the client path", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "MEMBER", buyerId: null });
    const result = await resendClientInvite("u1");
    expect(result.success).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("setClientAccess", () => {
  beforeEach(() => {
    userFindUnique.mockResolvedValue({ id: "c1", role: "CLIENT", buyerId: "buyer-1" });
  });

  it("revoking ends live sessions within the refresh interval", async () => {
    await setClientAccess("c1", false);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data.disabledAt).toBeInstanceOf(Date);
    expect(data.sessionVersion).toEqual({ increment: 1 });
  });

  it("restoring clears the flag and leaves sessionVersion alone", async () => {
    await setClientAccess("c1", true);
    const data = userUpdate.mock.calls[0][0].data;
    expect(data.disabledAt).toBeNull();
    expect(data).not.toHaveProperty("sessionVersion");
  });
});

describe("updateBuyerContact", () => {
  const patch = { name: "Siti Nur", username: "siti.nur", phone: null };

  beforeEach(() => {
    userFindUnique.mockResolvedValue({ id: "c1", role: "CLIENT", buyerId: "buyer-1" });
  });

  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    expect(await updateBuyerContact("c1", patch)).toEqual({
      success: false,
      error: "Super admin only.",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses a row that is not a client — an ops user is not editable here", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "MEMBER", buyerId: null });
    expect(await updateBuyerContact("u1", patch)).toEqual({
      success: false,
      error: "That contact is gone.",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("writes only name, username and phone — never the email or the role", async () => {
    await updateBuyerContact("c1", patch);
    const data = userUpdate.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["name", "phone", "username"]);
  });

  it("names a duplicate handle", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    userUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["username"] },
      }),
    );
    expect(await updateBuyerContact("c1", patch)).toEqual({
      success: false,
      error: "That username is taken.",
    });
  });
});
