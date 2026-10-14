import { CERT_TYPES, type CertStatus } from "@/lib/certification";
import type { OverviewRow } from "@/lib/queries/certificates";
import type { SortDirection } from "@/lib/queries/pagination";

export const OVERVIEW_SORT_KEYS = ["name", "market", ...CERT_TYPES] as const;
export const OVERVIEW_SHOW = ["all", "attention"] as const;
export type OverviewShow = (typeof OVERVIEW_SHOW)[number];

const RANK: Record<CertStatus, number> = { approved: 0, renew: 1, expired: 2, missing: 3 };

export const needsAttention = (row: OverviewRow) =>
  CERT_TYPES.some((type) => row.certs[type].status !== "approved");

/** Pure, so the filter and the sort are tested without a database. */
export function selectOverview(
  rows: OverviewRow[],
  {
    q,
    market,
    show,
    sort,
  }: {
    q?: string;
    market?: string;
    show: OverviewShow;
    sort: { key: string; dir: SortDirection };
  },
): OverviewRow[] {
  const needle = q?.toLowerCase();
  const kept = rows.filter(
    (row) =>
      (!needle || `${row.name} ${row.sku} ${row.market ?? ""}`.toLowerCase().includes(needle)) &&
      (!market || row.market === market) &&
      (show === "all" || needsAttention(row)),
  );
  const value = (row: OverviewRow): string | number =>
    sort.key === "name"
      ? row.name.toLowerCase()
      : sort.key === "market"
        ? (row.market ?? "￿").toLowerCase()
        : RANK[row.certs[sort.key as (typeof CERT_TYPES)[number]].status];
  return [...kept].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = left < right ? -1 : left > right ? 1 : a.name.localeCompare(b.name);
    return sort.dir === "asc" ? order : -order;
  });
}
