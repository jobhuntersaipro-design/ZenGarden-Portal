/**
 * The customer-login label helper alone, with **no** `prisma` import.
 *
 * This split is load-bearing, not tidiness — the same shape as
 * `avatar-style-ids.ts`. `admin-customers.ts` imports `prisma` (via
 * `@/lib/prisma`, which imports `@prisma/adapter-neon`); a client component
 * that needs only this one rendering helper would drag that whole graph into
 * the browser bundle, and Turbopack cannot chunk the adapter's `node:module`
 * use for the client at all — the production build fails outright rather
 * than merely bloating (measured: "the chunking context (unknown) does not
 * support external modules"). `CustomersTable` (a client component) imports
 * `loginsLabel` from here directly; `admin-customers.ts` imports it back and
 * re-exports it, so its own test keeps testing this one canonical
 * implementation through its existing import path. Anything added to this
 * file must stay free of `prisma` imports.
 */
export type LoginCounts = {
  active: number;
  invited: number;
  disabled: number;
};

/** "2 active · 1 invited", or "None" — never an empty cell. */
export function loginsLabel(row: LoginCounts): string {
  const parts: string[] = [];
  if (row.active > 0) parts.push(`${row.active} active`);
  if (row.invited > 0) parts.push(`${row.invited} invited`);
  if (row.disabled > 0) parts.push(`${row.disabled} disabled`);
  return parts.length > 0 ? parts.join(" · ") : "None";
}
