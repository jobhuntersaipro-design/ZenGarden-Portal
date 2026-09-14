/**
 * The buyer-login label helpers alone, with **no** `prisma` import.
 *
 * This split is load-bearing, not tidiness — the same shape as
 * `avatar-style-ids.ts`. `admin-buyers.ts` imports `prisma` (via
 * `@/lib/prisma`, which imports `@prisma/adapter-neon`); a client component
 * that needs only this one rendering helper would drag that whole graph into
 * the browser bundle, and Turbopack cannot chunk the adapter's `node:module`
 * use for the client at all — the production build fails outright rather
 * than merely bloating (measured: "the chunking context (unknown) does not
 * support external modules"). `BuyersTable` (a client component) imports
 * `loginsLabel` from here directly; `admin-buyers.ts` imports it back and
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

/** One word for the whole company's shop access, for the table's status pill. */
export type ShopAccess = "Active" | "Invited" | "Disabled" | "None";

/**
 * The best state any contact is in: one active login means the company can
 * order today, whatever else is pending; an invitation outstanding is the
 * next best; only disabled is worse than none, because someone chose it.
 */
export function shopAccess(row: LoginCounts): ShopAccess {
  if (row.active > 0) return "Active";
  if (row.invited > 0) return "Invited";
  if (row.disabled > 0) return "Disabled";
  return "None";
}

export const ACCESS_FILTERS = ["all", "active", "invited", "none"] as const;
export type AccessFilter = (typeof ACCESS_FILTERS)[number];

export const ACCESS_FILTER_LABELS: Record<AccessFilter, string> = {
  all: "All",
  active: "With access",
  invited: "Awaiting first sign-in",
  none: "No login",
};

/**
 * Filters, not a partition: a buyer with one active contact and one still
 * invited shows under both "With access" and "Awaiting first sign-in",
 * because both are true and both are what a reader is looking for.
 */
export function matchesAccess(row: LoginCounts, filter: AccessFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return row.active > 0;
    case "invited":
      return row.invited > 0;
    case "none":
      return row.active + row.invited + row.disabled === 0;
  }
}

export function accessCounts(rows: LoginCounts[]): Record<AccessFilter, number> {
  const counts = { all: rows.length, active: 0, invited: 0, none: 0 };
  for (const row of rows) {
    if (matchesAccess(row, "active")) counts.active += 1;
    if (matchesAccess(row, "invited")) counts.invited += 1;
    if (matchesAccess(row, "none")) counts.none += 1;
  }
  return counts;
}
