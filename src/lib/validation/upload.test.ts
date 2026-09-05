import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_CALL,
  MAX_NAME_LENGTH,
  extensionFor,
  formatBytes,
  presignRequestSchema,
  rejectionReason,
} from "@/lib/validation/upload";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "PO-ACME-2026-0917.pdf",
  type: "application/pdf",
  size: 1_200_000,
  ...over,
});

describe("rejectionReason", () => {
  it("accepts the three supported types", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg"]) {
      expect(rejectionReason(file({ type }))).toBeNull();
    }
  });

  it("refuses anything else by name, not by code", () => {
    expect(
      rejectionReason(
        file({
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          name: "quote.docx",
        }),
      ),
    ).toBe("That file type isn't supported — PDF, PNG or JPG");
  });

  it("names the actual size when a file is too large", () => {
    // The acceptance criterion quotes this string back, so it is asserted whole.
    expect(rejectionReason(file({ size: 25 * 1024 * 1024 }))).toBe(
      "File too large — 25.0 MB, limit is 20.0 MB",
    );
  });

  it("accepts a file of exactly the limit", () => {
    expect(rejectionReason(file({ size: MAX_FILE_BYTES }))).toBeNull();
  });

  it("refuses one byte over", () => {
    expect(rejectionReason(file({ size: MAX_FILE_BYTES + 1 }))).not.toBeNull();
  });

  it("refuses an empty file", () => {
    expect(rejectionReason(file({ size: 0 }))).toBe("That file is empty");
  });

  it("refuses an over-long name", () => {
    const name = `${"a".repeat(MAX_NAME_LENGTH + 1)}.pdf`;
    expect(rejectionReason(file({ name }))).toBe(
      `That filename is too long — ${MAX_NAME_LENGTH} characters at most`,
    );
  });
});

describe("presignRequestSchema", () => {
  it("accepts a full batch", () => {
    const files = Array.from({ length: MAX_FILES_PER_CALL }, () => file());
    expect(presignRequestSchema.safeParse({ files }).success).toBe(true);
  });

  it("refuses one file more than the batch limit", () => {
    const files = Array.from({ length: MAX_FILES_PER_CALL + 1 }, () => file());
    expect(presignRequestSchema.safeParse({ files }).success).toBe(false);
  });

  it("refuses an empty batch", () => {
    expect(presignRequestSchema.safeParse({ files: [] }).success).toBe(false);
  });

  it("refuses a negative or fractional size", () => {
    expect(presignRequestSchema.safeParse({ files: [file({ size: -1 })] }).success).toBe(false);
    expect(presignRequestSchema.safeParse({ files: [file({ size: 1.5 })] }).success).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps each accepted type to the extension used in the key", () => {
    expect(extensionFor("application/pdf")).toBe("pdf");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
});

describe("formatBytes", () => {
  it("scales to the unit a person would use", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_258_291)).toBe("1.2 MB");
  });
});
