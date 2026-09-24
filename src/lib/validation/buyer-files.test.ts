import { describe, expect, it } from "vitest";
import {
  batchesOf,
  buyerDocumentKey,
  buyerLogoUrl,
  canonicalFolder,
  documentRejectionReason,
  folderSchema,
  isBuyerDocumentKey,
  logoRejectionReason,
  previewKind,
  resolveDocumentType,
  withDraftFolders,
} from "@/lib/validation/buyer-files";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("resolveDocumentType", () => {
  it("takes the browser's type when it names one on the list", () => {
    expect(resolveDocumentType("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveDocumentType("a.html", "text/html")).toBeNull();
  });

  it("falls back to the extension when the browser said nothing", () => {
    expect(resolveDocumentType("Price list.XLSX", "")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(resolveDocumentType("contract.docx", "application/octet-stream")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(resolveDocumentType("run.exe", "")).toBeNull();
  });
});

describe("documentRejectionReason", () => {
  it("refuses a wrong type, an empty file and one over 25 MB", () => {
    expect(documentRejectionReason({ name: "a.zip", type: "application/zip", size: 10 })).toMatch(
      /isn't supported/,
    );
    expect(documentRejectionReason({ name: "a.pdf", type: "application/pdf", size: 0 })).toBe(
      "That file is empty",
    );
    expect(
      documentRejectionReason({ name: "a.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }),
    ).toMatch(/limit is 25/);
    expect(documentRejectionReason({ name: "a.pdf", type: "application/pdf", size: 10 })).toBeNull();
  });
});

describe("previewKind", () => {
  it("previews PDFs and pictures and nothing else", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/jpeg")).toBe("image");
    expect(previewKind("application/vnd.ms-excel")).toBeNull();
  });
});

describe("folders", () => {
  it("trims and collapses spaces, and refuses a blank", () => {
    expect(folderSchema.parse("  Price   lists ")).toBe("Price lists");
    expect(folderSchema.safeParse("   ").success).toBe(false);
  });

  it("files under the existing spelling whatever the case typed", () => {
    expect(canonicalFolder("contracts", ["Contracts", "SSM"])).toBe("Contracts");
    expect(canonicalFolder("Licences", ["Contracts"])).toBe("Licences");
  });
});

describe("document keys", () => {
  it("accepts only a key minted for this buyer with this extension", () => {
    const key = buyerDocumentKey("buyer1", UUID, "pdf");
    expect(isBuyerDocumentKey(key, "buyer1", "pdf")).toBe(true);
    expect(isBuyerDocumentKey(key, "buyer2", "pdf")).toBe(false);
    expect(isBuyerDocumentKey(key, "buyer1", "docx")).toBe(false);
    expect(isBuyerDocumentKey("avatars/u1/abc.webp", "buyer1", "pdf")).toBe(false);
    expect(isBuyerDocumentKey(`buyers/buyer1/documents/../logo.pdf`, "buyer1", "pdf")).toBe(false);
  });
});

describe("logo", () => {
  it("takes PNG, JPG and WebP up to 5 MB", () => {
    expect(logoRejectionReason({ type: "image/png", size: 1000 })).toBeNull();
    expect(logoRejectionReason({ type: "image/svg+xml", size: 1000 })).toMatch(/isn't supported/);
    expect(logoRejectionReason({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(/limit/);
  });

  it("versions the URL with the stored hash", () => {
    expect(buyerLogoUrl("b1", "buyers/b1/logo-abc123.png")).toBe("/api/buyers/b1/logo?v=abc123");
    expect(buyerLogoUrl("b1", null)).toBeNull();
  });
});

describe("batchesOf", () => {
  it("sends any number of files, ten to a request", () => {
    const files = Array.from({ length: 23 }, (_, i) => i);
    const batches = batchesOf(files);
    expect(batches.map((batch) => batch.length)).toEqual([10, 10, 3]);
    expect(batches.flat()).toEqual(files);
  });

  it("sends nothing for nothing", () => {
    expect(batchesOf([])).toEqual([]);
  });
});

describe("withDraftFolders", () => {
  const empty = (name: string) => ({ name, documents: [] as number[] });

  it("lists a new empty folder among the rest, A–Z", () => {
    const folders = [
      { name: "Contracts", documents: [1] },
      { name: "SSM", documents: [2] },
    ];
    expect(withDraftFolders(folders, ["Invoices"], empty).map((f) => f.name)).toEqual([
      "Contracts",
      "Invoices",
      "SSM",
    ]);
  });

  it("drops a draft once files are filed under it, whatever its case", () => {
    const folders = [{ name: "Invoices", documents: [1] }];
    const out = withDraftFolders(folders, ["invoices"], empty);
    expect(out).toHaveLength(1);
    expect(out[0].documents).toEqual([1]);
  });
});
