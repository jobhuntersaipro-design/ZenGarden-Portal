import { describe, expect, it } from "vitest";
import { MAX_BUYER_DOCUMENT_BYTES } from "@/lib/validation/buyer-files";
import {
  MAX_PO_DOCUMENT_BYTES,
  PO_DOCUMENT_CONTENTS,
  PO_DOCUMENT_WRONG_TYPE,
  isPurchaseOrderDocumentKey,
  poDocumentContentsReason,
  poDocumentRejectionReason,
  purchaseOrderDocumentKey,
  resolvePoDocumentType,
  sniffPoDocumentMime,
} from "@/lib/validation/po-files";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe("resolvePoDocumentType", () => {
  it("accepts PDF, JPG and PNG from the browser", () => {
    expect(resolvePoDocumentType("spec.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolvePoDocumentType("photo.PNG", "image/png")).toBe("image/png");
    expect(resolvePoDocumentType("photo.jpg", "image/jpeg")).toBe("image/jpeg");
  });

  it("reads the extension when the browser said nothing", () => {
    expect(resolvePoDocumentType("spec.PDF", "")).toBe("application/pdf");
    expect(resolvePoDocumentType("photo.jpeg", "application/octet-stream")).toBe("image/jpeg");
  });

  it("refuses Word, Excel and anything else the account documents allow", () => {
    expect(resolvePoDocumentType("notes.docx", "")).toBeNull();
    expect(resolvePoDocumentType("prices.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBeNull();
    expect(resolvePoDocumentType("run.exe", "application/pdf")).toBe("application/pdf");
    expect(resolvePoDocumentType("page.html", "text/html")).toBeNull();
  });
});

describe("zip", () => {
  it("takes every name a browser gives a zip", () => {
    expect(resolvePoDocumentType("docs.zip", "application/zip")).toBe("application/zip");
    expect(resolvePoDocumentType("docs.zip", "application/x-zip-compressed")).toBe("application/zip");
    expect(resolvePoDocumentType("docs.ZIP", "")).toBe("application/zip");
  });

  it("checks the bytes are an archive with something in it", () => {
    expect(poDocumentContentsReason("application/zip", ZIP)).toBeNull();
    expect(poDocumentContentsReason("application/zip", PDF)).toBe(PO_DOCUMENT_CONTENTS);
    // An empty archive's end-of-directory record.
    expect(poDocumentContentsReason("application/zip", new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(
      PO_DOCUMENT_CONTENTS,
    );
  });
});

describe("sniffPoDocumentMime", () => {
  it("names a PDF, a PNG and a JPEG from the leading bytes", () => {
    expect(sniffPoDocumentMime(PDF)).toBe("application/pdf");
    expect(sniffPoDocumentMime(PNG)).toBe("image/png");
    expect(sniffPoDocumentMime(JPEG)).toBe("image/jpeg");
  });

  it("refuses a renamed file and a file that only pretends at the end", () => {
    expect(sniffPoDocumentMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(poDocumentContentsReason("application/pdf", JPEG)).toBe(PO_DOCUMENT_CONTENTS);
    expect(poDocumentContentsReason("image/jpeg", JPEG)).toBeNull();
    expect(poDocumentContentsReason("image/png", PDF)).toBe(PO_DOCUMENT_CONTENTS);
  });
});

describe("poDocumentRejectionReason", () => {
  it("matches the account-level size limit of 25 MB", () => {
    expect(MAX_PO_DOCUMENT_BYTES).toBe(MAX_BUYER_DOCUMENT_BYTES);
    expect(MAX_PO_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("names the type and the size", () => {
    expect(poDocumentRejectionReason({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toBe(
      PO_DOCUMENT_WRONG_TYPE,
    );
    expect(
      poDocumentRejectionReason({
        name: "a.pdf",
        type: "application/pdf",
        size: MAX_PO_DOCUMENT_BYTES + 1,
      }),
    ).toBe("That file is over the 25.0 MB limit");
    expect(poDocumentRejectionReason({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(
      /empty/,
    );
    expect(poDocumentRejectionReason({ name: "a.pdf", type: "application/pdf", size: 12 })).toBeNull();
  });
});

describe("purchaseOrderDocumentKey", () => {
  it("belongs to one order", () => {
    const key = purchaseOrderDocumentKey("po1", UUID, "pdf");
    expect(isPurchaseOrderDocumentKey(key, "po1", "pdf")).toBe(true);
    expect(isPurchaseOrderDocumentKey(key, "po2", "pdf")).toBe(false);
    expect(isPurchaseOrderDocumentKey(key, "po1", "png")).toBe(false);
    expect(isPurchaseOrderDocumentKey("buyers/po1/documents/x.pdf", "po1", "pdf")).toBe(false);
    expect(isPurchaseOrderDocumentKey(`orders/po1/documents/../x.pdf`, "po1", "pdf")).toBe(false);
  });
});
