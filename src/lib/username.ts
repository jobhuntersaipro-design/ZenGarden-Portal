/**
 * A display handle proposed from an email address, for a contact the reader
 * never named one for (docs/specs/26-buyer-management.md §3).
 *
 * `username` is a handle shown in ops and on the customer's own settings
 * screen — never a credential (`src/lib/validation/auth.test.ts` pins that),
 * so a derived one costs nothing in security and saves a required field on
 * the new-buyer form. It stays editable on the buyer's page afterwards.
 *
 * The shape matches `usernameSchema`: `^[a-z0-9][a-z0-9._-]{2,31}$`. Anything
 * the regex would refuse is dropped rather than rejected — the reader typed
 * an email, not a handle, and should not be asked to fix a field they never
 * saw.
 */
const MIN = 3;
const MAX = 32;

/** The local part, lower-cased, reduced to the handle alphabet, sized to fit. */
export function usernameBase(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const cleaned = local
    .replace(/[^a-z0-9._-]/g, "")
    // Must start with a letter or a number.
    .replace(/^[^a-z0-9]+/, "");
  const padded = (cleaned || "user").padEnd(MIN, "0");
  return padded.slice(0, MAX);
}

/**
 * `usernameBase`, made unique against `taken` by a `-2`, `-3`… suffix. The
 * suffix eats into the base rather than pushing past 32 characters, so a
 * long address still yields a valid handle.
 */
export function usernameFromEmail(email: string, taken: Iterable<string>): string {
  const base = usernameBase(email);
  const used = new Set(Array.from(taken, (value) => value.toLowerCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
