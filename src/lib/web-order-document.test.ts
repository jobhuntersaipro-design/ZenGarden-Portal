import { beforeEach, describe, expect, it, vi } from "vitest";

const documentCreate = vi.fn();
const documentUpdate = vi.fn();
const documentDelete = vi.fn();
const documentFindUnique = vi.fn();
const webOrderUpdate = vi.fn();
const webOrderFindUnique = vi.fn();
const loadWebOrderDocumentSource = vi.fn();
const renderPurchaseOrderPdf = vi.fn();
const putObject = vi.fn();
const getObjectBytes = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      create: documentCreate,
      update: documentUpdate,
      delete: documentDelete,
      findUnique: documentFindUnique,
    },
    webOrder: { update: webOrderUpdate, findUnique: webOrderFindUnique },
    // The final link is a two-statement transaction; the mock just runs them.
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/queries/web-orders", () => ({ loadWebOrderDocumentSource }));
vi.mock("@/lib/pdf/purchase-order", () => ({ renderPurchaseOrderPdf }));
vi.mock("@/lib/org-settings", () => ({
  loadSupplierDetails: () =>
    Promise.resolve({ name: "Zen Garden", address: null, email: null, phone: null }),
}));
vi.mock("@/lib/r2", () => ({
  putObject,
  getObjectBytes,
  documentKey: (id: string, ext: string) => `po/2026/09/${id}.${ext}`,
  PENDING_KEY_PREFIX: "pending:",
}));

const { attachWebOrderDocument, loadWebOrderDocumentData, readStoredWebOrderDocument } =
  await import("@/lib/web-order-document");

const source = (over: Record<string, unknown> = {}) => ({
  id: "wo1",
  reference: "W-2609-00015",
  status: "SUBMITTED",
  placedById: "client-1",
  submittedAt: new Date("2026-09-15T02:00:00.000Z"),
  deliveryDate: new Date("2026-10-02T00:00:00.000Z"),
  documentId: null,
  order: {
    orderId: "W-2609-00015",
    poNumber: "ACME-PO-771",
    currency: "MYR",
    paymentTerms: "45 days",
    notes: null,
    tax: null,
    buyer: { name: "Acme Industrial Sdn Bhd", address: null, contact: null },
    lines: [
      {
        position: 1,
        sku: "ZEN-SC-2100-GM-VN",
        description: "ZEN 2.1L — Goat's Milk",
        packSize: 6,
        cartonsPerPallet: 52,
        quantity: "3",
        unitPrice: "220.50",
        amount: "661.50",
      },
    ],
  },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  loadWebOrderDocumentSource.mockResolvedValue(source());
  renderPurchaseOrderPdf.mockResolvedValue(Buffer.from("%PDF-1.7 pretend"));
  documentCreate.mockResolvedValue({ id: "doc1" });
  documentUpdate.mockResolvedValue({});
  documentDelete.mockResolvedValue({});
  webOrderUpdate.mockResolvedValue({});
  putObject.mockResolvedValue({});
});

