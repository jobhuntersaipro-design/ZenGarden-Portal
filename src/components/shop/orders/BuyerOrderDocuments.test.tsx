import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BuyerOrderDocumentRow } from "@/lib/queries/purchase-order-documents";

vi.mock("@/components/review/DocumentPreviewLoader", () => ({
  DocumentPreview: () => null,
}));

const { BuyerOrderDocuments } = await import("@/components/shop/orders/BuyerOrderDocuments");

const document: BuyerOrderDocumentRow = {
  id: "doc-1",
  name: "spec.pdf",
  mimeType: "application/pdf",
  preview: "pdf",
  category: "Specification",
  createdAt: "2026-10-06T02:00:00.000Z",
};

describe("BuyerOrderDocuments", () => {
  it("lists a file with its name, type and date, and only open and download", () => {
    const html = renderToStaticMarkup(
      <BuyerOrderDocuments purchaseOrderId="po-a" documents={[document]} />,
    );
    expect(html).toContain("spec.pdf");
    expect(html).toContain("Specification");
    expect(html).toContain("6 Oct 2026");
    expect(html).toContain("Open");
    expect(html).toContain("/api/shop/orders/po-a/documents/doc-1/url?download=1");
    expect(html).not.toContain("Upload");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain('type="file"');
  });

  it("says there are no documents, rather than failing", () => {
    const html = renderToStaticMarkup(
      <BuyerOrderDocuments purchaseOrderId="po-a" documents={[]} />,
    );
    expect(html).toContain("No documents on this order yet.");
    expect(html).not.toContain("role=\"alert\"");
  });
});
