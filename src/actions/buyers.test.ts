import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerUpdate = vi.fn();
const requireUser = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { buyer: { update: buyerUpdate } } }));
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
});
