import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_ZIP_ENTRIES, expandZips, type RefusedFile } from "@/lib/upload/expand-zips";

const bytes = (text: string) => new TextEncoder().encode(text);
const zipFile = (entries: Record<string, Uint8Array>, name = "batch.zip") =>
  new File([new Uint8Array(zipSync(entries))], name, { type: "application/zip" });

describe("expandZips", () => {
  it("replaces a zip with its files, typed from their names, and keeps the order", async () => {
    const loose = new File([bytes("%PDF-")], "loose.pdf", { type: "application/pdf" });
    const out = await expandZips([
      loose,
      zipFile({
        "PO-1.pdf": bytes("%PDF-1"),
        "scans/PO-2.JPG": bytes("jpg"),
        "packing.xlsx": bytes("xlsx"),
        "__MACOSX/._PO-1.pdf": bytes("junk"),
        "scans/": new Uint8Array(),
      }),
    ]);
    expect(out.map((item) => [item.name, item instanceof File ? item.type : "refused"])).toEqual([
      ["loose.pdf", "application/pdf"],
      ["PO-1.pdf", "application/pdf"],
      ["PO-2.JPG", "image/jpeg"],
      // No type, so the queue's own check refuses it by name.
      ["packing.xlsx", ""],
    ]);
  });

  it("refuses a damaged zip, an empty one and one with too many files", async () => {
    const reasons = async (file: File) =>
      (await expandZips([file])).map((item) => (item as RefusedFile).reason);
    expect(await reasons(new File([bytes("not a zip")], "bad.zip"))).toEqual([
      "We couldn't open that zip — it may be damaged or password-protected",
    ]);
    expect(await reasons(zipFile({ "__MACOSX/": new Uint8Array() }))).toEqual([
      "That zip has no files in it",
    ]);
    const many = Object.fromEntries(
      Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => [`PO-${i}.pdf`, bytes("%PDF-")]),
    );
    expect(await reasons(zipFile(many))).toEqual([
      `That zip holds ${MAX_ZIP_ENTRIES + 1} files — ${MAX_ZIP_ENTRIES} at most`,
    ]);
  });
});
