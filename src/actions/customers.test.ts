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

  it("keeps the customer when the email fails — a Resend outage must not lose typing", async () => {
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

  it("rejects a bad input before touching the database", async () => {
    const result = await createCustomer({ company: { ...company, name: "" } });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
