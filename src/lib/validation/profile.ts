import { z } from "zod";
import { AVATAR_STYLE_IDS } from "@/lib/avatar-styles";
import { formatBytes } from "@/lib/validation/upload";

/**
 * 120 matches `createUserSchema` in `src/lib/validation/users.ts`, so a name a
 * super admin can set is a name its owner is allowed to keep.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(120, "That name is too long — 120 characters at most");

export const updateProfileSchema = z.object({ name: displayNameSchema });

export const generatedAvatarSchema = z.object({
  style: z.enum(AVATAR_STYLE_IDS),
  seed: z.string().trim().min(1).max(120),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type GeneratedAvatarInput = z.input<typeof generatedAvatarSchema>;

export const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Claude rejects images over 8000px a side; so do we, before anyone waits. */
export const AVATAR_MAX_DIMENSION = 8000;

export const AVATAR_ACCEPT_ATTRIBUTE = ".png,.jpg,.jpeg,.webp";

export const isAvatarMimeType = (value: string): value is AvatarMimeType =>
  (AVATAR_MIME_TYPES as readonly string[]).includes(value);

// Plain language, in the house style of `src/lib/validation/upload.ts`: the
// size case names the actual size, because "too large" alone leaves the user
// guessing by how much.
export const AVATAR_WRONG_TYPE =
  "That file type isn't supported — PNG, JPG or WebP";
export const AVATAR_EMPTY = "That file is empty";
export const AVATAR_TOO_LARGE = (bytes: number) =>
  `Picture too large — ${formatBytes(bytes)}, limit is ${formatBytes(AVATAR_MAX_BYTES)}`;
export const AVATAR_TOO_BIG_DIMENSIONS = (width: number, height: number) =>
  `That picture is ${width}×${height} — ${AVATAR_MAX_DIMENSION}px a side is the limit`;

/**
 * `null` means the file is acceptable so far. The declared type only proves
 * what the client claimed, so the bytes are checked again after decode in
 * `src/lib/avatar-store.ts`; dimensions are only knowable there.
 */
export function avatarRejectionReason(input: {
  type: string;
  size: number;
}): string | null {
  if (!isAvatarMimeType(input.type)) return AVATAR_WRONG_TYPE;
  if (input.size <= 0) return AVATAR_EMPTY;
  if (input.size > AVATAR_MAX_BYTES) return AVATAR_TOO_LARGE(input.size);
  return null;
}
