import { z } from "zod";
import { formatBytes } from "@/lib/validation/upload";

/** Photographs only. A PDF is a document, and this is not the document path. */
export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];

/** docs/specs/08-products.md §1. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * A product page, not a gallery. The number lives here so raising it is one
 * edit and one test rather than a hunt through the routes.
 */
export const MAX_IMAGES_PER_PRODUCT = 8;
export const MAX_IMAGES_PER_CALL = 8;
export const MAX_NAME_LENGTH = 255;

/** The `accept` attribute for the file input, kept beside the MIME list. */
export const IMAGE_ACCEPT_ATTRIBUTE = ".png,.jpg,.jpeg,.webp";

const EXTENSIONS: Record<ProductImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const extensionFor = (mimeType: ProductImageMimeType) => EXTENSIONS[mimeType];

export const isProductImageMimeType = (
  value: string,
): value is ProductImageMimeType =>
  (PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(value);

// Plain language, shown under the filename on the row — the Phase 03 idiom.
export const IMAGE_WRONG_TYPE =
  "That file type isn't supported — use PNG, JPG or WebP";
export const IMAGE_TOO_LARGE = (bytes: number) =>
  `That image is ${formatBytes(bytes)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}`;
export const IMAGE_NAME_TOO_LONG = `That filename is too long — ${MAX_NAME_LENGTH} characters at most`;
export const TOO_MANY_IMAGES = `This product already has ${MAX_IMAGES_PER_PRODUCT} images`;

export const productImageFileSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH, IMAGE_NAME_TOO_LONG),
  type: z.string().refine(isProductImageMimeType, IMAGE_WRONG_TYPE),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

export const imagePresignRequestSchema = z.object({
  files: z
    .array(productImageFileSchema.loose())
    .min(1)
    .max(MAX_IMAGES_PER_CALL, TOO_MANY_IMAGES),
});

export const imageCompleteRequestSchema = z.object({
  imageId: z.string().min(1),
});

/**
 * The same check the client runs before calling the server, so an obviously
 * bad file gets a reason without a round trip. `existingCount` is how many
 * images the product already has, which is the only rule the file itself
 * cannot answer.
 */
export function rejectionReason(
  file: { name: string; type: string; size: number },
  existingCount: number,
): string | null {
  if (existingCount >= MAX_IMAGES_PER_PRODUCT) return TOO_MANY_IMAGES;
  if (!isProductImageMimeType(file.type)) return IMAGE_WRONG_TYPE;
  if (file.size > MAX_IMAGE_BYTES) return IMAGE_TOO_LARGE(file.size);
  if (file.name.length > MAX_NAME_LENGTH) return IMAGE_NAME_TOO_LONG;
  if (file.size <= 0) return "That file is empty";
  return null;
}
