import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoDocumentData } from "@/lib/purchase-order-document";

const loadWebOrderDocumentData = vi.fn();
vi.mock("@/lib/web-order-document", () => ({ loadWebOrderDocumentData }));
const webOrderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { webOrder: { findUnique: webOrderFindUnique } } }));
const getObjectBytes = vi.fn();
vi.mock("@/lib/r2", () => ({ getObjectBytes }));

const noLogo = { buyer: { name: "Acme", logoKey: null, logoWidth: null, logoHeight: null } };

const { buyerLogoDisplaySize, poEmailAttachments, preparePoEmail, renderPoPreviewPng } =
  await import("@/lib/po-email");
const { renderPurchaseOrderPdf } = await import("@/lib/pdf/purchase-order");
const { WebOrderReceipt, webOrderReceiptSubject } = await import(
  "@/emails/WebOrderReceipt"
);

/**
 * The line under the heading, stripped of its markup. Matched as one `<p>`
 * whose text begins "PO number", so a wrapper change or an extra element is a
 * failure rather than a silent pass.
 */
const metaLine = (html: string) =>
  (html.match(/<p[^>]*>PO number .*?<\/p>/)?.[0] ?? "").replace(/<[^>]+>/g, "");
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
  webOrderFindUnique.mockResolvedValue(noLogo);
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
    expect(mail).toEqual({
      document,
      preview: false,
      attached: false,
      attachments: undefined,
      buyerLogo: null,
    });
  });

  it("attaches the buyer's logo inline and names it for the header", async () => {
    webOrderFindUnique.mockResolvedValue({
      buyer: { name: "Acme", logoKey: "buyers/b1/logo-abc.png", logoWidth: 512, logoHeight: 128 },
    });
    getObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const mail = await preparePoEmail("wo1", "W-2609-00015", null);
    // 512×128 fitted inside 160×44 — width is the bound.
    expect(mail.buyerLogo).toEqual({ cid: "buyer-logo", alt: "Acme", width: 160, height: 40 });
    expect(mail.attachments).toEqual([
      {
        filename: "buyer-logo.png",
        content: Buffer.from([1, 2, 3]),
        contentType: "image/png",
        contentId: "buyer-logo",
      },
    ]);
  });

  it("sends without the logo when it cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    webOrderFindUnique.mockResolvedValue({
      buyer: { name: "Acme", logoKey: "buyers/b1/logo-abc.png", logoWidth: 100, logoHeight: 100 },
    });
    getObjectBytes.mockRejectedValue(new Error("NoSuchKey"));
    const mail = await preparePoEmail("wo1", "W-2609-00015", null);
    expect(mail.buyerLogo).toBeNull();
    expect(mail.attachments).toBeUndefined();
  });
});

describe("buyerLogoDisplaySize", () => {
  it("fits inside the header box and never enlarges", () => {
    expect(buyerLogoDisplaySize(512, 512)).toEqual({ width: 44, height: 44 });
    expect(buyerLogoDisplaySize(40, 20)).toEqual({ width: 40, height: 20 });
    expect(buyerLogoDisplaySize(1000, 100)).toEqual({ width: 160, height: 16 });
  });
});

describe("the email header", () => {
  it("draws the buyer's logo beside ours when there is one, and not otherwise", () => {
    const withLogo = renderToStaticMarkup(
      WebOrderReceipt({
        reference: "W-2609-00015",
        poNumber: "ACME-PO-771",
        orderUrl: "https://shop.example.com/orders/wo1",
        document,
        preview: false,
        attached: false,
        buyerLogo: { cid: "buyer-logo", alt: "Acme Industrial", width: 120, height: 40 },
      }),
    );
    expect(withLogo).toContain('src="cid:buyer-logo"');
    expect(withLogo).toContain('alt="Acme Industrial"');
    expect(withLogo).toContain('src="cid:zen-garden-logo"');
    const without = renderToStaticMarkup(
      WebOrderReceipt({
        reference: "W-2609-00015",
        poNumber: "ACME-PO-771",
        orderUrl: "https://shop.example.com/orders/wo1",
        document,
        preview: false,
        attached: false,
      }),
    );
    expect(without).not.toContain("cid:buyer-logo");
  });
});

const receipt = (
  over: { preview?: boolean; attached?: boolean; poNumber?: string | null } = {},
) =>
  renderToStaticMarkup(
    WebOrderReceipt({
      reference: "W-2609-00015",
      poNumber: "ACME-PO-771",
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
      "We have your order ACME-PO-771",
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

  /**
   * The buyer's own PO number under the heading (2026-09-20), where it was the
   * Order ID before. One `<p>`, the words then a mono span.
   */
  it("names the buyer's PO number under the heading", () => {
    const meta = metaLine(receipt());
    expect(meta).toBe("PO number ACME-PO-771");
    expect(meta).not.toContain("W-2609-00015");
  });

  /**
   * An order placed before the PO number became required has none. The line
   * reads "—" rather than borrowing the Order ID, which is the confusion the
   * 2026-09-17 split exists to prevent.
   */
  it("reads a dash under the heading when the order carries no PO number", () => {
    expect(metaLine(receipt({ poNumber: null }))).toBe("PO number —");
  });

  /**
   * ...but the subject and heading do fall back to the Order ID: "your order —"
   * is unfindable in an inbox, and these orders can still be emailed about
   * whenever their delivery date moves.
   */
  it("falls back to the Order ID in the heading and subject, never a dash", () => {
    const html = receipt({ poNumber: null });
    expect(html).toContain("We have your order W-2609-00015");
    expect(webOrderReceiptSubject(null, "W-2609-00015")).toBe(
      "We have your order W-2609-00015",
    );
    expect(webOrderReceiptSubject("ACME-PO-771", "W-2609-00015")).toBe(
      "We have your order ACME-PO-771",
    );
  });

  /** The Order ID still names the files, where a typed PO number could not. */
  it("keeps the Order ID on the attachment filenames", () => {
    expect(
      poEmailAttachments({
        poNumber: "W-2609-00015",
        pdfBytes: new Uint8Array([1]),
        previewPng: Buffer.from("png"),
      }).map((file) => file.filename),
    ).toEqual(["W-2609-00015.pdf", "W-2609-00015-preview.png"]);
  });

  it("draws the inline preview, with no preload hoisted into the head", () => {
    const html = receipt();
    expect(html).toContain('src="cid:po-preview"');
    expect(html).toContain('width="536"');
    expect(html).toContain("download the attached PDF");
    expect(html).not.toContain("rel=\"preload\"");
  });

  it("draws no preview image when the preview failed", () => {
    const html = receipt({ preview: false });
    // The header logo is always there; the preview is what must be absent.
    expect(html).not.toContain("cid:po-preview");
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
    // The header logo is always there; the preview is what must be absent.
    expect(html).not.toContain("cid:po-preview");
  });
});
