import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { BUYER_CONTAINER_SELECT } = await import("@/lib/queries/buyer-containers");

describe("what a buyer's container section reads", () => {
  it("is fields, dates and media ids — never a staff name or a storage key", () => {
    expect(BUYER_CONTAINER_SELECT).toEqual({
      id: true,
      containerNo: true,
      sealNo: true,
      size: true,
      description: true,
      updatedAt: true,
      media: {
        orderBy: { uploadedAt: "asc" },
        select: { id: true, kind: true, originalName: true, uploadedAt: true },
      },
    });
  });
});
