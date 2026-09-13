import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerUpdate = vi.fn();
const buyerFindUnique = vi.fn();
const auditCreate = vi.fn();
const requireUser = vi.fn();

// The action now reads the row, then writes the update and its audit row in
// one transaction, so the mock hands the callback the same spies.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ buyer: { update: buyerUpdate }, auditEvent: { create: auditCreate } }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    buyer: { update: buyerUpdate, findUnique: buyerFindUnique },
    auditEvent: { create: auditCreate },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateBuyer } = await import("@/actions/buyers");

beforeEach(() => {
  vi.resetAllMocks();
  requireUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
  buyerUpdate.mockResolvedValue({});
  auditCreate.mockResolvedValue({ id: "evt-1" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ buyer: { update: buyerUpdate }, auditEvent: { create: auditCreate } }),
  );
  // Every pre-existing test in this file calls updateBuyer, which now reads
  // the row first — without this they all fail on "That buyer is gone."
  buyerFindUnique.mockResolvedValue({
    name: "Acme",
    contactName: null,
    email: null,
    phone: null,
    address: null,
    paymentTerms: null,
    remark: null,
  });
});

describe("updateBuyer", () => {
  it("lets a member write a remark, trimmed", async () => {
    const result = await updateBuyer("b1", { remark: "  Chase on day 25.  " });
    expect(result.success).toBe(true);
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBe("Chase on day 25.");
  });

  it("clears the remark when it is blanked", async () => {
    await updateBuyer("b1", { remark: "   " });
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBeNull();
  });

  it("still refuses a member renaming the buyer", async () => {
    const result = await updateBuyer("b1", { name: "New Name" });
    expect(result).toEqual({
      success: false,
      error: "Only a super admin can rename a buyer.",
    });
    expect(buyerUpdate).not.toHaveBeenCalled();
  });

  it("records only the fields that actually changed", async () => {
    buyerFindUnique.mockResolvedValue({
      id: "buyer-1",
      name: "Acme",
      contactName: "Raj",
      email: "accounts@acme.com",
      phone: "+60 3-1111",
      address: null,
      paymentTerms: "30 days",
      remark: null,
    });
    await updateBuyer("buyer-1", {
      contactName: "Raj",
      phone: "+60 3-2222",
      remark: "Chase on day 25",
    });
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("CUSTOMER_UPDATED");
    expect(data.buyerId).toBe("buyer-1");
    expect(data.detail).toEqual({ fields: ["phone", "remark"] });
    // The remark's text is internal. Its name is not.
    expect(JSON.stringify(data)).not.toContain("Chase on day 25");
  });

  it("writes no audit row when nothing moved", async () => {
    buyerFindUnique.mockResolvedValue({
      id: "buyer-1",
      name: "Acme",
      contactName: "Raj",
      email: null,
      phone: null,
      address: null,
      paymentTerms: null,
      remark: null,
    });
    const result = await updateBuyer("buyer-1", { contactName: "Raj" });
    expect(result.success).toBe(true);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