describe("attachWebOrderDocument", () => {
  it("files the PDF against the buyer's own contact and links it to the order", async () => {
    const result = await attachWebOrderDocument("wo1");

    const data = documentCreate.mock.calls[0][0].data;
    expect(data.mimeType).toBe("application/pdf");
    expect(data.originalName).toBe("W-2609-00015 purchase order.pdf");
    expect(data.sizeBytes).toBe(16);
    expect(data.uploadedById).toBe("client-1");
    // The key contains the row's own id, so it cannot be known before it.
    expect(data.r2Key).toBe("pending:wo1");

    expect(putObject).toHaveBeenCalledExactlyOnceWith(
      "po/2026/09/doc1.pdf",
      expect.anything(),
      "application/pdf",
    );
    expect(documentUpdate.mock.calls[0][0]).toEqual({
      where: { id: "doc1" },
      data: { r2Key: "po/2026/09/doc1.pdf" },
    });
    expect(webOrderUpdate.mock.calls[0][0]).toEqual({
      where: { id: "wo1" },
      data: { documentId: "doc1" },
    });
    expect(result).toMatchObject({
      documentId: "doc1",
      filename: "W-2609-00015 purchase order.pdf",
    });
  });

  it("draws the document from the order, dates and all", async () => {
    await attachWebOrderDocument("wo1");
    const [document, footnote] = renderPurchaseOrderPdf.mock.calls[0];
    // Two fields, never one for the other (2026-09-17).
    expect(document.poNumber).toBe("ACME-PO-771");
    expect(document.orderId).toBe("W-2609-00015");
    expect(document.orderDate).toBe("15 Sep 2026");
    // Not confirmed yet, so no promise is printed even though a date is set.
    expect(document.deliveryDate).toBeNull();
    // …and the note under the dates says the team will confirm them.
    expect(document.awaitingConfirmation).toBe(true);
    expect(document).not.toHaveProperty("requestedDate");
    // Summed from the lines by the shared builder, never echoed.
    expect(document.total).toBe("661.50");
    expect(footnote).toMatch(/^Sent to our team/);
  });

  /**
   * Idempotent: submit renders it, confirm asks again and must get the same
   * file back rather than a second one against the same order.
   */
  it("returns the existing file without rendering a second one", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ documentId: "doc1" }));
    documentFindUnique.mockResolvedValue({
      id: "doc1",
      r2Key: "po/2026/09/doc1.pdf",
      originalName: "W-2609-00015 purchase order.pdf",
    });
    getObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const result = await attachWebOrderDocument("wo1");

    expect(renderPurchaseOrderPdf).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(result?.documentId).toBe("doc1");
  });

  it("prints the expected delivery date and the confirmed footnote once confirmed", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "CONFIRMED" }));
    await attachWebOrderDocument("wo1");
    const [document, footnote] = renderPurchaseOrderPdf.mock.calls[0];
    expect(document.deliveryDate).toBe("2 Oct 2026");
    expect(document.awaitingConfirmation).toBe(false);
    expect(footnote).toMatch(/^Confirmed by our team/);
  });

  /**
   * Phase 42: the file sent at submit cannot carry the date the team commits
   * to at confirm, so confirm redraws it — into the same row and the same key,
   * so every link to the document reads the new bytes.
   */
  it("redraws into the existing object when asked, keeping the row", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(
      source({ status: "CONFIRMED", documentId: "doc1" }),
    );
    documentFindUnique.mockResolvedValue({
      id: "doc1",
      r2Key: "po/2026/09/doc1.pdf",
      originalName: "W-2609-00015 purchase order.pdf",
    });

    const result = await attachWebOrderDocument("wo1", { redraw: true });

    expect(renderPurchaseOrderPdf).toHaveBeenCalledOnce();
    expect(getObjectBytes).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(putObject).toHaveBeenCalledExactlyOnceWith(
      "po/2026/09/doc1.pdf",
      expect.anything(),
      "application/pdf",
    );
    expect(documentUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: "doc1" },
      data: { sizeBytes: 16 },
    });
    expect(webOrderUpdate).not.toHaveBeenCalled();
    expect(result?.documentId).toBe("doc1");
  });

  it("deletes the row and reports nothing when the upload fails", async () => {
    putObject.mockRejectedValue(new Error("R2 is down"));

    expect(await attachWebOrderDocument("wo1")).toBeNull();
    expect(documentDelete).toHaveBeenCalledExactlyOnceWith({ where: { id: "doc1" } });
    // Nothing half-linked: the order keeps no documentId at all.
    expect(webOrderUpdate).not.toHaveBeenCalled();
  });

  it("draws nothing for a live cart", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "DRAFT" }));
    expect(await attachWebOrderDocument("wo1")).toBeNull();
    expect(renderPurchaseOrderPdf).not.toHaveBeenCalled();
  });

  it("draws one for an order already confirmed, so confirm can repair a miss", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "CONFIRMED" }));
    expect(await attachWebOrderDocument("wo1")).not.toBeNull();
  });

  /**
   * `confirmWebOrder` calls this while the order is still RECEIVED — the
   * team has picked it up but not yet confirmed it. Refusing that status
   * would mean every confirmed shop order is written with no document at
   * all, and the buyer's own copy never draws for the whole time the team
   * holds the order.
   */
  it("draws one for an order the team has received but not yet confirmed", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "RECEIVED" }));
    expect(await attachWebOrderDocument("wo1")).not.toBeNull();
  });

  it("never throws — a failed render must not read back as a failed order", async () => {
    renderPurchaseOrderPdf.mockRejectedValue(new Error("yoga would not load"));
    expect(await attachWebOrderDocument("wo1")).toBeNull();
  });

  it("returns nothing for an order that is gone", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(null);
    expect(await attachWebOrderDocument("gone")).toBeNull();
  });
});

/** The emails' half (2026-09-18): the same data, and the stored file, with no render. */
describe("loadWebOrderDocumentData", () => {
  it("builds what the file prints, without rendering or writing", async () => {
    const data = await loadWebOrderDocumentData("wo1");
    expect(data?.buyer.name).toBe("Acme Industrial Sdn Bhd");
    expect(data?.lines[0]?.sku).toBe("ZEN-SC-2100-GM-VN");
    expect(data?.deliveryDate).toBeNull();
    expect(renderPurchaseOrderPdf).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("reads a declined order, which waits on nobody", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "DECLINED" }));
    const data = await loadWebOrderDocumentData("wo1");
    expect(data?.awaitingConfirmation).toBe(false);
    expect(data?.deliveryDate).toBeNull();
  });

  it("refuses a cart", async () => {
    loadWebOrderDocumentSource.mockResolvedValue(source({ status: "DRAFT" }));
    await expect(loadWebOrderDocumentData("wo1")).resolves.toBeNull();
  });
});

describe("readStoredWebOrderDocument", () => {
  it("reads the stored bytes back and renders nothing", async () => {
    webOrderFindUnique.mockResolvedValue({
      document: { id: "doc1", r2Key: "po/2026/09/doc1.pdf", originalName: "W-2609-00015 purchase order.pdf" },
    });
    getObjectBytes.mockResolvedValue(new Uint8Array([37, 80]));

    const file = await readStoredWebOrderDocument("wo1");

    expect(getObjectBytes).toHaveBeenCalledExactlyOnceWith("po/2026/09/doc1.pdf");
    expect(file).toEqual({
      documentId: "doc1",
      filename: "W-2609-00015 purchase order.pdf",
      bytes: new Uint8Array([37, 80]),
    });
    expect(renderPurchaseOrderPdf).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("returns null for an order with no file, and when R2 fails", async () => {
    webOrderFindUnique.mockResolvedValue({ document: null });
    await expect(readStoredWebOrderDocument("wo1")).resolves.toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    webOrderFindUnique.mockResolvedValue({
      document: { id: "doc1", r2Key: "k", originalName: "x.pdf" },
    });
    getObjectBytes.mockRejectedValue(new Error("NoSuchKey"));
    await expect(readStoredWebOrderDocument("wo1")).resolves.toBeNull();
  });
});
