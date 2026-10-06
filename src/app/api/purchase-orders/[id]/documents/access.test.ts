import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { purchaseOrderDocumentKey } from "@/lib/validation/po-files";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const {
  auth,
  permissionFindMany,
  poFindUnique,
  docFindFirst,
  docCreate,
  folderFindMany,
  headObject,
  getObjectPrefix,
  deleteObject,
  presignPut,
  presignGet,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  permissionFindMany: vi.fn(),
  poFindUnique: vi.fn(),
  docFindFirst: vi.fn(),
  docCreate: vi.fn(),
  folderFindMany: vi.fn(),
  headObject: vi.fn(),
  getObjectPrefix: vi.fn(),
  deleteObject: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    permissionGrant: { findMany: (...args: unknown[]) => permissionFindMany(...args) },
    purchaseOrder: { findUnique: (...args: unknown[]) => poFindUnique(...args) },
    purchaseOrderDocument: {
      findFirst: (...args: unknown[]) => docFindFirst(...args),
      create: (...args: unknown[]) => docCreate(...args),
    },
    buyerDocument: { findMany: (...args: unknown[]) => folderFindMany(...args) },
  },
}));
vi.mock("@/lib/r2", () => ({
  presignPut: (...args: unknown[]) => presignPut(...args),
  presignGet: (...args: unknown[]) => presignGet(...args),
  headObject: (...args: unknown[]) => headObject(...args),
  getObjectPrefix: (...args: unknown[]) => getObjectPrefix(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
}));

const { POST: presign } = await import("./presign/route");
const { POST: complete } = await import("./complete/route");
const { GET: readUrl } = await import("./[documentId]/url/route");

const signIn = (role: Role, id = "u1") => {
  auth.mockResolvedValue({
    user: {
      id,
      email: `${id}@example.com`,
      name: role === Role.CLIENT ? "Buyer contact" : "Ada Staff",
      role,
      mustChangePassword: false,
      buyerId: role === Role.CLIENT ? "buyer-1" : null,
      image: null,
    },
  });
};

const grants = (...actions: string[]) => {
  permissionFindMany.mockResolvedValue(actions.map((action) => ({ action })));
};

const presignRequest = (purchaseOrderId: string, name = "spec.pdf", type = "application/pdf", size = 120) =>
  new Request(`http://localhost/api/purchase-orders/${purchaseOrderId}/documents/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: "Specification", files: [{ name, type, size }] }),
  });

const completeRequest = (
  purchaseOrderId: string,
  key: string,
  extra: { name?: string; type?: string; size?: number } = {},
) =>
  new Request(`http://localhost/api/purchase-orders/${purchaseOrderId}/documents/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      category: "Specification",
      key,
      name: extra.name ?? "spec.pdf",
      type: extra.type ?? "application/pdf",
      size: extra.size ?? PDF.byteLength,
    }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue(null);
  permissionFindMany.mockResolvedValue([]);
  poFindUnique.mockResolvedValue(null);
  docFindFirst.mockResolvedValue(null);
  docCreate.mockResolvedValue({ id: "doc-new" });
  folderFindMany.mockResolvedValue([]);
  headObject.mockResolvedValue({ ContentLength: PDF.byteLength });
  getObjectPrefix.mockResolvedValue(PDF);
  deleteObject.mockResolvedValue(undefined);
  presignPut.mockResolvedValue("https://r2.example/put");
  presignGet.mockResolvedValue("https://r2.example/get");
});

