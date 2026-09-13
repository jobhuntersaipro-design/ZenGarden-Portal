import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { create } } }));

const { recordClientSignIn } = await import("@/lib/client-sign-in");

beforeEach(() => {
  vi.resetAllMocks();
  create.mockResolvedValue({ id: "evt-1" });
});

describe("recordClientSignIn", () => {
  it("records a client's sign-in against their own buyer", async () => {
    await recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: "buyer-1" });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: "SIGNED_IN",
      actorId: "c1",
      buyerId: "buyer-1",
      subjectUserId: null,
    });
  });

  // This is a customer account trail, not staff surveillance, and nothing in
  // the spec asked for one. Recording ops sign-ins would also grow the table
  // by every member's every sign-in for a view nobody can read.
  it("records nothing for ops staff", async () => {
    await recordClientSignIn({ id: "u1", role: "MEMBER", buyerId: null });
    await recordClientSignIn({ id: "u2", role: "SUPER_ADMIN", buyerId: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("records nothing for a CLIENT with no buyer, which the CHECK forbids anyway", async () => {
    await recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: null });
    expect(create).not.toHaveBeenCalled();
  });

  // It is called from `authorize`. A write that rejects must never be the
  // reason a correct password is refused.
  it("never rejects, whatever the database does", async () => {
    create.mockRejectedValue(new Error("connection lost"));
    await expect(
      recordClientSignIn({ id: "c1", role: "CLIENT", buyerId: "buyer-1" }),
    ).resolves.toBeUndefined();
  });
});
