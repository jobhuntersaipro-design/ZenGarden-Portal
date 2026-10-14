import { addDays, format, parseISO } from "date-fns";
import { CERT_TYPES, type CertStatus, type CertType, type DocType } from "@/lib/certification";
import type { CertificateRow, OverviewRow } from "@/lib/queries/certificates";
import type { SortDirection } from "@/lib/queries/pagination";

export const OVERVIEW_SORT_KEYS = ["name", "market", ...CERT_TYPES] as const;
export const OVERVIEW_SHOW = ["all", "attention"] as const;
export type OverviewShow = (typeof OVERVIEW_SHOW)[number];

const RANK: Record<CertStatus, number> = { approved: 0, renew: 1, expired: 2, missing: 3 };

/**
 * The expiry filter both views share (2026-10-14). The windows are "from today
 * up to N days ahead", so 30 is inside 90. `missing` only means anything for a
 * product: a certificate file always has an expiry.
 */
export const EXPIRY_FILTERS = ["expired", "30", "90", "valid", "missing"] as const;
export type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];

export const EXPIRY_LABEL: Record<ExpiryFilter, string> = {
  expired: "Expired",
  "30": "Expires within 30 days",
  "90": "Expires within 90 days",
  valid: "Valid",
  missing: "Not uploaded",
};

const plusDays = (today: string, days: number) =>
  format(addDays(parseISO(today), days), "yyyy-MM-dd");

/** One expiry against the filter. `null` is a product type with nothing linked. */
export function matchesExpiry(
  expiresOn: string | null,
  filter: ExpiryFilter,
  today: string,
): boolean {
  if (filter === "missing") return expiresOn === null;
  if (expiresOn === null) return false;
  if (filter === "expired") return expiresOn < today;
  if (filter === "valid") return expiresOn >= today;
  return expiresOn >= today && expiresOn <= plusDays(today, Number(filter));
}

export const needsAttention = (row: OverviewRow) =>
  CERT_TYPES.some((type) => row.certs[type].status !== "approved");

/**
 * A product against a type and an expiry. The type alone keeps the products
 * that have that certificate; with an expiry it reads only that type, and
 * without one the expiry matches if any of the three does. An override reads
 * green, so it never matches expired, a window or not uploaded.
 */
function matchesCerts(row: OverviewRow, type: CertType | undefined, expiry: ExpiryFilter | undefined, today: string) {
  const types = type ? [type] : CERT_TYPES;
  if (!expiry) return type ? row.certs[type].status !== "missing" : true;
  return types.some((t) => {
    const cell = row.certs[t];
    if (cell.overridden) return expiry === "valid";
    return matchesExpiry(cell.expiresOn, expiry, today);
  });
}

/** Pure, so the filter and the sort are tested without a database. */
export function selectOverview(
  rows: OverviewRow[],
  {
    q,
    market,
    type,
    expiry,
    show,
    sort,
    today,
  }: {
    q?: string;
    market?: string;
    type?: CertType;
    expiry?: ExpiryFilter;
    show: OverviewShow;
    sort: { key: string; dir: SortDirection };
    today: string;
  },
): OverviewRow[] {
  const needle = q?.toLowerCase();
  const kept = rows.filter(
    (row) =>
      (!needle || `${row.name} ${row.sku} ${row.market ?? ""}`.toLowerCase().includes(needle)) &&
      (!market || row.market === market) &&
      (show === "all" || needsAttention(row)) &&
      matchesCerts(row, type, expiry, today),
  );
  const value = (row: OverviewRow): string | number =>
    sort.key === "name"
      ? row.name.toLowerCase()
      : sort.key === "market"
        ? (row.market ?? "￿").toLowerCase()
        : RANK[row.certs[sort.key as CertType].status];
  return [...kept].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = left < right ? -1 : left > right ? 1 : a.name.localeCompare(b.name);
    return sort.dir === "asc" ? order : -order;
  });
}

/** The certificate files, narrowed by search, type, uploader and expiry. */
export function selectCertificates(
  rows: CertificateRow[],
  {
    q,
    type,
    uploadedBy,
    expiry,
    today,
  }: {
    q?: string;
    type?: DocType;
    uploadedBy?: string;
    expiry?: ExpiryFilter;
    today: string;
  },
): CertificateRow[] {
  const needle = q?.toLowerCase();
  return rows.filter(
    (row) =>
      (!needle ||
        [row.originalName, row.reference ?? "", ...row.products.map((p) => `${p.name} ${p.sku}`)]
          .join(" ")
          .toLowerCase()
          .includes(needle)) &&
      (!type || row.type === type) &&
      (!uploadedBy || (row.uploadedBy ?? "") === uploadedBy) &&
      (!expiry || matchesExpiry(row.expiresOn, expiry, today)),
  );
}

/** A URL value narrowed to one of a list, or undefined — never a filter the rows are not under. */
export const oneOf = <T extends string>(value: string | undefined, list: readonly T[]) =>
  value && (list as readonly string[]).includes(value) ? (value as T) : undefined;
