import { unzipSync } from "fflate";
import { CONTAINER_MEDIA_TYPES, containerMediaType } from "@/lib/validation/container-files";
import { formatBytes } from "@/lib/validation/upload";
import { isJunk } from "@/lib/upload/expand-zips";

/** A zip of container photos and videos, unpacked in the browser; the zip itself is never stored. */
export const MAX_CONTAINER_ZIP_BYTES = 300 * 1024 * 1024;
// ponytail: whole zip held in memory once inflated; fflate's streaming Unzip if 300 MB zips crash a phone.
const MAX_EXPANDED_BYTES = 400 * 1024 * 1024;

export type UnpackedZip = { files: File[]; skipped: string[] } | { error: string };

const basename = (path: string) => path.split("/").pop() ?? path;
/** Zip slip: a path climbing out, or starting at the root, is never read. */
const unsafe = (path: string) => path.startsWith("/") || /^[a-z]:/i.test(path) || path.split(/[\\/]/).includes("..");

/** fflate inflates an encrypted entry as noise, so read bit 0 of each central-directory entry's flags. */
export function isEncryptedZip(b: Uint8Array): boolean {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let end = b.length - 22; end >= Math.max(0, b.length - 22 - 0xffff); end--) {
    if (v.getUint32(end, true) !== 0x06054b50) continue;
    let at = v.getUint32(end + 16, true);
    for (let n = v.getUint16(end + 10, true); n > 0 && at + 46 <= b.length; n--) {
      if (v.getUint32(at, true) !== 0x02014b50) return false;
      if (v.getUint16(at + 8, true) & 1) return true;
      at += 46 + v.getUint16(at + 28, true) + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    }
    return false;
  }
  return false;
}

export async function unpackContainerZip(zip: File): Promise<UnpackedZip> {
  if (zip.size > MAX_CONTAINER_ZIP_BYTES) {
    return { error: `${zip.name} is ${formatBytes(zip.size)} — a zip can be ${formatBytes(MAX_CONTAINER_ZIP_BYTES)} at most` };
  }
  const skipped: string[] = [];
  let expanded = 0;
  let entries: Record<string, Uint8Array>;
  try {
    const bytes = new Uint8Array(await zip.arrayBuffer());
    if (isEncryptedZip(bytes)) return { error: `${zip.name} is password-protected — zip it again without a password` };
    entries = unzipSync(bytes, {
      // Read from the zip's own directory, before anything is inflated.
      filter: (info) => {
        if (isJunk(info.name)) return false;
        const name = basename(info.name);
        const type = containerMediaType(name, "");
        if (unsafe(info.name) || !type || info.originalSize > CONTAINER_MEDIA_TYPES[type].max) {
          skipped.push(name);
          return false;
        }
        expanded += info.originalSize;
        return expanded <= MAX_EXPANDED_BYTES;
      },
    });
  } catch {
    return { error: `We couldn't open ${zip.name} — it may be damaged or password-protected` };
  }
  if (expanded > MAX_EXPANDED_BYTES) {
    return { error: `${zip.name} unpacks to more than ${formatBytes(MAX_EXPANDED_BYTES)}` };
  }
  const files = Object.entries(entries).map(([path, bytes]) => {
    const name = basename(path);
    return new File([new Uint8Array(bytes)], name, { type: containerMediaType(name, "") ?? "" });
  });
  if (!files.length) return { error: `${zip.name} has no JPG, PNG, MP4, MOV or WebM files in it` };
  return { files, skipped };
}
