import { beforeEach, describe, expect, it, vi } from "vitest";

const documentFindMany = vi.fn();
const documentFindFirst = vi.fn();
const documentDeleteMany = vi.fn();
const deleteObject = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: documentFindMany,
      findFirst: documentFindFirst,
      deleteMany: documentDeleteMany,
    },
  },
}));
vi.mock("@/lib/r2", () => ({
  deleteObject,
  isPendingKey: (key: string) => key.startsWith("pending:"),
}));

const { deleteOrphans, findClientDocument, findOwnedDocument } = await import(
  "@/lib/queries/documents"
);

beforeEach(() => {
  vi.resetAllMocks();
  documentFindMany.mockResolvedValue([]);
  documentFindFirst.mockResolvedValue(null);
  documentDeleteMany.mockResolvedValue({ count: 0 });
  deleteObject.mockResolvedValue(undefined);
});

describe("deleteOrphans", () => {
  /**
   * By equality, not by checking `webOrder` alone. A generated purchase order
   * has no extraction and no purchase order until ops confirms it days later,
   * so without this clause the sweep deletes every one an hour after it is
   * written — silently, on one presign in twenty.
   */
  it("leaves a shop order's generated purchase order alone", async () => {
    await deleteOrphans();
    const where = documentFindMany.mock.calls[0][0].where;
    expect(Object.keys(where).sort()).toEqual([
      "extraction",
      "purchaseOrder",
      "uploadedAt",
      "webOrder",
    ]);
    expect(where.webOrder).toBeNull();
    expect(where.extraction).toBeNull();
    expect(where.purchaseOrder).toBeNull();
    expect(where.uploadedAt.lt).toBeInstanceOf(Date);
  });

  it("deletes the object and then the row, by id", async () => {
    documentFindMany.mockResolvedValue([
      { id: "d1", r2Key: "po/2026/09/d1.pdf" },
      // A row that never got past the placeholder names no object at all.
      { id: "d2", r2Key: "pending:abc" },
    ]);
    documentDeleteMany.mockResolvedValue({ count: 2 });

    expect(await deleteOrphans()).toBe(2);
    expect(deleteObject).toHaveBeenCalledExactlyOnceWith("po/2026/09/d1.pdf");
    expect(documentDeleteMany.mock.calls[0][0].where).toEqual({
      id: { in: ["d1", "d2"] },
    });
  });

  it("still removes the rows when R2 refuses an object", async () => {
    documentFindMany.mockResolvedValue([{ id: "d1", r2Key: "po/2026/09/d1.pdf" }]);
    documentDeleteMany.mockResolvedValue({ count: 1 });
    deleteObject.mockRejectedValue(new Error("nope"));

    expect(await deleteOrphans()).toBe(1);
    expect(documentDeleteMany).toHaveBeenCalled();
  });
});

describe("findClientDocument", () => {
  /**
   * The buyer-scoped read. A scan the ops team uploaded has no `webOrder`, so
   * it cannot match this `where` whatever id is guessed — which is the whole
   * difference from `findOwnedDocument`.
   */
  it("matches only a document hanging off one of that buyer's own orders", async () => {
    await findClientDocument("b1", "doc1");
    const args = documentFindFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "doc1", webOrder: { buyerId: "b1" } });
    expect(Object.keys(args.select).sort()).toEqual([
      "id",
      "mimeType",
      "originalName",
      "r2Key",
    ]);
  });

  it("returns nothing for another buyer's document", async () => {
    expect(await findClientDocument("b1", "someone-elses")).toBeNull();
  });

  it("is not the ops read — that one keys on the uploader", async () => {
    await findOwnedDocument("doc1", "u1");
    expect(documentFindFirst.mock.calls[0][0].where).toEqual({
      id: "doc1",
      uploadedById: "u1",
    });
  });
});
