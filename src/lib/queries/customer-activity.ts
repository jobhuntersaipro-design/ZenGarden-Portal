import { PoEventKind, WebOrderStatus } from "@/generated/prisma/enums";
import type { AuditAction } from "@/generated/prisma/enums";
import { formatMYR } from "@/lib/money";
import { stageLabel } from "@/lib/po-stages";
import { prisma } from "@/lib/prisma";
import { ATTEMPT_RETENTION_HOURS } from "@/lib/rate-limit";

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
 * Sort, filter and page the four sources as one list.
 *
 * ISO strings compare chronologically as strings — same length, same `Z`
 * suffix — so no Date is constructed to order them. Ties break on `id`
 * because a transaction stamps all its rows with one timestamp, and an
 * unstable sort would reshuffle the page on every render.
 */
export function mergeActivity(
  lists: ActivityEntry[][],
  { kind, page, size }: { kind: ActivityKind | "all"; page: number; size: number },
): { entries: ActivityEntry[]; total: number } {
  const all = lists
    .flat()
    .filter((entry) => kind === "all" || entry.kind === kind)
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));

  return { entries: all.slice((page - 1) * size, page * size), total: all.length };
}

const WEB_ORDER_STATUS: Record<WebOrderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
};

export async function loadCustomerActivity(
  buyerId: string,
  { page, kind }: { page: number; kind: ActivityKind | "all" },
): Promise<{ entries: ActivityEntry[]; total: number; failedWindowHours: number }> {
  // Each source is bounded by what the requested page could possibly need, so
  // a customer with four years of orders does not load four years of rows.
  const take = page * ACTIVITY_PAGE_SIZE;
  const failedSince = new Date(Date.now() - ATTEMPT_RETENTION_HOURS * 3_600_000);

  const [events, webOrders, purchaseOrders, stageEvents, contacts] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { buyerId },
      orderBy: { at: "desc" },
      take,
      select: {
        id: true,
        action: true,
        at: true,
        detail: true,
        actor: { select: { name: true, image: true } },
        subjectUser: { select: { name: true } },
      },
    }),
    prisma.webOrder.findMany({
      where: { buyerId, status: { not: WebOrderStatus.DRAFT } },
      orderBy: { submittedAt: "desc" },
      take,
      select: {
        id: true,
        reference: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        subtotal: true,
        placedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { buyerId },
      orderBy: { confirmedAt: "desc" },
      take,
      select: {
        id: true,
        poNumber: true,
        total: true,
        confirmedAt: true,
        documentId: true,
        confirmedBy: { select: { name: true, image: true } },
      },
    }),
    prisma.poStageEvent.findMany({
      // `fromStage: null` is the confirm-time ORDER_PLACED event, which the
      // purchase-order entry beside it already says. EDIT events carry an ops
      // note and are not the customer's business.
      where: { kind: PoEventKind.STAGE, fromStage: { not: null }, purchaseOrder: { buyerId } },
      orderBy: { changedAt: "desc" },
      take,
      select: {
        id: true,
        toStage: true,
        changedAt: true,
        changedBy: { select: { name: true, image: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    }),
    prisma.user.findMany({ where: { buyerId }, select: { email: true } }),
  ]);

  const emails = contacts.map((contact) => contact.email);
  const failed =
    emails.length > 0
      ? await prisma.loginAttempt.findMany({
          where: { email: { in: emails }, success: false, at: { gte: failedSince } },
          orderBy: { at: "desc" },
          take,
          select: { id: true, email: true, at: true },
        })
      : [];

  const auditEntries: ActivityEntry[] = events.map((event) => ({
    id: `audit:${event.id}`,
    kind: event.action === "SIGNED_IN" ? "sign-in" : "change",
    at: event.at.toISOString(),
    text: auditText({
      action: event.action,
      actorName: event.actor?.name ?? null,
      subjectName: event.subjectUser?.name ?? null,
      detail: event.detail,
    }),
    actor: event.actor ?? null,
    href: null,
  }));

  const webEntries: ActivityEntry[] = webOrders.map((order) => ({
    id: `web:${order.id}`,
    kind: "shop-order",
    // `submittedAt` is nullable on the model only because a DRAFT cart has
    // none; every row reaching this query is filtered to a non-DRAFT status,
    // and the one and only place that leaves DRAFT (`submitWebOrder`) sets
    // `submittedAt` in the same update as the status change. `createdAt` is a
    // type-narrowing concession, not a code path this branch can reach.
    at: (order.submittedAt ?? order.createdAt).toISOString(),
    text: `${order.placedBy.name} placed ${order.reference} · ${formatMYR(
      order.subtotal.toString(),
    )} · ${WEB_ORDER_STATUS[order.status]}`,
    actor: order.placedBy,
    href: `/web-orders/${order.id}`,
  }));

  const poEntries: ActivityEntry[] = purchaseOrders.map((order) => ({
    id: `po:${order.id}`,
    kind: "purchase-order",
    at: order.confirmedAt.toISOString(),
    text: `${order.poNumber} confirmed · ${formatMYR(order.total.toString())} · ${
      order.documentId ? `uploaded by ${order.confirmedBy.name}` : "from the shop"
    }`,
    actor: order.confirmedBy,
    href: `/purchase-orders/${order.id}`,
  }));

  const stageEntries: ActivityEntry[] = stageEvents.map((event) => ({
    id: `stage:${event.id}`,
    kind: "purchase-order",
    at: event.changedAt.toISOString(),
    text: `${event.purchaseOrder.poNumber} → ${stageLabel(event.toStage)}${
      event.changedBy ? ` · by ${event.changedBy.name}` : ""
    }`,
    actor: event.changedBy ?? null,
    href: `/purchase-orders/${event.purchaseOrder.id}`,
  }));

  const failedEntries: ActivityEntry[] = failed.map((attempt) => ({
    id: `failed:${attempt.id}`,
    kind: "sign-in",
    at: attempt.at.toISOString(),
    text: `Failed sign-in for ${attempt.email}`,
    actor: null,
    href: null,
  }));

  return {
    ...mergeActivity(
      [auditEntries, webEntries, poEntries, stageEntries, failedEntries],
      { kind, page, size: ACTIVITY_PAGE_SIZE },
    ),
    failedWindowHours: ATTEMPT_RETENTION_HOURS,
  };
}
