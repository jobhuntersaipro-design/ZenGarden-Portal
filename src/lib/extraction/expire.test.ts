import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { extraction: { updateMany } } }));

const {
  EXTRACTION_TIMEOUT_ERROR,
  EXTRACTION_TIMEOUT_MS,
  expireStaleExtractions,
  staleExtractionWhere,
} = await import("@/lib/extraction/expire");

const now = new Date("2026-09-29T04:00:00.000Z");
const cutoff = new Date(now.getTime() - EXTRACTION_TIMEOUT_MS);

beforeEach(() => {
  vi.resetAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("staleExtractionWhere (S-12)", () => {
  it("takes RUNNING rows started before the cutoff, and PENDING ones created before it", () => {
    expect(staleExtractionWhere(now)).toEqual({
      OR: [
        { status: "RUNNING", startedAt: { lt: cutoff } },
        { status: "RUNNING", startedAt: null, createdAt: { lt: cutoff } },
        { status: "PENDING", createdAt: { lt: cutoff } },
      ],
    });
  });

  it("leaves a read alone for five minutes", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});

describe("expireStaleExtractions", () => {
  it("fails them with a reason the review screen prints", async () => {
    expect(await expireStaleExtractions(now)).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: staleExtractionWhere(now),
      data: { status: "FAILED", error: EXTRACTION_TIMEOUT_ERROR, finishedAt: now },
    });
  });

  it("never takes the calling page down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    updateMany.mockRejectedValue(new Error("connection reset"));
    await expect(expireStaleExtractions(now)).resolves.toBe(0);
  });
});
