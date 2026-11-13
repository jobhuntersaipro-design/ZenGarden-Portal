import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { isEncryptedZip, unpackContainerZip } from "@/lib/upload/container-zip";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const zipOf = (entries: Record<string, Uint8Array>, name = "photos.zip") =>
  new File([zipSync(entries)], name, { type: "application/zip" });

describe("unpackContainerZip", () => {
  it("keeps the media, skips the rest by name, ignores junk", async () => {
    const out = await unpackContainerZip(
      zipOf({
        "shots/front.png": PNG,
        "shots/clip.MP4": PNG,
        "notes.txt": PNG,
        "__MACOSX/shots/._front.png": PNG,
        "shots/.DS_Store": PNG,
        "../escape.jpg": PNG,
      }),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.files.map((f) => [f.name, f.type])).toEqual([
      ["front.png", "image/png"],
      ["clip.MP4", "video/mp4"],
    ]);
    expect(out.skipped).toEqual(["notes.txt", "escape.jpg"]);
  });

  it("skips a photo over its own 15 MB", async () => {
    const out = await unpackContainerZip(zipOf({ "big.jpg": new Uint8Array(16 * 1024 * 1024), "ok.png": PNG }));
    if ("error" in out) throw new Error(out.error);
    expect(out.files.map((f) => f.name)).toEqual(["ok.png"]);
    expect(out.skipped).toEqual(["big.jpg"]);
  });

  it("refuses a zip with nothing to add, and a damaged one", async () => {
    expect(await unpackContainerZip(zipOf({ "a.txt": PNG }))).toEqual({
      error: "photos.zip has no JPG, PNG, MP4, MOV or WebM files in it",
    });
    const broken = new File([new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])], "bad.zip");
    expect(await unpackContainerZip(broken)).toEqual({
      error: "We couldn't open bad.zip — it may be damaged or password-protected",
    });
  });

  it("refuses a zip over 300 MB before reading it", async () => {
    const huge = { name: "huge.zip", size: 301 * 1024 * 1024 } as File;
    expect(await unpackContainerZip(huge)).toEqual({ error: "huge.zip is 301.0 MB — a zip can be 300.0 MB at most" });
  });

  it("refuses a password-protected zip rather than unpacking noise", async () => {
    // `zip -P secret enc.zip a.png`: fflate alone would hand back 22 encrypted bytes as a PNG.
    const enc = Buffer.from("UEsDBAoACQAAABcPbV1Bo1ZLFgAAAAoAAAAFABwAYS5wbmdVVAkAA15u9mpebvZqdXgLAAEEAAAAAAQAAAAAHQRPb7UgfkV1pOhTPnfumJKmKutOH1BLBwhBo1ZLFgAAAAoAAABQSwECHgMKAAkAAAAXD21dQaNWSxYAAAAKAAAABQAYAAAAAAABAAAApIEAAAAAYS5wbmdVVAUAA15u9mp1eAsAAQQAAAAABAAAAABQSwUGAAAAAAEAAQBLAAAAZQAAAAAA", "base64");
    expect(await unpackContainerZip(new File([enc], "enc.zip"))).toEqual({
      error: "enc.zip is password-protected — zip it again without a password",
    });
    expect(isEncryptedZip(zipSync({ "a.png": PNG }))).toBe(false);
  });
});
