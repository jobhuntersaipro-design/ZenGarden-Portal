import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerUpdate = vi.fn();
const buyerFindUnique = vi.fn();
const auditCreate = vi.fn();
const labelFindFirst = vi.fn();
const labelCreate = vi.fn();
// The bare (non-transactional) client's own `auditEvent.create` — kept as a
// distinct spy from the one handed into `$transaction` below, so a future
// `audit(prisma, …)` in place of `audit(tx, …)` shows up here instead of
// silently satisfying the same assertions as the real transactional write.
const looseAuditCreate = vi.fn();
const requireUser = vi.fn();

// The action now reads the row, then writes the update and its audit row in
// one transaction, so the mock hands the callback the same spies.
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ buyer: { update: buyerUpdate }, auditEvent: { create: auditCreate } }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    buyer: { update: buyerUpdate, findUnique: buyerFindUnique },
    auditEvent: { create: looseAuditCreate },
    $transaction: transaction,
  },
}));
class UnauthorizedError extends Error {}
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError,
  requireUser,
}));
const __permissionGuard = () => requireUser();
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

const { updateBuyer } = await import("@/actions/buyers");

beforeEach(() => {
  vi.resetAllMocks();
  requireUser.mockResolvedValue({ id: "u1", role: "MEMBER" });
  buyerUpdate.mockResolvedValue({});
  auditCreate.mockResolvedValue({ id: "evt-1" });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      buyer: { update: buyerUpdate },
      auditEvent: { create: auditCreate },
      catalogLabel: { findFirst: labelFindFirst, create: labelCreate },
    }),
  );
  labelFindFirst.mockResolvedValue(null);
  labelCreate.mockResolvedValue({ id: "label-1" });
  // Every pre-existing test in this file calls updateBuyer, which now reads
  // the row first — without this they all fail on "That buyer is gone."
  buyerFindUnique.mockResolvedValue({
    name: "Acme",
    contactName: null,
    email: null,
    phone: null,
    address: null,
    paymentTerms: null,
    market: null,
    remark: null,
  });
});

describe("updateBuyer", () => {
  it("sets the market, which is the one field that decides what the shop shows", async () => {
    const result = await updateBuyer("b1", { market: "Vietnam" });
    expect(result.success).toBe(true);
    expect(buyerUpdate.mock.calls[0][0].data.market).toBe("Vietnam");
    expect(auditCreate.mock.calls[0][0].data.detail).toEqual({
      fields: ["market"],
    });
  });

  it("saves the market on a buyer whose stored payment terms are words", async () => {
    // The defect this covers: the edit sheet used to send the stored "30 days"
    // straight back, which `optionalPaymentTermsSchema` refuses — so on every
    // buyer whose terms read that way, no field could be saved at all, the
    // market included. The form sends the days now.
    buyerFindUnique.mockResolvedValue({
      name: "Acme",
      contactName: null,
      email: null,
      phone: null,
      address: null,
      paymentTerms: "30 days",
      market: null,
      remark: null,
    });
    const result = await updateBuyer("b1", {
      market: "Mydin",
      paymentTerms: "30",
    });
    expect(result.success).toBe(true);
    expect(buyerUpdate.mock.calls[0][0].data.market).toBe("Mydin");
  });

  it("refuses the stored wording, so a form that sends it back is not silently accepted", async () => {
    const result = await updateBuyer("b1", {
      market: "Mydin",
      paymentTerms: "30 days",
    });
    expect(result).toEqual({
      success: false,
      error: "Payment terms are a whole number of days, 0 or more.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("puts a market typed into the picker into the catalogue vocabulary", async () => {
    await updateBuyer("b1", { market: "Brunei" });
    expect(labelCreate).toHaveBeenCalledWith({
      data: { kind: "MARKET", value: "Brunei" },
    });
  });

  it("registers nothing when the market is cleared", async () => {
    // Clearing is allowed on the edit path — the buyers already on record
    // carry none, and refusing a blank here would lock every other field on
    // those rows. There is nothing to add to the vocabulary either way.
    await updateBuyer("b1", { market: "   " });
    expect(buyerUpdate.mock.calls[0][0].data.market).toBeNull();
    expect(labelCreate).not.toHaveBeenCalled();
  });

  it("lets a member write a remark, trimmed", async () => {
    const result = await updateBuyer("b1", { remark: "  Chase on day 25.  " });
    expect(result.success).toBe(true);
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBe("Chase on day 25.");
  });

  it("clears the remark when it is blanked", async () => {
    await updateBuyer("b1", { remark: "   " });
    expect(buyerUpdate.mock.calls[0][0].data.remark).toBeNull();
  });

  // Phase 48 replaced the inline "only a super admin may rename" check with
  // `buyer.manage` over the whole row, so a role without it writes nothing at
  // all — not even the fields it used to be allowed.
  it("refuses a role without buyer.manage, and writes nothing", async () => {
    requireUser.mockRejectedValue(
      new UnauthorizedError("Your role can't manage buyers."),
    );
    const result = await updateBuyer("b1", { remark: "internal" });
    expect(result).toEqual({
      success: false,
      error: "Your role can't manage buyers.",
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

  it("writes the audit row through the transaction, not the bare client", async () => {
    buyerFindUnique.mockResolvedValue({
      id: "buyer-1",
      name: "Acme",
      contactName: null,
      email: null,
      phone: null,
      address: null,
      paymentTerms: null,
      remark: null,
    });
    await updateBuyer("buyer-1", { phone: "+60 3-2222" });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    // If this ever fires, someone called audit(prisma, …) and the row would
    // survive a rolled-back update.
    expect(looseAuditCreate).not.toHaveBeenCalled();
  });
});
