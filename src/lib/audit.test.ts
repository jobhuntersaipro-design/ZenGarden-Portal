import { beforeEach, describe, expect, it, vi } from "vitest";
import { audit, changedFields } from "@/lib/audit";

const create = vi.fn();
const writer = { auditEvent: { create } };

beforeEach(() => {
  vi.resetAllMocks();
  create.mockResolvedValue({ id: "evt-1" });
});

describe("audit", () => {
  it("writes through whichever client it was handed", async () => {
    await audit(writer, {
      action: "PASSWORD_RESET",
      actorId: "admin-1",
      buyerId: "buyer-1",
      subjectUserId: "contact-1",
      detail: { name: "Siti" },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        action: "PASSWORD_RESET",
        actorId: "admin-1",
        buyerId: "buyer-1",
        subjectUserId: "contact-1",
        detail: { name: "Siti" },
      },
      select: { id: true },
    });
  });

  it("stores explicit nulls rather than leaving columns undefined", async () => {
    await audit(writer, { action: "SIGNED_IN", actorId: "c1", buyerId: "b1" });
    const data = create.mock.calls[0][0].data;
    expect(data.subjectUserId).toBeNull();
    // Prisma treats `undefined` as "do not set", which is what we want for an
    // optional Json column — null would write a JSON null.
    expect(data.detail).toBeUndefined();
  });
});

describe("changedFields", () => {
  it("reports only the keys whose value actually moved", () => {
    const current = { phone: "+60 3-1111", remark: "Chase late", address: "12 Jalan Satu" };
    const patch = { phone: "+60 3-2222", remark: "Chase late" };
    expect(changedFields(patch, current)).toEqual(["phone"]);
  });

  it("ignores keys the patch did not name", () => {
    expect(changedFields({ remark: undefined }, { remark: "x" })).toEqual([]);
  });

  it("counts clearing a field to null as a change", () => {
    expect(changedFields({ phone: null }, { phone: "+60 3-1111" })).toEqual(["phone"]);
  });

  it("sorts, so the same edit always reads the same way", () => {
    const current = { a: "1", b: "2", c: "3" };
    expect(changedFields({ c: "9", a: "9" }, current)).toEqual(["a", "c"]);
  });
});
