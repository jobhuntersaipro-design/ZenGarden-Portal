import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoDocumentData } from "@/lib/purchase-order-document";

const loadWebOrderDocumentData = vi.fn();
vi.mock("@/lib/web-order-document", () => ({ loadWebOrderDocumentData }));

const { poEmailAttachments, preparePoEmail, renderPoPreviewPng } = await import(
  "@/lib/po-email"
);
const { renderPurchaseOrderPdf } = await import("@/lib/pdf/purchase-order");
const { WebOrderReceipt } = await import("@/emails/WebOrderReceipt");
const { WebOrderDeclined } = await import("@/emails/WebOrderDeclined");

const document: PoDocumentData = {
  orderId: "W-2609-00015",
  poNumber: "ACME-PO-771",
  orderDate: "15 Sep 2026",
  deliveryDate: null,
  awaitingConfirmation: true,
  paymentTerms: null,
  currency: "MYR",
  buyer: { name: "Acme Industrial Sdn Bhd", address: null, contact: null },
  supplier: { name: "ZEN GARDEN TRADING (M) SDN BHD", address: null, contact: null },
  lines: [
    {
      position: 1,
      sku: "ZEN-SC-2100-GM-VN",
      description: "ZEN 2.1L",
      detailCaption: "Goat's Milk · Vietnam",
      piecesPerCarton: 6,
      cartonsPerPallet: 52,
      totalPieces: 7200,
      cartons: 1200,
      pallets: 24,
      unitPrice: "220.50",
      amount: "264600.00",
    },
  ],
  subtotal: "264600.00",
  tax: null,
  total: "264600.00",
  notes: null,
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.resetAllMocks();
  loadWebOrderDocumentData.mockResolvedValue(document);
});

/**
 * Rasterised for real — pdf.js and its Node canvas — against the real
 * renderer's output, because the failure this can have is a canvas that will
 * not load or fonts that are not found, and only running it shows either.
 */
describe("renderPoPreviewPng", () => {
  it("draws page 1 of the purchase order as a 2x PNG", async () => {
    const pdf = await renderPurchaseOrderPdf(document, "Sent to our team.");
    const png = await renderPoPreviewPng(pdf);

    expect(png).not.toBeNull();
    expect(png!.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // IHDR: landscape A4 is 841.89 × 595.28pt, so 2x is 1684 × 1191.
    expect(png!.readUInt32BE(16)).toBe(1684);
    expect(png!.readUInt32BE(20)).toBeGreaterThanOrEqual(1190);
    // A modest attachment, not a print-resolution scan.
    expect(png!.byteLength).toBeLessThan(600_000);
  }, 30_000);

  it("returns null rather than throwing when the bytes are not a PDF", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(renderPoPreviewPng(new Uint8Array([1, 2, 3]))).resolves.toBeNull();
  });
});

describe("poEmailAttachments", () => {
  it("attaches the PDF and the preview, inline only for the preview", () => {
    expect(
      poEmailAttachments({
        poNumber: "W-2609-00015",
        pdfBytes: new Uint8Array([37, 80]),
        previewPng: Buffer.from("png"),
      }),
    ).toEqual([
      { filename: "W-2609-00015.pdf", content: Buffer.from([37, 80]), contentType: "application/pdf" },
      {
        filename: "W-2609-00015-preview.png",
        content: Buffer.from("png"),
        contentType: "image/png",
        contentId: "po-preview",
      },
    ]);
  });

  it("attaches the PDF alone when there is no preview", () => {
    const attachments = poEmailAttachments({
      poNumber: "W-2609-00015",
      pdfBytes: new Uint8Array([37, 80]),
      previewPng: null,
    });
    expect(attachments.map((file) => file.filename)).toEqual(["W-2609-00015.pdf"]);
    expect(attachments[0]).not.toHaveProperty("contentId");
  });
});

describe("preparePoEmail", () => {
  it("degrades to the PDF alone when the preview cannot be drawn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const file = { documentId: "d1", filename: "x.pdf", bytes: new Uint8Array([1, 2]) };
    const mail = await preparePoEmail("wo1", "W-2609-00015", file);

    expect(mail).toMatchObject({ document, preview: false, attached: true });
    expect(mail.attachments?.map((a) => a.filename)).toEqual(["W-2609-00015.pdf"]);
  });

  it("still loads the facts when there is no file at all", async () => {
    const mail = await preparePoEmail("wo1", "W-2609-00015", null);
    expect(mail).toEqual({ document, preview: false, attached: false, attachments: undefined });
  });
});

const receipt = (over: { preview?: boolean; attached?: boolean } = {}) =>
  renderToStaticMarkup(
    WebOrderReceipt({
      reference: "W-2609-00015",
      orderUrl: "https://shop.example.com/orders/wo1",
      document,
      preview: true,
      attached: true,
      ...over,
    }),
  );

describe("purchase-order emails", () => {
  /** What a reader with images blocked still gets: every fact and figure. */
  it("carries the facts, lines and total as text", () => {
    const html = receipt();
    for (const text of [
      "We have your order W-2609-00015",
      "Order ID",
      "PO number",
      "ACME-PO-771",
      "Acme Industrial Sdn Bhd",
      "15 Sep 2026",
      "We&#x27;ll confirm",
      "ZEN-SC-2100-GM-VN",
      "Goat&#x27;s Milk · Vietnam",
      "1,200",
      "220.50",
      "264,600.00",
      "Total (MYR)",
      "Nothing is charged and nothing ships until they do.",
      "This email is not an invoice.",
    ]) {
      expect(html).toContain(text);
    }
  });

  /** Only the Order ID under the heading (2026-09-18): the rest is in the summary. */
  it("keeps the line under the heading to the Order ID", () => {
    const html = receipt();
    const meta = html.match(/<p[^>]*>Order ID .*?<\/p>/)?.[0] ?? "";
    expect(meta.replace(/<[^>]+>/g, "")).toBe("Order ID W-2609-00015");
    expect(html).not.toContain("your PO number");
  });

  it("draws the inline preview, with no preload hoisted into the head", () => {
    const html = receipt();
    expect(html).toContain('src="cid:po-preview"');
    expect(html).toContain('width="536"');
    expect(html).toContain("download the attached PDF");
    expect(html).not.toContain("rel=\"preload\"");
  });

  it("draws no image at all when the preview failed", () => {
    const html = receipt({ preview: false });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("cid:");
    expect(html).toContain("attached as a PDF");
    expect(html).toContain("264,600.00");
  });

  it("shows a declined order what was sent, without promising a date", () => {
    const html = renderToStaticMarkup(
      WebOrderDeclined({
        reference: "W-2609-00015",
        reason: "Out of stock until October.",
        orderUrl: "https://shop.example.com/orders/wo1",
        document,
        preview: false,
        attached: false,
      }),
    );
    expect(html).toContain("Out of stock until October.");
    expect(html).toContain("What you sent");
    expect(html).toContain("264,600.00");
    expect(html).not.toContain("We&#x27;ll confirm");
    expect(html).not.toContain("<img");
  });
});
