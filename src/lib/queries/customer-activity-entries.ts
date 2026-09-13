/**
 * The activity timeline's pure functions alone, with **no** `prisma` import.
 *
 * This split is load-bearing, not tidiness — the same shape as
 * `admin-customer-labels.ts`. `customer-activity.ts` imports `prisma` (via
 * `@/lib/prisma`, which imports `@prisma/adapter-neon`); a client component
 * that needs only `ACTIVITY_PAGE_SIZE` as a value would drag that whole graph
 * into the browser bundle, and Turbopack cannot chunk the adapter's
 * `node:module` use for the client at all — the production build fails
 * outright rather than merely bloating ("the chunking context (unknown) does
 * not support external modules"). `customer-activity.ts` imports these back
 * and re-exports them, so its own callers keep one canonical implementation
 * and one import path. Anything added to this file must stay free of
 * `prisma` imports — a **type-only** import of a Prisma enum (erased at
 * compile time) is fine; a value import is not.
 */
import type { AuditAction } from "@/generated/prisma/enums";

export const ACTIVITY_KINDS = ["sign-in", "shop-order", "purchase-order", "change"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_PAGE_SIZE = 20;

export type ActivityEntry = {
  /** `${source}:${rowId}` — unique across sources, and a stable tie-break. */
  id: string;
  kind: ActivityKind;
  /** ISO, because a server component hands these to a client one. */
  at: string;
  /** Composed here: the component renders, it does not decide wording. */
  text: string;
  actor: { name: string; image: string | null } | null;
  href: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  contactName: "contact",
  email: "email",
  phone: "phone",
  address: "address",
  paymentTerms: "payment terms",
  remark: "remark",
  username: "username",
};

/**
 * `detail` is a Json column, so its shape is a promise the database does not
 * keep — including for rows written by an older version of this code. This
 * narrows it without `any` and without throwing at render time.
 */
export function readDetail(detail: unknown): { name: string | null; fields: string[] } {
  if (typeof detail !== "object" || detail === null) return { name: null, fields: [] };
  const record = detail as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : null,
    fields: Array.isArray(record.fields)
      ? record.fields.filter((field): field is string => typeof field === "string")
      : [],
  };
}

export function auditText(event: {
  action: AuditAction;
  actorName: string | null;
  subjectName: string | null;
  detail: unknown;
}): string {
  const { name, fields } = readDetail(event.detail);
  // An ops user's row can be gone (SET NULL). "Someone" is honest and short.
  const actor = event.actorName ?? "Someone";
  const subject = event.subjectName ?? name ?? "a contact";
  const list = fields.map((field) => FIELD_LABELS[field] ?? field).join(", ");

  switch (event.action) {
    case "SIGNED_IN":
      return `${actor} signed in`;
    case "CUSTOMER_CREATED":
      return `${actor} created this customer`;
    case "CUSTOMER_UPDATED":
      return list ? `${actor} edited ${list}` : `${actor} edited this customer`;
    case "CUSTOMER_DELETED":
      return `${actor} deleted ${name ?? "this customer"}`;
    case "CONTACT_INVITED":
      return `${actor} invited ${subject}`;
    case "CONTACT_UPDATED":
      return list ? `${actor} edited ${subject}'s ${list}` : `${actor} edited ${subject}`;
    case "CONTACT_REMOVED":
      return `${actor} removed ${subject}`;
    case "CONTACT_DISABLED":
      return `${actor} disabled ${subject}'s access`;
    case "CONTACT_RESTORED":
      return `${actor} restored ${subject}'s access`;
    case "PASSWORD_RESET":
      return `${actor} reset ${subject}'s password`;
    case "INVITE_RESENT":
      return `${actor} resent ${subject}'s invitation`;
  }
}

/**
 * Sort, filter and page the sources as one list.
 *
 * ISO strings compare chronologically as strings — same length, same `Z`
 * suffix — so no Date is constructed to order them. Ties break on `id`
 * because a transaction stamps all its rows with one timestamp, and an
 * unstable sort would reshuffle the page on every render.
 */
export function mergeActivity(
  lists: ActivityEntry[][],
  {
    kind,
    page,
    size,
    total,
  }: { kind: ActivityKind | "all"; page: number; size: number; total: number },
): { entries: ActivityEntry[]; total: number } {
  const all = lists
    .flat()
    .filter((entry) => kind === "all" || entry.kind === kind)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));

  // `total` is required, not defaulted from `all.length`: each source is
  // read bounded to `take: page * ACTIVITY_PAGE_SIZE`, so `all.length` is
  // the size of a *truncated* union — right only while every source's real
  // row count fits inside that bound, silently wrong the moment it doesn't.
  // An optional parameter whose fallback is the wrong answer is a trap a
  // future caller could fall into with no type error and no test failure —
  // the caller (`loadCustomerActivity`) always has the real counts from its
  // own `count()` queries, so it always has a real number to pass.
  return { entries: all.slice((page - 1) * size, page * size), total };
}
