/**
 * The style ids alone, with **no** `@dicebear` imports.
 *
 * This split is load-bearing, not tidiness. `avatar-styles.ts` imports
 * `@dicebear/core` and all five style definitions; a client component that
 * needs only the id list would drag that whole graph into the browser bundle —
 * measured at roughly a megabyte — even though it never renders an avatar.
 * Client components import from here; only the server imports `avatar-styles`.
 */
export const AVATAR_STYLE_IDS = [
  "gaze",
  "voxel-bot",
  "clay",
  "croodles",
  "notionists",
] as const;

export type AvatarStyleId = (typeof AVATAR_STYLE_IDS)[number];

export const isAvatarStyleId = (value: string): value is AvatarStyleId =>
  (AVATAR_STYLE_IDS as readonly string[]).includes(value);