describe("purchase order document access", () => {
  it("refuses a disallowed type on the server", async () => {
    signIn(Role.SUPER_ADMIN);
    poFindUnique.mockResolvedValue({ id: "po-x" });
    const response = await presign(
      presignRequest("po-x", "notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 80),
      { params: Promise.resolve({ id: "po-x" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "That file type isn't supported — use PDF, JPG or PNG",
    });
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("refuses a buyer upload with 403 and writes nothing", async () => {
    signIn(Role.CLIENT);
    const response = await presign(presignRequest("po-x"), {
      params: Promise.resolve({ id: "po-x" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "This is not a portal account." });
    expect(poFindUnique).not.toHaveBeenCalled();
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated fetch with 401", async () => {
    const response = await readUrl(
      new Request("http://localhost/api/purchase-orders/po-x/documents/doc-1/url"),
      { params: Promise.resolve({ id: "po-x", documentId: "doc-1" }) },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "You are not signed in." });
    expect(docFindFirst).not.toHaveBeenCalled();
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("refuses a member who can look but not attach", async () => {
    signIn(Role.MEMBER);
    grants("po.view", "dashboard.view", "product.view", "buyer.view");
    const response = await presign(presignRequest("po-x"), {
      params: Promise.resolve({ id: "po-x" }),
    });
    expect(response.status).toBe(403);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("refuses a fetch from someone who cannot open the order", async () => {
    signIn(Role.MEMBER);
    grants("dashboard.view");
    const response = await readUrl(
      new Request("http://localhost/api/purchase-orders/po-x/documents/doc-1/url"),
      { params: Promise.resolve({ id: "po-x", documentId: "doc-1" }) },
    );
    expect(response.status).toBe(403);
    expect(docFindFirst).not.toHaveBeenCalled();
  });

  /**
   * Staff are not partitioned by organisation: User and PurchaseOrder have no
   * org or tenant. The boundary is the order id. A file that belongs to
   * another order is not this order's, even for someone who may open both.
   */
  it("does not return another order's file from this order's URL", async () => {
    signIn(Role.WAREHOUSE);
    grants("po.view", "po.document");
    const response = await readUrl(
      new Request("http://localhost/api/purchase-orders/po-x/documents/doc-y/url"),
      { params: Promise.resolve({ id: "po-x", documentId: "doc-y" }) },
    );
    expect(response.status).toBe(404);
    expect(docFindFirst).toHaveBeenCalledWith({
      where: { id: "doc-y", purchaseOrderId: "po-x" },
      select: { r2Key: true, mimeType: true, originalName: true },
    });
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("refuses to file a key minted for another order", async () => {
    signIn(Role.SUPER_ADMIN);
    const key = purchaseOrderDocumentKey("po-y", UUID, "pdf");
    const response = await complete(completeRequest("po-x", key), {
      params: Promise.resolve({ id: "po-x" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "That upload doesn't belong to this order." });
    expect(headObject).not.toHaveBeenCalled();
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not the declared type and deletes the object", async () => {
    signIn(Role.SUPER_ADMIN);
    poFindUnique.mockResolvedValue({ id: "po-x" });
    headObject.mockResolvedValue({ ContentLength: JPEG.byteLength });
    getObjectPrefix.mockResolvedValue(JPEG);
    const key = purchaseOrderDocumentKey("po-x", UUID, "pdf");
    const response = await complete(
      completeRequest("po-x", key, { size: JPEG.byteLength }),
      { params: Promise.resolve({ id: "po-x" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "That file isn't a PDF, JPG or PNG — the contents don't match the type",
    });
    expect(deleteObject).toHaveBeenCalledWith(key);
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("saves a real PDF on this order only, not on the buyer account", async () => {
    signIn(Role.SUPER_ADMIN);
    poFindUnique.mockResolvedValue({ id: "po-x" });
    folderFindMany.mockResolvedValue([{ folder: "contracts" }]);
    const key = purchaseOrderDocumentKey("po-x", UUID, "pdf");
    const response = await complete(completeRequest("po-x", key), {
      params: Promise.resolve({ id: "po-x" }),
    });
    expect(response.status).toBe(200);
    expect(docCreate).toHaveBeenCalledExactlyOnceWith({
      data: {
        purchaseOrderId: "po-x",
        category: "Specification",
        r2Key: key,
        originalName: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: PDF.byteLength,
        uploadedById: "u1",
        uploadedByName: "Ada Staff",
      },
      select: { id: true },
    });
    expect(docCreate.mock.calls[0][0].data).not.toHaveProperty("buyerId");
  });
});
