import { unzipSync } from "fflate";
import { MAX_FILE_BYTES, TOO_LARGE, formatBytes } from "@/lib/validation/upload";

/** The zip as dropped. Its entries are then held to the usual 20 MB each. */
export const MAX_ZIP_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 50;
/** What the entries may add up to once unpacked, so a small zip cannot fill the tab's memory. */
export const MAX_ZIP_EXPANDED_BYTES = 200 * 1024 * 1024;

/** Never becomes a File: the queue shows it as a failed row with this reason. */
export type RefusedFile = { name: string; size: number; reason: string };

const ZIP_TYPES = new Set(["application/zip", "application/x-zip-compressed", "application/x-zip"]);

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const isZip = (file: { name: string; type: string }) =>
  ZIP_TYPES.has(file.type) || /\.zip$/i.test(file.name);

const basename = (path: string) => path.split("/").pop() ?? path;

/** Folders, and what macOS and Windows tuck into a zip on their own. */
const isJunk = (path: string) =>
  path.endsWith("/") || path.startsWith("__MACOSX/") || basename(path).startsWith(".");

const refuse = (zip: File, reason: string): RefusedFile[] => [
  { name: zip.name, size: zip.size, reason },
];

/**
 * Every file inside the zip, each typed from its extension. A PDF, PNG or JPG
 * then goes through the queue like a dropped file; anything else carries no
 * type and the queue's own check refuses it by name.
 */
export async function expandZip(zip: File): Promise<Array<File | RefusedFile>> {
  if (zip.size > MAX_ZIP_BYTES) {
    return refuse(
      zip,
      `That zip is ${formatBytes(zip.size)} — the limit is ${formatBytes(MAX_ZIP_BYTES)}`,
    );
  }

  const tooLarge: RefusedFile[] = [];
  let count = 0;
  let expanded = 0;
  let entries: Record<string, Uint8Array>;
  try {
    // ponytail: synchronous, so a 100 MB zip holds the tab for a moment; fflate's
    // worker-based `unzip` if anyone notices.
    entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
      // Sizes are read from the zip's own directory, before anything is inflated.
      filter: (info) => {
        if (isJunk(info.name)) return false;
        count += 1;
        if (info.originalSize > MAX_FILE_BYTES) {
          tooLarge.push({
            name: basename(info.name),
            size: info.originalSize,
            reason: TOO_LARGE(info.originalSize),
          });
          return false;
        }
        expanded += info.originalSize;
        return count <= MAX_ZIP_ENTRIES && expanded <= MAX_ZIP_EXPANDED_BYTES;
      },
    });
  } catch {
    return refuse(zip, "We couldn't open that zip — it may be damaged or password-protected");
  }

  if (count === 0) return refuse(zip, "That zip has no files in it");
  if (count > MAX_ZIP_ENTRIES) {
    return refuse(zip, `That zip holds ${count} files — ${MAX_ZIP_ENTRIES} at most`);
  }
  if (expanded > MAX_ZIP_EXPANDED_BYTES) {
    return refuse(
      zip,
      `That zip unpacks to ${formatBytes(expanded)} — ${formatBytes(MAX_ZIP_EXPANDED_BYTES)} at most`,
    );
  }

  const files = Object.entries(entries).map(([path, bytes]) => {
    const name = basename(path);
    const type = TYPE_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
    return new File([new Uint8Array(bytes)], name, { type });
  });
  return [...files, ...tooLarge];
}

/** Dropped files in order, each zip replaced by what is inside it. */
export async function expandZips(files: File[]): Promise<Array<File | RefusedFile>> {
  const expanded = await Promise.all(
    files.map((file) => (isZip(file) ? expandZip(file) : Promise.resolve([file]))),
  );
  return expanded.flat();
}
