import { beforeEach, describe, expect, it, vi } from "vitest";

const bc = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ prisma: { bookingConfirmation: bc } }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn(), getObjectBytes: vi.fn(), isPendingKey: () => false }));
vi.mock("@/lib/extraction/extract-booking", () => ({
  asDateColumn: (value: string | null) => value,
  runBookingExtraction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
class UnauthorizedError extends Error {}
vi.mock("@/lib/auth-guards", () => ({ UnauthorizedError }));
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: async () => ({ id: "u1", name: "Rina" }),
}));

const { reviewBookingConfirmation } = await import("@/actions/booking-confirmations");
const { findDuplicateBookings } = await import("@/lib/queries/booking-confirmations");

const other = {
  id: "bc-old",
  bookingNumber: "CNB0329873",
  uploadedAt: new Date("2026-11-10T02:00:00Z"),
  uploadedBy: { name: "Chris Lam" },
};

beforeEach(() => {
  vi.clearAllMocks();
  bc.updateMany.mockResolvedValue({ count: 1 });
});

describe("finding a booking number already on file", () => {
  it("matches it ignoring case and spaces, never this booking or an upload in flight", async () => {
    bc.findMany.mockResolvedValue([other]);
    const found = await findDuplicateBookings(" cnb0329873 ", "bc-new");
    expect(bc.findMany.mock.calls[0][0].where).toEqual({
      id: { not: "bc-new" },
      status: { not: "UPLOADING" },
      bookingNumber: { equals: "cnb0329873", mode: "insensitive" },
    });
    expect(found).toEqual([
      { id: "bc-old", bookingNumber: "CNB0329873", uploadedBy: "Chris Lam", uploadedAt: "2026-11-10T02:00:00.000Z" },
    ]);
  });

  it("matches nothing for a booking with no number", async () => {
    expect(await findDuplicateBookings("  ", "bc-new")).toEqual([]);
    expect(bc.findMany).not.toHaveBeenCalled();
  });
});

describe("reviewing a booking whose number is already on file", () => {
  it("asks first, and saves nothing", async () => {
    bc.findUnique.mockResolvedValue({ status: "NEEDS_REVIEW", bookingNumber: "CNB0329873" });
    bc.findMany.mockResolvedValue([other]);
    const result = await reviewBookingConfirmation("bc-new", { bookingNumber: "CNB0329873" });
    expect(result).toMatchObject({ success: false, duplicates: [{ id: "bc-old" }] });
    expect(bc.updateMany).not.toHaveBeenCalled();
  });

  it("saves once the reviewer says save anyway", async () => {
    const result = await reviewBookingConfirmation("bc-new", { bookingNumber: "CNB0329873" }, true);
    expect(result).toEqual({ success: true, data: undefined });
    expect(bc.findMany).not.toHaveBeenCalled();
    expect(bc.updateMany).toHaveBeenCalledOnce();
  });

  it("does not ask again when a kept copy is saved with the same number", async () => {
    bc.findUnique.mockResolvedValue({ status: "REVIEWED", bookingNumber: "CNB0329873" });
    const result = await reviewBookingConfirmation("bc-new", { bookingNumber: "cnb0329873" });
    expect(result.success).toBe(true);
    expect(bc.findMany).not.toHaveBeenCalled();
  });

  it("asks when a reviewed booking's number is changed to one on file", async () => {
    bc.findUnique.mockResolvedValue({ status: "REVIEWED", bookingNumber: "CNB0000001" });
    bc.findMany.mockResolvedValue([other]);
    const result = await reviewBookingConfirmation("bc-new", { bookingNumber: "CNB0329873" });
    expect(result.success).toBe(false);
    expect(bc.updateMany).not.toHaveBeenCalled();
  });
});
