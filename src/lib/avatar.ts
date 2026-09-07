import { createHash } from "node:crypto";

/**
 * The monogram shown when someone has no picture. Splitting on a whitespace
 * run rather than a single space is what keeps "Aisha   Rahman" from yielding
 * an empty middle part; spreading the word into an array before taking [0]
 * keeps an astral-plane first character intact rather than half a surrogate
 * pair.
 *
 * This lived in four files before this one — UserMenu, UsersTable, PoTable and
 * the admin layout — plus ProductThumb, which runs it over a product name.
 * `signin/pending` has a different function of the same name, over an email.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}

/** Twelve hex characters is ample to tell one picture from the next. */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

/** `avatars/{userId}/{hash}.webp` — foldered per user so a listing stays usable. */
export function avatarObjectKey(userId: string, hash: string): string {
  return `avatars/${userId}/${hash}.webp`;
}

/**
 * What goes in `User.image`. The `?v=` is load-bearing: it is what makes the
 * serve route's `immutable` cache header safe, because a changed picture
 * becomes a different URL rather than the same URL with new bytes.
 */
export function avatarUrl(userId: string, hash: string): string {
  return `/api/avatars/${userId}?v=${hash}`;
}
