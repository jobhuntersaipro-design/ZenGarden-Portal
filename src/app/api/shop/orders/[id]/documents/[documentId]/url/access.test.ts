import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireClient, findBuyerOrderDocument, presignGet } = vi.hoisted(() => ({
  requireClient: vi.fn(),
  findBuyerOrderDocument: vi.fn(),
  presignGet: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => {
  class UnauthorizedError extends Error {
    constructor(message = "You are not signed in.") {
      super(message);
      this.name = "UnauthorizedError";
    }
  }
  return {
    UnauthorizedError,
    requireClient: () => requireClient(),
  };
});
vi.mock("@/lib/queries/purchase-order-documents", () => ({
  findBuyerOrderDocument: (...args: unknown[]) => findBuyerOrderDocument(...args),
}));
vi.mock("@/lib/r2", () => ({
  presignGet: (...args: unknown[]) => presignGet(...args),
}));

const { UnauthorizedError } = await import("@/lib/auth-guards");
const { GET } = await import("./route");

const call = (orderId: string, documentId: string, search = "") =>
  GET(new Request(`http://localhost/api/shop/orders/${orderId}/documents/${documentId}/url${search}`), {
    params: Promise.resolve({ id: orderId, documentId }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  requireClient.mockRejectedValue(new UnauthorizedError("You are not signed in."));
  findBuyerOrderDocument.mockResolvedValue(null);
  presignGet.mockResolvedValue("https://r2.example/get");
});

describe("shop order document url", () => {
  it("refuses a signed-out request with 401 and does not look up the file", async () => {
    const response = await call("po-b", "doc-b");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "You are not signed in." });
    expect(findBuyerOrderDocument).not.toHaveBeenCalled();
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("does not return another buyer's file", async () => {
    requireClient.mockResolvedValue({ buyerId: "buyer-a" });
    const response = await call("po-b", "doc-b");
    expect(response.status).toBe(404);
    expect(findBuyerOrderDocument).toHaveBeenCalledExactlyOnceWith("buyer-a", "po-b", "doc-b");
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("returns a link for the buyer's own file", async () => {
    requireClient.mockResolvedValue({ buyerId: "buyer-a" });
    findBuyerOrderDocument.mockResolvedValue({
      r2Key: "orders/po-a/documents/spec.pdf",
      mimeType: "application/pdf",
      originalName: "spec.pdf",
    });
    const response = await call("po-a", "doc-a");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://r2.example/get",
      mimeType: "application/pdf",
    });
    expect(findBuyerOrderDocument).toHaveBeenCalledExactlyOnceWith("buyer-a", "po-a", "doc-a");
    expect(presignGet).toHaveBeenCalledExactlyOnceWith("orders/po-a/documents/spec.pdf", undefined);
  });

  it("redirects a download of the buyer's own file", async () => {
    requireClient.mockResolvedValue({ buyerId: "buyer-a" });
    findBuyerOrderDocument.mockResolvedValue({
      r2Key: "orders/po-a/documents/spec.pdf",
      mimeType: "application/pdf",
      originalName: "spec.pdf",
    });
    const response = await call("po-a", "doc-a", "?download=1");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://r2.example/get");
    expect(presignGet).toHaveBeenCalledExactlyOnceWith(
      "orders/po-a/documents/spec.pdf",
      "spec.pdf",
    );
  });
});
