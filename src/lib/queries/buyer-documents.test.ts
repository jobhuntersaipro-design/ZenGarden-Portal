import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { groupByFolder } = await import("@/lib/queries/buyer-documents");

const doc = (folder: string, id: string, uploadedAt: string) => ({
  folder,
  id,
  name: `${id}.pdf`,
  mimeType: "application/pdf",
  preview: "pdf" as const,
  sizeBytes: 1,
  uploadedAt,
  uploadedBy: "Aisha",
});

describe("groupByFolder", () => {
  it("lists folders A–Z and each folder newest first", () => {
    const folders = groupByFolder([
      doc("SSM", "a", "2026-09-01T00:00:00Z"),
      doc("contracts", "b", "2026-09-02T00:00:00Z"),
      doc("SSM", "c", "2026-09-10T00:00:00Z"),
      doc("Price lists", "d", "2026-09-03T00:00:00Z"),
    ]);
    expect(folders.map((f) => f.name)).toEqual(["contracts", "Price lists", "SSM"]);
    expect(folders[2].documents.map((d) => d.id)).toEqual(["c", "a"]);
    expect(folders[0].documents[0]).not.toHaveProperty("folder");
  });
});
