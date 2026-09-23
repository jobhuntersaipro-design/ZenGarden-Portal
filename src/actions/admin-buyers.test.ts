import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { Role, WebOrderStatus } from "@/generated/prisma/enums";

const buyerCreate = vi.fn();
const buyerFindUnique = vi.fn();
const buyerDelete = vi.fn();
const userCreate = vi.fn();
const userFindMany = vi.fn();
const userDeleteMany = vi.fn();
const webOrderDeleteMany = vi.fn();
const auditCreate = vi.fn();
const sendEmail = vi.fn();
const requireSuperAdmin = vi.fn();

// The action runs both writes in one transaction, so the mock hands the
// callback a `tx` carrying the same two spies the assertions read.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    buyer: { create: buyerCreate, delete: buyerDelete },
    user: { create: userCreate, findMany: userFindMany, deleteMany: userDeleteMany },
    webOrder: { deleteMany: webOrderDeleteMany },
    auditEvent: { create: auditCreate },
  }),
);

// `deleteBuyer` reads the row and its counts *before* opening the
// transaction, so `buyer.findUnique` sits on the module-level mock rather
// than inside the transaction callback above.
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: transaction, buyer: { findUnique: buyerFindUnique } },
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const templateArgs: { signInUrl: string; password: string; name: string }[] = [];
vi.mock("@/emails/TemporaryPassword", () => ({
  TemporaryPassword: (props: { signInUrl: string; password: string; name: string }) => {
    templateArgs.push(props);
    return null;
  },
  temporaryPasswordSubject: () => "Your temporary password",
}));

const { createBuyer, deleteBuyer } = await import("@/actions/admin-buyers");

const contact = { name: "Siti", email: "Siti@Acme.com", phone: "+60 12-345 6789" };
const input = {
  name: "Acme Industrial Sdn Bhd",
  contact,
  address: "12 Jalan Satu",
  paymentTerms: "30",
  remark: "Pays late. Chase on day 25.",
};

beforeEach(() => {
  vi.resetAllMocks();
  templateArgs.length = 0;
  requireSuperAdmin.mockResolvedValue({ id: "admin", role: "SUPER_ADMIN" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      buyer: { create: buyerCreate, delete: buyerDelete },
      user: { create: userCreate, findMany: userFindMany, deleteMany: userDeleteMany },
      webOrder: { deleteMany: webOrderDeleteMany },
      auditEvent: { create: auditCreate },
    }),
  );
  buyerCreate.mockResolvedValue({ id: "buyer-1" });
  userFindMany.mockResolvedValue([]);
  userCreate.mockResolvedValue({ id: "c1", name: "Siti", email: "siti@acme.com" });
  auditCreate.mockResolvedValue({ id: "evt-1" });
  sendEmail.mockResolvedValue({ sent: true });
});

