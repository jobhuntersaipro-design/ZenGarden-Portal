import { beforeEach, describe, expect, it, vi } from "vitest";

const poFindUnique = vi.fn();
const poUpdateMany = vi.fn();
const eventCreate = vi.fn();

const tx = {
  purchaseOrder: { updateMany: poUpdateMany },
  poStageEvent: { create: eventCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findUnique: poFindUnique },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser: () => requireUser(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { advanceStage, revertStage } = await import("@/actions/stages");

const member = {
  id: "user-1",
  email: "a@b.com",
  name: "Aisha Rahman",
  image: null,
  role: "MEMBER",
  mustChangePassword: false,
};
const admin = { ...member, id: "user-2", name: "Chris Lam", role: "SUPER_ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(member);
  poFindUnique.mockResolvedValue({ stage: "IN_PRODUCTION" });
  poUpdateMany.mockResolvedValue({ count: 1 });
  eventCreate.mockResolvedValue({});
});

describe("advanceStage", () => {
  it("moves one stage forward and records who did it", async () => {
    const result = await advanceStage("po-1", "Batch 1 started");
    expect(result).toEqual({ success: true, data: { stage: "QC_PASSED" } });
    const event = eventCreate.mock.calls[0][0].data;
    expect(event).toMatchObject({
      fromStage: "IN_PRODUCTION",
      toStage: "QC_PASSED",
      note: "Batch 1 started",
      changedById: "user-1",
      kind: "STAGE",
    });
  });

  it("guards the update on the stage the caller last saw", async () => {
    await advanceStage("po-1");
    // Without this `where`, two simultaneous clicks would advance twice.
    expect(poUpdateMany.mock.calls[0][0].where).toEqual({
      id: "po-1",
      stage: "IN_PRODUCTION",
    });
  });

  it("tells the loser of a race to refresh, and writes no event", async () => {
    poUpdateMany.mockResolvedValue({ count: 0 });
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error: "This order was already moved. Refresh.",
    });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("refuses to advance past Delivered", async () => {
    poFindUnique.mockResolvedValue({ stage: "DELIVERED" });
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error: "This order is already delivered.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("stores an empty note as null rather than an empty string", async () => {
    await advanceStage("po-1", "   ");
    expect(eventCreate.mock.calls[0][0].data.note).toBeNull();
  });
});

describe("revertStage", () => {
  it("refuses a member even though the button is hidden from them", async () => {
    const result = await revertStage("po-1", "Wrong batch");
    expect(result).toEqual({
      success: false,
      error: "Only a super admin can move an order back.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an empty note", async () => {
    requireUser.mockResolvedValue(admin);
    const result = await revertStage("po-1", "   ");
    expect(result).toEqual({
      success: false,
      error: "A note is required when moving back.",
    });
    expect(poUpdateMany).not.toHaveBeenCalled();
  });

  it("moves back one stage for a super admin and names them in the event", async () => {
    requireUser.mockResolvedValue(admin);
    const result = await revertStage("po-1", "QC failed on batch 2");
    expect(result).toEqual({ success: true, data: { stage: "ORDER_PLACED" } });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      fromStage: "IN_PRODUCTION",
      toStage: "ORDER_PLACED",
      note: "QC failed on batch 2",
      changedById: "user-2",
    });
  });

  it("refuses to move back from the first stage", async () => {
    requireUser.mockResolvedValue(admin);
    poFindUnique.mockResolvedValue({ stage: "ORDER_PLACED" });
    const result = await revertStage("po-1", "Nope");
    expect(result).toEqual({
      success: false,
      error: "Order placed is the first stage.",
    });
  });

  it("applies the same race guard as advancing", async () => {
    requireUser.mockResolvedValue(admin);
    poUpdateMany.mockResolvedValue({ count: 0 });
    const result = await revertStage("po-1", "QC failed");
    expect(result).toEqual({
      success: false,
      error: "This order was already moved. Refresh.",
    });
  });
});
