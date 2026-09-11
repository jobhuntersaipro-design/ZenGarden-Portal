import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const buyerCreate = vi.fn();
const userCreate = vi.fn();
const sendEmail = vi.fn();
const requireSuperAdmin = vi.fn();

// The action runs both writes in one transaction, so the mock hands the
// callback a `tx` carrying the same two spies the assertions read.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ buyer: { create: buyerCreate }, user: { create: userCreate } }),
);

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transaction } }));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSuperAdmin,
}));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const templateArgs: { signInUrl: string; password: string; name: string }[] = [];
vi.mock("@/emails/TemporaryPassword", () => ({
  TemporaryPassword: (props: { signInUrl: string; password: string; name: string }) => {
    templateArgs.push(props);
    return null;
  },
  temporaryPasswordSubject: () => "Your temporary password",
}));

const { createCustomer } = await import("@/actions/customers");

const company = {
  name: "Acme Industrial Sdn Bhd",
  address: "12 Jalan Satu",
  paymentTerms: "30 days",
  remark: "Pays late. Chase on day 25.",
  contactName: "Raj",
  email: "accounts@acme.com",
  phone: "+60 3-1234 5678",
};
const contact = {
  name: "Siti",
  email: "siti@acme.com",
  username: "siti",
  phone: "+60 12-345 6789",
};

beforeEach(() => {
  vi.resetAllMocks();
  templateArgs.length = 0;
  requireSuperAdmin.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ buyer: { create: buyerCreate }, user: { create: userCreate } }),
  );
  buyerCreate.mockResolvedValue({ id: "buyer-1" });
  userCreate.mockResolvedValue({ id: "c1", name: "Siti", email: "siti@acme.com" });
  sendEmail.mockResolvedValue({ sent: true });
});

describe("createCustomer", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await createCustomer({ company });
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates the company alone when no login was asked for", async () => {
    const result = await createCustomer({ company });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "skipped" } });
    expect(userCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(buyerCreate.mock.calls[0][0].data.remark).toBe("Pays late. Chase on day 25.");
  });

  it("creates the contact as a CLIENT of that buyer, with the handle", async () => {
    await createCustomer({ company, contact });
    const data = userCreate.mock.calls[0][0].data;
    expect(data.role).toBe("CLIENT");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.username).toBe("siti");
    expect(data.phone).toBe("+60 12-345 6789");
    expect(data.mustChangePassword).toBe(true);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("emails the shop sign-in URL, and the password it actually hashed", async () => {
    const { compare } = await import("bcryptjs");
    await createCustomer({ company, contact });
    expect(templateArgs.at(-1)?.signInUrl).toBe("https://shop.example.com/signin");
    const sent = templateArgs.at(-1)!.password;
    expect(await compare(sent, userCreate.mock.calls[0][0].data.passwordHash)).toBe(true);
  });

  it("sends nothing when the invitation box was unchecked", async () => {
    const result = await createCustomer({ company, contact, sendInvite: false });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "skipped" } });
    expect(userCreate).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // sendEmail is documented "Never throws" (src/lib/email.ts) — it reports a
  // failed send as { sent: false }, not a rejection. This is the case that
  // actually happens (a Resend API error, an invalid recipient, the
  // placeholder-key case local runs hit) and the one that matters.
  it("keeps the customer when the email fails — a Resend outage must not lose typing", async () => {
    sendEmail.mockResolvedValue({ sent: false, error: "Domain not verified" });
    const result = await createCustomer({ company, contact });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "failed" } });
    expect(buyerCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
  });

  // sendEmail's own contract says it cannot reject, but sendInviteEmail's
  // try/catch is a backstop for if that promise is ever broken — this proves
  // the backstop itself, separately from the realistic case above.
  it("keeps the customer even if sendEmail broke its own contract and threw", async () => {
    sendEmail.mockRejectedValue(new Error("resend is down"));
    const result = await createCustomer({ company, contact });
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "failed" } });
    expect(buyerCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
  });

  it("sends the email only after the transaction has committed", async () => {
    const order: string[] = [];
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const value = await fn({ buyer: { create: buyerCreate }, user: { create: userCreate } });
      order.push("commit");
      return value;
    });
    sendEmail.mockImplementation(async () => {
      order.push("email");
      return { sent: true };
    });
    await createCustomer({ company, contact });
    expect(order).toEqual(["commit", "email"]);
  });

  it.each([
    [["username"], "That username is taken."],
    [["email"], "That email address is already in use."],
    [["name"], "Another customer already has that name."],
  ])("names the field behind a P2002 on %s", async (target, message) => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target },
      }),
    );
    expect(await createCustomer({ company, contact })).toEqual({ success: false, error: message });
  });

  it("reads a constraint name too, and username wins over the 'name' it contains", async () => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: "User_username_key" },
      }),
    );
    const result = await createCustomer({ company, contact });
    expect(result).toEqual({ success: false, error: "That username is taken." });
  });

  // Prisma 7's driver adapter does not emit the flat `{ target }` shape at
  // all — this is the actual, observed shape (2026-09-11) — so this proves
  // `createCustomer` reads a real P2002, not the hand-built mock above.
  it.each([
    [["username"], "That username is taken."],
    [["email"], "That email address is already in use."],
    [["name"], "Another customer already has that name."],
  ])("names the field behind the real driver-adapter P2002 shape on %s", async (fields, message) => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { driverAdapterError: { cause: { constraint: { fields } } } },
      }),
    );
    expect(await createCustomer({ company, contact })).toEqual({ success: false, error: message });
  });

  it("rejects a bad input before touching the database", async () => {
    const result = await createCustomer({ company: { ...company, name: "" } });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