describe("createBuyer", () => {
  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await createBuyer(input);
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("writes the company with the point of contact as its contact details", async () => {
    await createBuyer(input);
    const data = buyerCreate.mock.calls[0][0].data;
    expect(data).toEqual({
      name: "Acme Industrial Sdn Bhd",
      address: "12 Jalan Satu",
      paymentTerms: "30 days",
      remark: "Pays late. Chase on day 25.",
      contactName: "Siti",
      email: "siti@acme.com",
      phone: "+60 12-345 6789",
      market: null,
    });
  });

  it("stores the market the form chose, which is what scopes their shop", async () => {
    await createBuyer({ ...input, market: "Vietnam" });
    expect(buyerCreate.mock.calls[0][0].data.market).toBe("Vietnam");
  });

  it("stores no market rather than a blank one, so the shop fails closed", async () => {
    // `optionalText` trims to null. A stored "" would scope the shop to
    // products whose market is "" — an empty shop with no explanation — where
    // null is the state every surface already words as "not set".
    await createBuyer({ ...input, market: "   " });
    expect(buyerCreate.mock.calls[0][0].data.market).toBeNull();
  });

  it("writes null for the folded fields when the disclosure was never opened", async () => {
    await createBuyer({ name: input.name, contact });
    const data = buyerCreate.mock.calls[0][0].data;
    expect(data.address).toBeNull();
    expect(data.paymentTerms).toBeNull();
    expect(data.remark).toBeNull();
    expect(data.market).toBeNull();
  });

  it("always creates the contact as a CLIENT of that buyer, with a handle from their email", async () => {
    await createBuyer(input);
    const data = userCreate.mock.calls[0][0].data;
    expect(data.role).toBe("CLIENT");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.email).toBe("siti@acme.com");
    expect(data.username).toBe("siti");
    expect(data.phone).toBe("+60 12-345 6789");
    expect(data.mustChangePassword).toBe(true);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("steps past a handle that is already taken, reading the set inside the transaction", async () => {
    userFindMany.mockResolvedValue([{ username: "siti" }, { username: "siti-2" }]);
    await createBuyer(input);
    expect(userFindMany.mock.calls[0][0].where).toEqual({ username: { startsWith: "siti" } });
    expect(userCreate.mock.calls[0][0].data.username).toBe("siti-3");
  });

  it("emails the shop sign-in URL, and the password it actually hashed", async () => {
    const { compare } = await import("bcryptjs");
    await createBuyer(input);
    expect(templateArgs.at(-1)?.signInUrl).toBe("https://shop.example.com/signin");
    const sent = templateArgs.at(-1)!.password;
    expect(await compare(sent, userCreate.mock.calls[0][0].data.passwordHash)).toBe(true);
  });

  it("reports the invitation as sent when it was", async () => {
    const result = await createBuyer(input);
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "sent" } });
  });

  // sendEmail is documented "Never throws" (src/lib/email.ts) — it reports a
  // failed send as { sent: false }, not a rejection. This is the case that
  // actually happens (a Resend API error, an invalid recipient, the
  // placeholder-key case local runs hit) and the one that matters.
  it("keeps the buyer when the email fails — a Resend outage must not lose typing", async () => {
    sendEmail.mockResolvedValue({ sent: false, error: "Domain not verified" });
    const result = await createBuyer(input);
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "failed" } });
    expect(buyerCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
  });

  // sendEmail's own contract says it cannot reject, but sendInviteEmail's
  // try/catch is a backstop for if that promise is ever broken — this proves
  // the backstop itself, separately from the realistic case above.
  it("keeps the buyer even if sendEmail broke its own contract and threw", async () => {
    sendEmail.mockRejectedValue(new Error("resend is down"));
    const result = await createBuyer(input);
    expect(result).toEqual({ success: true, data: { buyerId: "buyer-1", invite: "failed" } });
    expect(buyerCreate).toHaveBeenCalled();
    expect(userCreate).toHaveBeenCalled();
  });

  it("sends the email only after the transaction has committed", async () => {
    const order: string[] = [];
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const value = await fn({
        buyer: { create: buyerCreate },
        user: { create: userCreate, findMany: userFindMany },
        auditEvent: { create: auditCreate },
      });
      order.push("commit");
      return value;
    });
    sendEmail.mockImplementation(async () => {
      order.push("email");
      return { sent: true };
    });
    await createBuyer(input);
    expect(order).toEqual(["commit", "email"]);
  });

  it.each([
    [["username"], "That username is taken."],
    [["email"], "That email address is already in use."],
    [["name"], "Another buyer already has that name."],
  ])("names the field behind a P2002 on %s", async (target, message) => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target },
      }),
    );
    expect(await createBuyer(input)).toEqual({ success: false, error: message });
  });

  it("reads a constraint name too, and username wins over the 'name' it contains", async () => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: "User_username_key" },
      }),
    );
    const result = await createBuyer(input);
    expect(result).toEqual({ success: false, error: "That username is taken." });
  });

  // Prisma 7's driver adapter does not emit the flat `{ target }` shape at
  // all — this is the actual, observed shape (2026-09-11) — so this proves
  // `createBuyer` reads a real P2002, not the hand-built mock above.
  it.each([
    [["username"], "That username is taken."],
    [["email"], "That email address is already in use."],
    [["name"], "Another buyer already has that name."],
  ])("names the field behind the real driver-adapter P2002 shape on %s", async (fields, message) => {
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
        meta: { driverAdapterError: { cause: { constraint: { fields } } } },
      }),
    );
    expect(await createBuyer(input)).toEqual({ success: false, error: message });
  });

  it("rejects a bad input before touching the database", async () => {
    const result = await createBuyer({ ...input, name: "" });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records the creation against the new buyer and its contact, inside the transaction", async () => {
    await createBuyer(input);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_CREATED");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.subjectUserId).toBe("c1");
    expect(data.actorId).toBe("admin");
    expect(data.detail).toEqual({ withContact: true, name: "Acme Industrial Sdn Bhd" });
    // Never the remark: it is internal, and an audit row is read by more
    // screens than the buyer page is.
    expect(JSON.stringify(data)).not.toContain("Pays late");
    expect(JSON.stringify(data)).not.toContain(templateArgs.at(-1)!.password);
  });

  it("writes no audit row when the write it describes rolled back", async () => {
    buyerCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dupe", {
        code: "P2002",
        clientVersion: "7",
        meta: { driverAdapterError: { cause: { constraint: { fields: ["name"] } } } },
      }),
    );
    const result = await createBuyer(input);
    expect(result.success).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("deleteBuyer", () => {
  const clean = {
    id: "buyer-1",
    name: "Kim's Mart",
    _count: { purchaseOrders: 0, webOrders: 0, contacts: 2 },
  };

  beforeEach(() => {
    buyerFindUnique.mockResolvedValue(clean);
  });

  it("refuses a member", async () => {
    const { UnauthorizedError } = await import("@/lib/auth-guards");
    requireSuperAdmin.mockRejectedValue(new UnauthorizedError("Super admin only."));
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({ success: false, error: "Super admin only." });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses when the typed name does not match", async () => {
    const result = await deleteBuyer("buyer-1", "Kims Mart");
    expect(result).toEqual({
      success: false,
      error: "That name doesn't match. Type the buyer's name exactly to delete it.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts the name with different case and stray spaces", async () => {
    const result = await deleteBuyer("buyer-1", "  kim's mart ");
    expect(result.success).toBe(true);
  });

  it("refuses a buyer with purchase orders, naming both counts", async () => {
    buyerFindUnique.mockResolvedValue({
      ...clean,
      _count: { purchaseOrders: 14, webOrders: 2, contacts: 2 },
    });
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({
      success: false,
      error:
        "14 purchase orders and 2 shop orders reference this buyer, so it can't be deleted. Disable their shop contacts instead.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses on shop orders alone", async () => {
    buyerFindUnique.mockResolvedValue({
      ...clean,
      _count: { purchaseOrders: 0, webOrders: 1, contacts: 1 },
    });
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect((result as { error: string }).error).toContain("1 shop order references");
  });

  // The count must exclude DRAFT: `openCart` creates one at that status the
  // moment a signed-in client adds their first item, so an unfiltered count
  // would make a buyer who only ever abandoned a cart undeletable — the
  // same bug already found and fixed in `removeBuyerContact` (Task 3).
  it("does not count an abandoned cart as a reason to refuse", async () => {
    await deleteBuyer("buyer-1", "Kim's Mart");
    expect(buyerFindUnique).toHaveBeenCalledWith({
      where: { id: "buyer-1" },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            purchaseOrders: true,
            webOrders: { where: { status: { not: WebOrderStatus.DRAFT } } },
            contacts: true,
          },
        },
      },
    });
  });

  // A DRAFT web order can still exist on a clean buyer (it was excluded from
  // the blocking count above), and its `placedById` points at one of this
  // buyer's own contacts. `WebOrder` has no `onDelete` on that relation, so
  // deleting the contact first would throw a foreign-key error — the draft
  // order has to go first. `WebOrderLine.webOrder` cascades in the schema, so
  // deleting the order is enough to take its lines with it.
  it("deletes the buyer's draft web orders before the contacts, so a placedById foreign key never trips", async () => {
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result.success).toBe(true);
    expect(webOrderDeleteMany).toHaveBeenCalledWith({
      where: { buyerId: "buyer-1", status: WebOrderStatus.DRAFT },
    });
    const draftOrderCall = webOrderDeleteMany.mock.invocationCallOrder[0];
    const contactDeleteCall = userDeleteMany.mock.invocationCallOrder[0];
    expect(draftOrderCall).toBeLessThan(contactDeleteCall);
  });

  it("deletes the contacts and the buyer in one transaction", async () => {
    const result = await deleteBuyer("buyer-1", "Kim's Mart");
    expect(result).toEqual({ success: true, data: undefined });
    expect(userDeleteMany).toHaveBeenCalledWith({
      where: { buyerId: "buyer-1", role: Role.CLIENT },
    });
    expect(buyerDelete).toHaveBeenCalledWith({ where: { id: "buyer-1" } });
  });

  // The CHECK constraint enforces CLIENT ⇒ buyerId, not the converse, so
  // nothing in the schema stops a MEMBER row from carrying a buyerId. An
  // unfiltered deleteMany would hard-delete an ops account from the
  // buyers screen if one ever did — the one thing this phase's
  // authorization rule says must never happen.
  it("only ever deletes CLIENT rows, never an ops account that happened to carry this buyerId", async () => {
    await deleteBuyer("buyer-1", "Kim's Mart");
    const where = userDeleteMany.mock.calls[0][0].where;
    expect(where.role).toBe(Role.CLIENT);
  });

  it("refuses a non-string buyerId before touching the database", async () => {
    const result = await deleteBuyer(42 as unknown as string, "Kim's Mart");
    expect(result.success).toBe(false);
    expect(buyerFindUnique).not.toHaveBeenCalled();
  });

  it("refuses an empty buyerId before touching the database", async () => {
    const result = await deleteBuyer("", "Kim's Mart");
    expect(result.success).toBe(false);
    expect(buyerFindUnique).not.toHaveBeenCalled();
  });

  it("records the deletion with the name, detached from the row it is about", async () => {
    await deleteBuyer("buyer-1", "Kim's Mart");
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_DELETED");
    // buyerId must be null: the FK is SET NULL, so writing the id here would
    // simply be blanked, and the name is what makes the entry readable.
    expect(data.buyerId).toBeNull();
    expect(data.detail).toEqual({ name: "Kim's Mart", contacts: 2 });
  });
});
