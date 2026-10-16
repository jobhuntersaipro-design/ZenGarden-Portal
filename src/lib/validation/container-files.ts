import { formatBytes } from "@/lib/validation/upload";

/**
 * Container photos and videos (Phase 68). Photos JPG/PNG, 15 MB; videos
 * MP4/MOV/WebM, 200 MB, straight from the browser to R2 so the size never
 * touches a function. HEIC is not listed: an iPhone hands Safari a JPEG when
 * the input does not accept HEIC, and a HEIC original would not show in
 * Chrome anyway.
 */
export const CONTAINER_MEDIA_TYPES = {
  "image/jpeg": { ext: "jpg", kind: "PHOTO", max: 15 * 1024 * 1024 },
  "image/png": { ext: "png", kind: "PHOTO", max: 15 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", kind: "VIDEO", max: 200 * 1024 * 1024 },
  "video/quicktime": { ext: "mov", kind: "VIDEO", max: 200 * 1024 * 1024 },
  "video/webm": { ext: "webm", kind: "VIDEO", max: 200 * 1024 * 1024 },
} as const;

export type ContainerMediaMime = keyof typeof CONTAINER_MEDIA_TYPES;

export const CONTAINER_MEDIA_ACCEPT = ".jpg,.jpeg,.png,.mp4,.mov,.webm";
export const MAX_MEDIA_PER_CONTAINER = 30;
export const CONTAINER_SIGNATURE_BYTES = 16;
export const CONTAINER_WRONG_TYPE = "Use a JPG or PNG photo, or an MP4, MOV or WebM video";

const BY_EXT: Record<string, ContainerMediaMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const isMime = (value: string): value is ContainerMediaMime =>
  Object.prototype.hasOwnProperty.call(CONTAINER_MEDIA_TYPES, value);

export function containerMediaType(name: string, type: string): ContainerMediaMime | null {
  if (type && type !== "application/octet-stream") return isMime(type) ? type : null;
  return BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export function containerMediaRejection(file: { name: string; type: string; size: number }): string | null {
  const type = containerMediaType(file.name, file.type);
  if (!type) return CONTAINER_WRONG_TYPE;
  if (file.name.length > 200) return "That filename is too long — 200 characters at most";
  if (file.size <= 0) return "That file is empty";
  const { max } = CONTAINER_MEDIA_TYPES[type];
  if (file.size > max) return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(max)}`;
  return null;
}

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

/** The bytes have to be the format declared. MP4 and MOV both carry `ftyp` at offset 4. */
export function containerMediaMatches(type: ContainerMediaMime, b: Uint8Array): boolean {
  switch (type) {
    case "image/jpeg":
      return starts(b, [0xff, 0xd8, 0xff]);
    case "image/png":
      return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "video/mp4":
    case "video/quicktime":
      return starts(b, [0x66, 0x74, 0x79, 0x70], 4) || starts(b, [0x6d, 0x6f, 0x6f, 0x76], 4) || starts(b, [0x77, 0x69, 0x64, 0x65], 4);
    case "video/webm":
      return starts(b, [0x1a, 0x45, 0xdf, 0xa3]);
  }
}

export const containerMediaKey = (containerId: string, uuid: string, ext: string) =>
  `containers/${containerId}/${uuid}.${ext}`;
export const containerThumbKey = (key: string) => key.replace(/\.[a-z0-9]+$/, ".thumb.webp");

export function isContainerMediaKey(key: string, containerId: string, ext: string): boolean {
  if (!/^[a-zA-Z0-9_-]+$/.test(containerId)) return false;
  return new RegExp(
    `^containers/${containerId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
  ).test(key);
}
